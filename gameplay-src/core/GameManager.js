"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var ShooterController = require("../systems/ShooterController");
var TrajectoryPredictor = require("../systems/TrajectoryPredictor");
var BubbleGrid = require("../systems/BubbleGrid");
var MatchSystem = require("../systems/MatchSystem");
var SupportSystem = require("../systems/SupportSystem");
var FairyAssistSystem = require("../systems/FairyAssistSystem");
var BoardViewportSystem = require("../systems/BoardViewportSystem");
var FallingMarbleSystem = require("../systems/FallingMarbleSystem");
var JarCollectorSystem = require("../systems/JarCollectorSystem");
var ProjectileMath = require("./ProjectileMath");
var AdRevivePolicy = require("./AdRevivePolicy");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var createGameManagerShotResolutionMethods = require("./GameManagerShotResolutionMethods");

var clone = ProjectileMath.clone;
var distance = ProjectileMath.distance;
var lerpPoint = ProjectileMath.lerpPoint;
var quantize = ProjectileMath.quantize;
var buildProjectilePathFromShotPlan = ProjectileMath.buildProjectilePathFromShotPlan;
var measurePathDistance = ProjectileMath.measurePathDistance;
var buildAimGuidePath = ProjectileMath.buildAimGuidePath;
var AD_REVIVE_ALLOWED_STATES = {
  out_of_shots: true,
  lost_danger: true
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
    spawnedBySplitters: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
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
    dangerReached: false
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
  R: 5,
  G: 4,
  B: 3,
  Y: 2,
  P: 1
};

// 普通匹配消除按固定每球基础分计分；连击增量在结算链路中叠加。
var BASE_SCORE_RULES = {
  shotBase: 120,
  attachBase: 30,
  blastBase: 30,
  matchedDrop: 10,
  floatingDrop: 80,
  blastDrop: 100,
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

  if (ball.entityType === "stone") {
    return "STONE";
  }

  if (ball.entityType === "molotov") {
    return "MOLOTOV";
  }

  if (ball.entityType === "splitter") {
    return "SPLIT_" + ball.splitColor;
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

function isRainbowBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "rainbow");
}

function isMolotovBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "molotov");
}

function isSplitterBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "splitter");
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
    if (key === "matchedDrop") {
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
  var starThresholds = StarRatingPolicy.buildStarThresholdsFromTargetScore(targetScore);

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
  this.pendingMolotovBlastQueue = [];
  this.activeMolotovBlast = null;
  this.molotovBlastTriggeredIds = {};
  this.molotovResolutionPending = false;
  this.molotovPendingResolutionContext = null;
  this.pendingBarrierHammer = false;
  this.pendingRainbowColorSelection = null;
  this.ricochetGuideActive = false;
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
  this._lastTimerRenderBucket = -1;
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
    bubbleGrid: new BubbleGrid(),
    matchSystem: new MatchSystem(),
    supportSystem: new SupportSystem(),
    fairyAssistSystem: new FairyAssistSystem(),
    fallingMarbleSystem: new FallingMarbleSystem(),
    jarCollectorSystem: new JarCollectorSystem()
  };
  this.systems.bubbleGrid.attachBoardViewport(this.systems.boardViewportSystem);
  this.systems.fallingMarbleSystem.attachFairyAssistSystem(this.systems.fairyAssistSystem);
}

GameManager.prototype.bootstrap = function () {
  this._registerPools();

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].initialize({
      poolManager: this.poolManager,
      levelManager: this.levelManager,
      gameManager: this
    });
  }, this);

  this.state = "bootstrapped";
  Logger.info("Core modules ready", Object.keys(this.systems));
  return this;
};

GameManager.prototype.startLevel = function (levelConfig) {
  this.currentLevel = levelConfig;
  if (!levelConfig || !levelConfig.level) {
    throw new Error("GameManager.startLevel requires level config.");
  }
  var level = levelConfig.level;
  this.isTimedInfiniteShots = level.playMode === "timed_infinite_shots";
  this.timeLimitMs = this.isTimedInfiniteShots ? assertPositiveInteger(level.timeLimitSeconds, "level.timeLimitSeconds") * 1000 : 0;
  this.remainingTimeMs = this.timeLimitMs;
  this.timerPaused = false;
  this._lastTimerRenderBucket = this.isTimedInfiniteShots
    ? Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS)
    : -1;
  this.requiredStarCount = 1;
  this.remainingShots = this.isTimedInfiniteShots ? 0 : assertPositiveInteger(level.shotLimit, "level.shotLimit");
  this.score = 0;
  this.comboStreak = 0;
  this.maxComboStreak = 0;
  this.shotsFired = 0;
  this.levelRandomSeed = assertPositiveInteger(level.levelId, "level.levelId");
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
  this.adRunPowerupInventory = {};
  this.adRunPowerupGrantCounts = {};
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
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
  this.pendingMolotovBlastQueue = [];
  this.activeMolotovBlast = null;
  this.molotovBlastTriggeredIds = {};
  this.molotovResolutionPending = false;
  this.molotovPendingResolutionContext = null;
  this.pendingBarrierHammer = false;
  this.pendingRainbowColorSelection = null;
  this.ricochetGuideActive = false;
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
  var scoreProfile = buildScoreRulesForLevel(levelConfig);
  this.scoreRules = scoreProfile.rules;
  this.scoreHeatBand = buildScoreHeatBand(levelConfig, scoreProfile);

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].configureLevel(levelConfig);
  }, this);

  this._rebuildCachedAdRunPowerupAllowed();
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;

  this.state = "running";
  Logger.info("Level started", levelConfig.level.code);
  return this.getRuntimeSnapshot();
};

GameManager.prototype._createImpactEventFromCell = function (centerCell) {
  if (!centerCell || !this.systems || !this.systems.bubbleGrid) {
    return null;
  }

  var grid = this.systems.bubbleGrid;
  if (!grid.isValidCell(centerCell.row, centerCell.col)) {
    return null;
  }

  var centerPosition = grid.getCellPosition(centerCell.row, centerCell.col);
  var neighborCoords = grid.getNeighborCoordinates(centerCell.row, centerCell.col);
  var neighbors = [];
  for (var i = 0; i < neighborCoords.length; i += 1) {
    var coord = neighborCoords[i];
    var neighborCell = grid.getCell(coord.row, coord.col);
    if (!neighborCell) {
      continue;
    }

    var neighborPosition = grid.getCellPosition(coord.row, coord.col);
    neighbors.push({
      id: neighborCell.id,
      row: neighborCell.row,
      col: neighborCell.col,
      x: neighborPosition.x,
      y: neighborPosition.y
    });
  }

  if (!neighbors.length) {
    return null;
  }

  this.impactSequence += 1;
  return {
    seq: this.impactSequence,
    center: {
      x: centerPosition.x,
      y: centerPosition.y
    },
    neighbors: neighbors,
    pushDistance: IMPACT_BOUNCE_PUSH_DISTANCE,
    bounceSpeed: IMPACT_BOUNCE_SPEED
  };
};

GameManager.prototype._filterImpactEventSurvivors = function (impact, removedCells) {
  if (!impact) {
    return null;
  }
  if (!Array.isArray(removedCells)) {
    throw new Error("Filter impact survivors requires removedCells array.");
  }
  if (!Array.isArray(impact.neighbors)) {
    throw new Error("Impact event requires neighbors array.");
  }

  var removedIds = {};
  for (var removedIndex = 0; removedIndex < removedCells.length; removedIndex += 1) {
    var removedCell = removedCells[removedIndex];
    if (!removedCell || (typeof removedCell.id !== "string" && typeof removedCell.id !== "number")) {
      throw new Error("Filter impact survivors requires removed cell id.");
    }
    removedIds[removedCell.id] = true;
  }

  var grid = this.systems.bubbleGrid;
  var survivingNeighbors = [];
  for (var neighborIndex = 0; neighborIndex < impact.neighbors.length; neighborIndex += 1) {
    var neighbor = impact.neighbors[neighborIndex];
    if (!neighbor || (typeof neighbor.id !== "string" && typeof neighbor.id !== "number")) {
      throw new Error("Impact neighbor requires id.");
    }
    if (removedIds[neighbor.id]) {
      continue;
    }
    if (!Number.isInteger(neighbor.row) || !Number.isInteger(neighbor.col)) {
      throw new Error("Impact neighbor requires row and col.");
    }
    var liveCell = grid.getCell(neighbor.row, neighbor.col);
    if (!liveCell || liveCell.id !== neighbor.id) {
      continue;
    }
    var neighborPosition = grid.getCellPosition(neighbor.row, neighbor.col);
    survivingNeighbors.push({
      id: liveCell.id,
      row: liveCell.row,
      col: liveCell.col,
      x: neighborPosition.x,
      y: neighborPosition.y
    });
  }

  if (!survivingNeighbors.length) {
    return null;
  }

  return {
    seq: impact.seq,
    center: impact.center,
    neighbors: survivingNeighbors,
    pushDistance: impact.pushDistance,
    bounceSpeed: impact.bounceSpeed
  };
};

GameManager.prototype._applyPostImpactBoardShiftPolicy = function (resolution) {
  if (!resolution || !resolution.impact) {
    this._ensureMinimumVisibleBoardRows(resolution);
    return false;
  }
  if (this._isWaitingBoardAdvance()) {
    throw new Error("Post-impact board shift cannot start while board advance is already pending.");
  }

  this.pendingDeferredEnsureMinimumVisibleBoardRows = true;
  this.pendingDropIntervalBoardAdvance = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(
    this._resolveBoardAdvanceSpecialAnimationDelay(resolution),
    BOARD_ADVANCE_AFTER_IMPACT_DELAY
  );
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = this._requiresBoardAdvanceEliminationPresentationWait(resolution);
  this.pendingBoardAdvanceScheduledUpdateSerial = Math.floor(assertFiniteNumber(
    this.boardAdvanceUpdateSerial,
    "GameManager boardAdvanceUpdateSerial"
  ));
  return true;
};

