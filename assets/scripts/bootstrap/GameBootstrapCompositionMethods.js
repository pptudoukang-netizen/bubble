"use strict";

var Shared = require("./GameBootstrapShared");
var DebugFlags = Shared.DebugFlags;
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var PoolManager = Shared.PoolManager;
var LevelProgressStore = Shared.LevelProgressStore;
var LevelAttemptStatsStore = Shared.LevelAttemptStatsStore;
var PlayerResourceStore = Shared.PlayerResourceStore;
var DailyTaskStore = Shared.DailyTaskStore;
var StaminaRecoveryStore = Shared.StaminaRecoveryStore;
var InventoryStore = Shared.InventoryStore;
var StarChestStore = Shared.StarChestStore;
var ShopStateStore = Shared.ShopStateStore;
var GameCircleWelfareStore = Shared.GameCircleWelfareStore;
var SelectedPowerupsStore = Shared.SelectedPowerupsStore;
var SignInStore = Shared.SignInStore;
var NewUserGuideStore = Shared.NewUserGuideStore;
var NewGiftStore = Shared.NewGiftStore;
var RouteConfigStore = Shared.RouteConfigStore;
var SpecialIntroduceStore = Shared.SpecialIntroduceStore;
var RandomChallengeStore = Shared.RandomChallengeStore;
var AudioManager = Shared.AudioManager;
var DailySignInConfig = Shared.DailySignInConfig;
var DailyTaskConfig = Shared.DailyTaskConfig;
var StarChestConfig = Shared.StarChestConfig;
var GameCircleWelfareConfig = Shared.GameCircleWelfareConfig;
var ShopGoodsConfig = Shared.ShopGoodsConfig;
var ShopRulesConfig = Shared.ShopRulesConfig;
var LevelManager = Shared.LevelManager;
var RuntimeModeConfig = Shared.RuntimeModeConfig;
var ResourceGateway = Shared.ResourceGateway;
var NetworkLoadingOverlay = Shared.NetworkLoadingOverlay;
var TipsPresenter = Shared.TipsPresenter;
var StarChestRewardService = Shared.StarChestRewardService;
var StarChestService = Shared.StarChestService;
var DailyTaskRewardService = Shared.DailyTaskRewardService;
var DailyTaskService = Shared.DailyTaskService;
var GameCircleButtonAdapter = Shared.GameCircleButtonAdapter;
var GameCircleWelfareService = Shared.GameCircleWelfareService;
var ShopConfigService = Shared.ShopConfigService;
var ShopStateService = Shared.ShopStateService;
var ShopPurchaseService = Shared.ShopPurchaseService;
var WechatShareService = Shared.WechatShareService;
var FriendGiftService = Shared.FriendGiftService;
var PlayerCloudProfileService = Shared.PlayerCloudProfileService;
var WorldLeaderboardService = Shared.WorldLeaderboardService;
var AdService = Shared.AdService;
var WechatNativeTemplateAdAdapter = Shared.WechatNativeTemplateAdAdapter;
var TelemetryService = Shared.TelemetryService;
var AdRewardQuotaStore = Shared.AdRewardQuotaStore;
var clone = Shared.clone;
var requireNonNegativeInteger = Shared.requireNonNegativeInteger;

function isNewAccountProgress(levelProgress) {
  if (!levelProgress || typeof levelProgress !== "object" || Array.isArray(levelProgress)) {
    throw new Error("New user guide requires level progress.");
  }
  if (!Number.isInteger(levelProgress.highestUnlockedLevel) || levelProgress.highestUnlockedLevel <= 0) {
    throw new Error("New user guide requires positive highestUnlockedLevel.");
  }
  if (!levelProgress.completedLevels || typeof levelProgress.completedLevels !== "object" || Array.isArray(levelProgress.completedLevels)) {
    throw new Error("New user guide requires completedLevels.");
  }
  return levelProgress.highestUnlockedLevel === 1 && Object.keys(levelProgress.completedLevels).length === 0;
}

