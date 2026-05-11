"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_star_chest_state_v1";
var NAMESPACE = "StarChestStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function normalizeLog(rawLog) {
  assertObject(rawLog, "Star chest open log must be an object.");
  if (!Array.isArray(rawLog.rewardItems)) {
    throw new Error("Star chest open log rewardItems must be an array.");
  }

  return {
    openId: requireNonEmptyString(rawLog.openId, "Star chest open log openId"),
    totalStarsAtOpen: requireNonNegativeInteger(rawLog.totalStarsAtOpen, "Star chest open log totalStarsAtOpen"),
    consumedStarsAfterOpen: requireNonNegativeInteger(rawLog.consumedStarsAfterOpen, "Star chest open log consumedStarsAfterOpen"),
    rewardId: requireNonEmptyString(rawLog.rewardId, "Star chest open log rewardId"),
    rewardItems: clone(rawLog.rewardItems),
    timestamp: requireNonNegativeInteger(rawLog.timestamp, "Star chest open log timestamp")
  };
}

function createInitialState(activityId) {
  return {
    version: 1,
    activityId: activityId,
    consumedStars: 0,
    openedCount: 0,
    lastOpenAt: 0,
    openLogs: []
  };
}

function normalizeState(raw, activityId) {
  assertObject(raw, "Star chest state must be an object.");
  if (raw.version !== 1) {
    throw new Error("Star chest state version must be 1.");
  }
  if (raw.activityId !== activityId) {
    throw new Error("Star chest state activityId mismatch.");
  }
  if (!Array.isArray(raw.openLogs)) {
    throw new Error("Star chest state openLogs must be an array.");
  }

  return {
    version: 1,
    activityId: activityId,
    consumedStars: requireNonNegativeInteger(raw.consumedStars, "Star chest consumedStars"),
    openedCount: requireNonNegativeInteger(raw.openedCount, "Star chest openedCount"),
    lastOpenAt: requireNonNegativeInteger(raw.lastOpenAt, "Star chest lastOpenAt"),
    openLogs: raw.openLogs.map(normalizeLog)
  };
}

function StarChestStore(options) {
  assertObject(options, "StarChestStore options are required.");
  this.activityId = requireNonEmptyString(options.activityId, "StarChestStore activityId");
}

StarChestStore.prototype.normalizeState = function (raw) {
  return normalizeState(raw, this.activityId);
};

StarChestStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(this.activityId);
  }.bind(this));
  return clone(this.normalizeState(state));
};

StarChestStore.prototype.save = function (state) {
  var normalized = this.normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  return true;
};

StarChestStore.prototype.appendOpenLog = function (state, log, maxLogs) {
  var normalized = this.normalizeState(state);
  var limit = requirePositiveInteger(maxLogs, "Star chest maxLogs");
  normalized.openLogs.unshift(normalizeLog(log));
  normalized.openLogs = normalized.openLogs.slice(0, limit);
  return normalized;
};

module.exports = StarChestStore;
