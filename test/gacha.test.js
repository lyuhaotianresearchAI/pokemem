// PokeMem 本地验证：node test/gacha.test.js
// 检查：图鉴完整性、概率分布、10连保底、50抽保底、数值公式、卡包计时
const { POKEDEX } = require("../pokedex.js");
const Gacha = require("../gacha.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

// 1. 图鉴完整性
check("151 只", POKEDEX.length === 151, "实际 " + POKEDEX.length);
const ids = POKEDEX.map(r => r[0]);
check("编号 1-151 连续", ids.every((id, i) => id === i + 1));
const counts = {};
POKEDEX.forEach(r => { counts[r[4]] = (counts[r[4]] || 0) + 1; });
check("分档数量 2/3/15/62/21/48", counts.MR === 2 && counts.UR === 3 && counts.SSR === 15 && counts.SR === 62 && counts.R === 21 && counts.N === 48, JSON.stringify(counts));
const sum = POKEDEX.reduce((s, r) => s + r[5], 0);
check("表格概率合计 99.89%", Math.abs(sum - 99.89) < 0.001, "实际 " + sum.toFixed(2) + "%");
check("最低等级/种族值均有值", POKEDEX.every(r => r[6] >= 5 && r[6] <= 100 && r[7] > 0 && r[8] > 0));

// 2. 数值公式：妙蛙种子 50 级应为 HP 151 / 攻击 100（文档例）
const bulba = POKEDEX[0];
const st = Gacha.rollStats(bulba, () => (50 - 5) / (100 - 5)); // 强制抽到 50 级
check("妙蛙种子 Lv50 HP151/攻击100", st.level === 50 && st.hp === 151 && st.atk === 100, JSON.stringify(st));

// 3. 概率分布（无保底的裸抽）：20 万抽，各档频率与表格档位合计对比
// 注意：drawCard 带 50 抽保底，会把 SSR 有效概率抬高约 0.3-0.4 个百分点，
// 所以裸概率用 drawAny 测；保底的影响见下面第 3b 条
const N = 200000;
const freq = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0, MR: 0 };
for (let i = 0; i < N; i++) {
  const row = Gacha.drawAny(Math.random);
  freq[row[4]]++;
}
const expected = { N: 49.92, R: 30.03, SR: 14.88, SSR: 4.05, UR: 0.75, MR: 0.26 };
const tol = { N: 0.4, R: 0.4, SR: 0.3, SSR: 0.15, UR: 0.08, MR: 0.06 };
Object.keys(expected).forEach(t => {
  const got = (freq[t] / N) * 100;
  check("裸抽概率 " + t + " ≈ " + expected[t] + "%", Math.abs(got - expected[t]) <= tol[t],
    "实测 " + got.toFixed(2) + "%（" + freq[t] + " 张），期望 " + expected[t] + "%");
});

// 3b. 保底对有效概率的影响：带 50 抽保底抽 20 万张，SSR 有效概率应高于标称 4.05%，但不超过 4.7%
const freq2 = { SSR: 0 };
const state = Gacha.newState(0);
for (let i = 0; i < N; i++) {
  const c = Gacha.drawCard(state, Math.random);
  if (c.tier === "SSR") freq2.SSR++;
}
const effSSR = (freq2.SSR / N) * 100;
check("带保底 SSR 有效概率 4.05%~4.7%", effSSR > 4.05 && effSSR < 4.7, "实测 " + effSSR.toFixed(2) + "%（保底抬高，符合预期）");

// 4. 10 连保底：2000 包，每包至少 1 张 SR+
let badPacks = 0;
for (let p = 0; p < 2000; p++) {
  const s = Gacha.newState(0); s.packs = 1;
  const pack = Gacha.drawPack(s, Math.random);
  if (pack.length !== 10) badPacks++;
  if (!pack.some(c => Gacha.SR_PLUS.includes(c.tier))) badPacks++;
}
check("2000 包全部 10 张且含 SR+", badPacks === 0, "违规包 " + badPacks);

