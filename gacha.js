// PokeMem 抽卡核心逻辑 — 纯函数，可在浏览器和 Node 里共用
// 概率来源：图鉴表 L 列单只概率（合计 99.89%，按权重归一化到 100%）
// 保底来源：另一位工程师的文档第 6-7 节
//   - 10 连保底：每包 10 张至少一张 SR 及以上
//   - 50 抽保底：连续 50 抽未出 SSR，则第 50 抽必出 SSR 及以上
//   - MR 不设保底
// 实现说明：10 连保底按“前 9 张正常抽，第 10 张若仍无 SR+ 则强制从 SR+ 池抽”实现，
// 展示时把 10 张顺序打乱；与文档“抽完随机替换一张”的保底概率完全一致，且保底计数精确。
(function (root) {
  "use strict";
  // 注意：这里不能写 typeof POKEDEX —— 本函数内 var POKEDEX 已提升，会屏蔽全局的 POKEDEX。
  // 浏览器里靠 pokedex.js 显式挂的 window.POKEDEX（顶层 const 不会自动挂 window），Node 里靠 require。
  var POKEDEX = root.POKEDEX || (typeof require !== "undefined" ? require("./pokedex.js").POKEDEX : []);
  if (!POKEDEX.length) throw new Error("PokeMem: 图鉴数据未加载，请确认 pokedex.js 在 gacha.js 之前引入");
  var PACK_SIZE = 10;
  var PACK_INTERVAL_MS = 3600 * 1000; // 正式版：1 小时 1 包
  var MAX_CARDS_PER_MON = 5; // 每只宝可梦最多保留 5 张卡，超过的去掉 Lv 最低的
  var SSR_PLUS = ["SSR", "UR", "MR"];
  var SR_PLUS = ["SR", "SSR", "UR", "MR"];
  var TIER_LABEL = { N: "普通", R: "稀有", SR: "超稀有", SSR: "传说", UR: "神话", MR: "幻之" };
  // ---- 训练师（Task 4/5：只加数据结构 + 迁移，不改开包/计时行为）----
  var TRAINER_MAX_LEVEL = 100; // 训练师与单张宝可梦卡的等级上限都是 100
  var TRAINER_EXP_PER_LEVEL = 100; // 每升 1 级要 100 经验
  var TRAINER_WELCOME_CRYSTALS = 100; // 注册时一次性给 100 梦想结晶（= 10 包），只给一次
  var TRAINER_NAME_MAX = 12; // 训练师名字最多 12 个字（Task 11/12，用户锁定 1–12 字）
  var CRYSTALS_PER_PACK = 10; // 10 梦想结晶换 1 包（Task 7）
  // ---- 训练师经验（Task 2/3/6：2026-11-16 用户锁定）----
  // 开包得经验：按抽到的卡的稀有度计，一包约 43 经验；满级 100 级共 9900 经验。
  var TRAINER_EXP_TABLE = { N: 2, R: 4, SR: 8, SSR: 15, UR: 25, MR: 50 };
  var TRAINER_CANDY_PER_LEVEL = 2; // 每升 1 级给 2 糖果（不给结晶）
  // 里程碑：10 级给 3 个超级球，25 级给 3 个高级球（数量是实现时定的，可调）
  var TRAINER_MILESTONE_REWARDS = { 10: { great_ball: 3 }, 25: { ultra_ball: 3 } };
  var TRAINER_CANDY_TABLE = { N: 1, R: 2, SR: 4, SSR: 8, UR: 15, MR: 30 }; // 超上限丢卡换糖果（Task 9，用户锁定）
  var CANDY_PER_LEVEL = 1; // 1 糖果升 1 级（Task 10，用户锁定）
  var ITEM_IDS = ["poke_ball", "great_ball", "ultra_ball", "master_ball",
    "fire_stone", "water_stone", "thunder_stone", "leaf_stone", "moon_stone"];

  function entry(id) { return POKEDEX[id - 1]; }
  function totalWeight() {
    var s = 0;
    for (var i = 0; i < POKEDEX.length; i++) s += POKEDEX[i][5];
    return s; // 表格合计 99.89
  }
  function randInt(min, max, rng) { // 含两端
    return min + Math.floor(rng() * (max - min + 1));
  }

  // 在指定稀有度池子里按表格单只概率加权抽一只（池外权重为 0）
  function drawFromPool(tiers, rng) {
    var total = 0, i;
    for (i = 0; i < POKEDEX.length; i++) if (tiers.indexOf(POKEDEX[i][4]) >= 0) total += POKEDEX[i][5];
    var r = rng() * total;
    for (i = 0; i < POKEDEX.length; i++) {
      if (tiers.indexOf(POKEDEX[i][4]) < 0) continue;
      r -= POKEDEX[i][5];
      if (r < 0) return POKEDEX[i];
    }
    return POKEDEX[POKEDEX.length - 1];
  }
  // 全池加权抽一只（= 表格单只概率归一化）
  function drawAny(rng) {
    return drawFromPool(["N", "R", "SR", "SSR", "UR", "MR"], rng);
  }

  // 等级与数值（文档第 4 节 / 表格“等级公式”页，满个体 15、努力拉满，93 = 2*15+63）
  function statsForLevel(row, lv) {
    return { level: lv,
      hp: Math.floor((2 * row[7] + 93) * lv / 100) + lv + 10,
      atk: Math.floor((2 * row[8] + 93) * lv / 100) + 5 };
  }
  function rollStats(row, rng) {
    var lv = randInt(row[6], 100, rng);
    return statsForLevel(row, lv);
  }

  // 抽一张：处理 50 抽 SSR 保底；更新并返回新的 sinceSSR
  function drawCard(state, rng) {
    var row;
    if (state.sinceSSR >= 49) { // 连续 49 抽未出 SSR，下一抽必出 SSR 及以上
      row = drawFromPool(SSR_PLUS, rng);
    } else {
      row = drawAny(rng);
    }
    var isSSRPlus = SSR_PLUS.indexOf(row[4]) >= 0;
    state.sinceSSR = isSSRPlus ? 0 : state.sinceSSR + 1;
    var st = rollStats(row, rng);
    return { id: row[0], name: row[1], en: row[2], types: row[3], tier: row[4], prob: row[5],
             level: st.level, hp: st.hp, atk: st.atk };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 记入卡册：每张卡单独存一条明细（等级/HP/攻击），详情页可以按数值排序
  // best* 仍按老规则：取最高等级那张卡的数值（不改旧行为）
  function addToCollection(state, card) {
    var e = state.collection[card.id] || (state.collection[card.id] = { count: 0, legacy: 0, bestLv: 0, bestHp: 0, bestAtk: 0, cards: [] });
    if (!e.cards) e.cards = [];
    e.cards.push({ level: card.level, hp: card.hp, atk: card.atk, pulledAt: Date.now() });
    e.count += 1;
    if (card.level > e.bestLv) { e.bestLv = card.level; e.bestHp = card.hp; e.bestAtk = card.atk; }
    dropLowest(state, card.id, e); // 超过 5 张就去掉 Lv 最低的一张（新抽到的 Lv 最低时，去掉的就是它自己）
  }

  // 去掉 Lv 最低的一张卡（只在超过上限时）；返回是否去掉了一张
  // 去掉 Lv 最低的一张卡（只在超过上限时）；返回是否去掉了一张。
  // 掉的卡按稀有度换成糖果（Task 9，用户锁定：N1/R2/SR4/SSR8/UR15/MR30），
  // 直接加到训练师的糖果上。enforceCap 启动时执行上限也会经过这里，同样换糖果。
  function dropLowest(state, id, e) {
    if (!e.cards || e.cards.length <= MAX_CARDS_PER_MON) return false;
    var minI = 0;
    for (var i = 1; i < e.cards.length; i++) if (e.cards[i].level < e.cards[minI].level) minI = i;
    e.cards.splice(minI, 1);
    e.count -= 1;
    e.droppedCount = (e.droppedCount || 0) + 1;
    var row = entry(Number(id));
    var candy = row ? (TRAINER_CANDY_TABLE[row[4]] || 0) : 0;
    if (candy > 0 && state) {
      ensureTrainer(state).candy += candy;
    }
    return true;
  }

  // 给已有存档执行上限：每只超过 5 张的部分按 Lv 从低到高去掉
  function enforceCap(state) {
    var removed = 0;
    Object.keys(state.collection).forEach(function (id) {
      var e = state.collection[id];
      while (dropLowest(state, id, e)) removed++;
    });
    return removed;
  }

  // v1.5 之前只存了汇总（count/bestLv/bestHp/bestAtk），没有每张卡的明细：
  // 拿最高数值补一条明细卡，剩下的张数记为 legacy（旧卡，无单独数值）
  function migrateCollection(state) {
    Object.keys(state.collection).forEach(function (id) {
      var e = state.collection[id];
      if (!e.cards) {
        e.cards = [{ level: e.bestLv || 0, hp: e.bestHp || 0, atk: e.bestAtk || 0, pulledAt: 0 }];
        e.legacy = Math.max(0, (e.count || 1) - 1);
      }
      if (typeof e.legacy !== "number") e.legacy = 0;
    });
  }

  // v1.7 补救：v1.5 之前抽的旧卡只有总数，没有每张的 Lv/HP/攻击，原始数值已无法找回。
  // 为了让详情页的 tab 能显示（上限 5 张、取 Lv 最高），按公式给旧卡重新随机生成数值：
  // 等级在最低等级～原最高等级之间随机（不超过原最高等级，所以最高等级那张不变），
  // HP/攻击按同一公式算。补生成的卡打 repaired 标记，详情页会注明。只跑一次（legacy 清零后不再跑）。
  function repairLegacyCards(state, rng) {
    rng = rng || Math.random;
    var repaired = 0;
    Object.keys(state.collection).forEach(function (id) {
      var e = state.collection[id];
      var n = e.legacy || 0;
      if (!n || !e.cards) return;
      var row = entry(Number(id));
      for (var i = 0; i < n; i++) {
        var lv = randInt(row[6], Math.max(row[6], e.bestLv), rng);
        var st = statsForLevel(row, lv);
        e.cards.push({ level: st.level, hp: st.hp, atk: st.atk, pulledAt: 0, repaired: true });
        repaired++;
      }
      e.legacy = 0;
    });
    return repaired;
  }

  // 开一包（10 张），含 10 连保底；调用前由 UI 保证 packs > 0
  function drawPack(state, rng) {
    rng = rng || Math.random;
    var cards = [], i, hasSRPlus = false;
    for (i = 0; i < PACK_SIZE - 1; i++) {
      var c = drawCard(state, rng);
      if (SR_PLUS.indexOf(c.tier) >= 0) hasSRPlus = true;
      cards.push(c);
    }
    var last;
    if (hasSRPlus) {
      last = drawCard(state, rng);
    } else { // 保底：第 10 张强制从 SR+ 池抽
      var row = drawFromPool(SR_PLUS, rng);
      var st = rollStats(row, rng);
      var isSSRPlus = SSR_PLUS.indexOf(row[4]) >= 0;
      state.sinceSSR = isSSRPlus ? 0 : state.sinceSSR + 1;
      last = { id: row[0], name: row[1], en: row[2], types: row[3], tier: row[4], prob: row[5],
               level: st.level, hp: st.hp, atk: st.atk, pity: true };
    }
    cards.push(last);
    state.packs -= 1;
    state.packsOpened += 1;
    state.totalDraws += PACK_SIZE;
    // 训练师经验结算（Task 8）：整包 10 张都按稀有度算经验，保底那张也算。
    // 结算结果挂在返回的包上，给 Task 14 的开包结果行和升级提示读；
    // 返回类型不变，仍是卡数组。存盘由调用方负责（首页开包按钮在 drawPack 后调 save）。
    var packExp = 0;
    cards.forEach(function (c) { packExp += TRAINER_EXP_TABLE[c.tier] || 0; });
    var expResult = addTrainerExp(state, packExp);
    var result = shuffle(cards, rng);
    // NEW 判定：开包前未拥有、且是展示顺序里第一次出现的那张（Task 18：洗牌后判定，角标落在第一张展示的卡上；之前先判定再洗牌，角标会落在最后一张展示的卡上）
    var seenInPack = {};
    result.forEach(function (c) {
      c.isNew = !state.collection[c.id] && !seenInPack[c.id];
      seenInPack[c.id] = true;
    });
    result.forEach(function (c) { addToCollection(state, c); });
    result.trainerExp = { exp: packExp, levels: expResult.levels, candy: expResult.candy, items: expResult.items };
    return result;
  }

  // ---- 训练师资料 ----
  // 新训练师：未注册、结晶 0。100 颗注册奖励不在这里发，由注册流程调用
  // grantWelcomeCrystals 一次性发放，避免老存档迁移时没注册就先拿到结晶，
  // 也避免注册流程重复发放。
  function freshItems() {
    return { poke_ball: 3, great_ball: 0, ultra_ball: 0, master_ball: 0,
      fire_stone: 0, water_stone: 0, thunder_stone: 0, leaf_stone: 0, moon_stone: 0 };
  }
  function newTrainer() {
    return { name: "", level: 1, exp: 0, crystals: 0, candy: 0,
      items: freshItems(), registered: false, welcomeCrystalsGranted: false };
  }
  // 老存档迁移：没有 trainer 就补一个未注册的；已有的缺字段补默认值、坏值夹回合法范围，
  // 已有的名字/等级/结晶/糖果/道具一律保留，不补发经验和结晶。
  function ensureTrainer(state) {
    // N1：只修缺失/坏掉/小于 2 的 version，不降级未来更高的版本
    if (typeof state.version !== "number" || !isFinite(state.version) || state.version < 2) state.version = 2;
    var t = state.trainer;
    // F1：数组也是 typeof "object"，但 JSON.stringify 会丢掉数组上的具名属性，
    // 存档会被悄悄清空，所以数组直接当损坏处理
    if (!t || typeof t !== "object" || Array.isArray(t)) { state.trainer = newTrainer(); return state.trainer; }
    if (typeof t.name !== "string") t.name = "";
    t.name = t.name.trim(); // 只有空格的名字也算没名字（PR #2 遗留：空白名不能算已注册）
    if (typeof t.level !== "number" || !(t.level >= 1)) t.level = 1;
    t.level = Math.min(TRAINER_MAX_LEVEL, Math.floor(t.level));
    // F2：NaN / Infinity 也要当坏值处理（NaN < 0 是 false，旧写法会漏过去）
    // F5：经验溢出按 100 进位成等级再保留余数，而不是直接丢弃
    if (typeof t.exp !== "number" || !isFinite(t.exp) || t.exp < 0) t.exp = 0;
    else {
      t.exp = Math.floor(t.exp);
      var bonusLevels = Math.floor(t.exp / TRAINER_EXP_PER_LEVEL);
      if (bonusLevels > 0) {
        t.level = Math.min(TRAINER_MAX_LEVEL, t.level + bonusLevels);
        t.exp -= bonusLevels * TRAINER_EXP_PER_LEVEL;
      }
    }
    if (t.level >= TRAINER_MAX_LEVEL) t.exp = 0;
    if (typeof t.crystals !== "number" || !isFinite(t.crystals) || t.crystals < 0) t.crystals = 0;
    else t.crystals = Math.floor(t.crystals);
    if (typeof t.candy !== "number" || !isFinite(t.candy) || t.candy < 0) t.candy = 0;
    else t.candy = Math.floor(t.candy);
    if (!t.items || typeof t.items !== "object" || Array.isArray(t.items)) t.items = freshItems();
    else ITEM_IDS.forEach(function (id) {
      if (typeof t.items[id] !== "number" || !isFinite(t.items[id]) || t.items[id] < 0) t.items[id] = 0;
      else t.items[id] = Math.floor(t.items[id]);
    });
    if (typeof t.registered !== "boolean") t.registered = t.name !== "";
    // N2：已注册必然有名字；没名字的存档不能算已注册（注册流程会同时填名字和置 true）
    if (!t.name) t.registered = false;
    // F3：非布尔的旧标记按真值折算，不直接重置为 false（否则已发过的奖励会被重复发）
    if (typeof t.welcomeCrystalsGranted !== "boolean") t.welcomeCrystalsGranted = !!t.welcomeCrystalsGranted;
    return t;
  }
  // 注册奖励：第一次调用 +100 结晶并打标，之后再调用返回 0，不重复发放。
  // 调用顺序：注册流程先填名字、置 registered=true，再调这里；不要在注册前调用。
  function grantWelcomeCrystals(state) {
    var t = ensureTrainer(state);
    if (t.welcomeCrystalsGranted) return 0;
    t.welcomeCrystalsGranted = true;
    t.crystals += TRAINER_WELCOME_CRYSTALS;
    return TRAINER_WELCOME_CRYSTALS;
  }

  // 校验训练师名字：去空格后 1–12 个字。返回 {ok, name, error}（error: "empty" | "tooLong"）
  function validateTrainerName(name) {
    var n = typeof name === "string" ? name.trim() : "";
    if (!n) return { ok: false, name: "", error: "empty" };
    if (n.length > TRAINER_NAME_MAX) return { ok: false, name: n, error: "tooLong" };
    return { ok: true, name: n, error: null };
  }

  // 注册训练师（Task 11/12）：名字 1–12 字，注册成功发 100 梦想结晶（只发一次）。
  // 已注册时再次调用只改名字，不重复发结晶（改名在训练师 tab 里复用这个函数）。
  function registerTrainer(state, name) {
    var v = validateTrainerName(name);
    if (!v.ok) return v;
    var t = ensureTrainer(state);
    t.name = v.name;
    t.registered = true;
    grantWelcomeCrystals(state);
    return { ok: true, name: v.name, error: null };
  }

  // 结晶兑换卡包（Task 7）：10 颗结晶换 1 包，计时器不受影响。
  // 先结算计时器应发的包，再检查结晶余额——兑换和计时到账发生在同一次
  // 同步调用里，顺序固定，两个包都加上（2026-11-16 定下的并发规则）。
  // 余额不足返回 0，不扣结晶；成功扣 10 颗、包数 +1，返回 1。
  // 整个过程同步完成，校验和扣减之间没有异步空隙。
  function exchangeCrystalsForPack(state, now) {
    if (typeof now !== "number" || !isFinite(now)) now = Date.now();
    var t = ensureTrainer(state);
    grantDuePacks(state, now); // 先结算计时器，再兑换
    if (t.crystals < CRYSTALS_PER_PACK) return 0;
    t.crystals -= CRYSTALS_PER_PACK;
    state.packs += 1;
    return 1;
  }

  // 训练师经验结算（Task 6）：加经验、逐级升级、发升级奖励。
  // 每升 1 级给 2 糖果；到 10/25 级额外给里程碑精灵球；满级后经验清零、不再涨。
  // 返回 { levels, candy, items }：本次升了几级、共发多少糖果、各道具发了几个。
  // amount 非法（非数字/负数/NaN）按 0 处理；整个过程同步完成。
  // 注意：迁移用的 ensureTrainer 只修数值、不发奖励，奖励只在这里发。
  function addTrainerExp(state, amount) {
    var result = { levels: 0, candy: 0, items: {} };
    var t = ensureTrainer(state);
    if (typeof amount !== "number" || !isFinite(amount)) amount = 0;
    amount = Math.floor(amount);
    if (amount <= 0 || t.level >= TRAINER_MAX_LEVEL) return result;
    t.exp += amount;
    while (t.exp >= TRAINER_EXP_PER_LEVEL && t.level < TRAINER_MAX_LEVEL) {
      t.exp -= TRAINER_EXP_PER_LEVEL;
      t.level += 1;
      result.levels += 1;
      result.candy += TRAINER_CANDY_PER_LEVEL;
      t.candy += TRAINER_CANDY_PER_LEVEL;
      var bonus = TRAINER_MILESTONE_REWARDS[t.level];
      if (bonus) Object.keys(bonus).forEach(function (id) {
        t.items[id] = (t.items[id] || 0) + bonus[id];
        result.items[id] = (result.items[id] || 0) + bonus[id];
      });
    }
    if (t.level >= TRAINER_MAX_LEVEL) t.exp = 0;
    return result;
  }

  // 糖果给卡升级（Task 10）：1 糖果 +1 级，HP/攻击按公式重算，单卡最高 100 级。
  // card 是卡册里那张卡的对象（详情页选中的那张）；levels 默认 1。
  // 实际升的级数受三者限制：要升的级数、手头糖果、到 100 级的剩余；不够时按能升的升，
  // 返回实际升了几级（0 表示没升：糖果不够、已满级、或卡不在卡册里）。扣掉的糖果 = 升的级数。
  function levelUpCard(state, id, card, levels) {
    if (typeof levels === "undefined") levels = 1;
    if (typeof levels !== "number" || !isFinite(levels)) return 0;
    levels = Math.floor(levels);
    if (levels <= 0) return 0;
    var t = ensureTrainer(state);
    var e = state.collection[id];
    if (!e || !e.cards) return 0;
    var idx = e.cards.indexOf(card);
    if (idx < 0) return 0;
    if (!card || typeof card.level !== "number" || !isFinite(card.level)) return 0;
    if (Math.floor(card.level) !== card.level || card.level < 1) return 0; // 手改存档的负数/小数/0 级不能花糖果（Task 17，PR #8 O1）
    var row = entry(Number(id));
    if (!row) return 0;
    var gain = Math.min(levels, t.candy, TRAINER_MAX_LEVEL - card.level);
    if (gain <= 0) return 0;
    t.candy -= gain * CANDY_PER_LEVEL;
    card.level += gain;
    var st = statsForLevel(row, card.level);
    card.hp = st.hp;
    card.atk = st.atk;
    // best 取最高等级那张卡的数值（平级时先达到的那张保持 best，和原来规则一致）
    var best = e.cards[0];
    e.cards.forEach(function (c) { if (c.level > best.level) best = c; });
    e.bestLv = best.level; e.bestHp = best.hp; e.bestAtk = best.atk;
    return gain;
  }

  // ---- 卡包计时（正式版）----
  function newState(now) {
    if (typeof now === "undefined") now = Date.now(); // 不传时间默认现在（Task 17，PR #11 O1：不然 lastGrantAt 是 undefined，计时变 NaN）
    return { version: 2, packs: 1, lastGrantAt: now, collection: {}, totalDraws: 0,
             packsOpened: 0, sinceSSR: 0, debug: false, createdAt: now,
             trainer: newTrainer() };
  }
  // 按流逝时间补发卡包：每小时 1 包；返回本次补发数
  function grantDuePacks(state, now) {
    var elapsed = now - state.lastGrantAt;
    if (elapsed < PACK_INTERVAL_MS) return 0;
    var due = Math.floor(elapsed / PACK_INTERVAL_MS);
    state.packs += due;
    state.lastGrantAt += due * PACK_INTERVAL_MS;
    return due;
  }
  function msToNextPack(state, now) {
    return Math.max(0, state.lastGrantAt + PACK_INTERVAL_MS - now);
  }

  // ---- 统计 ----
  function tierTotals() {
    var t = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0, MR: 0 }, counts = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0, MR: 0 };
    POKEDEX.forEach(function (r) { t[r[4]] += r[5]; counts[r[4]] += 1; });
    return { totals: t, counts: counts, sum: totalWeight() };
  }
  function ownedCount(state) { return Object.keys(state.collection).length; }

  var api = { PACK_SIZE: PACK_SIZE, PACK_INTERVAL_MS: PACK_INTERVAL_MS, TIER_LABEL: TIER_LABEL,
    TRAINER_MAX_LEVEL: TRAINER_MAX_LEVEL, TRAINER_EXP_PER_LEVEL: TRAINER_EXP_PER_LEVEL,
    TRAINER_WELCOME_CRYSTALS: TRAINER_WELCOME_CRYSTALS, CRYSTALS_PER_PACK: CRYSTALS_PER_PACK,
    TRAINER_NAME_MAX: TRAINER_NAME_MAX,
    TRAINER_EXP_TABLE: TRAINER_EXP_TABLE, TRAINER_CANDY_PER_LEVEL: TRAINER_CANDY_PER_LEVEL,
    TRAINER_MILESTONE_REWARDS: TRAINER_MILESTONE_REWARDS, TRAINER_CANDY_TABLE: TRAINER_CANDY_TABLE,
    CANDY_PER_LEVEL: CANDY_PER_LEVEL, ITEM_IDS: ITEM_IDS,
    newTrainer: newTrainer, ensureTrainer: ensureTrainer, grantWelcomeCrystals: grantWelcomeCrystals,
    validateTrainerName: validateTrainerName, registerTrainer: registerTrainer,
    exchangeCrystalsForPack: exchangeCrystalsForPack, addTrainerExp: addTrainerExp,
    levelUpCard: levelUpCard,
    SR_PLUS: SR_PLUS, SSR_PLUS: SSR_PLUS, entry: entry, totalWeight: totalWeight,
    drawFromPool: drawFromPool, drawAny: drawAny, rollStats: rollStats, drawCard: drawCard,
    drawPack: drawPack, newState: newState, grantDuePacks: grantDuePacks,
    msToNextPack: msToNextPack, tierTotals: tierTotals, ownedCount: ownedCount,
    addToCollection: addToCollection, migrateCollection: migrateCollection,
    repairLegacyCards: repairLegacyCards, enforceCap: enforceCap,
    MAX_CARDS_PER_MON: MAX_CARDS_PER_MON };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Gacha = api;
})(typeof window !== "undefined" ? window : globalThis);
