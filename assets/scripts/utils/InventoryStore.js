"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_player_inventory_v1";
var NAMESPACE = "InventoryStore";
var SUPPORTED_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function isSupportedItem(itemId) {
  return SUPPORTED_ITEM_IDS.indexOf(itemId) >= 0;
}

function requireSupportedItem(itemId) {
  if (!isSupportedItem(itemId)) {
    throw new Error("Unsupported inventory itemId: " + itemId);
  }
  return itemId;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function createDefaultItems() {
  return {
    swap_ball: 0,
    rainbow_ball: 0,
    blast_ball: 0,
    barrier_hammer: 0
  };
}

function createInitialInventory() {
  return {
    version: 1,
    items: createDefaultItems()
  };
}

function normalizeInventory(raw) {
  assertObject(raw, "Inventory must be an object.");
  if (raw.version !== 1) {
    throw new Error("Inventory version must be 1.");
  }
  assertObject(raw.items, "Inventory items are required.");

  Object.keys(raw.items).forEach(function (itemId) {
    requireSupportedItem(itemId);
  });

  var items = {};
  SUPPORTED_ITEM_IDS.forEach(function (itemId) {
    if (!Object.prototype.hasOwnProperty.call(raw.items, itemId)) {
      throw new Error("Inventory missing item count: " + itemId);
    }
    items[itemId] = requireNonNegativeInteger(raw.items[itemId], "Inventory item count `" + itemId + "`");
  });

  return {
    version: 1,
    items: items
  };
}

function InventoryStore() {}

InventoryStore.prototype.load = function () {
  var inventory = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialInventory);
  return clone(normalizeInventory(inventory));
};

InventoryStore.prototype.save = function (inventory) {
  var normalized = normalizeInventory(inventory);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

InventoryStore.prototype.getItemCount = function (inventory, itemId) {
  requireSupportedItem(itemId);
  var normalized = normalizeInventory(inventory);
  return normalized.items[itemId];
};

InventoryStore.prototype.addItem = function (inventory, itemId, count) {
  requireSupportedItem(itemId);
  var normalized = normalizeInventory(inventory);
  var gained = requirePositiveInteger(count, "Inventory add count");
  normalized.items[itemId] = normalized.items[itemId] + gained;
  return {
    accepted: true,
    itemId: itemId,
    gained: gained,
    total: normalized.items[itemId],
    inventory: clone(normalized)
  };
};

InventoryStore.prototype.removeItem = function (inventory, itemId, count) {
  requireSupportedItem(itemId);
  var normalized = normalizeInventory(inventory);
  var consume = requirePositiveInteger(count, "Inventory remove count");
  var current = normalized.items[itemId];
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
  requireSupportedItem(itemId);
  var needed = requirePositiveInteger(count, "Inventory required count");
  return this.getItemCount(inventory, itemId) >= needed;
};

module.exports = InventoryStore;
