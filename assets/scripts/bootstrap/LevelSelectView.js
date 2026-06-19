"use strict";

var BundleLoader = require("../utils/BundleLoader");
var FloatingMap = require("./LevelSelectFloatingMap");

function createOrGetChild(parentNode, name) {
  if (!parentNode || !parentNode.isValid) {
    return null;
  }

  var node = parentNode.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = parentNode;
  }

  return node;
}

function logError(message, detail) {
  if (cc && typeof cc.error === "function") {
    cc.error("[LevelSelectView] " + message, detail || "");
    return;
  }

  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[LevelSelectView] " + message, detail || "");
  }
}

function configureDynamicLabelTextureCache(label, description) {
  if (!label) {
    throw new Error(description + " is required.");
  }
  if (!cc || !cc.Label || !cc.Label.CacheMode || cc.Label.CacheMode.CHAR === undefined) {
    throw new Error(description + " requires cc.Label.CacheMode.CHAR.");
  }
  label.cacheMode = cc.Label.CacheMode.CHAR;
}

function setDynamicLabelString(label, value, description) {
  configureDynamicLabelTextureCache(label, description);
  var nextValue = String(value);
  if (label.string !== nextValue) {
    label.string = nextValue;
  }
}

var LEVEL_BUTTON_SKIN_PATHS = {
  locked: "image/level_lock",
  unlocked: "image/level_lock1"
};
var LEVEL_BUTTON_SIZE = cc.size(120, 120);
var RUN_ANIMATION_RESOURCE_PATH = "animation/run_ani";
var RUN_ANIMATION_NODE_NAME = "run_ani";
var RUN_ANIMATION_POSITION = cc.v2(0, 80);
var RUN_ANIMATION_SCALE = 0.5;
var MAP_SWIPE_MIN_DISTANCE = 90;
var MAP_SWIPE_VERTICAL_TOLERANCE = 0.75;
var MAP_SLIDE_DURATION = 0.28;
var LEVEL_MAP_DECORATION_MAP_INDEX = 0;
var FLOATING_ISLAND_NODE_NAMES = ["fudao1", "fudao2"];
var FLOATING_ISLAND_AMPLITUDE = 18;
var FLOATING_ISLAND_DURATION = 1.35;
var STAR_NODE_NAME = "star";
var STAR_TWINKLE_DIM_OPACITY = 120;
var STAR_TWINKLE_SCALE = 1.18;
var STAR_TWINKLE_DURATION = 0.45;
var QUICK_START_BUTTON_BREATH_SCALE = 1.08;
var QUICK_START_BUTTON_BREATH_UP_DURATION = 0.48;
var QUICK_START_BUTTON_BREATH_DOWN_DURATION = 0.54;
var LEVEL_SELECT_IDLE_ANIMATIONS_ENABLED = false;
var TOP_RESOURCE_ICON_PATHS = {
  stamina: "image/props/love",
  coin: "image/props/coin"
};

var levelButtonSkinFrames = null;
var levelButtonSkinLoadPromise = null;
var runAnimationClip = null;
var runAnimationClipLoadPromise = null;
var topResourceIconFrames = null;
var topResourceIconLoadPromise = null;

function loadSpriteFrame(path) {
  return new Promise(function (resolve) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        logError("Load sprite frame failed: " + path, error && error.message ? error.message : error);
        resolve(null);
        return;
      }

      resolve(spriteFrame || null);
    });
  });
}

function loadRequiredSpriteFrame(path, description) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load " + description + " sprite frame failed: " + error.message));
        return;
      }

      if (!spriteFrame) {
        reject(new Error(description + " sprite frame is missing: " + path));
        return;
      }

      resolve(spriteFrame);
    });
  });
}

function retainSpriteFrame(spriteFrame, description) {
  if (!spriteFrame) {
    throw new Error(description + " sprite frame is required.");
  }
  if (typeof spriteFrame.addRef === "function") {
    spriteFrame.addRef();
  }
  return spriteFrame;
}

function hasValidSpriteFrame(spriteFrame) {
  if (!spriteFrame) {
    return false;
  }
  if (cc && typeof cc.isValid === "function") {
    return cc.isValid(spriteFrame);
  }
  return true;
}

function hasTopResourceIconFrames() {
  return !!(
    topResourceIconFrames &&
    hasValidSpriteFrame(topResourceIconFrames.stamina) &&
    hasValidSpriteFrame(topResourceIconFrames.coin)
  );
}

function ensureTopResourceIconFrames() {
  if (hasTopResourceIconFrames()) {
    return Promise.resolve(topResourceIconFrames);
  }

  if (topResourceIconLoadPromise) {
    return topResourceIconLoadPromise;
  }

  topResourceIconLoadPromise = Promise.all([
    loadRequiredSpriteFrame(TOP_RESOURCE_ICON_PATHS.stamina, "LevelView stamina icon"),
    loadRequiredSpriteFrame(TOP_RESOURCE_ICON_PATHS.coin, "LevelView coin icon")
  ]).then(function (results) {
    topResourceIconFrames = {
      stamina: retainSpriteFrame(results[0], "LevelView stamina icon"),
      coin: retainSpriteFrame(results[1], "LevelView coin icon")
    };
    topResourceIconLoadPromise = null;
    return topResourceIconFrames;
  }, function (error) {
    topResourceIconLoadPromise = null;
    throw error;
  });

  return topResourceIconLoadPromise;
}

function ensureLevelButtonSkinFrames() {
  if (
    levelButtonSkinFrames &&
    levelButtonSkinFrames.locked &&
    levelButtonSkinFrames.unlocked
  ) {
    return Promise.resolve(levelButtonSkinFrames);
  }

  if (levelButtonSkinLoadPromise) {
    return levelButtonSkinLoadPromise;
  }

  levelButtonSkinLoadPromise = Promise.all([
    loadSpriteFrame(LEVEL_BUTTON_SKIN_PATHS.locked),
    loadSpriteFrame(LEVEL_BUTTON_SKIN_PATHS.unlocked)
  ]).then(function (results) {
    levelButtonSkinFrames = {
      locked: results[0],
      passed: levelButtonSkinFrames && levelButtonSkinFrames.passed ? levelButtonSkinFrames.passed : null,
      unlocked: results[1]
    };
    levelButtonSkinLoadPromise = null;
    return levelButtonSkinFrames;
  }).catch(function (error) {
    logError("Load level button skins failed", error && error.message ? error.message : error);
    levelButtonSkinLoadPromise = null;
    return {
      locked: null,
      passed: null,
      unlocked: null
    };
  });

  return levelButtonSkinLoadPromise;
}

