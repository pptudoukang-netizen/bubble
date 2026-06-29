"use strict";

var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

var SLOT_POSITION_EPSILON = 0.01;
var GLOW_PULSE_DURATION = 0.48;
var GLOW_HIT_EFFECT_DURATION = 2;

function requireFairyTiming() {
  var timing = SpecialAnimationTiming.fairyAssist;
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    throw new Error("SpecialAnimationTiming.fairyAssist is required.");
  }
  if (typeof timing.flyInDuration !== "number" || !isFinite(timing.flyInDuration) || timing.flyInDuration <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyInDuration must be positive.");
  }
  if (typeof timing.flyOutDuration !== "number" || !isFinite(timing.flyOutDuration) || timing.flyOutDuration <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyOutDuration must be positive.");
  }
  if (typeof timing.flyOutDistance !== "number" || !isFinite(timing.flyOutDistance) || timing.flyOutDistance <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyOutDistance must be positive.");
  }
  return timing;
}

var FAIRY_TIMING = requireFairyTiming();

function requireFairyRoot(renderer) {
  if (!renderer.layers || !renderer.layers.hud) {
    throw new Error("Fairy rendering requires HUD layer.");
  }
  var gameViewNode = renderer.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Fairy rendering requires GameView node.");
  }
  var root = gameViewNode.getChildByName("geniuses");
  if (!root || !root.isValid) {
    throw new Error("GameView requires geniuses node.");
  }
  return root;
}

function requireSlotNode(root, slotSnapshot, slotConfig) {
  if (!slotSnapshot || slotSnapshot.index !== slotConfig.index || slotSnapshot.nodeName !== slotConfig.nodeName) {
    throw new Error("Fairy snapshot slot contract mismatch at index " + slotConfig.index + ".");
  }
  var node = root.getChildByName(slotConfig.nodeName);
  if (!node || !node.isValid) {
    throw new Error("GameView/geniuses requires node " + slotConfig.nodeName + ".");
  }
  if (node.__fairySlotContractValidated !== true) {
    if (
      Math.abs(node.x - slotConfig.x) > SLOT_POSITION_EPSILON ||
      Math.abs(node.y - slotConfig.y) > SLOT_POSITION_EPSILON
    ) {
      throw new Error(
        "GameView/geniuses/" + slotConfig.nodeName +
        " position must match FairyAssistConfig."
      );
    }
    node.__fairySlotContractValidated = true;
  }
  return node;
}

function isPositiveFiniteSize(size) {
  return (
    size &&
    typeof size.width === "number" &&
    isFinite(size.width) &&
    size.width > 0 &&
    typeof size.height === "number" &&
    isFinite(size.height) &&
    size.height > 0
  );
}

function readSpriteFrameOriginalSize(spriteFrame) {
  if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
    return null;
  }
  var size = spriteFrame.getOriginalSize();
  if (isPositiveFiniteSize(size)) {
    return {
      width: size.width,
      height: size.height
    };
  }
  if (isPositiveFiniteSize(spriteFrame._originalSize)) {
    return {
      width: spriteFrame._originalSize.width,
      height: spriteFrame._originalSize.height
    };
  }
  return null;
}

function requireSpriteFrameOriginalSize(spriteFrame, description) {
  var size = readSpriteFrameOriginalSize(spriteFrame);
  if (size) {
    return size;
  }
  if (!spriteFrame || typeof spriteFrame.getRect !== "function") {
    throw new Error(description + " spriteFrame original size is invalid.");
  }
  var rect = spriteFrame.getRect();
  if (!isPositiveFiniteSize(rect)) {
    throw new Error(description + " spriteFrame original size is invalid.");
  }
  var offset = requireSpriteFrameOffset(spriteFrame, description);
  if (
    Math.abs(offset.x) > SLOT_POSITION_EPSILON ||
    Math.abs(offset.y) > SLOT_POSITION_EPSILON
  ) {
    throw new Error(description + " spriteFrame original size is invalid for trimmed frame.");
  }
  return {
    width: rect.width,
    height: rect.height
  };
}

function requireSpriteFrameOffset(spriteFrame, description) {
  if (!spriteFrame || typeof spriteFrame.getOffset !== "function") {
    throw new Error(description + " requires spriteFrame with getOffset.");
  }
  var offset = spriteFrame.getOffset();
  if (
    !offset ||
    typeof offset.x !== "number" ||
    !isFinite(offset.x) ||
    typeof offset.y !== "number" ||
    !isFinite(offset.y)
  ) {
    throw new Error(description + " spriteFrame offset is invalid.");
  }
  return offset;
}

