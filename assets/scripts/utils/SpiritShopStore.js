"use strict";

var StrictStorage = require("./StrictStorage");
var SpiritShopConfig = require("../config/SpiritShopConfig");

var STORAGE_KEY = "bubble_spirit_shop_state_v1";
var NAMESPACE = "SpiritShopStore";
var VERSION = 4;
var FRAGMENT_BAG_MIGRATION_VERSION = 2;
var FRAGMENT_LIST_ROTATION_VERSION = 3;
var LEGACY_FRAGMENT_BAG_SKU_ID = "blue_potion_bag";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function requireString(value, description) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(description + " must be a non-empty string.");
  }
  return value;
}

function requireValidDate(now) {
  var date = now === undefined ? new Date() : now;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Spirit shop date must be valid.");
  }
  return date;
}

function toBusinessDateKey(now) {
  var date = new Date(requireValidDate(now).getTime());
  if (date.getHours() < SpiritShopConfig.DAILY_RESET_HOUR) {
    date.setDate(date.getDate() - 1);
  }
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return [
    String(date.getFullYear()),
    month < 10 ? "0" + month : String(month),
    day < 10 ? "0" + day : String(day)
  ].join("-");
}

function createZeroMap(keys) {
  var result = {};
  keys.forEach(function (key) {
    result[key] = 0;
  });
  return result;
}

function createInitialState(now) {
  var dateKey = toBusinessDateKey(now);
  return {
    version: VERSION,
    businessDate: dateKey,
    refreshCount: 0,
    fragmentOfferSpiritIds: SpiritShopConfig.buildFragmentOfferSpiritIds(dateKey, 0),
    purchasedFragmentSlots: [],
    dailySkuCounts: createZeroMap(SpiritShopConfig.getProducts().map(function (product) {
      return product.skuId;
    })),
    inventory: createZeroMap(SpiritShopConfig.getInventoryItemIds()),
    purchaseLogs: []
  };
}

function normalizeExactCountMap(rawMap, expectedKeys, description) {
  assertObject(rawMap, description);
  var rawKeys = Object.keys(rawMap);
  if (
    rawKeys.length !== expectedKeys.length ||
    rawKeys.some(function (key) {
      return expectedKeys.indexOf(key) < 0;
    })
  ) {
    throw new Error(description + " keys must exactly match configured ids.");
  }
  var normalized = {};
  expectedKeys.forEach(function (key) {
    normalized[key] = requireNonNegativeInteger(rawMap[key], description + " `" + key + "`");
  });
  return normalized;
}

function migrateVersion1State(rawState) {
  assertObject(rawState.dailySkuCounts, "Spirit shop v1 dailySkuCounts");
  if (!Object.prototype.hasOwnProperty.call(rawState.dailySkuCounts, LEGACY_FRAGMENT_BAG_SKU_ID)) {
    throw new Error("Spirit shop v1 dailySkuCounts is missing blue_potion_bag.");
  }
  if (Object.prototype.hasOwnProperty.call(rawState.dailySkuCounts, SpiritShopConfig.FRAGMENT_BAG_SKU_ID)) {
    throw new Error("Spirit shop v1 dailySkuCounts must not contain fragment_bag.");
  }
  var migrated = clone(rawState);
  migrated.version = FRAGMENT_BAG_MIGRATION_VERSION;
  migrated.dailySkuCounts[SpiritShopConfig.FRAGMENT_BAG_SKU_ID] = requireNonNegativeInteger(
    migrated.dailySkuCounts[LEGACY_FRAGMENT_BAG_SKU_ID],
    "Spirit shop v1 blue_potion_bag count"
  );
  delete migrated.dailySkuCounts[LEGACY_FRAGMENT_BAG_SKU_ID];
  return migrated;
}

