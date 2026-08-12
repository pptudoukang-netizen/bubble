"use strict";

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BoardOcclusionConfig = require("../assets/scripts/config/BoardOcclusionConfig");
var LevelBoardSupportValidator = require("../assets/scripts/config/LevelBoardSupportValidator");
var AssistSpiritRescueConfig = require("../assets/scripts/config/AssistSpiritRescueConfig");

var TARGET_LEVEL_COUNT = 1000;
var TIMED_LEVEL_INTERVAL = 10;
var TIMED_LEVEL_TIME_LIMIT_SECONDS = 90;
var TIMED_LEVEL_REQUIRED_STAR_COUNT = 1;
var TIMED_LEVEL_TIME_BONUS_SECONDS = 5;
var TIMED_LEVEL_MIN_TIME_BONUS_BALLS = 2;
var TIMED_LEVEL_MAX_TIME_BONUS_BALLS = 5;
var TRAPPED_SPRITE_RESCUE_CHAPTER_OFFSETS = AssistSpiritRescueConfig.CHAPTER_OFFSETS;
var TRAPPED_SPRITE_RESCUE_LEVEL_IDS = AssistSpiritRescueConfig.RESCUE_LEVEL_IDS.slice();
var TRAPPED_SPRITE_SPIRIT_IDS = AssistSpiritRescueConfig.SPIRIT_IDS;
var TRAPPED_SPRITE_RESCUE_HEX_RADIUS = 5;
var TRAPPED_SPRITE_RESCUE_ANCHOR_ROW = 6;
var TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT =
  3 * TRAPPED_SPRITE_RESCUE_HEX_RADIUS * (TRAPPED_SPRITE_RESCUE_HEX_RADIUS + 1);
var TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT = 5;
var TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN = 2;
var NORMAL_BALL_COLORS = Object.freeze(["B", "R", "G", "Y", "P", "O", "K", "W"]);
var BASE_SPECIAL_COLORS = Object.freeze(["R", "G", "B", "Y", "P"]);
var MAX_ACTIVE_COLOR_COUNT = 5;
var COLOR_ROTATION_INTERVAL = 5;
var NORMAL_BALL_COLOR_INTRO_LEVELS = Object.freeze({
  B: 1,
  R: 1,
  G: 2,
  Y: 9,
  P: 21,
  O: 41,
  K: 61,
  W: 81
});
var NORMAL_BALL_COLOR_TEACHES = Object.freeze({
  P: "purple_ball",
  O: "orange_ball",
  K: "black_ball",
  W: "white_ball"
});
var REACTIVE_SPECIAL_INTRO_LEVELS = Object.freeze({
  swirl: 21,
  vine_spirit: 31,
  wormhole: 53
});
var CLEARANCE_REBALANCE_LEVEL_IDS = Object.freeze([
  9, 18, 19, 23, 63, 75, 152, 187, 192, 272,
  372, 441, 452, 454, 551, 751, 764, 892, 985
]);
var CLEARANCE_REBALANCE_CASCADE_POLICY = Object.freeze({
  preferredImmediateImpactRatio: 0.18,
  maximumImmediateImpactRatio: 0.4,
  candidateLimit: 64
});
var CLEARANCE_REBALANCE_CASCADE_POLICY_OVERRIDES = Object.freeze({
  187: Object.freeze({
    preferredImmediateImpactRatio: 0.22,
    maximumImmediateImpactRatio: 0.4,
    candidateLimit: 64
  }),
  892: Object.freeze({
    preferredImmediateImpactRatio: 0.12,
    maximumImmediateImpactRatio: 0.4,
    candidateLimit: 64
  })
});
var CLEARANCE_REBALANCE_SHOT_LIMITS = Object.freeze({
  9: 21,
  19: 16,
  63: 31,
  187: 34,
  192: 32,
  272: 30,
  441: 35,
  452: 30,
  454: 34,
  551: 33,
  751: 35,
  892: 38,
  985: 31
});
var CLEARANCE_REBALANCE_STAR1_RATIOS = Object.freeze({
  372: 0.44,
  441: 0.35,
  452: 0.25,
  751: 0.44,
  892: 0.34,
  985: 0.28
});
var SCORE_BEAT_RATIOS = Object.freeze({
  introduce: Object.freeze([0.48, 0.68, 0.86]),
  practice: Object.freeze([0.5, 0.7, 0.88]),
  combine: Object.freeze([0.52, 0.72, 0.9]),
  twist: Object.freeze([0.54, 0.74, 0.92]),
  exam: Object.freeze([0.56, 0.76, 0.94]),
  rescue: Object.freeze([0.5, 0.7, 0.88])
});
var TRAPPED_SPRITE_ROTATION = Object.freeze({
  projectileImpulse: 1,
  torqueScale: 6400,
  coreInertia: 8,
  maxAngularSpeedDeg: 105,
  angularDamping: 4.2,
  stopAngularSpeedDeg: 5,
  maxStepAngleDeg: 32,
  maxDurationSec: 0.8,
  tangentialDeadZone: 0.08
});

function assertLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId <= 0 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Campaign generation requires levelId in [1, 1000]: " + levelId);
  }
}

function containsLevel(levelIds, levelId) {
  return levelIds.indexOf(levelId) >= 0;
}

function getActiveColorCount(levelId) {
  assertLevelId(levelId);
  if (levelId === 1) {
    return 2;
  }
  if (levelId <= 8) {
    return 3;
  }
  if (levelId <= 74) {
    return 4;
  }
  return MAX_ACTIVE_COLOR_COUNT;
}

function getUnlockedNormalBallColors(levelId) {
  assertLevelId(levelId);
  return NORMAL_BALL_COLORS.filter(function (color) {
    return levelId >= NORMAL_BALL_COLOR_INTRO_LEVELS[color];
  });
}

function getActiveNormalBallColors(levelId) {
  var activeColorCount = getActiveColorCount(levelId);
  var unlockedColors = getUnlockedNormalBallColors(levelId);
  if (unlockedColors.length < activeColorCount) {
    throw new Error(
      "Campaign color schedule has only " + unlockedColors.length +
      " unlocked colors for level " + levelId + ", expected " + activeColorCount + "."
    );
  }
  if (unlockedColors.length === activeColorCount) {
    return unlockedColors;
  }
  var newestColor = unlockedColors[unlockedColors.length - 1];
  var stageStartLevel = NORMAL_BALL_COLOR_INTRO_LEVELS[newestColor];
  var rotation = Math.floor((levelId - stageStartLevel) / COLOR_ROTATION_INTERVAL);
  var startIndex = (unlockedColors.length - activeColorCount + rotation) % unlockedColors.length;
  var activeColors = [];
  for (var index = 0; index < activeColorCount; index += 1) {
    activeColors.push(unlockedColors[(startIndex + index) % unlockedColors.length]);
  }
  return activeColors;
}

function getCollectibleTargetColors(activeColors, levelId) {
  if (!Array.isArray(activeColors) || activeColors.length === 0) {
    throw new Error("Campaign collectible target colors require active colors for level " + levelId + ".");
  }
  var targetColors = activeColors.filter(function (color) {
    return BASE_SPECIAL_COLORS.indexOf(color) >= 0;
  });
  if (targetColors.length === 0) {
    throw new Error("Campaign active palette has no jar-supported target color for level " + levelId + ".");
  }
  return targetColors;
}

function getCollectibleTargetColor(levelId, activeColors) {
  assertLevelId(levelId);
  var targetColors = getCollectibleTargetColors(activeColors, levelId);
  return targetColors[(levelId - 1) % targetColors.length];
}

