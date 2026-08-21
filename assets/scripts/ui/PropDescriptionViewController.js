"use strict";

var PropDescriptionConfig = require("../config/PropDescriptionConfig");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var ICON_WIDTH = 80;
var ITEM_SPACING_Y = 10;
var LIST_PADDING_TOP = 10;
var LIST_PADDING_BOTTOM = 10;
var MASK_PROXY_ROOT_NAME = "prop_description_mask_proxy_root";
var STATIC_PROXY_ROOT_NAME = "prop_description_static_proxy_root";
var ITEM_PROXY_ROOT_NAME = "prop_description_item_proxy_root";
var ITEM_PROXY_ROOT_Z_INDEX = 0;
var ITEM_SOURCE_NODE_Z_INDEX = 1;

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("PropDescriptionView requires " + description + ".");
  }
  return node;
}

function findNodeByNameRecursive(rootNode, nodeName) {
  requireValidNode(rootNode, "recursive search root");
  if (rootNode.name === nodeName) {
    return rootNode;
  }
  for (var index = 0; index < rootNode.children.length; index += 1) {
    var childNode = rootNode.children[index];
    var foundNode = findNodeByNameRecursive(childNode, nodeName);
    if (foundNode) {
      return foundNode;
    }
  }
  return null;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error("PropDescriptionView requires " + parentDescription + "/" + childName + ".");
  }
  return childNode;
}

function requireSprite(node, description) {
  requireValidNode(node, description);
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("PropDescriptionView requires " + description + " cc.Sprite.");
  }
  return sprite;
}

function requireLabel(node, description) {
  requireValidNode(node, description);
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error("PropDescriptionView requires " + description + " cc.Label.");
  }
  return label;
}

function bindTapOnce(node, key, handler) {
  requireValidNode(node, "tap node");
  requireFunction(handler, "PropDescriptionView tap handler");
  node[key + "Handler"] = handler;
  if (node[key] === true) {
    return;
  }
  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    var currentHandler = node[key + "Handler"];
    if (typeof currentHandler !== "function") {
      throw new Error("PropDescriptionView tap handler missing: " + node.name);
    }
    currentHandler();
  });
}

function setLabelText(node, value, description) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("PropDescriptionView " + description + " must be a non-empty string.");
  }
  requireLabel(node, description).string = value;
}

function setSpriteFrameToWidth(node, spriteFrame, targetWidth, description) {
  if (!spriteFrame || typeof spriteFrame.getRect !== "function") {
    throw new Error("PropDescriptionView " + description + " spriteFrame is invalid.");
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("PropDescriptionView " + description + " target width is invalid.");
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
    throw new Error("PropDescriptionView " + description + " spriteFrame size is invalid.");
  }
  var sprite = requireSprite(node, description);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  node.setContentSize(targetWidth, targetWidth * rect.height / rect.width);
}

function requireSpriteFrame(spriteFrameCache, path) {
  requireObject(spriteFrameCache, "PropDescriptionView spriteFrameCache");
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("PropDescriptionView icon path must be a non-empty string.");
  }
  var spriteFrame = spriteFrameCache[path];
  if (!spriteFrame) {
    throw new Error("PropDescriptionView preloaded spriteFrame missing: " + path);
  }
  return spriteFrame;
}

function PropDescriptionViewController(options) {
  requireObject(options, "PropDescriptionViewController options");
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "PropDescriptionViewController onClose");
  this._nodes = this._resolveNodes();
  this._itemNodes = [];
  this._maskProxyRoot = null;
  this._maskProxyRecords = [];
  this._staticProxyRoot = null;
  this._staticProxyLayers = null;
  this._staticProxyRecords = [];
  this._itemProxyRoot = null;
  this._itemProxyLayers = null;
  this._itemProxyRecords = [];
  this._scrollProxySyncBound = false;
  this._initializeScrollList();
  this._bindActions();
}

