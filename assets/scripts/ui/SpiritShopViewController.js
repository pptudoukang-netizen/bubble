"use strict";

var SpiritShopConfig = require("../config/SpiritShopConfig");

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function collectNamedNodes(rootNode, nodeMap) {
  requireValidNode(rootNode, "SpiritShopView traversal root");
  if (Object.prototype.hasOwnProperty.call(nodeMap, rootNode.name)) {
    throw new Error("SpiritShopView contains duplicate node name: " + rootNode.name);
  }
  nodeMap[rootNode.name] = rootNode;
  rootNode.children.forEach(function (childNode) {
    collectNamedNodes(childNode, nodeMap);
  });
}

function requireNamedNode(nodeMap, nodeName) {
  var node = nodeMap[nodeName];
  if (!node || !node.isValid) {
    throw new Error("SpiritShopView node is required: " + nodeName);
  }
  return node;
}

function requireLabel(nodeMap, nodeName) {
  var label = requireNamedNode(nodeMap, nodeName).getComponent(cc.Label);
  if (!label) {
    throw new Error("SpiritShopView label component is required: " + nodeName);
  }
  return label;
}

function requireSprite(nodeMap, nodeName) {
  var sprite = requireNamedNode(nodeMap, nodeName).getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("SpiritShopView sprite component is required: " + nodeName);
  }
  return sprite;
}

