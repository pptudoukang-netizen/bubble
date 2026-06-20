"use strict";

var LevelConfigLoader = require("./LevelConfigLoader");
var RemoteLevelPackLoader = require("./RemoteLevelPackLoader");
var LevelPackManifest = require("./LevelPackManifest");
var RandomChallengeManager = require("./RandomChallengeManager");

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function LevelManager(options) {
  var opts = options || {};
  if (options && typeof options.loadLevelByKey === "function") {
    opts = {
      localLoader: options
    };
  }
  this._loader = opts.localLoader || new LevelConfigLoader();
  this._remoteLoader = opts.remoteLoader || new RemoteLevelPackLoader();
  this._randomChallengeManager = opts.randomChallengeManager === undefined
    ? RandomChallengeManager
    : opts.randomChallengeManager;
  this._localLevelMax = opts.localLevelMax || LevelPackManifest.LOCAL_LEVEL_MAX;
  this._cache = {};
}

LevelManager.prototype.getLevelKey = function (levelId) {
  return "level_" + padLevelId(levelId);
};

LevelManager.prototype.loadLevel = function (levelId) {
  var levelKey = this.getLevelKey(levelId);

  if (this._cache[levelKey]) {
    return Promise.resolve(clone(this._cache[levelKey]));
  }

  var loader = levelId <= this._localLevelMax ? this._loader : this._remoteLoader;
  if (!loader || typeof loader.loadLevelByKey !== "function") {
    throw new Error("Level loader missing loadLevelByKey for " + levelKey + ".");
  }

  return loader.loadLevelByKey(levelKey).then(function (config) {
    this._cache[levelKey] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.preloadLevels = function (levelIds) {
  return Promise.all(levelIds.map(function (levelId) {
    return this.loadLevel(levelId);
  }, this));
};

LevelManager.prototype.preloadRemotePackAfterLevel = function (levelId) {
  if (!this._remoteLoader || typeof this._remoteLoader.preloadPackAfterLevelId !== "function") {
    throw new Error("Remote level loader missing preloadPackAfterLevelId.");
  }
  return this._remoteLoader.preloadPackAfterLevelId(levelId);
};

LevelManager.prototype.loadAvailableLevelIds = function () {
  if (!this._remoteLoader || typeof this._remoteLoader.loadAvailableLevelIds !== "function") {
    throw new Error("Remote level loader missing loadAvailableLevelIds.");
  }
  return this._remoteLoader.loadAvailableLevelIds();
};

LevelManager.prototype.createRandomChallengeRun = function (options) {
  if (!this._randomChallengeManager || typeof this._randomChallengeManager.buildRun !== "function") {
    throw new Error("Random challenge manager missing buildRun.");
  }
  return this._randomChallengeManager.buildRun(options);
};

module.exports = LevelManager;
