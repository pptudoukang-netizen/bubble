"use strict";

var Shared = require("./GameBootstrapShared");
var DebugFlags = Shared.DebugFlags;
var Logger = Shared.Logger;
var PoolManager = Shared.PoolManager;
var LevelProgressStore = Shared.LevelProgressStore;
var PlayerResourceStore = Shared.PlayerResourceStore;
var InventoryStore = Shared.InventoryStore;
var StarChestStore = Shared.StarChestStore;
var ShopStateStore = Shared.ShopStateStore;
var GameCircleWelfareStore = Shared.GameCircleWelfareStore;
var SelectedPowerupsStore = Shared.SelectedPowerupsStore;
var SignInStore = Shared.SignInStore;
var RouteConfigStore = Shared.RouteConfigStore;
var AudioManager = Shared.AudioManager;
var DailySignInConfig = Shared.DailySignInConfig;
var StarChestConfig = Shared.StarChestConfig;
var GameCircleWelfareConfig = Shared.GameCircleWelfareConfig;
var ShopGoodsConfig = Shared.ShopGoodsConfig;
var ShopRulesConfig = Shared.ShopRulesConfig;
var LevelManager = Shared.LevelManager;
var RuntimeModeConfig = Shared.RuntimeModeConfig;
var GameManager = Shared.GameManager;
var ResourceGateway = Shared.ResourceGateway;
var LevelRenderer = Shared.LevelRenderer;
var TipsPresenter = Shared.TipsPresenter;
var StarChestRewardService = Shared.StarChestRewardService;
var StarChestService = Shared.StarChestService;
var GameCircleButtonAdapter = Shared.GameCircleButtonAdapter;
var GameCircleWelfareService = Shared.GameCircleWelfareService;
var ShopConfigService = Shared.ShopConfigService;
var ShopStateService = Shared.ShopStateService;
var ShopPurchaseService = Shared.ShopPurchaseService;
var AdService = Shared.AdService;
var TelemetryService = Shared.TelemetryService;
var AdRewardQuotaStore = Shared.AdRewardQuotaStore;
var clone = Shared.clone;
var requireNonNegativeInteger = Shared.requireNonNegativeInteger;

module.exports = {
  onLoad: function () {
    this._applyRuntimeModeConfig();
    this._applyViewportLayout();

    DebugFlags.setAll({
      logs: RuntimeModeConfig.isRelease() !== true,
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
    this._pendingLevelEntry = null;
    this.telemetryService = new TelemetryService({
      logger: Logger
    });
    this.levelProgressStore = new LevelProgressStore();
    this.levelProgress = this.resetLevelProgressOnStart
      ? this.levelProgressStore.reset()
      : this.levelProgressStore.load();
    this.playerResourceStore = new PlayerResourceStore({
      dailyStamina: 10
    });
    this.playerResources = this.playerResourceStore.load();
    if (RuntimeModeConfig.enableInspectorOverrides === true) {
      var inspectorStamina = Math.floor(Number(this.inspectorStaminaValue));
      if (!Number.isInteger(inspectorStamina) || inspectorStamina < 0) {
        throw new Error("inspectorStaminaValue must be a non-negative integer when inspector overrides are enabled.");
      }
      this.playerResources.stamina = inspectorStamina;
      this.playerResourceStore.save(this.playerResources);
    }
    this.inventoryStore = new InventoryStore();
    this.playerInventory = this.inventoryStore.load();
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
    this._inventoryViewPrefab = null;
    this._inventoryViewNode = null;
    this._inventoryViewController = null;
    this._inventoryViewReadOnly = true;
    this._shopViewPrefab = null;
    this._shopViewNode = null;
    this._shopViewController = null;
    this._buyViewPrefab = null;
    this._buyViewNode = null;
    this._buyViewController = null;
    this._buyViewSkuId = "";
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
      logger: Logger,
      mockEnabled: this.enableMockRewardedAdOnUnsupported === true,
      hostedShareBehaviorEnabled: true
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
    this.levelRenderer.setLoseAdPresentation({
      showVideoIcon: this._hasRewardedVideoAdConfig()
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

    if (RuntimeModeConfig.exposeDebugHandle === true && typeof window !== "undefined") {
      window["__bubbleDebug"] = {
        bootstrap: this,
        poolManager: this.poolManager,
        levelManager: this.levelManager,
        gameManager: this.gameManager,
        levelRenderer: this.levelRenderer,
        audioManager: this.audioManager,
        gameCircleWelfareService: this.gameCircleWelfareService,
        routeConfigStore: this.routeConfigStore,
        routeEditor: {
          getState: function () {
            return clone(this._routeEditorState);
          }.bind(this),
          save: this._onRouteEditorSaveTap.bind(this),
          toggle: this._onRouteEditorToggleTap.bind(this)
        }
      };
    }
  }
};
