"use strict";

function createGameManagerShotFinalizeMethods(context) {
  var AssistSpiritConfig = context.AssistSpiritConfig;
  var BoardLayout = context.BoardLayout;
  var EliminationSequenceBuilder = context.EliminationSequenceBuilder;
  var Logger = context.Logger;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var clone = context.clone;
  var createEmptyResolution = context.createEmptyResolution;
  var createGameManagerShotFinalizeMethods = context.createGameManagerShotFinalizeMethods;
  var findPrimaryCollectionObjective = context.findPrimaryCollectionObjective;
  var isBlastBall = context.isBlastBall;
  var isBlackHoleBall = context.isBlackHoleBall;
  var isIceBall = context.isIceBall;
  var isLockedBall = context.isLockedBall;
  var isRainbowBall = context.isRainbowBall;
  var isVineEntangledBall = context.isVineEntangledBall;
  var isVineSpiritBall = context.isVineSpiritBall;

  return {
    _destroyReachedTransparentBalls: function (projectile, grid) {
      if (!projectile || !projectile.shotPlan) {
        throw new Error("Transparent ball flight destruction requires projectile.shotPlan.");
      }
      if (!Array.isArray(projectile.shotPlan.penetratedTransparentBalls)) {
        throw new Error("Shot plan requires penetratedTransparentBalls array.");
      }
      if (!Array.isArray(projectile.destroyedTransparentBalls)) {
        throw new Error("Projectile requires destroyedTransparentBalls array.");
      }
      if (!Number.isInteger(projectile.segmentIndex) || projectile.segmentIndex < 0) {
        throw new Error("Projectile transparent ball destruction requires non-negative segmentIndex.");
      }
      if (!Number.isFinite(projectile.segmentProgress) || projectile.segmentProgress < 0) {
        throw new Error("Projectile transparent ball destruction requires non-negative segmentProgress.");
      }

      var destroyedById = {};
      projectile.destroyedTransparentBalls.forEach(function (cell, index) {
        if (!cell || typeof cell.id !== "string" || !cell.id) {
          throw new Error("Destroyed transparent ball requires non-empty id at index " + index + ".");
        }
        destroyedById[cell.id] = true;
      });
      var reachedEntries = projectile.shotPlan.penetratedTransparentBalls.filter(function (entry, index) {
        if (
          !entry ||
          typeof entry.id !== "string" ||
          !entry.id ||
          !Number.isInteger(entry.pathSegmentIndex) ||
          entry.pathSegmentIndex < 0 ||
          !Number.isFinite(entry.pathSegmentProgress) ||
          entry.pathSegmentProgress < 0
        ) {
          throw new Error("Invalid transparent ball flight entry at index " + index + ".");
        }
        if (destroyedById[entry.id]) {
          return false;
        }
        return entry.pathSegmentIndex < projectile.segmentIndex ||
          (
            entry.pathSegmentIndex === projectile.segmentIndex &&
            entry.pathSegmentProgress <= projectile.segmentProgress + 0.000001
          );
      });
      if (!reachedEntries.length) {
        return [];
      }
      if (!grid || typeof grid.getCell !== "function" || typeof grid.removeCells !== "function") {
        throw new Error("Transparent ball flight destruction requires BubbleGrid lookup and removal methods.");
      }

      var liveCells = reachedEntries.map(function (entry) {
        var liveCell = grid.getCell(entry.row, entry.col);
        if (
          !liveCell ||
          liveCell.id !== entry.id ||
          liveCell.entityCategory !== "reactive_ball" ||
          liveCell.entityType !== "transparent_ball"
        ) {
          throw new Error("Reached transparent ball is no longer live: " + entry.id + ".");
        }
        return liveCell;
      });
      var removed = grid.removeCells(liveCells);
      if (removed.length !== liveCells.length) {
        throw new Error("Transparent ball flight destruction did not remove every reached ball.");
      }
      Array.prototype.push.apply(projectile.destroyedTransparentBalls, removed);
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("transparent_ball_destroyed", {
          count: removed.length,
          gained: removed.length * 1000,
          cell_ids: removed.map(function (cell) {
            return cell.id;
          })
        });
      }
      return removed;
    },

    _removePlannedTransparentBalls: function (projectile, grid) {
      if (!projectile || !projectile.shotPlan) {
        throw new Error("Transparent ball penetration requires projectile.shotPlan.");
      }
      if (!Array.isArray(projectile.shotPlan.penetratedTransparentBalls)) {
        throw new Error("Shot plan requires penetratedTransparentBalls array.");
      }
      var planned = projectile.shotPlan.penetratedTransparentBalls;
      if (!planned.length) {
        return [];
      }
      if (!Array.isArray(projectile.destroyedTransparentBalls)) {
        throw new Error("Projectile requires destroyedTransparentBalls array.");
      }
      if (!grid || typeof grid.getCell !== "function" || typeof grid.removeCells !== "function") {
        throw new Error("Transparent ball penetration requires BubbleGrid lookup and removal methods.");
      }

      var plannedById = {};
      planned.forEach(function (entry, index) {
        if (
          !entry ||
          typeof entry.id !== "string" ||
          !entry.id ||
          !Number.isInteger(entry.row) ||
          !Number.isInteger(entry.col) ||
          entry.entityCategory !== "reactive_ball" ||
          entry.entityType !== "transparent_ball"
        ) {
          throw new Error("Invalid penetrated transparent ball at index " + index + ".");
        }
        if (plannedById[entry.id]) {
          throw new Error("Shot plan contains duplicate transparent ball id: " + entry.id + ".");
        }
        plannedById[entry.id] = entry;
      });
      var destroyedById = {};
      projectile.destroyedTransparentBalls.forEach(function (cell, index) {
        if (!cell || typeof cell.id !== "string" || !plannedById[cell.id]) {
          throw new Error("Destroyed transparent ball was not present in shot plan at index " + index + ".");
        }
        if (destroyedById[cell.id]) {
          throw new Error("Projectile destroyed transparent ball twice: " + cell.id + ".");
        }
        destroyedById[cell.id] = cell;
      });

      var remainingEntries = planned.filter(function (entry) {
        return !destroyedById[entry.id];
      });
      var liveTransparentBalls = remainingEntries.map(function (entry) {
        var liveCell = grid.getCell(entry.row, entry.col);
        if (
          !liveCell ||
          liveCell.id !== entry.id ||
          liveCell.entityCategory !== "reactive_ball" ||
          liveCell.entityType !== "transparent_ball"
        ) {
          throw new Error("Planned transparent ball is no longer live: " + entry.id + ".");
        }
        return liveCell;
      });

      var removed = grid.removeCells(liveTransparentBalls);
      if (removed.length !== liveTransparentBalls.length) {
        throw new Error("Transparent ball penetration did not remove every planned ball.");
      }
      if (removed.length && typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("transparent_ball_destroyed", {
          count: removed.length,
          gained: removed.length * 1000,
          cell_ids: removed.map(function (cell) {
            return cell.id;
          })
        });
      }
      removed.forEach(function (cell) {
        destroyedById[cell.id] = cell;
      });
      return planned.map(function (entry) {
        return destroyedById[entry.id];
      });
    },

    _settleTransparentBallPenetration: function (resolution, removedTransparentBalls, grid) {
      if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
        throw new Error("Transparent ball settlement requires resolution.");
      }
      if (!Array.isArray(removedTransparentBalls)) {
        throw new Error("Transparent ball settlement requires removed ball array.");
      }
      if (!Array.isArray(resolution.transparentBallsDestroyed)) {
        throw new Error("Transparent ball settlement requires resolution.transparentBallsDestroyed array.");
      }
      if (!removedTransparentBalls.length) {
        return resolution;
      }
      if (this.systems.trappedSpriteRescueSystem.isActive()) {
        throw new Error("Transparent ball is not supported in trapped sprite rescue levels.");
      }

      this._appendUniqueCells(resolution.transparentBallsDestroyed, removedTransparentBalls);
      this._appendUniqueCells(resolution.collected, removedTransparentBalls);

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(
        this._filterFloatingSpiritCocoons(floatingCells, resolution)
      );
      if (removedFloating.length) {
        if (resolution.matched.length > 0 || resolution.floating.length > 0) {
          throw new Error("Transparent ball settlement found late floating cells after an existing drop resolution.");
        }
        this._appendUniqueCells(resolution.floating, removedFloating);
        this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
        this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
        this._appendUniqueCells(resolution.collected, removedFloating);
        this._registerResolutionDrops(removedFloating, grid, resolution);
        this._applyResolutionDropScore(resolution, "matchedDrop");
      }

      var scorePerBall = this._getScoreRule("transparentBallBreak");
      if (!Number.isInteger(scorePerBall) || scorePerBall !== 1000) {
        throw new Error("Transparent ball break score must be exactly 1000.");
      }
      var gained = removedTransparentBalls.length * scorePerBall;
      removedTransparentBalls.forEach(function (cell) {
        var worldPosition = grid.getCellPosition(cell.row, cell.col);
        resolution.scoreEvents.push({
          cellId: cell.id,
          row: cell.row,
          col: cell.col,
          worldPosition: worldPosition,
          points: scorePerBall,
          delayMs: 0,
          scoreKind: "transparent_ball_break"
        });
      });
      this.score += gained;
      resolution.scoreDelta += gained;
      resolution.boardCleared = this._isBoardCleared(grid);

      if (resolution.comboRegistered !== true) {
        this._registerComboElimination(resolution);
      }
      Logger.info("Transparent ball penetration", {
        destroyed: removedTransparentBalls.length,
        floating: removedFloating.length,
        gained: gained
      });
      return resolution;
    },

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

      blastCells = this._unloadBlackHolesHitByRange(blastCells, grid, resolution, "blast");

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
      var removedFloating = grid.removeFloatingCells(
        this._filterFloatingSpiritCocoons(floatingCells, resolution)
      );
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

    _resolveMultiTrappedSpiritTargets: function (resolution, triggerCells, grid) {
      var rescueSystem = this.systems.trappedSpriteRescueSystem;
      if (!rescueSystem.isMultiTargetActive()) {
        return [];
      }
      if (!resolution || !Array.isArray(resolution.rescuedTrappedSpirits)) {
        throw new Error("Multi trapped spirit rescue requires resolution.rescuedTrappedSpirits array.");
      }
      if (!grid || typeof grid.getCells !== "function") {
        throw new Error("Multi trapped spirit rescue requires BubbleGrid.");
      }
      var rescuedTargets = rescueSystem.rescueTargetsAdjacentToCells(triggerCells);
      if (!rescuedTargets.length) {
        return [];
      }
      var completed = rescueSystem.isMultiTargetCompleted();
      var viewport = this.systems.boardViewportSystem;
      if (completed) {
        if (!viewport || typeof viewport.resetToZeroForCompletion !== "function") {
          throw new Error("Multi trapped spirit completion requires BoardViewportSystem.resetToZeroForCompletion.");
        }
        viewport.resetToZeroForCompletion();
      }
      var scorePerTarget = this._getScoreRule("trappedSpiritRescue");
      if (!Number.isInteger(scorePerTarget) || scorePerTarget !== 1000) {
        throw new Error("Multi trapped spirit rescue score must be exactly 1000 per target.");
      }
      rescuedTargets.forEach(function (target, rescuedIndex) {
        AssistSpiritConfig.getSpirit(target.spiritId);
        var worldPosition = BoardLayout.getCellPosition(
          target.row,
          target.col,
          grid.maxColumns,
          viewport.getOffsetY()
        );
        resolution.rescuedTrappedSpirits.push(target);
        resolution.scoreEvents.push({
          cellId: target.id,
          row: target.row,
          col: target.col,
          worldPosition: worldPosition,
          points: scorePerTarget,
          delayMs: 0,
          scoreKind: "trapped_spirit_rescue"
        });
        this._pushRuntimeEvent("trapped_spirit_target_rescued", {
          targetId: target.id,
          spiritId: target.spiritId,
          row: target.row,
          col: target.col,
          finalTarget: completed && rescuedIndex === rescuedTargets.length - 1
        });
      }, this);
      var rescueScore = rescuedTargets.length * scorePerTarget;
      this.score += rescueScore;
      resolution.scoreDelta += rescueScore;
      if (resolution.comboRegistered !== true) {
        this._registerComboElimination(resolution);
      }
      if (!completed) {
        return rescuedTargets;
      }

      var remainingCells = grid.getCells();
      var removedForVictory = grid.removeFloatingCells(remainingCells);
      if (removedForVictory.length !== remainingCells.length) {
        throw new Error("Multi trapped spirit completion must remove every remaining board cell.");
      }
      this._cancelPendingSplitterSpawnsForDroppedCells(removedForVictory);
      this._appendUniqueCells(resolution.floating, removedForVictory);
      this._registerResolutionDrops(removedForVictory, grid, resolution, {
        dropKind: "victory_board_drop"
      }, {
        skipEliminationPresentationHold: true
      });
      resolution.multiTrappedSpiritRescueCompleted = true;
      resolution.boardCleared = this._isBoardCleared(grid);
      if (!resolution.boardCleared) {
        throw new Error("Multi trapped spirit completion must clear the board.");
      }
      this.state = "won_pending";
      return rescuedTargets;
    },

    _finalizeWormholeAbsorbedShot: function (projectile, grid) {
      if (!projectile || !projectile.shotPlan || projectile.shotPlan.hitType !== "wormhole") {
        throw new Error("Wormhole projectile absorption requires a wormhole shot plan.");
      }
      if (projectile.targetCell) {
        throw new Error("Wormhole projectile absorption must not contain an attachment target.");
      }
      var absorptionTarget = projectile.shotPlan.absorbingWormhole;
      if (
        !absorptionTarget ||
        typeof absorptionTarget.id !== "string" ||
        !absorptionTarget.id ||
        !Number.isInteger(absorptionTarget.row) ||
        !Number.isInteger(absorptionTarget.col) ||
        !absorptionTarget.position ||
        !Number.isFinite(absorptionTarget.position.x) ||
        !Number.isFinite(absorptionTarget.position.y)
      ) {
        throw new Error("Wormhole projectile absorption requires a valid absorbingWormhole target.");
      }
      if (!projectile.shotPlan.hitPoint ||
          !Number.isFinite(projectile.shotPlan.hitPoint.x) ||
          !Number.isFinite(projectile.shotPlan.hitPoint.y)) {
        throw new Error("Wormhole projectile absorption requires a finite hitPoint.");
      }
      if (typeof grid.getWormholes !== "function") {
        throw new Error("Wormhole projectile absorption requires BubbleGrid.getWormholes.");
      }
      var liveWormholes = grid.getWormholes().filter(function (wormhole) {
        return String(wormhole.id) === absorptionTarget.id &&
          wormhole.row === absorptionTarget.row &&
          wormhole.col === absorptionTarget.col;
      });
      if (liveWormholes.length !== 1) {
        throw new Error("Wormhole projectile absorption target is not one live endpoint: " + absorptionTarget.id);
      }
      var targetPosition = grid.getCellPosition(absorptionTarget.row, absorptionTarget.col);
      if (
        Math.abs(targetPosition.x - absorptionTarget.position.x) > 0.001 ||
        Math.abs(targetPosition.y - absorptionTarget.position.y) > 0.001
      ) {
        throw new Error("Wormhole projectile absorption target position changed before finalization.");
      }

      var resolution = createEmptyResolution();
      if (!Array.isArray(resolution.wormholeProjectileAbsorptions)) {
        throw new Error("Wormhole projectile absorption requires resolution.wormholeProjectileAbsorptions.");
      }
      resolution.wormholeProjectileAbsorptions.push({
        id: "wormhole_projectile_" + this.shotsFired,
        wormholeId: absorptionTarget.id,
        row: absorptionTarget.row,
        col: absorptionTarget.col,
        startPosition: clone(projectile.shotPlan.hitPoint),
        targetPosition: clone(targetPosition),
        duration: SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration,
        ball: clone(projectile.ball)
      });
      this.lastResolution = resolution;

      var removedTransparentBalls = this._removePlannedTransparentBalls(projectile, grid);
      this._settleTransparentBallPenetration(resolution, removedTransparentBalls, grid);
      var eliminatedTransparentBall = resolution.transparentBallsDestroyed.length > 0;
      if (!eliminatedTransparentBall) {
        this._resetComboStreak();
        this._pushRuntimeEvent("shot_no_elimination");
        if (projectile.shotPlan.wallBounceCount > 0) {
          this._pushRuntimeEvent("shot_wall_bounce_no_elimination", {
            wallBounceCount: projectile.shotPlan.wallBounceCount
          });
        }
      }
      this._pushRuntimeEvent("shot_absorbed_by_wormhole", {
        wormholeId: absorptionTarget.id,
        row: absorptionTarget.row,
        col: absorptionTarget.col
      });

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;
      this.pendingShotPlan = null;
      var clearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
      if (clearedOcclusionZoneIds.length) {
        this._pushRuntimeEvent("board_occlusion_cleared", {
          reason: "shot_count",
          zoneIds: clearedOcclusionZoneIds
        });
      }

      var swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(resolution);
      var wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(resolution);
      var vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(resolution);
      if (swirlRotationStarted || wormholeShiftStarted || vineCastStarted) {
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }
      this._continueAfterVineCast(resolution);
    },

    _finalizeBlackHoleAbsorbedShot: function (projectile, grid) {
      if (!projectile || !projectile.shotPlan || projectile.shotPlan.hitType !== "black_hole") {
        throw new Error("Black hole projectile absorption requires a black_hole shot plan.");
      }
      if (projectile.targetCell) {
        throw new Error("Black hole projectile absorption must not contain an attachment target.");
      }
      var absorptionTarget = projectile.shotPlan.absorbingBlackHole;
      if (!absorptionTarget || typeof absorptionTarget.id !== "string" || !absorptionTarget.id ||
          !Number.isInteger(absorptionTarget.row) || !Number.isInteger(absorptionTarget.col)) {
        throw new Error("Black hole projectile absorption requires a valid absorbingBlackHole target.");
      }
      var liveBlackHole = grid.getCell(absorptionTarget.row, absorptionTarget.col);
      if (!isBlackHoleBall(liveBlackHole) || String(liveBlackHole.id) !== absorptionTarget.id) {
        throw new Error("Black hole projectile absorption target is not live: " + absorptionTarget.id);
      }

      var resolution = createEmptyResolution();
      var consumption = grid.consumeBlackHole(absorptionTarget.row, absorptionTarget.col);
      resolution.blackHoleProjectileAbsorptions.push({
        id: "black_hole_projectile_" + this.shotsFired,
        blackHoleId: absorptionTarget.id,
        row: absorptionTarget.row,
        col: absorptionTarget.col,
        capacityBefore: consumption.capacityBefore,
        capacityAfter: consumption.capacityAfter,
        destroyed: consumption.destroyed,
        ball: clone(projectile.ball)
      });
      this.lastResolution = resolution;

      var removedTransparentBalls = this._removePlannedTransparentBalls(projectile, grid);
      this._settleTransparentBallPenetration(resolution, removedTransparentBalls, grid);
      if (consumption.destroyed) {
        resolution.blackHolesUnloaded.push({
          id: "black_hole_unload_capacity_" + absorptionTarget.id,
          blackHoleId: absorptionTarget.id,
          row: absorptionTarget.row,
          col: absorptionTarget.col,
          capacityBefore: consumption.capacityBefore,
          sourceType: "capacity_exhausted"
        });
        var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
        var removedFloating = grid.removeFloatingCells(
          this._filterFloatingSpiritCocoons(floatingCells, resolution)
        );
        this._appendUniqueCells(resolution.floating, removedFloating);
        this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
        this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
          skipEliminationPresentationHold: true
        });
        resolution.boardCleared = this._isBoardCleared(grid);
      }
      if (resolution.transparentBallsDestroyed.length === 0) {
        this._resetComboStreak();
        this._pushRuntimeEvent("shot_no_elimination");
        if (projectile.shotPlan.wallBounceCount > 0) {
          this._pushRuntimeEvent("shot_wall_bounce_no_elimination", {
            wallBounceCount: projectile.shotPlan.wallBounceCount
          });
        }
      }
      this._pushRuntimeEvent("shot_absorbed_by_black_hole", {
        blackHoleId: absorptionTarget.id,
        row: absorptionTarget.row,
        col: absorptionTarget.col,
        capacityAfter: consumption.capacityAfter,
        destroyed: consumption.destroyed
      });

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;
      this.pendingShotPlan = null;
      var clearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
      if (clearedOcclusionZoneIds.length) {
        this._pushRuntimeEvent("board_occlusion_cleared", {
          reason: "shot_count",
          zoneIds: clearedOcclusionZoneIds
        });
      }

      var swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(resolution);
      var wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(resolution);
      var vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(resolution);
      if (swirlRotationStarted || wormholeShiftStarted || vineCastStarted) {
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }
      this._continueAfterVineCast(resolution);
    },

    _finalizePlannedShot: function () {
      if (!this.activeProjectile) {
        return;
      }

      var projectile = this.activeProjectile;
      var grid = this.systems.bubbleGrid;
      var targetCell = projectile.targetCell;
      var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;

      if (projectile.shotPlan && projectile.shotPlan.hitType === "wormhole") {
        this._finalizeWormholeAbsorbedShot(projectile, grid);
        return;
      }
      if (projectile.shotPlan && projectile.shotPlan.hitType === "black_hole") {
        this._finalizeBlackHoleAbsorbedShot(projectile, grid);
        return;
      }

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

      var removedTransparentBalls = this._removePlannedTransparentBalls(projectile, grid);

      var transparentAttachmentTarget = projectile.shotPlan
        ? projectile.shotPlan.transparentAttachmentTarget
        : null;
      if (transparentAttachmentTarget) {
        if (
          !targetCell ||
          targetCell.row !== transparentAttachmentTarget.row ||
          targetCell.col !== transparentAttachmentTarget.col
        ) {
          throw new Error("Transparent ball attachment target changed before finalization.");
        }
        if (grid.hasCell(targetCell.row, targetCell.col)) {
          throw new Error("Transparent ball attachment target remained occupied after penetration.");
        }
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
      this._settleTransparentBallPenetration(this.lastResolution, removedTransparentBalls, grid);
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
      if (!this.lastResolution.multiTrappedSpiritRescueCompleted) {
        this._resolveDirectVineImpact(projectile, grid, this.lastResolution);
      }
      if (!this.molotovResolutionPending && !this.lastResolution.multiTrappedSpiritRescueCompleted) {
        this._resolveFairyAssistsAfterResolution(this.lastResolution);
      }
      var trappedSpriteRotationStarted = !!(
        this.lastResolution.trappedSpriteRotation &&
        this.lastResolution.trappedSpriteRotation.started
      );
      var spiritCocoonStarted = this._hasPendingSpiritCocoonOpenings();
      var swirlRotationStarted = false;
      var wormholeShiftStarted = false;
      var vineCastStarted = false;
      if (trappedSpriteRotationStarted) {
        this._deferTrappedSpritePostImpactResolution(this.lastResolution);
      } else if (!spiritCocoonStarted && !this.lastResolution.multiTrappedSpiritRescueCompleted) {
        swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(this.lastResolution);
        wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(this.lastResolution);
        vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(this.lastResolution);
      }
      var postShotSpecialStarted = trappedSpriteRotationStarted || spiritCocoonStarted || swirlRotationStarted || wormholeShiftStarted || vineCastStarted;
      if (!postShotSpecialStarted && !this.molotovResolutionPending && !this.lastResolution.multiTrappedSpiritRescueCompleted) {
        this._resolveBreederPhase(this.lastResolution);
      }
      var deferredBoardShift = this.lastResolution.multiTrappedSpiritRescueCompleted
        ? false
        : (postShotSpecialStarted ? true : this._applyPostImpactBoardShiftPolicy(this.lastResolution));

      var noEliminationTriggered = !(
        this.lastResolution &&
        (
          (Array.isArray(this.lastResolution.matched) && this.lastResolution.matched.length > 0) ||
          (
            Array.isArray(this.lastResolution.transparentBallsDestroyed) &&
            this.lastResolution.transparentBallsDestroyed.length > 0
          ) ||
          (
            Array.isArray(this.lastResolution.rescuedTrappedSpirits) &&
            this.lastResolution.rescuedTrappedSpirits.length > 0
          )
        )
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
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSpiritCocoonOpenings() || this._hasPendingVineCast()) {
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
          var unsupportedRemoved = grid.removeFloatingCells(
            this._filterFloatingSpiritCocoons(unsupportedCells, resolution)
          );
          this._appendUniqueCells(resolution.floating, unsupportedRemoved);
          resolution.collected = unsupportedRemoved.slice();
          this._registerResolutionDrops(unsupportedRemoved, grid, resolution);
          this._applyResolutionDropScore(resolution, "matchedDrop");
        } else {
          this.systems.supportSystem.clearFloatingCells();
          this.systems.fallingMarbleSystem.registerDrops([], grid);
        }
        this.systems.jarCollectorSystem.collect([]);
        this._resolveMultiTrappedSpiritTargets(resolution, [attachedBubble], grid);
        resolution.boardCleared = this._isBoardCleared(grid);
        return resolution;
      }

      var removedMatches = grid.removeCells(matchedCells);
      this._registerPoisonDropletsForEliminatedCells(removedMatches, grid, resolution);
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
      var removedFloating = grid.removeFloatingCells(
        this._filterFloatingSpiritCocoons(floatingCells, resolution)
      );
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
      this._resolveMultiTrappedSpiritTargets(resolution, matchedCellsForScore, grid);

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
      if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSpiritCocoonOpenings() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast() || this._hasPendingTrappedSpritePostImpactResolution() || this.systems.trappedSpriteRescueSystem.isRotating()) {
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