function assertActiveNormalBallColors(levelId, activeColors) {
  assertLevelId(levelId);
  if (!Array.isArray(activeColors) || activeColors.length === 0) {
    throw new Error("Campaign active colors must be a non-empty array for level " + levelId + ".");
  }
  if (activeColors.length > MAX_ACTIVE_COLOR_COUNT) {
    throw new Error(
      "Campaign active color count must be <= " + MAX_ACTIVE_COLOR_COUNT +
      " for level " + levelId + ", got " + activeColors.length + "."
    );
  }
  var seen = {};
  activeColors.forEach(function (color) {
    if (NORMAL_BALL_COLORS.indexOf(color) < 0) {
      throw new Error("Campaign active palette contains unsupported color " + color + " for level " + levelId + ".");
    }
    if (seen[color] === true) {
      throw new Error("Campaign active palette contains duplicate color " + color + " for level " + levelId + ".");
    }
    seen[color] = true;
  });
  var expectedColors = getActiveNormalBallColors(levelId);
  if (JSON.stringify(activeColors) !== JSON.stringify(expectedColors)) {
    throw new Error(
      "Campaign active palette differs from level " + levelId +
      " schedule: expected " + expectedColors.join("/") + ", got " + activeColors.join("/") + "."
    );
  }
  return activeColors;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function buildTrappedSpriteRescueBaseSpecialCounts(sourceCounts) {
  if (!sourceCounts || typeof sourceCounts !== "object" || Array.isArray(sourceCounts)) {
    throw new Error("Trapped sprite rescue base special counts must be an object.");
  }
  ["stone", "ice", "blast", "rainbow", "molotov", "key", "locked"].forEach(function (fieldName) {
    requireNonNegativeInteger(sourceCounts[fieldName], "Trapped sprite rescue base special " + fieldName);
  });
  if (!sourceCounts.splitters || typeof sourceCounts.splitters !== "object" || Array.isArray(sourceCounts.splitters)) {
    throw new Error("Trapped sprite rescue splitter counts must be an object.");
  }
  BASE_SPECIAL_COLORS.forEach(function (color) {
    requireNonNegativeInteger(sourceCounts.splitters[color], "Trapped sprite rescue splitter " + color);
  });
  var splitters = {};
  BASE_SPECIAL_COLORS.forEach(function (color) {
    splitters[color] = 0;
  });
  return {
    stone: sourceCounts.stone,
    ice: sourceCounts.ice,
    blast: sourceCounts.blast,
    rainbow: sourceCounts.rainbow,
    molotov: 0,
    splitters: splitters,
    key: 0,
    locked: 0
  };
}

function isTimedLevelId(levelId) {
  assertLevelId(levelId);
  return levelId % TIMED_LEVEL_INTERVAL === 0;
}

function isTrappedSpriteRescueLevelId(levelId) {
  assertLevelId(levelId);
  return containsLevel(TRAPPED_SPRITE_RESCUE_LEVEL_IDS, levelId);
}

function getTrappedSpriteRescueSpiritId(levelId) {
  assertLevelId(levelId);
  return AssistSpiritRescueConfig.requireSpiritIdByLevelId(levelId);
}

function getClearanceRebalanceCascadePolicy(levelId) {
  assertLevelId(levelId);
  if (!containsLevel(CLEARANCE_REBALANCE_LEVEL_IDS, levelId)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(CLEARANCE_REBALANCE_CASCADE_POLICY_OVERRIDES, levelId)) {
    return CLEARANCE_REBALANCE_CASCADE_POLICY_OVERRIDES[levelId];
  }
  return CLEARANCE_REBALANCE_CASCADE_POLICY;
}

function applyClearanceRebalanceShotLimit(levelId, generatedShotLimit) {
  assertLevelId(levelId);
  requirePositiveInteger(generatedShotLimit, "Campaign generatedShotLimit");
  if (Object.prototype.hasOwnProperty.call(CLEARANCE_REBALANCE_SHOT_LIMITS, levelId)) {
    return CLEARANCE_REBALANCE_SHOT_LIMITS[levelId];
  }
  return generatedShotLimit;
}

function getReactiveSpecialCounts(levelId) {
  assertLevelId(levelId);
  if (levelId < REACTIVE_SPECIAL_INTRO_LEVELS.swirl) {
    return {
      swirl: 0,
      vine_spirit: 0,
      wormholePairs: 0,
      wormhole: 0
    };
  }
  var phase = ((levelId - 1) % 10) + 1;
  var swirl = 0;
  var vineSpirit = 0;
  var wormholePairs = 0;

  if (levelId < REACTIVE_SPECIAL_INTRO_LEVELS.vine_spirit) {
    swirl = phase === 1 || phase === 4 || phase === 7 || phase === 10 ? 1 : 0;
  } else if (levelId < REACTIVE_SPECIAL_INTRO_LEVELS.wormhole) {
    swirl = phase === 2 || phase === 6 || phase === 9 || phase === 10 ? 1 : 0;
    vineSpirit = phase === 3 || phase === 6 || phase === 8 || phase === 9 || phase === 10 ? 1 : 0;
  } else {
    var activePhase = levelId < 81
      ? phase === 2 || phase === 3 || phase === 4 || phase === 6 || phase === 9 || phase === 10
      : phase !== 1 && phase !== 5;
    if (activePhase) {
      swirl = phase === 2 || phase === 6 || phase === 7 || phase === 9 || phase === 10 ? 1 : 0;
      vineSpirit = phase === 3 || phase === 6 || phase === 8 || phase === 9 || phase === 10 ? 1 : 0;
      wormholePairs = phase === 4 || phase === 7 || phase === 8 || phase === 9 || phase === 10 ? 1 : 0;
    }
  }
  if (levelId === REACTIVE_SPECIAL_INTRO_LEVELS.vine_spirit) {
    vineSpirit = 1;
  }
  if (levelId === REACTIVE_SPECIAL_INTRO_LEVELS.wormhole) {
    wormholePairs = 1;
  }

  var stageMaximum;
  if (levelId <= 80) {
    stageMaximum = { swirl: 1, vine_spirit: 1, wormholePairs: 1 };
  } else if (levelId <= 200) {
    stageMaximum = { swirl: 2, vine_spirit: 2, wormholePairs: 1 };
  } else if (levelId <= 400) {
    stageMaximum = { swirl: 2, vine_spirit: 2, wormholePairs: 2 };
  } else if (levelId <= 600) {
    stageMaximum = { swirl: 3, vine_spirit: 2, wormholePairs: 2 };
  } else if (levelId <= 850) {
    stageMaximum = { swirl: 3, vine_spirit: 3, wormholePairs: 2 };
  } else {
    stageMaximum = { swirl: 3, vine_spirit: 3, wormholePairs: 3 };
  }
  if (phase === 9 || phase === 10) {
    swirl *= stageMaximum.swirl;
    vineSpirit *= stageMaximum.vine_spirit;
    wormholePairs *= stageMaximum.wormholePairs;
  } else if (phase === 6 && levelId >= 201) {
    swirl *= Math.min(2, stageMaximum.swirl);
    vineSpirit *= Math.min(2, stageMaximum.vine_spirit);
  } else if ((phase === 7 || phase === 8) && levelId >= 401) {
    swirl *= Math.min(2, stageMaximum.swirl);
    vineSpirit *= Math.min(2, stageMaximum.vine_spirit);
    wormholePairs *= Math.min(2, stageMaximum.wormholePairs);
  }
  if (isTrappedSpriteRescueLevelId(levelId)) {
    wormholePairs = 0;
  }
  return {
    swirl: swirl,
    vine_spirit: vineSpirit,
    wormholePairs: wormholePairs,
    wormhole: wormholePairs * 2
  };
}

function buildReactiveSpecialEntities(levelId) {
  var counts = getReactiveSpecialCounts(levelId);
  var entities = [];
  var index;
  for (index = 0; index < counts.swirl; index += 1) {
    entities.push({
      id: "swirl_" + String(index + 1).padStart(2, "0"),
      entityCategory: "reactive_ball",
      entityType: "swirl"
    });
  }
  for (index = 0; index < counts.vine_spirit; index += 1) {
    entities.push({
      id: "vine_spirit_" + String(index + 1).padStart(2, "0"),
      entityCategory: "reactive_ball",
      entityType: "vine_spirit"
    });
  }
  for (index = 0; index < counts.wormholePairs; index += 1) {
    var pairNumber = String(index + 1).padStart(2, "0");
    var moveDirection = (levelId + index) % 2 === 0 ? "left" : "right";
    entities.push({
      id: "wormhole_pair_" + pairNumber + "_left",
      entityCategory: "reactive_ball",
      entityType: "wormhole",
      moveDirection: moveDirection
    });
    entities.push({
      id: "wormhole_pair_" + pairNumber + "_right",
      entityCategory: "reactive_ball",
      entityType: "wormhole",
      moveDirection: moveDirection
    });
  }
  return entities;
}

function getIceRatio(levelId) {
  assertLevelId(levelId);
  if (levelId <= 15) {
    return 0;
  }
  if (levelId <= 30) {
    return 0.05;
  }
  if (levelId <= 60) {
    return 0.07;
  }
  if (levelId <= 100) {
    return 0.09;
  }
  if (levelId <= 300) {
    return 0.1;
  }
  if (levelId <= 500) {
    return 0.12;
  }
  if (levelId <= 700) {
    return 0.14;
  }
  if (levelId <= 850) {
    return 0.16;
  }
  return 0.18;
}

function buildTrappedSpriteRescueShotLimit(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Trapped sprite rescue shot limit requires options.");
  }
  assertLevelId(options.levelId);
  if (!isTrappedSpriteRescueLevelId(options.levelId)) {
    throw new Error("Trapped sprite rescue shot limit requires a scheduled rescue level: " + options.levelId);
  }
  var normalBallCount = requirePositiveInteger(options.normalBallCount, "Trapped sprite rescue normalBallCount");
  var rowCount = requirePositiveInteger(options.rowCount, "Trapped sprite rescue rowCount");
  var iceCount = requireNonNegativeInteger(options.iceCount, "Trapped sprite rescue iceCount");
  var baseSpecialCount = requireNonNegativeInteger(options.baseSpecialCount, "Trapped sprite rescue baseSpecialCount");
  var reactiveCounts = options.reactiveSpecialCounts;
  if (!reactiveCounts || typeof reactiveCounts !== "object" || Array.isArray(reactiveCounts)) {
    throw new Error("Trapped sprite rescue shot limit requires reactiveSpecialCounts.");
  }
  var swirlCount = requireNonNegativeInteger(reactiveCounts.swirl, "Trapped sprite rescue swirl count");
  var vineSpiritCount = requireNonNegativeInteger(reactiveCounts.vine_spirit, "Trapped sprite rescue vine spirit count");
  var wormholeCount = requireNonNegativeInteger(reactiveCounts.wormhole, "Trapped sprite rescue wormhole count");
  if (wormholeCount !== 0) {
    throw new Error("Trapped sprite rescue shot limit does not allow wormholes: " + options.levelId);
  }
  var specialCellCount = iceCount + baseSpecialCount + swirlCount + vineSpiritCount;
  var shotLimit = Math.ceil(
    (normalBallCount + specialCellCount) * 0.25 +
    rowCount * 0.65 +
    baseSpecialCount * 0.5
  );
  var phase = ((options.levelId - 1) % 10) + 1;
  if (phase >= 7) {
    shotLimit += 1;
  }
  if (phase >= 9) {
    shotLimit += 1;
  }
  return applyClearanceRebalanceShotLimit(options.levelId, Math.max(28, Math.min(46, shotLimit)));
}

