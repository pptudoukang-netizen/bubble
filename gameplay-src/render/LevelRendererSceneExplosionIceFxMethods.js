"use strict";

var MineCountdownPresenter = require("./MineCountdownPresenter");

function attachLevelRendererSceneExplosionIceFxMethods(LevelRenderer, context) {
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var BoardLayout = context.BoardLayout;
  var ICE_COLLECT_BEZIER_ARC = context.ICE_COLLECT_BEZIER_ARC;
  var ICE_COLLECT_FLY_DURATION = context.ICE_COLLECT_FLY_DURATION;
  var ICE_COLLECT_FLY_TWEEN_EASING = context.ICE_COLLECT_FLY_TWEEN_EASING;
  var ICE_COLLECT_FLY_Z_INDEX = context.ICE_COLLECT_FLY_Z_INDEX;
  var ICE_THAW_SHAKE_OFFSET = context.ICE_THAW_SHAKE_OFFSET;
  var ICE_THAW_SHAKE_STEP_DURATION = context.ICE_THAW_SHAKE_STEP_DURATION;
  var applyIceCollectFlyEaseAction = context.applyIceCollectFlyEaseAction;
  var attachLevelRendererSceneExplosionIceFxMethods = context.attachLevelRendererSceneExplosionIceFxMethods;
  var hasIceSnowballCollectionObjective = context.hasIceSnowballCollectionObjective;
  var playExplosionAnimationAt = context.playExplosionAnimationAt;
  var requireFinitePoint = context.requireFinitePoint;
  var resolveBoardCellWorldPosition = context.resolveBoardCellWorldPosition;
  var resolveIceInnerColor = context.resolveIceInnerColor;

LevelRenderer.prototype._playMolotovBlastAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var triggered = resolution && Array.isArray(resolution.reactiveTriggered) ? resolution.reactiveTriggered : [];
  var molotovTriggers = triggered.filter(function (entry) {
    return !!(entry && entry.entityType === "molotov");
  });
  if (!molotovTriggers.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Molotov blast animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  molotovTriggers.forEach(function (trigger) {
    if (!trigger || (typeof trigger.id !== "string" && typeof trigger.id !== "number")) {
      throw new Error("Molotov blast animation requires trigger id.");
    }
    if (!Number.isInteger(trigger.row) || !Number.isInteger(trigger.col)) {
      throw new Error("Molotov blast animation requires trigger coordinates.");
    }

    var normalizedId = String(trigger.id);
    var blastPosition = requireFinitePoint(BoardLayout.getCellPosition(
      trigger.row,
      trigger.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    ), "Molotov blast");
    if (this.molotovBlastAnimatedIds[normalizedId]) {
      return;
    }
    this.molotovBlastAnimatedIds[normalizedId] = true;
    this._hideMolotovBlastSource(normalizedId);

    playExplosionAnimationAt(this, "MolotovBlastFx_" + normalizedId, blastPosition, "Molotov blast animation", function () {
      this._clearMolotovBlastHiddenSource(normalizedId);
    }.bind(this));
  }, this);
};

LevelRenderer.prototype._playBlastExplosionAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.blastExplosions)) {
    throw new Error("Blast explosion animation requires lastResolution.blastExplosions.");
  }
  var explosions = resolution.blastExplosions;
  if (!explosions.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Blast explosion animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  explosions.forEach(function (explosion) {
    if (!explosion || (typeof explosion.id !== "string" && typeof explosion.id !== "number")) {
      throw new Error("Blast explosion animation requires explosion id.");
    }
    if (!Number.isInteger(explosion.row) || !Number.isInteger(explosion.col)) {
      throw new Error("Blast explosion animation requires explosion coordinates.");
    }
    if (explosion.entityType !== "blast") {
      throw new Error("Blast explosion animation requires entityType blast.");
    }

    var normalizedId = String(explosion.id);
    if (this.blastExplosionAnimatedIds[normalizedId]) {
      return;
    }
    this.blastExplosionAnimatedIds[normalizedId] = true;

    var explosionPosition = resolveBoardCellWorldPosition(
      runtimeSnapshot,
      explosion.row,
      explosion.col,
      "Blast explosion"
    );
    playExplosionAnimationAt(this, "BlastExplosionFx_" + normalizedId, explosionPosition, "Blast explosion animation", null);
  }, this);
};

