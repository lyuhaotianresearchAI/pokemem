// PokeMem 遭遇战场景验证：node test/scenes.test.js
// 检查：场景表、解锁、稀有度分档、野生等级曲线、候选过滤、稀有增益、生成
const { POKEDEX } = require("../pokedex.js");
const Gacha = require("../gacha.js");
const Types = require("../js/types.js");
const Scenes = require("../js/scenes.js");

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  if (!cond) failures++;
}
function seq(vals) { let i = 0; return function () { return vals[i++ % vals.length]; }; }

// 1. 场景表：9 个、id 唯一、解锁与基础等级
check("9 个场景", Scenes.SCENES.length === 9);
check("id 唯一", new Set(Scenes.SCENES.map(s => s.id)).size === 9);
check("解锁等级 1/5/10/15/20/30/40/50/70",
  Scenes.SCENES.map(s => s.unlockLevel).join(",") === "1,5,10,15,20,30,40,50,70");
check("基础等级 5/8/12/16/22/30/38/48/60（草丛是 5，不是 3：全表 minLv 最小就是 5）",
  Scenes.SCENES.map(s => s.baseLevel).join(",") === "5,8,12,16,22,30,38,48,60");
check("15 个属性全覆盖",
  new Set(Scenes.SCENES.flatMap(s => s.types)).size === 15);

// 2. 查场景与名字
check("sceneById 草丛", Scenes.sceneById("grassland") && Scenes.sceneById("grassland").zh === "草丛");
check("sceneById 未知 id 返回 null", Scenes.sceneById("volcano") === null);
check("sceneName 中英文", Scenes.sceneName("grassland", "zh") === "草丛" && Scenes.sceneName("grassland", "en") === "Grassland");

// 3. 解锁：按训练家等级
check("Lv 1 只解锁草丛", Scenes.unlockedScenes(1).map(s => s.id).join(",") === "grassland");
check("Lv 5 解锁草丛+森林", Scenes.unlockedScenes(5).length === 2);
check("Lv 9 还是 2 个（没到 10 级）", Scenes.unlockedScenes(9).length === 2);
check("Lv 70 全解锁 9 个", Scenes.unlockedScenes(70).length === 9);

// 4. 稀有度分档
check("0–2 胜：N 100%", JSON.stringify(Scenes.rarityBandFor(0).weights) === JSON.stringify({ N: 100 }) &&
  JSON.stringify(Scenes.rarityBandFor(2).weights) === JSON.stringify({ N: 100 }));
check("3–5 胜：70/25/5", Scenes.rarityBandFor(3).weights.N === 70 && Scenes.rarityBandFor(3).weights.R === 25 &&
  Scenes.rarityBandFor(3).weights.SR === 5 && Scenes.rarityBandFor(5).weights.N === 70);
check("6–9 胜：50/30/15/5", Scenes.rarityBandFor(6).weights.SSR === 5 && Scenes.rarityBandFor(9).weights.N === 50);
check("10–14 胜：35/30/20/15", Scenes.rarityBandFor(10).weights.SSR === 15 && Scenes.rarityBandFor(14).weights.SR === 20);
check("15+ 胜：UR 0.1% / MR 0.05%", Scenes.rarityBandFor(15).weights.UR === 0.1 &&
  Scenes.rarityBandFor(15).weights.MR === 0.05 && Scenes.rarityBandFor(100).weights.UR === 0.1);
check("非法胜场按 0 算", Scenes.rarityBandFor(-1).weights.N === 100 && Scenes.rarityBandFor(NaN).weights.N === 100);

// 5. 野生等级曲线：基础 + 深度，上限 100，稀有楼层取高者
const gl = Scenes.sceneById("grassland");
check("草丛第 1 只 Lv 5", Scenes.wildLevelFor(gl, 0, "N", 1) === 5);
check("草丛第 10 只 Lv 23（基础 5 + 2×9）", Scenes.wildLevelFor(gl, 9, "N", 1) === 23);
check("SSR 楼层：携带 50 级 → 55", Scenes.wildLevelFor(gl, 0, "SSR", 50) === 55);
check("SSR 楼层：携带 1 级 → 6", Scenes.wildLevelFor(gl, 0, "SSR", 1) === 6);
check("UR/MR 楼层：携带 90 级 → 100 封顶", Scenes.wildLevelFor(gl, 0, "UR", 90) === 100);
check("冠军之路第 1 只 Lv 60", Scenes.wildLevelFor(Scenes.sceneById("champions-road"), 0, "N", 1) === 60);
check("深度再深也封顶 100", Scenes.wildLevelFor(Scenes.sceneById("champions-road"), 50, "N", 1) === 100);

// 6. 稀有野生强化：暴击率与生命倍率
check("普通野生：暴击 5%、生命 ×1", Scenes.wildCritRate(10, "N") === 5 && Scenes.wildHpMult(10, "N") === 1);
check("SSR：暴击 10%、生命 ×2", Scenes.wildCritRate(3, "SSR") === 10 && Scenes.wildHpMult(3, "SSR") === 2);
check("三圣鸟：暴击 20%、生命 ×3", Scenes.wildCritRate(144, "UR") === 20 && Scenes.wildHpMult(146, "UR") === 3);
check("梦幻和超梦：暴击 30%、生命 ×5", Scenes.wildCritRate(150, "MR") === 30 && Scenes.wildHpMult(151, "MR") === 5);

// 7. 候选过滤：场景属性 + minLv，梦幻例外
const ids = rows => rows.map(r => r[0]);
check("草丛 Lv 5 有绿毛虫、没妙蛙花（minLv 32）",
  ids(Scenes.eligibleSpecies(gl, 5)).includes(10) && !ids(Scenes.eligibleSpecies(gl, 5)).includes(3));
