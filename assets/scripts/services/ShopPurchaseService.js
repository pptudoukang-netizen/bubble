"use strict";

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

function buildOrderId() {
  var time = Date.now();
  var random = Math.floor(Math.random() * 10000);
  return "local_" + time + "_" + ("0000" + random).slice(-4);
}

function ShopPurchaseService(options) {
  assertObject(options, "ShopPurchaseService options are required.");
  if (!options.configService || typeof options.configService.findGoodsBySkuId !== "function") {
    throw new Error("ShopPurchaseService requires ShopConfigService.");
  }
  if (!options.stateService || typeof options.stateService.getRemainingCount !== "function") {
    throw new Error("ShopPurchaseService requires ShopStateService.");
  }
  if (typeof options.getCoinBalance !== "function") {
    throw new Error("ShopPurchaseService requires getCoinBalance.");
  }
  if (typeof options.spendCoin !== "function") {
    throw new Error("ShopPurchaseService requires spendCoin.");
  }
  if (typeof options.refundCoin !== "function") {
    throw new Error("ShopPurchaseService requires refundCoin.");
  }
  if (typeof options.addInventoryItem !== "function") {
    throw new Error("ShopPurchaseService requires addInventoryItem.");
  }

  this.configService = options.configService;
  this.stateService = options.stateService;
  this.getCoinBalance = options.getCoinBalance;
  this.spendCoin = options.spendCoin;
  this.refundCoin = options.refundCoin;
  this.addInventoryItem = options.addInventoryItem;
  this.telemetry = options.telemetry ? options.telemetry : null;
}

ShopPurchaseService.prototype._track = function (eventName, payload) {
  if (this.telemetry && typeof this.telemetry.track === "function") {
    this.telemetry.track(eventName, payload);
  }
};

ShopPurchaseService.prototype.canPurchase = function (skuId, quantity) {
  assertString(skuId, "Shop skuId is required.");
  assertPositiveInteger(quantity, "Shop purchase quantity must be a positive integer.");
  this.stateService.ensureDailyReset();

  var goods = this.configService.findGoodsBySkuId(skuId);
  if (!goods) {
    return {
      accepted: false,
      reason: "SHOP_GOODS_NOT_FOUND"
    };
  }
  if (goods.enabled !== true) {
    return {
      accepted: false,
      reason: "SHOP_GOODS_DISABLED",
      goods: goods
    };
  }

  var remaining = this.stateService.getRemainingCount(skuId);
  if (remaining < quantity) {
    return {
      accepted: false,
      reason: "SHOP_DAILY_LIMIT_REACHED",
      goods: goods,
      remaining: remaining
    };
  }

  var cost = goods.price.amount * quantity;
  var coinBalance = this.getCoinBalance();
  if (coinBalance < cost) {
    return {
      accepted: false,
      reason: "SHOP_COIN_NOT_ENOUGH",
      goods: goods,
      remaining: remaining,
      cost: cost,
      coinBalance: coinBalance
    };
  }

  return {
    accepted: true,
    goods: goods,
    quantity: quantity,
    remaining: remaining,
    cost: cost,
    coinBalance: coinBalance
  };
};

ShopPurchaseService.prototype.purchase = function (skuId, quantity) {
  var check = this.canPurchase(skuId, quantity);
  if (!check.accepted) {
    this._track("shop_purchase_fail", {
      skuId: skuId,
      reason: check.reason
    });
    return check;
  }

  var goods = check.goods;
  var cost = check.cost;
  var coinBefore = check.coinBalance;
  var orderId = buildOrderId();
  var spendResult = this.spendCoin(cost, "buy_powerup");
  if (!spendResult || spendResult.accepted !== true) {
    this._track("shop_purchase_fail", {
      skuId: skuId,
      reason: "SHOP_COIN_NOT_ENOUGH"
    });
    return {
      accepted: false,
      reason: "SHOP_COIN_NOT_ENOUGH",
      goods: goods
    };
  }

  var grantCount = goods.itemCount * quantity;
  var addResult = this.addInventoryItem(goods.itemId, grantCount, "shop_purchase");
  if (!addResult || addResult.accepted !== true) {
    this.refundCoin(cost, "shop_purchase_rollback");
    this._track("shop_purchase_fail", {
      skuId: skuId,
      reason: "SHOP_INVENTORY_ADD_FAILED"
    });
    return {
      accepted: false,
      reason: "SHOP_INVENTORY_ADD_FAILED",
      goods: goods
    };
  }

  this.stateService.increaseDailyPurchasedCount(skuId, quantity);
  var coinAfter = this.getCoinBalance();
  var log = {
    orderId: orderId,
    skuId: skuId,
    itemId: goods.itemId,
    itemCount: grantCount,
    currency: goods.price.currency,
    cost: cost,
    coinBefore: coinBefore,
    coinAfter: coinAfter,
    timestamp: Date.now()
  };
  this.stateService.appendPurchaseLog(log);
  this._track("shop_purchase_success", {
    orderId: orderId,
    skuId: skuId,
    cost: cost,
    coinBefore: coinBefore,
    coinAfter: coinAfter
  });

  return {
    accepted: true,
    orderId: orderId,
    goods: clone(goods),
    quantity: quantity,
    itemCount: grantCount,
    cost: cost,
    coinBefore: coinBefore,
    coinAfter: coinAfter
  };
};

module.exports = ShopPurchaseService;
