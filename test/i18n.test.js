// PokeMem 中英切换验证：node test/i18n.test.js
// 检查：中英 key 完全一致、所有属性与稀有度都有英文翻译、占位符替换正常
const { POKEDEX } = require("../pokedex.js");
const { I18N, TYPE_EN, TIER_EN, ITEM_NAME, i18nT } = require("../i18n.js");
const Gacha = require("../gacha.js");
const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}

const zhKeys = Object.keys(I18N.zh).sort();
const enKeys = Object.keys(I18N.en).sort();
check("中英 key 数量一致", zhKeys.length === enKeys.length, zhKeys.length + " vs " + enKeys.length);
const missing = zhKeys.filter(k => !I18N.en.hasOwnProperty(k));
const extra = enKeys.filter(k => !I18N.zh.hasOwnProperty(k));
check("英文无缺 key", missing.length === 0, missing.join(","));
check("英文无多余 key", extra.length === 0, extra.join(","));
check("中文文案无空串", zhKeys.every(k => I18N.zh[k].length > 0));
check("英文文案无空串", enKeys.every(k => I18N.en[k].length > 0));

// 所有属性 token 都有英文翻译
const typeTokens = new Set();
POKEDEX.forEach(r => r[3].split("、").forEach(x => typeTokens.add(x)));
const untranslatedTypes = [...typeTokens].filter(x => !TYPE_EN[x]);
check("151 只的全部属性都有英文", untranslatedTypes.length === 0, "缺：" + untranslatedTypes.join(",") + "（共 " + typeTokens.size + " 种）");

// 所有稀有度都有英文
const tiers = [...new Set(POKEDEX.map(r => r[4]))];
check("全部稀有度都有英文", tiers.every(x => TIER_EN[x]), tiers.join(","));

// 注册文案中英都有
const regKeys = ["registerTitle", "registerDesc", "registerNamePh", "registerHint", "registerSubmit", "registerErrEmpty", "registerErrTooLong", "registerWelcome", "registerStart"];
check("注册文案中英都有", regKeys.every(k => I18N.zh[k] && I18N.en[k]), regKeys.join(","));
check("欢迎文案占位符", i18nT("zh", "registerWelcome", { name: "小智" }).indexOf("小智") >= 0);

// 训练师页文案中英都有，8 种道具都有中英名
const trainerKeys = ["tabTrainer", "trainerCrystals", "trainerCandy", "trainerItems", "trainerRenamePh", "trainerRenameBtn", "trainerLevel", "trainerExp", "trainerExpMax", "trainerNoName"];
check("训练师页文案中英都有", trainerKeys.every(k => I18N.zh[k] && I18N.en[k]), trainerKeys.join(","));
check("8 种道具都有中英名",
  Gacha.ITEM_IDS.every(id => ITEM_NAME[id] && ITEM_NAME[id].zh && ITEM_NAME[id].en), Gacha.ITEM_IDS.join(","));

// 结晶/开包训练师行文案中英都有
const crystalKeys = ["crystalLabel", "exchangeBtn", "packTrainerExp", "packTrainerLevelUp", "packTrainerDropCandy", "toastLevelUp"];
check("结晶/开包训练师行文案中英都有", crystalKeys.every(k => I18N.zh[k] && I18N.en[k]), crystalKeys.join(","));
check("升级提示占位符", i18nT("zh", "toastLevelUp", { level: 2 }).indexOf("Lv.2") >= 0);

// 糖果升级文案中英都有
const levelUpKeys = ["levelUpBtn", "detailCandy", "levelUpToast"];
check("糖果升级文案中英都有", levelUpKeys.every(k => I18N.zh[k] && I18N.en[k]), levelUpKeys.join(","));

// 扫 index.html：所有 data-i18n / data-i18n-ph 用到的 key 都要在中英字典里
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
const usedKeys = new Set();
let m;
const re1 = /data-i18n="([^"]+)"/g;
while ((m = re1.exec(html))) usedKeys.add(m[1]);
const re2 = /data-i18n-ph="([^"]+)"/g;
while ((m = re2.exec(html))) usedKeys.add(m[1]);
check("index.html 用到的文案 key 中英都有",
  [...usedKeys].every(k => I18N.zh[k] && I18N.en[k]), [...usedKeys].join(","));

// 扫 js/*.js：所有 t("key") 调用的 key 都要在中英字典里（PR #14 评审 O1）
// i18nT 找不到 key 时会原样输出 key 本身、不报错，所以漏 key 不靠运行时发现——这个检查是唯一的兜底
const jsFiles = fs.readdirSync(path.join(__dirname, "..", "js")).filter(f => f.endsWith(".js"));
const tKeys = new Set();
jsFiles.forEach(function (f) {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf-8");
  let m2;
  const reT = /(?:^|[^\w])t\(["']([^"']+)["']\s*[,)]/g; // 前面不能是单词字符（排除 createElement("div")、split("、") 这类误伤）；后面可以是 ) 或 ,（带变量的调用）
  while ((m2 = reT.exec(src))) tKeys.add(m2[1]);
});
check("js 里 t() 用到的文案 key 中英都有",
  [...tKeys].every(k => I18N.zh[k] && I18N.en[k]), [...tKeys].join(","));
check("t() 扫查没有漏扫（至少扫到 30 个 key）", tKeys.size >= 30, "扫到 " + tKeys.size);

// 占位符一致：中英同一 key 里的 {变量} 必须同名，否则一侧会原样输出 {变量}
function varsOf(s) { var mm = s.match(/\{(\w+)\}/g); return mm ? mm.sort().join(",") : ""; }
const badPh = Object.keys(I18N.zh).filter(function (k) { return I18N.en[k] && varsOf(I18N.zh[k]) !== varsOf(I18N.en[k]); });
check("中英占位符一致", badPh.length === 0, badPh.join(","));

// 占位符替换
check("占位符替换（中文）", i18nT("zh", "pityIn", { n: 12 }) === "再 12 抽保底 SSR+");
check("占位符替换（英文）", i18nT("en", "pityIn", { n: 12 }) === "SSR+ guaranteed in 12 pulls");
check("缺 key 回退中文", i18nT("en", "不存在的key") === "不存在的key");
check("英文标题", i18nT("en", "docTitle") === "PokeMem · Pokémon 151 Gacha");
check("中文标题", i18nT("zh", "docTitle") === "PokeMem · 宝可梦151抽卡");

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
