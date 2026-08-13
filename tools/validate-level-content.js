"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelBoardSupportValidator = require("../assets/scripts/config/LevelBoardSupportValidator");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var LevelPackIntegrity = require("../assets/scripts/config/LevelPackIntegrity");
var LevelPackManifest = require("../assets/scripts/config/LevelPackManifest");
var AssistSpiritConfig = require("../assets/scripts/config/AssistSpiritConfig");
var CampaignLevelModePolicy = require("./campaign-level-mode-policy");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");
var ClusteredLevelLayout = require("./clustered-level-layout");
var FirstHundredLevelDesign = require("./first-100-level-design");

var LEVEL_DIR = path.resolve(__dirname, "../assets/map/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var MANIFEST_PATH = path.resolve(REMOTE_PACK_DIR, "level_manifest.json");
var ALLOWED_COLORS = CampaignLevelGenerationConfig.NORMAL_BALL_COLORS.slice();
var ALLOWED_SPLITTER_COLORS = CampaignLevelGenerationConfig.BASE_SPECIAL_COLORS.slice();
var FIXED_JAR_COLORS = CampaignLevelGenerationConfig.BASE_SPECIAL_COLORS.slice();
var FIXED_JAR_COUNT = FIXED_JAR_COLORS.length;
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
  reactive_ball: ["molotov", "splitter", "swirl", "vine_spirit", "wormhole"],
  locked_ball: ["locked"],
  key_ball: ["key"]
};
var ALLOWED_CLEAR_REWARD_ITEM_IDS = ["coin", "stamina"];
var AD_RUN_POWERUP_TYPES = ["three_line_elimination", "plus_three_balls"];
var MIN_INITIAL_DROP_SPACE_ROWS = 8;
var MIN_LAYOUT_ROWS = 8;
var MIN_OCCUPIED_LAYOUT_ROWS = 8;
var MAX_SHOT_LIMIT = 54;
var CLEAR_REWARD_START_LEVEL_ID = 1;
var TOP_BOARD_ROW_INDEX = 0;
var WORMHOLE_MOVE_DIRECTIONS = ["left", "right"];

function isWormholeEntity(entity) {
  return !!(
    entity &&
    entity.entityCategory === "reactive_ball" &&
    entity.entityType === "wormhole"
  );
}

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

function readText(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    return raw.slice(1);
  }
  return raw;
}

function getLevelNumber(fileName) {
  var match = fileName.match(/level_(\d+)\.json$/);
  return match ? Number(match[1]) : Number.NaN;
}

function getExpectedRowColumns(rowIndex, maxColumns) {
  return BoardLayout.getRowColumnCount(rowIndex, maxColumns);
}

function countOccupiedLayoutRows(layout, specialEntities) {
  var occupiedRows = {};
  layout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string") {
      return;
    }
    for (var colIndex = 0; colIndex < rowString.length; colIndex += 1) {
      if (rowString.charAt(colIndex) !== ".") {
        occupiedRows[rowIndex] = true;
        break;
      }
    }
  });
  if (Array.isArray(specialEntities)) {
    specialEntities.forEach(function (entity) {
      if (
        entity &&
        !isWormholeEntity(entity) &&
        Number.isInteger(entity.row) &&
        entity.row >= 0 &&
        entity.row < layout.length
      ) {
        occupiedRows[entity.row] = true;
      }
    });
  }
  return Object.keys(occupiedRows).length;
}

