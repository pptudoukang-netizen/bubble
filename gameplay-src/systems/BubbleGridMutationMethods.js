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
    this.isTrappedSpiritReservedCell(row, col)
  ) {
    throw new Error("BubbleGrid cannot attach a bubble to a trapped spirit reserved cell.");
  }
  if (this.hasWormholeAt(row, col)) {
    throw new Error("BubbleGrid cannot attach a bubble to a wormhole endpoint.");
  }
  if (this.hasWindTunnelExitAt(row, col)) {
    throw new Error("BubbleGrid cannot attach a bubble before blocking the wind tunnel exit.");
  }

  if (typeof colorOrBall === "string") {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, colorOrBall);
  } else if (colorOrBall && typeof colorOrBall === "object") {
    if (
      colorOrBall.entityCategory === "skill_ball" ||
      colorOrBall.entityCategory === "hazard_ball" ||
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
  var removedSpiderHosts = [];
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
    if (
      !allowVineDrop &&
      liveCell.entityCategory === "reactive_ball" &&
      liveCell.entityType === "wind_tunnel_exit"
    ) {
      return;
    }
    if (!allowVineDrop && isVineProtectedCell(liveCell)) {
      return;
    }
    if (
      liveCell.spiderLocked === true &&
      !(typeof liveCell.spiderId === "string" && liveCell.spiderId)
    ) {
      return;
    }
    if (
      !allowVineDrop &&
      (
        liveCell.lockChainProtected === true ||
        (liveCell.entityCategory === "locked_ball" && liveCell.entityType === "locked")
      )
    ) {
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
    if (typeof liveCell.spiderId === "string" && liveCell.spiderId) {
      removedSpiderHosts.push(liveCell);
    }
    delete this._timeBonusByCell[key];
    delete this._spiritMistExpiryByCell[key];
    delete this._poisonAttachmentByCell[key];
    delete this._iceCrystalAttachmentByCell[key];
    delete this._bubbleShieldAttachmentByCell[key];
    this._setCell(cell.row, cell.col, ".");
    this._clearSpecialCell(cell.row, cell.col);
  }, this);

  var removedSpiderCocoons = this._resolveRemovedSpiderHosts(removedSpiderHosts);

  if (removed.length) {
    this._syncWindTunnelAfterExitRemoval();
    this.version += 1;
    this._rebuildCaches();
    this.assertNoVisualOverlap("removeCells");
    if (this._cellRemovalListener) {
      this._cellRemovalListener(
        removed.concat(removedSpiderCocoons),
        allowVineDrop ? "floating_drop" : "elimination"
      );
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

BubbleGrid.prototype._removeBubbleShieldsAtCoordinates = function (coordinates) {
  if (!Array.isArray(coordinates)) {
    throw new Error("BubbleGrid bubble shield removal requires coordinates array.");
  }
  var removedShields = [];
  var touched = {};
  coordinates.forEach(function (coordinate, index) {
    if (!coordinate || !Number.isInteger(coordinate.row) || !Number.isInteger(coordinate.col)) {
      throw new Error("BubbleGrid bubble shield removal requires integer coordinates at index " + index + ".");
    }
    var coordinateKey = keyFor(coordinate.row, coordinate.col);
    if (touched[coordinateKey]) {
      return;
    }
    touched[coordinateKey] = true;
    if (!Object.prototype.hasOwnProperty.call(this._bubbleShieldAttachmentByCell, coordinateKey)) {
      return;
    }
    var liveCell = this.getCell(coordinate.row, coordinate.col);
    if (
      !liveCell ||
      liveCell.entityCategory !== "normal_ball" ||
      liveCell.entityType !== null ||
      typeof liveCell.bubbleShieldAttachmentId !== "string" ||
      !liveCell.bubbleShieldAttachmentId
    ) {
      throw new Error("BubbleGrid bubble shield target must remain an ordinary ball: " + coordinateKey + ".");
    }
    var attachment = this._bubbleShieldAttachmentByCell[coordinateKey];
    if (!attachment || attachment.id !== liveCell.bubbleShieldAttachmentId || attachment.type !== "bubble_shield") {
      throw new Error("BubbleGrid bubble shield state is inconsistent: " + coordinateKey + ".");
    }
    removedShields.push({
      id: attachment.id,
      type: attachment.type,
      row: liveCell.row,
      col: liveCell.col,
      protectedCellId: liveCell.id
    });
    delete this._bubbleShieldAttachmentByCell[coordinateKey];
  }, this);
  if (removedShields.length) {
    this.version += 1;
    this._rebuildCaches();
    this.assertNoVisualOverlap("remove bubble shields");
  }
  return removedShields;
};

BubbleGrid.prototype.removeBubbleShieldsAdjacentToCells = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BubbleGrid adjacent bubble shield removal requires cells array.");
  }
  var adjacentCoordinates = [];
  cells.forEach(function (cell, index) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("BubbleGrid adjacent bubble shield removal requires cell coordinates at index " + index + ".");
    }
    Array.prototype.push.apply(
      adjacentCoordinates,
      this.getNeighborCoordinates(cell.row, cell.col)
    );
  }, this);
  return this._removeBubbleShieldsAtCoordinates(adjacentCoordinates);
};

