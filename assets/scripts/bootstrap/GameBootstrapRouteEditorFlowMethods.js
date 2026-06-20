"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var RouteEditorState = Shared.RouteEditorState;
var BootstrapButtonFactory = Shared.BootstrapButtonFactory;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;

module.exports = {
  _loadLevelById: function (levelId, successLogPrefix, failStatusMessage) {
    this._recordCurrentAttemptQuit("start_new_level");
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
    this.isRestarting = true;
    this._currentLevelEnteredByTestUnlock = false;
    this._currentLevelAwardedClearRewardItems = [];
    this._setDropTestButtonVisible(false);
    this._lastRuntimeState = null;
    return this._ensureGameplayKernel().then(function () {
      return this.levelManager.loadLevel(levelId);
    }.bind(this)).then(function (levelConfig) {
      this.currentLevelConfig = levelConfig;
      this._currentLevelId = Math.max(1, Number(levelId) || 1);
      this._currentRunContext = {
        mode: "campaign",
        levelId: this._currentLevelId
      };
      this._rememberSelectedLevel(this._currentLevelId);
      this._prepareRouteEditorForLevel(levelConfig, this._currentLevelId);
      var snapshot = this.gameManager.startLevel(levelConfig);
      if (typeof this._applySelectedPowerupsToRuntime === "function") {
        snapshot = this._applySelectedPowerupsToRuntime(snapshot);
      }
      if (typeof this._applyPendingNextRoundRewards === "function") {
        snapshot = this._applyPendingNextRoundRewards(snapshot);
      }
      if (typeof this._beginLevelAttemptTracking === "function") {
        this._beginLevelAttemptTracking(levelConfig, snapshot);
      }
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
          Logger.info(successLogPrefix || "Level started", levelConfig.level.code);
          this._logAssetManagerStats("gameplay");
          this._syncSpecialIntroduceForRuntimeSnapshot(snapshot);
          return this._showNewUserGuideForGameplay();
        } catch (postLoadError) {
          // 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈缁犳壆绱掔€ｎ偒鍎ラ柛銈嗘礋閺屾盯顢曢敐鍡欘槰闂佺顑呴崐鍧楀箖濡ゅ懏鏅查幖瀛樼箖閸犳岸姊洪崫銉ユ瀻闁硅櫕锕㈠濠氭偄閾忓湱锛滃┑鈽嗗灥濞咃綁顢栭崒鐐粹拺闁告繂瀚ˉ鐐碘偓鍏夊亾闁归棿绀侀拑鐔兼煟閺冨洢鈧偓闁稿鎸搁埥澶娾枍椤撗傜凹闁逛究鍔戝畷濂告偄閸撲胶鐣鹃梻浣虹帛閸旀牞銇愰崘顔肩劦妞ゆ巻鍋撴繛灏栤偓鎰佸殨妞ゆ劑鍩勯崥瀣煕閵夘垶妾柛鏇炲暣濮婃椽宕楅梻纾嬪焻闂佺閰ｆ禍鍫曞春閳ь剚銇勯幒鎴濐仾婵炴嚪鍕╀簻妞ゆ挴鍓濈涵鍫曟煙閻熸澘顏€规洦鍋婂畷鐔煎礂閸濄儳锛涢梻鍌氬€峰ù鍥敋閺嶎厼绐楅柡宥庡幗閺呮繈鏌曢崼婵愭▓闁轰礁顑夐弻銊モ攽閸♀晜笑缂佺偓鍎抽崥瀣箞閵娿儙鐔煎传閸曨喖鐓橀梻浣虹帛閹稿宕归崜浣瑰床婵炴垯鍨圭粻锝夋煟閹邦厽缍戠痪鏉跨Ф缁辨挻鎷呴崜鍙壭﹀銈嗘处閸欏啴骞婇悙鐑樼劶鐎广儱妫楀▓銈咁渻閵堝棗绗傜紒鈧笟鈧幃鐢稿级濞嗙偓瀵岄梺闈涚墕濡稒鏅堕鍕厾鐟滅増甯為悾娲煙椤旀枻鑰挎鐐存崌楠炴帡宕卞鍡樼秾闂傚倷娴囬～澶愬磿瀹曞洨涓嶇€广儱顦悞鍨亜閹达絾顥夊ù婊堢畺濮婄粯绗熼埀顒勫焵椤掑倸浠滈柤娲诲灡閺呭爼顢涘鍛紲濡炪倖妫侀崑鎰版倿閸濄儮鍋撶憴鍕┛缂傚秮鍋撳銈忕畱濠€閬嶅焵椤掑喚娼愭繛娴嬫櫇閹广垹鈹戠€ｎ亜鐎俊銈忕到閸燁偆绮堥崘顏佸亾閻熸澘顥忛柛鐘愁殕缁轰粙寮介鐔叉嫼闂佸憡绻傜€氬嘲危濞差亝鐓曢悗锝庡墮瀛濋柧鑽ゅ仱閺屾盯寮撮妸銉т哗婵℃鎳樺娲偡闁箑娈舵繝娈垮枤閺佹悂鍩€椤掍浇澹樻い顓犲厴瀵寮撮悢椋庣獮闂佺硶鍓濋敋婵炲懏宀稿铏圭矙濞嗘儳鍓遍梺鐟版啞閹倿宕洪悙鍝勭闁挎洍鍋撶紒鈧€ｎ喗鐓忓┑鐐茬仢閸旀瑥顭?          this.isRestarting = false;
          this.isSelectingLevel = false;
          var postLoadMessage = postLoadError && postLoadError.stack
            ? postLoadError.stack
            : (postLoadError && postLoadError.message ? postLoadError.message : String(postLoadError));
          Logger.warn("Post-load UI sync failed", postLoadMessage);
        }
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      if (typeof this._refundPendingStartGameTemporaryPowerups === "function") {
        this._refundPendingStartGameTemporaryPowerups();
      }
      this._pendingStartGamePowerups = [];
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
      labelText: "Route Edit: Off",
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
      labelText: "New Route",
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
      labelText: "Undo Point",
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
      labelText: "Clear Current",
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
      labelText: "Save Routes",
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
        ? ("Edit Mode: " + (this._levelSelectRouteEditorMode ? "On" : "Off"))
        : ("Route Edit: " + (isEditing ? "On" : "Off") + dirtyText);
    }

    ["newRoute", "undo", "clear", "save"].forEach(function (key) {
      if (!this._routeEditorButtons[key]) {
        return;
      }
      this._routeEditorButtons[key].node.active = hasLevel && isEditing;
    }, this);

    if (this._routeEditorButtons.newRoute) {
      this._routeEditorButtons.newRoute.label.string = "New Route";
    }
    if (this._routeEditorButtons.undo) {
      this._routeEditorButtons.undo.label.string = activeRoute && activeRoute.points.length > 0
        ? "Undo Point"
        : "Undo Point";
    }
    if (this._routeEditorButtons.clear) {
      this._routeEditorButtons.clear.label.string = "Clear Current";
    }
    if (this._routeEditorButtons.save) {
      var routeCount = this._routeEditorState && Array.isArray(this._routeEditorState.routes)
        ? this._routeEditorState.routes.filter(function (route) {
          return route && Array.isArray(route.points) && route.points.length > 0;
        }).length
        : 0;
      this._routeEditorButtons.save.label.string = "Save Routes(" + routeCount + ")";
    }
  },

  _handleRouteEditorTouchStart: function (localPoint) {
    var route = this._ensureActiveRouteEditorRoute(true);
    this._routeEditorState.isDrawing = true;
    if (this._appendRouteEditorPoint(route, localPoint, true)) {
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus("Route point recorded: " + route.name + " -> (" + Math.round(localPoint.x) + ", " + Math.round(localPoint.y) + ")");
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
      if (
        this._levelSelectNode &&
        this._levelSelectViewPrefab &&
        Array.isArray(this._levelMapPrefabs) &&
        this._levelMapPrefabs.length > 0
      ) {
        this._loadAvailableLevelIds().then(function (levelIds) {
          this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, levelIds);
        }.bind(this));
      }
      this._setStatus(this._levelSelectRouteEditorMode
        ? "Route editor mode enabled, select a level to edit"
        : "Route editor mode disabled, tap level to start");
      return;
    }

    if (!this.currentLevelConfig || !this._routeEditorState) {
      return;
    }

    this._routeEditorState.enabled = !this._routeEditorState.enabled;
    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus(this._routeEditorState.enabled ? "Route editor enabled" : "Route editor disabled");
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
    this._setStatus("New route created: " + route.name);
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
    this._setStatus("Last route point removed");
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
    this._setStatus("Current route cleared: " + route.name);
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
    this._setStatus("闂傚倸鍊峰ù鍥х暦閸偅鍙忕€规洖娲︽刊浼存煥閺囩偛鈧悂宕归崒鐐寸厵闁诡垳澧楅ˉ澶愭煕濮橆剛绉烘鐐寸墪鑿愭い鎺嗗亾濠碘€茬矙閺岋綁骞橀姘闂備浇顕ф鍝ョ不瀹ュ纾块柛妤冧紳濞差亜惟闁宠桨绀侀崵鎴︽⒑缁嬫寧婀板瑙勬礋瀹曟垿骞橀懜闈涙瀭闂佸憡娲﹂崢浠嬪箟濞嗘挻鍊垫繛鍫濈仢閺嬬喖鏌熼幖浣虹暫妤犵偞鍨挎慨鈧柣娆屽亾婵炲皷鏅犻弻鐔煎礂閸濄儺妲繛? " + target.path);
  },

  _onDropTestButtonTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this._isTerminalState()) {
      return;
    }

    var snapshot = this.gameManager.debugDropBottomRow();
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  }
};
