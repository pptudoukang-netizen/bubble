"use strict";

var LevelSelectMemoryDiagnostics = require("./LevelSelectMemoryDiagnostics");

var UI_BUNDLE_NAME = "ui";
var GAME_BUNDLE_NAME = "game";
var MAP_BUNDLE_NAME = "map";
var AUDIO_BUNDLE_NAME = "audio";
var GAME_ASSET_PREFIX = "game/";
var MAP_ASSET_PREFIX = "map/";
var UI_ASSET_PREFIX = "ui/";
var AUDIO_ASSET_PREFIX = "sound/";
var MAP_CONFIG_PREFIX = "config/";
var MAP_LEVEL_VIEW_PATH = "prefabs/ui/LevelView";
var UI_PREFAB_LEGACY_PREFIX = "prefabs/ui/";
var UI_PREFAB_BUNDLE_PREFIX = "prefabs/";
var UI_IMAGE_PREFIX = "image/";
var UI_COMMENT_ANIMATION_LEGACY_PREFIX = "ui/animation/comments/";
var UI_COMMENT_ANIMATION_BUNDLE_PREFIX = "animation/comments/";
var UI_BUNDLE_PREFABS = {
  AwardView: true,
  AddBallTipsView: true,
  BackpackView: true,
  BuyView: true,
  DailyTaskView: true,
  GamingCircleView: true,
  GeniusTipsView: true,
  SartTipsView: true,
  IntroduceView: true,
  LoseView: true,
  PauseView: true,
  PropDescriptionView: true,
  PropTipsView: true,
  PowerTipsView: true,
  RankingItem: true,
  RankingView: true,
  SettingView: true,
  ShopView: true,
  "SignInView ": true,
  StartGameView: true,
  Tips: true,
  WinView: true
};
var namedBundleCache = {};
var namedBundlePromises = {};
var namedSubpackagePromises = {};

function getRuntimeGlobal() {
  if (typeof GameGlobal !== "undefined" && GameGlobal) {
    return GameGlobal;
  }
  if (typeof window !== "undefined" && window) {
    return window;
  }
  if (typeof globalThis !== "undefined" && globalThis) {
    return globalThis;
  }
  return null;
}

function normalizeLoadOptions(options, description) {
  if (options === undefined) {
    return {};
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(description + " options must be an object.");
  }
  if (options.onProgress !== undefined && typeof options.onProgress !== "function") {
    throw new Error(description + " onProgress must be a function.");
  }
  return options;
}

function reportProgress(options, bundleName, phase, progress) {
  var safeOptions = normalizeLoadOptions(options, "Bundle load progress");
  if (typeof safeOptions.onProgress === "function") {
    var progressValue = Number(progress);
    if (!Number.isFinite(progressValue) || progressValue < 0 || progressValue > 1) {
      throw new Error("Bundle load progress must be in [0, 1]: " + bundleName + "/" + phase);
    }
    safeOptions.onProgress({
      bundleName: bundleName,
      phase: phase,
      progress: progressValue
    });
  }
}

function normalizeSubpackageProgress(progressEvent, bundleName) {
  if (!progressEvent || typeof progressEvent !== "object" || Array.isArray(progressEvent)) {
    return null;
  }
  var percent = Number(progressEvent.progress);
  if (!Number.isFinite(percent) || percent < 0) {
    return null;
  }
  return Math.min(1, percent / 100);
}

function hasAssetManager() {
  return !!(cc && cc.assetManager && typeof cc.assetManager.loadBundle === "function");
}

function toError(errorLike, fallbackMessage) {
  if (errorLike instanceof Error) {
    return errorLike;
  }
  if (typeof errorLike === "string" && errorLike) {
    return new Error(errorLike);
  }
  if (errorLike && typeof errorLike.message === "string" && errorLike.message) {
    return new Error(errorLike.message);
  }
  return new Error(fallbackMessage);
}

function normalizeTypeAndCallback(typeOrCallback, callback) {
  if (typeof callback === "function") {
    return {
      type: typeOrCallback || null,
      callback: callback
    };
  }

  if (typeof typeOrCallback === "function") {
    return {
      type: null,
      callback: typeOrCallback
    };
  }

  return {
    type: typeOrCallback || null,
    callback: typeof callback === "function" ? callback : function () {}
  };
}

function runBundleLoad(bundle, bundleName, path, type, callback) {
  if (!bundle || typeof bundle.load !== "function") {
    callback(new Error("Asset bundle not loaded: " + bundleName));
    return;
  }

  LevelSelectMemoryDiagnostics.increment("bundle.load:" + bundleName + "/" + path);
  if (type) {
    bundle.load(path, type, callback);
    return;
  }

  bundle.load(path, callback);
}

function runNamedBundleLoad(bundleName, bundle, path, type, callback) {
  runBundleLoad(bundle, bundleName, path, type, callback);
}

