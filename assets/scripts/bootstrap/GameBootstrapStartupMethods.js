"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var LoadingViewController = Shared.LoadingViewController;
var ShopStateService = Shared.ShopStateService;
var StrictStorage = require("../utils/StrictStorage");
var STARTUP_BUNDLE_PROGRESS_SPAN = 0.75;
var STARTUP_PREFAB_PROGRESS_BASE = 0.75;
var STARTUP_PREFAB_PROGRESS_SPAN = 0.25;
var STARTUP_SUBPACKAGE_PHASE_WEIGHT = 0.9;
var STARTUP_BUNDLE_PHASE_WEIGHT = 0.1;
var STARTUP_BUNDLE_WEIGHTS = {
  map: 1
};
var STARTUP_BUNDLE_STAGE_LABELS = {
  "map:subpackage": "下载地图资源...",
  "map:bundle": "加载地图资源..."
};

function isWechatGameRuntime() {
  return !!(
    typeof cc !== "undefined" &&
    cc &&
    cc.sys &&
    typeof cc.sys.platform !== "undefined" &&
    typeof cc.sys.WECHAT_GAME !== "undefined" &&
    cc.sys.platform === cc.sys.WECHAT_GAME
  );
}

function requireStartupTask(task, index) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new Error("Startup task " + index + " must be an object.");
  }
  if (typeof task.id !== "string" || task.id.trim().length === 0) {
    throw new Error("Startup task " + index + " requires id.");
  }
  if (typeof task.stage !== "string" || task.stage.trim().length === 0) {
    throw new Error("Startup task `" + task.id + "` requires stage.");
  }
  if (typeof task.run !== "function") {
    throw new Error("Startup task `" + task.id + "` requires run function.");
  }
  return task;
}

function setStartupStage(host, stage) {
  if (host._loadingViewController && host._loadingViewController.setStage) {
    host._loadingViewController.setStage(stage);
  }
  host._setStatus(stage);
}

function normalizeStartupProgressRange(progressRange) {
  if (!progressRange || typeof progressRange !== "object" || Array.isArray(progressRange)) {
    return {
      base: 0,
      span: 1
    };
  }

  var base = Number(progressRange.base);
  var span = Number(progressRange.span);
  if (!Number.isFinite(base) || base < 0 || base > 1) {
    throw new Error("Startup progress range base must be a number between 0 and 1.");
  }
  if (!Number.isFinite(span) || span <= 0 || base + span > 1.000001) {
    throw new Error("Startup progress range span must keep base + span within [0, 1].");
  }

  return {
    base: base,
    span: span
  };
}

function runParallelStartupTasks(host, tasks, initialStage, progressRange) {
  var taskList = tasks.map(requireStartupTask);
  if (taskList.length === 0) {
    throw new Error("Startup task list must not be empty.");
  }

  var range = normalizeStartupProgressRange(progressRange);
  var totalWeight = taskList.reduce(function (sum, task) {
    return sum + Math.max(0, Number(task.weight) || 0);
  }, 0);
  var doneWeight = 0;

  setStartupStage(host, initialStage);
  if (host._loadingViewController && host._loadingViewController.setProgress) {
    host._loadingViewController.setProgress(range.base, true);
  }

  return Promise.all(taskList.map(function (task) {
    return Promise.resolve().then(function () {
      return task.run();
    }).then(function () {
      doneWeight += Math.max(0, Number(task.weight) || 0);
      if (host._loadingViewController && host._loadingViewController.setProgress) {
        var ratio = totalWeight > 0 ? (doneWeight / totalWeight) : 1;
        host._loadingViewController.setProgress(range.base + ratio * range.span, false);
      }
      return {
        id: task.id
      };
    });
  })).then(function () {
    return null;
  });
}

function requireStartupBundleProgressEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Startup bundle progress event must be an object.");
  }
  if (typeof event.bundleName !== "string" || event.bundleName.length === 0) {
    throw new Error("Startup bundle progress event requires bundleName.");
  }
  if (event.phase !== "subpackage" && event.phase !== "bundle") {
    throw new Error("Startup bundle progress event phase is invalid: " + event.phase);
  }
  if (typeof event.progress !== "number" || !Number.isFinite(event.progress) || event.progress < 0 || event.progress > 1) {
    throw new Error("Startup bundle progress event progress must be in [0, 1].");
  }
  return event;
}

