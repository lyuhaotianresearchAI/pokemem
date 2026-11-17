// PokeMem 开包预览/提交验证：node test/pack-settle.test.js
// 没翻牌关闭 = 包没开过：预览不改存档，提交才扣包入册结算
require("../card-progress.js"); // 副作用：挂 globalThis.CardProgress（gacha.js 入册时用）
const Gacha = require("../gacha.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}
function snap(s) { return JSON.stringify(s); }
function seeded(seed) { let x = seed; return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

// 1. 预览不改存档
const s1 = Gacha.newState(0); s1.packs = 3;
const before1 = snap(s1);
const prev1 = Gacha.drawPackPreview(s1, seeded(123));
check("预览返回 10 张", prev1.length === 10);
check("预览不改存档（包数/保底/卡册/经验/总抽全不动）", snap(s1) === before1);
check("预览挂了预计经验", prev1.trainerExp && prev1.trainerExp.exp > 0, "预计经验 " + (prev1.trainerExp && prev1.trainerExp.exp));
check("预览挂了预计丢卡糖果", typeof prev1.trainerCandyGained === "number");

// 2. 预览后提交：包数、总抽、开包数、保底、卡册、经验全部到位
const lvBefore = Gacha.ensureTrainer(s1).level;
const r1 = Gacha.settlePack(s1, prev1);
check("提交后包数 3→2", s1.packs === 2, "包数 " + s1.packs);
check("提交后总抽 +10、开包数 +1", s1.totalDraws === 10 && s1.packsOpened === 1);
check("提交后保底计数 = 预览算出的值", s1.sinceSSR === prev1.sinceSSR, "sinceSSR " + s1.sinceSSR);
check("提交后卡册拥有数 = 包内去重数", Gacha.ownedCount(s1) === new Set(prev1.map(c => c.id)).size);
check("提交返回的经验 = 预览的预计经验", r1.exp === prev1.trainerExp.exp);
const t1 = Gacha.ensureTrainer(s1);
check("提交后训练师经验加上了", (t1.level - lvBefore) * 100 + t1.exp === r1.exp,
  "等级 " + lvBefore + "→" + t1.level + "，经验 " + t1.exp + "，包经验 " + r1.exp);
check("提交后丢卡糖果 = 预览的预计值", r1.dropCandy === prev1.trainerCandyGained);

// 3. 预览后不提交（模拟直接关闭）：存档与预览前完全一致
const s2 = Gacha.newState(0); s2.packs = 2;
const before2 = snap(s2);
Gacha.drawPackPreview(s2, Math.random);
check("预览后不提交，存档原样不动", snap(s2) === before2);

// 4. drawPack 与 preview+settle 同种子抽出同一包、提交后存档一致（行为不变）
const sa = Gacha.newState(0); sa.packs = 1;
const sb = Gacha.newState(0); sb.packs = 1;
const packA = Gacha.drawPack(sa, seeded(42));
const prevB = Gacha.drawPackPreview(sb, seeded(42));
Gacha.settlePack(sb, prevB);
check("同种子：drawPack 与 preview+settle 抽出相同的卡",
  JSON.stringify(packA.map(c => c.id + ":" + c.level)) === JSON.stringify(prevB.map(c => c.id + ":" + c.level)));
function stripPulledAt(s) {
  const c = JSON.parse(JSON.stringify(s));
  Object.keys(c.collection).forEach(id => (c.collection[id].cards || []).forEach(card => { card.pulledAt = 0; }));
  return JSON.stringify(c);
}
check("同种子：drawPack 与 preview+settle 提交后存档一致（除 pulledAt 时间戳）",
  stripPulledAt(sa) === stripPulledAt(sb));

// 5. 保底在预览里也生效，且预览不提前消耗保底
// rng 恒 0：不保底时全抽 #001；sinceSSR=49 时第 1 张强制出 SSR+（#003 妙蛙花），其余 9 张仍是 #001
const s5 = Gacha.newState(0); s5.packs = 1; s5.sinceSSR = 49;
const prev5 = Gacha.drawPackPreview(s5, () => 0);
check("sinceSSR=49 时预览里恰好 1 张保底 SSR+（其余 9 张是 #001）",
  prev5.filter(c => Gacha.SSR_PLUS.includes(c.tier)).length === 1 && prev5.filter(c => c.id === 1).length === 9,
  "SSR+ " + prev5.filter(c => Gacha.SSR_PLUS.includes(c.tier)).length + " 张");
check("预览算出的保底计数是 9（保底后连抽 9 张非 SSR+）", prev5.sinceSSR === 9, "sinceSSR " + prev5.sinceSSR);
check("预览没消耗保底（sinceSSR 仍是 49）", s5.sinceSSR === 49);
Gacha.settlePack(s5, prev5);
check("提交后保底计数写回 9", s5.sinceSSR === 9, "sinceSSR " + s5.sinceSSR);

// 6. 10 连保底：预览的包也至少 1 张 SR+，且多次预览不改存档
const s6 = Gacha.newState(0); s6.packs = 1;
let bad = 0;
for (let i = 0; i < 200; i++) {
  const p = Gacha.drawPackPreview(s6, Math.random);
  if (!p.some(c => Gacha.SR_PLUS.includes(c.tier))) bad++;
}
check("200 个预览包全部含 SR+", bad === 0);
check("200 次预览后存档仍是原样", s6.packs === 1 && s6.totalDraws === 0 && Object.keys(s6.collection).length === 0);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
