"use strict";

var BundleLoader = require("../utils/BundleLoader");

var MAP_BUNDLE_NAME = "map";
var CONFIG_PATH = "config/floating_map";
var TELEPORT_ARRAY_PREFAB_NAME = "TeleportationArray";
var PROTAGONIST_PATH = "image/protagonist";
var ROOT_NODE_NAME = "FloatingMapRoot";
var CONTENT_NODE_NAME = "FloatingMapContent";
var PROTAGONIST_NODE_NAME = "protagonist";
var TELEPORT_ARRAY_NODE_NAME = "TeleportationArray";
var MAP_BUFFER_Y = 780;
var TOUCH_DRAG_THRESHOLD = 12;
var INERTIA_FRAME_SECONDS = 1 / 60;
var INERTIA_DECELERATION = 2600;
var INERTIA_MIN_VELOCITY = 18;
var BACKGROUND_SCROLL_RATIO = 0.05;
var FOCUS_Y_RATIO_FROM_BOTTOM = 0.38;
var PROTAGONIST_SIZE = 48;
var PROTAGONIST_Y = 55;
var NORMAL_ISLAND_CAPACITIES = {
  island1: 3,
  island2: 4,
  island3: 4,
  island4: 4,
  island5: 5,
  island6: 6,
  island7: 6,
  island8: 6
};
var SPECIAL_PREFABS = {
  landmark1: true,
  landmark2: true,
  landmark3: true,
  landmark4: true,
  landmark5: true
};

var assetLoadPromise = null;
var cachedAssets = null;

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, description) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(description + " must be a positive integer.");
  }
  return value;
}

function requirePositiveNumber(value, description) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(description + " must be a positive number.");
  }
  return value;
}

function requireNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function requireChild(node, childName, description) {
  requireNode(node, description + " parent");
  var child = node.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error(description + " missing child `" + childName + "`.");
  }
  return child;
}

function requireComponent(node, componentType, description) {
  requireNode(node, description + " node");
  var component = node.getComponent(componentType);
  if (!component) {
    throw new Error(description + " component is required.");
  }
  return component;
}

function loadBundleAsset(bundle, assetPath, assetType, description) {
  return new Promise(function (resolve, reject) {
    if (!bundle || typeof bundle.load !== "function") {
      reject(new Error("Map bundle is not loaded before loading " + description + "."));
      return;
    }
    bundle.load(assetPath, assetType, function (error, asset) {
      if (error) {
        reject(new Error("Load " + description + " failed: " + error.message));
        return;
      }
      if (!asset) {
        reject(new Error(description + " is missing at " + assetPath + "."));
        return;
      }
      resolve(asset);
    });
  });
}

