"use strict";

function attachLevelRendererSceneHudCoreMethods(LevelRenderer, context) {
  var BoardLayout = context.BoardLayout;
  var COMBO_BATTER_FADE_DURATION = context.COMBO_BATTER_FADE_DURATION;
  var COMBO_BATTER_HOLD_DURATION = context.COMBO_BATTER_HOLD_DURATION;
  var COMBO_BATTER_OFFSET_Y = context.COMBO_BATTER_OFFSET_Y;
  var COMBO_BATTER_POP_DURATION = context.COMBO_BATTER_POP_DURATION;
  var COMBO_BATTER_POP_SCALE = context.COMBO_BATTER_POP_SCALE;
  var COMBO_BATTER_SETTLE_DURATION = context.COMBO_BATTER_SETTLE_DURATION;
  var Logger = context.Logger;
  var attachLevelRendererSceneHudCoreMethods = context.attachLevelRendererSceneHudCoreMethods;
  var requireChildNode = context.requireChildNode;

LevelRenderer.prototype._ensureHudStarAnimationState = function () {
  var lastMissing = typeof this.lastHudStarRating === "undefined";
  var displayedMissing = typeof this.hudStarDisplayedRating === "undefined";
  var queuedMissing = typeof this.hudStarQueuedRating === "undefined";
  var queueMissing = typeof this.hudStarAnimationQueue === "undefined";
  var activeMissing = typeof this.hudStarAnimationActive === "undefined";
  var missingCount = 0;

  missingCount += lastMissing ? 1 : 0;
  missingCount += displayedMissing ? 1 : 0;
  missingCount += queuedMissing ? 1 : 0;
  missingCount += queueMissing ? 1 : 0;
  missingCount += activeMissing ? 1 : 0;

  if (missingCount === 5) {
    this.lastHudStarRating = null;
    this.hudStarDisplayedRating = null;
    this.hudStarQueuedRating = 0;
    this.hudStarAnimationQueue = [];
    this.hudStarAnimationActive = false;
    return;
  }

  if (missingCount > 0) {
    throw new Error("HUD star animation state is partially initialized.");
  }

  if (this.lastHudStarRating !== null && (typeof this.lastHudStarRating !== "number" || !isFinite(this.lastHudStarRating))) {
    throw new Error("HUD star last rating must be a finite number or null.");
  }
  if (this.hudStarDisplayedRating !== null && (typeof this.hudStarDisplayedRating !== "number" || !isFinite(this.hudStarDisplayedRating))) {
    throw new Error("HUD star displayed rating must be a finite number or null.");
  }
  if (typeof this.hudStarQueuedRating !== "number" || !isFinite(this.hudStarQueuedRating)) {
    throw new Error("HUD star queued rating must be a finite number.");
  }
  if (!Array.isArray(this.hudStarAnimationQueue)) {
    throw new Error("HUD star animation queue must be an array.");
  }
  if (typeof this.hudStarAnimationActive !== "boolean") {
    throw new Error("HUD star animation active state must be boolean.");
  }
};

LevelRenderer.prototype._renderHud = function (levelConfig, runtimeSnapshot) {
  var panel = this._getMountedHudPanel();
  if (!panel) {
    Logger.warn("HudPanel not found in mounted GameView.");
    return;
  }
  var hudTargetDisplay = this._buildHudTargetDisplayForRender(levelConfig, runtimeSnapshot);

  // this._setHudLabel(panel, "LevelTitle", "关卡");
  this._setHudLabel(panel, "LevelValue", String(levelConfig.level.levelId));
  // this._setHudLabel(panel, "ScoreTitle", "得分");
  this._setHudLabel(panel, "ScoreValue", String(runtimeSnapshot.score));
  // this._setHudLabel(panel, "TargetTitle", "目标:");
  this._renderHudTargets(panel, hudTargetDisplay);
  this._renderHudStarProgress(panel, runtimeSnapshot);
  var pauseButtonNode = requireChildNode(panel, "pause_btn", "HudPanel");
  this._bindBottomPanelButton(pauseButtonNode, "open_pause");
  this._setBottomPanelButtonEnabled(pauseButtonNode, true, {
    dimWhenDisabled: false
  });
  var stateValueNode = panel.getChildByName("StateValue");
  if (stateValueNode) {
    stateValueNode.active = false;
  }
  var dropValueNode = panel.getChildByName("DropValue");
  if (dropValueNode) {
    dropValueNode.active = false;
  }
};

LevelRenderer.prototype._initializeComboBatterHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for combo batter HUD.");
  }

  var batterNode = gameViewNode.getChildByName("batter");
  if (!batterNode || !batterNode.isValid) {
    throw new Error("GameView.batter node is missing.");
  }

  var batterLabel = batterNode.getComponent(cc.Label);
  if (!batterLabel) {
    throw new Error("GameView.batter label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Combo batter HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(batterNode);
  batterNode.active = false;
  batterNode.opacity = 255;
  batterNode.setScale(1, 1);
  batterLabel.string = "0";
  this.lastComboBatterEventId = -1;
};

LevelRenderer.prototype._resolveComboBatterPositionInGameView = function (comboEvent, runtimeSnapshot) {
  if (!comboEvent || typeof comboEvent !== "object") {
    throw new Error("Combo batter position requires combo event.");
  }
  if (!runtimeSnapshot || !runtimeSnapshot.board) {
    throw new Error("Combo batter position requires runtimeSnapshot.board.");
  }

  function offsetComboBatterPosition(position) {
    if (!position || typeof position.x !== "number" || !isFinite(position.x) || typeof position.y !== "number" || !isFinite(position.y)) {
      throw new Error("Combo batter position requires finite x and y.");
    }
    return {
      x: position.x,
      y: position.y + COMBO_BATTER_OFFSET_Y
    };
  }

  var boardSnapshot = runtimeSnapshot.board;
  if (Number.isInteger(comboEvent.attach_row) && Number.isInteger(comboEvent.attach_col)) {
    if (!Number.isInteger(boardSnapshot.maxColumns)) {
      throw new Error("Combo batter position requires boardSnapshot.maxColumns.");
    }
    if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
      throw new Error("Combo batter position requires boardSnapshot.viewportOffsetY.");
    }
    var boardPos = BoardLayout.getCellPosition(
      comboEvent.attach_row,
      comboEvent.attach_col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    return offsetComboBatterPosition(this._convertBoardPointToGameView(boardPos.x, boardPos.y));
  }

  if (
    typeof comboEvent.attach_x === "number" &&
    isFinite(comboEvent.attach_x) &&
    typeof comboEvent.attach_y === "number" &&
    isFinite(comboEvent.attach_y)
  ) {
    return offsetComboBatterPosition(this._convertBoardPointToGameView(comboEvent.attach_x, comboEvent.attach_y));
  }

  throw new Error("combo_bonus_awarded requires attach_row/attach_col or attach_x/attach_y.");
};

LevelRenderer.prototype._playComboBatterDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var comboEvent = null;
  for (var index = 0; index < runtimeSnapshot.runtimeEvents.length; index += 1) {
    var event = runtimeSnapshot.runtimeEvents[index];
    if (event && event.type === "combo_bonus_awarded") {
      comboEvent = event;
    }
  }

  if (!comboEvent) {
    return;
  }
  if (typeof comboEvent.id !== "number" || !isFinite(comboEvent.id)) {
    throw new Error("combo_bonus_awarded event requires a numeric id.");
  }
  if (comboEvent.id === this.lastComboBatterEventId) {
    return;
  }

  var comboDisplay = Math.floor(Number(comboEvent.combo_display));
  if (!Number.isInteger(comboDisplay) || comboDisplay < 1) {
    throw new Error("combo_bonus_awarded requires positive integer combo_display.");
  }

  this.lastComboBatterEventId = comboEvent.id;

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for combo batter display.");
  }

  var batterNode = gameViewNode.getChildByName("batter");
  if (!batterNode || !batterNode.isValid) {
    throw new Error("GameView.batter node is missing.");
  }

  var batterLabel = batterNode.getComponent(cc.Label);
  if (!batterLabel) {
    throw new Error("GameView.batter label component is missing.");
  }

  if (typeof cc.tween !== "function") {
    throw new Error("Combo batter display requires cc.tween.");
  }

  cc.Tween.stopAllByTarget(batterNode);
  batterNode.active = true;
  batterNode.opacity = 255;
  batterNode.setScale(0.6, 0.6);
  batterLabel.string = "+" + String(comboDisplay);

  var attachPosition = this._resolveComboBatterPositionInGameView(comboEvent, runtimeSnapshot);
  batterNode.setPosition(attachPosition.x, attachPosition.y);
  batterNode.zIndex = 1200;

  cc.tween(batterNode)
    .to(COMBO_BATTER_POP_DURATION, {
      scale: COMBO_BATTER_POP_SCALE
    }, {
      easing: "backOut"
    })
    .to(COMBO_BATTER_SETTLE_DURATION, {
      scale: 1
    })
    .delay(COMBO_BATTER_HOLD_DURATION)
    .to(COMBO_BATTER_FADE_DURATION, {
      opacity: 0
    })
    .call(function () {
      batterNode.active = false;
      batterLabel.string = "0";
      batterNode.opacity = 255;
      batterNode.setScale(1, 1);
    })
    .start();
};
}

module.exports = attachLevelRendererSceneHudCoreMethods;
