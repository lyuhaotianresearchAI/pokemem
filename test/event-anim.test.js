// PokeMem 本地验证：node test/event-anim.test.js
// Task 30B 事件屏视觉：只加载 js/event-anim.js，用假 document 测 kind 视觉切换、
// 流星显隐、事件战斗 chip；不依赖整条 UI 链（集成走 smoke + encounter-ui）。
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
  };
}
function makeEl() {
  return { style: {}, textContent: "", classList: makeClassList(), offsetWidth: 100 };
}

(function () {
  const els = {};
  const sandbox = {
    document: {
      getElementById(id) { return els[id] || (els[id] = makeEl()); },
    },
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/event-anim.js"), "utf8"), sandbox, { filename: "js/event-anim.js" });
  const EventAnim = sandbox.PokeMem.EventAnim;

  check("模块挂在 PokeMem.EventAnim 上（applyKind + showMeteor + setBattleChip）",
    !!EventAnim && typeof EventAnim.applyKind === "function" &&
    typeof EventAnim.showMeteor === "function" && typeof EventAnim.setBattleChip === "function");
  check("5 种 kind 都在 KINDS 里", ["battle", "heal", "buff", "debuff", "reward"].every(function (k) { return EventAnim.KINDS.indexOf(k) >= 0; }));

  // kind 视觉切换：每种只挂自己的 class，换 kind 时清掉上一个，未知 kind 全清
  const screen = els["event-screen"] || (els["event-screen"] = makeEl());
  EventAnim.applyKind(screen, "heal");
  check("回复挂绿光 class", screen.classList.contains("event-kind-heal"));
  EventAnim.applyKind(screen, "buff");
  check("换增益时清掉回复、只留增益",
    screen.classList.contains("event-kind-buff") && !screen.classList.contains("event-kind-heal"));
  ["debuff", "reward", "battle"].forEach(function (k) {
    EventAnim.applyKind(screen, k);
    check(k + " 挂自己的 class", screen.classList.contains("event-kind-" + k));
  });
  EventAnim.applyKind(screen, "nope");
  check("未知 kind 全清掉、回到白卡片",
    ["battle", "heal", "buff", "debuff", "reward"].every(function (k) { return !screen.classList.contains("event-kind-" + k); }));
  EventAnim.applyKind(screen, null);
  check("无 kind 全清掉", !screen.classList.contains("event-kind-battle"));
  check("缺失元素不报错", (function () { try { EventAnim.applyKind(null, "heal"); return true; } catch (e) { return false; } })());

  // 流星：翻倍时显示 + 划过动画 class，不翻倍时藏起；重复调用仍有 class（重启动画）
  const meteor = els["battle-settle-meteor"] || (els["battle-settle-meteor"] = makeEl());
  EventAnim.showMeteor(meteor, true);
  check("流星翻倍时显示 + 挂划过动画", meteor.style.display === "" && meteor.classList.contains("anim-meteor"));
  EventAnim.showMeteor(meteor, true);
  check("流星重复调用仍挂动画（重启动画）", meteor.classList.contains("anim-meteor"));
  EventAnim.showMeteor(meteor, false);
  check("不翻倍时藏起", meteor.style.display === "none");
  check("流星缺失元素不报错", (function () { try { EventAnim.showMeteor(null, true); return true; } catch (e) { return false; } })());

  // 事件战斗 chip：有事件名时显示名字，无名时藏起并清空文本
  const chip = els["battle-event-chip"] || (els["battle-event-chip"] = makeEl());
  EventAnim.setBattleChip(chip, "路见不平");
  check("事件战斗 chip 显示事件名", chip.style.display === "" && chip.textContent === "路见不平");
  EventAnim.setBattleChip(chip, null);
  check("普通战斗 chip 藏起并清空", chip.style.display === "none" && chip.textContent === "");
  EventAnim.setBattleChip(chip, "Trainer Battle");
  check("chip 支持英文名", chip.textContent === "Trainer Battle");
  check("chip 缺失元素不报错", (function () { try { EventAnim.setBattleChip(null, "路见不平"); return true; } catch (e) { return false; } })());

  console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
  process.exitCode = failures === 0 ? 0 : 1;
})();
