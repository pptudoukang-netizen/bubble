"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");
var PoolManager = require("../utils/PoolManager");
var LevelProgressStore = require("../utils/LevelProgressStore");
var PlayerResourceStore = require("../utils/PlayerResourceStore");
var InventoryStore = require("../utils/InventoryStore");
var StarChestStore = require("../utils/StarChestStore");
var SelectedPowerupsStore = require("../utils/SelectedPowerupsStore");
var SignInStore = require("../utils/SignInStore");
var RouteConfigStore = require("../utils/RouteConfigStore");
var AudioManager = require("../audio/AudioManager");
var BoardLayout = require("../config/BoardLayout");
var DailySignInConfig = require("../config/DailySignInConfig");
var StarChestConfig = require("../config/StarChestConfig");
var LevelManager = require("../config/LevelManager");
var GameManager = require("../core/GameManager");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var RouteEditorState = require("./RouteEditorState");
var ResourceGateway = require("./ResourceGateway");
var LevelSelectView = require("./LevelSelectView");
var BootstrapButtonFactory = require("./BootstrapButtonFactory");
var GameBootstrapUiFlowMethods = require("./GameBootstrapUiFlowMethods");
var LevelRenderer = require("../render/LevelRenderer");
var LoadingViewController = require("../ui/LoadingViewController");
var TipsPresenter = require("../ui/TipsPresenter");
var InventoryViewController = require("../ui/InventoryViewController");
var StarChestRewardService = require("../services/StarChestRewardService");
var StarChestService = require("../services/StarChestService");
var AdService = require("../services/AdService");
var TelemetryService = require("../services/TelemetryService");
var AdRewardQuotaStore = require("../services/AdRewardQuotaStore");
var AdRewardCatalog = require("../services/AdRewardCatalog");

var BASELINE_HALF_WIDTH = 360;
var BASELINE_HALF_HEIGHT = 640;
var JAR_RAISE_FROM_BOTTOM = 70;
var SHOOTER_RAISE_FROM_BOTTOM = 100;
var BASELINE_SIDE_PADDING = BASELINE_HALF_WIDTH - Math.abs(BoardLayout.boardRight);
var BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM = ((BoardLayout.jarBaseY + BoardLayout.jarRenderYOffset) - (-BASELINE_HALF_HEIGHT)) + JAR_RAISE_FROM_BOTTOM;
var BASELINE_JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var BASELINE_SHOOTER_OFFSET_FROM_BOTTOM = (BoardLayout.shooterOrigin.y - (-BASELINE_HALF_HEIGHT)) + SHOOTER_RAISE_FROM_BOTTOM;
var BASELINE_DANGER_OFFSET_FROM_BOTTOM = 460;
var INVENTORY_VIEW_PREFAB_PATH = "prefabs/ui/InventoryView";
var POWERUP_TYPE_BY_ITEM_ID = {
  swap_ball: "swap",
  rainbow_ball: "rainbow",
  blast_ball: "blast",
  barrier_hammer: "barrier_hammer"
};
var ITEM_ID_BY_POWERUP_TYPE = {
  swap: "swap_ball",
  rainbow: "rainbow_ball",
  blast: "blast_ball",
  barrier_hammer: "barrier_hammer"
};
var MAX_SELECTED_POWERUPS = 2;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

