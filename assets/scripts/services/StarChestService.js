"use strict";

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

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be boolean.");
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

function requireStoredStarCount(value, fieldName) {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error(fieldName + " must be an integer in [1, 3].");
  }
  return value;
}

function normalizeRewardItem(item, index, rewardId) {
  assertObject(item, "Star chest reward item must be an object: " + rewardId + "#" + index);
  return {
    id: requireNonEmptyString(item.id, "Star chest reward item id: " + rewardId + "#" + index),
    count: requirePositiveInteger(item.count, "Star chest reward item count: " + rewardId + "#" + index)
  };
}

function normalizeReward(rawReward, index) {
  assertObject(rawReward, "Star chest reward must be an object at index " + index + ".");
  var rewardId = requireNonEmptyString(rawReward.rewardId, "Star chest rewardId at index " + index);
  if (!Array.isArray(rawReward.rewardItems) || rawReward.rewardItems.length === 0) {
    throw new Error("Star chest rewardItems must be a non-empty array: " + rewardId);
  }

  return {
    rewardId: rewardId,
    weight: requirePositiveInteger(rawReward.weight, "Star chest reward weight: " + rewardId),
    rewardItems: rawReward.rewardItems.map(function (item, itemIndex) {
      return normalizeRewardItem(item, itemIndex, rewardId);
    })
  };
}

function normalizeConfig(config) {
  assertObject(config, "StarChestService config is required.");
  if (!Array.isArray(config.rewards) || config.rewards.length === 0) {
    throw new Error("StarChestService config rewards must be a non-empty array.");
  }

  return {
    enabled: requireBoolean(config.enabled, "StarChestService config enabled"),
    activityId: requireNonEmptyString(config.activityId, "StarChestService config activityId"),
    starsPerChest: requirePositiveInteger(config.starsPerChest, "StarChestService config starsPerChest"),
    showRedDotWhenOpenable: requireBoolean(config.showRedDotWhenOpenable, "StarChestService config showRedDotWhenOpenable"),
    maxClaimLogs: requirePositiveInteger(config.maxClaimLogs, "StarChestService config maxClaimLogs"),
    rewards: config.rewards.map(normalizeReward)
  };
}

function StarChestService(options) {
  assertObject(options, "StarChestService options are required.");
  this.config = normalizeConfig(options.config);
  this.store = options.store;
  if (!this.store || typeof this.store.load !== "function" || typeof this.store.save !== "function" || typeof this.store.appendOpenLog !== "function") {
    throw new Error("StarChestService requires store load/save/appendOpenLog.");
  }
  this.rewardService = options.rewardService;
  if (!this.rewardService || typeof this.rewardService.grantRewardItems !== "function") {
    throw new Error("StarChestService requires rewardService.grantRewardItems.");
  }
  this.telemetry = options.telemetry || null;
  if (this.telemetry !== null) {
    requireFunction(this.telemetry.track, "StarChestService telemetry.track");
  }
}

StarChestService.prototype.calculateTotalStars = function (levelProgress) {
  assertObject(levelProgress, "StarChestService levelProgress is required.");
  assertObject(levelProgress.starsByLevel, "StarChestService levelProgress.starsByLevel is required.");

  return Object.keys(levelProgress.starsByLevel).reduce(function (total, levelId) {
    if (!/^[1-9]\d*$/.test(levelId)) {
      throw new Error("StarChestService starsByLevel key must be a positive integer string: " + levelId);
    }
    return total + requireStoredStarCount(levelProgress.starsByLevel[levelId], "StarChestService starsByLevel." + levelId);
  }, 0);
};

StarChestService.prototype._isEnabled = function () {
  return this.config.enabled === true;
};