function cloneJson(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireLevelIds(nodeConfig) {
  if (!Array.isArray(nodeConfig.levelIds) || nodeConfig.levelIds.length === 0) {
    throw new Error("Floating map node " + nodeConfig.index + " requires non-empty levelIds.");
  }
  nodeConfig.levelIds.forEach(function (levelId, levelIndex) {
    requirePositiveInteger(levelId, "Floating map node " + nodeConfig.index + " levelIds[" + levelIndex + "]");
    if (levelIndex > 0 && levelId <= nodeConfig.levelIds[levelIndex - 1]) {
      throw new Error("Floating map node " + nodeConfig.index + " levelIds must be ascending.");
    }
  });
}

function validateNormalIslandCapacities(config) {
  var capacities = requireObject(config.normalIslandCapacities, "floating_map.normalIslandCapacities");
  Object.keys(NORMAL_ISLAND_CAPACITIES).forEach(function (prefabName) {
    if (capacities[prefabName] !== NORMAL_ISLAND_CAPACITIES[prefabName]) {
      throw new Error("Floating map normal capacity mismatch for " + prefabName + ".");
    }
  });
}

function validateConfig(rawConfig) {
  var config = cloneJson(requireObject(rawConfig, "floating map config"));
  if (config.schemaVersion !== 1) {
    throw new Error("floating_map.schemaVersion must be 1.");
  }
  requirePositiveInteger(config.targetLevelCount, "floating_map.targetLevelCount");
  requirePositiveInteger(config.specialInterval, "floating_map.specialInterval");
  requirePositiveNumber(config.verticalPadding, "floating_map.verticalPadding");
  validateNormalIslandCapacities(config);
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error("floating_map.nodes must be a non-empty array.");
  }

  var seenLevels = {};
  config.nodes.forEach(function (nodeConfig, nodeIndex) {
    requireObject(nodeConfig, "floating_map.nodes[" + nodeIndex + "]");
    if (nodeConfig.index !== nodeIndex) {
      throw new Error("Floating map node index must be continuous at " + nodeIndex + ".");
    }
    requirePositiveNumber(nodeConfig.width, "Floating map node " + nodeConfig.index + " width");
    requirePositiveNumber(nodeConfig.height, "Floating map node " + nodeConfig.index + " height");
    if (typeof nodeConfig.anchorY !== "number" || !Number.isFinite(nodeConfig.anchorY) || nodeConfig.anchorY < 0 || nodeConfig.anchorY > 1) {
      throw new Error("Floating map node " + nodeConfig.index + " anchorY must be in [0, 1].");
    }
    requirePositiveNumber(nodeConfig.y, "Floating map node " + nodeConfig.index + " y");
    var expectedBottomY = nodeIndex === 0
      ? 0
      : config.nodes[nodeIndex - 1].y + (1 - config.nodes[nodeIndex - 1].anchorY) * config.nodes[nodeIndex - 1].height + config.verticalPadding * 2;
    var actualBottomY = nodeConfig.y - nodeConfig.anchorY * nodeConfig.height;
    if (Math.abs(expectedBottomY - actualBottomY) > 0.001) {
      throw new Error("Floating map node " + nodeConfig.index + " has invalid vertical spacing.");
    }
    if (nodeConfig.type !== "normal" && nodeConfig.type !== "special") {
      throw new Error("Floating map node " + nodeConfig.index + " has invalid type: " + nodeConfig.type);
    }
    if (typeof nodeConfig.prefab !== "string" || nodeConfig.prefab.length === 0) {
      throw new Error("Floating map node " + nodeConfig.index + " requires prefab.");
    }
    requirePositiveInteger(nodeConfig.capacity, "Floating map node " + nodeConfig.index + " capacity");
    requireLevelIds(nodeConfig);
    if (nodeConfig.capacity !== nodeConfig.levelIds.length) {
      throw new Error("Floating map node " + nodeConfig.index + " capacity must match levelIds length.");
    }

    if (nodeConfig.type === "normal") {
      if (NORMAL_ISLAND_CAPACITIES[nodeConfig.prefab] !== nodeConfig.capacity) {
        throw new Error("Normal floating map node " + nodeConfig.index + " capacity mismatches prefab " + nodeConfig.prefab + ".");
      }
    } else {
      if (SPECIAL_PREFABS[nodeConfig.prefab] !== true) {
        throw new Error("Special floating map node " + nodeConfig.index + " has invalid prefab " + nodeConfig.prefab + ".");
      }
      if (nodeConfig.capacity !== 1) {
        throw new Error("Special floating map node " + nodeConfig.index + " capacity must be 1.");
      }
    }

    nodeConfig.levelIds.forEach(function (levelId) {
      if (levelId > config.targetLevelCount) {
        throw new Error("Floating map level id exceeds targetLevelCount: " + levelId);
      }
      if (seenLevels[String(levelId)] === true) {
        throw new Error("Floating map level id duplicated: " + levelId);
      }
      if (nodeConfig.type === "normal" && levelId % config.specialInterval === 0) {
        throw new Error("Special level assigned to normal floating island: " + levelId);
      }
      if (nodeConfig.type === "special" && levelId % config.specialInterval !== 0) {
        throw new Error("Non-special level assigned to special floating island: " + levelId);
      }
      seenLevels[String(levelId)] = true;
    });
  });

  for (var levelId = 1; levelId <= config.targetLevelCount; levelId += 1) {
    if (seenLevels[String(levelId)] !== true) {
      throw new Error("Floating map config missing level id: " + levelId);
    }
  }
  return config;
}

function loadConfig(bundle) {
  return loadBundleAsset(bundle, CONFIG_PATH, cc.JsonAsset, "floating map config").then(function (asset) {
    if (!asset.json) {
      throw new Error("Floating map config json is missing.");
    }
    return validateConfig(asset.json);
  });
}

