"use strict";

var STORAGE_KEY = "bubble_selected_powerups_v1";
var MAX_SELECTED_POWERUPS = 2;
var SUPPORTED_ITEM_IDS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function isSupportedItem(itemId) {
  return SUPPORTED_ITEM_IDS.indexOf(itemId) >= 0;
}

function normalizeSelectedItems(rawItems) {
  var source = Array.isArray(rawItems) ? rawItems : [];
  var selected = [];

  source.forEach(function (itemId) {
    if (!isSupportedItem(itemId) || selected.indexOf(itemId) >= 0) {
      return;
    }
    if (selected.length >= MAX_SELECTED_POWERUPS) {
      return;
    }
    selected.push(itemId);
  });

  return selected;
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      selectedItems: []
    };
  }

  return {
    version: 1,
    selectedItems: normalizeSelectedItems(raw.selectedItems)
  };
}

function SelectedPowerupsStore() {}

SelectedPowerupsStore.prototype.load = function () {
  var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
  var normalized = null;

  try {
    if (!storage) {
      normalized = normalizeState(null);
    } else {
      var rawText = storage.getItem(STORAGE_KEY);
      var parsed = rawText ? JSON.parse(rawText) : null;
      normalized = normalizeState(parsed);
    }
  } catch (error) {
    normalized = normalizeState(null);
  }

  this.save(normalized);
  return clone(normalized);
};

SelectedPowerupsStore.prototype.save = function (state) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeState(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save failures.
  }
};

SelectedPowerupsStore.prototype.setSelectedItems = function (selectedItems) {
  var normalized = normalizeState({
    selectedItems: selectedItems
  });
  this.save(normalized);
  return clone(normalized);
};

SelectedPowerupsStore.prototype.toggleItem = function (state, itemId) {
  var normalized = normalizeState(state);
  if (!isSupportedItem(itemId)) {
    return {
      accepted: false,
      reason: "invalid_item_id",
      state: clone(normalized)
    };
  }

  var selectedItems = normalized.selectedItems.slice();
  var index = selectedItems.indexOf(itemId);
  if (index >= 0) {
    selectedItems.splice(index, 1);
    normalized.selectedItems = selectedItems;
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
  normalized.selectedItems = selectedItems;
  return {
    accepted: true,
    selected: true,
    state: clone(normalized)
  };
};

SelectedPowerupsStore.MAX_SELECTED_POWERUPS = MAX_SELECTED_POWERUPS;
SelectedPowerupsStore.SUPPORTED_ITEM_IDS = SUPPORTED_ITEM_IDS.slice();

module.exports = SelectedPowerupsStore;
