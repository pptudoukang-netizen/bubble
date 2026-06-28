"use strict";

var BoardLayout = require("../config/BoardLayout");

var ELIMINATION_INTERVAL_MS = 55;

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

  var maxDelayMs = 650;
  var intervalMs = ELIMINATION_INTERVAL_MS;
  if (ordered.length > 1 && intervalMs * (ordered.length - 1) > maxDelayMs) {
    intervalMs = maxDelayMs / (ordered.length - 1);
  }

  var sequence = [];
  var scoreEvents = [];
  ordered.forEach(function (cell, index) {
    var worldPosition = grid.getCellPosition(cell.row, cell.col);
    var delayMs = Math.round(index * intervalMs);
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

module.exports = {
  buildEliminationSequence: buildEliminationSequence,
  hexDistance: hexDistance
};
