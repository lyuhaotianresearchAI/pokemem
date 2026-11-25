// PokeMem 本地验证：node test/sound.test.js
// Task 36 音效：只加载 js/sound.js，用假 AudioContext + 假 document/localStorage 测
// 音色表、log diff、事件/结算去重、静音持久化；不依赖整条 UI 链（集成走 encounter-ui + smoke）。
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
  const el = {
    style: {}, textContent: "", classList: makeClassList(), _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    click() { (this._listeners.click || []).forEach(function (fn) { fn(); }); },
  };
  return el;
}

// 假 AudioContext：记下建了几个振荡器、每个的波形和滑音
function FakeAudioContext() {
  this.currentTime = 0;
  this.state = FakeAudioContext.state;
  this.destination = {};
  this.resumeCalls = 0;
  this.oscs = [];
  FakeAudioContext.created.push(this);
}
FakeAudioContext.state = "running";
FakeAudioContext.created = [];
FakeAudioContext.prototype.resume = function () { this.resumeCalls++; };
FakeAudioContext.prototype.createOscillator = function () {
  var osc = {
    type: "",
    frequency: {
      values: [],
      setValueAtTime(v) { this.values.push(["set", v]); },
      linearRampToValueAtTime(v) { this.values.push(["ramp", v]); },
    },
    connect() {},
    start() {},
    stop() {},
  };
  this.oscs.push(osc);
  return osc;
};
FakeAudioContext.prototype.createGain = function () {
  return {
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    connect() {},
  };
};

function freshSandbox(withAudio) {
  const els = {};
  const store = {};
  const sandbox = {
    document: { getElementById(id) { return els[id] || (els[id] = makeEl()); } },
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    console,
  };
  if (withAudio !== false) sandbox.AudioContext = FakeAudioContext;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/sound.js"), "utf8"), sandbox, { filename: "js/sound.js" });
  return { sandbox, els, store };
}
function freshEnc() {
  return { log: [], wild: { hp: 100, hpMax: 100 }, team: [{ hp: 80, hpMax: 100 }], activeIndex: 0 };
}
function oscCount() { return FakeAudioContext.created.reduce(function (n, c) { return n + c.oscs.length; }, 0); }

(function () {
  FakeAudioContext.created = [];
  const { sandbox, els, store } = freshSandbox();
  const Sound = sandbox.PokeMem.Sound;
  check("模块挂在 PokeMem.Sound 上（play/event/settle/静音/开关）",
    !!Sound && typeof Sound.play === "function" && typeof Sound.event === "function" &&
    typeof Sound.settle === "function" && typeof Sound.setMuted === "function" &&
    typeof Sound.isMuted === "function" && typeof Sound.toggle === "function" &&
    typeof Sound.bindToggle === "function" && typeof Sound.reset === "function");
  check("音色表 12 个音名都在",
    ["hit", "crit", "dodge", "ko", "faint", "catch", "catchFail", "levelup",
      "event", "settle", "spawn", "switch"].every(function (n) { return n in Sound.SOUNDS; }));

  // 静音时不建 AudioContext、不建振荡器
  Sound.setMuted(true);
  check("静音时 playName 不建 AudioContext", FakeAudioContext.created.length === 0);
  Sound.setMuted(false);

  // 各音的振荡器数和滑音方向
  Sound.playName("hit");
  check("打中：1 个振荡器、triangle、200→90 下滑",
    oscCount() === 1 && FakeAudioContext.created[0].oscs[0].type === "triangle" &&
    JSON.stringify(FakeAudioContext.created[0].oscs[0].frequency.values) === JSON.stringify([["set", 200], ["ramp", 90]]));
  Sound.playName("crit");
  check("暴击：2 个振荡器（打击 + 高音）", oscCount() === 3);
  Sound.playName("dodge");
  const dodgeOsc = FakeAudioContext.created[0].oscs[3];
  check("闪避：1 个振荡器、sine、400→1000 上滑",
    oscCount() === 4 && dodgeOsc.type === "sine" &&
    JSON.stringify(dodgeOsc.frequency.values) === JSON.stringify([["set", 400], ["ramp", 1000]]));
  Sound.playName("catch");
  check("抓到：4 个振荡器（琶音）", oscCount() === 8);
  Sound.playName("catchFail");
  check("挣脱：1 个振荡器", oscCount() === 9);

  // log diff：只播新条目（注：模块的 AudioContext 是单例、跨 reset 复用，
  // 所以这里记增量，不能把 FakeAudioContext.created 清空重数）
  Sound.reset();
  var m0 = oscCount();
  const enc = freshEnc();
  Sound.play(enc); // 同步基线
  check("首次 play 只同步基线、不播音", oscCount() === m0);
  enc.log.push({ t: "hit", by: "player", damage: 33, crit: false });
  Sound.play(enc);
  check("新 hit 条目播 1 声", oscCount() === m0 + 1);
  Sound.play(enc);
  check("无新条目不重播", oscCount() === m0 + 1);
  enc.log.push({ t: "miss", by: "wild" });
  Sound.play(enc);
  check("新 miss 条目播闪避音", oscCount() === m0 + 2);
  enc.log.push({ t: "hit", by: "player", damage: 66, crit: true });
  enc.log.push({ t: "ko" });
  Sound.play(enc);
  check("[crit, ko] 批次各播一声（暴击 2 振荡器 + 打倒 1）", oscCount() === m0 + 5);
  Sound.reset();
  const enc2 = freshEnc();
  Sound.play(enc2);
  check("新场次只同步基线", oscCount() === m0 + 5);

  // 事件 / 结算去重（对象身份）
  Sound.reset();
  var m1 = oscCount();
  const ev1 = { event: { id: "mentor" }, kind: "buff" };
  Sound.event(ev1);
  check("事件屏播 1 次（2 音符）", oscCount() === m1 + 2);
  Sound.event(ev1);
  check("同一事件重复渲染不重播", oscCount() === m1 + 2);
  Sound.event({ event: { id: "nurse" }, kind: "heal" });
  check("新事件再播 1 次", oscCount() === m1 + 4);
  const chest1 = { crystals: 3, items: [] };
  Sound.settle(chest1);
  check("结算播 1 次（3 音符）", oscCount() === m1 + 7);
  Sound.settle(chest1);
  check("同一宝箱重复渲染不重播", oscCount() === m1 + 7);
  Sound.settle({ crystals: 6, items: [] });
  check("新宝箱再播 1 次", oscCount() === m1 + 10);

  // 静音开关：翻转、持久化、按钮图标
  var m2 = oscCount();
  check("初始不静音、按钮是 🔊", !Sound.isMuted() && els["sound-toggle"].textContent === "🔊");
  Sound.toggle();
  check("toggle 后静音、localStorage 写 1、按钮变 🔇",
    Sound.isMuted() && store["pokemem-sound-muted"] === "1" && els["sound-toggle"].textContent === "🔇");
  Sound.playName("hit");
  check("静音时播音不建新振荡器", oscCount() === m2);
  els["sound-toggle"].click();
  check("点按钮取消静音、localStorage 写 0、按钮变回 🔊",
    !Sound.isMuted() && store["pokemem-sound-muted"] === "0" && els["sound-toggle"].textContent === "🔊");

  // 持久化读值见下面第二个块（建沙箱前就把 1 放进 store）
})();

