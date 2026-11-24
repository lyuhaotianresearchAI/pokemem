// PokeMem 本地验证：node test/scene-bg.test.js
// Task 30C 场景背景：只加载 js/scene-bg.js，用假 document 测 apply() 的场景 class + 地形图
// 和 play() 的 log diff 入场；不依赖整条 UI 链（集成走 smoke + encounter-ui）。
const vm = require("vm");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

function makeClassList() {
  const s = new Set();
  return {
    add(c) { s.add(c); },
    remove(...cs) { cs.forEach(function (c) { s.delete(c); }); },
    toggle(c, f) {
      if (f === undefined) { if (s.has(c)) s.delete(c); else s.add(c); }
      else if (f) s.add(c); else s.delete(c);
    },
    contains(c) { return s.has(c); },
    _all() { return Array.from(s); },
  };
}
function makeEl() {
  const props = {};
  return {
    // 真 DOM 的 style 有 setProperty / removeProperty / getPropertyValue
    style: {
      setProperty(k, v) { props[k] = v; },
      removeProperty(k) { delete props[k]; },
      getPropertyValue(k) { return props[k] || ""; },
      _props: props,
    },
    classList: makeClassList(),
    offsetWidth: 0,
  };
}

function freshSandbox(withEls) {
  const els = {};
  const sandbox = {
    document: {
      getElementById(id) {
        if (!withEls) return null;
        return els[id] || (els[id] = makeEl());
      },
    },
    SCENE_ICONS: {
      grassland: "data:image/svg+xml;base64,GRASS",
      forest: "data:image/svg+xml;base64,FOREST",
    },
    imgUrl(id) { return "https://img/" + id + ".png"; },
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.PokeMem = {
    Scenes: {
      sceneById(id) {
        const arts = { grassland: 1, forest: 12, stream: 54, city: 25, desert: 27, cave: 74, ocean: 7, glacier: 144, "champions-road": 149 };
        return arts[id] == null ? null : { id, art: arts[id] };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/scene-bg.js"), "utf8"), sandbox, { filename: "js/scene-bg.js" });
  return { sandbox, els };
}

function freshEnc() {
  return { sceneId: "grassland", log: [{ t: "spawn" }], wild: { hp: 100, hpMax: 100 }, team: [{ hp: 80, hpMax: 100 }], activeIndex: 0 };
}

(function () {
  const { sandbox, els } = freshSandbox(true);
  const SceneBg = sandbox.PokeMem.SceneBg;
  check("模块挂在 PokeMem.SceneBg 上（apply + play + reset）",
    SceneBg && typeof SceneBg.apply === "function" && typeof SceneBg.play === "function" && typeof SceneBg.reset === "function");
  check("9 个场景 id 都在 SCENE_IDS 里", SceneBg.SCENE_IDS.length === 9 && SceneBg.SCENE_IDS.indexOf("champions-road") >= 0);

  // ---- apply：场景 class + 地形图 ----
  const screen = sandbox.document.getElementById("battle-screen");
  SceneBg.apply(screen, "grassland");
  check("apply 草丛：挂 scene-bg-grassland",
    screen.classList.contains("scene-bg-grassland"));
  check("apply 草丛：--scene-art 是 SCENE_ICONS 的地形图",
    screen.style.getPropertyValue("--scene-art") === 'url("data:image/svg+xml;base64,GRASS")',
    screen.style.getPropertyValue("--scene-art"));
  SceneBg.apply(screen, "forest");
  check("apply 森林：草丛 class 清掉、森林挂上、地形图换掉",
    !screen.classList.contains("scene-bg-grassland") && screen.classList.contains("scene-bg-forest") &&
    screen.style.getPropertyValue("--scene-art") === 'url("data:image/svg+xml;base64,FOREST")');
  SceneBg.apply(screen, "moon");
  check("apply 未知场景：全部场景 class 清掉、地形图清掉",
    screen.classList._all().every(function (c) { return c.indexOf("scene-bg-") !== 0; }) &&
    screen.style.getPropertyValue("--scene-art") === "");
  // SCENE_ICONS 没加载：回落到代表宝可梦立绘（森林 art: 12）
  delete sandbox.SCENE_ICONS;
  SceneBg.apply(screen, "forest");
  check("SCENE_ICONS 缺失时回落到代表宝可梦立绘",
    screen.style.getPropertyValue("--scene-art") === 'url("https://img/12.png")',
    screen.style.getPropertyValue("--scene-art"));
  // 图和场景表都没加载：只上渐变 class，不挂图
  delete sandbox.PokeMem.Scenes;
  SceneBg.apply(screen, "forest");
  check("图和场景表都缺失：只上 class、不挂图",
    screen.classList.contains("scene-bg-forest") && screen.style.getPropertyValue("--scene-art") === "");
  check("apply(null) 不报错", (function () { try { SceneBg.apply(null, "grassland"); return true; } catch (e) { return false; } })());

  // ---- play：log diff 入场 ----
  const enc = freshEnc();
  SceneBg.play(enc);
  check("新遭遇战：战斗屏上草丛背景", screen.classList.contains("scene-bg-grassland"));
  check("新遭遇战：两侧一起滑入（野生从右、我方从左）",
    els["battle-wild-panel"].classList.contains("anim-enter-wild") &&
    els["battle-mine-panel"].classList.contains("anim-enter-mine"));
  els["battle-wild-panel"].classList.remove("anim-enter-wild");
  els["battle-mine-panel"].classList.remove("anim-enter-mine");
  enc.log.push({ t: "spawn" });
  SceneBg.play(enc);
  check("新野生出场：只有野生从右边滑入，我方不动",
    els["battle-wild-panel"].classList.contains("anim-enter-wild") &&
    !els["battle-mine-panel"].classList.contains("anim-enter-mine"));
  els["battle-wild-panel"].classList.remove("anim-enter-wild");
  enc.log.push({ t: "switch" });
  SceneBg.play(enc);
  check("换人：只有我方从左边滑入，野生不动",
    els["battle-mine-panel"].classList.contains("anim-enter-mine") &&
    !els["battle-wild-panel"].classList.contains("anim-enter-wild"));
  els["battle-wild-panel"].classList.remove("anim-enter-wild");
  els["battle-mine-panel"].classList.remove("anim-enter-mine");
  enc.log = [];
  SceneBg.play(enc);
  check("log 被重写变短：只同步基线，不触发入场",
    !els["battle-wild-panel"].classList.contains("anim-enter-wild") &&
    !els["battle-mine-panel"].classList.contains("anim-enter-mine"));
  SceneBg.reset();
  SceneBg.play(enc);
  check("reset 后：同一场又当新遭遇战，两侧重新滑入",
    els["battle-wild-panel"].classList.contains("anim-enter-wild") &&
    els["battle-mine-panel"].classList.contains("anim-enter-mine"));
  check("play(null) 不报错", (function () { try { SceneBg.play(null); return true; } catch (e) { return false; } })());
})();

(function () {
  // 元素缺失（document.getElementById 返回 null）：静默跳过，不报错
  const { sandbox } = freshSandbox(false);
  const SceneBg = sandbox.PokeMem.SceneBg;
  const enc = freshEnc();
  check("元素缺失时 play 不报错", (function () { try { SceneBg.play(enc); return true; } catch (e) { return false; } })());
  check("元素缺失时 apply 不报错", (function () { try { SceneBg.apply(null, "grassland"); return true; } catch (e) { return false; } })());
})();

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
