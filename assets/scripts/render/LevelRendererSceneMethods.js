"use strict";

function attachLevelRendererSceneMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var WIN_BOTTLE_RESOURCES = deps.WIN_BOTTLE_RESOURCES;
  var JAR_RESOURCES = deps.JAR_RESOURCES;
  var JAR_MASK_RESOURCES = deps.JAR_MASK_RESOURCES;
  var REWARD_ITEM_RESOURCES = deps.REWARD_ITEM_RESOURCES;
  var HUD_STAR_RESOURCES = deps.HUD_STAR_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JAR_RENDER_Y_OFFSET = deps.JAR_RENDER_Y_OFFSET;
  var GUIDE_DOT_SPACING = deps.GUIDE_DOT_SPACING;
  var GUIDE_DOT_RADIUS = deps.GUIDE_DOT_RADIUS;
  var GUIDE_DOT_SIZE = deps.GUIDE_DOT_SIZE;
  var GUIDE_DOT_MAX_COUNT = deps.GUIDE_DOT_MAX_COUNT;
  var GUIDE_DOT_SPRITE_PATH = deps.GUIDE_DOT_SPRITE_PATH;
  var GUIDE_DOT_PULSE_DURATION = deps.GUIDE_DOT_PULSE_DURATION;
  var GUIDE_DOT_PULSE_SCALE_LARGE = deps.GUIDE_DOT_PULSE_SCALE_LARGE;
  var GUIDE_DOT_PULSE_SCALE_SMALL = deps.GUIDE_DOT_PULSE_SCALE_SMALL;
  var TEST_SLOT_RADIUS = deps.TEST_SLOT_RADIUS;
  var ICE_OVERLAY_OPACITY = deps.ICE_OVERLAY_OPACITY;
  var NEXT_SHOT_OFFSET_X = deps.NEXT_SHOT_OFFSET_X;
  var NEXT_SHOT_OFFSET_Y = deps.NEXT_SHOT_OFFSET_Y;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var NEXT_SHOT_BUBBLE_SIZE = deps.NEXT_SHOT_BUBBLE_SIZE;
  var JAR_RENDER_SIZE = deps.JAR_RENDER_SIZE;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
  var POPUP_OPEN_ANIM_DURATION = deps.POPUP_OPEN_ANIM_DURATION;
  var POPUP_OPEN_ANIM_FROM_SCALE = deps.POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_POPUP_OPEN_ANIM_DURATION = deps.WIN_POPUP_OPEN_ANIM_DURATION;
  var WIN_POPUP_OPEN_ANIM_FROM_SCALE = deps.WIN_POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_STAR_ANIM_START_DELAY = deps.WIN_STAR_ANIM_START_DELAY;
  var WIN_STAR_ANIM_STAGGER = deps.WIN_STAR_ANIM_STAGGER;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var IMPACT_DEFAULT_PUSH_DISTANCE = deps.IMPACT_DEFAULT_PUSH_DISTANCE;
  var IMPACT_MIN_PUSH_DURATION = deps.IMPACT_MIN_PUSH_DURATION;
  var IMPACT_MIN_RETURN_DURATION = deps.IMPACT_MIN_RETURN_DURATION;
  var IMPACT_RETURN_DURATION_RATIO = deps.IMPACT_RETURN_DURATION_RATIO;
  var SHOT_NO_DROP_SHAKE_OFFSET = deps.SHOT_NO_DROP_SHAKE_OFFSET;
  var SHOT_NO_DROP_SHAKE_STEP_DURATION = deps.SHOT_NO_DROP_SHAKE_STEP_DURATION;
  var ROUTE_LINE_WIDTH_ACTIVE = deps.ROUTE_LINE_WIDTH_ACTIVE;
  var ROUTE_LINE_WIDTH_IDLE = deps.ROUTE_LINE_WIDTH_IDLE;
  var ROUTE_POINT_RADIUS_ACTIVE = deps.ROUTE_POINT_RADIUS_ACTIVE;
  var ROUTE_POINT_RADIUS_IDLE = deps.ROUTE_POINT_RADIUS_IDLE;
  var ICE_THAW_SHAKE_OFFSET = deps.ICE_THAW_SHAKE_OFFSET;
  var ICE_THAW_SHAKE_STEP_DURATION = deps.ICE_THAW_SHAKE_STEP_DURATION;
  var ICE_COLLECT_FLY_DURATION = deps.ICE_COLLECT_FLY_DURATION;
  var ICE_COLLECT_BEZIER_ARC = deps.ICE_COLLECT_BEZIER_ARC;
  var SPLITTER_SPAWN_FLY_DURATION = deps.SPLITTER_SPAWN_FLY_DURATION;
  var SPLITTER_SPAWN_BEZIER_ARC = deps.SPLITTER_SPAWN_BEZIER_ARC;
  var loadSpriteFrame = deps.loadSpriteFrame;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildObjectiveDisplayData = deps.buildObjectiveDisplayData;
  var buildWinCompletedTargetEntries = deps.buildWinCompletedTargetEntries;
  var buildWinCollectEntries = deps.buildWinCollectEntries;
  var buildHudTargetDisplayData = deps.buildHudTargetDisplayData;
  var buildStateText = deps.buildStateText;
  var buildResultTexts = deps.buildResultTexts;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var buildHudRenderKey = deps.buildHudRenderKey;
  var buildJarRenderKey = deps.buildJarRenderKey;
  var buildGuidePathKey = deps.buildGuidePathKey;
  var clipGuidePathToDistance = deps.clipGuidePathToDistance;
  var pointDistance = deps.pointDistance;
  var resolveImpactBounceSpeed = deps.resolveImpactBounceSpeed;
  var getJarBaseY = deps.getJarBaseY;
  var resolveBallCode = deps.resolveBallCode;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var computeShooterAngle = deps.computeShooterAngle;
  var createRouteColor = deps.createRouteColor;
  var buildAdReviveDescription = deps.buildAdReviveDescription;
  var resolveLoseRewardEntry = deps.resolveLoseRewardEntry;
  var clamp = deps.clamp;
  var DANGER_WARNING_SHAKE_LEFT_X = -20;
  var DANGER_WARNING_SHAKE_RIGHT_X = 18;
  var DANGER_WARNING_SHAKE_STEP = 0.045;
  var HUD_STAR_MARKER_FALLBACK_RATIOS = [0.3 / 0.85, 0.6 / 0.85, 1];
  var LOSE_RETRY_CENTER_X = 0;

  function setLoseRetryButtonPosition(retryButtonNode, canRevive) {
    if (!retryButtonNode) {
      throw new Error("LoseView requires btn_retry.");
    }
    if (typeof retryButtonNode.x !== "number" || typeof retryButtonNode.y !== "number") {
      throw new Error("LoseView btn_retry position is invalid.");
    }
    if (typeof retryButtonNode._loseRetryOriginalX !== "number") {
      retryButtonNode._loseRetryOriginalX = retryButtonNode.x;
    }

    var nextX = canRevive ? retryButtonNode._loseRetryOriginalX : LOSE_RETRY_CENTER_X;
    retryButtonNode.setPosition(nextX, retryButtonNode.y);
  }

  function requireChildNode(parentNode, childName, parentDescription) {
    if (!parentNode || !parentNode.isValid) {
      throw new Error(parentDescription + " is required.");
    }
    var childNode = parentNode.getChildByName(childName);
    if (!childNode || !childNode.isValid) {
      throw new Error(parentDescription + "/" + childName + " is required.");
    }
    return childNode;
  }

  var DANGER_NORMAL_BAND_OPACITY = 110;
  var DANGER_WARNING_BAND_OPACITY = 215;
  var DANGER_NORMAL_LABEL_COLOR = cc.color(255, 250, 235);
  var DANGER_WARNING_LABEL_COLOR = cc.color(255, 236, 220);
  var DANGER_NORMAL_OUTLINE_COLOR = cc.color(151, 86, 86);
  var DANGER_WARNING_OUTLINE_COLOR = cc.color(148, 28, 28);
  var DANGER_WARNING_ROW_THRESHOLD = Math.max(1, Number(BoardLayout.rowHeight) || 64);
  var HUD_STAR_PARTICLE_NODE_NAME = "starParticle";
  var HUD_STAR_PARTICLE_DURATION = 0.7;
  var RAINBOW_COLOR_SELECTOR_BUTTON_SIZE = 72;
  var RAINBOW_COLOR_SELECTOR_RADIUS = 142;
  var RAINBOW_COLOR_SELECTOR_ANGLE_STEP = 35;
  var RAINBOW_COLOR_SELECTOR_MAX_SPREAD = 140;
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

LevelRenderer.prototype._mountGameViewScaffold = function () {
  if (!this.layers) {
    return;
  }

  var gameViewNode = this.prefabFactory.instantiate(PREFAB_PATHS.gameView, this.layers.hud, "GameView");
  if (!gameViewNode) {
    return;
  }
  gameViewNode.setPosition(0, 0);
  gameViewNode.active = true;

  var mountedBgNode = this._moveGameViewChildToLayer(gameViewNode, "bg", this.layers.background, "bg");
  var mountedDangerLineNode = this._moveGameViewChildToLayer(gameViewNode, "DangerLine", this.layers.dangerLine, "DangerLine");
  var mountedBottomPanelNode = this._moveGameViewChildToLayer(gameViewNode, "BttomPanel", this.layers.hud, "BttomPanel");
  this._flushGameViewScaffoldLayout([
    gameViewNode,
    mountedBgNode,
    mountedDangerLineNode,
    mountedBottomPanelNode
  ]);
};

LevelRenderer.prototype._moveGameViewChildToLayer = function (gameViewNode, childName, targetLayer, targetName) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required before moving child: " + childName);
  }
  if (!targetLayer || !targetLayer.isValid) {
    throw new Error("GameView child target layer is required: " + childName);
  }

  var child = gameViewNode.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error("GameView requires child node: " + childName);
  }

  child.removeFromParent(false);
  child.name = targetName || childName;
  child.parent = targetLayer;
  child.active = true;
  return child;
};

LevelRenderer.prototype._flushGameViewScaffoldLayout = function (nodes) {
  if (!Array.isArray(nodes)) {
    throw new Error("GameView scaffold layout nodes must be an array.");
  }

  nodes.forEach(function (node) {
    if (!node || !node.isValid) {
      throw new Error("GameView scaffold layout node is invalid.");
    }

    var safeArea = node.getComponent(cc.SafeArea);
    if (safeArea && safeArea.enabled && typeof safeArea.updateArea === "function") {
      safeArea.updateArea();
    }

    var widget = node.getComponent(cc.Widget);
    if (widget && widget.enabled && typeof widget.updateAlignment === "function") {
      widget.updateAlignment();
    }
  });
};

LevelRenderer.prototype._renderBackground = function () {
  var mountedBgNode = this.layers && this.layers.background
    ? (this.layers.background.getChildByName("bg") || this.layers.background.getChildByName("Background"))
    : null;
  if (mountedBgNode) {
    mountedBgNode.active = true;
    return;
  }

  var sceneBgNode = this.rootNode
    ? (this.rootNode.getChildByName("bg") || this.rootNode.getChildByName("Bg"))
    : null;
  var runtimeBgNode = this.layers && this.layers.background
    ? this.layers.background.getChildByName("Background")
    : null;
  if (sceneBgNode) {
    sceneBgNode.active = true;
    if (runtimeBgNode) {
      runtimeBgNode.active = false;
    }
    return;
  }

  throw new Error("Game background node is required. Mount GameView prefab with static bg sprite.");
};

LevelRenderer.prototype._getMountedBgNode = function () {
  if (!this.layers || !this.layers.background) {
    throw new Error("Background layer is required.");
  }

  var bgNode = this.layers.background.getChildByName("bg");
  if (!bgNode || !bgNode.isValid) {
    throw new Error("Mounted GameView bg node is required.");
  }

  return bgNode;
};

LevelRenderer.prototype._resolveMainlandNode = function () {
  var mainlandNode = this._getMountedBgNode().getChildByName("mainland");
  if (!mainlandNode || !mainlandNode.isValid) {
    throw new Error("GameView bg/mainland node is required.");
  }

  return mainlandNode;
};

