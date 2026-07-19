"use strict";

var LevelManager = require("../config/LevelManager");
var RemoteLevelPackLoader = require("../config/RemoteLevelPackLoader");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertPositiveLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId <= 0) {
    throw new Error("MapEditor online levelId 必须是正整数。");
  }
  return levelId;
}

function MapEditorLevelCatalog(options) {
  var opts = options === undefined ? {} : options;
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
    throw new Error("MapEditorLevelCatalog options 无效。");
  }
  this._remoteLoader = opts.remoteLoader === undefined
    ? new RemoteLevelPackLoader()
    : opts.remoteLoader;
  if (!this._remoteLoader || typeof this._remoteLoader.loadManifest !== "function") {
    throw new Error("MapEditorLevelCatalog requires RemoteLevelPackLoader.loadManifest.");
  }
  this._levelManager = opts.levelManager === undefined
    ? new LevelManager({ remoteLoader: this._remoteLoader })
    : opts.levelManager;
  if (!this._levelManager || typeof this._levelManager.loadAvailableLevelIds !== "function") {
    throw new Error("MapEditorLevelCatalog requires LevelManager.loadAvailableLevelIds.");
  }
  if (typeof this._levelManager.loadLevel !== "function") {
    throw new Error("MapEditorLevelCatalog requires LevelManager.loadLevel.");
  }
  this._levelIndexPromise = null;
}

MapEditorLevelCatalog.prototype.loadLevelIndex = function () {
  if (this._levelIndexPromise) {
    return this._levelIndexPromise;
  }
  this._levelIndexPromise = this._levelManager.loadAvailableLevelIds().then(function (levelIds) {
    if (!Array.isArray(levelIds) || levelIds.length === 0) {
      throw new Error("线上关卡列表不能为空。");
    }
    var seen = {};
    var normalized = levelIds.map(function (levelId) {
      var validLevelId = assertPositiveLevelId(levelId);
      if (seen[validLevelId]) {
        throw new Error("线上关卡列表包含重复 levelId: " + validLevelId);
      }
      seen[validLevelId] = true;
      return validLevelId;
    });
    normalized.sort(function (left, right) {
      return left - right;
    });
    return normalized;
  }).catch(function (error) {
    this._levelIndexPromise = null;
    throw error;
  }.bind(this));
  return this._levelIndexPromise;
};

MapEditorLevelCatalog.prototype.loadLevelConfig = function (levelId) {
  var normalizedLevelId = assertPositiveLevelId(levelId);
  return this._levelManager.loadLevel(normalizedLevelId).then(function (levelConfig) {
    if (!levelConfig || !levelConfig.level || levelConfig.level.levelId !== normalizedLevelId) {
      throw new Error("线上关卡配置 levelId 不匹配: " + normalizedLevelId);
    }
    return clone(levelConfig);
  });
};

MapEditorLevelCatalog.prototype.loadCloudEnvId = function () {
  return this._remoteLoader.loadManifest().then(function (manifest) {
    if (!manifest || !manifest.cloud || typeof manifest.cloud.envId !== "string" || !manifest.cloud.envId.trim()) {
      throw new Error("线上关卡 manifest 缺少 cloud.envId。");
    }
    return manifest.cloud.envId.trim();
  });
};

module.exports = MapEditorLevelCatalog;
