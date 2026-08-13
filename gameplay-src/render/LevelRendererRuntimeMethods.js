"use strict";

function attachLevelRendererRuntimeMethods(LevelRenderer, context) {
  var BundleLoader = context.BundleLoader;
  var Logger = context.Logger;
  var RUNTIME_REFRESH_SCOPE = context.RUNTIME_REFRESH_SCOPE;
  var TRAPPED_SPRITE_LAYER_Z_INDEX = context.TRAPPED_SPRITE_LAYER_Z_INDEX;
  var assertValidRefreshScope = context.assertValidRefreshScope;
  var buildBottomPanelRenderKey = context.buildBottomPanelRenderKey;
  var buildHudRenderKey = context.buildHudRenderKey;
  var buildJarRenderKey = context.buildJarRenderKey;
  var buildShooterRenderKey = context.buildShooterRenderKey;
  var buildTimerRenderKey = context.buildTimerRenderKey;
  var clearChildren = context.clearChildren;
  var resolveRefreshScope = context.resolveRefreshScope;

LevelRenderer.prototype.renderLevel = function (levelConfig, runtimeSnapshot) {
  this.lightningChainRenderer.reset("render_level");
  if (typeof this._stopBoardClearFireworks === "function") {
    this._stopBoardClearFireworks("render_level");
  }
  this._destroyWormholeDirectionGuide();
  if (typeof this._cancelSkillPowerupCollectedFeedback !== "function") {
    throw new Error("LevelRenderer requires collected skill powerup feedback cleanup.");
  }
  this._cancelSkillPowerupCollectedFeedback();
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.lastBoardOcclusionRenderKey = "";
  this.lastHudRenderKey = "";
  this.lastHudStarRating = null;
  this.hudStarDisplayedRating = null;
  this.hudStarQueuedRating = 0;
  this.hudStarAnimationQueue = [];
  this.hudStarAnimationActive = false;
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
  this.lastNoDropShakeEventId = -1;
  this.lastIceThawShakeSeq = -1;
  this.lastIceSnowballCollectEventId = -1;
  this.lastMatchedObjectiveCollectEventId = -1;
  this.lastSkillPowerupCollectedEventId = -1;
  this.skillPowerupCollectedFeedbackQueue = [];
  this.skillPowerupCollectedFeedbackActive = false;
  this.skillPowerupCollectedFeedbackActiveState = null;
  this.lastKeyUnlockAnimationKey = "";
  this.splitterSpawnAnimatedEntryKeys = {};
  this.splitterSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.swirlRotationAnimatedIds = {};
  this.wormholeShiftAnimatedIds = {};
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.currentResolutionFloatingCellIds = {};
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingRenderTick = 1;
  this._ensureLayers();
  this.bubbleShatterRenderer.setLayer(this.layers.shatter);
  this.bubbleShatterRenderer.reset();
  this.setGameplayLayersVisible(true);

  var spritePaths = this._collectSpritePaths(levelConfig, runtimeSnapshot);

  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return Promise.all([
      this.warmupSharedAssets(),
      this._preloadSprites(spritePaths)
    ]);
  }.bind(this)).then(function () {
      clearChildren(this.layers.background);
      clearChildren(this.layers.wormhole);
      clearChildren(this.layers.board);
    clearChildren(this.layers.trappedSprite);
    clearChildren(this.layers.boardOcclusion);
    this.wormholeDirectionGuideRoot = null;
    this.lastWormholeDirectionGuideKey = "";
    this.boardBubbleNodes = {};
    this.boardBubbleNodePool = {};
    this.boardCellRenderKeys = {};
    this.trappedSpriteNode = null;
    this.lastTrappedSpriteRescueEventId = -1;
    this.trappedSpriteDepartureActive = false;
    this.trappedSpriteDepartureCompleted = false;
    this.trappedSpriteDepartureToken += 1;
    this.topSlotStarNodes = {};
    this.topSlotStarNodePool = [];
    this.barrierHammerHintNodes = {};
    this.lastBarrierHammerHintKey = "";
    clearChildren(this.layers.testGrid);
    this.testSlotNodes = {};
    this.testSlotNodePool = [];
    clearChildren(this.layers.falling);
    this.fallingDropNodes = {};
    this.fallingDropNodePool = {};
    clearChildren(this.layers.jarOcclusion);
    clearChildren(this.layers.jars);
    this._recycleJarFractionNodesBeforeHudClear();
    this._resetBallScoreHudBeforeHudClear();
    clearChildren(this.layers.hud);
    clearChildren(this.layers.dangerLine);
    clearChildren(this.layers.overlay);
    clearChildren(this.layers.comment);
    this._notifyActiveResultViewsHidden();
    clearChildren(this.layers.modal);
    this.lastWinViewRenderKey = "";
    this.lastAddBallTipsViewRenderKey = "";
    clearChildren(this.layers.routeEditor);
    clearChildren(this.layers.shooter);
    clearChildren(this.layers.testGrid);

    this._mountGameViewScaffold();
    this.syncBoardLayoutHudBottomLine();
    if (this._fairyAssistSystem) {
      this.syncFairyAssistCollisionCenters();
    }
    this._renderBackground();
    this._renderHud(levelConfig, runtimeSnapshot);
    this._initializeComboBatterHud();
    this._initializeFractionHud();
    this._initializeBallScoreHud();
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this._renderBottomPanel(runtimeSnapshot);
    this._queueSkillPowerupCollectedFeedback(runtimeSnapshot);
    this._renderBoard(runtimeSnapshot.board);
    this._renderTrappedSpriteRescue(runtimeSnapshot);
    this._playTrappedSpriteRescueDeparture(runtimeSnapshot);
    this._renderBoardOcclusions(runtimeSnapshot);
    this._syncBarrierHammerStoneHints(runtimeSnapshot);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this._renderFairyAssists(runtimeSnapshot);
    this._renderFallingDrops(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    this._renderWinView(runtimeSnapshot);
    this._renderAddBallTipsView(runtimeSnapshot);
    this._renderLoseView(runtimeSnapshot);
    this._renderResultPopup(runtimeSnapshot);
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this.lastHudRenderKey = buildHudRenderKey(
      levelConfig,
      runtimeSnapshot,
      this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
    );
    this.lastJarRenderKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
    this.lastBottomPanelRenderKey = buildBottomPanelRenderKey(runtimeSnapshot);
    this.lastShooterRenderKey = buildShooterRenderKey(runtimeSnapshot);
    this.lastTimerRenderKey = buildTimerRenderKey(runtimeSnapshot);
    Logger.info("Rendered runtime view", levelConfig.level.code);
  }.bind(this));
};

