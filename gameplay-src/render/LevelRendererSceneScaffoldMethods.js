"use strict";

var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneScaffoldMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var requireChildNode = SceneShared.requireChildNode;
  var GAME_ENTRY_COUNTDOWN_STEP_INTERVAL = 1;
  var GAME_ENTRY_GO_SCALE_DURATION = 0.3;
  var GAME_ENTRY_GO_HOLD_DURATION = 0.2;
  var GAME_ENTRY_GO_START_SCALE = 0.2;
  var GAME_ENTRY_GO_END_SCALE = 1.2;
  var GAME_ENTRY_COUNTDOWN_MASK_NAME = "GameEntryCountdownMask";
  var GAME_ENTRY_COUNTDOWN_MASK_OPACITY = 80;
  var GAME_ENTRY_COUNTDOWN_MASK_Z_INDEX = 900;
  var GAME_ENTRY_COUNTDOWN_TIMER_Z_INDEX = 901;
  var GAME_ENTRY_COUNTDOWN_GO_Z_INDEX = 902;
  var GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY = "__gameEntryCountdownLayerState";

function requirePositiveContentSize(size, description) {
  if (
    !size ||
    typeof size.width !== "number" ||
    typeof size.height !== "number" ||
    !isFinite(size.width) ||
    !isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(description + " requires positive content size.");
  }
}

LevelRenderer.prototype._ensureGameViewPrefabReady = function () {
  return this.prefabFactory.load(PREFAB_PATHS.gameView);
};

LevelRenderer.prototype._mountGameViewScaffold = function () {
  if (!this.layers) {
    throw new Error("Gameplay layers are required before mounting GameView scaffold.");
  }

  var gameViewNode = this.prefabFactory.instantiate(PREFAB_PATHS.gameView, this.layers.hud, "GameView");
  if (!gameViewNode) {
    throw new Error("GameView prefab must be preloaded before mount: " + PREFAB_PATHS.gameView);
  }
  gameViewNode.setPosition(0, 0);
  gameViewNode.active = true;

  var mountedBgNode = this._moveGameViewChildToLayer(gameViewNode, "bg", this.layers.background, "bg");
  var mountedDangerLineNode = this._moveGameViewChildToLayer(gameViewNode, "DangerLine", this.layers.dangerLine, "DangerLine");
  mountedDangerLineNode.active = false;
  var mountedBottomPanelNode = this._moveGameViewChildToLayer(gameViewNode, "BttomPanel", this.layers.hud, "BttomPanel");
  this._flushGameViewScaffoldLayout([
    gameViewNode,
    mountedBgNode,
    mountedDangerLineNode,
    mountedBottomPanelNode
  ]);
};

LevelRenderer.prototype.prepareForLevelSelectReturn = function () {
  this._ensureLayers();
  if (typeof this._stopBoardClearFireworks === "function") {
    this._stopBoardClearFireworks("level_select_return");
  }
  if (this.layers && this.layers.hud && this.layers.hud.isValid) {
    var gameViewNode = this.layers.hud.getChildByName("GameView");
    if (gameViewNode && gameViewNode.isValid) {
      gameViewNode.stopAllActions();
      gameViewNode.__gameEntryCountdownActive = false;
      var countdownLayerState = gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
      var timerNode = countdownLayerState ? countdownLayerState.timerNode : gameViewNode.getChildByName("timer");
      if (timerNode && timerNode.isValid) {
        timerNode.stopAllActions();
      }
      var goNode = countdownLayerState ? countdownLayerState.goNode : gameViewNode.getChildByName("go");
      if (goNode && goNode.isValid) {
        goNode.stopAllActions();
      }
      this._destroyGameEntryCountdownMask(gameViewNode);
      this._restoreGameEntryCountdownNodes(gameViewNode);
    }
  }
};

