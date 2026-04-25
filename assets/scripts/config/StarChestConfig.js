"use strict";

module.exports = {
  enabled: true,
  activityId: "star_chest_v1",
  starsPerChest: 15,
  showRedDotWhenOpenable: true,
  maxClaimLogs: 20,
  rewards: [
    {
      rewardId: "coin_120",
      weight: 2400,
      rewardItems: [
        { id: "coin", count: 120 }
      ]
    },
    {
      rewardId: "coin_200",
      weight: 1600,
      rewardItems: [
        { id: "coin", count: 200 }
      ]
    },
    {
      rewardId: "stamina_1",
      weight: 1200,
      rewardItems: [
        { id: "stamina", count: 1 }
      ]
    },
    {
      rewardId: "swap_ball_1",
      weight: 1600,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    },
    {
      rewardId: "rainbow_ball_1",
      weight: 1000,
      rewardItems: [
        { id: "rainbow_ball", count: 1 }
      ]
    },
    {
      rewardId: "blast_ball_1",
      weight: 800,
      rewardItems: [
        { id: "blast_ball", count: 1 }
      ]
    },
    {
      rewardId: "barrier_hammer_1",
      weight: 800,
      rewardItems: [
        { id: "barrier_hammer", count: 1 }
      ]
    },
    {
      rewardId: "coin_100_swap_1",
      weight: 600,
      rewardItems: [
        { id: "coin", count: 100 },
        { id: "swap_ball", count: 1 }
      ]
    }
  ]
};
