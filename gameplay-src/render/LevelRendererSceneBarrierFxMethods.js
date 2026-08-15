"use strict";

function attachLevelRendererSceneBarrierFxMethods(LevelRenderer, context) {
  var BARRIER_HAMMER_HINT_LIFT_DURATION = context.BARRIER_HAMMER_HINT_LIFT_DURATION;
  var BARRIER_HAMMER_HINT_OFFSET_X = context.BARRIER_HAMMER_HINT_OFFSET_X;
  var BARRIER_HAMMER_HINT_OFFSET_Y = context.BARRIER_HAMMER_HINT_OFFSET_Y;
  var BARRIER_HAMMER_HINT_PAUSE_DURATION = context.BARRIER_HAMMER_HINT_PAUSE_DURATION;
  var BARRIER_HAMMER_HINT_SIZE = context.BARRIER_HAMMER_HINT_SIZE;
  var BARRIER_HAMMER_HINT_STRIKE_DURATION = context.BARRIER_HAMMER_HINT_STRIKE_DURATION;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_X = context.BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_Y = context.BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  var POWERUP_ICON_RESOURCES = context.POWERUP_ICON_RESOURCES;
  var attachLevelRendererSceneBarrierFxMethods = context.attachLevelRendererSceneBarrierFxMethods;
  var ensureSprite = context.ensureSprite;

LevelRenderer.prototype._hideSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.splitterSpawnHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._revealSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn reveal requires cell id.");
  }
  var normalizedId = String(cellId);
  delete this.splitterSpawnHiddenCellIds[normalizedId];
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (!targetNode || !targetNode.isValid) {
    return;
  }
  targetNode.active = true;
  targetNode.opacity = 255;
  targetNode.setScale(1);
  if (typeof cc.tween !== "function") {
    return;
  }
  cc.tween(targetNode)
    .to(0.08, { scale: 1.12 }, { easing: "quadOut" })
    .to(0.1, { scale: 1 }, { easing: "quadIn" })
    .start();
};

LevelRenderer.prototype._applySplitterSpawnHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.splitterSpawnHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._hideBreederSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Breeder spawn hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.breederSpawnHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._revealBreederSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Breeder spawn reveal requires cell id.");
  }
  var normalizedId = String(cellId);
  delete this.breederSpawnHiddenCellIds[normalizedId];
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (!targetNode || !targetNode.isValid) {
    return;
  }
  targetNode.active = true;
  targetNode.opacity = 255;
  targetNode.setScale(1);
  if (typeof cc === "undefined" || !cc || typeof cc.tween !== "function") {
    throw new Error("Breeder spawn reveal requires cc.tween.");
  }
  cc.tween(targetNode)
    .to(0.08, { scale: 1.12 }, { easing: "quadOut" })
    .to(0.1, { scale: 1 }, { easing: "quadIn" })
    .start();
};

LevelRenderer.prototype._applyBreederSpawnHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.breederSpawnHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._hideMolotovBlastSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.molotovBlastHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._clearMolotovBlastHiddenSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast clear hide requires cell id.");
  }
  delete this.molotovBlastHiddenCellIds[String(cellId)];
};

LevelRenderer.prototype._applyMolotovBlastHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.molotovBlastHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._buildBarrierHammerHintAction = function (hintNode) {
  if (!hintNode || !hintNode.isValid) {
    throw new Error("Barrier hammer hint action requires hint node.");
  }
  if (
    typeof cc.callFunc !== "function" ||
    typeof cc.spawn !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.repeatForever !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateTo !== "function" ||
    typeof cc.delayTime !== "function"
  ) {
    throw new Error("Barrier hammer hint animation requires Cocos action APIs.");
  }

  var liftX = BARRIER_HAMMER_HINT_OFFSET_X;
  var liftY = BARRIER_HAMMER_HINT_OFFSET_Y;
  var strikeX = BARRIER_HAMMER_HINT_OFFSET_X + BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var strikeY = BARRIER_HAMMER_HINT_OFFSET_Y + BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  return cc.repeatForever(cc.sequence(
    cc.callFunc(function () {
      hintNode.setPosition(liftX, liftY);
      hintNode.angle = -26;
      hintNode.opacity = 255;
    }),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, strikeX, strikeY),
      cc.rotateTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, 18)
    ),
    cc.delayTime(BARRIER_HAMMER_HINT_PAUSE_DURATION),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_LIFT_DURATION, liftX, liftY),
      cc.rotateTo(BARRIER_HAMMER_HINT_LIFT_DURATION, -26)
    )
  ));
};

