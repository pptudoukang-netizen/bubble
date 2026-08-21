"use strict";

var BoardLayout = require("../../assets/scripts/config/BoardLayout");

var MAX_AFFECTED_ROWS = 5;
var GEOMETRY_EPSILON = 0.000001;

function requireIntegerCoordinate(value, description) {
  if (!Number.isInteger(value)) {
    throw new Error(description + " must be an integer.");
  }
  return value;
}

function requireFinitePoint(point, description) {
  if (
    !point ||
    typeof point !== "object" ||
    Array.isArray(point) ||
    typeof point.x !== "number" ||
    !isFinite(point.x) ||
    typeof point.y !== "number" ||
    !isFinite(point.y)
  ) {
    throw new Error(description + " must be a finite point.");
  }
  return {
    x: point.x,
    y: point.y
  };
}

function requireImpactDirection(direction) {
  var safeDirection = requireFinitePoint(direction, "Crystal gun impactDirection");
  if (safeDirection.y <= 0) {
    throw new Error("Crystal gun path requires an upward impactDirection.");
  }
  var length = Math.sqrt(
    safeDirection.x * safeDirection.x +
    safeDirection.y * safeDirection.y
  );
  if (!isFinite(length) || length <= GEOMETRY_EPSILON) {
    throw new Error("Crystal gun impactDirection length must be positive.");
  }
  return {
    x: safeDirection.x / length,
    y: safeDirection.y / length
  };
}

function requireGrid(grid) {
  if (!grid || typeof grid.isValidCell !== "function") {
    throw new Error("Crystal gun path requires BubbleGrid.isValidCell.");
  }
  if (typeof grid.getColumnCountForRow !== "function") {
    throw new Error("Crystal gun path requires BubbleGrid.getColumnCountForRow.");
  }
  if (typeof grid.getCellPosition !== "function") {
    throw new Error("Crystal gun path requires BubbleGrid.getCellPosition.");
  }
  return grid;
}

function collectRayIntersectionsForRow(grid, row, rayOrigin, direction, sideExitDistance) {
  var columnCount = grid.getColumnCountForRow(row);
  if (!Number.isInteger(columnCount) || columnCount <= 0) {
    throw new Error("Crystal gun path requires a positive row column count.");
  }

  var intersections = [];
  for (var col = 0; col < columnCount; col += 1) {
    if (!grid.isValidCell(row, col)) {
      throw new Error("Crystal gun row geometry contains an invalid coordinate at " + row + ":" + col + ".");
    }
    var center = requireFinitePoint(
      grid.getCellPosition(row, col),
      "Crystal gun cell position at " + row + ":" + col
    );
    var deltaX = center.x - rayOrigin.x;
    var deltaY = center.y - rayOrigin.y;
    var forwardDistance = deltaX * direction.x + deltaY * direction.y;
    var centerDistanceSquared = deltaX * deltaX + deltaY * deltaY;
    var perpendicularDistanceSquared = Math.max(
      0,
      centerDistanceSquared - forwardDistance * forwardDistance
    );
    var radiusSquared = BoardLayout.bubbleRadius * BoardLayout.bubbleRadius;
    if (perpendicularDistanceSquared > radiusSquared + GEOMETRY_EPSILON) {
      continue;
    }

    var halfChord = Math.sqrt(Math.max(0, radiusSquared - perpendicularDistanceSquared));
    var entryDistance = forwardDistance - halfChord;
    var exitDistance = forwardDistance + halfChord;
    if (
      exitDistance <= GEOMETRY_EPSILON ||
      entryDistance > sideExitDistance + GEOMETRY_EPSILON
    ) {
      continue;
    }
    intersections.push({
      row: row,
      col: col,
      entryDistance: Math.max(0, entryDistance),
      exitDistance: Math.min(sideExitDistance, exitDistance),
      forwardDistance: forwardDistance,
      perpendicularDistanceSquared: perpendicularDistanceSquared
    });
  }

  return intersections;
}

function resolveForwardSideExitDistance(rayOrigin, direction) {
  if (direction.x > GEOMETRY_EPSILON) {
    return (BoardLayout.boardRight - rayOrigin.x) / direction.x;
  }
  if (direction.x < -GEOMETRY_EPSILON) {
    return (BoardLayout.boardLeft - rayOrigin.x) / direction.x;
  }
  return Number.POSITIVE_INFINITY;
}

function buildPath(grid, landingCell, rayOrigin, impactDirection) {
  var safeGrid = requireGrid(grid);
  if (!landingCell || typeof landingCell !== "object" || Array.isArray(landingCell)) {
    throw new Error("Crystal gun path requires a landingCell.");
  }
  var landing = {
    row: requireIntegerCoordinate(landingCell.row, "Crystal gun landingCell.row"),
    col: requireIntegerCoordinate(landingCell.col, "Crystal gun landingCell.col")
  };
  if (!safeGrid.isValidCell(landing.row, landing.col)) {
    throw new Error("Crystal gun landingCell must be inside the board.");
  }

  var origin = requireFinitePoint(rayOrigin, "Crystal gun rayOrigin");
  var direction = requireImpactDirection(impactDirection);
  var sideExitDistance = resolveForwardSideExitDistance(origin, direction);
  var cells = [];
  var endPoint = {
    x: origin.x,
    y: origin.y
  };

  for (var rowOffset = 1; rowOffset <= MAX_AFFECTED_ROWS; rowOffset += 1) {
    var row = landing.row - rowOffset;
    if (row < 0) {
      break;
    }
    collectRayIntersectionsForRow(
      safeGrid,
      row,
      origin,
      direction,
      sideExitDistance
    ).forEach(function (intersection) {
      cells.push(intersection);
    });
  }

  cells.sort(function (left, right) {
    if (Math.abs(left.entryDistance - right.entryDistance) > GEOMETRY_EPSILON) {
      return left.entryDistance - right.entryDistance;
    }
    if (Math.abs(left.forwardDistance - right.forwardDistance) > GEOMETRY_EPSILON) {
      return left.forwardDistance - right.forwardDistance;
    }
    if (left.row !== right.row) {
      return right.row - left.row;
    }
    return left.col - right.col;
  });

  if (cells.length) {
    var farthestExitDistance = cells.reduce(function (maximum, cell) {
      return Math.max(maximum, cell.exitDistance);
    }, 0);
    endPoint = {
      x: origin.x + direction.x * farthestExitDistance,
      y: origin.y + direction.y * farthestExitDistance
    };
  }

  return {
    origin: origin,
    direction: direction,
    endPoint: endPoint,
    cells: cells.map(function (cell) {
      return {
        row: cell.row,
        col: cell.col,
        entryDistance: cell.entryDistance,
        exitDistance: cell.exitDistance
      };
    })
  };
}

module.exports = {
  MAX_AFFECTED_ROWS: MAX_AFFECTED_ROWS,
  buildPath: buildPath
};
