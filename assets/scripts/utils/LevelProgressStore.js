"use strict";

var STORAGE_KEY = "bubble_level_progress_v1";

function createDefaultProgress() {
  return {
    version: 1,
    highestUnlockedLevel: 1,
    selectedLevelId: 1,
    completedLevels: {},
    starsByLevel: {}
  };
}

function toSafeLevelId(value, fallback) {
  var parsed = Math.floor(Number(value) || 0);
  if (parsed <= 0) {
    return Math.max(1, Math.floor(Number(fallback) || 1));
  }
  return parsed;
}

function clampStars(value) {
  var parsed = Math.floor(Number(value) || 0);
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 3) {
    return 3;
  }
  return parsed;
}

function normalizeProgress(raw) {
  var defaults = createDefaultProgress();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  var normalized = {
    version: 1,
    highestUnlockedLevel: toSafeLevelId(raw.highestUnlockedLevel, 1),
    selectedLevelId: toSafeLevelId(raw.selectedLevelId, 1),
    completedLevels: {},
    starsByLevel: {}
  };
  var completedLevels = raw.completedLevels && typeof raw.completedLevels === "object"
    ? raw.completedLevels
    : {};
  var starsByLevel = raw.starsByLevel && typeof raw.starsByLevel === "object"
    ? raw.starsByLevel
    : {};

  Object.keys(completedLevels).forEach(function (key) {
    var levelId = toSafeLevelId(key, 0);
    if (levelId <= 0 || !completedLevels[key]) {
      return;
    }

    normalized.completedLevels[String(levelId)] = true;
  });

  Object.keys(starsByLevel).forEach(function (key) {
    var levelId = toSafeLevelId(key, 0);
    if (levelId <= 0) {
      return;
    }

    var starCount = clampStars(starsByLevel[key]);
    if (starCount > 0) {
      normalized.starsByLevel[String(levelId)] = starCount;
    }
  });

  normalized.highestUnlockedLevel = Math.max(
    1,
    normalized.highestUnlockedLevel,
    normalized.selectedLevelId
  );

  return normalized;
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function LevelProgressStore() {}

LevelProgressStore.prototype.load = function () {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return createDefaultProgress();
    }

    var rawText = storage.getItem(STORAGE_KEY);
    if (!rawText) {
      return createDefaultProgress();
    }

    var parsed = JSON.parse(rawText);
    return normalizeProgress(parsed);
  } catch (error) {
    return createDefaultProgress();
  }
};

LevelProgressStore.prototype.save = function (progress) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeProgress(progress);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save errors to avoid breaking runtime.
  }
};

LevelProgressStore.prototype.reset = function () {
  var defaults = createDefaultProgress();
  this.save(defaults);
  return clone(defaults);
};

LevelProgressStore.prototype.setSelectedLevel = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = toSafeLevelId(levelId, normalized.selectedLevelId);

  normalized.selectedLevelId = safeLevelId;
  normalized.highestUnlockedLevel = Math.max(normalized.highestUnlockedLevel, safeLevelId);
  return clone(normalized);
};

LevelProgressStore.prototype.recordCompletion = function (progress, levelId, stars) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = toSafeLevelId(levelId, normalized.selectedLevelId);
  var safeStars = clampStars(stars);
  var key = String(safeLevelId);
  var previousStars = clampStars(normalized.starsByLevel[key]);

  normalized.completedLevels[key] = true;
  normalized.starsByLevel[key] = Math.max(previousStars, safeStars);
  normalized.selectedLevelId = safeLevelId;
  normalized.highestUnlockedLevel = Math.max(normalized.highestUnlockedLevel, safeLevelId + 1);
  return clone(normalized);
};

module.exports = LevelProgressStore;
