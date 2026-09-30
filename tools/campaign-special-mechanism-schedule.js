"use strict";

var AssistSpiritRescueConfig = require("../assets/scripts/config/AssistSpiritRescueConfig");

var TARGET_LEVEL_COUNT = 1000;
var REVIEW_OFFSET_MIN = 4;
var REVIEW_OFFSET_TARGET = 5;
var REVIEW_OFFSET_MAX = 6;
var COMBINATION_OFFSET_MIN = 10;
var COMBINATION_OFFSET_TARGET = 12;
var COMBINATION_OFFSET_MAX = 15;
var RECURRENCE_INTERVAL_MIN = 25;
var RECURRENCE_INTERVAL_TARGET = 30;
var RECURRENCE_INTERVAL_MAX = 40;
var INTRODUCTIONS = Object.freeze([
  Object.freeze({ key: "blackHole", column: "黑洞", firstLevel: 301, count: 1, label: "黑洞" }),
  Object.freeze({ key: "poisonAttachment", column: "毒液附着", firstLevel: 311, count: 3, label: "毒液附着" }),
  Object.freeze({ key: "spiritCocoon", column: "精灵茧", firstLevel: 321, count: 1, label: "精灵茧" }),
  Object.freeze({ key: "iceCrystalAttachment", column: "冰凌附着", firstLevel: 331, count: 3, label: "冰凌附着" }),
  Object.freeze({ key: "transparentBall", column: "透明球", firstLevel: 341, count: 1, label: "透明球" }),
  Object.freeze({ key: "breeder", column: "繁殖球", firstLevel: 351, count: 1, label: "繁殖球" }),
  Object.freeze({ key: "bubbleShieldAttachment", column: "气泡护盾附着", firstLevel: 361, count: 3, label: "气泡护盾" }),
  Object.freeze({ key: "mine", column: "地雷", firstLevel: 371, count: 1, label: "地雷" }),
  Object.freeze({ key: "bud", column: "花苞球", firstLevel: 381, count: 1, label: "花苞球" }),
  Object.freeze({ key: "multiRescueTargets", column: "多精灵救援目标", firstLevel: 401, count: 2, label: "多精灵救援" }),
  Object.freeze({ key: "colorCloud", column: "彩云", firstLevel: 411, count: 1, label: "彩云" }),
  Object.freeze({ key: "spider", column: "蜘蛛", firstLevel: 421, count: 2, label: "蜘蛛" }),
  Object.freeze({ key: "windTunnelExit", column: "风眼出口", firstLevel: 431, count: 3, label: "风眼" }),
  Object.freeze({ key: "rainbowPrism", column: "彩虹棱镜球", firstLevel: 441, count: 1, label: "彩虹棱镜球" })
]);
var DISABLED_CAMPAIGN_MECHANISMS = Object.freeze([
  Object.freeze({ key: "crystalGun", column: "晶光炮", label: "晶光炮" })
]);

var ADDITIONAL_TABLE_COLUMNS = Object.freeze([
  "漩涡球", "藤蔓精灵", "虫洞对",
  "黑洞", "地雷", "繁殖球", "花苞球", "精灵茧", "透明球", "晶光炮", "风眼出口",
  "毒液附着", "冰凌附着", "气泡护盾附着", "蜘蛛", "彩云", "多精灵救援目标", "彩虹棱镜球",
  "关卡类型", "玩法模式", "单精灵救援", "限时球", "棋盘遮挡"
]);

function assertLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId <= 0 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Special mechanism schedule requires levelId in [1, 1000]: " + levelId);
  }
}

function isExcludedCampaignModeLevel(levelId) {
  return levelId % 10 === 0 || AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.indexOf(levelId) >= 0;
}