function requireCallback(options, key) {
  if (typeof options[key] !== "function") {
    throw new Error("SpiritShopViewController requires " + key + ".");
  }
  return options[key];
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function formatInteger(value) {
  return String(requireNonNegativeInteger(value, "Spirit shop display integer"))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCoinValue(value) {
  var coins = requireNonNegativeInteger(value, "Spirit shop coin value");
  if (coins < 10000) {
    return formatInteger(coins);
  }
  var tenThousands = Math.floor(coins / 1000) / 10;
  return String(tenThousands).replace(/\.0$/, "") + "万";
}

function SpiritShopViewController(options) {
  assertObject(options, "SpiritShopViewController options");
  this.node = requireValidNode(options.node, "SpiritShopViewController node");
  this.onClose = requireCallback(options, "onClose");
  this.onOpenHall = requireCallback(options, "onOpenHall");
  this.onUnavailableTab = requireCallback(options, "onUnavailableTab");
  this.onRefresh = requireCallback(options, "onRefresh");
  this.onBuyFragment = requireCallback(options, "onBuyFragment");
  this.onBuyProduct = requireCallback(options, "onBuyProduct");
  assertObject(options.spriteFrameCache, "SpiritShopViewController spriteFrameCache");
  this.spriteFrameCache = options.spriteFrameCache;
  this.nodeMap = {};
  collectNamedNodes(this.node, this.nodeMap);
  this._bindFragmentOfferScroll();
  this._bindActions();
}

SpiritShopViewController.prototype._bindFragmentOfferScroll = function () {
  var scrollNode = requireNamedNode(this.nodeMap, "fragment_offer_scroll_viewport");
  var scrollView = scrollNode.getComponent(cc.ScrollView);
  if (!scrollView) {
    throw new Error("SpiritShopView fragment offer list requires cc.ScrollView.");
  }
  var sourceContent = requireNamedNode(this.nodeMap, "fragment_offer_scroll_content");
  if (scrollView.content !== sourceContent) {
    throw new Error("SpiritShopView fragment offer ScrollView.content is invalid.");
  }
  if (!scrollView.horizontal || scrollView.vertical) {
    throw new Error("SpiritShopView fragment offer list must scroll horizontally only.");
  }
  if (!cc.Node.EventType || !cc.Node.EventType.POSITION_CHANGED) {
    throw new Error("SpiritShopView requires cc.Node.EventType.POSITION_CHANGED.");
  }
  this._fragmentOfferScroll = {
    scrollView: scrollView,
    sourceContent: sourceContent,
    proxyContent: requireNamedNode(this.nodeMap, "fragment_offer_proxy_content"),
    textContent: requireNamedNode(this.nodeMap, "fragment_offer_text_content")
  };
  sourceContent.on(cc.Node.EventType.POSITION_CHANGED, this._syncFragmentOfferScrollRender, this);
  this._syncFragmentOfferScrollRender();
  if (typeof scrollView.stopAutoScroll !== "function" || typeof scrollView.scrollToLeft !== "function") {
    throw new Error("SpiritShopView fragment offer list requires horizontal scroll APIs.");
  }
  scrollView.stopAutoScroll();
  scrollView.scrollToLeft(0);
  this._syncFragmentOfferScrollRender();
};

SpiritShopViewController.prototype._syncFragmentOfferScrollRender = function () {
  if (!this._fragmentOfferScroll) {
    throw new Error("SpiritShopView fragment offer scroll state is required.");
  }
  var sourceContent = requireValidNode(
    this._fragmentOfferScroll.sourceContent,
    "SpiritShopView fragment offer source content"
  );
  var position = sourceContent.getPosition();
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("SpiritShopView fragment offer content position is invalid.");
  }
  [this._fragmentOfferScroll.proxyContent, this._fragmentOfferScroll.textContent].forEach(function (contentNode) {
    requireValidNode(contentNode, "SpiritShopView fragment offer render content").setPosition(position);
  });
};

SpiritShopViewController.prototype._bindButton = function (nodeName, callback) {
  var node = requireNamedNode(this.nodeMap, nodeName);
  if (!node.getComponent(cc.Button)) {
    throw new Error("SpiritShopView button component is required: " + nodeName);
  }
  node.on("click", callback, this);
};

SpiritShopViewController.prototype._bindActions = function () {
  this._bindButton("source__back_button", function () {
    this.onClose();
  });
  this._bindButton("source__hall_tab", function () {
    this.onOpenHall();
  });
  this._bindButton("source__shop_tab", function () {
    this.render(this.snapshot);
  });
  [
    "source__home_tab",
    "source__bond_tab",
    "source__growth_tab"
  ].forEach(function (nodeName) {
    this._bindButton(nodeName, function () {
      this.onUnavailableTab();
    });
  }, this);
  this._bindButton("source__fragment_refresh_button", function () {
    this.onRefresh();
  });
  for (var slotIndex = 0; slotIndex < SpiritShopConfig.FRAGMENT_SLOT_COUNT; slotIndex += 1) {
    (function (capturedSlotIndex) {
      this._bindButton(
        "source__fragment_offer_" + (capturedSlotIndex + 1) + "_buy_button",
        function () {
          this.onBuyFragment(capturedSlotIndex);
        }
      );
    }.bind(this))(slotIndex);
  }
  SpiritShopConfig.getProducts().forEach(function (product) {
    this._bindButton("source__" + product.skuId + "_card", function () {
      this.onBuyProduct(product.skuId);
    });
  }, this);
};

SpiritShopViewController.prototype._setLabel = function (nodeName, value) {
  requireLabel(this.nodeMap, nodeName).string = String(value);
};

SpiritShopViewController.prototype._setButtonInteractable = function (nodeName, interactable) {
  if (typeof interactable !== "boolean") {
    throw new Error("SpiritShopView button interactable must be boolean: " + nodeName);
  }
  var button = requireNamedNode(this.nodeMap, nodeName).getComponent(cc.Button);
  if (!button) {
    throw new Error("SpiritShopView button component is required: " + nodeName);
  }
  button.interactable = interactable;
  if (!button.target || !button.target.isValid) {
    throw new Error("SpiritShopView button target is required: " + nodeName);
  }
  button.target.opacity = interactable ? 255 : 140;
};

SpiritShopViewController.prototype._setSpriteFramePair = function (artName, resourcePath) {
  if (typeof resourcePath !== "string" || resourcePath.length === 0) {
    throw new Error("SpiritShopView sprite resource path is required: " + artName);
  }
  var spriteFrame = this.spriteFrameCache[resourcePath];
  if (!spriteFrame || !cc.isValid(spriteFrame)) {
    throw new Error("SpiritShopView SpriteFrame is not loaded: " + resourcePath);
  }
  if (typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error("SpiritShopView SpriteFrame.getOriginalSize is required: " + resourcePath);
  }
  var originalSize = spriteFrame.getOriginalSize();
  if (
    !originalSize ||
    !Number.isFinite(originalSize.width) ||
    originalSize.width <= 0 ||
    !Number.isFinite(originalSize.height) ||
    originalSize.height <= 0
  ) {
    throw new Error("SpiritShopView SpriteFrame original size is invalid: " + resourcePath);
  }
  if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.RAW === undefined) {
    throw new Error("SpiritShopView requires cc.Sprite.SizeMode.RAW.");
  }
  ["source__", "proxy__"].forEach(function (prefix) {
    var nodeName = prefix + artName;
    var node = requireNamedNode(this.nodeMap, nodeName);
    var sprite = requireSprite(this.nodeMap, nodeName);
    sprite.spriteFrame = spriteFrame;
    sprite.sizeMode = cc.Sprite.SizeMode.RAW;
    sprite.trim = false;
    node.setContentSize(originalSize.width, originalSize.height);
  }, this);
};