function createStartupBundleProgressReporter(host) {
  var progressByBundle = {
    map: {
      subpackage: 0,
      bundle: 0
    }
  };
  var bundleNames = Object.keys(STARTUP_BUNDLE_WEIGHTS);
  var totalWeight = bundleNames.reduce(function (sum, bundleName) {
    var weight = STARTUP_BUNDLE_WEIGHTS[bundleName];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      throw new Error("Startup bundle weight must be positive: " + bundleName);
    }
    return sum + weight;
  }, 0);

  return function (event) {
    var progressEvent = requireStartupBundleProgressEvent(event);
    if (!progressByBundle[progressEvent.bundleName]) {
      throw new Error("Unsupported startup bundle progress: " + progressEvent.bundleName);
    }

    progressByBundle[progressEvent.bundleName][progressEvent.phase] = progressEvent.progress;
    var weightedDone = bundleNames.reduce(function (sum, bundleName) {
      var bundleProgress = progressByBundle[bundleName];
      var phaseProgress =
        bundleProgress.subpackage * STARTUP_SUBPACKAGE_PHASE_WEIGHT +
        bundleProgress.bundle * STARTUP_BUNDLE_PHASE_WEIGHT;
      return sum + phaseProgress * STARTUP_BUNDLE_WEIGHTS[bundleName];
    }, 0);

    var nextProgress = weightedDone / totalWeight * STARTUP_BUNDLE_PROGRESS_SPAN;
    if (host._loadingViewController && host._loadingViewController.setProgress) {
      host._loadingViewController.setProgress(nextProgress, false);
    }

    var stageKey = progressEvent.bundleName + ":" + progressEvent.phase;
    var stageLabel = STARTUP_BUNDLE_STAGE_LABELS[stageKey];
    if (stageLabel) {
      setStartupStage(host, stageLabel);
    }
  };
}

