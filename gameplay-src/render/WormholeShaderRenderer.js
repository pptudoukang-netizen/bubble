"use strict";

var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var EFFECT_RESOURCE_PATH = "game/effects/WormholeFlow";
var UV_EPSILON = 0.000001;
var UV_CORNER_EPSILON = 0.0001;
var MOTION_PARAMS = [0.55, 4.8, 1.6, 2.0];
var SHAPE_PARAMS = [0.44, 0.33, 0.025, 0.13];
var BLUE_HIGHLIGHT = [0.10, 0.65, 1.0, 1.0];
var PURPLE_HIGHLIGHT = [0.55, 0.18, 1.0, 1.0];

function requireFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function buildUvBasis(spriteFrame) {
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Wormhole shader requires valid SpriteFrame.");
  }
  var uv = spriteFrame.uv;
  if (!uv || uv.length < 8) {
    throw new Error("Wormhole shader SpriteFrame requires four UV corners.");
  }

  var originX = requireFiniteNumber(uv[0], "Wormhole shader UV origin x");
  var originY = requireFiniteNumber(uv[1], "Wormhole shader UV origin y");
  var axisXX = requireFiniteNumber(uv[2], "Wormhole shader UV right x") - originX;
  var axisXY = requireFiniteNumber(uv[3], "Wormhole shader UV right y") - originY;
  var axisYX = requireFiniteNumber(uv[4], "Wormhole shader UV top x") - originX;
  var axisYY = requireFiniteNumber(uv[5], "Wormhole shader UV top y") - originY;
  var axisXLengthSquared = axisXX * axisXX + axisXY * axisXY;
  var axisYLengthSquared = axisYX * axisYX + axisYY * axisYY;
  if (axisXLengthSquared <= UV_EPSILON || axisYLengthSquared <= UV_EPSILON) {
    throw new Error("Wormhole shader SpriteFrame UV basis is degenerate.");
  }

  var expectedTopRightX = originX + axisXX + axisYX;
  var expectedTopRightY = originY + axisXY + axisYY;
  if (
    Math.abs(expectedTopRightX - Number(uv[6])) > UV_CORNER_EPSILON ||
    Math.abs(expectedTopRightY - Number(uv[7])) > UV_CORNER_EPSILON
  ) {
    throw new Error("Wormhole shader SpriteFrame UV corners must form a parallelogram.");
  }

  return {
    originAxisX: cc.v4(originX, originY, axisXX, axisXY),
    axisY: cc.v4(axisYX, axisYY, axisXLengthSquared, axisYLengthSquared)
  };
}

function resolveSpriteTarget(node) {
  if (!node || !node.isValid || typeof node.getChildByName !== "function") {
    throw new Error("Wormhole shader requires valid bubble node.");
  }
  var iconNode = node.getChildByName("Icon");
  var spriteTarget = iconNode && iconNode.isValid ? iconNode : node;
  var sprite = spriteTarget.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("Wormhole shader target requires cc.Sprite.");
  }
  if (typeof sprite.getMaterial !== "function" || typeof sprite.setMaterial !== "function") {
    throw new Error("Wormhole shader target requires Sprite material APIs.");
  }
  return {
    node: spriteTarget,
    sprite: sprite
  };
}

function WormholeShaderRenderer() {
  this.effectAsset = null;
  this.effectLoadPromise = null;
  this.sharedMaterial = null;
}

WormholeShaderRenderer.prototype.preload = function () {
  if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
    throw new Error("Wormhole shader requires WebGL renderer.");
  }
  if (this.effectAsset && this.effectAsset.isValid) {
    return Promise.resolve(this.effectAsset);
  }
  if (this.effectLoadPromise) {
    return this.effectLoadPromise;
  }
  if (!cc.EffectAsset) {
    throw new Error("Wormhole shader requires cc.EffectAsset.");
  }

  this.effectLoadPromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(EFFECT_RESOURCE_PATH, cc.EffectAsset, function (error, effectAsset) {
      if (error) {
        reject(new Error("Wormhole shader effect load failed: " + error.message));
        return;
      }
      if (!effectAsset || !effectAsset.isValid) {
        reject(new Error("Wormhole shader effect asset is invalid: " + EFFECT_RESOURCE_PATH));
        return;
      }
      this.effectAsset = effectAsset;
      resolve(effectAsset);
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.effectLoadPromise = null;
    throw error;
  }.bind(this));
  return this.effectLoadPromise;
};

