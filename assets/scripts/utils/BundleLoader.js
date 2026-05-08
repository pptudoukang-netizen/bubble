"use strict";

var Logger = require("./Logger");

var RESOURCES_BUNDLE_NAME = "resources";
var UI_BUNDLE_NAME = "ui";
var UI_PREFAB_LEGACY_PREFIX = "prefabs/ui/";
var UI_PREFAB_BUNDLE_PREFIX = "prefabs/";
var UI_BUNDLE_PREFABS = {
  AwardView: true,
  BackpackView: true,
  BuyView: true,
  GamingCircleView: true,
  LoseView: true,
  RankingItem: true,
  RankingView: true,
  SettingView: true,
  ShopView: true,
  "SignInView ": true,
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

function hasLegacyLoader() {
  return !!(cc && cc.loader && typeof cc.loader.loadRes === "function");
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

function runBundleLoad(path, type, callback) {
  if (!resourcesBundle || typeof resourcesBundle.load !== "function") {
    callback(new Error("Resources bundle not loaded."));
    return;
  }

  if (type) {
    resourcesBundle.load(path, type, callback);
    return;
  }

  resourcesBundle.load(path, callback);
}

function runNamedBundleLoad(bundleName, bundle, path, type, callback) {
  if (!bundle || typeof bundle.load !== "function") {
    callback(new Error("Asset bundle not loaded: " + bundleName));
    return;
  }

  if (type) {
    bundle.load(path, type, callback);
    return;
  }

  bundle.load(path, callback);
}

function runBundleLoadDir(path, type, callback) {
  if (!resourcesBundle || typeof resourcesBundle.loadDir !== "function") {
    callback(new Error("Resources bundle not loaded."));
    return;
  }

  var urls = [];
  if (typeof resourcesBundle.getDirWithPath === "function") {
    try {
      var infos = resourcesBundle.getDirWithPath(path, type || null);
      if (Array.isArray(infos)) {
        urls = infos.map(function (info) {
          return info && typeof info.path === "string" ? info.path : null;
        }).filter(function (item) {
          return !!item;
        });
      }
    } catch (error) {
      Logger.warn("Resolve resource urls from bundle failed", path, error && error.message ? error.message : error);
    }
  }

  var wrappedCallback = function (error, assets) {
    callback(error, assets, urls);
  };

  if (type) {
    resourcesBundle.loadDir(path, type, wrappedCallback);
    return;
  }

  resourcesBundle.loadDir(path, wrappedCallback);
}

function runLegacyLoadRes(path, type, callback, previousError) {
  if (!hasLegacyLoader()) {
    callback(previousError || new Error("Legacy resource loader unavailable."));
    return;
  }

  var wrappedCallback = function (error, asset) {
    if (!error) {
      callback(null, asset);
      return;
    }

    if (previousError) {
      callback(new Error(previousError.message + " | fallback loadRes failed: " + (error.message || error)));
      return;
    }

    callback(error);
  };

  if (type) {
    cc.loader.loadRes(path, type, wrappedCallback);
    return;
  }

  cc.loader.loadRes(path, wrappedCallback);
}

function runLegacyLoadResDir(path, type, callback, previousError) {
  if (!hasLegacyLoader() || typeof cc.loader.loadResDir !== "function") {
    callback(previousError || new Error("Legacy resource directory loader unavailable."));
    return;
  }

  var wrappedCallback = function (error, assets, urls) {
    if (!error) {
      callback(null, assets, Array.isArray(urls) ? urls : []);
      return;
    }

    if (previousError) {
      callback(new Error(previousError.message + " | fallback loadResDir failed: " + (error.message || error)));
      return;
    }

    callback(error);
  };

  if (type) {
    cc.loader.loadResDir(path, type, wrappedCallback);
    return;
  }

  cc.loader.loadResDir(path, wrappedCallback);
}

function ensureResourcesBundleLoaded() {
  if (resourcesBundle) {
    return Promise.resolve(resourcesBundle);
  }

  if (!hasAssetManager()) {
    return Promise.resolve(null);
  }

  if (resourcesBundlePromise) {
    return resourcesBundlePromise;
  }

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
    return Promise.resolve(namedBundleCache[bundleName]);
  }

  if (!hasAssetManager()) {
    return Promise.reject(new Error("AssetManager is required to load bundle: " + bundleName));
  }

  if (namedBundlePromises[bundleName]) {
    return namedBundlePromises[bundleName];
  }

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
    if (!bundle) {
      runLegacyLoadRes(path, args.type, args.callback);
      return;
    }

    runBundleLoad(path, args.type, function (error, asset) {
      if (!error) {
        args.callback(null, asset);
        return;
      }

      runLegacyLoadRes(path, args.type, args.callback, toError(error, "Load resource by bundle failed."));
    });
  }).catch(function (error) {
    runLegacyLoadRes(path, args.type, args.callback, toError(error, "Load resources bundle failed."));
  });
}

function loadResDir(path, typeOrCallback, callback) {
  var args = normalizeTypeAndCallback(typeOrCallback, callback);
  if (!path || typeof path !== "string") {
    args.callback(new Error("Invalid resource directory path: " + path), [], []);
    return;
  }

  ensureResourcesBundleLoaded().then(function (bundle) {
    if (!bundle) {
      runLegacyLoadResDir(path, args.type, args.callback);
      return;
    }

    runBundleLoadDir(path, args.type, function (error, assets, urls) {
      if (!error) {
        args.callback(null, assets, urls);
        return;
      }

      runLegacyLoadResDir(path, args.type, args.callback, toError(error, "Load resource directory by bundle failed."));
    });
  }).catch(function (error) {
    runLegacyLoadResDir(path, args.type, args.callback, toError(error, "Load resources bundle failed."));
  });
}

module.exports = {
  ensureResourcesBundleLoaded: ensureResourcesBundleLoaded,
  ensureNamedBundleLoaded: ensureNamedBundleLoaded,
  loadRes: loadRes,
  loadResDir: loadResDir
};
