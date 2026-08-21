"use strict";

var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

var SLOT_POSITION_EPSILON = 0.01;
var GLOW_PULSE_DURATION = 0.48;
var GLOW_HIT_EFFECT_DURATION = 2;
var FAIRY_SPINE_SCALE = 0.8;

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
    readPrefabSlotPosition(node, slotConfig.nodeName);
    node.__fairySlotContractValidated = true;
  }
  return node;
}

function readPrefabSlotPosition(node, nodeName) {
  if (!node || !node.isValid) {
    throw new Error("Fairy slot position requires valid node: " + nodeName + ".");
  }
  if (node.__fairySlotPrefabPosition) {
    var cached = node.__fairySlotPrefabPosition;
    if (
      typeof cached.x !== "number" ||
      !isFinite(cached.x) ||
      typeof cached.y !== "number" ||
      !isFinite(cached.y)
    ) {
      throw new Error("Fairy slot cached prefab position is invalid: " + nodeName + ".");
    }
    return cached;
  }
  if (
    typeof node.x !== "number" ||
    !isFinite(node.x) ||
    typeof node.y !== "number" ||
    !isFinite(node.y)
  ) {
    throw new Error("Fairy slot prefab position must be finite: " + nodeName + ".");
  }
  node.__fairySlotPrefabPosition = {
    x: node.x,
    y: node.y
  };
  return node.__fairySlotPrefabPosition;
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

function destroyNode(node) {
  if (!node || !node.isValid) {
    return;
  }
  node.stopAllActions();
  node.removeFromParent(false);
  node.destroy();
}

function disableSlotSprite(node) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    return;
  }
  sprite.spriteFrame = null;
  sprite.enabled = false;
}

function requireSpineRuntime(description) {
  if (typeof sp === "undefined" || !sp || typeof sp.Skeleton !== "function") {
    throw new Error(description + " requires Spine Skeleton runtime.");
  }
  return sp;
}

function playRequiredSpineAnimation(skeleton, animationName, loop, description) {
  if (!skeleton || typeof skeleton.setAnimation !== "function") {
    throw new Error(description + " requires sp.Skeleton.setAnimation.");
  }
  if (typeof animationName !== "string" || !animationName) {
    throw new Error(description + " requires animationName.");
  }
  var trackEntry = skeleton.setAnimation(0, animationName, loop);
  if (!trackEntry) {
    throw new Error(description + " animation is missing: " + animationName + ".");
  }
  return trackEntry;
}

function instantiateFairySkeleton(renderer, skinName, parent, nodeName, description) {
  if (!renderer || !renderer.fairySkeletonData) {
    throw new Error(description + " requires preloaded fairy Spine data.");
  }
  if (typeof skinName !== "string" || !skinName) {
    throw new Error(description + " requires skinName.");
  }
  var spineRuntime = requireSpineRuntime(description);
  var skeletonNode = new cc.Node(nodeName);
  skeletonNode.parent = parent;
  skeletonNode.setPosition(0, -62);
  skeletonNode.setContentSize(FairyAssistConfig.spriteWidth, FairyAssistConfig.spriteHeight);
  skeletonNode.opacity = 255;
  skeletonNode.scale = FAIRY_SPINE_SCALE;
  skeletonNode.active = true;
  var skeleton = skeletonNode.addComponent(spineRuntime.Skeleton);
  if (!skeleton) {
    throw new Error(description + " failed to add sp.Skeleton.");
  }
  skeleton.skeletonData = renderer.fairySkeletonData;
  if (typeof skeleton.setSkin !== "function") {
    throw new Error(description + " requires sp.Skeleton.setSkin.");
  }
  skeleton.setSkin(skinName);
  playRequiredSpineAnimation(skeleton, FairyAssistConfig.idleAnimationName, true, description + " idle");
  return skeletonNode;
}

function requireFairyVisualNode(renderer, node, skinName) {
  disableSlotSprite(node);
  var visualNode = node.getChildByName("FairySpineVisual");
  if (visualNode && visualNode.isValid && node.__fairySkinName === skinName) {
    visualNode.active = true;
    return visualNode;
  }
  if (visualNode) {
    destroyNode(visualNode);
  }
  visualNode = instantiateFairySkeleton(renderer, skinName, node, "FairySpineVisual", "Fairy slot " + node.name);
  node.__fairySkinName = skinName;
  return visualNode;
}

function hideFairyGlow(node) {
  var glowNode = node.getChildByName("FairyGlow");
  if (!glowNode) {
    return;
  }
  glowNode.stopAllActions();
  glowNode.active = false;
  glowNode.scale = FAIRY_SPINE_SCALE;
  glowNode.opacity = 255;
}

