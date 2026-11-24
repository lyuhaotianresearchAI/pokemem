// PokeMem 随机路线事件验证：node test/encounter-events.test.js
// 检查（Task 31）：43 种事件表完整性、各场景事件数、按权重 roll、
// 封顶替换（给结晶的事件 → 流星）、各项效果结算（回血/复活/减员/增益/减益/奖励）
const { POKEDEX } = require("../pokedex.js");
const Gacha = require("../gacha.js");
const CardProgress = require("../card-progress.js");
const Scenes = require("../js/scenes.js");
const Encounter = require("../js/encounter.js");
const Events = require("../js/encounter-events.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}
function makeState() { return Gacha.newState(1000000); }
function addCard(state, id, level) {
  const row = POKEDEX[id - 1];
  const st = Gacha.statsForLevel(row, level);
  Gacha.addToCollection(state, { id, name: row[1], en: row[2], types: row[3], tier: row[4],
    prob: row[5], level, hp: st.hp, atk: st.atk, exp: 0, affection: 0 });
  return state.collection[id].cards.length - 1;
}
// 用真实组队建一支队伍，再包成事件测试用的 enc（Task 32 的 startEncounter 还没接事件）
function makeEnc(state, sceneId, picks) {
  const built = Encounter.buildTeam(state, picks);
  if (!built.ok) throw new Error("夹具组队失败：" + built.error);
  return { sceneId: sceneId, team: built.team, activeIndex: 0, wins: 0,
    mods: null, needsPick: false, wild: null, phase: "event", log: [] };
}
function seq(values) { let i = 0; return function () { return values[Math.min(values.length - 1, i++)]; }; }

// 1. 事件表完整性
check("事件表：共 43 种", Events.EVENTS.length === 43);
const ids = Events.EVENTS.map(function (e) { return e.id; });
check("事件表：id 唯一", new Set(ids).size === 43);
const sceneIds = Scenes.SCENES.map(function (s) { return s.id; });
check("事件表：场景 id 都在场景表里",
  Events.EVENTS.every(function (e) { return !e.scenes || e.scenes.every(function (s) { return sceneIds.indexOf(s) >= 0; }); }));
check("事件表：kind 都合法",
  Events.EVENTS.every(function (e) { return ["battle", "heal", "buff", "debuff", "reward"].indexOf(e.kind) >= 0; }));
check("事件表：权重都合法",
  Events.EVENTS.every(function (e) { return ["common", "uncommon", "rare"].indexOf(e.weight) >= 0; }));
check("事件表：中英名 + 文案都有",
  Events.EVENTS.every(function (e) { return e.zh && e.en && e.text && e.text.zh && e.text.en; }));
check("事件表：战斗类有 battle 参数、非战斗类有 fx",
  Events.EVENTS.every(function (e) { return e.kind === "battle" ? !!e.battle : !!e.fx; }));
check("事件表：kind 计数 battle 10 / heal 6 / buff 10 / debuff 9 / reward 8",
  Events.EVENTS.filter(function (e) { return e.kind === "battle"; }).length === 10 &&
  Events.EVENTS.filter(function (e) { return e.kind === "heal"; }).length === 6 &&
  Events.EVENTS.filter(function (e) { return e.kind === "buff"; }).length === 10 &&
  Events.EVENTS.filter(function (e) { return e.kind === "debuff"; }).length === 9 &&
  Events.EVENTS.filter(function (e) { return e.kind === "reward"; }).length === 8);
// （kind 按机制分：场景特色 8 种里，钓鱼/冲浪/蛋是 battle，沙暴/雪崩/蘑菇是 debuff，
// 选美是 buff，化石是 reward；设计稿的 7/6/9/6/7/8 是按主题分的）

// 2. 各场景事件数（设计稿里的分布：每个场景 18–23 种）
const expectedCounts = { grassland: 20, forest: 22, stream: 21, city: 22, desert: 19,
  cave: 23, ocean: 20, glacier: 18, "champions-road": 21 };
Object.keys(expectedCounts).forEach(function (sc) {
  check("场景事件数：" + sc + " = " + expectedCounts[sc],
    Events.eventsForScene(sc).length === expectedCounts[sc]);
});

// 3. roll：确定性 + 封顶替换
const sRoll = makeState();
addCard(sRoll, 1, 50); addCard(sRoll, 4, 50);
const encRoll = makeEnc(sRoll, "grassland", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
check("roll：第一轮没中流星、第二轮 rng 0 → 表里第一个草丛事件（路见不平）",
  Events.rollEvent(encRoll, sRoll, seq([0.5, 0])).id === "help-stranger");
check("roll：rng 0.999 → 表里最后一个草丛事件（草丛里的蛋）",
  Events.rollEvent(encRoll, sRoll, function () { return 0.999; }).id === "grass-egg");
check("流星：1% 独立 roll，rng 0.005 → 流星",
  Events.rollEvent(encRoll, sRoll, function () { return 0.005; }).id === "meteor");
check("流星：不在权重池里——第一轮没中后怎么 roll 都不是流星",
  [0.1, 0.3, 0.5, 0.7, 0.9, 0.99].every(function (r) {
    return Events.rollEvent(encRoll, sRoll, seq([0.5, r])).id !== "meteor";
  }));
// 城市权重池合计 150（1 人队时难走的道路不在候选里，流星走独立 1% 不进池），
// 训练师挑战占 [10, 20)：rng 0.1 落在里面
const sCap = makeState();
addCard(sCap, 1, 50);
const encCap = makeEnc(sCap, "city", [{ speciesId: 1, cardIndex: 0 }]);
const duelRng = function () { return 0.1; };
check("roll：没到上限时 roll 到训练师挑战",
  Events.rollEvent(encCap, sCap, duelRng).id === "trainer-duel");
const tCap = Gacha.ensureTrainer(sCap);
tCap.encounterCrystalsDay = Gacha.encounterDayKey(new Date(2026, 10, 23));
tCap.encounterCrystalsToday = 100;
check("roll：到上限时给结晶的事件照常出现（不再替换成流星）",
  Events.rollEvent(encCap, sCap, duelRng, new Date(2026, 10, 23)).id === "trainer-duel");
// 掉钱包占 [115, 125)：rng 0.8 落在里面（直接给结晶的事件也要能替换）
const walletRng = function () { return 0.8; };
const sCap2 = makeState();
addCard(sCap2, 1, 50);
const encCap2 = makeEnc(sCap2, "city", [{ speciesId: 1, cardIndex: 0 }]);
check("roll：没到上限时 roll 到掉钱包",
  Events.rollEvent(encCap2, sCap2, walletRng).id === "lost-wallet");
const tCap2 = Gacha.ensureTrainer(sCap2);
tCap2.encounterCrystalsDay = Gacha.encounterDayKey(new Date(2026, 10, 23));
tCap2.encounterCrystalsToday = 100;
check("roll：到上限时直接给结晶的事件照常出现",
  Events.rollEvent(encCap2, sCap2, walletRng, new Date(2026, 10, 23)).id === "lost-wallet");
check("封顶判断：今天 100 = 到上限，明天 = 没到",
  Events.isCappedToday(sCap, new Date(2026, 10, 23)) === true &&
  Events.isCappedToday(sCap, new Date(2026, 10, 24)) === false);
check("给结晶判断：钱包/训练师挑战算，宝可梦中心不算",
  Events.grantsCrystals(Events.eventById("lost-wallet")) === true &&
  Events.grantsCrystals(Events.eventById("trainer-duel")) === true &&
  Events.grantsCrystals(Events.eventById("pokemon-center")) === false);

// 3b. 到上限：事件结晶改亲密度 +1（满了无效）
const DAY23 = new Date(2026, 10, 23, 12);
function cappedState() {
  const s = makeState();
  addCard(s, 1, 50);
  const t = Gacha.ensureTrainer(s);
  t.encounterCrystalsDay = "2026-11-23";
  t.encounterCrystalsToday = 100;
  return { s: s, e: makeEnc(s, "grassland", [{ speciesId: 1, cardIndex: 0 }]) };
}
let cf1 = cappedState();
const capWalletRes1 = Events.applyEvent(cf1.e, cf1.s, Events.eventById("lost-wallet"), function () { return 0; }, DAY23);
check("到上限：掉钱包发 0 结晶、改给出战卡亲密度 +1、文案有说明",
  capWalletRes1.grantedCrystals === 0 && capWalletRes1.capped === true && capWalletRes1.affectionGain === 1 &&
  cf1.e.team[0].card.affection === 1 && capWalletRes1.textZh.indexOf("亲密度 +1") >= 0);
cf1.e.team[0].card.affection = 100;
const capWalletRes2 = Events.applyEvent(cf1.e, cf1.s, Events.eventById("lost-wallet"), function () { return 0; }, DAY23);
check("到上限：出战卡亲密度满 10 级、转换无效、文案有说明",
  capWalletRes2.affectionGain === 0 && cf1.e.team[0].card.affection === 100 &&
  capWalletRes2.textZh.indexOf("已满") >= 0);
let cf2 = cappedState();
Gacha.ensureTrainer(cf2.s).encounterCrystalsToday = 98;
const capWalletRes3 = Events.applyEvent(cf2.e, cf2.s, Events.eventById("lost-wallet"), function () { return 0; }, DAY23);
check("到上限：部分封顶也转（98 + 5 只发 2、剩下的改亲密度 +1）",
  capWalletRes3.grantedCrystals === 2 && capWalletRes3.affectionGain === 1 &&
  cf2.e.team[0].card.affection === 1);

// 4. 难走的道路：1 只可用时不触发，4 只时倒一半
const sRoad = makeState();
addCard(sRoad, 1, 50);
const encRoad1 = makeEnc(sRoad, "grassland", [{ speciesId: 1, cardIndex: 0 }]);
check("难走的道路：只有 1 只可用时不在候选里",
  Events.eligibleEvents(encRoad1).every(function (e) { return e.id !== "rough-road"; }));
addCard(sRoad, 4, 50); addCard(sRoad, 7, 50); addCard(sRoad, 25, 50);
const encRoad4 = makeEnc(sRoad, "grassland", [
  { speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 },
  { speciesId: 7, cardIndex: 0 }, { speciesId: 25, cardIndex: 0 }]);
const roadRes = Events.applyEvent(encRoad4, sRoad, Events.eventById("rough-road"), function () { return 0.99; });
check("难走的道路：4 只倒 2 只、至少留 1 只可用",
  encRoad4.team.filter(function (m) { return m.hp > 0; }).length === 2);
check("难走的道路：出战卡倒了 → needsPick",
  roadRes.needsPick === true && encRoad4.needsPick === true);

// 5. 回血 / 复活
const sHeal = makeState();
addCard(sHeal, 1, 50); addCard(sHeal, 4, 50);
const encHeal = makeEnc(sHeal, "grassland", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
encHeal.team[0].hp = 10; encHeal.team[1].hp = 20;
const healRes = Events.applyEvent(encHeal, sHeal, Events.eventById("berry-bush"), function () { return 0; });
check("树果丛：全队回 30% 最大 HP + 1 糖果",
  encHeal.team[0].hp === 10 + Math.round(encHeal.team[0].hpMax * 0.3) &&
  encHeal.team[1].hp === 20 + Math.round(encHeal.team[1].hpMax * 0.3) &&
  Gacha.ensureTrainer(sHeal).candy === 1);
check("树果丛文案：中文有 30%、英文有 30%",
  healRes.textZh.indexOf("30%") >= 0 && healRes.textEn.indexOf("30%") >= 0);
// F2（用户定 2026-11-23）：只有宝可梦中心/绿洲能复活，其他回血只治还站着的
encHeal.team[1].hp = 0;
var hp0Before = encHeal.team[0].hp;
Events.applyEvent(encHeal, sHeal, Events.eventById("berry-bush"), function () { return 0; });
check("树果丛：倒下的不复活，站着的照常回血",
  encHeal.team[1].hp === 0 &&
  encHeal.team[0].hp === Math.min(encHeal.team[0].hpMax, hp0Before + Math.round(encHeal.team[0].hpMax * 0.3)));
Events.applyEvent(encHeal, sHeal, Events.eventById("pokemon-center"), function () { return 0; });
check("宝可梦中心：倒下的也复活回满", encHeal.team.every(function (m) { return m.hp === m.hpMax; }));
encHeal.team[0].hp = 0; encHeal.team[1].hp = 0;
Events.applyEvent(encHeal, sHeal, Events.eventById("desert-oasis"), function () { return 0; });
check("沙漠绿洲：随机复活一只（rng 0 → 第一只），另一只还倒着，+ 1 糖果",
  encHeal.team[0].hp === encHeal.team[0].hpMax && encHeal.team[1].hp === 0 &&
  Gacha.ensureTrainer(sHeal).candy === 3);
encHeal.team[0].hp = 5;
encHeal.team[1].hp = 0;
const nurseRes = Events.applyEvent(encHeal, sHeal, Events.eventById("kind-nurse"), function () { return 0; });
check("好心的护士：倒下的复活到 50%",
  encHeal.team[1].hp === Math.floor(encHeal.team[1].hpMax * 0.5));
const nurseRes2 = Events.applyEvent(encHeal, sHeal, Events.eventById("kind-nurse"), function () { return 0; });
check("好心的护士：没人倒下时全队回 20% 最大 HP",
  encHeal.team[0].hp === 5 + Math.round(encHeal.team[0].hpMax * 0.2) &&
  encHeal.team[1].hp === Math.floor(encHeal.team[1].hpMax * 0.5) + Math.round(encHeal.team[1].hpMax * 0.2) &&
  nurseRes2.needsPick === false);

// 6. 奖励：结晶（含上限）、糖果、道具、石头
const sAward = makeState();
addCard(sAward, 1, 50);
const encAward = makeEnc(sAward, "city", [{ speciesId: 1, cardIndex: 0 }]);
const walletRes = Events.applyEvent(encAward, sAward, Events.eventById("lost-wallet"), function () { return 0; });
check("掉钱包：+5 结晶，文案里的数 = 实际发的数",
  Gacha.ensureTrainer(sAward).crystals === 5 && walletRes.grantedCrystals === 5 &&
  walletRes.textZh.indexOf("5") >= 0 && walletRes.capped === false);
const tAward = Gacha.ensureTrainer(sAward);
tAward.encounterCrystalsDay = Gacha.encounterDayKey(new Date(2026, 10, 23));
tAward.encounterCrystalsToday = 98;
const walletRes2 = Events.applyEvent(encAward, sAward, Events.eventById("lost-wallet"), function () { return 0; }, new Date(2026, 10, 23));
check("掉钱包：今天只剩 2 额度 → 只发 2、capped",
  walletRes2.grantedCrystals === 2 && walletRes2.capped === true &&
  Gacha.ensureTrainer(sAward).crystals === 7 && walletRes2.textZh.indexOf("2") >= 0);
Events.applyEvent(encAward, sAward, Events.eventById("grandpa-gift"), function () { return 0; });
check("老爷爷：+3 糖果", Gacha.ensureTrainer(sAward).candy === 3);
Events.applyEvent(encAward, sAward, Events.eventById("merchant-gift"), function () { return 0; });
check("商人：+2 精灵球", Gacha.ensureTrainer(sAward).items.poke_ball === 3 + 2);
Events.applyEvent(encAward, sAward, Events.eventById("angler-gift"), function () { return 0; });
check("钓鱼佬：+1 高级球", Gacha.ensureTrainer(sAward).items.ultra_ball === 1);
Events.applyEvent(encAward, sAward, Events.eventById("cave-fossil"), function () { return 0; });
check("化石：rng 0 → 火之石", Gacha.ensureTrainer(sAward).items.fire_stone === 1);
Events.applyEvent(encAward, sAward, Events.eventById("treasure-chest"), function () { return 0; });
check("宝箱：rng 0 → 精灵球", Gacha.ensureTrainer(sAward).items.poke_ball === 3 + 2 + 1);

// 7. 增益 / 减益修正值
const sMod = makeState();
addCard(sMod, 1, 50); addCard(sMod, 4, 50);
const encMod = makeEnc(sMod, "grassland", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
Events.applyEvent(encMod, sMod, Events.eventById("kind-mentor"), function () { return 0; });
check("好心人：全队攻击 +5（mods 初始化）", encMod.mods && encMod.mods.atkBonus === 5);
Events.applyEvent(encMod, sMod, Events.eventById("lucky-clover"), function () { return 0; });
check("幸运草：下一场捕捉率 ×1.5", encMod.mods.catchMultNext === 1.5);
Events.applyEvent(encMod, sMod, Events.eventById("apprentice-tip"), function () { return 0; });
check("学徒指点：下一场伤害 ×1.5", encMod.mods.damageMultNext === 1.5);
Events.applyEvent(encMod, sMod, Events.eventById("morning-run"), function () { return 0; });
check("晨跑：下一场己方先攻", encMod.mods.forceFirstNext === true);
Events.applyEvent(encMod, sMod, Events.eventById("rainstorm"), function () { return 0; });
check("暴雨：下一场野生先攻", encMod.mods.forceWildFirstNext === true);
Events.applyEvent(encMod, sMod, Events.eventById("lost-way"), function () { return 0; });
check("迷路：本场剩余野生等级 +3", encMod.mods.wildLevelBonus === 3);
const meteorRes = Events.applyEvent(encMod, sMod, Events.eventById("meteor"), function () { return 0; });
check("流星：结算倍率 chestMult = 2",
  encMod.mods.chestMult === 2 && encMod.mods.atkBonus === 5);
check("流星文案：中文有翻倍",
  meteorRes.textZh.indexOf("翻倍") >= 0 && meteorRes.textEn.indexOf("doubled") >= 0);
Events.applyEvent(encMod, sMod, Events.eventById("cheer-song"), function () { return 0; });
check("歌声：全队暴击率 +10%", encMod.mods.critBonus === 10);
Events.applyEvent(encMod, sMod, Events.eventById("noisy-mon"), function () { return 0; });
check("吵闹：下一场捕捉率 ×0.5（覆盖幸运草）", encMod.mods.catchMultNext === 0.5);

// 8. 经验 / 亲密度
const sExp = makeState();
const cExp = addCard(sExp, 1, 50);
const encExp = makeEnc(sExp, "grassland", [{ speciesId: 1, cardIndex: cExp }]);
const cardExp = encExp.team[0].card;
cardExp.exp = 49; // Lv 50 差 1 点升级
const expRes = Events.applyEvent(encExp, sExp, Events.eventById("training"), function () { return 0; });
check("特训：49/50 +10 → 升 1 级、剩 9 点、最大 HP 同步",
  expRes.levels === 1 && cardExp.level === 51 && cardExp.exp === 9 &&
  encExp.team[0].hpMax === cardExp.hp);
Events.applyEvent(encExp, sExp, Events.eventById("beauty-contest"), function () { return 0; });
check("选美：出战卡亲密度 +3", cardExp.affection === 3);
Events.applyEvent(encExp, sExp, Events.eventById("team-cheer"), function () { return 0; });
check("队友加油：全队亲密度 +1", cardExp.affection === 4);

// 9. 随机分支与组合效果
const sRand = makeState();
addCard(sRand, 1, 50); addCard(sRand, 4, 50);
const encRand = makeEnc(sRand, "forest", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
encRand.team[0].hp = 50; encRand.team[1].hp = 50;
const hpMax0 = encRand.team[0].hpMax;
// 掉血按当前 HP 算：蘑菇回血后 95 血，掉 15% → floor(95×0.85)=80；
// 沙暴再掉 15% → floor(80×0.85)=68；陷阱 100 血 -30% → 70；雪崩减半 → 35
const hpAfterHeal = 50 + Math.round(hpMax0 * 0.3);
const mushRes1 = Events.applyEvent(encRand, sRand, Events.eventById("forest-mushroom"), function () { return 0; });
check("蘑菇：rng 0 → 回 30%、分支记 0",
  encRand.team[0].hp === hpAfterHeal && mushRes1.branch === 0);
const mushRes2 = Events.applyEvent(encRand, sRand, Events.eventById("forest-mushroom"), function () { return 0.99; });
check("蘑菇：rng 0.99 → 掉 15%（按当前 HP）、分支记 1",
  encRand.team[0].hp === Math.floor(hpAfterHeal * 0.85) && mushRes2.branch === 1);
const sandRes = Events.applyEvent(encRand, sRand, Events.eventById("sandstorm"), function () { return 0; });
check("沙暴：全队 -15% 且野生等级 +2",
  encRand.team[0].hp === Math.floor(Math.floor(hpAfterHeal * 0.85) * 0.85) &&
  encRand.mods.wildLevelBonus === 2);
encRand.team[0].hp = 100;
Events.applyEvent(encRand, sRand, Events.eventById("trap"), function () { return 0; });
check("陷阱：只打出身卡 -30%（按当前 HP）",
  encRand.team[0].hp === 70);
Events.applyEvent(encRand, sRand, Events.eventById("avalanche"), function () { return 0; });
check("雪崩：rng 0 → 第一只队员 HP 减半",
  encRand.team[0].hp === 35);

// 10. 战斗类事件：只返回开打参数，不改存档
const sBattle = makeState();
addCard(sBattle, 1, 50);
const encBattle = makeEnc(sBattle, "grassland", [{ speciesId: 1, cardIndex: 0 }]);
const crystalsBefore = Gacha.ensureTrainer(sBattle).crystals;
const duelRes = Events.applyEvent(encBattle, sBattle, Events.eventById("trainer-duel"), function () { return 0; });
check("训练师挑战：返回 battle 参数（等级 +2、战利品 2 结晶），不改存档",
  duelRes.battle && duelRes.battle.levelBonus === 2 && duelRes.battle.bonus.crystals === 2 &&
  Gacha.ensureTrainer(sBattle).crystals === crystalsBefore);
check("训练师挑战文案：中文有 2 结晶",
  duelRes.textZh.indexOf("2") >= 0 && duelRes.textZh.indexOf("梦想结晶") >= 0);
const fishRes = Events.applyEvent(encBattle, sBattle, Events.eventById("fishing"), function () { return 0; });
check("钓鱼：开打参数带 typeFilter water",
  fishRes.battle && fishRes.battle.typeFilter === "water");
const arenaRes = Events.applyEvent(encBattle, sBattle, Events.eventById("arena"), function () { return 0; });
check("擂台赛：开打参数带 arena",
  arenaRes.battle && arenaRes.battle.arena === true && arenaRes.battle.levelBonus === 2);
const eggRes = Events.applyEvent(encBattle, sBattle, Events.eventById("grass-egg"), function () { return 0; });
check("草丛里的蛋：开打参数带 tierCap N",
  eggRes.battle && eggRes.battle.tierCap === "N");

// 11. 团灭与 needsPick
const sWipe = makeState();
addCard(sWipe, 1, 50); addCard(sWipe, 4, 50);
const encWipe = makeEnc(sWipe, "forest", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
encWipe.team[0].hp = 1; encWipe.team[1].hp = 1;
const wipeRes = Events.applyEvent(encWipe, sWipe, Events.eventById("poison-fog"), function () { return 0; });
check("毒雾：两只都剩 1 血 → 全倒、wiped",
  wipeRes.wiped === true && encWipe.team.every(function (m) { return m.hp === 0; }));
const sPick = makeState();
addCard(sPick, 1, 50); addCard(sPick, 4, 50);
const encPick = makeEnc(sPick, "cave", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
encPick.team[0].hp = 1;
const pickRes = Events.applyEvent(encPick, sPick, Events.eventById("trap"), function () { return 0; });
check("陷阱：出战卡倒了、队友还在 → needsPick、不 wipe",
  pickRes.needsPick === true && pickRes.wiped === false && encPick.needsPick === true);

// 12. 雪崩只砸还站着的队员（已倒下的再砸也没用）
const sAval = makeState();
addCard(sAval, 1, 50); addCard(sAval, 4, 50);
const encAval = makeEnc(sAval, "glacier", [{ speciesId: 1, cardIndex: 0 }, { speciesId: 4, cardIndex: 0 }]);
encAval.team[0].hp = 0; encAval.team[1].hp = 100;
Events.applyEvent(encAval, sAval, Events.eventById("avalanche"), function () { return 0; });
check("雪崩：第一只已倒下 → 砸第二只，HP 减半",
  encAval.team[0].hp === 0 && encAval.team[1].hp === 50);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
