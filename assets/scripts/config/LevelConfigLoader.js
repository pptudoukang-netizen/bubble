"use strict";

var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");
var AimTuningProfiles = require("./AimTuningProfiles");
var BoardLayout = require("./BoardLayout");
var BoardOcclusionConfig = require("./BoardOcclusionConfig");
var LevelBoardSupportValidator = require("./LevelBoardSupportValidator");
var AssistSpiritConfig = require("./AssistSpiritConfig");

var SPECIAL_ENTITY_TYPES = {
  hazard_ball: ["black_hole", "mine"],
  skill_ball: ["rainbow", "blast", "crystal_gun"],
  obstacle_ball: ["stone", "ice"],
  reactive_ball: ["breeder", "bud", "molotov", "spirit_cocoon", "splitter", "swirl", "transparent_ball", "vine_spirit", "wind_tunnel_entrance", "wind_tunnel_exit", "wormhole"],
  locked_ball: ["locked"],
  key_ball: ["key"]
};
var TRAPPED_SPRITE_ALLOWED_SPECIAL_ENTITY_KEYS = {
  "skill_ball:rainbow": true,
  "skill_ball:blast": true,
  "obstacle_ball:stone": true,
  "obstacle_ball:ice": true,
  "reactive_ball:swirl": true,
  "reactive_ball:vine_spirit": true
};
var ALLOWED_COLORS = ["R", "G", "B", "Y", "P", "K", "O", "W"];
var MAX_ACTIVE_COLOR_COUNT = 5;
var ALLOWED_INNER_COLORS = ALLOWED_COLORS.slice();
var ALLOWED_SPLITTER_COLORS = ["R", "G", "B", "Y", "P"];
var ALLOWED_CLEAR_REWARD_ITEM_IDS = ["coin", "stamina"];
var TOP_BOARD_ROW_INDEX = 0;
var WORMHOLE_MOVE_DIRECTIONS = ["left", "right"];
var POISON_PARTICLE_COUNT = 3;
var DEFAULT_MINE_INITIAL_LIFE = 6;
var COLOR_CLOUD_RAINBOW_CODE = "RAINBOW";
var COLOR_CLOUD_CONFIG_KEYS = ["color", "hitDispearTime", "position", "speed", "startTime", "visible"];
var SPIDER_ROW_CONFIG_KEYS = ["col", "id", "lockRowId", "row"];
var INITIAL_POWERUP_TYPES = ["swap", "barrier_hammer", "rainbow_prism_ball"];

function normalizeInitialPowerups(levelConfig, levelKey) {
  var source = levelConfig.initialPowerups;
  if (source === undefined) {
    return {
      swap: 0,
      barrier_hammer: 0,
      rainbow_prism_ball: 0
    };
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("level.initialPowerups must be an object when configured: " + levelKey);
  }
  Object.keys(source).forEach(function (powerupType) {
    if (INITIAL_POWERUP_TYPES.indexOf(powerupType) === -1) {
      throw new Error("level.initialPowerups contains unsupported type `" + powerupType + "`: " + levelKey);
    }
    if (!Number.isInteger(source[powerupType]) || source[powerupType] < 0) {
      throw new Error("level.initialPowerups." + powerupType + " must be a non-negative integer: " + levelKey);
    }
  });
  var normalized = {};
  INITIAL_POWERUP_TYPES.forEach(function (powerupType) {
    normalized[powerupType] = Object.prototype.hasOwnProperty.call(source, powerupType)
      ? source[powerupType]
      : 0;
  });
  return normalized;
}

function normalizeColorClouds(levelConfig, levelKey) {
  if (levelConfig.colorClouds === undefined) {
    return [];
  }
  if (!Array.isArray(levelConfig.colorClouds)) {
    throw new Error("level.colorClouds must be an array: " + levelKey);
  }
  return levelConfig.colorClouds.map(function (cloud, index) {
    var fieldName = "level.colorClouds[" + index + "]";
    if (!cloud || typeof cloud !== "object" || Array.isArray(cloud)) {
      throw new Error(fieldName + " must be an object: " + levelKey);
    }
    var actualKeys = Object.keys(cloud).sort();
    if (actualKeys.join("|") !== COLOR_CLOUD_CONFIG_KEYS.slice().sort().join("|")) {
      throw new Error(fieldName + " must contain exactly visible, position, hitDispearTime, startTime, speed and color: " + levelKey);
    }
    if (typeof cloud.visible !== "boolean") {
      throw new Error(fieldName + ".visible must be boolean: " + levelKey);
    }
    if (!cloud.position || typeof cloud.position !== "object" || Array.isArray(cloud.position)) {
      throw new Error(fieldName + ".position must be an object: " + levelKey);
    }
    if (Object.keys(cloud.position).sort().join("|") !== "x|y") {
      throw new Error(fieldName + ".position must contain exactly x and y: " + levelKey);
    }
    if (
      typeof cloud.position.x !== "number" || !isFinite(cloud.position.x) ||
      typeof cloud.position.y !== "number" || !isFinite(cloud.position.y)
    ) {
      throw new Error(fieldName + ".position x/y must be finite numbers: " + levelKey);
    }
    if (!Number.isInteger(cloud.hitDispearTime) || cloud.hitDispearTime <= 0) {
      throw new Error(fieldName + ".hitDispearTime must be a positive integer: " + levelKey);
    }
    if (typeof cloud.startTime !== "number" || !isFinite(cloud.startTime) || cloud.startTime < 0) {
      throw new Error(fieldName + ".startTime must be a non-negative finite number: " + levelKey);
    }
    if (typeof cloud.speed !== "number" || !isFinite(cloud.speed) || cloud.speed === 0) {
      throw new Error(fieldName + ".speed must be a non-zero finite number: " + levelKey);
    }
    if (
      cloud.color !== COLOR_CLOUD_RAINBOW_CODE &&
      (ALLOWED_COLORS.indexOf(cloud.color) === -1 || levelConfig.colors.indexOf(cloud.color) === -1)
    ) {
      throw new Error(fieldName + ".color must be RAINBOW or a color in level.colors: " + levelKey);
    }
    return cloud;
  });
}

function isWormholeEntity(entity) {
  return !!(
    entity &&
    entity.entityCategory === "reactive_ball" &&
    entity.entityType === "wormhole"
  );
}

function isBlackHoleEntity(entity) {
  return !!(
    entity &&
    entity.entityCategory === "hazard_ball" &&
    entity.entityType === "black_hole"
  );
}

