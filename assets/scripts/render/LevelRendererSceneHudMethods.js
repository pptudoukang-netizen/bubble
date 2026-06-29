"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneHudMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var requireChildNode = SceneShared.requireChildNode;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var POWERUP_ICON_RESOURCES = deps.POWERUP_ICON_RESOURCES;
  var HUD_STAR_RESOURCES = deps.HUD_STAR_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JarScoreConfig = deps.JarScoreConfig;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildHudTargetDisplayData = deps.buildHudTargetDisplayData;
  var applyIceSnowballHudDisplayProgress = deps.applyIceSnowballHudDisplayProgress;
  var hasIceSnowballCollectionObjective = deps.hasIceSnowballCollectionObjective;
  var buildStateText = deps.buildStateText;
  var buildHudRenderKey = deps.buildHudRenderKey;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var clamp = deps.clamp;
  var HUD_STAR_MARKER_FALLBACK_RATIOS = [0.3 / 0.85, 0.6 / 0.85, 1];
  var HUD_STAR_PARTICLE_NODE_NAME = "starParticle";
  var HUD_STAR_PARTICLE_DURATION = 0.7;
  var HUD_STAR_PARTICLE_HOLD_DURATION = 0.5;
  var HUD_STAR_PUNCH_SCALE = 1.35;
  var HUD_STAR_PUNCH_UP_DURATION = 0.12;
  var HUD_STAR_PUNCH_DOWN_DURATION = 0.14;

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

var COMBO_BATTER_POP_DURATION = 0.15;
var COMBO_BATTER_SETTLE_DURATION = 0.1;
var COMBO_BATTER_HOLD_DURATION = 0.85;
var COMBO_BATTER_FADE_DURATION = 0.25;
var COMBO_BATTER_POP_SCALE = 1.2;

