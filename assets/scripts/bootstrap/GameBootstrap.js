"use strict";

var createLazyModuleMethods = require("./GameBootstrapLazyModule").createLazyModuleMethods;
var LazyRegistry = require("./GameBootstrapLazyRegistry");
var GameBootstrapUiFlowMethods = require("./GameBootstrapUiFlowMethods");
var GameBootstrapRuntimeConfigMethods = require("./GameBootstrapRuntimeConfigMethods");
var GameBootstrapCompositionMethods = require("./GameBootstrapCompositionMethods");
var GameBootstrapLifecycleMethods = require("./GameBootstrapLifecycleMethods");
var GameBootstrapStartupMethods = require("./GameBootstrapStartupMethods");
var GameBootstrapAudioMethods = require("./GameBootstrapAudioMethods");
var GameBootstrapGameplayInputMethods = require("./GameBootstrapGameplayInputMethods");
var GameBootstrapLevelRuntimeMethods = require("./GameBootstrapLevelRuntimeMethods");
var GameBootstrapNewUserGuideMethods = require("./GameBootstrapNewUserGuideMethods");
var GameBootstrapSpecialIntroduceFlowMethods = require("./GameBootstrapSpecialIntroduceFlowMethods");
var GameBootstrapAssistSpiritSkillMethods = require("./GameBootstrapAssistSpiritSkillMethods");
var lazySpiritHallMethods = createLazyModuleMethods(
  "./GameBootstrapSpiritHallMethods",
  LazyRegistry.SPIRIT_HALL_METHODS
);
var lazySpiritShopMethods = createLazyModuleMethods(
  "./GameBootstrapSpiritShopMethods",
  LazyRegistry.SPIRIT_SHOP_METHODS
);
var lazyPowerupInventoryMethods = createLazyModuleMethods(
  "./GameBootstrapPowerupInventoryMethods",
  LazyRegistry.POWERUP_INVENTORY_METHODS
);
var lazyTelemetryMethods = createLazyModuleMethods(
  "./GameBootstrapTelemetryMethods",
  LazyRegistry.TELEMETRY_METHODS
);
var lazyAdRewardMethods = createLazyModuleMethods(
  "./GameBootstrapAdRewardMethods",
  LazyRegistry.AD_REWARD_METHODS
);
var lazyGameplayMemoryMethods = createLazyModuleMethods(
  "./GameBootstrapGameplayMemoryMethods",
  LazyRegistry.GAMEPLAY_MEMORY_METHODS
);
var lazyAssetStatsMethods = createLazyModuleMethods(
  "./GameBootstrapAssetStatsMethods",
  LazyRegistry.ASSET_STATS_METHODS
);

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
    enableAssetStatsLog: {
      default: false,
      tooltip: "是否输出 cc.assetManager 资源类型统计到控制台日志（仅 dev 模式生效，release 强制关闭）。"
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
      default: 1000,
      tooltip: "关卡选择界面的快速首屏数量（用于避免首次扫描资源目录阻塞展示）。"
    },
    unlockAllLevelsForTest: {
      default: false,
      tooltip: "测试开关：开启后关卡选择界面临时解锁全部可用关卡，不写入玩家进度。"
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
      default: 0,
      tooltip: "资源加载界面的最短展示时长（毫秒），避免闪屏。"
    },
    loadingAniMaxMoveSpeed: {
      default: 20,
      tooltip: "资源加载界面 ani 节点的最大移动速度，用于测试加载动画位移。"
    },
    networkLoadingTimeoutMs: {
      default: 10000,
      tooltip: "网络接口 loading 的超时时间（毫秒）。"
    },
    shareTitle: {
      default: "泡泡龙闯关挑战",
      tooltip: "微信转发卡片标题。"
    },
    shareImageUrl: {
      default: "",
      tooltip: "微信转发卡片图片路径；留空时不传 imageUrl。"
    },
    shareQuery: {
      default: "from=share",
      tooltip: "微信转发卡片携带的 query 参数。"
    },
    friendGiftCloudEnvId: {
      default: "cloud1-d7gqettx3e9249ca1",
      tooltip: "自研好友体力赠送使用的微信云开发环境 ID。"
    },
    enablePlayerCloudProfile: {
      default: true,
      tooltip: "是否启用玩家信息微信云端存储。开启后启动阶段必须成功同步云端玩家档案。"
    },
    playerProfileCloudEnvId: {
      default: "cloud1-d7gqettx3e9249ca1",
      tooltip: "玩家信息云端存储使用的微信云开发环境 ID。"
    },
    playerProfileCloudFunctionName: {
      default: "playerProfile",
      tooltip: "玩家信息云端存储使用的微信云函数名称。"
    },
    playerProfileCloudSyncDebounceMs: {
      default: 5000,
      tooltip: "玩家信息本地写入后延迟上传云端的合并等待时间（毫秒）。"
    },
    worldLeaderboardCloudEnvId: {
      default: "cloud1-d7gqettx3e9249ca1",
      tooltip: "世界排行榜使用的微信云开发环境 ID。"
    },
    worldLeaderboardCloudFunctionName: {
      default: "worldLeaderboard",
      tooltip: "世界排行榜使用的微信云函数名称。"
    },
    worldLeaderboardLimit: {
      default: 100,
      tooltip: "世界排行榜单次拉取的最大条目数。"
    },
    startupPreloadLevelCount: {
      default: 1,
      tooltip: "选关页展示后后台预加载的关卡配置数量（从首关开始）。"
    },
    gameplayBundleIdleReleaseMs: {
      default: 10000,
      tooltip: "离开局内返回选关后，超过该毫秒未再次进入局内则释放 game 分包。"
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
    dropGravity: {
      default: 900,
      tooltip: "掉落球重力加速度（像素/秒²），用于调试下落手感。"
    },
    dropInitialSpeedY: {
      default: 240,
      tooltip: "掉落球向下初速度基准值（像素/秒），实际会在 5 档间循环偏移。"
    },
    aimRefreshMinDistance: {
      default: 6,
      tooltip: "瞄准拖动时触发辅助线刷新的最小位移阈值（像素）。"
    },
    aimRefreshMinIntervalMs: {
      default: 33,
      tooltip: "瞄准拖动时触发轨迹重算的最小时间间隔（毫秒）。"
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
    timedLevelBackgroundMusicResource: {
      default: "sound/game_bg_timed_level",
      tooltip: "倒计时关卡背景音乐资源路径（Resources 相对路径）。"
    },
    uiClickSfxResource: {
      default: "sound/ding0",
      tooltip: "按钮/界面点击音效资源路径。"
    },
    shotSfxResource: {
      default: "sound/ding2",
      tooltip: "发射音效资源路径。"
    },
    emissionSfxResource: {
      default: "sound/emission",
      tooltip: "通关后每颗剩余球实际发射时播放的音效资源路径（Resources 相对路径）。"
    },
    loseSfxResource: {
      default: "sound/ding3",
      tooltip: "失败音效资源路径。"
    },
    winSfxResource: {
      default: "sound/ding4",
      tooltip: "胜利音效资源路径。"
    },
    jarCollectBottomSfxResource: {
      default: "sound/score",
      tooltip: "球落入缸底被收集时播放的音效资源路径。"
    },
    joySfxResource: {
      default: "sound/joy",
      tooltip: "全部剩余球落入缸后播放的音效资源路径。"
    },
    breakSfxResource: {
      default: "sound/break",
      tooltip: "棋盘中球消除时播放的音效资源路径。"
    },
    hitBucketSfxResource: {
      default: "sound/hit_bucket",
      tooltip: "发射球经过墙壁反弹、吸附后未产生消除时播放的音效资源路径。"
    },
    fairyAssistHitSfxResources: {
      default: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
      tooltip: "掉落玻璃球与精灵碰撞时随机播放的5个音效资源路径，使用英文逗号分隔。"
    },
    fairyAssistDepartSfxResource: {
      default: "sound/fly",
      tooltip: "精灵向上飞出屏幕消失时播放的音效资源路径。"
    },
    gameEntryCountdownSfxResource: {
      default: "sound/time",
      tooltip: "开局 3-2-1-GO 倒计时音效资源路径（Resources 相对路径）。"
    },
    bombSfxResource: {
      default: "sound/bomb",
      tooltip: "炸弹道具与燃烧瓶爆炸时播放的音效资源路径（Resources 相对路径）。"
    },
    lockOpenSfxResource: {
      default: "sound/lock_open",
      tooltip: "锁定球被钥匙解锁时播放的音效资源路径（Resources 相对路径）。"
    },
    fireworksSfxResource: {
      default: "sound/fireworks",
      tooltip: "顶部空槽触发全盘掉落时播放的音效资源路径（Resources 相对路径）。"
    },
    iceBreakSfxResource: {
      default: "sound/ice_break",
      tooltip: "冰冻球成功解冻时播放的音效资源路径（Resources 相对路径）。"
    },
    vinesSfxResource: {
      default: "sound/vines",
      tooltip: "藤蔓完成缠绕普通球或技能解除藤蔓时播放的音效资源路径（Resources 相对路径）。"
    },
    tornadoSfxResource: {
      default: "sound/tornado",
      tooltip: "龙卷风技能结算成功时播放的音效资源路径（Resources 相对路径）。"
    },
    lightingSfxResource: {
      default: "sound/lighting",
      tooltip: "闪电技能结算成功时播放的音效资源路径（Resources 相对路径）。"
    },
    ablationSfxResource: {
      default: "sound/ablation",
      tooltip: "雪块消融技能结算成功时播放的音效资源路径（Resources 相对路径）。"
    },
    skillCompletedSfxResource: {
      default: "sound/skill_completed",
      tooltip: "精灵技能充能完成时播放的音效资源路径（Resources 相对路径）。"
    },
    trappedSpriteRescuedSfxResource: {
      default: "sound/cute_laughter",
      tooltip: "被困精灵成功获救时播放的笑声音效资源路径（Resources 相对路径）。"
    },
    usePropsSfxResource: {
      default: "sound/use_props",
      tooltip: "道具球成功装填进炮台时播放的音效资源路径（Resources 相对路径）。"
    },
    rewardedVideoAdUnitId: {
      default: "",
      tooltip: "微信激励视频广告位 ID。发布前必须配置。"
    },
    interstitialAdUnitId: {
      default: "adunit-a9355409b616c9d3",
      tooltip: "微信插屏广告位 ID，用于通关、连续失败和回到前台展示。"
    },
    startGameNativeTemplateAdUnitId: {
      default: "adunit-b21f1a8f609470f5",
      tooltip: "微信小游戏游戏准备界面底部原生模板广告位 ID。"
    },
    winNativeTemplateAdUnitId: {
      default: "adunit-efa559b4e701947c",
      tooltip: "微信小游戏胜利界面底部原生模板广告位 ID。"
    },
    loseNativeTemplateAdUnitId: {
      default: "adunit-9c9ee6a1cdb6a14c",
      tooltip: "微信小游戏失败界面底部原生模板广告位 ID。"
    },
    inventoryRewardedVideoAdUnitId: {
      default: "adunit-4c8e0cc2b2fc7428",
      tooltip: "局内道具库存不足时补给道具的激励视频广告位 ID。"
    },
    levelSelectGemRewardedVideoAdUnitId: {
      default: "adunit-dfa53e016c63a38d",
      tooltip: "LevelView 顶部钻石奖励使用的激励视频广告位 ID。"
    },
    signInDoubleRewardVideoAdUnitId: {
      default: "adunit-480bd8bf00a929fc",
      tooltip: "签到界面双倍领取奖励的激励视频广告位 ID。"
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
      tooltip: "失败页看广告立即复活每日上限。"
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
  _ensureGameplayKernel: GameBootstrapCompositionMethods._ensureGameplayKernel,
  _initializePostLoadingServices: GameBootstrapCompositionMethods._initializePostLoadingServices,
  _cancelGameplayBundleIdleRelease: lazyGameplayMemoryMethods._cancelGameplayBundleIdleRelease,
  _scheduleGameplayBundleIdleRelease: lazyGameplayMemoryMethods._scheduleGameplayBundleIdleRelease,
  _releaseGameplayBundleIfIdle: lazyGameplayMemoryMethods._releaseGameplayBundleIfIdle,
  _logAssetManagerStats: lazyAssetStatsMethods._logAssetManagerStats,
  _runStartupLoadingFlow: GameBootstrapStartupMethods._runStartupLoadingFlow,
  _ensureLoadingViewController: GameBootstrapStartupMethods._ensureLoadingViewController,
  _syncLoadingViewConfig: GameBootstrapStartupMethods._syncLoadingViewConfig,
  _findSceneLoadingViewNode: GameBootstrapStartupMethods._findSceneLoadingViewNode,
  _createFallbackLoadingViewNode: GameBootstrapStartupMethods._createFallbackLoadingViewNode,
  _runWeightedStartupTasks: GameBootstrapStartupMethods._runWeightedStartupTasks,
  _runStartupCloudSyncAndRemotePackPreload: GameBootstrapStartupMethods._runStartupCloudSyncAndRemotePackPreload,
  _beginStartupBundlePrefetch: GameBootstrapStartupMethods._beginStartupBundlePrefetch,
  _scheduleBackgroundRemoteLevelPackPreload: GameBootstrapStartupMethods._scheduleBackgroundRemoteLevelPackPreload,
  _scheduleDeferredUiBundleWarmup: GameBootstrapStartupMethods._scheduleDeferredUiBundleWarmup,
  _waitForNextRenderedFrame: GameBootstrapStartupMethods._waitForNextRenderedFrame,
  _scheduleDeferredFriendStaminaGiftClaim: GameBootstrapStartupMethods._scheduleDeferredFriendStaminaGiftClaim,
  _syncPlayerProfileFromCloud: GameBootstrapStartupMethods._syncPlayerProfileFromCloud,
  _scheduleDeferredPlayerCloudProfileSync: GameBootstrapStartupMethods._scheduleDeferredPlayerCloudProfileSync,
  _refreshLevelSelectAfterCloudProfileSync: GameBootstrapStartupMethods._refreshLevelSelectAfterCloudProfileSync,
  _reloadPlayerInfoFromStores: GameBootstrapStartupMethods._reloadPlayerInfoFromStores,
  _preloadStartupPrefabs: GameBootstrapStartupMethods._preloadStartupPrefabs,
  _buildAudioConfig: GameBootstrapAudioMethods._buildAudioConfig,
  _getLevelSelectBgmPath: GameBootstrapAudioMethods._getLevelSelectBgmPath,
  _getGameplayBgmPath: GameBootstrapAudioMethods._getGameplayBgmPath,
  _getTimedLevelGameplayBgmPath: GameBootstrapAudioMethods._getTimedLevelGameplayBgmPath,
  _getGameplayBgmPathForLevel: GameBootstrapAudioMethods._getGameplayBgmPathForLevel,
  _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
  _preloadStartupAudio: GameBootstrapAudioMethods._preloadStartupAudio,
  _playBackgroundMusic: GameBootstrapAudioMethods._playBackgroundMusic,
  _playLevelSelectBackgroundMusic: GameBootstrapAudioMethods._playLevelSelectBackgroundMusic,
  _playGameplayBackgroundMusic: GameBootstrapAudioMethods._playGameplayBackgroundMusic,
  _playSfx: GameBootstrapAudioMethods._playSfx,
  _playFairyAssistHitSfx: GameBootstrapAudioMethods._playFairyAssistHitSfx,
  _runGameEntryCountdown: GameBootstrapAudioMethods._runGameEntryCountdown,
  _triggerShortVibration: GameBootstrapAudioMethods._triggerShortVibration,
  _playRuntimeAudioEvents: GameBootstrapAudioMethods._playRuntimeAudioEvents,
  _preloadStartupLevelConfigs: GameBootstrapStartupMethods._preloadStartupLevelConfigs,
  _delay: GameBootstrapStartupMethods._delay,
  update: GameBootstrapGameplayInputMethods.update,
  lateUpdate: GameBootstrapGameplayInputMethods.lateUpdate,
  _bindInput: GameBootstrapGameplayInputMethods._bindInput,
  _getShooterOriginPoint: GameBootstrapGameplayInputMethods._getShooterOriginPoint,
  _isShotTouchPointValid: GameBootstrapGameplayInputMethods._isShotTouchPointValid,
  _isShooterHandoffInputLocked: GameBootstrapGameplayInputMethods._isShooterHandoffInputLocked,
  _onAimStart: GameBootstrapGameplayInputMethods._onAimStart,
  _onAimMove: GameBootstrapGameplayInputMethods._onAimMove,
  _onFireTouch: GameBootstrapGameplayInputMethods._onFireTouch,
  _onAimCancel: GameBootstrapGameplayInputMethods._onAimCancel,
  _refreshNewUserGuideState: GameBootstrapNewUserGuideMethods._refreshNewUserGuideState,
  _saveNewUserGuideState: GameBootstrapNewUserGuideMethods._saveNewUserGuideState,
  _refreshSkillPowerupGuideState: GameBootstrapNewUserGuideMethods._refreshSkillPowerupGuideState,
  _saveSkillPowerupGuideState: GameBootstrapNewUserGuideMethods._saveSkillPowerupGuideState,
  _isNewUserGuideActive: GameBootstrapNewUserGuideMethods._isNewUserGuideActive,
  _isNewUserGuideStep: GameBootstrapNewUserGuideMethods._isNewUserGuideStep,
  _ensureNewUserGuideSpriteFrame: GameBootstrapNewUserGuideMethods._ensureNewUserGuideSpriteFrame,
  _ensureNewUserGuideLayer: GameBootstrapNewUserGuideMethods._ensureNewUserGuideLayer,
  _ensureNewUserGuideFingerNode: GameBootstrapNewUserGuideMethods._ensureNewUserGuideFingerNode,
  _hideNewUserGuide: GameBootstrapNewUserGuideMethods._hideNewUserGuide,
  _runNewUserGuideFingerBreath: GameBootstrapNewUserGuideMethods._runNewUserGuideFingerBreath,
  _showNewUserGuideFingerAtTip: GameBootstrapNewUserGuideMethods._showNewUserGuideFingerAtTip,
  _applyNewUserGuideMask: GameBootstrapNewUserGuideMethods._applyNewUserGuideMask,
  _clearNewUserGuideArc: GameBootstrapNewUserGuideMethods._clearNewUserGuideArc,
  _showNewUserGuideForQuickStart: GameBootstrapNewUserGuideMethods._showNewUserGuideForQuickStart,
  _showNewUserGuideForStartGame: GameBootstrapNewUserGuideMethods._showNewUserGuideForStartGame,
  _showNewUserGuideForGameplay: GameBootstrapNewUserGuideMethods._showNewUserGuideForGameplay,
  _ensureSkillPowerupPropTipsView: GameBootstrapNewUserGuideMethods._ensureSkillPowerupPropTipsView,
  _showSkillPowerupPropTipsView: GameBootstrapNewUserGuideMethods._showSkillPowerupPropTipsView,
  _showPropTipsView: GameBootstrapNewUserGuideMethods._showPropTipsView,
  _hidePropTipsView: GameBootstrapNewUserGuideMethods._hidePropTipsView,
  _hideSkillPowerupPropTipsView: GameBootstrapNewUserGuideMethods._hideSkillPowerupPropTipsView,
  _showSkillPowerupUseGuide: GameBootstrapNewUserGuideMethods._showSkillPowerupUseGuide,
  _syncSkillPowerupGuideForRuntimeSnapshot: GameBootstrapNewUserGuideMethods._syncSkillPowerupGuideForRuntimeSnapshot,
  _advanceSkillPowerupGuideAfterSkillSelected: GameBootstrapNewUserGuideMethods._advanceSkillPowerupGuideAfterSkillSelected,
  _advanceSkillPowerupGuideAfterRainbowColorSelected: GameBootstrapNewUserGuideMethods._advanceSkillPowerupGuideAfterRainbowColorSelected,
  _completeActiveSkillPowerupFireGuide: GameBootstrapNewUserGuideMethods._completeActiveSkillPowerupFireGuide,
  _advanceNewUserGuideToStartGame: GameBootstrapNewUserGuideMethods._advanceNewUserGuideToStartGame,
  _rewindNewUserGuideToQuickStart: GameBootstrapNewUserGuideMethods._rewindNewUserGuideToQuickStart,
  _advanceNewUserGuideToGameplay: GameBootstrapNewUserGuideMethods._advanceNewUserGuideToGameplay,
  _completeNewUserGuide: GameBootstrapNewUserGuideMethods._completeNewUserGuide,
  _completeSkillPowerupUseGuide: GameBootstrapNewUserGuideMethods._completeSkillPowerupUseGuide,
  _ensureSpecialIntroduceViewPrefab: GameBootstrapSpecialIntroduceFlowMethods._ensureSpecialIntroduceViewPrefab,
  _ensureGeniusTipsViewPrefab: GameBootstrapSpecialIntroduceFlowMethods._ensureGeniusTipsViewPrefab,
  _ensureSartTipsViewPrefab: GameBootstrapSpecialIntroduceFlowMethods._ensureSartTipsViewPrefab,
  _syncSpecialIntroduceForRuntimeSnapshot: GameBootstrapSpecialIntroduceFlowMethods._syncSpecialIntroduceForRuntimeSnapshot,
  _syncGeniusTipsForRuntimeSnapshot: GameBootstrapSpecialIntroduceFlowMethods._syncGeniusTipsForRuntimeSnapshot,
  _syncSartTipsForRuntimeSnapshot: GameBootstrapSpecialIntroduceFlowMethods._syncSartTipsForRuntimeSnapshot,
  _showNextSpecialIntroduceView: GameBootstrapSpecialIntroduceFlowMethods._showNextSpecialIntroduceView,
  _showSpecialIntroduceView: GameBootstrapSpecialIntroduceFlowMethods._showSpecialIntroduceView,
  _showSnowRuleTipsView: GameBootstrapSpecialIntroduceFlowMethods._showSnowRuleTipsView,
  _showGeniusTipsView: GameBootstrapSpecialIntroduceFlowMethods._showGeniusTipsView,
  _showSartTipsView: GameBootstrapSpecialIntroduceFlowMethods._showSartTipsView,
  _closeSpecialIntroduceView: GameBootstrapSpecialIntroduceFlowMethods._closeSpecialIntroduceView,
  _closeGeniusTipsView: GameBootstrapSpecialIntroduceFlowMethods._closeGeniusTipsView,
  _closeSartTipsView: GameBootstrapSpecialIntroduceFlowMethods._closeSartTipsView,
  _hideSpecialIntroduceView: GameBootstrapSpecialIntroduceFlowMethods._hideSpecialIntroduceView,
  _hideGeniusTipsView: GameBootstrapSpecialIntroduceFlowMethods._hideGeniusTipsView,
  _hideSartTipsView: GameBootstrapSpecialIntroduceFlowMethods._hideSartTipsView,
  _syncEquippedAssistSpiritToGameManager: GameBootstrapAssistSpiritSkillMethods._syncEquippedAssistSpiritToGameManager,
  _onUseAssistSpiritSkillTap: GameBootstrapAssistSpiritSkillMethods._onUseAssistSpiritSkillTap,
  _onUseSkillBallTap: lazyPowerupInventoryMethods._onUseSkillBallTap,
  _onUseThreeLineEliminationTap: lazyPowerupInventoryMethods._onUseThreeLineEliminationTap,
  _applyPlusThreeBallsUseResult: lazyPowerupInventoryMethods._applyPlusThreeBallsUseResult,
  _autoUsePlusThreeBallsAfterAdGrant: lazyPowerupInventoryMethods._autoUsePlusThreeBallsAfterAdGrant,
  _applyPreciseAimUseResult: lazyPowerupInventoryMethods._applyPreciseAimUseResult,
  _autoUsePreciseAimAfterInventoryGrant: lazyPowerupInventoryMethods._autoUsePreciseAimAfterInventoryGrant,
  _onAddBallTipsCloseTap: lazyPowerupInventoryMethods._onAddBallTipsCloseTap,
  _onAddBallTipsWatchAdTap: lazyPowerupInventoryMethods._onAddBallTipsWatchAdTap,
  _onAddBallTipsCoinBuyTap: lazyPowerupInventoryMethods._onAddBallTipsCoinBuyTap,
  _onUsePlusThreeBallsTap: lazyPowerupInventoryMethods._onUsePlusThreeBallsTap,
  _onUseSnowRemovalTap: lazyPowerupInventoryMethods._onUseSnowRemovalTap,
  _onUsePreciseAimTap: lazyPowerupInventoryMethods._onUsePreciseAimTap,
  _onUseSwapBallTap: lazyPowerupInventoryMethods._onUseSwapBallTap,
  _onSelectRainbowColorTap: lazyPowerupInventoryMethods._onSelectRainbowColorTap,
  _onUseBarrierHammerTap: lazyPowerupInventoryMethods._onUseBarrierHammerTap,
  _handleBarrierHammerTargetTouch: lazyPowerupInventoryMethods._handleBarrierHammerTargetTouch,
  _isBarrierHammerTargeting: lazyPowerupInventoryMethods._isBarrierHammerTargeting,
  _setStatusWithTip: lazyPowerupInventoryMethods._setStatusWithTip,
  _refreshPlayerInventory: lazyPowerupInventoryMethods._refreshPlayerInventory,
  _addInventoryItem: lazyPowerupInventoryMethods._addInventoryItem,
  _syncCollectedSkillPowerupsToInventory: lazyPowerupInventoryMethods._syncCollectedSkillPowerupsToInventory,
  _refreshSelectedPowerups: lazyPowerupInventoryMethods._refreshSelectedPowerups,
  _saveSelectedPowerups: lazyPowerupInventoryMethods._saveSelectedPowerups,
  _getSelectedPowerupTotalCount: lazyPowerupInventoryMethods._getSelectedPowerupTotalCount,
  _normalizeSelectedPowerupCountsByTotalLimit: lazyPowerupInventoryMethods._normalizeSelectedPowerupCountsByTotalLimit,
  _getAvailableSelectedPowerupItems: lazyPowerupInventoryMethods._getAvailableSelectedPowerupItems,
  _getSelectedPowerupLoadouts: lazyPowerupInventoryMethods._getSelectedPowerupLoadouts,
  _applySelectedPowerupsToRuntime: lazyPowerupInventoryMethods._applySelectedPowerupsToRuntime,
  _applyPendingStartGamePreciseAimActivation: lazyPowerupInventoryMethods._applyPendingStartGamePreciseAimActivation,
  _applyGameplayInventoryQuickBuy: lazyPowerupInventoryMethods._applyGameplayInventoryQuickBuy,
  _consumePersistentInventoryItemForPowerup: lazyPowerupInventoryMethods._consumePersistentInventoryItemForPowerup,
  _ensureInventoryViewPrefab: lazyPowerupInventoryMethods._ensureInventoryViewPrefab,
  _ensureStartGameViewPrefab: lazyPowerupInventoryMethods._ensureStartGameViewPrefab,
  _showStartGameView: lazyPowerupInventoryMethods._showStartGameView,
  _renderStartGameView: lazyPowerupInventoryMethods._renderStartGameView,
  _resolveStartGameNativeTemplateAdUnitId: lazyPowerupInventoryMethods._resolveStartGameNativeTemplateAdUnitId,
  _resolveStartGameNativeTemplateAdStyle: lazyPowerupInventoryMethods._resolveStartGameNativeTemplateAdStyle,
  _applyStartGameNativeTemplateAdHeight: lazyPowerupInventoryMethods._applyStartGameNativeTemplateAdHeight,
  _showStartGameNativeTemplateAd: lazyPowerupInventoryMethods._showStartGameNativeTemplateAd,
  _invokeStartGameNativeTemplateAd: lazyPowerupInventoryMethods._invokeStartGameNativeTemplateAd,
  _hideStartGameNativeTemplateAd: lazyPowerupInventoryMethods._hideStartGameNativeTemplateAd,
  _refreshStartGameNativeTemplateAdLayout: lazyPowerupInventoryMethods._refreshStartGameNativeTemplateAdLayout,
  _purchaseStartGamePowerup: lazyPowerupInventoryMethods._purchaseStartGamePowerup,
  _purchaseStartGameTemporaryPowerup: lazyPowerupInventoryMethods._purchaseStartGameTemporaryPowerup,
  _refundPendingStartGameTemporaryPowerups: lazyPowerupInventoryMethods._refundPendingStartGameTemporaryPowerups,
  _hideStartGameView: lazyPowerupInventoryMethods._hideStartGameView,
  _ensureStartGamePropDescriptionViewPrefab: lazyPowerupInventoryMethods._ensureStartGamePropDescriptionViewPrefab,
  _ensureStartGamePropDescriptionSpriteFrames: lazyPowerupInventoryMethods._ensureStartGamePropDescriptionSpriteFrames,
  _showStartGamePropDescriptionView: lazyPowerupInventoryMethods._showStartGamePropDescriptionView,
  _hideStartGamePropDescriptionView: lazyPowerupInventoryMethods._hideStartGamePropDescriptionView,
  _closeStartGamePropDescriptionView: lazyPowerupInventoryMethods._closeStartGamePropDescriptionView,
  _loadPreparedLevelFromLevelSelect: lazyPowerupInventoryMethods._loadPreparedLevelFromLevelSelect,
  _startPreparedLevelEntry: lazyPowerupInventoryMethods._startPreparedLevelEntry,
  _ensurePowerTipsViewPrefab: lazyPowerupInventoryMethods._ensurePowerTipsViewPrefab,
  _bindPowerTipsViewActions: lazyPowerupInventoryMethods._bindPowerTipsViewActions,
  _renderPowerTipsView: lazyPowerupInventoryMethods._renderPowerTipsView,
  _showPowerTipsView: lazyPowerupInventoryMethods._showPowerTipsView,
  _hidePowerTipsView: lazyPowerupInventoryMethods._hidePowerTipsView,
  _ensureStaminaFlySpriteFrame: lazyPowerupInventoryMethods._ensureStaminaFlySpriteFrame,
  _playStaminaFlyToTop: lazyPowerupInventoryMethods._playStaminaFlyToTop,
  _delayAfterStaminaFly: lazyPowerupInventoryMethods._delayAfterStaminaFly,
  _onPowerTipsAdTap: lazyPowerupInventoryMethods._onPowerTipsAdTap,
  _setPendingLevelEntry: lazyPowerupInventoryMethods._setPendingLevelEntry,
  _clearPendingLevelEntry: lazyPowerupInventoryMethods._clearPendingLevelEntry,
  _isInventorySelectionOperable: lazyPowerupInventoryMethods._isInventorySelectionOperable,
  _hasAvailableInventoryForLevelEntry: lazyPowerupInventoryMethods._hasAvailableInventoryForLevelEntry,
  _enterLevelFromLevelSelect: lazyPowerupInventoryMethods._enterLevelFromLevelSelect,
  _startPendingLevelEntry: lazyPowerupInventoryMethods._startPendingLevelEntry,
  _showInventoryView: lazyPowerupInventoryMethods._showInventoryView,
  _hideInventoryView: lazyPowerupInventoryMethods._hideInventoryView,
  _confirmInventorySelection: lazyPowerupInventoryMethods._confirmInventorySelection,
  _toggleInventorySelection: lazyPowerupInventoryMethods._toggleInventorySelection,
  _increaseInventorySelectionCount: lazyPowerupInventoryMethods._increaseInventorySelectionCount,
  _decreaseInventorySelectionCount: lazyPowerupInventoryMethods._decreaseInventorySelectionCount,
  _renderInventoryView: lazyPowerupInventoryMethods._renderInventoryView,
  _updateInventoryEntryState: lazyPowerupInventoryMethods._updateInventoryEntryState,
  _ensureSpiritHallViewPrefab: lazySpiritHallMethods._ensureSpiritHallViewPrefab,
  _ensureSpiritSystemTabBarPrefab: lazySpiritHallMethods._ensureSpiritSystemTabBarPrefab,
  _ensureSpiritHallSpriteFrames: lazySpiritHallMethods._ensureSpiritHallSpriteFrames,
  _refreshAssistSpiritState: lazySpiritHallMethods._refreshAssistSpiritState,
  _showSpiritHallView: lazySpiritHallMethods._showSpiritHallView,
  _hideSpiritHallView: lazySpiritHallMethods._hideSpiritHallView,
  _renderSpiritHallView: lazySpiritHallMethods._renderSpiritHallView,
  _upgradeSelectedSpirit: lazySpiritHallMethods._upgradeSelectedSpirit,
  _equipSelectedSpirit: lazySpiritHallMethods._equipSelectedSpirit,
  _ensureSpiritShopViewPrefab: lazySpiritShopMethods._ensureSpiritShopViewPrefab,
  _ensureSpiritShopSpriteFrames: lazySpiritShopMethods._ensureSpiritShopSpriteFrames,
  _showSpiritShopView: lazySpiritShopMethods._showSpiritShopView,
  _hideSpiritShopView: lazySpiritShopMethods._hideSpiritShopView,
  _renderSpiritShopView: lazySpiritShopMethods._renderSpiritShopView,
  _purchaseSpiritShopFragment: lazySpiritShopMethods._purchaseSpiritShopFragment,
  _purchaseSpiritShopProduct: lazySpiritShopMethods._purchaseSpiritShopProduct,
  _refreshSpiritShopOffers: lazySpiritShopMethods._refreshSpiritShopOffers,
  _trackTelemetry: lazyTelemetryMethods._trackTelemetry,
  _beginLevelAttemptTracking: lazyTelemetryMethods._beginLevelAttemptTracking,
  _trackRuntimeTelemetryEvent: lazyTelemetryMethods._trackRuntimeTelemetryEvent,
  _recordAttemptPowerupUsed: lazyTelemetryMethods._recordAttemptPowerupUsed,
  _recordCurrentAttemptQuit: lazyTelemetryMethods._recordCurrentAttemptQuit,
  _onRuntimeStateTransition: lazyTelemetryMethods._onRuntimeStateTransition,
  _buildAttemptRewardKey: lazyAdRewardMethods._buildAttemptRewardKey,
  _hasGrantedAttemptReward: lazyAdRewardMethods._hasGrantedAttemptReward,
  _markAttemptRewardGranted: lazyAdRewardMethods._markAttemptRewardGranted,
  _isLevelSelectGemRewardAvailable: lazyAdRewardMethods._isLevelSelectGemRewardAvailable,
  _hasRewardedVideoAdConfig: lazyAdRewardMethods._hasRewardedVideoAdConfig,
  _resolveRewardedVideoAdUnitId: lazyAdRewardMethods._resolveRewardedVideoAdUnitId,
  _requireRewardedVideoAdConfig: lazyAdRewardMethods._requireRewardedVideoAdConfig,
  _canShowRewardedVideoAd: lazyAdRewardMethods._canShowRewardedVideoAd,
  _resolveInterstitialAdUnitId: lazyAdRewardMethods._resolveInterstitialAdUnitId,
  _requireInterstitialAdConfig: lazyAdRewardMethods._requireInterstitialAdConfig,
  _canShowInterstitialAd: lazyAdRewardMethods._canShowInterstitialAd,
  _showInterstitialAd: lazyAdRewardMethods._showInterstitialAd,
  _handleInterstitialAdRuntimeStateTransition: lazyAdRewardMethods._handleInterstitialAdRuntimeStateTransition,
  _resolveResultNativeTemplateAdUnitId: lazyAdRewardMethods._resolveResultNativeTemplateAdUnitId,
  _resolveResultNativeTemplateAdStyle: lazyAdRewardMethods._resolveResultNativeTemplateAdStyle,
  _applyResultNativeTemplateAdHeight: lazyAdRewardMethods._applyResultNativeTemplateAdHeight,
  _showResultNativeTemplateAd: lazyAdRewardMethods._showResultNativeTemplateAd,
  _hideResultNativeTemplateAd: lazyAdRewardMethods._hideResultNativeTemplateAd,
  _refreshResultNativeTemplateAdLayout: lazyAdRewardMethods._refreshResultNativeTemplateAdLayout,
  _showWinNativeTemplateAd: lazyAdRewardMethods._showWinNativeTemplateAd,
  _hideWinNativeTemplateAd: lazyAdRewardMethods._hideWinNativeTemplateAd,
  _showLoseNativeTemplateAd: lazyAdRewardMethods._showLoseNativeTemplateAd,
  _hideLoseNativeTemplateAd: lazyAdRewardMethods._hideLoseNativeTemplateAd,
  _bindReturnToForegroundInterstitialAd: lazyAdRewardMethods._bindReturnToForegroundInterstitialAd,
  _unbindReturnToForegroundInterstitialAd: lazyAdRewardMethods._unbindReturnToForegroundInterstitialAd,
  _setRewardedVideoAdUnavailableStatus: lazyAdRewardMethods._setRewardedVideoAdUnavailableStatus,
  _setRewardedAdFailureStatus: lazyAdRewardMethods._setRewardedAdFailureStatus,
  _setAdQuotaBlockedStatus: lazyAdRewardMethods._setAdQuotaBlockedStatus,
  _buildRewardedAdSceneId: lazyAdRewardMethods._buildRewardedAdSceneId,
  _resolveStaminaRecoveryGrantAmount: lazyAdRewardMethods._resolveStaminaRecoveryGrantAmount,
  _onLoseWatchAdTap: lazyAdRewardMethods._onLoseWatchAdTap,
  _onLoseCoinReviveTap: lazyAdRewardMethods._onLoseCoinReviveTap,
  _onLevelSelectGemRewardAdTap: lazyAdRewardMethods._onLevelSelectGemRewardAdTap,
  _showRewardedAdForEntry: lazyAdRewardMethods._showRewardedAdForEntry,
  _grantAdEntryReward: lazyAdRewardMethods._grantAdEntryReward,
  _queueNextRoundReward: lazyAdRewardMethods._queueNextRoundReward,
  _applyPendingNextRoundRewards: lazyAdRewardMethods._applyPendingNextRoundRewards,
  _tryRecoverInventoryByAd: lazyAdRewardMethods._tryRecoverInventoryByAd,
  _showGameplayInventoryQuickBuyForPowerup: lazyAdRewardMethods._showGameplayInventoryQuickBuyForPowerup,
  _tryRecoverAdRunPowerupByAd: lazyAdRewardMethods._tryRecoverAdRunPowerupByAd,
  _tryUnlockAssistSpiritSkillChargeByAd: lazyAdRewardMethods._tryUnlockAssistSpiritSkillChargeByAd,
  _tryRecoverStaminaByAd: lazyAdRewardMethods._tryRecoverStaminaByAd,
  _loadInitialLevel: GameBootstrapLevelRuntimeMethods._loadInitialLevel,
  _getStartupLevelId: GameBootstrapLevelRuntimeMethods._getStartupLevelId,
  _restartCurrentLevel: GameBootstrapLevelRuntimeMethods._restartCurrentLevel,
  _openPauseView: GameBootstrapLevelRuntimeMethods._openPauseView,
  _continuePausedLevel: GameBootstrapLevelRuntimeMethods._continuePausedLevel,
  _openPropDescriptionView: GameBootstrapLevelRuntimeMethods._openPropDescriptionView,
  _closePropDescriptionView: GameBootstrapLevelRuntimeMethods._closePropDescriptionView,
  _retryPausedLevel: GameBootstrapLevelRuntimeMethods._retryPausedLevel,
  _exitPausedLevel: GameBootstrapLevelRuntimeMethods._exitPausedLevel,
  _requirePausedGameplay: GameBootstrapLevelRuntimeMethods._requirePausedGameplay,
  _isTerminalState: GameBootstrapLevelRuntimeMethods._isTerminalState,
  _createStatusOverlay: GameBootstrapUiFlowMethods._createStatusOverlay,
  _syncDebugOverlayVisibility: GameBootstrapUiFlowMethods._syncDebugOverlayVisibility,
  _formatLevelSelectDebugStatus: GameBootstrapUiFlowMethods._formatLevelSelectDebugStatus,
  _showNetworkLoading: GameBootstrapUiFlowMethods._showNetworkLoading,
  _hideNetworkLoading: GameBootstrapUiFlowMethods._hideNetworkLoading,
  _runWithNetworkLoading: GameBootstrapUiFlowMethods._runWithNetworkLoading,
  _runLevelEntryWithLoading: GameBootstrapUiFlowMethods._runLevelEntryWithLoading,
  _isNetworkLoadingTimeoutError: GameBootstrapUiFlowMethods._isNetworkLoadingTimeoutError,
  _initializeWechatShare: GameBootstrapUiFlowMethods._initializeWechatShare,
  _shareGame: GameBootstrapUiFlowMethods._shareGame,
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
  _resolveLevelSelectNativeTemplateAdUnitId: GameBootstrapUiFlowMethods._resolveLevelSelectNativeTemplateAdUnitId,
  _resolveLevelSelectNativeTemplateAdStyle: GameBootstrapUiFlowMethods._resolveLevelSelectNativeTemplateAdStyle,
  _applyLevelSelectNativeTemplateAdHeight: GameBootstrapUiFlowMethods._applyLevelSelectNativeTemplateAdHeight,
  _showLevelSelectNativeTemplateAd: GameBootstrapUiFlowMethods._showLevelSelectNativeTemplateAd,
  _hideLevelSelectNativeTemplateAd: GameBootstrapUiFlowMethods._hideLevelSelectNativeTemplateAd,
  _refreshLevelSelectNativeTemplateAdLayout: GameBootstrapUiFlowMethods._refreshLevelSelectNativeTemplateAdLayout,
  _refreshPlayerResources: GameBootstrapUiFlowMethods._refreshPlayerResources,
  _refreshStaminaRecoveryState: GameBootstrapUiFlowMethods._refreshStaminaRecoveryState,
  _ensureStaminaRecoveryStateInMemory: GameBootstrapUiFlowMethods._ensureStaminaRecoveryStateInMemory,
  _saveStaminaRecoveryState: GameBootstrapUiFlowMethods._saveStaminaRecoveryState,
  _markStaminaRecoveryBaseline: GameBootstrapUiFlowMethods._markStaminaRecoveryBaseline,
  _applyNaturalStaminaRecovery: GameBootstrapUiFlowMethods._applyNaturalStaminaRecovery,
  _getStaminaRecoveryCountdownText: GameBootstrapUiFlowMethods._getStaminaRecoveryCountdownText,
  _ensureStaminaRecoveryTicker: GameBootstrapUiFlowMethods._ensureStaminaRecoveryTicker,
  _clearStaminaRecoveryTicker: GameBootstrapUiFlowMethods._clearStaminaRecoveryTicker,
  _getCurrentStamina: GameBootstrapUiFlowMethods._getCurrentStamina,
  _getCurrentCoins: GameBootstrapUiFlowMethods._getCurrentCoins,
  _getCurrentGems: GameBootstrapUiFlowMethods._getCurrentGems,
  _refreshNewGiftState: GameBootstrapUiFlowMethods._refreshNewGiftState,
  _isNewGiftClaimed: GameBootstrapUiFlowMethods._isNewGiftClaimed,
  _updateNewGiftEntryState: GameBootstrapUiFlowMethods._updateNewGiftEntryState,
  _playNewGiftEntryAnimation: GameBootstrapUiFlowMethods._playNewGiftEntryAnimation,
  _stopNewGiftEntryAnimation: GameBootstrapUiFlowMethods._stopNewGiftEntryAnimation,
  _grantNewGiftRewards: GameBootstrapUiFlowMethods._grantNewGiftRewards,
  _claimNewGift: GameBootstrapUiFlowMethods._claimNewGift,
  _spendCoinsForShop: GameBootstrapUiFlowMethods._spendCoinsForShop,
  _spendCoinsForStartGamePowerup: GameBootstrapUiFlowMethods._spendCoinsForStartGamePowerup,
  _spendCoinsForRevive: GameBootstrapUiFlowMethods._spendCoinsForRevive,
  _spendCoinsForAddBallTips: GameBootstrapUiFlowMethods._spendCoinsForAddBallTips,
  _refundCoinsForRevive: GameBootstrapUiFlowMethods._refundCoinsForRevive,
  _refundCoinsForAddBallTips: GameBootstrapUiFlowMethods._refundCoinsForAddBallTips,
  _refundCoinsForStartGamePowerup: GameBootstrapUiFlowMethods._refundCoinsForStartGamePowerup,
  _refundCoinsForShop: GameBootstrapUiFlowMethods._refundCoinsForShop,
  _addStaminaForShop: GameBootstrapUiFlowMethods._addStaminaForShop,
  _consumeStaminaForLevelEntry: GameBootstrapUiFlowMethods._consumeStaminaForLevelEntry,
  _grantFirstAttemptClearStaminaReward: GameBootstrapUiFlowMethods._grantFirstAttemptClearStaminaReward,
  _getLevelSelectTopLayerNode: GameBootstrapUiFlowMethods._getLevelSelectTopLayerNode,
  _updateLevelSelectTopStatus: GameBootstrapUiFlowMethods._updateLevelSelectTopStatus,
  _updateLevelSelectStaminaRecoveryStatus: GameBootstrapUiFlowMethods._updateLevelSelectStaminaRecoveryStatus,
  _getDailySignInConfig: GameBootstrapUiFlowMethods._getDailySignInConfig,
  _refreshSignInState: GameBootstrapUiFlowMethods._refreshSignInState,
  _markSignInPopupShown: GameBootstrapUiFlowMethods._markSignInPopupShown,
  _canClaimSignInToday: GameBootstrapUiFlowMethods._canClaimSignInToday,
  _ensureSignInEntryRedDot: GameBootstrapUiFlowMethods._ensureSignInEntryRedDot,
  _updateSignInEntryState: GameBootstrapUiFlowMethods._updateSignInEntryState,
  _ensureSignInViewPrefab: GameBootstrapUiFlowMethods._ensureSignInViewPrefab,
  _ensureSignInButtonSpriteFrames: GameBootstrapUiFlowMethods._ensureSignInButtonSpriteFrames,
  _ensureSignInDayBgSpriteFrames: GameBootstrapUiFlowMethods._ensureSignInDayBgSpriteFrames,
  _resolveSignInRewardByDay: GameBootstrapUiFlowMethods._resolveSignInRewardByDay,
  _resolveSignInDisplayRewardItem: GameBootstrapUiFlowMethods._resolveSignInDisplayRewardItem,
  _resolveSignInIconPath: GameBootstrapUiFlowMethods._resolveSignInIconPath,
  _ensureSignInIconSpriteFrame: GameBootstrapUiFlowMethods._ensureSignInIconSpriteFrame,
  _resolveSignInDayUiState: GameBootstrapUiFlowMethods._resolveSignInDayUiState,
  _isSignInAutoPopupEnabled: GameBootstrapUiFlowMethods._isSignInAutoPopupEnabled,
  _setSignInAutoPopupEnabled: GameBootstrapUiFlowMethods._setSignInAutoPopupEnabled,
  _renderSignInAutoPopupCheckbox: GameBootstrapUiFlowMethods._renderSignInAutoPopupCheckbox,
  _renderSignInGiftList: GameBootstrapUiFlowMethods._renderSignInGiftList,
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
  _refreshDailyTaskState: GameBootstrapUiFlowMethods._refreshDailyTaskState,
  _getDailyChallengeAttemptCount: GameBootstrapUiFlowMethods._getDailyChallengeAttemptCount,
  _recordDailyTaskEvent: GameBootstrapUiFlowMethods._recordDailyTaskEvent,
  _ensureDailyTaskEntryRedDot: GameBootstrapUiFlowMethods._ensureDailyTaskEntryRedDot,
  _updateDailyTaskEntryState: GameBootstrapUiFlowMethods._updateDailyTaskEntryState,
  _ensureDailyTaskViewPrefab: GameBootstrapUiFlowMethods._ensureDailyTaskViewPrefab,
  _showDailyTaskView: GameBootstrapUiFlowMethods._showDailyTaskView,
  _hideDailyTaskView: GameBootstrapUiFlowMethods._hideDailyTaskView,
  _renderDailyTaskView: GameBootstrapUiFlowMethods._renderDailyTaskView,
  _claimDailyTaskReward: GameBootstrapUiFlowMethods._claimDailyTaskReward,
  _handleDailyTaskGo: GameBootstrapUiFlowMethods._handleDailyTaskGo,
  _giftFriendStaminaBySelfManagedGift: GameBootstrapUiFlowMethods._giftFriendStaminaBySelfManagedGift,
  _claimPendingFriendStaminaGiftFromLaunchOptions: GameBootstrapUiFlowMethods._claimPendingFriendStaminaGiftFromLaunchOptions,
  _claimFriendStaminaGift: GameBootstrapUiFlowMethods._claimFriendStaminaGift,
  _grantClaimedFriendStaminaGift: GameBootstrapUiFlowMethods._grantClaimedFriendStaminaGift,
  _bindFriendGiftEnterClaim: GameBootstrapUiFlowMethods._bindFriendGiftEnterClaim,
  _unbindFriendGiftEnterClaim: GameBootstrapUiFlowMethods._unbindFriendGiftEnterClaim,
  _consumeStaminaForFriendGift: GameBootstrapUiFlowMethods._consumeStaminaForFriendGift,
  _refundStaminaForFriendGift: GameBootstrapUiFlowMethods._refundStaminaForFriendGift,
  _recordFriendStaminaGiftSuccess: GameBootstrapUiFlowMethods._recordFriendStaminaGiftSuccess,
  _onLevelSelectDailyTasksTap: GameBootstrapUiFlowMethods._onLevelSelectDailyTasksTap,
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
  _onGameplaySettingTap: GameBootstrapUiFlowMethods._onGameplaySettingTap,
  _ensureSettingViewPrefab: GameBootstrapUiFlowMethods._ensureSettingViewPrefab,
  _showSettingView: GameBootstrapUiFlowMethods._showSettingView,
  _hideSettingView: GameBootstrapUiFlowMethods._hideSettingView,
  _bindSettingViewActions: GameBootstrapUiFlowMethods._bindSettingViewActions,
  _restoreDefaultAudioSettings: GameBootstrapUiFlowMethods._restoreDefaultAudioSettings,
  _syncSettingViewFromAudioSettings: GameBootstrapUiFlowMethods._syncSettingViewFromAudioSettings,
  _adjustSettingVolumeByStep: GameBootstrapUiFlowMethods._adjustSettingVolumeByStep,
  _setSettingVolumeToZero: GameBootstrapUiFlowMethods._setSettingVolumeToZero,
  _toggleSettingChannelVolume: GameBootstrapUiFlowMethods._toggleSettingChannelVolume,
  _normalizeSettingVolume: GameBootstrapUiFlowMethods._normalizeSettingVolume,
  _ensureSettingVolumeIconSprites: GameBootstrapUiFlowMethods._ensureSettingVolumeIconSprites,
  _updateSettingVolumeIconView: GameBootstrapUiFlowMethods._updateSettingVolumeIconView,
  _updateSettingToggleStatusView: GameBootstrapUiFlowMethods._updateSettingToggleStatusView,
  _bindToggleChangeOnce: GameBootstrapUiFlowMethods._bindToggleChangeOnce,
  _bindSettingVolumeDragOnce: GameBootstrapUiFlowMethods._bindSettingVolumeDragOnce,
  _applySettingVolumeFromTouch: GameBootstrapUiFlowMethods._applySettingVolumeFromTouch,
  _restoreSettingVolumeSliderSprites: GameBootstrapUiFlowMethods._restoreSettingVolumeSliderSprites,
  _syncSettingVolumeStarPosition: GameBootstrapUiFlowMethods._syncSettingVolumeStarPosition,
  _resolveSettingControlNodes: GameBootstrapUiFlowMethods._resolveSettingControlNodes,
  _findNodeByNameRecursive: GameBootstrapUiFlowMethods._findNodeByNameRecursive,
  _bindNodeTapOnce: GameBootstrapUiFlowMethods._bindNodeTapOnce,
  _resolveFloatingMapFocusLevelId: GameBootstrapUiFlowMethods._resolveFloatingMapFocusLevelId,
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
  _onLevelSelectHiddenUnlockTap: GameBootstrapUiFlowMethods._onLevelSelectHiddenUnlockTap,
  _unlockAllLevelsForCurrentLevelSelectSession: GameBootstrapUiFlowMethods._unlockAllLevelsForCurrentLevelSelectSession,
  _grantHiddenUnlockAllLevelsStaminaReward: GameBootstrapUiFlowMethods._grantHiddenUnlockAllLevelsStaminaReward,
  _handleRuntimeStateTransition: GameBootstrapUiFlowMethods._handleRuntimeStateTransition,
  _applyCurrentLevelBestScoreFlag: GameBootstrapUiFlowMethods._applyCurrentLevelBestScoreFlag,
  _applyCurrentLevelClearRewardItems: GameBootstrapUiFlowMethods._applyCurrentLevelClearRewardItems,
  _grantCurrentLevelClearRewardItems: GameBootstrapUiFlowMethods._grantCurrentLevelClearRewardItems,
  _grantRandomChallengeRewardItems: GameBootstrapUiFlowMethods._grantRandomChallengeRewardItems,
  _recordCurrentLevelWin: GameBootstrapUiFlowMethods._recordCurrentLevelWin,
  _submitWorldLeaderboardProgressAfterLevelClear: GameBootstrapUiFlowMethods._submitWorldLeaderboardProgressAfterLevelClear,
  _recordRandomChallengeWin: GameBootstrapUiFlowMethods._recordRandomChallengeWin,
  _calculateStarRating: GameBootstrapUiFlowMethods._calculateStarRating,
  _getLevelStarCount: GameBootstrapUiFlowMethods._getLevelStarCount,
  _isLevelCompleted: GameBootstrapUiFlowMethods._isLevelCompleted,
  _resolveHighlightedLevelId: GameBootstrapUiFlowMethods._resolveHighlightedLevelId,
  _onLevelSelectTap: GameBootstrapUiFlowMethods._onLevelSelectTap,
  _startTestLevelEntry: GameBootstrapUiFlowMethods._startTestLevelEntry,
  _startTrappedSpriteTestLevelEntry: GameBootstrapUiFlowMethods._startTrappedSpriteTestLevelEntry,
  _onLevelSelectTrappedSpriteTestTap: GameBootstrapUiFlowMethods._onLevelSelectTrappedSpriteTestTap,
  _startBoardOcclusionTestLevelEntry: GameBootstrapUiFlowMethods._startBoardOcclusionTestLevelEntry,
  _onLevelSelectBoardOcclusionTestTap: GameBootstrapUiFlowMethods._onLevelSelectBoardOcclusionTestTap,
  _onLevelSelectTestTap: GameBootstrapUiFlowMethods._onLevelSelectTestTap,
  _openMapEditorScene: GameBootstrapUiFlowMethods._openMapEditorScene,
  _startLocalEditedLevelEntry: GameBootstrapUiFlowMethods._startLocalEditedLevelEntry,
  _onLevelSelectLocalEditedLevelTap: GameBootstrapUiFlowMethods._onLevelSelectLocalEditedLevelTap,
  _resolveHighestUnlockedLevelId: GameBootstrapUiFlowMethods._resolveHighestUnlockedLevelId,
  _resolveLatestAccessibleLevelId: GameBootstrapUiFlowMethods._resolveLatestAccessibleLevelId,
  _resolveCurrentMapLevelId: GameBootstrapUiFlowMethods._resolveCurrentMapLevelId,
  _onLevelSelectQuickStartTap: GameBootstrapUiFlowMethods._onLevelSelectQuickStartTap,
  _startRandomChallengeRun: GameBootstrapUiFlowMethods._startRandomChallengeRun,
  _onLevelSelectRandomChallengeTap: GameBootstrapUiFlowMethods._onLevelSelectRandomChallengeTap,
  _onLevelSelectBackToCurrentLevelTap: GameBootstrapUiFlowMethods._onLevelSelectBackToCurrentLevelTap
});

