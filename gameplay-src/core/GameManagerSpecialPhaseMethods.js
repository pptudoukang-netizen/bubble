"use strict";

function attachGameManagerSpecialPhaseMethods(GameManager, context) {
  var BubbleGrid = context.BubbleGrid;
  var SPLITTER_SPAWN_DELAY_SEC = context.SPLITTER_SPAWN_DELAY_SEC;
  var SWIRL_ROTATION_DURATION = context.SWIRL_ROTATION_DURATION;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var VINE_CAST_PREVIEW_DURATION = context.VINE_CAST_PREVIEW_DURATION;
  var VINE_CAST_SHOT_INTERVAL = context.VINE_CAST_SHOT_INTERVAL;
  var WORMHOLE_SHIFT_DURATION = context.WORMHOLE_SHIFT_DURATION;
  var assertFiniteNumber = context.assertFiniteNumber;
  var isSwirlBall = context.isSwirlBall;
  var isWormholeBall = context.isWormholeBall;

GameManager.prototype._beginVineCastForResolution = function (resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Vine cast requires resolution.");
  }
  if (typeof resolution.vineCastEvaluated !== "boolean") {
    throw new Error("Vine cast requires resolution.vineCastEvaluated boolean.");
  }
  if (!Array.isArray(resolution.vineCasts)) {
    throw new Error("Vine cast requires resolution.vineCasts array.");
  }
  if (this._hasPendingVineCast() || this.pendingVineCastResolution !== null) {
    throw new Error("Vine cast cannot start while another cast is pending.");
  }
  if (resolution.vineCastEvaluated) {
    return false;
  }
  resolution.vineCastEvaluated = true;
  if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
    throw new Error("Vine cast evaluation requires positive shotsFired.");
  }
  if (this.shotsFired % VINE_CAST_SHOT_INTERVAL !== 0) {
    return false;
  }

  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getVineSpirits !== "function") {
    throw new Error("Vine cast requires BubbleGrid.getVineSpirits.");
  }
  if (typeof grid.findNearestNormalCellForVine !== "function" || typeof grid.beginVinePreview !== "function") {
    throw new Error("Vine cast requires BubbleGrid vine target and preview methods.");
  }
  var spirits = grid.getVineSpirits();
  if (!spirits.length) {
    return false;
  }

  var reservedCellKeys = {};
  spirits.forEach(function (spirit) {
    var target = grid.findNearestNormalCellForVine(spirit, reservedCellKeys);
    if (!target) {
      return;
    }
    var targetKey = target.row + ":" + target.col;
    reservedCellKeys[targetKey] = true;
    grid.beginVinePreview(spirit.id, target);
    resolution.vineCasts.push({
      id: "vine_cast_" + this.shotsFired + "_" + spirit.id,
      spiritId: spirit.id,
      spiritRow: spirit.row,
      spiritCol: spirit.col,
      targetId: target.id,
      targetRow: target.row,
      targetCol: target.col,
      duration: VINE_CAST_PREVIEW_DURATION,
      completed: false
    });
  }, this);
  if (!resolution.vineCasts.length) {
    return false;
  }

  this.pendingVineCastRemaining = VINE_CAST_PREVIEW_DURATION;
  this.pendingVineCastResolution = resolution;
  this._pushRuntimeEvent("vine_entanglement_started", {
    count: resolution.vineCasts.length
  });
  return true;
};

GameManager.prototype._beginSwirlRotationForResolution = function (resolution) {
  if (!resolution) {
    throw new Error("Swirl rotation requires resolution.");
  }
  if (this._hasPendingSwirlRotation() || this.pendingSwirlRotationResolution !== null) {
    throw new Error("Swirl rotation cannot start while another rotation is pending.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getCells !== "function") {
    throw new Error("Swirl rotation requires BubbleGrid.getCells.");
  }
  var centers = grid.getCells().filter(isSwirlBall).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.col !== right.col) {
      return left.col - right.col;
    }
    return String(left.id).localeCompare(String(right.id));
  });
  if (!centers.length) {
    return false;
  }
  if (typeof grid.rotateSwirlNeighborsClockwise !== "function") {
    throw new Error("Swirl rotation requires BubbleGrid.rotateSwirlNeighborsClockwise.");
  }
  if (!Array.isArray(resolution.swirlRotations)) {
    throw new Error("Swirl rotation requires resolution.swirlRotations.");
  }

  centers.forEach(function (center) {
    var moves = grid.rotateSwirlNeighborsClockwise(center);
    if (!moves.length) {
      return;
    }
    resolution.swirlRotations.push({
      id: "swirl_" + this.shotsFired + "_" + center.id,
      centerId: center.id,
      centerRow: center.row,
      centerCol: center.col,
      duration: SWIRL_ROTATION_DURATION,
      angleDegrees: SpecialAnimationTiming.swirlRotation.angleDegrees,
      moves: moves
    });
  }, this);
  if (!resolution.swirlRotations.length) {
    return false;
  }
  this.pendingSwirlRotationRemaining = SWIRL_ROTATION_DURATION;
  this.pendingSwirlRotationResolution = resolution;
  return true;
};

