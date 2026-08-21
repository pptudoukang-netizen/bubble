"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var RESCUE_BOUNDARY_BOUNCE_LIMIT = 24;

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearlySamePoint(a, b, epsilon) {
  if (!a || !b) {
    return false;
  }

  var maxError = typeof epsilon === "number" ? epsilon : 0.5;
  return Math.abs(a.x - b.x) <= maxError && Math.abs(a.y - b.y) <= maxError;
}

function pushPathPoint(points, point) {
  if (!point) {
    return;
  }

  if (!points.length || !nearlySamePoint(points[points.length - 1], point)) {
    points.push(clone(point));
  }
}

function buildFallbackPlan(grid, origin, direction) {
  if (grid.isTrappedSpriteRescueActive()) {
    throw new Error("Trapped sprite rescue trajectory cannot use the top-attachment fallback.");
  }
  var impactX = origin.x + direction.x * 1200;
  var targetCell = grid.findAttachmentCell({ x: impactX, y: grid.getTopAttachY() }, null, direction, origin);
  var targetCellPosition = grid.getCellPosition(targetCell.row, targetCell.col);

  return {
    valid: true,
    origin: clone(origin),
    direction: clone(direction),
    pathPoints: [clone(origin), clone(targetCellPosition)],
    wallPoints: [],
    wallBounceCount: 0,
    hitType: "fallback",
    hitPoint: { x: impactX, y: grid.getTopAttachY() },
    collidedCell: null,
    targetCell: clone(targetCell),
    targetCellPosition: clone(targetCellPosition),
    totalDistance: distance(origin, targetCellPosition),
    impactDirection: clone(direction)
  };
}

function isBlackHoleCell(cell) {
  return !!(cell && cell.entityCategory === "hazard_ball" && cell.entityType === "black_hole");
}

function buildPlan(origin, direction, wallPoints, hitType, hitPoint, collidedCell, targetCell, targetCellPosition, impactDirection) {
  var pathPoints = [];
  pushPathPoint(pathPoints, origin);

  (wallPoints || []).forEach(function (wallPoint) {
    pushPathPoint(pathPoints, wallPoint);
  });

  // Keep reflection geometry physically correct: travel to the real hit point first.
  pushPathPoint(pathPoints, hitPoint);

  // Then do a tiny snap segment into the final attachment slot center.
  pushPathPoint(pathPoints, targetCellPosition);

  var totalDistance = 0;
  for (var i = 1; i < pathPoints.length; i += 1) {
    totalDistance += distance(pathPoints[i - 1], pathPoints[i]);
  }

  return {
    valid: true,
    origin: clone(origin),
    direction: clone(direction),
    pathPoints: pathPoints,
    wallPoints: clone(wallPoints || []),
    wallBounceCount: (wallPoints || []).length,
    hitType: hitType,
    hitPoint: clone(hitPoint),
    collidedCell: collidedCell ? clone(collidedCell) : null,
    targetCell: clone(targetCell),
    targetCellPosition: clone(targetCellPosition),
    totalDistance: totalDistance,
    impactDirection: clone(impactDirection)
  };
}

function TrajectoryPredictor() {
  BaseSystem.call(this, "TrajectoryPredictor");
  this.maxBounces = 6;
  this.maxRayDistance = 2800;
  this.wallEpsilon = 0.01;
  this.predictionCollisionRadius = Math.max(BoardLayout.bubbleRadius, BoardLayout.collisionDistance - 4);
  this.tunnelAssistRadius = Math.max(BoardLayout.bubbleRadius, this.predictionCollisionRadius - 8);
  this.slotProbeRadius = Math.max(12, BoardLayout.bubbleRadius * 0.62);
  this.slotCaptureTightness = 0.78;
  this.slotBubbleTieDistance = 14;
  this.slotPriorityConfidence = 0.58;
}

TrajectoryPredictor.prototype = Object.create(BaseSystem.prototype);
TrajectoryPredictor.prototype.constructor = TrajectoryPredictor;

