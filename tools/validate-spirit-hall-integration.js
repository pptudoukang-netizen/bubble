"use strict";

var fs = require("fs");
var path = require("path");

var projectRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error("[validate-spirit-hall-integration] " + message);
}

function readText(relativePath) {
  var absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail("Missing file: " + relativePath);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail("Invalid JSON `" + relativePath + "`: " + error.message);
  }
}

function requireContains(text, needle, description) {
  if (text.indexOf(needle) < 0) {
    fail(description + " is missing: " + needle);
  }
}

function resolvePrefabRoot(objects, relativePath) {
  if (!Array.isArray(objects) || objects.length === 0) {
    fail(relativePath + " must contain serialized objects.");
  }
  var prefab = objects.find(function (entry) {
    return entry && entry.__type__ === "cc.Prefab";
  });
  if (!prefab || !prefab.data || !Number.isInteger(prefab.data.__id__)) {
    fail(relativePath + " must contain a cc.Prefab root reference.");
  }
  var root = objects[prefab.data.__id__];
  if (!root || root.__type__ !== "cc.Node") {
    fail(relativePath + " root reference must resolve to cc.Node.");
  }
  return root;
}

function resolveChild(objects, parentNode, childName, description) {
  var matches = parentNode._children.map(function (reference) {
    return objects[reference.__id__];
  }).filter(function (node) {
    return node && node.__type__ === "cc.Node" && node._name === childName;
  });
  if (matches.length !== 1) {
    fail(description + " must contain exactly one `" + childName + "` child.");
  }
  return matches[0];
}

function collectNodes(objects) {
  return objects.filter(function (entry) {
    return entry && entry.__type__ === "cc.Node";
  });
}

function requireNodeByName(nodes, nodeName, description) {
  var matches = nodes.filter(function (node) {
    return node._name === nodeName;
  });
  if (matches.length !== 1) {
    fail(description + " must contain exactly one node named `" + nodeName + "`.");
  }
  return matches[0];
}

function validateLevelViewHierarchy() {
  var relativePath = "assets/map/prefabs/ui/LevelView.prefab";
  var objects = readJson(relativePath);
  var root = resolvePrefabRoot(objects, relativePath);
  var top = resolveChild(objects, root, "top", "LevelView");
  var topLayer = resolveChild(objects, top, "top_layer", "LevelView/top");
  resolveChild(objects, topLayer, "sign_btn", "LevelView/top/top_layer");
  var bottomLayer = resolveChild(objects, root, "bottom_layer", "LevelView");
  resolveChild(objects, bottomLayer, "elven_hall_btn", "LevelView/bottom_layer");
  var obsoleteSign = bottomLayer._children.some(function (reference) {
    var child = objects[reference.__id__];
    return child && child._name === "sign_btn";
  });
  if (obsoleteSign) {
    fail("LevelView/bottom_layer must not retain legacy sign_btn.");
  }
}

