"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var BootstrapShared = require("./GameBootstrapShared");
var DebugFlags = Shared.DebugFlags;
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var LevelSelectPolicy = Shared.LevelSelectPolicy;
var LevelSelectView = Shared.LevelSelectView;
var LevelSelectFloatingMap = require("./LevelSelectFloatingMap");
var LevelSelectMemoryDiagnostics = require("../utils/LevelSelectMemoryDiagnostics");
var RandomChallengeRules = require("../config/RandomChallengeRules");
var LocalEditedLevelStore = require("../config/LocalEditedLevelStore");
var MapEditorLevelPicker = require("../editor/MapEditorLevelPicker");
var StarRatingPolicy = Shared.StarRatingPolicy;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;
var HIDDEN_UNLOCK_ALL_LEVELS_TAP_COUNT = 5;
var HIDDEN_UNLOCK_ALL_LEVELS_WINDOW_MS = 2000;
var HIDDEN_UNLOCK_ALL_LEVELS_STAMINA_VALUE = 100;
var HIDDEN_UNLOCK_ALL_LEVELS_COIN_VALUE = 5000;
var MAP_EDITOR_SCENE_PATH = "scens/editor";

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

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function resolveMaxAvailableLevelId(levelIds) {
  if (!Array.isArray(levelIds) || levelIds.length === 0) {
    throw new Error("Unlock all levels for test requires non-empty level ids.");
  }

  return levelIds.reduce(function (maxLevelId, levelId) {
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("Unlock all levels for test received invalid level id: " + levelId);
    }
    return Math.max(maxLevelId, levelId);
  }, 0);
}

function isAllLevelsTemporarilyUnlocked(host) {
  return !!(
    host &&
    (
      host.unlockAllLevelsForTest === true ||
      host._levelSelectHiddenUnlockAllActive === true
    )
  );
}

function getLocalEditedLevelStore(host) {
  if (!host || typeof host !== "object") {
    throw new Error("Local edited level store requires bootstrap host.");
  }
  if (!host._localEditedLevelStore) {
    host._localEditedLevelStore = new LocalEditedLevelStore();
  }
  if (typeof host._localEditedLevelStore.listLevelIds !== "function") {
    throw new Error("Local edited level store is invalid.");
  }
  return host._localEditedLevelStore;
}

function resolveWinSnapshotScore(snapshot) {
  if (!snapshot || snapshot.state !== "won") {
    throw new Error("Win score requires won runtime snapshot.");
  }
  if (!snapshot.winStats || typeof snapshot.winStats !== "object") {
    throw new Error("Win score requires snapshot.winStats.");
  }
  var score = Math.floor(Number(snapshot.winStats.totalScore));
  if (!Number.isInteger(score) || score < 0) {
    throw new Error("Win score must be a non-negative integer.");
  }
  return score;
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requirePositiveFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive finite number.");
  }
  return numberValue;
}

function resolveNativeTemplateAdWidgetTop(nativeHeightPx) {
  var heightPx = requirePositiveFiniteNumber(nativeHeightPx, "Native template ad height");
  var winSize = cc.winSize;
  var frameSize = cc.view && typeof cc.view.getFrameSize === "function"
    ? cc.view.getFrameSize()
    : null;
  if (!winSize || !frameSize || winSize.width <= 0 || winSize.height <= 0 || frameSize.width <= 0 || frameSize.height <= 0) {
    throw new Error("Invalid view size when resolving LevelView native template ad height.");
  }
  return heightPx / frameSize.height * winSize.height;
}

function normalizeOptionalPrepareLevelId(options) {
  if (!options || options.prepareLevelId === undefined) {
    return null;
  }

  var levelId = Math.floor(Number(options.prepareLevelId));
  if (!Number.isInteger(levelId) || levelId <= 0) {
    throw new Error("Level select prepareLevelId must be a positive integer.");
  }
  return levelId;
}

function getCurrentLevelClearRewardItems(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object" || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("Level clear rewards require current level config.");
  }
  if (levelConfig.level.clearRewardItems === undefined) {
    return [];
  }
  if (!Array.isArray(levelConfig.level.clearRewardItems)) {
    throw new Error("level.clearRewardItems must be an array.");
  }
  return levelConfig.level.clearRewardItems.map(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("level.clearRewardItems[" + index + "] must be object.");
    }
    if (item.id !== "coin" && item.id !== "stamina") {
      throw new Error("Unsupported level clear reward item id: " + item.id);
    }
    return {
      id: item.id,
      count: requirePositiveInteger(item.count, "level.clearRewardItems[" + index + "].count")
    };
  });
}

function resolveAwardedClearRewardItems(rewardItems, isFirstCompletion, collectionRewardCompleted) {
  if (!Array.isArray(rewardItems)) {
    throw new Error("Level clear reward items must be an array.");
  }
  if (typeof isFirstCompletion !== "boolean") {
    throw new Error("Level clear reward first-completion flag is required.");
  }
  if (typeof collectionRewardCompleted !== "boolean") {
    throw new Error("Level clear collection reward completion flag is required.");
  }

  return rewardItems.filter(function (item) {
    return item.id === "coin" || isFirstCompletion;
  }).map(function (item) {
    var count = item.count;
    if (item.id === "coin" && !isFirstCompletion) {
      count = Math.floor(item.count * 0.3);
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error("Repeat level clear coin reward must be a positive integer.");
      }
    }
    if (collectionRewardCompleted) {
      count *= 2;
    }
    return {
      id: item.id,
      count: count
    };
  });
}

function mergeRewardItemsById(rewardItems, description) {
  if (!Array.isArray(rewardItems)) {
    throw new Error(description + " reward items must be an array.");
  }

  var itemIds = [];
  var countsById = {};
  rewardItems.forEach(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(description + " reward item must be object at index " + index + ".");
    }
    if (item.id !== "coin" && item.id !== "stamina") {
      throw new Error(description + " unsupported reward item id: " + item.id);
    }
    var count = requirePositiveInteger(item.count, description + " reward item count: " + item.id);
    if (!Object.prototype.hasOwnProperty.call(countsById, item.id)) {
      countsById[item.id] = 0;
      itemIds.push(item.id);
    }
    countsById[item.id] += count;
  });

  return itemIds.map(function (itemId) {
    return {
      id: itemId,
      count: countsById[itemId]
    };
  });
}

function grantRewardItemsToPlayer(host, rewardItems, description) {
  if (!host || typeof host !== "object") {
    throw new Error(description + " requires GameBootstrap host.");
  }
  if (!Array.isArray(rewardItems)) {
    throw new Error(description + " reward items must be an array.");
  }
  if (!host.playerResourceStore || typeof host.playerResourceStore.save !== "function") {
    throw new Error(description + " requires PlayerResourceStore.save.");
  }
  var mergedRewardItems = mergeRewardItemsById(rewardItems, description);
  if (mergedRewardItems.length === 0) {
    return [];
  }

  host._refreshPlayerResources();
  var resources = host.playerResources;
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    throw new Error(description + " requires player resources.");
  }

  mergedRewardItems.forEach(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(description + " rewardItems[" + index + "] must be object.");
    }
    if (item.id === "coin") {
      resources.coins = requireNonNegativeInteger(resources.coins, "Player coins") + item.count;
      return;
    }
    if (item.id === "stamina") {
      resources.stamina = requireNonNegativeInteger(resources.stamina, "Player stamina") + item.count;
      return;
    }
    throw new Error(description + " unsupported reward item id: " + item.id);
  });

  host.playerResources = resources;
  host.playerResourceStore.save(host.playerResources);
  host._updateLevelSelectTopStatus();
  return clone(mergedRewardItems);
}