GameManager.prototype._flushDeferredBoardShiftAfterImpact = function () {
  if (this.pendingDeferredEnsureMinimumVisibleBoardRows) {
    this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
    this._ensureMinimumVisibleBoardRows(this.lastResolution);
  }
  this.pendingDropIntervalBoardAdvance = false;
};

GameManager.prototype._getScoreRule = function (key) {
  if (this.scoreRules && typeof this.scoreRules[key] === "number") {
    return this.scoreRules[key];
  }
  return BASE_SCORE_RULES[key] || 0;
};

GameManager.prototype._isWaitingBoardAdvance = function () {
  return this.pendingBoardAdvanceSpecialAnimationDelay > 0 ||
    this.pendingBoardAdvanceDelay > 0 ||
    this.pendingBoardAdvanceEliminationPresentation === true ||
    this.pendingDeferredEnsureMinimumVisibleBoardRows ||
    this.pendingDropIntervalBoardAdvance;
};

GameManager.prototype._hasBoardAdvancedThisFrame = function () {
  if (typeof this.boardAdvancedThisFrame !== "boolean") {
    throw new Error("GameManager boardAdvancedThisFrame must be boolean.");
  }
  return this.boardAdvancedThisFrame;
};

GameManager.prototype._markBoardAdvancedThisFrame = function () {
  this.boardAdvancedThisFrame = true;
};

GameManager.prototype._isBoardAdvanceBusy = function () {
  var viewport = this.systems.boardViewportSystem;
  if (viewport && typeof viewport.isMoving === "function" && viewport.isMoving()) {
    return true;
  }
  if (viewport && viewport.introActive) {
    return true;
  }
  return this._isWaitingBoardAdvance() || this._hasBoardAdvancedThisFrame();
};

GameManager.prototype._isBoardAdvanceScheduledThisUpdate = function () {
  var updateSerial = Math.floor(assertFiniteNumber(this.boardAdvanceUpdateSerial, "GameManager boardAdvanceUpdateSerial"));
  var scheduledSerial = Math.floor(assertFiniteNumber(this.pendingBoardAdvanceScheduledUpdateSerial, "GameManager pendingBoardAdvanceScheduledUpdateSerial"));
  if (updateSerial < 0) {
    throw new Error("GameManager boardAdvanceUpdateSerial must be non-negative.");
  }
  return updateSerial > 0 && scheduledSerial === updateSerial;
};

GameManager.prototype._resolveBoardAdvanceSpecialAnimationDelay = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance special animation delay requires resolution.");
  }
  if (!Array.isArray(resolution.collectedKeys)) {
    throw new Error("Board advance special animation delay requires resolution.collectedKeys array.");
  }
  if (!Array.isArray(resolution.unlockedLockedBalls)) {
    throw new Error("Board advance special animation delay requires resolution.unlockedLockedBalls array.");
  }

  if (resolution.collectedKeys.length > 0 && resolution.unlockedLockedBalls.length > 0) {
    return KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY;
  }
  return 0;
};

GameManager.prototype._requiresBoardAdvanceEliminationPresentationWait = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance elimination presentation wait requires resolution.");
  }
  if (!Array.isArray(resolution.matched)) {
    throw new Error("Board advance elimination presentation wait requires resolution.matched array.");
  }
  return resolution.matched.length > 0;
};

GameManager.prototype.notifyBoardAdvanceEliminationPresentationComplete = function () {
  if (typeof this.pendingBoardAdvanceEliminationPresentation !== "boolean") {
    throw new Error("GameManager pendingBoardAdvanceEliminationPresentation must be boolean.");
  }
  this.pendingBoardAdvanceEliminationPresentation = false;
};

GameManager.prototype._hasPendingSplitterSpawns = function () {
  if (!Array.isArray(this.pendingSplitterSpawns)) {
    throw new Error("GameManager pendingSplitterSpawns must be an array.");
  }
  return this.pendingSplitterSpawns.length > 0;
};

GameManager.prototype._hasPendingMolotovBlasts = function () {
  if (!Array.isArray(this.pendingMolotovBlastQueue)) {
    throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
  }
  if (typeof this.molotovResolutionPending !== "boolean") {
    throw new Error("GameManager molotovResolutionPending must be a boolean.");
  }
  return this.molotovResolutionPending || this.activeMolotovBlast !== null || this.pendingMolotovBlastQueue.length > 0;
};

GameManager.prototype._queuePendingSplitterSpawn = function (splitterCell, resolution) {
  if (!splitterCell || !Number.isInteger(splitterCell.row) || !Number.isInteger(splitterCell.col)) {
    throw new Error("Pending splitter spawn requires splitter cell coordinates.");
  }
  if (typeof splitterCell.splitColor !== "string" || !splitterCell.splitColor) {
    throw new Error("Pending splitter spawn requires splitColor.");
  }
  if (!resolution || !Array.isArray(resolution.spawnedBySplitters)) {
    throw new Error("Pending splitter spawn requires resolution.spawnedBySplitters.");
  }
  if (!Array.isArray(resolution.reactiveTriggered)) {
    throw new Error("Pending splitter spawn requires resolution.reactiveTriggered.");
  }

  var pendingId = splitterCell.id;
  if (typeof pendingId !== "string" && typeof pendingId !== "number") {
    throw new Error("Pending splitter spawn requires splitter id.");
  }
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    if (this.pendingSplitterSpawns[index].id === pendingId) {
      throw new Error("Duplicate pending splitter spawn: " + pendingId);
    }
  }

  this.pendingSplitterSpawns.push({
    id: pendingId,
    row: splitterCell.row,
    col: splitterCell.col,
    splitColor: splitterCell.splitColor,
    remainingDelay: SPLITTER_SPAWN_DELAY_SEC
  });
  resolution.reactiveTriggered.push({
    id: pendingId,
    entityType: "splitter",
    row: splitterCell.row,
    col: splitterCell.col
  });
};

GameManager.prototype._cancelPendingSplitterSpawn = function (splitterCell) {
  if (!splitterCell || (typeof splitterCell.id !== "string" && typeof splitterCell.id !== "number")) {
    throw new Error("Cancel pending splitter spawn requires splitter id.");
  }
  if (!Array.isArray(this.pendingSplitterSpawns)) {
    throw new Error("GameManager pendingSplitterSpawns must be an array.");
  }

  var pendingId = splitterCell.id;
  var nextPending = [];
  var canceled = false;
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    var pending = this.pendingSplitterSpawns[index];
    if (!pending || typeof pending !== "object") {
      throw new Error("Pending splitter spawn entry must be object.");
    }
    if (pending.id === pendingId) {
      canceled = true;
      continue;
    }
    nextPending.push(pending);
  }
  this.pendingSplitterSpawns = nextPending;
  return canceled;
};

GameManager.prototype._updatePendingSplitterSpawns = function (dt) {
  if (!this._hasPendingSplitterSpawns()) {
    return false;
  }
  if (this._isBoardAdvanceBusy()) {
    return false;
  }

  var safeDt = Number(dt);
  if (!Number.isFinite(safeDt) || safeDt < 0) {
    throw new Error("Pending splitter spawn update requires non-negative finite dt.");
  }

  var grid = this.systems.bubbleGrid;
  var nextPending = [];
  var spawnedCells = [];
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    var pending = this.pendingSplitterSpawns[index];
    if (!pending || typeof pending !== "object") {
      throw new Error("Pending splitter spawn entry must be object.");
    }

    pending.remainingDelay -= safeDt;
    if (pending.remainingDelay > 0) {
      nextPending.push(pending);
      continue;
    }

    var spawnCell = grid.findSplitterSpawnCell(pending);
    if (!spawnCell) {
      throw new Error("Pending splitter spawn requires an available spawn cell.");
    }
    var spawnedCell = grid.addBubble(spawnCell, pending.splitColor);
    if (!spawnedCell) {
      throw new Error("Pending splitter spawn failed to add bubble.");
    }
    spawnedCell.sourceSplitterId = pending.id;
    spawnedCell.sourceSplitterRow = pending.row;
    spawnedCell.sourceSplitterCol = pending.col;
    spawnedCells.push(spawnedCell);
  }

  this.pendingSplitterSpawns = nextPending;
  if (!spawnedCells.length) {
    return false;
  }

  if (!this.lastResolution || !Array.isArray(this.lastResolution.spawnedBySplitters)) {
    throw new Error("Pending splitter spawn requires lastResolution.spawnedBySplitters.");
  }
  Array.prototype.push.apply(this.lastResolution.spawnedBySplitters, spawnedCells);
  if (this.state === "won_pending" && grid.getCells().length > 0) {
    this.state = "running";
  }
  this._ensureMinimumVisibleBoardRows(this.lastResolution);
  if (this.state === "out_of_shots_pending" && !this.systems.fallingMarbleSystem.hasActiveDrops() && !this._hasPendingSplitterSpawns() && !this._hasPendingMolotovBlasts() && !this._isBoardAdvanceBusy()) {
    this._showOutOfShotsAddBallPrompt();
  }
  if (grid && typeof grid.assertNoVisualOverlap === "function") {
    grid.assertNoVisualOverlap("pending splitter spawn");
  }
  return true;
};

GameManager.prototype._scheduleBoardAdvanceAfterImpact = function () {
  return false;
};

