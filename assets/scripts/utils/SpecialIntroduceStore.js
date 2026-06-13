"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_special_introduce_viewed_v1";
var NAMESPACE = "SpecialIntroduceStore";
var SCHEMA_VERSION = 1;

function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    viewedKeys: {}
  };
}

function requireState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("SpecialIntroduceStore state must be an object.");
  }
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("SpecialIntroduceStore schemaVersion mismatch.");
  }
  if (!state.viewedKeys || typeof state.viewedKeys !== "object" || Array.isArray(state.viewedKeys)) {
    throw new Error("SpecialIntroduceStore viewedKeys must be an object.");
  }
  Object.keys(state.viewedKeys).forEach(function (key) {
    if (typeof state.viewedKeys[key] !== "boolean") {
      throw new Error("SpecialIntroduceStore viewed flag must be boolean: " + key);
    }
  });
  return state;
}

function requireIntroduceKey(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("SpecialIntroduceStore key must be a non-empty string.");
  }
  return key;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function SpecialIntroduceStore() {
  this.state = requireState(StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState));
}

SpecialIntroduceStore.prototype.load = function () {
  this.state = requireState(StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState));
  return cloneState(this.state);
};

SpecialIntroduceStore.prototype.save = function (state) {
  var safeState = requireState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, safeState);
  this.state = cloneState(safeState);
  return cloneState(this.state);
};

SpecialIntroduceStore.prototype.hasViewed = function (key) {
  var safeKey = requireIntroduceKey(key);
  return this.state.viewedKeys[safeKey] === true;
};

SpecialIntroduceStore.prototype.markViewed = function (key) {
  var safeKey = requireIntroduceKey(key);
  if (this.state.viewedKeys[safeKey] === true) {
    return cloneState(this.state);
  }
  var nextState = cloneState(this.state);
  nextState.viewedKeys[safeKey] = true;
  return this.save(nextState);
};

module.exports = SpecialIntroduceStore;