(function () {
  // 持久化读值：建沙箱前就把 1 放进 store（freshSandbox 的 store 在加载前可写）
  FakeAudioContext.created = [];
  const els = {};
  const store = { "pokemem-sound-muted": "1" };
  const sandbox = {
    document: { getElementById(id) { return els[id] || (els[id] = makeEl()); } },
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    console,
    AudioContext: FakeAudioContext,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/sound.js"), "utf8"), sandbox, { filename: "js/sound.js" });
  check("localStorage=1 加载后初始就是静音、按钮是 🔇",
    sandbox.PokeMem.Sound.isMuted() && els["sound-toggle"].textContent === "🔇");
})();

(function () {
  // 没有 AudioContext：播音静默跳过、不抛错
  FakeAudioContext.created = [];
  const { sandbox } = freshSandbox(false);
  const Sound = sandbox.PokeMem.Sound;
  let threw = false;
  try {
    Sound.playName("hit");
    Sound.play(freshEnc());
    Sound.event({ event: { id: "x" } });
    Sound.settle({ crystals: 1, items: [] });
  } catch (e) { threw = true; }
  check("没有 AudioContext 时播音不抛错", !threw);
})();

(function () {
  // AudioContext 构造抛错：播音不抛错、且锁住不再重试
  FakeAudioContext.created = [];
  const els = {};
  const store = {};
  const sandbox = {
    document: { getElementById(id) { return els[id] || (els[id] = makeEl()); } },
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    console,
    AudioContext: function () { throw new Error("no audio"); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/sound.js"), "utf8"), sandbox, { filename: "js/sound.js" });
  const Sound = sandbox.PokeMem.Sound;
  let threw = false;
  try { Sound.playName("hit"); Sound.playName("hit"); } catch (e) { threw = true; }
  check("AudioContext 构造抛错时播音不抛错", !threw);
})();

(function () {
  // 挂起的 AudioContext：播音时 resume 一次
  FakeAudioContext.state = "suspended";
  FakeAudioContext.created = [];
  const { sandbox } = freshSandbox();
  sandbox.PokeMem.Sound.playName("hit");
  check("suspended 时播音会 resume",
    FakeAudioContext.created.length === 1 && FakeAudioContext.created[0].resumeCalls === 1);
  FakeAudioContext.state = "running";
})();

if (failures > 0) { console.log(failures + " FAILURES"); process.exit(1); }
