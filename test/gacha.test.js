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

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