var JAR_FRACTION_MOUTH_OFFSET_RATIO = 0.24;
var JAR_FRACTION_START_Y_OFFSET = 20;
var JAR_FRACTION_POP_DURATION = 0.15;
var JAR_FRACTION_SETTLE_DURATION = 0.1;
var JAR_FRACTION_HOLD_DURATION = 0.55;
var JAR_FRACTION_FADE_DURATION = 0.25;
var JAR_FRACTION_RISE_DISTANCE = 72;
var JAR_FRACTION_POP_SCALE = 1.15;
var JAR_FRACTION_START_SCALE = 0.6;

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
  this.lastJarCollectScoredEventId = -1;
  this._recycleJarFractionNodesBeforeHudClear();
};

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
  fractionNode.removeFromParent(false);
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
  }
  if (!fractionNode.isValid) {
    throw new Error("Jar fraction pooled node is invalid.");
  }
  if (fractionNode.__isJarFractionClone !== true) {
    throw new Error("Jar fraction pooled node must be marked as clone.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.parent = gameViewNode;
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
  var fractionNode = this._acquireJarFractionNode(gameViewNode, templateNode);
  fractionNode.name = "fraction_" + String(jarIndex);

  var mouthPosition = this._resolveJarMouthPositionInGameView(jarIndex);
  fractionNode.setPosition(mouthPosition.x, mouthPosition.y + JAR_FRACTION_START_Y_OFFSET);

  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("Jar fraction clone requires cc.Label.");
  }
  fractionLabel.string = "+" + String(gained);

  var startY = fractionNode.y;
  cc.tween(fractionNode)
    .to(JAR_FRACTION_POP_DURATION, {
      scale: JAR_FRACTION_POP_SCALE
    }, {
      easing: "backOut"
    })
    .to(JAR_FRACTION_SETTLE_DURATION, {
      scale: 1
    })
    .delay(JAR_FRACTION_HOLD_DURATION)
    .parallel(
      cc.tween().to(JAR_FRACTION_FADE_DURATION, {
        opacity: 0
      }),
      cc.tween().to(JAR_FRACTION_FADE_DURATION, {
        y: startY + JAR_FRACTION_RISE_DISTANCE
      }, {
        easing: "quadOut"
      })
    )
    .call(function () {
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
  if (scoreEvent.id === this.lastJarCollectScoredEventId) {
    return;
  }
  if (!Array.isArray(scoreEvent.entries)) {
    throw new Error("jar_collect_scored event requires entries array.");
  }
  if (!scoreEvent.entries.length) {
    return;
  }

  this.lastJarCollectScoredEventId = scoreEvent.id;
  for (var entryIndex = 0; entryIndex < scoreEvent.entries.length; entryIndex += 1) {
    this._spawnJarFractionDisplay(scoreEvent.entries[entryIndex]);
  }
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
  var panel = this._getMountedHudPanel();
  if (!panel) {
    if (timedLevel) {
      throw new Error("Timed level requires HudPanel.");
    }
    return;
  }

  var timerNode = panel.getChildByName("timer");
  if (!timerNode || !timerNode.isValid) {
    if (timedLevel) {
      throw new Error("Timed level requires HudPanel.timer node.");
    }
    return;
  }

  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    if (timedLevel) {
      throw new Error("HudPanel.timer requires Label component.");
    }
    timerNode.active = false;
    return;
  }

  if (!timedLevel) {
    timerNode.active = false;
    timerLabel.string = "0";
    return;
  }

  var remainingMsValue = Number(runtimeSnapshot.remainingTimeMs);
  if (!Number.isFinite(remainingMsValue)) {
    throw new Error("Timed level runtime snapshot requires finite remainingTimeMs.");
  }
  var remainingMs = Math.max(0, Math.ceil(remainingMsValue));
  var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  var minutes = Math.floor(remainingSeconds / 60);
  var seconds = remainingSeconds % 60;
  timerNode.active = true;
  timerLabel.string = minutes + ":" + (seconds < 10 ? "0" + seconds : String(seconds));
};

LevelRenderer.prototype.playThreeLineEliminationAnimation = function (rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Three-line elimination animation requires rows.");
  }
  if (!this.layers || !this.layers.board) {
    throw new Error("Three-line elimination animation requires board layer.");
  }

  var spritePath = BALL_RESOURCES.BLOCKADE_LINE;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Three-line elimination animation requires preloaded blockade line sprite.");
  }

  var boardLeft = Number(BoardLayout.boardLeft);
  var boardRight = Number(BoardLayout.boardRight);
  if (!Number.isFinite(boardLeft) || !Number.isFinite(boardRight) || boardRight <= boardLeft) {
    throw new Error("Three-line elimination animation requires valid board bounds.");
  }

  var duration = 0.18;
  var lightNodes = rows.map(function (entry, index) {
    if (!entry || !Number.isFinite(Number(entry.y))) {
      throw new Error("Three-line elimination row requires finite y.");
    }
    var node = new cc.Node("ThreeLineLight_" + index);
    node.parent = this.layers.board;
    node.zIndex = 200 + index;
    ensureSprite(node, spriteFrame);
    node.setContentSize(Math.max(1, boardRight - boardLeft), Math.max(1, BoardLayout.rowHeight));
    node.setPosition(boardLeft - node.width * 0.5, Number(entry.y));
    node.opacity = 255;
    return node;
  }, this);

  return new Promise(function (resolve) {
    var remaining = lightNodes.length;
    lightNodes.forEach(function (node) {
      var finish = function () {
        if (node && cc.isValid(node)) {
          node.removeFromParent();
        }
        remaining -= 1;
        if (remaining === 0) {
          resolve();
        }
      };

      if (typeof cc.tween === "function") {
        cc.tween(node)
          .to(duration, { x: boardRight + node.width * 0.5 })
          .call(finish)
          .start();
      } else {
        node.runAction(cc.sequence(
          cc.moveTo(duration, boardRight + node.width * 0.5, node.y),
          cc.callFunc(finish)
        ));
      }
    });
  });
};

LevelRenderer.prototype._getMountedHudPanel = function () {
  if (!this.layers || !this.layers.hud) {
    return null;
  }

  var directPanel = this.layers.hud.getChildByName("HudPanel");
  if (directPanel) {
    return directPanel;
  }

  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode) {
    return null;
  }

  return gameViewNode.getChildByName("HudPanel");
};

LevelRenderer.prototype._bindBottomPanelButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__bottomPanelBoundAction === action) {
    return;
  }

  if (buttonNode.__bottomPanelHandlers) {
    if (typeof buttonNode.off !== "function") {
      throw new Error("Bottom panel button requires off support: " + buttonNode.name);
    }
    buttonNode.off(cc.Node.EventType.TOUCH_START, buttonNode.__bottomPanelHandlers.touchStart, this);
    buttonNode.off(cc.Node.EventType.TOUCH_END, buttonNode.__bottomPanelHandlers.touchEnd, this);
    buttonNode.off(cc.Node.EventType.TOUCH_CANCEL, buttonNode.__bottomPanelHandlers.touchCancel, this);
  }

  buttonNode.__bottomPanelBoundAction = action;
  var touchStartHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
  };
  var touchEndHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
    var button = buttonNode.getComponent(cc.Button);
    if (button && !button.interactable) {
      return;
    }
    this._invokeGameplayAction(action);
  };
  var touchCancelHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
  };

  buttonNode.__bottomPanelHandlers = {
    touchStart: touchStartHandler,
    touchEnd: touchEndHandler,
    touchCancel: touchCancelHandler
  };
  buttonNode.on(cc.Node.EventType.TOUCH_START, touchStartHandler, this);
  buttonNode.on(cc.Node.EventType.TOUCH_END, touchEndHandler, this);
  buttonNode.on(cc.Node.EventType.TOUCH_CANCEL, touchCancelHandler, this);
};