TrajectoryPredictor.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  var configured = levelConfig.level && typeof levelConfig.level.aimMaxBounces === "number"
    ? levelConfig.level.aimMaxBounces
    : 6;
  this.maxBounces = Math.max(0, Math.min(8, Math.floor(configured)));

  var configuredCollisionRadius = levelConfig.level && typeof levelConfig.level.aimCollisionRadius === "number"
    ? levelConfig.level.aimCollisionRadius
    : (BoardLayout.collisionDistance - 4);
  this.predictionCollisionRadius = Math.max(
    BoardLayout.bubbleRadius,
    Math.min(BoardLayout.bubbleDiameter, configuredCollisionRadius)
  );

  var configuredTunnelAssistRadius = levelConfig.level && typeof levelConfig.level.aimTunnelAssistRadius === "number"
    ? levelConfig.level.aimTunnelAssistRadius
    : (this.predictionCollisionRadius - 8);
  this.tunnelAssistRadius = Math.max(
    BoardLayout.bubbleRadius,
    Math.min(this.predictionCollisionRadius, configuredTunnelAssistRadius)
  );

  var configuredSlotProbeRadius = levelConfig.level && typeof levelConfig.level.aimSlotProbeRadius === "number"
    ? levelConfig.level.aimSlotProbeRadius
    : (BoardLayout.bubbleRadius * 0.62);
  this.slotProbeRadius = Math.max(10, Math.min(BoardLayout.bubbleRadius, configuredSlotProbeRadius));

  var configuredSlotCaptureTightness = levelConfig.level && typeof levelConfig.level.aimSlotCaptureTightness === "number"
    ? levelConfig.level.aimSlotCaptureTightness
    : 0.78;
  this.slotCaptureTightness = Math.max(0.45, Math.min(1, configuredSlotCaptureTightness));

  var configuredSlotBubbleTieDistance = levelConfig.level && typeof levelConfig.level.aimSlotVsBubbleTieDistance === "number"
    ? levelConfig.level.aimSlotVsBubbleTieDistance
    : 14;
  this.slotBubbleTieDistance = Math.max(0, Math.min(BoardLayout.bubbleDiameter, configuredSlotBubbleTieDistance));

  var configuredSlotPriorityConfidence = levelConfig.level && typeof levelConfig.level.aimSlotPriorityConfidence === "number"
    ? levelConfig.level.aimSlotPriorityConfidence
    : 0.58;
  this.slotPriorityConfidence = clamp(configuredSlotPriorityConfidence, 0, 1);

  return this;
};

