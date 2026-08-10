"use strict";

var Shared = require("./GameBootstrapShared");
var BundleLoader = Shared.BundleLoader;
var Logger = Shared.Logger;
var SpiritShopConfig = Shared.SpiritShopConfig;
var SpiritShopViewController = Shared.SpiritShopViewController;
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");

var SPIRIT_SHOP_PREFAB_PATH = "spirit_system/prefabs/SpiritShopView";
var SPIRIT_SYSTEM_BUNDLE_NAME = "spirit_system";
var SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP = "系统开发中，敬请期待";

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
    throw new Error("SpiritShopView sprite path must be a non-empty string.");
  }
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load SpiritShopView SpriteFrame failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("SpiritShopView SpriteFrame is empty: " + path));
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
    throw new Error("SpiritShopView SpriteFrame load result is invalid.");
  }
  if (typeof entry.spriteFrame.addRef !== "function") {
    throw new Error("SpiritShopView SpriteFrame addRef is required: " + entry.path);
  }
  entry.spriteFrame.addRef();
  return entry;
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

function requireSpiritShopRuntime(host) {
  if (!host.spiritShopService || typeof host.spiritShopService.getSnapshot !== "function") {
    throw new Error("Spirit shop requires SpiritShopService.");
  }
}

function resolvePurchaseFailureMessage(result) {
  if (!result || result.accepted !== false || typeof result.reason !== "string") {
    throw new Error("Spirit shop purchase rejection is invalid.");
  }
  if (result.reason === "GEM_NOT_ENOUGH") {
    return "钻石不足";
  }
  if (result.reason === "FRAGMENT_OFFER_SOLD_OUT") {
    return "该碎片已经售罄";
  }
  if (result.reason === "PRODUCT_DAILY_LIMIT_REACHED") {
    return "该商品今日已售罄";
  }
  if (result.reason === "ALL_SPIRITS_MAX_LEVEL") {
    return "所有精灵均已满级";
  }
  throw new Error("Unsupported spirit shop rejection: " + result.reason);
}

