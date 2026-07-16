"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(row, col) {
  return row + ":" + col;
}

function isLockedAnchor(cell) {
  return !!(
    cell &&
    cell.entityCategory === "locked_ball" &&
    cell.entityType === "locked"
  );
}

function isVineAnchor(cell) {
  return !!(
    cell &&
    (
      (
        cell.entityCategory === "reactive_ball" &&
        cell.entityType === "vine_spirit"
      ) ||
      (
        cell.entityCategory === "normal_ball" &&
        typeof cell.vineOwnerId === "string" &&
        cell.vineOwnerId
      )
    )
  );
}

function isWormholeAnchor(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "wormhole"
  );
}

function SupportSystem() {
  BaseSystem.call(this, "SupportSystem");
  this.anchorRows = 1;
  this.lastFloatingCells = [];
}

SupportSystem.prototype = Object.create(BaseSystem.prototype);
SupportSystem.prototype.constructor = SupportSystem;

SupportSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.anchorRows = 1;
  this.lastFloatingCells = [];
  return this;
};

SupportSystem.prototype.findFloatingCells = function (grid) {
  if (!grid || !Array.isArray(grid.cells)) {
    throw new Error("SupportSystem.findFloatingCells requires grid.cells.");
  }

  var cells = grid.cells;
  var visited = {};
  var queue = [];
  var queueIndex = 0;

  for (var seedIndex = 0; seedIndex < cells.length; seedIndex += 1) {
    var seedCell = cells[seedIndex];
    if (seedCell.row < this.anchorRows || isLockedAnchor(seedCell) || isVineAnchor(seedCell) || isWormholeAnchor(seedCell)) {
      queue.push({
        row: seedCell.row,
        col: seedCell.col
      });
    }
  }

  while (queueIndex < queue.length) {
    var current = queue[queueIndex];
    queueIndex += 1;
    var currentKey = keyFor(current.row, current.col);
    if (visited[currentKey]) {
      continue;
    }

    visited[currentKey] = true;
    var neighborCoords = grid.getNeighborCoordinates(current.row, current.col);
    for (var neighborIndex = 0; neighborIndex < neighborCoords.length; neighborIndex += 1) {
      var neighbor = neighborCoords[neighborIndex];
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (visited[neighborKey]) {
        continue;
      }
      if (!grid.hasCell(neighbor.row, neighbor.col)) {
        continue;
      }
      queue.push(neighbor);
    }
  }

  this.lastFloatingCells = [];
  for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    var cell = cells[cellIndex];
    if (!visited[keyFor(cell.row, cell.col)]) {
      this.lastFloatingCells.push(cell);
    }
  }

  return clone(this.lastFloatingCells);
};

SupportSystem.prototype.clearFloatingCells = function () {
  this.lastFloatingCells = [];
  return [];
};

SupportSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.anchorRows = this.anchorRows;
  snapshot.lastFloatingCells = clone(this.lastFloatingCells);
  return snapshot;
};

module.exports = SupportSystem;
