"use strict";

var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");
var AimTuningProfiles = require("./AimTuningProfiles");
var BoardLayout = require("./BoardLayout");

var SPECIAL_ENTITY_TYPES = {
  skill_ball: ["rainbow", "blast"],
  obstacle_ball: ["stone", "ice"]
};
var ALLOWED_COLORS = ["R", "G", "B", "Y", "P"];
var ALLOWED_INNER_COLORS = ALLOWED_COLORS.slice();
var ALLOWED_CLEAR_REWARD_ITEM_IDS = ["coin", "stamina"];
var COLLECTION_OBJECTIVE_TYPES = {
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true
};
var WIN_CONDITION_TYPES = {
  clear_all: true,
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true
};
var BONUS_OBJECTIVE_TYPES = {
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true,
  collect_same_color_bonus_hits: true,
  clear_with_shots_remaining: true,
  single_turn_drop_count: true
};
var LEVEL_TYPES = {
  normal: true,
  special_floating_island: true
};
var PLAY_MODES = {
  shot_limited: true,
  timed_infinite_shots: true
};
var AD_RUN_POWERUP_TYPES = {
  three_line_elimination: true,
  plus_three_balls: true
};
var MIN_INITIAL_DROP_SPACE_ROWS = 8;
var MAX_JAR_COUNT = 4;
var CLEAR_REWARD_START_LEVEL_ID = 5;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertPositiveInteger(value, fieldName, levelKey) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer: " + levelKey);
  }
  return value;
}

function assertNumberInRange(value, fieldName, min, max, levelKey) {
  if (typeof value !== "number" || value < min || value > max) {
    throw new Error(fieldName + " must be in [" + min + ", " + max + "]: " + levelKey);
  }
  return value;
}

function validateRowString(rowIndex, rowString, levelColors, levelKey) {
  if (typeof rowString !== "string") {
    throw new Error("level.layout row must be a string at index " + rowIndex + ": " + levelKey);
  }

  var expectedColumns = BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
  if (rowString.length > expectedColumns) {
    throw new Error("level.layout row length invalid at index " + rowIndex + ": expected at most " + expectedColumns + ", got " + rowString.length + ": " + levelKey);
  }

  rowString.split("").forEach(function (cellCode, colIndex) {
    if (cellCode !== "." && levelColors.indexOf(cellCode) === -1) {
      throw new Error("level.layout contains invalid code `" + cellCode + "` at " + rowIndex + ":" + colIndex + ": " + levelKey);
    }
  });

  if (rowString.length < expectedColumns) {
    return rowString + ".".repeat(expectedColumns - rowString.length);
  }

  return rowString;
}

function normalizeLayoutRows(layout, levelColors, levelKey) {
  if (!Array.isArray(layout) || layout.length === 0) {
    throw new Error("Level layout must be a non-empty array: " + levelKey);
  }

  return layout.map(function (rowString, rowIndex) {
    return validateRowString(rowIndex, rowString, levelColors, levelKey);
  });
}

function validateEntityType(category, entityType) {
  if (!Object.prototype.hasOwnProperty.call(SPECIAL_ENTITY_TYPES, category)) {
    return false;
  }
  return SPECIAL_ENTITY_TYPES[category].indexOf(entityType) !== -1;
}

function hasUniqueItems(items) {
  return new Set(items).size === items.length;
}

function resolveExpectedLevelId(levelKey) {
  if (typeof levelKey !== "string") {
    throw new Error("levelKey must be a string.");
  }
  var match = levelKey.match(/^level_(\d{3})$/);
  if (!match) {
    throw new Error("levelKey must match level_###: " + levelKey);
  }
  return Number(match[1]);
}

function resolveShotLimit(levelConfig, levelKey) {
  return assertPositiveInteger(levelConfig.shotLimit, "level.shotLimit", levelKey);
}

