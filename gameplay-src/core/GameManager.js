"use strict";

var attachGameManagerLifecycleMethods = require("./GameManagerLifecycleMethods");
var attachGameManagerSnapshotMethods = require("./GameManagerSnapshotMethods");

var attachGameManagerBoardPhaseMethods = require("./GameManagerBoardPhaseMethods");
var attachGameManagerSpecialPhaseMethods = require("./GameManagerSpecialPhaseMethods");
var attachGameManagerSpiritCocoonMethods = require("./GameManagerSpiritCocoonMethods");
var attachGameManagerBudMethods = require("./GameManagerBudMethods");
var attachGameManagerRuntimeStateMethods = require("./GameManagerRuntimeStateMethods");
var attachGameManagerInputMethods = require("./GameManagerInputMethods");
var attachGameManagerAdPowerupMethods = require("./GameManagerAdPowerupMethods");
var attachGameManagerPowerupMethods = require("./GameManagerPowerupMethods");
var attachGameManagerUpdateMethods = require("./GameManagerUpdateMethods");
var attachGameManagerColorCloudMethods = require("./GameManagerColorCloudMethods");
var attachGameManagerWindTunnelMethods = require("./GameManagerWindTunnelMethods");

var Logger = require("../../assets/scripts/utils/Logger");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var AssistSpiritSkillChargeConfig = require("../config/AssistSpiritSkillChargeConfig");
var AssistSpiritSkillConfig = require("../config/AssistSpiritSkillConfig");
var ShooterController = require("../systems/ShooterController");
var TrajectoryPredictor = require("../systems/TrajectoryPredictor");
var BubbleGrid = require("../systems/BubbleGrid");
var MatchSystem = require("../systems/MatchSystem");
var SupportSystem = require("../systems/SupportSystem");
var FairyAssistSystem = require("../systems/FairyAssistSystem");
var BoardViewportSystem = require("../systems/BoardViewportSystem");
var FallingMarbleSystem = require("../systems/FallingMarbleSystem");
var JarCollectorSystem = require("../systems/JarCollectorSystem");
var BoardOcclusionSystem = require("../systems/BoardOcclusionSystem");
var ColorCloudSystem = require("../systems/ColorCloudSystem");
var TrappedSpriteRescueSystem = require("../systems/TrappedSpriteRescueSystem");
var ProjectileMath = require("./ProjectileMath");
var AdRevivePolicy = require("./AdRevivePolicy");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var createGameManagerShotResolutionMethods = require("./GameManagerShotResolutionMethods");
var createGameManagerAssistSpiritSkillMethods = require("./GameManagerAssistSpiritSkillMethods");

var clone = ProjectileMath.clone;
var distance = ProjectileMath.distance;
var lerpPoint = ProjectileMath.lerpPoint;
var quantize = ProjectileMath.quantize;
var buildProjectilePathFromShotPlan = ProjectileMath.buildProjectilePathFromShotPlan;
var measurePathDistance = ProjectileMath.measurePathDistance;
var buildAimGuidePath = ProjectileMath.buildAimGuidePath;
var AD_REVIVE_ALLOWED_STATES = {
  out_of_shots: true,
  lost_danger: true,
  lost_objective: true
};
var ADD_BALL_PROMPT_STATE = "out_of_shots_add_ball_prompt";
var COLLECTION_OBJECTIVE_TYPES = {
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true
};
var AD_RUN_POWERUP_TYPES = {
  three_line_elimination: true,
  plus_three_balls: true
};
var PLUS_THREE_BALLS_AMOUNT = 10;
var SNOW_REMOVAL_CLEAR_COUNT = 10;
var SPLITTER_SPAWN_DELAY_SEC = 0.2;
var VINE_CAST_SHOT_INTERVAL = 3;
var VINE_CAST_PREVIEW_DURATION = SpecialAnimationTiming.vineCast.previewDuration;
var TIMED_LEVEL_RENDER_BUCKET_MS = 250;
var BUBBLE_BREAK_SOUND_INTERVAL_MS = 30;

function assertFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function assertPositiveNumber(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (numberValue <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return numberValue;
}

function assertPositiveInteger(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return numberValue;
}

function readRunPowerupCount(inventory, powerupType) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new Error("Ad run powerup inventory must be an object.");
  }
  if (!Object.prototype.hasOwnProperty.call(inventory, powerupType)) {
    return 0;
  }
  var count = Math.floor(assertFiniteNumber(inventory[powerupType], "Ad run powerup inventory." + powerupType));
  if (count < 0) {
    throw new Error("Ad run powerup inventory cannot be negative: " + powerupType);
  }
  return count;
}

