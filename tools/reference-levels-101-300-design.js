"use strict";

var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");

var FIRST_LEVEL_ID = 101;
var LAST_LEVEL_ID = 300;
var CALIBRATED_SHOT_LIMITS = [
  20, 28, 18, 18, 18, 20, 18, 18, 27, 22,
  23, 20, 18, 18, 20, 35, 19, 21, 27, 19,
  18, 34, 18, 20, 27, 24, 23, 26, 20, 27,
  23, 20, 18, 24, 27, 19, 25, 22, 22, 32,
  24, 35, 28, 18, 24, 28, 26, 23, 38, 20,
  18, 32, 27, 35, 25, 32, 32, 26, 38, 31,
  24, 35, 24, 26, 36, 22, 36, 29, 29, 38,
  35, 35, 35, 35, 28, 21, 32, 19, 20, 25,
  24, 19, 25, 27, 33, 24, 29, 28, 34, 23,
  20, 29, 24, 36, 26, 18, 21, 33, 22, 22,
  20, 35, 35, 20, 23, 18, 19, 24, 20, 20,
  28, 25, 20, 20, 26, 18, 26, 28, 35, 28,
  35, 26, 18, 35, 35, 19, 20, 25, 24, 37,
  29, 24, 18, 22, 28, 33, 19, 36, 28, 21,
  32, 24, 18, 24, 32, 35, 30, 34, 35, 21,
  26, 22, 35, 30, 24, 23, 34, 32, 19, 30,
  19, 28, 25, 34, 25, 19, 35, 34, 23, 37,
  18, 33, 35, 23, 35, 35, 20, 25, 23, 35,
  23, 20, 29, 26, 35, 22, 31, 21, 23, 30,
  22, 22, 18, 25, 35, 20, 33, 23, 26, 38
];

function assertLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId < FIRST_LEVEL_ID || levelId > LAST_LEVEL_ID) {
    throw new Error("Reference calibrated level id must be an integer in [101, 300]: " + levelId);
  }
}

if (CALIBRATED_SHOT_LIMITS.length !== LAST_LEVEL_ID - FIRST_LEVEL_ID + 1) {
  throw new Error("Reference levels 101-300 shot limit table must contain exactly 200 entries.");
}
CALIBRATED_SHOT_LIMITS.forEach(function (shotLimit, index) {
  if (!Number.isInteger(shotLimit) || shotLimit <= 0) {
    throw new Error("Reference calibrated shot limit is invalid for level " + (FIRST_LEVEL_ID + index) + ".");
  }
});

function getShotLimit(levelId) {
  assertLevelId(levelId);
  return CampaignLevelGenerationConfig.applyClearanceRebalanceShotLimit(
    levelId,
    CALIBRATED_SHOT_LIMITS[levelId - FIRST_LEVEL_ID]
  );
}

function assertTableRowMatchesDesign(tableRow) {
  if (!tableRow || typeof tableRow !== "object" || Array.isArray(tableRow)) {
    throw new Error("Reference calibrated table row must be an object.");
  }
  assertLevelId(tableRow.levelId);
  var expectedShotLimit = getShotLimit(tableRow.levelId);
  if (CampaignLevelGenerationConfig.isTrappedSpriteRescueLevelId(tableRow.levelId)) {
    var normalBallCount = Object.keys(tableRow.colorCounts).reduce(function (sum, color) {
      return sum + tableRow.colorCounts[color];
    }, 0);
    var reactiveSpecialCounts = CampaignLevelGenerationConfig.getReactiveSpecialCounts(tableRow.levelId);
    expectedShotLimit = CampaignLevelGenerationConfig.buildTrappedSpriteRescueShotLimit({
      levelId: tableRow.levelId,
      normalBallCount: normalBallCount,
      rowCount: tableRow.rowCount,
      iceCount: tableRow.specialCounts.ice,
      baseSpecialCount: tableRow.specialCounts.stone + tableRow.specialCounts.blast + tableRow.specialCounts.rainbow,
      reactiveSpecialCounts: reactiveSpecialCounts
    });
  }
  if (tableRow.shotLimit !== expectedShotLimit) {
    throw new Error(
      "Level " + tableRow.levelId + " shotLimit differs from calibrated design: expected " +
      expectedShotLimit + ", got " + tableRow.shotLimit + "."
    );
  }
}

module.exports = Object.freeze({
  FIRST_LEVEL_ID: FIRST_LEVEL_ID,
  LAST_LEVEL_ID: LAST_LEVEL_ID,
  CALIBRATED_SHOT_LIMITS: Object.freeze(CALIBRATED_SHOT_LIMITS.slice()),
  getShotLimit: getShotLimit,
  assertTableRowMatchesDesign: assertTableRowMatchesDesign
});
