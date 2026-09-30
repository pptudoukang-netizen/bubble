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
      iconPath: "ui/image/props/love",
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
      skuId: "sku_precise_aim_01",
      itemId: "precise_aim",
      itemCount: 1,
      displayName: "精确瞄准",
      functionText: "瞄准时显示完整反弹路径",
      iconPath: "ui/image/props/aim",
      price: {
        currency: "coin",
        amount: 500
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 8,
      tags: ["recommended"]
    },
    {
      skuId: "sku_swap_ball_01",
      itemId: "swap_ball",
      itemCount: 1,
      displayName: "换球",
      functionText: "立即更换当前待发射泡泡",
      iconPath: "ui/image/props/change_ball",
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
      iconPath: "ui/image/props/rainbow_ball",
      price: {
        currency: "coin",
        amount: 300
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
      iconPath: "ui/image/props/blast_ball",
      price: {
        currency: "coin",
        amount: 300
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
      iconPath: "ui/image/props/barrier_hammer",
      price: {
        currency: "coin",
        amount: 300
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 40,
      tags: []
    },
    {
      skuId: "sku_snow_removal_01",
      itemId: "snow_removal",
      itemCount: 1,
      displayName: "除雪剂",
      functionText: "从棋盘底部开始清理 10 个雪块",
      iconPath: "ui/image/props/snow_removal",
      price: {
        currency: "coin",
        amount: 300
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 50,
      tags: []
    },
    {
      skuId: "sku_crystal_gun_01",
      itemId: "crystal_gun",
      itemCount: 1,
      displayName: "晶光炮",
      functionText: "装填直线穿透炮弹并清除命中路径",
      iconPath: "ui/image/props/crystal_gun",
      price: {
        currency: "coin",
        amount: 300
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 60,
      tags: ["hot"]
    },
    {
      skuId: "sku_rainbow_prism_ball_01",
      itemId: "rainbow_prism_ball",
      itemCount: 1,
      displayName: "彩虹棱镜球",
      functionText: "装填棱镜球并消除可视棋盘中的同色球",
      iconPath: "ui/image/props/rainbow_prism_ball",
      price: {
        currency: "coin",
        amount: 300
      },
      dailyLimit: 0,
      enabled: true,
      sortOrder: 70,
      tags: []
    }
  ]
};
