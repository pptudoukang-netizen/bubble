"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(cell) {
  return cell.row + ":" + cell.col;
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
  var visited = {};
  var queue = [];

  grid.getCells().forEach(function (cell) {
    if (cell.row < this.anchorRows) {
      queue.push(cell);
    }
  }, this);

  while (queue.length) {
    var current = queue.shift();
    var key = keyFor(current);
    if (visited[key]) {
      continue;
    }

    visited[key] = true;
    grid.getNeighborCells(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor);
      if (!visited[neighborKey]) {
        queue.push(neighbor);
      }
    });
  }

  this.lastFloatingCells = grid.getCells().filter(function (cell) {
    return !visited[keyFor(cell)];
  });

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
