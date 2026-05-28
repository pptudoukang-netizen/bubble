"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var LevelSelectPolicy = Shared.LevelSelectPolicy;
var LevelSelectView = Shared.LevelSelectView;
var StarRatingPolicy = Shared.StarRatingPolicy;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;

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

function resolveAwardedClearRewardItems(rewardItems, isFirstCompletion) {
  if (!Array.isArray(rewardItems)) {
    throw new Error("Level clear reward items must be an array.");
  }
  if (typeof isFirstCompletion !== "boolean") {
    throw new Error("Level clear reward first-completion flag is required.");
  }

  return rewardItems.filter(function (item) {
    return item.id !== "stamina" || isFirstCompletion;
  }).map(function (item) {
    return {
      id: item.id,
      count: item.count
    };
  });
}

module.exports = {
  _showLevelSelectView: function (options) {
    options = options || {};
    if (this.isRestarting) {
      return;
    }

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
    this.isSelectingLevel = true;
    this.currentLevelConfig = null;
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

    Promise.all([
      this._ensureLevelSelectPrefabs(),
      this._loadAvailableLevelIds()
    ]).then(function (results) {
      var prefabs = results[0];
      var levelIds = results[1];
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
    this._hideSignInView();
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    this._levelSelectNode.active = false;
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

    return Promise.all([
      this._loadPrefab("prefabs/ui/LevelView"),
      LevelSelectView.loadFloatingMapAssets()
    ]).then(function (results) {
      this._levelSelectViewPrefab = results[0];
      this._floatingMapAssets = results[1];
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

    this._availableLevelIdsScanPromise = this.resourceGateway.loadLevelConfigResourceUrls()
      .then(function (sourceUrls) {
        var levelIds = sourceUrls.map(this._getLevelIdFromResourcePath, this)
          .filter(function (id) {
            return Number.isInteger(id) && id > 0;
          })
          .filter(function (id, index, list) {
            return list.indexOf(id) === index;
          })
          .sort(function (a, b) {
            return a - b;
          });

        if (levelIds.length === 0) {
          levelIds = [this._getStartupLevelId()];
        }

        return levelIds;
      }.bind(this)).then(function (resolvedLevelIds) {
        this._availableLevelIdsPromise = Promise.resolve(resolvedLevelIds);
        this._availableLevelIdsScanPromise = null;

        if (!this.isSelectingLevel || this.isRestarting) {
          return resolvedLevelIds;
        }

        if (
          !this._levelSelectViewPrefab ||
          !this._floatingMapAssets ||
          typeof this._floatingMapAssets !== "object"
        ) {
          return resolvedLevelIds;
        }

        this._renderLevelSelectContent(this._levelSelectViewPrefab, this._floatingMapAssets, resolvedLevelIds);
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
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    if (this.unlockAllLevelsForTest === true) {
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
      onOpenSettings: this._onLevelSelectSettingTap.bind(this),
      onOpenRanking: this._onLevelSelectRankingTap.bind(this),
      onOpenInventory: this._showInventoryView.bind(this),
      onOpenStarChest: this._openStarChest.bind(this),
      onOpenShop: this._onLevelSelectShopTap.bind(this),
      onOpenDailyTasks: this._onLevelSelectDailyTasksTap.bind(this),
      onLevelSelectTap: this._onLevelSelectTap.bind(this)
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
    if (this.unlockAllLevelsForTest === true && safeLevelId > highestUnlocked) {
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

    var previousState = this._lastRuntimeState;
    var currentState = snapshot.state;
    if (currentState === "won" && previousState !== "won") {
      this._playSfx("win");
      var isFirstCompletion = !this._isLevelCompleted(this._currentLevelId);
      this._recordCurrentLevelWin(snapshot);
      this._currentLevelAwardedClearRewardItems = this._currentLevelEnteredByTestUnlock === true
        ? []
        : this._grantCurrentLevelClearRewardItems(isFirstCompletion);
    } else if (
      currentState !== previousState &&
      (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective")
    ) {
      this._playSfx("lose");
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
    this._lastRuntimeState = currentState;
  },

  _applyCurrentLevelBestScoreFlag: function (snapshot) {
    if (!snapshot || snapshot.state !== "won") {
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

  _grantCurrentLevelClearRewardItems: function (isFirstCompletion) {
    if (typeof isFirstCompletion !== "boolean") {
      throw new Error("Level clear reward grant requires first-completion flag.");
    }
    if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
      throw new Error("Level clear reward requires PlayerResourceStore.save.");
    }

    var configuredRewardItems = getCurrentLevelClearRewardItems(this.currentLevelConfig);
    var awardedRewardItems = resolveAwardedClearRewardItems(configuredRewardItems, isFirstCompletion);
    if (awardedRewardItems.length === 0) {
      return [];
    }

    this._refreshPlayerResources();
    var resources = this.playerResources;
    if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
      throw new Error("Level clear reward requires player resources.");
    }

    awardedRewardItems.forEach(function (item) {
      if (item.id === "coin") {
        resources.coins = requireNonNegativeInteger(resources.coins, "Player coins") + item.count;
        return;
      }
      if (item.id === "stamina") {
        resources.stamina = requireNonNegativeInteger(resources.stamina, "Player stamina") + item.count;
        return;
      }
      throw new Error("Unsupported level clear reward item id: " + item.id);
    });

    this.playerResources = resources;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return clone(awardedRewardItems);
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
      this._setStatus("Loading level for route editor: level_" + ("000" + levelId).slice(-3));
      this._loadLevelById(levelId, "Route editor level loaded", "Load selected level for route editor failed.");
      return;
    }

    if (typeof this._showStartGameView !== "function") {
      throw new Error("Level select requires StartGameView entry method.");
    }
    this._showStartGameView(levelId);
  }
};
