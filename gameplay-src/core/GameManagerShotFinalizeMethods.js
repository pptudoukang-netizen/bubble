"use strict";

function createGameManagerShotFinalizeMethods(context) {
  var AssistSpiritConfig = context.AssistSpiritConfig;
  var BoardLayout = context.BoardLayout;
  var EliminationSequenceBuilder = context.EliminationSequenceBuilder;
  var Logger = context.Logger;
  var createEmptyResolution = context.createEmptyResolution;
  var createGameManagerShotFinalizeMethods = context.createGameManagerShotFinalizeMethods;
  var findPrimaryCollectionObjective = context.findPrimaryCollectionObjective;
  var isBlastBall = context.isBlastBall;
  var isIceBall = context.isIceBall;
  var isLockedBall = context.isLockedBall;
  var isRainbowBall = context.isRainbowBall;
  var isVineEntangledBall = context.isVineEntangledBall;
  var isVineSpiritBall = context.isVineSpiritBall;

  return {
    _resolveBlastShot: function (projectile, targetCell) {
      var resolution = createEmptyResolution();

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
      if (!centerCoordinate) {
        throw new Error("Blast shot requires a resolved explosion center.");
      }

      var blastCells = [];
      var iceCellsToThaw = [];
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
          } else if (isLockedBall(occupiedCell)) {
            return;
          } else {
            blastCells.push(occupiedCell);
          }
        }
      });

      this._resolveVineSpiritsHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedBlastCells = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedBlastCells, grid, resolution);
      if (!Array.isArray(resolution.blastExplosions)) {
        throw new Error("Blast resolution requires blastExplosions array.");
      }
      if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
        throw new Error("Blast explosion requires a positive shotsFired id.");
      }
      resolution.blastExplosions.push({
        id: "blast_shot_" + this.shotsFired,
        entityType: "blast",
        row: centerCoordinate.row,
        col: centerCoordinate.col
      });
      this._pushBombExplosionEvent();
      resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }
      var removedReactive = this._resolveReactiveEntitiesAfterRemoval(removedBlastCells, grid, resolution);
      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "blastDrop",
          removedBlastCells.concat(removedReactive)
        );
        Logger.info("Blast resolution pending molotov", {
          cleared: removedBlastCells.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var removedAll = removedBlastCells.concat(removedReactive).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);

      var matchedCells = removedBlastCells.concat(removedReactive);
      this._registerResolutionDrops(
        resolution.floating,
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: matchedCells
        }
      );
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCells);
      resolution.matched = matchedCells;
      this._registerMatchedObjectiveCollection(matchedCells, resolution.eliminationSequence, resolution, grid);
      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(centerCoordinate);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "blastDrop");
      this._registerComboElimination(resolution);

      Logger.info("Blast resolution", {
        cleared: removedBlastCells.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _finalizePlannedShot: function () {
      if (!this.activeProjectile) {
        return;
      }

      var projectile = this.activeProjectile;
      var grid = this.systems.bubbleGrid;
      var targetCell = projectile.targetCell;
      var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;

      if (
        projectile.shotPlan &&
        projectile.shotPlan.hitType === "miss" &&
        trappedSpriteRescueSystem.isActive()
      ) {
        this.lastResolution = createEmptyResolution();
        this.lastResolution.shotMissed = true;
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_missed_board");
          this._pushRuntimeEvent("shot_no_elimination");
        }
        this.activeProjectile = null;
        this.pendingProjectileFinalize = false;
        this.pendingShotPlan = null;
        var missClearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
        if (missClearedOcclusionZoneIds.length) {
          this._pushRuntimeEvent("board_occlusion_cleared", {
            reason: "shot_count",
            zoneIds: missClearedOcclusionZoneIds
          });
        }
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this._showOutOfShotsAddBallPrompt();
        }
        return;
      }

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
      if (!targetCell) {
        throw new Error("Planned shot could not resolve an attachment cell.");
      }

      var firedBall = projectile.ball || {
        ballCategory: "normal",
        color: projectile.color,
        entityCategory: "normal_ball",
        entityType: null
      };

      if (isBlastBall(firedBall)) {
        this.lastResolution = this._resolveBlastShot(projectile, targetCell);
      } else if (isRainbowBall(firedBall)) {
        this.lastResolution = this._resolveRainbowShot(projectile, targetCell);
      } else {
        var attachedColor = firedBall.color;
        var attachedBubble = grid.addBubble(targetCell, attachedColor);
        this.lastResolution = this._resolveAttachment(attachedBubble);
      }
      if (trappedSpriteRescueSystem.isActive()) {
        if (
          !projectile.shotPlan ||
          !projectile.shotPlan.impactDirection
        ) {
          throw new Error("Trapped sprite impact requires shotPlan.impactDirection.");
        }
        this.lastResolution.trappedSpriteRotation =
          trappedSpriteRescueSystem.beginImpactRotation(
            grid.getCellPosition(targetCell.row, targetCell.col),
            projectile.shotPlan.impactDirection,
            grid.getCells(),
            grid
          );
      }
      if (
        this.lastResolution.trappedSpriteRotation &&
        this.lastResolution.trappedSpriteRotation.started
      ) {
        this.lastResolution.impact = null;
      }
      this._resolveDirectVineImpact(projectile, grid, this.lastResolution);
      if (!this.molotovResolutionPending) {
        this._resolveFairyAssistsAfterResolution(this.lastResolution);
      }
      var trappedSpriteRotationStarted = !!(
        this.lastResolution.trappedSpriteRotation &&
        this.lastResolution.trappedSpriteRotation.started
      );
      var swirlRotationStarted = false;
      var wormholeShiftStarted = false;
      var vineCastStarted = false;
      if (trappedSpriteRotationStarted) {
        this._deferTrappedSpritePostImpactResolution(this.lastResolution);
      } else {
        swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(this.lastResolution);
        wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(this.lastResolution);
        vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(this.lastResolution);
      }
      var postShotSpecialStarted = trappedSpriteRotationStarted || swirlRotationStarted || wormholeShiftStarted || vineCastStarted;
      var deferredBoardShift = postShotSpecialStarted ? true : this._applyPostImpactBoardShiftPolicy(this.lastResolution);

      var noEliminationTriggered = !(
        this.lastResolution &&
        Array.isArray(this.lastResolution.matched) &&
        this.lastResolution.matched.length > 0
      );
      if (noEliminationTriggered) {
        if (
          !projectile.shotPlan ||
          !Number.isInteger(projectile.shotPlan.wallBounceCount) ||
          projectile.shotPlan.wallBounceCount < 0
        ) {
          throw new Error("Finalized projectile requires a non-negative integer shotPlan.wallBounceCount.");
        }
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_no_elimination");
          if (projectile.shotPlan.wallBounceCount > 0) {
            this._pushRuntimeEvent("shot_wall_bounce_no_elimination", {
              wallBounceCount: projectile.shotPlan.wallBounceCount
            });
          }
        }
      }

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;
      var clearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
      if (clearedOcclusionZoneIds.length) {
        this._pushRuntimeEvent("board_occlusion_cleared", {
          reason: "shot_count",
          zoneIds: clearedOcclusionZoneIds
        });
      }

      if (postShotSpecialStarted) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (this.lastResolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }

      if (this._tryTopAnchorCollapse()) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._hasPendingMolotovBlasts()) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (deferredBoardShift) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._ensureMinimumVisibleBoardRows(this.lastResolution)) {
        this.pendingShotPlan = null;
        if (this.state === "won_pending") {
          return;
        }
        return;
      }

      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
        return;
      }

      this.pendingShotPlan = null;
    },

    _resolveAttachment: function (attachedBubble) {
      var resolution = createEmptyResolution();
      resolution.attachedCell = attachedBubble;
      resolution.impact = this._createImpactEventFromCell(attachedBubble);

      var grid = this.systems.bubbleGrid;
      var matchedCells = this.systems.matchSystem.findMatchGroup(grid, attachedBubble);

      if (!matchedCells.length) {
        if (this.systems.trappedSpriteRescueSystem.isActive()) {
          var unsupportedCells = this.systems.supportSystem.findFloatingCells(grid);
          var unsupportedRemoved = grid.removeFloatingCells(unsupportedCells);
          this._appendUniqueCells(resolution.floating, unsupportedRemoved);
          resolution.collected = unsupportedRemoved.slice();
          this._registerResolutionDrops(unsupportedRemoved, grid, resolution);
          this._applyResolutionDropScore(resolution, "matchedDrop");
        } else {
          this.systems.supportSystem.clearFloatingCells();
          this.systems.fallingMarbleSystem.registerDrops([], grid);
        }
        this.systems.jarCollectorSystem.collect([]);
        resolution.boardCleared = this._isBoardCleared(grid);
        return resolution;
      }

      var removedMatches = grid.removeCells(matchedCells);
      var removedReactiveMatches = this._resolveReactiveEntitiesAfterRemoval(removedMatches, grid, resolution);
      if (resolution.impact) {
        resolution.impact = this._filterImpactEventSurvivors(
          resolution.impact,
          removedMatches.concat(removedReactiveMatches)
        );
      }
      var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
      resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }

      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "matchedDrop",
          removedMatches.concat(removedReactiveMatches)
        );
        Logger.info("Resolution pending molotov", {
          matched: removedMatches.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var collectedCells = removedMatches.concat(removedReactiveMatches).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(collectedCells);

      var matchedCellsForScore = removedMatches.concat(removedReactiveMatches);
      var matchedScorePerBall = this._getMatchedDropScorePerBallForNextCombo("matchedDrop");
      var eliminationData = EliminationSequenceBuilder.buildEliminationSequence(
        attachedBubble,
        matchedCellsForScore,
        grid,
        matchedScorePerBall
      );
      resolution.eliminationSequence = eliminationData.eliminationSequence;
      resolution.scoreEvents = eliminationData.scoreEvents;

      resolution.matched = matchedCellsForScore;
      this._registerMatchedObjectiveCollection(
        matchedCellsForScore,
        resolution.eliminationSequence,
        resolution,
        grid
      );
      this._registerResolutionDrops(resolution.floating, grid, resolution);
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCellsForScore, resolution.eliminationSequence);
      resolution.collected = collectedCells;
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "matchedDrop", {
        matchedScorePerBall: matchedScorePerBall
      });
      this._registerComboElimination(resolution);

      Logger.info("Resolution", {
        matched: removedMatches.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        collected: collectedCells.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _isPrimaryObjectiveCompleted: function () {
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

      if (typeof this._getPrimaryObjectiveProgressValue === "function") {
        return this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) >= target;
      }

      return true;
    },

    _emitTrappedSpriteRescueEvent: function () {
      var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;
      if (!trappedSpriteRescueSystem.isActive() || this.trappedSpriteRescueEventEmitted) {
        return false;
      }
      var trappedSpriteSnapshot = trappedSpriteRescueSystem.snapshotForRender();
      if (
        !trappedSpriteSnapshot.active ||
        typeof trappedSpriteSnapshot.spiritId !== "string"
      ) {
        throw new Error("Trapped sprite rescue completion requires spiritId.");
      }
      AssistSpiritConfig.getSpirit(trappedSpriteSnapshot.spiritId);
      this._pushRuntimeEvent("trapped_sprite_rescued", {
        spiritId: trappedSpriteSnapshot.spiritId
      });
      this.trappedSpriteRescueEventEmitted = true;
      return true;
    },

    _resolveBoardClearedOutcome: function () {
      this._emitTrappedSpriteRescueEvent();

      // 清屏后若仍有掉落中的玻璃球，先进入等待态；
      // 等掉落完成并计分后，再决定本局最终胜负。
      if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast() || this._hasPendingTrappedSpritePostImpactResolution() || this.systems.trappedSpriteRescueSystem.isRotating()) {
        this.state = "won_pending";
        return;
      }

      if (!this._isClearWinCompleted()) {
        if (!this.isTimedInfiniteShots && this.remainingShots > 0) {
          this._beginSurplusShotBonus("board_clear_score_recheck");
          return;
        }
        this.state = "lost_objective";
        return;
      }

      this._resolveClearWinOutcome();
    },

    _beginSurplusShotBonus: function (settlementReason) {
      if (this.isTimedInfiniteShots) {
        throw new Error("Surplus shot bonus cannot run in timed infinite-shot mode.");
      }
      if (settlementReason !== "clear_win" && settlementReason !== "board_clear_score_recheck") {
        throw new Error("Surplus shot bonus requires an explicit settlement reason.");
      }

      var remainingCount = Math.floor(Number(this.remainingShots) || 0);
      if (!Number.isInteger(remainingCount) || remainingCount <= 0) {
        throw new Error("Surplus shot bonus requires positive remainingShots.");
      }

      var shooterController = this.systems.shooterController;
      if (!shooterController || typeof shooterController.drainRemainingShotBalls !== "function") {
        throw new Error("Surplus shot bonus requires ShooterController.drainRemainingShotBalls.");
      }

      var fallingMarbleSystem = this.systems.fallingMarbleSystem;
      if (!fallingMarbleSystem || typeof fallingMarbleSystem.registerSurplusShotsFromOrigin !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.registerSurplusShotsFromOrigin.");
      }
      if (typeof fallingMarbleSystem.hasPendingSurplusShots !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.hasPendingSurplusShots.");
      }

      if (this.activeProjectile) {
        throw new Error("Surplus shot bonus cannot start while projectile is active.");
      }
      if (fallingMarbleSystem.hasActiveDrops()) {
        throw new Error("Surplus shot bonus cannot start while board drops are still active.");
      }

      var aimState = shooterController.getAimState();
      var origin = aimState && aimState.origin ? aimState.origin : null;
      if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
        throw new Error("Surplus shot bonus requires shooter aim origin.");
      }

      var drainedBalls = shooterController.drainRemainingShotBalls(remainingCount);
      this.remainingShots = 0;
      this.isAiming = false;
      this.pendingShotPlan = null;
      this.surplusShotAimRecentered = false;
      var initialSurplusDrops = fallingMarbleSystem.registerSurplusShotsFromOrigin(
        drainedBalls,
        origin,
        this.levelRandomSeed
      );
      if (
        !Array.isArray(initialSurplusDrops) ||
        initialSurplusDrops.length !== 1 ||
        initialSurplusDrops[0].dropKind !== "surplus_shot"
      ) {
        throw new Error("Surplus shot bonus must launch exactly one surplus shot immediately.");
      }
      this.state = settlementReason === "clear_win"
        ? "won_surplus_shots_pending"
        : "board_clear_score_recheck_surplus_shots_pending";
      if (!fallingMarbleSystem.hasPendingSurplusShots()) {
        this.surplusShotAimRecentered = true;
        this.surplusShotAimRecenterRevision += 1;
      }

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("surplus_shot_launched", {});
        this._pushRuntimeEvent("surplus_shots_started", {
          count: drainedBalls.length
        });
      }

      Logger.info("Surplus shot bonus started", {
        count: drainedBalls.length
      });
    }
  };
}

module.exports = createGameManagerShotFinalizeMethods;
