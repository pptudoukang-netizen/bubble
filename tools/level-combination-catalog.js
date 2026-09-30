"use strict";

var GROUP_BASE = "base";
var GROUP_NEW = "new";
var GROUP_MODE = "mode";

var RULES = Object.freeze({
  G01: "同关最多2种机制、3种特殊球类型；特殊实体ID与坐标必须唯一，且只能配置在layout的空位'.'。",
  G02: "组合表只判定机制类型能否共存；具体行列、数量、颜色、通道和目标仍必须通过LevelConfigLoader及专项校验器。",
  B01: "石球必须形成可击打障碍或支撑结构，同时保留可清路线。",
  B02: "冰球innerColor必须属于本关level.colors。",
  B03: "彩虹球必须处于可击打或可掉落位置。",
  B04: "爆破球必须处于可击打或可掉落位置。",
  B05: "燃烧瓶blastRadius必须显式等于2。",
  B06: "分裂球不得位于第0行；同关splitColor一致且与唯一collect_color目标一致，并至少保留一个合法六邻空位。",
  B07: "每个漩涡必须配置完整六邻轨道；轨道只允许普通球，且不得与其他特殊实体重叠。",
  B08: "藤蔓魔灵life固定为3，六邻缠绕与解除必须遵守藤蔓结算规则。",
  B09: "每组虫洞必须恰好2个同排同方向端点，严格内区间至少2格，且通道不得与漩涡等保留结构冲突。",
  B10: "每条锁链行必须恰好1把钥匙，其余格全部为锁定球；整行layout为'.'且不得放置其他特殊实体。",
  N01: "黑洞capacity必须显式等于3。",
  N02: "毒液附件只能附着普通球，每格唯一，particleCount必须显式等于3。",
  N03: "精灵茧必须位于合法特殊实体空位，并保留可触发的相邻消除路径。",
  N04: "冰凌附件只能附着普通球，每格唯一，且不得与其他附件重叠。",
  N05: "透明球后方必须存在稳定合法碰撞终点；不得用于单目标救援关。",
  N06: "繁殖球至少保留一个合法六邻空位。",
  N07: "气泡护盾附件只能附着普通球，每格唯一，且不得与其他附件重叠。",
  N08: "地雷initialLife必须为正整数；正式生成标准为6。",
  N09: "花苞球必须位于合法特殊实体空位，并保留可触发的相邻消除路径。",
  N10: "多精灵救援必须配置2至7个不重复目标；目标位于顶部第2至6行(row=1..5)、目标格为'.'且邻接可消除普通球。",
  N11: "彩云必须完整配置visible、position、hitDispearTime、startTime、speed、color六字段，且color属于本关颜色或RAINBOW。",
  N12: "蜘蛛锚点必须是普通球，不得与特殊实体或附件重叠；同排蜘蛛共用lockRowId且lockRowId不得跨行。",
  N13: "风眼必须恰好1个入口且至少2个出口；入口可命中，出口坐标有效且不得与其他特殊实体重叠。",
  N14: "彩虹棱镜球通过initialPowerups.rainbow_prism_ball配置，不写入棋盘specialEntities。",
  M01: "动态遮挡不能覆盖特殊实体；限球关按发射数、限时关按秒清除；单目标和多目标救援均禁用。",
  M02: "限时模式固定special_floating_island/timed_infinite_shots，必须配置2至5个加时球，每个bonusSeconds固定为5。",
  M03: "单目标救援固定trapped_sprite_rescue/shot_limited，只允许彩虹、爆破、石、冰、漩涡、藤蔓六类棋盘特殊实体，并禁用计时与动态遮挡。",
  C01: "基础机制之间允许组合，但不同结构必须使用不重叠的合法空间。",
  C02: "新增机制与基础机制允许组合；两个新增机制之间不进入正式组合池。",
  C03: "动态棋盘遮挡可与基础机制及除多精灵救援外的新增机制共存。",
  C04: "限时模式只与基础机制或动态棋盘遮挡组合。",
  C05: "单目标救援只与石、冰、彩虹、爆破、漩涡、藤蔓六种基础机制组合。",
  C06: "锁链与风眼合计需要4种特殊球类型，超过单关3种上限，因此禁止组合。",
  C07: "分裂球要求唯一collect_color目标与splitColor一致；多精灵救援要求clear_all完成全部救援，因此禁止组合。"
});

