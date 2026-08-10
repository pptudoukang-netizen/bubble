"use strict";

var AssistSpiritConfig = require("../config/AssistSpiritConfig");
var SpiritShopConfig = require("../config/SpiritShopConfig");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
}

function requireStore(store, methods, description) {
  if (!store || typeof store !== "object") {
    throw new Error(description + " is required.");
  }
  methods.forEach(function (methodName) {
    if (typeof store[methodName] !== "function") {
      throw new Error(description + " requires `" + methodName + "`.");
    }
  });
  return store;
}

function requireSlotIndex(slotIndex) {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= SpiritShopConfig.FRAGMENT_SLOT_COUNT
  ) {
    throw new Error("Spirit shop fragment slot index is invalid.");
  }
  return slotIndex;
}

function requireRandomFunction(random) {
  if (typeof random !== "function") {
    throw new Error("SpiritShopService random function is required.");
  }
  return random;
}

function requireRandomUnit(value, description) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(description + " must return a number in [0, 1).");
  }
  return value;
}

function getEligibleFragmentBagSpiritIds(assistState) {
  assertObject(assistState, "SpiritShopService assist state");
  assertObject(assistState.spirits, "SpiritShopService assist roster");
  return AssistSpiritConfig.getCatalog().filter(function (spirit) {
    var entry = assistState.spirits[spirit.id];
    assertObject(entry, "SpiritShopService assist state `" + spirit.id + "`");
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > AssistSpiritConfig.MAX_LEVEL) {
      throw new Error("SpiritShopService assist spirit level is invalid: " + spirit.id);
    }
    return entry.level < AssistSpiritConfig.MAX_LEVEL;
  }).map(function (spirit) {
    return spirit.id;
  });
}

function SpiritShopService(options) {
  assertObject(options, "SpiritShopService options");
  this.shopStore = requireStore(
    options.shopStore,
    ["load", "save", "buildManualRefresh", "buildFragmentPurchase", "buildProductPurchase", "appendPurchaseLog"],
    "SpiritShopService shopStore"
  );
  this.playerResourceStore = requireStore(
    options.playerResourceStore,
    ["load", "save", "consumeGems", "addCoins"],
    "SpiritShopService playerResourceStore"
  );
  this.assistSpiritStore = requireStore(
    options.assistSpiritStore,
    ["load", "save", "buildAddFragments"],
    "SpiritShopService assistSpiritStore"
  );
  this.random = requireRandomFunction(options.random);
}

SpiritShopService.prototype._appendLog = function (shopState, type, targetId, cost, gemBefore, gemAfter, now) {
  var timestamp = (now instanceof Date ? now : new Date()).getTime();
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error("Spirit shop purchase timestamp is invalid.");
  }
  return this.shopStore.appendPurchaseLog(shopState, {
    type: type,
    targetId: targetId,
    cost: cost,
    gemBefore: gemBefore,
    gemAfter: gemAfter,
    timestamp: timestamp
  });
};

SpiritShopService.prototype.getSnapshot = function (now) {
  var resources = this.playerResourceStore.load(now);
  var assistState = this.assistSpiritStore.load();
  var shopState = this.shopStore.load(now);
  var eligibleFragmentBagSpiritIds = getEligibleFragmentBagSpiritIds(assistState);
  var offers = shopState.fragmentOfferSpiritIds.map(function (spiritId, slotIndex) {
    var spirit = AssistSpiritConfig.getSpirit(spiritId);
    return {
      slotIndex: slotIndex,
      spiritId: spirit.id,
      displayName: spirit.displayName + "碎片",
      quantity: SpiritShopConfig.FRAGMENT_QUANTITY,
      price: SpiritShopConfig.FRAGMENT_PRICE,
      soldOut: shopState.purchasedFragmentSlots.indexOf(slotIndex) >= 0,
      presentation: SpiritShopConfig.getFragmentPresentation(spirit.id),
      ownedFragments: assistState.spirits[spirit.id].fragments
    };
  });
  var products = SpiritShopConfig.getProducts().map(function (product) {
    var purchasedCount = shopState.dailySkuCounts[product.skuId];
    var availability = "available";
    if (purchasedCount >= product.dailyLimit) {
      availability = "daily_limit_reached";
    } else if (product.kind === "random_fragments" && eligibleFragmentBagSpiritIds.length === 0) {
      availability = "all_spirits_max_level";
    }
    return {
      skuId: product.skuId,
      displayName: product.displayName,
      kind: product.kind,
      grantItemId: product.grantItemId,
      grantCount: product.grantCount,
      price: product.price,
      dailyLimit: product.dailyLimit,
      purchasedCount: purchasedCount,
      availability: availability,
      ownedCount: product.kind === "inventory"
        ? shopState.inventory[product.grantItemId]
        : 0
    };
  });
  return {
    resources: clone(resources),
    assistState: clone(assistState),
    shopState: clone(shopState),
    fragmentOffers: offers,
    products: products,
    refreshPrice: SpiritShopConfig.MANUAL_REFRESH_PRICE
  };
};

