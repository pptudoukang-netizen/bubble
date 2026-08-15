"use strict";

var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

var COCOON_OPEN_SCORE = 1000;
var MIST_DURATION_SHOTS = 5;
var TIMING_EPSILON = 0.000001;

function isSpiritCocoon(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "spirit_cocoon"
  );
}

function requireRandomUnit(manager, description) {
  if (typeof manager.spiritCocoonRandom !== "function") {
    throw new Error(description + " requires GameManager.spiritCocoonRandom.");
  }
  var value = manager.spiritCocoonRandom();
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value >= 1) {
    throw new Error(description + " random value must be in [0, 1).");
  }
  return value;
}

function resolveOutcome(roll) {
  if (roll < 0.2) {
    return "mist";
  }
  if (roll < 0.6) {
    return "gluttony";
  }
  return "rainbow";
}

function appendUniqueCells(target, cells) {
  var ids = {};
  target.forEach(function (cell) {
    ids[String(cell.id)] = true;
  });
  cells.forEach(function (cell) {
    if (!ids[String(cell.id)]) {
      ids[String(cell.id)] = true;
      target.push(cell);
    }
  });
}

function buildCounterclockwiseMistTraversal(grid, cocoon) {
  var center = grid.getCellPosition(cocoon.row, cocoon.col);
  return grid.getNeighborCoordinates(cocoon.row, cocoon.col).map(function (coordinate) {
    var cell = grid.getCell(coordinate.row, coordinate.col);
    if (!cell || cell.entityCategory !== "normal_ball") {
      return null;
    }
    var position = grid.getCellPosition(cell.row, cell.col);
    return {
      id: cell.id,
      row: cell.row,
      col: cell.col,
      angle: Math.atan2(position.y - center.y, position.x - center.x)
    };
  }).filter(Boolean).sort(function (left, right) {
    return left.angle - right.angle;
  }).map(function (entry) {
    return {
      id: entry.id,
      row: entry.row,
      col: entry.col
    };
  });
}

function buildDirectionalRowTraversal(grid, cocoon, direction, normalOnly) {
  return grid.getCells().filter(function (cell) {
    if (cell.row !== cocoon.row || isSpiritCocoon(cell)) {
      return false;
    }
    if (normalOnly && cell.entityCategory !== "normal_ball") {
      return false;
    }
    return direction === "left" ? cell.col < cocoon.col : cell.col > cocoon.col;
  }).sort(function (left, right) {
    return direction === "left" ? right.col - left.col : left.col - right.col;
  }).map(function (cell) {
    return {
      id: cell.id,
      row: cell.row,
      col: cell.col
    };
  });
}

function buildRainbowTraversal(manager, grid, cocoon, direction) {
  var boardColors = {};
  grid.getCells().forEach(function (cell) {
    if (cell.entityCategory !== "normal_ball") {
      return;
    }
    if (typeof cell.color !== "string" || !cell.color) {
      throw new Error("Spirit cocoon rainbow requires normal ball colors.");
    }
    boardColors[cell.color] = true;
  });
  var colors = Object.keys(boardColors).sort();
  if (!colors.length) {
    throw new Error("Spirit cocoon rainbow requires at least one ordinary board color.");
  }
  var startIndex = Math.floor(requireRandomUnit(manager, "Spirit cocoon rainbow color") * colors.length);
  return buildDirectionalRowTraversal(grid, cocoon, direction, true).map(function (entry, index) {
    var liveCell = grid.getCell(entry.row, entry.col);
    if (!liveCell || liveCell.id !== entry.id || liveCell.entityCategory !== "normal_ball") {
      throw new Error("Spirit cocoon rainbow traversal lost normal ball: " + entry.id);
    }
    return {
      id: entry.id,
      row: entry.row,
      col: entry.col,
      fromColor: liveCell.color,
      color: colors[(startIndex + index) % colors.length]
    };
  });
}

