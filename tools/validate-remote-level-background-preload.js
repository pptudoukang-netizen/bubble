"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_LOADER_PATH = path.join(PROJECT_ROOT, "assets/scripts/config/RemoteLevelPackLoader.js");
var LEVEL_MANAGER_PATH = path.join(PROJECT_ROOT, "assets/scripts/config/LevelManager.js");
var STARTUP_METHODS_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapStartupMethods.js");
var START_GAME_METHODS_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

function createPack(id, from, to) {
  return {
    id: id,
    from: from,
    to: to
  };
}

function assertStartupSchedulingContract() {
  var startupSource = fs.readFileSync(STARTUP_METHODS_PATH, "utf8");
  var scheduleCalls = startupSource.match(/this\._scheduleBackgroundRemoteLevelPackPreload\(\);/g);
  assert(Array.isArray(scheduleCalls), "Startup flow must schedule background remote level pack preload.");
  assert.strictEqual(scheduleCalls.length, 2, "Both startup loading branches must schedule background remote level pack preload.");
  var renderedFrameWaitCalls = startupSource.match(/this\._waitForNextRenderedFrame\(\)/g);
  assert(Array.isArray(renderedFrameWaitCalls), "Startup flow must wait for level-select frames before background work.");
  assert.strictEqual(
    renderedFrameWaitCalls.length,
    8,
    "Both startup branches must leave three rendered level-select frames before background work starts."
  );

  var startGameSource = fs.readFileSync(START_GAME_METHODS_PATH, "utf8");
  assert.strictEqual(
    startGameSource.indexOf("preloadRemotePackAfterLevel"),
    -1,
    "StartGameView must not wait for near-use remote pack preload."
  );
}

function assertLevelManagerDelegation() {
  var LevelManager = require(LEVEL_MANAGER_PATH);
  var delegatedPriorityLevelId = 0;
  var expectedResult = Promise.resolve({
    preloaded: true
  });
  var manager = new LevelManager({
    localLoader: {
      loadLevelByKey: function () {
        throw new Error("Background preload validation must not load local levels.");
      }
    },
    remoteLoader: {
      preloadAllPacks: function (priorityLevelId) {
        delegatedPriorityLevelId = priorityLevelId;
        return expectedResult;
      }
    },
    randomChallengeManager: null,
    localLevelMax: 10
  });

  assert.strictEqual(manager.preloadAllRemotePacks(450), expectedResult, "LevelManager must return remote preload promise.");
  assert.strictEqual(delegatedPriorityLevelId, 450, "LevelManager must preserve remote preload priority level id.");
}

function assertRemoteLoaderBackgroundPreload() {
  var RemoteLevelPackLoader = require(REMOTE_LOADER_PATH);
  var packInfos = [
    createPack("p11", 11, 100),
    createPack("p101", 101, 200),
    createPack("p201", 201, 300),
    createPack("p301", 301, 400),
    createPack("p401", 401, 500)
  ];
  var manifest = {
    localLevelMax: 10,
    totalLevelCount: 500,
    packs: packInfos
  };
  var loader = new RemoteLevelPackLoader({
    platform: {}
  });
  var activeCount = 0;
  var maxActiveCount = 0;
  var startedPackIds = [];

  loader.loadManifest = function () {
    return Promise.resolve(manifest);
  };
  loader._fetchPackText = function (loadedManifest, packInfo) {
    assert.strictEqual(loadedManifest, manifest, "Background preload must use loaded remote manifest.");
    startedPackIds.push(packInfo.id);
    activeCount += 1;
    maxActiveCount = Math.max(maxActiveCount, activeCount);
    return new Promise(function (resolve) {
      setImmediate(function () {
        activeCount -= 1;
        resolve("{}");
      });
    });
  };

  var firstPromise = loader.preloadAllPacks(450);
  var duplicatePromise = loader.preloadAllPacks(450);
  assert.strictEqual(duplicatePromise, firstPromise, "Repeated background preload must reuse the same promise.");

  return firstPromise.then(function (result) {
    assert.strictEqual(startedPackIds[0], "p401", "Highest unlocked level pack must preload first.");
    assert.strictEqual(maxActiveCount, 1, "Background remote pack preload must serialize pack downloads.");
    assert.strictEqual(new Set(startedPackIds).size, packInfos.length, "Background preload must fetch every remote pack once.");
    assert.strictEqual(result.preloaded, true, "Background remote pack preload must report completion.");
    assert.strictEqual(result.priorityPackId, "p401", "Background preload result must identify the priority pack.");
    assert.strictEqual(result.packCount, packInfos.length, "Background preload result must report all packs.");
  });
}

Promise.resolve().then(function () {
  assertStartupSchedulingContract();
  assertLevelManagerDelegation();
  return assertRemoteLoaderBackgroundPreload();
}).then(function () {
  console.log("Remote level background preload validation passed.");
}).catch(function (error) {
  setImmediate(function () {
    throw error;
  });
});