function hasUniqueItems(items) {
  return new Set(items).size === items.length;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function getHexNeighborCoordinates(row, col) {
  var offsets = row % 2 === 1 ? [
    [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]
  ] : [
    [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
  ];
  return offsets.map(function (offset) {
    return {
      row: row + offset[0],
      col: col + offset[1]
    };
  });
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
      } else if (ALLOWED_SPLITTER_COLORS.indexOf(entity.splitColor) === -1) {
        issues.push("specialEntities[" + index + "].splitColor has no splitter asset: " + entity.splitColor);
      }
      if (entity.row === TOP_BOARD_ROW_INDEX) {
        issues.push("specialEntities[" + index + "] splitter must not be placed in top board row");
      }
    }
    if (entity.entityCategory === "reactive_ball" && entity.entityType === "wormhole") {
      if (WORMHOLE_MOVE_DIRECTIONS.indexOf(entity.moveDirection) === -1) {
        issues.push("specialEntities[" + index + "].moveDirection must be left or right for wormhole");
      }
    }
    if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
      if (typeof entity.lockedColor !== "string" || level.colors.indexOf(entity.lockedColor) === -1) {
        issues.push("specialEntities[" + index + "].lockedColor must use a color from level.colors");
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

    if (rowString[entity.col] !== "." && !isWormholeEntity(entity)) {
      issues.push("specialEntities[" + index + "] must be placed on `.` layout slot at " + cellKey);
    }
  });

  var claimedSwirlTrackCells = {};
  level.specialEntities.forEach(function (entity, index) {
    if (!entity || entity.entityCategory !== "reactive_ball" || entity.entityType !== "swirl") {
      return;
    }
    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col)) {
      return;
    }
    getHexNeighborCoordinates(entity.row, entity.col).forEach(function (coordinate) {
      if (
        coordinate.row < 0 ||
        coordinate.row >= normalizedLayoutRows.length ||
        coordinate.col < 0 ||
        coordinate.col >= normalizedLayoutRows[coordinate.row].length
      ) {
        issues.push("specialEntities[" + index + "] swirl requires a complete six-cell hex track");
        return;
      }
      var coordinateKey = coordinate.row + ":" + coordinate.col;
      if (seenCells[coordinateKey]) {
        issues.push("specialEntities[" + index + "] swirl track contains special entity at " + coordinateKey);
      }
      if (claimedSwirlTrackCells[coordinateKey]) {
        issues.push("swirl tracks overlap at " + coordinateKey);
      }
      claimedSwirlTrackCells[coordinateKey] = true;
    });
  });

  var wormholes = level.specialEntities.filter(function (entity) {
    return entity && entity.entityCategory === "reactive_ball" && entity.entityType === "wormhole";
  });
  var wormholesByRow = {};
  wormholes.forEach(function (wormhole) {
    if (!wormholesByRow[wormhole.row]) {
      wormholesByRow[wormhole.row] = [];
    }
    wormholesByRow[wormhole.row].push(wormhole);
  });
  Object.keys(wormholesByRow).forEach(function (rowKey) {
    var pair = wormholesByRow[rowKey].sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      issues.push("wormhole row " + rowKey + " must contain exactly two endpoints");
      return;
    }
    if (pair[1].col - pair[0].col < 2) {
      issues.push("wormhole row " + rowKey + " must contain at least one interior slot");
    }
    if (pair[0].moveDirection !== pair[1].moveDirection) {
      issues.push("wormhole pair moveDirection must match on row " + rowKey);
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

function validateKeyLockCounts(level, issues) {
  var keyCount = 0;
  var lockCount = 0;
  (Array.isArray(level.specialEntities) ? level.specialEntities : []).forEach(function (entity) {
    if (!entity) {
      return;
    }
    if (entity.entityCategory === "key_ball" && entity.entityType === "key") {
      keyCount += 1;
    }
    if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
      lockCount += 1;
    }
  });
  if (keyCount !== lockCount) {
    issues.push("key and locked ball count mismatch: keys=" + keyCount + ", locks=" + lockCount);
  }
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
  if (["normal", "special_floating_island", "trapped_sprite_rescue"].indexOf(levelType) === -1) {
    issues.push("levelType unsupported: " + levelType);
  }
  if (["shot_limited", "timed_infinite_shots"].indexOf(playMode) === -1) {
    issues.push("playMode unsupported: " + playMode);
  }
  if (levelType === "special_floating_island" && playMode !== "timed_infinite_shots") {
    issues.push("special_floating_island must use timed_infinite_shots");
  }
  if (levelType === "trapped_sprite_rescue" && playMode !== "shot_limited") {
    issues.push("trapped_sprite_rescue must use shot_limited");
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

function validateTimeBonusBalls(level, normalizedLayoutRows, expectedLevelId, issues) {
  if (level.playMode !== "timed_infinite_shots") {
    if (level.timeBonusBalls !== undefined) {
      issues.push("timeBonusBalls is only valid for timed_infinite_shots");
    }
    return;
  }
  if (!Array.isArray(level.timeBonusBalls)) {
    issues.push("timed_infinite_shots requires timeBonusBalls array");
    return;
  }
  var expectedCount = CampaignLevelGenerationConfig.getTimedLevelTimeBonusBallCount(expectedLevelId);
  if (level.timeBonusBalls.length !== expectedCount) {
    issues.push("timeBonusBalls count must be " + expectedCount);
  }
  var usedCoordinates = {};
  level.timeBonusBalls.forEach(function (entry, index) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push("timeBonusBalls[" + index + "] must be object");
      return;
    }
    if (entry.bonusSeconds !== CampaignLevelGenerationConfig.TIMED_LEVEL_TIME_BONUS_SECONDS) {
      issues.push("timeBonusBalls[" + index + "].bonusSeconds must be " + CampaignLevelGenerationConfig.TIMED_LEVEL_TIME_BONUS_SECONDS);
    }
    if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col) ||
        entry.row < 0 || entry.row >= normalizedLayoutRows.length ||
        !normalizedLayoutRows[entry.row] || entry.col < 0 || entry.col >= normalizedLayoutRows[entry.row].length) {
      issues.push("timeBonusBalls[" + index + "] coordinate is out of range");
      return;
    }
    if (normalizedLayoutRows[entry.row].charAt(entry.col) === ".") {
      issues.push("timeBonusBalls[" + index + "] must target normal layout ball");
    }
    var coordinateKey = entry.row + ":" + entry.col;
    if (usedCoordinates[coordinateKey]) {
      issues.push("timeBonusBalls contains duplicate coordinate " + coordinateKey);
    }
    usedCoordinates[coordinateKey] = true;
  });
}

