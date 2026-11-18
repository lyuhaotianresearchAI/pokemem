// PokeMem — 遭遇战界面（Task 27 场景列表 + 选队；Task 28 战斗屏 + 战间选择 + 结算）
// 场景卡、选队格子、选球/交换菜单都用 createElement 造按钮（不用 innerHTML 字符串），
// 和头像选择器一个做法，测试桩也能点。
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }

  function selectedScene() { return ctx.encounterScene || "grassland"; }
  function teamPicks() { return ctx.teamPicks || (ctx.teamPicks = []); }
  // 队伍是 6 个固定球槽：picks[i] 是第 i 个球里的卡（null = 空球）；
  // 新卡放第一个空球，取消只空出那一个球、别的球不动
  var openTabSpecies = null; // 悬停 tab 正开着哪个种（null = 没开）
  function pickCount() {
    var n = 0;
    teamPicks().forEach(function (p) { if (p) n++; });
    return n;
  }
  function pickIndex(speciesId, cardIndex) {
    var picks = teamPicks();
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      if (p && p.speciesId === speciesId && p.cardIndex === cardIndex) return i;
    }
    return -1;
  }
  // 选队里可能有脏引用（清空存档后卡没了）：渲染前先清掉（只空出那个球，不挪别的球）
  function prunePicks() {
    var picks = teamPicks();
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      if (!p) continue;
      var e = ctx.state.collection[p.speciesId];
      if (!e || !e.cards || !e.cards[p.cardIndex]) picks[i] = null;
    }
  }

  function renderEncounter() {
    var enc = ctx.encounter;
    var hasRun = !!enc;
    $("encounter-picker").style.display = hasRun ? "none" : "";
    $("encounter-status").style.display = hasRun ? "" : "none";
    if (!hasRun) { prunePicks(); renderScenes(); renderTeam(); updateStartBtn(); return; }
    if (enc.phase === "done") {
      $("battle-screen").style.display = "none";
      $("battle-settle").style.display = "";
      $("battle-prompt").classList.remove("show");
      renderSettle(enc);
      return;
    }
    $("battle-screen").style.display = "";
    $("battle-settle").style.display = "none";
    renderBattle(enc);
    if (enc.phase === "prompt") {
      $("battle-prompt-progress").textContent = t("battlePromptProgress", { kos: enc.kos, catches: enc.catches });
      $("battle-prompt").classList.add("show");
    } else {
      $("battle-prompt").classList.remove("show");
    }
  }
  // ---------- 战斗屏（Task 28） ----------
  function battleName(obj) { return PokeMem.lang() === "en" ? (obj.en || obj.name) : obj.name; }
  function setHpBar(fill, hp, hpMax) {
    var pct = hpMax > 0 ? Math.max(0, Math.min(100, hp / hpMax * 100)) : 0;
    fill.style.width = pct + "%";
    fill.classList.toggle("low", pct < 25);
  }
  function renderBattle(enc) {
    PokeMem.Encounter.refreshTeamMaxHp(enc); // 切回页签时同步最大 HP（糖果升级后）
    var wild = enc.wild;
    var active = PokeMem.Encounter.activeMember(enc);
    if (wild) {
      $("battle-wild-img").src = imgUrl(wild.id);
      $("battle-wild-img").style.display = "";
      $("battle-wild-name").textContent = "#" + String(wild.id).padStart(3, "0") + " " + battleName(wild) + "　Lv." + wild.level;
      $("battle-wild-types").innerHTML = PokeMem.Types.parseTypes(wild.types).map(function (id) { return PokeMem.Types.typeChipHtml(id, PokeMem.lang()); }).join(" ") + "　" + PokeMem.mark(wild.tier) + " " + wild.tier;
      setHpBar($("battle-wild-hp-fill"), wild.hp, wild.hpMax);
      $("battle-wild-hp-text").textContent = "HP " + wild.hp + " / " + wild.hpMax;
    } else {
      $("battle-wild-img").style.display = "none";
      $("battle-wild-name").textContent = "";
      $("battle-wild-types").innerHTML = "";
      setHpBar($("battle-wild-hp-fill"), 0, 1);
      $("battle-wild-hp-text").textContent = "";
    }
    if (active) {
      $("battle-mine-img").src = imgUrl(active.speciesId);
      $("battle-mine-img").style.display = "";
      $("battle-mine-name").textContent = "#" + String(active.speciesId).padStart(3, "0") + " " + battleName(active) + "　Lv." + active.card.level;
      $("battle-mine-affection").textContent = t("battleAffection", { level: CardProgress.affectionLevel(active.card.affection), rate: CardProgress.critRateForCard(active.card) });
      setHpBar($("battle-mine-hp-fill"), active.hp, PokeMem.Encounter.memberMaxHp(active));
      $("battle-mine-hp-text").textContent = "HP " + active.hp + " / " + PokeMem.Encounter.memberMaxHp(active);
      var need = CardProgress.cardExpNeeded(active.card.level);
      $("battle-mine-exp").textContent = need > 0 ? t("battleExp", { exp: active.card.exp || 0, needed: need }) : t("battleExpMax");
    } else {
      $("battle-mine-img").style.display = "none";
      $("battle-mine-name").textContent = "";
      $("battle-mine-affection").textContent = "";
      setHpBar($("battle-mine-hp-fill"), 0, 1);
      $("battle-mine-hp-text").textContent = "";
      $("battle-mine-exp").textContent = "";
    }
    renderLog(enc);
    updateBattleButtons(enc);
  }
  // 战报只显示一行：从最新往回找，第一条战斗条目（spawn / hit / faint / ko / catch / levelup / switch）
  function logName(e) { return PokeMem.lang() === "en" ? (e.nameEn || e.name) : e.name; }
  function renderLog(enc) {
    var line = "";
    for (var i = enc.log.length - 1; i >= 0; i--) {
      var e = enc.log[i];
      if (e.t === "hit") {
        // 扔球失败后野生必定反击：最新一条是 hit 时，优先显示它前面那条失败的抓捕
        var prev = i > 0 ? enc.log[i - 1] : null;
        if (prev && prev.t === "catch" && !prev.success) { line = t("battleLogCatchFail", { name: logName(prev) }); break; }
        var atk = PokeMem.lang() === "en" ? (e.attackerEn || e.attacker) : e.attacker;
        var def = PokeMem.lang() === "en" ? (e.defenderEn || e.defender) : e.defender;
        line = t("battleLogHit", { attacker: atk, defender: def, damage: e.damage });
        if (e.crit) line += " " + t("battleLogCrit");
        if (e.mult === 0) line += " " + t("battleLogNoEffect");
        else if (e.mult > 1) line += " " + t("battleLogSuper");
        else if (e.mult < 1) line += " " + t("battleLogNotVery");
        break;
      }
      if (e.t === "spawn") { line = t("battleLogSpawn", { name: logName(e), level: e.level }); break; }
      if (e.t === "faint") { line = t("battleLogFaint", { name: logName(e) }); break; }
      if (e.t === "ko") { line = t("battleLogKo", { name: logName(e) }); break; }
      if (e.t === "catch") { line = e.success ? t("battleLogCatch", { name: logName(e) }) : t("battleLogCatchFail", { name: logName(e) }); break; }
      if (e.t === "levelup") { line = t("battleLogLevelUp", { name: logName(e), level: e.to }); break; }
      if (e.t === "switch") { line = t("battleLogSwitch", { name: logName(e) }); break; }
    }
    $("battle-log").textContent = line;
  }
  function updateBattleButtons(enc) {
    var active = PokeMem.Encounter.activeMember(enc);
    var inBattle = enc.phase === "battle" && !!enc.wild && !!active;
    var needPick = !!enc.needsPick;
    $("battle-attack-btn").disabled = !inBattle || needPick;
    $("battle-switch-btn").disabled = !inBattle || needPick || PokeMem.Encounter.usableMembers(enc).length <= 1;
    var tr = Gacha.ensureTrainer(ctx.state);
    var balls = ["poke_ball", "great_ball", "ultra_ball"].reduce(function (n, id) { return n + ((tr.items && tr.items[id]) || 0); }, 0);
    $("battle-item-btn").disabled = !inBattle || needPick || balls <= 0;
    $("battle-retreat-btn").disabled = !inBattle;
    if (needPick) renderSwitchMenu(enc, true);
    else hideMenus();
  }
  function hideMenus() {
    $("battle-ball-menu").style.display = "none";
    $("battle-switch-menu").style.display = "none";
  }
  function toggleBallMenu() {
    var menu = $("battle-ball-menu");
    if (menu.style.display !== "none") { menu.style.display = "none"; return; }
    renderBallMenu();
    menu.style.display = "";
    $("battle-switch-menu").style.display = "none";
  }
  function renderBallMenu() {
    var menu = $("battle-ball-menu");
    menu.innerHTML = "";
    var tr = Gacha.ensureTrainer(ctx.state);
    var title = document.createElement("div");
    title.className = "battle-menu-title";
    title.textContent = t("battleBallPick");
    menu.appendChild(title);
    ["poke_ball", "great_ball", "ultra_ball"].forEach(function (id) {
      var n = (tr.items && tr.items[id]) || 0;
      var b = document.createElement("button");
      b.classList.add("ball-option");
      b.disabled = n <= 0;
      var nm = (ITEM_NAME[id] && ITEM_NAME[id][PokeMem.lang()]) || id;
      b.textContent = nm + " ×" + n;
      b.setAttribute("data-ball", id);
      b.addEventListener("click", function () { throwBall(id); });
      menu.appendChild(b);
    });
  }
  function toggleSwitchMenu() {
    var menu = $("battle-switch-menu");
    if (menu.style.display !== "none") { menu.style.display = "none"; return; }
    renderSwitchMenu(ctx.encounter, false);
  }
  function renderSwitchMenu(enc, forced) {
    var menu = $("battle-switch-menu");
    menu.innerHTML = "";
    var title = document.createElement("div");
    title.className = "battle-menu-title";
    title.textContent = t(forced ? "battleNextPick" : "battleSwitchPick");
    menu.appendChild(title);
    enc.team.forEach(function (m, i) {
      var b = document.createElement("button");
      b.classList.add("switch-option");
      var fainted = PokeMem.Encounter.isFainted(m);
      b.disabled = fainted || i === enc.activeIndex;
      b.textContent = battleName(m) + "　Lv." + m.card.level + "　HP " + m.hp + "/" + PokeMem.Encounter.memberMaxHp(m) + (fainted ? "（" + t("battleFainted") + "）" : "");
      b.setAttribute("data-member", i);
      b.addEventListener("click", function () { if (forced) pickNext(i); else doSwitch(i); });
      menu.appendChild(b);
    });
    menu.style.display = "";
  }
  // 每次行动后都要调 PokeMem.save()（Task 28 检查项）：每轮结算的经验 / 亲密度 / 抓到的卡 / 球消耗立即写进存档，刷新不丢
  function doAttack() {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.attack(enc, ctx.state, Math.random).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  function doSwitch(index) {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.switchMember(enc, ctx.state, Math.random, index).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  function pickNext(index) {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.chooseNext(enc, index).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  function throwBall(ballId) {
    var enc = ctx.encounter;
    if (!enc) return;
    var res = PokeMem.Encounter.useBall(enc, ctx.state, Math.random, ballId);
    if (!res.ok) {
      if (res.error === "noBall") PokeMem.showToast(t("battleNoBall"));
      renderEncounter();
      return;
    }
    PokeMem.save();
    renderEncounter();
  }
  function doRetreat() {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.retreat(enc, ctx.state, Math.random).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  function doContinue() {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.continueRun(enc, ctx.state, Math.random).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  function doEnd() {
    var enc = ctx.encounter;
    if (!enc) return;
    if (!PokeMem.Encounter.endRun(enc, ctx.state, Math.random).ok) return;
    PokeMem.save();
    renderEncounter();
  }
  // 结算屏：本场击倒数 + 宝箱内容（结晶 / 道具）；返回后回到选队
  function renderSettle(enc) {
    $("battle-settle-kos").textContent = t("battleSettleKos", { kos: enc.kos, catches: enc.catches });
    var chest = enc.chest || { crystals: 0, items: [] };
    var chestText;
    if (chest.crystals <= 0 && chest.items.length === 0) chestText = t("battleSettleEmpty");
    else if (chest.items.length === 0) chestText = t("battleSettleChest", { crystals: chest.crystals });
    else chestText = t("battleSettleChestItem", { crystals: chest.crystals, item: chest.items.map(function (id) { return (ITEM_NAME[id] && ITEM_NAME[id][PokeMem.lang()]) || id; }).join("、") });
    $("battle-settle-chest").textContent = chestText;
    $("battle-settle-cap").style.display = chest.capped ? "" : "none";
    if (chest.capped) $("battle-settle-cap").textContent = t("battleSettleCapped");
  }
  function backToPicker() {
    ctx.encounter = null;
    renderEncounter();
  }
  // 场景卡：名字 + 属性图标 + 野生起始等级；未解锁的灰掉、点不动
  function renderScenes() {
    var tr = Gacha.ensureTrainer(ctx.state);
    var list = $("scene-list");
    list.innerHTML = "";
    PokeMem.Scenes.SCENES.forEach(function (sc) {
      var locked = tr.level < sc.unlockLevel;
      var b = document.createElement("button");
      b.classList.add("scene-card");
      if (locked) b.classList.add("locked");
      if (sc.id === selectedScene()) b.classList.add("selected");
      b.setAttribute("data-scene", sc.id);
      var name = document.createElement("div");
      name.className = "scene-name";
      name.textContent = PokeMem.Scenes.sceneName(sc.id, PokeMem.lang());
      b.appendChild(name);
      var types = document.createElement("div");
      types.className = "scene-types";
      types.innerHTML = sc.types.map(function (id) { return PokeMem.Types.typeIconHtml(id); }).join("");
      b.appendChild(types);
      var base = document.createElement("div");
      base.className = "scene-base";
      base.textContent = t("encounterBaseLevel", { level: sc.baseLevel });
      b.appendChild(base);
      if (locked) {
        var lock = document.createElement("div");
        lock.className = "scene-lock";
        lock.textContent = t("encounterUnlock", { level: sc.unlockLevel });
        b.appendChild(lock);
      }
      b.addEventListener("click", function () {
        if (locked) return;
        ctx.encounterScene = sc.id;
        renderScenes();
      });
      list.appendChild(b);
    });
  }
  // 选队格子：每种一个格子（只放形象和名字，Lv / HP / 攻击 / 亲密度不在格子上显示，在悬停 tab 里选）
  function renderTeam() {
    var grid = $("team-grid");
    grid.innerHTML = "";
    POKEDEX.forEach(function (row) {
      var e = ctx.state.collection[row[0]];
      if (!e || !e.cards || !e.cards.length) return;
      var picked = null;
      for (var i = 0; i < teamPicks().length; i++) {
        var q = teamPicks()[i];
        if (q && q.speciesId === row[0]) { picked = q; break; }
      }
      var typeIds = PokeMem.Types.parseTypes(row[3]);
      var b = document.createElement("button");
      b.classList.add("team-cell");
      b.classList.add("tbg-" + typeIds[0]); // 底色按主属性染成卡片色
      if (picked) b.classList.add("selected");
      b.setAttribute("data-species", row[0]);
      var img = document.createElement("img");
      img.src = imgUrl(row[0]);
      img.alt = "";
      img.onerror = function () { this.style.display = "none"; };
      img.setAttribute("loading", "lazy");
      b.appendChild(img);
      var nm = document.createElement("div");
      nm.className = "team-name";
      nm.textContent = PokeMem.dexName(row);
      b.appendChild(nm);
      var types = document.createElement("div");
      types.className = "team-types";
      types.innerHTML = typeIds.map(function (id) { return PokeMem.Types.typeIconHtml(id); }).join("");
      b.appendChild(types);
      var cnt = document.createElement("span");
      cnt.className = "team-count" + (picked ? " selected" : "");
      cnt.textContent = (picked ? "✓ " : "") + "×" + e.cards.length;
      b.appendChild(cnt);
      b.addEventListener("click", function () { showPickTab(row[0], b); }); // 点格子 = 打开 tab（不直接选）
      b.addEventListener("mouseenter", function () { showPickTab(row[0], b); });
      b.addEventListener("mouseleave", function (ev) {
        var tab = $("team-pick-tab");
        if (ev && ev.relatedTarget && tab.contains && tab.contains(ev.relatedTarget)) return; // 移进 tab 里别收
        hidePickTab();
      });
      grid.appendChild(b);
    });
    renderTeamBalls();
    $("team-pick-count").textContent = t("encounterTeamCount", { n: pickCount() });
    if (openTabSpecies) { // tab 开着：格子重绘后按新格子重新锚定，选项的勾跟着刷新
      var cell = null;
      for (var i = 0; i < grid.children.length; i++) {
        if (grid.children[i].getAttribute("data-species") === String(openTabSpecies)) { cell = grid.children[i]; break; }
      }
      if (cell) showPickTab(openTabSpecies, cell);
    }
  }
  // 队伍精灵球：6 个槽；空球关着，选了的球打开、宝可梦放进去；点已选的取消
  function renderTeamBalls() {
    var box = $("team-balls");
    box.innerHTML = "";
    var picks = teamPicks();
    for (var i = 0; i < 6; i++) box.appendChild(makeBall(picks[i] || null));
  }
  function makeBall(p) {
    var b = document.createElement("button");
    b.classList.add("team-ball");
    var top = document.createElement("span"); top.className = "ball-top"; b.appendChild(top);
    var bot = document.createElement("span"); bot.className = "ball-bottom"; b.appendChild(bot);
    var band = document.createElement("span"); band.className = "ball-band"; b.appendChild(band);
    var btn = document.createElement("span"); btn.className = "ball-btn"; b.appendChild(btn);
    if (p) {
      b.classList.add("open");
      var img = document.createElement("img");
      img.className = "ball-mon";
      img.src = imgUrl(p.speciesId);
      img.alt = "";
      b.appendChild(img);
      var e = ctx.state.collection[p.speciesId];
      var c = e && e.cards && e.cards[p.cardIndex];
      var lv = document.createElement("span");
      lv.className = "ball-lv";
      lv.textContent = c ? "Lv." + c.level : "";
      b.appendChild(lv);
      b.title = t("encounterTeamBallRemove");
      b.addEventListener("click", function () { togglePick(p.speciesId, p.cardIndex); });
    }
    return b;
  }
  // 悬停选卡 tab：鼠标移到格子上（或点格子），右边浮出该种宝可梦的全部卡，点一只上场
  function showPickTab(speciesId, cell) {
    openTabSpecies = speciesId;
    var tab = $("team-pick-tab");
    tab.innerHTML = "";
    var row = POKEDEX[speciesId - 1];
    var e = ctx.state.collection[speciesId];
    if (!row || !e || !e.cards || !e.cards.length) return;
    var title = document.createElement("div");
    title.className = "team-pick-title";
    title.textContent = PokeMem.dexName(row) + " · " + t("encounterPickTitle");
    tab.appendChild(title);
    e.cards.slice().sort(function (a, b) { return b.level - a.level; }).forEach(function (c) {
      var idx = e.cards.indexOf(c);
      var sel = pickIndex(speciesId, idx) >= 0;
      var b = document.createElement("button");
      b.classList.add("team-pick-opt");
      if (sel) b.classList.add("selected");
      b.setAttribute("data-card", idx);
      b.textContent = "Lv." + c.level + "　HP " + c.hp + " · " + t("atkLabel") + " " + c.atk +
        "　" + t("encounterAffectionPoints", { n: c.affection || 0 }) + (sel ? "　✓" : "");
      b.addEventListener("click", function () { togglePick(speciesId, idx); }); // 点选项只切换、不收 tab，可以连续选
      tab.appendChild(b);
    });
    // 定位：格子右边；靠右边缘时改放左边
    var tabW = 190;
    var left = (cell.offsetLeft || 0) + (cell.offsetWidth || 0) + 8;
    var wrap = $("team-grid-wrap");
    if (wrap && left + tabW > (wrap.offsetWidth || 0)) left = Math.max(0, (cell.offsetLeft || 0) - tabW - 8);
    tab.style.left = left + "px";
    tab.style.top = (cell.offsetTop || 0) + "px";
    tab.style.display = "block";
  }
  function hidePickTab() { openTabSpecies = null; $("team-pick-tab").style.display = "none"; }
  function togglePick(speciesId, cardIndex) {
    var picks = teamPicks();
    var i = pickIndex(speciesId, cardIndex);
    if (i >= 0) picks[i] = null; // 点已选的 = 取消，只空出这一个球
    else {
      var slot = -1;
      for (var j = 0; j < 6; j++) if (!picks[j]) { slot = j; break; } // 新卡放第一个空球
      if (slot < 0) { PokeMem.showToast(t("encounterTeamFull")); return; }
      picks[slot] = { speciesId: speciesId, cardIndex: cardIndex };
    }
    renderTeam();
    updateStartBtn();
  }
  function updateStartBtn() {
    var dis = pickCount() < 1;
    $("encounter-start-btn").disabled = dis;
    $("encounter-deploy-btn").disabled = dis;
  }
  // 开始：建一场遭遇战、记在 ctx.encounter 里（Task 28 的战斗屏接手）；开场不写存档
  function startRun() {
    var picks = teamPicks().filter(function (p) { return !!p; }); // 空球不进战斗队伍
    if (picks.length < 1) { PokeMem.showToast(t("encounterNeedTeam")); return; }
    var res = PokeMem.Encounter.startEncounter(ctx.state, selectedScene(), picks, Math.random);
    if (!res.ok) { PokeMem.showToast(t("encounterStartFail")); return; }
    ctx.encounter = res.encounter;
    ctx.teamPicks = [];
    openTabSpecies = null;
    var w = res.encounter.wild;
    PokeMem.showToast(t("encounterStarted", { name: PokeMem.lang() === "en" ? w.en : w.name, level: w.level }));
    renderEncounter();
  }
  window.PokeMem = window.PokeMem || {};
  PokeMem.renderEncounter = renderEncounter;

  $("encounter-start-btn").addEventListener("click", startRun);
  $("encounter-deploy-btn").addEventListener("click", startRun);
  $("battle-attack-btn").addEventListener("click", doAttack);
  $("battle-switch-btn").addEventListener("click", toggleSwitchMenu);
  $("battle-item-btn").addEventListener("click", toggleBallMenu);
  $("battle-retreat-btn").addEventListener("click", doRetreat);
  $("battle-continue-btn").addEventListener("click", doContinue);
  $("battle-end-btn").addEventListener("click", doEnd);
  $("battle-settle-back-btn").addEventListener("click", backToPicker);
  $("team-pick-tab").addEventListener("mouseleave", hidePickTab);
})();
