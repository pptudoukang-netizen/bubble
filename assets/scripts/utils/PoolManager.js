"use strict";

function PoolManager() {
  this._pools = {};
  this._factories = {};
}

PoolManager.prototype.register = function (name, factory) {
  if (!this._pools[name]) {
    this._pools[name] = new cc.NodePool(name);
  }

  this._factories[name] = factory || null;
  return this._pools[name];
};

PoolManager.prototype.acquire = function (name) {
  var pool = this._pools[name];
  if (!pool) {
    return null;
  }

  if (pool.size() > 0) {
    return pool.get();
  }

  if (typeof this._factories[name] === "function") {
    return this._factories[name]();
  }

  return null;
};

PoolManager.prototype.release = function (name, node) {
  var pool = this._pools[name];
  if (!pool || !cc.isValid(node)) {
    return;
  }

  pool.put(node);
};

PoolManager.prototype.clearAll = function () {
  Object.keys(this._pools).forEach(function (name) {
    this._pools[name].clear();
  }, this);
};

PoolManager.prototype.snapshot = function () {
  var snapshot = {};

  Object.keys(this._pools).forEach(function (name) {
    snapshot[name] = this._pools[name].size();
  }, this);

  return snapshot;
};

module.exports = PoolManager;
