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
run("i18n.js");
run("gacha.js");

// 造存档：尼多力诺（#033）7 张卡，Lv 分别是 71/40/90/65/55/88/30
const Gacha = sandbox.Gacha;
const state = Gacha.newState(1000000);
[71, 40, 90, 65, 55, 88, 30].forEach((lv, i) => {
  Gacha.addToCollection(state, { id: 33, level: lv, hp: 100 + i, atk: 50 + i });
});
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

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
