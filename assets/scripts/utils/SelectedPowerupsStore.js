"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_selected_powerups_v1";
var NAMESPACE = "SelectedPowerupsStore";
var MAX_SELECTED_POWERUPS = 4;
var SUPPORTED_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function isSupportedItem(itemId) {
  return SUPPORTED_ITEM_IDS.indexOf(itemId) >= 0;
}

function requireSupportedItem(itemId) {
  if (!isSupportedItem(itemId)) {
    throw new Error("Unsupported selected powerup itemId: " + itemId);
  }
  return itemId;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function createInitialState() {
  return {
    version: 2,
    selectedItems: [],
    selectedItemCounts: {}
  };
}

function normalizeSelectedItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    throw new Error("selectedItems must be an array.");
  }
  if (rawItems.length > MAX_SELECTED_POWERUPS) {
    throw new Error("selectedItems exceeds max selected powerups.");
  }

  var seen = {};
  return rawItems.map(function (itemId) {
    requireSupportedItem(itemId);
    if (seen[itemId]) {
      throw new Error("selectedItems contains duplicated itemId: " + itemId);
    }
    seen[itemId] = true;
    return itemId;
  });
}

function normalizeSelectedItemCounts(rawCounts, selectedItems) {
  assertObject(rawCounts, "selectedItemCounts must be an object.");
  var selectedMap = {};
  selectedItems.forEach(function (itemId) {
    selectedMap[itemId] = true;
  });

  Object.keys(rawCounts).forEach(function (itemId) {
    requireSupportedItem(itemId);
    if (!selectedMap[itemId]) {
      throw new Error("selectedItemCounts contains item that is not selected: " + itemId);
    }
  });

  var counts = {};
  selectedItems.forEach(function (itemId) {
    if (!Object.prototype.hasOwnProperty.call(rawCounts, itemId)) {
      throw new Error("selectedItemCounts missing count for selected item: " + itemId);
    }
    counts[itemId] = requirePositiveInteger(rawCounts[itemId], "selectedItemCounts." + itemId);
  });

  return counts;
}

function normalizeState(raw) {
  assertObject(raw, "Selected powerups state must be an object.");
  if (raw.version !== 2) {
    throw new Error("Selected powerups version must be 2.");
  }

  var selectedItems = normalizeSelectedItems(raw.selectedItems);
  return {
    version: 2,
    selectedItems: selectedItems,
    selectedItemCounts: normalizeSelectedItemCounts(raw.selectedItemCounts, selectedItems)
  };
}

function SelectedPowerupsStore() {}

SelectedPowerupsStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  return clone(normalizeState(state));
};

SelectedPowerupsStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

SelectedPowerupsStore.prototype.setSelectedItems = function (selectedItemsOrState, selectedItemCounts) {
  var source = null;
  if (Array.isArray(selectedItemsOrState)) {
    source = {
      version: 2,
      selectedItems: selectedItemsOrState,
      selectedItemCounts: selectedItemCounts
    };
  } else {
    source = selectedItemsOrState;
  }

  var normalized = normalizeState(source);
  this.save(normalized);
  return clone(normalized);
};

SelectedPowerupsStore.prototype.toggleItem = function (state, itemId) {
  var normalized = normalizeState(state);
  requireSupportedItem(itemId);

  var selectedItems = normalized.selectedItems.slice();
  var selectedItemCounts = clone(normalized.selectedItemCounts);
  var index = selectedItems.indexOf(itemId);
  if (index >= 0) {
    selectedItems.splice(index, 1);
    delete selectedItemCounts[itemId];
    normalized.selectedItems = selectedItems;
    normalized.selectedItemCounts = selectedItemCounts;
    return {
      accepted: true,
      selected: false,
      state: clone(normalized)
    };
  }

  if (selectedItems.length >= MAX_SELECTED_POWERUPS) {
    return {
      accepted: false,
      reason: "selection_limit",
      state: clone(normalized)
    };
  }

  selectedItems.push(itemId);
  selectedItemCounts[itemId] = 1;
  normalized.selectedItems = selectedItems;
  normalized.selectedItemCounts = selectedItemCounts;
  return {
    accepted: true,
    selected: true,
    state: clone(normalized)
  };
};

SelectedPowerupsStore.prototype.setItemCount = function (state, itemId, count) {
  var normalized = normalizeState(state);
  requireSupportedItem(itemId);

  if (normalized.selectedItems.indexOf(itemId) < 0) {
    return {
      accepted: false,
      reason: "item_not_selected",
      state: clone(normalized)
    };
  }

  normalized.selectedItemCounts[itemId] = requirePositiveInteger(count, "selected powerup count");
  return {
    accepted: true,
    itemId: itemId,
    count: normalized.selectedItemCounts[itemId],
    state: clone(normalized)
  };
};

SelectedPowerupsStore.MAX_SELECTED_POWERUPS = MAX_SELECTED_POWERUPS;
SelectedPowerupsStore.SUPPORTED_ITEM_IDS = SUPPORTED_ITEM_IDS.slice();

module.exports = SelectedPowerupsStore;
