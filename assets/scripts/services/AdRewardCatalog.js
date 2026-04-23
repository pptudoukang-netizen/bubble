"use strict";

var POWERUP_DISPLAY_NAMES = {
  rainbow: "彩虹球",
  blast: "炸弹球",
  swap: "换球",
  barrier_hammer: "破障锤"
};

var LOSE_REWARD_ENTRIES = {
  out_of_shots: {
    entryKey: "lose_out_of_shots",
    rewardType: "next_round_powerup_swap",
    rewardValue: 1,
    quotaType: "lose_next_round",
    grantMode: "next_round",
    awardTips: "下局补给：换球 +1",
    inventoryGrant: {
      powerupType: "swap",
      amount: 1
    }
  },
  lost_danger: {
    entryKey: "lose_lost_danger",
    rewardType: "next_round_powerup_barrier_hammer",
    rewardValue: 1,
    quotaType: "lose_next_round",
    grantMode: "next_round",
    awardTips: "下局补给：破障锤 +1",
    inventoryGrant: {
      powerupType: "barrier_hammer",
      amount: 1
    }
  },
  lost_objective: {
    entryKey: "lose_lost_objective",
    rewardType: "next_round_jar_score_boost",
    rewardValue: "x2_5s",
    quotaType: "lose_next_round",
    grantMode: "next_round",
    awardTips: "下局奖励：5秒入缸分数x2",
    jarScoreBoost: {
      durationMs: 5000,
      multiplier: 2
    }
  }
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function resolvePowerupDisplayName(powerupType) {
  if (typeof powerupType !== "string" || !powerupType) {
    return "道具";
  }
  return POWERUP_DISPLAY_NAMES[powerupType] || "道具";
}

function resolveLoseRewardEntry(runtimeState) {
  if (typeof runtimeState !== "string" || !runtimeState) {
    return null;
  }

  var entry = LOSE_REWARD_ENTRIES[runtimeState];
  return entry ? clone(entry) : null;
}

function resolveInventoryEmptyRewardEntry(powerupType) {
  if (typeof powerupType !== "string" || !powerupType) {
    return null;
  }

  return {
    entryKey: "inventory_empty_" + powerupType,
    rewardType: "inventory_refill_" + powerupType,
    rewardValue: 1,
    quotaType: "inventory_refill",
    grantMode: "instant",
    awardTips: "补给：" + resolvePowerupDisplayName(powerupType) + " +1",
    inventoryGrant: {
      powerupType: powerupType,
      amount: 1
    }
  };
}

function resolveStaminaRecoveryEntry() {
  return {
    entryKey: "stamina_recovery",
    rewardType: "stamina_refill_1",
    rewardValue: 1,
    quotaType: "stamina_refill",
    grantMode: "instant",
    awardTips: "补给：体力 +1",
    staminaGrant: 1
  };
}

module.exports = {
  resolveLoseRewardEntry: resolveLoseRewardEntry,
  resolveInventoryEmptyRewardEntry: resolveInventoryEmptyRewardEntry,
  resolveStaminaRecoveryEntry: resolveStaminaRecoveryEntry,
  resolvePowerupDisplayName: resolvePowerupDisplayName
};