LevelRenderer.prototype._resolveTopRowBubbleVisualTopY = function (boardSnapshot) {
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Top row bubble visual top requires board snapshot.");
  }
  if (typeof boardSnapshot.topAttachY !== "number" || !isFinite(boardSnapshot.topAttachY)) {
    throw new Error("Board snapshot topAttachY must be a finite number.");
  }
  if (typeof boardSnapshot.dropOffsetRows !== "number" || !isFinite(boardSnapshot.dropOffsetRows)) {
    throw new Error("Board snapshot dropOffsetRows must be a finite number.");
  }
  if (!Array.isArray(boardSnapshot.cells)) {
    throw new Error("Board snapshot cells must be an array.");
  }
  if (typeof boardSnapshot.maxColumns !== "number" || !isFinite(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
    throw new Error("Board snapshot maxColumns must be a positive finite number.");
  }

  var bubbleRadius = Number(BoardLayout.bubbleRadius);
  if (!isFinite(bubbleRadius) || bubbleRadius <= 0) {
    throw new Error("BoardLayout.bubbleRadius must be a positive finite number.");
  }

  var topRow = null;
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Board snapshot cell entry must be an object.");
    }
    var row = Math.floor(Number(cell.row));
    if (!Number.isInteger(row) || row < 0) {
      throw new Error("Board snapshot cell row must be a non-negative integer.");
    }
    if (topRow === null || row < topRow) {
      topRow = row;
    }
  });

  if (topRow === null) {
    return boardSnapshot.topAttachY + bubbleRadius;
  }

  var topRowCenter = BoardLayout.getCellPosition(
    topRow,
    0,
    boardSnapshot.maxColumns,
    boardSnapshot.dropOffsetRows
  );
  return topRowCenter.y + bubbleRadius;
};

LevelRenderer.prototype._alignNodeYToTopRowBubbleVisualTop = function (node, localSpaceRoot, boardSnapshot) {
  if (!node || !node.isValid) {
    throw new Error("Top row bubble alignment requires a valid target node.");
  }
  if (!localSpaceRoot || !localSpaceRoot.isValid) {
    throw new Error("Top row bubble alignment requires a valid local space root node.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Board layer is required for top row bubble alignment.");
  }

  var topRowVisualTopY = this._resolveTopRowBubbleVisualTopY(boardSnapshot);
  var boardTopWorld = this.layers.board.convertToWorldSpaceAR(cc.v2(0, topRowVisualTopY));
  var anchorPosInLocal = localSpaceRoot.convertToNodeSpaceAR(boardTopWorld);
  node.active = true;
  node.setPosition(node.x, anchorPosInLocal.y);
};

LevelRenderer.prototype._renderMainland = function (boardSnapshot) {
  var mainlandNode = this._resolveMainlandNode();
  var bgNode = mainlandNode.parent;
  if (!bgNode || !bgNode.isValid) {
    throw new Error("Mainland parent bg node is required.");
  }

  this._alignNodeYToTopRowBubbleVisualTop(mainlandNode, bgNode, boardSnapshot);
};

LevelRenderer.prototype._resolveJianbianNode = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jianbian alignment.");
  }

  var jianbianNode = gameViewNode.getChildByName("jianbian");
  if (!jianbianNode || !jianbianNode.isValid) {
    throw new Error("GameView/jianbian node is required.");
  }

  return jianbianNode;
};

LevelRenderer.prototype._renderJianbian = function (boardSnapshot) {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jianbian alignment.");
  }

  var jianbianNode = this._resolveJianbianNode();
  this._alignNodeYToTopRowBubbleVisualTop(jianbianNode, gameViewNode, boardSnapshot);
};

LevelRenderer.prototype._renderHud = function (levelConfig, runtimeSnapshot) {
  var panel = this._getMountedHudPanel();
  if (!panel) {
    Logger.warn("HudPanel not found in mounted GameView.");
    return;
  }
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);

  // this._setHudLabel(panel, "LevelTitle", "关卡");
  this._setHudLabel(panel, "LevelValue", String(levelConfig.level.levelId));
  // this._setHudLabel(panel, "ScoreTitle", "得分");
  this._setHudLabel(panel, "ScoreValue", String(runtimeSnapshot.score));
  this._renderHudLeftBall(panel, runtimeSnapshot);
  // this._setHudLabel(panel, "TargetTitle", "目标:");
  this._renderHudTargets(panel, hudTargetDisplay);
  this._renderHudStarProgress(panel, runtimeSnapshot);
  var setButtonNode = requireChildNode(panel, "set_btn", "HudPanel");
  this._bindBottomPanelButton(setButtonNode, "open_settings");
  this._setBottomPanelButtonEnabled(setButtonNode, true, {
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
  if (!this.layers || !this.layers.overlay) {
    throw new Error("Three-line elimination animation requires overlay layer.");
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
    node.parent = this.layers.overlay;
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

  this._bindBottomPanelButton(rainbowButtonNode, "use_rainbow");
  this._bindBottomPanelButton(changeButtonNode, "use_swap");
  this._bindBottomPanelButton(destroyButtonNode, "use_barrier_hammer");
  this._bindBottomPanelButton(bombButtonNode, "use_blast");
  this._bindBottomPanelButton(threeLineButtonNode, "use_three_line_elimination");
  this._bindBottomPanelButton(plusBallButtonNode, "use_plus_three_balls");

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

LevelRenderer.prototype._renderHudLeftBall = function (panel, runtimeSnapshot) {
  var leftBallNode = requireChildNode(panel, "LeftBall", "HudPanel");
  var leftBallLabel = leftBallNode.getComponent(cc.Label);
  if (!leftBallLabel) {
    throw new Error("HudPanel/LeftBall requires cc.Label.");
  }
  if (!runtimeSnapshot || !Number.isInteger(runtimeSnapshot.remainingShots) || runtimeSnapshot.remainingShots < 0) {
    throw new Error("HUD LeftBall requires non-negative integer remainingShots.");
  }

  leftBallNode.active = true;
  leftBallLabel.string = String(runtimeSnapshot.remainingShots);
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

LevelRenderer.prototype._getHudTargetBallPositionInBoard = function () {
  if (!this.layers || !this.layers.hud || !this.layers.board) {
    return null;
  }

  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var iceCardNode = targetLayout ? targetLayout.getChildByName("item_ice_ball") : null;
  var ballNode = iceCardNode ? iceCardNode.getChildByName("ice_ball") : null;
  if (!iceCardNode || !iceCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }

  var worldPos = ballNode.parent.convertToWorldSpaceAR(ballNode.getPosition());
  return this.layers.board.convertToNodeSpaceAR(worldPos);
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

  var shooterNode = shooterPanel.getChildByName("CurrentBallAnchor") || shooterPanel.getChildByName("ShooterBase");
  if (!shooterNode || !shooterNode.isValid) {
    throw new Error("Shooter visual node is required for HUD star particle start position.");
  }
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

  function isBoardSpecialPrefabCell(cell) {
    return !!(
      cell &&
      (
        cell.entityType === "molotov" ||
        cell.entityType === "splitter" ||
        cell.entityType === "locked" ||
        cell.entityType === "key"
      )
    );
  }

  function buildBoardCellRenderKey(cell, boardSnapshot) {
    if (!cell || !cell.id) {
      throw new Error("Board cell render key requires cell id.");
    }
    if (!boardSnapshot || typeof boardSnapshot !== "object") {
      throw new Error("Board cell render key requires board snapshot.");
    }
    return [
      String(cell.id),
      cell.row,
      cell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.dropOffsetRows,
      resolveBoardBubblePrefabPath(cell),
      resolveBallVisualKey(cell)
    ].join("|");
  }

  function resolveBoardBubblePrefabPath(cell) {
    if (!cell || !isBoardSpecialPrefabCell(cell)) {
      return PREFAB_PATHS.bubbleItem;
    }
    if (cell.entityType === "molotov") {
      return PREFAB_PATHS.fireBubbleItem;
    }
    if (cell.entityType === "splitter") {
      return PREFAB_PATHS.splitBubbleItem;
    }
    if (cell.entityType === "locked") {
      return PREFAB_PATHS.lockingBubbleItem;
    }
    if (cell.entityType === "key") {
      return PREFAB_PATHS.keyBubbleItem;
    }
    throw new Error("Unsupported board special prefab entityType: " + cell.entityType);
  }

  function getNodePool(poolMap, prefabPath) {
    if (!poolMap || typeof poolMap !== "object" || Array.isArray(poolMap)) {
      throw new Error("Board node pool map is required.");
    }
    if (typeof prefabPath !== "string" || !prefabPath) {
      throw new Error("Board node pool prefabPath is required.");
    }
    if (!Array.isArray(poolMap[prefabPath])) {
      poolMap[prefabPath] = [];
    }
    return poolMap[prefabPath];
  }

  function requireVisualChild(node, childName, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    var child = node.getChildByName(childName);
    if (!child || !child.isValid) {
      throw new Error(ownerName + " requires child `" + childName + "`.");
    }
    return child;
  }

  function instantiateRequired(prefabFactory, prefabPath, parent, name, ownerName) {
    if (!prefabFactory || typeof prefabFactory.instantiate !== "function") {
      throw new Error(ownerName + " requires prefabFactory.instantiate.");
    }
    var node = prefabFactory.instantiate(prefabPath, parent, name);
    if (!node || !node.isValid) {
      throw new Error(ownerName + " prefab instantiate failed: " + prefabPath);
    }
    return node;
  }

  function requireNodePrefabPath(node, ownerName) {
    if (!node || typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error(ownerName + " requires __bubblePrefabPath.");
    }
    return node.__bubblePrefabPath;
  }

  function findUnlockedTargetsForKey(keyCell, unlockedCells) {
    if (!keyCell || typeof keyCell.unlockGroup !== "string" || !keyCell.unlockGroup) {
      throw new Error("Key unlock animation requires key unlockGroup.");
    }
    if (!Array.isArray(unlockedCells)) {
      throw new Error("Key unlock animation requires unlockedCells array.");
    }
    var candidates = unlockedCells.filter(function (cell) {
      return !!(cell && cell.__sourceUnlockGroup === keyCell.unlockGroup);
    });
    if (!candidates.length) {
      throw new Error("Key unlock animation requires unlocked target cells for group: " + keyCell.unlockGroup);
    }
    candidates.sort(function (a, b) {
      var rowDelta = Math.abs(a.row - keyCell.row) - Math.abs(b.row - keyCell.row);
      if (rowDelta !== 0) {
        return rowDelta;
      }
      return Math.abs(a.col - keyCell.col) - Math.abs(b.col - keyCell.col);
    });
    return candidates;
  }

  function createKeyUnlockAnimationKey(resolution) {
    var keys = Array.isArray(resolution && resolution.collectedKeys) ? resolution.collectedKeys : [];
    var unlocked = Array.isArray(resolution && resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
    return keys.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col + ":" + cell.unlockGroup;
    }).join("|") + "->" + unlocked.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col + ":" + cell.__sourceUnlockGroup;
    }).join("|");
  }

  function resolveKeyUnlockTargetNode(renderer, targetCell) {
    if (!targetCell || !targetCell.id) {
      throw new Error("Key unlock animation requires target cell id.");
    }
    var normalizedId = String(targetCell.id);
    var targetNode = renderer.boardBubbleNodes[normalizedId];
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    targetNode = renderer.layers.board.getChildByName("Bubble_" + normalizedId);
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    return null;
  }

  function resolveKeyUnlockMotionProgress(linearProgress) {
    if (typeof linearProgress !== "number" || !isFinite(linearProgress)) {
      throw new Error("Key unlock motion progress must be finite.");
    }
    var strength = 0.72;
    return linearProgress + Math.sin(linearProgress * Math.PI * 2) * strength / (Math.PI * 2);
  }

  function applyKeyUnlockFlyFrame(keyFx, startPosition, targetPosition, linearProgress, arcHeight) {
    if (!keyFx || !keyFx.isValid) {
      throw new Error("Key unlock fly node must remain valid during animation.");
    }
    if (!startPosition || !targetPosition) {
      throw new Error("Key unlock fly animation requires start and target positions.");
    }
    if (typeof arcHeight !== "number" || !isFinite(arcHeight)) {
      throw new Error("Key unlock fly arc height must be finite.");
    }

    var motionProgress = resolveKeyUnlockMotionProgress(linearProgress);
    var arcProgress = Math.sin(motionProgress * Math.PI);
    keyFx.x = startPosition.x + (targetPosition.x - startPosition.x) * motionProgress;
    keyFx.y = startPosition.y + (targetPosition.y - startPosition.y) * motionProgress + arcHeight * arcProgress;
    keyFx.scale = 1 + (0.72 - 1) * motionProgress;
  }

  function createSplitterSpawnAnimationKey(resolution) {
    var spawned = Array.isArray(resolution && resolution.spawnedBySplitters) ? resolution.spawnedBySplitters : [];
    return spawned.map(function (cell) {
      return String(cell.id) + "<-" + String(cell.sourceSplitterId) + "@" + cell.row + ":" + cell.col;
    }).join("|");
  }

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

LevelRenderer.prototype._renderBoard = function (boardSnapshot) {
  this.lastBoardVersion = boardSnapshot.version;
  this.boardRenderTick += 1;
  var currentTick = this.boardRenderTick;
  if (!this.boardCellRenderKeys || typeof this.boardCellRenderKeys !== "object") {
    this.boardCellRenderKeys = {};
  }

  boardSnapshot.cells.forEach(function (cell) {
    var cellId = String(cell.id);
    var renderKey = buildBoardCellRenderKey(cell, boardSnapshot);
    var cachedRenderKey = this.boardCellRenderKeys[cellId];
    var existingNode = this.boardBubbleNodes[cellId];
    if (existingNode && cachedRenderKey === renderKey) {
      existingNode.__boardTick = currentTick;
      this._applySplitterSpawnHiddenBoardState(existingNode, cell.id);
      return;
    }

    this.boardCellRenderKeys[cellId] = renderKey;
    var cellPosition = BoardLayout.getCellPosition(cell.row, cell.col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
    var bubbleNode = this._acquireBoardBubbleNode(cell);
    bubbleNode.__boardTick = currentTick;
    bubbleNode.setPosition(cellPosition.x, cellPosition.y);
    bubbleNode.setScale(1);
    bubbleNode.opacity = 255;
    this._applyBoardBubbleVisualCached(bubbleNode, cell, BOARD_BUBBLE_SIZE);
    this._applySplitterSpawnHiddenBoardState(bubbleNode, cell.id);
  }, this);

  this._recycleInactiveBoardBubbleNodes(currentTick);
};

LevelRenderer.prototype._acquireBoardBubbleNode = function (cell) {
  if (!cell || !cell.id) {
    throw new Error("Board bubble node requires cell id.");
  }
  var nodeId = String(cell.id);
  var existing = this.boardBubbleNodes[nodeId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(cell);
    if (existing.__bubblePrefabPath !== expectedPath) {
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(existing, "Board bubble node")).push(existing);
      delete this.boardBubbleNodes[nodeId];
    } else {
      this._resetBubblePrefabNode(existing, cell);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(cell);
  var pool = getNodePool(this.boardBubbleNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Board bubble node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, cell);

  node.name = "Bubble_" + nodeId;
  if (node.parent !== this.layers.board) {
    node.parent = this.layers.board;
  }
  node.active = true;
  node.setScale(1);
  this.boardBubbleNodes[nodeId] = node;
  return node;
};

LevelRenderer.prototype._resetBubblePrefabNode = function (node, cell) {
  if (!node || !node.isValid) {
    throw new Error("Bubble prefab node is required.");
  }
  node.stopAllActions();
  node.angle = 0;
  node.opacity = 255;
  node.active = true;

  if (cell && cell.entityType === "key") {
    requireVisualChild(node, "Icon", "KeyBubbleItem").active = true;
    requireVisualChild(node, "key", "KeyBubbleItem").active = true;
  } else if (cell && cell.entityType === "locked") {
    requireVisualChild(node, "Icon", "LockingBubbleItem").active = true;
    requireVisualChild(node, "lock", "LockingBubbleItem").active = true;
  }
};

LevelRenderer.prototype._applyBoardBubbleVisualCached = function (node, cell, forcedSize) {
  if (!node || !cell) {
    throw new Error("Board bubble visual requires node and cell.");
  }

  if (cell.entityType === "key" || cell.entityType === "molotov") {
    node.__ballVisualKey = "prefab:" + cell.entityType;
    return;
  }

  if (cell.entityType === "locked") {
    if (typeof cell.lockedColor !== "string" || !cell.lockedColor) {
      throw new Error("LockingBubbleItem visual requires lockedColor.");
    }
    this._applyBallVisualCached(node, { color: cell.lockedColor }, forcedSize);
    return;
  }

  if (cell.entityType === "splitter") {
    this._applyBallVisualCached(node, cell, forcedSize);
    return;
  }

  this._applyBallVisualCached(node, cell, forcedSize);
};

LevelRenderer.prototype._recycleInactiveBoardBubbleNodes = function (activeTick) {
  for (var cellId in this.boardBubbleNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.boardBubbleNodes, cellId)) {
      continue;
    }

    var node = this.boardBubbleNodes[cellId];
    if (node && node.__boardTick === activeTick) {
      continue;
    }

    if (node) {
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(node, "Board bubble node")).push(node);
    }

    delete this.boardBubbleNodes[cellId];
    if (this.boardCellRenderKeys && Object.prototype.hasOwnProperty.call(this.boardCellRenderKeys, cellId)) {
      delete this.boardCellRenderKeys[cellId];
    }
  }
};

LevelRenderer.prototype._renderFallingDrops = function (runtimeSnapshot) {
  if (!this.layers || !this.layers.falling) {
    return;
  }

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var drops = fallingSnapshot && fallingSnapshot.activeDrops ? fallingSnapshot.activeDrops : [];
  this.fallingRenderTick += 1;
  var currentTick = this.fallingRenderTick;
  if (!drops.length) {
    this._recycleInactiveFallingDropNodes(currentTick);
    this.lastRenderedFallingCount = 0;
    return;
  }

  drops.forEach(function (drop) {
    var dropId = String(drop.id);
    if (!dropId) {
      return;
    }

    var dropNode = this._acquireFallingDropNode(drop);
    dropNode.__fallingTick = currentTick;
    dropNode.setPosition(drop.position.x, drop.position.y);
    dropNode.angle = drop.rotation || 0;
    dropNode.opacity = 230;
    this._applyBoardBubbleVisualCached(dropNode, drop, BOARD_BUBBLE_SIZE);
  }, this);
  this._recycleInactiveFallingDropNodes(currentTick);
  this.lastRenderedFallingCount = drops.length;
};

LevelRenderer.prototype._acquireFallingDropNode = function (drop) {
  if (!drop || !drop.id) {
    throw new Error("Falling drop node requires drop id.");
  }
  var dropId = String(drop.id);
  var existing = this.fallingDropNodes[dropId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(drop);
    if (existing.__bubblePrefabPath !== expectedPath) {
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(existing, "Falling drop node")).push(existing);
      delete this.fallingDropNodes[dropId];
    } else {
      this._resetBubblePrefabNode(existing, drop);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(drop);
  var pool = getNodePool(this.fallingDropNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Falling drop node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, drop);

  node.name = "Falling_" + dropId;
  if (node.parent !== this.layers.falling) {
    node.parent = this.layers.falling;
  }
  node.setScale(1);
  node.active = true;
  this.fallingDropNodes[dropId] = node;
  return node;
};

LevelRenderer.prototype._recycleInactiveFallingDropNodes = function (activeTick) {
  for (var dropId in this.fallingDropNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.fallingDropNodes, dropId)) {
      continue;
    }
    var node = this.fallingDropNodes[dropId];
    if (node && node.__fallingTick === activeTick) {
      continue;
    }

    if (node) {
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(node, "Falling drop node")).push(node);
    }
    delete this.fallingDropNodes[dropId];
  }
};

