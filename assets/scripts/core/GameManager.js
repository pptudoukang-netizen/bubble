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

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function quantize(value, step) {
  return Math.round(value / step) * step;
}

function normalizeDirection(vector) {
  var vx = vector && typeof vector.x === "number" ? vector.x : 0;
  var vy = vector && typeof vector.y === "number" ? vector.y : 1;
  var length = Math.sqrt(vx * vx + vy * vy) || 1;
  return {
    x: vx / length,
    y: vy / length
  };
}

function createEmptyResolution() {
  return {
    attachedCell: null,
    matched: [],
    floating: [],
    collected: [],
    thawed: [],
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

function appendUniquePathPoint(pathPoints, point) {
  if (!point) {
    return;
  }

  if (!pathPoints.length || distance(pathPoints[pathPoints.length - 1], point) > 0.001) {
    pathPoints.push(clone(point));
  }
}

function resolveFirstBounceWallX(shotPlan, origin, target) {
  var direction = shotPlan && shotPlan.direction ? shotPlan.direction : null;
  if (direction && Math.abs(direction.x) > 0.0001) {
    return direction.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
  }

  return target.x >= origin.x ? BoardLayout.boardRight : BoardLayout.boardLeft;
}

function buildBounceWallSequence(firstWallX, bounceCount) {
  var sequence = [];
  if (!bounceCount || bounceCount <= 0) {
    return sequence;
  }

  var isLeftFirst = Math.abs(firstWallX - BoardLayout.boardLeft) <= Math.abs(firstWallX - BoardLayout.boardRight);
  for (var i = 0; i < bounceCount; i += 1) {
    var useLeft = isLeftFirst ? (i % 2 === 0) : (i % 2 === 1);
    sequence.push(useLeft ? BoardLayout.boardLeft : BoardLayout.boardRight);
  }

  return sequence;
}

function buildReconstructedBouncePoints(origin, target, wallSequence) {
  if (!wallSequence.length) {
    return [];
  }

  var laneWidth = Math.abs(BoardLayout.boardRight - BoardLayout.boardLeft);
  var firstWallX = wallSequence[0];
  var lastWallX = wallSequence[wallSequence.length - 1];
  var firstSpanX = Math.abs(firstWallX - origin.x);
  var middleSpanX = Math.max(0, wallSequence.length - 1) * laneWidth;
  var lastSpanX = Math.abs(target.x - lastWallX);
  var totalSpanX = firstSpanX + middleSpanX + lastSpanX;
  var deltaY = target.y - origin.y;
  var EPSILON = 0.000001;
  if (totalSpanX <= EPSILON) {
    return null;
  }

  var bouncePoints = [];
  for (var i = 0; i < wallSequence.length; i += 1) {
    var cumulativeSpanX = firstSpanX + i * laneWidth;
    var t = cumulativeSpanX / totalSpanX;
    if (t <= EPSILON || t >= 1 - EPSILON) {
      return null;
    }

    bouncePoints.push({
      x: wallSequence[i],
      y: origin.y + deltaY * t
    });
  }

  return bouncePoints;
}

function buildProjectilePathFromShotPlan(shotPlan) {
  var origin = shotPlan && shotPlan.origin ? clone(shotPlan.origin) : clone(BoardLayout.shooterOrigin);
  var target = shotPlan && shotPlan.targetCellPosition ? clone(shotPlan.targetCellPosition) : clone(origin);
  var bounceCount = shotPlan && typeof shotPlan.wallBounceCount === "number"
    ? Math.max(0, Math.floor(shotPlan.wallBounceCount))
    : 0;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, origin);
  if (bounceCount > 0) {
    var firstWallX = resolveFirstBounceWallX(shotPlan, origin, target);
    var wallSequence = buildBounceWallSequence(firstWallX, bounceCount);
    var bouncePoints = buildReconstructedBouncePoints(origin, target, wallSequence);
    if (bouncePoints && bouncePoints.length) {
      bouncePoints.forEach(function (point) {
        appendUniquePathPoint(pathPoints, point);
      });
    }
  }

  appendUniquePathPoint(pathPoints, target);

  if (pathPoints.length < 2) {
    pathPoints.push(clone(target));
  }

  return pathPoints;
}


function measurePathDistance(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return 0;
  }

  var total = 0;
  for (var i = 1; i < pathPoints.length; i += 1) {
    total += distance(pathPoints[i - 1], pathPoints[i]);
  }

  return total;
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

function buildAimGuidePath(origin, direction, maxBounces, topY) {
  var start = origin ? clone(origin) : clone(BoardLayout.shooterOrigin);
  var rayDirection = normalizeDirection(direction || { x: 0, y: 1 });
  var maxBounceCount = Math.max(0, Math.floor(Number(maxBounces) || 0));
  var topBoundaryY = typeof topY === "number" ? topY : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  var EPSILON = 0.000001;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, start);

  var currentPoint = clone(start);
  var currentDirection = clone(rayDirection);
  var remainingBounces = maxBounceCount;

  for (var guard = 0; guard < maxBounceCount + 3; guard += 1) {
    var distanceToTop = Number.POSITIVE_INFINITY;
    if (currentDirection.y > EPSILON) {
      var projectedTopDistance = (topBoundaryY - currentPoint.y) / currentDirection.y;
      if (projectedTopDistance > EPSILON) {
        distanceToTop = projectedTopDistance;
      }
    }

    var distanceToWall = Number.POSITIVE_INFINITY;
    if (Math.abs(currentDirection.x) > EPSILON) {
      var boundaryX = currentDirection.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
      var projectedWallDistance = (boundaryX - currentPoint.x) / currentDirection.x;
      if (projectedWallDistance > EPSILON) {
        distanceToWall = projectedWallDistance;
      }
    }

    var hitWall = isFinite(distanceToWall) &&
      distanceToWall < distanceToTop - EPSILON &&
      remainingBounces > 0;
    var travelDistance = hitWall ? distanceToWall : distanceToTop;

    if (!isFinite(travelDistance) || travelDistance <= EPSILON) {
      break;
    }

    currentPoint = {
      x: currentPoint.x + currentDirection.x * travelDistance,
      y: currentPoint.y + currentDirection.y * travelDistance
    };
    appendUniquePathPoint(pathPoints, currentPoint);

    if (!hitWall) {
      break;
    }

    currentDirection.x = -currentDirection.x;
    remainingBounces -= 1;
    currentPoint = {
      x: currentPoint.x + currentDirection.x * 0.01,
      y: currentPoint.y + currentDirection.y * 0.01
    };
  }

  if (pathPoints.length < 2) {
    appendUniquePathPoint(pathPoints, {
      x: start.x + rayDirection.x * 180,
      y: start.y + rayDirection.y * 180
    });
  }

  return pathPoints;
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
      if (objective && (objective.type === "collect_any" || objective.type === "collect_color")) {
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
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
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
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
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
  this.score += this._getScoreRule("shotBase");
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = buildActiveProjectile(queueResult.firedBall, shotPlan);
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;

  Logger.info("Shot fired", queueResult.firedColor, "remaining", this.remainingShots, "bounce", shotPlan.wallBounceCount);
  return this.getRuntimeSnapshot();
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
  var runtimeEvents = [];
  var bounceCount = fallingStep ? Math.max(0, Math.floor(Number(fallingStep.bounced) || 0)) : 0;

  for (var bounceIndex = 0; bounceIndex < bounceCount; bounceIndex += 1) {
    this.runtimeEventSequence += 1;
    runtimeEvents.push({
      id: this.runtimeEventSequence,
      type: "jar_rim_bounce"
    });
  }

  if (collectedDrops.length) {
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

  if (!hasProjectile && !hasFallingDrops && !hadProjectile && !hadFallingDrops && !collectedDrops.length && !boardAdvancedThisFrame) {
    return null;
  }

  if (hasProjectile || hasFallingDrops || fallingUpdated || hadProjectile || hadFallingDrops || collectedDrops.length || boardAdvancedThisFrame) {
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  return null;
};
GameManager.prototype._applyJarCollectionScore = function (collectedDrops) {
  if (!collectedDrops || !collectedDrops.length) {
    return 0;
  }

  var jarColors = this.systems.jarCollectorSystem && Array.isArray(this.systems.jarCollectorSystem.jarColors)
    ? this.systems.jarCollectorSystem.jarColors
    : [];
  var scoredDrops = collectedDrops.filter(function (drop) {
    return !!(drop && typeof drop.color === "string" && jarColors.indexOf(drop.color) !== -1);
  });

  if (!scoredDrops.length) {
    return 0;
  }

  var jarCollectBase = this._getScoreRule("jarCollectBase");
  var gained = scoredDrops.reduce(function (sum, drop) {
    var base = jarCollectBase;
    var multiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
    return sum + Math.round(base * multiplier);
  }, 0);
  var sameColorCount = scoredDrops.reduce(function (count, drop) {
    return count + (drop.sameColor ? 1 : 0);
  }, 0);
  var bonusGained = scoredDrops.reduce(function (sum, drop) {
    var base = jarCollectBase;
    var multiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
    var total = Math.round(base * multiplier);
    return sum + Math.max(0, total - base);
  }, 0);

  this.score += gained;
  this.sameColorJarCollected += sameColorCount;
  this.sameColorJarBonusScore += bonusGained;

  if (this.lastResolution) {
    this.lastResolution.scoreDelta += gained;
  }

  Logger.info("Jar collect", {
    count: scoredDrops.length,
    gained: gained,
    sameColorCount: sameColorCount,
    bonusGained: bonusGained
  });

  return gained;
};
GameManager.prototype._refreshShotPlan = function (force) {
  if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance()) {
    this.pendingShotPlan = null;
    return;
  }

  if (!force && !this.isAiming) {
    this.pendingShotPlan = null;
    return;
  }

  var shooterSnapshot = this.systems.shooterController.getShooterState();
  var cacheKey = this._buildShotPlanCacheKey(shooterSnapshot);

  if (this.trajectoryCacheKey === cacheKey && this.trajectoryCachePlan) {
    this.pendingShotPlan = clone(this.trajectoryCachePlan);
    return;
  }

  var planned = this.systems.trajectoryPredictor.predictShotPlan(
    this.systems.bubbleGrid,
    shooterSnapshot.aim.origin,
    shooterSnapshot.aim.direction
  );

  if (planned && planned.valid) {
    if (planned.collidedCell) {
      planned.collidedCellPosition = this.systems.bubbleGrid.getCellPosition(
        planned.collidedCell.row,
        planned.collidedCell.col
      );
    }
    planned.pathPoints = buildProjectilePathFromShotPlan(planned);
    planned.totalDistance = measurePathDistance(planned.pathPoints);
  }

  this.pendingShotPlan = planned || null;
  this.trajectoryCacheKey = cacheKey;
  this.trajectoryCachePlan = planned ? clone(planned) : null;
};

GameManager.prototype._buildShotPlanCacheKey = function (shooterSnapshot) {
  var aim = shooterSnapshot && shooterSnapshot.aim ? shooterSnapshot.aim : { origin: { x: 0, y: 0 }, direction: { x: 0, y: 1 } };
  var direction = aim.direction || { x: 0, y: 1 };
  var origin = aim.origin || { x: 0, y: 0 };
  var grid = this.systems.bubbleGrid;
  var quantizedDX = quantize(direction.x, 0.001).toFixed(3);
  var quantizedDY = quantize(direction.y, 0.001).toFixed(3);
  var quantizedOX = quantize(origin.x, 0.1).toFixed(1);
  var quantizedOY = quantize(origin.y, 0.1).toFixed(1);

  return [
    grid.version,
    grid.dropOffsetRows,
    this.systems.trajectoryPredictor.maxBounces,
    quantizedOX,
    quantizedOY,
    quantizedDX,
    quantizedDY
  ].join("|");
};

GameManager.prototype._estimateColorGroupAt = function (targetCell, colorCode) {
  var grid = this.systems.bubbleGrid;
  var queue = [];
  var visited = {};
  var groupCount = 1;
  var directNeighbors = 0;

  grid.getNeighborCoordinates(targetCell.row, targetCell.col).forEach(function (neighbor) {
    var neighborCell = grid.getCell(neighbor.row, neighbor.col);
    if (!neighborCell || neighborCell.color !== colorCode) {
      return;
    }

    directNeighbors += 1;
    queue.push({
      row: neighbor.row,
      col: neighbor.col
    });
  });

  while (queue.length) {
    var current = queue.shift();
    var key = current.row + ":" + current.col;
    if (visited[key]) {
      continue;
    }

    visited[key] = true;
    var gridCell = grid.getCell(current.row, current.col);
    if (!gridCell || gridCell.color !== colorCode) {
      continue;
    }

    groupCount += 1;
    grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = neighbor.row + ":" + neighbor.col;
      if (visited[neighborKey]) {
        return;
      }

      var neighborCell = grid.getCell(neighbor.row, neighbor.col);
      if (neighborCell && neighborCell.color === colorCode) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col
        });
      }
    });
  }

  return {
    color: colorCode,
    groupSize: groupCount,
    directNeighbors: directNeighbors,
    canImmediateClear: groupCount >= 3
  };
};

