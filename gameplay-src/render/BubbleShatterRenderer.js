"use strict";

var EFFECT_RESOURCE_PATH = "effects/BubbleShatter";
var SHATTER_LIFETIME = 0.48;
var SHATTER_SEQUENCE_INTERVAL_SEC = 0.03;
var FIRST_FRAME_BURST_TIME = 0.055;
var EXPANDED_QUAD_SCALE = 3;
var SHATTER_SPREAD = 0.92;
var SHATTER_GRAVITY = 0.5;
var SHATTER_ROTATION = 2.4;
var SHATTER_FADE_START = 0.62;
var ELIMINATION_DROP_RELEASE_EARLY_SEC = 0.5;
var UV_EPSILON = 0.000001;
var UV_CORNER_EPSILON = 0.0001;
var SCHEDULE_ONCE_REPEAT = 0;

function requireDirectorScheduler(description) {
  if (!cc || !cc.director || typeof cc.director.getScheduler !== "function") {
    throw new Error(description + " requires cc.director.getScheduler.");
  }
  var scheduler = cc.director.getScheduler();
  if (!scheduler || typeof scheduler.schedule !== "function" || typeof scheduler.unschedule !== "function") {
    throw new Error(description + " requires director scheduler APIs.");
  }
  return scheduler;
}

function resolvePresentationReleaseDelaySec(lastShatterStartDelaySec) {
  var safeLastStartDelaySec = assertFiniteNumber(lastShatterStartDelaySec, "Presentation release last shatter start delay");
  if (safeLastStartDelaySec < 0) {
    throw new Error("Presentation release last shatter start delay must be non-negative.");
  }
  var shatterVisualLeadSec = SHATTER_LIFETIME * SHATTER_FADE_START - FIRST_FRAME_BURST_TIME;
  return Math.max(0, safeLastStartDelaySec + shatterVisualLeadSec - ELIMINATION_DROP_RELEASE_EARLY_SEC);
}

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

function buildPlayPlanSignature(playPlan) {
  if (!Array.isArray(playPlan)) {
    throw new Error("Bubble shatter play plan signature requires playPlan array.");
  }
  return playPlan.map(function (entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Bubble shatter play plan signature requires entry objects.");
    }
    if (!entry.cell || (typeof entry.cell.id !== "string" && typeof entry.cell.id !== "number")) {
      throw new Error("Bubble shatter play plan signature requires cell id.");
    }
    if (!Number.isFinite(entry.delaySec) || entry.delaySec < 0) {
      throw new Error("Bubble shatter play plan signature requires non-negative delaySec.");
    }
    return String(entry.cell.id) + "@" + entry.delaySec.toFixed(3);
  }).join("|");
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
  this.pendingCellIds = {};
  this.pendingScheduleCallbacks = {};
  this.presentationCompleteHandler = null;
  this.presentationTrackedResolution = null;
  this.presentationTrackedPlanSignature = "";
  this.presentationCompleteNotified = false;
  this.presentationReleaseCallback = null;
}

BubbleShatterRenderer.prototype.setPresentationCompleteHandler = function (handler) {
  if (typeof handler !== "function") {
    throw new Error("BubbleShatterRenderer requires presentationCompleteHandler function.");
  }
  this.presentationCompleteHandler = handler;
};

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
    this._releaseComponent(component, true);
  }, this);
  this._cancelPendingSchedules();
  this._resetPresentationTracking(true);
  this.currentResolution = null;
  this.playedCellIds = {};
};

BubbleShatterRenderer.prototype._resetPresentationTracking = function (notifyComplete) {
  this._cancelPendingPresentationRelease();
  if (notifyComplete === true) {
    this._notifyPresentationComplete();
  }
  this.presentationTrackedResolution = null;
  this.presentationTrackedPlanSignature = "";
  this.presentationCompleteNotified = false;
};

