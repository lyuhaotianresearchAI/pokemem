// PokeMem — 语言层：中英切换、翻译、名字/稀有度/属性的本地化
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;

  function lang() { return ctx.state.lang === "en" ? "en" : "zh"; }
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
    PokeMem.renderHeader();
    PokeMem.renderCollection();
    PokeMem.renderRates();
    PokeMem.renderTrainer();
    if (ctx.currentPack) PokeMem.renderPack();
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.lang = lang;
  PokeMem.t = t;
  PokeMem.dexName = dexName;
  PokeMem.cardName = cardName;
  PokeMem.tierLabel = tierLabel;
  PokeMem.typeLabel = typeLabel;
  PokeMem.applyLang = applyLang;

  $("lang-zh").addEventListener("click", function () { ctx.state.lang = "zh"; PokeMem.save(); applyLang(); });
  $("lang-en").addEventListener("click", function () { ctx.state.lang = "en"; PokeMem.save(); applyLang(); });
})();