PropDescriptionViewController.prototype._resolveNodes = function () {
  var maskNode = requireValidNode(findNodeByNameRecursive(this.node, "mask"), "mask");
  var panelNode = requireValidNode(findNodeByNameRecursive(this.node, "Panel"), "Panel");
  var listNode = requireChildNode(panelNode, "prop_list", "PropDescriptionView/Panel");
  return {
    maskNode: maskNode,
    panelNode: panelNode,
    titleNode: requireChildNode(panelNode, "title", "PropDescriptionView/Panel"),
    closeButton: requireChildNode(panelNode, "btn_close", "PropDescriptionView/Panel"),
    listNode: listNode,
    templateNode: requireChildNode(listNode, "item", "PropDescriptionView/Panel/prop_list"),
    viewNode: null,
    contentNode: null,
    contentLayout: null,
    scrollView: null
  };
};

PropDescriptionViewController.prototype._initializeScrollList = function () {
  var listNode = this._nodes.listNode;
  var originalLayout = listNode.getComponent(cc.Layout);
  if (!originalLayout) {
    throw new Error("PropDescriptionView prop_list requires the prefab cc.Layout contract.");
  }
  if (listNode.getComponent(cc.Mask) || listNode.getComponent(cc.ScrollView)) {
    throw new Error("PropDescriptionView prop_list runtime scroll components must not be serialized in the prefab.");
  }
  if (!Number.isFinite(listNode.width) || listNode.width <= 0 || !Number.isFinite(listNode.height) || listNode.height <= 0) {
    throw new Error("PropDescriptionView prop_list size is invalid.");
  }
  originalLayout.enabled = false;

  var viewNode = new cc.Node("view");
  viewNode.parent = listNode;
  viewNode.setAnchorPoint(0.5, 0.5);
  viewNode.setContentSize(listNode.width, listNode.height);
  viewNode.setPosition(0, 0);
  var mask = viewNode.addComponent(cc.Mask);
  mask.type = cc.Mask.Type.RECT;

  var contentNode = new cc.Node("content");
  contentNode.parent = viewNode;
  contentNode.setAnchorPoint(0.5, 1);
  contentNode.setContentSize(listNode.width, this._nodes.templateNode.height);
  contentNode.setPosition(0, listNode.height / 2);
  this._nodes.templateNode.parent = contentNode;
  this._nodes.templateNode.active = true;

  var contentLayout = contentNode.addComponent(cc.Layout);
  if (!cc.Layout.Type || cc.Layout.Type.VERTICAL === undefined) {
    throw new Error("PropDescriptionView requires cc.Layout.Type.VERTICAL.");
  }
  if (!cc.Layout.ResizeMode || cc.Layout.ResizeMode.CONTAINER === undefined) {
    throw new Error("PropDescriptionView requires cc.Layout.ResizeMode.CONTAINER.");
  }
  if (!cc.Layout.VerticalDirection || cc.Layout.VerticalDirection.TOP_TO_BOTTOM === undefined) {
    throw new Error("PropDescriptionView requires cc.Layout.VerticalDirection.TOP_TO_BOTTOM.");
  }
  contentLayout.type = cc.Layout.Type.VERTICAL;
  contentLayout.resizeMode = cc.Layout.ResizeMode.CONTAINER;
  contentLayout.verticalDirection = cc.Layout.VerticalDirection.TOP_TO_BOTTOM;
  contentLayout.paddingTop = LIST_PADDING_TOP;
  contentLayout.paddingBottom = LIST_PADDING_BOTTOM;
  contentLayout.spacingY = ITEM_SPACING_Y;

  var scrollView = listNode.addComponent(cc.ScrollView);
  scrollView.content = contentNode;
  scrollView.horizontal = false;
  scrollView.vertical = true;
  scrollView.inertia = true;
  scrollView.elastic = true;

  this._nodes.viewNode = viewNode;
  this._nodes.contentNode = contentNode;
  this._nodes.contentLayout = contentLayout;
  this._nodes.scrollView = scrollView;
};

PropDescriptionViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__propDescriptionCloseBound", this.onClose);
  bindTapOnce(this._nodes.maskNode, "__propDescriptionMaskCloseBound", this.onClose);
};