// 5. 50 抽保底：10 万抽里，SSR+ 间隔最大不超过 50
const s2 = Gacha.newState(0);
let gap = 0, maxGap = 0;
for (let i = 0; i < 100000; i++) {
  const c = Gacha.drawCard(s2, Math.random);
  if (Gacha.SSR_PLUS.includes(c.tier)) { maxGap = Math.max(maxGap, gap); gap = 0; }
  else gap++;
}
check("SSR+ 最大间隔 ≤ 50 抽", maxGap <= 50, "实测最大间隔 " + maxGap + " 抽");

// 6. 卡包计时：3.5 小时应补 3 包，余 0.5 小时
const s3 = Gacha.newState(1000000);
const due = Gacha.grantDuePacks(s3, 1000000 + 3.5 * 3600 * 1000);
check("3.5 小时补 3 包", due === 3 && s3.packs === 4, "补发 " + due + "，现有 " + s3.packs);
check("下一包剩余 30 分钟", Gacha.msToNextPack(s3, 1000000 + 3.5 * 3600 * 1000) === 30 * 60 * 1000);

// 7. 开包合并进卡册：新卡计数、NEW 标记
const s4 = Gacha.newState(0); s4.packs = 1;
const pack = Gacha.drawPack(s4, Math.random);
check("开包后包数 0、总抽 10", s4.packs === 0 && s4.totalDraws === 10);
check("卡册拥有数 = 包内去重数", Gacha.ownedCount(s4) === new Set(pack.map(c => c.id)).size);
check("NEW 标记只给首次获得", pack.filter(c => c.isNew).length === new Set(pack.map(c => c.id)).size);

// 8. 每张卡单独存明细：同一只抽到多张时，cards 里逐张都有等级/HP/攻击
const s5 = Gacha.newState(0);
const c1 = { id: 25, level: 76, hp: 240, atk: 198 };
const c2 = { id: 25, level: 50, hp: 151, atk: 100 };
Gacha.addToCollection(s5, c1);
Gacha.addToCollection(s5, c2);
const e25 = s5.collection[25];
check("同一只 2 张，count=2、cards 长度 2", e25.count === 2 && e25.cards.length === 2);
check("明细逐张保存", e25.cards[0].level === 76 && e25.cards[0].hp === 240 && e25.cards[1].level === 50 && e25.cards[1].atk === 100);
check("best 取最高等级那张的数值", e25.bestLv === 76 && e25.bestHp === 240 && e25.bestAtk === 198);
check("按 HP 排能分出先后", e25.cards.slice().sort((a, b) => b.hp - a.hp)[0].level === 76);
check("按攻击排能分出先后", e25.cards.slice().sort((a, b) => b.atk - a.atk)[0].level === 76);

// 9. 旧存档迁移：v1.5 前只有汇总的条目，补一条明细卡，余数记 legacy
const s6 = Gacha.newState(0);
s6.collection[4] = { count: 3, bestLv: 82, bestHp: 232, bestAtk: 166 };
Gacha.migrateCollection(s6);
const e4 = s6.collection[4];
check("迁移后 count 不变", e4.count === 3);
check("迁移补 1 条明细卡（最高数值）", e4.cards.length === 1 && e4.cards[0].level === 82 && e4.cards[0].hp === 232);
check("迁移余 2 张记 legacy", e4.legacy === 2);
check("迁移可重复跑（幂等）", (Gacha.migrateCollection(s6), e4.cards.length === 1 && e4.legacy === 2));

// 10. 每只上限 5 张：超过的去掉 Lv 最低的
const s8 = Gacha.newState(0);
[71, 40, 90, 65, 55, 88, 30].forEach((lv, i) => Gacha.addToCollection(s8, { id: 33, level: lv, hp: 100 + i, atk: 50 + i }));
const e33 = s8.collection[33];
check("7 张进、只留 5 张", e33.cards.length === 5 && e33.count === 5);
check("留的是 Lv 最高的 5 张", e33.cards.map(c => c.level).sort((a, b) => b - a).join(",") === "90,88,71,65,55");
check("去掉的 2 张记在 droppedCount", e33.droppedCount === 2);
check("最高等级不受影响", e33.bestLv === 90);
Gacha.addToCollection(s8, { id: 33, level: 20, hp: 120, atk: 60 });
check("新抽 Lv 最低的卡直接被去掉", e33.cards.length === 5 && e33.cards.every(c => c.level !== 20) && e33.droppedCount === 3);
Gacha.addToCollection(s8, { id: 33, level: 95, hp: 300, atk: 200 });
check("新抽 Lv 最高的卡挤掉原来最低的", e33.cards.some(c => c.level === 95) && !e33.cards.some(c => c.level === 55) && e33.bestLv === 95);
const s9 = Gacha.newState(0);
s9.collection[4] = { count: 8, bestLv: 94, bestHp: 264, bestAtk: 190, legacy: 0,
  cards: [94, 74, 69, 68, 68, 50, 40, 30].map(lv => ({ level: lv, hp: 200, atk: 100, pulledAt: 0 })) };