LevelRenderer.prototype._playKeyUnlockAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var collectedKeys = resolution && Array.isArray(resolution.collectedKeys) ? resolution.collectedKeys : [];
  var unlockedCells = resolution && Array.isArray(resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
  if (!collectedKeys.length || !unlockedCells.length) {
    return;
  }

  var animationKey = createKeyUnlockAnimationKey(resolution);
  if (!animationKey || animationKey === this.lastKeyUnlockAnimationKey) {
    return;
  }
  this.lastKeyUnlockAnimationKey = animationKey;

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Key unlock animation requires board snapshot.");
  }
  if (typeof cc === "undefined" || !cc || typeof cc.tween !== "function") {
    throw new Error("Key unlock animation requires cc.tween.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Key unlock animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = 0.62;
  var lockShakeStep = 0.04;
  var lockShakeOffset = 8;
  var playedUnlockGroups = {};

  collectedKeys.forEach(function (keyCell) {
    if (!keyCell || typeof keyCell.unlockGroup !== "string" || !keyCell.unlockGroup) {
      throw new Error("Key unlock animation requires collected key unlockGroup.");
    }
    if (playedUnlockGroups[keyCell.unlockGroup]) {
      return;
    }
    playedUnlockGroups[keyCell.unlockGroup] = true;

    var targetCells = findUnlockedTargetsForKey(keyCell, unlockedCells);
    var primaryTarget = targetCells[0];
    var keyPosition = BoardLayout.getCellPosition(keyCell.row, keyCell.col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
    var targetPosition = BoardLayout.getCellPosition(primaryTarget.row, primaryTarget.col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
    var travelDistance = pointDistance(keyPosition, targetPosition);
    var arcHeight = Math.max(64, Math.min(140, travelDistance * 0.28));

    var keyFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.keyBubbleItem, this.layers.board, "KeyUnlockFly_" + keyCell.id, "Key unlock animation KeyBubbleItem");
    keyFx.setPosition(keyPosition.x, keyPosition.y);
    keyFx.setScale(1);
    keyFx.opacity = 255;
    keyFx.zIndex = 120;
    requireVisualChild(keyFx, "Icon", "KeyBubbleItem").active = false;
    requireVisualChild(keyFx, "key", "KeyBubbleItem").active = true;

    var lockFxNodes = targetCells.map(function (targetCell) {
      var targetNode = resolveKeyUnlockTargetNode(this, targetCell);
      if (targetNode) {
        targetNode.opacity = 0;
      }

      var lockPosition = BoardLayout.getCellPosition(targetCell.row, targetCell.col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
      var lockFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.lockingBubbleItem, this.layers.board, "LockUnlockFx_" + targetCell.id, "Key unlock animation LockingBubbleItem");
      lockFx.setPosition(lockPosition.x, lockPosition.y);
      lockFx.setScale(1);
      lockFx.opacity = 255;
      lockFx.zIndex = 110;
      this._applyBoardBubbleVisualCached(lockFx, {
        entityType: "locked",
        lockedColor: targetCell.color
      }, BOARD_BUBBLE_SIZE);
      return {
        targetNode: targetNode,
        lockFx: lockFx,
        lockNode: requireVisualChild(lockFx, "lock", "LockingBubbleItem")
      };
    }, this);

    var cleanup = function () {
      if (keyFx && keyFx.isValid) {
        keyFx.removeFromParent(true);
      }
      lockFxNodes.forEach(function (entry) {
        if (entry.targetNode && entry.targetNode.isValid) {
          entry.targetNode.opacity = 255;
        }
        if (entry.lockFx && entry.lockFx.isValid) {
          entry.lockFx.removeFromParent(true);
        }
      });
    };

    var shakeLocks = function () {
      var remaining = lockFxNodes.length;
      var markDone = function () {
        remaining -= 1;
        if (remaining <= 0) {
          cleanup();
        }
      };

      lockFxNodes.forEach(function (entry) {
        var lockNode = entry.lockNode;
        lockNode.stopAllActions();
        var baseX = lockNode.x;
        var baseY = lockNode.y;
        cc.tween(lockNode)
          .to(lockShakeStep, { x: baseX - lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX - lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX, y: baseY, opacity: 0 })
          .call(markDone)
          .start();
      });
    };

    var flyState = { progress: 0 };
    cc.tween(flyState)
      .to(flyDuration, {
        progress: 1
      }, {
        progress: function (start, end, current, ratio) {
          var linearProgress = start + (end - start) * ratio;
          applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, linearProgress, arcHeight);
          return linearProgress;
        }
      })
      .call(function () {
        applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, 1, arcHeight);
        cc.tween(keyFx)
          .to(0.08, {
            scale: 0.35,
            opacity: 0
          }, {
            easing: "quadIn"
          })
          .call(shakeLocks)
          .start();
      })
      .start();
  }, this);
};

