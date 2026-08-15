"use strict";

function attachBubbleGridCollisionMethods(BubbleGrid, context) {
  var BoardLayout = context.BoardLayout;
  var EPSILON = context.EPSILON;
  var clamp = context.clamp;
  var clone = context.clone;
  var dot = context.dot;
  var keyFor = context.keyFor;
  var normalize = context.normalize;

  function isTransparentBallCell(cell) {
    return !!(
      cell &&
      cell.entityCategory === "reactive_ball" &&
      cell.entityType === "transparent_ball"
    );
  }

BubbleGrid.prototype.getNeighborCells = function (row, col) {
  return this.getNeighborCoordinates(row, col).map(function (candidate) {
    return this.getCell(candidate.row, candidate.col);
  }, this).filter(Boolean);
};

BubbleGrid.prototype.getOccupiedNeighborCount = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (count, neighbor) {
    return count + (this.hasCell(neighbor.row, neighbor.col) ? 1 : 0);
  }.bind(this), 0);
};

BubbleGrid.prototype.getOccupiedNeighborStats = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (stats, neighbor) {
    if (!this.hasCell(neighbor.row, neighbor.col)) {
      return stats;
    }

    stats.total += 1;
    if (neighbor.row < row) {
      stats.upper += 1;
    } else if (neighbor.row === row) {
      stats.same += 1;
    } else {
      stats.lower += 1;
    }

    return stats;
  }.bind(this), {
    total: 0,
    upper: 0,
    same: 0,
    lower: 0
  });
};

BubbleGrid.prototype.isAttachableCell = function (row, col, direction, options) {
  options = options || {};

  if (!this.isValidCell(row, col) || this.hasCell(row, col)) {
    return false;
  }
  if (
    this.isTrappedSpiritReservedCell(row, col) ||
    this.hasWormholeAt(row, col)
  ) {
    return false;
  }

  if (row === 0) {
    if (this.isTrappedSpriteRescueActive()) {
      return false;
    }
    return options.allowTopRow !== false;
  }

  var minOccupiedNeighbors = typeof options.minOccupiedNeighbors === "number"
    ? Math.max(1, Math.floor(options.minOccupiedNeighbors))
    : 1;
  var minUpperOccupiedNeighbors = typeof options.minUpperOccupiedNeighbors === "number"
    ? Math.max(0, Math.floor(options.minUpperOccupiedNeighbors))
    : 0;
  var occupiedStats = this.getOccupiedNeighborStats(row, col);

  if (occupiedStats.total < minOccupiedNeighbors) {
    return false;
  }

  if (occupiedStats.upper < minUpperOccupiedNeighbors) {
    return false;
  }

  return this._isAttachmentCandidateReachable({ row: row, col: col }, direction || { x: 0, y: 1 });
};

