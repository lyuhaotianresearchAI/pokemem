// PokeMem 遭遇战状态机验证：node test/encounter.test.js
// 检查：组队、开场、伤害、先手、反击、交换、捕捉、结算、宝箱、撤退、战间选择
const { POKEDEX } = require("../pokedex.js");
const Gacha = require("../gacha.js");
const CardProgress = require("../card-progress.js");
const Scenes = require("../js/scenes.js");
const Encounter = require("../js/encounter.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}
function makeState() { return Gacha.newState(1000000); }
// 往卡册里塞一张指定等级的卡，返回它在 e.cards 里的下标
function addCard(state, id, level) {
  const row = POKEDEX[id - 1];
  const st = Gacha.statsForLevel(row, level);
  Gacha.addToCollection(state, { id, name: row[1], en: row[2], types: row[3], tier: row[4],
    prob: row[5], level, hp: st.hp, atk: st.atk, exp: 0, affection: 0 });
  return state.collection[id].cards.length - 1;
}
function setBalls(state, items) {
  const t = Gacha.ensureTrainer(state);
  Object.keys(items).forEach(k => { t.items[k] = items[k]; });
}
function noCrit() { return 0.99; } // 不暴击（野生暴击率最高 30% 也 roll 不中）

// 1. 伤害公式：50 级攻击 100，打中性 33、×2 是 67、×4 是 133、×0 保底 1、暴击 ×2
check("伤害：100 攻中性 33", Encounter.calcDamage(100, 1, false) === 33);
check("伤害：×2 是 67", Encounter.calcDamage(100, 2, false) === 67);
check("伤害：×4 是 133", Encounter.calcDamage(100, 4, false) === 133);
check("伤害：×0 保底 1", Encounter.calcDamage(100, 0, false) === 1);
check("伤害：暴击 ×2", Encounter.calcDamage(100, 1, true) === 66);

// 2. 经验：弱或平级 +1，强 +等级差
check("经验：平级 +1", Encounter.expGainFor(50, 50) === 1);
check("经验：野生强 5 级 +5", Encounter.expGainFor(55, 50) === 5);
check("经验：野生弱 +1", Encounter.expGainFor(40, 50) === 1);

// 3. 抓捕概率：满血 N 精灵球 5% 封底、剩 20% 血高级球 90% 封顶、半血 MR 高级球 28%
const wFull = { hp: 24, hpMax: 24, tier: "N" };
const wLow = { hp: 5, hpMax: 24, tier: "N" };
const wMR = { hp: 12, hpMax: 24, tier: "MR" };
check("抓捕：满血 N 精灵球 5%", Encounter.catchRate(wFull, "poke_ball") === 0.05);
check("抓捕：剩 20% 血 N 高级球 90%", Encounter.catchRate(wLow, "ultra_ball") === 0.9);
check("抓捕：半血 MR 高级球 28%", Math.abs(Encounter.catchRate(wMR, "ultra_ball") - 0.28) < 1e-9);
check("抓捕：非法球 0", Encounter.catchRate(wFull, "master_ball") === 0);

// 4. 组队
const s0 = makeState();
check("组队：空队报错", Encounter.buildTeam(s0, []).error === "empty");
check("组队：7 张报错",
  Encounter.buildTeam(s0, Array.from({ length: 7 }, () => ({ speciesId: 1, cardIndex: 0 }))).error === "tooMany");
check("组队：没这张卡报错", Encounter.buildTeam(s0, [{ speciesId: 1, cardIndex: 0 }]).error === "notOwned");
const c0 = addCard(s0, 1, 50);
const built = Encounter.buildTeam(s0, [{ speciesId: 1, cardIndex: c0 }]);
check("组队：1 张合法，进场满血（当前 HP = 最大 HP）", built.ok && built.team.length === 1 &&
  built.team[0].hp === built.team[0].card.hp && built.team[0].hpMax === built.team[0].card.hp &&
  built.team[0].name === "妙蛙种子");
check("组队：重复一张卡报错",
  Encounter.buildTeam(s0, [{ speciesId: 1, cardIndex: c0 }, { speciesId: 1, cardIndex: c0 }]).error === "duplicate");

// 5. 开场：坏场景、未解锁、正常
const s1 = makeState();
addCard(s1, 6, 50);
check("开场：坏场景报错", Encounter.startEncounter(s1, "volcano", [{ speciesId: 6, cardIndex: 0 }], noCrit).error === "badScene");
check("开场：森林未解锁（训练家 1 级）", Encounter.startEncounter(s1, "forest", [{ speciesId: 6, cardIndex: 0 }], noCrit).error === "locked");
const st1 = Encounter.startEncounter(s1, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0);
check("开场：草丛第一只 = 绿毛虫 Lv 5",
  st1.ok && st1.encounter.wild.id === 10 && st1.encounter.wild.level === 5 && st1.encounter.phase === "battle");
Gacha.ensureTrainer(s1).level = 5;
check("开场：训练家 5 级能进森林",
  Encounter.startEncounter(s1, "forest", [{ speciesId: 6, cardIndex: 0 }], () => 0).ok === true);

// 6. 攻击一击 KO：50 级喷火龙（火打虫 ×2，135 攻 → 90 伤）打 24 血绿毛虫
const s2 = makeState();
addCard(s2, 6, 50);
const e2 = Encounter.startEncounter(s2, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
const r2 = Encounter.attack(e2, s2, noCrit);
const hit2 = e2.log.find(l => l.t === "hit");
check("攻击 KO：一次打 90（×2），野生倒下，进战间选择",
  r2.ok && r2.wildFainted && r2.prompt && e2.phase === "prompt" && e2.wins === 1 && e2.kos === 1);
check("攻击 KO：战报记了 90 点伤害、×2、不暴击",
  hit2 && hit2.damage === 90 && hit2.mult === 2 && hit2.crit === false && hit2.defHp === 0);
check("攻击 KO：出战卡 +1 经验、+1 亲密度",
  e2.team[0].card.exp === 1 && e2.team[0].card.affection === 1);
check("攻击 KO：宝箱还没结算", e2.chest === null);

// 7. 先手 + 团灭：60 级快龙（221 攻）先攻打倒 5 级妙蛙种子和 5 级小火龙
const s3 = makeState();
addCard(s3, 1, 5);
addCard(s3, 4, 5);
const e3 = Encounter.startEncounter(s3, "grassland", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }], () => 0).encounter;
e3.wild = Scenes.makeWild(POKEDEX[148], 60); // 快龙 Lv 60
const r3 = Encounter.attack(e3, s3, noCrit);
check("先手：野生 60 级先攻，5 级妙蛙种子被打倒、等选下一只",
  r3.ok && r3.activeFainted && r3.needsPick && !r3.prompt && e3.phase === "battle");