function normalizeClearRewardItems(levelConfig, levelId, levelKey) {
  var rewardItems = levelConfig.clearRewardItems;
  if (levelId < CLEAR_REWARD_START_LEVEL_ID) {
    if (rewardItems !== undefined) {
      throw new Error("level.clearRewardItems must not be configured before level " + CLEAR_REWARD_START_LEVEL_ID + ": " + levelKey);
    }
    return undefined;
  }

  if (!Array.isArray(rewardItems) || rewardItems.length === 0) {
    throw new Error("level.clearRewardItems must be a non-empty array: " + levelKey);
  }

  var seenIds = {};
  return rewardItems.map(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("level.clearRewardItems[" + index + "] must be object: " + levelKey);
    }

    var id = typeof item.id === "string" ? item.id.trim() : "";
    if (ALLOWED_CLEAR_REWARD_ITEM_IDS.indexOf(id) === -1) {
      throw new Error("level.clearRewardItems[" + index + "].id must be coin or stamina: " + levelKey);
    }
    if (seenIds[id]) {
      throw new Error("duplicate level.clearRewardItems id `" + id + "`: " + levelKey);
    }
    seenIds[id] = true;

    var count = assertPositiveInteger(item.count, "level.clearRewardItems[" + index + "].count", levelKey);
    if (id === "coin" && (count < 50 || count > 300)) {
      throw new Error("level.clearRewardItems[" + index + "].count for coin must be in [50, 300]: " + levelKey);
    }
    if (id === "stamina" && (count < 1 || count > 3)) {
      throw new Error("level.clearRewardItems[" + index + "].count for stamina must be in [1, 3]: " + levelKey);
    }

    return {
      id: id,
      count: count
    };
  });
}

function normalizeSpecialEntities(levelConfig, levelKey) {
  if (levelConfig.specialEntities == null) {
    return [];
  }

  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be an array: " + levelKey);
  }

  var normalizedLayout = normalizeLayoutRows(levelConfig.layout, levelConfig.colors, levelKey);
  var seenIds = {};
  var seenCoordinates = {};

  return levelConfig.specialEntities.map(function (entity, index) {
    if (!entity || typeof entity !== "object") {
      throw new Error("specialEntities[" + index + "] must be object: " + levelKey);
    }

    var id = typeof entity.id === "string" ? entity.id.trim() : "";
    if (!id) {
      throw new Error("specialEntities[" + index + "].id is required: " + levelKey);
    }
    if (seenIds[id]) {
      throw new Error("duplicate specialEntities id `" + id + "`: " + levelKey);
    }
    seenIds[id] = true;

    var category = entity.entityCategory;
    if (typeof category !== "string" || !SPECIAL_ENTITY_TYPES[category]) {
      throw new Error("specialEntities[" + index + "].entityCategory invalid: " + levelKey);
    }

    var entityType = entity.entityType;
    if (typeof entityType !== "string" || !validateEntityType(category, entityType)) {
      throw new Error("specialEntities[" + index + "].entityType invalid for `" + category + "`: " + levelKey);
    }

    var row = entity.row;
    var col = entity.col;
    if (!Number.isInteger(row) || row < 0 || row >= normalizedLayout.length) {
      throw new Error("specialEntities[" + index + "].row out of layout range: " + levelKey);
    }

    var rowString = normalizedLayout[row];
    if (!Number.isInteger(col) || col < 0 || col >= rowString.length) {
      throw new Error("specialEntities[" + index + "].col out of layout range: " + levelKey);
    }

    var coordinateKey = row + ":" + col;
    if (seenCoordinates[coordinateKey]) {
      throw new Error("duplicate specialEntities cell `" + coordinateKey + "`: " + levelKey);
    }
    seenCoordinates[coordinateKey] = true;

    if (rowString[col] !== ".") {
      throw new Error("special entity must be placed on `.` layout slot at `" + coordinateKey + "`: " + levelKey);
    }

    var innerColor = null;
    if (category === "obstacle_ball" && entityType === "ice") {
      innerColor = typeof entity.innerColor === "string" ? entity.innerColor.trim() : "";
      if (ALLOWED_INNER_COLORS.indexOf(innerColor) === -1) {
        throw new Error("specialEntities[" + index + "].innerColor invalid for ice: " + levelKey);
      }
    }

    return {
      id: id,
      entityCategory: category,
      entityType: entityType,
      row: row,
      col: col,
      innerColor: innerColor
    };
  });
}

