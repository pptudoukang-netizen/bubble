"use strict";

var MAX_LEVEL = 20;
var MAX_STARS = 5;
var PROBABILITY_BY_LEVEL = [
  3, 5, 7, 8, 10,
  11, 13, 14, 16, 18,
  19, 20, 22, 23, 24,
  25, 27, 28, 29, 30
];
var LEVEL_UP_COIN_COSTS = [
  12000, 18000, 26000, 36000, 48000,
  62000, 78000, 96000, 116000, 138000,
  162000, 188000, 216000, 246000, 278000,
  312000, 348000, 386000, 426000
];
var STAR_UP_FRAGMENT_COSTS = [10, 20, 30, 40];

var SPIRITS = [
  {
    id: "milu",
    displayName: "米露",
    title: "米露·自然精灵",
    abilityName: "普通递球",
    abilityKind: "无",
    abilityKindTag: "普通协助",
    abilityKindProgress: 0.25,
    description: "不触发特殊能力；\n只执行普通递球流程。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/milu",
    avatarPath: "spirit_system/image/ui/milu_avatar_large",
    framePath: "spirit_system/image/ui/green_leaf_frame",
    elementIconPath: "spirit_system/image/ui/green_double_leaf_icon",
    abilityIconPath: "spirit_system/image/ui/large_leaf_ball"
  },
  {
    id: "lumi",
    displayName: "露米",
    title: "露米·火焰精灵",
    abilityName: "炸弹球",
    abilityKind: "产球",
    abilityKindTag: "产球技能",
    abilityKindProgress: 0.5,
    description: "递球时有概率将当前球\n替换为炸弹球。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/lumi",
    avatarPath: "spirit_system/image/ui/lumi_avatar",
    framePath: "spirit_system/image/ui/orange_fire_frame",
    elementIconPath: "spirit_system/image/ui/fire_icon",
    abilityIconPath: "spirit_system/image/ui/large_fire_ball"
  },
  {
    id: "noya",
    displayName: "诺亚",
    title: "诺亚·风之精灵",
    abilityName: "龙卷风",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "触发龙卷风清理棋盘；\n结算后重算顶部支撑。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/noya",
    avatarPath: "spirit_system/image/ui/wind_elf_avatar",
    framePath: "spirit_system/image/ui/blue_ice_frame",
    elementIconPath: "spirit_system/image/ui/wind_icon",
    abilityIconPath: "spirit_system/image/ui/large_wind_ball"
  },
  {
    id: "flora",
    displayName: "芙洛",
    title: "芙洛·森林精灵",
    abilityName: "解除束缚",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "清除棋盘内全部藤蔓束缚；\n解除后重算顶部支撑。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/flora",
    avatarPath: "spirit_system/image/ui/flora_avatar",
    framePath: "spirit_system/image/ui/yellow_sun_frame",
    elementIconPath: "spirit_system/image/ui/green_double_leaf_icon",
    abilityIconPath: "spirit_system/image/ui/large_glowing_leaf_ball"
  },
  {
    id: "loco",
    displayName: "洛可",
    title: "洛可·冰雪精灵",
    abilityName: "融雪",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "清除棋盘内全部冰雪状态；\n清理后继续正常结算。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/loco",
    avatarPath: "spirit_system/image/ui/loco_avatar",
    framePath: "spirit_system/image/ui/blue_ice_frame",
    elementIconPath: "spirit_system/image/ui/ice_icon",
    abilityIconPath: "spirit_system/image/ui/large_ice_ball"
  },
  {
    id: "kelu",
    displayName: "可露",
    title: "可露·雷电精灵",
    abilityName: "闪电链",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "释放闪电链命中多个目标；\n按技能规则完成连锁结算。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/kelu",
    avatarPath: "spirit_system/image/ui/kelu_avatar",
    framePath: "spirit_system/image/ui/yellow_lightning_frame",
    elementIconPath: "spirit_system/image/ui/lightning_icon",
    abilityIconPath: "spirit_system/image/ui/large_lightning_ball"
  },
  {
    id: "yumi",
    displayName: "悠米",
    title: "悠米·星愿精灵",
    abilityName: "星愿复刻",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "复刻最近一次有效技能；\n没有可复刻目标时不会触发。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/yumi",
    avatarPath: "spirit_system/image/ui/yumi_avatar",
    framePath: "spirit_system/image/ui/purple_star_frame",
    elementIconPath: "spirit_system/image/ui/star_icon",
    abilityIconPath: "spirit_system/image/ui/large_star_ball"
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireSpiritId(spiritId) {
  if (typeof spiritId !== "string" || spiritId.length === 0) {
    throw new Error("Assist spirit id must be a non-empty string.");
  }
  var spirit = SPIRITS.find(function (entry) {
    return entry.id === spiritId;
  });
  if (!spirit) {
    throw new Error("Unknown assist spirit id: " + spiritId);
  }
  return spirit;
}

function requireLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new Error("Assist spirit level must be between 1 and " + MAX_LEVEL + ".");
  }
  return level;
}

function requireStars(stars) {
  if (!Number.isInteger(stars) || stars < 1 || stars > MAX_STARS) {
    throw new Error("Assist spirit stars must be between 1 and " + MAX_STARS + ".");
  }
  return stars;
}

function getProbability(spiritId, level) {
  var spirit = requireSpiritId(spiritId);
  var safeLevel = requireLevel(level);
  return spirit.usesProbability ? PROBABILITY_BY_LEVEL[safeLevel - 1] : 0;
}

function getLevelUpCoinCost(level) {
  var safeLevel = requireLevel(level);
  if (safeLevel === MAX_LEVEL) {
    return null;
  }
  return LEVEL_UP_COIN_COSTS[safeLevel - 1];
}

function getStarUpFragmentCost(stars) {
  var safeStars = requireStars(stars);
  if (safeStars === MAX_STARS) {
    return null;
  }
  return STAR_UP_FRAGMENT_COSTS[safeStars - 1];
}

function getAllSpritePaths() {
  var pathMap = {};
  SPIRITS.forEach(function (spirit) {
    [
      spirit.rolePath,
      spirit.avatarPath,
      spirit.framePath,
      spirit.elementIconPath,
      spirit.abilityIconPath
    ].forEach(function (path) {
      pathMap[path] = true;
    });
  });
  return Object.keys(pathMap);
}

module.exports = {
  DEFAULT_EQUIPPED_SPIRIT_ID: "milu",
  MAX_LEVEL: MAX_LEVEL,
  MAX_STARS: MAX_STARS,
  getCatalog: function () {
    return clone(SPIRITS);
  },
  getSpirit: function (spiritId) {
    return clone(requireSpiritId(spiritId));
  },
  getProbability: getProbability,
  getLevelUpCoinCost: getLevelUpCoinCost,
  getStarUpFragmentCost: getStarUpFragmentCost,
  getAllSpritePaths: getAllSpritePaths
};
