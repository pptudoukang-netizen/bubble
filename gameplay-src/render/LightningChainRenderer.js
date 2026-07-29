"use strict";

var RESOURCE_PATHS = {
  arcPrimary: "game/image/skill/lightning/lightning_arc_long_01",
  arcSecondary: "game/image/skill/lightning/lightning_arc_long_02",
  ring: "game/image/skill/lightning/lightning_ring",
  sparkBurst: "game/image/skill/lightning/blue_spark_burst",
  starburst: "game/image/skill/lightning/blue_starburst",
  boltPrimary: "game/image/skill/lightning/blue_lightning_bolt_01",
  boltSecondary: "game/image/skill/lightning/blue_lightning_bolt_02",
  starGlowLarge: "game/image/skill/lightning/purple_star_glow_large",
  starGlowSmall: "game/image/skill/lightning/purple_star_glow_small"
};

var RESOURCE_KEYS = Object.keys(RESOURCE_PATHS);
var SEGMENT_HEIGHT = 56;
var SEGMENT_ENDPOINT_OVERLAP = 14;
var SEGMENT_FADE_IN_DURATION = 0.035;
var SEGMENT_FRAME_DURATION = 0.055;
var SEGMENT_FADE_OUT_DURATION = 0.11;
var HIT_STAGGER_DURATION = 0.085;
var FINAL_HOLD_DURATION = 0.32;
var RING_WIDTH = 118;
var RING_HEIGHT = 107;
var SPARK_BURST_WIDTH = 74;
var SPARK_BURST_HEIGHT = 76;
var STARBURST_WIDTH = 59;
var STARBURST_HEIGHT = 64;
var STAR_GLOW_LARGE_WIDTH = 70;
var STAR_GLOW_LARGE_HEIGHT = 70;
var STAR_GLOW_SMALL_WIDTH = 47;
var STAR_GLOW_SMALL_HEIGHT = 48;
var BOLT_PRIMARY_WIDTH = 44;
var BOLT_PRIMARY_HEIGHT = 58;
var BOLT_SECONDARY_WIDTH = 57;
var BOLT_SECONDARY_HEIGHT = 58;
var EFFECT_Z_INDEX = 700;
var MIN_SEGMENT_LENGTH = 1;

function requireFinitePoint(point, ownerName) {
  if (
    !point ||
    typeof point !== "object" ||
    Array.isArray(point) ||
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    !isFinite(point.x) ||
    !isFinite(point.y)
  ) {
    throw new Error(ownerName + " must contain finite x and y.");
  }
  return point;
}

function requireChainId(chainId) {
  if (
    (typeof chainId !== "string" && typeof chainId !== "number") ||
    String(chainId).length === 0
  ) {
    throw new Error("Lightning chain id must be a non-empty string or number.");
  }
  return String(chainId);
}

function requireHitPoint(hitPoint, index, usedIds) {
  requireFinitePoint(hitPoint, "Lightning chain hit point " + index);
  if (
    (typeof hitPoint.id !== "string" && typeof hitPoint.id !== "number") ||
    String(hitPoint.id).length === 0
  ) {
    throw new Error("Lightning chain hit point " + index + " requires id.");
  }

  var normalizedId = String(hitPoint.id);
  if (usedIds[normalizedId]) {
    throw new Error("Lightning chain hit point id must be unique: " + normalizedId);
  }
  usedIds[normalizedId] = true;

  return {
    id: normalizedId,
    x: hitPoint.x,
    y: hitPoint.y
  };
}

function validatePlayConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Lightning chain play config is required.");
  }

  var chainId = requireChainId(config.chainId);
  var origin = requireFinitePoint(config.origin, "Lightning chain origin");
  if (!Array.isArray(config.hitPoints) || config.hitPoints.length === 0) {
    throw new Error("Lightning chain requires at least one hit point.");
  }
  if (config.onHit !== undefined && typeof config.onHit !== "function") {
    throw new Error("Lightning chain onHit must be a function when provided.");
  }

  var usedIds = {};
  var hitPoints = config.hitPoints.map(function (hitPoint, index) {
    return requireHitPoint(hitPoint, index, usedIds);
  });

  var previousPoint = origin;
  hitPoints.forEach(function (hitPoint, index) {
    resolveSegmentGeometry(previousPoint, hitPoint, index);
    previousPoint = hitPoint;
  });

  return {
    chainId: chainId,
    origin: {
      x: origin.x,
      y: origin.y
    },
    hitPoints: hitPoints,
    onHit: config.onHit
  };
}

