"use strict";

var ALLOWED_REASONS = {
  daily_task_clear_level: true,
  daily_task_spend_stamina: true,
  daily_task_use_rainbow_ball: true,
  daily_task_use_barrier_hammer: true,
  daily_task_gift_friend_stamina: true,
  daily_task_challenge_attempt: true,
  daily_task_challenge_clear_3: true,
  daily_task_challenge_clear_5: true,
  daily_task_challenge_clear_10: true
};

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
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

function DailyTaskRewardService(options) {
  assertObject(options, "DailyTaskRewardService options are required.");
  if (typeof options.getResources !== "function") {
    throw new Error("DailyTaskRewardService requires getResources.");
  }
  if (typeof options.saveResources !== "function") {
    throw new Error("DailyTaskRewardService requires saveResources.");
  }
  this.getResources = options.getResources;
  this.saveResources = options.saveResources;
}

DailyTaskRewardService.prototype.grantRewardItems = function (rewardItems, reason) {
  if (!ALLOWED_REASONS[reason]) {
    throw new Error("DAILY_TASK_REWARD_INVALID");
  }
  if (!Array.isArray(rewardItems) || rewardItems.length === 0) {
    throw new Error("DAILY_TASK_REWARD_INVALID");
  }

  var totalCoins = 0;
  rewardItems.forEach(function (item, index) {
    assertObject(item, "Daily task reward item must be an object at index " + index + ".");
    if (item.id !== "coin") {
      throw new Error("DAILY_TASK_REWARD_INVALID");
    }
    totalCoins += requirePositiveInteger(item.count, "Daily task coin reward count");
  });

  var resources = this.getResources();
  assertObject(resources, "Daily task player resources are required.");
  var currentCoins = requireNonNegativeInteger(resources.coins, "Player coins");
  resources.coins = currentCoins + totalCoins;
  this.saveResources(resources);

  return {
    accepted: true,
    rewardItems: rewardItems.slice(),
    coinBefore: currentCoins,
    coinAfter: resources.coins
  };
};

module.exports = DailyTaskRewardService;