function getIceBallCount(levelId, boardCapacity) {
  assertLevelId(levelId);
  requirePositiveInteger(boardCapacity, "Campaign ice boardCapacity");
  var ratio = getIceRatio(levelId);
  return ratio === 0 ? 0 : Math.max(3, Math.round(boardCapacity * ratio));
}

function getScoreDesignBeat(levelId) {
  assertLevelId(levelId);
  if (isTrappedSpriteRescueLevelId(levelId)) {
    return "rescue";
  }
  var phase = ((levelId - 1) % 10) + 1;
  if (phase === 1) {
    return "introduce";
  }
  if (phase <= 4) {
    return "practice";
  }
  if (phase <= 7) {
    return "combine";
  }
  if (phase <= 9) {
    return "twist";
  }
  return "exam";
}

function buildStarThresholds(levelId, targetScore, designBeat) {
  assertLevelId(levelId);
  requirePositiveInteger(targetScore, "Campaign targetScore");
  var ratios = SCORE_BEAT_RATIOS[designBeat];
  if (!ratios) {
    throw new Error("Unsupported campaign score design beat: " + designBeat);
  }
  var star1Ratio = Object.prototype.hasOwnProperty.call(CLEARANCE_REBALANCE_STAR1_RATIOS, levelId)
    ? CLEARANCE_REBALANCE_STAR1_RATIOS[levelId]
    : ratios[0];
  return {
    star1: Math.round(targetScore * star1Ratio),
    star2: Math.round(targetScore * ratios[1]),
    star3: Math.round(targetScore * ratios[2])
  };
}

