"use strict";

function attachLevelRendererSceneFloatingScoreMethods(LevelRenderer, context) {
  var BALL_SCORE_FADE_IN_DURATION = context.BALL_SCORE_FADE_IN_DURATION;
  var BALL_SCORE_FADE_OUT_RISE_DURATION = context.BALL_SCORE_FADE_OUT_RISE_DURATION;
  var BALL_SCORE_HOLD_DURATION = context.BALL_SCORE_HOLD_DURATION;
  var BALL_SCORE_RISE_DISTANCE = context.BALL_SCORE_RISE_DISTANCE;
  var BALL_SCORE_Z_INDEX = context.BALL_SCORE_Z_INDEX;
  var BoardLayout = context.BoardLayout;
  var SCHEDULE_ONCE_REPEAT = context.SCHEDULE_ONCE_REPEAT;
  var attachLevelRendererSceneFloatingScoreMethods = context.attachLevelRendererSceneFloatingScoreMethods;
  var requireDirectorScheduler = context.requireDirectorScheduler;

LevelRenderer.prototype._initializeFractionHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for fraction HUD.");
  }

  var fractionNode = gameViewNode.getChildByName("fraction");
  if (!fractionNode || !fractionNode.isValid) {
    throw new Error("GameView.fraction node is missing.");
  }

  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("GameView.fraction label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Fraction HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.active = false;
  fractionNode.opacity = 255;
  fractionNode.setScale(1, 1);
  fractionLabel.string = "+0";
  this.jarFractionDisplayGeneration += 1;
  this.lastJarCollectScoredEvent = null;
  this._recycleJarFractionNodesBeforeHudClear();
};

LevelRenderer.prototype._initializeBallScoreHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for ball score HUD.");
  }

  var templateNode = gameViewNode.getChildByName("ball_score");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score node is missing.");
  }

  var scoreLabel = templateNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("GameView.ball_score label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(templateNode);
  templateNode.active = false;
  templateNode.opacity = 255;
  templateNode.setScale(1, 1);
  scoreLabel.string = "+0";
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
  this.playedTimeBonusAwardedEvents = [];
  this._pruneBallScoreNodePool();
};

LevelRenderer.prototype._pruneBallScoreNodePool = function () {
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  this.ballScoreNodePool = this.ballScoreNodePool.filter(function (node) {
    return !!(node && node.isValid);
  });
};

LevelRenderer.prototype._cancelPendingBallScoreSchedules = function () {
  if (!this.pendingBallScoreCallbacks || typeof this.pendingBallScoreCallbacks !== "object") {
    throw new Error("pendingBallScoreCallbacks must be an object.");
  }

  var pendingCellIds = Object.keys(this.pendingBallScoreCallbacks);
  if (!pendingCellIds.length) {
    this.pendingBallScoreCellIds = {};
    return;
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to cancel ball score schedules.");
  }

  var scheduler = requireDirectorScheduler("Ball score pending schedule cancel");
  for (var index = 0; index < pendingCellIds.length; index += 1) {
    var cellId = pendingCellIds[index];
    scheduler.unschedule(this.pendingBallScoreCallbacks[cellId], gameViewNode);
  }
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
};

LevelRenderer.prototype._recycleBallScoreNode = function (scoreNode) {
  if (!scoreNode || !scoreNode.isValid) {
    throw new Error("Ball score recycle requires a valid node.");
  }
  if (scoreNode.__isBallScoreClone !== true) {
    throw new Error("Ball score recycle requires pooled clone node.");
  }
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score recycle requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(scoreNode);
  scoreNode.active = false;
  scoreNode.opacity = 255;
  scoreNode.setScale(1, 1);
  var scoreLabel = scoreNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("Ball score recycle requires cc.Label.");
  }
  scoreLabel.string = "+0";
  scoreNode.removeFromParent(false);
  this.ballScoreNodePool.push(scoreNode);
};

LevelRenderer.prototype._recycleBallScoreNodesBeforeHudClear = function () {
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }

  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    var children = gameViewNode.children.slice();
    for (var index = 0; index < children.length; index += 1) {
      var childNode = children[index];
      if (!childNode || !childNode.isValid || childNode.__isBallScoreClone !== true) {
        continue;
      }
      this._recycleBallScoreNode(childNode);
    }
  }

  this._pruneBallScoreNodePool();
};

LevelRenderer.prototype._resetBallScoreHudBeforeHudClear = function () {
  this._cancelPendingBallScoreSchedules();
  this._recycleBallScoreNodesBeforeHudClear();
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.playedTimeBonusAwardedEvents = [];
};

LevelRenderer.prototype._acquireBallScoreNode = function (gameViewNode, templateNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to acquire ball score node.");
  }
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score template node is required.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Ball score display requires cc.instantiate.");
  }
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score acquire requires cc.Tween.stopAllByTarget.");
  }

  this._pruneBallScoreNodePool();
  var scoreNode = this.ballScoreNodePool.length ? this.ballScoreNodePool.pop() : null;
  if (!scoreNode) {
    scoreNode = cc.instantiate(templateNode);
    scoreNode.__isBallScoreClone = true;
  }
  if (!scoreNode.isValid) {
    throw new Error("Ball score pooled node is invalid.");
  }
  if (scoreNode.__isBallScoreClone !== true) {
    throw new Error("Ball score pooled node must be marked as clone.");
  }

  cc.Tween.stopAllByTarget(scoreNode);
  scoreNode.parent = gameViewNode;
  scoreNode.active = true;
  scoreNode.opacity = 0;
  scoreNode.setScale(1, 1);
  scoreNode.zIndex = BALL_SCORE_Z_INDEX;
  return scoreNode;
};