function applyGlow(renderer, node, skinName, glowStacks) {
  if (!Number.isInteger(glowStacks) || glowStacks < 0) {
    throw new Error("Fairy glowStacks must be a non-negative integer.");
  }
  node.__fairyGlowStacks = glowStacks;

  if (glowStacks === 0) {
    hideFairyGlow(node);
    return;
  }

  var glowNode = node.getChildByName("FairyGlow");
  if (glowNode && glowNode.isValid && node.__fairyGlowSkinName !== skinName) {
    destroyNode(glowNode);
    glowNode = null;
  }
  if (!glowNode || !glowNode.isValid) {
    glowNode = instantiateFairySkeleton(renderer, skinName, node, "FairyGlow", "Fairy glow");
    glowNode.zIndex = -1;
    node.__fairyGlowSkinName = skinName;
  }
  glowNode.stopAllActions();
  glowNode.active = true;
  var glowSkeleton = glowNode.getComponent(requireSpineRuntime("Fairy glow").Skeleton);
  playRequiredSpineAnimation(glowSkeleton, FairyAssistConfig.idleAnimationName, true, "Fairy glow idle");

  var visualStacks = Math.min(glowStacks, FairyAssistConfig.maxGlowStacks);
  var baseScale = FAIRY_SPINE_SCALE * (1.04 + visualStacks * 0.025);
  var peakScale = baseScale + FAIRY_SPINE_SCALE * 0.08;
  glowNode.opacity = Math.min(210, 48 + visualStacks * 13);
  glowNode.scale = baseScale;

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
  glowNode.runAction(cc.sequence.apply(cc, pulseActions));
}

function configureFairyNode(renderer, node, fairy) {
  if (!fairy || typeof fairy.id !== "string" || !fairy.id) {
    throw new Error("Fairy render state requires id.");
  }
  if (typeof fairy.skinName !== "string" || !fairy.skinName) {
    throw new Error("Fairy render state requires skinName.");
  }

  node.active = true;
  node.opacity = 255;
  node.scale = 1;
  requireFairyVisualNode(renderer, node, fairy.skinName);
  node.__fairyId = fairy.id;
  node.__fairyColor = fairy.color;
  node.__fairyEntering = false;
  applyGlow(renderer, node, fairy.skinName, fairy.glowStacks);
}

function addRequiredSpineAnimation(skeleton, animationName, loop, description) {
  if (!skeleton || typeof skeleton.addAnimation !== "function") {
    throw new Error(description + " requires sp.Skeleton.addAnimation.");
  }
  var trackEntry = skeleton.addAnimation(0, animationName, loop, 0);
  if (!trackEntry) {
    throw new Error(description + " animation is missing: " + animationName + ".");
  }
  return trackEntry;
}

function playFairySmashCount(node, smashCount) {
  if (!Number.isInteger(smashCount) || smashCount <= 0) {
    throw new Error("Fairy smash count must be a positive integer.");
  }
  var visualNode = node.getChildByName("FairySpineVisual");
  if (!visualNode || !visualNode.isValid) {
    throw new Error("Fairy smash requires FairySpineVisual.");
  }
  var skeleton = visualNode.getComponent(requireSpineRuntime("Fairy smash").Skeleton);
  playRequiredSpineAnimation(skeleton, FairyAssistConfig.smashAnimationName, false, "Fairy smash");
  for (var index = 1; index < smashCount; index += 1) {
    addRequiredSpineAnimation(skeleton, FairyAssistConfig.smashAnimationName, false, "Queued fairy smash");
  }
  addRequiredSpineAnimation(skeleton, FairyAssistConfig.idleAnimationName, true, "Fairy idle after smash");
}

function playPendingFairySmash(node) {
  var smashCount = node.__fairyPendingSmashCount;
  if (smashCount === undefined || smashCount === 0) {
    return;
  }
  node.__fairyPendingSmashCount = 0;
  playFairySmashCount(node, smashCount);
}