function resolveSegmentGeometry(startPoint, endPoint, index) {
  requireFinitePoint(startPoint, "Lightning chain segment " + index + " start");
  requireFinitePoint(endPoint, "Lightning chain segment " + index + " end");

  var dx = endPoint.x - startPoint.x;
  var dy = endPoint.y - startPoint.y;
  var distance = Math.sqrt(dx * dx + dy * dy);
  if (!isFinite(distance) || distance < MIN_SEGMENT_LENGTH) {
    throw new Error("Lightning chain segment " + index + " length must be at least " + MIN_SEGMENT_LENGTH + ".");
  }

  return {
    x: startPoint.x,
    y: startPoint.y,
    width: distance + SEGMENT_ENDPOINT_OVERLAP,
    height: SEGMENT_HEIGHT,
    angle: Math.atan2(dy, dx) * 180 / Math.PI
  };
}

function requireActionApis() {
  [
    "sequence",
    "spawn",
    "callFunc",
    "delayTime",
    "fadeTo",
    "scaleTo",
    "rotateBy"
  ].forEach(function (apiName) {
    if (typeof cc[apiName] !== "function") {
      throw new Error("Lightning chain effect requires cc." + apiName + ".");
    }
  });
}

function requireLayer(layer) {
  if (!layer || !layer.isValid) {
    throw new Error("Lightning chain effect requires a valid render layer.");
  }
  return layer;
}

function requireSpriteFrames(spriteFrameCache) {
  if (!spriteFrameCache || typeof spriteFrameCache !== "object" || Array.isArray(spriteFrameCache)) {
    throw new Error("Lightning chain effect requires SpriteFrame cache.");
  }

  var spriteFrames = {};
  RESOURCE_KEYS.forEach(function (key) {
    var path = RESOURCE_PATHS[key];
    var spriteFrame = spriteFrameCache[path];
    if (!spriteFrame) {
      throw new Error("Lightning chain SpriteFrame is not preloaded: " + path);
    }
    if (typeof cc.isValid === "function" && !cc.isValid(spriteFrame)) {
      throw new Error("Lightning chain SpriteFrame is invalid: " + path);
    }
    spriteFrames[key] = spriteFrame;
  });
  return spriteFrames;
}

function createSpriteNode(parent, name, spriteFrame, width, height, zIndex) {
  if (typeof width !== "number" || !isFinite(width) || width <= 0) {
    throw new Error(name + " width must be positive.");
  }
  if (typeof height !== "number" || !isFinite(height) || height <= 0) {
    throw new Error(name + " height must be positive.");
  }

  var node = new cc.Node(name);
  node.parent = parent;
  node.setContentSize(width, height);
  node.zIndex = zIndex;
  var sprite = node.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  return {
    node: node,
    sprite: sprite
  };
}

function createSegmentNode(root, spriteFrames, startPoint, endPoint, index) {
  var geometry = resolveSegmentGeometry(startPoint, endPoint, index);
  var entry = createSpriteNode(
    root,
    "LightningSegment_" + index,
    spriteFrames.arcPrimary,
    geometry.width,
    geometry.height,
    index * 10
  );
  entry.node.anchorX = 0;
  entry.node.anchorY = 0.5;
  entry.node.setPosition(geometry.x, geometry.y);
  entry.node.angle = geometry.angle;
  entry.node.opacity = 0;
  entry.node.active = false;
  return entry;
}

function createCenteredSprite(root, name, spriteFrame, width, height, zIndex, point) {
  var entry = createSpriteNode(root, name, spriteFrame, width, height, zIndex);
  entry.node.setPosition(point.x, point.y);
  entry.node.opacity = 0;
  entry.node.active = false;
  return entry;
}

