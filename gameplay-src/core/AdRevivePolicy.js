"use strict";

var AD_REVIVE_GRANTED_SHOTS = 10;
var AD_REVIVE_GRANTED_TIME_SECONDS = 10;
var AD_REVIVE_TARGET_COLOR_BALLS = 2;

var COLOR_DISPLAY_NAMES = {
  R: "红球",
  G: "绿球",
  B: "蓝球",
  Y: "黄球",
  P: "紫球",
  K: "黑球",
  O: "橙球",
  W: "白球"
};

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireLevel(levelConfig) {
  requireObject(levelConfig, "Ad revive level config");
  return requireObject(levelConfig.level, "Ad revive level data");
}

function requireAvailableColors(level) {
  if (!Array.isArray(level.colors) || level.colors.length <= 0) {
    throw new Error("Ad revive requires level.colors.");
  }
  level.colors.forEach(function (colorCode, index) {
    if (typeof colorCode !== "string" || !COLOR_DISPLAY_NAMES[colorCode]) {
      throw new Error("Ad revive level color is unsupported at index " + index + ".");
    }
  });
  return level.colors.slice();
}

function requireSupportedLevelColor(level, colorCode, fieldName) {
  if (typeof colorCode !== "string" || !COLOR_DISPLAY_NAMES[colorCode]) {
    throw new Error(fieldName + " must be a supported color.");
  }
  var colors = requireAvailableColors(level);
  if (colors.indexOf(colorCode) < 0) {
    throw new Error(fieldName + " must exist in level.colors: " + colorCode);
  }
  return colorCode;
}

function findPrimaryCollectionObjective(levelConfig) {
  var level = requireLevel(levelConfig);
  var sources = [level.bonusObjectives, level.winConditions];
  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    if (!Array.isArray(sources[sourceIndex])) {
      throw new Error("Ad revive level objectives must be arrays.");
    }
    for (var objectiveIndex = 0; objectiveIndex < sources[sourceIndex].length; objectiveIndex += 1) {
      var objective = sources[sourceIndex][objectiveIndex];
      if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
        throw new Error("Ad revive objective entry must be an object.");
      }
      if (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice_snowball") {
        return objective;
      }
    }
  }
  throw new Error("Ad revive requires a collection objective.");
}

function getRuntimeBoardCells(runtimeSnapshot) {
  requireObject(runtimeSnapshot, "Ad revive runtime snapshot");
  requireObject(runtimeSnapshot.board, "Ad revive runtime board");
  if (!Array.isArray(runtimeSnapshot.board.cells)) {
    throw new Error("Ad revive runtime board cells must be an array.");
  }
  return runtimeSnapshot.board.cells;
}

function getRuntimeObjectiveSnapshot(runtimeSnapshot) {
  requireObject(runtimeSnapshot, "Ad revive runtime snapshot");
  return requireObject(runtimeSnapshot.objectives, "Ad revive runtime objectives");
}

function isObjectiveCompleted(runtimeSnapshot) {
  var objectives = getRuntimeObjectiveSnapshot(runtimeSnapshot);
  if (!Number.isFinite(objectives.progress) || objectives.progress < 0) {
    throw new Error("Ad revive objective progress must be a non-negative number.");
  }
  if (!Number.isFinite(objectives.target) || objectives.target <= 0) {
    throw new Error("Ad revive objective target must be a positive number.");
  }
  return objectives.progress >= objectives.target;
}

function chooseColorByCounts(level, counts, fieldName) {
  var colors = requireAvailableColors(level);
  var bestColor = null;
  var bestCount = -1;
  colors.forEach(function (colorCode) {
    var count = counts[colorCode];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(fieldName + " count must be a non-negative integer: " + colorCode);
    }
    if (count > bestCount) {
      bestColor = colorCode;
      bestCount = count;
    }
  });
  if (!bestColor || bestCount <= 0) {
    throw new Error(fieldName + " cannot resolve a target color.");
  }
  return bestColor;
}

function resolveCollectAnyTargetColor(level, cells) {
  var counts = {};
  requireAvailableColors(level).forEach(function (colorCode) {
    counts[colorCode] = 0;
  });
  cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Ad revive board cell must be an object.");
    }
    if (typeof cell.color === "string" && Object.prototype.hasOwnProperty.call(counts, cell.color)) {
      counts[cell.color] += 1;
    }
  });
  return chooseColorByCounts(level, counts, "Ad revive collect_any board color");
}

