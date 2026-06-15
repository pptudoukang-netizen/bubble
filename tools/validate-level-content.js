"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var ALLOWED_COLORS = ["R", "G", "B", "Y", "P"];
var MAX_JAR_COUNT = 4;
var ALLOWED_DIFFICULTY = ["tutorial", "easy", "normal", "hard", "expert", "advanced"];
var ALLOWED_WIN_TYPES = ["clear_all", "collect_any", "collect_color", "collect_ice_snowball"];
var ALLOWED_BONUS_TYPES = [
  "collect_any",
  "collect_color",
  "collect_ice_snowball",
  "collect_same_color_bonus_hits",
  "clear_with_shots_remaining",
  "single_turn_drop_count"
];
var ALLOWED_ENTITY_CATEGORIES = ["skill_ball", "obstacle_ball", "reactive_ball", "locked_ball", "key_ball"];
var ALLOWED_ENTITY_TYPES = {
  skill_ball: ["rainbow", "blast"],
  obstacle_ball: ["stone", "ice"],
  reactive_ball: ["molotov", "splitter"],
  locked_ball: ["locked"],
  key_ball: ["key"]
};
var ALLOWED_CLEAR_REWARD_ITEM_IDS = ["coin", "stamina"];
var AD_RUN_POWERUP_TYPES = ["three_line_elimination", "plus_three_balls"];
var MIN_INITIAL_DROP_SPACE_ROWS = 8;
var MAX_SHOT_LIMIT = 30;
var CLEAR_REWARD_START_LEVEL_ID = 1;
var TOP_BOARD_ROW_INDEX = 0;

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

function getLevelNumber(fileName) {
  var match = fileName.match(/level_(\d+)\.json$/);
  return match ? Number(match[1]) : Number.NaN;
}

function getExpectedRowColumns(rowIndex) {
  return BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
}

