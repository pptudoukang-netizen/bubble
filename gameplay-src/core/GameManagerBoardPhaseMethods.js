"use strict";

function attachGameManagerBoardPhaseMethods(GameManager, context) {
  var BASE_SCORE_RULES = context.BASE_SCORE_RULES;
  var BOARD_ADVANCE_AFTER_IMPACT_DELAY = context.BOARD_ADVANCE_AFTER_IMPACT_DELAY;
  var BOARD_ADVANCE_DELAY_EPSILON = context.BOARD_ADVANCE_DELAY_EPSILON;
  var IMPACT_BOUNCE_PUSH_DISTANCE = context.IMPACT_BOUNCE_PUSH_DISTANCE;
  var IMPACT_BOUNCE_SPEED = context.IMPACT_BOUNCE_SPEED;
  var KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY = context.KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY;
  var Logger = context.Logger;
  var WIN_SETTLEMENT_DELAY_SEC = context.WIN_SETTLEMENT_DELAY_SEC;
  var assertFiniteNumber = context.assertFiniteNumber;

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
    pushDistance: IMPACT_BOUNCE_PUSH_DISTANCE,
    bounceSpeed: IMPACT_BOUNCE_SPEED
  };
};

GameManager.prototype._filterImpactEventSurvivors = function (impact, removedCells) {
  if (!impact) {
    return null;
  }
  if (!Array.isArray(removedCells)) {
    throw new Error("Filter impact survivors requires removedCells array.");
  }
  if (!Array.isArray(impact.neighbors)) {
    throw new Error("Impact event requires neighbors array.");
  }

  var removedIds = {};
  for (var removedIndex = 0; removedIndex < removedCells.length; removedIndex += 1) {
    var removedCell = removedCells[removedIndex];
    if (!removedCell || (typeof removedCell.id !== "string" && typeof removedCell.id !== "number")) {
      throw new Error("Filter impact survivors requires removed cell id.");
    }
    removedIds[removedCell.id] = true;
  }

  var grid = this.systems.bubbleGrid;
  var survivingNeighbors = [];
  for (var neighborIndex = 0; neighborIndex < impact.neighbors.length; neighborIndex += 1) {
    var neighbor = impact.neighbors[neighborIndex];
    if (!neighbor || (typeof neighbor.id !== "string" && typeof neighbor.id !== "number")) {
      throw new Error("Impact neighbor requires id.");
    }
    if (removedIds[neighbor.id]) {
      continue;
    }
    if (!Number.isInteger(neighbor.row) || !Number.isInteger(neighbor.col)) {
      throw new Error("Impact neighbor requires row and col.");
    }
    var liveCell = grid.getCell(neighbor.row, neighbor.col);
    if (!liveCell || liveCell.id !== neighbor.id) {
      continue;
    }
    var neighborPosition = grid.getCellPosition(neighbor.row, neighbor.col);
    survivingNeighbors.push({
      id: liveCell.id,
      row: liveCell.row,
      col: liveCell.col,
      x: neighborPosition.x,
      y: neighborPosition.y
    });
  }

  if (!survivingNeighbors.length) {
    return null;
  }

  return {
    seq: impact.seq,
    center: impact.center,
    neighbors: survivingNeighbors,
    pushDistance: impact.pushDistance,
    bounceSpeed: impact.bounceSpeed
  };
};

GameManager.prototype._applyPostImpactBoardShiftPolicy = function (resolution) {
  if (this.systems.trappedSpriteRescueSystem.isActive()) {
    return false;
  }
  if (!resolution || !resolution.impact) {
    this._ensureMinimumVisibleBoardRows(resolution);
    return false;
  }
  if (this._isWaitingBoardAdvance()) {
    throw new Error("Post-impact board shift cannot start while board advance is already pending.");
  }

  this.pendingDeferredEnsureMinimumVisibleBoardRows = true;
  this.pendingDropIntervalBoardAdvance = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(
    this._resolveBoardAdvanceSpecialAnimationDelay(resolution),
    BOARD_ADVANCE_AFTER_IMPACT_DELAY
  );
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = this._requiresBoardAdvanceEliminationPresentationWait(resolution);
  this.pendingBoardAdvanceScheduledUpdateSerial = Math.floor(assertFiniteNumber(
    this.boardAdvanceUpdateSerial,
    "GameManager boardAdvanceUpdateSerial"
  ));
  return true;
};