TrajectoryPredictor.prototype.predictShotPlan = function (grid, origin, direction) {
  if (!grid || !origin || !direction) {
    return null;
  }

  var rayOrigin = clone(origin);
  var rayDirection = normalize(direction);
  var currentPoint = clone(origin);
  var currentDirection = normalize(direction);
  var wallPoints = [];
  var rescueActive = grid.isTrappedSpriteRescueActive();
  var topAttachY = grid.getTopAttachY();
  var rescueExitY = rayOrigin.y - this.wallEpsilon;
  var boundaryBounceLimit = rescueActive
    ? Math.max(this.maxBounces, RESCUE_BOUNDARY_BOUNCE_LIMIT)
    : this.maxBounces;
  var EPSILON = 0.000001;

  for (var bounce = 0; bounce <= boundaryBounceLimit; bounce += 1) {
    var distanceToWall = Number.POSITIVE_INFINITY;

    if (Math.abs(currentDirection.x) > EPSILON) {
      var boundaryX = currentDirection.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
      var projectedWallDistance = (boundaryX - currentPoint.x) / currentDirection.x;
      if (projectedWallDistance > EPSILON) {
        distanceToWall = projectedWallDistance;
      }
    }

    var probeDistance = Math.min(this.maxRayDistance, isFinite(distanceToWall) ? distanceToWall : this.maxRayDistance);
    var probeEnd = {
      x: currentPoint.x + currentDirection.x * probeDistance,
      y: currentPoint.y + currentDirection.y * probeDistance
    };

    var collisionInfo = grid.findCollisionOnSegment(currentPoint, probeEnd, this.predictionCollisionRadius);
    var distanceToBubble = Number.POSITIVE_INFINITY;
    var blackHoleCollision = null;
    var distanceToBlackHole = Number.POSITIVE_INFINITY;
    if (collisionInfo) {
      if (isBlackHoleCell(collisionInfo.cell)) {
        blackHoleCollision = collisionInfo;
        distanceToBlackHole = collisionInfo.t * probeDistance;
      } else {
        distanceToBubble = collisionInfo.t * probeDistance;
      }
    }
    if (typeof grid.findWormholeCollisionOnSegment !== "function") {
      throw new Error("Trajectory prediction requires BubbleGrid.findWormholeCollisionOnSegment.");
    }
    var wormholeCollision = grid.findWormholeCollisionOnSegment(
      currentPoint,
      probeEnd,
      this.predictionCollisionRadius
    );
    var distanceToWormhole = Number.POSITIVE_INFINITY;
    if (wormholeCollision) {
      distanceToWormhole = wormholeCollision.t * probeDistance;
    }
    if (typeof grid.findWindTunnelEntranceCollisionOnSegment !== "function") {
      throw new Error("Trajectory prediction requires BubbleGrid.findWindTunnelEntranceCollisionOnSegment.");
    }
    var windTunnelCollision = grid.findWindTunnelEntranceCollisionOnSegment(
      currentPoint,
      probeEnd,
      this.predictionCollisionRadius
    );
    var distanceToWindTunnel = Number.POSITIVE_INFINITY;
    if (windTunnelCollision) {
      distanceToWindTunnel = windTunnelCollision.t * probeDistance;
    }
    var trappedSpriteCollision = rescueActive
      ? grid.findTrappedSpriteCollisionOnSegment(currentPoint, probeEnd, this.predictionCollisionRadius)
      : null;
    var distanceToTrappedSprite = Number.POSITIVE_INFINITY;
    if (trappedSpriteCollision) {
      distanceToTrappedSprite = trappedSpriteCollision.t * probeDistance;
    }

    // Rescue boards only use slot probing when a direct bubble collision has
    // no attachment neighbor.  This preserves ordinary rescue impacts while
    // still allowing a shot to settle in a real rotated-board gap.
    var slotInfo = rescueActive
      ? null
      : grid.findFirstAttachableSlotOnSegment(
        currentPoint,
        probeEnd,
        currentDirection,
        this.slotProbeRadius,
        this.slotCaptureTightness
      );
    var distanceToSlot = Number.POSITIVE_INFINITY;
    if (slotInfo) {
      distanceToSlot = slotInfo.t * probeDistance;
    }

    var distanceToTop = Number.POSITIVE_INFINITY;
    if (currentDirection.y > EPSILON) {
      var projectedTopDistance = (topAttachY - currentPoint.y) / currentDirection.y;
      if (projectedTopDistance > EPSILON) {
        distanceToTop = projectedTopDistance;
      }
    }

    var distanceToRescueExit = Number.POSITIVE_INFINITY;
    if (rescueActive && currentDirection.y < -EPSILON) {
      var projectedRescueExitDistance = (rescueExitY - currentPoint.y) / currentDirection.y;
      if (projectedRescueExitDistance > EPSILON) {
        distanceToRescueExit = projectedRescueExitDistance;
      }
    }

    var preferSlot = this._shouldPreferSlotCandidate(slotInfo, distanceToSlot, distanceToBubble, EPSILON);
    var effectiveSlotDistance = preferSlot ? distanceToSlot : Number.POSITIVE_INFINITY;
    var minDistance = Math.min(
      distanceToBubble,
      distanceToBlackHole,
      distanceToWormhole,
      distanceToWindTunnel,
      distanceToTrappedSprite,
      effectiveSlotDistance,
      distanceToTop,
      distanceToRescueExit,
      distanceToWall
    );

    if (!isFinite(minDistance)) {
      if (rescueActive) {
        throw new Error("Trapped sprite rescue trajectory cannot reach a bubble or the cannon exit line.");
      }
      return buildFallbackPlan(grid, rayOrigin, rayDirection);
    }

    if (distanceToBlackHole <= minDistance + EPSILON && blackHoleCollision) {
      var blackHoleImpactPoint = clone(blackHoleCollision.point);
      var blackHolePlan = buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "black_hole",
        blackHoleImpactPoint,
        blackHoleCollision.cell,
        null,
        blackHoleImpactPoint,
        currentDirection
      );
      blackHolePlan.targetCellPosition = null;
      blackHolePlan.absorbingBlackHole = {
        id: String(blackHoleCollision.cell.id),
        row: blackHoleCollision.cell.row,
        col: blackHoleCollision.cell.col,
        position: clone(grid.getCellPosition(blackHoleCollision.cell.row, blackHoleCollision.cell.col))
      };
      return blackHolePlan;
    }

    if (distanceToWormhole <= minDistance + EPSILON && wormholeCollision) {
      var wormholeImpactPoint = clone(wormholeCollision.point);
      var wormholePlan = buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "wormhole",
        wormholeImpactPoint,
        wormholeCollision.cell,
        null,
        wormholeImpactPoint,
        currentDirection
      );
      wormholePlan.targetCellPosition = null;
      wormholePlan.absorbingWormhole = {
        id: String(wormholeCollision.cell.id),
        row: wormholeCollision.cell.row,
        col: wormholeCollision.cell.col,
        position: clone(wormholeCollision.center)
      };
      return wormholePlan;
    }

    if (distanceToWindTunnel <= minDistance + EPSILON && windTunnelCollision) {
      var windTunnelImpactPoint = clone(windTunnelCollision.point);
      var windTunnelPlan = buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "wind_tunnel",
        windTunnelImpactPoint,
        windTunnelCollision.cell,
        null,
        windTunnelImpactPoint,
        currentDirection
      );
      windTunnelPlan.targetCellPosition = null;
      windTunnelPlan.windTunnelEntrance = {
        id: String(windTunnelCollision.cell.id),
        row: windTunnelCollision.cell.row,
        col: windTunnelCollision.cell.col,
        position: clone(windTunnelCollision.center)
      };
      return windTunnelPlan;
    }

    if (preferSlot && distanceToSlot <= minDistance + EPSILON && slotInfo) {
      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "slot",
        slotInfo.point,
        null,
        slotInfo.cell,
        slotInfo.center,
        currentDirection
      );
    }

    if (
      distanceToTrappedSprite <= minDistance + EPSILON &&
      trappedSpriteCollision
    ) {
      var trappedSpriteImpactPoint = clone(trappedSpriteCollision.point);
      var targetFromTrappedSprite = grid.findTrappedSpriteAttachmentCell(
        trappedSpriteImpactPoint,
        currentDirection,
        currentPoint
      );
      if (!targetFromTrappedSprite) {
        throw new Error("Trapped sprite support impact requires an attachment cell.");
      }
      var trappedSpriteTargetPosition = grid.getCellPosition(
        targetFromTrappedSprite.row,
        targetFromTrappedSprite.col
      );
      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "trapped_sprite",
        trappedSpriteImpactPoint,
        null,
        targetFromTrappedSprite,
        trappedSpriteTargetPosition,
        currentDirection
      );
    }

    if (distanceToBubble <= minDistance + EPSILON && collisionInfo) {
      var bubbleImpactPoint = clone(collisionInfo.point);
      var targetFromBubble = grid.findAttachmentCell(
        bubbleImpactPoint,
        collisionInfo.cell,
        currentDirection,
        currentPoint
      );
      if (!targetFromBubble) {
        if (rescueActive) {
          var rescueSlotInfo = grid.findFirstAttachableSlotOnSegment(
            currentPoint,
            bubbleImpactPoint,
            currentDirection,
            this.slotProbeRadius,
            this.slotCaptureTightness
          );
          if (rescueSlotInfo) {
            return buildPlan(
              rayOrigin,
              rayDirection,
              wallPoints,
              "slot",
              rescueSlotInfo.point,
              null,
              rescueSlotInfo.cell,
              rescueSlotInfo.center,
              currentDirection
            );
          }
          throw new Error("Trapped sprite bubble collision requires an attachment cell.");
        }
        return buildPlan(
          rayOrigin,
          rayDirection,
          wallPoints,
          "miss",
          bubbleImpactPoint,
          collisionInfo.cell,
          null,
          bubbleImpactPoint,
          currentDirection
        );
      }
      var bubbleTargetPosition = grid.getCellPosition(targetFromBubble.row, targetFromBubble.col);

      // Tunnel assistance is only valid on the direct ray.  After a side-wall
      // reflection it can replace the first physical collision with a later,
      // higher-row collider, making the final snap jump across an occupied row.
      if (
        !rescueActive &&
        wallPoints.length === 0 &&
        currentDirection.y > 0 &&
        targetFromBubble.row > collisionInfo.cell.row
      ) {
        var tryRadii = [
          this.predictionCollisionRadius,
          this.tunnelAssistRadius,
          Math.max(BoardLayout.bubbleRadius, this.tunnelAssistRadius - 8)
        ];
        var uniqueRadii = [];
        tryRadii.forEach(function (r) {
          var radius = Math.max(BoardLayout.bubbleRadius, Math.min(this.predictionCollisionRadius, r));
          if (uniqueRadii.indexOf(radius) === -1) {
            uniqueRadii.push(radius);
          }
        }, this);

        var bestCandidate = {
          collision: collisionInfo,
          target: targetFromBubble,
          position: bubbleTargetPosition
        };

        var collisionsByRadius = grid.findCollisionsOnSegmentForRadii(currentPoint, probeEnd, uniqueRadii);
        uniqueRadii.forEach(function (radius) {
          var candidateCollision = collisionsByRadius ? collisionsByRadius[radius] : null;
          if (!candidateCollision) {
            return;
          }

          var candidateTarget = grid.findAttachmentCell(
            candidateCollision.point,
            candidateCollision.cell,
            currentDirection,
            currentPoint
          );
          var candidatePosition = grid.getCellPosition(candidateTarget.row, candidateTarget.col);
          var shouldReplace = false;

          if (candidateTarget.row < bestCandidate.target.row) {
            shouldReplace = true;
          } else if (
            candidateTarget.row === bestCandidate.target.row &&
            candidateCollision.t > bestCandidate.collision.t + EPSILON
          ) {
            shouldReplace = true;
          }

          if (shouldReplace) {
            bestCandidate = {
              collision: candidateCollision,
              target: candidateTarget,
              position: candidatePosition
            };
          }
        });

        collisionInfo = bestCandidate.collision;
        bubbleImpactPoint = clone(bestCandidate.collision.point);
        targetFromBubble = bestCandidate.target;
        bubbleTargetPosition = bestCandidate.position;
      }

      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "bubble",
        bubbleImpactPoint,
        collisionInfo.cell,
        targetFromBubble,
        bubbleTargetPosition,
        currentDirection
      );
    }

    if (distanceToRescueExit <= minDistance + EPSILON) {
      var rescueExitPoint = {
        x: currentPoint.x + currentDirection.x * distanceToRescueExit,
        y: rescueExitY
      };
      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "miss",
        rescueExitPoint,
        null,
        null,
        rescueExitPoint,
        currentDirection
      );
    }

    if (distanceToTop <= minDistance + EPSILON) {
      var topImpactPoint = {
        x: currentPoint.x + currentDirection.x * distanceToTop,
        y: topAttachY
      };
      if (rescueActive) {
        if (bounce >= boundaryBounceLimit) {
          throw new Error("Trapped sprite rescue trajectory exceeded its boundary bounce limit.");
        }
        var hitSideWallAtTop = isFinite(distanceToWall) &&
          Math.abs(distanceToWall - distanceToTop) <= EPSILON;
        wallPoints.push(topImpactPoint);
        currentDirection = {
          x: hitSideWallAtTop ? -currentDirection.x : currentDirection.x,
          y: -currentDirection.y
        };
        currentPoint = {
          x: topImpactPoint.x + currentDirection.x * this.wallEpsilon,
          y: topImpactPoint.y + currentDirection.y * this.wallEpsilon
        };
        continue;
      }
      var targetFromTop = grid.findAttachmentCell(topImpactPoint, null, currentDirection, currentPoint);
      var topTargetPosition = grid.getCellPosition(targetFromTop.row, targetFromTop.col);

      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "top",
        topImpactPoint,
        null,
        targetFromTop,
        topTargetPosition,
        currentDirection
      );
    }

    if (
      distanceToWall <= minDistance + EPSILON &&
      isFinite(distanceToWall) &&
      bounce < boundaryBounceLimit
    ) {
      var wallPoint = {
        x: currentPoint.x + currentDirection.x * distanceToWall,
        y: currentPoint.y + currentDirection.y * distanceToWall
      };
      wallPoints.push(wallPoint);

      currentDirection = {
        x: -currentDirection.x,
        y: currentDirection.y
      };
      currentPoint = {
        x: wallPoint.x + currentDirection.x * this.wallEpsilon,
        y: wallPoint.y + currentDirection.y * this.wallEpsilon
      };
      continue;
    }

    if (rescueActive) {
      throw new Error("Trapped sprite rescue trajectory exceeded its boundary bounce limit.");
    }
    return buildFallbackPlan(grid, rayOrigin, rayDirection);
  }

  if (rescueActive) {
    throw new Error("Trapped sprite rescue trajectory did not resolve within the boundary bounce limit.");
  }
  return buildFallbackPlan(grid, rayOrigin, rayDirection);
};

