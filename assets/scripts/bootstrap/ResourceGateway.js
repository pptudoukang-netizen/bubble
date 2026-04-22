"use strict";

var BundleLoader = require("../utils/BundleLoader");

function ResourceGateway(loader) {
  this.loader = loader || BundleLoader;
}

ResourceGateway.prototype.loadPrefab = function (path) {
  var loader = this.loader;
  return new Promise(function (resolve, reject) {
    if (!loader || typeof loader.loadRes !== "function") {
      reject(new Error("Resource loader unavailable for prefab: " + path));
      return;
    }

    loader.loadRes(path, cc.Prefab, function (error, prefab) {
      if (error) {
        reject(new Error("Failed to load prefab `" + path + "`: " + error.message));
        return;
      }

      resolve(prefab);
    });
  });
};

ResourceGateway.prototype.loadLevelConfigResourceUrls = function () {
  var loader = this.loader;
  return new Promise(function (resolve, reject) {
    if (!loader || typeof loader.loadResDir !== "function") {
      reject(new Error("Resource loader unavailable for level config directory"));
      return;
    }

    loader.loadResDir("config/levels", cc.JsonAsset, function (error, assets, urls) {
      if (error) {
        reject(new Error("Failed to load level list: " + error.message));
        return;
      }

      resolve(Array.isArray(urls) ? urls : []);
    });
  });
};

module.exports = ResourceGateway;
