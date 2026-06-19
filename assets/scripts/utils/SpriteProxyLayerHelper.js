"use strict";

var SpriteProxyAutoSync = cc.Class({
  extends: cc.Component,
  update: function () {
    if (!this.proxyRoot || !this.proxyRoot.isValid) {
      throw new Error("SpriteProxyAutoSync requires proxyRoot.");
    }
    syncRecords(this.records, this.proxyRoot);
  }
});

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function assertValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function getComponentIfAvailable(node, componentClass) {
  assertValidNode(node, "SpriteProxyLayerHelper component node");
  if (!cc.Node || typeof cc.Node.isNode !== "function") {
    throw new Error("SpriteProxyLayerHelper requires cc.Node.isNode.");
  }
  if (!cc.Node.isNode(node)) {
    return null;
  }
  return node.getComponent(componentClass);
}

function requireSprite(node, description) {
  assertValidNode(node, description + " node");
  var sprite = getComponentIfAvailable(node, cc.Sprite);
  if (!sprite) {
    throw new Error(description + " requires cc.Sprite.");
  }
  return sprite;
}

function setSpriteRenderEnabled(node, enabled, description) {
  requireSprite(node, description).enabled = enabled === true;
}

function requireNodeSize(node, description) {
  assertValidNode(node, description);
  var size = node.getContentSize();
  if (!size || !Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error(description + " size must be valid.");
  }
  return size;
}

function createProxyRoot(parentNode, options) {
  assertValidNode(parentNode, "SpriteProxyLayerHelper parentNode");
  assertObject(options, "SpriteProxyLayerHelper root options");
  if (typeof options.name !== "string" || options.name.length === 0) {
    throw new Error("SpriteProxyLayerHelper root options.name is required.");
  }

  var existingRoot = parentNode.getChildByName(options.name);
  if (existingRoot && existingRoot.isValid) {
    disposeProxyRoot(parentNode, existingRoot, options.name);
  }

  var parentSize = requireNodeSize(parentNode, "SpriteProxyLayerHelper parentNode");
  var rootNode = new cc.Node(options.name);
  rootNode.parent = parentNode;
  rootNode.setAnchorPoint(0.5, 0.5);
  rootNode.setContentSize(parentSize.width, parentSize.height);
  rootNode.setPosition(0, 0);
  rootNode.zIndex = options.zIndex;
  return rootNode;
}

function disposeProxyRoot(parentNode, proxyRoot, proxyRootName) {
  assertValidNode(parentNode, "SpriteProxyLayerHelper dispose proxy parentNode");
  assertValidNode(proxyRoot, "SpriteProxyLayerHelper dispose proxy root");
  if (typeof proxyRootName !== "string" || proxyRootName.length === 0) {
    throw new Error("SpriteProxyLayerHelper dispose proxy root name is required.");
  }

  var autoSync = proxyRoot.getComponent(SpriteProxyAutoSync);
  if (autoSync) {
    autoSync.enabled = false;
    autoSync.records = [];
    autoSync.proxyRoot = null;
  }

  if (parentNode.__spriteProxyAutoRoot === proxyRoot) {
    if (!Array.isArray(parentNode.__spriteProxyAutoRecords)) {
      throw new Error("SpriteProxyLayerHelper auto proxy records are missing before destroy: " + proxyRootName);
    }
    clearRecords(parentNode.__spriteProxyAutoRecords);
    parentNode.__spriteProxyAutoRoot = null;
    parentNode.__spriteProxyAutoRecords = null;
  }

  proxyRoot.destroy();
}

function destroyProxyRoot(parentNode, proxyRootName) {
  assertValidNode(parentNode, "SpriteProxyLayerHelper destroy proxy parentNode");
  if (typeof proxyRootName !== "string" || proxyRootName.length === 0) {
    throw new Error("SpriteProxyLayerHelper destroy proxy root name is required.");
  }
  var autoRoot = parentNode.__spriteProxyAutoRoot;
  if (autoRoot && autoRoot.name === proxyRootName) {
    if (autoRoot.isValid) {
      disposeProxyRoot(parentNode, autoRoot, proxyRootName);
      return;
    }
    if (!Array.isArray(parentNode.__spriteProxyAutoRecords)) {
      throw new Error("SpriteProxyLayerHelper auto proxy records are missing before destroy: " + proxyRootName);
    }
    clearRecords(parentNode.__spriteProxyAutoRecords);
    parentNode.__spriteProxyAutoRoot = null;
    parentNode.__spriteProxyAutoRecords = null;
    return;
  }
  var existingRoot = parentNode.getChildByName(proxyRootName);
  if (existingRoot && existingRoot.isValid) {
    disposeProxyRoot(parentNode, existingRoot, proxyRootName);
  }
}