SpiritShopService.prototype.purchaseFragment = function (slotIndex, now) {
  var safeSlotIndex = requireSlotIndex(slotIndex);
  var resourcesBefore = this.playerResourceStore.load(now);
  var assistBefore = this.assistSpiritStore.load();
  var shopBefore = this.shopStore.load(now);
  var shopPurchase = this.shopStore.buildFragmentPurchase(shopBefore, safeSlotIndex);
  if (shopPurchase.accepted !== true) {
    return shopPurchase;
  }
  var spend = this.playerResourceStore.consumeGems(resourcesBefore, SpiritShopConfig.FRAGMENT_PRICE);
  if (spend.accepted !== true) {
    return {
      accepted: false,
      reason: spend.reason,
      cost: SpiritShopConfig.FRAGMENT_PRICE
    };
  }
  var spiritId = shopBefore.fragmentOfferSpiritIds[safeSlotIndex];
  var fragmentGrant = this.assistSpiritStore.buildAddFragments(
    assistBefore,
    spiritId,
    SpiritShopConfig.FRAGMENT_QUANTITY
  );
  var nextShopState = this._appendLog(
    shopPurchase.state,
    "fragment",
    spiritId,
    SpiritShopConfig.FRAGMENT_PRICE,
    resourcesBefore.gems,
    spend.resources.gems,
    now
  );
  this.playerResourceStore.save(spend.resources);
  this.assistSpiritStore.save(fragmentGrant.state);
  this.shopStore.save(nextShopState);
  return {
    accepted: true,
    spiritId: spiritId,
    quantity: SpiritShopConfig.FRAGMENT_QUANTITY,
    cost: SpiritShopConfig.FRAGMENT_PRICE,
    gemBefore: resourcesBefore.gems,
    gemAfter: spend.resources.gems,
    totalFragments: fragmentGrant.total
  };
};

SpiritShopService.prototype.purchaseProduct = function (skuId, now) {
  var product = SpiritShopConfig.getProduct(skuId);
  var resourcesBefore = this.playerResourceStore.load(now);
  var assistBefore = this.assistSpiritStore.load();
  var shopBefore = this.shopStore.load(now);
  var shopPurchase = this.shopStore.buildProductPurchase(shopBefore, product.skuId);
  if (shopPurchase.accepted !== true) {
    return shopPurchase;
  }
  var eligibleFragmentBagSpiritIds = null;
  if (product.kind === "random_fragments") {
    eligibleFragmentBagSpiritIds = getEligibleFragmentBagSpiritIds(assistBefore);
    if (eligibleFragmentBagSpiritIds.length === 0) {
      return {
        accepted: false,
        reason: "ALL_SPIRITS_MAX_LEVEL",
        product: product,
        cost: product.price
      };
    }
  }
  var spend = this.playerResourceStore.consumeGems(resourcesBefore, product.price);
  if (spend.accepted !== true) {
    return {
      accepted: false,
      reason: spend.reason,
      product: product,
      cost: product.price
    };
  }
  var grantedResources = spend.resources;
  var fragmentGrant = null;
  if (product.kind === "coins") {
    grantedResources = this.playerResourceStore.addCoins(
      grantedResources,
      product.grantCount
    ).resources;
  } else if (product.kind === "random_fragments") {
    var spiritRoll = requireRandomUnit(this.random(), "SpiritShopService fragment bag spirit roll");
    var quantityRoll = requireRandomUnit(this.random(), "SpiritShopService fragment bag quantity roll");
    var spiritIndex = Math.floor(spiritRoll * eligibleFragmentBagSpiritIds.length);
    var grantedSpiritId = eligibleFragmentBagSpiritIds[spiritIndex];
    var grantedQuantity = SpiritShopConfig.resolveFragmentBagQuantity(quantityRoll);
    fragmentGrant = this.assistSpiritStore.buildAddFragments(
      assistBefore,
      grantedSpiritId,
      grantedQuantity
    );
  } else if (product.kind !== "inventory") {
    throw new Error("Unsupported spirit shop product kind: " + product.kind);
  }
  var nextShopState = this._appendLog(
    shopPurchase.state,
    "product",
    product.skuId,
    product.price,
    resourcesBefore.gems,
    grantedResources.gems,
    now
  );
  this.playerResourceStore.save(grantedResources);
  if (fragmentGrant) {
    this.assistSpiritStore.save(fragmentGrant.state);
  }
  this.shopStore.save(nextShopState);
  var result = {
    accepted: true,
    product: product,
    cost: product.price,
    gemBefore: resourcesBefore.gems,
    gemAfter: grantedResources.gems,
    grantedCount: fragmentGrant ? fragmentGrant.gained : product.grantCount
  };
  if (fragmentGrant) {
    result.spiritId = fragmentGrant.spiritId;
    result.spiritDisplayName = AssistSpiritConfig.getSpirit(fragmentGrant.spiritId).displayName;
    result.quantity = fragmentGrant.gained;
    result.totalFragments = fragmentGrant.total;
  }
  return result;
};

SpiritShopService.prototype.manualRefresh = function (now) {
  var resourcesBefore = this.playerResourceStore.load(now);
  var shopBefore = this.shopStore.load(now);
  var spend = this.playerResourceStore.consumeGems(
    resourcesBefore,
    SpiritShopConfig.MANUAL_REFRESH_PRICE
  );
  if (spend.accepted !== true) {
    return {
      accepted: false,
      reason: spend.reason,
      cost: SpiritShopConfig.MANUAL_REFRESH_PRICE
    };
  }
  var refreshedState = this.shopStore.buildManualRefresh(shopBefore);
  refreshedState = this._appendLog(
    refreshedState,
    "refresh",
    "fragment_offers",
    SpiritShopConfig.MANUAL_REFRESH_PRICE,
    resourcesBefore.gems,
    spend.resources.gems,
    now
  );
  this.playerResourceStore.save(spend.resources);
  this.shopStore.save(refreshedState);
  return {
    accepted: true,
    cost: SpiritShopConfig.MANUAL_REFRESH_PRICE,
    gemBefore: resourcesBefore.gems,
    gemAfter: spend.resources.gems,
    refreshCount: refreshedState.refreshCount,
    fragmentOfferSpiritIds: refreshedState.fragmentOfferSpiritIds.slice()
  };
};

module.exports = SpiritShopService;
