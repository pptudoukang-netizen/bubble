"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var PoolManager = require("../utils/PoolManager");
var LevelProgressStore = require("../utils/LevelProgressStore");
var RouteConfigStore = require("../utils/RouteConfigStore");
var AudioManager = require("../audio/AudioManager");
var BoardLayout = require("../config/BoardLayout");
var LevelManager = require("../config/LevelManager");
var GameManager = require("../core/GameManager");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var RouteEditorState = require("./RouteEditorState");
var LevelRenderer = require("../render/LevelRenderer");
var LoadingViewController = require("../ui/LoadingViewController");

var BASELINE_HALF_WIDTH = 360;
var BASELINE_HALF_HEIGHT = 640;
var BASELINE_SIDE_PADDING = BASELINE_HALF_WIDTH - Math.abs(BoardLayout.boardRight);
var BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM = (BoardLayout.jarBaseY + BoardLayout.jarRenderYOffset) - (-BASELINE_HALF_HEIGHT);
var BASELINE_JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var BASELINE_SHOOTER_OFFSET_FROM_BOTTOM = BoardLayout.shooterOrigin.y - (-BASELINE_HALF_HEIGHT);
var BASELINE_DANGER_OFFSET_FROM_BOTTOM = BoardLayout.dangerLineY - (-BASELINE_HALF_HEIGHT);

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