function runBundleLoadDir(bundle, bundleName, path, type, callback) {
  if (!bundle || typeof bundle.loadDir !== "function") {
    callback(new Error("Asset bundle directory loader unavailable: " + bundleName));
    return;
  }

  var urls = [];
  if (typeof bundle.getDirWithPath !== "function") {
    callback(new Error("Asset bundle directory metadata unavailable: " + bundleName));
    return;
  }

  var infos = bundle.getDirWithPath(path, type || null);
  if (!Array.isArray(infos)) {
    callback(new Error("Asset bundle directory metadata invalid: " + bundleName + "/" + path));
    return;
  }
  urls = infos.map(function (info) {
    return info && typeof info.path === "string" ? info.path : null;
  }).filter(function (item) {
    return !!item;
  });

  var wrappedCallback = function (error, assets) {
    callback(error, assets, urls);
  };

  LevelSelectMemoryDiagnostics.increment("bundle.loadDir:" + bundleName + "/" + path);
  if (type) {
    bundle.loadDir(path, type, wrappedCallback);
    return;
  }

  bundle.loadDir(path, wrappedCallback);
}

function isWeChatGameRuntime() {
  return !!(
    typeof wx !== "undefined" &&
    wx &&
    typeof wx.loadSubpackage === "function"
  );
}

function ensureWeChatSubpackageLoaded(bundleName, options) {
  var loadOptions = normalizeLoadOptions(options, "WeChat subpackage load");
  if (!isWeChatGameRuntime()) {
    reportProgress(loadOptions, bundleName, "subpackage", 1);
    return Promise.resolve();
  }

  if (namedSubpackagePromises[bundleName]) {
    return namedSubpackagePromises[bundleName];
  }

  namedSubpackagePromises[bundleName] = new Promise(function (resolve, reject) {
    reportProgress(loadOptions, bundleName, "subpackage", 0);
    var loadTask = wx.loadSubpackage({
      name: bundleName,
      success: function () {
        reportProgress(loadOptions, bundleName, "subpackage", 1);
        resolve();
      },
      fail: function (error) {
        namedSubpackagePromises[bundleName] = null;
        reject(toError(error, "Load WeChat subpackage failed: " + bundleName));
      }
    });
    if (loadTask && typeof loadTask.onProgressUpdate === "function") {
      loadTask.onProgressUpdate(function (progressEvent) {
        var normalizedProgress = normalizeSubpackageProgress(progressEvent, bundleName);
        if (normalizedProgress !== null) {
          reportProgress(loadOptions, bundleName, "subpackage", normalizedProgress);
        }
      });
    }
  });

  return namedSubpackagePromises[bundleName];
}

function ensureNamedBundleLoaded(bundleName, options) {
  var loadOptions = normalizeLoadOptions(options, "named bundle load");
  if (!bundleName || typeof bundleName !== "string") {
    return Promise.reject(new Error("Invalid bundle name: " + bundleName));
  }

  if (namedBundleCache[bundleName]) {
    LevelSelectMemoryDiagnostics.increment("bundle.cache:" + bundleName);
    reportProgress(loadOptions, bundleName, "subpackage", 1);
    reportProgress(loadOptions, bundleName, "bundle", 1);
    return Promise.resolve(namedBundleCache[bundleName]);
  }

  if (!hasAssetManager()) {
    return Promise.reject(new Error("AssetManager is required to load bundle: " + bundleName));
  }

  if (namedBundlePromises[bundleName]) {
    LevelSelectMemoryDiagnostics.increment("bundle.pending:" + bundleName);
    return namedBundlePromises[bundleName];
  }

  LevelSelectMemoryDiagnostics.increment("bundle.loadBundle:" + bundleName);
  namedBundlePromises[bundleName] = ensureWeChatSubpackageLoaded(bundleName, loadOptions).then(function () {
    reportProgress(loadOptions, bundleName, "bundle", 0);
    return new Promise(function (resolve, reject) {
      cc.assetManager.loadBundle(bundleName, function (error, bundle) {
        namedBundlePromises[bundleName] = null;
        if (error) {
          reject(toError(error, "Load asset bundle failed: " + bundleName));
          return;
        }

        if (!bundle || typeof bundle.load !== "function") {
          reject(new Error("Loaded asset bundle is invalid: " + bundleName));
          return;
        }

        namedBundleCache[bundleName] = bundle;
        reportProgress(loadOptions, bundleName, "bundle", 1);
        resolve(bundle);
      });
    });
  }).catch(function (error) {
    namedBundlePromises[bundleName] = null;
    throw error;
  });

  return namedBundlePromises[bundleName];
}

function ensureGameplayCodeLoaded() {
  var runtimeGlobal = getRuntimeGlobal();
  if (!runtimeGlobal) {
    return Promise.reject(new Error("Runtime global is required after loading the game bundle."));
  }
  if (runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ !== true) {
    return Promise.reject(new Error("Game bundle loaded without gameplay code completion marker."));
  }
  if (typeof runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ !== "function") {
    return Promise.reject(new Error("Game bundle loaded without gameplay module loader."));
  }
  if (
    typeof runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ !== "string" ||
    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__.length === 0
  ) {
    return Promise.reject(new Error("Game bundle loaded without gameplay code build hash."));
  }
  return Promise.resolve();
}