function isMineEntity(entity) {
  return !!(
    entity &&
    entity.entityCategory === "hazard_ball" &&
    entity.entityType === "mine"
  );
}
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
  special_floating_island: true,
  trapped_sprite_rescue: true,
  multi_trapped_spirit_rescue: true
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
var MIN_LAYOUT_ROWS = 8;
var MIN_OCCUPIED_LAYOUT_ROWS = 8;
var FIXED_JAR_COLORS = ["R", "G", "B", "Y", "P"];
var FIXED_JAR_COUNT = FIXED_JAR_COLORS.length;
var MAX_SHOT_LIMIT = 54;
var CLEAR_REWARD_START_LEVEL_ID = 1;
var TIMED_LEVEL_TIME_BONUS_SECONDS = 5;
var TIMED_LEVEL_MIN_TIME_BONUS_BALLS = 2;
var TIMED_LEVEL_MAX_TIME_BONUS_BALLS = 5;

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

function validateRowString(rowIndex, rowString, levelColors, levelKey, maxColumns) {
  if (typeof rowString !== "string") {
    throw new Error("level.layout row must be a string at index " + rowIndex + ": " + levelKey);
  }

  var expectedColumns = BoardLayout.getRowColumnCount(rowIndex, maxColumns);
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
  if (layout.length < MIN_LAYOUT_ROWS) {
    throw new Error("Level layout must contain at least " + MIN_LAYOUT_ROWS + " rows: " + levelKey);
  }

  var maxColumns = BoardLayout.defaultColumns;

  return layout.map(function (rowString, rowIndex) {
    return validateRowString(rowIndex, rowString, levelColors, levelKey, maxColumns);
  });
}

function normalizeCellAttachments(levelConfig, levelKey) {
  if (levelConfig.cellAttachments === undefined) {
    return [];
  }
  if (!Array.isArray(levelConfig.cellAttachments)) {
    throw new Error("level.cellAttachments must be an array: " + levelKey);
  }

  var seenIds = {};
  var seenCoordinates = {};
  return levelConfig.cellAttachments.map(function (attachment, index) {
    var fieldName = "level.cellAttachments[" + index + "]";
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      throw new Error(fieldName + " must be an object: " + levelKey);
    }
    if (typeof attachment.id !== "string" || !attachment.id.trim()) {
      throw new Error(fieldName + ".id must be non-empty: " + levelKey);
    }
    var id = attachment.id.trim();
    if (seenIds[id]) {
      throw new Error("level.cellAttachments contains duplicate id `" + id + "`: " + levelKey);
    }
    seenIds[id] = true;
    if (
      attachment.type !== "poison" &&
      attachment.type !== "ice_crystal" &&
      attachment.type !== "bubble_shield"
    ) {
      throw new Error(fieldName + ".type must be `poison`, `ice_crystal`, or `bubble_shield`: " + levelKey);
    }
    if (!Number.isInteger(attachment.row) || attachment.row < 0 || attachment.row >= levelConfig.layout.length) {
      throw new Error(fieldName + ".row is outside level.layout: " + levelKey);
    }
    var row = levelConfig.layout[attachment.row];
    if (!Number.isInteger(attachment.col) || attachment.col < 0 || attachment.col >= row.length) {
      throw new Error(fieldName + ".col is outside level.layout row: " + levelKey);
    }
    if (
      Array.isArray(levelConfig.specialEntities) &&
      levelConfig.specialEntities.some(function (entity) {
        return entity && entity.row === attachment.row && entity.col === attachment.col;
      })
    ) {
      throw new Error(fieldName + " " + attachment.type + " target must be an ordinary ball: " + levelKey);
    }
    if (row.charAt(attachment.col) === ".") {
      throw new Error(fieldName + " " + attachment.type + " target must be an ordinary ball: " + levelKey);
    }
    if (attachment.type === "poison" && attachment.particleCount !== POISON_PARTICLE_COUNT) {
      throw new Error(fieldName + ".particleCount must equal " + POISON_PARTICLE_COUNT + ": " + levelKey);
    }
    if (attachment.type !== "poison" && attachment.particleCount !== undefined) {
      throw new Error(fieldName + ".particleCount is not allowed for " + attachment.type + ": " + levelKey);
    }
    var coordinateKey = attachment.row + ":" + attachment.col;
    if (seenCoordinates[coordinateKey]) {
      throw new Error("level.cellAttachments contains duplicate target `" + coordinateKey + "`: " + levelKey);
    }
    seenCoordinates[coordinateKey] = true;
    var normalizedAttachment = {
      id: id,
      type: attachment.type,
      row: attachment.row,
      col: attachment.col
    };
    if (attachment.type === "poison") {
      normalizedAttachment.particleCount = POISON_PARTICLE_COUNT;
    }
    return normalizedAttachment;
  });
}

function normalizeSpiderRows(levelConfig, levelKey) {
  if (levelConfig.spiderRows === undefined) {
    return undefined;
  }
  if (!Array.isArray(levelConfig.spiderRows)) {
    throw new Error("level.spiderRows must be an array: " + levelKey);
  }
  if (!Array.isArray(levelConfig.layout) || !Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.spiderRows requires normalized layout and specialEntities: " + levelKey);
  }
  if (!Array.isArray(levelConfig.cellAttachments)) {
    throw new Error("level.spiderRows requires normalized cellAttachments: " + levelKey);
  }

  var specialCells = {};
  levelConfig.specialEntities.forEach(function (entity) {
    specialCells[entity.row + ":" + entity.col] = true;
  });
  var attachmentCells = {};
  levelConfig.cellAttachments.forEach(function (attachment) {
    attachmentCells[attachment.row + ":" + attachment.col] = true;
  });

  var seenIds = {};
  var seenCoordinates = {};
  var rowLockIds = {};
  var lockIdRows = {};
  return levelConfig.spiderRows.map(function (spider, index) {
    var fieldName = "level.spiderRows[" + index + "]";
    if (!spider || typeof spider !== "object" || Array.isArray(spider)) {
      throw new Error(fieldName + " must be an object: " + levelKey);
    }
    if (Object.keys(spider).sort().join("|") !== SPIDER_ROW_CONFIG_KEYS.join("|")) {
      throw new Error(fieldName + " must contain exactly id, lockRowId, row and col: " + levelKey);
    }
    var id = typeof spider.id === "string" ? spider.id.trim() : "";
    if (!id) {
      throw new Error(fieldName + ".id must be non-empty: " + levelKey);
    }
    if (seenIds[id]) {
      throw new Error("level.spiderRows contains duplicate id `" + id + "`: " + levelKey);
    }
    seenIds[id] = true;
    var lockRowId = typeof spider.lockRowId === "string" ? spider.lockRowId.trim() : "";
    if (!lockRowId) {
      throw new Error(fieldName + ".lockRowId must be non-empty: " + levelKey);
    }
    if (!Number.isInteger(spider.row) || spider.row < 0 || spider.row >= levelConfig.layout.length) {
      throw new Error(fieldName + ".row is outside level.layout: " + levelKey);
    }
    var rowText = levelConfig.layout[spider.row];
    if (!Number.isInteger(spider.col) || spider.col < 0 || spider.col >= rowText.length) {
      throw new Error(fieldName + ".col is outside level.layout row: " + levelKey);
    }
    var coordinateKey = spider.row + ":" + spider.col;
    if (seenCoordinates[coordinateKey]) {
      throw new Error("level.spiderRows contains duplicate anchor `" + coordinateKey + "`: " + levelKey);
    }
    seenCoordinates[coordinateKey] = true;
    if (rowText.charAt(spider.col) === "." || specialCells[coordinateKey]) {
      throw new Error(fieldName + " anchor must be an ordinary ball: " + levelKey);
    }
    if (attachmentCells[coordinateKey]) {
      throw new Error(fieldName + " anchor must not contain another cell attachment: " + levelKey);
    }
    if (rowLockIds[spider.row] && rowLockIds[spider.row] !== lockRowId) {
      throw new Error("level.spiderRows row " + spider.row + " must use one lockRowId: " + levelKey);
    }
    if (Object.prototype.hasOwnProperty.call(lockIdRows, lockRowId) && lockIdRows[lockRowId] !== spider.row) {
      throw new Error("level.spiderRows lockRowId `" + lockRowId + "` must not span rows: " + levelKey);
    }
    rowLockIds[spider.row] = lockRowId;
    lockIdRows[lockRowId] = spider.row;
    return {
      id: id,
      lockRowId: lockRowId,
      row: spider.row,
      col: spider.col
    };
  });
}

