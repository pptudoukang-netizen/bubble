"use strict";

function createGameManagerShotMolotovMethods(context) {
  var MOLOTOV_BLAST_ANIMATION_DURATION = context.MOLOTOV_BLAST_ANIMATION_DURATION;
  var MOLOTOV_BLAST_TRIGGER_DELAY = context.MOLOTOV_BLAST_TRIGGER_DELAY;
  var appendMolotovEliminationSequence = context.appendMolotovEliminationSequence;
  var buildMolotovBlastDropVelocity = context.buildMolotovBlastDropVelocity;
  var buildTriggeredSplitterIdsFromPendingSpawns = context.buildTriggeredSplitterIdsFromPendingSpawns;
  var createGameManagerShotMolotovMethods = context.createGameManagerShotMolotovMethods;
  var isLockedBall = context.isLockedBall;
  var isMolotovBall = context.isMolotovBall;
  var isVineEntangledBall = context.isVineEntangledBall;
  var isVineSpiritBall = context.isVineSpiritBall;

  return {
    _resetMolotovBlastSequence: function () {
      this.pendingMolotovBlastQueue = [];
      this.activeMolotovBlast = null;
      this.molotovBlastTriggeredIds = {};
    },

    _queueMolotovBlasts: function (molotovs, resolution) {
      if (!Array.isArray(molotovs)) {
        throw new Error("Molotov blast queue requires molotovs array.");
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast queue requires resolution.reactiveTriggered.");
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue)) {
        throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
      }
      if (!this.molotovBlastTriggeredIds || typeof this.molotovBlastTriggeredIds !== "object") {
        throw new Error("GameManager molotovBlastTriggeredIds must be an object.");
      }

      molotovs.forEach(function (molotov) {
        if (!molotov || (typeof molotov.id !== "string" && typeof molotov.id !== "number")) {
          throw new Error("Molotov blast queue requires molotov id.");
        }
        if (this.molotovBlastTriggeredIds[molotov.id]) {
          return;
        }
        var radius = molotov.blastRadius;
        if (!Number.isInteger(radius) || radius !== 2) {
          throw new Error("Molotov blastRadius must be 2.");
        }
        if (!Number.isInteger(molotov.row) || !Number.isInteger(molotov.col)) {
          throw new Error("Molotov blast queue requires molotov coordinates.");
        }
        this.molotovBlastTriggeredIds[molotov.id] = true;
        this.pendingMolotovBlastQueue.push({
          id: molotov.id,
          row: molotov.row,
          col: molotov.col,
          blastRadius: radius
        });
      }, this);

      this._startNextMolotovBlastIfIdle(resolution);
    },

    _startNextMolotovBlastIfIdle: function (resolution) {
      if (this.activeMolotovBlast) {
        return;
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue) || !this.pendingMolotovBlastQueue.length) {
        return;
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast start requires resolution.reactiveTriggered.");
      }

      var next = this.pendingMolotovBlastQueue.shift();
      if (!next || (typeof next.id !== "string" && typeof next.id !== "number")) {
        throw new Error("Molotov blast start requires pending entry id.");
      }
      if (!Number.isInteger(next.row) || !Number.isInteger(next.col)) {
        throw new Error("Molotov blast start requires pending entry coordinates.");
      }
      if (!Number.isInteger(next.blastRadius) || next.blastRadius !== 2) {
        throw new Error("Molotov blast start requires blastRadius 2.");
      }

      this.activeMolotovBlast = {
        id: next.id,
        row: next.row,
        col: next.col,
        blastRadius: next.blastRadius,
        elapsed: 0,
        blastExecuted: false,
        completeExecuted: false
      };
      resolution.reactiveTriggered.push({
        id: next.id,
        entityType: "molotov",
        row: next.row,
        col: next.col
      });
      this._pushBombExplosionEvent();
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _executeMolotovBlastPhaseAtAnimationStart: function (resolution) {
      if (MOLOTOV_BLAST_TRIGGER_DELAY !== 0) {
        return false;
      }
      if (!this.activeMolotovBlast || this.activeMolotovBlast.blastExecuted) {
        return false;
      }
      if (!this.molotovPendingResolutionContext) {
        return false;
      }
      this.activeMolotovBlast.blastExecuted = true;
      this._executeMolotovBlastPhase(this.activeMolotovBlast, this.systems.bubbleGrid, resolution);
      return true;
    },

    _executeMolotovBlastPhase: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast phase requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast phase requires active blast coordinates.");
      }
      if (!Number.isInteger(active.blastRadius) || active.blastRadius !== 2) {
        throw new Error("Molotov blast phase requires blastRadius 2.");
      }
      if (!resolution) {
        throw new Error("Molotov blast phase requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast phase requires molotovPendingResolutionContext.allRemoved.");
      }

      var blastCells = [];
      grid.getCoordinatesWithinRadius(active.row, active.col, active.blastRadius).forEach(function (coord) {
        if (coord.distance === 0) {
          return;
        }
        var occupiedCell = grid.getCell(coord.row, coord.col);
        if (!occupiedCell || isLockedBall(occupiedCell)) {
          return;
        }
        blastCells.push(occupiedCell);
      });

      this._resolveVineSpiritsHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedByBlast = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedByBlast, grid, resolution);
      appendMolotovEliminationSequence(resolution, removedByBlast, grid);
      this._pushBubbleBreakEvent(removedByBlast, resolution.eliminationSequence);
      removedByBlast.forEach(function (cell) {
        cell.__molotovBlastVelocity = buildMolotovBlastDropVelocity(active, cell, grid);
      });

      var removedKeys = this._triggerKeysAndResolveUnlocks(removedByBlast, grid, resolution);
      var triggeredSplitterIds = this.molotovPendingResolutionContext.triggeredSplitterIds;
      if (!triggeredSplitterIds || typeof triggeredSplitterIds !== "object" || Array.isArray(triggeredSplitterIds)) {
        throw new Error("Molotov blast phase requires context.triggeredSplitterIds.");
      }
      this._triggerAdjacentSplitters(removedByBlast, grid, resolution, triggeredSplitterIds);

      var chainMolotovs = this._collectAdjacentMolotovs(removedByBlast, grid, this.molotovBlastTriggeredIds);
      this._queueMolotovBlasts(chainMolotovs, resolution);

      var removedSourceMolotov = [];
      var liveSourceMolotov = grid.getCell(active.row, active.col);
      if (liveSourceMolotov) {
        if (!isMolotovBall(liveSourceMolotov)) {
          throw new Error("Molotov blast source cell is not molotov.");
        }
        removedSourceMolotov = grid.removeCells([liveSourceMolotov]);
        this._resolveVinesAfterRemoval(removedSourceMolotov, grid, resolution);
        appendMolotovEliminationSequence(resolution, removedSourceMolotov, grid);
        this._pushBubbleBreakEvent(removedSourceMolotov, resolution.eliminationSequence);
        this._registerMatchedObjectiveCollection(removedSourceMolotov, resolution.eliminationSequence, resolution, grid);
      }

      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedKeys);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedByBlast);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedSourceMolotov);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedByBlast.concat(removedKeys).concat(removedSourceMolotov));
      this._registerResolutionDrops(
        removedByBlast.concat(removedKeys),
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved.slice()
        }
      );

      resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
      this._registerMatchedObjectiveCollection(removedByBlast, resolution.eliminationSequence, resolution, grid);
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
    },

    _completeMolotovBlast: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast completion requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast completion requires active blast coordinates.");
      }
      if (!resolution) {
        throw new Error("Molotov blast completion requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast completion requires molotovPendingResolutionContext.allRemoved.");
      }

      var liveMolotov = grid.getCell(active.row, active.col);
      if (liveMolotov) {
        if (!isMolotovBall(liveMolotov)) {
          throw new Error("Molotov blast completion cell is not molotov.");
        }
        var removedMolotov = grid.removeCells([liveMolotov]);
        appendMolotovEliminationSequence(resolution, removedMolotov, grid);
        this._pushBubbleBreakEvent(removedMolotov, resolution.eliminationSequence);
        this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedMolotov);
        resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
        resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
        this._registerMatchedObjectiveCollection(removedMolotov, resolution.eliminationSequence, resolution, grid);
        this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
      }
    },

    _updatePendingMolotovBlasts: function (dt) {
      if (!this._hasPendingMolotovBlasts()) {
        return false;
      }
      if (this._isBoardAdvanceBusy()) {
        return false;
      }

      var safeDt = Number(dt);
      if (!Number.isFinite(safeDt) || safeDt < 0) {
        throw new Error("Pending molotov blast update requires non-negative finite dt.");
      }
      if (!this.lastResolution) {
        throw new Error("Pending molotov blast update requires lastResolution.");
      }

      var grid = this.systems.bubbleGrid;
      var resolution = this.lastResolution;
      var updated = false;

      if (!this.activeMolotovBlast) {
        if (!this.pendingMolotovBlastQueue.length && this.molotovResolutionPending) {
          this._finalizeMolotovPendingResolution();
          return true;
        }
        this._startNextMolotovBlastIfIdle(resolution);
        return !!this.activeMolotovBlast;
      }

      var active = this.activeMolotovBlast;
      active.elapsed += safeDt;

      if (!active.blastExecuted && active.elapsed >= MOLOTOV_BLAST_TRIGGER_DELAY) {
        active.blastExecuted = true;
        this._executeMolotovBlastPhase(active, grid, resolution);
        updated = true;
      }

      if (!active.completeExecuted && active.elapsed >= MOLOTOV_BLAST_ANIMATION_DURATION) {
        active.completeExecuted = true;
        this._completeMolotovBlast(active, grid, resolution);
        this.activeMolotovBlast = null;
        updated = true;

        if (this.pendingMolotovBlastQueue.length) {
          this._startNextMolotovBlastIfIdle(resolution);
        } else {
          this._finalizeMolotovPendingResolution();
        }
      }

      if (grid && typeof grid.assertNoVisualOverlap === "function") {
        grid.assertNoVisualOverlap("pending molotov blast");
      }
      return updated;
    },

    _beginMolotovPendingResolution: function (resolution, dropScoreRuleKey, syncRemoved) {
      if (!resolution) {
        throw new Error("Molotov pending resolution requires resolution.");
      }
      if (typeof dropScoreRuleKey !== "string" || !dropScoreRuleKey) {
        throw new Error("Molotov pending resolution requires dropScoreRuleKey.");
      }
      if (!Array.isArray(syncRemoved)) {
        throw new Error("Molotov pending resolution requires syncRemoved array.");
      }

      this.molotovResolutionPending = true;
      this.molotovPendingResolutionContext = {
        dropScoreRuleKey: dropScoreRuleKey,
        allRemoved: syncRemoved.slice(),
        triggeredSplitterIds: {}
      };

      this._cancelPendingSplitterSpawnsForDroppedCells(syncRemoved);
      this.molotovPendingResolutionContext.triggeredSplitterIds = buildTriggeredSplitterIdsFromPendingSpawns(this.pendingSplitterSpawns);
      this.systems.jarCollectorSystem.collect([]);

      appendMolotovEliminationSequence(resolution, syncRemoved, this.systems.bubbleGrid);
      this._pushBubbleBreakEvent(syncRemoved, resolution.eliminationSequence);
      resolution.matched = syncRemoved.slice();
      resolution.collected = syncRemoved.slice();
      this._registerMatchedObjectiveCollection(
        syncRemoved,
        resolution.eliminationSequence,
        resolution,
        this.systems.bubbleGrid
      );
      resolution.boardCleared = false;
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _resolveMolotovFloatingAfterBoardMutation: function (grid, resolution) {
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov floating resolution requires molotovPendingResolutionContext.allRemoved.");
      }
      if (!grid || typeof grid.removeCells !== "function") {
        throw new Error("Molotov floating resolution requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.floating)) {
        throw new Error("Molotov floating resolution requires resolution.floating array.");
      }
      if (!this.systems.supportSystem || typeof this.systems.supportSystem.findFloatingCells !== "function") {
        throw new Error("Molotov floating resolution requires supportSystem.findFloatingCells.");
      }

      var removedAllFloating = [];
      while (true) {
        if (Array.isArray(resolution.collectedKeys) && resolution.collectedKeys.length) {
          this._resolveCollectedKeyUnlocks(grid, resolution);
        }

        var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
        if (!floatingCells.length) {
          break;
        }
        var removedFloating = grid.removeFloatingCells(floatingCells);
        if (!removedFloating.length) {
          throw new Error("Molotov floating resolution found cells that could not be removed.");
        }

        this._appendUniqueCells(removedAllFloating, removedFloating);
        this._appendUniqueCells(resolution.floating, removedFloating);
        this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
        this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
        this._removeSpawnedSplitterEntriesForCells(removedFloating, resolution);
        this._registerResolutionDrops(
          removedFloating,
          grid,
          resolution,
          undefined,
          {
            matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved
          }
        );
        this.systems.jarCollectorSystem.collect([]);
      }
      if (!removedAllFloating.length) {
        return [];
      }
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.concat(resolution.floating);
      return removedAllFloating;
    },

    _finalizeMolotovPendingResolution: function () {
      if (!this.molotovResolutionPending) {
        return;
      }
      var context = this.molotovPendingResolutionContext;
      if (!context || !Array.isArray(context.allRemoved)) {
        throw new Error("Molotov pending resolution finalize requires context.allRemoved.");
      }
      if (typeof context.dropScoreRuleKey !== "string" || !context.dropScoreRuleKey) {
        throw new Error("Molotov pending resolution finalize requires dropScoreRuleKey.");
      }
      if (!this.lastResolution) {
        throw new Error("Molotov pending resolution finalize requires lastResolution.");
      }

      var resolution = this.lastResolution;
      var grid = this.systems.bubbleGrid;
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);

      resolution.matched = context.allRemoved.slice();
      resolution.collected = context.allRemoved.concat(resolution.floating);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, context.dropScoreRuleKey);
      this._registerComboElimination(resolution);

      this.molotovResolutionPending = false;
      this.molotovPendingResolutionContext = null;
      this._resolveFairyAssistsAfterResolution(resolution);

      if (this._beginSwirlRotationForResolution(resolution)) {
        return;
      }
      if (this._beginWormholeShiftForResolution(resolution)) {
        return;
      }
      if (this._beginVineCastForResolution(resolution)) {
        return;
      }

      if (resolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }
      if (this._tryTopAnchorCollapse()) {
        return;
      }
      var eliminationPresentationWasComplete = this.pendingBoardAdvanceEliminationPresentation === false;
      if (this._applyPostImpactBoardShiftPolicy(resolution)) {
        if (eliminationPresentationWasComplete) {
          this.notifyBoardAdvanceEliminationPresentationComplete();
        }
        return;
      }
      if (this._scheduleBoardAdvanceAfterImpact()) {
        return;
      }
      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
      }
    }
  };
}

module.exports = createGameManagerShotMolotovMethods;