module.exports = {
  onLoad: function () {
    this._applyRuntimeModeConfig();
    this._applyViewportLayout();

    DebugFlags.setAll({
      logs: RuntimeModeConfig.isRelease() !== true,
      overlay: this.showDebugOverlay,
      levelSelectMemory: false,
      testLayer: this.showGridTestLayer,
      gridOverlapCheck: RuntimeModeConfig.isRelease() !== true || this.showDebugOverlay === true
    });

    this.currentLevelConfig = null;
    this.isRestarting = false;
    this.isSelectingLevel = false;
    this.isGameplayPaused = false;
    this.isPropDescriptionViewOpen = false;
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
    this.networkLoadingOverlay = null;
    this.wechatShareService = null;
    this.friendGiftService = null;
    this.playerCloudProfileService = null;
    this.worldLeaderboardService = null;
    this._friendGiftEnterShowHandler = null;
    this._wechatShareMenuPromise = null;
    this._startupFlowPromise = null;
    this._startupResolvedLevelIds = null;
    this._startupPrefabWarmupPromise = null;
    this._startupBundlePrefetchPromise = null;
    this._deferredUiBundleWarmupPromise = null;
    this._deferredFriendStaminaGiftClaimPromise = null;
    this._deferredPlayerCloudProfileSyncPromise = null;
    this._gameplayKernelPromise = null;
    this._lastStatusMessage = "";
    this._lastRuntimeState = null;
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this._currentLevelId = 0;
    this._currentLevelAwardedClearRewardItems = [];
    this._currentRunContext = null;
    this._levelSelectRouteEditorMode = false;
    this._pendingRouteEditorAutoEnable = false;
    this._levelConfigPreloadPromise = null;
    this._currentAttemptId = "";
    this._attemptSequence = 0;
    this._trackedResultAttemptId = "";
    this._grantedAttemptRewardKeys = {};
    this._pendingNextRoundRewards = [];
    this._adFlowInProgress = false;
    this._interstitialAdInProgress = false;
    this._consecutiveLoseCountForInterstitial = 0;
    this._interstitialReturnHideObserved = false;
    this._interstitialReturnHideHandler = null;
    this._interstitialReturnShowHandler = null;
    this._startGameNativeTemplateAdHeightPx = 0;
    this._startGameNativeTemplateAdShowing = false;
    this._resultNativeTemplateAdPlacement = "";
    this._resultNativeTemplateAdHeightPx = 0;
    this._resultNativeTemplateAdShowing = false;
    this._staminaRecoveryInProgress = false;
    this._staminaRecoveryTicker = null;
    this._pendingLevelEntry = null;
    this.telemetryService = new TelemetryService({
      logger: Logger
    });
    this.levelProgressStore = new LevelProgressStore();
    this.levelProgress = this.resetLevelProgressOnStart
      ? this.levelProgressStore.reset()
      : this.levelProgressStore.load();
    this.levelAttemptStatsStore = new LevelAttemptStatsStore();
    this.levelAttemptStats = this.levelAttemptStatsStore.load();
    this.randomChallengeStore = new RandomChallengeStore();
    this.randomChallengeState = this.randomChallengeStore.load();
    this.playerResourceStore = new PlayerResourceStore({
      dailyStamina: 20
    });
    this.staminaRecoveryStore = new StaminaRecoveryStore();
    this.staminaRecoveryState = this.staminaRecoveryStore.load();
    this.playerResources = this.playerResourceStore.load();
    if (RuntimeModeConfig.enableInspectorOverrides === true) {
      var inspectorStamina = Math.floor(Number(this.inspectorStaminaValue));
      if (!Number.isInteger(inspectorStamina) || inspectorStamina < 0) {
        throw new Error("inspectorStaminaValue must be a non-negative integer when inspector overrides are enabled.");
      }
      this.playerResources.stamina = inspectorStamina;
      this.playerResourceStore.save(this.playerResources);
      this._markStaminaRecoveryBaseline(new Date());
    }
    this.playerResources = this._refreshPlayerResources();
    this.dailyTaskConfig = clone(DailyTaskConfig);
    this.dailyTaskStore = new DailyTaskStore({
      resetTimezone: this.dailyTaskConfig.resetTimezone
    });
    this.dailyTaskRewardService = new DailyTaskRewardService({
      getResources: function () {
        return this._refreshPlayerResources();
      }.bind(this),
      saveResources: function (resources) {
        this.playerResources = resources;
        if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
          throw new Error("Daily task reward requires PlayerResourceStore.save.");
        }
        this.playerResourceStore.save(this.playerResources);
        return true;
      }.bind(this)
    });
    this.dailyTaskService = new DailyTaskService({
      config: this.dailyTaskConfig,
      store: this.dailyTaskStore,
      rewardService: this.dailyTaskRewardService,
      telemetry: this.telemetryService
    });
    this.dailyTaskState = this.dailyTaskStore.load(new Date());
    this.inventoryStore = new InventoryStore();
    this.playerInventory = this.inventoryStore.load();
    this.starChestConfig = clone(StarChestConfig);
    this.starChestStore = new StarChestStore({
      activityId: this.starChestConfig.activityId
    });
    this.starChestStore.load();
    this.starChestRewardService = new StarChestRewardService({
      getResources: function () {
        return this._refreshPlayerResources();
      }.bind(this),
      saveResources: function (resources) {
        this.playerResources = resources;
        if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
          throw new Error("Star chest reward requires PlayerResourceStore.save.");
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
    this.gameCircleWelfareConfig = clone(GameCircleWelfareConfig);
    this.gameCircleWelfareStore = new GameCircleWelfareStore({
      activityId: this.gameCircleWelfareConfig.activityId
    });
    this.gameCircleWelfareStore.load(new Date());
    this.gameCircleButtonAdapter = new GameCircleButtonAdapter({
      cloud: this.gameCircleWelfareConfig.cloud
    });
    this.gameCircleWelfareService = new GameCircleWelfareService({
      config: this.gameCircleWelfareConfig,
      store: this.gameCircleWelfareStore,
      rewardService: this.starChestRewardService,
      platformClient: this.gameCircleButtonAdapter,
      telemetry: this.telemetryService
    });
    this.shopConfigService = new ShopConfigService({
      goodsConfig: clone(ShopGoodsConfig),
      rulesConfig: clone(ShopRulesConfig)
    });
    this.shopStateStore = new ShopStateStore();
    this.shopStateService = new ShopStateService({
      store: this.shopStateStore,
      configService: this.shopConfigService
    });
    this.shopPurchaseService = new ShopPurchaseService({
      configService: this.shopConfigService,
      stateService: this.shopStateService,
      getCoinBalance: function () {
        return this._getCurrentCoins();
      }.bind(this),
      spendCoin: function (amount, reason) {
        return this._spendCoinsForShop(amount, reason);
      }.bind(this),
      refundCoin: function (amount, reason) {
        return this._refundCoinsForShop(amount, reason);
      }.bind(this),
      addInventoryItem: function (itemId, count, reason) {
        if (itemId === "stamina") {
          return this._addStaminaForShop(count, reason);
        }
        return this._addInventoryItem(itemId, count);
      }.bind(this),
      telemetry: this.telemetryService
    });
    this.selectedPowerupsStore = new SelectedPowerupsStore();
    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    this.newUserGuideStore = new NewUserGuideStore({
      initialActive: isNewAccountProgress(this.levelProgress)
    });
    this.newUserGuideState = this.newUserGuideStore.load();
    this.newUserGuideStore.save(this.newUserGuideState);
    this._newUserGuideLayer = null;
    this._newUserGuideFingerNode = null;
    this._newUserGuideFingerSpriteFrame = null;
    this._newUserGuideFingerSpriteFramePromise = null;
    this._newUserGuideFingerSize = null;
    this._inventoryViewPrefab = null;
    this._inventoryViewNode = null;
    this._inventoryViewController = null;
    this._inventoryViewReadOnly = true;
    this._startGameViewPrefab = null;
    this._startGameViewNode = null;
    this._startGameViewController = null;
    this._startGameLevelId = 0;
    this._startGameLevelConfig = null;
    this._pendingStartGamePowerups = [];
    this._pendingStartGameTemporaryPowerups = {
      three_line_elimination: 0,
      plus_three_balls: 0
    };
    this._pendingStartGameTemporaryPowerupCosts = {};
    this._startGameTemporaryPowerupsCommitted = false;
    this._threeLineEliminationInProgress = false;
    this._powerTipsViewPrefab = null;
    this._powerTipsViewNode = null;
    this._pendingPowerTipsRecovery = null;
    this.specialIntroduceStore = new SpecialIntroduceStore();
    this._specialIntroduceViewPrefab = null;
    this._specialIntroduceViewNode = null;
    this._specialIntroduceViewController = null;
    this._specialIntroduceQueue = [];
    this._specialIntroduceQueuedKeys = {};
    this._specialIntroduceCurrentKey = "";
    this._specialIntroduceViewActive = false;
    this._specialIntroduceOpening = false;
    this._specialIntroducePausedTimer = false;
    this._shopViewPrefab = null;
    this._shopViewNode = null;
    this._shopViewController = null;
    this._dailyTaskViewPrefab = null;
    this._dailyTaskViewNode = null;
    this._dailyTaskViewController = null;
    this._buyViewPrefab = null;
    this._buyViewNode = null;
    this._buyViewController = null;
    this._buyViewSkuId = "";
    this._buyViewContext = null;
    this.dailySignInConfig = clone(DailySignInConfig);
    this.signInStore = new SignInStore({
      cycleLength: this.dailySignInConfig.cycleLength,
      autoPopupOnFirstLogin: this.dailySignInConfig.autoPopupOnFirstLogin,
      autoPopupUserDefault: this.dailySignInConfig.autoPopupUserDefault
    });
    this.signInState = this.signInStore.load();
    this.signInStore.save(this.signInState);
    this.newGiftStore = new NewGiftStore();
    this.newGiftState = this.newGiftStore.load();
    this.newGiftStore.save(this.newGiftState);
    this.routeConfigStore = new RouteConfigStore();
    this.routeConfig = this.routeConfigStore.load();
    this.adRewardQuotaStore = new AdRewardQuotaStore({
      rules: {
        lose_next_round: {
          dailyLimit: requireNonNegativeInteger(this.loseAdDailyLimit, "loseAdDailyLimit"),
          cooldownSec: requireNonNegativeInteger(this.adRewardCooldownSeconds, "adRewardCooldownSeconds")
        },
        inventory_refill: {
          dailyLimit: requireNonNegativeInteger(this.inventoryAdDailyLimit, "inventoryAdDailyLimit"),
          cooldownSec: requireNonNegativeInteger(this.adRewardCooldownSeconds, "adRewardCooldownSeconds")
        },
        stamina_refill: {
          dailyLimit: requireNonNegativeInteger(this.staminaAdDailyLimit, "staminaAdDailyLimit"),
          cooldownSec: requireNonNegativeInteger(this.adRewardCooldownSeconds, "adRewardCooldownSeconds")
        }
      }
    });
    this.adService = new AdService({
      adUnitId: this.rewardedVideoAdUnitId,
      interstitialAdUnitId: this.interstitialAdUnitId,
      logger: Logger,
      mockEnabled: this.enableMockRewardedAdOnUnsupported === true,
      hostedShareBehaviorEnabled: true
    });
    this.nativeTemplateAdAdapter = new WechatNativeTemplateAdAdapter({
      logger: Logger
    });
    this.levelSelectNativeTemplateAdAdapter = this.nativeTemplateAdAdapter;
    this.startGameNativeTemplateAdAdapter = new WechatNativeTemplateAdAdapter({
      logger: Logger
    });
    this._settingViewPrefab = null;
    this._settingViewNode = null;
    this._awardViewPrefab = null;
    this._awardViewNode = null;
    this._awardItemIconSpriteFrameCache = {};
    this._signInViewPrefab = null;
    this._signInViewNode = null;
    this._signInButtonSpriteFrames = null;
    this._signInButtonSpriteLoadPromise = null;
    this._signInIconSpriteFrameCache = {};
    this._signInAdClaimInProgress = false;
    this.leaderboardStore = null;
    this._rankingViewPrefab = null;
    this._rankingViewNode = null;
    this._rankingViewController = null;
    this._worldLeaderboardUserProfile = null;
    this._lastWorldLeaderboardSubmitError = null;
    this._gameCircleWelfareViewPrefab = null;
    this._gameCircleWelfareViewNode = null;
    this._gameCircleWelfareViewController = null;
    this._gameCircleEntrySpriteFrame = null;
    this._gameCircleEntrySpriteFramePromise = null;
    this._pendingGameCircleWelfareRefreshOnShow = false;
    this._gameCircleWelfareReturnShowHandler = null;
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
    this.networkLoadingOverlay = new NetworkLoadingOverlay({
      rootNode: this.node,
      timeoutMs: requireNonNegativeInteger(this.networkLoadingTimeoutMs, "networkLoadingTimeoutMs"),
      zIndex: 800
    });
    this.wechatShareService = new WechatShareService({
      logger: Logger,
      shareConfig: {
        title: this.shareTitle,
        imageUrl: this.shareImageUrl,
        query: this.shareQuery
      }
    });
    this.friendGiftService = new FriendGiftService({
      cloudEnvId: this.friendGiftCloudEnvId
    });
    this._bindFriendGiftEnterClaim();
    this.worldLeaderboardService = new WorldLeaderboardService({
      cloudEnvId: this.worldLeaderboardCloudEnvId,
      functionName: this.worldLeaderboardCloudFunctionName,
      limit: requireNonNegativeInteger(this.worldLeaderboardLimit, "worldLeaderboardLimit")
    });
    this._worldLeaderboardUserProfile = this.worldLeaderboardService.loadCachedUserProfile();
    if (this.enablePlayerCloudProfile === true) {
      this.playerCloudProfileService = new PlayerCloudProfileService({
        cloudEnvId: this.playerProfileCloudEnvId,
        functionName: this.playerProfileCloudFunctionName,
        syncDebounceMs: requireNonNegativeInteger(this.playerProfileCloudSyncDebounceMs, "playerProfileCloudSyncDebounceMs"),
        logger: Logger
      });
    }
    this._wechatShareMenuPromise = this._initializeWechatShare();

    this._createStatusOverlay();
    this._createDropTestButton();
    this._createRouteEditorButtons();
    this._setStatus("Bootstrapping core modules...");

    this.poolManager = new PoolManager();
    this.levelManager = new LevelManager();
    this.gameManager = null;
    this.levelRenderer = null;
    this._bindInput();

    this._beginStartupBundlePrefetch();

    if (RuntimeModeConfig.exposeDebugHandle === true && typeof window !== "undefined") {
      window["__bubbleDebug"] = {
        bootstrap: this,
        poolManager: this.poolManager,
        levelManager: this.levelManager,
        gameManager: this.gameManager,
        levelRenderer: this.levelRenderer,
        audioManager: this.audioManager,
        gameCircleWelfareService: this.gameCircleWelfareService,
        playerCloudProfileService: this.playerCloudProfileService,
        levelAttemptStatsStore: this.levelAttemptStatsStore,
        routeConfigStore: this.routeConfigStore,
        routeEditor: {
          getState: function () {
            return clone(this._routeEditorState);
          }.bind(this),
          save: this._onRouteEditorSaveTap.bind(this),
          toggle: this._onRouteEditorToggleTap.bind(this)
        },
        logAssetStats: function (context) {
          this._logAssetManagerStats(context);
        }.bind(this)
      };
    }
  },

  _ensureGameplayKernel: function () {
    this._cancelGameplayBundleIdleRelease();
    if (this.gameManager && this.levelRenderer) {
      return Promise.resolve();
    }
    if (this._gameplayKernelPromise) {
      return this._gameplayKernelPromise;
    }

    this._gameplayKernelPromise = BundleLoader.ensureGameplayBundleLoaded().then(function () {
      if (this.gameManager && this.levelRenderer) {
        return null;
      }

      var GameManager = require("../core/GameManager");
      var LevelRenderer = require("../render/LevelRenderer");

      this.gameManager = new GameManager({
        poolManager: this.poolManager,
        levelManager: this.levelManager
      });
      this.levelRenderer = new LevelRenderer(this.node);
      this.levelRenderer.setFairyAssistSystem(this.gameManager.systems.fairyAssistSystem);
      this.levelRenderer.setFallingMarbleSystem(this.gameManager.systems.fallingMarbleSystem);
      this.levelRenderer.setLoseAdPresentation({
        showVideoIcon: this._hasRewardedVideoAdConfig()
      });
      this.levelRenderer.setLoseCoinPresentation({
        cost: Shared.LOSE_COIN_REVIVE_COST,
        getCoinCount: this._getCurrentCoins.bind(this)
      });
      this.levelRenderer.setWinActionHandlers({
        onNextLevel: this._onNextLevelTap.bind(this),
        onRetryLevel: this._restartCurrentLevel.bind(this)
      });
      this.levelRenderer.setLoseActionHandlers({
        onRetryLevel: this._restartCurrentLevel.bind(this),
        onBackLevel: this._onBackToLevelTap.bind(this),
        onWatchAd: this._onLoseWatchAdTap.bind(this),
        onCoinRevive: this._onLoseCoinReviveTap.bind(this)
      });
      this.levelRenderer.setPauseActionHandlers({
        onContinue: this._continuePausedLevel.bind(this),
        onRetryLevel: this._retryPausedLevel.bind(this),
        onExitLevel: this._exitPausedLevel.bind(this)
      });
      this.levelRenderer.setResultViewLifecycleHandlers({
        onWinViewShow: this._showWinNativeTemplateAd.bind(this),
        onWinViewHide: this._hideWinNativeTemplateAd.bind(this),
        onLoseViewShow: this._showLoseNativeTemplateAd.bind(this),
        onLoseViewHide: this._hideLoseNativeTemplateAd.bind(this)
      });
      this.levelRenderer.setGameplayActionHandlers({
        onOpenPause: this._openPauseView.bind(this),
        onOpenSettings: this._onGameplaySettingTap.bind(this),
        onOpenPropDescription: this._openPropDescriptionView.bind(this),
        onClosePropDescription: this._closePropDescriptionView.bind(this),
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
        }.bind(this),
        onUseThreeLineElimination: function () {
          this._onUseThreeLineEliminationTap();
        }.bind(this),
        onUsePlusThreeBalls: function () {
          this._onUsePlusThreeBallsTap();
        }.bind(this),
        onSelectRainbowColor: function (colorCode) {
          this._onSelectRainbowColorTap(colorCode);
        }.bind(this),
        onRecoverInventoryByAd: function (powerupType) {
          this._playSfx("uiClick");
          this._tryRecoverInventoryByAd(powerupType);
        }.bind(this),
        onRecoverAdRunPowerupByAd: function (powerupType) {
          this._playSfx("uiClick");
          this._tryRecoverAdRunPowerupByAd(powerupType);
        }.bind(this)
      });
      this.gameManager.bootstrap();
      return null;
    }.bind(this)).catch(function (error) {
      this._gameplayKernelPromise = null;
      throw error;
    }.bind(this)).then(function (result) {
      this._gameplayKernelPromise = null;
      return result;
    }.bind(this));

    return this._gameplayKernelPromise;
  }
};
