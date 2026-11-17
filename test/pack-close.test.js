// PokeMem 开包关闭行为验证：node test/pack-close.test.js
// 用最小 DOM 桩驱动真实的 js/*.js 模块（pokedex → i18n → gacha → store → util → lang → home）：
// 没翻牌点关闭 = 这包没开过（包数/卡册/经验/保底全不动）；翻过至少一张，按钮变“入册 & 关闭”，点了才入册。
const fs = require("fs");
const vm = require("vm");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

// ---- 最小 DOM 桩 ----
function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, force) => { const v = force !== undefined ? force : !s.has(c); if (v) s.add(c); else s.delete(c); return v; },
  };
}
const allElements = [];
function makeEl(tag) {
  const el = {
    tagName: tag || "div",
    children: [],
    classList: makeClassList(),
    style: {},
    dataset: {},
    textContent: "",
    _innerHTML: "",
    _className: "",
    offsetWidth: 0,
    disabled: false,
    checked: false,
    _listeners: {},
    addEventListener: function (type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    click: function () { (this._listeners.click || []).forEach(fn => fn.call(this)); },
    appendChild: function (c) { this.children.push(c); return c; },
    getAttribute: function (k) { return this["data-" + k] || null; },
    setAttribute: function (k, v) { this["data-" + k] = v; },
  };
  Object.defineProperty(el, "innerHTML", {
    get: function () { return this._innerHTML; },
    set: function (v) { this._innerHTML = v; if (v === "") this.children = []; },
  });
  Object.defineProperty(el, "className", {
    get: function () { return this._className; },
    set: function (v) { this._className = v; String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); },
  });
  allElements.push(el);
  return el;
}
const byId = {};
["pack-count", "owned-count", "total-draws", "since-ssr", "open-pack-btn", "next-pack",
 "debug-badge", "debug-panel", "debug-toggle", "crystal-count", "exchange-btn",
 "pack-cards", "pack-overlay", "pack-summary", "pack-trainer", "flip-all-btn",
 "close-pack-btn", "toast", "lang-zh", "lang-en", "error-bar"].forEach(id => {
  byId[id] = makeEl("div");
  byId[id].id = id;
});
const store = {};
let saveCalls = 0;
let renderCollectionCalls = 0;
const sandbox = {
  document: {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => makeEl(tag),
    querySelectorAll: (sel) => {
      if (sel === ".pack-card") return allElements.filter(el => el.classList.contains("pack-card"));
      return [];
    },
    documentElement: { lang: "zh-CN" },
    title: "",
    body: { prepend: () => {} },
  },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); saveCalls++; },
  },
  addEventListener: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  console: console,
  PokeMem: {
    renderCollection: () => { renderCollectionCalls++; },
    renderRates: () => {},
    renderTrainer: () => {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

["pokedex.js", "i18n.js", "card-progress.js", "gacha.js", "js/store.js", "js/util.js", "js/lang.js", "js/types.js", "js/home.js"].forEach(f => {
  vm.runInContext(fs.readFileSync(__dirname + "/../" + f, "utf8"), sandbox, { filename: f });
});

const Gacha = sandbox.Gacha;
const ctx = sandbox.PokeMem.ctx;
const state = ctx.state;
state.packs = 3; // 新号自带 1 包，这里给 3 包方便连测三次
const snap = () => JSON.stringify(state);
const overlayShown = () => byId["pack-overlay"].classList.contains("show");
const closeBtnLabel = () => byId["close-pack-btn"].textContent;

// 场景 1：开包 → 一张不翻 → 点关闭：包没开过
const before1 = snap();
byId["open-pack-btn"].click();
check("开包后浮层显示", overlayShown());
check("开包预览时包数还没扣（仍是 3）", state.packs === 3, "包数 " + state.packs);
check("开包时按钮是“关闭”", closeBtnLabel() === "关闭", "按钮文案 " + closeBtnLabel());
// 卡面：像一张真正的卡——左上角属性徽章 + 属性 pastel 底色 + 白色画框
const cards1 = byId["pack-cards"].children;
check("卡面 10 张都有属性底色 class", cards1.every(function (el) { return /tbg-(normal|fire|water|electric|grass|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon)/.test(el.className); }));
check("卡面左上角有属性徽章行", cards1.every(function (el) { return el.innerHTML.indexOf("card-types") >= 0 && el.innerHTML.indexOf("type-chip") >= 0; }));
check("卡面图片在白色画框里", cards1.every(function (el) { return el.innerHTML.indexOf("card-art") >= 0; }));
const savesBeforeClose = saveCalls;
byId["close-pack-btn"].click();
check("没翻牌关闭后浮层关了", !overlayShown());
check("没翻牌关闭：存档原样不动（包数/卡册/经验/保底/总抽）", snap() === before1);
check("没翻牌关闭：没有写存档", saveCalls === savesBeforeClose);
check("没翻牌关闭：卡册还是空的", Gacha.ownedCount(state) === 0);

// 场景 2：开包 → 翻 1 张 → 按钮变“入册 & 关闭” → 点它才入册
byId["open-pack-btn"].click();
check("第二包开包时按钮还是“关闭”", closeBtnLabel() === "关闭");
byId["pack-cards"].children[0].click(); // 翻第一张
check("翻 1 张后按钮变“入册 & 关闭”", closeBtnLabel() === "入册 & 关闭", "按钮文案 " + closeBtnLabel());
check("翻牌后、入册前，包数还没扣", state.packs === 3);
const ownedBefore = Gacha.ownedCount(state);
const packDistinct = new Set(ctx.currentPack.map(c => c.id)).size;
byId["close-pack-btn"].click();
check("翻过再关闭：浮层关了", !overlayShown());
check("翻过再关闭：包数 3→2", state.packs === 2, "包数 " + state.packs);
check("翻过再关闭：总抽 +10、开包数 +1", state.totalDraws === 10 && state.packsOpened === 1);
check("翻过再关闭：10 张卡进了卡册", Gacha.ownedCount(state) - ownedBefore === packDistinct, "拥有数 " + Gacha.ownedCount(state));
check("翻过再关闭：训练师经验加上了", Gacha.ensureTrainer(state).exp > 0 || Gacha.ensureTrainer(state).level > 1);

// 场景 3：开包 → 全部翻开 → 点入册：同样入册
byId["open-pack-btn"].click();
byId["flip-all-btn"].click();
check("全部翻开后按钮是“入册 & 关闭”", closeBtnLabel() === "入册 & 关闭");
byId["close-pack-btn"].click();
check("全部翻开再关闭：包数 2→1", state.packs === 1, "包数 " + state.packs);
check("全部翻开再关闭：总抽 20", state.totalDraws === 20, "总抽 " + state.totalDraws);

// 场景 4：英文下按钮文案也跟着翻牌状态走
state.lang = "en";
byId["open-pack-btn"].click();
check("英文、没翻牌时按钮是 Close", closeBtnLabel() === "Close", "按钮文案 " + closeBtnLabel());
byId["pack-cards"].children[0].click();
check("英文、翻 1 张后按钮变 Collect & Close", closeBtnLabel() === "Collect & Close", "按钮文案 " + closeBtnLabel());
byId["close-pack-btn"].click();
check("英文、翻过再关闭：包数 1→0", state.packs === 0, "包数 " + state.packs);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