function validateTopRowAnchored(layout, specialEntities, levelKey) {
  var topRow = layout[TOP_BOARD_ROW_INDEX];
  if (typeof topRow !== "string") {
    throw new Error("Level layout top row must be a string: " + levelKey);
  }
  var occupiedCount = topRow.split("").filter(function (cellCode) {
    return cellCode !== ".";
  }).length;
  (specialEntities || []).forEach(function (entity) {
    if (
      entity &&
      !isWormholeEntity(entity) &&
      entity.row === TOP_BOARD_ROW_INDEX &&
      Number.isInteger(entity.col)
    ) {
      occupiedCount += 1;
    }
  });
  if (occupiedCount <= 0) {
    throw new Error("Level layout top row must contain at least one anchor: " + levelKey);
  }
}

function normalizeTrappedSpriteRescue(levelConfig, levelKey) {
  var isRescueLevel = levelConfig.levelType === "trapped_sprite_rescue";
  var rescue = levelConfig.trappedSpriteRescue;
  if (!isRescueLevel) {
    if (rescue !== undefined) {
      throw new Error("level.trappedSpriteRescue is only valid for trapped_sprite_rescue: " + levelKey);
    }
    return;
  }
  if (!rescue || typeof rescue !== "object" || Array.isArray(rescue)) {
    throw new Error("trapped_sprite_rescue requires level.trappedSpriteRescue: " + levelKey);
  }
  if (Object.prototype.hasOwnProperty.call(rescue, "spriteId")) {
    throw new Error("level.trappedSpriteRescue.spriteId is obsolete; use spiritId: " + levelKey);
  }
  try {
    AssistSpiritConfig.getSpirit(rescue.spiritId);
  } catch (error) {
    throw new Error("level.trappedSpriteRescue.spiritId is invalid: " + levelKey + ": " + error.message);
  }
  if (
    !rescue.anchorCell ||
    !Number.isInteger(rescue.anchorCell.row) ||
    !Number.isInteger(rescue.anchorCell.col) ||
    rescue.anchorCell.row < 0 ||
    rescue.anchorCell.row >= levelConfig.layout.length ||
    rescue.anchorCell.col < 0 ||
    rescue.anchorCell.col >= BoardLayout.getRowColumnCount(rescue.anchorCell.row, BoardLayout.defaultColumns)
  ) {
    throw new Error("level.trappedSpriteRescue.anchorCell must be a valid board coordinate: " + levelKey);
  }
  if (levelConfig.layout[rescue.anchorCell.row].charAt(rescue.anchorCell.col) !== ".") {
    throw new Error("level.trappedSpriteRescue.anchorCell must remain empty for the trapped sprite: " + levelKey);
  }
  if (!rescue.worldCenter || typeof rescue.worldCenter !== "object" || Array.isArray(rescue.worldCenter)) {
    throw new Error("level.trappedSpriteRescue.worldCenter must be an object: " + levelKey);
  }
  assertNumberInRange(rescue.worldCenter.x, "level.trappedSpriteRescue.worldCenter.x", BoardLayout.boardLeft, BoardLayout.boardRight, levelKey);
  assertNumberInRange(rescue.worldCenter.y, "level.trappedSpriteRescue.worldCenter.y", BoardLayout.getCannonTopLineY(), BoardLayout.boardStartY, levelKey);
  assertNumberInRange(rescue.renderScale, "level.trappedSpriteRescue.renderScale", 0.5, 3, levelKey);

  var rotation = rescue.rotation;
  if (!rotation || typeof rotation !== "object" || Array.isArray(rotation)) {
    throw new Error("level.trappedSpriteRescue.rotation must be an object: " + levelKey);
  }
  [
    "projectileImpulse",
    "torqueScale",
    "coreInertia",
    "maxAngularSpeedDeg",
    "angularDamping",
    "stopAngularSpeedDeg",
    "maxStepAngleDeg",
    "maxDurationSec"
  ].forEach(function (fieldName) {
    if (typeof rotation[fieldName] !== "number" || !isFinite(rotation[fieldName]) || rotation[fieldName] <= 0) {
      throw new Error("level.trappedSpriteRescue.rotation." + fieldName + " must be positive: " + levelKey);
    }
  });
  assertNumberInRange(
    rotation.tangentialDeadZone,
    "level.trappedSpriteRescue.rotation.tangentialDeadZone",
    0,
    0.95,
    levelKey
  );
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("trapped_sprite_rescue requires normalized level.specialEntities: " + levelKey);
  }
  levelConfig.specialEntities.forEach(function (entity, index) {
    var entityKey = entity.entityCategory + ":" + entity.entityType;
    if (TRAPPED_SPRITE_ALLOWED_SPECIAL_ENTITY_KEYS[entityKey] !== true) {
      throw new Error(
        "trapped_sprite_rescue specialEntities[" + index + "] is incompatible: " + entityKey + ": " + levelKey
      );
    }
    if (entity.row === TOP_BOARD_ROW_INDEX) {
      throw new Error("trapped_sprite_rescue special entity must not occupy the top row: " + levelKey);
    }
    if (entity.row === rescue.anchorCell.row && entity.col === rescue.anchorCell.col) {
      throw new Error("trapped_sprite_rescue anchorCell overlaps a special entity: " + levelKey);
    }
  });
  if (levelConfig.layout[TOP_BOARD_ROW_INDEX].split("").some(function (cellCode) {
    return cellCode !== ".";
  })) {
    throw new Error("trapped_sprite_rescue top row must be empty: " + levelKey);
  }
}