check("enforceCap 去掉 3 张", Gacha.enforceCap(s9) === 3 && s9.collection[4].cards.length === 5 && s9.collection[4].count === 5);
check("enforceCap 保留 Lv 最高的 5 张", s9.collection[4].cards.map(c => c.level).sort((a, b) => b - a).join(",") === "94,74,69,68,68");
check("enforceCap 幂等", Gacha.enforceCap(s9) === 0);
// 11. 旧卡补生成：v1.5 前的 8 张小火龙（只有汇总）→ 迁移后补 7 张，Lv 不超过原最高 94
const s7 = Gacha.newState(0);
s7.collection[4] = { count: 8, bestLv: 94, bestHp: 264, bestAtk: 190 };
Gacha.migrateCollection(s7);
check("迁移后 1 条明细 + 7 张 legacy", s7.collection[4].cards.length === 1 && s7.collection[4].legacy === 7);
const seedVals = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8]; let si = 0;
const seededRng = function () { return seedVals[si++ % seedVals.length]; };
const repaired = Gacha.repairLegacyCards(s7, seededRng);
const e4b = s7.collection[4];
const row4 = Gacha.entry(4);
check("补生成 7 张旧卡", repaired === 7 && e4b.cards.length === 8 && e4b.legacy === 0);
check("补生成的卡 Lv 在最低等级～94 之间",
  e4b.cards.filter(c => c.repaired).every(c => c.level >= row4[6] && c.level <= 94));
check("补生成的卡 HP/攻击符合公式",
  e4b.cards.filter(c => c.repaired).every(c =>
    c.hp === Math.floor((2 * row4[7] + 93) * c.level / 100) + c.level + 10 &&
    c.atk === Math.floor((2 * row4[8] + 93) * c.level / 100) + 5));
check("最高等级仍是 94（补生成没超过原最高）", e4b.bestLv === 94 && e4b.cards.filter(c => c.level === 94).length === 1);
check("补生成只跑一次", Gacha.repairLegacyCards(s7, seededRng) === 0);

// 12. 训练师资料（Task 4/5）：新存档默认值、老存档迁移、注册奖励只发一次
const st0 = Gacha.newState(0);
check("新存档带训练师：1 级 0 经验", st0.trainer.level === 1 && st0.trainer.exp === 0);
check("新存档结晶 0、糖果 0、未注册", st0.trainer.crystals === 0 && st0.trainer.candy === 0 && st0.trainer.registered === false);
check("新存档精灵球 3 个、其他道具 0",
  st0.trainer.items.poke_ball === 3 && Gacha.ITEM_IDS.filter(id => id !== "poke_ball").every(id => st0.trainer.items[id] === 0));
check("新存档 version 2", st0.version === 2);
const legacy = { packs: 5, collection: { 25: { count: 1 } }, totalDraws: 10 };
Gacha.ensureTrainer(legacy);
check("老存档迁移补训练师，不动卡包和卡册",
  legacy.trainer && legacy.trainer.level === 1 && legacy.packs === 5 && legacy.collection[25].count === 1);
