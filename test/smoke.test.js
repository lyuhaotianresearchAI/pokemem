// PokeMem 本地验证：node test/smoke.test.js
// 目的：拆分 app.js 之后，确认 9 个 js/*.js 模块按 index.html 的顺序加载、
// 启动迁移、开包/翻牌/卡册/详情（tab 切换与排序）/概率/页签/Debug 全链路都不报错、行为不变。
// 用最小 DOM 桩跑在 vm 里，不依赖浏览器、不联网；卡片立绘只拼 URL，不加载。
// 桩的刻意限制：innerHTML 只解析 <button>（详情页 tab/排序按钮够用），
// 其余 HTML 字符串不解析——只断言字符串内容，不假装它被渲染过。
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const GachaNode = require("../gacha.js"); // 仅用于造旧存档夹具

const FILES = ["pokedex.js", "i18n.js", "gacha.js", "js/store.js", "js/util.js",
  "js/lang.js", "js/home.js", "js/dex.js", "js/rates.js", "js/tabs.js",
  "js/debug.js", "js/register.js", "js/boot.js"];

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

// ---------- 最小 DOM 桩 ----------
function makeClassList() {
  const s = new Set();
  return {
    add(c) { s.add(c); },
    remove(c) { s.delete(c); },
    toggle(c, f) {
      if (f === undefined) { if (s.has(c)) s.delete(c); else s.add(c); }
      else if (f) s.add(c); else s.delete(c);
    },
    contains(c) { return s.has(c); },
  };
}
function makeEl(doc, tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    attributes: {},
    _listeners: {},
    _text: "",
    _html: "",
    classList: makeClassList(),
    getAttribute(k) { return this.attributes[k] == null ? null : this.attributes[k]; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll(sel) {
      // 详情页的 tab/排序按钮是 innerHTML 字符串里的 <button>，见下方 innerHTML 解析
      if (sel === ".card-tab") return this.children.filter(function (c) { return c.classList.contains("card-tab"); });
      if (sel === "[data-sort]") return this.children.filter(function (c) { return c.getAttribute("data-sort") !== null; });
      return doc._bySelector[sel] || [];
    },
    dispatch(type, ev) { (this._listeners[type] || []).forEach(function (fn) { fn.call(this, ev || { target: this }); }, this); },
    click() { this.dispatch("click", { target: this }); },
  };
  Object.defineProperty(el, "textContent", {
    get() { return this._text; },
    set(v) { this._text = String(v); },
  });
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      this.children = [];
      // 只解析 <button>：详情页 tab/排序按钮需要可点的桩元素；其余标签不解析
      const re = /<button([^>]*)>/g;
      let m;
      while ((m = re.exec(this._html))) {
        const attrs = m[1];
        const b = makeEl(doc, "button");
        const cls = attrs.match(/class="([^"]*)"/);
        if (cls) cls[1].split(/\s+/).forEach(function (c) { if (c) b.classList.add(c); });
        const ds = attrs.match(/data-sort="([^"]*)"/);
        if (ds) b.setAttribute("data-sort", ds[1]);
        const di = attrs.match(/data-i="([^"]*)"/);
        if (di) b.setAttribute("data-i", di[1]);
        this.children.push(b);
      }
    },
  });
  return el;
}
function makeDocument() {
  const doc = {
    _byId: {},
    _bySelector: {},
    _created: [], // createElement 造出的所有元素（含动态创建的 #error-bar）
    _knownIds: null, // 从 index.html 解析出的 id 集合；getElementById 对未知 id 返回 null
    documentElement: { lang: "zh-CN" },
    title: "",
    body: { prepend() {} },
    getElementById(id) {
      if (this._knownIds && !this._knownIds.has(id)) return null;
      if (!this._byId[id]) { const el = makeEl(this, "div"); el.id = id; this._byId[id] = el; }
      return this._byId[id];
    },
    createElement(tag) { const el = makeEl(this, tag); this._created.push(el); return el; },
    querySelectorAll(sel) {
      // 开包结果的卡是 createElement 造的 div，不是 innerHTML 字符串
      if (sel === ".pack-card") return this.getElementById("pack-cards").children.slice();
      return this._bySelector[sel] || [];
    },
  };
  return doc;
}
function makeStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}
// 从 index.html 解析出所有 id，getElementById 只认这些；HTML/JS 的 id 笔误会直接报 null 而不是静默通过
function seedIds(doc) {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
  const ids = new Set();
  const re = /id="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  doc._knownIds = ids;
  ids.forEach(function (id) {
    const el = makeEl(doc, "div");
    el.id = id;
    doc._byId[id] = el;
  });
}
// 按选择器预注册页签/筛选按钮与静态翻译元素（应用在加载时就 querySelectorAll 绑定它们）
function registerSelectors(doc) {
  function btn(attrs) {
    const el = makeEl(doc, "button");
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  doc._bySelector["[data-tab]"] = ["home", "dex", "rates"].map(function (t) { return btn({ "data-tab": t }); });
  doc._bySelector[".tab-page"] = ["home", "dex", "rates"].map(function (t) {
    const s = makeEl(doc, "section"); s.id = "tab-" + t; return s;
  });
  doc._bySelector[".tab-page"][0].classList.add("active");
  doc._bySelector["[data-tier-filter]"] = ["ALL", "MR", "UR", "SSR", "SR", "R", "N"].map(function (t) { return btn({ "data-tier-filter": t }); });
  doc._bySelector["[data-owned-filter]"] = ["ALL", "OWNED", "MISSING"].map(function (t) { return btn({ "data-owned-filter": t }); });
  doc._bySelector["[data-add-packs]"] = ["1", "10", "100"].map(function (n) { return btn({ "data-add-packs": n }); });
  doc._bySelector["[data-i18n]"] = ["tabHome", "tabDex", "tabRates", "subtitle",
    "registerTitle", "registerDesc", "registerHint", "registerSubmit", "registerStart"].map(function (k) {
    const el = makeEl(doc, "span"); el.setAttribute("data-i18n", k); return el;
  });
  const ph = makeEl(doc, "input");
  ph.setAttribute("data-i18n-ph", "searchPh");
  const ph2 = makeEl(doc, "input");
  ph2.setAttribute("data-i18n-ph", "registerNamePh");
  doc._bySelector["[data-i18n-ph]"] = [ph, ph2];
}
function runApp(initialStorage) {
  const doc = makeDocument();
  seedIds(doc);
  registerSelectors(doc);
  const sandbox = {
    document: doc,
    localStorage: makeStorage(initialStorage),
    console: console,
    _winListeners: {},
    addEventListener(type, fn) { (this._winListeners[type] = this._winListeners[type] || []).push(fn); },
    setInterval: function () { return 0; },
    setTimeout: function () { return 0; },
    alert: function () {},
    confirm: function () { return true; },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  FILES.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf-8"), context, { filename: f });
  });
  return { sandbox: sandbox, doc: doc, PokeMem: sandbox.PokeMem };
}
function byAttr(els, attr, val) {
  return els.filter(function (el) { return el.getAttribute(attr) === val; })[0];
}

