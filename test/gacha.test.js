// PokeMem 本地验证：node test/gacha.test.js
// 检查：图鉴完整性、概率分布、10连保底、50抽保底、数值公式、卡包计时
const { POKEDEX } = require("../pokedex.js");
const { AVATARS } = require("../avatars.js");
require("../card-progress.js"); // Task 24：gacha.js 入册时调 CardProgress，必须先加载
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
check("道具目录 9 种，含大师球（Task 19，初始 0 个、无获得途径）",
  Gacha.ITEM_IDS.length === 9 && Gacha.ITEM_IDS.indexOf("master_ball") >= 0 && st0.trainer.items.master_ball === 0);
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
// Task 20 头像：默认值、迁移修复、换头像校验、与 avatars.js 展示数据一致
check("新存档默认头像是赤红", st0.trainer.avatar === "red");
check("头像目录 25 个、首尾是赤红/紫",
  Gacha.AVATAR_IDS.length === 25 && Gacha.AVATAR_IDS[0] === "red" && Gacha.AVATAR_IDS[24] === "violet");
check("展示数据 AVATARS 的 id 与校验列表完全一致",
  AVATARS.length === Gacha.AVATAR_IDS.length && AVATARS.every(function (a, i) { return a.id === Gacha.AVATAR_IDS[i]; }));
check("展示数据每人都有中英文名和内嵌 WebP 图（connector 推不了二进制，图以 data URI 嵌在 avatars.js 里）",
  AVATARS.every(function (a) { return a.zh && a.en && a.img.indexOf("data:image/webp;base64,") === 0; }));
const noAvatar = Gacha.newState(0); delete noAvatar.trainer.avatar;
Gacha.ensureTrainer(noAvatar);
check("老存档缺 avatar 字段 → 补默认赤红", noAvatar.trainer.avatar === "red");
const badAvatar = Gacha.newState(0); badAvatar.trainer.avatar = "pikachu";
Gacha.ensureTrainer(badAvatar);
check("非法头像值 → 回默认赤红", badAvatar.trainer.avatar === "red");
const goodAvatar = Gacha.newState(0); goodAvatar.trainer.avatar = "blue";
Gacha.ensureTrainer(goodAvatar);
check("合法头像值保留", goodAvatar.trainer.avatar === "blue");
// Task 29：遭遇战每日结晶计数（上限 100/天）
const freshTr = Gacha.newState(0);
check("新训练师每日结晶计数默认 0、日期为空",
  freshTr.trainer.encounterCrystalsToday === 0 && freshTr.trainer.encounterCrystalsDay === null);
const badCap = Gacha.newState(0);
badCap.trainer.encounterCrystalsToday = -5; badCap.trainer.encounterCrystalsDay = 123;
Gacha.ensureTrainer(badCap);
check("每日结晶计数的坏值修成 0 / null",
  badCap.trainer.encounterCrystalsToday === 0 && badCap.trainer.encounterCrystalsDay === null);
const swap = Gacha.newState(0);
check("换头像合法 → true 且生效", Gacha.setAvatar(swap, "moon") === true && swap.trainer.avatar === "moon");
check("换头像非法 → false 且不动", Gacha.setAvatar(swap, "pikachu") === false && swap.trainer.avatar === "moon");
check("换头像不认非字符串", Gacha.setAvatar(swap, 3) === false && swap.trainer.avatar === "moon");
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

