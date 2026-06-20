"use strict";

var LevelConfigLoader = require("./LevelConfigLoader");
var RandomChallengeGenerator = require("./RandomChallengeGenerator");
var RandomChallengeRules = require("./RandomChallengeRules");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
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

function hashConfig(config) {
  var text = JSON.stringify(config);
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
}

function buildRun(options) {
  var opts = requireObject(options, "Random challenge run options");
  var rawConfig = RandomChallengeGenerator.buildConfig(opts);
  var configHash = hashConfig(rawConfig);
  var levelConfig = LevelConfigLoader.normalizeLevelConfig(rawConfig, RandomChallengeRules.LEVEL_KEY);
  if (!levelConfig.level.randomChallenge || levelConfig.level.randomChallenge.mode !== RandomChallengeRules.MODE) {
    throw new Error("Random challenge normalized config lost metadata.");
  }

  var seed = requireNonEmptyString(levelConfig.level.randomChallenge.seed, "Random challenge seed");
  var run = {
    mode: RandomChallengeRules.MODE,
    seed: seed,
    generatorVersion: RandomChallengeRules.GENERATOR_VERSION,
    difficultyTier: levelConfig.level.randomChallenge.difficultyTier,
    configHash: configHash,
    levelConfig: levelConfig
  };
  return clone(run);
}

module.exports = {
  buildRun: buildRun
};
