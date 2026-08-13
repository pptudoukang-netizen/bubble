"use strict";

function attachLevelRendererSceneJarScoreHudMethods(LevelRenderer, context) {
  var BoardLayout = context.BoardLayout;
  var JAR_FRACTION_END_SCALE = context.JAR_FRACTION_END_SCALE;
  var JAR_FRACTION_FADE_DURATION = context.JAR_FRACTION_FADE_DURATION;
  var JAR_FRACTION_MOUTH_OFFSET_RATIO = context.JAR_FRACTION_MOUTH_OFFSET_RATIO;
  var JAR_FRACTION_RISE_DISTANCE = context.JAR_FRACTION_RISE_DISTANCE;
  var JAR_FRACTION_RISE_DURATION = context.JAR_FRACTION_RISE_DURATION;
  var JAR_FRACTION_START_SCALE = context.JAR_FRACTION_START_SCALE;
  var JAR_FRACTION_START_Y_OFFSET = context.JAR_FRACTION_START_Y_OFFSET;
  var attachLevelRendererSceneJarScoreHudMethods = context.attachLevelRendererSceneJarScoreHudMethods;

LevelRenderer.prototype._pruneJarFractionNodePool = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  this.jarFractionNodePool = this.jarFractionNodePool.filter(function (node) {
    return !!(node && node.isValid);
  });
};

LevelRenderer.prototype._recycleJarFractionNode = function (fractionNode) {
  if (!fractionNode || !fractionNode.isValid) {
    throw new Error("Jar fraction recycle requires a valid node.");
  }
  if (fractionNode.__isJarFractionClone !== true) {
    throw new Error("Jar fraction recycle requires pooled clone node.");
  }
  if (fractionNode.__isJarFractionPooled === true) {
    throw new Error("Jar fraction node cannot be recycled twice.");
  }
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction recycle requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.active = false;
  fractionNode.opacity = 255;
  fractionNode.setScale(1, 1);
  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("Jar fraction recycle requires cc.Label.");
  }
  fractionLabel.string = "+0";
  fractionNode.__jarFractionDisplayToken = null;
  fractionNode.removeFromParent(false);
  fractionNode.__isJarFractionPooled = true;
  this.jarFractionNodePool.push(fractionNode);
};

LevelRenderer.prototype._recycleJarFractionNodesBeforeHudClear = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }

  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    var children = gameViewNode.children.slice();
    for (var index = 0; index < children.length; index += 1) {
      var childNode = children[index];
      if (!childNode || !childNode.isValid || childNode.__isJarFractionClone !== true) {
        continue;
      }
      this._recycleJarFractionNode(childNode);
    }
  }

  this._pruneJarFractionNodePool();
};

LevelRenderer.prototype._releaseJarFractionNodesBeforeGameplayBundleUnload = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction bundle release requires cc.Tween.stopAllByTarget.");
  }

  this.jarFractionDisplayGeneration += 1;
  this.lastJarCollectScoredEvent = null;
  this._pruneJarFractionNodePool();

  var fractionNodes = this.jarFractionNodePool.slice();
  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    if (!Array.isArray(gameViewNode.children)) {
      throw new Error("GameView children must be an array during jar fraction bundle release.");
    }
    gameViewNode.children.slice().forEach(function (childNode) {
      if (childNode && childNode.isValid && childNode.__isJarFractionClone === true) {
        fractionNodes.push(childNode);
      }
    });
  }

  fractionNodes.forEach(function (fractionNode) {
    if (!fractionNode || !fractionNode.isValid || fractionNode.__isJarFractionClone !== true) {
      throw new Error("Jar fraction bundle release requires valid clone nodes.");
    }
    cc.Tween.stopAllByTarget(fractionNode);
    fractionNode.__jarFractionDisplayToken = null;
    fractionNode.destroy();
  });
  this.jarFractionNodePool = [];
};

