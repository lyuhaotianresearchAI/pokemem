// PokeMem — 通用小工具（DOM 取值、时间格式化、稀有度样式）
(function () {
  "use strict";
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

  window.PokeMem = window.PokeMem || {};
  PokeMem.$ = $;
  PokeMem.fmtTime = fmtTime;
  PokeMem.tierClass = tierClass;
  PokeMem.mark = mark;
})();
