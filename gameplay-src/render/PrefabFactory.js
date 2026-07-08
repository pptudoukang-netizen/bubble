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

module.exports = PrefabFactory;
