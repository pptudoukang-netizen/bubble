"use strict";

var SUPPORTED_INVENTORY_ITEMS = ["precise_aim", "swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireFunction(value, fieldName) {
  if (typeof value !== "function") {
    throw new Error(fieldName + " must be a function.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
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

function normalizeRewardItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Star chest rewardItems must be a non-empty array.");
  }

  return items.map(function (item, index) {
    assertObject(item, "Star chest reward item must be an object at index " + index + ".");
    return {
      id: requireNonEmptyString(item.id, "Star chest reward item id at index " + index),
      count: requirePositiveInteger(item.count, "Star chest reward item count at index " + index)
    };
  });
}

function isInventoryItem(itemId) {
  return SUPPORTED_INVENTORY_ITEMS.indexOf(itemId) >= 0;
}

function StarChestRewardService(options) {
  assertObject(options, "StarChestRewardService options are required.");
  this.getResources = requireFunction(options.getResources, "StarChestRewardService.getResources");
  this.saveResources = requireFunction(options.saveResources, "StarChestRewardService.saveResources");
  this.addInventoryItem = requireFunction(options.addInventoryItem, "StarChestRewardService.addInventoryItem");
}

StarChestRewardService.prototype.validateRewardItems = function (items) {
  var rewardItems = normalizeRewardItems(items);
  for (var i = 0; i < rewardItems.length; i += 1) {
    var itemId = rewardItems[i].id;
    if (itemId !== "coin" && itemId !== "stamina" && !isInventoryItem(itemId)) {
      throw new Error("Unsupported star chest reward item id: " + itemId);
    }
  }

  return {
    accepted: true,
    rewardItems: rewardItems
  };
};

StarChestRewardService.prototype.grantRewardItems = function (items) {
  var validation = this.validateRewardItems(items);
  var rewardItems = validation.rewardItems;

  for (var i = 0; i < rewardItems.length; i += 1) {
    var item = rewardItems[i];
    if (item.id === "coin" || item.id === "stamina") {
      var resources = this.getResources();
      assertObject(resources, "Star chest reward resources must be an object.");
      var resourceKey = item.id === "coin" ? "coins" : "stamina";
      resources[resourceKey] = requireNonNegativeInteger(resources[resourceKey], "Player resource `" + resourceKey + "`") + item.count;
      if (this.saveResources(resources) !== true) {
        throw new Error("Star chest reward resource save must return true.");
      }
      continue;
    }

    var addResult = this.addInventoryItem(item.id, item.count);
    if (!addResult || addResult.accepted !== true) {
      throw new Error("Star chest reward inventory grant failed: " + item.id);
    }
  }

  return {
    accepted: true,
    rewardItems: clone(rewardItems)
  };
};

StarChestRewardService.SUPPORTED_INVENTORY_ITEMS = SUPPORTED_INVENTORY_ITEMS.slice();

module.exports = StarChestRewardService;
