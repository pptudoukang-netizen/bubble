"use strict";

var EFFECT_RESOURCE_PATH = "effects/BubbleShatter";
var SHATTER_LIFETIME = 0.48;
var FIRST_FRAME_BURST_TIME = 0.055;
var EXPANDED_QUAD_SCALE = 3;
var SHATTER_SPREAD = 0.92;
var SHATTER_GRAVITY = 0.5;
var SHATTER_ROTATION = 2.4;
var SHATTER_FADE_START = 0.62;
var UV_EPSILON = 0.000001;
var UV_CORNER_EPSILON = 0.0001;

function assertFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function assertPositiveNumber(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (numberValue <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return numberValue;
}

function hashStringToUnit(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Bubble shatter seed requires non-empty cell id.");
  }
  var hash = 2166136261;
  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildUvBasis(spriteFrame) {
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Bubble shatter requires valid SpriteFrame.");
  }
  var uv = spriteFrame.uv;
  if (!uv || uv.length < 8) {
    throw new Error("Bubble shatter SpriteFrame requires four UV corners.");
  }

  var originX = assertFiniteNumber(uv[0], "Bubble shatter UV origin x");
  var originY = assertFiniteNumber(uv[1], "Bubble shatter UV origin y");
  var axisXX = assertFiniteNumber(uv[2], "Bubble shatter UV right x") - originX;
  var axisXY = assertFiniteNumber(uv[3], "Bubble shatter UV right y") - originY;
  var axisYX = assertFiniteNumber(uv[4], "Bubble shatter UV top x") - originX;
  var axisYY = assertFiniteNumber(uv[5], "Bubble shatter UV top y") - originY;
  var axisXLengthSquared = axisXX * axisXX + axisXY * axisXY;
  var axisYLengthSquared = axisYX * axisYX + axisYY * axisYY;
  if (axisXLengthSquared <= UV_EPSILON || axisYLengthSquared <= UV_EPSILON) {
    throw new Error("Bubble shatter SpriteFrame UV basis is degenerate.");
  }

  var expectedTopRightX = originX + axisXX + axisYX;
  var expectedTopRightY = originY + axisXY + axisYY;
  if (
    Math.abs(expectedTopRightX - Number(uv[6])) > UV_CORNER_EPSILON ||
    Math.abs(expectedTopRightY - Number(uv[7])) > UV_CORNER_EPSILON
  ) {
    throw new Error("Bubble shatter SpriteFrame UV corners must form a parallelogram.");
  }

  return {
    originAxisX: cc.v4(originX, originY, axisXX, axisXY),
    axisY: cc.v4(axisYX, axisYY, axisXLengthSquared, axisYLengthSquared)
  };
}

var BubbleShatterSprite = cc.Class({
  extends: cc.Component,

  ctor: function () {
    this._sprite = null;
    this._material = null;
    this._effectAsset = null;
    this._elapsed = 0;
    this._lifetime = SHATTER_LIFETIME;
    this._playing = false;
    this._releaseHandler = null;
    this._shatterParams = cc.v4(0, SHATTER_LIFETIME, 0, EXPANDED_QUAD_SCALE);
  },

  initialize: function (options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("BubbleShatterSprite initialize options are required.");
    }
    if (!options.effectAsset || !options.effectAsset.isValid) {
      throw new Error("BubbleShatterSprite requires valid EffectAsset.");
    }
    if (!options.spriteFrame || !options.spriteFrame.isValid) {
      throw new Error("BubbleShatterSprite requires valid SpriteFrame.");
    }
    if (typeof options.releaseHandler !== "function") {
      throw new Error("BubbleShatterSprite requires releaseHandler.");
    }

    var baseWidth = assertPositiveNumber(options.width, "Bubble shatter width");
    var baseHeight = assertPositiveNumber(options.height, "Bubble shatter height");
    var seed = assertFiniteNumber(options.seed, "Bubble shatter seed");
    var uvBasis = buildUvBasis(options.spriteFrame);

    this._sprite = this.node.getComponent(cc.Sprite);
    if (!this._sprite) {
      throw new Error("BubbleShatterSprite node requires Sprite component.");
    }
    this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    this._sprite.trim = true;
    this._sprite.spriteFrame = options.spriteFrame;
    this.node.setContentSize(baseWidth * EXPANDED_QUAD_SCALE, baseHeight * EXPANDED_QUAD_SCALE);
    this.node.opacity = 255;

    if (!this._material || this._effectAsset !== options.effectAsset) {
      var material = cc.Material.create(options.effectAsset);
      if (!material) {
        throw new Error("Bubble shatter material creation failed.");
      }
      this._material = this._sprite.setMaterial(0, material);
      this._effectAsset = options.effectAsset;
    }
    if (!this._material) {
      throw new Error("BubbleShatterSprite material is missing.");
    }

    this._elapsed = FIRST_FRAME_BURST_TIME;
    this._lifetime = SHATTER_LIFETIME;
    this._releaseHandler = options.releaseHandler;
    this._shatterParams.set(this._elapsed, this._lifetime, seed, EXPANDED_QUAD_SCALE);
    this._material.setProperty("uvOriginAxisX", uvBasis.originAxisX);
    this._material.setProperty("uvAxisY", uvBasis.axisY);
    this._material.setProperty(
      "motionParams",
      cc.v4(SHATTER_SPREAD, SHATTER_GRAVITY, SHATTER_ROTATION, SHATTER_FADE_START)
    );
    this._material.setProperty("shatterParams", this._shatterParams);
    this._playing = true;
    this.enabled = true;
  },

  stop: function () {
    this._playing = false;
    this._releaseHandler = null;
    this.enabled = false;
  },

  update: function (dt) {
    if (!this._playing) {
      return;
    }
    var deltaTime = assertFiniteNumber(dt, "Bubble shatter delta time");
    if (deltaTime < 0) {
      throw new Error("Bubble shatter delta time cannot be negative.");
    }

    this._elapsed = Math.min(this._lifetime, this._elapsed + deltaTime);
    this._shatterParams.x = this._elapsed;
    this._material.setProperty("shatterParams", this._shatterParams);
    if (this._elapsed < this._lifetime) {
      return;
    }

    var releaseHandler = this._releaseHandler;
    if (typeof releaseHandler !== "function") {
      throw new Error("BubbleShatterSprite completion requires releaseHandler.");
    }
    this._playing = false;
    this._releaseHandler = null;
    this.enabled = false;
    releaseHandler(this);
  }
});