function isRandomChallengeContext(context) {
  return !!(context && context.mode === RandomChallengeRules.MODE);
}

function requireRandomChallengeContext(context) {
  if (!isRandomChallengeContext(context)) {
    throw new Error("Random challenge context is required.");
  }
  if (typeof context.seed !== "string" || context.seed.trim().length === 0) {
    throw new Error("Random challenge context requires seed.");
  }
  if (!Number.isInteger(context.difficultyTier) || context.difficultyTier <= 0) {
    throw new Error("Random challenge context requires difficultyTier.");
  }
  if (typeof context.configHash !== "string" || context.configHash.trim().length === 0) {
    throw new Error("Random challenge context requires configHash.");
  }
  return context;
}

function buildRandomChallengeDailyTaskPayload(context, snapshot, result) {
  var safeContext = requireRandomChallengeContext(context);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Random challenge daily task requires runtime snapshot.");
  }
  if (typeof snapshot.state !== "string" || snapshot.state.length === 0) {
    throw new Error("Random challenge daily task requires snapshot state.");
  }
  if (result !== "win" && result !== "lose") {
    throw new Error("Random challenge daily task result is invalid: " + result);
  }
  return {
    seed: safeContext.seed,
    difficultyTier: safeContext.difficultyTier,
    configHash: safeContext.configHash,
    result: result,
    state: snapshot.state
  };
}

