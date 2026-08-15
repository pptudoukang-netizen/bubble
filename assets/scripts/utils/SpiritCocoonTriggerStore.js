"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_spirit_cocoon_trigger_v1";
var NAMESPACE = "SpiritCocoonTriggerStore";

function createInitialState() {
  return {
    version: 1,
    firstTriggerConsumed: false
  };
}

function normalizeState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Spirit cocoon trigger state must be an object.");
  }
  if (state.version !== 1) {
    throw new Error("Spirit cocoon trigger state version must be 1.");
  }
  if (typeof state.firstTriggerConsumed !== "boolean") {
    throw new Error("Spirit cocoon firstTriggerConsumed must be boolean.");
  }
  return {
    version: 1,
    firstTriggerConsumed: state.firstTriggerConsumed
  };
}

function SpiritCocoonTriggerStore() {}

SpiritCocoonTriggerStore.prototype.consumeFirstTrigger = function () {
  var state = normalizeState(
    StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState)
  );
  if (state.firstTriggerConsumed) {
    return false;
  }
  state.firstTriggerConsumed = true;
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, state);
  return true;
};

module.exports = SpiritCocoonTriggerStore;