function migrateVersion2State(rawState) {
  if (!Array.isArray(rawState.fragmentOfferSpiritIds) || rawState.fragmentOfferSpiritIds.length !== 6) {
    throw new Error("Spirit shop v2 fragment offers must contain exactly six spirit ids.");
  }
  var migrated = clone(rawState);
  var catalogIds = SpiritShopConfig.buildFragmentOfferSpiritIds(
    migrated.businessDate,
    migrated.refreshCount
  );
  var legacyOffers = migrated.fragmentOfferSpiritIds;
  var seenSpiritIds = {};
  legacyOffers.forEach(function (spiritId) {
    SpiritShopConfig.getFragmentPresentation(spiritId);
    if (seenSpiritIds[spiritId]) {
      throw new Error("Spirit shop v2 fragment offers must not contain duplicate spirit ids.");
    }
    seenSpiritIds[spiritId] = true;
  });
  var missingSpiritIds = catalogIds.filter(function (spiritId) {
    return !seenSpiritIds[spiritId];
  });
  if (missingSpiritIds.length !== 1) {
    throw new Error("Spirit shop v2 fragment offers must omit exactly one configured spirit.");
  }
  migrated.version = FRAGMENT_LIST_ROTATION_VERSION;
  migrated.fragmentOfferSpiritIds = legacyOffers.concat(missingSpiritIds);
  return migrated;
}

function migrateVersion3State(rawState) {
  if (!Array.isArray(rawState.fragmentOfferSpiritIds) || rawState.fragmentOfferSpiritIds.length !== 7) {
    throw new Error("Spirit shop v3 fragment offers must contain exactly seven spirit ids.");
  }
  if (!Array.isArray(rawState.purchasedFragmentSlots)) {
    throw new Error("Spirit shop v3 purchasedFragmentSlots must be an array.");
  }
  var migrated = clone(rawState);
  var stableOfferSpiritIds = SpiritShopConfig.buildFragmentOfferSpiritIds(
    migrated.businessDate,
    migrated.refreshCount
  );
  var seenSpiritIds = {};
  migrated.fragmentOfferSpiritIds.forEach(function (spiritId) {
    SpiritShopConfig.getFragmentPresentation(spiritId);
    if (seenSpiritIds[spiritId]) {
      throw new Error("Spirit shop v3 fragment offers must not contain duplicate spirit ids.");
    }
    seenSpiritIds[spiritId] = true;
  });
  if (Object.keys(seenSpiritIds).length !== stableOfferSpiritIds.length) {
    throw new Error("Spirit shop v3 fragment offers must contain every configured spirit.");
  }
  migrated.purchasedFragmentSlots = migrated.purchasedFragmentSlots.map(function (slotIndex) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= migrated.fragmentOfferSpiritIds.length) {
      throw new Error("Spirit shop v3 purchased fragment slot is invalid.");
    }
    var stableSlotIndex = stableOfferSpiritIds.indexOf(migrated.fragmentOfferSpiritIds[slotIndex]);
    if (stableSlotIndex < 0) {
      throw new Error("Spirit shop v3 purchased fragment spirit is not configured.");
    }
    return stableSlotIndex;
  }).sort(function (left, right) {
    return left - right;
  });
  migrated.version = VERSION;
  migrated.fragmentOfferSpiritIds = stableOfferSpiritIds;
  return migrated;
}

