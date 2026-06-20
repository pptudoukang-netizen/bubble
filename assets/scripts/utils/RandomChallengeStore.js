"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_random_challenge_v1";
var NAMESPACE = "RandomChallengeStore";

function createDefaultState() {
  return {
    version: 1,
    bestScoresByTier: {},
    lastRun: null
  };
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireObject(value, fieldName) {
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

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function normalizeLastRun(rawLastRun) {
  if (rawLastRun === null) {
    return null;
  }
  var run = requireObject(rawLastRun, "Random challenge lastRun");
  return {
    seed: requireNonEmptyString(run.seed, "Random challenge lastRun.seed"),
    difficultyTier: requirePositiveInteger(run.difficultyTier, "Random challenge lastRun.difficultyTier"),
    configHash: requireNonEmptyString(run.configHash, "Random challenge lastRun.configHash"),
    score: requireNonNegativeInteger(run.score, "Random challenge lastRun.score"),
    completedAt: requirePositiveInteger(run.completedAt, "Random challenge lastRun.completedAt")
  };
}

function normalizeBestScores(rawBestScores) {
  var source = requireObject(rawBestScores, "Random challenge bestScoresByTier");
  var result = {};
  Object.keys(source).forEach(function (key) {
    if (!/^[1-9]\d*$/.test(key)) {
      throw new Error("Random challenge best score tier key is invalid: " + key);
    }
    result[key] = requireNonNegativeInteger(source[key], "Random challenge bestScoresByTier." + key);
  });
  return result;
}

function normalizeState(rawState) {
  var state = requireObject(rawState, "Random challenge state");
  if (state.version !== 1) {
    throw new Error("Random challenge state version must be 1.");
  }
  return {
    version: 1,
    bestScoresByTier: normalizeBestScores(state.bestScoresByTier),
    lastRun: normalizeLastRun(state.lastRun)
  };
}

function RandomChallengeStore() {}

RandomChallengeStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createDefaultState);
  var normalized = normalizeState(state);
  if (JSON.stringify(state) !== JSON.stringify(normalized)) {
    StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  }
  return clone(normalized);
};

RandomChallengeStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

RandomChallengeStore.prototype.getBestScore = function (state, difficultyTier) {
  var normalized = normalizeState(state);
  var safeTier = requirePositiveInteger(difficultyTier, "difficultyTier");
  var key = String(safeTier);
  if (!Object.prototype.hasOwnProperty.call(normalized.bestScoresByTier, key)) {
    return 0;
  }
  return requireNonNegativeInteger(normalized.bestScoresByTier[key], "Random challenge best score");
};

RandomChallengeStore.prototype.recordCompletion = function (state, runContext, score) {
  var normalized = normalizeState(state);
  var context = requireObject(runContext, "Random challenge run context");
  var safeScore = requireNonNegativeInteger(score, "score");
  var difficultyTier = requirePositiveInteger(context.difficultyTier, "difficultyTier");
  var key = String(difficultyTier);
  var previousBest = this.getBestScore(normalized, difficultyTier);
  normalized.bestScoresByTier[key] = Math.max(previousBest, safeScore);
  normalized.lastRun = {
    seed: requireNonEmptyString(context.seed, "Random challenge seed"),
    difficultyTier: difficultyTier,
    configHash: requireNonEmptyString(context.configHash, "Random challenge configHash"),
    score: safeScore,
    completedAt: Date.now()
  };
  return clone(normalized);
};

module.exports = RandomChallengeStore;
