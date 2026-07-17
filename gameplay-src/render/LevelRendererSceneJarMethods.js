"use strict";

function attachLevelRendererSceneJarMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var JAR_RESOURCES = deps.JAR_RESOURCES;
  var JAR_MASK_RESOURCES = deps.JAR_MASK_RESOURCES;
  var resolveJarScoreSpritePath = deps.resolveJarScoreSpritePath;
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
  if (!levelConfig || !levelConfig.level || !Array.isArray(levelConfig.level.jarColors) || levelConfig.level.jarColors.length === 0) {
    throw new Error("Bottom jar rendering requires non-empty level.jarColors.");
  }
  var jarColors = levelConfig.level.jarColors;
  var jarCount = jarColors.length;
  var jarProgress = runtimeSnapshot.jars ? runtimeSnapshot.jars.collectedByColor : {};
  var jarLayout = BoardLayout.getJarLayout(jarCount);
  var jarPositions = jarLayout.positions;


  jarColors.forEach(function (colorCode, index) {
    var jarNode = this._instantiateOrCreate(PREFAB_PATHS.jarItem, this.layers.jars, "BottomJar_" + index);
    var jarYOffset = BoardLayout.getJarRenderYOffset(index, jarCount);
    jarNode.setPosition(jarPositions[index], getJarBaseY() + JAR_RENDER_Y_OFFSET + jarYOffset);
    jarNode.zIndex = BoardLayout.getJarRenderZIndex(index, jarCount);
    jarNode.setScale(jarLayout.scale);
    this._applyJarVisual(jarNode, colorCode);
    this._applyJarMaskVisual(jarNode, colorCode);
    this._ensureJarDropContainer(jarNode);

    var scoreNode = jarNode.getChildByName("score");
    if (!scoreNode || !scoreNode.isValid) {
      throw new Error("JarItem prefab requires score child node.");
    }
    var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, index);
    var scoreSpritePath = resolveJarScoreSpritePath(colorCode, baseScore);
    var scoreSpriteFrame = this.spriteFrameCache[scoreSpritePath];
    if (!scoreSpriteFrame) {
      throw new Error("Jar base score SpriteFrame is not loaded: " + scoreSpritePath);
    }
    ensureSprite(scoreNode, scoreSpriteFrame);
    scoreNode.setContentSize(scoreSpriteFrame.getOriginalSize());

    var countNode = getOrCreateChild(jarNode, "CountLabel");
    countNode.setPosition(0, -118);
    countNode.color = cc.color(255, 255, 255);
    ensureLabel(countNode, String(jarProgress[colorCode] || 0), 34, 38);
    ensureOutline(countNode, cc.color(83, 109, 138), 3);
  }, this);

  this._renderJarOcclusionLayer(jarColors);
  this._renderJarCollisionMasks(runtimeSnapshot);
};

LevelRenderer.prototype._renderJarOcclusionLayer = function (jarColors) {
  if (!this.layers || !this.layers.jarOcclusion) {
    throw new Error("Jar occlusion rendering requires JarOcclusionLayer.");
  }
  if (!this.layers.jars || !this.layers.jars.isValid) {
    throw new Error("Jar occlusion rendering requires JarLayer.");
  }

  clearChildren(this.layers.jarOcclusion);
  jarColors.forEach(function (colorCode, index) {
    var spritePath = JAR_MASK_RESOURCES[colorCode];
    var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
    if (!spriteFrame || !spriteFrame.isValid) {
      throw new Error("Jar occlusion SpriteFrame is not loaded: " + spritePath);
    }

    var jarNode = this.layers.jars.getChildByName("BottomJar_" + index);
    if (!jarNode || !jarNode.isValid) {
      throw new Error("Jar occlusion rendering requires BottomJar_" + index + ".");
    }
    if (!Number.isFinite(jarNode.x) || !Number.isFinite(jarNode.y) ||
        !Number.isFinite(jarNode.scaleX) || jarNode.scaleX <= 0 ||
        !Number.isFinite(jarNode.scaleY) || jarNode.scaleY <= 0) {
      throw new Error("BottomJar_" + index + " requires finite position and positive scale.");
    }

    var maskNode = new cc.Node("JarOcclusion_" + index);
    maskNode.parent = this.layers.jarOcclusion;
    maskNode.setPosition(jarNode.x, jarNode.y);
    maskNode.setScale(jarNode.scaleX, jarNode.scaleY);
    maskNode.zIndex = jarNode.zIndex;
    maskNode.opacity = 255;
    var maskSprite = ensureSprite(maskNode, spriteFrame);
    maskSprite.trim = false;
    maskNode.setContentSize(JAR_RENDER_SIZE);
  }, this);
};
}

module.exports = attachLevelRendererSceneJarMethods;