LevelRenderer.prototype._playSplitterSpawnAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var spawnedCells = resolution && Array.isArray(resolution.spawnedBySplitters) ? resolution.spawnedBySplitters : [];
  if (!spawnedCells.length) {
    return;
  }

  var animationKey = createSplitterSpawnAnimationKey(resolution);
  if (!animationKey || animationKey === this.lastSplitterSpawnAnimationKey) {
    return;
  }
  this.lastSplitterSpawnAnimationKey = animationKey;

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Splitter spawn animation requires board snapshot.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Splitter spawn animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = Math.max(0.2, Number(SPLITTER_SPAWN_FLY_DURATION) || 0.36);
  var bezierArc = Math.max(36, Number(SPLITTER_SPAWN_BEZIER_ARC) || 96);

  spawnedCells.forEach(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    if (typeof spawnedCell.sourceSplitterId !== "string" && typeof spawnedCell.sourceSplitterId !== "number") {
      throw new Error("Splitter spawn animation requires sourceSplitterId.");
    }
    if (!Number.isInteger(spawnedCell.sourceSplitterRow) || !Number.isInteger(spawnedCell.sourceSplitterCol)) {
      throw new Error("Splitter spawn animation requires source splitter coordinates.");
    }
    if (!Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
      throw new Error("Splitter spawn animation requires spawned cell coordinates.");
    }
    if (typeof spawnedCell.color !== "string" || !spawnedCell.color) {
      throw new Error("Splitter spawn animation requires spawned cell color.");
    }

    var targetNode = this.layers.board.getChildByName("Bubble_" + spawnedCell.id);
    if (!targetNode || !targetNode.isValid) {
      throw new Error("Splitter spawn animation target node missing: " + spawnedCell.id);
    }

    this._hideSplitterSpawnTarget(spawnedCell.id);

    var startPosition = BoardLayout.getCellPosition(
      spawnedCell.sourceSplitterRow,
      spawnedCell.sourceSplitterCol,
      boardSnapshot.maxColumns,
      boardSnapshot.dropOffsetRows
    );
    var endPosition = BoardLayout.getCellPosition(
      spawnedCell.row,
      spawnedCell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.dropOffsetRows
    );

    var fxNode = new cc.Node("SplitterSpawnFx_" + spawnedCell.id);
    fxNode.parent = this.layers.board;
    fxNode.zIndex = (targetNode.zIndex || 0) + 2;
    fxNode.setPosition(startPosition.x, startPosition.y);
    fxNode.setScale(0.82);
    fxNode.opacity = 255;
    this._applyBallVisualCached(fxNode, {
      color: spawnedCell.color
    }, BOARD_BUBBLE_SIZE);

    var finishFx = function () {
      if (fxNode && fxNode.isValid) {
        fxNode.removeFromParent(true);
      }
      this._revealSplitterSpawnTarget(spawnedCell.id);
    }.bind(this);

    var startX = startPosition.x;
    var startY = startPosition.y;
    var endX = endPosition.x;
    var endY = endPosition.y;
    var controlY = Math.max(startY, endY) + bezierArc;
    var controlX = (startX + endX) * 0.5;

    fxNode.stopAllActions();
    if (
      fxNode.runAction &&
      typeof cc.bezierTo === "function" &&
      typeof cc.sequence === "function" &&
      typeof cc.callFunc === "function" &&
      typeof cc.v2 === "function"
    ) {
      var bezier = [
        cc.v2(controlX, controlY),
        cc.v2(controlX, controlY),
        cc.v2(endX, endY)
      ];
      fxNode.runAction(cc.sequence(
        cc.bezierTo(flyDuration, bezier),
        cc.callFunc(finishFx)
      ));
      return;
    }

    if (typeof cc.tween !== "function") {
      finishFx();
      return;
    }

    cc.tween(fxNode)
      .to(flyDuration, {
        x: endX,
        y: endY,
        scale: 1
      }, {
        easing: "sineOut"
      })
      .call(finishFx)
      .start();
  }, this);
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

  var offset = Math.max(2, Number(ICE_THAW_SHAKE_OFFSET) || 0);
  var stepDuration = Math.max(0.02, Number(ICE_THAW_SHAKE_STEP_DURATION) || 0.04);
  var objective = runtimeSnapshot && runtimeSnapshot.objectives ? runtimeSnapshot.objectives : null;
  var shouldFlyToHud = !!(objective && objective.type === "collect_ice_snowball");
  var targetBoardPos = shouldFlyToHud ? this._getHudTargetBallPositionInBoard() : null;
  var flyDuration = Math.max(0.18, Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var collectFlyStartDelay = shouldFlyToHud ? 0.03 : 0;

  thawedCells.forEach(function (cell) {
    if (!cell || !cell.id) {
      return;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + cell.id);
    if (!bubbleNode) {
      return;
    }

    if (bubbleNode.__iceThawShakeSeq === impact.seq) {
      return;
    }
    bubbleNode.__iceThawShakeSeq = impact.seq;

    var baseX = bubbleNode.x;
    var baseY = bubbleNode.y;

    bubbleNode.stopAllActions();
    bubbleNode.__thawHiddenSeq = impact.seq;
    bubbleNode.opacity = 0;
    bubbleNode.active = false;

    var fxNode = new cc.Node("IceThawFx_" + cell.id + "_" + impact.seq);
    fxNode.parent = this.layers.board;
    fxNode.zIndex = (bubbleNode.zIndex || 0) + 1;
    fxNode.setPosition(baseX, baseY);
    fxNode.setScale(1);
    this._applyBallVisualCached(fxNode, {
      entityCategory: "obstacle_ball",
      entityType: "ice",
      innerColor: cell.color || "B"
    }, BOARD_BUBBLE_SIZE);

    var revealBubble = function () {
      if (bubbleNode && bubbleNode.__thawHiddenSeq === impact.seq) {
        bubbleNode.active = true;
        bubbleNode.opacity = 255;
        bubbleNode.__thawHiddenSeq = -1;
      }
    };

    var finishFx = function () {
      if (fxNode && fxNode.parent) {
        fxNode.removeFromParent(true);
      }
    };

    var playCollectFly = function () {
      if (!shouldFlyToHud || !targetBoardPos) {
        finishFx();
        return;
      }

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
          cc.bezierTo(flyDuration, bezier),
          cc.scaleTo(flyDuration, 0.38),
          cc.fadeTo(flyDuration, 120)
        );
        var actionChain = [];
        if (collectFlyStartDelay > 0) {
          actionChain.push(cc.delayTime(collectFlyStartDelay));
        }
        actionChain.push(flyAction);
        actionChain.push(cc.callFunc(function () {
          finishFx();
        }));
        var sequence = cc.sequence.apply(null, actionChain);
        fxNode.runAction(sequence);
        return;
      }

      if (typeof cc.tween === "function") {
        var collectTween = cc.tween(fxNode);
        if (collectFlyStartDelay > 0) {
          collectTween = collectTween.delay(collectFlyStartDelay);
        }
        collectTween
          .to(flyDuration, {
            x: endX,
            y: endY,
            scale: 0.38,
            opacity: 120
          }, {
            easing: "sineIn"
          })
          .call(function () {
            finishFx();
          })
          .start();
        return;
      }

      finishFx();
    };

    if (typeof cc.tween !== "function") {
      revealBubble();
      playCollectFly();
      return;
    }

    cc.tween(fxNode)
      .to(stepDuration, { x: baseX - offset, y: baseY })
      .to(stepDuration, { x: baseX + offset, y: baseY })
      .to(stepDuration, { x: baseX - offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX + offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX, y: baseY })
      .call(function () {
        revealBubble();
        playCollectFly();
      })
      .start();
  }, this);
};

LevelRenderer.prototype._playShotNoDropScreenShake = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var shakeEvent = null;
  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (event && event.type === "shot_no_drop") {
      shakeEvent = event;
    }
  }

  if (!shakeEvent) {
    return;
  }
  if (typeof shakeEvent.id !== "number" || !isFinite(shakeEvent.id)) {
    throw new Error("shot_no_drop event requires a numeric id.");
  }
  if (shakeEvent.id === this.lastNoDropShakeEventId) {
    return;
  }

  this.lastNoDropShakeEventId = shakeEvent.id;
  if (!this.layers) {
    throw new Error("shot_no_drop screen shake requires renderer layers.");
  }

  var offset = Number(SHOT_NO_DROP_SHAKE_OFFSET);
  var stepDuration = Number(SHOT_NO_DROP_SHAKE_STEP_DURATION);
  if (!isFinite(offset) || offset <= 0) {
    throw new Error("shot_no_drop screen shake offset must be positive.");
  }
  if (!isFinite(stepDuration) || stepDuration <= 0) {
    throw new Error("shot_no_drop screen shake step duration must be positive.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("shot_no_drop screen shake requires Cocos actions.");
  }

  var layerNames = [
    "dangerLine",
    "jars",
    "shooter",
    "board",
    "falling",
    "jarOcclusion",
    "testGrid"
  ];
  layerNames.forEach(function (name) {
    var layer = this.layers[name];
    if (!layer || !layer.isValid) {
      throw new Error("shot_no_drop screen shake requires layer: " + name);
    }
    if (typeof layer.runAction !== "function" || typeof layer.stopAllActions !== "function") {
      throw new Error("shot_no_drop screen shake layer must support Cocos actions: " + name);
    }

    var basePosition = layer.__shotNoDropShakeBasePosition;
    if (basePosition) {
      layer.setPosition(basePosition.x, basePosition.y);
    } else {
      basePosition = {
        x: layer.x,
        y: layer.y
      };
    }
    if (
      typeof basePosition.x !== "number" ||
      typeof basePosition.y !== "number" ||
      !isFinite(basePosition.x) ||
      !isFinite(basePosition.y)
    ) {
      throw new Error("shot_no_drop screen shake layer position is invalid: " + name);
    }
    layer.__shotNoDropShakeBasePosition = basePosition;
    layer.stopAllActions();

    layer.runAction(cc.sequence(
      cc.moveTo(stepDuration, basePosition.x - offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x - offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x, basePosition.y),
      cc.callFunc(function () {
        layer.__shotNoDropShakeBasePosition = null;
      })
    ));
  }, this);
};

LevelRenderer.prototype._playImpactBounce = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  if (!impact || !impact.seq || impact.seq === this.lastImpactSeq) {
    return;
  }

  this.lastImpactSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var center = impact.center || { x: 0, y: 0 };
  var pushDistance = Math.max(2, Number(impact.pushDistance) || IMPACT_DEFAULT_PUSH_DISTANCE);
  var bounceSpeed = resolveImpactBounceSpeed(impact);
  var pushDuration = Math.max(IMPACT_MIN_PUSH_DURATION, pushDistance / bounceSpeed);
  var returnDuration = Math.max(IMPACT_MIN_RETURN_DURATION, pushDuration * IMPACT_RETURN_DURATION_RATIO);
  var neighbors = Array.isArray(impact.neighbors) ? impact.neighbors : [];
  var fallingActiveCount = runtimeSnapshot && runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem
    ? Math.max(0, Number(runtimeSnapshot.systems.fallingMarbleSystem.activeDropCount) || 0)
    : 0;
  var neighborBudget = fallingActiveCount >= 36 ? 2 : (fallingActiveCount >= 18 ? 4 : neighbors.length);

  for (var index = 0; index < neighbors.length && index < neighborBudget; index += 1) {
    var neighbor = neighbors[index];
    if (!neighbor || !neighbor.id) {
      continue;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + neighbor.id);
    if (!bubbleNode) {
      continue;
    }

    var baseX = typeof neighbor.x === "number"
      ? neighbor.x
      : (typeof neighbor.position === "object" && typeof neighbor.position.x === "number"
        ? neighbor.position.x
        : bubbleNode.x);
    var baseY = typeof neighbor.y === "number"
      ? neighbor.y
      : (typeof neighbor.position === "object" && typeof neighbor.position.y === "number"
        ? neighbor.position.y
        : bubbleNode.y);
    var dirX = baseX - center.x;
    var dirY = baseY - center.y;
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.0001) {
      dirX = 0;
      dirY = 1;
      len = 1;
    }

    var pushX = baseX + dirX / len * pushDistance;
    var pushY = baseY + dirY / len * pushDistance;

    bubbleNode.stopAllActions();
    bubbleNode.x = baseX;
    bubbleNode.y = baseY;

    if (typeof cc.tween !== "function") {
      bubbleNode.x = baseX;
      bubbleNode.y = baseY;
      continue;
    }

    cc.tween(bubbleNode)
      .to(pushDuration, {
        x: pushX,
        y: pushY
      }, {
        easing: "quadOut"
      })
      .to(returnDuration, {
        x: baseX,
        y: baseY
      }, {
        easing: "quadIn"
      })
      .start();
  }
};

LevelRenderer.prototype._clearJarDropContainers = function () {
  if (!this.layers || !this.layers.jars) {
    return;
  }

  this.layers.jars.children.forEach(function (jarNode) {
    var container = jarNode.getChildByName("FallingInJar");
    if (container) {
      clearChildren(container);
    }
  });
};

LevelRenderer.prototype._findJarInteriorZone = function (drop, runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];
  if (!zones.length) {
    return null;
  }

  var bottomY = drop.position.y - BoardLayout.bubbleRadius;
  var topY = drop.position.y + BoardLayout.bubbleRadius;
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var dx = Math.abs(drop.position.x - zone.x);
    var xInside = dx <= Math.max(6, zone.innerHalfWidth || 0);
    // Delay occlusion so marbles are hidden later, after sinking deeper into the jar mouth.
    var hideTriggerY = zone.mouthY - Math.max(10, BoardLayout.bubbleRadius * 0.35);
    var underMouth = bottomY <= hideTriggerY;
    var aboveBottom = topY >= ((zone.bottomY || 0) + 2);
    if (xInside && underMouth && aboveBottom) {
      return zone;
    }
  }

  return null;
};

LevelRenderer.prototype._resolveJarDropContainer = function (drop, runtimeSnapshot) {
  var zone = this._findJarInteriorZone(drop, runtimeSnapshot);
  if (!zone || !this.layers || !this.layers.jars) {
    return null;
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + zone.index);
  if (!jarNode) {
    return null;
  }

  return this._ensureJarDropContainer(jarNode);
};

