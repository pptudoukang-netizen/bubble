"use strict";

var BundleLoader = require("../utils/BundleLoader");
var Logger = require("../utils/Logger");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var TAG_SPRITE_PATHS = {
  recommended: "image/shop/recommended_badge",
  hot: "image/shop/popular_badge"
};
var SHOP_ICON_WIDTH = 110;
var SHOP_ITEM_TEMPLATE_NAME = "shop_item";
var SHOP_RENDER_PROXY_ROOT_NAME = "shop_render_proxy_root";
var SHOP_RENDER_PROXY_LAYER_NAMES = {
  itemBackground: "shop_proxy_item_background_layer",
  itemIcon: "shop_proxy_item_icon_layer",
  itemPrice: "shop_proxy_item_price_layer",
  itemTag: "shop_proxy_item_tag_layer"
};
var SHOP_PROXY_SPRITE_NODE_NAMES = ["icon", "num_bg", "price_icon", "tag"];

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

function setSpriteFrameToWidth(node, spriteFrame, targetWidth) {
  if (!spriteFrame) {
    throw new Error("ShopView spriteFrame missing for node: " + node.name);
  }
  if (typeof spriteFrame.getRect !== "function") {
    throw new Error("ShopView spriteFrame requires getRect: " + node.name);
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("ShopView sprite target width must be positive: " + node.name);
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    throw new Error("ShopView spriteFrame has invalid rect: " + node.name);
  }
  setSpriteFrame(node, spriteFrame);
  node.setContentSize(targetWidth, targetWidth * rect.height / rect.width);
}

function isCachedSpriteFrameValid(spriteFrame) {
  if (!spriteFrame) {
    return false;
  }
  if (typeof spriteFrame.getRect !== "function") {
    return false;
  }
  var rect = spriteFrame.getRect();
  return !!(rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0);
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

function bindTapWithoutScaleOnce(node, key, onTap) {
  assertFunction(onTap, "ShopView tap callback is required.");
  if (node[key] === true) {
    node[key + "Handler"] = onTap;
    return;
  }

  node[key] = true;
  node[key + "Handler"] = onTap;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    event.stopPropagation();
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    event.stopPropagation();
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("ShopView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function bindShopItemTap(itemNode, controller) {
  bindTapOnce(itemNode, "__shopItemTapBound", function () {
    var skuId = itemNode.__shopItemSkuId;
    if (typeof skuId !== "string" || skuId.length === 0) {
      throw new Error("ShopView shop item tap requires skuId on node: " + itemNode.name);
    }
    controller.onSelectGoods(skuId);
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
  this._shopItemNodes = [];
  this._shopItemNodeCount = 0;
  this._spriteFrames = {};
  this._spriteFrameLoadPromise = null;
  this._renderGeneration = 0;
  this._lastRenderOptions = null;
  this._renderProxyRoot = null;
  this._renderProxyLayers = {};
  this._renderProxyRecords = [];
  this._nodes = this._resolveNodes();
  this._bindActions();
}

ShopViewController.prototype._resolveNodes = function () {
  if (!this.node.getComponent(cc.BlockInputEvents)) {
    this.node.addComponent(cc.BlockInputEvents);
  }
  var panel = requireChild(this.node, "Panel");
  var shopList = requireChild(panel, "shop_list");
  var shopItemTemplate = shopList.getChildByName(SHOP_ITEM_TEMPLATE_NAME);
  if (!shopItemTemplate || !shopItemTemplate.isValid) {
    throw new Error("ShopView prefab missing node: " + SHOP_ITEM_TEMPLATE_NAME);
  }
  var nodes = {
    mask: requireChild(this.node, "mask"),
    panel: panel,
    closeButton: requireChild(panel, "btn_close"),
    shopList: shopList,
    shopItemTemplate: shopItemTemplate,
    refreshTips: requireChild(panel, "refresh_tips")
  };
  var layout = nodes.shopList.getComponent(cc.Layout);
  if (layout) {
    layout.cellSize = cc.size(nodes.shopItemTemplate.width, nodes.shopItemTemplate.height);
  }
  return nodes;
};

ShopViewController.prototype._bindActions = function () {
  bindTapWithoutScaleOnce(this._nodes.mask, "__shopCloseTapBound", this.onClose);
  bindTapOnce(this._nodes.closeButton, "__shopCloseTapBound", this.onClose);
};

ShopViewController.prototype._ensureRenderProxyLayers = function () {
  if (this._renderProxyRoot && this._renderProxyRoot.isValid) {
    return;
  }

  var shopListZIndex = Number.isFinite(this._nodes.shopList.zIndex) ? this._nodes.shopList.zIndex : 0;
  var root = SpriteProxyLayerHelper.createProxyRoot(this._nodes.panel, {
    name: SHOP_RENDER_PROXY_ROOT_NAME,
    zIndex: shopListZIndex - 1
  });

  this._renderProxyRoot = root;
  this._renderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "itemBackground", name: SHOP_RENDER_PROXY_LAYER_NAMES.itemBackground, zIndex: 0 },
    { key: "itemIcon", name: SHOP_RENDER_PROXY_LAYER_NAMES.itemIcon, zIndex: 1 },
    { key: "itemPrice", name: SHOP_RENDER_PROXY_LAYER_NAMES.itemPrice, zIndex: 2 },
    { key: "itemTag", name: SHOP_RENDER_PROXY_LAYER_NAMES.itemTag, zIndex: 3 }
  ]);
};

ShopViewController.prototype._clearRenderProxyRecords = function () {
  SpriteProxyLayerHelper.clearRecords(this._renderProxyRecords);
};

ShopViewController.prototype._createSpriteProxyRecord = function (layerNode, sourceNode, name, visible) {
  if (!layerNode || !layerNode.isValid) {
    throw new Error("ShopView render proxy layer is invalid: " + name);
  }
  var record = SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._renderProxyRoot,
    name: name,
    visible: visible === true
  });
  this._renderProxyRecords.push(record);
  return record;
};

