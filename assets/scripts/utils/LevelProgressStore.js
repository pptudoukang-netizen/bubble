"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_level_progress_v1";
var NAMESPACE = "LevelProgressStore";

function createDefaultProgress() {
  return {
    version: 1,
    highestUnlockedLevel: 1,
    selectedLevelId: 1,
    completedLevels: {},
    starsByLevel: {}
  };
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireStoredStarCount(value, fieldName) {
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error(fieldName + " must be an integer in [1, 3].");
  }
  return value;
}

function requireRuntimeStarCount(value, fieldName) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(fieldName + " must be an integer in [0, 3].");
  }
  return value;
}

function requireCanonicalLevelKey(key, fieldName) {
  if (typeof key !== "string" || !/^[1-9]\d*$/.test(key)) {
    throw new Error(fieldName + " key must be a canonical positive level id.");
  }
  return key;
}

function normalizeProgress(raw) {
  assertObject(raw, "Level progress must be an object.");
  if (raw.version !== 1) {
    throw new Error("Level progress version must be 1.");
  }
  assertObject(raw.completedLevels, "Level progress completedLevels is required.");
  assertObject(raw.starsByLevel, "Level progress starsByLevel is required.");

  var highestUnlockedLevel = requirePositiveInteger(raw.highestUnlockedLevel, "highestUnlockedLevel");
  var selectedLevelId = requirePositiveInteger(raw.selectedLevelId, "selectedLevelId");
  if (highestUnlockedLevel < selectedLevelId) {
    throw new Error("highestUnlockedLevel must be >= selectedLevelId.");
  }

  var completedLevels = {};
  Object.keys(raw.completedLevels).forEach(function (key) {
    requireCanonicalLevelKey(key, "completedLevels");
    if (raw.completedLevels[key] !== true) {
      throw new Error("completedLevels." + key + " must be true.");
    }
    completedLevels[key] = true;
  });

  var starsByLevel = {};
  Object.keys(raw.starsByLevel).forEach(function (key) {
    requireCanonicalLevelKey(key, "starsByLevel");
    starsByLevel[key] = requireStoredStarCount(raw.starsByLevel[key], "starsByLevel." + key);
  });

  return {
    version: 1,
    highestUnlockedLevel: highestUnlockedLevel,
    selectedLevelId: selectedLevelId,
    completedLevels: completedLevels,
    starsByLevel: starsByLevel
  };
}

function LevelProgressStore() {}

LevelProgressStore.prototype.load = function () {
  var progress = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createDefaultProgress);
  return clone(normalizeProgress(progress));
};

LevelProgressStore.prototype.save = function (progress) {
  var normalized = normalizeProgress(progress);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

LevelProgressStore.prototype.reset = function () {
  var defaults = createDefaultProgress();
  this.save(defaults);
  return clone(defaults);
};

LevelProgressStore.prototype.setSelectedLevel = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requirePositiveInteger(levelId, "levelId");

  normalized.selectedLevelId = safeLevelId;
  normalized.highestUnlockedLevel = Math.max(normalized.highestUnlockedLevel, safeLevelId);
  return clone(normalized);
};

LevelProgressStore.prototype.recordCompletion = function (progress, levelId, stars) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requirePositiveInteger(levelId, "levelId");
  var safeStars = requireRuntimeStarCount(stars, "stars");
  var key = String(safeLevelId);
  var previousStars = normalized.starsByLevel[key] ? requireStoredStarCount(normalized.starsByLevel[key], "starsByLevel." + key) : 0;
  var bestStars = Math.max(previousStars, safeStars);

  normalized.completedLevels[key] = true;
  if (bestStars > 0) {
    normalized.starsByLevel[key] = bestStars;
  } else {
    delete normalized.starsByLevel[key];
  }
  normalized.selectedLevelId = safeLevelId;
  normalized.highestUnlockedLevel = Math.max(normalized.highestUnlockedLevel, safeLevelId + 1);
  return clone(normalized);
};

LevelProgressStore.prototype.isLevelUnlocked = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requirePositiveInteger(levelId, "levelId");
  return safeLevelId <= normalized.highestUnlockedLevel;
};

LevelProgressStore.prototype.getStars = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requirePositiveInteger(levelId, "levelId");
  var value = normalized.starsByLevel[String(safeLevelId)];
  return value ? requireStoredStarCount(value, "starsByLevel." + safeLevelId) : 0;
};

LevelProgressStore.prototype.getHighestUnlockedLevel = function (progress) {
  return normalizeProgress(progress).highestUnlockedLevel;
};

LevelProgressStore.prototype.getSelectedLevel = function (progress) {
  return normalizeProgress(progress).selectedLevelId;
};

module.exports = LevelProgressStore;