function hasUniqueItems(items) {
  return new Set(items).size === items.length;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateObjectives(objectives, objectiveType, level, issues) {
  var allowedTypes = objectiveType === "win" ? ALLOWED_WIN_TYPES : ALLOWED_BONUS_TYPES;
  if (objectives == null) {
    return;
  }

  if (!Array.isArray(objectives)) {
    issues.push(objectiveType + " conditions must be an array");
    return;
  }

  objectives.forEach(function (condition, index) {
    if (!condition || typeof condition !== "object") {
      issues.push(objectiveType + " condition #" + index + " must be object");
      return;
    }

    if (allowedTypes.indexOf(condition.type) === -1) {
      issues.push(objectiveType + " condition #" + index + " has unsupported type: " + condition.type);
      return;
    }

    if (!isPositiveInteger(condition.value)) {
      issues.push(objectiveType + " condition #" + index + " value must be positive integer");
    }

    if (condition.type === "clear_all" && condition.value !== 1) {
      issues.push(objectiveType + " condition #" + index + " clear_all value must be 1");
    }

    if (condition.type === "collect_color") {
      if (typeof condition.color !== "string" || level.colors.indexOf(condition.color) === -1) {
        issues.push(objectiveType + " condition #" + index + " collect_color must use a color from level.colors");
      } else if (!Array.isArray(level.jarColors) || level.jarColors.indexOf(condition.color) === -1) {
        issues.push(objectiveType + " condition #" + index + " collect_color must use a color from level.jarColors");
      }
    }
  });
}

function validateSpecialEntities(level, normalizedLayoutRows, issues) {
  if (level.specialEntities == null) {
    return;
  }

  if (!Array.isArray(level.specialEntities)) {
    issues.push("specialEntities must be array");
    return;
  }

  var seenIds = {};
  var seenCells = {};

  level.specialEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object") {
      issues.push("specialEntities[" + index + "] must be object");
      return;
    }

    if (typeof entity.id !== "string" || !entity.id.trim()) {
      issues.push("specialEntities[" + index + "].id must be non-empty string");
    } else if (seenIds[entity.id]) {
      issues.push("specialEntities[" + index + "] duplicate id: " + entity.id);
    } else {
      seenIds[entity.id] = true;
    }

    if (ALLOWED_ENTITY_CATEGORIES.indexOf(entity.entityCategory) === -1) {
      issues.push("specialEntities[" + index + "].entityCategory invalid: " + entity.entityCategory);
      return;
    }

    var allowedTypes = ALLOWED_ENTITY_TYPES[entity.entityCategory] || [];
    if (allowedTypes.indexOf(entity.entityType) === -1) {
      issues.push("specialEntities[" + index + "].entityType invalid for " + entity.entityCategory + ": " + entity.entityType);
    }

    if (entity.entityCategory === "obstacle_ball" && entity.entityType === "ice") {
      if (typeof entity.innerColor !== "string" || ALLOWED_COLORS.indexOf(entity.innerColor) === -1) {
        issues.push("specialEntities[" + index + "].innerColor invalid for ice: " + entity.innerColor);
      }
    }
    if (entity.entityCategory === "reactive_ball" && entity.entityType === "molotov") {
      if (!Number.isInteger(entity.blastRadius) || entity.blastRadius !== 2) {
        issues.push("specialEntities[" + index + "].blastRadius must be 2 for molotov");
      }
    }
    if (entity.entityCategory === "reactive_ball" && entity.entityType === "splitter") {
      if (typeof entity.splitColor !== "string" || level.colors.indexOf(entity.splitColor) === -1) {
        issues.push("specialEntities[" + index + "].splitColor must use a color from level.colors");
      }
      if (entity.row === TOP_BOARD_ROW_INDEX) {
        issues.push("specialEntities[" + index + "] splitter must not be placed in top board row");
      }
    }
    if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
      if (typeof entity.lockedColor !== "string" || level.colors.indexOf(entity.lockedColor) === -1) {
        issues.push("specialEntities[" + index + "].lockedColor must use a color from level.colors");
      }
      if (typeof entity.lockGroup !== "string" || !entity.lockGroup.trim()) {
        issues.push("specialEntities[" + index + "].lockGroup must be non-empty string");
      }
    }
    if (entity.entityCategory === "key_ball" && entity.entityType === "key") {
      if (typeof entity.unlockGroup !== "string" || !entity.unlockGroup.trim()) {
        issues.push("specialEntities[" + index + "].unlockGroup must be non-empty string");
      }
    }

    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col)) {
      issues.push("specialEntities[" + index + "] row/col must be integers");
      return;
    }

    if (entity.row < 0 || entity.row >= normalizedLayoutRows.length) {
      issues.push("specialEntities[" + index + "] row out of range: " + entity.row);
      return;
    }

    var rowString = normalizedLayoutRows[entity.row];
    if (entity.col < 0 || entity.col >= rowString.length) {
      issues.push("specialEntities[" + index + "] col out of range: " + entity.col);
      return;
    }

    var cellKey = entity.row + ":" + entity.col;
    if (seenCells[cellKey]) {
      issues.push("specialEntities[" + index + "] duplicate cell: " + cellKey);
    } else {
      seenCells[cellKey] = true;
    }

    if (rowString[entity.col] !== ".") {
      issues.push("specialEntities[" + index + "] must be placed on `.` layout slot at " + cellKey);
    }
  });
}

function validateClearRewardItems(level, expectedLevelId, issues) {
  var rewardItems = level.clearRewardItems;
  if (expectedLevelId < CLEAR_REWARD_START_LEVEL_ID) {
    if (rewardItems !== undefined) {
      issues.push("clearRewardItems must not be configured before level " + CLEAR_REWARD_START_LEVEL_ID);
    }
    return;
  }

  if (!Array.isArray(rewardItems) || rewardItems.length === 0) {
    issues.push("clearRewardItems must be a non-empty array from level " + CLEAR_REWARD_START_LEVEL_ID);
    return;
  }

  var seenIds = {};
  var hasCoinReward = false;
  rewardItems.forEach(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push("clearRewardItems[" + index + "] must be object");
      return;
    }

    if (ALLOWED_CLEAR_REWARD_ITEM_IDS.indexOf(item.id) === -1) {
      issues.push("clearRewardItems[" + index + "].id must be one of: " + ALLOWED_CLEAR_REWARD_ITEM_IDS.join(", "));
    } else if (seenIds[item.id]) {
      issues.push("clearRewardItems[" + index + "] duplicate id: " + item.id);
    } else {
      seenIds[item.id] = true;
      if (item.id === "coin") {
        hasCoinReward = true;
      }
    }

    if (!isPositiveInteger(item.count)) {
      issues.push("clearRewardItems[" + index + "].count must be positive integer");
      return;
    }

    if (item.id === "coin" && (item.count < 50 || item.count > 300)) {
      issues.push("clearRewardItems[" + index + "].count for coin must be in [50, 300]");
    }
    if (item.id === "stamina" && (item.count < 1 || item.count > 3)) {
      issues.push("clearRewardItems[" + index + "].count for stamina must be in [1, 3]");
    }
  });
  if (!hasCoinReward) {
    issues.push("clearRewardItems must include coin reward");
  }
}