SpiritShopViewController.prototype._renderFragmentOffers = function (offers) {
  if (!Array.isArray(offers) || offers.length !== SpiritShopConfig.FRAGMENT_SLOT_COUNT) {
    throw new Error("SpiritShopView requires exactly seven fragment offers.");
  }
  offers.forEach(function (offer, slotIndex) {
    assertObject(offer, "SpiritShopView fragment offer");
    if (offer.slotIndex !== slotIndex) {
      throw new Error("SpiritShopView fragment offer slot order is invalid.");
    }
    var key = "fragment_offer_" + (slotIndex + 1);
    this._setLabel(key + "_name", offer.displayName);
    this._setLabel(key + "_quantity", "x" + formatInteger(offer.quantity));
    this._setLabel(key + "_price", offer.soldOut ? "已售" : formatInteger(offer.price));
    this._setSpriteFramePair(key + "_slot", offer.presentation.slotPath);
    this._setSpriteFramePair(key + "_art", offer.presentation.fragmentPath);
    this._setButtonInteractable("source__" + key + "_buy_button", !offer.soldOut);
  }, this);
};

SpiritShopViewController.prototype._renderProducts = function (products) {
  if (!Array.isArray(products) || products.length !== SpiritShopConfig.getProducts().length) {
    throw new Error("SpiritShopView product snapshot is incomplete.");
  }
  var productMap = {};
  products.forEach(function (product) {
    assertObject(product, "SpiritShopView product");
    productMap[product.skuId] = product;
  });
  SpiritShopConfig.getProducts().forEach(function (configuredProduct) {
    var product = productMap[configuredProduct.skuId];
    if (!product) {
      throw new Error("SpiritShopView product is missing: " + configuredProduct.skuId);
    }
    var title = configuredProduct.displayName;
    if (configuredProduct.kind === "inventory") {
      title += " x" + formatInteger(product.ownedCount);
    }
    this._setLabel(configuredProduct.skuId + "_title", title);
    var priceText;
    if (product.availability === "available") {
      priceText = formatInteger(configuredProduct.price);
    } else if (product.availability === "daily_limit_reached") {
      priceText = "已售";
    } else if (product.availability === "all_spirits_max_level") {
      priceText = "已满级";
    } else {
      throw new Error("SpiritShopView product availability is invalid: " + configuredProduct.skuId);
    }
    this._setLabel(
      configuredProduct.skuId + "_price",
      priceText
    );
    this._setButtonInteractable(
      "source__" + configuredProduct.skuId + "_card",
      product.availability === "available"
    );
  }, this);
};

SpiritShopViewController.prototype.render = function (snapshot) {
  assertObject(snapshot, "SpiritShopView snapshot");
  assertObject(snapshot.resources, "SpiritShopView resources");
  requireNonNegativeInteger(snapshot.resources.coins, "SpiritShopView coins");
  requireNonNegativeInteger(snapshot.resources.gems, "SpiritShopView gems");
  requireNonNegativeInteger(snapshot.refreshPrice, "SpiritShopView refresh price");
  this.snapshot = JSON.parse(JSON.stringify(snapshot));
  this._setLabel("coin_value", formatCoinValue(snapshot.resources.coins));
  this._setLabel("gem_value", formatInteger(snapshot.resources.gems));
  this._setLabel("fragment_refresh_cost", formatInteger(snapshot.refreshPrice));
  this._renderFragmentOffers(snapshot.fragmentOffers);
  this._renderProducts(snapshot.products);
};

module.exports = SpiritShopViewController;