function isUntrimmedSpriteFrame(spriteFrame, description) {
  var originalSize = requireSpriteFrameOriginalSize(spriteFrame, description);
  var rect = spriteFrame.getRect();
  if (
    !rect ||
    rect.width !== originalSize.width ||
    rect.height !== originalSize.height
  ) {
    return false;
  }
  var offset = requireSpriteFrameOffset(spriteFrame, description);
  return (
    Math.abs(offset.x) <= SLOT_POSITION_EPSILON &&
    Math.abs(offset.y) <= SLOT_POSITION_EPSILON
  );
}

function resolveFullTextureRect(spriteFrame, description) {
  var originalSize = requireSpriteFrameOriginalSize(spriteFrame, description);
  var currentRect = spriteFrame.getRect();
  if (
    !currentRect ||
    typeof currentRect.x !== "number" ||
    !isFinite(currentRect.x) ||
    typeof currentRect.y !== "number" ||
    !isFinite(currentRect.y)
  ) {
    throw new Error(description + " spriteFrame rect position is invalid.");
  }
  var offset = requireSpriteFrameOffset(spriteFrame, description);
  var trimX = offset.x + originalSize.width / 2 - currentRect.width / 2;
  var trimY = offset.y + originalSize.height / 2 - currentRect.height / 2;
  return cc.rect(
    currentRect.x - trimX,
    currentRect.y - trimY,
    originalSize.width,
    originalSize.height
  );
}

function createUntrimmedSpriteFrame(spriteFrame, assetPath) {
  if (!spriteFrame) {
    throw new Error("Untrimmed fairy sprite requires spriteFrame: " + assetPath);
  }
  if (isUntrimmedSpriteFrame(spriteFrame, assetPath)) {
    return spriteFrame;
  }
  if (typeof spriteFrame.getTexture !== "function") {
    throw new Error("Untrimmed fairy sprite requires getTexture: " + assetPath);
  }
  var texture = spriteFrame.getTexture();
  if (!texture) {
    throw new Error("Untrimmed fairy sprite requires texture: " + assetPath);
  }
  if (typeof cc.SpriteFrame !== "function") {
    throw new Error("Untrimmed fairy sprite requires cc.SpriteFrame.");
  }
  var originalSize = requireSpriteFrameOriginalSize(spriteFrame, assetPath);
  var fullRect = resolveFullTextureRect(spriteFrame, assetPath);
  var untrimmed = new cc.SpriteFrame(texture);
  untrimmed.setRect(fullRect);
  if (typeof untrimmed.setOriginalSize === "function") {
    untrimmed.setOriginalSize(cc.size(originalSize.width, originalSize.height));
  }
  if (typeof untrimmed.setOffset === "function") {
    untrimmed.setOffset(cc.v2(0, 0));
  }
  return untrimmed;
}

function retainGeneratedSpriteFrame(spriteFrame, assetPath) {
  if (!spriteFrame) {
    throw new Error("Cannot retain empty generated fairy sprite frame: " + assetPath);
  }
  if (typeof spriteFrame.addRef !== "function") {
    throw new Error("SpriteFrame.addRef is required for generated fairy sprite: " + assetPath);
  }
  spriteFrame.addRef();
  return spriteFrame;
}

function resolveFairySpriteFrame(renderer, assetPath) {
  var spriteFrame = renderer.spriteFrameCache[assetPath];
  if (!spriteFrame) {
    throw new Error("Fairy sprite was not preloaded: " + assetPath);
  }
  if (isUntrimmedSpriteFrame(spriteFrame, assetPath)) {
    return spriteFrame;
  }
  var untrimmedKey = assetPath + "__untrimmed";
  if (renderer.spriteFrameCache[untrimmedKey]) {
    return renderer.spriteFrameCache[untrimmedKey];
  }
  var untrimmed = createUntrimmedSpriteFrame(spriteFrame, assetPath);
  renderer.spriteFrameCache[untrimmedKey] = retainGeneratedSpriteFrame(untrimmed, untrimmedKey);
  return renderer.spriteFrameCache[untrimmedKey];
}