LevelRenderer.prototype._ensureJarDropContainer = function (jarNode) {
  var container = getOrCreateChild(jarNode, "FallingInJar");
  var maskNode = jarNode.getChildByName("mask") || jarNode.getChildByName("Mask");

  container.zIndex = 10;
  if (maskNode) {
    maskNode.zIndex = 20;
  }

  return container;
};
LevelRenderer.prototype._renderTestGrid = function (boardSnapshot) {
  if (!this.layers || !this.layers.testGrid) {
    return;
  }

  if (!DebugFlags.get("testLayer")) {
    this.layers.testGrid.active = false;
    return;
  }

  this.layers.testGrid.active = true;
  this.layers.testGrid.opacity = 255;
  this.testGridRenderTick += 1;
  var currentTick = this.testGridRenderTick;

  var occupied = {};
  (boardSnapshot.cells || []).forEach(function (cell) {
    occupied[cell.row + ":" + cell.col] = true;
  });

  var index = 1;
  for (var row = 0; row < boardSnapshot.rowCount; row += 1) {
    var rowColumns = BoardLayout.getRowColumnCount(row, boardSnapshot.maxColumns);
    for (var col = 0; col < rowColumns; col += 1) {
      var key = row + ":" + col;
      var isOccupied = !!occupied[key];
      var cellPosition = BoardLayout.getCellPosition(row, col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
      var slotNode = this._acquireTestSlotNode(row, col);
      slotNode.__testGridTick = currentTick;
      slotNode.setPosition(cellPosition.x, cellPosition.y);
      slotNode.opacity = 200;
      slotNode.zIndex = 0;

      var graphics = slotNode.getComponent(cc.Graphics) || slotNode.addComponent(cc.Graphics);
      graphics.clear();
      graphics.fillColor = isOccupied ? new cc.Color(130, 220, 255, 92) : new cc.Color(255, 255, 255, 46);
      graphics.strokeColor = isOccupied ? new cc.Color(130, 220, 255, 215) : new cc.Color(255, 255, 255, 140);
      graphics.lineWidth = 2;
      graphics.circle(0, 0, TEST_SLOT_RADIUS);
      graphics.fill();
      graphics.stroke();

      var labelNode = new cc.Node("IndexLabel");
      labelNode.parent = slotNode;
      labelNode.zIndex = 2;
      labelNode.setPosition(0, 0);
      labelNode.setContentSize(TEST_SLOT_RADIUS * 1.9, TEST_SLOT_RADIUS * 1.6);
      labelNode.opacity = 255;
      var indexLabel = ensureLabel(labelNode, String(index), 22, 24);
      indexLabel.overflow = cc.Label.Overflow.NONE;
      indexLabel.enableWrapText = false;
      labelNode.color = cc.color(0, 0, 0);

      index += 1;
    }
  }

  this._recycleInactiveTestSlotNodes(currentTick);
};

LevelRenderer.prototype._acquireTestSlotNode = function (row, col) {
  var slotId = row + ":" + col;
  var existing = this.testSlotNodes[slotId];
  if (existing) {
    return existing;
  }

  var slotNode = this.testSlotNodePool.length ? this.testSlotNodePool.pop() : null;
  if (!slotNode) {
    slotNode = new cc.Node("TestSlot_" + row + "_" + col);
  }

  slotNode.name = "TestSlot_" + row + "_" + col;
  if (slotNode.parent !== this.layers.testGrid) {
    slotNode.parent = this.layers.testGrid;
  }
  slotNode.active = true;
  this.testSlotNodes[slotId] = slotNode;
  return slotNode;
};

LevelRenderer.prototype._recycleInactiveTestSlotNodes = function (activeTick) {
  for (var slotId in this.testSlotNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.testSlotNodes, slotId)) {
      continue;
    }

    var slotNode = this.testSlotNodes[slotId];
    if (slotNode && slotNode.__testGridTick === activeTick) {
      continue;
    }

    if (slotNode) {
      slotNode.active = false;
      slotNode.removeFromParent(false);
      this.testSlotNodePool.push(slotNode);
    }

    delete this.testSlotNodes[slotId];
  }
};

LevelRenderer.prototype._evaluateDangerLineState = function (boardSnapshot) {
  if (!boardSnapshot || !Array.isArray(boardSnapshot.cells) || boardSnapshot.cells.length <= 0) {
    return {
      nearDanger: false,
      dangerReached: false
    };
  }

  var minGap = Number.POSITIVE_INFINITY;
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell) {
      return;
    }

    var cellPosition = BoardLayout.getCellPosition(
      cell.row,
      cell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.dropOffsetRows
    );
    var bubbleBottomY = cellPosition.y - BoardLayout.bubbleRadius;
    var gapToDanger = bubbleBottomY - BoardLayout.dangerLineY;
    if (gapToDanger < minGap) {
      minGap = gapToDanger;
    }
  });

  var reached = minGap <= 0;
  return {
    nearDanger: minGap > 0 && minGap <= DANGER_WARNING_ROW_THRESHOLD,
    dangerReached: reached
  };
};

LevelRenderer.prototype._setDangerLineWarningActive = function (dangerNode, enabled) {
  if (!dangerNode || !dangerNode.isValid) {
    return;
  }

  var shouldEnable = !!enabled;
  if (shouldEnable === this.dangerLineWarningActive) {
    return;
  }

  this.dangerLineWarningActive = shouldEnable;
  dangerNode.stopAllActions();

  if (!shouldEnable) {
    dangerNode.x = 0;
    return;
  }

  if (typeof cc.tween === "function") {
    cc.tween(dangerNode)
      .to(DANGER_WARNING_SHAKE_STEP, { x: DANGER_WARNING_SHAKE_LEFT_X })
      .to(DANGER_WARNING_SHAKE_STEP, { x: DANGER_WARNING_SHAKE_RIGHT_X })
      .to(DANGER_WARNING_SHAKE_STEP, { x: DANGER_WARNING_SHAKE_LEFT_X * 0.7 })
      .to(DANGER_WARNING_SHAKE_STEP, { x: DANGER_WARNING_SHAKE_RIGHT_X * 0.7 })
      .union()
      .repeatForever()
      .start();
    return;
  }

  var sequence = cc.sequence(
    cc.moveTo(DANGER_WARNING_SHAKE_STEP, DANGER_WARNING_SHAKE_LEFT_X, dangerNode.y),
    cc.moveTo(DANGER_WARNING_SHAKE_STEP, DANGER_WARNING_SHAKE_RIGHT_X, dangerNode.y),
    cc.moveTo(DANGER_WARNING_SHAKE_STEP, DANGER_WARNING_SHAKE_LEFT_X * 0.7, dangerNode.y),
    cc.moveTo(DANGER_WARNING_SHAKE_STEP, DANGER_WARNING_SHAKE_RIGHT_X * 0.7, dangerNode.y)
  );
  dangerNode.runAction(cc.repeatForever(sequence));
};

LevelRenderer.prototype._renderDangerLine = function (runtimeSnapshot) {
  var node = this.layers.dangerLine.getChildByName("DangerLine");
  if (!node) {
    node = this._instantiateOrCreate(PREFAB_PATHS.dangerLine, this.layers.dangerLine, "DangerLine");
  }

  var dangerLineX = this.dangerLineWarningActive ? node.x : 0;
  node.setPosition(dangerLineX, BoardLayout.dangerLineY);

  var band = getOrCreateChild(node, "BandBg");
  var boardSnapshot = runtimeSnapshot && runtimeSnapshot.board ? runtimeSnapshot.board : null;
  var dangerState = this._evaluateDangerLineState(boardSnapshot);
  var shouldShowDangerLine = dangerState.nearDanger || dangerState.dangerReached;
  node.active = shouldShowDangerLine;
  if (!shouldShowDangerLine) {
    this._setDangerLineWarningActive(node, false);
    this.dangerLineReady = true;
    return;
  }

  var isWarning = dangerState.nearDanger || dangerState.dangerReached;
  band.opacity = isWarning ? DANGER_WARNING_BAND_OPACITY : DANGER_NORMAL_BAND_OPACITY;
  band.color = isWarning ? cc.color(255, 74, 74) : cc.color(255, 255, 255);
  var labelNode = getOrCreateChild(node, "Label");
  labelNode.color = isWarning ? DANGER_WARNING_LABEL_COLOR : DANGER_NORMAL_LABEL_COLOR;
  ensureLabel(labelNode, "危险线", 38, 42);
  ensureOutline(labelNode, isWarning ? DANGER_WARNING_OUTLINE_COLOR : DANGER_NORMAL_OUTLINE_COLOR, 3);
  this._setDangerLineWarningActive(node, isWarning);
  this.dangerLineReady = true;
};

LevelRenderer.prototype._renderRainbowColorSelector = function (shooterPanel, shooterSnapshot, aim) {
  var selectorNode = getOrCreateChild(shooterPanel, "RainbowColorSelector");
  var selection = shooterSnapshot && shooterSnapshot.pendingRainbowColorSelection
    ? shooterSnapshot.pendingRainbowColorSelection
    : null;
  if (!selection) {
    selectorNode.active = false;
    return;
  }

  var colors = Array.isArray(selection.colors) ? selection.colors.slice() : [];
  if (!colors.length) {
    throw new Error("Rainbow color selector requires colors.");
  }

  selectorNode.active = true;
  selectorNode.zIndex = 80;
  var originX = aim.origin.x;
  var originY = aim.origin.y;
  var selectorKey = colors.join("|") + "@" + Math.round(originX) + ":" + Math.round(originY);
  var shouldAnimate = selectorNode.__selectorKey !== selectorKey;
  selectorNode.__selectorKey = selectorKey;

  var buttonSize = new cc.Size(RAINBOW_COLOR_SELECTOR_BUTTON_SIZE, RAINBOW_COLOR_SELECTOR_BUTTON_SIZE);
  var radius = RAINBOW_COLOR_SELECTOR_RADIUS;
  var spread = Math.min(
    RAINBOW_COLOR_SELECTOR_MAX_SPREAD,
    Math.max(0, (colors.length - 1) * RAINBOW_COLOR_SELECTOR_ANGLE_STEP)
  );
  var startAngle = 90 + spread * 0.5;

  colors.forEach(function (colorCode, index) {
    if (!BALL_RESOURCES[colorCode]) {
      throw new Error("Rainbow color selector missing ball resource: " + colorCode);
    }

    var buttonNode = getOrCreateChild(selectorNode, "RainbowColor_" + colorCode);
    buttonNode.active = true;
    buttonNode.zIndex = index + 1;
    buttonNode.setContentSize(buttonSize);
    buttonNode.setScale(1);
    buttonNode.opacity = 255;
    if (!buttonNode.getComponent(cc.Button)) {
      buttonNode.addComponent(cc.Button);
    }
    this._applyBallVisualCached(buttonNode, colorCode, buttonSize);
    this._bindBottomPanelButton(buttonNode, "select_rainbow_color:" + colorCode);

    var angle = colors.length === 1 ? 90 : startAngle - (spread * index / (colors.length - 1));
    var radians = angle * Math.PI / 180;
    var targetX = originX + Math.cos(radians) * radius;
    var targetY = originY + Math.sin(radians) * radius;

    if (shouldAnimate || buttonNode.__rainbowTargetKey !== selectorKey) {
      buttonNode.stopAllActions();
      buttonNode.setPosition(originX, originY);
      buttonNode.setScale(0.35);
      buttonNode.opacity = 0;
      buttonNode.runAction(cc.sequence(
        cc.delayTime(index * 0.035),
        cc.spawn(
          cc.moveTo(0.18, targetX, targetY),
          cc.scaleTo(0.18, 1),
          cc.fadeTo(0.12, 255)
        )
      ));
      buttonNode.__rainbowTargetKey = selectorKey;
    } else {
      buttonNode.setPosition(targetX, targetY);
    }
  }, this);

  selectorNode.children.slice().forEach(function (child) {
    if (child.name.indexOf("RainbowColor_") === 0) {
      var colorCode = child.name.slice("RainbowColor_".length);
      child.active = colors.indexOf(colorCode) !== -1;
    }
  });
};