LevelRenderer.prototype._setBottomPanelButtonEnabled = function (buttonNode, enabled, options) {
  if (!buttonNode) {
    return;
  }

  var safeOptions = options && typeof options === "object" ? options : {};
  var dimWhenDisabled = safeOptions.dimWhenDisabled !== false;
  var button = buttonNode.getComponent(cc.Button);
  if (button) {
    button.interactable = !!enabled;
  }
  buttonNode.opacity = (!enabled && dimWhenDisabled) ? 150 : 255;
};

LevelRenderer.prototype._setShooterChangeButtonSpin = function (buttonNode, enabled) {
  if (!buttonNode) {
    return;
  }

  if (!enabled) {
    if (buttonNode.__changeButtonSpinEnabled) {
      buttonNode.stopAllActions();
      buttonNode.__changeButtonSpinEnabled = false;
      buttonNode.angle = 0;
    }
    return;
  }

  if (buttonNode.__changeButtonSpinEnabled) {
    return;
  }

  buttonNode.stopAllActions();
  buttonNode.angle = 0;
  buttonNode.__changeButtonSpinEnabled = true;
  buttonNode.runAction(
    cc.repeatForever(
      cc.rotateBy(1.6, -360)
    )
  );
};

LevelRenderer.prototype._setBottomPanelCount = function (buttonNode, count) {
  if (!buttonNode) {
    return;
  }

  var numBgNode = buttonNode.getChildByName("num_bg");
  var numNode = numBgNode ? numBgNode.getChildByName("num") : null;
  if (!numNode) {
    return;
  }

  var label = numNode.getComponent(cc.Label);
  if (!label) {
    label = numNode.addComponent(cc.Label);
  }
  label.string = String(Math.max(0, Math.floor(Number(count) || 0)));
};

LevelRenderer.prototype._setBottomPanelInventoryPresentation = function (buttonNode, count, adAction) {
  if (!buttonNode) {
    throw new Error("Bottom panel powerup button is required.");
  }
  if (typeof adAction !== "string" || !adAction) {
    throw new Error("Bottom panel ad action is required.");
  }

  var numBgNode = buttonNode.getChildByName("num_bg");
  var videoButtonNode = buttonNode.getChildByName("vido_btn");
  if (!numBgNode) {
    throw new Error("Bottom panel powerup button requires num_bg: " + buttonNode.name);
  }
  if (!videoButtonNode) {
    throw new Error("Bottom panel powerup button requires vido_btn: " + buttonNode.name);
  }

  var numericCount = Number(count);
  if (!Number.isFinite(numericCount)) {
    throw new Error("Bottom panel inventory count must be finite: " + buttonNode.name);
  }
  var inventoryCount = Math.max(0, Math.floor(numericCount));
  var hasInventory = inventoryCount > 0;
  buttonNode.active = true;
  numBgNode.active = hasInventory;
  videoButtonNode.active = !hasInventory;
  if (hasInventory) {
    this._setBottomPanelCount(buttonNode, inventoryCount);
  } else {
    this._bindBottomPanelButton(buttonNode, adAction);
    this._bindBottomPanelButton(videoButtonNode, adAction);
  }
};

LevelRenderer.prototype._rebindBottomPanelPowerupIcon = function (buttonNode, powerupType) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Bottom panel powerup icon requires valid button node.");
  }
  if (!POWERUP_ICON_RESOURCES || !POWERUP_ICON_RESOURCES[powerupType]) {
    throw new Error("Bottom panel powerup icon path missing: " + powerupType);
  }

  var iconNode = requireChildNode(buttonNode, "icon", "Bottom panel " + buttonNode.name);
  var sprite = iconNode.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("Bottom panel powerup icon requires cc.Sprite: " + buttonNode.name);
  }

  var spritePath = POWERUP_ICON_RESOURCES[powerupType];
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded bottom panel powerup icon: " + spritePath);
  }
  sprite.spriteFrame = spriteFrame;
};

