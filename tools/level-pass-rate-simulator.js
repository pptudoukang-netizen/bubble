"use strict";

function parseTargetPart(part) {
  if (typeof part !== "string" || !part.trim()) {
    throw new Error("target part must be non-empty string");
  }
  if (part.indexOf("雪球:") === 0) {
    var snowValue = Number(part.slice(3));
    if (!Number.isFinite(snowValue) || snowValue <= 0) {
      throw new Error("invalid snow target: " + part);
    }
    return {
      type: "snow",
      value: snowValue,
      color: null
    };
  }
  if (/^[RGBYP]:/.test(part)) {
    var colorValue = Number(part.slice(2));
    if (!Number.isFinite(colorValue) || colorValue <= 0) {
      throw new Error("invalid color target: " + part);
    }
    return {
      type: "color",
      value: colorValue,
      color: part[0]
    };
  }
  var anyValue = Number(part);
  if (!Number.isFinite(anyValue) || anyValue <= 0) {
    throw new Error("invalid any target: " + part);
  }
  return {
    type: "any",
    value: anyValue,
    color: null
  };
}

function parseTargetDisplay(primaryDisplay, secondaryDisplay) {
  var primary = 0;
  var snow = 0;
  var isColorTarget = false;
  var color = null;

  function applyPart(part) {
    var parsed = parseTargetPart(part);
    if (parsed.type === "snow") {
      snow = Math.max(snow, parsed.value);
      return;
    }
    if (primary > 0) {
      throw new Error("multiple primary collection targets: " + primaryDisplay);
    }
    primary = parsed.value;
    if (parsed.type === "color") {
      isColorTarget = true;
      color = parsed.color;
    }
  }

  if (typeof primaryDisplay === "string" && primaryDisplay.trim() && primaryDisplay !== "-") {
    primaryDisplay.split("+").forEach(applyPart);
  }
  if (typeof secondaryDisplay === "string" && secondaryDisplay.trim() && secondaryDisplay !== "-") {
    secondaryDisplay.split("+").forEach(applyPart);
  }

  return {
    primary: primary,
    snow: snow,
    isColorTarget: isColorTarget,
    color: color
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

var MIN_PASS_RATE = 15;
var MAX_PASS_RATE = 97;

function computePassRate(metrics, options) {
  options = options || {};
  var applyFloor = options.applyFloor !== false;
  if (!Number.isInteger(metrics.levelId) || metrics.levelId <= 0) {
    throw new Error("levelId must be positive integer");
  }
  if (!Number.isInteger(metrics.shots) || metrics.shots <= 0) {
    throw new Error("shots must be positive integer");
  }
  if (!Number.isInteger(metrics.rows) || metrics.rows <= 0) {
    throw new Error("rows must be positive integer");
  }

  var ballTotal = metrics.ballTotal;
  if (!Number.isFinite(ballTotal) || ballTotal < 0) {
    throw new Error("ballTotal must be non-negative number");
  }

  var target = parseTargetDisplay(metrics.primaryTargetDisplay, metrics.secondaryTargetDisplay);
  if (target.primary <= 0 && target.snow <= 0) {
    throw new Error("level " + metrics.levelId + " requires at least one collection target");
  }

  var primaryTarget = target.primary > 0 ? target.primary : 0;
  var snowTarget = target.snow;
  var targetColorSupply = ballTotal;
  if (target.isColorTarget && target.color && metrics.colorCounts) {
    targetColorSupply = metrics.colorCounts[target.color];
    if (!Number.isFinite(targetColorSupply)) {
      throw new Error("missing color supply for target color: " + target.color);
    }
  }

  var progress = (metrics.levelId - 1) / 999;
  var objectivePressure = 0;

  if (primaryTarget > 0) {
    objectivePressure += primaryTarget * (target.isColorTarget ? 0.78 : 0.62);
    if (target.isColorTarget) {
      var supplyRatio = primaryTarget / Math.max(1, targetColorSupply);
      objectivePressure += Math.max(0, supplyRatio - 0.42) * primaryTarget * 0.55;
    }
  }
  if (snowTarget > 0) {
    objectivePressure += snowTarget * 0.72;
    if (primaryTarget > 0) {
      objectivePressure += Math.min(primaryTarget, snowTarget) * 0.18;
    }
  }

  var clearPressure = metrics.rows * 0.18;
  var specialPressure =
    metrics.stone * 0.45 +
    metrics.ice * 0.35 +
    metrics.blast * -1.2 +
    metrics.rainbow * -1.5 +
    metrics.molotov * 0.25 +
    metrics.splitterTotal * 0.35 +
    metrics.key * 0.12 +
    metrics.locked * 0.24;

  var workload = clearPressure + objectivePressure + specialPressure;
  var shotEfficiency = metrics.shots / Math.max(1, workload);
  var balancePoint = 0.82 - progress * 0.05;
  var steepness = 5.4;
  var rawRate = 100 * sigmoid(steepness * (shotEfficiency - balancePoint));

  if (metrics.levelId <= 2) {
    rawRate = Math.max(rawRate, 86);
  } else if (metrics.levelId <= 10) {
    rawRate = Math.max(rawRate, 58);
  }

  var passRate = applyFloor
    ? clamp(rawRate, MIN_PASS_RATE, MAX_PASS_RATE)
    : clamp(rawRate, 0, MAX_PASS_RATE);
  return Math.round(passRate * 10) / 10;
}

function simulatePassRate(metrics) {
  return computePassRate(metrics, { applyFloor: true });
}

function formatPassRate(passRate) {
  return passRate.toFixed(1) + "%";
}

module.exports = {
  MIN_PASS_RATE: MIN_PASS_RATE,
  MAX_PASS_RATE: MAX_PASS_RATE,
  parseTargetDisplay: parseTargetDisplay,
  computePassRate: computePassRate,
  simulatePassRate: simulatePassRate,
  formatPassRate: formatPassRate
};
