"use strict";

var STORAGE_KEY = "bubble_player_inventory_v1";
var SUPPORTED_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafeCount(value, fallback) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, parsed);
}

function isSupportedItem(itemId) {
  return SUPPORTED_ITEM_IDS.indexOf(itemId) >= 0;
}

function createDefaultItems() {
  return {
    swap_ball: 0,
    rainbow_ball: 0,
    blast_ball: 0,
    barrier_hammer: 0
  };
}

function normalizeItems(rawItems) {
  var normalized = createDefaultItems();
  var source = rawItems && typeof rawItems === "object" ? rawItems : {};
  SUPPORTED_ITEM_IDS.forEach(function (itemId) {
    normalized[itemId] = toSafeCount(source[itemId], 0);
  });
  return normalized;
}

function normalizeInventory(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      items: createDefaultItems()
    };
  }

  return {
    version: 1,
    items: normalizeItems(raw.items)
  };
}

function InventoryStore() {}

InventoryStore.prototype.load = function () {
  var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
  var normalized = null;

  try {
    if (!storage) {
      normalized = normalizeInventory(null);
    } else {
      var rawText = storage.getItem(STORAGE_KEY);
      var parsed = rawText ? JSON.parse(rawText) : null;
      normalized = normalizeInventory(parsed);
    }
  } catch (error) {
    normalized = normalizeInventory(null);
  }

  this.save(normalized);
  return clone(normalized);
};

InventoryStore.prototype.save = function (inventory) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeInventory(inventory);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save failures.
  }
};

InventoryStore.prototype.getItemCount = function (inventory, itemId) {
  if (!isSupportedItem(itemId)) {
    return 0;
  }

  var normalized = normalizeInventory(inventory);
  return Math.max(0, Math.floor(Number(normalized.items[itemId]) || 0));
};

InventoryStore.prototype.addItem = function (inventory, itemId, count) {
  if (!isSupportedItem(itemId)) {
    return {
      accepted: false,
      reason: "invalid_item_id",
      inventory: clone(normalizeInventory(inventory))
    };
  }

  var normalized = normalizeInventory(inventory);
  var gained = Math.max(1, toSafeCount(count, 1));
  normalized.items[itemId] = this.getItemCount(normalized, itemId) + gained;
  return {
    accepted: true,
    itemId: itemId,
    gained: gained,
    total: normalized.items[itemId],
    inventory: clone(normalized)
  };
};

InventoryStore.prototype.removeItem = function (inventory, itemId, count) {
  if (!isSupportedItem(itemId)) {
    return {
      accepted: false,
      reason: "invalid_item_id",
      inventory: clone(normalizeInventory(inventory))
    };
  }

  var normalized = normalizeInventory(inventory);
  var consume = Math.max(1, toSafeCount(count, 1));
  var current = this.getItemCount(normalized, itemId);
  if (current < consume) {
    return {
      accepted: false,
      reason: "insufficient_count",
      inventory: clone(normalized)
    };
  }

  normalized.items[itemId] = current - consume;
  return {
    accepted: true,
    itemId: itemId,
    consumed: consume,
    total: normalized.items[itemId],
    inventory: clone(normalized)
  };
};

InventoryStore.prototype.hasItem = function (inventory, itemId, count) {
  if (!isSupportedItem(itemId)) {
    return false;
  }

  var needed = Math.max(1, toSafeCount(count, 1));
  return this.getItemCount(inventory, itemId) >= needed;
};

module.exports = InventoryStore;
