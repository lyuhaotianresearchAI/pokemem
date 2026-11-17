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
    children: [], style: {}, dataset: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
run("gacha.js");

// 造存档：尼多力诺（#033）7 张卡，Lv 分别是 71/40/90/65/55/88/30
const Gacha = sandbox.Gacha;
const state = Gacha.newState(1000000);
[71, 40, 90, 65, 55, 88, 30].forEach((lv, i) => {
  Gacha.addToCollection(state, { id: 33, level: lv, hp: 100 + i, atk: 50 + i });
});
state.trainer.candy = 5; // 升级测试用糖果
sandbox.localStorage.setItem("pokemem-save-v1", JSON.stringify(state));
// app.js 已拆成 js/ 模块（PR #3），按 index.html 里的加载顺序跑
run("js/store.js");
run("js/util.js");
run("js/lang.js");
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

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
