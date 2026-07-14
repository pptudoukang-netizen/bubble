"use strict";

var BoardLayout = require("./BoardLayout");

var TOP_BOARD_ROW_INDEX = 0;

function keyFor(row, col) {
  return row + ":" + col;
}

function getLayoutMaxColumns(layout) {
  if (!Array.isArray(layout) || layout.length === 0) {
    throw new Error("layout is required to resolve board column count.");
  }
  layout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string") {
      throw new Error("layout row must be a string at index " + rowIndex + ".");
    }
    var expectedColumns = BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
    if (rowString.length > expectedColumns) {
      throw new Error("layout row exceeds current 10/9-column grid at index " + rowIndex + ".");
    }
  });
  return BoardLayout.defaultColumns;
}

function getColumnCountForRow(layout, row) {
  return BoardLayout.getRowColumnCount(row, getLayoutMaxColumns(layout));
}

function isValidCell(layout, row, col) {
  return row >= 0 && row < layout.length && col >= 0 && col < getColumnCountForRow(layout, row);
}

function getNeighborCoordinates(layout, row, col) {
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
    return isValidCell(layout, candidate.row, candidate.col);
  });
}

function collectOccupiedCells(levelConfig, levelKey) {
  if (!levelConfig || typeof levelConfig !== "object") {
    throw new Error("level config is required for initial board support validation: " + levelKey);
  }
  if (!Array.isArray(levelConfig.layout) || levelConfig.layout.length === 0) {
    throw new Error("level.layout is required for initial board support validation: " + levelKey);
  }
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be normalized before initial board support validation: " + levelKey);
  }

  var occupiedMap = {};
  var cells = [];

  function addCell(row, col, source) {
    var cellKey = keyFor(row, col);
    if (occupiedMap[cellKey]) {
      throw new Error("duplicate initial board cell `" + cellKey + "` from " + source + ": " + levelKey);
    }
    var cell = {
      row: row,
      col: col,
      source: source
    };
    occupiedMap[cellKey] = cell;
    cells.push(cell);
  }

  levelConfig.layout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string") {
      throw new Error("level.layout row must be a string for initial board support validation: " + levelKey);
    }
    var expectedColumns = getColumnCountForRow(levelConfig.layout, rowIndex);
    if (rowString.length !== expectedColumns) {
      throw new Error("level.layout row length must be normalized before initial board support validation: " + levelKey);
    }
    rowString.split("").forEach(function (cellCode, colIndex) {
      if (cellCode !== ".") {
        addCell(rowIndex, colIndex, "layout");
      }
    });
  });

  levelConfig.specialEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object") {
      throw new Error("specialEntities[" + index + "] must be normalized before initial board support validation: " + levelKey);
    }
    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col) || !isValidCell(levelConfig.layout, entity.row, entity.col)) {
      throw new Error("specialEntities[" + index + "] row/col invalid for initial board support validation: " + levelKey);
    }
    if (levelConfig.layout[entity.row].charAt(entity.col) !== ".") {
      throw new Error("specialEntities[" + index + "] overlaps layout for initial board support validation: " + levelKey);
    }
    addCell(entity.row, entity.col, "specialEntities[" + index + "]");
  });

  return {
    cells: cells,
    occupiedMap: occupiedMap
  };
}

function findUnsupportedInitialCells(levelConfig, levelKey) {
  var occupied = collectOccupiedCells(levelConfig, levelKey);
  var cells = occupied.cells;
  var occupiedMap = occupied.occupiedMap;
  var visited = {};
  var queue = [];
  var queueIndex = 0;

  cells.forEach(function (cell) {
    if (cell.row === TOP_BOARD_ROW_INDEX) {
      queue.push(cell);
    }
  });

  while (queueIndex < queue.length) {
    var current = queue[queueIndex];
    queueIndex += 1;
    var currentKey = keyFor(current.row, current.col);
    if (visited[currentKey]) {
      continue;
    }
    visited[currentKey] = true;

    getNeighborCoordinates(levelConfig.layout, current.row, current.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (!visited[neighborKey] && occupiedMap[neighborKey]) {
        queue.push(occupiedMap[neighborKey]);
      }
    });
  }

  return cells.filter(function (cell) {
    return !visited[keyFor(cell.row, cell.col)];
  }).map(function (cell) {
    return {
      row: cell.row,
      col: cell.col,
      source: cell.source
    };
  });
}

function assertInitialBoardSupported(levelConfig, levelKey) {
  var unsupportedCells = findUnsupportedInitialCells(levelConfig, levelKey);
  if (unsupportedCells.length > 0) {
    throw new Error(
      "level initial board contains unsupported cells " +
      unsupportedCells.map(function (cell) {
        return cell.row + ":" + cell.col;
      }).join(", ") +
      ": " + levelKey
    );
  }
}

module.exports = {
  findUnsupportedInitialCells: findUnsupportedInitialCells,
  assertInitialBoardSupported: assertInitialBoardSupported
};