function loadPrefabMap(bundle, prefabNames) {
  var prefabs = {};
  var tasks = prefabNames.map(function (prefabName) {
    return loadBundleAsset(bundle, "prefabs/" + prefabName, cc.Prefab, "map prefab " + prefabName).then(function (prefab) {
      prefabs[prefabName] = prefab;
      return null;
    });
  });
  return Promise.all(tasks).then(function () {
    return prefabs;
  });
}

function collectPrefabNames(config) {
  var names = {};
  config.nodes.forEach(function (nodeConfig) {
    names[nodeConfig.prefab] = true;
  });
  names[TELEPORT_ARRAY_PREFAB_NAME] = true;
  return Object.keys(names).sort();
}

function parseLevelButtonIndex(nodeName) {
  if (typeof nodeName !== "string") {
    return 0;
  }
  var match = /^level_btn(\d+)$/.exec(nodeName);
  if (!match) {
    return 0;
  }
  var value = Number(match[1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid level button name: " + nodeName);
  }
  return value;
}

function collectLevelButtons(islandNode) {
  requireNode(islandNode, "floating island node");
  if (!Array.isArray(islandNode.children)) {
    throw new Error("Floating island children must be an array.");
  }
  var buttons = islandNode.children.map(function (child) {
    return {
      node: child,
      index: parseLevelButtonIndex(child.name)
    };
  }).filter(function (item) {
    return item.index > 0;
  });
  buttons.sort(function (a, b) {
    return a.index - b.index;
  });
  return buttons;
}

function validateNormalPrefabNode(prefabName, prefab) {
  var node = cc.instantiate(prefab);
  if (!node || !node.isValid) {
    throw new Error("Instantiate map prefab failed during validation: " + prefabName);
  }
  try {
    if (node.name !== prefabName) {
      throw new Error("Map prefab root name mismatch: " + prefabName + " root is `" + node.name + "`.");
    }
    requireChild(node, "teleport_point", prefabName);
    var buttons = collectLevelButtons(node);
    var expectedCapacity = NORMAL_ISLAND_CAPACITIES[prefabName];
    if (buttons.length !== expectedCapacity) {
      throw new Error(prefabName + " level button count must be " + expectedCapacity + ".");
    }
    buttons.forEach(function (button) {
      requireChild(button.node, "level", prefabName + "/" + button.node.name);
      requireChild(button.node, "level_lock", prefabName + "/" + button.node.name);
      requireComponent(button.node, cc.Button, prefabName + "/" + button.node.name);
    });
  } finally {
    node.destroy();
  }
}

function validateSpecialPrefabNode(prefabName, prefab) {
  var node = cc.instantiate(prefab);
  if (!node || !node.isValid) {
    throw new Error("Instantiate map prefab failed during validation: " + prefabName);
  }
  try {
    if (node.name !== prefabName) {
      throw new Error("Map prefab root name mismatch: " + prefabName + " root is `" + node.name + "`.");
    }
    var teleportPointNode = requireChild(node, "teleport_point", prefabName);
    requireChild(teleportPointNode, "door", prefabName + "/teleport_point");
    var buttons = collectLevelButtons(node);
    if (buttons.length !== 1 || buttons[0].node.name !== "level_btn1") {
      throw new Error(prefabName + " must contain only level_btn1.");
    }
    requireChild(buttons[0].node, "level", prefabName + "/level_btn1");
    requireChild(buttons[0].node, "level_lock", prefabName + "/level_btn1");
    requireComponent(buttons[0].node, cc.Button, prefabName + "/level_btn1");
  } finally {
    node.destroy();
  }
}

function validateLoadedPrefabs(config, prefabs) {
  config.nodes.forEach(function (nodeConfig) {
    var prefab = prefabs[nodeConfig.prefab];
    if (!prefab) {
      throw new Error("Loaded map prefabs missing " + nodeConfig.prefab + ".");
    }
  });
  Object.keys(NORMAL_ISLAND_CAPACITIES).forEach(function (prefabName) {
    if (prefabs[prefabName]) {
      validateNormalPrefabNode(prefabName, prefabs[prefabName]);
    }
  });
  Object.keys(SPECIAL_PREFABS).forEach(function (prefabName) {
    if (prefabs[prefabName]) {
      validateSpecialPrefabNode(prefabName, prefabs[prefabName]);
    }
  });
  if (!prefabs[TELEPORT_ARRAY_PREFAB_NAME]) {
    throw new Error("TeleportationArray prefab is not loaded.");
  }
}

function loadAssets() {
  if (cachedAssets) {
    return Promise.resolve(cachedAssets);
  }
  if (assetLoadPromise) {
    return assetLoadPromise;
  }

  assetLoadPromise = BundleLoader.ensureNamedBundleLoaded(MAP_BUNDLE_NAME).then(function (bundle) {
    return loadConfig(bundle).then(function (config) {
      return Promise.all([
        loadPrefabMap(bundle, collectPrefabNames(config)),
        loadBundleAsset(bundle, PROTAGONIST_PATH, cc.SpriteFrame, "map protagonist sprite")
      ]).then(function (results) {
        validateLoadedPrefabs(config, results[0]);
        return {
          config: config,
          prefabs: results[0],
          protagonistSpriteFrame: results[1]
        };
      });
    });
  }).then(function (assets) {
    cachedAssets = assets;
    assetLoadPromise = null;
    return assets;
  }, function (error) {
    assetLoadPromise = null;
    throw error;
  });

  return assetLoadPromise;
}

function destroyExistingRuntimeRoot(mapHostNode) {
  if (mapHostNode.__floatingMapState) {
    stopInertia(mapHostNode.__floatingMapState);
  }
  var existingRoot = mapHostNode.getChildByName(ROOT_NODE_NAME);
  if (existingRoot && existingRoot.isValid) {
    existingRoot.removeFromParent(false);
    existingRoot.destroy();
  }
}

function createRuntimeRoot(mapHostNode) {
  var root = new cc.Node(ROOT_NODE_NAME);
  root.parent = mapHostNode;
  root.setContentSize(mapHostNode.getContentSize());
  root.setPosition(0, 0);
  root.zIndex = 20;
  var content = new cc.Node(CONTENT_NODE_NAME);
  content.parent = root;
  content.setPosition(0, 0);
  content.zIndex = 1;
  return {
    root: root,
    content: content
  };
}

function resolveHostBounds(mapHostNode) {
  var size = mapHostNode.getContentSize();
  if (!size || !Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error("LevelView/map size must be valid before rendering floating map.");
  }
  if (!Number.isFinite(mapHostNode.anchorY)) {
    throw new Error("LevelView/map anchorY must be valid before rendering floating map.");
  }
  return {
    width: size.width,
    height: size.height,
    bottom: -mapHostNode.anchorY * size.height,
    top: (1 - mapHostNode.anchorY) * size.height
  };
}

function resolveFocusY(bounds) {
  return bounds.bottom + bounds.height * FOCUS_Y_RATIO_FROM_BOTTOM;
}

function findNodeIndexByLevelId(config, levelId) {
  for (var index = 0; index < config.nodes.length; index += 1) {
    if (config.nodes[index].levelIds.indexOf(levelId) >= 0) {
      return index;
    }
  }
  throw new Error("Floating map config does not contain level id: " + levelId);
}

function resolveLatestAccessibleLevelId(config, highestUnlocked) {
  requirePositiveInteger(highestUnlocked, "highestUnlockedLevel");
  return Math.min(highestUnlocked, config.targetLevelCount);
}

function clampContentY(state, contentY) {
  if (contentY > state.maxContentY) {
    return state.maxContentY;
  }
  if (contentY < state.minContentY) {
    return state.minContentY;
  }
  return contentY;
}

function resolveInitialContentY(state, focusLevelId) {
  var nodeIndex = findNodeIndexByLevelId(state.config, focusLevelId);
  var nodeConfig = state.config.nodes[nodeIndex];
  return clampContentY(state, state.focusY - nodeConfig.y);
}

function resolveNodeBottomY(nodeConfig) {
  return nodeConfig.y - nodeConfig.anchorY * nodeConfig.height;
}

function resolveNodeTopY(nodeConfig) {
  return nodeConfig.y + (1 - nodeConfig.anchorY) * nodeConfig.height;
}

function getVisibleRange(state) {
  return {
    minY: state.bounds.bottom - state.content.y - MAP_BUFFER_Y,
    maxY: state.bounds.top - state.content.y + MAP_BUFFER_Y
  };
}

function configureButtonLabel(buttonNode, levelId) {
  var labelNode = requireChild(buttonNode, "level", buttonNode.name);
  var label = requireComponent(labelNode, cc.Label, buttonNode.name + "/level");
  label.string = String(levelId);
  labelNode.active = buttonNode.__floatingMapUnlocked === true;
}

function configureButtonLock(buttonNode, isUnlocked) {
  var lockNode = requireChild(buttonNode, "level_lock", buttonNode.name);
  lockNode.active = !isUnlocked;
  var labelNode = requireChild(buttonNode, "level", buttonNode.name);
  labelNode.active = isUnlocked;
  var button = requireComponent(buttonNode, cc.Button, buttonNode.name);
  button.interactable = isUnlocked;
  button.enableAutoGrayEffect = false;
}

function configureButtonStars(buttonNode, starCount, isCompleted) {
  var safeStarCount = requirePositiveOrZeroStarCount(starCount);
  ["start1", "start2", "start3"].forEach(function (name, index) {
    var starNode = buttonNode.getChildByName(name);
    if (starNode) {
      starNode.active = isCompleted && index < safeStarCount;
    }
  });
}

function requirePositiveOrZeroStarCount(value) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error("Floating map star count must be an integer in [0, 3].");
  }
  return value;
}