check("迁移来的训练师结晶 0（注册时再发）", legacy.trainer.crystals === 0 && legacy.trainer.welcomeCrystalsGranted === false);
check("注册奖励第一次 +100", Gacha.grantWelcomeCrystals(legacy) === 100 && legacy.trainer.crystals === 100);
check("注册奖励第二次返回 0、不重复发", Gacha.grantWelcomeCrystals(legacy) === 0 && legacy.trainer.crystals === 100);
const dirty = Gacha.newState(0);
dirty.trainer.level = 999; dirty.trainer.exp = -5; dirty.trainer.crystals = -1;
dirty.trainer.candy = 2.7; dirty.trainer.items = { poke_ball: 1 };
Gacha.ensureTrainer(dirty);
check("坏值夹回合法范围：等级 ≤100、经验/结晶 ≥0、糖果取整、缺的道具补 0",
  dirty.trainer.level === 100 && dirty.trainer.exp === 0 && dirty.trainer.crystals === 0 &&
  dirty.trainer.candy === 2 && dirty.trainer.items.poke_ball === 1 && dirty.trainer.items.great_ball === 0);
// F6：上面那条在 100 级时经验恒为 0，测不到经验分支，所以经验分支单独测
const expNeg = Gacha.newState(0);
expNeg.trainer.level = 50; expNeg.trainer.exp = -5;
Gacha.ensureTrainer(expNeg);
check("非满级时经验 <0 → 0，等级不动", expNeg.trainer.level === 50 && expNeg.trainer.exp === 0);
const expOver = Gacha.newState(0);
expOver.trainer.level = 50; expOver.trainer.exp = 150;
Gacha.ensureTrainer(expOver);
check("经验溢出 150 → 升 1 级余 50（不丢弃）", expOver.trainer.level === 51 && expOver.trainer.exp === 50);
const expCap = Gacha.newState(0);
expCap.trainer.level = 99; expCap.trainer.exp = 250;
Gacha.ensureTrainer(expCap);
check("99 级经验 250 → 100 级余经验清零", expCap.trainer.level === 100 && expCap.trainer.exp === 0);
// F1：数组训练师 / 数组道具不能通过类型检查，JSON 会丢数据
const arrTrainer = { packs: 1, collection: {}, trainer: [] };
Gacha.ensureTrainer(arrTrainer);
check("数组 trainer 当损坏处理：换成普通对象", !Array.isArray(arrTrainer.trainer) && arrTrainer.trainer.level === 1);
const arrItems = Gacha.newState(0);
arrItems.trainer.items = ["poke_ball"];
Gacha.ensureTrainer(arrItems);
check("数组 items 当损坏处理：换成新道具表", !Array.isArray(arrItems.trainer.items) && arrItems.trainer.items.poke_ball === 3);
// F2：NaN / Infinity 不能漏过夹取
const nanState = Gacha.newState(0);
nanState.trainer.crystals = NaN; nanState.trainer.candy = Infinity;
Gacha.ensureTrainer(nanState);
check("NaN 结晶 → 0、Infinity 糖果 → 0", nanState.trainer.crystals === 0 && nanState.trainer.candy === 0);
check("NaN 修好后注册奖励仍能完整发出 100", Gacha.grantWelcomeCrystals(nanState) === 100 && nanState.trainer.crystals === 100);
// F3：真值的非布尔已发标记不能被重置，否则奖励会重复发
const flagState = Gacha.newState(0);
flagState.trainer.welcomeCrystalsGranted = 1; flagState.trainer.crystals = 100;
check("已发标记为 1 时不再重复发", Gacha.grantWelcomeCrystals(flagState) === 0 && flagState.trainer.crystals === 100);
// F4：迁移也要打 version 标记；F6：新用户注册路径（newState）也要测一次
const mig = { packs: 5, collection: {} };
Gacha.ensureTrainer(mig);
check("迁移的存档 version 也是 2", mig.version === 2);
// N1：未来更高的 version 不能被降级；坏的 version 修回 2
const future = { version: 3, packs: 1, collection: {} };
Gacha.ensureTrainer(future);
check("version 3 不会被降级成 2", future.version === 3);
const badVer = { version: NaN, packs: 1, collection: {} };
Gacha.ensureTrainer(badVer);
check("version 为 NaN 修回 2", badVer.version === 2);
// N2：没名字的训练师不能算已注册；有名字的保持已注册
const noName = Gacha.newState(0);
noName.trainer.registered = true; noName.trainer.name = "";
Gacha.ensureTrainer(noName);
check("registered=true 但没名字 → 改回未注册", noName.trainer.registered === false);
const named = Gacha.newState(0);
named.trainer.registered = true; named.trainer.name = "小智";
Gacha.ensureTrainer(named);
check("有名字的已注册保持不变", named.trainer.registered === true && named.trainer.name === "小智");
const fresh = Gacha.newState(0);
check("新用户注册奖励第一次 +100", Gacha.grantWelcomeCrystals(fresh) === 100 && fresh.trainer.crystals === 100);
check("新用户注册奖励第二次返回 0", Gacha.grantWelcomeCrystals(fresh) === 0 && fresh.trainer.crystals === 100);
const trA = Gacha.newTrainer(), trB = Gacha.newTrainer();
trA.items.poke_ball = 99;
check("两个训练师的道具表互不共享", trB.items.poke_ball === 3);
const kept = Gacha.newState(0);
kept.trainer.name = "小智"; kept.trainer.level = 12; kept.trainer.exp = 37;
kept.trainer.crystals = 40; kept.trainer.candy = 9; kept.trainer.registered = true;
Gacha.ensureTrainer(kept);
check("已有训练师的字段原样保留", kept.trainer.name === "小智" && kept.trainer.level === 12 &&
  kept.trainer.exp === 37 && kept.trainer.crystals === 40 && kept.trainer.candy === 9);