function applyFairySpriteFrame(sprite, spriteFrame, description) {
  if (!sprite || !sprite.node) {
    throw new Error(description + " requires cc.Sprite.");
  }
  var size = requireSpriteFrameOriginalSize(spriteFrame, description);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  sprite.node.setContentSize(size.width, size.height);
}

function resolveFairySpawnPosition(renderer, spawnFrom) {
  if (
    !spawnFrom ||
    typeof spawnFrom.x !== "number" ||
    !isFinite(spawnFrom.x) ||
    typeof spawnFrom.y !== "number" ||
    !isFinite(spawnFrom.y)
  ) {
    throw new Error("Fairy spawnFrom must be a finite point.");
  }
  if (typeof renderer._convertBoardPointToGameView !== "function") {
    throw new Error("Fairy spawn rendering requires _convertBoardPointToGameView.");
  }
  return renderer._convertBoardPointToGameView(spawnFrom.x, spawnFrom.y);
}

function requireFairySprite(node) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    sprite = node.addComponent(cc.Sprite);
  }
  if (!sprite) {
    throw new Error("Fairy slot requires cc.Sprite: " + node.name);
  }
  return sprite;
}

function requireGlowNode(node) {
  var glowNode = node.getChildByName("FairyGlow");
  if (!glowNode) {
    glowNode = new cc.Node("FairyGlow");
    glowNode.parent = node;
    glowNode.setPosition(0, 0);
    glowNode.zIndex = -1;
  }
  var glowSprite = glowNode.getComponent(cc.Sprite);
  if (!glowSprite) {
    glowSprite = glowNode.addComponent(cc.Sprite);
  }
  if (!glowSprite) {
    throw new Error("Fairy glow node requires cc.Sprite.");
  }
  return {
    node: glowNode,
    sprite: glowSprite
  };
}

function hideFairyGlow(node) {
  var glowNode = node.getChildByName("FairyGlow");
  if (!glowNode) {
    return;
  }
  glowNode.stopAllActions();
  glowNode.active = false;
  glowNode.scale = 1;
  glowNode.opacity = 255;
}

function applyGlow(node, spriteFrame, glowStacks) {
  if (!Number.isInteger(glowStacks) || glowStacks < 0) {
    throw new Error("Fairy glowStacks must be a non-negative integer.");
  }
  var glow = requireGlowNode(node);
  applyFairySpriteFrame(glow.sprite, spriteFrame, "Fairy glow");
  glow.node.stopAllActions();
  node.__fairyGlowStacks = glowStacks;

  if (glowStacks === 0) {
    hideFairyGlow(node);
    return;
  }

  var visualStacks = Math.min(glowStacks, FairyAssistConfig.maxGlowStacks);
  var baseScale = 1.04 + visualStacks * 0.025;
  var peakScale = baseScale + 0.08;
  glow.node.active = true;
  glow.node.opacity = Math.min(210, 48 + visualStacks * 13);
  glow.node.scale = baseScale;

  var pulseCycle = cc.sequence(
    cc.scaleTo(GLOW_PULSE_DURATION, peakScale),
    cc.scaleTo(GLOW_PULSE_DURATION, baseScale)
  );
  var cycleDuration = GLOW_PULSE_DURATION * 2;
  var fullCycles = Math.floor(GLOW_HIT_EFFECT_DURATION / cycleDuration);
  var remainder = GLOW_HIT_EFFECT_DURATION - fullCycles * cycleDuration;
  var pulseActions = [];
  if (fullCycles > 0) {
    pulseActions.push(cc.repeat(pulseCycle, fullCycles));
  }
  if (remainder > SLOT_POSITION_EPSILON) {
    if (remainder <= GLOW_PULSE_DURATION) {
      var partialPeak = baseScale + (peakScale - baseScale) * (remainder / GLOW_PULSE_DURATION);
      pulseActions.push(cc.scaleTo(remainder, partialPeak));
    } else {
      pulseActions.push(cc.scaleTo(GLOW_PULSE_DURATION, peakScale));
      pulseActions.push(cc.scaleTo(remainder - GLOW_PULSE_DURATION, baseScale));
    }
  }
  pulseActions.push(cc.callFunc(function () {
    hideFairyGlow(node);
  }));
  glow.node.runAction(cc.sequence.apply(cc, pulseActions));
}

