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

function expectThrow(run, expectedText) {
  var thrown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  if (!thrown || String(thrown.message).indexOf(expectedText) < 0) {
    fail("Expected error containing `" + expectedText + "`.");
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
    "source__guide_frame",
    "proxy__guide_frame",
    "source__guide_icon",
    "proxy__guide_icon",
    "source__guide_notification",
    "proxy__guide_notification",
    "guide_text"
  ].forEach(function (nodeName) {
    if (nodes.some(function (node) { return node._name === nodeName; })) {
      fail("SpiritHallView must not retain removed guide entry node: " + nodeName);
    }
  });
  [
    "SafeAreaRoot",
    "DesignContent",
    "SpriteRenderLayer",
    "LogicLayer",
    "BottomNavigationMount",
    "source__back_button",
    "source__selected_role",
    "proxy__selected_role",
    "source__upgrade_button",
    "source__upgrade_fragment_icon",
    "proxy__upgrade_fragment_icon",
    "source__upgrade_magic_circle",
    "proxy__upgrade_magic_circle",
    "source__upgrade_light",
    "proxy__upgrade_light",
    "source__battle_button"
  ].forEach(function (nodeName) {
    requireNodeByName(nodes, nodeName, "SpiritHallView");
  });
  [
    "SpiritSystemTabBar",
    "source__bottom_navigation_bar",
    "source__home_tab",
    "source__shop_tab"
  ].forEach(function (nodeName) {
    if (nodes.some(function (node) { return node._name === nodeName; })) {
      fail("SpiritHallView must not inline shared TabBar node: " + nodeName);
    }
  });
  [
    "source__advance_button",
    "proxy__advance_fragment_icon",
    "source__advance_fragment_icon",
    "advance_text",
    "advance_cost"
  ].forEach(function (nodeName) {
    if (nodes.some(function (node) { return node._name === nodeName; })) {
      fail("SpiritHallView must not retain removed advance node: " + nodeName);
    }
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
  var upgradeFragmentIconNodes = [
    "source__upgrade_fragment_icon",
    "proxy__upgrade_fragment_icon"
  ].map(function (nodeName) {
    return requireNodeByName(nodes, nodeName, "SpiritHallView upgrade fragment icon");
  });
  var upgradeFragmentIconNode = upgradeFragmentIconNodes[1];
  var upgradeFragmentIconSprite = upgradeFragmentIconNode._components.map(function (reference) {
    return objects[reference.__id__];
  }).find(function (component) {
    return component && component.__type__ === "cc.Sprite";
  });
  var miluFragmentMeta = readJson(
    "assets/spirit_system/image/tabbar/milu_fragments.png.meta"
  );
  var miluFragmentSubMetaNames = Object.keys(miluFragmentMeta.subMetas);
  if (miluFragmentSubMetaNames.length !== 1) {
    fail("Milu fragment texture must expose exactly one SpriteFrame.");
  }
  if (
    !upgradeFragmentIconSprite ||
    !upgradeFragmentIconSprite._spriteFrame ||
    upgradeFragmentIconSprite._spriteFrame.__uuid__ !==
      miluFragmentMeta.subMetas[miluFragmentSubMetaNames[0]].uuid
  ) {
    fail("SpiritHallView upgrade fragment icon must initially use Milu image/tabbar SpriteFrame.");
  }
  upgradeFragmentIconNodes.forEach(function (node) {
    if (
      node._trs.array[1] !== -500 ||
      node._trs.array[7] !== 0.6 ||
      node._trs.array[8] !== 0.6
    ) {
      fail(node._name + " must use Y=-500 and scale=0.6.");
    }
  });
  [
    {
      baseName: "upgrade_magic_circle",
      metaPath: "assets/spirit_system/image/ui/magic_circle.png.meta"
    },
    {
      baseName: "upgrade_light",
      metaPath: "assets/spirit_system/image/ui/light.png.meta"
    }
  ].forEach(function (effectAsset) {
    var effectMeta = readJson(effectAsset.metaPath);
    var effectSubMetaNames = Object.keys(effectMeta.subMetas);
    if (effectSubMetaNames.length !== 1) {
      fail(effectAsset.metaPath + " must expose exactly one SpriteFrame.");
    }
    var expectedSpriteFrameUuid = effectMeta.subMetas[effectSubMetaNames[0]].uuid;
    ["source__", "proxy__"].forEach(function (nodePrefix) {
      var effectNode = requireNodeByName(
        nodes,
        nodePrefix + effectAsset.baseName,
        "SpiritHallView upgrade effect"
      );
      var effectSprite = effectNode._components.map(function (reference) {
        return objects[reference.__id__];
      }).find(function (component) {
        return component && component.__type__ === "cc.Sprite";
      });
      if (
        !effectSprite ||
        !effectSprite._spriteFrame ||
        effectSprite._spriteFrame.__uuid__ !== expectedSpriteFrameUuid ||
        effectNode._active !== false ||
        effectNode._opacity !== 0
      ) {
        fail(effectNode._name + " upgrade effect prefab contract is invalid.");
      }
    });
  });
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

  ["ability_kind", "current_probability", "next_probability", "fragment_count"].forEach(function (key) {
    requireNodeByName(nodes, "proxy__" + key + "_bar_base", "SpiritHallView progress bar");
  });
  var progressBars = objects.filter(function (entry) {
    return entry && entry.__type__ === "cc.ProgressBar";
  });
  if (progressBars.length !== 4) {
    fail("SpiritHallView must contain exactly four cc.ProgressBar components.");
  }

  var expectedOutlinedLabels = {
    upgrade_text: "升级",
    battle_text: "出战"
  };
  var outlinedLabelCounts = {
    upgrade_text: 0,
    battle_text: 0
  };
  objects.filter(function (entry) {
    return entry && entry.__type__ === "cc.LabelOutline";
  }).forEach(function (outline) {
    var node = objects[outline.node.__id__];
    if (
      !node ||
      !Object.prototype.hasOwnProperty.call(expectedOutlinedLabels, node._name)
    ) {
      fail(
        "SpiritHallView system text must not use LabelOutline: " +
        (node ? node._name : "invalid node")
      );
    }
    var label = node._components.map(function (reference) {
      return objects[reference.__id__];
    }).find(function (component) {
      return component && component.__type__ === "cc.Label";
    });
    if (
      !label ||
      label._string !== expectedOutlinedLabels[node._name] ||
      outline._width !== 2
    ) {
      fail("SpiritHallView action label outline contract is invalid: " + node._name);
    }
    outlinedLabelCounts[node._name] += 1;
  });
  Object.keys(outlinedLabelCounts).forEach(function (nodeName) {
    if (outlinedLabelCounts[nodeName] !== 1) {
      fail("SpiritHallView requires exactly one outlined action label: " + nodeName);
    }
  });

  ["ability_kind_label", "current_probability_label", "next_probability_label", "fragment_count_label", "ability_description"].forEach(function (nodeName) {
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

function validateSpiritSystemTabBarPrefab() {
  var relativePath = "assets/spirit_system/prefabs/SpiritSystemTabBar.prefab";
  var objects = readJson(relativePath);
  var root = resolvePrefabRoot(objects, relativePath);
  if (
    root._name !== "SpiritSystemTabBar" ||
    root._contentSize.width !== 720 ||
    root._contentSize.height !== 90
  ) {
    fail("SpiritSystemTabBar root contract must be 720x90.");
  }
  var nodes = collectNodes(objects);
  [
    "source__home_notification",
    "proxy__home_notification",
    "source__growth_notification",
    "proxy__growth_notification"
  ].forEach(function (nodeName) {
    if (nodes.some(function (node) { return node._name === nodeName; })) {
      fail("SpiritSystemTabBar must not retain unopened-tab notification node: " + nodeName);
    }
  });
  [
    "SpiritSystemTabBarSpriteLayer",
    "SpiritSystemTabBarLogicLayer",
    "source__bottom_navigation_bar",
    "proxy__bottom_navigation_bar",
    "source__home_tab",
    "source__bond_tab",
    "source__hall_tab",
    "source__growth_tab",
    "source__shop_tab"
  ].forEach(function (nodeName) {
    requireNodeByName(nodes, nodeName, "SpiritSystemTabBar");
  });
  var buttons = objects.filter(function (entry) {
    return entry && entry.__type__ === "cc.Button";
  });
  if (buttons.length !== 5) {
    fail("SpiritSystemTabBar must contain exactly five tab Buttons.");
  }
  if (objects.some(function (entry) {
    return entry && entry.__type__ === "cc.LabelOutline";
  })) {
    fail("SpiritSystemTabBar system text must not use LabelOutline.");
  }
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
  var storage = createMemoryStorage();
  global.cc = {
    sys: {
      localStorage: storage
    }
  };
  var AssistSpiritConfig = require(path.join(projectRoot, "assets/scripts/config/AssistSpiritConfig"));
  var AssistSpiritStore = require(path.join(projectRoot, "assets/scripts/utils/AssistSpiritStore"));
  var catalog = AssistSpiritConfig.getCatalog();
  if (catalog.length !== 7) {
    fail("AssistSpiritConfig must contain seven spirits.");
  }
  if (AssistSpiritConfig.MAX_LEVEL !== 10) {
    fail("Assist spirit level cap must be 10.");
  }
  catalog.forEach(function (spirit) {
    if (
      spirit.fragmentIconPath !==
      "spirit_system/image/tabbar/" + spirit.id + "_fragments"
    ) {
      fail("Assist spirit fragment icon must use image/tabbar: " + spirit.id);
    }
  });
  if (AssistSpiritConfig.getProbability("flora", 10) !== 0) {
    fail("Global skills must not expose a probability stat.");
  }
  for (var level = 2; level <= AssistSpiritConfig.MAX_LEVEL; level += 1) {
    if (
      AssistSpiritConfig.getProbability("lumi", level) <=
      AssistSpiritConfig.getProbability("lumi", level - 1)
    ) {
      fail("Lumi probability must increase at every assist-spirit level.");
    }
  }
  ["tornado", "release_vines", "permanent_thaw", "lightning_chain"].forEach(function (skillId) {
    for (var level = 2; level <= AssistSpiritConfig.MAX_LEVEL; level += 1) {
      if (
        AssistSpiritConfig.getGlobalSkillRuntimeConfig(skillId, level).chargeMax >=
        AssistSpiritConfig.getGlobalSkillRuntimeConfig(skillId, level - 1).chargeMax
      ) {
        fail("Global skill charge must improve at every assist-spirit level: " + skillId);
      }
    }
  });
  var noyaLevelOne = AssistSpiritConfig.getAbilityLevelPresentation("noya", 1);
  var noyaLevelTen = AssistSpiritConfig.getAbilityLevelPresentation("noya", 10);
  if (
    noyaLevelOne.summary !== "2球 / 25充能" ||
    noyaLevelTen.summary !== "10球 / 11充能" ||
    noyaLevelOne.statLabel !== "当前消除" ||
    noyaLevelOne.statValue !== "2球" ||
    noyaLevelTen.statValue !== "10球"
  ) {
    fail("Spirit Hall must expose the configured Noya level effects.");
  }
  if (noyaLevelOne.detail !== "最多消除2球\n充能需25球") {
    fail("Spirit Hall must expose Noya's level effect in player-facing language.");
  }
  var locoLevelTen = AssistSpiritConfig.getAbilityLevelPresentation("loco", 10);
  if (locoLevelTen.description.indexOf("永久融化全部") < 0) {
    fail("Spirit Hall must describe Lv10 Loco permanent thaw.");
  }
  var floraLevelOne = AssistSpiritConfig.getAbilityLevelPresentation("flora", 1);
  var floraLevelTen = AssistSpiritConfig.getAbilityLevelPresentation("flora", 10);
  if (
    floraLevelOne.statLabel !== "当前解除" ||
    floraLevelOne.statValue !== "1处" ||
    floraLevelTen.statValue !== "全部"
  ) {
    fail("Spirit Hall must expose the configured Flora vine-release counts.");
  }
  var yumiLevelTen = AssistSpiritConfig.getAbilityLevelPresentation("yumi", 10);
  if (yumiLevelTen.summary !== "充能11球") {
    fail("Spirit Hall must describe Yumi's own level-based charge.");
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
  if (
    state.version !== 4 ||
    state.spirits.milu.owned !== true ||
    Object.prototype.hasOwnProperty.call(state.spirits.milu, "stars")
  ) {
    fail("Assist spirit v4 initial state must own milu without stars.");
  }
  catalog.filter(function (spirit) {
    return spirit.id !== "milu";
  }).forEach(function (spirit) {
    if (state.spirits[spirit.id].owned !== false) {
      fail("Non-default assist spirit must start locked: " + spirit.id);
    }
  });
  var lockedUpgrade = store.buildLevelUpgrade(state, "flora");
  if (lockedUpgrade.accepted !== false || lockedUpgrade.reason !== "NOT_OWNED") {
    fail("Locked assist spirit upgrade must be rejected as NOT_OWNED.");
  }
  expectThrow(function () {
    store.buildEquip(state, "flora");
  }, "Cannot equip an unowned assist spirit: flora");

  var reconciled = store.reconcileRescueUnlocks(state, { "42": true });
  if (
    reconciled.changed !== true ||
    reconciled.unlockedSpiritIds.join(",") !== "lumi" ||
    reconciled.state.spirits.lumi.owned !== true
  ) {
    fail("Completed rescue level 42 must reconcile lumi ownership.");
  }
  var unlockedFlora = store.buildUnlock(reconciled.state, "flora");
  if (unlockedFlora.accepted !== true || unlockedFlora.state.spirits.flora.owned !== true) {
    fail("Assist spirit rescue unlock transition is invalid.");
  }
  state = unlockedFlora.state;
  var insufficient = store.buildLevelUpgrade(state, "flora");
  if (insufficient.accepted !== false || insufficient.reason !== "FRAGMENT_NOT_ENOUGH") {
    fail("Assist spirit upgrade must reject insufficient fragments.");
  }
  var grantedFragments = store.buildAddFragments(state, "flora", 10);
  var upgraded = store.buildLevelUpgrade(grantedFragments.state, "flora");
  if (
    upgraded.accepted !== true ||
    upgraded.cost !== 10 ||
    upgraded.state.spirits.flora.level !== 2 ||
    upgraded.state.spirits.flora.fragments !== 0
  ) {
    fail("Assist spirit level upgrade transition is invalid.");
  }
  var equipped = store.buildEquip(state, "flora");
  if (equipped.equippedSpiritId !== "flora") {
    fail("Assist spirit equip transition is invalid.");
  }

  var legacyState = JSON.parse(JSON.stringify(state));
  legacyState.version = 1;
  legacyState.equippedSpiritId = "yumi";
  Object.keys(legacyState.spirits).forEach(function (spiritId) {
    legacyState.spirits[spiritId].owned = true;
    legacyState.spirits[spiritId].stars = 1;
  });
  storage.setItem(AssistSpiritStore.STORAGE_KEY, JSON.stringify(legacyState));
  var migrated = store.load();
  if (
    migrated.version !== 4 ||
    migrated.equippedSpiritId !== "milu" ||
    migrated.spirits.milu.owned !== true ||
    migrated.spirits.yumi.owned !== false
  ) {
    fail("AssistSpiritStore v1 must explicitly migrate to rescue-locked v4 state.");
  }
  var versionTwoState = JSON.parse(JSON.stringify(state));
  versionTwoState.version = 2;
  versionTwoState.spirits.milu.level = 20;
  versionTwoState.spirits.lumi.level = 1;
  Object.keys(versionTwoState.spirits).forEach(function (spiritId) {
    versionTwoState.spirits[spiritId].stars = 1;
  });
  storage.setItem(AssistSpiritStore.STORAGE_KEY, JSON.stringify(versionTwoState));
  var levelMigrated = store.load();
  if (
    levelMigrated.version !== 4 ||
    levelMigrated.spirits.milu.level !== 10 ||
    levelMigrated.spirits.lumi.level !== 1
  ) {
    fail("AssistSpiritStore v2 must explicitly migrate 20 level progress into the 10 level scale and remove stars.");
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
  var levelSelectFlow = readText("assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js");
  var spiritHallMethods = readText("assets/scripts/bootstrap/GameBootstrapSpiritHallMethods.js");
  var lazyRegistry = require(path.join(
    projectRoot,
    "assets/scripts/bootstrap/GameBootstrapLazyRegistry"
  ));
  var exportedSpiritHallMethods = [];
  var exportedMethodPattern = /^\s{2}(_[A-Za-z0-9]+): function \(/gm;
  var exportedMethodMatch = exportedMethodPattern.exec(spiritHallMethods);
  while (exportedMethodMatch) {
    exportedSpiritHallMethods.push(exportedMethodMatch[1]);
    exportedMethodMatch = exportedMethodPattern.exec(spiritHallMethods);
  }
  var registeredSpiritHallMethods = lazyRegistry.SPIRIT_HALL_METHODS.slice();
  if (
    exportedSpiritHallMethods.slice().sort().join("\n") !==
    registeredSpiritHallMethods.slice().sort().join("\n")
  ) {
    fail("GameBootstrapSpiritHallMethods exports and SPIRIT_HALL_METHODS registry must match exactly.");
  }
  registeredSpiritHallMethods.forEach(function (methodName) {
    requireContains(
      bootstrap,
      methodName + ": lazySpiritHallMethods." + methodName,
      "Spirit hall GameBootstrap method mapping"
    );
  });
  requireContains(bootstrap, "./GameBootstrapSpiritHallMethods", "Spirit hall lazy bootstrap module");
  requireContains(
    bootstrap,
    "_ensureSpiritSystemTabBarPrefab: lazySpiritHallMethods._ensureSpiritSystemTabBarPrefab",
    "Shared spirit-system TabBar prefab loader"
  );
  requireContains(bootstrap, "_showSpiritHallView: lazySpiritHallMethods._showSpiritHallView", "Spirit hall entry method");
  requireContains(
    spiritHallMethods,
    "this._runWithNetworkLoading(function () {",
    "Spirit hall first-open loading animation route"
  );
  requireContains(
    spiritHallMethods,
    "timeoutMs: this.networkLoadingTimeoutMs",
    "Spirit hall loading timeout contract"
  );
  requireContains(
    spiritHallMethods,
    "spirit_system/prefabs/SpiritSystemTabBar",
    "Shared spirit-system TabBar prefab path"
  );
  requireContains(
    spiritHallMethods,
    "instantiateSpiritSystemTabBar(tabBarPrefab, viewNode)",
    "Spirit hall shared TabBar instantiation"
  );
  requireContains(
    spiritHallMethods,
    "retainPrefabAsset(prefab, \"SpiritSystemTabBar\")",
    "Shared spirit-system TabBar prefab retained ownership"
  );
  requireContains(
    spiritHallMethods,
    "releaseRetainedPrefabAsset(this._spiritSystemTabBarPrefab, \"SpiritSystemTabBar\")",
    "Shared spirit-system TabBar final release"
  );
  requireContains(
    spiritHallMethods,
    "this._spiritSystemTabBarPrefabLoadPromise",
    "Shared spirit-system TabBar concurrent load deduplication"
  );
  requireContains(
    spiritHallMethods,
    "if (hideOptions.releaseBundle)",
    "Shared spirit-system TabBar switch-time retention"
  );
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
  requireContains(
    controller,
    "_setAbilityEffectDetail",
    "Spirit hall player-facing level effect detail contract"
  );
  [
    "source__home_tab",
    "source__bond_tab",
    "source__growth_tab"
  ].forEach(function (nodeName) {
    requireContains(controller, nodeName, "Spirit hall unavailable Tab binding");
  });
  requireContains(
    controller,
    "this.onUnavailableTab = requireCallback(options, \"onUnavailableTab\")",
    "Spirit hall unavailable Tab callback contract"
  );
  requireContains(
    controller,
    "this.onUnavailableTab();",
    "Spirit hall unavailable Tab click route"
  );
  requireContains(
    spiritHallMethods,
    "SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP = \"系统开发中，敬请期待\"",
    "Spirit hall unavailable Tab tip copy"
  );
  requireContains(
    spiritHallMethods,
    "this.tipsPresenter.showText(SPIRIT_SYSTEM_UNAVAILABLE_TAB_TIP)",
    "Spirit hall unavailable Tab TipsPresenter route"
  );
  requireContains(
    spiritHallMethods,
    "this._setStatusWithTip(\"spirit_upgrade_fragment_not_enough\", null, \"精灵碎片不足\")",
    "Spirit level-up insufficient-fragment tip route"
  );
  requireContains(
    spiritHallMethods,
    "SPIRIT_NOT_UNLOCKED_TIP = \"该精灵尚未解锁，请先完成对应救援关卡\"",
    "Locked assist spirit tip copy"
  );
  requireContains(
    spiritHallMethods,
    "showSpiritNotUnlockedTip(this);",
    "Locked assist spirit action tip route"
  );
  [
    "source__upgrade_magic_circle",
    "proxy__upgrade_magic_circle",
    "source__upgrade_light",
    "proxy__upgrade_light",
    "requireOperationAccepted(",
    "this.playUpgradeEffect();",
    "_pendingUpgradeEffectCount",
    "cc.rotateBy(0.54, 60)"
  ].forEach(function (requiredToken) {
    requireContains(controller, requiredToken, "Spirit hall upgrade effect runtime contract");
  });
  requireContains(
    controller,
    "this.onUpgrade(this.selectedSpiritId)",
    "Spirit level-up authoritative result route"
  );
  ["onUpgrade"].forEach(function (callbackName) {
    var acceptedEffectPattern = new RegExp(
      "if \\(requireOperationAccepted\\(\\s*this\\." +
      callbackName +
      "\\(this\\.selectedSpiritId\\),[\\s\\S]*?\\)\\) \\{\\s*" +
      "this\\.playUpgradeEffect\\(\\);\\s*\\}"
    );
    if (!acceptedEffectPattern.test(controller)) {
      fail(callbackName + " must play the spirit upgrade effect only after accepted=true.");
    }
  });
  requireContains(controller, "spriteFrame.getOriginalSize()", "Spirit role original-size lookup");
  requireContains(controller, "sprite.sizeMode = cc.Sprite.SizeMode.RAW", "Spirit role RAW size mode");
  requireContains(controller, "sprite.trim = false", "Spirit role trim preservation");
  requireContains(
    controller,
    "cc.Material.getBuiltinMaterial(materialName)",
    "Locked assist spirit built-in material lookup"
  );
  requireContains(controller, "\"2d-gray-sprite\"", "Locked assist spirit gray material");
  requireContains(controller, "\"2d-sprite\"", "Unlocked assist spirit normal material");
  requireContains(controller, "sprite.setMaterial(0, material)", "Assist spirit avatar material route");
  if (controller.indexOf("sprite.setState(") >= 0) {
    fail("SpiritHallViewController must not call deprecated Sprite.setState.");
  }
  requireContains(
    controller,
    "this._setSpriteGrayState(\"proxy__\" + spirit.id + \"_avatar\", entry.owned !== true);",
    "Locked assist spirit roster avatar gray rendering"
  );
  requireContains(
    controller,
    "entry.owned !== true || levelCost !== null",
    "Locked assist spirit upgrade button remains clickable for tips"
  );
  requireContains(
    controller,
    "this._setSpriteFrameAtOriginalSize(",
    "Spirit role original-size render path"
  );
  requireContains(
    levelSelectFlow,
    "unlockAssistSpiritForCompletedRescueLevel(this, this._currentLevelId);",
    "Completed rescue level ownership persistence"
  );
  requireContains(
    levelSelectFlow,
    "AssistSpiritRescueConfig.requireSpiritIdByLevelId(levelId)",
    "Completed rescue level identity authority"
  );
  requireContains(
    controller,
    "this._setSpriteFrame(\"proxy__upgrade_fragment_icon\", spirit.fragmentIconPath);",
    "Selected spirit fragment icon render path"
  );
  requireContains(
    spiritHallMethods,
    "this._refreshAssistSpiritState();",
    "Spirit Hall refreshes persisted fragment state before rendering"
  );
  requireContains(
    spiritHallMethods,
    "gems: this._getCurrentGems()",
    "Spirit Hall supplies the authoritative gem balance"
  );
  requireContains(
    controller,
    "SpiritHallView snapshot gems must be a non-negative integer.",
    "Spirit Hall gem snapshot contract"
  );
  requireContains(
    controller,
    "this._setLabel(\"crystal_value\", formatInteger(snapshot.gems));",
    "Spirit Hall diamond label must use the authoritative gem balance"
  );
  if (controller.indexOf("totalStars") >= 0) {
    fail("Spirit Hall diamond label must not render total spirit stars.");
  }
  [
    controller,
    spiritHallMethods,
    readText("assets/scripts/bootstrap/GameBootstrapLazyRegistry.js"),
    readText("assets/scripts/bootstrap/GameBootstrap.js"),
    readText("assets/scripts/utils/AssistSpiritStore.js")
  ].forEach(function (source) {
    if (source.indexOf("onAdvance") >= 0 || source.indexOf("_advanceSelectedSpirit") >= 0 || source.indexOf("buildStarAdvance") >= 0) {
      fail("Spirit level-only progression must not retain an advance runtime route.");
    }
  });

  var clientCloud = readText("assets/scripts/services/PlayerCloudProfileService.js");
  var serverCloud = readText("cloudfunctions/playerProfile/index.js");
  var templateCloud = readText("build-templates/wechatgame/cloudfunctions/playerProfile/index.js");
  requireContains(clientCloud, "bubble_assist_spirit_state_v1", "Client assist-spirit cloud storage entry");
  requireContains(serverCloud, "bubble_assist_spirit_state_v1", "Cloud function assist-spirit storage entry");
  var markerPattern = /playerProfile_v20260809_assist_spirit_level_only_v5/;
  if (!markerPattern.test(clientCloud) || !markerPattern.test(serverCloud) || !markerPattern.test(templateCloud)) {
    fail("Player profile client/server/template deployment markers must match assist-spirit unlock schema.");
  }
  requireContains(serverCloud, "version: 4", "Cloud initial assist-spirit state version");
  requireContains(serverCloud, "owned: spiritId === \"milu\"", "Cloud initial assist-spirit ownership");
  requireContains(templateCloud, "version: 4", "Cloud template initial assist-spirit state version");
  requireContains(templateCloud, "owned: spiritId === \"milu\"", "Cloud template initial assist-spirit ownership");
}

validateLevelViewHierarchy();
validateSpiritHallPrefab();
validateSpiritSystemTabBarPrefab();
validateConfigAndStore();
validateRuntimeWiring();
console.log("Spirit hall integration validation passed: hierarchy, prefab, state, assets, entry and cloud contract.");
