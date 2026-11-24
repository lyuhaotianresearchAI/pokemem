// PokeMem — 遭遇战场景表与野生宝可梦生成（Task 25）
// 纯逻辑，可在浏览器和 Node 里共用；不碰 DOM、不碰存档、不打战斗。
// 依赖：图鉴 POKEDEX（pokedex.js）、属性模块 Types（js/types.js）、
// 数值公式 Gacha.statsForLevel（gacha.js，调用时读）。加载顺序见 index.html。
(function (root) {
  "use strict";
  var POKEDEX = root.POKEDEX || (typeof require !== "undefined" ? require("../pokedex.js").POKEDEX : []);
  var Types = (root.PokeMem && root.PokeMem.Types) || (typeof require !== "undefined" ? require("./types.js") : null);
  if (!POKEDEX.length) throw new Error("PokeMem: 图鉴数据未加载，请确认 pokedex.js 在 js/scenes.js 之前引入");
  if (!Types) throw new Error("PokeMem: 属性模块未加载，请确认 js/types.js 在 js/scenes.js 之前引入");

  var MEW_ID = 151; // 梦幻：不受场景属性限制，任何场景都可能出（用户定 2026-11-17）
  var BIRD_IDS = [144, 145, 146]; // 三圣鸟：急冻鸟、闪电鸟、火焰鸟
  var MEW_MEWTO_IDS = [150, 151]; // 超梦、梦幻

  // 场景表（用户定 2026-11-17；草丛基础等级原定 3，但全表 minLv 最小就是 5，
  // 基础 3 在第 1–2 场刷不出任何宝可梦，所以改成 5）
  // art：场景卡上的代表宝可梦（官方立绘，PokeAPI 同款图床）；卡面按场景渐变底色 + 这张立绘，
  // 悬停浮层再显示场景名和会出现哪些属性（用户定 2026-11-17）
  var SCENES = [
    { id: "grassland", zh: "草丛", en: "Grassland", unlockLevel: 1, baseLevel: 5, types: ["grass", "bug", "normal"], art: 1 },
    { id: "forest", zh: "森林", en: "Forest", unlockLevel: 5, baseLevel: 8, types: ["grass", "bug", "poison", "flying"], art: 12 },
    { id: "stream", zh: "溪流", en: "Stream", unlockLevel: 10, baseLevel: 12, types: ["water", "bug"], art: 54 },
    { id: "city", zh: "城市", en: "City", unlockLevel: 15, baseLevel: 16, types: ["normal", "electric", "poison"], art: 25 },
    { id: "desert", zh: "沙漠", en: "Desert", unlockLevel: 20, baseLevel: 22, types: ["ground", "rock", "fire"], art: 27 },
    { id: "cave", zh: "洞穴", en: "Cave", unlockLevel: 30, baseLevel: 30, types: ["rock", "ground", "poison", "ghost", "flying"], art: 74 },
    { id: "ocean", zh: "海洋", en: "Ocean", unlockLevel: 40, baseLevel: 38, types: ["water", "ice"], art: 7 },
    { id: "glacier", zh: "冰川", en: "Glacier", unlockLevel: 50, baseLevel: 48, types: ["ice", "water"], art: 144 },
    { id: "champions-road", zh: "冠军之路", en: "Champion's Road", unlockLevel: 70, baseLevel: 60, types: ["dragon", "psychic", "fighting", "ghost", "rock"], art: 149 },
  ];

  // 出场稀有度分档（胜场数 = 本场已击倒 / 抓到的只数，和深度同一个计数器；用户定 2026-11-17）
  var RARITY_BANDS = [
    { minWins: 0, weights: { N: 100 } },
    { minWins: 3, weights: { N: 70, R: 25, SR: 5 } },
    { minWins: 6, weights: { N: 50, R: 30, SR: 15, SSR: 5 } },
    { minWins: 10, weights: { N: 35, R: 30, SR: 20, SSR: 15 } },
    { minWins: 15, weights: { N: 30, R: 30, SR: 22, SSR: 17.85, UR: 0.1, MR: 0.05 } },
  ];

  function sceneById(id) {
    for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i];
    return null;
  }
  function sceneName(id, lang) {
    var s = sceneById(id);
    if (!s) return id;
    return lang === "en" ? s.en : s.zh;
  }
  // 该训练家等级已解锁的场景（按解锁等级排序，表本身就是这个顺序）
  function unlockedScenes(trainerLevel) {
    if (typeof trainerLevel !== "number" || !isFinite(trainerLevel)) trainerLevel = 1;
    return SCENES.filter(function (s) { return trainerLevel >= s.unlockLevel; });
  }
  function rarityBandFor(wins) {
    if (typeof wins !== "number" || !isFinite(wins) || wins < 0) wins = 0;
    wins = Math.floor(wins);
    var band = RARITY_BANDS[0];
    for (var i = 0; i < RARITY_BANDS.length; i++) if (wins >= RARITY_BANDS[i].minWins) band = RARITY_BANDS[i];
    return band;
  }
  // 野生等级 = 场景基础等级 + 2×深度（每胜 +2，用户定 2026-11-17：随胜场涨得更陡），上限 100；
  // 稀有野生有等级下限，取两者较高者
  // （SSR ≥ 携带最高等级 +5，UR / MR ≥ 携带最高等级 +10，用户定 2026-11-17）
  function wildLevelFor(scene, depth, tier, teamMaxLevel) {
    var level = Math.min(100, scene.baseLevel + depth * 2);
    if (typeof teamMaxLevel !== "number" || !isFinite(teamMaxLevel) || teamMaxLevel < 1) teamMaxLevel = 1;
    teamMaxLevel = Math.floor(teamMaxLevel);
    if (tier === "SSR") level = Math.max(level, teamMaxLevel + 5);
    else if (tier === "UR" || tier === "MR") level = Math.max(level, teamMaxLevel + 10);
    return Math.min(100, level);
  }
  // 稀有野生暴击率（用户定 2026-11-17）：普通野生 5%、SSR 10%、三圣鸟 20%、梦幻和超梦 30%
  function wildCritRate(id, tier) {
    if (MEW_MEWTO_IDS.indexOf(id) >= 0) return 30;
    if (BIRD_IDS.indexOf(id) >= 0) return 20;
    if (tier === "SSR") return 10;
    return 5;
  }
  // 稀有野生生命值上限倍率（用户定 2026-11-17）：SSR ×2、三圣鸟 ×3、梦幻和超梦 ×5；攻击不变
  function wildHpMult(id, tier) {
    if (MEW_MEWTO_IDS.indexOf(id) >= 0) return 5;
    if (BIRD_IDS.indexOf(id) >= 0) return 3;
    if (tier === "SSR") return 2;
    return 1;
  }
  // 稀有度等级（Task 31：流星事件要「至少 SR」、草丛里的蛋要「只出 N」）
  var TIER_RANK = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, MR: 5 };
  // 该场景、该等级能出的宝可梦行：任一属性在场景列表里，且 minLv ≤ 等级；
  // 梦幻（#151）不受场景属性限制。返回图鉴行数组（按编号升序）。
  // typeFilter 指定时只出含该属性的种（钓鱼只要水系；这时梦幻也不例外）。
  function eligibleSpecies(scene, level, typeFilter) {
    return POKEDEX.filter(function (row) {
      if (row[6] > level) return false;
      if (typeFilter) {
        var types = Types.parseTypes(row[3]);
        return types.indexOf(typeFilter) >= 0;
      }
      if (row[0] === MEW_ID) return true;
      var types = Types.parseTypes(row[3]);
      for (var i = 0; i < types.length; i++) if (scene.types.indexOf(types[i]) >= 0) return true;
      return false;
    });
  }
  // 做一只野生宝可梦实例：数值按公式算（攻击不变），生命值上限按稀有度放大，
  // 当前 HP 出场时是满的；baseHp 是不放大的公式 HP（抓到后按这个进卡册）。
  // firstType 是第一属性（战斗里攻击属性只用第一个）。
  function makeWild(row, level) {
    var st = root.Gacha.statsForLevel(row, level);
    var hpMult = wildHpMult(row[0], row[4]);
    var hpMax = st.hp * hpMult;
    var types = Types.parseTypes(row[3]);
    return { id: row[0], name: row[1], en: row[2], types: row[3], tier: row[4], prob: row[5],
      level: level, hp: hpMax, hpMax: hpMax, hpMult: hpMult, baseHp: st.hp, atk: st.atk,
      critRate: wildCritRate(row[0], row[4]), firstType: types[0] || "normal" };
  }
  // 刷一只野生宝可梦：sceneId 场景，wins 本场已胜场数（= 深度），
  // teamMaxLevel 携带的最高等级，rng 随机数（默认 Math.random）。
  // 先按分档权重抽稀有度——只在有候选的稀有度里抽，没候选的档不参与、权重归到其他档；
  // 各稀有度按它自己的有效等级（曲线与稀有楼层取高者）过滤候选，档内均匀抽一只。
  // 场景不存在、或该等级没有任何可选种时返回 null。
  // opts 可选（Task 31 事件用）：{ typeFilter（只出某属性）, minTier（稀有度下限）,
  // maxTier（稀有度上限） }；任一过滤后没有候选时回落到不过滤（保证总能刷出）。
  function spawnWild(sceneId, wins, teamMaxLevel, rng, opts) {
    rng = rng || Math.random;
    var scene = sceneById(sceneId);
    if (!scene) return null;
    if (typeof wins !== "number" || !isFinite(wins) || wins < 0) wins = 0;
    wins = Math.floor(wins);
    if (typeof teamMaxLevel !== "number" || !isFinite(teamMaxLevel) || teamMaxLevel < 1) teamMaxLevel = 1;
    teamMaxLevel = Math.floor(teamMaxLevel);
    var band = rarityBandFor(wins);
    var tiers = Object.keys(band.weights);
    var minRank = opts && TIER_RANK[opts.minTier] != null ? TIER_RANK[opts.minTier] : 0;
    var maxRank = opts && TIER_RANK[opts.maxTier] != null ? TIER_RANK[opts.maxTier] : 99;
    var typeFilter = opts && opts.typeFilter;
    function buildPool() {
      var pool = {};
      var totalWeight = 0;
      tiers.forEach(function (tier) {
        if (TIER_RANK[tier] < minRank || TIER_RANK[tier] > maxRank) return;
        var level = wildLevelFor(scene, wins, tier, teamMaxLevel);
        var rows = eligibleSpecies(scene, level, typeFilter).filter(function (row) { return row[4] === tier; });
        if (rows.length) { pool[tier] = { rows: rows, level: level }; totalWeight += band.weights[tier]; }
      });
      return { pool: pool, totalWeight: totalWeight };
    }
    var built = buildPool();
    if (!built.totalWeight) { minRank = 0; maxRank = 99; typeFilter = null; built = buildPool(); } // 过滤卡死时回落
    var pool = built.pool;
    var totalWeight = built.totalWeight;
    if (!totalWeight) return null;
    var participating = tiers.filter(function (t) { return !!pool[t]; });
    var r = rng() * totalWeight;
    var tier = participating[participating.length - 1];
    for (var i = 0; i < participating.length; i++) {
      r -= band.weights[participating[i]];
      if (r < 0) { tier = participating[i]; break; }
    }
    var entry = pool[tier];
    // rng() 理论上返回 [0,1)，但一个返回 1 的 rng 会让下标越界——夹一下保底
    var row = entry.rows[Math.min(entry.rows.length - 1, Math.floor(rng() * entry.rows.length))];
    return makeWild(row, entry.level);
  }

  var Scenes = { SCENES: SCENES, RARITY_BANDS: RARITY_BANDS, TIER_RANK: TIER_RANK, MEW_ID: MEW_ID,
    BIRD_IDS: BIRD_IDS, MEW_MEWTO_IDS: MEW_MEWTO_IDS,
    sceneById: sceneById, sceneName: sceneName, unlockedScenes: unlockedScenes,
    rarityBandFor: rarityBandFor, wildLevelFor: wildLevelFor,
    wildCritRate: wildCritRate, wildHpMult: wildHpMult,
    eligibleSpecies: eligibleSpecies, makeWild: makeWild, spawnWild: spawnWild };

  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.Scenes = Scenes;
  }
  if (typeof module !== "undefined") module.exports = Scenes;
})(typeof window !== "undefined" ? window : globalThis);