BubbleShatterRenderer.prototype._armPresentationRelease = function (resolution, playPlan) {
  if (!Array.isArray(playPlan)) {
    throw new Error("Bubble shatter presentation release requires playPlan array.");
  }
  this.presentationTrackedResolution = resolution;
  this.presentationCompleteNotified = false;
  if (!playPlan.length) {
    this._notifyPresentationComplete();
    return;
  }
  var lastEntry = playPlan[playPlan.length - 1];
  if (!Number.isFinite(lastEntry.delaySec) || lastEntry.delaySec < 0) {
    throw new Error("Bubble shatter presentation release requires non-negative last delaySec.");
  }
  var releaseDelaySec = resolvePresentationReleaseDelaySec(lastEntry.delaySec);
  this._schedulePresentationRelease(releaseDelaySec);
};

BubbleShatterRenderer.prototype._schedulePresentationRelease = function (delaySec) {
  if (!Number.isFinite(delaySec) || delaySec < 0) {
    throw new Error("Bubble shatter presentation release delaySec must be a non-negative number.");
  }
  this._cancelPendingPresentationRelease();
  if (delaySec <= 0) {
    this._notifyPresentationComplete();
    return;
  }
  if (!this.layer || !this.layer.isValid) {
    throw new Error("Bubble shatter presentation release requires mounted layer.");
  }
  var self = this;
  this.presentationReleaseCallback = function () {
    self.presentationReleaseCallback = null;
    self._notifyPresentationComplete();
  };
  var scheduler = requireDirectorScheduler("Bubble shatter presentation release");
  scheduler.schedule(this.presentationReleaseCallback, this.layer, 0, SCHEDULE_ONCE_REPEAT, delaySec, false);
};

BubbleShatterRenderer.prototype._cancelPendingPresentationRelease = function () {
  if (
    this.presentationReleaseCallback &&
    this.layer &&
    this.layer.isValid
  ) {
    var scheduler = requireDirectorScheduler("Bubble shatter presentation release cancel");
    scheduler.unschedule(this.presentationReleaseCallback, this.layer);
  }
  this.presentationReleaseCallback = null;
};

BubbleShatterRenderer.prototype._notifyPresentationComplete = function () {
  if (this.presentationCompleteNotified) {
    return;
  }
  this.presentationCompleteNotified = true;
  if (typeof this.presentationCompleteHandler !== "function") {
    return;
  }
  this.presentationCompleteHandler();
};

BubbleShatterRenderer.prototype.isCellShatterPending = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Bubble shatter pending lookup requires cell id.");
  }
  return !!this.pendingCellIds[String(cellId)];
};

BubbleShatterRenderer.prototype._cancelPendingSchedules = function () {
  if (this.layer && this.layer.isValid && Object.keys(this.pendingScheduleCallbacks).length > 0) {
    var scheduler = requireDirectorScheduler("Bubble shatter pending schedule cancel");
    for (var cellId in this.pendingScheduleCallbacks) {
      if (Object.prototype.hasOwnProperty.call(this.pendingScheduleCallbacks, cellId)) {
        scheduler.unschedule(this.pendingScheduleCallbacks[cellId], this.layer);
      }
    }
  }
  this.pendingCellIds = {};
  this.pendingScheduleCallbacks = {};
};

BubbleShatterRenderer.prototype._hideBoardBubbleNode = function (cellId, boardBubbleNodes) {
  var sourceNode = boardBubbleNodes[String(cellId)];
  if (sourceNode && sourceNode.isValid) {
    sourceNode.active = false;
  }
};