PropDescriptionViewController.prototype._ensureStaticProxyLayers = function () {
  if (!this._maskProxyRoot || !this._maskProxyRoot.isValid) {
    this._maskProxyRoot = SpriteProxyLayerHelper.createProxyRoot(this.node, {
      name: MASK_PROXY_ROOT_NAME,
      zIndex: -1
    });
    var maskLayers = SpriteProxyLayerHelper.createProxyLayers(this._maskProxyRoot, [
      { key: "mask", name: "prop_description_proxy_mask_layer", zIndex: 0 }
    ]);
    SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.maskNode, false, "PropDescriptionView mask source");
    this._maskProxyRecords.push(SpriteProxyLayerHelper.createRecord({
      layerNode: maskLayers.mask,
      sourceNode: this._nodes.maskNode,
      rootNode: this._maskProxyRoot,
      name: "prop_description_mask_proxy",
      visible: true
    }));
  }
  if (this._staticProxyRoot && this._staticProxyRoot.isValid) {
    return;
  }
  var popupContentNode = requireValidNode(this._nodes.panelNode.parent, "PopupContent");
  this._staticProxyRoot = SpriteProxyLayerHelper.createProxyRoot(popupContentNode, {
    name: STATIC_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._staticProxyLayers = SpriteProxyLayerHelper.createProxyLayers(this._staticProxyRoot, [
    { key: "panel", name: "prop_description_proxy_panel_layer", zIndex: 0 },
    { key: "chrome", name: "prop_description_proxy_chrome_layer", zIndex: 1 }
  ]);
  var sources = [
    { key: "panel", node: this._nodes.panelNode, name: "prop_description_panel_proxy" },
    { key: "chrome", node: this._nodes.titleNode, name: "prop_description_title_proxy" },
    { key: "chrome", node: this._nodes.closeButton, name: "prop_description_close_proxy" }
  ];
  sources.forEach(function (entry) {
    SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.node, false, "PropDescriptionView " + entry.name);
    this._staticProxyRecords.push(SpriteProxyLayerHelper.createRecord({
      layerNode: this._staticProxyLayers[entry.key],
      sourceNode: entry.node,
      rootNode: this._staticProxyRoot,
      name: entry.name,
      visible: true
    }));
  }, this);
};

PropDescriptionViewController.prototype._syncStaticProxies = function () {
  this._ensureStaticProxyLayers();
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.maskNode, false, "PropDescriptionView static source mask");
  SpriteProxyLayerHelper.syncRecords(this._maskProxyRecords, this._maskProxyRoot);
  [this._nodes.panelNode, this._nodes.titleNode, this._nodes.closeButton].forEach(function (node) {
    SpriteProxyLayerHelper.setSpriteRenderEnabled(node, false, "PropDescriptionView static source " + node.name);
  });
  SpriteProxyLayerHelper.syncRecords(this._staticProxyRecords, this._staticProxyRoot);
};

PropDescriptionViewController.prototype._clearItemProxies = function () {
  SpriteProxyLayerHelper.clearRecords(this._itemProxyRecords);
  SpriteProxyLayerHelper.destroyProxyRoot(this._nodes.contentNode, ITEM_PROXY_ROOT_NAME);
  this._itemProxyRoot = null;
  this._itemProxyLayers = null;
};

PropDescriptionViewController.prototype._bindScrollProxySync = function () {
  if (this._scrollProxySyncBound !== true) {
    if (!cc.ScrollView.EventType || !cc.ScrollView.EventType.SCROLLING || !cc.ScrollView.EventType.SCROLL_ENDED) {
      throw new Error("PropDescriptionView requires cc.ScrollView.EventType scrolling events.");
    }
    if (!cc.Node.EventType || !cc.Node.EventType.POSITION_CHANGED) {
      throw new Error("PropDescriptionView requires cc.Node.EventType.POSITION_CHANGED.");
    }
    this._nodes.scrollView.node.on(cc.ScrollView.EventType.SCROLLING, this._syncScrollingProxies, this);
    this._nodes.scrollView.node.on(cc.ScrollView.EventType.SCROLL_ENDED, this._syncScrollingProxies, this);
    this._nodes.contentNode.on(cc.Node.EventType.POSITION_CHANGED, this._syncScrollingProxies, this);
    this._scrollProxySyncBound = true;
  }
};

PropDescriptionViewController.prototype._syncScrollingProxies = function () {
  if (!this._itemProxyRoot || !this._itemProxyRoot.isValid) {
    throw new Error("PropDescriptionView item proxy root is required before scroll sync.");
  }
  if (!this._itemProxyLayers || typeof this._itemProxyLayers !== "object") {
    throw new Error("PropDescriptionView item proxy layers are required before scroll sync.");
  }
  SpriteProxyLayerHelper.syncRecords(this._itemProxyRecords, this._itemProxyRoot);
  this._syncStaticProxies();
};