LevelRenderer.prototype._createGameEntryCountdownMask = function (gameViewNode, timerNode, goNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown mask requires GameView.");
  }
  if (!timerNode || !timerNode.isValid) {
    throw new Error("Game entry countdown mask requires timer node.");
  }
  if (!goNode || !goNode.isValid) {
    throw new Error("Game entry countdown mask requires go node.");
  }
  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown mask requires HUD layer.");
  }
  if (!this.rootNode || !this.rootNode.isValid || typeof this.rootNode.getContentSize !== "function") {
    throw new Error("Game entry countdown mask requires root node content size.");
  }
  if (typeof cc.Graphics !== "function") {
    throw new Error("Game entry countdown mask requires cc.Graphics.");
  }
  if (this.layers.hud.getChildByName(GAME_ENTRY_COUNTDOWN_MASK_NAME)) {
    throw new Error("Game entry countdown mask is already mounted.");
  }

  var rootSize = this.rootNode.getContentSize();
  requirePositiveContentSize(rootSize, "Game entry countdown mask");

  var maskNode = new cc.Node(GAME_ENTRY_COUNTDOWN_MASK_NAME);
  maskNode.parent = this.layers.hud;
  maskNode.setContentSize(rootSize);
  maskNode.setPosition(0, 0);
  maskNode.opacity = GAME_ENTRY_COUNTDOWN_MASK_OPACITY;
  maskNode.zIndex = GAME_ENTRY_COUNTDOWN_MASK_Z_INDEX;

  var graphics = maskNode.addComponent(cc.Graphics);
  graphics.fillColor = cc.color(0, 0, 0, GAME_ENTRY_COUNTDOWN_MASK_OPACITY);
  graphics.rect(-rootSize.width * 0.5, -rootSize.height * 0.5, rootSize.width, rootSize.height);
  graphics.fill();
};

LevelRenderer.prototype._promoteGameEntryCountdownNodes = function (gameViewNode, timerNode, goNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown node promotion requires GameView.");
  }
  if (!timerNode || !timerNode.isValid) {
    throw new Error("Game entry countdown node promotion requires timer node.");
  }
  if (!goNode || !goNode.isValid) {
    throw new Error("Game entry countdown node promotion requires go node.");
  }
  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown node promotion requires HUD layer.");
  }
  if (gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY]) {
    throw new Error("Game entry countdown nodes are already promoted.");
  }

  gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY] = {
    timerNode: timerNode,
    timerParent: timerNode.parent,
    timerX: timerNode.x,
    timerY: timerNode.y,
    timerZIndex: timerNode.zIndex,
    goNode: goNode,
    goParent: goNode.parent,
    goX: goNode.x,
    goY: goNode.y,
    goZIndex: goNode.zIndex
  };

  var timerWorldPosition = timerNode.convertToWorldSpaceAR(cc.v2(0, 0));
  var goWorldPosition = goNode.convertToWorldSpaceAR(cc.v2(0, 0));
  timerNode.parent = this.layers.hud;
  timerNode.setPosition(this.layers.hud.convertToNodeSpaceAR(timerWorldPosition));
  timerNode.zIndex = GAME_ENTRY_COUNTDOWN_TIMER_Z_INDEX;
  goNode.parent = this.layers.hud;
  goNode.setPosition(this.layers.hud.convertToNodeSpaceAR(goWorldPosition));
  goNode.zIndex = GAME_ENTRY_COUNTDOWN_GO_Z_INDEX;
};

LevelRenderer.prototype._restoreGameEntryCountdownNodes = function (gameViewNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown node restore requires GameView.");
  }

  var state = gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
  if (state) {
    if (!state.timerParent || !state.timerParent.isValid) {
      throw new Error("Game entry countdown timer original parent is invalid.");
    }
    if (!state.goParent || !state.goParent.isValid) {
      throw new Error("Game entry countdown go original parent is invalid.");
    }
    if (!state.timerNode || !state.timerNode.isValid) {
      throw new Error("Game entry countdown timer node is invalid during restore.");
    }
    if (!state.goNode || !state.goNode.isValid) {
      throw new Error("Game entry countdown go node is invalid during restore.");
    }

    state.timerNode.parent = state.timerParent;
    state.timerNode.setPosition(state.timerX, state.timerY);
    state.timerNode.zIndex = state.timerZIndex;
    state.goNode.parent = state.goParent;
    state.goNode.setPosition(state.goX, state.goY);
    state.goNode.zIndex = state.goZIndex;
    delete gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
  }
};