LevelRenderer.prototype.refreshRuntime = function (levelConfig, runtimeSnapshot, options) {
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  var scope = resolveRefreshScope(runtimeSnapshot, options);
  assertValidRefreshScope(scope);
  this._syncBoardClearFireworks(runtimeSnapshot);

  if (scope === RUNTIME_REFRESH_SCOPE.PROJECTILE) {
    this._refreshRuntimeProjectile(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM_ANGLE) {
    this._refreshRuntimeShooterAimAngle(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM) {
    this._refreshRuntimeShooterAim(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.FALLING) {
    this._refreshRuntimeFalling(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.TIMER) {
    this._refreshRuntimeTimer(runtimeSnapshot);
    return;
  }

  this._refreshRuntimeFull(levelConfig, runtimeSnapshot);
};

LevelRenderer.prototype._refreshRuntimeProjectile = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.activeProjectile) {
    throw new Error("Projectile refresh scope requires activeProjectile.");
  }
  this._updateProjectileOnly(runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAimAngle = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim angle refresh scope requires shooter snapshot.");
  }
  this._renderShooterAimAngleOnly(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAim = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim refresh scope requires shooter snapshot.");
  }
  this._renderShooter(
    runtimeSnapshot.shooter,
    runtimeSnapshot.activeProjectile,
    runtimeSnapshot.remainingShots
  );
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (!runtimeSnapshot.activeProjectile) {
    this.lastShooterRenderKey = nextShooterKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFalling = function (runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot
    ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0))
    : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);

  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (nextShooterKey !== this.lastShooterRenderKey) {
    this._renderShooter(
      runtimeSnapshot.shooter,
      runtimeSnapshot.activeProjectile,
      runtimeSnapshot.remainingShots
    );
    if (!runtimeSnapshot.activeProjectile) {
      this.lastShooterRenderKey = nextShooterKey;
    }
  }
};

LevelRenderer.prototype._refreshRuntimeTimer = function (runtimeSnapshot) {
  this._refreshBoardOcclusionCountdowns(runtimeSnapshot);
  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFull = function (levelConfig, runtimeSnapshot) {
  var boardViewportOffsetY = runtimeSnapshot.board.viewportOffsetY;
  if (typeof boardViewportOffsetY !== "number" || !isFinite(boardViewportOffsetY)) {
    throw new Error("Runtime board viewportOffsetY must be a finite number.");
  }
  var boardChanged = runtimeSnapshot.board.version !== this.lastBoardVersion ||
    boardViewportOffsetY !== this.lastBoardViewportOffsetY;
  this.bubbleShatterRenderer.playResolution(
    runtimeSnapshot.lastResolution,
    runtimeSnapshot.board,
    this.boardBubbleNodes,
    this.spriteFrameCache
  );
  this._playBallScoreDisplay(runtimeSnapshot);
  this._playTimeBonusFloatingScoreDisplay(runtimeSnapshot);
  if (boardChanged) {
    this._renderBoard(runtimeSnapshot.board);
    this._renderTrappedSpriteRescue(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
  }
  this._renderBoardOcclusions(runtimeSnapshot);
  this._playSwirlRotationAnimation(runtimeSnapshot);
  this._playWormholeShiftAnimation(runtimeSnapshot);
  this._syncBarrierHammerStoneHints(runtimeSnapshot);

  if (!this._shouldFlyIceSnowballToHud(levelConfig)) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
  }

  var iceSnowballDisplayProgress = this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot);
  var nextHudKey = buildHudRenderKey(levelConfig, runtimeSnapshot, iceSnowballDisplayProgress);
  if (nextHudKey !== this.lastHudRenderKey) {
    this._renderHud(levelConfig, runtimeSnapshot);
    this.lastHudRenderKey = nextHudKey;
  }

  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }

  var nextBottomPanelKey = buildBottomPanelRenderKey(runtimeSnapshot);
  if (nextBottomPanelKey !== this.lastBottomPanelRenderKey) {
    this._renderBottomPanel(runtimeSnapshot);
    this.lastBottomPanelRenderKey = nextBottomPanelKey;
  }
  this._queueSkillPowerupCollectedFeedback(runtimeSnapshot);

  var nextJarKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
  if (nextJarKey !== this.lastJarRenderKey) {
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = nextJarKey;
  }

  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0)) : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);

  this._playIceThawShake(runtimeSnapshot);
  this._playMatchedObjectiveCollectFly(runtimeSnapshot);
  this._playIceSnowballCollectFly(runtimeSnapshot);
  this._playShotNoDropScreenShake(runtimeSnapshot);
  this._playComboBatterDisplay(runtimeSnapshot);
  this._playJarFractionDisplay(runtimeSnapshot);
  this._playImpactBounce(runtimeSnapshot);
  this._playKeyUnlockAnimation(runtimeSnapshot);
  this._playSplitterSpawnAnimation(runtimeSnapshot);
  this._playMolotovBlastAnimation(runtimeSnapshot);
  this._playBlastExplosionAnimation(runtimeSnapshot);
  this._playTrappedSpriteRescueDeparture(runtimeSnapshot);
  this._playCommentAnimation(runtimeSnapshot);

  var hasActiveProjectile = !!(runtimeSnapshot.activeProjectile);
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (hasActiveProjectile || nextShooterKey !== this.lastShooterRenderKey) {
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    if (!hasActiveProjectile) {
      this.lastShooterRenderKey = nextShooterKey;
    }
  }

  this._renderWinView(runtimeSnapshot);
  this._renderAddBallTipsView(runtimeSnapshot);
  this._renderLoseView(runtimeSnapshot);
  this._renderResultPopup(runtimeSnapshot);
};