BubbleGrid.prototype.findFirstAttachableSlotOnSegment = function (startPoint, endPoint, direction, slotProbeRadius, slotCaptureTightness) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);
  if (a <= EPSILON) {
    return null;
  }

  var radius = typeof slotProbeRadius === "number"
    ? slotProbeRadius
    : Math.max(10, BoardLayout.bubbleRadius * 0.62);
  var captureTightness = typeof slotCaptureTightness === "number"
    ? clamp(slotCaptureTightness, 0.45, 1)
    : 0.78;
  var captureRadius = radius * captureTightness;
  var captureRadiusSq = captureRadius * captureRadius;
  var minEntryAlignment = this.levelConfig &&
    this.levelConfig.level &&
    typeof this.levelConfig.level.aimSlotOpenMinAlignment === "number"
    ? clamp(this.levelConfig.level.aimSlotOpenMinAlignment, -0.2, 0.95)
    : 0.2;

  var slotPaddingRows = Math.ceil(radius / BoardLayout.rowHeight) + 2;
  // Rotated rescue boards no longer have screen-space rows.  Scan the
  // authoritative grid coordinates and evaluate each slot in world space,
  // otherwise a real opening can be hidden behind the first nearby bubble.
  var rowBounds = this.isTrappedSpriteRescueActive()
    ? { minRow: 0, maxRow: this.getRowCount() - 1 }
    : this._resolveSegmentRowBounds(startPoint, endPoint, slotPaddingRows);
  var best = null;

  for (var row = rowBounds.minRow; row <= rowBounds.maxRow; row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (!this.isAttachableCell(row, col, direction, { minOccupiedNeighbors: 2, minUpperOccupiedNeighbors: 1, allowTopRow: true })) {
        continue;
      }

      var center = this.getCellPosition(row, col);
      var toStart = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y
      };
      var b = 2 * dot(segment, toStart);
      var c = dot(toStart, toStart) - radius * radius;
      var discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        continue;
      }

      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }

      if (hitT === null) {
        continue;
      }

      var centerT = clamp(-dot(segment, toStart) / a, 0, 1);
      var closestPoint = {
        x: startPoint.x + segment.x * centerT,
        y: startPoint.y + segment.y * centerT
      };
      var dxClosest = closestPoint.x - center.x;
      var dyClosest = closestPoint.y - center.y;
      var closestDistanceSq = dxClosest * dxClosest + dyClosest * dyClosest;
      if (closestDistanceSq > captureRadiusSq) {
        continue;
      }

      var entryAssessment = this._buildSlotEntryAssessment(row, col, direction || segment, minEntryAlignment);
      if (!entryAssessment.allowed) {
        continue;
      }

      var captureDistanceRatio = 1 - clamp(Math.sqrt(closestDistanceSq) / Math.max(captureRadius, EPSILON), 0, 1);
      var slotConfidence = clamp(
        captureDistanceRatio * 0.45 +
        entryAssessment.alignmentScore * 0.35 +
        entryAssessment.opennessScore * 0.2,
        0,
        1
      );

      if (
        !best ||
        hitT < best.t - EPSILON ||
        (
          Math.abs(hitT - best.t) <= EPSILON &&
          (
            slotConfidence > best.confidence + 0.015 ||
            (
              Math.abs(slotConfidence - best.confidence) <= 0.015 &&
              centerT < best.centerT - EPSILON
            )
          )
        )
      ) {
        best = {
          row: row,
          col: col,
          center: center,
          t: hitT,
          centerT: centerT,
          confidence: slotConfidence,
          entryAlignment: entryAssessment.entryAlignment,
          openNeighborCount: entryAssessment.openNeighborCount,
          point: {
            x: startPoint.x + segment.x * hitT,
            y: startPoint.y + segment.y * hitT
          }
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    cell: { row: best.row, col: best.col },
    point: best.point,
    center: best.center,
    t: best.t,
    confidence: best.confidence,
    entryAlignment: best.entryAlignment,
    openNeighborCount: best.openNeighborCount
  };
};

BubbleGrid.prototype._buildSlotEntryAssessment = function (row, col, incomingDirection, minEntryAlignment) {
  var center = this.getCellPosition(row, col);
  var openNeighbors = this.getNeighborCoordinates(row, col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return {
      allowed: false,
      entryAlignment: -1,
      alignmentScore: 0,
      opennessScore: 0,
      openNeighborCount: 0
    };
  }

  var incoming = normalize(incomingDirection || { x: 0, y: 1 });
  var bestAlignment = -1;

  openNeighbors.forEach(function (neighbor) {
    var neighborPos = this.getCellPosition(neighbor.row, neighbor.col);
    var openDirection = normalize({
      x: center.x - neighborPos.x,
      y: center.y - neighborPos.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, openDirection));
  }, this);

  var threshold = typeof minEntryAlignment === "number" ? minEntryAlignment : 0.2;
  var normalizedAlignment = clamp((bestAlignment - threshold) / Math.max(1 - threshold, EPSILON), 0, 1);
  var opennessScore = clamp(openNeighbors.length / 4, 0, 1);

  return {
    allowed: bestAlignment >= threshold - EPSILON,
    entryAlignment: bestAlignment,
    alignmentScore: normalizedAlignment,
    opennessScore: opennessScore,
    openNeighborCount: openNeighbors.length
  };
};

BubbleGrid.prototype.findCollision = function (point, collisionRadius) {
  var nearest = null;
  var nearestDistance = Number.MAX_VALUE;
  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.collisionDistance;

  this.cells.forEach(function (cell) {
    var cellPosition = this.getCellPosition(cell.row, cell.col);
    var dx = point.x - cellPosition.x;
    var dy = point.y - cellPosition.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius && distance < nearestDistance) {
      nearest = cell;
      nearestDistance = distance;
    }
  }, this);

  return nearest ? clone(nearest) : null;
};