GameManager.prototype._updatePendingBoardAdvance = function (dt) {
  if (!this._isWaitingBoardAdvance()) {
    return false;
  }
  if (this._isBoardAdvanceScheduledThisUpdate()) {
    return false;
  }

  var safeDt = assertFiniteNumber(dt, "Pending board advance dt");
  if (safeDt < 0) {
    throw new Error("Pending board advance dt must be non-negative.");
  }
  var remainingDt = safeDt;
  if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
    var previousAnimationDelay = this.pendingBoardAdvanceSpecialAnimationDelay;
    this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(0, previousAnimationDelay - remainingDt);
    if (this.pendingBoardAdvanceSpecialAnimationDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
      this.pendingBoardAdvanceSpecialAnimationDelay = 0;
    }
    if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
      return false;
    }
    remainingDt = Math.max(0, remainingDt - previousAnimationDelay);
  }

  this.pendingBoardAdvanceDelay = Math.max(0, this.pendingBoardAdvanceDelay - remainingDt);
  if (this.pendingBoardAdvanceDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
    this.pendingBoardAdvanceDelay = 0;
  }
  if (this.pendingBoardAdvanceDelay > 0) {
    return false;
  }
  if (this.pendingBoardAdvanceEliminationPresentation === true) {
    return false;
  }

  this._flushDeferredBoardShiftAfterImpact();
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  return true;
};

GameManager.prototype._scheduleWinSettlement = function () {
  if (this.state === "won") {
    throw new Error("Cannot schedule win settlement from won state.");
  }
  if (this.pendingWinSettlementDelay > 0) {
    throw new Error("Win settlement delay is already scheduled.");
  }

  this.pendingWinSettlementDelay = WIN_SETTLEMENT_DELAY_SEC;
  this.state = "won_settlement_pending";
  Logger.info("Win settlement scheduled", {
    delaySec: WIN_SETTLEMENT_DELAY_SEC
  });
};

GameManager.prototype._updatePendingWinSettlement = function (dt) {
  if (this.state !== "won_settlement_pending") {
    return false;
  }
  if (this.pendingWinSettlementDelay <= 0) {
    throw new Error("won_settlement_pending requires positive pendingWinSettlementDelay.");
  }

  var safeDt = Math.max(0, Number(dt) || 0);
  this.pendingWinSettlementDelay = Math.max(0, this.pendingWinSettlementDelay - safeDt);
  if (this.pendingWinSettlementDelay > 0) {
    return false;
  }

  this.state = "won";
  if (typeof this._pushRuntimeEvent === "function") {
    this._pushRuntimeEvent("win_settlement_ready", {});
  }
  Logger.info("Win settlement delay finished");
  return true;
};

GameManager.prototype._clearJarScoreBoost = function () {
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
};

GameManager.prototype.activateJarScoreBoost = function (options) {
  options = options || {};
  var multiplier = Math.max(
    1,
    Number(options.multiplier || options.jarScoreBoostMultiplier) || DEFAULT_JAR_SCORE_BOOST_MULTIPLIER
  );
  var durationMs = Math.max(
    0,
    Math.floor(Number(options.durationMs || options.jarScoreBoostRemainingMs) || DEFAULT_JAR_SCORE_BOOST_DURATION_MS)
  );

  if (multiplier <= 1 || durationMs <= 0) {
    this._clearJarScoreBoost();
    return this.getRuntimeSnapshot();
  }

  this.jarScoreBoostActive = true;
  this.jarScoreBoostMultiplier = multiplier;
  this.jarScoreBoostRemainingMs = durationMs;
  this._pushRuntimeEvent("jar_score_boost_activated", {
    boost_multiplier: multiplier,
    remaining_ms: durationMs
  });
  return this.getRuntimeSnapshot(this._drainRuntimeEvents());
};

GameManager.prototype._updateJarScoreBoost = function (dt) {
  if (!this.jarScoreBoostActive) {
    return false;
  }

  var safeDtMs = Math.max(0, Number(dt) || 0) * 1000;
  if (safeDtMs <= 0) {
    return false;
  }

  var previousRemainingMs = this.jarScoreBoostRemainingMs;
  this.jarScoreBoostRemainingMs = Math.max(0, previousRemainingMs - safeDtMs);
  if (this.jarScoreBoostRemainingMs > 0) {
    return this.jarScoreBoostRemainingMs !== previousRemainingMs;
  }

  this._clearJarScoreBoost();
  this._pushRuntimeEvent("jar_score_boost_expired");
  return true;
};

GameManager.prototype._resolveOutOfShotsOutcome = function () {
  if (this.systems.bubbleGrid.getCells().length === 0) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = "out_of_shots";
};

GameManager.prototype._showOutOfShotsAddBallPrompt = function () {
  if (this.systems.bubbleGrid.getCells().length === 0) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = ADD_BALL_PROMPT_STATE;
};

GameManager.prototype.confirmOutOfShotsAddBallPromptClosed = function () {
  if (this.state !== ADD_BALL_PROMPT_STATE) {
    throw new Error("Add ball prompt can only be closed from state: " + ADD_BALL_PROMPT_STATE);
  }

  this._resolveOutOfShotsOutcome();
  return this.getRuntimeSnapshot();
};

GameManager.prototype._pushBubbleBreakEvent = function (removedCells, eliminationSequence) {
  if (!Array.isArray(removedCells) || !removedCells.length) {
    return;
  }

  var shatterDelaysMs = buildBubbleBreakShatterDelaysMs(removedCells, eliminationSequence);
  if (!shatterDelaysMs.length) {
    return;
  }

  this._pushRuntimeEvent("bubble_break", {
    count: shatterDelaysMs.length,
    shatterDelaysMs: shatterDelaysMs
  });
};

GameManager.prototype._pushBombExplosionEvent = function () {
  this._pushRuntimeEvent("bomb_explosion", {});
};

GameManager.prototype._pushLockOpenEvent = function (unlockedCell) {
  if (!unlockedCell || (typeof unlockedCell.id !== "string" && typeof unlockedCell.id !== "number")) {
    throw new Error("Lock open sfx requires unlocked cell id.");
  }
  if (!Number.isInteger(unlockedCell.row) || !Number.isInteger(unlockedCell.col)) {
    throw new Error("Lock open sfx requires unlocked cell coordinates.");
  }

  this._pushRuntimeEvent("lock_open", {
    id: unlockedCell.id,
    row: unlockedCell.row,
    col: unlockedCell.col
  });
};

GameManager.prototype._pushRuntimeEvent = function (type, payload) {
  if (typeof type !== "string" || !type) {
    return;
  }

  this.runtimeEventSequence += 1;
  var eventData = {
    id: this.runtimeEventSequence,
    type: type
  };

  if (payload && typeof payload === "object") {
    Object.keys(payload).forEach(function (key) {
      eventData[key] = payload[key];
    });
  }

  this.pendingRuntimeEvents.push(eventData);
};

GameManager.prototype._pushFairyAssistDepartEvents = function (events) {
  if (!Array.isArray(events)) {
    throw new Error("Fairy assist depart events requires array.");
  }

  events.forEach(function (event) {
    if (!event || typeof event.type !== "string") {
      throw new Error("Fairy assist event requires type.");
    }
    if (event.type === "remove") {
      if (typeof event.fairyId !== "string" || !event.fairyId) {
        throw new Error("Fairy assist remove event requires fairyId.");
      }
      this._pushRuntimeEvent("fairy_assist_depart", {
        fairyId: event.fairyId,
        reason: "remove"
      });
      return;
    }
    if (event.type === "spawn") {
      if (typeof event.replacedFairyId === "string" && event.replacedFairyId) {
        this._pushRuntimeEvent("fairy_assist_depart", {
          fairyId: event.replacedFairyId,
          reason: "replace"
        });
      }
    }
  }, this);
};

GameManager.prototype._drainRuntimeEvents = function () {
  if (!Array.isArray(this.pendingRuntimeEvents) || !this.pendingRuntimeEvents.length) {
    return [];
  }

  var drained = this.pendingRuntimeEvents.slice();
  this.pendingRuntimeEvents.length = 0;
  return drained;
};

GameManager.prototype._getCachedBoardSnapshot = function () {
  var grid = this.systems.bubbleGrid;
  var viewportOffsetY = grid.getViewportOffsetY();
  if (
    !this.cachedBoardSnapshot ||
    this.cachedBoardVersion !== grid.version ||
    this.cachedBoardViewportOffsetY !== viewportOffsetY
  ) {
    this.cachedBoardSnapshot = grid.snapshot();
    this.cachedBoardVersion = grid.version;
    this.cachedBoardViewportOffsetY = viewportOffsetY;
  }
  return this.cachedBoardSnapshot;
};

GameManager.prototype.updateBoardViewportIntro = function (dt) {
  var safeDt = assertFiniteNumber(dt, "GameManager.updateBoardViewportIntro dt");
  if (safeDt < 0) {
    throw new Error("GameManager.updateBoardViewportIntro dt must be non-negative.");
  }
  var viewport = this.systems.boardViewportSystem;
  if (!viewport || typeof viewport.update !== "function") {
    throw new Error("GameManager.updateBoardViewportIntro requires BoardViewportSystem.");
  }
  if (!viewport.introActive && !viewport.isMoving()) {
    return null;
  }
  var viewportFinished = viewport.update(safeDt);
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  return this.getRuntimeSnapshot(this._drainRuntimeEvents(), { refreshScope: "full" });
};

GameManager.prototype._buildJarSnapshotKey = function () {
  var jars = this.systems.jarCollectorSystem;
  var colorKey = jars.jarColors.map(function (colorCode) {
    return colorCode + ":" + (jars.collectedByColor[colorCode] || 0);
  }).join(",");
  return [
    jars.collectedTotal,
    jars.objectiveTarget,
    colorKey,
    jars.lastCollected.length
  ].join("|");
};