ShopViewController.prototype._syncRenderProxies = function () {
  if (!this._renderProxyRoot || !this._renderProxyRoot.isValid) {
    return;
  }
  SpriteProxyLayerHelper.syncRecords(this._renderProxyRecords, this._renderProxyRoot);
};

ShopViewController.prototype._bindProxySyncToItem = function (itemNode) {
  if (itemNode.__shopProxySyncBound === true) {
    return;
  }
  itemNode.__shopProxySyncBound = true;
  itemNode.on(cc.Node.EventType.TOUCH_START, function () {
    this._syncRenderProxies();
  }, this);
  itemNode.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    this._syncRenderProxies();
  }, this);
  itemNode.on(cc.Node.EventType.TOUCH_END, function () {
    this._syncRenderProxies();
  }, this);
};

ShopViewController.prototype._hideSourceItemSprites = function (itemNode) {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(itemNode, false, "ShopView shop item background");
  SHOP_PROXY_SPRITE_NODE_NAMES.forEach(function (nodeName) {
    var sourceNode = requireChild(itemNode, nodeName);
    SpriteProxyLayerHelper.setSpriteRenderEnabled(sourceNode, false, "ShopView shop item " + nodeName);
  });
};

ShopViewController.prototype._rebuildRenderProxies = function () {
  this._ensureRenderProxyLayers();
  this._clearRenderProxyRecords();

  this._shopItemNodes.forEach(function (itemNode, index) {
    this._hideSourceItemSprites(itemNode);
    this._createSpriteProxyRecord(
      this._renderProxyLayers.itemBackground,
      itemNode,
      "shop_item_bg_proxy_" + index,
      true
    );
    this._createSpriteProxyRecord(
      this._renderProxyLayers.itemIcon,
      requireChild(itemNode, "icon"),
      "shop_item_icon_proxy_" + index,
      true
    );
    this._createSpriteProxyRecord(
      this._renderProxyLayers.itemPrice,
      requireChild(itemNode, "num_bg"),
      "shop_item_num_bg_proxy_" + index,
      true
    );
    this._createSpriteProxyRecord(
      this._renderProxyLayers.itemPrice,
      requireChild(itemNode, "price_icon"),
      "shop_item_price_icon_proxy_" + index,
      true
    );
    var tagNode = requireChild(itemNode, "tag");
    this._createSpriteProxyRecord(
      this._renderProxyLayers.itemTag,
      tagNode,
      "shop_item_tag_proxy_" + index,
      tagNode.active === true
    );
  }, this);
};

ShopViewController.prototype._destroyShopItemClones = function () {
  this._clearRenderProxyRecords();
  for (var index = this._shopItemNodes.length - 1; index >= 0; index -= 1) {
    if (index === 0) {
      continue;
    }
    var node = this._shopItemNodes[index];
    if (node && node.isValid) {
      node.destroy();
    }
  }
  this._shopItemNodes = [];
  this._shopItemNodeCount = 0;
  if (this._nodes.shopItemTemplate && this._nodes.shopItemTemplate.isValid) {
    this._nodes.shopItemTemplate.name = SHOP_ITEM_TEMPLATE_NAME;
    this._nodes.shopItemTemplate.active = true;
    this._nodes.shopItemTemplate.scale = 1;
  }
};

