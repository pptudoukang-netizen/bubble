"use strict";

function attachLevelRendererSceneJarMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var JAR_RESOURCES = deps.JAR_RESOURCES;
  var JAR_MASK_RESOURCES = deps.JAR_MASK_RESOURCES;
  var JAR_RENDER_SIZE = deps.JAR_RENDER_SIZE;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildJarRenderKey = deps.buildJarRenderKey;
  var getJarBaseY = deps.getJarBaseY;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var JarScoreConfig = deps.JarScoreConfig;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JAR_RENDER_Y_OFFSET = deps.JAR_RENDER_Y_OFFSET;

LevelRenderer.prototype._clearJarDropContainers = function () {
  if (!this.layers || !this.layers.jars) {
    return;
  }

  this.layers.jars.children.forEach(function (jarNode) {
    var container = jarNode.getChildByName("FallingInJar");
    if (container) {
      clearChildren(container);
    }
  });
};

LevelRenderer.prototype._findJarInteriorZone = function (drop, runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];
  if (!zones.length) {
    return null;
  }

  var bottomY = drop.position.y - BoardLayout.bubbleRadius;
  var topY = drop.position.y + BoardLayout.bubbleRadius;
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var dx = Math.abs(drop.position.x - zone.x);
    var xInside = dx <= Math.max(6, zone.innerHalfWidth || 0);
    // Delay occlusion so marbles are hidden later, after sinking deeper into the jar mouth.
    var hideTriggerY = zone.mouthY - Math.max(10, BoardLayout.bubbleRadius * 0.35);
    var underMouth = bottomY <= hideTriggerY;
    var aboveBottom = topY >= ((zone.bottomY || 0) + 2);
    if (xInside && underMouth && aboveBottom) {
      return zone;
    }
  }

  return null;
};

LevelRenderer.prototype._resolveJarDropContainer = function (drop, runtimeSnapshot) {
  var zone = this._findJarInteriorZone(drop, runtimeSnapshot);
  if (!zone || !this.layers || !this.layers.jars) {
    return null;
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + zone.index);
  if (!jarNode) {
    return null;
  }

  return this._ensureJarDropContainer(jarNode);
};

LevelRenderer.prototype._ensureJarDropContainer = function (jarNode) {
  var container = getOrCreateChild(jarNode, "FallingInJar");
  var maskNode = jarNode.getChildByName("mask") || jarNode.getChildByName("Mask");

  container.zIndex = 10;
  if (maskNode) {
    maskNode.zIndex = 20;
  }

  return container;
};

LevelRenderer.prototype._getWhiteSpriteFrameForSize = function (width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var key = safeWidth + "x" + safeHeight;

  if (this.whiteMaskFrames[key]) {
    return this.whiteMaskFrames[key];
  }

  var created = createSolidWhiteSpriteFrame(safeWidth, safeHeight);
  if (!created) {
    Logger.warn("Failed to create white sprite frame", key);
    return null;
  }

  this.whiteMaskTextures.push(created.texture);
  this.whiteMaskFrames[key] = created.frame;
  return created.frame;
};

LevelRenderer.prototype._renderJarCollisionMasks = function (runtimeSnapshot) {
  var maskRoot = getOrCreateChild(this.layers.overlay, "JarCollisionMaskRoot");
  maskRoot.zIndex = 29;
  clearChildren(maskRoot);
  if (!DebugFlags.get("testLayer")) {
    maskRoot.active = false;
    return;
  }
  maskRoot.active = true;

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];

  zones.forEach(function (zone, index) {
    var rimHeight = Math.max(6, (zone.contactBand || 16) * 2);
    var rimWidth = Math.max(8, (zone.rimHalfWidth || 0) * 2);

    var rimFrame = this._getWhiteSpriteFrameForSize(rimWidth, rimHeight);
    if (rimFrame) {
      var rimNode = new cc.Node("RimMask_" + index);
      rimNode.parent = maskRoot;
      rimNode.setPosition(zone.x || 0, zone.mouthY || 0);
      rimNode.color = cc.color(255, 255, 255);
      rimNode.opacity = 80;
      ensureSprite(rimNode, rimFrame);
      rimNode.setContentSize(rimWidth, rimHeight);
    }
}, this);

};
LevelRenderer.prototype._renderBottomJars = function (levelConfig, runtimeSnapshot) {
  var jarColors = levelConfig.level.jarColors || ["R", "G", "B"];
  var jarCount = jarColors.length;
  var jarProgress = runtimeSnapshot.jars ? runtimeSnapshot.jars.collectedByColor : {};
  var jarPositions = BoardLayout.getJarCenterPositions(jarCount);


  jarColors.forEach(function (colorCode, index) {
    var jarNode = this._instantiateOrCreate(PREFAB_PATHS.jarItem, this.layers.jars, "BottomJar_" + index);
    var jarYOffset = BoardLayout.getJarRenderYOffset(index, jarCount);
    jarNode.setPosition(jarPositions[index] || 0, getJarBaseY() + JAR_RENDER_Y_OFFSET + jarYOffset);
    jarNode.zIndex = BoardLayout.getJarRenderZIndex(index, jarCount);
    jarNode.setScale(1);
    this._applyJarVisual(jarNode, colorCode);
    this._applyJarMaskVisual(jarNode, colorCode);
    this._ensureJarDropContainer(jarNode);

    var scoreNode = jarNode.getChildByName("score");
    if (!scoreNode || !scoreNode.isValid) {
      throw new Error("JarItem prefab requires score child node.");
    }
    var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, index);
    ensureLabel(scoreNode, String(baseScore), 40, 40);

    var countNode = getOrCreateChild(jarNode, "CountLabel");
    countNode.setPosition(0, -118);
    countNode.color = cc.color(255, 255, 255);
    ensureLabel(countNode, String(jarProgress[colorCode] || 0), 34, 38);
    ensureOutline(countNode, cc.color(83, 109, 138), 3);
  }, this);

  this._renderJarOcclusionLayer(jarColors, jarPositions);
  this._renderJarCollisionMasks(runtimeSnapshot);
};

LevelRenderer.prototype._renderJarOcclusionLayer = function (jarColors, jarPositions) {
  if (!this.layers || !this.layers.jarOcclusion) {
    return;
  }

  clearChildren(this.layers.jarOcclusion);
  jarColors.forEach(function (colorCode, index) {
    var spritePath = JAR_MASK_RESOURCES[colorCode];
    var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
    if (!spriteFrame) {
      return;
    }

    var maskNode = new cc.Node("JarOcclusion_" + index);
    maskNode.parent = this.layers.jarOcclusion;
    var jarYOffset = BoardLayout.getJarRenderYOffset(index, jarColors.length);
    maskNode.setPosition(jarPositions[index] || 0, getJarBaseY() + jarYOffset);
    maskNode.setScale(1);
    maskNode.zIndex = BoardLayout.getJarRenderZIndex(index, jarColors.length);
    maskNode.opacity = 255;
    ensureSprite(maskNode, spriteFrame);
    maskNode.setContentSize(JAR_RENDER_SIZE);
  }, this);
};
}

module.exports = attachLevelRendererSceneJarMethods;