LevelRenderer.prototype._renderBottomPanel = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    throw new Error("Bottom panel requires runtime snapshot.");
  }
  if (!this.layers || !this.layers.hud) {
    return;
  }

  var panel = this.layers.hud.getChildByName("BttomPanel");
  if (!panel) {
    return;
  }

  panel.active = true;
  if (!panel.__bottomPanelLayoutInitialized) {
    var panelWidget = panel.getComponent(cc.Widget);
    if (panelWidget && panelWidget.updateAlignment) {
      panelWidget.updateAlignment();
    }
    panel.__bottomPanelLayoutInitialized = true;
  }

  var propsScrollNode = requireChildNode(panel, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var rainbowButtonNode = requireChildNode(propsContentNode, "rainbow_btn", "BttomPanel/props_scroll/view/content");
  var changeButtonNode = requireChildNode(propsContentNode, "change_btn", "BttomPanel/props_scroll/view/content");
  var destroyButtonNode = requireChildNode(propsContentNode, "destroy_btn", "BttomPanel/props_scroll/view/content");
  var bombButtonNode = requireChildNode(propsContentNode, "bomb_btn", "BttomPanel/props_scroll/view/content");
  var threeLineButtonNode = requireChildNode(propsContentNode, "eliminate_three_line_btn", "BttomPanel/props_scroll/view/content");
  var plusBallButtonNode = requireChildNode(propsContentNode, "plus_ball_btn", "BttomPanel/props_scroll/view/content");
  var directionsButtonNode = requireChildNode(panel, "directions_btn", "BttomPanel");

  this._rebindBottomPanelPowerupIcon(rainbowButtonNode, "rainbow");
  this._rebindBottomPanelPowerupIcon(destroyButtonNode, "barrier_hammer");

  this._bindBottomPanelButton(rainbowButtonNode, "use_rainbow");
  this._bindBottomPanelButton(changeButtonNode, "use_swap");
  this._bindBottomPanelButton(destroyButtonNode, "use_barrier_hammer");
  this._bindBottomPanelButton(bombButtonNode, "use_blast");
  this._bindBottomPanelButton(threeLineButtonNode, "use_three_line_elimination");
  this._bindBottomPanelButton(plusBallButtonNode, "use_plus_three_balls");
  this._bindBottomPanelButton(directionsButtonNode, "open_prop_description");
  this._setBottomPanelButtonEnabled(directionsButtonNode, true, {
    dimWhenDisabled: false
  });

  var skillInventory = runtimeSnapshot && runtimeSnapshot.shooter && runtimeSnapshot.shooter.skillInventory
    ? runtimeSnapshot.shooter.skillInventory
    : {};
  var rainbowCount = Math.max(0, Math.floor(Number(skillInventory.rainbow) || 0));
  var blastCount = Math.max(0, Math.floor(Number(skillInventory.blast) || 0));
  var swapCount = Math.max(0, Math.floor(Number(skillInventory.swap) || 0));
  var destroyCount = Math.max(0, Math.floor(Number(skillInventory.barrier_hammer) || 0));
  if (!runtimeSnapshot.adRunPowerups || typeof runtimeSnapshot.adRunPowerups !== "object" || Array.isArray(runtimeSnapshot.adRunPowerups)) {
    throw new Error("Bottom panel requires adRunPowerups snapshot.");
  }
  if (!runtimeSnapshot.adRunPowerupAllowed || typeof runtimeSnapshot.adRunPowerupAllowed !== "object" || Array.isArray(runtimeSnapshot.adRunPowerupAllowed)) {
    throw new Error("Bottom panel requires adRunPowerupAllowed snapshot.");
  }
  var adRunPowerups = runtimeSnapshot.adRunPowerups;
  var adRunPowerupAllowed = runtimeSnapshot.adRunPowerupAllowed;
  var readAdRunPowerupCount = function (powerupType) {
    if (!Object.prototype.hasOwnProperty.call(adRunPowerups, powerupType)) {
      return 0;
    }
    var count = Number(adRunPowerups[powerupType]);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Bottom panel ad run powerup count must be a non-negative integer: " + powerupType);
    }
    return count;
  };
  var threeLineCount = readAdRunPowerupCount("three_line_elimination");
  var plusBallCount = readAdRunPowerupCount("plus_three_balls");
  var shooterSnapshot = runtimeSnapshot && runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var pendingBarrierHammer = !!shooterSnapshot.pendingBarrierHammer;
  var pendingRainbowColorSelection = !!shooterSnapshot.pendingRainbowColorSelection;
  var canUsePowerup = !!shooterSnapshot.canUsePowerups;
  var canUseRainbow = canUsePowerup && !pendingBarrierHammer && rainbowCount > 0;
  var canUseSwap = canUsePowerup && !pendingBarrierHammer && swapCount > 0;
  var canUseBarrierHammer = pendingBarrierHammer || (canUsePowerup && destroyCount > 0);
  var canUseBlast = canUsePowerup && !pendingBarrierHammer && blastCount > 0;
  var canUseThreeLine = canUsePowerup && !pendingBarrierHammer && threeLineCount > 0;
  var canUsePlusBall = canUsePowerup && !pendingBarrierHammer && !runtimeSnapshot.infiniteShots && plusBallCount > 0;

  this._setBottomPanelInventoryPresentation(rainbowButtonNode, rainbowCount, "recover_inventory:rainbow");
  this._setBottomPanelInventoryPresentation(changeButtonNode, swapCount, "recover_inventory:swap");
  this._setBottomPanelInventoryPresentation(destroyButtonNode, destroyCount, "recover_inventory:barrier_hammer");
  this._setBottomPanelInventoryPresentation(bombButtonNode, blastCount, "recover_inventory:blast");
  if (adRunPowerupAllowed.three_line_elimination === true) {
    this._setBottomPanelInventoryPresentation(threeLineButtonNode, threeLineCount, "recover_ad_powerup:three_line_elimination");
  } else if (threeLineButtonNode) {
    threeLineButtonNode.active = false;
  }
  if (adRunPowerupAllowed.plus_three_balls === true && !runtimeSnapshot.infiniteShots) {
    this._setBottomPanelInventoryPresentation(plusBallButtonNode, plusBallCount, "recover_ad_powerup:plus_three_balls");
  } else if (plusBallButtonNode) {
    plusBallButtonNode.active = false;
  }
  this._setBottomPanelButtonEnabled(rainbowButtonNode, rainbowCount > 0 ? canUseRainbow : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(changeButtonNode, swapCount > 0 ? canUseSwap : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(destroyButtonNode, destroyCount > 0 ? canUseBarrierHammer : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(bombButtonNode, blastCount > 0 ? canUseBlast : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(threeLineButtonNode, threeLineCount > 0 ? canUseThreeLine : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(plusBallButtonNode, plusBallCount > 0 ? canUsePlusBall : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
};

LevelRenderer.prototype._getHudTargetLayout = function (panel) {
  return requireChildNode(panel, "target_layout", "HudPanel");
};

LevelRenderer.prototype._resolveHudTargetSlot = function (targetLayout, slotName) {
  var cardName = "";
  if (slotName === "ball") {
    cardName = "item_ball";
  } else if (slotName === "ice_ball") {
    cardName = "item_ice_ball";
  } else {
    throw new Error("Unsupported HUD target slot: " + slotName);
  }

  var cardNode = requireChildNode(targetLayout, cardName, "HudPanel/target_layout");
  var targetNode = requireChildNode(cardNode, slotName, "HudPanel/target_layout/" + cardName);
  return {
    cardNode: cardNode,
    targetNode: targetNode,
    description: "HudPanel/target_layout/" + cardName + "/" + slotName
  };
};

LevelRenderer.prototype._renderHudTargets = function (panel, targetDisplay) {
  if (!targetDisplay || typeof targetDisplay !== "object" || Array.isArray(targetDisplay)) {
    throw new Error("HUD target display data must be an object.");
  }

  var targetLayout = this._getHudTargetLayout(panel);
  this._renderHudTargetSlot(targetLayout, "ball", targetDisplay.ball);
  this._renderHudTargetSlot(targetLayout, "ice_ball", targetDisplay.iceSnowball);

  var layout = targetLayout.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._renderHudTargetSlot = function (targetLayout, slotName, displayData) {
  var slot = this._resolveHudTargetSlot(targetLayout, slotName);
  var cardNode = slot.cardNode;
  var targetNode = slot.targetNode;
  var valueNode = requireChildNode(targetNode, "TargetValue", slot.description);
  var completeNode = requireChildNode(targetNode, "complete", slot.description);
  var valueLabel = valueNode.getComponent(cc.Label);
  if (!valueLabel) {
    throw new Error(slot.description + "/TargetValue requires cc.Label.");
  }

  if (!displayData) {
    cardNode.active = false;
    targetNode.active = false;
    valueNode.active = false;
    completeNode.active = false;
    valueLabel.string = "";
    return;
  }

  if (typeof displayData.iconCode !== "string" || !displayData.iconCode) {
    throw new Error("HUD target display iconCode is required: " + slotName);
  }
  if (typeof displayData.remaining !== "number" || !isFinite(displayData.remaining) || displayData.remaining < 0) {
    throw new Error("HUD target display remaining is required: " + slotName);
  }
  if (typeof displayData.remainingText !== "string" || !displayData.remainingText) {
    throw new Error("HUD target display remainingText is required: " + slotName);
  }

  var spritePath = BALL_RESOURCES[displayData.iconCode];
  if (!spritePath) {
    throw new Error("Unsupported HUD target icon code: " + displayData.iconCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD target sprite frame is missing: " + spritePath);
  }

  cardNode.active = true;
  targetNode.active = true;
  ensureSprite(targetNode, spriteFrame);
  var targetComplete = displayData.remaining <= 0;
  valueNode.active = !targetComplete;
  completeNode.active = targetComplete;
  valueLabel.string = displayData.remainingText;
};

LevelRenderer.prototype._readRuntimeIceSnowballCollectedTotal = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.objectives) {
    return 0;
  }
  var total = Number(runtimeSnapshot.objectives.iceCollectedTotal);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Runtime snapshot iceCollectedTotal must be a non-negative number.");
  }
  return Math.floor(total);
};

LevelRenderer.prototype._syncDisplayedIceSnowballCollectedTotal = function (runtimeSnapshot) {
  this.displayedIceSnowballCollectedTotal = this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
};

LevelRenderer.prototype._resolveIceSnowballHudDisplayProgress = function (runtimeSnapshot) {
  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
  }
  return Math.max(0, Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0));
};

LevelRenderer.prototype._buildHudTargetDisplayForRender = function (levelConfig, runtimeSnapshot) {
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  return applyIceSnowballHudDisplayProgress(
    hudTargetDisplay,
    this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
  );
};

LevelRenderer.prototype._incrementDisplayedIceSnowballCollectedTotal = function () {
  var next = Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0) + 1;
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error("Displayed ice snowball collected total must increment to a positive integer.");
  }
  this.displayedIceSnowballCollectedTotal = next;
};

