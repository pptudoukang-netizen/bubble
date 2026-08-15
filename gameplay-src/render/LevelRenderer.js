"use strict";

var attachLevelRendererActionMethods = require("./LevelRendererActionMethods");
var attachLevelRendererRuntimeMethods = require("./LevelRendererRuntimeMethods");
var attachLevelRendererResourceMethods = require("./LevelRendererResourceMethods");
var attachLevelRendererSharedVisualMethods = require("./LevelRendererSharedVisualMethods");

var LEVEL_RENDERER_CORE_CONTEXT = require("./LevelRendererCoreContext");
var BALL_RESOURCES = LEVEL_RENDERER_CORE_CONTEXT.BALL_RESOURCES;
var BOARD_BUBBLE_SIZE = LEVEL_RENDERER_CORE_CONTEXT.BOARD_BUBBLE_SIZE;
var BoardLayout = LEVEL_RENDERER_CORE_CONTEXT.BoardLayout;
var BubbleShatterRenderer = LEVEL_RENDERER_CORE_CONTEXT.BubbleShatterRenderer;
var LOSE_COIN_REVIVE_COST = LEVEL_RENDERER_CORE_CONTEXT.LOSE_COIN_REVIVE_COST;
var LightningChainRenderer = LEVEL_RENDERER_CORE_CONTEXT.LightningChainRenderer;
var PrefabFactory = LEVEL_RENDERER_CORE_CONTEXT.PrefabFactory;
var RUNTIME_REFRESH_SCOPE = LEVEL_RENDERER_CORE_CONTEXT.RUNTIME_REFRESH_SCOPE;
var WormholeShaderRenderer = LEVEL_RENDERER_CORE_CONTEXT.WormholeShaderRenderer;
var attachLevelRendererAssistSpiritSkillMethods = LEVEL_RENDERER_CORE_CONTEXT.attachLevelRendererAssistSpiritSkillMethods;
var attachLevelRendererFairyMethods = LEVEL_RENDERER_CORE_CONTEXT.attachLevelRendererFairyMethods;
var attachLevelRendererSceneMethods = LEVEL_RENDERER_CORE_CONTEXT.attachLevelRendererSceneMethods;
var resolveBallCode = LEVEL_RENDERER_CORE_CONTEXT.resolveBallCode;
function LevelRenderer(rootNode) {
  this.rootNode = rootNode;
  this.spriteFrameCache = {};
  this.spriteFrameLoadPromises = {};
  this.timeBonusBitmapFont = null;
  this.timeBonusBitmapFontLoadPromise = null;
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  this.assistSpiritAnimationClipCache = {};
  this.assistSpiritAnimationClipLoadPromises = {};
  this.layers = null;
  this.prefabFactory = new PrefabFactory();
  this.bubbleShatterRenderer = new BubbleShatterRenderer({
    boardLayout: BoardLayout,
    ballResources: BALL_RESOURCES,
    resolveBallCode: resolveBallCode,
    bubbleWidth: BOARD_BUBBLE_SIZE.width,
    bubbleHeight: BOARD_BUBBLE_SIZE.height
  });
  this.wormholeShaderRenderer = new WormholeShaderRenderer();
  this.lightningChainRenderer = new LightningChainRenderer();
  this._sharedWarmupPromise = null;
  this._interactionWarmupPromise = null;
  this.currentLevelConfig = null;
  this.lastRuntimeSnapshot = null;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.lastBoardOcclusionRenderKey = "";
  this.whiteMaskFrames = {};
  this.whiteMaskTextures = [];
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
  this.lastWinViewRenderKey = "";
  this.lastAddBallTipsViewRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.gameplayInteractionEnabled = true;
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
  this.breederSpawnAnimatedEntryKeys = {};
  this.breederSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.swirlRotationAnimatedIds = {};
  this.spiritCocoonAnimatedIds = {};
  this.wormholeShiftAnimatedIds = {};
  this.wormholeProjectileAbsorptionAnimatedIds = {};
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.boardBubbleNodes = {};
  this.boardBubbleNodePool = {};
  this.boardCellRenderKeys = {};
  this.currentResolutionFloatingCellIds = {};
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.trappedSpriteNode = null;
  this.lastTrappedSpriteRescueEventId = -1;
  this.trappedSpriteDepartureActive = false;
  this.trappedSpriteDepartureCompleted = false;
  this.trappedSpriteDepartureToken = 0;
  this.multiTrappedSpiritNodes = {};
  this.multiTrappedSpiritHandledEventIds = {};
  this.multiTrappedSpiritDepartingTargetIds = {};
  this.multiTrappedSpiritDepartedTargetIds = {};
  this.barrierHammerHintNodes = {};
  this.lastBarrierHammerHintKey = "";
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingDropNodes = {};
  this.fallingDropNodePool = {};
  this.fallingRenderTick = 1;
  this.jarFractionNodePool = [];
  this.jarFractionDisplayGeneration = 0;
  this.jarFractionDisplaySerial = 0;
  this.lastJarCollectScoredEvent = null;
  this.ballScoreNodePool = [];
  this.ballScoreDisplayGeneration = 0;
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
  this.playedTimeBonusAwardedEvents = [];
  this.winActionHandlers = {
    onNextLevel: null,
    onRetryLevel: null
  };
  this.loseActionHandlers = {
    onRetryLevel: null,
    onBackLevel: null,
    onWatchAd: null,
    onCoinRevive: null
  };
  this.addBallTipsActionHandlers = {
    onClose: null,
    onWatchAd: null,
    onCoinBuy: null
  };
  this.pauseActionHandlers = {
    onContinue: null,
    onRetryLevel: null,
    onExitLevel: null
  };
  this.propDescriptionViewController = null;
  this.resultViewLifecycleHandlers = {
    onRescueSuccessfulViewShow: null,
    onWinViewShow: null,
    onWinViewHide: null,
    onLoseViewShow: null,
    onLoseViewHide: null
  };
  this.loseAdPresentation = {
    showVideoIcon: true,
    showCoinIcon: false
  };
  this.loseCoinPresentation = {
    cost: LOSE_COIN_REVIVE_COST,
    getCoinCount: null
  };
  this.addBallTipsCoinPresentation = {
    cost: 0,
    getCoinCount: null
  };
  this.gameplayActionHandlers = {
    onBackToLevel: null,
    onOpenPause: null,
    onOpenSettings: null,
    onOpenPropDescription: null,
    onClosePropDescription: null,
    onUseRainbow: null,
    onUseBlast: null,
    onUseSwap: null,
    onUseBarrierHammer: null,
    onUseSnowRemoval: null,
    onUseAssistSpiritSkill: null,
    onUseThreeLineElimination: null,
    onUsePlusThreeBalls: null,
    onRecoverAdRunPowerupByAd: null,
    onSelectRainbowColor: null,
    onRecoverInventoryByAd: null
  };
}

var LEVEL_RENDERER_METHOD_CONTEXT = LEVEL_RENDERER_CORE_CONTEXT;
attachLevelRendererActionMethods(LevelRenderer, LEVEL_RENDERER_METHOD_CONTEXT);
attachLevelRendererRuntimeMethods(LevelRenderer, LEVEL_RENDERER_METHOD_CONTEXT);
attachLevelRendererResourceMethods(LevelRenderer, LEVEL_RENDERER_METHOD_CONTEXT);
attachLevelRendererSharedVisualMethods(LevelRenderer, LEVEL_RENDERER_METHOD_CONTEXT);

LevelRenderer.RUNTIME_REFRESH_SCOPE = RUNTIME_REFRESH_SCOPE;

var LEVEL_RENDERER_SCENE_DEPS = LEVEL_RENDERER_CORE_CONTEXT;

attachLevelRendererSceneMethods(LevelRenderer, LEVEL_RENDERER_SCENE_DEPS);
attachLevelRendererFairyMethods(LevelRenderer);
attachLevelRendererAssistSpiritSkillMethods(LevelRenderer);

module.exports = LevelRenderer;

