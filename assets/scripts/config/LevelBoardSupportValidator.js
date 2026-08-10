"use strict";

var BoardLayout = require("./BoardLayout");

var TOP_BOARD_ROW_INDEX = 0;
var MAX_TOP_ROW_SAME_COLOR_RUN = 3;
var MIN_NORMAL_BALL_OCCUPANCY_RATIO = 0.7;

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
      throw new Error("layout row exceeds current 11/10-column grid at index " + rowIndex + ".");
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
      source: source,
      fixedAnchor: false
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
    occupiedMap[keyFor(entity.row, entity.col)].fixedAnchor =
      entity.entityCategory === "reactive_ball" && entity.entityType === "wormhole";
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

  var rescueAnchor = null;
  if (levelConfig.levelType === "trapped_sprite_rescue") {
    if (
      !levelConfig.trappedSpriteRescue ||
      !levelConfig.trappedSpriteRescue.anchorCell
    ) {
      throw new Error("trapped_sprite_rescue requires anchorCell before support validation: " + levelKey);
    }
    rescueAnchor = levelConfig.trappedSpriteRescue.anchorCell;
  }

  cells.forEach(function (cell) {
    var touchesRescueAnchor = rescueAnchor && getNeighborCoordinates(
      levelConfig.layout,
      rescueAnchor.row,
      rescueAnchor.col
    ).some(function (neighbor) {
      return neighbor.row === cell.row && neighbor.col === cell.col;
    });
    if (
      (rescueAnchor === null && cell.row === TOP_BOARD_ROW_INDEX) ||
      cell.fixedAnchor === true ||
      touchesRescueAnchor
    ) {
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

function analyzeGeneratedBoardRules(levelConfig, levelKey) {
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("level config is required for generated board rule validation: " + levelKey);
  }
  if (!Array.isArray(levelConfig.layout) || levelConfig.layout.length === 0) {
    throw new Error("level.layout is required for generated board rule validation: " + levelKey);
  }
  if (!Array.isArray(levelConfig.specialEntities)) {
    throw new Error("level.specialEntities must be normalized before generated board rule validation: " + levelKey);
  }

  var boardCapacity = 0;
  var normalBallCount = 0;
  levelConfig.layout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string") {
      throw new Error("level.layout row must be a string for generated board rule validation: " + levelKey);
    }
    var expectedColumns = BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
    if (rowString.length !== expectedColumns) {
      throw new Error("level.layout row length must be normalized before generated board rule validation: " + levelKey);
    }
    boardCapacity += expectedColumns;
    rowString.split("").forEach(function (cellCode) {
      if (cellCode !== ".") {
        normalBallCount += 1;
      }
    });
  });

  var excludedCellMap = {};
  levelConfig.specialEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      throw new Error("specialEntities[" + index + "] must be normalized before generated board rule validation: " + levelKey);
    }
    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col) || !isValidCell(levelConfig.layout, entity.row, entity.col)) {
      throw new Error("specialEntities[" + index + "] row/col invalid for generated board rule validation: " + levelKey);
    }
    if (levelConfig.layout[entity.row].charAt(entity.col) !== ".") {
      throw new Error("specialEntities[" + index + "] overlaps a normal ball for generated board rule validation: " + levelKey);
    }
    var entityKey = keyFor(entity.row, entity.col);
    if (excludedCellMap[entityKey]) {
      throw new Error("duplicate excluded generated board cell `" + entityKey + "`: " + levelKey);
    }
    excludedCellMap[entityKey] = true;
  });

  if (levelConfig.levelType === "trapped_sprite_rescue") {
    if (!levelConfig.trappedSpriteRescue || !levelConfig.trappedSpriteRescue.anchorCell) {
      throw new Error("trapped_sprite_rescue requires anchorCell before generated board rule validation: " + levelKey);
    }
    var anchor = levelConfig.trappedSpriteRescue.anchorCell;
    if (!Number.isInteger(anchor.row) || !Number.isInteger(anchor.col) || !isValidCell(levelConfig.layout, anchor.row, anchor.col)) {
      throw new Error("trapped_sprite_rescue anchorCell is invalid for generated board rule validation: " + levelKey);
    }
    if (levelConfig.layout[anchor.row].charAt(anchor.col) !== ".") {
      throw new Error("trapped_sprite_rescue anchorCell overlaps a normal ball for generated board rule validation: " + levelKey);
    }
    var anchorKey = keyFor(anchor.row, anchor.col);
    if (excludedCellMap[anchorKey]) {
      throw new Error("trapped_sprite_rescue anchorCell overlaps a special entity: " + levelKey);
    }
    excludedCellMap[anchorKey] = true;
  }

  var topRowSameColorRun = 0;
  var currentTopColor = null;
  var currentTopRun = 0;
  levelConfig.layout[TOP_BOARD_ROW_INDEX].split("").forEach(function (cellCode) {
    if (cellCode === ".") {
      currentTopColor = null;
      currentTopRun = 0;
      return;
    }
    if (cellCode === currentTopColor) {
      currentTopRun += 1;
    } else {
      currentTopColor = cellCode;
      currentTopRun = 1;
    }
    topRowSameColorRun = Math.max(topRowSameColorRun, currentTopRun);
  });

  var excludedCellCount = Object.keys(excludedCellMap).length;
  var normalBallSlotCount = boardCapacity - excludedCellCount;
  if (normalBallSlotCount <= 0) {
    throw new Error("generated board has no ordinary-ball slots: " + levelKey);
  }
  return {
    boardCapacity: boardCapacity,
    excludedCellCount: excludedCellCount,
    normalBallCount: normalBallCount,
    normalBallSlotCount: normalBallSlotCount,
    normalBallOccupancyRatio: normalBallCount / normalBallSlotCount,
    topRowSameColorRun: topRowSameColorRun
  };
}

function assertGeneratedBoardRules(levelConfig, levelKey) {
  var metrics = analyzeGeneratedBoardRules(levelConfig, levelKey);
  if (metrics.topRowSameColorRun > MAX_TOP_ROW_SAME_COLOR_RUN) {
    throw new Error(
      "level top row same-color run must be <= " + MAX_TOP_ROW_SAME_COLOR_RUN +
      ", got " + metrics.topRowSameColorRun + ": " + levelKey
    );
  }
  if (metrics.normalBallOccupancyRatio + Number.EPSILON < MIN_NORMAL_BALL_OCCUPANCY_RATIO) {
    throw new Error(
      "level normal-ball occupancy must be >= " +
      Math.round(MIN_NORMAL_BALL_OCCUPANCY_RATIO * 100) + "% after excluding " +
      metrics.excludedCellCount + " special gameplay slots, got " +
      metrics.normalBallCount + "/" + metrics.normalBallSlotCount + " (" +
      (metrics.normalBallOccupancyRatio * 100).toFixed(2) + "%): " + levelKey
    );
  }
  return metrics;
}

module.exports = {
  MAX_TOP_ROW_SAME_COLOR_RUN: MAX_TOP_ROW_SAME_COLOR_RUN,
  MIN_NORMAL_BALL_OCCUPANCY_RATIO: MIN_NORMAL_BALL_OCCUPANCY_RATIO,
  findUnsupportedInitialCells: findUnsupportedInitialCells,
  assertInitialBoardSupported: assertInitialBoardSupported,
  analyzeGeneratedBoardRules: analyzeGeneratedBoardRules,
  assertGeneratedBoardRules: assertGeneratedBoardRules
};