function createEmptyResolution() {
  return {
    attachedCell: null,
    matched: [],
    floating: [],
    collected: [],
    thawed: [],
    iceCollected: 0,
    matchedObjectiveCollected: [],
    injectedSkills: [],
    reactiveTriggered: [],
    blastExplosions: [],
    crystalGunPath: null,
    rainbowPrismClear: null,
    transparentBallsDestroyed: [],
    windTunnelTransits: [],
    windTunnelExitsRemoved: [],
    windTunnelEntranceClosed: false,
    rescuedTrappedSpirits: [],
    spawnedBySplitters: [],
    spiritCocoonOpenings: [],
    spiritCocoonConsumed: [],
    spiritCocoonRecolors: [],
    spiritMistApplied: [],
    spiritMistCleared: [],
    budHatches: [],
    budHatchedCells: [],
    budRecolors: [],
    breederResolved: false,
    breederSpawns: [],
    mineCountdownResolved: false,
    mineCountdowns: [],
    mineExplosions: [],
    swirlRotations: [],
    wormholeShifts: [],
    wormholeProjectileAbsorptions: [],
    blackHoleProjectileAbsorptions: [],
    blackHolesUnloaded: [],
    blackHoleUnsupportedDisappears: [],
    vineCastEvaluated: false,
    vineCasts: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    poisonReleases: [],
    icicleReleases: [],
    bubbleShieldsRemoved: [],
    fairyAssistEvents: [],
    fairyAssistResolved: false,
    impact: null,
    scoreDelta: 0,
    boardCleared: false,
    boardDropped: false,
    boardViewportAdjusted: false,
    topAnchorCollapse: false,
    eliminationSequence: [],
    scoreEvents: [],
    comboRegistered: false,
    multiTrappedSpiritRescueCompleted: false,
    dangerReached: false,
    shotMissed: false,
    eliminationPresentationComplete: false,
    trappedSpriteRotation: null
  };
}

function requireDropGlowStacks(value, description) {
  if (!Number.isInteger(value) || value < 0 || value > FairyAssistConfig.maxGlowStacks) {
    throw new Error(description + " requires glowStacks in [0, " + FairyAssistConfig.maxGlowStacks + "].");
  }
  return value;
}

function resolveCollectedDropAudioGlowStacks(collectedDrops) {
  if (!Array.isArray(collectedDrops) || !collectedDrops.length) {
    throw new Error("Collected drop audio requires non-empty collectedDrops.");
  }

  var maxGlowStacks = 0;
  collectedDrops.forEach(function (drop) {
    var glowStacks = requireDropGlowStacks(drop.glowStacks, "Collected drop audio");
    if (glowStacks > maxGlowStacks) {
      maxGlowStacks = glowStacks;
    }
  });
  return maxGlowStacks;
}

var RAINBOW_TIE_BREAK_ORDER = {
  R: 8,
  G: 7,
  B: 6,
  Y: 5,
  P: 4,
  K: 3,
  O: 2,
  W: 1
};

// 普通匹配消除按固定每球基础分计分；连击增量在结算链路中叠加。
var BASE_SCORE_RULES = {
  shotBase: 120,
  attachBase: 30,
  blastBase: 30,
  matchedDrop: 10,
  floatingDrop: 80,
  blastDrop: 100,
  crystalGunDrop: 100,
  transparentBallBreak: 1000,
  trappedSpiritRescue: 1000,
  jarCollectBase: 60,
  skillOverflow: 220
};

var SCORE_HEAT_PROFILES = {
  tutorial: {
    multiplier: 0.88,
    perShotRange: [170, 250]
  },
  normal: {
    multiplier: 0.98,
    perShotRange: [220, 320]
  },
  hard: {
    multiplier: 1.08,
    perShotRange: [270, 390]
  },
  expert: {
    multiplier: 1.16,
    perShotRange: [320, 470]
  }
};

var SCORE_HEAT_DIFFICULTY_ALIAS = {
  beginner: "tutorial",
  easy: "tutorial",
  advanced: "normal",
  medium: "normal",
  difficult: "hard"
};

function resolveImpactBounceBoardAdvanceDelay() {
  if (typeof SpecialAnimationTiming.calculateImpactBounceTotalDuration !== "function") {
    throw new Error("SpecialAnimationTiming.calculateImpactBounceTotalDuration is required.");
  }

  return SpecialAnimationTiming.calculateImpactBounceTotalDuration(
    IMPACT_BOUNCE_PUSH_DISTANCE,
    IMPACT_BOUNCE_SPEED
  );
}

function requireImpactBounceTiming() {
  if (!SpecialAnimationTiming.impactBounce || typeof SpecialAnimationTiming.impactBounce !== "object") {
    throw new Error("SpecialAnimationTiming.impactBounce is required.");
  }
  return SpecialAnimationTiming.impactBounce;
}