function validateTrappedSpriteRescue(level, issues) {
  var rescue = level.trappedSpriteRescue;
  if (level.levelType !== "trapped_sprite_rescue") {
    if (rescue !== undefined) {
      issues.push("trappedSpriteRescue is only valid for trapped_sprite_rescue");
    }
    return;
  }
  if (!rescue || typeof rescue !== "object" || Array.isArray(rescue)) {
    issues.push("trapped_sprite_rescue requires trappedSpriteRescue object");
    return;
  }
  if (Object.prototype.hasOwnProperty.call(rescue, "spriteId")) {
    issues.push("trappedSpriteRescue.spriteId is obsolete; use spiritId");
  }
  try {
    AssistSpiritConfig.getSpirit(rescue.spiritId);
  } catch (error) {
    issues.push("trappedSpriteRescue.spiritId is invalid: " + error.message);
  }
  var anchor = rescue.anchorCell;
  if (!anchor || !Number.isInteger(anchor.row) || !Number.isInteger(anchor.col) ||
      !Array.isArray(level.layout) || anchor.row < 0 || anchor.row >= level.layout.length ||
      anchor.col < 0 || anchor.col >= getExpectedRowColumns(anchor.row, BoardLayout.defaultColumns)) {
    issues.push("trappedSpriteRescue.anchorCell must be a valid board coordinate");
  } else if (typeof level.layout[anchor.row] !== "string" || level.layout[anchor.row].charAt(anchor.col) !== ".") {
    issues.push("trappedSpriteRescue.anchorCell must remain empty");
  }
  if (!rescue.worldCenter || typeof rescue.worldCenter !== "object" || Array.isArray(rescue.worldCenter) ||
      typeof rescue.worldCenter.x !== "number" || !isFinite(rescue.worldCenter.x) ||
      typeof rescue.worldCenter.y !== "number" || !isFinite(rescue.worldCenter.y)) {
    issues.push("trappedSpriteRescue.worldCenter must contain finite x/y");
  }
  if (typeof rescue.renderScale !== "number" || !isFinite(rescue.renderScale) ||
      rescue.renderScale < 0.5 || rescue.renderScale > 3) {
    issues.push("trappedSpriteRescue.renderScale must be in [0.5, 3]");
  }
  if (!rescue.rotation || typeof rescue.rotation !== "object" || Array.isArray(rescue.rotation)) {
    issues.push("trappedSpriteRescue.rotation must be object");
  } else {
    [
      "projectileImpulse", "torqueScale", "coreInertia", "maxAngularSpeedDeg",
      "angularDamping", "stopAngularSpeedDeg", "maxStepAngleDeg", "maxDurationSec"
    ].forEach(function (fieldName) {
      if (typeof rescue.rotation[fieldName] !== "number" || !isFinite(rescue.rotation[fieldName]) ||
          rescue.rotation[fieldName] <= 0) {
        issues.push("trappedSpriteRescue.rotation." + fieldName + " must be positive");
      }
    });
    if (typeof rescue.rotation.tangentialDeadZone !== "number" ||
        rescue.rotation.tangentialDeadZone < 0 || rescue.rotation.tangentialDeadZone > 0.95) {
      issues.push("trappedSpriteRescue.rotation.tangentialDeadZone must be in [0, 0.95]");
    }
  }
  var allowedRescueSpecialEntityKeys = {
    "skill_ball:rainbow": true,
    "skill_ball:blast": true,
    "obstacle_ball:stone": true,
    "obstacle_ball:ice": true,
    "reactive_ball:swirl": true,
    "reactive_ball:vine_spirit": true
  };
  if (!Array.isArray(level.specialEntities)) {
    issues.push("trapped_sprite_rescue specialEntities must be an array");
  } else {
    level.specialEntities.forEach(function (entity, index) {
      var entityKey = entity && entity.entityCategory + ":" + entity.entityType;
      if (!entity || allowedRescueSpecialEntityKeys[entityKey] !== true) {
        issues.push("trapped_sprite_rescue specialEntities[" + index + "] is incompatible: " + entityKey);
        return;
      }
      if (entity.row === TOP_BOARD_ROW_INDEX) {
        issues.push("trapped_sprite_rescue special entity must not occupy the top row");
      }
      if (anchor && entity.row === anchor.row && entity.col === anchor.col) {
        issues.push("trapped_sprite_rescue anchorCell overlaps a special entity");
      }
    });
  }
  if (Array.isArray(level.layout) && typeof level.layout[TOP_BOARD_ROW_INDEX] === "string" &&
      level.layout[TOP_BOARD_ROW_INDEX].split("").some(function (cellCode) { return cellCode !== "."; })) {
    issues.push("trapped_sprite_rescue top row must be empty");
  }
}

