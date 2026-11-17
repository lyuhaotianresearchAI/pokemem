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
check("开包页也不再渲染问号占位", !homeJs.includes('<div class="card-back">?</div>') && homeJs.includes('<div class="card-front"></div>'));
check("卡背没有定高裁切和白色内描边", !css.includes("min-height: 232px") && !css.includes("inset 0 0 0 3px"));

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
