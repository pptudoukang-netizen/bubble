"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var MAP_ROOT = path.join(PROJECT_ROOT, "assets", "map");
var CONFIG_DIR = path.join(MAP_ROOT, "config");
var CONFIG_PATH = path.join(CONFIG_DIR, "floating_map.json");
var SPECIAL_INTERVAL = 20;
var VERTICAL_PADDING = 10;
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
var NORMAL_SEGMENT_PATTERNS = [
  ["island1", "island2", "island6", "island7"],
  ["island3", "island4", "island5", "island8"],
  ["island5", "island1", "island6", "island5"],
  ["island2", "island3", "island4", "island4", "island1"]
];
var LANDMARK_PREFABS = ["landmark1", "landmark2", "landmark3", "landmark4", "landmark5"];

function parseTargetLevelCount(argv) {
  var index = argv.indexOf("--target");
  if (index < 0) {
    throw new Error("--target is required.");
  }
  if (index >= argv.length - 1) {
    throw new Error("--target requires a positive integer.");
  }
  var value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--target must be a positive integer.");
  }
  return value;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Required file is missing: " + path.relative(PROJECT_ROOT, filePath));
  }
}

function getPrefabPath(prefabName) {
  return path.join(MAP_ROOT, "prefabs", prefabName + ".prefab");
}

function getNodeByRef(prefabData, ref, description) {
  if (!ref || !Number.isInteger(ref.__id__)) {
    throw new Error(description + " reference is invalid.");
  }
  var node = prefabData[ref.__id__];
  if (!node || node.__type__ !== "cc.Node") {
    throw new Error(description + " must reference a cc.Node.");
  }
  return node;
}

function getPrefabRootNode(prefabData, prefabName) {
  if (!Array.isArray(prefabData) || prefabData.length < 2) {
    throw new Error("Prefab data is invalid: " + prefabName);
  }
  var root = getNodeByRef(prefabData, prefabData[0].data, prefabName + " root");
  if (root._name !== prefabName) {
    throw new Error("Prefab root name mismatch: " + prefabName + " root is `" + root._name + "`.");
  }
  return root;
}

function readPrefabRootMetrics(prefabName) {
  var prefabPath = getPrefabPath(prefabName);
  requireFile(prefabPath);
  var prefabData = readJsonFile(prefabPath);
  var rootNode = getPrefabRootNode(prefabData, prefabName);
  var size = rootNode._contentSize;
  var anchor = rootNode._anchorPoint;
  if (!size || typeof size.width !== "number" || size.width <= 0 || typeof size.height !== "number" || size.height <= 0) {
    throw new Error(prefabName + " root size must be positive.");
  }
  if (!anchor || typeof anchor.y !== "number" || anchor.y < 0 || anchor.y > 1) {
    throw new Error(prefabName + " root anchorY must be in [0, 1].");
  }
  return {
    width: size.width,
    height: size.height,
    anchorY: anchor.y
  };
}

function getChildren(prefabData, node) {
  if (!Array.isArray(node._children)) {
    throw new Error("Prefab node children must be an array: " + node._name);
  }
  return node._children.map(function (ref) {
    return getNodeByRef(prefabData, ref, "Child of " + node._name);
  });
}

function findDirectChild(prefabData, node, childName) {
  var children = getChildren(prefabData, node);
  for (var index = 0; index < children.length; index += 1) {
    if (children[index]._name === childName) {
      return children[index];
    }
  }
  return null;
}

function collectLevelButtonNames(prefabData, rootNode) {
  return getChildren(prefabData, rootNode).map(function (child) {
    return child._name;
  }).filter(function (name) {
    return /^level_btn\d+$/.test(name);
  }).sort(function (a, b) {
    return Number(a.slice("level_btn".length)) - Number(b.slice("level_btn".length));
  });
}

function requireLevelButtonChildren(prefabData, rootNode, buttonName, prefabName) {
  var buttonNode = findDirectChild(prefabData, rootNode, buttonName);
  if (!buttonNode) {
    throw new Error(prefabName + " missing " + buttonName + ".");
  }
  if (!findDirectChild(prefabData, buttonNode, "level")) {
    throw new Error(prefabName + "/" + buttonName + " missing level.");
  }
  if (!findDirectChild(prefabData, buttonNode, "level_lock")) {
    throw new Error(prefabName + "/" + buttonName + " missing level_lock.");
  }
}

