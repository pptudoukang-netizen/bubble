"use strict";

var STORAGE_KEY = "bubble_shop_state_v1";

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
      purchaseLogs: raw.shopState.purchaseLogs.map(normalizePurchaseLog)
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

function resolveStorage() {
  if (typeof cc === "undefined" || !cc.sys || !cc.sys.localStorage) {
    throw new Error("ShopStateStore requires cc.sys.localStorage.");
  }
  return cc.sys.localStorage;
}

function ShopStateStore() {}

ShopStateStore.prototype.load = function (dateKey, skuCounts) {
  var storage = resolveStorage();
  var rawText = storage.getItem(STORAGE_KEY);
  if (rawText === null) {
    var initialState = createInitialState(dateKey, skuCounts);
    this.save(initialState);
    return clone(initialState);
  }

  if (typeof rawText !== "string") {
    throw new Error("Shop state storage value must be a string.");
  }

  var serializedText = rawText.trim();
  if (serializedText.length === 0) {
    throw new Error("Shop state storage JSON must not be empty.");
  }

  var parsed = null;
  try {
    parsed = JSON.parse(serializedText);
  } catch (error) {
    throw new Error("Shop state storage JSON is invalid: " + error.message);
  }

  return clone(normalizeState(parsed));
};

ShopStateStore.prototype.save = function (state) {
  var storage = resolveStorage();
  var normalized = normalizeState(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

ShopStateStore.createInitialState = createInitialState;

module.exports = ShopStateStore;
