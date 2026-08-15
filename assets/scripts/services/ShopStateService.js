"use strict";

var ShopStateStore = require("../utils/ShopStateStore");
var UNLIMITED_REMAINING_COUNT = Number.MAX_SAFE_INTEGER;

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

function toDateKey(now) {
  var date = now instanceof Date ? now : new Date();
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return [
    String(year),
    month < 10 ? "0" + month : String(month),
    day < 10 ? "0" + day : String(day)
  ].join("-");
}

function ShopStateService(options) {
  assertObject(options, "ShopStateService options are required.");
  if (!options.store || typeof options.store.load !== "function" || typeof options.store.save !== "function") {
    throw new Error("ShopStateService requires a store with load/save.");
  }
  if (
    !options.configService ||
    typeof options.configService.getAllGoodsList !== "function" ||
    typeof options.configService.getGoodsBySkuId !== "function"
  ) {
    throw new Error("ShopStateService requires ShopConfigService.");
  }

  this.store = options.store;
  this.configService = options.configService;
  this.state = this.store.load(toDateKey(), this._buildEmptySkuCounts());
  this.ensureDailyReset();
}

ShopStateService.prototype._buildEmptySkuCounts = function () {
  var counts = {};
  this.configService.getAllGoodsList().forEach(function (goods) {
    counts[goods.skuId] = 0;
  });
  return counts;
};

ShopStateService.prototype._assertStateMatchesConfig = function (state) {
  assertObject(state, "Shop state is required.");
  assertObject(state.shopState, "Shop state root is required.");
  assertObject(state.shopState.dailyPurchases, "Shop dailyPurchases is required.");
  assertObject(state.shopState.dailyPurchases.skuCounts, "Shop skuCounts is required.");

  this.configService.getAllGoodsList().forEach(function (goods) {
    if (!Object.prototype.hasOwnProperty.call(state.shopState.dailyPurchases.skuCounts, goods.skuId)) {
      throw new Error("Shop state missing sku count: " + goods.skuId);
    }
    var count = state.shopState.dailyPurchases.skuCounts[goods.skuId];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Shop sku count must be a non-negative integer: " + goods.skuId);
    }
  });
};

ShopStateService.prototype._migrateSkuCountsForCurrentConfig = function () {
  assertObject(this.state, "Shop state is required.");
  assertObject(this.state.shopState, "Shop state root is required.");
  assertObject(this.state.shopState.dailyPurchases, "Shop dailyPurchases is required.");
  assertObject(this.state.shopState.dailyPurchases.skuCounts, "Shop skuCounts is required.");

  var skuCounts = this.state.shopState.dailyPurchases.skuCounts;
  var changed = false;
  this.configService.getAllGoodsList().forEach(function (goods) {
    if (!Object.prototype.hasOwnProperty.call(skuCounts, goods.skuId)) {
      skuCounts[goods.skuId] = 0;
      changed = true;
      return;
    }

    var count = skuCounts[goods.skuId];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Shop sku count must be a non-negative integer: " + goods.skuId);
    }
  });

  if (changed) {
    this.store.save(this.state);
  }
};

ShopStateService.prototype.ensureDailyReset = function (now) {
  var dateKey = toDateKey(now);
  if (this.state.shopState.dailyPurchases.date !== dateKey) {
    this.state.shopState.dailyPurchases = {
      date: dateKey,
      skuCounts: this._buildEmptySkuCounts()
    };
    this.store.save(this.state);
    return clone(this.state);
  }

  this._migrateSkuCountsForCurrentConfig();
  this._assertStateMatchesConfig(this.state);
  return clone(this.state);
};

ShopStateService.prototype.getDailyPurchasedCount = function (skuId) {
  assertString(skuId, "Shop skuId is required.");
  this.ensureDailyReset();
  this.configService.getGoodsBySkuId(skuId);
  return this.state.shopState.dailyPurchases.skuCounts[skuId];
};

ShopStateService.prototype.getRemainingCount = function (skuId) {
  var goods = this.configService.getGoodsBySkuId(skuId);
  if (goods.dailyLimit === 0) {
    return UNLIMITED_REMAINING_COUNT;
  }
  var purchasedCount = this.getDailyPurchasedCount(skuId);
  if (purchasedCount > goods.dailyLimit) {
    throw new Error("Shop purchased count exceeds dailyLimit: " + skuId);
  }
  return goods.dailyLimit - purchasedCount;
};

ShopStateService.prototype.increaseDailyPurchasedCount = function (skuId, delta) {
  assertString(skuId, "Shop skuId is required.");
  assertPositiveInteger(delta, "Shop purchase delta must be a positive integer.");
  this.ensureDailyReset();
  this.configService.getGoodsBySkuId(skuId);
  this.state.shopState.dailyPurchases.skuCounts[skuId] += delta;
  this.store.save(this.state);
  return clone(this.state);
};

ShopStateService.prototype.appendPurchaseLog = function (log) {
  assertObject(log, "Shop purchase log is required.");
  this.ensureDailyReset();
  this.state.shopState.purchaseLogs.push(clone(log));
  if (this.state.shopState.purchaseLogs.length > ShopStateStore.MAX_PURCHASE_LOGS) {
    this.state.shopState.purchaseLogs = this.state.shopState.purchaseLogs.slice(-ShopStateStore.MAX_PURCHASE_LOGS);
  }
  this.store.save(this.state);
  return clone(this.state);
};

ShopStateService.prototype.getState = function () {
  this.ensureDailyReset();
  return clone(this.state);
};

ShopStateService.toDateKey = toDateKey;
ShopStateService.UNLIMITED_REMAINING_COUNT = UNLIMITED_REMAINING_COUNT;

module.exports = ShopStateService;
