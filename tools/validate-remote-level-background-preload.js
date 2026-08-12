"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_LOADER_PATH = path.join(PROJECT_ROOT, "assets/scripts/config/RemoteLevelPackLoader.js");
var LEVEL_MANAGER_PATH = path.join(PROJECT_ROOT, "assets/scripts/config/LevelManager.js");
var STARTUP_METHODS_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapStartupMethods.js");
var BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrap.js");
var START_GAME_METHODS_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js");
var START_GAME_VIEW_CONTROLLER_PATH = path.join(PROJECT_ROOT, "assets/scripts/ui/StartGameViewController.js");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

function createPack(id, from, to) {
  return {
    id: id,
    from: from,
    to: to,
    sha256: new Array(65).join("a")
  };
}

function assertStartupSchedulingContract() {
  var startupSource = fs.readFileSync(STARTUP_METHODS_PATH, "utf8");
  var bootstrapSource = fs.readFileSync(BOOTSTRAP_PATH, "utf8");
  assert(
    bootstrapSource.indexOf("_runStartupCloudSyncAndRemotePackPreload: GameBootstrapStartupMethods._runStartupCloudSyncAndRemotePackPreload") >= 0,
    "GameBootstrap must expose the startup cloud-sync and remote-pack preload method."
  );
  var startupOnlineTaskCalls = startupSource.match(/return this\._runStartupCloudSyncAndRemotePackPreload\(\);/g);
  assert(Array.isArray(startupOnlineTaskCalls), "Startup flow must execute cloud sync and remote-pack cache before level select.");
  assert.strictEqual(
    startupOnlineTaskCalls.length,
    2,
    "Both startup loading branches must execute cloud sync and remote-pack cache before level select."
  );
  assert(
    startupSource.indexOf("applyDuringStartup: true") >= 0,
    "Startup cloud sync must apply the cloud profile before level select renders."
  );
  assert(
    startupSource.indexOf("onProgress: function (event)") >= 0 &&
    startupSource.indexOf('"缓存远端关卡 " + completedPackCount + "/" + totalPackCount + "..."') >= 0,
    "Startup remote-pack cache must report per-pack progress to LoadingView."
  );
  assert(
    startupSource.indexOf("STARTUP_ONLINE_REMOTE_PACK_PROGRESS_SPAN") >= 0,
    "Startup LoadingView must reserve a dedicated progress range for remote-pack cache."
  );
  assert(
    /_syncPlayerProfileFromCloud\(\{[\s\S]*?applyDuringStartup: true[\s\S]*?\.then\(function \(\) \{[\s\S]*?this\._scheduleBackgroundRemoteLevelPackPreload\([\s\S]*?\}\.bind\(this\)\)/.test(startupSource),
    "Startup cloud-sync completion callback must retain the GameBootstrap instance when scheduling remote-pack cache."
  );

  var scheduleCalls = startupSource.match(/schedulePostLevelSelectBackgroundWork\(this\);/g);
  assert(Array.isArray(scheduleCalls), "Startup flow must schedule post-level-select background work.");
  assert.strictEqual(scheduleCalls.length, 2, "Both startup loading branches must schedule post-level-select background work.");
  assert(
    startupSource.indexOf("LEVEL_SELECT_IDLE_BEFORE_BACKGROUND_WORK_MS = 5000") >= 0,
    "Startup flow must reserve five seconds for smooth level-select interaction before background work."
  );
  var friendClaimIndex = startupSource.indexOf("return host._scheduleDeferredFriendStaminaGiftClaim();");
  var uiWarmupIndex = startupSource.indexOf("return host._scheduleDeferredUiBundleWarmup();");
  assert(
    friendClaimIndex >= 0 && uiWarmupIndex > friendClaimIndex,
    "Post-level-select background work must retain only friend-stamina claim and UI warmup."
  );
  var postLevelSelectStart = startupSource.indexOf("function schedulePostLevelSelectBackgroundWork(host)");
  var postLevelSelectEnd = startupSource.indexOf("module.exports =", postLevelSelectStart);
  var postLevelSelectSource = startupSource.slice(postLevelSelectStart, postLevelSelectEnd);
  assert.strictEqual(
    postLevelSelectSource.indexOf("_scheduleDeferredPlayerCloudProfileSync"),
    -1,
    "Cloud profile sync must not run after level select becomes interactive."
  );
  assert.strictEqual(
    postLevelSelectSource.indexOf("_scheduleBackgroundRemoteLevelPackPreload"),
    -1,
    "Remote-pack cache must not run after level select becomes interactive."
  );
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

  var startGameViewControllerSource = fs.readFileSync(START_GAME_VIEW_CONTROLLER_PATH, "utf8");
  assert(
    startGameViewControllerSource.indexOf('yumi: "ui/image/start_view/yumi"') >= 0,
    "StartGameView must load Yumi avatar from ui bundle."
  );
  assert.strictEqual(
    startGameViewControllerSource.indexOf("spirit_system/"),
    -1,
    "StartGameView must not load spirit_system bundle resources during first preparation view open."
  );
}

function assertLevelManagerDelegation() {
  var LevelManager = require(LEVEL_MANAGER_PATH);
  var delegatedPriorityLevelId = 0;
  var delegatedOptions = null;
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
      preloadAllPacks: function (priorityLevelId, options) {
        delegatedPriorityLevelId = priorityLevelId;
        delegatedOptions = options;
        return expectedResult;
      }
    },
    randomChallengeManager: null,
    localLevelMax: 10
  });

  var options = {
    onProgress: function () {}
  };
  assert.strictEqual(manager.preloadAllRemotePacks(450, options), expectedResult, "LevelManager must return remote preload promise.");
  assert.strictEqual(delegatedPriorityLevelId, 450, "LevelManager must preserve remote preload priority level id.");
  assert.strictEqual(delegatedOptions, options, "LevelManager must forward remote preload progress callback.");
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
    version: "remote-pack-test-v1",
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
  var progressEvents = [];
  var markedManifest = null;

  loader.loadManifest = function () {
    return Promise.resolve(manifest);
  };
  loader._isManifestPreloadComplete = function (loadedManifest) {
    assert.strictEqual(loadedManifest, manifest, "Background preload cache check must use loaded remote manifest.");
    return Promise.resolve(false);
  };
  loader._markManifestPreloadComplete = function (loadedManifest) {
    assert.strictEqual(loadedManifest, manifest, "Background preload completion marker must use loaded remote manifest.");
    markedManifest = loadedManifest;
    return Promise.resolve();
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

  var firstPromise = loader.preloadAllPacks(450, {
    onProgress: function (event) {
      progressEvents.push(event);
    }
  });
  var duplicatePromise = loader.preloadAllPacks(450);
  assert.strictEqual(duplicatePromise, firstPromise, "Repeated background preload must reuse the same promise.");

  return firstPromise.then(function (result) {
    assert.strictEqual(startedPackIds[0], "p401", "Highest unlocked level pack must preload first.");
    assert.strictEqual(maxActiveCount, 1, "Background remote pack preload must serialize pack downloads.");
    assert.strictEqual(new Set(startedPackIds).size, packInfos.length, "Background preload must fetch every remote pack once.");
    assert.strictEqual(result.preloaded, true, "Background remote pack preload must report completion.");
    assert.strictEqual(result.priorityPackId, "p401", "Background preload result must identify the priority pack.");
    assert.strictEqual(result.packCount, packInfos.length, "Background preload result must report all packs.");
    assert.strictEqual(result.cacheHit, false, "First remote-pack preload must report cache miss.");
    assert.strictEqual(markedManifest, manifest, "Full remote-pack preload must persist its completion marker.");
    assert.strictEqual(progressEvents.length, packInfos.length + 1, "Background preload must report initial and every completed-pack progress.");
    assert.deepStrictEqual(
      progressEvents[0],
      { completedPackCount: 0, totalPackCount: packInfos.length, packId: null },
      "Background preload must report zero progress before fetching the first pack."
    );
    progressEvents.forEach(function (event, index) {
      assert.strictEqual(event.completedPackCount, index, "Background preload progress must advance once per completed pack.");
      assert.strictEqual(event.totalPackCount, packInfos.length, "Background preload progress must retain total pack count.");
    });
  });
}

function assertRemoteLoaderCompletedCacheReuse() {
  var RemoteLevelPackLoader = require(REMOTE_LOADER_PATH);
  var manifest = {
    version: "remote-pack-test-v1",
    localLevelMax: 10,
    totalLevelCount: 100,
    packs: [createPack("p11", 11, 100)]
  };
  var loader = new RemoteLevelPackLoader({
    platform: {}
  });
  var progressEvents = [];
  loader.loadManifest = function () {
    return Promise.resolve(manifest);
  };
  loader._isManifestPreloadComplete = function () {
    return Promise.resolve(true);
  };
  loader._fetchPackText = function () {
    throw new Error("Completed remote-pack cache must not read individual packs at startup.");
  };
  loader._markManifestPreloadComplete = function () {
    throw new Error("Completed remote-pack cache must not rewrite completion marker.");
  };

  return loader.preloadAllPacks(50, {
    onProgress: function (event) {
      progressEvents.push(event);
    }
  }).then(function (result) {
    assert.strictEqual(result.cacheHit, true, "Completed remote-pack cache must report cache hit.");
    assert.deepStrictEqual(
      progressEvents,
      [
        { completedPackCount: 0, totalPackCount: 1, packId: null },
        { completedPackCount: 1, totalPackCount: 1, packId: null }
      ],
      "Completed remote-pack cache must complete LoadingView progress without per-pack reads."
    );
  });
}

function assertPreloadCompletionMarkerContract() {
  var RemoteLevelPackLoader = require(REMOTE_LOADER_PATH);
  var files = {};
  var fileSystemManager = {
    access: function (options) {
      if (Object.prototype.hasOwnProperty.call(files, options.path)) {
        options.success();
        return;
      }
      options.fail();
    },
    readFile: function (options) {
      if (!Object.prototype.hasOwnProperty.call(files, options.filePath)) {
        options.fail({ errMsg: "missing" });
        return;
      }
      options.success({ data: files[options.filePath] });
    },
    writeFile: function (options) {
      files[options.filePath] = options.data;
      options.success();
    },
    mkdir: function (options) {
      options.success();
    }
  };
  var loader = new RemoteLevelPackLoader({
    platform: {
      env: { USER_DATA_PATH: "/userdata" },
      getFileSystemManager: function () {
        return fileSystemManager;
      }
    }
  });
  var manifest = {
    version: "remote-pack-test-v1",
    packs: [createPack("p11", 11, 100)]
  };
  return loader._isManifestPreloadComplete(manifest).then(function (beforeWrite) {
    assert.strictEqual(beforeWrite, false, "Missing preload completion marker must be a cache miss.");
    return loader._markManifestPreloadComplete(manifest);
  }).then(function () {
    return loader._isManifestPreloadComplete(manifest);
  }).then(function (afterWrite) {
    assert.strictEqual(afterWrite, true, "Written preload completion marker must be recognized.");
    var changedManifest = {
      version: manifest.version,
      packs: [{ id: "p11", from: 11, to: 100, sha256: new Array(65).join("b") }]
    };
    return loader._isManifestPreloadComplete(changedManifest);
  }).then(function (afterManifestChange) {
    assert.strictEqual(afterManifestChange, false, "Changed manifest pack hash must invalidate preload completion marker.");
  });
}

Promise.resolve().then(function () {
  assertStartupSchedulingContract();
  assertLevelManagerDelegation();
  return assertRemoteLoaderBackgroundPreload();
}).then(function () {
  return assertRemoteLoaderCompletedCacheReuse();
}).then(function () {
  return assertPreloadCompletionMarkerContract();
}).then(function () {
  console.log("Remote level background preload validation passed.");
}).catch(function (error) {
  setImmediate(function () {
    throw error;
  });
});
