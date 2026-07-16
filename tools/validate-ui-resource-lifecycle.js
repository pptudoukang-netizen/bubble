"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

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

  propDescriptionConfig.getAllIconPaths().forEach(function (resourcePath) {
    assert.strictEqual(
      resourcePath.indexOf("ui/"),
      0,
      "PropDescriptionView icon must belong to ui bundle: " + resourcePath
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
  validateGameplayReleaseScope();
  return validatePrefabFactoryOwnership().then(function () {
    console.log("UI resource lifecycle validation passed.");
  });
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
