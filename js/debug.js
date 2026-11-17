// PokeMem — Debug 面板：加包、加结晶、加糖果、下一包立即到账、清空存档
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }

  $("debug-toggle").addEventListener("change", function (e) {
    ctx.state.debug = e.target.checked;
    ctx.state.lastGrantAt = Date.now(); // 切换模式时重计 1 小时：Debug 期间不累计正式版卡包
    PokeMem.save();
    PokeMem.renderHeader();
  });
  $("add-packs-btn").addEventListener("click", function () {
    var n = parseInt($("add-packs-input").value, 10);
    if (!n || n <= 0) { alert(t("alertAddPacks")); return; }
    ctx.state.packs += n;
    PokeMem.save(); PokeMem.renderHeader();
  });
  document.querySelectorAll("[data-add-packs]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ctx.state.packs += parseInt(btn.getAttribute("data-add-packs"), 10);
      PokeMem.save(); PokeMem.renderHeader();
    });
  });
  // 结晶：直接加到训练师身上，顶栏结晶数与兑换按钮状态随之刷新
  document.querySelectorAll("[data-add-crystals]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      Gacha.ensureTrainer(ctx.state).crystals += parseInt(btn.getAttribute("data-add-crystals"), 10);
      PokeMem.save(); PokeMem.renderHeader();
    });
  });
  // 糖果：直接加到训练师身上，训练师页的糖果数随之刷新
  document.querySelectorAll("[data-add-candy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      Gacha.ensureTrainer(ctx.state).candy += parseInt(btn.getAttribute("data-add-candy"), 10);
      PokeMem.save(); PokeMem.renderTrainer();
    });
  });
  $("next-pack-now-btn").addEventListener("click", function () {
    ctx.state.lastGrantAt = Date.now() - Gacha.PACK_INTERVAL_MS;
    var due = Gacha.grantDuePacks(ctx.state, Date.now());
    PokeMem.save(); PokeMem.renderHeader();
    alert(due > 0 ? t("alertPackArrived") : t("alertNotYet"));
  });
  $("reset-save-btn").addEventListener("click", function () {
    if (!confirm(t("confirmReset"))) return;
    var keepLang = ctx.state.lang;
    localStorage.removeItem(PokeMem.SAVE_KEY);
    ctx.state = Gacha.newState(Date.now());
    ctx.state.lang = keepLang; // 清空存档不重置语言
    ctx.state.debug = true; // 清空后仍留在 Debug 模式，方便继续测试
    PokeMem.save(); PokeMem.renderHeader(); PokeMem.renderCollection();
    PokeMem.showRegister(); // 全新存档未注册：重新弹出注册浮层
  });
})();
