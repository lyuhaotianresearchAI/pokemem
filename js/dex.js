// PokeMem — 卡册页：筛选/搜索、图鉴格子、卡片详情（全部卡 + Lv/HP/攻击排序）
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }
  function dexName(row) { return PokeMem.dexName(row); }
  function tierLabel(tier) { return PokeMem.tierLabel(tier); }
  function typeLabel(types) { return PokeMem.typeLabel(types); }

  function renderCollection() {
    var grid = $("collection-grid");
    grid.innerHTML = "";
    var q = ctx.query.trim();
    POKEDEX.forEach(function (r) {
      var id = r[0], owned = ctx.state.collection[id];
      if (ctx.filterTier !== "ALL" && r[4] !== ctx.filterTier) return;
      if (ctx.filterOwned === "OWNED" && !owned) return;
      if (ctx.filterOwned === "MISSING" && owned) return;
      if (q && (r[1].indexOf(q) < 0 && r[2].toLowerCase().indexOf(q.toLowerCase()) < 0 && String(id) !== q)) return;
      var cell = document.createElement("div");
      cell.className = "dex-cell " + PokeMem.tierClass(r[4]) + (owned ? "" : " missing");
      cell.innerHTML =
        '<img src="' + imgUrl(id) + '" alt="' + dexName(r) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="dex-no">#' + String(id).padStart(3, "0") + "</div>" +
        '<div class="dex-name">' + (owned ? dexName(r) : t("missingName")) + "</div>" +
        '<div class="dex-tier">' + PokeMem.mark(r[4]) + " " + r[4] + "</div>" +
        (owned ? '<div class="dex-count">×' + owned.count + "</div>" : "");
      cell.addEventListener("click", function () { showDetail(r); });
      grid.appendChild(cell);
    });
    var shown = grid.children.length;
    $("collection-summary").textContent = t("collectionSummary", { owned: Gacha.ownedCount(ctx.state), shown: shown });
  }
  // ---------- 详情：列出该宝可梦的全部卡，可按 Lv / HP / 攻击排序 ----------
  function showDetail(r) {
    var owned = ctx.state.collection[r[0]];
    var primary = dexName(r), secondary = PokeMem.lang() === "en" ? r[1] : r[2];
    $("detail-img").src = imgUrl(r[0]);
    $("detail-img").style.display = "";
    $("detail-name").textContent = "#" + String(r[0]).padStart(3, "0") + " " + primary + "（" + secondary + "）";
    $("detail-meta").innerHTML = typeLabel(r[3]) + "　·　" + PokeMem.mark(r[4]) + " " + r[4] + " " + tierLabel(r[4]) + "　·　" + t("perCardRate") + " " + r[5] + "%";
    $("detail-owned").textContent = owned
      ? t("detailOwned", { n: owned.count, lv: owned.bestLv, hp: owned.bestHp, atk: owned.bestAtk })
      : t("detailMissing");
    renderDetailCards(r, owned);
    $("detail-modal").classList.add("show");
  }
  function renderDetailCards(r, owned) {
    var box = $("detail-cards");
    if (!owned || !owned.cards || !owned.cards.length) { box.innerHTML = ""; ctx.detailSelected = null; return; }
    // 先按 Lv 取最高的 5 张，再按当前排序键排 tab 顺序
    var top = owned.cards.slice().sort(function (a, b) { return b.level - a.level; }).slice(0, 5);
    var key = ctx.detailSort.key, dir = ctx.detailSort.dir;
    top.sort(function (a, b) { return dir === "desc" ? b[key] - a[key] : a[key] - b[key]; });
    if (!ctx.detailSelected || top.indexOf(ctx.detailSelected) < 0) ctx.detailSelected = top[0];
    var html = '<p class="detail-cards-title">' + t("cardsTitle", { n: owned.count }) + "</p>" +
      '<div class="sort-row"><span>' + t("sortLabel") + "：</span>" +
      sortBtn("level", "Lv") + sortBtn("hp", "HP") + sortBtn("atk", t("atkLabel")) + "</div>" +
      '<div class="detail-body"><div class="card-tabs">' +
      top.map(function (c, i) {
        return '<button class="card-tab' + (c === ctx.detailSelected ? " active" : "") + '" data-i="' + i + '">' +
          "Lv." + c.level + "　HP " + c.hp + " · " + t("atkLabel") + " " + c.atk + "</button>";
      }).join("") + "</div>" +
      '<div class="card-detail">' +
      '<div class="cd-stat"><span>Lv</span><b>' + ctx.detailSelected.level + "</b></div>" +
      '<div class="cd-stat"><span>HP</span><b>' + ctx.detailSelected.hp + "</b></div>" +
      '<div class="cd-stat"><span>' + t("atkLabel") + "</span><b>" + ctx.detailSelected.atk + "</b></div>" +
      "</div></div>";
    html += '<p class="rule">' + t("capNote") + "</p>";
    var repairedN = owned.cards.filter(function (c) { return c.repaired; }).length;
    if (repairedN > 0) html += '<p class="rule">' + t("repairedNote", { n: repairedN }) + "</p>";
    if (owned.legacy > 0) html += '<p class="rule">' + t("legacyNote", { n: owned.legacy }) + "</p>";
    box.innerHTML = html;
    box.querySelectorAll(".card-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ctx.detailSelected = top[parseInt(btn.getAttribute("data-i"), 10)];
        renderDetailCards(r, owned);
      });
    });
    box.querySelectorAll("[data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-sort");
        if (ctx.detailSort.key === k) ctx.detailSort.dir = ctx.detailSort.dir === "desc" ? "asc" : "desc";
        else { ctx.detailSort.key = k; ctx.detailSort.dir = "desc"; }
        renderDetailCards(r, owned);
      });
    });
  }
  function sortBtn(key, label) {
    var arrow = ctx.detailSort.key === key ? (ctx.detailSort.dir === "desc" ? " ▼" : " ▲") : "";
    return '<button data-sort="' + key + '"' + (ctx.detailSort.key === key ? ' class="active"' : "") + ">" + label + arrow + "</button>";
  }
  $("detail-close").addEventListener("click", function () { $("detail-modal").classList.remove("show"); });
  $("detail-modal").addEventListener("click", function (e) { if (e.target === this) this.classList.remove("show"); });

  document.querySelectorAll("[data-tier-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ctx.filterTier = btn.getAttribute("data-tier-filter");
      document.querySelectorAll("[data-tier-filter]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      renderCollection();
    });
  });
  document.querySelectorAll("[data-owned-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ctx.filterOwned = btn.getAttribute("data-owned-filter");
      document.querySelectorAll("[data-owned-filter]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      renderCollection();
    });
  });
  $("search-input").addEventListener("input", function (e) { ctx.query = e.target.value; renderCollection(); });

  window.PokeMem = window.PokeMem || {};
  PokeMem.renderCollection = renderCollection;
  PokeMem.showDetail = showDetail;
})();
