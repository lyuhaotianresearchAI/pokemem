// PokeMem — 遭遇战状态机（Task 26，Task 29 加每日结晶上限，Task 32 接事件）
// 纯逻辑，可在浏览器和 Node 里共用；不碰 DOM、不直接读写存档。
// 状态放在调用方（浏览器里是 PokeMem.ctx.encounter），函数拿 (enc, state, rng) 操作它；
// 调用方负责在每次行动后保存存档（PokeMem.save()），因为每轮结算的经验 / 亲密度 /
// 抓到的卡要立即写进存档，刷新不丢；只有宝箱（结晶 / 道具）会因为中途刷新而丢。
// 每日结晶上限（Task 29，用户定 2026-11-17：100/天）：宝箱发结晶时封顶，计数记在
// 训练师数据里（encounterCrystalsDay / encounterCrystalsToday，本地日期 key，跨天清零）；
// 道具 roll 不受结晶上限影响。settleChest / retreat / endRun 可传 now（Date 或时间戳，测试用）。
// 到上限改亲密度（Task 31，用户定 2026-11-23）：宝箱被封顶的部分改给出战卡亲密度 +2，
// 事件结晶被封顶改 +1，胜场战利品被封顶改 +1（都在发结晶的地方转）；满 10 级无效。
// 战报（enc.log，Task 28 的战斗界面按这个渲染；带名字的条目同时记 nameEn / attackerEn / defenderEn，英文模式用英文名）：
//   {t:"spawn", id, name, nameEn, level, tier}      刷出下一只野生
//   {t:"hit", by:"player"|"wild", attacker, attackerEn, defender, defenderEn, damage, crit, mult, defHp, defHpMax}
//   {t:"faint", name, nameEn}                       出战卡倒下
//   {t:"ko", name, nameEn}                          野生被击倒
//   {t:"catch", name, nameEn, ball, success}        扔球结果
//   {t:"switch", name, nameEn}                      交换 / 免费选下一只
//   {t:"levelup", name, nameEn, from, to}           出战卡结算升了级
//   {t:"prompt"}                            进战间选择（继续前进 / 结束遭遇战）
//   {t:"event", name, nameEn, textZh, textEn}  触发一个事件（Task 32；界面在 Task 33 渲染）
//   {t:"bonus", bonus}                      战斗类事件的胜场战利品已发（Task 32）
//   {t:"chest", crystals, items, capped, affection}  宝箱结算（capped = 被每日上限封顶）
//   {t:"wipe"}                              6 只全倒下（团灭）
//   {t:"retreat"}                           撤退
// 依赖：图鉴 POKEDEX（pokedex.js）、属性模块 Types（js/types.js）、
// 场景模块 Scenes（js/scenes.js）、抽卡核心 Gacha（gacha.js）、
// 卡片成长 CardProgress（card-progress.js）、事件模块 EncounterEvents（js/encounter-events.js）。
// 加载顺序见 index.html。
(function (root) {
  "use strict";
  var POKEDEX = root.POKEDEX || (typeof require !== "undefined" ? require("../pokedex.js").POKEDEX : []);
  var Types = (root.PokeMem && root.PokeMem.Types) || (typeof require !== "undefined" ? require("./types.js") : null);
  var Scenes = (root.PokeMem && root.PokeMem.Scenes) || (typeof require !== "undefined" ? require("./scenes.js") : null);
  var Gacha = root.Gacha || (typeof require !== "undefined" ? require("../gacha.js") : null);
  var CardProgress = root.CardProgress || (typeof require !== "undefined" ? require("../card-progress.js") : null);
  var EncounterEvents = (root.PokeMem && root.PokeMem.EncounterEvents) || (typeof require !== "undefined" ? require("./encounter-events.js") : null);
  if (!POKEDEX.length) throw new Error("PokeMem: 图鉴数据未加载，请确认 pokedex.js 在 js/encounter.js 之前引入");
  if (!Types) throw new Error("PokeMem: 属性模块未加载，请确认 js/types.js 在 js/encounter.js 之前引入");
  if (!Scenes) throw new Error("PokeMem: 场景模块未加载，请确认 js/scenes.js 在 js/encounter.js 之前引入");
  if (!Gacha) throw new Error("PokeMem: 抽卡核心未加载，请确认 gacha.js 在 js/encounter.js 之前引入");
  if (!CardProgress) throw new Error("PokeMem: 卡片成长模块未加载，请确认 card-progress.js 在 js/encounter.js 之前引入");
  if (!EncounterEvents) throw new Error("PokeMem: 事件模块未加载，请确认 js/encounter-events.js 在 js/encounter.js 之前引入");

  // 伤害 = max(1, round(攻击 × 克制倍率 / 3))，暴击时再 ×2；/ 3 是调参旋钮
  var DAMAGE_DIVISOR = 3;
  var DAILY_CRYSTAL_CAP = Gacha.DAILY_CRYSTAL_CAP; // 转发：上限以 gacha.js 为准（Task 31 统一）
  var BALL_MULT = { poke_ball: 1, great_ball: 1.5, ultra_ball: 2 };
  var TIER_CATCH_MULT = { N: 1, R: 1, SR: 0.85, SSR: 0.7, UR: 0.5, MR: 0.35 };
  // 宝箱道具池：除大师球外的 8 种（3 种球 + 5 种石头）
  var CHEST_ITEM_POOL = ["poke_ball", "great_ball", "ultra_ball", "fire_stone",
    "water_stone", "thunder_stone", "leaf_stone", "moon_stone"];

  function calcDamage(atk, mult, crit) {
    var base = Math.max(1, Math.round(atk * mult / DAMAGE_DIVISOR));
    return crit ? base * 2 : base;
  }
  // 每赢一轮给出战的那张卡加经验：野生比它弱或平级 +1，野生比它强 +等级差
  function expGainFor(wildLevel, cardLevel) {
    return wildLevel > cardLevel ? wildLevel - cardLevel : 1;
  }
  // 抓捕概率：P = clamp((1 − 野生剩余HP比例) × 0.8 × 球倍率 × 稀有度系数, 0.05, 0.9)
  function catchRate(wild, ballId) {
    if (BALL_MULT[ballId] == null || !wild || !wild.hpMax) return 0;
    var p = (1 - wild.hp / wild.hpMax) * 0.8 * BALL_MULT[ballId] * (TIER_CATCH_MULT[wild.tier] || 1);
    return Math.max(0.05, Math.min(0.9, p));
  }
  // 卡片的第一属性（中文属性串 → 英文 id；双属性 v1 只用第一个）
  function firstTypeOf(typesZh) {
    var ids = Types.parseTypes(typesZh);
    return ids[0] || "normal";
  }
  function log(enc, entry) { enc.log.push(entry); }
  function activeMember(enc) { return enc.team[enc.activeIndex] || null; }
  // 队员的最大 HP 存在队员身上（hpMax）；中途升级后要同步：战斗结算升级时 winRound 里同步，
  // 糖果升级由界面在切回遭遇战页签时调 refreshTeamMaxHp 同步；当前 HP 不变。
  function memberMaxHp(m) { return m.hpMax; }
  // 把所有队员的最大 HP 按卡的当前数据刷一遍（糖果升级后用）；当前 HP 不变、不超过新的最大 HP
  function refreshTeamMaxHp(enc) {
    enc.team.forEach(function (m) {
      m.hpMax = m.card.hp;
      if (m.hp > m.hpMax) m.hp = m.hpMax;
    });
  }
  function isFainted(m) { return !m || m.hp <= 0; }
  function usableMembers(enc) { return enc.team.filter(function (m) { return m.hp > 0; }); }
  function teamMaxLevel(enc) {
    var max = 1;
    enc.team.forEach(function (m) { if (m.card.level > max) max = m.card.level; });
    return max;
  }

  // 组队：picks = [{speciesId, cardIndex}]，1–6 张，不重复、必须是已有的卡。
  // 队员记的是卡的引用（结算时直接改这张卡），hp 是本场内的当前 HP，hpMax 是最大 HP——
  // 进场时满血，当前 HP 直接取最大 HP。
  function buildTeam(state, picks) {
    if (!Array.isArray(picks) || picks.length < 1) return { ok: false, error: "empty" };
    if (picks.length > 6) return { ok: false, error: "tooMany" };
    var seen = {};
    var team = [];
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      var e = state.collection && state.collection[p.speciesId];
      if (!e || !e.cards || !e.cards[p.cardIndex]) return { ok: false, error: "notOwned" };
      var key = p.speciesId + ":" + p.cardIndex;
      if (seen[key]) return { ok: false, error: "duplicate" };
      seen[key] = true;
      var card = e.cards[p.cardIndex];
      var row = POKEDEX[p.speciesId - 1];
      team.push({ speciesId: p.speciesId, cardIndex: p.cardIndex,
        name: row ? row[1] : "#" + p.speciesId, en: row ? row[2] : "",
        types: row ? row[3] : "", // 存档里的卡不存属性，从图鉴行缓存一份（战斗算克制用）
        card: card, hp: card.hp, hpMax: card.hp });
    }
    return { ok: true, team: team };
  }
  function spawnNextWild(enc, rng) {
    var opts = {};
    // minTierNext：下一只野生稀有度至少某档，刷野时消耗（用完清零）
    if (enc.mods && enc.mods.minTierNext) { opts.minTier = enc.mods.minTierNext; enc.mods.minTierNext = null; }
    enc.wild = Scenes.spawnWild(enc.sceneId, enc.wins, teamMaxLevel(enc), rng, opts);
    if (!enc.wild) return null;
    applyWildLevelBonus(enc);
    log(enc, { t: "spawn", id: enc.wild.id, name: enc.wild.name, nameEn: enc.wild.en, level: enc.wild.level, tier: enc.wild.tier });
    return enc.wild;
  }
  // 迷路事件的「本场剩余野生等级 +N」：同种野生重造一级，等级更高（不改种类和稀有度档）
  function applyWildLevelBonus(enc) {
    var bonus = enc.mods && enc.mods.wildLevelBonus;
    if (bonus > 0 && enc.wild) {
      var row = POKEDEX[enc.wild.id - 1];
      if (row) enc.wild = Scenes.makeWild(row, Math.min(100, enc.wild.level + bonus));
    }
  }
  // 战斗类事件的刷野：类型过滤（钓鱼只要水系）、稀有度上限（蛋只要 N）、等级加成
  // （训练师挑战 +2 之类）都走这里；等级加成和迷路加成一样重造（同种、等级更高）
  function spawnEventWild(enc, rng, battle) {
    var opts = {};
    if (battle.typeFilter) opts.typeFilter = battle.typeFilter;
    if (battle.tierCap) opts.maxTier = battle.tierCap;
    if (enc.mods && enc.mods.minTierNext) { opts.minTier = enc.mods.minTierNext; enc.mods.minTierNext = null; }
    enc.wild = Scenes.spawnWild(enc.sceneId, enc.wins, teamMaxLevel(enc), rng, opts);
    if (!enc.wild) return null;
    var bonus = (battle.levelBonus || 0) + ((enc.mods && enc.mods.wildLevelBonus) || 0);
    if (bonus > 0) {
      var row = POKEDEX[enc.wild.id - 1];
      if (row) enc.wild = Scenes.makeWild(row, Math.min(100, enc.wild.level + bonus));
    }
    log(enc, { t: "spawn", id: enc.wild.id, name: enc.wild.name, nameEn: enc.wild.en, level: enc.wild.level, tier: enc.wild.tier });
    return enc.wild;
  }
  // 开一场遭遇战：场景必须已解锁（按训练家等级）；第一只野生按胜场 0 刷。
  function startEncounter(state, sceneId, picks, rng) {
    var scene = Scenes.sceneById(sceneId);
    if (!scene) return { ok: false, error: "badScene" };
    var trainer = Gacha.ensureTrainer(state);
    if (trainer.level < scene.unlockLevel) return { ok: false, error: "locked" };
    var built = buildTeam(state, picks);
    if (!built.ok) return built;
    var enc = { sceneId: sceneId, team: built.team, activeIndex: 0, wild: null,
      wins: 0, kos: 0, highLevelWins: 0, catches: 0,
      phase: "battle", needsPick: false, chest: null, log: [],
      // Task 32：当前事件（phase "event" 时是 applyEvent 的返回）、胜场战利品、擂台剩余场次、
      // 运行期修正值（和 js/encounter-events.js 的 ensureMods 同形；常驻的整场有效，
      // 「下一场」的在每场战斗结束时清掉）
      event: null, pendingBonus: null, arenaRemaining: 0,
      // Task 34 保底：自上次事件以来打赢的场次；到 3 场时下一次继续前进必定触发事件
      battlesSinceEvent: 0,
      mods: { atkBonus: 0, critBonus: 0, damageMultNext: 1, catchMultNext: 1,
        forceFirstNext: false, forceWildFirstNext: false, wildLevelBonus: 0, minTierNext: null, chestMult: 1 } };
    spawnNextWild(enc, rng);
    if (!enc.wild) return { ok: false, error: "noWild" };
    return { ok: true, encounter: enc };
  }

  // 野生攻击出战卡（先手或反击都走这里）；返回是否打倒了出战卡
  function wildAttack(enc, rng) {
    var active = activeMember(enc);
    var mult = Types.effectiveness(enc.wild.firstType, Types.parseTypes(active.types));
    var crit = rng() < enc.wild.critRate / 100;
    var dmg = calcDamage(enc.wild.atk, mult, crit);
    active.hp = Math.max(0, active.hp - dmg);
    log(enc, { t: "hit", by: "wild", attacker: enc.wild.name, attackerEn: enc.wild.en, defender: active.name, defenderEn: active.en,
      damage: dmg, crit: crit, mult: mult, defHp: active.hp, defHpMax: memberMaxHp(active) });
    return isFainted(active);
  }
  // 玩家攻击野生；返回野生是否被击倒
  // 修正值（Task 32）：攻击 +atkBonus、暴击率 +critBonus、伤害 ×damageMultNext（整场有效，打完清零）
  function playerAttack(enc, rng) {
    var active = activeMember(enc);
    var mods = enc.mods || {};
    var mult = Types.effectiveness(firstTypeOf(active.types), Types.parseTypes(enc.wild.types));
    var critRate = CardProgress.critRateForCard(active.card) + (mods.critBonus || 0);
    var crit = rng() < critRate / 100;
    var dmg = calcDamage(active.card.atk + (mods.atkBonus || 0), mult, crit);
    if (mods.damageMultNext && mods.damageMultNext !== 1) dmg = Math.max(1, Math.round(dmg * mods.damageMultNext));
    enc.wild.hp = Math.max(0, enc.wild.hp - dmg);
    log(enc, { t: "hit", by: "player", attacker: active.name, attackerEn: active.en, defender: enc.wild.name, defenderEn: enc.wild.en,
      damage: dmg, crit: crit, mult: mult, defHp: enc.wild.hp, defHpMax: enc.wild.hpMax });
    return enc.wild.hp <= 0;
  }
  // 出战卡倒下后的处理：还有能用的就等玩家免费选下一只，全倒了就团灭开宝箱
  function afterFaint(enc, state, rng, result) {
    var active = activeMember(enc);
    log(enc, { t: "faint", name: active.name, nameEn: active.en });
    if (usableMembers(enc).length === 0) {
      log(enc, { t: "wipe" });
      settleChest(enc, state, rng);
      result.wiped = true;
    } else {
      enc.needsPick = true;
      result.needsPick = true;
    }
    result.activeFainted = true;
  }
  // 每赢一轮（击倒或抓到）的结算：经验 + 亲密度都给出战的那张卡，立即写进卡里；
  // 然后进战间选择（继续前进 / 结束遭遇战），下一只野生在选继续时才刷。
  // 擂台（arenaRemaining > 0）：不进战间选择、不发战利品，直接刷同一事件的下一场；
  // 最后一场：发战斗类事件的胜场战利品（有的话），清掉「下一场」修正值，再进战间选择。
  // 返回 { arena: true }（擂台继续）或 { bonus }（最后一场发的战利品，没有就是 null）。
  function winRound(enc, state, how, rng, now) {
    rng = rng || Math.random;
    var active = activeMember(enc);
    var wild = enc.wild;
    enc.wins += 1;
    // Task 34 保底：每打赢一场（擂台的每场都算）+1；出事件时在 nextStep 里清零
    enc.battlesSinceEvent = (enc.battlesSinceEvent || 0) + 1;
    if (how === "ko") { enc.kos += 1; log(enc, { t: "ko", name: wild.name, nameEn: wild.en }); }
    var highLevel = wild.level > active.card.level;
    if (highLevel) enc.highLevelWins += 1;
    var levels = CardProgress.applyExpGain(state, active.speciesId, active.card,
      expGainFor(wild.level, active.card.level));
    if (levels > 0) active.hpMax = active.card.hp; // 战斗结算升了级，最大 HP 跟着变，当前 HP 不变
    CardProgress.normalizeCardProgress(active.card);
    active.card.affection = (active.card.affection || 0) + 1;
    if (levels > 0) log(enc, { t: "levelup", name: active.name, nameEn: active.en, from: active.card.level - levels, to: active.card.level });
    if (enc.arenaRemaining > 0) {
      enc.arenaRemaining -= 1;
      enc.wild = null;
      spawnEventWild(enc, rng, (enc.event && enc.event.battle) || {});
      return { arena: true, bonus: null };
    }
    var bonus = null;
    if (enc.pendingBonus) {
      bonus = grantPendingBonus(enc, state, enc.pendingBonus, rng, now);
      if (bonus) log(enc, { t: "bonus", bonus: bonus });
      enc.pendingBonus = null;
    }
    enc.event = null;
    clearBattleMods(enc);
    enc.wild = null;
    enc.phase = "prompt";
    log(enc, { t: "prompt" });
    return { arena: false, bonus: bonus };
  }
  // 每场战斗结束清掉「下一场」修正值（伤害/捕捉/先手；稀有度下限在刷野时已消耗）；
  // 本场常驻的（攻击/暴击/野生等级/结算倍率）不清
  function clearBattleMods(enc) {
    if (!enc.mods) return;
    enc.mods.damageMultNext = 1;
    enc.mods.catchMultNext = 1;
    enc.mods.forceFirstNext = false;
    enc.mods.forceWildFirstNext = false;
  }
  // 战斗类事件的胜场战利品：结晶走每日上限（到上限改亲密度 +1，满 10 级无效）；
  // 球/糖果直接发；随机石头 roll 一个；亲密度直接加给出战卡
  function grantPendingBonus(enc, state, bonus, rng, now) {
    if (!bonus) return null;
    rng = rng || Math.random;
    var trainer = Gacha.ensureTrainer(state);
    var active = activeMember(enc);
    var granted = {};
    if (typeof bonus.crystals === "number") {
      var grant = Gacha.grantEncounterCrystals(state, bonus.crystals, now);
      granted.crystals = grant.granted;
      if (grant.capped && active) {
        CardProgress.normalizeCardProgress(active.card);
        if (CardProgress.affectionLevel(active.card.affection) < CardProgress.AFFECTION_MAX_LEVEL) {
          active.card.affection = Math.min(CardProgress.AFFECTION_MAX_LEVEL * CardProgress.AFFECTION_POINTS_PER_LEVEL,
            (active.card.affection || 0) + 1);
          granted.affection = 1;
        }
      }
    }
    if (bonus.items) Object.keys(bonus.items).forEach(function (id) {
      trainer.items[id] = (trainer.items[id] || 0) + bonus.items[id];
      granted.items = granted.items || {};
      granted.items[id] = (granted.items[id] || 0) + bonus.items[id];
    });
    if (typeof bonus.candy === "number") { trainer.candy += bonus.candy; granted.candy = bonus.candy; }
    if (bonus.randomStone) {
      var stones = EncounterEvents.STONES;
      var stone = stones[Math.min(stones.length - 1, Math.floor(rng() * stones.length))];
      trainer.items[stone] = (trainer.items[stone] || 0) + 1;
      granted.items = granted.items || {};
      granted.items[stone] = (granted.items[stone] || 0) + 1;
    }
    if (typeof bonus.affection === "number" && active) {
      CardProgress.normalizeCardProgress(active.card);
      active.card.affection = (active.card.affection || 0) + bonus.affection;
      granted.affection = (granted.affection || 0) + bonus.affection;
    }
    return granted;
  }

  // 攻击：野生等级 > 出战等级时野生先攻；若出战卡被这一击打倒，本次攻击打不出来。
  // 野生每回合最多攻击一次（先攻就是它的那次攻击；玩家先攻时它是反击）。
  // 先手修正值（Task 32）：forceWildFirstNext > forceFirstNext > 等级规则
  // now 可传（Date 或时间戳，测试用），透传给 winRound（战利品发结晶要按天算上限）
  function attack(enc, state, rng, now) {
    if (enc.phase !== "battle") return { ok: false, error: "notInBattle" };
    if (enc.needsPick) return { ok: false, error: "needPick" };
    var active = activeMember(enc);
    if (!active || isFainted(active)) return { ok: false, error: "noActive" };
    if (!enc.wild) return { ok: false, error: "noWild" };
    var result = { ok: true, wildFainted: false, activeFainted: false, needsPick: false, wiped: false, prompt: false, arena: false, bonus: null };
    var mods = enc.mods || {};
    var wildFirst = mods.forceWildFirstNext ? true : mods.forceFirstNext ? false : enc.wild.level > active.card.level;
    if (wildFirst && wildAttack(enc, rng)) { afterFaint(enc, state, rng, result); return result; }
    if (playerAttack(enc, rng)) {
      result.wildFainted = true;
      var wr = winRound(enc, state, "ko", rng, now);
      if (wr.arena) result.arena = true;
      else result.prompt = true;
      result.bonus = wr.bonus;
      return result;
    }
    if (!wildFirst && wildAttack(enc, rng)) afterFaint(enc, state, rng, result);
    return result;
  }
  // 交换：换另一只可用宝可梦上场，占用本回合（野生会攻击新上场的宝可梦）。
  // 出战卡倒下后的免费选下一只走 chooseNext，不走这里。
  function switchMember(enc, state, rng, index) {
    if (enc.phase !== "battle") return { ok: false, error: "notInBattle" };
    if (enc.needsPick) return { ok: false, error: "needPick" };
    var target = enc.team[index];
    if (!target || index === enc.activeIndex) return { ok: false, error: "badTarget" };
    if (isFainted(target)) return { ok: false, error: "fainted" };
    var result = { ok: true, activeFainted: false, needsPick: false, wiped: false };
    enc.activeIndex = index;
    log(enc, { t: "switch", name: target.name, nameEn: target.en });
    if (enc.wild && enc.wild.hp > 0 && wildAttack(enc, rng)) afterFaint(enc, state, rng, result);
    return result;
  }
  // 出战卡倒下后免费选下一只（野生不趁机攻击）
  function chooseNext(enc, index) {
    if (!enc.needsPick) return { ok: false, error: "notNeeded" };
    var target = enc.team[index];
    if (!target || isFainted(target)) return { ok: false, error: "badTarget" };
    enc.activeIndex = index;
    enc.needsPick = false;
    log(enc, { t: "switch", name: target.name, nameEn: target.en });
    return { ok: true };
  }
  // 道具（选球扔球）：占用一回合；抓到 = 抽了一张卡（保留野生等级，直接进卡册，
  // 不加入本场队伍；超上限按抽卡老规则，最弱的出局换糖果）；失败则球消耗掉，野生反击。
  // 注意：抓到那张卡若是队伍里某张卡的同种、且那张卡正好是 6 张里等级最低的，
  // 队伍引用的对象会被移出卡册（引用本身还在，本场能继续打，但它的经验结算不再进存档）——极少见，接受。
  // now 可传（Date 或时间戳，测试用），透传给 winRound（战利品发结晶要按天算上限）
  function useBall(enc, state, rng, ballId, now) {
    if (enc.phase !== "battle") return { ok: false, error: "notInBattle" };
    if (enc.needsPick) return { ok: false, error: "needPick" };
    if (BALL_MULT[ballId] == null) return { ok: false, error: "badBall" };
    var trainer = Gacha.ensureTrainer(state);
    if (!trainer.items || !(trainer.items[ballId] > 0)) return { ok: false, error: "noBall" };
    var result = { ok: true, caught: false, activeFainted: false, needsPick: false, wiped: false, prompt: false, arena: false, bonus: null };
    trainer.items[ballId] -= 1;
    var wild = enc.wild;
    // 捕捉率 ×catchMultNext（幸运草之类），再夹回 [0.05, 0.9]
    var catchMult = (enc.mods && enc.mods.catchMultNext) || 1;
    var caught = rng() < Math.max(0.05, Math.min(0.9, catchRate(wild, ballId) * catchMult));
    log(enc, { t: "catch", name: wild.name, nameEn: wild.en, ball: ballId, success: caught });
    if (caught) {
      // 抓到的稀有宝可梦按正常公式算 HP（野生的 ×2 / ×3 / ×5 不带走），暴击率按这张卡的亲密度（新卡 0%）
      Gacha.addToCollection(state, { id: wild.id, name: wild.name, en: wild.en, types: wild.types,
        tier: wild.tier, prob: wild.prob, level: wild.level, hp: wild.baseHp, atk: wild.atk, exp: 0, affection: 0 });
      enc.catches += 1;
      result.caught = true;
      var wr = winRound(enc, state, "catch", rng, now);
      if (wr.arena) result.arena = true;
      else result.prompt = true;
      result.bonus = wr.bonus;
      return result;
    }
    if (wildAttack(enc, rng)) afterFaint(enc, state, rng, result);
    return result;
  }
  // 宝箱结算：结晶 = 击倒数 + 高等级胜利数（击倒每只 +1；高等级胜利额外 +1，
  // 高等级胜利含抓到——所以高等级抓到给 +1，但抓到本身不给基础结晶）；
  // 道具：高等级胜利 ≥ 3 时 30% 得 1 个随机道具，≥ 5 时 60%。只结算一次。
  // 每日结晶计数用的本地日期 key（"2026-11-17"）；以 gacha.js 为准（Task 31 统一）
  var encounterDayKey = Gacha.encounterDayKey;
  function settleChest(enc, state, rng, now) {
    if (enc.phase === "done") return enc.chest;
    var trainer = Gacha.ensureTrainer(state);
    var wanted = enc.kos + enc.highLevelWins;
    // 每日上限 100：走 Gacha.grantEncounterCrystals（跨天清零、按剩余额度发）；
    // 流星事件会把 chestMult 设成 2（本次遭遇战结算奖励翻倍）：结晶数 ×2（仍受每日上限封顶），
    // 道具 roll 中了也 ×2（同一道具给两份）
    var chestMult = (enc.mods && typeof enc.mods.chestMult === "number") ? enc.mods.chestMult : 1;
    var grant = Gacha.grantEncounterCrystals(state, wanted * chestMult, now);
    var granted = grant.granted;
    // 到上限被封顶的部分改给亲密度 +2（用户定 2026-11-23）：给当前出战卡，满 10 级就无效
    var affectionGain = 0;
    if (grant.capped) {
      var active = activeMember(enc);
      if (active) {
        CardProgress.normalizeCardProgress(active.card);
        if (CardProgress.affectionLevel(active.card.affection) < CardProgress.AFFECTION_MAX_LEVEL) {
          active.card.affection = Math.min(CardProgress.AFFECTION_MAX_LEVEL * CardProgress.AFFECTION_POINTS_PER_LEVEL,
            (active.card.affection || 0) + 2);
          affectionGain = 2;
        }
      }
    }
    var items = [];
    var odds = enc.highLevelWins >= 5 ? 0.6 : enc.highLevelWins >= 3 ? 0.3 : 0;
    if (odds > 0 && rng() < odds) {
      var itemId = CHEST_ITEM_POOL[Math.min(CHEST_ITEM_POOL.length - 1, Math.floor(rng() * CHEST_ITEM_POOL.length))];
      for (var k = 0; k < chestMult; k++) items.push(itemId);
    }
    items.forEach(function (id) { trainer.items[id] = (trainer.items[id] || 0) + 1; });
    enc.chest = { crystals: granted, items: items, capped: grant.capped, affection: affectionGain };
    enc.phase = "done";
    log(enc, { t: "chest", crystals: granted, items: items, capped: grant.capped, affection: affectionGain });
    return enc.chest;
  }
  // 撤退：立刻离开遭遇战并开宝箱结算（按当前进度），野生不攻击
  function retreat(enc, state, rng, now) {
    if (enc.phase === "done") return { ok: false, error: "alreadyDone" };
    log(enc, { t: "retreat" });
    return { ok: true, chest: settleChest(enc, state, rng, now) };
  }
  // 战间推进：70% 野生战斗 / 30% 随机事件（用户定 2026-11-23）。
  // 事件当场结算（applyEvent），进 event 阶段等界面展示；战斗类事件要等玩家点「开始战斗」
  // （startEventBattle）才刷野。没有可选事件时回落到战斗。战斗类事件未打之前不能继续前进
  // （得先打完或结束遭遇战）。
  // Task 34 保底：自上次事件以来连赢 3 场后，下一次继续前进必定触发事件
  // （30% 概率照常 roll，保底只在 3 场没出事件时兜底；rollEvent 为空时回落战斗）
  function nextStep(enc, state, rng, now) {
    rng = rng || Math.random;
    if (enc.phase !== "prompt" && enc.phase !== "event") return { ok: false, error: "notInPrompt" };
    if (enc.phase === "event" && enc.event && enc.event.kind === "battle") return { ok: false, error: "eventBattlePending" };
    if (enc.needsPick) return { ok: false, error: "needPick" };
    var guaranteed = (enc.battlesSinceEvent || 0) >= 3;
    if (guaranteed || rng() < 0.30) {
      var ev = EncounterEvents.rollEvent(enc, state, rng, now);
      if (ev) {
        var res = EncounterEvents.applyEvent(enc, state, ev, rng, now);
        enc.event = res;
        enc.battlesSinceEvent = 0;
        enc.phase = "event";
        log(enc, { t: "event", name: res.event.zh, nameEn: res.event.en, textZh: res.textZh, textEn: res.textEn });
        return { ok: true, phase: "event", event: res };
      }
    }
    spawnNextWild(enc, rng);
    if (!enc.wild) return { ok: false, error: "noWild" };
    enc.event = null; // 上一个事件已结束（O4：不留过期引用）
    enc.phase = "battle";
    return { ok: true, phase: "battle", wild: enc.wild };
  }
  // 战斗类事件开打：按事件参数刷野（等级加成 / 类型过滤 / 稀有度上限），记下胜场战利品
  // 和擂台剩余场次；擂台一共打 2 场（arenaRemaining 记第一场之后还剩几场）
  function startEventBattle(enc, state, rng) {
    rng = rng || Math.random;
    if (enc.phase !== "event" || !enc.event || enc.event.kind !== "battle") return { ok: false, error: "notInEventBattle" };
    var battle = enc.event.battle || {};
    enc.pendingBonus = battle.bonus || null;
    enc.arenaRemaining = battle.arena ? 1 : 0;
    spawnEventWild(enc, rng, battle);
    if (!enc.wild) return { ok: false, error: "noWild" };
    enc.phase = "battle";
    return { ok: true, phase: "battle", wild: enc.wild };
  }
  // 战间选择：继续前进——70% 战斗 / 30% 事件（nextStep；连赢 3 场后必定出事件，Task 34）
  function continueRun(enc, state, rng, now) {
    return nextStep(enc, state, rng, now);
  }
  // 战间选择：结束遭遇战——开宝箱结算；事件屏上也可以结束
  function endRun(enc, state, rng, now) {
    if (enc.phase !== "prompt" && enc.phase !== "event") return { ok: false, error: "notInPrompt" };
    return { ok: true, chest: settleChest(enc, state, rng, now) };
  }

  var Encounter = { DAMAGE_DIVISOR: DAMAGE_DIVISOR, DAILY_CRYSTAL_CAP: DAILY_CRYSTAL_CAP, BALL_MULT: BALL_MULT,
    TIER_CATCH_MULT: TIER_CATCH_MULT, CHEST_ITEM_POOL: CHEST_ITEM_POOL,
    calcDamage: calcDamage, expGainFor: expGainFor, catchRate: catchRate,
    encounterDayKey: encounterDayKey,
    firstTypeOf: firstTypeOf, buildTeam: buildTeam, startEncounter: startEncounter,
    activeMember: activeMember, memberMaxHp: memberMaxHp, refreshTeamMaxHp: refreshTeamMaxHp,
    isFainted: isFainted,
    usableMembers: usableMembers, teamMaxLevel: teamMaxLevel, attack: attack,
    switchMember: switchMember, chooseNext: chooseNext, useBall: useBall,
    retreat: retreat, continueRun: continueRun, endRun: endRun, nextStep: nextStep,
    startEventBattle: startEventBattle,
    settleChest: settleChest, winRound: winRound, spawnNextWild: spawnNextWild };

  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.Encounter = Encounter;
  }
  if (typeof module !== "undefined") module.exports = Encounter;
})(typeof window !== "undefined" ? window : globalThis);