BubbleGrid.prototype.findCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);

  if (a <= EPSILON) {
    var staticCollision = this.findCollision(endPoint, collisionRadius);
    if (!staticCollision) {
      return null;
    }

    var staticCenter = this.getCellPosition(staticCollision.row, staticCollision.col);
    return {
      cell: staticCollision,
      point: clone(endPoint),
      normal: normalize({
        x: endPoint.x - staticCenter.x,
        y: endPoint.y - staticCenter.y
      }),
      t: 1
    };
  }

  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.bubbleDiameter;
  var bestHit = null;
  var paddingRows = this._resolveSegmentPaddingRows(radius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    if (isTransparentBallCell(cell)) {
      return;
    }
    var candidate = this._testSegmentCircleHit(cell, startPoint, segment, a, radius);
    if (this._shouldReplaceSegmentHit(bestHit, candidate)) {
      bestHit = candidate;
    }
  });

  if (!bestHit) {
    return null;
  }

  return this._buildSegmentCollisionResult(bestHit, startPoint, segment);
};

BubbleGrid.prototype.findWormholeCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!startPoint || !endPoint) {
    throw new Error("Wormhole collision requires start and end points.");
  }
  if (!Number.isFinite(collisionRadius) || collisionRadius <= 0) {
    throw new Error("Wormhole collision requires positive collisionRadius.");
  }
  if (typeof this.getWormholes !== "function") {
    throw new Error("Wormhole collision requires BubbleGrid.getWormholes.");
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    return null;
  }

  var bestHit = null;
  this.getWormholes().forEach(function (wormhole) {
    var candidate = this._testSegmentCircleHit(
      wormhole,
      startPoint,
      segment,
      segmentLengthSq,
      collisionRadius
    );
    if (this._shouldReplaceSegmentHit(bestHit, candidate)) {
      bestHit = candidate;
    }
  }, this);
  if (!bestHit) {
    return null;
  }
  var collision = this._buildSegmentCollisionResult(bestHit, startPoint, segment);
  collision.center = clone(bestHit.center);
  return collision;
};

BubbleGrid.prototype.findTransparentBallCollisionsOnPath = function (pathPoints, collisionRadius) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    throw new Error("Transparent ball path collision requires at least two path points.");
  }
  if (!Number.isFinite(collisionRadius) || collisionRadius <= 0) {
    throw new Error("Transparent ball path collision requires positive collisionRadius.");
  }

  var penetratedById = {};
  var penetrated = [];
  var paddingRows = this._resolveSegmentPaddingRows(collisionRadius);

  for (var segmentIndex = 0; segmentIndex < pathPoints.length - 1; segmentIndex += 1) {
    var startPoint = pathPoints[segmentIndex];
    var endPoint = pathPoints[segmentIndex + 1];
    if (
      !startPoint ||
      !endPoint ||
      !Number.isFinite(startPoint.x) ||
      !Number.isFinite(startPoint.y) ||
      !Number.isFinite(endPoint.x) ||
      !Number.isFinite(endPoint.y)
    ) {
      throw new Error("Transparent ball path points must contain finite coordinates.");
    }
    var segment = {
      x: endPoint.x - startPoint.x,
      y: endPoint.y - startPoint.y
    };
    var segmentLengthSq = dot(segment, segment);
    if (segmentLengthSq <= EPSILON) {
      continue;
    }

    var segmentHits = [];
    this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
      if (!isTransparentBallCell(cell)) {
        return;
      }
      if (typeof cell.id !== "string" || !cell.id) {
        throw new Error("Transparent ball collision requires a non-empty cell id.");
      }
      var candidate = this._testSegmentCircleHit(
        cell,
        startPoint,
        segment,
        segmentLengthSq,
        collisionRadius
      );
      if (candidate) {
        segmentHits.push(candidate);
      }
    });
    segmentHits.sort(function (left, right) {
      if (left.t !== right.t) {
        return left.t - right.t;
      }
      return String(left.cell.id) < String(right.cell.id) ? -1 : 1;
    });
    segmentHits.forEach(function (hit) {
      if (penetratedById[hit.cell.id]) {
        return;
      }
      penetratedById[hit.cell.id] = true;
      var entry = clone(hit.cell);
      entry.hitPoint = {
        x: startPoint.x + segment.x * hit.t,
        y: startPoint.y + segment.y * hit.t
      };
      entry.pathSegmentIndex = segmentIndex;
      entry.pathSegmentProgress = Math.sqrt(segmentLengthSq) * hit.t;
      penetrated.push(entry);
    });
  }

  return penetrated;
};

