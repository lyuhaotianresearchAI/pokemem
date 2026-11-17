// PokeMem — 属性与克制：一代（红/绿）15 属性克制表、属性图标、弱点计算
// 克制表以 ~/workspace/build_gen1_csv.py 的 CHART 为准（用户已确认的一代约定）：
// 幽灵打超能力 ×2（不按游戏内 bug 的 0），毒与虫互克 ×2，冰打火 ×1（不是 ×0.5）。
// 图标：partywhale/pokemon-type-icons 的 SVG（raw.githubusercontent.com，
// 和宝可梦官方图同一图床），按英文属性名取图，img onerror 时只显示文字。
(function () {
  "use strict";

  var TYPE_ORDER = ["normal", "fire", "water", "electric", "grass", "ice",
    "fighting", "poison", "ground", "flying", "psychic",
    "bug", "rock", "ghost", "dragon"];
  var TYPE_ZH = { normal: "一般", fire: "火", water: "水", electric: "电",
    grass: "草", ice: "冰", fighting: "格斗", poison: "毒", ground: "地面",
    flying: "飞行", psychic: "超能力", bug: "虫", rock: "岩石",
    ghost: "幽灵", dragon: "龙" };
  var TYPE_EN = { normal: "Normal", fire: "Fire", water: "Water",
    electric: "Electric", grass: "Grass", ice: "Ice", fighting: "Fighting",
    poison: "Poison", ground: "Ground", flying: "Flying",
    psychic: "Psychic", bug: "Bug", rock: "Rock", ghost: "Ghost",
    dragon: "Dragon" };
  var TYPE_ICON_BASE = "https://raw.githubusercontent.com/partywhale/pokemon-type-icons/main/icons/";

  // 攻击属性 -> {防守属性: 倍率}，只写非 ×1 的；一代没有钢/恶/妖精
  var TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, grass: 0.5, electric: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
    ice: { water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, bug: 2 },
    ground: { fire: 2, grass: 0.5, electric: 2, poison: 2, flying: 0, bug: 0.5, rock: 2 },
    flying: { grass: 2, electric: 0.5, fighting: 2, bug: 2, rock: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 2, flying: 0.5, psychic: 2, ghost: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
    ghost: { normal: 0, psychic: 2, ghost: 2 },
    dragon: { dragon: 2 }
  };

  function typeIconUrl(id) { return TYPE_ICON_BASE + id + ".svg"; }
  function typeName(id, lang) { return lang === "en" ? TYPE_EN[id] : TYPE_ZH[id]; }
  // 图鉴行第 4 列是中文属性串（"草、毒"），转成英文 id 数组；非法词过滤掉
  function parseTypes(zhStr) {
    if (!zhStr) return [];
    return zhStr.split("、").map(function (zh) {
      for (var i = 0; i < TYPE_ORDER.length; i++) {
        if (TYPE_ZH[TYPE_ORDER[i]] === zh) return TYPE_ORDER[i];
      }
      return null;
    }).filter(function (id) { return !!id; });
  }
  // 某攻击属性打一组防守属性的倍率（双属性相乘；表里没写就是 ×1）
  function effectiveness(atk, defIds) {
    var mult = 1;
    (defIds || []).forEach(function (def) {
      var row = TYPE_CHART[atk] || {};
      mult *= (row[def] == null ? 1 : row[def]);
    });
    return mult;
  }
  // 弱点：倍率 >1 的攻击属性；×4 在前，同倍率按属性顺序
  function weaknessesFor(defIds) {
    return TYPE_ORDER.map(function (atk) {
      return { type: atk, mult: effectiveness(atk, defIds) };
    }).filter(function (w) { return w.mult > 1; }).sort(function (a, b) {
      return b.mult - a.mult || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
  }
  // 属性小徽章：图标 + 名字；mult > 1 时缀倍率（弱点行用）
  function typeChipHtml(id, lang, mult) {
    var name = typeName(id, lang) || id;
    return '<span class="type-chip"><img src="' + typeIconUrl(id) + '" alt="' + name + '" loading="lazy" onerror="this.style.display=\'none\'">' +
      name + (mult > 1 ? ' <b class="mult">×' + mult + "</b>" : "") + "</span>";
  }

  var Types = { TYPE_ORDER: TYPE_ORDER, TYPE_ZH: TYPE_ZH, TYPE_EN: TYPE_EN,
    TYPE_CHART: TYPE_CHART, typeIconUrl: typeIconUrl, typeName: typeName,
    parseTypes: parseTypes, effectiveness: effectiveness,
    weaknessesFor: weaknessesFor, typeChipHtml: typeChipHtml };

  if (typeof window !== "undefined") {
    window.PokeMem = window.PokeMem || {};
    window.PokeMem.Types = Types;
  }
  if (typeof module !== "undefined") module.exports = Types;
})();