// 13. 结晶兑换卡包（Task 7）：10 颗换 1 包，不足拒绝，兑换前先结算计时器
const ex1 = Gacha.newState(1000000); ex1.trainer.crystals = 100;
check("100 结晶兑换：扣 10、包 +1、返回 1",
  Gacha.exchangeCrystalsForPack(ex1, 1000000) === 1 && ex1.trainer.crystals === 90 && ex1.packs === 2);
const ex2 = Gacha.newState(1000000); ex2.trainer.crystals = 9;
check("9 结晶兑换：返回 0、不扣结晶、包数不变",
  Gacha.exchangeCrystalsForPack(ex2, 1000000) === 0 && ex2.trainer.crystals === 9 && ex2.packs === 1);
const ex3 = Gacha.newState(1000000); ex3.trainer.crystals = 10;
check("正好 10 结晶兑换成功，结晶归零",
  Gacha.exchangeCrystalsForPack(ex3, 1000000) === 1 && ex3.trainer.crystals === 0 && ex3.packs === 2);
const ex4 = Gacha.newState(1000000); ex4.trainer.crystals = 0;
check("0 结晶兑换：返回 0、包数不变",
  Gacha.exchangeCrystalsForPack(ex4, 1000000) === 0 && ex4.packs === 1);
// 计时器在兑换边界：2.5 小时后兑换，计时补 2 包 + 兑换 1 包，三个包都加上
const ex5 = Gacha.newState(1000000); ex5.trainer.crystals = 100;
const r5 = Gacha.exchangeCrystalsForPack(ex5, 1000000 + 2.5 * 3600 * 1000);
check("倒计时归零边缘兑换：计时 2 包 + 兑换 1 包都到账",
  r5 === 1 && ex5.packs === 4 && ex5.trainer.crystals === 90);
check("兑换后计时器余 30 分钟（不重置、不丢时间）",
  Gacha.msToNextPack(ex5, 1000000 + 2.5 * 3600 * 1000) === 30 * 60 * 1000);
// 计时器结算不影响拒绝：余额不足时计时照常补发，兑换照常拒绝
const ex6 = Gacha.newState(1000000); ex6.trainer.crystals = 5;
const r6 = Gacha.exchangeCrystalsForPack(ex6, 1000000 + 1 * 3600 * 1000);
check("余额不足但计时到点：计时补 1 包，兑换仍拒绝",
  r6 === 0 && ex6.packs === 2 && ex6.trainer.crystals === 5);
// 多次兑换：35 结晶连兑 3 次，第 4 次不足拒绝
const ex7 = Gacha.newState(1000000); ex7.trainer.crystals = 35;
Gacha.exchangeCrystalsForPack(ex7, 1000000);
Gacha.exchangeCrystalsForPack(ex7, 1000000);
Gacha.exchangeCrystalsForPack(ex7, 1000000);
check("35 结晶连兑 3 次：剩 5 结晶、包 +3",
  ex7.trainer.crystals === 5 && ex7.packs === 4);