var IMPACT_BOUNCE_TIMING = requireImpactBounceTiming();
var IMPACT_BOUNCE_PUSH_DISTANCE = assertPositiveNumber(
  IMPACT_BOUNCE_TIMING.defaultPushDistance,
  "SpecialAnimationTiming.impactBounce.defaultPushDistance"
);
var IMPACT_BOUNCE_SPEED = assertPositiveNumber(
  BoardLayout.impactBounceSpeed,
  "BoardLayout.impactBounceSpeed"
);
// 碰撞反馈播放完成后再下压，避免命中反馈与网格位移同帧造成视觉偏差。
var BOARD_ADVANCE_AFTER_IMPACT_DELAY = assertPositiveNumber(
  resolveImpactBounceBoardAdvanceDelay(),
  "Board advance after impact delay"
);
var BOARD_ADVANCE_DELAY_EPSILON = 0.000001;
var KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY = SpecialAnimationTiming.keyUnlock.totalDuration;
if (
  !SpecialAnimationTiming.swirlRotation ||
  typeof SpecialAnimationTiming.swirlRotation.duration !== "number" ||
  !isFinite(SpecialAnimationTiming.swirlRotation.duration) ||
  SpecialAnimationTiming.swirlRotation.duration <= 0
) {
  throw new Error("SpecialAnimationTiming.swirlRotation.duration must be positive.");
}
if (SpecialAnimationTiming.swirlRotation.angleDegrees !== 60) {
  throw new Error("SpecialAnimationTiming.swirlRotation.angleDegrees must be exactly 60.");
}
var SWIRL_ROTATION_DURATION = SpecialAnimationTiming.swirlRotation.duration;
if (
  !SpecialAnimationTiming.wormholeShift ||
  typeof SpecialAnimationTiming.wormholeShift.duration !== "number" ||
  !isFinite(SpecialAnimationTiming.wormholeShift.duration) ||
  SpecialAnimationTiming.wormholeShift.duration <= 0
) {
  throw new Error("SpecialAnimationTiming.wormholeShift.duration must be positive.");
}
if (
  typeof SpecialAnimationTiming.wormholeShift.inhaleDuration !== "number" ||
  !isFinite(SpecialAnimationTiming.wormholeShift.inhaleDuration) ||
  SpecialAnimationTiming.wormholeShift.inhaleDuration <= 0 ||
  typeof SpecialAnimationTiming.wormholeShift.exhaleDuration !== "number" ||
  !isFinite(SpecialAnimationTiming.wormholeShift.exhaleDuration) ||
  SpecialAnimationTiming.wormholeShift.exhaleDuration <= 0 ||
  Math.abs(
    SpecialAnimationTiming.wormholeShift.inhaleDuration +
    SpecialAnimationTiming.wormholeShift.exhaleDuration -
    SpecialAnimationTiming.wormholeShift.duration
  ) > 0.000001
) {
  throw new Error("SpecialAnimationTiming wormhole inhale/exhale durations must be positive and sum to duration.");
}
if (
  typeof SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration !== "number" ||
  !isFinite(SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration) ||
  SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration <= 0
) {
  throw new Error("SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration must be positive.");
}
var WORMHOLE_SHIFT_DURATION = SpecialAnimationTiming.wormholeShift.duration;
// 最后一颗入缸后，延迟再弹出 WinView。
var WIN_SETTLEMENT_DELAY_SEC = 1;
var DEFAULT_JAR_SCORE_BOOST_MULTIPLIER = 2;
var DEFAULT_JAR_SCORE_BOOST_DURATION_MS = 5000;
// 第二次连消起，每个匹配碎裂球每增加一层连击额外加 5 分；UI 显示为连击+1、+2…
var COMBO_BONUS_PER_HIT = 5;
function resolveBallDisplayCode(ball) {
  if (!ball) {
    return null;
  }

  if (ball.color) {
    return ball.color;
  }

  if (ball.entityType === "rainbow") {
    return "RAINBOW";
  }

  if (ball.entityType === "blast") {
    return "BLAST";
  }

  if (ball.entityType === "crystal_gun") {
    return "CRYSTAL_GUN";
  }

  if (ball.entityType === "rainbow_prism_ball") {
    return "RAINBOW_PRISM_BALL";
  }

  if (ball.entityType === "stone") {
    return "STONE";
  }

  if (ball.entityType === "molotov") {
    return "MOLOTOV";
  }

  if (ball.entityType === "splitter") {
    return "SPLIT_" + ball.splitColor;
  }

  if (ball.entityType === "swirl") {
    return "SWIRL";
  }

  if (ball.entityType === "locked") {
    return "LOCKED";
  }

  if (ball.entityType === "key") {
    return "KEY";
  }

  return null;
}

function isSkillBall(cellOrBall) {
  return !!(cellOrBall && cellOrBall.entityCategory === "skill_ball");
}

function isPowerupShotBall(ball) {
  return !!(
    isSkillBall(ball) ||
    (ball && ball.sourceSkillBallType === "rainbow")
  );
}

function isIceBall(cellOrBall) {
  return !!(
    cellOrBall &&
    cellOrBall.entityCategory === "obstacle_ball" &&
    cellOrBall.entityType === "ice"
  );
}