// 15. 开包结算训练师经验（Task 8）：整包 10 张都算，保底那张也算
const s10 = Gacha.newState(0); s10.packs = 1;
const pack10 = Gacha.drawPack(s10, () => 0); // rng 恒 0：前 9 张全是 #001（R），第 10 张触发保底
const exp10 = pack10.reduce((s, c) => s + Gacha.TRAINER_EXP_TABLE[c.tier], 0);
check("保底包：第 10 张是保底卡", pack10.some(c => c.pity === true));
check("保底包经验 = 10 张稀有度经验之和", pack10.trainerExp.exp === exp10, "算得 " + pack10.trainerExp.exp + "，期望 " + exp10);
check("保底包经验已结算进训练师", s10.trainer.exp === exp10);
check("保底包没升级、没糖果", pack10.trainerExp.levels === 0 && pack10.trainerExp.candy === 0);
check("保底包丢卡也换糖果：9 张 #001 掉 4 张，各 2 糖果", s10.trainer.candy === 8 && s10.collection[1].droppedCount === 4);
check("开包返回仍是 10 张卡数组", Array.isArray(pack10) && pack10.length === 10);
const s11 = Gacha.newState(0); s11.packs = 1; s11.trainer.exp = 90;
const pack11 = Gacha.drawPack(s11, () => 0);
check("开包升级：90 + 包经验 → 2 级，升级 +2 糖果、丢卡 +8 糖果",
  s11.trainer.level === 2 && s11.trainer.candy === 10 && pack11.trainerExp.levels === 1 && pack11.trainerExp.candy === 2);
check("开包升级后经验余数对得上", s11.trainer.exp === 90 + pack11.trainerExp.exp - 100);
const s12 = Gacha.newState(0); s12.packs = 1;
const pack12 = Gacha.drawPack(s12, Math.random);
const exp12 = pack12.reduce((s, c) => s + Gacha.TRAINER_EXP_TABLE[c.tier], 0);
check("随机包经验 = 10 张稀有度经验之和", pack12.trainerExp.exp === exp12);
check("随机包经验账对得上（升级扣掉的 100 也算）",
  s12.trainer.exp + (s12.trainer.level - 1) * 100 === exp12);
const dropCandy12 = Object.keys(s12.collection).reduce((sum, id) =>
  sum + (s12.collection[id].droppedCount || 0) * Gacha.TRAINER_CANDY_TABLE[Gacha.entry(Number(id))[4]], 0);
check("随机包糖果账对得上（升级 + 丢卡）",
  s12.trainer.candy === 2 * (s12.trainer.level - 1) + dropCandy12);

// 16. 超上限丢卡换糖果（Task 9）：N1/R2/SR4/SSR8/UR15/MR30
const candyCases = [
  { id: 10, tier: "N", want: 1 },
  { id: 25, tier: "R", want: 2 },
  { id: 12, tier: "SR", want: 4 },
  { id: 3, tier: "SSR", want: 8 },
  { id: 144, tier: "UR", want: 15 },
  { id: 150, tier: "MR", want: 30 }
];
candyCases.forEach(function (tc) {
  const s = Gacha.newState(0);
  [10, 20, 30, 40, 50, 60].forEach(lv => Gacha.addToCollection(s, { id: tc.id, level: lv, hp: 100, atk: 50 }));
  check(tc.tier + " 卡超上限掉 1 张，得 " + tc.want + " 糖果",
    Gacha.entry(tc.id)[4] === tc.tier && s.trainer.candy === tc.want &&
    s.collection[tc.id].droppedCount === 1 && s.collection[tc.id].cards.length === 5);
});
const cm = Gacha.newState(0);
[71, 40, 90, 65, 55, 88, 30].forEach((lv, i) => Gacha.addToCollection(cm, { id: 25, level: lv, hp: 100 + i, atk: 50 + i }));
check("R 卡 7 张进、掉 2 张最低，得 4 糖果", cm.trainer.candy === 4 && cm.collection[25].droppedCount === 2);
const cn = Gacha.newState(0);
[10, 20, 30, 40, 50].forEach(lv => Gacha.addToCollection(cn, { id: 25, level: lv, hp: 100, atk: 50 }));
check("正好 5 张不掉卡、不得糖果", cn.trainer.candy === 0 && (cn.collection[25].droppedCount || 0) === 0);
const cw = Gacha.newState(0);
[71, 40, 90, 65, 55].forEach(lv => Gacha.addToCollection(cw, { id: 25, level: lv, hp: 100, atk: 50 }));
Gacha.addToCollection(cw, { id: 25, level: 20, hp: 120, atk: 60 });
check("新抽 Lv 最低的卡直接被去掉，也换 2 糖果",
  cw.trainer.candy === 2 && cw.collection[25].cards.every(c => c.level !== 20));