function ensureRunAnimationClip() {
  if (runAnimationClip) {
    return Promise.resolve(runAnimationClip);
  }

  if (runAnimationClipLoadPromise) {
    return runAnimationClipLoadPromise;
  }

  runAnimationClipLoadPromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(RUN_ANIMATION_RESOURCE_PATH, cc.AnimationClip, function (error, clip) {
      if (error) {
        reject(new Error("Load run animation clip failed: " + error.message));
        return;
      }

      if (!clip) {
        reject(new Error("Run animation clip is missing: " + RUN_ANIMATION_RESOURCE_PATH));
        return;
      }

      resolve(clip);
    });
  }).then(function (clip) {
    runAnimationClip = clip;
    runAnimationClipLoadPromise = null;
    return runAnimationClip;
  }, function (error) {
    runAnimationClipLoadPromise = null;
    throw error;
  });

  return runAnimationClipLoadPromise;
}

function attachRunAnimationToLevelSlot(slotNode, levelMapRootNode) {
  if (!slotNode || !slotNode.isValid) {
    throw new Error("Run animation target slot is invalid.");
  }
  if (!levelMapRootNode || !levelMapRootNode.isValid) {
    throw new Error("Run animation level map root node is invalid.");
  }
  if (LEVEL_SELECT_IDLE_ANIMATIONS_ENABLED !== true) {
    return Promise.resolve(null);
  }

  return ensureRunAnimationClip().then(function (clip) {
    if (!slotNode || !slotNode.isValid || !levelMapRootNode || !levelMapRootNode.isValid) {
      throw new Error("Run animation target slot was destroyed before attachment.");
    }

    var targetWorldPosition = slotNode.convertToWorldSpaceAR(RUN_ANIMATION_POSITION);
    var targetLocalPosition = levelMapRootNode.convertToNodeSpaceAR(targetWorldPosition);
    var runNode = new cc.Node(RUN_ANIMATION_NODE_NAME);
    runNode.parent = levelMapRootNode;
    runNode.setPosition(targetLocalPosition);
    runNode.setScale(RUN_ANIMATION_SCALE);
    runNode.zIndex = 9999;
    runNode.addComponent(cc.Sprite);

    clip.wrapMode = cc.WrapMode.Loop;
    var animation = runNode.addComponent(cc.Animation);
    animation.addClip(clip, RUN_ANIMATION_NODE_NAME);
    animation.play(RUN_ANIMATION_NODE_NAME);
    return runNode;
  });
}

function resolveLevelButtonSkinKey(isPassed, isUnlocked) {
  if (isPassed) {
    return "passed";
  }
  if (isUnlocked) {
    return "unlocked";
  }
  return "locked";
}

function applyLevelButtonSkin(buttonNode, isPassed, isUnlocked) {
  if (!buttonNode || !buttonNode.isValid) {
    return false;
  }

  var sprite = buttonNode.getComponent(cc.Sprite);
  if (!sprite) {
    return false;
  }
  if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }

  var skinKey = resolveLevelButtonSkinKey(isPassed, isUnlocked);
  if (skinKey === "passed") {
    buttonNode.setContentSize(LEVEL_BUTTON_SIZE);
    return true;
  }
  var skinFrames = levelButtonSkinFrames;
  var skinFrame = skinFrames ? skinFrames[skinKey] : null;
  if (!skinFrame) {
    return false;
  }

  sprite.spriteFrame = skinFrame;
  buttonNode.setContentSize(LEVEL_BUTTON_SIZE);
  return true;
}

function instantiateNode(prefab, tag) {
  if (!prefab) {
    logError("Prefab missing: " + tag);
    return null;
  }

  try {
    return cc.instantiate(prefab);
  } catch (error) {
    logError("Instantiate prefab failed: " + tag, error && error.message ? error.message : error);
    return null;
  }
}

function parseLevelSlotIndex(name) {
  if (typeof name !== "string") {
    return -1;
  }

  var match = /^level(\d+)$/i.exec(name);
  if (!match) {
    return -1;
  }

  return Math.max(0, (Math.floor(Number(match[1]) || 0) - 1));
}

function collectLevelSlots(mapNode) {
  if (!mapNode || !Array.isArray(mapNode.children)) {
    return [];
  }

  var slots = mapNode.children.map(function (child) {
    return {
      node: child,
      index: parseLevelSlotIndex(child && child.name)
    };
  }).filter(function (item) {
    return item.index >= 0;
  });

  slots.sort(function (a, b) {
    return a.index - b.index;
  });

  return slots;
}

function setLevelButtonStars(buttonNode, starCount) {
  var names = ["start1", "start2", "start3"];
  names.forEach(function (name, index) {
    var starNode = buttonNode.getChildByName(name);
    if (!starNode) {
      return;
    }

    starNode.active = index < starCount;
  });
}

function ensureLevelCurrentHighlight(buttonNode, enabled) {
  var highlightNode = buttonNode.getChildByName("CurrentHighlight");
  if (highlightNode) {
    highlightNode.active = false;
  }
}

function applyLevelButtonState(buttonNode, options) {
  options = options || {};
  var isPassed = !!options.isPassed;
  var isUnlocked = !!options.isUnlocked;
  var isCurrent = !!options.isCurrent;
  var starCount = Math.max(0, Math.min(3, Math.floor(Number(options.starCount) || 0)));
  buttonNode.__levelSelectVisualState = {
    isPassed: isPassed,
    isUnlocked: isUnlocked
  };

  var labelNode = buttonNode.getChildByName("level");
  var button = buttonNode.getComponent(cc.Button);
  if (button) {
    button.interactable = true;
    button.enableAutoGrayEffect = false;
  }
  buttonNode.setContentSize(LEVEL_BUTTON_SIZE);

  // Keep node tint neutral and express state only with dedicated background sprites.
  buttonNode.color = cc.color(255, 255, 255);
  if (labelNode) {
    labelNode.active = isUnlocked;
    labelNode.color = cc.color(255, 255, 255);
  }

  var hasSkin = applyLevelButtonSkin(buttonNode, isPassed, isUnlocked);
  if (!hasSkin) {
    ensureLevelButtonSkinFrames().then(function () {
      if (!buttonNode || !buttonNode.isValid) {
        return;
      }
      var latestState = buttonNode.__levelSelectVisualState || {};
      applyLevelButtonSkin(buttonNode, !!latestState.isPassed, !!latestState.isUnlocked);
    });
  }

  setLevelButtonStars(buttonNode, isPassed ? starCount : 0);
  ensureLevelCurrentHighlight(buttonNode, isCurrent);
}

function requireValidLevelMapNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("Level map transition requires valid " + description + ".");
  }
  return node;
}

function updateNodeWidgetAlignment(node, description) {
  requireValidLevelMapNode(node, description);
  var widget = node.getComponent(cc.Widget);
  if (!widget) {
    throw new Error(description + " widget is required before rendering level map.");
  }
  if (widget.enabled !== true) {
    throw new Error(description + " widget must be enabled before rendering level map.");
  }
  if (typeof widget.updateAlignment !== "function") {
    throw new Error(description + " widget requires updateAlignment.");
  }
  widget.updateAlignment();
}