function collectSpecialEntities(level, category, entityType) {
  return (Array.isArray(level.specialEntities) ? level.specialEntities : []).filter(function (entity) {
    return entity && entity.entityCategory === category && entity.entityType === entityType;
  });
}

function validateSplitterObjectives(level, issues) {
  var splitters = collectSpecialEntities(level, "reactive_ball", "splitter");
  if (!splitters.length) {
    return;
  }

  var splitterColor = null;
  splitters.forEach(function (entity) {
    if (typeof entity.splitColor !== "string" || !entity.splitColor) {
      issues.push("splitter requires splitColor before objective validation");
      return;
    }
    if (splitterColor !== null && splitterColor !== entity.splitColor) {
      issues.push("all splitters in one level must use the collect target color");
    }
    splitterColor = splitterColor || entity.splitColor;
  });

  var collectColorConditions = Array.isArray(level.winConditions)
    ? level.winConditions.filter(function (condition) {
      return condition && condition.type === "collect_color";
    })
    : [];
  if (collectColorConditions.length !== 1) {
    issues.push("splitter level winConditions must contain exactly one collect_color objective");
    return;
  }
  if (collectColorConditions[0].color !== splitterColor) {
    issues.push("splitter level collect_color must match splitColor: " + splitterColor);
  }
}

function validateKeyLockGroups(level, issues) {
  var keyGroups = {};
  var lockGroups = {};
  (Array.isArray(level.specialEntities) ? level.specialEntities : []).forEach(function (entity) {
    if (!entity) {
      return;
    }
    if (entity.entityCategory === "key_ball" && entity.entityType === "key" && typeof entity.unlockGroup === "string" && entity.unlockGroup.trim()) {
      keyGroups[entity.unlockGroup] = (keyGroups[entity.unlockGroup] || 0) + 1;
    }
    if (entity.entityCategory === "locked_ball" && entity.entityType === "locked" && typeof entity.lockGroup === "string" && entity.lockGroup.trim()) {
      lockGroups[entity.lockGroup] = (lockGroups[entity.lockGroup] || 0) + 1;
    }
  });
  Object.keys(lockGroups).forEach(function (group) {
    if (!keyGroups[group]) {
      issues.push("locked ball group missing matching key unlockGroup: " + group);
      return;
    }
    if (keyGroups[group] !== lockGroups[group]) {
      issues.push("key/locked ball count mismatch for group " + group + ": keys=" + keyGroups[group] + ", locks=" + lockGroups[group]);
    }
  });
  Object.keys(keyGroups).forEach(function (group) {
    if (!lockGroups[group]) {
      issues.push("key unlockGroup missing matching locked ball group: " + group);
      return;
    }
  });
}