var SPECIAL_BALLS = Object.freeze([
  Object.freeze({ id: "stone", label: "石球", owner: "stone", standalone: true, configKey: "level.specialEntities[]: obstacle_ball/stone", instanceContract: "至少1个stone特殊实体。" }),
  Object.freeze({ id: "ice", label: "冰球", owner: "ice", standalone: true, configKey: "level.specialEntities[]: obstacle_ball/ice", instanceContract: "至少1个ice特殊实体，innerColor属于level.colors。" }),
  Object.freeze({ id: "rainbow", label: "彩虹球", owner: "rainbow", standalone: true, configKey: "level.specialEntities[]: skill_ball/rainbow", instanceContract: "至少1个rainbow特殊实体。" }),
  Object.freeze({ id: "blast", label: "爆破球", owner: "blast", standalone: true, configKey: "level.specialEntities[]: skill_ball/blast", instanceContract: "至少1个blast特殊实体。" }),
  Object.freeze({ id: "molotov", label: "燃烧瓶", owner: "molotov", standalone: true, configKey: "level.specialEntities[]: reactive_ball/molotov", instanceContract: "至少1个molotov特殊实体，blastRadius=2。" }),
  Object.freeze({ id: "splitter", label: "分裂球", owner: "splitter", standalone: true, configKey: "level.specialEntities[]: reactive_ball/splitter", instanceContract: "至少1个splitter特殊实体，同关颜色合同一致。" }),
  Object.freeze({ id: "swirl", label: "漩涡球", owner: "swirl", standalone: true, configKey: "level.specialEntities[]: reactive_ball/swirl", instanceContract: "至少1个swirl中心；每个中心配完整六邻普通球轨道。" }),
  Object.freeze({ id: "vine_spirit", label: "藤蔓魔灵", owner: "vine_spirit", standalone: true, configKey: "level.specialEntities[]: reactive_ball/vine_spirit", instanceContract: "至少1个vine_spirit特殊实体，life=3。" }),
  Object.freeze({ id: "wormhole", label: "虫洞", owner: "wormhole", standalone: true, configKey: "level.specialEntities[]: reactive_ball/wormhole", instanceContract: "至少2个wormhole端点；每个pairId恰好2个。" }),
  Object.freeze({ id: "key", label: "钥匙", owner: "lock_chain", standalone: false, configKey: "level.specialEntities[]: key_ball/key", instanceContract: "不能单独配置；每条锁链行恰好1把钥匙。" }),
  Object.freeze({ id: "locked", label: "锁定球", owner: "lock_chain", standalone: false, configKey: "level.specialEntities[]: locked_ball/locked", instanceContract: "不能单独配置；与同行唯一钥匙组成完整锁链行。" }),
  Object.freeze({ id: "black_hole", label: "黑洞", owner: "black_hole", standalone: true, configKey: "level.specialEntities[]: hazard_ball/black_hole", instanceContract: "至少1个black_hole特殊实体，capacity=3。" }),
  Object.freeze({ id: "spirit_cocoon", label: "精灵茧", owner: "spirit_cocoon", standalone: true, configKey: "level.specialEntities[]: reactive_ball/spirit_cocoon", instanceContract: "至少1个spirit_cocoon特殊实体。" }),
  Object.freeze({ id: "transparent_ball", label: "透明球", owner: "transparent_ball", standalone: true, configKey: "level.specialEntities[]: reactive_ball/transparent_ball", instanceContract: "至少1个transparent_ball特殊实体，后方存在稳定碰撞终点。" }),
  Object.freeze({ id: "breeder", label: "繁殖球", owner: "breeder", standalone: true, configKey: "level.specialEntities[]: reactive_ball/breeder", instanceContract: "至少1个breeder特殊实体，保留合法六邻空位。" }),
  Object.freeze({ id: "mine", label: "地雷", owner: "mine", standalone: true, configKey: "level.specialEntities[]: hazard_ball/mine", instanceContract: "至少1个mine特殊实体，initialLife为正整数。" }),
  Object.freeze({ id: "bud", label: "花苞球", owner: "bud", standalone: true, configKey: "level.specialEntities[]: reactive_ball/bud", instanceContract: "至少1个bud特殊实体。" }),
  Object.freeze({ id: "wind_tunnel_entrance", label: "风眼入口", owner: "wind_tunnel", standalone: false, configKey: "level.specialEntities[]: reactive_ball/wind_tunnel_entrance", instanceContract: "不能单独配置；同关恰好1个入口。" }),
  Object.freeze({ id: "wind_tunnel_exit", label: "风眼出口", owner: "wind_tunnel", standalone: false, configKey: "level.specialEntities[]: reactive_ball/wind_tunnel_exit", instanceContract: "不能单独配置；同关至少2个出口。" }),
  Object.freeze({ id: "time_bonus_ball", label: "加时球", owner: "timed_mode", standalone: true, configKey: "level.timeBonusBalls[]", instanceContract: "限时关配置2至5个，每个bonusSeconds=5。" })
]);