function updateLevelSelectLayoutBeforeMapRender(levelView, mapHostNode) {
  updateNodeWidgetAlignment(levelView, "level view node");
  updateNodeWidgetAlignment(mapHostNode, "map host node");
}

function resolveMapSlideWidth(mapHostNode) {
  requireValidLevelMapNode(mapHostNode, "map host node");
  updateNodeWidgetAlignment(mapHostNode, "map host node");
  var size = mapHostNode.getContentSize();
  if (!size || !(size.width > 0)) {
    throw new Error("Level map host width must be greater than 0.");
  }
  return size.width;
}

function resolveLevelMapPrefab(mapPrefabs, mapIndex) {
  if (!Array.isArray(mapPrefabs) || mapPrefabs.length === 0) {
    throw new Error("Level map prefabs must be configured before switching maps.");
  }

  var prefabIndex = Math.min(mapIndex, mapPrefabs.length - 1);
  var prefab = mapPrefabs[prefabIndex];
  if (!prefab) {
    throw new Error("Level map prefab missing at index " + prefabIndex + ".");
  }
  return prefab;
}

function renderLevelMapNode(mapNode, context, mapIndex, shouldAttachRunAnimation) {
  requireValidLevelMapNode(mapNode, "map node");
  var levelView = requireValidLevelMapNode(context.levelView, "level view node");
  var slots = collectLevelSlots(mapNode);
  if (slots.length === 0) {
    throw new Error("Level map prefab must contain level slots.");
  }

  var runAnimationTargetSlot = null;
  slots.forEach(function (slot) {
    var slotNode = slot.node;
    var levelIndex = mapIndex * context.slotsPerMap + slot.index;
    if (levelIndex < 0 || levelIndex >= context.levelIds.length) {
      slotNode.active = false;
      return;
    }

    slotNode.active = true;
    var levelId = context.levelIds[levelIndex];
    var levelLabelNode = slotNode.getChildByName("level");
    var levelLabel = levelLabelNode ? levelLabelNode.getComponent(cc.Label) : null;
    if (levelLabel) {
      levelLabel.string = String(levelId);
    }

    var starCount = context.getLevelStarCount(levelId);
    var isPassed = context.isLevelCompleted(levelId);
    var isUnlocked = levelId <= context.highestUnlocked;
    var isCurrent = levelId === context.highlightedLevelId;
    if (levelId === context.lastUnlockableLevelId) {
      runAnimationTargetSlot = slotNode;
    }
    applyLevelButtonState(slotNode, {
      isPassed: isPassed,
      isUnlocked: isUnlocked,
      isCurrent: isCurrent,
      starCount: starCount
    });

    if (slotNode.__levelSelectTapBound !== true) {
      slotNode.__levelSelectTapBound = true;
      slotNode.on(cc.Node.EventType.TOUCH_END, function (event) {
        if (event) {
          event.stopPropagation();
        }
        if (levelView.__levelMapSwipeConsumed === true) {
          return;
        }

        if (!slotNode.__levelSelectUnlocked || !Number.isInteger(slotNode.__levelSelectLevelId)) {
          return;
        }

        context.onLevelSelectTap(slotNode.__levelSelectLevelId);
      });
    }

    slotNode.__levelSelectLevelId = levelId;
    slotNode.__levelSelectUnlocked = isUnlocked;
  });

  if (runAnimationTargetSlot && shouldAttachRunAnimation === true) {
    attachRunAnimationToLevelSlot(runAnimationTargetSlot, mapNode);
  }
}

function requireLevelMapDecorationNode(mapNode, nodeName) {
  requireValidLevelMapNode(mapNode, "level map node");
  var node = mapNode.getChildByName(nodeName);
  if (!node || !node.isValid) {
    throw new Error("LevelMap1 decoration node `" + nodeName + "` is missing.");
  }
  return node;
}

function requireTweenForLevelMapDecoration() {
  if (!cc || typeof cc.tween !== "function") {
    throw new Error("LevelMap1 decoration animation requires cc.tween.");
  }
}

function playFloatingIslandAnimation(islandNode, phaseIndex) {
  requireValidLevelMapNode(islandNode, "floating island node");
  if (LEVEL_SELECT_IDLE_ANIMATIONS_ENABLED !== true) {
    islandNode.stopAllActions();
    return;
  }
  requireTweenForLevelMapDecoration();
  if (!Number.isFinite(islandNode.y)) {
    throw new Error("Floating island y must be a valid number.");
  }

  islandNode.stopAllActions();
  var baseY = islandNode.y;
  var topY = baseY + FLOATING_ISLAND_AMPLITUDE;
  var bottomY = baseY - FLOATING_ISLAND_AMPLITUDE;
  var firstY = phaseIndex % 2 === 0 ? topY : bottomY;
  var secondY = phaseIndex % 2 === 0 ? bottomY : topY;
  islandNode.y = baseY;

  cc.tween(islandNode)
    .repeatForever(
      cc.tween()
        .to(FLOATING_ISLAND_DURATION, { y: firstY }, { easing: "sineInOut" })
        .to(FLOATING_ISLAND_DURATION, { y: secondY }, { easing: "sineInOut" })
        .to(FLOATING_ISLAND_DURATION, { y: baseY }, { easing: "sineInOut" })
    )
    .start();
}

function playStarTwinkleAnimation(starNode) {
  requireValidLevelMapNode(starNode, "star node");
  if (LEVEL_SELECT_IDLE_ANIMATIONS_ENABLED !== true) {
    starNode.stopAllActions();
    return;
  }
  requireTweenForLevelMapDecoration();
  if (!Number.isFinite(starNode.opacity) || !Number.isFinite(starNode.scale)) {
    throw new Error("Star opacity and scale must be valid numbers.");
  }

  starNode.stopAllActions();
  var baseOpacity = starNode.opacity;
  var baseScale = starNode.scale;
  starNode.opacity = baseOpacity;
  starNode.scale = baseScale;

  cc.tween(starNode)
    .repeatForever(
      cc.tween()
        .to(STAR_TWINKLE_DURATION, {
          opacity: STAR_TWINKLE_DIM_OPACITY,
          scale: baseScale
        }, { easing: "sineInOut" })
        .to(STAR_TWINKLE_DURATION, {
          opacity: baseOpacity,
          scale: baseScale * STAR_TWINKLE_SCALE
        }, { easing: "sineInOut" })
        .to(STAR_TWINKLE_DURATION, {
          opacity: baseOpacity,
          scale: baseScale
        }, { easing: "sineInOut" })
    )
    .start();
}

