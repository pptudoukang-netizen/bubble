"use strict";

var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");

var TIMED_LEVEL_INTERVAL = CampaignLevelGenerationConfig.TIMED_LEVEL_INTERVAL;
var TIMED_LEVEL_TIME_LIMIT_SECONDS = CampaignLevelGenerationConfig.TIMED_LEVEL_TIME_LIMIT_SECONDS;
var TIMED_LEVEL_REQUIRED_STAR_COUNT = CampaignLevelGenerationConfig.TIMED_LEVEL_REQUIRED_STAR_COUNT;

function assertLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId <= 0) {
    throw new Error("Campaign level mode requires a positive integer levelId: " + levelId);
  }
}

function isTimedLevelId(levelId) {
  assertLevelId(levelId);
  return CampaignLevelGenerationConfig.isTimedLevelId(levelId);
}

function getExpectedMode(levelId) {
  assertLevelId(levelId);
  var plan = CampaignLevelGenerationConfig.getLevelPlan(levelId);
  return {
    levelType: plan.levelType,
    playMode: plan.playMode,
    timeLimitSeconds: plan.timeLimitSeconds,
    requiredStarCount: plan.requiredStarCount
  };
}

function assertExpectedLevelMode(level, expectedShotLimit) {
  if (!level || typeof level !== "object" || Array.isArray(level)) {
    throw new Error("Campaign level mode validation requires a level object.");
  }
  var expected = getExpectedMode(level.levelId);
  if (level.levelType !== expected.levelType) {
    throw new Error("Level " + level.levelId + " levelType must be " + expected.levelType + ".");
  }
  if (level.playMode !== expected.playMode) {
    throw new Error("Level " + level.levelId + " playMode must be " + expected.playMode + ".");
  }
  if (expected.playMode === "timed_infinite_shots") {
    if (level.shotLimit !== undefined && level.shotLimit !== null) {
      throw new Error("Level " + level.levelId + " timed mode must not configure shotLimit.");
    }
    if (level.timeLimitSeconds !== expected.timeLimitSeconds) {
      throw new Error(
        "Level " + level.levelId + " timeLimitSeconds must be " + expected.timeLimitSeconds + "."
      );
    }
    if (level.requiredStarCount !== expected.requiredStarCount) {
      throw new Error(
        "Level " + level.levelId + " requiredStarCount must be " + expected.requiredStarCount + "."
      );
    }
    return;
  }
  if (!Number.isInteger(expectedShotLimit) || expectedShotLimit <= 0) {
    throw new Error("Level " + level.levelId + " expected shotLimit must be a positive integer.");
  }
  if (level.shotLimit !== expectedShotLimit) {
    throw new Error(
      "Level " + level.levelId + " shotLimit mismatch: expected " + expectedShotLimit + ", got " + level.shotLimit + "."
    );
  }
  if (level.timeLimitSeconds !== undefined || level.requiredStarCount !== undefined) {
    throw new Error("Level " + level.levelId + " shot-limited mode must not configure timed fields.");
  }
}

module.exports = {
  TIMED_LEVEL_INTERVAL: TIMED_LEVEL_INTERVAL,
  TIMED_LEVEL_TIME_LIMIT_SECONDS: TIMED_LEVEL_TIME_LIMIT_SECONDS,
  TIMED_LEVEL_REQUIRED_STAR_COUNT: TIMED_LEVEL_REQUIRED_STAR_COUNT,
  isTimedLevelId: isTimedLevelId,
  getExpectedMode: getExpectedMode,
  assertExpectedLevelMode: assertExpectedLevelMode
};
