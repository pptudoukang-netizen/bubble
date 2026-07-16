"use strict";

function attachLevelRendererSceneFxMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var SpecialAnimationTiming = deps.SpecialAnimationTiming;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var BARRIER_HAMMER_HINT_SIZE = deps.BARRIER_HAMMER_HINT_SIZE;
  var BARRIER_HAMMER_HINT_OFFSET_X = deps.BARRIER_HAMMER_HINT_OFFSET_X;
  var BARRIER_HAMMER_HINT_OFFSET_Y = deps.BARRIER_HAMMER_HINT_OFFSET_Y;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_X = deps.BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_Y = deps.BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  var BARRIER_HAMMER_HINT_LIFT_DURATION = deps.BARRIER_HAMMER_HINT_LIFT_DURATION;
  var BARRIER_HAMMER_HINT_STRIKE_DURATION = deps.BARRIER_HAMMER_HINT_STRIKE_DURATION;
  var BARRIER_HAMMER_HINT_PAUSE_DURATION = deps.BARRIER_HAMMER_HINT_PAUSE_DURATION;
  var IMPACT_DEFAULT_PUSH_DISTANCE = deps.IMPACT_DEFAULT_PUSH_DISTANCE;
  var IMPACT_MIN_PUSH_DURATION = deps.IMPACT_MIN_PUSH_DURATION;
  var IMPACT_MIN_RETURN_DURATION = deps.IMPACT_MIN_RETURN_DURATION;
  var IMPACT_RETURN_DURATION_RATIO = deps.IMPACT_RETURN_DURATION_RATIO;
  var SHOT_NO_DROP_SHAKE_OFFSET = deps.SHOT_NO_DROP_SHAKE_OFFSET;
  var SHOT_NO_DROP_SHAKE_STEP_DURATION = deps.SHOT_NO_DROP_SHAKE_STEP_DURATION;
  var ICE_THAW_SHAKE_OFFSET = deps.ICE_THAW_SHAKE_OFFSET;
  var ICE_THAW_SHAKE_STEP_DURATION = deps.ICE_THAW_SHAKE_STEP_DURATION;
  var ICE_COLLECT_FLY_DURATION = deps.ICE_COLLECT_FLY_DURATION;
  var ICE_COLLECT_BEZIER_ARC = deps.ICE_COLLECT_BEZIER_ARC;
  var ICE_COLLECT_FLY_Z_INDEX = deps.ICE_COLLECT_FLY_Z_INDEX;
  var ICE_COLLECT_FLY_EASE_RATE = deps.ICE_COLLECT_FLY_EASE_RATE;
  var ICE_COLLECT_FLY_TWEEN_EASING = deps.ICE_COLLECT_FLY_TWEEN_EASING;
  var SPLITTER_SPAWN_FLY_DURATION = deps.SPLITTER_SPAWN_FLY_DURATION;
  var SPLITTER_SPAWN_BEZIER_ARC = deps.SPLITTER_SPAWN_BEZIER_ARC;
  var FIREWORKS_PREFAB_PATH = deps.FIREWORKS_PREFAB_PATH;
  var BOARD_CLEAR_FIREWORKS_BURST_COUNT = deps.BOARD_CLEAR_FIREWORKS_BURST_COUNT;
  var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = deps.BOARD_CLEAR_FIREWORKS_INTERVAL_SEC;
  var ensureSprite = deps.ensureSprite;
  var getOrCreateChild = deps.getOrCreateChild;
  var resolveImpactBounceSpeed = deps.resolveImpactBounceSpeed;
  var resolveBallCode = deps.resolveBallCode;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var hasIceSnowballCollectionObjective = deps.hasIceSnowballCollectionObjective;
  var pointDistance = deps.pointDistance;
  var POWERUP_ICON_RESOURCES = deps.POWERUP_ICON_RESOURCES;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;

  function requireVisualChild(node, childName, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    var child = node.getChildByName(childName);
    if (!child || !child.isValid) {
      throw new Error(ownerName + " requires child `" + childName + "`.");
    }
    return child;
  }

  function instantiateRequired(prefabFactory, prefabPath, parent, name, ownerName) {
    if (!prefabFactory || typeof prefabFactory.instantiate !== "function") {
      throw new Error(ownerName + " requires prefabFactory.instantiate.");
    }
    var node = prefabFactory.instantiate(prefabPath, parent, name);
    if (!node || !node.isValid) {
      throw new Error(ownerName + " prefab instantiate failed: " + prefabPath);
    }
    return node;
  }

  function applyIceCollectFlyEaseAction(action) {
    if (!action || typeof action.easing !== "function") {
      throw new Error("Ice collect fly action requires easing support.");
    }
    if (typeof cc.easeIn !== "function") {
      throw new Error("Ice collect fly requires cc.easeIn.");
    }
    if (typeof ICE_COLLECT_FLY_EASE_RATE !== "number" || !isFinite(ICE_COLLECT_FLY_EASE_RATE) || ICE_COLLECT_FLY_EASE_RATE <= 0) {
      throw new Error("Ice collect fly ease rate must be positive.");
    }
    return action.easing(cc.easeIn(ICE_COLLECT_FLY_EASE_RATE));
  }
  var SPLITTER_SPAWN_FLY_DURATION = deps.SPLITTER_SPAWN_FLY_DURATION;
  var SPLITTER_SPAWN_BEZIER_ARC = deps.SPLITTER_SPAWN_BEZIER_ARC;
  var loadSpriteFrame = deps.loadSpriteFrame;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  function requireFinitePoint(point, ownerName) {
    if (
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !isFinite(point.x) ||
      !isFinite(point.y)
    ) {
      throw new Error(ownerName + " position must be finite.");
    }
    return point;
  }

  function requirePositiveFiniteNumber(value, ownerName) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error(ownerName + " must be a positive finite number.");
    }
    return value;
  }

  function requireBoardClearFireworksPrefab(renderer) {
    if (!renderer || !renderer.fireworksPrefab) {
      throw new Error("Board clear fireworks requires preloaded prefab: animation/" + FIREWORKS_PREFAB_PATH);
    }
    return renderer.fireworksPrefab;
  }

  function requireBoardClearFireworksRootParent(renderer) {
    if (!renderer || typeof renderer._getGameViewNode !== "function") {
      throw new Error("Board clear fireworks requires _getGameViewNode.");
    }
    var gameViewNode = renderer._getGameViewNode();
    if (!gameViewNode || !gameViewNode.isValid) {
      throw new Error("Board clear fireworks requires GameView node.");
    }
    return gameViewNode;
  }

  function requireBoardClearFireworksSpawnArea(renderer) {
    var gameViewNode = requireBoardClearFireworksRootParent(renderer);
    if (typeof gameViewNode.getContentSize !== "function") {
      throw new Error("Board clear fireworks requires GameView size.");
    }
    var rootSize = gameViewNode.getContentSize();
    if (
      !rootSize ||
      typeof rootSize.width !== "number" ||
      typeof rootSize.height !== "number" ||
      !isFinite(rootSize.width) ||
      !isFinite(rootSize.height) ||
      rootSize.width <= 0 ||
      rootSize.height <= 0
    ) {
      throw new Error("Board clear fireworks GameView size is invalid.");
    }
    return {
      centerX: 0,
      centerY: rootSize.height * 0.22,
      halfWidth: rootSize.width * 0.2,
      halfHeight: rootSize.height * 0.14
    };
  }

  function createRandomPointInArea(area) {
    if (!area || typeof area !== "object" || Array.isArray(area)) {
      throw new Error("Board clear fireworks spawn area is required.");
    }
    requirePositiveFiniteNumber(area.halfWidth, "Board clear fireworks halfWidth");
    requirePositiveFiniteNumber(area.halfHeight, "Board clear fireworks halfHeight");
    return {
      x: area.centerX + (Math.random() * 2 - 1) * area.halfWidth,
      y: area.centerY + (Math.random() * 2 - 1) * area.halfHeight
    };
  }

  function requireParticleSystem(node, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " requires valid node.");
    }
    var particleSystem = node.getComponent(cc.ParticleSystem);
    if (!particleSystem) {
      throw new Error(ownerName + " requires cc.ParticleSystem.");
    }
    if (typeof particleSystem.resetSystem !== "function") {
      throw new Error(ownerName + " ParticleSystem requires resetSystem.");
    }
    return particleSystem;
  }

  function stopParticleSystemIfPresent(node) {
    if (!node || !node.isValid) {
      return;
    }
    var particleSystem = node.getComponent(cc.ParticleSystem);
    if (particleSystem && typeof particleSystem.stopSystem === "function") {
      particleSystem.stopSystem();
    }
  }

  function instantiateBoardClearFireworks(renderer, parent, position) {
    var targetPosition = requireFinitePoint(position, "Board clear fireworks");
    var prefab = requireBoardClearFireworksPrefab(renderer);
    var node = cc.instantiate(prefab);
    if (!node || !node.isValid) {
      throw new Error("Board clear fireworks prefab instantiate failed: animation/" + FIREWORKS_PREFAB_PATH);
    }
    renderer.boardClearFireworksBurstSerial += 1;
    node.name = "BoardClearFireworks_" + renderer.boardClearFireworksBurstSerial;
    node.parent = parent;
    node.zIndex = renderer.boardClearFireworksBurstSerial;
    node.setPosition(targetPosition.x, targetPosition.y);
    node.active = true;
    var particleSystem = requireParticleSystem(node, "Board clear fireworks");
    particleSystem.resetSystem();
    return node;
  }

  function spawnBoardClearFireworksBurst(renderer) {
    if (!renderer || renderer.boardClearFireworksActive !== true) {
      return;
    }
    var root = renderer.boardClearFireworksRoot;
    if (!root || !root.isValid) {
      throw new Error("Board clear fireworks root became invalid while active.");
    }
    var burstCount = Math.floor(Number(BOARD_CLEAR_FIREWORKS_BURST_COUNT));
    if (!Number.isInteger(burstCount) || burstCount <= 0) {
      throw new Error("Board clear fireworks burst count must be positive integer.");
    }
    var area = requireBoardClearFireworksSpawnArea(renderer);
    for (var index = 0; index < burstCount; index += 1) {
      instantiateBoardClearFireworks(renderer, root, createRandomPointInArea(area));
    }
  }

  function requireExplodeAnimationClip(renderer, ownerName) {
    if (!renderer || !renderer.explodeAnimationClip) {
      throw new Error(ownerName + " requires preloaded explode animation clip.");
    }
    if (typeof renderer.explodeAnimationClip.duration !== "number" || !isFinite(renderer.explodeAnimationClip.duration) || renderer.explodeAnimationClip.duration <= 0) {
      throw new Error(ownerName + " explode animation clip duration is invalid.");
    }
    if (typeof renderer.explodeAnimationClip.speed !== "number" || !isFinite(renderer.explodeAnimationClip.speed) || renderer.explodeAnimationClip.speed <= 0) {
      throw new Error(ownerName + " explode animation clip speed is invalid.");
    }
    return renderer.explodeAnimationClip;
  }

  function requireExplodeSpriteFrameSize(spriteFrame, ownerName) {
    var size = null;
    if (spriteFrame && typeof spriteFrame.getOriginalSize === "function") {
      size = spriteFrame.getOriginalSize();
    } else if (spriteFrame && typeof spriteFrame.getRect === "function") {
      size = spriteFrame.getRect();
    }
    if (
      !size ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      !isFinite(size.width) ||
      !isFinite(size.height) ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      throw new Error(ownerName + " explode animation spriteFrame size is invalid.");
    }
    return size;
  }

  function requireExplodeSpriteFrame(spriteFrame, ownerName, frameIndex) {
    if (!spriteFrame || (typeof spriteFrame.getOriginalSize !== "function" && typeof spriteFrame.getRect !== "function")) {
      throw new Error(ownerName + " explode animation spriteFrame keyframe " + frameIndex + " is invalid.");
    }
    requireExplodeSpriteFrameSize(spriteFrame, ownerName);
    return spriteFrame;
  }

  function requireExplodeSpriteFrameKeyframes(clip, ownerName) {
    if (!clip.curveData || typeof clip.curveData !== "object" || Array.isArray(clip.curveData)) {
      throw new Error(ownerName + " explode animation clip curveData is invalid.");
    }
    if (!clip.curveData.comps || typeof clip.curveData.comps !== "object" || Array.isArray(clip.curveData.comps)) {
      throw new Error(ownerName + " explode animation clip requires cc.Sprite curveData.");
    }
    var spriteCurve = clip.curveData.comps["cc.Sprite"];
    if (!spriteCurve || typeof spriteCurve !== "object" || Array.isArray(spriteCurve)) {
      throw new Error(ownerName + " explode animation clip requires cc.Sprite spriteFrame curve.");
    }
    var sourceFrames = spriteCurve.spriteFrame;
    if (!Array.isArray(sourceFrames) || !sourceFrames.length) {
      throw new Error(ownerName + " explode animation clip spriteFrame keyframes are required.");
    }
    var previousFrameTime = -1;
    return sourceFrames.map(function (entry, index) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(ownerName + " explode animation keyframe " + index + " is invalid.");
      }
      if (typeof entry.frame !== "number" || !isFinite(entry.frame) || entry.frame < 0) {
        throw new Error(ownerName + " explode animation keyframe " + index + " frame is invalid.");
      }
      if (entry.frame < previousFrameTime) {
        throw new Error(ownerName + " explode animation keyframes must be ordered.");
      }
      previousFrameTime = entry.frame;
      return {
        time: entry.frame / clip.speed,
        spriteFrame: requireExplodeSpriteFrame(entry.value, ownerName, index)
      };
    });
  }

  function playExplodeSpriteFrameSequence(fxNode, sprite, clip, ownerName, onFinished) {
    if (typeof cc.tween !== "function") {
      throw new Error(ownerName + " explode animation requires cc.tween.");
    }
    var keyframes = requireExplodeSpriteFrameKeyframes(clip, ownerName);
    var totalDuration = clip.duration / clip.speed;
    var firstSize = requireExplodeSpriteFrameSize(keyframes[0].spriteFrame, ownerName);
    fxNode.setContentSize(firstSize.width, firstSize.height);
    sprite.spriteFrame = keyframes[0].spriteFrame;

    var tween = cc.tween(fxNode);
    var currentTime = 0;
    keyframes.slice(1).forEach(function (keyframe) {
      if (keyframe.time < currentTime) {
        throw new Error(ownerName + " explode animation keyframe time is invalid.");
      }
      var delay = keyframe.time - currentTime;
      if (delay > 0) {
        tween = tween.delay(delay);
      }
      tween = tween.call(function () {
        if (fxNode && fxNode.isValid && sprite && sprite.node && sprite.node.isValid) {
          sprite.spriteFrame = keyframe.spriteFrame;
        }
      });
      currentTime = keyframe.time;
    });
    if (totalDuration < currentTime) {
      throw new Error(ownerName + " explode animation duration is shorter than keyframes.");
    }
    if (totalDuration > currentTime) {
      tween = tween.delay(totalDuration - currentTime);
    }
    tween
      .call(function () {
        if (typeof onFinished === "function") {
          onFinished();
        }
        if (fxNode && fxNode.isValid) {
          fxNode.removeFromParent(true);
        }
      })
      .start();
  }

  function playExplosionAnimationAt(renderer, nodeName, position, ownerName, onFinished) {
    var targetPosition = requireFinitePoint(position, ownerName);
    if (!renderer.layers || !renderer.layers.board || !renderer.layers.board.isValid) {
      throw new Error(ownerName + " requires board layer.");
    }
    if (typeof cc === "undefined" || !cc || typeof cc.Node !== "function") {
      throw new Error(ownerName + " requires cc.Node.");
    }

    var clip = requireExplodeAnimationClip(renderer, ownerName);
    var fxNode = new cc.Node(nodeName);
    fxNode.parent = renderer.layers.board;
    fxNode.setPosition(targetPosition.x, targetPosition.y);
    fxNode.zIndex = 130;
    fxNode.active = true;

    var sprite = fxNode.addComponent(cc.Sprite);
    if (!sprite) {
      throw new Error(ownerName + " requires cc.Sprite.");
    }
    playExplodeSpriteFrameSequence(fxNode, sprite, clip, ownerName, onFinished);
    return fxNode;
  }

  function requireNodePrefabPath(node, ownerName) {
    if (!node || typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error(ownerName + " requires __bubblePrefabPath.");
    }
    return node.__bubblePrefabPath;
  }

  function findUnlockedTargetsForKey(keyCell, unlockedCells) {
    if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
      throw new Error("Key unlock animation requires key id.");
    }
    if (!Array.isArray(unlockedCells)) {
      throw new Error("Key unlock animation requires unlockedCells array.");
    }
    var candidates = unlockedCells.filter(function (cell) {
      return !!(cell && cell.__sourceKeyId === keyCell.id);
    });
    if (candidates.length !== 1) {
      throw new Error("Key unlock animation requires exactly one unlocked target for key: " + keyCell.id);
    }
    return candidates;
  }

  function createKeyUnlockAnimationKey(resolution) {
    var keys = Array.isArray(resolution && resolution.collectedKeys) ? resolution.collectedKeys : [];
    var unlocked = Array.isArray(resolution && resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
    return keys.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col;
    }).join("|") + "->" + unlocked.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col + ":" + cell.__sourceKeyId;
    }).join("|");
  }

  function resolveKeyUnlockTargetNode(renderer, targetCell) {
    if (!targetCell || !targetCell.id) {
      throw new Error("Key unlock animation requires target cell id.");
    }
    var normalizedId = String(targetCell.id);
    var targetNode = renderer.boardBubbleNodes[normalizedId];
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    targetNode = renderer.layers.board.getChildByName("Bubble_" + normalizedId);
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    return null;
  }

  function resolveKeyUnlockMotionProgress(linearProgress) {
    if (typeof linearProgress !== "number" || !isFinite(linearProgress)) {
      throw new Error("Key unlock motion progress must be finite.");
    }
    var strength = 0.72;
    return linearProgress + Math.sin(linearProgress * Math.PI * 2) * strength / (Math.PI * 2);
  }

  function applyKeyUnlockFlyFrame(keyFx, startPosition, targetPosition, linearProgress, arcHeight) {
    if (!keyFx || !keyFx.isValid) {
      throw new Error("Key unlock fly node must remain valid during animation.");
    }
    if (!startPosition || !targetPosition) {
      throw new Error("Key unlock fly animation requires start and target positions.");
    }
    if (typeof arcHeight !== "number" || !isFinite(arcHeight)) {
      throw new Error("Key unlock fly arc height must be finite.");
    }

    var motionProgress = resolveKeyUnlockMotionProgress(linearProgress);
    var arcProgress = Math.sin(motionProgress * Math.PI);
    keyFx.x = startPosition.x + (targetPosition.x - startPosition.x) * motionProgress;
    keyFx.y = startPosition.y + (targetPosition.y - startPosition.y) * motionProgress + arcHeight * arcProgress;
    keyFx.scale = 1 + (0.72 - 1) * motionProgress;
  }

  function createSplitterSpawnEntryKey(cell) {
    if (!cell || !cell.id) {
      throw new Error("Splitter spawn entry key requires cell id.");
    }
    return String(cell.id) + "<-" + String(cell.sourceSplitterId) + "@" + cell.row + ":" + cell.col;
  }

  function resolveSplitterSpawnTargetNode(renderer, spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    var normalizedId = String(spawnedCell.id);
    var targetNode = renderer.boardBubbleNodes[normalizedId];
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    targetNode = renderer.layers.board.getChildByName("Bubble_" + normalizedId);
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    return null;
  }

