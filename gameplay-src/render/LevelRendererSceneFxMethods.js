"use strict";

var attachLevelRendererSceneBarrierFxMethods = require("./LevelRendererSceneBarrierFxMethods");
var attachLevelRendererSceneKeySplitterFxMethods = require("./LevelRendererSceneKeySplitterFxMethods");
var attachLevelRendererSceneBoardTransformFxMethods = require("./LevelRendererSceneBoardTransformFxMethods");
var attachLevelRendererSceneExplosionIceFxMethods = require("./LevelRendererSceneExplosionIceFxMethods");
var attachLevelRendererSceneScreenFxMethods = require("./LevelRendererSceneScreenFxMethods");
var attachLevelRendererSceneSpiritCocoonFxMethods = require("./LevelRendererSceneSpiritCocoonFxMethods");
var attachLevelRendererSceneBudFxMethods = require("./LevelRendererSceneBudFxMethods");
var attachLevelRendererSceneSpiderFxMethods = require("./LevelRendererSceneSpiderFxMethods");

function attachLevelRendererSceneFxMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var SpecialAnimationTiming = deps.SpecialAnimationTiming;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var WORMHOLE_DIRECTION_ARROW_RESOURCE = deps.WORMHOLE_DIRECTION_ARROW_RESOURCE;
  var WORMHOLE_DIRECTION_ARROW_SIZE = deps.WORMHOLE_DIRECTION_ARROW_SIZE;
  var WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE = deps.WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE;
  var WORMHOLE_DIRECTION_ARROW_STAGGER = deps.WORMHOLE_DIRECTION_ARROW_STAGGER;
  var WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION = deps.WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION;
  var WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION = deps.WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION;
  var WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE = deps.WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE;
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

  function resolveBoardCellWorldPosition(runtimeSnapshot, row, col, ownerName) {
    if (!runtimeSnapshot || !runtimeSnapshot.board) {
      throw new Error(ownerName + " requires runtime board snapshot.");
    }
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error(ownerName + " requires integer board coordinates.");
    }
    var boardSnapshot = runtimeSnapshot.board;
    if (!Number.isInteger(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
      throw new Error(ownerName + " requires positive board maxColumns.");
    }
    if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
      throw new Error(ownerName + " requires finite board viewportOffsetY.");
    }

    var rescueSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.trappedSpriteRescueSystem;
    var rescueActive = !!(rescueSnapshot && rescueSnapshot.active === true);
    if (boardSnapshot.trappedSpriteRescueActive === true && !rescueActive) {
      throw new Error(ownerName + " rescue board requires trapped sprite system snapshot.");
    }
    if (!rescueActive) {
      return requireFinitePoint(BoardLayout.getCellPosition(
        row,
        col,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      ), ownerName);
    }
    if (
      !rescueSnapshot.anchorCell ||
      !Number.isInteger(rescueSnapshot.anchorCell.row) ||
      !Number.isInteger(rescueSnapshot.anchorCell.col)
    ) {
      throw new Error(ownerName + " rescue transform requires anchorCell.");
    }
    var worldCenter = requireFinitePoint(rescueSnapshot.worldCenter, ownerName + " rescue center");
    if (typeof rescueSnapshot.angleRad !== "number" || !isFinite(rescueSnapshot.angleRad)) {
      throw new Error(ownerName + " rescue transform requires finite angleRad.");
    }
    var anchorLocal = BoardLayout.getCellPosition(
      rescueSnapshot.anchorCell.row,
      rescueSnapshot.anchorCell.col,
      boardSnapshot.maxColumns,
      0
    );
    var cellLocal = BoardLayout.getCellPosition(row, col, boardSnapshot.maxColumns, 0);
    var localX = cellLocal.x - anchorLocal.x;
    var localY = cellLocal.y - anchorLocal.y;
    var cosine = Math.cos(rescueSnapshot.angleRad);
    var sine = Math.sin(rescueSnapshot.angleRad);
    return requireFinitePoint({
      x: worldCenter.x + localX * cosine - localY * sine,
      y: worldCenter.y + localX * sine + localY * cosine
    }, ownerName);
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
    if (candidates.length < 1) {
      throw new Error("Key unlock animation requires at least one unlocked target for key: " + keyCell.id);
    }
    return candidates.sort(function (left, right) {
      var leftDistance = Math.abs(left.col - keyCell.col);
      var rightDistance = Math.abs(right.col - keyCell.col);
      return leftDistance - rightDistance || left.col - right.col || String(left.id).localeCompare(String(right.id));
    });
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

  function createBreederSpawnEntryKey(entry) {
    if (!entry || !entry.id) {
      throw new Error("Breeder spawn entry key requires event id.");
    }
    return String(entry.id) + "<-" + String(entry.breederId) + "@" + entry.row + ":" + entry.col;
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

  function resolveBreederSpawnTargetNode(renderer, entry) {
    if (!entry || (typeof entry.cellId !== "string" && typeof entry.cellId !== "number")) {
      throw new Error("Breeder spawn animation requires target cell id.");
    }
    var normalizedId = String(entry.cellId);
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

  var FX_METHOD_CONTEXT = {
    BARRIER_HAMMER_HINT_LIFT_DURATION: BARRIER_HAMMER_HINT_LIFT_DURATION,
    BARRIER_HAMMER_HINT_OFFSET_X: BARRIER_HAMMER_HINT_OFFSET_X,
    BARRIER_HAMMER_HINT_OFFSET_Y: BARRIER_HAMMER_HINT_OFFSET_Y,
    BARRIER_HAMMER_HINT_PAUSE_DURATION: BARRIER_HAMMER_HINT_PAUSE_DURATION,
    BARRIER_HAMMER_HINT_SIZE: BARRIER_HAMMER_HINT_SIZE,
    BARRIER_HAMMER_HINT_STRIKE_DURATION: BARRIER_HAMMER_HINT_STRIKE_DURATION,
    BARRIER_HAMMER_HINT_TAP_OFFSET_X: BARRIER_HAMMER_HINT_TAP_OFFSET_X,
    BARRIER_HAMMER_HINT_TAP_OFFSET_Y: BARRIER_HAMMER_HINT_TAP_OFFSET_Y,
    BOARD_BUBBLE_SIZE: BOARD_BUBBLE_SIZE,
    BALL_RESOURCES: BALL_RESOURCES,
    BOARD_CLEAR_FIREWORKS_INTERVAL_SEC: BOARD_CLEAR_FIREWORKS_INTERVAL_SEC,
    BoardLayout: BoardLayout,
    ICE_COLLECT_BEZIER_ARC: ICE_COLLECT_BEZIER_ARC,
    ICE_COLLECT_FLY_DURATION: ICE_COLLECT_FLY_DURATION,
    ICE_COLLECT_FLY_TWEEN_EASING: ICE_COLLECT_FLY_TWEEN_EASING,
    ICE_COLLECT_FLY_Z_INDEX: ICE_COLLECT_FLY_Z_INDEX,
    ICE_THAW_SHAKE_OFFSET: ICE_THAW_SHAKE_OFFSET,
    ICE_THAW_SHAKE_STEP_DURATION: ICE_THAW_SHAKE_STEP_DURATION,
    IMPACT_DEFAULT_PUSH_DISTANCE: IMPACT_DEFAULT_PUSH_DISTANCE,
    IMPACT_MIN_PUSH_DURATION: IMPACT_MIN_PUSH_DURATION,
    IMPACT_MIN_RETURN_DURATION: IMPACT_MIN_RETURN_DURATION,
    IMPACT_RETURN_DURATION_RATIO: IMPACT_RETURN_DURATION_RATIO,
    POWERUP_ICON_RESOURCES: POWERUP_ICON_RESOURCES,
    PREFAB_PATHS: PREFAB_PATHS,
    SHOT_NO_DROP_SHAKE_OFFSET: SHOT_NO_DROP_SHAKE_OFFSET,
    SHOT_NO_DROP_SHAKE_STEP_DURATION: SHOT_NO_DROP_SHAKE_STEP_DURATION,
    SPLITTER_SPAWN_BEZIER_ARC: SPLITTER_SPAWN_BEZIER_ARC,
    SPLITTER_SPAWN_FLY_DURATION: SPLITTER_SPAWN_FLY_DURATION,
    SpecialAnimationTiming: SpecialAnimationTiming,
    WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE: WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE,
    WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION,
    WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION,
    WORMHOLE_DIRECTION_ARROW_RESOURCE: WORMHOLE_DIRECTION_ARROW_RESOURCE,
    WORMHOLE_DIRECTION_ARROW_SIZE: WORMHOLE_DIRECTION_ARROW_SIZE,
    WORMHOLE_DIRECTION_ARROW_STAGGER: WORMHOLE_DIRECTION_ARROW_STAGGER,
    WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE: WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE,
    applyIceCollectFlyEaseAction: applyIceCollectFlyEaseAction,
    applyKeyUnlockFlyFrame: applyKeyUnlockFlyFrame,
    attachLevelRendererSceneBarrierFxMethods: attachLevelRendererSceneBarrierFxMethods,
    attachLevelRendererSceneBoardTransformFxMethods: attachLevelRendererSceneBoardTransformFxMethods,
    attachLevelRendererSceneExplosionIceFxMethods: attachLevelRendererSceneExplosionIceFxMethods,
    attachLevelRendererSceneKeySplitterFxMethods: attachLevelRendererSceneKeySplitterFxMethods,
    attachLevelRendererSceneScreenFxMethods: attachLevelRendererSceneScreenFxMethods,
    attachLevelRendererSceneSpiritCocoonFxMethods: attachLevelRendererSceneSpiritCocoonFxMethods,
    attachLevelRendererSceneBudFxMethods: attachLevelRendererSceneBudFxMethods,
    createKeyUnlockAnimationKey: createKeyUnlockAnimationKey,
    createBreederSpawnEntryKey: createBreederSpawnEntryKey,
    createSplitterSpawnEntryKey: createSplitterSpawnEntryKey,
    ensureSprite: ensureSprite,
    getOrCreateChild: getOrCreateChild,
    findUnlockedTargetsForKey: findUnlockedTargetsForKey,
    hasIceSnowballCollectionObjective: hasIceSnowballCollectionObjective,
    instantiateRequired: instantiateRequired,
    playExplosionAnimationAt: playExplosionAnimationAt,
    pointDistance: pointDistance,
    requireBoardClearFireworksPrefab: requireBoardClearFireworksPrefab,
    requireBoardClearFireworksRootParent: requireBoardClearFireworksRootParent,
    requireFinitePoint: requireFinitePoint,
    requirePositiveFiniteNumber: requirePositiveFiniteNumber,
    requireVisualChild: requireVisualChild,
    resolveBoardCellWorldPosition: resolveBoardCellWorldPosition,
    resolveIceInnerColor: resolveIceInnerColor,
    resolveImpactBounceSpeed: resolveImpactBounceSpeed,
    resolveKeyUnlockTargetNode: resolveKeyUnlockTargetNode,
    resolveBreederSpawnTargetNode: resolveBreederSpawnTargetNode,
    resolveSplitterSpawnTargetNode: resolveSplitterSpawnTargetNode,
    spawnBoardClearFireworksBurst: spawnBoardClearFireworksBurst,
    stopParticleSystemIfPresent: stopParticleSystemIfPresent
  };
  attachLevelRendererSceneBarrierFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneKeySplitterFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneBoardTransformFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneExplosionIceFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneScreenFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneSpiritCocoonFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneBudFxMethods(LevelRenderer, FX_METHOD_CONTEXT);
  attachLevelRendererSceneSpiderFxMethods(LevelRenderer, FX_METHOD_CONTEXT);

}

module.exports = attachLevelRendererSceneFxMethods;
