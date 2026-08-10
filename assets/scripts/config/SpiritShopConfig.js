"use strict";

var AssistSpiritConfig = require("./AssistSpiritConfig");

var DAILY_RESET_HOUR = 5;
var FRAGMENT_SLOT_COUNT = 7;
var FRAGMENT_QUANTITY = 10;
var FRAGMENT_PRICE = 60;
var MANUAL_REFRESH_PRICE = 20;
var MAX_PURCHASE_LOGS = 100;
var FRAGMENT_BAG_SKU_ID = "fragment_bag";
var FRAGMENT_BAG_QUANTITY_DISTRIBUTION = [
  { quantity: 5, chancePercent: 50 },
  { quantity: 6, chancePercent: 30 },
  { quantity: 8, chancePercent: 15 },
  { quantity: 10, chancePercent: 5 }
];

var FRAGMENT_PRESENTATION = {
  milu: {
    fragmentPath: "spirit_system/image/tabbar/milu_fragments",
    slotPath: "spirit_system/image/shop/star_item_slot"
  },
  lumi: {
    fragmentPath: "spirit_system/image/tabbar/lumi_fragments",
    slotPath: "spirit_system/image/shop/fire_item_slot"
  },
  noya: {
    fragmentPath: "spirit_system/image/tabbar/noya_fragments",
    slotPath: "spirit_system/image/shop/wind_item_slot"
  },
  flora: {
    fragmentPath: "spirit_system/image/tabbar/flora_fragments",
    slotPath: "spirit_system/image/shop/leaf_item_slot"
  },
  loco: {
    fragmentPath: "spirit_system/image/tabbar/loco_fragments",
    slotPath: "spirit_system/image/shop/ice_item_slot"
  },
  kelu: {
    fragmentPath: "spirit_system/image/tabbar/kelu_fragments",
    slotPath: "spirit_system/image/shop/lightning_item_slot"
  },
  yumi: {
    fragmentPath: "spirit_system/image/tabbar/yumi_fragments",
    slotPath: "spirit_system/image/shop/star_item_slot"
  }
};

var PRODUCTS = [
  {
    skuId: "royal_egg",
    displayName: "星光糖果",
    kind: "inventory",
    grantItemId: "royal_egg",
    grantCount: 10,
    price: 20,
    dailyLimit: 5
  },
  {
    skuId: "fruit_basket",
    displayName: "魔法果篮",
    kind: "inventory",
    grantItemId: "fruit_basket",
    grantCount: 1,
    price: 60,
    dailyLimit: 5
  },
  {
    skuId: "ice_tower",
    displayName: "精灵喷泉",
    kind: "inventory",
    grantItemId: "ice_tower",
    grantCount: 1,
    price: 120,
    dailyLimit: 1
  },
  {
    skuId: "mushroom_house",
    displayName: "蘑菇小屋",
    kind: "inventory",
    grantItemId: "mushroom_house",
    grantCount: 1,
    price: 180,
    dailyLimit: 1
  },
  {
    skuId: "gold_sack",
    displayName: "金币袋",
    kind: "coins",
    grantItemId: "coins",
    grantCount: 10000,
    price: 25,
    dailyLimit: 1
  },
  {
    skuId: FRAGMENT_BAG_SKU_ID,
    displayName: "碎片袋",
    kind: "random_fragments",
    grantItemId: "assist_spirit_fragments",
    price: 30,
    dailyLimit: 1
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function requireRandomUnit(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Spirit shop fragment bag random value must be in [0, 1).");
  }
  return value;
}

function validateFragmentBagDistribution() {
  var totalChancePercent = 0;
  var expectedQuantity = 0;
  FRAGMENT_BAG_QUANTITY_DISTRIBUTION.forEach(function (entry, index) {
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) {
      throw new Error("Fragment bag quantity must be a positive integer at index " + index + ".");
    }
    if (!Number.isInteger(entry.chancePercent) || entry.chancePercent <= 0) {
      throw new Error("Fragment bag chancePercent must be a positive integer at index " + index + ".");
    }
    totalChancePercent += entry.chancePercent;
    expectedQuantity += entry.quantity * entry.chancePercent;
  });
  if (totalChancePercent !== 100) {
    throw new Error("Fragment bag chancePercent values must total 100.");
  }
  if (expectedQuantity !== 600) {
    throw new Error("Fragment bag expected quantity must be exactly 6 fragments.");
  }
}

