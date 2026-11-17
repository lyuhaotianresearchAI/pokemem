// PokeMem — 存档层：localStorage 读写 + 共享可变状态
// 各模块通过 PokeMem.ctx 共享同一份状态对象；reset 时只替换 ctx.state，引用不失效。
// 加载顺序：pokedex.js → i18n.js → gacha.js → 本文件 → 其余 js/*.js → js/boot.js
(function () {
  "use strict";
  var SAVE_KEY = "pokemem-save-v1";

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

  window.PokeMem = window.PokeMem || {};
  PokeMem.SAVE_KEY = SAVE_KEY;
  PokeMem.ctx = {
    state: load(),
    currentPack: null, // 刚开的那包卡（开包结果浮层用）
    packFlipped: 0, // 当前这包已翻开几张（0 张就关闭不算开过）
    filterTier: "ALL",
    filterOwned: "ALL",
    query: "",
    detailSort: { key: "level", dir: "desc" }, // 排序状态在不同宝可梦之间保留
    detailSelected: null // 详情页左边 tab 当前选中的那张卡（对象引用，换宝可梦时自动重置）
  };
  PokeMem.save = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(PokeMem.ctx.state)); } catch (e) {}
  };

  // 出错时在页面顶部显示红条，别再静默没反应。
  // 注册得早：store.js 是第一个加载的 UI 模块，之后任何模块加载失败都能显示
  // （旧 app.js 里它也排在所有接线之前）。此时 lang.js 可能还没加载，
  // PokeMem.t 未必存在，先用原文兜底。
  window.addEventListener("error", function (e) {
    var bar = document.getElementById("error-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "error-bar";
      bar.style.cssText = "background:#c00;color:#fff;padding:10px 14px;font-size:13px;position:sticky;top:0;z-index:99";
      document.body.prepend(bar);
    }
    var msg = (e && e.message) || "unknown error";
    bar.textContent = PokeMem.t
      ? PokeMem.t("errorPrefix", { msg: msg })
      : "Error: " + msg;
  });
})();
