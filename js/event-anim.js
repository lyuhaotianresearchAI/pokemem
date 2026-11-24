// PokeMem 遭遇战·事件屏视觉（Task 30B）
// 纯 DOM class/文本开关，事件逻辑不动：按事件 kind 给事件屏上视觉、
// 流星翻倍时在结算屏划一道流星、事件战斗时在战斗屏挂事件名 chip。
// 调用点在 js/encounter-ui.js（renderEvent / renderBattle / renderSettle 末尾），
// 全部有守卫（PokeMem.EventAnim 缺失时跳过），缺失元素静默跳过。
// 约束（和 battle-anim.js 一样）：只叠在已渲染的 DOM 上，绝不改状态、不拖逻辑；
// prefers-reduced-motion 时 CSS 里关掉这些动画。
(function () {
  var root = typeof window !== "undefined" ? window : globalThis;
  var PokeMem = root.PokeMem || (root.PokeMem = {});
  // 事件的 5 种 kind（js/encounter-events.js 的事件表）：视觉按 kind 做，不按 43 个事件逐个画
  var KINDS = ["battle", "heal", "buff", "debuff", "reward"];
  function clsFor(kind) { return "event-kind-" + kind; }
  // 事件屏上 kind 视觉：先清掉上一个 kind 的 class（未知 kind / 无 kind 时全清掉，回到白卡片）
  function applyKind(screenEl, kind) {
    if (!screenEl || !screenEl.classList) return;
    KINDS.forEach(function (k) { screenEl.classList.remove(clsFor(k)); });
    if (KINDS.indexOf(kind) >= 0) screenEl.classList.add(clsFor(kind));
  }
  function restart(elm, cls) {
    if (!elm || !elm.classList) return;
    elm.classList.remove(cls);
    void elm.offsetWidth; // 重启动画（和 battle-anim.js 同一套路）
    elm.classList.add(cls);
  }
  // 流星：结算翻倍（chestMult > 1）时在结算屏划一道星；doubled 为假时藏起
  function showMeteor(meteorEl, doubled) {
    if (!meteorEl || !meteorEl.classList) return;
    if (!doubled) { meteorEl.style.display = "none"; return; }
    meteorEl.style.display = "";
    restart(meteorEl, "anim-meteor");
  }
  // 事件战斗 chip：name 为空时藏起（普通战斗不挂 chip）
  function setBattleChip(chipEl, name) {
    if (!chipEl) return;
    if (!name) { chipEl.style.display = "none"; chipEl.textContent = ""; return; }
    chipEl.textContent = name;
    chipEl.style.display = "";
  }
  PokeMem.EventAnim = { KINDS: KINDS, applyKind: applyKind, showMeteor: showMeteor, setBattleChip: setBattleChip };
})();
