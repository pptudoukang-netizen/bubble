"use strict";

var SUPPORTED_ITEM_IDS = ["stamina", "precise_aim", "swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];
var SUPPORTED_TAGS = ["recommended", "hot"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
}

function assertPositiveInteger(value, message) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(message);
  }
}

function assertNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
}

function assertSupportedItemId(itemId) {
  if (SUPPORTED_ITEM_IDS.indexOf(itemId) < 0) {
    throw new Error("Unsupported shop itemId: " + itemId);
  }
}

function validateTags(tags, skuId) {
  if (!Array.isArray(tags)) {
    throw new Error("Shop goods tags must be an array: " + skuId);
  }
  tags.forEach(function (tag) {
    assertString(tag, "Shop goods tag must be a non-empty string: " + skuId);
    if (SUPPORTED_TAGS.indexOf(tag) < 0) {
      throw new Error("Unsupported shop tag `" + tag + "` in sku: " + skuId);
    }
  });
}

function normalizeGoods(rawGoods, index) {
  assertObject(rawGoods, "Invalid shop goods at index " + index + ".");
  assertString(rawGoods.skuId, "Shop goods skuId is required at index " + index + ".");
  assertString(rawGoods.itemId, "Shop goods itemId is required: " + rawGoods.skuId);
  assertSupportedItemId(rawGoods.itemId);
  assertPositiveInteger(rawGoods.itemCount, "Shop goods itemCount must be a positive integer: " + rawGoods.skuId);
  assertString(rawGoods.displayName, "Shop goods displayName is required: " + rawGoods.skuId);
  assertString(rawGoods.functionText, "Shop goods functionText is required: " + rawGoods.skuId);
  assertString(rawGoods.iconPath, "Shop goods iconPath is required: " + rawGoods.skuId);
  assertObject(rawGoods.price, "Shop goods price is required: " + rawGoods.skuId);
  if (rawGoods.price.currency !== "coin") {
    throw new Error("Shop V1 only supports coin currency: " + rawGoods.skuId);
  }
  assertPositiveInteger(rawGoods.price.amount, "Shop goods price amount must be a positive integer: " + rawGoods.skuId);
  assertNonNegativeInteger(rawGoods.dailyLimit, "Shop goods dailyLimit must be a non-negative integer: " + rawGoods.skuId);
  if (typeof rawGoods.enabled !== "boolean") {
    throw new Error("Shop goods enabled must be boolean: " + rawGoods.skuId);
  }
  assertNonNegativeInteger(rawGoods.sortOrder, "Shop goods sortOrder must be a non-negative integer: " + rawGoods.skuId);
  validateTags(rawGoods.tags, rawGoods.skuId);

  return {
    skuId: rawGoods.skuId,
    itemId: rawGoods.itemId,
    itemCount: rawGoods.itemCount,
    displayName: rawGoods.displayName,
    functionText: rawGoods.functionText,
    iconPath: rawGoods.iconPath,
    price: {
      currency: rawGoods.price.currency,
      amount: rawGoods.price.amount
    },
    dailyLimit: rawGoods.dailyLimit,
    enabled: rawGoods.enabled,
    sortOrder: rawGoods.sortOrder,
    tags: rawGoods.tags.slice()
  };
}

function normalizeGoodsConfig(config) {
  assertObject(config, "Shop goods config is required.");
  if (config.version !== 1) {
    throw new Error("Unsupported shop goods config version: " + config.version);
  }
  if (!Array.isArray(config.goods) || config.goods.length === 0) {
    throw new Error("Shop goods config requires non-empty goods.");
  }

  var skuMap = {};
  var itemMap = {};
  var goods = config.goods.map(function (rawGoods, index) {
    var goodsEntry = normalizeGoods(rawGoods, index);
    if (skuMap[goodsEntry.skuId]) {
      throw new Error("Duplicated shop skuId: " + goodsEntry.skuId);
    }
    skuMap[goodsEntry.skuId] = true;
    itemMap[goodsEntry.itemId] = true;
    return goodsEntry;
  });

  SUPPORTED_ITEM_IDS.forEach(function (itemId) {
    if (!itemMap[itemId]) {
      throw new Error("Shop goods config missing required itemId: " + itemId);
    }
  });

  return {
    version: 1,
    goods: goods
  };
}

function normalizeRulesConfig(config) {
  assertObject(config, "Shop rules config is required.");
  assertObject(config.shopRules, "Shop rules config requires shopRules.");
  if (config.shopRules.resetTime !== "00:00") {
    throw new Error("Shop V1 resetTime must be 00:00.");
  }
  if (config.shopRules.resetTimezone !== "Asia/Shanghai") {
    throw new Error("Shop V1 resetTimezone must be Asia/Shanghai.");
  }
  if (typeof config.shopRules.showSoldOutItems !== "boolean") {
    throw new Error("Shop showSoldOutItems must be boolean.");
  }
  if (config.shopRules.defaultSort !== "sortOrder_asc") {
    throw new Error("Shop V1 defaultSort must be sortOrder_asc.");
  }

  return {
    shopRules: {
      resetTime: config.shopRules.resetTime,
      resetTimezone: config.shopRules.resetTimezone,
      showSoldOutItems: config.shopRules.showSoldOutItems,
      defaultSort: config.shopRules.defaultSort
    }
  };
}

function ShopConfigService(options) {
  assertObject(options, "ShopConfigService options are required.");
  this._goodsConfig = normalizeGoodsConfig(options.goodsConfig);
  this._rulesConfig = normalizeRulesConfig(options.rulesConfig);
}

ShopConfigService.prototype.loadShopGoods = function () {
  return clone(this._goodsConfig);
};

ShopConfigService.prototype.findGoodsBySkuId = function (skuId) {
  assertString(skuId, "Shop skuId is required.");
  for (var i = 0; i < this._goodsConfig.goods.length; i += 1) {
    if (this._goodsConfig.goods[i].skuId === skuId) {
      return clone(this._goodsConfig.goods[i]);
    }
  }
  return null;
};

ShopConfigService.prototype.getGoodsBySkuId = function (skuId) {
  var goods = this.findGoodsBySkuId(skuId);
  if (!goods) {
    throw new Error("Shop goods not found: " + skuId);
  }
  return goods;
};

ShopConfigService.prototype.getSortedGoodsList = function () {
  return this._goodsConfig.goods.filter(function (goods) {
    return goods.enabled === true;
  }).sort(function (a, b) {
    return a.sortOrder - b.sortOrder;
  }).map(function (goods) {
    return clone(goods);
  });
};

ShopConfigService.prototype.getAllGoodsList = function () {
  return this._goodsConfig.goods.slice().sort(function (a, b) {
    return a.sortOrder - b.sortOrder;
  }).map(function (goods) {
    return clone(goods);
  });
};

ShopConfigService.prototype.getShopRules = function () {
  return clone(this._rulesConfig.shopRules);
};

ShopConfigService.SUPPORTED_ITEM_IDS = SUPPORTED_ITEM_IDS.slice();

module.exports = ShopConfigService;