// ---------- 场景 A：全新存档，全链路 ----------
const A = runApp({});
const ctxA = A.PokeMem.ctx;
const $A = function (id) { return A.doc.getElementById(id); };
check("A 启动无报错红条", A.doc._byId["error-bar"] === undefined);
check("A 报错监听只注册一次（store.js）",
  (A.sandbox._winListeners.error || []).length === 1,
  "实际 " + (A.sandbox._winListeners.error || []).length);
check("A 新存档 1 包", ctxA.state.packs === 1, "实际 " + ctxA.state.packs);
check("A 新存档有训练师（未注册、结晶 0）",
  !!ctxA.state.trainer && ctxA.state.trainer.registered === false && ctxA.state.trainer.crystals === 0);
check("A 未注册时注册浮层显示", $A("register-overlay").classList.contains("show"));
const regTitle = byAttr(A.doc._bySelector["[data-i18n]"], "data-i18n", "registerTitle");
check("A 注册标题是中文", regTitle.textContent === "成为训练师", regTitle.textContent);
$A("register-name-input").value = "   ";
$A("register-submit-btn").click();
check("A 空名字注册失败、浮层还在",
  $A("register-error").textContent.length > 0 && $A("register-overlay").classList.contains("show") && ctxA.state.trainer.registered === false);
$A("register-name-input").value = "  小智 ";
$A("register-submit-btn").click();
check("A 注册成功：名字去空格、100 结晶",
  ctxA.state.trainer.registered === true && ctxA.state.trainer.name === "小智" && ctxA.state.trainer.crystals === 100);
check("A 注册成功显示欢迎",
  $A("register-welcome-text").textContent.indexOf("小智") >= 0 && $A("register-welcome").style.display !== "none");
$A("register-start-btn").click();
check("A 点开始冒险关闭注册浮层", !$A("register-overlay").classList.contains("show"));
check("A 顶栏已渲染", $A("pack-count").textContent === "1" && $A("owned-count").textContent === "0 / 151");

const i18nTabHome = byAttr(A.doc._bySelector["[data-i18n]"], "data-i18n", "tabHome");
check("A 静态文案初始为中文", i18nTabHome.textContent === "开包", i18nTabHome.textContent);
$A("lang-en").click();
check("A 切英文", ctxA.state.lang === "en");
check("A 静态文案随语言切换", i18nTabHome.textContent === A.sandbox.i18nT("en", "tabHome"), i18nTabHome.textContent);
check("A 输入框提示随语言切换",
  A.doc._bySelector["[data-i18n-ph]"][0].getAttribute("placeholder") === A.sandbox.i18nT("en", "searchPh"));
