"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var DebugFlags = Shared.DebugFlags;
var Logger = Shared.Logger;

module.exports = {
  _getLevelSelectTopLayerNode: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return null;
    }

    var topLayerNode = this._levelSelectNode.getChildByName("top_layer");
    if (topLayerNode && topLayerNode.isValid) {
      return topLayerNode;
    }

    var topNode = this._levelSelectNode.getChildByName("top");
    if (!topNode || !topNode.isValid) {
      return null;
    }

    topLayerNode = topNode.getChildByName("top_layer");
    return topLayerNode && topLayerNode.isValid ? topLayerNode : null;
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
    var startNextLevel = function () {
      this._setStatus("Loading level_" + ("000" + nextLevelId).slice(-3) + "...");
      this._loadLevelById(nextLevelId, "Next level started", "No next level available.");
    }.bind(this);

    if (!this._consumeStaminaForLevelEntry(startNextLevel)) {
      if (!this._staminaRecoveryInProgress) {
        this._setStatus("Stamina is not enough. It resets to 10 at 00:00.");
        // 胜利页点击“下一关”时若体力不足，主动返回选关页，避免“点击无反应”的体验。
        this._showLevelSelectView();
      }
      return;
    }

    startNextLevel();
  },

  _onBackToLevelTap: function () {
    if (this.isRestarting) {
      return;
    }

    var targetLevelId = 0;
    if (this.currentLevelConfig && this.currentLevelConfig.level) {
      targetLevelId = Math.max(1, Math.floor(Number(this.currentLevelConfig.level.levelId) || 0));
    } else if (this._currentLevelId) {
      targetLevelId = Math.max(1, Math.floor(Number(this._currentLevelId) || 0));
    }

    this._playSfx("uiClick");
    this._showLevelSelectView({
      targetLevelId: targetLevelId
    });
  },

  _refreshPlayerResources: function () {
    if (!this.playerResourceStore) {
      throw new Error("GameBootstrap requires PlayerResourceStore.");
    }

    this.playerResources = this.playerResourceStore.load();
    return this.playerResources;
  },

  _getCurrentStamina: function () {
    this._refreshPlayerResources();
    return Math.max(0, Math.floor(Number(this.playerResources && this.playerResources.stamina) || 0));
  },

  _getCurrentCoins: function () {
    this._refreshPlayerResources();
    return Math.max(0, Math.floor(Number(this.playerResources && this.playerResources.coins) || 0));
  },

  _spendCoinsForShop: function (amount, reason) {
    var cost = Math.floor(Number(amount));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("Shop coin spend amount must be a positive integer.");
    }
    if (reason !== "buy_powerup") {
      throw new Error("Shop coin spend reason must be buy_powerup.");
    }
    this._refreshPlayerResources();
    var currentCoins = Math.floor(Number(this.playerResources.coins));
    if (!Number.isInteger(currentCoins) || currentCoins < 0) {
      throw new Error("Player coin balance is invalid.");
    }
    if (currentCoins < cost) {
      return {
        accepted: false,
        reason: "SHOP_COIN_NOT_ENOUGH"
      };
    }
    this.playerResources.coins = currentCoins - cost;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return {
      accepted: true,
      cost: cost,
      coinBefore: currentCoins,
      coinAfter: this.playerResources.coins
    };
  },

  _refundCoinsForShop: function (amount, reason) {
    var refund = Math.floor(Number(amount));
    if (!Number.isInteger(refund) || refund <= 0) {
      throw new Error("Shop coin refund amount must be a positive integer.");
    }
    if (reason !== "shop_purchase_rollback") {
      throw new Error("Shop coin refund reason must be shop_purchase_rollback.");
    }
    this._refreshPlayerResources();
    var currentCoins = Math.floor(Number(this.playerResources.coins));
    if (!Number.isInteger(currentCoins) || currentCoins < 0) {
      throw new Error("Player coin balance is invalid.");
    }
    this.playerResources.coins = currentCoins + refund;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return {
      accepted: true,
      refund: refund,
      coinBefore: currentCoins,
      coinAfter: this.playerResources.coins
    };
  },

  _addStaminaForShop: function (count, reason) {
    var amount = Math.floor(Number(count));
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("Shop stamina grant count must be a positive integer.");
    }
    if (reason !== "shop_purchase") {
      throw new Error("Shop stamina grant reason must be shop_purchase.");
    }
    this._refreshPlayerResources();
    var currentStamina = Math.floor(Number(this.playerResources.stamina));
    if (!Number.isInteger(currentStamina) || currentStamina < 0) {
      throw new Error("Player stamina value is invalid.");
    }
    this.playerResources.stamina = currentStamina + amount;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return {
      accepted: true,
      itemId: "stamina",
      gained: amount,
      total: this.playerResources.stamina
    };
  },

  _consumeStaminaForLevelEntry: function (onRecovered) {
    if (!this.playerResourceStore) {
      return true;
    }

    this._refreshPlayerResources();
    var consumeResult = this.playerResourceStore.consumeStamina(this.playerResources, 1);
    if (!consumeResult || !consumeResult.accepted) {
      this.playerResources = consumeResult && consumeResult.resources
        ? consumeResult.resources
        : (this.playerResources || { stamina: 0, coins: 0 });
      this._updateLevelSelectTopStatus();
      if (
        typeof onRecovered === "function" &&
        typeof this._tryRecoverStaminaByAd === "function"
      ) {
        this._tryRecoverStaminaByAd(function () {
          if (!this._consumeStaminaForLevelEntry()) {
            this._setStatus("Stamina is not enough. It resets to 10 at 00:00.");
            return;
          }
          onRecovered();
        }.bind(this));
      }
      return false;
    }

    this.playerResources = consumeResult.resources;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return true;
  },

  _updateLevelSelectTopStatus: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var topLayerNode = this._getLevelSelectTopLayerNode();
    if (!topLayerNode || !topLayerNode.isValid) {
      return;
    }

    var loveInfoNode = topLayerNode.getChildByName("love_info");
    var goldInfoNode = topLayerNode.getChildByName("gold_info");
    var loveNode = loveInfoNode ? loveInfoNode.getChildByName("love") : null;
    var goldNode = goldInfoNode ? goldInfoNode.getChildByName("gold") : null;
    var loveLabel = loveNode ? loveNode.getComponent(cc.Label) : null;
    var goldLabel = goldNode ? goldNode.getComponent(cc.Label) : null;

    if (loveLabel) {
      loveLabel.string = String(this._getCurrentStamina());
    }
    if (goldLabel) {
      goldLabel.string = String(this._getCurrentCoins());
    }

    this._updateSignInEntryState();
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    if (typeof this._updateStarChestEntryState === "function") {
      this._updateStarChestEntryState();
    }
    if (typeof this._updateGameCircleEntryState === "function") {
      this._updateGameCircleEntryState();
    }
  },

  _setStatus: function (message) {
    if (message === this._lastStatusMessage) {
      return;
    }
    this._lastStatusMessage = message;

    if (this._statusLabel) {
      this._statusLabel.string = String(message || "");
    }

    Logger.info(message);
  },

  _formatStatus: function (levelConfig, snapshot) {
    var matched = snapshot.lastResolution ? snapshot.lastResolution.matched.length : 0;
    var floating = snapshot.lastResolution ? snapshot.lastResolution.floating.length : 0;
    var objectiveSnapshot = snapshot.objectives || null;
    var collected = objectiveSnapshot
      ? Math.max(0, Number(objectiveSnapshot.progress) || 0)
      : (snapshot.jars ? snapshot.jars.collectedTotal : 0);
    var objective = objectiveSnapshot
      ? Math.max(0, Number(objectiveSnapshot.target) || 0)
      : (snapshot.jars ? snapshot.jars.objectiveTarget : 0);
    var winStats = snapshot.winStats || {};
    var scoreHeatBand = winStats.scoreHeatBand || null;
    var scoreBandText = scoreHeatBand
      ? [scoreHeatBand.min, scoreHeatBand.target, scoreHeatBand.max].join("/")
      : "-";
    var boostRemainingMs = Math.max(0, Math.floor(Number(snapshot.jarScoreBoostRemainingMs) || 0));
    var boostText = snapshot.jarScoreBoostActive
      ? ("x" + (Number(snapshot.jarScoreBoostMultiplier) || 1) + " (" + boostRemainingMs + "ms)")
      : "off";

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
      "JarBoost: " + boostText,
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

  _findNodeByNameRecursive: function (rootNode, name) {
    if (!rootNode || !rootNode.isValid || !name) {
      return null;
    }

    if (rootNode.name === name) {
      return rootNode;
    }

    var queue = rootNode.children ? rootNode.children.slice() : [];
    while (queue.length > 0) {
      var node = queue.shift();
      if (!node || !node.isValid) {
        continue;
      }
      if (node.name === name) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        Array.prototype.push.apply(queue, node.children);
      }
    }

    return null;
  },

  _bindNodeTapOnce: function (node, onTap) {
    if (!node || !node.isValid || typeof onTap !== "function" || node.__tapBound === true) {
      return;
    }

    node.__tapBound = true;
    node.on(cc.Node.EventType.TOUCH_END, function (event) {
      if (event) {
        event.stopPropagation();
      }
      onTap();
    });
  }
};
