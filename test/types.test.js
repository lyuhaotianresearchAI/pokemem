// PokeMem 属性克制验证：node test/types.test.js
// 检查：一代 15 属性、克制表（一代约定）、弱点计算、151 只全覆盖、图标地址
const Types = require("../js/types.js");
const { POKEDEX } = require("../pokedex.js");
const { TYPE_EN } = require("../i18n.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function weakList(ids) { return Types.weaknessesFor(ids).map(function (w) { return w.type + "x" + w.mult; }); }

// ---- 属性表 ----
check("一代 15 属性", Types.TYPE_ORDER.length === 15, Types.TYPE_ORDER.length + " 个");
check("没有钢/恶/妖精", ["steel", "dark", "fairy"].every(function (t) { return Types.TYPE_ORDER.indexOf(t) < 0; }));
check("中英文名覆盖 15 属性",
  Types.TYPE_ORDER.every(function (id) { return Types.TYPE_ZH[id] && Types.TYPE_EN[id]; }));
check("英文名与 i18n.js 的 TYPE_EN 一致",
  Types.TYPE_ORDER.every(function (id) { return TYPE_EN[Types.TYPE_ZH[id]] === Types.TYPE_EN[id]; }));
check("克制表 15 行", Object.keys(Types.TYPE_CHART).length === 15);

// ---- 解析 ----
check("解析 草、毒", eq(Types.parseTypes("草、毒"), ["grass", "poison"]));
check("解析 单属性 火", eq(Types.parseTypes("火"), ["fire"]));
check("解析 一般、飞行", eq(Types.parseTypes("一般、飞行"), ["normal", "flying"]));
check("非法词过滤", eq(Types.parseTypes("草、???"), ["grass"]));

// ---- 克制表：一代约定 ----
check("电打地面 0", Types.effectiveness("electric", ["ground"]) === 0);
check("地面打飞行 0", Types.effectiveness("ground", ["flying"]) === 0);
check("幽灵打超能力 ×2（一代约定，不按游戏 bug 的 0）", Types.effectiveness("ghost", ["psychic"]) === 2);
check("幽灵打一般 0", Types.effectiveness("ghost", ["normal"]) === 0);
check("超能力打幽灵 ×1", Types.effectiveness("psychic", ["ghost"]) === 1);
check("毒打虫 ×2", Types.effectiveness("poison", ["bug"]) === 2);
check("虫打毒 ×2", Types.effectiveness("bug", ["poison"]) === 2);
check("冰打火 ×1（一代约定，不是 ×0.5）", Types.effectiveness("ice", ["fire"]) === 1);
check("格斗打幽灵 0", Types.effectiveness("fighting", ["ghost"]) === 0);
check("一般打幽灵 0", Types.effectiveness("normal", ["ghost"]) === 0);
check("龙打龙 ×2", Types.effectiveness("dragon", ["dragon"]) === 2);

// ---- 弱点计算 ----
check("喷火龙弱点：岩石×4、水×2、电×2、冰×2（冰克飞行）",
  eq(weakList(["fire", "flying"]), ["rockx4", "waterx2", "electricx2", "icex2"]),
  weakList(["fire", "flying"]).join(","));
check("妙蛙种子弱点：虫×4（虫克草又克毒）、火、冰、飞行、超能力",
  eq(weakList(["grass", "poison"]), ["bugx4", "firex2", "icex2", "flyingx2", "psychicx2"]),
  weakList(["grass", "poison"]).join(","));
check("耿鬼弱点：地面、超能力、幽灵（全×2，无恶）",
  eq(weakList(["ghost", "poison"]), ["groundx2", "psychicx2", "ghostx2"]),
  weakList(["ghost", "poison"]).join(","));
check("小磁怪弱点只有地面", eq(weakList(["electric"]), ["groundx2"]));
check("隆隆岩弱点：水×4、草×4、冰、格斗、地面",
  eq(weakList(["ground", "rock"]), ["waterx4", "grassx4", "icex2", "fightingx2", "groundx2"]),
  weakList(["ground", "rock"]).join(","));
check("暴鲤龙弱点：电×4、岩石×2",
  eq(weakList(["water", "flying"]), ["electricx4", "rockx2"]));
check("皮卡丘弱点只有地面", eq(weakList(["electric"]), ["groundx2"]));

// ---- 151 只全覆盖 ----
var bad = [];
POKEDEX.forEach(function (r) {
  var ids = Types.parseTypes(r[3]);
  if (ids.length < 1 || ids.length > 2) { bad.push("#" + r[0] + " 属性数 " + ids.length); return; }
  var w = Types.weaknessesFor(ids);
  if (w.length < 1) bad.push("#" + r[0] + " 无弱点");
  if (w.some(function (x) { return x.mult !== 2 && x.mult !== 4; })) bad.push("#" + r[0] + " 倍率异常");
  if (w.length > 7) bad.push("#" + r[0] + " 弱点过多 " + w.length);
});
check("151 只都有 1-2 属性且弱点倍率只含 ×2/×4", bad.length === 0, bad.slice(0, 5).join("; "));

// ---- 图标 ----
check("图标地址是 partywhale SVG",
  Types.TYPE_ORDER.every(function (id) {
    return Types.typeIconUrl(id) === "https://raw.githubusercontent.com/partywhale/pokemon-type-icons/main/icons/" + id + ".svg";
  }));
check("徽章含图标、名字、×4",
  Types.typeChipHtml("rock", "zh", 4).indexOf("rock.svg") >= 0 &&
  Types.typeChipHtml("rock", "zh", 4).indexOf("岩石") >= 0 &&
  Types.typeChipHtml("rock", "zh", 4).indexOf("×4") >= 0);
check("徽章无倍率时不缀 ×",
  Types.typeChipHtml("fire", "en").indexOf("×") < 0 &&
  Types.typeChipHtml("fire", "en").indexOf("Fire") >= 0);
check("徽章图标加载失败时只显示文字（onerror 隐藏）",
  Types.typeChipHtml("fire", "zh").indexOf("onerror=") >= 0);

// ---- 卡面属性底色：15 属性在 style.css 里都有 tbg- 底色 ----
const fs = require("fs");
const css = fs.readFileSync(__dirname + "/../style.css", "utf8");
check("15 属性都有卡面底色 tbg-*",
  Types.TYPE_ORDER.every(function (id) { return css.indexOf(".tbg-" + id + " { --tb:") >= 0; }));
check("卡面背景用属性底色变量",
  css.indexOf(".card-face { background: var(--tb, #fff);") >= 0 &&
  css.indexOf(".dex-cell { background: var(--tb, #fff);") >= 0);

// ---- 卡面属性标：只要图标、不要字 ----
check("typeIconHtml 已导出", typeof Types.typeIconHtml === "function");
check("属性标只要图标（fire.svg，无可见文字）",
  Types.typeIconHtml("fire").indexOf("fire.svg") >= 0 &&
  Types.typeIconHtml("fire").replace(/alt="[^"]*"/, "").indexOf("火") < 0);
check("属性标还是 type-chip（卡面样式复用）",
  Types.typeIconHtml("fire").indexOf('class="type-chip"') >= 0);

console.log(failures === 0 ? "全部通过 ✅" : failures + " 项失败 ❌");
process.exit(failures === 0 ? 0 : 1);
