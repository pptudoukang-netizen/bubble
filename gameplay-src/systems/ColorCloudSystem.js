"use strict";

var BaseSystem = require("./BaseSystem");
var ColorCloudConfig = require("../config/ColorCloudConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");

var EPSILON = 0.000001;
var REQUIRED_CONFIG_KEYS = ["color", "hitDispearTime", "position", "speed", "startTime", "visible"];

function assertFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(fieldName + " must be a finite number.");
  }
  return value;
}

function assertExactKeys(value, expectedKeys, fieldName) {
  var keys = Object.keys(value).sort();
  if (keys.join("|") !== expectedKeys.slice().sort().join("|")) {
    throw new Error(fieldName + " must contain exactly: " + expectedKeys.join(", ") + ".");
  }
}

function assertPoint(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  assertExactKeys(value, ["x", "y"], fieldName);
  return {
    x: assertFiniteNumber(value.x, fieldName + ".x"),
    y: assertFiniteNumber(value.y, fieldName + ".y")
  };
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function containsRelativePoint(point, cloud) {
  return Math.abs(point.x) <= cloud.collisionHalfWidth + EPSILON &&
    Math.abs(point.y) <= cloud.collisionHalfHeight + EPSILON;
}

function segmentAabbEntry(start, end, cloud) {
  var tMin = 0;
  var tMax = 1;
  var axes = [
    { start: start.x, delta: end.x - start.x, half: cloud.collisionHalfWidth },
    { start: start.y, delta: end.y - start.y, half: cloud.collisionHalfHeight }
  ];

  for (var index = 0; index < axes.length; index += 1) {
    var axis = axes[index];
    if (Math.abs(axis.delta) <= EPSILON) {
      if (axis.start < -axis.half || axis.start > axis.half) {
        return null;
      }
      continue;
    }
    var first = (-axis.half - axis.start) / axis.delta;
    var second = (axis.half - axis.start) / axis.delta;
    if (first > second) {
      var swap = first;
      first = second;
      second = swap;
    }
    tMin = Math.max(tMin, first);
    tMax = Math.min(tMax, second);
    if (tMin - tMax > EPSILON) {
      return null;
    }
  }
  if (tMax < -EPSILON || tMin > 1 + EPSILON) {
    return null;
  }
  return Math.max(0, Math.min(1, tMin));
}

function normalizeCloud(rawCloud, index, levelColors) {
  var fieldName = "level.colorClouds[" + index + "]";
  if (!rawCloud || typeof rawCloud !== "object" || Array.isArray(rawCloud)) {
    throw new Error(fieldName + " must be an object.");
  }
  assertExactKeys(rawCloud, REQUIRED_CONFIG_KEYS, fieldName);
  if (typeof rawCloud.visible !== "boolean") {
    throw new Error(fieldName + ".visible must be boolean.");
  }
  if (!Number.isInteger(rawCloud.hitDispearTime) || rawCloud.hitDispearTime <= 0) {
    throw new Error(fieldName + ".hitDispearTime must be a positive integer.");
  }
  var startTime = assertFiniteNumber(rawCloud.startTime, fieldName + ".startTime");
  if (startTime < 0) {
    throw new Error(fieldName + ".startTime must be non-negative.");
  }
  var speed = assertFiniteNumber(rawCloud.speed, fieldName + ".speed");
  if (speed === 0) {
    throw new Error(fieldName + ".speed must be non-zero.");
  }
  if (
    rawCloud.color !== ColorCloudConfig.rainbowColorCode &&
    (ColorCloudConfig.normalColorCodes.indexOf(rawCloud.color) === -1 || levelColors.indexOf(rawCloud.color) === -1)
  ) {
    throw new Error(fieldName + ".color must be RAINBOW or a color in level.colors.");
  }
  var renderSize = ColorCloudConfig.getRenderSize(rawCloud.color);
  var initialPosition = assertPoint(rawCloud.position, fieldName + ".position");
  var travelMinX = assertFiniteNumber(BoardLayout.boardLeft, "BoardLayout.boardLeft") + renderSize.width * 0.5;
  var travelMaxX = assertFiniteNumber(BoardLayout.boardRight, "BoardLayout.boardRight") - renderSize.width * 0.5;
  if (travelMinX >= travelMaxX) {
    throw new Error("Color cloud horizontal travel bounds must leave positive movement space.");
  }
  if (initialPosition.x < travelMinX || initialPosition.x > travelMaxX) {
    throw new Error(
      fieldName + ".position.x must keep the entire cloud inside [" + travelMinX + ", " + travelMaxX + "]."
    );
  }
  return {
    id: "color_cloud_" + String(index + 1).padStart(3, "0"),
    visible: rawCloud.visible,
    initialPosition: initialPosition,
    hitDispearTime: rawCloud.hitDispearTime,
    startTime: startTime,
    speed: speed,
    color: rawCloud.color,
    collisionHalfWidth: renderSize.width * 0.5,
    collisionHalfHeight: renderSize.height * 0.5,
    travelMinX: travelMinX,
    travelMaxX: travelMaxX,
    hitCount: 0,
    status: rawCloud.visible ? "waiting" : "hidden",
    fadeElapsed: 0,
    opacity: rawCloud.visible ? 255 : 0
  };
}

function ColorCloudSystem() {
  BaseSystem.call(this, "ColorCloudSystem");
  if (
    !SpecialAnimationTiming.colorCloud ||
    typeof SpecialAnimationTiming.colorCloud.fadeDuration !== "number" ||
    !isFinite(SpecialAnimationTiming.colorCloud.fadeDuration) ||
    SpecialAnimationTiming.colorCloud.fadeDuration <= 0
  ) {
    throw new Error("SpecialAnimationTiming.colorCloud.fadeDuration must be positive.");
  }
  this.fadeDuration = SpecialAnimationTiming.colorCloud.fadeDuration;
  this.elapsedTime = 0;
  this.frameStartElapsedTime = 0;
  this.frameEndElapsedTime = 0;
  this.levelColors = [];
  this.clouds = [];
  this.version = 0;
}

ColorCloudSystem.prototype = Object.create(BaseSystem.prototype);
ColorCloudSystem.prototype.constructor = ColorCloudSystem;

ColorCloudSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level || !Array.isArray(levelConfig.level.colors)) {
    throw new Error("ColorCloudSystem requires level.colors.");
  }
  if (!Array.isArray(levelConfig.level.colorClouds)) {
    throw new Error("ColorCloudSystem requires normalized level.colorClouds.");
  }
  this.levelColors = levelConfig.level.colors.slice();
  this.clouds = levelConfig.level.colorClouds.map(function (cloud, index) {
    return normalizeCloud(cloud, index, this.levelColors);
  }, this);
  this.elapsedTime = 0;
  this.frameStartElapsedTime = 0;
  this.frameEndElapsedTime = 0;
  this.version += 1;
  return this;
};