function attachGameManagerSpiritCocoonMethods(GameManager) {
  GameManager.prototype._hasPendingSpiritCocoonOpenings = function () {
    if (!Array.isArray(this.pendingSpiritCocoonOpenings)) {
      throw new Error("GameManager pendingSpiritCocoonOpenings must be an array.");
    }
    return this.pendingSpiritCocoonOpenings.length > 0;
  };

  GameManager.prototype._queueSpiritCocoonsAdjacentToCells = function (removedCells, resolution) {
    if (!Array.isArray(removedCells)) {
      throw new Error("Spirit cocoon adjacency requires removedCells array.");
    }
    if (!resolution || !Array.isArray(resolution.spiritCocoonOpenings)) {
      throw new Error("Spirit cocoon adjacency requires resolution.spiritCocoonOpenings.");
    }
    if (!removedCells.length) {
      return [];
    }
    var grid = this.systems.bubbleGrid;
    var candidates = {};
    removedCells.forEach(function (cell) {
      if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Spirit cocoon adjacency requires removed cell coordinates.");
      }
      grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coordinate) {
        var cocoon = grid.getCell(coordinate.row, coordinate.col);
        if (isSpiritCocoon(cocoon)) {
          candidates[String(cocoon.id)] = cocoon;
        }
      });
    });

    var pendingIds = {};
    this.pendingSpiritCocoonOpenings.forEach(function (opening) {
      pendingIds[String(opening.cocoonId)] = true;
    });
    var queued = [];
    Object.keys(candidates).sort().forEach(function (id) {
      if (pendingIds[id]) {
        return;
      }
      if (
        !this.spiritCocoonFirstTriggerStore ||
        typeof this.spiritCocoonFirstTriggerStore.consumeFirstTrigger !== "function"
      ) {
        throw new Error("Spirit cocoon trigger requires spiritCocoonFirstTriggerStore.consumeFirstTrigger.");
      }
      var firstLocalTrigger = this.spiritCocoonFirstTriggerStore.consumeFirstTrigger();
      if (typeof firstLocalTrigger !== "boolean") {
        throw new Error("Spirit cocoon first trigger store must return boolean.");
      }
      var roll = firstLocalTrigger ? 0.2 : requireRandomUnit(this, "Spirit cocoon outcome");
      var outcome = resolveOutcome(roll);
      var direction = null;
      if (outcome === "gluttony" || outcome === "rainbow") {
        direction = requireRandomUnit(this, "Spirit cocoon direction") < 0.5 ? "left" : "right";
      }
      var cocoon = candidates[id];
      var mistTraversal = outcome === "mist"
        ? buildCounterclockwiseMistTraversal(grid, cocoon)
        : [];
      var gluttonyTraversal = outcome === "gluttony"
        ? buildDirectionalRowTraversal(grid, cocoon, direction, false)
        : [];
      var rainbowTraversal = outcome === "rainbow"
        ? buildRainbowTraversal(this, grid, cocoon, direction)
        : [];
      var mistTraversalMoveCount = mistTraversal.length;
      var duration = SpecialAnimationTiming.spiritCocoon.totalDuration +
        mistTraversalMoveCount * SpecialAnimationTiming.spiritCocoon.mistTraversalStepDuration +
        (gluttonyTraversal.length + rainbowTraversal.length) *
          SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration;
      var opening = {
        id: "spirit_cocoon_open_" + this.shotsFired + "_" + id,
        cocoonId: cocoon.id,
        row: cocoon.row,
        col: cocoon.col,
        outcome: outcome,
        direction: direction,
        firstLocalTrigger: firstLocalTrigger,
        mistTraversal: mistTraversal,
        gluttonyTraversal: gluttonyTraversal,
        rainbowTraversal: rainbowTraversal,
        elapsed: 0,
        activated: false,
        nextTraversalIndex: 0,
        gluttonyScorePerBall: null,
        gluttonyGained: 0,
        duration: duration,
        remaining: duration
      };
      this.pendingSpiritCocoonOpenings.push(opening);
      resolution.spiritCocoonOpenings.push({
        id: opening.id,
        cocoonId: opening.cocoonId,
        row: opening.row,
        col: opening.col,
        outcome: opening.outcome,
        direction: opening.direction,
        firstLocalTrigger: opening.firstLocalTrigger,
        mistTraversal: opening.mistTraversal.map(function (entry) {
          return { id: entry.id, row: entry.row, col: entry.col };
        }),
        gluttonyTraversal: opening.gluttonyTraversal.map(function (entry) {
          return { id: entry.id, row: entry.row, col: entry.col };
        }),
        rainbowTraversal: opening.rainbowTraversal.map(function (entry) {
          return {
            id: entry.id,
            row: entry.row,
            col: entry.col,
            fromColor: entry.fromColor,
            color: entry.color
          };
        }),
        duration: opening.duration
      });
      queued.push(opening);
    }, this);
    return queued;
  };

  GameManager.prototype._filterFloatingSpiritCocoons = function (floatingCells, resolution) {
    this._queueSpiritCocoonsAdjacentToCells(floatingCells, resolution);
    var pendingIds = {};
    this.pendingSpiritCocoonOpenings.forEach(function (opening) {
      pendingIds[String(opening.cocoonId)] = true;
    });
    return floatingCells.filter(function (cell) {
      return !isSpiritCocoon(cell) || pendingIds[String(cell.id)] !== true;
    });
  };

  GameManager.prototype._applySpiritCocoonMist = function (opening, resolution) {
    var grid = this.systems.bubbleGrid;
    if (!Array.isArray(opening.mistTraversal)) {
      throw new Error("Spirit cocoon mist opening requires mistTraversal array.");
    }
    var traversedNormalCells = opening.mistTraversal.map(function (entry) {
      var cell = grid.getCell(entry.row, entry.col);
      if (!cell || cell.id !== entry.id || cell.entityCategory !== "normal_ball") {
        throw new Error("Spirit cocoon mist traversal lost normal ball: " + entry.id);
      }
      return cell;
    });
    var expiresAfterShot = this.shotsFired + MIST_DURATION_SHOTS;
    var applied = grid.applySpiritMist(traversedNormalCells, expiresAfterShot);
    Array.prototype.push.apply(resolution.spiritMistApplied, applied);
  };

  GameManager.prototype._activateSpiritCocoonOpening = function (opening, resolution) {
    var grid = this.systems.bubbleGrid;
    if (opening.activated) {
      throw new Error("Spirit cocoon opening cannot activate twice: " + opening.id);
    }
    var liveCocoon = grid.getCell(opening.row, opening.col);
    if (!isSpiritCocoon(liveCocoon) || liveCocoon.id !== opening.cocoonId) {
      throw new Error("Spirit cocoon opening lost live cocoon: " + opening.cocoonId);
    }
    var removedCocoon = grid.removeCells([liveCocoon]);
    if (removedCocoon.length !== 1) {
      throw new Error("Spirit cocoon opening must remove exactly one cocoon.");
    }
    opening.activated = true;
    if (opening.outcome === "gluttony") {
      opening.gluttonyScorePerBall = this._getMatchedDropScorePerBallForNextCombo("matchedDrop");
    }
    this.score += COCOON_OPEN_SCORE;
    resolution.scoreDelta += COCOON_OPEN_SCORE;
    this._pushRuntimeEvent("spirit_cocoon_opened", {
      cocoon_id: opening.cocoonId,
      outcome: opening.outcome,
      direction: opening.direction,
      base_score: COCOON_OPEN_SCORE
    });
  };

  GameManager.prototype._consumeSpiritCocoonGluttonyTarget = function (opening, entry, resolution) {
    var grid = this.systems.bubbleGrid;
    if (!Number.isInteger(opening.gluttonyScorePerBall) || opening.gluttonyScorePerBall <= 0) {
      throw new Error("Spirit cocoon gluttony requires positive score per ball.");
    }
    var liveCell = grid.getCell(entry.row, entry.col);
    if (!liveCell || liveCell.id !== entry.id || isSpiritCocoon(liveCell)) {
      throw new Error("Spirit cocoon gluttony traversal lost target ball: " + entry.id);
    }
    var consumed = grid.removeFloatingCells([liveCell]);
    if (consumed.length !== 1 || consumed[0].id !== entry.id) {
      throw new Error("Spirit cocoon gluttony must consume exactly its reached target.");
    }
    appendUniqueCells(resolution.spiritCocoonConsumed, consumed);
    this.score += opening.gluttonyScorePerBall;
    resolution.scoreDelta += opening.gluttonyScorePerBall;
    opening.gluttonyGained += opening.gluttonyScorePerBall;
  };

  GameManager.prototype._recolorSpiritCocoonRainbowTarget = function (entry, resolution) {
    var grid = this.systems.bubbleGrid;
    var liveCell = grid.getCell(entry.row, entry.col);
    if (!liveCell || liveCell.id !== entry.id || liveCell.entityCategory !== "normal_ball") {
      throw new Error("Spirit cocoon rainbow traversal lost normal ball: " + entry.id);
    }
    if (liveCell.color !== entry.fromColor) {
      throw new Error("Spirit cocoon rainbow target color changed before sprite arrival: " + entry.id);
    }
    var recolored = grid.recolorNormalCells([entry]);
    if (recolored.length !== 1 || recolored[0].id !== entry.id) {
      throw new Error("Spirit cocoon rainbow must recolor exactly its reached target.");
    }
    Array.prototype.push.apply(resolution.spiritCocoonRecolors, recolored);
  };

  GameManager.prototype._resolveFloatingAfterSpiritCocoon = function (resolution) {
    var grid = this.systems.bubbleGrid;
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
        throw new Error("Spirit cocoon support scan found cells that could not be removed.");
      }
      appendUniqueCells(resolution.floating, removed);
      appendUniqueCells(resolution.collected, removed);
      this._collectRemovedKeysAndResolveUnlocks(removed, grid, resolution);
      this._cancelPendingSplitterSpawnsForDroppedCells(removed);
      this._registerResolutionDrops(removed, grid, resolution, undefined, {
        skipEliminationPresentationHold: true
      });
    }
  };

  GameManager.prototype._completeSpiritCocoonOpening = function (opening, resolution) {
    if (!opening.activated) {
      throw new Error("Spirit cocoon opening must activate before completion: " + opening.id);
    }
    if (opening.outcome === "mist") {
      this._applySpiritCocoonMist(opening, resolution);
    } else if (opening.outcome === "gluttony") {
      if (opening.nextTraversalIndex !== opening.gluttonyTraversal.length) {
        throw new Error("Spirit cocoon gluttony completed before all targets were consumed.");
      }
      this._pushRuntimeEvent("spirit_cocoon_gluttony_scored", {
        count: opening.gluttonyTraversal.length,
        combo_streak: this.comboStreak,
        score_per_ball: opening.gluttonyScorePerBall,
        gained: opening.gluttonyGained
      });
    } else if (opening.outcome === "rainbow") {
      if (opening.nextTraversalIndex !== opening.rainbowTraversal.length) {
        throw new Error("Spirit cocoon rainbow completed before all targets were recolored.");
      }
    } else {
      throw new Error("Unsupported spirit cocoon outcome: " + opening.outcome);
    }
  };

  GameManager.prototype._continueAfterSpiritCocoon = function (resolution) {
    if (this._hasPendingSpiritCocoonOpenings()) {
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

  GameManager.prototype._updatePendingSpiritCocoonOpenings = function (dt) {
    if (!this._hasPendingSpiritCocoonOpenings()) {
      return false;
    }
    if (typeof dt !== "number" || !isFinite(dt) || dt < 0) {
      throw new Error("Pending spirit cocoon update requires non-negative finite dt.");
    }
    var resolution = this.lastResolution;
    var completed = [];
    var pending = [];
    var updated = false;
    this.pendingSpiritCocoonOpenings.forEach(function (opening) {
      opening.elapsed = Math.min(opening.duration, opening.elapsed + dt);
      if (opening.duration - opening.elapsed <= TIMING_EPSILON) {
        opening.elapsed = opening.duration;
      }
      opening.remaining = opening.duration - opening.elapsed;
      if (!opening.activated && opening.elapsed + TIMING_EPSILON >= SpecialAnimationTiming.spiritCocoon.totalDuration) {
        this._activateSpiritCocoonOpening(opening, resolution);
        updated = true;
      }
      var traversal = opening.outcome === "gluttony"
        ? opening.gluttonyTraversal
        : (opening.outcome === "rainbow" ? opening.rainbowTraversal : []);
      while (
        opening.nextTraversalIndex < traversal.length &&
        opening.elapsed + TIMING_EPSILON >= SpecialAnimationTiming.spiritCocoon.totalDuration +
          (opening.nextTraversalIndex + 1) * SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration
      ) {
        var entry = traversal[opening.nextTraversalIndex];
        if (opening.outcome === "gluttony") {
          this._consumeSpiritCocoonGluttonyTarget(opening, entry, resolution);
        } else {
          this._recolorSpiritCocoonRainbowTarget(entry, resolution);
        }
        opening.nextTraversalIndex += 1;
        updated = true;
      }
      if (opening.remaining === 0) {
        completed.push(opening);
      } else {
        pending.push(opening);
      }
    }, this);
    this.pendingSpiritCocoonOpenings = pending;
    completed.sort(function (left, right) {
      return String(left.cocoonId).localeCompare(String(right.cocoonId));
    }).forEach(function (opening) {
      this._completeSpiritCocoonOpening(opening, resolution);
    }, this);
    if (completed.length && !this._hasPendingSpiritCocoonOpenings()) {
      this._resolveFloatingAfterSpiritCocoon(resolution);
      resolution.boardCleared = this._isBoardCleared(this.systems.bubbleGrid);
      if (!this._hasPendingSpiritCocoonOpenings()) {
        this._continueAfterSpiritCocoon(resolution);
      }
    }
    return updated || completed.length > 0;
  };
}

module.exports = attachGameManagerSpiritCocoonMethods;