function normalizeObjectiveList(objectives, allowedTypes, fieldName, levelConfig, levelKey) {
  if (!Array.isArray(objectives)) {
    throw new Error("level." + fieldName + " must be an array: " + levelKey);
  }

  return objectives.map(function (objective, index) {
    if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
      throw new Error("level." + fieldName + "[" + index + "] must be object: " + levelKey);
    }
    if (typeof objective.type !== "string" || allowedTypes[objective.type] !== true) {
      throw new Error("level." + fieldName + "[" + index + "].type unsupported: " + levelKey);
    }
    var value = assertPositiveInteger(objective.value, "level." + fieldName + "[" + index + "].value", levelKey);
    var normalized = {
      type: objective.type,
      value: value
    };
    if (objective.type === "collect_color") {
      var color = typeof objective.color === "string" ? objective.color : "";
      if (levelConfig.colors.indexOf(color) === -1) {
        throw new Error("level." + fieldName + "[" + index + "].color must exist in level.colors: " + levelKey);
      }
      normalized.color = color;
    }
    if (objective.type === "clear_all" && value !== 1) {
      throw new Error("level." + fieldName + "[" + index + "].value for clear_all must be 1: " + levelKey);
    }
    return normalized;
  });
}

function countCollectableIceSnowballs(levelConfig) {
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be normalized before ice snowball validation.");
  }
  return levelConfig.specialEntities.filter(function (entity) {
    return entity && entity.entityCategory === "obstacle_ball" && entity.entityType === "ice";
  }).length;
}

function validateIceSnowballObjectives(levelConfig, levelKey) {
  if (!Array.isArray(levelConfig.winConditions) || !Array.isArray(levelConfig.bonusObjectives)) {
    throw new Error("level objectives must be normalized before ice snowball validation: " + levelKey);
  }
  var objectives = levelConfig.winConditions.concat(levelConfig.bonusObjectives);
  var maxRequired = objectives.reduce(function (max, objective) {
    if (objective && objective.type === "collect_ice_snowball") {
      return Math.max(max, Math.floor(Number(objective.value)));
    }
    return max;
  }, 0);
  if (maxRequired <= 0) {
    return;
  }
  var available = countCollectableIceSnowballs(levelConfig);
  if (available < maxRequired) {
    throw new Error("level collect_ice_snowball target exceeds ice supply: " + levelKey);
  }
}

function normalizeLevelMode(levelConfig, levelKey) {
  if (typeof levelConfig.levelType !== "string") {
    throw new Error("level.levelType is required: " + levelKey);
  }
  if (typeof levelConfig.playMode !== "string") {
    throw new Error("level.playMode is required: " + levelKey);
  }
  var levelType = levelConfig.levelType;
  var playMode = levelConfig.playMode;
  if (LEVEL_TYPES[levelType] !== true) {
    throw new Error("level.levelType unsupported: " + levelKey);
  }
  if (PLAY_MODES[playMode] !== true) {
    throw new Error("level.playMode unsupported: " + levelKey);
  }
  if (levelType === "special_floating_island" && playMode !== "timed_infinite_shots") {
    throw new Error("special_floating_island must use timed_infinite_shots: " + levelKey);
  }
  if (playMode === "timed_infinite_shots") {
    if (levelType !== "special_floating_island") {
      throw new Error("timed_infinite_shots must use special_floating_island: " + levelKey);
    }
    levelConfig.timeLimitSeconds = assertPositiveInteger(levelConfig.timeLimitSeconds, "level.timeLimitSeconds", levelKey);
    if (levelConfig.requiredStarCount !== 1) {
      throw new Error("level.requiredStarCount must be 1 for timed_infinite_shots: " + levelKey);
    }
  } else {
    if (levelConfig.timeLimitSeconds !== undefined) {
      throw new Error("level.timeLimitSeconds must not be configured for shot_limited: " + levelKey);
    }
    if (levelConfig.requiredStarCount !== undefined) {
      throw new Error("level.requiredStarCount must not be configured for shot_limited: " + levelKey);
    }
  }
  levelConfig.levelType = levelType;
  levelConfig.playMode = playMode;
}