function BubbleShatterRenderer(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("BubbleShatterRenderer options are required.");
  }
  if (!options.boardLayout || typeof options.boardLayout.getCellPosition !== "function") {
    throw new Error("BubbleShatterRenderer requires BoardLayout.getCellPosition.");
  }
  if (!options.ballResources || typeof options.ballResources !== "object" || Array.isArray(options.ballResources)) {
    throw new Error("BubbleShatterRenderer requires ball resources.");
  }
  if (typeof options.resolveBallCode !== "function") {
    throw new Error("BubbleShatterRenderer requires resolveBallCode.");
  }

  this.boardLayout = options.boardLayout;
  this.ballResources = options.ballResources;
  this.resolveBallCode = options.resolveBallCode;
  this.bubbleWidth = assertPositiveNumber(options.bubbleWidth, "Bubble shatter base width");
  this.bubbleHeight = assertPositiveNumber(options.bubbleHeight, "Bubble shatter base height");
  this.layer = null;
  this.effectAsset = null;
  this.effectLoadPromise = null;
  this.activeComponents = [];
  this.nodePool = [];
  this.currentResolution = null;
  this.playedCellIds = {};
}

BubbleShatterRenderer.prototype.setLayer = function (layer) {
  if (!layer || !layer.isValid) {
    throw new Error("BubbleShatterRenderer requires valid layer.");
  }
  this.layer = layer;
};