function normalizeMultiTrappedSpiritRescue(levelConfig, levelKey) {
  var isMultiRescueLevel = levelConfig.levelType === "multi_trapped_spirit_rescue";
  var rescue = levelConfig.multiTrappedSpiritRescue;
  if (!isMultiRescueLevel) {
    if (rescue !== undefined) {
      throw new Error("level.multiTrappedSpiritRescue is only valid for multi_trapped_spirit_rescue: " + levelKey);
    }
    return;
  }
  if (levelConfig.trappedSpriteRescue !== undefined) {
    throw new Error("multi_trapped_spirit_rescue must not configure level.trappedSpriteRescue: " + levelKey);
  }
  if (!rescue || typeof rescue !== "object" || Array.isArray(rescue)) {
    throw new Error("multi_trapped_spirit_rescue requires level.multiTrappedSpiritRescue: " + levelKey);
  }
  if (!Array.isArray(rescue.targets) || rescue.targets.length < 2) {
    throw new Error("level.multiTrappedSpiritRescue.targets must contain at least two targets: " + levelKey);
  }
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("multi_trapped_spirit_rescue requires normalized level.specialEntities: " + levelKey);
  }
  var targetCoordinates = {};
  var targetSpiritIds = {};
  rescue.targets = rescue.targets.map(function (target, index) {
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error("level.multiTrappedSpiritRescue.targets[" + index + "] must be an object: " + levelKey);
    }
    try {
      AssistSpiritConfig.getSpirit(target.spiritId);
    } catch (error) {
      throw new Error("level.multiTrappedSpiritRescue.targets[" + index + "].spiritId is invalid: " + levelKey + ": " + error.message);
    }
    if (targetSpiritIds[target.spiritId]) {
      throw new Error("level.multiTrappedSpiritRescue.targets must not duplicate spiritId `" + target.spiritId + "`: " + levelKey);
    }
    if (
      !Number.isInteger(target.row) ||
      !Number.isInteger(target.col) ||
      target.row <= TOP_BOARD_ROW_INDEX ||
      target.row >= levelConfig.layout.length ||
      target.col < 0 ||
      target.col >= BoardLayout.getRowColumnCount(target.row, BoardLayout.defaultColumns)
    ) {
      throw new Error("level.multiTrappedSpiritRescue.targets[" + index + "] must be a non-top-row board coordinate: " + levelKey);
    }
    var coordinateKey = target.row + ":" + target.col;
    if (targetCoordinates[coordinateKey]) {
      throw new Error("level.multiTrappedSpiritRescue.targets contains duplicate coordinate `" + coordinateKey + "`: " + levelKey);
    }
    if (levelConfig.layout[target.row].charAt(target.col) !== ".") {
      throw new Error("level.multiTrappedSpiritRescue target cell must remain empty at `" + coordinateKey + "`: " + levelKey);
    }
    if (levelConfig.specialEntities.some(function (entity) {
      return entity.row === target.row && entity.col === target.col;
    })) {
      throw new Error("level.multiTrappedSpiritRescue target overlaps a special entity at `" + coordinateKey + "`: " + levelKey);
    }
    var hasAdjacentNormalSupport = getHexNeighborCoordinates(target.row, target.col).some(function (neighbor) {
      return neighbor.row >= 0 &&
        neighbor.row < levelConfig.layout.length &&
        neighbor.col >= 0 &&
        neighbor.col < levelConfig.layout[neighbor.row].length &&
        levelConfig.layout[neighbor.row].charAt(neighbor.col) !== ".";
    });
    if (!hasAdjacentNormalSupport) {
      throw new Error("level.multiTrappedSpiritRescue target requires adjacent eliminable normal support at `" + coordinateKey + "`: " + levelKey);
    }
    targetCoordinates[coordinateKey] = true;
    targetSpiritIds[target.spiritId] = true;
    return {
      spiritId: target.spiritId,
      row: target.row,
      col: target.col
    };
  });
  if (
    !Array.isArray(levelConfig.winConditions) ||
    levelConfig.winConditions.length !== 1 ||
    levelConfig.winConditions[0].type !== "clear_all" ||
    levelConfig.winConditions[0].value !== 1
  ) {
    throw new Error("multi_trapped_spirit_rescue must use one clear_all win condition: " + levelKey);
  }
  if (levelConfig.starThresholds.star1 > rescue.targets.length * 1000) {
    throw new Error("multi_trapped_spirit_rescue star1 must not exceed guaranteed rescue score: " + levelKey);
  }
}

function countOccupiedLayoutRows(layout, specialEntities) {
  var occupiedRows = {};
  layout.forEach(function (rowString, rowIndex) {
    for (var colIndex = 0; colIndex < rowString.length; colIndex += 1) {
      if (rowString.charAt(colIndex) !== ".") {
        occupiedRows[rowIndex] = true;
        break;
      }
    }
  });
  specialEntities.forEach(function (entity) {
    if (!isWormholeEntity(entity)) {
      occupiedRows[entity.row] = true;
    }
  });
  return Object.keys(occupiedRows).length;
}

function validateOccupiedLayoutRows(layout, specialEntities, levelKey) {
  var occupiedRowCount = countOccupiedLayoutRows(layout, specialEntities);
  if (occupiedRowCount < MIN_OCCUPIED_LAYOUT_ROWS) {
    throw new Error(
      "Level layout must occupy at least " + MIN_OCCUPIED_LAYOUT_ROWS +
      " rows, got " + occupiedRowCount + ": " + levelKey
    );
  }
}

function validateEntityType(category, entityType) {
  if (!Object.prototype.hasOwnProperty.call(SPECIAL_ENTITY_TYPES, category)) {
    return false;
  }
  return SPECIAL_ENTITY_TYPES[category].indexOf(entityType) !== -1;
}

function getHexNeighborCoordinates(row, col) {
  var offsets = row % 2 === 1 ? [
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 }
  ] : [
    { row: -1, col: -1 },
    { row: -1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 0 }
  ];
  return offsets.map(function (offset) {
    return {
      row: row + offset.row,
      col: col + offset.col
    };
  });
}