BubbleGrid.prototype.findTrappedSpriteCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!this.isTrappedSpriteRescueActive()) {
    return null;
  }
  if (!startPoint || !endPoint) {
    throw new Error("Trapped sprite collision requires start and end points.");
  }
  if (!Number.isFinite(collisionRadius) || collisionRadius <= 0) {
    throw new Error("Trapped sprite collision requires positive collisionRadius.");
  }

  var center = this.trappedSpriteRescueSystem.getWorldCenter();
  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    return null;
  }

  var startToCenter = {
    x: startPoint.x - center.x,
    y: startPoint.y - center.y
  };
  var b = 2 * dot(segment, startToCenter);
  var c = dot(startToCenter, startToCenter) - collisionRadius * collisionRadius;
  var discriminant = b * b - 4 * segmentLengthSq * c;
  if (discriminant < 0) {
    return null;
  }

  var sqrtDiscriminant = Math.sqrt(discriminant);
  var t1 = (-b - sqrtDiscriminant) / (2 * segmentLengthSq);
  var t2 = (-b + sqrtDiscriminant) / (2 * segmentLengthSq);
  var hitT = null;
  if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
    hitT = clamp(t1, 0, 1);
  } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
    hitT = clamp(t2, 0, 1);
  }
  if (hitT === null) {
    return null;
  }

  var hitPoint = {
    x: startPoint.x + segment.x * hitT,
    y: startPoint.y + segment.y * hitT
  };
  var hitNormal = normalize({
    x: hitPoint.x - center.x,
    y: hitPoint.y - center.y
  });
  if (Math.abs(hitNormal.x) <= 0.0001 && Math.abs(hitNormal.y) <= 0.0001) {
    throw new Error("Trapped sprite collision normal cannot be zero.");
  }

  return {
    point: hitPoint,
    normal: hitNormal,
    center: center,
    t: hitT
  };
};

BubbleGrid.prototype.findCollisionsOnSegmentForRadii = function (startPoint, endPoint, radii) {
  if (!startPoint || !endPoint) {
    return null;
  }
  if (!Array.isArray(radii) || !radii.length) {
    throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires non-empty radii.");
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    var staticHits = {};
    radii.forEach(function (radiusValue) {
      var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
      var staticCollision = this.findCollision(endPoint, radius);
      staticHits[radius] = staticCollision ? {
        cell: staticCollision,
        point: clone(endPoint),
        normal: normalize({
          x: endPoint.x - this.getCellPosition(staticCollision.row, staticCollision.col).x,
          y: endPoint.y - this.getCellPosition(staticCollision.row, staticCollision.col).y
        }),
        t: 1
      } : null;
    }, this);
    return staticHits;
  }

  var uniqueRadii = [];
  var maxRadius = 0;
  radii.forEach(function (radiusValue) {
    var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires positive radius.");
    }
    if (uniqueRadii.indexOf(radius) === -1) {
      uniqueRadii.push(radius);
    }
    if (radius > maxRadius) {
      maxRadius = radius;
    }
  });

  var bestHits = {};
  uniqueRadii.forEach(function (radius) {
    bestHits[radius] = null;
  });
  var paddingRows = this._resolveSegmentPaddingRows(maxRadius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    if (isTransparentBallCell(cell)) {
      return;
    }
    uniqueRadii.forEach(function (radius) {
      var candidate = this._testSegmentCircleHit(cell, startPoint, segment, segmentLengthSq, radius);
      if (this._shouldReplaceSegmentHit(bestHits[radius], candidate)) {
        bestHits[radius] = candidate;
      }
    }, this);
  });

  var results = {};
  uniqueRadii.forEach(function (radius) {
    var bestHit = bestHits[radius];
    results[radius] = bestHit ? this._buildSegmentCollisionResult(bestHit, startPoint, segment) : null;
  }, this);
  return results;
};

