"use strict";

var ELIMINATION_INTERVAL_MS = 30;
var SHATTER_PRESENTATION_LIFETIME_SEC = 0.48;

function keyFor(row, col) {
  return row + ":" + col;
}

function hexDistance(rowA, colA, rowB, colB) {
  var absRow = Math.abs(rowA - rowB);
  var absCol = Math.abs(colA - colB);
  return absRow + Math.max(0, absCol - Math.floor(absRow / 2));
}

function compareClockwise(a, b, originRow, originCol) {
  var angleA = Math.atan2(a.row - originRow, a.col - originCol);
  var angleB = Math.atan2(b.row - originRow, b.col - originCol);
  if (angleA !== angleB) {
    return angleA - angleB;
  }
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  return a.col - b.col;
}

function isShatterEligibleCell(cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Elimination presentation requires cell object.");
  }
  if (cell.entityCategory === "normal_ball") {
    return true;
  }
  if (
    cell.entityCategory === "skill_ball" ||
    cell.entityCategory === "obstacle_ball" ||
    cell.entityCategory === "reactive_ball" ||
    cell.entityCategory === "hazard_ball" ||
    cell.entityCategory === "locked_ball" ||
    cell.entityCategory === "key_ball"
  ) {
    return false;
  }
  throw new Error("Unsupported elimination presentation entityCategory: " + cell.entityCategory);
}

function buildMatchedCellMap(resolution, matchedCellsOverride) {
  var matchedCells = matchedCellsOverride;
  if (!matchedCells) {
    if (!resolution || !Array.isArray(resolution.matched)) {
      return {};
    }
    matchedCells = resolution.matched;
  }
  if (!Array.isArray(matchedCells)) {
    throw new Error("Elimination presentation requires matched cells array.");
  }

  var matchedById = {};
  matchedCells.forEach(function (cell) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Elimination presentation matched cell requires id.");
    }
    matchedById[String(cell.id)] = cell;
  });
  return matchedById;
}

function resolveLastShatterStartDelaySec(resolution, matchedCellsOverride) {
  var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);

  if (resolution && Array.isArray(resolution.eliminationSequence) && resolution.eliminationSequence.length > 0) {
    var maxDelayMs = 0;
    var eligibleCount = 0;
    resolution.eliminationSequence.forEach(function (sequenceEntry) {
      if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
        throw new Error("Elimination presentation sequence entry must be an object.");
      }
      var cell = matchedById[String(sequenceEntry.cellId)];
      if (!cell || !isShatterEligibleCell(cell)) {
        return;
      }
      eligibleCount += 1;
      var delayMs = Number(sequenceEntry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Elimination presentation sequence delayMs must be a non-negative number.");
      }
      if (delayMs > maxDelayMs) {
        maxDelayMs = delayMs;
      }
    });
    if (eligibleCount <= 0) {
      return 0;
    }
    return maxDelayMs / 1000;
  }

  var matchedCells = matchedCellsOverride;
  if (!matchedCells) {
    if (!resolution || !Array.isArray(resolution.matched)) {
      return 0;
    }
    matchedCells = resolution.matched;
  }
  if (!matchedCells.length) {
    return 0;
  }

  var eligibleIndex = 0;
  matchedCells.forEach(function (cell) {
    if (isShatterEligibleCell(cell)) {
      eligibleIndex += 1;
    }
  });
  if (eligibleIndex <= 0) {
    return 0;
  }
  return (eligibleIndex - 1) * (ELIMINATION_INTERVAL_MS / 1000);
}

function resolveRequiresEliminationPresentationHold(resolution, matchedCellsOverride) {
  var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);
  return Object.keys(matchedById).some(function (cellId) {
    return isShatterEligibleCell(matchedById[cellId]);
  });
}

function resolveEliminationPresentationDurationSec(resolution, matchedCellsOverride) {
  if (
    resolution &&
    Object.prototype.hasOwnProperty.call(resolution, "eliminationPresentationDurationSec")
  ) {
    var presetDuration = Number(resolution.eliminationPresentationDurationSec);
    if (!Number.isFinite(presetDuration) || presetDuration < 0) {
      throw new Error("Resolution eliminationPresentationDurationSec must be a non-negative number.");
    }
    return presetDuration;
  }

  var lastStartDelaySec = resolveLastShatterStartDelaySec(resolution, matchedCellsOverride);
  if (lastStartDelaySec <= 0) {
    var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);
    var hasEligibleCell = Object.keys(matchedById).some(function (cellId) {
      return isShatterEligibleCell(matchedById[cellId]);
    });
    if (!hasEligibleCell) {
      return 0;
    }
  }
  return lastStartDelaySec + SHATTER_PRESENTATION_LIFETIME_SEC;
}

