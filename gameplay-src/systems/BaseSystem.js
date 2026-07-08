"use strict";

function BaseSystem(name) {
  this.name = name;
  this.ready = false;
  this.context = null;
  this.lastLevelId = null;
}

BaseSystem.prototype.initialize = function (context) {
  this.context = context || {};
  this.ready = true;
  return this;
};

BaseSystem.prototype.configureLevel = function (levelConfig) {
  this.lastLevelId = levelConfig.level.levelId;
  return this;
};

BaseSystem.prototype.snapshot = function () {
  return {
    name: this.name,
    ready: this.ready,
    lastLevelId: this.lastLevelId
  };
};

module.exports = BaseSystem;