LevelRenderer.prototype._refreshIceSnowballHudTarget = function () {
  if (!this.currentLevelConfig || !this.lastRuntimeSnapshot) {
    throw new Error("Ice snowball HUD target refresh requires level config and runtime snapshot.");
  }
  var panel = this._getMountedHudPanel();
  if (!panel) {
    return;
  }

  var targetLayout = this._getHudTargetLayout(panel);
  var hudTargetDisplay = this._buildHudTargetDisplayForRender(this.currentLevelConfig, this.lastRuntimeSnapshot);
  this._renderHudTargetSlot(targetLayout, "ice_ball", hudTargetDisplay.iceSnowball);
  var layout = targetLayout.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
  this.lastHudRenderKey = buildHudRenderKey(
    this.currentLevelConfig,
    this.lastRuntimeSnapshot,
    this._resolveIceSnowballHudDisplayProgress(this.lastRuntimeSnapshot)
  );
};

LevelRenderer.prototype._getHudTargetIceBallPositionInGameView = function () {
  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var iceCardNode = targetLayout ? targetLayout.getChildByName("item_ice_ball") : null;
  var ballNode = iceCardNode ? iceCardNode.getChildByName("ice_ball") : null;
  if (!iceCardNode || !iceCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }

  return this._convertNodePositionToGameView(ballNode);
};