function validateSwirlTracks(normalizedLayout, normalizedEntities, levelKey) {
  var specialByCoordinate = {};
  var claimedTrackCoordinates = {};
  normalizedEntities.forEach(function (entity) {
    specialByCoordinate[entity.row + ":" + entity.col] = entity;
  });

  normalizedEntities.forEach(function (entity, entityIndex) {
    if (entity.entityCategory !== "reactive_ball" || entity.entityType !== "swirl") {
      return;
    }
    var trackCoordinates = getHexNeighborCoordinates(entity.row, entity.col);
    trackCoordinates.forEach(function (coordinate) {
      if (
        coordinate.row < 0 ||
        coordinate.row >= normalizedLayout.length ||
        coordinate.col < 0 ||
        coordinate.col >= normalizedLayout[coordinate.row].length
      ) {
        throw new Error(
          "specialEntities[" + entityIndex + "] swirl requires a complete six-cell hex track: " + levelKey
        );
      }
      var coordinateKey = coordinate.row + ":" + coordinate.col;
      if (specialByCoordinate[coordinateKey]) {
        throw new Error(
          "specialEntities[" + entityIndex + "] swirl track must not contain another special entity at `" +
          coordinateKey + "`: " + levelKey
        );
      }
      if (claimedTrackCoordinates[coordinateKey]) {
        throw new Error(
          "swirl tracks must not overlap at `" + coordinateKey + "`: " + levelKey
        );
      }
      claimedTrackCoordinates[coordinateKey] = true;
    });
  });
}

function validateWormholePair(normalizedEntities, levelKey) {
  var wormholes = normalizedEntities.filter(function (entity) {
    return entity.entityCategory === "reactive_ball" && entity.entityType === "wormhole";
  });
  if (!wormholes.length) {
    return;
  }
  var byRow = {};
  wormholes.forEach(function (wormhole) {
    if (!byRow[wormhole.row]) {
      byRow[wormhole.row] = [];
    }
    byRow[wormhole.row].push(wormhole);
  });
  Object.keys(byRow).forEach(function (rowKey) {
    var pair = byRow[rowKey].sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      throw new Error("each wormhole row must contain exactly two endpoints: " + levelKey + " row " + rowKey);
    }
    if (pair[1].col - pair[0].col < 2) {
      throw new Error("wormhole pair must contain at least one interior slot: " + levelKey + " row " + rowKey);
    }
    if (pair[0].moveDirection !== pair[1].moveDirection) {
      throw new Error("wormhole pair moveDirection must match: " + levelKey + " row " + rowKey);
    }
  });
}

function validateWindTunnelSystem(normalizedEntities, levelKey) {
  var entrances = normalizedEntities.filter(function (entity) {
    return entity.entityCategory === "reactive_ball" && entity.entityType === "wind_tunnel_entrance";
  });
  var exits = normalizedEntities.filter(function (entity) {
    return entity.entityCategory === "reactive_ball" && entity.entityType === "wind_tunnel_exit";
  });
  if (!entrances.length && !exits.length) {
    return;
  }
  if (entrances.length !== 1) {
    throw new Error("wind tunnel system requires exactly one entrance: " + levelKey);
  }
  if (exits.length < 2) {
    throw new Error("wind tunnel system requires at least two exits: " + levelKey);
  }
}

function validateBreederInitialSpaces(normalizedLayout, normalizedEntities, levelKey) {
  var occupiedCells = {};
  normalizedLayout.forEach(function (rowString, row) {
    rowString.split("").forEach(function (cellCode, col) {
      if (cellCode !== ".") {
        occupiedCells[row + ":" + col] = true;
      }
    });
  });
  normalizedEntities.forEach(function (entity) {
    occupiedCells[entity.row + ":" + entity.col] = true;
  });

  normalizedEntities.forEach(function (entity, entityIndex) {
    if (entity.entityCategory !== "reactive_ball" || entity.entityType !== "breeder") {
      return;
    }
    var hasInitialEmptyNeighbor = getHexNeighborCoordinates(entity.row, entity.col).some(function (coordinate) {
      if (
        coordinate.row < 0 ||
        coordinate.row >= normalizedLayout.length ||
        coordinate.col < 0 ||
        coordinate.col >= normalizedLayout[coordinate.row].length
      ) {
        return false;
      }
      return occupiedCells[coordinate.row + ":" + coordinate.col] !== true;
    });
    if (!hasInitialEmptyNeighbor) {
      throw new Error(
        "specialEntities[" + entityIndex + "] breeder requires at least one initial empty neighbor: " + levelKey
      );
    }
  });
}

function hasUniqueItems(items) {
  return new Set(items).size === items.length;
}

function resolveExpectedLevelId(rawConfig, levelKey) {
  if (typeof levelKey !== "string") {
    throw new Error("levelKey must be a string.");
  }
  if (
    levelKey === "level_test" ||
    levelKey === "level_trapped_sprite_test" ||
    levelKey === "level_black_hole_test" ||
    levelKey === "level_spirit_cocoon_test" ||
    levelKey === "level_multi_trapped_spirit_test" ||
    levelKey === "level_transparent_ball_test" ||
    levelKey === "level_breeder_ball_test" ||
    levelKey === "level_mine_test" ||
    levelKey === "level_bud_test" ||
    levelKey === "level_crystal_gun_test" ||
    levelKey === "level_rainbow_prism_ball_test" ||
    levelKey === "level_poison_attachment_test" ||
    levelKey === "level_ice_crystal_attachment_test" ||
    levelKey === "level_bubble_shield_attachment_test" ||
    levelKey === "level_lock_chain_test" ||
    levelKey === "level_spider_test" ||
    levelKey === "level_wind_tunnel_test" ||
    levelKey === "level_color_cloud_test" ||
    levelKey === "level_board_occlusion_test"
  ) {
    if (!rawConfig || typeof rawConfig !== "object" || !rawConfig.level) {
      throw new Error("Test level config is missing `level`: " + levelKey);
    }
    return assertPositiveInteger(rawConfig.level.levelId, "level.levelId", levelKey);
  }
  var match = levelKey.match(/^level_(\d{3,})$/);
  if (!match) {
    throw new Error("levelKey must match level_### or higher: " + levelKey);
  }
  return Number(match[1]);
}

