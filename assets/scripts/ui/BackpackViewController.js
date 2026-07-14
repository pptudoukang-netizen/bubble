"use strict";

var BundleLoader = require("../utils/BundleLoader");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var ITEM_DEFINITIONS = [
  {
    itemId: "precise_aim",
    displayName: "精确瞄准",
    iconPath: "image/props/aim"
  },
  {
    itemId: "swap_ball",
    displayName: "换球",
    iconPath: "image/props/change_ball"
  },
  {
    itemId: "rainbow_ball",
    displayName: "彩虹球",
    iconPath: "image/props/rainbow_ball"
  },
  {
    itemId: "blast_ball",
    displayName: "炸裂球",
    iconPath: "image/props/blast_ball"
  },
  {
    itemId: "barrier_hammer",
    displayName: "破障锤",
    iconPath: "image/props/barrier_hammer"
  },
  {
    itemId: "snow_removal",
    displayName: "除雪剂",
    iconPath: "image/props/snow_removal"
  }
];

var PACK_LIST_GRID_SPACING_X = 2;
var PACK_LIST_GRID_SPACING_Y = 20;
var BACKPACK_ICON_WIDTH = 97;
var BACKPACK_RENDER_PROXY_ROOT_NAME = "backpack_render_proxy_root";
var BACKPACK_RENDER_PROXY_LAYER_NAMES = {
  panel: "backpack_proxy_panel_layer",
  chrome: "backpack_proxy_chrome_layer",
  itemBackground: "backpack_proxy_item_background_layer",
  itemIcon: "backpack_proxy_item_icon_layer"
};

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children || [];
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("BackpackView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  return requireValidNode(
    parentNode.getChildByName(childName),
    parentDescription + "/" + childName
  );
}

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function getItemCount(inventory, itemId) {
  requireObject(inventory, "Backpack inventory");
  requireObject(inventory.items, "Backpack inventory items");
  if (!Object.prototype.hasOwnProperty.call(inventory.items, itemId)) {
    throw new Error("Backpack inventory missing item count: " + itemId);
  }
  return requireNonNegativeInteger(inventory.items[itemId], "Backpack inventory item count `" + itemId + "`");
}

function setLabelText(node, text) {
  var label = requireValidNode(node, "label node").getComponent(cc.Label);
  if (!label) {
    throw new Error("BackpackView requires " + node.name + " cc.Label.");
  }
  label.string = text;
}

function setSpriteFrame(node, spriteFrame) {
  var sprite = requireValidNode(node, "sprite node").getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("BackpackView requires " + node.name + " cc.Sprite.");
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
}

function setSpriteFrameToWidth(node, spriteFrame, targetWidth) {
  if (!spriteFrame) {
    throw new Error("BackpackView spriteFrame missing for node: " + node.name);
  }
  if (typeof spriteFrame.getRect !== "function") {
    throw new Error("BackpackView spriteFrame requires getRect: " + node.name);
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("BackpackView sprite target width must be positive: " + node.name);
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    throw new Error("BackpackView spriteFrame has invalid rect: " + node.name);
  }
  setSpriteFrame(node, spriteFrame);
  node.setContentSize(targetWidth, targetWidth * rect.height / rect.width);
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load backpack sprite failed: " + path + ", " + (error.message || error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("Backpack sprite frame is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function bindTapWithoutScaleOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "Backpack tap callback");
  if (node[key] === true) {
    return;
  }

  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    onTap();
  });
}

function BackpackViewController(options) {
  requireObject(options, "BackpackViewController options");
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "BackpackViewController onClose");
  this._nodes = this._resolveNodes();
  this._packItemNodesByItemId = {};
  this._itemSpriteFrames = {};
  this._itemSpriteLoadPromise = null;
  this._lastRenderOptions = null;
  this._renderProxyRoot = null;
  this._renderProxyLayers = {};
  this._renderProxyRecords = [];
  this._initPackItemNodes();
  this._bindActions();
}

BackpackViewController.prototype._resolveNodes = function () {
  var panelNode = requireValidNode(findNodeByNameRecursive(this.node, "Panel"), "Panel");
  var packListNode = requireChildNode(panelNode, "pack_listview", "Panel");
  var packItemTemplate = requireChildNode(packListNode, "prop_item", "Panel/pack_listview");

  return {
    mask: requireValidNode(findNodeByNameRecursive(this.node, "mask"), "mask"),
    panel: panelNode,
    closeButton: requireChildNode(panelNode, "btn_close", "Panel"),
    packListNode: packListNode,
    packItemTemplate: packItemTemplate
  };
};