function validateSpiritHallPrefab() {
  var relativePath = "assets/spirit_system/prefabs/SpiritHallView.prefab";
  var objects = readJson(relativePath);
  resolvePrefabRoot(objects, relativePath);
  var nodes = collectNodes(objects);
  var nodeNameCounts = {};
  nodes.forEach(function (node) {
    nodeNameCounts[node._name] = (nodeNameCounts[node._name] || 0) + 1;
  });
  Object.keys(nodeNameCounts).forEach(function (nodeName) {
    if (nodeNameCounts[nodeName] !== 1) {
      fail("SpiritHallView node names must be globally unique: " + nodeName);
    }
  });
  [
    "SafeAreaRoot",
    "DesignContent",
    "SpriteRenderLayer",
    "LogicLayer",
    "source__back_button",
    "source__selected_role",
    "proxy__selected_role",
    "source__upgrade_button",
    "source__advance_button",
    "source__battle_button"
  ].forEach(function (nodeName) {
    requireNodeByName(nodes, nodeName, "SpiritHallView");
  });
  requireNodeByName(nodes, "current_probability_stat_value", "SpiritHallView stat value");
  requireNodeByName(nodes, "next_probability_stat_value", "SpiritHallView stat value");
  requireNodeByName(nodes, "current_probability_value", "SpiritHallView detail value");
  requireNodeByName(nodes, "next_probability_value", "SpiritHallView detail value");
  var selectedRoleNode = requireNodeByName(nodes, "proxy__selected_role", "SpiritHallView selected role");
  if (selectedRoleNode._contentSize.width !== 344 || selectedRoleNode._contentSize.height !== 387) {
    fail("SpiritHallView initial selected role must use the Milu source image size.");
  }
  var selectedRoleSprite = selectedRoleNode._components.map(function (reference) {
    return objects[reference.__id__];
  }).find(function (component) {
    return component && component.__type__ === "cc.Sprite";
  });
  if (
    !selectedRoleSprite ||
    selectedRoleSprite._sizeMode !== 2 ||
    selectedRoleSprite._isTrimmedMode !== false
  ) {
    fail("SpiritHallView selected role must use RAW size mode without trim stretching.");
  }
  var expectedRosterOrder = ["milu", "lumi", "noya", "flora", "loco", "kelu", "yumi"];
  var previousRosterX = -Infinity;
  expectedRosterOrder.forEach(function (spiritId) {
    var rosterFrame = requireNodeByName(
      nodes,
      "source__" + spiritId + "_frame",
      "SpiritHallView roster order"
    );
    if (
      !rosterFrame._trs ||
      !Array.isArray(rosterFrame._trs.array) ||
      !Number.isFinite(rosterFrame._trs.array[0])
    ) {
      fail("SpiritHallView roster frame must contain a serialized X position: " + spiritId);
    }
    var rosterX = rosterFrame._trs.array[0];
    if (rosterX <= previousRosterX) {
      fail("SpiritHallView roster order must start with Milu and follow configured catalog order.");
    }
    previousRosterX = rosterX;
  });

  ["ability_kind", "current_probability", "next_probability", "rarity"].forEach(function (key) {
    requireNodeByName(nodes, "proxy__" + key + "_bar_base", "SpiritHallView progress bar");
  });
  var progressBars = objects.filter(function (entry) {
    return entry && entry.__type__ === "cc.ProgressBar";
  });
  if (progressBars.length !== 4) {
    fail("SpiritHallView must contain exactly four cc.ProgressBar components.");
  }

  ["ability_kind_label", "current_probability_label", "next_probability_label", "rarity_label", "ability_description"].forEach(function (nodeName) {
    var node = requireNodeByName(nodes, nodeName, "SpiritHallView left-aligned label");
    var label = node._components.map(function (reference) {
      return objects[reference.__id__];
    }).find(function (component) {
      return component && component.__type__ === "cc.Label";
    });
    if (!label || label._N$horizontalAlign !== 0 || node._anchorPoint.x !== 0) {
      fail("SpiritHallView label must be authored with left alignment and anchorX=0: " + nodeName);
    }
  });
}

function createMemoryStorage() {
  var values = {};
  return {
    get length() {
      return Object.keys(values).length;
    },
    key: function (index) {
      return Object.keys(values)[index];
    },
    getItem: function (storageKey) {
      return Object.prototype.hasOwnProperty.call(values, storageKey) ? values[storageKey] : null;
    },
    setItem: function (storageKey, value) {
      values[storageKey] = String(value);
    }
  };
}

function validateConfigAndStore() {
  global.cc = {
    sys: {
      localStorage: createMemoryStorage()
    }
  };
  var AssistSpiritConfig = require(path.join(projectRoot, "assets/scripts/config/AssistSpiritConfig"));
  var AssistSpiritStore = require(path.join(projectRoot, "assets/scripts/utils/AssistSpiritStore"));
  var catalog = AssistSpiritConfig.getCatalog();
  if (catalog.length !== 7) {
    fail("AssistSpiritConfig must contain seven spirits.");
  }
  [
    [1, 3],
    [2, 5],
    [3, 7],
    [5, 10],
    [10, 18],
    [20, 30]
  ].forEach(function (sample) {
    if (AssistSpiritConfig.getProbability("flora", sample[0]) !== sample[1]) {
      fail("Assist spirit probability sample mismatch at level " + sample[0] + ".");
    }
  });
  if (AssistSpiritConfig.getProbability("milu", 20) !== 0) {
    fail("Milu must not expose a special ability probability.");
  }
  AssistSpiritConfig.getAllSpritePaths().forEach(function (resourcePath) {
    var relativePngPath = "assets/" + resourcePath + ".png";
    if (!fs.existsSync(path.join(projectRoot, relativePngPath))) {
      fail("Configured spirit SpriteFrame PNG is missing: " + relativePngPath);
    }
  });

  var store = new AssistSpiritStore();
  var state = store.load();
  if (state.equippedSpiritId !== "milu") {
    fail("Initial equipped spirit must be milu.");
  }
  var insufficient = store.buildLevelUpgrade(state, "flora", 0);
  if (insufficient.accepted !== false || insufficient.reason !== "COIN_NOT_ENOUGH") {
    fail("Assist spirit upgrade must reject insufficient coins.");
  }
  var upgraded = store.buildLevelUpgrade(state, "flora", 12000);
  if (upgraded.accepted !== true || upgraded.state.spirits.flora.level !== 2) {
    fail("Assist spirit level upgrade transition is invalid.");
  }
  var advanced = store.buildStarAdvance(state, "flora");
  if (advanced.accepted !== false || advanced.reason !== "FRAGMENT_NOT_ENOUGH") {
    fail("Assist spirit advance must reject insufficient fragments.");
  }
  var equipped = store.buildEquip(state, "flora");
  if (equipped.equippedSpiritId !== "flora") {
    fail("Assist spirit equip transition is invalid.");
  }
  delete global.cc;
}

