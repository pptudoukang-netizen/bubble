"use strict";

var LEVEL_ID = 1001;
var LEVEL_KEY = "level_1001";
var MODE = "random_challenge";
var GENERATOR_VERSION = 1;

var TIERS = [
  {
    id: 1,
    minHighestUnlockedLevel: 1,
    rowCount: 8,
    colorCount: 3,
    fillRate: 0.74,
    shotLimit: 20,
    targetScore: 2600,
    dropInterval: 7,
    targetCollectRatio: 0.42,
    rewardItems: [
      {
        id: "coin",
        count: 50
      }
    ]
  },
  {
    id: 2,
    minHighestUnlockedLevel: 16,
    rowCount: 9,
    colorCount: 4,
    fillRate: 0.78,
    shotLimit: 18,
    targetScore: 3200,
    dropInterval: 6,
    targetCollectRatio: 0.46,
    rewardItems: [
      {
        id: "coin",
        count: 60
      }
    ]
  },
  {
    id: 3,
    minHighestUnlockedLevel: 51,
    rowCount: 10,
    colorCount: 4,
    fillRate: 0.82,
    shotLimit: 17,
    targetScore: 3900,
    dropInterval: 5,
    targetCollectRatio: 0.5,
    rewardItems: [
      {
        id: "coin",
        count: 70
      }
    ]
  },
  {
    id: 4,
    minHighestUnlockedLevel: 121,
    rowCount: 10,
    colorCount: 5,
    fillRate: 0.84,
    shotLimit: 16,
    targetScore: 4700,
    dropInterval: 5,
    targetCollectRatio: 0.54,
    rewardItems: [
      {
        id: "coin",
        count: 80
      }
    ]
  }
];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function resolveTierByHighestUnlockedLevel(highestUnlockedLevel) {
  var safeHighestUnlockedLevel = requirePositiveInteger(highestUnlockedLevel, "highestUnlockedLevel");
  var selectedTier = null;
  TIERS.forEach(function (tier) {
    if (safeHighestUnlockedLevel >= tier.minHighestUnlockedLevel) {
      selectedTier = tier;
    }
  });
  if (!selectedTier) {
    throw new Error("Random challenge tier table is empty.");
  }
  return clone(selectedTier);
}

module.exports = {
  LEVEL_ID: LEVEL_ID,
  LEVEL_KEY: LEVEL_KEY,
  MODE: MODE,
  GENERATOR_VERSION: GENERATOR_VERSION,
  TIERS: clone(TIERS),
  resolveTierByHighestUnlockedLevel: resolveTierByHighestUnlockedLevel
};
