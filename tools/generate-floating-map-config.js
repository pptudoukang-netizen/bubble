"use strict";

var fs = require("fs");
var path = require("path");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var MAP_ROOT = path.join(PROJECT_ROOT, "assets", "map");
var CONFIG_DIR = path.join(MAP_ROOT, "config");
var CONFIG_PATH = path.join(CONFIG_DIR, "floating_map.json");
var VERTICAL_PADDING = 10;
var RESCUE_LANDMARK_PREFAB = "landmark1";
var TRAPPED_SPIRIT_IMAGE_DIR = path.join(MAP_ROOT, "image", "trapped_spirit");
var NON_RESCUE_LANDMARK_PREFABS = ["landmark2", "landmark3", "landmark4", "landmark5"];
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
var NORMAL_PREFABS_BY_CAPACITY = {
  3: ["island1"],
  4: ["island2", "island3", "island4"],
  5: ["island5"],
  6: ["island6", "island7", "island8"]
};
var NORMAL_CAPACITY_PRIORITY = [6, 5, 4, 3];

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
  requireFile(path.join(MAP_ROOT, "image", "ui", "protagonist.png"));
  Object.keys(NORMAL_ISLAND_CAPACITIES).forEach(function (prefabName) {
    validateNormalPrefab(prefabName, NORMAL_ISLAND_CAPACITIES[prefabName]);
  });
  [RESCUE_LANDMARK_PREFAB].concat(NON_RESCUE_LANDMARK_PREFABS).forEach(validateSpecialPrefab);
  CampaignLevelGenerationConfig.TRAPPED_SPRITE_SPIRIT_IDS.forEach(function (spiritId) {
    var imagePath = path.join(TRAPPED_SPIRIT_IMAGE_DIR, spiritId + ".png");
    requireFile(imagePath);
    requireFile(imagePath + ".meta");
  });
}

function buildNormalCapacityPlan(levelCount) {
  if (!Number.isInteger(levelCount) || levelCount < 0) {
    throw new Error("Normal floating-map level count must be a non-negative integer.");
  }
  var memo = {};
  function solve(remaining) {
    if (remaining === 0) {
      return [];
    }
    if (Object.prototype.hasOwnProperty.call(memo, String(remaining))) {
      return memo[String(remaining)];
    }
    for (var index = 0; index < NORMAL_CAPACITY_PRIORITY.length; index += 1) {
      var capacity = NORMAL_CAPACITY_PRIORITY[index];
      if (capacity > remaining) {
        continue;
      }
      var tail = solve(remaining - capacity);
      if (tail) {
        memo[String(remaining)] = [capacity].concat(tail);
        return memo[String(remaining)];
      }
    }
    memo[String(remaining)] = null;
    return null;
  }
  var plan = solve(levelCount);
  return plan;
}

function takeNormalPrefab(capacity, cursors) {
  var prefabs = NORMAL_PREFABS_BY_CAPACITY[String(capacity)];
  if (!Array.isArray(prefabs) || prefabs.length === 0) {
    throw new Error("Normal floating-map prefab capacity is unsupported: " + capacity);
  }
  var cursor = cursors[String(capacity)];
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("Normal floating-map prefab cursor is invalid for capacity " + capacity + ".");
  }
  var prefabName = prefabs[cursor % prefabs.length];
  cursors[String(capacity)] = cursor + 1;
  return prefabName;
}

