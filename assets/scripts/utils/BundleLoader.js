"use strict";

var LevelSelectMemoryDiagnostics = require("./LevelSelectMemoryDiagnostics");

var RESOURCES_BUNDLE_NAME = "resources";
var UI_BUNDLE_NAME = "ui";
var GAME_BUNDLE_NAME = "game";
var GAMEPLAY_CODE_RESOURCE_PATH = "generated/lazy-gameplay-code";
var GAME_ASSET_PREFIX = "game/";
var UI_PREFAB_LEGACY_PREFIX = "prefabs/ui/";
var UI_PREFAB_BUNDLE_PREFIX = "prefabs/";
var UI_IMAGE_SIGN_PREFIX = "image/sign/";
var UI_IMAGE_LOSE_PREFIX = "image/lose/";
var UI_IMAGE_WIN_PREFIX = "image/win/";
var UI_IMAGE_COMMONE_PREFIX = "image/commone/";
var UI_IMAGE_SETTING_PREFIX = "image/setting/";
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
var resourcesBundle = null;
var resourcesBundlePromise = null;
var namedBundleCache = {};
var namedBundlePromises = {};
var namedSubpackagePromises = {};
var gameplayCodePromise = null;

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

function getAllRuntimeGlobals() {
  var globals = [];
  function pushGlobal(candidate) {
    if (candidate && globals.indexOf(candidate) < 0) {
      globals.push(candidate);
    }
  }
  if (typeof GameGlobal !== "undefined") {
    pushGlobal(GameGlobal);
  }
  if (typeof window !== "undefined") {
    pushGlobal(window);
  }
  if (typeof globalThis !== "undefined") {
    pushGlobal(globalThis);
  }
  return globals;
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

function ensureResourcesBundleLoaded(options) {
  var loadOptions = normalizeLoadOptions(options, "resources bundle load");
  if (resourcesBundle) {
    LevelSelectMemoryDiagnostics.increment("bundle.cache:resources");
    reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "subpackage", 1);
    reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "bundle", 1);
    return Promise.resolve(resourcesBundle);
  }

  if (!hasAssetManager()) {
    return Promise.reject(new Error("AssetManager is required to load resources."));
  }

  var existingBundle = (cc.assetManager && typeof cc.assetManager.getBundle === "function")
    ? cc.assetManager.getBundle(RESOURCES_BUNDLE_NAME)
    : null;
  if (existingBundle && typeof existingBundle.load === "function") {
    resourcesBundle = existingBundle;
    LevelSelectMemoryDiagnostics.increment("bundle.existing:resources");
    reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "subpackage", 1);
    reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "bundle", 1);
    return Promise.resolve(resourcesBundle);
  }

  if (resourcesBundlePromise) {
    LevelSelectMemoryDiagnostics.increment("bundle.pending:resources");
    return resourcesBundlePromise;
  }

  LevelSelectMemoryDiagnostics.increment("bundle.loadBundle:resources");
  resourcesBundlePromise = ensureWeChatSubpackageLoaded(RESOURCES_BUNDLE_NAME, loadOptions).then(function () {
    reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "bundle", 0);
    return new Promise(function (resolve, reject) {
      cc.assetManager.loadBundle(RESOURCES_BUNDLE_NAME, function (error, bundle) {
        if (error) {
          resourcesBundlePromise = null;
          reject(toError(error, "Load resources bundle failed."));
          return;
        }

        if (!bundle || typeof bundle.load !== "function") {
          resourcesBundlePromise = null;
          reject(new Error("Loaded resources bundle is invalid."));
          return;
        }

        resourcesBundle = bundle;
        resourcesBundlePromise = null;
        reportProgress(loadOptions, RESOURCES_BUNDLE_NAME, "bundle", 1);
        resolve(resourcesBundle);
      });
    });
  }).catch(function (error) {
    resourcesBundlePromise = null;
    throw error;
  });

  return resourcesBundlePromise;
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

  if (bundleName === RESOURCES_BUNDLE_NAME) {
    return ensureResourcesBundleLoaded(loadOptions);
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

function resolveGameplayCodePath() {
  var runtimeGlobal = getRuntimeGlobal();
  if (!runtimeGlobal) {
    return "";
  }
  if (runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__ === undefined) {
    return "";
  }
  if (typeof runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__ !== "string") {
    throw new Error("Lazy gameplay code path must be a string.");
  }
  if (runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__.trim().length === 0) {
    throw new Error("Lazy gameplay code path must not be empty.");
  }
  var codePath = runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__;
  if (codePath.indexOf("src/") === 0) {
    return "./" + codePath;
  }
  return codePath;
}

function ensureGameplayCodeLoaded() {
  var runtimeGlobal = getRuntimeGlobal();
  var codePath = resolveGameplayCodePath();
  if (runtimeGlobal && runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ === true) {
    return Promise.resolve();
  }
  if (gameplayCodePromise) {
    return gameplayCodePromise;
  }
  if (codePath.length === 0) {
    gameplayCodePromise = loadGameplayCodeFromResource().catch(function (error) {
      gameplayCodePromise = null;
      throw error;
    });
    return gameplayCodePromise;
  }

  if (!cc || !cc.assetManager || typeof cc.assetManager.loadScript !== "function") {
    return Promise.reject(new Error("cc.assetManager.loadScript is required for lazy gameplay code."));
  }
  try {
    rememberCocosRequire();
  } catch (rememberError) {
    return Promise.reject(rememberError);
  }

  gameplayCodePromise = new Promise(function (resolve, reject) {
    cc.assetManager.loadScript([codePath], function (error) {
      if (error) {
        gameplayCodePromise = null;
        reject(toError(error, "Load lazy gameplay code failed."));
        return;
      }
      var loadedRuntimeGlobal = getRuntimeGlobal();
      if (!loadedRuntimeGlobal || loadedRuntimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ !== true) {
        gameplayCodePromise = null;
        reject(new Error("Lazy gameplay code loaded without completion marker."));
        return;
      }
      if (typeof loadedRuntimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ !== "function") {
        gameplayCodePromise = null;
        reject(new Error("Lazy gameplay code loaded without gameplay module loader."));
        return;
      }
      resolve();
    });
  }).catch(function (error) {
    gameplayCodePromise = null;
    throw error;
  });

  return gameplayCodePromise;
}

function readGameplayCodeFromAsset(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    throw new Error("Lazy gameplay code resource must be an asset object.");
  }
  if (asset.json && typeof asset.json === "object" && typeof asset.json.code === "string") {
    return asset.json.code;
  }
  if (typeof asset.code === "string") {
    return asset.code;
  }
  throw new Error("Lazy gameplay code resource must provide json.code.");
}

