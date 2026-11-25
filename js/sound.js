// PokeMem — 音效（Task 36，原 Tier C）
// WebAudio 合成音，不用音频文件；只读 encounter 的 log（按长度 diff 新条目）播战斗音，
// 事件屏 / 结算屏各播一次；静音开关在顶栏，状态存在 localStorage，默认开。
// 约束：音频绝不能拖住逻辑、绝不能报错打断游戏——没有 AudioContext、被静音、
// 播放抛错时全部静默跳过；AudioContext 在第一次播音时才建（浏览器自动播放策略
// 要求用户手势后才能出声，所有音效都跟在点击后面，所以第一次点击就能唤醒）。
(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : {});
  var MUTE_KEY = "pokemem-sound-muted";
  var ctx = null; // AudioContext，懒创建
  var ctxFailed = false;
  var lastEnc = null;
  var lastLen = 0;
  var lastEvent = null;
  var lastChest = null;

  function readMuted() {
    try {
      var ls = root.localStorage;
      return !!(ls && ls.getItem && ls.getItem(MUTE_KEY) === "1");
    } catch (e) { return false; }
  }
  var muted = readMuted();

  function el(id) {
    try { return root.document.getElementById(id); } catch (e) { return null; }
  }

  // 音色表：每条音 = 若干音符 {type, f0, f1（滑音终点）, at（相对起音秒）, dur, vol}
  var SOUNDS = {
    hit: [{ type: "triangle", f0: 200, f1: 90, at: 0, dur: 0.10, vol: 0.25 }],
    crit: [{ type: "triangle", f0: 300, f1: 120, at: 0, dur: 0.12, vol: 0.25 },
      { type: "sine", f0: 1200, at: 0.02, dur: 0.08, vol: 0.18 }],
    dodge: [{ type: "sine", f0: 400, f1: 1000, at: 0, dur: 0.18, vol: 0.15 }],
    ko: [{ type: "square", f0: 320, f1: 110, at: 0, dur: 0.30, vol: 0.20 }],
    faint: [{ type: "triangle", f0: 280, f1: 80, at: 0, dur: 0.40, vol: 0.20 }],
    catch: [{ type: "sine", f0: 523, at: 0, dur: 0.09, vol: 0.20 },
      { type: "sine", f0: 659, at: 0.07, dur: 0.09, vol: 0.20 },
      { type: "sine", f0: 784, at: 0.14, dur: 0.09, vol: 0.20 },
      { type: "sine", f0: 1047, at: 0.21, dur: 0.14, vol: 0.20 }],
    catchFail: [{ type: "square", f0: 160, f1: 60, at: 0, dur: 0.18, vol: 0.22 }],
    levelup: [{ type: "triangle", f0: 440, at: 0, dur: 0.09, vol: 0.20 },
      { type: "triangle", f0: 554, at: 0.08, dur: 0.09, vol: 0.20 },
      { type: "triangle", f0: 659, at: 0.16, dur: 0.09, vol: 0.20 },
      { type: "triangle", f0: 880, at: 0.24, dur: 0.16, vol: 0.20 }],
    event: [{ type: "sine", f0: 880, at: 0, dur: 0.12, vol: 0.18 },
      { type: "sine", f0: 1175, at: 0.10, dur: 0.18, vol: 0.18 }],
    settle: [{ type: "sine", f0: 1047, at: 0, dur: 0.12, vol: 0.18 },
      { type: "sine", f0: 1319, at: 0.09, dur: 0.12, vol: 0.18 },
      { type: "sine", f0: 1568, at: 0.18, dur: 0.20, vol: 0.18 }],
    spawn: [{ type: "sine", f0: 500, f1: 750, at: 0, dur: 0.08, vol: 0.15 }],
    switch: [{ type: "triangle", f0: 600, f1: 400, at: 0, dur: 0.06, vol: 0.12 }]
  };

  function ensureCtx() {
    if (ctx) return ctx;
    if (ctxFailed) return null;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (typeof AC !== "function") { ctxFailed = true; return null; }
      ctx = new AC();
    } catch (e) { ctxFailed = true; return null; }
    return ctx;
  }

  function tone(c, note, t0) {
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = note.type || "sine";
    osc.frequency.setValueAtTime(note.f0, t0 + note.at);
    if (typeof note.f1 === "number") osc.frequency.linearRampToValueAtTime(note.f1, t0 + note.at + note.dur);
    gain.gain.setValueAtTime(0.0001, t0 + note.at);
    gain.gain.exponentialRampToValueAtTime(note.vol || 0.2, t0 + note.at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0 + note.at);
    osc.stop(t0 + note.at + note.dur + 0.05);
  }

  function playName(name) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    try {
      if (typeof c.resume === "function" && c.state === "suspended") c.resume();
      var t0 = c.currentTime || 0;
      var notes = SOUNDS[name] || [];
      notes.forEach(function (n) { tone(c, n, t0); });
    } catch (e) { ctxFailed = true; }
  }

  // log 条目 → 音名（和 BattleAnim 的 playEntry 同一张表；event / bonus 条目不出声，
  // 事件屏和结算屏各有自己的 chime）
  function soundForEntry(e) {
    if (!e || !e.t) return null;
    if (e.t === "hit") return e.crit ? "crit" : "hit";
    if (e.t === "miss") return "dodge";
    if (e.t === "ko") return "ko";
    if (e.t === "faint") return "faint";
    if (e.t === "catch") return e.success ? "catch" : "catchFail";
    if (e.t === "spawn") return "spawn";
    if (e.t === "switch") return "switch";
    if (e.t === "levelup") return "levelup";
    return null;
  }

  // 战斗音：只播新长出来的 log 条目（新场次 / log 被重置时只同步基线，不播）
  function play(enc) {
    if (!enc || !Array.isArray(enc.log)) return;
    if (enc !== lastEnc || enc.log.length < lastLen) { lastEnc = enc; lastLen = enc.log.length; return; }
    var fresh = enc.log.slice(lastLen);
    lastLen = enc.log.length;
    fresh.forEach(function (e) {
      var name = soundForEntry(e);
      if (name) playName(name);
    });
  }

  // 事件屏 chime：同一个事件对象只播一次（重复渲染不重播）
  function event(ev) {
    if (!ev || typeof ev !== "object") return;
    if (ev === lastEvent) return;
    lastEvent = ev;
    playName("event");
  }

  // 结算 chime：同一个宝箱对象只播一次（settleChest 每场建一个新对象）
  function settle(chest) {
    if (!chest || typeof chest !== "object") return;
    if (chest === lastChest) return;
    lastChest = chest;
    playName("settle");
  }

  function updateBtn() {
    var btn = el("sound-toggle");
    if (btn) btn.textContent = muted ? "🔇" : "🔊";
  }

  function setMuted(m) {
    muted = !!m;
    try {
      var ls = root.localStorage;
      if (ls && ls.setItem) ls.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) { /* 存不下也别打断游戏 */ }
    updateBtn();
  }

  function bindToggle() {
    var btn = el("sound-toggle");
    if (!btn || typeof btn.addEventListener !== "function") return;
    btn.addEventListener("click", function () { setMuted(!muted); });
    updateBtn();
  }

  function reset() { lastEnc = null; lastLen = 0; lastEvent = null; lastChest = null; }

  var Sound = {
    play: play, event: event, settle: settle,
    setMuted: setMuted, isMuted: function () { return muted; },
    toggle: function () { setMuted(!muted); },
    bindToggle: bindToggle, reset: reset,
    SOUNDS: SOUNDS, playName: playName
  };
  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.Sound = Sound;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = Sound;
  bindToggle(); // 脚本在 body 末尾加载，DOM 已就绪；桩里没按钮时静默跳过
})();