function playLevelMapDecorationAnimations(mapNode, mapIndex) {
  if (mapIndex !== LEVEL_MAP_DECORATION_MAP_INDEX) {
    return;
  }

  FLOATING_ISLAND_NODE_NAMES.forEach(function (nodeName, index) {
    playFloatingIslandAnimation(requireLevelMapDecorationNode(mapNode, nodeName), index);
  });
  playStarTwinkleAnimation(requireLevelMapDecorationNode(mapNode, STAR_NODE_NAME));
}

function instantiateLevelMapNode(mapHostNode, context, mapIndex, nodeName, initialX, shouldAttachRunAnimation) {
  if (typeof initialX !== "number") {
    throw new Error("Level map initial x must be a number.");
  }

  var mapPrefab = resolveLevelMapPrefab(context.mapPrefabs, mapIndex);
  var mapNode = instantiateNode(mapPrefab, nodeName);
  if (!mapNode) {
    throw new Error("Instantiate level map failed: " + nodeName + ".");
  }

  disableLevelMapRootWidget(mapNode);
  mapNode.active = false;
  mapNode.parent = mapHostNode;
  mapNode.x = initialX;
  alignLevelMapBottomToHost(mapHostNode, mapNode);
  renderLevelMapNode(mapNode, context, mapIndex, shouldAttachRunAnimation);
  mapNode.active = true;
  playLevelMapDecorationAnimations(mapNode, mapIndex);
  return mapNode;
}

function resolveLevelMapTransitionContext(levelView) {
  requireValidLevelMapNode(levelView, "level view node");
  var context = levelView.__levelMapRenderContext;
  if (!context || typeof context !== "object") {
    throw new Error("Level map render context is missing.");
  }
  return context;
}

function stopMapNodeMotion(node) {
  if (node && node.isValid) {
    node.stopAllActions();
  }
}

function destroyMapNode(node) {
  if (node && node.isValid) {
    node.destroy();
  }
}

function setLevelMapNodeX(node, x) {
  requireValidLevelMapNode(node, "level map node");
  node.x = x;
}

function alignLevelMapBottomToHost(mapHostNode, mapNode) {
  requireValidLevelMapNode(mapHostNode, "map host node");
  requireValidLevelMapNode(mapNode, "level map node");
  updateNodeWidgetAlignment(mapHostNode, "map host node");

  var hostSize = mapHostNode.getContentSize();
  var mapSize = mapNode.getContentSize();
  if (!hostSize || !Number.isFinite(hostSize.height) || hostSize.height <= 0) {
    throw new Error("Level map host height must be greater than 0.");
  }
  if (!mapSize || !Number.isFinite(mapSize.height) || mapSize.height <= 0) {
    throw new Error("Level map height must be greater than 0.");
  }
  if (!Number.isFinite(mapHostNode.anchorY) || !Number.isFinite(mapNode.anchorY)) {
    throw new Error("Level map anchors must be valid numbers.");
  }

  var hostBottomY = -mapHostNode.anchorY * hostSize.height;
  mapNode.y = hostBottomY + mapNode.anchorY * mapSize.height;
}

function disableLevelMapRootWidget(mapNode) {
  requireValidLevelMapNode(mapNode, "level map node");
  var widget = mapNode.getComponent(cc.Widget);
  if (widget) {
    widget.enabled = false;
  }
}

function getCurrentLevelMapNode(levelView) {
  var currentNode = levelView.__levelMapCurrentNode;
  if (currentNode && currentNode.isValid) {
    disableLevelMapRootWidget(currentNode);
    var currentMapHostNode = requireValidLevelMapNode(levelView.getChildByName("map"), "map host node");
    alignLevelMapBottomToHost(currentMapHostNode, currentNode);
    return currentNode;
  }

  var mapHostNode = requireValidLevelMapNode(levelView.getChildByName("map"), "map host node");
  if (mapHostNode.children.length !== 1) {
    throw new Error("Level map host must contain exactly one current map before transition.");
  }
  currentNode = mapHostNode.children[0];
  disableLevelMapRootWidget(currentNode);
  alignLevelMapBottomToHost(mapHostNode, currentNode);
  levelView.__levelMapCurrentNode = currentNode;
  return currentNode;
}

function resolveMapDirection(currentMapIndex, targetMapIndex) {
  if (targetMapIndex > currentMapIndex) {
    return 1;
  }
  if (targetMapIndex < currentMapIndex) {
    return -1;
  }
  throw new Error("Level map target index must differ from current index.");
}

function runLevelMapSlide(levelView, currentNode, targetNode, width, direction, onComplete) {
  requireValidLevelMapNode(levelView, "level view node");
  requireValidLevelMapNode(currentNode, "current map node");
  requireValidLevelMapNode(targetNode, "target map node");
  if (typeof cc.tween !== "function") {
    throw new Error("Level map slide requires cc.tween.");
  }

  levelView.__levelMapTransitionActive = true;
  stopMapNodeMotion(currentNode);
  stopMapNodeMotion(targetNode);

  var completedCount = 0;
  var finishOne = function () {
    completedCount += 1;
    if (completedCount < 2) {
      return;
    }

    levelView.__levelMapTransitionActive = false;
    if (typeof onComplete === "function") {
      onComplete();
    }
  };

  cc.tween(currentNode)
    .to(MAP_SLIDE_DURATION, { x: -direction * width })
    .call(finishOne)
    .start();
  cc.tween(targetNode)
    .to(MAP_SLIDE_DURATION, { x: 0 })
    .call(finishOne)
    .start();
}

function animateLevelMapSwitch(levelView, targetMapIndex) {
  var context = resolveLevelMapTransitionContext(levelView);
  var currentMapIndex = requireLevelMapIntegerProperty(levelView, "__levelSelectCurrentMapIndex");
  var mapCount = requireLevelMapIntegerProperty(levelView, "__levelSelectMapCount");
  if (targetMapIndex < 0 || targetMapIndex >= mapCount) {
    throw new Error("Level map target index out of range: " + targetMapIndex + ".");
  }
  if (targetMapIndex === currentMapIndex) {
    return;
  }
  if (levelView.__levelMapTransitionActive === true) {
    return;
  }

  var mapHostNode = requireValidLevelMapNode(levelView.getChildByName("map"), "map host node");
  var width = resolveMapSlideWidth(mapHostNode);
  var direction = resolveMapDirection(currentMapIndex, targetMapIndex);
  var currentNode = getCurrentLevelMapNode(levelView);
  var targetNode = instantiateLevelMapNode(mapHostNode, context, targetMapIndex, "LevelMapRuntimeNext", direction * width, false);
  setLevelMapNodeX(currentNode, 0);
  runLevelMapSlide(levelView, currentNode, targetNode, width, direction, function () {
    levelView.__levelMapCurrentNode = targetNode;
    levelView.__levelSelectCurrentMapIndex = targetMapIndex;
    updateMapSwitchButtonState(levelView, targetMapIndex, mapCount);
    destroyMapNode(currentNode);
    context.onMapIndexChange(targetMapIndex);
  });
}

