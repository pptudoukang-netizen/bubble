"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(row, col) {
  return row + ":" + col;
}

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

var EPSILON = 0.000001;

function BubbleGrid() {
  BaseSystem.call(this, "BubbleGrid");
  this.layout = [];
  this.specialEntities = [];
  this.coordinateSystem = "odd-r-hex";
  this.cells = [];
  this.maxColumns = 0;
  this.version = 0;
  this.dropOffsetRows = 0;
  this._cellMap = {};
  this._specialCellMap = {};
}

BubbleGrid.prototype = Object.create(BaseSystem.prototype);
BubbleGrid.prototype.constructor = BubbleGrid;

BubbleGrid.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.layout = levelConfig.level.layout.slice();
  this.specialEntities = Array.isArray(levelConfig.level.specialEntities)
    ? clone(levelConfig.level.specialEntities)
    : [];
  this.coordinateSystem = levelConfig.coordinateSystem || this.coordinateSystem;
  var layoutMaxColumns = this.layout.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
  this.maxColumns = Math.max(BoardLayout.defaultColumns || 9, layoutMaxColumns);
  this._normalizeLayoutRows();
  this._rebuildSpecialCellMap();
  this.dropOffsetRows = 0;
  this.version = 1;
  this._rebuildCaches();
  return this;
};

BubbleGrid.prototype.getColumnCountForRow = function (row) {
  return BoardLayout.getRowColumnCount(row, this.maxColumns);
};

BubbleGrid.prototype.isValidCell = function (row, col) {
  return row >= 0 && col >= 0 && col < this.getColumnCountForRow(row);
};

BubbleGrid.prototype._normalizeRowString = function (rowIndex, rowString) {
  var rowColumns = this.getColumnCountForRow(rowIndex);
  var source = typeof rowString === "string" ? rowString : "";
  var normalized = source.slice(0, rowColumns);

  if (normalized.length < rowColumns) {
    normalized += ".".repeat(rowColumns - normalized.length);
  }

  return normalized;
};

BubbleGrid.prototype._normalizeLayoutRows = function () {
  this.layout = this.layout.map(function (rowString, rowIndex) {
    return this._normalizeRowString(rowIndex, rowString);
  }, this);
};

BubbleGrid.prototype._rebuildSpecialCellMap = function () {
  this._specialCellMap = {};

  (this.specialEntities || []).forEach(function (entity) {
    if (!entity || !this.isValidCell(entity.row, entity.col)) {
      return;
    }

    this._specialCellMap[keyFor(entity.row, entity.col)] = {
      id: entity.id || ("special_" + entity.row + "_" + entity.col),
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      innerColor: entity.innerColor || null,
      row: entity.row,
      col: entity.col
    };
  }, this);
};

BubbleGrid.prototype._createNormalCell = function (row, col, colorCode) {
  return {
    row: row,
    col: col,
    color: colorCode,
    id: row + "_" + col,
    entityCategory: "normal_ball",
    entityType: null,
    isSpecial: false
  };
};

BubbleGrid.prototype._createSpecialCell = function (entity, row, col) {
  return {
    row: row,
    col: col,
    color: null,
    id: entity.id || ("special_" + row + "_" + col),
    entityCategory: entity.entityCategory,
    entityType: entity.entityType,
    innerColor: entity.innerColor || null,
    isSpecial: true
  };
};

BubbleGrid.prototype._rebuildCaches = function () {
  this.cells = [];
  this._cellMap = {};

  this.layout.forEach(function (row, rowIndex) {
    var normalizedRow = this._normalizeRowString(rowIndex, row);
    this.layout[rowIndex] = normalizedRow;
    normalizedRow.split("").forEach(function (cellCode, columnIndex) {
      if (cellCode === ".") {
        return;
      }

      var cell = this._createNormalCell(rowIndex, columnIndex, cellCode);

      this.cells.push(cell);
      this._cellMap[keyFor(rowIndex, columnIndex)] = cell;
    }, this);
  }, this);

  Object.keys(this._specialCellMap).forEach(function (key) {
    if (this._cellMap[key]) {
      // Keep normal layout data authoritative when overlap happens by mistake.
      return;
    }

    var entity = this._specialCellMap[key];
    var specialCell = this._createSpecialCell(entity, entity.row, entity.col);
    this.cells.push(specialCell);
    this._cellMap[key] = specialCell;
  }, this);
};