LevelRenderer.prototype._hideSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.splitterSpawnHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._revealSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn reveal requires cell id.");
  }
  var normalizedId = String(cellId);
  delete this.splitterSpawnHiddenCellIds[normalizedId];
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (!targetNode || !targetNode.isValid) {
    return;
  }
  targetNode.active = true;
  targetNode.opacity = 255;
  targetNode.setScale(1);
  if (typeof cc.tween !== "function") {
    return;
  }
  cc.tween(targetNode)
    .to(0.08, { scale: 1.12 }, { easing: "quadOut" })
    .to(0.1, { scale: 1 }, { easing: "quadIn" })
    .start();
};

LevelRenderer.prototype._applySplitterSpawnHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.splitterSpawnHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._hideMolotovBlastSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.molotovBlastHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._clearMolotovBlastHiddenSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast clear hide requires cell id.");
  }
  delete this.molotovBlastHiddenCellIds[String(cellId)];
};

LevelRenderer.prototype._applyMolotovBlastHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.molotovBlastHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._buildBarrierHammerHintAction = function (hintNode) {
  if (!hintNode || !hintNode.isValid) {
    throw new Error("Barrier hammer hint action requires hint node.");
  }
  if (
    typeof cc.callFunc !== "function" ||
    typeof cc.spawn !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.repeatForever !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateTo !== "function" ||
    typeof cc.delayTime !== "function"
  ) {
    throw new Error("Barrier hammer hint animation requires Cocos action APIs.");
  }

  var liftX = BARRIER_HAMMER_HINT_OFFSET_X;
  var liftY = BARRIER_HAMMER_HINT_OFFSET_Y;
  var strikeX = BARRIER_HAMMER_HINT_OFFSET_X + BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var strikeY = BARRIER_HAMMER_HINT_OFFSET_Y + BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  return cc.repeatForever(cc.sequence(
    cc.callFunc(function () {
      hintNode.setPosition(liftX, liftY);
      hintNode.angle = -26;
      hintNode.opacity = 255;
    }),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, strikeX, strikeY),
      cc.rotateTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, 18)
    ),
    cc.delayTime(BARRIER_HAMMER_HINT_PAUSE_DURATION),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_LIFT_DURATION, liftX, liftY),
      cc.rotateTo(BARRIER_HAMMER_HINT_LIFT_DURATION, -26)
    )
  ));
};