ShopViewController.prototype._ensureShopItemNodes = function (itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    throw new Error("ShopView item count must be a positive integer.");
  }
  if (this._shopItemNodeCount === itemCount && this._shopItemNodes.length === itemCount) {
    return;
  }

  this._destroyShopItemClones();
  for (var index = 0; index < itemCount; index += 1) {
    var itemNode = index === 0
      ? this._nodes.shopItemTemplate
      : cc.instantiate(this._nodes.shopItemTemplate);
    if (!itemNode || !itemNode.isValid) {
      throw new Error("ShopView shop item node init failed at index " + index + ".");
    }
    if (index > 0) {
      itemNode.parent = this._nodes.shopList;
    }
    itemNode.active = true;
    itemNode.scale = 1;
    bindShopItemTap(itemNode, this);
    this._bindProxySyncToItem(itemNode);
    this._shopItemNodes.push(itemNode);
  }
  this._shopItemNodeCount = itemCount;
};

ShopViewController.prototype._updateShopItemNode = function (itemNode, goods, purchaseState) {
  if (!itemNode || !itemNode.isValid) {
    throw new Error("ShopView update requires a valid shop item node.");
  }

  itemNode.__shopItemSkuId = goods.skuId;
  itemNode.name = "shop_item_" + goods.skuId;
  itemNode.active = true;
  itemNode.scale = 1;

  var remaining = purchaseState.remainingBySkuId[goods.skuId];
  if (!Number.isInteger(remaining) || remaining < 0) {
    throw new Error("Shop remaining count missing for sku: " + goods.skuId);
  }

  var iconNode = requireChild(itemNode, "icon");
  var nameNode = requireChild(itemNode, "name");
  var priceNode = requireChild(itemNode, "price");
  var tagNode = requireChild(itemNode, "tag");
  var tag = getPrimaryTag(goods);
  var iconSpriteFrame = this._spriteFrames[goods.iconPath];
  if (!isCachedSpriteFrameValid(iconSpriteFrame)) {
    throw new Error("Shop icon sprite missing or invalid for sku: " + goods.skuId);
  }

  setLabelText(nameNode, goods.displayName);
  setLabelText(priceNode, remaining > 0 ? String(goods.price.amount) : "售罄");
  setSpriteFrameToWidth(iconNode, iconSpriteFrame, SHOP_ICON_WIDTH);

  if (tag.length > 0) {
    var tagSpriteFrame = this._spriteFrames[TAG_SPRITE_PATHS[tag]];
    if (!isCachedSpriteFrameValid(tagSpriteFrame)) {
      throw new Error("Shop tag sprite missing or invalid for tag: " + tag);
    }
    tagNode.active = true;
    setSpriteFrame(tagNode, tagSpriteFrame);
  } else {
    tagNode.active = false;
  }

  itemNode.opacity = remaining > 0 ? 255 : 150;
};

ShopViewController.prototype.render = function (options) {
  assertObject(options, "ShopView render options are required.");
  if (!Array.isArray(options.goodsList) || options.goodsList.length === 0) {
    throw new Error("ShopView render requires non-empty goodsList.");
  }
  assertObject(options.purchaseState, "ShopView render requires purchaseState.");
  assertObject(options.purchaseState.remainingBySkuId, "ShopView purchaseState requires remainingBySkuId.");

  this._lastRenderOptions = options;
  this._renderGeneration += 1;
  var renderGeneration = this._renderGeneration;

  return this.ensureSpriteFrames(options.goodsList).then(function () {
    if (renderGeneration !== this._renderGeneration) {
      return null;
    }
    this._ensureShopItemNodes(options.goodsList.length);
    options.goodsList.forEach(function (goods, index) {
      this._updateShopItemNode(this._shopItemNodes[index], goods, options.purchaseState);
    }, this);
    var layout = this._nodes.shopList.getComponent(cc.Layout);
    if (!layout) {
      throw new Error("ShopView shop_list requires cc.Layout.");
    }
    layout.updateLayout();
    this._rebuildRenderProxies();
    return null;
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
    if (!isCachedSpriteFrameValid(this._spriteFrames[path])) {
      delete this._spriteFrames[path];
      return true;
    }
    return false;
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
  }.bind(this)).catch(function (error) {
    this._spriteFrameLoadPromise = null;
    throw error;
  }.bind(this));

  return this._spriteFrameLoadPromise;
};

module.exports = ShopViewController;
