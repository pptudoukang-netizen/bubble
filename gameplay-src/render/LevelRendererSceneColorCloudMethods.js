"use strict";

function attachLevelRendererSceneColorCloudMethods(LevelRenderer, deps) {
  var COLOR_CLOUD_RESOURCES = deps.COLOR_CLOUD_RESOURCES;
  var ColorCloudConfig = deps.ColorCloudConfig;
  var ensureSprite = deps.ensureSprite;

  function requireFinite(value, fieldName) {
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(fieldName + " must be finite.");
    }
    return value;
  }

  function destroyCloudNode(node, cloudId) {
    if (!node || !node.isValid || typeof node.destroy !== "function") {
      throw new Error("Color cloud cleanup requires valid node: " + cloudId);
    }
    node.destroy();
  }

  LevelRenderer.prototype._renderColorClouds = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.systems || !runtimeSnapshot.systems.colorCloudSystem) {
      throw new Error("Color cloud rendering requires system snapshot.");
    }
    if (!this.layers || !this.layers.colorCloud || !this.layers.colorCloud.isValid) {
      throw new Error("Color cloud rendering requires ColorCloudLayer.");
    }
    var snapshot = runtimeSnapshot.systems.colorCloudSystem;
    if (!Number.isInteger(snapshot.version) || snapshot.version < 0 || !Array.isArray(snapshot.activeClouds)) {
      throw new Error("Color cloud render snapshot is invalid.");
    }
    var activeIds = {};
    snapshot.activeClouds.forEach(function (cloud, index) {
      if (!cloud || typeof cloud.id !== "string" || !cloud.id || activeIds[cloud.id]) {
        throw new Error("Color cloud render entry id is missing or duplicated at index " + index + ".");
      }
      if (!cloud.position || typeof cloud.position !== "object" || Array.isArray(cloud.position)) {
        throw new Error("Color cloud render position is missing: " + cloud.id);
      }
      if (!Number.isInteger(cloud.opacity) || cloud.opacity < 0 || cloud.opacity > 255) {
        throw new Error("Color cloud render opacity must be an integer in [0, 255]: " + cloud.id);
      }
      var spritePath = COLOR_CLOUD_RESOURCES[cloud.color];
      if (!spritePath) {
        throw new Error("Color cloud render resource is missing for color: " + cloud.color);
      }
      var spriteFrame = this.spriteFrameCache[spritePath];
      if (!spriteFrame) {
        throw new Error("Color cloud sprite was not preloaded: " + spritePath);
      }
      if (typeof spriteFrame.getOriginalSize !== "function") {
        throw new Error("Color cloud spriteFrame requires getOriginalSize: " + spritePath);
      }
      var expectedSize = ColorCloudConfig.getRenderSize(cloud.color);
      var originalSize = spriteFrame.getOriginalSize();
      if (
        !originalSize ||
        originalSize.width !== expectedSize.width ||
        originalSize.height !== expectedSize.height
      ) {
        throw new Error(
          "Color cloud sprite size mismatch for " + cloud.color + ": expected " +
          expectedSize.width + "x" + expectedSize.height + "."
        );
      }
      activeIds[cloud.id] = true;
      var node = this.colorCloudNodes[cloud.id];
      if (!node) {
        node = new cc.Node("ColorCloud_" + cloud.id);
        node.parent = this.layers.colorCloud;
        node.setContentSize(expectedSize.width, expectedSize.height);
        this.colorCloudNodes[cloud.id] = node;
      }
      if (!node.isValid || node.parent !== this.layers.colorCloud) {
        throw new Error("Color cloud render node is invalid: " + cloud.id);
      }
      node.setPosition(
        requireFinite(cloud.position.x, "Color cloud " + cloud.id + " position.x"),
        requireFinite(cloud.position.y, "Color cloud " + cloud.id + " position.y")
      );
      node.opacity = cloud.opacity;
      var sprite = ensureSprite(node, spriteFrame);
      if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.RAW === undefined) {
        throw new Error("Color cloud rendering requires cc.Sprite.SizeMode.RAW.");
      }
      sprite.trim = false;
      sprite.sizeMode = cc.Sprite.SizeMode.RAW;
      node.setContentSize(expectedSize.width, expectedSize.height);
    }, this);

    Object.keys(this.colorCloudNodes).forEach(function (cloudId) {
      if (activeIds[cloudId]) {
        return;
      }
      destroyCloudNode(this.colorCloudNodes[cloudId], cloudId);
      delete this.colorCloudNodes[cloudId];
    }, this);
  };
}

module.exports = attachLevelRendererSceneColorCloudMethods;
