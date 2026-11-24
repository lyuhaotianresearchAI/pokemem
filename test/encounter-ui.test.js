// PokeMem 遭遇战选队验证：node test/encounter-ui.test.js
// 用最小 DOM 桩跑真实的 js/ 模块：每种一个格子（左上角属性标、右上角×几、底色按属性染）、
// 点格子只打开选卡 tab（不直接选）、tab 里点选项不收 tab（可以连续选）、
// 球是 6 个固定槽（点哪只取消哪只、别的球不动，新卡放第一个空球）、
// 出征按钮（精灵球下面一个、最下面一个）、满 6 只拦第 7 只。
// 悬停意图：快速路过边上的格子不换 tab（停满 200ms 才换）、收 tab 给 300ms 宽限；
// tab 选项一行写全信息（小字、短标签）；场景是 9 个小圆圈绕中心转的轨道（全矢量 SVG 图，
// 悬停/选中停转、离开/取消选中继续转，中心显示悬停或选中场景的信息）。
// 桩用真定时器（setTimeout/clearTimeout），mouseenter/收 tab 的检查要 await 睡 260/360ms。
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
  setInterval: () => 0, // boot.js 的 1 秒 tick：桩里不跑，免得进程退不出去
  setTimeout: setTimeout, // 真的定时器：选卡 tab 的悬停意图延迟（200ms）和收起宽限（300ms）要靠它
  clearTimeout: clearTimeout,
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
["js/store.js", "js/util.js", "js/lang.js", "js/types.js", "js/scenes.js", "js/scene-icons.js", "js/encounter-events.js", "js/encounter.js",
  "js/battle-anim.js", "js/encounter-ui.js", "js/home.js", "js/dex.js", "js/rates.js", "js/tabs.js", "js/debug.js",
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
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
// 悬停开 tab 有 200ms 意图延迟：mouseenter 后要等 260ms tab 才换过来；
// 点格子是立刻开，不用等（click 还是同步的）
const mouseenter = async function (el) { el.listeners.mouseenter[0](); await sleep(260); };
const pickViaTab = async function (id, optIdx) { await mouseenter(cellOf(id)); click(tabOpt(optIdx)); };

(async function () {

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

// 场景轨道：9 个小圆圈绕中心转（36s 一圈），中心显示悬停或选中场景的信息
const orbitWrap = function () { return els["scene-list"].children[0]; };
const orbitRing = function () { return orbitWrap().children[0]; };
const orbitCenter = function () { return orbitWrap().children[1]; };
const orbitCell = function (i) { return orbitRing().children[i]; };
const orbitIcon = function (i) { return orbitCell(i).children[0]; }; // 反向转那层（图标 + 锁都在里面）
const orbitImg = function (i) { return orbitIcon(i).children[0]; };
const centerName = function () {
  var ch = orbitCenter().children.filter(function (c) { return c.className === "orbit-name"; });
  return ch.length ? ch[0].textContent : "";
};
const centerBase = function () {
  var ch = orbitCenter().children.filter(function (c) { return c.className === "orbit-base"; });
  return ch.length ? ch[0].textContent : "";
};
check("场景是轨道：1 个外框、环上 9 个圆圈、中间是信息区",
  els["scene-list"].children.length === 1 && orbitRing().children.length === 9 &&
  orbitWrap().className.indexOf("orbit-wrap") >= 0 && orbitCenter().className === "orbit-center");
check("圆圈从正上方开始排（草丛在顶上、每 40° 一个）",
  orbitCell(0).style.transform.indexOf("rotate(-90deg)") >= 0 &&
  orbitCell(2).style.transform.indexOf("rotate(-10deg)") >= 0);
check("9 个圆圈都是矢量 SVG 地形图（没有低分辨率 PNG），图标包在反向转那层里、始终正着",
  orbitRing().children.every(function (cell) {
    return cell.children[0].className === "orbit-icon" &&
      cell.children[0].children[0].tagName === "IMG" &&
      cell.children[0].children[0].src.indexOf("data:image/svg+xml;base64,") === 0;
  }));
check("中心默认显示已选的草丛（名字 + 打勾、属性图标、野生等级）",
  centerName() === "草丛 ✓" &&
  orbitCenter().children.some(function (c) { return c.className === "orbit-types"; }) &&
  centerBase().indexOf("5") >= 0);
orbitCell(1).dispatch("mouseenter");
check("悬停森林圆圈，中心换成森林（未解锁显示解锁条件）",
  centerName() === "森林" && centerBase().indexOf("5") >= 0);
orbitCell(1).dispatch("mouseleave");
check("鼠标离开圆圈，中心回到已选的草丛", centerName() === "草丛 ✓");
check("未解锁的森林圆圈带锁、点不动（锁在反向转那层里，跟着图标一起正着）",
  orbitCell(1).classList.contains("locked") &&
  orbitIcon(1).children.some(function (c) { return c.className === "orbit-lock"; }));
orbitCell(1).click();
check("点未解锁场景不切换", orbitCell(0).classList.contains("selected") && !orbitCell(1).classList.contains("selected"));
check("一开始没选、鼠标不在轨道上，转圈在转",
  !orbitWrap().classList.contains("paused"));
orbitCell(0).click(); // 点草丛：选中
check("选中草丛，转圈停住", orbitWrap().classList.contains("paused"));
orbitCell(0).click(); // 再点一次：取消选择
check("再点一次取消选择，转圈继续转", !orbitWrap().classList.contains("paused"));
orbitWrap().dispatch("mouseenter");
check("鼠标放上轨道（没选），转圈也停住", orbitWrap().classList.contains("paused"));
orbitWrap().dispatch("mouseleave");
check("鼠标离开轨道（没选），转圈继续转", !orbitWrap().classList.contains("paused"));

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
check("tab 选项一行写全信息（Lv/HP/攻/亲密度，短标签“攻”不写“攻击”）",
  tab.children[1].textContent.indexOf("攻") >= 0 && tab.children[1].textContent.indexOf("攻击") < 0 &&
  /HP\d/.test(tab.children[1].textContent),
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

// 悬停意图：快速路过边上的格子不换 tab（去 tab 的路上经过小火龙也不换）；停满 200ms 才换
cellOf(4).listeners.mouseenter[0](); // 路过：只触发，不等
check("快速路过边上的格子：tab 还是 #001 的",
  tab.children[0].textContent.indexOf("妙蛙种子") >= 0, tab.children[0].textContent);
await sleep(260);
check("在边上的格子停满 200ms：tab 才换成 #004",
  tab.children[0].textContent.indexOf("小火龙") >= 0, tab.children[0].textContent);
await mouseenter(cellOf(1)); // 回到 #001（mouseenter 自带 260ms 等待）
check("回到 #001 的格子停满：tab 换回来",
  tab.children[0].textContent.indexOf("妙蛙种子") >= 0, tab.children[0].textContent);

// 收 tab 宽限：离开格子后 300ms 内还开着（够把鼠标移到 tab 上）；移进 tab 取消待收
cellOf(1).dispatch("mouseleave", { target: cellOf(1), relatedTarget: null });
check("离开格子：300ms 宽限内 tab 还开着", tab.style.display === "block");
tab.dispatch("mouseenter"); // 移进 tab 里：取消待收
await sleep(360);
check("移进 tab 取消了待收：宽限过了 tab 还开着", tab.style.display === "block");
cellOf(1).dispatch("mouseleave", { target: cellOf(1), relatedTarget: null });
await sleep(360);
check("离开格子又离开 tab：宽限过了才收起来", tab.style.display === "none");
await mouseenter(cellOf(1)); // 重新打开 #001 的 tab，后面的流程继续

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

// 鼠标离开 tab：300ms 宽限内还开着，宽限过了才收起来
tab.dispatch("mouseleave");
check("鼠标离开 tab：300ms 宽限内还开着", tab.style.display === "block");
await sleep(360);
check("鼠标离开 tab：宽限过了才收起来", tab.style.display === "none");

// 清掉 4 只（球是固定槽：挨个点 1–4 号球）
[0, 1, 2, 3].forEach(function (i) { click(ballAt(i)); });
check("点球清掉四只", nPicked() === 0);

// 选满 6 只：第 7 只被拦
for (const a of [[1, 0], [4, 0], [7, 0], [10, 0], [13, 0], [16, 0]]) await pickViaTab(a[0], a[1]);
check("选满 6 只", nPicked() === 6, "实际 " + nPicked());
check("6 个球都打开", ballsBox.children.every(function (b) { return b.classList.contains("open"); }));
check("已选 6 / 6", els["team-pick-count"].textContent === "已选 6 / 6");
await mouseenter(cellOf(1));
click(tabOpt(1));
check("满员时再点没选上的：弹提示、不再加",
  nPicked() === 6 && els["toast"].textContent.indexOf("最多选 6 张卡") >= 0, els["toast"].textContent);

// 精灵球下面的出征按钮：点它开始遭遇战、队伍清空、切到战斗屏
click(els["encounter-deploy-btn"]);
check("点出征开始遭遇战", !!sandbox.PokeMem.ctx.encounter);
check("出征后队伍清空", nPicked() === 0);
check("出征后切到战斗屏",
  els["encounter-picker"].style.display === "none" && els["battle-screen"].style.display === "");

// 事件屏（Task 33）：强制进 event 阶段（战斗类事件）
const enc33 = sandbox.PokeMem.ctx.encounter;
enc33.event = { kind: "battle", event: { zh: "训练师挑战", en: "Trainer Battle" },
  textZh: "路过的训练师向你挑战！胜 → 得 2 梦想结晶",
  textEn: "A passing Trainer challenges you! Win to get 2 Dream Crystals.",
  battle: { levelBonus: 2, bonus: { crystals: 2 } } };
enc33.phase = "event";
sandbox.PokeMem.renderEncounter();
check("事件屏：战斗类事件显示事件屏、藏战斗屏",
  els["event-screen"].style.display === "" && els["battle-screen"].style.display === "none");
check("事件屏：标题是事件名、文案是事件文本",
  els["event-title"].textContent === "训练师挑战" &&
  els["event-text"].textContent.indexOf("2 梦想结晶") >= 0);
check("事件屏：战斗类事件只显示开始战斗（继续前进藏起）",
  els["event-fight-btn"].style.display === "" && els["event-continue-btn"].style.display === "none");
// 点开始战斗：刷野（草丛基础 5 + 等级加成 2 = Lv 7）、回战斗屏
click(els["event-fight-btn"]);
check("事件屏：点开始战斗、刷出 Lv 7 野生、回战斗屏",
  enc33.phase === "battle" && !!enc33.wild && enc33.wild.level === 7 &&
  els["battle-screen"].style.display === "" && els["event-screen"].style.display === "none");
// 非战斗事件：显示继续前进、不显示开始战斗
enc33.event = { kind: "buff", event: { zh: "好心人指导", en: "Kind Stranger" },
  textZh: "好心人指导：全队攻击 +5（本次遭遇战）",
  textEn: "A kind stranger's guidance: team Attack +5 for this run." };
enc33.phase = "event";
sandbox.PokeMem.renderEncounter();
check("事件屏：非战斗事件显示继续前进、不显示开始战斗",
  els["event-continue-btn"].style.display === "" && els["event-fight-btn"].style.display === "none");
check("事件屏：结束按钮一直显示", els["event-end-btn"].style.display !== "none");
// 战报：事件后必定紧跟刷野，战报显示事件文本（不是刷野行）
enc33.log = [{ t: "event", name: "训练师挑战", nameEn: "Trainer Battle",
  textZh: "路过的训练师向你挑战！胜 → 得 2 梦想结晶",
  textEn: "A passing Trainer challenges you! Win to get 2 Dream Crystals." },
  { t: "spawn", id: 10, name: "绿毛虫", en: "Caterpie", level: 7 }];
enc33.phase = "battle";
sandbox.PokeMem.renderEncounter();
check("战报：事件后刷野、显示事件文本",
  els["battle-log"].textContent.indexOf("2 梦想结晶") >= 0);
// 战报：没有事件的普通战斗，仍显示刷野行
enc33.log = [{ t: "spawn", id: 10, name: "绿毛虫", en: "Caterpie", level: 7 }];
sandbox.PokeMem.renderEncounter();
check("战报：无事件时仍显示刷野行",
  els["battle-log"].textContent.indexOf("绿毛虫") >= 0 && els["battle-log"].textContent.indexOf("Lv.7") >= 0);
// 结算屏：宝箱亲密度 +2 显示一行
enc33.chest = { crystals: 0, items: [], capped: true, affection: 2 };
enc33.phase = "done";
sandbox.PokeMem.renderEncounter();
check("结算屏：宝箱亲密度 +2 显示一行",
  els["battle-settle-affection"].style.display === "" &&
  els["battle-settle-affection"].textContent.indexOf("+2") >= 0);
// 战斗动画（Task 30A）：事件战斗 → 点攻击（野生 Lv 7 < 出战卡，我方先攻必定飘数字）
enc33.event = { kind: "battle", event: { zh: "训练师挑战", en: "Trainer Battle" },
  textZh: "路过的训练师向你挑战！胜 → 得 2 梦想结晶",
  textEn: "A passing Trainer challenges you! Win to get 2 Dream Crystals.",
  battle: { levelBonus: 2, bonus: { crystals: 2 } } };
enc33.phase = "event";
sandbox.PokeMem.renderEncounter();
click(els["event-fight-btn"]);
click(els["battle-attack-btn"]);
check("战斗动画：攻击后飘伤害数字",
  els["battle-wild-dmg"].textContent.indexOf("-") === 0 || els["battle-wild-dmg"].textContent.indexOf("暴击") === 0,
  els["battle-wild-dmg"].textContent);
check("战斗动画：攻击方前冲", els["battle-mine-img"].classList.contains("anim-lunge-mine"));
// 打倒：手写 ko 条目（renderBattle 已藏图，动画要先亮回来再倒下）
enc33.log.push({ t: "ko", name: "绿毛虫", nameEn: "Caterpie" });
enc33.wild = null;
sandbox.PokeMem.renderEncounter();
check("战斗动画：打倒时野生图亮回 + 倒下淡出",
  els["battle-wild-img"].style.display === "" && els["battle-wild-img"].classList.contains("anim-faint"));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
})();
