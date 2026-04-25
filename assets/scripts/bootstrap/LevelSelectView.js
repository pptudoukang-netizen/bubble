"use strict";

var BundleLoader = require("../utils/BundleLoader");

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

var LEVEL_BUTTON_SKIN_PATHS = {
  locked: "image/level_lock",
  unlocked: "image/level_lock1"
};
var LEVEL_BUTTON_SIZE = cc.size(120, 120);

var levelButtonSkinFrames = null;
var levelButtonSkinLoadPromise = null;

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
    button.interactable = isUnlocked;
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

function bindMapSwitchButton(buttonNode, levelViewNode, nextIndexResolver, onMapIndexChange) {
  if (!buttonNode || buttonNode.__mapSwitchBound === true) {
    return;
  }

  buttonNode.__mapSwitchBound = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }

    var nextIndex = nextIndexResolver(levelViewNode);
    onMapIndexChange(nextIndex);
  });
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

  var topLayerNode = levelView.getChildByName("top_layer");
  var loveNode = topLayerNode ? topLayerNode.getChildByName("love_info") : null;
  var goldNode = topLayerNode ? topLayerNode.getChildByName("gold_info") : null;
  var staminaLabelNode = loveNode ? loveNode.getChildByName("love") : null;
  var coinLabelNode = goldNode ? goldNode.getChildByName("gold") : null;
  var staminaLabel = staminaLabelNode ? staminaLabelNode.getComponent(cc.Label) : null;
  var coinLabel = coinLabelNode ? coinLabelNode.getComponent(cc.Label) : null;

  if (staminaLabel) {
    staminaLabel.string = String(staminaValue);
  }
  if (coinLabel) {
    coinLabel.string = String(coinValue);
  }

  var bottomLayerNode = levelView.getChildByName("bottom_layer");
  bindNamedButtonTap(
    topLayerNode ? topLayerNode.getChildByName("setting_btn") : null,
    "__settingTapBound",
    "__onOpenSettings",
    onOpenSettings
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
    bottomLayerNode ? bottomLayerNode.getChildByName("star_box_btn") : null,
    "__starChestTapBound",
    "__onOpenStarChest",
    onOpenStarChest
  );
}

