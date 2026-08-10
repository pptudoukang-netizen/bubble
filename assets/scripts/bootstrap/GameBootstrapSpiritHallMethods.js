"use strict";

var Shared = require("./GameBootstrapShared");
var BundleLoader = Shared.BundleLoader;
var Logger = Shared.Logger;
var SpiritHallViewController = Shared.SpiritHallViewController;
var AssistSpiritConfig = require("../config/AssistSpiritConfig");
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");

var SPIRIT_HALL_PREFAB_PATH = "spirit_system/prefabs/SpiritHallView";
var SPIRIT_SYSTEM_TAB_BAR_PREFAB_PATH = "spirit_system/prefabs/SpiritSystemTabBar";
var SPIRIT_SYSTEM_BUNDLE_NAME = "spirit_system";
var SPIRIT_SYSTEM_TAB_BAR_Y = -595;
var SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP = "系统开发中，敬请期待";
var SPIRIT_NOT_UNLOCKED_TIP = "该精灵尚未解锁，请先完成对应救援关卡";

function showSpiritNotUnlockedTip(host) {
  if (!host || typeof host._setStatusWithTip !== "function") {
    throw new Error("Locked assist spirit action requires _setStatusWithTip.");
  }
  host._setStatusWithTip("assist_spirit_not_unlocked", null, SPIRIT_NOT_UNLOCKED_TIP);
}

function requireHideOptions(options, label) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(label + " hide options are required.");
  }
  if (typeof options.releaseBundle !== "boolean") {
    throw new Error(label + " hide options.releaseBundle must be boolean.");
  }
  return options;
}

function loadSpriteFrame(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("SpiritHallView sprite path must be a non-empty string.");
  }
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load SpiritHallView SpriteFrame failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("SpiritHallView SpriteFrame is empty: " + path));
        return;
      }
      resolve({
        path: path,
        spriteFrame: spriteFrame
      });
    });
  });
}

function retainSpriteFrame(entry) {
  if (!entry || typeof entry.path !== "string" || !entry.spriteFrame) {
    throw new Error("SpiritHallView SpriteFrame load result is invalid.");
  }
  if (typeof entry.spriteFrame.addRef !== "function") {
    throw new Error("SpiritHallView SpriteFrame addRef is required: " + entry.path);
  }
  entry.spriteFrame.addRef();
  return entry;
}

function requireAssistSpiritRuntime(host) {
  if (!host.assistSpiritStore || typeof host.assistSpiritStore.load !== "function") {
    throw new Error("Spirit hall requires AssistSpiritStore.");
  }
}

function requireSpiritSystemTabBarMount(viewNode) {
  if (!viewNode || !viewNode.isValid) {
    throw new Error("SpiritSystemTabBar requires a valid SpiritHallView node.");
  }
  var safeAreaRoot = viewNode.getChildByName("SafeAreaRoot");
  if (!safeAreaRoot || !safeAreaRoot.isValid) {
    throw new Error("SpiritHallView/SafeAreaRoot is required.");
  }
  var designContent = safeAreaRoot.getChildByName("DesignContent");
  if (!designContent || !designContent.isValid) {
    throw new Error("SpiritHallView/SafeAreaRoot/DesignContent is required.");
  }
  var logicLayer = designContent.getChildByName("LogicLayer");
  if (!logicLayer || !logicLayer.isValid) {
    throw new Error("SpiritHallView/SafeAreaRoot/DesignContent/LogicLayer is required.");
  }
  var mount = logicLayer.getChildByName("BottomNavigationMount");
  if (!mount || !mount.isValid) {
    throw new Error("SpiritHallView BottomNavigationMount is required.");
  }
  return mount;
}

function instantiateSpiritSystemTabBar(prefab, viewNode) {
  if (!prefab || !cc.isValid(prefab)) {
    throw new Error("SpiritSystemTabBar prefab is required.");
  }
  var mount = requireSpiritSystemTabBarMount(viewNode);
  if (mount.children.length !== 0) {
    throw new Error("SpiritHallView BottomNavigationMount must be empty before TabBar instantiation.");
  }
  var tabBarNode = cc.instantiate(prefab);
  if (!tabBarNode || !tabBarNode.isValid || tabBarNode.name !== "SpiritSystemTabBar") {
    throw new Error("Instantiate SpiritSystemTabBar failed.");
  }
  tabBarNode.parent = mount;
  tabBarNode.setPosition(0, SPIRIT_SYSTEM_TAB_BAR_Y);
  return tabBarNode;
}

function retainPrefabAsset(prefab, label) {
  if (!prefab || typeof prefab.addRef !== "function") {
    throw new Error(label + " retain requires Prefab.addRef.");
  }
  prefab.addRef();
  return prefab;
}

