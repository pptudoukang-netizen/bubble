"use strict";

var GameBootstrapUiFlowMethods = require("./GameBootstrapUiFlowMethods");
var GameBootstrapRuntimeConfigMethods = require("./GameBootstrapRuntimeConfigMethods");
var GameBootstrapCompositionMethods = require("./GameBootstrapCompositionMethods");
var GameBootstrapLifecycleMethods = require("./GameBootstrapLifecycleMethods");
var GameBootstrapStartupMethods = require("./GameBootstrapStartupMethods");
var GameBootstrapAudioMethods = require("./GameBootstrapAudioMethods");
var GameBootstrapGameplayInputMethods = require("./GameBootstrapGameplayInputMethods");
var GameBootstrapPowerupInventoryMethods = require("./GameBootstrapPowerupInventoryMethods");
var GameBootstrapTelemetryMethods = require("./GameBootstrapTelemetryMethods");
var GameBootstrapAdRewardMethods = require("./GameBootstrapAdRewardMethods");
var GameBootstrapLevelRuntimeMethods = require("./GameBootstrapLevelRuntimeMethods");

cc.Class({
  extends: cc.Component,

  properties: {
    initialLevelId: {
      default: 1,
      tooltip: "关闭测试模式时，游戏启动加载的普通关卡 ID。"
    },
    enableSpecialEntitiesTestMode: {
      default: false,
      tooltip: "开启后将优先进入“技能球/障碍球测试关卡”。"
    },
    specialEntitiesTestLevelId: {
      default: 20,
      tooltip: "测试模式下的启动关卡 ID（建议为包含彩虹球/炸裂球/石头球的关卡）。"
    },
    showDebugOverlay: {
      default: false,
      tooltip: "是否显示轻量调试信息面板（启动状态/运行状态）。"
    },
    showGridTestLayer: {
      default: false,
      tooltip: "是否显示网格测试层（空槽位与编号），用于瞄准调试。"
    },
    showDropTestButton: {
      default: false,
      tooltip: "是否显示“底层掉落测试”按钮。"
    },
    enableLevelEditor: {
      default: false,
      tooltip: "是否启用关卡编辑器（路线绘制、踩点记录、保存配置）。"
    },
    routePointMinDistance: {
      default: 18,
      tooltip: "路线连续采样时，两次记录点之间的最小距离（像素）。"
    },
    levelSelectMaxLevelId: {
      default: 21,
      tooltip: "关卡选择界面的快速首屏数量（用于避免首次扫描资源目录阻塞展示）。"
    },
    resetLevelProgressOnStart: {
      default: false,
      tooltip: "是否在启动时重置通关进度（最高解锁/已通关/星级）。"
    },
    inspectorStaminaValue: {
      default: 10,
      tooltip: "爱心体力测试值（启动时强制写入当前体力，便于测试）。"
    },
    enableStartupLoadingView: {
      default: true,
      tooltip: "是否在启动时先展示资源加载界面。"
    },
    loadingViewMinVisibleMs: {
      default: 900,
      tooltip: "资源加载界面的最短展示时长（毫秒），避免闪屏。"
    },
    loadingAniMaxMoveSpeed: {
      default: 20,
      tooltip: "资源加载界面 ani 节点的最大移动速度，用于测试加载动画位移。"
    },
    startupPreloadLevelCount: {
      default: 5,
      tooltip: "启动阶段预加载的关卡配置数量（从首关开始）。"
    },
    projectileSpeed: {
      default: 960,
      tooltip: "发射球飞行速度（像素/秒），启动时写入全局棋盘参数。"
    },
    impactBounceSpeed: {
      default: 220,
      tooltip: "命中后邻居球反弹速度（像素/秒），用于调试反弹动效快慢。"
    },
    jarRimBounceSpeed: {
      default: 260,
      tooltip: "掉落球碰到缸口边缘时的反弹速度（像素/秒），用于调试入缸手感。"
    },
    aimRefreshMinDistance: {
      default: 6,
      tooltip: "瞄准拖动时触发辅助线刷新的最小位移阈值（像素）。"
    },
    showGhostBubble: {
      default: true,
      tooltip: "是否显示幽灵球（预测落点虚拟球）。"
    },
    guideFrontClipRadiusScale: {
      default: 1,
      tooltip: "辅助线在幽灵球前端的截断系数（按球半径倍数计算，1=一个球半径）。"
    },
    guideDotPulseSpeedScale: {
      default: 1,
      tooltip: "辅助线呼吸动画速度系数（>1 更快，<1 更慢）。"
    },
    enableBackgroundMusic: {
      default: true,
      tooltip: "是否启用背景音乐。"
    },
    enableSoundEffects: {
      default: true,
      tooltip: "是否启用音效。"
    },
    enableVibration: {
      default: true,
      tooltip: "是否启用震动反馈。"
    },
    backgroundMusicVolume: {
      default: 1,
      tooltip: "背景音乐音量（0~1）。"
    },
    soundEffectsVolume: {
      default: 1,
      tooltip: "音效音量（0~1）。"
    },
    levelBackgroundMusicResource: {
      default: "sound/level_bg",
      tooltip: "关卡选择页面背景音乐资源路径（Resources 相对路径）。"
    },
    gameBackgroundMusicResource: {
      default: "sound/game_bg",
      tooltip: "游戏界面背景音乐资源路径（Resources 相对路径）。"
    },
    uiClickSfxResource: {
      default: "sound/ding0",
      tooltip: "按钮/界面点击音效资源路径。"
    },
    shotSfxResource: {
      default: "sound/ding2",
      tooltip: "发射音效资源路径。"
    },
    loseSfxResource: {
      default: "sound/ding3",
      tooltip: "失败音效资源路径。"
    },
    winSfxResource: {
      default: "sound/ding4",
      tooltip: "胜利音效资源路径。"
    },
    jarBounceSfxResources: {
      default: "sound/ding0,sound/ding1,sound/ding2,sound/ding3,sound/ding4,sound/ding5",
      tooltip: "掉落玻璃球与缸碰撞时随机播放的音效资源列表，使用英文逗号分隔。"
    },
    jarCollectBottomSfxResource: {
      default: "sound/ding0",
      tooltip: "球落入缸底被收集时播放的音效资源路径。"
    },
    rewardedVideoAdUnitId: {
      default: "",
      tooltip: "微信激励视频广告位 ID。发布前必须配置。"
    },
    enableMockRewardedAdOnUnsupported: {
      default: false,
      tooltip: "非微信环境是否使用模拟激励广告（便于开发验证）。"
    },
    staminaAdDailyLimit: {
      default: 5,
      tooltip: "看广告补体力每日上限。"
    },
    inventoryAdDailyLimit: {
      default: 12,
      tooltip: "看广告补道具每日上限。"
    },
    loseAdDailyLimit: {
      default: 20,
      tooltip: "失败页看广告领下局奖励每日上限。"
    },
    adRewardCooldownSeconds: {
      default: 8,
      tooltip: "广告奖励频控冷却秒数。"
    }
  },

  _applyRuntimeModeConfig: GameBootstrapRuntimeConfigMethods._applyRuntimeModeConfig,
  onLoad: GameBootstrapCompositionMethods.onLoad,
  _applyBoardTuningFromProperties: GameBootstrapRuntimeConfigMethods._applyBoardTuningFromProperties,
  _applyViewportLayout: GameBootstrapRuntimeConfigMethods._applyViewportLayout,
  _resolveSafeAreaInsetsInDesignSpace: GameBootstrapRuntimeConfigMethods._resolveSafeAreaInsetsInDesignSpace,
  _getSafeAreaRectFromRuntime: GameBootstrapRuntimeConfigMethods._getSafeAreaRectFromRuntime,
  start: GameBootstrapStartupMethods.start,
  onEnable: GameBootstrapLifecycleMethods.onEnable,
  onDisable: GameBootstrapLifecycleMethods.onDisable,
  onDestroy: GameBootstrapLifecycleMethods.onDestroy,
  _handleViewResize: GameBootstrapLifecycleMethods._handleViewResize,
  _runStartupLoadingFlow: GameBootstrapStartupMethods._runStartupLoadingFlow,
  _ensureLoadingViewController: GameBootstrapStartupMethods._ensureLoadingViewController,
  _syncLoadingViewConfig: GameBootstrapStartupMethods._syncLoadingViewConfig,
  _findSceneLoadingViewNode: GameBootstrapStartupMethods._findSceneLoadingViewNode,
  _createFallbackLoadingViewNode: GameBootstrapStartupMethods._createFallbackLoadingViewNode,
  _runWeightedStartupTasks: GameBootstrapStartupMethods._runWeightedStartupTasks,
  _preloadStartupPrefabs: GameBootstrapStartupMethods._preloadStartupPrefabs,
  _buildAudioConfig: GameBootstrapAudioMethods._buildAudioConfig,
  _getLevelSelectBgmPath: GameBootstrapAudioMethods._getLevelSelectBgmPath,
  _getGameplayBgmPath: GameBootstrapAudioMethods._getGameplayBgmPath,
  _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
  _preloadStartupAudio: GameBootstrapAudioMethods._preloadStartupAudio,
  _playBackgroundMusic: GameBootstrapAudioMethods._playBackgroundMusic,
  _playLevelSelectBackgroundMusic: GameBootstrapAudioMethods._playLevelSelectBackgroundMusic,
  _playGameplayBackgroundMusic: GameBootstrapAudioMethods._playGameplayBackgroundMusic,
  _playSfx: GameBootstrapAudioMethods._playSfx,
  _triggerShortVibration: GameBootstrapAudioMethods._triggerShortVibration,
  _playRuntimeAudioEvents: GameBootstrapAudioMethods._playRuntimeAudioEvents,
  _preloadStartupLevelConfigs: GameBootstrapStartupMethods._preloadStartupLevelConfigs,
  _delay: GameBootstrapStartupMethods._delay,
  update: GameBootstrapGameplayInputMethods.update,
  _bindInput: GameBootstrapGameplayInputMethods._bindInput,
  _getShooterOriginPoint: GameBootstrapGameplayInputMethods._getShooterOriginPoint,
  _isShotTouchPointValid: GameBootstrapGameplayInputMethods._isShotTouchPointValid,
  _onAimStart: GameBootstrapGameplayInputMethods._onAimStart,
  _onAimMove: GameBootstrapGameplayInputMethods._onAimMove,
  _onFireTouch: GameBootstrapGameplayInputMethods._onFireTouch,
  _onAimCancel: GameBootstrapGameplayInputMethods._onAimCancel,
  _onUseSkillBallTap: GameBootstrapPowerupInventoryMethods._onUseSkillBallTap,
  _onUseSwapBallTap: GameBootstrapPowerupInventoryMethods._onUseSwapBallTap,
  _onUseBarrierHammerTap: GameBootstrapPowerupInventoryMethods._onUseBarrierHammerTap,
  _handleBarrierHammerTargetTouch: GameBootstrapPowerupInventoryMethods._handleBarrierHammerTargetTouch,
  _isBarrierHammerTargeting: GameBootstrapPowerupInventoryMethods._isBarrierHammerTargeting,
  _setStatusWithTip: GameBootstrapPowerupInventoryMethods._setStatusWithTip,
  _refreshPlayerInventory: GameBootstrapPowerupInventoryMethods._refreshPlayerInventory,
  _addInventoryItem: GameBootstrapPowerupInventoryMethods._addInventoryItem,
  _refreshSelectedPowerups: GameBootstrapPowerupInventoryMethods._refreshSelectedPowerups,
  _saveSelectedPowerups: GameBootstrapPowerupInventoryMethods._saveSelectedPowerups,
  _getSelectedPowerupTotalCount: GameBootstrapPowerupInventoryMethods._getSelectedPowerupTotalCount,
  _normalizeSelectedPowerupCountsByTotalLimit: GameBootstrapPowerupInventoryMethods._normalizeSelectedPowerupCountsByTotalLimit,
  _getAvailableSelectedPowerupItems: GameBootstrapPowerupInventoryMethods._getAvailableSelectedPowerupItems,
  _getSelectedPowerupLoadouts: GameBootstrapPowerupInventoryMethods._getSelectedPowerupLoadouts,
  _applySelectedPowerupsToRuntime: GameBootstrapPowerupInventoryMethods._applySelectedPowerupsToRuntime,
  _consumePersistentInventoryItemForPowerup: GameBootstrapPowerupInventoryMethods._consumePersistentInventoryItemForPowerup,
  _ensureInventoryViewPrefab: GameBootstrapPowerupInventoryMethods._ensureInventoryViewPrefab,
  _setPendingLevelEntry: GameBootstrapPowerupInventoryMethods._setPendingLevelEntry,
  _clearPendingLevelEntry: GameBootstrapPowerupInventoryMethods._clearPendingLevelEntry,
  _isInventorySelectionOperable: GameBootstrapPowerupInventoryMethods._isInventorySelectionOperable,
  _hasAvailableInventoryForLevelEntry: GameBootstrapPowerupInventoryMethods._hasAvailableInventoryForLevelEntry,
  _enterLevelFromLevelSelect: GameBootstrapPowerupInventoryMethods._enterLevelFromLevelSelect,
  _startPendingLevelEntry: GameBootstrapPowerupInventoryMethods._startPendingLevelEntry,
  _showInventoryView: GameBootstrapPowerupInventoryMethods._showInventoryView,
  _hideInventoryView: GameBootstrapPowerupInventoryMethods._hideInventoryView,
  _confirmInventorySelection: GameBootstrapPowerupInventoryMethods._confirmInventorySelection,
  _toggleInventorySelection: GameBootstrapPowerupInventoryMethods._toggleInventorySelection,
  _increaseInventorySelectionCount: GameBootstrapPowerupInventoryMethods._increaseInventorySelectionCount,
  _decreaseInventorySelectionCount: GameBootstrapPowerupInventoryMethods._decreaseInventorySelectionCount,
  _renderInventoryView: GameBootstrapPowerupInventoryMethods._renderInventoryView,
  _updateInventoryEntryState: GameBootstrapPowerupInventoryMethods._updateInventoryEntryState,
  _trackTelemetry: GameBootstrapTelemetryMethods._trackTelemetry,
  _beginLevelAttemptTracking: GameBootstrapTelemetryMethods._beginLevelAttemptTracking,
  _trackRuntimeTelemetryEvent: GameBootstrapTelemetryMethods._trackRuntimeTelemetryEvent,
  _onRuntimeStateTransition: GameBootstrapTelemetryMethods._onRuntimeStateTransition,
  _buildAttemptRewardKey: GameBootstrapAdRewardMethods._buildAttemptRewardKey,
  _hasGrantedAttemptReward: GameBootstrapAdRewardMethods._hasGrantedAttemptReward,
  _markAttemptRewardGranted: GameBootstrapAdRewardMethods._markAttemptRewardGranted,
  _hasRewardedVideoAdConfig: GameBootstrapAdRewardMethods._hasRewardedVideoAdConfig,
  _requireRewardedVideoAdConfig: GameBootstrapAdRewardMethods._requireRewardedVideoAdConfig,
  _canShowRewardedVideoAd: GameBootstrapAdRewardMethods._canShowRewardedVideoAd,
  _setRewardedVideoAdUnavailableStatus: GameBootstrapAdRewardMethods._setRewardedVideoAdUnavailableStatus,
  _setRewardedAdFailureStatus: GameBootstrapAdRewardMethods._setRewardedAdFailureStatus,
  _setAdQuotaBlockedStatus: GameBootstrapAdRewardMethods._setAdQuotaBlockedStatus,
  _buildRewardedAdSceneId: GameBootstrapAdRewardMethods._buildRewardedAdSceneId,
  _onLoseWatchAdTap: GameBootstrapAdRewardMethods._onLoseWatchAdTap,
  _showRewardedAdForEntry: GameBootstrapAdRewardMethods._showRewardedAdForEntry,
  _grantAdEntryReward: GameBootstrapAdRewardMethods._grantAdEntryReward,
  _queueNextRoundReward: GameBootstrapAdRewardMethods._queueNextRoundReward,
  _applyPendingNextRoundRewards: GameBootstrapAdRewardMethods._applyPendingNextRoundRewards,
  _tryRecoverInventoryByAd: GameBootstrapAdRewardMethods._tryRecoverInventoryByAd,
  _tryRecoverStaminaByAd: GameBootstrapAdRewardMethods._tryRecoverStaminaByAd,
  _loadInitialLevel: GameBootstrapLevelRuntimeMethods._loadInitialLevel,
  _getStartupLevelId: GameBootstrapLevelRuntimeMethods._getStartupLevelId,
  _restartCurrentLevel: GameBootstrapLevelRuntimeMethods._restartCurrentLevel,
  _isTerminalState: GameBootstrapLevelRuntimeMethods._isTerminalState,
  _createStatusOverlay: GameBootstrapUiFlowMethods._createStatusOverlay,
  _onNextLevelTap: GameBootstrapUiFlowMethods._onNextLevelTap,
  _onBackToLevelTap: GameBootstrapUiFlowMethods._onBackToLevelTap,
  _loadLevelById: GameBootstrapUiFlowMethods._loadLevelById,
  _createDropTestButton: GameBootstrapUiFlowMethods._createDropTestButton,
  _createRouteEditorButtons: GameBootstrapUiFlowMethods._createRouteEditorButtons,
  _createEmptyRouteEditorState: GameBootstrapUiFlowMethods._createEmptyRouteEditorState,
  _syncRouteEditorButtonHosts: GameBootstrapUiFlowMethods._syncRouteEditorButtonHosts,
  _prepareRouteEditorForLevel: GameBootstrapUiFlowMethods._prepareRouteEditorForLevel,
  _isRouteEditorCapturingInput: GameBootstrapUiFlowMethods._isRouteEditorCapturingInput,
  _getActiveRouteEditorRoute: GameBootstrapUiFlowMethods._getActiveRouteEditorRoute,
  _createRouteEditorRoute: GameBootstrapUiFlowMethods._createRouteEditorRoute,
  _ensureActiveRouteEditorRoute: GameBootstrapUiFlowMethods._ensureActiveRouteEditorRoute,
  _appendRouteEditorPoint: GameBootstrapUiFlowMethods._appendRouteEditorPoint,
  _renderRouteEditor: GameBootstrapUiFlowMethods._renderRouteEditor,
  _refreshRouteEditorButtons: GameBootstrapUiFlowMethods._refreshRouteEditorButtons,
  _handleRouteEditorTouchStart: GameBootstrapUiFlowMethods._handleRouteEditorTouchStart,
  _handleRouteEditorTouchMove: GameBootstrapUiFlowMethods._handleRouteEditorTouchMove,
  _handleRouteEditorTouchEnd: GameBootstrapUiFlowMethods._handleRouteEditorTouchEnd,
  _handleRouteEditorTouchCancel: GameBootstrapUiFlowMethods._handleRouteEditorTouchCancel,
  _onRouteEditorToggleTap: GameBootstrapUiFlowMethods._onRouteEditorToggleTap,
  _onRouteEditorNewTap: GameBootstrapUiFlowMethods._onRouteEditorNewTap,
  _onRouteEditorUndoTap: GameBootstrapUiFlowMethods._onRouteEditorUndoTap,
  _onRouteEditorClearTap: GameBootstrapUiFlowMethods._onRouteEditorClearTap,
  _persistRouteEditorIfDirty: GameBootstrapUiFlowMethods._persistRouteEditorIfDirty,
  _onRouteEditorSaveTap: GameBootstrapUiFlowMethods._onRouteEditorSaveTap,
  _onDropTestButtonTap: GameBootstrapUiFlowMethods._onDropTestButtonTap,
  _setStatus: GameBootstrapUiFlowMethods._setStatus,
  _formatStatus: GameBootstrapUiFlowMethods._formatStatus,
  _setDropTestButtonVisible: GameBootstrapUiFlowMethods._setDropTestButtonVisible,
  _showLevelSelectView: GameBootstrapUiFlowMethods._showLevelSelectView,
  _hideLevelSelectView: GameBootstrapUiFlowMethods._hideLevelSelectView,
  _refreshPlayerResources: GameBootstrapUiFlowMethods._refreshPlayerResources,
  _getCurrentStamina: GameBootstrapUiFlowMethods._getCurrentStamina,
  _getCurrentCoins: GameBootstrapUiFlowMethods._getCurrentCoins,
  _spendCoinsForShop: GameBootstrapUiFlowMethods._spendCoinsForShop,
  _refundCoinsForShop: GameBootstrapUiFlowMethods._refundCoinsForShop,
  _addStaminaForShop: GameBootstrapUiFlowMethods._addStaminaForShop,
  _consumeStaminaForLevelEntry: GameBootstrapUiFlowMethods._consumeStaminaForLevelEntry,
  _getLevelSelectTopLayerNode: GameBootstrapUiFlowMethods._getLevelSelectTopLayerNode,
  _updateLevelSelectTopStatus: GameBootstrapUiFlowMethods._updateLevelSelectTopStatus,
  _getDailySignInConfig: GameBootstrapUiFlowMethods._getDailySignInConfig,
  _refreshSignInState: GameBootstrapUiFlowMethods._refreshSignInState,
  _markSignInPopupShown: GameBootstrapUiFlowMethods._markSignInPopupShown,
  _canClaimSignInToday: GameBootstrapUiFlowMethods._canClaimSignInToday,
  _ensureSignInEntryRedDot: GameBootstrapUiFlowMethods._ensureSignInEntryRedDot,
  _updateSignInEntryState: GameBootstrapUiFlowMethods._updateSignInEntryState,
  _ensureSignInViewPrefab: GameBootstrapUiFlowMethods._ensureSignInViewPrefab,
  _ensureSignInButtonSpriteFrames: GameBootstrapUiFlowMethods._ensureSignInButtonSpriteFrames,
  _resolveSignInRewardByDay: GameBootstrapUiFlowMethods._resolveSignInRewardByDay,
  _resolveSignInDisplayRewardItem: GameBootstrapUiFlowMethods._resolveSignInDisplayRewardItem,
  _resolveSignInIconPath: GameBootstrapUiFlowMethods._resolveSignInIconPath,
  _ensureSignInIconSpriteFrame: GameBootstrapUiFlowMethods._ensureSignInIconSpriteFrame,
  _resolveSignInDayUiState: GameBootstrapUiFlowMethods._resolveSignInDayUiState,
  _bindSignInViewActions: GameBootstrapUiFlowMethods._bindSignInViewActions,
  _renderSignInView: GameBootstrapUiFlowMethods._renderSignInView,
  _showSignInView: GameBootstrapUiFlowMethods._showSignInView,
  _hideSignInView: GameBootstrapUiFlowMethods._hideSignInView,
  _ensureAwardViewPrefab: GameBootstrapUiFlowMethods._ensureAwardViewPrefab,
  _ensureAwardItemIconSpriteFrame: GameBootstrapUiFlowMethods._ensureAwardItemIconSpriteFrame,
  _resolveAwardViewNodes: GameBootstrapUiFlowMethods._resolveAwardViewNodes,
  _bindAwardViewActions: GameBootstrapUiFlowMethods._bindAwardViewActions,
  _renderAwardView: GameBootstrapUiFlowMethods._renderAwardView,
  _showAwardViewForRewardItems: GameBootstrapUiFlowMethods._showAwardViewForRewardItems,
  _hideAwardView: GameBootstrapUiFlowMethods._hideAwardView,
  _grantSignInRewardItems: GameBootstrapUiFlowMethods._grantSignInRewardItems,
  _resolveSignInRewardItemsForDay: GameBootstrapUiFlowMethods._resolveSignInRewardItemsForDay,
  _completeTodaySignInRewardClaim: GameBootstrapUiFlowMethods._completeTodaySignInRewardClaim,
  _claimTodaySignInReward: GameBootstrapUiFlowMethods._claimTodaySignInReward,
  _claimTodaySignInRewardByAd: GameBootstrapUiFlowMethods._claimTodaySignInRewardByAd,
  _maybeAutoShowSignInView: GameBootstrapUiFlowMethods._maybeAutoShowSignInView,
  _resolveLeaderboardPlayerName: GameBootstrapUiFlowMethods._resolveLeaderboardPlayerName,
  _refreshLeaderboardEntries: GameBootstrapUiFlowMethods._refreshLeaderboardEntries,
  _ensureRankingViewPrefab: GameBootstrapUiFlowMethods._ensureRankingViewPrefab,
  _onLevelSelectRankingTap: GameBootstrapUiFlowMethods._onLevelSelectRankingTap,
  _showRankingView: GameBootstrapUiFlowMethods._showRankingView,
  _hideRankingView: GameBootstrapUiFlowMethods._hideRankingView,
  _renderRankingView: GameBootstrapUiFlowMethods._renderRankingView,
  _ensureShopViewPrefab: GameBootstrapUiFlowMethods._ensureShopViewPrefab,
  _ensureBuyViewPrefab: GameBootstrapUiFlowMethods._ensureBuyViewPrefab,
  _onLevelSelectShopTap: GameBootstrapUiFlowMethods._onLevelSelectShopTap,
  _showShopView: GameBootstrapUiFlowMethods._showShopView,
  _hideShopView: GameBootstrapUiFlowMethods._hideShopView,
  _buildShopPurchaseState: GameBootstrapUiFlowMethods._buildShopPurchaseState,
  _renderShopView: GameBootstrapUiFlowMethods._renderShopView,
  _onShopGoodsTap: GameBootstrapUiFlowMethods._onShopGoodsTap,
  _showBuyView: GameBootstrapUiFlowMethods._showBuyView,
  _renderBuyView: GameBootstrapUiFlowMethods._renderBuyView,
  _hideBuyView: GameBootstrapUiFlowMethods._hideBuyView,
  _confirmShopPurchase: GameBootstrapUiFlowMethods._confirmShopPurchase,
  _resolveShopPurchaseFailMessage: GameBootstrapUiFlowMethods._resolveShopPurchaseFailMessage,
  _getStarChestSummary: GameBootstrapUiFlowMethods._getStarChestSummary,
  _ensureStarChestEntryRedDot: GameBootstrapUiFlowMethods._ensureStarChestEntryRedDot,
  _updateStarChestEntryState: GameBootstrapUiFlowMethods._updateStarChestEntryState,
  _ensureShopEntryButton: GameBootstrapUiFlowMethods._ensureShopEntryButton,
  _openStarChest: GameBootstrapUiFlowMethods._openStarChest,
  _ensureGameCircleEntryRedDot: GameBootstrapUiFlowMethods._ensureGameCircleEntryRedDot,
  _ensureGameCircleEntryButton: GameBootstrapUiFlowMethods._ensureGameCircleEntryButton,
  _updateGameCircleEntryState: GameBootstrapUiFlowMethods._updateGameCircleEntryState,
  _ensureGameCircleWelfareViewPrefab: GameBootstrapUiFlowMethods._ensureGameCircleWelfareViewPrefab,
  _showGameCircleWelfareView: GameBootstrapUiFlowMethods._showGameCircleWelfareView,
  _hideGameCircleWelfareView: GameBootstrapUiFlowMethods._hideGameCircleWelfareView,
  _renderGameCircleWelfareView: GameBootstrapUiFlowMethods._renderGameCircleWelfareView,
  _refreshGameCircleWelfareProgress: GameBootstrapUiFlowMethods._refreshGameCircleWelfareProgress,
  _claimGameCircleWelfareTask: GameBootstrapUiFlowMethods._claimGameCircleWelfareTask,
  _bindGameCircleWelfareReturnRefresh: GameBootstrapUiFlowMethods._bindGameCircleWelfareReturnRefresh,
  _unbindGameCircleWelfareReturnRefresh: GameBootstrapUiFlowMethods._unbindGameCircleWelfareReturnRefresh,
  _markGameCircleWelfareRefreshPending: GameBootstrapUiFlowMethods._markGameCircleWelfareRefreshPending,
  _handleGameCircleWelfareReturnToGame: GameBootstrapUiFlowMethods._handleGameCircleWelfareReturnToGame,
  _resolveNativeButtonRectForNode: GameBootstrapUiFlowMethods._resolveNativeButtonRectForNode,
  _syncGameCircleNativeButtons: GameBootstrapUiFlowMethods._syncGameCircleNativeButtons,
  _openGameCircleFromWelfare: GameBootstrapUiFlowMethods._openGameCircleFromWelfare,
  _onLevelSelectSettingTap: GameBootstrapUiFlowMethods._onLevelSelectSettingTap,
  _ensureSettingViewPrefab: GameBootstrapUiFlowMethods._ensureSettingViewPrefab,
  _showSettingView: GameBootstrapUiFlowMethods._showSettingView,
  _hideSettingView: GameBootstrapUiFlowMethods._hideSettingView,
  _bindSettingViewActions: GameBootstrapUiFlowMethods._bindSettingViewActions,
  _restoreDefaultAudioSettings: GameBootstrapUiFlowMethods._restoreDefaultAudioSettings,
  _syncSettingViewFromAudioSettings: GameBootstrapUiFlowMethods._syncSettingViewFromAudioSettings,
  _adjustSettingVolumeByStep: GameBootstrapUiFlowMethods._adjustSettingVolumeByStep,
  _setSettingVolumeToZero: GameBootstrapUiFlowMethods._setSettingVolumeToZero,
  _normalizeSettingVolume: GameBootstrapUiFlowMethods._normalizeSettingVolume,
  _ensureSettingVolumeIconSprites: GameBootstrapUiFlowMethods._ensureSettingVolumeIconSprites,
  _updateSettingVolumeIconView: GameBootstrapUiFlowMethods._updateSettingVolumeIconView,
  _updateSettingToggleStatusView: GameBootstrapUiFlowMethods._updateSettingToggleStatusView,
  _bindToggleChangeOnce: GameBootstrapUiFlowMethods._bindToggleChangeOnce,
  _bindSettingVolumeDragOnce: GameBootstrapUiFlowMethods._bindSettingVolumeDragOnce,
  _applySettingVolumeFromTouch: GameBootstrapUiFlowMethods._applySettingVolumeFromTouch,
  _syncSettingVolumeStarPosition: GameBootstrapUiFlowMethods._syncSettingVolumeStarPosition,
  _resolveSettingControlNodes: GameBootstrapUiFlowMethods._resolveSettingControlNodes,
  _findNodeByNameRecursive: GameBootstrapUiFlowMethods._findNodeByNameRecursive,
  _bindNodeTapOnce: GameBootstrapUiFlowMethods._bindNodeTapOnce,
  _ensureLevelSelectPrefabs: GameBootstrapUiFlowMethods._ensureLevelSelectPrefabs,
  _tryLoadFirstAvailablePrefab: GameBootstrapUiFlowMethods._tryLoadFirstAvailablePrefab,
  _loadPrefab: GameBootstrapUiFlowMethods._loadPrefab,
  _loadAvailableLevelIds: GameBootstrapUiFlowMethods._loadAvailableLevelIds,
  _refreshAvailableLevelIdsInBackground: GameBootstrapUiFlowMethods._refreshAvailableLevelIdsInBackground,
  _buildSequentialLevelIds: GameBootstrapUiFlowMethods._buildSequentialLevelIds,
  _preloadLevelConfigsInBackground: GameBootstrapUiFlowMethods._preloadLevelConfigsInBackground,
  _getLevelIdFromResourcePath: GameBootstrapUiFlowMethods._getLevelIdFromResourcePath,
  _renderLevelSelectContent: GameBootstrapUiFlowMethods._renderLevelSelectContent,
  _resolveMapSlotsPerPage: GameBootstrapUiFlowMethods._resolveMapSlotsPerPage,
  _resolveLevelMapIndexByLevelId: GameBootstrapUiFlowMethods._resolveLevelMapIndexByLevelId,
  _onLevelSelectMapIndexChange: GameBootstrapUiFlowMethods._onLevelSelectMapIndexChange,
  _refreshLevelProgress: GameBootstrapUiFlowMethods._refreshLevelProgress,
  _rememberSelectedLevel: GameBootstrapUiFlowMethods._rememberSelectedLevel,
  _handleRuntimeStateTransition: GameBootstrapUiFlowMethods._handleRuntimeStateTransition,
  _recordCurrentLevelWin: GameBootstrapUiFlowMethods._recordCurrentLevelWin,
  _calculateStarRating: GameBootstrapUiFlowMethods._calculateStarRating,
  _getLevelStarCount: GameBootstrapUiFlowMethods._getLevelStarCount,
  _isLevelCompleted: GameBootstrapUiFlowMethods._isLevelCompleted,
  _resolveHighlightedLevelId: GameBootstrapUiFlowMethods._resolveHighlightedLevelId,
  _onLevelSelectTap: GameBootstrapUiFlowMethods._onLevelSelectTap
});