module.exports = {
  _showLevelSelectView: function (options) {
    options = options || {};
    if (this.isRestarting) {
      return Promise.reject(new Error("Cannot show level select while restart is in progress."));
    }
    this._levelSelectHiddenUnlockTapCount = 0;
    this._levelSelectHiddenUnlockFirstTapAt = 0;
    this._recordCurrentAttemptQuit("return_to_level_select");
    if (!this.isSelectingLevel && this.levelRenderer) {
      if (typeof this.levelRenderer.prepareForLevelSelectReturn === "function") {
        this.levelRenderer.prepareForLevelSelectReturn();
      }
      this.levelRenderer.releaseLevelSpecificSpriteCache();
      this._scheduleGameplayBundleIdleRelease();
    }
    this.isGameplayPaused = false;
    this.isPropDescriptionViewOpen = false;
    if (DebugFlags.get("levelSelectMemory") === true) {
      LevelSelectMemoryDiagnostics.start(this.node);
    }
    LevelSelectMemoryDiagnostics.increment("levelSelect.show");

    var prepareLevelId = normalizeOptionalPrepareLevelId(options);
    var targetLevelId = Math.max(0, Math.floor(Number(options.targetLevelId) || 0));
    if (prepareLevelId !== null) {
      targetLevelId = prepareLevelId;
    }
    if (!targetLevelId && this.currentLevelConfig && this.currentLevelConfig.level) {
      targetLevelId = Math.max(1, Math.floor(Number(this.currentLevelConfig.level.levelId) || 0));
    }
    if (!targetLevelId && this._currentLevelId) {
      targetLevelId = Math.max(1, Math.floor(Number(this._currentLevelId) || 0));
    }

    this._persistRouteEditorIfDirty();
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideStartGameView === "function") {
      this._hideStartGameView();
    }
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }
    this._hideSpecialIntroduceView();
    this.isSelectingLevel = true;
    this.currentLevelConfig = null;
    if (this.levelRenderer && typeof this.levelRenderer.setGameplayLayersVisible === "function") {
      this.levelRenderer.setGameplayLayersVisible(false);
    }
    this._currentLevelId = targetLevelId > 0 ? targetLevelId : 0;
    this._lastRuntimeState = null;
    this._currentAttemptId = "";
    this._grantedAttemptRewardKeys = {};
    this._setDropTestButtonVisible(false);
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("Loading level list...");
    this._refreshLevelProgress();
    this._refreshPlayerResources();
    if (typeof this._refreshPlayerInventory === "function") {
      this._refreshPlayerInventory();
    }
    if (typeof this._refreshSelectedPowerups === "function") {
      this._refreshSelectedPowerups();
    }
    this._refreshSignInState();
    this._levelSelectMapIndex = Number.isInteger(options.forcedMapIndex)
      ? Math.max(0, Math.floor(Number(options.forcedMapIndex) || 0))
      : 0;

    return Promise.all([
      this._ensureLevelSelectPrefabs(),
      LevelSelectView.ensureTopResourceIconFrames(),
      this._loadAvailableLevelIds()
    ]).then(function (results) {
      var prefabs = results[0];
      var levelIds = results[2];
      this._preloadLevelConfigsInBackground(levelIds);
      this._renderLevelSelectContent(prefabs.viewPrefab, prefabs.floatingMapAssets, levelIds);
      this._ensureStaminaRecoveryTicker();
      this._updateSignInEntryState();
      if (typeof this._updateDailyTaskEntryState === "function") {
        this._updateDailyTaskEntryState();
      }
      if (typeof this._updateInventoryEntryState === "function") {
        this._updateInventoryEntryState();
      }
      this._updateStarChestEntryState();
      this._ensureShopEntryButton();
      this._updateNewGiftEntryState();
      if (typeof this._ensureGameCircleEntryButton === "function") {
        this._ensureGameCircleEntryButton();
      }
      this._maybeAutoShowSignInView();
      this._playLevelSelectBackgroundMusic();
      this._setStatus("Please select a level");
      this._logAssetManagerStats("level_select");
      if (prepareLevelId !== null) {
        if (typeof this._showStartGameView !== "function") {
          throw new Error("Level select prepare requires StartGameView entry method.");
        }
        Promise.resolve().then(function () {
          return this._showStartGameView(prepareLevelId);
        }.bind(this)).catch(function (error) {
          Logger.error("Show prepared StartGameView failed", error && error.stack ? error.stack : String(error));
          throw error;
        });
      }
      return null;
    }.bind(this)).catch(function (error) {
      this.isSelectingLevel = true;
      this.currentLevelConfig = null;
      this._setDropTestButtonVisible(false);
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();

      var errorMessage = error && error.stack
        ? error.stack
        : (error && error.message ? error.message : String(error));
      this._setStatus("Load level list failed. Please check LevelView/LevelMap prefabs.");
      Logger.error("Load level list failed detail", errorMessage);
      throw error;
    }.bind(this));
  },

  _resolveMapSlotsPerPage: function (mapPrefabs) {
    var defaultSlotsPerPage = 10;
    var prefabs = Array.isArray(mapPrefabs) ? mapPrefabs.filter(Boolean) : [];
    if (!prefabs.length) {
      return defaultSlotsPerPage;
    }

    var previewNode = null;
    try {
      previewNode = cc.instantiate(prefabs[0]);
      if (!previewNode || !previewNode.isValid) {
        return defaultSlotsPerPage;
      }

      var levelSlotCount = previewNode.children.filter(function (child) {
        return !!(child && typeof child.name === "string" && /^level/i.test(child.name));
      }).length;
      return Math.max(1, levelSlotCount || defaultSlotsPerPage);
    } catch (error) {
      Logger.warn("Resolve map slots per page failed", error && error.message ? error.message : error);
      return defaultSlotsPerPage;
    } finally {
      if (previewNode && previewNode.isValid) {
        previewNode.destroy();
      }
    }
  },

  _resolveLevelMapIndexByLevelId: function (levelIds, levelId, mapPrefabs) {
    var ids = Array.isArray(levelIds) ? levelIds : [];
    var targetLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
    var levelIndex = ids.indexOf(targetLevelId);
    if (levelIndex < 0) {
      return 0;
    }

    var slotsPerPage = this._resolveMapSlotsPerPage(mapPrefabs);
    return Math.max(0, Math.floor(levelIndex / Math.max(1, slotsPerPage)));
  },

  _hideLevelSelectView: function () {
    LevelSelectMemoryDiagnostics.increment("levelSelect.hide");
    LevelSelectMemoryDiagnostics.stop();
    this._hideLevelSelectNativeTemplateAd();
    this._clearStaminaRecoveryTicker();
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._clearPendingLevelEntry === "function") {
      this._clearPendingLevelEntry();
    }
    if (typeof this._hideStartGameView === "function") {
      this._hideStartGameView();
    }
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }
    this._hideSpecialIntroduceView();
    this._hideSignInView();

    if (this._localEditedLevelPicker) {
      if (typeof this._localEditedLevelPicker.close !== "function") {
        throw new Error("Local edited level picker requires close method.");
      }
      this._localEditedLevelPicker.close();
      this._localEditedLevelPicker = null;
    }

    var levelSelectNode = this._levelSelectNode;
    if (!levelSelectNode || !cc.isValid(levelSelectNode)) {
      throw new Error("Level select node must exist before leaving level select.");
    }

    var mapHostNode = levelSelectNode.getChildByName("map");
    if (mapHostNode && mapHostNode.isValid) {
      LevelSelectFloatingMap.disposeRuntime(mapHostNode);
    }
    if (typeof LevelSelectView.releaseMapBundleAssets !== "function") {
      throw new Error("LevelSelectView.releaseMapBundleAssets is required when leaving level select.");
    }
    LevelSelectView.releaseMapBundleAssets();
    levelSelectNode.active = false;
    levelSelectNode.destroy();
    this._levelSelectNode = null;

    if (this._floatingMapAssets) {
      LevelSelectFloatingMap.releaseAllCachedMapPrefabs(this._floatingMapAssets);
    }
    LevelSelectFloatingMap.invalidateAssetCache();
    this._floatingMapAssets = null;

    if (!this._levelSelectViewPrefab) {
      throw new Error("LevelView prefab must exist before releasing the map bundle.");
    }
    this._levelSelectViewPrefab = null;
    if (typeof BundleLoader.releaseNamedBundle !== "function") {
      throw new Error("BundleLoader.releaseNamedBundle is required when leaving level select.");
    }
    BundleLoader.releaseNamedBundle("map");
  },

  _resolveFloatingMapFocusLevelId: function () {
    if (this.levelProgress && Number.isInteger(this.levelProgress.highestUnlockedLevel) && this.levelProgress.highestUnlockedLevel > 0) {
      return this.levelProgress.highestUnlockedLevel;
    }
    throw new Error("Floating map focus level requires positive highestUnlockedLevel.");
  },

  _ensureLevelSelectPrefabs: function () {
    if (
      this._levelSelectViewPrefab &&
      this._floatingMapAssets &&
      typeof this._floatingMapAssets === "object"
    ) {
      return Promise.resolve({
        viewPrefab: this._levelSelectViewPrefab,
        floatingMapAssets: this._floatingMapAssets
      });
    }

    var focusLevelId = this._resolveFloatingMapFocusLevelId();
    return Promise.all([
      LevelSelectView.loadFloatingMapAssets(focusLevelId),
      LevelSelectView.ensureTopResourceIconFrames()
    ]).then(function (results) {
      this._floatingMapAssets = results[0];
      return this._loadPrefab("prefabs/ui/LevelView");
    }.bind(this)).then(function (levelViewPrefab) {
      this._levelSelectViewPrefab = levelViewPrefab;
      return {
        viewPrefab: this._levelSelectViewPrefab,
        floatingMapAssets: this._floatingMapAssets
      };
    }.bind(this));
  },

  _tryLoadFirstAvailablePrefab: function (paths, options) {
    var candidates = Array.isArray(paths) ? paths.filter(Boolean) : [];
    var silent = !!(options && options.silent);
    if (candidates.length === 0) {
      return Promise.resolve(null);
    }

    var index = 0;
    var tryLoadNext = function () {
      if (index >= candidates.length) {
        return Promise.resolve(null);
      }

      var path = candidates[index++];
      return this._loadPrefab(path).then(function (prefab) {
        return prefab || null;
      }).catch(function (error) {
        if (!silent) {
          Logger.warn("Load prefab failed, try next candidate", {
            path: path,
            error: error && error.message ? error.message : error
          });
        }
        return tryLoadNext();
      });
    }.bind(this);

    return tryLoadNext();
  },

  _loadPrefab: function (path) {
    return this.resourceGateway.loadPrefab(path);
  },

  _loadAvailableLevelIds: function () {
    if (this._availableLevelIdsPromise) {
      return this._availableLevelIdsPromise;
    }

    var fallbackMaxLevelId = Math.max(
      1,
      Number(this.levelSelectMaxLevelId) || 0,
      this._getStartupLevelId()
    );
    var quickLevelIds = this._buildSequentialLevelIds(fallbackMaxLevelId);
    this._availableLevelIdsPromise = Promise.resolve(quickLevelIds);
    this._refreshAvailableLevelIdsInBackground();
    return this._availableLevelIdsPromise;
  },

  _refreshAvailableLevelIdsInBackground: function () {
    if (this._availableLevelIdsScanPromise) {
      return this._availableLevelIdsScanPromise;
    }

    if (!this.levelManager || typeof this.levelManager.loadAvailableLevelIds !== "function") {
      throw new Error("Level select requires LevelManager.loadAvailableLevelIds.");
    }

    this._availableLevelIdsScanPromise = this.levelManager.loadAvailableLevelIds()
      .then(function (levelIds) {
        if (!Array.isArray(levelIds) || levelIds.length === 0) {
          throw new Error("Level manifest did not provide available level ids.");
        }
        return levelIds;
      }.bind(this)).then(function (resolvedLevelIds) {
        this._availableLevelIdsPromise = Promise.resolve(resolvedLevelIds);
        this._availableLevelIdsScanPromise = null;

        if (!this.isSelectingLevel || this.isRestarting) {
          return resolvedLevelIds;
        }

        this._preloadLevelConfigsInBackground(resolvedLevelIds);
        return resolvedLevelIds;
      }.bind(this)).catch(function (error) {
        this._availableLevelIdsScanPromise = null;
        Logger.warn("Background level list scan failed", error && error.message ? error.message : error);
        return [];
      }.bind(this));

    return this._availableLevelIdsScanPromise;
  },

  _buildSequentialLevelIds: function (maxLevelId) {
    return LevelSelectPolicy.buildSequentialLevelIds(maxLevelId);
  },

  _preloadLevelConfigsInBackground: function (levelIds) {
    if (this._levelConfigPreloadPromise) {
      return this._levelConfigPreloadPromise;
    }

    var validLevelIds = (levelIds || []).filter(function (levelId, index, list) {
      return Number.isInteger(levelId) && levelId > 0 && list.indexOf(levelId) === index;
    });
    var preloadLimit = Math.max(1, Math.floor(Number(this.startupPreloadLevelCount) || 1));
    validLevelIds = validLevelIds.slice(0, preloadLimit);

    if (validLevelIds.length === 0) {
      this._levelConfigPreloadPromise = Promise.resolve();
      return this._levelConfigPreloadPromise;
    }

    this._levelConfigPreloadPromise = this.levelManager.preloadLevels(validLevelIds).catch(function (error) {
      Logger.warn("Level config background preload failed", error && error.message ? error.message : error);
      this._levelConfigPreloadPromise = null;
    }.bind(this));

    return this._levelConfigPreloadPromise;
  },

  _getLevelIdFromResourcePath: function (resourcePath) {
    return LevelSelectPolicy.getLevelIdFromResourcePath(resourcePath);
  },

  _renderLevelSelectContent: function (levelViewPrefab, floatingMapAssets, levelIds) {
    LevelSelectMemoryDiagnostics.increment("levelSelect.renderContent");
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    if (isAllLevelsTemporarilyUnlocked(this)) {
      highestUnlocked = resolveMaxAvailableLevelId(levelIds);
    }
    var highlightedLevelId = this._resolveHighlightedLevelId(levelIds, highestUnlocked);
    var renderResult = LevelSelectView.renderLevelSelectContent({
      hostNode: this.node,
      existingLevelSelectNode: this._levelSelectNode,
      levelViewPrefab: levelViewPrefab,
      floatingMapAssets: floatingMapAssets,
      levelIds: levelIds,
      levelSelectRouteEditorMode: this._levelSelectRouteEditorMode,
      highestUnlocked: highestUnlocked,
      highlightedLevelId: highlightedLevelId,
      getLevelStarCount: this._getLevelStarCount.bind(this),
      isLevelCompleted: this._isLevelCompleted.bind(this),
      staminaValue: this._getCurrentStamina(),
      coinValue: this._getCurrentCoins(),
      dailyChallengeAttemptCount: this._getDailyChallengeAttemptCount(),
      showTestLevelButton: isAllLevelsTemporarilyUnlocked(this),
      onOpenSettings: this._onLevelSelectSettingTap.bind(this),
      onOpenRanking: this._onLevelSelectRankingTap.bind(this),
      onOpenInventory: this._showInventoryView.bind(this),
      onOpenStarChest: this._openStarChest.bind(this),
      onOpenShop: this._onLevelSelectShopTap.bind(this),
      onOpenDailyTasks: this._onLevelSelectDailyTasksTap.bind(this),
      onOpenSpiritHall: this._showSpiritHallView.bind(this),
      onHiddenUnlockAllLevels: this._onLevelSelectHiddenUnlockTap.bind(this),
      onLevelSelectTap: this._onLevelSelectTap.bind(this),
      onQuickStart: this._onLevelSelectQuickStartTap.bind(this),
      onRandomChallenge: this._onLevelSelectRandomChallengeTap.bind(this),
      onTestLevel: this._onLevelSelectTestTap.bind(this),
      onLocalEditedLevel: this._onLevelSelectLocalEditedLevelTap.bind(this),
      onBackToCurrentLevel: this._onLevelSelectBackToCurrentLevelTap.bind(this)
    });
    this._levelSelectNode = renderResult.levelViewNode;
    this._levelSelectMapIndex = Number.isInteger(renderResult.currentMapIndex)
      ? renderResult.currentMapIndex
      : 0;
    this._floatingMapAssets = floatingMapAssets;
    if (!renderResult || (Number(renderResult.mapCount) || 0) <= 0) {
      Logger.warn("Level select rendered without floating map content.");
      this._setStatus("Level map missing. Please check floating map resources.");
    }

    this._refreshRouteEditorButtons();
    this._updateSignInEntryState();
    if (typeof this._updateDailyTaskEntryState === "function") {
      this._updateDailyTaskEntryState();
    }
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    this._updateStarChestEntryState();
    this._ensureShopEntryButton();
    this._updateNewGiftEntryState();
    if (typeof this._ensureGameCircleEntryButton === "function") {
      this._ensureGameCircleEntryButton();
    }
    this._ensureStaminaRecoveryTicker();
    var guideShowResult = this._showNewUserGuideForQuickStart();
    if (guideShowResult && typeof guideShowResult.catch === "function") {
      guideShowResult.catch(function (error) {
        Logger.error("Show quick start new user guide failed", error && error.stack ? error.stack : String(error));
        throw error;
      });
    }
  },

  _onLevelSelectMapIndexChange: function (nextMapIndex) {
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }

    this._playSfx("uiClick");
    var targetMapIndex = Math.max(0, Math.floor(Number(nextMapIndex) || 0));
    this._levelSelectMapIndex = targetMapIndex;

    if (
      !this._levelSelectViewPrefab ||
      !this._floatingMapAssets ||
      typeof this._floatingMapAssets !== "object"
    ) {
      return;
    }

    this._loadAvailableLevelIds().then(function (levelIds) {
      if (this.isRestarting || !this.isSelectingLevel) {
        return;
      }
      this._renderLevelSelectContent(this._levelSelectViewPrefab, this._floatingMapAssets, levelIds);
    }.bind(this)).catch(function (error) {
      Logger.warn("Switch level map failed", error && error.message ? error.message : error);
    });
  },

  _refreshLevelProgress: function () {
    this.levelProgress = this.levelProgressStore.load();
  },

  _rememberSelectedLevel: function (levelId) {
    var safeLevelId = Number(levelId);
    if (!Number.isInteger(safeLevelId) || safeLevelId <= 0) {
      throw new Error("Selected level id must be a positive integer.");
    }
    if (!this.levelProgress || typeof this.levelProgress !== "object") {
      throw new Error("Level progress must be loaded before remembering selected level.");
    }
    var highestUnlocked = Number(this.levelProgress.highestUnlockedLevel);
    if (!Number.isInteger(highestUnlocked) || highestUnlocked <= 0) {
      throw new Error("highestUnlockedLevel must be a positive integer.");
    }
    this._currentLevelEnteredByTestUnlock = false;
    if (isAllLevelsTemporarilyUnlocked(this) && safeLevelId > highestUnlocked) {
      this._currentLevelEnteredByTestUnlock = true;
      return;
    }

    this.levelProgress = this.levelProgressStore.setSelectedLevel(this.levelProgress, levelId);
    this.levelProgressStore.save(this.levelProgress);
  },

  _handleRuntimeStateTransition: function (snapshot) {
    if (!snapshot) {
      return;
    }
    if (typeof this._syncCollectedSkillPowerupsToInventory !== "function") {
      throw new Error("Runtime state transition requires collected skill powerup inventory sync.");
    }
    this._syncCollectedSkillPowerupsToInventory(snapshot);

    var previousState = this._lastRuntimeState;
    var currentState = snapshot.state;
    if (currentState === "won" && previousState !== "won") {
      this._playSfx("win");
      if (!snapshot.winStats || typeof snapshot.winStats.collectionRewardCompleted !== "boolean") {
        throw new Error("Level clear requires boolean winStats.collectionRewardCompleted.");
      }
      var collectionRewardCompleted = snapshot.winStats.collectionRewardCompleted;
      if (isRandomChallengeContext(this._currentRunContext)) {
        this._recordRandomChallengeWin(snapshot);
        this._currentLevelAwardedClearRewardItems = this._grantRandomChallengeRewardItems(collectionRewardCompleted);
      } else {
        var isFirstCompletion = !this._isLevelCompleted(this._currentLevelId);
        this._recordCurrentLevelWin(snapshot);
        var clearRewardItems = this._currentLevelEnteredByTestUnlock === true
          ? []
          : this._grantCurrentLevelClearRewardItems(isFirstCompletion, collectionRewardCompleted);
        this._currentLevelAwardedClearRewardItems = mergeRewardItemsById(
          clearRewardItems.concat(this._grantFirstAttemptClearStaminaReward(isFirstCompletion)),
          "Level clear awarded"
        );
      }
    } else if (
      currentState !== previousState &&
      (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective")
    ) {
      this._playSfx("lose");
      if (isRandomChallengeContext(this._currentRunContext) && typeof this._recordDailyTaskEvent === "function") {
        this._recordDailyTaskEvent("challenge_attempt", buildRandomChallengeDailyTaskPayload(this._currentRunContext, snapshot, "lose"));
      }
    }
    if (currentState === "won") {
      this._applyCurrentLevelBestScoreFlag(snapshot);
      this._applyCurrentLevelClearRewardItems(snapshot);
    }
    if (
      currentState !== previousState &&
      typeof this._onRuntimeStateTransition === "function"
    ) {
      this._onRuntimeStateTransition(snapshot, previousState, currentState);
    }
    if (
      currentState !== previousState &&
      typeof this._handleInterstitialAdRuntimeStateTransition === "function"
    ) {
      this._handleInterstitialAdRuntimeStateTransition(snapshot, previousState, currentState);
    }
    this._lastRuntimeState = currentState;
  },

  _applyCurrentLevelBestScoreFlag: function (snapshot) {
    if (!snapshot || snapshot.state !== "won") {
      return snapshot;
    }
    if (isRandomChallengeContext(this._currentRunContext)) {
      if (!this.randomChallengeStore || typeof this.randomChallengeStore.getBestScore !== "function") {
        throw new Error("Random challenge best score requires RandomChallengeStore.getBestScore.");
      }
      var challengeContext = requireRandomChallengeContext(this._currentRunContext);
      var challengeScore = resolveWinSnapshotScore(snapshot);
      var challengeBestScore = this.randomChallengeStore.getBestScore(this.randomChallengeState, challengeContext.difficultyTier);
      snapshot.winStats.isPersonalBestScore = challengeScore >= challengeBestScore;
      snapshot.winStats.personalBestScore = challengeBestScore;
      return snapshot;
    }
    if (!this.levelProgressStore || typeof this.levelProgressStore.getBestScore !== "function") {
      throw new Error("Personal best score requires LevelProgressStore.getBestScore.");
    }
    if (!this._currentLevelId) {
      throw new Error("Personal best score requires current level id.");
    }

    var score = resolveWinSnapshotScore(snapshot);
    var bestScore = this.levelProgressStore.getBestScore(this.levelProgress, this._currentLevelId);
    snapshot.winStats.isPersonalBestScore = score >= bestScore;
    snapshot.winStats.personalBestScore = bestScore;
    return snapshot;
  },

  _applyCurrentLevelClearRewardItems: function (snapshot) {
    if (!snapshot || snapshot.state !== "won") {
      return snapshot;
    }
    if (!snapshot.winStats || typeof snapshot.winStats !== "object") {
      throw new Error("Level clear rewards require snapshot.winStats.");
    }
    if (!Array.isArray(this._currentLevelAwardedClearRewardItems)) {
      throw new Error("Level clear awarded reward items must be resolved before rendering WinView.");
    }
    snapshot.winStats.clearRewardItems = clone(this._currentLevelAwardedClearRewardItems);
    return snapshot;
  },

  _grantCurrentLevelClearRewardItems: function (isFirstCompletion, collectionRewardCompleted) {
    if (typeof isFirstCompletion !== "boolean") {
      throw new Error("Level clear reward grant requires first-completion flag.");
    }
    var configuredRewardItems = getCurrentLevelClearRewardItems(this.currentLevelConfig);
    var awardedRewardItems = resolveAwardedClearRewardItems(
      configuredRewardItems,
      isFirstCompletion,
      collectionRewardCompleted
    );
    return grantRewardItemsToPlayer(this, awardedRewardItems, "Level clear reward");
  },

  _grantRandomChallengeRewardItems: function (collectionRewardCompleted) {
    requireRandomChallengeContext(this._currentRunContext);
    var rewardItems = getCurrentLevelClearRewardItems(this.currentLevelConfig);
    var awardedRewardItems = resolveAwardedClearRewardItems(rewardItems, true, collectionRewardCompleted);
    return grantRewardItemsToPlayer(this, awardedRewardItems, "Random challenge reward");
  },

  _recordCurrentLevelWin: function (snapshot) {
    if (!this._currentLevelId) {
      throw new Error("Level completion requires current level id.");
    }
    if (this._currentLevelEnteredByTestUnlock === true) {
      Logger.info("Skip progress record for test-unlocked level", {
        levelId: this._currentLevelId
      });
      return;
    }

    var stars = this._calculateStarRating(snapshot);
    var score = resolveWinSnapshotScore(snapshot);
    this.levelProgress = this.levelProgressStore.recordCompletion(this.levelProgress, this._currentLevelId, stars, score);
    this.levelProgressStore.save(this.levelProgress);
    if (isWechatGameRuntime()) {
      this._submitWorldLeaderboardProgressAfterLevelClear();
    } else {
      Logger.info("Skip world leaderboard progress submit outside WeChat game runtime.");
    }

    Logger.info("Level completion recorded", {
      levelId: this._currentLevelId,
      stars: stars,
      score: score
    });


    if (typeof this._recordDailyTaskEvent === "function") {
      this._recordDailyTaskEvent("clear_level", {
        levelId: this._currentLevelId,
        stars: stars
      });
    }
  },

  _submitWorldLeaderboardProgressAfterLevelClear: function () {
    if (!this.worldLeaderboardService || typeof this.worldLeaderboardService.submit !== "function") {
      throw new Error("World leaderboard level-clear submit requires WorldLeaderboardService.submit.");
    }
    var profile = this._worldLeaderboardUserProfile || this.worldLeaderboardService.createAnonymousUserProfile();
    var submitPromise = this.worldLeaderboardService.submit(this.levelProgress, profile).then(function (result) {
      this._lastWorldLeaderboardSubmitError = null;
      Logger.info("World leaderboard progress submitted after level clear", {
        levelId: this._currentLevelId,
        updatedAt: result.updatedAt
      });
      return result;
    }.bind(this)).catch(function (error) {
      this._lastWorldLeaderboardSubmitError = error;
      Logger.error("World leaderboard progress submit after level clear failed", error && error.stack ? error.stack : String(error));
      this._setStatus("排行榜上报失败");
      return null;
    }.bind(this));
    this._worldLeaderboardSubmitPromise = submitPromise;
    return submitPromise.then(function (result) {
      if (this._worldLeaderboardSubmitPromise === submitPromise) {
        this._worldLeaderboardSubmitPromise = null;
      }
      return result;
    }.bind(this));
  },

  _recordRandomChallengeWin: function (snapshot) {
    var context = requireRandomChallengeContext(this._currentRunContext);
    if (!this.randomChallengeStore || typeof this.randomChallengeStore.recordCompletion !== "function") {
      throw new Error("Random challenge completion requires RandomChallengeStore.recordCompletion.");
    }
    var score = resolveWinSnapshotScore(snapshot);
    this.randomChallengeState = this.randomChallengeStore.recordCompletion(this.randomChallengeState, context, score);
    this.randomChallengeStore.save(this.randomChallengeState);
    Logger.info("Random challenge completion recorded", {
      seed: context.seed,
      difficultyTier: context.difficultyTier,
      configHash: context.configHash,
      score: score
    });
    if (typeof this._recordDailyTaskEvent === "function") {
      var payload = buildRandomChallengeDailyTaskPayload(context, snapshot, "win");
      this._recordDailyTaskEvent("challenge_attempt", payload);
      this._recordDailyTaskEvent("challenge_clear", payload);
    }
  },

  _calculateStarRating: function (snapshot) {
    return StarRatingPolicy.calculateStarRatingFromSnapshot(snapshot);
  },

  _getLevelStarCount: function (levelId) {
    var starsByLevel = this.levelProgress && this.levelProgress.starsByLevel
      ? this.levelProgress.starsByLevel
      : {};
    var stars = Math.floor(Number(starsByLevel[String(levelId)]) || 0);
    if (stars < 0) {
      return 0;
    }
    if (stars > 3) {
      return 3;
    }
    return stars;
  },

  _isLevelCompleted: function (levelId) {
    var completedLevels = this.levelProgress && this.levelProgress.completedLevels
      ? this.levelProgress.completedLevels
      : {};
    return !!completedLevels[String(levelId)];
  },

  _resolveHighlightedLevelId: function (levelIds, highestUnlocked) {
    return LevelSelectPolicy.resolveHighlightedLevelId(levelIds, {
      currentLevelId: this._currentLevelId,
      selectedLevelId: this.levelProgress ? this.levelProgress.selectedLevelId : 1,
      highestUnlocked: highestUnlocked
    });
  },

  _onLevelSelectTap: function (levelId) {
    if (this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    if (this._levelSelectRouteEditorMode) {
      this._pendingRouteEditorAutoEnable = true;
      this._setStatus("Loading level for route editor: level_" + String(levelId).padStart(3, "0"));
      this._loadLevelById(levelId, "Route editor level loaded", "Load selected level for route editor failed.");
      return;
    }

    if (typeof this._showStartGameView !== "function") {
      throw new Error("Level select requires StartGameView entry method.");
    }
    this._showStartGameView(levelId);
  },

  _startTestLevelEntry: function () {
    if (!this.levelManager || typeof this.levelManager.loadTestLevel !== "function") {
      throw new Error("Test level entry requires LevelManager.loadTestLevel.");
    }
    if (!Array.isArray(this._pendingStartGamePowerups)) {
      throw new Error("Test level entry requires pending StartGameView powerups array.");
    }
    this._pendingStartGamePowerups = [];
    this._pendingStartGamePreciseAimActivation = false;
    this.isRestarting = true;
    this._setStatus("Loading level_test...");
    return this.levelManager.loadTestLevel().then(function (levelConfig) {
      if (!levelConfig || !levelConfig.level || !Number.isInteger(levelConfig.level.levelId) || levelConfig.level.levelId <= 0) {
        throw new Error("level_test requires a positive integer level.levelId.");
      }
      this._pendingPreparedLevelConfig = {
        levelId: levelConfig.level.levelId,
        levelConfig: levelConfig
      };
      return this._loadLevelById(
        levelConfig.level.levelId,
        "Test level started",
        "Load level_test failed. Check console logs.",
        { mode: "test", testSource: "bundled" }
      );
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._setStatus("Load level_test failed. Check console logs.");
      throw error;
    }.bind(this));
  },

  _onLevelSelectTestTap: function () {
    if (this.isRestarting) {
      return;
    }
    this._playSfx("uiClick");
    this._openMapEditorScene();
  },

  _openMapEditorScene: function () {
    if (!this.isSelectingLevel || !this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("Map editor can only open from LevelView/test_btn.");
    }
    this.isRestarting = true;
    this._setStatus("Loading map editor scene...");
    return BundleLoader.ensureGameplayBundleLoaded().then(function (gameBundle) {
      if (!gameBundle || typeof gameBundle.loadScene !== "function") {
        throw new Error("Game bundle requires loadScene for map editor.");
      }
      return new Promise(function (resolve, reject) {
        gameBundle.loadScene(MAP_EDITOR_SCENE_PATH, function (error, sceneAsset) {
          if (error) {
            reject(new Error("Load map editor scene failed: " + error.message));
            return;
          }
          if (!sceneAsset) {
            reject(new Error("Map editor scene asset is empty: " + MAP_EDITOR_SCENE_PATH));
            return;
          }
          resolve(sceneAsset);
        });
      });
    }).then(function (sceneAsset) {
      this._hideLevelSelectView();
      this.isRestarting = false;
      cc.director.runScene(sceneAsset);
      return sceneAsset;
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      if (this._levelSelectNode && this._levelSelectNode.isValid) {
        this._setStatus("Load map editor scene failed. Check console logs.");
      }
      throw error;
    }.bind(this));
  },

  _startLocalEditedLevelEntry: function (levelId) {
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("Local edited level entry requires a positive levelId.");
    }
    if (!Array.isArray(this._pendingStartGamePowerups)) {
      throw new Error("Local edited level entry requires pending StartGameView powerups array.");
    }
    var levelConfig = getLocalEditedLevelStore(this).loadLevel(levelId);
    this._pendingStartGamePowerups = [];
    this._pendingStartGamePreciseAimActivation = false;
    this.isRestarting = true;
    this._setStatus("Loading local edited level_" + String(levelId).padStart(3, "0") + "...");
    this._pendingPreparedLevelConfig = {
      levelId: levelId,
      levelConfig: levelConfig
    };
    return this._loadLevelById(
      levelId,
      "Local edited level started",
      "Load local edited level failed. Check console logs.",
      { mode: "test", testSource: "local" }
    );
  },

  _onLevelSelectLocalEditedLevelTap: function () {
    if (this.isRestarting) {
      return;
    }
    if (!this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("Local edited level list requires LevelView.");
    }
    this._playSfx("uiClick");
    var levelIds = getLocalEditedLevelStore(this).listLevelIds();
    if (levelIds.length === 0) {
      this._setStatus("No local edited levels saved yet.");
      return;
    }
    if (this._localEditedLevelPicker) {
      this._localEditedLevelPicker.close();
    }
    this._localEditedLevelPicker = new MapEditorLevelPicker(this._levelSelectNode);
    this._localEditedLevelPicker.open(levelIds, levelIds[0], function (selectedLevelId) {
      this._startLocalEditedLevelEntry(selectedLevelId);
    }.bind(this));
    this._setStatus("Select a local edited level to test.");
  },

  _resolveHighestUnlockedLevelId: function (levelIds) {
    this._refreshLevelProgress();
    var highestUnlocked = Number(this.levelProgress.highestUnlockedLevel);
    if (!Number.isInteger(highestUnlocked) || highestUnlocked <= 0) {
      throw new Error("highestUnlockedLevel must be a positive integer.");
    }
    if (isAllLevelsTemporarilyUnlocked(this)) {
      return resolveMaxAvailableLevelId(levelIds);
    }
    return highestUnlocked;
  },

  _onLevelSelectHiddenUnlockTap: function () {
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }
    if (this._levelSelectRouteEditorMode === true) {
      return;
    }

    var nowMs = Date.now();
    var firstTapAt = Number(this._levelSelectHiddenUnlockFirstTapAt) || 0;
    if (firstTapAt <= 0 || nowMs - firstTapAt > HIDDEN_UNLOCK_ALL_LEVELS_WINDOW_MS) {
      this._levelSelectHiddenUnlockFirstTapAt = nowMs;
      this._levelSelectHiddenUnlockTapCount = 1;
      return;
    }

    this._levelSelectHiddenUnlockTapCount = Math.floor(Number(this._levelSelectHiddenUnlockTapCount) || 0) + 1;
    if (this._levelSelectHiddenUnlockTapCount < HIDDEN_UNLOCK_ALL_LEVELS_TAP_COUNT) {
      return;
    }

    this._levelSelectHiddenUnlockFirstTapAt = 0;
    this._levelSelectHiddenUnlockTapCount = 0;
    this._unlockAllLevelsForCurrentLevelSelectSession();
  },

  _unlockAllLevelsForCurrentLevelSelectSession: function () {
    if (!this.isSelectingLevel) {
      throw new Error("Hidden unlock requires active level select view.");
    }
    if (!this._levelSelectViewPrefab) {
      throw new Error("Hidden unlock requires LevelView prefab.");
    }
    if (!this._floatingMapAssets || typeof this._floatingMapAssets !== "object") {
      throw new Error("Hidden unlock requires floating map assets.");
    }

    this._levelSelectHiddenUnlockAllActive = true;
    this._playSfx("uiClick");
    this._grantHiddenUnlockAllLevelsStaminaReward();
    this._loadAvailableLevelIds().then(function (levelIds) {
      if (!this.isSelectingLevel || this._levelSelectHiddenUnlockAllActive !== true) {
        return;
      }
      var maxLevelId = resolveMaxAvailableLevelId(levelIds);
      this._renderLevelSelectContent(this._levelSelectViewPrefab, this._floatingMapAssets, levelIds);
      if (typeof this._setStatusWithTip !== "function") {
        throw new Error("Hidden unlock completion requires _setStatusWithTip.");
      }
      this._setStatusWithTip("hidden_unlock_all_levels_complete", null, "解锁完成");
      Logger.info("Hidden level select unlock activated for current session", {
        maxLevelId: maxLevelId,
        staminaValue: HIDDEN_UNLOCK_ALL_LEVELS_STAMINA_VALUE,
        coinValue: HIDDEN_UNLOCK_ALL_LEVELS_COIN_VALUE
      });
    }.bind(this)).catch(function (error) {
      Logger.error("Hidden level select unlock failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _grantHiddenUnlockAllLevelsStaminaReward: function () {
    if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
      throw new Error("Hidden unlock stamina reward requires PlayerResourceStore.save.");
    }
    this._refreshPlayerResources();
    var currentStamina = Math.floor(Number(this.playerResources.stamina));
    if (!Number.isInteger(currentStamina) || currentStamina < 0) {
      throw new Error("Player stamina value is invalid before hidden unlock reward.");
    }
    var currentCoins = Math.floor(Number(this.playerResources.coins));
    if (!Number.isInteger(currentCoins) || currentCoins < 0) {
      throw new Error("Player coin value is invalid before hidden unlock reward.");
    }
    this.playerResources.stamina = HIDDEN_UNLOCK_ALL_LEVELS_STAMINA_VALUE;
    this.playerResources.coins = HIDDEN_UNLOCK_ALL_LEVELS_COIN_VALUE;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus({
      updateEntryStates: false
    });
  },

  _resolveLatestAccessibleLevelId: function () {
    if (!this._floatingMapAssets || typeof this._floatingMapAssets !== "object") {
      throw new Error("Level select quick start requires preloaded floating map assets.");
    }
    if (!this._floatingMapAssets.config || typeof this._floatingMapAssets.config !== "object") {
      throw new Error("Level select quick start requires floating map config.");
    }
    var config = this._floatingMapAssets.config;
    var self = this;
    return this._loadAvailableLevelIds().then(function (levelIds) {
      var highestUnlocked = self._resolveHighestUnlockedLevelId(levelIds);
      return LevelSelectFloatingMap.resolveLatestAccessibleLevelId(config, highestUnlocked);
    });
  },

  _resolveCurrentMapLevelId: function () {
    return this._resolveLatestAccessibleLevelId();
  },

  _onLevelSelectQuickStartTap: function () {
    LevelSelectMemoryDiagnostics.increment("levelSelect.quickStartTap");
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }
    if (this._levelSelectRouteEditorMode === true) {
      return;
    }
    if (!this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("Level select quick start requires an active LevelView node.");
    }
    if (typeof this._showStartGameView !== "function") {
      throw new Error("Level select quick start requires StartGameView entry method.");
    }

    this._playSfx("uiClick");
    this._advanceNewUserGuideToStartGame();
    var levelViewNode = this._levelSelectNode;
    var self = this;
    this._resolveLatestAccessibleLevelId().then(function (latestLevelId) {
      if (self.isRestarting || !self.isSelectingLevel) {
        return;
      }
      LevelSelectView.scrollFloatingMapToLevel(levelViewNode, latestLevelId, {
        onComplete: function () {
          if (self.isRestarting || !self.isSelectingLevel) {
            return;
          }
          return self._showStartGameView(latestLevelId);
        }
      });
    }).catch(function (error) {
      Logger.error("Level select quick start failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _startRandomChallengeRun: function (options) {
    if (this.isRestarting) {
      return Promise.resolve(null);
    }
    this._recordCurrentAttemptQuit("start_random_challenge");
    if (!this.levelManager || typeof this.levelManager.createRandomChallengeRun !== "function") {
      throw new Error("Random challenge requires LevelManager.createRandomChallengeRun.");
    }

    var opts = options === undefined ? {} : options;
    if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
      throw new Error("Random challenge start options must be an object.");
    }

    this._cancelGameplayBundleIdleRelease();
    this._persistRouteEditorIfDirty();
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    this._hideSpecialIntroduceView();
    if (typeof this._clearPendingLevelEntry === "function") {
      this._clearPendingLevelEntry();
    }
    if (typeof this._hideStartGameView === "function") {
      this._hideStartGameView();
    }
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    this._refreshLevelProgress();
    var highestUnlockedLevel = this.levelProgressStore.getHighestUnlockedLevel(this.levelProgress);
    var runOptions = {
      highestUnlockedLevel: highestUnlockedLevel
    };
    if (opts.seed !== undefined) {
      runOptions.seed = opts.seed;
    }

    this.isRestarting = true;
    this._currentLevelEnteredByTestUnlock = false;
    this._currentLevelAwardedClearRewardItems = [];
    this._setDropTestButtonVisible(false);
    this._lastRuntimeState = null;
    this._setStatus("正在生成随机挑战...");

    return this._runLevelEntryWithLoading(function () {
      return this._ensureGameplayKernel().then(function () {
        return this.levelManager.createRandomChallengeRun(runOptions);
      }.bind(this)).then(function (run) {
        if (!run || typeof run !== "object" || Array.isArray(run)) {
          throw new Error("Random challenge run must be an object.");
        }
        var levelConfig = run.levelConfig;
        if (!levelConfig || !levelConfig.level) {
          throw new Error("Random challenge run requires levelConfig.");
        }
        this.currentLevelConfig = levelConfig;
        this._currentLevelId = levelConfig.level.levelId;
        this._currentRunContext = {
          mode: RandomChallengeRules.MODE,
          seed: run.seed,
          generatorVersion: run.generatorVersion,
          difficultyTier: run.difficultyTier,
          configHash: run.configHash
        };
        this._prepareRouteEditorForLevel(levelConfig, this._currentLevelId);
        return this.levelRenderer.syncBoardLayoutHudBottomLineAsync().then(function () {
          this._applyBoardTuningFromProperties();
          var snapshot = this.gameManager.startLevel(
            levelConfig,
            BootstrapShared.buildBoardOcclusionStartContext(this, levelConfig, this._currentRunContext)
          );
          if (typeof this._applyPendingNextRoundRewards === "function") {
            snapshot = this._applyPendingNextRoundRewards(snapshot);
          }
          if (typeof this._beginLevelAttemptTracking === "function") {
            this._beginLevelAttemptTracking(levelConfig, snapshot);
          }
          this._lastRuntimeState = snapshot ? snapshot.state : null;
          return this.levelRenderer.renderLevel(levelConfig, snapshot).then(function () {
            return {
              levelConfig: levelConfig,
              run: run,
              snapshot: snapshot
            };
          });
        }.bind(this));
      }.bind(this));
    }.bind(this)).then(function (entry) {
      var levelConfig = entry.levelConfig;
      var run = entry.run;
      var snapshot = entry.snapshot;
      this.isSelectingLevel = false;
      this._hideLevelSelectView();
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus(this._formatStatus(levelConfig, snapshot));
      this._playGameplayBackgroundMusic();
      Logger.info("Random challenge started", {
        seed: run.seed,
        difficultyTier: run.difficultyTier,
        configHash: run.configHash
      });
      this._logAssetManagerStats("gameplay");
      this.levelRenderer.setGameplayInteractionEnabled(false);
      return this._runGameEntryCountdown().then(function () {
        this.levelRenderer.setGameplayInteractionEnabled(true);
        this.isRestarting = false;
        this._setDropTestButtonVisible(true);
        this._syncSpecialIntroduceForRuntimeSnapshot(snapshot);
        this._syncGeniusTipsForRuntimeSnapshot(snapshot);
        this._syncSartTipsForRuntimeSnapshot(snapshot);
        return null;
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._currentRunContext = null;
      this._currentLevelAwardedClearRewardItems = [];
      this._setDropTestButtonVisible(!!this.currentLevelConfig && !this.isSelectingLevel);
      this._refreshRouteEditorButtons();
      this._setStatus("随机挑战加载失败，请查看日志。");
      var errorMessage = error && error.stack
        ? error.stack
        : (error && error.message ? error.message : String(error));
      Logger.error("Random challenge load failed", errorMessage);
      throw error;
    }.bind(this));
  },

  _onLevelSelectRandomChallengeTap: function () {
    LevelSelectMemoryDiagnostics.increment("levelSelect.randomChallengeTap");
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }
    if (this._levelSelectRouteEditorMode === true) {
      return;
    }
    this._playSfx("uiClick");
    this._startRandomChallengeRun({}).catch(function (error) {
      Logger.error("Level select random challenge failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _onLevelSelectBackToCurrentLevelTap: function () {
    LevelSelectMemoryDiagnostics.increment("levelSelect.backToCurrentTap");
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }
    if (this._levelSelectRouteEditorMode === true) {
      return;
    }
    if (!this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("Level select back to current level requires an active LevelView node.");
    }

    this._playSfx("uiClick");
    var levelViewNode = this._levelSelectNode;
    var self = this;
    this._resolveCurrentMapLevelId().then(function (currentLevelId) {
      if (self.isRestarting || !self.isSelectingLevel) {
        return;
      }
      LevelSelectView.scrollFloatingMapToLevel(levelViewNode, currentLevelId, {});
    }).catch(function (error) {
      Logger.error("Level select back to current level failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _resolveLevelSelectNativeTemplateAdUnitId: function () {
    return requireNonEmptyString(this.startGameNativeTemplateAdUnitId, "startGameNativeTemplateAdUnitId");
  },

  _resolveLevelSelectNativeTemplateAdStyle: function () {
    if (!cc.view || typeof cc.view.getFrameSize !== "function") {
      throw new Error("cc.view.getFrameSize is required for LevelView native template ad.");
    }
    var frameSize = cc.view.getFrameSize();
    if (!frameSize || frameSize.width <= 0 || frameSize.height <= 0) {
      throw new Error("Invalid frame size for LevelView native template ad.");
    }
    return {
      left: 0,
      top: 0,
      width: frameSize.width
    };
  },

  _applyLevelSelectNativeTemplateAdHeight: function (nativeHeightPx) {
    if (!this.isSelectingLevel || !this._levelSelectNode || !this._levelSelectNode.isValid) {
      return;
    }
    var widgetTop = resolveNativeTemplateAdWidgetTop(nativeHeightPx);
    LevelSelectView.setTopWidgetTop(this._levelSelectNode, widgetTop);
    this._levelSelectNativeTemplateAdHeightPx = nativeHeightPx;
  },

  _showLevelSelectNativeTemplateAd: function () {
    if (!this.levelSelectNativeTemplateAdAdapter || typeof this.levelSelectNativeTemplateAdAdapter.isSupported !== "function") {
      throw new Error("Level select native template ad adapter is required.");
    }
    if (!this.isSelectingLevel || !this._levelSelectNode || !this._levelSelectNode.isValid) {
      return Promise.resolve(false);
    }
    if (!this.levelSelectNativeTemplateAdAdapter.isSupported()) {
      this._hideLevelSelectNativeTemplateAd();
      return Promise.resolve(false);
    }

    var adUnitId = this._resolveLevelSelectNativeTemplateAdUnitId();
    var style = this._resolveLevelSelectNativeTemplateAdStyle();
    return Promise.resolve().then(function () {
      return this.levelSelectNativeTemplateAdAdapter.showTopAd({
        adUnitId: adUnitId,
        style: style,
        onHeightChange: function (heightPx) {
          this._applyLevelSelectNativeTemplateAdHeight(heightPx);
        }.bind(this),
        onError: function (error) {
          Logger.warn("Level select native template ad error", error && error.errMsg ? error.errMsg : error);
          this._hideLevelSelectNativeTemplateAd();
        }.bind(this)
      });
    }.bind(this)).then(function () {
      this._levelSelectNativeTemplateAdShowing = true;
      return true;
    }.bind(this)).catch(function (error) {
      Logger.warn("Level select native template ad show failed", error && error.message ? error.message : error);
      this._hideLevelSelectNativeTemplateAd();
      return false;
    }.bind(this));
  },

  _hideLevelSelectNativeTemplateAd: function () {
    if (this.levelSelectNativeTemplateAdAdapter && typeof this.levelSelectNativeTemplateAdAdapter.hideAd === "function") {
      this.levelSelectNativeTemplateAdAdapter.hideAd();
    }
    this._levelSelectNativeTemplateAdShowing = false;
    this._levelSelectNativeTemplateAdHeightPx = 0;
    if (
      this._levelSelectNode &&
      this._levelSelectNode.isValid &&
      Number.isFinite(this._levelSelectNode.__levelSelectTopWidgetOriginalTop)
    ) {
      LevelSelectView.setTopWidgetTop(this._levelSelectNode, this._levelSelectNode.__levelSelectTopWidgetOriginalTop);
    }
  },

  _refreshLevelSelectNativeTemplateAdLayout: function () {
    if (!this.isSelectingLevel || !this._levelSelectNode || !this._levelSelectNode.isValid) {
      return;
    }
    if (!this._levelSelectNativeTemplateAdShowing) {
      return;
    }
    if (!this.levelSelectNativeTemplateAdAdapter || typeof this.levelSelectNativeTemplateAdAdapter.updateStyle !== "function") {
      throw new Error("Level select native template ad adapter cannot update style.");
    }
    this.levelSelectNativeTemplateAdAdapter.updateStyle(this._resolveLevelSelectNativeTemplateAdStyle());
    if (this._levelSelectNativeTemplateAdHeightPx > 0) {
      this._applyLevelSelectNativeTemplateAdHeight(this._levelSelectNativeTemplateAdHeightPx);
    }
  }
};