check("第 4 次余额不足拒绝",
  Gacha.exchangeCrystalsForPack(ex7, 1000000) === 0 && ex7.trainer.crystals === 5);

// 14. 训练师经验结算（Task 6）：升级、奖励、满级
const xp1 = Gacha.newState(0);
const xr1 = Gacha.addTrainerExp(xp1, 43);
check("43 经验：不升级、余 43", xr1.levels === 0 && xp1.trainer.level === 1 && xp1.trainer.exp === 43);
const xr2 = Gacha.addTrainerExp(xp1, 60);
check("再加 60：升 1 级余 3、+2 糖果", xr2.levels === 1 && xp1.trainer.level === 2 && xp1.trainer.exp === 3 && xp1.trainer.candy === 2);
check("升级结果返回升了几级和糖果", xr2.candy === 2 && Object.keys(xr2.items).length === 0);
const xp2 = Gacha.newState(0);
const xr3 = Gacha.addTrainerExp(xp2, 250);
check("250 经验：连升 2 级余 50、糖果 +4", xr3.levels === 2 && xp2.trainer.level === 3 && xp2.trainer.exp === 50 && xp2.trainer.candy === 4);
const xp3 = Gacha.newState(0); xp3.trainer.level = 9; xp3.trainer.exp = 90;
const xr4 = Gacha.addTrainerExp(xp3, 20);
check("升到 10 级：里程碑给 3 超级球", xr4.levels === 1 && xp3.trainer.level === 10 && xr4.items.great_ball === 3 && xp3.trainer.items.great_ball === 3);
const xp4 = Gacha.newState(0); xp4.trainer.level = 24; xp4.trainer.exp = 90;
const xr5 = Gacha.addTrainerExp(xp4, 20);
check("升到 25 级：里程碑给 3 高级球", xr5.items.ultra_ball === 3 && xp4.trainer.items.ultra_ball === 3);
const xp8 = Gacha.newState(0); xp8.trainer.level = 9; xp8.trainer.exp = 0;
const xr8 = Gacha.addTrainerExp(xp8, 250);
check("9 级 +250：升到 11 级、10 级里程碑只给一次",
  xr8.levels === 2 && xp8.trainer.level === 11 && xp8.trainer.items.great_ball === 3 && xp8.trainer.candy === 4);
const xp5 = Gacha.newState(0); xp5.trainer.level = 100; xp5.trainer.exp = 0;
const xr6 = Gacha.addTrainerExp(xp5, 500);
check("满级加经验：等级/经验/糖果都不动", xr6.levels === 0 && xp5.trainer.level === 100 && xp5.trainer.exp === 0 && xp5.trainer.candy === 0);
const xp6 = Gacha.newState(0); xp6.trainer.level = 99; xp6.trainer.exp = 90;
const xr7 = Gacha.addTrainerExp(xp6, 50);
check("99 级 +50：升到 100、溢出丢弃、经验归零", xr7.levels === 1 && xp6.trainer.level === 100 && xp6.trainer.exp === 0);
const xp7 = Gacha.newState(0);
check("负经验不动", Gacha.addTrainerExp(xp7, -10).levels === 0 && xp7.trainer.exp === 0);
check("NaN 经验不动", Gacha.addTrainerExp(xp7, NaN).levels === 0 && xp7.trainer.exp === 0);
check("经验表 N2/R4/SR8/SSR15/UR25/MR50",
  Gacha.TRAINER_EXP_TABLE.N === 2 && Gacha.TRAINER_EXP_TABLE.R === 4 && Gacha.TRAINER_EXP_TABLE.SR === 8 &&
  Gacha.TRAINER_EXP_TABLE.SSR === 15 && Gacha.TRAINER_EXP_TABLE.UR === 25 && Gacha.TRAINER_EXP_TABLE.MR === 50);
const packExp = 10 * (0.4992 * 2 + 0.3003 * 4 + 0.1488 * 8 + 0.0405 * 15 + 0.0075 * 25 + 0.0026 * 50);
check("一包期望经验约 43", Math.abs(packExp - 43) < 1, "算得 " + packExp.toFixed(1));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
