"use strict";

var SUPPORTED_INVENTORY_ITEMS = ["swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer"];

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

function normalizeRewardItems(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return {
      id: item && typeof item.id === "string" ? item.id : "",
      count: Math.max(1, toSafeCount(item && item.count, 1))
    };
  }).filter(function (item) {
    return !!item.id;
  });
}

function isInventoryItem(itemId) {
  return SUPPORTED_INVENTORY_ITEMS.indexOf(itemId) >= 0;
}

function StarChestRewardService(options) {
  options = options || {};
  this.getResources = typeof options.getResources === "function" ? options.getResources : function () { return null; };
  this.saveResources = typeof options.saveResources === "function" ? options.saveResources : function () { return false; };
  this.addInventoryItem = typeof options.addInventoryItem === "function" ? options.addInventoryItem : function () {
    return { accepted: false, reason: "inventory_store_unavailable" };
  };
}

StarChestRewardService.prototype.validateRewardItems = function (items) {
  var rewardItems = normalizeRewardItems(items);
  if (!rewardItems.length) {
    return {
      accepted: false,
      reason: "STAR_CHEST_REWARD_INVALID"
    };
  }

  for (var i = 0; i < rewardItems.length; i += 1) {
    var itemId = rewardItems[i].id;
    if (itemId !== "coin" && itemId !== "stamina" && !isInventoryItem(itemId)) {
      return {
        accepted: false,
        reason: "STAR_CHEST_REWARD_INVALID"
      };
    }
  }

  return {
    accepted: true,
    rewardItems: rewardItems
  };
};

StarChestRewardService.prototype.grantRewardItems = function (items) {
  var validation = this.validateRewardItems(items);
  if (!validation.accepted) {
    return validation;
  }

  var rewardItems = validation.rewardItems;
  for (var i = 0; i < rewardItems.length; i += 1) {
    var item = rewardItems[i];
    if (item.id === "coin" || item.id === "stamina") {
      var resources = this.getResources();
      if (!resources) {
        return {
          accepted: false,
          reason: "STAR_CHEST_REWARD_GRANT_FAILED"
        };
      }
      resources[item.id === "coin" ? "coins" : "stamina"] = Math.max(
        0,
        Math.floor(Number(resources[item.id === "coin" ? "coins" : "stamina"]) || 0)
      ) + item.count;
      if (!this.saveResources(resources)) {
        return {
          accepted: false,
          reason: "STAR_CHEST_REWARD_GRANT_FAILED"
        };
      }
      continue;
    }

    var addResult = this.addInventoryItem(item.id, item.count);
    if (!addResult || !addResult.accepted) {
      return {
        accepted: false,
        reason: "STAR_CHEST_REWARD_GRANT_FAILED"
      };
    }
  }

  return {
    accepted: true,
    rewardItems: clone(rewardItems)
  };
};

StarChestRewardService.SUPPORTED_INVENTORY_ITEMS = SUPPORTED_INVENTORY_ITEMS.slice();

module.exports = StarChestRewardService;
