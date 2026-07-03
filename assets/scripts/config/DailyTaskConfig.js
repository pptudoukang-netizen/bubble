"use strict";

module.exports = {
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  tasks: [
    {
      taskId: "clear_level_5",
      title: "通过 5 个关卡",
      description: "完成5个任意关卡",
      type: "clear_level",
      target: 5,
      sortOrder: 10,
      enabled: true,
      iconPath: "image/dailytask/level_icon",
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "spend_stamina_20",
      title: "使用体力 20 点",
      description: "累计使用20点体力",
      type: "spend_stamina",
      target: 20,
      sortOrder: 20,
      enabled: true,
      iconPath: "image/dailytask/love_icon",
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "use_rainbow_ball_2",
      title: "使用彩虹球道具 2 次",
      description: "局内使用2次彩虹球",
      type: "use_powerup",
      target: 2,
      sortOrder: 30,
      enabled: true,
      requiredItemId: "rainbow_ball",
      iconPath: "image/dailytask/rainbow_icon",
      rewardItems: [
        { id: "coin", count: 200 }
      ]
    },
    {
      taskId: "use_barrier_hammer_1",
      title: "使用锤子道具 1 次",
      description: "局内使用1次破障锤",
      type: "use_powerup",
      target: 1,
      sortOrder: 40,
      enabled: true,
      requiredItemId: "barrier_hammer",
      iconPath: "image/dailytask/hammer_icon",
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      taskId: "gift_friend_stamina_3",
      title: "赠送好友体力 3 次",
      description: "赠送好友体力3次",
      type: "gift_friend_stamina",
      target: 3,
      sortOrder: 0,
      enabled: true,
      iconPath: "image/dailytask/invite_icon",
      rewardItems: [
        { id: "coin", count: 300 }
      ]
    },
    {
      taskId: "challenge_attempt_10",
      title: "完成每日挑战 10 次",
      description: "每日挑战成功或失败累计10次",
      type: "challenge_attempt",
      target: 10,
      sortOrder: 50,
      enabled: true,
      iconPath: "image/dailytask/challenge_icon",
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "challenge_clear_3",
      title: "通过每日挑战 3 次",
      description: "成功通过每日挑战3次",
      type: "challenge_clear",
      target: 3,
      sortOrder: 60,
      enabled: true,
      iconPath: "image/dailytask/challenge_icon",
      rewardItems: [
        { id: "coin", count: 300 }
      ]
    },
    {
      taskId: "challenge_clear_5",
      title: "通过每日挑战 5 次",
      description: "成功通过每日挑战5次",
      type: "challenge_clear",
      target: 5,
      sortOrder: 70,
      enabled: true,
      iconPath: "image/dailytask/challenge_icon",
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "challenge_clear_10",
      title: "通过每日挑战 10 次",
      description: "成功通过每日挑战10次",
      type: "challenge_clear",
      target: 10,
      sortOrder: 80,
      enabled: true,
      iconPath: "image/dailytask/challenge_icon",
      rewardItems: [
        { id: "coin", count: 1000 }
      ]
    }
  ],
  progressRules: {
    maxProgressPerTaskPerEvent: 20,
    clampProgressToTarget: true
  }
};
