"use strict";

var BundleLoader = require("../utils/BundleLoader");
var LevelSelectMemoryDiagnostics = require("../utils/LevelSelectMemoryDiagnostics");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var MAP_BUNDLE_NAME = "map";
var CONFIG_PATH = "config/floating_map";
var TELEPORT_ARRAY_PREFAB_NAME = "TeleportationArray";
var PROTAGONIST_PATH = "image/ui/protagonist";
var LEVEL_NUMBER_PATH_PREFIX = "image/num/";
var TRAPPED_SPIRIT_PATH_PREFIX = "image/trapped_spirit/";
var ROOT_NODE_NAME = "FloatingMapRoot";
var CONTENT_NODE_NAME = "FloatingMapContent";
var PROTAGONIST_NODE_NAME = "protagonist";
var TELEPORT_ARRAY_NODE_NAME = "TeleportationArray";
var LEVEL_NUMBER_DIGIT_NODE_PREFIX = "digit_";
var MAP_BUFFER_Y = 780;
var TOUCH_DRAG_THRESHOLD = 12;
var INERTIA_FRAME_SECONDS = 1 / 60;
var INERTIA_DECELERATION = 2600;
var INERTIA_MIN_VELOCITY = 18;
var INERTIA_SCHEDULE_REPEAT = cc.macro.REPEAT_FOREVER;
var SCHEDULE_ONCE_REPEAT = 0;
var BACKGROUND_SCROLL_RATIO = 0.05;
var FOCUS_Y_RATIO_FROM_BOTTOM = 0.38;
var FIRST_ISLAND_BOTTOM_SCROLL_PADDING = 300;
var SCROLL_TO_LEVEL_DURATION = 0.32;
var BACK_BUTTON_SYNC_SCROLL_INTERVAL = 6;
var PROTAGONIST_WIDTH = 63;
var PROTAGONIST_HEIGHT = 67;
var PROTAGONIST_Y = 57;
var PROTAGONIST_Z_INDEX = 1000;
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
var RESCUE_LANDMARK_PREFAB_NAME = "landmark1";
var SPECIAL_PREFABS = {
  landmark1: true,
  landmark2: true,
  landmark3: true,
  landmark4: true,
  landmark5: true
};

var STARTUP_VISIBLE_NODE_BUFFER = 1;
var MAP_PREFAB_RETAIN_NODE_BUFFER = 2;
var RENDERED_NODE_RETAIN_NODE_BUFFER = MAP_PREFAB_RETAIN_NODE_BUFFER;
var SCROLL_RETAIN_NODE_BUFFER = 4;
var LEVEL_NUMBER_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

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

function requireNoComponent(node, componentType, description) {
  requireNode(node, description + " node");
  var component = node.getComponent(componentType);
  if (component) {
    throw new Error(description + " component must not exist.");
  }
}