function validateRuntimeWiring() {
  var signInMethods = readText("assets/scripts/bootstrap/GameBootstrapSignInAwardFlowMethods.js");
  requireContains(signInMethods, "getChildByName(\"top\")", "Sign-in top path");
  requireContains(signInMethods, "getChildByName(\"top_layer\")", "Sign-in top_layer path");
  requireContains(signInMethods, "topLayerNode.getChildByName(\"sign_btn\")", "Sign-in button path");

  var levelSelectView = readText("assets/scripts/bootstrap/LevelSelectView.js");
  requireContains(levelSelectView, "getChildByName(\"elven_hall_btn\")", "Spirit hall level-select entry");
  requireContains(levelSelectView, "LevelSelectView requires onOpenSpiritHall.", "Spirit hall strict callback");

  var bundleLoader = readText("assets/scripts/utils/BundleLoader.js");
  requireContains(bundleLoader, "SPIRIT_SYSTEM_ASSET_PREFIX", "Spirit system bundle route");
  requireContains(bundleLoader, "bundleName: SPIRIT_SYSTEM_BUNDLE_NAME", "Spirit system bundle name route");

  var bootstrap = readText("assets/scripts/bootstrap/GameBootstrap.js");
  requireContains(bootstrap, "./GameBootstrapSpiritHallMethods", "Spirit hall lazy bootstrap module");
  requireContains(bootstrap, "_showSpiritHallView: lazySpiritHallMethods._showSpiritHallView", "Spirit hall entry method");
  var lazyModule = readText("assets/scripts/bootstrap/GameBootstrapLazyModule.js");
  requireContains(
    lazyModule,
    "\"./GameBootstrapSpiritHallMethods\": function ()",
    "Spirit hall lazy bootstrap static loader"
  );
  requireContains(
    lazyModule,
    "require(\"./GameBootstrapSpiritHallMethods\")",
    "Spirit hall statically analyzable lazy require"
  );
  var controller = readText("assets/scripts/ui/SpiritHallViewController.js");
  requireContains(controller, "spriteFrame.getOriginalSize()", "Spirit role original-size lookup");
  requireContains(controller, "sprite.sizeMode = cc.Sprite.SizeMode.RAW", "Spirit role RAW size mode");
  requireContains(controller, "sprite.trim = false", "Spirit role trim preservation");
  requireContains(
    controller,
    "this._setSpriteFrameAtOriginalSize(",
    "Spirit role original-size render path"
  );

  var clientCloud = readText("assets/scripts/services/PlayerCloudProfileService.js");
  var serverCloud = readText("cloudfunctions/playerProfile/index.js");
  requireContains(clientCloud, "bubble_assist_spirit_state_v1", "Client assist-spirit cloud storage entry");
  requireContains(serverCloud, "bubble_assist_spirit_state_v1", "Cloud function assist-spirit storage entry");
  var markerPattern = /playerProfile_v20260724_assist_spirit_v1/;
  if (!markerPattern.test(clientCloud) || !markerPattern.test(serverCloud)) {
    fail("Player profile client/server deployment markers must match assist-spirit schema.");
  }
}

validateLevelViewHierarchy();
validateSpiritHallPrefab();
validateConfigAndStore();
validateRuntimeWiring();
console.log("Spirit hall integration validation passed: hierarchy, prefab, state, assets, entry and cloud contract.");
