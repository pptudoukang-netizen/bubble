"use strict";

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

function normalizeReward(raw) {
  var reward = raw && typeof raw === "object" ? raw : {};
  return {
    rewardId: typeof reward.rewardId === "string" ? reward.rewardId : "",
    weight: toSafeCount(reward.weight, 0),
    rewardItems: Array.isArray(reward.rewardItems) ? clone(reward.rewardItems) : []
  };
}

function resolveValidRewards(config) {
  return (Array.isArray(config && config.rewards) ? config.rewards : []).map(normalizeReward).filter(function (reward) {
    return !!reward.rewardId && reward.weight > 0 && reward.rewardItems.length > 0;
  });
}

function StarChestService(options) {
  options = options || {};
  this.config = options.config || {};
  this.store = options.store || null;
  this.rewardService = options.rewardService || null;
  this.telemetry = options.telemetry || null;
}

StarChestService.prototype.calculateTotalStars = function (levelProgress) {
  var starsByLevel = levelProgress && levelProgress.starsByLevel && typeof levelProgress.starsByLevel === "object"
    ? levelProgress.starsByLevel
    : {};
  return Object.keys(starsByLevel).reduce(function (total, levelId) {
    var stars = Math.max(0, Math.min(3, Math.floor(Number(starsByLevel[levelId]) || 0)));
    return total + stars;
  }, 0);
};

StarChestService.prototype._getStarsPerChest = function () {
  return Math.floor(Number(this.config.starsPerChest) || 0);
};

StarChestService.prototype._isEnabled = function () {
  return this.config && this.config.enabled !== false && this._getStarsPerChest() > 0;
};

StarChestService.prototype.getChestSummary = function (levelProgress) {
  var state = this.store && typeof this.store.load === "function" ? this.store.load() : {
    consumedStars: 0,
    openedCount: 0
  };
  var starsPerChest = this._getStarsPerChest();
  var totalStars = this.calculateTotalStars(levelProgress);
  var consumedStars = Math.max(0, Math.floor(Number(state && state.consumedStars) || 0));
  var availableStars = Math.max(0, totalStars - consumedStars);
  var openableCount = this._isEnabled() ? Math.floor(availableStars / starsPerChest) : 0;
  var progressStars = this._isEnabled() ? (availableStars % starsPerChest) : 0;
  var status = openableCount > 0 ? "openable" : (totalStars > 0 ? "progressing" : "locked");

  return {
    enabled: this._isEnabled(),
    activityId: this.config.activityId || "star_chest_v1",
    totalStars: totalStars,
    consumedStars: consumedStars,
    availableStars: availableStars,
    starsPerChest: Math.max(0, starsPerChest),
    progressStars: progressStars,
    openableCount: openableCount,
    openedCount: Math.max(0, Math.floor(Number(state && state.openedCount) || 0)),
    status: status
  };
};

StarChestService.prototype.hasOpenableChest = function (levelProgress) {
  return this.getChestSummary(levelProgress).openableCount > 0;
};

StarChestService.prototype._pickReward = function () {
  var rewards = resolveValidRewards(this.config);
  if (!rewards.length) {
    return null;
  }

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
  if (!this.telemetry || typeof this.telemetry.track !== "function") {
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
  if (!reward) {
    return {
      accepted: false,
      reason: "STAR_CHEST_REWARD_POOL_EMPTY",
      summary: summary
    };
  }

  var grantResult = this.rewardService && typeof this.rewardService.grantRewardItems === "function"
    ? this.rewardService.grantRewardItems(reward.rewardItems)
    : { accepted: false, reason: "STAR_CHEST_REWARD_GRANT_FAILED" };
  if (!grantResult || !grantResult.accepted) {
    return {
      accepted: false,
      reason: grantResult && grantResult.reason ? grantResult.reason : "STAR_CHEST_REWARD_GRANT_FAILED",
      summary: summary
    };
  }

  var timestamp = now instanceof Date ? now.getTime() : Date.now();
  var state = this.store.load();
  var consumedStarsAfterOpen = Math.max(0, Math.floor(Number(state.consumedStars) || 0)) + summary.starsPerChest;
  state.consumedStars = consumedStarsAfterOpen;
  state.openedCount = Math.max(0, Math.floor(Number(state.openedCount) || 0)) + 1;
  state.lastOpenAt = timestamp;
  state = this.store.appendOpenLog(state, {
    openId: "star_chest_" + timestamp + "_" + String(state.openedCount),
    totalStarsAtOpen: summary.totalStars,
    consumedStarsAfterOpen: consumedStarsAfterOpen,
    rewardId: reward.rewardId,
    rewardItems: grantResult.rewardItems,
    timestamp: timestamp
  }, this.config.maxClaimLogs);

  if (!this.store.save(state)) {
    return {
      accepted: false,
      reason: "STAR_CHEST_SAVE_FAILED",
      summary: summary
    };
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
    rewardItems: grantResult.rewardItems,
    summary: nextSummary
  };
};

module.exports = StarChestService;