function normalizeAdPowerupRules(levelConfig, levelKey) {
  if (levelConfig.adPowerupRules === undefined) {
    throw new Error("level.adPowerupRules is required: " + levelKey);
  }
  var rules = levelConfig.adPowerupRules;
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new Error("level.adPowerupRules must be object: " + levelKey);
  }
  if (!Array.isArray(rules.allowed)) {
    throw new Error("level.adPowerupRules.allowed must be array: " + levelKey);
  }
  if (!rules.maxGrantsPerRun || typeof rules.maxGrantsPerRun !== "object" || Array.isArray(rules.maxGrantsPerRun)) {
    throw new Error("level.adPowerupRules.maxGrantsPerRun must be object: " + levelKey);
  }
  var seen = {};
  rules.allowed.forEach(function (powerupType, index) {
    if (typeof powerupType !== "string" || AD_RUN_POWERUP_TYPES[powerupType] !== true) {
      throw new Error("level.adPowerupRules.allowed[" + index + "] unsupported: " + levelKey);
    }
    if (seen[powerupType]) {
      throw new Error("duplicate ad powerup rule: " + powerupType + ": " + levelKey);
    }
    seen[powerupType] = true;
    assertPositiveInteger(rules.maxGrantsPerRun[powerupType], "level.adPowerupRules.maxGrantsPerRun." + powerupType, levelKey);
    if (levelConfig.playMode === "timed_infinite_shots" && powerupType === "plus_three_balls") {
      throw new Error("timed_infinite_shots cannot allow plus_three_balls: " + levelKey);
    }
  });
  Object.keys(rules.maxGrantsPerRun).forEach(function (powerupType) {
    if (seen[powerupType] !== true) {
      throw new Error("level.adPowerupRules.maxGrantsPerRun contains undeclared powerup: " + levelKey);
    }
  });
}

function validateInitialDropSpaceRows(levelConfig, levelKey) {
  var rows = assertPositiveInteger(levelConfig.initialDropSpaceRows, "level.initialDropSpaceRows", levelKey);
  if (rows < MIN_INITIAL_DROP_SPACE_ROWS) {
    throw new Error("level.initialDropSpaceRows must be >= " + MIN_INITIAL_DROP_SPACE_ROWS + ": " + levelKey);
  }
  levelConfig.initialDropSpaceRows = rows;
}