LevelRenderer.prototype._findBallScoreSequenceEntry = function (resolution, cellId, eventIndex) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Ball score sequence lookup requires resolution.");
  }
  if (!Array.isArray(resolution.eliminationSequence)) {
    throw new Error("Ball score display requires eliminationSequence array.");
  }
  if (
    Number.isInteger(eventIndex) &&
    eventIndex >= 0 &&
    eventIndex < resolution.eliminationSequence.length
  ) {
    var indexedEntry = resolution.eliminationSequence[eventIndex];
    if (!indexedEntry || typeof indexedEntry !== "object" || Array.isArray(indexedEntry)) {
      throw new Error("Ball score elimination sequence entry must be an object.");
    }
    if (String(indexedEntry.cellId) === cellId) {
      return indexedEntry;
    }
  }

  for (var index = 0; index < resolution.eliminationSequence.length; index += 1) {
    var sequenceEntry = resolution.eliminationSequence[index];
    if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
      throw new Error("Ball score elimination sequence entry must be an object.");
    }
    if (String(sequenceEntry.cellId) === cellId) {
      return sequenceEntry;
    }
  }
  return null;
};

LevelRenderer.prototype._resolveBallScorePositionInGameView = function (scoreEvent, resolution, boardSnapshot, eventIndex) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score display requires score event.");
  }
  if (typeof scoreEvent.cellId !== "string" && typeof scoreEvent.cellId !== "number") {
    throw new Error("Ball score event requires cellId.");
  }

  var cellId = String(scoreEvent.cellId);
  var worldPosition = scoreEvent.worldPosition || null;
  if (!worldPosition) {
    var sequenceEntry = this._findBallScoreSequenceEntry(resolution, cellId, eventIndex);
    worldPosition = sequenceEntry ? sequenceEntry.worldPosition : null;
  }
  if (
    worldPosition &&
    typeof worldPosition === "object" &&
    !Array.isArray(worldPosition) &&
    Number.isFinite(Number(worldPosition.x)) &&
    Number.isFinite(Number(worldPosition.y))
  ) {
    return this._convertBoardPointToGameView(Number(worldPosition.x), Number(worldPosition.y));
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Ball score display requires board snapshot.");
  }
  if (!Number.isInteger(scoreEvent.row) || !Number.isInteger(scoreEvent.col)) {
    throw new Error("Ball score event requires row and col when worldPosition is missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    scoreEvent.row,
    scoreEvent.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._spawnBallScoreDisplay = function (scoreEvent, position) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score display requires score event.");
  }
  var points = Number(scoreEvent.points);
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("Ball score event requires positive integer points.");
  }
  if (!position || typeof position.x !== "number" || typeof position.y !== "number" || !isFinite(position.x) || !isFinite(position.y)) {
    throw new Error("Ball score display requires finite position.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for ball score display.");
  }

  var templateNode = gameViewNode.getChildByName("ball_score");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score node is missing.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Ball score display requires cc.tween.");
  }

  var renderer = this;
  var scoreNode = this._acquireBallScoreNode(gameViewNode, templateNode);
  scoreNode.name = "ball_score_" + String(scoreEvent.cellId);
  scoreNode.setPosition(position.x, position.y);

  var scoreLabel = scoreNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("Ball score clone requires cc.Label.");
  }
  scoreLabel.string = "+" + String(points);

  var startY = scoreNode.y;
  cc.tween(scoreNode)
    .to(BALL_SCORE_FADE_IN_DURATION, {
      opacity: 255
    })
    .delay(BALL_SCORE_HOLD_DURATION)
    .parallel(
      cc.tween().to(BALL_SCORE_FADE_OUT_RISE_DURATION, {
        y: startY + BALL_SCORE_RISE_DISTANCE
      }, {
        easing: "quadOut"
      }),
      cc.tween().to(BALL_SCORE_FADE_OUT_RISE_DURATION, {
        opacity: 0
      })
    )
    .call(function () {
      renderer._recycleBallScoreNode(scoreNode);
    })
    .start();
};