function releaseRetainedPrefabAsset(prefab, label) {
  if (!prefab) {
    return;
  }
  if (typeof prefab.decRef !== "function") {
    throw new Error(label + " release requires retained Prefab.decRef.");
  }
  prefab.decRef();
}

module.exports = {
  _ensureSpiritHallViewPrefab: function () {
    if (this._spiritHallViewPrefab) {
      return Promise.resolve(this._spiritHallViewPrefab);
    }
    return this._loadPrefab(SPIRIT_HALL_PREFAB_PATH).then(function (prefab) {
      if (!prefab || !cc.isValid(prefab)) {
        throw new Error("SpiritHallView prefab is required.");
      }
      this._spiritHallViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureSpiritSystemTabBarPrefab: function () {
    if (this._spiritSystemTabBarPrefab) {
      if (!cc.isValid(this._spiritSystemTabBarPrefab)) {
        throw new Error("Cached SpiritSystemTabBar prefab lease is invalid.");
      }
      return Promise.resolve(this._spiritSystemTabBarPrefab);
    }
    if (this._spiritSystemTabBarPrefabLoadPromise) {
      return this._spiritSystemTabBarPrefabLoadPromise;
    }
    this._spiritSystemTabBarPrefabLoadPromise = this._loadPrefab(
      SPIRIT_SYSTEM_TAB_BAR_PREFAB_PATH
    ).then(function (prefab) {
      if (!prefab || !cc.isValid(prefab)) {
        throw new Error("SpiritSystemTabBar prefab is required.");
      }
      this._spiritSystemTabBarPrefab = retainPrefabAsset(prefab, "SpiritSystemTabBar");
      this._spiritSystemTabBarPrefabLoadPromise = null;
      return this._spiritSystemTabBarPrefab;
    }.bind(this)).catch(function (error) {
      this._spiritSystemTabBarPrefabLoadPromise = null;
      throw error;
    }.bind(this));
    return this._spiritSystemTabBarPrefabLoadPromise;
  },

  _ensureSpiritHallSpriteFrames: function () {
    if (!this._spiritHallSpriteFrameCache) {
      this._spiritHallSpriteFrameCache = {};
    }
    if (this._spiritHallSpriteFrameLoadPromise) {
      return this._spiritHallSpriteFrameLoadPromise;
    }
    var paths = AssistSpiritConfig.getAllSpritePaths();
    var missingPaths = paths.filter(function (path) {
      return !this._spiritHallSpriteFrameCache[path];
    }, this);
    if (missingPaths.length === 0) {
      return Promise.resolve(this._spiritHallSpriteFrameCache);
    }
    this._spiritHallSpriteFrameLoadPromise = Promise.all(missingPaths.map(loadSpriteFrame)).then(function (entries) {
      entries.map(retainSpriteFrame).forEach(function (entry) {
        this._spiritHallSpriteFrameCache[entry.path] = entry.spriteFrame;
      }, this);
      this._spiritHallSpriteFrameLoadPromise = null;
      return this._spiritHallSpriteFrameCache;
    }.bind(this)).catch(function (error) {
      this._spiritHallSpriteFrameLoadPromise = null;
      throw error;
    }.bind(this));
    return this._spiritHallSpriteFrameLoadPromise;
  },

  _refreshAssistSpiritState: function () {
    requireAssistSpiritRuntime(this);
    this.assistSpiritState = this.assistSpiritStore.load();
    return this.assistSpiritState;
  },

  _showSpiritHallView: function () {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    this._hideDailyTaskView();
    this._hideInventoryView();
    var shopViewNodeBeforeSwitch = this._spiritShopViewNode;
    var switchingFromShop = Boolean(
      shopViewNodeBeforeSwitch &&
      shopViewNodeBeforeSwitch.isValid &&
      shopViewNodeBeforeSwitch.active
    );
    var hasShopViewResources = Boolean(
      this._spiritShopViewNode ||
      this._spiritShopViewPrefab ||
      this._spiritShopSpriteFrameCache
    );
    if (hasShopViewResources && !switchingFromShop) {
      this._hideSpiritShopView({
        releaseBundle: false
      });
    }

    return this._runWithNetworkLoading(function () {
      return Promise.all([
        this._ensureSpiritHallViewPrefab(),
        this._ensureSpiritSystemTabBarPrefab(),
        this._ensureSpiritHallSpriteFrames()
      ]);
    }.bind(this), {
      timeoutMs: this.networkLoadingTimeoutMs
    }).then(function (results) {
      var prefab = results[0];
      var tabBarPrefab = results[1];
      var spriteFrameCache = results[2];
      var viewNode = this._spiritHallViewNode;
      if (!viewNode || !viewNode.isValid) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode || !viewNode.isValid) {
          throw new Error("Instantiate SpiritHallView failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = 360;
        this._spiritHallViewNode = viewNode;
        this._spiritSystemTabBarNode = instantiateSpiritSystemTabBar(tabBarPrefab, viewNode);
        this._spiritHallViewController = new SpiritHallViewController({
          node: viewNode,
          spriteFrameCache: spriteFrameCache,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideSpiritHallView({
              releaseBundle: true
            });
          }.bind(this),
          onUpgrade: this._upgradeSelectedSpirit.bind(this),
          onEquip: this._equipSelectedSpirit.bind(this),
          onOpenShop: this._showSpiritShopView.bind(this),
          onUnavailableTab: function () {
            if (!this.tipsPresenter || typeof this.tipsPresenter.showText !== "function") {
              throw new Error("Spirit system unavailable-tab TipsPresenter is not ready.");
            }
            this._playSfx("uiClick");
            return this.tipsPresenter.showText(SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP);
          }.bind(this)
        });
      } else if (
        !this._spiritSystemTabBarNode ||
        !this._spiritSystemTabBarNode.isValid ||
        this._spiritSystemTabBarNode.parent !== requireSpiritSystemTabBarMount(viewNode)
      ) {
        throw new Error("SpiritHallView cached SpiritSystemTabBar instance is invalid.");
      }
      viewNode.active = true;
      this._renderSpiritHallView();
      if (switchingFromShop) {
        this._hideSpiritShopView({
          releaseBundle: false
        });
      }
      return viewNode;
    }.bind(this)).catch(function (error) {
      this._hideSpiritHallView({
        releaseBundle: !switchingFromShop
      });
      Logger.error("Show SpiritHallView failed", error && error.stack ? error.stack : error);
      throw error;
    }.bind(this));
  },

  _hideSpiritHallView: function (options) {
    var hideOptions = requireHideOptions(options, "SpiritHallView");
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SpiritHallView",
      nodeKey: "_spiritHallViewNode",
      prefabKey: "_spiritHallViewPrefab",
      controllerKey: "_spiritHallViewController",
      spriteFrameCacheKey: "_spiritHallSpriteFrameCache",
      extraNullKeys: ["_spiritHallSpriteFrameLoadPromise", "_spiritSystemTabBarNode"]
    });
    if (hideOptions.releaseBundle) {
      releaseRetainedPrefabAsset(this._spiritSystemTabBarPrefab, "SpiritSystemTabBar");
      this._spiritSystemTabBarPrefab = null;
      this._spiritSystemTabBarPrefabLoadPromise = null;
      BundleLoader.releaseNamedBundle(SPIRIT_SYSTEM_BUNDLE_NAME);
    }
  },

  _renderSpiritHallView: function () {
    if (!this._spiritHallViewController) {
      throw new Error("Render SpiritHallView requires controller.");
    }
    this._refreshAssistSpiritState();
    this._spiritHallViewController.render({
      coins: this._getCurrentCoins(),
      gems: this._getCurrentGems(),
      state: this.assistSpiritState
    });
  },

  _upgradeSelectedSpirit: function (spiritId) {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._refreshAssistSpiritState();
    var result = this.assistSpiritStore.buildLevelUpgrade(
      this.assistSpiritState,
      spiritId
    );
    if (result.accepted !== true) {
      if (result.reason === "NOT_OWNED") {
        showSpiritNotUnlockedTip(this);
      } else if (result.reason === "MAX_LEVEL") {
        this._setStatus("精灵已达到最高等级");
      } else if (result.reason === "FRAGMENT_NOT_ENOUGH") {
        this._setStatusWithTip("spirit_upgrade_fragment_not_enough", null, "精灵碎片不足");
      } else {
        throw new Error("Unsupported assist spirit level-up rejection: " + result.reason);
      }
      this._renderSpiritHallView();
      return false;
    }

    this.assistSpiritState = this.assistSpiritStore.save(result.state);
    this._updateLevelSelectTopStatus();
    if (this._spiritHallViewController) {
      this._renderSpiritHallView();
    }
    return true;
  },

  _equipSelectedSpirit: function (spiritId) {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._refreshAssistSpiritState();
    var spirit = AssistSpiritConfig.getSpirit(spiritId);
    var entry = this.assistSpiritState.spirits[spirit.id];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Assist spirit equip state is missing: " + spirit.id);
    }
    if (entry.owned !== true) {
      showSpiritNotUnlockedTip(this);
      if (this._spiritHallViewController) {
        this._renderSpiritHallView();
      }
      return false;
    }
    this.assistSpiritState = this.assistSpiritStore.save(
      this.assistSpiritStore.buildEquip(this.assistSpiritState, spirit.id)
    );
    if (this._spiritHallViewController) {
      this._renderSpiritHallView();
    }
    return true;
  }
};
