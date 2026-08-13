"use strict";

function attachLevelRendererSharedVisualMethods(LevelRenderer, context) {
  var AssistSpiritConfig = context.AssistSpiritConfig;
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var COMMENT_ANIMATION_HOLD_DURATION = context.COMMENT_ANIMATION_HOLD_DURATION;
  var COMMENT_ANIMATION_IN_DURATION = context.COMMENT_ANIMATION_IN_DURATION;
  var COMMENT_ANIMATION_NORMAL_SCALE = context.COMMENT_ANIMATION_NORMAL_SCALE;
  var COMMENT_ANIMATION_OUT_DURATION = context.COMMENT_ANIMATION_OUT_DURATION;
  var COMMENT_ANIMATION_OUT_SCALE = context.COMMENT_ANIMATION_OUT_SCALE;
  var COMMENT_ANIMATION_PUNCH_SCALE = context.COMMENT_ANIMATION_PUNCH_SCALE;
  var COMMENT_ANIMATION_RESOURCES = context.COMMENT_ANIMATION_RESOURCES;
  var COMMENT_ANIMATION_SETTLE_DURATION = context.COMMENT_ANIMATION_SETTLE_DURATION;
  var COMMENT_ANIMATION_START_SCALE = context.COMMENT_ANIMATION_START_SCALE;
  var ICE_OVERLAY_OPACITY = context.ICE_OVERLAY_OPACITY;
  var JAR_MASK_RESOURCES = context.JAR_MASK_RESOURCES;
  var JAR_RENDER_SIZE = context.JAR_RENDER_SIZE;
  var JAR_RESOURCES = context.JAR_RESOURCES;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var buildTrappedSpriteResourcePath = context.buildTrappedSpriteResourcePath;
  var clearChildren = context.clearChildren;
  var ensureSprite = context.ensureSprite;
  var getOrCreateChild = context.getOrCreateChild;
  var isIceBallLike = context.isIceBallLike;
  var resolveBallCode = context.resolveBallCode;
  var resolveCommentAnimationKey = context.resolveCommentAnimationKey;
  var resolveIceInnerColor = context.resolveIceInnerColor;

LevelRenderer.prototype._renderTrappedSpriteRescue = function (runtimeSnapshot) {
  if (
    !runtimeSnapshot ||
    !runtimeSnapshot.systems ||
    !runtimeSnapshot.systems.trappedSpriteRescueSystem
  ) {
    throw new Error("Trapped sprite rendering requires runtime system snapshot.");
  }
  var rescue = runtimeSnapshot.systems.trappedSpriteRescueSystem;
  if (!rescue.active) {
    if (this.trappedSpriteNode && this.trappedSpriteNode.isValid) {
      this.trappedSpriteNode.destroy();
    }
    this.trappedSpriteNode = null;
    return;
  }
  if (
    !rescue.worldCenter ||
    typeof rescue.worldCenter.x !== "number" ||
    !isFinite(rescue.worldCenter.x) ||
    typeof rescue.worldCenter.y !== "number" ||
    !isFinite(rescue.worldCenter.y)
  ) {
    throw new Error("Trapped sprite rendering requires finite worldCenter.");
  }
  if (typeof rescue.renderScale !== "number" || !isFinite(rescue.renderScale) || rescue.renderScale <= 0) {
    throw new Error("Trapped sprite rendering requires positive renderScale.");
  }
  var expectedPath = buildTrappedSpriteResourcePath(rescue.spiritId);
  if (rescue.spriteResourcePath !== expectedPath) {
    throw new Error("Trapped sprite runtime resource path mismatch.");
  }
  var spriteFrame = this.spriteFrameCache[expectedPath];
  if (!spriteFrame) {
    throw new Error("Trapped sprite SpriteFrame was not preloaded: " + expectedPath);
  }
  var node = this.trappedSpriteNode;
  if (this.trappedSpriteDepartureActive || this.trappedSpriteDepartureCompleted) {
    if (!node || !node.isValid) {
      throw new Error("Trapped sprite departure requires its existing render node.");
    }
    return;
  }
  if (!node || !node.isValid) {
    node = new cc.Node("TrappedSpriteCenter");
    this.trappedSpriteNode = node;
  }
  if (node.parent !== this.layers.trappedSprite) {
    node.parent = this.layers.trappedSprite;
  }
  node.active = true;
  node.opacity = 255;
  node.zIndex = 0;
  node.setPosition(rescue.worldCenter.x, rescue.worldCenter.y);
  // The trapped spirit occupies the same board cell as a normal bubble.
  var sprite = ensureSprite(node, spriteFrame);
  sprite.trim = false;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  // Binding a SpriteFrame can restore its native dimensions on a newly created Sprite.
  // Apply the board-cell visual size after that initial binding so the first frame is 65×65 too.
  node.setScale(1);
  node.setContentSize(BOARD_BUBBLE_SIZE);
};

LevelRenderer.prototype._playTrappedSpriteRescueDeparture = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    throw new Error("Trapped sprite departure requires runtimeEvents array.");
  }

  var rescueEvent = null;
  runtimeSnapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "trapped_sprite_rescued") {
      return;
    }
    if (!Number.isInteger(event.id) || event.id < 1) {
      throw new Error("trapped_sprite_rescued render event requires positive integer id.");
    }
    if (event.id <= this.lastTrappedSpriteRescueEventId) {
      return;
    }
    if (rescueEvent) {
      throw new Error("Runtime snapshot must not contain multiple trapped sprite rescue events.");
    }
    rescueEvent = event;
  }, this);

  if (!rescueEvent) {
    return;
  }
  AssistSpiritConfig.getSpirit(rescueEvent.spiritId);
  if (
    !runtimeSnapshot.systems ||
    !runtimeSnapshot.systems.trappedSpriteRescueSystem ||
    runtimeSnapshot.systems.trappedSpriteRescueSystem.spiritId !== rescueEvent.spiritId
  ) {
    throw new Error("Trapped sprite departure event does not match runtime spiritId.");
  }
  if (this.trappedSpriteDepartureActive || this.trappedSpriteDepartureCompleted) {
    throw new Error("Trapped sprite departure must start exactly once.");
  }

  var node = this.trappedSpriteNode;
  var layer = this.layers && this.layers.trappedSprite;
  if (!node || !node.isValid || !layer || !layer.isValid || node.parent !== layer) {
    throw new Error("Trapped sprite departure requires a valid node in TrappedSpriteLayer.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Trapped sprite departure requires cc.tween.");
  }

  var layerSize = layer.getContentSize();
  var nodeSize = node.getContentSize();
  if (
    !layerSize ||
    typeof layerSize.height !== "number" ||
    !isFinite(layerSize.height) ||
    layerSize.height <= 0 ||
    !nodeSize ||
    typeof nodeSize.height !== "number" ||
    !isFinite(nodeSize.height) ||
    nodeSize.height <= 0
  ) {
    throw new Error("Trapped sprite departure requires positive layer and node heights.");
  }
  if (typeof layer.anchorY !== "number" || !isFinite(layer.anchorY)) {
    throw new Error("TrappedSpriteLayer anchorY must be finite.");
  }

  var timing = SpecialAnimationTiming.trappedSpriteRescue;
  if (
    !timing ||
    typeof timing.flyOutDuration !== "number" ||
    !isFinite(timing.flyOutDuration) ||
    timing.flyOutDuration <= 0 ||
    typeof timing.exitMargin !== "number" ||
    !isFinite(timing.exitMargin) ||
    timing.exitMargin <= 0
  ) {
    throw new Error("SpecialAnimationTiming.trappedSpriteRescue must define positive flyOutDuration and exitMargin.");
  }

  var scaleY = typeof node.scaleY === "number" && isFinite(node.scaleY)
    ? Math.abs(node.scaleY)
    : Math.abs(node.scale);
  if (!isFinite(scaleY) || scaleY <= 0) {
    throw new Error("Trapped sprite departure requires positive node scale.");
  }
  var layerTopY = (1 - layer.anchorY) * layerSize.height;
  var targetY = layerTopY + nodeSize.height * scaleY * 0.5 + timing.exitMargin;

  this.lastTrappedSpriteRescueEventId = rescueEvent.id;
  this.trappedSpriteDepartureActive = true;
  this.trappedSpriteDepartureToken += 1;
  var departureToken = this.trappedSpriteDepartureToken;
  node.stopAllActions();
  cc.tween(node)
    .to(timing.flyOutDuration, {
      y: targetY
    }, {
      easing: "quadIn"
    })
    .call(function () {
      if (
        this.trappedSpriteDepartureToken !== departureToken ||
        this.trappedSpriteNode !== node ||
        !node.isValid
      ) {
        return;
      }
      node.active = false;
      this.trappedSpriteDepartureActive = false;
      this.trappedSpriteDepartureCompleted = true;
      this._showRescueSuccessfulView(rescueEvent.spiritId);
    }.bind(this))
    .start();
};