LevelRenderer.prototype._scheduleBallScoreEvent = function (scoreEvent, resolution, boardSnapshot, eventIndex, displayGeneration) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score schedule requires score event.");
  }
  if (typeof scoreEvent.cellId !== "string" && typeof scoreEvent.cellId !== "number") {
    throw new Error("Ball score schedule requires cellId.");
  }
  if (!Number.isInteger(eventIndex) || eventIndex < 0) {
    throw new Error("Ball score schedule requires non-negative event index.");
  }
  if (!Number.isInteger(displayGeneration) || displayGeneration < 0) {
    throw new Error("Ball score schedule requires non-negative display generation.");
  }
  var cellId = String(scoreEvent.cellId);
  var eventKey = String(displayGeneration) + ":" + String(eventIndex);
  if (this.playedBallScoreCellIds[eventKey] || this.pendingBallScoreCellIds[eventKey]) {
    return;
  }

  var points = Number(scoreEvent.points);
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("Ball score event requires positive integer points: " + cellId);
  }
  var delayMs = Number(scoreEvent.delayMs);
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Ball score event delayMs must be a non-negative number: " + cellId);
  }

  var position = this._resolveBallScorePositionInGameView(scoreEvent, resolution, boardSnapshot, eventIndex);
  var self = this;
  var callback = function () {
    if (self.currentBallScoreResolution !== resolution || self.ballScoreDisplayGeneration !== displayGeneration) {
      return;
    }
    delete self.pendingBallScoreCellIds[eventKey];
    delete self.pendingBallScoreCallbacks[eventKey];
    self.playedBallScoreCellIds[eventKey] = true;
    self._spawnBallScoreDisplay(scoreEvent, position);
  };

  if (delayMs <= 0) {
    callback();
    return;
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to schedule ball score display.");
  }

  this.pendingBallScoreCellIds[eventKey] = true;
  this.pendingBallScoreCallbacks[eventKey] = callback;
  var scheduler = requireDirectorScheduler("Ball score delayed display");
  scheduler.schedule(callback, gameViewNode, 0, SCHEDULE_ONCE_REPEAT, delayMs / 1000, false);
};

LevelRenderer.prototype._playBallScoreDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.lastResolution) {
    throw new Error("Ball score display requires runtimeSnapshot.lastResolution.");
  }
  if (!runtimeSnapshot.board) {
    throw new Error("Ball score display requires runtimeSnapshot.board.");
  }

  var resolution = runtimeSnapshot.lastResolution;
  if (!Array.isArray(resolution.scoreEvents)) {
    throw new Error("Ball score display requires scoreEvents array.");
  }
  if (resolution !== this.currentBallScoreResolution) {
    this._cancelPendingBallScoreSchedules();
    this.currentBallScoreResolution = resolution;
    this.ballScoreDisplayGeneration += 1;
    this.playedBallScoreCellIds = {};
    this.pendingBallScoreCellIds = {};
    this.pendingBallScoreCallbacks = {};
  }
  if (!resolution.scoreEvents.length) {
    return;
  }

  for (var index = 0; index < resolution.scoreEvents.length; index += 1) {
    this._scheduleBallScoreEvent(
      resolution.scoreEvents[index],
      resolution,
      runtimeSnapshot.board,
      index,
      this.ballScoreDisplayGeneration
    );
  }
};

LevelRenderer.prototype._playTimeBonusFloatingScoreDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }
  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns) ||
      typeof runtimeSnapshot.board.viewportOffsetY !== "number" || !isFinite(runtimeSnapshot.board.viewportOffsetY)) {
    throw new Error("Time bonus floating score requires board snapshot.");
  }
  if (!Array.isArray(this.playedTimeBonusAwardedEvents)) {
    throw new Error("Time bonus floating score event state must be an array.");
  }

  runtimeSnapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "time_bonus_awarded") {
      return;
    }
    if (!Number.isInteger(event.id) || event.id <= 0) {
      throw new Error("time_bonus_awarded event requires a positive integer id.");
    }
    if (this.playedTimeBonusAwardedEvents.indexOf(event) >= 0) {
      return;
    }
    if (!Array.isArray(event.cells) || !event.cells.length) {
      throw new Error("time_bonus_awarded event requires awarded cells.");
    }

    var emittedCellIds = {};
    event.cells.forEach(function (cell, index) {
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
        throw new Error("time_bonus_awarded cell must be an object at index " + index + ".");
      }
      if (typeof cell.id !== "string" || !cell.id) {
        throw new Error("time_bonus_awarded cell requires string id.");
      }
      if (emittedCellIds[cell.id]) {
        throw new Error("time_bonus_awarded event repeats cell id: " + cell.id);
      }
      emittedCellIds[cell.id] = true;
      if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col) || cell.row < 0 || cell.col < 0) {
        throw new Error("time_bonus_awarded cell requires non-negative row and col: " + cell.id);
      }
      if (!Number.isInteger(cell.bonusSeconds) || cell.bonusSeconds !== 5) {
        throw new Error("time_bonus_awarded cell must grant exactly five seconds: " + cell.id);
      }

      var boardPosition = BoardLayout.getCellPosition(
        cell.row,
        cell.col,
        runtimeSnapshot.board.maxColumns,
        runtimeSnapshot.board.viewportOffsetY
      );
      var position = this._convertBoardPointToGameView(boardPosition.x, boardPosition.y);
      this._spawnBallScoreDisplay({
        cellId: "time_bonus_" + String(event.id) + "_" + cell.id,
        points: cell.bonusSeconds
      }, position);
    }, this);
    this.playedTimeBonusAwardedEvents.push(event);
  }, this);
};
}

module.exports = attachLevelRendererSceneFloatingScoreMethods;