cc.Class({
  extends: cc.Component,

  properties: {
    initialLevelId: {
      default: 1,
      tooltip: "关闭测试模式时，游戏启动加载的普通关卡 ID。"
    },
    enableSpecialEntitiesTestMode: {
      default: true,
      tooltip: "开启后将优先进入“技能球/障碍球测试关卡”。"
    },
    specialEntitiesTestLevelId: {
      default: 20,
      tooltip: "测试模式下的启动关卡 ID（建议为包含彩虹球/炸裂球/石头球的关卡）。"
    },
    showDebugOverlay: {
      default: true,
      tooltip: "是否显示轻量调试信息面板（启动状态/运行状态）。"
    },
    showGridTestLayer: {
      default: true,
      tooltip: "是否显示网格测试层（空槽位与编号），用于瞄准调试。"
    },
    showDropTestButton: {
      default: true,
      tooltip: "是否显示“底层掉落测试”按钮。"
    },
    enableLevelEditor: {
      default: true,
      tooltip: "是否启用关卡编辑器（路线绘制、踩点记录、保存配置）。"
    },
    routePointMinDistance: {
      default: 18,
      tooltip: "路线连续采样时，两次记录点之间的最小距离（像素）。"
    },
    levelSelectMaxLevelId: {
      default: 21,
      tooltip: "关卡选择界面的快速首屏数量（用于避免首次扫描资源目录阻塞展示）。"
    },
    enableStartupLoadingView: {
      default: true,
      tooltip: "是否在启动时先展示资源加载界面。"
    },
    loadingViewMinVisibleMs: {
      default: 900,
      tooltip: "资源加载界面的最短展示时长（毫秒），避免闪屏。"
    },
    startupPreloadLevelCount: {
      default: 5,
      tooltip: "启动阶段预加载的关卡配置数量（从首关开始）。"
    },
    projectileSpeed: {
      default: 960,
      tooltip: "发射球飞行速度（像素/秒），启动时写入全局棋盘参数。"
    },
    impactBounceSpeed: {
      default: 220,
      tooltip: "命中后邻居球反弹速度（像素/秒），用于调试反弹动效快慢。"
    },
    jarRimBounceSpeed: {
      default: 260,
      tooltip: "掉落球碰到缸口边缘时的反弹速度（像素/秒），用于调试入缸手感。"
    },
    aimRefreshMinDistance: {
      default: 6,
      tooltip: "瞄准拖动时触发辅助线刷新的最小位移阈值（像素）。"
    },
    showGhostBubble: {
      default: true,
      tooltip: "是否显示幽灵球（预测落点虚拟球）。"
    },
    guideFrontClipRadiusScale: {
      default: 1,
      tooltip: "辅助线在幽灵球前端的截断系数（按球半径倍数计算，1=一个球半径）。"
    },
    guideDotPulseSpeedScale: {
      default: 1,
      tooltip: "辅助线呼吸动画速度系数（>1 更快，<1 更慢）。"
    },
    enableBackgroundMusic: {
      default: true,
      tooltip: "是否启用背景音乐。"
    },
    enableSoundEffects: {
      default: true,
      tooltip: "是否启用音效。"
    },
    backgroundMusicVolume: {
      default: 0.6,
      tooltip: "背景音乐音量（0~1）。"
    },
    soundEffectsVolume: {
      default: 1,
      tooltip: "音效音量（0~1）。"
    },
    levelBackgroundMusicResource: {
      default: "sound/level_bg",
      tooltip: "关卡选择页面背景音乐资源路径（Resources 相对路径）。"
    },
    gameBackgroundMusicResource: {
      default: "sound/game_bg",
      tooltip: "游戏界面背景音乐资源路径（Resources 相对路径）。"
    },
    uiClickSfxResource: {
      default: "sound/ding0",
      tooltip: "按钮/界面点击音效资源路径。"
    },
    levelStartSfxResource: {
      default: "sound/ding1",
      tooltip: "进入关卡音效资源路径。"
    },
    shotSfxResource: {
      default: "sound/ding2",
      tooltip: "发射音效资源路径。"
    },
    loseSfxResource: {
      default: "sound/ding3",
      tooltip: "失败音效资源路径。"
    },
    winSfxResource: {
      default: "sound/ding4",
      tooltip: "胜利音效资源路径。"
    },
    jarBounceSfxResources: {
      default: "sound/ding0,sound/ding1,sound/ding2,sound/ding3,sound/ding4,sound/ding5",
      tooltip: "掉落玻璃球与缸碰撞时随机播放的音效资源列表，使用英文逗号分隔。"
    }
  },

  onLoad: function () {
    this._applyViewportLayout();

    DebugFlags.setAll({
      logs: true,
      overlay: this.showDebugOverlay,
      testLayer: this.showGridTestLayer
    });

    this.currentLevelConfig = null;
    this.isRestarting = false;
    this.isSelectingLevel = false;
    this._levelSelectNode = null;
    this._levelSelectViewPrefab = null;
    this._levelButtonPrefab = null;
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
    this.levelProgressStore = new LevelProgressStore();
    this.levelProgress = this.levelProgressStore.load();
    this.routeConfigStore = new RouteConfigStore();
    this.routeConfig = this.routeConfigStore.load();
    this.audioManager = new AudioManager({
      settingsDefaults: {
        musicEnabled: this.enableBackgroundMusic,
        sfxEnabled: this.enableSoundEffects,
        musicVolume: this.backgroundMusicVolume,
        sfxVolume: this.soundEffectsVolume
      }
    });
    this.audioManager.configure(this._buildAudioConfig());
    this._routeEditorState = this._createEmptyRouteEditorState();

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
    this.levelRenderer.warmupSharedAssets().catch(function (error) {
      Logger.warn("Shared renderer warmup failed", error && error.message ? error.message : error);
    });
    this.levelRenderer.setWinActionHandlers({
      onNextLevel: this._onNextLevelTap.bind(this),
      onRetryLevel: this._restartCurrentLevel.bind(this)
    });
    this.levelRenderer.setLoseActionHandlers({
      onRetryLevel: this._restartCurrentLevel.bind(this),
      onBackLevel: this._onBackToLevelTap.bind(this)
    });

    this.gameManager.bootstrap();
    this._bindInput();

    window.__bubbleDebug = {
      bootstrap: this,
      poolManager: this.poolManager,
      levelManager: this.levelManager,
      gameManager: this.gameManager,
      levelRenderer: this.levelRenderer,
      audioManager: this.audioManager,
      routeConfigStore: this.routeConfigStore,
      routeEditor: {
        getState: function () {
          return clone(this._routeEditorState);
        }.bind(this),
        save: this._onRouteEditorSaveTap.bind(this),
        toggle: this._onRouteEditorToggleTap.bind(this)
      }
    };
  },

  _applyViewportLayout: function () {
    BoardLayout.projectileSpeed = Math.max(120, Number(this.projectileSpeed) || 960);
    BoardLayout.impactBounceSpeed = Math.max(80, Number(this.impactBounceSpeed) || 220);
    BoardLayout.jarRimBounceSpeed = Math.max(120, Number(this.jarRimBounceSpeed) || 260);
    BoardLayout.showGhostBubble = this.showGhostBubble !== false;
    BoardLayout.guideFrontClipRadiusScale = Math.max(0, Math.min(3, Number(this.guideFrontClipRadiusScale) || 1));
    BoardLayout.guideDotPulseSpeedScale = Math.max(0.1, Math.min(5, Number(this.guideDotPulseSpeedScale) || 1));

    var canvas = this.node ? this.node.getComponent(cc.Canvas) : null;
    var designSize = canvas && canvas._designResolution
      ? canvas._designResolution
      : cc.size(720, 1280);
    var designWidth = Math.max(1, Number(designSize.width) || 720);
    var designHeight = Math.max(1, Number(designSize.height) || 1280);

    var frameSize = cc.view && cc.view.getFrameSize ? cc.view.getFrameSize() : cc.size(designWidth, designHeight);
    var frameWidth = Math.max(1, Number(frameSize.width) || designWidth);
    var frameHeight = Math.max(1, Number(frameSize.height) || designHeight);
    var frameAspect = frameWidth / frameHeight;
    var designAspect = designWidth / designHeight;

    var width = designWidth;
    var height = designHeight;
    if (frameAspect <= designAspect) {
      // 长屏：固定宽度，扩展可视高度，避免上下黑边。
      if (canvas) {
        canvas.fitWidth = true;
        canvas.fitHeight = false;
      }
      height = designWidth / frameAspect;
    } else {
      // 宽屏：固定高度，扩展可视宽度，避免左右黑边。
      if (canvas) {
        canvas.fitWidth = false;
        canvas.fitHeight = true;
      }
      width = designHeight * frameAspect;
    }

    if (this.node && this.node.setContentSize) {
      this.node.setContentSize(width, height);
    }

    var halfWidth = width * 0.5;
    var halfHeight = height * 0.5;
    var boardHalfWidth = Math.max(
      BoardLayout.bubbleDiameter * 4.5,
      halfWidth - BASELINE_SIDE_PADDING
    );

    BoardLayout.boardLeft = -boardHalfWidth;
    BoardLayout.boardRight = boardHalfWidth;
    BoardLayout.jarLayoutWidth = width;
    // 顶部玻璃球首行：屏幕顶部往下 (130 + 球半径)。
    BoardLayout.boardStartY = halfHeight - (130 + BoardLayout.bubbleRadius);

    var bottomY = -halfHeight;
    // 底部元素按“离屏幕底部固定高度”适配。
    BoardLayout.jarBaseY = bottomY + BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM - BASELINE_JAR_RENDER_Y_OFFSET;
    BoardLayout.shooterOrigin = {
      x: 0,
      y: bottomY + BASELINE_SHOOTER_OFFSET_FROM_BOTTOM
    };
    BoardLayout.dangerLineY = bottomY + BASELINE_DANGER_OFFSET_FROM_BOTTOM;
  },

  start: function () {
    this._applyViewportLayout();
    this._runStartupLoadingFlow();
  },

  onEnable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      this._resizeCallback = this._handleViewResize.bind(this);
      cc.view.setResizeCallback(this._resizeCallback);
    }
  },

  onDisable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      cc.view.setResizeCallback(null);
    }
    this._resizeCallback = null;
  },

  onDestroy: function () {
    if (this.audioManager) {
      this.audioManager.stopBgm();
      this.audioManager.stopAllSfx();
    }
  },

  _handleViewResize: function () {
    this._applyViewportLayout();
    if (this._loadingViewController && this._loadingViewController.refreshLayout) {
      this._loadingViewController.refreshLayout();
    }

    if (this.levelRenderer && this.currentLevelConfig && !this.isRestarting && !this.isSelectingLevel) {
      var snapshot = this.gameManager.getRuntimeSnapshot();
      this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).catch(function (error) {
        Logger.warn("Resize rerender failed", error && error.message ? error.message : error);
      }).then(function () {
        this._renderRouteEditor();
      }.bind(this));
    }
  },

  _runStartupLoadingFlow: function () {
    if (this._startupFlowPromise) {
      return this._startupFlowPromise;
    }

    if (!this.enableStartupLoadingView) {
      this._showLevelSelectView();
      this._startupFlowPromise = Promise.resolve();
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
      return this._loadingViewController.playOut();
    }.bind(this)).then(function () {
      this._showLevelSelectView();
    }.bind(this)).catch(function (error) {
      Logger.warn("Startup loading flow failed", error && error.message ? error.message : error);
      if (this._loadingViewController && this._loadingViewController.hideImmediate) {
        this._loadingViewController.hideImmediate();
      }
      this._showLevelSelectView();
    }.bind(this));

    return this._startupFlowPromise;
  },

  _ensureLoadingViewController: function () {
    if (this._loadingViewController && this._loadingViewController.node && cc.isValid(this._loadingViewController.node)) {
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
      if (controller.refreshLayout) {
        controller.refreshLayout();
      }
      return controller;
    }.bind(this));
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
        id: "warmup_prefabs",
        stage: "加载基础界面...",
        weight: 0.4,
        run: function () {
          return this._preloadStartupPrefabs();
        }.bind(this)
      },
      {
        id: "level_index",
        stage: "加载关卡列表...",
        weight: 0.28,
        run: function () {
          return this._loadAvailableLevelIds().then(function (levelIds) {
            this._startupResolvedLevelIds = Array.isArray(levelIds) ? levelIds.slice() : [];
          }.bind(this));
        }.bind(this)
      },
      {
        id: "level_configs",
        stage: "初始化关卡配置...",
        weight: 0.22,
        run: function () {
          return this._preloadStartupLevelConfigs();
        }.bind(this)
      },
      {
        id: "renderer_warmup",
        stage: "初始化棋盘资源...",
        weight: 0.1,
        run: function () {
          return this.levelRenderer.warmupSharedAssets().catch(function (error) {
            Logger.warn("Renderer warmup during loading failed", error && error.message ? error.message : error);
          });
        }.bind(this)
      },
      {
        id: "audio_warmup",
        stage: "初始化音频资源...",
        weight: 0.08,
        run: function () {
          return this._preloadStartupAudio();
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
        return Promise.resolve().then(task.run).catch(function (error) {
          Logger.warn("Startup task failed: " + task.id, error && error.message ? error.message : error);
        }).then(function () {
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

    this._startupPrefabWarmupPromise = Promise.all([
      this._ensureLevelSelectPrefabs(),
      this._loadPrefab("prefabs/ui/HudPanel"),
      this._loadPrefab("prefabs/ui/WinView"),
      this._loadPrefab("prefabs/ui/LoseView"),
      this._loadPrefab("prefabs/ui/DangerLine"),
      this._loadPrefab("prefabs/game/ShooterPanel"),
      this._loadPrefab("prefabs/game/BubbleItem"),
      this._loadPrefab("prefabs/game/JarItem"),
      this._loadPrefab("prefabs/game/PreviewBall")
    ]).then(function () {
      return null;
    }).catch(function (error) {
      this._startupPrefabWarmupPromise = null;
      throw error;
    }.bind(this));

    return this._startupPrefabWarmupPromise;
  },

  _buildAudioConfig: function () {
    return {
      bgmPath: this._getGameplayBgmPath(),
      sfxMap: {
        uiClick: this.uiClickSfxResource,
        levelStart: this.levelStartSfxResource,
        shot: this.shotSfxResource,
        win: this.winSfxResource,
        lose: this.loseSfxResource,
        jarBounce: this._parseAudioResourceList(this.jarBounceSfxResources)
      }
    };
  },

  _getLevelSelectBgmPath: function () {
    return typeof this.levelBackgroundMusicResource === "string"
      ? this.levelBackgroundMusicResource.trim()
      : "";
  },

  _getGameplayBgmPath: function () {
    return typeof this.gameBackgroundMusicResource === "string"
      ? this.gameBackgroundMusicResource.trim()
      : "";
  },

  _parseAudioResourceList: function (value) {
    if (Array.isArray(value)) {
      return value.filter(function (item) {
        return typeof item === "string" && item.trim();
      }).map(function (item) {
        return item.trim();
      });
    }

    if (typeof value !== "string") {
      return [];
    }

    return value.split(",").map(function (item) {
      return item.trim();
    }).filter(function (item) {
      return !!item;
    });
  },

  _preloadStartupAudio: function () {
    if (!this.audioManager) {
      return Promise.resolve();
    }

    var bgmPaths = [
      this._getLevelSelectBgmPath(),
      this._getGameplayBgmPath()
    ].filter(function (path, index, list) {
      return !!path && list.indexOf(path) === index;
    });

    var preloadTasks = [];
    if (typeof this.audioManager.preloadConfiguredAudio === "function") {
      preloadTasks.push(this.audioManager.preloadConfiguredAudio());
    }
    if (bgmPaths.length && typeof this.audioManager.preloadPaths === "function") {
      preloadTasks.push(this.audioManager.preloadPaths(bgmPaths));
    }

    return Promise.all(preloadTasks);
  },

  _playBackgroundMusic: function (resourcePath) {
    if (!this.audioManager || typeof this.audioManager.playBgm !== "function") {
      return;
    }

    this.audioManager.playBgm(resourcePath, { loop: true });
  },

  _playLevelSelectBackgroundMusic: function () {
    this._playBackgroundMusic(this._getLevelSelectBgmPath());
  },

  _playGameplayBackgroundMusic: function () {
    this._playBackgroundMusic(this._getGameplayBgmPath());
  },

  _playSfx: function (name) {
    if (!this.audioManager || typeof this.audioManager.playSfx !== "function") {
      return;
    }

    this.audioManager.playSfx(name);
  },

  _playRuntimeAudioEvents: function (snapshot) {
    var runtimeEvents = snapshot && Array.isArray(snapshot.runtimeEvents) ? snapshot.runtimeEvents : [];
    if (!runtimeEvents.length) {
      return;
    }

    runtimeEvents.forEach(function (event) {
      if (!event || event.type !== "jar_rim_bounce") {
        return;
      }

      this._playSfx("jarBounce");
    }, this);
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
  },

  update: function (dt) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var snapshot = this.gameManager.update(dt);
    if (!snapshot) {
      return;
    }

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._handleRuntimeStateTransition(snapshot);
    if (!snapshot.activeProjectile) {
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
    }
  },

  _bindInput: function () {
    this.node.on(cc.Node.EventType.TOUCH_START, this._onAimStart, this);
    this.node.on(cc.Node.EventType.TOUCH_MOVE, this._onAimMove, this);
    this.node.on(cc.Node.EventType.TOUCH_END, this._onFireTouch, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, this._onAimCancel, this);
  },

  _onAimStart: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchStart(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }

    var snapshot = this.gameManager.beginAim(localPoint);
    this._lastAimRefreshPoint = {
      x: localPoint.x,
      y: localPoint.y
    };
    this._lastAimRefreshScreenPoint = {
      x: touchLocation.x,
      y: touchLocation.y
    };
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimMove: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchMove(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }

    var minDistance = Math.max(0, Number(this.aimRefreshMinDistance) || 0);
    var shouldRefreshPlan = true;
    if (minDistance > 0 && this._lastAimRefreshScreenPoint) {
      var dx = touchLocation.x - this._lastAimRefreshScreenPoint.x;
      var dy = touchLocation.y - this._lastAimRefreshScreenPoint.y;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        shouldRefreshPlan = false;
      }
    }

    var snapshot = this.gameManager.isAiming
      ? this.gameManager.setAim(localPoint, { skipPlanRefresh: !shouldRefreshPlan })
      : this.gameManager.beginAim(localPoint);

    if (shouldRefreshPlan || !this._lastAimRefreshScreenPoint) {
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onFireTouch: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchEnd(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }

    if (!this.gameManager.isAiming) {
      this.gameManager.beginAim(localPoint);
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    var shotsBeforeFire = Math.max(0, Number(this.gameManager.remainingShots) || 0);
    var snapshot = this.gameManager.fireShot();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    if (snapshot && Math.max(0, Number(snapshot.remainingShots) || 0) < shotsBeforeFire) {
      this._playSfx("shot");
    }
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimCancel: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchCancel();
      return;
    }

    var snapshot = this.gameManager.endAim();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _loadInitialLevel: function () {
    var startupLevelId = this._getStartupLevelId();
    this._setStatus("Loading level_" + ("000" + startupLevelId).slice(-3) + "...");
    this._loadLevelById(startupLevelId, "Bootstrap finished", "Bootstrap failed. Check console logs.");
  },

  _getStartupLevelId: function () {
    var fallbackLevelId = Math.max(1, Number(this.initialLevelId) || 1);
    if (!this.enableSpecialEntitiesTestMode) {
      return fallbackLevelId;
    }

    var testLevelId = Math.max(1, Number(this.specialEntitiesTestLevelId) || fallbackLevelId);
    return testLevelId;
  },

  _restartCurrentLevel: function () {
    if (!this.currentLevelConfig) {
      return;
    }

    this._playSfx("uiClick");
    this.isRestarting = true;
    this._setStatus("Restarting level...");

    var snapshot = this.gameManager.startLevel(this.currentLevelConfig);
    snapshot = this.gameManager.endAim();
    this._lastRuntimeState = snapshot ? snapshot.state : null;
    this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).then(function () {
      this.isRestarting = false;
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
      this._playGameplayBackgroundMusic();
      this._playSfx("levelStart");
      Logger.info("Level restarted", this.currentLevelConfig.level.code);
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._refreshRouteEditorButtons();
      this._setStatus("Restart failed. Check console logs.");
      Logger.error(error);
    }.bind(this));
  },

  _isTerminalState: function () {
    var snapshot = this.gameManager.getRuntimeSnapshot();
    return snapshot.state === "won" ||
      snapshot.state === "out_of_shots" ||
      snapshot.state === "out_of_shots_pending" ||
      snapshot.state === "lost_danger" ||
      snapshot.state === "lost_objective";
  },

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
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._pendingRouteEditorAutoEnable = false;
      this._setDropTestButtonVisible(!!this.currentLevelConfig && !this.isSelectingLevel);
      this._refreshRouteEditorButtons();
      this._setStatus(failStatusMessage || "Load level failed. Check console logs.");
      Logger.error(error);
    }.bind(this));
  },

  _createDropTestButton: function () {
    if (!this.showDropTestButton) {
      return;
    }

    var buttonNode = new cc.Node("DropTestButton");
    buttonNode.parent = this.node;
    buttonNode.zIndex = 120;
    buttonNode.setContentSize(240, 72);

    var widget = buttonNode.addComponent(cc.Widget);
    widget.isAlignBottom = true;
    widget.isAlignRight = true;
    widget.bottom = 24;
    widget.right = 24;

    var background = buttonNode.addComponent(cc.Graphics);
    background.clear();
    background.fillColor = cc.color(72, 117, 164, 220);
    background.roundRect(-120, -36, 240, 72, 12);
    background.fill();

    var labelNode = new cc.Node("Label");
    labelNode.parent = buttonNode;
    labelNode.setPosition(0, 0);
    var label = labelNode.addComponent(cc.Label);
    label.string = "底层掉落测试";
    label.fontSize = 28;
    label.lineHeight = 32;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    labelNode.color = cc.color(255, 255, 255);
    var outline = labelNode.addComponent(cc.LabelOutline);
    outline.color = cc.color(31, 62, 98);
    outline.width = 2;

    buttonNode.addComponent(cc.BlockInputEvents);
    buttonNode.on(cc.Node.EventType.TOUCH_START, function (event) {
      event.stopPropagation();
      buttonNode.scale = 0.97;
    });
    buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      buttonNode.scale = 1;
      this._onDropTestButtonTap();
    }, this);
    buttonNode.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
      event.stopPropagation();
      buttonNode.scale = 1;
    });

    this._dropTestButton = buttonNode;
    this._setDropTestButtonVisible(false);
  },

  _createRouteEditorButtons: function () {
    if (!this.enableLevelEditor) {
      return;
    }

    this._routeEditorButtons.toggle = this._createActionButton("RouteEditorToggleButton", "路线编辑: 关", {
      width: 210,
      height: 64,
      left: 24,
      bottom: 24,
      fillColor: cc.color(74, 113, 124, 220),
      outlineColor: cc.color(26, 50, 58)
    }, this._onRouteEditorToggleTap.bind(this));

    this._routeEditorButtons.newRoute = this._createActionButton("RouteEditorNewButton", "新路线", {
      width: 180,
      height: 58,
      left: 24,
      bottom: 96,
      fillColor: cc.color(84, 147, 110, 220),
      outlineColor: cc.color(32, 73, 48)
    }, this._onRouteEditorNewTap.bind(this));

    this._routeEditorButtons.undo = this._createActionButton("RouteEditorUndoButton", "撤销点", {
      width: 180,
      height: 58,
      left: 24,
      bottom: 162,
      fillColor: cc.color(166, 123, 72, 220),
      outlineColor: cc.color(97, 60, 24)
    }, this._onRouteEditorUndoTap.bind(this));

    this._routeEditorButtons.clear = this._createActionButton("RouteEditorClearButton", "清空当前", {
      width: 180,
      height: 58,
      left: 24,
      bottom: 228,
      fillColor: cc.color(164, 91, 91, 220),
      outlineColor: cc.color(92, 37, 37)
    }, this._onRouteEditorClearTap.bind(this));

    this._routeEditorButtons.save = this._createActionButton("RouteEditorSaveButton", "保存路线", {
      width: 180,
      height: 58,
      left: 24,
      bottom: 294,
      fillColor: cc.color(74, 123, 185, 220),
      outlineColor: cc.color(30, 62, 108)
    }, this._onRouteEditorSaveTap.bind(this));

    this._refreshRouteEditorButtons();
  },

  _createActionButton: function (name, labelText, options, onTap) {
    var width = Math.max(120, Number(options && options.width) || 180);
    var height = Math.max(48, Number(options && options.height) || 58);
    var buttonNode = new cc.Node(name);
    buttonNode.parent = this.node;
    buttonNode.zIndex = 125;
    buttonNode.setContentSize(width, height);

    var widget = buttonNode.addComponent(cc.Widget);
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.left = Number(options && options.left) || 0;
    widget.bottom = Number(options && options.bottom) || 0;

    var background = buttonNode.addComponent(cc.Graphics);
    background.clear();
    background.fillColor = options && options.fillColor ? options.fillColor : cc.color(74, 123, 185, 220);
    background.roundRect(-(width * 0.5), -(height * 0.5), width, height, 12);
    background.fill();

    var labelNode = new cc.Node("Label");
    labelNode.parent = buttonNode;
    labelNode.setPosition(0, 0);
    var label = labelNode.addComponent(cc.Label);
    label.string = labelText;
    label.fontSize = 24;
    label.lineHeight = 28;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    labelNode.color = cc.color(255, 255, 255);
    var outline = labelNode.addComponent(cc.LabelOutline);
    outline.color = options && options.outlineColor ? options.outlineColor : cc.color(31, 62, 98);
    outline.width = 2;

    buttonNode.addComponent(cc.BlockInputEvents);
    buttonNode.on(cc.Node.EventType.TOUCH_START, function (event) {
      event.stopPropagation();
      buttonNode.scale = 0.97;
    });
    buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      buttonNode.scale = 1;
      if (typeof onTap === "function") {
        onTap();
      }
    });
    buttonNode.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
      event.stopPropagation();
      buttonNode.scale = 1;
    });

    return {
      node: buttonNode,
      label: label
    };
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
    if (!this._dropTestButton) {
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
    if (!this._levelSelectNode) {
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
    return new Promise(function (resolve, reject) {
      cc.loader.loadRes(path, cc.Prefab, function (error, prefab) {
        if (error) {
          reject(new Error("Failed to load prefab `" + path + "`: " + error.message));
          return;
        }

        resolve(prefab);
      });
    });
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

    this._availableLevelIdsScanPromise = new Promise(function (resolve, reject) {
      cc.loader.loadResDir("config/levels", cc.JsonAsset, function (error, assets, urls) {
        if (error) {
          reject(new Error("Failed to load level list: " + error.message));
          return;
        }

        var sourceUrls = Array.isArray(urls) ? urls : [];
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

        resolve(levelIds);
      }.bind(this));
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
    var levelView = this._levelSelectNode;
    if (!levelView || !levelView.isValid) {
      levelView = cc.instantiate(levelViewPrefab);
      levelView.parent = this.node;
      levelView.zIndex = 160;
      levelView.setPosition(0, 0);
      if (!levelView.getComponent(cc.BlockInputEvents)) {
        levelView.addComponent(cc.BlockInputEvents);
      }
      this._levelSelectNode = levelView;
    }

    levelView.active = true;

    var titleNode = this._createOrGetChild(levelView, "LevelTitle");
    titleNode.setPosition(0, 500);
    titleNode.color = cc.color(255, 255, 255);
    var titleLabel = titleNode.getComponent(cc.Label) || titleNode.addComponent(cc.Label);
    titleLabel.string = this._levelSelectRouteEditorMode ? "关卡选择 · 路线编辑" : "关卡选择";
    titleLabel.fontSize = 56;
    titleLabel.lineHeight = 60;
    titleLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    titleLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
    var titleOutline = titleNode.getComponent(cc.LabelOutline) || titleNode.addComponent(cc.LabelOutline);
    titleOutline.color = cc.color(31, 62, 98);
    titleOutline.width = 3;

    var subtitleNode = this._createOrGetChild(levelView, "LevelSubtitle");
    subtitleNode.setPosition(0, 450);
    subtitleNode.color = cc.color(235, 245, 255);
    var subtitleLabel = subtitleNode.getComponent(cc.Label) || subtitleNode.addComponent(cc.Label);
    subtitleLabel.string = this._levelSelectRouteEditorMode
      ? "当前为路线编辑模式，点击关卡会进入该关卡的路线编辑"
      : "点击关卡直接开始游戏";
    subtitleLabel.fontSize = 24;
    subtitleLabel.lineHeight = 28;
    subtitleLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    subtitleLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
    var subtitleOutline = subtitleNode.getComponent(cc.LabelOutline) || subtitleNode.addComponent(cc.LabelOutline);
    subtitleOutline.color = cc.color(31, 62, 98);
    subtitleOutline.width = 2;

    var gridNode = this._createOrGetChild(levelView, "LevelGrid");
    gridNode.setPosition(0, 100);
    gridNode.removeAllChildren();
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    var highlightedLevelId = this._resolveHighlightedLevelId(levelIds, highestUnlocked);

    var columns = 5;
    var spacingX = 120;
    var spacingY = 120;
    var startY = 260;

    levelIds.forEach(function (levelId, index) {
      var buttonNode = cc.instantiate(levelButtonPrefab);
      buttonNode.parent = gridNode;
      buttonNode.name = "LevelBtn_" + levelId;
      buttonNode.setScale(1);

      var row = Math.floor(index / columns);
      var col = index % columns;
      var x = (col - (columns - 1) * 0.5) * spacingX;
      var y = startY - row * spacingY;
      buttonNode.setPosition(x, y);

      var levelLabelNode = buttonNode.getChildByName("level");
      var levelLabel = levelLabelNode ? levelLabelNode.getComponent(cc.Label) : null;
      if (levelLabel) {
        levelLabel.string = String(levelId);
      }

      var starCount = this._getLevelStarCount(levelId);
      var isPassed = this._isLevelCompleted(levelId);
      var isUnlocked = levelId <= highestUnlocked;
      var isCurrent = levelId === highlightedLevelId;
      this._applyLevelButtonState(buttonNode, {
        isPassed: isPassed,
        isUnlocked: isUnlocked,
        isCurrent: isCurrent,
        starCount: starCount
      });

      buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
        if (event) {
          event.stopPropagation();
        }
        if (!isUnlocked) {
          return;
        }
        this._onLevelSelectTap(levelId);
      }, this);
    }, this);

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

  _applyLevelButtonState: function (buttonNode, options) {
    options = options || {};
    var isPassed = !!options.isPassed;
    var isUnlocked = !!options.isUnlocked;
    var isCurrent = !!options.isCurrent;
    var starCount = Math.max(0, Math.min(3, Math.floor(Number(options.starCount) || 0)));

    var labelNode = buttonNode.getChildByName("level");
    var button = buttonNode.getComponent(cc.Button);
    if (button) {
      button.interactable = isUnlocked;
      button.enableAutoGrayEffect = false;
    }

    // 通关关卡亮色显示；未通过统一灰色，未解锁更深灰。
    if (isPassed) {
      buttonNode.color = cc.color(255, 255, 255);
      if (labelNode) {
        labelNode.color = cc.color(255, 255, 255);
      }
    } else {
      var grayColor = isUnlocked ? cc.color(156, 156, 156) : cc.color(108, 108, 108);
      buttonNode.color = grayColor;
      if (labelNode) {
        labelNode.color = cc.color(230, 230, 230);
      }
    }

    this._setLevelButtonStars(buttonNode, isPassed ? starCount : 0);
    this._ensureLevelCurrentHighlight(buttonNode, isCurrent);
  },

  _setLevelButtonStars: function (buttonNode, starCount) {
    var names = ["start1", "start2", "start3"];
    names.forEach(function (name, index) {
      var starNode = buttonNode.getChildByName(name);
      if (!starNode) {
        return;
      }

      starNode.active = index < starCount;
    });
  },

  _ensureLevelCurrentHighlight: function (buttonNode, enabled) {
    var highlightNode = buttonNode.getChildByName("CurrentHighlight");
    if (!enabled) {
      if (highlightNode) {
        highlightNode.active = false;
      }
      return;
    }

    if (!highlightNode) {
      highlightNode = new cc.Node("CurrentHighlight");
      highlightNode.parent = buttonNode;
      highlightNode.setPosition(0, 0);
      highlightNode.zIndex = 50;
      var graphics = highlightNode.addComponent(cc.Graphics);
      graphics.clear();
      graphics.lineWidth = 5;
      graphics.strokeColor = cc.color(255, 234, 120);
      graphics.roundRect(-48, -50, 96, 100, 18);
      graphics.stroke();
    }

    highlightNode.active = true;
  },

  _createOrGetChild: function (parentNode, name) {
    var node = parentNode.getChildByName(name);
    if (!node) {
      node = new cc.Node(name);
      node.parent = parentNode;
    }

    return node;
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
});