GameManager.prototype._getCachedJarSnapshot = function () {
  var key = this._buildJarSnapshotKey();
  if (!this.cachedJarSnapshot || this.cachedJarSnapshotKey !== key) {
    this.cachedJarSnapshot = this.systems.jarCollectorSystem.snapshot();
    this.cachedJarSnapshotKey = key;
  }
  return this.cachedJarSnapshot;
};

GameManager.prototype._registerIceCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var iceObstacleCells = [];
  var thawEntries = [];

  cells.forEach(function (cell) {
    if (!cell) {
      return;
    }
    if (cell.entityCategory === "obstacle_ball" && cell.entityType === "ice") {
      iceObstacleCells.push(cell);
      return;
    }
    if (cell.entityCategory === "normal_ball") {
      if (typeof cell.color !== "string" || !cell.color) {
        throw new Error("Thawed ice snowball collection requires color.");
      }
      thawEntries.push(buildIceSnowballCollectEntry(cell, cell.color));
    }
  });

  var gained = this._registerIceSnowballCollection(iceObstacleCells);
  if (thawEntries.length) {
    this.iceCollectedTotal += thawEntries.length;
    if (this.lastResolution) {
      this.lastResolution.iceCollected += thawEntries.length;
    }
    gained += thawEntries.length;
    this._pushRuntimeEvent("ice_snowball_collect", {
      count: thawEntries.length,
      entries: thawEntries
    });
  }
  return gained;
};

GameManager.prototype._registerIceSnowballCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var gained = 0;
  var entries = [];
  cells.forEach(function (cell) {
    if (!(
      cell &&
      cell.entityCategory === "obstacle_ball" &&
      cell.entityType === "ice" &&
      cell.iceSnowballAlreadyCollected !== true
    )) {
      return;
    }

    var innerColor = cell.innerColor || resolveIceInnerColor(cell);
    entries.push(buildIceSnowballCollectEntry(cell, innerColor));
    cell.iceSnowballAlreadyCollected = true;
    gained += 1;
  });
  if (gained <= 0) {
    return 0;
  }

  this.iceCollectedTotal += gained;
  if (this.lastResolution) {
    this.lastResolution.iceCollected += gained;
  }
  this._pushRuntimeEvent("ice_snowball_collect", {
    count: gained,
    entries: entries
  });
  return gained;
};

GameManager.prototype._thawIceCellAtCurrentPosition = function (grid, targetCell) {
  if (!grid || typeof grid.addBubble !== "function") {
    throw new Error("Ice thaw requires BubbleGrid.addBubble.");
  }
  if (!isIceBall(targetCell)) {
    throw new Error("Ice thaw target must be an ice obstacle.");
  }
  var innerColor = resolveIceInnerColor(targetCell);
  if (!innerColor) {
    throw new Error("Ice thaw target requires innerColor.");
  }
  var thawedCell = grid.addBubble({
    row: targetCell.row,
    col: targetCell.col
  }, innerColor);
  if (!thawedCell || thawedCell.entityCategory !== "normal_ball" || thawedCell.color !== innerColor) {
    throw new Error("Ice thaw must replace obstacle with inner normal ball.");
  }
  return thawedCell;
};

GameManager.prototype._getPrimaryObjectiveProgressValue = function (objective, jarsSnapshot) {
  if (!objective || typeof objective.type !== "string") {
    return 0;
  }

  var jars = jarsSnapshot || this._getCachedJarSnapshot();
  if (objective.type === "collect_any") {
    return Math.max(0, Number(jars && jars.collectedTotal) || 0);
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : "";
    if (!colorCode) {
      return 0;
    }
    var byColor = jars && jars.collectedByColor ? jars.collectedByColor : {};
    return Math.max(0, Number(byColor[colorCode]) || 0);
  }

  if (objective.type === "collect_ice_snowball") {
    return Math.max(0, Number(this.iceCollectedTotal) || 0);
  }

  return 0;
};

GameManager.prototype._areCollectionRewardObjectivesCompleted = function () {
  var objectives = listCollectionRewardObjectives(this.currentLevel);
  if (!objectives.length) {
    throw new Error("Level must contain at least one collection reward objective.");
  }

  var jarsSnapshot = this._getCachedJarSnapshot();
  if (!jarsSnapshot) {
    return false;
  }

  for (var index = 0; index < objectives.length; index += 1) {
    var objective = objectives[index];
    var target = assertPositiveInteger(objective.value, "Collection reward objective value");
    if (this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) < target) {
      return false;
    }
  }

  return true;
};

GameManager.prototype._hasRequiredStarRating = function () {
  var requiredStarCount = assertPositiveInteger(this.requiredStarCount, "GameManager.requiredStarCount");
  if (requiredStarCount !== 1) {
    throw new Error("Clear win requires requiredStarCount to be 1.");
  }
  return calculateStarRating(this.score, this.scoreHeatBand) >= requiredStarCount;
};

GameManager.prototype._isClearWinCompleted = function () {
  return this._hasRequiredStarRating() && this.systems.bubbleGrid.getCells().length === 0;
};

GameManager.prototype._resolveClearWinOutcome = function () {
  if (this.isTimedInfiniteShots) {
    this.state = "won";
    return;
  }

  if (this.remainingShots > 0) {
    this._beginSurplusShotBonus();
    return;
  }

  this._scheduleWinSettlement();
};

GameManager.prototype._buildPrimaryObjectiveSnapshot = function (jarsSnapshot) {
  var objective = findPrimaryCollectionObjective(this.currentLevel);
  if (!objective) {
    return {
      type: null,
      color: null,
      iconCode: null,
      target: 0,
      progress: 0,
      rawProgress: 0,
      progressText: "-",
      iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
    };
  }

  var target = Math.max(0, Math.floor(Number(objective.value) || 0));
  var rawProgress = this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot);
  var progress = target > 0 ? Math.min(rawProgress, target) : rawProgress;
  var iconCode = null;
  if (objective.type === "collect_any") {
    iconCode = "RAINBOW";
  } else if (objective.type === "collect_color") {
    iconCode = typeof objective.color === "string" ? objective.color : null;
  } else if (objective.type === "collect_ice_snowball") {
    iconCode = "ICE_SNOWBALL";
  }

  return {
    type: objective.type,
    color: typeof objective.color === "string" ? objective.color : null,
    iconCode: iconCode,
    target: target,
    progress: progress,
    rawProgress: rawProgress,
    progressText: target > 0 ? (progress + "/" + target) : String(progress),
    iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
  };
};