function bindLevelButton(buttonNode, state) {
  buttonNode.__floatingMapState = state;
  if (buttonNode.__floatingMapTapBound === true) {
    return;
  }
  buttonNode.__floatingMapTapBound = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    var buttonState = buttonNode.__floatingMapState;
    if (!buttonState || buttonState.dragConsumed === true) {
      return;
    }
    if (buttonNode.__floatingMapUnlocked !== true) {
      return;
    }
    var levelId = buttonNode.__floatingMapLevelId;
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("Floating map button level id is invalid.");
    }
    buttonState.onLevelSelectTap(levelId);
  });
}

function attachProtagonist(buttonNode, state) {
  var existingNode = buttonNode.getChildByName(PROTAGONIST_NODE_NAME);
  if (existingNode && existingNode.isValid) {
    existingNode.destroy();
  }
  var protagonistNode = new cc.Node(PROTAGONIST_NODE_NAME);
  protagonistNode.parent = buttonNode;
  protagonistNode.setPosition(0, PROTAGONIST_Y);
  protagonistNode.setContentSize(PROTAGONIST_SIZE, PROTAGONIST_SIZE);
  protagonistNode.zIndex = 1000;
  var sprite = protagonistNode.addComponent(cc.Sprite);
  sprite.spriteFrame = state.assets.protagonistSpriteFrame;
  if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
}