LevelRenderer.prototype._removeBarrierHammerHintNodeByCellId = function (cellId) {
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint removal requires cell id.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
  }
  delete this.barrierHammerHintNodes[cellId];
};

LevelRenderer.prototype._clearBarrierHammerStoneHints = function () {
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    this._removeBarrierHammerHintNodeByCellId(cellId);
  }, this);
};

LevelRenderer.prototype._ensureBarrierHammerHintNode = function (bubbleNode, cellId, spriteFrame) {
  if (!bubbleNode || !bubbleNode.isValid) {
    throw new Error("Barrier hammer hint requires valid bubble node.");
  }
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint requires cell id.");
  }
  if (!spriteFrame) {
    throw new Error("Barrier hammer hint requires sprite frame.");
  }
  if (!BARRIER_HAMMER_HINT_SIZE || typeof BARRIER_HAMMER_HINT_SIZE.width !== "number" || typeof BARRIER_HAMMER_HINT_SIZE.height !== "number") {
    throw new Error("Barrier hammer hint requires valid size.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid && hintNode.parent !== bubbleNode) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
    delete this.barrierHammerHintNodes[cellId];
    hintNode = null;
  }

  if (!hintNode || !hintNode.isValid) {
    hintNode = new cc.Node("BarrierHammerHint");
    this.barrierHammerHintNodes[cellId] = hintNode;
    hintNode.parent = bubbleNode;
    hintNode.zIndex = 120;
    hintNode.setAnchorPoint(0.5, 0.5);
    hintNode.setPosition(BARRIER_HAMMER_HINT_OFFSET_X, BARRIER_HAMMER_HINT_OFFSET_Y);
    hintNode.angle = -26;
    hintNode.opacity = 255;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
    hintNode.runAction(this._buildBarrierHammerHintAction(hintNode));
  } else {
    hintNode.parent = bubbleNode;
    hintNode.active = true;
    hintNode.zIndex = 120;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
  }
};