function validateCampaignLevelModeSchedule(level, issues) {
  var expected = CampaignLevelModePolicy.getExpectedMode(level.levelId);
  if (level.levelType !== expected.levelType) {
    issues.push("campaign levelType must be " + expected.levelType);
  }
  if (level.playMode !== expected.playMode) {
    issues.push("campaign playMode must be " + expected.playMode);
  }
  if (expected.playMode === "timed_infinite_shots") {
    if (level.timeLimitSeconds !== expected.timeLimitSeconds) {
      issues.push("campaign timeLimitSeconds must be " + expected.timeLimitSeconds);
    }
    if (level.requiredStarCount !== expected.requiredStarCount) {
      issues.push("campaign requiredStarCount must be " + expected.requiredStarCount);
    }
  }
}

function validateInitialDropSpaceRows(level, issues) {
  if (level.levelType === "trapped_sprite_rescue") {
    if (level.initialDropSpaceRows !== undefined) {
      issues.push("trapped_sprite_rescue must not configure initialDropSpaceRows");
    }
    return;
  }
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
  if (level.levelType === "trapped_sprite_rescue" && rules.allowed.length !== 0) {
    issues.push("trapped_sprite_rescue adPowerupRules.allowed must be empty");
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
    if (level.playMode === "timed_infinite_shots" && powerupType === "plus_three_balls") {
      issues.push("timed_infinite_shots cannot allow plus_three_balls");
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

function validateOpeningShotBalls(level, issues) {
  if (level.openingShotBalls === undefined) {
    return;
  }
  if (level.initialShotBalls !== undefined) {
    issues.push("openingShotBalls and initialShotBalls cannot both be configured");
  }
  if (level.levelType !== "normal" || level.playMode !== "shot_limited") {
    issues.push("openingShotBalls is only supported by normal shot_limited levels");
  }
  if (!Array.isArray(level.openingShotBalls) || level.openingShotBalls.length < 3 || level.openingShotBalls.length > 6) {
    issues.push("openingShotBalls must contain 3 to 6 colors");
    return;
  }
  if (isPositiveInteger(level.shotLimit) && level.openingShotBalls.length > level.shotLimit) {
    issues.push("openingShotBalls length must not exceed shotLimit");
  }
  level.openingShotBalls.forEach(function (color, index) {
    if (typeof color !== "string" || level.colors.indexOf(color) === -1) {
      issues.push("openingShotBalls[" + index + "] must use a color from level.colors");
    }
  });
}

function validateStarThresholds(level, issues) {
  if (level.starThresholds === undefined) {
    issues.push("formal campaign level requires explicit starThresholds");
    return;
  }
  var thresholds = level.starThresholds;
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    issues.push("starThresholds must be an object");
    return;
  }
  var fields = Object.keys(thresholds);
  if (fields.length !== 3 || fields.indexOf("star1") === -1 || fields.indexOf("star2") === -1 || fields.indexOf("star3") === -1) {
    issues.push("starThresholds must contain only star1, star2 and star3");
    return;
  }
  if (!isPositiveInteger(thresholds.star1) || !isPositiveInteger(thresholds.star2) || !isPositiveInteger(thresholds.star3)) {
    issues.push("starThresholds values must be positive integers");
    return;
  }
  if (!(thresholds.star1 < thresholds.star2 && thresholds.star2 < thresholds.star3)) {
    issues.push("starThresholds must be strictly increasing");
  }
  if (isPositiveInteger(level.targetScore) && thresholds.star3 > level.targetScore) {
    issues.push("starThresholds.star3 must not exceed targetScore");
  }
}

function validateCampaignScoreDesign(level, normalizedLayoutRows, expectedLevelId, designBeat, issues) {
  if (!Array.isArray(normalizedLayoutRows) || !Array.isArray(level.specialEntities) || !Array.isArray(level.winConditions)) {
    return;
  }
  var normalBallCount = normalizedLayoutRows.reduce(function (sum, row) {
    return sum + row.split("").filter(function (cell) { return cell !== "."; }).length;
  }, 0);
  var iceCount = 0;
  var baseSpecialCount = 0;
  var reactiveCounts = { swirl: 0, vine_spirit: 0, wormholePairs: 0 };
  var wormholeCount = 0;
  level.specialEntities.forEach(function (entity) {
    if (entity.entityType === "ice") {
      iceCount += 1;
    } else if (entity.entityType === "swirl") {
      reactiveCounts.swirl += 1;
    } else if (entity.entityType === "vine_spirit") {
      reactiveCounts.vine_spirit += 1;
    } else if (entity.entityType === "wormhole") {
      wormholeCount += 1;
    } else {
      baseSpecialCount += 1;
    }
  });
  if (wormholeCount % 2 !== 0) {
    return;
  }
  reactiveCounts.wormholePairs = wormholeCount / 2;
  var collectColor = level.winConditions.filter(function (condition) {
    return condition && condition.type === "collect_color";
  });
  var clearAll = level.winConditions.filter(function (condition) {
    return condition && condition.type === "clear_all";
  });
  var primaryObjectiveValue;
  if (collectColor.length === 1) {
    primaryObjectiveValue = collectColor[0].value;
  } else if (clearAll.length === 1) {
    primaryObjectiveValue = normalBallCount;
  } else {
    return;
  }
  var iceObjectives = level.winConditions.filter(function (condition) {
    return condition && condition.type === "collect_ice_snowball";
  });
  var expected = CampaignLevelGenerationConfig.buildCampaignScoreDesign({
    levelId: expectedLevelId,
    normalBallCount: normalBallCount,
    iceCount: iceCount,
    baseSpecialCount: baseSpecialCount,
    reactiveSpecialCounts: reactiveCounts,
    primaryObjectiveValue: primaryObjectiveValue,
    secondaryObjectiveValue: iceObjectives.length === 1 ? iceObjectives[0].value : 0,
    shotLimit: level.playMode === "shot_limited" ? level.shotLimit : undefined,
    timeLimitSeconds: level.playMode === "timed_infinite_shots" ? level.timeLimitSeconds : undefined,
    designBeat: designBeat
  });
  if (level.targetScore !== expected.targetScore) {
    issues.push("targetScore does not match campaign score design: expected " + expected.targetScore + ", got " + level.targetScore);
  }
  if (JSON.stringify(level.starThresholds) !== JSON.stringify(expected.starThresholds)) {
    issues.push("starThresholds do not match campaign score design");
  }
}

function validateCampaignMechanicPlan(level, normalizedLayoutRows, expectedLevelId, issues) {
  if (!Array.isArray(normalizedLayoutRows) || !Array.isArray(level.specialEntities)) {
    return;
  }
  var expectedReactive = CampaignLevelGenerationConfig.getReactiveSpecialCounts(expectedLevelId);
  var actual = { swirl: 0, vine_spirit: 0, wormhole: 0, ice: 0 };
  var specialByCell = {};
  level.specialEntities.forEach(function (entity) {
    specialByCell[entity.row + ":" + entity.col] = entity;
    if (Object.prototype.hasOwnProperty.call(actual, entity.entityType)) {
      actual[entity.entityType] += 1;
    }
  });
  ["swirl", "vine_spirit", "wormhole"].forEach(function (entityType) {
    if (actual[entityType] !== expectedReactive[entityType]) {
      issues.push(entityType + " count does not match campaign plan: expected " + expectedReactive[entityType] + ", got " + actual[entityType]);
    }
  });
  var boardCapacity = normalizedLayoutRows.reduce(function (sum, row) {
    return sum + row.length;
  }, 0);
  var expectedIce = CampaignLevelGenerationConfig.getIceBallCount(expectedLevelId, boardCapacity);
  if (actual.ice !== expectedIce) {
    issues.push("ice count does not match campaign plan: expected " + expectedIce + ", got " + actual.ice);
  }
  level.specialEntities.filter(function (entity) {
    return entity.entityType === "swirl";
  }).forEach(function (swirl) {
    getHexNeighborCoordinates(swirl.row, swirl.col).forEach(function (neighbor) {
      var key = neighbor.row + ":" + neighbor.col;
      if (neighbor.row < 0 || neighbor.row >= normalizedLayoutRows.length ||
          neighbor.col < 0 || neighbor.col >= normalizedLayoutRows[neighbor.row].length) {
        issues.push("generated swirl track extends outside layout at " + key);
        return;
      }
      if (specialByCell[key] || normalizedLayoutRows[neighbor.row].charAt(neighbor.col) === ".") {
        issues.push("generated swirl track must contain only ordinary balls at " + key);
      }
    });
  });
  var wormholesByRow = {};
  level.specialEntities.filter(function (entity) {
    return entity.entityType === "wormhole";
  }).forEach(function (wormhole) {
    if (!wormholesByRow[wormhole.row]) {
      wormholesByRow[wormhole.row] = [];
    }
    wormholesByRow[wormhole.row].push(wormhole);
  });
  Object.keys(wormholesByRow).forEach(function (rowKey) {
    var pair = wormholesByRow[rowKey].sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      return;
    }
    for (var col = pair[0].col + 1; col < pair[1].col; col += 1) {
      var key = pair[0].row + ":" + col;
      if (specialByCell[key] || normalizedLayoutRows[pair[0].row].charAt(col) === ".") {
        issues.push("generated wormhole interior must contain only ordinary balls at " + key);
      }
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
    var hasUniqueColors = hasUniqueItems(level.colors);
    if (!hasUniqueColors) {
      issues.push("level.colors must not contain duplicates");
    }
    if (level.colors.length > CampaignLevelGenerationConfig.MAX_ACTIVE_COLOR_COUNT) {
      issues.push(
        "level.colors must contain at most " + CampaignLevelGenerationConfig.MAX_ACTIVE_COLOR_COUNT + " active colors"
      );
    }
    var hasSupportedColors = true;
    level.colors.forEach(function (color) {
      if (ALLOWED_COLORS.indexOf(color) === -1) {
        hasSupportedColors = false;
        issues.push("unsupported color in level.colors: " + color);
      }
    });
    if (hasUniqueColors && hasSupportedColors &&
        level.colors.length <= CampaignLevelGenerationConfig.MAX_ACTIVE_COLOR_COUNT) {
      try {
        CampaignLevelGenerationConfig.assertActiveNormalBallColors(expectedLevelId, level.colors);
      } catch (colorScheduleError) {
        issues.push(colorScheduleError.message);
      }
    }
  }

  if (!isPositiveInteger(level.colorCount) || level.colorCount !== level.colors.length) {
    issues.push("colorCount must equal level.colors.length");
  }

  validateLevelMode(level, issues);
  validateCampaignLevelModeSchedule(level, issues);
  validateTrappedSpriteRescue(level, issues);
  validateInitialDropSpaceRows(level, issues);

  if (!isPositiveInteger(level.targetScore)) {
    issues.push("targetScore must be a positive integer");
  }
  validateStarThresholds(level, issues);

  if (level.levelType === "trapped_sprite_rescue") {
    if (level.dropInterval !== undefined) {
      issues.push("trapped_sprite_rescue must not configure dropInterval");
    }
  } else if (!isPositiveInteger(level.dropInterval)) {
    issues.push("dropInterval must be a positive integer");
  }

  if (!isPositiveInteger(level.jarCount)) {
    issues.push("jarCount must be a positive integer");
  } else if (level.jarCount !== FIXED_JAR_COUNT) {
    issues.push("jarCount must equal " + FIXED_JAR_COUNT);
  }

  if (!Array.isArray(level.jarColors) || level.jarColors.length !== level.jarCount) {
    issues.push("jarColors length must equal jarCount");
  } else {
    var jarColorSet = {};
    level.jarColors.forEach(function (color) {
      if (ALLOWED_COLORS.indexOf(color) === -1) {
        issues.push("unsupported color in jarColors: " + color);
      }
      if (jarColorSet[color]) {
        issues.push("jarColors must contain five different colors: " + color);
      }
      jarColorSet[color] = true;
    });
    FIXED_JAR_COLORS.forEach(function (color) {
      if (!jarColorSet[color]) {
        issues.push("jarColors missing fixed color: " + color);
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
    if (level.layout.length < MIN_LAYOUT_ROWS) {
      issues.push("layout must contain at least " + MIN_LAYOUT_ROWS + " rows");
    }
    var layoutMaxColumns = BoardLayout.defaultColumns;
    var normalizedLayoutRows = [];
    level.layout.forEach(function (rowString, rowIndex) {
      if (typeof rowString !== "string") {
        issues.push("layout row #" + rowIndex + " must be string");
        return;
      }

      var expectedColumns = getExpectedRowColumns(rowIndex, layoutMaxColumns);
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

    if (normalizedLayoutRows.length && level.levelType !== "trapped_sprite_rescue") {
      var topRow = normalizedLayoutRows[0];
      var topOccupiedCount = topRow.split("").filter(function (cellCode) {
        return cellCode !== ".";
      }).length;
      (level.specialEntities || []).forEach(function (entity) {
        if (entity && !isWormholeEntity(entity) && entity.row === 0 && Number.isInteger(entity.col)) {
          topOccupiedCount += 1;
        }
      });
      if (topOccupiedCount <= 0) {
        issues.push("layout top row must contain at least one anchor");
      }
    }

    validateSpecialEntities(level, normalizedLayoutRows, issues);
    validateTimeBonusBalls(level, normalizedLayoutRows, expectedLevelId, issues);
    validateCampaignMechanicPlan(level, normalizedLayoutRows, expectedLevelId, issues);
    try {
      validateCampaignScoreDesign(
        level,
        normalizedLayoutRows,
        expectedLevelId,
        CampaignLevelGenerationConfig.isTrappedSpriteRescueLevelId(expectedLevelId)
          ? "rescue"
          : (expectedLevelId <= FirstHundredLevelDesign.LAST_LEVEL_ID
            ? FirstHundredLevelDesign.buildLevelSpec(expectedLevelId).designBeat
            : CampaignLevelGenerationConfig.getScoreDesignBeat(expectedLevelId)),
        issues
      );
    } catch (scoreDesignError) {
      issues.push(scoreDesignError.message);
    }
    var occupiedRowCount = countOccupiedLayoutRows(normalizedLayoutRows, level.specialEntities);
    if (occupiedRowCount < MIN_OCCUPIED_LAYOUT_ROWS) {
      issues.push(
        "layout must occupy at least " + MIN_OCCUPIED_LAYOUT_ROWS +
        " rows, got " + occupiedRowCount
      );
    }
    if (Array.isArray(level.specialEntities)) {
      try {
        LevelBoardSupportValidator.findUnsupportedInitialCells({
          layout: normalizedLayoutRows,
          specialEntities: level.specialEntities,
          levelType: level.levelType,
          trappedSpriteRescue: level.trappedSpriteRescue
        }, "level_" + String(expectedLevelId).padStart(3, "0")).forEach(function (cell) {
          issues.push("initial board cell has no support at " + cell.row + ":" + cell.col);
        });
      } catch (supportError) {
        issues.push(supportError.message);
      }
    }
    if (Array.isArray(level.specialEntities)) {
      try {
        LevelBoardSupportValidator.assertGeneratedBoardRules({
          layout: normalizedLayoutRows,
          specialEntities: level.specialEntities,
          levelType: level.levelType,
          trappedSpriteRescue: level.trappedSpriteRescue
        }, "level_" + String(expectedLevelId).padStart(3, "0"));
      } catch (generationRuleError) {
        issues.push(generationRuleError.message);
      }
    }
  }

  validateObjectives(level.winConditions, "win", level, issues);
  validateObjectives(level.bonusObjectives, "bonus", level, issues);
  if (level.levelType !== "trapped_sprite_rescue" &&
      expectedLevelId > FirstHundredLevelDesign.LAST_LEVEL_ID &&
      ClusteredLevelLayout.shouldRedesign(expectedLevelId)) {
    try {
      var clusteredMetrics = ClusteredLevelLayout.validateClusteredLevel(level);
      var requiredGroupedRatio = expectedLevelId <= 40 ? 0.7 : 0.55;
      if (clusteredMetrics.groupedRatio < requiredGroupedRatio) {
        issues.push(
          "clustered color coverage must be >= " +
          Math.round(requiredGroupedRatio * 100) + "%"
        );
      }
      var allowedIsolatedRatio = typeof clusteredMetrics.allowedIsolatedRatio === "number"
        ? clusteredMetrics.allowedIsolatedRatio
        : 0.1;
      if (clusteredMetrics.isolatedRatio > allowedIsolatedRatio) {
        issues.push("clustered isolated color ratio must be <= " + Math.round(allowedIsolatedRatio * 100) + "%");
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (expectedLevelId <= FirstHundredLevelDesign.LAST_LEVEL_ID) {
    try {
      FirstHundredLevelDesign.validateGeneratedLevel(level);
    } catch (error) {
      issues.push(error.message);
    }
  }
  var cascadeBalancePolicy = CampaignLevelGenerationConfig.getClearanceRebalanceCascadePolicy(expectedLevelId);
  if (cascadeBalancePolicy !== null && Array.isArray(normalizedLayoutRows) && Array.isArray(level.specialEntities)) {
    try {
      var cascadeRisk = ClusteredLevelLayout.analyzeCascadeRisk({
        levelId: expectedLevelId,
        rows: normalizedLayoutRows,
        specialEntities: level.specialEntities,
        levelType: level.levelType,
        trappedSpriteRescue: level.trappedSpriteRescue
      });
      if (cascadeRisk.maximumImmediateImpactRatio > cascadeBalancePolicy.maximumImmediateImpactRatio) {
        issues.push(
          "immediate cascade impact ratio must be <= " +
          Math.round(cascadeBalancePolicy.maximumImmediateImpactRatio * 100) +
          "%, got " + Math.round(cascadeRisk.maximumImmediateImpactRatio * 100) + "%"
        );
      }
    } catch (cascadeError) {
      issues.push(cascadeError.message);
    }
  }
  validateSplitterObjectives(level, issues);
  validateKeyLockCounts(level, issues);
  validateInitialShotBalls(level, issues);
  validateOpeningShotBalls(level, issues);
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

  var manifest = LevelPackManifest.normalizeManifest(readJson(MANIFEST_PATH));
  var manifestPacksById = {};
  manifest.packs.forEach(function (packInfo) {
    manifestPacksById[packInfo.id] = packInfo;
  });
  var entries = [];
  fs.readdirSync(REMOTE_PACK_DIR)
    .filter(function (fileName) {
      return /^levels_pack_\d{3,}_\d{3,}\.json$/.test(fileName);
    })
    .sort()
    .forEach(function (fileName) {
      var packPath = path.join(REMOTE_PACK_DIR, fileName);
      var packText = readText(packPath);
      var pack = JSON.parse(packText);
      if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
        throw new Error("remote level pack must be object: " + fileName);
      }
      if (pack.schemaVersion !== 1) {
        throw new Error("remote level pack schemaVersion must be 1: " + fileName);
      }
      if (pack.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V2) {
        throw new Error("remote level pack format must be " + LevelPackCompactCodec.PACK_FORMAT_COMPACT_V2 + ": " + fileName);
      }
      if (typeof pack.packId !== "string" || !pack.packId) {
        throw new Error("remote level pack packId is required: " + fileName);
      }
      if (!Number.isInteger(pack.from) || !Number.isInteger(pack.to) || pack.from <= 0 || pack.to < pack.from) {
        throw new Error("remote level pack range invalid: " + fileName);
      }
      var manifestPack = manifestPacksById[pack.packId];
      if (!manifestPack) {
        throw new Error("remote level pack missing from manifest: " + fileName);
      }
      if (manifestPack.from !== pack.from || manifestPack.to !== pack.to || manifestPack.format !== pack.format) {
        throw new Error("remote level pack manifest metadata mismatch: " + fileName);
      }
      LevelPackIntegrity.assertPackTextMatches(manifestPack, packText);
      pack = LevelPackCompactCodec.expandPack(pack);
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

function validateTrappedSpriteRescueSchedule(entries) {
  var actualLevelIds = entries.filter(function (entry) {
    return entry.data && entry.data.level && entry.data.level.levelType === "trapped_sprite_rescue";
  }).map(function (entry) {
    return entry.levelId;
  });
  var expectedLevelIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS;
  if (actualLevelIds.length !== 50) {
    return ["trapped sprite rescue schedule must contain 50 levels, found " + actualLevelIds.length];
  }
  if (JSON.stringify(actualLevelIds) !== JSON.stringify(expectedLevelIds)) {
    return [
      "trapped sprite rescue schedule differs from campaign policy: expected " +
      expectedLevelIds.join(",") + ", got " + actualLevelIds.join(",")
    ];
  }
  return [];
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
  validateTrappedSpriteRescueSchedule(entries).forEach(function (issue) {
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
