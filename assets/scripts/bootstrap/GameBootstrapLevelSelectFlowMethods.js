"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var LevelSelectPolicy = Shared.LevelSelectPolicy;
var LevelSelectView = Shared.LevelSelectView;
var StarRatingPolicy = Shared.StarRatingPolicy;
var MAX_LEVEL_MAP_PREFAB_INDEX = Shared.MAX_LEVEL_MAP_PREFAB_INDEX;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;

module.exports = {
  _showLevelSelectView: function (options) {
    options = options || {};
    if (this.isRestarting) {
      return;
    }

    var targetLevelId = Math.max(0, Math.floor(Number(options.targetLevelId) || 0));
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
    hideGameCircleWelfareViewNode(this);
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
      var forcedMapIndex = Number.isInteger(options.forcedMapIndex)
        ? Math.max(0, Math.floor(Number(options.forcedMapIndex) || 0))
        : null;
      if (forcedMapIndex === null && targetLevelId > 0) {
        forcedMapIndex = this._resolveLevelMapIndexByLevelId(levelIds, targetLevelId, prefabs.mapPrefabs);
      }
      this._renderLevelSelectContent(prefabs.viewPrefab, prefabs.mapPrefabs, levelIds, forcedMapIndex);
      this._updateSignInEntryState();
      if (typeof this._updateInventoryEntryState === "function") {
        this._updateInventoryEntryState();
      }
      this._updateStarChestEntryState();
      this._ensureShopEntryButton();
      if (typeof this._ensureGameCircleEntryButton === "function") {
        this._ensureGameCircleEntryButton();
      }
      this._maybeAutoShowSignInView();
      this._playLevelSelectBackgroundMusic();
      this._setStatus("Please select a level");
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
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._clearPendingLevelEntry === "function") {
      this._clearPendingLevelEntry();
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
      Array.isArray(this._levelMapPrefabs) &&
      this._levelMapPrefabs.length > 0
    ) {
      return Promise.resolve({
        viewPrefab: this._levelSelectViewPrefab,
        mapPrefabs: this._levelMapPrefabs
      });
    }

    var prefabLoadTasks = [this._loadPrefab("prefabs/ui/LevelView")];
    for (var mapIndex = 1; mapIndex <= MAX_LEVEL_MAP_PREFAB_INDEX; mapIndex += 1) {
      prefabLoadTasks.push(this._tryLoadFirstAvailablePrefab([
        "prefabs/ui/LevelMap" + mapIndex,
        "prefabs/ui/levelMap" + mapIndex,
        "prefabs/game/LevelMap" + mapIndex
      ], {
        silent: true
      }));
    }

    return Promise.all(prefabLoadTasks).then(function (prefabs) {
      this._levelSelectViewPrefab = prefabs[0];
      this._levelMapPrefabs = prefabs.slice(1).filter(function (prefab) {
        return !!prefab;
      });
      if (this._levelMapPrefabs.length === 0) {
        Logger.warn("No level map prefabs available, LevelView will show without map content.");
      }
      return {
        viewPrefab: this._levelSelectViewPrefab,
        mapPrefabs: this._levelMapPrefabs
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
          !Array.isArray(this._levelMapPrefabs) ||
          this._levelMapPrefabs.length === 0
        ) {
          return resolvedLevelIds;
        }

        this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, resolvedLevelIds);
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

  _renderLevelSelectContent: function (levelViewPrefab, mapPrefabs, levelIds, forcedMapIndex) {
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    var highlightedLevelId = this._resolveHighlightedLevelId(levelIds, highestUnlocked);
    var renderResult = LevelSelectView.renderLevelSelectContent({
      hostNode: this.node,
      existingLevelSelectNode: this._levelSelectNode,
      levelViewPrefab: levelViewPrefab,
      mapPrefabs: mapPrefabs,
      levelIds: levelIds,
      levelSelectRouteEditorMode: this._levelSelectRouteEditorMode,
      highestUnlocked: highestUnlocked,
      highlightedLevelId: highlightedLevelId,
      currentMapIndex: Number.isInteger(forcedMapIndex) ? forcedMapIndex : this._levelSelectMapIndex,
      getLevelStarCount: this._getLevelStarCount.bind(this),
      isLevelCompleted: this._isLevelCompleted.bind(this),
      staminaValue: this._getCurrentStamina(),
      coinValue: this._getCurrentCoins(),
      onOpenSettings: this._onLevelSelectSettingTap.bind(this),
      onOpenRanking: this._onLevelSelectRankingTap.bind(this),
      onOpenInventory: this._showInventoryView.bind(this),
      onOpenStarChest: this._openStarChest.bind(this),
      onOpenShop: this._onLevelSelectShopTap.bind(this),
      onLevelSelectTap: this._onLevelSelectTap.bind(this),
      onMapIndexChange: this._onLevelSelectMapIndexChange.bind(this)
    });
    this._levelSelectNode = renderResult.levelViewNode;
    this._levelSelectMapIndex = Number.isInteger(renderResult.currentMapIndex)
      ? renderResult.currentMapIndex
      : 0;
    this._levelMapPrefabs = Array.isArray(mapPrefabs) ? mapPrefabs.slice() : [];
    if (!renderResult || (Number(renderResult.mapCount) || 0) <= 0) {
      Logger.warn("Level select rendered without map prefab content.");
      this._setStatus("Level map missing. Please check LevelMap1 prefab resources.");
    }

    this._refreshRouteEditorButtons();
    this._updateSignInEntryState();
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    this._updateStarChestEntryState();
    this._ensureShopEntryButton();
    if (typeof this._ensureGameCircleEntryButton === "function") {
      this._ensureGameCircleEntryButton();
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
      !Array.isArray(this._levelMapPrefabs) ||
      this._levelMapPrefabs.length === 0
    ) {
      return;
    }

    this._loadAvailableLevelIds().then(function (levelIds) {
      if (this.isRestarting || !this.isSelectingLevel) {
        return;
      }
      this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, levelIds, targetMapIndex);
    }.bind(this)).catch(function (error) {
      Logger.warn("Switch level map failed", error && error.message ? error.message : error);
    });
  },

  _refreshLevelProgress: function () {
    this.levelProgress = this.levelProgressStore.load();
    if (!this.levelProgress || typeof this.levelProgress !== "object") {
      this.levelProgress = {
        highestUnlockedLevel: 1,
        selectedLevelId: 1,
        completedLevels: {},
        starsByLevel: {}
      };
    }
  },

  _rememberSelectedLevel: function (levelId) {
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
      this._recordCurrentLevelWin(snapshot);
    } else if (
      currentState !== previousState &&
      (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective")
    ) {
      this._playSfx("lose");
    }
    if (
      currentState !== previousState &&
      typeof this._onRuntimeStateTransition === "function"
    ) {
      this._onRuntimeStateTransition(snapshot, previousState, currentState);
    }
    this._lastRuntimeState = currentState;
  },

  _recordCurrentLevelWin: function (snapshot) {
    if (!this._currentLevelId) {
      return;
    }

    var stars = this._calculateStarRating(snapshot);
    this.levelProgress = this.levelProgressStore.recordCompletion(this.levelProgress, this._currentLevelId, stars);
    this.levelProgressStore.save(this.levelProgress);
    Logger.info("Level completion recorded", {
      levelId: this._currentLevelId,
      stars: stars
    });
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

    if (
      typeof this._hasAvailableInventoryForLevelEntry === "function" &&
      this._hasAvailableInventoryForLevelEntry()
    ) {
      if (typeof this._showInventoryView === "function") {
        this._showInventoryView({
          entryLevelId: levelId
        });
        return;
      }
    }

    if (typeof this._enterLevelFromLevelSelect === "function") {
      this._enterLevelFromLevelSelect(levelId);
      return;
    }

    this._setStatus("Loading level_" + ("000" + levelId).slice(-3) + "...");
    this._loadLevelById(levelId, "Level selected", "Load selected level failed. Check console logs.");
  }
};