function getAutoProxyRoot(parentNode, proxyRootName) {
  assertValidNode(parentNode, "SpriteProxyLayerHelper auto proxy parentNode");
  if (typeof proxyRootName !== "string" || proxyRootName.length === 0) {
    throw new Error("SpriteProxyLayerHelper auto proxy root name is required.");
  }
  var proxyRoot = parentNode.getChildByName(proxyRootName);
  if (!proxyRoot || !proxyRoot.isValid) {
    return null;
  }
  return proxyRoot;
}

function createProxyLayer(rootNode, layerName, zIndex) {
  assertValidNode(rootNode, "SpriteProxyLayerHelper rootNode");
  if (typeof layerName !== "string" || layerName.length === 0) {
    throw new Error("SpriteProxyLayerHelper layerName is required.");
  }
  if (!Number.isFinite(zIndex)) {
    throw new Error("SpriteProxyLayerHelper layer zIndex must be finite: " + layerName);
  }

  var layerNode = new cc.Node(layerName);
  layerNode.parent = rootNode;
  layerNode.setAnchorPoint(0.5, 0.5);
  layerNode.setContentSize(rootNode.getContentSize());
  layerNode.setPosition(0, 0);
  layerNode.zIndex = zIndex;
  return layerNode;
}

function createProxyLayers(rootNode, layerConfigs) {
  if (!Array.isArray(layerConfigs) || layerConfigs.length === 0) {
    throw new Error("SpriteProxyLayerHelper layerConfigs must be a non-empty array.");
  }

  var layers = {};
  layerConfigs.forEach(function (config) {
    assertObject(config, "SpriteProxyLayerHelper layer config");
    if (typeof config.key !== "string" || config.key.length === 0) {
      throw new Error("SpriteProxyLayerHelper layer config.key is required.");
    }
    if (layers[config.key]) {
      throw new Error("SpriteProxyLayerHelper duplicate layer key: " + config.key);
    }
    layers[config.key] = createProxyLayer(rootNode, config.name, config.zIndex);
  });
  return layers;
}

function clearRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error("SpriteProxyLayerHelper records must be an array.");
  }
  records.forEach(function (record) {
    restoreRecordSourceRender(record);
    if (record && record.proxyNode && record.proxyNode.isValid) {
      record.proxyNode.destroy();
    }
  });
  records.length = 0;
}

function restoreRecordSourceRender(record) {
  if (!record) {
    return;
  }
  if (!record.sourceNode || !record.sourceNode.isValid) {
    return;
  }
  if (typeof record.restoreSourceRenderEnabled !== "boolean") {
    throw new Error("SpriteProxyLayerHelper record restoreSourceRenderEnabled is required.");
  }
  setSpriteRenderEnabled(
    record.sourceNode,
    record.restoreSourceRenderEnabled,
    "SpriteProxyLayerHelper restore source " + record.sourceNode.name
  );
}

function resolveScaleToAncestor(node, ancestorNode, description) {
  var scaleX = 1;
  var scaleY = 1;
  var cursor = node;
  while (cursor && cursor.isValid && cursor !== ancestorNode) {
    if (!Number.isFinite(cursor.scaleX) || !Number.isFinite(cursor.scaleY)) {
      throw new Error(description + " scale must be finite.");
    }
    scaleX *= cursor.scaleX;
    scaleY *= cursor.scaleY;
    cursor = cursor.parent;
  }
  if (cursor !== ancestorNode) {
    throw new Error(description + " must be under the proxy root parent.");
  }
  return {
    x: scaleX,
    y: scaleY
  };
}