function bindMapSwitchButton(buttonNode, levelViewNode, nextIndexResolver) {
  if (!buttonNode || buttonNode.__mapSwitchBound === true) {
    return;
  }

  buttonNode.__mapSwitchBound = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }

    var nextIndex = nextIndexResolver(levelViewNode);
    animateLevelMapSwitch(levelViewNode, nextIndex);
  });
}

function getTouchLocation(event) {
  if (!event || typeof event.getLocation !== "function") {
    return null;
  }

  var location = event.getLocation();
  if (!location || typeof location.x !== "number" || typeof location.y !== "number") {
    return null;
  }
  return location;
}

function requireLevelMapIntegerProperty(levelView, propertyName) {
  requireValidLevelMapNode(levelView, "level view node");
  var value = levelView[propertyName];
  if (!Number.isInteger(value)) {
    throw new Error("Level view property `" + propertyName + "` must be an integer.");
  }
  return value;
}

function resolveSwipeTargetMapIndex(levelView, deltaX) {
  var currentMapIndex = requireLevelMapIntegerProperty(levelView, "__levelSelectCurrentMapIndex");
  var mapCount = requireLevelMapIntegerProperty(levelView, "__levelSelectMapCount");
  if (mapCount <= 1) {
    return currentMapIndex;
  }

  if (deltaX < 0 && currentMapIndex < mapCount - 1) {
    return currentMapIndex + 1;
  }
  if (deltaX > 0 && currentMapIndex > 0) {
    return currentMapIndex - 1;
  }
  return currentMapIndex;
}

function updateMapSwitchButtonState(levelView, currentMapIndex, mapCount) {
  var previousMapNode = levelView.getChildByName("previous_map");
  var nextMapNode = levelView.getChildByName("next_map");
  var hasPrevious = currentMapIndex > 0;
  var hasNext = currentMapIndex < mapCount - 1;

  if (previousMapNode) {
    previousMapNode.active = hasPrevious;
    var previousButton = previousMapNode.getComponent(cc.Button);
    if (previousButton) {
      previousButton.interactable = hasPrevious;
    }
  }

  if (nextMapNode) {
    nextMapNode.active = hasNext;
    var nextButton = nextMapNode.getComponent(cc.Button);
    if (nextButton) {
      nextButton.interactable = hasNext;
    }
  }
}

function clampSwipeDelta(deltaX, direction, width) {
  if (direction > 0) {
    return Math.max(-width, Math.min(0, deltaX));
  }
  if (direction < 0) {
    return Math.max(0, Math.min(width, deltaX));
  }
  throw new Error("Level map swipe direction must not be 0.");
}

function clearLevelMapSwipeDrag(swipeNode, keepCurrentPosition) {
  var drag = swipeNode.__levelMapSwipeDrag;
  swipeNode.__levelMapSwipeDrag = null;
  if (!drag) {
    return;
  }

  if (drag.currentNode && drag.currentNode.isValid && keepCurrentPosition !== true) {
    setLevelMapNodeX(drag.currentNode, 0);
  }
  destroyMapNode(drag.targetNode);
}

function updateLevelMapSwipeDrag(swipeNode, levelView, deltaX) {
  if (levelView.__levelMapTransitionActive === true) {
    return;
  }

  var currentMapIndex = requireLevelMapIntegerProperty(levelView, "__levelSelectCurrentMapIndex");
  var targetMapIndex = resolveSwipeTargetMapIndex(levelView, deltaX);
  if (targetMapIndex === currentMapIndex) {
    clearLevelMapSwipeDrag(swipeNode);
    return;
  }

  var context = resolveLevelMapTransitionContext(levelView);
  var mapHostNode = requireValidLevelMapNode(levelView.getChildByName("map"), "map host node");
  var width = resolveMapSlideWidth(mapHostNode);
  var direction = resolveMapDirection(currentMapIndex, targetMapIndex);
  var drag = swipeNode.__levelMapSwipeDrag;
  if (!drag || drag.targetMapIndex !== targetMapIndex) {
    clearLevelMapSwipeDrag(swipeNode);
    var currentNode = getCurrentLevelMapNode(levelView);
    var targetNode = instantiateLevelMapNode(mapHostNode, context, targetMapIndex, "LevelMapRuntimeSwipe", direction * width, false);
    drag = {
      currentNode: currentNode,
      targetNode: targetNode,
      targetMapIndex: targetMapIndex,
      direction: direction,
      width: width
    };
    swipeNode.__levelMapSwipeDrag = drag;
  }

  var clampedDeltaX = clampSwipeDelta(deltaX, drag.direction, drag.width);
  setLevelMapNodeX(drag.currentNode, clampedDeltaX);
  setLevelMapNodeX(drag.targetNode, clampedDeltaX + drag.direction * drag.width);
}

function runLevelMapSnapBack(levelView, swipeNode, drag) {
  requireValidLevelMapNode(levelView, "level view node");
  requireValidLevelMapNode(drag.currentNode, "current map node");
  requireValidLevelMapNode(drag.targetNode, "target map node");
  if (typeof cc.tween !== "function") {
    throw new Error("Level map snap back requires cc.tween.");
  }

  levelView.__levelMapTransitionActive = true;
  stopMapNodeMotion(drag.currentNode);
  stopMapNodeMotion(drag.targetNode);

  var completedCount = 0;
  var finishOne = function () {
    completedCount += 1;
    if (completedCount < 2) {
      return;
    }

    destroyMapNode(drag.targetNode);
    setLevelMapNodeX(drag.currentNode, 0);
    swipeNode.__levelMapSwipeDrag = null;
    levelView.__levelMapTransitionActive = false;
  };

  cc.tween(drag.currentNode)
    .to(MAP_SLIDE_DURATION, { x: 0 })
    .call(finishOne)
    .start();
  cc.tween(drag.targetNode)
    .to(MAP_SLIDE_DURATION, { x: drag.direction * drag.width })
    .call(finishOne)
    .start();
}

function finishLevelMapSwipeDrag(swipeNode, levelView, shouldSwitch) {
  var drag = swipeNode.__levelMapSwipeDrag;
  if (!drag) {
    return;
  }

  if (shouldSwitch === true) {
    swipeNode.__levelMapSwipeDrag = null;
    runLevelMapSlide(levelView, drag.currentNode, drag.targetNode, drag.width, drag.direction, function () {
      levelView.__levelMapCurrentNode = drag.targetNode;
      levelView.__levelSelectCurrentMapIndex = drag.targetMapIndex;
      var mapCount = requireLevelMapIntegerProperty(levelView, "__levelSelectMapCount");
      updateMapSwitchButtonState(levelView, drag.targetMapIndex, mapCount);
      destroyMapNode(drag.currentNode);
      var context = resolveLevelMapTransitionContext(levelView);
      context.onMapIndexChange(drag.targetMapIndex);
    });
    return;
  }

  runLevelMapSnapBack(levelView, swipeNode, drag);
}