function validateLevelMode(level, issues) {
  if (typeof level.levelType !== "string") {
    issues.push("levelType is required");
    return;
  }
  if (typeof level.playMode !== "string") {
    issues.push("playMode is required");
    return;
  }
  var levelType = level.levelType;
  var playMode = level.playMode;
  if (["normal", "special_floating_island"].indexOf(levelType) === -1) {
    issues.push("levelType unsupported: " + levelType);
  }
  if (["shot_limited", "timed_infinite_shots"].indexOf(playMode) === -1) {
    issues.push("playMode unsupported: " + playMode);
  }
  if (levelType === "special_floating_island" && playMode !== "timed_infinite_shots") {
    issues.push("special_floating_island must use timed_infinite_shots");
  }
  if (playMode === "timed_infinite_shots") {
    if (levelType !== "special_floating_island") {
      issues.push("timed_infinite_shots must use special_floating_island");
    }
    if (!isPositiveInteger(level.timeLimitSeconds)) {
      issues.push("timeLimitSeconds must be positive integer for timed_infinite_shots");
    }
    if (level.requiredStarCount !== 1) {
      issues.push("requiredStarCount must be 1 for timed_infinite_shots");
    }
    if (level.shotLimit !== undefined && level.shotLimit !== null) {
      issues.push("shotLimit must not be configured for timed_infinite_shots");
    }
  } else {
    if (!isPositiveInteger(level.shotLimit)) {
      issues.push("shotLimit must be a positive integer");
    } else if (level.shotLimit > MAX_SHOT_LIMIT) {
      issues.push("shotLimit must be <= " + MAX_SHOT_LIMIT);
    }
    if (level.timeLimitSeconds !== undefined) {
      issues.push("timeLimitSeconds must not be configured for shot_limited");
    }
    if (level.requiredStarCount !== undefined) {
      issues.push("requiredStarCount must not be configured for shot_limited");
    }
  }
}

function validateInitialDropSpaceRows(level, issues) {
  if (!isPositiveInteger(level.initialDropSpaceRows)) {
    issues.push("initialDropSpaceRows must be a positive integer");
    return;
  }
  if (level.initialDropSpaceRows < MIN_INITIAL_DROP_SPACE_ROWS) {
    issues.push("initialDropSpaceRows must be >= " + MIN_INITIAL_DROP_SPACE_ROWS);
  }
}

function validateAdPowerupRules(level, issues) {
  if (level.adPowerupRules === undefined) {
    issues.push("adPowerupRules is required");
    return;
  }
  var rules = level.adPowerupRules;
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    issues.push("adPowerupRules must be object");
    return;
  }
  if (!Array.isArray(rules.allowed)) {
    issues.push("adPowerupRules.allowed must be array");
    return;
  }
  if (!rules.maxGrantsPerRun || typeof rules.maxGrantsPerRun !== "object" || Array.isArray(rules.maxGrantsPerRun)) {
    issues.push("adPowerupRules.maxGrantsPerRun must be object");
    return;
  }
  var seen = {};
  rules.allowed.forEach(function (powerupType) {
    if (AD_RUN_POWERUP_TYPES.indexOf(powerupType) === -1) {
      issues.push("adPowerupRules unsupported powerup: " + powerupType);
      return;
    }
    if (seen[powerupType]) {
      issues.push("adPowerupRules duplicate powerup: " + powerupType);
    }
    seen[powerupType] = true;
    if (!isPositiveInteger(rules.maxGrantsPerRun[powerupType])) {
      issues.push("adPowerupRules.maxGrantsPerRun." + powerupType + " must be positive integer");
    }
    if (level.playMode === "timed_infinite_shots" && powerupType === "plus_three_balls") {
      issues.push("timed_infinite_shots cannot allow plus_three_balls");
    }
  });
  Object.keys(rules.maxGrantsPerRun).forEach(function (powerupType) {
    if (seen[powerupType] !== true) {
      issues.push("adPowerupRules.maxGrantsPerRun contains undeclared powerup: " + powerupType);
    }
  });
}

function validateIceSnowballSupply(level, issues) {
  if (!Array.isArray(level.winConditions) || !Array.isArray(level.bonusObjectives)) {
    return;
  }
  var objectives = level.winConditions.concat(level.bonusObjectives);
  var required = objectives.reduce(function (max, objective) {
    if (objective && objective.type === "collect_ice_snowball") {
      return Math.max(max, Math.floor(Number(objective.value)));
    }
    return max;
  }, 0);
  if (required <= 0) {
    return;
  }
  var available = (Array.isArray(level.specialEntities) ? level.specialEntities : []).filter(function (entity) {
    return entity && entity.entityCategory === "obstacle_ball" && entity.entityType === "ice";
  }).length;
  if (available < required) {
    issues.push("collect_ice_snowball target exceeds ice supply");
  }
}

