"use strict";

var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

var TIMING_EPSILON = 0.000001;

function isBudBall(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "bud"
  );
}

function requireRandomUnit(manager, description) {
  if (typeof manager.budRandom !== "function") {
    throw new Error(description + " requires GameManager.budRandom.");
  }
  var value = manager.budRandom();
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value >= 1) {
    throw new Error(description + " random value must be in [0, 1).");
  }
  return value;
}

function resolveHatchColor(manager, grid, firedBall) {
  if (!firedBall || typeof firedBall !== "object" || Array.isArray(firedBall)) {
    throw new Error("Bud hatch requires the fired ball.");
  }
  if (firedBall.entityCategory === "normal_ball") {
    if (typeof firedBall.color !== "string" || !firedBall.color) {
      throw new Error("Bud hatch normal fired ball requires color.");
    }
    return firedBall.color;
  }
  if (firedBall.entityCategory !== "skill_ball") {
    throw new Error("Bud hatch fired ball must be normal_ball or skill_ball.");
  }
  if (typeof firedBall.entityType !== "string" || !firedBall.entityType) {
    throw new Error("Bud hatch skill fired ball requires entityType.");
  }

  var colorMap = {};
  grid.getCells().forEach(function (cell, index) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Bud hatch board cell must be an object at index " + index + ".");
    }
    if (cell.entityCategory !== "normal_ball") {
      return;
    }
    if (typeof cell.color !== "string" || !cell.color) {
      throw new Error("Bud hatch board normal cell requires color at index " + index + ".");
    }
    colorMap[cell.color] = true;
  });
  var colors = Object.keys(colorMap).sort();
  if (!colors.length) {
    throw new Error("Bud hatch special fired ball requires an ordinary color on the current board.");
  }
  return colors[Math.floor(requireRandomUnit(manager, "Bud hatch color") * colors.length)];
}

