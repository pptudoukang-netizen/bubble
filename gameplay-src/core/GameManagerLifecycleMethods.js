"use strict";

function attachGameManagerLifecycleMethods(GameManager, context) {
  var AssistSpiritSkillChargeConfig = context.AssistSpiritSkillChargeConfig;
  var Logger = context.Logger;
  var TIMED_LEVEL_RENDER_BUCKET_MS = context.TIMED_LEVEL_RENDER_BUCKET_MS;
  var assertPositiveInteger = context.assertPositiveInteger;
  var buildScoreHeatBand = context.buildScoreHeatBand;
  var buildScoreRulesForLevel = context.buildScoreRulesForLevel;
  var createEmptyResolution = context.createEmptyResolution;

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

GameManager.prototype.startLevel = function (levelConfig, startContext) {
  this.currentLevel = levelConfig;
  if (!levelConfig || !levelConfig.level) {
    throw new Error("GameManager.startLevel requires level config.");
  }
  if (!startContext || typeof startContext !== "object" || Array.isArray(startContext)) {
    throw new Error("GameManager.startLevel requires explicit startContext.");
  }
  if (typeof startContext.seed !== "string" || !startContext.seed) {
    throw new Error("GameManager.startLevel requires startContext.seed.");
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
  this.lastAssistSpiritProducedBallEvaluationShot = 0;
  this.assistSpiritSkillSeed = startContext.seed;
  this.assistSpiritSkillResolutionSequence = 0;
  this.assistSpiritSkillCharge = 0;
  this.assistSpiritSkillChargeMax = this._isGlobalAssistSpiritSkillEquipped()
    ? AssistSpiritSkillChargeConfig.getMaxCharge(this.equippedAssistSpiritId, this.equippedAssistSpiritLevel)
    : 0;
  this.assistSpiritSkillChargedCellIds = {};
  this.assistSpiritSkillChargeSuppressed = false;
  this.grantedTimeBonusCellIds = {};
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
  var scoreProfile = buildScoreRulesForLevel(levelConfig);
  this.scoreRules = scoreProfile.rules;
  this.scoreHeatBand = buildScoreHeatBand(levelConfig, scoreProfile);

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].configureLevel(levelConfig);
  }, this);
  this.systems.boardOcclusionSystem.startRun(startContext);

  this._rebuildCachedAdRunPowerupAllowed();
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;

  this.state = "running";
  Logger.info("Level started", levelConfig.level.code);
  return this.getRuntimeSnapshot();
};

GameManager.prototype._registerPools = function () {
  if (!this.poolManager) {
    return;
  }

  this.poolManager.register("bubble");
  this.poolManager.register("fallingMarble");
  this.poolManager.register("fx");
};
}

module.exports = attachGameManagerLifecycleMethods;
