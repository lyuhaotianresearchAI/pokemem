// PokeMem 遭遇战选队验证：node test/encounter-ui.test.js
// 用最小 DOM 桩跑真实的 js/ 模块：每种一个格子（左上角属性标、右上角×几、底色按属性染）、
// 点格子只打开选卡 tab（不直接选）、tab 里点选项不收 tab（可以连续选）、
// 球是 6 个固定槽（点哪只取消哪只、别的球不动，新卡放第一个空球）、
// 出征按钮（精灵球下面一个、最下面一个）、满 6 只拦第 7 只。
const fs = require("fs");
const vm = require("vm");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

function makeEl(tag) {
  const cls = new Set();
  const el = {
    tagName: (tag || "div").toUpperCase(),
    children: [], style: {}, dataset: {}, attributes: {}, listeners: {},
    _text: "", _html: "", src: "", title: "", disabled: false,
    classList: {
      add(c) { cls.add(c); },
      remove(c) { cls.delete(c); },
      toggle(c, f) {
        if (f === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); }
        else if (f) cls.add(c); else cls.delete(c);
      },
      contains(c) { return cls.has(c); },
    },
    getAttribute(k) { return this.attributes[k] == null ? null : this.attributes[k]; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return []; },
    contains(other) { return this.children.indexOf(other) >= 0; },
    click() { (this.listeners.click || []).forEach(function (fn) { fn.call(el, { target: el }); }); },
    dispatch(type, ev) { (this.listeners[type] || []).forEach(function (fn) { fn.call(el, ev || { target: el }); }); },
  };
  Object.defineProperty(el, "className", {
    get() { return Array.from(cls).join(" "); },
    set(v) { cls.clear(); String(v).split(/\s+/).forEach(function (c) { if (c) cls.add(c); }); },
  });
  Object.defineProperty(el, "textContent", {
    get() { return this._text; },
    set(v) { this._text = String(v); },
  });
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; },
  });
  return el;
}
const els = {};
const sandbox = {
  console: console,
  setInterval: () => 0,
  setTimeout: () => 0,
  addEventListener: () => {},
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  document: {
    documentElement: { lang: "" },
    title: "",
    body: makeEl("body"),
    getElementById(id) { return els[id] || (els[id] = makeEl("div")); },
    createElement(tag) { return makeEl(tag); },
    querySelectorAll: () => [],
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
function run(file) { vm.runInContext(fs.readFileSync(__dirname + "/../" + file, "utf8"), sandbox, { filename: file }); }
run("pokedex.js");
run("avatars.js");
run("i18n.js");
run("card-progress.js");
run("gacha.js");

// 造存档：7 个种，每种 1–5 张卡（#001 四张、#004 五张，其余各一张）
const Gacha = sandbox.Gacha;
const state = Gacha.newState(1000000);
function addCard(id, level) {
  const row = sandbox.POKEDEX[id - 1];
  const st = Gacha.statsForLevel(row, level);
  Gacha.addToCollection(state, { id, name: row[1], en: row[2], types: row[3], tier: row[4],
    prob: row[5], level, hp: st.hp, atk: st.atk, exp: 0, affection: 0 });
}
[96, 82, 28, 8].forEach(function (lv) { addCard(1, lv); });
[97, 58, 44, 43, 42].forEach(function (lv) { addCard(4, lv); });
addCard(7, 50); addCard(10, 30); addCard(13, 20); addCard(16, 40); addCard(25, 60);
sandbox.localStorage.setItem("pokemem-save-v1", JSON.stringify(state));
// 按 index.html 的加载顺序跑
["js/store.js", "js/util.js", "js/lang.js", "js/types.js", "js/scenes.js", "js/encounter.js",
  "js/encounter-ui.js", "js/home.js", "js/dex.js", "js/rates.js", "js/tabs.js", "js/debug.js",
  "js/register.js", "js/trainer.js", "js/boot.js"].forEach(run);

sandbox.PokeMem.renderEncounter();
const grid = els["team-grid"];
const ballsBox = els["team-balls"];
const tab = els["team-pick-tab"];
const picks = function () { return sandbox.PokeMem.ctx.teamPicks; };
const nPicked = function () { return picks().filter(function (p) { return !!p; }).length; };
const pickedIds = function () {
  return picks().filter(function (p) { return !!p; }).map(function (p) { return p.speciesId + ":" + p.cardIndex; }).join(",");
};
const cellOf = function (id) {
  return grid.children.filter(function (c) { return c.getAttribute("data-species") === String(id); })[0];
};
const ballAt = function (i) { return ballsBox.children[i]; };
const ballImg = function (ball) { return ball.children.filter(function (c) { return c.tagName === "IMG"; })[0]; };
const ballLv = function (ball) { return ball.children.filter(function (c) { return c.className === "ball-lv"; })[0]; };
const countOf = function (id) {
  return cellOf(id).children.filter(function (c) { return c.className.indexOf("team-count") === 0; })[0];
};
const typesOf = function (id) {
  return cellOf(id).children.filter(function (c) { return c.className === "team-types"; })[0];
};
const tabOpt = function (i) { return tab.children[i + 1]; }; // 选项按 Lv 从高到低排，children[0] 是标题
const click = function (el) { el.listeners.click[0](); };
const mouseenter = function (el) { el.listeners.mouseenter[0](); };
const pickViaTab = function (id, optIdx) { mouseenter(cellOf(id)); click(tabOpt(optIdx)); };

check("6 个球槽一开始都关着",
  ballsBox.children.length === 6 &&
  ballsBox.children.every(function (b) { return !b.classList.contains("open") && !ballImg(b); }));
check("格子每种一个（7 个种 = 7 个格子，不再每张卡一个）", grid.children.length === 7, "实际 " + grid.children.length);
check("格子上有形象、名字、左上角属性标、右上角×几，没有 Lv/HP/攻击/亲密度",
  cellOf(1).children.length === 4 &&
  cellOf(1).children.every(function (c) { return c.className !== "team-stat" && c.className !== "team-affection"; }) &&
  countOf(1).textContent === "×4" && countOf(4).textContent === "×5" && countOf(7).textContent === "×1");
check("左上角属性标只要图标（妙蛙种子草+毒、小火龙只有火）",
  typesOf(1).innerHTML.indexOf("grass.svg") >= 0 && typesOf(1).innerHTML.indexOf("poison.svg") >= 0 &&
  typesOf(4).innerHTML.indexOf("fire.svg") >= 0 && typesOf(4).innerHTML.indexOf("poison.svg") < 0);
check("格子底色按主属性染成卡片色（妙蛙种子草色、小火龙火色）",
  cellOf(1).classList.contains("tbg-grass") && cellOf(4).classList.contains("tbg-fire"));
check("一开始已选 0 / 6", els["team-pick-count"].textContent === "已选 0 / 6", els["team-pick-count"].textContent);
check("一开始两个出征按钮都禁用",
  els["encounter-start-btn"].disabled === true && els["encounter-deploy-btn"].disabled === true);

// 点 #001 格子：只打开 tab，不直接选
click(cellOf(1));
check("点格子只打开 tab、不直接选", tab.style.display === "block" && nPicked() === 0);
check("tab 标题是种名 + 选哪一只上场",
  tab.children[0].textContent.indexOf("妙蛙种子") >= 0 && tab.children[0].textContent.indexOf("选哪一只上场") >= 0,
  tab.children[0].textContent);
check("tab 列出该种 4 张卡、带数值",
  tab.children.length === 5 && tab.children[3].textContent.indexOf("Lv.28") >= 0 && tab.children[3].textContent.indexOf("HP") >= 0,
  "实际 " + tab.children.length + " 个子元素");
check("tab 里亲密度直接写点数（亲密度:0，不带 Lv.）",
  tab.children[1].textContent.indexOf("亲密度:0") >= 0 && tab.children[1].textContent.indexOf("亲密度 Lv.") < 0,
  tab.children[1].textContent);

// tab 里连续选：点 Lv.96 → 1 号球开、tab 不关；再点 Lv.82 → 2 号球开、tab 还是不关
click(tabOpt(0));
check("tab 里点 Lv.96：1 号球打开、里面是 #001",
  nPicked() === 1 && ballAt(0).classList.contains("open") && ballImg(ballAt(0)).src.indexOf("/1.png") >= 0);
check("球下写着 Lv.96", ballLv(ballAt(0)).textContent === "Lv.96", ballLv(ballAt(0)).textContent);
check("点了选项 tab 不关、可以继续选", tab.style.display === "block");
check("选了的格子右上角×几打勾变红", countOf(1).textContent === "✓ ×4" && countOf(1).classList.contains("selected"), countOf(1).textContent);
check("已选 1 / 6，两个出征按钮都可用",
  els["team-pick-count"].textContent === "已选 1 / 6" &&
  els["encounter-start-btn"].disabled === false && els["encounter-deploy-btn"].disabled === false);
click(tabOpt(1));
check("tab 里再点 Lv.82：2 号球打开，tab 还是不关",
  nPicked() === 2 && ballAt(1).classList.contains("open") && tab.style.display === "block", pickedIds());
click(tabOpt(0));
check("tab 里点已选的 Lv.96：取消、1 号球关回去，别的球不动",
  nPicked() === 1 && !ballAt(0).classList.contains("open") && ballAt(1).classList.contains("open"),
  pickedIds());
check("tab 里已选的那张打勾", tabOpt(1).classList.contains("selected") && !tabOpt(0).classList.contains("selected"));

// 新卡放第一个空球：1 号球空着，点 Lv.28 应该进 1 号球（不是最后）
click(tabOpt(2));
check("新卡放第一个空球（Lv.28 进 1 号球）",
  nPicked() === 2 && ballLv(ballAt(0)).textContent === "Lv.28" && ballLv(ballAt(1)).textContent === "Lv.82",
  pickedIds());
click(tabOpt(3));
check("再点 Lv.8：进 3 号球", nPicked() === 3 && ballLv(ballAt(2)).textContent === "Lv.8", pickedIds());
click(tabOpt(0));
check("再点 Lv.96：进 4 号球", nPicked() === 4 && ballLv(ballAt(3)).textContent === "Lv.96", pickedIds());

// 点中间的球（2 号球 Lv.82）取消：只空出这一个球，别的球不动、不挪位
click(ballAt(1));
check("点中间的球取消：只空出 2 号球，别的球不动",
  nPicked() === 3 && !ballAt(1).classList.contains("open") &&
  ballLv(ballAt(0)).textContent === "Lv.28" && ballLv(ballAt(2)).textContent === "Lv.8" &&
  ballLv(ballAt(3)).textContent === "Lv.96", pickedIds());
click(tabOpt(1));
check("再点 Lv.82：又回到 2 号球（第一个空球）",
  nPicked() === 4 && ballLv(ballAt(1)).textContent === "Lv.82", pickedIds());

// 鼠标离开 tab 就收起来
tab.dispatch("mouseleave");
check("鼠标离开 tab 就收起来", tab.style.display === "none");

// 清掉 4 只（球是固定槽：挨个点 1–4 号球）
[0, 1, 2, 3].forEach(function (i) { click(ballAt(i)); });
check("点球清掉四只", nPicked() === 0);

// 选满 6 只：第 7 只被拦
[[1, 0], [4, 0], [7, 0], [10, 0], [13, 0], [16, 0]].forEach(function (a) { pickViaTab(a[0], a[1]); });
check("选满 6 只", nPicked() === 6, "实际 " + nPicked());
check("6 个球都打开", ballsBox.children.every(function (b) { return b.classList.contains("open"); }));
check("已选 6 / 6", els["team-pick-count"].textContent === "已选 6 / 6");
mouseenter(cellOf(1));
click(tabOpt(1));
check("满员时再点没选上的：弹提示、不再加",
  nPicked() === 6 && els["toast"].textContent.indexOf("最多选 6 张卡") >= 0, els["toast"].textContent);

// 精灵球下面的出征按钮：点它开始遭遇战、队伍清空、切到战斗屏
click(els["encounter-deploy-btn"]);
check("点出征开始遭遇战", !!sandbox.PokeMem.ctx.encounter);
check("出征后队伍清空", nPicked() === 0);
check("出征后切到战斗屏",
  els["encounter-picker"].style.display === "none" && els["battle-screen"].style.display === "");

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