function removeProtagonist(buttonNode) {
  var existingNode = buttonNode.getChildByName(PROTAGONIST_NODE_NAME);
  if (existingNode && existingNode.isValid) {
    existingNode.destroy();
  }
}

function configureLevelButton(buttonNode, levelId, state) {
  var isUnlocked = levelId <= state.highestUnlocked;
  var isCompleted = state.isLevelCompleted(levelId);
  var starCount = state.getLevelStarCount(levelId);
  buttonNode.__floatingMapLevelId = levelId;
  buttonNode.__floatingMapUnlocked = isUnlocked;
  configureButtonLabel(buttonNode, levelId);
  configureButtonLock(buttonNode, isUnlocked);
  configureButtonStars(buttonNode, starCount, isCompleted);
  bindLevelButton(buttonNode, state);
  if (levelId === state.latestAccessibleLevelId) {
    attachProtagonist(buttonNode, state);
  } else {
    removeProtagonist(buttonNode);
  }
}

function clearTeleportArray(teleportPointNode) {
  var arrayNode = teleportPointNode.getChildByName(TELEPORT_ARRAY_NODE_NAME);
  if (arrayNode && arrayNode.isValid) {
    arrayNode.destroy();
  }
}

function configureNormalTeleport(islandNode, nodeConfig, state) {
  var teleportPointNode = requireChild(islandNode, "teleport_point", nodeConfig.prefab);
  clearTeleportArray(teleportPointNode);
  var lastLevelId = nodeConfig.levelIds[nodeConfig.levelIds.length - 1];
  if (state.isLevelCompleted(lastLevelId) !== true) {
    return;
  }
  var arrayNode = cc.instantiate(state.assets.prefabs[TELEPORT_ARRAY_PREFAB_NAME]);
  if (!arrayNode || !arrayNode.isValid) {
    throw new Error("Instantiate TeleportationArray failed.");
  }
  arrayNode.name = TELEPORT_ARRAY_NODE_NAME;
  arrayNode.parent = teleportPointNode;
  arrayNode.setPosition(0, 0);
  arrayNode.zIndex = 50;
}

