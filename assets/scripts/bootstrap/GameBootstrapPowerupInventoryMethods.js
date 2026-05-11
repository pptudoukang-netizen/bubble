"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;
var InventoryStore = Shared.InventoryStore;
var SelectedPowerupsStore = Shared.SelectedPowerupsStore;
var BackpackViewController = Shared.BackpackViewController;
var INVENTORY_VIEW_PREFAB_PATH = Shared.INVENTORY_VIEW_PREFAB_PATH;
var POWERUP_TYPE_BY_ITEM_ID = Shared.POWERUP_TYPE_BY_ITEM_ID;
var ITEM_ID_BY_POWERUP_TYPE = Shared.ITEM_ID_BY_POWERUP_TYPE;
var MAX_SELECTED_POWERUPS = Shared.MAX_SELECTED_POWERUPS;
var MAX_SELECTED_POWERUP_TOTAL_COUNT = Shared.MAX_SELECTED_POWERUP_TOTAL_COUNT;
var INVENTORY_TOTAL_LIMIT_TIP = Shared.INVENTORY_TOTAL_LIMIT_TIP;

module.exports = {
  _onUseSkillBallTap: function (entityType) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: entityType
    });
    this._playSfx("uiClick");
    var useResult = this.gameManager.useSkillBall(entityType);
    var snapshot = useResult && useResult.snapshot
      ? useResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (useResult && useResult.accepted) {
      this._consumePersistentInventoryItemForPowerup(entityType);
      var skillName = entityType === "rainbow" ? "彩虹球" : "炸弹球";
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      var remaining = Math.max(0, Math.floor(Number(inventory[entityType]) || 0));
      this._setStatusWithTip(
        entityType === "rainbow" ? "skill_equip_rainbow_success" : "skill_equip_blast_success",
        {
          remaining: remaining
        },
        skillName + "已装填，剩余：" + remaining
      );
      return;
    }

    var reason = useResult && typeof useResult.reason === "string" ? useResult.reason : "equip_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_inventory_empty", null, "该道具库存不足");
      this._tryRecoverInventoryByAd(entityType);
      return;
    }
    if (reason === "current_slot_occupied_by_skill") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_current_slot_occupied", null, "当前炮台已装填道具球，请先发射");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_busy", null, "当前状态不可切换道具");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: entityType,
      reason: reason
    });
    this._setStatusWithTip("skill_equip_failed", null, "道具装填失败");
  },

  _onUseSwapBallTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "swap"
    });
    this._playSfx("uiClick");
    var swapResult = this.gameManager.useSwapBall();
    var snapshot = swapResult && swapResult.snapshot
      ? swapResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (swapResult && swapResult.accepted) {
      this._consumePersistentInventoryItemForPowerup("swap");
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      var remaining = Math.max(0, Math.floor(Number(inventory.swap) || 0));
      this._setStatusWithTip("swap_success", {
        remaining: remaining
      }, "换球成功，剩余：" + remaining);
      return;
    }

    var reason = swapResult && typeof swapResult.reason === "string" ? swapResult.reason : "swap_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_inventory_empty", null, "换球道具库存不足");
      this._tryRecoverInventoryByAd("swap");
      return;
    }
    if (reason === "queue_missing") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_queue_missing", null, "当前无法换球");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_busy", null, "当前状态不可使用换球");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "swap",
      reason: reason
    });
    this._setStatusWithTip("swap_failed", null, "换球失败");
  },

  _onUseBarrierHammerTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "barrier_hammer"
    });
    this._playSfx("uiClick");
    var isTargeting = this._isBarrierHammerTargeting();
    var hammerResult = isTargeting
      ? this.gameManager.cancelBarrierHammer()
      : this.gameManager.beginBarrierHammer();
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (isTargeting) {
      this._setStatusWithTip("hammer_cancelled", null, "已取消破障锤");
      return;
    }

    if (hammerResult && hammerResult.accepted) {
      this._setStatusWithTip("hammer_ready", null, "破障锤已就绪，请点选石头或冰冻球");
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_obstacle") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_no_obstacle", null, "没有需要破除的障碍");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_enable_failed", null, "破障锤启用失败");
  },

  _handleBarrierHammerTargetTouch: function (localPoint) {
    var hammerResult = this.gameManager.useBarrierHammerAt(localPoint);
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (hammerResult && hammerResult.accepted) {
      var inventory = snapshot && snapshot.shooter && snapshot.shooter.skillInventory
        ? snapshot.shooter.skillInventory
        : {};
      this._consumePersistentInventoryItemForPowerup("barrier_hammer");
      var remaining = Math.max(0, Math.floor(Number(inventory.barrier_hammer) || 0));
      this._setStatusWithTip("hammer_applied", {
        remaining: remaining
      }, "破障锤生效，剩余：" + remaining);
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_target" || reason === "target_invalid") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_target_invalid", null, "请点选石头或冰冻球");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_use_failed", null, "破障锤使用失败");
  },

  _isBarrierHammerTargeting: function () {
    return !!(this.gameManager && this.gameManager.pendingBarrierHammer);
  },

  _setStatusWithTip: function (tipKey, params, fallbackMessage) {
    var message = typeof fallbackMessage === "string" ? fallbackMessage : "";
    if (this.tipsPresenter && typeof this.tipsPresenter.resolveMessage === "function") {
      message = this.tipsPresenter.resolveMessage(tipKey, params, fallbackMessage);
    }

    this._setStatus(message);
    if (this.tipsPresenter && typeof this.tipsPresenter.showByKey === "function") {
      this.tipsPresenter.showByKey(tipKey, params, fallbackMessage);
    }
  },

  _refreshPlayerInventory: function () {
    if (!this.inventoryStore) {
      throw new Error("GameBootstrap requires InventoryStore.");
    }

    this.playerInventory = this.inventoryStore.load();
    return this.playerInventory;
  },

  _addInventoryItem: function (itemId, count) {
    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.addItem !== "function") {
      throw new Error("GameBootstrap requires InventoryStore.addItem.");
    }

    var addResult = this.inventoryStore.addItem(this.playerInventory, itemId, count);
    if (!addResult || !addResult.accepted) {
      return {
        accepted: false,
        reason: addResult && addResult.reason ? addResult.reason : "inventory_add_failed"
      };
    }

    this.playerInventory = addResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    return addResult;
  },

  _refreshSelectedPowerups: function () {
    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.load !== "function") {
      throw new Error("GameBootstrap requires SelectedPowerupsStore.load.");
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    return this.selectedPowerupsState;
  },

  _saveSelectedPowerups: function (selectedItems, selectedItemCounts) {
    if (!Array.isArray(selectedItems)) {
      throw new Error("Selected powerup item list must be an array.");
    }
    if (!selectedItemCounts || typeof selectedItemCounts !== "object" || Array.isArray(selectedItemCounts)) {
      throw new Error("Selected powerup item counts must be an object.");
    }
    if (selectedItems.length > MAX_SELECTED_POWERUPS) {
      throw new Error("Selected powerup item list exceeds max selected powerups.");
    }

    var safeSelectedItems = selectedItems.slice();
    var sourceCounts = selectedItemCounts;
    var safeSelectedItemCounts = {};
    safeSelectedItems.forEach(function (itemId) {
      var count = sourceCounts[itemId];
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error("Selected powerup count must be a positive integer: " + itemId);
      }
      safeSelectedItemCounts[itemId] = count;
    });

    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.setSelectedItems !== "function") {
      throw new Error("GameBootstrap requires SelectedPowerupsStore.setSelectedItems.");
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.setSelectedItems({
      version: 2,
      selectedItems: safeSelectedItems,
      selectedItemCounts: safeSelectedItemCounts
    });
    return this.selectedPowerupsState;
  },

  _getSelectedPowerupTotalCount: function (selectedItems, selectedItemCounts) {
    var safeSelectedItems = Array.isArray(selectedItems) ? selectedItems : [];
    var safeSelectedItemCounts = selectedItemCounts && typeof selectedItemCounts === "object"
      ? selectedItemCounts
      : {};

    return safeSelectedItems.reduce(function (total, itemId) {
      return total + Math.max(1, Math.floor(Number(safeSelectedItemCounts[itemId]) || 1));
    }, 0);
  },

  _normalizeSelectedPowerupCountsByTotalLimit: function (selectedItems, selectedItemCounts) {
    var normalizedItems = Array.isArray(selectedItems) ? selectedItems.slice(0, MAX_SELECTED_POWERUPS) : [];
    if (normalizedItems.length > MAX_SELECTED_POWERUP_TOTAL_COUNT) {
      normalizedItems = normalizedItems.slice(0, MAX_SELECTED_POWERUP_TOTAL_COUNT);
    }

    var sourceCounts = selectedItemCounts && typeof selectedItemCounts === "object"
      ? selectedItemCounts
      : {};
    var normalizedCounts = {};
    normalizedItems.forEach(function (itemId) {
      normalizedCounts[itemId] = 1;
    });

    var assignedTotal = normalizedItems.length;
    normalizedItems.forEach(function (itemId) {
      if (assignedTotal >= MAX_SELECTED_POWERUP_TOTAL_COUNT) {
        return;
      }

      var safeCount = Math.max(1, Math.floor(Number(sourceCounts[itemId]) || 1));
      var extraRequested = Math.max(0, safeCount - 1);
      if (extraRequested <= 0) {
        return;
      }

      var remainingQuota = MAX_SELECTED_POWERUP_TOTAL_COUNT - assignedTotal;
      var extraAccepted = Math.min(extraRequested, remainingQuota);
      normalizedCounts[itemId] += extraAccepted;
      assignedTotal += extraAccepted;
    });

    return {
      selectedItems: normalizedItems,
      selectedItemCounts: normalizedCounts
    };
  },

  _getAvailableSelectedPowerupItems: function () {
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    var selectedItemCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var availableSelectedItems = selectedItems.filter(function (itemId, index, list) {
      return list.indexOf(itemId) === index &&
        POWERUP_TYPE_BY_ITEM_ID[itemId] &&
        this.inventoryStore &&
        this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this).slice(0, MAX_SELECTED_POWERUPS);
    var normalizedCounts = {};
    availableSelectedItems.forEach(function (itemId) {
      var inventoryCount = this.inventoryStore
        ? this.inventoryStore.getItemCount(this.playerInventory, itemId)
        : 0;
      var selectedCount = Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1));
      normalizedCounts[itemId] = Math.min(selectedCount, Math.max(1, inventoryCount));
    }, this);
    var normalizedSelection = this._normalizeSelectedPowerupCountsByTotalLimit(availableSelectedItems, normalizedCounts);
    availableSelectedItems = normalizedSelection.selectedItems;
    normalizedCounts = normalizedSelection.selectedItemCounts;

    var hasSelectionChanged = availableSelectedItems.length !== selectedItems.length;
    if (!hasSelectionChanged) {
      for (var i = 0; i < availableSelectedItems.length; i += 1) {
        if (availableSelectedItems[i] !== selectedItems[i]) {
          hasSelectionChanged = true;
          break;
        }
      }
    }

    var hasCountChanged = false;
    if (!hasSelectionChanged) {
      Object.keys(selectedItemCounts).forEach(function (itemId) {
        if (availableSelectedItems.indexOf(itemId) < 0) {
          hasCountChanged = true;
        }
      });
      availableSelectedItems.forEach(function (itemId) {
        var previousCount = Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1));
        if (normalizedCounts[itemId] !== previousCount) {
          hasCountChanged = true;
        }
      });
    }

    if (hasSelectionChanged || hasCountChanged) {
      this._saveSelectedPowerups(availableSelectedItems, normalizedCounts);
    } else if (this.selectedPowerupsState) {
      this.selectedPowerupsState.selectedItemCounts = normalizedCounts;
    }
    return availableSelectedItems;
  },

  _getSelectedPowerupLoadouts: function () {
    var selectedItems = this._getAvailableSelectedPowerupItems();
    var selectedItemCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};

    return selectedItems.map(function (itemId) {
      return {
        itemId: itemId,
        count: Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1))
      };
    });
  },

  _applySelectedPowerupsToRuntime: function (snapshot) {
    if (!this.gameManager || typeof this.gameManager.grantPowerupInventory !== "function") {
      return snapshot || null;
    }

    var selectedLoadouts = this._getSelectedPowerupLoadouts();
    var latestSnapshot = snapshot || this.gameManager.getRuntimeSnapshot();
    selectedLoadouts.forEach(function (loadout) {
      var powerupType = POWERUP_TYPE_BY_ITEM_ID[loadout.itemId];
      if (!powerupType) {
        return;
      }

      var grantResult = this.gameManager.grantPowerupInventory(powerupType, loadout.count);
      if (grantResult && grantResult.snapshot) {
        latestSnapshot = grantResult.snapshot;
      }
    }, this);

    return latestSnapshot;
  },

  _consumePersistentInventoryItemForPowerup: function (powerupType) {
    var itemId = ITEM_ID_BY_POWERUP_TYPE[powerupType];
    if (!itemId || !this.inventoryStore || typeof this.inventoryStore.removeItem !== "function") {
      return false;
    }

    this._refreshPlayerInventory();
    var removeResult = this.inventoryStore.removeItem(this.playerInventory, itemId, 1);
    if (!removeResult || !removeResult.accepted) {
      this._getAvailableSelectedPowerupItems();
      return false;
    }

    this.playerInventory = removeResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    this._getAvailableSelectedPowerupItems();
    this._renderInventoryView();
    this._updateInventoryEntryState();
    return true;
  },

  _ensureInventoryViewPrefab: function () {
    if (this._inventoryViewPrefab) {
      return Promise.resolve(this._inventoryViewPrefab);
    }

    return this._loadPrefab(INVENTORY_VIEW_PREFAB_PATH).then(function (prefab) {
      this._inventoryViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _setPendingLevelEntry: function (levelId) {
    var safeLevelId = Math.max(1, Math.floor(Number(levelId) || 0));
    if (safeLevelId <= 0) {
      this._pendingLevelEntry = null;
      return null;
    }

    this._pendingLevelEntry = {
      levelId: safeLevelId
    };
    return this._pendingLevelEntry;
  },

  _clearPendingLevelEntry: function () {
    this._pendingLevelEntry = null;
    this._inventoryViewReadOnly = true;
  },

  _isInventorySelectionOperable: function () {
    return !!(this._pendingLevelEntry && this._pendingLevelEntry.levelId);
  },

  _hasAvailableInventoryForLevelEntry: function () {
    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.getItemCount !== "function") {
      var rawItems = this.playerInventory && this.playerInventory.items ? this.playerInventory.items : {};
      return Object.keys(POWERUP_TYPE_BY_ITEM_ID).some(function (itemId) {
        return Math.max(0, Math.floor(Number(rawItems[itemId]) || 0)) > 0;
      });
    }

    return Object.keys(POWERUP_TYPE_BY_ITEM_ID).some(function (itemId) {
      return this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this);
  },

  _enterLevelFromLevelSelect: function (levelId) {
    var safeLevelId = Math.max(1, Math.floor(Number(levelId) || 0));
    if (safeLevelId <= 0) {
      return false;
    }

    var loadSelectedLevel = function () {
      this._setStatus("Loading level_" + ("000" + safeLevelId).slice(-3) + "...");
      this._loadLevelById(safeLevelId, "Level selected", "Load selected level failed. Check console logs.");
    }.bind(this);

    if (!this._consumeStaminaForLevelEntry(loadSelectedLevel)) {
      if (!this._staminaRecoveryInProgress) {
        this._setStatus("Stamina is not enough. It resets to 10 at 00:00.");
      }
      return false;
    }

    loadSelectedLevel();
    return true;
  },

  _startPendingLevelEntry: function () {
    if (!this._pendingLevelEntry || !this._pendingLevelEntry.levelId) {
      return false;
    }

    var levelId = this._pendingLevelEntry.levelId;
    this._clearPendingLevelEntry();
    return this._enterLevelFromLevelSelect(levelId);
  },

  _showInventoryView: function (options) {
    options = options || {};
    var pendingLevelId = Math.max(0, Math.floor(Number(options.entryLevelId) || 0));
    if (pendingLevelId > 0) {
      this._setPendingLevelEntry(pendingLevelId);
    } else {
      this._clearPendingLevelEntry();
    }
    this._inventoryViewReadOnly = !this._isInventorySelectionOperable();

    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    this._saveSelectedPowerups([], {});
    this._updateInventoryEntryState();
    this._ensureInventoryViewPrefab().then(function (prefab) {
      if (!prefab) {
        this._setStatus("背包界面加载失败");
        return;
      }

      var inventoryViewNode = this._inventoryViewNode;
      if (!inventoryViewNode || !inventoryViewNode.isValid) {
        inventoryViewNode = cc.instantiate(prefab);
        inventoryViewNode.parent = this.node;
        inventoryViewNode.setPosition(0, 0);
        inventoryViewNode.zIndex = 320;
        this._inventoryViewNode = inventoryViewNode;
        this._inventoryViewController = new BackpackViewController({
          node: inventoryViewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._clearPendingLevelEntry();
            this._inventoryViewReadOnly = true;
            this._hideInventoryView();
          }.bind(this),
          onConfirm: this._confirmInventorySelection.bind(this),
          onToggleItem: this._toggleInventorySelection.bind(this),
          onIncreaseItemCount: this._increaseInventorySelectionCount.bind(this),
          onDecreaseItemCount: this._decreaseInventorySelectionCount.bind(this)
        });
      }

      inventoryViewNode.active = true;
      this._renderInventoryView();
    }.bind(this)).catch(function (error) {
      Logger.warn("Show inventory view failed", error && error.message ? error.message : error);
      this._setStatus("背包界面加载失败");
    }.bind(this));
  },

  _hideInventoryView: function () {
    if (!this._inventoryViewNode || !this._inventoryViewNode.isValid) {
      return;
    }
    this._inventoryViewNode.active = false;
    if (!this._isInventorySelectionOperable()) {
      this._inventoryViewReadOnly = true;
    }
  },

  _confirmInventorySelection: function () {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    if (this._pendingLevelEntry && this._pendingLevelEntry.levelId) {
      this._hideInventoryView();
      this._startPendingLevelEntry();
      return;
    }

    this._hideInventoryView();
    this._setStatusWithTip("inventory_confirmed", null, "出战道具已保存");
    this._updateInventoryEntryState();
  },

  _toggleInventorySelection: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    if (!this.inventoryStore || this.inventoryStore.getItemCount(this.playerInventory, itemId) <= 0) {
      this._setStatusWithTip("inventory_item_empty", null, "该道具库存不足");
      return;
    }

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    var selectedCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var isSelected = selectedItems.indexOf(itemId) >= 0;
    if (!isSelected) {
      var selectedTotal = this._getSelectedPowerupTotalCount(selectedItems, selectedCounts);
      if (selectedTotal >= MAX_SELECTED_POWERUP_TOTAL_COUNT) {
        this._setStatusWithTip("inventory_count_limit", null, INVENTORY_TOTAL_LIMIT_TIP);
        return;
      }
    }

    var toggleResult = this.selectedPowerupsStore.toggleItem(this.selectedPowerupsState, itemId);
    if (!toggleResult || !toggleResult.accepted) {
      if (toggleResult && toggleResult.reason === "selection_limit") {
        this._setStatusWithTip("inventory_count_limit", null, INVENTORY_TOTAL_LIMIT_TIP);
      } else {
        this._setStatusWithTip("inventory_selection_failed", null, "道具选择失败");
      }
      return;
    }

    this.selectedPowerupsState = toggleResult.state;
    this.selectedPowerupsStore.save(this.selectedPowerupsState);
    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _increaseInventorySelectionCount: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    if (!this.inventoryStore || this.inventoryStore.getItemCount(this.playerInventory, itemId) <= 0) {
      this._setStatusWithTip("inventory_item_empty", null, "该道具库存不足");
      return;
    }

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    if (selectedItems.indexOf(itemId) < 0) {
      this._setStatusWithTip("inventory_selection_failed", null, "请先选择该道具");
      return;
    }

    var selectedCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var currentCount = Math.max(1, Math.floor(Number(selectedCounts[itemId]) || 1));
    var inventoryCount = this.inventoryStore.getItemCount(this.playerInventory, itemId);
    if (currentCount >= inventoryCount) {
      this._setStatusWithTip("inventory_count_max", null, "已达到库存上限");
      return;
    }
    var selectedTotal = this._getSelectedPowerupTotalCount(selectedItems, selectedCounts);
    if (selectedTotal >= MAX_SELECTED_POWERUP_TOTAL_COUNT) {
      this._setStatusWithTip("inventory_count_limit", null, INVENTORY_TOTAL_LIMIT_TIP);
      return;
    }

    var nextCounts = {};
    selectedItems.forEach(function (selectedItemId) {
      nextCounts[selectedItemId] = Math.max(1, Math.floor(Number(selectedCounts[selectedItemId]) || 1));
    });
    nextCounts[itemId] = Math.min(inventoryCount, currentCount + 1);
    this._saveSelectedPowerups(selectedItems, nextCounts);
    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _decreaseInventorySelectionCount: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    if (selectedItems.indexOf(itemId) < 0) {
      return;
    }

    var selectedCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var currentCount = Math.max(1, Math.floor(Number(selectedCounts[itemId]) || 1));
    var nextCounts = {};
    selectedItems.forEach(function (selectedItemId) {
      nextCounts[selectedItemId] = Math.max(1, Math.floor(Number(selectedCounts[selectedItemId]) || 1));
    });

    if (currentCount <= 1) {
      var remainingItems = selectedItems.filter(function (selectedItemId) {
        return selectedItemId !== itemId;
      });
      delete nextCounts[itemId];
      this._saveSelectedPowerups(remainingItems, nextCounts);
      this._setStatusWithTip("inventory_item_removed", null, "已取消选择该道具");
    } else {
      nextCounts[itemId] = currentCount - 1;
      this._saveSelectedPowerups(selectedItems, nextCounts);
    }

    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _renderInventoryView: function () {
    if (!this._inventoryViewController || !this._inventoryViewNode || !this._inventoryViewNode.isValid) {
      return;
    }

    this._refreshPlayerInventory();
    var selectedItems = this._getAvailableSelectedPowerupItems();
    var selectedItemCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    this._inventoryViewController.render({
      inventory: this.playerInventory,
      selectedItems: selectedItems,
      selectedItemCounts: selectedItemCounts,
      coinCount: this._getCurrentCoins(),
      interactionEnabled: !this._inventoryViewReadOnly,
      useButtonEnabled: !this._inventoryViewReadOnly
    });
  },

  _updateInventoryEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    var entryNode = bottomLayerNode ? bottomLayerNode.getChildByName("backpack_btn") : null;
    if (!entryNode || !entryNode.isValid) {
      return;
    }

    var selectedItems = this._getAvailableSelectedPowerupItems();
    entryNode.opacity = selectedItems.length > 0 ? 255 : 230;
  }
};
