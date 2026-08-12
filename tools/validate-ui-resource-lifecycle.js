"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function validateStartGameResourceOwnership() {
  var powerupMethodsSource = readProjectFile("assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js");
  var compositionSource = readProjectFile("assets/scripts/bootstrap/GameBootstrapCompositionMethods.js");
  var propDescriptionConfig = require(path.join(
    PROJECT_ROOT,
    "assets/scripts/config/PropDescriptionConfig"
  ));
  var objectiveIconBlock = powerupMethodsSource.match(
    /var START_GAME_OBJECTIVE_ICON_PATHS = \{([\s\S]*?)\n\};/
  );

  assert.strictEqual(
    powerupMethodsSource.indexOf("_startGamePropDescriptionViewPrefab"),
    -1,
    "StartGameView must not cache PropDescriptionView prefab across gameplay sessions."
  );
  assert.strictEqual(
    compositionSource.indexOf("_startGamePropDescriptionViewPrefab"),
    -1,
    "StartGameView composition state must not retain PropDescriptionView prefab."
  );
  assert.ok(
    compositionSource.indexOf("_startGamePropDescriptionPrefabLease = null") >= 0,
    "StartGameView must track an active-only PropDescriptionView prefab lease."
  );
  assert.ok(
    powerupMethodsSource.indexOf("retainStartGamePropDescriptionPrefab(this, prefab)") >= 0,
    "StartGameView must retain its own PropDescriptionView prefab while the modal is active."
  );
  assert.ok(
    powerupMethodsSource.indexOf("releaseStartGamePropDescriptionPrefab(host);") >= 0,
    "StartGameView must release its PropDescriptionView prefab lease when the modal is destroyed."
  );
  assert.ok(objectiveIconBlock, "StartGameView objective icon configuration is required.");
  assert.strictEqual(
    /game\/image\//.test(objectiveIconBlock[1]),
    false,
    "StartGameView objective icons must not depend on the releasable game bundle."
  );
  assert.ok(
    powerupMethodsSource.indexOf("if (this._startGameViewOpeningPromise)") >= 0 &&
      powerupMethodsSource.indexOf("this._startGameViewOpeningPromise = trackedPromise;") >= 0,
    "StartGameView opening must coalesce duplicate level-select entry requests."
  );
  assert.ok(
    powerupMethodsSource.indexOf("this._startGameViewOpeningPromise === trackedPromise") >= 0 &&
      powerupMethodsSource.indexOf("this._startGameViewNode !== startGameViewNode") >= 0,
    "StartGameView must release its entry lock after rendering and cancel stale post-open effects after close."
  );

  propDescriptionConfig.getAllIconPaths().forEach(function (resourcePath) {
    assert.strictEqual(
      resourcePath.indexOf("ui/"),
      0,
      "PropDescriptionView icon must belong to ui bundle: " + resourcePath
    );
  });
}

function validateStartGameRescueObjectives() {
  var source = readProjectFile("assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js") +
    "\nmodule.exports.__buildStartGameObjectivesForValidation = buildStartGameObjectives;\n";
  var sandbox = {
    module: { exports: {} },
    exports: {},
    require: function () {
      return {};
    }
  };
  vm.runInNewContext(source, sandbox, {
    filename: "GameBootstrapPowerupInventoryMethods.js"
  });
  var buildObjectives = sandbox.module.exports.__buildStartGameObjectivesForValidation;
  assert.strictEqual(typeof buildObjectives, "function", "StartGameView objective builder is required.");

  var pack = JSON.parse(readProjectFile("remote-level-packs/levels_pack_011_100.json"));
  var rescueConfig = pack.levels.level_063;
  var rescueObjectives = buildObjectives(rescueConfig);
  assert.strictEqual(rescueObjectives.ball, null, "Level 63 rescue must not require a ball collection objective.");
  assert.strictEqual(rescueObjectives.iceSnowball, null, "Level 63 rescue must not require an ice collection objective.");
  assert.throws(function () {
    buildObjectives({
      level: {
        levelType: "normal",
        bonusObjectives: [],
        winConditions: [{ type: "clear_all", value: 1 }]
      }
    });
  }, /StartGameView requires at least one collection objective/, "Non-rescue levels must keep the collection-objective contract.");
}

function getPrefabNodeById(prefab, reference) {
  assert(reference && Number.isInteger(reference.__id__), "StartGameView prefab node reference is required.");
  var node = prefab[reference.__id__];
  assert(node && node.__type__ === "cc.Node", "StartGameView prefab node is invalid: " + reference.__id__);
  return node;
}