function isStoneBall(cellOrBall) {
  return !!(
    cellOrBall &&
    cellOrBall.entityCategory === "obstacle_ball" &&
    cellOrBall.entityType === "stone"
  );
}

function isBarrierObstacleBall(cellOrBall) {
  return isStoneBall(cellOrBall) || isIceBall(cellOrBall);
}

function isBlastBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "blast");
}

function isCrystalGunBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "crystal_gun");
}

function isRainbowPrismBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "rainbow_prism_ball");
}

function isRainbowBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "rainbow");
}

function isMolotovBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "molotov");
}

function isSplitterBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "splitter");
}

function isBreederBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "breeder");
}

function isSwirlBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "swirl");
}

function isWormholeBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "wormhole");
}

function isBlackHoleBall(ball) {
  return !!(ball && ball.entityCategory === "hazard_ball" && ball.entityType === "black_hole");
}

function isVineSpiritBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "vine_spirit");
}

function isVineEntangledBall(ball) {
  return !!(
    ball &&
    ball.entityCategory === "normal_ball" &&
    typeof ball.vineOwnerId === "string" &&
    ball.vineOwnerId
  );
}

function isLockedBall(ball) {
  return !!(ball && ball.entityCategory === "locked_ball" && ball.entityType === "locked");
}

function isKeyBall(ball) {
  return !!(ball && ball.entityCategory === "key_ball" && ball.entityType === "key");
}

function resolveIceInnerColor(cellOrBall) {
  if (!cellOrBall) {
    return null;
  }

  if (typeof cellOrBall.innerColor === "string" && cellOrBall.innerColor) {
    return cellOrBall.innerColor;
  }

  return null;
}

function buildBubbleBreakShatterDelaysMs(removedCells, eliminationSequence) {
  if (!Array.isArray(removedCells) || !removedCells.length) {
    return [];
  }

  if (typeof eliminationSequence !== "undefined") {
    if (!Array.isArray(eliminationSequence)) {
      throw new Error("Bubble break event eliminationSequence must be an array when provided.");
    }
    var removedCellIds = {};
    removedCells.forEach(function (cell) {
      if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
        throw new Error("Bubble break event removed cell requires id.");
      }
      removedCellIds[String(cell.id)] = true;
    });

    return eliminationSequence.filter(function (entry) {
      if (!entry || (typeof entry.cellId !== "string" && typeof entry.cellId !== "number")) {
        throw new Error("Bubble break event elimination sequence entry requires cellId.");
      }
      return removedCellIds[String(entry.cellId)] === true;
    }).map(function (entry) {
      var delayMs = Number(entry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Bubble break event elimination sequence delayMs must be non-negative.");
      }
      return delayMs;
    });
  }

  return removedCells.map(function (cell, index) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Bubble break event removed cell requires id.");
    }
    return index * BUBBLE_BREAK_SOUND_INTERVAL_MS;
  });
}

function requireSnowRemovalTargetCoordinates(cell, description) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error(description + " requires integer row and col.");
  }
  return cell;
}

function compareSnowRemovalTargetsFromBoardBottom(left, right) {
  requireSnowRemovalTargetCoordinates(left, "Snow removal left target");
  requireSnowRemovalTargetCoordinates(right, "Snow removal right target");
  if (left.row !== right.row) {
    return right.row - left.row;
  }
  return left.col - right.col;
}

function buildSnowRemovalTargetKey(targets) {
  if (!Array.isArray(targets)) {
    throw new Error("Snow removal target key requires target array.");
  }
  return targets.map(function (target) {
    requireSnowRemovalTargetCoordinates(target, "Snow removal target");
    return target.row + ":" + target.col;
  }).sort().join(",");
}

function buildIceSnowballCollectEntry(cell, innerColor) {
  if (!cell || typeof cell !== "object") {
    throw new Error("Ice snowball collect entry requires cell.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball collect entry requires innerColor.");
  }

  var entry = {
    id: cell.id,
    innerColor: innerColor
  };
  if (Number.isInteger(cell.row) && Number.isInteger(cell.col)) {
    entry.row = cell.row;
    entry.col = cell.col;
  }
  if (cell.position && typeof cell.position.x === "number" && typeof cell.position.y === "number") {
    entry.x = cell.position.x;
    entry.y = cell.position.y;
  }
  return entry;
}

function buildActiveProjectile(firedBall, shotPlan) {
  var pathPoints = buildProjectilePathFromShotPlan(shotPlan);
  var displayCode = resolveBallDisplayCode(firedBall);

  return {
    position: clone(pathPoints[0]),
    color: displayCode,
    ball: firedBall ? clone(firedBall) : null,
    speed: BoardLayout.projectileSpeed,
    pathPoints: pathPoints,
    segmentIndex: 0,
    segmentProgress: 0,
    destroyedTransparentBalls: [],
    colorCloudInsideIds: {},
    scale: 1,
    targetCell: shotPlan && shotPlan.targetCell ? clone(shotPlan.targetCell) : null,
    shotPlan: shotPlan ? clone(shotPlan) : null
  };
}

