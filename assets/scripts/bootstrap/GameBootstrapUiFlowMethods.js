"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var RouteEditorState = require("./RouteEditorState");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var LevelSelectView = require("./LevelSelectView");
var BootstrapButtonFactory = require("./BootstrapButtonFactory");
var StarRatingPolicy = require("../core/StarRatingPolicy");

module.exports = {
  _createStatusOverlay: function () {
    if (!DebugFlags.get("overlay")) {
      return;
    }

    var node = new cc.Node("BootstrapStatus");
    node.parent = this.node;
    node.zIndex = 100;

    var widget = node.addComponent(cc.Widget);
    widget.isAlignTop = true;
    widget.isAlignLeft = true;
    widget.top = 32;
    widget.left = 24;

    var label = node.addComponent(cc.Label);
    label.fontSize = 24;
    label.lineHeight = 32;
    label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    label.verticalAlign = cc.Label.VerticalAlign.TOP;
    label.string = "";

    node.color = cc.color(255, 255, 255);
    this._statusLabel = label;
  },

  _onNextLevelTap: function () {
    if (!this.currentLevelConfig || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    var nextLevelId = (this.currentLevelConfig.level.levelId || 1) + 1;
    this._setStatus("Loading level_" + ("000" + nextLevelId).slice(-3) + "...");
    this._loadLevelById(nextLevelId, "Next level started", "No next level available.");
  },

  _onBackToLevelTap: function () {
    if (this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showLevelSelectView();
  },

  _loadLevelById: function (levelId, successLogPrefix, failStatusMessage) {
    this._persistRouteEditorIfDirty();
    this.isRestarting = true;
    this._setDropTestButtonVisible(false);
    this._lastRuntimeState = null;
    this.levelManager.loadLevel(levelId).then(function (levelConfig) {
      this.currentLevelConfig = levelConfig;
      this._currentLevelId = Math.max(1, Number(levelId) || 1);
      this._rememberSelectedLevel(this._currentLevelId);
      this._prepareRouteEditorForLevel(levelConfig, this._currentLevelId);
      var snapshot = this.gameManager.startLevel(levelConfig);
      this._lastRuntimeState = snapshot ? snapshot.state : null;
      return this.levelRenderer.renderLevel(levelConfig, snapshot).then(function () {
        try {
          if (this._pendingRouteEditorAutoEnable) {
            this._routeEditorState.enabled = true;
            this._pendingRouteEditorAutoEnable = false;
          }
          this.isRestarting = false;
          this.isSelectingLevel = false;
          this._hideLevelSelectView();
          this._setDropTestButtonVisible(true);
          this._renderRouteEditor();
          this._refreshRouteEditorButtons();
          this._setStatus(this._formatStatus(levelConfig, snapshot));
          this._playGameplayBackgroundMusic();
          this._playSfx("levelStart");
          Logger.info(successLogPrefix || "Level started", levelConfig.level.code);
        } catch (postLoadError) {
          // 渲染已完成时，后处理异常不应误判为“关卡加载失败”。
          this.isRestarting = false;
          this.isSelectingLevel = false;
          var postLoadMessage = postLoadError && postLoadError.stack
            ? postLoadError.stack
            : (postLoadError && postLoadError.message ? postLoadError.message : String(postLoadError));
          Logger.warn("Post-load UI sync failed", postLoadMessage);
        }
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._pendingRouteEditorAutoEnable = false;
      this._setDropTestButtonVisible(!!this.currentLevelConfig && !this.isSelectingLevel);
      this._refreshRouteEditorButtons();
      this._setStatus(failStatusMessage || "Load level failed. Check console logs.");
      var errorMessage = error && error.stack
        ? error.stack
        : (error && error.message ? error.message : String(error));
      Logger.error("Load level failed detail", errorMessage);
    }.bind(this));
  },

  _createDropTestButton: function () {
    if (!this.showDropTestButton) {
      return;
    }

    var button = BootstrapButtonFactory.createDropTestButton({
      parentNode: this.node,
      onTap: function () {
        this._onDropTestButtonTap();
      }.bind(this)
    });
    this._dropTestButton = button ? button.node : null;
    this._setDropTestButtonVisible(false);
  },

  _createRouteEditorButtons: function () {
    if (!this.enableLevelEditor) {
      return;
    }

    this._routeEditorButtons.toggle = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorToggleButton",
      parentNode: this.node,
      labelText: "路线编辑: 关",
      width: 210,
      height: 64,
      left: 24,
      bottom: 24,
      fillColor: cc.color(74, 113, 124, 220),
      outlineColor: cc.color(26, 50, 58),
      onTap: this._onRouteEditorToggleTap.bind(this)
    });

    this._routeEditorButtons.newRoute = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorNewButton",
      parentNode: this.node,
      labelText: "新路线",
      width: 180,
      height: 58,
      left: 24,
      bottom: 96,
      fillColor: cc.color(84, 147, 110, 220),
      outlineColor: cc.color(32, 73, 48),
      onTap: this._onRouteEditorNewTap.bind(this)
    });

    this._routeEditorButtons.undo = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorUndoButton",
      parentNode: this.node,
      labelText: "撤销点",
      width: 180,
      height: 58,
      left: 24,
      bottom: 162,
      fillColor: cc.color(166, 123, 72, 220),
      outlineColor: cc.color(97, 60, 24),
      onTap: this._onRouteEditorUndoTap.bind(this)
    });

    this._routeEditorButtons.clear = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorClearButton",
      parentNode: this.node,
      labelText: "清空当前",
      width: 180,
      height: 58,
      left: 24,
      bottom: 228,
      fillColor: cc.color(164, 91, 91, 220),
      outlineColor: cc.color(92, 37, 37),
      onTap: this._onRouteEditorClearTap.bind(this)
    });

    this._routeEditorButtons.save = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorSaveButton",
      parentNode: this.node,
      labelText: "保存路线",
      width: 180,
      height: 58,
      left: 24,
      bottom: 294,
      fillColor: cc.color(74, 123, 185, 220),
      outlineColor: cc.color(30, 62, 108),
      onTap: this._onRouteEditorSaveTap.bind(this)
    });

    this._refreshRouteEditorButtons();
  },

  _createEmptyRouteEditorState: function () {
    return RouteEditorState.createEmptyState();
  },

  _syncRouteEditorButtonHosts: function () {
    if (!this._routeEditorButtons || !this._routeEditorButtons.toggle) {
      return;
    }

    var toggleButton = this._routeEditorButtons.toggle.node;
    if (!toggleButton || !toggleButton.isValid) {
      return;
    }

    var targetParent = (this.isSelectingLevel && this._levelSelectNode && this._levelSelectNode.isValid)
      ? this._levelSelectNode
      : this.node;
    if (!targetParent || !targetParent.isValid) {
      return;
    }

    if (toggleButton.parent !== targetParent) {
      toggleButton.parent = targetParent;
    }

    toggleButton.zIndex = targetParent === this._levelSelectNode ? 220 : 125;
    var widget = toggleButton.getComponent(cc.Widget);
    if (widget && widget.updateAlignment) {
      widget.updateAlignment();
    }
  },

  _prepareRouteEditorForLevel: function (levelConfig, levelId) {
    var levelCode = levelConfig && levelConfig.level ? levelConfig.level.code : "";
    var routes = this.routeConfigStore.getRoutesForLevel(this.routeConfig, levelId, levelCode);
    this._routeEditorState = RouteEditorState.createStateForLevel(levelId, levelCode, routes);
  },

  _isRouteEditorCapturingInput: function () {
    return !!(
      this.enableLevelEditor &&
      this.currentLevelConfig &&
      this._routeEditorState &&
      this._routeEditorState.enabled &&
      !this.isRestarting &&
      !this.isSelectingLevel
    );
  },

  _getActiveRouteEditorRoute: function () {
    return RouteEditorState.getActiveRoute(this._routeEditorState);
  },

  _createRouteEditorRoute: function () {
    return RouteEditorState.createRoute(this._routeEditorState);
  },

  _ensureActiveRouteEditorRoute: function (autoCreate) {
    return RouteEditorState.ensureActiveRoute(this._routeEditorState, autoCreate);
  },

  _appendRouteEditorPoint: function (route, point, force) {
    var minDistance = Math.max(4, Number(this.routePointMinDistance) || 18);
    return RouteEditorState.appendPoint(this._routeEditorState, route, point, minDistance, force);
  },

  _renderRouteEditor: function () {
    if (!this.levelRenderer || !this.levelRenderer.renderRouteEditor) {
      return;
    }

    if (!this.currentLevelConfig || this.isSelectingLevel) {
      this.levelRenderer.renderRouteEditor(null);
      return;
    }

    this.levelRenderer.renderRouteEditor(this._routeEditorState);
  },

  _refreshRouteEditorButtons: function () {
    if (!this.enableLevelEditor || !this._routeEditorButtons) {
      return;
    }

    this._syncRouteEditorButtonHosts();

    var hasLevel = !!this.currentLevelConfig && !this.isSelectingLevel;
    var inLevelSelect = !!this.isSelectingLevel;
    var isEditing = !!(this._routeEditorState && this._routeEditorState.enabled);
    var activeRoute = this._getActiveRouteEditorRoute();
    var dirtyText = this._routeEditorState && this._routeEditorState.dirty ? " *" : "";

    if (this._routeEditorButtons.toggle) {
      this._routeEditorButtons.toggle.node.active = hasLevel || inLevelSelect;
      this._routeEditorButtons.toggle.label.string = inLevelSelect
        ? ("编辑模式: " + (this._levelSelectRouteEditorMode ? "开" : "关"))
        : ("路线编辑: " + (isEditing ? "开" : "关") + dirtyText);
    }

    ["newRoute", "undo", "clear", "save"].forEach(function (key) {
      if (!this._routeEditorButtons[key]) {
        return;
      }
      this._routeEditorButtons[key].node.active = hasLevel && isEditing;
    }, this);

    if (this._routeEditorButtons.newRoute) {
      this._routeEditorButtons.newRoute.label.string = "新路线";
    }
    if (this._routeEditorButtons.undo) {
      this._routeEditorButtons.undo.label.string = activeRoute && activeRoute.points.length > 0
        ? "撤销点"
        : "撤销点";
    }
    if (this._routeEditorButtons.clear) {
      this._routeEditorButtons.clear.label.string = "清空当前";
    }
    if (this._routeEditorButtons.save) {
      var routeCount = this._routeEditorState && Array.isArray(this._routeEditorState.routes)
        ? this._routeEditorState.routes.filter(function (route) {
          return route && Array.isArray(route.points) && route.points.length > 0;
        }).length
        : 0;
      this._routeEditorButtons.save.label.string = "保存路线(" + routeCount + ")";
    }
  },

  _handleRouteEditorTouchStart: function (localPoint) {
    var route = this._ensureActiveRouteEditorRoute(true);
    this._routeEditorState.isDrawing = true;
    if (this._appendRouteEditorPoint(route, localPoint, true)) {
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus("路线点已记录: " + route.name + " -> (" + Math.round(localPoint.x) + ", " + Math.round(localPoint.y) + ")");
    }
  },

  _handleRouteEditorTouchMove: function (localPoint) {
    if (!this._routeEditorState.isDrawing) {
      return;
    }

    var route = this._ensureActiveRouteEditorRoute(true);
    if (this._appendRouteEditorPoint(route, localPoint, false)) {
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
    }
  },

  _handleRouteEditorTouchEnd: function (localPoint) {
    var route = this._ensureActiveRouteEditorRoute(true);
    if (this._routeEditorState.isDrawing && route) {
      this._appendRouteEditorPoint(route, localPoint, false);
    }

    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
  },

  _handleRouteEditorTouchCancel: function () {
    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
  },

  _onRouteEditorToggleTap: function () {
    if (this.isSelectingLevel) {
      this._levelSelectRouteEditorMode = !this._levelSelectRouteEditorMode;
      this._pendingRouteEditorAutoEnable = false;
      this._refreshRouteEditorButtons();
      if (this._levelSelectNode && this._levelSelectViewPrefab && this._levelButtonPrefab) {
        this._loadAvailableLevelIds().then(function (levelIds) {
          this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelButtonPrefab, levelIds);
        }.bind(this));
      }
      this._setStatus(this._levelSelectRouteEditorMode
        ? "路线编辑模式已开启，请选择要编辑的关卡"
        : "路线编辑模式已关闭，点击关卡将直接开始");
      return;
    }

    if (!this.currentLevelConfig || !this._routeEditorState) {
      return;
    }

    this._routeEditorState.enabled = !this._routeEditorState.enabled;
    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus(this._routeEditorState.enabled ? "路线编辑已开启" : "路线编辑已关闭");
  },

  _onRouteEditorNewTap: function () {
    if (!this._routeEditorState || !this.currentLevelConfig) {
      return;
    }

    var route = this._createRouteEditorRoute();
    this._routeEditorState.routes.push(route);
    this._routeEditorState.activeRouteId = route.id;
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("已创建新路线: " + route.name);
  },

  _onRouteEditorUndoTap: function () {
    var route = this._getActiveRouteEditorRoute();
    if (!route || !route.points.length) {
      return;
    }

    route.points.pop();
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("已撤销最后一个路线点");
  },

  _onRouteEditorClearTap: function () {
    var route = this._getActiveRouteEditorRoute();
    if (!route) {
      return;
    }

    route.points = [];
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("当前路线已清空: " + route.name);
  },

  _persistRouteEditorIfDirty: function (allowBrowserDownload, forceSave) {
    if (!this._routeEditorState || (!this._routeEditorState.dirty && !forceSave)) {
      return null;
    }

    var routesToSave = RouteEditorState.collectRoutesForSave(this._routeEditorState);

    this.routeConfig = this.routeConfigStore.upsertLevelRoutes(
      this.routeConfig,
      this._routeEditorState.levelId,
      this._routeEditorState.levelCode,
      routesToSave
    );
    var persisted = this.routeConfigStore.save(this.routeConfig, {
      allowBrowserDownload: !!allowBrowserDownload
    });
    this.routeConfig = persisted.config;
    RouteEditorState.applySavedRoutes(this._routeEditorState, routesToSave);
    return persisted;
  },

  _onRouteEditorSaveTap: function () {
    if (!this._routeEditorState || !this.currentLevelConfig) {
      return;
    }

    var persisted = this._persistRouteEditorIfDirty(true, true);
    this._refreshRouteEditorButtons();
    var target = persisted ? persisted.saveResult : this.routeConfigStore.describeTarget();
    this._setStatus("路线配置已保存: " + target.path);
  },

  _onDropTestButtonTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this._isTerminalState()) {
      return;
    }

    var snapshot = this.gameManager.debugDropBottomRow();
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _setStatus: function (message) {
    if (message === this._lastStatusMessage) {
      return;
    }
    this._lastStatusMessage = message;

    if (this._statusLabel) {
      this._statusLabel.string = message;
    }

    Logger.info(message);
  },

  _formatStatus: function (levelConfig, snapshot) {
    var matched = snapshot.lastResolution ? snapshot.lastResolution.matched.length : 0;
    var floating = snapshot.lastResolution ? snapshot.lastResolution.floating.length : 0;
    var collected = snapshot.jars ? snapshot.jars.collectedTotal : 0;
    var objective = snapshot.jars ? snapshot.jars.objectiveTarget : 0;
    var winStats = snapshot.winStats || {};
    var scoreHeatBand = winStats.scoreHeatBand || null;
    var scoreBandText = scoreHeatBand
      ? [scoreHeatBand.min, scoreHeatBand.target, scoreHeatBand.max].join("/")
      : "-";

    return [
      "Stage 3 flow ready",
      "Level: " + levelConfig.level.code,
      "State: " + snapshot.state,
      "Score: " + snapshot.score,
      "Score Band(min/target/max): " + scoreBandText,
      "Shots: " + snapshot.remainingShots,
      "Current/Next: " + snapshot.shooter.currentColor + "/" + snapshot.shooter.nextColor,
      "Grid cells: " + snapshot.board.cellCount,
      "MatchDrop/FloatingDrop: " + matched + "/" + floating,
      "Collected: " + collected + (objective ? ("/" + objective) : ""),
      "Projectile: " + (snapshot.activeProjectile ? snapshot.activeProjectile.color : "none")
    ].join("\n");
  },

  _setDropTestButtonVisible: function (visible) {
    if (!this._dropTestButton || !cc.isValid(this._dropTestButton)) {
      return;
    }

    this._dropTestButton.active = !!(this.showDropTestButton && visible);
  },

  _showLevelSelectView: function () {
    if (this.isRestarting) {
      return;
    }

    this._persistRouteEditorIfDirty();
    this.isSelectingLevel = true;
    this.currentLevelConfig = null;
    this._lastRuntimeState = null;
    this._setDropTestButtonVisible(false);
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("Loading level list...");
    this._refreshLevelProgress();

    Promise.all([
      this._ensureLevelSelectPrefabs(),
      this._loadAvailableLevelIds()
    ]).then(function (results) {
      var prefabs = results[0];
      var levelIds = results[1];
      this._preloadLevelConfigsInBackground(levelIds);
      this._renderLevelSelectContent(prefabs.viewPrefab, prefabs.buttonPrefab, levelIds);
      this._playLevelSelectBackgroundMusic();
      this._setStatus("请选择关卡");
    }.bind(this)).catch(function (error) {
      this.isSelectingLevel = false;
      this._setStatus("Load level list failed. Fallback to startup level...");
      Logger.error(error);
      this._loadInitialLevel();
    }.bind(this));
  },

  _hideLevelSelectView: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    this._levelSelectNode.active = false;
  },

  _ensureLevelSelectPrefabs: function () {
    if (this._levelSelectViewPrefab && this._levelButtonPrefab) {
      return Promise.resolve({
        viewPrefab: this._levelSelectViewPrefab,
        buttonPrefab: this._levelButtonPrefab
      });
    }

    return Promise.all([
      this._loadPrefab("prefabs/ui/LevelView"),
      this._loadPrefab("prefabs/game/Level_btn")
    ]).then(function (prefabs) {
      this._levelSelectViewPrefab = prefabs[0];
      this._levelButtonPrefab = prefabs[1];
      return {
        viewPrefab: this._levelSelectViewPrefab,
        buttonPrefab: this._levelButtonPrefab
      };
    }.bind(this));
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

        if (!this._levelSelectViewPrefab || !this._levelButtonPrefab) {
          return resolvedLevelIds;
        }

        this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelButtonPrefab, resolvedLevelIds);
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

  _renderLevelSelectContent: function (levelViewPrefab, levelButtonPrefab, levelIds) {
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    var highlightedLevelId = this._resolveHighlightedLevelId(levelIds, highestUnlocked);
    var renderResult = LevelSelectView.renderLevelSelectContent({
      hostNode: this.node,
      existingLevelSelectNode: this._levelSelectNode,
      levelViewPrefab: levelViewPrefab,
      levelButtonPrefab: levelButtonPrefab,
      levelIds: levelIds,
      levelSelectRouteEditorMode: this._levelSelectRouteEditorMode,
      highestUnlocked: highestUnlocked,
      highlightedLevelId: highlightedLevelId,
      getLevelStarCount: this._getLevelStarCount.bind(this),
      isLevelCompleted: this._isLevelCompleted.bind(this),
      onLevelSelectTap: this._onLevelSelectTap.bind(this)
    });
    this._levelSelectNode = renderResult.levelViewNode;

    this._refreshRouteEditorButtons();
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
      this._setStatus("加载关卡并进入路线编辑: level_" + ("000" + levelId).slice(-3));
      this._loadLevelById(levelId, "Route editor level loaded", "Load selected level for route editor failed.");
      return;
    }

    this._setStatus("Loading level_" + ("000" + levelId).slice(-3) + "...");
    this._loadLevelById(levelId, "Level selected", "Load selected level failed. Check console logs.");
  }
};