var MECHANISMS = Object.freeze([
  Object.freeze({ id: "stone", label: "石球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: obstacle_ball/stone", balls: ["stone"], rules: ["B01"] }),
  Object.freeze({ id: "ice", label: "冰球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: obstacle_ball/ice", balls: ["ice"], rules: ["B02"] }),
  Object.freeze({ id: "rainbow", label: "彩虹球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: skill_ball/rainbow", balls: ["rainbow"], rules: ["B03"] }),
  Object.freeze({ id: "blast", label: "爆破球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: skill_ball/blast", balls: ["blast"], rules: ["B04"] }),
  Object.freeze({ id: "molotov", label: "燃烧瓶机制", group: GROUP_BASE, configPath: "level.specialEntities[]: reactive_ball/molotov", balls: ["molotov"], rules: ["B05"] }),
  Object.freeze({ id: "splitter", label: "分裂球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: reactive_ball/splitter", balls: ["splitter"], rules: ["B06"] }),
  Object.freeze({ id: "swirl", label: "漩涡球机制", group: GROUP_BASE, configPath: "level.specialEntities[]: reactive_ball/swirl", balls: ["swirl"], rules: ["B07"] }),
  Object.freeze({ id: "vine_spirit", label: "藤蔓魔灵机制", group: GROUP_BASE, configPath: "level.specialEntities[]: reactive_ball/vine_spirit", balls: ["vine_spirit"], rules: ["B08"] }),
  Object.freeze({ id: "wormhole", label: "虫洞机制", group: GROUP_BASE, configPath: "level.specialEntities[]: reactive_ball/wormhole", balls: ["wormhole"], rules: ["B09"] }),
  Object.freeze({ id: "lock_chain", label: "锁链机制", group: GROUP_BASE, configPath: "level.specialEntities[]: key_ball/key + locked_ball/locked", balls: ["key", "locked"], rules: ["B10"] }),
  Object.freeze({ id: "black_hole", label: "黑洞机制", group: GROUP_NEW, configPath: "level.specialEntities[]: hazard_ball/black_hole", balls: ["black_hole"], rules: ["N01"] }),
  Object.freeze({ id: "poison_attachment", label: "毒液附着机制", group: GROUP_NEW, configPath: "level.cellAttachments[]: poison", balls: [], rules: ["N02"] }),
  Object.freeze({ id: "spirit_cocoon", label: "精灵茧机制", group: GROUP_NEW, configPath: "level.specialEntities[]: reactive_ball/spirit_cocoon", balls: ["spirit_cocoon"], rules: ["N03"] }),
  Object.freeze({ id: "ice_crystal_attachment", label: "冰凌附着机制", group: GROUP_NEW, configPath: "level.cellAttachments[]: ice_crystal", balls: [], rules: ["N04"] }),
  Object.freeze({ id: "transparent_ball", label: "透明球机制", group: GROUP_NEW, configPath: "level.specialEntities[]: reactive_ball/transparent_ball", balls: ["transparent_ball"], rules: ["N05"] }),
  Object.freeze({ id: "breeder", label: "繁殖球机制", group: GROUP_NEW, configPath: "level.specialEntities[]: reactive_ball/breeder", balls: ["breeder"], rules: ["N06"] }),
  Object.freeze({ id: "bubble_shield_attachment", label: "气泡护盾附着机制", group: GROUP_NEW, configPath: "level.cellAttachments[]: bubble_shield", balls: [], rules: ["N07"] }),
  Object.freeze({ id: "mine", label: "地雷机制", group: GROUP_NEW, configPath: "level.specialEntities[]: hazard_ball/mine", balls: ["mine"], rules: ["N08"] }),
  Object.freeze({ id: "bud", label: "花苞球机制", group: GROUP_NEW, configPath: "level.specialEntities[]: reactive_ball/bud", balls: ["bud"], rules: ["N09"] }),
  Object.freeze({ id: "multi_rescue", label: "多精灵救援机制", group: GROUP_NEW, configPath: "level.multiTrappedSpiritRescue.targets[]", balls: [], rules: ["N10"] }),
  Object.freeze({ id: "color_cloud", label: "彩云机制", group: GROUP_NEW, configPath: "level.colorClouds[]", balls: [], rules: ["N11"] }),
  Object.freeze({ id: "spider", label: "蜘蛛机制", group: GROUP_NEW, configPath: "level.spiderRows[]", balls: [], rules: ["N12"] }),
  Object.freeze({ id: "wind_tunnel", label: "风眼机制", group: GROUP_NEW, configPath: "level.specialEntities[]: reactive_ball/wind_tunnel_entrance + wind_tunnel_exit", balls: ["wind_tunnel_entrance", "wind_tunnel_exit"], rules: ["N13"] }),
  Object.freeze({ id: "rainbow_prism", label: "彩虹棱镜球机制", group: GROUP_NEW, configPath: "level.initialPowerups.rainbow_prism_ball", balls: [], rules: ["N14"] }),
  Object.freeze({ id: "board_occlusion", label: "动态棋盘遮挡机制", group: GROUP_MODE, configPath: "level.boardOcclusionPlan", balls: [], rules: ["M01"] }),
  Object.freeze({ id: "timed_mode", label: "限时模式", group: GROUP_MODE, configPath: "level.levelType + level.playMode + level.timeBonusBalls[]", balls: ["time_bonus_ball"], rules: ["M02"] }),
  Object.freeze({ id: "single_rescue", label: "单精灵救援机制", group: GROUP_MODE, configPath: "level.levelType + level.trappedSpriteRescue", balls: [], rules: ["M03"] })
]);