function bindLevelMapSwipe(swipeNode, levelView) {
  if (!swipeNode || !swipeNode.isValid || !levelView || !levelView.isValid) {
    return;
  }

  if (swipeNode.__levelMapSwipeBound === true) {
    return;
  }

  swipeNode.__levelMapSwipeBound = true;
  swipeNode.__levelMapSwipeTracking = false;
  swipeNode.__levelMapSwipeStart = null;
  swipeNode.__levelMapSwipeLast = null;
  levelView.__levelMapSwipeConsumed = false;

  swipeNode.on(cc.Node.EventType.TOUCH_START, function (event) {
    levelView.__levelMapSwipeConsumed = false;
    if (levelView.__levelMapSwipeEnabled !== true || levelView.__levelMapTransitionActive === true) {
      return;
    }

    var location = getTouchLocation(event);
    if (!location) {
      return;
    }

    swipeNode.__levelMapSwipeTracking = true;
    swipeNode.__levelMapSwipeStart = {
      x: location.x,
      y: location.y
    };
    swipeNode.__levelMapSwipeLast = {
      x: location.x,
      y: location.y
    };
    clearLevelMapSwipeDrag(swipeNode);
  }, swipeNode, true);

  swipeNode.on(cc.Node.EventType.TOUCH_MOVE, function (event) {
    if (swipeNode.__levelMapSwipeTracking !== true) {
      return;
    }

    var location = getTouchLocation(event);
    if (!location) {
      return;
    }

    swipeNode.__levelMapSwipeLast = {
      x: location.x,
      y: location.y
    };
    var startLocation = swipeNode.__levelMapSwipeStart;
    if (!startLocation) {
      return;
    }

    updateLevelMapSwipeDrag(swipeNode, levelView, location.x - startLocation.x);
  }, swipeNode, true);

  swipeNode.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    finishLevelMapSwipeDrag(swipeNode, levelView, false);
    swipeNode.__levelMapSwipeTracking = false;
    swipeNode.__levelMapSwipeStart = null;
    swipeNode.__levelMapSwipeLast = null;
  }, swipeNode, true);

  swipeNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (swipeNode.__levelMapSwipeTracking !== true) {
      return;
    }

    var endLocation = getTouchLocation(event) || swipeNode.__levelMapSwipeLast;
    var startLocation = swipeNode.__levelMapSwipeStart;
    swipeNode.__levelMapSwipeTracking = false;
    swipeNode.__levelMapSwipeStart = null;
    swipeNode.__levelMapSwipeLast = null;
    if (!startLocation || !endLocation || levelView.__levelMapSwipeEnabled !== true) {
      finishLevelMapSwipeDrag(swipeNode, levelView, false);
      return;
    }

    var deltaX = endLocation.x - startLocation.x;
    var deltaY = endLocation.y - startLocation.y;
    if (Math.abs(deltaX) < MAP_SWIPE_MIN_DISTANCE) {
      finishLevelMapSwipeDrag(swipeNode, levelView, false);
      return;
    }
    if (Math.abs(deltaY) > Math.abs(deltaX) * MAP_SWIPE_VERTICAL_TOLERANCE) {
      finishLevelMapSwipeDrag(swipeNode, levelView, false);
      return;
    }

    var targetMapIndex = resolveSwipeTargetMapIndex(levelView, deltaX);
    var currentMapIndex = requireLevelMapIntegerProperty(levelView, "__levelSelectCurrentMapIndex");
    if (targetMapIndex === currentMapIndex) {
      finishLevelMapSwipeDrag(swipeNode, levelView, false);
      return;
    }

    levelView.__levelMapSwipeConsumed = true;
    finishLevelMapSwipeDrag(swipeNode, levelView, true);
  }, swipeNode, true);
}

function bindNamedButtonTap(buttonNode, boundFlagName, handlerPropertyName, handler) {
  if (!buttonNode || !buttonNode.isValid) {
    return;
  }

  buttonNode[handlerPropertyName] = handler;
  if (buttonNode[boundFlagName] === true) {
    return;
  }

  buttonNode[boundFlagName] = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }

    var tapHandler = buttonNode[handlerPropertyName];
    if (typeof tapHandler === "function") {
      tapHandler();
    }
  });
}

function resolveTopLayerNode(levelView) {
  if (!levelView || !levelView.isValid) {
    return null;
  }

  var topLayerNode = levelView.getChildByName("top_layer");
  if (topLayerNode && topLayerNode.isValid) {
    return topLayerNode;
  }

  var topSafeAreaNode = levelView.getChildByName("top");
  if (!topSafeAreaNode || !topSafeAreaNode.isValid) {
    return null;
  }

  topLayerNode = topSafeAreaNode.getChildByName("top_layer");
  return topLayerNode && topLayerNode.isValid ? topLayerNode : null;
}

function requireTopWidget(levelView) {
  if (!levelView || !levelView.isValid) {
    throw new Error("LevelView node is required before updating top widget.");
  }
  var topNode = levelView.getChildByName("top");
  if (!topNode || !topNode.isValid) {
    throw new Error("LevelView/top is required before updating top widget.");
  }
  var widget = topNode.getComponent(cc.Widget);
  if (!widget) {
    throw new Error("LevelView/top requires cc.Widget.");
  }
  if (widget.enabled !== true) {
    throw new Error("LevelView/top cc.Widget must be enabled.");
  }
  if (typeof widget.updateAlignment !== "function") {
    throw new Error("LevelView/top cc.Widget requires updateAlignment.");
  }
  return widget;
}

function setTopWidgetTop(levelView, top) {
  var nextTop = Number(top);
  if (!Number.isFinite(nextTop) || nextTop < 0) {
    throw new Error("LevelView/top widget top must be a non-negative finite number.");
  }
  var widget = requireTopWidget(levelView);
  if (!Number.isFinite(levelView.__levelSelectTopWidgetOriginalTop)) {
    levelView.__levelSelectTopWidgetOriginalTop = widget.top;
  }
  widget.top = nextTop;
  widget.updateAlignment();
  return widget.top;
}

function requireNode(parentNode, childName, description) {
  var node = parentNode ? parentNode.getChildByName(childName) : null;
  if (!node || !node.isValid) {
    throw new Error(description + " requires child node `" + childName + "`.");
  }
  return node;
}

function requireSprite(node, description) {
  var sprite = node ? node.getComponent(cc.Sprite) : null;
  if (!sprite) {
    throw new Error(description + " requires cc.Sprite.");
  }
  return sprite;
}

