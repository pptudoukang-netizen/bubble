"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var ALLOWED_COLORS = ["R", "G", "B", "Y", "P"];
var MAX_JAR_COUNT = 4;
var ALLOWED_DIFFICULTY = ["tutorial", "easy", "normal", "hard", "expert", "advanced"];
var ALLOWED_WIN_TYPES = ["clear_all", "collect_any", "collect_color"];
var ALLOWED_BONUS_TYPES = [
  "collect_any",
  "collect_color",
  "collect_same_color_bonus_hits",
  "clear_with_shots_remaining",
  "single_turn_drop_count"
];
var ALLOWED_ENTITY_CATEGORIES = ["skill_ball", "obstacle_ball"];
var ALLOWED_ENTITY_TYPES = {
  skill_ball: ["rainbow", "blast"],
  obstacle_ball: ["stone", "ice"]
};

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

function validateLevel(filePath, expectedLevelId) {
  var data = readJson(filePath);
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

  if (!isPositiveInteger(level.shotLimit)) {
    issues.push("shotLimit must be a positive integer");
  }

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

  return issues;
}

function main() {
  var files = fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .sort(function (a, b) {
      return getLevelNumber(a) - getLevelNumber(b);
    });

  if (!files.length) {
    console.log("No level files found in " + LEVEL_DIR);
    process.exit(1);
  }

  var expectedId = 1;
  var failed = false;

  files.forEach(function (fileName) {
    var levelId = getLevelNumber(fileName);
    if (levelId !== expectedId) {
      failed = true;
      console.log("[FAIL]", fileName, "Expected sequential level id", expectedId, "but got", levelId);
      expectedId = levelId + 1;
      return;
    }

    var filePath = path.join(LEVEL_DIR, fileName);
    var issues = validateLevel(filePath, levelId);

    if (issues.length) {
      failed = true;
      console.log("[FAIL]", fileName);
      issues.forEach(function (issue) {
        console.log("  -", issue);
      });
    } else {
      console.log("[OK]", fileName);
    }

    expectedId += 1;
  });

  if (files.length !== 20) {
    failed = true;
    console.log("[FAIL]", "Expected 20 levels for MVP, found", files.length);
  }

  if (failed) {
    console.log("\nLevel content validation failed.");
    process.exit(1);
  }

  console.log("\nLevel content validation passed for", files.length, "levels.");
}

main();
