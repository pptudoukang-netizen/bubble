"use strict";

var STAR_SCORE_BAND_RATIOS = {
  star1: 0.3,
  star2: 0.6,
  star3: 0.85
};

function requirePositiveInteger(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return numberValue;
}

function buildStarThresholdsFromTargetScore(targetScore) {
  var requiredTargetScore = requirePositiveInteger(targetScore, "Star target score");
  var star1 = Math.max(1, Math.round(requiredTargetScore * STAR_SCORE_BAND_RATIOS.star1));
  var star2 = Math.max(star1, Math.round(requiredTargetScore * STAR_SCORE_BAND_RATIOS.star2));
  var star3 = Math.max(star2, Math.round(requiredTargetScore * STAR_SCORE_BAND_RATIOS.star3));
  return {
    star1: star1,
    star2: star2,
    star3: star3
  };
}

function resolveStarThresholds(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object" || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("Star thresholds require level config.");
  }
  var level = levelConfig.level;
  if (level.starThresholds === undefined) {
    return buildStarThresholdsFromTargetScore(level.targetScore);
  }
  var thresholds = level.starThresholds;
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) {
    throw new Error("level.starThresholds must be an object.");
  }
  var thresholdFields = Object.keys(thresholds);
  if (thresholdFields.length !== 3 || thresholdFields.indexOf("star1") === -1 || thresholdFields.indexOf("star2") === -1 || thresholdFields.indexOf("star3") === -1) {
    throw new Error("level.starThresholds must contain only star1, star2 and star3.");
  }
  var star1 = requirePositiveInteger(thresholds.star1, "level.starThresholds.star1");
  var star2 = requirePositiveInteger(thresholds.star2, "level.starThresholds.star2");
  var star3 = requirePositiveInteger(thresholds.star3, "level.starThresholds.star3");
  if (!(star1 < star2 && star2 < star3)) {
    throw new Error("level.starThresholds must be strictly increasing.");
  }
  var targetScore = requirePositiveInteger(level.targetScore, "Star target score");
  if (star3 > targetScore) {
    throw new Error("level.starThresholds.star3 must not exceed level.targetScore.");
  }
  return {
    star1: star1,
    star2: star2,
    star3: star3
  };
}

function resolveOneStarTargetScore(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object" || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("One-star target score requires level config.");
  }
  return resolveStarThresholds(levelConfig).star1;
}

function buildDefaultThresholds(scoreHeatBand) {
  return {
    star1: Math.max(0, Math.floor(Number(scoreHeatBand && scoreHeatBand.min) || 0)),
    star2: Math.max(0, Math.floor(Number(scoreHeatBand && scoreHeatBand.target) || 0)),
    star3: Math.max(0, Math.floor(Number(scoreHeatBand && scoreHeatBand.max) || 0))
  };
}

function sanitizeThresholds(rawThresholds, fallback) {
  var source = rawThresholds && typeof rawThresholds === "object" ? rawThresholds : fallback;
  return {
    star1: Math.max(0, Math.floor(Number(source && source.star1) || 0)),
    star2: Math.max(0, Math.floor(Number(source && source.star2) || 0)),
    star3: Math.max(0, Math.floor(Number(source && source.star3) || 0))
  };
}

function calculateStarRatingFromSnapshot(snapshot) {
  var winStats = snapshot && snapshot.winStats ? snapshot.winStats : null;
  var fromSnapshot = winStats ? Math.floor(Number(winStats.starRating) || 0) : 0;
  if (fromSnapshot >= 0 && fromSnapshot <= 3) {
    return fromSnapshot;
  }

  var scoreHeatBand = winStats && winStats.scoreHeatBand ? winStats.scoreHeatBand : null;
  if (!scoreHeatBand) {
    return 0;
  }

  var fallbackThresholds = buildDefaultThresholds(scoreHeatBand);
  var thresholds = sanitizeThresholds(winStats ? winStats.starThresholds : null, fallbackThresholds);
  var score = Math.max(
    0,
    Math.floor(Number(winStats && winStats.totalScore) || Number(snapshot && snapshot.score) || 0)
  );
  var stars = 0;
  if (thresholds.star1 > 0 && score >= thresholds.star1) {
    stars += 1;
  }
  if (thresholds.star2 > 0 && score >= thresholds.star2) {
    stars += 1;
  }
  if (thresholds.star3 > 0 && score >= thresholds.star3) {
    stars += 1;
  }
  return stars;
}

module.exports = {
  buildStarThresholdsFromTargetScore: buildStarThresholdsFromTargetScore,
  resolveStarThresholds: resolveStarThresholds,
  resolveOneStarTargetScore: resolveOneStarTargetScore,
  calculateStarRatingFromSnapshot: calculateStarRatingFromSnapshot
};
