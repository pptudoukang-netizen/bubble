"use strict";

var BundleLoader = require("../utils/BundleLoader");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var BUY_ICON_WIDTH = 143;
var BUY_RENDER_PROXY_ROOT_NAME = "buy_render_proxy_root";
var BUY_RENDER_PROXY_LAYER_NAMES = {
  background: "buy_proxy_background_layer",
  item: "buy_proxy_item_layer",
  control: "buy_proxy_control_layer"
};

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertFunction(value, message) {
  if (typeof value !== "function") {
    throw new Error(message);
  }
}

function requireNonNegativeInteger(value, message) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children;
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function requireChild(rootNode, name) {
  var node = findNodeByNameRecursive(rootNode, name);
  if (!node || !node.isValid) {
    throw new Error("BuyView prefab missing node: " + name);
  }
  return node;
}

function setLabelText(node, text) {
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error("BuyView node requires cc.Label: " + node.name);
  }
  label.string = String(text);
}

function setSpriteFrame(node, spriteFrame, targetWidth) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("BuyView node requires cc.Sprite: " + node.name);
  }
  if (typeof spriteFrame.getRect !== "function") {
    throw new Error("BuyView spriteFrame requires getRect: " + node.name);
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("BuyView sprite target width must be positive: " + node.name);
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    throw new Error("BuyView spriteFrame has invalid rect: " + node.name);
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
  node.setContentSize(targetWidth, targetWidth * rect.height / rect.width);
}

function bindTapOnce(node, key, onTap) {
  assertFunction(onTap, "BuyView tap callback is required.");
  if (node[key] === true) {
    node[key + "Handler"] = onTap;
    return;
  }

  node[key] = true;
  node[key + "Handler"] = onTap;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("BuyView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load buy view sprite failed `" + path + "`: " + error.message));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("Load buy view sprite returned empty frame: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function BuyViewController(options) {
  assertObject(options, "BuyViewController options are required.");
  if (!options.node || !options.node.isValid) {
    throw new Error("BuyViewController requires a valid node.");
  }
  assertFunction(options.onClose, "BuyViewController requires onClose.");
  assertFunction(options.onConfirm, "BuyViewController requires onConfirm.");

  this.node = options.node;
  this.onClose = options.onClose;
  this.onConfirm = options.onConfirm;
  this.quantity = 1;
  this._spriteFrameByPath = {};
  this._lastRenderOptions = null;
  this._renderProxyRoot = null;
  this._renderProxyLayers = {};
  this._renderProxyRecords = [];
  this._nodes = this._resolveNodes();
  this._bindActions();
}

BuyViewController.prototype._resolveNodes = function () {
  if (!this.node.getComponent(cc.BlockInputEvents)) {
    this.node.addComponent(cc.BlockInputEvents);
  }
  var panel = requireChild(this.node, "Panel");
  var itemNode = requireChild(panel, "shop_item");
  return {
    mask: requireChild(this.node, "mask"),
    panel: panel,
    bgNode: requireChild(panel, "bg"),
    closeButton: requireChild(panel, "btn_close"),
    itemNode: itemNode,
    icon: requireChild(itemNode, "icon"),
    numBg: requireChild(panel, "num_bg"),
    addButton: requireChild(panel, "add_btn"),
    reduceButton: requireChild(panel, "reduce_btn"),
    buyButton: requireChild(panel, "buy_btn"),
    coin: requireChild(panel, "coin"),
    buyNum: requireChild(panel, "buy_num"),
    name: requireChild(panel, "name"),
    functionText: requireChild(panel, "function"),
    todayLimit: requireChild(panel, "today_limit"),
    totalNum: requireChild(panel, "total_num"),
    selfNum: requireChild(panel, "self_num")
  };
};

BuyViewController.prototype._ensureRenderProxyLayers = function () {
  if (this._renderProxyRoot && this._renderProxyRoot.isValid) {
    return;
  }

  var root = SpriteProxyLayerHelper.createProxyRoot(this._nodes.panel, {
    name: BUY_RENDER_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._renderProxyRoot = root;
  this._renderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "background", name: BUY_RENDER_PROXY_LAYER_NAMES.background, zIndex: 0 },
    { key: "item", name: BUY_RENDER_PROXY_LAYER_NAMES.item, zIndex: 1 },
    { key: "control", name: BUY_RENDER_PROXY_LAYER_NAMES.control, zIndex: 2 }
  ]);
};

BuyViewController.prototype._clearRenderProxyRecords = function () {
  SpriteProxyLayerHelper.clearRecords(this._renderProxyRecords);
};

BuyViewController.prototype._createSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._renderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("BuyView render proxy layer is invalid: " + layerKey);
  }
  this._renderProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._renderProxyRoot,
    name: name,
    visible: visible === true
  }));
};