GameManager.prototype._selectRainbowAttachColor = function (targetCell) {
  var availableColors = this.currentLevel && this.currentLevel.level && Array.isArray(this.currentLevel.level.colors)
    ? this.currentLevel.level.colors.slice()
    : [];
  if (!availableColors.length) {
    return "R";
  }

  var best = null;
  availableColors.forEach(function (colorCode) {
    var estimate = this._estimateColorGroupAt(targetCell, colorCode);
    var tieScore = RAINBOW_TIE_BREAK_ORDER[colorCode] || 0;
    if (!best) {
      best = {
        estimate: estimate,
        tieScore: tieScore
      };
      return;
    }

    if (estimate.canImmediateClear !== best.estimate.canImmediateClear) {
      if (estimate.canImmediateClear) {
        best = {
          estimate: estimate,
          tieScore: tieScore
        };
      }
      return;
    }

    if (estimate.groupSize > best.estimate.groupSize) {
      best = {
        estimate: estimate,
        tieScore: tieScore
      };
      return;
    }

    if (estimate.groupSize === best.estimate.groupSize) {
      if (estimate.directNeighbors > best.estimate.directNeighbors) {
        best = {
          estimate: estimate,
          tieScore: tieScore
        };
        return;
      }

      if (estimate.directNeighbors === best.estimate.directNeighbors && tieScore > best.tieScore) {
        best = {
          estimate: estimate,
          tieScore: tieScore
        };
      }
    }
  }, this);

  return best ? best.estimate.color : availableColors[0];
};