function resolveShotLimit(levelConfig, levelKey) {
  var shotLimit = assertPositiveInteger(levelConfig.shotLimit, "level.shotLimit", levelKey);
  if (shotLimit > MAX_SHOT_LIMIT) {
    throw new Error("level.shotLimit must be <= " + MAX_SHOT_LIMIT + ": " + levelKey);
  }
  return shotLimit;
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
  var hasCoinReward = false;
  var normalizedRewardItems = rewardItems.map(function (item, index) {
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
    if (id === "coin") {
      hasCoinReward = true;
    }

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
  if (!hasCoinReward) {
    throw new Error("level.clearRewardItems must include coin reward: " + levelKey);
  }
  return normalizedRewardItems;
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

  var normalizedEntities = levelConfig.specialEntities.map(function (entity, index) {
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
    var splitColor = null;
    var lockedColor = null;
    var blastRadius = null;
    var capacity = null;
    var moveDirection = null;
    var initialLife = null;
    if (category === "obstacle_ball" && entityType === "ice") {
      innerColor = typeof entity.innerColor === "string" ? entity.innerColor.trim() : "";
      if (ALLOWED_INNER_COLORS.indexOf(innerColor) === -1) {
        throw new Error("specialEntities[" + index + "].innerColor invalid for ice: " + levelKey);
      }
    }
    if (category === "reactive_ball" && entityType === "molotov") {
      blastRadius = entity.blastRadius;
      if (!Number.isInteger(blastRadius) || blastRadius !== 2) {
        throw new Error("specialEntities[" + index + "].blastRadius must be 2 for molotov: " + levelKey);
      }
    }
    if (category === "reactive_ball" && entityType === "splitter") {
      if (row === TOP_BOARD_ROW_INDEX) {
        throw new Error("specialEntities[" + index + "] splitter must not be placed in top board row: " + levelKey);
      }
      splitColor = typeof entity.splitColor === "string" ? entity.splitColor.trim() : "";
      if (levelConfig.colors.indexOf(splitColor) === -1) {
        throw new Error("specialEntities[" + index + "].splitColor must be in level.colors: " + levelKey);
      }
      if (ALLOWED_SPLITTER_COLORS.indexOf(splitColor) === -1) {
        throw new Error("specialEntities[" + index + "].splitColor has no splitter asset: " + levelKey);
      }
    }
    if (category === "reactive_ball" && entityType === "wormhole") {
      moveDirection = typeof entity.moveDirection === "string" ? entity.moveDirection.trim() : "";
      if (WORMHOLE_MOVE_DIRECTIONS.indexOf(moveDirection) === -1) {
        throw new Error("specialEntities[" + index + "].moveDirection must be left or right for wormhole: " + levelKey);
      }
    }
    if (isBlackHoleEntity(entity)) {
      capacity = entity.capacity;
      if (!Number.isInteger(capacity) || capacity !== 3) {
        throw new Error("specialEntities[" + index + "].capacity must be exactly 3 for black_hole: " + levelKey);
      }
    }
    if (isMineEntity(entity)) {
      initialLife = entity.initialLife === undefined
        ? DEFAULT_MINE_INITIAL_LIFE
        : entity.initialLife;
      if (!Number.isInteger(initialLife) || initialLife <= 0) {
        throw new Error("specialEntities[" + index + "].initialLife must be a positive integer for mine: " + levelKey);
      }
    }
    if (category === "locked_ball" && entityType === "locked") {
      lockedColor = typeof entity.lockedColor === "string" ? entity.lockedColor.trim() : "";
      if (levelConfig.colors.indexOf(lockedColor) === -1) {
        throw new Error("specialEntities[" + index + "].lockedColor must be in level.colors: " + levelKey);
      }
    }

    return {
      id: id,
      entityCategory: category,
      entityType: entityType,
      row: row,
      col: col,
      innerColor: innerColor,
      splitColor: splitColor,
      lockedColor: lockedColor,
      blastRadius: blastRadius,
      capacity: capacity,
      moveDirection: moveDirection,
      initialLife: initialLife
    };
  });
  validateSwirlTracks(normalizedLayout, normalizedEntities, levelKey);
  validateWormholePair(normalizedEntities, levelKey);
  validateWindTunnelSystem(normalizedEntities, levelKey);
  validateBreederInitialSpaces(normalizedLayout, normalizedEntities, levelKey);
  return normalizedEntities;
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
      if (!Array.isArray(levelConfig.jarColors) || levelConfig.jarColors.indexOf(color) === -1) {
        throw new Error("level." + fieldName + "[" + index + "].color must exist in level.jarColors: " + levelKey);
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

function validateSplitterObjectives(levelConfig, levelKey) {
  if (!Array.isArray(levelConfig.specialEntities) || !Array.isArray(levelConfig.winConditions)) {
    throw new Error("level must be normalized before splitter objective validation: " + levelKey);
  }
  var splitterColor = null;
  levelConfig.specialEntities.forEach(function (entity) {
    if (!entity || entity.entityCategory !== "reactive_ball" || entity.entityType !== "splitter") {
      return;
    }
    if (typeof entity.splitColor !== "string" || !entity.splitColor) {
      throw new Error("splitter requires splitColor before objective validation: " + levelKey);
    }
    if (splitterColor !== null && splitterColor !== entity.splitColor) {
      throw new Error("all splitters in one level must use the collect target color: " + levelKey);
    }
    splitterColor = entity.splitColor;
  });
  if (splitterColor === null) {
    return;
  }

  var collectColorConditions = levelConfig.winConditions.filter(function (objective) {
    return objective && objective.type === "collect_color";
  });
  if (collectColorConditions.length !== 1) {
    throw new Error("splitter level winConditions must contain exactly one collect_color objective: " + levelKey);
  }
  if (collectColorConditions[0].color !== splitterColor) {
    throw new Error("splitter level collect_color must match splitColor `" + splitterColor + "`: " + levelKey);
  }
}

function validateKeyLockRows(levelConfig, levelKey) {
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be normalized before key-lock validation: " + levelKey);
  }
  if (!Array.isArray(levelConfig.layout)) {
    throw new Error("level.layout must be normalized before key-lock validation: " + levelKey);
  }
  var rows = {};
  levelConfig.specialEntities.forEach(function (entity) {
    if (!entity) {
      throw new Error("key-lock validation received empty special entity: " + levelKey);
    }
    var isKey = entity.entityCategory === "key_ball" && entity.entityType === "key";
    var isLock = entity.entityCategory === "locked_ball" && entity.entityType === "locked";
    if (!isKey && !isLock) {
      return;
    }
    var rowKey = String(entity.row);
    if (!rows[rowKey]) {
      rows[rowKey] = {
        keys: [],
        locks: []
      };
    }
    rows[rowKey][isKey ? "keys" : "locks"].push(entity);
  });

  Object.keys(rows).forEach(function (rowKey) {
    var row = Number(rowKey);
    var group = rows[rowKey];
    if (group.keys.length !== 1) {
      throw new Error("lock chain row " + row + " must contain exactly one key: " + levelKey);
    }
    if (group.locks.length < 1) {
      throw new Error("lock chain row " + row + " must contain at least one locked ball: " + levelKey);
    }
    if (levelConfig.layout[row].replace(/\./g, "").length !== 0) {
      throw new Error("lock chain row " + row + " must not contain ordinary layout balls: " + levelKey);
    }
    var nonChainEntities = levelConfig.specialEntities.filter(function (entity) {
      if (!entity || entity.row !== row) {
        return false;
      }
      return !(
        (entity.entityCategory === "key_ball" && entity.entityType === "key") ||
        (entity.entityCategory === "locked_ball" && entity.entityType === "locked")
      );
    });
    if (nonChainEntities.length > 0) {
      throw new Error("lock chain row " + row + " may only contain its key and locked balls: " + levelKey);
    }
  });
}

function normalizeInitialShotBalls(levelConfig, levelKey) {
  if (levelConfig.initialShotBalls === undefined) {
    return;
  }
  if (!Array.isArray(levelConfig.initialShotBalls) || levelConfig.initialShotBalls.length <= 0 || levelConfig.initialShotBalls.length > 2) {
    throw new Error("level.initialShotBalls must contain 1 or 2 colors: " + levelKey);
  }
  levelConfig.initialShotBalls = levelConfig.initialShotBalls.map(function (colorCode, index) {
    if (typeof colorCode !== "string" || levelConfig.colors.indexOf(colorCode) === -1) {
      throw new Error("level.initialShotBalls[" + index + "] must exist in level.colors: " + levelKey);
    }
    return colorCode;
  });
}

function normalizeOpeningShotBalls(levelConfig, levelKey) {
  if (levelConfig.openingShotBalls === undefined) {
    return;
  }
  if (levelConfig.initialShotBalls !== undefined) {
    throw new Error("level.openingShotBalls and level.initialShotBalls cannot both be configured: " + levelKey);
  }
  if (
    (levelConfig.levelType !== "normal" && levelConfig.levelType !== "multi_trapped_spirit_rescue") ||
    levelConfig.playMode !== "shot_limited"
  ) {
    throw new Error("level.openingShotBalls is only supported by ordinary-board shot_limited levels: " + levelKey);
  }
  if (!Array.isArray(levelConfig.openingShotBalls) || levelConfig.openingShotBalls.length < 3 || levelConfig.openingShotBalls.length > 6) {
    throw new Error("level.openingShotBalls must contain 3 to 6 colors: " + levelKey);
  }
  if (levelConfig.openingShotBalls.length > levelConfig.shotLimit) {
    throw new Error("level.openingShotBalls length must not exceed level.shotLimit: " + levelKey);
  }
  levelConfig.openingShotBalls = levelConfig.openingShotBalls.map(function (colorCode, index) {
    if (typeof colorCode !== "string" || levelConfig.colors.indexOf(colorCode) === -1) {
      throw new Error("level.openingShotBalls[" + index + "] must exist in level.colors: " + levelKey);
    }
    return colorCode;
  });
}

function normalizeStarThresholds(levelConfig, levelKey) {
  if (levelConfig.starThresholds === undefined) {
    var formalLevelMatch = /^level_(\d+)$/.exec(levelKey);
    if (formalLevelMatch && Number(formalLevelMatch[1]) <= 1000) {
      throw new Error("formal campaign level requires explicit level.starThresholds: " + levelKey);
    }
    return;
  }
  var thresholds = levelConfig.starThresholds;
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    throw new Error("level.starThresholds must be an object: " + levelKey);
  }
  var fields = Object.keys(thresholds);
  if (fields.length !== 3 || fields.indexOf("star1") === -1 || fields.indexOf("star2") === -1 || fields.indexOf("star3") === -1) {
    throw new Error("level.starThresholds must contain only star1, star2 and star3: " + levelKey);
  }
  var star1 = assertPositiveInteger(thresholds.star1, "level.starThresholds.star1", levelKey);
  var star2 = assertPositiveInteger(thresholds.star2, "level.starThresholds.star2", levelKey);
  var star3 = assertPositiveInteger(thresholds.star3, "level.starThresholds.star3", levelKey);
  if (!(star1 < star2 && star2 < star3)) {
    throw new Error("level.starThresholds must be strictly increasing: " + levelKey);
  }
  if (star3 > levelConfig.targetScore) {
    throw new Error("level.starThresholds.star3 must not exceed level.targetScore: " + levelKey);
  }
  levelConfig.starThresholds = {
    star1: star1,
    star2: star2,
    star3: star3
  };
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
  if (
    (levelType === "trapped_sprite_rescue" || levelType === "multi_trapped_spirit_rescue") &&
    playMode !== "shot_limited"
  ) {
    throw new Error(levelType + " must use shot_limited: " + levelKey);
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

function normalizeTimeBonusBalls(levelConfig, levelKey) {
  if (levelConfig.playMode !== "timed_infinite_shots") {
    if (levelConfig.timeBonusBalls !== undefined) {
      throw new Error("level.timeBonusBalls is only valid for timed_infinite_shots: " + levelKey);
    }
    return;
  }
  if (!Array.isArray(levelConfig.timeBonusBalls)) {
    throw new Error("timed_infinite_shots requires level.timeBonusBalls array: " + levelKey);
  }
  if (
    levelConfig.timeBonusBalls.length < TIMED_LEVEL_MIN_TIME_BONUS_BALLS ||
    levelConfig.timeBonusBalls.length > TIMED_LEVEL_MAX_TIME_BONUS_BALLS
  ) {
    throw new Error(
      "level.timeBonusBalls must contain " + TIMED_LEVEL_MIN_TIME_BONUS_BALLS + "-" +
      TIMED_LEVEL_MAX_TIME_BONUS_BALLS + " entries: " + levelKey
    );
  }
  var usedCoordinates = {};
  levelConfig.timeBonusBalls = levelConfig.timeBonusBalls.map(function (entry, index) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("level.timeBonusBalls[" + index + "] must be an object: " + levelKey);
    }
    if (!Number.isInteger(entry.row) || entry.row < 0 || entry.row >= levelConfig.layout.length) {
      throw new Error("level.timeBonusBalls[" + index + "].row out of range: " + levelKey);
    }
    if (!Number.isInteger(entry.col) || entry.col < 0 || entry.col >= levelConfig.layout[entry.row].length) {
      throw new Error("level.timeBonusBalls[" + index + "].col out of range: " + levelKey);
    }
    if (levelConfig.layout[entry.row].charAt(entry.col) === ".") {
      throw new Error("level.timeBonusBalls[" + index + "] must target an existing normal ball: " + levelKey);
    }
    if (entry.bonusSeconds !== TIMED_LEVEL_TIME_BONUS_SECONDS) {
      throw new Error("level.timeBonusBalls[" + index + "].bonusSeconds must be " + TIMED_LEVEL_TIME_BONUS_SECONDS + ": " + levelKey);
    }
    var coordinateKey = entry.row + ":" + entry.col;
    if (usedCoordinates[coordinateKey]) {
      throw new Error("level.timeBonusBalls contains duplicate coordinate " + coordinateKey + ": " + levelKey);
    }
    usedCoordinates[coordinateKey] = true;
    return {
      row: entry.row,
      col: entry.col,
      bonusSeconds: entry.bonusSeconds
    };
  });
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
  if (levelConfig.levelType === "trapped_sprite_rescue" && rules.allowed.length !== 0) {
    throw new Error("trapped_sprite_rescue must not allow ad powerups: " + levelKey);
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
    if (levelConfig.playMode === "timed_infinite_shots" && powerupType === "plus_three_balls") {
      throw new Error("timed_infinite_shots cannot allow plus_three_balls: " + levelKey);
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
  var expectedLevelId = resolveExpectedLevelId(config, levelKey);

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
  var expectedLevelPrefix = "L" + String(expectedLevelId).padStart(3, "0") + "_";
  if (typeof config.level.code !== "string" || !new RegExp("^" + expectedLevelPrefix).test(config.level.code)) {
    throw new Error("level.code must start with " + expectedLevelPrefix + ": " + levelKey);
  }

  if (!Array.isArray(config.level.colors) || !config.level.colors.length) {
    throw new Error("level.colors must be a non-empty array: " + levelKey);
  }
  if (!hasUniqueItems(config.level.colors)) {
    throw new Error("level.colors must not contain duplicates: " + levelKey);
  }
  if (config.level.colors.length > MAX_ACTIVE_COLOR_COUNT) {
    throw new Error(
      "level.colors must contain at most " + MAX_ACTIVE_COLOR_COUNT + " active colors: " + levelKey
    );
  }
  config.level.colors.forEach(function (colorCode) {
    if (ALLOWED_COLORS.indexOf(colorCode) === -1) {
      throw new Error("unsupported color in level.colors `" + colorCode + "`: " + levelKey);
    }
  });
  config.level.colorClouds = normalizeColorClouds(config.level, levelKey);

  config.level.layout = normalizeLayoutRows(config.level.layout, config.level.colors, levelKey);
  config.level.cellAttachments = normalizeCellAttachments(config.level, levelKey);

  if (!Number.isInteger(config.level.colorCount) || config.level.colorCount !== config.level.colors.length) {
    throw new Error("level.colorCount must equal level.colors.length: " + levelKey);
  }

  normalizeLevelMode(config.level, levelKey);
  normalizeTimeBonusBalls(config.level, levelKey);
  if (config.level.levelType !== "trapped_sprite_rescue") {
    validateTopRowAnchored(config.level.layout, config.level.specialEntities, levelKey);
  }
  if (config.level.playMode === "timed_infinite_shots") {
    if (config.level.shotLimit !== undefined && config.level.shotLimit !== null) {
      throw new Error("level.shotLimit must not be configured for timed_infinite_shots: " + levelKey);
    }
  } else {
    config.level.shotLimit = resolveShotLimit(config.level, levelKey);
  }
  config.level.targetScore = assertPositiveInteger(config.level.targetScore, "level.targetScore", levelKey);
  normalizeStarThresholds(config.level, levelKey);
  if (config.level.levelType === "trapped_sprite_rescue") {
    if (config.level.dropInterval !== undefined) {
      throw new Error("trapped_sprite_rescue must not configure level.dropInterval: " + levelKey);
    }
  } else {
    config.level.dropInterval = assertPositiveInteger(config.level.dropInterval, "level.dropInterval", levelKey);
  }
  var clearRewardItems = normalizeClearRewardItems(config.level, expectedLevelId, levelKey);
  if (clearRewardItems !== undefined) {
    config.level.clearRewardItems = clearRewardItems;
  }

  var jarCount = Number(config.level.jarCount);
  if (!Number.isInteger(jarCount) || jarCount <= 0) {
    throw new Error("level.jarCount must be a positive integer: " + levelKey);
  }
  if (jarCount !== FIXED_JAR_COUNT) {
    throw new Error("level.jarCount must equal " + FIXED_JAR_COUNT + ": " + levelKey);
  }
  if (!Array.isArray(config.level.jarColors) || config.level.jarColors.length !== jarCount) {
    throw new Error("level.jarColors length must equal jarCount: " + levelKey);
  }
  var jarColorSet = {};
  config.level.jarColors.forEach(function (colorCode) {
    if (ALLOWED_COLORS.indexOf(colorCode) === -1) {
      throw new Error("unsupported color in level.jarColors `" + colorCode + "`: " + levelKey);
    }
    if (jarColorSet[colorCode]) {
      throw new Error("level.jarColors must contain five different colors: " + levelKey);
    }
    jarColorSet[colorCode] = true;
  });
  FIXED_JAR_COLORS.forEach(function (colorCode) {
    if (!jarColorSet[colorCode]) {
      throw new Error("level.jarColors missing fixed color `" + colorCode + "`: " + levelKey);
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
  normalizeInitialShotBalls(config.level, levelKey);
  normalizeOpeningShotBalls(config.level, levelKey);
  config.level.initialPowerups = normalizeInitialPowerups(config.level, levelKey);

  if (!config.level.jarRules || typeof config.level.jarRules !== "object" || Array.isArray(config.level.jarRules)) {
    throw new Error("level.jarRules must be an object: " + levelKey);
  }
  assertNumberInRange(config.level.jarRules.rimBounce, "level.jarRules.rimBounce", 0.4, 0.95, levelKey);
  assertNumberInRange(config.level.jarRules.collectZoneScale, "level.jarRules.collectZoneScale", 0.7, 1.4, levelKey);
  assertNumberInRange(config.level.jarRules.sameColorBonus, "level.jarRules.sameColorBonus", 1, 3, levelKey);

  config.level.winConditions = normalizeObjectiveList(config.level.winConditions, WIN_CONDITION_TYPES, "winConditions", config.level, levelKey);
  config.level.bonusObjectives = normalizeObjectiveList(config.level.bonusObjectives, BONUS_OBJECTIVE_TYPES, "bonusObjectives", config.level, levelKey);
  config.level.specialEntities = normalizeSpecialEntities(config.level, levelKey);
  config.level.spiderRows = normalizeSpiderRows(config.level, levelKey);
  normalizeTrappedSpriteRescue(config.level, levelKey);
  normalizeMultiTrappedSpiritRescue(config.level, levelKey);
  config.level.boardOcclusionPlan = BoardOcclusionConfig.normalizePlan(
    config.level.boardOcclusionPlan,
    config.level,
    levelKey
  );
  validateOccupiedLayoutRows(config.level.layout, config.level.specialEntities, levelKey);
  LevelBoardSupportValidator.assertInitialBoardSupported(config.level, levelKey);
  if (/^level_\d+$/.test(levelKey) && expectedLevelId <= 1000) {
    LevelBoardSupportValidator.assertGeneratedBoardRules(config.level, levelKey);
  }
  validateIceSnowballObjectives(config.level, levelKey);
  validateSplitterObjectives(config.level, levelKey);
  validateKeyLockRows(config.level, levelKey);
  normalizeAdPowerupRules(config.level, levelKey);
  if (config.level.levelType === "trapped_sprite_rescue") {
    if (config.level.initialDropSpaceRows !== undefined) {
      throw new Error("trapped_sprite_rescue must not configure level.initialDropSpaceRows: " + levelKey);
    }
  } else {
    validateInitialDropSpaceRows(config.level, levelKey);
  }

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

LevelConfigLoader.normalizeLevelConfig = normalizeLevelConfig;

module.exports = LevelConfigLoader;
