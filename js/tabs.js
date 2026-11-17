// PokeMem — 页签切换：底部 tabbar 在四个页面之间切换（单页应用，不刷新）
(function () {
  "use strict";
  document.querySelectorAll("[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
      document.querySelectorAll(".tab-page").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + tab); });
      if (tab === "dex") PokeMem.renderCollection();
      if (tab === "rates") PokeMem.renderRates();
      if (tab === "trainer") PokeMem.renderTrainer();
      if (tab === "encounter") PokeMem.renderEncounter();
    });
  });
})();
