"use strict";

var BundleLoader = require("../utils/BundleLoader");
var Logger = require("../utils/Logger");

var TAG_SPRITE_PATHS = {
  recommended: "image/shop/recommended_badge",
  hot: "image/shop/popular_badge"
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
    throw new Error("ShopView prefab missing node: " + name);
  }
  return node;
}

function setLabelText(node, text) {
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error("ShopView node requires cc.Label: " + node.name);
  }
  label.string = String(text);
}

function setSpriteFrame(node, spriteFrame) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("ShopView node requires cc.Sprite: " + node.name);
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
}

function bindTapOnce(node, key, onTap) {
  assertFunction(onTap, "ShopView tap callback is required.");
  if (node[key] === true) {
    node[key + "Handler"] = onTap;
    return;
  }

  node[key] = true;
  node[key + "Handler"] = onTap;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    event.stopPropagation();
    node.scale = 0.96;
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    event.stopPropagation();
    node.scale = 1;
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    node.scale = 1;
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("ShopView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load shop sprite failed `" + path + "`: " + error.message));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("Load shop sprite returned empty frame: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function getPrimaryTag(goods) {
  if (!Array.isArray(goods.tags)) {
    throw new Error("Shop goods tags must be an array: " + goods.skuId);
  }
  if (goods.tags.length === 0) {
    return "";
  }
  return goods.tags[0];
}

function ShopViewController(options) {
  assertObject(options, "ShopViewController options are required.");
  if (!options.node || !options.node.isValid) {
    throw new Error("ShopViewController requires a valid node.");
  }
  assertFunction(options.onClose, "ShopViewController requires onClose.");
  assertFunction(options.onSelectGoods, "ShopViewController requires onSelectGoods.");

  this.node = options.node;
  this.onClose = options.onClose;
  this.onSelectGoods = options.onSelectGoods;
  this._itemNodes = [];
  this._spriteFrames = {};
  this._spriteFrameLoadPromise = null;
  this._lastRenderOptions = null;
  this._nodes = this._resolveNodes();
  this._bindActions();
}

ShopViewController.prototype._resolveNodes = function () {
  if (!this.node.getComponent(cc.BlockInputEvents)) {
    this.node.addComponent(cc.BlockInputEvents);
  }
  var panel = requireChild(this.node, "Panel");
  var nodes = {
    mask: requireChild(this.node, "mask"),
    panel: panel,
    closeButton: requireChild(panel, "btn_close"),
    shopList: requireChild(panel, "shop_list"),
    shopItemTemplate: requireChild(panel, "shop_item"),
    refreshTips: requireChild(panel, "refresh_tips")
  };
  var layout = nodes.shopList.getComponent(cc.Layout);
  if (layout) {
    layout.cellSize = cc.size(nodes.shopItemTemplate.width, nodes.shopItemTemplate.height);
  }
  return nodes;
};

ShopViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.mask, "__shopCloseTapBound", this.onClose);
  bindTapOnce(this._nodes.closeButton, "__shopCloseTapBound", this.onClose);
};

ShopViewController.prototype._clearItemNodes = function () {
  while (this._itemNodes.length > 0) {
    var node = this._itemNodes.pop();
    if (node && node.isValid) {
      node.destroy();
    }
  }
};

ShopViewController.prototype._renderItem = function (goods, index, purchaseState) {
  var itemNode = index === 0 ? this._nodes.shopItemTemplate : cc.instantiate(this._nodes.shopItemTemplate);
  if (index > 0) {
    itemNode.parent = this._nodes.shopList;
  }
  itemNode.name = "shop_item_" + goods.skuId;
  itemNode.active = true;

  var remaining = purchaseState.remainingBySkuId[goods.skuId];
  if (!Number.isInteger(remaining) || remaining < 0) {
    throw new Error("Shop remaining count missing for sku: " + goods.skuId);
  }

  var iconNode = requireChild(itemNode, "icon");
  var nameNode = requireChild(itemNode, "name");
  var priceNode = requireChild(itemNode, "price");
  var tagNode = requireChild(itemNode, "tag");
  var tag = getPrimaryTag(goods);

  setLabelText(nameNode, goods.displayName);
  setLabelText(priceNode, remaining > 0 ? String(goods.price.amount) : "售罄");
  setSpriteFrame(iconNode, this._spriteFrames[goods.iconPath]);

  if (tag.length > 0) {
    var tagSpriteFrame = this._spriteFrames[TAG_SPRITE_PATHS[tag]];
    if (!tagSpriteFrame) {
      throw new Error("Shop tag sprite missing for tag: " + tag);
    }
    tagNode.active = true;
    setSpriteFrame(tagNode, tagSpriteFrame);
  } else {
    tagNode.active = false;
  }

  itemNode.opacity = remaining > 0 ? 255 : 150;
  bindTapOnce(itemNode, "__shopItemTapBound", function () {
    this.onSelectGoods(goods.skuId);
  }.bind(this));

  if (index > 0) {
    this._itemNodes.push(itemNode);
  }
};

ShopViewController.prototype.render = function (options) {
  assertObject(options, "ShopView render options are required.");
  if (!Array.isArray(options.goodsList) || options.goodsList.length === 0) {
    throw new Error("ShopView render requires non-empty goodsList.");
  }
  assertObject(options.purchaseState, "ShopView render requires purchaseState.");
  assertObject(options.purchaseState.remainingBySkuId, "ShopView purchaseState requires remainingBySkuId.");

  this._lastRenderOptions = options;
  return this.ensureSpriteFrames(options.goodsList).then(function () {
    this._clearItemNodes();
    options.goodsList.forEach(function (goods, index) {
      this._renderItem(goods, index, options.purchaseState);
    }, this);
    setLabelText(this._nodes.refreshTips, "每日 00:00 重置限购");
  }.bind(this)).catch(function (error) {
    Logger.error("ShopView render failed", error && error.stack ? error.stack : error);
    throw error;
  });
};

ShopViewController.prototype.ensureSpriteFrames = function (goodsList) {
  if (this._spriteFrameLoadPromise) {
    return this._spriteFrameLoadPromise;
  }

  var paths = {};
  goodsList.forEach(function (goods) {
    paths[goods.iconPath] = true;
    var tag = getPrimaryTag(goods);
    if (tag.length > 0) {
      if (!TAG_SPRITE_PATHS[tag]) {
        throw new Error("Shop tag sprite path missing for tag: " + tag);
      }
      paths[TAG_SPRITE_PATHS[tag]] = true;
    }
  });

  var missingPaths = Object.keys(paths).filter(function (path) {
    return !this._spriteFrames[path];
  }, this);
  if (missingPaths.length === 0) {
    return Promise.resolve(this._spriteFrames);
  }

  this._spriteFrameLoadPromise = Promise.all(missingPaths.map(function (path) {
    return loadSpriteFrame(path).then(function (spriteFrame) {
      return {
        path: path,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (entries) {
    entries.forEach(function (entry) {
      this._spriteFrames[entry.path] = entry.spriteFrame;
    }, this);
    this._spriteFrameLoadPromise = null;
    return this._spriteFrames;
  }.bind(this));

  return this._spriteFrameLoadPromise;
};

module.exports = ShopViewController;
