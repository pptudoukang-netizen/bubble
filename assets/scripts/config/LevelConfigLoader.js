"use strict";

var Logger = require("../utils/Logger");
var AimTuningProfiles = require("./AimTuningProfiles");
var BoardLayout = require("./BoardLayout");

var SPECIAL_ENTITY_TYPES = {
  skill_ball: ["rainbow", "blast"],
  obstacle_ball: ["stone", "ice"]
};
var ALLOWED_COLORS = ["R", "G", "B", "Y", "P"];
var ALLOWED_INNER_COLORS = ALLOWED_COLORS.slice();
var MAX_JAR_COUNT = 4;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeRowString(rowIndex, rowString, maxColumns) {
  var rowColumns = BoardLayout.getRowColumnCount(rowIndex, maxColumns);
  var source = typeof rowString === "string" ? rowString : "";
  var normalized = source.slice(0, rowColumns);

  if (normalized.length < rowColumns) {
    normalized += ".".repeat(rowColumns - normalized.length);
  }

  return normalized;
}

function normalizeLayoutRows(layout) {
  var maxColumns = layout.reduce(function (max, row) {
    return Math.max(max, typeof row === "string" ? row.length : 0);
  }, 0);
  maxColumns = Math.max(BoardLayout.defaultColumns || 10, maxColumns);

  return layout.map(function (rowString, rowIndex) {
    return normalizeRowString(rowIndex, rowString, maxColumns);
  });
}

function validateEntityType(category, entityType) {
  var allowedTypes = SPECIAL_ENTITY_TYPES[category] || [];
  return allowedTypes.indexOf(entityType) !== -1;
}

function hasUniqueItems(items) {
  return new Set(items).size === items.length;
}

function resolveShotLimit(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object") {
    return 0;
  }

  var candidates = [
    levelConfig.shotLimit,
    levelConfig.stepLimit,
    levelConfig.moveLimit,
    levelConfig.turnLimit,
    levelConfig.maxShots
  ];

  for (var index = 0; index < candidates.length; index += 1) {
    var value = Number(candidates[index]);
    if (Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }

  return 0;
}

function normalizeSpecialEntities(levelConfig, levelKey) {
  if (levelConfig.specialEntities == null) {
    return [];
  }

  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be an array: " + levelKey);
  }

  var normalizedLayout = normalizeLayoutRows(levelConfig.layout);
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

function normalizeLevelConfig(rawConfig, levelKey) {
  var config = clone(rawConfig);

  if (!config.level) {
    throw new Error("Level config is missing `level`: " + levelKey);
  }

  if (!Array.isArray(config.level.layout)) {
    throw new Error("Level layout must be an array: " + levelKey);
  }

  config.level.shotLimit = resolveShotLimit(config.level);
  config.level.targetScore = Math.max(0, Math.floor(Number(config.level.targetScore) || 0));
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

  config.level.specialEntities = normalizeSpecialEntities(config.level, levelKey);

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
    cc.loader.loadRes(resourcePath, cc.JsonAsset, function (error, asset) {
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