module.exports = {
  start: function () {
    this._applyViewportLayout();
    this._runStartupLoadingFlow();
  },

  _runStartupLoadingFlow: function () {
    if (this._startupFlowPromise) {
      return this._startupFlowPromise;
    }

    if (!this.enableStartupLoadingView) {
      this._startupFlowPromise = this._waitForNextRenderedFrame().then(function () {
        return this._runWeightedStartupTasks();
      }.bind(this)).then(function () {
        this._initializePostLoadingServices();
        return this._showLevelSelectView();
      }.bind(this)).then(function () {
        return this._waitForNextRenderedFrame();
      }.bind(this)).then(function () {
        return this._waitForNextRenderedFrame();
      }.bind(this)).then(function () {
        return this._waitForNextRenderedFrame();
      }.bind(this)).then(function () {
        this._scheduleBackgroundRemoteLevelPackPreload();
        this._scheduleDeferredUiBundleWarmup();
        this._scheduleDeferredFriendStaminaGiftClaim();
        this._scheduleDeferredPlayerCloudProfileSync();
      }.bind(this)).catch(function (error) {
        Logger.error("Startup resource loading failed", error && error.stack ? error.stack : error);
        this._setStatus("Startup resource loading failed. Check console logs.");
        throw error;
      }.bind(this));
      return this._startupFlowPromise;
    }

    this._startupFlowPromise = this._ensureLoadingViewController().then(function (controller) {
      this._setStatus("Loading startup resources...");
      controller.setProgress(0, true);
      controller.setStage("启动准备中...");
      return controller.playIn();
    }.bind(this)).then(function () {
      return this._waitForNextRenderedFrame();
    }.bind(this)).then(function () {
      return this._runWeightedStartupTasks();
    }.bind(this)).then(function () {
      this._initializePostLoadingServices();
    }.bind(this)).then(function () {
      if (!this._loadingViewController) {
        return;
      }
      this._loadingViewController.setProgress(1, true);
      this._loadingViewController.setStage("准备进入关卡...");
      var loadingViewController = this._loadingViewController;
      return loadingViewController.waitForProgressComplete().then(function () {
        return loadingViewController.playOut();
      }).then(function () {
        if (typeof loadingViewController.disposeAndReleaseAssets !== "function") {
          throw new Error("Startup LoadingView requires disposeAndReleaseAssets.");
        }
        loadingViewController.disposeAndReleaseAssets();
        this._loadingViewController = null;
        this._loadingViewNode = null;
      }.bind(this));
    }.bind(this)).then(function () {
      return this._showLevelSelectView();
    }.bind(this)).then(function () {
      return this._waitForNextRenderedFrame();
    }.bind(this)).then(function () {
      return this._waitForNextRenderedFrame();
    }.bind(this)).then(function () {
      return this._waitForNextRenderedFrame();
    }.bind(this)).then(function () {
      this._scheduleBackgroundRemoteLevelPackPreload();
      this._scheduleDeferredUiBundleWarmup();
      this._scheduleDeferredFriendStaminaGiftClaim();
      this._scheduleDeferredPlayerCloudProfileSync();
    }.bind(this)).catch(function (error) {
      Logger.error("Startup loading flow failed", error && error.stack ? error.stack : error);
      this._setStatus("Startup resource loading failed. Check console logs.");
      if (this._loadingViewController && this._loadingViewController.setStage) {
        this._loadingViewController.setStage("启动资源加载失败");
      }
      throw error;
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
    var host = this;

    setStartupStage(host, "准备启动分包...");
    if (host._loadingViewController && host._loadingViewController.setProgress) {
      host._loadingViewController.setProgress(0, true);
    }

    return host._beginStartupBundlePrefetch({
      onProgress: createStartupBundleProgressReporter(host)
    }).then(function () {
      if (host._loadingViewController && host._loadingViewController.setProgress) {
        host._loadingViewController.setProgress(STARTUP_PREFAB_PROGRESS_BASE, false);
      }

      return runParallelStartupTasks(host, [
        {
          id: "level_select_prefabs",
          stage: "加载选关界面...",
          weight: 1,
          run: function () {
            return host._preloadStartupPrefabs();
          }
        },
        {
          id: "background_music",
          stage: "加载背景音乐...",
          weight: 1,
          run: function () {
            return host._preloadStartupAudio();
          }
        }
      ], "加载选关界面和背景音乐...", {
        base: STARTUP_PREFAB_PROGRESS_BASE,
        span: STARTUP_PREFAB_PROGRESS_SPAN
      });
    }).then(function () {
      if (host._loadingViewController && host._loadingViewController.setProgress) {
        host._loadingViewController.setProgress(1, false);
      }
      setStartupStage(host, "准备进入关卡...");
      return null;
    });
  },

  _beginStartupBundlePrefetch: function (options) {
    if (this._startupBundlePrefetchPromise) {
      return this._startupBundlePrefetchPromise;
    }

    this._startupBundlePrefetchPromise = BundleLoader.ensureNamedBundleLoaded("map", options);

    return this._startupBundlePrefetchPromise;
  },

  _scheduleDeferredUiBundleWarmup: function () {
    if (this._deferredUiBundleWarmupPromise) {
      return this._deferredUiBundleWarmupPromise;
    }
    if (!BundleLoader || typeof BundleLoader.ensureNamedBundleLoaded !== "function") {
      throw new Error("Deferred UI bundle warmup requires BundleLoader.ensureNamedBundleLoaded.");
    }

    this._deferredUiBundleWarmupPromise = BundleLoader.ensureNamedBundleLoaded("ui").then(function (bundle) {
      if (!bundle || typeof bundle.load !== "function") {
        throw new Error("Deferred UI bundle warmup loaded invalid ui bundle.");
      }
      Logger.info("Deferred UI bundle warmup completed.");
      return bundle;
    }).catch(function (error) {
      Logger.error("Deferred UI bundle warmup failed", error && error.stack ? error.stack : error);
      this._setStatus("UI资源加载失败");
      if (this.tipsPresenter && typeof this.tipsPresenter.showText === "function") {
        this.tipsPresenter.showText("UI资源加载失败");
      }
      this._deferredUiBundleWarmupPromise = null;
      throw error;
    }.bind(this));

    return this._deferredUiBundleWarmupPromise;
  },

  _scheduleBackgroundRemoteLevelPackPreload: function () {
    if (this._backgroundRemoteLevelPackPreloadPromise) {
      return this._backgroundRemoteLevelPackPreloadPromise;
    }
    if (!this.levelManager || typeof this.levelManager.preloadAllRemotePacks !== "function") {
      throw new Error("Background remote level pack preload requires LevelManager.preloadAllRemotePacks.");
    }
    if (!this.levelProgress || !Number.isInteger(this.levelProgress.highestUnlockedLevel) || this.levelProgress.highestUnlockedLevel <= 0) {
      throw new Error("Background remote level pack preload requires positive highestUnlockedLevel.");
    }

    this._backgroundRemoteLevelPackPreloadError = null;
    this._backgroundRemoteLevelPackPreloadPromise = this.levelManager.preloadAllRemotePacks(
      this.levelProgress.highestUnlockedLevel
    ).then(function (result) {
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("Background remote level pack preload result is invalid.");
      }
      if (result.preloaded === true) {
        Logger.info("Background remote level pack preload completed", {
          priorityLevelId: result.priorityLevelId,
          priorityPackId: result.priorityPackId,
          packCount: result.packCount
        });
      }
      return result;
    });

    this._backgroundRemoteLevelPackPreloadPromise.catch(function (error) {
      this._backgroundRemoteLevelPackPreloadError = error;
      this._backgroundRemoteLevelPackPreloadPromise = null;
      Logger.error("Background remote level pack preload failed", error && error.stack ? error.stack : error);
      this._setStatus("远端关卡后台下载失败");
      if (this.tipsPresenter && typeof this.tipsPresenter.showText === "function") {
        this.tipsPresenter.showText("远端关卡后台下载失败");
      }
    }.bind(this));

    return this._backgroundRemoteLevelPackPreloadPromise;
  },

  _waitForNextRenderedFrame: function () {
    if (
      typeof cc === "undefined" ||
      !cc ||
      !cc.director ||
      typeof cc.director.once !== "function" ||
      !cc.Director ||
      typeof cc.Director.EVENT_AFTER_DRAW !== "string"
    ) {
      return Promise.reject(new Error("Rendered-frame wait requires cc.Director.EVENT_AFTER_DRAW."));
    }
    return new Promise(function (resolve) {
      cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve);
    });
  },

  _scheduleDeferredFriendStaminaGiftClaim: function () {
    if (this._deferredFriendStaminaGiftClaimPromise) {
      return this._deferredFriendStaminaGiftClaimPromise;
    }

    this._deferredFriendStaminaGiftClaimPromise = Promise.resolve().then(function () {
      setStartupStage(this, "检查好友体力赠送...");
      return this._claimPendingFriendStaminaGiftFromLaunchOptions();
    }.bind(this)).catch(function (error) {
      this._deferredFriendStaminaGiftClaimPromise = null;
      throw error;
    }.bind(this));

    return this._deferredFriendStaminaGiftClaimPromise;
  },

  _scheduleDeferredPlayerCloudProfileSync: function () {
    if (this._deferredPlayerCloudProfileSyncPromise) {
      return this._deferredPlayerCloudProfileSyncPromise;
    }

    this._deferredPlayerCloudProfileSyncPromise = this._syncPlayerProfileFromCloud().then(function (result) {
      if (result && result.source === "cloud" && result.applied === true) {
        StrictStorage.suspendWriteObserver(function () {
          this._refreshLevelSelectAfterCloudProfileSync();
        }.bind(this));
      }
      return result;
    }.bind(this)).catch(function (error) {
      Logger.error(
        "Deferred player cloud profile sync failed",
        error && error.stack ? error.stack : error
      );
      this._setStatus("玩家云端信息同步失败");
      if (this.tipsPresenter && typeof this.tipsPresenter.showText === "function") {
        this.tipsPresenter.showText("玩家云端信息同步失败");
      }
      this._deferredPlayerCloudProfileSyncPromise = null;
      throw error;
    }.bind(this));

    return this._deferredPlayerCloudProfileSyncPromise;
  },

  _refreshLevelSelectAfterCloudProfileSync: function () {
    if (!this.isSelectingLevel) {
      return;
    }

    this._refreshLevelProgress();
    this._refreshPlayerResources();
    if (typeof this._refreshPlayerInventory === "function") {
      this._refreshPlayerInventory();
    }
    if (typeof this._refreshSelectedPowerups === "function") {
      this._refreshSelectedPowerups();
    }
    this._refreshSignInState();
    this._updateSignInEntryState();
    if (typeof this._updateDailyTaskEntryState === "function") {
      this._updateDailyTaskEntryState();
    }
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    this._updateStarChestEntryState();
    this._updateNewGiftEntryState();
    if (typeof this._ensureGameCircleEntryButton === "function") {
      this._ensureGameCircleEntryButton();
    }
  },

  _syncPlayerProfileFromCloud: function () {
    if (this.enablePlayerCloudProfile !== true) {
      return Promise.resolve(null);
    }
    if (!isWechatGameRuntime()) {
      Logger.info("Skip player cloud profile sync outside WeChat game runtime.");
      return Promise.resolve({
        source: "local",
        updatedAt: 0,
        skipped: true
      });
    }
    if (!this.playerCloudProfileService || typeof this.playerCloudProfileService.syncFromCloudOrUploadLocal !== "function") {
      throw new Error("Player cloud profile sync requires PlayerCloudProfileService.");
    }
    return this.playerCloudProfileService.syncFromCloudOrUploadLocal({
      shouldApplyCloudProfile: function () {
        return this.isSelectingLevel === true;
      }.bind(this)
    }).then(function (result) {
      if (!result || typeof result !== "object") {
        throw new Error("Player cloud profile sync result is required.");
      }
      if (result.source === "cloud") {
        if (result.applied === true) {
          this._reloadPlayerInfoFromStores();
        } else if (result.applied !== false) {
          throw new Error("Player cloud profile cloud sync requires applied flag.");
        }
      } else if (result.source !== "local") {
        throw new Error("Unsupported player cloud profile sync source: " + result.source);
      }
      this.playerCloudProfileService.installStorageObserver();
      return result;
    }.bind(this));
  },

  _reloadPlayerInfoFromStores: function () {
    if (!this.levelProgressStore || typeof this.levelProgressStore.load !== "function") {
      throw new Error("Reload player profile requires LevelProgressStore.load.");
    }
    if (!this.levelAttemptStatsStore || typeof this.levelAttemptStatsStore.load !== "function") {
      throw new Error("Reload player profile requires LevelAttemptStatsStore.load.");
    }
    if (!this.playerResourceStore || typeof this.playerResourceStore.load !== "function") {
      throw new Error("Reload player profile requires PlayerResourceStore.load.");
    }
    if (!this.assistSpiritStore || typeof this.assistSpiritStore.loadWithRescueProgress !== "function") {
      throw new Error("Reload player profile requires AssistSpiritStore.loadWithRescueProgress.");
    }
    if (!this.spiritShopStore || typeof this.spiritShopStore.load !== "function") {
      throw new Error("Reload player profile requires SpiritShopStore.load.");
    }
    if (!this.staminaRecoveryStore || typeof this.staminaRecoveryStore.load !== "function") {
      throw new Error("Reload player profile requires StaminaRecoveryStore.load.");
    }
    if (!this.dailyTaskStore || typeof this.dailyTaskStore.load !== "function") {
      throw new Error("Reload player profile requires DailyTaskStore.load.");
    }
    if (!this.inventoryStore || typeof this.inventoryStore.load !== "function") {
      throw new Error("Reload player profile requires InventoryStore.load.");
    }
    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.load !== "function") {
      throw new Error("Reload player profile requires SelectedPowerupsStore.load.");
    }
    if (!this.signInStore || typeof this.signInStore.load !== "function") {
      throw new Error("Reload player profile requires SignInStore.load.");
    }
    if (!this.newGiftStore || typeof this.newGiftStore.load !== "function") {
      throw new Error("Reload player profile requires NewGiftStore.load.");
    }
    if (!this.starChestStore || typeof this.starChestStore.load !== "function") {
      throw new Error("Reload player profile requires StarChestStore.load.");
    }
    if (!this.gameCircleWelfareStore || typeof this.gameCircleWelfareStore.load !== "function") {
      throw new Error("Reload player profile requires GameCircleWelfareStore.load.");
    }
    if (!this.shopStateStore || typeof this.shopStateStore.load !== "function") {
      throw new Error("Reload player profile requires ShopStateStore.load.");
    }
    if (!this.shopStateService || typeof this.shopStateService.ensureDailyReset !== "function") {
      throw new Error("Reload player profile requires ShopStateService.ensureDailyReset.");
    }
    if (typeof this.shopStateService._buildEmptySkuCounts !== "function") {
      throw new Error("Reload player profile requires ShopStateService._buildEmptySkuCounts.");
    }

    var now = new Date();
    this.levelProgress = this.levelProgressStore.load();
    this.levelAttemptStats = this.levelAttemptStatsStore.load();
    this.staminaRecoveryState = this.staminaRecoveryStore.load();
    this.playerResources = this.playerResourceStore.load(now);
    this.assistSpiritState = this.assistSpiritStore.loadWithRescueProgress(
      this.levelProgress.completedLevels
    );
    this.spiritShopStore.load(now);
    this.dailyTaskState = this.dailyTaskStore.load(now);
    this.playerInventory = this.inventoryStore.load();
    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    this.signInState = this.signInStore.load();
    this.newGiftState = this.newGiftStore.load();
    this.starChestStore.load();
    this.gameCircleWelfareStore.load(now);
    this.shopStateService.state = this.shopStateStore.load(
      ShopStateService.toDateKey(now),
      this.shopStateService._buildEmptySkuCounts()
    );
    this.shopStateService.ensureDailyReset(now);
  },

  _preloadStartupPrefabs: function () {
    if (this._startupPrefabWarmupPromise) {
      return this._startupPrefabWarmupPromise;
    }

    this._startupPrefabWarmupPromise = this._ensureLevelSelectPrefabs().then(function () {
      return null;
    }).catch(function (error) {
      this._startupPrefabWarmupPromise = null;
      throw error;
    }.bind(this));

    return this._startupPrefabWarmupPromise;
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
  }
};