function resolveOpacityToAncestor(node, ancestorNode, description) {
  var opacity = 255;
  var cursor = node;
  while (cursor && cursor.isValid && cursor !== ancestorNode) {
    if (!Number.isFinite(cursor.opacity)) {
      throw new Error(description + " opacity must be finite.");
    }
    opacity = opacity * cursor.opacity / 255;
    cursor = cursor.parent;
  }
  if (cursor !== ancestorNode) {
    throw new Error(description + " must be under the proxy root parent.");
  }
  return Math.max(0, Math.min(255, Math.round(opacity)));
}

function syncRecord(record, rootNode) {
  assertObject(record, "SpriteProxyLayerHelper record");
  assertValidNode(record.sourceNode, "SpriteProxyLayerHelper source node");
  assertValidNode(record.proxyNode, "SpriteProxyLayerHelper proxy node");
  assertValidNode(rootNode, "SpriteProxyLayerHelper root node");
  assertValidNode(rootNode.parent, "SpriteProxyLayerHelper root parent");

  var sourceSprite = requireSprite(record.sourceNode, "SpriteProxyLayerHelper source " + record.sourceNode.name);
  var proxySprite = requireSprite(record.proxyNode, "SpriteProxyLayerHelper proxy " + record.proxyNode.name);
  if (record.visible === true && !sourceSprite.spriteFrame) {
    throw new Error("SpriteProxyLayerHelper source spriteFrame is missing: " + record.sourceNode.name);
  }

  var size = requireNodeSize(record.sourceNode, "SpriteProxyLayerHelper source " + record.sourceNode.name);
  var worldPosition = record.sourceNode.convertToWorldSpaceAR(cc.v2(0, 0));
  var localPosition = rootNode.convertToNodeSpaceAR(worldPosition);
  var scale = resolveScaleToAncestor(record.sourceNode, rootNode.parent, "SpriteProxyLayerHelper source " + record.sourceNode.name);

  proxySprite.spriteFrame = sourceSprite.spriteFrame;
  proxySprite.type = sourceSprite.type;
  proxySprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  proxySprite.trim = sourceSprite.trim;
  record.proxyNode.active = record.visible === true && record.sourceNode.active === true;
  record.proxyNode.opacity = resolveOpacityToAncestor(record.sourceNode, rootNode.parent, "SpriteProxyLayerHelper source " + record.sourceNode.name);
  record.proxyNode.color = record.sourceNode.color;
  record.proxyNode.setAnchorPoint(record.sourceNode.getAnchorPoint());
  record.proxyNode.setContentSize(size.width, size.height);
  record.proxyNode.setPosition(localPosition);
  record.proxyNode.setScale(scale.x, scale.y);
}

function createRecord(options) {
  assertObject(options, "SpriteProxyLayerHelper createRecord options");
  assertValidNode(options.layerNode, "SpriteProxyLayerHelper layerNode");
  assertValidNode(options.sourceNode, "SpriteProxyLayerHelper sourceNode");
  assertValidNode(options.rootNode, "SpriteProxyLayerHelper rootNode");
  if (typeof options.name !== "string" || options.name.length === 0) {
    throw new Error("SpriteProxyLayerHelper record name is required.");
  }

  var sourceSprite = requireSprite(options.sourceNode, "SpriteProxyLayerHelper source " + options.name);
  var sourceRenderEnabled = options.sourceRenderEnabled;
  if (sourceRenderEnabled === undefined) {
    sourceRenderEnabled = sourceSprite.enabled === true;
  }
  if (typeof sourceRenderEnabled !== "boolean") {
    throw new Error("SpriteProxyLayerHelper sourceRenderEnabled must be boolean: " + options.name);
  }
  var restoreSourceRenderEnabled = options.restoreSourceRenderEnabled;
  if (restoreSourceRenderEnabled === undefined) {
    restoreSourceRenderEnabled = true;
  }
  if (typeof restoreSourceRenderEnabled !== "boolean") {
    throw new Error("SpriteProxyLayerHelper restoreSourceRenderEnabled must be boolean: " + options.name);
  }
  var proxyNode = new cc.Node(options.name);
  proxyNode.parent = options.layerNode;
  proxyNode.addComponent(cc.Sprite);
  var record = {
    sourceNode: options.sourceNode,
    proxyNode: proxyNode,
    sourceRenderEnabled: sourceRenderEnabled,
    restoreSourceRenderEnabled: restoreSourceRenderEnabled,
    visible: options.visible === true
  };
  syncRecord(record, options.rootNode);
  return record;
}