function renderLevelSelectContent(options) {
  var hostNode = options.hostNode;
  var levelViewPrefab = options.levelViewPrefab;
  var mapPrefabs = Array.isArray(options.mapPrefabs) ? options.mapPrefabs.filter(Boolean) : [];
  var levelIds = Array.isArray(options.levelIds) ? options.levelIds : [];
  var highestUnlocked = Math.max(1, Number(options.highestUnlocked) || 1);
  var highlightedLevelId = Math.max(1, Number(options.highlightedLevelId) || 1);
  var requestedMapIndex = Number.isInteger(options.currentMapIndex) ? options.currentMapIndex : null;
  var getLevelStarCount = typeof options.getLevelStarCount === "function"
    ? options.getLevelStarCount
    : function () { return 0; };
  var isLevelCompleted = typeof options.isLevelCompleted === "function"
    ? options.isLevelCompleted
    : function () { return false; };
  var onLevelSelectTap = typeof options.onLevelSelectTap === "function"
    ? options.onLevelSelectTap
    : function () {};
  var onMapIndexChange = typeof options.onMapIndexChange === "function"
    ? options.onMapIndexChange
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
  updateTopStatus(levelView, {
    staminaValue: staminaValue,
    coinValue: coinValue,
    onOpenSettings: onOpenSettings,
    onOpenRanking: onOpenRanking,
    onOpenInventory: onOpenInventory,
    onOpenStarChest: onOpenStarChest
  });

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
  mapHostNode.removeAllChildren();

  var baseMapPrefab = mapPrefabs.length > 0 ? mapPrefabs[0] : null;
  if (!baseMapPrefab) {
    return {
      levelViewNode: levelView,
      currentMapIndex: 0,
      mapCount: 0
    };
  }

  var slotsPerMap = 10;
  var previewMapNode = instantiateNode(baseMapPrefab, "LevelMapPreview");
  var previewSlots = collectLevelSlots(previewMapNode);
  if (previewSlots.length > 0) {
    slotsPerMap = previewSlots.length;
  }
  if (previewMapNode && previewMapNode.isValid) {
    previewMapNode.destroy();
  }

  var levelPageCount = Math.max(1, Math.ceil(levelIds.length / slotsPerMap));
  var mapCount = Math.max(1, mapPrefabs.length, levelPageCount);
  var highlightedLevelIndex = Math.max(0, levelIds.indexOf(highlightedLevelId));
  var highlightedMapIndex = Math.floor(highlightedLevelIndex / slotsPerMap);
  var currentMapIndex = requestedMapIndex === null ? highlightedMapIndex : requestedMapIndex;
  currentMapIndex = Math.max(0, Math.min(mapCount - 1, currentMapIndex));

  var mapPrefab = mapPrefabs[Math.min(currentMapIndex, mapPrefabs.length - 1)] || baseMapPrefab;
  var mapNode = instantiateNode(mapPrefab, "LevelMapRuntime");
  if (!mapNode) {
    return {
      levelViewNode: levelView,
      currentMapIndex: currentMapIndex,
      mapCount: 0
    };
  }
  mapNode.parent = mapHostNode;
  mapNode.setPosition(0, 0);
  mapNode.active = true;
  ensureLevelButtonSkinFrames();

  var slots = collectLevelSlots(mapNode);
  slots.forEach(function (slot) {
    var slotNode = slot.node;
    var levelIndex = currentMapIndex * slotsPerMap + slot.index;
    if (levelIndex < 0 || levelIndex >= levelIds.length) {
      slotNode.active = false;
      return;
    }

    slotNode.active = true;
    var levelId = levelIds[levelIndex];
    var levelLabelNode = slotNode.getChildByName("level");
    var levelLabel = levelLabelNode ? levelLabelNode.getComponent(cc.Label) : null;
    if (levelLabel) {
      levelLabel.string = String(levelId);
    }

    var starCount = getLevelStarCount(levelId);
    var isPassed = isLevelCompleted(levelId);
    var isUnlocked = levelId <= highestUnlocked;
    var isCurrent = levelId === highlightedLevelId;
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

        if (!slotNode.__levelSelectUnlocked || !Number.isInteger(slotNode.__levelSelectLevelId)) {
          return;
        }

        onLevelSelectTap(slotNode.__levelSelectLevelId);
      });
    }

    slotNode.__levelSelectLevelId = levelId;
    slotNode.__levelSelectUnlocked = isUnlocked;
  });

  var nextMapNode = levelView.getChildByName("next_map");
  var previousMapNode = levelView.getChildByName("previous_map");
  var hasPrevious = currentMapIndex > 0;
  var hasNext = currentMapIndex < mapCount - 1;

  if (previousMapNode) {
    previousMapNode.active = hasPrevious;
    var previousButton = previousMapNode.getComponent(cc.Button);
    if (previousButton) {
      previousButton.interactable = hasPrevious;
    }
    bindMapSwitchButton(previousMapNode, levelView, function (viewNode) {
      return (viewNode.__levelSelectCurrentMapIndex || 0) - 1;
    }, onMapIndexChange);
  }

  if (nextMapNode) {
    nextMapNode.active = hasNext;
    var nextButton = nextMapNode.getComponent(cc.Button);
    if (nextButton) {
      nextButton.interactable = hasNext;
    }
    bindMapSwitchButton(nextMapNode, levelView, function (viewNode) {
      return (viewNode.__levelSelectCurrentMapIndex || 0) + 1;
    }, onMapIndexChange);
  }

  levelView.__levelSelectCurrentMapIndex = currentMapIndex;
  levelView.__levelSelectMapCount = mapCount;

  return {
    levelViewNode: levelView,
    currentMapIndex: currentMapIndex,
    mapCount: mapCount
  };
}

module.exports = {
  renderLevelSelectContent: renderLevelSelectContent
};
