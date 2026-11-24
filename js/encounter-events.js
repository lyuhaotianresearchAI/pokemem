// PokeMem — 遭遇战随机路线事件（Task 31）
// 纯逻辑，可在浏览器和 Node 里共用；不碰 DOM、不直接读写存档。
// 依赖：抽卡核心 Gacha（gacha.js，训练师数据 + 结晶上限 helper）、
// 卡片成长 CardProgress（card-progress.js，经验 / 亲密度）。
// Task 32 再把它接进 js/encounter.js（event 阶段、nextStep、开打）；
// Task 33 再接界面（事件屏）。
// 触发（设计稿 encounter-events.md）：开场第一步固定是战斗，之后每次点「继续前进」
// 时 roll 一次——70% 野生战斗 / 30% 随机事件；事件当场结算（效果立即生效并保存）。
// 结晶与每日上限（用户定 2026-11-23）：事件给的结晶同样计入每日 100 上限；
// 今天已到上限时，结晶不再发、改给亲密度：事件直接给的结晶 → 出战卡亲密度 +1；
// 宝箱结算被封顶的部分 → 出战卡亲密度 +2；亲密度满 10 级就无效（什么都不给）。
// 胜场战利品的结晶（Task 32 的 pendingBonus）到上限时也是 +1，在发战利品的地方转。
// 流星本身是独立 1% 概率（用户定 2026-11-23）：先单独 roll 一次，中了直接出流星。
// 负面事件先不给补偿（用户定 2026-11-23）。
(function (root) {
  "use strict";
  var Gacha = root.Gacha || (typeof require !== "undefined" ? require("../gacha.js") : null);
  var CardProgress = root.CardProgress || (typeof require !== "undefined" ? require("../card-progress.js") : null);
  if (!Gacha) throw new Error("PokeMem: 抽卡核心未加载，请确认 gacha.js 在 js/encounter-events.js 之前引入");
  if (!CardProgress) throw new Error("PokeMem: 卡片成长模块未加载，请确认 card-progress.js 在 js/encounter-events.js 之前引入");

  var WEIGHTS = { common: 10, uncommon: 5, rare: 2 }; // 常见 / 少见 / 稀有
  var STONES = ["fire_stone", "water_stone", "thunder_stone", "leaf_stone", "moon_stone"];
  // 宝箱事件的道具池：除大师球外的 8 种（3 种球 + 5 种石头），和 js/encounter.js 的
  // CHEST_ITEM_POOL 保持一致（改一边要改另一边）。
  var ITEM_POOL = ["poke_ball", "great_ball", "ultra_ball", "fire_stone",
    "water_stone", "thunder_stone", "leaf_stone", "moon_stone"];
  var METEOR_ID = "meteor"; // 流星：封顶替换的目标事件（给结晶的事件被它替换）；效果是本次遭遇战结算奖励翻倍

  // 事件表（43 种；设计稿 encounter-events.md）。
  // scenes 为 null = 全部场景；text 是事件屏上显示的效果文案，{n} 在结算时换成实际数
  // （只用于结晶——到上限前只发到一部分时，实际发的数和表里的数不一样）。
  // fx 是效果描述（见 applyEvent 的解释）；battle 是战斗类事件的开打参数，
  // bonus 是胜场战利品（Task 32 在 winRound 里发）。
  var EVENTS = [
    // ---- 战斗类（7 种） ----
    { id: "help-stranger", zh: "路见不平", en: "Good Samaritan", kind: "battle", scenes: null, weight: "common",
      text: { zh: "路人被野生宝可梦围住了，帮他赶走它！胜 → 得 1 精灵球", en: "A passerby is cornered by a wild Pokémon! Win to get 1 Poké Ball." },
      battle: { levelBonus: 0, bonus: { items: { poke_ball: 1 } } } },
    { id: "trainer-duel", zh: "训练师挑战", en: "Trainer Battle", kind: "battle", scenes: null, weight: "common",
      text: { zh: "路过的训练师向你挑战！胜 → 得 {n} 梦想结晶", en: "A passing Trainer challenges you! Win to get {n} Dream Crystals." },
      battle: { levelBonus: 2, bonus: { crystals: 2 } } },
    { id: "food-fight", zh: "抢食的宝可梦", en: "Food Fight", kind: "battle", scenes: ["grassland", "forest", "stream"], weight: "common",
      text: { zh: "野生宝可梦在抢树果！胜 → 得 3 糖果", en: "A wild Pokémon is stealing berries! Win to get 3 Candy." },
      battle: { levelBonus: 0, bonus: { candy: 3 } } },
    { id: "nest-guard", zh: "守巢的宝可梦", en: "Nest Guardian", kind: "battle", scenes: ["forest", "cave", "champions-road"], weight: "uncommon",
      text: { zh: "它在守护巢里的蛋！胜 → 得 1 随机进化石", en: "It is guarding its nest! Win to get 1 random Evolution Stone." },
      battle: { levelBonus: 3, bonus: { randomStone: true } } },
    { id: "lost-mon", zh: "迷路的宝可梦", en: "Lost Pokémon", kind: "battle", scenes: null, weight: "uncommon",
      text: { zh: "迷路的宝可梦把你当成了敌人！胜 → 出战卡亲密度 +2", en: "A lost Pokémon mistakes you for a foe! Win for +2 Affection on the active card." },
      battle: { levelBonus: 0, bonus: { affection: 2 } } },
    { id: "arena", zh: "擂台赛", en: "Arena Match", kind: "battle", scenes: ["city"], weight: "uncommon",
      text: { zh: "城市擂台！连打 2 场等级 +2 的野生，全胜 → 得 {n} 梦想结晶", en: "City arena! Win 2 battles in a row against wild Pokémon 2 levels higher to get {n} Dream Crystals." },
      battle: { levelBonus: 2, arena: true, bonus: { crystals: 5 } } },
    { id: "deep-roar", zh: "洞穴深处的吼声", en: "Roar from the Depths", kind: "battle", scenes: ["cave", "champions-road"], weight: "rare",
      text: { zh: "洞穴深处传来吼声……胜 → 得 {n} 梦想结晶", en: "A roar echoes from the depths... Win to get {n} Dream Crystals." },
      battle: { levelBonus: 5, bonus: { crystals: 3 } } },
    // ---- 回复类（6 种） ----
    { id: "pokemon-center", zh: "宝可梦中心", en: "Pokémon Center", kind: "heal", scenes: ["city"], weight: "uncommon",
      text: { zh: "宝可梦中心！全队 HP 回满了（倒下的也复活）", en: "A Pokémon Center! The whole team is fully healed — fainted members revive too." },
      fx: { healFull: true, reviveAll: true } },
    { id: "hot-spring", zh: "温泉", en: "Hot Spring", kind: "heal", scenes: ["glacier", "stream"], weight: "uncommon",
      text: { zh: "泡了个温泉，全队恢复了 50% 生命", en: "A relaxing hot spring! The whole team recovered 50% HP." },
      fx: { healPct: 0.5 } },
    { id: "berry-bush", zh: "树果丛", en: "Berry Bush", kind: "heal", scenes: ["grassland", "forest"], weight: "common",
      text: { zh: "摘了些树果，全队恢复了 30% 生命，得到 1 糖果", en: "You picked some berries! The whole team recovered 30% HP and you got 1 Candy." },
      fx: { healPct: 0.3, candy: 1 } },
    { id: "picnic", zh: "野餐休息", en: "Picnic Break", kind: "heal", scenes: null, weight: "common",
      text: { zh: "原地野餐休息，全队恢复了 25% 生命，出战卡亲密度 +1", en: "A picnic break! The whole team recovered 25% HP, +1 Affection on the active card." },
      fx: { healPct: 0.25, affection: 1 } },
    { id: "kind-nurse", zh: "好心的护士", en: "Kind Nurse", kind: "heal", scenes: null, weight: "uncommon",
      text: { zh: "好心的护士帮了你一把：有倒下的队员就复活到 50% HP，否则全队回 20%", en: "A kind nurse helped out: a fainted member revives at 50% HP — or the whole team recovers 20% if none fainted." },
      fx: { revive: 0.5, elseHealPct: 0.2 } },
    { id: "desert-oasis", zh: "沙漠绿洲", en: "Desert Oasis", kind: "heal", scenes: ["desert"], weight: "uncommon",
      text: { zh: "沙漠里的绿洲！全队 HP 回满了（有倒下的队员就随机复活一只），得到 1 糖果", en: "An oasis in the desert! The whole team is fully healed (a fainted member revives at random, if any), and you got 1 Candy." },
      fx: { healFull: true, reviveOne: true, candy: 1 } },
    // ---- 增益类（9 种） ----
    { id: "kind-mentor", zh: "好心人指导", en: "Kind Mentor", kind: "buff", scenes: null, weight: "uncommon",
      text: { zh: "好心人指点了你的宝可梦，本次遭遇战全队攻击 +5", en: "A kind mentor coached your team! +5 Attack for the whole team this encounter." },
      fx: { atkBonus: 5 } },
    { id: "training", zh: "特训", en: "Training", kind: "buff", scenes: null, weight: "common",
      text: { zh: "来了一场特训，出战卡获得 10 经验", en: "A quick training session! The active card gained 10 EXP." },
      fx: { exp: 10 } },
    { id: "lucky-clover", zh: "幸运草", en: "Lucky Clover", kind: "buff", scenes: ["grassland", "forest"], weight: "uncommon",
      text: { zh: "找到了一株四叶草！下一场捕捉率 ×1.5", en: "You found a four-leaf clover! Catch rate ×1.5 next battle." },
      fx: { catchMultNext: 1.5 } },
    { id: "cheer-song", zh: "激励的歌声", en: "Cheering Song", kind: "buff", scenes: null, weight: "uncommon",
      text: { zh: "远处传来激励的歌声，本次遭遇战全队暴击率 +10%", en: "A cheering song drifts over! +10% crit rate for the whole team this encounter." },
      fx: { critBonus: 10 } },
    { id: "apprentice-tip", zh: "道馆学徒的指点", en: "Gym Apprentice's Tip", kind: "buff", scenes: ["city", "champions-road"], weight: "uncommon",
      text: { zh: "道馆学徒指点了你，下一场战斗伤害 ×1.5", en: "A gym apprentice shared a tip! Damage ×1.5 next battle." },
      fx: { damageMultNext: 1.5 } },
    { id: "morning-run", zh: "晨跑热身", en: "Morning Run", kind: "buff", scenes: null, weight: "common",
      text: { zh: "晨跑热身完毕，下一场战斗己方先攻", en: "Warmed up with a morning run! You strike first next battle." },
      fx: { forceFirstNext: true } },
    { id: "team-cheer", zh: "队友的加油", en: "Team Cheer", kind: "buff", scenes: null, weight: "common",
      text: { zh: "队友们互相加油，全队亲密度 +1", en: "Your team cheers each other on! +1 Affection for the whole team." },
      fx: { affectionAll: 1 } },
    { id: "road-tablet", zh: "冠军之路的石碑", en: "Champion's Tablet", kind: "buff", scenes: ["champions-road"], weight: "uncommon",
      text: { zh: "冠军之路的石碑上刻着前人的心得，本次遭遇战全队攻击 +5", en: "A tablet on Champion's Road holds a past champion's wisdom! +5 Attack for the whole team this encounter." },
      fx: { atkBonus: 5 } },
    { id: "trainer-school", zh: "训练家学校", en: "Trainer School", kind: "buff", scenes: ["city"], weight: "uncommon",
      text: { zh: "在训练家学校上了一课，出战卡获得 15 经验", en: "A lesson at the Trainer School! The active card gained 15 EXP." },
      fx: { exp: 15 } },
    // ---- 减益 / 风险类（6 种；先不给补偿，用户定 2026-11-23） ----
    { id: "rough-road", zh: "难走的道路", en: "Rough Road", kind: "debuff", scenes: null, weight: "uncommon",
      text: { zh: "道路崎岖难行，随机一半队员无法出战（本场剩余）", en: "The road is rough! Half of your team (at random) can't battle for the rest of this encounter." },
      fx: { disableHalf: true } },
    { id: "poison-fog", zh: "毒雾", en: "Poison Fog", kind: "debuff", scenes: ["cave", "forest"], weight: "uncommon",
      text: { zh: "毒雾弥漫，全队当前 HP -20%", en: "Poison fog rolls in! The whole team loses 20% of current HP." },
      fx: { hpPct: -0.2 } },
    { id: "rainstorm", zh: "暴雨", en: "Rainstorm", kind: "debuff", scenes: ["stream", "ocean"], weight: "uncommon",
      text: { zh: "暴雨突至，下一场战斗野生先攻", en: "A sudden rainstorm! The wild Pokémon strikes first next battle." },
      fx: { forceWildFirstNext: true } },
    { id: "trap", zh: "陷阱", en: "Trap", kind: "debuff", scenes: ["cave", "desert"], weight: "uncommon",
      text: { zh: "踩到了陷阱！出战卡当前 HP -30%", en: "You stepped into a trap! The active Pokémon loses 30% of current HP." },
      fx: { hpActivePct: -0.3 } },
    { id: "lost-way", zh: "迷路", en: "Lost", kind: "debuff", scenes: null, weight: "uncommon",
      text: { zh: "迷路了，绕了好大一圈，本场剩余野生等级 +3", en: "You got lost and wandered in circles! Remaining wild Pokémon are +3 levels." },
      fx: { wildLevelBonus: 3 } },
    { id: "noisy-mon", zh: "吵闹的宝可梦", en: "Noisy Pokémon", kind: "debuff", scenes: null, weight: "common",
      text: { zh: "一只吵闹的宝可梦吓跑了猎物，下一场捕捉率 ×0.5", en: "A noisy Pokémon scared off the prey! Catch rate ×0.5 next battle." },
      fx: { catchMultNext: 0.5 } },
    // ---- 奖励类（7 种） ----
    { id: "lost-wallet", zh: "掉落的钱包", en: "Lost Wallet", kind: "reward", scenes: ["city"], weight: "common",
      text: { zh: "捡到了一个掉落的钱包，获得 {n} 梦想结晶", en: "You found a lost wallet! You got {n} Dream Crystals." },
      fx: { crystals: 5 } },
    { id: "treasure-chest", zh: "宝箱", en: "Treasure Chest", kind: "reward", scenes: ["cave", "champions-road"], weight: "uncommon",
      text: { zh: "发现了一个宝箱！获得 1 随机道具", en: "You found a treasure chest! You got 1 random item." },
      fx: { randomItem: true } },
    { id: "merchant-gift", zh: "商人的馈赠", en: "Merchant's Gift", kind: "reward", scenes: null, weight: "common",
      text: { zh: "路过的商人送了你 2 精灵球", en: "A passing merchant gifted you 2 Poké Balls." },
      fx: { items: { poke_ball: 2 } } },
    { id: "grandpa-gift", zh: "老爷爷的礼物", en: "Grandpa's Gift", kind: "reward", scenes: null, weight: "common",
      text: { zh: "老爷爷送了你 3 糖果", en: "A kind grandpa gave you 3 Candy." },
      fx: { candy: 3 } },
    { id: "hidden-cave", zh: "隐藏的洞穴", en: "Hidden Cave", kind: "reward", scenes: ["cave"], weight: "rare",
      text: { zh: "发现了隐藏的洞穴！获得 {n} 梦想结晶", en: "You found a hidden cave! You got {n} Dream Crystals." },
      fx: { crystals: 10 } },
    { id: "meteor", zh: "流星", en: "Meteor", kind: "reward", scenes: null, weight: "rare",
      text: { zh: "夜空划过一颗流星……本次遭遇战结算奖励翻倍！", en: "A meteor streaks across the sky... This encounter's settlement rewards are doubled!" },
      fx: { chestMult: 2 } },
    { id: "angler-gift", zh: "钓鱼佬的馈赠", en: "Angler's Gift", kind: "reward", scenes: ["stream", "ocean"], weight: "uncommon",
      text: { zh: "钓鱼佬送了你 1 高级球", en: "An angler gave you 1 Ultra Ball." },
      fx: { items: { ultra_ball: 1 } } },
    // ---- 场景特色（8 种） ----
    { id: "fishing", zh: "钓鱼", en: "Fishing", kind: "battle", scenes: ["stream", "ocean"], weight: "common",
      text: { zh: "甩竿钓鱼，钓到了一只水系野生宝可梦！", en: "You cast your line and hooked a Water-type wild Pokémon!" },
      battle: { levelBonus: 0, typeFilter: "water" } },
    { id: "surf-race", zh: "冲浪比赛", en: "Surf Race", kind: "battle", scenes: ["ocean"], weight: "uncommon",
      text: { zh: "有人向你发起冲浪比赛！胜 → 得 {n} 梦想结晶", en: "Someone challenges you to a surf race! Win to get {n} Dream Crystals." },
      battle: { levelBonus: 2, typeFilter: "water", bonus: { crystals: 3 } } },
    { id: "sandstorm", zh: "沙暴", en: "Sandstorm", kind: "debuff", scenes: ["desert"], weight: "uncommon",
      text: { zh: "沙暴来了！全队当前 HP -15%，但本场剩余野生等级 +2", en: "A sandstorm hits! The whole team loses 15% of current HP, but remaining wild Pokémon are +2 levels." },
      fx: { hpPct: -0.15, wildLevelBonus: 2 } },
    { id: "avalanche", zh: "雪崩", en: "Avalanche", kind: "debuff", scenes: ["glacier"], weight: "uncommon",
      text: { zh: "雪崩！随机一只队员当前 HP 减半", en: "An avalanche! A random team member loses half of its current HP." },
      fx: { hpRandomOnePct: -0.5 } },
    { id: "forest-mushroom", zh: "森林里的蘑菇", en: "Forest Mushroom", kind: "debuff", scenes: ["forest"], weight: "uncommon",
      text: { zh: "森林里的蘑菇……", en: "A mushroom in the forest..." },
      fx: { random: [{ healPct: 0.3 }, { hpPct: -0.15 }] } },
    { id: "beauty-contest", zh: "宝可梦选美", en: "Pokémon Contest", kind: "buff", scenes: ["city"], weight: "uncommon",
      text: { zh: "宝可梦选美大赛！出战卡亲密度 +3", en: "A Pokémon contest! +3 Affection on the active card." },
      fx: { affection: 3 } },
    { id: "cave-fossil", zh: "洞穴里的化石", en: "Cave Fossil", kind: "reward", scenes: ["cave"], weight: "rare",
      text: { zh: "在洞穴里挖到了一块化石！获得 1 随机进化石", en: "You dug up a fossil in the cave! You got 1 random Evolution Stone." },
      fx: { randomStone: true } },
    { id: "grass-egg", zh: "草丛里的蛋", en: "Egg in the Grass", kind: "battle", scenes: ["grassland"], weight: "rare",
      text: { zh: "草丛里有一颗蛋，守着它的宝可梦出现了！胜 → 得 5 糖果", en: "There's an egg in the grass, guarded by a wild Pokémon! Win to get 5 Candy." },
      battle: { levelBonus: 0, tierCap: "N", bonus: { candy: 5 } } },
  ];

  function eventById(id) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
    return null;
  }
  // 该场景能出的事件（scenes 为 null = 全部场景）
  function eventsForScene(sceneId) {
    return EVENTS.filter(function (e) { return !e.scenes || e.scenes.indexOf(sceneId) >= 0; });
  }
  function usableMembers(enc) {
    if (!enc || !Array.isArray(enc.team)) return [];
    return enc.team.filter(function (m) { return m.hp > 0; });
  }
  // 难走的道路要随机一半队员倒下：队伍只剩 1 只可用时不触发（保底至少留 1 只）
  function isEligible(enc, e) {
    if (e.fx && e.fx.disableHalf) return usableMembers(enc).length >= 2;
    return true;
  }
  function eligibleEvents(enc) {
    if (!enc) return [];
    return eventsForScene(enc.sceneId).filter(function (e) { return isEligible(enc, e); });
  }
  // 该事件会不会发结晶（直接发的、或胜场战利品里带的都算——封顶替换要覆盖这两种）
  function grantsCrystals(e) {
    if (!e) return false;
    if (e.fx && e.fx.crystals > 0) return true;
    return !!(e.battle && e.battle.bonus && e.battle.bonus.crystals > 0);
  }
  // 今天结晶是不是已经到 100 上限了
  function isCappedToday(state, now) {
    var t = Gacha.ensureTrainer(state);
    return t.encounterCrystalsDay === Gacha.encounterDayKey(now) &&
      t.encounterCrystalsToday >= Gacha.DAILY_CRYSTAL_CAP;
  }
  // 按权重 roll 一个事件。流星是独立 1% 概率（用户定 2026-11-23）：先单独 roll 一次，
  // 中了就直接出流星；没中再按权重 roll 其他事件（流星不进权重池，不然概率就不是 1%）。
  // 到上限也不替换了（用户定 2026-11-23）：给结晶的事件照常 roll 到，结晶改亲密度的转换
  // 在 applyEvent / 宝箱结算里做。没有可选事件时返回 null（调用方回落到战斗）。
  // state/now 现在不用，留着是给 Task 32 的调用口径。
  function rollEvent(enc, state, rng, now) {
    rng = rng || Math.random;
    if (rng() < 0.01) return eventById(METEOR_ID);
    var pool = eligibleEvents(enc).filter(function (e) { return e.id !== METEOR_ID; });
    if (!pool.length) return null;
    var total = 0;
    pool.forEach(function (e) { total += WEIGHTS[e.weight] || 0; });
    if (!total) return null;
    var r = rng() * total;
    var picked = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) {
      r -= WEIGHTS[pool[i].weight] || 0;
      if (r < 0) { picked = pool[i]; break; }
    }
    return picked;
  }
  function fmt(text, n) { return String(text).replace(/\{n\}/g, String(n)); }
  function eventText(e, lang, n) {
    var t = (lang === "en" ? e.text.en : e.text.zh) || "";
    return fmt(t, n == null ? "" : n);
  }
  function eventName(e, lang) { return lang === "en" ? e.en : e.zh; }
  // 运行期修正值（enc.mods，Task 32 在开场时初始化；这里没初始化就先补一个）
  function ensureMods(enc) {
    if (!enc.mods) enc.mods = { atkBonus: 0, critBonus: 0, damageMultNext: 1, catchMultNext: 1,
      forceFirstNext: false, forceWildFirstNext: false, wildLevelBonus: 0, minTierNext: null, chestMult: 1 };
    return enc.mods;
  }
  function healMember(m, pct) { // 回血按最大 HP 算（回 30% 生命 = 最大生命的 30%）
    m.hp = Math.max(0, Math.min(m.hpMax, m.hp + Math.round(m.hpMax * pct)));
  }
  function hurtMember(m, pct) { // 掉血按当前 HP 算（当前 HP -20% = 现有血量的 20%，雪崩「减半」同理）
    m.hp = Math.max(0, Math.min(m.hpMax, Math.floor(m.hp * (1 + pct))));
  }
  function applyFx(enc, state, fx, rng, now, result) {
    if (!fx) return;
    if (fx.random) { // 森林蘑菇：50% 回血 / 50% 掉血；result.branch 记 roll 到哪个分支（0/1），供界面显示
      var branch = rng() < 0.5 ? 0 : 1;
      result.branch = branch;
      applyFx(enc, state, fx.random[branch], rng, now, result);
      return;
    }
    var mods = ensureMods(enc);
    var trainer = Gacha.ensureTrainer(state);
    var active = enc.team && enc.team[enc.activeIndex];
    // 回血规则（用户定 2026-11-23，F2）：只治还站着的队员；宝可梦中心例外（reviveAll），
    // 倒下的也复活（原作里中心本来就能复活）；绿洲例外是 reviveOne：随机复活一只倒下的（回满）。
    // 护士事件的复活是另一条路，不受这条限制。
    if (fx.healFull) enc.team.forEach(function (m) { if (fx.reviveAll || m.hp > 0) m.hp = m.hpMax; });
    if (typeof fx.healPct === "number") enc.team.forEach(function (m) { if (m.hp > 0) healMember(m, fx.healPct); });
    if (fx.reviveOne) {
      var faintedOne = enc.team.filter(function (m) { return m.hp <= 0; });
      if (faintedOne.length) {
        var pickOne = faintedOne[Math.min(faintedOne.length - 1, Math.floor(rng() * faintedOne.length))];
        pickOne.hp = pickOne.hpMax;
      }
    }
    if (typeof fx.revive === "number") {
      var fainted = enc.team.filter(function (m) { return m.hp <= 0; });
      if (fainted.length) {
        var pick = fainted[Math.min(fainted.length - 1, Math.floor(rng() * fainted.length))];
        pick.hp = Math.floor(pick.hpMax * fx.revive);
      } else if (typeof fx.elseHealPct === "number") {
        enc.team.forEach(function (m) { healMember(m, fx.elseHealPct); });
      }
    }
    if (fx.disableHalf) {
      var usable = usableMembers(enc);
      if (usable.length >= 2) {
        var n = Math.min(Math.floor(usable.length / 2), usable.length - 1);
        var shuffled = usable.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
          var j = Math.floor(rng() * (i + 1));
          var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
        }
        shuffled.slice(0, n).forEach(function (m) { m.hp = 0; });
      }
    }
    if (typeof fx.hpPct === "number") enc.team.forEach(function (m) { hurtMember(m, fx.hpPct); });
    if (typeof fx.hpActivePct === "number" && active) hurtMember(active, fx.hpActivePct);
    if (typeof fx.hpRandomOnePct === "number" && enc.team.length) {
      // 雪崩只砸还站着的队员（已倒下的再砸也没用）
      var usable = usableMembers(enc);
      if (usable.length) hurtMember(usable[Math.min(usable.length - 1, Math.floor(rng() * usable.length))], fx.hpRandomOnePct);
    }
    if (typeof fx.atkBonus === "number") mods.atkBonus += fx.atkBonus;
    if (typeof fx.critBonus === "number") mods.critBonus += fx.critBonus;
    if (typeof fx.damageMultNext === "number") mods.damageMultNext = fx.damageMultNext;
    if (typeof fx.catchMultNext === "number") mods.catchMultNext = fx.catchMultNext;
    if (fx.forceFirstNext) mods.forceFirstNext = true;
    if (fx.forceWildFirstNext) mods.forceWildFirstNext = true;
    if (typeof fx.wildLevelBonus === "number") mods.wildLevelBonus += fx.wildLevelBonus;
    if (typeof fx.minTierNext === "string") mods.minTierNext = fx.minTierNext;
    if (typeof fx.chestMult === "number") mods.chestMult = fx.chestMult; // 流星：本次遭遇战结算奖励翻倍
    if (typeof fx.crystals === "number") {
      var grant = Gacha.grantEncounterCrystals(state, fx.crystals, now);
      result.grantedCrystals = grant.granted;
      if (grant.capped) {
        result.capped = true;
        // 到上限被封顶的部分改给亲密度 +1（用户定 2026-11-23）：给当前出战卡，满 10 级就无效
        if (active) {
          CardProgress.normalizeCardProgress(active.card);
          if (CardProgress.affectionLevel(active.card.affection) < CardProgress.AFFECTION_MAX_LEVEL) {
            active.card.affection = Math.min(CardProgress.AFFECTION_MAX_LEVEL * CardProgress.AFFECTION_POINTS_PER_LEVEL,
              (active.card.affection || 0) + 1);
            result.affectionGain = 1;
          }
        }
      }
    }
    if (typeof fx.candy === "number") { trainer.candy += fx.candy; result.awards.candy = (result.awards.candy || 0) + fx.candy; }
    if (fx.items) Object.keys(fx.items).forEach(function (id) {
      trainer.items[id] = (trainer.items[id] || 0) + fx.items[id];
      result.awards.items = result.awards.items || {};
      result.awards.items[id] = (result.awards.items[id] || 0) + fx.items[id];
    });
    if (fx.randomStone) {
      var stone = STONES[Math.min(STONES.length - 1, Math.floor(rng() * STONES.length))];
      trainer.items[stone] = (trainer.items[stone] || 0) + 1;
      result.awards.items = result.awards.items || {};
      result.awards.items[stone] = (result.awards.items[stone] || 0) + 1;
    }
    if (fx.randomItem) {
      var item = ITEM_POOL[Math.min(ITEM_POOL.length - 1, Math.floor(rng() * ITEM_POOL.length))];
      trainer.items[item] = (trainer.items[item] || 0) + 1;
      result.awards.items = result.awards.items || {};
      result.awards.items[item] = (result.awards.items[item] || 0) + 1;
    }
    if (typeof fx.exp === "number" && active && active.hp > 0) {
      var levels = CardProgress.applyExpGain(state, active.speciesId, active.card, fx.exp);
      if (levels > 0) active.hpMax = active.card.hp; // 升级只同步最大 HP，当前 HP 不变
      result.levels = levels;
    }
    if (typeof fx.affection === "number" && active) {
      CardProgress.normalizeCardProgress(active.card);
      active.card.affection = (active.card.affection || 0) + fx.affection;
    }
    if (typeof fx.affectionAll === "number") enc.team.forEach(function (m) {
      CardProgress.normalizeCardProgress(m.card);
      m.card.affection = (m.card.affection || 0) + fx.affectionAll;
    });
  }
  // 结算一个事件（非战斗类当场生效；战斗类只返回开打参数，战斗由 Task 32 接手）。
  // 返回 { event, kind, battle, textZh, textEn, awards, grantedCrystals, capped, affectionGain, levels,
  //   branch（随机分支事件 roll 到哪个分支，0/1）, needsPick（出战卡被事件打倒了，下一场要先选卡）,
  //   wiped（全队倒下） }。
  // 调用方负责保存存档（事件效果立即写进存档，刷新不丢，和每轮奖励一样）。
  function applyEvent(enc, state, event, rng, now) {
    rng = rng || Math.random;
    var result = { event: event, kind: event.kind, battle: null, awards: {},
      grantedCrystals: 0, capped: false, affectionGain: 0, levels: 0, needsPick: false, wiped: false };
    if (event.kind === "battle") {
      result.battle = event.battle;
      // 介绍里的 {n} 是胜场战利品的结晶数（表里的数；赢时真发多少按当时上限算）
      var bonusCrystals = event.battle && event.battle.bonus && event.battle.bonus.crystals;
      result.textZh = eventText(event, "zh", bonusCrystals);
      result.textEn = eventText(event, "en", bonusCrystals);
      return result;
    }
    applyFx(enc, state, event.fx, rng, now, result);
    // 文案里的 {n} 是实际发的结晶数（到上限前只发到一部分时和表里的数不一样；
    // 直接调用时已到上限发 0，n 就是 0，不留空）
    var n = (event.fx && typeof event.fx.crystals === "number") ? result.grantedCrystals : undefined;
    result.textZh = eventText(event, "zh", n);
    result.textEn = eventText(event, "en", n);
    // 到上限转了亲密度（或亲密度已满没得转），文案里补一句说明
    if (result.capped && event.fx && typeof event.fx.crystals === "number") {
      if (result.affectionGain > 0) {
        result.textZh += "（今天已到上限，剩下的改为出战宝可梦亲密度 +1）";
        result.textEn += " (Daily cap reached — the rest becomes +1 affection for the active Pokémon instead)";
      } else {
        result.textZh += "（今天已到上限，出战宝可梦亲密度已满）";
        result.textEn += " (Daily cap reached — the active Pokémon's affection is already maxed)";
      }
    }
    var active = enc.team && enc.team[enc.activeIndex];
    if (usableMembers(enc).length === 0) { result.wiped = true; }
    else if (active && active.hp <= 0) { enc.needsPick = true; result.needsPick = true; }
    return result;
  }

  var EncounterEvents = { EVENTS: EVENTS, WEIGHTS: WEIGHTS, STONES: STONES, ITEM_POOL: ITEM_POOL,
    METEOR_ID: METEOR_ID, eventById: eventById, eventsForScene: eventsForScene,
    eligibleEvents: eligibleEvents, rollEvent: rollEvent, applyEvent: applyEvent,
    grantsCrystals: grantsCrystals, isCappedToday: isCappedToday,
    eventText: eventText, eventName: eventName, ensureMods: ensureMods };

  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.EncounterEvents = EncounterEvents;
  }
  if (typeof module !== "undefined") module.exports = EncounterEvents;
})(typeof window !== "undefined" ? window : globalThis);