LevelRenderer.prototype._acquireJarFractionNode = function (gameViewNode, templateNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to acquire jar fraction node.");
  }
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.fraction template node is required.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Jar fraction display requires cc.instantiate.");
  }
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction acquire requires cc.Tween.stopAllByTarget.");
  }

  this._pruneJarFractionNodePool();
  var fractionNode = this.jarFractionNodePool.length ? this.jarFractionNodePool.pop() : null;
  if (!fractionNode) {
    fractionNode = cc.instantiate(templateNode);
    fractionNode.__isJarFractionClone = true;
    fractionNode.__isJarFractionPooled = true;
  }
  if (!fractionNode.isValid) {
    throw new Error("Jar fraction pooled node is invalid.");
  }
  if (fractionNode.__isJarFractionClone !== true) {
    throw new Error("Jar fraction pooled node must be marked as clone.");
  }
  if (fractionNode.__isJarFractionPooled !== true) {
    throw new Error("Jar fraction pooled node must be marked as pooled.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.parent = gameViewNode;
  fractionNode.__isJarFractionPooled = false;
  fractionNode.active = true;
  fractionNode.opacity = 255;
  fractionNode.setScale(JAR_FRACTION_START_SCALE, JAR_FRACTION_START_SCALE);
  fractionNode.zIndex = 1200;
  return fractionNode;
};

LevelRenderer.prototype._resolveJarMouthPositionInGameView = function (jarIndex) {
  if (!Number.isInteger(jarIndex) || jarIndex < 0) {
    throw new Error("Jar fraction display requires non-negative integer jarIndex.");
  }
  if (!this.layers || !this.layers.jars) {
    throw new Error("Jar layer is required for fraction display.");
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + jarIndex);
  if (!jarNode || !jarNode.isValid) {
    throw new Error("BottomJar_" + jarIndex + " is missing for fraction display.");
  }

  var jarHeight = Number(BoardLayout.jarHeight);
  if (!Number.isFinite(jarHeight) || jarHeight <= 0) {
    throw new Error("BoardLayout.jarHeight must be a positive number.");
  }

  var mouthAnchor = jarNode.getChildByName("FractionMouthAnchor");
  if (!mouthAnchor) {
    mouthAnchor = new cc.Node("FractionMouthAnchor");
    mouthAnchor.parent = jarNode;
    mouthAnchor.setPosition(0, jarHeight * JAR_FRACTION_MOUTH_OFFSET_RATIO);
  }

  return this._convertNodePositionToGameView(mouthAnchor);
};

LevelRenderer.prototype._spawnJarFractionDisplay = function (entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Jar fraction display requires entry object.");
  }
  var jarIndex = entry.jar_index;
  if (!Number.isInteger(jarIndex) || jarIndex < 0) {
    throw new Error("Jar fraction entry requires non-negative integer jar_index.");
  }
  var gained = Math.floor(Number(entry.gained));
  if (!Number.isInteger(gained) || gained <= 0) {
    throw new Error("Jar fraction entry requires positive integer gained.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jar fraction display.");
  }

  var templateNode = gameViewNode.getChildByName("fraction");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.fraction node is missing.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Jar fraction display requires cc.instantiate.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Jar fraction display requires cc.tween.");
  }

  var renderer = this;
  var displayGeneration = this.jarFractionDisplayGeneration;
  var fractionNode = this._acquireJarFractionNode(gameViewNode, templateNode);
  var displayToken = String(displayGeneration) + ":" + String(++this.jarFractionDisplaySerial);
  fractionNode.__jarFractionDisplayToken = displayToken;
  fractionNode.name = "fraction_" + String(jarIndex);

  var mouthPosition = this._resolveJarMouthPositionInGameView(jarIndex);
  fractionNode.setPosition(mouthPosition.x, mouthPosition.y + JAR_FRACTION_START_Y_OFFSET);

  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("Jar fraction clone requires cc.Label.");
  }
  fractionLabel.string = "+" + String(gained);

  var startY = fractionNode.y;
  var fadeDelay = Math.max(0, JAR_FRACTION_RISE_DURATION - JAR_FRACTION_FADE_DURATION);
  cc.tween(fractionNode)
    .parallel(
      cc.tween().to(JAR_FRACTION_RISE_DURATION, {
        scale: JAR_FRACTION_END_SCALE
      }, {
        easing: "quadOut"
      }),
      cc.tween().to(JAR_FRACTION_RISE_DURATION, {
        y: startY + JAR_FRACTION_RISE_DISTANCE
      }, {
        easing: "quadOut"
      }),
      cc.tween().delay(fadeDelay).to(JAR_FRACTION_FADE_DURATION, {
        opacity: 0
      })
    )
    .call(function () {
      if (
        renderer.jarFractionDisplayGeneration !== displayGeneration ||
        fractionNode.__jarFractionDisplayToken !== displayToken
      ) {
        return;
      }
      renderer._recycleJarFractionNode(fractionNode);
    })
    .start();
};