BubbleGrid.prototype.findAttachmentCell = function (point, collidedCell, direction, previousPoint) {
  if (!collidedCell) {
    if (this.isTrappedSpriteRescueActive()) {
      return null;
    }
    return this._findTopSlot(point.x);
  }

  var incomingDirection = direction || { x: 0, y: 1 };
  var candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
    if (this.hasCell(candidate.row, candidate.col) || this.hasWormholeAt(candidate.row, candidate.col)) {
      return false;
    }
    if (
      this.isTrappedSpiritReservedCell(candidate.row, candidate.col)
    ) {
      return false;
    }

    return this._isAttachmentCandidateReachable(candidate, incomingDirection);
  }, this);

  if (!candidates.length) {
    candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
      return !this.hasCell(candidate.row, candidate.col) &&
        !this.hasWormholeAt(candidate.row, candidate.col) &&
        !this.isTrappedSpiritReservedCell(candidate.row, candidate.col);
    }, this);
  }

  if (!candidates.length) {
    if (this.isTrappedSpriteRescueActive()) {
      return null;
    }
    return this._findTopSlot(point.x);
  }

  var collidedPosition = this.getCellPosition(collidedCell.row, collidedCell.col);
  var contact = this._resolveAttachmentContact(
    previousPoint || point,
    point,
    collidedPosition,
    incomingDirection
  );

  candidates.sort(function (a, b) {
    var posA = this.getCellPosition(a.row, a.col);
    var posB = this.getCellPosition(b.row, b.col);
    var scoreA = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posA);
    var scoreB = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posB);
    return scoreA - scoreB;
  }.bind(this));

  return candidates[0];
};

BubbleGrid.prototype.findTrappedSpriteAttachmentCell = function (point, direction, previousPoint) {
  if (!this.isTrappedSpriteRescueActive()) {
    throw new Error("Trapped sprite attachment requires active trapped sprite rescue mode.");
  }
  var anchorCell = this.trappedSpriteRescueSystem.getAnchorCell();
  return this.findAttachmentCell(
    point,
    anchorCell,
    direction || { x: 0, y: 1 },
    previousPoint || point
  );
};

BubbleGrid.prototype._isAttachmentCandidateReachable = function (candidate, direction) {
  var openNeighbors = this.getNeighborCoordinates(candidate.row, candidate.col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return false;
  }

  var incoming = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var candidatePosition = this.getCellPosition(candidate.row, candidate.col);
  var bestAlignment = -1;

  openNeighbors.forEach(function (openNeighbor) {
    var openPosition = this.getCellPosition(openNeighbor.row, openNeighbor.col);
    var escapeVector = normalize({
      x: openPosition.x - candidatePosition.x,
      y: openPosition.y - candidatePosition.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, escapeVector));
  }, this);

  return bestAlignment > -0.05;
};