function makeNode(index, type, prefab, capacity, levelIds, metrics, y, rescueSpiritId) {
  var node = {
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
  if (rescueSpiritId !== undefined) {
    node.rescueSpiritId = rescueSpiritId;
  }
  return node;
}

function buildConfig(targetLevelCount) {
  if (targetLevelCount !== CampaignLevelGenerationConfig.TARGET_LEVEL_COUNT) {
    throw new Error(
      "Floating-map target must match campaign target " +
      CampaignLevelGenerationConfig.TARGET_LEVEL_COUNT +
      ", got " + targetLevelCount + "."
    );
  }

  var rescueLevelIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.slice();
  var rescueLookup = {};
  rescueLevelIds.forEach(function (levelId) {
    rescueLookup[String(levelId)] = true;
  });
  var nodes = [];
  var nodeIndex = 0;
  var nextBottomY = 0;
  var pendingNormalLevelIds = [];
  var normalPrefabCursors = {
    3: 0,
    4: 0,
    5: 0,
    6: 0
  };
  var nonRescueLandmarkCursor = 0;

  function appendNode(type, prefabName, levelIds, rescueSpiritId) {
    var metrics = readPrefabRootMetrics(prefabName);
    nodes.push(makeNode(
      nodeIndex,
      type,
      prefabName,
      levelIds.length,
      levelIds,
      metrics,
      nextBottomY + metrics.anchorY * metrics.height,
      rescueSpiritId
    ));
    nextBottomY += metrics.height + VERTICAL_PADDING * 2;
    nodeIndex += 1;
  }

  function flushNormalLevels() {
    var capacityPlan = buildNormalCapacityPlan(pendingNormalLevelIds.length);
    if (!capacityPlan) {
      if (pendingNormalLevelIds.length > 2) {
        throw new Error(
          "Normal floating-map run cannot be represented by island capacities: " +
          pendingNormalLevelIds.length
        );
      }
      pendingNormalLevelIds.forEach(function (levelId) {
        var prefabName = NON_RESCUE_LANDMARK_PREFABS[
          nonRescueLandmarkCursor % NON_RESCUE_LANDMARK_PREFABS.length
        ];
        nonRescueLandmarkCursor += 1;
        appendNode("special", prefabName, [levelId]);
      });
      pendingNormalLevelIds = [];
      return;
    }
    var offset = 0;
    capacityPlan.forEach(function (capacity) {
      var prefabName = takeNormalPrefab(capacity, normalPrefabCursors);
      var levelIds = pendingNormalLevelIds.slice(offset, offset + capacity);
      if (levelIds.length !== capacity) {
        throw new Error("Normal floating-map capacity plan overflow at level " + pendingNormalLevelIds[offset] + ".");
      }
      appendNode("normal", prefabName, levelIds);
      offset += capacity;
    });
    if (offset !== pendingNormalLevelIds.length) {
      throw new Error("Normal floating-map capacity plan did not consume the full run.");
    }
    pendingNormalLevelIds = [];
  }

  for (var levelId = 1; levelId <= targetLevelCount; levelId += 1) {
    if (rescueLookup[String(levelId)] === true) {
      flushNormalLevels();
      appendNode(
        "special",
        RESCUE_LANDMARK_PREFAB,
        [levelId],
        CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId)
      );
      continue;
    }
    pendingNormalLevelIds.push(levelId);
  }
  flushNormalLevels();

  return {
    schemaVersion: 3,
    targetLevelCount: targetLevelCount,
    rescueLevelIds: rescueLevelIds,
    verticalPadding: VERTICAL_PADDING,
    normalIslandCapacities: NORMAL_ISLAND_CAPACITIES,
    nodes: nodes
  };
}

function validateGeneratedConfig(config) {
  var seen = {};
  var rescueLookup = {};
  var expectedLevelId = 1;
  if (config.schemaVersion !== 3) {
    throw new Error("Generated floating-map schemaVersion must be 3.");
  }
  if (!Array.isArray(config.rescueLevelIds) || config.rescueLevelIds.length === 0) {
    throw new Error("Generated floating-map rescueLevelIds must be non-empty.");
  }
  if (
    config.rescueLevelIds.join(",") !==
    CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.join(",")
  ) {
    throw new Error("Generated floating-map rescue schedule mismatches campaign configuration.");
  }
  config.rescueLevelIds.forEach(function (levelId) {
    rescueLookup[String(levelId)] = true;
  });
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
      if (levelId !== expectedLevelId) {
        throw new Error("Floating-map level order mismatch: expected " + expectedLevelId + ", got " + levelId + ".");
      }
      var rescue = rescueLookup[String(levelId)] === true;
      var hasRescueSpiritId = Object.prototype.hasOwnProperty.call(node, "rescueSpiritId");
      if (rescue) {
        var expectedSpiritId = CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId);
        if (node.rescueSpiritId !== expectedSpiritId) {
          throw new Error(
            "Rescue floating-map spirit mismatch at level " + levelId +
            ": expected " + expectedSpiritId + ", got " + node.rescueSpiritId + "."
          );
        }
      } else if (hasRescueSpiritId) {
        throw new Error("Non-rescue floating-map node must not configure rescueSpiritId: " + levelId);
      }
      if (node.type === "normal") {
        if (NORMAL_ISLAND_CAPACITIES[node.prefab] !== node.capacity) {
          throw new Error("Normal floating-map prefab capacity mismatch at level " + levelId + ".");
        }
        if (rescue) {
          throw new Error("Rescue level assigned to normal floating island: " + levelId);
        }
      } else if (node.type === "special") {
        if (node.capacity !== 1) {
          throw new Error("Special floating-map node must have capacity 1 at level " + levelId + ".");
        }
        if (rescue && node.prefab !== RESCUE_LANDMARK_PREFAB) {
          throw new Error("Rescue level must use landmark1: " + levelId);
        }
        if (!rescue && node.prefab === RESCUE_LANDMARK_PREFAB) {
          throw new Error("Non-rescue level assigned to landmark1: " + levelId);
        }
        if (
          node.prefab !== RESCUE_LANDMARK_PREFAB &&
          NON_RESCUE_LANDMARK_PREFABS.indexOf(node.prefab) < 0
        ) {
          throw new Error("Unknown special floating-map prefab at level " + levelId + ": " + node.prefab);
        }
      } else {
        throw new Error("Unknown floating-map node type at index " + node.index + ": " + node.type);
      }
      seen[levelId] = true;
      expectedLevelId += 1;
    });
  });
  for (var levelId = 1; levelId <= config.targetLevelCount; levelId += 1) {
    if (seen[levelId] !== true) {
      throw new Error("Missing level id in generated config: " + levelId);
    }
  }
  if (expectedLevelId !== config.targetLevelCount + 1) {
    throw new Error("Generated floating-map level order is incomplete.");
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