function findNearestEligibleLevel(rangeStart, rangeEnd, targetLevel, occupiedLevels, label) {
  if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || !Number.isInteger(targetLevel) ||
      rangeStart <= 0 || rangeStart > rangeEnd || targetLevel < rangeStart || targetLevel > rangeEnd) {
    throw new Error("Invalid " + label + " schedule range: " + rangeStart + "-" + rangeEnd + " target=" + targetLevel + ".");
  }
  var maxDistance = Math.max(targetLevel - rangeStart, rangeEnd - targetLevel);
  for (var distance = 0; distance <= maxDistance; distance += 1) {
    var candidates = distance === 0
      ? [targetLevel]
      : [targetLevel - distance, targetLevel + distance];
    for (var index = 0; index < candidates.length; index += 1) {
      var levelId = candidates[index];
      if (levelId >= rangeStart && levelId <= rangeEnd && !isExcludedCampaignModeLevel(levelId) &&
          !Object.prototype.hasOwnProperty.call(occupiedLevels, levelId)) {
        return levelId;
      }
    }
  }
  throw new Error("No eligible " + label + " level exists in range " + rangeStart + "-" + rangeEnd + ".");
}

function hasEligibleLevel(rangeStart, rangeEnd, occupiedLevels) {
  for (var levelId = rangeStart; levelId <= rangeEnd; levelId += 1) {
    if (!isExcludedCampaignModeLevel(levelId) &&
        !Object.prototype.hasOwnProperty.call(occupiedLevels, levelId)) {
      return true;
    }
  }
  return false;
}

function reserveScheduleLevel(entriesByKey, occupiedLevels, definition, levelId, stage) {
  if (isExcludedCampaignModeLevel(levelId)) {
    throw new Error(definition.label + " " + stage + " level overlaps an excluded campaign mode: " + levelId + ".");
  }
  if (Object.prototype.hasOwnProperty.call(occupiedLevels, levelId)) {
    throw new Error(
      definition.label + " " + stage + " level " + levelId +
      " overlaps " + occupiedLevels[levelId] + "."
    );
  }
  entriesByKey[definition.key].push({ levelId: levelId, stage: stage });
  occupiedLevels[levelId] = definition.label + " " + stage;
}

function buildScheduleEntriesByKey() {
  var entriesByKey = {};
  var occupiedLevels = {};
  INTRODUCTIONS.forEach(function (definition) {
    if (Object.prototype.hasOwnProperty.call(entriesByKey, definition.key)) {
      throw new Error("Duplicated special mechanism schedule key: " + definition.key + ".");
    }
    entriesByKey[definition.key] = [];
  });
  INTRODUCTIONS.forEach(function (definition) {
    reserveScheduleLevel(entriesByKey, occupiedLevels, definition, definition.firstLevel, "teaching");
  });
  INTRODUCTIONS.forEach(function (definition) {
    var reviewLevel = findNearestEligibleLevel(
      definition.firstLevel + REVIEW_OFFSET_MIN,
      definition.firstLevel + REVIEW_OFFSET_MAX,
      definition.firstLevel + REVIEW_OFFSET_TARGET,
      occupiedLevels,
      definition.label + " review"
    );
    reserveScheduleLevel(entriesByKey, occupiedLevels, definition, reviewLevel, "review");
  });
  INTRODUCTIONS.forEach(function (definition) {
    var combinationLevel = findNearestEligibleLevel(
      definition.firstLevel + COMBINATION_OFFSET_MIN,
      definition.firstLevel + COMBINATION_OFFSET_MAX,
      definition.firstLevel + COMBINATION_OFFSET_TARGET,
      occupiedLevels,
      definition.label + " combination"
    );
    reserveScheduleLevel(entriesByKey, occupiedLevels, definition, combinationLevel, "combination");
  });

  while (true) {
    var candidates = INTRODUCTIONS.map(function (definition) {
      var entries = entriesByKey[definition.key];
      var previousLevel = entries[entries.length - 1].levelId;
      return {
        definition: definition,
        previousLevel: previousLevel,
        targetLevel: previousLevel + RECURRENCE_INTERVAL_TARGET
      };
    }).filter(function (candidate) {
      var rangeStart = candidate.previousLevel + RECURRENCE_INTERVAL_MIN;
      var rangeEnd = Math.min(candidate.previousLevel + RECURRENCE_INTERVAL_MAX, TARGET_LEVEL_COUNT);
      return rangeStart <= TARGET_LEVEL_COUNT && hasEligibleLevel(rangeStart, rangeEnd, occupiedLevels);
    });
    if (candidates.length === 0) {
      break;
    }
    candidates.sort(function (left, right) {
      return left.targetLevel - right.targetLevel ||
        left.definition.firstLevel - right.definition.firstLevel;
    });
    var candidate = candidates[0];
    var rangeEnd = Math.min(candidate.previousLevel + RECURRENCE_INTERVAL_MAX, TARGET_LEVEL_COUNT);
    var targetLevel = Math.min(candidate.targetLevel, rangeEnd);
    var recurrenceLevel = findNearestEligibleLevel(
      candidate.previousLevel + RECURRENCE_INTERVAL_MIN,
      rangeEnd,
      targetLevel,
      occupiedLevels,
      candidate.definition.label + " recurrence"
    );
    reserveScheduleLevel(entriesByKey, occupiedLevels, candidate.definition, recurrenceLevel, "recurrence");
  }

  Object.keys(entriesByKey).forEach(function (key) {
    entriesByKey[key] = Object.freeze(entriesByKey[key].map(function (entry) {
      return Object.freeze(entry);
    }));
  });
  return Object.freeze(entriesByKey);
}