GameManager.prototype._flushDeferredBoardShiftAfterImpact = function () {
  if (this.pendingDeferredEnsureMinimumVisibleBoardRows) {
    this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
    this._ensureMinimumVisibleBoardRows(this.lastResolution);
  }
  this.pendingDropIntervalBoardAdvance = false;
};

GameManager.prototype._getScoreRule = function (key) {
  if (this.scoreRules && typeof this.scoreRules[key] === "number") {
    return this.scoreRules[key];
  }
  return BASE_SCORE_RULES[key] || 0;
};

GameManager.prototype._isWaitingBoardAdvance = function () {
  return this.pendingBoardAdvanceSpecialAnimationDelay > 0 ||
    this.pendingBoardAdvanceDelay > 0 ||
    this.pendingBoardAdvanceEliminationPresentation === true ||
    this.pendingDeferredEnsureMinimumVisibleBoardRows ||
    this.pendingDropIntervalBoardAdvance;
};

GameManager.prototype._hasBoardAdvancedThisFrame = function () {
  if (typeof this.boardAdvancedThisFrame !== "boolean") {
    throw new Error("GameManager boardAdvancedThisFrame must be boolean.");
  }
  return this.boardAdvancedThisFrame;
};

GameManager.prototype._markBoardAdvancedThisFrame = function () {
  this.boardAdvancedThisFrame = true;
};

GameManager.prototype._isBoardAdvanceBusy = function () {
  if (
    this.systems.trappedSpriteRescueSystem.isRotating() ||
    this._hasPendingTrappedSpritePostImpactResolution()
  ) {
    return true;
  }
  var viewport = this.systems.boardViewportSystem;
  if (viewport && typeof viewport.isMoving === "function" && viewport.isMoving()) {
    return true;
  }
  if (viewport && viewport.introActive) {
    return true;
  }
  return this._isWaitingBoardAdvance() || this._hasBoardAdvancedThisFrame();
};

GameManager.prototype._isBoardAdvanceScheduledThisUpdate = function () {
  var updateSerial = Math.floor(assertFiniteNumber(this.boardAdvanceUpdateSerial, "GameManager boardAdvanceUpdateSerial"));
  var scheduledSerial = Math.floor(assertFiniteNumber(this.pendingBoardAdvanceScheduledUpdateSerial, "GameManager pendingBoardAdvanceScheduledUpdateSerial"));
  if (updateSerial < 0) {
    throw new Error("GameManager boardAdvanceUpdateSerial must be non-negative.");
  }
  return updateSerial > 0 && scheduledSerial === updateSerial;
};

GameManager.prototype._resolveBoardAdvanceSpecialAnimationDelay = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance special animation delay requires resolution.");
  }
  if (!Array.isArray(resolution.collectedKeys)) {
    throw new Error("Board advance special animation delay requires resolution.collectedKeys array.");
  }
  if (!Array.isArray(resolution.unlockedLockedBalls)) {
    throw new Error("Board advance special animation delay requires resolution.unlockedLockedBalls array.");
  }

  if (resolution.collectedKeys.length > 0 && resolution.unlockedLockedBalls.length > 0) {
    return KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY;
  }
  return 0;
};

GameManager.prototype._requiresBoardAdvanceEliminationPresentationWait = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance elimination presentation wait requires resolution.");
  }
  if (!Array.isArray(resolution.matched)) {
    throw new Error("Board advance elimination presentation wait requires resolution.matched array.");
  }
  return resolution.matched.length > 0;
};

GameManager.prototype.notifyBoardAdvanceEliminationPresentationComplete = function (resolution) {
  if (typeof this.pendingBoardAdvanceEliminationPresentation !== "boolean") {
    throw new Error("GameManager pendingBoardAdvanceEliminationPresentation must be boolean.");
  }
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Elimination presentation completion requires resolution.");
  }
  if (typeof resolution.eliminationPresentationComplete !== "boolean") {
    throw new Error("Elimination presentation completion requires resolution.eliminationPresentationComplete boolean.");
  }
  resolution.eliminationPresentationComplete = true;
  if (resolution === this.lastResolution) {
    this.pendingBoardAdvanceEliminationPresentation = false;
    if (
      this.pendingSwirlRotationResolution === resolution &&
      this.pendingSwirlRotationWaitingForEliminationPresentation === true
    ) {
      this._startPendingSwirlRotation(resolution);
    }
  }
};

GameManager.prototype._hasPendingSplitterSpawns = function () {
  if (!Array.isArray(this.pendingSplitterSpawns)) {
    throw new Error("GameManager pendingSplitterSpawns must be an array.");
  }
  return this.pendingSplitterSpawns.length > 0;
};

