// PokeMem — 训练师页：头像、名字、等级、经验条、结晶/糖果/卡包、图鉴、道具、改名
(function () {
  "use strict";
  var $ = PokeMem.$;
  var ctx = PokeMem.ctx;
  function t(key, vars) { return PokeMem.t(key, vars); }

  // 道具图：PokeAPI 精灵图，和宝可梦官方图共用 SPRITE_BASE（pokedex.js，Task 19）
  function itemImg(id) { return SPRITE_BASE + "items/" + id.replace(/_/g, "-") + ".png"; }

  // 头像数据在 avatars.js（Task 20）；id 非法时回默认赤红
  function avatarById(id) {
    for (var i = 0; i < AVATARS.length; i++) if (AVATARS[i].id === id) return AVATARS[i];
    return AVATARS[0];
  }
  function avatarName(a) { return PokeMem.lang() === "en" ? a.en : a.zh; }

  function renderTrainer() {
    var tr = Gacha.ensureTrainer(ctx.state);
    var av = avatarById(tr.avatar);
    var avImg = $("trainer-avatar");
    avImg.src = av.img;
    avImg.alt = avatarName(av);
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
  // 头像选择器（Task 20）：点一个立即换上并保存，留在选择器里可继续试别的，关掉即生效
  // 按钮用 createElement 造（不用 innerHTML 字符串），和开包结果卡片一个做法，测试桩也能点
  function renderAvatarGrid() {
    var tr = Gacha.ensureTrainer(ctx.state);
    var grid = $("avatar-grid");
    grid.innerHTML = "";
    AVATARS.forEach(function (a) {
      var b = document.createElement("button");
      b.classList.add("avatar-option");
      if (a.id === tr.avatar) b.classList.add("selected");
      b.setAttribute("data-avatar", a.id);
      b.setAttribute("aria-label", avatarName(a));
      var img = document.createElement("img");
      img.src = a.img;
      img.alt = "";
      img.onerror = function () { this.style.display = "none"; };
      img.setAttribute("loading", "lazy");
      b.appendChild(img);
      var nm = document.createElement("span");
      nm.textContent = avatarName(a);
      b.appendChild(nm);
      b.addEventListener("click", function () { pickAvatar(a.id); });
      grid.appendChild(b);
    });
  }
  function pickAvatar(id) {
    if (!Gacha.setAvatar(ctx.state, id)) return;
    PokeMem.save();
    renderTrainer();
    renderAvatarGrid();
  }
  function openAvatarPicker() {
    renderAvatarGrid();
    $("avatar-overlay").classList.add("show");
  }
  function closeAvatarPicker() { $("avatar-overlay").classList.remove("show"); }
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

  $("trainer-avatar-btn").addEventListener("click", openAvatarPicker);
  $("avatar-close").addEventListener("click", closeAvatarPicker);
  $("avatar-overlay").addEventListener("click", function (e) { if (e.target === this) closeAvatarPicker(); });
  $("trainer-rename-btn").addEventListener("click", renameTrainer);
  $("trainer-rename-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") renameTrainer();
  });
})();
