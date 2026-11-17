// PokeMem 中英切换验证：node test/i18n.test.js
// 检查：中英 key 完全一致、所有属性与稀有度都有英文翻译、占位符替换正常
const { POKEDEX } = require("../pokedex.js");
const { I18N, TYPE_EN, TIER_EN, i18nT } = require("../i18n.js");

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

// 占位符替换
check("占位符替换（中文）", i18nT("zh", "pityIn", { n: 12 }) === "再 12 抽保底 SSR+");
check("占位符替换（英文）", i18nT("en", "pityIn", { n: 12 }) === "SSR+ guaranteed in 12 pulls");
check("缺 key 回退中文", i18nT("en", "不存在的key") === "不存在的key");
check("英文标题", i18nT("en", "docTitle") === "PokeMem · Pokémon 151 Gacha");
check("中文标题", i18nT("zh", "docTitle") === "PokeMem · 宝可梦151抽卡");

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