function normalizeState(rawState) {
  assertObject(rawState, "Spirit shop state");
  if (rawState.version === 1) {
    rawState = migrateVersion1State(rawState);
  }
  if (rawState.version === FRAGMENT_BAG_MIGRATION_VERSION) {
    rawState = migrateVersion2State(rawState);
  }
  if (rawState.version === FRAGMENT_LIST_ROTATION_VERSION) {
    rawState = migrateVersion3State(rawState);
  }
  if (rawState.version !== VERSION) {
    throw new Error("Spirit shop state version must be " + VERSION + ".");
  }
  var businessDate = requireString(rawState.businessDate, "Spirit shop businessDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("Spirit shop businessDate must use YYYY-MM-DD.");
  }
  var refreshCount = requireNonNegativeInteger(rawState.refreshCount, "Spirit shop refresh count");
  if (
    !Array.isArray(rawState.fragmentOfferSpiritIds) ||
    rawState.fragmentOfferSpiritIds.length !== SpiritShopConfig.FRAGMENT_SLOT_COUNT
  ) {
    throw new Error("Spirit shop fragment offers must contain exactly seven spirit ids.");
  }
  var seenSpiritIds = {};
  var fragmentOfferSpiritIds = rawState.fragmentOfferSpiritIds.map(function (spiritId) {
    SpiritShopConfig.getFragmentPresentation(spiritId);
    if (seenSpiritIds[spiritId]) {
      throw new Error("Spirit shop fragment offers must not contain duplicate spirit ids.");
    }
    seenSpiritIds[spiritId] = true;
    return spiritId;
  });
  var expectedOffers = SpiritShopConfig.buildFragmentOfferSpiritIds(businessDate, refreshCount);
  if (JSON.stringify(fragmentOfferSpiritIds) !== JSON.stringify(expectedOffers)) {
    throw new Error("Spirit shop fragment offers do not match the stable catalog order.");
  }
  if (!Array.isArray(rawState.purchasedFragmentSlots)) {
    throw new Error("Spirit shop purchasedFragmentSlots must be an array.");
  }
  var seenSlots = {};
  var purchasedFragmentSlots = rawState.purchasedFragmentSlots.map(function (slotIndex) {
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 0 ||
      slotIndex >= SpiritShopConfig.FRAGMENT_SLOT_COUNT
    ) {
      throw new Error("Spirit shop purchased fragment slot is invalid.");
    }
    if (seenSlots[slotIndex]) {
      throw new Error("Spirit shop purchased fragment slots must be unique.");
    }
    seenSlots[slotIndex] = true;
    return slotIndex;
  }).sort(function (a, b) {
    return a - b;
  });
  var productIds = SpiritShopConfig.getProducts().map(function (product) {
    return product.skuId;
  });
  var inventoryIds = SpiritShopConfig.getInventoryItemIds();
  if (!Array.isArray(rawState.purchaseLogs)) {
    throw new Error("Spirit shop purchaseLogs must be an array.");
  }
  if (rawState.purchaseLogs.length > SpiritShopConfig.MAX_PURCHASE_LOGS) {
    throw new Error("Spirit shop purchaseLogs exceeds configured maximum.");
  }
  var purchaseLogs = rawState.purchaseLogs.map(function (log, index) {
    assertObject(log, "Spirit shop purchase log " + index);
    var type = requireString(log.type, "Spirit shop purchase log type");
    if (type !== "fragment" && type !== "product" && type !== "refresh") {
      throw new Error("Spirit shop purchase log type is invalid: " + type);
    }
    return {
      type: type,
      targetId: requireString(log.targetId, "Spirit shop purchase log targetId"),
      cost: requireNonNegativeInteger(log.cost, "Spirit shop purchase log cost"),
      gemBefore: requireNonNegativeInteger(log.gemBefore, "Spirit shop purchase log gemBefore"),
      gemAfter: requireNonNegativeInteger(log.gemAfter, "Spirit shop purchase log gemAfter"),
      timestamp: requireNonNegativeInteger(log.timestamp, "Spirit shop purchase log timestamp")
    };
  });
  return {
    version: VERSION,
    businessDate: businessDate,
    refreshCount: refreshCount,
    fragmentOfferSpiritIds: fragmentOfferSpiritIds,
    purchasedFragmentSlots: purchasedFragmentSlots,
    dailySkuCounts: normalizeExactCountMap(rawState.dailySkuCounts, productIds, "Spirit shop dailySkuCounts"),
    inventory: normalizeExactCountMap(rawState.inventory, inventoryIds, "Spirit shop inventory"),
    purchaseLogs: purchaseLogs
  };
}