LevelRenderer.prototype._playMineExplosionAnimation = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    throw new Error("Mine explosion animation requires runtimeEvents array.");
  }
  var resolution = runtimeSnapshot.lastResolution;
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Mine explosion animation requires lastResolution.");
  }
  if (!Array.isArray(resolution.mineExplosions)) {
    throw new Error("Mine explosion animation requires lastResolution.mineExplosions.");
  }
  resolution.mineExplosions.forEach(function (explosion) {
    if (!explosion || typeof explosion.id !== "string" || !explosion.id) {
      throw new Error("Mine explosion animation requires non-empty explosion id.");
    }
    if (explosion.entityType !== "mine") {
      throw new Error("Mine explosion animation requires entityType mine.");
    }
    if (this.mineExplosionAnimatedIds[explosion.id]) {
      return;
    }
    this.mineExplosionAnimatedIds[explosion.id] = true;
    var explosionPosition = resolveBoardCellWorldPosition(
      runtimeSnapshot,
      explosion.row,
      explosion.col,
      "Mine explosion"
    );
    MineCountdownPresenter.playMineExplosionFrameSequence(this, "MineExplosionFx_" + explosion.id, explosionPosition);
  }, this);

  runtimeSnapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "mine_disappeared") {
      return;
    }
    if (!Number.isInteger(event.id) || event.id <= 0) {
      throw new Error("mine_disappeared event requires positive integer id.");
    }
    if (typeof event.mineId !== "string" || !event.mineId) {
      throw new Error("mine_disappeared event requires mineId.");
    }
    if (!Number.isInteger(event.row) || !Number.isInteger(event.col)) {
      throw new Error("mine_disappeared event requires integer coordinates.");
    }
    if (event.reason !== "elimination" && event.reason !== "floating_drop") {
      throw new Error("mine_disappeared event has invalid reason: " + event.reason + ".");
    }

    var eventAnimationKey = "runtime_event_" + event.id;
    if (this.mineExplosionAnimatedIds[eventAnimationKey]) {
      return;
    }
    this.mineExplosionAnimatedIds[eventAnimationKey] = true;
    var eventPosition = resolveBoardCellWorldPosition(
      runtimeSnapshot,
      event.row,
      event.col,
      "Mine disappearance"
    );
    MineCountdownPresenter.playMineExplosionFrameSequence(
      this,
      "MineDisappearFx_" + event.mineId + "_" + event.id,
      eventPosition
    );
  }, this);
};