function validateNormalPrefab(prefabName, expectedCapacity) {
  var prefabPath = getPrefabPath(prefabName);
  requireFile(prefabPath);
  var prefabData = readJsonFile(prefabPath);
  var rootNode = getPrefabRootNode(prefabData, prefabName);
  if (!findDirectChild(prefabData, rootNode, "teleport_point")) {
    throw new Error(prefabName + " missing teleport_point.");
  }

  var levelButtonNames = collectLevelButtonNames(prefabData, rootNode);
  if (levelButtonNames.length !== expectedCapacity) {
    throw new Error(prefabName + " level button count must be " + expectedCapacity + ", got " + levelButtonNames.length + ".");
  }
  for (var index = 1; index <= expectedCapacity; index += 1) {
    requireLevelButtonChildren(prefabData, rootNode, "level_btn" + index, prefabName);
  }
}

function validateSpecialPrefab(prefabName) {
  var prefabPath = getPrefabPath(prefabName);
  requireFile(prefabPath);
  var prefabData = readJsonFile(prefabPath);
  var rootNode = getPrefabRootNode(prefabData, prefabName);
  var teleportPointNode = findDirectChild(prefabData, rootNode, "teleport_point");
  if (!teleportPointNode) {
    throw new Error(prefabName + " missing teleport_point.");
  }
  if (!findDirectChild(prefabData, teleportPointNode, "door")) {
    throw new Error(prefabName + " missing teleport_point/door.");
  }
  var levelButtonNames = collectLevelButtonNames(prefabData, rootNode);
  if (levelButtonNames.length !== 1 || levelButtonNames[0] !== "level_btn1") {
    throw new Error(prefabName + " must contain only level_btn1.");
  }
  requireLevelButtonChildren(prefabData, rootNode, "level_btn1", prefabName);
}

function validateMapAssets() {
  requireFile(path.join(PROJECT_ROOT, "assets", "map.meta"));
  requireFile(path.join(MAP_ROOT, "prefabs", "TeleportationArray.prefab"));
  requireFile(path.join(MAP_ROOT, "image", "protagonist.png"));
  Object.keys(NORMAL_ISLAND_CAPACITIES).forEach(function (prefabName) {
    validateNormalPrefab(prefabName, NORMAL_ISLAND_CAPACITIES[prefabName]);
  });
  LANDMARK_PREFABS.forEach(validateSpecialPrefab);
}

function requireSegmentPattern(pattern) {
  var totalCapacity = pattern.reduce(function (total, prefabName) {
    var capacity = NORMAL_ISLAND_CAPACITIES[prefabName];
    if (!Number.isInteger(capacity)) {
      throw new Error("Unknown normal island prefab in pattern: " + prefabName);
    }
    return total + capacity;
  }, 0);
  if (totalCapacity !== SPECIAL_INTERVAL - 1) {
    throw new Error("Normal segment pattern capacity must be " + (SPECIAL_INTERVAL - 1) + ", got " + totalCapacity + ".");
  }
}

function makeLevelIds(startLevelId, capacity) {
  var ids = [];
  for (var offset = 0; offset < capacity; offset += 1) {
    ids.push(startLevelId + offset);
  }
  return ids;
}

function makeNode(index, type, prefab, capacity, levelIds, metrics, y) {
  return {
    index: index,
    type: type,
    prefab: prefab,
    capacity: capacity,
    width: metrics.width,
    height: metrics.height,
    anchorY: metrics.anchorY,
    levelIds: levelIds,
    y: y
  };
}