function getPrefabChildNode(prefab, parentNode, name, description) {
  var child = (parentNode._children || []).map(function (reference) {
    return getPrefabNodeById(prefab, reference);
  }).filter(function (node) {
    return node._name === name;
  })[0];
  assert(child, "StartGameView prefab is missing " + description + ".");
  return child;
}

function validateStartGamePrefabContract() {
  var prefab = JSON.parse(readProjectFile("assets/ui/prefabs/StartGameView.prefab"));
  var rootNode = getPrefabNodeById(prefab, prefab[0].data);
  var panelNode = getPrefabChildNode(prefab, rootNode, "Panel", "Panel");
  var titleBgNode = getPrefabChildNode(prefab, panelNode, "title_bg", "Panel/title_bg");
  getPrefabChildNode(prefab, titleBgNode, "btn_close", "Panel/title_bg/btn_close");
  getPrefabChildNode(prefab, titleBgNode, "level", "Panel/title_bg/level");
  getPrefabChildNode(prefab, panelNode, "target_score_bg", "Panel/target_score_bg");
  var targetNode = getPrefabChildNode(prefab, panelNode, "target", "Panel/target");
  var targetLayoutNode = getPrefabChildNode(prefab, targetNode, "traget_layout", "Panel/target/traget_layout");
  getPrefabChildNode(prefab, targetLayoutNode, "target_ball", "Panel/target/traget_layout/target_ball");
  getPrefabChildNode(prefab, targetLayoutNode, "target_ice", "Panel/target/traget_layout/target_ice");
  getPrefabChildNode(prefab, targetLayoutNode, "target_spirit", "Panel/target/traget_layout/target_spirit");
  var propNode = getPrefabChildNode(prefab, panelNode, "prop_node", "Panel/prop_node");
  var propListNode = getPrefabChildNode(prefab, propNode, "prop_listview", "Panel/prop_node/prop_listview");
  getPrefabChildNode(prefab, propNode, "directions_btn", "Panel/prop_node/directions_btn");
  getPrefabChildNode(prefab, getPrefabChildNode(prefab, propListNode, "view", "Panel/prop_node/prop_listview/view"), "content", "Panel/prop_node/prop_listview/view/content");
  var roleNode = getPrefabChildNode(prefab, panelNode, "role_node", "Panel/role_node");
  var roleListNode = getPrefabChildNode(prefab, roleNode, "role_listview", "Panel/role_node/role_listview");
  getPrefabChildNode(prefab, getPrefabChildNode(prefab, roleListNode, "view", "Panel/role_node/role_listview/view"), "content", "Panel/role_node/role_listview/view/content");

  var controllerSource = readProjectFile("assets/scripts/ui/StartGameViewController.js");
  var spriteProxySource = readProjectFile("assets/scripts/utils/SpriteProxyLayerHelper.js");
  assert.ok(controllerSource.indexOf('requireChildNode(panelNode, "prop_node", "Panel")') >= 0, "StartGameView controller must bind Panel/prop_node.");
  assert.ok(controllerSource.indexOf('requireChildNode(panelNode, "role_node", "Panel")') >= 0, "StartGameView controller must bind Panel/role_node.");
  assert.ok(controllerSource.indexOf('requireChildNode(titleBgNode, "btn_close", "Panel/title_bg")') >= 0, "StartGameView controller must bind Panel/title_bg/btn_close.");
  assert.ok(controllerSource.indexOf('requireChildNode(titleBgNode, "level", "Panel/title_bg")') >= 0, "StartGameView controller must bind Panel/title_bg/level.");
  assert.ok(controllerSource.indexOf("this._nodes.targetNode.active = showCollectionTarget;") >= 0, "StartGameView must hide target when the level has no collection objective.");
  assert.ok(controllerSource.indexOf("SpriteProxyLayerHelper.createProxyRoot(this.node") >= 0, "StartGameView main Sprite proxy root must not be a Panel Layout child.");
  assert.ok(controllerSource.indexOf("root.setSiblingIndex(this._nodes.panel.getSiblingIndex());") >= 0, "StartGameView main Sprite proxy root must render above mask and below Panel text.");
  assert.ok(controllerSource.indexOf("this._updatePanelLayout();") >= 0, "StartGameView must settle Panel Layout before rebuilding Sprite proxies.");
  assert.ok(spriteProxySource.indexOf("function enableRecordAutoSync(rootNode, records)") >= 0, "SpriteProxyLayerHelper must support frame-by-frame record synchronization.");
  assert.ok(controllerSource.indexOf("SpriteProxyLayerHelper.enableRecordAutoSync(this._renderProxyRoot, this._renderProxyRecords);") >= 0, "StartGameView Panel proxy must follow PopupPanelAnimator scaling.");

  var sandbox = {
    module: { exports: {} },
    exports: {},
    require: function () {
      return {};
    }
  };
  vm.runInNewContext(
    controllerSource + "\nmodule.exports.__hasCollectionObjectiveForValidation = hasCollectionObjective;\n",
    sandbox,
    { filename: "StartGameViewController.js" }
  );
  var hasCollectionObjective = sandbox.module.exports.__hasCollectionObjectiveForValidation;
  assert.strictEqual(hasCollectionObjective({ ball: null, iceSnowball: null }), false, "An empty objective set must hide StartGameView target.");
  assert.strictEqual(hasCollectionObjective({ ball: { target: 1 }, iceSnowball: null }), true, "A ball objective must keep StartGameView target visible.");
  assert.strictEqual(hasCollectionObjective({ ball: null, iceSnowball: { target: 1 } }), true, "An ice objective must keep StartGameView target visible.");
}

