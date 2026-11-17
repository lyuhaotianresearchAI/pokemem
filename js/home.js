// PokeMem — 首页：顶栏、计时、开包与开包结果浮层
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }
  function cardName(c) { return PokeMem.cardName(c); }
  function tierLabel(tier) { return PokeMem.tierLabel(tier); }

  // SSR / MR 翻过来时像炉石开卡那样震一下：先去掉再加，同一张牌点两次也能重播
  function shakeIfSpecial(el, tier) {
    if (tier !== "SSR" && tier !== "MR") return;
    el.classList.remove("special-shake");
    void el.offsetWidth;
    el.classList.add("special-shake");
  }

  // ---------- 计时 ----------
  function tick() {
    if (!ctx.state.debug) {
      var due = Gacha.grantDuePacks(ctx.state, Date.now());
      if (due > 0) PokeMem.save();
    }
    renderHeader();
  }

  // ---------- 顶栏 / 首页 ----------
  function renderHeader() {
    $("pack-count").textContent = ctx.state.packs;
    $("owned-count").textContent = Gacha.ownedCount(ctx.state) + " / 151";
    $("total-draws").textContent = ctx.state.totalDraws;
    $("since-ssr").textContent = ctx.state.sinceSSR >= 49 ? t("pityNext") : t("pityIn", { n: 50 - ctx.state.sinceSSR });
    var openBtn = $("open-pack-btn");
    openBtn.disabled = ctx.state.packs <= 0;
    openBtn.textContent = ctx.state.packs > 0 ? t("openPack") : t("noPack");
    $("next-pack").textContent = ctx.state.debug
      ? t("nextPackDebug")
      : t("nextPack", { time: PokeMem.fmtTime(Gacha.msToNextPack(ctx.state, Date.now())) });
    $("debug-badge").style.display = ctx.state.debug ? "inline-block" : "none";
    $("debug-panel").style.display = ctx.state.debug ? "block" : "none";
    $("debug-toggle").checked = ctx.state.debug;
  }

  // ---------- 开包 ----------
  $("open-pack-btn").addEventListener("click", function () {
    if (ctx.state.packs <= 0) return;
    ctx.currentPack = Gacha.drawPack(ctx.state, Math.random);
    PokeMem.save();
    renderHeader();
    renderPack();
    $("pack-overlay").classList.add("show");
  });
  function renderPack() {
    var wrap = $("pack-cards");
    wrap.innerHTML = "";
    ctx.currentPack.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "pack-card " + PokeMem.tierClass(c.tier);
      d.dataset.tier = c.tier;
      d.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-front"><div class="card-back">?</div></div>' +
        '<div class="card-face">' +
        '<img src="' + imgUrl(c.id) + '" alt="' + cardName(c) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="card-no">#' + String(c.id).padStart(3, "0") + '</div>' +
        '<div class="card-name">' + cardName(c) + '</div>' +
        '<div class="card-tier">' + PokeMem.mark(c.tier) + " " + c.tier + " · " + tierLabel(c.tier) + "</div>" +
        '<div class="card-stats">Lv.' + c.level + "　HP " + c.hp + "　" + t("atkLabel") + " " + c.atk + "</div>" +
        (c.isNew ? '<div class="new-badge">NEW</div>' : "") +
        (c.pity ? '<div class="pity-badge">' + t("pityBadge") + "</div>" : "") +
        "</div></div>";
      d.addEventListener("click", function () {
        if (d.classList.contains("flipped")) return;
        d.classList.add("flipped");
        shakeIfSpecial(d, c.tier);
      });
      wrap.appendChild(d);
    });
    $("pack-summary").textContent = t("packHint");
  }
  $("flip-all-btn").addEventListener("click", function () {
    document.querySelectorAll(".pack-card").forEach(function (el) {
      if (el.classList.contains("flipped")) return;
      el.classList.add("flipped");
      shakeIfSpecial(el, el.dataset.tier);
    });
    var best = ctx.currentPack.slice().sort(function (a, b) {
      var order = { MR: 0, UR: 1, SSR: 2, SR: 3, R: 4, N: 5 };
      return order[a.tier] - order[b.tier];
    })[0];
    var news = ctx.currentPack.filter(function (c) { return c.isNew; }).length;
    $("pack-summary").textContent = t("packBest", { name: cardName(best), tier: best.tier, n: news });
  });
  $("close-pack-btn").addEventListener("click", function () {
    $("pack-overlay").classList.remove("show");
    PokeMem.renderCollection();
  });

  window.PokeMem = window.PokeMem || {};
  PokeMem.tick = tick;
  PokeMem.renderHeader = renderHeader;
  PokeMem.renderPack = renderPack;
})();
