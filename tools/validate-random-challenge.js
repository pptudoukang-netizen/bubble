"use strict";

var RandomChallengeManager = require("../assets/scripts/config/RandomChallengeManager");

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function parseCount() {
  var raw = process.argv[2];
  if (raw === undefined) {
    return 200;
  }
  return requirePositiveInteger(Number(raw), "random challenge validation count");
}

function validateRun(run, index) {
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new Error("Random challenge run must be object at index " + index + ".");
  }
  if (!run.levelConfig || !run.levelConfig.level) {
    throw new Error("Random challenge run missing levelConfig at index " + index + ".");
  }
  if (run.levelConfig.level.randomChallenge.seed !== run.seed) {
    throw new Error("Random challenge seed mismatch at index " + index + ".");
  }
  if (typeof run.configHash !== "string" || run.configHash.length === 0) {
    throw new Error("Random challenge configHash missing at index " + index + ".");
  }
  if (!Array.isArray(run.levelConfig.level.clearRewardItems) || run.levelConfig.level.clearRewardItems.length === 0) {
    throw new Error("Random challenge reward config missing at index " + index + ".");
  }
}

function main() {
  var count = parseCount();
  for (var index = 0; index < count; index += 1) {
    var run = RandomChallengeManager.buildRun({
      seed: "validate_random_challenge_" + index,
      highestUnlockedLevel: 150
    });
    validateRun(run, index);
  }
  console.log("Validated random challenge runs: " + count);
}

main();
