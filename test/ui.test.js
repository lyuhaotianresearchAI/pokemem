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
check("遭遇战页有场景列表、选队格子、开始按钮、进行中面板",
  html.includes('id="scene-list"') && html.includes('id="team-grid"') &&
  html.includes('id="encounter-start-btn"') && html.includes('id="encounter-status"') &&
  html.includes('id="encounter-abandon-btn"'));
check("遭遇战 UI 文件在 encounter 逻辑之后加载",
  html.indexOf("js/encounter.js") < html.indexOf("js/encounter-ui.js"));
check("切到遭遇战页签时渲染",
  fs.readFileSync(__dirname + "/../js/tabs.js", "utf8").includes('tab === "encounter"') &&
  fs.readFileSync(__dirname + "/../js/tabs.js", "utf8").includes("renderEncounter"));
check("场景卡用 createElement 造按钮（测试桩能点）、未解锁灰掉点不动",
  encUiJs.includes('document.createElement("button")') && encUiJs.includes('"scene-card"') &&
  encUiJs.includes('"locked"') && encUiJs.includes("if (locked) return;"));
check("场景卡有名字、属性图标、野生起始等级、解锁条件",
  encUiJs.includes("sceneName") && encUiJs.includes("typeIconHtml") &&
  encUiJs.includes("encounterBaseLevel") && encUiJs.includes("encounterUnlock"));
check("选队格子每张卡一个格子、显示 Lv/HP/攻击/亲密度",
  encUiJs.includes('"team-cell"') && encUiJs.includes("affectionLevel") &&
  encUiJs.includes("encounterAffection"));
check("选队最多 6 张、超了弹提示",
  encUiJs.includes("picks.length >= 6") && encUiJs.includes("encounterTeamFull"));
check("开始按钮没选队时禁用、开始后记进 ctx.encounter",
  encUiJs.includes("teamPicks().length < 1") && encUiJs.includes("ctx.encounter = res.encounter"));
check("进行中面板有场景、当前野生、已胜场数和放弃按钮",
  encUiJs.includes("encounterCurrentScene") && encUiJs.includes("encounterCurrentWild") &&
  encUiJs.includes("encounterCurrentWins") && encUiJs.includes("abandonRun"));
check("场景卡与选队格子有样式（选中红框、未解锁变暗）",
  css.includes(".scene-card") && css.includes(".scene-card.selected") && css.includes(".scene-card.locked") &&
  css.includes(".team-cell.selected"));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