GameManager.prototype.setAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.systems.shooterController.setAimFromPoint(point);
  this._refreshShotPlan(false);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.beginAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.isAiming = true;
  if (point) {
    this.systems.shooterController.setAimFromPoint(point);
  }

  this._refreshShotPlan(true);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.endAim = function () {
  this.isAiming = false;
  this.pendingShotPlan = null;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.fireShot = function () {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
    this._showOutOfShotsAddBallPrompt();
    return this.getRuntimeSnapshot();
  }

  var shotPlan = this.pendingShotPlan;
  if (!shotPlan || !shotPlan.valid || !shotPlan.targetCell) {
    // 发射优先沿用当前幽灵球路线；仅在缺失时才临时重算。
    this._refreshShotPlan(true);
    shotPlan = this.pendingShotPlan;
  }
  if (!shotPlan || !shotPlan.valid || !shotPlan.targetCell) {
    Logger.warn("Missing valid shot plan, fire aborted");
    return this.getRuntimeSnapshot();
  }

  var remainingShotsAfterFire = this.isTimedInfiniteShots ? 0 : this.remainingShots - 1;
  var queueResult = this.systems.shooterController.advanceQueue(
    remainingShotsAfterFire,
    this.isTimedInfiniteShots
  );
  this.systems.shooterController.resetAimDirection();

  if (!this.isTimedInfiniteShots) {
    this.remainingShots = remainingShotsAfterFire;
  }
  this.shotsFired += 1;
  this.lastFiredColor = queueResult.firedColor;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = buildActiveProjectile(queueResult.firedBall, shotPlan);
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;

  Logger.info("Shot fired", queueResult.firedColor, "remaining", this.remainingShots, "bounce", shotPlan.wallBounceCount);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.grantPowerupInventory = function (powerupType, count) {
  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.addInventory !== "function") {
    return {
      accepted: false,
      reason: "inventory_system_unavailable",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grantResult = shooterController.addInventory(powerupType, count);
  if (!grantResult || !grantResult.accepted) {
    return {
      accepted: false,
      reason: grantResult && grantResult.reason ? grantResult.reason : "inventory_grant_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    powerupType: grantResult.entityType,
    gained: grantResult.gained,
    total: grantResult.total,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._isInstantAdPowerupBusy = function () {
  var canUseInstantPowerup = this.state === "running" || this.state === ADD_BALL_PROMPT_STATE;
  return !!(
    !canUseInstantPowerup ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection ||
    this.systems.fallingMarbleSystem.hasActiveDrops()
  );
};

GameManager.prototype._getAdPowerupRules = function () {
  var level = this.currentLevel && this.currentLevel.level ? this.currentLevel.level : null;
  return level && level.adPowerupRules ? level.adPowerupRules : null;
};

GameManager.prototype._isAdRunPowerupAllowed = function (powerupType) {
  if (AD_RUN_POWERUP_TYPES[powerupType] !== true) {
    throw new Error("Unsupported ad run powerup type: " + powerupType);
  }

  var rules = this._getAdPowerupRules();
  if (!rules || !Array.isArray(rules.allowed)) {
    return false;
  }
  return rules.allowed.indexOf(powerupType) >= 0;
};

GameManager.prototype.grantAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Ad run powerup grant count");
  var granted = readRunPowerupCount(this.adRunPowerupGrantCounts, powerupType);
  this.adRunPowerupGrantCounts[powerupType] = granted + safeCount;
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.grantPreparedAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Prepared ad run powerup grant count");
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.activateRicochetGuide = function () {
  if (this.ricochetGuideActive === true) {
    throw new Error("Ricochet guide is already active for this attempt.");
  }
  this.ricochetGuideActive = true;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.usePreciseAim = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this.ricochetGuideActive === true) {
    return {
      accepted: false,
      reason: "already_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.consumePreciseAim !== "function") {
    throw new Error("Precise aim requires ShooterController.consumePreciseAim.");
  }

  var consumeResult = shooterController.consumePreciseAim();
  if (!consumeResult || typeof consumeResult !== "object") {
    throw new Error("Precise aim consume result must be an object.");
  }
  if (consumeResult.accepted !== true) {
    if (typeof consumeResult.reason !== "string" || !consumeResult.reason) {
      throw new Error("Precise aim consume failure requires reason.");
    }
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.activateRicochetGuide();
  this._pushRuntimeEvent("powerup_precise_aim", {
    remaining: consumeResult.remaining
  });
  return {
    accepted: true,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._consumeAdRunPowerup = function (powerupType) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed"
    };
  }

  var current = readRunPowerupCount(this.adRunPowerupInventory, powerupType);
  if (current <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.adRunPowerupInventory[powerupType] = current - 1;
  return {
    accepted: true,
    remaining: this.adRunPowerupInventory[powerupType]
  };
};

GameManager.prototype.usePlusThreeBalls = function () {
  if (this.isTimedInfiniteShots) {
    return {
      accepted: false,
      reason: "timed_infinite_shots",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var consumeResult = this._consumeAdRunPowerup("plus_three_balls");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.remainingShots += PLUS_THREE_BALLS_AMOUNT;
  var queueResult = this.systems.shooterController.syncFiniteShotQueue(this.remainingShots);
  if (!queueResult || queueResult.accepted !== true) {
    throw new Error("Plus three balls failed to sync shooter queue.");
  }
  this.state = "running";
  this._pushRuntimeEvent("ad_powerup_plus_three_balls", {
    amount: PLUS_THREE_BALLS_AMOUNT,
    remaining_shots: this.remainingShots
  });
  return {
    accepted: true,
    added: PLUS_THREE_BALLS_AMOUNT,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.previewThreeLineElimination = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (!this._isAdRunPowerupAllowed("three_line_elimination")) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (readRunPowerupCount(this.adRunPowerupInventory, "three_line_elimination") <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var cells = grid.getCells();
  if (!cells.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var rowsByIndex = {};
  cells.forEach(function (cell) {
    rowsByIndex[cell.row] = true;
  });
  var rows = Object.keys(rowsByIndex).map(function (row) {
    return Number(row);
  }).sort(function (a, b) {
    return b - a;
  }).slice(0, 3);
  if (!rows.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  return {
    accepted: true,
    rows: rows.map(function (row) {
      return {
        row: row,
        y: grid.getCellPosition(row, 0).y
      };
    }),
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useThreeLineElimination = function (expectedRows) {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var preview = this.previewThreeLineElimination();
  if (!preview.accepted) {
    return preview;
  }

  if (Array.isArray(expectedRows)) {
    var expectedKey = expectedRows.map(function (entry) {
      return typeof entry === "number" ? entry : entry.row;
    }).sort().join(",");
    var actualKey = preview.rows.map(function (entry) {
      return entry.row;
    }).sort().join(",");
    if (expectedKey !== actualKey) {
      throw new Error("Three-line elimination rows changed before resolution.");
    }
  }

  var consumeResult = this._consumeAdRunPowerup("three_line_elimination");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var targetRows = preview.rows.map(function (entry) {
    return entry.row;
  });
  var targetRowMap = {};
  targetRows.forEach(function (row) {
    targetRowMap[row] = true;
  });

  var lineCells = grid.getCells().filter(function (cell) {
    return targetRowMap[cell.row] === true;
  });
  var removedLineCells = grid.removeCells(lineCells);
  this._pushBubbleBreakEvent(removedLineCells);
  var resolution = createEmptyResolution();
  resolution.matched = removedLineCells;
  this._collectRemovedKeysAndResolveUnlocks(removedLineCells, grid, resolution);
  this._registerMatchedObjectiveCollection(removedLineCells, resolution.eliminationSequence, resolution, grid);
  if (removedLineCells.length) {
    resolution.impact = this._createImpactEventFromCell(removedLineCells[0]);
  }

  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeCells(floatingCells);
  this._appendUniqueCells(resolution.floating, removedFloating);
  this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
  var fallingCandidates = removedLineCells.concat(resolution.floating);
  this._registerResolutionDrops(fallingCandidates, grid, resolution, undefined, {
    matchedCellsForDelay: removedLineCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.collected = fallingCandidates;
  resolution.boardCleared = grid.getCells().length === 0;
  this.lastResolution = resolution;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  this._pushRuntimeEvent("ad_powerup_three_line_elimination", {
    rows: targetRows.slice(),
    removed: removedLineCells.length,
    floating: removedFloating.length,
    ice_collected: resolution.iceCollected
  });

  return {
    accepted: true,
    rows: preview.rows,
    removed: removedLineCells.length,
    floating: removedFloating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.reviveFromAd = function () {
  if (AD_REVIVE_ALLOWED_STATES[this.state] !== true) {
    throw new Error("Ad revive can only run from a lose state: " + this.state);
  }
  if (this.activeProjectile) {
    throw new Error("Ad revive cannot run while a projectile is active.");
  }
  if (!this.systems || !this.systems.bubbleGrid) {
    throw new Error("Ad revive requires BubbleGrid.");
  }
  if (!this.systems.shooterController || typeof this.systems.shooterController.setUpcomingNormalBalls !== "function") {
    throw new Error("Ad revive requires ShooterController.setUpcomingNormalBalls.");
  }
  if (typeof this.systems.shooterController.setUpcomingRandomNormalBalls !== "function") {
    throw new Error("Ad revive requires ShooterController.setUpcomingRandomNormalBalls.");
  }

  var revivePlan = AdRevivePolicy.buildRevivePlan(this.currentLevel, {
    board: {
      cells: this.systems.bubbleGrid.getCells()
    },
    objectives: this._buildPrimaryObjectiveSnapshot(this._getCachedJarSnapshot())
  });
  var previousRemainingShots = this.remainingShots;
  this.remainingShots = previousRemainingShots + revivePlan.grantedShots;
  var queueResult = revivePlan.targetColorBallCount > 0
    ? this.systems.shooterController.setUpcomingNormalBalls(
      revivePlan.targetColor,
      revivePlan.targetColorBallCount
    )
    : this.systems.shooterController.setUpcomingRandomNormalBalls(revivePlan.randomBallCount);
  if (!queueResult || queueResult.accepted !== true) {
    throw new Error("Ad revive failed to assign supply balls.");
  }

  this.state = "running";
  this.isAiming = false;
  this.pendingShotPlan = null;
  this.pendingProjectileFinalize = false;
  this.lastResolution = createEmptyResolution();
  this._pushRuntimeEvent("ad_revive_granted", {
    previous_remaining_shots: previousRemainingShots,
    remaining_shots: this.remainingShots,
    granted_shots: revivePlan.grantedShots,
    target_color: revivePlan.targetColor,
    target_color_ball_count: revivePlan.targetColorBallCount,
    random_ball_count: revivePlan.randomBallCount,
    danger_space_shift_rows: gridSpaceResult.shiftRows,
    danger_space_removed_cells: gridSpaceResult.removedCells.length,
    danger_space_rows: gridSpaceResult.spaceRows
  });

  return {
    accepted: true,
    previousRemainingShots: previousRemainingShots,
    remainingShots: this.remainingShots,
    grantedShots: revivePlan.grantedShots,
    targetColor: revivePlan.targetColor,
    targetColorBallCount: revivePlan.targetColorBallCount,
    randomBallCount: revivePlan.randomBallCount,
    dangerSpaceShiftRows: gridSpaceResult.shiftRows,
    dangerSpaceRemovedCells: gridSpaceResult.removedCells,
    dangerSpaceRows: gridSpaceResult.spaceRows,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.useSkillBall = function (entityType) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "targeting_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var equipResult = this.systems.shooterController.equipSkillBall(entityType);
  if (!equipResult || !equipResult.accepted) {
    return {
      accepted: false,
      reason: equipResult && equipResult.reason ? equipResult.reason : "equip_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (entityType === "rainbow") {
    var colors = this.currentLevel && this.currentLevel.level && Array.isArray(this.currentLevel.level.colors)
      ? this.currentLevel.level.colors.slice()
      : [];
    if (!colors.length) {
      throw new Error("Rainbow color selection requires level.colors.");
    }

    this.isAiming = false;
    this.pendingShotPlan = null;
    this.pendingRainbowColorSelection = {
      colors: colors
    };
  } else if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    entityType: entityType,
    remaining: equipResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useSwapBall = function () {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "targeting_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var swapResult = this.systems.shooterController.swapCurrentAndNextBall();
  if (!swapResult || !swapResult.accepted) {
    return {
      accepted: false,
      reason: swapResult && swapResult.reason ? swapResult.reason : "swap_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    remaining: swapResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.previewSnowRemoval = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || !shooterController.skillInventory) {
    throw new Error("Snow removal requires ShooterController skillInventory.");
  }
  if (!Object.prototype.hasOwnProperty.call(shooterController.skillInventory, "snow_removal")) {
    throw new Error("Snow removal inventory count is missing.");
  }
  var inventoryCount = Math.floor(assertFiniteNumber(shooterController.skillInventory.snow_removal, "snow_removal inventory"));
  if (inventoryCount < 0) {
    throw new Error("snow_removal inventory cannot be negative.");
  }
  if (inventoryCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var snowCells = grid.getCells().filter(function (cell) {
    return isIceBall(cell);
  }).sort(compareSnowRemovalTargetsFromBoardBottom);
  if (!snowCells.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var targets = snowCells.slice(0, SNOW_REMOVAL_CLEAR_COUNT).map(function (cell) {
    requireSnowRemovalTargetCoordinates(cell, "Snow removal preview target");
    return {
      row: cell.row,
      col: cell.col
    };
  });

  return {
    accepted: true,
    targets: targets,
    clearCount: targets.length,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useSnowRemoval = function (expectedTargets) {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var preview = this.previewSnowRemoval();
  if (!preview.accepted) {
    return preview;
  }
  if (Array.isArray(expectedTargets)) {
    var expectedKey = buildSnowRemovalTargetKey(expectedTargets);
    var actualKey = buildSnowRemovalTargetKey(preview.targets);
    if (expectedKey !== actualKey) {
      throw new Error("Snow removal targets changed before resolution.");
    }
  }

  var consumeResult = this.systems.shooterController.consumeSnowRemoval();
  if (!consumeResult || !consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult && consumeResult.reason ? consumeResult.reason : "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var targetCells = preview.targets.map(function (target) {
    requireSnowRemovalTargetCoordinates(target, "Snow removal use target");
    var cell = grid.getCell(target.row, target.col);
    if (!isIceBall(cell)) {
      throw new Error("Snow removal target is no longer a snow block: " + target.row + "," + target.col);
    }
    return cell;
  });
  var thawedSnowCells = targetCells.map(function (cell) {
    return this._thawIceCellAtCurrentPosition(grid, cell);
  }, this);
  if (thawedSnowCells.length !== targetCells.length) {
    throw new Error("Snow removal thawed count mismatch.");
  }

  var resolution = createEmptyResolution();
  resolution.thawed = thawedSnowCells;
  if (thawedSnowCells.length) {
    resolution.impact = this._createImpactEventFromCell(thawedSnowCells[0]);
  }
  this.lastResolution = resolution;
  resolution.iceCollected = this._registerIceCollection(thawedSnowCells);

  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeCells(floatingCells);
  this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
    matchedCellsForDelay: thawedSnowCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.floating = removedFloating;
  resolution.collected = removedFloating;
  resolution.boardCleared = grid.getCells().length === 0;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  this._pushRuntimeEvent("powerup_snow_removal", {
    targets: preview.targets.slice(),
    removed: thawedSnowCells.length,
    floating: removedFloating.length,
    ice_collected: resolution.iceCollected
  });

  return {
    accepted: true,
    targets: preview.targets,
    removed: thawedSnowCells.length,
    thawed: thawedSnowCells.length,
    floating: removedFloating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.beginBarrierHammer = function () {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var hammerCount = this.systems &&
    this.systems.shooterController &&
    this.systems.shooterController.skillInventory
    ? Math.max(0, Math.floor(Number(this.systems.shooterController.skillInventory.barrier_hammer) || 0))
    : 0;
  if (hammerCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var hasBarrierObstacle = false;
  var grid = this.systems && this.systems.bubbleGrid ? this.systems.bubbleGrid : null;
  var cells = grid && typeof grid.getCells === "function" ? grid.getCells() : [];
  for (var i = 0; i < cells.length; i += 1) {
    if (isBarrierObstacleBall(cells[i])) {
      hasBarrierObstacle = true;
      break;
    }
  }

  if (!hasBarrierObstacle) {
    return {
      accepted: false,
      reason: "no_obstacle",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.pendingBarrierHammer = true;
  this.pendingRainbowColorSelection = null;
  this.isAiming = false;
  this.pendingShotPlan = null;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.cancelBarrierHammer = function () {
  this.pendingBarrierHammer = false;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.selectRainbowColor = function (colorCode) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "not_selecting_rainbow_color",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (typeof colorCode !== "string" || this.pendingRainbowColorSelection.colors.indexOf(colorCode) === -1) {
    return {
      accepted: false,
      reason: "invalid_color",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var resolveResult = this.systems.shooterController.resolveCurrentRainbowColor(colorCode);
  if (!resolveResult || !resolveResult.accepted) {
    return {
      accepted: false,
      reason: resolveResult && resolveResult.reason ? resolveResult.reason : "rainbow_color_resolve_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.pendingRainbowColorSelection = null;
  this.pendingShotPlan = null;
  this.isAiming = false;

  return {
    accepted: true,
    color: colorCode,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useBarrierHammerAt = function (point) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "not_targeting",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    return {
      accepted: false,
      reason: "invalid_point",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var collision = grid.findCollision(point, BoardLayout.bubbleRadius * 1.05);
  if (!collision) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var targetCell = grid.getCell(collision.row, collision.col);
  if (!targetCell || (!isStoneBall(targetCell) && !isIceBall(targetCell))) {
    return {
      accepted: false,
      reason: "target_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (isIceBall(targetCell) && !resolveIceInnerColor(targetCell)) {
    return {
      accepted: false,
      reason: "target_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var consumeResult = this.systems.shooterController.consumeBarrierHammer();
  if (!consumeResult || !consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult && consumeResult.reason ? consumeResult.reason : "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var resolution = createEmptyResolution();
  resolution.impact = this._createImpactEventFromCell({
    row: targetCell.row,
    col: targetCell.col
  });

  if (isStoneBall(targetCell)) {
    var removedObstacle = grid.removeCells([targetCell]);
    this._pushBubbleBreakEvent(removedObstacle);
    this._collectRemovedKeysAndResolveUnlocks(removedObstacle, grid, resolution);
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    var removedFloating = grid.removeCells(floatingCells);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);

    this._registerResolutionDrops(resolution.floating, grid, resolution);
    this.systems.jarCollectorSystem.collect([]);

    resolution.matched = removedObstacle;
    resolution.collected = resolution.floating.slice();
    resolution.boardCleared = grid.getCells().length === 0;
  } else {
    var thawedCell = this._thawIceCellAtCurrentPosition(grid, targetCell);
    resolution.thawed = thawedCell ? [thawedCell] : [];
    if (typeof this._registerIceCollection === "function") {
      resolution.iceCollected = this._registerIceCollection(resolution.thawed);
    }
    resolution.boardCleared = grid.getCells().length === 0;
    this.systems.fallingMarbleSystem.registerDrops([], grid);
    this.systems.jarCollectorSystem.collect([]);
  }

  this.pendingBarrierHammer = false;
  this.lastResolution = resolution;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  return {
    accepted: true,
    removed: resolution.matched.length,
    thawed: resolution.thawed.length,
    floating: resolution.floating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.pauseTimedLevelTimer = function () {
  if (!this.isTimedInfiniteShots) {
    return this.getRuntimeSnapshot();
  }
  this.timerPaused = true;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.resumeTimedLevelTimer = function () {
  if (!this.isTimedInfiniteShots) {
    return this.getRuntimeSnapshot();
  }
  this.timerPaused = false;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.update = function (dt) {
  var safeDt = assertFiniteNumber(dt, "GameManager.update dt");
  if (safeDt < 0) {
    throw new Error("GameManager.update dt must be non-negative.");
  }
  this.boardAdvanceUpdateSerial += 1;
  this.boardAdvancedThisFrame = false;
  var timerChanged = false;
  if (this.state === "running" && this.isTimedInfiniteShots && !this.timerPaused) {
    var previousRemainingTimeMs = this.remainingTimeMs;
    this.remainingTimeMs = Math.max(0, previousRemainingTimeMs - safeDt * 1000);
    if (this.remainingTimeMs <= 0) {
      timerChanged = true;
    } else {
      var nextTimerRenderBucket = Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS);
      if (nextTimerRenderBucket !== this._lastTimerRenderBucket) {
        this._lastTimerRenderBucket = nextTimerRenderBucket;
        timerChanged = true;
      }
    }
    if (this.remainingTimeMs <= 0) {
      this.state = "lost_objective";
      return this.getRuntimeSnapshot(this._drainRuntimeEvents());
    }
  }

  var hadProjectile = !!this.activeProjectile;
  var hadFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();

  if (this.pendingProjectileFinalize && this.activeProjectile) {
    this.pendingProjectileFinalize = false;
    this._finalizePlannedShot();
  }

  if (this.activeProjectile) {
    var projectile = this.activeProjectile;
    var remainingDistance = projectile.speed * dt;
    var EPSILON = 0.000001;
    var maxStepCount = 48;
    var stepCount = 0;

    while (remainingDistance > EPSILON && this.activeProjectile && stepCount < maxStepCount) {
      stepCount += 1;
      var pathPoints = projectile.pathPoints || [];
      if (projectile.segmentIndex >= pathPoints.length - 1) {
        // Defer heavy attach/match resolution to next frame to avoid end-of-flight frame spikes.
        this.pendingProjectileFinalize = true;
        break;
      }

      var fromPoint = pathPoints[projectile.segmentIndex];
      var toPoint = pathPoints[projectile.segmentIndex + 1];
      var segmentLength = distance(fromPoint, toPoint);

      if (segmentLength <= EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
        continue;
      }

      var segmentRemaining = segmentLength - projectile.segmentProgress;
      if (segmentRemaining <= EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
        continue;
      }

      var step = Math.min(remainingDistance, segmentRemaining);
      if (step <= EPSILON) {
        // Guard against pathological float stalls near segment ends.
        remainingDistance = 0;
        break;
      }
      var nextProgress = projectile.segmentProgress + step;
      var t = nextProgress / segmentLength;

      projectile.position = lerpPoint(fromPoint, toPoint, t);
      projectile.segmentProgress = nextProgress;
      remainingDistance -= step;

      if (projectile.segmentProgress >= segmentLength - EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
      }
    }

    if (stepCount >= maxStepCount && this.activeProjectile) {
      Logger.warn("Projectile step budget exceeded in single frame", {
        segmentIndex: projectile.segmentIndex,
        pathCount: (projectile.pathPoints || []).length
      });
    }
  }

  var viewportWasMoving = this.systems.boardViewportSystem.isMoving();
  var fallingStep = this.systems.fallingMarbleSystem.update(dt);
  var surplusUpdated = !!(fallingStep && fallingStep.surplusUpdated);
  var viewportFinished = this.systems.boardViewportSystem.update(dt);
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  var viewportUpdated = viewportWasMoving || viewportFinished;
  var fallingUpdated = !!(fallingStep && fallingStep.updated);
  var collectedDrops = fallingStep && Array.isArray(fallingStep.collected) ? fallingStep.collected : [];
  var fairyHits = fallingStep && Array.isArray(fallingStep.fairyHits) ? fallingStep.fairyHits : [];
  var fairySplits = fallingStep && Array.isArray(fallingStep.splits) ? fallingStep.splits : [];
  var runtimeEvents = this._drainRuntimeEvents();
  var bounceEvents = fallingStep && Array.isArray(fallingStep.bounceEvents) ? fallingStep.bounceEvents : [];
  bounceEvents.forEach(function (bounceEvent) {
    if (!bounceEvent || !Number.isInteger(bounceEvent.bounceCount) || bounceEvent.bounceCount < 1) {
      throw new Error("FallingMarbleSystem bounce event requires positive integer bounceCount.");
    }
    var glowStacks = requireDropGlowStacks(bounceEvent.glowStacks, "FallingMarbleSystem bounce event");
    this._pushRuntimeEvent("jar_rim_bounce", {
      bounceCount: bounceEvent.bounceCount,
      glowStacks: glowStacks
    });
  }, this);
  fairyHits.forEach(function (hit) {
    this._pushRuntimeEvent("fairy_assist_hit", hit);
  }, this);
  fairySplits.forEach(function (split) {
    this._pushRuntimeEvent("fairy_assist_split", split);
  }, this);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  if (collectedDrops.length) {
    this._pushRuntimeEvent("jar_collect_bottom", {
      count: collectedDrops.length,
      glowStacks: resolveCollectedDropAudioGlowStacks(collectedDrops)
    });
    this._registerIceSnowballCollection(collectedDrops);
    this._injectCollectedSkillBalls(collectedDrops);
    this.systems.jarCollectorSystem.collect(collectedDrops);
    this._applyJarCollectionScore(collectedDrops);

    if (this.lastResolution && Array.isArray(this.lastResolution.collected)) {
      this.lastResolution.collected = this.lastResolution.collected.concat(collectedDrops.map(function (drop) {
        return {
          id: drop.id,
          color: drop.color,
          entityCategory: drop.entityCategory || "normal_ball",
          entityType: drop.entityType || null,
          splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
          innerColor: drop.innerColor || null,
          row: drop.row,
          col: drop.col,
          jarIndex: drop.jarIndex,
          jarColor: drop.jarColor,
          sameColor: !!drop.sameColor,
          bonusMultiplier: typeof drop.bonusMultiplier === "number" ? drop.bonusMultiplier : 1,
          fairyBonusSteps: drop.fairyBonusSteps,
          fairyMultiplier: drop.fairyMultiplier,
          finalMultiplier: drop.finalMultiplier,
          glowStacks: drop.glowStacks,
          rootDropId: drop.rootDropId,
          splitGeneration: drop.splitGeneration,
          hitFairyIds: drop.hitFairyIds.slice()
        };
      }));
    }
  }
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var scoreBoostChanged = this._updateJarScoreBoost(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  var boardAdvancedThisFrame = viewportFinished || this._updatePendingBoardAdvance(dt) || this._hasBoardAdvancedThisFrame();
  var splitterSpawned = boardAdvancedThisFrame ? false : this._updatePendingSplitterSpawns(dt);
  var molotovBlastUpdated = boardAdvancedThisFrame ? false : this._updatePendingMolotovBlasts(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var hasProjectile = !!this.activeProjectile;
  var hasFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();
  var hasPendingSplitterSpawns = this._hasPendingSplitterSpawns();
  var hasPendingMolotovBlasts = this._hasPendingMolotovBlasts();

  if (
    this.state === "won_surplus_shots_pending" &&
    !this.surplusShotAimRecentered &&
    !this.systems.fallingMarbleSystem.hasPendingSurplusShots()
  ) {
    this.surplusShotAimRecentered = true;
    this.surplusShotAimRecenterRevision += 1;
  }

  if (
    splitterSpawned &&
    this.state === "running" &&
    !this.isTimedInfiniteShots &&
    this.remainingShots <= 0 &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !this._isBoardAdvanceBusy()
  ) {
    this._showOutOfShotsAddBallPrompt();
  }

  if (
    molotovBlastUpdated &&
    this.state === "running" &&
    !this.isTimedInfiniteShots &&
    this.remainingShots <= 0 &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !this._isBoardAdvanceBusy()
  ) {
    this._showOutOfShotsAddBallPrompt();
  }

  if (boardAdvancedThisFrame && (this.state === "running" || this.state === "out_of_shots_pending")) {
    if (this.state === "running" && !this.isTimedInfiniteShots && this.remainingShots <= 0) {
      if (hasFallingDrops) {
        this.state = "out_of_shots_pending";
      } else {
        this._showOutOfShotsAddBallPrompt();
      }
    }
  }

  if (this.state === "won_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts) {
    this._resolveBoardClearedOutcome();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    this.state === "won_surplus_shots_pending" &&
    !hasProjectile &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !this.systems.fallingMarbleSystem.hasPendingSurplusShots()
  ) {
    if (typeof this._pushRuntimeEvent === "function") {
      this._pushRuntimeEvent("surplus_shots_finished", {});
    }
    this._scheduleWinSettlement();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "won_settlement_pending") {
    this._updatePendingWinSettlement(dt);
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "out_of_shots_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts && !this._isBoardAdvanceBusy()) {
    this._showOutOfShotsAddBallPrompt();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    !hasProjectile &&
    !hasFallingDrops &&
    !hadProjectile &&
    !hadFallingDrops &&
    !collectedDrops.length &&
    !scoreBoostChanged &&
    !splitterSpawned &&
    !molotovBlastUpdated &&
    !surplusUpdated &&
    !viewportUpdated &&
    !boardAdvancedThisFrame &&
    !runtimeEvents.length &&
    !timerChanged
  ) {
    return null;
  }

  if (
    hasProjectile ||
    hasFallingDrops ||
    fallingUpdated ||
    hadProjectile ||
    hadFallingDrops ||
    collectedDrops.length ||
    scoreBoostChanged ||
    splitterSpawned ||
    molotovBlastUpdated ||
    surplusUpdated ||
    viewportUpdated ||
    boardAdvancedThisFrame ||
    runtimeEvents.length ||
    timerChanged
  ) {
    var refreshScope = "full";
    if (
      hasProjectile &&
      !hasFallingDrops &&
      !fallingUpdated &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0 &&
      !timerChanged
    ) {
      refreshScope = "projectile";
    } else if (
      timerChanged &&
      !hasProjectile &&
      !hasFallingDrops &&
      !fallingUpdated &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0
    ) {
      refreshScope = "timer";
    } else if (
      (hasFallingDrops || fallingUpdated) &&
      !hasProjectile &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0 &&
      !timerChanged
    ) {
      refreshScope = "falling";
    }

    return this.getRuntimeSnapshot(runtimeEvents, { refreshScope: refreshScope });
  }

  return null;
};
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
  isRainbowBall: isRainbowBall,
  isMolotovBall: isMolotovBall,
  isSplitterBall: isSplitterBall,
  isLockedBall: isLockedBall,
  isKeyBall: isKeyBall,
  resolveIceInnerColor: resolveIceInnerColor,
  createEmptyResolution: createEmptyResolution,
  COMBO_BONUS_PER_HIT: COMBO_BONUS_PER_HIT,
  findPrimaryCollectionObjective: findPrimaryCollectionObjective,
  listCollectionRewardObjectives: listCollectionRewardObjectives
}));

GameManager.prototype.debugDropBottomRow = function () {
  if (this.state !== "running" || this.activeProjectile) {
    return this.getRuntimeSnapshot();
  }

  var grid = this.systems.bubbleGrid;
  var cells = grid.getCells();
  if (!cells.length) {
    return this.getRuntimeSnapshot();
  }

  var bottomRow = cells.reduce(function (maxRow, cell) {
    return Math.max(maxRow, cell.row);
  }, 0);
  var bottomCells = cells.filter(function (cell) {
    return cell.row === bottomRow;
  });

  if (!bottomCells.length) {
    return this.getRuntimeSnapshot();
  }

  var removedBottom = grid.removeCells(bottomCells);
  if (!removedBottom.length) {
    return this.getRuntimeSnapshot();
  }

  var resolution = createEmptyResolution();
  resolution.collected = removedBottom;
  if (removedBottom.length) {
    resolution.impact = this._createImpactEventFromCell(removedBottom[0]);
  }
  this._collectRemovedKeysAndResolveUnlocks(removedBottom, grid, resolution);

  this._registerResolutionDrops(removedBottom, grid, resolution);
  this.systems.jarCollectorSystem.collect([]);

  resolution.boardCleared = grid.getCells().length === 0;
  this.lastResolution = resolution;
  this._ensureMinimumVisibleBoardRows(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  Logger.info("Debug bottom-row drop", {
    row: bottomRow,
    removed: removedBottom.length,
    falling: removedBottom.length,
    injectedSkills: resolution.injectedSkills.length
  });

  return this.getRuntimeSnapshot();
};

GameManager.prototype._rebuildCachedAdRunPowerupAllowed = function () {
  var adRules = this._getAdPowerupRules();
  var allowed = {};
  if (adRules && Array.isArray(adRules.allowed)) {
    adRules.allowed.forEach(function (powerupType) {
      allowed[powerupType] = true;
    });
  }
  this._cachedAdRunPowerupAllowed = allowed;
};

GameManager.prototype._getCachedAimGuidePath = function (origin, direction, maxBounces, topAttachY) {
  var safeOrigin = origin ? origin : BoardLayout.shooterOrigin;
  var safeDirection = direction ? direction : { x: 0, y: 1 };
  var cacheKey = [
    topAttachY,
    maxBounces,
    quantize(safeOrigin.x, 0.1).toFixed(1),
    quantize(safeOrigin.y, 0.1).toFixed(1),
    quantize(safeDirection.x, 0.001).toFixed(3),
    quantize(safeDirection.y, 0.001).toFixed(3)
  ].join("|");
  if (this._aimGuidePathCacheKey !== cacheKey) {
    this._aimGuidePathCacheKey = cacheKey;
    this._aimGuidePathCache = buildAimGuidePath(safeOrigin, safeDirection, maxBounces, topAttachY);
  }
  return this._aimGuidePathCache;
};

GameManager.prototype.getTurnsUntilDrop = function () {
  return null;
};

GameManager.prototype.getRuntimeSnapshot = function (runtimeEvents, renderOptions) {
  renderOptions = renderOptions || {};
  if (
    Object.prototype.hasOwnProperty.call(renderOptions, "refreshScope") &&
    typeof renderOptions.refreshScope !== "string"
  ) {
    throw new Error("getRuntimeSnapshot renderOptions.refreshScope must be string.");
  }
  var fallingSystem = this.systems.fallingMarbleSystem;
  var fairyAssistSystem = this.systems.fairyAssistSystem;
  var systemSnapshots = {
    fairyAssistSystem: fairyAssistSystem.snapshotForRender(),
    // Renderer currently relies on falling snapshot (active drops + jar zones).
    fallingMarbleSystem: typeof fallingSystem.snapshotForRender === "function"
      ? fallingSystem.snapshotForRender()
      : fallingSystem.snapshot()
  };
  var jarsSnapshot = this._getCachedJarSnapshot();
  var objectiveSnapshot = this._buildPrimaryObjectiveSnapshot(jarsSnapshot);
  if (!this._cachedAdRunPowerupAllowed) {
    this._rebuildCachedAdRunPowerupAllowed();
  }
  var adRunPowerupAllowed = this._cachedAdRunPowerupAllowed;

  var shooterController = this.systems.shooterController;
  var shooterSnapshot = shooterController.getShooterStateForRender();
  shooterSnapshot.ricochetGuideActive = this.ricochetGuideActive === true;
  var topAttachY = this.systems.bubbleGrid && typeof this.systems.bubbleGrid.getTopAttachY === "function"
    ? this.systems.bubbleGrid.getTopAttachY()
    : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  shooterSnapshot.aimGuidePath = this._getCachedAimGuidePath(
    shooterSnapshot.aim ? shooterSnapshot.aim.origin : BoardLayout.shooterOrigin,
    shooterSnapshot.aim ? shooterSnapshot.aim.direction : { x: 0, y: 1 },
    shooterSnapshot.ricochetGuideActive ? (this.systems.trajectoryPredictor ? this.systems.trajectoryPredictor.maxBounces : 0) : 0,
    topAttachY
  );
  shooterSnapshot.isAiming = this.isAiming;
  shooterSnapshot.infiniteShots = !!this.isTimedInfiniteShots;
  shooterSnapshot.pendingBarrierHammer = this.state === "running" && this.pendingBarrierHammer;
  shooterSnapshot.pendingRainbowColorSelection = this.state === "running" && this.pendingRainbowColorSelection
    ? this.pendingRainbowColorSelection
    : null;
  shooterSnapshot.canUsePowerups = !!(
    this.state === "running" &&
    !this.activeProjectile &&
    !this._isBoardAdvanceBusy() &&
    !this.pendingRainbowColorSelection
  );
  shooterSnapshot.trajectory = this.isAiming && this.pendingShotPlan && !this.activeProjectile && !this.pendingRainbowColorSelection
    ? this.pendingShotPlan
    : null;

  shooterSnapshot.surplusShotAimRecenterRevision = this.surplusShotAimRecenterRevision;
  if (this.state === "won_surplus_shots_pending") {
    var fallingMarbleSystem = this.systems.fallingMarbleSystem;
    if (!fallingMarbleSystem || typeof fallingMarbleSystem.getSurplusTurretAimDirection !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.getSurplusTurretAimDirection.");
    }
    if (typeof fallingMarbleSystem.isSurplusVolleyActive !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.isSurplusVolleyActive.");
    }
    if (typeof fallingMarbleSystem.getPendingSurplusShotCount !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.getPendingSurplusShotCount.");
    }
    var surplusAimOrigin = shooterSnapshot.aim && shooterSnapshot.aim.origin
      ? shooterSnapshot.aim.origin
      : BoardLayout.shooterOrigin;
    var surplusAimDirection = fallingMarbleSystem.getSurplusTurretAimDirection();
    shooterSnapshot.surplusRemainingShots = fallingMarbleSystem.getPendingSurplusShotCount();
    if (fallingMarbleSystem.isSurplusVolleyActive()) {
      shooterSnapshot.aim = {
        origin: surplusAimOrigin,
        direction: surplusAimDirection
      };
    } else if (this.surplusShotAimRecentered) {
      shooterSnapshot.surplusShotAimRecenterDirection = surplusAimDirection;
    }
    shooterSnapshot.trajectory = null;
    shooterSnapshot.aimGuidePath = [];
  }

  return {
    state: this.state,
    surplusShotsSettling: this.state === "won_surplus_shots_pending",
    levelCode: this.currentLevel ? this.currentLevel.level.code : null,
    remainingShots: this.remainingShots,
    infiniteShots: !!this.isTimedInfiniteShots,
    timedLevel: !!this.isTimedInfiniteShots,
    timeLimitMs: Math.max(0, Math.floor(assertFiniteNumber(this.timeLimitMs, "runtime timeLimitMs"))),
    remainingTimeMs: Math.max(0, Math.ceil(assertFiniteNumber(this.remainingTimeMs, "runtime remainingTimeMs"))),
    timerPaused: !!this.timerPaused,
    requiredStarCount: Math.max(0, Math.floor(assertFiniteNumber(this.requiredStarCount, "runtime requiredStarCount"))),
    score: this.score,
    shotsFired: this.shotsFired,
    jarScoreBoostActive: this.jarScoreBoostActive,
    jarScoreBoostMultiplier: this.jarScoreBoostMultiplier,
    jarScoreBoostRemainingMs: Math.max(0, Math.floor(Number(this.jarScoreBoostRemainingMs) || 0)),
    dropInterval: 0,
    boardViewport: this.systems.boardViewportSystem.snapshot(),
    inputLocked: this._isBoardAdvanceBusy() || this.state !== "running",
    turnsUntilDrop: this.getTurnsUntilDrop(),
    lastFiredColor: this.lastFiredColor,
    // Keep runtime snapshot light during flight to avoid per-frame deep-clone spikes.
    lastResolution: this.lastResolution,
    activeProjectile: buildRuntimeProjectileSnapshot(this.activeProjectile),
    board: this._getCachedBoardSnapshot(),
    shooter: shooterSnapshot,
    jars: jarsSnapshot,
    objectives: objectiveSnapshot,
    adRunPowerups: this.adRunPowerupInventory,
    adRunPowerupAllowed: adRunPowerupAllowed,
    winStats: {
      totalScore: this.score,
      // 结算进度与顶部 HUD 保持同口径，避免显示不一致。
      sameColorProgress: objectiveSnapshot ? (objectiveSnapshot.progress || 0) : 0,
      sameColorTarget: objectiveSnapshot ? (objectiveSnapshot.target || 0) : 0,
      sameColorBonusScore: this.sameColorJarBonusScore,
      starRating: calculateStarRating(this.score, this.scoreHeatBand),
      starProgress: calculateStarProgress(this.score, this.scoreHeatBand),
      starThresholds: normalizeStarThresholds(this.scoreHeatBand),
      collectionRewardCompleted: this._areCollectionRewardObjectivesCompleted(),
      scoreHeatBand: this.scoreHeatBand,
      scoreDifficulty: this.scoreHeatBand ? this.scoreHeatBand.difficulty : "normal",
      maxComboStreak: this.maxComboStreak
    },
    runtimeEvents: Array.isArray(runtimeEvents) ? runtimeEvents.slice() : [],
    systems: systemSnapshots,
    refreshScope: renderOptions.refreshScope || "full"
  };
};

GameManager.prototype._registerPools = function () {
  if (!this.poolManager) {
    return;
  }

  this.poolManager.register("bubble");
  this.poolManager.register("fallingMarble");
  this.poolManager.register("fx");
};

module.exports = GameManager;












