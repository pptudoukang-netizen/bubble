"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(cell) {
  return cell.row + ":" + cell.col;
}

function MatchSystem() {
  BaseSystem.call(this, "MatchSystem");
  this.matchThreshold = 3;
  this.availableColors = [];
  this.lastMatches = [];
}

MatchSystem.prototype = Object.create(BaseSystem.prototype);
MatchSystem.prototype.constructor = MatchSystem;

MatchSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.availableColors = levelConfig.level.colors.slice();
  this.lastMatches = [];
  return this;
};

MatchSystem.prototype.findMatchGroup = function (grid, startCell) {
  if (!startCell) {
    this.lastMatches = [];
    return [];
  }

  var startFromGrid = grid.getCell(startCell.row, startCell.col);
  var targetColor = (startFromGrid && startFromGrid.color) || startCell.color;

  if (!targetColor) {
    this.lastMatches = [];
    return [];
  }

  var queue = [{
    row: startCell.row,
    col: startCell.col
  }];
  var visited = {};
  var group = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = keyFor(current);
    if (visited[key]) {
      continue;
    }

    visited[key] = true;
    var gridCell = grid.getCell(current.row, current.col);
    if (!gridCell || gridCell.color !== targetColor) {
      continue;
    }

    group.push(gridCell);

    grid.getNeighborCoordinates(gridCell.row, gridCell.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor);
      if (visited[neighborKey]) {
        return;
      }

      var neighborCell = grid.getCell(neighbor.row, neighbor.col);
      if (neighborCell && neighborCell.color === targetColor) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col
        });
      }
    });
  }

  this.lastMatches = group.length >= this.matchThreshold ? clone(group) : [];
  return clone(this.lastMatches);
};

MatchSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.matchThreshold = this.matchThreshold;
  snapshot.availableColors = this.availableColors.slice();
  snapshot.lastMatches = clone(this.lastMatches);
  return snapshot;
};

module.exports = MatchSystem;
