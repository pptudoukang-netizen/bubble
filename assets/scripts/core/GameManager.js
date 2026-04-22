"use strict";

var Logger = require("../utils/Logger");
var BoardLayout = require("../config/BoardLayout");
var ShooterController = require("../systems/ShooterController");
var TrajectoryPredictor = require("../systems/TrajectoryPredictor");
var BubbleGrid = require("../systems/BubbleGrid");
var MatchSystem = require("../systems/MatchSystem");
var SupportSystem = require("../systems/SupportSystem");
var FallingMarbleSystem = require("../systems/FallingMarbleSystem");
var JarCollectorSystem = require("../systems/JarCollectorSystem");
var ProjectileMath = require("./ProjectileMath");
var createGameManagerShotResolutionMethods = require("./GameManagerShotResolutionMethods");

var clone = ProjectileMath.clone;
var distance = ProjectileMath.distance;
var lerpPoint = ProjectileMath.lerpPoint;
var quantize = ProjectileMath.quantize;
var buildProjectilePathFromShotPlan = ProjectileMath.buildProjectilePathFromShotPlan;
var measurePathDistance = ProjectileMath.measurePathDistance;
var buildAimGuidePath = ProjectileMath.buildAimGuidePath;

function createEmptyResolution() {
  return {
    attachedCell: null,
    matched: [],
    floating: [],
    collected: [],
    thawed: [],
    iceCollected: 0,
    injectedSkills: [],
    impact: null,
    scoreDelta: 0,
    boardCleared: false,
    boardDropped: false,
    dangerReached: false
  };
}

var RAINBOW_TIE_BREAK_ORDER = {
  R: 5,
  G: 4,
  B: 3,
  Y: 2,
  P: 1
};

// 玩法改为“匹配即掉落”后，分数更多来自掉落结算，避免总分膨胀。
var BASE_SCORE_RULES = {
  shotBase: 120,
  attachBase: 30,
  blastBase: 30,
  matchedDrop: 90,
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

// 碰撞反馈播放完成后再下压，避免命中反馈与网格位移同帧造成视觉偏差。
var BOARD_ADVANCE_AFTER_IMPACT_DELAY = 0.2;

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

function isBlastBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "blast");
}

function isRainbowBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "rainbow");
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
      if (objective && (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice")) {
        return objective;
      }
    }
  }

  return null;
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
  var min = Math.max(1, Math.round(targetScore / 3));
  var target = Math.max(min, Math.round(targetScore * 2 / 3));
  var max = Math.max(target, targetScore);

  return {
    min: min,
    target: target,
    max: max,
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
  this.cachedBoardVersion = -1;
  this.cachedBoardSnapshot = null;
  this.cachedJarSnapshotKey = "";
  this.cachedJarSnapshot = null;
  this.sameColorJarCollected = 0;
  this.sameColorJarBonusScore = 0;
  this.iceCollectedTotal = 0;
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
  this.pendingBoardAdvanceDelay = 0;
  this.scoreRules = cloneScoreRules(BASE_SCORE_RULES);
  this.scoreHeatBand = buildScoreHeatBand(null, {
    difficulty: "normal",
    multiplier: 1,
    rules: this.scoreRules
  });
  this.systems = {
    shooterController: new ShooterController(),
    trajectoryPredictor: new TrajectoryPredictor(),
    bubbleGrid: new BubbleGrid(),
    matchSystem: new MatchSystem(),
    supportSystem: new SupportSystem(),
    fallingMarbleSystem: new FallingMarbleSystem(),
    jarCollectorSystem: new JarCollectorSystem()
  };
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
  this.remainingShots = Math.max(0, Math.floor(Number(levelConfig.level.shotLimit) || 0));
  this.score = 0;
  this.shotsFired = 0;
  this.dropInterval = Math.max(0, Math.floor(Number(levelConfig.level.dropInterval) || 0));
  this.lastFiredColor = null;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = null;
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;
  this.trajectoryCacheKey = null;
  this.trajectoryCachePlan = null;
  this.cachedBoardVersion = -1;
  this.cachedBoardSnapshot = null;
  this.cachedJarSnapshotKey = "";
  this.cachedJarSnapshot = null;
  this.sameColorJarCollected = 0;
  this.sameColorJarBonusScore = 0;
  this.iceCollectedTotal = 0;
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
  this.pendingBoardAdvanceDelay = 0;
  var scoreProfile = buildScoreRulesForLevel(levelConfig);
  this.scoreRules = scoreProfile.rules;
  this.scoreHeatBand = buildScoreHeatBand(levelConfig, scoreProfile);

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].configureLevel(levelConfig);
  }, this);

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
    pushDistance: 12
  };
};