LevelRenderer.prototype._syncBarrierHammerStoneHints = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    throw new Error("Barrier hammer hints require runtime snapshot.");
  }
  var shooterSnapshot = runtimeSnapshot.shooter;
  if (!shooterSnapshot || typeof shooterSnapshot !== "object") {
    throw new Error("Barrier hammer hints require shooter snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || typeof boardSnapshot !== "object" || !Array.isArray(boardSnapshot.cells)) {
    throw new Error("Barrier hammer hints require board cells.");
  }

  if (!shooterSnapshot.pendingBarrierHammer) {
    this._clearBarrierHammerStoneHints();
    this.lastBarrierHammerHintKey = "inactive";
    return;
  }

  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Barrier hammer hints require board layer.");
  }

  var spritePath = POWERUP_ICON_RESOURCES.barrier_hammer;
  if (typeof spritePath !== "string" || !spritePath) {
    throw new Error("Barrier hammer hint sprite path is missing.");
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded barrier hammer hint sprite: " + spritePath);
  }

  var activeCellIds = {};
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object") {
      throw new Error("Barrier hammer hint requires valid board cell.");
    }
    if (cell.entityType !== "stone") {
      return;
    }
    if (!cell.id) {
      throw new Error("Stone cell requires id for barrier hammer hint.");
    }

    var cellId = String(cell.id);
    var bubbleNode = this.boardBubbleNodes[cellId];
    if (!bubbleNode || !bubbleNode.isValid) {
      throw new Error("Barrier hammer hint target bubble node is missing: " + cellId);
    }
    activeCellIds[cellId] = true;
    this._ensureBarrierHammerHintNode(bubbleNode, cellId, spriteFrame);
  }, this);

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    if (!activeCellIds[cellId]) {
      this._removeBarrierHammerHintNodeByCellId(cellId);
    }
  }, this);

  this.lastBarrierHammerHintKey = [
    "active",
    boardSnapshot.version,
    Object.keys(activeCellIds).sort().join(",")
  ].join("|");
};

LevelRenderer.prototype._playKeyUnlockAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var collectedKeys = resolution && Array.isArray(resolution.collectedKeys) ? resolution.collectedKeys : [];
  var unlockedCells = resolution && Array.isArray(resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
  if (!collectedKeys.length || !unlockedCells.length) {
    return;
  }

  var animationKey = createKeyUnlockAnimationKey(resolution);
  if (!animationKey || animationKey === this.lastKeyUnlockAnimationKey) {
    return;
  }
  this.lastKeyUnlockAnimationKey = animationKey;

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Key unlock animation requires board snapshot.");
  }
  if (typeof cc === "undefined" || !cc || typeof cc.tween !== "function") {
    throw new Error("Key unlock animation requires cc.tween.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Key unlock animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = SpecialAnimationTiming.keyUnlock.flyDuration;
  var keyShrinkDuration = SpecialAnimationTiming.keyUnlock.shrinkDuration;
  var lockShakeStep = SpecialAnimationTiming.keyUnlock.lockShakeStepDuration;
  var lockShakeOffset = 8;

  collectedKeys.forEach(function (keyCell) {
    if (!keyCell) {
      throw new Error("Key unlock animation requires collected key.");
    }
    if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
      throw new Error("Key unlock animation requires collected key id.");
    }

    var targetCells = findUnlockedTargetsForKey(keyCell, unlockedCells);
    var primaryTarget = targetCells[0];
    var keyPosition = BoardLayout.getCellPosition(keyCell.row, keyCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var targetPosition = BoardLayout.getCellPosition(primaryTarget.row, primaryTarget.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var travelDistance = pointDistance(keyPosition, targetPosition);
    var arcHeight = Math.max(64, Math.min(140, travelDistance * 0.28));

    var keyFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.keyBubbleItem, this.layers.board, "KeyUnlockFly_" + keyCell.id, "Key unlock animation KeyBubbleItem");
    keyFx.setPosition(keyPosition.x, keyPosition.y);
    keyFx.setScale(1);
    keyFx.opacity = 255;
    keyFx.zIndex = 120;
    requireVisualChild(keyFx, "Icon", "KeyBubbleItem").active = false;
    requireVisualChild(keyFx, "key", "KeyBubbleItem").active = true;

    var lockFxNodes = targetCells.map(function (targetCell) {
      var targetNode = resolveKeyUnlockTargetNode(this, targetCell);
      if (targetNode) {
        targetNode.opacity = 0;
      }

      var lockPosition = BoardLayout.getCellPosition(targetCell.row, targetCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
      var lockFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.lockingBubbleItem, this.layers.board, "LockUnlockFx_" + targetCell.id, "Key unlock animation LockingBubbleItem");
      lockFx.setPosition(lockPosition.x, lockPosition.y);
      lockFx.setScale(1);
      lockFx.opacity = 255;
      lockFx.zIndex = 110;
      this._applyBoardBubbleVisualCached(lockFx, {
        entityType: "locked",
        lockedColor: targetCell.color
      }, BOARD_BUBBLE_SIZE);
      return {
        targetNode: targetNode,
        lockFx: lockFx,
        lockNode: requireVisualChild(lockFx, "lock", "LockingBubbleItem")
      };
    }, this);

    var cleanup = function () {
      if (keyFx && keyFx.isValid) {
        keyFx.removeFromParent(true);
      }
      lockFxNodes.forEach(function (entry) {
        if (entry.targetNode && entry.targetNode.isValid) {
          entry.targetNode.opacity = 255;
        }
        if (entry.lockFx && entry.lockFx.isValid) {
          entry.lockFx.removeFromParent(true);
        }
      });
    };

    var shakeLocks = function () {
      var remaining = lockFxNodes.length;
      var markDone = function () {
        remaining -= 1;
        if (remaining <= 0) {
          cleanup();
        }
      };

      lockFxNodes.forEach(function (entry) {
        var lockNode = entry.lockNode;
        lockNode.stopAllActions();
        var baseX = lockNode.x;
        var baseY = lockNode.y;
        cc.tween(lockNode)
          .to(lockShakeStep, { x: baseX - lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX - lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX, y: baseY, opacity: 0 })
          .call(markDone)
          .start();
      });
    };

    var flyState = { progress: 0 };
    cc.tween(flyState)
      .to(flyDuration, {
        progress: 1
      }, {
        progress: function (start, end, current, ratio) {
          var linearProgress = start + (end - start) * ratio;
          applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, linearProgress, arcHeight);
          return linearProgress;
        }
      })
      .call(function () {
        applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, 1, arcHeight);
        cc.tween(keyFx)
          .to(keyShrinkDuration, {
            scale: 0.35,
            opacity: 0
          }, {
            easing: "quadIn"
          })
          .call(shakeLocks)
          .start();
      })
      .start();
  }, this);
};