const ce = Gacha.newState(0);
ce.collection[4] = { count: 8, bestLv: 94, bestHp: 264, bestAtk: 190, legacy: 0,
  cards: [94, 74, 69, 68, 68, 50, 40, 30].map(lv => ({ level: lv, hp: 200, atk: 100, pulledAt: 0 })) };
const removed = Gacha.enforceCap(ce);
check("enforceCap 掉 3 张 R 卡，得 6 糖果", removed === 3 && ce.trainer.candy === 6 && ce.collection[4].cards.length === 5);
const cl = { packs: 1, collection: {} };
[10, 20, 30, 40, 50, 60].forEach(lv => Gacha.addToCollection(cl, { id: 10, level: lv, hp: 100, atk: 50 }));
check("没训练师的老存档：掉卡照样换糖果", cl.trainer && cl.trainer.candy === 1);

// 17. 糖果给卡升级（Task 10）：1 糖果 +1 级，HP/攻击按公式重算，最高 100 级
const lv0 = Gacha.newState(0); lv0.trainer.candy = 5;
Gacha.addToCollection(lv0, { id: 1, level: 49, hp: 148, atk: 98 });
const card49 = lv0.collection[1].cards[0];
check("1 糖果升 1 级：Lv49→50，HP/攻击按公式重算",
  Gacha.levelUpCard(lv0, 1, card49, 1) === 1 && card49.level === 50 && card49.hp === 151 && card49.atk === 100 && lv0.trainer.candy === 4);
check("升级后 best 跟着变", lv0.collection[1].bestLv === 50 && lv0.collection[1].bestHp === 151);
const lv1 = Gacha.newState(0); lv1.trainer.candy = 40;
Gacha.addToCollection(lv1, { id: 1, level: 80, hp: 230, atk: 160 });
Gacha.addToCollection(lv1, { id: 1, level: 50, hp: 151, atk: 100 });
const card50 = lv1.collection[1].cards[1];
check("一次升 3 级：Lv50→53，扣 3 糖果",
  Gacha.levelUpCard(lv1, 1, card50, 3) === 3 && card50.level === 53 && lv1.trainer.candy === 37);
check("没超过 best，best 不变", lv1.collection[1].bestLv === 80);
check("再升 30 级超过 best：Lv53→83，best 跟着变",
  Gacha.levelUpCard(lv1, 1, card50, 30) === 30 && card50.level === 83 &&
  lv1.collection[1].bestLv === 83 && lv1.collection[1].bestHp === card50.hp);
check("糖果扣够数", lv1.trainer.candy === 7);
const lv2 = Gacha.newState(0); lv2.trainer.candy = 10;
Gacha.addToCollection(lv2, { id: 1, level: 99, hp: 290, atk: 195 });
const card99 = lv2.collection[1].cards[0];
check("99 级升 5 级：只升 1 级到 100，扣 1 糖果",
  Gacha.levelUpCard(lv2, 1, card99, 5) === 1 && card99.level === 100 && lv2.trainer.candy === 9);
check("满级再升：返回 0、糖果不动",
  Gacha.levelUpCard(lv2, 1, card99, 1) === 0 && lv2.trainer.candy === 9);
const lv3 = Gacha.newState(0); lv3.trainer.candy = 0;
Gacha.addToCollection(lv3, { id: 1, level: 50, hp: 151, atk: 100 });
check("0 糖果升不了", Gacha.levelUpCard(lv3, 1, lv3.collection[1].cards[0], 1) === 0 && lv3.collection[1].cards[0].level === 50);
const lv4 = Gacha.newState(0); lv4.trainer.candy = 2;
Gacha.addToCollection(lv4, { id: 1, level: 50, hp: 151, atk: 100 });
const card4 = lv4.collection[1].cards[0];
check("要升 5 级只有 2 糖果：升 2 级，糖果归零",
  Gacha.levelUpCard(lv4, 1, card4, 5) === 2 && card4.level === 52 && lv4.trainer.candy === 0);
const lv5 = Gacha.newState(0); lv5.trainer.candy = 5;
check("卡不在卡册里：返回 0、糖果不动",
  Gacha.levelUpCard(lv5, 1, { level: 50, hp: 151, atk: 100 }, 1) === 0 && lv5.trainer.candy === 5);
