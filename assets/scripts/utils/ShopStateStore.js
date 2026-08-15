"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_shop_state_v1";
var NAMESPACE = "ShopStateStore";
var MAX_PURCHASE_LOGS = 50;

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

function assertNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
}

function normalizePurchaseLog(log, index) {
  assertObject(log, "Invalid shop purchase log at index " + index + ".");
  assertString(log.orderId, "Shop purchase log orderId is required at index " + index + ".");
  assertString(log.skuId, "Shop purchase log skuId is required at index " + index + ".");
  assertString(log.itemId, "Shop purchase log itemId is required at index " + index + ".");
  assertString(log.currency, "Shop purchase log currency is required at index " + index + ".");
  assertNonNegativeInteger(log.itemCount, "Shop purchase log itemCount must be a non-negative integer.");
  assertNonNegativeInteger(log.cost, "Shop purchase log cost must be a non-negative integer.");
  assertNonNegativeInteger(log.coinBefore, "Shop purchase log coinBefore must be a non-negative integer.");
  assertNonNegativeInteger(log.coinAfter, "Shop purchase log coinAfter must be a non-negative integer.");
  assertNonNegativeInteger(log.timestamp, "Shop purchase log timestamp must be a non-negative integer.");
  return {
    orderId: log.orderId,
    skuId: log.skuId,
    itemId: log.itemId,
    itemCount: log.itemCount,
    currency: log.currency,
    cost: log.cost,
    coinBefore: log.coinBefore,
    coinAfter: log.coinAfter,
    timestamp: log.timestamp
  };
}

function normalizeState(raw) {
  assertObject(raw, "Shop state must be an object.");
  assertObject(raw.shopState, "Shop state root field `shopState` is required.");
  assertObject(raw.shopState.dailyPurchases, "Shop dailyPurchases is required.");
  assertString(raw.shopState.dailyPurchases.date, "Shop dailyPurchases.date is required.");
  assertObject(raw.shopState.dailyPurchases.skuCounts, "Shop dailyPurchases.skuCounts is required.");

  var skuCounts = {};
  Object.keys(raw.shopState.dailyPurchases.skuCounts).forEach(function (skuId) {
    assertString(skuId, "Shop sku id must be a non-empty string.");
    var count = raw.shopState.dailyPurchases.skuCounts[skuId];
    assertNonNegativeInteger(count, "Shop sku count must be a non-negative integer: " + skuId);
    skuCounts[skuId] = count;
  });

  if (!Array.isArray(raw.shopState.purchaseLogs)) {
    throw new Error("Shop purchaseLogs must be an array.");
  }

  return {
    shopState: {
      dailyPurchases: {
        date: raw.shopState.dailyPurchases.date,
        skuCounts: skuCounts
      },
      purchaseLogs: raw.shopState.purchaseLogs.map(normalizePurchaseLog).slice(-MAX_PURCHASE_LOGS)
    }
  };
}

function createInitialState(dateKey, skuCounts) {
  assertString(dateKey, "Shop initial date key is required.");
  assertObject(skuCounts, "Shop initial skuCounts is required.");
  return normalizeState({
    shopState: {
      dailyPurchases: {
        date: dateKey,
        skuCounts: skuCounts
      },
      purchaseLogs: []
    }
  });
}

function ShopStateStore() {}

ShopStateStore.prototype.load = function (dateKey, skuCounts) {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(dateKey, skuCounts);
  });
  return clone(normalizeState(state));
};

ShopStateStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

ShopStateStore.createInitialState = createInitialState;
ShopStateStore.normalizeState = normalizeState;
ShopStateStore.STORAGE_KEY = STORAGE_KEY;
ShopStateStore.NAMESPACE = NAMESPACE;
ShopStateStore.MAX_PURCHASE_LOGS = MAX_PURCHASE_LOGS;

module.exports = ShopStateStore;
