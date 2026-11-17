// PokeMem — 遭遇战界面（Task 27）：场景列表 + 选队（战斗屏在 Task 28）
// 场景卡和选队格子都用 createElement 造按钮（不用 innerHTML 字符串），
// 和头像选择器一个做法，测试桩也能点。
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }

  function selectedScene() { return ctx.encounterScene || "grassland"; }
  function teamPicks() { return ctx.teamPicks || (ctx.teamPicks = []); }
  function pickIndex(speciesId, cardIndex) {
    var picks = teamPicks();
    for (var i = 0; i < picks.length; i++) if (picks[i].speciesId === speciesId && picks[i].cardIndex === cardIndex) return i;
    return -1;
  }
  // 选队里可能有脏引用（清空存档后卡没了）：渲染前先清掉
  function prunePicks() {
    var picks = teamPicks();
    var kept = picks.filter(function (p) {
      var e = ctx.state.collection[p.speciesId];
      return e && e.cards && e.cards[p.cardIndex];
    });
    if (kept.length !== picks.length) ctx.teamPicks = kept;
  }

  function renderEncounter() {
    var enc = ctx.encounter;
    var active = enc && enc.phase !== "done";
    $("encounter-picker").style.display = active ? "none" : "";
    $("encounter-status").style.display = active ? "" : "none";
    if (active) renderStatus(enc);
    else { prunePicks(); renderScenes(); renderTeam(); updateStartBtn(); }
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
  // 选队格子：每张已有的卡一个格子（按编号、等级从高到低），显示 Lv / HP / 攻击 / 亲密度
  function renderTeam() {
    var grid = $("team-grid");
    grid.innerHTML = "";
    POKEDEX.forEach(function (row) {
      var e = ctx.state.collection[row[0]];
      if (!e || !e.cards || !e.cards.length) return;
      e.cards.slice().sort(function (a, b) { return b.level - a.level; }).forEach(function (c) {
        var idx = e.cards.indexOf(c);
        var b = document.createElement("button");
        b.classList.add("team-cell");
        var sel = pickIndex(row[0], idx) >= 0;
        if (sel) b.classList.add("selected");
        b.setAttribute("data-species", row[0]);
        b.setAttribute("data-card", idx);
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
        var st = document.createElement("div");
        st.className = "team-stat";
        st.textContent = "Lv." + c.level + "　HP " + c.hp + " · " + t("atkLabel") + " " + c.atk;
        b.appendChild(st);
        var af = document.createElement("div");
        af.className = "team-affection";
        af.textContent = t("encounterAffection", { level: CardProgress.affectionLevel(c.affection) });
        b.appendChild(af);
        var chk = document.createElement("span");
        chk.className = "team-check";
        chk.textContent = sel ? "✓" : "";
        b.appendChild(chk);
        b.addEventListener("click", function () { togglePick(row[0], idx); });
        grid.appendChild(b);
      });
    });
    $("team-pick-count").textContent = t("encounterTeamCount", { n: teamPicks().length });
  }
  function togglePick(speciesId, cardIndex) {
    var picks = teamPicks();
    var i = pickIndex(speciesId, cardIndex);
    if (i >= 0) picks.splice(i, 1);
    else {
      if (picks.length >= 6) { PokeMem.showToast(t("encounterTeamFull")); return; }
      picks.push({ speciesId: speciesId, cardIndex: cardIndex });
    }
    renderTeam();
    updateStartBtn();
  }
  function updateStartBtn() {
    $("encounter-start-btn").disabled = teamPicks().length < 1;
  }
  // 开始：建一场遭遇战、记在 ctx.encounter 里（Task 28 的战斗屏接手）；开场不写存档
  function startRun() {
    var picks = teamPicks();
    if (picks.length < 1) { PokeMem.showToast(t("encounterNeedTeam")); return; }
    var res = PokeMem.Encounter.startEncounter(ctx.state, selectedScene(), picks, Math.random);
    if (!res.ok) { PokeMem.showToast(t("encounterStartFail")); return; }
    ctx.encounter = res.encounter;
    ctx.teamPicks = [];
    var w = res.encounter.wild;
    PokeMem.showToast(t("encounterStarted", { name: PokeMem.lang() === "en" ? w.en : w.name, level: w.level }));
    renderEncounter();
  }
  // 进行中的遭遇战状态：场景、当前野生、已胜场数；放弃等于中途离开，宝箱就没了（和刷新页面一样）
  function renderStatus(enc) {
    var sc = PokeMem.Scenes.sceneById(enc.sceneId);
    $("encounter-status-scene").textContent = t("encounterCurrentScene",
      { name: sc ? PokeMem.Scenes.sceneName(sc.id, PokeMem.lang()) : "" });
    var w = enc.wild;
    $("encounter-status-wild").textContent = w
      ? t("encounterCurrentWild", { name: PokeMem.lang() === "en" ? w.en : w.name, level: w.level, hp: w.hp, hpMax: w.hpMax })
      : "";
    $("encounter-status-wins").textContent = t("encounterCurrentWins", { n: enc.wins });
  }
  function abandonRun() {
    ctx.encounter = null;
    renderEncounter();
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.renderEncounter = renderEncounter;

  $("encounter-start-btn").addEventListener("click", startRun);
  $("encounter-abandon-btn").addEventListener("click", abandonRun);
})();
