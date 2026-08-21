"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_current_frontier_failure_v1";
var NAMESPACE = "CurrentFrontierFailureStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function createInitialState(frontierLevelId) {
  return {
    version: 1,
    frontierLevelId: requirePositiveInteger(frontierLevelId, "Current frontier levelId"),
    consecutiveFailureCount: 0
  };
}

function normalizeState(rawState) {
  assertObject(rawState, "Current frontier failure state");
  if (rawState.version !== 1) {
    throw new Error("Current frontier failure state version must be 1.");
  }
  return {
    version: 1,
    frontierLevelId: requirePositiveInteger(rawState.frontierLevelId, "Current frontier failure levelId"),
    consecutiveFailureCount: requireNonNegativeInteger(
      rawState.consecutiveFailureCount,
      "Current frontier consecutive failure count"
    )
  };
}

function CurrentFrontierFailureStore() {}

CurrentFrontierFailureStore.prototype.load = function (frontierLevelId) {
  var safeFrontierLevelId = requirePositiveInteger(frontierLevelId, "Current frontier load levelId");
  var rawState = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(safeFrontierLevelId);
  });
  var normalized = normalizeState(rawState);
  if (normalized.frontierLevelId !== safeFrontierLevelId) {
    normalized = createInitialState(safeFrontierLevelId);
  }
  if (JSON.stringify(rawState) !== JSON.stringify(normalized)) {
    this.save(normalized);
  }
  return clone(normalized);
};

CurrentFrontierFailureStore.prototype.save = function (state) {
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalizeState(state));
};

CurrentFrontierFailureStore.prototype.syncFrontier = function (state, frontierLevelId) {
  var normalized = normalizeState(state);
  var safeFrontierLevelId = requirePositiveInteger(frontierLevelId, "Current frontier sync levelId");
  if (normalized.frontierLevelId === safeFrontierLevelId) {
    return clone(normalized);
  }
  return createInitialState(safeFrontierLevelId);
};

CurrentFrontierFailureStore.prototype.recordLoss = function (state, levelId) {
  var normalized = normalizeState(state);
  var safeLevelId = requirePositiveInteger(levelId, "Current frontier loss levelId");
  if (normalized.frontierLevelId !== safeLevelId) {
    throw new Error(
      "Current frontier loss level must match persisted frontier. expected=" +
      normalized.frontierLevelId + ", actual=" + safeLevelId
    );
  }
  normalized.consecutiveFailureCount += 1;
  return clone(normalized);
};

CurrentFrontierFailureStore.prototype.recordWin = function (state, levelId, nextFrontierLevelId) {
  var normalized = normalizeState(state);
  var safeLevelId = requirePositiveInteger(levelId, "Current frontier win levelId");
  var safeNextFrontierLevelId = requirePositiveInteger(
    nextFrontierLevelId,
    "Current frontier next levelId"
  );
  if (normalized.frontierLevelId !== safeLevelId) {
    throw new Error(
      "Current frontier win level must match persisted frontier. expected=" +
      normalized.frontierLevelId + ", actual=" + safeLevelId
    );
  }
  normalized.frontierLevelId = safeNextFrontierLevelId;
  normalized.consecutiveFailureCount = 0;
  return clone(normalized);
};

CurrentFrontierFailureStore.prototype.getConsecutiveFailureCount = function (state, levelId) {
  var normalized = normalizeState(state);
  var safeLevelId = requirePositiveInteger(levelId, "Current frontier query levelId");
  if (normalized.frontierLevelId !== safeLevelId) {
    throw new Error(
      "Current frontier query level must match persisted frontier. expected=" +
      normalized.frontierLevelId + ", actual=" + safeLevelId
    );
  }
  return normalized.consecutiveFailureCount;
};

CurrentFrontierFailureStore.STORAGE_KEY = STORAGE_KEY;
CurrentFrontierFailureStore.NAMESPACE = NAMESPACE;
CurrentFrontierFailureStore.createInitialState = createInitialState;
CurrentFrontierFailureStore.normalizeState = normalizeState;

module.exports = CurrentFrontierFailureStore;