GameManager.prototype._injectCollectedSkillBalls = function (collectedDrops) {
  var skillCells = (collectedDrops || []).filter(function (cell) {
    return isSkillBall(cell) && (cell.entityType === "rainbow" || cell.entityType === "blast");
  });
  if (!skillCells.length) {
    return 0;
  }

  var resolution = this.lastResolution;
  if (!resolution || !Array.isArray(resolution.injectedSkills)) {
    return 0;
  }

  var overflowScore = this._getScoreRule("skillOverflow");
  skillCells.sort(function (a, b) {
    var leftJar = typeof a.jarIndex === "number" ? a.jarIndex : -1;
    var rightJar = typeof b.jarIndex === "number" ? b.jarIndex : -1;
    if (leftJar !== rightJar) {
      return leftJar - rightJar;
    }

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  var injectedCount = 0;
  skillCells.forEach(function (cell) {
    var receiveResult = this.systems.shooterController.receiveSkillBall(cell.entityType);
    if (receiveResult && receiveResult.accepted) {
      resolution.injectedSkills.push({
        id: cell.id,
        entityType: cell.entityType,
        status: "queued",
        jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
      });
      injectedCount += 1;
      return;
    }

    this.score += overflowScore;
    resolution.scoreDelta += overflowScore;
    resolution.injectedSkills.push({
      id: cell.id,
      entityType: cell.entityType,
      status: "overflow_to_score",
      score: overflowScore,
      jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
    });
  }, this);

  return injectedCount;
};

GameManager.prototype._findAdjacentIceCells = function (cells, grid) {
  var touched = {};
  var adjacentIce = [];

  (cells || []).forEach(function (cell) {
    if (!cell) {
      return;
    }

    grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
      var key = coord.row + ":" + coord.col;
      if (touched[key]) {
        return;
      }

      var neighbor = grid.getCell(coord.row, coord.col);
      if (!isIceBall(neighbor)) {
        return;
      }

      touched[key] = true;
      adjacentIce.push(neighbor);
    });
  });

  return adjacentIce;
};

