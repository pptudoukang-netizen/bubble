"use strict";

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
  calculateStarRatingFromSnapshot: calculateStarRatingFromSnapshot
};