BubbleGrid.prototype._resolveAttachmentContact = function (previousPoint, currentPoint, collidedPosition, direction) {
  var start = previousPoint || currentPoint;
  var end = currentPoint || previousPoint;
  var fallbackNormal = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var segment = {
    x: end.x - start.x,
    y: end.y - start.y
  };
  var radius = BoardLayout.bubbleDiameter;
  var a = dot(segment, segment);
  var contactPoint = null;

  if (a > 0) {
    var toStart = {
      x: start.x - collidedPosition.x,
      y: start.y - collidedPosition.y
    };
    var b = 2 * dot(segment, toStart);
    var c = dot(toStart, toStart) - radius * radius;
    var discriminant = b * b - 4 * a * c;

    if (discriminant >= 0) {
      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= 0 && t1 <= 1) {
        hitT = t1;
      } else if (t2 >= 0 && t2 <= 1) {
        hitT = t2;
      }

      if (hitT !== null) {
        contactPoint = {
          x: start.x + segment.x * hitT,
          y: start.y + segment.y * hitT
        };
      }
    }
  }

  if (!contactPoint) {
    var closestT = a > 0 ? clamp(dot({
      x: collidedPosition.x - start.x,
      y: collidedPosition.y - start.y
    }, segment) / a, 0, 1) : 0;
    var closestPoint = {
      x: start.x + segment.x * closestT,
      y: start.y + segment.y * closestT
    };
    var fallbackFromSegment = normalize({
      x: closestPoint.x - collidedPosition.x,
      y: closestPoint.y - collidedPosition.y
    });
    var resolvedNormal = (Math.abs(fallbackFromSegment.x) > 0.0001 || Math.abs(fallbackFromSegment.y) > 0.0001)
      ? fallbackFromSegment
      : fallbackNormal;

    contactPoint = {
      x: collidedPosition.x + resolvedNormal.x * radius,
      y: collidedPosition.y + resolvedNormal.y * radius
    };
  }

  var contactNormal = normalize({
    x: contactPoint.x - collidedPosition.x,
    y: contactPoint.y - collidedPosition.y
  });

  if (Math.abs(contactNormal.x) <= 0.0001 && Math.abs(contactNormal.y) <= 0.0001) {
    contactNormal = fallbackNormal;
  }

  return {
    point: contactPoint,
    normal: contactNormal
  };
};

BubbleGrid.prototype._measureAttachmentScore = function (contactPoint, contactNormal, collidedPosition, candidatePosition) {
  var candidateVector = normalize({
    x: candidatePosition.x - collidedPosition.x,
    y: candidatePosition.y - collidedPosition.y
  });
  var alignment = clamp(dot(contactNormal, candidateVector), -1, 1);
  var alignmentPenalty = (1 - alignment) * 420;
  var reversePenalty = alignment < -0.2 ? 40000 : 0;
  var dxContact = contactPoint.x - candidatePosition.x;
  var dyContact = contactPoint.y - candidatePosition.y;
  var distancePenalty = dxContact * dxContact + dyContact * dyContact;
  return distancePenalty + alignmentPenalty + reversePenalty;
};

BubbleGrid.prototype._findTopSlot = function (impactX) {
  var row = 0;
  var bestCol = 0;
  var bestDistance = Number.MAX_VALUE;

  for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
    if (this.hasCell(row, col) || this.hasWormholeAt(row, col)) {
      continue;
    }

    var pos = this.getCellPosition(row, col);
    var distance = Math.abs(impactX - pos.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCol = col;
    }
  }

  if (bestDistance < Number.MAX_VALUE) {
    return { row: row, col: bestCol };
  }

  var fallbackRow = this.getRowCount();
  var fallbackColumns = this.getColumnCountForRow(fallbackRow);
  var fallbackBaseX = this.getCellPosition(fallbackRow, 0).x;

  return {
    row: fallbackRow,
    col: Math.max(0, Math.min(fallbackColumns - 1, Math.round((impactX - fallbackBaseX) / BoardLayout.cellWidth)))
  };
};

BubbleGrid.prototype.getCoordinatesWithinRadius = function (row, col, radius) {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error("BubbleGrid.getCoordinatesWithinRadius requires a non-negative integer radius.");
  }

  var visited = {};
  var queue = [{
    row: row,
    col: col,
    distance: 0
  }];
  var result = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = keyFor(current.row, current.col);
    if (visited[key]) {
      continue;
    }
    visited[key] = true;
    result.push({
      row: current.row,
      col: current.col,
      distance: current.distance
    });
    if (current.distance >= radius) {
      continue;
    }
    this.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (!visited[neighborKey]) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col,
          distance: current.distance + 1
        });
      }
    });
  }

  return result;
};

BubbleGrid.prototype.findSplitterSpawnCell = function (splitterCell) {
  if (!splitterCell || !Number.isInteger(splitterCell.row) || !Number.isInteger(splitterCell.col)) {
    throw new Error("BubbleGrid.findSplitterSpawnCell requires splitter cell coordinates.");
  }

  var candidates = [];
  for (var row = 0; row < this.getRowCount(); row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (this.isAttachableCell(row, col, { x: 0, y: 1 }, { allowTopRow: true })) {
        candidates.push({
          row: row,
          col: col
        });
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
};
}

module.exports = attachBubbleGridCollisionMethods;