PropDescriptionViewController.prototype._rebuildItems = function (definitions, spriteFrameCache) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("PropDescriptionView definitions must be a non-empty array.");
  }
  this._clearItemProxies();
  this._nodes.contentLayout.enabled = true;

  this._itemNodes.forEach(function (itemNode) {
    if (itemNode !== this._nodes.templateNode && itemNode && itemNode.isValid) {
      itemNode.removeFromParent(false);
      itemNode.destroy();
    }
  }, this);
  this._itemNodes = [];

  definitions.forEach(function (definition, index) {
    requireObject(definition, "PropDescriptionView definition");
    var itemNode = index === 0 ? this._nodes.templateNode : cc.instantiate(this._nodes.templateNode);
    if (index > 0) {
      itemNode.parent = this._nodes.contentNode;
    }
    itemNode.name = "item_" + definition.key;
    itemNode.zIndex = ITEM_SOURCE_NODE_Z_INDEX;
    itemNode.active = true;
    var iconNode = requireChildNode(itemNode, "icon", itemNode.name);
    setLabelText(requireChildNode(itemNode, "name", itemNode.name), definition.title, itemNode.name + "/name");
    setLabelText(requireChildNode(itemNode, "des", itemNode.name), definition.description, itemNode.name + "/des");
    setSpriteFrameToWidth(
      iconNode,
      requireSpriteFrame(spriteFrameCache, definition.iconPath),
      ICON_WIDTH,
      itemNode.name + "/icon"
    );
    this._itemNodes.push(itemNode);
  }, this);

  if (typeof this._nodes.contentLayout.updateLayout !== "function") {
    throw new Error("PropDescriptionView content Layout.updateLayout is required.");
  }
  this._nodes.contentLayout.updateLayout();
  this._nodes.contentLayout.enabled = false;
  this._nodes.contentNode.setPosition(0, this._nodes.listNode.height / 2);

  this._itemProxyRoot = SpriteProxyLayerHelper.createProxyRoot(this._nodes.contentNode, {
    name: ITEM_PROXY_ROOT_NAME,
    zIndex: ITEM_PROXY_ROOT_Z_INDEX
  });
  this._itemProxyLayers = SpriteProxyLayerHelper.createProxyLayers(this._itemProxyRoot, [
    { key: "background", name: "prop_description_item_background_layer", zIndex: 0 },
    { key: "icon", name: "prop_description_item_icon_layer", zIndex: 1 }
  ]);
  this._itemNodes.forEach(function (itemNode, index) {
    var iconNode = requireChildNode(itemNode, "icon", itemNode.name);
    SpriteProxyLayerHelper.setSpriteRenderEnabled(itemNode, false, "PropDescriptionView item background " + itemNode.name);
    SpriteProxyLayerHelper.setSpriteRenderEnabled(iconNode, false, "PropDescriptionView item icon " + itemNode.name);
    this._itemProxyRecords.push(SpriteProxyLayerHelper.createRecord({
      layerNode: this._itemProxyLayers.background,
      sourceNode: itemNode,
      rootNode: this._itemProxyRoot,
      name: "prop_description_item_bg_proxy_" + index,
      visible: true
    }));
    this._itemProxyRecords.push(SpriteProxyLayerHelper.createRecord({
      layerNode: this._itemProxyLayers.icon,
      sourceNode: iconNode,
      rootNode: this._itemProxyRoot,
      name: "prop_description_item_icon_proxy_" + index,
      visible: true
    }));
  }, this);

  this._bindScrollProxySync();
  this._nodes.scrollView.stopAutoScroll();
  this._nodes.scrollView.scrollToTop(0);
  this._syncScrollingProxies();
};

PropDescriptionViewController.prototype.render = function (options) {
  requireObject(options, "PropDescriptionView render options");
  var definitions = PropDescriptionConfig.buildListDefinitions();
  this._rebuildItems(definitions, options.spriteFrameCache);
  this._syncStaticProxies();
};

module.exports = PropDescriptionViewController;