function rememberCocosRequire() {
  var globals = getAllRuntimeGlobals();
  if (globals.length === 0) {
    throw new Error("Runtime global is required before loading lazy gameplay code.");
  }
  var cocosRequire = null;
  globals.forEach(function (runtimeGlobal) {
    if (!cocosRequire && runtimeGlobal && typeof runtimeGlobal.__BUBBLE_COCOS_REQUIRE__ === "function") {
      cocosRequire = runtimeGlobal.__BUBBLE_COCOS_REQUIRE__;
    }
  });
  if (!cocosRequire && typeof __require === "function") {
    cocosRequire = __require;
  }
  globals.forEach(function (runtimeGlobal) {
    if (!cocosRequire && runtimeGlobal && typeof runtimeGlobal.__require === "function") {
      cocosRequire = runtimeGlobal.__require;
    }
  });
  if (typeof cocosRequire !== "function") {
    throw new Error("Cocos module loader must exist before loading lazy gameplay code.");
  }
  globals.forEach(function (runtimeGlobal) {
    runtimeGlobal.__BUBBLE_COCOS_REQUIRE__ = cocosRequire;
  });
}

function evaluateGameplayCode(codeText) {
  if (typeof codeText !== "string" || codeText.length === 0) {
    throw new Error("Lazy gameplay code text must be a non-empty string.");
  }
  rememberCocosRequire();
  var globalEval = eval;
  globalEval(codeText);
  var runtimeGlobal = getRuntimeGlobal();
  if (!runtimeGlobal || runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ !== true) {
    throw new Error("Lazy gameplay code resource evaluated without completion marker.");
  }
  if (typeof runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ !== "function") {
    throw new Error("Lazy gameplay code resource evaluated without gameplay module loader.");
  }
}

function loadGameplayCodeFromResource() {
  return new Promise(function (resolve, reject) {
    loadRes(GAMEPLAY_CODE_RESOURCE_PATH, function (error, asset) {
      if (error) {
        reject(toError(error, "Load lazy gameplay code resource failed."));
        return;
      }
      try {
        evaluateGameplayCode(readGameplayCodeFromAsset(asset));
        resolve();
      } catch (evalError) {
        reject(evalError);
      }
    });
  });
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
  if (bundleName === RESOURCES_BUNDLE_NAME) {
    throw new Error("Resources bundle cannot be released at runtime.");
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

  if (path.indexOf(UI_COMMENT_ANIMATION_LEGACY_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: UI_COMMENT_ANIMATION_BUNDLE_PREFIX + path.slice(UI_COMMENT_ANIMATION_LEGACY_PREFIX.length)
    };
  }

  if (path.indexOf(UI_IMAGE_SIGN_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_IMAGE_LOSE_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_IMAGE_WIN_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_IMAGE_COMMONE_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_IMAGE_SETTING_PREFIX) === 0) {
    return {
      bundleName: UI_BUNDLE_NAME,
      path: path
    };
  }

  if (path.indexOf(UI_PREFAB_LEGACY_PREFIX) !== 0) {
    return {
      bundleName: RESOURCES_BUNDLE_NAME,
      path: path
    };
  }

  var prefabName = path.slice(UI_PREFAB_LEGACY_PREFIX.length);
  if (UI_BUNDLE_PREFABS[prefabName] !== true) {
    return {
      bundleName: RESOURCES_BUNDLE_NAME,
      path: path
    };
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
  if (route.bundleName !== RESOURCES_BUNDLE_NAME) {
    ensureNamedBundleLoaded(route.bundleName).then(function (bundle) {
      runNamedBundleLoad(route.bundleName, bundle, route.path, args.type, args.callback);
    }).catch(args.callback);
    return;
  }

  ensureResourcesBundleLoaded().then(function (bundle) {
    runBundleLoad(bundle, RESOURCES_BUNDLE_NAME, path, args.type, args.callback);
  }).catch(args.callback);
}

function loadResDir(path, typeOrCallback, callback) {
  var args = normalizeTypeAndCallback(typeOrCallback, callback);
  if (!path || typeof path !== "string") {
    args.callback(new Error("Invalid resource directory path: " + path), [], []);
    return;
  }

  ensureResourcesBundleLoaded().then(function (bundle) {
    runBundleLoadDir(bundle, RESOURCES_BUNDLE_NAME, path, args.type, args.callback);
  }).catch(args.callback);
}

module.exports = {
  ensureResourcesBundleLoaded: ensureResourcesBundleLoaded,
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