LevelRenderer.prototype._playSplitterSpawnAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var spawnedCells = resolution && Array.isArray(resolution.spawnedBySplitters) ? resolution.spawnedBySplitters : [];
  if (!spawnedCells.length) {
    return;
  }

  if (!this.splitterSpawnAnimatedEntryKeys || typeof this.splitterSpawnAnimatedEntryKeys !== "object") {
    throw new Error("Splitter spawn animated entry keys map is required.");
  }

  var pendingSpawnCells = spawnedCells.filter(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    return !this.splitterSpawnAnimatedEntryKeys[entryKey];
  }, this);
  if (!pendingSpawnCells.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Splitter spawn animation requires board snapshot.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Splitter spawn animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = Math.max(0.2, Number(SPLITTER_SPAWN_FLY_DURATION) || 0.36);
  var bezierArc = Math.max(36, Number(SPLITTER_SPAWN_BEZIER_ARC) || 96);

  pendingSpawnCells.forEach(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    if (typeof spawnedCell.sourceSplitterId !== "string" && typeof spawnedCell.sourceSplitterId !== "number") {
      throw new Error("Splitter spawn animation requires sourceSplitterId.");
    }
    if (!Number.isInteger(spawnedCell.sourceSplitterRow) || !Number.isInteger(spawnedCell.sourceSplitterCol)) {
      throw new Error("Splitter spawn animation requires source splitter coordinates.");
    }
    if (!Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
      throw new Error("Splitter spawn animation requires spawned cell coordinates.");
    }
    if (typeof spawnedCell.color !== "string" || !spawnedCell.color) {
      throw new Error("Splitter spawn animation requires spawned cell color.");
    }

    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    this.splitterSpawnAnimatedEntryKeys[entryKey] = true;

    var targetNode = resolveSplitterSpawnTargetNode(this, spawnedCell);
    if (!targetNode || !targetNode.isValid) {
      throw new Error("Splitter spawn animation target node missing: " + spawnedCell.id);
    }

    this._hideSplitterSpawnTarget(spawnedCell.id);

    var startPosition = BoardLayout.getCellPosition(
      spawnedCell.sourceSplitterRow,
      spawnedCell.sourceSplitterCol,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    var endPosition = BoardLayout.getCellPosition(
      spawnedCell.row,
      spawnedCell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );

    var fxNode = new cc.Node("SplitterSpawnFx_" + spawnedCell.id);
    fxNode.parent = this.layers.board;
    fxNode.zIndex = (targetNode.zIndex || 0) + 2;
    fxNode.setPosition(startPosition.x, startPosition.y);
    fxNode.setScale(0.82);
    fxNode.opacity = 255;
    this._applyBallVisualCached(fxNode, {
      color: spawnedCell.color
    }, BOARD_BUBBLE_SIZE);

    var finishFx = function () {
      if (fxNode && fxNode.isValid) {
        fxNode.removeFromParent(true);
      }
      this._revealSplitterSpawnTarget(spawnedCell.id);
    }.bind(this);

    var startX = startPosition.x;
    var startY = startPosition.y;
    var endX = endPosition.x;
    var endY = endPosition.y;
    var controlY = Math.max(startY, endY) + bezierArc;
    var controlX = (startX + endX) * 0.5;

    fxNode.stopAllActions();
    if (
      fxNode.runAction &&
      typeof cc.bezierTo === "function" &&
      typeof cc.sequence === "function" &&
      typeof cc.callFunc === "function" &&
      typeof cc.v2 === "function"
    ) {
      var bezier = [
        cc.v2(controlX, controlY),
        cc.v2(controlX, controlY),
        cc.v2(endX, endY)
      ];
      fxNode.runAction(cc.sequence(
        cc.bezierTo(flyDuration, bezier),
        cc.callFunc(finishFx)
      ));
      return;
    }

    if (typeof cc.tween !== "function") {
      finishFx();
      return;
    }

    cc.tween(fxNode)
      .to(flyDuration, {
        x: endX,
        y: endY,
        scale: 1
      }, {
        easing: "sineOut"
      })
      .call(finishFx)
      .start();
  }, this);
};

LevelRenderer.prototype._playSwirlRotationAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.swirlRotations)) {
    throw new Error("Swirl animation requires lastResolution.swirlRotations.");
  }
  if (!resolution.swirlRotations.length) {
    return;
  }
  if (!this.swirlRotationAnimatedIds || typeof this.swirlRotationAnimatedIds !== "object") {
    throw new Error("Swirl animated id map is required.");
  }
  if (
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateBy !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("Swirl animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Swirl animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Swirl animation requires finite board viewportOffsetY.");
  }

  resolution.swirlRotations.forEach(function (rotation) {
    if (!rotation || typeof rotation.id !== "string" || !rotation.id) {
      throw new Error("Swirl animation requires rotation id.");
    }
    if (this.swirlRotationAnimatedIds[rotation.id]) {
      return;
    }
    if (rotation.duration !== SpecialAnimationTiming.swirlRotation.duration) {
      throw new Error("Swirl animation duration must match SpecialAnimationTiming.");
    }
    if (rotation.angleDegrees !== 60) {
      throw new Error("Swirl animation angle must be exactly 60 degrees.");
    }
    if (!Array.isArray(rotation.moves) || !rotation.moves.length) {
      throw new Error("Swirl animation requires occupied track moves.");
    }
    this.swirlRotationAnimatedIds[rotation.id] = true;

    rotation.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Swirl animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Swirl animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = BoardLayout.getCellPosition(
        move.fromRow,
        move.fromCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var targetPosition = BoardLayout.getCellPosition(
        move.toRow,
        move.toCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      bubbleNode.stopAllActions();
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.runAction(cc.moveTo(rotation.duration, targetPosition.x, targetPosition.y));
    }, this);

    if (typeof rotation.centerId !== "string" && typeof rotation.centerId !== "number") {
      throw new Error("Swirl animation requires centerId.");
    }
    var centerNode = this.boardBubbleNodes[String(rotation.centerId)];
    if (!centerNode || !centerNode.isValid) {
      throw new Error("Swirl animation center node missing: " + rotation.centerId);
    }
    centerNode.stopAllActions();
    centerNode.angle = 0;
    centerNode.runAction(cc.sequence(
      cc.rotateBy(rotation.duration, -rotation.angleDegrees),
      cc.callFunc(function () {
        if (!centerNode || !centerNode.isValid) {
          throw new Error("Swirl animation center node was destroyed before completion.");
        }
        centerNode.angle = 0;
      })
    ));
  }, this);
};