function rebindTopResourceSprites(levelView) {
  if (!levelView || !levelView.isValid) {
    return;
  }
  if (!hasTopResourceIconFrames()) {
    throw new Error("LevelView top resource icon frames must be preloaded before binding.");
  }

  var topLayerNode = resolveTopLayerNode(levelView);
  if (!topLayerNode || !topLayerNode.isValid) {
    throw new Error("LevelView requires top_layer before binding resource icons.");
  }

  var loveInfoNode = requireNode(topLayerNode, "love_info", "LevelView top_layer");
  var loveBgNode = requireNode(loveInfoNode, "love_bg", "LevelView love_info");
  var loveIconNode = requireNode(loveBgNode, "love_icon", "LevelView love_bg");
  var goldInfoNode = requireNode(topLayerNode, "gold_info", "LevelView top_layer");
  var coinIconNode = requireNode(goldInfoNode, "icon", "LevelView gold_info");

  requireSprite(loveIconNode, "LevelView love_icon").spriteFrame = topResourceIconFrames.stamina;
  requireSprite(coinIconNode, "LevelView gold icon").spriteFrame = topResourceIconFrames.coin;
}

function updateTopStatus(levelView, options) {
  if (!levelView || !levelView.isValid) {
    return;
  }

  options = options || {};
  var staminaValue = Math.max(0, Math.floor(Number(options.staminaValue) || 0));
  var coinValue = Math.max(0, Math.floor(Number(options.coinValue) || 0));
  var onOpenSettings = typeof options.onOpenSettings === "function"
    ? options.onOpenSettings
    : function () {};
  var onOpenRanking = typeof options.onOpenRanking === "function"
    ? options.onOpenRanking
    : function () {};
  var onOpenInventory = typeof options.onOpenInventory === "function"
    ? options.onOpenInventory
    : function () {};
  var onOpenStarChest = typeof options.onOpenStarChest === "function"
    ? options.onOpenStarChest
    : function () {};
  var onOpenShop = typeof options.onOpenShop === "function"
    ? options.onOpenShop
    : function () {};
  if (typeof options.onOpenDailyTasks !== "function") {
    throw new Error("LevelSelectView requires onOpenDailyTasks.");
  }
  var onOpenDailyTasks = options.onOpenDailyTasks;

  var topLayerNode = resolveTopLayerNode(levelView);
  rebindTopResourceSprites(levelView);
  var loveNode = topLayerNode ? topLayerNode.getChildByName("love_info") : null;
  var goldNode = topLayerNode ? topLayerNode.getChildByName("gold_info") : null;
  var staminaLabelNode = loveNode ? loveNode.getChildByName("love") : null;
  var coinLabelNode = goldNode ? goldNode.getChildByName("gold") : null;
  var staminaLabel = staminaLabelNode ? staminaLabelNode.getComponent(cc.Label) : null;
  var coinLabel = coinLabelNode ? coinLabelNode.getComponent(cc.Label) : null;

  if (staminaLabel) {
    setDynamicLabelString(staminaLabel, staminaValue, "LevelView stamina label");
  }
  if (coinLabel) {
    setDynamicLabelString(coinLabel, coinValue, "LevelView coin label");
  }

  var bottomLayerNode = levelView.getChildByName("bottom_layer");
  bindNamedButtonTap(
    topLayerNode ? topLayerNode.getChildByName("setting_btn") : null,
    "__settingTapBound",
    "__onOpenSettings",
    onOpenSettings
  );
  bindNamedButtonTap(
    loveNode,
    "__loveShopTapBound",
    "__onOpenShop",
    onOpenShop
  );
  bindNamedButtonTap(
    bottomLayerNode ? bottomLayerNode.getChildByName("ranking_btn") : null,
    "__rankingTapBound",
    "__onOpenRanking",
    onOpenRanking
  );
  bindNamedButtonTap(
    bottomLayerNode ? bottomLayerNode.getChildByName("backpack_btn") : null,
    "__inventoryTapBound",
    "__onOpenInventory",
    onOpenInventory
  );
  bindNamedButtonTap(
    topLayerNode ? topLayerNode.getChildByName("star_box_btn") : null,
    "__starChestTapBound",
    "__onOpenStarChest",
    onOpenStarChest
  );
  bindNamedButtonTap(
    bottomLayerNode ? bottomLayerNode.getChildByName("shop_btn") : null,
    "__shopTapBound",
    "__onOpenShop",
    onOpenShop
  );
  bindNamedButtonTap(
    topLayerNode ? topLayerNode.getChildByName("daily_tasks_btn") : null,
    "__dailyTasksTapBound",
    "__onOpenDailyTasks",
    onOpenDailyTasks
  );
}

function requireBreathActionApi(description) {
  if (
    !cc ||
    typeof cc.repeatForever !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.scaleTo !== "function"
  ) {
    throw new Error(description + " requires Cocos scale action APIs.");
  }
}

function playQuickStartButtonBreath(buttonNode, description) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error(description + " requires quick_start_btn.");
  }
  requireBreathActionApi(description);
  if (buttonNode.__quickStartBreathPlaying === true) {
    return;
  }

  if (!Number.isFinite(buttonNode.__quickStartBreathBaseScaleX)) {
    buttonNode.__quickStartBreathBaseScaleX = buttonNode.scaleX;
  }
  if (!Number.isFinite(buttonNode.__quickStartBreathBaseScaleY)) {
    buttonNode.__quickStartBreathBaseScaleY = buttonNode.scaleY;
  }

  buttonNode.__quickStartBreathPlaying = true;
  buttonNode.stopAllActions();
  buttonNode.scaleX = buttonNode.__quickStartBreathBaseScaleX;
  buttonNode.scaleY = buttonNode.__quickStartBreathBaseScaleY;
  buttonNode.runAction(cc.repeatForever(cc.sequence(
    cc.scaleTo(
      QUICK_START_BUTTON_BREATH_UP_DURATION,
      buttonNode.__quickStartBreathBaseScaleX * QUICK_START_BUTTON_BREATH_SCALE,
      buttonNode.__quickStartBreathBaseScaleY * QUICK_START_BUTTON_BREATH_SCALE
    ),
    cc.scaleTo(
      QUICK_START_BUTTON_BREATH_DOWN_DURATION,
      buttonNode.__quickStartBreathBaseScaleX,
      buttonNode.__quickStartBreathBaseScaleY
    )
  )));
}

function bindQuickStartButton(levelView, onQuickStart) {
  if (typeof onQuickStart !== "function") {
    throw new Error("LevelSelectView requires onQuickStart.");
  }

  var quickStartButtonNode = levelView.getChildByName("quick_start_btn");
  bindNamedButtonTap(
    quickStartButtonNode,
    "__quickStartTapBound",
    "__onQuickStart",
    onQuickStart
  );
  playQuickStartButtonBreath(quickStartButtonNode, "LevelSelectView quick start button breath");
}