GameManager.prototype._thawIceCells = function (cells, grid) {
  var thawed = [];
  var touched = {};

  (cells || []).forEach(function (cell) {
    if (!cell) {
      return;
    }

    var key = cell.row + ":" + cell.col;
    if (touched[key]) {
      return;
    }

    touched[key] = true;
    var currentCell = grid.getCell(cell.row, cell.col);
    if (!isIceBall(currentCell)) {
      return;
    }

    var innerColor = resolveIceInnerColor(currentCell);
    if (!innerColor) {
      return;
    }

    var thawedCell = grid.addBubble({ row: cell.row, col: cell.col }, innerColor);
    if (thawedCell) {
      thawed.push(thawedCell);
    }
  });

  return thawed;
};

GameManager.prototype._resolveBlastShot = function (projectile, targetCell) {
  var resolution = createEmptyResolution();
  resolution.scoreDelta = this._getScoreRule("blastBase");
  this.score += this._getScoreRule("blastBase");

  var grid = this.systems.bubbleGrid;
  var centerCoordinate = null;
  if (targetCell && grid.isValidCell(targetCell.row, targetCell.col)) {
    centerCoordinate = {
      row: targetCell.row,
      col: targetCell.col
    };
  } else if (projectile && projectile.shotPlan && projectile.shotPlan.collidedCell) {
    centerCoordinate = {
      row: projectile.shotPlan.collidedCell.row,
      col: projectile.shotPlan.collidedCell.col
    };
  } else if (projectile && projectile.position) {
    var fallbackCenterCell = grid.findCollision(projectile.position, BoardLayout.bubbleDiameter * 1.15);
    if (fallbackCenterCell) {
      centerCoordinate = {
        row: fallbackCenterCell.row,
        col: fallbackCenterCell.col
      };
    }
  }

  var blastCells = [];
  var iceCellsToThaw = [];
  if (centerCoordinate) {
    var affectedCoords = [{
      row: centerCoordinate.row,
      col: centerCoordinate.col
    }].concat(grid.getNeighborCoordinates(centerCoordinate.row, centerCoordinate.col));
    var touched = {};

    affectedCoords.forEach(function (coord) {
      var key = coord.row + ":" + coord.col;
      if (touched[key]) {
        return;
      }
      touched[key] = true;

      var occupiedCell = grid.getCell(coord.row, coord.col);
      if (occupiedCell) {
        if (isIceBall(occupiedCell)) {
          iceCellsToThaw.push(occupiedCell);
        } else {
          blastCells.push(occupiedCell);
        }
      }
    });
  }

  var removedBlastCells = grid.removeCells(blastCells);
  resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeCells(floatingCells);
  var removedAll = removedBlastCells.concat(removedFloating);

  // 玩法调整：炸裂清除与断层清除都进入掉落链路，不再直接消失。
  var fallingCandidates = removedAll;
  this.systems.fallingMarbleSystem.registerDrops(fallingCandidates, grid);
  this.systems.jarCollectorSystem.collect([]);

  var blastScore = removedBlastCells.length * this._getScoreRule("blastDrop") +
    removedFloating.length * this._getScoreRule("floatingDrop");
  this.score += blastScore;

  resolution.matched = removedBlastCells;
  resolution.floating = removedFloating;
  resolution.collected = removedAll;
  resolution.impact = this._createImpactEventFromCell(centerCoordinate);
  resolution.scoreDelta += blastScore;
  resolution.boardCleared = grid.getCells().length === 0;

  Logger.info("Blast resolution", {
    cleared: removedBlastCells.length,
    thawed: resolution.thawed.length,
    floating: removedFloating.length,
    injectedSkills: resolution.injectedSkills.length,
    scoreDelta: resolution.scoreDelta
  });

  return resolution;
};