GameManager.prototype._hasPendingMolotovBlasts = function () {
  if (!Array.isArray(this.pendingMolotovBlastQueue)) {
    throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
  }
  if (typeof this.molotovResolutionPending !== "boolean") {
    throw new Error("GameManager molotovResolutionPending must be a boolean.");
  }
  return this.molotovResolutionPending || this.activeMolotovBlast !== null || this.pendingMolotovBlastQueue.length > 0;
};

GameManager.prototype._hasPendingSwirlRotation = function () {
  if (typeof this.pendingSwirlRotationRemaining !== "number" || !isFinite(this.pendingSwirlRotationRemaining)) {
    throw new Error("GameManager pendingSwirlRotationRemaining must be finite.");
  }
  if (this.pendingSwirlRotationRemaining < 0) {
    throw new Error("GameManager pendingSwirlRotationRemaining must not be negative.");
  }
  if (typeof this.pendingSwirlRotationWaitingForEliminationPresentation !== "boolean") {
    throw new Error("GameManager pendingSwirlRotationWaitingForEliminationPresentation must be boolean.");
  }
  var hasResolution = this.pendingSwirlRotationResolution !== null;
  if (!hasResolution) {
    if (this.pendingSwirlRotationRemaining !== 0 || this.pendingSwirlRotationWaitingForEliminationPresentation) {
      throw new Error("GameManager idle swirl rotation must not retain pending phase state.");
    }
    return false;
  }
  if (this.pendingSwirlRotationWaitingForEliminationPresentation) {
    if (this.pendingSwirlRotationRemaining !== 0) {
      throw new Error("Swirl elimination wait must not consume rotation duration.");
    }
    return true;
  }
  if (this.pendingSwirlRotationRemaining <= 0) {
    throw new Error("Active swirl rotation requires positive remaining duration.");
  }
  return true;
};

GameManager.prototype._hasPendingWormholeShift = function () {
  if (typeof this.pendingWormholeShiftRemaining !== "number" || !isFinite(this.pendingWormholeShiftRemaining)) {
    throw new Error("GameManager pendingWormholeShiftRemaining must be finite.");
  }
  if (this.pendingWormholeShiftRemaining < 0) {
    throw new Error("GameManager pendingWormholeShiftRemaining must not be negative.");
  }
  if (this.pendingWormholeShiftRemaining > 0 && !this.pendingWormholeShiftResolution) {
    throw new Error("GameManager pending wormhole shift requires its resolution.");
  }
  return this.pendingWormholeShiftRemaining > 0;
};

GameManager.prototype._hasPendingVineCast = function () {
  if (typeof this.pendingVineCastRemaining !== "number" || !isFinite(this.pendingVineCastRemaining)) {
    throw new Error("GameManager pendingVineCastRemaining must be finite.");
  }
  if (this.pendingVineCastRemaining < 0) {
    throw new Error("GameManager pendingVineCastRemaining must not be negative.");
  }
  if (this.pendingVineCastRemaining > 0 && !this.pendingVineCastResolution) {
    throw new Error("GameManager pending vine cast requires its resolution.");
  }
  return this.pendingVineCastRemaining > 0;
};

GameManager.prototype._hasPendingTrappedSpritePostImpactResolution = function () {
  if (this.pendingTrappedSpritePostImpactResolution === null) {
    return false;
  }
  if (
    !this.pendingTrappedSpritePostImpactResolution ||
    typeof this.pendingTrappedSpritePostImpactResolution !== "object" ||
    Array.isArray(this.pendingTrappedSpritePostImpactResolution)
  ) {
    throw new Error("Pending trapped sprite post-impact resolution must be an object or null.");
  }
  if (this.pendingTrappedSpritePostImpactResolution !== this.lastResolution) {
    throw new Error("Pending trapped sprite post-impact resolution must remain lastResolution.");
  }
  if (!this.systems.trappedSpriteRescueSystem.isActive()) {
    throw new Error("Pending trapped sprite post-impact resolution requires rescue mode.");
  }
  return true;
};