LevelRenderer.prototype._forEachGameplayLayer = function (callback) {
  if (typeof callback !== "function") {
    throw new Error("Gameplay layer callback must be a function.");
  }
  if (!this.layers) {
    return;
  }

  Object.keys(this.layers).forEach(function (layerKey) {
    var layerNode = this.layers[layerKey];
    if (!layerNode || !layerNode.isValid) {
      throw new Error("Gameplay layer node is missing or invalid: " + layerKey);
    }
    callback(layerNode, layerKey);
  }.bind(this));
};

LevelRenderer.prototype.setGameplayLayersVisible = function (visible) {
  if (typeof visible !== "boolean") {
    throw new Error("setGameplayLayersVisible requires boolean visible.");
  }
  if (!this.layers) {
    if (visible) {
      this._ensureLayers();
    }
    return;
  }

  if (!visible) {
    this.lightningChainRenderer.reset("hide_gameplay_layers");
    this._notifyActiveResultViewsHidden();
    if (typeof this._stopBoardClearFireworks === "function") {
      this._stopBoardClearFireworks("hide_gameplay_layers");
    }
  }

  this._forEachGameplayLayer(function (layerNode) {
    layerNode.active = visible;
  });
};

LevelRenderer.prototype._ensureLayers = function () {
  if (this.layers) {
    return;
  }

  this.layers = {
    background: this._getOrCreateLayer("BackgroundLayer", 0),
    dangerLine: this._getOrCreateLayer("DangerLineLayer", 10),
    jars: this._getOrCreateLayer("JarLayer", 20),
    shooter: this._getOrCreateLayer("ShooterLayer", 25),
    overlay: this._getOrCreateLayer("OverlayLayer", 30),
    wormhole: this._getOrCreateLayer("WormholeLayer", 24),
    board: this._getOrCreateLayer("BoardLayer", 40),
    boardOcclusion: this._getOrCreateLayer("BoardOcclusionLayer", 43),
    shatter: this._getOrCreateLayer("BubbleShatterLayer", 44),
    // 掉落球前置到固定球前方，提升层次与动效可见度。
    falling: this._getOrCreateLayer("FallingLayer", 45),
    // 罐体遮罩继续位于掉落球之上，保持“入缸后被遮挡”的视觉。
    jarOcclusion: this._getOrCreateLayer("JarOcclusionLayer", 46),
    testGrid: this._getOrCreateLayer("TestGridLayer", 47),
    routeEditor: this._getOrCreateLayer("RouteEditorLayer", 48),
    trappedSprite: this._getOrCreateLayer("TrappedSpriteLayer", TRAPPED_SPRITE_LAYER_Z_INDEX),
    hud: this._getOrCreateLayer("HUDLayer", 50),
    comment: this._getOrCreateLayer("CommentLayer", 95),
    modal: this._getOrCreateLayer("ModalLayer", 100)
  };
};

LevelRenderer.prototype._getOrCreateLayer = function (name, zIndex) {
  var node = this.rootNode.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = this.rootNode;
  }

  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      node.setContentSize(rootSize);
      node.setPosition(0, 0);
    }
  }

  node.zIndex = zIndex;
  return node;
};
}

module.exports = attachLevelRendererRuntimeMethods;