function requireGameplayModule(moduleName) {
  if (typeof moduleName !== "string" || moduleName.trim().length === 0) {
    throw new Error("Gameplay module name must be a non-empty string.");
  }
  var runtimeGlobal = getRuntimeGlobal();
  if (!runtimeGlobal || typeof runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ !== "function") {
    throw new Error("Lazy gameplay module loader is required for: " + moduleName);
  }
  return runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__(moduleName);
}

function releaseNamedBundle(bundleName) {
  if (!bundleName || typeof bundleName !== "string") {
    throw new Error("Invalid bundle name for release: " + bundleName);
  }
  if (!namedBundleCache[bundleName]) {
    return;
  }

  delete namedBundleCache[bundleName];
  namedBundlePromises[bundleName] = null;

  if (!hasAssetManager()) {
    throw new Error("AssetManager is required to release bundle: " + bundleName);
  }
  if (typeof cc.assetManager.removeBundle !== "function") {
    throw new Error("cc.assetManager.removeBundle is required to release bundle: " + bundleName);
  }

  if (typeof cc.assetManager.getBundle !== "function") {
    throw new Error("cc.assetManager.getBundle is required to release bundle: " + bundleName);
  }

  var loadedBundle = cc.assetManager.getBundle(bundleName);
  if (!loadedBundle) {
    throw new Error("Loaded bundle missing before release: " + bundleName);
  }
  if (typeof loadedBundle.releaseAll !== "function") {
    throw new Error("Asset bundle releaseAll is required before release: " + bundleName);
  }

  loadedBundle.releaseAll();
  cc.assetManager.removeBundle(loadedBundle);

  LevelSelectMemoryDiagnostics.increment("bundle.release:" + bundleName);
}

function resolveLoadRoute(path) {
  if (path.indexOf(GAME_ASSET_PREFIX) === 0) {
    return {
      bundleName: GAME_BUNDLE_NAME,
      path: path.slice(GAME_ASSET_PREFIX.length)
    };
  }

  if (path.indexOf(MAP_ASSET_PREFIX) === 0) {
    return {
      bundleName: MAP_BUNDLE_NAME,
      path: path.slice(MAP_ASSET_PREFIX.length)
    };
  }

  if (path.indexOf(UI_ASSET_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path.slice(UI_ASSET_PREFIX.length)
    };
  }

  if (path.indexOf(AUDIO_ASSET_PREFIX) === 0) {
    return {
      bundleName: AUDIO_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(MAP_CONFIG_PREFIX) === 0 || path === MAP_LEVEL_VIEW_PATH) {
    return {
      bundleName: MAP_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_COMMENT_ANIMATION_LEGACY_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: UI_COMMENT_ANIMATION_BUNDLE_PREFIX + path.slice(UI_COMMENT_ANIMATION_LEGACY_PREFIX.length)
    };
  }

  if (path.indexOf(UI_IMAGE_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_PREFAB_LEGACY_PREFIX) !== 0) {
    throw new Error("No asset bundle route configured for path: " + path);
  }

  var prefabName = path.slice(UI_PREFAB_LEGACY_PREFIX.length);
  if (UI_BUNDLE_PREFABS[prefabName] !== true) {
    throw new Error("No UI prefab bundle route configured for path: " + path);
  }

  return {
    bundleName: UI_BUNDLE_NAME,
    path: UI_PREFAB_BUNDLE_PREFIX + prefabName
  };
}

function loadRes(path, typeOrCallback, callback) {
  var args = normalizeTypeAndCallback(typeOrCallback, callback);
  if (!path || typeof path !== "string") {
    args.callback(new Error("Invalid resource path: " + path));
    return;
  }

  var route = resolveLoadRoute(path);
  ensureNamedBundleLoaded(route.bundleName).then(function (bundle) {
    runNamedBundleLoad(route.bundleName, bundle, route.path, args.type, args.callback);
  }).catch(args.callback);
}

function loadResDir(path, typeOrCallback, callback) {
  var args = normalizeTypeAndCallback(typeOrCallback, callback);
  if (!path || typeof path !== "string") {
    args.callback(new Error("Invalid resource directory path: " + path), [], []);
    return;
  }

  var route = resolveLoadRoute(path);
  ensureNamedBundleLoaded(route.bundleName).then(function (bundle) {
    runBundleLoadDir(bundle, route.bundleName, route.path, args.type, args.callback);
  }).catch(args.callback);
}

module.exports = {
  ensureNamedBundleLoaded: ensureNamedBundleLoaded,
  releaseNamedBundle: releaseNamedBundle,
  ensureGameplayBundleLoaded: function () {
    return ensureNamedBundleLoaded(GAME_BUNDLE_NAME).then(function (bundle) {
      return ensureGameplayCodeLoaded().then(function () {
        return bundle;
      });
    });
  },
  ensureGameplayCodeLoaded: ensureGameplayCodeLoaded,
  requireGameplayModule: requireGameplayModule,
  loadRes: loadRes,
  loadResDir: loadResDir
};
