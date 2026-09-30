"use strict";

var AssistSpiritRescueConfig = require("../assets/scripts/config/AssistSpiritRescueConfig");
var Catalog = require("./level-combination-catalog");

var PROFILES = Object.freeze({
  stone: Object.freeze({ introductionLevel: 10, complexity: 1 }),
  ice: Object.freeze({ introductionLevel: 16, complexity: 1 }),
  rainbow: Object.freeze({ introductionLevel: 12, complexity: 1 }),
  blast: Object.freeze({ introductionLevel: 14, complexity: 1 }),
  molotov: Object.freeze({ introductionLevel: 41, complexity: 2 }),
  splitter: Object.freeze({ introductionLevel: 61, complexity: 2 }),
  swirl: Object.freeze({ introductionLevel: 21, complexity: 2 }),
  vine_spirit: Object.freeze({ introductionLevel: 31, complexity: 2 }),
  wormhole: Object.freeze({ introductionLevel: 53, complexity: 3 }),
  lock_chain: Object.freeze({ introductionLevel: 81, complexity: 3 }),
  black_hole: Object.freeze({ introductionLevel: 301, complexity: 2 }),
  poison_attachment: Object.freeze({ introductionLevel: 311, complexity: 2 }),
  spirit_cocoon: Object.freeze({ introductionLevel: 321, complexity: 2 }),
  ice_crystal_attachment: Object.freeze({ introductionLevel: 331, complexity: 2 }),
  transparent_ball: Object.freeze({ introductionLevel: 341, complexity: 2 }),
  breeder: Object.freeze({ introductionLevel: 351, complexity: 2 }),
  bubble_shield_attachment: Object.freeze({ introductionLevel: 361, complexity: 2 }),
  mine: Object.freeze({ introductionLevel: 371, complexity: 3 }),
  bud: Object.freeze({ introductionLevel: 381, complexity: 2 }),
  multi_rescue: Object.freeze({ introductionLevel: 401, complexity: 3 }),
  color_cloud: Object.freeze({ introductionLevel: 411, complexity: 2 }),
  spider: Object.freeze({ introductionLevel: 421, complexity: 3 }),
  wind_tunnel: Object.freeze({ introductionLevel: 431, complexity: 3 }),
  rainbow_prism: Object.freeze({ introductionLevel: 441, complexity: 2 }),
  board_occlusion: Object.freeze({ introductionLevel: 31, complexity: 2 }),
  timed_mode: Object.freeze({ introductionLevel: 10, complexity: 3 }),
  single_rescue: Object.freeze({ introductionLevel: 25, complexity: 3 })
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getProfile(mechanismId) {
  if (!hasOwn(PROFILES, mechanismId)) {
    throw new Error("Missing deployment profile for mechanism: " + mechanismId + ".");
  }
  return PROFILES[mechanismId];
}

function containsMechanism(combination, mechanismId) {
  return combination.mechanisms.some(function (mechanism) {
    return mechanism.id === mechanismId;
  });
}

function isExcludedNormalCampaignLevel(levelId) {
  return levelId % 10 === 0 || AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.indexOf(levelId) >= 0;
}

function nextNormalCampaignLevel(levelId) {
  for (var candidate = levelId; candidate <= 1000; candidate += 1) {
    if (!isExcludedNormalCampaignLevel(candidate)) {
      return candidate;
    }
  }
  throw new Error("No normal campaign level exists at or after " + levelId + ".");
}

function nextTimedLevel(levelId) {
  var candidate = Math.ceil(levelId / 10) * 10;
  if (candidate <= 0 || candidate > 1000) {
    throw new Error("No timed campaign level exists at or after " + levelId + ".");
  }
  return candidate;
}

function nextSingleRescueLevel(levelId) {
  for (var index = 0; index < AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.length; index += 1) {
    var candidate = AssistSpiritRescueConfig.RESCUE_LEVEL_IDS[index];
    if (candidate >= levelId) {
      return candidate;
    }
  }
  throw new Error("No single-rescue campaign level exists at or after " + levelId + ".");
}

function combinationReadyLevel(mechanism, mechanismCount) {
  var profile = getProfile(mechanism.id);
  if (mechanismCount === 1) {
    return profile.introductionLevel;
  }
  if (mechanism.group === Catalog.GROUP_NEW) {
    return profile.introductionLevel + 10;
  }
  if (mechanism.group === Catalog.GROUP_BASE) {
    return profile.introductionLevel + 5;
  }
  return profile.introductionLevel;
}

function resolveFirstAllowedLevel(combination) {
  var minimumLevel = combination.mechanisms.reduce(function (maximum, mechanism) {
    return Math.max(maximum, combinationReadyLevel(mechanism, combination.mechanisms.length));
  }, 1);
  if (containsMechanism(combination, "timed_mode")) {
    return nextTimedLevel(minimumLevel);
  }
  if (containsMechanism(combination, "single_rescue")) {
    return nextSingleRescueLevel(minimumLevel);
  }
  return nextNormalCampaignLevel(minimumLevel);
}

function resolveComplexityScore(combination) {
  var mechanismScore = combination.mechanisms.reduce(function (total, mechanism) {
    return total + getProfile(mechanism.id).complexity;
  }, 0);
  return mechanismScore + (combination.mechanisms.length === 2 ? 1 : 0);
}

function resolveTier(combination, complexityScore) {
  var fixedSchedule = combination.mechanisms.some(function (mechanism) {
    return mechanism.group === Catalog.GROUP_MODE || mechanism.id === "multi_rescue";
  });
  if (fixedSchedule) {
    return Object.freeze({ id: "F", label: "固定/系统排期", weight: 0 });
  }
  if (combination.mechanisms.length === 1) {
    if (complexityScore <= 2) {
      return Object.freeze({ id: "T1", label: "常规投放", weight: complexityScore === 1 ? 10 : 8 });
    }
    return Object.freeze({ id: "T2", label: "进阶投放", weight: 5 });
  }
  if (complexityScore <= 3) {
    return Object.freeze({ id: "T1", label: "常规组合", weight: 6 });
  }
  if (complexityScore <= 5) {
    return Object.freeze({ id: "T2", label: "进阶组合", weight: 3 });
  }
  return Object.freeze({ id: "T3", label: "考核组合", weight: 1 });
}

function complexityLabel(complexityScore) {
  if (complexityScore <= 2) {
    return "低";
  }
  if (complexityScore <= 5) {
    return "中";
  }
  return "高";
}

function resolvePhase(combination, tier) {
  if (containsMechanism(combination, "timed_mode")) {
    return combination.mechanisms.length === 1 ? "每10关固定限时" : "限时关搭档轮换";
  }
  if (containsMechanism(combination, "single_rescue")) {
    return combination.mechanisms.length === 1 ? "章节固定单救援" : "单救援白名单轮换";
  }
  if (containsMechanism(combination, "multi_rescue")) {
    return combination.mechanisms.length === 1 ? "多救援教学/复习/复现" : "多救援后期组合";
  }
  if (containsMechanism(combination, "board_occlusion")) {
    return combination.mechanisms.length === 1 ? "遮挡覆盖策略" : "机制熟悉后的遮挡组合";
  }
  if (combination.mechanisms.length === 1) {
    return "教学/4-6关复习/长期复现";
  }
  if (tier.id === "T3") {
    return "至少完成3次单机制体验后的考核";
  }
  return tier.id === "T1" ? "首次组合/长期复现" : "进阶组合/长期复现";
}

function resolveLongTermMinimumGap(combination) {
  if (containsMechanism(combination, "timed_mode")) {
    return combination.mechanisms.length === 1 ? 10 : 50;
  }
  if (containsMechanism(combination, "single_rescue")) {
    return combination.mechanisms.length === 1 ? 13 : 100;
  }
  if (containsMechanism(combination, "board_occlusion")) {
    return combination.mechanisms.length === 1 ? 1 : 50;
  }
  return combination.mechanisms.length === 1 ? 50 : 100;
}

function resolveRecurrencePolicy(combination) {
  if (containsMechanism(combination, "timed_mode")) {
    return "限时模式每10关；同一搭档至少间隔50关";
  }
  if (containsMechanism(combination, "single_rescue")) {
    return "按章节固定救援关；同一搭档至少间隔100关";
  }
  if (containsMechanism(combination, "board_occlusion")) {
    return "按31关后遮挡覆盖策略；同一组合至少间隔50关";
  }
  if (combination.mechanisms.length === 1) {
    return "教学后4-6关复习；长期每50-80关，目标60关";
  }
  return "首次教学后10-15关组合；同一精确组合至少间隔100关";
}

function resolveRestriction(combination, tier) {
  if (tier.id === "F") {
    return "权重为0，不进入普通随机池，必须由对应模式或系统策略显式排期。";
  }
  if (tier.id === "T3") {
    return "只用于后期考核；不得同时收紧发射数、提高数量和增加遮挡。";
  }
  if (combination.balls.length === 3) {
    return "已达到3种特殊球上限，只能在两种机制均已完成教学后投放。";
  }
  return combination.mechanisms.length === 1
    ? "首次教学只改变一种难度维度，复习时再增加数量或布局复杂度。"
    : "组合关只增加机制交互，不同时大幅减少发射数。";
}

function getRecommendation(combination) {
  var complexityScore = resolveComplexityScore(combination);
  var tier = resolveTier(combination, complexityScore);
  return Object.freeze({
    complexityScore: complexityScore,
    complexityLabel: complexityLabel(complexityScore),
    tierId: tier.id,
    tierLabel: tier.label,
    weight: tier.weight,
    firstAllowedLevel: resolveFirstAllowedLevel(combination),
    phase: resolvePhase(combination, tier),
    longTermMinimumGap: resolveLongTermMinimumGap(combination),
    recurrencePolicy: resolveRecurrencePolicy(combination),
    restriction: resolveRestriction(combination, tier)
  });
}

function validateProfiles() {
  var profileIds = Object.keys(PROFILES);
  if (profileIds.length !== Catalog.MECHANISMS.length) {
    throw new Error(
      "Deployment profile count must equal mechanism count: " + profileIds.length +
      " !== " + Catalog.MECHANISMS.length + "."
    );
  }
  Catalog.MECHANISMS.forEach(function (mechanism) {
    var profile = getProfile(mechanism.id);
    if (!Number.isInteger(profile.introductionLevel) || profile.introductionLevel < 1 || profile.introductionLevel > 1000) {
      throw new Error("Invalid introduction level for " + mechanism.id + ": " + profile.introductionLevel + ".");
    }
    if (!Number.isInteger(profile.complexity) || profile.complexity < 1 || profile.complexity > 3) {
      throw new Error("Invalid complexity for " + mechanism.id + ": " + profile.complexity + ".");
    }
  });
  profileIds.forEach(function (mechanismId) {
    Catalog.getMechanism(mechanismId);
  });
}

validateProfiles();

module.exports = Object.freeze({
  PROFILES: PROFILES,
  getProfile: getProfile,
  getRecommendation: getRecommendation
});