BackpackViewController.prototype._bindActions = function () {
  bindTapWithoutScaleOnce(this._nodes.closeButton, "__backpackCloseTapBound", this.onClose);
  bindTapWithoutScaleOnce(this._nodes.mask, "__backpackMaskTapBound", this.onClose);
};

BackpackViewController.prototype._ensureRenderProxyLayers = function () {
  if (this._renderProxyRoot && this._renderProxyRoot.isValid) {
    return;
  }

  var root = SpriteProxyLayerHelper.createProxyRoot(this._nodes.panel, {
    name: BACKPACK_RENDER_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._renderProxyRoot = root;
  this._renderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "panel", name: BACKPACK_RENDER_PROXY_LAYER_NAMES.panel, zIndex: 0 },
    { key: "chrome", name: BACKPACK_RENDER_PROXY_LAYER_NAMES.chrome, zIndex: 1 },
    { key: "itemBackground", name: BACKPACK_RENDER_PROXY_LAYER_NAMES.itemBackground, zIndex: 2 },
    { key: "itemIcon", name: BACKPACK_RENDER_PROXY_LAYER_NAMES.itemIcon, zIndex: 3 }
  ]);
};

BackpackViewController.prototype._clearRenderProxyRecords = function () {
  SpriteProxyLayerHelper.clearRecords(this._renderProxyRecords);
};

BackpackViewController.prototype._createSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._renderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("BackpackView render proxy layer is invalid: " + layerKey);
  }
  this._renderProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._renderProxyRoot,
    name: name,
    visible: visible === true
  }));
};

BackpackViewController.prototype._hideSourceStaticSprites = function () {
  var titleBgNode = requireChildNode(this._nodes.panel, "title_bg", "Panel");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.panel, false, "BackpackView Panel background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.closeButton, false, "BackpackView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(titleBgNode, false, "BackpackView title_bg");
};

