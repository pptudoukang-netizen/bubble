"use strict";

function attachGameManagerUpdateMethods(GameManager, context) {
  var FallingMarbleSystem = context.FallingMarbleSystem;
  var Logger = context.Logger;
  var TIMED_LEVEL_RENDER_BUCKET_MS = context.TIMED_LEVEL_RENDER_BUCKET_MS;
  var assertFiniteNumber = context.assertFiniteNumber;
  var clone = context.clone;
  var distance = context.distance;
  var lerpPoint = context.lerpPoint;
  var requireDropGlowStacks = context.requireDropGlowStacks;
  var resolveCollectedDropAudioGlowStacks = context.resolveCollectedDropAudioGlowStacks;

GameManager.prototype._grantTimeBonusForRemovedCells = function (removedCells, removalReason) {
  if (!Array.isArray(removedCells)) {
    throw new Error("Time bonus grant requires removed cells array.");
  }
  if (removalReason !== "elimination" && removalReason !== "floating_drop") {
    throw new Error("Time bonus grant removal reason is invalid: " + removalReason);
  }
  if (!this.isTimedInfiniteShots || this.state !== "running") {
    return;
  }
  if (!this.grantedTimeBonusCellIds || typeof this.grantedTimeBonusCellIds !== "object" || Array.isArray(this.grantedTimeBonusCellIds)) {
    throw new Error("Time bonus grant state is invalid.");
  }

  var awardedCells = [];
  var grantedMilliseconds = 0;
  removedCells.forEach(function (cell, index) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Time bonus removed cell must be an object at index " + index + ".");
    }
    if (cell.entityCategory !== "normal_ball" || cell.timeBonusSeconds === null || cell.timeBonusSeconds === undefined) {
      return;
    }
    if (!Number.isInteger(cell.timeBonusSeconds) || cell.timeBonusSeconds !== 5) {
      throw new Error("Time bonus normal ball must grant exactly 5 seconds: " + cell.id);
    }
    if (typeof cell.id !== "string" || !cell.id) {
      throw new Error("Time bonus normal ball requires string cell id.");
    }
    if (this.grantedTimeBonusCellIds[cell.id]) {
      throw new Error("Time bonus normal ball was granted more than once: " + cell.id);
    }
    this.grantedTimeBonusCellIds[cell.id] = true;
    grantedMilliseconds += cell.timeBonusSeconds * 1000;
    awardedCells.push({
      id: cell.id,
      row: cell.row,
      col: cell.col,
      bonusSeconds: cell.timeBonusSeconds
    });
  }, this);

  if (!awardedCells.length) {
    return;
  }
  var previousRemainingTimeMs = this.remainingTimeMs;
  this.remainingTimeMs += grantedMilliseconds;
  this._lastTimerRenderBucket = Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS);
  this._pushRuntimeEvent("time_bonus_awarded", {
    reason: removalReason,
    previous_remaining_time_ms: previousRemainingTimeMs,
    granted_time_seconds: grantedMilliseconds / 1000,
    remaining_time_ms: this.remainingTimeMs,
    cells: awardedCells
  });
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
  var timedOutOcclusionZoneIds = this.systems.boardOcclusionSystem.update(
    safeDt,
    this.state !== "running" || this.timerPaused
  );
  if (timedOutOcclusionZoneIds.length) {
    this._pushRuntimeEvent("board_occlusion_cleared", {
      reason: "countdown",
      zoneIds: timedOutOcclusionZoneIds
    });
  }
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

  this._resolveTrappedSpriteRescueBoardEmpty();

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
  var surplusShotLaunchedCount = 0;
  if (
    this.state === "won_surplus_shots_pending" ||
    this.state === "board_clear_score_recheck_surplus_shots_pending"
  ) {
    if (
      !fallingStep ||
      !Number.isInteger(fallingStep.surplusShotLaunchedCount) ||
      fallingStep.surplusShotLaunchedCount < 0 ||
      fallingStep.surplusShotLaunchedCount > 1
    ) {
      throw new Error("Surplus shot update requires surplusShotLaunchedCount from 0 to 1.");
    }
    surplusShotLaunchedCount = fallingStep.surplusShotLaunchedCount;
  }
  for (var surplusLaunchIndex = 0; surplusLaunchIndex < surplusShotLaunchedCount; surplusLaunchIndex += 1) {
    this._pushRuntimeEvent("surplus_shot_launched", {});
  }
  var viewportFinished = this.systems.boardViewportSystem.update(dt);
  var trappedSpriteRotationStep = this.systems.trappedSpriteRescueSystem.update(dt);
  var trappedSpriteRotationUpdated = trappedSpriteRotationStep.changed === true;
  if (trappedSpriteRotationStep.changed) {
    this.systems.bubbleGrid.notifyWorldTransformChanged();
  }
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  var viewportUpdated = viewportWasMoving || viewportFinished;
  var fallingUpdated = !!(fallingStep && fallingStep.updated);
  var collectedDrops = fallingStep && Array.isArray(fallingStep.collected) ? fallingStep.collected : [];
  var cleanupScoredDrops = fallingStep && Array.isArray(fallingStep.cleanupScored) ? fallingStep.cleanupScored : [];
  var fairyHits = fallingStep && Array.isArray(fallingStep.fairyHits) ? fallingStep.fairyHits : [];
  var fairySplits = fallingStep && Array.isArray(fallingStep.splits) ? fallingStep.splits : [];
  var runtimeEvents = this._drainRuntimeEvents();
  var bounceEvents = fallingStep && Array.isArray(fallingStep.bounceEvents) ? fallingStep.bounceEvents : [];
  bounceEvents.forEach(function (bounceEvent) {
    if (!bounceEvent || !Number.isInteger(bounceEvent.bounceCount) || bounceEvent.bounceCount < 1) {
      throw new Error("FallingMarbleSystem bounce event requires positive integer bounceCount.");
    }
    if (!Number.isInteger(bounceEvent.jarIndex) || bounceEvent.jarIndex < 0) {
      throw new Error("FallingMarbleSystem bounce event requires non-negative integer jarIndex.");
    }
    var glowStacks = requireDropGlowStacks(bounceEvent.glowStacks, "FallingMarbleSystem bounce event");
    this._pushRuntimeEvent("jar_rim_bounce", {
      bounceCount: bounceEvent.bounceCount,
      glowStacks: glowStacks,
      jarIndex: bounceEvent.jarIndex
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
  if (cleanupScoredDrops.length) {
    this._injectCollectedSkillBalls(cleanupScoredDrops);
    this._applyJarCollectionScore(cleanupScoredDrops);
  }
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var scoreBoostChanged = this._updateJarScoreBoost(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  var trappedSpritePostImpactContinued = this._continueAfterTrappedSpriteImpactRotation();
  var boardAdvancedThisFrame = viewportFinished || this._updatePendingBoardAdvance(dt) || this._hasBoardAdvancedThisFrame();
  var swirlRotationWasPending = this._hasPendingSwirlRotation();
  var swirlRotationCompleted = boardAdvancedThisFrame || trappedSpritePostImpactContinued
    ? false
    : this._updatePendingSwirlRotation(dt);
  var wormholeShiftWasPending = this._hasPendingWormholeShift();
  var wormholeShiftCompleted = boardAdvancedThisFrame || swirlRotationWasPending || this._hasPendingSwirlRotation()
    ? false
    : this._updatePendingWormholeShift(dt);
  var vineCastWasPending = this._hasPendingVineCast();
  var vineCastCompleted = boardAdvancedThisFrame || swirlRotationWasPending || this._hasPendingSwirlRotation() || wormholeShiftWasPending || this._hasPendingWormholeShift()
    ? false
    : this._updatePendingVineCast(dt);
  var blockOtherSpecialUpdates = swirlRotationWasPending || this._hasPendingSwirlRotation() || wormholeShiftWasPending || this._hasPendingWormholeShift() || vineCastWasPending || this._hasPendingVineCast();
  var splitterSpawned = boardAdvancedThisFrame || blockOtherSpecialUpdates ? false : this._updatePendingSplitterSpawns(dt);
  var molotovBlastUpdated = boardAdvancedThisFrame || blockOtherSpecialUpdates ? false : this._updatePendingMolotovBlasts(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var hasProjectile = !!this.activeProjectile;
  var hasFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();
  var hasPendingSplitterSpawns = this._hasPendingSplitterSpawns();
  var hasPendingMolotovBlasts = this._hasPendingMolotovBlasts();
  var hasPendingSwirlRotation = this._hasPendingSwirlRotation();
  var hasPendingWormholeShift = this._hasPendingWormholeShift();
  var hasPendingVineCast = this._hasPendingVineCast();
  var hasPendingTrappedSpritePostImpact = this._hasPendingTrappedSpritePostImpactResolution();
  if (
    (this.state === "won_surplus_shots_pending" || this.state === "board_clear_score_recheck_surplus_shots_pending") &&
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
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
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
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
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

  if (this.state === "won_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts && !hasPendingSwirlRotation && !hasPendingWormholeShift && !hasPendingVineCast && !hasPendingTrappedSpritePostImpact && !this.systems.trappedSpriteRescueSystem.isRotating()) {
    this._resolveBoardClearedOutcome();
    runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    (this.state === "won_surplus_shots_pending" || this.state === "board_clear_score_recheck_surplus_shots_pending") &&
    !hasProjectile &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
    !hasPendingTrappedSpritePostImpact &&
    !this.systems.fallingMarbleSystem.hasPendingSurplusShots()
  ) {
    var isBoardClearScoreRecheck = this.state === "board_clear_score_recheck_surplus_shots_pending";
    var hasReachedRequiredStar = !isBoardClearScoreRecheck || this._isClearWinCompleted();
    if (hasReachedRequiredStar && typeof this._pushRuntimeEvent === "function") {
      this._pushRuntimeEvent("surplus_shots_finished", {});
    }
    if (isBoardClearScoreRecheck) {
      this._resolveBoardClearedOutcome();
    } else {
      this._scheduleWinSettlement();
    }
    runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "won_settlement_pending") {
    this._updatePendingWinSettlement(dt);
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "out_of_shots_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts && !hasPendingSwirlRotation && !hasPendingWormholeShift && !hasPendingVineCast && !this._isBoardAdvanceBusy()) {
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
    !swirlRotationCompleted &&
    !wormholeShiftCompleted &&
    !vineCastCompleted &&
    !trappedSpritePostImpactContinued &&
    !surplusUpdated &&
    !viewportUpdated &&
    !trappedSpriteRotationUpdated &&
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
    swirlRotationCompleted ||
    wormholeShiftCompleted ||
    vineCastCompleted ||
    trappedSpritePostImpactContinued ||
    surplusUpdated ||
    viewportUpdated ||
    trappedSpriteRotationUpdated ||
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
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !trappedSpritePostImpactContinued &&
      !surplusUpdated &&
      !viewportUpdated &&
      !trappedSpriteRotationUpdated &&
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
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !trappedSpritePostImpactContinued &&
      !surplusUpdated &&
      !viewportUpdated &&
      !trappedSpriteRotationUpdated &&
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
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !trappedSpritePostImpactContinued &&
      !surplusUpdated &&
      !viewportUpdated &&
      !trappedSpriteRotationUpdated &&
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
}

module.exports = attachGameManagerUpdateMethods;