LevelRenderer.prototype._playCommentAnimation = function (runtimeSnapshot) {
  if (!runtimeSnapshot) {
    throw new Error("Comment animation requires runtime snapshot.");
  }
  if (!runtimeSnapshot.lastResolution) {
    throw new Error("Comment animation requires lastResolution.");
  }

  var resolution = runtimeSnapshot.lastResolution;
  if (resolution === this.lastCommentResolution) {
    return;
  }

  if (!Array.isArray(resolution.matched)) {
    throw new Error("Comment animation requires lastResolution.matched array.");
  }
  if (!Array.isArray(resolution.floating)) {
    throw new Error("Comment animation requires lastResolution.floating array.");
  }

  var matchedCount = resolution.matched.length;
  var floatingCount = resolution.floating.length;
  var clearedCount = matchedCount + floatingCount;
  var commentKey = resolveCommentAnimationKey(clearedCount);
  if (!commentKey) {
    return;
  }

  this.lastCommentResolution = resolution;
  if (!this.layers || !this.layers.comment) {
    throw new Error("Comment animation requires CommentLayer.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Comment animation requires cc.tween.");
  }

  var spritePath = COMMENT_ANIMATION_RESOURCES[commentKey];
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Comment animation sprite is not preloaded: " + spritePath);
  }

  clearChildren(this.layers.comment);
  var commentNode = new cc.Node("Comment_" + commentKey);
  commentNode.parent = this.layers.comment;
  commentNode.setPosition(0, 0);
  commentNode.setScale(COMMENT_ANIMATION_START_SCALE);
  commentNode.opacity = 255;
  ensureSprite(commentNode, spriteFrame);
  commentNode.setContentSize(spriteFrame.getOriginalSize());

  cc.tween(commentNode)
    .to(COMMENT_ANIMATION_IN_DURATION, {
      scale: COMMENT_ANIMATION_PUNCH_SCALE
    }, {
      easing: "backOut"
    })
    .to(COMMENT_ANIMATION_SETTLE_DURATION, {
      scale: COMMENT_ANIMATION_NORMAL_SCALE
    }, {
      easing: "quadOut"
    })
    .delay(COMMENT_ANIMATION_HOLD_DURATION)
    .to(COMMENT_ANIMATION_OUT_DURATION, {
      scale: COMMENT_ANIMATION_OUT_SCALE,
      opacity: 0
    }, {
      easing: "quadIn"
    })
    .call(function () {
      if (commentNode && commentNode.isValid) {
        commentNode.removeFromParent(true);
      }
    })
    .start();
};

