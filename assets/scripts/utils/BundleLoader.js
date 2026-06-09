"use strict";

var LevelSelectMemoryDiagnostics = require("./LevelSelectMemoryDiagnostics");

var RESOURCES_BUNDLE_NAME = "resources";
var UI_BUNDLE_NAME = "ui";
var UI_PREFAB_LEGACY_PREFIX = "prefabs/ui/";
var UI_PREFAB_BUNDLE_PREFIX = "prefabs/";
var UI_IMAGE_SIGN_PREFIX = "image/sign/";
var UI_IMAGE_WIN_PREFIX = "image/win/";
var UI_COMMENT_ANIMATION_LEGACY_PREFIX = "ui/animation/comments/";
var UI_COMMENT_ANIMATION_BUNDLE_PREFIX = "animation/comments/";
var UI_BUNDLE_PREFABS = {
  AwardView: true,
  BackpackView: true,
  BuyView: true,
  DailyTaskView: true,
  GamingCircleView: true,
  LoseView: true,
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

function ensureResourcesBundleLoaded() {
  if (resourcesBundle) {
    LevelSelectMemoryDiagnostics.increment("bundle.cache:resources");
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
    return Promise.resolve(resourcesBundle);
  }

  if (resourcesBundlePromise) {
    LevelSelectMemoryDiagnostics.increment("bundle.pending:resources");
    return resourcesBundlePromise;
  }

  LevelSelectMemoryDiagnostics.increment("bundle.loadBundle:resources");
  resourcesBundlePromise = new Promise(function (resolve, reject) {
    cc.assetManager.loadBundle(RESOURCES_BUNDLE_NAME, function (error, bundle) {
      if (error) {
        resourcesBundlePromise = null;
        reject(toError(error, "Load resources bundle failed."));
        return;
      }

      resourcesBundle = bundle || null;
      resourcesBundlePromise = null;
      resolve(resourcesBundle);
    });
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

function ensureWeChatSubpackageLoaded(bundleName) {
  if (!isWeChatGameRuntime()) {
    return Promise.resolve();
  }

  if (namedSubpackagePromises[bundleName]) {
    return namedSubpackagePromises[bundleName];
  }

  namedSubpackagePromises[bundleName] = new Promise(function (resolve, reject) {
    wx.loadSubpackage({
      name: bundleName,
      success: function () {
        resolve();
      },
      fail: function (error) {
        namedSubpackagePromises[bundleName] = null;
        reject(toError(error, "Load WeChat subpackage failed: " + bundleName));
      }
    });
  });

  return namedSubpackagePromises[bundleName];
}

function ensureNamedBundleLoaded(bundleName) {
  if (!bundleName || typeof bundleName !== "string") {
    return Promise.reject(new Error("Invalid bundle name: " + bundleName));
  }

  if (bundleName === RESOURCES_BUNDLE_NAME) {
    return ensureResourcesBundleLoaded();
  }

  if (namedBundleCache[bundleName]) {
    LevelSelectMemoryDiagnostics.increment("bundle.cache:" + bundleName);
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
  namedBundlePromises[bundleName] = ensureWeChatSubpackageLoaded(bundleName).then(function () {
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
        resolve(bundle);
      });
    });
  }).catch(function (error) {
    namedBundlePromises[bundleName] = null;
    throw error;
  });

  return namedBundlePromises[bundleName];
}

function resolveLoadRoute(path) {
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

  if (path.indexOf(UI_IMAGE_WIN_PREFIX) === 0) {
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
  loadRes: loadRes,
  loadResDir: loadResDir
};