GameManager.prototype._deferTrappedSpritePostImpactResolution = function (resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Trapped sprite post-impact deferral requires resolution.");
  }
  if (resolution !== this.lastResolution) {
    throw new Error("Trapped sprite post-impact deferral requires lastResolution.");
  }
  if (!this.systems.trappedSpriteRescueSystem.isRotating()) {
    throw new Error("Trapped sprite post-impact deferral requires active board rotation.");
  }
  if (this.pendingTrappedSpritePostImpactResolution !== null) {
    throw new Error("Trapped sprite post-impact resolution cannot overlap.");
  }
  if (resolution.boardCleared) {
    if (typeof this._emitTrappedSpriteRescueEvent !== "function") {
      throw new Error("Trapped sprite post-impact deferral requires rescue event emitter.");
    }
    // The board is already logically empty. Emit before the rotation and falling-ball
    // settlement so the departure animation and laughter are not hidden by WinView.
    this._emitTrappedSpriteRescueEvent();
  }
  this.pendingTrappedSpritePostImpactResolution = resolution;
};

GameManager.prototype._continueAfterTrappedSpriteImpactRotation = function () {
  if (!this._hasPendingTrappedSpritePostImpactResolution()) {
    return false;
  }
  if (this.systems.trappedSpriteRescueSystem.isRotating()) {
    return false;
  }
  if (this.molotovResolutionPending) {
    throw new Error("Trapped sprite post-impact continuation cannot overlap molotov resolution.");
  }

  var resolution = this.pendingTrappedSpritePostImpactResolution;
  this.pendingTrappedSpritePostImpactResolution = null;
  if (this._beginSwirlRotationForResolution(resolution)) {
    return true;
  }
  if (this._beginWormholeShiftForResolution(resolution)) {
    return true;
  }
  if (this._beginVineCastForResolution(resolution)) {
    return true;
  }
  this._continueAfterVineCast(resolution);
  return true;
};

GameManager.prototype._scheduleBoardAdvanceAfterImpact = function () {
  return false;
};

GameManager.prototype._updatePendingBoardAdvance = function (dt) {
  if (!this._isWaitingBoardAdvance()) {
    return false;
  }
  if (this._isBoardAdvanceScheduledThisUpdate()) {
    return false;
  }

  var safeDt = assertFiniteNumber(dt, "Pending board advance dt");
  if (safeDt < 0) {
    throw new Error("Pending board advance dt must be non-negative.");
  }
  var remainingDt = safeDt;
  if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
    var previousAnimationDelay = this.pendingBoardAdvanceSpecialAnimationDelay;
    this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(0, previousAnimationDelay - remainingDt);
    if (this.pendingBoardAdvanceSpecialAnimationDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
      this.pendingBoardAdvanceSpecialAnimationDelay = 0;
    }
    if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
      return false;
    }
    remainingDt = Math.max(0, remainingDt - previousAnimationDelay);
  }

  this.pendingBoardAdvanceDelay = Math.max(0, this.pendingBoardAdvanceDelay - remainingDt);
  if (this.pendingBoardAdvanceDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
    this.pendingBoardAdvanceDelay = 0;
  }
  if (this.pendingBoardAdvanceDelay > 0) {
    return false;
  }
  if (this.pendingBoardAdvanceEliminationPresentation === true) {
    return false;
  }

  this._flushDeferredBoardShiftAfterImpact();
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  return true;
};

GameManager.prototype._scheduleWinSettlement = function () {
  if (this.state === "won") {
    throw new Error("Cannot schedule win settlement from won state.");
  }
  if (this.pendingWinSettlementDelay > 0) {
    throw new Error("Win settlement delay is already scheduled.");
  }

  this.pendingWinSettlementDelay = WIN_SETTLEMENT_DELAY_SEC;
  this.state = "won_settlement_pending";
  Logger.info("Win settlement scheduled", {
    delaySec: WIN_SETTLEMENT_DELAY_SEC
  });
};

GameManager.prototype._updatePendingWinSettlement = function (dt) {
  if (this.state !== "won_settlement_pending") {
    return false;
  }
  if (this.pendingWinSettlementDelay <= 0) {
    throw new Error("won_settlement_pending requires positive pendingWinSettlementDelay.");
  }

  var safeDt = Math.max(0, Number(dt) || 0);
  this.pendingWinSettlementDelay = Math.max(0, this.pendingWinSettlementDelay - safeDt);
  if (this.pendingWinSettlementDelay > 0) {
    return false;
  }

  this.state = "won";
  if (typeof this._pushRuntimeEvent === "function") {
    this._pushRuntimeEvent("win_settlement_ready", {});
  }
  Logger.info("Win settlement delay finished");
  return true;
};
}

module.exports = attachGameManagerBoardPhaseMethods;
