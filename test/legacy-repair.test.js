// PokeMem 旧卡补救真实路径验证：node test/legacy-repair.test.js
// 复现用户截图里的情况：小火龙 #004 共 8 张，但存档是 v1.5 之前的——
// 只有总数和最高数值（Lv94 / HP264 / 攻击190），没有每张卡的明细。
// 跑真实的 js/ 模块启动流程后，点开它，详情页应该有 5 个 tab（Lv 最高的 5 张），
// 且注明其中 4 张是补生成的（7 张里 3 张被上限去掉）、已去掉 3 张。
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
run("avatars.js");
run("i18n.js");
run("card-progress.js");
run("gacha.js");

// v1.5 之前的存档：小火龙 8 张，只有汇总，没有 cards/legacy
const Gacha = sandbox.Gacha;
const state = Gacha.newState(1000000);
state.collection[4] = { count: 8, bestLv: 94, bestHp: 264, bestAtk: 190 };
sandbox.localStorage.setItem("pokemem-save-v1", JSON.stringify(state));
// app.js 已拆成 js/ 模块（PR #3），按 index.html 里的加载顺序跑；boot.js 启动时迁移 + 补生成旧卡
run("js/store.js");
run("js/util.js");
run("js/lang.js");
run("js/types.js");
run("js/scenes.js");
run("js/home.js");
run("js/dex.js");
run("js/rates.js");
run("js/tabs.js");
run("js/debug.js");
run("js/register.js");
run("js/trainer.js");
run("js/boot.js");

const grid = els["collection-grid"];
grid.children[3].listeners.click[0](); // 第 4 只就是小火龙
const html = els["detail-cards"].innerHTML;
const tabCount = (html.match(/<button class="card-tab/g) || []).length;
check("小火龙详情有 5 个 tab", tabCount === 5, "实际 " + tabCount + " 个");
check("Lv94 那张在 tab 里（原最高等级保留）", html.includes("Lv.94"));
const tabLevels = [...html.matchAll(/Lv\.(\d+)/g)].map(m => parseInt(m[1], 10));
check("tab 的 Lv 都不超过 94", tabLevels.every(lv => lv <= 94), "tab Lv: " + tabLevels.join(","));
check("上限提示出现（超过 5 张会被去掉）", html.includes("每只宝可梦最多保留 5 张卡"));
check("不再显示已去掉几张", !html.includes("已去掉"));
check("注明 4 张是补生成的（7 张里 3 张被上限去掉）", html.includes("其中 4 张旧卡数值是补生成的"));
check("不再显示旧卡无明细的提示", !html.includes("无单独数值"));

// 存档本身也被修好了：上限执行后只剩 5 条明细，legacy 清零
const saved = JSON.parse(sandbox.localStorage.getItem("pokemem-save-v1"));
check("存档里小火龙只剩 5 条明细", saved.collection[4].cards.length === 5);
check("启动补字段：迁移后的 5 张卡都有 exp 0 / affection 0（Task 24，boot 全链路）",
  saved.collection[4].cards.every(function (c) { return c.exp === 0 && c.affection === 0; }));
check("存档 legacy 已清零", saved.collection[4].legacy === 0);
check("存档记了去掉 3 张", saved.collection[4].droppedCount === 3);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
