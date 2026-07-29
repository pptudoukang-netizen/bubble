"use strict";

var Shared = require("./GameBootstrapShared");
var BundleLoader = Shared.BundleLoader;
var Logger = Shared.Logger;
var SpiritHallViewController = Shared.SpiritHallViewController;
var AssistSpiritConfig = require("../config/AssistSpiritConfig");
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");

var SPIRIT_HALL_PREFAB_PATH = "spirit_system/prefabs/SpiritHallView";
var SPIRIT_SYSTEM_BUNDLE_NAME = "spirit_system";

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
  if (!host.playerResourceStore || typeof host.playerResourceStore.save !== "function") {
    throw new Error("Spirit hall requires PlayerResourceStore.");
  }
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

    return Promise.all([
      this._ensureSpiritHallViewPrefab(),
      this._ensureSpiritHallSpriteFrames()
    ]).then(function (results) {
      var prefab = results[0];
      var spriteFrameCache = results[1];
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
        this._spiritHallViewController = new SpiritHallViewController({
          node: viewNode,
          spriteFrameCache: spriteFrameCache,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideSpiritHallView();
          }.bind(this),
          onUpgrade: this._upgradeSelectedSpirit.bind(this),
          onAdvance: this._advanceSelectedSpirit.bind(this),
          onEquip: this._equipSelectedSpirit.bind(this)
        });
      }
      viewNode.active = true;
      this._renderSpiritHallView();
      return viewNode;
    }.bind(this)).catch(function (error) {
      this._hideSpiritHallView();
      Logger.error("Show SpiritHallView failed", error && error.stack ? error.stack : error);
      throw error;
    }.bind(this));
  },

  _hideSpiritHallView: function () {
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SpiritHallView",
      nodeKey: "_spiritHallViewNode",
      prefabKey: "_spiritHallViewPrefab",
      controllerKey: "_spiritHallViewController",
      spriteFrameCacheKey: "_spiritHallSpriteFrameCache",
      extraNullKeys: ["_spiritHallSpriteFrameLoadPromise"]
    });
    BundleLoader.releaseNamedBundle(SPIRIT_SYSTEM_BUNDLE_NAME);
  },

  _renderSpiritHallView: function () {
    if (!this._spiritHallViewController) {
      throw new Error("Render SpiritHallView requires controller.");
    }
    this._refreshAssistSpiritState();
    this._spiritHallViewController.render({
      coins: this._getCurrentCoins(),
      state: this.assistSpiritState
    });
  },

  _upgradeSelectedSpirit: function (spiritId) {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._refreshAssistSpiritState();
    var coinBalance = this._getCurrentCoins();
    var result = this.assistSpiritStore.buildLevelUpgrade(
      this.assistSpiritState,
      spiritId,
      coinBalance
    );
    if (result.accepted !== true) {
      if (result.reason === "MAX_LEVEL") {
        this._setStatus("精灵已达到最高等级");
      } else if (result.reason === "COIN_NOT_ENOUGH") {
        this._setStatus("金币不足");
      } else {
        throw new Error("Unsupported assist spirit level-up rejection: " + result.reason);
      }
      this._renderSpiritHallView();
      return false;
    }

    this.playerResources.coins = coinBalance - result.cost;
    this.playerResourceStore.save(this.playerResources);
    this.assistSpiritState = this.assistSpiritStore.save(result.state);
    this._updateLevelSelectTopStatus();
    this._renderSpiritHallView();
    return true;
  },

  _advanceSelectedSpirit: function (spiritId) {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._refreshAssistSpiritState();
    var result = this.assistSpiritStore.buildStarAdvance(this.assistSpiritState, spiritId);
    if (result.accepted !== true) {
      if (result.reason === "MAX_STARS") {
        this._setStatus("精灵已达到最高星级");
      } else if (result.reason === "FRAGMENT_NOT_ENOUGH") {
        this._setStatus("精灵碎片不足");
      } else {
        throw new Error("Unsupported assist spirit star-up rejection: " + result.reason);
      }
      this._renderSpiritHallView();
      return false;
    }
    this.assistSpiritState = this.assistSpiritStore.save(result.state);
    this._renderSpiritHallView();
    return true;
  },

  _equipSelectedSpirit: function (spiritId) {
    requireAssistSpiritRuntime(this);
    this._playSfx("uiClick");
    this._refreshAssistSpiritState();
    this.assistSpiritState = this.assistSpiritStore.save(
      this.assistSpiritStore.buildEquip(this.assistSpiritState, spiritId)
    );
    this._renderSpiritHallView();
    return true;
  }
};