GameManager.prototype._getScoreRule = function (key) {
  if (this.scoreRules && typeof this.scoreRules[key] === "number") {
    return this.scoreRules[key];
  }
  return BASE_SCORE_RULES[key] || 0;
};

GameManager.prototype._isWaitingBoardAdvance = function () {
  return this.pendingBoardAdvanceDelay > 0;
};

GameManager.prototype._scheduleBoardAdvanceAfterImpact = function () {
  if (!this.dropInterval || this.shotsFired % this.dropInterval !== 0) {
    return false;
  }

  this.pendingBoardAdvanceDelay = BOARD_ADVANCE_AFTER_IMPACT_DELAY;
  return true;
};

GameManager.prototype._updatePendingBoardAdvance = function (dt) {
  if (!this._isWaitingBoardAdvance()) {
    return false;
  }

  var safeDt = Math.max(0, Number(dt) || 0);
  this.pendingBoardAdvanceDelay = Math.max(0, this.pendingBoardAdvanceDelay - safeDt);
  if (this.pendingBoardAdvanceDelay > 0) {
    return false;
  }

  this._advanceBoardIfNeeded();
  return true;
};

GameManager.prototype._resolveOutOfShotsOutcome = function () {
  var grid = this.systems.bubbleGrid;
  if (grid && grid.hasReachedDangerLine()) {
    if (this.lastResolution) {
      this.lastResolution.dangerReached = true;
    }
    this.state = "lost_danger";
    return;
  }

  this.state = "out_of_shots";
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
  if (!this.cachedBoardSnapshot || this.cachedBoardVersion !== grid.version) {
    this.cachedBoardSnapshot = grid.snapshot();
    this.cachedBoardVersion = grid.version;
  }
  return this.cachedBoardSnapshot;
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

GameManager.prototype._registerIceCollection = function (thawedCells) {
  if (!Array.isArray(thawedCells) || !thawedCells.length) {
    return 0;
  }

  var gained = thawedCells.length;
  this.iceCollectedTotal += gained;
  return gained;
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

  if (objective.type === "collect_ice") {
    return Math.max(0, Number(this.iceCollectedTotal) || 0);
  }

  return 0;
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
  } else if (objective.type === "collect_ice") {
    iconCode = "ICE";
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

GameManager.prototype.setAim = function (point, options) {
  if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance()) {
    return this.getRuntimeSnapshot();
  }

  options = options || {};
  this.systems.shooterController.setAimFromPoint(point);
  if (!options.skipPlanRefresh) {
    this._refreshShotPlan(false);
  }
  return this.getRuntimeSnapshot();
};

GameManager.prototype.beginAim = function (point) {
  if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance()) {
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
  if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance()) {
    return this.getRuntimeSnapshot();
  }

  if (this.remainingShots <= 0) {
    this.state = "out_of_shots";
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

  var queueResult = this.systems.shooterController.advanceQueue();

  this.remainingShots -= 1;
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

GameManager.prototype.useSkillBall = function (entityType) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isWaitingBoardAdvance()) {
    return {
      accepted: false,
      reason: "busy",
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

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    entityType: entityType,
    remaining: equipResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.update = function (dt) {
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

  var fallingStep = this.systems.fallingMarbleSystem.update(dt);
  var fallingUpdated = !!(fallingStep && fallingStep.updated);
  var collectedDrops = fallingStep && Array.isArray(fallingStep.collected) ? fallingStep.collected : [];
  var runtimeEvents = this._drainRuntimeEvents();
  var bounceCount = fallingStep ? Math.max(0, Math.floor(Number(fallingStep.bounced) || 0)) : 0;

  for (var bounceIndex = 0; bounceIndex < bounceCount; bounceIndex += 1) {
    this._pushRuntimeEvent("jar_rim_bounce");
  }
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  if (collectedDrops.length) {
    this._pushRuntimeEvent("jar_collect_bottom", {
      count: collectedDrops.length
    });
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
          innerColor: drop.innerColor || null,
          row: drop.row,
          col: drop.col,
          jarIndex: drop.jarIndex,
          jarColor: drop.jarColor,
          sameColor: !!drop.sameColor,
          bonusMultiplier: typeof drop.bonusMultiplier === "number" ? drop.bonusMultiplier : 1
        };
      }));
    }
  }
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  var boardAdvancedThisFrame = this._updatePendingBoardAdvance(dt);
  var hasProjectile = !!this.activeProjectile;
  var hasFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();

  if (boardAdvancedThisFrame && (this.state === "running" || this.state === "out_of_shots_pending")) {
    var grid = this.systems.bubbleGrid;
    if (grid.hasReachedDangerLine()) {
      if (this.lastResolution) {
        this.lastResolution.dangerReached = true;
      }
      this.state = "lost_danger";
    } else if (this.state === "running" && this.remainingShots <= 0) {
      this.state = hasFallingDrops ? "out_of_shots_pending" : "out_of_shots";
    }
  }

  if (this.state === "won_pending" && !hasProjectile && !hasFallingDrops) {
    this._resolveBoardClearedOutcome();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "out_of_shots_pending" && !hasProjectile && !hasFallingDrops && !this._isWaitingBoardAdvance()) {
    this._resolveOutOfShotsOutcome();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    !hasProjectile &&
    !hasFallingDrops &&
    !hadProjectile &&
    !hadFallingDrops &&
    !collectedDrops.length &&
    !boardAdvancedThisFrame &&
    !runtimeEvents.length
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
    boardAdvancedThisFrame ||
    runtimeEvents.length
  ) {
    return this.getRuntimeSnapshot(runtimeEvents);
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
  resolveIceInnerColor: resolveIceInnerColor,
  createEmptyResolution: createEmptyResolution,
  findPrimaryCollectionObjective: findPrimaryCollectionObjective
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

  var fallingCandidates = removedBottom;
  this.systems.fallingMarbleSystem.registerDrops(fallingCandidates, grid);
  this.systems.jarCollectorSystem.collect([]);

  resolution.boardCleared = grid.getCells().length === 0;
  this.lastResolution = resolution;
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  Logger.info("Debug bottom-row drop", {
    row: bottomRow,
    removed: removedBottom.length,
    falling: fallingCandidates.length,
    injectedSkills: resolution.injectedSkills.length
  });

  return this.getRuntimeSnapshot();
};

