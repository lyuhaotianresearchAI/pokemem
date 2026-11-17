// PokeMem — 启动：最后加载。旧存档迁移、首次渲染、计时器。（出错红条在 js/store.js）
(function () {
  "use strict";
  var ctx = PokeMem.ctx;

  Gacha.ensureTrainer(ctx.state); // 训练师资料：老存档补一个未注册的训练师，结晶 0，注册时再发 100
  Gacha.migrateCollection(ctx.state); // v1.5 前的旧存档只有汇总，补一条明细卡后保存
  Gacha.repairLegacyCards(ctx.state, Math.random); // v1.7：旧卡按公式补生成数值（原始数值已无法找回），只跑一次
  CardProgress.repairCardProgress(ctx.state); // Task 24：老卡补 exp/affection（默认 0），只补缺失/坏值
  Gacha.enforceCap(ctx.state); // v1.8：每只最多保留 5 张卡，超过的按 Lv 从低到高去掉
  PokeMem.save();
  PokeMem.applyLang();
  PokeMem.tick();
  setInterval(PokeMem.tick, 1000);
  if (!ctx.state.trainer.registered) PokeMem.showRegister(); // 未注册：先注册才能进主页面
})();