LevelRenderer.prototype._destroyGameEntryCountdownMask = function (gameViewNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown mask cleanup requires GameView.");
  }

  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown mask cleanup requires HUD layer.");
  }

  var maskNode = this.layers.hud.getChildByName(GAME_ENTRY_COUNTDOWN_MASK_NAME);
  if (maskNode && maskNode.isValid) {
    maskNode.removeFromParent(false);
    maskNode.destroy();
  }
};

LevelRenderer.prototype.playGameEntryCountdown = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown requires GameView.");
  }

  var timerNode = requireChildNode(gameViewNode, "timer", "GameView");
  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    throw new Error("GameView/timer requires cc.Label.");
  }
  var goNode = requireChildNode(gameViewNode, "go", "GameView");
  if (!goNode.getComponent(cc.Sprite)) {
    throw new Error("GameView/go requires cc.Sprite.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.spawn !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.delayTime !== "function" ||
    typeof cc.scaleTo !== "function" ||
    typeof cc.fadeTo !== "function"
  ) {
    throw new Error("Game entry countdown requires Cocos action APIs.");
  }
  if (gameViewNode.__gameEntryCountdownActive === true) {
    throw new Error("Game entry countdown is already active.");
  }

  timerNode.stopAllActions();
  goNode.stopAllActions();
  this._createGameEntryCountdownMask(gameViewNode, timerNode, goNode);
  this._promoteGameEntryCountdownNodes(gameViewNode, timerNode, goNode);
  gameViewNode.__gameEntryCountdownActive = true;
  var self = this;
  timerNode.active = true;
  timerNode.opacity = 255;
  timerLabel.string = "3";
  goNode.active = false;
  goNode.opacity = 0;
  goNode.setScale(GAME_ENTRY_GO_START_SCALE);

  return new Promise(function (resolve) {
    gameViewNode.runAction(cc.sequence(
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerLabel.string = "2";
      }),
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerLabel.string = "1";
      }),
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerNode.active = false;
        goNode.active = true;
        goNode.opacity = 0;
        goNode.setScale(GAME_ENTRY_GO_START_SCALE);
        goNode.runAction(cc.sequence(
          cc.spawn(
            cc.scaleTo(GAME_ENTRY_GO_SCALE_DURATION, GAME_ENTRY_GO_END_SCALE),
            cc.fadeTo(GAME_ENTRY_GO_SCALE_DURATION, 255)
          ),
          cc.delayTime(GAME_ENTRY_GO_HOLD_DURATION),
          cc.callFunc(function () {
            goNode.active = false;
            self._destroyGameEntryCountdownMask(gameViewNode);
            self._restoreGameEntryCountdownNodes(gameViewNode);
            gameViewNode.__gameEntryCountdownActive = false;
            resolve();
          })
        ));
      })
    ));
  });
};

LevelRenderer.prototype.syncBoardLayoutHudBottomLineAsync = function () {
  var self = this;
  this._ensureLayers();
  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return self._ensureGameViewPrefabReady();
  }).then(function () {
    self.syncBoardLayoutHudBottomLine();
  });
};

LevelRenderer.prototype.syncBoardLayoutHudBottomLine = function () {
  this._ensureLayers();
  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    this._mountGameViewScaffold();
    gameViewNode = this.layers.hud.getChildByName("GameView");
  }
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView is required before syncing HudPanel bottom line.");
  }
  var hudPanelNode = gameViewNode.getChildByName("HudPanel");
  if (!hudPanelNode || !hudPanelNode.isValid) {
    throw new Error("GameView requires HudPanel before syncing board viewport HUD boundary.");
  }
  this._flushGameViewScaffoldLayout([gameViewNode, hudPanelNode]);
  BoardLayout.syncHudBottomLineYFromHudPanel(hudPanelNode, this.layers.board);
  if (this._fairyAssistSystem) {
    this.syncFairyAssistCollisionCenters();
  }
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
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Board snapshot viewportOffsetY must be a finite number.");
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
    boardSnapshot.viewportOffsetY
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
}

module.exports = attachLevelRendererSceneScaffoldMethods;