GameManager.prototype.getTurnsUntilDrop = function () {
  return null;
};

GameManager.prototype.getRuntimeSnapshot = function (runtimeEvents) {
  var fallingSystem = this.systems.fallingMarbleSystem;
  var systemSnapshots = {
    // Renderer currently relies on falling snapshot (active drops + jar zones).
    fallingMarbleSystem: typeof fallingSystem.snapshotForRender === "function"
      ? fallingSystem.snapshotForRender()
      : fallingSystem.snapshot()
  };
  var jarsSnapshot = this._getCachedJarSnapshot();
  var objectiveSnapshot = this._buildPrimaryObjectiveSnapshot(jarsSnapshot);

  var shooterSnapshot = this.systems.shooterController.getShooterState();
  var topAttachY = this.systems.bubbleGrid && typeof this.systems.bubbleGrid.getTopAttachY === "function"
    ? this.systems.bubbleGrid.getTopAttachY()
    : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  shooterSnapshot.aimGuidePath = buildAimGuidePath(
    shooterSnapshot.aim ? shooterSnapshot.aim.origin : BoardLayout.shooterOrigin,
    shooterSnapshot.aim ? shooterSnapshot.aim.direction : { x: 0, y: 1 },
    this.systems.trajectoryPredictor ? this.systems.trajectoryPredictor.maxBounces : 0,
    topAttachY
  );
  shooterSnapshot.isAiming = this.isAiming;
  shooterSnapshot.trajectory = this.isAiming && this.pendingShotPlan && !this.activeProjectile ? clone(this.pendingShotPlan) : null;

  return {
    state: this.state,
    levelCode: this.currentLevel ? this.currentLevel.level.code : null,
    remainingShots: this.remainingShots,
    score: this.score,
    shotsFired: this.shotsFired,
    dropInterval: this.dropInterval,
    turnsUntilDrop: this.getTurnsUntilDrop(),
    lastFiredColor: this.lastFiredColor,
    // Keep runtime snapshot light during flight to avoid per-frame deep-clone spikes.
    lastResolution: this.lastResolution,
    activeProjectile: buildRuntimeProjectileSnapshot(this.activeProjectile),
    board: this._getCachedBoardSnapshot(),
    shooter: shooterSnapshot,
    jars: jarsSnapshot,
    objectives: objectiveSnapshot,
    winStats: {
      totalScore: this.score,
      // 结算进度与顶部 HUD 保持同口径，避免显示不一致。
      sameColorProgress: objectiveSnapshot ? (objectiveSnapshot.progress || 0) : 0,
      sameColorTarget: objectiveSnapshot ? (objectiveSnapshot.target || 0) : 0,
      sameColorBonusScore: this.sameColorJarBonusScore,
      starRating: calculateStarRating(this.score, this.scoreHeatBand),
      starProgress: calculateStarProgress(this.score, this.scoreHeatBand),
      starThresholds: normalizeStarThresholds(this.scoreHeatBand),
      scoreHeatBand: clone(this.scoreHeatBand),
      scoreDifficulty: this.scoreHeatBand ? this.scoreHeatBand.difficulty : "normal"
    },
    runtimeEvents: Array.isArray(runtimeEvents) ? runtimeEvents.slice() : [],
    systems: systemSnapshots
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