check("梦幻任何场景都出（草丛也有）", ids(Scenes.eligibleSpecies(gl, 5)).includes(151));
check("超梦只在冠军之路（草丛没有）",
  !ids(Scenes.eligibleSpecies(gl, 5)).includes(150) &&
  ids(Scenes.eligibleSpecies(Scenes.sceneById("champions-road"), 60)).includes(150));
check("三圣鸟按场景：森林三只都有",
  [144, 145, 146].every(function (id) { return ids(Scenes.eligibleSpecies(Scenes.sceneById("forest"), 8)).includes(id); }));
check("三圣鸟按场景：城市只有闪电鸟",
  ids(Scenes.eligibleSpecies(Scenes.sceneById("city"), 16)).includes(145) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("city"), 16)).includes(144) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("city"), 16)).includes(146));
check("三圣鸟按场景：沙漠只有火焰鸟、海洋只有急冻鸟",
  ids(Scenes.eligibleSpecies(Scenes.sceneById("desert"), 22)).includes(146) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("desert"), 22)).includes(144) &&
  ids(Scenes.eligibleSpecies(Scenes.sceneById("ocean"), 38)).includes(144) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("ocean"), 38)).includes(145));
check("三圣鸟按场景：草丛、溪流、冠军之路没有",
  !ids(Scenes.eligibleSpecies(gl, 5)).includes(144) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("stream"), 12)).includes(145) &&
  !ids(Scenes.eligibleSpecies(Scenes.sceneById("champions-road"), 60)).includes(146));

// 8. 生成：确定性 rng
const w0 = Scenes.spawnWild("grassland", 0, 1, () => 0);
const st10 = Gacha.statsForLevel(POKEDEX[9], 5);
check("rng 0：草丛第 1 只 = 绿毛虫 Lv 5（N、虫、暴击 5%、生命 ×1）",
  w0 && w0.id === 10 && w0.level === 5 && w0.tier === "N" && w0.firstType === "bug" &&
  w0.hp === st10.hp && w0.hpMax === st10.hp && w0.hpMult === 1 && w0.critRate === 5 && w0.baseHp === st10.hp);
check("前 3 场只出 N（rng 0 / 0.5 / 0.99 都一样）",
  [0, 1, 2].every(function (wins) {
    return [0, 0.5, 0.99].every(function (v) { return Scenes.spawnWild("grassland", wins, 1, () => v).tier === "N"; });
  }));
// 9. 稀有楼层进生成：草丛 6 胜、携带 50 级，rng 0.97 落 SSR 档、种内第 1 只 = 妙蛙花 Lv 55
const wSSR = Scenes.spawnWild("grassland", 6, 50, seq([0.97, 0]));
const st3 = Gacha.statsForLevel(POKEDEX[2], 55);
check("SSR 野生：妙蛙花 Lv 55（楼层 50+5）、生命 ×2、暴击 10%",
  wSSR && wSSR.id === 3 && wSSR.level === 55 && wSSR.tier === "SSR" && wSSR.hpMult === 2 &&
  wSSR.critRate === 10 && wSSR.hpMax === st3.hp * 2 && wSSR.hp === st3.hp * 2 && wSSR.baseHp === st3.hp);
// 10. 海洋 UR 彩票：15 胜、rng 0.9986 落 UR 档 = 急冻鸟
const wUR = Scenes.spawnWild("ocean", 15, 1, seq([0.9986, 0]));
check("海洋 15 胜 UR = 急冻鸟 Lv 68（基础 38 + 2×15）、生命 ×3、暴击 20%",
  wUR && wUR.id === 144 && wUR.tier === "UR" && wUR.hpMult === 3 && wUR.critRate === 20 && wUR.level === 68);
// 11. 权重归一化：草丛和冠军之路 15 胜永远刷不出 UR（该档没候选）
let urCount = 0;
for (let i = 0; i < 2000; i++) {
  if (Scenes.spawnWild("grassland", 15, 1, () => i / 2000).tier === "UR") urCount++;
  if (Scenes.spawnWild("champions-road", 15, 1, () => i / 2000).tier === "UR") urCount++;
}
check("草丛/冠军之路 15 胜：2000 次均匀扫，没有一次 UR", urCount === 0);
// 12. 冠军之路 MR：rng 0.9999 落 MR 档，种内第 2 只 = 梦幻（曲线 60+2×15=90）
const wMR = Scenes.spawnWild("champions-road", 15, 1, seq([0.9999, 0.9999]));
check("冠军之路 15 胜 MR = 梦幻 Lv 90、生命 ×5、暴击 30%",
  wMR && wMR.id === 151 && wMR.tier === "MR" && wMR.level === 90 && wMR.hpMult === 5 && wMR.critRate === 30);
// 13. makeWild 直接测：卡比兽 SSR
const wSn = Scenes.makeWild(POKEDEX[142], 50);
const stSn = Gacha.statsForLevel(POKEDEX[142], 50);
check("makeWild 卡比兽 Lv 50：HP = 公式 ×2、攻击不变",
  wSn.hpMax === stSn.hp * 2 && wSn.hp === stSn.hp * 2 && wSn.baseHp === stSn.hp && wSn.atk === stSn.atk);
// 14. 非法输入
check("未知场景返回 null", Scenes.spawnWild("volcano", 0, 1, () => 0) === null);
check("非法胜场按 0 算", Scenes.spawnWild("grassland", -5, 1, () => 0).id === 10);

console.log(failures === 0 ? "\n全部通过 ✅" : "\n失败 " + failures + " 项 ❌");
process.exit(failures === 0 ? 0 : 1);