function bindBackToCurrentLevelButton(levelView, onBackToCurrentLevel) {
  if (typeof onBackToCurrentLevel !== "function") {
    throw new Error("LevelSelectView requires onBackToCurrentLevel.");
  }

  bindNamedButtonTap(
    levelView.getChildByName("back_cur_level"),
    "__backToCurrentLevelTapBound",
    "__onBackToCurrentLevel",
    onBackToCurrentLevel
  );
}

function scrollFloatingMapToLevel(levelView, levelId, options) {
  if (!levelView || !levelView.isValid) {
    throw new Error("LevelSelectView requires a valid level view node.");
  }
  var mapHostNode = levelView.getChildByName("map");
  if (!mapHostNode || !mapHostNode.isValid) {
    throw new Error("LevelSelectView/map is required before scrolling.");
  }
  FloatingMap.scrollToLevel(mapHostNode, levelId, options || {});
}

function renderLevelSelectContent(options) {
  var hostNode = options.hostNode;
  var levelViewPrefab = options.levelViewPrefab;
  var floatingMapAssets = options.floatingMapAssets;
  var highestUnlocked = Math.max(1, Number(options.highestUnlocked) || 1);
  var highlightedLevelId = Math.max(1, Number(options.highlightedLevelId) || 1);
  var getLevelStarCount = typeof options.getLevelStarCount === "function"
    ? options.getLevelStarCount
    : function () { return 0; };
  var isLevelCompleted = typeof options.isLevelCompleted === "function"
    ? options.isLevelCompleted
    : function () { return false; };
  var onLevelSelectTap = typeof options.onLevelSelectTap === "function"
    ? options.onLevelSelectTap
    : function () {};
  var staminaValue = Math.max(0, Math.floor(Number(options.staminaValue) || 0));
  var coinValue = Math.max(0, Math.floor(Number(options.coinValue) || 0));
  var onOpenSettings = typeof options.onOpenSettings === "function"
    ? options.onOpenSettings
    : function () {};
  var onOpenRanking = typeof options.onOpenRanking === "function"
    ? options.onOpenRanking
    : function () {};
  var onOpenInventory = typeof options.onOpenInventory === "function"
    ? options.onOpenInventory
    : function () {};
  var onOpenStarChest = typeof options.onOpenStarChest === "function"
    ? options.onOpenStarChest
    : function () {};
  var onOpenShop = typeof options.onOpenShop === "function"
    ? options.onOpenShop
    : function () {};
  if (typeof options.onOpenDailyTasks !== "function") {
    throw new Error("LevelSelectView requires onOpenDailyTasks.");
  }
  var onOpenDailyTasks = options.onOpenDailyTasks;
  if (typeof options.onQuickStart !== "function") {
    throw new Error("LevelSelectView requires onQuickStart.");
  }
  var onQuickStart = options.onQuickStart;
  if (typeof options.onBackToCurrentLevel !== "function") {
    throw new Error("LevelSelectView requires onBackToCurrentLevel.");
  }
  var onBackToCurrentLevel = options.onBackToCurrentLevel;

  if (!hostNode || !hostNode.isValid) {
    logError("Invalid host node when rendering level select.");
    return {
      levelViewNode: null,
      currentMapIndex: 0,
      mapCount: 0
    };
  }

  var levelView = options.existingLevelSelectNode;
  if (!levelView || !levelView.isValid) {
    levelView = instantiateNode(levelViewPrefab, "LevelView");
    if (!levelView) {
      levelView = createOrGetChild(hostNode, "LevelViewFallback");
    }
    if (!levelView) {
      return {
        levelViewNode: null,
        currentMapIndex: 0,
        mapCount: 0
      };
    }
    levelView.parent = hostNode;
    levelView.zIndex = 160;
    levelView.setPosition(0, 0);
    if (!levelView.getComponent(cc.BlockInputEvents)) {
      levelView.addComponent(cc.BlockInputEvents);
    }
  }

  levelView.active = true;
  levelView.__levelMapSwipeEnabled = options.levelSelectRouteEditorMode !== true;
  updateTopStatus(levelView, {
    staminaValue: staminaValue,
    coinValue: coinValue,
    onOpenSettings: onOpenSettings,
    onOpenRanking: onOpenRanking,
    onOpenInventory: onOpenInventory,
    onOpenStarChest: onOpenStarChest,
    onOpenShop: onOpenShop,
    onOpenDailyTasks: onOpenDailyTasks
  });
  bindQuickStartButton(levelView, onQuickStart);
  var backToCurrentLevelButtonNode = levelView.getChildByName("back_cur_level");
  if (!backToCurrentLevelButtonNode || !backToCurrentLevelButtonNode.isValid) {
    throw new Error("LevelView/back_cur_level is required.");
  }
  bindBackToCurrentLevelButton(levelView, onBackToCurrentLevel);

  var mapHostNode = levelView.getChildByName("map");
  if (!mapHostNode) {
    mapHostNode = createOrGetChild(levelView, "map");
  }
  if (!mapHostNode) {
    return {
      levelViewNode: levelView,
      currentMapIndex: 0,
      mapCount: 0
    };
  }
  updateLevelSelectLayoutBeforeMapRender(levelView, mapHostNode);

  if (!floatingMapAssets || typeof floatingMapAssets !== "object") {
    throw new Error("LevelSelectView requires preloaded floating map assets.");
  }
  var floatingMapResult = FloatingMap.render({
    mapHostNode: mapHostNode,
    assets: floatingMapAssets,
    highestUnlocked: highestUnlocked,
    focusLevelId: highlightedLevelId,
    backToCurrentLevelButtonNode: backToCurrentLevelButtonNode,
    getLevelStarCount: getLevelStarCount,
    isLevelCompleted: isLevelCompleted,
    onLevelSelectTap: onLevelSelectTap
  });
  levelView.__levelMapCurrentNode = null;
  levelView.__levelSelectCurrentMapIndex = floatingMapResult.currentNodeIndex;
  levelView.__levelSelectMapCount = floatingMapResult.nodeCount;
  levelView.__levelMapTransitionActive = false;
  levelView.__levelMapSwipeConsumed = false;

  var nextMapNode = levelView.getChildByName("next_map");
  var previousMapNode = levelView.getChildByName("previous_map");
  if (previousMapNode) {
    previousMapNode.active = false;
  }
  if (nextMapNode) {
    nextMapNode.active = false;
  }

  return {
    levelViewNode: levelView,
    currentMapIndex: floatingMapResult.currentNodeIndex,
    mapCount: floatingMapResult.nodeCount
  };
}

module.exports = {
  ensureTopResourceIconFrames: ensureTopResourceIconFrames,
  rebindTopResourceSprites: rebindTopResourceSprites,
  loadFloatingMapAssets: FloatingMap.loadAssets,
  renderLevelSelectContent: renderLevelSelectContent,
  setTopWidgetTop: setTopWidgetTop,
  scrollFloatingMapToLevel: scrollFloatingMapToLevel
};