function normalizeLevelConfig(rawConfig, levelKey) {
  var config = clone(rawConfig);
  var expectedLevelId = resolveExpectedLevelId(levelKey);

  if (config.schemaVersion !== 1) {
    throw new Error("schemaVersion must be 1: " + levelKey);
  }
  if (config.coordinateSystem !== "odd-r-hex") {
    throw new Error("coordinateSystem must be odd-r-hex: " + levelKey);
  }

  if (!config.level) {
    throw new Error("Level config is missing `level`: " + levelKey);
  }
  if (config.level.levelId !== expectedLevelId) {
    throw new Error("level.levelId mismatch: expected " + expectedLevelId + ", got " + config.level.levelId + ": " + levelKey);
  }
  var expectedLevelPrefix = "L" + ("000" + expectedLevelId).slice(-3) + "_";
  if (typeof config.level.code !== "string" || !new RegExp("^" + expectedLevelPrefix).test(config.level.code)) {
    throw new Error("level.code must start with " + expectedLevelPrefix + ": " + levelKey);
  }

  if (!Array.isArray(config.level.colors) || !config.level.colors.length) {
    throw new Error("level.colors must be a non-empty array: " + levelKey);
  }
  if (!hasUniqueItems(config.level.colors)) {
    throw new Error("level.colors must not contain duplicates: " + levelKey);
  }
  config.level.colors.forEach(function (colorCode) {
    if (ALLOWED_COLORS.indexOf(colorCode) === -1) {
      throw new Error("unsupported color in level.colors `" + colorCode + "`: " + levelKey);
    }
  });

  config.level.layout = normalizeLayoutRows(config.level.layout, config.level.colors, levelKey);

  if (!Number.isInteger(config.level.colorCount) || config.level.colorCount !== config.level.colors.length) {
    throw new Error("level.colorCount must equal level.colors.length: " + levelKey);
  }

  normalizeLevelMode(config.level, levelKey);
  if (config.level.playMode === "timed_infinite_shots") {
    if (config.level.shotLimit !== undefined && config.level.shotLimit !== null) {
      throw new Error("level.shotLimit must not be configured for timed_infinite_shots: " + levelKey);
    }
  } else {
    config.level.shotLimit = resolveShotLimit(config.level, levelKey);
  }
  config.level.targetScore = assertPositiveInteger(config.level.targetScore, "level.targetScore", levelKey);
  config.level.dropInterval = assertPositiveInteger(config.level.dropInterval, "level.dropInterval", levelKey);
  var clearRewardItems = normalizeClearRewardItems(config.level, expectedLevelId, levelKey);
  if (clearRewardItems !== undefined) {
    config.level.clearRewardItems = clearRewardItems;
  }

  var jarCount = Number(config.level.jarCount);
  if (!Number.isInteger(jarCount) || jarCount <= 0) {
    throw new Error("level.jarCount must be a positive integer: " + levelKey);
  }
  if (jarCount > MAX_JAR_COUNT) {
    throw new Error("level.jarCount must be <= " + MAX_JAR_COUNT + ": " + levelKey);
  }
  if (!Array.isArray(config.level.jarColors) || config.level.jarColors.length !== jarCount) {
    throw new Error("level.jarColors length must equal jarCount: " + levelKey);
  }
  config.level.jarColors.forEach(function (colorCode) {
    if (ALLOWED_COLORS.indexOf(colorCode) === -1) {
      throw new Error("unsupported color in level.jarColors `" + colorCode + "`: " + levelKey);
    }
  });

  if (!config.level.spawnWeights || typeof config.level.spawnWeights !== "object" || Array.isArray(config.level.spawnWeights)) {
    throw new Error("level.spawnWeights must be an object: " + levelKey);
  }
  config.level.colors.forEach(function (colorCode) {
    if (typeof config.level.spawnWeights[colorCode] !== "number" || config.level.spawnWeights[colorCode] <= 0) {
      throw new Error("level.spawnWeights." + colorCode + " must be > 0: " + levelKey);
    }
  });
  Object.keys(config.level.spawnWeights).forEach(function (colorCode) {
    if (config.level.colors.indexOf(colorCode) === -1) {
      throw new Error("level.spawnWeights contains color not in level.colors `" + colorCode + "`: " + levelKey);
    }
  });

  if (!config.level.jarRules || typeof config.level.jarRules !== "object" || Array.isArray(config.level.jarRules)) {
    throw new Error("level.jarRules must be an object: " + levelKey);
  }
  assertNumberInRange(config.level.jarRules.rimBounce, "level.jarRules.rimBounce", 0.4, 0.95, levelKey);
  assertNumberInRange(config.level.jarRules.collectZoneScale, "level.jarRules.collectZoneScale", 0.7, 1.4, levelKey);
  assertNumberInRange(config.level.jarRules.sameColorBonus, "level.jarRules.sameColorBonus", 1, 3, levelKey);

  config.level.winConditions = normalizeObjectiveList(config.level.winConditions, WIN_CONDITION_TYPES, "winConditions", config.level, levelKey);
  config.level.bonusObjectives = normalizeObjectiveList(config.level.bonusObjectives, BONUS_OBJECTIVE_TYPES, "bonusObjectives", config.level, levelKey);
  config.level.specialEntities = normalizeSpecialEntities(config.level, levelKey);
  validateIceSnowballObjectives(config.level, levelKey);
  normalizeAdPowerupRules(config.level, levelKey);
  validateInitialDropSpaceRows(config.level, levelKey);

  var aimMeta = AimTuningProfiles.applyToLevel(config.level);

  config.meta = {
    resourceKey: levelKey,
    loadedAt: Date.now(),
    aimProfile: aimMeta.profile,
    aimDifficulty: aimMeta.difficulty
  };

  return config;
}

function LevelConfigLoader(resourceRoot) {
  this.resourceRoot = resourceRoot || "config/levels";
}

LevelConfigLoader.prototype.loadLevelByKey = function (levelKey) {
  var resourcePath = this.resourceRoot + "/" + levelKey;

  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(resourcePath, cc.JsonAsset, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load level config `" + resourcePath + "`: " + error.message));
        return;
      }

      try {
        var config = normalizeLevelConfig(asset.json, levelKey);
        Logger.info("Loaded level config", levelKey, config.meta.aimProfile);
        resolve(config);
      } catch (normalizeError) {
        reject(normalizeError);
      }
    });
  });
};

module.exports = LevelConfigLoader;