function playFairyHitAnimations(root, snapshot, runtimeEvents) {
  if (!Array.isArray(runtimeEvents)) {
    throw new Error("Fairy hit animation requires runtimeEvents array.");
  }
  var hitCounts = {};
  runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "fairy_assist_hit") {
      return;
    }
    if (typeof event.fairyId !== "string" || !event.fairyId) {
      throw new Error("fairy_assist_hit requires fairyId for smash animation.");
    }
    var currentHitCount = hitCounts[event.fairyId];
    if (currentHitCount === undefined) {
      hitCounts[event.fairyId] = 1;
      return;
    }
    if (!Number.isInteger(currentHitCount) || currentHitCount <= 0) {
      throw new Error("Fairy hit count is invalid for " + event.fairyId + ".");
    }
    hitCounts[event.fairyId] = currentHitCount + 1;
  });

  Object.keys(hitCounts).forEach(function (fairyId) {
    var slotSnapshot = null;
    for (var index = 0; index < snapshot.slots.length; index += 1) {
      var candidate = snapshot.slots[index];
      if (candidate.fairy && candidate.fairy.id === fairyId) {
        slotSnapshot = candidate;
        break;
      }
    }
    if (!slotSnapshot) {
      throw new Error("fairy_assist_hit targets missing fairy: " + fairyId + ".");
    }
    var slotConfig = FairyAssistConfig.slots[slotSnapshot.index];
    var node = requireSlotNode(root, slotSnapshot, slotConfig);
    if (node.__fairyId === fairyId) {
      playFairySmashCount(node, hitCounts[fairyId]);
      return;
    }
    if (node.__fairyPendingTargetId !== fairyId) {
      throw new Error("fairy_assist_hit visual target is inconsistent: " + fairyId + ".");
    }
    var pendingCount = node.__fairyPendingSmashCount;
    if (pendingCount !== undefined && (!Number.isInteger(pendingCount) || pendingCount < 0)) {
      throw new Error("Fairy pending smash count is invalid.");
    }
    var initialPendingCount = pendingCount === undefined ? 0 : pendingCount;
    node.__fairyPendingSmashCount = initialPendingCount + hitCounts[fairyId];
  });
}

function playFairyEntry(renderer, node, fairy, slotPosition, token) {
  configureFairyNode(renderer, node, fairy);
  playPendingFairySmash(node);
  node.__fairyEntering = true;
  var spawnPosition = resolveFairySpawnPosition(renderer, fairy.spawnFrom);
  node.setPosition(spawnPosition.x, spawnPosition.y);
  node.opacity = 0;
  node.scale = 0.72;

  var deltaX = slotPosition.x - spawnPosition.x;
  var deltaY = slotPosition.y - spawnPosition.y;
  var controlLift = Math.max(80, Math.abs(deltaY) * 0.22);
  var bezier = [
    cc.v2(spawnPosition.x + deltaX * 0.3, spawnPosition.y + deltaY * 0.3 + controlLift),
    cc.v2(spawnPosition.x + deltaX * 0.7, spawnPosition.y + deltaY * 0.7 + controlLift),
    cc.v2(slotPosition.x, slotPosition.y)
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
      node.setPosition(slotPosition.x, slotPosition.y);
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
    node.__fairyPendingSmashCount = 0;
    hideFairyGlow(node);
  });
}

function replaceFairyNode(renderer, node, fairy, slotPosition, token) {
  playFairyDepartFlyOut(node, token, function () {
    playFairyEntry(renderer, node, fairy, slotPosition, token);
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
      var slotPosition = readPrefabSlotPosition(slotNode, slotConfig.nodeName);
      if (typeof root.convertToWorldSpaceAR !== "function") {
        throw new Error("Fairy slot root must support convertToWorldSpaceAR.");
      }
      if (typeof boardLayer.convertToNodeSpaceAR !== "function") {
        throw new Error("Board layer must support convertToNodeSpaceAR.");
      }
      var worldPos = root.convertToWorldSpaceAR(cc.v2(slotPosition.x, slotPosition.y));
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
      var slotPosition = readPrefabSlotPosition(node, slotConfig.nodeName);
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
          node.setPosition(slotPosition.x, slotPosition.y);
          node.active = true;
          node.opacity = 255;
          node.scale = 1;
        }
        if (node.__fairyGlowStacks !== fairy.glowStacks) {
          if (typeof fairy.skinName !== "string" || !fairy.skinName) {
            throw new Error("Active fairy slot requires skinName.");
          }
          requireFairyVisualNode(this, node, fairy.skinName);
          applyGlow(this, node, fairy.skinName, fairy.glowStacks);
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
        replaceFairyNode(this, node, fairy, slotPosition, token);
        return;
      }
      node.stopAllActions();
      playFairyEntry(this, node, fairy, slotPosition, token);
    }, this);
    playFairyHitAnimations(root, snapshot, runtimeSnapshot.runtimeEvents);
  };
}

module.exports = attachLevelRendererFairyMethods;