BubbleGrid.prototype.resolveBubbleShieldHits = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BubbleGrid special bubble shield hit requires cells array.");
  }
  var removableCells = [];
  var shieldCoordinates = [];
  var touched = {};
  cells.forEach(function (cell, index) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("BubbleGrid special bubble shield hit requires cell coordinates at index " + index + ".");
    }
    var coordinateKey = keyFor(cell.row, cell.col);
    if (touched[coordinateKey]) {
      return;
    }
    touched[coordinateKey] = true;
    var liveCell = this.getCell(cell.row, cell.col);
    if (!liveCell) {
      return;
    }
    if (
      liveCell.spiderProtected === true ||
      (
        liveCell.spiderLocked === true &&
        !(typeof liveCell.spiderId === "string" && liveCell.spiderId)
      )
    ) {
      return;
    }
    if (liveCell.lockChainProtected === true) {
      removableCells.push(liveCell);
      return;
    }
    if (
      typeof liveCell.bubbleShieldAttachmentId === "string" &&
      liveCell.bubbleShieldAttachmentId
    ) {
      shieldCoordinates.push({ row: liveCell.row, col: liveCell.col });
      return;
    }
    removableCells.push(liveCell);
  }, this);
  return {
    removableCells: removableCells,
    removedShields: this._removeBubbleShieldsAtCoordinates(shieldCoordinates)
  };
};

BubbleGrid.prototype.applySpiritMist = function (cells, expiresAfterShot) {
  if (!Array.isArray(cells)) {
    throw new Error("BubbleGrid.applySpiritMist requires cells array.");
  }
  if (!Number.isInteger(expiresAfterShot) || expiresAfterShot <= 0) {
    throw new Error("BubbleGrid.applySpiritMist requires positive expiresAfterShot.");
  }
  var applied = [];
  cells.forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Spirit mist target requires cell coordinates.");
    }
    var liveCell = this.getCell(cell.row, cell.col);
    if (!liveCell || liveCell.entityCategory !== "normal_ball") {
      throw new Error("Spirit mist target must remain a live normal ball.");
    }
    this._spiritMistExpiryByCell[keyFor(cell.row, cell.col)] = expiresAfterShot;
    applied.push({
      id: liveCell.id,
      row: liveCell.row,
      col: liveCell.col,
      expiresAfterShot: expiresAfterShot
    });
  }, this);
  if (applied.length) {
    this.version += 1;
    this._rebuildCaches();
  }
  return applied;
};

BubbleGrid.prototype.clearExpiredSpiritMist = function (shotsFired) {
  if (!Number.isInteger(shotsFired) || shotsFired < 0) {
    throw new Error("BubbleGrid.clearExpiredSpiritMist requires non-negative shotsFired.");
  }
  var cleared = [];
  Object.keys(this._spiritMistExpiryByCell).forEach(function (cellKey) {
    var expiry = this._spiritMistExpiryByCell[cellKey];
    if (!Number.isInteger(expiry) || expiry <= 0) {
      throw new Error("Spirit mist expiry must be a positive integer: " + cellKey);
    }
    if (shotsFired < expiry) {
      return;
    }
    var coordinates = cellKey.split(":").map(Number);
    var cell = this.getCell(coordinates[0], coordinates[1]);
    if (!cell || cell.entityCategory !== "normal_ball") {
      throw new Error("Spirit mist expiry target must remain a live normal ball: " + cellKey);
    }
    cleared.push({ id: cell.id, row: cell.row, col: cell.col });
    delete this._spiritMistExpiryByCell[cellKey];
  }, this);
  if (cleared.length) {
    this.version += 1;
    this._rebuildCaches();
  }
  return cleared;
};

BubbleGrid.prototype.recolorNormalCells = function (assignments) {
  if (!Array.isArray(assignments)) {
    throw new Error("BubbleGrid.recolorNormalCells requires assignments array.");
  }
  var recolored = [];
  assignments.forEach(function (assignment) {
    if (!assignment || !Number.isInteger(assignment.row) || !Number.isInteger(assignment.col)) {
      throw new Error("BubbleGrid recolor assignment requires coordinates.");
    }
    if (typeof assignment.color !== "string" || !assignment.color) {
      throw new Error("BubbleGrid recolor assignment requires color.");
    }
    var liveCell = this.getCell(assignment.row, assignment.col);
    if (!liveCell || liveCell.entityCategory !== "normal_ball") {
      throw new Error("BubbleGrid recolor target must be a live normal ball.");
    }
    this._setCell(assignment.row, assignment.col, assignment.color);
    recolored.push({
      id: liveCell.id,
      row: liveCell.row,
      col: liveCell.col,
      fromColor: liveCell.color,
      color: assignment.color
    });
  }, this);
  if (recolored.length) {
    this.version += 1;
    this._rebuildCaches();
  }
  return recolored;
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
  snapshot.activeLockChainRow = this.getActiveLockChainRow();
  snapshot.activeSpiderRow = this.getActiveSpiderRow();
  snapshot.spiderRows = this.getSpiderRows().map(function (spiderRow) {
    spiderRow.position = this.getCellPosition(spiderRow.row, 0);
    spiderRow.spiders = spiderRow.spiders.map(function (spider) {
      spider.position = this.getCellPosition(spider.row, spider.col);
      return spider;
    }, this);
    return spiderRow;
  }, this);
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
