"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_new_gift_state_v1";
var NAMESPACE = "NewGiftStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be boolean.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function createInitialState() {
  return {
    version: 1,
    claimed: false,
    claimedAt: 0
  };
}

function normalizeState(raw) {
  assertObject(raw, "New gift state must be an object.");
  if (raw.version !== 1) {
    throw new Error("New gift state version must be 1.");
  }

  return {
    version: 1,
    claimed: requireBoolean(raw.claimed, "New gift claimed"),
    claimedAt: requireNonNegativeInteger(raw.claimedAt, "New gift claimedAt")
  };
}

function NewGiftStore() {}

NewGiftStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(state);
  if (JSON.stringify(state) !== JSON.stringify(normalized)) {
    this.save(normalized);
  }
  return clone(normalized);
};

NewGiftStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

NewGiftStore.prototype.isClaimed = function (state) {
  return normalizeState(state).claimed;
};

NewGiftStore.prototype.markClaimed = function (state, now) {
  var normalized = normalizeState(state);
  if (normalized.claimed) {
    return {
      accepted: false,
      reason: "already_claimed",
      state: clone(normalized)
    };
  }

  var claimDate = now === undefined ? new Date() : now;
  if (!(claimDate instanceof Date) || Number.isNaN(claimDate.getTime())) {
    throw new Error("New gift claim date must be a valid Date.");
  }

  normalized.claimed = true;
  normalized.claimedAt = claimDate.getTime();
  return {
    accepted: true,
    state: clone(normalized)
  };
};

module.exports = NewGiftStore;