LevelRenderer.prototype._playWormholeShiftAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.wormholeShifts)) {
    throw new Error("Wormhole animation requires lastResolution.wormholeShifts.");
  }
  if (!resolution.wormholeShifts.length) {
    return;
  }
  if (!this.wormholeShiftAnimatedIds || typeof this.wormholeShiftAnimatedIds !== "object") {
    throw new Error("Wormhole animated id map is required.");
  }
  if (typeof cc.moveTo !== "function") {
    throw new Error("Wormhole animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Wormhole animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Wormhole animation requires finite board viewportOffsetY.");
  }

  resolution.wormholeShifts.forEach(function (shift) {
    if (!shift || typeof shift.id !== "string" || !shift.id) {
      throw new Error("Wormhole animation requires shift id.");
    }
    if (this.wormholeShiftAnimatedIds[shift.id]) {
      return;
    }
    if (shift.duration !== SpecialAnimationTiming.wormholeShift.duration) {
      throw new Error("Wormhole animation duration must match SpecialAnimationTiming.");
    }
    if (shift.moveDirection !== "left" && shift.moveDirection !== "right") {
      throw new Error("Wormhole animation requires left/right moveDirection.");
    }
    if (!Array.isArray(shift.moves)) {
      throw new Error("Wormhole animation requires moves array.");
    }
    this.wormholeShiftAnimatedIds[shift.id] = true;

    shift.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Wormhole animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Wormhole animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = BoardLayout.getCellPosition(
        move.fromRow,
        move.fromCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var targetPosition = BoardLayout.getCellPosition(
        move.toRow,
        move.toCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      bubbleNode.stopAllActions();
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.runAction(cc.moveTo(shift.duration, targetPosition.x, targetPosition.y));
    }, this);

    [shift.leftWormholeId, shift.rightWormholeId].forEach(function (wormholeId) {
      if (typeof wormholeId !== "string" && typeof wormholeId !== "number") {
        throw new Error("Wormhole animation requires endpoint ids.");
      }
      var wormholeNode = this.boardBubbleNodes[String(wormholeId)];
      if (!wormholeNode || !wormholeNode.isValid) {
        throw new Error("Wormhole animation endpoint node missing: " + wormholeId);
      }
      if (wormholeNode.__wormholeShaderActive !== true) {
        throw new Error("Wormhole animation endpoint must keep its flow shader active: " + wormholeId);
      }
    }, this);
  }, this);
};

LevelRenderer.prototype._playMolotovBlastAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var triggered = resolution && Array.isArray(resolution.reactiveTriggered) ? resolution.reactiveTriggered : [];
  var molotovTriggers = triggered.filter(function (entry) {
    return !!(entry && entry.entityType === "molotov");
  });
  if (!molotovTriggers.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Molotov blast animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  molotovTriggers.forEach(function (trigger) {
    if (!trigger || (typeof trigger.id !== "string" && typeof trigger.id !== "number")) {
      throw new Error("Molotov blast animation requires trigger id.");
    }
    if (!Number.isInteger(trigger.row) || !Number.isInteger(trigger.col)) {
      throw new Error("Molotov blast animation requires trigger coordinates.");
    }

    var normalizedId = String(trigger.id);
    var blastPosition = requireFinitePoint(BoardLayout.getCellPosition(
      trigger.row,
      trigger.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    ), "Molotov blast");
    if (this.molotovBlastAnimatedIds[normalizedId]) {
      return;
    }
    this.molotovBlastAnimatedIds[normalizedId] = true;
    this._hideMolotovBlastSource(normalizedId);

    playExplosionAnimationAt(this, "MolotovBlastFx_" + normalizedId, blastPosition, "Molotov blast animation", function () {
      this._clearMolotovBlastHiddenSource(normalizedId);
    }.bind(this));
  }, this);
};

LevelRenderer.prototype._playBlastExplosionAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.blastExplosions)) {
    throw new Error("Blast explosion animation requires lastResolution.blastExplosions.");
  }
  var explosions = resolution.blastExplosions;
  if (!explosions.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Blast explosion animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  explosions.forEach(function (explosion) {
    if (!explosion || (typeof explosion.id !== "string" && typeof explosion.id !== "number")) {
      throw new Error("Blast explosion animation requires explosion id.");
    }
    if (!Number.isInteger(explosion.row) || !Number.isInteger(explosion.col)) {
      throw new Error("Blast explosion animation requires explosion coordinates.");
    }
    if (explosion.entityType !== "blast") {
      throw new Error("Blast explosion animation requires entityType blast.");
    }

    var normalizedId = String(explosion.id);
    if (this.blastExplosionAnimatedIds[normalizedId]) {
      return;
    }
    this.blastExplosionAnimatedIds[normalizedId] = true;

    var explosionPosition = requireFinitePoint(BoardLayout.getCellPosition(
      explosion.row,
      explosion.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    ), "Blast explosion");
    playExplosionAnimationAt(this, "BlastExplosionFx_" + normalizedId, explosionPosition, "Blast explosion animation", null);
  }, this);
};