function resolveFragmentBagQuantity(randomUnit) {
  var rollPercent = requireRandomUnit(randomUnit) * 100;
  var cumulativePercent = 0;
  for (var index = 0; index < FRAGMENT_BAG_QUANTITY_DISTRIBUTION.length; index += 1) {
    var entry = FRAGMENT_BAG_QUANTITY_DISTRIBUTION[index];
    cumulativePercent += entry.chancePercent;
    if (rollPercent < cumulativePercent) {
      return entry.quantity;
    }
  }
  throw new Error("Fragment bag quantity roll did not resolve.");
}

validateFragmentBagDistribution();

function requireDateKey(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Spirit shop date key must use YYYY-MM-DD.");
  }
  return dateKey;
}

function requireSpiritId(spiritId) {
  AssistSpiritConfig.getSpirit(spiritId);
  if (!FRAGMENT_PRESENTATION[spiritId]) {
    throw new Error("Spirit shop fragment presentation is missing: " + spiritId);
  }
  return spiritId;
}

function buildFragmentOfferSpiritIds(dateKey, refreshCount) {
  requireDateKey(dateKey);
  requireNonNegativeInteger(refreshCount, "Spirit shop refresh count");
  var catalogIds = AssistSpiritConfig.getCatalog().map(function (spirit) {
    return spirit.id;
  });
  if (catalogIds.length < FRAGMENT_SLOT_COUNT) {
    throw new Error("Spirit shop requires at least as many configured spirits as fragment slots.");
  }
  return catalogIds.slice(0, FRAGMENT_SLOT_COUNT);
}

function getProduct(skuId) {
  if (typeof skuId !== "string" || skuId.length === 0) {
    throw new Error("Spirit shop skuId must be a non-empty string.");
  }
  var product = PRODUCTS.find(function (entry) {
    return entry.skuId === skuId;
  });
  if (!product) {
    throw new Error("Unknown spirit shop skuId: " + skuId);
  }
  return clone(product);
}

function getInventoryItemIds() {
  return PRODUCTS.filter(function (product) {
    return product.kind === "inventory";
  }).map(function (product) {
    return product.grantItemId;
  });
}

function getAllSpritePaths() {
  var pathMap = {};
  Object.keys(FRAGMENT_PRESENTATION).forEach(function (spiritId) {
    var presentation = FRAGMENT_PRESENTATION[spiritId];
    pathMap[presentation.fragmentPath] = true;
    pathMap[presentation.slotPath] = true;
  });
  return Object.keys(pathMap);
}

module.exports = {
  DAILY_RESET_HOUR: DAILY_RESET_HOUR,
  FRAGMENT_SLOT_COUNT: FRAGMENT_SLOT_COUNT,
  FRAGMENT_QUANTITY: FRAGMENT_QUANTITY,
  FRAGMENT_PRICE: FRAGMENT_PRICE,
  MANUAL_REFRESH_PRICE: MANUAL_REFRESH_PRICE,
  MAX_PURCHASE_LOGS: MAX_PURCHASE_LOGS,
  FRAGMENT_BAG_SKU_ID: FRAGMENT_BAG_SKU_ID,
  getProducts: function () {
    return clone(PRODUCTS);
  },
  getProduct: getProduct,
  getInventoryItemIds: getInventoryItemIds,
  getFragmentPresentation: function (spiritId) {
    return clone(FRAGMENT_PRESENTATION[requireSpiritId(spiritId)]);
  },
  getFragmentBagQuantityDistribution: function () {
    return clone(FRAGMENT_BAG_QUANTITY_DISTRIBUTION);
  },
  resolveFragmentBagQuantity: resolveFragmentBagQuantity,
  getAllSpritePaths: getAllSpritePaths,
  buildFragmentOfferSpiritIds: buildFragmentOfferSpiritIds
};