BuyViewController.prototype._hideSourceSprites = function () {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.bgNode, false, "BuyView bg");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(this._nodes.bgNode, "title"), false, "BuyView bg/title");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(this._nodes.bgNode, "paopao"), false, "BuyView bg/title/paopao");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.closeButton, false, "BuyView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.itemNode, false, "BuyView shop_item");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.icon, false, "BuyView shop_item/icon");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.numBg, false, "BuyView num_bg");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.addButton, false, "BuyView add_btn");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.reduceButton, false, "BuyView reduce_btn");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.buyButton, false, "BuyView buy_btn");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.coin, false, "BuyView coin");
};

BuyViewController.prototype._syncRenderProxies = function () {
  if (!this._renderProxyRoot || !this._renderProxyRoot.isValid) {
    return;
  }
  SpriteProxyLayerHelper.syncRecords(this._renderProxyRecords, this._renderProxyRoot);
};

BuyViewController.prototype._rebuildRenderProxies = function () {
  this._ensureRenderProxyLayers();
  this._clearRenderProxyRecords();
  this._hideSourceSprites();
  var titleNode = requireChild(this._nodes.bgNode, "title");
  this._createSpriteProxyRecord("background", this._nodes.bgNode, "buy_bg_proxy", true);
  this._createSpriteProxyRecord("background", titleNode, "buy_title_proxy", true);
  this._createSpriteProxyRecord("background", requireChild(titleNode, "paopao"), "buy_title_bubble_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.closeButton, "buy_close_button_proxy", true);
  this._createSpriteProxyRecord("item", this._nodes.itemNode, "buy_shop_item_bg_proxy", true);
  this._createSpriteProxyRecord("item", this._nodes.icon, "buy_shop_item_icon_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.numBg, "buy_num_bg_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.addButton, "buy_add_button_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.reduceButton, "buy_reduce_button_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.buyButton, "buy_buy_button_proxy", true);
  this._createSpriteProxyRecord("control", this._nodes.coin, "buy_coin_proxy", true);
};

BuyViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.mask, "__buyCloseTapBound", this.onClose);
  bindTapOnce(this._nodes.closeButton, "__buyCloseTapBound", this.onClose);
  bindTapOnce(this._nodes.addButton, "__buyAddTapBound", function () {
    this._changeQuantity(1);
  }.bind(this));
  bindTapOnce(this._nodes.reduceButton, "__buyReduceTapBound", function () {
    this._changeQuantity(-1);
  }.bind(this));
  bindTapOnce(this._nodes.buyButton, "__buyConfirmTapBound", function () {
    this.onConfirm(this.quantity);
  }.bind(this));
};

BuyViewController.prototype._changeQuantity = function (delta) {
  if (!this._lastRenderOptions) {
    throw new Error("BuyView quantity changed before render.");
  }
  var next = this.quantity + delta;
  if (next < 1) {
    next = 1;
  }
  if (next > this._lastRenderOptions.remaining) {
    next = this._lastRenderOptions.remaining;
  }
  this.quantity = next;
  this._syncQuantity();
};

BuyViewController.prototype._syncQuantity = function () {
  var options = this._lastRenderOptions;
  assertObject(options, "BuyView sync requires render options.");
  var totalCost = options.goods.price.amount * this.quantity;
  setLabelText(this._nodes.buyNum, String(this.quantity));
  setLabelText(this._nodes.totalNum, String(totalCost));
  this._nodes.reduceButton.opacity = this.quantity > 1 ? 255 : 150;
  this._nodes.addButton.opacity = this.quantity < options.remaining ? 255 : 150;
  this._syncRenderProxies();
};

BuyViewController.prototype.updateCoinCount = function (coinCount) {
  var coins = requireNonNegativeInteger(coinCount, "BuyView coinCount must be a non-negative integer.");
  setLabelText(this._nodes.selfNum, String(coins));
};

BuyViewController.prototype.render = function (options) {
  assertObject(options, "BuyView render options are required.");
  assertObject(options.goods, "BuyView render requires goods.");
  if (!Number.isInteger(options.remaining) || options.remaining <= 0) {
    throw new Error("BuyView requires positive remaining count.");
  }
  requireNonNegativeInteger(options.coinCount, "BuyView render requires coinCount.");

  this._lastRenderOptions = options;
  this.quantity = 1;
  var iconLoadPromise = loadSpriteFrame(options.goods.iconPath).then(function (spriteFrame) {
    this._spriteFrameByPath[options.goods.iconPath] = spriteFrame;
    setSpriteFrame(this._nodes.icon, spriteFrame, BUY_ICON_WIDTH);
    this._rebuildRenderProxies();
  }.bind(this));
  setLabelText(this._nodes.name, options.goods.displayName);
  setLabelText(this._nodes.functionText, options.goods.functionText);
  setLabelText(this._nodes.todayLimit, options.goods.dailyLimit === 0 ? "不限购" : options.remaining + "/" + options.goods.dailyLimit);
  this.updateCoinCount(options.coinCount);
  this._syncQuantity();
  return iconLoadPromise;
};

module.exports = BuyViewController;
