"use strict";

var DEFAULT_DAILY_FREE_SPIN_LIMIT = 1;
var DEFAULT_DAILY_AD_SPIN_LIMIT = 3;
var DEFAULT_DAILY_COIN_SPIN_LIMIT = 5;
var DEFAULT_COIN_SPIN_COST = 120;
var DEFAULT_AD_COOLDOWN_SECONDS = 8;

module.exports = {
  enabled: true,
  activityId: "lucky_turntable_v1",
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  dailyFreeSpinLimit: DEFAULT_DAILY_FREE_SPIN_LIMIT,
  dailyAdSpinLimit: DEFAULT_DAILY_AD_SPIN_LIMIT,
  dailyCoinSpinLimit: DEFAULT_DAILY_COIN_SPIN_LIMIT,
  coinSpinCost: DEFAULT_COIN_SPIN_COST,
  adCooldownSeconds: DEFAULT_AD_COOLDOWN_SECONDS,
  showRedDotWhenFreeSpinAvailable: true,
  segments: [
    {
      segmentId: "coin_30",
      weight: 2200,
      rewardItems: [
        { id: "coin", count: 30 }
      ]
    },
    {
      segmentId: "coin_80",
      weight: 1800,
      rewardItems: [
        { id: "coin", count: 80 }
      ]
    },
    {
      segmentId: "coin_150",
      weight: 900,
      rewardItems: [
        { id: "coin", count: 150 }
      ]
    },
    {
      segmentId: "swap_ball_1",
      weight: 1600,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    },
    {
      segmentId: "rainbow_ball_1",
      weight: 1100,
      rewardItems: [
        { id: "rainbow_ball", count: 1 }
      ]
    },
    {
      segmentId: "blast_ball_1",
      weight: 850,
      rewardItems: [
        { id: "blast_ball", count: 1 }
      ]
    },
    {
      segmentId: "barrier_hammer_1",
      weight: 850,
      rewardItems: [
        { id: "barrier_hammer", count: 1 }
      ]
    },
    {
      segmentId: "stamina_1",
      weight: 700,
      rewardItems: [
        { id: "stamina", count: 1 }
      ]
    }
  ]
};
