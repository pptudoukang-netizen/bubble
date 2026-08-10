"use strict";

var LEVEL_SELECT_GEM_REWARD_AMOUNT = 10;
var LEVEL_SELECT_GEM_DAILY_LIMIT = 1;
var ASSIST_SPIRIT_SKILL_CHARGE_AD_DAILY_LIMIT = 3;
var ASSIST_SPIRIT_SKILL_CHARGE_AD_COOLDOWN_SECONDS = 120;

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
  },
  lost_objective: {
    entryKey: "lose_lost_objective",
    rewardType: "current_round_revive_lost_objective",
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

function resolveAssistSpiritSkillChargeRewardEntry() {
  return {
    entryKey: "assist_spirit_skill_charge",
    rewardType: "assist_spirit_skill_charge",
    rewardValue: "full_charge",
    quotaType: "assist_spirit_skill_charge",
    grantMode: "instant",
    repeatableWithinAttempt: true,
    awardTips: "精灵技能已充满",
    assistSpiritSkillChargeGrant: true
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

function resolveLevelSelectGemRewardEntry() {
  return {
    entryKey: "level_select_gem_reward",
    rewardType: "level_select_gem_reward",
    rewardValue: LEVEL_SELECT_GEM_REWARD_AMOUNT,
    quotaType: "level_select_gem",
    grantMode: "instant",
    awardTips: "钻石 +" + LEVEL_SELECT_GEM_REWARD_AMOUNT,
    gemGrant: LEVEL_SELECT_GEM_REWARD_AMOUNT
  };
}

module.exports = {
  LEVEL_SELECT_GEM_REWARD_AMOUNT: LEVEL_SELECT_GEM_REWARD_AMOUNT,
  LEVEL_SELECT_GEM_DAILY_LIMIT: LEVEL_SELECT_GEM_DAILY_LIMIT,
  ASSIST_SPIRIT_SKILL_CHARGE_AD_DAILY_LIMIT: ASSIST_SPIRIT_SKILL_CHARGE_AD_DAILY_LIMIT,
  ASSIST_SPIRIT_SKILL_CHARGE_AD_COOLDOWN_SECONDS: ASSIST_SPIRIT_SKILL_CHARGE_AD_COOLDOWN_SECONDS,
  resolveLoseRewardEntry: resolveLoseRewardEntry,
  resolveInventoryEmptyRewardEntry: resolveInventoryEmptyRewardEntry,
  resolveAdRunPowerupRewardEntry: resolveAdRunPowerupRewardEntry,
  resolveAssistSpiritSkillChargeRewardEntry: resolveAssistSpiritSkillChargeRewardEntry,
  resolveStaminaRecoveryEntry: resolveStaminaRecoveryEntry,
  resolveLevelSelectGemRewardEntry: resolveLevelSelectGemRewardEntry,
  resolvePowerupDisplayName: resolvePowerupDisplayName
};
