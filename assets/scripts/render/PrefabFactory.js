"use strict";

var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");

function loadPrefab(path) {
  return new Promise(function (resolve) {
    BundleLoader.loadRes(path, cc.Prefab, function (error, prefab) {
      if (error) {
        resolve(null);
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
    if (prefab) {
      this._prefabCache[path] = prefab;
      Logger.info("Prefab ready", path);
    } else {
      Logger.warn("Prefab missing, fallback to runtime nodes", path);
    }

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

module.exports = PrefabFactory;