function configureSpecialDoor(islandNode, nodeConfig, state) {
  var teleportPointNode = requireChild(islandNode, "teleport_point", nodeConfig.prefab);
  var doorNode = requireChild(teleportPointNode, "door", nodeConfig.prefab + "/teleport_point");
  doorNode.active = state.isLevelCompleted(nodeConfig.levelIds[0]) === true;
}

function configureIslandNode(islandNode, nodeConfig, state) {
  var size = islandNode.getContentSize();
  if (!size || Math.abs(size.width - nodeConfig.width) > 0.001 || Math.abs(size.height - nodeConfig.height) > 0.001) {
    throw new Error("Floating map node " + nodeConfig.index + " prefab size mismatches config.");
  }
  if (Math.abs(islandNode.anchorY - nodeConfig.anchorY) > 0.001) {
    throw new Error("Floating map node " + nodeConfig.index + " prefab anchorY mismatches config.");
  }
  var buttons = collectLevelButtons(islandNode);
  if (buttons.length !== nodeConfig.capacity) {
    throw new Error("Floating map node " + nodeConfig.index + " button count mismatch.");
  }
  buttons.forEach(function (button, index) {
    if (button.index !== index + 1) {
      throw new Error("Floating map node " + nodeConfig.index + " button sequence mismatch.");
    }
    configureLevelButton(button.node, nodeConfig.levelIds[index], state);
  });
  if (nodeConfig.type === "normal") {
    configureNormalTeleport(islandNode, nodeConfig, state);
    return;
  }
  configureSpecialDoor(islandNode, nodeConfig, state);
}

function createIslandNode(state, nodeConfig) {
  var prefab = state.assets.prefabs[nodeConfig.prefab];
  if (!prefab) {
    throw new Error("Floating map prefab missing: " + nodeConfig.prefab);
  }
  var islandNode = cc.instantiate(prefab);
  if (!islandNode || !islandNode.isValid) {
    throw new Error("Instantiate floating map node failed: " + nodeConfig.prefab);
  }
  islandNode.name = "FloatingIsland_" + nodeConfig.index;
  islandNode.parent = state.content;
  islandNode.setPosition(0, nodeConfig.y);
  islandNode.zIndex = nodeConfig.index;
  var widget = islandNode.getComponent(cc.Widget);
  if (widget) {
    widget.enabled = false;
  }
  configureIslandNode(islandNode, nodeConfig, state);
  return islandNode;
}

function renderVisibleNodes(state) {
  var range = getVisibleRange(state);
  var requiredIndexes = {};
  state.config.nodes.forEach(function (nodeConfig) {
    var nodeBottomY = resolveNodeBottomY(nodeConfig);
    var nodeTopY = resolveNodeTopY(nodeConfig);
    if (nodeTopY >= range.minY && nodeBottomY <= range.maxY) {
      requiredIndexes[String(nodeConfig.index)] = true;
      if (!state.renderedNodes[String(nodeConfig.index)] || !state.renderedNodes[String(nodeConfig.index)].isValid) {
        state.renderedNodes[String(nodeConfig.index)] = createIslandNode(state, nodeConfig);
      } else {
        configureIslandNode(state.renderedNodes[String(nodeConfig.index)], nodeConfig, state);
      }
    }
  });
  Object.keys(state.renderedNodes).forEach(function (key) {
    if (requiredIndexes[key] === true) {
      return;
    }
    var node = state.renderedNodes[key];
    if (node && node.isValid) {
      node.destroy();
    }
    delete state.renderedNodes[key];
  });
}

