"use strict";

var POWERUP_DISPLAY_NAMES = {
  precise_aim: "精确瞄准",
  rainbow: "彩虹球",
  blast: "炸弹球",
  swap: "换球",
  barrier_hammer: "破障锤",
  snow_removal: "除雪剂",
  three_line_elimination: "消三行",
  plus_three_balls: "加十球"
};

var LOSE_REWARD_ENTRIES = {
  out_of_shots: {
    entryKey: "lose_out_of_shots",
    rewardType: "current_round_revive_out_of_shots",
    rewardValue: "revive",
    quotaType: "lose_next_round",
    grantMode: "current_round_revive",
    awardTips: "立即复活"
  },
  lost_danger: {
    entryKey: "lose_lost_danger",
    rewardType: "current_round_revive_lost_danger",
    rewardValue: "revive",
    quotaType: "lose_next_round",
    grantMode: "current_round_revive",
    awardTips: "立即复活"
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

function resolveAdRunPowerupRewardEntry(powerupType) {
  if (typeof powerupType !== "string" || !powerupType) {
    return null;
  }

  return {
    entryKey: "ad_run_powerup_" + powerupType,
    rewardType: "ad_run_powerup_" + powerupType,
    rewardValue: 1,
    quotaType: "inventory_refill",
    grantMode: "instant",
    awardTips: "补给：" + resolvePowerupDisplayName(powerupType) + " +1",
    adRunPowerupGrant: {
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
  resolveAdRunPowerupRewardEntry: resolveAdRunPowerupRewardEntry,
  resolveStaminaRecoveryEntry: resolveStaminaRecoveryEntry,
  resolvePowerupDisplayName: resolvePowerupDisplayName
};