StarChestService.prototype.getChestSummary = function (levelProgress) {
  var state = this.store.load();
  var starsPerChest = this.config.starsPerChest;
  var totalStars = this.calculateTotalStars(levelProgress);
  var consumedStars = requireNonNegativeInteger(state.consumedStars, "Star chest consumedStars");
  var openedCount = requireNonNegativeInteger(state.openedCount, "Star chest openedCount");
  var availableStars = totalStars - consumedStars;
  if (availableStars < 0) {
    throw new Error("Star chest consumedStars exceeds total stars.");
  }

  var openableCount = this._isEnabled() ? Math.floor(availableStars / starsPerChest) : 0;
  var progressStars = this._isEnabled() ? (availableStars % starsPerChest) : 0;
  var status = openableCount > 0 ? "openable" : (totalStars > 0 ? "progressing" : "locked");

  return {
    enabled: this._isEnabled(),
    activityId: this.config.activityId,
    totalStars: totalStars,
    consumedStars: consumedStars,
    availableStars: availableStars,
    starsPerChest: starsPerChest,
    progressStars: progressStars,
    openableCount: openableCount,
    openedCount: openedCount,
    status: status
  };
};

StarChestService.prototype.hasOpenableChest = function (levelProgress) {
  return this.getChestSummary(levelProgress).openableCount > 0;
};

StarChestService.prototype._pickReward = function () {
  var rewards = this.config.rewards;
  var totalWeight = rewards.reduce(function (total, reward) {
    return total + reward.weight;
  }, 0);
  var roll = Math.random() * totalWeight;
  for (var i = 0; i < rewards.length; i += 1) {
    roll -= rewards[i].weight;
    if (roll <= 0) {
      return rewards[i];
    }
  }
  return rewards[rewards.length - 1];
};

StarChestService.prototype._track = function (eventName, payload) {
  if (!this.telemetry) {
    return;
  }
  this.telemetry.track(eventName, payload);
};

StarChestService.prototype.openChest = function (levelProgress, now) {
  var summary = this.getChestSummary(levelProgress);
  if (!summary.enabled) {
    return {
      accepted: false,
      reason: "STAR_CHEST_DISABLED",
      summary: summary
    };
  }
  if (summary.openableCount <= 0) {
    return {
      accepted: false,
      reason: "STAR_CHEST_NOT_ENOUGH_STARS",
      summary: summary
    };
  }

  var reward = this._pickReward();
  var grantResult = this.rewardService.grantRewardItems(reward.rewardItems);
  if (!grantResult || grantResult.accepted !== true) {
    throw new Error("Star chest reward grant must return accepted true.");
  }

  var nowDate = now;
  if (nowDate === undefined) {
    nowDate = new Date();
  }
  if (!(nowDate instanceof Date) || Number.isNaN(nowDate.getTime())) {
    throw new Error("StarChestService now must be a valid Date.");
  }

  var timestamp = nowDate.getTime();
  var state = this.store.load();
  var consumedStarsAfterOpen = requireNonNegativeInteger(state.consumedStars, "Star chest consumedStars") + summary.starsPerChest;
  state.consumedStars = consumedStarsAfterOpen;
  state.openedCount = requireNonNegativeInteger(state.openedCount, "Star chest openedCount") + 1;
  state.lastOpenAt = timestamp;
  state = this.store.appendOpenLog(state, {
    openId: "star_chest_" + timestamp + "_" + String(state.openedCount),
    totalStarsAtOpen: summary.totalStars,
    consumedStarsAfterOpen: consumedStarsAfterOpen,
    rewardId: reward.rewardId,
    rewardItems: grantResult.rewardItems,
    timestamp: timestamp
  }, this.config.maxClaimLogs);

  if (this.store.save(state) !== true) {
    throw new Error("Star chest store save must return true.");
  }

  var nextSummary = this.getChestSummary(levelProgress);
  this._track("star_chest_open_success", {
    activity_id: summary.activityId,
    total_stars: summary.totalStars,
    consumed_stars: consumedStarsAfterOpen,
    available_stars: nextSummary.availableStars,
    stars_per_chest: summary.starsPerChest,
    openable_count: nextSummary.openableCount,
    reward_id: reward.rewardId
  });

  return {
    accepted: true,
    rewardId: reward.rewardId,
    rewardItems: clone(grantResult.rewardItems),
    summary: nextSummary
  };
};

module.exports = StarChestService;
