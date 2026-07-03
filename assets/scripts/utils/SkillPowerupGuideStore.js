"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_skill_powerup_guide_state_v1";
var NAMESPACE = "SkillPowerupGuideStore";
var STORAGE_VERSION = 1;
var SUPPORTED_TYPES = ["rainbow", "blast"];

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

function requireSupportedType(entityType, fieldName) {
  if (SUPPORTED_TYPES.indexOf(entityType) === -1) {
    throw new Error(fieldName + " must be rainbow or blast.");
  }
  return entityType;
}

function createInitialState() {
  return {
    version: STORAGE_VERSION,
    completedByType: {
      rainbow: false,
      blast: false
    }
  };
}

function normalizeCompletedByType(rawCompletedByType) {
  assertObject(rawCompletedByType, "Skill powerup guide completedByType is required.");
  Object.keys(rawCompletedByType).forEach(function (entityType) {
    requireSupportedType(entityType, "Skill powerup guide completedByType key");
  });

  var completedByType = {};
  SUPPORTED_TYPES.forEach(function (entityType) {
    if (!Object.prototype.hasOwnProperty.call(rawCompletedByType, entityType)) {
      throw new Error("Skill powerup guide completedByType missing: " + entityType);
    }
    completedByType[entityType] = requireBoolean(
      rawCompletedByType[entityType],
      "Skill powerup guide completedByType." + entityType
    );
  });
  return completedByType;
}

function normalizeState(raw) {
  assertObject(raw, "Skill powerup guide state must be an object.");
  if (raw.version !== STORAGE_VERSION) {
    throw new Error("Skill powerup guide state version must be " + STORAGE_VERSION + ".");
  }

  return {
    version: STORAGE_VERSION,
    completedByType: normalizeCompletedByType(raw.completedByType)
  };
}

function SkillPowerupGuideStore() {}

SkillPowerupGuideStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(state);
  this.save(normalized);
  return clone(normalized);
};

SkillPowerupGuideStore.prototype.save = function (state) {
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalizeState(state));
};

SkillPowerupGuideStore.prototype.isCompleted = function (state, entityType) {
  var normalized = normalizeState(state);
  var safeType = requireSupportedType(entityType, "Skill powerup guide entityType");
  return normalized.completedByType[safeType] === true;
};

SkillPowerupGuideStore.prototype.markCompleted = function (state, entityType) {
  var normalized = normalizeState(state);
  var safeType = requireSupportedType(entityType, "Skill powerup guide entityType");
  normalized.completedByType[safeType] = true;
  return {
    state: clone(normalized)
  };
};

SkillPowerupGuideStore.SUPPORTED_TYPES = SUPPORTED_TYPES.slice();

module.exports = SkillPowerupGuideStore;