LevelRenderer.prototype._instantiateOrCreate = function (prefabPath, parent, name) {
  var existing = parent && name ? parent.getChildByName(name) : null;
  if (existing) {
    return existing;
  }

  var node = prefabPath ? this.prefabFactory.instantiate(prefabPath, parent, name) : null;
  if (!node) {
    node = new cc.Node(name);
    node.parent = parent;
  }
  return node;
};

LevelRenderer.prototype._applyBallVisual = function (node, ballLike, forcedSize) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteCode = resolveBallCode(ballLike);
  var spritePath = BALL_RESOURCES[spriteCode];
  if (!spritePath) {
    throw new Error("Unsupported ball visual code: " + spriteCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded ball sprite frame: " + spritePath);
  }

  spriteTarget.active = true;
  spriteTarget.opacity = 255;
  var sprite = ensureSprite(spriteTarget, spriteFrame);
  sprite.trim = spriteCode !== "VINE_SPIRIT";
  var visualSize = forcedSize || spriteFrame.getOriginalSize();
  spriteTarget.setContentSize(visualSize);

  var iceOverlayNode = getOrCreateChild(spriteTarget, "IceOverlay");
  var shouldShowIceOverlay = isIceBallLike(ballLike) && !!resolveIceInnerColor(ballLike);
  if (shouldShowIceOverlay) {
    var iceFrame = this.spriteFrameCache[BALL_RESOURCES.ICE];
    if (iceFrame) {
      iceOverlayNode.active = true;
      iceOverlayNode.setPosition(0, 0);
      iceOverlayNode.opacity = ICE_OVERLAY_OPACITY;
      iceOverlayNode.zIndex = 5;
      ensureSprite(iceOverlayNode, iceFrame);
      iceOverlayNode.setContentSize(visualSize);
    } else {
      iceOverlayNode.active = false;
    }
  } else {
    iceOverlayNode.active = false;
  }
};

LevelRenderer.prototype._applyJarVisual = function (node, colorCode) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteFrame = this.spriteFrameCache[JAR_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  var jarSprite = ensureSprite(spriteTarget, spriteFrame);
  jarSprite.trim = false;
  spriteTarget.setContentSize(JAR_RENDER_SIZE);
};

LevelRenderer.prototype._applyJarMaskVisual = function (node, colorCode) {
  var maskNode = node.getChildByName("mask") || node.getChildByName("Mask");
  if (!maskNode) {
    return;
  }

  var spriteFrame = this.spriteFrameCache[JAR_MASK_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  ensureSprite(maskNode, spriteFrame);
  maskNode.setContentSize(JAR_RENDER_SIZE);
};
}

module.exports = attachLevelRendererSharedVisualMethods;