check("先手：没选下一只时攻击报错", Encounter.attack(e3, s3, noCrit).error === "needPick");
check("先手：免费选下一只（小火龙）", Encounter.chooseNext(e3, 1).ok && e3.activeIndex === 1 && !e3.needsPick);
const r3b = Encounter.attack(e3, s3, noCrit);
check("团灭：第二只也被打倒，遭遇战结束、开空宝箱",
  r3b.wiped && e3.phase === "done" && e3.chest && e3.chest.crystals === 0 && e3.chest.items.length === 0);
check("团灭：宝箱只结算一次（结晶还是 0）",
  Encounter.settleChest(e3, s3, () => 0) === e3.chest && Gacha.ensureTrainer(s3).crystals === 0);

// 8. 反击：50 级妙蛙花打 50 级卡比兽（532 血），一击 44，野生反击 54
const s4 = makeState();
addCard(s4, 3, 50);
const e4 = Encounter.startEncounter(s4, "grassland", [{ speciesId: 3, cardIndex: 0 }], () => 0).encounter;
e4.wild = Scenes.makeWild(POKEDEX[142], 50); // 卡比兽 SSR Lv 50，生命 ×2
const hpBefore = e4.team[0].hp;
Encounter.attack(e4, s4, noCrit);
check("反击：野生剩 488 血（532−44）", e4.wild.hp === 488);
check("反击：出战卡掉 54 血（186→132）", e4.team[0].hp === hpBefore - 54 && e4.team[0].hp === 132);
check("反击：还在战斗阶段", e4.phase === "battle");