function createImpactNodes(root, spriteFrames, point, index) {
  var zIndex = index * 10 + 2;
  var ring = createCenteredSprite(
    root,
    "LightningRing_" + index,
    spriteFrames.ring,
    RING_WIDTH,
    RING_HEIGHT,
    zIndex,
    point
  );
  var sparkBurst = createCenteredSprite(
    root,
    "LightningSparkBurst_" + index,
    spriteFrames.sparkBurst,
    SPARK_BURST_WIDTH,
    SPARK_BURST_HEIGHT,
    zIndex + 1,
    point
  );
  var starburst = createCenteredSprite(
    root,
    "LightningStarburst_" + index,
    spriteFrames.starburst,
    STARBURST_WIDTH,
    STARBURST_HEIGHT,
    zIndex + 2,
    point
  );
  var starGlowLarge = createCenteredSprite(
    root,
    "LightningStarGlowLarge_" + index,
    spriteFrames.starGlowLarge,
    STAR_GLOW_LARGE_WIDTH,
    STAR_GLOW_LARGE_HEIGHT,
    zIndex + 3,
    point
  );
  var starGlowSmall = createCenteredSprite(
    root,
    "LightningStarGlowSmall_" + index,
    spriteFrames.starGlowSmall,
    STAR_GLOW_SMALL_WIDTH,
    STAR_GLOW_SMALL_HEIGHT,
    zIndex + 4,
    point
  );
  var boltPrimary = createCenteredSprite(
    root,
    "LightningBoltPrimary_" + index,
    spriteFrames.boltPrimary,
    BOLT_PRIMARY_WIDTH,
    BOLT_PRIMARY_HEIGHT,
    zIndex + 5,
    point
  );
  var boltSecondary = createCenteredSprite(
    root,
    "LightningBoltSecondary_" + index,
    spriteFrames.boltSecondary,
    BOLT_SECONDARY_WIDTH,
    BOLT_SECONDARY_HEIGHT,
    zIndex + 6,
    point
  );

  boltPrimary.node.angle = -38;
  boltSecondary.node.angle = 42;

  return {
    ring: ring,
    sparkBurst: sparkBurst,
    starburst: starburst,
    starGlowLarge: starGlowLarge,
    starGlowSmall: starGlowSmall,
    boltPrimary: boltPrimary,
    boltSecondary: boltSecondary
  };
}

function requireActiveNode(node, ownerName) {
  if (!node || !node.isValid) {
    throw new Error(ownerName + " was destroyed during lightning chain playback.");
  }
}

function playSegment(entry, spriteFrames) {
  requireActiveNode(entry.node, "Lightning segment");
  entry.node.active = true;
  entry.node.opacity = 0;
  entry.sprite.spriteFrame = spriteFrames.arcPrimary;
  entry.node.runAction(cc.sequence(
    cc.fadeTo(SEGMENT_FADE_IN_DURATION, 255),
    cc.delayTime(SEGMENT_FRAME_DURATION),
    cc.callFunc(function () {
      requireActiveNode(entry.node, "Lightning segment");
      entry.sprite.spriteFrame = spriteFrames.arcSecondary;
    }),
    cc.delayTime(SEGMENT_FRAME_DURATION),
    cc.callFunc(function () {
      requireActiveNode(entry.node, "Lightning segment");
      entry.sprite.spriteFrame = spriteFrames.arcPrimary;
    }),
    cc.fadeTo(SEGMENT_FADE_OUT_DURATION, 0)
  ));
}

function playImpact(entry) {
  var impactNodes = [
    entry.ring.node,
    entry.sparkBurst.node,
    entry.starburst.node,
    entry.starGlowLarge.node,
    entry.starGlowSmall.node,
    entry.boltPrimary.node,
    entry.boltSecondary.node
  ];
  impactNodes.forEach(function (node) {
    requireActiveNode(node, "Lightning impact");
    node.active = true;
    node.opacity = 0;
    node.setScale(0.42);
  });

  entry.ring.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.045, 255),
      cc.scaleTo(0.11, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.18, 0),
      cc.scaleTo(0.18, 1.34),
      cc.rotateBy(0.18, 34)
    )
  ));
  entry.sparkBurst.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.035, 255),
      cc.scaleTo(0.08, 1.08)
    ),
    cc.spawn(
      cc.fadeTo(0.16, 0),
      cc.scaleTo(0.16, 1.5)
    )
  ));
  entry.starburst.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.03, 255),
      cc.scaleTo(0.07, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.15, 0),
      cc.scaleTo(0.15, 1.42),
      cc.rotateBy(0.15, -28)
    )
  ));
  entry.starGlowLarge.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.045, 230),
      cc.scaleTo(0.09, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.16, 0),
      cc.scaleTo(0.16, 1.36)
    )
  ));
  entry.starGlowSmall.node.runAction(cc.sequence(
    cc.delayTime(0.035),
    cc.spawn(
      cc.fadeTo(0.035, 255),
      cc.scaleTo(0.07, 1.1)
    ),
    cc.spawn(
      cc.fadeTo(0.13, 0),
      cc.scaleTo(0.13, 1.55)
    )
  ));
  entry.boltPrimary.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.025, 255),
      cc.scaleTo(0.06, 1.05)
    ),
    cc.spawn(
      cc.fadeTo(0.13, 0),
      cc.scaleTo(0.13, 1.34)
    )
  ));
  entry.boltSecondary.node.runAction(cc.sequence(
    cc.delayTime(0.025),
    cc.spawn(
      cc.fadeTo(0.025, 255),
      cc.scaleTo(0.06, 1.05)
    ),
    cc.spawn(
      cc.fadeTo(0.12, 0),
      cc.scaleTo(0.12, 1.3)
    )
  ));
}

