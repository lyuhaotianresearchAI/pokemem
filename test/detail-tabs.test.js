// PokeMem 详情 tab 真实路径验证：node test/detail-tabs.test.js
// 用最小 DOM 桩跑真实的 js/ 模块（app.js 已在 PR #3 拆成 js/）：建一个 7 张卡的尼多力诺（Lv 71/40/90/65/55/88/30），
// 点开卡册里的它，检查详情页左边是不是 5 个 tab、且是 Lv 最高的 5 张。
const fs = require("fs");
const vm = require("vm");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

function makeEl() {
  const el = {
    children: [], style: {}, dataset: {}, listeners: {}, attributes: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    getAttribute(k) { return el.attributes[k] == null ? null : el.attributes[k]; },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    addEventListener(ev, fn) { (el.listeners[ev] = el.listeners[ev] || []).push(fn); },
    appendChild(c) { el.children.push(c); return c; },
    querySelectorAll() { return []; },
    textContent: "", src: "", checked: false, disabled: false, className: ""
  };
  let html = "";
  Object.defineProperty(el, "innerHTML", { get() { return html; }, set(v) { html = String(v); } });
  return el;
}
const els = {};
const sandbox = {
  console: console,
  setInterval: () => 0,
  setTimeout: () => 0, // 升级提示用（Task 14 的 showToast）；桩里不真的等 3 秒
  addEventListener: () => {},
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  document: {
    documentElement: { lang: "" },
    title: "",
    body: makeEl(),
    getElementById(id) { return els[id] || (els[id] = makeEl()); },
    createElement: () => makeEl(),
    querySelectorAll: () => []
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function run(file) { vm.runInContext(fs.readFileSync(__dirname + "/../" + file, "utf8"), sandbox, { filename: file }); }
run("pokedex.js");
run("avatars.js");
run("i18n.js");
run("card-progress.js");
run("gacha.js");

// 造存档：尼多力诺（#033）7 张卡，Lv 分别是 71/40/90/65/55/88/30
const Gacha = sandbox.Gacha;
const state = Gacha.newState(1000000);
[71, 40, 90, 65, 55, 88, 30].forEach((lv, i) => {
  Gacha.addToCollection(state, { id: 33, level: lv, hp: 100 + i, atk: 50 + i });
});
Gacha.addToCollection(state, { id: 1, level: 50, hp: 151, atk: 100 }); // #001 妙蛙种子（草、毒，双属性）1 张，验卡面双徽章
state.trainer.candy = 5; // 升级测试用糖果
sandbox.localStorage.setItem("pokemem-save-v1", JSON.stringify(state));
// app.js 已拆成 js/ 模块（PR #3），按 index.html 里的加载顺序跑
run("js/store.js");
run("js/util.js");
run("js/lang.js");
run("js/types.js");
run("js/scenes.js");
run("js/encounter.js");
run("js/encounter-ui.js");
run("js/home.js");
run("js/dex.js");
run("js/rates.js");
run("js/tabs.js");
run("js/debug.js");
run("js/register.js");
run("js/trainer.js");
run("js/boot.js"); // 启动：首次渲染（applyLang 会渲染卡册格子）

// 卡册格子里第 33 只就是尼多力诺（151 只按编号顺序），点它
const grid = els["collection-grid"];
const cell = grid.children[32];
check("卡册格子有 151 个格", grid.children.length === 151, "实际 " + grid.children.length);
// 卡面：像一张真正的卡——左上角属性徽章 + 属性 pastel 底色 + 白色画框
const cell001 = grid.children[0]; // #001 妙蛙种子（草、毒），已拥有
check("已拥有格子按主属性染色（草）", cell001.className.indexOf("tbg-grass") >= 0, cell001.className);
check("双属性格子左上角有两个属性徽章", (cell001.innerHTML.match(/type-chip/g) || []).length === 2);
check("已拥有格子图片在白色画框里", cell001.innerHTML.indexOf("card-art") >= 0);
const cell002 = grid.children[1]; // #002 妙蛙草，未拥有
check("未拥有格子不染色（留白 + 剪影）", cell002.className.indexOf("tbg-") < 0 && cell002.className.indexOf("missing") >= 0, cell002.className);
check("未拥有格子没有属性徽章", cell002.innerHTML.indexOf("card-types") < 0);
const cell033 = grid.children[32]; // #033 尼多力诺（毒），已拥有
check("单属性格子按主属性染色（毒）", cell033.className.indexOf("tbg-poison") >= 0, cell033.className);
cell.listeners.click[0]();

const html = els["detail-cards"].innerHTML;
const tabCount = (html.match(/<button class="card-tab/g) || []).length; // 只数按钮，不数 card-tabs 容器
check("左边恰好 5 个 tab", tabCount === 5, "实际 " + tabCount + " 个");
["Lv.90", "Lv.88", "Lv.71", "Lv.65", "Lv.55"].forEach(s => check("tab 里有 " + s, html.includes(s)));
["Lv.40", "Lv.30"].forEach(s => check("tab 里没有 " + s + "（被 Lv 最高的 5 张挤掉）", !html.includes(s)));
check("tab 默认 Lv 从高到低", html.indexOf("Lv.90") < html.indexOf("Lv.88") && html.indexOf("Lv.88") < html.indexOf("Lv.71"));
check("默认选中 Lv 最高那张（右侧详情 Lv 90）", html.includes('<div class="cd-stat"><span>Lv</span><b>90</b></div>'));
check("上限提示出现（超过 5 张会被去掉）", html.includes("每只宝可梦最多保留 5 张卡"));
check("不再显示已去掉几张", !html.includes("已去掉"));
check("标题是全部卡牌（5 张）", html.includes("全部卡牌（5 张）"));

// ---------- 糖果升级（Task 15） ----------
const vmState = sandbox.PokeMem.ctx.state;
check("升级按钮可用（Lv 90、糖果 5）", els["detail-levelup-btn"].disabled === false);
check("详情页显示糖果数", els["detail-candy"].textContent.indexOf("5") >= 0, els["detail-candy"].textContent);
els["detail-levelup-btn"].listeners.click[0]();
check("升级后选中卡 Lv 90 → 91", sandbox.PokeMem.ctx.detailSelected.level === 91);
check("升级花 1 糖果", vmState.trainer.candy === 4, "实际 " + vmState.trainer.candy);
const saved = JSON.parse(sandbox.localStorage.getItem("pokemem-save-v1"));
check("升级后已保存", saved.trainer.candy === 4 && saved.collection[33].cards.some(c => c.level === 91));
check("升级弹出提示", els["toast"].textContent.indexOf("Lv.91") >= 0, els["toast"].textContent);
check("详情面板重绘显示 Lv.91", els["detail-cards"].innerHTML.indexOf("<b>91</b>") >= 0);
vmState.trainer.candy = 0;
cell.listeners.click[0](); // 重新打开详情刷新按钮状态
check("糖果 0 时按钮禁用", els["detail-levelup-btn"].disabled === true);
els["detail-levelup-btn"].listeners.click[0]();
check("糖果 0 时点升级也没变化", sandbox.PokeMem.ctx.detailSelected.level === 91 && vmState.trainer.candy === 0);
vmState.trainer.candy = 5;
sandbox.PokeMem.ctx.detailSelected.level = 99;
cell.listeners.click[0](); // 重新打开详情刷新按钮状态（99 级可升级）
check("99 级时按钮可用", els["detail-levelup-btn"].disabled === false);
els["detail-levelup-btn"].listeners.click[0]();
check("自然升到 100 级", sandbox.PokeMem.ctx.detailSelected.level === 100);
check("满级时按钮禁用", els["detail-levelup-btn"].disabled === true);

// ---------- 未拥有详情：剪影 + 摇晃的问号，不泄露名字/属性/弱点 ----------
cell002.listeners.click[0](); // #002 妙蛙草，未拥有
check("未拥有详情：图是剪影（detail-art 带 missing）", els["detail-art"].className.indexOf("missing") >= 0, els["detail-art"].className);
check("未拥有详情：名字是问号不泄露", els["detail-name"].textContent.indexOf("？？？") >= 0 && els["detail-name"].textContent.indexOf("妙蛙草") < 0, els["detail-name"].textContent);
check("未拥有详情：meta 不带属性徽章", els["detail-meta"].innerHTML.indexOf("type-chip") < 0, els["detail-meta"].innerHTML);
check("未拥有详情：meta 还留稀有度和概率", els["detail-meta"].innerHTML.indexOf("稀有") >= 0 && els["detail-meta"].innerHTML.indexOf("单只概率") >= 0);
check("未拥有详情：弱点行藏起来", els["detail-weakness"].innerHTML === "" && els["detail-weakness"].style.display === "none");
check("未拥有详情：没有卡片 tab", els["detail-cards"].innerHTML === "");
cell.listeners.click[0](); // 再点回 #033 尼多力诺（已拥有）
check("已拥有详情：剪影去掉", els["detail-art"].className.indexOf("missing") < 0, els["detail-art"].className);
check("已拥有详情：名字是真名", els["detail-name"].textContent.indexOf("尼多力诺") >= 0, els["detail-name"].textContent);
check("已拥有详情：meta 有属性徽章", els["detail-meta"].innerHTML.indexOf("type-chip") >= 0);
check("已拥有详情：弱点行显示", els["detail-weakness"].innerHTML.indexOf("弱点") >= 0 && els["detail-weakness"].style.display === "");

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