module.exports = {
  _ensureSpiritShopViewPrefab: function () {
    if (this._spiritShopViewPrefab) {
      return Promise.resolve(this._spiritShopViewPrefab);
    }
    return this._loadPrefab(SPIRIT_SHOP_PREFAB_PATH).then(function (prefab) {
      if (!prefab || !cc.isValid(prefab)) {
        throw new Error("SpiritShopView prefab is required.");
      }
      this._spiritShopViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureSpiritShopSpriteFrames: function () {
    if (this._spiritShopSpriteFrameCache) {
      return Promise.resolve(this._spiritShopSpriteFrameCache);
    }
    if (this._spiritShopSpriteFrameLoadPromise) {
      return this._spiritShopSpriteFrameLoadPromise;
    }
    this._spiritShopSpriteFrameLoadPromise = Promise.all(
      SpiritShopConfig.getAllSpritePaths().map(loadSpriteFrame)
    ).then(function (entries) {
      var cache = {};
      entries.forEach(function (entry) {
        retainSpriteFrame(entry);
        if (cache[entry.path]) {
          throw new Error("Duplicated SpiritShopView SpriteFrame path: " + entry.path);
        }
        cache[entry.path] = entry.spriteFrame;
      });
      this._spiritShopSpriteFrameCache = cache;
      return cache;
    }.bind(this)).catch(function (error) {
      this._spiritShopSpriteFrameLoadPromise = null;
      throw error;
    }.bind(this));
    return this._spiritShopSpriteFrameLoadPromise;
  },

  _showSpiritShopView: function () {
    requireSpiritShopRuntime(this);
    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    this._hideDailyTaskView();
    this._hideInventoryView();
    var hallViewNodeBeforeSwitch = this._spiritHallViewNode;
    var switchingFromHall = Boolean(
      hallViewNodeBeforeSwitch &&
      hallViewNodeBeforeSwitch.isValid &&
      hallViewNodeBeforeSwitch.active
    );
    var hasHallViewResources = Boolean(
      this._spiritHallViewNode ||
      this._spiritHallViewPrefab ||
      this._spiritSystemTabBarNode ||
      this._spiritSystemTabBarPrefab ||
      this._spiritHallSpriteFrameCache
    );
    if (hasHallViewResources && !switchingFromHall) {
      this._hideSpiritHallView({
        releaseBundle: false
      });
    }

    return Promise.all([
      this._ensureSpiritShopViewPrefab(),
      this._ensureSpiritShopSpriteFrames(),
      this._ensureSpiritSystemTabBarPrefab()
    ]).then(function (results) {
      var prefab = results[0];
      var spriteFrameCache = results[1];
      var tabBarPrefab = results[2];
      if (
        !tabBarPrefab ||
        !cc.isValid(tabBarPrefab) ||
        tabBarPrefab !== this._spiritSystemTabBarPrefab
      ) {
        throw new Error("SpiritShopView requires the retained shared SpiritSystemTabBar prefab.");
      }
      var viewNode = this._spiritShopViewNode;
      if (!viewNode || !viewNode.isValid) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode || !viewNode.isValid) {
          throw new Error("Instantiate SpiritShopView failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = 360;
        this._spiritShopViewNode = viewNode;
        this._spiritShopViewController = new SpiritShopViewController({
          node: viewNode,
          spriteFrameCache: spriteFrameCache,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideSpiritShopView({
              releaseBundle: true
            });
          }.bind(this),
          onOpenHall: this._showSpiritHallView.bind(this),
          onUnavailableTab: function () {
            if (!this.tipsPresenter || typeof this.tipsPresenter.showText !== "function") {
              throw new Error("Spirit system unavailable-tab TipsPresenter is not ready.");
            }
            this._playSfx("uiClick");
            return this.tipsPresenter.showText(SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP);
          }.bind(this),
          onRefresh: this._refreshSpiritShopOffers.bind(this),
          onBuyFragment: this._purchaseSpiritShopFragment.bind(this),
          onBuyProduct: this._purchaseSpiritShopProduct.bind(this)
        });
      }
      viewNode.active = true;
      this._renderSpiritShopView();
      if (switchingFromHall) {
        this._hideSpiritHallView({
          releaseBundle: false
        });
      }
      return viewNode;
    }.bind(this)).catch(function (error) {
      this._hideSpiritShopView({
        releaseBundle: !switchingFromHall
      });
      Logger.error("Show SpiritShopView failed", error && error.stack ? error.stack : error);
      throw error;
    }.bind(this));
  },

  _hideSpiritShopView: function (options) {
    var hideOptions = requireHideOptions(options, "SpiritShopView");
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SpiritShopView",
      nodeKey: "_spiritShopViewNode",
      prefabKey: "_spiritShopViewPrefab",
      controllerKey: "_spiritShopViewController",
      spriteFrameCacheKey: "_spiritShopSpriteFrameCache",
      extraNullKeys: ["_spiritShopSpriteFrameLoadPromise"]
    });
    if (hideOptions.releaseBundle) {
      releaseRetainedPrefabAsset(this._spiritSystemTabBarPrefab, "SpiritSystemTabBar");
      this._spiritSystemTabBarPrefab = null;
      this._spiritSystemTabBarPrefabLoadPromise = null;
      BundleLoader.releaseNamedBundle(SPIRIT_SYSTEM_BUNDLE_NAME);
    }
  },

  _renderSpiritShopView: function () {
    requireSpiritShopRuntime(this);
    if (!this._spiritShopViewController) {
      throw new Error("Render SpiritShopView requires controller.");
    }
    this._spiritShopViewController.render(this.spiritShopService.getSnapshot(new Date()));
  },

  _purchaseSpiritShopFragment: function (slotIndex) {
    requireSpiritShopRuntime(this);
    this._playSfx("uiClick");
    var result = this.spiritShopService.purchaseFragment(slotIndex, new Date());
    if (result.accepted !== true) {
      this._setStatus(resolvePurchaseFailureMessage(result));
      this._renderSpiritShopView();
      return false;
    }
    this.playerResources = this.playerResourceStore.load();
    this.assistSpiritState = this.assistSpiritStore.load();
    this._updateLevelSelectTopStatus();
    var message = "获得" + result.quantity + "个精灵碎片";
    this._setStatusWithTip("spirit_shop_purchase_success", null, message);
    this._renderSpiritShopView();
    return true;
  },

  _purchaseSpiritShopProduct: function (skuId) {
    requireSpiritShopRuntime(this);
    this._playSfx("uiClick");
    var result = this.spiritShopService.purchaseProduct(skuId, new Date());
    if (result.accepted !== true) {
      this._setStatus(resolvePurchaseFailureMessage(result));
      this._renderSpiritShopView();
      return false;
    }
    this.playerResources = this.playerResourceStore.load();
    if (result.product.kind === "random_fragments") {
      this.assistSpiritState = this.assistSpiritStore.load();
    }
    this._updateLevelSelectTopStatus();
    var message = result.product.kind === "random_fragments"
      ? "获得" + result.spiritDisplayName + "碎片x" + result.quantity
      : "购买" + result.product.displayName + "成功";
    this._setStatusWithTip("spirit_shop_purchase_success", null, message);
    this._renderSpiritShopView();
    return true;
  },

  _refreshSpiritShopOffers: function () {
    requireSpiritShopRuntime(this);
    this._playSfx("uiClick");
    var result = this.spiritShopService.manualRefresh(new Date());
    if (result.accepted !== true) {
      this._setStatus(resolvePurchaseFailureMessage(result));
      this._renderSpiritShopView();
      return false;
    }
    this.playerResources = this.playerResourceStore.load();
    this._updateLevelSelectTopStatus();
    this._setStatus("精灵碎片商品已刷新");
    this._renderSpiritShopView();
    return true;
  }
};
