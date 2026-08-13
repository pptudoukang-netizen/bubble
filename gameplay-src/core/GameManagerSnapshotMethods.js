"use strict";

function attachGameManagerSnapshotMethods(GameManager, context) {
  var BoardLayout = context.BoardLayout;
  var FallingMarbleSystem = context.FallingMarbleSystem;
  var Logger = context.Logger;
  var assertFiniteNumber = context.assertFiniteNumber;
  var buildAimGuidePath = context.buildAimGuidePath;
  var buildRuntimeProjectileSnapshot = context.buildRuntimeProjectileSnapshot;
  var calculateStarProgress = context.calculateStarProgress;
  var calculateStarRating = context.calculateStarRating;
  var clone = context.clone;
  var createEmptyResolution = context.createEmptyResolution;
  var normalizeStarThresholds = context.normalizeStarThresholds;
  var quantize = context.quantize;

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

  resolution.boardCleared = this._isBoardCleared(grid);
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
  if (
    !this.systems ||
    !this.systems.bubbleGrid ||
    typeof this.systems.bubbleGrid.getCells !== "function" ||
    !this.systems.boardOcclusionSystem ||
    typeof this.systems.boardOcclusionSystem.clearZonesWithoutBoardCells !== "function"
  ) {
    throw new Error("getRuntimeSnapshot requires board occlusion and bubble grid synchronization.");
  }
  var snapshotRuntimeEvents = Array.isArray(runtimeEvents) ? runtimeEvents.slice() : [];
  var boardEmptyOcclusionZoneIds = this.systems.boardOcclusionSystem.clearZonesWithoutBoardCells(
    this.systems.bubbleGrid.getCells()
  );
  if (boardEmptyOcclusionZoneIds.length) {
    this.runtimeEventSequence += 1;
    snapshotRuntimeEvents.push({
      id: this.runtimeEventSequence,
      type: "board_occlusion_cleared",
      reason: "board_empty",
      zoneIds: boardEmptyOcclusionZoneIds.slice()
    });
  }
  var fallingSystem = this.systems.fallingMarbleSystem;
  var fairyAssistSystem = this.systems.fairyAssistSystem;
  var systemSnapshots = {
    fairyAssistSystem: fairyAssistSystem.snapshotForRender(),
    // Renderer currently relies on falling snapshot (active drops + jar zones).
    fallingMarbleSystem: typeof fallingSystem.snapshotForRender === "function"
      ? fallingSystem.snapshotForRender()
      : fallingSystem.snapshot(),
    boardOcclusionSystem: this.systems.boardOcclusionSystem.snapshotForRender()
  };
  systemSnapshots.trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem.snapshotForRender();
  var jarsSnapshot = this._getCachedJarSnapshot();
  var objectiveSnapshot = this._buildPrimaryObjectiveSnapshot(jarsSnapshot);
  if (!this._cachedAdRunPowerupAllowed) {
    this._rebuildCachedAdRunPowerupAllowed();
  }
  var adRunPowerupAllowed = this._cachedAdRunPowerupAllowed;

  var shooterController = this.systems.shooterController;
  var shooterSnapshot = shooterController.getShooterStateForRender();
  if (this.equippedAssistSpiritId) {
    var assistSpiritSkillAvailability = this.getAssistSpiritSkillAvailability();
    shooterSnapshot.assistSpiritId = assistSpiritSkillAvailability.spiritId;
    shooterSnapshot.assistSpiritLevel = this.equippedAssistSpiritLevel;
    shooterSnapshot.assistSpiritSkillAvailable = assistSpiritSkillAvailability.available;
    shooterSnapshot.assistSpiritSkillUnavailableReason = assistSpiritSkillAvailability.reason;
    shooterSnapshot.assistSpiritResolvedSkillId = assistSpiritSkillAvailability.skillId || null;
    shooterSnapshot.assistSpiritSkillCharge = assistSpiritSkillAvailability.charge;
    shooterSnapshot.assistSpiritSkillChargeMax = assistSpiritSkillAvailability.maxCharge;
    shooterSnapshot.assistSpiritSkillCharged = assistSpiritSkillAvailability.isCharged === true;
  }
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
    !this._hasPendingSwirlRotation() &&
    !this._hasPendingWormholeShift() &&
    !this._hasPendingVineCast() &&
    !this.pendingRainbowColorSelection
  );
  shooterSnapshot.trajectory = this.isAiming && this.pendingShotPlan && !this.activeProjectile && !this.pendingRainbowColorSelection
    ? this.pendingShotPlan
    : null;

  shooterSnapshot.surplusShotAimRecenterRevision = this.surplusShotAimRecenterRevision;
  if (
    this.state === "won_surplus_shots_pending" ||
    this.state === "board_clear_score_recheck_surplus_shots_pending"
  ) {
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
    surplusShotsSettling: this.state === "won_surplus_shots_pending" || this.state === "board_clear_score_recheck_surplus_shots_pending",
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
    inputLocked: this._isBoardAdvanceBusy() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast() || this.state !== "running",
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
    runtimeEvents: snapshotRuntimeEvents,
    systems: systemSnapshots,
    refreshScope: renderOptions.refreshScope || "full"
  };
};
}

module.exports = attachGameManagerSnapshotMethods;
