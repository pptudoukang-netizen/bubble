"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_stamina_recovery_state_v1";
var NAMESPACE = "StaminaRecoveryStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireValidDate(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("StaminaRecoveryStore date must be a valid Date.");
  }
  return now;
}

function createInitialState() {
  return {
    version: 1,
    lastRecoveryAt: Date.now()
  };
}

function normalizeState(raw) {
  assertObject(raw, "Stamina recovery state must be an object.");
  if (raw.version !== 1) {
    throw new Error("Stamina recovery state version must be 1.");
  }

  return {
    version: 1,
    lastRecoveryAt: requireNonNegativeInteger(raw.lastRecoveryAt, "Stamina recovery lastRecoveryAt")
  };
}

function StaminaRecoveryStore() {}

StaminaRecoveryStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(state);
  if (JSON.stringify(state) !== JSON.stringify(normalized)) {
    this.save(normalized);
  }
  return clone(normalized);
};

StaminaRecoveryStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

StaminaRecoveryStore.prototype.markBaseline = function (now) {
  var safeNow = requireValidDate(now);
  var state = {
    version: 1,
    lastRecoveryAt: safeNow.getTime()
  };
  this.save(state);
  return clone(state);
};

module.exports = StaminaRecoveryStore;
