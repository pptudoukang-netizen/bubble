"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var LoadingViewController = Shared.LoadingViewController;

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
      this._startupFlowPromise = this._runWeightedStartupTasks().then(function () {
        this._showLevelSelectView();
      }.bind(this)).catch(function (error) {
        Logger.error("Startup resource loading failed", error && error.stack ? error.stack : error);
        this._setStatus("Startup resource loading failed. Check console logs.");
        throw error;
      }.bind(this));
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
      return this._loadingViewController.waitForProgressComplete().then(function () {
        return this._loadingViewController.playOut();
      }.bind(this));
    }.bind(this)).then(function () {
      this._showLevelSelectView();
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
    var tasks = [
      {
        id: "resources_bundle",
        stage: "准备资源分包...",
        weight: 0.25,
        run: function () {
          return BundleLoader.ensureResourcesBundleLoaded();
        }
      },
      {
        id: "ui_bundle",
        stage: "准备界面分包...",
        weight: 0.2,
        run: function () {
          return BundleLoader.ensureNamedBundleLoaded("ui");
        }
      },
      {
        id: "level_select_prefabs",
        stage: "加载选关界面...",
        weight: 0.35,
        run: function () {
          return this._preloadStartupPrefabs();
        }.bind(this)
      },
      {
        id: "level_configs",
        stage: "初始化首关配置...",
        weight: 0.2,
        run: function () {
          return this._preloadStartupLevelConfigs();
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
        return Promise.resolve().then(task.run).then(function () {
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
