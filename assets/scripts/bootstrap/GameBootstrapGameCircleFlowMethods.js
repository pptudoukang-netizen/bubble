"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var GameCircleWelfareViewController = Shared.GameCircleWelfareViewController;
var GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH = Shared.GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH;
var showStatusAndTip = Shared.showStatusAndTip;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;
var resolveGameCirclePlatform = Shared.resolveGameCirclePlatform;
var isGameCircleWelfareViewVisible = Shared.isGameCircleWelfareViewVisible;
var resolveGameCircleFailMessage = Shared.resolveGameCircleFailMessage;
var PopupPanelAnimator = Shared.PopupPanelAnimator;

var GAME_CIRCLE_AUTH_REQUIRED_MESSAGE = "请在微信小游戏环境下完成授权后再打开游戏圈福利";
var GAME_CIRCLE_PRIVACY_DENIED_ERROR = "GAME_CIRCLE_PRIVACY_DENIED";
var gameCirclePrivacyAuthorized = false;
var gameCirclePrivacyAuthorizationPending = false;
var gameCirclePrivacyAuthorizationCallbacks = [];
var gameCircleAuthorizationDenied = false;

function isGameCircleAuthDeniedError(error) {
  return !!(error && error.message === "GAME_CIRCLE_AUTH_DENIED");
}

function isGameCirclePrivacyDeniedError(error) {
  if (!error) {
    return false;
  }
  if (error.message === GAME_CIRCLE_PRIVACY_DENIED_ERROR) {
    return true;
  }
  if (typeof error.errno === "number" && error.errno === 104) {
    return true;
  }
  var message = error.message || error.errMsg || "";
  return typeof message === "string" && message.indexOf("privacy permission is not authorized") >= 0;
}

function isNetworkLoadingTimeoutError(host, error) {
  return !!(
    host &&
    typeof host._isNetworkLoadingTimeoutError === "function" &&
    host._isNetworkLoadingTimeoutError(error)
  );
}

function resolvePrivacyAuthorizationError(error) {
  if (isGameCirclePrivacyDeniedError(error)) {
    return new Error(GAME_CIRCLE_PRIVACY_DENIED_ERROR);
  }
  return new Error("wx.requirePrivacyAuthorize failed before using game circle APIs: " + JSON.stringify(error));
}

function flushGameCirclePrivacyAuthorizationCallbacks(error) {
  var callbacks = gameCirclePrivacyAuthorizationCallbacks.slice();
  gameCirclePrivacyAuthorizationCallbacks.length = 0;
  callbacks.forEach(function (callbackGroup) {
    if (error) {
      callbackGroup.reject(error);
      return;
    }
    callbackGroup.resolve(true);
  });
}

function requireGameCirclePrivacyAuthorization(host) {
  if (gameCirclePrivacyAuthorized === true) {
    return Promise.resolve(true);
  }
  var platform = resolveGameCirclePlatform(host);
  if (!platform || typeof platform.requirePrivacyAuthorize !== "function") {
    return Promise.reject(new Error("wx.requirePrivacyAuthorize is unavailable."));
  }

  return new Promise(function (resolve, reject) {
    gameCirclePrivacyAuthorizationCallbacks.push({
      resolve: resolve,
      reject: reject
    });
    if (gameCirclePrivacyAuthorizationPending === true) {
      return;
    }
    gameCirclePrivacyAuthorizationPending = true;
    platform.requirePrivacyAuthorize({
      success: function () {
        gameCirclePrivacyAuthorized = true;
        gameCirclePrivacyAuthorizationPending = false;
        flushGameCirclePrivacyAuthorizationCallbacks(null);
      },
      fail: function (error) {
        gameCirclePrivacyAuthorizationPending = false;
        flushGameCirclePrivacyAuthorizationCallbacks(resolvePrivacyAuthorizationError(error));
      }
    });
  });
}

function canRequestGameCircleData(host) {
  return !!(
    host.gameCircleButtonAdapter &&
    typeof host.gameCircleButtonAdapter.canGetGameClubData === "function" &&
    host.gameCircleButtonAdapter.canGetGameClubData() &&
    typeof host.gameCircleButtonAdapter.isSupported === "function" &&
    host.gameCircleButtonAdapter.isSupported()
  );
}

function refreshGameCircleMetricsWithLoading(host) {
  if (typeof host._runWithNetworkLoading !== "function") {
    throw new Error("Game circle welfare requires network loading runner.");
  }
  return host._runWithNetworkLoading(function () {
    return host.gameCircleWelfareService.refreshMetrics(new Date());
  }, {
    timeoutMs: host.networkLoadingTimeoutMs
  });
}