GameManager.prototype._finalizePlannedShot = function () {
  if (!this.activeProjectile) {
    return;
  }

  var projectile = this.activeProjectile;
  var grid = this.systems.bubbleGrid;
  var targetCell = projectile.targetCell;

  if (!targetCell || grid.hasCell(targetCell.row, targetCell.col)) {
    var fallbackPoint = projectile.shotPlan && projectile.shotPlan.hitPoint
      ? projectile.shotPlan.hitPoint
      : projectile.position;
    var fallbackCollidedCell = projectile.shotPlan ? projectile.shotPlan.collidedCell : null;
    targetCell = grid.findAttachmentCell(
      fallbackPoint,
      fallbackCollidedCell,
      this.systems.shooterController.getAimState().direction,
      projectile.position
    );
  }

  var firedBall = projectile.ball || {
    ballCategory: "normal",
    color: projectile.color,
    entityCategory: "normal_ball",
    entityType: null
  };

  if (isBlastBall(firedBall)) {
    this.lastResolution = this._resolveBlastShot(projectile, targetCell);
  } else {
    var attachedColor = firedBall.color;
    if (isRainbowBall(firedBall)) {
      attachedColor = this._selectRainbowAttachColor(targetCell);
    }

    var attachedBubble = grid.addBubble(targetCell, attachedColor);
    this.lastResolution = this._resolveAttachment(attachedBubble);
  }

  this.activeProjectile = null;
  this.pendingProjectileFinalize = false;

  if (this.lastResolution.boardCleared) {
    this._resolveBoardClearedOutcome();
    return;
  }

  if (this._scheduleBoardAdvanceAfterImpact()) {
    this.pendingShotPlan = null;
    return;
  }

  if (grid.hasReachedDangerLine()) {
    this.lastResolution.dangerReached = true;
    this.state = "lost_danger";
    return;
  }

  if (this.remainingShots <= 0) {
    if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isWaitingBoardAdvance()) {
      this.state = "out_of_shots_pending";
    } else {
      this._resolveOutOfShotsOutcome();
    }
    return;
  }

  this.pendingShotPlan = null;
};