function resolveCollectIceSnowballTargetColor(level, cells) {
  var counts = {};
  requireAvailableColors(level).forEach(function (colorCode) {
    counts[colorCode] = 0;
  });
  cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Ad revive board cell must be an object.");
    }
    if (cell.entityType === "ice") {
      requireSupportedLevelColor(level, cell.innerColor, "Ad revive ice innerColor");
      counts[cell.innerColor] += 1;
    }
  });
  return chooseColorByCounts(level, counts, "Ad revive collect_ice_snowball target");
}

function resolveReviveTargetColor(levelConfig, runtimeSnapshot) {
  var level = requireLevel(levelConfig);
  var objective = findPrimaryCollectionObjective(levelConfig);
  if (objective.type === "collect_color") {
    return requireSupportedLevelColor(level, objective.color, "Ad revive collect_color objective color");
  }

  var cells = getRuntimeBoardCells(runtimeSnapshot);
  if (objective.type === "collect_any") {
    return resolveCollectAnyTargetColor(level, cells);
  }
  if (objective.type === "collect_ice_snowball") {
    return resolveCollectIceSnowballTargetColor(level, cells);
  }

  throw new Error("Unsupported ad revive objective type: " + objective.type);
}

function buildRevivePlan(levelConfig, runtimeSnapshot) {
  var level = requireLevel(levelConfig);
  if (level.playMode === "timed_infinite_shots") {
    return {
      grantedShots: 0,
      grantedTimeSeconds: AD_REVIVE_GRANTED_TIME_SECONDS,
      targetColor: null,
      targetColorBallCount: 0,
      randomBallCount: 0,
      description: "+" + AD_REVIVE_GRANTED_TIME_SECONDS + "秒"
    };
  }
  if (level.playMode !== "shot_limited") {
    throw new Error("Ad revive level.playMode is unsupported: " + level.playMode);
  }
  if (level.levelType === "trapped_sprite_rescue") {
    return {
      grantedShots: AD_REVIVE_GRANTED_SHOTS,
      grantedTimeSeconds: 0,
      targetColor: null,
      targetColorBallCount: 0,
      randomBallCount: AD_REVIVE_TARGET_COLOR_BALLS,
      description: buildRandomReviveDescription()
    };
  }
  var objectiveCompleted = isObjectiveCompleted(runtimeSnapshot);
  var targetColor = objectiveCompleted ? null : resolveReviveTargetColor(levelConfig, runtimeSnapshot);
  return {
    grantedShots: AD_REVIVE_GRANTED_SHOTS,
    grantedTimeSeconds: 0,
    targetColor: targetColor,
    targetColorBallCount: objectiveCompleted ? 0 : AD_REVIVE_TARGET_COLOR_BALLS,
    randomBallCount: objectiveCompleted ? AD_REVIVE_TARGET_COLOR_BALLS : 0,
    description: objectiveCompleted ? buildRandomReviveDescription() : buildReviveDescriptionFromColor(targetColor)
  };
}

function buildRandomReviveDescription() {
  return "增加随机球x" + AD_REVIVE_GRANTED_SHOTS;
}

function buildReviveDescriptionFromColor(targetColor) {
  if (!COLOR_DISPLAY_NAMES[targetColor]) {
    throw new Error("Ad revive description target color is unsupported: " + targetColor);
  }
  return "增加" + COLOR_DISPLAY_NAMES[targetColor] + "x" + AD_REVIVE_GRANTED_SHOTS;
}

function buildReviveDescription(levelConfig, runtimeSnapshot) {
  return buildRevivePlan(levelConfig, runtimeSnapshot).description;
}

module.exports = {
  AD_REVIVE_GRANTED_SHOTS: AD_REVIVE_GRANTED_SHOTS,
  AD_REVIVE_GRANTED_TIME_SECONDS: AD_REVIVE_GRANTED_TIME_SECONDS,
  AD_REVIVE_TARGET_COLOR_BALLS: AD_REVIVE_TARGET_COLOR_BALLS,
  buildRevivePlan: buildRevivePlan,
  buildReviveDescription: buildReviveDescription,
  resolveReviveTargetColor: resolveReviveTargetColor
};