function attachGameManagerBudMethods(GameManager) {
  GameManager.prototype._hasPendingBudHatches = function () {
    if (!Array.isArray(this.pendingBudHatches)) {
      throw new Error("GameManager pendingBudHatches must be an array.");
    }
    return this.pendingBudHatches.length > 0;
  };

  GameManager.prototype._queueBudHatchesAdjacentToCells = function (removedCells, resolution, firedBall) {
    if (!Array.isArray(removedCells)) {
      throw new Error("Bud hatch adjacency requires removedCells array.");
    }
    if (!resolution || !Array.isArray(resolution.budHatches)) {
      throw new Error("Bud hatch adjacency requires resolution.budHatches.");
    }
    if (!removedCells.length) {
      return [];
    }
    var grid = this.systems.bubbleGrid;
    if (
      !grid ||
      typeof grid.getNeighborCoordinates !== "function" ||
      typeof grid.getCell !== "function" ||
      typeof grid.getCells !== "function"
    ) {
      throw new Error("Bud hatch adjacency requires BubbleGrid neighbor and lookup methods.");
    }

    var candidates = {};
    removedCells.forEach(function (cell, index) {
      if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Bud hatch adjacency requires removed cell coordinates at index " + index + ".");
      }
      grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coordinate) {
        var bud = grid.getCell(coordinate.row, coordinate.col);
        if (isBudBall(bud)) {
          if (typeof bud.id !== "string" || !bud.id) {
            throw new Error("Bud hatch candidate requires non-empty id.");
          }
          candidates[bud.id] = bud;
        }
      });
    });

    var pendingIds = {};
    this.pendingBudHatches.forEach(function (hatch) {
      if (!hatch || typeof hatch.budId !== "string" || !hatch.budId) {
        throw new Error("Pending bud hatch requires budId.");
      }
      pendingIds[hatch.budId] = true;
    });

    var queued = [];
    Object.keys(candidates).sort().forEach(function (budId) {
      if (pendingIds[budId]) {
        return;
      }
      var bud = candidates[budId];
      var color = resolveHatchColor(this, grid, firedBall);
      var hatch = {
        id: "bud_hatch_" + this.shotsFired + "_" + budId,
        budId: budId,
        row: bud.row,
        col: bud.col,
        color: color,
        sourceEntityCategory: firedBall.entityCategory,
        sourceEntityType: firedBall.entityCategory === "normal_ball" ? null : firedBall.entityType,
        duration: SpecialAnimationTiming.bud.totalDuration,
        remaining: SpecialAnimationTiming.bud.totalDuration
      };
      this.pendingBudHatches.push(hatch);
      resolution.budHatches.push({
        id: hatch.id,
        budId: hatch.budId,
        row: hatch.row,
        col: hatch.col,
        color: hatch.color,
        sourceEntityCategory: hatch.sourceEntityCategory,
        sourceEntityType: hatch.sourceEntityType,
        duration: hatch.duration
      });
      queued.push(hatch);
    }, this);
    return queued;
  };

  GameManager.prototype._completeBudHatch = function (hatch, resolution) {
    if (!hatch || typeof hatch.id !== "string" || !hatch.id) {
      throw new Error("Bud hatch completion requires hatch id.");
    }
    if (!resolution || !Array.isArray(resolution.budHatchedCells) || !Array.isArray(resolution.budRecolors)) {
      throw new Error("Bud hatch completion requires bud resolution arrays.");
    }
    var grid = this.systems.bubbleGrid;
    var liveBud = grid.getCell(hatch.row, hatch.col);
    if (!isBudBall(liveBud) || liveBud.id !== hatch.budId) {
      throw new Error("Bud hatch lost live bud: " + hatch.budId + ".");
    }
    var recolorAssignments = grid.getNeighborCoordinates(liveBud.row, liveBud.col).map(function (coordinate) {
      var neighbor = grid.getCell(coordinate.row, coordinate.col);
      if (!neighbor || neighbor.entityCategory !== "normal_ball") {
        return null;
      }
      return {
        id: neighbor.id,
        row: neighbor.row,
        col: neighbor.col,
        color: hatch.color
      };
    }).filter(Boolean);

    var hatchedCell = grid.addBubble({ row: liveBud.row, col: liveBud.col }, hatch.color);
    if (!hatchedCell || hatchedCell.entityCategory !== "normal_ball" || hatchedCell.color !== hatch.color) {
      throw new Error("Bud hatch failed to create its ordinary colored ball.");
    }
    var recolored = grid.recolorNormalCells(recolorAssignments);
    resolution.budHatchedCells.push({
      id: hatchedCell.id,
      row: hatchedCell.row,
      col: hatchedCell.col,
      color: hatchedCell.color,
      budId: hatch.budId
    });
    recolored.forEach(function (entry) {
      resolution.budRecolors.push({
        id: entry.id,
        row: entry.row,
        col: entry.col,
        fromColor: entry.fromColor,
        color: entry.color,
        budId: hatch.budId
      });
    });
    this._pushRuntimeEvent("bud_hatched", {
      bud_id: hatch.budId,
      color: hatch.color,
      recolored_count: recolored.length,
      source_entity_category: hatch.sourceEntityCategory,
      source_entity_type: hatch.sourceEntityType
    });
  };

  GameManager.prototype._resolveFloatingAfterBudHatches = function (resolution) {
    if (
      !resolution ||
      !Array.isArray(resolution.floating) ||
      !Array.isArray(resolution.collected)
    ) {
      throw new Error("Bud post-hatch support resolution requires floating and collected arrays.");
    }
    var grid = this.systems.bubbleGrid;
    if (
      !this.systems.supportSystem ||
      typeof this.systems.supportSystem.findFloatingCells !== "function"
    ) {
      throw new Error("Bud post-hatch support resolution requires SupportSystem.findFloatingCells.");
    }

    while (true) {
      var floating = this.systems.supportSystem.findFloatingCells(grid);
      if (!floating.length) {
        return;
      }
      var removable = this._filterFloatingSpiritCocoons(floating, resolution);
      if (!removable.length) {
        return;
      }
      var removed = grid.removeFloatingCells(removable);
      if (!removed.length) {
        throw new Error("Bud post-hatch support scan found cells that could not be removed.");
      }
      this._appendUniqueCells(resolution.floating, removed);
      this._appendUniqueCells(resolution.collected, removed);
      this._collectRemovedKeysAndResolveUnlocks(removed, grid, resolution);
      this._cancelPendingSplitterSpawnsForDroppedCells(removed);
      this._registerResolutionDrops(removed, grid, resolution, undefined, {
        skipEliminationPresentationHold: true
      });
    }
  };

  GameManager.prototype._continueAfterBudHatches = function (resolution) {
    if (this._hasPendingBudHatches()) {
      return;
    }
    if (this._hasPendingSpiritCocoonOpenings() || this.molotovResolutionPending) {
      return;
    }
    if (this._beginSwirlRotationForResolution(resolution)) {
      return;
    }
    if (this._beginWormholeShiftForResolution(resolution)) {
      return;
    }
    if (this._beginVineCastForResolution(resolution)) {
      return;
    }
    this._continueAfterVineCast(resolution);
  };

  GameManager.prototype._updatePendingBudHatches = function (dt) {
    if (!this._hasPendingBudHatches()) {
      return false;
    }
    if (typeof dt !== "number" || !isFinite(dt) || dt < 0) {
      throw new Error("Pending bud hatch update requires non-negative finite dt.");
    }
    var resolution = this.lastResolution;
    var completed = [];
    var pending = [];
    this.pendingBudHatches.forEach(function (hatch) {
      hatch.remaining = Math.max(0, hatch.remaining - dt);
      if (hatch.remaining <= TIMING_EPSILON) {
        hatch.remaining = 0;
        completed.push(hatch);
      } else {
        pending.push(hatch);
      }
    });
    this.pendingBudHatches = pending;
    completed.sort(function (left, right) {
      return left.budId.localeCompare(right.budId);
    }).forEach(function (hatch) {
      this._completeBudHatch(hatch, resolution);
    }, this);
    if (completed.length && !this._hasPendingBudHatches()) {
      this._resolveFloatingAfterBudHatches(resolution);
      resolution.boardCleared = this._isBoardCleared(this.systems.bubbleGrid);
      this._continueAfterBudHatches(resolution);
    }
    return completed.length > 0;
  };
}

module.exports = attachGameManagerBudMethods;