LevelRenderer.prototype._removeBarrierHammerHintNodeByCellId = function (cellId) {
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint removal requires cell id.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
  }
  delete this.barrierHammerHintNodes[cellId];
};

LevelRenderer.prototype._clearBarrierHammerStoneHints = function () {
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    this._removeBarrierHammerHintNodeByCellId(cellId);
  }, this);
};

LevelRenderer.prototype._ensureBarrierHammerHintNode = function (bubbleNode, cellId, spriteFrame) {
  if (!bubbleNode || !bubbleNode.isValid) {
    throw new Error("Barrier hammer hint requires valid bubble node.");
  }
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint requires cell id.");
  }
  if (!spriteFrame) {
    throw new Error("Barrier hammer hint requires sprite frame.");
  }
  if (!BARRIER_HAMMER_HINT_SIZE || typeof BARRIER_HAMMER_HINT_SIZE.width !== "number" || typeof BARRIER_HAMMER_HINT_SIZE.height !== "number") {
    throw new Error("Barrier hammer hint requires valid size.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid && hintNode.parent !== bubbleNode) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
    delete this.barrierHammerHintNodes[cellId];
    hintNode = null;
  }

  if (!hintNode || !hintNode.isValid) {
    hintNode = new cc.Node("BarrierHammerHint");
    this.barrierHammerHintNodes[cellId] = hintNode;
    hintNode.parent = bubbleNode;
    hintNode.zIndex = 120;
    hintNode.setAnchorPoint(0.5, 0.5);
    hintNode.setPosition(BARRIER_HAMMER_HINT_OFFSET_X, BARRIER_HAMMER_HINT_OFFSET_Y);
    hintNode.angle = -26;
    hintNode.opacity = 255;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
    hintNode.runAction(this._buildBarrierHammerHintAction(hintNode));
  } else {
    hintNode.parent = bubbleNode;
    hintNode.active = true;
    hintNode.zIndex = 120;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
  }
};

LevelRenderer.prototype._syncBarrierHammerStoneHints = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    throw new Error("Barrier hammer hints require runtime snapshot.");
  }
  var shooterSnapshot = runtimeSnapshot.shooter;
  if (!shooterSnapshot || typeof shooterSnapshot !== "object") {
    throw new Error("Barrier hammer hints require shooter snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || typeof boardSnapshot !== "object" || !Array.isArray(boardSnapshot.cells)) {
    throw new Error("Barrier hammer hints require board cells.");
  }

  if (!shooterSnapshot.pendingBarrierHammer) {
    this._clearBarrierHammerStoneHints();
    this.lastBarrierHammerHintKey = "inactive";
    return;
  }

  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Barrier hammer hints require board layer.");
  }

  var spritePath = POWERUP_ICON_RESOURCES.barrier_hammer;
  if (typeof spritePath !== "string" || !spritePath) {
    throw new Error("Barrier hammer hint sprite path is missing.");
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded barrier hammer hint sprite: " + spritePath);
  }

  var activeCellIds = {};
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object") {
      throw new Error("Barrier hammer hint requires valid board cell.");
    }
    if (cell.entityType !== "stone") {
      return;
    }
    if (!cell.id) {
      throw new Error("Stone cell requires id for barrier hammer hint.");
    }

    var cellId = String(cell.id);
    var bubbleNode = this.boardBubbleNodes[cellId];
    if (!bubbleNode || !bubbleNode.isValid) {
      throw new Error("Barrier hammer hint target bubble node is missing: " + cellId);
    }
    activeCellIds[cellId] = true;
    this._ensureBarrierHammerHintNode(bubbleNode, cellId, spriteFrame);
  }, this);

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    if (!activeCellIds[cellId]) {
      this._removeBarrierHammerHintNodeByCellId(cellId);
    }
  }, this);

  this.lastBarrierHammerHintKey = [
    "active",
    boardSnapshot.version,
    Object.keys(activeCellIds).sort().join(",")
  ].join("|");
};
}

module.exports = attachLevelRendererSceneBarrierFxMethods;
