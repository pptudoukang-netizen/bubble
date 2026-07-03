"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_player_inventory_v1";
var NAMESPACE = "InventoryStore";
var STORAGE_VERSION = 3;
var LEGACY_VERSION_1_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];
var VERSION_2_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];
var SUPPORTED_ITEM_IDS = ["precise_aim", "swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];

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
    precise_aim: 0,
    swap_ball: 0,
    rainbow_ball: 0,
    blast_ball: 0,
    barrier_hammer: 0,
    snow_removal: 0
  };
}

function createInitialInventory() {
  return {
    version: STORAGE_VERSION,
    items: createDefaultItems()
  };
}

function normalizeInventoryItems(rawItems, itemIds, description) {
  assertObject(rawItems, description + " items are required.");
  Object.keys(rawItems).forEach(function (itemId) {
    if (itemIds.indexOf(itemId) < 0) {
      throw new Error(description + " contains unsupported item count: " + itemId);
    }
  });

  var items = {};
  itemIds.forEach(function (itemId) {
    if (!Object.prototype.hasOwnProperty.call(rawItems, itemId)) {
      throw new Error(description + " missing item count: " + itemId);
    }
    items[itemId] = requireNonNegativeInteger(rawItems[itemId], description + " item count `" + itemId + "`");
  });
  return items;
}

function migrateVersion1Inventory(raw) {
  var legacyItems = normalizeInventoryItems(raw.items, LEGACY_VERSION_1_ITEM_IDS, "Inventory v1");
  legacyItems.precise_aim = 0;
  legacyItems.snow_removal = 0;
  return {
    version: STORAGE_VERSION,
    items: legacyItems
  };
}

function migrateVersion2Inventory(raw) {
  var version2Items = normalizeInventoryItems(raw.items, VERSION_2_ITEM_IDS, "Inventory v2");
  version2Items.precise_aim = 0;
  return {
    version: STORAGE_VERSION,
    items: version2Items
  };
}

function normalizeInventory(raw) {
  assertObject(raw, "Inventory must be an object.");
  if (raw.version === 1) {
    return migrateVersion1Inventory(raw);
  }
  if (raw.version === 2) {
    return migrateVersion2Inventory(raw);
  }
  if (raw.version !== STORAGE_VERSION) {
    throw new Error("Inventory version must be " + STORAGE_VERSION + ".");
  }
  var items = normalizeInventoryItems(raw.items, SUPPORTED_ITEM_IDS, "Inventory");

  return {
    version: STORAGE_VERSION,
    items: items
  };
}

function InventoryStore() {}

InventoryStore.prototype.load = function () {
  var inventory = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialInventory);
  var normalized = normalizeInventory(inventory);
  if (inventory.version !== normalized.version) {
    StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  }
  return clone(normalized);
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