function clampBackgroundY(mapHostNode, backgroundNode, y) {
  var bounds = resolveHostBounds(mapHostNode);
  var size = backgroundNode.getContentSize();
  if (!size || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error("LevelView/map/bg height must be valid.");
  }
  if (size.height < bounds.height) {
    throw new Error("LevelView/map/bg height must not be smaller than LevelView/map height.");
  }
  if (!Number.isFinite(backgroundNode.anchorY)) {
    throw new Error("LevelView/map/bg anchorY must be valid.");
  }
  var minY = bounds.top - (1 - backgroundNode.anchorY) * size.height;
  var maxY = bounds.bottom + backgroundNode.anchorY * size.height;
  if (y < minY) {
    return minY;
  }
  if (y > maxY) {
    return maxY;
  }
  return y;
}

function moveBackground(state, deltaY) {
  var backgroundNode = state.backgroundNode;
  backgroundNode.y = clampBackgroundY(state.mapHostNode, backgroundNode, backgroundNode.y + deltaY * BACKGROUND_SCROLL_RATIO);
}

function applyContentDelta(state, deltaY) {
  var currentY = state.content.y;
  var nextY = clampContentY(state, currentY + deltaY);
  var appliedDeltaY = nextY - currentY;
  if (appliedDeltaY === 0) {
    return;
  }
  state.content.y = nextY;
  moveBackground(state, appliedDeltaY);
  renderVisibleNodes(state);
}

function stopInertia(state) {
  if (state.inertiaTimer) {
    clearInterval(state.inertiaTimer);
    state.inertiaTimer = null;
  }
  state.inertiaVelocityY = 0;
}

function startInertia(state) {
  stopInertia(state);
  var velocityY = state.dragVelocityY;
  if (!Number.isFinite(velocityY) || Math.abs(velocityY) < INERTIA_MIN_VELOCITY) {
    return;
  }
  state.inertiaVelocityY = velocityY;
  state.inertiaTimer = setInterval(function () {
    if (!state.root || !state.root.isValid || !state.content || !state.content.isValid) {
      stopInertia(state);
      return;
    }
    var deltaY = state.inertiaVelocityY * INERTIA_FRAME_SECONDS;
    var beforeY = state.content.y;
    applyContentDelta(state, deltaY);
    if (state.content.y === beforeY) {
      stopInertia(state);
      return;
    }
    var direction = state.inertiaVelocityY > 0 ? 1 : -1;
    var nextSpeed = Math.abs(state.inertiaVelocityY) - INERTIA_DECELERATION * INERTIA_FRAME_SECONDS;
    if (nextSpeed <= INERTIA_MIN_VELOCITY) {
      stopInertia(state);
      return;
    }
    state.inertiaVelocityY = direction * nextSpeed;
  }, INERTIA_FRAME_SECONDS * 1000);
}

function getTouchLocation(event) {
  if (!event || typeof event.getLocation !== "function") {
    throw new Error("Floating map touch event is invalid.");
  }
  var location = event.getLocation();
  if (!location || typeof location.y !== "number" || !Number.isFinite(location.y)) {
    throw new Error("Floating map touch location is invalid.");
  }
  return location;
}

function bindTouch(mapHostNode, state) {
  mapHostNode.__floatingMapState = state;
  if (mapHostNode.__floatingMapTouchBound === true) {
    return;
  }
  mapHostNode.__floatingMapTouchBound = true;
  mapHostNode.on(cc.Node.EventType.TOUCH_START, function (event) {
    var touchState = mapHostNode.__floatingMapState;
    stopInertia(touchState);
    touchState.dragTracking = true;
    touchState.dragConsumed = false;
    touchState.dragVelocityY = 0;
    var location = getTouchLocation(event);
    touchState.lastTouchY = location.y;
    touchState.lastTouchTime = Date.now();
  }, mapHostNode, true);
  mapHostNode.on(cc.Node.EventType.TOUCH_MOVE, function (event) {
    var touchState = mapHostNode.__floatingMapState;
    if (touchState.dragTracking !== true) {
      return;
    }
    var location = getTouchLocation(event);
    var deltaY = location.y - touchState.lastTouchY;
    var now = Date.now();
    var deltaSeconds = Math.max(0.001, (now - touchState.lastTouchTime) / 1000);
    touchState.dragVelocityY = deltaY / deltaSeconds;
    if (Math.abs(deltaY) >= TOUCH_DRAG_THRESHOLD) {
      touchState.dragConsumed = true;
    }
    touchState.lastTouchY = location.y;
    touchState.lastTouchTime = now;
    applyContentDelta(touchState, deltaY);
  }, mapHostNode, true);
  mapHostNode.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    var touchState = mapHostNode.__floatingMapState;
    stopInertia(touchState);
    touchState.dragTracking = false;
    touchState.lastTouchY = 0;
    touchState.lastTouchTime = 0;
    touchState.dragVelocityY = 0;
    touchState.dragConsumed = false;
  }, mapHostNode, true);
  mapHostNode.on(cc.Node.EventType.TOUCH_END, function () {
    var touchState = mapHostNode.__floatingMapState;
    touchState.dragTracking = false;
    touchState.lastTouchY = 0;
    touchState.lastTouchTime = 0;
    startInertia(touchState);
    setTimeout(function () {
      if (mapHostNode && mapHostNode.isValid && mapHostNode.__floatingMapState === touchState) {
        touchState.dragConsumed = false;
      }
    }, 0);
  }, mapHostNode, true);
}

