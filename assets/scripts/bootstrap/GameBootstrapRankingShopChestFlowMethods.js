"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var LeaderboardStore = Shared.LeaderboardStore;
var RankingViewController = Shared.RankingViewController;
var ShopViewController = Shared.ShopViewController;
var BuyViewController = Shared.BuyViewController;
var RANKING_VIEW_PREFAB_PATH = Shared.RANKING_VIEW_PREFAB_PATH;
var SHOP_VIEW_PREFAB_PATH = Shared.SHOP_VIEW_PREFAB_PATH;
var BUY_VIEW_PREFAB_PATH = Shared.BUY_VIEW_PREFAB_PATH;
var formatRewardItems = Shared.formatRewardItems;
var showStatusAndTip = Shared.showStatusAndTip;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;
var resolveStarChestFailMessage = Shared.resolveStarChestFailMessage;

module.exports = {
  _resolveLeaderboardPlayerName: function () {
    try {
      var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
      var storedName = storage ? storage.getItem("bubble_player_name_v1") : "";
      if (typeof storedName === "string" && storedName) {
        return storedName;
      }
    } catch (error) {
      Logger.warn("Read leaderboard player name failed", error && error.message ? error.message : error);
    }

    return "\u6211";
  },

  _refreshLeaderboardEntries: function () {
    if (!this.leaderboardStore) {
      this.leaderboardStore = new LeaderboardStore();
    }
    this._refreshLevelProgress();
    return this.leaderboardStore.buildEntries(this.levelProgress, this._resolveLeaderboardPlayerName());
  },

  _ensureRankingViewPrefab: function () {
    if (this._rankingViewPrefab) {
      return Promise.resolve(this._rankingViewPrefab);
    }

    return this._loadPrefab(RANKING_VIEW_PREFAB_PATH).then(function (prefab) {
      this._rankingViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _onLevelSelectRankingTap: function () {
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showRankingView();
  },

  _showRankingView: function () {
    this._hideAwardView();
    this._hideSettingView();
    this._hideSignInView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    this._ensureRankingViewPrefab().then(function (prefab) {
      var rankingNode = this._rankingViewNode;
      if (!rankingNode || !cc.isValid(rankingNode)) {
        rankingNode = cc.instantiate(prefab);
        if (!rankingNode) {
          this._setStatus("\u6392\u884c\u699c\u521b\u5efa\u5931\u8d25");
          return;
        }
        rankingNode.parent = this.node;
        rankingNode.setPosition(0, 0);
        rankingNode.zIndex = 330;
        this._rankingViewNode = rankingNode;
        this._rankingViewController = new RankingViewController({
          node: rankingNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideRankingView();
          }.bind(this)
        });
      }

      rankingNode.active = true;
      this._renderRankingView();
    }.bind(this)).catch(function (error) {
      Logger.warn("Show ranking view failed", error && error.message ? error.message : error);
      this._setStatus("\u6392\u884c\u699c\u52a0\u8f7d\u5931\u8d25");
    }.bind(this));
  },

  _hideRankingView: function () {
    if (!this._rankingViewNode || !cc.isValid(this._rankingViewNode)) {
      return;
    }
    this._rankingViewNode.active = false;
  },

  _renderRankingView: function () {
    if (!this._rankingViewController || !this._rankingViewNode || !cc.isValid(this._rankingViewNode)) {
      return;
    }

    this._rankingViewController.render(this._refreshLeaderboardEntries());
  },

  _ensureShopViewPrefab: function () {
    if (this._shopViewPrefab) {
      return Promise.resolve(this._shopViewPrefab);
    }

    return this._loadPrefab(SHOP_VIEW_PREFAB_PATH).then(function (prefab) {
      this._shopViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureBuyViewPrefab: function () {
    if (this._buyViewPrefab) {
      return Promise.resolve(this._buyViewPrefab);
    }

    return this._loadPrefab(BUY_VIEW_PREFAB_PATH).then(function (prefab) {
      this._buyViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _onLevelSelectShopTap: function () {
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showShopView();
  },

  _showShopView: function () {
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    this._ensureShopViewPrefab().then(function (prefab) {
      var shopNode = this._shopViewNode;
      if (!shopNode || !cc.isValid(shopNode)) {
        shopNode = cc.instantiate(prefab);
        if (!shopNode) {
          throw new Error("Instantiate ShopView prefab failed.");
        }
        shopNode.parent = this.node;
        shopNode.setPosition(0, 0);
        shopNode.zIndex = 335;
        this._shopViewNode = shopNode;
        this._shopViewController = new ShopViewController({
          node: shopNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideShopView();
          }.bind(this),
          onSelectGoods: function (skuId) {
            this._onShopGoodsTap(skuId);
          }.bind(this)
        });
      }

      shopNode.active = true;
      if (this.telemetryService && typeof this.telemetryService.track === "function") {
        this.telemetryService.track("shop_view_open", {});
      }
      return this._renderShopView();
    }.bind(this)).catch(function (error) {
      Logger.error("Show shop view failed", error && error.stack ? error.stack : error);
      showStatusAndTip(this, "商城加载失败");
    }.bind(this));
  },

  _hideShopView: function () {
    this._hideBuyView();
    if (!this._shopViewNode || !cc.isValid(this._shopViewNode)) {
      return;
    }
    this._shopViewNode.active = false;
  },

  _buildShopPurchaseState: function () {
    if (!this.shopConfigService || !this.shopStateService) {
      throw new Error("Shop services are not initialized.");
    }
    this.shopStateService.ensureDailyReset();
    var remainingBySkuId = {};
    this.shopConfigService.getSortedGoodsList().forEach(function (goods) {
      remainingBySkuId[goods.skuId] = this.shopStateService.getRemainingCount(goods.skuId);
    }, this);
    return {
      remainingBySkuId: remainingBySkuId
    };
  },

  _renderShopView: function () {
    if (!this._shopViewController || !this._shopViewNode || !cc.isValid(this._shopViewNode)) {
      return;
    }
    return this._shopViewController.render({
      goodsList: this.shopConfigService.getSortedGoodsList(),
      purchaseState: this._buildShopPurchaseState(),
      coinCount: this._getCurrentCoins()
    }).catch(function (error) {
      Logger.error("Render shop view failed", error && error.stack ? error.stack : error);
      showStatusAndTip(this, "商城刷新失败");
      return false;
    }.bind(this));
  },

  _renderBuyView: function (goods, remaining) {
    if (!this._buyViewController || !this._buyViewNode || !cc.isValid(this._buyViewNode)) {
      return Promise.resolve();
    }
    return this._buyViewController.render({
      goods: goods,
      remaining: remaining,
      coinCount: this._getCurrentCoins()
    }).catch(function (error) {
      Logger.error("Render buy view failed", error && error.stack ? error.stack : error);
      showStatusAndTip(this, "购买弹窗刷新失败");
      return false;
    }.bind(this));
  },

  _onShopGoodsTap: function (skuId) {
    if (!this.shopPurchaseService || !this.shopConfigService || !this.shopStateService) {
      throw new Error("Shop services are not initialized.");
    }
    if (this.telemetryService && typeof this.telemetryService.track === "function") {
      this.telemetryService.track("shop_item_click", {
        skuId: skuId
      });
    }
    var goods = this.shopConfigService.findGoodsBySkuId(skuId);
    if (!goods) {
      showStatusAndTip(this, "商品不存在");
      return;
    }
    if (goods.enabled !== true) {
      showStatusAndTip(this, "商品已下架");
      return;
    }
    var remaining = this.shopStateService.getRemainingCount(skuId);
    if (remaining <= 0) {
      showStatusAndTip(this, "今日售罄");
      this._renderShopView();
      return;
    }
    this._showBuyView(skuId, goods, remaining);
  },

  _showBuyView: function (skuId, goods, remaining) {
    this._ensureBuyViewPrefab().then(function (prefab) {
      var buyNode = this._buyViewNode;
      if (!buyNode || !cc.isValid(buyNode)) {
        buyNode = cc.instantiate(prefab);
        if (!buyNode) {
          throw new Error("Instantiate BuyView prefab failed.");
        }
        buyNode.parent = this.node;
        buyNode.setPosition(0, 0);
        buyNode.zIndex = 345;
        this._buyViewNode = buyNode;
        this._buyViewController = new BuyViewController({
          node: buyNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideBuyView();
          }.bind(this),
          onConfirm: function (quantity) {
            this._confirmShopPurchase(quantity);
          }.bind(this)
        });
      }

      this._buyViewSkuId = skuId;
      buyNode.active = true;
      return this._renderBuyView(goods, remaining);
    }.bind(this)).catch(function (error) {
      Logger.error("Show buy view failed", error && error.stack ? error.stack : error);
      showStatusAndTip(this, "购买弹窗加载失败");
    }.bind(this));
  },

  _hideBuyView: function () {
    this._buyViewSkuId = "";
    if (!this._buyViewNode || !cc.isValid(this._buyViewNode)) {
      return;
    }
    this._buyViewNode.active = false;
  },

  _confirmShopPurchase: function (quantity) {
    if (!this._buyViewSkuId) {
      throw new Error("BuyView skuId is missing.");
    }
    var result = this.shopPurchaseService.purchase(this._buyViewSkuId, quantity);
    if (!result.accepted) {
      showStatusAndTip(this, this._resolveShopPurchaseFailMessage(result.reason));
      this._renderShopView();
      return;
    }

    this._refreshPlayerResources();
    this._refreshPlayerInventory();
    this._updateLevelSelectTopStatus();
    this._renderShopView();
    this._hideBuyView();
    showStatusAndTip(this, "获得" + result.goods.displayName + " +" + result.itemCount);
  },

  _resolveShopPurchaseFailMessage: function (reason) {
    if (reason === "SHOP_GOODS_NOT_FOUND") {
      return "商品不存在";
    }
    if (reason === "SHOP_GOODS_DISABLED") {
      return "商品已下架";
    }
    if (reason === "SHOP_DAILY_LIMIT_REACHED") {
      return "今日售罄";
    }
    if (reason === "SHOP_COIN_NOT_ENOUGH") {
      return "金币不足";
    }
    if (reason === "SHOP_INVENTORY_ADD_FAILED") {
      return "发放道具失败，金币已回滚";
    }
    return "购买失败";
  },

  _getStarChestSummary: function () {
    this._refreshLevelProgress();
    if (!this.starChestService || typeof this.starChestService.getChestSummary !== "function") {
      throw new Error("GameBootstrap requires StarChestService.getChestSummary.");
    }
    return this.starChestService.getChestSummary(this.levelProgress);
  },

  _ensureStarChestEntryRedDot: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      return null;
    }

    var redDotNode = entryNode.getChildByName("star_chest_red_dot");
    if (redDotNode && redDotNode.isValid) {
      return redDotNode;
    }

    redDotNode = new cc.Node("star_chest_red_dot");
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

  _updateStarChestEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var topLayerNode = this._getLevelSelectTopLayerNode();
    var entryNode = topLayerNode ? topLayerNode.getChildByName("star_box_btn") : null;
    if (!entryNode || !entryNode.isValid) {
      return;
    }

    var summary = this._getStarChestSummary();
    var starsPerChest = Math.max(1, Math.floor(Number(summary.starsPerChest) || 15));
    var progressStars = Math.max(0, Math.floor(Number(summary.progressStars) || 0));
    if (Math.max(0, Math.floor(Number(summary.openableCount) || 0)) > 0) {
      progressStars = starsPerChest;
    }

    var labelNode = entryNode.getChildByName("satr_num") || entryNode.getChildByName("star_num");
    var label = labelNode ? labelNode.getComponent(cc.Label) : null;
    if (label) {
      label.string = progressStars + "/" + starsPerChest;
    }

    var button = entryNode.getComponent(cc.Button);
    if (button) {
      button.interactable = summary.enabled !== false;
    }
    entryNode.opacity = summary.enabled === false ? 150 : 255;

    var redDotNode = this._ensureStarChestEntryRedDot(entryNode);
    if (redDotNode) {
      redDotNode.active = Math.max(0, Math.floor(Number(summary.openableCount) || 0)) > 0;
    }
  },

  _ensureShopEntryButton: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    if (!bottomLayerNode || !bottomLayerNode.isValid) {
      throw new Error("LevelView bottom_layer is required for shop entry.");
    }

    var entryNode = bottomLayerNode.getChildByName("shop_btn");
    if (!entryNode || !entryNode.isValid) {
      throw new Error("LevelView bottom_layer requires shop_btn.");
    }

    this._bindNodeTapOnce(entryNode, function () {
      this._onLevelSelectShopTap();
    }.bind(this));
  },

  _openStarChest: function () {
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }
    if (!this.starChestService || typeof this.starChestService.openChest !== "function") {
      throw new Error("GameBootstrap requires StarChestService.openChest.");
    }

    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    var summary = this._getStarChestSummary();
    this._trackTelemetry("star_chest_open_click", summary);
    var openResult = this.starChestService.openChest(this.levelProgress, new Date());
    if (!openResult || !openResult.accepted) {
      var reason = openResult && openResult.reason ? openResult.reason : "STAR_CHEST_OPEN_FAILED";
      this._trackTelemetry("star_chest_open_fail", {
        fail_reason: reason
      });
      showStatusAndTip(this, resolveStarChestFailMessage(reason, summary));
      return;
    }

    this._refreshPlayerResources();
    if (typeof this._refreshPlayerInventory === "function") {
      this._refreshPlayerInventory();
    }
    this._updateLevelSelectTopStatus();
    if (typeof this._renderInventoryView === "function") {
      this._renderInventoryView();
    }

    var rewardText = formatRewardItems(openResult.rewardItems);
    var message = "\u83b7\u5f97\uff1a" + rewardText;
    this._setStatus(message);
    this._showAwardViewForRewardItems(openResult.rewardItems).catch(function (error) {
      Logger.error("Show star chest award view failed", error && error.message ? error.message : error);
      this._setStatus("宝箱奖励弹窗加载失败");
    }.bind(this));
  }
};