TrajectoryPredictor.prototype._shouldPreferSlotCandidate = function (slotInfo, distanceToSlot, distanceToBubble, epsilon) {
  if (!slotInfo || !isFinite(distanceToSlot)) {
    return false;
  }

  if (!isFinite(distanceToBubble)) {
    return true;
  }

  var tieDistance = Math.max(0, this.slotBubbleTieDistance || 0);
  var gap = distanceToSlot - distanceToBubble;
  var slotConfidence = clamp(typeof slotInfo.confidence === "number" ? slotInfo.confidence : 0, 0, 1);

  if (tieDistance <= epsilon) {
    return gap <= epsilon && slotConfidence >= Math.max(0, this.slotPriorityConfidence - 0.08);
  }

  if (gap <= -tieDistance) {
    return true;
  }

  if (gap >= tieDistance) {
    return false;
  }

  var closeness = 1 - clamp(Math.abs(gap) / tieDistance, 0, 1);
  var blendedScore = slotConfidence * 0.75 + closeness * 0.25;
  var requiredConfidence = gap <= epsilon
    ? Math.max(0, this.slotPriorityConfidence - 0.08)
    : this.slotPriorityConfidence;

  return blendedScore >= requiredConfidence;
};

TrajectoryPredictor.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.maxBounces = this.maxBounces;
  snapshot.maxRayDistance = this.maxRayDistance;
  snapshot.predictionCollisionRadius = this.predictionCollisionRadius;
  snapshot.tunnelAssistRadius = this.tunnelAssistRadius;
  snapshot.slotProbeRadius = this.slotProbeRadius;
  snapshot.slotCaptureTightness = this.slotCaptureTightness;
  snapshot.slotBubbleTieDistance = this.slotBubbleTieDistance;
  snapshot.slotPriorityConfidence = this.slotPriorityConfidence;
  return snapshot;
};

module.exports = TrajectoryPredictor;








