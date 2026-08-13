"use strict";

function attachBubbleGridMutationMethods(BubbleGrid, context) {
  var BaseSystem = context.BaseSystem;
  var createSpecialEntityRecord = context.createSpecialEntityRecord;
  var isVineProtectedCell = context.isVineProtectedCell;
  var isVineSpiritCell = context.isVineSpiritCell;
  var keyFor = context.keyFor;

BubbleGrid.prototype.addBubble = function (cell, colorOrBall) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error("BubbleGrid.addBubble requires target cell coordinates.");
  }
  var row = cell.row;
  var col = cell.col;
  if (
    this.isTrappedSpriteRescueActive() &&
    this.trappedSpriteRescueSystem.isReservedCell(row, col)
  ) {
    throw new Error("BubbleGrid cannot attach a bubble to the trapped sprite anchor cell.");
  }

  if (typeof colorOrBall === "string") {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, colorOrBall);
  } else if (colorOrBall && typeof colorOrBall === "object") {
    if (
      colorOrBall.entityCategory === "skill_ball" ||
      colorOrBall.entityCategory === "obstacle_ball" ||
      colorOrBall.entityCategory === "reactive_ball" ||
      colorOrBall.entityCategory === "locked_ball" ||
      colorOrBall.entityCategory === "key_ball"
    ) {
      this._setCell(row, col, ".");
      this._specialCellMap[keyFor(row, col)] = createSpecialEntityRecord(colorOrBall, row, col);
    } else {
      this._clearSpecialCell(row, col);
      this._setCell(row, col, colorOrBall.color || ".");
    }
  } else {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, ".");
  }

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("addBubble");
  return this.getCell(row, col);
};

BubbleGrid.prototype.setTemporaryThaw = function (row, col, thawToken, active) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new Error("BubbleGrid temporary thaw requires integer coordinates.");
  }
  if (typeof thawToken !== "string" || !thawToken) {
    throw new Error("BubbleGrid temporary thaw requires thawToken.");
  }
  if (typeof active !== "boolean") {
    throw new Error("BubbleGrid temporary thaw requires active boolean.");
  }
  var cellKey = keyFor(row, col);
  var entity = this._specialCellMap[cellKey];
  if (!entity || entity.entityCategory !== "obstacle_ball" || entity.entityType !== "ice") {
    throw new Error("BubbleGrid temporary thaw target must be a live ice obstacle: " + cellKey);
  }
  if (active) {
    if (entity.temporaryThawed === true) {
      throw new Error("BubbleGrid ice obstacle is already temporarily thawed: " + cellKey);
    }
    entity.temporaryThawed = true;
    entity.temporaryThawToken = thawToken;
  } else {
    if (entity.temporaryThawed !== true || entity.temporaryThawToken !== thawToken) {
      throw new Error("BubbleGrid temporary thaw token mismatch: " + cellKey);
    }
    entity.temporaryThawed = false;
    entity.temporaryThawToken = null;
  }
  this.version += 1;
  this._rebuildCaches();
  return this.getCell(row, col);
};

BubbleGrid.prototype.findTemporaryThawCells = function (thawToken) {
  if (typeof thawToken !== "string" || !thawToken) {
    throw new Error("BubbleGrid temporary thaw lookup requires thawToken.");
  }
  return this.getCells().filter(function (cell) {
    return cell.temporaryThawed === true && cell.temporaryThawToken === thawToken;
  }).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    return left.col - right.col;
  });
};

BubbleGrid.prototype._removeCellsByMode = function (cells, allowVineDrop) {
  if (typeof allowVineDrop !== "boolean") {
    throw new Error("BubbleGrid cell removal mode requires allowVineDrop boolean.");
  }
  var removed = [];
  var touchedKeys = {};

  (cells || []).forEach(function (cell) {
    if (!cell) {
      return;
    }

    var key = keyFor(cell.row, cell.col);
    if (touchedKeys[key] || !this.hasCell(cell.row, cell.col)) {
      return;
    }

    var liveCell = this.getCell(cell.row, cell.col);
    if (!allowVineDrop && isVineProtectedCell(liveCell)) {
      return;
    }

    if (allowVineDrop) {
      if (isVineSpiritCell(liveCell)) {
        this._clearVinesByOwner(liveCell.id);
      } else if (
        liveCell.entityCategory === "normal_ball" &&
        (
          (typeof liveCell.vineOwnerId === "string" && liveCell.vineOwnerId) ||
          (typeof liveCell.vinePreviewOwnerId === "string" && liveCell.vinePreviewOwnerId)
        )
      ) {
        delete this._vineOwnerByCell[key];
        delete this._vinePreviewOwnerByCell[key];
        liveCell.vineOwnerId = null;
        liveCell.vinePreviewOwnerId = null;
      }
    }

    touchedKeys[key] = true;
    removed.push(liveCell);
    delete this._timeBonusByCell[key];
    this._setCell(cell.row, cell.col, ".");
    this._clearSpecialCell(cell.row, cell.col);
  }, this);

  if (removed.length) {
    this.version += 1;
    this._rebuildCaches();
    this.assertNoVisualOverlap("removeCells");
    if (this._cellRemovalListener) {
      this._cellRemovalListener(removed.slice(), allowVineDrop ? "floating_drop" : "elimination");
    }
  }

  return removed;
};

BubbleGrid.prototype.removeCells = function (cells) {
  return this._removeCellsByMode(cells, false);
};

BubbleGrid.prototype.removeFloatingCells = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BubbleGrid.removeFloatingCells requires cells array.");
  }
  return this._removeCellsByMode(cells, true);
};

BubbleGrid.prototype.getTopAttachY = function () {
  return this.boardViewport.getTopAttachY();
};

BubbleGrid.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.coordinateSystem = this.coordinateSystem;
  snapshot.rowCount = this.getRowCount();
  snapshot.maxColumns = this.maxColumns;
  snapshot.cellCount = this.cells.length;
  snapshot.viewportOffsetY = this.getViewportOffsetY();
  snapshot.topAttachY = this.getTopAttachY();
  snapshot.dangerReached = false;
  snapshot.trappedSpriteRescueActive = this.isTrappedSpriteRescueActive();
  snapshot.cells = this.getCells().map(function (cell) {
    cell.position = this.getCellPosition(cell.row, cell.col);
    return cell;
  }, this);
  snapshot.specialEntities = this.getSpecialEntities().map(function (entity) {
    entity.position = this.getCellPosition(entity.row, entity.col);
    return entity;
  }, this);
  snapshot.version = this.version;
  return snapshot;
};
}

module.exports = attachBubbleGridMutationMethods;