LevelRenderer.prototype._renderShooter = function (shooterSnapshot, activeProjectile, remainingShots) {
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    shooterPanel = this._instantiateOrCreate(PREFAB_PATHS.shooterPanel, this.layers.shooter, "ShooterPanel");
  }

  var aim = shooterSnapshot && shooterSnapshot.aim
    ? shooterSnapshot.aim
    : { origin: BoardLayout.shooterOrigin, direction: { x: 0, y: 1 } };
  var shooterAngle = computeShooterAngle(aim.direction);
  var fortNode = getOrCreateChild(shooterPanel, "ShooterBase");
  var fortFrame = this.spriteFrameCache["image/fort"];
  if (fortFrame && fortNode.__fortApplied !== true) {
    ensureSprite(fortNode, fortFrame);
    fortNode.setContentSize(fortFrame.getOriginalSize());
    fortNode.__fortApplied = true;
  }
  fortNode.setPosition(aim.origin.x, aim.origin.y);
  fortNode.angle = shooterAngle;

  var trajectory = shooterSnapshot.trajectory;
  var canUsePowerup = !!(shooterSnapshot && shooterSnapshot.canUsePowerups);
  var pendingBarrierHammer = !!(shooterSnapshot && shooterSnapshot.pendingBarrierHammer);
  var shooterInventory = shooterSnapshot && shooterSnapshot.skillInventory
    ? shooterSnapshot.skillInventory
    : {};
  var swapCount = Math.max(0, Math.floor(Number(shooterInventory.swap) || 0));
  var currentAnchor = getOrCreateChild(shooterPanel, "CurrentBallAnchor");
  currentAnchor.setPosition(aim.origin.x, aim.origin.y);
  currentAnchor.setScale(1);
  var currentBallLike = shooterSnapshot.currentBall || shooterSnapshot.currentColor;
  currentAnchor.active = !!currentBallLike;
  if (currentAnchor.active) {
    this._applyBallVisualCached(currentAnchor, currentBallLike, BOARD_BUBBLE_SIZE);
  }
  this._renderRainbowColorSelector(shooterPanel, shooterSnapshot, aim);

  var changeButtonNode = shooterPanel.getChildByName("ChangeBtn");
  var hasSwapInventory = swapCount > 0;
  if (changeButtonNode) {
    if (!changeButtonNode.__positionInitialized) {
      changeButtonNode.setPosition(aim.origin.x, aim.origin.y);
      changeButtonNode.__positionInitialized = true;
    }
    changeButtonNode.active = hasSwapInventory;
  }
  this._setShooterChangeButtonSpin(changeButtonNode, hasSwapInventory);
  if (hasSwapInventory) {
    this._bindBottomPanelButton(changeButtonNode, "use_swap");
    this._setBottomPanelButtonEnabled(
      changeButtonNode,
      canUsePowerup &&
      !pendingBarrierHammer &&
      !!(shooterSnapshot.currentBall && shooterSnapshot.nextBall),
      {
        dimWhenDisabled: false
      }
    );
  }

  var nextAnchor = getOrCreateChild(shooterPanel, "NextBallAnchor");
  nextAnchor.setPosition(aim.origin.x + NEXT_SHOT_OFFSET_X, aim.origin.y + NEXT_SHOT_OFFSET_Y);
  nextAnchor.setScale(1);
  nextAnchor.opacity = 200;
  var nextBallLike = shooterSnapshot.nextBall || shooterSnapshot.nextColor;
  nextAnchor.active = !!nextBallLike;
  if (nextAnchor.active) {
    this._applyBallVisualCached(nextAnchor, nextBallLike, NEXT_SHOT_BUBBLE_SIZE);
  }

  var shotsValue = Math.max(0, Math.floor(Number(remainingShots) || 0));
  var surplusNode = shooterPanel.getChildByName("Surplus");
  if (!surplusNode) {
    throw new Error("ShooterPanel requires Surplus node.");
  }
  var surplusLabel = surplusNode.getComponent(cc.Label);
  if (!surplusLabel) {
    throw new Error("ShooterPanel Surplus requires cc.Label.");
  }
  var nextAnchorSize = nextAnchor.getContentSize();
  var surplusSize = surplusNode.getContentSize();
  if (!nextAnchorSize || !surplusSize || nextAnchorSize.height <= 0 || surplusSize.height <= 0) {
    throw new Error("ShooterPanel Surplus positioning requires valid node sizes.");
  }
  surplusNode.setPosition(
    nextAnchor.x,
    nextAnchor.y + nextAnchorSize.height * 0.5 + surplusSize.height * 0.5 + 8
  );
  surplusLabel.string = shooterSnapshot && shooterSnapshot.infiniteShots ? "无限" : "剩余" + shotsValue;

  var ghost = getOrCreateChild(shooterPanel, "GhostBubble");
  var hasTrajectory = !!(trajectory && trajectory.targetCellPosition && trajectory.pathPoints && trajectory.pathPoints.length >= 2);
  var shouldShowGhost = BoardLayout.showGhostBubble !== false;
  ghost.active = shouldShowGhost && !activeProjectile && hasTrajectory && !!currentBallLike;
  if (ghost.active) {
    ghost.setPosition(trajectory.targetCellPosition.x, trajectory.targetCellPosition.y);
    ghost.setScale(1);
    ghost.opacity = 140;
    this._applyBallVisualCached(ghost, currentBallLike, BOARD_BUBBLE_SIZE);
  }

  var projectileNode = getOrCreateChild(this.layers.shooter, "ActiveProjectile");
  if (activeProjectile) {
    projectileNode.active = true;
    projectileNode.setPosition(activeProjectile.position.x, activeProjectile.position.y);
    projectileNode.setScale(1);
    this._applyBallVisualCached(projectileNode, activeProjectile.ball || activeProjectile.color, BOARD_BUBBLE_SIZE);
  } else {
    projectileNode.active = false;
  }

  var guideDots = getOrCreateChild(shooterPanel, "GuideDots");
  var aimGuidePath = shooterSnapshot && Array.isArray(shooterSnapshot.aimGuidePath)
    ? shooterSnapshot.aimGuidePath
    : null;
  var guidePath = aimGuidePath && aimGuidePath.length >= 2
    ? aimGuidePath
    : (hasTrajectory ? trajectory.pathPoints : null);
  // 辅助线最长只显示到“幽灵球与上方碰撞球之间”的碰撞前端位置。
  // 有碰撞球时：按“目标中心 <-> 碰撞球中心”中点为基准；否则回退到目标中心前半径。
  if (guidePath && hasTrajectory && typeof trajectory.totalDistance === "number") {
    var clipRadiusScale = Math.max(0, Number(BoardLayout.guideFrontClipRadiusScale) || 1);
    var tailClipDistance = BoardLayout.bubbleRadius * clipRadiusScale;
    if (trajectory.targetCellPosition && trajectory.collidedCellPosition) {
      var centerDistance = pointDistance(trajectory.targetCellPosition, trajectory.collidedCellPosition);
      tailClipDistance = (centerDistance * 0.5) * clipRadiusScale;
    }
    var frontDistance = Math.max(0, trajectory.totalDistance - tailClipDistance);
    guidePath = clipGuidePathToDistance(guidePath, frontDistance);
  }

  var shouldShowGuide = !activeProjectile &&
    !!(shooterSnapshot && shooterSnapshot.isAiming) &&
    !!(guidePath && guidePath.length >= 2);

  if (shouldShowGuide) {
    var guideKey = buildGuidePathKey(guidePath);
    guideDots.active = true;
    if (!this.lastGuideDotsVisible || guideKey !== this.lastGuidePathKey) {
      this._renderGuideDots(guideDots, guidePath);
      this.lastGuidePathKey = guideKey;
    }
    this.lastGuideDotsVisible = true;
  } else {
    if (this.lastGuideDotsVisible) {
      guideDots.active = false;
      this._renderGuideDots(guideDots, null);
      this.lastGuideDotsVisible = false;
      this.lastGuidePathKey = "";
    } else {
      guideDots.active = false;
    }
  }

  var dock = getOrCreateChild(shooterPanel, "NextBallDock");
  dock.active = false;
};

LevelRenderer.prototype._applyBallVisualCached = function (node, ballLike, forcedSize) {
  if (!node) {
    return;
  }

  var visualKey = resolveBallVisualKey(ballLike);
  var sizeKey = forcedSize ? (Math.round(forcedSize.width) + "x" + Math.round(forcedSize.height)) : "auto";
  var cacheKey = visualKey + "|" + sizeKey;
  if (node.__ballVisualKey === cacheKey) {
    return;
  }

  this._applyBallVisual(node, ballLike, forcedSize);
  node.__ballVisualKey = cacheKey;
};

LevelRenderer.prototype._renderGuideDots = function (guideContainer, pathPoints) {
  var guideCanvas = getOrCreateChild(guideContainer, "GuideDotsCanvas");
  var dotFrame = this.spriteFrameCache[GUIDE_DOT_SPRITE_PATH];
  if (!dotFrame || !pathPoints || pathPoints.length < 2) {
    this._setGuideDotsActiveCount(guideCanvas, 0, dotFrame);
    return;
  }

  var positions = [];
  for (var segmentIndex = 1; segmentIndex < pathPoints.length; segmentIndex += 1) {
    var from = pathPoints[segmentIndex - 1];
    var to = pathPoints[segmentIndex];
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength < 0.0001) {
      continue;
    }

    var dotsOnSegment = Math.max(1, Math.floor(segmentLength / GUIDE_DOT_SPACING));
    for (var i = 1; i <= dotsOnSegment; i += 1) {
      var t = i / dotsOnSegment;
      positions.push({
        x: from.x + dx * t,
        y: from.y + dy * t
      });
    }
  }

  if (positions.length > GUIDE_DOT_MAX_COUNT) {
    var sampled = [];
    var sampleStep = positions.length / GUIDE_DOT_MAX_COUNT;
    for (var sampleIndex = 0; sampleIndex < GUIDE_DOT_MAX_COUNT; sampleIndex += 1) {
      sampled.push(positions[Math.floor(sampleIndex * sampleStep)]);
    }
    positions = sampled;
  }

  this._setGuideDotsActiveCount(guideCanvas, positions.length, dotFrame);
  for (var pointIndex = 0; pointIndex < positions.length; pointIndex += 1) {
    var dotNode = this.guideDotNodes[pointIndex];
    if (!dotNode || !cc.isValid(dotNode)) {
      continue;
    }
    dotNode.setPosition(positions[pointIndex].x, positions[pointIndex].y);
    this._applyGuideDotPulse(dotNode, pointIndex);
  }
};

LevelRenderer.prototype.renderRouteEditor = function (editorState) {
  this._ensureLayers();

  var routeLayer = this.layers.routeEditor;
  if (!editorState || !Array.isArray(editorState.routes)) {
    routeLayer.active = false;
    clearChildren(routeLayer);
    return;
  }

  var hasRoutes = editorState.routes.some(function (route) {
    return route && Array.isArray(route.points) && route.points.length > 0;
  });
  routeLayer.active = !!(editorState.enabled || hasRoutes);

  var canvas = getOrCreateChild(routeLayer, "RouteCanvas");
  var graphics = canvas.getComponent(cc.Graphics) || canvas.addComponent(cc.Graphics);
  graphics.clear();

  var infoNode = getOrCreateChild(routeLayer, "RouteInfo");
  infoNode.setContentSize(420, 160);
  infoNode.setPosition(-110, 0);
  infoNode.zIndex = 5;
  var infoLabel = ensureLabel(infoNode, "", 24, 32, cc.Label.HorizontalAlign.LEFT);
  infoLabel.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
  infoLabel.enableWrapText = true;
  infoNode.color = cc.color(255, 255, 255);
  ensureOutline(infoNode, cc.color(24, 42, 59), 2);

  var activeRouteId = editorState.activeRouteId;
  var totalPointCount = 0;
  var activeRoute = null;

  editorState.routes.forEach(function (route, index) {
    if (!route || !Array.isArray(route.points) || route.points.length <= 0) {
      return;
    }

    totalPointCount += route.points.length;
    var isActive = route.id === activeRouteId;
    if (isActive) {
      activeRoute = route;
    }

    var strokeColor = createRouteColor(index, isActive);
    graphics.lineWidth = isActive ? ROUTE_LINE_WIDTH_ACTIVE : ROUTE_LINE_WIDTH_IDLE;
    graphics.strokeColor = strokeColor;
    graphics.moveTo(route.points[0].x, route.points[0].y);
    for (var pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
      graphics.lineTo(route.points[pointIndex].x, route.points[pointIndex].y);
    }
    graphics.stroke();

    graphics.fillColor = strokeColor;
    route.points.forEach(function (point) {
      graphics.circle(
        point.x,
        point.y,
        isActive ? ROUTE_POINT_RADIUS_ACTIVE : ROUTE_POINT_RADIUS_IDLE
      );
    });
    graphics.fill();
  });

  if (!activeRoute && editorState.routes.length > 0) {
    activeRoute = editorState.routes[0];
  }

  var latestPoint = activeRoute && Array.isArray(activeRoute.points) && activeRoute.points.length > 0
    ? activeRoute.points[activeRoute.points.length - 1]
    : null;
  var modeText = editorState.enabled ? "开启" : "关闭";
  infoLabel.string = [
    "路线编辑: " + modeText,
    "路线数: " + editorState.routes.length,
    "总点位: " + totalPointCount,
    "当前路线: " + (activeRoute ? activeRoute.name : "-"),
    "当前点数: " + (activeRoute && activeRoute.points ? activeRoute.points.length : 0),
    "最后坐标: " + (latestPoint ? (latestPoint.x + ", " + latestPoint.y) : "-")
  ].join("\n");
  infoNode.active = routeLayer.active;
};

LevelRenderer.prototype._getWhiteSpriteFrameForSize = function (width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var key = safeWidth + "x" + safeHeight;

  if (this.whiteMaskFrames[key]) {
    return this.whiteMaskFrames[key];
  }

  var created = createSolidWhiteSpriteFrame(safeWidth, safeHeight);
  if (!created) {
    Logger.warn("Failed to create white sprite frame", key);
    return null;
  }

  this.whiteMaskTextures.push(created.texture);
  this.whiteMaskFrames[key] = created.frame;
  return created.frame;
};

