"use strict";

var BoardLayout = require("../config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function quantize(value, step) {
  return Math.round(value / step) * step;
}

function normalizeDirection(vector) {
  var vx = vector && typeof vector.x === "number" ? vector.x : 0;
  var vy = vector && typeof vector.y === "number" ? vector.y : 1;
  var length = Math.sqrt(vx * vx + vy * vy) || 1;
  return {
    x: vx / length,
    y: vy / length
  };
}

function appendUniquePathPoint(pathPoints, point) {
  if (!point) {
    return;
  }

  if (!pathPoints.length || distance(pathPoints[pathPoints.length - 1], point) > 0.001) {
    pathPoints.push(clone(point));
  }
}

function resolveFirstBounceWallX(shotPlan, origin, target) {
  var direction = shotPlan && shotPlan.direction ? shotPlan.direction : null;
  if (direction && Math.abs(direction.x) > 0.0001) {
    return direction.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
  }

  return target.x >= origin.x ? BoardLayout.boardRight : BoardLayout.boardLeft;
}

function buildBounceWallSequence(firstWallX, bounceCount) {
  var sequence = [];
  if (!bounceCount || bounceCount <= 0) {
    return sequence;
  }

  var isLeftFirst = Math.abs(firstWallX - BoardLayout.boardLeft) <= Math.abs(firstWallX - BoardLayout.boardRight);
  for (var i = 0; i < bounceCount; i += 1) {
    var useLeft = isLeftFirst ? (i % 2 === 0) : (i % 2 === 1);
    sequence.push(useLeft ? BoardLayout.boardLeft : BoardLayout.boardRight);
  }

  return sequence;
}

function buildReconstructedBouncePoints(origin, target, wallSequence) {
  if (!wallSequence.length) {
    return [];
  }

  var laneWidth = Math.abs(BoardLayout.boardRight - BoardLayout.boardLeft);
  var firstWallX = wallSequence[0];
  var lastWallX = wallSequence[wallSequence.length - 1];
  var firstSpanX = Math.abs(firstWallX - origin.x);
  var middleSpanX = Math.max(0, wallSequence.length - 1) * laneWidth;
  var lastSpanX = Math.abs(target.x - lastWallX);
  var totalSpanX = firstSpanX + middleSpanX + lastSpanX;
  var deltaY = target.y - origin.y;
  var EPSILON = 0.000001;
  if (totalSpanX <= EPSILON) {
    return null;
  }

  var bouncePoints = [];
  for (var i = 0; i < wallSequence.length; i += 1) {
    var cumulativeSpanX = firstSpanX + i * laneWidth;
    var t = cumulativeSpanX / totalSpanX;
    if (t <= EPSILON || t >= 1 - EPSILON) {
      return null;
    }

    bouncePoints.push({
      x: wallSequence[i],
      y: origin.y + deltaY * t
    });
  }

  return bouncePoints;
}

function buildProjectilePathFromShotPlan(shotPlan) {
  var origin = shotPlan && shotPlan.origin ? clone(shotPlan.origin) : clone(BoardLayout.shooterOrigin);
  var target = shotPlan && shotPlan.targetCellPosition ? clone(shotPlan.targetCellPosition) : clone(origin);
  var bounceCount = shotPlan && typeof shotPlan.wallBounceCount === "number"
    ? Math.max(0, Math.floor(shotPlan.wallBounceCount))
    : 0;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, origin);
  if (bounceCount > 0) {
    var firstWallX = resolveFirstBounceWallX(shotPlan, origin, target);
    var wallSequence = buildBounceWallSequence(firstWallX, bounceCount);
    var bouncePoints = buildReconstructedBouncePoints(origin, target, wallSequence);
    if (bouncePoints && bouncePoints.length) {
      bouncePoints.forEach(function (point) {
        appendUniquePathPoint(pathPoints, point);
      });
    }
  }

  appendUniquePathPoint(pathPoints, target);

  if (pathPoints.length < 2) {
    pathPoints.push(clone(target));
  }

  return pathPoints;
}

function measurePathDistance(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return 0;
  }

  var total = 0;
  for (var i = 1; i < pathPoints.length; i += 1) {
    total += distance(pathPoints[i - 1], pathPoints[i]);
  }

  return total;
}

function buildAimGuidePath(origin, direction, maxBounces, topY) {
  var start = origin ? clone(origin) : clone(BoardLayout.shooterOrigin);
  var rayDirection = normalizeDirection(direction || { x: 0, y: 1 });
  var maxBounceCount = Math.max(0, Math.floor(Number(maxBounces) || 0));
  var topBoundaryY = typeof topY === "number" ? topY : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  var EPSILON = 0.000001;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, start);

  var currentPoint = clone(start);
  var currentDirection = clone(rayDirection);
  var remainingBounces = maxBounceCount;

  for (var guard = 0; guard < maxBounceCount + 3; guard += 1) {
    var distanceToTop = Number.POSITIVE_INFINITY;
    if (currentDirection.y > EPSILON) {
      var projectedTopDistance = (topBoundaryY - currentPoint.y) / currentDirection.y;
      if (projectedTopDistance > EPSILON) {
        distanceToTop = projectedTopDistance;
      }
    }

    var distanceToWall = Number.POSITIVE_INFINITY;
    if (Math.abs(currentDirection.x) > EPSILON) {
      var boundaryX = currentDirection.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
      var projectedWallDistance = (boundaryX - currentPoint.x) / currentDirection.x;
      if (projectedWallDistance > EPSILON) {
        distanceToWall = projectedWallDistance;
      }
    }

    var hitWall = isFinite(distanceToWall) &&
      distanceToWall < distanceToTop - EPSILON &&
      remainingBounces > 0;
    var travelDistance = hitWall ? distanceToWall : distanceToTop;

    if (!isFinite(travelDistance) || travelDistance <= EPSILON) {
      break;
    }

    currentPoint = {
      x: currentPoint.x + currentDirection.x * travelDistance,
      y: currentPoint.y + currentDirection.y * travelDistance
    };
    appendUniquePathPoint(pathPoints, currentPoint);

    if (!hitWall) {
      break;
    }

    currentDirection.x = -currentDirection.x;
    remainingBounces -= 1;
    currentPoint = {
      x: currentPoint.x + currentDirection.x * 0.01,
      y: currentPoint.y + currentDirection.y * 0.01
    };
  }

  if (pathPoints.length < 2) {
    appendUniquePathPoint(pathPoints, {
      x: start.x + rayDirection.x * 180,
      y: start.y + rayDirection.y * 180
    });
  }

  return pathPoints;
}

module.exports = {
  clone: clone,
  distance: distance,
  lerpPoint: lerpPoint,
  quantize: quantize,
  normalizeDirection: normalizeDirection,
  appendUniquePathPoint: appendUniquePathPoint,
  resolveFirstBounceWallX: resolveFirstBounceWallX,
  buildBounceWallSequence: buildBounceWallSequence,
  buildReconstructedBouncePoints: buildReconstructedBouncePoints,
  buildProjectilePathFromShotPlan: buildProjectilePathFromShotPlan,
  measurePathDistance: measurePathDistance,
  buildAimGuidePath: buildAimGuidePath
};
