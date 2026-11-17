// PokeMem — 训练师页：名字、等级、经验条、结晶/糖果/卡包、图鉴、道具、改名
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }

  // 道具图：PokeAPI 精灵图，和宝可梦官方图共用 SPRITE_BASE（pokedex.js，Task 19）
  function itemImg(id) { return SPRITE_BASE + "items/" + id.replace(/_/g, "-") + ".png"; }

  function renderTrainer() {
    var tr = Gacha.ensureTrainer(ctx.state);
    $("trainer-name").textContent = tr.name || t("trainerNoName");
    $("trainer-level").textContent = t("trainerLevel", { level: tr.level });
    var maxed = tr.level >= Gacha.TRAINER_MAX_LEVEL;
    $("trainer-exp-fill").style.width = (maxed ? 100 : tr.exp) + "%";
    $("trainer-exp-text").textContent = maxed ? t("trainerExpMax") : t("trainerExp", { exp: tr.exp });
    $("trainer-crystals").textContent = tr.crystals;
    $("trainer-candy").textContent = tr.candy;
    $("trainer-packs").textContent = ctx.state.packs;
    $("trainer-dex").textContent = Gacha.ownedCount(ctx.state) + " / 151";
    $("trainer-draws").textContent = ctx.state.totalDraws;
    var lang = PokeMem.lang();
    $("trainer-items").innerHTML = Gacha.ITEM_IDS.map(function (id) {
      var n = tr.items[id] || 0;
      var nm = (ITEM_NAME[id] && ITEM_NAME[id][lang]) || id;
      return '<div class="trainer-item' + (n <= 0 ? " zero" : "") + '"><img src="' + itemImg(id) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"><span class="trainer-item-name">' + nm + "</span><span>×" + n + "</span></div>";
    }).join("");
  }
  // 改名复用注册逻辑（Task 11/12）：1–12 字，已注册时只改名字、不重复发结晶
  function renameTrainer() {
    var res = Gacha.registerTrainer(ctx.state, $("trainer-rename-input").value);
    if (!res.ok) {
      $("trainer-rename-error").textContent = PokeMem.t(res.error === "tooLong" ? "registerErrTooLong" : "registerErrEmpty");
      return;
    }
    $("trainer-rename-error").textContent = "";
    $("trainer-rename-input").value = "";
    PokeMem.save();
    renderTrainer();
  }

  window.PokeMem = window.PokeMem || {};
  PokeMem.renderTrainer = renderTrainer;

  $("trainer-rename-btn").addEventListener("click", renameTrainer);
  $("trainer-rename-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") renameTrainer();
  });
})();
