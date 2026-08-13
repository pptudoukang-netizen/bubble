"use strict";

function attachGameManagerPowerupMethods(GameManager, context) {
  var AD_REVIVE_ALLOWED_STATES = context.AD_REVIVE_ALLOWED_STATES;
  var AdRevivePolicy = context.AdRevivePolicy;
  var BoardLayout = context.BoardLayout;
  var BoardOcclusionSystem = context.BoardOcclusionSystem;
  var BubbleGrid = context.BubbleGrid;
  var SNOW_REMOVAL_CLEAR_COUNT = context.SNOW_REMOVAL_CLEAR_COUNT;
  var ShooterController = context.ShooterController;
  var TIMED_LEVEL_RENDER_BUCKET_MS = context.TIMED_LEVEL_RENDER_BUCKET_MS;
  var assertFiniteNumber = context.assertFiniteNumber;
  var buildSnowRemovalTargetKey = context.buildSnowRemovalTargetKey;
  var compareSnowRemovalTargetsFromBoardBottom = context.compareSnowRemovalTargetsFromBoardBottom;
  var createEmptyResolution = context.createEmptyResolution;
  var isBarrierObstacleBall = context.isBarrierObstacleBall;
  var isIceBall = context.isIceBall;
  var isStoneBall = context.isStoneBall;
  var requireSnowRemovalTargetCoordinates = context.requireSnowRemovalTargetCoordinates;
  var resolveIceInnerColor = context.resolveIceInnerColor;

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
  var reviveRuntimeSnapshot = this.isTimedInfiniteShots
    ? null
    : {
      board: {
        cells: this.systems.bubbleGrid.getCells()
      },
      objectives: this._buildPrimaryObjectiveSnapshot(this._getCachedJarSnapshot())
    };
  var revivePlan = AdRevivePolicy.buildRevivePlan(this.currentLevel, reviveRuntimeSnapshot);
  var previousRemainingShots = this.remainingShots;
  var previousRemainingTimeMs = this.remainingTimeMs;
  if (this.isTimedInfiniteShots) {
    if (revivePlan.grantedShots !== 0 || !Number.isInteger(revivePlan.grantedTimeSeconds) || revivePlan.grantedTimeSeconds <= 0) {
      throw new Error("Timed ad revive requires positive grantedTimeSeconds and zero grantedShots.");
    }
    this.remainingTimeMs = previousRemainingTimeMs + revivePlan.grantedTimeSeconds * 1000;
    this._lastTimerRenderBucket = Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS);
    this.timerPaused = false;
  } else {
    if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0 || revivePlan.grantedTimeSeconds !== 0) {
      throw new Error("Shot-limited ad revive requires positive grantedShots and zero grantedTimeSeconds.");
    }
    if (!this.systems.shooterController || typeof this.systems.shooterController.setUpcomingNormalBalls !== "function") {
      throw new Error("Ad revive requires ShooterController.setUpcomingNormalBalls.");
    }
    if (typeof this.systems.shooterController.setUpcomingRandomNormalBalls !== "function") {
      throw new Error("Ad revive requires ShooterController.setUpcomingRandomNormalBalls.");
    }
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
    previous_remaining_time_ms: previousRemainingTimeMs,
    remaining_time_ms: this.remainingTimeMs,
    granted_time_seconds: revivePlan.grantedTimeSeconds,
    target_color: revivePlan.targetColor,
    target_color_ball_count: revivePlan.targetColorBallCount,
    random_ball_count: revivePlan.randomBallCount
  });

  return {
    accepted: true,
    previousRemainingShots: previousRemainingShots,
    remainingShots: this.remainingShots,
    grantedShots: revivePlan.grantedShots,
    previousRemainingTimeMs: previousRemainingTimeMs,
    remainingTimeMs: this.remainingTimeMs,
    grantedTimeSeconds: revivePlan.grantedTimeSeconds,
    targetColor: revivePlan.targetColor,
    targetColorBallCount: revivePlan.targetColorBallCount,
    randomBallCount: revivePlan.randomBallCount,
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

  var boardOcclusionSystem = this.systems.boardOcclusionSystem;
  if (!boardOcclusionSystem || typeof boardOcclusionSystem.snapshotForRender !== "function") {
    throw new Error("Snow removal requires BoardOcclusionSystem.");
  }
  var occlusionSnapshot = boardOcclusionSystem.snapshotForRender();
  if (!Array.isArray(occlusionSnapshot.activeZones)) {
    throw new Error("Board occlusion snapshot requires activeZones array.");
  }
  if (occlusionSnapshot.activeZones.length > 0) {
    return {
      accepted: true,
      targetKind: "board_occlusion",
      targets: occlusionSnapshot.activeZones.map(function (zone) {
        if (!zone || typeof zone.id !== "string" || !zone.id) {
          throw new Error("Board occlusion removal preview requires zone ids.");
        }
        return zone.id;
      }),
      clearCount: occlusionSnapshot.activeZones.length,
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
    targetKind: "ice",
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
  if (preview.targetKind === "board_occlusion") {
    if (Array.isArray(expectedTargets)) {
      var expectedOcclusionKey = expectedTargets.slice().sort().join("|");
      var actualOcclusionKey = preview.targets.slice().sort().join("|");
      if (expectedOcclusionKey !== actualOcclusionKey) {
        throw new Error("Board occlusion removal targets changed before resolution.");
      }
    }
    var occlusionConsumeResult = this.systems.shooterController.consumeSnowRemoval();
    if (!occlusionConsumeResult || !occlusionConsumeResult.accepted) {
      return {
        accepted: false,
        reason: occlusionConsumeResult && occlusionConsumeResult.reason
          ? occlusionConsumeResult.reason
          : "inventory_empty",
        snapshot: this.getRuntimeSnapshot()
      };
    }
    var removedZoneIds = this.systems.boardOcclusionSystem.clearAllWithItem();
    if (removedZoneIds.length !== preview.targets.length) {
      throw new Error("Board occlusion removal count changed before resolution.");
    }
    this.pendingShotPlan = null;
    this.isAiming = false;
    this._pushRuntimeEvent("board_occlusion_cleared", {
      reason: "snow_removal",
      zoneIds: removedZoneIds
    });
    this._pushRuntimeEvent("powerup_snow_removal", {
      target_kind: "board_occlusion",
      targets: removedZoneIds.slice(),
      removed: removedZoneIds.length,
      floating: 0,
      ice_collected: 0
    });
    return {
      accepted: true,
      targetKind: "board_occlusion",
      targets: removedZoneIds,
      removed: removedZoneIds.length,
      thawed: 0,
      floating: 0,
      remaining: occlusionConsumeResult.remaining,
      snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
    };
  }
  if (preview.targetKind !== "ice") {
    throw new Error("Unsupported snow removal targetKind: " + preview.targetKind);
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
  var removedFloating = grid.removeFloatingCells(floatingCells);
  this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
    matchedCellsForDelay: thawedSnowCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.floating = removedFloating;
  resolution.collected = removedFloating;
  resolution.boardCleared = this._isBoardCleared(grid);
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
    var removedFloating = grid.removeFloatingCells(floatingCells);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);

    this._registerResolutionDrops(resolution.floating, grid, resolution);
    this.systems.jarCollectorSystem.collect([]);

    resolution.matched = removedObstacle;
    resolution.collected = resolution.floating.slice();
    resolution.boardCleared = this._isBoardCleared(grid);
  } else {
    var thawedCell = this._thawIceCellAtCurrentPosition(grid, targetCell);
    resolution.thawed = thawedCell ? [thawedCell] : [];
    if (typeof this._registerIceCollection === "function") {
      resolution.iceCollected = this._registerIceCollection(resolution.thawed);
    }
    resolution.boardCleared = this._isBoardCleared(grid);
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
}

module.exports = attachGameManagerPowerupMethods;