LevelRenderer.prototype._convertBoardPointToGameView = function (x, y) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Board layer is required for coordinate conversion.");
  }
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) {
    throw new Error("Board point conversion requires finite x/y.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView is required for board point conversion.");
  }

  var worldPos = this.layers.board.convertToWorldSpaceAR(cc.v2(x, y));
  return gameViewNode.convertToNodeSpaceAR(worldPos);
};

LevelRenderer.prototype._resolveIceSnowballCollectStartPositionInGameView = function (entry, boardSnapshot) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Ice snowball collect entry is required.");
  }
  if (typeof entry.innerColor !== "string" || !entry.innerColor) {
    throw new Error("Ice snowball collect entry requires innerColor.");
  }

  if (typeof entry.x === "number" && typeof entry.y === "number" && isFinite(entry.x) && isFinite(entry.y)) {
    if (this.layers && this.layers.falling) {
      var gameViewNode = this._getGameViewNode();
      if (!gameViewNode || !gameViewNode.isValid) {
        throw new Error("GameView is required for falling drop collect position.");
      }
      var worldPos = this.layers.falling.convertToWorldSpaceAR(cc.v2(entry.x, entry.y));
      return gameViewNode.convertToNodeSpaceAR(worldPos);
    }
    return this._convertBoardPointToGameView(entry.x, entry.y);
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Ice snowball collect entry position requires board snapshot.");
  }
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
    throw new Error("Ice snowball collect entry requires row and col when x/y are missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    entry.row,
    entry.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._alignHudPanelToTop = function (panel) {
  // Keep for backward compatibility. HudPanel positioning is now driven by GameView's SafeArea+Widget.
  return;
};

LevelRenderer.prototype._setHudLabel = function (panel, childName, text) {
  var node = getOrCreateChild(panel, childName);
  var label = node.getComponent(cc.Label);
  if (!label) {
    label = node.addComponent(cc.Label);
  }
  label.string = text;
};

LevelRenderer.prototype._getHudProgressBar = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return null;
  }

  return progressNode.getComponent(cc.ProgressBar);
};

LevelRenderer.prototype._getHudStarNodes = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return [];
  }

  return [
    progressNode.getChildByName("star1"),
    progressNode.getChildByName("star2"),
    progressNode.getChildByName("star3") || progressNode.getChildByName("start3")
  ];
};

