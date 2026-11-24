// PokeMem 遭遇战·场景背景（Task 30C）
// 纯视觉层，战斗逻辑不动：按场景给战斗屏换背景（复用 PR #36 的轨道渐变 +
// 卡通地形图 SCENE_ICONS）、立绘放大后的待机浮动在 CSS 里、入场滑入按 log 触发。
// 调用点在 js/encounter-ui.js（renderBattle 末尾），有守卫（PokeMem.SceneBg 缺失时跳过），
// 缺失元素静默跳过。入场和 battle-anim.js 同一套路：按 log 长度 diff 新条目。
// 约束（和 battle-anim.js / event-anim.js 一样）：只叠在已渲染的 DOM 上，绝不改状态、
// 不拖逻辑；prefers-reduced-motion 时 CSS 里关掉这些动画。
(function () {
  var root = typeof window !== "undefined" ? window : globalThis;
  var PokeMem = root.PokeMem || (root.PokeMem = {});
  // 9 个场景（js/scenes.js 的 SCENES 表）
  var SCENE_IDS = ["grassland", "forest", "stream", "city", "desert", "cave", "ocean", "glacier", "champions-road"];
  function clsFor(id) { return "scene-bg-" + id; }
  function artFor(sceneId) {
    // 场景图：卡通地形图（SCENE_ICONS，全矢量 SVG）；文件没加载就回落到代表宝可梦立绘
    // （和轨道中心同款回落：img.src = SCENE_ICONS[sc.id] || imgUrl(sc.art)）
    var icons = root.SCENE_ICONS;
    if (icons && icons[sceneId]) return icons[sceneId];
    var Scenes = PokeMem.Scenes;
    if (Scenes && root.imgUrl) {
      var sc = Scenes.sceneById(sceneId);
      if (sc) return root.imgUrl(sc.art);
    }
    return null;
  }
  // 战斗屏上场景背景：清掉上一个场景的 class，挂当前场景的；未知场景时全清回默认底色
  function apply(screenEl, sceneId) {
    if (!screenEl || !screenEl.classList) return;
    SCENE_IDS.forEach(function (id) { screenEl.classList.remove(clsFor(id)); });
    if (SCENE_IDS.indexOf(sceneId) < 0) {
      if (screenEl.style && screenEl.style.removeProperty) screenEl.style.removeProperty("--scene-art");
      return;
    }
    screenEl.classList.add(clsFor(sceneId));
    var art = artFor(sceneId);
    if (art && screenEl.style && screenEl.style.setProperty) screenEl.style.setProperty("--scene-art", "url(\"" + art + "\")");
    else if (screenEl.style && screenEl.style.removeProperty) screenEl.style.removeProperty("--scene-art");
  }
  function $(id) { return (typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null; }
  function restart(elm, cls) {
    if (!elm || !elm.classList) return;
    elm.classList.remove(cls);
    void elm.offsetWidth; // 重启动画（和 battle-anim.js 同一套路）
    elm.classList.add(cls);
  }
  function enterWild() { restart($("battle-wild-panel"), "anim-enter-wild"); }
  function enterMine() { restart($("battle-mine-panel"), "anim-enter-mine"); }
  var lastEnc = null;
  var lastLen = 0;
  function play(enc) {
    if (!enc) return;
    apply($("battle-screen"), enc.sceneId);
    var log = enc.log || [];
    if (enc !== lastEnc) {
      // 新遭遇战：两侧一起滑入（野生从右边、我方从左边）
      enterWild();
      enterMine();
      lastEnc = enc;
      lastLen = log.length;
      return;
    }
    if (log.length < lastLen) { lastLen = log.length; return; } // log 被重写（测试手写），只同步基线
    var fresh = log.slice(lastLen);
    lastLen = log.length;
    fresh.forEach(function (e) {
      if (e.t === "spawn") enterWild(); // 新野生出场：野生从右边滑入
      else if (e.t === "switch") enterMine(); // 换人：新出战卡从左边滑入
    });
  }
  function reset() { lastEnc = null; lastLen = 0; }
  PokeMem.SceneBg = { SCENE_IDS: SCENE_IDS, apply: apply, play: play, reset: reset };
})();