function buildCampaignScoreDesign(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Campaign score design requires options.");
  }
  assertLevelId(options.levelId);
  var normalBallCount = requirePositiveInteger(options.normalBallCount, "Campaign score normalBallCount");
  var iceCount = requireNonNegativeInteger(options.iceCount, "Campaign score iceCount");
  var baseSpecialCount = requireNonNegativeInteger(options.baseSpecialCount, "Campaign score baseSpecialCount");
  var primaryObjectiveValue = requirePositiveInteger(options.primaryObjectiveValue, "Campaign score primaryObjectiveValue");
  var secondaryObjectiveValue = requireNonNegativeInteger(options.secondaryObjectiveValue, "Campaign score secondaryObjectiveValue");
  var counts = options.reactiveSpecialCounts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("Campaign score requires reactiveSpecialCounts.");
  }
  requireNonNegativeInteger(counts.swirl, "Campaign score swirl count");
  requireNonNegativeInteger(counts.vine_spirit, "Campaign score vine spirit count");
  requireNonNegativeInteger(counts.wormholePairs, "Campaign score wormhole pair count");
  var actionBudget;
  var efficiencyReserve;
  if (options.shotLimit !== undefined) {
    actionBudget = requirePositiveInteger(options.shotLimit, "Campaign score shotLimit");
    efficiencyReserve = Math.max(3, Math.round(actionBudget * 0.18));
  } else {
    actionBudget = Math.max(1, Math.round(requirePositiveInteger(options.timeLimitSeconds, "Campaign score timeLimitSeconds") / 3));
    efficiencyReserve = Math.max(3, Math.round(actionBudget * 0.14));
  }
  var rawTarget = normalBallCount * 55 +
    iceCount * 120 +
    baseSpecialCount * 150 +
    primaryObjectiveValue * 45 +
    secondaryObjectiveValue * 80 +
    counts.swirl * 240 +
    counts.vine_spirit * 280 +
    counts.wormholePairs * 420 +
    actionBudget * 90 +
    efficiencyReserve * 220;
  var targetScore = Math.ceil(rawTarget / 100) * 100;
  if (typeof options.designBeat !== "string" || !options.designBeat) {
    throw new Error("Campaign score design requires explicit designBeat.");
  }
  var designBeat = options.designBeat;
  return {
    designBeat: designBeat,
    targetScore: targetScore,
    starThresholds: buildStarThresholds(options.levelId, targetScore, designBeat)
  };
}