LevelRenderer.prototype._spawnIceSnowballFlyFxNode = function (nodeName, gameViewX, gameViewY, innerColor) {
  var parentNode = this._getGameViewNode();
  if (!parentNode || !parentNode.isValid) {
    throw new Error("GameView is required for ice snowball fly fx.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fly fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fly fx requires innerColor.");
  }
  if (typeof gameViewX !== "number" || typeof gameViewY !== "number" || !isFinite(gameViewX) || !isFinite(gameViewY)) {
    throw new Error("Ice snowball fly fx requires finite GameView position.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = parentNode;
  fxNode.zIndex = ICE_COLLECT_FLY_Z_INDEX;
  fxNode.setPosition(gameViewX, gameViewY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._spawnIceSnowballFxNode = function (nodeName, baseX, baseY, innerColor, zIndexBase) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Ice snowball fx requires board layer.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fx requires innerColor.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = this.layers.board;
  fxNode.zIndex = typeof zIndexBase === "number" ? zIndexBase : 10;
  fxNode.setPosition(baseX, baseY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._flyIceFxNodeToHudTarget = function (fxNode, startX, startY, options) {
  if (!fxNode) {
    throw new Error("Ice fx fly requires fxNode.");
  }

  var targetBoardPos = options && options.targetBoardPos ? options.targetBoardPos : null;
  var flyDuration = Math.max(0.18, Number(options && options.flyDuration) || Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(options && options.bezierArc) || Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var startDelay = Math.max(0, Number(options && options.startDelay) || 0);
  var onArrive = options && typeof options.onArrive === "function" ? options.onArrive : null;
  var onComplete = options && typeof options.onComplete === "function" ? options.onComplete : null;

  var finishFx = function () {
    if (fxNode && fxNode.isValid && fxNode.parent) {
      fxNode.removeFromParent(true);
    }
    if (onComplete) {
      onComplete();
    }
  };

  if (!targetBoardPos) {
    finishFx();
    return;
  }

  var baseX = startX;
  var baseY = startY;
  var endX = targetBoardPos.x;
  var endY = targetBoardPos.y;
  var controlY = Math.max(baseY, endY) + bezierArc;
  var controlX = (baseX + endX) * 0.5;

  fxNode.stopAllActions();
  if (
    fxNode.runAction &&
    typeof cc.bezierTo === "function" &&
    typeof cc.spawn === "function" &&
    typeof cc.sequence === "function" &&
    typeof cc.callFunc === "function" &&
    typeof cc.delayTime === "function" &&
    typeof cc.scaleTo === "function" &&
    typeof cc.fadeTo === "function" &&
    typeof cc.v2 === "function"
  ) {
    var bezier = [
      cc.v2(controlX, controlY),
      cc.v2(controlX, controlY),
      cc.v2(endX, endY)
    ];
    var flyAction = cc.spawn(
      applyIceCollectFlyEaseAction(cc.bezierTo(flyDuration, bezier)),
      applyIceCollectFlyEaseAction(cc.scaleTo(flyDuration, 0.38)),
      applyIceCollectFlyEaseAction(cc.fadeTo(flyDuration, 120))
    );
    var actionChain = [];
    if (startDelay > 0) {
      actionChain.push(cc.delayTime(startDelay));
    }
    actionChain.push(flyAction);
    actionChain.push(cc.callFunc(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    }));
    fxNode.runAction(cc.sequence.apply(null, actionChain));
    return;
  }

  if (typeof cc.tween !== "function") {
    finishFx();
    return;
  }

  if (typeof ICE_COLLECT_FLY_TWEEN_EASING !== "string" || !ICE_COLLECT_FLY_TWEEN_EASING) {
    throw new Error("Ice collect fly tween easing must be a non-empty string.");
  }

  var collectTween = cc.tween(fxNode);
  if (startDelay > 0) {
    collectTween = collectTween.delay(startDelay);
  }
  if (typeof collectTween.bezierTo === "function") {
    collectTween
      .parallel(
        cc.tween().bezierTo(
          flyDuration,
          cc.v2(controlX, controlY),
          cc.v2(controlX, controlY),
          cc.v2(endX, endY),
          { easing: ICE_COLLECT_FLY_TWEEN_EASING }
        ),
        cc.tween().to(flyDuration, { scale: 0.38 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING }),
        cc.tween().to(flyDuration, { opacity: 120 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING })
      )
      .call(function () {
        if (onArrive) {
          onArrive();
        }
        finishFx();
      })
      .start();
    return;
  }

  collectTween
    .to(flyDuration, {
      x: endX,
      y: endY,
      scale: 0.38,
      opacity: 120
    }, {
      easing: ICE_COLLECT_FLY_TWEEN_EASING
    })
    .call(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    })
    .start();
};

LevelRenderer.prototype._shouldFlyIceSnowballToHud = function (levelConfig) {
  var config = levelConfig || this.currentLevelConfig;
  if (!config) {
    return false;
  }
  return hasIceSnowballCollectionObjective(config);
};

LevelRenderer.prototype._playIceSnowballCollectFly = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return;
  }

  var targetGameViewPos = this._getHudTargetIceBallPositionInGameView();
  if (!targetGameViewPos) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this._refreshIceSnowballHudTarget();
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var maxProcessedEventId = this.lastIceSnowballCollectEventId;
  var flyDuration = Math.max(0.18, Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var boardSnapshot = runtimeSnapshot.board;

  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (!event || event.type !== "ice_snowball_collect") {
      continue;
    }
    if (typeof event.id !== "number" || !isFinite(event.id)) {
      throw new Error("ice_snowball_collect event requires a numeric id.");
    }
    if (event.id <= this.lastIceSnowballCollectEventId) {
      continue;
    }
    if (!Array.isArray(event.entries) || !event.entries.length) {
      continue;
    }

    maxProcessedEventId = Math.max(maxProcessedEventId, event.id);
    event.entries.forEach(function (entry, entryIndex) {
      if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
        throw new Error("Ice snowball collect entry requires id.");
      }
      var position = this._resolveIceSnowballCollectStartPositionInGameView(entry, boardSnapshot);
      var fxNode = this._spawnIceSnowballFlyFxNode(
        "IceCollectFx_" + entry.id + "_" + event.id + "_" + entryIndex,
        position.x,
        position.y,
        entry.innerColor
      );
      this._flyIceFxNodeToHudTarget(fxNode, position.x, position.y, {
        targetBoardPos: targetGameViewPos,
        flyDuration: flyDuration,
        bezierArc: bezierArc,
        startDelay: 0.03,
        onArrive: function () {
          this._incrementDisplayedIceSnowballCollectedTotal();
          this._refreshIceSnowballHudTarget();
        }.bind(this)
      });
    }, this);
  }

  this.lastIceSnowballCollectEventId = maxProcessedEventId;
};

LevelRenderer.prototype._playIceThawShake = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  var thawedCells = resolution && Array.isArray(resolution.thawed) ? resolution.thawed : [];
  if (!impact || !impact.seq || !thawedCells.length || impact.seq === this.lastIceThawShakeSeq) {
    return;
  }

  this.lastIceThawShakeSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var boardSnapshot = runtimeSnapshot.board;
  var offset = Math.max(2, Number(ICE_THAW_SHAKE_OFFSET) || 0);
  var stepDuration = Math.max(0.02, Number(ICE_THAW_SHAKE_STEP_DURATION) || 0.04);

  thawedCells.forEach(function (cell) {
    if (!cell) {
      return;
    }

    var innerColor = typeof cell.color === "string" && cell.color ? cell.color : resolveIceInnerColor(cell);
    if (typeof innerColor !== "string" || !innerColor) {
      throw new Error("Ice thaw animation requires inner color.");
    }

    var bubbleNode = cell.id ? this.layers.board.getChildByName("Bubble_" + cell.id) : null;
    var baseX = null;
    var baseY = null;
    var fxZIndex = 10;

    if (bubbleNode) {
      if (bubbleNode.__iceThawShakeSeq === impact.seq) {
        return;
      }
      bubbleNode.__iceThawShakeSeq = impact.seq;
      baseX = bubbleNode.x;
      baseY = bubbleNode.y;
      fxZIndex = (bubbleNode.zIndex || 0) + 1;
      bubbleNode.stopAllActions();
      bubbleNode.__thawHiddenSeq = impact.seq;
      bubbleNode.opacity = 0;
      bubbleNode.active = false;
    } else {
      if (
        !boardSnapshot ||
        !Number.isInteger(boardSnapshot.maxColumns) ||
        typeof boardSnapshot.viewportOffsetY !== "number" ||
        !isFinite(boardSnapshot.viewportOffsetY) ||
        !Number.isInteger(cell.row) ||
        !Number.isInteger(cell.col)
      ) {
        throw new Error("Ice thaw animation requires board position when bubble node is missing.");
      }
      var cellPosition = resolveBoardCellWorldPosition(
        runtimeSnapshot,
        cell.row,
        cell.col,
        "Ice thaw animation"
      );
      baseX = cellPosition.x;
      baseY = cellPosition.y;
    }

    var fxNode = this._spawnIceSnowballFxNode(
      "IceThawFx_" + (cell.id || (cell.row + "_" + cell.col)) + "_" + impact.seq,
      baseX,
      baseY,
      innerColor,
      fxZIndex
    );

    var revealBubble = function () {
      if (!bubbleNode || bubbleNode.__thawHiddenSeq !== impact.seq) {
        return;
      }
      bubbleNode.active = true;
      bubbleNode.opacity = 255;
      bubbleNode.__thawHiddenSeq = -1;
    };

    var finishShakeFx = function () {
      revealBubble();
      if (fxNode && fxNode.isValid && fxNode.parent) {
        fxNode.removeFromParent(true);
      }
    };

    if (typeof cc.tween !== "function") {
      finishShakeFx();
      return;
    }

    cc.tween(fxNode)
      .to(stepDuration, { x: baseX - offset, y: baseY })
      .to(stepDuration, { x: baseX + offset, y: baseY })
      .to(stepDuration, { x: baseX - offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX + offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX, y: baseY })
      .call(finishShakeFx)
      .start();
  }, this);
};
}

module.exports = attachLevelRendererSceneExplosionIceFxMethods;