LevelRenderer.prototype._spawnIceSnowballFlyFxNode = function (nodeName, gameViewX, gameViewY, innerColor) {
  var parentNode = this._getGameViewNode();
  if (!parentNode || !parentNode.isValid) {
    throw new Error("GameView is required for ice snowball fly fx.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fly fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fly fx requires innerColor.");
  }
  if (typeof gameViewX !== "number" || typeof gameViewY !== "number" || !isFinite(gameViewX) || !isFinite(gameViewY)) {
    throw new Error("Ice snowball fly fx requires finite GameView position.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = parentNode;
  fxNode.zIndex = ICE_COLLECT_FLY_Z_INDEX;
  fxNode.setPosition(gameViewX, gameViewY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._spawnIceSnowballFxNode = function (nodeName, baseX, baseY, innerColor, zIndexBase) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Ice snowball fx requires board layer.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fx requires innerColor.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = this.layers.board;
  fxNode.zIndex = typeof zIndexBase === "number" ? zIndexBase : 10;
  fxNode.setPosition(baseX, baseY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._flyIceFxNodeToHudTarget = function (fxNode, startX, startY, options) {
  if (!fxNode) {
    throw new Error("Ice fx fly requires fxNode.");
  }

  var targetBoardPos = options && options.targetBoardPos ? options.targetBoardPos : null;
  var flyDuration = Math.max(0.18, Number(options && options.flyDuration) || Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(options && options.bezierArc) || Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var startDelay = Math.max(0, Number(options && options.startDelay) || 0);
  var onArrive = options && typeof options.onArrive === "function" ? options.onArrive : null;
  var onComplete = options && typeof options.onComplete === "function" ? options.onComplete : null;

  var finishFx = function () {
    if (fxNode && fxNode.isValid && fxNode.parent) {
      fxNode.removeFromParent(true);
    }
    if (onComplete) {
      onComplete();
    }
  };

  if (!targetBoardPos) {
    finishFx();
    return;
  }

  var baseX = startX;
  var baseY = startY;
  var endX = targetBoardPos.x;
  var endY = targetBoardPos.y;
  var controlY = Math.max(baseY, endY) + bezierArc;
  var controlX = (baseX + endX) * 0.5;

  fxNode.stopAllActions();
  if (
    fxNode.runAction &&
    typeof cc.bezierTo === "function" &&
    typeof cc.spawn === "function" &&
    typeof cc.sequence === "function" &&
    typeof cc.callFunc === "function" &&
    typeof cc.delayTime === "function" &&
    typeof cc.scaleTo === "function" &&
    typeof cc.fadeTo === "function" &&
    typeof cc.v2 === "function"
  ) {
    var bezier = [
      cc.v2(controlX, controlY),
      cc.v2(controlX, controlY),
      cc.v2(endX, endY)
    ];
    var flyAction = cc.spawn(
      applyIceCollectFlyEaseAction(cc.bezierTo(flyDuration, bezier)),
      applyIceCollectFlyEaseAction(cc.scaleTo(flyDuration, 0.38)),
      applyIceCollectFlyEaseAction(cc.fadeTo(flyDuration, 120))
    );
    var actionChain = [];
    if (startDelay > 0) {
      actionChain.push(cc.delayTime(startDelay));
    }
    actionChain.push(flyAction);
    actionChain.push(cc.callFunc(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    }));
    fxNode.runAction(cc.sequence.apply(null, actionChain));
    return;
  }

  if (typeof cc.tween !== "function") {
    finishFx();
    return;
  }

  if (typeof ICE_COLLECT_FLY_TWEEN_EASING !== "string" || !ICE_COLLECT_FLY_TWEEN_EASING) {
    throw new Error("Ice collect fly tween easing must be a non-empty string.");
  }

  var collectTween = cc.tween(fxNode);
  if (startDelay > 0) {
    collectTween = collectTween.delay(startDelay);
  }
  if (typeof collectTween.bezierTo === "function") {
    collectTween
      .parallel(
        cc.tween().bezierTo(
          flyDuration,
          cc.v2(controlX, controlY),
          cc.v2(controlX, controlY),
          cc.v2(endX, endY),
          { easing: ICE_COLLECT_FLY_TWEEN_EASING }
        ),
        cc.tween().to(flyDuration, { scale: 0.38 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING }),
        cc.tween().to(flyDuration, { opacity: 120 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING })
      )
      .call(function () {
        if (onArrive) {
          onArrive();
        }
        finishFx();
      })
      .start();
    return;
  }

  collectTween
    .to(flyDuration, {
      x: endX,
      y: endY,
      scale: 0.38,
      opacity: 120
    }, {
      easing: ICE_COLLECT_FLY_TWEEN_EASING
    })
    .call(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    })
    .start();
};

LevelRenderer.prototype._shouldFlyIceSnowballToHud = function (levelConfig) {
  var config = levelConfig || this.currentLevelConfig;
  if (!config) {
    return false;
  }
  return hasIceSnowballCollectionObjective(config);
};

LevelRenderer.prototype._playIceSnowballCollectFly = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return;
  }

  var targetGameViewPos = this._getHudTargetIceBallPositionInGameView();
  if (!targetGameViewPos) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this._refreshIceSnowballHudTarget();
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var maxProcessedEventId = this.lastIceSnowballCollectEventId;
  var flyDuration = Math.max(0.18, Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var boardSnapshot = runtimeSnapshot.board;

  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (!event || event.type !== "ice_snowball_collect") {
      continue;
    }
    if (typeof event.id !== "number" || !isFinite(event.id)) {
      throw new Error("ice_snowball_collect event requires a numeric id.");
    }
    if (event.id <= this.lastIceSnowballCollectEventId) {
      continue;
    }
    if (!Array.isArray(event.entries) || !event.entries.length) {
      continue;
    }

    maxProcessedEventId = Math.max(maxProcessedEventId, event.id);
    event.entries.forEach(function (entry, entryIndex) {
      if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
        throw new Error("Ice snowball collect entry requires id.");
      }
      var position = this._resolveIceSnowballCollectStartPositionInGameView(entry, boardSnapshot);
      var fxNode = this._spawnIceSnowballFlyFxNode(
        "IceCollectFx_" + entry.id + "_" + event.id + "_" + entryIndex,
        position.x,
        position.y,
        entry.innerColor
      );
      this._flyIceFxNodeToHudTarget(fxNode, position.x, position.y, {
        targetBoardPos: targetGameViewPos,
        flyDuration: flyDuration,
        bezierArc: bezierArc,
        startDelay: 0.03,
        onArrive: function () {
          this._incrementDisplayedIceSnowballCollectedTotal();
          this._refreshIceSnowballHudTarget();
        }.bind(this)
      });
    }, this);
  }

  this.lastIceSnowballCollectEventId = maxProcessedEventId;
};

LevelRenderer.prototype._playIceThawShake = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  var thawedCells = resolution && Array.isArray(resolution.thawed) ? resolution.thawed : [];
  if (!impact || !impact.seq || !thawedCells.length || impact.seq === this.lastIceThawShakeSeq) {
    return;
  }

  this.lastIceThawShakeSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var boardSnapshot = runtimeSnapshot.board;
  var offset = Math.max(2, Number(ICE_THAW_SHAKE_OFFSET) || 0);
  var stepDuration = Math.max(0.02, Number(ICE_THAW_SHAKE_STEP_DURATION) || 0.04);

  thawedCells.forEach(function (cell) {
    if (!cell) {
      return;
    }

    var innerColor = typeof cell.color === "string" && cell.color ? cell.color : resolveIceInnerColor(cell);
    if (typeof innerColor !== "string" || !innerColor) {
      throw new Error("Ice thaw animation requires inner color.");
    }

    var bubbleNode = cell.id ? this.layers.board.getChildByName("Bubble_" + cell.id) : null;
    var baseX = null;
    var baseY = null;
    var fxZIndex = 10;

    if (bubbleNode) {
      if (bubbleNode.__iceThawShakeSeq === impact.seq) {
        return;
      }
      bubbleNode.__iceThawShakeSeq = impact.seq;
      baseX = bubbleNode.x;
      baseY = bubbleNode.y;
      fxZIndex = (bubbleNode.zIndex || 0) + 1;
      bubbleNode.stopAllActions();
      bubbleNode.__thawHiddenSeq = impact.seq;
      bubbleNode.opacity = 0;
      bubbleNode.active = false;
    } else {
      if (
        !boardSnapshot ||
        !Number.isInteger(boardSnapshot.maxColumns) ||
        typeof boardSnapshot.viewportOffsetY !== "number" ||
        !isFinite(boardSnapshot.viewportOffsetY) ||
        !Number.isInteger(cell.row) ||
        !Number.isInteger(cell.col)
      ) {
        throw new Error("Ice thaw animation requires board position when bubble node is missing.");
      }
      var cellPosition = BoardLayout.getCellPosition(
        cell.row,
        cell.col,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      baseX = cellPosition.x;
      baseY = cellPosition.y;
    }

    var fxNode = this._spawnIceSnowballFxNode(
      "IceThawFx_" + (cell.id || (cell.row + "_" + cell.col)) + "_" + impact.seq,
      baseX,
      baseY,
      innerColor,
      fxZIndex
    );

    var revealBubble = function () {
      if (!bubbleNode || bubbleNode.__thawHiddenSeq !== impact.seq) {
        return;
      }
      bubbleNode.active = true;
      bubbleNode.opacity = 255;
      bubbleNode.__thawHiddenSeq = -1;
    };

    var finishShakeFx = function () {
      revealBubble();
      if (fxNode && fxNode.isValid && fxNode.parent) {
        fxNode.removeFromParent(true);
      }
    };

    if (typeof cc.tween !== "function") {
      finishShakeFx();
      return;
    }

    cc.tween(fxNode)
      .to(stepDuration, { x: baseX - offset, y: baseY })
      .to(stepDuration, { x: baseX + offset, y: baseY })
      .to(stepDuration, { x: baseX - offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX + offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX, y: baseY })
      .call(finishShakeFx)
      .start();
  }, this);
};

LevelRenderer.prototype._playShotNoDropScreenShake = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var shakeEvent = null;
  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (event && event.type === "shot_no_drop") {
      shakeEvent = event;
    }
  }

  if (!shakeEvent) {
    return;
  }
  if (typeof shakeEvent.id !== "number" || !isFinite(shakeEvent.id)) {
    throw new Error("shot_no_drop event requires a numeric id.");
  }
  if (shakeEvent.id === this.lastNoDropShakeEventId) {
    return;
  }

  this.lastNoDropShakeEventId = shakeEvent.id;
  if (!this.layers) {
    throw new Error("shot_no_drop screen shake requires renderer layers.");
  }

  var offset = Number(SHOT_NO_DROP_SHAKE_OFFSET);
  var stepDuration = Number(SHOT_NO_DROP_SHAKE_STEP_DURATION);
  if (!isFinite(offset) || offset <= 0) {
    throw new Error("shot_no_drop screen shake offset must be positive.");
  }
  if (!isFinite(stepDuration) || stepDuration <= 0) {
    throw new Error("shot_no_drop screen shake step duration must be positive.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("shot_no_drop screen shake requires Cocos actions.");
  }

  var layerNames = [
    "dangerLine",
    "jars",
    "shooter",
    "board",
    "falling",
    "jarOcclusion",
    "testGrid"
  ];
  layerNames.forEach(function (name) {
    var layer = this.layers[name];
    if (!layer || !layer.isValid) {
      throw new Error("shot_no_drop screen shake requires layer: " + name);
    }
    if (typeof layer.runAction !== "function" || typeof layer.stopAllActions !== "function") {
      throw new Error("shot_no_drop screen shake layer must support Cocos actions: " + name);
    }

    var basePosition = layer.__shotNoDropShakeBasePosition;
    if (basePosition) {
      layer.setPosition(basePosition.x, basePosition.y);
    } else {
      basePosition = {
        x: layer.x,
        y: layer.y
      };
    }
    if (
      typeof basePosition.x !== "number" ||
      typeof basePosition.y !== "number" ||
      !isFinite(basePosition.x) ||
      !isFinite(basePosition.y)
    ) {
      throw new Error("shot_no_drop screen shake layer position is invalid: " + name);
    }
    layer.__shotNoDropShakeBasePosition = basePosition;
    layer.stopAllActions();

    layer.runAction(cc.sequence(
      cc.moveTo(stepDuration, basePosition.x - offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x - offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x, basePosition.y),
      cc.callFunc(function () {
        layer.__shotNoDropShakeBasePosition = null;
      })
    ));
  }, this);
};