WormholeShaderRenderer.prototype.releaseAfterGameplayBundleUnload = function () {
  this.sharedMaterial = null;
  this.effectAsset = null;
  this.effectLoadPromise = null;
};

WormholeShaderRenderer.prototype._getSharedMaterial = function (spriteFrame) {
  if (this.sharedMaterial) {
    if (!this.sharedMaterial.isValid) {
      throw new Error("Wormhole shader shared material is invalid.");
    }
    return this.sharedMaterial;
  }
  if (!this.effectAsset || !this.effectAsset.isValid) {
    throw new Error("Wormhole shader material requires preloaded effect.");
  }
  if (!cc.Material || typeof cc.Material.create !== "function") {
    throw new Error("Wormhole shader requires cc.Material.create.");
  }

  var material = cc.Material.create(this.effectAsset);
  if (!material || !material.isValid || typeof material.setProperty !== "function") {
    throw new Error("Wormhole shader material creation failed.");
  }
  var uvBasis = buildUvBasis(spriteFrame);
  material.setProperty("uvOriginAxisX", uvBasis.originAxisX);
  material.setProperty("uvAxisY", uvBasis.axisY);
  material.setProperty("motionParams", cc.v4(MOTION_PARAMS[0], MOTION_PARAMS[1], MOTION_PARAMS[2], MOTION_PARAMS[3]));
  material.setProperty("shapeParams", cc.v4(SHAPE_PARAMS[0], SHAPE_PARAMS[1], SHAPE_PARAMS[2], SHAPE_PARAMS[3]));
  material.setProperty("blueHighlight", cc.v4(BLUE_HIGHLIGHT[0], BLUE_HIGHLIGHT[1], BLUE_HIGHLIGHT[2], BLUE_HIGHLIGHT[3]));
  material.setProperty("purpleHighlight", cc.v4(PURPLE_HIGHLIGHT[0], PURPLE_HIGHLIGHT[1], PURPLE_HIGHLIGHT[2], PURPLE_HIGHLIGHT[3]));
  this.sharedMaterial = material;
  return material;
};

WormholeShaderRenderer.prototype.syncNode = function (node, cell) {
  if (!cell || cell.entityType !== "wormhole") {
    this.resetNode(node);
    return;
  }
  if (node.__wormholeShaderActive === true) {
    var activeTarget = resolveSpriteTarget(node);
    if (node.__wormholeShaderSprite !== activeTarget.sprite) {
      throw new Error("Wormhole shader active Sprite changed unexpectedly.");
    }
    return;
  }

  var target = resolveSpriteTarget(node);
  if (!target.sprite.spriteFrame || !target.sprite.spriteFrame.isValid) {
    throw new Error("Wormhole shader requires rendered wormhole SpriteFrame.");
  }
  var originalMaterial = target.sprite.getMaterial(0);
  if (!originalMaterial || !originalMaterial.isValid) {
    throw new Error("Wormhole shader requires valid original Sprite material.");
  }
  var appliedMaterial = target.sprite.setMaterial(0, this._getSharedMaterial(target.sprite.spriteFrame));
  if (!appliedMaterial || !appliedMaterial.isValid) {
    throw new Error("Wormhole shader material binding failed.");
  }

  node.__wormholeShaderActive = true;
  node.__wormholeShaderSprite = target.sprite;
  node.__wormholeOriginalMaterial = originalMaterial;
};

WormholeShaderRenderer.prototype.resetNode = function (node) {
  if (!node || !node.isValid) {
    throw new Error("Wormhole shader reset requires valid bubble node.");
  }
  if (node.__wormholeShaderActive !== true) {
    node.__wormholeShaderActive = false;
    return;
  }
  if (!node.__wormholeShaderSprite || !node.__wormholeOriginalMaterial) {
    throw new Error("Wormhole shader reset requires captured Sprite material state.");
  }
  if (!node.__wormholeOriginalMaterial.isValid) {
    throw new Error("Wormhole shader original Sprite material is invalid.");
  }

  var restoredMaterial = node.__wormholeShaderSprite.setMaterial(0, node.__wormholeOriginalMaterial);
  if (!restoredMaterial || !restoredMaterial.isValid) {
    throw new Error("Wormhole shader original material restore failed.");
  }
  node.__wormholeShaderActive = false;
  node.__wormholeShaderSprite = null;
  node.__wormholeOriginalMaterial = null;
};

module.exports = WormholeShaderRenderer;