function configureFairyNode(renderer, node, fairy) {
  if (!fairy || typeof fairy.id !== "string" || !fairy.id) {
    throw new Error("Fairy render state requires id.");
  }
  if (typeof fairy.assetPath !== "string" || !fairy.assetPath) {
    throw new Error("Fairy render state requires assetPath.");
  }
  var spriteFrame = resolveFairySpriteFrame(renderer, fairy.assetPath);

  var sprite = requireFairySprite(node);
  applyFairySpriteFrame(sprite, spriteFrame, "Fairy slot " + node.name);
  node.__fairyId = fairy.id;
  node.__fairyColor = fairy.color;
  node.__fairyEntering = false;
  node.active = true;
  node.opacity = 255;
  node.scale = 1;
  applyGlow(node, spriteFrame, fairy.glowStacks);
}

function playFairyEntry(renderer, node, fairy, slotConfig, token) {
  configureFairyNode(renderer, node, fairy);
  node.__fairyEntering = true;
  var spawnPosition = resolveFairySpawnPosition(renderer, fairy.spawnFrom);
  node.setPosition(spawnPosition.x, spawnPosition.y);
  node.opacity = 0;
  node.scale = 0.72;

  var deltaX = slotConfig.x - spawnPosition.x;
  var deltaY = slotConfig.y - spawnPosition.y;
  var controlLift = Math.max(80, Math.abs(deltaY) * 0.22);
  var bezier = [
    cc.v2(spawnPosition.x + deltaX * 0.3, spawnPosition.y + deltaY * 0.3 + controlLift),
    cc.v2(spawnPosition.x + deltaX * 0.7, spawnPosition.y + deltaY * 0.7 + controlLift),
    cc.v2(slotConfig.x, slotConfig.y)
  ];
  node.runAction(cc.sequence(
    cc.spawn(
      cc.bezierTo(FAIRY_TIMING.flyInDuration, bezier),
      cc.fadeIn(FAIRY_TIMING.flyInDuration),
      cc.scaleTo(FAIRY_TIMING.flyInDuration, 1)
    ),
    cc.callFunc(function () {
      if (node.__fairyRenderToken !== token || node.__fairyId !== fairy.id) {
        return;
      }
      node.__fairyEntering = false;
      node.setPosition(slotConfig.x, slotConfig.y);
      node.opacity = 255;
      node.scale = 1;
    })
  ));
}

function playFairyDepartFlyOut(node, token, onComplete) {
  if (!node || !node.isValid) {
    throw new Error("Fairy depart fly out requires valid node.");
  }
  var startX = node.x;
  var startY = node.y;
  if (typeof startX !== "number" || !isFinite(startX) || typeof startY !== "number" || !isFinite(startY)) {
    throw new Error("Fairy depart fly out requires finite node position.");
  }

  hideFairyGlow(node);
  node.stopAllActions();
  node.runAction(cc.sequence(
    cc.moveTo(FAIRY_TIMING.flyOutDuration, startX, startY + FAIRY_TIMING.flyOutDistance),
    cc.callFunc(function () {
      if (node.__fairyRenderToken !== token) {
        return;
      }
      if (typeof onComplete === "function") {
        onComplete();
      }
    })
  ));
}

function hideFairyNode(node, token) {
  if (!node.__fairyId) {
    hideFairyGlow(node);
    node.active = false;
    return;
  }
  playFairyDepartFlyOut(node, token, function () {
    node.active = false;
    node.__fairyId = null;
    node.__fairyColor = null;
    node.__fairyEntering = false;
    node.__fairyGlowStacks = 0;
    hideFairyGlow(node);
  });
}

function replaceFairyNode(renderer, node, fairy, slotConfig, token) {
  playFairyDepartFlyOut(node, token, function () {
    playFairyEntry(renderer, node, fairy, slotConfig, token);
  });
}

