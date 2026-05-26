"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var DebugFlags = Shared.DebugFlags;
var Logger = Shared.Logger;
var NEW_GIFT_INVENTORY_ITEMS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];
var NEW_GIFT_STAMINA_COUNT = 5;
var NEW_GIFT_SHAKE_IDLE_DURATION = 0.55;
var NEW_GIFT_SHAKE_ANGLE = 10;
var STAMINA_NATURAL_RECOVERY_INTERVAL_MS = 30 * 60 * 1000;
var STAMINA_NATURAL_RECOVERY_MAX = 20;
var STAMINA_FULL_TEXT = "体力已满";

function createNewGiftRewardItems() {
  var rewardItems = NEW_GIFT_INVENTORY_ITEMS.map(function (itemId) {
    return {
      id: itemId,
      count: 1
    };
  });
  rewardItems.push({
    id: "stamina",
    count: NEW_GIFT_STAMINA_COUNT
  });
  return rewardItems;
}

function requireValidDate(now, description) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error(description + " must be a valid Date.");
  }
  return now;
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function formatCountdownText(remainingMs) {
  var safeRemainingMs = requireNonNegativeInteger(remainingMs, "Stamina recovery remainingMs");
  var totalSeconds = Math.ceil(safeRemainingMs / 1000);
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  return String(minutes) + ":" + (seconds < 10 ? "0" + seconds : String(seconds));
}

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
    if (typeof this._showStartGameView !== "function") {
      throw new Error("Next level requires StartGameView entry method.");
    }
    if (typeof this._showLevelSelectView !== "function") {
      throw new Error("Next level requires level select entry method.");
    }
    this._showLevelSelectView({
      targetLevelId: nextLevelId,
      prepareLevelId: nextLevelId
    });
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
    this._applyNaturalStaminaRecovery(new Date());
    return this.playerResources;
  },

  _refreshStaminaRecoveryState: function () {
    if (!this.staminaRecoveryStore || typeof this.staminaRecoveryStore.load !== "function") {
      throw new Error("GameBootstrap requires StaminaRecoveryStore.load.");
    }

    this.staminaRecoveryState = this.staminaRecoveryStore.load();
    return this.staminaRecoveryState;
  },

  _saveStaminaRecoveryState: function (state) {
    if (!this.staminaRecoveryStore || typeof this.staminaRecoveryStore.save !== "function") {
      throw new Error("GameBootstrap requires StaminaRecoveryStore.save.");
    }

    this.staminaRecoveryStore.save(state);
    this.staminaRecoveryState = state;
  },

  _markStaminaRecoveryBaseline: function (now) {
    if (!this.staminaRecoveryStore || typeof this.staminaRecoveryStore.markBaseline !== "function") {
      throw new Error("GameBootstrap requires StaminaRecoveryStore.markBaseline.");
    }

    this.staminaRecoveryState = this.staminaRecoveryStore.markBaseline(requireValidDate(now, "Stamina recovery baseline date"));
    return this.staminaRecoveryState;
  },

  _applyNaturalStaminaRecovery: function (now) {
    var safeNow = requireValidDate(now, "Natural stamina recovery date");
    if (!this.playerResources || typeof this.playerResources !== "object") {
      throw new Error("Natural stamina recovery requires player resources.");
    }
    if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
      throw new Error("Natural stamina recovery requires PlayerResourceStore.save.");
    }

    var currentStamina = requireNonNegativeInteger(this.playerResources.stamina, "Player stamina");
    this._refreshStaminaRecoveryState();
    var lastRecoveryAt = requireNonNegativeInteger(this.staminaRecoveryState.lastRecoveryAt, "Stamina recovery lastRecoveryAt");
    var nowMs = safeNow.getTime();
    if (nowMs < lastRecoveryAt) {
      throw new Error("System time is earlier than stamina recovery baseline.");
    }

    if (currentStamina >= STAMINA_NATURAL_RECOVERY_MAX) {
      return {
        recovered: 0,
        stamina: currentStamina
      };
    }

    var elapsedMs = nowMs - lastRecoveryAt;
    var recoveryCount = Math.floor(elapsedMs / STAMINA_NATURAL_RECOVERY_INTERVAL_MS);
    if (recoveryCount <= 0) {
      return {
        recovered: 0,
        stamina: currentStamina
      };
    }

    var nextStamina = Math.min(STAMINA_NATURAL_RECOVERY_MAX, currentStamina + recoveryCount);
    var usedIntervals = nextStamina >= STAMINA_NATURAL_RECOVERY_MAX
      ? recoveryCount
      : nextStamina - currentStamina;
    var nextRecoveryAt = lastRecoveryAt + (usedIntervals * STAMINA_NATURAL_RECOVERY_INTERVAL_MS);

    this.playerResources.stamina = nextStamina;
    this.playerResourceStore.save(this.playerResources);
    this._saveStaminaRecoveryState({
      version: 1,
      lastRecoveryAt: nextRecoveryAt
    });

    return {
      recovered: nextStamina - currentStamina,
      stamina: nextStamina
    };
  },

  _getStaminaRecoveryCountdownText: function (now) {
    var safeNow = requireValidDate(now, "Stamina recovery countdown date");
    if (!this.playerResources || typeof this.playerResources !== "object") {
      throw new Error("Stamina recovery countdown requires player resources.");
    }

    var currentStamina = requireNonNegativeInteger(this.playerResources.stamina, "Player stamina");
    if (currentStamina >= STAMINA_NATURAL_RECOVERY_MAX) {
      return STAMINA_FULL_TEXT;
    }

    this._refreshStaminaRecoveryState();
    var lastRecoveryAt = requireNonNegativeInteger(this.staminaRecoveryState.lastRecoveryAt, "Stamina recovery lastRecoveryAt");
    var nowMs = safeNow.getTime();
    if (nowMs < lastRecoveryAt) {
      throw new Error("System time is earlier than stamina recovery baseline.");
    }

    var elapsedMs = nowMs - lastRecoveryAt;
    var passedInCurrentInterval = elapsedMs % STAMINA_NATURAL_RECOVERY_INTERVAL_MS;
    return formatCountdownText(STAMINA_NATURAL_RECOVERY_INTERVAL_MS - passedInCurrentInterval);
  },

  _getCurrentStamina: function () {
    this._refreshPlayerResources();
    return requireNonNegativeInteger(this.playerResources.stamina, "Player stamina");
  },

  _getCurrentCoins: function () {
    this._refreshPlayerResources();
    return requireNonNegativeInteger(this.playerResources.coins, "Player coins");
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

  _consumeStaminaForLevelEntry: function () {
    if (!this.playerResourceStore) {
      throw new Error("GameBootstrap requires PlayerResourceStore.");
    }

    this._refreshPlayerResources();
    var consumeResult = this.playerResourceStore.consumeStamina(this.playerResources, 1);
    if (!consumeResult || typeof consumeResult.accepted !== "boolean" || !consumeResult.resources) {
      throw new Error("Stamina consume result is invalid.");
    }
    if (!consumeResult.accepted) {
      this.playerResources = consumeResult.resources;
      this._updateLevelSelectTopStatus();
      return false;
    }

    this.playerResources = consumeResult.resources;
    this.playerResourceStore.save(this.playerResources);
    this._markStaminaRecoveryBaseline(new Date());
    if (typeof this._recordDailyTaskEvent === "function") {
      this._recordDailyTaskEvent("spend_stamina", {
        amount: 1,
        reason: "level_entry"
      });
    }
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
    var timeNode = loveInfoNode ? loveInfoNode.getChildByName("time") : null;
    var goldNode = goldInfoNode ? goldInfoNode.getChildByName("gold") : null;
    var loveLabel = loveNode ? loveNode.getComponent(cc.Label) : null;
    var timeLabel = timeNode ? timeNode.getComponent(cc.Label) : null;
    var goldLabel = goldNode ? goldNode.getComponent(cc.Label) : null;

    if (!timeLabel) {
      throw new Error("LevelView love_info requires time label.");
    }
    this._refreshPlayerResources();
    if (loveLabel) {
      loveLabel.string = String(this.playerResources.stamina);
    }
    timeLabel.string = this._getStaminaRecoveryCountdownText(new Date());
    if (goldLabel) {
      goldLabel.string = String(this.playerResources.coins);
    }

    this._updateSignInEntryState();
    if (typeof this._updateDailyTaskEntryState === "function") {
      this._updateDailyTaskEntryState();
    }
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    if (typeof this._updateStarChestEntryState === "function") {
      this._updateStarChestEntryState();
    }
    if (typeof this._updateGameCircleEntryState === "function") {
      this._updateGameCircleEntryState();
    }
    if (typeof this._updateNewGiftEntryState === "function") {
      this._updateNewGiftEntryState();
    }
  },

  _ensureStaminaRecoveryTicker: function () {
    if (this._staminaRecoveryTicker !== null) {
      return;
    }

    this._staminaRecoveryTicker = setInterval(function () {
      if (!this.isSelectingLevel || !this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
        return;
      }
      this._updateLevelSelectTopStatus();
    }.bind(this), 1000);
  },

  _clearStaminaRecoveryTicker: function () {
    if (this._staminaRecoveryTicker === null) {
      return;
    }
    clearInterval(this._staminaRecoveryTicker);
    this._staminaRecoveryTicker = null;
  },

  _refreshNewGiftState: function () {
    if (!this.newGiftStore || typeof this.newGiftStore.load !== "function") {
      throw new Error("GameBootstrap requires NewGiftStore.load.");
    }

    this.newGiftState = this.newGiftStore.load();
    return this.newGiftState;
  },

  _isNewGiftClaimed: function () {
    this._refreshNewGiftState();
    if (!this.newGiftStore || typeof this.newGiftStore.isClaimed !== "function") {
      throw new Error("GameBootstrap requires NewGiftStore.isClaimed.");
    }
    return this.newGiftStore.isClaimed(this.newGiftState);
  },

  _updateNewGiftEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      throw new Error("LevelView is required for newgift_btn.");
    }

    var topLayerNode = this._getLevelSelectTopLayerNode();
    if (!topLayerNode || !topLayerNode.isValid) {
      throw new Error("LevelView top_layer is required for newgift_btn.");
    }

    var entryNode = topLayerNode.getChildByName("newgift_btn");
    if (!entryNode || !entryNode.isValid) {
      throw new Error("LevelView top_layer requires newgift_btn.");
    }

    this._bindNodeTapOnce(entryNode, function () {
      this._playSfx("uiClick");
      this._claimNewGift();
    }.bind(this));

    if (this._isNewGiftClaimed()) {
      this._stopNewGiftEntryAnimation(entryNode);
      entryNode.active = false;
      return;
    }

    entryNode.active = true;
    this._playNewGiftEntryAnimation(entryNode);
  },

  _playNewGiftEntryAnimation: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      throw new Error("New gift animation requires valid entry node.");
    }
    if (typeof cc.tween !== "function") {
      throw new Error("New gift animation requires cc.tween.");
    }
    if (entryNode.__newGiftShakePlaying === true) {
      return;
    }

    entryNode.__newGiftShakePlaying = true;
    entryNode.stopAllActions();
    entryNode.angle = 0;
    cc.tween(entryNode)
      .repeatForever(
        cc.tween()
          .delay(NEW_GIFT_SHAKE_IDLE_DURATION)
          .to(0.06, { angle: -NEW_GIFT_SHAKE_ANGLE })
          .to(0.08, { angle: NEW_GIFT_SHAKE_ANGLE })
          .to(0.06, { angle: -NEW_GIFT_SHAKE_ANGLE * 0.65 })
          .to(0.06, { angle: NEW_GIFT_SHAKE_ANGLE * 0.65 })
          .to(0.05, { angle: 0 })
      )
      .start();
  },

  _stopNewGiftEntryAnimation: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      throw new Error("New gift animation stop requires valid entry node.");
    }

    entryNode.stopAllActions();
    entryNode.angle = 0;
    entryNode.__newGiftShakePlaying = false;
  },

  _grantNewGiftRewards: function (rewardItems) {
    if (!Array.isArray(rewardItems) || rewardItems.length !== NEW_GIFT_INVENTORY_ITEMS.length + 1) {
      throw new Error("New gift rewards must include all inventory items and stamina.");
    }

    for (var i = 0; i < NEW_GIFT_INVENTORY_ITEMS.length; i += 1) {
      var expectedItemId = NEW_GIFT_INVENTORY_ITEMS[i];
      var rewardItem = rewardItems[i];
      if (!rewardItem || rewardItem.id !== expectedItemId || rewardItem.count !== 1) {
        throw new Error("New gift inventory reward config is invalid: " + expectedItemId);
      }

      var addResult = this._addInventoryItem(expectedItemId, 1);
      if (!addResult || !addResult.accepted) {
        throw new Error("New gift inventory reward failed: " + expectedItemId);
      }
    }

    var staminaReward = rewardItems[NEW_GIFT_INVENTORY_ITEMS.length];
    if (!staminaReward || staminaReward.id !== "stamina" || staminaReward.count !== NEW_GIFT_STAMINA_COUNT) {
      throw new Error("New gift stamina reward config is invalid.");
    }

    if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
      throw new Error("New gift requires PlayerResourceStore.save.");
    }
    this._refreshPlayerResources();
    var currentStamina = Math.floor(Number(this.playerResources.stamina));
    if (!Number.isInteger(currentStamina) || currentStamina < 0) {
      throw new Error("Player stamina value is invalid.");
    }
    this.playerResources.stamina = currentStamina + staminaReward.count;
    this.playerResourceStore.save(this.playerResources);
  },

  _claimNewGift: function () {
    if (!this.newGiftStore || typeof this.newGiftStore.markClaimed !== "function") {
      throw new Error("GameBootstrap requires NewGiftStore.markClaimed.");
    }

    this._refreshNewGiftState();
    if (this.newGiftStore.isClaimed(this.newGiftState)) {
      this._updateNewGiftEntryState();
      this._setStatus("新手大礼包已领取");
      return;
    }

    var claimResult = this.newGiftStore.markClaimed(this.newGiftState, new Date());
    if (!claimResult || !claimResult.accepted) {
      throw new Error("New gift claim must be accepted before granting rewards.");
    }

    var rewardItems = createNewGiftRewardItems();
    this._grantNewGiftRewards(rewardItems);
    this.newGiftState = claimResult.state;
    this.newGiftStore.save(this.newGiftState);
    this._updateLevelSelectTopStatus();
    if (typeof this._updateInventoryEntryState === "function") {
      this._updateInventoryEntryState();
    }
    this._updateNewGiftEntryState();
    this._setStatus("新手大礼包领取成功：所有道具 +1，体力 +5");
    if (typeof this._showAwardViewForRewardItems !== "function") {
      throw new Error("New gift requires award popup renderer.");
    }
    return this._showAwardViewForRewardItems(rewardItems);
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