LevelRenderer.prototype._renderJarCollisionMasks = function (runtimeSnapshot) {
  var maskRoot = getOrCreateChild(this.layers.overlay, "JarCollisionMaskRoot");
  maskRoot.zIndex = 29;
  clearChildren(maskRoot);
  if (!DebugFlags.get("testLayer")) {
    maskRoot.active = false;
    return;
  }
  maskRoot.active = true;

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];

  zones.forEach(function (zone, index) {
    var rimHeight = Math.max(6, (zone.contactBand || 16) * 2);
    var rimWidth = Math.max(8, (zone.rimHalfWidth || 0) * 2);

    var rimFrame = this._getWhiteSpriteFrameForSize(rimWidth, rimHeight);
    if (rimFrame) {
      var rimNode = new cc.Node("RimMask_" + index);
      rimNode.parent = maskRoot;
      rimNode.setPosition(zone.x || 0, zone.mouthY || 0);
      rimNode.color = cc.color(255, 255, 255);
      rimNode.opacity = 80;
      ensureSprite(rimNode, rimFrame);
      rimNode.setContentSize(rimWidth, rimHeight);
    }
}, this);

};
LevelRenderer.prototype._renderBottomJars = function (levelConfig, runtimeSnapshot) {
  var jarColors = levelConfig.level.jarColors || ["R", "G", "B"];
  var jarProgress = runtimeSnapshot.jars ? runtimeSnapshot.jars.collectedByColor : {};
  var jarPositions = BoardLayout.getJarCenterPositions(jarColors.length);


  jarColors.forEach(function (colorCode, index) {
    var jarNode = this._instantiateOrCreate(PREFAB_PATHS.jarItem, this.layers.jars, "BottomJar_" + index);
    jarNode.setPosition(jarPositions[index] || 0, getJarBaseY() + JAR_RENDER_Y_OFFSET);
    jarNode.setScale(1);
    this._applyJarVisual(jarNode, colorCode);
    this._applyJarMaskVisual(jarNode, colorCode);
    this._ensureJarDropContainer(jarNode);

    var countNode = getOrCreateChild(jarNode, "CountLabel");
    countNode.setPosition(0, -118);
    countNode.color = cc.color(255, 255, 255);
    ensureLabel(countNode, String(jarProgress[colorCode] || 0), 34, 38);
    ensureOutline(countNode, cc.color(83, 109, 138), 3);
  }, this);

  this._renderJarOcclusionLayer(jarColors, jarPositions);
  this._renderJarCollisionMasks(runtimeSnapshot);
};

LevelRenderer.prototype._renderJarOcclusionLayer = function (jarColors, jarPositions) {
  if (!this.layers || !this.layers.jarOcclusion) {
    return;
  }

  clearChildren(this.layers.jarOcclusion);
  jarColors.forEach(function (colorCode, index) {
    var spritePath = JAR_MASK_RESOURCES[colorCode];
    var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
    if (!spriteFrame) {
      return;
    }

    var maskNode = new cc.Node("JarOcclusion_" + index);
    maskNode.parent = this.layers.jarOcclusion;
    maskNode.setPosition(jarPositions[index] || 0, getJarBaseY());
    maskNode.setScale(1);
    maskNode.zIndex = index;
    maskNode.opacity = 255;
    ensureSprite(maskNode, spriteFrame);
    maskNode.setContentSize(JAR_RENDER_SIZE);
  }, this);
};

LevelRenderer.prototype._setWinValueText = function (valueNode, text) {
  if (!valueNode) {
    return;
  }

  var label = valueNode.getComponent(cc.Label);
  if (!label) {
    label = valueNode.addComponent(cc.Label);
  }
  label.string = text;
};

  function getRuntimeWinClearRewardItems(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView clear rewards require won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView clear rewards require runtimeSnapshot.winStats.");
    }
    if (!Array.isArray(runtimeSnapshot.winStats.clearRewardItems)) {
      throw new Error("WinView clear rewards require winStats.clearRewardItems.");
    }
    return runtimeSnapshot.winStats.clearRewardItems;
  }

  function resolveRewardItemSpritePath(itemId) {
    if (!REWARD_ITEM_RESOURCES || !REWARD_ITEM_RESOURCES[itemId]) {
      throw new Error("WinView unsupported reward item id: " + itemId);
    }
    return REWARD_ITEM_RESOURCES[itemId];
  }

  function requireWinChild(parentNode, childName, ownerName) {
    if (!parentNode || !parentNode.isValid) {
      throw new Error("WinView requires valid parent for " + childName + ".");
    }
    var childNode = parentNode.getChildByName(childName);
    if (!childNode || !childNode.isValid) {
      throw new Error("WinView " + ownerName + " requires child node: " + childName);
    }
    return childNode;
  }

LevelRenderer.prototype._renderWinAwardInfo = function (winContent, rewardItems) {
  if (!Array.isArray(rewardItems)) {
    throw new Error("WinView award_info requires reward items array.");
  }
  var awardInfoNode = winContent ? winContent.getChildByName("award_info") : null;
  if (rewardItems.length === 0) {
    if (awardInfoNode) {
      awardInfoNode.active = false;
    }
    return;
  }

  if (!awardInfoNode || !awardInfoNode.isValid) {
    throw new Error("WinView requires award_info when clearRewardItems are configured.");
  }
  awardInfoNode.active = true;

  var giftListNode = requireWinChild(awardInfoNode, "gift_list", "award_info");
  var templateNode = requireWinChild(giftListNode, "gift", "award_info.gift_list");
  var activeNodes = [];

  rewardItems.forEach(function (rewardItem, index) {
    if (!rewardItem || typeof rewardItem !== "object") {
      throw new Error("WinView clear reward item must be object at index " + index + ".");
    }
    var itemId = typeof rewardItem.id === "string" ? rewardItem.id : "";
    var count = Number(rewardItem.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("WinView clear reward count must be positive integer: " + itemId);
    }

    var itemNode = null;
    if (index === 0) {
      itemNode = templateNode;
    } else {
      itemNode = giftListNode.getChildByName("gift_" + index);
      if (!itemNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple reward items require cc.instantiate.");
        }
        itemNode = cc.instantiate(templateNode);
        itemNode.name = "gift_" + index;
        itemNode.parent = giftListNode;
      }
    }

    itemNode.active = true;
    activeNodes.push(itemNode);

    var iconNode = requireWinChild(itemNode, "icon", itemNode.name);
    var numNode = requireWinChild(itemNode, "num", itemNode.name);
    var spritePath = resolveRewardItemSpritePath(itemId);
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("WinView reward sprite is not preloaded: " + spritePath);
    }

    ensureSprite(iconNode, spriteFrame);
    var iconSize = iconNode.getContentSize();
    if (!iconSize || iconSize.width <= 0 || iconSize.height <= 0) {
      iconNode.setContentSize(spriteFrame.getOriginalSize());
    }
    this._setWinValueText(numNode, "x" + count);
  }, this);

  giftListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = giftListNode.getComponent(cc.Layout);
  if (layout) {
    layout.spacingX = rewardItems.length > 1 ? 24 : 0;
    if (typeof layout.updateLayout === "function") {
      layout.updateLayout();
    }
  }
};

LevelRenderer.prototype._renderWinMaxScoreStamp = function (scoreBgNode, runtimeSnapshot) {
  var maxScoreNode = requireWinChild(scoreBgNode, "max_score", "score_bg");
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    maxScoreNode.active = false;
    return;
  }
  if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
    throw new Error("WinView max_score requires runtimeSnapshot.winStats.");
  }
  if (typeof runtimeSnapshot.winStats.isPersonalBestScore !== "boolean") {
    throw new Error("WinView max_score requires boolean winStats.isPersonalBestScore.");
  }
  maxScoreNode.active = runtimeSnapshot.winStats.isPersonalBestScore;
};

LevelRenderer.prototype._renderWinMaxCombo = function (scoreBgNode, runtimeSnapshot) {
  var batterValueNode = requireWinChild(scoreBgNode, "batter_value", "score_bg");
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    batterValueNode.active = false;
    return;
  }
  if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
    throw new Error("WinView batter_value requires runtimeSnapshot.winStats.");
  }
  if (typeof runtimeSnapshot.winStats.maxComboStreak !== "number") {
    throw new Error("WinView batter_value requires winStats.maxComboStreak.");
  }

  var maxComboStreak = Math.floor(runtimeSnapshot.winStats.maxComboStreak);
  if (!Number.isInteger(maxComboStreak) || maxComboStreak < 0) {
    throw new Error("WinView batter_value maxComboStreak must be non-negative integer.");
  }

  batterValueNode.active = true;
  var comboDisplay = maxComboStreak >= 2 ? maxComboStreak - 1 : 0;
  this._setWinValueText(batterValueNode, String(comboDisplay));
};

LevelRenderer.prototype._renderWinCollectList = function (winContent, levelConfig, runtimeSnapshot) {
  var collectBgNode = winContent ? winContent.getChildByName("collect_bg") : null;
  if (!collectBgNode) {
    throw new Error("WinView requires collect_bg.");
  }

  var collectListNode = requireWinChild(collectBgNode, "collect_list", "collect_bg");
  var templateNode = requireWinChild(collectListNode, "bottle", "collect_list");
  var entries = buildWinCollectEntries(levelConfig, runtimeSnapshot);

  if (entries.length === 0) {
    collectBgNode.active = false;
    return;
  }

  collectBgNode.active = true;
  var activeNodes = [];

  entries.forEach(function (entry, index) {
    var bottleNode = null;
    if (index === 0) {
      bottleNode = templateNode;
    } else {
      bottleNode = collectListNode.getChildByName("bottle_" + index);
      if (!bottleNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple collect bottles require cc.instantiate.");
        }
        bottleNode = cc.instantiate(templateNode);
        bottleNode.name = "bottle_" + index;
        bottleNode.parent = collectListNode;
      }
    }

    bottleNode.active = true;
    activeNodes.push(bottleNode);

    var spritePath = WIN_BOTTLE_RESOURCES[entry.colorCode];
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("WinView collect bottle sprite is not preloaded: " + spritePath);
    }

    ensureSprite(bottleNode, spriteFrame);
    var numNode = requireWinChild(bottleNode, "num", bottleNode.name);
    this._setWinValueText(numNode, String(entry.count));
  }, this);

  collectListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = collectListNode.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._renderWinTargetList = function (winContent, levelConfig, runtimeSnapshot) {
  var targetBgNode = winContent ? winContent.getChildByName("target_bg") : null;
  if (!targetBgNode) {
    throw new Error("WinView requires target_bg.");
  }

  var targetListNode = requireWinChild(targetBgNode, "target_list", "target_bg");
  var templateNode = requireWinChild(targetListNode, "target", "target_list");
  var entries = buildWinCompletedTargetEntries(levelConfig, runtimeSnapshot);

  if (entries.length === 0) {
    targetBgNode.active = false;
    return;
  }

  targetBgNode.active = true;
  var activeNodes = [];

  entries.forEach(function (entry, index) {
    var targetNode = null;
    if (index === 0) {
      targetNode = templateNode;
    } else {
      targetNode = targetListNode.getChildByName("target_" + index);
      if (!targetNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple targets require cc.instantiate.");
        }
        targetNode = cc.instantiate(templateNode);
        targetNode.name = "target_" + index;
        targetNode.parent = targetListNode;
      }
    }

    targetNode.active = true;
    activeNodes.push(targetNode);

    var spritePath = BALL_RESOURCES[entry.iconCode];
    if (!spritePath) {
      throw new Error("WinView unsupported target icon code: " + entry.iconCode);
    }
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("WinView target sprite is not preloaded: " + spritePath);
    }

    ensureSprite(targetNode, spriteFrame);
    var targetDesNode = requireWinChild(targetNode, "target_des", targetNode.name);
    var gouNode = requireWinChild(targetNode, "gou", targetNode.name);
    this._setWinValueText(targetDesNode, entry.description);
    gouNode.active = true;
  }, this);

  targetListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = targetListNode.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._ensurePopupMaskVisible = function (popupNode, opacity) {
  if (!popupNode) {
    return;
  }

  var maskNode = popupNode.getChildByName("mask");
  if (!maskNode) {
    return;
  }

  var popupSize = popupNode.getContentSize();
  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      popupSize = rootSize;
      popupNode.setContentSize(rootSize);
    }
  }

  var maskFrame = this._getWhiteSpriteFrameForSize(popupSize.width, popupSize.height);
  if (maskFrame) {
    ensureSprite(maskNode, maskFrame);
    maskNode.setContentSize(popupSize);
  }

  maskNode.active = true;
  maskNode.color = cc.color(0, 0, 0);
  maskNode.opacity = typeof opacity === "number" ? opacity : 100;
  maskNode.zIndex = -10;
};

