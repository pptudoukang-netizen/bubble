"use strict";

var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var GameManager = require("../gameplay-src/core/GameManager");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function keyFor(row, col) {
  return row + ":" + col;
}

function createResolution(removedCells) {
  return {
    splitterResolved: false,
    collected: removedCells.slice(),
    matched: [],
    floating: [],
    reactiveTriggered: [],
    spawnedBySplitters: [],
    boardViewportAdjusted: false
  };
}

function createSplitterGrid(occupiedNeighborKeys) {
  var splitter = {
    id: "splitter_validation",
    row: 4,
    col: 4,
    splitColor: "G",
    entityCategory: "reactive_ball",
    entityType: "splitter"
  };
  var neighbors = [
    { row: 3, col: 3 },
    { row: 3, col: 4 },
    { row: 4, col: 3 },
    { row: 4, col: 5 },
    { row: 5, col: 3 },
    { row: 5, col: 4 }
  ];
  var cellsByKey = {};
  cellsByKey[keyFor(splitter.row, splitter.col)] = splitter;
  occupiedNeighborKeys.forEach(function (coordinateKey, index) {
    var parts = coordinateKey.split(":");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    cellsByKey[coordinateKey] = {
      id: "neighbor_" + index,
      row: row,
      col: col,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    };
  });

  return {
    splitter: splitter,
    neighbors: neighbors,
    spawned: [],
    getSpecialEntities: function () {
      return [splitter];
    },
    getNeighborCoordinates: function (row, col) {
      if (row !== splitter.row || col !== splitter.col) {
        throw new Error("Splitter validation queried neighbors for an unexpected source.");
      }
      return neighbors.slice();
    },
    getCell: function (row, col) {
      return cellsByKey[keyFor(row, col)] || null;
    },
    isValidCell: function (row, col) {
      return neighbors.some(function (coordinate) {
        return coordinate.row === row && coordinate.col === col;
      });
    },
    hasCell: function (row, col) {
      return !!cellsByKey[keyFor(row, col)];
    },
    isTrappedSpiritReservedCell: function () {
      return false;
    },
    hasWormholeAt: function () {
      return false;
    },
    isSplitterSpawnCellAvailable: function (row, col, reservedCellKeys) {
      return BubbleGrid.prototype.isSplitterSpawnCellAvailable.call(this, row, col, reservedCellKeys);
    },
    findSplitterSpawnCell: function (source, reservedCellKeys) {
      return BubbleGrid.prototype.findSplitterSpawnCell.call(this, source, reservedCellKeys);
    },
    addBubble: function (coordinate, color) {
      var coordinateKey = keyFor(coordinate.row, coordinate.col);
      assert(!cellsByKey[coordinateKey], "Splitter validation cannot overwrite an occupied cell.");
      var spawned = {
        id: "spawned_" + coordinateKey,
        row: coordinate.row,
        col: coordinate.col,
        color: color,
        entityCategory: "normal_ball",
        entityType: null
      };
      cellsByKey[coordinateKey] = spawned;
      this.spawned.push(spawned);
      return spawned;
    },
    assertNoVisualOverlap: function () {
      return true;
    }
  };
}

function createManager(grid) {
  var manager = new GameManager();
  manager.shotsFired = 1;
  manager.state = "running";
  manager.systems.bubbleGrid = grid;
  manager.systems.fallingMarbleSystem = {
    hasActiveDrops: function () {
      return false;
    }
  };
  manager._ensureMinimumVisibleBoardRows = function () {};
  return manager;
}

function validateLocalNeighborSpawn() {
  var occupied = ["3:3", "3:4", "4:3", "5:3", "5:4"];
  var grid = createSplitterGrid(occupied);
  var manager = createManager(grid);
  var resolution = createResolution([]);

  manager._resolveSplitterPhase(resolution);
  assert(manager.pendingSplitterSpawns.length === 1, "A splitter with one empty neighbor must queue one spawn.");
  assert(
    manager.pendingSplitterSpawns[0].targetRow === 4 && manager.pendingSplitterSpawns[0].targetCol === 5,
    "Splitter spawn target must be the only empty six-neighbor position."
  );
  manager.pendingSplitterSpawns[0].remainingDelay = 0;
  manager.lastResolution = resolution;
  assert(manager._updatePendingSplitterSpawns(0), "Ready splitter spawn must update the board.");
  assert(grid.spawned.length === 1 && keyFor(grid.spawned[0].row, grid.spawned[0].col) === "4:5", "Split ball must attach inside the source six-neighbor ring.");
  assert(resolution.spawnedBySplitters.length === 1, "Successful split must be recorded in the resolution.");
}

function validateFullNeighborsSkip() {
  var grid = createSplitterGrid(["3:3", "3:4", "4:3", "4:5", "5:3", "5:4"]);
  var manager = createManager(grid);
  var resolution = createResolution([]);

  manager._resolveSplitterPhase(resolution);
  assert(manager.pendingSplitterSpawns.length === 0, "A splitter with six occupied neighbors must not split.");
  assert(resolution.reactiveTriggered.length === 0, "A full splitter must not emit a split trigger.");
}

function validateAdjacentRemovalSkipsCurrentTurn(removalType) {
  var removed = {
    id: "removed_neighbor_" + removalType,
    row: 4,
    col: 5,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var grid = createSplitterGrid(["3:3", "3:4", "4:3", "5:3", "5:4"]);
  var manager = createManager(grid);
  var resolution = createResolution([removed]);
  resolution[removalType].push(removed);

  manager._resolveSplitterPhase(resolution);
  assert(manager.pendingSplitterSpawns.length === 0, "Adjacent current-turn " + removalType + " must suppress splitter growth.");
  assert(!grid.getCell(4, 5), "Suppressed adjacent removal position must remain empty this turn.");
}

function validateRemoteEmptyCellCannotBeUsed() {
  var grid = createSplitterGrid(["3:3", "3:4", "4:3", "4:5", "5:3", "5:4"]);
  assert(grid.isSplitterSpawnCellAvailable(9, 9, {}) === false, "Validation remote cell must not be a six-neighbor candidate.");
  var manager = createManager(grid);
  var resolution = createResolution([]);

  manager._resolveSplitterPhase(resolution);
  assert(manager.pendingSplitterSpawns.length === 0, "Remote board space must not rescue a full six-neighbor splitter.");
}

function main() {
  validateLocalNeighborSpawn();
  validateFullNeighborsSkip();
  validateAdjacentRemovalSkipsCurrentTurn("matched");
  validateAdjacentRemovalSkipsCurrentTurn("floating");
  validateRemoteEmptyCellCannotBeUsed();
  console.log("Splitter ball validation passed.");
}

main();
