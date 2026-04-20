"use strict";

var LevelConfigLoader = require("./LevelConfigLoader");

function padLevelId(levelId) {
  return ("000" + levelId).slice(-3);
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function LevelManager(loader) {
  this._loader = loader || new LevelConfigLoader();
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

  return this._loader.loadLevelByKey(levelKey).then(function (config) {
    this._cache[levelKey] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.preloadLevels = function (levelIds) {
  return Promise.all(levelIds.map(function (levelId) {
    return this.loadLevel(levelId);
  }, this));
};

module.exports = LevelManager;
