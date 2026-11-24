// PokeMem 界面验证：node test/ui.test.js
// 检查：稀有度标记映射（黑点/黑星/金星/粉星）、翻牌震动动画的 CSS 与触发逻辑是否接好
const fs = require("fs");
const { RARITY_MARK, rarityMarkHtml } = require("../i18n.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

const expected = {
  N: { text: "●", cls: "mark-black" },
  R: { text: "★", cls: "mark-black" },
  SR: { text: "★★", cls: "mark-black" },
  SSR: { text: "★", cls: "mark-gold" },
  UR: { text: "★★", cls: "mark-gold" },
  MR: { text: "★", cls: "mark-pink" }
};
Object.keys(expected).forEach(tier => {
  const m = RARITY_MARK[tier];
  check("标记 " + tier + " = " + expected[tier].text + " " + expected[tier].cls,
    m && m.text === expected[tier].text && m.cls === expected[tier].cls,
    m ? m.text + " " + m.cls : "缺失");
});
check("rarityMarkHtml(SSR) 含金星", rarityMarkHtml("SSR").includes("★") && rarityMarkHtml("SSR").includes("mark-gold"));
check("rarityMarkHtml(MR) 含粉星", rarityMarkHtml("MR").includes("★") && rarityMarkHtml("MR").includes("mark-pink"));
check("rarityMarkHtml(N) 是黑点", rarityMarkHtml("N").includes("●") && rarityMarkHtml("N").includes("mark-black"));
check("未知档位回退 N", rarityMarkHtml("XXX").includes("●"));

const css = fs.readFileSync(__dirname + "/../style.css", "utf8");
check("CSS 有震动关键帧", css.includes("@keyframes hs-shake"));
check("CSS 有 special-shake 类", css.includes(".pack-card.special-shake"));
check("CSS 有标记颜色类", css.includes(".mark-gold") && css.includes(".mark-pink") && css.includes(".mark-black"));
check("CSS 括号平衡", (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);

const app = fs.readFileSync(__dirname + "/../app.js", "utf8");
const markUses = (app.match(/mark\(/g) || []).length;
check("app.js 在开包/卡册/详情/概率四处用标记", markUses >= 4, "用到 " + markUses + " 处");
check("app.js 有震动触发函数", app.includes("shakeIfSpecial"));
check("震动只给 SSR/MR", app.includes('tier !== "SSR" && tier !== "MR"'));
check("翻牌点击会震", app.includes("shakeIfSpecial(d, c.tier)"));
check("全部翻开也会震", app.includes("shakeIfSpecial(el, el.dataset.tier)"));
check("详情页有全部卡牌容器", fs.readFileSync(__dirname + "/../index.html", "utf8").includes('id="detail-cards"'));
check("app.js 有详情卡牌列表渲染", app.includes("renderDetailCards"));
check("app.js 有排序状态（Lv/HP/攻击）", app.includes('detailSort') && app.includes('"level"') && app.includes('"hp"') && app.includes('"atk"'));
check("启动时迁移旧存档", app.includes("migrateCollection(state)"));
check("详情左侧是 tab 栏（每张卡一个 tab）", app.includes("card-tab") && app.includes("detailSelected"));
check("tab 上限 5 张，取 Lv 最高", app.includes("slice(0, 5)") && app.includes("b.level - a.level"));
check("详情页有上限提示（超过 5 张会被去掉）", app.includes("capNote"));
check("详情页不再显示已去掉几张", !app.includes("droppedNote"));
check("启动时执行上限", app.includes("enforceCap(state)"));
check("tab 一行平行放（Lv 不再加粗单独成行）", !app.includes('"<b>Lv."'));
check("启动时补生成旧卡数值", app.includes("repairLegacyCards(state, Math.random)"));
check("补生成的旧卡在详情页注明", app.includes("repairedNote") && app.includes("c.repaired"));
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
check("顶栏 logo 是精灵球（纯 CSS）", html.includes("pokeball-logo"));
check("页面有背景装饰层", html.includes("bg-decor") && html.includes("bg-ball") && html.includes("bg-star"));
check("CSS 有精灵球浮动动画", css.includes("@keyframes ball-bob") && css.includes(".pokeball-logo"));
check("CSS 有背景漂浮与星星闪烁", css.includes("@keyframes bg-float") && css.includes("@keyframes twinkle"));
check("CSS 有开包按钮呼吸光晕", css.includes("@keyframes btn-glow"));
check("CSS 有弹窗弹出动画", css.includes("@keyframes pop-in"));
check("CSS 有 NEW 角标弹跳", css.includes("@keyframes badge-bounce"));
check("卡片悬停会上浮", css.includes(".pack-card:hover") && css.includes(".dex-cell:hover"));
// 卡面：属性底色 + 左上角属性徽章 + 画框
["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon"].forEach(function (id) {
  check("CSS 有属性底色 .tbg-" + id, css.includes(".tbg-" + id + " { --tb:"));
});
check("卡面背景用属性底色（开包 + 卡册）", css.includes(".card-face { background: var(--tb, #fff);") && css.includes(".dex-cell { background: var(--tb, #fff);"));
check("卡面左上角有属性徽章行", css.includes(".card-types {") && css.includes("justify-content: flex-start"));
check("卡面图片在白色画框里", css.includes(".card-art {"));
check("顶栏是渐变圆角", css.includes("linear-gradient(120deg, #ff6b6b"));
const i18nText = fs.readFileSync(__dirname + "/../i18n.js", "utf8");
check("页面加载可爱字体（Baloo 2 + 站酷快乐体）", html.includes("Baloo+2") && html.includes("ZCOOL+KuaiLe"));
check("正文字体栈以可爱字体开头", css.includes('"Baloo 2", "ZCOOL KuaiLe"'));
check("入册按钮文案是“入册 & 关闭”", i18nText.includes('入册 & 关闭') && i18nText.includes('Collect & Close'));
check("入册按钮不再被白底样式盖掉（白字看得见）", css.includes(".overlay-actions button:not(.big-btn)"));
check("卡背是真实高清贴图（base64 嵌在 CSS 里）", css.includes('url("data:image/jpeg;base64,'));
check("卡背盒子比例跟图一致（734:1023），背景精确贴合", css.includes("aspect-ratio: 734 / 1023") && css.includes("/ 100% 100% no-repeat"));
check("卡背不再是问号/CSS 手绘", !app.includes('<div class="card-back">?</div>') && !css.includes(".card-back-ball"));
const homeJs = fs.readFileSync(__dirname + "/../js/home.js", "utf8");
const trainerJs = fs.readFileSync(__dirname + "/../js/trainer.js", "utf8");
check("道具图和宝可梦图共用一个图源常量（pokedex.js 的 SPRITE_BASE）",
  trainerJs.includes('SPRITE_BASE + "items/"') && trainerJs.includes('replace(/_/g, "-")'));
const pokedexJs = fs.readFileSync(__dirname + "/../pokedex.js", "utf8");
check("图源常量是 PokeAPI sprites 域名",
  pokedexJs.includes('SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/"'));
check("道具行渲染图标（加载失败时隐藏）",
  trainerJs.includes("<img src=\"' + itemImg(id) + '\"") && trainerJs.includes("onerror=\"this.style.display=\\'none\\'\""));
check("CSS 有道具图标尺寸和名称占位", css.includes(".trainer-item img") && css.includes("width: 28px") && css.includes(".trainer-item-name"));
check("开包页也不再渲染问号占位", !homeJs.includes('<div class="card-back">?</div>') && homeJs.includes('<div class="card-front"></div>'));
check("卡背没有定高裁切和白色内描边", !css.includes("min-height: 232px") && !css.includes("inset 0 0 0 3px"));
check("CSS 有经验条轨道（高度+底色）", css.includes(".exp-bar") && css.includes("height: 10px"));
check("CSS 有经验条填充（蓝紫渐变）", css.includes(".exp-fill") && css.includes("linear-gradient(90deg, #4a90d9, #9b59b6)"));
check("CSS 有训练师卡片/道具/改名样式",
  css.includes(".trainer-card") && css.includes(".trainer-items") && css.includes(".trainer-item.zero") && css.includes(".trainer-rename input"));
const topbarLine = css.split("\n").filter(function (l) { return l.indexOf(".topbar {") === 0; })[0] || "";
check("顶栏在弹窗之上（z-index 高于弹窗 20，低于轻提示 40）",
  topbarLine.indexOf("z-index: 35") >= 0, topbarLine);
const overlayShowLine = css.split("\n").filter(function (l) { return l.indexOf(".overlay.show {") === 0; })[0] || "";
check("弹窗留出顶栏高度（盒子不被顶栏盖住）", overlayShowLine.indexOf("padding: 68px 12px 20px") >= 0, overlayShowLine);
const homeJsText = fs.readFileSync(__dirname + "/../js/home.js", "utf8");
check("开包用预览（drawPackPreview），不直接结算", homeJsText.includes("drawPackPreview") && !homeJsText.includes("Gacha.drawPack("));
check("有关闭不算开过的翻牌计数", homeJsText.includes("packFlipped"));
check("翻牌后按钮变入册", homeJsText.includes("updateCloseBtn") && homeJsText.includes('t("collectBtn")') && homeJsText.includes('t("closeBtn")'));
check("没翻牌关闭不调提交", homeJsText.includes("ctx.packFlipped > 0") && homeJsText.includes("settlePack"));

// Task 20 头像
const { AVATARS } = require("../avatars.js");
const gachaJs = fs.readFileSync(__dirname + "/../gacha.js", "utf8");
check("头像 25 个", AVATARS.length === 25, "实际 " + AVATARS.length);
check("头像图以内嵌 WebP data URI 存在（connector 只收文本，二进制推不上去）",
  AVATARS.every(function (a) { return a.img.indexOf("data:image/webp;base64,") === 0; }));
check("头像校验列表在 gacha.js 里（AVATAR_IDS）",
  gachaJs.includes("AVATAR_IDS") && gachaJs.includes('DEFAULT_AVATAR_ID = "red"'));
check("页面加载头像数据", html.includes('<script src="avatars.js"></script>'));
check("训练师卡有头像和换头像按钮",
  html.includes('id="trainer-avatar"') && html.includes('id="trainer-avatar-btn"') && html.includes('id="avatar-overlay"') && html.includes('id="avatar-grid"'));
check("CSS 有头像圆形裁切与选择器网格",
  css.includes(".trainer-avatar") && css.includes("border-radius: 50%") && css.includes(".avatar-grid") && css.includes(".avatar-option.selected"));
check("头像用 createElement 造按钮（测试桩可点）",
  trainerJs.includes('document.createElement("button")') && trainerJs.includes('classList.add("avatar-option")'));
check("非法头像回默认赤红（ensureTrainer 修 + avatarById 兜底，不靠不存在的文件）",
  trainerJs.includes("return AVATARS[0]") && !html.includes("assets/avatars/"));

// Task 21：Debug 面板加结晶 / 加糖果
const debugJs = fs.readFileSync(__dirname + "/../js/debug.js", "utf8");
check("Debug 面板有加结晶按钮（+10/+100/+1000）",
  html.includes('data-add-crystals="10"') && html.includes('data-add-crystals="100"') && html.includes('data-add-crystals="1000"'));
check("Debug 面板有加糖果按钮（+10/+50/+100）",
  html.includes('data-add-candy="10"') && html.includes('data-add-candy="50"') && html.includes('data-add-candy="100"'));
check("Debug 加结晶改训练师结晶并刷新顶栏",
  debugJs.includes("[data-add-crystals]") && debugJs.includes(".crystals +=") && debugJs.includes("renderHeader"));
check("Debug 加糖果改训练师糖果并刷新训练师页",
  debugJs.includes("[data-add-candy]") && debugJs.includes(".candy +=") && debugJs.includes("renderTrainer"));

// Task 22：每只宝可梦的属性图标 + 弱点（一代克制表，图标网上找）
const typesJs = fs.readFileSync(__dirname + "/../js/types.js", "utf8");
const dexJs = fs.readFileSync(__dirname + "/../js/dex.js", "utf8");
check("属性表是一代 15 属性（无钢/恶/妖精）",
  typesJs.includes("TYPE_ORDER") && !typesJs.includes('"steel"') && !typesJs.includes('"dark"') && !typesJs.includes('"fairy"'));
check("克制表有一代约定（幽灵克超能力、毒虫互克）",
  typesJs.includes("psychic: 2, ghost: 2") &&
  typesJs.includes("bug: 2") && typesJs.includes("poison: 2"));
check("属性图标走网上图源（partywhale SVG）",
  typesJs.includes("partywhale/pokemon-type-icons") && typesJs.includes("typeIconUrl"));
check("详情页有弱点行", html.includes('id="detail-weakness"'));
check("详情用属性图标 + 弱点图标",
  dexJs.includes("typeChipHtml") && dexJs.includes("weaknessesFor") && dexJs.includes("detail-weakness"));
check("属性徽章有样式", css.includes(".type-chip") && css.includes(".type-chip img"));
check("开包卡面按主属性染色 + 徽章行 + 画框", homeJs.includes("tbg-") && homeJs.includes("card-types") && homeJs.includes("card-art"));
check("卡册格子按主属性染色 + 徽章行 + 画框", dexJs.includes("tbg-") && dexJs.includes("card-types") && dexJs.includes("card-art"));
check("卡面属性标只要图标不要字", homeJs.includes("typeIconHtml") && dexJs.includes("typeIconHtml"));
check("卡面属性标是圆形图标（白圈 + 阴影）", css.includes(".card-types .type-chip img") && css.includes("width: 20px") && css.includes("rgba(255,255,255,.95)"));
check("详情图有剪影 + 问号容器", html.includes('id="detail-art"') && html.includes('class="detail-unknown">?</span>'));
check("未拥有详情剪影样式（同格子剪影）", css.includes(".detail-art.missing img") && css.includes("filter: brightness(0)"));
check("问号会摇晃", css.includes("@keyframes q-wobble") && css.includes(".detail-unknown"));
check("详情页未拥有走剪影分支", dexJs.includes("detail-art") && dexJs.includes("var missing = !owned") && dexJs.includes('t("missingName")'));
check("旧的纯文字 typeLabel 已删", !fs.readFileSync(__dirname + "/../js/lang.js", "utf8").includes("typeLabel") && !dexJs.includes("typeLabel"));

// Task 27：遭遇战 tab + 场景列表 + 选队
const encUiJs = fs.readFileSync(__dirname + "/../js/encounter-ui.js", "utf8");
check("遭遇战是第 5 个页签（tabbar + tab-page）",
  html.includes('data-tab="encounter"') && html.includes('id="tab-encounter"'));
check("遭遇战页有场景列表、选队格子、开始按钮、进行中容器",
  html.includes('id="scene-list"') && html.includes('id="team-grid"') &&
  html.includes('id="encounter-start-btn"') && html.includes('id="encounter-status"') &&
  html.includes('id="battle-screen"'));
check("遭遇战 UI 文件在 encounter 逻辑之后加载",
  html.indexOf("js/encounter.js") < html.indexOf("js/encounter-ui.js"));
check("切到遭遇战页签时渲染",
  fs.readFileSync(__dirname + "/../js/tabs.js", "utf8").includes('tab === "encounter"') &&
  fs.readFileSync(__dirname + "/../js/tabs.js", "utf8").includes("renderEncounter"));
check("场景圆圈用 createElement 造按钮（测试桩能点）、未解锁灰掉点不动",
  encUiJs.includes('document.createElement("button")') && encUiJs.includes('"orbit-cell"') &&
  encUiJs.includes('"locked"') && encUiJs.includes("if (locked) return;"));
check("场景卡有名字、属性图标、野生起始等级、解锁条件",
  encUiJs.includes("sceneName") && encUiJs.includes("typeIconHtml") &&
  encUiJs.includes("encounterBaseLevel") && encUiJs.includes("encounterUnlock"));
check("场景是轨道：9 个小圆圈绕中心转，中心显示悬停或选中场景的信息",
  encUiJs.includes('"orbit-wrap"') && encUiJs.includes('"orbit-ring"') &&
  encUiJs.includes('"orbit-cell"') && encUiJs.includes('"orbit-center"') &&
  encUiJs.includes('"orbit-icon"') && // 图标反向转那层（和环同速反向，图标始终正着）
  encUiJs.includes("SCENE_ICONS") && encUiJs.includes("imgUrl(sc.art)") && // 图标缺失时回落到代表宝可梦立绘
  encUiJs.includes("orbitPaused") && encUiJs.includes("showOrbitCenter") &&
  css.includes(".orbit-wrap") && css.includes(".orbit-ring") &&
  css.includes("@keyframes orbit-spin") && css.includes(".orbit-wrap.paused .orbit-ring") &&
  css.includes(".orbit-center") && css.includes(".orbit-types .type-chip") && css.includes(".orbit-cell.selected"));
check("地形图文件在场景逻辑之后、遭遇战 UI 之前加载",
  html.indexOf("js/scenes.js") < html.indexOf("js/scene-icons.js") &&
  html.indexOf("js/scene-icons.js") < html.indexOf("js/encounter-ui.js"));
// Task 30A：战斗动画文件在遭遇战 UI 之前加载，战斗屏有动画浮层元素
const battleAnimJs = fs.readFileSync(__dirname + "/../js/battle-anim.js", "utf8");
check("战斗动画文件在遭遇战 UI 之前加载",
  html.indexOf("js/battle-anim.js") < html.indexOf("js/encounter-ui.js") &&
  html.indexOf("js/encounter.js") < html.indexOf("js/battle-anim.js"));
check("战斗屏有伤害数字、特效、血条残影、球的浮层元素",
  ["battle-wild-dmg", "battle-mine-dmg", "battle-wild-fx", "battle-mine-fx",
    "battle-wild-hp-ghost", "battle-mine-hp-ghost", "battle-ball"].every(function (id) { return html.includes('id="' + id + '"'); }));
check("战斗动画：前冲/受击/倒下/弹出/飘字/球弧线/晃动/星星/炸开的关键帧都在",
  ["@keyframes lunge-left", "@keyframes lunge-right", "@keyframes hit-shake", "@keyframes hit-flash",
    "@keyframes faint-drop", "@keyframes caught-shrink", "@keyframes pop-in", "@keyframes dmg-float",
    "@keyframes ball-throw", "@keyframes ball-wobble", "@keyframes sparkle-pop", "@keyframes burst-pop"].every(function (k) { return css.includes(k); }) &&
  css.includes(".anim-hit") && css.includes(".anim-ball-catch") && css.includes(".anim-ball-fail"));
check("战斗动画只读 log、不改状态（play 按 log 长度 diff、动画不拖逻辑）",
  battleAnimJs.includes("enc.log.slice(lastLen)") && battleAnimJs.includes("PokeMem.BattleAnim") &&
  encUiJs.includes("PokeMem.BattleAnim.play(enc)"));
check("战斗动画：球飞过去后定格在野生处（ball-throw 带 forwards，不闪回）",
  css.includes("ball-throw .45s ease-out forwards"));
check("战斗动画也尊重 reduced-motion",
  css.includes("prefers-reduced-motion") && css.includes(".battle-ball"));
// Task 30B：事件屏视觉文件在遭遇战 UI 之前加载，战斗屏有事件名 chip、结算屏有流星
const eventAnimJs = fs.readFileSync(__dirname + "/../js/event-anim.js", "utf8");
check("事件屏视觉文件在遭遇战 UI 之前加载",
  html.indexOf("js/event-anim.js") < html.indexOf("js/encounter-ui.js") &&
  html.indexOf("js/battle-anim.js") < html.indexOf("js/event-anim.js"));
check("战斗屏有事件名 chip、结算屏有流星元素",
  html.includes('id="battle-event-chip"') && html.includes('id="battle-settle-meteor"'));
check("事件屏视觉：5 种 kind 的 class 与关键帧都在",
  ["event-kind-battle", "event-kind-heal", "event-kind-buff", "event-kind-debuff", "event-kind-reward"].every(function (c) { return css.includes(c); }) &&
  ["@keyframes heal-pulse", "@keyframes buff-rise", "@keyframes debuff-shake",
    "@keyframes reward-glow", "@keyframes reward-twinkle", "@keyframes battle-frame",
    "@keyframes meteor-fly"].every(function (k) { return css.includes(k); }) &&
  css.includes(".battle-event-chip") && css.includes(".settle-meteor"));
check("事件屏视觉只叠 class、不改状态（applyKind / showMeteor / setBattleChip 都是纯 DOM 操作）",
  eventAnimJs.includes("PokeMem.EventAnim") && eventAnimJs.includes("applyKind") &&
  encUiJs.includes("PokeMem.EventAnim.applyKind") && encUiJs.includes("PokeMem.EventAnim.setBattleChip") &&
  encUiJs.includes("PokeMem.EventAnim.showMeteor"));
check("事件屏视觉也尊重 reduced-motion",
  css.includes(".settle-meteor") && css.includes("prefers-reduced-motion"));
check("增益光带是上浮不是下沉（buff-rise 从 -110% 到 110%，光带从卡底升到卡顶）",
  css.includes("@keyframes buff-rise { from { background-position: 0 -110%; } to { background-position: 0 110%; } }"));
// Task 30C：场景背景文件在遭遇战 UI 之前加载，战斗屏 9 场景渐变 + 入场 + 待机浮动
const sceneBgJs = fs.readFileSync(__dirname + "/../js/scene-bg.js", "utf8");
check("场景背景文件在遭遇战 UI 之前加载",
  html.indexOf("js/scene-bg.js") < html.indexOf("js/encounter-ui.js") &&
  html.indexOf("js/event-anim.js") < html.indexOf("js/scene-bg.js"));
check("战斗屏面板有 id、立绘包在 .battle-sprite 里",
  html.includes('id="battle-wild-panel"') && html.includes('id="battle-mine-panel"') &&
  html.includes('class="battle-sprite"'));
check("战斗屏 9 个场景的背景 class 都在（渐变和轨道同款配色）",
  ["grassland", "forest", "stream", "city", "desert", "cave", "ocean", "glacier", "champions-road"].every(function (id) { return css.includes(".scene-bg-" + id); }));
check("场景背景：入场滑入 + 待机浮动的关键帧都在、立绘 140px",
  ["@keyframes enter-from-right", "@keyframes enter-from-left", "@keyframes scene-idle-bob"].every(function (k) { return css.includes(k); }) &&
  css.includes(".anim-enter-wild") && css.includes(".anim-enter-mine") && css.includes(".battle-sprite") &&
  css.includes("width: 140px; height: 140px"));
check("场景背景只叠 class、不改状态（apply / play 都是纯 DOM 操作）",
  sceneBgJs.includes("PokeMem.SceneBg") && sceneBgJs.includes("log.slice(lastLen)") &&
  sceneBgJs.includes("lastLen = log.length") &&
  encUiJs.includes("PokeMem.SceneBg.play(enc)"));
check("场景背景也尊重 reduced-motion",
  css.includes("prefers-reduced-motion") && css.includes(".battle-sprite"));
check("会动的图：场景轨道转圈、图标反向转（始终正着）、地形图轻浮、悬停摇摆、选中脉冲、云朵飘、球里宝可梦轻浮",
  css.includes("@keyframes orbit-spin") && css.includes("@keyframes orbit-spin-rev") &&
  css.includes(".orbit-icon") && css.includes(".orbit-wrap.paused .orbit-icon") &&
  css.includes("@keyframes scene-bob") && css.includes("@keyframes scene-wiggle") &&
  css.includes("@keyframes scene-pulse") && css.includes("@keyframes ball-bob") &&
  css.includes("@keyframes cloud-drift") && css.includes(".orbit-cell:hover .orbit-img") &&
  css.includes(".orbit-cell.selected") && css.includes(".encounter-clouds") &&
  html.includes('class="encounter-clouds"') && css.includes("prefers-reduced-motion"));
check("选卡 tab 选项一行写全信息（小字 11px、不换行、短标签“攻”）",
  encUiJs.includes("atkShort") && css.includes(".team-pick-opt") &&
  css.includes("white-space: nowrap") && css.includes("font-size: 11px"));
check("选卡 tab 悬停意图延迟 + 收起宽限（路过边上的格子不换 tab、移进 tab 取消待收）",
  encUiJs.includes("PICK_TAB_OPEN_DELAY") && encUiJs.includes("PICK_TAB_CLOSE_DELAY") &&
  encUiJs.includes("requestPickTab") && encUiJs.includes("scheduleHidePickTab") &&
  encUiJs.includes("clearPickTabTimers"));
check("选队格子每种一个格子、格子上不显示数值（数值在悬停 tab 里选）",
  encUiJs.includes('"team-cell"') && encUiJs.includes("每种一个格子") &&
  !encUiJs.includes('"team-stat"') && !encUiJs.includes('"team-affection"') &&
  encUiJs.includes("encounterAffectionPoints")); // tab 里仍显示亲密度（直接写点数）
check("点格子只打开 tab、不直接选",
  encUiJs.includes("点格子 = 立刻打开 tab") && !encUiJs.includes("toggleSpecies"));
check("选队最多 6 张、超了弹提示",
  encUiJs.includes("slot < 0") && encUiJs.includes("encounterTeamFull"));
check("开始按钮没选队时禁用、开始后记进 ctx.encounter",
  encUiJs.includes("pickCount() < 1") && encUiJs.includes("ctx.encounter = res.encounter"));
check("开始后记进 ctx.encounter、进行中显示战斗屏",
  encUiJs.includes("ctx.encounter = res.encounter") && encUiJs.includes("renderBattle"));
check("场景轨道圆圈与选队格子有样式（选中红框、未解锁变暗）",
  css.includes(".orbit-cell") && css.includes(".orbit-cell.selected") && css.includes(".orbit-cell.locked") &&
  css.includes(".team-cell.selected"));

// 选队改版：同种只放一只、悬停选哪一只上场、6 个精灵球
check("选队标题下面有 6 个精灵球槽、悬停选卡 tab 容器",
  html.includes('id="team-balls"') && html.includes('id="team-grid-wrap"') && html.includes('id="team-pick-tab"'));
check("选队格子左上角属性标、右上角×几（已选的打勾）",
  encUiJs.includes('"team-types"') && encUiJs.includes('"team-count"') && encUiJs.includes("typeIconHtml") &&
  css.includes(".team-count") && css.includes(".team-cell .team-types"));
check("精灵球开合样式（空球关着、选了打开、宝可梦放进去）",
  css.includes(".team-balls") && css.includes(".team-ball") && css.includes(".team-ball.open .ball-top") &&
  css.includes(".team-ball .ball-mon") && css.includes(".team-ball.open .ball-mon"));
check("精灵球是摆件造型（球盖掀到宝可梦身后上方、宝可梦站在球上）",
  css.includes("rotate(-28deg)") && css.includes(".team-ball.open .ball-top") &&
  css.includes("bottom: 30px"));
check("出征按钮在精灵球下面、底部的开始按钮也改叫出征",
  html.includes('id="encounter-deploy-btn"') && html.includes('id="team-balls"') &&
  html.indexOf('id="team-balls"') < html.indexOf('id="encounter-deploy-btn"') &&
  fs.readFileSync(__dirname + "/../i18n.js", "utf8").includes('encounterStartBtn: "出征"'));
check("两个出征按钮都接同一个开始动作、没选队时都禁用",
  encUiJs.includes('encounter-deploy-btn') && encUiJs.includes('encounter-start-btn') &&
  encUiJs.includes('$("encounter-deploy-btn").addEventListener("click", startRun)') &&
  encUiJs.includes('$("encounter-deploy-btn").disabled = dis'));
check("悬停选卡 tab 样式",
  css.includes(".team-pick-tab") && css.includes(".team-pick-opt") && css.includes(".team-pick-opt.selected"));
check("同种可以选多张：tab 里点具体哪张",
  encUiJs.includes("togglePick") && !encUiJs.includes("toggleSpecies") &&
  !encUiJs.includes("encounterSpeciesAllPicked"));
check("点 tab 选项不收 tab、可以连续选",
  encUiJs.includes("不收 tab") && !encUiJs.includes("togglePick(speciesId, idx); hidePickTab()"));
check("球是固定槽：点哪只取消哪只、新卡放第一个空球",
  encUiJs.includes("第一个空球") && encUiJs.includes("picks[i] = null") && encUiJs.includes("picks[slot]"));
check("出征时空球不进战斗队伍",
  encUiJs.includes("filter(function (p) { return !!p; })"));
check("选卡 tab 一行全信息：放宽到 230px、选项 11px 不换行（第四轮的 190px/12px 已让位给一行）",
  css.includes("width: 230px") && /\.team-pick-title\s*\{[^}]*font-size:\s*12px/.test(css) &&
  /\.team-pick-opt\s*\{[^}]*font-size:\s*11px/.test(css) && encUiJs.includes("tabW = 230"));
check("格子底色按主属性染成卡片色（选了也不盖掉底色）",
  encUiJs.includes('"tbg-"') && css.includes(".team-cell { position: relative; background: var(--tb, #fff);") &&
  css.includes(".team-cell.selected { border-color: #e3350d; }"));
check("tab 里亲密度直接写点数（亲密度:0）",
  encUiJs.includes("encounterAffectionPoints") &&
  fs.readFileSync(__dirname + "/../i18n.js", "utf8").includes('encounterAffectionPoints: "亲密度:{n}"'));
check("悬停格子右边浮出该种的全部卡",
  encUiJs.includes("showPickTab") && encUiJs.includes("mouseenter") && encUiJs.includes("encounterPickTitle"));
check("点球取消选择",
  encUiJs.includes("renderTeamBalls") && encUiJs.includes('"team-ball"') && encUiJs.includes("encounterTeamBallRemove"));
check("选卡 tab 的文案有中英文",
  fs.readFileSync(__dirname + "/../i18n.js", "utf8").includes("encounterPickTitle") &&
  fs.readFileSync(__dirname + "/../i18n.js", "utf8").includes("encounterTeamBallRemove"));
// Task 28：战斗界面 + 战间选择 + 结算
check("战斗屏有野生/我方面板（立绘、名字、HP 条）与一行战报",
  html.includes('id="battle-screen"') && html.includes('id="battle-wild-img"') && html.includes('id="battle-wild-name"') &&
  html.includes('id="battle-wild-hp-fill"') && html.includes('id="battle-wild-hp-text"') &&
  html.includes('id="battle-mine-img"') && html.includes('id="battle-mine-name"') &&
  html.includes('id="battle-mine-hp-fill"') && html.includes('id="battle-mine-hp-text"') &&
  html.includes('id="battle-log"'));
check("战斗屏有 4 个操作按钮 + 选球/交换子菜单容器",
  html.includes('id="battle-attack-btn"') && html.includes('id="battle-switch-btn"') &&
  html.includes('id="battle-item-btn"') && html.includes('id="battle-retreat-btn"') &&
  html.includes('id="battle-ball-menu"') && html.includes('id="battle-switch-menu"'));
check("战间选择弹窗有继续/结束 + 进度",
  html.includes('id="battle-prompt"') && html.includes('id="battle-prompt-progress"') &&
  html.includes('id="battle-continue-btn"') && html.includes('id="battle-end-btn"'));
check("结算屏有击倒数、宝箱内容、返回按钮",
  html.includes('id="battle-settle"') && html.includes('id="battle-settle-kos"') &&
  html.includes('id="battle-settle-chest"') && html.includes('id="battle-settle-back-btn"'));
check("战斗界面渲染野生/我方 HP 条与战报（抓捕失败优先于随后的反击行）",
  encUiJs.includes("renderBattle") && encUiJs.includes("setHpBar") && encUiJs.includes("renderLog") &&
  encUiJs.includes("battleLogCatchFail") && encUiJs.includes('prev.t === "catch"'));
check("每次行动后保存存档（攻击/交换/选下一只/扔球/撤退/继续/结束都调 save）",
  ["doAttack", "doSwitch", "pickNext", "throwBall", "doRetreat", "doContinue", "doEnd"].every(function (fn) {
    var body = encUiJs.slice(encUiJs.indexOf("function " + fn));
    body = body.slice(0, body.indexOf("\n  }\n") + 5);
    return body.includes("PokeMem.save()");
  }));
check("切回遭遇战页签时同步队员最大 HP",
  encUiJs.includes("refreshTeamMaxHp"));
check("选球菜单只列 3 种球、按库存禁用",
  encUiJs.includes('"poke_ball", "great_ball", "ultra_ball"') && encUiJs.includes("b.disabled = n <= 0"));
check("详情页队员卡显示实时当前 HP / 最大 HP",
  dexJs.includes("teamHpText") && dexJs.includes("m.card === card") && dexJs.includes("memberMaxHp"));
check("战斗样式齐全（HP 条、红绿、操作按钮、子菜单）",
  css.includes(".hp-bar") && css.includes(".hp-fill") && css.includes(".hp-fill.low") &&
  css.includes(".battle-actions") && css.includes(".battle-menu") && css.includes(".battle-log"));

// Task 29：遭遇战结晶每日上限 100（Task 31 起住在抽卡核心 gacha.js，事件和宝箱共用；
// encounter.js 只转发常量、宝箱结算走 Gacha.grantEncounterCrystals）
const encJs = fs.readFileSync(__dirname + "/../js/encounter.js", "utf8");
check("每日上限 100 写在抽卡核心里、按本地日期记",
  gachaJs.includes("DAILY_CRYSTAL_CAP = 100") && gachaJs.includes("encounterDayKey") &&
  gachaJs.includes("encounterCrystalsToday") &&
  encJs.includes("DAILY_CRYSTAL_CAP = Gacha.DAILY_CRYSTAL_CAP"));
check("宝箱按剩余额度发结晶、超了标 capped、道具不受影响",
  encJs.includes("grantEncounterCrystals(state, wanted * chestMult, now)") && encJs.includes("capped: grant.capped"));
check("结算屏有上限提示行（被封顶时才显示）",
  html.includes('id="battle-settle-cap"') && encUiJs.includes("battleSettleCapped") &&
  encUiJs.includes('chest.capped ? "" : "none"'));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
