"use strict";

var LevelSelectMemoryDiagnostics = require("./LevelSelectMemoryDiagnostics");

function requireReleaseAsset() {
  if (!cc || !cc.assetManager || typeof cc.assetManager.releaseAsset !== "function") {
    throw new Error("UiModalReleaseHelper requires cc.assetManager.releaseAsset.");
  }
  return cc.assetManager.releaseAsset;
}

function releaseSpriteFrameAsset(spriteFrame, label) {
  if (!spriteFrame) {
    return;
  }
  requireReleaseAsset()(spriteFrame);
  LevelSelectMemoryDiagnostics.increment("uiModal.releaseSprite:" + label);
}

function releaseSpriteFrameMap(cacheMap, labelPrefix) {
  if (!cacheMap || typeof cacheMap !== "object" || Array.isArray(cacheMap)) {
    return;
  }
  Object.keys(cacheMap).forEach(function (key) {
    releaseSpriteFrameAsset(cacheMap[key], labelPrefix + "/" + key);
    delete cacheMap[key];
  });
}

function releaseCachedModal(host, config) {
  if (!host || typeof host !== "object" || Array.isArray(host)) {
    throw new Error("UiModalReleaseHelper host is required.");
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("UiModalReleaseHelper config is required.");
  }

  var label = config.label;
  if (typeof label !== "string" || !label) {
    throw new Error("UiModalReleaseHelper config.label is required.");
  }
  if (typeof config.nodeKey !== "string" || !config.nodeKey) {
    throw new Error("UiModalReleaseHelper config.nodeKey is required.");
  }
  if (typeof config.prefabKey !== "string" || !config.prefabKey) {
    throw new Error("UiModalReleaseHelper config.prefabKey is required.");
  }

  var node = host[config.nodeKey];
  if (node && cc.isValid(node)) {
    node.destroy();
  }
  host[config.nodeKey] = null;

  if (typeof config.controllerKey === "string" && config.controllerKey) {
    host[config.controllerKey] = null;
  }

  if (Array.isArray(config.extraNullKeys)) {
    config.extraNullKeys.forEach(function (key) {
      if (typeof key === "string" && key) {
        host[key] = null;
      }
    });
  }

  var prefab = host[config.prefabKey];
  if (prefab) {
    requireReleaseAsset()(prefab);
    LevelSelectMemoryDiagnostics.increment("uiModal.releasePrefab:" + label);
    host[config.prefabKey] = null;
  }

  if (typeof config.spriteFrameCacheKey === "string" && config.spriteFrameCacheKey) {
    releaseSpriteFrameMap(host[config.spriteFrameCacheKey], label + "/sprite");
    host[config.spriteFrameCacheKey] = null;
  }

  LevelSelectMemoryDiagnostics.increment("uiModal.release:" + label);
}

module.exports = {
  releaseCachedModal: releaseCachedModal,
  releaseSpriteFrameMap: releaseSpriteFrameMap
};