function buildEliminationSequence(attachedCell, matchedCells, grid, scorePerBall) {
  if (!attachedCell || !Array.isArray(matchedCells) || !matchedCells.length) {
    throw new Error("buildEliminationSequence requires attached cell and matched cells.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("buildEliminationSequence requires grid with getCellPosition.");
  }
  if (!Number.isInteger(scorePerBall) || scorePerBall < 0) {
    throw new Error("buildEliminationSequence requires non-negative integer scorePerBall.");
  }

  var originRow = attachedCell.row;
  var originCol = attachedCell.col;
  var matchedByKey = {};
  matchedCells.forEach(function (cell) {
    matchedByKey[keyFor(cell.row, cell.col)] = cell;
  });

  var rings = {};
  matchedCells.forEach(function (cell) {
    var distance = hexDistance(originRow, originCol, cell.row, cell.col);
    if (!rings[distance]) {
      rings[distance] = [];
    }
    rings[distance].push(cell);
  });

  var ordered = [];
  var distances = Object.keys(rings).map(Number).sort(function (a, b) {
    return a - b;
  });

  distances.forEach(function (distance) {
    var ringCells = rings[distance].slice().sort(function (left, right) {
      return compareClockwise(left, right, originRow, originCol);
    });
    Array.prototype.push.apply(ordered, ringCells);
  });

  var sequence = [];
  var scoreEvents = [];
  ordered.forEach(function (cell, index) {
    var worldPosition = grid.getCellPosition(cell.row, cell.col);
    var delayMs = index * ELIMINATION_INTERVAL_MS;
    var points = scorePerBall;
    sequence.push({
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      worldPosition: {
        x: worldPosition.x,
        y: worldPosition.y
      },
      removeType: "match",
      points: points,
      delayMs: delayMs
    });
    scoreEvents.push({
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      points: points,
      delayMs: delayMs,
      scoreKind: "match_elimination"
    });
  });

  return {
    eliminationSequence: sequence,
    scoreEvents: scoreEvents
  };
}

function buildBottomUpRowEliminationSequence(orderedCells, grid) {
  if (!Array.isArray(orderedCells) || !orderedCells.length) {
    throw new Error("Bottom-up row elimination sequence requires ordered cells.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("Bottom-up row elimination sequence requires grid with getCellPosition.");
  }

  var previousRow = null;
  var previousCol = null;
  var rowWaveIndex = -1;
  return orderedCells.map(function (cell, index) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Bottom-up row elimination cell requires id at index " + index + ".");
    }
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Bottom-up row elimination cell requires integer coordinates: " + cell.id);
    }
    if (cell.entityCategory !== "normal_ball") {
      throw new Error("Bottom-up row elimination only supports ordinary balls: " + cell.id);
    }
    if (previousRow !== null) {
      if (cell.row > previousRow) {
        throw new Error("Bottom-up row elimination cells must be ordered from bottom row to top row.");
      }
      if (cell.row === previousRow && cell.col <= previousCol) {
        throw new Error("Bottom-up row elimination cells in the same row must be ordered by ascending column.");
      }
    }
    if (cell.row !== previousRow) {
      rowWaveIndex += 1;
      previousRow = cell.row;
      previousCol = null;
    }
    previousCol = cell.col;

    var worldPosition = grid.getCellPosition(cell.row, cell.col);
    if (
      !worldPosition ||
      typeof worldPosition.x !== "number" ||
      !isFinite(worldPosition.x) ||
      typeof worldPosition.y !== "number" ||
      !isFinite(worldPosition.y)
    ) {
      throw new Error("Bottom-up row elimination cell requires finite world position: " + cell.id);
    }
    return {
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      worldPosition: {
        x: worldPosition.x,
        y: worldPosition.y
      },
      removeType: "rainbow_prism_ball",
      points: 0,
      delayMs: rowWaveIndex * ELIMINATION_INTERVAL_MS
    };
  });
}

module.exports = {
  buildBottomUpRowEliminationSequence: buildBottomUpRowEliminationSequence,
  buildEliminationSequence: buildEliminationSequence,
  hexDistance: hexDistance,
  resolveEliminationPresentationDurationSec: resolveEliminationPresentationDurationSec,
  resolveRequiresEliminationPresentationHold: resolveRequiresEliminationPresentationHold
};