function loadBundleAsset(bundle, assetPath, assetType, description) {
  return new Promise(function (resolve, reject) {
    if (!bundle || typeof bundle.load !== "function") {
      reject(new Error("Map bundle is not loaded before loading " + description + "."));
      return;
    }
    LevelSelectMemoryDiagnostics.increment("map.bundle.load:" + assetPath);
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

function loadMapLevelNumberSpriteFrames(bundle) {
  var spriteFrames = {};
  return Promise.all(LEVEL_NUMBER_DIGITS.map(function (digit) {
    return loadBundleAsset(bundle, LEVEL_NUMBER_PATH_PREFIX + digit, cc.SpriteFrame, "map level number `" + digit + "` sprite").then(function (spriteFrame) {
      spriteFrames[digit] = spriteFrame;
    });
  })).then(function () {
    LEVEL_NUMBER_DIGITS.forEach(function (digit) {
      if (!spriteFrames[digit]) {
        throw new Error("Map level number sprite is missing: " + digit);
      }
    });
    return spriteFrames;
  });
}

function getTrappedSpiritCatalog() {
  var spirits = AssistSpiritConfig.getCatalog();
  if (spirits.length !== 7) {
    throw new Error("Floating map requires exactly seven assist spirit identities.");
  }
  return spirits;
}

function collectTrappedSpiritIdsForNodeRange(config, firstIndex, lastIndex) {
  requireObject(config, "floating map config");
  requireNonNegativeInteger(firstIndex, "collectTrappedSpiritIdsForNodeRange firstIndex");
  requireNonNegativeInteger(lastIndex, "collectTrappedSpiritIdsForNodeRange lastIndex");
  if (firstIndex > lastIndex || lastIndex >= config.nodes.length) {
    throw new Error("collectTrappedSpiritIdsForNodeRange range is invalid.");
  }

  var spiritIds = {};
  for (var index = firstIndex; index <= lastIndex; index += 1) {
    var nodeConfig = config.nodes[index];
    if (nodeConfig.prefab !== RESCUE_LANDMARK_PREFAB_NAME) {
      continue;
    }
    AssistSpiritConfig.getSpirit(nodeConfig.rescueSpiritId);
    spiritIds[nodeConfig.rescueSpiritId] = true;
  }
  return Object.keys(spiritIds).sort();
}

function loadMapTrappedSpiritSpriteFrames(bundle, spiritIds) {
  var spriteFrames = {};
  var catalog = getTrappedSpiritCatalog();
  var catalogById = {};
  catalog.forEach(function (spirit) {
    catalogById[spirit.id] = true;
  });
  var requestedIds = Array.isArray(spiritIds) ? spiritIds.slice().sort() : [];
  requestedIds.forEach(function (spiritId) {
    if (typeof spiritId !== "string" || !catalogById[spiritId]) {
      throw new Error("Unknown map trapped spirit id: " + spiritId);
    }
  });
  return Promise.all(requestedIds.map(function (spiritId) {
    return loadBundleAsset(
      bundle,
      TRAPPED_SPIRIT_PATH_PREFIX + spiritId,
      cc.SpriteFrame,
      "map trapped spirit `" + spiritId + "` sprite"
    ).then(function (spriteFrame) {
      if (spriteFrames[spiritId]) {
        throw new Error("Duplicated map trapped spirit id: " + spiritId);
      }
      spriteFrames[spiritId] = spriteFrame;
    });
  })).then(function () {
    requestedIds.forEach(function (spiritId) {
      if (!spriteFrames[spiritId]) {
        throw new Error("Map trapped spirit sprite is missing: " + spiritId);
      }
    });
    return spriteFrames;
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

function buildRescueLevelLookup(config) {
  if (!Array.isArray(config.rescueLevelIds) || config.rescueLevelIds.length === 0) {
    throw new Error("floating_map.rescueLevelIds must be a non-empty array.");
  }
  var lookup = {};
  config.rescueLevelIds.forEach(function (levelId, index) {
    requirePositiveInteger(levelId, "floating_map.rescueLevelIds[" + index + "]");
    if (levelId > config.targetLevelCount) {
      throw new Error("Floating map rescue level id exceeds targetLevelCount: " + levelId);
    }
    if (index > 0 && levelId <= config.rescueLevelIds[index - 1]) {
      throw new Error("floating_map.rescueLevelIds must be strictly ascending.");
    }
    lookup[String(levelId)] = true;
  });
  return lookup;
}

function validateConfig(rawConfig) {
  var config = cloneJson(requireObject(rawConfig, "floating map config"));
  if (config.schemaVersion !== 3) {
    throw new Error("floating_map.schemaVersion must be 3.");
  }
  requirePositiveInteger(config.targetLevelCount, "floating_map.targetLevelCount");
  requirePositiveNumber(config.verticalPadding, "floating_map.verticalPadding");
  validateNormalIslandCapacities(config);
  var rescueLevelLookup = buildRescueLevelLookup(config);
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error("floating_map.nodes must be a non-empty array.");
  }

  var seenLevels = {};
  var expectedLevelId = 1;
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
      if (levelId !== expectedLevelId) {
        throw new Error("Floating map level order mismatch: expected " + expectedLevelId + ", got " + levelId + ".");
      }
      var rescue = rescueLevelLookup[String(levelId)] === true;
      var hasRescueSpiritId = Object.prototype.hasOwnProperty.call(nodeConfig, "rescueSpiritId");
      if (rescue) {
        try {
          AssistSpiritConfig.getSpirit(nodeConfig.rescueSpiritId);
        } catch (error) {
          throw new Error("Floating map rescue level " + levelId + " has invalid rescueSpiritId: " + error.message);
        }
      } else if (hasRescueSpiritId) {
        throw new Error("Non-rescue floating map level configures rescueSpiritId: " + levelId);
      }
      if (nodeConfig.type === "normal" && rescue) {
        throw new Error("Rescue level assigned to normal floating island: " + levelId);
      }
      if (
        nodeConfig.type === "special" &&
        rescue &&
        nodeConfig.prefab !== RESCUE_LANDMARK_PREFAB_NAME
      ) {
        throw new Error("Rescue level must use landmark1: " + levelId);
      }
      if (
        nodeConfig.type === "special" &&
        !rescue &&
        nodeConfig.prefab === RESCUE_LANDMARK_PREFAB_NAME
      ) {
        throw new Error("Non-rescue level assigned to landmark1: " + levelId);
      }
      seenLevels[String(levelId)] = true;
      expectedLevelId += 1;
    });
  });

  for (var levelId = 1; levelId <= config.targetLevelCount; levelId += 1) {
    if (seenLevels[String(levelId)] !== true) {
      throw new Error("Floating map config missing level id: " + levelId);
    }
  }
  if (expectedLevelId !== config.targetLevelCount + 1) {
    throw new Error("Floating map level order is incomplete.");
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

function collectPrefabNamesForNodeRange(config, firstIndex, lastIndex) {
  requireObject(config, "floating map config");
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error("Floating map config nodes must be a non-empty array.");
  }
  requireNonNegativeInteger(firstIndex, "collectPrefabNamesForNodeRange firstIndex");
  requireNonNegativeInteger(lastIndex, "collectPrefabNamesForNodeRange lastIndex");
  if (firstIndex > lastIndex) {
    throw new Error("collectPrefabNamesForNodeRange firstIndex must not exceed lastIndex.");
  }
  if (lastIndex >= config.nodes.length) {
    throw new Error("collectPrefabNamesForNodeRange lastIndex out of range.");
  }

  var names = {};
  for (var index = firstIndex; index <= lastIndex; index += 1) {
    var nodeConfig = config.nodes[index];
    if (!nodeConfig || typeof nodeConfig.prefab !== "string" || nodeConfig.prefab.trim().length === 0) {
      throw new Error("Floating map node " + index + " requires prefab name.");
    }
    names[nodeConfig.prefab] = true;
  }
  return Object.keys(names).sort();
}

function collectStartupPrefabNames(config, focusLevelId) {
  requirePositiveInteger(focusLevelId, "collectStartupPrefabNames focusLevelId");
  var nodeIndex = findNodeIndexByLevelId(config, focusLevelId);
  var firstIndex = Math.max(0, nodeIndex - STARTUP_VISIBLE_NODE_BUFFER);
  var lastIndex = Math.min(config.nodes.length - 1, nodeIndex + STARTUP_VISIBLE_NODE_BUFFER + 1);
  return collectPrefabNamesForNodeRange(config, firstIndex, lastIndex);
}

function collectRetainedPrefabNames(state) {
  var nodes = state.config.nodes;
  var visibleIndexes = resolveVisibleNodeIndexRange(state);
  if (visibleIndexes.firstIndex > visibleIndexes.lastIndex) {
    return [];
  }

  var firstIndex = Math.max(0, visibleIndexes.firstIndex - MAP_PREFAB_RETAIN_NODE_BUFFER);
  var lastIndex = Math.min(nodes.length - 1, visibleIndexes.lastIndex + MAP_PREFAB_RETAIN_NODE_BUFFER);

  var names = {};
  collectPrefabNamesForNodeRange(state.config, firstIndex, lastIndex).forEach(function (prefabName) {
    names[prefabName] = true;
  });

  for (var index = firstIndex; index <= lastIndex; index += 1) {
    var nodeConfig = nodes[index];
    if (nodeConfig.type !== "normal") {
      continue;
    }
    var lastLevelId = nodeConfig.levelIds[nodeConfig.levelIds.length - 1];
    if (state.isLevelCompleted(lastLevelId) === true) {
      names[TELEPORT_ARRAY_PREFAB_NAME] = true;
    }
  }

  return Object.keys(names).sort();
}

function requireAssetManagerReleaseAsset() {
  if (!cc || !cc.assetManager || typeof cc.assetManager.releaseAsset !== "function") {
    throw new Error("cc.assetManager.releaseAsset is required to release floating map prefabs.");
  }
  return cc.assetManager.releaseAsset;
}

function releaseMapPrefabAsset(prefab, prefabName) {
  if (!prefab) {
    throw new Error("Floating map prefab release requires prefab: " + prefabName);
  }
  requireAssetManagerReleaseAsset()(prefab);
  LevelSelectMemoryDiagnostics.increment("floatingMap.releasePrefab:" + prefabName);
}

function evictMapPrefabsOutsideRetainSet(assets, retainPrefabNames) {
  requireObject(assets, "floating map assets");
  if (!assets.prefabs || typeof assets.prefabs !== "object" || Array.isArray(assets.prefabs)) {
    throw new Error("Floating map assets.prefabs must be an object.");
  }

  var retain = {};
  (Array.isArray(retainPrefabNames) ? retainPrefabNames : []).forEach(function (prefabName) {
    if (typeof prefabName === "string" && prefabName) {
      retain[prefabName] = true;
    }
  });

  Object.keys(assets.prefabs).forEach(function (prefabName) {
    if (retain[prefabName]) {
      return;
    }
    var prefab = assets.prefabs[prefabName];
    delete assets.prefabs[prefabName];
    releaseMapPrefabAsset(prefab, prefabName);
  });
}

function releaseAllCachedMapPrefabs(assets) {
  evictMapPrefabsOutsideRetainSet(assets, []);
}

function invalidateAssetCache() {
  cachedAssets = null;
  assetLoadPromise = null;
}

function isRuntimeDisposed(state) {
  if (!state || typeof state !== "object") {
    throw new Error("Floating map runtime state is required.");
  }
  return state.disposed === true;
}

function cancelRuntimePrefetch(state) {
  if (isRuntimeDisposed(state)) {
    state.pendingPrefetchPrefabNames = {};
    state.pendingPrefetchTrappedSpiritIds = {};
    state.prefabPrefetchPromise = null;
    return;
  }
  state.disposed = true;
  state.pendingPrefetchPrefabNames = {};
  state.pendingPrefetchTrappedSpiritIds = {};
  state.prefabPrefetchPromise = null;
}

function collectRequiredPrefabNames(state) {
  var nodes = state.config.nodes;
  var visibleIndexes = resolveVisibleNodeIndexRange(state);
  if (visibleIndexes.firstIndex > visibleIndexes.lastIndex) {
    return [];
  }

  var names = {};
  collectPrefabNamesForNodeRange(state.config, visibleIndexes.firstIndex, visibleIndexes.lastIndex).forEach(function (prefabName) {
    names[prefabName] = true;
  });

  for (var index = visibleIndexes.firstIndex; index <= visibleIndexes.lastIndex; index += 1) {
    var nodeConfig = nodes[index];
    if (nodeConfig.type !== "normal") {
      continue;
    }
    var lastLevelId = nodeConfig.levelIds[nodeConfig.levelIds.length - 1];
    if (state.isLevelCompleted(lastLevelId) === true) {
      names[TELEPORT_ARRAY_PREFAB_NAME] = true;
    }
  }

  return Object.keys(names).sort();
}

function collectRequiredTrappedSpiritIds(state) {
  var visibleIndexes = resolveVisibleNodeIndexRange(state);
  if (visibleIndexes.firstIndex > visibleIndexes.lastIndex) {
    return [];
  }
  var retainIndexes = resolveRetainIndexRange(
    visibleIndexes,
    state.config.nodes.length,
    MAP_PREFAB_RETAIN_NODE_BUFFER
  );
  return collectTrappedSpiritIdsForNodeRange(state.config, retainIndexes.firstIndex, retainIndexes.lastIndex);
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function validateTeleportationArrayPrefab(prefab) {
  var node = cc.instantiate(prefab);
  if (!node || !node.isValid) {
    throw new Error("Instantiate map prefab failed during validation: " + TELEPORT_ARRAY_PREFAB_NAME);
  }
  try {
    if (node.name !== TELEPORT_ARRAY_PREFAB_NAME) {
      throw new Error(
        "Map prefab root name mismatch: " + TELEPORT_ARRAY_PREFAB_NAME + " root is `" + node.name + "`."
      );
    }
    requireChild(node, "guangzhu", TELEPORT_ARRAY_PREFAB_NAME);
  } finally {
    node.destroy();
  }
}

function validateSingleLoadedPrefab(config, prefabName, prefab) {
  if (!prefab) {
    throw new Error("Floating map prefab missing: " + prefabName);
  }
  if (prefabName === TELEPORT_ARRAY_PREFAB_NAME) {
    validateTeleportationArrayPrefab(prefab);
    return;
  }
  if (SPECIAL_PREFABS[prefabName] === true) {
    validateSpecialPrefabNode(prefabName, prefab);
    return;
  }
  validateNormalPrefabNode(prefabName, prefab);
}

function ensureMapPrefabsLoaded(assets, prefabNames) {
  requireObject(assets, "floating map assets");
  requireObject(assets.config, "floating map assets.config");
  if (!assets.mapBundle || typeof assets.mapBundle.load !== "function") {
    throw new Error("Floating map assets.mapBundle is required.");
  }
  if (!assets.prefabs || typeof assets.prefabs !== "object" || Array.isArray(assets.prefabs)) {
    throw new Error("Floating map assets.prefabs must be an object.");
  }

  var missingNames = (Array.isArray(prefabNames) ? prefabNames : []).filter(function (prefabName) {
    return typeof prefabName === "string" && prefabName && !assets.prefabs[prefabName];
  });
  if (missingNames.length === 0) {
    return Promise.resolve(assets.prefabs);
  }

  var loadKey = missingNames.slice().sort().join("|");
  assets._prefabLoadPromises = assets._prefabLoadPromises || {};
  if (assets._prefabLoadPromises[loadKey]) {
    return assets._prefabLoadPromises[loadKey];
  }

  assets._prefabLoadPromises[loadKey] = loadPrefabMap(assets.mapBundle, missingNames).then(function (loadedPrefabs) {
    missingNames.forEach(function (prefabName) {
      validateSingleLoadedPrefab(assets.config, prefabName, loadedPrefabs[prefabName]);
      assets.prefabs[prefabName] = loadedPrefabs[prefabName];
    });
    delete assets._prefabLoadPromises[loadKey];
    return assets.prefabs;
  }).catch(function (error) {
    delete assets._prefabLoadPromises[loadKey];
    throw error;
  });

  return assets._prefabLoadPromises[loadKey];
}

function ensureMapTrappedSpiritSpriteFramesLoaded(assets, spiritIds) {
  requireObject(assets, "floating map assets");
  if (!assets.mapBundle || typeof assets.mapBundle.load !== "function") {
    throw new Error("Floating map assets.mapBundle is required.");
  }
  if (!assets.trappedSpiritSpriteFrames || typeof assets.trappedSpiritSpriteFrames !== "object") {
    throw new Error("Floating map trappedSpiritSpriteFrames is required.");
  }

  var missingIds = (Array.isArray(spiritIds) ? spiritIds : []).filter(function (spiritId) {
    return typeof spiritId === "string" && spiritId && !assets.trappedSpiritSpriteFrames[spiritId];
  });
  if (missingIds.length === 0) {
    return Promise.resolve(assets.trappedSpiritSpriteFrames);
  }

  var loadKey = missingIds.slice().sort().join("|");
  assets._trappedSpiritSpriteLoadPromises = assets._trappedSpiritSpriteLoadPromises || {};
  if (assets._trappedSpiritSpriteLoadPromises[loadKey]) {
    return assets._trappedSpiritSpriteLoadPromises[loadKey];
  }

  assets._trappedSpiritSpriteLoadPromises[loadKey] = loadMapTrappedSpiritSpriteFrames(
    assets.mapBundle,
    missingIds
  ).then(function (loadedFrames) {
    missingIds.forEach(function (spiritId) {
      if (!loadedFrames[spiritId]) {
        throw new Error("Loaded map trapped spirit SpriteFrame is missing: " + spiritId);
      }
      assets.trappedSpiritSpriteFrames[spiritId] = loadedFrames[spiritId];
    });
    delete assets._trappedSpiritSpriteLoadPromises[loadKey];
    return assets.trappedSpiritSpriteFrames;
  }).catch(function (error) {
    delete assets._trappedSpiritSpriteLoadPromises[loadKey];
    throw error;
  });

  return assets._trappedSpiritSpriteLoadPromises[loadKey];
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
      var levelNumberNode = requireChild(button.node, "level", prefabName + "/" + button.node.name);
      requireNoComponent(levelNumberNode, cc.Label, prefabName + "/" + button.node.name + "/level label");
      requireComponent(levelNumberNode, cc.Sprite, prefabName + "/" + button.node.name + "/level");
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
    var levelNumberNode = requireChild(buttons[0].node, "level", prefabName + "/level_btn1");
    requireNoComponent(levelNumberNode, cc.Label, prefabName + "/level_btn1/level label");
    requireComponent(levelNumberNode, cc.Sprite, prefabName + "/level_btn1/level");
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

function loadAssets(focusLevelId) {
  if (cachedAssets) {
    LevelSelectMemoryDiagnostics.increment("map.assets.cache");
    return Promise.resolve(cachedAssets);
  }
  if (assetLoadPromise) {
    LevelSelectMemoryDiagnostics.increment("map.assets.pending");
    return assetLoadPromise;
  }

  LevelSelectMemoryDiagnostics.increment("map.assets.load");
  assetLoadPromise = BundleLoader.ensureNamedBundleLoaded(MAP_BUNDLE_NAME).then(function (bundle) {
    return loadConfig(bundle).then(function (config) {
      var startupFocusLevelId = requirePositiveInteger(focusLevelId, "loadAssets focusLevelId");
      var startupPrefabNames = collectStartupPrefabNames(config, startupFocusLevelId);
      var startupNodeIndex = findNodeIndexByLevelId(config, startupFocusLevelId);
      var startupTrappedSpiritIds = collectTrappedSpiritIdsForNodeRange(
        config,
        Math.max(0, startupNodeIndex - STARTUP_VISIBLE_NODE_BUFFER),
        Math.min(config.nodes.length - 1, startupNodeIndex + STARTUP_VISIBLE_NODE_BUFFER + 1)
      );
      var prefabs = {};
      return Promise.all([
        ensureMapPrefabsLoaded({
          config: config,
          prefabs: prefabs,
          mapBundle: bundle
        }, startupPrefabNames),
        loadBundleAsset(bundle, PROTAGONIST_PATH, cc.SpriteFrame, "map protagonist sprite"),
        loadMapLevelNumberSpriteFrames(bundle),
        loadMapTrappedSpiritSpriteFrames(bundle, startupTrappedSpiritIds)
      ]).then(function (results) {
        return {
          config: config,
          prefabs: results[0],
          protagonistSpriteFrame: results[1],
          levelNumberSpriteFrames: results[2],
          trappedSpiritSpriteFrames: results[3],
          mapBundle: bundle
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
  LevelSelectMemoryDiagnostics.increment("floatingMap.destroyExistingRuntimeRoot");
  if (mapHostNode.__floatingMapState) {
    cancelRuntimePrefetch(mapHostNode.__floatingMapState);
    stopInertia(mapHostNode.__floatingMapState, { skipFinalize: true });
    clearScrollVisibilitySync(mapHostNode.__floatingMapState);
    mapHostNode.__floatingMapState = null;
  }
  var existingRoot = mapHostNode.getChildByName(ROOT_NODE_NAME);
  if (existingRoot && existingRoot.isValid) {
    existingRoot.removeFromParent(false);
    existingRoot.destroy();
  }
}

function disposeRuntime(mapHostNode) {
  requireNode(mapHostNode, "LevelView/map");
  destroyExistingRuntimeRoot(mapHostNode);
}

function requireSpriteFrameSize(spriteFrame, description) {
  if (!spriteFrame) {
    throw new Error(description + " sprite frame is required.");
  }
  var size = null;
  if (typeof spriteFrame.getOriginalSize === "function") {
    size = spriteFrame.getOriginalSize();
  } else if (typeof spriteFrame.getRect === "function") {
    var rect = spriteFrame.getRect();
    size = {
      width: rect.width,
      height: rect.height
    };
  }
  if (!size || !Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error(description + " sprite frame size must be valid.");
  }
  return size;
}

function requireLevelNumberSpriteFrame(spriteFrames, digit, description) {
  requireObject(spriteFrames, description + " spriteFrames");
  var spriteFrame = spriteFrames[digit];
  if (!spriteFrame) {
    throw new Error(description + " missing digit sprite `" + digit + "`.");
  }
  return spriteFrame;
}

function collectExistingDigitNodes(levelNumberNode) {
  if (!Array.isArray(levelNumberNode.children)) {
    throw new Error(levelNumberNode.name + " children must be an array.");
  }
  var nodes = {};
  levelNumberNode.children.forEach(function (child) {
    if (child.name.indexOf(LEVEL_NUMBER_DIGIT_NODE_PREFIX) !== 0) {
      throw new Error("Unexpected child under floating map level number node: " + child.name);
    }
    nodes[child.name] = child;
  });
  return nodes;
}

function getOrCreateDigitNode(levelNumberNode, existingNodes, digitIndex) {
  var name = LEVEL_NUMBER_DIGIT_NODE_PREFIX + digitIndex;
  var digitNode = existingNodes[name];
  if (digitNode && digitNode.isValid) {
    return digitNode;
  }
  digitNode = new cc.Node(name);
  digitNode.parent = levelNumberNode;
  digitNode.setAnchorPoint(0.5, 0.5);
  digitNode.addComponent(cc.Sprite);
  existingNodes[name] = digitNode;
  return digitNode;
}

function configureDigitSprite(digitNode, spriteFrame, width, height, x) {
  requireNode(digitNode, "floating map level digit");
  var sprite = digitNode.getComponent(cc.Sprite);
  if (!sprite) {
    sprite = digitNode.addComponent(cc.Sprite);
  }
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  digitNode.active = true;
  digitNode.setContentSize(width, height);
  digitNode.setPosition(x, 0);
}

function configureMapLevelNumber(levelNumberNode, levelId, spriteFrames, description) {
  requireNode(levelNumberNode, description);
  requirePositiveInteger(levelId, description + " levelId");
  requireNoComponent(levelNumberNode, cc.Label, description + " label");
  var rootSprite = requireComponent(levelNumberNode, cc.Sprite, description);
  rootSprite.enabled = false;

  var baseSize = levelNumberNode.getContentSize();
  if (!baseSize || !Number.isFinite(baseSize.height) || baseSize.height <= 0) {
    throw new Error(description + " height must be valid.");
  }
  var digits = String(levelId).split("");
  var digitInfos = digits.map(function (digit) {
    var spriteFrame = requireLevelNumberSpriteFrame(spriteFrames, digit, description);
    var size = requireSpriteFrameSize(spriteFrame, description + "/" + digit);
    var width = size.width * baseSize.height / size.height;
    return {
      digit: digit,
      spriteFrame: spriteFrame,
      width: width,
      height: baseSize.height
    };
  });
  var totalWidth = digitInfos.reduce(function (sum, info) {
    return sum + info.width;
  }, 0);
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
    throw new Error(description + " total digit width must be valid.");
  }

  levelNumberNode.setContentSize(totalWidth, baseSize.height);
  var existingNodes = collectExistingDigitNodes(levelNumberNode);
  var cursorX = -totalWidth / 2;
  digitInfos.forEach(function (info, index) {
    var digitNode = getOrCreateDigitNode(levelNumberNode, existingNodes, index);
    var centerX = cursorX + info.width / 2;
    configureDigitSprite(digitNode, info.spriteFrame, info.width, info.height, centerX);
    cursorX += info.width;
  });

  Object.keys(existingNodes).forEach(function (name) {
    var match = /^digit_(\d+)$/.exec(name);
    if (!match) {
      throw new Error("Invalid floating map level digit node name: " + name);
    }
    var index = Number(match[1]);
    if (!Number.isInteger(index)) {
      throw new Error("Invalid floating map level digit index: " + name);
    }
    if (index >= digitInfos.length) {
      existingNodes[name].active = false;
    }
  });
}

function createRuntimeRoot(mapHostNode) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.createRuntimeRoot");
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

function findRenderedLevelButton(state, levelId) {
  var renderedNodeKeys = Object.keys(state.renderedNodes);
  for (var index = 0; index < renderedNodeKeys.length; index += 1) {
    var islandNode = state.renderedNodes[renderedNodeKeys[index]];
    if (!islandNode || !islandNode.isValid) {
      continue;
    }
    var buttons = collectLevelButtons(islandNode);
    for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 1) {
      if (buttons[buttonIndex].node.__floatingMapLevelId === levelId) {
        return buttons[buttonIndex].node;
      }
    }
  }
  return null;
}

function resolveNodeVerticalBoundsInMapHost(mapHostNode, node) {
  requireNode(node, "Floating map visibility target");
  var size = node.getContentSize();
  if (!size || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error("Floating map visibility target height must be valid.");
  }
  var anchor = node.getAnchorPoint();
  if (!anchor || !Number.isFinite(anchor.y)) {
    throw new Error("Floating map visibility target anchorY must be valid.");
  }
  var centerInMap = mapHostNode.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(0, 0)));
  return {
    bottom: centerInMap.y - anchor.y * size.height,
    top: centerInMap.y + (1 - anchor.y) * size.height
  };
}

function isVerticalRangeVisibleInMapBounds(bounds, targetBottom, targetTop) {
  return targetBottom < bounds.top && targetTop > bounds.bottom;
}

function isLevelVisibleInMapHost(state, levelId) {
  requirePositiveInteger(levelId, "Floating map visibility levelId");
  var buttonNode = findRenderedLevelButton(state, levelId);
  if (buttonNode) {
    var buttonBounds = resolveNodeVerticalBoundsInMapHost(state.mapHostNode, buttonNode);
    return isVerticalRangeVisibleInMapBounds(state.bounds, buttonBounds.bottom, buttonBounds.top);
  }
  var nodeConfig = state.config.nodes[findNodeIndexByLevelId(state.config, levelId)];
  var islandBottom = state.content.y + resolveNodeBottomY(nodeConfig);
  var islandTop = state.content.y + resolveNodeTopY(nodeConfig);
  return isVerticalRangeVisibleInMapBounds(state.bounds, islandBottom, islandTop);
}

function syncBackToCurrentLevelButtonVisibility(state) {
  requireNode(state.backToCurrentLevelButtonNode, "LevelView/back_cur_level");
  state.backToCurrentLevelButtonNode.active = !isLevelVisibleInMapHost(state, state.latestAccessibleLevelId);
}

function getVisibleRange(state) {
  return {
    minY: state.bounds.bottom - state.content.y - MAP_BUFFER_Y,
    maxY: state.bounds.top - state.content.y + MAP_BUFFER_Y
  };
}

function configureButtonLevelNumber(buttonNode, levelId, state) {
  var levelNumberNode = requireChild(buttonNode, "level", buttonNode.name);
  configureMapLevelNumber(levelNumberNode, levelId, state.assets.levelNumberSpriteFrames, buttonNode.name + "/level");
  levelNumberNode.active = buttonNode.__floatingMapUnlocked === true;
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

function bindLevelTapNode(tapNode, state) {
  requireNode(tapNode, "floating map level tap node");
  tapNode.__floatingMapState = state;
  if (tapNode.__floatingMapTapBound === true) {
    return;
  }
  tapNode.__floatingMapTapBound = true;
  tapNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    var buttonState = tapNode.__floatingMapState;
    if (!buttonState || buttonState.dragConsumed === true) {
      return;
    }
    if (tapNode.__floatingMapUnlocked !== true) {
      return;
    }
    var levelId = tapNode.__floatingMapLevelId;
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("Floating map tap node level id is invalid.");
    }
    buttonState.onLevelSelectTap(levelId);
  });
}

function bindLevelButton(buttonNode, state) {
  bindLevelTapNode(buttonNode, state);
}

function removeProtagonistFromIsland(islandNode) {
  requireNode(islandNode, "protagonist island");
  var existingNode = islandNode.getChildByName(PROTAGONIST_NODE_NAME);
  if (existingNode && existingNode.isValid) {
    existingNode.destroy();
  }
}

function attachProtagonist(buttonNode, state) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.createProtagonist");
  requireNode(buttonNode, "protagonist level button");
  var islandNode = buttonNode.parent;
  requireNode(islandNode, "protagonist island parent");
  removeProtagonistFromIsland(islandNode);
  var protagonistNode = new cc.Node(PROTAGONIST_NODE_NAME);
  protagonistNode.parent = islandNode;
  var localPosition = islandNode.convertToNodeSpaceAR(
    buttonNode.convertToWorldSpaceAR(cc.v2(0, PROTAGONIST_Y))
  );
  protagonistNode.setPosition(localPosition.x, localPosition.y);
  protagonistNode.setContentSize(PROTAGONIST_WIDTH, PROTAGONIST_HEIGHT);
  protagonistNode.zIndex = PROTAGONIST_Z_INDEX;
  var sprite = protagonistNode.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = state.assets.protagonistSpriteFrame;
  protagonistNode.setContentSize(PROTAGONIST_WIDTH, PROTAGONIST_HEIGHT);
  protagonistNode.__floatingMapLevelId = buttonNode.__floatingMapLevelId;
  protagonistNode.__floatingMapUnlocked = buttonNode.__floatingMapUnlocked;
  if (!Number.isInteger(protagonistNode.__floatingMapLevelId) || protagonistNode.__floatingMapLevelId <= 0) {
    throw new Error("Floating map protagonist level id is invalid.");
  }
  if (typeof protagonistNode.__floatingMapUnlocked !== "boolean") {
    throw new Error("Floating map protagonist unlock state must be boolean.");
  }
  bindLevelTapNode(protagonistNode, state);
}

function syncIslandProtagonist(islandNode, nodeConfig, state) {
  removeProtagonistFromIsland(islandNode);
  var buttons = collectLevelButtons(islandNode);
  buttons.forEach(function (button, index) {
    if (nodeConfig.levelIds[index] === state.latestAccessibleLevelId) {
      attachProtagonist(button.node, state);
    }
  });
}

function configureLevelButton(buttonNode, levelId, state) {
  var isUnlocked = levelId <= state.highestUnlocked;
  var isCompleted = state.isLevelCompleted(levelId);
  var starCount = state.getLevelStarCount(levelId);
  buttonNode.__floatingMapLevelId = levelId;
  buttonNode.__floatingMapUnlocked = isUnlocked;
  configureButtonLevelNumber(buttonNode, levelId, state);
  configureButtonLock(buttonNode, isUnlocked);
  configureButtonStars(buttonNode, starCount, isCompleted);
  bindLevelButton(buttonNode, state);
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
  LevelSelectMemoryDiagnostics.increment("floatingMap.createTeleportArray");
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

function configureRescueSpirit(islandNode, nodeConfig, state) {
  if (nodeConfig.prefab !== RESCUE_LANDMARK_PREFAB_NAME) {
    if (Object.prototype.hasOwnProperty.call(nodeConfig, "rescueSpiritId")) {
      throw new Error("Only landmark1 may configure rescueSpiritId: " + nodeConfig.index);
    }
    return;
  }
  AssistSpiritConfig.getSpirit(nodeConfig.rescueSpiritId);
  var spriteFrame = state.assets.trappedSpiritSpriteFrames[nodeConfig.rescueSpiritId];
  if (!spriteFrame) {
    throw new Error("Floating map trapped spirit SpriteFrame is missing: " + nodeConfig.rescueSpiritId);
  }
  var cageBaseNode = requireChild(islandNode, "cage_base", nodeConfig.prefab);
  var spiritNode = requireChild(cageBaseNode, "spirit", nodeConfig.prefab + "/cage_base");
  var sprite = requireComponent(spiritNode, cc.Sprite, nodeConfig.prefab + "/cage_base/spirit");
  sprite.spriteFrame = spriteFrame;
  sprite.trim = false;
  sprite.sizeMode = cc.Sprite.SizeMode.RAW;
}

function markIslandConfigured(islandNode, state) {
  islandNode.__floatingMapConfiguredRevision = state.islandDataRevision;
}

function configureIslandNodeIfStale(islandNode, nodeConfig, state) {
  if (islandNode.__floatingMapConfiguredRevision === state.islandDataRevision) {
    return;
  }
  configureIslandNode(islandNode, nodeConfig, state);
  markIslandConfigured(islandNode, state);
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
  syncIslandProtagonist(islandNode, nodeConfig, state);
  if (nodeConfig.type === "normal") {
    configureNormalTeleport(islandNode, nodeConfig, state);
    return;
  }
  configureRescueSpirit(islandNode, nodeConfig, state);
  configureSpecialDoor(islandNode, nodeConfig, state);
}

function createIslandNode(state, nodeConfig) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.createIsland:" + nodeConfig.prefab);
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
  markIslandConfigured(islandNode, state);
  return islandNode;
}

function refreshConfiguredIslands(state) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.refreshConfiguredIslands");
  state.islandDataRevision += 1;
  state.config.nodes.forEach(function (nodeConfig) {
    var islandNode = state.renderedNodes[String(nodeConfig.index)];
    if (!islandNode || !islandNode.isValid) {
      return;
    }
    configureIslandNodeIfStale(islandNode, nodeConfig, state);
  });
  syncBackToCurrentLevelButtonVisibility(state);
}

function findFirstVisibleNodeIndex(nodes, minY) {
  var left = 0;
  var right = nodes.length - 1;
  var result = nodes.length;
  while (left <= right) {
    var mid = (left + right) >> 1;
    var nodeTopY = resolveNodeTopY(nodes[mid]);
    if (nodeTopY >= minY) {
      result = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return result;
}

function findLastVisibleNodeIndex(nodes, maxY) {
  var left = 0;
  var right = nodes.length - 1;
  var result = -1;
  while (left <= right) {
    var mid = (left + right) >> 1;
    var nodeBottomY = resolveNodeBottomY(nodes[mid]);
    if (nodeBottomY <= maxY) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result;
}

function resolveVisibleNodeIndexRange(state) {
  var range = getVisibleRange(state);
  var nodes = state.config.nodes;
  return {
    firstIndex: findFirstVisibleNodeIndex(nodes, range.minY),
    lastIndex: findLastVisibleNodeIndex(nodes, range.maxY)
  };
}

function resolveRetainIndexRange(visibleIndexes, nodeCount, retainBuffer) {
  requireNonNegativeInteger(retainBuffer, "resolveRetainIndexRange retainBuffer");
  return {
    firstIndex: Math.max(0, visibleIndexes.firstIndex - retainBuffer),
    lastIndex: Math.min(nodeCount - 1, visibleIndexes.lastIndex + retainBuffer)
  };
}

function getRenderedNodeRangeKey(visibleIndexes, nodeCount, retainBuffer) {
  var retainIndexes = resolveRetainIndexRange(visibleIndexes, nodeCount, retainBuffer);
  return retainIndexes.firstIndex + ":" + retainIndexes.lastIndex;
}

function isScrollInteractionActive(state) {
  return state.dragTracking === true || state.inertiaTimer !== null || state.scrollAnimTimer !== null;
}

function resolveActiveRetainNodeBuffer(state) {
  if (isScrollInteractionActive(state)) {
    return SCROLL_RETAIN_NODE_BUFFER;
  }
  return RENDERED_NODE_RETAIN_NODE_BUFFER;
}

function mergePendingPrefetchPrefabNames(state, prefabNames) {
  if (!state.pendingPrefetchPrefabNames || typeof state.pendingPrefetchPrefabNames !== "object") {
    state.pendingPrefetchPrefabNames = {};
  }
  prefabNames.forEach(function (prefabName) {
    state.pendingPrefetchPrefabNames[prefabName] = true;
  });
}

function mergePendingPrefetchTrappedSpiritIds(state, spiritIds) {
  if (!state.pendingPrefetchTrappedSpiritIds || typeof state.pendingPrefetchTrappedSpiritIds !== "object") {
    state.pendingPrefetchTrappedSpiritIds = {};
  }
  spiritIds.forEach(function (spiritId) {
    state.pendingPrefetchTrappedSpiritIds[spiritId] = true;
  });
}

function drainPendingPrefetchPrefabNames(state) {
  if (!state.pendingPrefetchPrefabNames || typeof state.pendingPrefetchPrefabNames !== "object") {
    return [];
  }

  var pendingNames = Object.keys(state.pendingPrefetchPrefabNames).filter(function (prefabName) {
    return !state.assets.prefabs[prefabName];
  });
  state.pendingPrefetchPrefabNames = {};
  return pendingNames;
}

function drainPendingPrefetchTrappedSpiritIds(state) {
  if (!state.pendingPrefetchTrappedSpiritIds || typeof state.pendingPrefetchTrappedSpiritIds !== "object") {
    return [];
  }

  var pendingIds = Object.keys(state.pendingPrefetchTrappedSpiritIds).filter(function (spiritId) {
    return !state.assets.trappedSpiritSpriteFrames[spiritId];
  });
  state.pendingPrefetchTrappedSpiritIds = {};
  return pendingIds;
}

function reportMapPrefabPrefetchError(error) {
  var detail = error && error.stack ? error.stack : error;
  if (typeof cc !== "undefined" && cc && typeof cc.error === "function") {
    cc.error("[LevelSelectFloatingMap] Map prefab prefetch failed", detail);
    return;
  }
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[LevelSelectFloatingMap] Map prefab prefetch failed", detail);
  }
}

function runMapPrefabPrefetch(state) {
  if (isRuntimeDisposed(state)) {
    state.prefabPrefetchPromise = null;
    return Promise.resolve(null);
  }

  var pendingNames = drainPendingPrefetchPrefabNames(state);
  var pendingSpiritIds = drainPendingPrefetchTrappedSpiritIds(state);
  if (pendingNames.length === 0 && pendingSpiritIds.length === 0) {
    state.prefabPrefetchPromise = null;
    if (!isRuntimeDisposed(state) && state.content && state.content.isValid) {
      syncVisibleNodesWithPrefetch(state);
    }
    return Promise.resolve(null);
  }

  return Promise.all([
    ensureMapPrefabsLoaded(state.assets, pendingNames),
    ensureMapTrappedSpiritSpriteFramesLoaded(state.assets, pendingSpiritIds)
  ]).then(function () {
    if (isRuntimeDisposed(state)) {
      state.prefabPrefetchPromise = null;
      return null;
    }
    return runMapPrefabPrefetch(state);
  }, function (error) {
    if (isRuntimeDisposed(state)) {
      state.prefabPrefetchPromise = null;
      return null;
    }
    throw error;
  });
}

function syncVisibleNodesWithPrefetch(state) {
  if (isRuntimeDisposed(state)) {
    return;
  }

  var visibleIndexes = resolveVisibleNodeIndexRange(state);
  var retainBuffer = resolveActiveRetainNodeBuffer(state);
  var renderedRangeKey = getRenderedNodeRangeKey(visibleIndexes, state.config.nodes.length, retainBuffer);
  if (state.renderedVisibleRangeKey === renderedRangeKey) {
    return;
  }

  var requiredPrefabNames = collectRequiredPrefabNames(state);
  var missingPrefabNames = requiredPrefabNames.filter(function (prefabName) {
    return !state.assets.prefabs[prefabName];
  });
  var requiredTrappedSpiritIds = collectRequiredTrappedSpiritIds(state);
  var missingTrappedSpiritIds = requiredTrappedSpiritIds.filter(function (spiritId) {
    return !state.assets.trappedSpiritSpriteFrames[spiritId];
  });
  if (missingPrefabNames.length > 0 || missingTrappedSpiritIds.length > 0) {
    mergePendingPrefetchPrefabNames(state, missingPrefabNames);
    mergePendingPrefetchTrappedSpiritIds(state, missingTrappedSpiritIds);
    if (!state.prefabPrefetchPromise) {
      state.prefabPrefetchPromise = runMapPrefabPrefetch(state).catch(function (error) {
        state.prefabPrefetchPromise = null;
        if (isRuntimeDisposed(state)) {
          return null;
        }
        reportMapPrefabPrefetchError(error);
        throw error;
      });
    }
    return;
  }

  renderVisibleNodes(state);
}

function renderVisibleNodes(state) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.renderVisibleNodes");
  var retainedRenderedIndexes = {};
  var nodes = state.config.nodes;
  var visibleIndexes = resolveVisibleNodeIndexRange(state);
  var firstIndex = visibleIndexes.firstIndex;
  var lastIndex = visibleIndexes.lastIndex;
  var retainBuffer = resolveActiveRetainNodeBuffer(state);
  var deferCleanup = isScrollInteractionActive(state);
  if (firstIndex > lastIndex) {
    if (!deferCleanup) {
      Object.keys(state.renderedNodes).forEach(function (key) {
        var node = state.renderedNodes[key];
        if (node && node.isValid) {
          LevelSelectMemoryDiagnostics.increment("floatingMap.destroyIsland");
          node.destroy();
        }
        delete state.renderedNodes[key];
      });
    }
    state.renderedVisibleRangeKey = getRenderedNodeRangeKey(visibleIndexes, nodes.length, retainBuffer);
    return;
  }

  var retainIndexes = resolveRetainIndexRange(visibleIndexes, nodes.length, retainBuffer);
  var firstRetainIndex = retainIndexes.firstIndex;
  var lastRetainIndex = retainIndexes.lastIndex;
  for (var retainIndex = firstRetainIndex; retainIndex <= lastRetainIndex; retainIndex += 1) {
    retainedRenderedIndexes[String(nodes[retainIndex].index)] = true;
  }

  var deferredPrefabNames = {};
  for (var index = firstIndex; index <= lastIndex; index += 1) {
    var nodeConfig = nodes[index];
    if (!state.assets.prefabs[nodeConfig.prefab]) {
      deferredPrefabNames[nodeConfig.prefab] = true;
      continue;
    }
    var nodeKey = String(nodeConfig.index);
    if (!state.renderedNodes[nodeKey] || !state.renderedNodes[nodeKey].isValid) {
      state.renderedNodes[nodeKey] = createIslandNode(state, nodeConfig);
    } else {
      configureIslandNodeIfStale(state.renderedNodes[nodeKey], nodeConfig, state);
    }
  }

  var deferredNames = Object.keys(deferredPrefabNames);
  if (deferredNames.length > 0) {
    mergePendingPrefetchPrefabNames(state, deferredNames);
    if (!state.prefabPrefetchPromise) {
      state.prefabPrefetchPromise = runMapPrefabPrefetch(state).catch(function (error) {
        state.prefabPrefetchPromise = null;
        if (isRuntimeDisposed(state)) {
          return null;
        }
        reportMapPrefabPrefetchError(error);
        throw error;
      });
    }
  }

  if (!deferCleanup) {
    Object.keys(state.renderedNodes).forEach(function (key) {
      if (retainedRenderedIndexes[key] === true) {
        return;
      }
      var node = state.renderedNodes[key];
      if (node && node.isValid) {
        LevelSelectMemoryDiagnostics.increment("floatingMap.destroyIsland");
        node.destroy();
      }
      delete state.renderedNodes[key];
    });

    evictMapPrefabsOutsideRetainSet(state.assets, collectRetainedPrefabNames(state));
  }
  state.renderedVisibleRangeKey = getRenderedNodeRangeKey(visibleIndexes, nodes.length, retainBuffer);
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

function applyScrollPosition(state, deltaY) {
  var currentY = state.content.y;
  var nextY = clampContentY(state, currentY + deltaY);
  var appliedDeltaY = nextY - currentY;
  if (appliedDeltaY === 0) {
    return 0;
  }
  state.content.y = nextY;
  moveBackground(state, appliedDeltaY);
  return appliedDeltaY;
}

function clearScrollVisibilitySync(state) {
  if (!state) {
    return;
  }
  state.scrollVisibilitySyncScheduled = false;
  clearScheduledTick(state, "scrollVisibilitySyncTick");
}

function finalizeScrollVisibility(state) {
  clearScrollVisibilitySync(state);
  state.renderedVisibleRangeKey = null;
  syncVisibleNodesWithPrefetch(state);
}

function requestScrollVisibilitySync(state) {
  if (state.scrollVisibilitySyncScheduled === true) {
    return;
  }
  state.scrollVisibilitySyncScheduled = true;
  state.scrollVisibilitySyncTick = function () {
    state.scrollVisibilitySyncScheduled = false;
    state.scrollVisibilitySyncTick = null;
    if (!state.content || !state.content.isValid) {
      return;
    }
    syncVisibleNodesWithPrefetch(state);
  };
  scheduleFloatingMapTickOnce(
    state,
    "scrollVisibilitySyncTick",
    state.scrollVisibilitySyncTick,
    "Floating map visibility sync"
  );
}

function applyContentDelta(state, deltaY) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.applyContentDelta");
  if (applyScrollPosition(state, deltaY) === 0) {
    return;
  }
  requestScrollVisibilitySync(state);
  state.scrollFrameCounter = (state.scrollFrameCounter || 0) + 1;
  if (state.scrollFrameCounter >= BACK_BUTTON_SYNC_SCROLL_INTERVAL) {
    state.scrollFrameCounter = 0;
    syncBackToCurrentLevelButtonVisibility(state);
  }
}

function easeOutCubic(progress) {
  var remaining = 1 - progress;
  return 1 - remaining * remaining * remaining;
}

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

function requireScheduleTarget(state, description) {
  if (!state || !state.content || !state.content.isValid) {
    throw new Error(description + " requires valid floating map content node.");
  }
  return state.content;
}

function scheduleFloatingMapTick(state, tickPropertyName, tick, description) {
  var scheduler = requireDirectorScheduler(description);
  var target = requireScheduleTarget(state, description);
  scheduler.schedule(tick, target, INERTIA_FRAME_SECONDS, INERTIA_SCHEDULE_REPEAT, 0, false);
  state[tickPropertyName] = tick;
}

function scheduleFloatingMapTickOnce(state, tickPropertyName, tick, description) {
  var scheduler = requireDirectorScheduler(description);
  var target = requireScheduleTarget(state, description);
  scheduler.schedule(tick, target, INERTIA_FRAME_SECONDS, SCHEDULE_ONCE_REPEAT, 0, false);
  state[tickPropertyName] = tick;
}

function clearScheduledTick(state, tickPropertyName) {
  if (!state || !state[tickPropertyName]) {
    return;
  }
  var tick = state[tickPropertyName];
  state[tickPropertyName] = null;
  if (!state.content) {
    return;
  }
  var scheduler = requireDirectorScheduler("Floating map tick cleanup");
  scheduler.unschedule(tick, state.content);
}

function stopScrollAnimation(state) {
  if (state.scrollAnimTimer) {
    LevelSelectMemoryDiagnostics.increment("floatingMap.stopScrollAnimation");
    clearScheduledTick(state, "scrollAnimTimer");
  }
}

function stopInertia(state, options) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.stopInertia");
  var skipFinalize = options && options.skipFinalize === true;
  stopScrollAnimation(state);
  if (state.inertiaTimer) {
    LevelSelectMemoryDiagnostics.increment("floatingMap.stopInertiaTimer");
    clearScheduledTick(state, "inertiaTimer");
  }
  clearScrollVisibilitySync(state);
  state.inertiaVelocityY = 0;
  state.scrollFrameCounter = 0;
  if (!skipFinalize) {
    finalizeScrollVisibility(state);
  }
  syncBackToCurrentLevelButtonVisibility(state);
}

function requireFloatingMapState(mapHostNode) {
  requireNode(mapHostNode, "LevelView/map");
  var state = mapHostNode.__floatingMapState;
  if (!state || !state.content || !state.content.isValid) {
    throw new Error("Floating map runtime state is required before scrolling.");
  }
  return state;
}

function scrollToLevel(mapHostNode, levelId, options) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.scrollToLevel");
  requireObject(options || {}, "Floating map scroll options");
  var state = requireFloatingMapState(mapHostNode);
  requirePositiveInteger(levelId, "scrollToLevel levelId");
  stopInertia(state);

  var targetY = resolveInitialContentY(state, levelId);
  var startY = state.content.y;
  if (Math.abs(targetY - startY) < 0.5) {
    syncVisibleNodesWithPrefetch(state);
    syncBackToCurrentLevelButtonVisibility(state);
    if (typeof options.onComplete === "function") {
      options.onComplete();
    }
    return;
  }

  var elapsed = 0;
  state.scrollAnimTimer = function () {
    LevelSelectMemoryDiagnostics.increment("floatingMap.scrollTimerTick");
    if (!state.content || !state.content.isValid) {
      stopScrollAnimation(state);
      return;
    }

    elapsed += INERTIA_FRAME_SECONDS;
    var progress = Math.min(1, elapsed / SCROLL_TO_LEVEL_DURATION);
    var easedProgress = easeOutCubic(progress);
    var desiredY = startY + (targetY - startY) * easedProgress;
    var deltaY = desiredY - state.content.y;
    if (deltaY !== 0) {
      applyContentDelta(state, deltaY);
    }
    if (progress >= 1) {
      stopScrollAnimation(state);
      state.scrollFrameCounter = 0;
      finalizeScrollVisibility(state);
      syncBackToCurrentLevelButtonVisibility(state);
      if (typeof options.onComplete === "function") {
        options.onComplete();
      }
    }
  };
  scheduleFloatingMapTick(state, "scrollAnimTimer", state.scrollAnimTimer, "Floating map scroll animation");
}

function startInertia(state) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.startInertia");
  stopInertia(state, { skipFinalize: true });
  var velocityY = state.dragVelocityY;
  if (!Number.isFinite(velocityY) || Math.abs(velocityY) < INERTIA_MIN_VELOCITY) {
    finalizeScrollVisibility(state);
    syncBackToCurrentLevelButtonVisibility(state);
    return;
  }
  state.inertiaVelocityY = velocityY;
  state.inertiaTimer = function () {
    LevelSelectMemoryDiagnostics.increment("floatingMap.inertiaTimerTick");
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
  };
  scheduleFloatingMapTick(state, "inertiaTimer", state.inertiaTimer, "Floating map inertia");
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
  if (!options.assets.mapBundle || typeof options.assets.mapBundle.load !== "function") {
    throw new Error("Floating map assets.mapBundle is required.");
  }
  if (!options.assets.protagonistSpriteFrame) {
    throw new Error("Floating map protagonist sprite frame is required.");
  }
  requireObject(options.assets.levelNumberSpriteFrames, "Floating map level number sprite frames");
  requireObject(options.assets.trappedSpiritSpriteFrames, "Floating map trapped spirit sprite frames");
  LEVEL_NUMBER_DIGITS.forEach(function (digit) {
    if (!options.assets.levelNumberSpriteFrames[digit]) {
      throw new Error("Floating map level number sprite frame is required: " + digit);
    }
  });
  requirePositiveInteger(options.highestUnlocked, "highestUnlocked");
  requirePositiveInteger(options.focusLevelId, "focusLevelId");
  if (typeof options.getLevelStarCount !== "function") {
    throw new Error("Floating map requires getLevelStarCount.");
  }
  if (typeof options.isLevelCompleted !== "function") {
    throw new Error("Floating map requires isLevelCompleted.");
  }
  if (typeof options.onLevelSelectTap !== "function") {
    throw new Error("Floating map requires onLevelSelectTap.");
  }
  requireNode(options.backToCurrentLevelButtonNode, "LevelView/back_cur_level");
}

function render(options) {
  LevelSelectMemoryDiagnostics.increment("floatingMap.render");
  requireRenderOptions(options);
  var mapHostNode = options.mapHostNode;
  var backgroundNode = requireChild(mapHostNode, "bg", "LevelView/map");
  backgroundNode.y = clampBackgroundY(mapHostNode, backgroundNode, backgroundNode.y);
  destroyExistingRuntimeRoot(mapHostNode);
  var runtimeNodes = createRuntimeRoot(mapHostNode);
  var config = options.assets.config;
  var bounds = resolveHostBounds(mapHostNode);
  var latestAccessibleLevelId = resolveLatestAccessibleLevelId(config, options.highestUnlocked);
  var focusLevelId = requirePositiveInteger(options.focusLevelId, "focusLevelId");
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
    maxContentY: bounds.bottom - resolveNodeBottomY(firstNode) + FIRST_ISLAND_BOTTOM_SCROLL_PADDING,
    minContentY: bounds.top - resolveNodeTopY(lastNode),
    latestAccessibleLevelId: latestAccessibleLevelId,
    highestUnlocked: options.highestUnlocked,
    getLevelStarCount: options.getLevelStarCount,
    isLevelCompleted: options.isLevelCompleted,
    onLevelSelectTap: options.onLevelSelectTap,
    backToCurrentLevelButtonNode: options.backToCurrentLevelButtonNode,
    renderedNodes: {},
    renderedVisibleRangeKey: null,
    islandDataRevision: 0,
    scrollFrameCounter: 0,
    scrollVisibilitySyncScheduled: false,
    scrollVisibilitySyncTick: null,
    disposed: false,
    dragTracking: false,
    dragConsumed: false,
    lastTouchY: 0,
    lastTouchTime: 0,
    dragVelocityY: 0,
    inertiaVelocityY: 0,
    inertiaTimer: null,
    prefabPrefetchPromise: null,
    pendingPrefetchPrefabNames: {},
    pendingPrefetchTrappedSpiritIds: {}
  };
  runtimeNodes.content.y = resolveInitialContentY(state, focusLevelId);
  mapHostNode.__floatingMapState = state;
  bindTouch(mapHostNode, state);
  syncVisibleNodesWithPrefetch(state);
  syncBackToCurrentLevelButtonVisibility(state);
  return {
    nodeCount: config.nodes.length,
    currentNodeIndex: findNodeIndexByLevelId(config, focusLevelId),
    targetLevelCount: config.targetLevelCount
  };
}

function refreshIslandProgress(mapHostNode, options) {
  requireObject(options || {}, "Floating map refresh options");
  var state = requireFloatingMapState(mapHostNode);
  if (typeof options.highestUnlocked === "number") {
    requirePositiveInteger(options.highestUnlocked, "highestUnlocked");
    state.highestUnlocked = options.highestUnlocked;
    state.latestAccessibleLevelId = resolveLatestAccessibleLevelId(state.config, options.highestUnlocked);
  }
  if (typeof options.getLevelStarCount === "function") {
    state.getLevelStarCount = options.getLevelStarCount;
  }
  if (typeof options.isLevelCompleted === "function") {
    state.isLevelCompleted = options.isLevelCompleted;
  }
  refreshConfiguredIslands(state);
}

module.exports = {
  loadAssets: loadAssets,
  render: render,
  scrollToLevel: scrollToLevel,
  refreshIslandProgress: refreshIslandProgress,
  disposeRuntime: disposeRuntime,
  releaseAllCachedMapPrefabs: releaseAllCachedMapPrefabs,
  invalidateAssetCache: invalidateAssetCache,
  resolveLatestAccessibleLevelId: resolveLatestAccessibleLevelId
};