BubbleGrid.prototype._ensureRow = function (rowIndex) {
  while (this.layout.length <= rowIndex) {
    this.layout.push(".".repeat(this.getColumnCountForRow(this.layout.length)));
  }
};

BubbleGrid.prototype._setCell = function (row, col, color) {
  this._ensureRow(row);
  var normalizedRow = this._normalizeRowString(row, this.layout[row]);
  var chars = normalizedRow.split("");
  chars[col] = color;
  this.layout[row] = chars.join("");
};

BubbleGrid.prototype._clearSpecialCell = function (row, col) {
  delete this._specialCellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getSpecialEntities = function () {
  return Object.keys(this._specialCellMap).map(function (key) {
    return clone(this._specialCellMap[key]);
  }, this);
};

BubbleGrid.prototype.getRowCount = function () {
  return this.layout.length;
};

BubbleGrid.prototype.getCells = function () {
  return clone(this.cells);
};

BubbleGrid.prototype.getMaxColumns = function () {
  return this.maxColumns;
};

BubbleGrid.prototype.getDropOffsetRows = function () {
  return this.dropOffsetRows;
};

BubbleGrid.prototype.getCell = function (row, col) {
  var cell = this._cellMap[keyFor(row, col)];
  return cell ? clone(cell) : null;
};

BubbleGrid.prototype.hasCell = function (row, col) {
  return !!this._cellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getCellPosition = function (row, col) {
  return BoardLayout.getCellPosition(row, col, this.maxColumns, this.dropOffsetRows);
};

BubbleGrid.prototype.getNeighborCoordinates = function (row, col) {
  var offsets = row % 2 === 1 ? [
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 }
  ] : [
    { row: -1, col: -1 },
    { row: -1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 0 }
  ];

  return offsets.map(function (offset) {
    return {
      row: row + offset.row,
      col: col + offset.col
    };
  }).filter(function (candidate) {
    return this.isValidCell(candidate.row, candidate.col);
  }, this);
};

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

  if (row === 0) {
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

  var maxRowToCheck = this.getRowCount() + 1;
  var best = null;

  for (var row = 0; row <= maxRowToCheck; row += 1) {
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

  this.cells.forEach(function (cell) {
    var center = this.getCellPosition(cell.row, cell.col);
    var startToCenter = {
      x: startPoint.x - center.x,
      y: startPoint.y - center.y
    };
    var c = dot(startToCenter, startToCenter) - radius * radius;
    var hitT = null;

    if (c <= 0) {
      hitT = 0;
    } else {
      var b = 2 * dot(segment, startToCenter);
      var discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        return;
      }

      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }
    }

    if (hitT === null) {
      return;
    }

    if (!bestHit || hitT < bestHit.t - EPSILON || (Math.abs(hitT - bestHit.t) <= EPSILON && c < bestHit.distanceToStartSq)) {
      bestHit = {
        cell: clone(cell),
        center: center,
        t: hitT,
        distanceToStartSq: c
      };
    }
  }, this);

  if (!bestHit) {
    return null;
  }

  var hitPoint = {
    x: startPoint.x + segment.x * bestHit.t,
    y: startPoint.y + segment.y * bestHit.t
  };
  var hitNormal = normalize({
    x: hitPoint.x - bestHit.center.x,
    y: hitPoint.y - bestHit.center.y
  });

  if (Math.abs(hitNormal.x) <= 0.0001 && Math.abs(hitNormal.y) <= 0.0001) {
    hitNormal = normalize({
      x: -segment.x,
      y: -segment.y
    });
  }

  return {
    cell: bestHit.cell,
    point: hitPoint,
    normal: hitNormal,
    t: bestHit.t
  };
};