LevelRenderer.prototype._startBoardClearFireworks = function () {
  if (this.boardClearFireworksActive === true) {
    if (!this.boardClearFireworksRoot || !this.boardClearFireworksRoot.isValid) {
      throw new Error("Board clear fireworks active state requires valid root.");
    }
    return;
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.delayTime !== "function" ||
    typeof cc.repeatForever !== "function"
  ) {
    throw new Error("Board clear fireworks requires Cocos action APIs.");
  }
  requireBoardClearFireworksPrefab(this);
  var rootParent = requireBoardClearFireworksRootParent(this);
  var existingRoot = rootParent.getChildByName("BoardClearFireworksRoot");
  if (existingRoot && existingRoot.isValid) {
    throw new Error("Board clear fireworks root already exists.");
  }

  var intervalSec = Number(BOARD_CLEAR_FIREWORKS_INTERVAL_SEC);
  requirePositiveFiniteNumber(intervalSec, "Board clear fireworks interval");
  var root = new cc.Node("BoardClearFireworksRoot");
  root.parent = rootParent;
  root.setPosition(0, 0);
  root.zIndex = 300;
  root.active = true;
  this.boardClearFireworksRoot = root;
  this.boardClearFireworksActive = true;
  spawnBoardClearFireworksBurst(this);
  root.runAction(cc.repeatForever(cc.sequence(
    cc.delayTime(intervalSec),
    cc.callFunc(function () {
      spawnBoardClearFireworksBurst(this);
    }.bind(this))
  )));
};

LevelRenderer.prototype._stopBoardClearFireworks = function () {
  var root = this.boardClearFireworksRoot;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  if (!root || !root.isValid) {
    return;
  }
  root.stopAllActions();
  root.children.slice().forEach(function (child) {
    stopParticleSystemIfPresent(child);
  });
  root.removeFromParent(false);
  root.destroy();
};

LevelRenderer.prototype._syncBoardClearFireworks = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot.state !== "string") {
    throw new Error("Board clear fireworks requires runtime snapshot state.");
  }
  if (
    runtimeSnapshot.state === "won_pending" ||
    runtimeSnapshot.state === "won_surplus_shots_pending" ||
    runtimeSnapshot.state === "won_settlement_pending"
  ) {
    this._startBoardClearFireworks();
    return;
  }
  this._stopBoardClearFireworks();
};

LevelRenderer.prototype._playImpactBounce = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  if (!impact || !impact.seq || impact.seq === this.lastImpactSeq) {
    return;
  }

  this.lastImpactSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var center = impact.center || { x: 0, y: 0 };
  var pushDistance = Math.max(2, Number(impact.pushDistance) || IMPACT_DEFAULT_PUSH_DISTANCE);
  var bounceSpeed = resolveImpactBounceSpeed(impact);
  var pushDuration = Math.max(IMPACT_MIN_PUSH_DURATION, pushDistance / bounceSpeed);
  var returnDuration = Math.max(IMPACT_MIN_RETURN_DURATION, pushDuration * IMPACT_RETURN_DURATION_RATIO);
  var neighbors = Array.isArray(impact.neighbors) ? impact.neighbors : [];
  var fallingActiveCount = runtimeSnapshot && runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem
    ? Math.max(0, Number(runtimeSnapshot.systems.fallingMarbleSystem.activeDropCount) || 0)
    : 0;
  var neighborBudget = fallingActiveCount >= 36 ? 2 : (fallingActiveCount >= 18 ? 4 : neighbors.length);

  for (var index = 0; index < neighbors.length && index < neighborBudget; index += 1) {
    var neighbor = neighbors[index];
    if (!neighbor || !neighbor.id) {
      continue;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + neighbor.id);
    if (!bubbleNode) {
      continue;
    }

    var baseX = typeof neighbor.x === "number"
      ? neighbor.x
      : (typeof neighbor.position === "object" && typeof neighbor.position.x === "number"
        ? neighbor.position.x
        : bubbleNode.x);
    var baseY = typeof neighbor.y === "number"
      ? neighbor.y
      : (typeof neighbor.position === "object" && typeof neighbor.position.y === "number"
        ? neighbor.position.y
        : bubbleNode.y);
    var dirX = baseX - center.x;
    var dirY = baseY - center.y;
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.0001) {
      dirX = 0;
      dirY = 1;
      len = 1;
    }

    var pushX = baseX + dirX / len * pushDistance;
    var pushY = baseY + dirY / len * pushDistance;

    bubbleNode.stopAllActions();
    bubbleNode.x = baseX;
    bubbleNode.y = baseY;

    if (typeof cc.tween !== "function") {
      bubbleNode.x = baseX;
      bubbleNode.y = baseY;
      continue;
    }

    cc.tween(bubbleNode)
      .to(pushDuration, {
        x: pushX,
        y: pushY
      }, {
        easing: "quadOut"
      })
      .to(returnDuration, {
        x: baseX,
        y: baseY
      }, {
        easing: "quadIn"
      })
      .start();
  }
};
}

module.exports = attachLevelRendererSceneFxMethods;
