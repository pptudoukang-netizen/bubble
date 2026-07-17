"use strict";

var StrictStorage = require("./StrictStorage");
var LevelPackManifest = require("../config/LevelPackManifest");

var STORAGE_KEY = "bubble_level_progress_v1";
var NAMESPACE = "LevelProgressStore";
var MAX_LEVEL_ID = LevelPackManifest.TOTAL_LEVEL_COUNT;

function createDefaultProgress() {
  return {
    version: 2,
    highestUnlockedLevel: 1,
    selectedLevelId: 1,
    completedLevels: {},
    starsByLevel: {},
    bestScoresByLevel: {}
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

function requireCampaignLevelId(value, fieldName) {
  var levelId = requirePositiveInteger(value, fieldName);
  if (levelId > MAX_LEVEL_ID) {
    throw new Error(fieldName + " must not exceed campaign max level " + MAX_LEVEL_ID + ".");
  }
  return levelId;
}

function normalizeHighestUnlockedLevel(value) {
  var highestUnlockedLevel = requirePositiveInteger(value, "highestUnlockedLevel");
  if (highestUnlockedLevel > MAX_LEVEL_ID + 1) {
    throw new Error("highestUnlockedLevel must not exceed legacy terminal value " + (MAX_LEVEL_ID + 1) + ".");
  }
  return Math.min(highestUnlockedLevel, MAX_LEVEL_ID);
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

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireCanonicalLevelKey(key, fieldName) {
  if (typeof key !== "string" || !/^[1-9]\d*$/.test(key)) {
    throw new Error(fieldName + " key must be a canonical positive level id.");
  }
  return key;
}

function resolveHighestUnlockedFromCompletedLevels(completedLevels) {
  assertObject(completedLevels, "completedLevels is required.");

  var highestCompletedLevelId = 0;
  Object.keys(completedLevels).forEach(function (key) {
    requireCanonicalLevelKey(key, "completedLevels");
    if (completedLevels[key] !== true) {
      throw new Error("completedLevels." + key + " must be true.");
    }
    highestCompletedLevelId = Math.max(
      highestCompletedLevelId,
      requireCampaignLevelId(Number(key), "completedLevels." + key + " level id")
    );
  });

  return Math.min(highestCompletedLevelId + 1, MAX_LEVEL_ID);
}

function normalizeBestScoresByLevel(rawBestScoresByLevel) {
  assertObject(rawBestScoresByLevel, "Level progress bestScoresByLevel is required.");
  var bestScoresByLevel = {};
  Object.keys(rawBestScoresByLevel).forEach(function (key) {
    requireCanonicalLevelKey(key, "bestScoresByLevel");
    bestScoresByLevel[key] = requireNonNegativeInteger(rawBestScoresByLevel[key], "bestScoresByLevel." + key);
  });
  return bestScoresByLevel;
}

function migrateVersion1Progress(raw) {
  assertObject(raw.completedLevels, "Level progress completedLevels is required.");
  assertObject(raw.starsByLevel, "Level progress starsByLevel is required.");

  return {
    version: 2,
    highestUnlockedLevel: raw.highestUnlockedLevel,
    selectedLevelId: raw.selectedLevelId,
    completedLevels: raw.completedLevels,
    starsByLevel: raw.starsByLevel,
    bestScoresByLevel: {}
  };
}

function normalizeProgress(raw) {
  assertObject(raw, "Level progress must be an object.");
  if (raw.version === 1) {
    return normalizeProgress(migrateVersion1Progress(raw));
  }
  if (raw.version !== 2) {
    throw new Error("Level progress version must be 2.");
  }
  assertObject(raw.completedLevels, "Level progress completedLevels is required.");
  assertObject(raw.starsByLevel, "Level progress starsByLevel is required.");

  var highestUnlockedLevel = normalizeHighestUnlockedLevel(raw.highestUnlockedLevel);
  var selectedLevelId = requireCampaignLevelId(raw.selectedLevelId, "selectedLevelId");

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
  var bestScoresByLevel = normalizeBestScoresByLevel(raw.bestScoresByLevel);

  var progressUnlockedLevel = resolveHighestUnlockedFromCompletedLevels(completedLevels);
  if (highestUnlockedLevel > progressUnlockedLevel) {
    highestUnlockedLevel = progressUnlockedLevel;
  }
  if (highestUnlockedLevel < selectedLevelId) {
    selectedLevelId = highestUnlockedLevel;
  }

  return {
    version: 2,
    highestUnlockedLevel: highestUnlockedLevel,
    selectedLevelId: selectedLevelId,
    completedLevels: completedLevels,
    starsByLevel: starsByLevel,
    bestScoresByLevel: bestScoresByLevel
  };
}

function LevelProgressStore() {}

LevelProgressStore.prototype.load = function () {
  var progress = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createDefaultProgress);
  var normalized = normalizeProgress(progress);
  if (JSON.stringify(progress) !== JSON.stringify(normalized)) {
    StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  }
  return clone(normalized);
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
  var safeLevelId = requireCampaignLevelId(levelId, "levelId");
  if (safeLevelId > normalized.highestUnlockedLevel) {
    throw new Error("Cannot select locked level: " + safeLevelId);
  }

  normalized.selectedLevelId = safeLevelId;
  return clone(normalized);
};

LevelProgressStore.prototype.recordCompletion = function (progress, levelId, stars, score) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requireCampaignLevelId(levelId, "levelId");
  var safeStars = requireRuntimeStarCount(stars, "stars");
  var safeScore = requireNonNegativeInteger(score, "score");
  var key = String(safeLevelId);
  var previousStars = normalized.starsByLevel[key] ? requireStoredStarCount(normalized.starsByLevel[key], "starsByLevel." + key) : 0;
  var bestStars = Math.max(previousStars, safeStars);
  var previousBestScore = Object.prototype.hasOwnProperty.call(normalized.bestScoresByLevel, key)
    ? requireNonNegativeInteger(normalized.bestScoresByLevel[key], "bestScoresByLevel." + key)
    : 0;

  normalized.completedLevels[key] = true;
  if (bestStars > 0) {
    normalized.starsByLevel[key] = bestStars;
  } else {
    delete normalized.starsByLevel[key];
  }
  normalized.bestScoresByLevel[key] = Math.max(previousBestScore, safeScore);
  normalized.selectedLevelId = safeLevelId;
  normalized.highestUnlockedLevel = Math.min(
    Math.max(normalized.highestUnlockedLevel, safeLevelId + 1),
    MAX_LEVEL_ID
  );
  return clone(normalized);
};

LevelProgressStore.prototype.isLevelUnlocked = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requireCampaignLevelId(levelId, "levelId");
  return safeLevelId <= normalized.highestUnlockedLevel;
};

LevelProgressStore.prototype.getStars = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requireCampaignLevelId(levelId, "levelId");
  var value = normalized.starsByLevel[String(safeLevelId)];
  return value ? requireStoredStarCount(value, "starsByLevel." + safeLevelId) : 0;
};

LevelProgressStore.prototype.getBestScore = function (progress, levelId) {
  var normalized = normalizeProgress(progress);
  var safeLevelId = requireCampaignLevelId(levelId, "levelId");
  var key = String(safeLevelId);
  if (!Object.prototype.hasOwnProperty.call(normalized.bestScoresByLevel, key)) {
    return 0;
  }
  return requireNonNegativeInteger(normalized.bestScoresByLevel[key], "bestScoresByLevel." + key);
};

LevelProgressStore.prototype.getHighestUnlockedLevel = function (progress) {
  return normalizeProgress(progress).highestUnlockedLevel;
};

LevelProgressStore.prototype.getSelectedLevel = function (progress) {
  return normalizeProgress(progress).selectedLevelId;
};

module.exports = LevelProgressStore;
