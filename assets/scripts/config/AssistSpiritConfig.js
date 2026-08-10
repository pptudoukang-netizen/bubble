"use strict";

var MAX_LEVEL = 10;
var PROBABILITY_BY_LEVEL = [
  3, 6, 9, 12, 15,
  18, 21, 24, 27, 30
];
var LEVEL_UP_FRAGMENT_COSTS = [10, 15, 20, 25, 30, 35, 40, 45, 50];
var NOT_UNLOCKED_TIP = "该精灵尚未解锁，请先完成对应救援关卡";
var GLOBAL_SKILL_CHARGE_MAX_BY_LEVEL = [25, 23, 21, 19, 17, 15, 14, 13, 12, 11];
var GLOBAL_SKILL_MAX_TARGETS_BY_ID = {
  tornado: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10],
  release_vines: [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
  permanent_thaw: [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
  lightning_chain: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10]
};

var SPIRITS = [
  {
    id: "milu",
    displayName: "米露",
    title: "米露·自然精灵",
    abilityName: "普通递球",
    abilityType: "none",
    abilityKind: "无",
    abilityKindTag: "普通协助",
    abilityKindProgress: 0.25,
    description: "不触发特殊能力；\n只执行普通递球流程。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/milu",
    avatarPath: "spirit_system/image/ui/milu_avatar_large",
    framePath: "spirit_system/image/ui/green_leaf_frame",
    fragmentIconPath: "spirit_system/image/tabbar/milu_fragments",
    elementIconPath: "spirit_system/image/ui/green_double_leaf_icon",
    abilityIconPath: "spirit_system/image/ui/large_leaf_ball"
  },
  {
    id: "lumi",
    displayName: "露米",
    title: "露米·火焰精灵",
    abilityName: "炸弹球",
    abilityType: "produced_ball",
    producedBallType: "blast",
    abilityKind: "产球",
    abilityKindTag: "产球技能",
    abilityKindProgress: 0.5,
    description: "递球时有概率将当前球\n替换为炸弹球。",
    usesProbability: true,
    rolePath: "spirit_system/image/role/lumi",
    avatarPath: "spirit_system/image/ui/lumi_avatar",
    framePath: "spirit_system/image/ui/orange_fire_frame",
    fragmentIconPath: "spirit_system/image/tabbar/lumi_fragments",
    elementIconPath: "spirit_system/image/ui/fire_icon",
    abilityIconPath: "spirit_system/image/ui/large_fire_ball"
  },
  {
    id: "noya",
    displayName: "诺亚",
    title: "诺亚·风之精灵",
    abilityName: "龙卷风",
    abilityType: "global_skill",
    globalSkillId: "tornado",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "随机路径卷过棋盘；\n按距离消除附近泡泡。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/noya",
    avatarPath: "spirit_system/image/ui/wind_elf_avatar",
    framePath: "spirit_system/image/ui/blue_ice_frame",
    fragmentIconPath: "spirit_system/image/tabbar/noya_fragments",
    elementIconPath: "spirit_system/image/ui/wind_icon",
    abilityIconPath: "spirit_system/image/ui/large_wind_ball"
  },
  {
    id: "flora",
    displayName: "芙洛",
    title: "芙洛·森林精灵",
    abilityName: "解除束缚",
    abilityType: "global_skill",
    globalSkillId: "release_vines",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "清除棋盘内全部藤蔓束缚；\n解除后重算顶部支撑。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/flora",
    avatarPath: "spirit_system/image/ui/flora_avatar",
    framePath: "spirit_system/image/ui/yellow_sun_frame",
    fragmentIconPath: "spirit_system/image/tabbar/flora_fragments",
    elementIconPath: "spirit_system/image/ui/green_double_leaf_icon",
    abilityIconPath: "spirit_system/image/ui/large_glowing_leaf_ball"
  },
  {
    id: "loco",
    displayName: "洛可",
    title: "洛可·冰雪精灵",
    abilityName: "融雪",
    abilityType: "global_skill",
    globalSkillId: "permanent_thaw",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "永久融化冰晶；\n露出内部颜色的普通球。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/loco",
    avatarPath: "spirit_system/image/ui/loco_avatar",
    framePath: "spirit_system/image/ui/blue_ice_frame",
    fragmentIconPath: "spirit_system/image/tabbar/loco_fragments",
    elementIconPath: "spirit_system/image/ui/ice_icon",
    abilityIconPath: "spirit_system/image/ui/large_ice_ball"
  },
  {
    id: "kelu",
    displayName: "可露",
    title: "可露·雷电精灵",
    abilityName: "闪电链",
    abilityType: "global_skill",
    globalSkillId: "lightning_chain",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "释放闪电链命中多个目标；\n按技能规则完成连锁结算。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/kelu",
    avatarPath: "spirit_system/image/ui/kelu_avatar",
    framePath: "spirit_system/image/ui/yellow_lightning_frame",
    fragmentIconPath: "spirit_system/image/tabbar/kelu_fragments",
    elementIconPath: "spirit_system/image/ui/lightning_icon",
    abilityIconPath: "spirit_system/image/ui/large_lightning_ball"
  },
  {
    id: "yumi",
    displayName: "悠米",
    title: "悠米·星愿精灵",
    abilityName: "星光技能",
    abilityType: "global_skill",
    globalSkillId: "starlight_priority",
    abilityKind: "全局",
    abilityKindTag: "全局技能",
    abilityKindProgress: 1,
    description: "按藤蔓、雪块、闪电、龙卷风；\n优先释放当前合法技能。",
    usesProbability: false,
    rolePath: "spirit_system/image/role/yumi",
    avatarPath: "spirit_system/image/ui/yumi_avatar",
    framePath: "spirit_system/image/ui/purple_star_frame",
    fragmentIconPath: "spirit_system/image/tabbar/yumi_fragments",
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

function getProbability(spiritId, level) {
  var spirit = requireSpiritId(spiritId);
  var safeLevel = requireLevel(level);
  return spirit.usesProbability ? PROBABILITY_BY_LEVEL[safeLevel - 1] : 0;
}

function requireGlobalSkillId(skillId) {
  if (typeof skillId !== "string" || !Object.prototype.hasOwnProperty.call(GLOBAL_SKILL_MAX_TARGETS_BY_ID, skillId)) {
    throw new Error("Unknown global assist spirit skill: " + skillId);
  }
  return skillId;
}

function getGlobalSkillRuntimeConfig(skillId, level) {
  var safeSkillId = requireGlobalSkillId(skillId);
  var safeLevel = requireLevel(level);
  var maxTargets = GLOBAL_SKILL_MAX_TARGETS_BY_ID[safeSkillId][safeLevel - 1];
  if (maxTargets !== null && (!Number.isInteger(maxTargets) || maxTargets <= 0)) {
    throw new Error("Global assist spirit skill target count is invalid: " + safeSkillId + " Lv." + safeLevel);
  }
  var chargeMax = GLOBAL_SKILL_CHARGE_MAX_BY_LEVEL[safeLevel - 1];
  if (!Number.isInteger(chargeMax) || chargeMax <= 0) {
    throw new Error("Global assist spirit skill charge max is invalid: Lv." + safeLevel);
  }
  return {
    skillId: safeSkillId,
    level: safeLevel,
    maxTargets: maxTargets,
    chargeMax: chargeMax
  };
}

function getGlobalSkillChargeMax(level) {
  var safeLevel = requireLevel(level);
  var chargeMax = GLOBAL_SKILL_CHARGE_MAX_BY_LEVEL[safeLevel - 1];
  if (!Number.isInteger(chargeMax) || chargeMax <= 0) {
    throw new Error("Global assist spirit skill charge max is invalid: Lv." + safeLevel);
  }
  return chargeMax;
}

function formatGlobalSkillTarget(maxTargets, unit) {
  if (maxTargets === null) {
    return "全部";
  }
  return maxTargets + unit;
}

function formatGlobalSkillTargetLimit(maxTargets, unit) {
  if (maxTargets === null) {
    return "全部" + unit;
  }
  return "最多" + maxTargets + unit;
}

function getAbilityLevelPresentation(spiritId, level) {
  var spirit = requireSpiritId(spiritId);
  var safeLevel = requireLevel(level);
  if (spirit.abilityType === "none") {
    return {
      description: "不触发特殊能力；\n只执行普通递球流程。",
      summary: "普通递球",
      statLabel: "当前效果",
      statValue: "普通递球",
      detail: "普通递球\n无特殊技能"
    };
  }
  if (spirit.abilityType === "produced_ball") {
    var probability = getProbability(spirit.id, safeLevel);
    return {
      description: "递球时有" + probability + "%概率\n将当前球替换为炸弹球。",
      summary: probability + "%概率",
      statLabel: "当前概率",
      statValue: probability + "%",
      detail: "炸弹球概率" + probability + "%\n递球时替换当前球"
    };
  }
  if (spirit.id === "yumi") {
    var yumiChargeMax = getGlobalSkillChargeMax(safeLevel);
    return {
      description: "按藤蔓、融雪、闪电、龙卷风优先级；\n按本级强度释放当前合法技能，充能需" + yumiChargeMax + "球。",
      summary: "充能" + yumiChargeMax + "球",
      statLabel: "当前充能",
      statValue: yumiChargeMax + "球",
      detail: "按优先级释放技能\n充能需" + yumiChargeMax + "球"
    };
  }
  var runtimeConfig = getGlobalSkillRuntimeConfig(spirit.globalSkillId, safeLevel);
  var targetText;
  var description;
  var detail;
  var statLabel;
  var statValue;
  if (runtimeConfig.skillId === "tornado") {
    targetText = formatGlobalSkillTarget(runtimeConfig.maxTargets, "球");
    description = "随机路径卷过棋盘，按距离消除" + formatGlobalSkillTargetLimit(runtimeConfig.maxTargets, "球") + "；\n充能需消除" + runtimeConfig.chargeMax + "个普通球。";
    detail = "最多消除" + targetText + "\n充能需" + runtimeConfig.chargeMax + "球";
    statLabel = "当前消除";
    statValue = targetText;
  } else if (runtimeConfig.skillId === "release_vines") {
    targetText = formatGlobalSkillTarget(runtimeConfig.maxTargets, "处藤蔓");
    description = runtimeConfig.maxTargets === null
      ? "解除全部藤蔓束缚；\n解除后重算顶部支撑，充能需" + runtimeConfig.chargeMax + "球。"
      : "解除最多" + targetText + "束缚；\n解除后重算顶部支撑，充能需" + runtimeConfig.chargeMax + "球。";
    detail = runtimeConfig.maxTargets === null
      ? "解除全部藤蔓\n充能需" + runtimeConfig.chargeMax + "球"
      : "最多解除" + targetText + "\n充能需" + runtimeConfig.chargeMax + "球";
    statLabel = "当前解除";
    statValue = runtimeConfig.maxTargets === null ? "全部" : runtimeConfig.maxTargets + "处";
  } else if (runtimeConfig.skillId === "permanent_thaw") {
    targetText = formatGlobalSkillTarget(runtimeConfig.maxTargets, "个冰晶");
    description = runtimeConfig.maxTargets === null
      ? "永久融化全部冰晶，露出内部普通球；\n充能需消除" + runtimeConfig.chargeMax + "个普通球。"
      : "永久融化最多" + targetText + "，露出内部普通球；\n充能需消除" + runtimeConfig.chargeMax + "个普通球。";
    detail = runtimeConfig.maxTargets === null
      ? "永久融化全部冰晶\n充能需" + runtimeConfig.chargeMax + "球"
      : "永久融化" + targetText + "\n充能需" + runtimeConfig.chargeMax + "球";
    statLabel = "当前融化";
    statValue = runtimeConfig.maxTargets === null ? "全部" : runtimeConfig.maxTargets + "个";
  } else if (runtimeConfig.skillId === "lightning_chain") {
    targetText = formatGlobalSkillTarget(runtimeConfig.maxTargets, "个目标");
    description = "闪电链" + formatGlobalSkillTargetLimit(runtimeConfig.maxTargets, "个目标") + "；\n充能需消除" + runtimeConfig.chargeMax + "个普通球。";
    detail = "最多命中" + targetText + "\n充能需" + runtimeConfig.chargeMax + "球";
    statLabel = "当前命中";
    statValue = runtimeConfig.maxTargets + "个";
  } else {
    throw new Error("Unsupported global assist spirit presentation skill: " + runtimeConfig.skillId);
  }
  return {
    description: description,
    summary: targetText + " / " + runtimeConfig.chargeMax + "充能",
    statLabel: statLabel,
    statValue: statValue,
    detail: detail
  };
}

function getAbilityRuntimeConfig(spiritId) {
  var spirit = requireSpiritId(spiritId);
  var supportedTypes = ["none", "produced_ball", "global_skill"];
  if (supportedTypes.indexOf(spirit.abilityType) < 0) {
    throw new Error("Assist spirit abilityType is invalid: " + spirit.id);
  }

  var hasProducedBallType = Object.prototype.hasOwnProperty.call(spirit, "producedBallType");
  if (spirit.abilityType === "produced_ball") {
    if (typeof spirit.producedBallType !== "string" || !spirit.producedBallType) {
      throw new Error("Produced-ball assist spirit requires producedBallType: " + spirit.id);
    }
    if (spirit.usesProbability !== true) {
      throw new Error("Produced-ball assist spirit must use probability: " + spirit.id);
    }
  } else if (hasProducedBallType) {
    throw new Error("Non-produced-ball assist spirit cannot configure producedBallType: " + spirit.id);
  }

  if (spirit.abilityType === "none" && spirit.usesProbability !== false) {
    throw new Error("None ability assist spirit cannot use probability: " + spirit.id);
  }
  if (spirit.abilityType === "global_skill") {
    if (spirit.usesProbability !== false) {
      throw new Error("Global-skill assist spirit cannot use probability: " + spirit.id);
    }
    if (typeof spirit.globalSkillId !== "string" || !spirit.globalSkillId) {
      throw new Error("Global-skill assist spirit requires globalSkillId: " + spirit.id);
    }
    if (spirit.id !== "yumi") {
      getGlobalSkillRuntimeConfig(spirit.globalSkillId, 1);
    }
  }

  return {
    spiritId: spirit.id,
    abilityType: spirit.abilityType,
    producedBallType: spirit.abilityType === "produced_ball" ? spirit.producedBallType : null
  };
}

function getLevelUpFragmentCost(level) {
  var safeLevel = requireLevel(level);
  if (safeLevel === MAX_LEVEL) {
    return null;
  }
  var cost = LEVEL_UP_FRAGMENT_COSTS[safeLevel - 1];
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("Assist spirit level-up fragment cost is invalid: Lv." + safeLevel);
  }
  return cost;
}

function getAllSpritePaths() {
  var pathMap = {};
  SPIRITS.forEach(function (spirit) {
    [
      spirit.rolePath,
      spirit.avatarPath,
      spirit.framePath,
      spirit.fragmentIconPath,
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
  NOT_UNLOCKED_TIP: NOT_UNLOCKED_TIP,
  MAX_LEVEL: MAX_LEVEL,
  getCatalog: function () {
    return clone(SPIRITS);
  },
  getSpirit: function (spiritId) {
    return clone(requireSpiritId(spiritId));
  },
  getAbilityRuntimeConfig: getAbilityRuntimeConfig,
  getGlobalSkillRuntimeConfig: getGlobalSkillRuntimeConfig,
  getGlobalSkillChargeMax: getGlobalSkillChargeMax,
  getAbilityLevelPresentation: getAbilityLevelPresentation,
  getProbability: getProbability,
  getLevelUpFragmentCost: getLevelUpFragmentCost,
  getAllSpritePaths: getAllSpritePaths
};