check("整只都没抽到：返回 0",
  Gacha.levelUpCard(lv5, 25, { level: 50, hp: 151, atk: 100 }, 1) === 0);
const lv6 = Gacha.newState(0); lv6.trainer.candy = 5;
Gacha.addToCollection(lv6, { id: 1, level: 50, hp: 151, atk: 100 });
const card6 = lv6.collection[1].cards[0];
check("升 0 级/负数/NaN：返回 0、不动",
  Gacha.levelUpCard(lv6, 1, card6, 0) === 0 && Gacha.levelUpCard(lv6, 1, card6, -3) === 0 &&
  Gacha.levelUpCard(lv6, 1, card6, NaN) === 0 && card6.level === 50 && lv6.trainer.candy === 5);
check("不传级数默认升 1 级", Gacha.levelUpCard(lv6, 1, card6) === 1 && card6.level === 51);

// 18. 注册训练师（Task 11/12）：名字 1–12 字，注册发 100 结晶（只一次）
check("名字前后空格去掉", Gacha.validateTrainerName("  小智  ").name === "小智");
check("空名字 / 只有空格：empty",
  Gacha.validateTrainerName("").error === "empty" && Gacha.validateTrainerName("   ").error === "empty");
check("12 个字通过、13 个字 tooLong",
  Gacha.validateTrainerName("一二三四五六七八九十一二").ok === true &&
  Gacha.validateTrainerName("一二三四五六七八九十一二三").error === "tooLong");
check("非字符串名字：empty",
  Gacha.validateTrainerName(null).error === "empty" && Gacha.validateTrainerName(123).error === "empty");
const rg = Gacha.newState(0);
check("注册成功：名字去空格、registered、100 结晶",
  Gacha.registerTrainer(rg, "  小智 ").ok === true && rg.trainer.name === "小智" &&
  rg.trainer.registered === true && rg.trainer.crystals === 100);
check("注册只发一次结晶：再注册只改名字",
  Gacha.registerTrainer(rg, "小茂").ok === true && rg.trainer.name === "小茂" && rg.trainer.crystals === 100);
check("注册失败不改状态",
  Gacha.registerTrainer(rg, "   ").ok === false && rg.trainer.name === "小茂" && rg.trainer.crystals === 100);
const rg2 = { packs: 1, collection: {}, trainer: { name: "   ", level: 1, exp: 0, crystals: 0, candy: 0, items: {}, registered: true, welcomeCrystalsGranted: false } };
Gacha.ensureTrainer(rg2);
check("老存档空白名字：registered 被修回 false", rg2.trainer.registered === false && rg2.trainer.name === "");
const rg3 = { packs: 1, collection: {} };
check("没训练师的老存档也能注册",
  Gacha.registerTrainer(rg3, "小智").ok === true && rg3.trainer.crystals === 100 && rg3.trainer.registered === true);

// 19. Task 17：边界与回归（之前两个评审留下的加固 + 边界）
// 19a. newState() 不传时间：lastGrantAt/createdAt 默认 Date.now()，计时不 NaN（PR #11 O1）
const ns0 = Gacha.newState();
check("newState() 不传时间：lastGrantAt 是数字",
  typeof ns0.lastGrantAt === "number" && isFinite(ns0.lastGrantAt));
check("newState() 不传时间：createdAt 和 lastGrantAt 是一刻",
  ns0.createdAt === ns0.lastGrantAt);
check("newState() 之后计时正常：2 小时补 2 包",
  Gacha.grantDuePacks(ns0, ns0.lastGrantAt + 2 * 3600 * 1000) === 2 && ns0.packs === 3);
