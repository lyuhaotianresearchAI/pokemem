// PokeMem 卡片成长数据 — 每张卡的经验值与亲密度（Task 24，遭遇战）
// 纯函数，可在浏览器和 Node 里共用；只管卡片成长，不碰抽卡/卡册/训练师。
// 依赖 gacha.js 的 entry / statsForLevel / TRAINER_MAX_LEVEL，调用时从 root.Gacha 读，
// 所以加载顺序不限，但 gacha.js 必须在第一次调用前加载好（index.html 里本文件在 gacha.js 之前）。
(function (root) {
  "use strict";
  // 亲密度等级 0–10：累计点数制，N 级要累计 10×N 点（1 级 10 点、10 级 100 点）
  // 经验值：N 级升 N+1 级要 N 点经验；单卡最高 100 级（和训练师同一个上限）
  var AFFECTION_MAX_LEVEL = 10;
  var AFFECTION_POINTS_PER_LEVEL = 10;

  // 两个字段的合法值都是非负整数；缺失/坏值一律按 0 处理（老卡、手工存档）
  function normalizeCardProgress(card) {
    if (!card || typeof card !== "object") return card;
    if (typeof card.exp !== "number" || !isFinite(card.exp) || card.exp < 0) card.exp = 0;
    else card.exp = Math.floor(card.exp);
    if (typeof card.affection !== "number" || !isFinite(card.affection) || card.affection < 0) card.affection = 0;
    else card.affection = Math.floor(card.affection);
    return card;
  }
  // 老卡补字段：启动时给所有已存卡补 exp/affection（默认 0）；只补缺失/坏值，不改已有数值。
  // 返回补了几张（幂等：第二遍返回 0）。要在 migrateCollection / repairLegacyCards 之后跑，
  // 因为那两处补的明细卡也没有这两个字段。
  function repairCardProgress(state) {
    var fixed = 0;
    Object.keys(state.collection).forEach(function (id) {
      var e = state.collection[id];
      if (!e || !e.cards) return;
      e.cards.forEach(function (c) {
        var oldExp = c.exp, oldAff = c.affection;
        normalizeCardProgress(c);
        if (c.exp !== oldExp || c.affection !== oldAff) fixed++;
      });
    });
    return fixed;
  }
  // 亲密度等级（累计点数制）：0–9 点 0 级，10–19 点 1 级，……，100 点以上 10 级
  function affectionLevel(points) {
    if (typeof points !== "number" || !isFinite(points) || points < 0) return 0;
    return Math.min(AFFECTION_MAX_LEVEL, Math.floor(points / AFFECTION_POINTS_PER_LEVEL));
  }
  // 升一级要的经验 = 当前等级（50 级升 51 级要 50 点）；满级或非法等级返回 0
  function cardExpNeeded(level) {
    if (typeof level !== "number" || !isFinite(level) || level < 1) return 0;
    if (level >= root.Gacha.TRAINER_MAX_LEVEL) return 0;
    return Math.floor(level);
  }
  // 这张卡的暴击率（%）：亲密度等级 × 2（0 级 0%、10 级 20%）
  function critRateForCard(card) {
    if (!card || typeof card !== "object") return 0;
    return affectionLevel(card.affection) * 2;
  }
  // 这张卡的闪避率（%）：只有我方有；基础值 = 高出对方的等级差（低了就是 0），
  // 再加亲密度等级 × 0.5（0 级 0%、10 级 5%）；不设上限
  function evasionRateForCard(card, foeLevel) {
    if (!card || typeof card !== "object") return 0;
    var gap = (typeof card.level === "number" && isFinite(card.level) ? card.level : 0) -
      (typeof foeLevel === "number" && isFinite(foeLevel) ? foeLevel : 0);
    return Math.max(0, gap) + affectionLevel(card.affection) * 0.5;
  }
  // 给卡加经验（遭遇战每轮结算用）：加经验、溢出顺延连升、满级封顶、HP/攻击按公式重算。
  // card 必须是卡册里那张卡的对象（和 levelUpCard 一样的校验）；返回实际升了几级。
  // 升级只加最大 HP 和攻击，不碰当前生命值（遭遇战里的当前 HP 另有状态管）；经验值保留在卡上。
  function applyExpGain(state, id, card, amount) {
    if (typeof amount !== "number" || !isFinite(amount)) amount = 0;
    amount = Math.floor(amount);
    if (amount <= 0) return 0;
    var e = state.collection[id];
    if (!e || !e.cards) return 0;
    if (e.cards.indexOf(card) < 0) return 0;
    if (!card || typeof card.level !== "number" || !isFinite(card.level)) return 0;
    if (Math.floor(card.level) !== card.level || card.level < 1) return 0; // 坏等级不加经验（和 levelUpCard 一致）
    if (card.level >= root.Gacha.TRAINER_MAX_LEVEL) return 0;
    normalizeCardProgress(card);
    var row = root.Gacha.entry(Number(id));
    if (!row) return 0;
    card.exp += amount;
    var gained = 0;
    while (card.exp >= card.level && card.level < root.Gacha.TRAINER_MAX_LEVEL) {
      card.exp -= card.level;
      card.level += 1;
      gained += 1;
      var st = root.Gacha.statsForLevel(row, card.level);
      card.hp = st.hp;
      card.atk = st.atk;
    }
    if (card.level >= root.Gacha.TRAINER_MAX_LEVEL) card.exp = 0;
    if (gained > 0) { // best 取最高等级那张卡的数值（和 levelUpCard 一致）
      var best = e.cards[0];
      e.cards.forEach(function (c) { if (c.level > best.level) best = c; });
      e.bestLv = best.level; e.bestHp = best.hp; e.bestAtk = best.atk;
    }
    return gained;
  }

  var api = { AFFECTION_MAX_LEVEL: AFFECTION_MAX_LEVEL, AFFECTION_POINTS_PER_LEVEL: AFFECTION_POINTS_PER_LEVEL,
    normalizeCardProgress: normalizeCardProgress, repairCardProgress: repairCardProgress,
    affectionLevel: affectionLevel, cardExpNeeded: cardExpNeeded,
    critRateForCard: critRateForCard, evasionRateForCard: evasionRateForCard, applyExpGain: applyExpGain };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CardProgress = api;
})(typeof window !== "undefined" ? window : globalThis);