function openGameCircleSetting(host) {
  var platform = resolveGameCirclePlatform(host);
  if (!platform || typeof platform.openSetting !== "function") {
    return Promise.reject(new Error("wx.openSetting is unavailable."));
  }
  return new Promise(function (resolve, reject) {
    platform.openSetting({
      success: function (result) {
        if (!result || typeof result !== "object" || !result.authSetting || typeof result.authSetting !== "object") {
          reject(new Error("wx.openSetting returned invalid result for game circle."));
          return;
        }
        resolve(result.authSetting);
      },
      fail: function (error) {
        reject(new Error("wx.openSetting failed before opening game circle welfare: " + JSON.stringify(error)));
      }
    });
  });
}

function openGameCircleWelfareAfterSetting(host) {
  return openGameCircleSetting(host).then(function () {
    gameCircleAuthorizationDenied = false;
    return openGameCircleWelfareAfterAuthorization(host);
  }).catch(function (error) {
    if (isGameCircleAuthDeniedError(error)) {
      gameCircleAuthorizationDenied = true;
      return null;
    }
    if (isGameCirclePrivacyDeniedError(error)) {
      return null;
    }
    Logger.error("Open game circle setting failed", error && error.message ? error.message : error);
    showStatusAndTip(host, resolveGameCircleFailMessage(error));
    throw error;
  });
}

function openGameCircleWelfareAfterAuthorization(host) {
  if (!host.isSelectingLevel || host.isRestarting) {
    return null;
  }
  if (!host.gameCircleWelfareService || typeof host.gameCircleWelfareService.refreshMetrics !== "function") {
    showStatusAndTip(host, "游戏圈福利未就绪");
    return null;
  }
  if (!canRequestGameCircleData(host)) {
    showStatusAndTip(host, GAME_CIRCLE_AUTH_REQUIRED_MESSAGE);
    return null;
  }
  if (gameCircleAuthorizationDenied === true) {
    return openGameCircleWelfareAfterSetting(host);
  }

  return requireGameCirclePrivacyAuthorization(host).then(function () {
    return refreshGameCircleMetricsWithLoading(host);
  }).then(function () {
    host._showGameCircleWelfareView({
      refreshOnOpen: false
    });
  }).catch(function (error) {
    if (isGameCircleAuthDeniedError(error)) {
      gameCircleAuthorizationDenied = true;
      return null;
    }
    if (isGameCirclePrivacyDeniedError(error)) {
      return null;
    }
    if (isNetworkLoadingTimeoutError(host, error)) {
      showStatusAndTip(host, resolveGameCircleFailMessage(error));
      return null;
    }
    Logger.error("Open game circle welfare after authorization failed", error && error.message ? error.message : error);
    showStatusAndTip(host, resolveGameCircleFailMessage(error));
    throw error;
  });
}