cc.Class({
  extends: cc.Component,

  properties: {
    initialLevelId: {
      default: 1,
      tooltip: "关闭测试模式时，游戏启动加载的普通关卡 ID。"
    },
    enableSpecialEntitiesTestMode: {
      default: true,
      tooltip: "开启后将优先进入“技能球/障碍球测试关卡”。"
    },
    specialEntitiesTestLevelId: {
      default: 20,
      tooltip: "测试模式下的启动关卡 ID（建议为包含彩虹球/炸裂球/石头球的关卡）。"
    },
    showDebugOverlay: {
      default: true,
      tooltip: "是否显示轻量调试信息面板（启动状态/运行状态）。"
    },
    showGridTestLayer: {
      default: true,
      tooltip: "是否显示网格测试层（空槽位与编号），用于瞄准调试。"
    },
    showDropTestButton: {
      default: true,
      tooltip: "是否显示“底层掉落测试”按钮。"
    },
    enableLevelEditor: {
      default: true,
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
      tooltip: "微信激励视频广告位 ID（为空时，开发环境走本地模拟）。"
    },
    enableMockRewardedAdOnUnsupported: {
      default: true,
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

  onLoad: function () {
    this._applyViewportLayout();

    DebugFlags.setAll({
      logs: true,
      overlay: this.showDebugOverlay,
      testLayer: this.showGridTestLayer
    });

    this.currentLevelConfig = null;
    this.isRestarting = false;
    this.isSelectingLevel = false;
    this._levelSelectNode = null;
    this._levelSelectViewPrefab = null;
    this._levelMapPrefabs = null;
    this._levelSelectMapIndex = 0;
    this._availableLevelIdsPromise = null;
    this._availableLevelIdsScanPromise = null;
    this._dropTestButton = null;
    this._routeEditorButtons = {};
    this._loadingViewNode = null;
    this._loadingViewController = null;
    this._startupFlowPromise = null;
    this._startupResolvedLevelIds = null;
    this._startupPrefabWarmupPromise = null;
    this._lastStatusMessage = "";
    this._lastRuntimeState = null;
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this._currentLevelId = 0;
    this._levelSelectRouteEditorMode = false;
    this._pendingRouteEditorAutoEnable = false;
    this._levelConfigPreloadPromise = null;
    this._currentAttemptId = "";
    this._attemptSequence = 0;
    this._trackedResultAttemptId = "";
    this._grantedAttemptRewardKeys = {};
    this._pendingNextRoundRewards = [];
    this._adFlowInProgress = false;
    this._staminaRecoveryInProgress = false;
    this.telemetryService = new TelemetryService({
      logger: Logger
    });
    this.levelProgressStore = new LevelProgressStore();
    this.levelProgress = this.resetLevelProgressOnStart
      ? this.levelProgressStore.reset()
      : this.levelProgressStore.load();
    var inspectorStamina = Math.max(0, Math.floor(Number(this.inspectorStaminaValue) || 0));
    this.playerResourceStore = new PlayerResourceStore({
      dailyStamina: 10
    });
    this.playerResources = this.playerResourceStore.load();
    this.playerResources.stamina = inspectorStamina;
    this.playerResourceStore.save(this.playerResources);
    this.inventoryStore = new InventoryStore();
    this.playerInventory = this.inventoryStore.load();
    this.inventoryStore.save(this.playerInventory);
    this.starChestConfig = clone(StarChestConfig);
    this.starChestStore = new StarChestStore({
      activityId: this.starChestConfig.activityId
    });
    this.starChestRewardService = new StarChestRewardService({
      getResources: function () {
        return this._refreshPlayerResources();
      }.bind(this),
      saveResources: function (resources) {
        this.playerResources = resources;
        if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
          return false;
        }
        this.playerResourceStore.save(this.playerResources);
        return true;
      }.bind(this),
      addInventoryItem: function (itemId, count) {
        return this._addInventoryItem(itemId, count);
      }.bind(this)
    });
    this.starChestService = new StarChestService({
      config: this.starChestConfig,
      store: this.starChestStore,
      rewardService: this.starChestRewardService,
      telemetry: this.telemetryService
    });
    this.selectedPowerupsStore = new SelectedPowerupsStore();
    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    this.selectedPowerupsStore.save(this.selectedPowerupsState);
    this._inventoryViewPrefab = null;
    this._inventoryViewNode = null;
    this._inventoryViewController = null;
    this.dailySignInConfig = clone(DailySignInConfig);
    this.signInStore = new SignInStore({
      cycleLength: this.dailySignInConfig.cycleLength,
      autoPopupOnFirstLogin: this.dailySignInConfig.autoPopupOnFirstLogin
    });
    this.signInState = this.signInStore.load();
    this.signInStore.save(this.signInState);
    this.routeConfigStore = new RouteConfigStore();
    this.routeConfig = this.routeConfigStore.load();
    this.adRewardQuotaStore = new AdRewardQuotaStore({
      rules: {
        lose_next_round: {
          dailyLimit: Math.max(0, Math.floor(Number(this.loseAdDailyLimit) || 0)),
          cooldownSec: Math.max(0, Math.floor(Number(this.adRewardCooldownSeconds) || 0))
        },
        inventory_refill: {
          dailyLimit: Math.max(0, Math.floor(Number(this.inventoryAdDailyLimit) || 0)),
          cooldownSec: Math.max(0, Math.floor(Number(this.adRewardCooldownSeconds) || 0))
        },
        stamina_refill: {
          dailyLimit: Math.max(0, Math.floor(Number(this.staminaAdDailyLimit) || 0)),
          cooldownSec: Math.max(0, Math.floor(Number(this.adRewardCooldownSeconds) || 0))
        }
      }
    });
    this.adService = new AdService({
      adUnitId: this.rewardedVideoAdUnitId,
      logger: Logger,
      mockEnabled: this.enableMockRewardedAdOnUnsupported !== false
    });
    this._settingViewPrefab = null;
    this._settingViewNode = null;
    this._signInViewPrefab = null;
    this._signInViewNode = null;
    this._signInButtonSpriteFrames = null;
    this._signInButtonSpriteLoadPromise = null;
    this._signInIconSpriteFrameCache = {};
    this.leaderboardStore = null;
    this._rankingViewPrefab = null;
    this._rankingViewNode = null;
    this._rankingViewController = null;
    this.audioManager = new AudioManager({
      settingsDefaults: {
        musicEnabled: this.enableBackgroundMusic,
        sfxEnabled: this.enableSoundEffects,
        vibrationEnabled: this.enableVibration,
        musicVolume: this.backgroundMusicVolume,
        sfxVolume: this.soundEffectsVolume
      }
    });
    this.audioManager.configure(this._buildAudioConfig());
    this._routeEditorState = this._createEmptyRouteEditorState();
    this.resourceGateway = this.resourceGateway || new ResourceGateway();
    this.tipsPresenter = new TipsPresenter({
      rootNode: this.node,
      resourceGateway: this.resourceGateway,
      zIndex: 600
    });
    this.tipsPresenter.warmup().catch(function (error) {
      Logger.warn("TipsPresenter warmup failed", error && error.message ? error.message : error);
    });

    this._createStatusOverlay();
    this._createDropTestButton();
    this._createRouteEditorButtons();
    this._setStatus("Bootstrapping core modules...");

    this.poolManager = new PoolManager();
    this.levelManager = new LevelManager();
    this.gameManager = new GameManager({
      poolManager: this.poolManager,
      levelManager: this.levelManager
    });
    this.levelRenderer = new LevelRenderer(this.node);
    this.levelRenderer.warmupSharedAssets().catch(function (error) {
      Logger.warn("Shared renderer warmup failed", error && error.message ? error.message : error);
    });
    this.levelRenderer.setWinActionHandlers({
      onNextLevel: this._onNextLevelTap.bind(this),
      onRetryLevel: this._restartCurrentLevel.bind(this)
    });
    this.levelRenderer.setLoseActionHandlers({
      onRetryLevel: this._restartCurrentLevel.bind(this),
      onBackLevel: this._onBackToLevelTap.bind(this),
      onWatchAd: this._onLoseWatchAdTap.bind(this)
    });
    this.levelRenderer.setGameplayActionHandlers({
      onBackToLevel: this._onBackToLevelTap.bind(this),
      onUseRainbow: function () {
        this._onUseSkillBallTap("rainbow");
      }.bind(this),
      onUseBlast: function () {
        this._onUseSkillBallTap("blast");
      }.bind(this),
      onUseSwap: function () {
        this._onUseSwapBallTap();
      }.bind(this),
      onUseBarrierHammer: function () {
        this._onUseBarrierHammerTap();
      }.bind(this)
    });

    this.gameManager.bootstrap();
    this._bindInput();

    window.__bubbleDebug = {
      bootstrap: this,
      poolManager: this.poolManager,
      levelManager: this.levelManager,
      gameManager: this.gameManager,
      levelRenderer: this.levelRenderer,
      audioManager: this.audioManager,
      routeConfigStore: this.routeConfigStore,
      routeEditor: {
        getState: function () {
          return clone(this._routeEditorState);
        }.bind(this),
        save: this._onRouteEditorSaveTap.bind(this),
        toggle: this._onRouteEditorToggleTap.bind(this)
      }
    };
  },

  _applyViewportLayout: function () {
    BoardLayout.projectileSpeed = Math.max(120, Number(this.projectileSpeed) || 960);
    BoardLayout.impactBounceSpeed = Math.max(80, Number(this.impactBounceSpeed) || 220);
    BoardLayout.jarRimBounceSpeed = Math.max(120, Number(this.jarRimBounceSpeed) || 260);
    BoardLayout.showGhostBubble = this.showGhostBubble !== false;
    BoardLayout.guideFrontClipRadiusScale = Math.max(0, Math.min(3, Number(this.guideFrontClipRadiusScale) || 1));
    BoardLayout.guideDotPulseSpeedScale = Math.max(0.1, Math.min(5, Number(this.guideDotPulseSpeedScale) || 1));

    var canvas = this.node ? this.node.getComponent(cc.Canvas) : null;
    var designSize = canvas && canvas._designResolution
      ? canvas._designResolution
      : cc.size(720, 1280);
    var designWidth = Math.max(1, Number(designSize.width) || 720);
    var designHeight = Math.max(1, Number(designSize.height) || 1280);

    var frameSize = cc.view && cc.view.getFrameSize ? cc.view.getFrameSize() : cc.size(designWidth, designHeight);
    var frameWidth = Math.max(1, Number(frameSize.width) || designWidth);
    var frameHeight = Math.max(1, Number(frameSize.height) || designHeight);
    var frameAspect = frameWidth / frameHeight;
    var designAspect = designWidth / designHeight;

    var width = designWidth;
    var height = designHeight;
    if (frameAspect <= designAspect) {
      // 长屏：固定宽度，扩展可视高度，避免上下黑边。
      if (canvas) {
        canvas.fitWidth = true;
        canvas.fitHeight = false;
      }
      height = designWidth / frameAspect;
    } else {
      // 宽屏：固定高度，扩展可视宽度，避免左右黑边。
      if (canvas) {
        canvas.fitWidth = false;
        canvas.fitHeight = true;
      }
      width = designHeight * frameAspect;
    }

    if (this.node && this.node.setContentSize) {
      this.node.setContentSize(width, height);
    }

    var halfWidth = width * 0.5;
    var halfHeight = height * 0.5;
    var boardHalfWidth = Math.max(
      BoardLayout.bubbleDiameter * 4.5,
      halfWidth - BASELINE_SIDE_PADDING
    );

    BoardLayout.boardLeft = -boardHalfWidth;
    BoardLayout.boardRight = boardHalfWidth;
    BoardLayout.jarLayoutWidth = width;
    var safeAreaInsets = this._resolveSafeAreaInsetsInDesignSpace(width, height, frameWidth, frameHeight);
    // 顶部玻璃球首行：屏幕顶部往下 (130 + 球半径)。
    BoardLayout.boardStartY = halfHeight - (130 + BoardLayout.bubbleRadius + safeAreaInsets.top);

    var bottomY = -halfHeight;
    // 底部元素按“离屏幕底部固定高度”适配。
    BoardLayout.jarBaseY = bottomY + BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM - BASELINE_JAR_RENDER_Y_OFFSET;
    BoardLayout.shooterOrigin = {
      x: 0,
      y: bottomY + BASELINE_SHOOTER_OFFSET_FROM_BOTTOM
    };
    BoardLayout.dangerLineY = bottomY + BASELINE_DANGER_OFFSET_FROM_BOTTOM;
  },

  _resolveSafeAreaInsetsInDesignSpace: function (designWidth, designHeight, frameWidth, frameHeight) {
    var insets = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    };

    var safeRect = this._getSafeAreaRectFromRuntime();
    if (!safeRect) {
      return insets;
    }

    var safeTop = Number(safeRect.top);
    var safeBottom = Number(safeRect.bottom);
    var safeLeft = Number(safeRect.left);
    var safeRight = Number(safeRect.right);
    if (!isFinite(safeTop) || !isFinite(safeBottom) || !isFinite(safeLeft) || !isFinite(safeRight)) {
      return insets;
    }

    var sourceWidth = Math.max(1, Number(safeRect.screenWidth) || frameWidth || 1);
    var sourceHeight = Math.max(1, Number(safeRect.screenHeight) || frameHeight || 1);
    var topInsetPx = Math.max(0, safeTop);
    var leftInsetPx = Math.max(0, safeLeft);
    var rightInsetPx = Math.max(0, sourceWidth - safeRight);
    var bottomInsetPx = Math.max(0, sourceHeight - safeBottom);

    var widthScale = Math.max(0.0001, designWidth / sourceWidth);
    var heightScale = Math.max(0.0001, designHeight / sourceHeight);

    insets.top = topInsetPx * heightScale;
    insets.bottom = bottomInsetPx * heightScale;
    insets.left = leftInsetPx * widthScale;
    insets.right = rightInsetPx * widthScale;
    return insets;
  },

  _getSafeAreaRectFromRuntime: function () {
    if (typeof wx !== "undefined" && wx && typeof wx.getSystemInfoSync === "function") {
      try {
        var systemInfo = wx.getSystemInfoSync();
        if (systemInfo && systemInfo.safeArea) {
          return {
            left: Number(systemInfo.safeArea.left) || 0,
            right: Number(systemInfo.safeArea.right) || 0,
            top: Number(systemInfo.safeArea.top) || 0,
            bottom: Number(systemInfo.safeArea.bottom) || 0,
            screenWidth: Number(systemInfo.screenWidth) || 0,
            screenHeight: Number(systemInfo.screenHeight) || 0
          };
        }
      } catch (error) {
        // Fallback to engine-level API.
      }
    }

    if (cc && cc.sys && typeof cc.sys.getSafeAreaRect === "function") {
      try {
        var runtimeSafeRect = cc.sys.getSafeAreaRect();
        if (runtimeSafeRect) {
          var rectX = Number(runtimeSafeRect.x) || 0;
          var rectY = Number(runtimeSafeRect.y) || 0;
          var rectWidth = Number(runtimeSafeRect.width) || 0;
          var rectHeight = Number(runtimeSafeRect.height) || 0;
          if (rectWidth > 0 && rectHeight > 0) {
            return {
              left: rectX,
              right: rectX + rectWidth,
              bottom: rectY + rectHeight,
              top: rectY
            };
          }
        }
      } catch (error) {
        // Fallback to platform-specific APIs.
      }
    }

    return null;
  },

  start: function () {
    this._applyViewportLayout();
    this._runStartupLoadingFlow();
  },

  onEnable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      this._resizeCallback = this._handleViewResize.bind(this);
      cc.view.setResizeCallback(this._resizeCallback);
    }
  },

  onDisable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      cc.view.setResizeCallback(null);
    }
    this._resizeCallback = null;
  },

  onDestroy: function () {
    if (this.audioManager) {
      this.audioManager.stopBgm();
      this.audioManager.stopAllSfx();
    }
  },

  _handleViewResize: function () {
    this._applyViewportLayout();
    if (this._loadingViewController && this._loadingViewController.refreshLayout) {
      this._loadingViewController.refreshLayout();
    }

    if (this.levelRenderer && this.currentLevelConfig && !this.isRestarting && !this.isSelectingLevel) {
      var snapshot = this.gameManager.getRuntimeSnapshot();
      this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).catch(function (error) {
        Logger.warn("Resize rerender failed", error && error.message ? error.message : error);
      }).then(function () {
        this._renderRouteEditor();
      }.bind(this));
    }
  },

  _runStartupLoadingFlow: function () {
    if (this._startupFlowPromise) {
      return this._startupFlowPromise;
    }

    if (!this.enableStartupLoadingView) {
      this._showLevelSelectView();
      this._startupFlowPromise = Promise.resolve();
      return this._startupFlowPromise;
    }

    var flowStartedAt = Date.now();
    this._startupFlowPromise = this._ensureLoadingViewController().then(function (controller) {
      this._setStatus("Loading startup resources...");
      controller.setProgress(0, true);
      controller.setStage("启动准备中...");
      return controller.playIn();
    }.bind(this)).then(function () {
      return this._runWeightedStartupTasks();
    }.bind(this)).then(function () {
      var minVisibleMs = Math.max(0, Math.floor(Number(this.loadingViewMinVisibleMs) || 0));
      var elapsed = Date.now() - flowStartedAt;
      var waitMs = Math.max(0, minVisibleMs - elapsed);
      return this._delay(waitMs);
    }.bind(this)).then(function () {
      if (!this._loadingViewController) {
        return;
      }
      this._loadingViewController.setProgress(1, true);
      this._loadingViewController.setStage("准备进入关卡...");
      return this._loadingViewController.playOut();
    }.bind(this)).then(function () {
      this._showLevelSelectView();
    }.bind(this)).catch(function (error) {
      Logger.warn("Startup loading flow failed", error && error.message ? error.message : error);
      if (this._loadingViewController && this._loadingViewController.hideImmediate) {
        this._loadingViewController.hideImmediate();
      }
      this._showLevelSelectView();
    }.bind(this));

    return this._startupFlowPromise;
  },

  _ensureLoadingViewController: function () {
    if (this._loadingViewController && this._loadingViewController.node && cc.isValid(this._loadingViewController.node)) {
      this._syncLoadingViewConfig(this._loadingViewController);
      return Promise.resolve(this._loadingViewController);
    }

    var sceneLoadingNode = this._findSceneLoadingViewNode();
    if (!sceneLoadingNode) {
      Logger.warn("Scene LoadingView node missing. Use runtime fallback node.");
      sceneLoadingNode = this._createFallbackLoadingViewNode();
    }

    return Promise.resolve(sceneLoadingNode).then(function (loadingNode) {
      if (!loadingNode) {
        throw new Error("LoadingView node init failed");
      }

      this._loadingViewNode = loadingNode;
      if (typeof loadingNode.zIndex === "number") {
        loadingNode.zIndex = Math.max(loadingNode.zIndex, 500);
      }

      var controller = loadingNode.getComponent(LoadingViewController) || loadingNode.getComponent("LoadingViewController");
      if (!controller) {
        controller = loadingNode.addComponent(LoadingViewController);
      }

      this._loadingViewController = controller;
      this._syncLoadingViewConfig(controller);
      if (controller.refreshLayout) {
        controller.refreshLayout();
      }
      return controller;
    }.bind(this));
  },

  _syncLoadingViewConfig: function (controller) {
    if (!controller) {
      return;
    }

    if (controller.setAniMaxMoveSpeed) {
      controller.setAniMaxMoveSpeed(this.loadingAniMaxMoveSpeed);
    }
  },

  _findSceneLoadingViewNode: function () {
    if (!this.node || !cc.isValid(this.node)) {
      return null;
    }

    var direct = this.node.getChildByName("LoadingView");
    if (direct && cc.isValid(direct)) {
      return direct;
    }

    var queue = this.node.children ? this.node.children.slice() : [];
    while (queue.length > 0) {
      var current = queue.shift();
      if (!current || !cc.isValid(current)) {
        continue;
      }
      if (current.name === "LoadingView") {
        return current;
      }
      if (current.children && current.children.length > 0) {
        Array.prototype.push.apply(queue, current.children);
      }
    }

    return null;
  },

  _createFallbackLoadingViewNode: function () {
    if (this._loadingViewNode && cc.isValid(this._loadingViewNode)) {
      return this._loadingViewNode;
    }

    var node = new cc.Node("LoadingView");
    node.parent = this.node;
    node.zIndex = 500;
    node.setContentSize(this.node.getContentSize());
    this._loadingViewNode = node;
    return node;
  },

  _runWeightedStartupTasks: function () {
    var tasks = [
      {
        id: "resources_bundle",
        stage: "准备资源分包...",
        weight: 0.12,
        run: function () {
          return BundleLoader.ensureResourcesBundleLoaded();
        }
      },
      {
        id: "warmup_prefabs",
        stage: "加载基础界面...",
        weight: 0.4,
        run: function () {
          return this._preloadStartupPrefabs();
        }.bind(this)
      },
      {
        id: "level_index",
        stage: "加载关卡列表...",
        weight: 0.28,
        run: function () {
          return this._loadAvailableLevelIds().then(function (levelIds) {
            this._startupResolvedLevelIds = Array.isArray(levelIds) ? levelIds.slice() : [];
          }.bind(this));
        }.bind(this)
      },
      {
        id: "level_configs",
        stage: "初始化关卡配置...",
        weight: 0.22,
        run: function () {
          return this._preloadStartupLevelConfigs();
        }.bind(this)
      },
      {
        id: "renderer_warmup",
        stage: "初始化棋盘资源...",
        weight: 0.1,
        run: function () {
          return this.levelRenderer.warmupSharedAssets().catch(function (error) {
            Logger.warn("Renderer warmup during loading failed", error && error.message ? error.message : error);
          });
        }.bind(this)
      },
      {
        id: "audio_warmup",
        stage: "初始化音频资源...",
        weight: 0.08,
        run: function () {
          return this._preloadStartupAudio();
        }.bind(this)
      }
    ];

    var totalWeight = tasks.reduce(function (sum, task) {
      return sum + Math.max(0, Number(task.weight) || 0);
    }, 0);
    var doneWeight = 0;
    var chain = Promise.resolve();

    tasks.forEach(function (task) {
      chain = chain.then(function () {
        if (this._loadingViewController && this._loadingViewController.setStage) {
          this._loadingViewController.setStage(task.stage);
        }
        this._setStatus(task.stage);
        return Promise.resolve().then(task.run).catch(function (error) {
          Logger.warn("Startup task failed: " + task.id, error && error.message ? error.message : error);
        }).then(function () {
          doneWeight += Math.max(0, Number(task.weight) || 0);
          if (this._loadingViewController && this._loadingViewController.setProgress) {
            this._loadingViewController.setProgress(totalWeight > 0 ? (doneWeight / totalWeight) : 1, false);
          }
        }.bind(this));
      }.bind(this));
    }, this);

    return chain;
  },

  _preloadStartupPrefabs: function () {
    if (this._startupPrefabWarmupPromise) {
      return this._startupPrefabWarmupPromise;
    }

    this._startupPrefabWarmupPromise = Promise.all([
      this._ensureLevelSelectPrefabs(),
      this._loadPrefab("prefabs/ui/GameView"),
      this._loadPrefab("prefabs/ui/SettingView"),
      this._loadPrefab("prefabs/ui/WinView"),
      this._loadPrefab("prefabs/ui/LoseView"),
      this._loadPrefab("prefabs/game/ShooterPanel"),
      this._loadPrefab("prefabs/game/BubbleItem"),
      this._loadPrefab("prefabs/game/JarItem"),
      this._loadPrefab("prefabs/game/PreviewBall")
    ]).then(function () {
      return null;
    }).catch(function (error) {
      this._startupPrefabWarmupPromise = null;
      throw error;
    }.bind(this));

    return this._startupPrefabWarmupPromise;
  },

  _buildAudioConfig: function () {
    return {
      bgmPath: this._getGameplayBgmPath(),
      sfxMap: {
        uiClick: this.uiClickSfxResource,
        shot: this.shotSfxResource,
        win: this.winSfxResource,
        lose: this.loseSfxResource,
        jarBounce: this._parseAudioResourceList(this.jarBounceSfxResources),
        jarCollectBottom: this.jarCollectBottomSfxResource
      }
    };
  },

  _getLevelSelectBgmPath: function () {
    return typeof this.levelBackgroundMusicResource === "string"
      ? this.levelBackgroundMusicResource.trim()
      : "";
  },

  _getGameplayBgmPath: function () {
    return typeof this.gameBackgroundMusicResource === "string"
      ? this.gameBackgroundMusicResource.trim()
      : "";
  },

  _parseAudioResourceList: function (value) {
    if (Array.isArray(value)) {
      return value.filter(function (item) {
        return typeof item === "string" && item.trim();
      }).map(function (item) {
        return item.trim();
      });
    }

    if (typeof value !== "string") {
      return [];
    }

    return value.split(",").map(function (item) {
      return item.trim();
    }).filter(function (item) {
      return !!item;
    });
  },

  _preloadStartupAudio: function () {
    if (!this.audioManager) {
      return Promise.resolve();
    }

    var bgmPaths = [
      this._getLevelSelectBgmPath(),
      this._getGameplayBgmPath()
    ].filter(function (path, index, list) {
      return !!path && list.indexOf(path) === index;
    });

    var preloadTasks = [];
    if (typeof this.audioManager.preloadConfiguredAudio === "function") {
      preloadTasks.push(this.audioManager.preloadConfiguredAudio());
    }
    if (bgmPaths.length && typeof this.audioManager.preloadPaths === "function") {
      preloadTasks.push(this.audioManager.preloadPaths(bgmPaths));
    }

    return Promise.all(preloadTasks);
  },

  _playBackgroundMusic: function (resourcePath) {
    if (!this.audioManager || typeof this.audioManager.playBgm !== "function") {
      return;
    }

    this.audioManager.playBgm(resourcePath, { loop: true });
  },

  _playLevelSelectBackgroundMusic: function () {
    this._playBackgroundMusic(this._getLevelSelectBgmPath());
  },

  _playGameplayBackgroundMusic: function () {
    this._playBackgroundMusic(this._getGameplayBgmPath());
  },

  _playSfx: function (name) {
    if (!this.audioManager || typeof this.audioManager.playSfx !== "function") {
      return;
    }

    this.audioManager.playSfx(name);
  },

  _triggerShortVibration: function () {
    if (!cc.sys || !cc.sys.isMobile) {
      return;
    }
    if (
      this.audioManager &&
      this.audioManager.settings &&
      this.audioManager.settings.vibrationEnabled === false
    ) {
      return;
    }

    if (typeof wx !== "undefined" && wx && typeof wx.vibrateShort === "function") {
      try {
        wx.vibrateShort({ type: "light" });
        return;
      } catch (error) {
        // Fall through to other vibration APIs.
      }
    }

    if (typeof navigator !== "undefined" && navigator && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(20);
        return;
      } catch (error) {
        // Fall through to native jsb vibration if available.
      }
    }

    if (typeof jsb !== "undefined" && jsb && jsb.device && typeof jsb.device.vibrate === "function") {
      try {
        jsb.device.vibrate();
      } catch (error) {
        // Ignore vibration failures to avoid breaking gameplay loop.
      }
    }
  },

  _playRuntimeAudioEvents: function (snapshot) {
    var runtimeEvents = snapshot && Array.isArray(snapshot.runtimeEvents) ? snapshot.runtimeEvents : [];
    if (!runtimeEvents.length) {
      return;
    }

    runtimeEvents.forEach(function (event) {
      if (!event || typeof event.type !== "string") {
        return;
      }
      this._trackRuntimeTelemetryEvent(event, snapshot);

      if (event.type === "jar_rim_bounce") {
        this._playSfx("jarBounce");
        return;
      }

      if (event.type === "jar_collect_bottom") {
        this._playSfx("jarCollectBottom");
        return;
      }

      if (event.type === "shot_no_drop") {
        this._triggerShortVibration();
      }
    }, this);
  },

  _preloadStartupLevelConfigs: function () {
    var preloadCount = Math.max(1, Math.floor(Number(this.startupPreloadLevelCount) || 1));
    var levelIds = Array.isArray(this._startupResolvedLevelIds) ? this._startupResolvedLevelIds.slice(0, preloadCount) : [];
    var startupLevelId = this._getStartupLevelId();
    if (levelIds.indexOf(startupLevelId) === -1) {
      levelIds.unshift(startupLevelId);
    }

    levelIds = levelIds.filter(function (levelId, index, list) {
      return Number.isInteger(levelId) && levelId > 0 && list.indexOf(levelId) === index;
    });

    if (levelIds.length === 0) {
      return Promise.resolve();
    }

    return this.levelManager.preloadLevels(levelIds).then(function () {
      return null;
    });
  },

  _delay: function (milliseconds) {
    var waitMs = Math.max(0, Math.floor(Number(milliseconds) || 0));
    if (waitMs <= 0) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      setTimeout(resolve, waitMs);
    });
  },

  update: function (dt) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var snapshot = this.gameManager.update(dt);
    if (!snapshot) {
      return;
    }

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._handleRuntimeStateTransition(snapshot);
    if (!snapshot.activeProjectile) {
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
    }
  },

  _bindInput: function () {
    this.node.on(cc.Node.EventType.TOUCH_START, this._onAimStart, this);
    this.node.on(cc.Node.EventType.TOUCH_MOVE, this._onAimMove, this);
    this.node.on(cc.Node.EventType.TOUCH_END, this._onFireTouch, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, this._onAimCancel, this);
  },

  _getShooterOriginPoint: function () {
    if (
      this.gameManager &&
      this.gameManager.systems &&
      this.gameManager.systems.shooterController &&
      this.gameManager.systems.shooterController.origin
    ) {
      return this.gameManager.systems.shooterController.origin;
    }

    return BoardLayout && BoardLayout.shooterOrigin
      ? BoardLayout.shooterOrigin
      : null;
  },

  _isShotTouchPointValid: function (localPoint) {
    if (!localPoint || typeof localPoint.y !== "number") {
      return false;
    }

    var shooterOrigin = this._getShooterOriginPoint();
    if (!shooterOrigin || typeof shooterOrigin.y !== "number") {
      return true;
    }

    // 仅允许炮台发射点上方的触摸生效。
    return localPoint.y > shooterOrigin.y;
  },

  _onAimStart: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchStart(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var snapshot = this.gameManager.beginAim(localPoint);
    this._lastAimRefreshPoint = {
      x: localPoint.x,
      y: localPoint.y
    };
    this._lastAimRefreshScreenPoint = {
      x: touchLocation.x,
      y: touchLocation.y
    };
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimMove: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchMove(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var minDistance = Math.max(0, Number(this.aimRefreshMinDistance) || 0);
    var shouldRefreshPlan = true;
    if (minDistance > 0 && this._lastAimRefreshScreenPoint) {
      var dx = touchLocation.x - this._lastAimRefreshScreenPoint.x;
      var dy = touchLocation.y - this._lastAimRefreshScreenPoint.y;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        shouldRefreshPlan = false;
      }
    }

    var snapshot = this.gameManager.isAiming
      ? this.gameManager.setAim(localPoint, { skipPlanRefresh: !shouldRefreshPlan })
      : this.gameManager.beginAim(localPoint);

    if (shouldRefreshPlan || !this._lastAimRefreshScreenPoint) {
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onFireTouch: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchEnd(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      this._handleBarrierHammerTargetTouch(localPoint);
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    if (!this.gameManager.isAiming) {
      this.gameManager.beginAim(localPoint);
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    var shotsBeforeFire = Math.max(0, Number(this.gameManager.remainingShots) || 0);
    var snapshot = this.gameManager.fireShot();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    if (snapshot && Math.max(0, Number(snapshot.remainingShots) || 0) < shotsBeforeFire) {
      this._playSfx("shot");
    }
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimCancel: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchCancel();
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }

    var snapshot = this.gameManager.endAim();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onUseSkillBallTap: function (entityType) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: entityType
    });
    this._playSfx("uiClick");
    var useResult = this.gameManager.useSkillBall(entityType);
    var snapshot = useResult && useResult.snapshot
      ? useResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (useResult && useResult.accepted) {
      this._consumePersistentInventoryItemForPowerup(entityType);
      var skillName = entityType === "rainbow" ? "彩虹球" : "炸弹球";
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      var remaining = Math.max(0, Math.floor(Number(inventory[entityType]) || 0));
      this._setStatusWithTip(
        entityType === "rainbow" ? "skill_equip_rainbow_success" : "skill_equip_blast_success",
        {
          remaining: remaining
        },
        skillName + "已装填，剩余：" + remaining
      );
      return;
    }

    var reason = useResult && typeof useResult.reason === "string" ? useResult.reason : "equip_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_inventory_empty", null, "该道具库存不足");
      this._tryRecoverInventoryByAd(entityType);
      return;
    }
    if (reason === "current_slot_occupied_by_skill") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_current_slot_occupied", null, "当前炮台已装填道具球，请先发射");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_busy", null, "当前状态不可切换道具");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: entityType,
      reason: reason
    });
    this._setStatusWithTip("skill_equip_failed", null, "道具装填失败");
  },

  _onUseSwapBallTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "swap"
    });
    this._playSfx("uiClick");
    var swapResult = this.gameManager.useSwapBall();
    var snapshot = swapResult && swapResult.snapshot
      ? swapResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (swapResult && swapResult.accepted) {
      this._consumePersistentInventoryItemForPowerup("swap");
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      var remaining = Math.max(0, Math.floor(Number(inventory.swap) || 0));
      this._setStatusWithTip("swap_success", {
        remaining: remaining
      }, "换球成功，剩余：" + remaining);
      return;
    }

    var reason = swapResult && typeof swapResult.reason === "string" ? swapResult.reason : "swap_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_inventory_empty", null, "换球道具库存不足");
      this._tryRecoverInventoryByAd("swap");
      return;
    }
    if (reason === "queue_missing") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_queue_missing", null, "当前无法换球");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_busy", null, "当前状态不可使用换球");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "swap",
      reason: reason
    });
    this._setStatusWithTip("swap_failed", null, "换球失败");
  },

  _onUseBarrierHammerTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "barrier_hammer"
    });
    this._playSfx("uiClick");
    var isTargeting = this._isBarrierHammerTargeting();
    var hammerResult = isTargeting
      ? this.gameManager.cancelBarrierHammer()
      : this.gameManager.beginBarrierHammer();
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (isTargeting) {
      this._setStatusWithTip("hammer_cancelled", null, "已取消破障锤");
      return;
    }

    if (hammerResult && hammerResult.accepted) {
      this._setStatusWithTip("hammer_ready", null, "破障锤已就绪，请点选石头或冰冻球");
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_obstacle") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_no_obstacle", null, "没有需要破除的障碍");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_enable_failed", null, "破障锤启用失败");
  },

  _handleBarrierHammerTargetTouch: function (localPoint) {
    var hammerResult = this.gameManager.useBarrierHammerAt(localPoint);
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (hammerResult && hammerResult.accepted) {
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      this._consumePersistentInventoryItemForPowerup("barrier_hammer");
      var remaining = Math.max(0, Math.floor(Number(inventory.barrier_hammer) || 0));
      this._setStatusWithTip("hammer_applied", {
        remaining: remaining
      }, "破障锤生效，剩余：" + remaining);
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_target" || reason === "target_invalid") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_target_invalid", null, "请点选石头或冰冻球");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_use_failed", null, "破障锤使用失败");
  },

  _isBarrierHammerTargeting: function () {
    return !!(this.gameManager && this.gameManager.pendingBarrierHammer);
  },

  _setStatusWithTip: function (tipKey, params, fallbackMessage) {
    var message = typeof fallbackMessage === "string" ? fallbackMessage : "";
    if (this.tipsPresenter && typeof this.tipsPresenter.resolveMessage === "function") {
      message = this.tipsPresenter.resolveMessage(tipKey, params, fallbackMessage);
    }

    this._setStatus(message);
    if (this.tipsPresenter && typeof this.tipsPresenter.showByKey === "function") {
      this.tipsPresenter.showByKey(tipKey, params, fallbackMessage);
    }
  },

  _refreshPlayerInventory: function () {
    if (!this.inventoryStore) {
      this.playerInventory = this.playerInventory || {
        items: {}
      };
      return this.playerInventory;
    }

    this.playerInventory = this.inventoryStore.load();
    return this.playerInventory;
  },

  _addInventoryItem: function (itemId, count) {
    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.addItem !== "function") {
      return {
        accepted: false,
        reason: "inventory_store_unavailable"
      };
    }

    var addResult = this.inventoryStore.addItem(this.playerInventory, itemId, count);
    if (!addResult || !addResult.accepted) {
      return {
        accepted: false,
        reason: addResult && addResult.reason ? addResult.reason : "inventory_add_failed"
      };
    }

    this.playerInventory = addResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    return addResult;
  },

  _refreshSelectedPowerups: function () {
    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.load !== "function") {
      this.selectedPowerupsState = this.selectedPowerupsState || {
        selectedItems: []
      };
      return this.selectedPowerupsState;
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    return this.selectedPowerupsState;
  },

  _saveSelectedPowerups: function (selectedItems) {
    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.setSelectedItems !== "function") {
      this.selectedPowerupsState = {
        version: 1,
        selectedItems: Array.isArray(selectedItems) ? selectedItems.slice(0, MAX_SELECTED_POWERUPS) : []
      };
      return this.selectedPowerupsState;
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.setSelectedItems(selectedItems);
    return this.selectedPowerupsState;
  },

  _getAvailableSelectedPowerupItems: function () {
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    var availableSelectedItems = selectedItems.filter(function (itemId, index, list) {
      return list.indexOf(itemId) === index &&
        POWERUP_TYPE_BY_ITEM_ID[itemId] &&
        this.inventoryStore &&
        this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this).slice(0, MAX_SELECTED_POWERUPS);

    if (availableSelectedItems.length !== selectedItems.length) {
      this._saveSelectedPowerups(availableSelectedItems);
    }
    return availableSelectedItems;
  },

  _applySelectedPowerupsToRuntime: function (snapshot) {
    if (!this.gameManager || typeof this.gameManager.grantPowerupInventory !== "function") {
      return snapshot || null;
    }

    var selectedItems = this._getAvailableSelectedPowerupItems();
    var latestSnapshot = snapshot || this.gameManager.getRuntimeSnapshot();
    selectedItems.forEach(function (itemId) {
      var powerupType = POWERUP_TYPE_BY_ITEM_ID[itemId];
      if (!powerupType) {
        return;
      }

      var grantResult = this.gameManager.grantPowerupInventory(powerupType, 1);
      if (grantResult && grantResult.snapshot) {
        latestSnapshot = grantResult.snapshot;
      }
    }, this);

    return latestSnapshot;
  },

  _consumePersistentInventoryItemForPowerup: function (powerupType) {
    var itemId = ITEM_ID_BY_POWERUP_TYPE[powerupType];
    if (!itemId || !this.inventoryStore || typeof this.inventoryStore.removeItem !== "function") {
      return false;
    }

    this._refreshPlayerInventory();
    var removeResult = this.inventoryStore.removeItem(this.playerInventory, itemId, 1);
    if (!removeResult || !removeResult.accepted) {
      this._getAvailableSelectedPowerupItems();
      return false;
    }

    this.playerInventory = removeResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    this._getAvailableSelectedPowerupItems();
    this._renderInventoryView();
    this._updateInventoryEntryState();
    return true;
  },

  _ensureInventoryViewPrefab: function () {
    if (this._inventoryViewPrefab) {
      return Promise.resolve(this._inventoryViewPrefab);
    }

    return this._loadPrefab(INVENTORY_VIEW_PREFAB_PATH).then(function (prefab) {
      this._inventoryViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _showInventoryView: function () {
    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._ensureInventoryViewPrefab().then(function (prefab) {
      if (!prefab) {
        this._setStatus("背包界面加载失败");
        return;
      }

      var inventoryViewNode = this._inventoryViewNode;
      if (!inventoryViewNode || !inventoryViewNode.isValid) {
        inventoryViewNode = cc.instantiate(prefab);
        inventoryViewNode.parent = this.node;
        inventoryViewNode.setPosition(0, 0);
        inventoryViewNode.zIndex = 320;
        this._inventoryViewNode = inventoryViewNode;
        this._inventoryViewController = new InventoryViewController({
          node: inventoryViewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideInventoryView();
          }.bind(this),
          onConfirm: this._confirmInventorySelection.bind(this),
          onToggleItem: this._toggleInventorySelection.bind(this),
          onSelectionLimit: function () {
            this._setStatusWithTip("inventory_selection_limit", null, "最多携带2个道具");
          }.bind(this)
        });
      }

      inventoryViewNode.active = true;
      this._renderInventoryView();
    }.bind(this)).catch(function (error) {
      Logger.warn("Show inventory view failed", error && error.message ? error.message : error);
      this._setStatus("背包界面加载失败");
    }.bind(this));
  },

  _hideInventoryView: function () {
    if (!this._inventoryViewNode || !this._inventoryViewNode.isValid) {
      return;
    }
    this._inventoryViewNode.active = false;
  },

  _confirmInventorySelection: function () {
    this._playSfx("uiClick");
    this._hideInventoryView();
    this._setStatusWithTip("inventory_confirmed", null, "出战道具已保存");
    this._updateInventoryEntryState();
  },

  _toggleInventorySelection: function (itemId) {
    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    if (!this.inventoryStore || this.inventoryStore.getItemCount(this.playerInventory, itemId) <= 0) {
      this._setStatusWithTip("inventory_item_empty", null, "该道具库存不足");
      return;
    }

    var toggleResult = this.selectedPowerupsStore.toggleItem(this.selectedPowerupsState, itemId);
    if (!toggleResult || !toggleResult.accepted) {
      if (toggleResult && toggleResult.reason === "selection_limit") {
        this._setStatusWithTip("inventory_selection_limit", null, "最多携带2个道具");
      } else {
        this._setStatusWithTip("inventory_selection_failed", null, "道具选择失败");
      }
      return;
    }

    this.selectedPowerupsState = toggleResult.state;
    this.selectedPowerupsStore.save(this.selectedPowerupsState);
    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _renderInventoryView: function () {
    if (!this._inventoryViewController || !this._inventoryViewNode || !this._inventoryViewNode.isValid) {
      return;
    }

    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();
    this._inventoryViewController.render({
      inventory: this.playerInventory,
      selectedItems: this.selectedPowerupsState.selectedItems,
      coinCount: this._getCurrentCoins()
    });
  },

  _updateInventoryEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    var entryNode = bottomLayerNode ? bottomLayerNode.getChildByName("backpack_btn") : null;
    if (!entryNode || !entryNode.isValid) {
      return;
    }

    var selectedItems = this._getAvailableSelectedPowerupItems();
    entryNode.opacity = selectedItems.length > 0 ? 255 : 230;
  },

  _trackTelemetry: function (eventName, payload) {
    if (!this.telemetryService || typeof this.telemetryService.track !== "function") {
      return null;
    }

    this.telemetryService.setContext({
      attempt_id: this._currentAttemptId || "",
      level_id: this._currentLevelId || "",
      level_code: this.currentLevelConfig && this.currentLevelConfig.level
        ? this.currentLevelConfig.level.code
        : ""
    });
    return this.telemetryService.track(eventName, payload);
  },

  _beginLevelAttemptTracking: function (levelConfig, snapshot) {
    var safeLevelConfig = levelConfig && levelConfig.level ? levelConfig.level : {};
    this._attemptSequence += 1;
    this._currentAttemptId = [
      "attempt",
      String(this._attemptSequence),
      String(safeLevelConfig.levelId || this._currentLevelId || 0),
      Date.now().toString(36)
    ].join("_");
    this._trackedResultAttemptId = "";
    this._grantedAttemptRewardKeys = {};

    this._trackTelemetry("level_start", {
      result_state: snapshot && snapshot.state ? snapshot.state : "running"
    });
    if (this.adService && typeof this.adService.preloadRewarded === "function") {
      this.adService.preloadRewarded().catch(function () {
        // Ignore preload failures and fallback to lazy show-time loading.
      });
    }
  },

  _trackRuntimeTelemetryEvent: function (runtimeEvent) {
    if (!runtimeEvent || typeof runtimeEvent.type !== "string") {
      return;
    }

    if (runtimeEvent.type === "jar_collect_scored") {
      this._trackTelemetry("jar_collect_scored", {
        count: Math.max(0, Math.floor(Number(runtimeEvent.count) || 0)),
        gained: Math.max(0, Math.floor(Number(runtimeEvent.gained) || 0)),
        is_score_boosted: !!runtimeEvent.is_score_boosted,
        boost_multiplier: Number(runtimeEvent.boost_multiplier) || 1
      });
    }
  },

  _onRuntimeStateTransition: function (snapshot, previousState, currentState) {
    if (currentState === previousState) {
      return;
    }

    var isTerminalState = currentState === "won" ||
      currentState === "out_of_shots" ||
      currentState === "lost_danger" ||
      currentState === "lost_objective";

    if (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective") {
      var loseRewardEntry = AdRewardCatalog.resolveLoseRewardEntry(currentState);
      if (loseRewardEntry) {
        this._trackTelemetry("ad_entry_exposed", {
          entry_key: loseRewardEntry.entryKey,
          reward_type: loseRewardEntry.rewardType,
          result_state: currentState
        });
      }
    }

    if (isTerminalState && this._trackedResultAttemptId !== this._currentAttemptId) {
      this._trackedResultAttemptId = this._currentAttemptId;
      this._trackTelemetry("level_result", {
        result_state: currentState
      });
    }
  },

  _buildAttemptRewardKey: function (rewardType) {
    return this._currentAttemptId + "|" + rewardType;
  },

  _hasGrantedAttemptReward: function (rewardType) {
    if (!this._currentAttemptId) {
      return false;
    }
    var key = this._buildAttemptRewardKey(rewardType);
    return !!this._grantedAttemptRewardKeys[key];
  },

  _markAttemptRewardGranted: function (rewardType) {
    if (!this._currentAttemptId) {
      return;
    }
    var key = this._buildAttemptRewardKey(rewardType);
    this._grantedAttemptRewardKeys[key] = true;
  },

  _onLoseWatchAdTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var snapshot = this.gameManager.getRuntimeSnapshot();
    var loseRewardEntry = AdRewardCatalog.resolveLoseRewardEntry(snapshot ? snapshot.state : "");
    if (!loseRewardEntry) {
      this._setStatus("当前失败类型暂无广告奖励");
      return;
    }

    this._showRewardedAdForEntry(loseRewardEntry, {
      entrySource: "lose_view",
      trackExposure: false,
      allowSimulatedCompletion: true,
      onRewardGrantedMessage: "奖励已生效，正在重新开局...",
      onRewardGranted: function () {
        this._restartCurrentLevel();
      }.bind(this)
    }).then(function (granted) {
      if (granted) {
        return;
      }

      if (this.isRestarting || this.isSelectingLevel) {
        return;
      }

      this._setStatusWithTip("ad_reward_not_granted_back_to_level", null, "广告未发奖，返回选关页面");
      this._onBackToLevelTap();
    }.bind(this));
  },

  _showRewardedAdForEntry: function (entry, options) {
    options = options || {};
    if (!entry) {
      return Promise.resolve(false);
    }

    if (this._adFlowInProgress) {
      this._setStatus("广告处理中，请稍候...");
      return Promise.resolve(false);
    }

    if (!this.adService || typeof this.adService.showRewarded !== "function") {
      this._setStatus("广告服务未就绪");
      return Promise.resolve(false);
    }

    if (options.trackExposure !== false) {
      this._trackTelemetry("ad_entry_exposed", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        entry_source: options.entrySource || entry.entryKey
      });
    }

    var quotaResult = this.adRewardQuotaStore && typeof this.adRewardQuotaStore.canGrant === "function"
      ? this.adRewardQuotaStore.canGrant(entry.quotaType)
      : { allowed: true, reason: "ok", cooldownRemainingSec: 0, remainingToday: -1 };
    if (!quotaResult.allowed) {
      if (quotaResult.reason === "daily_limit") {
        this._setStatus("今日奖励次数已达上限");
      } else if (quotaResult.reason === "cooldown") {
        this._setStatus("操作过快，请" + quotaResult.cooldownRemainingSec + "秒后重试");
      } else {
        this._setStatus("当前无法领取奖励");
      }
      return Promise.resolve(false);
    }

    if (this._hasGrantedAttemptReward(entry.rewardType)) {
      this._setStatus("本局该奖励已领取");
      return Promise.resolve(false);
    }

    this._adFlowInProgress = true;
    this._trackTelemetry("ad_request", {
      entry_key: entry.entryKey,
      reward_type: entry.rewardType
    });

    return this.adService.showRewarded({
      placement: options.entrySource || entry.entryKey,
      onShow: function () {
        this._trackTelemetry("ad_show", {
          entry_key: entry.entryKey,
          reward_type: entry.rewardType
        });
      }.bind(this)
    }).then(function (adResult) {
      var safeAdResult = adResult || null;
      var usedSimulatedCompletion = false;
      if (
        (!safeAdResult || !safeAdResult.ok) &&
        options.allowSimulatedCompletion === true
      ) {
        usedSimulatedCompletion = true;
        safeAdResult = {
          ok: true,
          code: "simulated_close",
          isCompleted: true,
          simulated: true,
          originalCode: adResult && adResult.code ? adResult.code : "unknown"
        };
      }

      var isCompleted = !!(safeAdResult && safeAdResult.isCompleted);
      this._trackTelemetry("ad_close", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        is_completed: isCompleted,
        is_simulated: usedSimulatedCompletion
      });

      if (!safeAdResult || !safeAdResult.ok) {
        this._setStatus("广告加载失败，请稍后重试");
        return false;
      }
      if (!isCompleted) {
        this._setStatus("未完整观看广告，奖励未发放");
        return false;
      }

      var grantResult = this._grantAdEntryReward(entry, options);
      if (!grantResult || !grantResult.accepted) {
        this._setStatus(grantResult && grantResult.message ? grantResult.message : "奖励发放失败");
        return false;
      }

      if (this.adRewardQuotaStore && typeof this.adRewardQuotaStore.recordGrant === "function") {
        this.adRewardQuotaStore.recordGrant(entry.quotaType);
      }
      this._markAttemptRewardGranted(entry.rewardType);
      this._trackTelemetry("ad_reward_grant", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        reward_value: entry.rewardValue
      });

      if (grantResult.snapshot && this.currentLevelConfig && !this.isSelectingLevel) {
        this.levelRenderer.refreshRuntime(this.currentLevelConfig, grantResult.snapshot);
      }
      this._setStatus(grantResult.message || options.onRewardGrantedMessage || "奖励发放成功");
      if (typeof options.onRewardGranted === "function") {
        options.onRewardGranted();
      }
      return true;
    }.bind(this), function () {
      this._setStatus("广告展示失败，请稍后重试");
      return false;
    }.bind(this)).then(function (granted) {
      this._adFlowInProgress = false;
      return granted;
    }.bind(this), function () {
      this._adFlowInProgress = false;
      return false;
    }.bind(this));
  },

  _grantAdEntryReward: function (entry, options) {
    options = options || {};
    if (!entry) {
      return {
        accepted: false,
        message: "奖励配置缺失"
      };
    }

    if (entry.grantMode === "next_round") {
      this._queueNextRoundReward(entry);
      return {
        accepted: true,
        message: options.onRewardGrantedMessage || "奖励已解锁，下局生效"
      };
    }

    if (entry.staminaGrant) {
      this._refreshPlayerResources();
      var safeGrant = Math.max(1, Math.floor(Number(entry.staminaGrant) || 1));
      this.playerResources.stamina = Math.max(
        0,
        Math.floor(Number(this.playerResources.stamina) || 0)
      ) + safeGrant;
      if (this.playerResourceStore && typeof this.playerResourceStore.save === "function") {
        this.playerResourceStore.save(this.playerResources);
      }
      this._updateLevelSelectTopStatus();
      return {
        accepted: true,
        message: "体力补给成功：+" + safeGrant
      };
    }

    if (entry.inventoryGrant) {
      var inventoryGrant = entry.inventoryGrant;
      var grantResult = this.gameManager.grantPowerupInventory(
        inventoryGrant.powerupType,
        inventoryGrant.amount
      );
      if (!grantResult || !grantResult.accepted) {
        return {
          accepted: false,
          message: "道具补给失败"
        };
      }
      var itemId = ITEM_ID_BY_POWERUP_TYPE[inventoryGrant.powerupType];
      if (itemId && typeof this._addInventoryItem === "function") {
        this._addInventoryItem(itemId, inventoryGrant.amount);
        this._renderInventoryView();
        this._updateInventoryEntryState();
      }
      return {
        accepted: true,
        snapshot: grantResult.snapshot,
        message: "补给成功：" +
          AdRewardCatalog.resolvePowerupDisplayName(inventoryGrant.powerupType) +
          " +" + grantResult.gained
      };
    }

    return {
      accepted: false,
      message: "未知奖励类型"
    };
  },

  _queueNextRoundReward: function (entry) {
    if (!entry || !entry.rewardType) {
      return;
    }

    var queued = this._pendingNextRoundRewards || [];
    var exists = queued.some(function (item) {
      return item && item.rewardType === entry.rewardType;
    });
    if (exists) {
      return;
    }

    queued.push(clone(entry));
    this._pendingNextRoundRewards = queued;
  },

  _applyPendingNextRoundRewards: function (snapshot) {
    var pendingRewards = Array.isArray(this._pendingNextRoundRewards)
      ? this._pendingNextRoundRewards.slice()
      : [];
    if (!pendingRewards.length) {
      return snapshot;
    }

    var appliedRewardTexts = [];
    pendingRewards.forEach(function (rewardEntry) {
      if (rewardEntry.jarScoreBoost) {
        var boostResult = this.gameManager.activateJarScoreBoost({
          multiplier: rewardEntry.jarScoreBoost.multiplier,
          durationMs: rewardEntry.jarScoreBoost.durationMs
        });
        snapshot = boostResult || this.gameManager.getRuntimeSnapshot();
        appliedRewardTexts.push("5秒入缸x2");
        return;
      }

      if (rewardEntry.inventoryGrant) {
        var inventoryGrant = rewardEntry.inventoryGrant;
        var grantResult = this.gameManager.grantPowerupInventory(
          inventoryGrant.powerupType,
          inventoryGrant.amount
        );
        if (grantResult && grantResult.accepted) {
          snapshot = grantResult.snapshot || this.gameManager.getRuntimeSnapshot();
          appliedRewardTexts.push(
            AdRewardCatalog.resolvePowerupDisplayName(inventoryGrant.powerupType) + " +" + grantResult.gained
          );
        }
      }
    }, this);

    this._pendingNextRoundRewards = [];
    if (appliedRewardTexts.length > 0) {
      this._setStatus("下局奖励生效：" + appliedRewardTexts.join("，"));
    }
    return snapshot || this.gameManager.getRuntimeSnapshot();
  },

  _tryRecoverInventoryByAd: function (powerupType) {
    if (!powerupType || this.isSelectingLevel || this.isRestarting || !this.currentLevelConfig) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveInventoryEmptyRewardEntry(powerupType);
    if (!rewardEntry) {
      return;
    }

    this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "inventory_empty",
      onRewardGrantedMessage: "道具补给成功"
    });
  },

  _tryRecoverStaminaByAd: function (onRecovered) {
    if (this._staminaRecoveryInProgress) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveStaminaRecoveryEntry();
    if (!rewardEntry) {
      return;
    }

    this._staminaRecoveryInProgress = true;
    this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "stamina_insufficient",
      onRewardGrantedMessage: "体力补给成功，可继续挑战"
    }).then(function (granted) {
      this._staminaRecoveryInProgress = false;
      if (granted && typeof onRecovered === "function") {
        onRecovered();
      }
    }.bind(this));
  },

  _loadInitialLevel: function () {
    var startupLevelId = this._getStartupLevelId();
    this._setStatus("Loading level_" + ("000" + startupLevelId).slice(-3) + "...");
    this._loadLevelById(startupLevelId, "Bootstrap finished", "Bootstrap failed. Check console logs.");
  },

  _getStartupLevelId: function () {
    var fallbackLevelId = Math.max(1, Number(this.initialLevelId) || 1);
    if (!this.enableSpecialEntitiesTestMode) {
      return fallbackLevelId;
    }

    var testLevelId = Math.max(1, Number(this.specialEntitiesTestLevelId) || fallbackLevelId);
    return testLevelId;
  },

  _restartCurrentLevel: function () {
    if (!this.currentLevelConfig) {
      return;
    }

    this._playSfx("uiClick");
    this.isRestarting = true;
    this._setStatus("Restarting level...");

    var snapshot = this.gameManager.startLevel(this.currentLevelConfig);
    if (typeof this._applySelectedPowerupsToRuntime === "function") {
      snapshot = this._applySelectedPowerupsToRuntime(snapshot);
    }
    snapshot = this._applyPendingNextRoundRewards(snapshot);
    this._beginLevelAttemptTracking(this.currentLevelConfig, snapshot);
    snapshot = this.gameManager.endAim();
    this._lastRuntimeState = snapshot ? snapshot.state : null;
    this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).then(function () {
      this.isRestarting = false;
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
      this._playGameplayBackgroundMusic();
      Logger.info("Level restarted", this.currentLevelConfig.level.code);
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._refreshRouteEditorButtons();
      this._setStatus("Restart failed. Check console logs.");
      Logger.error(error);
    }.bind(this));
  },

  _isTerminalState: function () {
    var snapshot = this.gameManager.getRuntimeSnapshot();
    return snapshot.state === "won" ||
      snapshot.state === "out_of_shots" ||
      snapshot.state === "out_of_shots_pending" ||
      snapshot.state === "lost_danger" ||
      snapshot.state === "lost_objective";
  },

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
  _grantSignInRewardItems: GameBootstrapUiFlowMethods._grantSignInRewardItems,
  _claimTodaySignInReward: GameBootstrapUiFlowMethods._claimTodaySignInReward,
  _maybeAutoShowSignInView: GameBootstrapUiFlowMethods._maybeAutoShowSignInView,
  _resolveLeaderboardPlayerName: GameBootstrapUiFlowMethods._resolveLeaderboardPlayerName,
  _refreshLeaderboardEntries: GameBootstrapUiFlowMethods._refreshLeaderboardEntries,
  _ensureRankingViewPrefab: GameBootstrapUiFlowMethods._ensureRankingViewPrefab,
  _onLevelSelectRankingTap: GameBootstrapUiFlowMethods._onLevelSelectRankingTap,
  _showRankingView: GameBootstrapUiFlowMethods._showRankingView,
  _hideRankingView: GameBootstrapUiFlowMethods._hideRankingView,
  _renderRankingView: GameBootstrapUiFlowMethods._renderRankingView,
  _getStarChestSummary: GameBootstrapUiFlowMethods._getStarChestSummary,
  _ensureStarChestEntryRedDot: GameBootstrapUiFlowMethods._ensureStarChestEntryRedDot,
  _updateStarChestEntryState: GameBootstrapUiFlowMethods._updateStarChestEntryState,
  _openStarChest: GameBootstrapUiFlowMethods._openStarChest,
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