function LightningChainRenderer() {
  this.activeRoot = null;
  this.activeState = null;
  this.serial = 0;
}

LightningChainRenderer.prototype.isPlaying = function () {
  return this.activeState !== null;
};

LightningChainRenderer.prototype.play = function (layer, spriteFrameCache, config) {
  requireActionApis();
  requireLayer(layer);
  var spriteFrames = requireSpriteFrames(spriteFrameCache);
  var normalizedConfig = validatePlayConfig(config);

  if (this.activeState !== null || (this.activeRoot && this.activeRoot.isValid)) {
    throw new Error("Lightning chain effect is already playing.");
  }

  this.serial += 1;
  var root = new cc.Node("LightningChainFx_" + normalizedConfig.chainId + "_" + this.serial);
  root.parent = layer;
  root.setPosition(0, 0);
  root.zIndex = EFFECT_Z_INDEX;
  this.activeRoot = root;

  var segments = [];
  var impacts = [];
  var previousPoint = normalizedConfig.origin;
  normalizedConfig.hitPoints.forEach(function (hitPoint, index) {
    segments.push(createSegmentNode(root, spriteFrames, previousPoint, hitPoint, index));
    impacts.push(createImpactNodes(root, spriteFrames, hitPoint, index));
    previousPoint = hitPoint;
  });

  return new Promise(function (resolve) {
    var state = {
      chainId: normalizedConfig.chainId,
      root: root,
      resolve: resolve,
      completedHitIds: []
    };
    this.activeState = state;
    var timeline = [];

    normalizedConfig.hitPoints.forEach(function (hitPoint, index) {
      if (index > 0) {
        timeline.push(cc.delayTime(HIT_STAGGER_DURATION));
      }
      timeline.push(cc.callFunc(function () {
        if (this.activeState !== state) {
          throw new Error("Lightning chain active state changed during playback.");
        }
        requireActiveNode(root, "Lightning chain root");
        playSegment(segments[index], spriteFrames);
        playImpact(impacts[index]);
        state.completedHitIds.push(hitPoint.id);
        if (normalizedConfig.onHit) {
          normalizedConfig.onHit(hitPoint, index);
        }
      }.bind(this)));
    }, this);

    timeline.push(cc.delayTime(FINAL_HOLD_DURATION));
    timeline.push(cc.callFunc(function () {
      this._finishActiveState(state, false, "completed");
    }.bind(this)));
    root.runAction(cc.sequence.apply(null, timeline));
  }.bind(this));
};

LightningChainRenderer.prototype._finishActiveState = function (state, cancelled, reason) {
  if (this.activeState !== state) {
    throw new Error("Lightning chain finish state does not match active state.");
  }

  var root = state.root;
  if (root && root.isValid) {
    root.stopAllActions();
    root.children.slice().forEach(function (child) {
      if (child && child.isValid) {
        child.stopAllActions();
      }
    });
    root.removeFromParent(false);
    root.destroy();
  }

  this.activeRoot = null;
  this.activeState = null;
  state.resolve({
    chainId: state.chainId,
    cancelled: cancelled,
    reason: reason,
    completedHitIds: state.completedHitIds.slice()
  });
};

LightningChainRenderer.prototype.reset = function (reason) {
  if (typeof reason !== "string" || reason.length === 0) {
    throw new Error("Lightning chain reset reason is required.");
  }
  if (this.activeState === null) {
    if (this.activeRoot && this.activeRoot.isValid) {
      throw new Error("Lightning chain root cannot exist without active state.");
    }
    this.activeRoot = null;
    return;
  }
  this._finishActiveState(this.activeState, true, reason);
};

LightningChainRenderer.RESOURCE_PATHS = RESOURCE_KEYS.map(function (key) {
  return RESOURCE_PATHS[key];
});
LightningChainRenderer.validatePlayConfig = validatePlayConfig;
LightningChainRenderer.resolveSegmentGeometry = resolveSegmentGeometry;

module.exports = LightningChainRenderer;