function validateInitialShotBalls(level, issues) {
  if (level.initialShotBalls === undefined) {
    return;
  }
  if (!Array.isArray(level.initialShotBalls) || level.initialShotBalls.length <= 0 || level.initialShotBalls.length > 2) {
    issues.push("initialShotBalls must contain 1 or 2 colors");
    return;
  }
  level.initialShotBalls.forEach(function (color, index) {
    if (typeof color !== "string" || level.colors.indexOf(color) === -1) {
      issues.push("initialShotBalls[" + index + "] must use a color from level.colors");
    }
  });
}

function validateLevelData(data, expectedLevelId) {
  var issues = [];
  var level = data.level || null;

  if (data.schemaVersion !== 1) {
    issues.push("schemaVersion must be 1");
  }

  if (data.coordinateSystem !== "odd-r-hex") {
    issues.push("coordinateSystem must be odd-r-hex");
  }

  if (!level || typeof level !== "object") {
    issues.push("missing level object");
    return issues;
  }

  if (level.levelId !== expectedLevelId) {
    issues.push("level.levelId mismatch: expected " + expectedLevelId + ", got " + level.levelId);
  }

  if (typeof level.code !== "string" || !new RegExp("^L" + String(expectedLevelId).padStart(3, "0") + "_").test(level.code)) {
    issues.push("level.code must start with L" + String(expectedLevelId).padStart(3, "0") + "_");
  }

  if (ALLOWED_DIFFICULTY.indexOf(level.difficulty) === -1) {
    issues.push("difficulty must be one of: " + ALLOWED_DIFFICULTY.join(", "));
  }

  if (!Array.isArray(level.colors) || !level.colors.length) {
    issues.push("level.colors must be a non-empty array");
  } else {
    if (!hasUniqueItems(level.colors)) {
      issues.push("level.colors must not contain duplicates");
    }

    level.colors.forEach(function (color) {
      if (ALLOWED_COLORS.indexOf(color) === -1) {
        issues.push("unsupported color in level.colors: " + color);
      }
    });
  }

  if (!isPositiveInteger(level.colorCount) || level.colorCount !== level.colors.length) {
    issues.push("colorCount must equal level.colors.length");
  }

  validateLevelMode(level, issues);
  validateInitialDropSpaceRows(level, issues);

  if (!isPositiveInteger(level.targetScore)) {
    issues.push("targetScore must be a positive integer");
  }

  if (!isPositiveInteger(level.dropInterval)) {
    issues.push("dropInterval must be a positive integer");
  }

  if (!isPositiveInteger(level.jarCount)) {
    issues.push("jarCount must be a positive integer");
  } else if (level.jarCount > MAX_JAR_COUNT) {
    issues.push("jarCount must be <= " + MAX_JAR_COUNT);
  }

  if (!Array.isArray(level.jarColors) || level.jarColors.length !== level.jarCount) {
    issues.push("jarColors length must equal jarCount");
  } else {
    level.jarColors.forEach(function (color) {
      if (ALLOWED_COLORS.indexOf(color) === -1) {
        issues.push("unsupported color in jarColors: " + color);
      }
    });
  }

  if (!level.spawnWeights || typeof level.spawnWeights !== "object") {
    issues.push("spawnWeights must be object");
  } else {
    level.colors.forEach(function (color) {
      if (typeof level.spawnWeights[color] !== "number" || level.spawnWeights[color] <= 0) {
        issues.push("spawnWeights." + color + " must be > 0");
      }
    });

    Object.keys(level.spawnWeights).forEach(function (color) {
      if (level.colors.indexOf(color) === -1) {
        issues.push("spawnWeights contains color not in level.colors: " + color);
      }
    });
  }

  if (!level.jarRules || typeof level.jarRules !== "object") {
    issues.push("jarRules must be object");
  } else {
    var rimBounce = level.jarRules.rimBounce;
    var collectZoneScale = level.jarRules.collectZoneScale;
    var sameColorBonus = level.jarRules.sameColorBonus;

    if (typeof rimBounce !== "number" || rimBounce < 0.4 || rimBounce > 0.95) {
      issues.push("jarRules.rimBounce must be in [0.4, 0.95]");
    }

    if (typeof collectZoneScale !== "number" || collectZoneScale < 0.7 || collectZoneScale > 1.4) {
      issues.push("jarRules.collectZoneScale must be in [0.7, 1.4]");
    }

    if (typeof sameColorBonus !== "number" || sameColorBonus < 1 || sameColorBonus > 3) {
      issues.push("jarRules.sameColorBonus must be in [1, 3]");
    }
  }

  if (!Array.isArray(level.layout) || !level.layout.length) {
    issues.push("layout must be non-empty array");
  } else {
    var normalizedLayoutRows = [];
    level.layout.forEach(function (rowString, rowIndex) {
      if (typeof rowString !== "string") {
        issues.push("layout row #" + rowIndex + " must be string");
        return;
      }

      var expectedColumns = getExpectedRowColumns(rowIndex);
      var normalizedRow = rowString;
      if (rowString.length > expectedColumns) {
        issues.push("layout row #" + rowIndex + " exceeds max columns " + expectedColumns);
        normalizedRow = rowString.slice(0, expectedColumns);
      } else if (rowString.length < expectedColumns) {
        normalizedRow += ".".repeat(expectedColumns - rowString.length);
      }

      rowString.split("").forEach(function (cellCode, colIndex) {
        if (cellCode !== "." && level.colors.indexOf(cellCode) === -1) {
          issues.push("layout row #" + rowIndex + " col #" + colIndex + " contains invalid code: " + cellCode);
        }
      });

      normalizedLayoutRows[rowIndex] = normalizedRow;
    });

    validateSpecialEntities(level, normalizedLayoutRows, issues);
  }

  validateObjectives(level.winConditions, "win", level, issues);
  validateObjectives(level.bonusObjectives, "bonus", level, issues);
  validateSplitterObjectives(level, issues);
  validateKeyLockGroups(level, issues);
  validateInitialShotBalls(level, issues);
  validateIceSnowballSupply(level, issues);
  validateAdPowerupRules(level, issues);
  validateClearRewardItems(level, expectedLevelId, issues);

  return issues;
}