// 19b. 计时边界：59 分钟不到点，整 1 小时补 1 包
const tg0 = Gacha.newState(1000000);
check("59 分钟不到点：0 包", Gacha.grantDuePacks(tg0, 1000000 + 59 * 60 * 1000) === 0 && tg0.packs === 1);
check("整 1 小时：补 1 包", Gacha.grantDuePacks(tg0, 1000000 + 60 * 60 * 1000) === 1 && tg0.packs === 2);
// 19c. levelUpCard 坏等级：手改存档的负数/小数/0 级都不能花糖果（PR #8 O1）
[-3, 50.5, 0].forEach(function (bad) {
  const s = Gacha.newState(0); s.trainer.candy = 5;
  Gacha.addToCollection(s, { id: 1, level: bad, hp: 100, atk: 50 });
  const c = s.collection[1].cards[0];
  check("坏等级 " + bad + "：返回 0、糖果不动、等级不动",
    Gacha.levelUpCard(s, 1, c, 1) === 0 && s.trainer.candy === 5 && c.level === bad);
});
// 19d. 一次加经验跨两个里程碑：9 级 +1700 → 26 级，两个球各 3 个、糖果 +34
const xp9 = Gacha.newState(0); xp9.trainer.level = 9; xp9.trainer.exp = 0;
const xr9 = Gacha.addTrainerExp(xp9, 1700);
check("9 级 +1700：连升 17 级到 26 级，两个里程碑各给 3 个球、糖果 +34",
  xr9.levels === 17 && xp9.trainer.level === 26 && xp9.trainer.exp === 0 &&
  xr9.items.great_ball === 3 && xr9.items.ultra_ball === 3 && xr9.candy === 34 && xp9.trainer.candy === 34);
// 19e. NEW 角标落在展示顺序的第一张上（Task 18：洗牌后判定；之前先判定再洗牌，角标会落在最后一张展示的卡上）
const sNB = Gacha.newState(0); sNB.packs = 1;
const packNB = Gacha.drawPack(sNB, () => 0); // 9 张 #001 + 保底 #003，展示顺序已洗牌
const onesNB = packNB.filter(function (c) { return c.id === 1; });
check("NEW 在第一张展示的 #001 上，其余 8 张没有",
  onesNB.length === 9 && onesNB[0].isNew === true && onesNB.slice(1).every(function (c) { return !c.isNew; }));
check("NEW 总数还是新物种数（#001 + #003）", packNB.filter(function (c) { return c.isNew; }).length === 2);

// §21. 遭遇战结晶每日上限（Task 29 的逻辑，Task 31 移到 gacha.js 给事件和宝箱共用）
check("每日 key：同一天相同、不同天不同",
  Gacha.encounterDayKey(new Date(2026, 10, 23)) === Gacha.encounterDayKey(new Date(2026, 10, 23, 23, 59)) &&
  Gacha.encounterDayKey(new Date(2026, 10, 23)) !== Gacha.encounterDayKey(new Date(2026, 10, 24)));
const sCap = Gacha.newState(1000000);
const grant1 = Gacha.grantEncounterCrystals(sCap, 5, new Date(2026, 10, 23));
check("发结晶：+5 全发、capped false",
  grant1.granted === 5 && grant1.capped === false &&
  Gacha.ensureTrainer(sCap).crystals === 5 &&
  Gacha.ensureTrainer(sCap).encounterCrystalsToday === 5);
const grant2 = Gacha.grantEncounterCrystals(sCap, 200, new Date(2026, 10, 23));
check("发结晶：今天只剩 95 → 只发 95、capped true",
  grant2.granted === 95 && grant2.capped === true &&
  Gacha.ensureTrainer(sCap).crystals === 100 &&
  Gacha.ensureTrainer(sCap).encounterCrystalsToday === 100);
const grant3 = Gacha.grantEncounterCrystals(sCap, 5, new Date(2026, 10, 23));
check("发结晶：已到上限 → 发 0、capped true",
  grant3.granted === 0 && grant3.capped === true &&
  Gacha.ensureTrainer(sCap).crystals === 100);
const grant4 = Gacha.grantEncounterCrystals(sCap, 5, new Date(2026, 10, 24));
check("发结晶：跨天清零、重新发",
  grant4.granted === 5 && grant4.capped === false &&
  Gacha.ensureTrainer(sCap).encounterCrystalsToday === 5);
check("发结晶：非法数额按 0 处理",
  Gacha.grantEncounterCrystals(sCap, NaN, new Date(2026, 10, 24)).granted === 0 &&
  Gacha.grantEncounterCrystals(sCap, -3, new Date(2026, 10, 24)).granted === 0);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
