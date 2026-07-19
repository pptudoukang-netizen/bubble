"use strict";

var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var ITEM_HEIGHT = 56;
var VIEWPORT_WIDTH = 360;
var VIEWPORT_HEIGHT = ITEM_HEIGHT * 7;
var VIRTUAL_LIST_THRESHOLD = 200;
var ROW_POOL_SIZE = Math.ceil(VIEWPORT_HEIGHT / ITEM_HEIGHT) + 4;
var STATIC_PROXY_ROOT_NAME = "map_editor_picker_static_proxy_root";
var ROW_PROXY_ROOT_NAME = "map_editor_picker_row_proxy_root";

function MapEditorLevelPicker(hostNode) {
  if (!hostNode || !hostNode.isValid) {
    throw new Error("MapEditorLevelPicker hostNode 无效。");
  }
  this._hostNode = hostNode;
  this._overlayNode = null;
  this._scrollView = null;
  this._contentNode = null;
  this._rowNodes = [];
  this._levelIds = [];
  this._selectedLevelId = 0;
  this._useVirtualList = false;
  this._onSelect = null;
  this._solidSpriteFrame = null;
  this._staticProxyRoot = null;
  this._staticProxyRecords = [];
  this._rowProxyRoot = null;
  this._rowProxyRecords = [];
  this._titleLabel = null;
}

MapEditorLevelPicker.prototype.open = function (levelIds, selectedLevelId, onSelect) {
  if (!Array.isArray(levelIds) || !levelIds.length) {
    throw new Error("关卡列表不能为空。");
  }
  if (!Number.isInteger(selectedLevelId) || selectedLevelId <= 0) {
    throw new Error("selectedLevelId 必须是正整数。");
  }
  if (typeof onSelect !== "function") {
    throw new Error("MapEditorLevelPicker.onSelect 必须是函数。");
  }

  this.close();
  this._levelIds = levelIds.slice().sort(function (left, right) {
    return left - right;
  });
  this._useVirtualList = this._levelIds.length > VIRTUAL_LIST_THRESHOLD;
  this._selectedLevelId = selectedLevelId;
  this._onSelect = onSelect;
  this._buildOverlay();
  this._scrollToLevel(selectedLevelId, false);
  if (this._useVirtualList) {
    this._updateVirtualRows();
  } else {
    this._refreshRowVisuals();
  }
};

MapEditorLevelPicker.prototype.close = function () {
  if (this._scrollView && this._scrollView.node && this._scrollView.node.isValid) {
    this._scrollView.node.off(cc.ScrollView.EventType.SCROLLING, this._updateVirtualRows, this);
    this._scrollView.node.off(cc.ScrollView.EventType.SCROLL_ENDED, this._updateVirtualRows, this);
  }
  if (this._contentNode && this._contentNode.isValid) {
    this._contentNode.off(cc.Node.EventType.POSITION_CHANGED, this._updateVirtualRows, this);
  }
  if (this._overlayNode && this._overlayNode.isValid) {
    this._overlayNode.destroy();
  }
  this._overlayNode = null;
  this._scrollView = null;
  this._contentNode = null;
  this._rowNodes = [];
  this._onSelect = null;
  this._staticProxyRoot = null;
  this._staticProxyRecords = [];
  this._rowProxyRoot = null;
  this._rowProxyRecords = [];
  this._titleLabel = null;
};