GameManager.prototype._beginWormholeShiftForResolution = function (resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Wormhole shift requires resolution.");
  }
  if (this._hasPendingWormholeShift() || this.pendingWormholeShiftResolution !== null) {
    throw new Error("Wormhole shift cannot start while another shift is pending.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getSpecialEntities !== "function") {
    throw new Error("Wormhole shift requires BubbleGrid.getSpecialEntities.");
  }
  var wormholes = grid.getSpecialEntities().filter(isWormholeBall);
  if (!wormholes.length) {
    return false;
  }
  if (typeof grid.shiftWormholeInteriors !== "function") {
    throw new Error("Wormhole shift requires BubbleGrid.shiftWormholeInteriors.");
  }
  if (!Array.isArray(resolution.wormholeShifts)) {
    throw new Error("Wormhole shift requires resolution.wormholeShifts.");
  }
  var shifts = grid.shiftWormholeInteriors();
  if (!Array.isArray(shifts) || !shifts.length) {
    throw new Error("BubbleGrid.shiftWormholeInteriors must return live pair shifts.");
  }
  shifts.forEach(function (shift, shiftIndex) {
    if (!shift || !Array.isArray(shift.moves)) {
      throw new Error("Wormhole shift result requires moves array.");
    }
    shift.moves.forEach(function (move) {
      if (!move || move.entityType !== "splitter") {
        return;
      }
      this.pendingSplitterSpawns.forEach(function (pending) {
        if (String(pending.id) === move.cellId) {
          pending.row = move.toRow;
          pending.col = move.toCol;
        }
      });
      resolution.reactiveTriggered.forEach(function (triggered) {
        if (triggered && String(triggered.id) === move.cellId) {
          triggered.row = move.toRow;
          triggered.col = move.toCol;
        }
      });
    }, this);
    resolution.wormholeShifts.push({
      id: "wormhole_" + this.shotsFired + "_" + shiftIndex,
      row: shift.row,
      leftWormholeId: shift.leftWormholeId,
      leftCol: shift.leftCol,
      rightWormholeId: shift.rightWormholeId,
      rightCol: shift.rightCol,
      moveDirection: shift.moveDirection,
      slotCount: shift.slotCount,
      duration: WORMHOLE_SHIFT_DURATION,
      moves: shift.moves
    });
  }, this);
  this.pendingWormholeShiftRemaining = WORMHOLE_SHIFT_DURATION;
  this.pendingWormholeShiftResolution = resolution;
  return true;
};

GameManager.prototype._scoreSwirlFloatingDrops = function (resolution, cells) {
  if (!resolution || !Array.isArray(cells)) {
    throw new Error("Swirl floating score requires resolution and cells.");
  }
  if (!cells.length) {
    return 0;
  }
  var scorePerBall = this._getScoreRule("floatingDrop");
  if (!Number.isInteger(scorePerBall) || scorePerBall < 0) {
    throw new Error("Swirl floating drop score must be a non-negative integer.");
  }
  var gained = cells.length * scorePerBall;
  this.score += gained;
  resolution.scoreDelta += gained;
  return gained;
};

GameManager.prototype._continueAfterSwirlRotation = function (resolution) {
  if (!resolution) {
    throw new Error("Swirl completion requires resolution.");
  }
  if (this._beginWormholeShiftForResolution(resolution)) {
    return;
  }
  if (this._beginVineCastForResolution(resolution)) {
    return;
  }
  this._continueAfterVineCast(resolution);
};

GameManager.prototype._continueAfterWormholeShift = function (resolution) {
  if (!resolution) {
    throw new Error("Wormhole completion requires resolution.");
  }
  if (this._beginVineCastForResolution(resolution)) {
    return;
  }
  this._continueAfterVineCast(resolution);
};

GameManager.prototype._continueAfterVineCast = function (resolution) {
  if (!resolution) {
    throw new Error("Vine cast completion requires resolution.");
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
    if (
      this.systems.fallingMarbleSystem.hasActiveDrops() ||
      this._isBoardAdvanceBusy() ||
      this._hasPendingSplitterSpawns() ||
      this._hasPendingMolotovBlasts() ||
      this._hasPendingVineCast()
    ) {
      this.state = "out_of_shots_pending";
    } else {
      this._showOutOfShotsAddBallPrompt();
    }
  }
};