ColorCloudSystem.prototype._positionAt = function (cloud, elapsedTime) {
  if (cloud.freezePosition) {
    return clonePoint(cloud.freezePosition);
  }
  var movingDuration = Math.max(0, elapsedTime - cloud.startTime);
  if (movingDuration <= 0) {
    return clonePoint(cloud.initialPosition);
  }
  var travelSpan = cloud.travelMaxX - cloud.travelMinX;
  var travelPeriod = travelSpan * 2;
  var unwrappedOffset = cloud.initialPosition.x - cloud.travelMinX + cloud.speed * movingDuration;
  var phase = ((unwrappedOffset % travelPeriod) + travelPeriod) % travelPeriod;
  var positionX = phase <= travelSpan
    ? cloud.travelMinX + phase
    : cloud.travelMaxX - (phase - travelSpan);
  return {
    x: positionX,
    y: cloud.initialPosition.y
  };
};

ColorCloudSystem.prototype._appendMovementSplitFractions = function (
  cloud,
  segmentStartTime,
  segmentEndTime,
  splitFractions
) {
  var duration = segmentEndTime - segmentStartTime;
  if (duration <= EPSILON || segmentEndTime <= cloud.startTime) {
    return;
  }
  if (cloud.startTime > segmentStartTime && cloud.startTime < segmentEndTime) {
    splitFractions.push((cloud.startTime - segmentStartTime) / duration);
  }
  var speedMagnitude = Math.abs(cloud.speed);
  var travelSpan = cloud.travelMaxX - cloud.travelMinX;
  var firstBounceDelay = cloud.speed > 0
    ? (cloud.travelMaxX - cloud.initialPosition.x) / speedMagnitude
    : (cloud.initialPosition.x - cloud.travelMinX) / speedMagnitude;
  var bounceInterval = travelSpan / speedMagnitude;
  var firstBounceTime = cloud.startTime + firstBounceDelay;
  var bounceIndex = Math.max(0, Math.floor((segmentStartTime - firstBounceTime) / bounceInterval));
  var bounceTime = firstBounceTime + bounceIndex * bounceInterval;
  while (bounceTime <= segmentStartTime + EPSILON) {
    bounceIndex += 1;
    bounceTime = firstBounceTime + bounceIndex * bounceInterval;
  }
  var bounceCount = 0;
  while (bounceTime < segmentEndTime - EPSILON) {
    splitFractions.push((bounceTime - segmentStartTime) / duration);
    bounceCount += 1;
    if (bounceCount > 4096) {
      throw new Error("Color cloud movement produced too many boundary reflections in one projectile segment.");
    }
    bounceIndex += 1;
    bounceTime = firstBounceTime + bounceIndex * bounceInterval;
  }
};