MapEditorLevelPicker.prototype._buildOverlay = function () {
  var overlay = new cc.Node("map_editor_level_picker");
  overlay.parent = this._hostNode;
  overlay.setContentSize(this._hostNode.width, this._hostNode.height);
  overlay.setPosition(0, 0);
  overlay.zIndex = 1000;

  var solidFrame = this._createSolidSpriteFrame();

  var mask = new cc.Node("mask");
  mask.parent = overlay;
  mask.setContentSize(overlay.width, overlay.height);
  var maskSprite = mask.addComponent(cc.Sprite);
  maskSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  maskSprite.spriteFrame = solidFrame;
  mask.color = cc.color(0, 0, 0, 160);
  mask.on(cc.Node.EventType.TOUCH_END, this.close, this);

  var panel = new cc.Node("panel");
  panel.parent = overlay;
  panel.setContentSize(VIEWPORT_WIDTH + 40, VIEWPORT_HEIGHT + 80);
  var panelSprite = panel.addComponent(cc.Sprite);
  panelSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  panelSprite.spriteFrame = solidFrame;
  panel.color = cc.color(42, 48, 58, 240);

  var titleNode = new cc.Node("title");
  titleNode.parent = panel;
  titleNode.setPosition(0, VIEWPORT_HEIGHT * 0.5 + 16);
  var titleLabel = titleNode.addComponent(cc.Label);
  titleLabel.string = "选择关卡（共 " + this._levelIds.length + " 关）";
  titleLabel.useSystemFont = true;
  titleLabel.fontFamily = "Arial";
  titleLabel.fontSize = 28;
  titleLabel.lineHeight = 32;
  titleLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;

  var scrollRoot = new cc.Node("scroll");
  scrollRoot.parent = panel;
  scrollRoot.setContentSize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  scrollRoot.setPosition(0, 0);

  var viewport = new cc.Node("view");
  viewport.parent = scrollRoot;
  viewport.setContentSize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  viewport.setAnchorPoint(0.5, 0.5);
  viewport.setPosition(0, 0);
  viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;

  var contentHeight = this._levelIds.length * ITEM_HEIGHT;
  var content = new cc.Node("content");
  content.parent = viewport;
  content.setAnchorPoint(0.5, 1);
  content.setContentSize(VIEWPORT_WIDTH, contentHeight);
  content.setPosition(0, VIEWPORT_HEIGHT * 0.5);

  var scrollView = scrollRoot.addComponent(cc.ScrollView);
  scrollView.horizontal = false;
  scrollView.vertical = true;
  scrollView.inertia = true;
  scrollView.brake = 0.55;
  scrollView.elastic = false;
  scrollView.content = content;

  this._overlayNode = overlay;
  this._scrollView = scrollView;
  this._contentNode = content;
  this._titleLabel = titleLabel;

  if (this._useVirtualList) {
    scrollView.node.on(cc.ScrollView.EventType.SCROLLING, this._updateVirtualRows, this);
    scrollView.node.on(cc.ScrollView.EventType.SCROLL_ENDED, this._updateVirtualRows, this);
    content.on(cc.Node.EventType.POSITION_CHANGED, this._updateVirtualRows, this);
    this._buildVirtualRowPool();
  } else {
    this._buildAllRows();
  }
  this._buildSpriteProxyLayers(mask, panel);
};

MapEditorLevelPicker.prototype._createRowNode = function (levelId) {
  var rowNode = new cc.Node("picker_row_" + levelId);
  rowNode.setContentSize(VIEWPORT_WIDTH, ITEM_HEIGHT);
  rowNode.setAnchorPoint(0.5, 0.5);
  rowNode.__pickerLevelId = levelId;

  var bgNode = new cc.Node("bg");
  bgNode.parent = rowNode;
  bgNode.setContentSize(VIEWPORT_WIDTH - 24, ITEM_HEIGHT - 8);
  var bgSprite = bgNode.addComponent(cc.Sprite);
  bgSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  bgSprite.spriteFrame = this._createSolidSpriteFrame();
  bgNode.color = cc.color(68, 78, 92, 255);

  var labelNode = new cc.Node("label");
  labelNode.parent = rowNode;
  labelNode.setContentSize(VIEWPORT_WIDTH - 24, ITEM_HEIGHT);
  var label = labelNode.addComponent(cc.Label);
  label.useSystemFont = true;
  label.fontFamily = "Arial";
  label.fontSize = 26;
  label.lineHeight = 30;
  label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.string = "第" + levelId + "关";

  rowNode.on(cc.Node.EventType.TOUCH_END, function () {
    if (!Number.isInteger(rowNode.__pickerLevelId) || rowNode.__pickerLevelId <= 0) {
      throw new Error("MapEditorLevelPicker row levelId 非法。");
    }
    this._handleSelect(rowNode.__pickerLevelId);
  }, this);

  return rowNode;
};

MapEditorLevelPicker.prototype._buildAllRows = function () {
  if (!this._contentNode || !this._contentNode.isValid) {
    throw new Error("MapEditorLevelPicker content 未就绪。");
  }

  this._rowNodes = [];
  for (var rowIndex = 0; rowIndex < this._levelIds.length; rowIndex += 1) {
    var levelId = this._levelIds[rowIndex];
    var rowNode = this._createRowNode(levelId);
    rowNode.parent = this._contentNode;
    rowNode.y = this._resolveRowY(rowIndex);
    this._rowNodes.push(rowNode);
  }
};