function getNormalBallOccupancyTarget(levelId) {
  assertLevelId(levelId);
  if (levelId <= 300) {
    return LevelBoardSupportValidator.MIN_NORMAL_BALL_OCCUPANCY_RATIO;
  }
  if (levelId <= 500) {
    return 0.72;
  }
  if (levelId <= 700) {
    return 0.74;
  }
  return 0.76;
}

function getLevelPlan(levelId) {
  assertLevelId(levelId);
  var rescue = isTrappedSpriteRescueLevelId(levelId);
  var timed = isTimedLevelId(levelId);
  if (rescue && timed) {
    throw new Error("Campaign level cannot be both timed and trapped sprite rescue: " + levelId);
  }
  var reactiveSpecialCounts = getReactiveSpecialCounts(levelId);
  if (rescue && reactiveSpecialCounts.wormhole) {
    throw new Error("Trapped sprite rescue level cannot contain wormhole placements: " + levelId);
  }
  var teaches = [];
  if (timed) {
    teaches.push("timed_infinite_shots");
  }
  if (reactiveSpecialCounts.swirl) {
    teaches.push("swirl");
  }
  if (reactiveSpecialCounts.vine_spirit) {
    teaches.push("vine_spirit");
  }
  if (reactiveSpecialCounts.wormhole) {
    teaches.push("wormhole");
  }
  var boardOcclusionEnabled = levelId >= BoardOcclusionConfig.ENABLED_FROM_LEVEL && !rescue;
  if (boardOcclusionEnabled) {
    teaches.push("board_occlusion");
  }
  if (rescue) {
    teaches.push("trapped_sprite_rescue");
  }
  Object.keys(NORMAL_BALL_COLOR_TEACHES).forEach(function (color) {
    if (NORMAL_BALL_COLOR_INTRO_LEVELS[color] === levelId) {
      teaches.push(NORMAL_BALL_COLOR_TEACHES[color]);
    }
  });
  return {
    levelId: levelId,
    levelType: rescue ? "trapped_sprite_rescue" : (timed ? "special_floating_island" : "normal"),
    playMode: timed ? "timed_infinite_shots" : "shot_limited",
    timeLimitSeconds: timed ? TIMED_LEVEL_TIME_LIMIT_SECONDS : undefined,
    requiredStarCount: timed ? TIMED_LEVEL_REQUIRED_STAR_COUNT : undefined,
    boardOcclusionEnabled: boardOcclusionEnabled,
    reactiveSpecialCounts: reactiveSpecialCounts,
    trappedSpriteRescue: rescue,
    teaches: teaches
  };
}

