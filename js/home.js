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
    var crystals = Gacha.ensureTrainer(ctx.state).crystals;
    $("crystal-count").textContent = crystals;
    $("exchange-btn").disabled = crystals < Gacha.CRYSTALS_PER_PACK;
  }

  // ---------- 开包 ----------
  // 开包只抽不结算：先预览 10 张（包数/卡册/经验/保底计数都不动），
  // 没翻牌就关闭 = 这包没开过；翻过至少一张再点入册，才真正提交。
  $("open-pack-btn").addEventListener("click", function () {
    if (ctx.state.packs <= 0) return;
    ctx.currentPack = Gacha.drawPackPreview(ctx.state, Math.random);
    ctx.packFlipped = 0;
    renderHeader();
    renderPack();
    $("pack-overlay").classList.add("show");
  });
  // 梦想结晶兑换：10 颗换 1 包（Task 14）。成功必须立即保存（PR #4 O1），
  // 否则扣掉的结晶刷新就回来；余额不足时 exchangeCrystalsForPack 返回 0，什么都不做。
  $("exchange-btn").addEventListener("click", function () {
    if (Gacha.exchangeCrystalsForPack(ctx.state, Date.now()) > 0) {
      PokeMem.save();
      renderHeader();
    }
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
        '<div class="card-front"></div>' +
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
        ctx.packFlipped += 1;
        updateCloseBtn();
      });
      wrap.appendChild(d);
    });
    $("pack-summary").textContent = t("packHint");
    updateCloseBtn();
    // 开包的训练师收获：经验 + 升级糖果（trainerExp 里只有升级糖果）+ 丢卡糖果（开包前后差值）
    var tp = ctx.currentPack.trainerExp;
    if (tp) {
      var parts = [t("packTrainerExp", { exp: tp.exp })];
      if (tp.levels > 0) parts.push(t("packTrainerLevelUp", { levels: tp.levels, candy: tp.candy }));
      var dropCandy = ctx.currentPack.trainerCandyGained || 0;
      if (dropCandy > 0) parts.push(t("packTrainerDropCandy", { candy: dropCandy }));
      $("pack-trainer").textContent = parts.join("　·　");
    } else {
      $("pack-trainer").textContent = "";
    }
  }
  // 入册按钮的文案跟着翻牌状态走：没翻过是“关闭”，翻过至少一张变“入册 & 关闭”
  function updateCloseBtn() {
    $("close-pack-btn").textContent = ctx.packFlipped > 0 ? t("collectBtn") : t("closeBtn");
  }
  $("flip-all-btn").addEventListener("click", function () {
    document.querySelectorAll(".pack-card").forEach(function (el) {
      if (el.classList.contains("flipped")) return;
      el.classList.add("flipped");
      shakeIfSpecial(el, el.dataset.tier);
    });
    ctx.packFlipped = ctx.currentPack.length; // 全部翻开后 10 张都算翻过
    updateCloseBtn();
    var best = ctx.currentPack.slice().sort(function (a, b) {
      var order = { MR: 0, UR: 1, SSR: 2, SR: 3, R: 4, N: 5 };
      return order[a.tier] - order[b.tier];
    })[0];
    var news = ctx.currentPack.filter(function (c) { return c.isNew; }).length;
    $("pack-summary").textContent = t("packBest", { name: cardName(best), tier: best.tier, n: news });
  });
  $("close-pack-btn").addEventListener("click", function () {
    // 翻过至少一张才真正入册：扣包数、记入卡册、结算经验/糖果/保底计数；
    // 一张都没翻就直接关，这包不算开过（包数、卡册、经验、保底全都不动）。
    if (ctx.currentPack && ctx.packFlipped > 0) {
      var r = Gacha.settlePack(ctx.state, ctx.currentPack);
      PokeMem.save();
      renderHeader();
      if (r.levels > 0) PokeMem.showToast(t("toastLevelUp", { level: ctx.state.trainer.level }));
    }
    ctx.currentPack = null;
    ctx.packFlipped = 0;
    $("pack-overlay").classList.remove("show");
    PokeMem.renderCollection();
  });

  // 轻提示：底部弹出一条消息，3 秒后消失（Task 15 的升级按钮也能复用）
  var toastTimer = null;
  function showToast(text) {
    var el = $("toast");
    el.textContent = text;
    el.classList.add("show");
    if (toastTimer && typeof clearTimeout === "function") clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3000);
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.tick = tick;
  PokeMem.renderHeader = renderHeader;
  PokeMem.renderPack = renderPack;
  PokeMem.showToast = showToast;
})();