MapEditorLevelPicker.prototype._buildVirtualRowPool = function () {
  if (!this._contentNode || !this._contentNode.isValid) {
    throw new Error("MapEditorLevelPicker content 未就绪。");
  }

  this._rowNodes = [];
  for (var index = 0; index < ROW_POOL_SIZE; index += 1) {
    var rowNode = this._createRowNode(0);
    rowNode.parent = this._contentNode;
    rowNode.active = false;
    this._rowNodes.push(rowNode);
  }
};

MapEditorLevelPicker.prototype._resolveRowY = function (rowIndex) {
  return -(ITEM_HEIGHT * 0.5) - (rowIndex * ITEM_HEIGHT);
};

MapEditorLevelPicker.prototype._createSolidSpriteFrame = function () {
  if (this._solidSpriteFrame) {
    return this._solidSpriteFrame;
  }
  var texture = new cc.Texture2D();
  texture.initWithData(new Uint8Array([255, 255, 255, 255]), cc.Texture2D.PixelFormat.RGBA8888, 1, 1);
  this._solidSpriteFrame = new cc.SpriteFrame(texture);
  return this._solidSpriteFrame;
};

MapEditorLevelPicker.prototype._createProxyRecord = function (layerNode, rootNode, sourceNode, name, visible) {
  var sprite = SpriteProxyLayerHelper.requireSprite(sourceNode, "MapEditorLevelPicker proxy source " + name);
  if (!sprite.spriteFrame) {
    throw new Error("MapEditorLevelPicker proxy source spriteFrame 缺失: " + name);
  }
  SpriteProxyLayerHelper.setSpriteRenderEnabled(sourceNode, false, "MapEditorLevelPicker proxy source " + name);
  return SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: rootNode,
    name: name,
    sourceRenderEnabled: true,
    restoreSourceRenderEnabled: true,
    visible: visible === true
  });
};

MapEditorLevelPicker.prototype._buildSpriteProxyLayers = function (maskNode, panelNode) {
  if (!this._overlayNode || !this._overlayNode.isValid) {
    throw new Error("MapEditorLevelPicker overlay 未就绪，无法创建 Sprite 代理层。");
  }
  if (!this._contentNode || !this._contentNode.isValid) {
    throw new Error("MapEditorLevelPicker content 未就绪，无法创建 Sprite 代理层。");
  }
  this._staticProxyRoot = SpriteProxyLayerHelper.createProxyRoot(this._overlayNode, {
    name: STATIC_PROXY_ROOT_NAME,
    zIndex: -1
  });
  var staticLayers = SpriteProxyLayerHelper.createProxyLayers(this._staticProxyRoot, [
    { key: "mask", name: "map_editor_picker_mask_proxy_layer", zIndex: 0 },
    { key: "panel", name: "map_editor_picker_panel_proxy_layer", zIndex: 1 }
  ]);
  this._staticProxyRecords = [
    this._createProxyRecord(staticLayers.mask, this._staticProxyRoot, maskNode, "map_editor_picker_mask_proxy", true),
    this._createProxyRecord(staticLayers.panel, this._staticProxyRoot, panelNode, "map_editor_picker_panel_proxy", true)
  ];

  this._rowProxyRoot = SpriteProxyLayerHelper.createProxyRoot(this._contentNode, {
    name: ROW_PROXY_ROOT_NAME,
    zIndex: -1
  });
  var rowLayers = SpriteProxyLayerHelper.createProxyLayers(this._rowProxyRoot, [
    { key: "background", name: "map_editor_picker_row_background_proxy_layer", zIndex: 0 }
  ]);
  this._rowProxyRecords = this._rowNodes.map(function (rowNode, index) {
    var bgNode = rowNode.getChildByName("bg");
    if (!bgNode || !bgNode.isValid) {
      throw new Error("MapEditorLevelPicker row 缺少 bg: " + index);
    }
    var record = this._createProxyRecord(
      rowLayers.background,
      this._rowProxyRoot,
      bgNode,
      "map_editor_picker_row_bg_proxy_" + index,
      rowNode.active === true
    );
    record.rowNode = rowNode;
    return record;
  }, this);
  SpriteProxyLayerHelper.syncRecords(this._staticProxyRecords, this._staticProxyRoot);
  this._syncRowProxyRecords();
};

MapEditorLevelPicker.prototype._syncRowProxyRecords = function () {
  if (!this._rowProxyRoot || !this._rowProxyRoot.isValid) {
    throw new Error("MapEditorLevelPicker row Sprite 代理层未初始化。");
  }
  this._rowProxyRecords.forEach(function (record, index) {
    if (!record || !record.rowNode || !record.rowNode.isValid) {
      throw new Error("MapEditorLevelPicker row Sprite 代理记录无效: " + index);
    }
    record.visible = record.rowNode.active === true;
  });
  SpriteProxyLayerHelper.syncRecords(this._rowProxyRecords, this._rowProxyRoot);
};