var SINGLE_RESCUE_ALLOWED_BASE = Object.freeze([
  "stone", "ice", "rainbow", "blast", "swirl", "vine_spirit"
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function buildUniqueIndex(items, kind) {
  var index = {};
  items.forEach(function (item) {
    if (hasOwn(index, item.id)) {
      throw new Error("Duplicated " + kind + " id: " + item.id + ".");
    }
    index[item.id] = item;
  });
  return index;
}

var MECHANISM_BY_ID = buildUniqueIndex(MECHANISMS, "mechanism");
var BALL_BY_ID = buildUniqueIndex(SPECIAL_BALLS, "special ball");

function getMechanism(id) {
  if (!hasOwn(MECHANISM_BY_ID, id)) {
    throw new Error("Unknown mechanism id: " + id + ".");
  }
  return MECHANISM_BY_ID[id];
}

function getBall(id) {
  if (!hasOwn(BALL_BY_ID, id)) {
    throw new Error("Unknown special ball id: " + id + ".");
  }
  return BALL_BY_ID[id];
}

function contains(items, value) {
  return items.indexOf(value) >= 0;
}

function pairDecision(left, right) {
  if (left.id === right.id) {
    return Object.freeze({ allowed: false, reason: "同一机制不能重复计数。" });
  }
  if (left.group === GROUP_BASE && right.group === GROUP_BASE) {
    return Object.freeze({ allowed: true, rule: "C01" });
  }
  if ((left.group === GROUP_BASE && right.group === GROUP_NEW) ||
      (left.group === GROUP_NEW && right.group === GROUP_BASE)) {
    if ((left.id === "lock_chain" && right.id === "wind_tunnel") ||
        (left.id === "wind_tunnel" && right.id === "lock_chain")) {
      return Object.freeze({ allowed: false, reason: RULES.C06 });
    }
    if ((left.id === "splitter" && right.id === "multi_rescue") ||
        (left.id === "multi_rescue" && right.id === "splitter")) {
      return Object.freeze({ allowed: false, reason: RULES.C07 });
    }
    return Object.freeze({ allowed: true, rule: "C02" });
  }
  if (left.group === GROUP_NEW && right.group === GROUP_NEW) {
    return Object.freeze({ allowed: false, reason: RULES.C02 });
  }

  var mode = left.group === GROUP_MODE ? left : right;
  var other = mode === left ? right : left;
  if (mode.id === "board_occlusion") {
    if (other.id === "timed_mode") {
      return Object.freeze({ allowed: true, rule: "C04" });
    }
    if (other.id === "single_rescue" || other.id === "multi_rescue") {
      return Object.freeze({ allowed: false, reason: RULES.M01 });
    }
    if (other.group === GROUP_BASE || other.group === GROUP_NEW) {
      return Object.freeze({ allowed: true, rule: "C03" });
    }
  }
  if (mode.id === "timed_mode") {
    if (other.id === "board_occlusion" || other.group === GROUP_BASE) {
      return Object.freeze({ allowed: true, rule: "C04" });
    }
    return Object.freeze({ allowed: false, reason: RULES.C04 });
  }
  if (mode.id === "single_rescue") {
    if (other.group === GROUP_BASE && contains(SINGLE_RESCUE_ALLOWED_BASE, other.id)) {
      return Object.freeze({ allowed: true, rule: "C05" });
    }
    return Object.freeze({ allowed: false, reason: RULES.C05 });
  }
  throw new Error("Unhandled pair decision: " + left.id + " + " + right.id + ".");
}

function unique(items) {
  var seen = {};
  var result = [];
  items.forEach(function (item) {
    if (!hasOwn(seen, item)) {
      seen[item] = true;
      result.push(item);
    }
  });
  return result;
}

function resolveLevelContract(mechanisms) {
  var ids = mechanisms.map(function (mechanism) { return mechanism.id; });
  if (contains(ids, "timed_mode")) {
    return Object.freeze({ levelType: "special_floating_island", playMode: "timed_infinite_shots" });
  }
  if (contains(ids, "single_rescue")) {
    return Object.freeze({ levelType: "trapped_sprite_rescue", playMode: "shot_limited" });
  }
  if (contains(ids, "multi_rescue")) {
    return Object.freeze({ levelType: "multi_trapped_spirit_rescue", playMode: "shot_limited" });
  }
  return Object.freeze({ levelType: "normal", playMode: "shot_limited" });
}

function buildCombination(idNumber, mechanisms, pairRule) {
  var ballIds = unique([].concat.apply([], mechanisms.map(function (mechanism) {
    return mechanism.balls;
  })));
  if (ballIds.length > 3) {
    throw new Error("Combination exceeds three special ball types: " + mechanisms.map(function (item) {
      return item.id;
    }).join(" + ") + ".");
  }
  var ruleCodes = unique(["G01", "G02"].concat([].concat.apply([], mechanisms.map(function (mechanism) {
    return mechanism.rules;
  }))));
  if (pairRule !== undefined) {
    ruleCodes.push(pairRule);
  }
  return Object.freeze({
    id: "C" + String(idNumber).padStart(4, "0"),
    kind: mechanisms.length === 1 ? "单机制" : "双机制",
    mechanisms: Object.freeze(mechanisms.slice()),
    balls: Object.freeze(ballIds.map(getBall)),
    levelContract: resolveLevelContract(mechanisms),
    ruleCodes: Object.freeze(ruleCodes)
  });
}

function buildCombinations() {
  var combinations = [];
  MECHANISMS.forEach(function (mechanism) {
    combinations.push(buildCombination(combinations.length + 1, [mechanism]));
  });
  for (var leftIndex = 0; leftIndex < MECHANISMS.length; leftIndex += 1) {
    for (var rightIndex = leftIndex + 1; rightIndex < MECHANISMS.length; rightIndex += 1) {
      var left = MECHANISMS[leftIndex];
      var right = MECHANISMS[rightIndex];
      var decision = pairDecision(left, right);
      if (decision.allowed) {
        combinations.push(buildCombination(combinations.length + 1, [left, right], decision.rule));
      }
    }
  }
  return Object.freeze(combinations);
}

function validateCatalog() {
  if (MECHANISMS.length !== 27) {
    throw new Error("Mechanism catalog must contain exactly 27 entries, got " + MECHANISMS.length + ".");
  }
  if (SPECIAL_BALLS.length !== 20) {
    throw new Error("Special ball catalog must contain exactly 20 entries, got " + SPECIAL_BALLS.length + ".");
  }
  MECHANISMS.forEach(function (mechanism) {
    if (mechanism.group !== GROUP_BASE && mechanism.group !== GROUP_NEW && mechanism.group !== GROUP_MODE) {
      throw new Error("Invalid mechanism group: " + mechanism.id + " -> " + mechanism.group + ".");
    }
    if (typeof mechanism.configPath !== "string" || mechanism.configPath.length === 0) {
      throw new Error("Mechanism configPath must be a non-empty string: " + mechanism.id + ".");
    }
    mechanism.balls.forEach(function (ballId) {
      var ball = getBall(ballId);
      if (ball.owner !== mechanism.id) {
        throw new Error("Special ball owner mismatch: " + ballId + " -> " + ball.owner + ", expected " + mechanism.id + ".");
      }
    });
    mechanism.rules.forEach(function (ruleCode) {
      if (!hasOwn(RULES, ruleCode)) {
        throw new Error("Unknown rule code " + ruleCode + " on mechanism " + mechanism.id + ".");
      }
    });
  });
  SPECIAL_BALLS.forEach(function (ball) {
    if (typeof ball.configKey !== "string" || ball.configKey.length === 0) {
      throw new Error("Special ball configKey must be a non-empty string: " + ball.id + ".");
    }
    var owner = getMechanism(ball.owner);
    if (!contains(owner.balls, ball.id)) {
      throw new Error("Mechanism " + owner.id + " does not declare owned special ball " + ball.id + ".");
    }
  });
}

validateCatalog();

module.exports = Object.freeze({
  GROUP_BASE: GROUP_BASE,
  GROUP_NEW: GROUP_NEW,
  GROUP_MODE: GROUP_MODE,
  RULES: RULES,
  SPECIAL_BALLS: SPECIAL_BALLS,
  MECHANISMS: MECHANISMS,
  getMechanism: getMechanism,
  getBall: getBall,
  pairDecision: pairDecision,
  buildCombinations: buildCombinations
});