function buildConfig(targetLevelCount) {
  if (targetLevelCount % SPECIAL_INTERVAL !== 0) {
    throw new Error("Target level count must be divisible by " + SPECIAL_INTERVAL + ".");
  }
  NORMAL_SEGMENT_PATTERNS.forEach(requireSegmentPattern);

  var nodes = [];
  var nodeIndex = 0;
  var nextBottomY = 0;
  var segmentCount = targetLevelCount / SPECIAL_INTERVAL;
  for (var segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    var pattern = NORMAL_SEGMENT_PATTERNS[segmentIndex % NORMAL_SEGMENT_PATTERNS.length];
    var nextLevelId = segmentIndex * SPECIAL_INTERVAL + 1;
    pattern.forEach(function (prefabName) {
      var capacity = NORMAL_ISLAND_CAPACITIES[prefabName];
      var metrics = readPrefabRootMetrics(prefabName);
      nodes.push(makeNode(nodeIndex, "normal", prefabName, capacity, makeLevelIds(nextLevelId, capacity), metrics, nextBottomY + metrics.anchorY * metrics.height));
      nextBottomY += metrics.height + VERTICAL_PADDING * 2;
      nodeIndex += 1;
      nextLevelId += capacity;
    });

    var specialLevelId = (segmentIndex + 1) * SPECIAL_INTERVAL;
    var landmarkPrefab = LANDMARK_PREFABS[segmentIndex % LANDMARK_PREFABS.length];
    var landmarkMetrics = readPrefabRootMetrics(landmarkPrefab);
    nodes.push(makeNode(nodeIndex, "special", landmarkPrefab, 1, [specialLevelId], landmarkMetrics, nextBottomY + landmarkMetrics.anchorY * landmarkMetrics.height));
    nextBottomY += landmarkMetrics.height + VERTICAL_PADDING * 2;
    nodeIndex += 1;
  }

  return {
    schemaVersion: 1,
    targetLevelCount: targetLevelCount,
    specialInterval: SPECIAL_INTERVAL,
    verticalPadding: VERTICAL_PADDING,
    normalIslandCapacities: NORMAL_ISLAND_CAPACITIES,
    nodes: nodes
  };
}

function validateGeneratedConfig(config) {
  var seen = {};
  if (config.nodes.length === 0) {
    throw new Error("Generated floating map config must contain nodes.");
  }
  config.nodes.forEach(function (node, index) {
    if (node.index !== index) {
      throw new Error("Node index must be continuous at " + index + ".");
    }
    if (!Number.isFinite(node.width) || node.width <= 0 || !Number.isFinite(node.height) || node.height <= 0) {
      throw new Error("Node size invalid at index " + node.index + ".");
    }
    if (!Number.isFinite(node.anchorY) || node.anchorY < 0 || node.anchorY > 1) {
      throw new Error("Node anchorY invalid at index " + node.index + ".");
    }
    var expectedBottomY = index === 0
      ? 0
      : config.nodes[index - 1].y + (1 - config.nodes[index - 1].anchorY) * config.nodes[index - 1].height + config.verticalPadding * 2;
    var actualBottomY = node.y - node.anchorY * node.height;
    if (Math.abs(actualBottomY - expectedBottomY) > 0.001) {
      throw new Error("Node vertical spacing mismatch at index " + node.index + ".");
    }
    if (node.capacity !== node.levelIds.length) {
      throw new Error("Node capacity mismatch at index " + node.index + ".");
    }
    node.levelIds.forEach(function (levelId) {
      if (!Number.isInteger(levelId) || levelId <= 0 || levelId > config.targetLevelCount) {
        throw new Error("Invalid level id in node " + node.index + ": " + levelId);
      }
      if (seen[levelId] === true) {
        throw new Error("Duplicated level id: " + levelId);
      }
      if (node.type === "normal" && levelId % config.specialInterval === 0) {
        throw new Error("Special level assigned to normal island: " + levelId);
      }
      if (node.type === "special" && levelId % config.specialInterval !== 0) {
        throw new Error("Non-special level assigned to special island: " + levelId);
      }
      seen[levelId] = true;
    });
  });
  for (var levelId = 1; levelId <= config.targetLevelCount; levelId += 1) {
    if (seen[levelId] !== true) {
      throw new Error("Missing level id in generated config: " + levelId);
    }
  }
}

function writeConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR);
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function main() {
  var targetLevelCount = parseTargetLevelCount(process.argv.slice(2));
  validateMapAssets();
  var config = buildConfig(targetLevelCount);
  validateGeneratedConfig(config);
  writeConfig(config);
  console.log("Generated " + path.relative(PROJECT_ROOT, CONFIG_PATH) + " for " + targetLevelCount + " levels.");
}

main();