LevelRenderer.prototype._setHudStarLit = function (starNode, lit) {
  if (!starNode) {
    return;
  }

  var spritePath = lit ? HUD_STAR_RESOURCES.lit : HUD_STAR_RESOURCES.unlit;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD star sprite frame is missing: " + spritePath);
  }

  starNode.active = true;
  ensureSprite(starNode, spriteFrame);
  starNode.color = cc.color(255, 255, 255);
  starNode.opacity = 255;
};

LevelRenderer.prototype._getGameViewNode = function () {
  if (!this.layers || !this.layers.hud) {
    return null;
  }

  return this.layers.hud.getChildByName("GameView");
};

LevelRenderer.prototype._getHudStarParticleNode = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for HUD star particle.");
  }

  var particleNode = gameViewNode.getChildByName(HUD_STAR_PARTICLE_NODE_NAME);
  if (!particleNode || !particleNode.isValid) {
    throw new Error("GameView requires starParticle node.");
  }
  particleNode.zIndex = 1000;
  return particleNode;
};

LevelRenderer.prototype._convertNodePositionToGameView = function (node) {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for coordinate conversion.");
  }
  if (!node || !node.isValid || !node.parent || !node.parent.isValid) {
    throw new Error("Valid source node is required for coordinate conversion.");
  }

  var worldPosition = node.parent.convertToWorldSpaceAR(node.getPosition());
  return gameViewNode.convertToNodeSpaceAR(worldPosition);
};

LevelRenderer.prototype._resolveShooterParticleStartPosition = function () {
  var shooterPanel = this.layers && this.layers.shooter
    ? this.layers.shooter.getChildByName("ShooterPanel")
    : null;
  if (!shooterPanel || !shooterPanel.isValid) {
    throw new Error("ShooterPanel is required for HUD star particle start position.");
  }

  var shooterNode = requireChildNode(shooterPanel, "CurrentBallAnchor", "ShooterPanel");
  return this._convertNodePositionToGameView(shooterNode);
};

LevelRenderer.prototype._buildHudStarBezierPoints = function (startPosition, endPosition) {
  if (!startPosition || !endPosition) {
    throw new Error("HUD star particle bezier requires start and end positions.");
  }

  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  return [
    cc.v2(startPosition.x + deltaX * 0.28, startPosition.y + Math.max(120, deltaY * 0.28)),
    cc.v2(startPosition.x + deltaX * 0.72, endPosition.y + Math.max(80, Math.abs(deltaX) * 0.12)),
    cc.v2(endPosition.x, endPosition.y)
  ];
};

LevelRenderer.prototype._playHudStarPunch = function (starNode) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star punch requires a valid star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star punch requires cc.tween.");
  }

  starNode.stopAllActions();
  starNode.scale = 1;
  cc.tween(starNode)
    .to(HUD_STAR_PUNCH_UP_DURATION, { scale: HUD_STAR_PUNCH_SCALE })
    .to(HUD_STAR_PUNCH_DOWN_DURATION, { scale: 1 })
    .start();
};

LevelRenderer.prototype._playHudStarParticleToStar = function (starNode, onArrive, onComplete) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star particle requires a valid target star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star particle requires cc.tween.");
  }

  var particleNode = this._getHudStarParticleNode();
  var particleSystem = particleNode.getComponent(cc.ParticleSystem);
  if (!particleSystem) {
    throw new Error("GameView.starParticle requires cc.ParticleSystem.");
  }

  var startPosition = this._resolveShooterParticleStartPosition();
  var endPosition = this._convertNodePositionToGameView(starNode);
  particleNode.stopAllActions();
  particleNode.active = true;
  particleNode.setPosition(startPosition);
  if (typeof particleSystem.resetSystem !== "function") {
    throw new Error("GameView.starParticle ParticleSystem requires resetSystem.");
  }
  particleSystem.resetSystem();

  var bezierPoints = this._buildHudStarBezierPoints(startPosition, endPosition);
  cc.tween(particleNode)
    .bezierTo(
      HUD_STAR_PARTICLE_DURATION,
      bezierPoints[0],
      bezierPoints[1],
      bezierPoints[2]
    )
    .call(function () {
      if (typeof onArrive === "function") {
        onArrive();
      }
    })
    .delay(HUD_STAR_PARTICLE_HOLD_DURATION)
    .call(function () {
      if (typeof particleSystem.stopSystem === "function") {
        particleSystem.stopSystem();
      }
      particleNode.active = false;
      if (typeof onComplete === "function") {
        onComplete();
      }
    })
    .start();
};