MapEditorLevelPicker.prototype._levelIndexOf = function (levelId) {
  var index = this._levelIds.indexOf(levelId);
  if (index === -1) {
    throw new Error("关卡 id 不在列表中: " + levelId);
  }
  return index;
};

MapEditorLevelPicker.prototype._getMaxScrollOffset = function () {
  return Math.max(0, this._contentNode.height - VIEWPORT_HEIGHT);
};

MapEditorLevelPicker.prototype._scrollToLevel = function (levelId, animated) {
  var levelIndex = this._levelIndexOf(levelId);
  var maxOffset = this._getMaxScrollOffset();
  var targetOffset = levelIndex * ITEM_HEIGHT;
  if (targetOffset > maxOffset) {
    targetOffset = maxOffset;
  }
  if (targetOffset < 0) {
    targetOffset = 0;
  }
  if (levelIndex === 0 && typeof this._scrollView.scrollToTop === "function") {
    this._scrollView.scrollToTop(animated ? 0.2 : 0);
    return;
  }
  this._scrollView.scrollToOffset(cc.v2(0, targetOffset), animated ? 0.2 : 0);
};

MapEditorLevelPicker.prototype._refreshRowVisuals = function () {
  this._rowNodes.forEach(function (rowNode) {
    var levelId = rowNode.__pickerLevelId;
    var selected = levelId === this._selectedLevelId;
    var bgNode = rowNode.getChildByName("bg");
    bgNode.color = selected ? cc.color(96, 148, 118, 255) : cc.color(68, 78, 92, 255);
    rowNode.scale = selected ? 1.04 : 1;
  }.bind(this));
  if (this._rowProxyRoot) {
    this._syncRowProxyRecords();
  }
};

MapEditorLevelPicker.prototype._updateVirtualRows = function () {
  if (!this._useVirtualList || !this._scrollView || !this._contentNode || !this._levelIds.length) {
    return;
  }

  var offsetY = this._contentNode.y - (VIEWPORT_HEIGHT * 0.5);
  if (offsetY < 0) {
    offsetY = 0;
  }
  var maxOffset = this._getMaxScrollOffset();
  if (offsetY > maxOffset) {
    offsetY = maxOffset;
  }

  var firstVisibleIndex = Math.floor(offsetY / ITEM_HEIGHT);
  var lastVisibleIndex = Math.min(
    this._levelIds.length - 1,
    Math.ceil((offsetY + VIEWPORT_HEIGHT) / ITEM_HEIGHT) - 1
  );
  if (!this._titleLabel || !this._titleLabel.node || !this._titleLabel.node.isValid) {
    throw new Error("MapEditorLevelPicker title label 未初始化。");
  }
  this._titleLabel.string = "选择关卡（" + this._levelIds[firstVisibleIndex] + "-" + this._levelIds[lastVisibleIndex] + " / " + this._levelIds.length + "）";

  var poolIndex = 0;
  for (var rowIndex = firstVisibleIndex; rowIndex <= lastVisibleIndex; rowIndex += 1) {
    if (poolIndex >= this._rowNodes.length) {
      break;
    }
    var rowNode = this._rowNodes[poolIndex];
    poolIndex += 1;

    var levelId = this._levelIds[rowIndex];
    rowNode.active = true;
    rowNode.y = this._resolveRowY(rowIndex);
    rowNode.__pickerLevelId = levelId;

    var label = rowNode.getChildByName("label").getComponent(cc.Label);
    label.string = "第" + levelId + "关";

    var selected = levelId === this._selectedLevelId;
    var bgNode = rowNode.getChildByName("bg");
    bgNode.color = selected ? cc.color(96, 148, 118, 255) : cc.color(68, 78, 92, 255);
    rowNode.scale = selected ? 1.04 : 1;
  }

  for (; poolIndex < this._rowNodes.length; poolIndex += 1) {
    this._rowNodes[poolIndex].active = false;
  }
  if (this._rowProxyRoot) {
    this._syncRowProxyRecords();
  }
};

MapEditorLevelPicker.prototype._handleSelect = function (levelId) {
  if (typeof this._onSelect !== "function") {
    throw new Error("MapEditorLevelPicker 缺少 onSelect 回调。");
  }
  this._selectedLevelId = levelId;
  this._onSelect(levelId);
  this.close();
};

module.exports = MapEditorLevelPicker;
