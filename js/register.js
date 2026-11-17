// PokeMem — 注册：训练师注册浮层（进主页面之前必须注册，不能跳过）
// 名字 1–12 个字；注册成功发 100 梦想结晶（只发一次），显示欢迎后进主页面。
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;

  function showRegister() {
    $("register-form").style.display = "";
    $("register-welcome").style.display = "none";
    $("register-error").textContent = "";
    $("register-overlay").classList.add("show");
    var input = $("register-name-input");
    if (input && input.focus) input.focus();
  }
  function submitRegister() {
    var res = Gacha.registerTrainer(ctx.state, $("register-name-input").value);
    if (!res.ok) {
      $("register-error").textContent = PokeMem.t(res.error === "tooLong" ? "registerErrTooLong" : "registerErrEmpty");
      return;
    }
    PokeMem.save();
    $("register-welcome-text").textContent = PokeMem.t("registerWelcome", { name: res.name });
    $("register-form").style.display = "none";
    $("register-welcome").style.display = "";
  }
  function closeRegister() {
    $("register-overlay").classList.remove("show");
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.showRegister = showRegister;
  PokeMem.submitRegister = submitRegister;
  PokeMem.closeRegister = closeRegister;

  $("register-submit-btn").addEventListener("click", submitRegister);
  $("register-start-btn").addEventListener("click", closeRegister);
  $("register-name-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") submitRegister();
  });
})();