LevelRenderer.prototype._runHudStarAnimationQueue = function () {
  this._ensureHudStarAnimationState();
  if (this.hudStarAnimationActive) {
    return;
  }
  if (this.hudStarAnimationQueue.length === 0) {
    return;
  }

  var item = this.hudStarAnimationQueue.shift();
  if (!item || !item.starNode || !item.starNode.isValid) {
    throw new Error("HUD star animation queue contains invalid target.");
  }

  this.hudStarAnimationActive = true;
  this._playHudStarParticleToStar(item.starNode, function () {
    this._setHudStarLit(item.starNode, true);
    this.hudStarDisplayedRating = Math.max(
      Math.floor(Number(this.hudStarDisplayedRating) || 0),
      Math.floor(Number(item.rating) || 0)
    );
    this._playHudStarPunch(item.starNode);
  }.bind(this), function () {
    this.hudStarAnimationActive = false;
    this._runHudStarAnimationQueue();
  }.bind(this));
};

LevelRenderer.prototype._queueHudStarUnlockAnimations = function (starNodes, nextRating) {
  this._ensureHudStarAnimationState();
  if (!Array.isArray(starNodes)) {
    throw new Error("HUD star unlock animation requires star nodes.");
  }
  var queuedRating = Math.max(0, Math.floor(Number(this.hudStarQueuedRating) || 0));
  if (nextRating <= queuedRating) {
    return;
  }

  for (var index = queuedRating; index < nextRating; index += 1) {
    var starNode = starNodes[index];
    if (!starNode || !starNode.isValid) {
      throw new Error("HUD star node is missing for rating index " + index + ".");
    }
    this.hudStarAnimationQueue.push({
      starNode: starNode,
      rating: index + 1
    });
  }
  this.hudStarQueuedRating = nextRating;
  this._runHudStarAnimationQueue();
};

LevelRenderer.prototype._resolveHudStarMarkerRatios = function (winStats) {
  var thresholds = winStats && winStats.starThresholds ? winStats.starThresholds : null;
  var star1 = Math.max(0, Number(thresholds && thresholds.star1) || 0);
  var star2 = Math.max(0, Number(thresholds && thresholds.star2) || 0);
  var star3 = Math.max(0, Number(thresholds && thresholds.star3) || 0);

  if (star3 <= 0) {
    return HUD_STAR_MARKER_FALLBACK_RATIOS.slice();
  }

  return [
    clamp(star1 / star3, 0, 1),
    clamp(star2 / star3, 0, 1),
    1
  ];
};

LevelRenderer.prototype._layoutHudStarMarkers = function (panel, winStats, starNodes) {
  var progressBar = this._getHudProgressBar(panel);
  if (!progressBar || !Array.isArray(starNodes) || !starNodes.length) {
    return;
  }

  var progressNode = progressBar.node || null;
  var progressSize = progressNode && progressNode.getContentSize
    ? progressNode.getContentSize()
    : null;
  var totalLength = Math.max(
    0,
    Number(progressBar.totalLength) ||
      (progressSize ? Number(progressSize.width) : 0) ||
      Number(progressNode && progressNode.width) ||
      0
  );
  if (totalLength <= 0) {
    return;
  }

  var markerRatios = this._resolveHudStarMarkerRatios(winStats);
  starNodes.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    var markerX = Math.round(totalLength * markerRatios[index] * 1000) / 1000;
    starNode.setPosition(markerX, starNode.y || 0);
  });
};

LevelRenderer.prototype._renderHudStarProgress = function (panel, runtimeSnapshot) {
  this._ensureHudStarAnimationState();
  var progressBar = this._getHudProgressBar(panel);
  var winStats = runtimeSnapshot && runtimeSnapshot.winStats ? runtimeSnapshot.winStats : null;
  var starProgress = winStats ? clamp(Number(winStats.starProgress) || 0, 0, 1) : 0;
  var starRating = winStats ? clamp(Math.floor(Number(winStats.starRating) || 0), 0, 3) : 0;

  if (progressBar) {
    progressBar.progress = starProgress;
  }

  var starNodes = this._getHudStarNodes(panel);
  this._layoutHudStarMarkers(panel, winStats, starNodes);
  if (this.lastHudStarRating === null) {
    this.lastHudStarRating = starRating;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    starNodes.forEach(function (starNode, index) {
      this._setHudStarLit(starNode, index < starRating);
    }, this);
    return;
  }

  var displayedRating = Math.max(0, Math.floor(Number(this.hudStarDisplayedRating) || 0));
  if (starRating < displayedRating) {
    this.hudStarAnimationQueue = [];
    this.hudStarAnimationActive = false;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    displayedRating = starRating;
  }

  starNodes.forEach(function (starNode, index) {
    this._setHudStarLit(starNode, index < displayedRating);
  }, this);
  this.lastHudStarRating = starRating;
  this._queueHudStarUnlockAnimations(starNodes, starRating);
};

}

module.exports = attachLevelRendererSceneHudMethods;