ColorCloudSystem.prototype.update = function (dt, paused) {
  var safeDt = assertFiniteNumber(dt, "ColorCloudSystem.update dt");
  if (safeDt < 0) {
    throw new Error("ColorCloudSystem.update dt must be non-negative.");
  }
  if (typeof paused !== "boolean") {
    throw new Error("ColorCloudSystem.update paused must be boolean.");
  }
  this.frameStartElapsedTime = this.elapsedTime;
  if (!paused) {
    this.elapsedTime += safeDt;
  }
  this.frameEndElapsedTime = this.elapsedTime;

  var changed = false;
  this.clouds.forEach(function (cloud) {
    if (cloud.status === "hidden" || cloud.status === "removed") {
      return;
    }
    if (cloud.status === "fading") {
      if (!paused) {
        cloud.fadeElapsed += safeDt;
        cloud.opacity = Math.max(0, Math.round(255 * (1 - cloud.fadeElapsed / this.fadeDuration)));
        if (cloud.fadeElapsed >= this.fadeDuration) {
          cloud.status = "removed";
          cloud.opacity = 0;
        }
        changed = true;
      }
      return;
    }
    var nextStatus = this.elapsedTime >= cloud.startTime ? "moving" : "waiting";
    if (nextStatus !== cloud.status || (!paused && nextStatus === "moving" && safeDt > 0)) {
      cloud.status = nextStatus;
      changed = true;
    }
  }, this);
  if (changed) {
    this.version += 1;
  }
  return changed;
};

ColorCloudSystem.prototype._relativePointAt = function (cloud, projectilePoint, elapsedTime) {
  var cloudPosition = this._positionAt(cloud, elapsedTime);
  return {
    x: projectilePoint.x - cloudPosition.x,
    y: projectilePoint.y - cloudPosition.y
  };
};

ColorCloudSystem.prototype._findEntryFraction = function (cloud, fromPoint, toPoint, segmentStartTime, segmentEndTime) {
  var splitFractions = [0, 1];
  var duration = segmentEndTime - segmentStartTime;
  this._appendMovementSplitFractions(cloud, segmentStartTime, segmentEndTime, splitFractions);
  splitFractions.sort(function (left, right) { return left - right; });
  for (var index = 0; index < splitFractions.length - 1; index += 1) {
    var startFraction = splitFractions[index];
    var endFraction = splitFractions[index + 1];
    var startProjectile = {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * startFraction,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * startFraction
    };
    var endProjectile = {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * endFraction,
      y: fromPoint.y + (toPoint.y - fromPoint.y) * endFraction
    };
    var startTime = segmentStartTime + duration * startFraction;
    var endTime = segmentStartTime + duration * endFraction;
    var localEntry = segmentAabbEntry(
      this._relativePointAt(cloud, startProjectile, startTime),
      this._relativePointAt(cloud, endProjectile, endTime),
      cloud
    );
    if (localEntry !== null) {
      return startFraction + (endFraction - startFraction) * localEntry;
    }
  }
  return null;
};

ColorCloudSystem.prototype._resolveCloudColor = function (cloud, randomFn) {
  if (cloud.color !== ColorCloudConfig.rainbowColorCode) {
    return cloud.color;
  }
  if (typeof randomFn !== "function") {
    throw new Error("Rainbow color cloud requires random function.");
  }
  var randomValue = randomFn();
  if (typeof randomValue !== "number" || !isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error("Rainbow color cloud random value must be in [0, 1).");
  }
  return this.levelColors[Math.floor(randomValue * this.levelColors.length)];
};