$A("lang-zh").click();
check("A 切回中文", ctxA.state.lang === "zh" && i18nTabHome.textContent === "开包");

const toggle = $A("debug-toggle");
toggle.checked = true;
toggle.dispatch("change", { target: toggle });
check("A Debug 开关", ctxA.state.debug === true);

$A("add-packs-input").value = "5";
$A("add-packs-btn").click();
check("A 加 5 包", ctxA.state.packs === 6, "实际 " + ctxA.state.packs);
byAttr(A.doc._bySelector["[data-add-packs]"], "data-add-packs", "10").click();
check("A 快捷 +10 包", ctxA.state.packs === 16, "实际 " + ctxA.state.packs);

$A("open-pack-btn").click();
check("A 开包 10 张", ctxA.currentPack && ctxA.currentPack.length === 10);
check("A 开包扣 1 包", ctxA.state.packs === 15, "实际 " + ctxA.state.packs);
check("A 开包浮层显示", $A("pack-overlay").classList.contains("show"));
check("A 包里 10 张卡已渲染", $A("pack-cards").children.length === 10);
$A("pack-cards").children[0].click();
check("A 点一张翻开", $A("pack-cards").children[0].classList.contains("flipped"));
$A("flip-all-btn").click();
check("A 全部翻开有总结", $A("pack-summary").textContent.length > 0, $A("pack-summary").textContent);
check("A 全部翻开每张都翻面",
  $A("pack-cards").children.every(function (el) { return el.classList.contains("flipped"); }));
$A("close-pack-btn").click();
check("A 关闭浮层", !$A("pack-overlay").classList.contains("show"));
check("A 卡册 151 格", $A("collection-grid").children.length === 151, "实际 " + $A("collection-grid").children.length);

$A("collection-grid").children[0].click();
check("A 点格子开详情", $A("detail-modal").classList.contains("show"));
check("A 详情是 #001", $A("detail-name").textContent.indexOf("#001") === 0, $A("detail-name").textContent);
$A("detail-close").click();
check("A 关闭详情", !$A("detail-modal").classList.contains("show"));

byAttr(A.doc._bySelector["[data-tab]"], "data-tab", "rates").click();
check("A 切概率页", A.doc._bySelector[".tab-page"][2].classList.contains("active"));
check("A 概率表有 MR 行", $A("rates-body").innerHTML.indexOf("MR") >= 0);
byAttr(A.doc._bySelector["[data-tab]"], "data-tab", "dex").click();
check("A 切回卡册页", A.doc._bySelector[".tab-page"][1].classList.contains("active"));

const search = $A("search-input");
search.value = "皮卡";
search.dispatch("input", { target: search });
check("A 搜 皮卡 只剩 1 格", $A("collection-grid").children.length === 1, "实际 " + $A("collection-grid").children.length);
search.value = "";
search.dispatch("input", { target: search });
check("A 清空搜索回 151 格", $A("collection-grid").children.length === 151);

$A("next-pack-now-btn").click();
check("A 下一包立即到账", ctxA.state.packs === 16, "实际 " + ctxA.state.packs);

$A("reset-save-btn").click();
check("A 清空后回到 1 包", ctxA.state.packs === 1, "实际 " + ctxA.state.packs);
check("A 清空后注册浮层重新出现", $A("register-overlay").classList.contains("show"));
check("A 清空后仍在 Debug", A.PokeMem.ctx.state.debug === true);
check("A 清空不重置语言", A.PokeMem.ctx.state.lang === "zh");

// 报错红条：人工触发 window error 事件，应出现 #error-bar 且含报错信息
A.sandbox._winListeners.error[0]({ message: "boom" });
check("A 报错红条出现并含报错信息",
  A.doc._created.some(function (el) { return el.id === "error-bar" && el.textContent.indexOf("boom") >= 0; }));

// ---------- 场景 B：无训练师的旧存档，迁移真实跑起来 ----------
const legacy = GachaNode.newState(Date.now());
delete legacy.trainer;
delete legacy.version;
legacy.lang = "zh";
// #025 只有汇总（无 cards）：走 migrateCollection（补 1 张 + legacy 7）→ repairLegacyCards（补 7 张）→ enforceCap（8 张封顶 5 张）
legacy.collection[25] = { count: 8, bestLv: 50, bestHp: 100, bestAtk: 90 };
// #001 已有 7 张明细：走 enforceCap
legacy.collection[1] = { count: 7, bestLv: 70, bestHp: 120, bestAtk: 80,
  cards: [10, 20, 30, 40, 50, 60, 70].map(function (lv) { return { level: lv, hp: 100, atk: 50, pulledAt: 0 }; }) };