BubbleShatterRenderer.prototype._buildPlayPlan = function (resolution) {
  var matchedById = {};
  resolution.matched.forEach(function (cell) {
    matchedById[String(cell.id)] = cell;
  });

  var entries = [];
  if (Array.isArray(resolution.eliminationSequence) && resolution.eliminationSequence.length > 0) {
    resolution.eliminationSequence.forEach(function (sequenceEntry) {
      if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
        throw new Error("Bubble shatter elimination sequence entry must be an object.");
      }
      var cellId = String(sequenceEntry.cellId);
      var cell = matchedById[cellId];
      if (!cell) {
        throw new Error("Bubble shatter elimination sequence cell is missing from matched: " + cellId);
      }
      if (!this._isEligibleCell(cell)) {
        return;
      }
      if (!Number.isFinite(Number(sequenceEntry.delayMs)) || Number(sequenceEntry.delayMs) < 0) {
        throw new Error("Bubble shatter elimination sequence delayMs must be a non-negative number: " + cellId);
      }
      entries.push({
        cell: cell,
        delaySec: Number(sequenceEntry.delayMs) / 1000,
        worldPosition: sequenceEntry.worldPosition
      });
    }, this);
    return entries;
  }

  var eligibleIndex = 0;
  resolution.matched.forEach(function (cell) {
    if (!this._isEligibleCell(cell)) {
      return;
    }
    entries.push({
      cell: cell,
      delaySec: eligibleIndex * SHATTER_SEQUENCE_INTERVAL_SEC,
      worldPosition: null
    });
    eligibleIndex += 1;
  }, this);
  return entries;
};

BubbleShatterRenderer.prototype._scheduleCellShatter = function (
  entry,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  spriteFrameCache
) {
  var cell = entry.cell;
  var cellId = String(cell.id);
  if (this.playedCellIds[cellId] || this.pendingCellIds[cellId]) {
    return;
  }

  var delaySec = entry.delaySec;
  if (!Number.isFinite(delaySec) || delaySec < 0) {
    throw new Error("Bubble shatter delay must be a non-negative finite number: " + cellId);
  }

  var playPosition = this._resolveCellPosition(cell, resolution, boardSnapshot, boardBubbleNodes, entry.worldPosition);
  var self = this;
  var callback = function () {
    delete self.pendingCellIds[cellId];
    delete self.pendingScheduleCallbacks[cellId];
    self._playCellShatter(cell, playPosition, resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
  };

  if (delaySec <= 0) {
    callback();
    return;
  }

  this.pendingCellIds[cellId] = true;
  this.pendingScheduleCallbacks[cellId] = callback;
  var scheduler = requireDirectorScheduler("Bubble shatter delayed play");
  scheduler.schedule(callback, this.layer, 0, SCHEDULE_ONCE_REPEAT, delaySec, false);
};

BubbleShatterRenderer.prototype._playCellShatter = function (
  cell,
  presetPosition,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  spriteFrameCache
) {
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

  this._hideBoardBubbleNode(cellId, boardBubbleNodes);

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

  var position = this._resolveCellPosition(cell, resolution, boardSnapshot, boardBubbleNodes, presetPosition);
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

BubbleShatterRenderer.prototype._resolveCellPosition = function (
  cell,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  presetPosition
) {
  if (
    presetPosition &&
    typeof presetPosition === "object" &&
    !Array.isArray(presetPosition) &&
    Number.isFinite(Number(presetPosition.x)) &&
    Number.isFinite(Number(presetPosition.y))
  ) {
    return cc.v2(Number(presetPosition.x), Number(presetPosition.y));
  }

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

BubbleShatterRenderer.prototype._releaseComponent = function (component, skipPresentationFinish) {
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
    this._cancelPendingSchedules();
    this._resetPresentationTracking(true);
    this.currentResolution = resolution;
    this.playedCellIds = {};
  }

  var playPlan = this._buildPlayPlan(resolution);
  var playPlanSignature = buildPlayPlanSignature(playPlan);
  if (
    this.presentationTrackedResolution !== resolution ||
    this.presentationTrackedPlanSignature !== playPlanSignature
  ) {
    this._armPresentationRelease(resolution, playPlan);
    this.presentationTrackedPlanSignature = playPlanSignature;
  }
  playPlan.forEach(function (entry) {
    this._scheduleCellShatter(entry, resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
  }, this);
};

module.exports = BubbleShatterRenderer;
