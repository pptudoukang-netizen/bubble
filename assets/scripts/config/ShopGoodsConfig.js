"use strict";

module.exports = {
  version: 1,
  goods: [
    {
      skuId: "sku_stamina_01",
      itemId: "stamina",
      itemCount: 1,
      displayName: "体力",
      functionText: "补充 1 点关卡挑战体力",
      iconPath: "image/props/love",
      price: {
        currency: "coin",
        amount: 100
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 5,
      tags: ["recommended"]
    },
    {
      skuId: "sku_swap_ball_01",
      itemId: "swap_ball",
      itemCount: 1,
      displayName: "换球",
      functionText: "立即更换当前待发射泡泡",
      iconPath: "image/props/change_ball",
      price: {
        currency: "coin",
        amount: 100
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 10,
      tags: ["recommended"]
    },
    {
      skuId: "sku_rainbow_ball_01",
      itemId: "rainbow_ball",
      itemCount: 1,
      displayName: "彩虹球",
      functionText: "可匹配任意颜色泡泡",
      iconPath: "image/props/rainbow_ball",
      price: {
        currency: "coin",
        amount: 500
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 20,
      tags: []
    },
    {
      skuId: "sku_blast_ball_01",
      itemId: "blast_ball",
      itemCount: 1,
      displayName: "炸裂球",
      functionText: "命中后炸开周围泡泡",
      iconPath: "image/props/blast_ball",
      price: {
        currency: "coin",
        amount: 500
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 30,
      tags: ["hot"]
    },
    {
      skuId: "sku_barrier_hammer_01",
      itemId: "barrier_hammer",
      itemCount: 1,
      displayName: "破障锤",
      functionText: "点选并破除一个障碍球",
      iconPath: "image/props/barrier_hammer",
      price: {
        currency: "coin",
        amount: 300
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 40,
      tags: []
    }
  ]
};
