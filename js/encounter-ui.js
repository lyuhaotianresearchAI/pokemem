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
  // 场景轨道：9 个小圆圈绕着中心转（36s 一圈，图标始终正着）；中心显示悬停或选中场景的信息
  // （名字、属性、野生起始等级、解锁条件），没悬停也没选中时显示提示。
  // 转圈的停/转：鼠标放上轨道就停（好点中）；选中了也停（再点一次已选的取消选择）；
  // 没选、鼠标也离开了就继续转。点选只就地改 .selected，不重建轨道（重建会把转圈角度归零）。
  var orbitHover = false; // 鼠标在不在轨道上
  var orbitWrapEl = null; // 轨道外框（转圈暂停靠它加 .paused）
  var orbitCenterEl = null; // 中心信息区
  var orbitCells = []; // 9 个圆圈（按场景顺序）
  function orbitPaused() { return orbitHover || !!ctx.encounterScene; }
  function updateOrbitPause() {
    if (!orbitWrapEl) return;
    if (orbitPaused()) orbitWrapEl.classList.add("paused");
    else orbitWrapEl.classList.remove("paused");
  }
  // 中心显示哪个场景的信息：悬停的优先，其次已选的（默认草丛），都没有就显示提示
  function showOrbitCenter(sc) {
    if (!orbitCenterEl) return;
    orbitCenterEl.innerHTML = "";
    if (!sc) {
      var hint = document.createElement("div");
      hint.className = "orbit-hint";
      hint.textContent = t("encounterOrbitHint");
      orbitCenterEl.appendChild(hint);
      return;
    }
    var locked = Gacha.ensureTrainer(ctx.state).level < sc.unlockLevel;
    var name = document.createElement("div");
    name.className = "orbit-name";
    name.textContent = PokeMem.Scenes.sceneName(sc.id, PokeMem.lang()) +
      (sc.id === selectedScene() ? " ✓" : "");
    orbitCenterEl.appendChild(name);
    var types = document.createElement("div");
    types.className = "orbit-types";
    types.innerHTML = sc.types.map(function (id) { return PokeMem.Types.typeIconHtml(id); }).join("");
    orbitCenterEl.appendChild(types);
    var base = document.createElement("div");
    base.className = "orbit-base";
    base.textContent = locked
      ? t("encounterUnlock", { level: sc.unlockLevel })
      : t("encounterBaseLevel", { level: sc.baseLevel });
    orbitCenterEl.appendChild(base);
  }
  function renderScenes() {
    var tr = Gacha.ensureTrainer(ctx.state);
    var list = $("scene-list");
    list.innerHTML = "";
    orbitCells = [];
    var wrap = document.createElement("div");
    wrap.className = "orbit-wrap";
    wrap.id = "orbit-wrap";
    orbitWrapEl = wrap;
    var ring = document.createElement("div");
    ring.className = "orbit-ring";
    wrap.appendChild(ring);
    var center = document.createElement("div");
    center.className = "orbit-center";
    orbitCenterEl = center;
    wrap.appendChild(center);
    list.appendChild(wrap);
    PokeMem.Scenes.SCENES.forEach(function (sc, i) {
      var locked = tr.level < sc.unlockLevel;
      var cell = document.createElement("button");
      cell.classList.add("orbit-cell");
      if (locked) cell.classList.add("locked");
      if (sc.id === selectedScene()) cell.classList.add("selected");
      cell.setAttribute("data-scene", sc.id);
      // 圆圈在环上的位置：9 个、每 40° 一个，从正上方开始顺时针；内层反向转回来，图标始终正着
      var angle = i * 40 - 90;
      cell.style.transform = "rotate(" + angle + "deg) translate(var(--orbit-r)) rotate(" + (-angle) + "deg)";
      var img = document.createElement("img");
      img.className = "orbit-img";
      // 场景图：卡通地形图（SCENE_ICONS，全矢量 SVG）；文件没加载就回落到代表宝可梦立绘
      img.src = (typeof SCENE_ICONS !== "undefined" && SCENE_ICONS[sc.id]) || imgUrl(sc.art);
      img.alt = "";
      img.onerror = function () { this.style.display = "none"; };
      img.setAttribute("loading", "lazy");
      // 图标包一层 .orbit-icon 反向转（和环同速反向），图标转圈时始终正着、底朝下；
      // 锁也放这一层里，跟着图标一起正着，不会绕着圆圈跑
      var icon = document.createElement("div");
      icon.className = "orbit-icon";
      icon.appendChild(img);
      if (locked) {
        var badge = document.createElement("span");
        badge.className = "orbit-lock";
        badge.textContent = "🔒";
        icon.appendChild(badge);
      }
      cell.appendChild(icon);
      cell.addEventListener("mouseenter", function () { showOrbitCenter(sc); });
      cell.addEventListener("mouseleave", function () {
        showOrbitCenter(PokeMem.Scenes.sceneById(selectedScene()));
      });
      cell.addEventListener("click", function () {
        if (locked) return;
        // 再点一次已选的 = 取消选择（转圈继续）；点别的 = 换选（转圈停住）
        ctx.encounterScene = (ctx.encounterScene === sc.id) ? null : sc.id;
        orbitCells.forEach(function (c) {
          if (c.getAttribute("data-scene") === selectedScene()) c.classList.add("selected");
          else c.classList.remove("selected");
        });
        showOrbitCenter(PokeMem.Scenes.sceneById(selectedScene()));
        updateOrbitPause();
      });
      ring.appendChild(cell);
      orbitCells.push(cell);
    });
    wrap.addEventListener("mouseenter", function () { orbitHover = true; updateOrbitPause(); });
    wrap.addEventListener("mouseleave", function () {
      orbitHover = false;
      showOrbitCenter(PokeMem.Scenes.sceneById(selectedScene()));
      updateOrbitPause();
    });
    showOrbitCenter(PokeMem.Scenes.sceneById(selectedScene()));
    updateOrbitPause();
  }
  // 选队格子：每种一个格子（只放形象和名字，Lv / HP / 攻击 / 亲密度不在格子上显示，在悬停 tab 里选）
  function renderTeam() {
    clearPickTabTimers(); // 格子重绘、旧格子没了：之前悬停排队的开 tab 定时别再拿旧格子定位
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
      b.addEventListener("click", function () { clearPickTabTimers(); showPickTab(row[0], b); }); // 点格子 = 立刻打开 tab（不直接选）
      b.addEventListener("mouseenter", function () { requestPickTab(row[0], b); });
      b.addEventListener("mouseleave", function (ev) {
        var tab = $("team-pick-tab");
        if (ev && ev.relatedTarget && tab.contains && tab.contains(ev.relatedTarget)) { clearPickTabTimers(); return; } // 移进 tab 里：取消待开/待收，别收
        scheduleHidePickTab();
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
  // tab 难移入的修法（用户反馈 2026-11-17）：格子到 tab 的路上会经过边上的格子，
  // 以前每个格子的 mouseenter 立刻换 tab，tab 就跟着鼠标跑、还没摸到就换了种甚至关了。
  // 现在两件事：① 悬停要“停一下才算数”（200ms 意图延迟），快速路过边上的格子不换 tab；
  // ② 收 tab 给 300ms 宽限，格子→tab 的路上哪怕短暂离开格子/tab 也不立刻收，
  // 移进 tab 里就取消待收。点格子还是立刻开，不等。
  var PICK_TAB_OPEN_DELAY = 200; // 悬停意图延迟：鼠标在一个格子上停满这么久才换 tab
  var PICK_TAB_CLOSE_DELAY = 300; // 收 tab 宽限：离开格子/tab 后这么久才收，给移鼠标留时间
  var pickTabShowTimer = null;
  var pickTabHideTimer = null;
  function clearPickTabTimers() {
    if (pickTabShowTimer) { clearTimeout(pickTabShowTimer); pickTabShowTimer = null; }
    if (pickTabHideTimer) { clearTimeout(pickTabHideTimer); pickTabHideTimer = null; }
  }
  function requestPickTab(speciesId, cell) {
    if (openTabSpecies === speciesId && $("team-pick-tab").style.display !== "none") { clearPickTabTimers(); return; } // 已经是这个种：只取消待收，不重绘
    clearPickTabTimers();
    pickTabShowTimer = setTimeout(function () { pickTabShowTimer = null; showPickTab(speciesId, cell); }, PICK_TAB_OPEN_DELAY);
  }
  function scheduleHidePickTab() {
    clearPickTabTimers();
    pickTabHideTimer = setTimeout(function () { pickTabHideTimer = null; hidePickTab(); }, PICK_TAB_CLOSE_DELAY);
  }
  // 悬停选卡 tab：鼠标移到格子上（或点格子），右边浮出该种宝可梦的全部卡，点一只上场
  function showPickTab(speciesId, cell) {
    clearPickTabTimers();
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
      // 每张卡一行写全信息（Lv / HP / 攻 / 亲密度 + 已选勾），字小、不换行
      b.textContent = "Lv." + c.level + " · HP" + c.hp + " · " + t("atkShort") + c.atk +
        " · " + t("encounterAffectionPoints", { n: c.affection || 0 }) + (sel ? " ✓" : "");
      b.addEventListener("click", function () { togglePick(speciesId, idx); }); // 点选项只切换、不收 tab，可以连续选
      tab.appendChild(b);
    });
    // 定位：格子右边；靠右边缘时改放左边
    var tabW = 230;
    var left = (cell.offsetLeft || 0) + (cell.offsetWidth || 0) + 8;
    var wrap = $("team-grid-wrap");
    if (wrap && left + tabW > (wrap.offsetWidth || 0)) left = Math.max(0, (cell.offsetLeft || 0) - tabW - 8);
    tab.style.left = left + "px";
    tab.style.top = (cell.offsetTop || 0) + "px";
    tab.style.display = "block";
  }
  function hidePickTab() { clearPickTabTimers(); openTabSpecies = null; $("team-pick-tab").style.display = "none"; }
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
  $("team-pick-tab").addEventListener("mouseenter", clearPickTabTimers); // 移进 tab 里：取消待收
  $("team-pick-tab").addEventListener("mouseleave", scheduleHidePickTab);
})();