BubbleGrid.prototype.findAttachmentCell = function (point, collidedCell, direction, previousPoint) {
  if (!collidedCell) {
    return this._findTopSlot(point.x);
  }

  var incomingDirection = direction || { x: 0, y: 1 };
  var candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
    if (this.hasCell(candidate.row, candidate.col)) {
      return false;
    }

    return this._isAttachmentCandidateReachable(candidate, incomingDirection);
  }, this);

  if (!candidates.length) {
    candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
      return !this.hasCell(candidate.row, candidate.col);
    }, this);
  }

  if (!candidates.length) {
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
    if (this.hasCell(row, col)) {
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

BubbleGrid.prototype.addBubble = function (cell, colorOrBall) {
  var row = cell.row;
  var col = cell.col;

  if (typeof colorOrBall === "string") {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, colorOrBall);
  } else if (colorOrBall && typeof colorOrBall === "object") {
    if (colorOrBall.entityCategory === "skill_ball" || colorOrBall.entityCategory === "obstacle_ball") {
      this._setCell(row, col, ".");
      this._specialCellMap[keyFor(row, col)] = {
        id: colorOrBall.id || ("special_" + row + "_" + col),
        entityCategory: colorOrBall.entityCategory,
        entityType: colorOrBall.entityType,
        innerColor: colorOrBall.innerColor || null,
        row: row,
        col: col
      };
    } else {
      this._clearSpecialCell(row, col);
      this._setCell(row, col, colorOrBall.color || ".");
    }
  } else {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, ".");
  }

  this.version += 1;
  this._rebuildCaches();
  return this.getCell(row, col);
};

BubbleGrid.prototype.removeCells = function (cells) {
  var removed = [];
  var touchedKeys = {};

  (cells || []).forEach(function (cell) {
    if (!cell) {
      return;
    }

    var key = keyFor(cell.row, cell.col);
    if (touchedKeys[key] || !this.hasCell(cell.row, cell.col)) {
      return;
    }

    touchedKeys[key] = true;
    removed.push(this.getCell(cell.row, cell.col));
    this._setCell(cell.row, cell.col, ".");
    this._clearSpecialCell(cell.row, cell.col);
  }, this);

  if (removed.length) {
    this.version += 1;
    this._rebuildCaches();
  }

  return removed;
};

BubbleGrid.prototype.advanceRows = function (rowCount) {
  this.dropOffsetRows += rowCount || 1;
  this.version += 1;
  return this.dropOffsetRows;
};

BubbleGrid.prototype.getTopAttachY = function () {
  return BoardLayout.boardStartY - this.dropOffsetRows * BoardLayout.rowHeight;
};

BubbleGrid.prototype.hasReachedDangerLine = function () {
  return this.cells.some(function (cell) {
    var cellPosition = this.getCellPosition(cell.row, cell.col);
    return cellPosition.y - BoardLayout.bubbleRadius <= BoardLayout.dangerLineY;
  }, this);
};

BubbleGrid.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.coordinateSystem = this.coordinateSystem;
  snapshot.rowCount = this.getRowCount();
  snapshot.maxColumns = this.maxColumns;
  snapshot.cellCount = this.cells.length;
  snapshot.dropOffsetRows = this.dropOffsetRows;
  snapshot.topAttachY = this.getTopAttachY();
  snapshot.dangerReached = this.hasReachedDangerLine();
  snapshot.cells = this.getCells();
  snapshot.specialEntities = this.getSpecialEntities();
  snapshot.version = this.version;
  return snapshot;
};

module.exports = BubbleGrid;






