function getTimedLevelTimeBonusBallCount(levelId) {
  assertLevelId(levelId);
  if (!isTimedLevelId(levelId)) {
    throw new Error("Time bonus ball count is only defined for timed level " + levelId + ".");
  }
  return TIMED_LEVEL_MIN_TIME_BONUS_BALLS +
    ((Math.floor(levelId / TIMED_LEVEL_INTERVAL) - 1) %
      (TIMED_LEVEL_MAX_TIME_BONUS_BALLS - TIMED_LEVEL_MIN_TIME_BONUS_BALLS + 1));
}

function buildTrappedSpriteRescueConfig(levelId, layout) {
  assertLevelId(levelId);
  if (!isTrappedSpriteRescueLevelId(levelId)) {
    throw new Error("Level is not configured for trapped sprite rescue: " + levelId);
  }
  if (!Array.isArray(layout) || layout.length <= TRAPPED_SPRITE_RESCUE_ANCHOR_ROW + TRAPPED_SPRITE_RESCUE_HEX_RADIUS) {
    throw new Error("Trapped sprite rescue generation requires the full radius-five hex board: " + levelId);
  }
  var anchorRow = TRAPPED_SPRITE_RESCUE_ANCHOR_ROW;
  var anchorColumns = BoardLayout.getRowColumnCount(anchorRow, BoardLayout.defaultColumns);
  var anchorCol = Math.floor(anchorColumns / 2);
  if (typeof layout[anchorRow] !== "string" || layout[anchorRow].length !== anchorColumns) {
    throw new Error("Trapped sprite rescue anchor row is not normalized: " + levelId);
  }
  var worldCenter = BoardLayout.getCellPosition(anchorRow, anchorCol, BoardLayout.defaultColumns, 0);
  return {
    spiritId: getTrappedSpriteRescueSpiritId(levelId),
    anchorCell: {
      row: anchorRow,
      col: anchorCol
    },
    worldCenter: {
      x: worldCenter.x,
      y: worldCenter.y
    },
    renderScale: 1.35,
    rotation: JSON.parse(JSON.stringify(TRAPPED_SPRITE_ROTATION))
  };
}

TRAPPED_SPRITE_RESCUE_LEVEL_IDS.forEach(function (levelId) {
  if (levelId % TIMED_LEVEL_INTERVAL === 0) {
    throw new Error("Trapped sprite rescue schedule overlaps timed level " + levelId + ".");
  }
});
if (TRAPPED_SPRITE_RESCUE_LEVEL_IDS.length !== 50) {
  throw new Error("Trapped sprite rescue schedule must contain exactly 50 levels.");
}
if (TRAPPED_SPRITE_SPIRIT_IDS.length !== 7) {
  throw new Error("Trapped sprite identity cycle must contain exactly seven assist spirits.");
}
if (new Set(TRAPPED_SPRITE_SPIRIT_IDS).size !== TRAPPED_SPRITE_SPIRIT_IDS.length) {
  throw new Error("Trapped sprite identity cycle must not contain duplicated assist spirit ids.");
}
TRAPPED_SPRITE_RESCUE_LEVEL_IDS.forEach(function (levelId, index) {
  if (index > 0 && levelId <= TRAPPED_SPRITE_RESCUE_LEVEL_IDS[index - 1]) {
    throw new Error("Trapped sprite rescue schedule must be strictly increasing at " + levelId + ".");
  }
});