BackpackViewController.prototype._hideSourceItemSprites = function (itemNode) {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(itemNode, false, "BackpackView pack item background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChildNode(itemNode, "price_bg", itemNode.name), false, "BackpackView pack item price_bg");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChildNode(itemNode, "icon", itemNode.name), false, "BackpackView pack item icon");
};

BackpackViewController.prototype._rebuildRenderProxies = function () {
  this._ensureRenderProxyLayers();
  this._clearRenderProxyRecords();
  this._hideSourceStaticSprites();

  var titleBgNode = requireChildNode(this._nodes.panel, "title_bg", "Panel");
  this._createSpriteProxyRecord("panel", this._nodes.panel, "backpack_panel_bg_proxy", true);
  this._createSpriteProxyRecord("chrome", this._nodes.closeButton, "backpack_close_button_proxy", true);
  this._createSpriteProxyRecord("chrome", titleBgNode, "backpack_title_bg_proxy", true);

  ITEM_DEFINITIONS.forEach(function (definition, index) {
    var itemNode = requireValidNode(this._packItemNodesByItemId[definition.itemId], "pack item node for " + definition.itemId);
    var itemVisible = itemNode.active === true;
    this._hideSourceItemSprites(itemNode);
    this._createSpriteProxyRecord("itemBackground", itemNode, "backpack_item_bg_proxy_" + index, itemVisible);
    this._createSpriteProxyRecord(
      "itemBackground",
      requireChildNode(itemNode, "price_bg", itemNode.name),
      "backpack_item_price_bg_proxy_" + index,
      itemVisible
    );
    this._createSpriteProxyRecord(
      "itemIcon",
      requireChildNode(itemNode, "icon", itemNode.name),
      "backpack_item_icon_proxy_" + index,
      itemVisible
    );
  }, this);
};

BackpackViewController.prototype._initPackItemNodes = function () {
  var packListNode = requireValidNode(this._nodes.packListNode, "Panel/pack_listview");
  var templateNode = requireValidNode(this._nodes.packItemTemplate, "Panel/pack_listview/prop_item");
  var layout = packListNode.getComponent(cc.Layout);
  if (!layout) {
    throw new Error("BackpackView pack_listview requires cc.Layout.");
  }
  if (!cc.Layout.Type || cc.Layout.Type.GRID === undefined) {
    throw new Error("BackpackView requires cc.Layout.Type.GRID.");
  }
  if (!cc.Layout.ResizeMode || cc.Layout.ResizeMode.NONE === undefined) {
    throw new Error("BackpackView requires cc.Layout.ResizeMode.NONE.");
  }
  if (!cc.Layout.AxisDirection || cc.Layout.AxisDirection.HORIZONTAL === undefined) {
    throw new Error("BackpackView requires cc.Layout.AxisDirection.HORIZONTAL.");
  }

  layout.enabled = true;
  layout.type = cc.Layout.Type.GRID;
  layout.resizeMode = cc.Layout.ResizeMode.NONE;
  layout.startAxis = cc.Layout.AxisDirection.HORIZONTAL;
  layout.cellSize = cc.size(templateNode.width, templateNode.height);
  layout.spacingX = PACK_LIST_GRID_SPACING_X;
  layout.spacingY = PACK_LIST_GRID_SPACING_Y;

  ITEM_DEFINITIONS.forEach(function (definition, index) {
    var itemNode = index === 0 ? templateNode : cc.instantiate(templateNode);
    if (index > 0) {
      itemNode.parent = packListNode;
    }

    itemNode.name = "prop_item_" + definition.itemId;
    itemNode.active = true;
    this._packItemNodesByItemId[definition.itemId] = itemNode;
  }, this);

  if (typeof layout.updateLayout !== "function") {
    throw new Error("BackpackView pack_listview Layout.updateLayout is required.");
  }
  layout.updateLayout();
};

BackpackViewController.prototype._renderPackList = function (inventory) {
  ITEM_DEFINITIONS.forEach(function (definition) {
    var itemNode = requireValidNode(
      this._packItemNodesByItemId[definition.itemId],
      "pack item node for " + definition.itemId
    );
    var itemCount = getItemCount(inventory, definition.itemId);
    var iconNode = requireChildNode(itemNode, "icon", itemNode.name);
    var nameNode = requireChildNode(itemNode, "name", itemNode.name);
    var numNode = requireChildNode(itemNode, "num", itemNode.name);
    var selectedNode = itemNode.getChildByName("selected");

    itemNode.active = itemCount > 0;
    itemNode.opacity = 255;
    itemNode.color = cc.color(255, 255, 255);
    if (selectedNode && selectedNode.isValid) {
      selectedNode.active = false;
    }

    setLabelText(nameNode, definition.displayName);
    setLabelText(numNode, String(itemCount));
    setSpriteFrameToWidth(iconNode, this._itemSpriteFrames[definition.itemId], BACKPACK_ICON_WIDTH);
  }, this);

  var layout = requireValidNode(this._nodes.packListNode, "Panel/pack_listview").getComponent(cc.Layout);
  if (!layout || typeof layout.updateLayout !== "function") {
    throw new Error("BackpackView pack_listview Layout.updateLayout is required.");
  }
  layout.updateLayout();
};

BackpackViewController.prototype.render = function (options) {
  requireObject(options, "BackpackView render options");
  requireObject(options.inventory, "BackpackView render inventory");
  this._lastRenderOptions = options;
  return this.ensureItemSpriteFrames().then(function () {
    this._renderPackList(options.inventory);
    this._rebuildRenderProxies();
  }.bind(this));
};

BackpackViewController.prototype.ensureItemSpriteFrames = function () {
  if (this._itemSpriteLoadPromise) {
    return this._itemSpriteLoadPromise;
  }

  var missingDefinitions = ITEM_DEFINITIONS.filter(function (definition) {
    return !this._itemSpriteFrames[definition.itemId];
  }, this);
  if (missingDefinitions.length === 0) {
    return Promise.resolve(this._itemSpriteFrames);
  }

  this._itemSpriteLoadPromise = Promise.all(missingDefinitions.map(function (definition) {
    return loadSpriteFrame(definition.iconPath).then(function (spriteFrame) {
      return {
        itemId: definition.itemId,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (results) {
    results.forEach(function (entry) {
      if (!entry || !entry.itemId || !entry.spriteFrame) {
        throw new Error("Backpack sprite frame load result is invalid.");
      }
      this._itemSpriteFrames[entry.itemId] = entry.spriteFrame;
    }, this);
    this._itemSpriteLoadPromise = null;
    return this._itemSpriteFrames;
  }.bind(this)).catch(function (error) {
    this._itemSpriteLoadPromise = null;
    throw error;
  }.bind(this));

  return this._itemSpriteLoadPromise;
};

BackpackViewController.ITEM_DEFINITIONS = ITEM_DEFINITIONS.slice();

module.exports = BackpackViewController;
