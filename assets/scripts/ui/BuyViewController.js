"use strict";

var BundleLoader = require("../utils/BundleLoader");

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

function setSpriteFrame(node, spriteFrame) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("BuyView node requires cc.Sprite: " + node.name);
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
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
    closeButton: requireChild(panel, "btn_close"),
    itemNode: itemNode,
    icon: requireChild(itemNode, "icon"),
    addButton: requireChild(panel, "add_btn"),
    reduceButton: requireChild(panel, "reduce_btn"),
    buyButton: requireChild(panel, "buy_btn"),
    buyNum: requireChild(panel, "buy_num"),
    name: requireChild(panel, "name"),
    functionText: requireChild(panel, "function"),
    todayLimit: requireChild(panel, "today_limit"),
    totalNum: requireChild(panel, "total_num")
  };
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
};

BuyViewController.prototype.render = function (options) {
  assertObject(options, "BuyView render options are required.");
  assertObject(options.goods, "BuyView render requires goods.");
  if (!Number.isInteger(options.remaining) || options.remaining <= 0) {
    throw new Error("BuyView requires positive remaining count.");
  }

  this._lastRenderOptions = options;
  this.quantity = 1;
  var iconLoadPromise = loadSpriteFrame(options.goods.iconPath).then(function (spriteFrame) {
    this._spriteFrameByPath[options.goods.iconPath] = spriteFrame;
    setSpriteFrame(this._nodes.icon, spriteFrame);
  }.bind(this));
  setLabelText(this._nodes.name, options.goods.displayName);
  setLabelText(this._nodes.functionText, options.goods.functionText);
  setLabelText(this._nodes.todayLimit, options.remaining + "/" + options.goods.dailyLimit);
  this._syncQuantity();
  return iconLoadPromise;
};

module.exports = BuyViewController;