BubbleShatterRenderer.prototype.preload = function () {
  if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
    throw new Error("Bubble shatter shader requires WebGL renderer.");
  }
  if (this.effectAsset && this.effectAsset.isValid) {
    return Promise.resolve(this.effectAsset);
  }
  if (this.effectLoadPromise) {
    return this.effectLoadPromise;
  }
  if (!cc.EffectAsset) {
    throw new Error("Bubble shatter requires cc.EffectAsset.");
  }

  this.effectLoadPromise = new Promise(function (resolve, reject) {
    cc.resources.load(EFFECT_RESOURCE_PATH, cc.EffectAsset, function (error, effectAsset) {
      if (error) {
        reject(new Error("Bubble shatter effect load failed: " + error.message));
        return;
      }
      if (!effectAsset || !effectAsset.isValid) {
        reject(new Error("Bubble shatter effect asset is invalid: " + EFFECT_RESOURCE_PATH));
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

BubbleShatterRenderer.prototype.reset = function () {
  var active = this.activeComponents.slice();
  active.forEach(function (component) {
    this._releaseComponent(component);
  }, this);
  this.currentResolution = null;
  this.playedCellIds = {};
};

BubbleShatterRenderer.prototype._isEligibleCell = function (cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Bubble shatter matched entry must be a cell object.");
  }
  if (cell.entityCategory === "normal_ball") {
    return true;
  }
  if (
    cell.entityCategory === "skill_ball" ||
    cell.entityCategory === "obstacle_ball" ||
    cell.entityCategory === "reactive_ball" ||
    cell.entityCategory === "locked_ball" ||
    cell.entityCategory === "key_ball"
  ) {
    return false;
  }
  throw new Error("Unsupported bubble shatter entityCategory: " + cell.entityCategory);
};

BubbleShatterRenderer.prototype._resolveCellPosition = function (cell, resolution, boardSnapshot, boardBubbleNodes) {
  var cellId = String(cell.id);
  var sourceNode = boardBubbleNodes[cellId];
  if (sourceNode && sourceNode.isValid) {
    return cc.v2(sourceNode.x, sourceNode.y);
  }

  var attachedCell = resolution.attachedCell;
  if (!attachedCell || String(attachedCell.id) !== cellId) {
    throw new Error("Bubble shatter source node is missing: " + cellId);
  }
  if (!Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Bubble shatter board snapshot requires integer maxColumns.");
  }
  return this.boardLayout.getCellPosition(
    cell.row,
    cell.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
};

BubbleShatterRenderer.prototype._acquireComponent = function () {
  var node = this.nodePool.length ? this.nodePool.pop() : null;
  if (!node) {
    node = new cc.Node("BubbleShatter");
    node.active = false;
    node.addComponent(cc.Sprite);
    node.addComponent(BubbleShatterSprite);
  }
  if (!node.isValid) {
    throw new Error("Bubble shatter pool returned invalid node.");
  }
  var component = node.getComponent(BubbleShatterSprite);
  if (!component) {
    throw new Error("Bubble shatter node requires BubbleShatterSprite component.");
  }
  return component;
};

BubbleShatterRenderer.prototype._releaseComponent = function (component) {
  if (!component || !component.node || !component.node.isValid) {
    throw new Error("Bubble shatter release requires valid component.");
  }
  var activeIndex = this.activeComponents.indexOf(component);
  if (activeIndex !== -1) {
    this.activeComponents.splice(activeIndex, 1);
  }
  component.stop();
  component.node.active = false;
  component.node.removeFromParent(false);
  this.nodePool.push(component.node);
};

BubbleShatterRenderer.prototype.playResolution = function (resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache) {
  if (!this.layer || !this.layer.isValid) {
    throw new Error("Bubble shatter play requires mounted layer.");
  }
  if (!this.effectAsset || !this.effectAsset.isValid) {
    throw new Error("Bubble shatter effect must be preloaded before play.");
  }
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Bubble shatter play requires resolution.");
  }
  if (!Array.isArray(resolution.matched)) {
    throw new Error("Bubble shatter resolution requires matched array.");
  }
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Bubble shatter play requires board snapshot.");
  }
  if (!boardBubbleNodes || typeof boardBubbleNodes !== "object" || Array.isArray(boardBubbleNodes)) {
    throw new Error("Bubble shatter play requires board bubble node map.");
  }
  if (!spriteFrameCache || typeof spriteFrameCache !== "object" || Array.isArray(spriteFrameCache)) {
    throw new Error("Bubble shatter play requires SpriteFrame cache.");
  }

  if (this.currentResolution !== resolution) {
    this.currentResolution = resolution;
    this.playedCellIds = {};
  }

  resolution.matched.forEach(function (cell) {
    if (!this._isEligibleCell(cell)) {
      return;
    }
    if (typeof cell.id !== "string" && typeof cell.id !== "number") {
      throw new Error("Bubble shatter matched cell requires id.");
    }
    var cellId = String(cell.id);
    if (this.playedCellIds[cellId]) {
      return;
    }
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Bubble shatter matched cell requires integer coordinates: " + cellId);
    }

    var ballCode = this.resolveBallCode(cell);
    if (typeof ballCode !== "string" || !ballCode) {
      throw new Error("Bubble shatter matched cell requires ball visual code: " + cellId);
    }
    var spritePath = this.ballResources[ballCode];
    if (typeof spritePath !== "string" || !spritePath) {
      throw new Error("Bubble shatter ball resource is missing: " + ballCode);
    }
    var spriteFrame = spriteFrameCache[spritePath];
    if (!spriteFrame || !spriteFrame.isValid) {
      throw new Error("Bubble shatter SpriteFrame is not preloaded: " + spritePath);
    }

    var position = this._resolveCellPosition(cell, resolution, boardSnapshot, boardBubbleNodes);
    var component = this._acquireComponent();
    component.node.name = "BubbleShatter_" + cellId;
    component.node.parent = this.layer;
    component.node.setPosition(position.x, position.y);
    component.node.active = true;
    component.initialize({
      effectAsset: this.effectAsset,
      spriteFrame: spriteFrame,
      width: this.bubbleWidth,
      height: this.bubbleHeight,
      seed: hashStringToUnit(cellId),
      releaseHandler: this._releaseComponent.bind(this)
    });
    this.activeComponents.push(component);
    this.playedCellIds[cellId] = true;
  }, this);
};

module.exports = BubbleShatterRenderer;