function requireRenderOptions(options) {
  requireObject(options, "Floating map render options");
  requireNode(options.mapHostNode, "LevelView/map");
  requireObject(options.assets, "Floating map assets");
  requireObject(options.assets.config, "Floating map assets.config");
  requireObject(options.assets.prefabs, "Floating map assets.prefabs");
  if (!options.assets.protagonistSpriteFrame) {
    throw new Error("Floating map protagonist sprite frame is required.");
  }
  requirePositiveInteger(options.highestUnlocked, "highestUnlocked");
  if (typeof options.getLevelStarCount !== "function") {
    throw new Error("Floating map requires getLevelStarCount.");
  }
  if (typeof options.isLevelCompleted !== "function") {
    throw new Error("Floating map requires isLevelCompleted.");
  }
  if (typeof options.onLevelSelectTap !== "function") {
    throw new Error("Floating map requires onLevelSelectTap.");
  }
}

function render(options) {
  requireRenderOptions(options);
  var mapHostNode = options.mapHostNode;
  var backgroundNode = requireChild(mapHostNode, "bg", "LevelView/map");
  backgroundNode.y = clampBackgroundY(mapHostNode, backgroundNode, backgroundNode.y);
  destroyExistingRuntimeRoot(mapHostNode);
  var runtimeNodes = createRuntimeRoot(mapHostNode);
  var config = options.assets.config;
  var bounds = resolveHostBounds(mapHostNode);
  var latestAccessibleLevelId = resolveLatestAccessibleLevelId(config, options.highestUnlocked);
  var focusY = resolveFocusY(bounds);
  var firstNode = config.nodes[0];
  var lastNode = config.nodes[config.nodes.length - 1];
  var state = {
    mapHostNode: mapHostNode,
    backgroundNode: backgroundNode,
    root: runtimeNodes.root,
    content: runtimeNodes.content,
    assets: options.assets,
    config: config,
    bounds: bounds,
    focusY: focusY,
    maxContentY: bounds.bottom - resolveNodeBottomY(firstNode),
    minContentY: bounds.top - resolveNodeTopY(lastNode),
    latestAccessibleLevelId: latestAccessibleLevelId,
    highestUnlocked: options.highestUnlocked,
    getLevelStarCount: options.getLevelStarCount,
    isLevelCompleted: options.isLevelCompleted,
    onLevelSelectTap: options.onLevelSelectTap,
    renderedNodes: {},
    dragTracking: false,
    dragConsumed: false,
    lastTouchY: 0,
    lastTouchTime: 0,
    dragVelocityY: 0,
    inertiaVelocityY: 0,
    inertiaTimer: null
  };
  runtimeNodes.content.y = resolveInitialContentY(state, latestAccessibleLevelId);
  mapHostNode.__floatingMapState = state;
  bindTouch(mapHostNode, state);
  renderVisibleNodes(state);
  return {
    nodeCount: config.nodes.length,
    currentNodeIndex: findNodeIndexByLevelId(config, latestAccessibleLevelId),
    targetLevelCount: config.targetLevelCount
  };
}

module.exports = {
  loadAssets: loadAssets,
  render: render
};