GameManager.prototype._updatePendingVineCast = function (dt) {
  if (!this._hasPendingVineCast()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending vine cast dt");
  if (safeDt < 0) {
    throw new Error("Pending vine cast dt must not be negative.");
  }
  this.pendingVineCastRemaining = Math.max(0, this.pendingVineCastRemaining - safeDt);
  if (this.pendingVineCastRemaining > 0) {
    return false;
  }

  var resolution = this.pendingVineCastResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending vine cast resolution must remain lastResolution.");
  }
  if (!Array.isArray(resolution.vineCasts) || !resolution.vineCasts.length) {
    throw new Error("Pending vine cast requires non-empty resolution.vineCasts.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.completeVineEntanglement !== "function") {
    throw new Error("Pending vine cast requires BubbleGrid.completeVineEntanglement.");
  }
  resolution.vineCasts.forEach(function (cast) {
    if (!cast || cast.completed !== false) {
      throw new Error("Pending vine cast entry must be incomplete.");
    }
    var entangled = grid.completeVineEntanglement(cast.spiritId, {
      row: cast.targetRow,
      col: cast.targetCol
    });
    if (!entangled || entangled.vineOwnerId !== cast.spiritId) {
      throw new Error("Vine cast completion failed to entangle its target.");
    }
    cast.completed = true;
  });
  this.pendingVineCastResolution = null;
  this._continueAfterVineCast(resolution);
  return true;
};

GameManager.prototype._updatePendingSwirlRotation = function (dt) {
  if (!this._hasPendingSwirlRotation()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending swirl rotation dt");
  if (safeDt < 0) {
    throw new Error("Pending swirl rotation dt must not be negative.");
  }
  this.pendingSwirlRotationRemaining = Math.max(0, this.pendingSwirlRotationRemaining - safeDt);
  if (this.pendingSwirlRotationRemaining > 0) {
    return false;
  }

  var resolution = this.pendingSwirlRotationResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending swirl rotation resolution must remain lastResolution.");
  }
  var grid = this.systems.bubbleGrid;
  var newlyFloating = [];
  while (true) {
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    if (!floatingCells.length) {
      break;
    }
    var removedFloating = grid.removeFloatingCells(floatingCells);
    if (!removedFloating.length) {
      throw new Error("Swirl connection scan found cells that could not be removed.");
    }
    this._appendUniqueCells(newlyFloating, removedFloating);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
    this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
    this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
      skipEliminationPresentationHold: true
    });
    this.systems.jarCollectorSystem.collect([]);
  }
  this._appendUniqueCells(resolution.collected, newlyFloating);
  this._scoreSwirlFloatingDrops(resolution, newlyFloating);
  resolution.boardCleared = this._isBoardCleared(grid);
  this.pendingSwirlRotationResolution = null;
  this._continueAfterSwirlRotation(resolution);
  return true;
};

GameManager.prototype._updatePendingWormholeShift = function (dt) {
  if (!this._hasPendingWormholeShift()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending wormhole shift dt");
  if (safeDt < 0) {
    throw new Error("Pending wormhole shift dt must not be negative.");
  }
  this.pendingWormholeShiftRemaining = Math.max(0, this.pendingWormholeShiftRemaining - safeDt);
  if (this.pendingWormholeShiftRemaining > 0) {
    return false;
  }
  var resolution = this.pendingWormholeShiftResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending wormhole shift resolution must remain lastResolution.");
  }
  var grid = this.systems.bubbleGrid;
  var newlyFloating = [];
  while (true) {
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    if (!floatingCells.length) {
      break;
    }
    var removedFloating = grid.removeFloatingCells(floatingCells);
    if (!removedFloating.length) {
      throw new Error("Wormhole support scan found cells that could not be removed.");
    }
    this._appendUniqueCells(newlyFloating, removedFloating);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
    this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
    this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
      skipEliminationPresentationHold: true
    });
    this.systems.jarCollectorSystem.collect([]);
  }
  this._appendUniqueCells(resolution.collected, newlyFloating);
  this._scoreSwirlFloatingDrops(resolution, newlyFloating);
  resolution.boardCleared = this._isBoardCleared(grid);
  this.pendingWormholeShiftResolution = null;
  this._continueAfterWormholeShift(resolution);
  return true;
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
  if (this.state === "won_pending" && !this._isBoardCleared(grid)) {
    this.state = "running";
  }
  this._ensureMinimumVisibleBoardRows(this.lastResolution);
  if (this.state === "out_of_shots_pending" && !this.systems.fallingMarbleSystem.hasActiveDrops() && !this._hasPendingSplitterSpawns() && !this._hasPendingMolotovBlasts() && !this._hasPendingSwirlRotation() && !this._hasPendingWormholeShift() && !this._hasPendingVineCast() && !this._isBoardAdvanceBusy()) {
    this._showOutOfShotsAddBallPrompt();
  }
  if (grid && typeof grid.assertNoVisualOverlap === "function") {
    grid.assertNoVisualOverlap("pending splitter spawn");
  }
  return true;
};
}

module.exports = attachGameManagerSpecialPhaseMethods;