LevelRenderer.prototype._playJarFractionDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var scoreEvent = null;
  for (var index = 0; index < runtimeSnapshot.runtimeEvents.length; index += 1) {
    var event = runtimeSnapshot.runtimeEvents[index];
    if (event && event.type === "jar_collect_scored") {
      scoreEvent = event;
    }
  }

  if (!scoreEvent) {
    return;
  }
  if (typeof scoreEvent.id !== "number" || !isFinite(scoreEvent.id)) {
    throw new Error("jar_collect_scored event requires a numeric id.");
  }
  if (scoreEvent === this.lastJarCollectScoredEvent) {
    return;
  }
  if (!Array.isArray(scoreEvent.entries)) {
    throw new Error("jar_collect_scored event requires entries array.");
  }
  if (!scoreEvent.entries.length) {
    return;
  }

  for (var entryIndex = 0; entryIndex < scoreEvent.entries.length; entryIndex += 1) {
    this._spawnJarFractionDisplay(scoreEvent.entries[entryIndex]);
  }
  this.lastJarCollectScoredEvent = scoreEvent;
};

LevelRenderer.prototype._renderJarScoreBoostTimer = function (runtimeSnapshot) {
  if (!this.layers || !this.layers.hud) {
    throw new Error("HUD layer is missing when rendering jar score boost timer.");
  }

  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is missing when rendering jar score boost timer.");
  }

  var timerNode = gameViewNode.getChildByName("timer");
  if (!timerNode || !timerNode.isValid) {
    throw new Error("GameView.timer node is missing.");
  }

  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    throw new Error("GameView.timer label component is missing.");
  }

  var boostActive = !!(runtimeSnapshot && runtimeSnapshot.jarScoreBoostActive);
  var remainingMs = Math.max(0, Math.floor(Number(runtimeSnapshot && runtimeSnapshot.jarScoreBoostRemainingMs) || 0));
  if (!boostActive) {
    timerNode.active = false;
    timerLabel.string = "0";
    return;
  }

  var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  timerNode.active = true;
  timerLabel.string = String(remainingSeconds);
};

LevelRenderer.prototype._renderTimedLevelTimer = function (runtimeSnapshot) {
  var timedLevel = !!(runtimeSnapshot && runtimeSnapshot.timedLevel);
  if (!this.layers || !this.layers.hud) {
    throw new Error("HUD layer is missing when rendering timed level timer.");
  }

  if (typeof this._getMountedBgNode !== "function") {
    throw new Error("Timed level timer requires mounted GameView bg resolver.");
  }
  var backgroundNode = this._getMountedBgNode();

  var bigTimerNode = backgroundNode.getChildByName("BigTimer");
  if (!bigTimerNode || !bigTimerNode.isValid) {
    throw new Error("Mounted GameView bg.BigTimer node is missing.");
  }

  var timerNode = bigTimerNode.getChildByName("timer");
  if (!timerNode || !timerNode.isValid) {
    throw new Error("Mounted GameView bg.BigTimer.timer node is missing.");
  }

  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    throw new Error("Mounted GameView bg.BigTimer.timer requires Label component.");
  }

  if (!timedLevel) {
    bigTimerNode.active = false;
    timerLabel.string = "0";
    return;
  }

  var remainingMsValue = Number(runtimeSnapshot.remainingTimeMs);
  if (!Number.isFinite(remainingMsValue)) {
    throw new Error("Timed level runtime snapshot requires finite remainingTimeMs.");
  }
  var remainingMs = Math.max(0, Math.ceil(remainingMsValue));
  var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  bigTimerNode.active = true;
  timerNode.active = true;
  timerLabel.string = String(remainingSeconds);
};
}

module.exports = attachLevelRendererSceneJarScoreHudMethods;
