"use strict";

var AssistSpiritConfig = require("./AssistSpiritConfig");

var TARGET_LEVEL_COUNT = 1000;
var CHAPTER_SIZE = 100;
var CHAPTER_OFFSETS = Object.freeze([25, 42, 63, 86, 99]);
var FIRST_CLEAR_FRAGMENT_REWARD_COUNT = 1;
var SPIRIT_IDS = Object.freeze(AssistSpiritConfig.getCatalog().map(function (spirit) {
  return spirit.id;
}));
var RESCUE_LEVEL_IDS = [];

for (var chapterStart = 0; chapterStart < TARGET_LEVEL_COUNT; chapterStart += CHAPTER_SIZE) {
  CHAPTER_OFFSETS.forEach(function (offset) {
    RESCUE_LEVEL_IDS.push(chapterStart + offset);
  });
}

if (SPIRIT_IDS.length !== 7) {
  throw new Error("Assist spirit rescue identity cycle must contain exactly seven spirits.");
}
if (new Set(SPIRIT_IDS).size !== SPIRIT_IDS.length) {
  throw new Error("Assist spirit rescue identity cycle must not contain duplicated ids.");
}
if (RESCUE_LEVEL_IDS.length !== 50) {
  throw new Error("Assist spirit rescue schedule must contain exactly fifty levels.");
}

function requireCampaignLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Assist spirit rescue levelId must be in [1, " + TARGET_LEVEL_COUNT + "].");
  }
  return levelId;
}

function findSpiritIdByLevelId(levelId) {
  requireCampaignLevelId(levelId);
  var rescueIndex = RESCUE_LEVEL_IDS.indexOf(levelId);
  if (rescueIndex < 0) {
    return null;
  }
  return SPIRIT_IDS[rescueIndex % SPIRIT_IDS.length];
}

function requireSpiritIdByLevelId(levelId) {
  var spiritId = findSpiritIdByLevelId(levelId);
  if (spiritId === null) {
    throw new Error("Level is not configured for assist spirit rescue: " + levelId);
  }
  return spiritId;
}

module.exports = Object.freeze({
  TARGET_LEVEL_COUNT: TARGET_LEVEL_COUNT,
  CHAPTER_OFFSETS: CHAPTER_OFFSETS,
  FIRST_CLEAR_FRAGMENT_REWARD_COUNT: FIRST_CLEAR_FRAGMENT_REWARD_COUNT,
  SPIRIT_IDS: SPIRIT_IDS,
  RESCUE_LEVEL_IDS: Object.freeze(RESCUE_LEVEL_IDS.slice()),
  findSpiritIdByLevelId: findSpiritIdByLevelId,
  requireSpiritIdByLevelId: requireSpiritIdByLevelId
});