var SCHEDULE_ENTRIES_BY_KEY = buildScheduleEntriesByKey();

function getScheduledEntries(definition) {
  if (!definition || typeof definition.key !== "string" ||
      !Object.prototype.hasOwnProperty.call(SCHEDULE_ENTRIES_BY_KEY, definition.key)) {
    throw new Error("Unknown special mechanism schedule definition.");
  }
  return SCHEDULE_ENTRIES_BY_KEY[definition.key];
}

function getPlan(levelId) {
  assertLevelId(levelId);
  var plan = {};
  DISABLED_CAMPAIGN_MECHANISMS.forEach(function (definition) {
    plan[definition.key] = 0;
  });
  INTRODUCTIONS.forEach(function (definition) {
    var scheduled = getScheduledEntries(definition).some(function (entry) {
      return entry.levelId === levelId;
    });
    plan[definition.key] = scheduled ? definition.count : 0;
  });
  return plan;
}

function getScheduledLevelIds(definition) {
  return getScheduledEntries(definition).map(function (entry) { return entry.levelId; });
}

INTRODUCTIONS.forEach(function (definition) {
  var entries = getScheduledEntries(definition);
  entries.forEach(function (entry, index) {
    if (isExcludedCampaignModeLevel(entry.levelId)) {
      throw new Error(definition.label + " schedule overlaps an excluded campaign mode at " + entry.levelId + ".");
    }
    if (index > 0 && entry.levelId <= entries[index - 1].levelId) {
      throw new Error(definition.label + " schedule is not strictly increasing at " + entry.levelId + ".");
    }
    if (entry.stage === "recurrence") {
      var interval = entry.levelId - entries[index - 1].levelId;
      if (interval < RECURRENCE_INTERVAL_MIN || interval > RECURRENCE_INTERVAL_MAX) {
        throw new Error(
          definition.label + " recurrence interval is outside the " +
          RECURRENCE_INTERVAL_MIN + "-" + RECURRENCE_INTERVAL_MAX +
          " level standard at " + entry.levelId + "."
        );
      }
    }
  });
});

module.exports = Object.freeze({
  TARGET_LEVEL_COUNT: TARGET_LEVEL_COUNT,
  REVIEW_OFFSET_MIN: REVIEW_OFFSET_MIN,
  REVIEW_OFFSET_TARGET: REVIEW_OFFSET_TARGET,
  REVIEW_OFFSET_MAX: REVIEW_OFFSET_MAX,
  COMBINATION_OFFSET_MIN: COMBINATION_OFFSET_MIN,
  COMBINATION_OFFSET_TARGET: COMBINATION_OFFSET_TARGET,
  COMBINATION_OFFSET_MAX: COMBINATION_OFFSET_MAX,
  RECURRENCE_INTERVAL_MIN: RECURRENCE_INTERVAL_MIN,
  RECURRENCE_INTERVAL_TARGET: RECURRENCE_INTERVAL_TARGET,
  RECURRENCE_INTERVAL_MAX: RECURRENCE_INTERVAL_MAX,
  INTRODUCTIONS: INTRODUCTIONS,
  DISABLED_CAMPAIGN_MECHANISMS: DISABLED_CAMPAIGN_MECHANISMS,
  ADDITIONAL_TABLE_COLUMNS: ADDITIONAL_TABLE_COLUMNS,
  getPlan: getPlan,
  getScheduledEntries: getScheduledEntries,
  getScheduledLevelIds: getScheduledLevelIds
});