function validateLevel(filePath, expectedLevelId) {
  return validateLevelData(readJson(filePath), expectedLevelId);
}

function buildSpecialPositionSignatures(level) {
  var grouped = {};
  (Array.isArray(level.specialEntities) ? level.specialEntities : []).forEach(function (entity) {
    if (!entity || typeof entity.entityCategory !== "string" || typeof entity.entityType !== "string") {
      return;
    }
    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col)) {
      return;
    }
    var key = entity.entityCategory + ":" + entity.entityType;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(entity.row + ":" + entity.col);
  });

  var signatures = {};
  Object.keys(grouped).forEach(function (key) {
    signatures[key] = grouped[key].sort().join(",");
  });
  return signatures;
}

function validateCrossLevelSpecialPositions(entries) {
  var issues = [];
  var previous = null;
  var recentByType = {};

  entries.forEach(function (entry) {
    var signatures = buildSpecialPositionSignatures(entry.data.level || {});
    if (previous) {
      Object.keys(signatures).forEach(function (typeKey) {
        if (previous.signatures[typeKey] && previous.signatures[typeKey] === signatures[typeKey]) {
          issues.push(entry.sourceName + " repeats adjacent " + typeKey + " special positions from level " + previous.levelId);
        }
      });
    }

    Object.keys(signatures).forEach(function (typeKey) {
      var history = recentByType[typeKey] || [];
      var sameCount = history.filter(function (item) {
        return item.signature === signatures[typeKey];
      }).length;
      if (sameCount >= 2) {
        issues.push(entry.sourceName + " repeats " + typeKey + " special positions more than twice within 5 levels");
      }
      history.push({
        levelId: entry.levelId,
        signature: signatures[typeKey]
      });
      recentByType[typeKey] = history.slice(-4);
    });

    previous = {
      levelId: entry.levelId,
      signatures: signatures
    };
  });

  return issues;
}