function attachLevelRendererFairyMethods(LevelRenderer) {
  LevelRenderer.prototype.setFairyAssistSystem = function (fairyAssistSystem) {
    if (!fairyAssistSystem || typeof fairyAssistSystem.syncCollisionCenters !== "function") {
      throw new Error("LevelRenderer.setFairyAssistSystem requires FairyAssistSystem.");
    }
    this._fairyAssistSystem = fairyAssistSystem;
    return this;
  };

  LevelRenderer.prototype.syncFairyAssistCollisionCenters = function () {
    if (!this._fairyAssistSystem) {
      throw new Error("LevelRenderer.syncFairyAssistCollisionCenters requires bound FairyAssistSystem.");
    }
    if (!this.layers || !this.layers.board) {
      throw new Error("Board layer is required before syncing fairy collision centers.");
    }
    var root = requireFairyRoot(this);
    var boardLayer = this.layers.board;
    var centers = FairyAssistConfig.slots.map(function (slotConfig) {
      var slotNode = root.getChildByName(slotConfig.nodeName);
      if (!slotNode || !slotNode.isValid) {
        throw new Error("GameView/geniuses requires node " + slotConfig.nodeName + " for collision sync.");
      }
      if (typeof slotNode.convertToWorldSpaceAR !== "function") {
        throw new Error("Fairy slot node must support convertToWorldSpaceAR: " + slotConfig.nodeName + ".");
      }
      if (typeof boardLayer.convertToNodeSpaceAR !== "function") {
        throw new Error("Board layer must support convertToNodeSpaceAR.");
      }
      var worldPos = slotNode.convertToWorldSpaceAR(cc.v2(0, 0));
      var boardPos = boardLayer.convertToNodeSpaceAR(worldPos);
      if (
        !boardPos ||
        typeof boardPos.x !== "number" ||
        !isFinite(boardPos.x) ||
        typeof boardPos.y !== "number" ||
        !isFinite(boardPos.y)
      ) {
        throw new Error("Fairy slot collision center conversion failed at " + slotConfig.nodeName + ".");
      }
      return {
        index: slotConfig.index,
        x: boardPos.x,
        y: boardPos.y
      };
    });
    this._fairyAssistSystem.syncCollisionCenters(centers);
    return this;
  };

  LevelRenderer.prototype._renderFairyAssists = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.systems || !runtimeSnapshot.systems.fairyAssistSystem) {
      throw new Error("Fairy rendering requires runtime FairyAssistSystem snapshot.");
    }
    var snapshot = runtimeSnapshot.systems.fairyAssistSystem;
    if (!Array.isArray(snapshot.slots) || snapshot.slots.length !== FairyAssistConfig.slots.length) {
      throw new Error("Fairy rendering requires exactly six slot snapshots.");
    }

    var root = requireFairyRoot(this);
    FairyAssistConfig.slots.forEach(function (slotConfig) {
      var slotSnapshot = snapshot.slots[slotConfig.index];
      var node = requireSlotNode(root, slotSnapshot, slotConfig);
      var fairy = slotSnapshot.fairy;

      if (fairy === null) {
        if (!node.__fairyId) {
          hideFairyGlow(node);
          node.active = false;
          return;
        }
        if (node.__fairyPendingTargetId === null) {
          return;
        }
        node.__fairyPendingTargetId = null;
        node.__fairyRenderToken = Number.isInteger(node.__fairyRenderToken)
          ? node.__fairyRenderToken + 1
          : 1;
        var hideToken = node.__fairyRenderToken;
        hideFairyNode(node, hideToken);
        return;
      }
      if (!fairy.position) {
        throw new Error("Fairy snapshot position is required for slot " + slotConfig.nodeName + ".");
      }

      if (node.__fairyId === fairy.id) {
        node.__fairyPendingTargetId = fairy.id;
        if (node.__fairyEntering !== true) {
          node.setPosition(slotConfig.x, slotConfig.y);
          node.active = true;
          node.opacity = 255;
          node.scale = 1;
        }
        if (node.__fairyGlowStacks !== fairy.glowStacks) {
          var sprite = requireFairySprite(node);
          if (!sprite.spriteFrame) {
            throw new Error("Active fairy slot requires spriteFrame.");
          }
          var glowSpriteFrame = resolveFairySpriteFrame(this, fairy.assetPath);
          applyGlow(node, glowSpriteFrame, fairy.glowStacks);
        }
        return;
      }

      if (node.__fairyPendingTargetId === fairy.id) {
        return;
      }
      node.__fairyPendingTargetId = fairy.id;
      node.__fairyRenderToken = Number.isInteger(node.__fairyRenderToken)
        ? node.__fairyRenderToken + 1
        : 1;
      var token = node.__fairyRenderToken;

      if (node.__fairyId && node.active) {
        replaceFairyNode(this, node, fairy, slotConfig, token);
        return;
      }
      node.stopAllActions();
      playFairyEntry(this, node, fairy, slotConfig, token);
    }, this);
  };
}

module.exports = attachLevelRendererFairyMethods;
