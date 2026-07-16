"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var BundleLoader = require("../../assets/scripts/utils/BundleLoader");

function loadPrefab(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.Prefab, function (error, prefab) {
      if (error) {
        reject(new Error("Load prefab failed `" + path + "`: " + error.message));
        return;
      }

      if (!prefab) {
        reject(new Error("Load prefab returned empty asset: " + path));
        return;
      }

      resolve(prefab);
    });
  });
}

function PrefabFactory() {
  this._prefabCache = {};
  this._resolvedCache = {};
}

function releasePrefabAsset(prefab, path) {
  if (!prefab) {
    return;
  }
  if (typeof prefab.decRef !== "function") {
    throw new Error("PrefabFactory requires retained Prefab.decRef to release: " + path);
  }
  prefab.decRef();
}

function retainPrefabAsset(prefab, path) {
  if (!prefab || typeof prefab.addRef !== "function") {
    throw new Error("PrefabFactory requires Prefab.addRef to retain: " + path);
  }
  prefab.addRef();
  return prefab;
}

function requireCachePathPrefix(pathPrefix) {
  if (typeof pathPrefix !== "string" || pathPrefix.length === 0) {
    throw new Error("PrefabFactory cache path prefix must be a non-empty string.");
  }
  if (pathPrefix.trim() !== pathPrefix || pathPrefix.charAt(pathPrefix.length - 1) !== "/") {
    throw new Error("PrefabFactory cache path prefix must be normalized and end with '/': " + pathPrefix);
  }
  return pathPrefix;
}

function collectCachedPaths(factory) {
  var paths = Object.keys(factory._prefabCache);
  Object.keys(factory._resolvedCache).forEach(function (path) {
    if (paths.indexOf(path) < 0) {
      paths.push(path);
    }
  });
  return paths;
}

function releaseCachedPaths(factory, paths) {
  var releasedCount = 0;
  paths.forEach(function (path) {
    var instantiatedPrefab = factory._prefabCache[path];
    var resolvedPrefab = factory._resolvedCache[path];
    if (instantiatedPrefab && resolvedPrefab && instantiatedPrefab !== resolvedPrefab) {
      throw new Error("PrefabFactory cache ownership mismatch: " + path);
    }
    var retainedPrefab = instantiatedPrefab;
    if (!retainedPrefab) {
      retainedPrefab = resolvedPrefab;
    }
    if (retainedPrefab) {
      releasePrefabAsset(retainedPrefab, path);
      releasedCount += 1;
    }
    delete factory._prefabCache[path];
    delete factory._resolvedCache[path];
  });
  return releasedCount;
}

PrefabFactory.prototype.preload = function (paths) {
  return Promise.all(paths.map(function (path) {
    return this.load(path);
  }, this));
};

PrefabFactory.prototype.load = function (path) {
  if (this._resolvedCache.hasOwnProperty(path)) {
    return Promise.resolve(this._resolvedCache[path]);
  }

  return loadPrefab(path).then(function (prefab) {
    var retainedPrefab = retainPrefabAsset(prefab, path);
    this._resolvedCache[path] = retainedPrefab;
    this._prefabCache[path] = retainedPrefab;
    Logger.info("Prefab ready", path);

    return retainedPrefab;
  }.bind(this));
};

PrefabFactory.prototype.instantiate = function (path, parent, name) {
  var prefab = this._prefabCache[path] || null;
  if (!prefab) {
    return null;
  }

  var node = cc.instantiate(prefab);
  if (name) {
    node.name = name;
  }

  if (parent) {
    node.parent = parent;
  }

  return node;
};

PrefabFactory.prototype.resetLoadedCache = function () {
  this._prefabCache = {};
  this._resolvedCache = {};
};

PrefabFactory.prototype.releaseLoadedCache = function () {
  releaseCachedPaths(this, collectCachedPaths(this));
  this.resetLoadedCache();
};

PrefabFactory.prototype.releaseLoadedCacheByPrefix = function (pathPrefix) {
  var normalizedPrefix = requireCachePathPrefix(pathPrefix);
  var matchedPaths = collectCachedPaths(this).filter(function (path) {
    return path.indexOf(normalizedPrefix) === 0;
  });
  if (matchedPaths.length === 0) {
    throw new Error("PrefabFactory found no cached prefabs for path prefix: " + normalizedPrefix);
  }
  return releaseCachedPaths(this, matchedPaths);
};

module.exports = PrefabFactory;