const B = runApp({ "pokemem-save-v1": JSON.stringify(legacy) });
check("B 旧存档启动无报错红条", B.doc._byId["error-bar"] === undefined);
check("B 旧存档补训练师", !!B.PokeMem.ctx.state.trainer && B.PokeMem.ctx.state.trainer.registered === false);
check("B 旧存档结晶 0（注册时才发 100）", B.PokeMem.ctx.state.trainer.crystals === 0);
check("B 旧存档补 version 2", B.PokeMem.ctx.state.version === 2);
check("B 旧存档包数保留", B.PokeMem.ctx.state.packs === legacy.packs);
const b25 = B.PokeMem.ctx.state.collection[25];
check("B 汇总旧卡补明细并封顶 5 张", b25.cards.length === 5, "实际 " + b25.cards.length);
check("B 汇总旧卡 legacy 清零", b25.legacy === 0);
check("B 汇总旧卡最高 Lv 保留", b25.cards.some(function (c) { return c.level === 50; }));
check("B 汇总旧卡有补生成的 repaired 卡", b25.cards.some(function (c) { return c.repaired; }));
const b1 = B.PokeMem.ctx.state.collection[1];
check("B 7 张卡封顶 5 张", b1.cards.length === 5, "实际 " + b1.cards.length);
check("B 封顶去掉 Lv 最低 2 张",
  Math.min.apply(null, b1.cards.map(function (c) { return c.level; })) === 30);
check("B 未注册时注册浮层显示", B.doc.getElementById("register-overlay").classList.contains("show"));
B.doc.getElementById("register-name-input").value = "小茂";
B.doc.getElementById("register-name-input").dispatch("keydown",
  { target: B.doc.getElementById("register-name-input"), key: "Enter" });
check("B 回车键也能注册",
  B.PokeMem.ctx.state.trainer.registered === true && B.PokeMem.ctx.state.trainer.name === "小茂" &&
  B.PokeMem.ctx.state.trainer.crystals === 100);

// ---------- 场景 C：详情页 tab 切换与排序（确定性夹具） ----------
const det = GachaNode.newState(Date.now());
det.collection[25] = { count: 5, bestLv: 90, bestHp: 120, bestAtk: 80, legacy: 0,
  cards: [
    { level: 10, hp: 100, atk: 40, pulledAt: 0 },
    { level: 30, hp: 80, atk: 50, pulledAt: 0 },
    { level: 50, hp: 120, atk: 60, pulledAt: 0 },
    { level: 70, hp: 60, atk: 70, pulledAt: 0 },
    { level: 90, hp: 90, atk: 80, pulledAt: 0 },
  ] };
const C = runApp({ "pokemem-save-v1": JSON.stringify(det) });
const boxC = C.doc.getElementById("detail-cards");
function cardTabs() { return boxC.querySelectorAll(".card-tab"); }
function sortBtns() { return boxC.querySelectorAll("[data-sort]"); }
C.doc.getElementById("collection-grid").children[24].click(); // #025 皮卡丘
check("C 点皮卡丘开详情", C.doc.getElementById("detail-modal").classList.contains("show"));
check("C 默认按 Lv 降序选中 Lv.90", C.PokeMem.ctx.detailSelected.level === 90);
check("C 详情面板显示 Lv.90", boxC.innerHTML.indexOf("<b>90</b>") >= 0);
check("C 有 5 个卡 tab", cardTabs().length === 5, "实际 " + cardTabs().length);
byAttr(sortBtns(), "data-sort", "hp").click();
check("C 按 HP 排序", C.PokeMem.ctx.detailSort.key === "hp" && C.PokeMem.ctx.detailSort.dir === "desc");
check("C HP 降序首位是 Lv.50（HP 120）", boxC.innerHTML.indexOf("Lv.50") < boxC.innerHTML.indexOf("Lv.10"));
byAttr(sortBtns(), "data-sort", "hp").click();
check("C 再点 HP 切升序", C.PokeMem.ctx.detailSort.dir === "asc");
check("C HP 升序首位是 Lv.70（HP 60）", boxC.innerHTML.indexOf("Lv.70") < boxC.innerHTML.indexOf("Lv.30"));
const prevSel = C.PokeMem.ctx.detailSelected;
cardTabs()[1].click();
check("C 点第 2 个 tab 换卡", C.PokeMem.ctx.detailSelected !== prevSel);
check("C 换卡后面板更新",
  boxC.innerHTML.indexOf("<b>" + C.PokeMem.ctx.detailSelected.level + "</b>") >= 0);
C.doc.getElementById("detail-close").click();
check("C 关闭详情", !C.doc.getElementById("detail-modal").classList.contains("show"));

console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