function listLocalLevelEntries() {
  return fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .map(function (fileName) {
      return {
        levelId: getLevelNumber(fileName),
        sourceName: fileName,
        data: readJson(path.join(LEVEL_DIR, fileName))
      };
    });
}

function listRemotePackEntries() {
  if (!fs.existsSync(REMOTE_PACK_DIR)) {
    return [];
  }

  var entries = [];
  fs.readdirSync(REMOTE_PACK_DIR)
    .filter(function (fileName) {
      return /^levels_pack_\d{3,}_\d{3,}\.json$/.test(fileName);
    })
    .sort()
    .forEach(function (fileName) {
      var pack = readJson(path.join(REMOTE_PACK_DIR, fileName));
      if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
        throw new Error("remote level pack must be object: " + fileName);
      }
      if (pack.schemaVersion !== 1) {
        throw new Error("remote level pack schemaVersion must be 1: " + fileName);
      }
      if (typeof pack.packId !== "string" || !pack.packId) {
        throw new Error("remote level pack packId is required: " + fileName);
      }
      if (!Number.isInteger(pack.from) || !Number.isInteger(pack.to) || pack.from <= 0 || pack.to < pack.from) {
        throw new Error("remote level pack range invalid: " + fileName);
      }
      if (!pack.levels || typeof pack.levels !== "object" || Array.isArray(pack.levels)) {
        throw new Error("remote level pack levels must be object: " + fileName);
      }

      for (var levelId = pack.from; levelId <= pack.to; levelId += 1) {
        var levelKey = "level_" + String(levelId).padStart(3, "0");
        if (!pack.levels[levelKey] || typeof pack.levels[levelKey] !== "object" || Array.isArray(pack.levels[levelKey])) {
          throw new Error("remote level pack missing " + levelKey + ": " + fileName);
        }
        entries.push({
          levelId: levelId,
          sourceName: fileName + "#" + levelKey,
          data: pack.levels[levelKey]
        });
      }
    });

  return entries;
}

function listAllLevelEntries() {
  return listLocalLevelEntries().concat(listRemotePackEntries()).sort(function (a, b) {
    return a.levelId - b.levelId;
  });
}

function main() {
  var expectedLevelCount = Number(process.env.LEVEL_EXPECTED_COUNT || 0);
  var entries = listAllLevelEntries();

  if (!entries.length) {
    console.log("No level configs found in " + LEVEL_DIR + " or " + REMOTE_PACK_DIR);
    process.exit(1);
  }

  var expectedId = 1;
  var failed = false;
  var seenLevelIds = {};

  entries.forEach(function (entry) {
    var levelId = entry.levelId;
    if (seenLevelIds[levelId]) {
      failed = true;
      console.log("[FAIL]", entry.sourceName, "Duplicated level id", levelId);
    }
    seenLevelIds[levelId] = true;
    if (levelId !== expectedId) {
      failed = true;
      console.log("[FAIL]", entry.sourceName, "Expected sequential level id", expectedId, "but got", levelId);
      expectedId = levelId + 1;
      return;
    }

    var issues = validateLevelData(entry.data, levelId);

    if (issues.length) {
      failed = true;
      console.log("[FAIL]", entry.sourceName);
      issues.forEach(function (issue) {
        console.log("  -", issue);
      });
    } else {
      console.log("[OK]", entry.sourceName);
    }

    expectedId += 1;
  });

  validateCrossLevelSpecialPositions(entries).forEach(function (issue) {
    failed = true;
    console.log("[FAIL]", issue);
  });

  if (Number.isInteger(expectedLevelCount) && expectedLevelCount > 0 && entries.length !== expectedLevelCount) {
    failed = true;
    console.log("[FAIL]", "Expected", expectedLevelCount, "levels, found", entries.length);
  }

  if (failed) {
    console.log("\nLevel content validation failed.");
    process.exit(1);
  }

  console.log("\nLevel content validation passed for", entries.length, "levels.");
}

main();
