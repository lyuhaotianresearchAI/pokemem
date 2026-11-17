// PokeMem — 概率页：各稀有度档位合计与单只概率
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }
  function tierLabel(tier) { return PokeMem.tierLabel(tier); }

  function renderRates() {
    var tObj = Gacha.tierTotals();
    var html = "";
    ["MR", "UR", "SSR", "SR", "R", "N"].forEach(function (tier) {
      var perCard = (tObj.totals[tier] / tObj.counts[tier]).toFixed(3).replace(/0$/, "");
      html += "<tr><td>" + PokeMem.mark(tier) + " <span class='pill " + PokeMem.tierClass(tier) + "'>" + tier + "</span> " + tierLabel(tier) +
        "</td><td>" + tObj.counts[tier] + "</td><td>" + tObj.totals[tier].toFixed(2) + "%</td><td>" + perCard + "%</td></tr>";
    });
    $("rates-body").innerHTML = html;
    $("rates-note").textContent = t("ratesNote", { sum: tObj.sum.toFixed(2) });
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.renderRates = renderRates;
})();