GameManager.prototype._resolveAttachment = function (attachedBubble) {
  var resolution = createEmptyResolution();
  resolution.attachedCell = attachedBubble;
  resolution.impact = this._createImpactEventFromCell(attachedBubble);
  resolution.scoreDelta = this._getScoreRule("attachBase");
  this.score += this._getScoreRule("attachBase");

  var grid = this.systems.bubbleGrid;
  var matchedCells = this.systems.matchSystem.findMatchGroup(grid, attachedBubble);

  if (!matchedCells.length) {
    this.systems.supportSystem.clearFloatingCells();
    this.systems.fallingMarbleSystem.registerDrops([], grid);
    this.systems.jarCollectorSystem.collect([]);
    resolution.boardCleared = grid.getCells().length === 0;
    return resolution;
  }

  var removedMatches = grid.removeCells(matchedCells);
  var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
  resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeCells(floatingCells);
  var collectedCells = removedMatches.concat(removedFloating);
  var comboScore = removedMatches.length * this._getScoreRule("matchedDrop") +
    removedFloating.length * this._getScoreRule("floatingDrop");

  // 玩法调整：普通三消命中的珠子与断层珠统一按掉落结算。
  var fallingCandidates = collectedCells;
  this.systems.fallingMarbleSystem.registerDrops(fallingCandidates, grid);
  this.systems.jarCollectorSystem.collect([]);

  this.score += comboScore;
  resolution.matched = removedMatches;
  resolution.floating = removedFloating;
  resolution.collected = collectedCells;
  resolution.scoreDelta += comboScore;
  resolution.boardCleared = grid.getCells().length === 0;

  Logger.info("Resolution", {
    matched: removedMatches.length,
    thawed: resolution.thawed.length,
    floating: removedFloating.length,
    collected: collectedCells.length,
    injectedSkills: resolution.injectedSkills.length,
    scoreDelta: resolution.scoreDelta
  });

  return resolution;
};

GameManager.prototype._advanceBoardIfNeeded = function () {
  if (!this.dropInterval || this.shotsFired % this.dropInterval !== 0) {
    return;
  }

  this.systems.bubbleGrid.advanceRows(1);
  this.lastResolution.boardDropped = true;
  Logger.info("Board advanced", this.systems.bubbleGrid.getDropOffsetRows());
};

GameManager.prototype._isPrimaryObjectiveCompleted = function () {
  var objective = findPrimaryCollectionObjective(this.currentLevel);
  if (!objective) {
    return true;
  }

  var target = Math.max(0, Math.floor(Number(objective.value) || 0));
  if (target <= 0) {
    return true;
  }

  var jarsSnapshot = this._getCachedJarSnapshot();
  if (!jarsSnapshot) {
    return false;
  }

  if (objective.type === "collect_any") {
    return (Number(jarsSnapshot.collectedTotal) || 0) >= target;
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : "";
    if (!colorCode) {
      return false;
    }
    var byColor = jarsSnapshot.collectedByColor || {};
    return (Number(byColor[colorCode]) || 0) >= target;
  }

  return true;
};

GameManager.prototype._resolveBoardClearedOutcome = function () {
  // 清屏后若仍有掉落中的玻璃球，先进入等待态；
  // 等掉落完成并计分后，再决定本局最终胜负。
  if (this.systems.fallingMarbleSystem.hasActiveDrops()) {
    this.state = "won_pending";
    return;
  }

  var grid = this.systems.bubbleGrid;
  var dangerReached = grid.hasReachedDangerLine();
  if (dangerReached && this.lastResolution) {
    this.lastResolution.dangerReached = true;
  }

  if (dangerReached) {
    this.state = "lost_danger";
    return;
  }

  if (!this._isPrimaryObjectiveCompleted()) {
    this.state = "lost_objective";
    return;
  }

  this.state = "won";
};

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
    winStats: {
      totalScore: this.score,
      // 结算进度与顶部 HUD 保持同口径，避免显示不一致。
      sameColorProgress: jarsSnapshot ? (jarsSnapshot.objectiveProgress || 0) : 0,
      sameColorTarget: jarsSnapshot ? (jarsSnapshot.objectiveTarget || 0) : 0,
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












