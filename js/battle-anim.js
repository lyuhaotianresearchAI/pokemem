// PokeMem — 战斗动画（Task 30A）
// 只读 encounter 的 log（按长度 diff 新条目）+ 当前 HP，在已经渲染好的 DOM 上叠动画；
// 绝不改状态、不拖逻辑：状态在 play() 被调之前早已更新完，动画全是 CSS class / keyframes。
// 约束（2026-11-24 重排时定）：动画不能用 setTimeout 拖住战斗逻辑；测试桩里 setTimeout
// 是空 stub、animationend 不会自己触发，所以关键帧都用 animation-delay 排好、不靠事件链；
// 元素缺失时静默跳过（桩里只有真实 id，没有的 getElementById 返回 null）。
// 依赖：只有 document；挂在 encounter-ui.js 之前加载，UI 里用 PokeMem.BattleAnim.play(enc) 调。
(function () {
  "use strict";

  // 上次处理到的 encounter 与 log 长度、两侧血条百分比（血条残影用）
  var lastEnc = null;
  var lastLen = 0;
  var lastPct = { wild: null, mine: null };

  function el(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }
  function restart(elm, cls) { // 删掉重加、中间 reflow 一次，同一动画才能连续触发
    if (!elm || !elm.classList) return;
    elm.classList.remove(cls);
    void elm.offsetWidth; // 测试桩里是 undefined，没事
    elm.classList.add(cls);
  }
  function clearCls(elm, cls) { if (elm && elm.classList) elm.classList.remove(cls); }
  function hasCls(elm, cls) { return !!(elm && elm.classList && elm.classList.contains(cls)); }
  // 同一立绘一次只能播一个动作：七个动作 class 都写 animation 简写、特异度相同，
  // 谁在 style.css 里排得靠后谁赢（F1：[hit, hit] 批次里前冲就被后定义的 anim-hit 压掉）。
  // 所以每个动画上身前先清掉该立绘上所有其它动作 class，「最新动作优先」，不依赖文件顺序。
  var MOTION = ["anim-lunge-mine", "anim-lunge-wild", "anim-hit", "anim-faint", "anim-caught", "anim-pop", "anim-levelup"];
  function clearMotion(elm) {
    if (!elm || !elm.classList) return;
    MOTION.forEach(function (c) { elm.classList.remove(c); });
  }

  var SIDE = {
    wild: { img: "battle-wild-img", fill: "battle-wild-hp-fill", ghost: "battle-wild-hp-ghost", dmg: "battle-wild-dmg", fx: "battle-wild-fx" },
    mine: { img: "battle-mine-img", fill: "battle-mine-hp-fill", ghost: "battle-mine-hp-ghost", dmg: "battle-mine-dmg", fx: "battle-mine-fx" }
  };

  // 血条残影：掉血时先把残影定在旧百分比、再慢慢缩到新百分比；回血/升级只跳变、不播残影
  function setGhost(side, pct) {
    var ghost = el(SIDE[side].ghost);
    if (!ghost || !ghost.style) return;
    if (pct == null || isNaN(pct)) return;
    pct = Math.max(0, Math.min(100, pct));
    var old = lastPct[side];
    lastPct[side] = pct;
    if (old == null || old === pct) { ghost.style.transition = "none"; ghost.style.width = pct + "%"; return; }
    if (pct < old) {
      ghost.style.transition = "none";
      ghost.style.width = old + "%";
      void ghost.offsetWidth;
      ghost.style.transition = "width .6s ease";
      ghost.style.width = pct + "%";
    } else {
      ghost.style.transition = "none";
      ghost.style.width = pct + "%";
    }
  }
  function pctOf(hp, hpMax) { return hpMax > 0 ? Math.max(0, Math.min(100, hp / hpMax * 100)) : 0; }

  // 伤害数字：暴击金色大字「暴击！-66」，普通「-33」；播完靠 keyframes 的 forwards 停在透明
  function showDmg(side, damage, crit) {
    var dmg = el(SIDE[side].dmg);
    if (!dmg) return;
    dmg.textContent = (crit ? "暴击！-" : "-") + damage;
    if (dmg.classList) dmg.classList.toggle("crit", !!crit);
    restart(dmg, "anim-dmg");
  }

  // 终结类动画（打倒 / 抓到）要把目标图先亮回来：renderBattle 在野生没了时把图藏了，
  // 这里把它显示出来播倒下/缩小淡出，播完再藏回去；用户中途点了继续（新野生已刷出）就不再藏
  function hideBack(enc, side, cls, ms) {
    if (typeof setTimeout !== "function") return;
    setTimeout(function () {
      if (enc.wild) return; // 已有新野生（点了继续），别动它
      var img = el(SIDE[side].img);
      if (!img || !hasCls(img, cls)) return;
      img.style.display = "none";
      img.classList.remove(cls);
    }, ms);
  }

  function playEntry(enc, e) {
    if (!e || !e.t) return;
    if (e.t === "hit") {
      // by: "player" = 我方打野生；"wild" = 野生打我方
      var atkSide = e.by === "wild" ? "wild" : "mine";
      var defSide = e.by === "wild" ? "mine" : "wild";
      var atkImg = el(SIDE[atkSide].img);
      clearMotion(atkImg);
      restart(atkImg, atkSide === "mine" ? "anim-lunge-mine" : "anim-lunge-wild");
      var defImg = el(SIDE[defSide].img);
      clearMotion(defImg);
      restart(defImg, "anim-hit"); // 一个 class 里两条 keyframes：抖（位移）+ 闪红（滤镜），分开写会互相覆盖 animation 属性
      showDmg(defSide, e.damage, e.crit);
      // 打倒/抓到后野生已不在 enc 里，残影要从这条 log 的 defHp 读（enc.wild 是 null）
      if (typeof e.defHp === "number" && typeof e.defHpMax === "number") setGhost(defSide, pctOf(e.defHp, e.defHpMax));
      return;
    }
    if (e.t === "ko") {
      var wildImg = el(SIDE.wild.img);
      if (wildImg) wildImg.style.display = ""; // 先亮回来再倒下
      clearMotion(wildImg);
      restart(wildImg, "anim-faint");
      hideBack(enc, "wild", "anim-faint", 800);
      return;
    }
    if (e.t === "faint") {
      var mineImg = el(SIDE.mine.img);
      clearMotion(mineImg);
      restart(mineImg, "anim-faint"); // 我方倒下不藏图（还要等玩家选下一只，换人时清掉）
      return;
    }
    if (e.t === "catch") {
      var ball = el("battle-ball");
      if (ball) {
        ball.style.display = "block";
        restart(ball, e.success ? "anim-ball-catch" : "anim-ball-fail");
      }
      var fx = el(SIDE.wild.fx);
      if (fx) {
        fx.textContent = e.success ? "✦✦✦" : "✷✷✷";
        restart(fx, e.success ? "anim-sparkle" : "anim-burst");
      }
      var wImg = el(SIDE.wild.img);
      if (e.success) {
        if (wImg) wImg.style.display = ""; // 先亮回来再缩小淡出
        clearMotion(wImg); // O1：原来只靠 anim-caught 在文件里排得靠后才赢，现在显式清掉
        restart(wImg, "anim-caught");
        hideBack(enc, "wild", "anim-caught", 1500);
      }
      return;
    }
    if (e.t === "spawn") {
      clearOverlays(); // 新野生出场 = 新的一场战斗：上一场残留的飘字/特效/球动画必须清掉
      var sImg = el(SIDE.wild.img);
      clearMotion(sImg);
      restart(sImg, "anim-pop");
      return;
    }
    if (e.t === "switch") {
      var mImg = el(SIDE.mine.img);
      clearMotion(mImg);
      restart(mImg, "anim-pop");
      return;
    }
    if (e.t === "levelup") {
      var lImg = el(SIDE.mine.img);
      clearMotion(lImg);
      restart(lImg, "anim-levelup");
      return;
    }
  }

  // 新野生出场 = 新的一场战斗：上一场残留的飘字/特效/球动画必须清掉。
  // 原因：战斗屏在提示/事件阶段会被 display:none 藏起来，CSS 动画在隐藏时暂停、
  // 显示后会接着播——上一场没飘完的伤害数字就会在新战斗里接着飘（走查 2026-11-24 发现）。
  function clearOverlays() {
    ["wild", "mine"].forEach(function (side) {
      var dmg = el(SIDE[side].dmg);
      if (dmg) { dmg.classList.remove("anim-dmg", "crit"); dmg.textContent = ""; }
      var fx = el(SIDE[side].fx);
      if (fx) { fx.classList.remove("anim-sparkle", "anim-burst"); fx.textContent = ""; }
    });
    var ball = el("battle-ball");
    if (ball) ball.classList.remove("anim-ball-catch", "anim-ball-fail");
  }
  function syncBaseline(enc) {
    lastEnc = enc;
    lastLen = enc.log.length;
    lastPct = { wild: null, mine: null };
    clearOverlays(); // 新遭遇战也一样：上一局的飘字不能带进来
    // F3：新场次先清掉两边立绘上上局残留的终结 class（团灭时我方图挂着 anim-faint、
    // opacity 0 + forwards，没有任何东西会清它；不清理新开局我方就是隐形的）；
    // 也一并盖住旧 hideBack 计时器的跨场次竞态（旧计时器认 class，清掉了它就不再藏新图）
    clearMotion(el(SIDE.wild.img));
    clearMotion(el(SIDE.mine.img));
    if (enc.wild) lastPct.wild = pctOf(enc.wild.hp, enc.wild.hpMax);
    var active = enc.team && enc.team[enc.activeIndex];
    if (active) lastPct.mine = pctOf(active.hp, active.hpMax);
  }

  function play(enc) {
    if (!enc || !Array.isArray(enc.log)) return;
    // 新场次、或 log 被重置（测试里会直接改写 log）：只同步基线，不播动画
    if (enc !== lastEnc || enc.log.length < lastLen) { syncBaseline(enc); return; }
    var fresh = enc.log.slice(lastLen);
    lastLen = enc.log.length;
    var hitSides = {}; // 本批已有 hit 条目的一侧，残影由条目里的 defHp 驱动，通用同步不再重复跑
    fresh.forEach(function (e) {
      playEntry(enc, e);
      if (e.t === "hit") hitSides[e.by === "wild" ? "mine" : "wild"] = true;
    });
    // 两侧还在场上的：血条残影按当前 HP 同步（回血、升级、切页签同步最大 HP 都走这里）
    if (enc.wild && !hitSides.wild) setGhost("wild", pctOf(enc.wild.hp, enc.wild.hpMax));
    var active = enc.team && enc.team[enc.activeIndex];
    if (active && !hitSides.mine) setGhost("mine", pctOf(active.hp, active.hpMax));
    // 兜底：还站着的卡不该留着倒下 class（换人/刷野时已清，这里防漏网）
    if (enc.wild && enc.wild.hp > 0) clearCls(el(SIDE.wild.img), "anim-faint");
    if (active && active.hp > 0) clearCls(el(SIDE.mine.img), "anim-faint");
  }

  function reset() { lastEnc = null; lastLen = 0; lastPct = { wild: null, mine: null }; }

  var BattleAnim = { play: play, reset: reset };
  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.BattleAnim = BattleAnim;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = BattleAnim;
})();