function syncRecords(records, rootNode) {
  if (!Array.isArray(records)) {
    throw new Error("SpriteProxyLayerHelper records must be an array.");
  }
  records.forEach(function (record) {
    syncRecord(record, rootNode);
  });
}

function isDescendantOf(node, ancestorNode) {
  assertValidNode(node, "SpriteProxyLayerHelper descendant node");
  assertValidNode(ancestorNode, "SpriteProxyLayerHelper ancestor node");
  var cursor = node;
  while (cursor && cursor.isValid) {
    if (cursor === ancestorNode) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function isExcludedByRoot(node, excludedRoots) {
  if (!Array.isArray(excludedRoots)) {
    throw new Error("SpriteProxyLayerHelper excludedRoots must be an array.");
  }
  for (var index = 0; index < excludedRoots.length; index += 1) {
    var excludedRoot = excludedRoots[index];
    if (!excludedRoot || !excludedRoot.isValid) {
      throw new Error("SpriteProxyLayerHelper excluded root is invalid.");
    }
    if (isDescendantOf(node, excludedRoot)) {
      return true;
    }
  }
  return false;
}

function isProxyNode(node, proxyRootName) {
  var cursor = node;
  while (cursor && cursor.isValid) {
    if (cursor.name === proxyRootName) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function isProgressBarFillNode(node) {
  assertValidNode(node, "SpriteProxyLayerHelper progress bar fill node");
  var cursor = node.parent;
  while (cursor && cursor.isValid) {
    if (getComponentIfAvailable(cursor, cc.ProgressBar)) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function collectAutoProxySprites(rootNode, options, output) {
  assertValidNode(rootNode, "SpriteProxyLayerHelper auto proxy root source");
  assertObject(options, "SpriteProxyLayerHelper auto proxy options");
  if (!Array.isArray(output)) {
    throw new Error("SpriteProxyLayerHelper auto proxy output must be an array.");
  }
  if (rootNode.active !== true) {
    return;
  }
  if (isProxyNode(rootNode, options.proxyRootName)) {
    return;
  }
  if (isExcludedByRoot(rootNode, options.excludeRoots)) {
    return;
  }

  var sprite = getComponentIfAvailable(rootNode, cc.Sprite);
  var mask = getComponentIfAvailable(rootNode, cc.Mask);
  if (sprite && !mask && !isProgressBarFillNode(rootNode)) {
    output.push(rootNode);
  }

  var children = rootNode.children;
  if (!Array.isArray(children)) {
    throw new Error("SpriteProxyLayerHelper auto proxy children must be an array: " + rootNode.name);
  }
  children.forEach(function (child) {
    collectAutoProxySprites(child, options, output);
  });
}

function classifyAutoProxyLayer(node) {
  assertValidNode(node, "SpriteProxyLayerHelper auto proxy layer node");
  var name = String(node.name || "").toLowerCase();
  if (name === "mask" || name.indexOf("mask") >= 0) {
    return "mask";
  }
  if (name === "check_box") {
    return "background";
  }
  if (getComponentIfAvailable(node, cc.Button) || name.indexOf("btn") >= 0 || name.indexOf("button") >= 0 || name.indexOf("toggle") >= 0) {
    return "control";
  }
  if (
    name.indexOf("icon") >= 0 ||
    name.indexOf("star") >= 0 ||
    name.indexOf("gift") >= 0 ||
    name.indexOf("award") >= 0 ||
    name.indexOf("paopao") >= 0 ||
    name.indexOf("gou") >= 0 ||
    name === "select" ||
    name === "checkmark"
  ) {
    return "content";
  }
  return "background";
}

function rebuildAutoProxyTree(options) {
  assertObject(options, "SpriteProxyLayerHelper auto proxy options");
  var rootNode = assertValidNode(options.rootNode, "SpriteProxyLayerHelper auto proxy rootNode");
  var proxyRootName = options.proxyRootName;
  if (typeof proxyRootName !== "string" || proxyRootName.length === 0) {
    throw new Error("SpriteProxyLayerHelper auto proxy root name is required.");
  }
  var excludeRoots = Array.isArray(options.excludeRoots) ? options.excludeRoots : [];
  var collectOptions = {
    proxyRootName: proxyRootName,
    excludeRoots: excludeRoots
  };
  var sourceNodes = [];
  collectAutoProxySprites(rootNode, collectOptions, sourceNodes);
  if (sourceNodes.length === 0) {
    throw new Error("SpriteProxyLayerHelper auto proxy found no source sprites: " + proxyRootName);
  }

  var proxyRoot = createProxyRoot(rootNode, {
    name: proxyRootName,
    zIndex: Number.isFinite(options.zIndex) ? options.zIndex : -1
  });
  var layers = createProxyLayers(proxyRoot, [
    { key: "mask", name: proxyRootName + "_mask_layer", zIndex: -1 },
    { key: "background", name: proxyRootName + "_background_layer", zIndex: 0 },
    { key: "content", name: proxyRootName + "_content_layer", zIndex: 1 },
    { key: "control", name: proxyRootName + "_control_layer", zIndex: 2 }
  ]);
  var records = [];
  sourceNodes.forEach(function (sourceNode, index) {
    var sourceRenderEnabled = requireSprite(sourceNode, "SpriteProxyLayerHelper auto proxy source " + sourceNode.name).enabled === true;
    setSpriteRenderEnabled(sourceNode, false, "SpriteProxyLayerHelper auto proxy source " + sourceNode.name);
    records.push(createRecord({
      layerNode: layers[classifyAutoProxyLayer(sourceNode)],
      sourceNode: sourceNode,
      rootNode: proxyRoot,
      name: proxyRootName + "_sprite_" + index,
      sourceRenderEnabled: sourceRenderEnabled,
      restoreSourceRenderEnabled: true,
      visible: true
    }));
  });
  rootNode.__spriteProxyAutoRecords = records;
  rootNode.__spriteProxyAutoRoot = proxyRoot;
  if (options.autoSync !== false) {
    var autoSync = proxyRoot.addComponent(SpriteProxyAutoSync);
    autoSync.proxyRoot = proxyRoot;
    autoSync.records = records;
  }
  return {
    rootNode: proxyRoot,
    records: records
  };
}

function hasAutoProxyTree(parentNode, proxyRootName) {
  return !!getAutoProxyRoot(parentNode, proxyRootName);
}

function syncAutoProxyTree(parentNode, proxyRootName) {
  var proxyRoot = getAutoProxyRoot(parentNode, proxyRootName);
  if (!proxyRoot) {
    throw new Error("SpriteProxyLayerHelper auto proxy root is missing: " + proxyRootName);
  }
  if (!Array.isArray(parentNode.__spriteProxyAutoRecords)) {
    throw new Error("SpriteProxyLayerHelper auto proxy records are missing: " + proxyRootName);
  }
  syncRecords(parentNode.__spriteProxyAutoRecords, proxyRoot);
}

function syncAutoProxyNode(parentNode, proxyRootName, sourceNode) {
  var proxyRoot = getAutoProxyRoot(parentNode, proxyRootName);
  if (!proxyRoot) {
    throw new Error("SpriteProxyLayerHelper auto proxy root is missing: " + proxyRootName);
  }
  if (!Array.isArray(parentNode.__spriteProxyAutoRecords)) {
    throw new Error("SpriteProxyLayerHelper auto proxy records are missing: " + proxyRootName);
  }
  assertValidNode(sourceNode, "SpriteProxyLayerHelper auto proxy sourceNode");
  for (var index = 0; index < parentNode.__spriteProxyAutoRecords.length; index += 1) {
    var record = parentNode.__spriteProxyAutoRecords[index];
    if (record && record.sourceNode === sourceNode) {
      syncRecord(record, proxyRoot);
      return;
    }
  }
  throw new Error("SpriteProxyLayerHelper auto proxy record is missing for source: " + sourceNode.name);
}

module.exports = {
  clearRecords: clearRecords,
  createProxyRoot: createProxyRoot,
  createProxyLayers: createProxyLayers,
  createRecord: createRecord,
  destroyProxyRoot: destroyProxyRoot,
  hasAutoProxyTree: hasAutoProxyTree,
  requireNodeSize: requireNodeSize,
  requireSprite: requireSprite,
  rebuildAutoProxyTree: rebuildAutoProxyTree,
  setSpriteRenderEnabled: setSpriteRenderEnabled,
  syncAutoProxyNode: syncAutoProxyNode,
  syncAutoProxyTree: syncAutoProxyTree,
  syncRecords: syncRecords
};