// 9. 抓捕成功：残血绿毛虫 + 高级球，球消耗、卡进册、出战卡拿奖励
const s5 = makeState();
addCard(s5, 6, 50);
setBalls(s5, { ultra_ball: 1 });
const e5 = Encounter.startEncounter(s5, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
e5.wild.hp = 1;
const r5 = Encounter.useBall(e5, s5, () => 0.5, "ultra_ball");
check("抓捕成功：抓到、进战间选择、胜场 +1",
  r5.ok && r5.caught && r5.prompt && e5.wins === 1 && e5.catches === 1);
check("抓捕成功：卡进册（绿毛虫 Lv 5、经验 0、亲密度 0）",
  s5.collection[10] && s5.collection[10].count === 1 && s5.collection[10].cards[0].level === 5 &&
  s5.collection[10].cards[0].exp === 0 && s5.collection[10].cards[0].affection === 0);
check("抓捕成功：高级球 1→0、出战卡 +1 经验 +1 亲密度",
  Gacha.ensureTrainer(s5).items.ultra_ball === 0 && e5.team[0].card.exp === 1 && e5.team[0].card.affection === 1);

// 10. 抓捕超上限：已有 5 只绿毛虫，再抓一只 5 级的，最弱的新抓变糖果
const s6 = makeState();
addCard(s6, 6, 50);
[10, 20, 30, 40, 50].forEach(lv => addCard(s6, 10, lv));
setBalls(s6, { ultra_ball: 1 });
const e6 = Encounter.startEncounter(s6, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
e6.wild.hp = 1;
const candyBefore = Gacha.ensureTrainer(s6).candy;
Encounter.useBall(e6, s6, () => 0.5, "ultra_ball");
check("抓捕超上限：还是 5 只、新抓的 5 级变 1 颗糖果",
  s6.collection[10].count === 5 && s6.collection[10].cards.length === 5 &&
  Gacha.ensureTrainer(s6).candy === candyBefore + 1 &&
  s6.collection[10].cards.every(c => c.level >= 10));

// 11. 抓捕失败：满血绿毛虫 + 精灵球，球消耗、野生反击打 1 点
const s7 = makeState();
addCard(s7, 6, 50);
const e7 = Encounter.startEncounter(s7, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
const hp7 = e7.team[0].hp;
const balls7 = Gacha.ensureTrainer(s7).items.poke_ball;
const r7 = Encounter.useBall(e7, s7, () => 0.99, "poke_ball");
check("抓捕失败：没抓到、精灵球 −1、野生反击打 1 点（虫打火/飞行 ×0.25）",
  r7.ok && !r7.caught && Gacha.ensureTrainer(s7).items.poke_ball === balls7 - 1 && e7.team[0].hp === hp7 - 1);
check("抓捕失败：没球时报错",
  Encounter.useBall(e7, s7, () => 0.5, "ultra_ball").error === "noBall");

// 12. 交换：换妙蛙花上场，野生反击打新上场的
const s8 = makeState();
addCard(s8, 6, 50);
addCard(s8, 3, 50);
const e8 = Encounter.startEncounter(s8, "grassland", [{ speciesId: 6, cardIndex: 0 }, { speciesId: 3, cardIndex: 0 }], () => 0).encounter;
e8.wild = Scenes.makeWild(POKEDEX[142], 50);
const r8 = Encounter.switchMember(e8, s8, noCrit, 1);
check("交换：换成妙蛙花、野生反击打 54（186→132）",
  r8.ok && e8.activeIndex === 1 && e8.team[1].hp === 132);
check("交换：换同一只报错", Encounter.switchMember(e8, s8, noCrit, 1).error === "badTarget");

// 13. 宝箱：击倒 3 + 高等级胜利 3 → 结晶 6；≥3 时 30% 出道具，≥5 时 60%
function chestState(kos, hl) {
  const s = makeState();
  addCard(s, 6, 50);
  const e = Encounter.startEncounter(s, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
  e.kos = kos; e.highLevelWins = hl;
  return { s, e };
}
let c1 = chestState(3, 3);
const ch1 = Encounter.settleChest(c1.e, c1.s, () => 0.2);
check("宝箱：3 击倒 + 3 越级 = 6 结晶、roll 0.2 < 30% 得 1 道具",
  ch1.crystals === 6 && ch1.items.length === 1 && Gacha.ensureTrainer(c1.s).crystals === 6);
let c2 = chestState(3, 3);
check("宝箱：roll 0.5 > 30% 没道具", Encounter.settleChest(c2.e, c2.s, () => 0.5).items.length === 0);
let c3 = chestState(0, 5);
check("宝箱：越级 5 时 roll 0.5 < 60% 得道具",
  Encounter.settleChest(c3.e, c3.s, () => 0.5).items.length === 1);
let c4 = chestState(0, 2);
check("宝箱：越级 2 时不出道具（哪怕 rng 是 0）",
  Encounter.settleChest(c4.e, c4.s, () => 0).items.length === 0 &&
  Encounter.settleChest(c4.e, c4.s, () => 0).crystals === 2);
check("宝箱：高等级抓到也算越级（不给基础结晶，只 +1）",
  (function () { const c = chestState(0, 1); return Encounter.settleChest(c.e, c.s, () => 0.99).crystals === 1; })());

// Task 29：每日结晶上限 100
const DAY1 = new Date(2026, 10, 17, 12);
const DAY2 = new Date(2026, 10, 18, 12);
check("每日上限：同一天内不同时间是同一天、隔天不同",
  Encounter.encounterDayKey(new Date(2026, 10, 17, 0, 1)) === Encounter.encounterDayKey(new Date(2026, 10, 17, 23, 59)) &&
  Encounter.encounterDayKey(DAY1) !== Encounter.encounterDayKey(DAY2));
let d1 = chestState(3, 2); // 应得 5
const chD1 = Encounter.settleChest(d1.e, d1.s, () => 0.9, DAY1);
check("每日上限：首场 5 结晶全拿、记到今天",
  chD1.crystals === 5 && chD1.capped === false &&
  Gacha.ensureTrainer(d1.s).encounterCrystalsToday === 5 &&
  Gacha.ensureTrainer(d1.s).encounterCrystalsDay === "2026-11-17");
let d2 = chestState(3, 2);
Gacha.ensureTrainer(d2.s).encounterCrystalsDay = "2026-11-17";
Gacha.ensureTrainer(d2.s).encounterCrystalsToday = 98;
const chD2 = Encounter.settleChest(d2.e, d2.s, () => 0.9, DAY1);
check("每日上限：今天已有 98、应得 5 只发 2、capped 为真",
  chD2.crystals === 2 && chD2.capped === true &&
  Gacha.ensureTrainer(d2.s).encounterCrystalsToday === 100 &&
  Gacha.ensureTrainer(d2.s).crystals === 2);
let d3 = chestState(0, 3); // 应得 3，越级 3 可 roll 道具
Gacha.ensureTrainer(d3.s).encounterCrystalsDay = "2026-11-17";
Gacha.ensureTrainer(d3.s).encounterCrystalsToday = 100;
let rngD3 = (function () { var seq = [0.1, 0.5]; return function () { return seq.shift(); }; })();
const chD3 = Encounter.settleChest(d3.e, d3.s, rngD3, DAY1);
check("每日上限：今天已满 100、结晶发 0 但道具照常 roll",
  chD3.crystals === 0 && chD3.capped === true && chD3.items.length === 1 &&
  Gacha.ensureTrainer(d3.s).crystals === 0);
let d4 = chestState(3, 2);
Gacha.ensureTrainer(d4.s).encounterCrystalsDay = "2026-11-16";
Gacha.ensureTrainer(d4.s).encounterCrystalsToday = 100;
const chD4 = Encounter.settleChest(d4.e, d4.s, () => 0.9, DAY1);
check("每日上限：跨天清零、昨天 100 不影响今天",
  chD4.crystals === 5 && chD4.capped === false &&
  Gacha.ensureTrainer(d4.s).encounterCrystalsDay === "2026-11-17" &&
  Gacha.ensureTrainer(d4.s).encounterCrystalsToday === 5);

// Task 31：流星——本次遭遇战结算奖励翻倍（chestMult）
let m1 = chestState(3, 3); // 应得 6
m1.e.mods = { chestMult: 2 };
const chM1 = Encounter.settleChest(m1.e, m1.s, () => 0.9);
check("流星：3 击倒 + 3 越级 ×2 = 12 结晶、没道具（roll 0.9）",
  chM1.crystals === 12 && chM1.items.length === 0 && Gacha.ensureTrainer(m1.s).crystals === 12);
let m2 = chestState(0, 5); // 应得 5，越级 5 可 roll 道具
m2.e.mods = { chestMult: 2 };
const chM2 = Encounter.settleChest(m2.e, m2.s, () => 0);
check("流星：越级 5 roll 中道具 → 同一道具给两份、结晶 ×2 = 10",
  chM2.items.length === 2 && chM2.items[0] === chM2.items[1] && chM2.crystals === 10);
let m3 = chestState(3, 2); // 应得 5
m3.e.mods = { chestMult: 2 };
Gacha.ensureTrainer(m3.s).encounterCrystalsDay = "2026-11-17";
Gacha.ensureTrainer(m3.s).encounterCrystalsToday = 96;
const chM3 = Encounter.settleChest(m3.e, m3.s, () => 0.9, DAY1);
check("流星：翻倍后仍受每日上限封顶（应得 10、只剩 4 → 发 4、capped）",
  chM3.crystals === 4 && chM3.capped === true &&
  Gacha.ensureTrainer(m3.s).encounterCrystalsToday === 100);

// Task 31：到上限——宝箱被封顶的部分改给亲密度 +2（满了无效）
let a1 = chestState(3, 2); // 应得 5
Gacha.ensureTrainer(a1.s).encounterCrystalsDay = "2026-11-17";
Gacha.ensureTrainer(a1.s).encounterCrystalsToday = 98;
const chA1 = Encounter.settleChest(a1.e, a1.s, () => 0.9, DAY1);
check("到上限：宝箱应得 5 只发 2、被封顶的部分改给出战卡亲密度 +2",
  chA1.crystals === 2 && chA1.capped === true && chA1.affection === 2 &&
  a1.e.team[0].card.affection === 2);
let a2 = chestState(3, 2);
Gacha.ensureTrainer(a2.s).encounterCrystalsDay = "2026-11-17";
Gacha.ensureTrainer(a2.s).encounterCrystalsToday = 98;
a2.e.team[0].card.affection = 100;
const chA2 = Encounter.settleChest(a2.e, a2.s, () => 0.9, DAY1);
check("到上限：出战卡亲密度满 10 级、宝箱 +2 无效",
  chA2.crystals === 2 && chA2.affection === 0 && a2.e.team[0].card.affection === 100);
let a3 = chestState(3, 3);
const chA3 = Encounter.settleChest(a3.e, a3.s, () => 0.9);
check("没到上限：宝箱不转亲密度",
  chA3.crystals === 6 && chA3.capped === false && chA3.affection === 0);

// 14. 撤退：不挨打、按当前进度开宝箱
const s9 = makeState();
addCard(s9, 3, 50);
const e9 = Encounter.startEncounter(s9, "grassland", [{ speciesId: 3, cardIndex: 0 }], () => 0).encounter;
e9.wild = Scenes.makeWild(POKEDEX[142], 50);
Encounter.attack(e9, s9, noCrit);
const hp9 = e9.team[0].hp;
const r9 = Encounter.retreat(e9, s9, noCrit);
check("撤退：结束、宝箱 0 结晶、出战卡血量不变（野生没攻击）",
  r9.ok && e9.phase === "done" && r9.chest.crystals === 0 && e9.team[0].hp === hp9);

// 15. 战间选择：继续前进刷下一只（胜场 1 → 草丛 Lv 7）；结束开宝箱
const s10 = makeState();
addCard(s10, 6, 50);
const e10 = Encounter.startEncounter(s10, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
Encounter.attack(e10, s10, noCrit); // KO，进 prompt
check("战间：KO 后在 prompt 阶段", e10.phase === "prompt");
const r10 = Encounter.continueRun(e10, s10, () => 0.5); // 0.5 ≥ 0.30 → 战斗（Task 32：继续前进是 70/30 roll）
check("继续前进：刷出下一只 Lv 7（基础 5 + 2×1）、回战斗阶段",
  r10.ok && e10.wild.level === 7 && e10.phase === "battle");
Encounter.attack(e10, s10, noCrit); // 再 KO 一只（Lv 7 绿毛虫，90 伤照样秒）
const r10b = Encounter.endRun(e10, s10, noCrit);
check("结束遭遇战：2 击倒 = 2 结晶", r10b.ok && r10b.chest.crystals === 2 && e10.phase === "done");

// 16. 战斗结算升一级：50 级喷火龙 49/50 经验，打赢一只 +1 → 51 级、经验 0
const s11 = makeState();
const idx11 = addCard(s11, 6, 50);
s11.collection[6].cards[idx11].exp = 49;
const e11 = Encounter.startEncounter(s11, "grassland", [{ speciesId: 6, cardIndex: idx11 }], () => 0).encounter;
Encounter.attack(e11, s11, noCrit);
const card11 = s11.collection[6].cards[idx11];
const st51 = Gacha.statsForLevel(POKEDEX[5], 51);
check("结算升级：50 级 49 经验 +1 → 51 级、经验 0、HP/攻击按 51 级重算",
  card11.level === 51 && card11.exp === 0 && card11.hp === st51.hp && card11.atk === st51.atk);
check("结算升级：亲密度也 +1", card11.affection === 1);
check("结算升级：队员最大 HP 跟着升到 51 级，当前 HP 不变（还是 184）",
  e11.team[0].hpMax === st51.hp && e11.team[0].hp === 184);
// 糖果升级的同步：直接改卡的最大 HP（模拟详情页喂糖果），刷一遍后队员最大 HP 跟上、当前 HP 不变
card11.hp = st51.hp + 10;
Encounter.refreshTeamMaxHp(e11);
check("糖果升级同步：refreshTeamMaxHp 后最大 HP 跟上、当前 HP 不变",
  e11.team[0].hpMax === st51.hp + 10 && e11.team[0].hp === 184);

// 17. Task 32：事件接入——nextStep 70/30、战斗类事件、擂台、修正值、战利品
function seq32(vals) { var i = 0; return function () { return vals[Math.min(i++, vals.length - 1)]; }; }
// 打赢第一只进 prompt 阶段的遭遇战（wild.hp 先置 1，保证一击 KO）
function promptEnc(sceneId, trainerLevel) {
  const s = makeState();
  addCard(s, 6, 50);
  if (trainerLevel) Gacha.ensureTrainer(s).level = trainerLevel;
  const e = Encounter.startEncounter(s, sceneId, [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
  e.wild.hp = 1;
  Encounter.attack(e, s, noCrit);
  return { s: s, e: e };
}
// 17a. nextStep：70% 战斗 / 30% 事件
let n1 = promptEnc("grassland");
const ns1 = Encounter.nextStep(n1.e, n1.s, () => 0.5);
check("nextStep：rng 0.5 ≥ 0.30 → 战斗，下一只 Lv 7",
  ns1.ok && ns1.phase === "battle" && n1.e.phase === "battle" && n1.e.wild.level === 7);
let n2 = promptEnc("grassland");
const ns2 = Encounter.nextStep(n2.e, n2.s, seq32([0.1, 0.5, 0]));
check("nextStep：rng 0.1 < 0.30 → 事件，草丛第一个是路见不平（战斗类）",
  ns2.ok && ns2.phase === "event" && n2.e.phase === "event" &&
  n2.e.event.event.id === "help-stranger" && n2.e.event.kind === "battle");
check("nextStep：战斗类事件未打之前不能继续前进",
  Encounter.nextStep(n2.e, n2.s, () => 0.5).error === "eventBattlePending");
check("nextStep：战斗阶段不能推进", Encounter.nextStep(n1.e, n1.s, () => 0.5).error === "notInPrompt");
let n3 = promptEnc("city", 15);
const ns3 = Encounter.nextStep(n3.e, n3.s, seq32([0.1, 0.5, 0.35]));
check("nextStep：城市事件 roll 到好心人指导（增益），攻击 +5、进 event 阶段",
  ns3.ok && ns3.phase === "event" && n3.e.event.event.id === "kind-mentor" &&
  n3.e.mods.atkBonus === 5);
const ns3b = Encounter.nextStep(n3.e, n3.s, () => 0.5);
check("nextStep：非战斗事件屏上可以继续前进（再 roll 到战斗）",
  ns3b.ok && ns3b.phase === "battle" && n3.e.phase === "battle");
// 17b. 训练师挑战：开打、等级 +2、胜场战利品 2 结晶
let d = promptEnc("city", 15);
Encounter.nextStep(d.e, d.s, seq32([0.1, 0.5, 0.1]));
check("训练师挑战：roll 到了", d.e.event.event.id === "trainer-duel");
const ds = Encounter.startEventBattle(d.e, d.s, () => 0);
check("训练师挑战：开打，野生 Lv 20（基础 18 + 2）、战利品记 2 结晶",
  ds.ok && d.e.phase === "battle" && d.e.wild.level === 20 && d.e.pendingBonus.crystals === 2);
d.e.wild.hp = 1;
const dr = Encounter.attack(d.e, d.s, noCrit);
check("训练师挑战：打赢进 prompt、战利品 2 结晶到账、事件清掉",
  dr.prompt === true && dr.bonus && dr.bonus.crystals === 2 &&
  Gacha.ensureTrainer(d.s).crystals === 2 && d.e.pendingBonus === null && d.e.event === null);
check("startEventBattle：不在事件战斗屏上报错",
  Encounter.startEventBattle(d.e, d.s, () => 0).error === "notInEventBattle");
// 17c. 擂台：连打 2 场，最后一场才发 5 结晶
let a = promptEnc("city", 15);
Encounter.nextStep(a.e, a.s, seq32([0.1, 0.5, 0.18]));
check("擂台：roll 到了", a.e.event.event.id === "arena");
Encounter.startEventBattle(a.e, a.s, () => 0);
check("擂台：第一场开打，还剩 1 场", a.e.arenaRemaining === 1);
a.e.wild.hp = 1;
const ar1 = Encounter.attack(a.e, a.s, noCrit);
check("擂台：第一场打赢不进 prompt、直接刷第二场",
  ar1.arena === true && ar1.prompt === false && a.e.phase === "battle" &&
  a.e.arenaRemaining === 0 && !!a.e.wild);
a.e.wild.hp = 1;
const ar2 = Encounter.attack(a.e, a.s, noCrit);
check("擂台：第二场打赢进 prompt、战利品 5 结晶到账",
  ar2.prompt === true && ar2.bonus && ar2.bonus.crystals === 5 &&
  Gacha.ensureTrainer(a.s).crystals === 5);
// 17d. 修正值进战斗
// 取玩家最近一次攻击的 log（promptEnc 的第一场也有 hit，find 会取到旧的）
function lastHit(e) { for (var i = e.log.length - 1; i >= 0; i--) { var l = e.log[i]; if (l.t === "hit" && l.by === "player") return l; } return null; }
// 攻击 +5：Lv 50 喷火龙打 Lv 5 野生，基准 90 伤（×2），+5 攻 → 93 伤
let k1 = promptEnc("grassland");
k1.e.mods.atkBonus = 5;
Encounter.continueRun(k1.e, k1.s, () => 0.5);
Encounter.attack(k1.e, k1.s, noCrit);
const hit1 = lastHit(k1.e);
check("攻击修正：攻击 +5 → 伤害 90 变 93", hit1 && hit1.damage === 93);
// 暴击 +100%：必暴击，伤害翻倍
let k2 = promptEnc("grassland");
k2.e.mods.critBonus = 100;
Encounter.continueRun(k2.e, k2.s, () => 0.5);
Encounter.attack(k2.e, k2.s, function () { return 0.5; });
const hitCrit = lastHit(k2.e);
check("暴击修正：暴击率 +100% → 必暴击、伤害 180", hitCrit && hitCrit.crit === true && hitCrit.damage === 180);
// 伤害 ×1.5：90 → 135，打完清零
let k3 = promptEnc("grassland");
k3.e.mods.damageMultNext = 1.5;
Encounter.continueRun(k3.e, k3.s, () => 0.5);
Encounter.attack(k3.e, k3.s, noCrit);
const hit3 = lastHit(k3.e);
check("伤害修正：下一场伤害 ×1.5 → 135，打完清零",
  hit3 && hit3.damage === 135 && k3.e.mods.damageMultNext === 1);
// 捕捉 ×2：满血 N 精灵球本来 5%，×2 后 10%，rng 0.07 能抓住；没修正抓不住
function catchSetup(mult) {
  const s = makeState();
  addCard(s, 6, 50);
  setBalls(s, { ultra_ball: 1 });
  const e = Encounter.startEncounter(s, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
  e.mods.catchMultNext = mult;
  return { s: s, e: e };
}
let cA = catchSetup(2);
const crA = Encounter.useBall(cA.e, cA.s, function () { return 0.07; }, "ultra_ball");
check("捕捉修正：捕捉率 ×2 后 0.07 能抓住满血野生", crA.caught === true);
let cB = catchSetup(1);
const crB = Encounter.useBall(cB.e, cB.s, function () { return 0.07; }, "ultra_ball");
check("捕捉修正：没修正时 0.07 抓不住（5% 封底）", crB.caught === false);
// 先手：野生 60 级快龙本来先攻，forceFirstNext 让玩家先攻；forceWildFirstNext 让野生先攻
let f1 = makeState();
addCard(f1, 6, 50);
const ef1 = Encounter.startEncounter(f1, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
ef1.wild = Scenes.makeWild(POKEDEX[148], 60);
ef1.mods.forceFirstNext = true;
Encounter.attack(ef1, f1, noCrit);
const firstHit1 = ef1.log.find(function (l) { return l.t === "hit"; });
check("先手修正：forceFirstNext 时玩家先攻", firstHit1 && firstHit1.by === "player");
let f2 = makeState();
addCard(f2, 6, 50);
const ef2 = Encounter.startEncounter(f2, "grassland", [{ speciesId: 6, cardIndex: 0 }], () => 0).encounter;
ef2.mods.forceWildFirstNext = true;
Encounter.attack(ef2, f2, noCrit);
const firstHit2 = ef2.log.find(function (l) { return l.t === "hit"; });
check("先手修正：forceWildFirstNext 时野生先攻（本来玩家先攻）",
  firstHit2 && firstHit2.by === "wild");
// 迷路：本场剩余野生等级 +3，下一只 7 → 10
let w1 = promptEnc("grassland");
w1.e.mods.wildLevelBonus = 3;
Encounter.continueRun(w1.e, w1.s, () => 0.5);
check("等级修正：wildLevelBonus +3 → 下一只 Lv 10", w1.e.wild.level === 10);
// 稀有度下限：胜场 3 时下一只至少 SR，用完清零
let t1 = promptEnc("grassland");
t1.e.wins = 3;
t1.e.mods.minTierNext = "SR";
Encounter.continueRun(t1.e, t1.s, () => 0.5);
check("稀有度下限：minTierNext SR → 下一只就是 SR、用完清零",
  t1.e.wild.tier === "SR" && t1.e.mods.minTierNext === null);
// 17e. 战利品结晶到上限改亲密度 +1
let b1 = promptEnc("city", 15);
const bt1 = Gacha.ensureTrainer(b1.s);
bt1.encounterCrystalsDay = Gacha.encounterDayKey(new Date(2026, 10, 23));
bt1.encounterCrystalsToday = 100;
Encounter.nextStep(b1.e, b1.s, seq32([0.1, 0.5, 0.1]));
Encounter.startEventBattle(b1.e, b1.s, () => 0);
b1.e.wild.hp = 1;
const br1 = Encounter.attack(b1.e, b1.s, noCrit, new Date(2026, 10, 23)); // 固定日期：战利品按 11-23 这天算上限
check("战利品封顶：到上限时 2 结晶发 0、改亲密度 +1",
  br1.bonus && br1.bonus.crystals === 0 && br1.bonus.affection === 1 &&
  b1.e.team[0].card.affection === 3); // 第一场胜 +1，决斗胜 +1，转换 +1
let b2 = promptEnc("city", 15);
const bt2 = Gacha.ensureTrainer(b2.s);
bt2.encounterCrystalsDay = Gacha.encounterDayKey(new Date(2026, 10, 23));
bt2.encounterCrystalsToday = 100;
b2.e.team[0].card.affection = 100;
Encounter.nextStep(b2.e, b2.s, seq32([0.1, 0.5, 0.1]));
Encounter.startEventBattle(b2.e, b2.s, () => 0);
b2.e.wild.hp = 1;
const br2 = Encounter.attack(b2.e, b2.s, noCrit, new Date(2026, 10, 23)); // 固定日期：战利品按 11-23 这天算上限
check("战利品封顶：亲密度满 10 级、转换无效",
  br2.bonus && br2.bonus.crystals === 0 && !br2.bonus.affection);
// 17f. 事件屏上继续 / 结束
let e1 = promptEnc("city", 15);
Encounter.nextStep(e1.e, e1.s, seq32([0.1, 0.5, 0.35])); // 好心人指导，非战斗事件
check("事件屏：非战斗事件上可以结束遭遇战",
  Encounter.endRun(e1.e, e1.s, () => 0.9).ok && e1.e.phase === "done");
check("结束：战斗阶段不能 endRun", Encounter.endRun(n1.e, n1.s, () => 0.9).error === "notInPrompt");
// 17g. 钓鱼（只要水系）/ 蛋（只要 N）
let g1 = promptEnc("stream", 10);
g1.e.event = { kind: "battle", battle: { levelBonus: 0, typeFilter: "water" } };
g1.e.phase = "event";
const gr1 = Encounter.startEventBattle(g1.e, g1.s, () => 0);
check("钓鱼：刷出的野生是水系", gr1.ok && g1.e.wild.types.indexOf("水") >= 0);
let g2 = promptEnc("grassland");
g2.e.event = { kind: "battle", battle: { levelBonus: 0, tierCap: "N" } };
g2.e.phase = "event";
const gr2 = Encounter.startEventBattle(g2.e, g2.s, () => 0);
check("蛋：刷出的野生是 N", gr2.ok && g2.e.wild.tier === "N");

// 17h. Task 34 保底：连赢 3 场后必定出事件（30% 概率照常，只在 3 场没出时兜底）
function winOne(e, s) { e.wild.hp = 1; Encounter.attack(e, s, noCrit); }
let g = promptEnc("grassland");
check("保底：开场打赢 1 场，battlesSinceEvent 是 1", g.e.battlesSinceEvent === 1);
Encounter.nextStep(g.e, g.s, () => 0.5); // roll 到战斗
winOne(g.e, g.s); // 连赢 2 场
Encounter.nextStep(g.e, g.s, () => 0.5); // roll 到战斗
winOne(g.e, g.s); // 连赢 3 场
const gs = Encounter.nextStep(g.e, g.s, seq32([0.5, 0]));
check("保底：连赢 3 场后，rng 0.5（本来会 roll 战斗）也必定出事件、计数清零",
  gs.ok && gs.phase === "event" && g.e.event.event.id === "help-stranger" && g.e.battlesSinceEvent === 0);
// 保底循环：非战斗事件后计数从 0 重来，2 场时不提前触发，3 场后再次保底
let c = promptEnc("city", 15);
c.e.battlesSinceEvent = 3; // 模拟已连赢 3 场
const cs = Encounter.nextStep(c.e, c.s, seq32([0.5, 0.35]));
check("保底：计数 3 时直接出事件（城市好心人指导）、计数清零",
  cs.ok && cs.phase === "event" && c.e.event.event.id === "kind-mentor" && c.e.battlesSinceEvent === 0);
Encounter.nextStep(c.e, c.s, () => 0.5); // 非战斗事件屏上继续前进 → 战斗
winOne(c.e, c.s); // 连赢 1 场
Encounter.nextStep(c.e, c.s, () => 0.5);
winOne(c.e, c.s); // 连赢 2 场
const cs2 = Encounter.nextStep(c.e, c.s, () => 0.5);
check("保底：连赢 2 场时不提前触发（rng 0.5 仍是战斗）",
  cs2.ok && cs2.phase === "battle" && c.e.battlesSinceEvent === 2);
winOne(c.e, c.s); // 连赢 3 场
const cs3 = Encounter.nextStep(c.e, c.s, seq32([0.5, 0.35]));
check("保底：再连赢 3 场后再次必定出事件、计数清零",
  cs3.ok && cs3.phase === "event" && c.e.battlesSinceEvent === 0);

// 18. Task 35：闪避率——只有我方有；基础 = 高出野生的等级差（低了是 0），亲密度每级 +0.5%，不设上限
// 公式单测
check("闪避率：Lv 50 亲密度 0 级打 Lv 40 → 10%", CardProgress.evasionRateForCard({ level: 50, affection: 0 }, 40) === 10);
check("闪避率：Lv 30 亲密度 50 点（5 级）打 Lv 45 → 2.5%", CardProgress.evasionRateForCard({ level: 30, affection: 50 }, 45) === 2.5);
check("闪避率：Lv 20 亲密度 30 点（3 级）打同级 Lv 20 → 1.5%", CardProgress.evasionRateForCard({ level: 20, affection: 30 }, 20) === 1.5);
check("闪避率：Lv 97 亲密度 100 点（10 级）打 Lv 5 → 97%（不设上限）", CardProgress.evasionRateForCard({ level: 97, affection: 100 }, 5) === 97);
check("闪避率：同级、亲密度 0 → 0", CardProgress.evasionRateForCard({ level: 10, affection: 0 }, 10) === 0);
check("闪避率：坏卡 → 0", CardProgress.evasionRateForCard(null, 5) === 0);
// 出战卡指定等级/亲密度、野生指定种类/等级的遭遇战
function evasionEnc(activeLevel, activeAffection, wildId, wildLevel) {
  const s = makeState();
  const ci = addCard(s, 6, activeLevel);
  s.collection[6].cards[ci].affection = activeAffection;
  const e = Encounter.startEncounter(s, "grassland", [{ speciesId: 6, cardIndex: ci }], () => 0).encounter;
  e.wild = Scenes.makeWild(POKEDEX[wildId - 1], wildLevel);
  return { s: s, e: e };
}
function seqCycle(vals) { var i = 0; return function () { return vals[i++ % vals.length]; }; } // 循环取数
// 闪避：Lv 50 喷火龙打 Lv 40 卡比兽（闪避 10%），rng 0.05 闪中——不掉血、记 miss、我方攻击照常打中
let ev1 = evasionEnc(50, 0, 143, 40);
const ev1hp = ev1.e.team[0].hp;
Encounter.attack(ev1.e, ev1.s, seq32([0.99, 0.05]));
const ev1miss = ev1.e.log.find(l => l.t === "miss");
check("闪避：反击闪中——不掉血、记 miss、我方攻击照常命中",
  !!ev1miss && ev1miss.by === "wild" && ev1.e.team[0].hp === ev1hp && ev1.e.wild.hp < 430 && ev1.e.phase === "battle");
// 没闪中：rng 0.5 ≥ 10% → 打中，卡比兽 Lv 40 攻 130、中性 43 伤（184→141）
let ev2 = evasionEnc(50, 0, 143, 40);
Encounter.attack(ev2.e, ev2.s, seq32([0.99, 0.5, 0.99]));
check("闪避：没闪中——反击打中 43 伤（184→141）、记 hit 不记 miss",
  ev2.e.team[0].hp === 141 && ev2.e.log.some(l => l.t === "hit" && l.by === "wild") && !ev2.e.log.some(l => l.t === "miss"));
// 等级低了基础是 0，只剩亲密度：Lv 30 亲密度 5 级打 Lv 45 卡比兽（2.5%）——
// 野生等级高所以野生先攻，第一个 rng 是闪避 roll：0.02 闪中
let ev3 = evasionEnc(30, 50, 143, 45);
const ev3hp = ev3.e.team[0].hp;
Encounter.attack(ev3.e, ev3.s, seq32([0.02, 0.99]));
check("闪避：等级低了基础 0、亲密度 2.5% 闪中——不掉血",
  ev3.e.log.some(l => l.t === "miss") && ev3.e.team[0].hp === ev3hp);
// 同上，rng 0.03 ≥ 2.5% → 打中，卡比兽 Lv 45 攻 145、中性 48 伤（114→66）
let ev4 = evasionEnc(30, 50, 143, 45);
Encounter.attack(ev4.e, ev4.s, seq32([0.03, 0.99, 0.99]));
check("闪避：亲密度 2.5% 没闪中——反击打中 48 伤（114→66）", ev4.e.team[0].hp === 66);
// 先攻闪避：野生 Lv 60 快龙先攻，Lv 50 喷火龙亲密度 10 级（5%），rng 0.04 闪中——
// 野生先攻落空，我方攻击照常打出（火打龙 0.5 倍：135 攻 → 23 伤，快龙 SSR 血量 ×2：470→447），野生本回合不再攻击
let ev5 = evasionEnc(50, 100, 149, 60);
Encounter.attack(ev5.e, ev5.s, seq32([0.04, 0.99]));
check("闪避：先攻闪中——我方不掉血、我方攻击照常命中（快龙 470→447）、野生本回合不再攻击",
  ev5.e.log.some(l => l.t === "miss") && ev5.e.team[0].hp === 184 && ev5.e.wild.hp === 447 && ev5.e.phase === "battle");
// 抓捕失败后的反击也能闪：Lv 50 打 Lv 5 绿毛虫（45%），rng 0.5 抓不住、0.1 闪中
let ev6 = evasionEnc(50, 0, 10, 5);
const ev6hp = ev6.e.team[0].hp;
const rEv6 = Encounter.useBall(ev6.e, ev6.s, seq32([0.5, 0.1]), "poke_ball");
check("闪避：抓捕失败后的反击闪中——没抓到、不掉血、记 miss、还在战斗",
  rEv6.ok && !rEv6.caught && ev6.e.log.some(l => l.t === "miss") && ev6.e.team[0].hp === ev6hp && ev6.e.phase === "battle");
// 闪避为 0 时不掷（不消耗 rng）：Lv 50 妙蛙花打 Lv 50 卡比兽（0%），循环 rng [0.01, 0.99]——
// 玩家暴击率 0% 吃 0.01 不暴击；野生暴击若拿到 0.99 则不暴击（54 伤、186→132）；
// 若闪避白白消耗了一次 rng，野生暴击就会拿到循环回来的 0.01 而暴击（108 伤、186→78）
const sF = makeState();
addCard(sF, 3, 50);
const eF = Encounter.startEncounter(sF, "grassland", [{ speciesId: 3, cardIndex: 0 }], () => 0).encounter;
eF.wild = Scenes.makeWild(POKEDEX[142], 50);
Encounter.attack(eF, sF, seqCycle([0.01, 0.99]));
check("闪避：闪避为 0 时不消耗 rng（野生暴击 roll 仍是 0.99、不暴击，186→132）", eF.team[0].hp === 132);
// 换人：换上 Lv 50 的卡，野生打新上场的也能闪（Lv 50 打 Lv 5，45%，rng 0.1 闪中）
const sW = makeState();
addCard(sW, 6, 5);
const ciW = addCard(sW, 6, 50);
const eW = Encounter.startEncounter(sW, "grassland", [{ speciesId: 6, cardIndex: 0 }, { speciesId: 6, cardIndex: ciW }], () => 0).encounter;
const wHp = eW.team[1].hp;
Encounter.switchMember(eW, sW, seq32([0.1]), 1);
check("闪避：换人后野生打新上场的也能闪——新卡不掉血、记 miss",
  eW.activeIndex === 1 && eW.team[1].hp === wHp && eW.log.some(l => l.t === "miss"));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
