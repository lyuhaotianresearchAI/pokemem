// PokeMem 网页端 v1.7 — UI 层（localStorage 存档，单机版，中英切换）
(function () {
  "use strict";
  var SAVE_KEY = "pokemem-save-v1";
  var state = load();

  // ---------- 语言 ----------
  function lang() { return state.lang === "en" ? "en" : "zh"; }
  function t(key, vars) { return i18nT(lang(), key, vars); }
  function dexName(row) { return lang() === "en" ? row[2] : row[1]; } // 图鉴行 [编号, 中文, 英文, ...]
  function cardName(c) { return lang() === "en" ? c.en : c.name; } // 抽到的卡 {name: 中文, en: 英文}
  function tierLabel(tier) { return lang() === "en" ? TIER_EN[tier] : Gacha.TIER_LABEL[tier]; }
  function typeLabel(types) {
    if (lang() !== "en") return types;
    return types.split("、").map(function (x) { return TYPE_EN[x] || x; }).join(", ");
  }
  function applyLang() {
    document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
    document.title = t("docTitle");
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    document.getElementById("lang-zh").classList.toggle("active", lang() === "zh");
    document.getElementById("lang-en").classList.toggle("active", lang() === "en");
    renderHeader();
    renderCollection();
    renderRates();
    if (currentPack) renderPack();
  }

  // 出错时在页面顶部显示红条，别再静默没反应
  window.addEventListener("error", function (e) {
    var bar = document.getElementById("error-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "error-bar";
      bar.style.cssText = "background:#c00;color:#fff;padding:10px 14px;font-size:13px;position:sticky;top:0;z-index:99";
      document.body.prepend(bar);
    }
    bar.textContent = t("errorPrefix", { msg: e.message || "unknown error" });
  });

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s.packs === "number" && s.collection) {
          if (!s.lang) s.lang = "zh";
          Gacha.ensureTrainer(s); // 老存档补训练师资料（未注册、结晶 0），已有字段原样保留
          return s;
        }
      }
    } catch (e) { /* 存档损坏则重开 */ }
    var fresh = Gacha.newState(Date.now());
    fresh.lang = "zh";
    return fresh;
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var h = String(Math.floor(s / 3600)).padStart(2, "0");
    var m = String(Math.floor(s % 3600 / 60)).padStart(2, "0");
    var ss = String(s % 60).padStart(2, "0");
    return h + ":" + m + ":" + ss;
  }
  function tierClass(tier) { return "tier-" + tier; }
  function mark(tier) { return rarityMarkHtml(tier); }
  // SSR / MR 翻过来时像炉石开卡那样震一下：先去掉再加，同一张牌点两次也能重播
  function shakeIfSpecial(el, tier) {
    if (tier !== "SSR" && tier !== "MR") return;
    el.classList.remove("special-shake");
    void el.offsetWidth;
    el.classList.add("special-shake");
  }

  // ---------- 计时 ----------
  function tick() {
    if (!state.debug) {
      var due = Gacha.grantDuePacks(state, Date.now());
      if (due > 0) save();
    }
    renderHeader();
  }

  // ---------- 顶栏 / 首页 ----------
  function renderHeader() {
    $("pack-count").textContent = state.packs;
    $("owned-count").textContent = Gacha.ownedCount(state) + " / 151";
    $("total-draws").textContent = state.totalDraws;
    $("since-ssr").textContent = state.sinceSSR >= 49 ? t("pityNext") : t("pityIn", { n: 50 - state.sinceSSR });
    var openBtn = $("open-pack-btn");
    openBtn.disabled = state.packs <= 0;
    openBtn.textContent = state.packs > 0 ? t("openPack") : t("noPack");
    $("next-pack").textContent = state.debug
      ? t("nextPackDebug")
      : t("nextPack", { time: fmtTime(Gacha.msToNextPack(state, Date.now())) });
    $("debug-badge").style.display = state.debug ? "inline-block" : "none";
    $("debug-panel").style.display = state.debug ? "block" : "none";
    $("debug-toggle").checked = state.debug;
  }

  // ---------- 语言切换 ----------
  $("lang-zh").addEventListener("click", function () { state.lang = "zh"; save(); applyLang(); });
  $("lang-en").addEventListener("click", function () { state.lang = "en"; save(); applyLang(); });

  // ---------- 开包 ----------
  var currentPack = null;
  $("open-pack-btn").addEventListener("click", function () {
    if (state.packs <= 0) return;
    currentPack = Gacha.drawPack(state, Math.random);
    save();
    renderHeader();
    renderPack();
    $("pack-overlay").classList.add("show");
  });
  function renderPack() {
    var wrap = $("pack-cards");
    wrap.innerHTML = "";
    currentPack.forEach(function (c) {
      var d = document.createElement("div");
      d.className = "pack-card " + tierClass(c.tier);
      d.dataset.tier = c.tier;
      d.innerHTML =
        '<div class="card-inner">' +
        '<div class="card-front"><div class="card-back">?</div></div>' +
        '<div class="card-face">' +
        '<img src="' + imgUrl(c.id) + '" alt="' + cardName(c) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="card-no">#' + String(c.id).padStart(3, "0") + '</div>' +
        '<div class="card-name">' + cardName(c) + '</div>' +
        '<div class="card-tier">' + mark(c.tier) + " " + c.tier + " · " + tierLabel(c.tier) + "</div>" +
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
    var best = currentPack.slice().sort(function (a, b) {
      var order = { MR: 0, UR: 1, SSR: 2, SR: 3, R: 4, N: 5 };
      return order[a.tier] - order[b.tier];
    })[0];
    var news = currentPack.filter(function (c) { return c.isNew; }).length;
    $("pack-summary").textContent = t("packBest", { name: cardName(best), tier: best.tier, n: news });
  });
  $("close-pack-btn").addEventListener("click", function () {
    $("pack-overlay").classList.remove("show");
    renderCollection();
  });

  // ---------- 卡册 ----------
  var filterTier = "ALL", filterOwned = "ALL", query = "";
  function renderCollection() {
    var grid = $("collection-grid");
    grid.innerHTML = "";
    var q = query.trim();
    POKEDEX.forEach(function (r) {
      var id = r[0], owned = state.collection[id];
      if (filterTier !== "ALL" && r[4] !== filterTier) return;
      if (filterOwned === "OWNED" && !owned) return;
      if (filterOwned === "MISSING" && owned) return;
      if (q && (r[1].indexOf(q) < 0 && r[2].toLowerCase().indexOf(q.toLowerCase()) < 0 && String(id) !== q)) return;
      var cell = document.createElement("div");
      cell.className = "dex-cell " + tierClass(r[4]) + (owned ? "" : " missing");
      cell.innerHTML =
        '<img src="' + imgUrl(id) + '" alt="' + dexName(r) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="dex-no">#' + String(id).padStart(3, "0") + "</div>" +
        '<div class="dex-name">' + (owned ? dexName(r) : t("missingName")) + "</div>" +
        '<div class="dex-tier">' + mark(r[4]) + " " + r[4] + "</div>" +
        (owned ? '<div class="dex-count">×' + owned.count + "</div>" : "");
      cell.addEventListener("click", function () { showDetail(r); });
      grid.appendChild(cell);
    });
    var shown = grid.children.length;
    $("collection-summary").textContent = t("collectionSummary", { owned: Gacha.ownedCount(state), shown: shown });
  }
  // ---------- 详情：列出该宝可梦的全部卡，可按 Lv / HP / 攻击排序 ----------
  var detailSort = { key: "level", dir: "desc" }; // 排序状态在不同宝可梦之间保留
  function showDetail(r) {
    var owned = state.collection[r[0]];
    var primary = dexName(r), secondary = lang() === "en" ? r[1] : r[2];
    $("detail-img").src = imgUrl(r[0]);
    $("detail-img").style.display = "";
    $("detail-name").textContent = "#" + String(r[0]).padStart(3, "0") + " " + primary + "（" + secondary + "）";
    $("detail-meta").innerHTML = typeLabel(r[3]) + "　·　" + mark(r[4]) + " " + r[4] + " " + tierLabel(r[4]) + "　·　" + t("perCardRate") + " " + r[5] + "%";
    $("detail-owned").textContent = owned
      ? t("detailOwned", { n: owned.count, lv: owned.bestLv, hp: owned.bestHp, atk: owned.bestAtk })
      : t("detailMissing");
    renderDetailCards(r, owned);
    $("detail-modal").classList.add("show");
  }
  var detailSelected = null; // 左边 tab 当前选中的那张卡（对象引用，换宝可梦时自动重置）
  function renderDetailCards(r, owned) {
    var box = $("detail-cards");
    if (!owned || !owned.cards || !owned.cards.length) { box.innerHTML = ""; detailSelected = null; return; }
    // 先按 Lv 取最高的 5 张，再按当前排序键排 tab 顺序
    var top = owned.cards.slice().sort(function (a, b) { return b.level - a.level; }).slice(0, 5);
    var key = detailSort.key, dir = detailSort.dir;
    top.sort(function (a, b) { return dir === "desc" ? b[key] - a[key] : a[key] - b[key]; });
    if (!detailSelected || top.indexOf(detailSelected) < 0) detailSelected = top[0];
    var html = '<p class="detail-cards-title">' + t("cardsTitle", { n: owned.count }) + "</p>" +
      '<div class="sort-row"><span>' + t("sortLabel") + "：</span>" +
      sortBtn("level", "Lv") + sortBtn("hp", "HP") + sortBtn("atk", t("atkLabel")) + "</div>" +
      '<div class="detail-body"><div class="card-tabs">' +
      top.map(function (c, i) {
        return '<button class="card-tab' + (c === detailSelected ? " active" : "") + '" data-i="' + i + '">' +
          "Lv." + c.level + "　HP " + c.hp + " · " + t("atkLabel") + " " + c.atk + "</button>";
      }).join("") + "</div>" +
      '<div class="card-detail">' +
      '<div class="cd-stat"><span>Lv</span><b>' + detailSelected.level + "</b></div>" +
      '<div class="cd-stat"><span>HP</span><b>' + detailSelected.hp + "</b></div>" +
      '<div class="cd-stat"><span>' + t("atkLabel") + "</span><b>" + detailSelected.atk + "</b></div>" +
      "</div></div>";
    html += '<p class="rule">' + t("capNote") + "</p>";
    var repairedN = owned.cards.filter(function (c) { return c.repaired; }).length;
    if (repairedN > 0) html += '<p class="rule">' + t("repairedNote", { n: repairedN }) + "</p>";
    if (owned.legacy > 0) html += '<p class="rule">' + t("legacyNote", { n: owned.legacy }) + "</p>";
    box.innerHTML = html;
    box.querySelectorAll(".card-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        detailSelected = top[parseInt(btn.getAttribute("data-i"), 10)];
        renderDetailCards(r, owned);
      });
    });
    box.querySelectorAll("[data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-sort");
        if (detailSort.key === k) detailSort.dir = detailSort.dir === "desc" ? "asc" : "desc";
        else { detailSort.key = k; detailSort.dir = "desc"; }
        renderDetailCards(r, owned);
      });
    });
  }
  function sortBtn(key, label) {
    var arrow = detailSort.key === key ? (detailSort.dir === "desc" ? " ▼" : " ▲") : "";
    return '<button data-sort="' + key + '"' + (detailSort.key === key ? ' class="active"' : "") + ">" + label + arrow + "</button>";
  }
  $("detail-close").addEventListener("click", function () { $("detail-modal").classList.remove("show"); });
  $("detail-modal").addEventListener("click", function (e) { if (e.target === this) this.classList.remove("show"); });

  document.querySelectorAll("[data-tier-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterTier = btn.getAttribute("data-tier-filter");
      document.querySelectorAll("[data-tier-filter]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      renderCollection();
    });
  });
  document.querySelectorAll("[data-owned-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterOwned = btn.getAttribute("data-owned-filter");
      document.querySelectorAll("[data-owned-filter]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      renderCollection();
    });
  });
  $("search-input").addEventListener("input", function (e) { query = e.target.value; renderCollection(); });

  // ---------- 概率页 ----------
  function renderRates() {
    var tObj = Gacha.tierTotals();
    var html = "";
    ["MR", "UR", "SSR", "SR", "R", "N"].forEach(function (tier) {
      var perCard = (tObj.totals[tier] / tObj.counts[tier]).toFixed(3).replace(/0$/, "");
      html += "<tr><td>" + mark(tier) + " <span class='pill " + tierClass(tier) + "'>" + tier + "</span> " + tierLabel(tier) +
        "</td><td>" + tObj.counts[tier] + "</td><td>" + tObj.totals[tier].toFixed(2) + "%</td><td>" + perCard + "%</td></tr>";
    });
    $("rates-body").innerHTML = html;
    $("rates-note").textContent = t("ratesNote", { sum: tObj.sum.toFixed(2) });
  }

  // ---------- 页签 ----------
  document.querySelectorAll("[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".tab-page").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + tab); });
      if (tab === "dex") renderCollection();
      if (tab === "rates") renderRates();
    });
  });

  // ---------- Debug ----------
  $("debug-toggle").addEventListener("change", function (e) {
    state.debug = e.target.checked;
    state.lastGrantAt = Date.now(); // 切换模式时重计 1 小时：Debug 期间不累计正式版卡包
    save();
    renderHeader();
  });
  $("add-packs-btn").addEventListener("click", function () {
    var n = parseInt($("add-packs-input").value, 10);
    if (!n || n <= 0) { alert(t("alertAddPacks")); return; }
    state.packs += n;
    save(); renderHeader();
  });
  document.querySelectorAll("[data-add-packs]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.packs += parseInt(btn.getAttribute("data-add-packs"), 10);
      save(); renderHeader();
    });
  });
  $("next-pack-now-btn").addEventListener("click", function () {
    state.lastGrantAt = Date.now() - Gacha.PACK_INTERVAL_MS;
    var due = Gacha.grantDuePacks(state, Date.now());
    save(); renderHeader();
    alert(due > 0 ? t("alertPackArrived") : t("alertNotYet"));
  });
  $("reset-save-btn").addEventListener("click", function () {
    if (!confirm(t("confirmReset"))) return;
    var keepLang = state.lang;
    localStorage.removeItem(SAVE_KEY);
    state = Gacha.newState(Date.now());
    state.lang = keepLang; // 清空存档不重置语言
    state.debug = true; // 清空后仍留在 Debug 模式，方便继续测试
    save(); renderHeader(); renderCollection();
  });

  // ---------- 启动 ----------
  Gacha.ensureTrainer(state); // 训练师资料：老存档补一个未注册的训练师，结晶 0，注册时再发 100
  Gacha.migrateCollection(state); // v1.5 前的旧存档只有汇总，补一条明细卡后保存
  Gacha.repairLegacyCards(state, Math.random); // v1.7：旧卡按公式补生成数值（原始数值已无法找回），只跑一次
  Gacha.enforceCap(state); // v1.8：每只最多保留 5 张卡，超过的按 Lv 从低到高去掉
  save();
  applyLang();
  tick();
  setInterval(tick, 1000);
})();