function SpiritShopStore() {}

SpiritShopStore.prototype.load = function (now) {
  var date = requireValidDate(now);
  var rawState = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(date);
  });
  var normalized = normalizeState(rawState);
  var currentDateKey = toBusinessDateKey(date);
  var requiresSave = JSON.stringify(rawState) !== JSON.stringify(normalized);
  if (normalized.businessDate !== currentDateKey) {
    normalized.businessDate = currentDateKey;
    normalized.refreshCount = 0;
    normalized.fragmentOfferSpiritIds = SpiritShopConfig.buildFragmentOfferSpiritIds(currentDateKey, 0);
    normalized.purchasedFragmentSlots = [];
    normalized.dailySkuCounts = createZeroMap(SpiritShopConfig.getProducts().map(function (product) {
      return product.skuId;
    }));
    requiresSave = true;
  }
  if (requiresSave) {
    this.save(normalized);
  }
  return clone(normalized);
};

SpiritShopStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  return clone(normalized);
};

SpiritShopStore.prototype.buildManualRefresh = function (state) {
  var normalized = normalizeState(state);
  normalized.refreshCount += 1;
  normalized.fragmentOfferSpiritIds = SpiritShopConfig.buildFragmentOfferSpiritIds(
    normalized.businessDate,
    normalized.refreshCount
  );
  normalized.purchasedFragmentSlots = [];
  return clone(normalized);
};

SpiritShopStore.prototype.buildFragmentPurchase = function (state, slotIndex) {
  var normalized = normalizeState(state);
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= SpiritShopConfig.FRAGMENT_SLOT_COUNT
  ) {
    throw new Error("Spirit shop fragment slot index is invalid.");
  }
  if (normalized.purchasedFragmentSlots.indexOf(slotIndex) >= 0) {
    return {
      accepted: false,
      reason: "FRAGMENT_OFFER_SOLD_OUT",
      state: clone(normalized)
    };
  }
  normalized.purchasedFragmentSlots.push(slotIndex);
  normalized.purchasedFragmentSlots.sort(function (a, b) {
    return a - b;
  });
  return {
    accepted: true,
    state: clone(normalized)
  };
};

SpiritShopStore.prototype.buildProductPurchase = function (state, skuId) {
  var normalized = normalizeState(state);
  var product = SpiritShopConfig.getProduct(skuId);
  var purchasedCount = normalized.dailySkuCounts[product.skuId];
  if (purchasedCount >= product.dailyLimit) {
    return {
      accepted: false,
      reason: "PRODUCT_DAILY_LIMIT_REACHED",
      product: product,
      state: clone(normalized)
    };
  }
  normalized.dailySkuCounts[product.skuId] = purchasedCount + 1;
  if (product.kind === "inventory") {
    normalized.inventory[product.grantItemId] += product.grantCount;
  }
  return {
    accepted: true,
    product: product,
    state: clone(normalized)
  };
};

SpiritShopStore.prototype.appendPurchaseLog = function (state, log) {
  var normalized = normalizeState(state);
  normalized.purchaseLogs.push(log);
  if (normalized.purchaseLogs.length > SpiritShopConfig.MAX_PURCHASE_LOGS) {
    normalized.purchaseLogs = normalized.purchaseLogs.slice(
      normalized.purchaseLogs.length - SpiritShopConfig.MAX_PURCHASE_LOGS
    );
  }
  return normalizeState(normalized);
};

SpiritShopStore.STORAGE_KEY = STORAGE_KEY;
SpiritShopStore.NAMESPACE = NAMESPACE;
SpiritShopStore.VERSION = VERSION;
SpiritShopStore.createInitialState = createInitialState;
SpiritShopStore.normalizeState = normalizeState;
SpiritShopStore.toBusinessDateKey = toBusinessDateKey;

module.exports = SpiritShopStore;