module.exports = {
  _ensureGameCircleEntryRedDot: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      return null;
    }

    var redDotNode = entryNode.getChildByName("game_circle_red_dot");
    if (redDotNode && redDotNode.isValid) {
      return redDotNode;
    }

    redDotNode = new cc.Node("game_circle_red_dot");
    redDotNode.parent = entryNode;
    redDotNode.zIndex = 30;
    redDotNode.setPosition((entryNode.width * 0.5) - 12, (entryNode.height * 0.5) - 12);
    var graphics = redDotNode.addComponent(cc.Graphics);
    graphics.clear();
    graphics.fillColor = cc.color(255, 58, 58, 255);
    graphics.circle(0, 0, 10);
    graphics.fill();
    return redDotNode;
  },

  _ensureGameCircleEntryButton: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return null;
    }
    if (!this.gameCircleWelfareConfig || this.gameCircleWelfareConfig.enabled !== true) {
      return null;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    if (!bottomLayerNode || !bottomLayerNode.isValid) {
      throw new Error("LevelView prefab is missing bottom_layer for game_circle_btn.");
    }

    var entryNode = bottomLayerNode.getChildByName("game_circle_btn");
    if (!entryNode || !entryNode.isValid) {
      throw new Error("LevelView prefab is missing required game_circle_btn.");
    }
    entryNode.active = true;

    var sprite = entryNode.getComponent(cc.Sprite);
    if (!sprite) {
      throw new Error("game_circle_btn is missing cc.Sprite.");
    }
    if (!sprite.spriteFrame) {
      throw new Error("game_circle_btn is missing prefab spriteFrame.");
    }
    var button = entryNode.getComponent(cc.Button);
    if (!button) {
      throw new Error("game_circle_btn is missing cc.Button.");
    }
    button.interactable = true;
    button.enableAutoGrayEffect = false;

    this._bindNodeTapOnce(entryNode, function () {
      this._playSfx("uiClick");
      openGameCircleWelfareAfterAuthorization(this);
    }.bind(this));

    this._updateGameCircleEntryState();
    return entryNode;
  },

  _updateGameCircleEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }
    if (!this.gameCircleWelfareService || typeof this.gameCircleWelfareService.getSummary !== "function") {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    var entryNode = bottomLayerNode ? bottomLayerNode.getChildByName("game_circle_btn") : null;
    if (!entryNode || !entryNode.isValid) {
      return;
    }

    var summary = this.gameCircleWelfareService.getSummary(new Date());
    var redDotNode = this._ensureGameCircleEntryRedDot(entryNode);
    if (redDotNode) {
      redDotNode.active = summary.hasClaimableReward === true;
    }
  },

  _ensureGameCircleWelfareViewPrefab: function () {
    if (this._gameCircleWelfareViewPrefab) {
      return Promise.resolve(this._gameCircleWelfareViewPrefab);
    }

    return this._loadPrefab(GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("GamingCircleView prefab load returned empty.");
      }
      this._gameCircleWelfareViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _showGameCircleWelfareView: function (options) {
    var showOptions = options || {};
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }
    if (!this.gameCircleWelfareService || typeof this.gameCircleWelfareService.getSummary !== "function") {
      showStatusAndTip(this, "游戏圈福利未就绪");
      return;
    }

    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    this._trackTelemetry("game_circle_welfare_open", {
      activity_id: this.gameCircleWelfareConfig.activityId
    });

    this._ensureGameCircleWelfareViewPrefab().then(function (prefab) {
      var viewNode = this._gameCircleWelfareViewNode;
      if (!viewNode || !cc.isValid(viewNode)) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode || !viewNode.isValid) {
          throw new Error("Create GamingCircleView node failed.");
        }
        viewNode.parent = this.node;
        viewNode.zIndex = 350;
        viewNode.setPosition(0, 0);
        this._gameCircleWelfareViewNode = viewNode;
        this._gameCircleWelfareViewController = new GameCircleWelfareViewController({
          node: viewNode,
          onClose: function () {
            this._playSfx("uiClick");
            hideGameCircleWelfareViewNode(this);
          }.bind(this),
          onRefresh: function () {
            this._playSfx("uiClick");
            this._refreshGameCircleWelfareProgress();
          }.bind(this),
          onClaim: function (taskId) {
            this._playSfx("uiClick");
            this._claimGameCircleWelfareTask(taskId);
          }.bind(this),
          onOpenGameCircle: function () {
            this._playSfx("uiClick");
            this._openGameCircleFromWelfare("panel_cocos_button");
          }.bind(this),
          onSyncNativeButtons: function (buttonState) {
            this._syncGameCircleNativeButtons(buttonState);
          }.bind(this)
        });
      }

      viewNode.active = true;
      PopupPanelAnimator.play(viewNode);
      return this._renderGameCircleWelfareView().then(function () {
        if (showOptions.refreshOnOpen === true) {
          return this._refreshGameCircleWelfareProgress({
            silent: true,
            source: "open_panel"
          });
        }
        return null;
      }.bind(this));
    }.bind(this)).catch(function (error) {
      var message = error && error.message ? error.message : String(error);
      Logger.error("Show game circle welfare view failed", message);
      if (message.length > 80) {
        message = message.slice(0, 80);
      }
      showStatusAndTip(this, "游戏圈福利加载失败：" + message);
    }.bind(this));
  },

  _hideGameCircleWelfareView: function () {
    if (this.gameCircleButtonAdapter && typeof this.gameCircleButtonAdapter.hideAllButtons === "function") {
      this.gameCircleButtonAdapter.hideAllButtons();
    }
    if (!this._gameCircleWelfareViewNode || !cc.isValid(this._gameCircleWelfareViewNode)) {
      return;
    }
    this._gameCircleWelfareViewNode.active = false;
  },

  _renderGameCircleWelfareView: function () {
    if (!this._gameCircleWelfareViewController || !this.gameCircleWelfareService) {
      return Promise.reject(new Error("Game circle welfare view controller is not ready."));
    }
    if (this.gameCircleButtonAdapter && typeof this.gameCircleButtonAdapter.hideAllButtons === "function") {
      this.gameCircleButtonAdapter.hideAllButtons();
    }
    var summary = this.gameCircleWelfareService.getSummary(new Date());
    this._updateGameCircleEntryState();
    return this._gameCircleWelfareViewController.render(summary).catch(function (error) {
      Logger.error("Render game circle welfare view failed", error && error.message ? error.message : error);
      showStatusAndTip(this, "游戏圈福利刷新失败");
      throw error;
    }.bind(this));
  },

  _refreshGameCircleWelfareProgress: function (options) {
    var refreshOptions = options || {};
    if (!this.gameCircleWelfareService || typeof this.gameCircleWelfareService.refreshMetrics !== "function") {
      showStatusAndTip(this, "游戏圈福利未就绪");
      return Promise.reject(new Error("Game circle welfare service is not ready."));
    }
    return requireGameCirclePrivacyAuthorization(this).then(function () {
      return refreshGameCircleMetricsWithLoading(this);
    }.bind(this)).then(function () {
      this._updateGameCircleEntryState();
      if (!isGameCircleWelfareViewVisible(this)) {
        return null;
      }
      return this._renderGameCircleWelfareView();
    }.bind(this)).then(function () {
      if (refreshOptions.silent !== true) {
        showStatusAndTip(this, "游戏圈进度已刷新");
      }
    }.bind(this)).catch(function (error) {
      if (isGameCircleAuthDeniedError(error)) {
        gameCircleAuthorizationDenied = true;
        return null;
      }
      if (isGameCirclePrivacyDeniedError(error)) {
        return null;
      }
      Logger.error("Refresh game circle welfare progress failed", error && error.message ? error.message : error);
      showStatusAndTip(this, resolveGameCircleFailMessage(error));
      if (isNetworkLoadingTimeoutError(this, error)) {
        return null;
      }
      throw error;
    }.bind(this));
  },

  _claimGameCircleWelfareTask: function (taskId) {
    if (!this.gameCircleWelfareService || typeof this.gameCircleWelfareService.claimTask !== "function") {
      showStatusAndTip(this, "游戏圈福利未就绪");
      return;
    }
    try {
      var claimResult = this.gameCircleWelfareService.claimTask(taskId, new Date());
      this._refreshPlayerResources();
      if (typeof this._refreshPlayerInventory === "function") {
        this._refreshPlayerInventory();
      }
      this._updateLevelSelectTopStatus();
      if (typeof this._renderInventoryView === "function") {
        this._renderInventoryView();
      }
      this._updateGameCircleEntryState();
      this._renderGameCircleWelfareView();
      if (this.gameCircleButtonAdapter && typeof this.gameCircleButtonAdapter.hideAllButtons === "function") {
        this.gameCircleButtonAdapter.hideAllButtons();
      }
      showStatusAndTip(this, "游戏圈奖励领取成功");
      this._showAwardViewForRewardItems(claimResult.rewardItems).catch(function (error) {
        Logger.error("Show game circle award view failed", error && error.message ? error.message : error);
        showStatusAndTip(this, "游戏圈奖励弹窗加载失败");
      }.bind(this));
    } catch (error) {
      this._trackTelemetry("game_circle_reward_claim_fail", {
        activity_id: this.gameCircleWelfareConfig.activityId,
        task_id: taskId,
        reason: error && error.message ? error.message : String(error)
      });
      Logger.error("Claim game circle welfare task failed", error && error.message ? error.message : error);
      showStatusAndTip(this, resolveGameCircleFailMessage(error));
    }
  },

  _bindGameCircleWelfareReturnRefresh: function () {
    if (typeof this._handleGameCircleWelfareReturnToGame !== "function") {
      throw new Error("Game circle welfare return handler is missing.");
    }
    if (this._gameCircleWelfareReturnShowHandler) {
      return;
    }
    var handler = this._handleGameCircleWelfareReturnToGame.bind(this);
    this._gameCircleWelfareReturnShowHandler = handler;
    if (cc && cc.game && typeof cc.game.on === "function" && cc.game.EVENT_SHOW) {
      cc.game.on(cc.game.EVENT_SHOW, handler);
    }
    var platform = resolveGameCirclePlatform(this);
    if (platform && typeof platform.onShow === "function") {
      platform.onShow(handler);
    }
  },

  _unbindGameCircleWelfareReturnRefresh: function () {
    var handler = this._gameCircleWelfareReturnShowHandler;
    if (!handler) {
      return;
    }
    if (cc && cc.game && typeof cc.game.off === "function" && cc.game.EVENT_SHOW) {
      cc.game.off(cc.game.EVENT_SHOW, handler);
    }
    var platform = resolveGameCirclePlatform(this);
    if (platform && typeof platform.offShow === "function") {
      platform.offShow(handler);
    }
    this._gameCircleWelfareReturnShowHandler = null;
  },

  _markGameCircleWelfareRefreshPending: function (source) {
    if (typeof source !== "string" || !source) {
      throw new Error("Game circle welfare refresh pending source is required.");
    }
    this._pendingGameCircleWelfareRefreshOnShow = true;
    this._trackTelemetry("game_circle_return_refresh_pending", {
      activity_id: this.gameCircleWelfareConfig.activityId,
      source: source
    });
  },

  _handleGameCircleWelfareReturnToGame: function () {
    if (this._pendingGameCircleWelfareRefreshOnShow !== true) {
      return;
    }
    if (!this.isSelectingLevel || this.isRestarting || !isGameCircleWelfareViewVisible(this)) {
      this._pendingGameCircleWelfareRefreshOnShow = false;
      this._trackTelemetry("game_circle_return_refresh_cancel", {
        activity_id: this.gameCircleWelfareConfig.activityId,
        reason: "welfare_view_not_active"
      });
      return;
    }
    this._pendingGameCircleWelfareRefreshOnShow = false;
    this._trackTelemetry("game_circle_return_refresh_start", {
      activity_id: this.gameCircleWelfareConfig.activityId
    });
    return this._refreshGameCircleWelfareProgress({
      silent: true,
      source: "return_from_game_circle"
    });
  },

  _resolveNativeButtonRectForNode: function (node) {
    if (!node || !node.isValid) {
      throw new Error("Cannot resolve native button rect from invalid node.");
    }
    if (typeof node.getBoundingBoxToWorld !== "function") {
      throw new Error("Node cannot provide world bounding box for native button.");
    }
    var box = node.getBoundingBoxToWorld();
    var winSize = cc.winSize;
    var frameSize = cc.view.getFrameSize();
    if (!winSize || !frameSize || winSize.width <= 0 || winSize.height <= 0) {
      throw new Error("Invalid view size when resolving native game circle button rect.");
    }
    return {
      left: box.x / winSize.width * frameSize.width,
      top: (winSize.height - box.y - box.height) / winSize.height * frameSize.height,
      width: box.width / winSize.width * frameSize.width,
      height: box.height / winSize.height * frameSize.height
    };
  },

  _syncGameCircleNativeButtons: function (buttonState) {
    if (!this.gameCircleButtonAdapter || typeof this.gameCircleButtonAdapter.hideAllButtons !== "function") {
      return;
    }
    this.gameCircleButtonAdapter.hideAllButtons();
    if (!this._gameCircleWelfareViewNode || !cc.isValid(this._gameCircleWelfareViewNode) || !this._gameCircleWelfareViewNode.active) {
      return;
    }
    if (!this.gameCircleButtonAdapter.isSupported()) {
      return;
    }

    var entry = this.gameCircleWelfareConfig.entry;
    if (buttonState && buttonState.circleButtonNode && buttonState.circleButtonNode.isValid) {
      this.gameCircleButtonAdapter.showButton(
        "panel_entry",
        this._resolveNativeButtonRectForNode(buttonState.circleButtonNode),
        entry,
        function () {
          this._markGameCircleWelfareRefreshPending("panel_entry");
          this._trackTelemetry("game_circle_entry_click", {
            activity_id: this.gameCircleWelfareConfig.activityId,
            source: "panel_entry",
            openlink: entry.openlink
          });
        }.bind(this)
      );
    }

    var taskButtons = buttonState && Array.isArray(buttonState.taskButtons)
      ? buttonState.taskButtons
      : [];
    taskButtons.forEach(function (taskButton) {
      if (!taskButton || taskButton.action !== "open" || !taskButton.goButtonNode || !taskButton.goButtonNode.isValid) {
        return;
      }
      this.gameCircleButtonAdapter.showButton(
        "task_" + taskButton.taskId,
        this._resolveNativeButtonRectForNode(taskButton.goButtonNode),
        entry,
        function () {
          this._markGameCircleWelfareRefreshPending("task_" + taskButton.taskId);
          this._trackTelemetry("game_circle_entry_click", {
            activity_id: this.gameCircleWelfareConfig.activityId,
            source: "task_" + taskButton.taskId,
            openlink: entry.openlink
          });
        }.bind(this)
      );
    }, this);
  },

  _openGameCircleFromWelfare: function (source) {
    if (!this.gameCircleButtonAdapter || !this.gameCircleButtonAdapter.isSupported()) {
      showStatusAndTip(this, "游戏圈入口仅微信小游戏环境可用");
      return;
    }
    this._trackTelemetry("game_circle_entry_click", {
      activity_id: this.gameCircleWelfareConfig.activityId,
      source: source,
      openlink: this.gameCircleWelfareConfig.entry.openlink
    });
    showStatusAndTip(this, "请点击游戏圈入口进入");
  }
};