function buildRuntimeProjectileSnapshot(projectile) {
  if (!projectile) {
    return null;
  }

  return {
    position: {
      x: projectile.position.x,
      y: projectile.position.y
    },
    color: projectile.color,
    scale: projectile.scale,
    ball: projectile.ball ? clone(projectile.ball) : null
  };
}

function findPrimaryCollectionObjective(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  if (!level) {
    return null;
  }

  var sources = [level.bonusObjectives, level.winConditions];
  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    var objectives = Array.isArray(sources[sourceIndex]) ? sources[sourceIndex] : [];
    for (var objectiveIndex = 0; objectiveIndex < objectives.length; objectiveIndex += 1) {
      var objective = objectives[objectiveIndex];
      if (objective && COLLECTION_OBJECTIVE_TYPES[objective.type] === true) {
        return objective;
      }
    }
  }

  return null;
}

function listCollectionRewardObjectives(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  if (!level) {
    throw new Error("Collection reward evaluation requires level config.");
  }
  if (!Array.isArray(level.winConditions)) {
    throw new Error("Collection reward evaluation requires level.winConditions array.");
  }
  if (!Array.isArray(level.bonusObjectives)) {
    throw new Error("Collection reward evaluation requires level.bonusObjectives array.");
  }

  return level.bonusObjectives.concat(level.winConditions).filter(function (objective) {
    return objective && COLLECTION_OBJECTIVE_TYPES[objective.type] === true;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeStarThresholds(scoreHeatBand) {
  var band = scoreHeatBand || {};
  var star1 = Math.max(0, Math.floor(Number(band.min) || 0));
  var star2 = Math.max(star1, Math.floor(Number(band.target) || 0));
  var star3 = Math.max(star2, Math.floor(Number(band.max) || 0));

  return {
    star1: star1,
    star2: star2,
    star3: star3
  };
}

function calculateStarRating(score, scoreHeatBand) {
  var thresholds = normalizeStarThresholds(scoreHeatBand);
  var safeScore = Math.max(0, Math.floor(Number(score) || 0));
  var stars = 0;

  if (thresholds.star1 > 0 && safeScore >= thresholds.star1) {
    stars += 1;
  }
  if (thresholds.star2 > 0 && safeScore >= thresholds.star2) {
    stars += 1;
  }
  if (thresholds.star3 > 0 && safeScore >= thresholds.star3) {
    stars += 1;
  }

  return stars;
}

function calculateStarProgress(score, scoreHeatBand) {
  var thresholds = normalizeStarThresholds(scoreHeatBand);
  var safeScore = Math.max(0, Number(score) || 0);
  var maxThreshold = Math.max(0, thresholds.star3);

  if (maxThreshold <= 0) {
    return 0;
  }

  return clamp(safeScore / maxThreshold, 0, 1);
}

function cloneScoreRules(rules) {
  return Object.keys(rules || {}).reduce(function (result, key) {
    result[key] = Number(rules[key]) || 0;
    return result;
  }, {});
}

function resolveScoreHeatDifficulty(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var rawDifficulty = typeof (level && level.difficulty) === "string"
    ? level.difficulty.trim().toLowerCase()
    : "";
  if (!rawDifficulty) {
    return "normal";
  }

  if (SCORE_HEAT_PROFILES[rawDifficulty]) {
    return rawDifficulty;
  }

  return SCORE_HEAT_DIFFICULTY_ALIAS[rawDifficulty] || "normal";
}

function buildScoreRulesForLevel(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var difficulty = resolveScoreHeatDifficulty(levelConfig);
  var profile = SCORE_HEAT_PROFILES[difficulty] || SCORE_HEAT_PROFILES.normal;
  var multiplier = profile.multiplier;

  var difficultyScore = Number(level && level.difficultyScore);
  if (Number.isFinite(difficultyScore) && difficultyScore > 0) {
    // 用配置里的 difficultyScore 做轻量热度修正（不影响关卡可读性）。
    multiplier += (difficultyScore - 70) * 0.0015;
  }

  multiplier = clamp(multiplier, 0.82, 1.22);

  var rules = cloneScoreRules(BASE_SCORE_RULES);
  Object.keys(rules).forEach(function (key) {
    if (key === "matchedDrop" || key === "transparentBallBreak" || key === "trappedSpiritRescue") {
      return;
    }
    rules[key] = Math.max(1, Math.round(rules[key] * multiplier));
  });

  return {
    difficulty: difficulty,
    multiplier: multiplier,
    rules: rules
  };
}

function buildScoreHeatBand(levelConfig, scoreProfile) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var configuredTargetScore = Math.max(0, Math.floor(Number(level && level.targetScore) || 0));
  var targetScore = configuredTargetScore;

  if (targetScore <= 0) {
    var shotLimit = Math.max(0, Math.floor(Number(level && level.shotLimit) || 0));
    var profile = scoreProfile && SCORE_HEAT_PROFILES[scoreProfile.difficulty]
      ? SCORE_HEAT_PROFILES[scoreProfile.difficulty]
      : SCORE_HEAT_PROFILES.normal;
    var perShotRange = profile.perShotRange || [220, 320];
    var objective = findPrimaryCollectionObjective(levelConfig);
    var objectiveTarget = objective ? Math.max(0, Math.floor(Number(objective.value) || 0)) : 0;
    var objectiveBoost = objectiveTarget * (scoreProfile && scoreProfile.rules ? scoreProfile.rules.jarCollectBase : BASE_SCORE_RULES.jarCollectBase);
    var fallbackMin = Math.round(shotLimit * perShotRange[0] + objectiveBoost * 0.5);
    var fallbackMax = Math.round(shotLimit * perShotRange[1] + objectiveBoost);
    if (fallbackMax < fallbackMin) {
      fallbackMax = fallbackMin;
    }
    targetScore = Math.round((fallbackMin + fallbackMax) * 0.5);
  }

  targetScore = Math.max(1, targetScore);
  var starThresholds = level && level.starThresholds !== undefined
    ? StarRatingPolicy.resolveStarThresholds(levelConfig)
    : StarRatingPolicy.buildStarThresholdsFromTargetScore(targetScore);

  return {
    min: starThresholds.star1,
    target: starThresholds.star2,
    max: starThresholds.star3,
    targetScore: targetScore,
    difficulty: scoreProfile ? scoreProfile.difficulty : "normal",
    multiplier: scoreProfile ? Number(scoreProfile.multiplier.toFixed(3)) : 1
  };
}

function GameManager(options) {
  options = options || {};

  this.poolManager = options.poolManager || null;
  this.levelManager = options.levelManager || null;
  this.state = "idle";
  this.currentLevel = null;
  this.remainingShots = 0;
  this.score = 0;
  this.comboStreak = 0;
  this.maxComboStreak = 0;
  this.shotsFired = 0;
  this.equippedAssistSpiritId = null;
  this.equippedAssistSpiritLevel = null;
  this.lastAssistSpiritProducedBallEvaluationShot = 0;
  this.assistSpiritSkillSeed = null;
  this.assistSpiritSkillResolutionSequence = 0;
  this.assistSpiritSkillCharge = 0;
  this.assistSpiritSkillChargeMax = 0;
  this.assistSpiritSkillChargedCellIds = {};
  this.assistSpiritSkillChargeSuppressed = false;
  this.dropInterval = 0;
  this.lastFiredColor = null;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = null;
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;
  this.trajectoryCacheKey = null;
  this.trajectoryCachePlan = null;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  this._cachedAdRunPowerupAllowed = null;
  this.cachedBoardVersion = -1;
  this.cachedBoardViewportOffsetY = null;
  this.cachedBoardSnapshot = null;
  this.cachedJarSnapshotKey = "";
  this.cachedJarSnapshot = null;
  this.sameColorJarCollected = 0;
  this.sameColorJarBonusScore = 0;
  this.iceCollectedTotal = 0;
  this.isTimedInfiniteShots = false;
  this.timeLimitMs = 0;
  this.remainingTimeMs = 0;
  this.timerPaused = false;
  this.requiredStarCount = 0;
  this.adRunPowerupInventory = {};
  this.adRunPowerupGrantCounts = {};
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
  this.trappedSpriteRescueEventEmitted = false;
  this.surplusShotAimRecenterRevision = 0;
  this.surplusShotAimRecentered = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = 0;
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = false;
  this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
  this.pendingDropIntervalBoardAdvance = false;
  this.boardAdvancedThisFrame = false;
  this.boardAdvanceUpdateSerial = 0;
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  this.pendingWinSettlementDelay = 0;
  this.pendingSplitterSpawns = [];
  this.pendingSpiritCocoonOpenings = [];
  this.pendingBudHatches = [];
  this.pendingMolotovBlastQueue = [];
  this.activeMolotovBlast = null;
  this.molotovBlastTriggeredIds = {};
  this.molotovResolutionPending = false;
  this.molotovPendingResolutionContext = null;
  this.pendingSwirlRotationRemaining = 0;
  this.pendingSwirlRotationResolution = null;
  this.pendingSwirlRotationWaitingForEliminationPresentation = false;
  this.pendingWormholeShiftRemaining = 0;
  this.pendingWormholeShiftResolution = null;
  this.pendingVineCastRemaining = 0;
  this.pendingVineCastResolution = null;
  this.pendingTrappedSpritePostImpactResolution = null;
  this.pendingBarrierHammer = false;
  this.pendingRainbowColorSelection = null;
  this.ricochetGuideActive = false;
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
  this._lastTimerRenderBucket = -1;
  this.grantedTimeBonusCellIds = {};
  this.scoreRules = cloneScoreRules(BASE_SCORE_RULES);
  this.scoreHeatBand = buildScoreHeatBand(null, {
    difficulty: "normal",
    multiplier: 1,
    rules: this.scoreRules
  });
  this.systems = {
    shooterController: new ShooterController(),
    trajectoryPredictor: new TrajectoryPredictor(),
    boardViewportSystem: new BoardViewportSystem(),
    trappedSpriteRescueSystem: new TrappedSpriteRescueSystem(),
    bubbleGrid: new BubbleGrid(),
    matchSystem: new MatchSystem(),
    supportSystem: new SupportSystem(),
    fairyAssistSystem: new FairyAssistSystem(),
    fallingMarbleSystem: new FallingMarbleSystem(),
    jarCollectorSystem: new JarCollectorSystem(),
    boardOcclusionSystem: new BoardOcclusionSystem(),
    colorCloudSystem: new ColorCloudSystem()
  };
  this.systems.bubbleGrid.attachBoardViewport(this.systems.boardViewportSystem);
  this.systems.bubbleGrid.attachTrappedSpriteRescueSystem(this.systems.trappedSpriteRescueSystem);
  this.systems.bubbleGrid.attachCellRemovalListener(function (removedCells, removalReason) {
    this._grantTimeBonusForRemovedCells(removedCells, removalReason);
    this._pushSpiderCocoonBreakEvent(removedCells);
    this._pushMineDisappearEvents(removedCells, removalReason);
  }.bind(this));
  this.systems.fallingMarbleSystem.attachFairyAssistSystem(this.systems.fairyAssistSystem);
  this.spiritCocoonFirstTriggerStore = options.spiritCocoonFirstTriggerStore;
  this.spiritCocoonRandom = Math.random;
  this.budRandom = Math.random;
  this.rainbowPrismRandom = Math.random;
  this.colorCloudRandom = Math.random;
  this.windTunnelRandom = Math.random;
}

var GAME_MANAGER_ENTRY_CONTEXT = {
  AssistSpiritSkillChargeConfig: AssistSpiritSkillChargeConfig,
  BoardLayout: BoardLayout,
  FallingMarbleSystem: FallingMarbleSystem,
  Logger: Logger,
  TIMED_LEVEL_RENDER_BUCKET_MS: TIMED_LEVEL_RENDER_BUCKET_MS,
  assertFiniteNumber: assertFiniteNumber,
  assertPositiveInteger: assertPositiveInteger,
  buildAimGuidePath: buildAimGuidePath,
  buildRuntimeProjectileSnapshot: buildRuntimeProjectileSnapshot,
  buildScoreHeatBand: buildScoreHeatBand,
  buildScoreRulesForLevel: buildScoreRulesForLevel,
  calculateStarProgress: calculateStarProgress,
  calculateStarRating: calculateStarRating,
  clone: clone,
  createEmptyResolution: createEmptyResolution,
  normalizeStarThresholds: normalizeStarThresholds,
  quantize: quantize
};
attachGameManagerLifecycleMethods(GameManager, GAME_MANAGER_ENTRY_CONTEXT);
attachGameManagerSnapshotMethods(GameManager, GAME_MANAGER_ENTRY_CONTEXT);

var GAME_MANAGER_METHOD_CONTEXT = {
  ADD_BALL_PROMPT_STATE: ADD_BALL_PROMPT_STATE,
  AD_REVIVE_ALLOWED_STATES: AD_REVIVE_ALLOWED_STATES,
  AD_RUN_POWERUP_TYPES: AD_RUN_POWERUP_TYPES,
  AdRevivePolicy: AdRevivePolicy,
  AssistSpiritSkillChargeConfig: AssistSpiritSkillChargeConfig,
  AssistSpiritSkillConfig: AssistSpiritSkillConfig,
  BASE_SCORE_RULES: BASE_SCORE_RULES,
  BOARD_ADVANCE_AFTER_IMPACT_DELAY: BOARD_ADVANCE_AFTER_IMPACT_DELAY,
  BOARD_ADVANCE_DELAY_EPSILON: BOARD_ADVANCE_DELAY_EPSILON,
  BoardLayout: BoardLayout,
  BoardOcclusionSystem: BoardOcclusionSystem,
  BoardViewportSystem: BoardViewportSystem,
  BubbleGrid: BubbleGrid,
  DEFAULT_JAR_SCORE_BOOST_DURATION_MS: DEFAULT_JAR_SCORE_BOOST_DURATION_MS,
  DEFAULT_JAR_SCORE_BOOST_MULTIPLIER: DEFAULT_JAR_SCORE_BOOST_MULTIPLIER,
  FallingMarbleSystem: FallingMarbleSystem,
  IMPACT_BOUNCE_PUSH_DISTANCE: IMPACT_BOUNCE_PUSH_DISTANCE,
  IMPACT_BOUNCE_SPEED: IMPACT_BOUNCE_SPEED,
  KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY: KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY,
  Logger: Logger,
  PLUS_THREE_BALLS_AMOUNT: PLUS_THREE_BALLS_AMOUNT,
  SNOW_REMOVAL_CLEAR_COUNT: SNOW_REMOVAL_CLEAR_COUNT,
  SPLITTER_SPAWN_DELAY_SEC: SPLITTER_SPAWN_DELAY_SEC,
  SWIRL_ROTATION_DURATION: SWIRL_ROTATION_DURATION,
  ShooterController: ShooterController,
  SpecialAnimationTiming: SpecialAnimationTiming,
  TIMED_LEVEL_RENDER_BUCKET_MS: TIMED_LEVEL_RENDER_BUCKET_MS,
  VINE_CAST_PREVIEW_DURATION: VINE_CAST_PREVIEW_DURATION,
  VINE_CAST_SHOT_INTERVAL: VINE_CAST_SHOT_INTERVAL,
  WIN_SETTLEMENT_DELAY_SEC: WIN_SETTLEMENT_DELAY_SEC,
  WORMHOLE_SHIFT_DURATION: WORMHOLE_SHIFT_DURATION,
  assertFiniteNumber: assertFiniteNumber,
  assertPositiveInteger: assertPositiveInteger,
  buildActiveProjectile: buildActiveProjectile,
  buildBubbleBreakShatterDelaysMs: buildBubbleBreakShatterDelaysMs,
  buildIceSnowballCollectEntry: buildIceSnowballCollectEntry,
  buildSnowRemovalTargetKey: buildSnowRemovalTargetKey,
  calculateStarRating: calculateStarRating,
  clone: clone,
  compareSnowRemovalTargetsFromBoardBottom: compareSnowRemovalTargetsFromBoardBottom,
  createEmptyResolution: createEmptyResolution,
  distance: distance,
  findPrimaryCollectionObjective: findPrimaryCollectionObjective,
  isBarrierObstacleBall: isBarrierObstacleBall,
  isBreederBall: isBreederBall,
  isBlackHoleBall: isBlackHoleBall,
  isIceBall: isIceBall,
  isPowerupShotBall: isPowerupShotBall,
  isStoneBall: isStoneBall,
  isSwirlBall: isSwirlBall,
  isWormholeBall: isWormholeBall,
  lerpPoint: lerpPoint,
  listCollectionRewardObjectives: listCollectionRewardObjectives,
  readRunPowerupCount: readRunPowerupCount,
  requireDropGlowStacks: requireDropGlowStacks,
  requireSnowRemovalTargetCoordinates: requireSnowRemovalTargetCoordinates,
  resolveCollectedDropAudioGlowStacks: resolveCollectedDropAudioGlowStacks,
  resolveIceInnerColor: resolveIceInnerColor
};
attachGameManagerBoardPhaseMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerSpecialPhaseMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerSpiritCocoonMethods(GameManager);
attachGameManagerBudMethods(GameManager);
attachGameManagerRuntimeStateMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerInputMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerAdPowerupMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerPowerupMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerColorCloudMethods(GameManager);
attachGameManagerWindTunnelMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);
attachGameManagerUpdateMethods(GameManager, GAME_MANAGER_METHOD_CONTEXT);

Object.assign(GameManager.prototype, createGameManagerShotResolutionMethods({
  Logger: Logger,
  BoardLayout: BoardLayout,
  clone: clone,
  quantize: quantize,
  buildProjectilePathFromShotPlan: buildProjectilePathFromShotPlan,
  measurePathDistance: measurePathDistance,
  RAINBOW_TIE_BREAK_ORDER: RAINBOW_TIE_BREAK_ORDER,
  isSkillBall: isSkillBall,
  isIceBall: isIceBall,
  isBlastBall: isBlastBall,
  isCrystalGunBall: isCrystalGunBall,
  isRainbowPrismBall: isRainbowPrismBall,
  isBlackHoleBall: isBlackHoleBall,
  isRainbowBall: isRainbowBall,
  isMolotovBall: isMolotovBall,
  isSplitterBall: isSplitterBall,
  isVineSpiritBall: isVineSpiritBall,
  isVineEntangledBall: isVineEntangledBall,
  isLockedBall: isLockedBall,
  isKeyBall: isKeyBall,
  resolveIceInnerColor: resolveIceInnerColor,
  createEmptyResolution: createEmptyResolution,
  COMBO_BONUS_PER_HIT: COMBO_BONUS_PER_HIT,
  findPrimaryCollectionObjective: findPrimaryCollectionObjective,
  listCollectionRewardObjectives: listCollectionRewardObjectives
}));
Object.assign(GameManager.prototype, createGameManagerAssistSpiritSkillMethods({
  createEmptyResolution: createEmptyResolution
}));

module.exports = GameManager;

