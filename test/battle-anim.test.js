// PokeMem 本地验证：node test/battle-anim.test.js
// Task 30A 战斗动画：只加载 js/battle-anim.js，用假 document 测 play() 的 log diff、
// 伤害数字、血条残影、打倒/抓捕的亮回-藏回；不依赖整条 UI 链（集成走 smoke + encounter-ui）。
const vm = require("vm");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

function makeClassList() {
  const s = new Set();
  return {
    add(c) { s.add(c); },
    remove(...cs) { cs.forEach(function (c) { s.delete(c); }); }, // 真 DOM 的 remove 支持多参数
    toggle(c, f) {
      if (f === undefined) { if (s.has(c)) s.delete(c); else s.add(c); }
      else if (f) s.add(c); else s.delete(c);
    },
    contains(c) { return s.has(c); },
  };
}
function makeEl() {
  return { style: {}, textContent: "", classList: makeClassList() };
}

function freshSandbox() {
  const els = {};
  const timers = [];
  const sandbox = {
    document: {
      getElementById(id) { return els[id] || (els[id] = makeEl()); },
    },
    // 捕获 setTimeout：断言藏回是否排期，也能手动触发回调
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/battle-anim.js"), "utf8"), sandbox, { filename: "js/battle-anim.js" });
  return { sandbox, els, timers };
}

function freshEnc() {
  return {
    log: [],
    wild: { hp: 100, hpMax: 100 },
    team: [{ hp: 80, hpMax: 100 }],
    activeIndex: 0,
  };
}

(function () {
  const { sandbox, els, timers } = freshSandbox();
  const BattleAnim = sandbox.PokeMem.BattleAnim;
  check("模块挂在 PokeMem.BattleAnim 上（play + reset）",
    !!BattleAnim && typeof BattleAnim.play === "function" && typeof BattleAnim.reset === "function");

  // 同步基线：第一次 play 只记基线、不播动画
  const enc = freshEnc();
  enc.log.push({ t: "spawn", id: 10, name: "绿毛虫", en: "Caterpie", level: 5 });
  BattleAnim.play(enc);
  check("首次 play 只同步基线、不播动画（但会清掉残留动作 class）",
    !els["battle-wild-img"].classList.contains("anim-pop") &&
    !els["battle-mine-img"].classList.contains("anim-pop"));

  // 我方攻击：野生抖+闪红、我方前冲、飘 -33、残影 100%→67%
  enc.log.push({ t: "hit", by: "player", attacker: "妙蛙种子", defender: "绿毛虫", damage: 33, crit: false, mult: 1, defHp: 67, defHpMax: 100 });
  enc.wild.hp = 67;
  BattleAnim.play(enc);
  check("我方打：野生抖+闪红（anim-hit）", els["battle-wild-img"].classList.contains("anim-hit"));
  check("我方打：我方前冲（anim-lunge-mine）", els["battle-mine-img"].classList.contains("anim-lunge-mine"));
  check("我方打：飘伤害数字 -33", els["battle-wild-dmg"].textContent === "-33");
  check("我方打：非暴击不加 crit class", !els["battle-wild-dmg"].classList.contains("crit"));
  check("我方打：血条残影缩到 67%",
    els["battle-wild-hp-ghost"].style.width === "67%" && els["battle-wild-hp-ghost"].style.transition === "width .6s ease");

  // 暴击：金色「暴击！-66」
  enc.log.push({ t: "hit", by: "player", attacker: "妙蛙种子", defender: "绿毛虫", damage: 66, crit: true, mult: 1, defHp: 1, defHpMax: 100 });
  enc.wild.hp = 1;
  BattleAnim.play(enc);
  check("暴击：飘「暴击！-66」+ crit class",
    els["battle-wild-dmg"].textContent === "暴击！-66" && els["battle-wild-dmg"].classList.contains("crit"));

  // 野生反击：我方抖+闪红、野生前冲、飘 -12 到我方
  enc.log.push({ t: "hit", by: "wild", attacker: "绿毛虫", defender: "妙蛙种子", damage: 12, crit: false, mult: 1, defHp: 68, defHpMax: 100 });
  enc.team[0].hp = 68;
  BattleAnim.play(enc);
  check("野生打：我方抖+闪红", els["battle-mine-img"].classList.contains("anim-hit"));
  check("野生打：野生前冲（anim-lunge-wild）", els["battle-wild-img"].classList.contains("anim-lunge-wild"));
  check("野生打：飘 -12 到我方", els["battle-mine-dmg"].textContent === "-12");

  // [hit, hit] 批次（F1）：标准双向交锋，每侧最终只剩最新动作的 class
  BattleAnim.reset();
  const encH = freshEnc();
  BattleAnim.play(encH); // 同步基线
  encH.log.push({ t: "hit", by: "player", damage: 20, crit: false, mult: 1, defHp: 80, defHpMax: 100 });
  encH.log.push({ t: "hit", by: "wild", damage: 12, crit: false, mult: 1, defHp: 68, defHpMax: 100 });
  encH.wild.hp = 80;
  encH.team[0].hp = 68;
  BattleAnim.play(encH);
  check("[hit, hit]：我方最终只剩受击（最新动作），前冲被清掉",
    els["battle-mine-img"].classList.contains("anim-hit") && !els["battle-mine-img"].classList.contains("anim-lunge-mine"));
  check("[hit, hit]：野生最终只剩前冲（最新动作），受击被清掉",
    els["battle-wild-img"].classList.contains("anim-lunge-wild") && !els["battle-wild-img"].classList.contains("anim-hit"));
  check("[hit, hit]：两侧伤害数字都在",
    els["battle-wild-dmg"].textContent === "-20" && els["battle-mine-dmg"].textContent === "-12");

  // [hit, ko, levelup] 批次（F1）：一击必杀 + 升级，每侧最终只剩终结动作
  BattleAnim.reset();
  const encK = freshEnc();
  BattleAnim.play(encK);
  encK.log.push({ t: "hit", by: "player", damage: 100, crit: false, mult: 1, defHp: 0, defHpMax: 100 });
  encK.log.push({ t: "ko", name: "绿毛虫", nameEn: "Caterpie" });
  encK.log.push({ t: "levelup", name: "妙蛙种子", nameEn: "Bulbasaur", from: 5, to: 6 });
  encK.wild = null;
  els["battle-wild-img"].style.display = "none";
  BattleAnim.play(encK);
  check("[hit, ko, levelup]：野生最终只剩倒下",
    els["battle-wild-img"].classList.contains("anim-faint") && !els["battle-wild-img"].classList.contains("anim-hit"));
  check("[hit, ko, levelup]：我方最终只剩升级金光、前冲被清掉",
    els["battle-mine-img"].classList.contains("anim-levelup") && !els["battle-mine-img"].classList.contains("anim-lunge-mine"));

  // F3：团灭后开新局，我方图上的倒下 class 在基线同步时就清掉（不是等第一次攻击）
  BattleAnim.reset();
  const encF = freshEnc();
  BattleAnim.play(encF);
  encF.log.push({ t: "faint", name: "妙蛙种子", nameEn: "Bulbasaur" });
  encF.team[0].hp = 0;
  BattleAnim.play(encF);
  check("F3 前置：我方倒下挂上 anim-faint", els["battle-mine-img"].classList.contains("anim-faint"));
  const encF2 = freshEnc(); // 新遭遇战：新 enc 对象
  BattleAnim.play(encF2); // 走基线同步
  check("F3：新开局同步基线时清掉上局的倒下 class", !els["battle-mine-img"].classList.contains("anim-faint"));

  // 打倒：同一批 [hit, ko]，终结动画优先于抖动；图先亮回来、播完藏回去
  BattleAnim.reset();
  const enc2 = freshEnc();
  enc2.wild.hp = 30;
  BattleAnim.play(enc2); // 同步基线（野生 30/100）
  enc2.log.push({ t: "hit", by: "player", damage: 30, crit: false, mult: 1, defHp: 0, defHpMax: 100 });
  enc2.log.push({ t: "ko", name: "绿毛虫", nameEn: "Caterpie" });
  enc2.wild = null; // winRound 已清掉野生
  els["battle-wild-img"].style.display = "none"; // renderBattle 藏了图
  BattleAnim.play(enc2);
  check("打倒：野生图先亮回来 + 倒下淡出",
    els["battle-wild-img"].style.display === "" && els["battle-wild-img"].classList.contains("anim-faint"));
  check("打倒：终结动画清掉抖动 class", !els["battle-wild-img"].classList.contains("anim-hit"));
  check("打倒：残影到 0%", els["battle-wild-hp-ghost"].style.width === "0%");
  check("打倒：藏回已排期（800ms）", timers.some(function (t) { return t.ms === 800; }));
  // 手动触发藏回回调：图藏起、class 清掉
  timers.filter(function (t) { return t.ms === 800; }).forEach(function (t) { t.fn(); });
  check("打倒：藏回后图隐藏、class 清掉",
    els["battle-wild-img"].style.display === "none" && !els["battle-wild-img"].classList.contains("anim-faint"));

  // 藏回守卫：中途点了继续（新野生已刷出），藏回不再藏新图
  BattleAnim.reset();
  const enc3 = freshEnc();
  BattleAnim.play(enc3);
  enc3.log.push({ t: "ko", name: "绿毛虫", nameEn: "Caterpie" });
  enc3.wild = null;
  BattleAnim.play(enc3);
  enc3.wild = { hp: 50, hpMax: 100 }; // 点了继续，新野生
  els["battle-wild-img"].style.display = "";
  var t800 = timers.filter(function (t) { return t.ms === 800; });
  t800[t800.length - 1].fn(); // 只触发最新那次藏回（前面 enc2 的旧回调已触发过）
  check("藏回守卫：已有新野生时不藏图", els["battle-wild-img"].style.display === "");

  // 我方倒下：倒下淡出、不藏图（等玩家选下一只）
  BattleAnim.reset();
  const enc4 = freshEnc();
  BattleAnim.play(enc4);
  enc4.log.push({ t: "faint", name: "妙蛙种子", nameEn: "Bulbasaur" });
  enc4.team[0].hp = 0;
  const timersBefore = timers.length;
  BattleAnim.play(enc4);
  check("我方倒下：倒下淡出", els["battle-mine-img"].classList.contains("anim-faint"));
  check("我方倒下：不排藏回（图要留着等换人）", timers.length === timersBefore);

  // 抓到：球飞过去晃三下 + 星星 + 野生缩小淡出
  BattleAnim.reset();
  const enc5 = freshEnc();
  BattleAnim.play(enc5);
  enc5.log.push({ t: "catch", name: "绿毛虫", nameEn: "Caterpie", ball: "poke_ball", success: true });
  enc5.wild = null;
  els["battle-wild-img"].style.display = "none";
  BattleAnim.play(enc5);
  check("抓到：球显示 + anim-ball-catch",
    els["battle-ball"].style.display === "block" && els["battle-ball"].classList.contains("anim-ball-catch"));
  check("抓到：冒星星", els["battle-wild-fx"].textContent === "✦✦✦" && els["battle-wild-fx"].classList.contains("anim-sparkle"));
  check("抓到：野生图亮回 + 缩小淡出",
    els["battle-wild-img"].style.display === "" && els["battle-wild-img"].classList.contains("anim-caught"));

  // 挣脱：球炸开、野生不倒下
  BattleAnim.reset();
  const enc6 = freshEnc();
  BattleAnim.play(enc6);
  enc6.log.push({ t: "catch", name: "绿毛虫", nameEn: "Caterpie", ball: "poke_ball", success: false });
  BattleAnim.play(enc6);
  check("挣脱：球 anim-ball-fail", els["battle-ball"].classList.contains("anim-ball-fail"));
  check("挣脱：炸开特效", els["battle-wild-fx"].textContent === "✷✷✷" && els["battle-wild-fx"].classList.contains("anim-burst"));
  check("挣脱：野生不倒下", !els["battle-wild-img"].classList.contains("anim-faint"));

  // 刷野 / 换人：弹出 + 清掉倒下 class；升级：金光
  BattleAnim.reset();
  const enc7 = freshEnc();
  BattleAnim.play(enc7);
  els["battle-wild-img"].classList.add("anim-faint");
  enc7.log.push({ t: "spawn", id: 10, name: "绿毛虫", en: "Caterpie", level: 5 });
  BattleAnim.play(enc7);
  check("刷野：野生弹出、倒下 class 清掉",
    els["battle-wild-img"].classList.contains("anim-pop") && !els["battle-wild-img"].classList.contains("anim-faint"));

  // 飘字不带入下一场：上一场的飘字/特效/球残留，在新野生出场时清掉
  BattleAnim.reset();
  const encS = freshEnc();
  BattleAnim.play(encS);
  els["battle-wild-dmg"].textContent = "-56";
  els["battle-wild-dmg"].classList.add("anim-dmg");
  els["battle-mine-fx"].textContent = "✦✦✦";
  els["battle-mine-fx"].classList.add("anim-sparkle");
  els["battle-ball"].classList.add("anim-ball-fail");
  encS.log.push({ t: "spawn", id: 10, name: "绿毛虫", en: "Caterpie", level: 5 });
  BattleAnim.play(encS);
  check("新野生出场清掉上一场的飘字", els["battle-wild-dmg"].textContent === "" && !els["battle-wild-dmg"].classList.contains("anim-dmg"));
  check("新野生出场清掉上一场的特效字", els["battle-mine-fx"].textContent === "" && !els["battle-mine-fx"].classList.contains("anim-sparkle"));
  check("新野生出场清掉上一场的球动画", !els["battle-ball"].classList.contains("anim-ball-fail"));
  // 换人 / 升级：用自己的 enc（上面新块的 reset 打断了 enc7 的 log 追踪，不能再共用它）
  BattleAnim.reset();
  const enc8 = freshEnc();
  BattleAnim.play(enc8);
  els["battle-mine-img"].classList.add("anim-faint");
  enc8.log.push({ t: "switch", name: "小火龙", nameEn: "Charmander" });
  BattleAnim.play(enc8);
  check("换人：我方弹出、倒下 class 清掉",
    els["battle-mine-img"].classList.contains("anim-pop") && !els["battle-mine-img"].classList.contains("anim-faint"));
  enc8.log.push({ t: "levelup", name: "小火龙", nameEn: "Charmander", from: 5, to: 6 });
  BattleAnim.play(enc8);
  check("升级：我方金光", els["battle-mine-img"].classList.contains("anim-levelup"));

  // 无新条目再播一次：不报错、不重复
  BattleAnim.play(enc7);
  check("无新条目：重复 play 不报错", true);

  // log 被重置（变短）：只同步基线、不播旧动画、不报错
  enc7.log = [];
  BattleAnim.play(enc7);
  check("log 变短：重新同步、不报错", true);

  // reset 后：同一场次重新同步，之后的新条目照常播
  BattleAnim.reset();
  BattleAnim.play(enc7); // enc7.log 是 []，只同步
  enc7.log.push({ t: "hit", by: "player", damage: 7, crit: false, mult: 1, defHp: 93, defHpMax: 100 });
  BattleAnim.play(enc7);
  check("reset 后：新条目照常播", els["battle-wild-dmg"].textContent === "-7");
})();

// 元素缺失时静默跳过（不抛错）
(function () {
  const sandbox = { document: { getElementById() { return null; } }, setTimeout() { return 0; }, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/battle-anim.js"), "utf8"), sandbox, { filename: "js/battle-anim.js" });
  let threw = false;
  try {
    sandbox.PokeMem.BattleAnim.play({ log: [{ t: "hit", by: "player", damage: 5, crit: false, defHp: 90, defHpMax: 100 }], wild: { hp: 90, hpMax: 100 }, team: [{ hp: 100, hpMax: 100 }], activeIndex: 0 });
    sandbox.PokeMem.BattleAnim.play({ log: [{ t: "hit", by: "player", damage: 5, crit: false, defHp: 90, defHpMax: 100 }, { t: "ko", name: "x" }], wild: null, team: [{ hp: 100, hpMax: 100 }], activeIndex: 0 });
  } catch (e) { threw = true; }
  check("元素缺失：play 不抛错", !threw);
})();

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