function validateStartGameSpriteFrameLoadSerialization() {
  var controllerSource = readProjectFile("assets/scripts/ui/StartGameViewController.js");
  var loadOrder = [];
  var sandbox;
  var bundleLoader = {
    loadRes: function (resourcePath, assetType, callback) {
      assert.strictEqual(assetType, sandbox.cc.SpriteFrame, "StartGameView must load target icons as SpriteFrames.");
      loadOrder.push(resourcePath);
      setTimeout(function () {
        callback(null, { resourcePath: resourcePath });
      }, 0);
    }
  };
  sandbox = {
    module: { exports: {} },
    exports: {},
    cc: { SpriteFrame: function SpriteFrame() {} },
    Promise: Promise,
    setTimeout: setTimeout,
    require: function (requestPath) {
      if (requestPath === "../utils/BundleLoader") {
        return bundleLoader;
      }
      return {};
    }
  };
  vm.runInNewContext(
    controllerSource + "\nmodule.exports.__StartGameViewControllerForValidation = StartGameViewController;\n",
    sandbox,
    { filename: "StartGameViewController.js" }
  );
  var Controller = sandbox.module.exports.__StartGameViewControllerForValidation;
  var controller = Object.create(Controller.prototype);
  controller._spriteFrames = {};
  controller._spriteLoadPromise = null;
  controller._getRequiredSpritePaths = function (options) {
    return options.paths;
  };

  return Promise.all([
    controller._ensureSpriteFrames({ paths: ["ui/image/preview_balls/blue_ball"] }),
    controller._ensureSpriteFrames({ paths: ["ui/image/preview_balls/red_ball"] })
  ]).then(function () {
    assert.deepStrictEqual(
      loadOrder,
      ["ui/image/preview_balls/blue_ball", "ui/image/preview_balls/red_ball"],
      "Overlapping StartGameView renders must load the second target icon after the first batch."
    );
    assert.ok(
      controller._spriteFrames["ui/image/preview_balls/blue_ball"],
      "First StartGameView target icon must remain loaded."
    );
    assert.ok(
      controller._spriteFrames["ui/image/preview_balls/red_ball"],
      "Second StartGameView target icon must load before rendering its proxy."
    );
  });
}

function validateGameplayReleaseScope() {
  var levelRendererSource = readProjectFile("gameplay-src/render/LevelRenderer.js");
  var releaseBlock = levelRendererSource.match(
    /LevelRenderer\.prototype\.releaseAfterGameplayBundleUnload = function \(\) \{([\s\S]*?)\n\};/
  );
  assert.ok(releaseBlock, "LevelRenderer gameplay bundle release method is required.");
  assert.ok(
    releaseBlock[1].indexOf("releaseRetainedSpriteFramesByPrefix(this.spriteFrameCache, GAME_RESOURCE_PATH_PREFIX)") >= 0,
    "Gameplay idle release must release only game-prefixed SpriteFrames."
  );
  assert.ok(
    releaseBlock[1].indexOf("releaseLoadedCacheByPrefix(GAME_RESOURCE_PATH_PREFIX)") >= 0,
    "Gameplay idle release must release only game-prefixed prefabs."
  );
  assert.strictEqual(
    releaseBlock[1].indexOf("prefabFactory.releaseLoadedCache()"),
    -1,
    "Gameplay idle release must not release session-lifetime UI prefabs."
  );
  assert.ok(
    releaseBlock[1].indexOf("this._releaseJarFractionNodesBeforeGameplayBundleUnload()") >= 0,
    "Gameplay idle release must destroy jar fraction clones retained from the game bundle."
  );
  assert.ok(
    releaseBlock[1].indexOf("this._releaseJarFractionNodesBeforeGameplayBundleUnload()") <
      releaseBlock[1].indexOf("releaseRetainedSpriteFramesByPrefix"),
    "Jar fraction clones must be destroyed before game bundle SpriteFrames are released."
  );
}