LevelRenderer.prototype._ensurePopupContentContainer = function (popupNode) {
  if (!popupNode) {
    return null;
  }

  var container = popupNode.getChildByName(POPUP_CONTENT_CONTAINER_NAME);
  if (!container) {
    container = new cc.Node(POPUP_CONTENT_CONTAINER_NAME);
    container.parent = popupNode;
    container.setPosition(0, 0);
    container.zIndex = 0;
  }

  var popupSize = popupNode.getContentSize();
  if (popupSize && popupSize.width > 0 && popupSize.height > 0) {
    container.setContentSize(popupSize);
  }

  popupNode.children.slice().forEach(function (child) {
    if (!child || child === container || child.name === "mask") {
      return;
    }

    var localPos = child.getPosition();
    var childScaleX = child.scaleX;
    var childScaleY = child.scaleY;
    var childAngle = child.angle;
    var childZIndex = child.zIndex;

    child.parent = container;
    child.setPosition(localPos);
    child.scaleX = childScaleX;
    child.scaleY = childScaleY;
    child.angle = childAngle;
    child.zIndex = childZIndex;
  });

  return container;
};

LevelRenderer.prototype._playPopupContentOpenAnimation = function (container, options) {
  if (!container) {
    return;
  }

  options = options || {};
  var duration = typeof options.duration === "number" ? options.duration : POPUP_OPEN_ANIM_DURATION;
  var fromScale = typeof options.fromScale === "number" ? options.fromScale : POPUP_OPEN_ANIM_FROM_SCALE;
  var easing = typeof options.easing === "string" && options.easing ? options.easing : "backOut";

  container.stopAllActions();
  container.opacity = 0;
  container.scale = fromScale;

  if (typeof cc.tween !== "function") {
    container.opacity = 255;
    container.scale = 1;
    return;
  }

  cc.tween(container)
    .to(duration, {
      opacity: 255,
      scale: 1
    }, {
      easing: easing
    })
    .start();
};

LevelRenderer.prototype._bindWinButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__winBoundAction === action) {
    return;
  }

  buttonNode.__winBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeWinAction(action);
  }, this);
};

LevelRenderer.prototype._getWinStarNodes = function (winContent) {
  if (!winContent) {
    return [];
  }

  return [
    winContent.getChildByName("star1"),
    winContent.getChildByName("star2"),
    winContent.getChildByName("star3") || winContent.getChildByName("start3")
  ];
};

LevelRenderer.prototype._renderWinStars = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));
  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }
    starNode.active = index < safeStarRating;
  });
};

LevelRenderer.prototype._playWinStarsPunchAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));

  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    starNode.stopAllActions();
    if (index >= safeStarRating || !starNode.active) {
      starNode.scale = 1;
      return;
    }

    starNode.scale = WIN_STAR_PUNCH_FROM_SCALE;
    if (typeof cc.tween !== "function") {
      starNode.scale = 1;
      return;
    }

    cc.tween(starNode)
      .delay(WIN_STAR_ANIM_START_DELAY + index * WIN_STAR_ANIM_STAGGER)
      // 由慢到快收缩，制造“砸下去”的打击感。
      .to(WIN_STAR_SHRINK_DURATION, {
        scale: WIN_STAR_PUNCH_DOWN_SCALE
      }, {
        easing: "quartIn"
      })
      .to(WIN_STAR_RECOVER_DURATION, {
        scale: 1
      }, {
        easing: "quadOut"
      })
      .start();
  });
};

LevelRenderer.prototype._playWinPopupOpenAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  this._playPopupContentOpenAnimation(winContent, {
    duration: WIN_POPUP_OPEN_ANIM_DURATION,
    fromScale: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
    easing: "backOut"
  });
  this._playWinStarsPunchAnimation(winContent, starRating);
};

LevelRenderer.prototype._bindLoseButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__loseBoundAction === action) {
    return;
  }

  buttonNode.__loseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeLoseAction(action);
  }, this);
};

LevelRenderer.prototype._renderWinView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("WinView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    if (existing) {
      existing.active = false;
    }
    return;
  }

  var winView = existing;
  if (!winView) {
    winView = this._instantiateOrCreate(PREFAB_PATHS.winView, this.layers.modal, "WinView");
  }

  if (!winView) {
    return;
  }

  winView.active = true;
  winView.setPosition(0, 0);
  this._ensurePopupMaskVisible(winView, 100);
  var winContent = this._ensurePopupContentContainer(winView);

  var winStats = runtimeSnapshot.winStats || {};
  var totalScore = Number(winStats.totalScore) || runtimeSnapshot.score || 0;
  var scoreBgNode = winContent ? winContent.getChildByName("score_bg") : null;
  var rewardItems = getRuntimeWinClearRewardItems(runtimeSnapshot);
  this._setWinValueText(requireWinChild(scoreBgNode, "score_value", "score_bg"), String(totalScore));
  this._renderWinAwardInfo(winContent, rewardItems);
  this._renderWinMaxScoreStamp(scoreBgNode, runtimeSnapshot);
  this._renderWinMaxCombo(scoreBgNode, runtimeSnapshot);
  this._renderWinCollectList(winContent, this.currentLevelConfig, runtimeSnapshot);
  this._renderWinTargetList(winContent, this.currentLevelConfig, runtimeSnapshot);

  var starRating = resolveWinStarRating(this.currentLevelConfig, runtimeSnapshot);
  this._renderWinStars(winContent, starRating);
  if (!wasActive) {
    this._playWinPopupOpenAnimation(winContent, starRating);
  }

  var currentLevelId = this.currentLevelConfig && this.currentLevelConfig.level
    ? Math.max(1, Math.floor(Number(this.currentLevelConfig.level.levelId) || 1))
    : 1;
  var levelBgNode = winContent ? winContent.getChildByName("level_bg") : null;
  var currentLevelNode = levelBgNode
    ? levelBgNode.getChildByName("cur_level")
    : (winContent ? winContent.getChildByName("cur_level") : null);
  this._setWinValueText(currentLevelNode, "第" + currentLevelId + "关");

  var closeButtonNode = winContent ? winContent.getChildByName("btn_close") : null;
  if (!closeButtonNode && winView) {
    closeButtonNode = winView.getChildByName("btn_close");
  }
  this._bindWinButton(closeButtonNode, "back");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_next") : null, "next");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_retry") : null, "retry");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_back") : null, "back");
};

LevelRenderer.prototype._renderLoseView = function (runtimeSnapshot) {
  var isLoseState = !!(
    runtimeSnapshot &&
    (runtimeSnapshot.state === "lost_danger" || runtimeSnapshot.state === "out_of_shots" || runtimeSnapshot.state === "lost_objective")
  );
  var existing = this.layers.modal.getChildByName("LoseView");
  var wasActive = !!(existing && existing.active);
  if (!isLoseState) {
    if (existing) {
      existing.active = false;
    }
    return;
  }

  var loseView = existing;
  if (!loseView) {
    loseView = this._instantiateOrCreate(PREFAB_PATHS.loseView, this.layers.modal, "LoseView");
  }

  if (!loseView) {
    return;
  }

  loseView.active = true;
  loseView.setPosition(0, 0);
  this._ensurePopupMaskVisible(loseView, 164);
  var loseContent = this._ensurePopupContentContainer(loseView);
  if (!wasActive) {
    this._playPopupContentOpenAnimation(loseContent);
  }

  var objectiveDisplay = buildObjectiveDisplayData(this.currentLevelConfig, runtimeSnapshot);
  var objectiveProgressText = objectiveDisplay.progressText || "-";
  var touchedDanger = runtimeSnapshot.state === "lost_danger" || !!(runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.dangerReached);
  var leftBallCount = runtimeSnapshot
    ? Math.max(0, Math.floor(Number(runtimeSnapshot.remainingShots) || 0))
    : 0;

  var scoreValueNode = loseContent ? loseContent.getChildByName("score_value") : null;
  this._setWinValueText(scoreValueNode, objectiveProgressText);
  var leftBallValueNode = loseContent ? loseContent.getChildByName("left_ball_value") : null;
  this._setWinValueText(leftBallValueNode, String(leftBallCount));

  var titleRows = (loseContent ? loseContent.children : []).filter(function (child) {
    return child && child.name === "target_title";
  }).sort(function (a, b) {
    return b.y - a.y;
  });
  if (titleRows.length >= 1) {
    this._setWinValueText(titleRows[0], "当前目标进度");
  }
  if (titleRows.length >= 2) {
    this._setWinValueText(titleRows[1], "是否触碰危险线：" + (touchedDanger ? "是" : "否"));
  }

  var loseBallNode = loseContent ? loseContent.getChildByName("ball") : null;
  if (loseBallNode) {
    var loseIconCode = objectiveDisplay.iconCode;
    var loseSpritePath = loseIconCode ? BALL_RESOURCES[loseIconCode] : null;
    var loseSpriteFrame = loseSpritePath ? this.spriteFrameCache[loseSpritePath] : null;
    if (loseSpriteFrame) {
      loseBallNode.active = true;
      ensureSprite(loseBallNode, loseSpriteFrame);
    } else {
      loseBallNode.active = false;
    }
  }

  var loseRewardEntry = typeof resolveLoseRewardEntry === "function"
    ? resolveLoseRewardEntry(runtimeSnapshot.state)
    : null;
  var canRevive = !!loseRewardEntry;
  var adButtonNode = loseContent ? loseContent.getChildByName("btn_ad") : null;
  if (adButtonNode) {
    adButtonNode.active = canRevive;
    if (loseRewardEntry) {
      var videoIconNode = adButtonNode.getChildByName("vido_icon");
      var coinIconNode = adButtonNode.getChildByName("coin");
      var showVideoIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showVideoIcon);
      var showCoinIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showCoinIcon);
      if (showVideoIcon && showCoinIcon) {
        throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
      }
      if (videoIconNode) {
        videoIconNode.active = showVideoIcon;
      }
      if (coinIconNode) {
        coinIconNode.active = showCoinIcon;
      }
      var awardTipsNode = adButtonNode.getChildByName("award_tips");
      var awardTipsLabel = awardTipsNode ? awardTipsNode.getComponent(cc.Label) : null;
      if (awardTipsLabel) {
        awardTipsLabel.string = String(loseRewardEntry.awardTips || "");
      }
      var describeNode = adButtonNode.getChildByName("describe");
      var describeLabel = describeNode ? describeNode.getComponent(cc.Label) : null;
      if (!describeLabel) {
        throw new Error("LoseView btn_ad requires describe cc.Label.");
      }
      if (typeof buildAdReviveDescription !== "function") {
        throw new Error("LoseView requires buildAdReviveDescription.");
      }
      describeNode.active = true;
      describeLabel.string = buildAdReviveDescription(this.currentLevelConfig, runtimeSnapshot);
      this._bindLoseButton(adButtonNode, "ad");
    }
  }

  var retryButtonNode = loseContent ? loseContent.getChildByName("btn_retry") : null;
  setLoseRetryButtonPosition(retryButtonNode, canRevive);

  var loseCloseButtonNode = loseContent ? loseContent.getChildByName("btn_close") : null;
  if (!loseCloseButtonNode && loseView) {
    loseCloseButtonNode = loseView.getChildByName("btn_close");
  }
  this._bindLoseButton(loseCloseButtonNode, "back");
  this._bindLoseButton(retryButtonNode, "retry");
  this._bindLoseButton(loseContent ? loseContent.getChildByName("btn_back") : null, "back");
};

LevelRenderer.prototype._renderResultPopup = function (runtimeSnapshot) {
  var popup = this._instantiateOrCreate(null, this.layers.modal, "ResultPopup");
  var resultTexts = buildResultTexts(runtimeSnapshot);

  if (!resultTexts) {
    popup.active = false;
    return;
  }

  popup.active = true;
  popup.setPosition(0, 40);

  var bg = getOrCreateChild(popup, "PopupBg");
  var frame = this._getWhiteSpriteFrameForSize(1, 1);
  if (frame) {
    ensureSprite(bg, frame);
    bg.setContentSize(new cc.Size(540, 320));
    bg.opacity = 215;
  }

  var title = getOrCreateChild(popup, "Title");
  title.setPosition(0, 50);
  title.color = cc.color(255, 255, 255);
  ensureLabel(title, resultTexts.title, 54, 58);
  ensureOutline(title, cc.color(83, 109, 138), 4);

  var subtitle = getOrCreateChild(popup, "Subtitle");
  subtitle.setPosition(0, -20);
  subtitle.color = cc.color(255, 250, 235);
  ensureLabel(subtitle, resultTexts.subtitle, 28, 34);
  ensureOutline(subtitle, cc.color(83, 109, 138), 3);

  var detail = getOrCreateChild(popup, "Detail");
  detail.setPosition(0, -95);
  detail.color = cc.color(255, 250, 235);
  ensureLabel(detail, resultTexts.detail, 24, 30);
  ensureOutline(detail, cc.color(83, 109, 138), 2);
};

}

module.exports = attachLevelRendererSceneMethods;