module.exports = Object.freeze({
  TARGET_LEVEL_COUNT: TARGET_LEVEL_COUNT,
  NORMAL_BALL_COLORS: NORMAL_BALL_COLORS,
  BASE_SPECIAL_COLORS: BASE_SPECIAL_COLORS,
  MAX_ACTIVE_COLOR_COUNT: MAX_ACTIVE_COLOR_COUNT,
  COLOR_ROTATION_INTERVAL: COLOR_ROTATION_INTERVAL,
  NORMAL_BALL_COLOR_INTRO_LEVELS: NORMAL_BALL_COLOR_INTRO_LEVELS,
  TIMED_LEVEL_INTERVAL: TIMED_LEVEL_INTERVAL,
  TIMED_LEVEL_TIME_LIMIT_SECONDS: TIMED_LEVEL_TIME_LIMIT_SECONDS,
  TIMED_LEVEL_REQUIRED_STAR_COUNT: TIMED_LEVEL_REQUIRED_STAR_COUNT,
  TIMED_LEVEL_TIME_BONUS_SECONDS: TIMED_LEVEL_TIME_BONUS_SECONDS,
  TIMED_LEVEL_MIN_TIME_BONUS_BALLS: TIMED_LEVEL_MIN_TIME_BONUS_BALLS,
  TIMED_LEVEL_MAX_TIME_BONUS_BALLS: TIMED_LEVEL_MAX_TIME_BONUS_BALLS,
  TRAPPED_SPRITE_RESCUE_HEX_RADIUS: TRAPPED_SPRITE_RESCUE_HEX_RADIUS,
  TRAPPED_SPRITE_RESCUE_ANCHOR_ROW: TRAPPED_SPRITE_RESCUE_ANCHOR_ROW,
  TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT: TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT,
  TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT: TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT,
  TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN: TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN,
  MAX_TOP_ROW_SAME_COLOR_RUN: LevelBoardSupportValidator.MAX_TOP_ROW_SAME_COLOR_RUN,
  MIN_NORMAL_BALL_OCCUPANCY_RATIO: LevelBoardSupportValidator.MIN_NORMAL_BALL_OCCUPANCY_RATIO,
  TRAPPED_SPRITE_RESCUE_CHAPTER_OFFSETS: TRAPPED_SPRITE_RESCUE_CHAPTER_OFFSETS,
  TRAPPED_SPRITE_RESCUE_LEVEL_IDS: Object.freeze(TRAPPED_SPRITE_RESCUE_LEVEL_IDS.slice()),
  TRAPPED_SPRITE_SPIRIT_IDS: TRAPPED_SPRITE_SPIRIT_IDS,
  CLEARANCE_REBALANCE_LEVEL_IDS: Object.freeze(CLEARANCE_REBALANCE_LEVEL_IDS.slice()),
  REACTIVE_SPECIAL_INTRO_LEVELS: REACTIVE_SPECIAL_INTRO_LEVELS,
  getActiveColorCount: getActiveColorCount,
  getUnlockedNormalBallColors: getUnlockedNormalBallColors,
  getActiveNormalBallColors: getActiveNormalBallColors,
  getCollectibleTargetColors: getCollectibleTargetColors,
  getCollectibleTargetColor: getCollectibleTargetColor,
  assertActiveNormalBallColors: assertActiveNormalBallColors,
  isTimedLevelId: isTimedLevelId,
  isTrappedSpriteRescueLevelId: isTrappedSpriteRescueLevelId,
  getTrappedSpriteRescueSpiritId: getTrappedSpriteRescueSpiritId,
  getClearanceRebalanceCascadePolicy: getClearanceRebalanceCascadePolicy,
  applyClearanceRebalanceShotLimit: applyClearanceRebalanceShotLimit,
  getReactiveSpecialCounts: getReactiveSpecialCounts,
  buildReactiveSpecialEntities: buildReactiveSpecialEntities,
  getIceRatio: getIceRatio,
  getIceBallCount: getIceBallCount,
  buildTrappedSpriteRescueBaseSpecialCounts: buildTrappedSpriteRescueBaseSpecialCounts,
  buildTrappedSpriteRescueShotLimit: buildTrappedSpriteRescueShotLimit,
  getScoreDesignBeat: getScoreDesignBeat,
  buildStarThresholds: buildStarThresholds,
  buildCampaignScoreDesign: buildCampaignScoreDesign,
  getNormalBallOccupancyTarget: getNormalBallOccupancyTarget,
  getLevelPlan: getLevelPlan,
  getTimedLevelTimeBonusBallCount: getTimedLevelTimeBonusBallCount,
  buildTrappedSpriteRescueConfig: buildTrappedSpriteRescueConfig
});