ColorCloudSystem.prototype.resolveProjectileSegment = function (
  fromPoint,
  toPoint,
  frameStartFraction,
  frameEndFraction,
  contactState,
  randomFn
) {
  var safeFrom = assertPoint(fromPoint, "Color cloud projectile segment fromPoint");
  var safeTo = assertPoint(toPoint, "Color cloud projectile segment toPoint");
  var safeStartFraction = assertFiniteNumber(frameStartFraction, "Color cloud frameStartFraction");
  var safeEndFraction = assertFiniteNumber(frameEndFraction, "Color cloud frameEndFraction");
  if (safeStartFraction < 0 || safeEndFraction > 1 || safeEndFraction < safeStartFraction) {
    throw new Error("Color cloud frame fractions must satisfy 0 <= start <= end <= 1.");
  }
  if (!contactState || typeof contactState !== "object" || Array.isArray(contactState)) {
    throw new Error("Color cloud projectile contactState must be an object.");
  }
  var frameDuration = this.frameEndElapsedTime - this.frameStartElapsedTime;
  var segmentStartTime = this.frameStartElapsedTime + frameDuration * safeStartFraction;
  var segmentEndTime = this.frameStartElapsedTime + frameDuration * safeEndFraction;
  var candidates = [];

  this.clouds.forEach(function (cloud) {
    if (cloud.status === "hidden" || cloud.status === "removed" || cloud.status === "fading") {
      contactState[cloud.id] = false;
      return;
    }
    var startRelative = this._relativePointAt(cloud, safeFrom, segmentStartTime);
    var endRelative = this._relativePointAt(cloud, safeTo, segmentEndTime);
    var startsInside = containsRelativePoint(startRelative, cloud);
    var endsInside = containsRelativePoint(endRelative, cloud);
    var wasInside = contactState[cloud.id] === true;
    if (!wasInside) {
      var entryFraction = startsInside ? 0 : this._findEntryFraction(
        cloud,
        safeFrom,
        safeTo,
        segmentStartTime,
        segmentEndTime
      );
      if (entryFraction !== null) {
        candidates.push({ cloud: cloud, entryFraction: entryFraction });
      }
    }
    contactState[cloud.id] = endsInside;
  }, this);

  candidates.sort(function (left, right) {
    if (Math.abs(left.entryFraction - right.entryFraction) > EPSILON) {
      return left.entryFraction - right.entryFraction;
    }
    return left.cloud.id.localeCompare(right.cloud.id);
  });

  return candidates.map(function (candidate) {
    var cloud = candidate.cloud;
    cloud.hitCount += 1;
    var fadeStarted = cloud.hitCount >= cloud.hitDispearTime;
    if (fadeStarted) {
      var hitElapsedTime = segmentStartTime + (segmentEndTime - segmentStartTime) * candidate.entryFraction;
      cloud.freezePosition = this._positionAt(cloud, hitElapsedTime);
      cloud.status = "fading";
      cloud.fadeElapsed = 0;
      cloud.opacity = 255;
    }
    this.version += 1;
    return {
      cloudId: cloud.id,
      cloudColor: cloud.color,
      resolvedColor: this._resolveCloudColor(cloud, randomFn),
      hitCount: cloud.hitCount,
      hitDispearTime: cloud.hitDispearTime,
      fadeStarted: fadeStarted,
      entryFraction: candidate.entryFraction
    };
  }, this);
};

ColorCloudSystem.prototype.snapshotForRender = function () {
  return {
    version: this.version,
    elapsedTime: this.elapsedTime,
    activeClouds: this.clouds.filter(function (cloud) {
      return cloud.status !== "hidden" && cloud.status !== "removed";
    }).map(function (cloud) {
      return {
        id: cloud.id,
        position: clonePoint(this._positionAt(cloud, this.elapsedTime)),
        color: cloud.color,
        hitCount: cloud.hitCount,
        hitDispearTime: cloud.hitDispearTime,
        status: cloud.status,
        opacity: cloud.opacity
      };
    }, this)
  };
};

module.exports = ColorCloudSystem;