function validatePrefabFactoryOwnership() {
  global.cc = {
    Prefab: function Prefab() {},
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  var bundleLoaderPath = path.join(PROJECT_ROOT, "assets/scripts/utils/BundleLoader");
  var prefabFactoryPath = path.join(PROJECT_ROOT, "gameplay-src/render/PrefabFactory");
  var BundleLoader = require(bundleLoaderPath);
  var originalLoadRes = BundleLoader.loadRes;
  var uiPrefabPath = "prefabs/ui/PropDescriptionView";
  var gamePrefabPath = "game/prefabs/ui/GameView";
  var loadCounts = {};
  function createPrefab() {
    return {
      addRefCount: 0,
      decRefCount: 0,
      addRef: function () {
        this.addRefCount += 1;
        return this;
      },
      decRef: function () {
        this.decRefCount += 1;
        return this;
      }
    };
  }
  var prefabs = {};
  prefabs[uiPrefabPath] = createPrefab();
  prefabs[gamePrefabPath] = createPrefab();

  BundleLoader.loadRes = function (resourcePath, assetType, callback) {
    assert.strictEqual(assetType, global.cc.Prefab);
    assert.ok(prefabs[resourcePath], "Unexpected prefab path: " + resourcePath);
    if (!Object.prototype.hasOwnProperty.call(loadCounts, resourcePath)) {
      loadCounts[resourcePath] = 0;
    }
    loadCounts[resourcePath] += 1;
    callback(null, prefabs[resourcePath]);
  };
  delete require.cache[require.resolve(prefabFactoryPath)];
  var PrefabFactory = require(prefabFactoryPath);
  var factory = new PrefabFactory();

  return Promise.all([
    factory.load(uiPrefabPath),
    factory.load(gamePrefabPath)
  ]).then(function () {
    return factory.load(uiPrefabPath);
  }).then(function (secondUiPrefab) {
    assert.strictEqual(secondUiPrefab, prefabs[uiPrefabPath]);
    assert.strictEqual(loadCounts[uiPrefabPath], 1, "PrefabFactory must deduplicate repeated UI prefab loads.");
    assert.strictEqual(loadCounts[gamePrefabPath], 1, "PrefabFactory must load the gameplay prefab once.");
    assert.strictEqual(prefabs[uiPrefabPath].addRefCount, 1, "PrefabFactory must retain one UI cache ownership reference.");
    assert.strictEqual(prefabs[gamePrefabPath].addRefCount, 1, "PrefabFactory must retain one gameplay cache ownership reference.");
    factory.releaseLoadedCacheByPrefix("game/");
    assert.strictEqual(prefabs[gamePrefabPath].decRefCount, 1, "Gameplay prefix release must release the gameplay prefab.");
    assert.strictEqual(prefabs[uiPrefabPath].decRefCount, 0, "Gameplay prefix release must preserve the UI prefab.");
    return factory.load(uiPrefabPath);
  }).then(function (preservedUiPrefab) {
    assert.strictEqual(preservedUiPrefab, prefabs[uiPrefabPath]);
    assert.strictEqual(loadCounts[uiPrefabPath], 1, "Preserved UI prefab must remain cached after gameplay release.");
    factory.releaseLoadedCache();
    assert.strictEqual(prefabs[uiPrefabPath].decRefCount, 1, "Full cache release must release the remaining UI prefab.");
    assert.strictEqual(prefabs[gamePrefabPath].decRefCount, 1, "Full cache release must not double-release the gameplay prefab.");
  }).finally(function () {
    BundleLoader.loadRes = originalLoadRes;
    delete global.cc;
  });
}

function main() {
  validateStartGameResourceOwnership();
  validateStartGameRescueObjectives();
  validateStartGamePrefabContract();
  validateGameplayReleaseScope();
  return validateStartGameSpriteFrameLoadSerialization().then(function () {
    return validatePrefabFactoryOwnership();
  }).then(function () {
    console.log("UI resource lifecycle validation passed.");
  });
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
