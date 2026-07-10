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
  if (!cc || !cc.assetManager || typeof cc.assetManager.releaseAsset !== "function") {
    throw new Error("PrefabFactory requires cc.assetManager.releaseAsset to release: " + path);
  }
  cc.assetManager.releaseAsset(prefab);
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
    this._resolvedCache[path] = prefab;
    this._prefabCache[path] = prefab;
    Logger.info("Prefab ready", path);

    return prefab;
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
  var released = {};
  Object.keys(this._prefabCache).forEach(function (path) {
    var prefab = this._prefabCache[path];
    if (prefab && released[path] !== true) {
      releasePrefabAsset(prefab, path);
      released[path] = true;
    }
  }, this);
  Object.keys(this._resolvedCache).forEach(function (path) {
    var prefab = this._resolvedCache[path];
    if (prefab && released[path] !== true) {
      releasePrefabAsset(prefab, path);
      released[path] = true;
    }
  }, this);
  this.resetLoadedCache();
};

module.exports = PrefabFactory;
