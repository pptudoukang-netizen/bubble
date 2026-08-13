"use strict";

function attachBubbleGridSpecialEntityMethods(BubbleGrid, context) {
  var DebugFlags = context.DebugFlags;
  var MIN_VISUAL_CELL_DISTANCE = context.MIN_VISUAL_CELL_DISTANCE;
  var VINE_SPIRIT_MAX_HEALTH = context.VINE_SPIRIT_MAX_HEALTH;
  var assertNoDuplicateCellCoordinates = context.assertNoDuplicateCellCoordinates;
  var buildColorCountSignature = context.buildColorCountSignature;
  var clone = context.clone;
  var createSpecialEntityRecord = context.createSpecialEntityRecord;
  var isVineSpiritCell = context.isVineSpiritCell;
  var keyFor = context.keyFor;

BubbleGrid.prototype.getWormholePairs = function () {
  var wormholesByRow = {};
  Object.keys(this._wormholeMap).map(function (key) {
    return this._wormholeMap[key];
  }, this).forEach(function (wormhole) {
    if (!wormholesByRow[wormhole.row]) {
      wormholesByRow[wormhole.row] = [];
    }
    wormholesByRow[wormhole.row].push(wormhole);
  });
  return Object.keys(wormholesByRow).map(function (rowKey) {
    var pair = wormholesByRow[rowKey].sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      throw new Error("BubbleGrid wormhole row " + rowKey + " requires exactly two live endpoints.");
    }
    if (pair[1].col - pair[0].col < 2) {
      throw new Error("BubbleGrid wormhole row " + rowKey + " requires at least one interior slot.");
    }
    if (
      (pair[0].moveDirection !== "left" && pair[0].moveDirection !== "right") ||
      pair[0].moveDirection !== pair[1].moveDirection
    ) {
      throw new Error("BubbleGrid wormhole row " + rowKey + " requires matching left/right moveDirection.");
    }
    return pair;
  }).sort(function (left, right) {
    return left[0].row - right[0].row;
  });
};

BubbleGrid.prototype.hasWormholePair = function () {
  return this.getWormholePairs().length > 0;
};

BubbleGrid.prototype.getVineSpirits = function () {
  return this.getCells().filter(isVineSpiritCell).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.col !== right.col) {
      return left.col - right.col;
    }
    return String(left.id).localeCompare(String(right.id));
  });
};

BubbleGrid.prototype.findNearestNormalCellForVine = function (spiritCell, reservedCellKeys) {
  if (!isVineSpiritCell(spiritCell)) {
    throw new Error("Vine target selection requires a vine spirit cell.");
  }
  if (!reservedCellKeys || typeof reservedCellKeys !== "object" || Array.isArray(reservedCellKeys)) {
    throw new Error("Vine target selection requires reserved cell key map.");
  }
  Object.keys(reservedCellKeys).forEach(function (reservedKey) {
    if (reservedCellKeys[reservedKey] !== true) {
      throw new Error("Vine target reserved cell key map must contain true flags.");
    }
  });

  var spiritPosition = this.getCellPosition(spiritCell.row, spiritCell.col);
  var candidates = this.getCells().filter(function (cell) {
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      return false;
    }
    if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
      return false;
    }
    if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
      return false;
    }
    return reservedCellKeys[keyFor(cell.row, cell.col)] !== true;
  }).map(function (cell) {
    var position = this.getCellPosition(cell.row, cell.col);
    var dx = position.x - spiritPosition.x;
    var dy = position.y - spiritPosition.y;
    return {
      cell: cell,
      distanceSq: dx * dx + dy * dy
    };
  }, this).sort(function (left, right) {
    if (left.distanceSq !== right.distanceSq) {
      return left.distanceSq - right.distanceSq;
    }
    if (left.cell.row !== right.cell.row) {
      return left.cell.row - right.cell.row;
    }
    if (left.cell.col !== right.cell.col) {
      return left.cell.col - right.cell.col;
    }
    return String(left.cell.id).localeCompare(String(right.cell.id));
  });

  return candidates.length ? clone(candidates[0].cell) : null;
};

BubbleGrid.prototype.beginVinePreview = function (spiritId, targetCell) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine preview requires spiritId.");
  }
  if (!targetCell || !Number.isInteger(targetCell.row) || !Number.isInteger(targetCell.col)) {
    throw new Error("Vine preview requires target cell coordinates.");
  }
  var spirit = this.getVineSpirits().filter(function (cell) {
    return cell.id === spiritId;
  })[0];
  if (!spirit) {
    throw new Error("Vine preview owner is not a live vine spirit: " + spiritId);
  }
  var liveTarget = this.getCell(targetCell.row, targetCell.col);
  if (!liveTarget || liveTarget.entityCategory !== "normal_ball") {
    throw new Error("Vine preview target must be a live normal ball.");
  }
  if (typeof liveTarget.vineOwnerId === "string" && liveTarget.vineOwnerId) {
    throw new Error("Vine preview target is already entangled.");
  }
  if (typeof liveTarget.vinePreviewOwnerId === "string" && liveTarget.vinePreviewOwnerId) {
    throw new Error("Vine preview target already has a preview owner.");
  }
  this._vinePreviewOwnerByCell[keyFor(liveTarget.row, liveTarget.col)] = spiritId;
  this.version += 1;
  this._rebuildCaches();
  return this.getCell(liveTarget.row, liveTarget.col);
};

BubbleGrid.prototype.completeVineEntanglement = function (spiritId, targetCell) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine entanglement requires spiritId.");
  }
  if (!targetCell || !Number.isInteger(targetCell.row) || !Number.isInteger(targetCell.col)) {
    throw new Error("Vine entanglement requires target cell coordinates.");
  }
  var cellKey = keyFor(targetCell.row, targetCell.col);
  if (this._vinePreviewOwnerByCell[cellKey] !== spiritId) {
    throw new Error("Vine entanglement preview owner mismatch at " + cellKey + ".");
  }
  var liveTarget = this.getCell(targetCell.row, targetCell.col);
  if (!liveTarget || liveTarget.entityCategory !== "normal_ball") {
    throw new Error("Vine entanglement target must remain a live normal ball.");
  }
  delete this._vinePreviewOwnerByCell[cellKey];
  this._vineOwnerByCell[cellKey] = spiritId;
  this.version += 1;
  this._rebuildCaches();
  return this.getCell(targetCell.row, targetCell.col);
};

BubbleGrid.prototype.removeVineAt = function (row, col) {
  var cellKey = keyFor(row, col);
  var ownerId = this._vineOwnerByCell[cellKey];
  if (typeof ownerId !== "string" || !ownerId) {
    throw new Error("Vine removal requires an entangled normal ball at " + cellKey + ".");
  }
  var liveCell = this.getCell(row, col);
  if (!liveCell || liveCell.entityCategory !== "normal_ball") {
    throw new Error("Vine removal target must be a live normal ball at " + cellKey + ".");
  }
  delete this._vineOwnerByCell[cellKey];
  this.version += 1;
  this._rebuildCaches();
  liveCell.vineOwnerId = ownerId;
  liveCell.vinePreviewOwnerId = null;
  return liveCell;
};

BubbleGrid.prototype._clearVinesByOwner = function (spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine owner cleanup requires spiritId.");
  }
  var clearedVines = [];
  Object.keys(this._vineOwnerByCell).forEach(function (cellKey) {
    if (this._vineOwnerByCell[cellKey] !== spiritId) {
      return;
    }
    var coordinates = cellKey.split(":").map(Number);
    clearedVines.push({
      ownerId: spiritId,
      row: coordinates[0],
      col: coordinates[1],
      cellId: coordinates[0] + "_" + coordinates[1]
    });
    delete this._vineOwnerByCell[cellKey];
  }, this);
  Object.keys(this._vinePreviewOwnerByCell).forEach(function (cellKey) {
    if (this._vinePreviewOwnerByCell[cellKey] === spiritId) {
      delete this._vinePreviewOwnerByCell[cellKey];
    }
  }, this);
  return clearedVines;
};

BubbleGrid.prototype.damageVineSpirit = function (spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine spirit damage requires spiritId.");
  }
  var spiritKey = null;
  var spiritRecord = null;
  Object.keys(this._specialCellMap).forEach(function (cellKey) {
    var candidate = this._specialCellMap[cellKey];
    if (candidate.id !== spiritId) {
      return;
    }
    if (!isVineSpiritCell(candidate)) {
      throw new Error("Vine spirit damage id belongs to another special entity: " + spiritId);
    }
    spiritKey = cellKey;
    spiritRecord = candidate;
  }, this);
  if (!spiritRecord || !spiritKey) {
    throw new Error("Vine spirit damage requires a live spirit: " + spiritId);
  }
  if (!Number.isInteger(spiritRecord.health) || spiritRecord.health <= 0 || spiritRecord.health > VINE_SPIRIT_MAX_HEALTH) {
    throw new Error("Vine spirit runtime health is invalid: " + spiritId);
  }

  var healthBefore = spiritRecord.health;
  spiritRecord.health -= 1;
  var destroyed = spiritRecord.health === 0;
  var clearedVines = [];
  if (destroyed) {
    delete this._specialCellMap[spiritKey];
    clearedVines = this._clearVinesByOwner(spiritId);
  }

  this.version += 1;
  this._rebuildCaches();
  return {
    spiritId: spiritId,
    row: spiritRecord.row,
    col: spiritRecord.col,
    healthBefore: healthBefore,
    healthAfter: destroyed ? 0 : spiritRecord.health,
    destroyed: destroyed,
    clearedVines: clearedVines
  };
};

BubbleGrid.prototype.assertNoVisualOverlap = function (source) {
  assertNoDuplicateCellCoordinates(this.cells);
  if (!DebugFlags.get("gridOverlapCheck")) {
    return true;
  }

  for (var leftIndex = 0; leftIndex < this.cells.length; leftIndex += 1) {
    var leftCell = this.cells[leftIndex];
    var leftPosition = this.getCellPosition(leftCell.row, leftCell.col);
    for (var rightIndex = leftIndex + 1; rightIndex < this.cells.length; rightIndex += 1) {
      var rightCell = this.cells[rightIndex];
      var rightPosition = this.getCellPosition(rightCell.row, rightCell.col);
      var dx = leftPosition.x - rightPosition.x;
      var dy = leftPosition.y - rightPosition.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < MIN_VISUAL_CELL_DISTANCE) {
        throw new Error(
          "BubbleGrid visual overlap after " + source + ": " +
          keyFor(leftCell.row, leftCell.col) + " and " + keyFor(rightCell.row, rightCell.col)
        );
      }
    }
  }
  return true;
};

BubbleGrid.prototype.getClockwiseNeighborCoordinates = function (row, col) {
  var center = this.getCellPosition(row, col);
  var coordinates = this.getNeighborCoordinates(row, col);
  if (coordinates.length !== 6) {
    throw new Error("BubbleGrid clockwise track requires six valid neighbor cells.");
  }
  return coordinates.map(function (coordinate) {
    var position = this.getCellPosition(coordinate.row, coordinate.col);
    return {
      row: coordinate.row,
      col: coordinate.col,
      angle: Math.atan2(position.y - center.y, position.x - center.x)
    };
  }, this).sort(function (left, right) {
    return right.angle - left.angle;
  }).map(function (coordinate) {
    return {
      row: coordinate.row,
      col: coordinate.col
    };
  });
};

BubbleGrid.prototype.rotateSwirlNeighborsClockwise = function (swirlCell) {
  if (
    !swirlCell ||
    swirlCell.entityCategory !== "reactive_ball" ||
    swirlCell.entityType !== "swirl" ||
    !Number.isInteger(swirlCell.row) ||
    !Number.isInteger(swirlCell.col)
  ) {
    throw new Error("BubbleGrid swirl rotation requires a swirl cell.");
  }
  var liveSwirlCell = this.getCell(swirlCell.row, swirlCell.col);
  if (!liveSwirlCell || liveSwirlCell.id !== swirlCell.id || liveSwirlCell.entityType !== "swirl") {
    throw new Error("BubbleGrid swirl rotation requires the live swirl center.");
  }

  var track = this.getClockwiseNeighborCoordinates(swirlCell.row, swirlCell.col);
  var occupiedBefore = [];
  var colorCountsBefore = {};
  track.forEach(function (coordinate) {
    var cell = this.getCell(coordinate.row, coordinate.col);
    if (!cell) {
      occupiedBefore.push(null);
      return;
    }
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      throw new Error(
        "BubbleGrid swirl track only supports normal colored bubbles at " + coordinate.row + ":" + coordinate.col + "."
      );
    }
    occupiedBefore.push(cell);
    if (!Object.prototype.hasOwnProperty.call(colorCountsBefore, cell.color)) {
      colorCountsBefore[cell.color] = 0;
    }
    colorCountsBefore[cell.color] += 1;
  }, this);

  if (occupiedBefore.every(function (cell) { return cell === null; })) {
    return [];
  }

  track.forEach(function (coordinate) {
    delete this._timeBonusByCell[keyFor(coordinate.row, coordinate.col)];
    delete this._vineOwnerByCell[keyFor(coordinate.row, coordinate.col)];
    delete this._vinePreviewOwnerByCell[keyFor(coordinate.row, coordinate.col)];
    this._setCell(coordinate.row, coordinate.col, ".");
  }, this);

  var moves = [];
  occupiedBefore.forEach(function (cell, sourceIndex) {
    if (!cell) {
      return;
    }
    var source = track[sourceIndex];
    var target = track[(sourceIndex + 1) % track.length];
    this._setCell(target.row, target.col, cell.color);
    if (cell.timeBonusSeconds !== null) {
      if (!Number.isInteger(cell.timeBonusSeconds) || cell.timeBonusSeconds <= 0) {
        throw new Error("BubbleGrid swirl track time bonus must be a positive integer.");
      }
      this._timeBonusByCell[keyFor(target.row, target.col)] = cell.timeBonusSeconds;
    }
    if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
      this._vineOwnerByCell[keyFor(target.row, target.col)] = cell.vineOwnerId;
    }
    if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
      this._vinePreviewOwnerByCell[keyFor(target.row, target.col)] = cell.vinePreviewOwnerId;
    }
    moves.push({
      color: cell.color,
      fromRow: source.row,
      fromCol: source.col,
      toRow: target.row,
      toCol: target.col,
      targetCellId: target.row + "_" + target.col
    });
  }, this);

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("swirl rotation");

  var occupiedAfter = this.getNeighborCells(swirlCell.row, swirlCell.col);
  var colorCountsAfter = {};
  occupiedAfter.forEach(function (cell) {
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      throw new Error("BubbleGrid swirl rotation produced a non-normal track cell.");
    }
    if (!Object.prototype.hasOwnProperty.call(colorCountsAfter, cell.color)) {
      colorCountsAfter[cell.color] = 0;
    }
    colorCountsAfter[cell.color] += 1;
  });
  if (occupiedAfter.length !== moves.length) {
    throw new Error("BubbleGrid swirl rotation changed the number of track bubbles.");
  }
  if (buildColorCountSignature(colorCountsAfter) !== buildColorCountSignature(colorCountsBefore)) {
    throw new Error("BubbleGrid swirl rotation changed track colors.");
  }
  return moves;
};

BubbleGrid.prototype._shiftWormholePairInterior = function (wormholes) {
  if (!Array.isArray(wormholes) || wormholes.length !== 2) {
    throw new Error("BubbleGrid wormhole pair shift requires exactly two endpoints.");
  }
  var leftWormhole = wormholes[0];
  var rightWormhole = wormholes[1];

  var track = [];
  for (var col = leftWormhole.col; col <= rightWormhole.col; col += 1) {
    if (!this.isValidCell(leftWormhole.row, col)) {
      throw new Error("BubbleGrid wormhole channel contains an invalid cell.");
    }
    track.push({ row: leftWormhole.row, col: col });
  }
  var occupiedBefore = track.map(function (coordinate) {
    return this.getCell(coordinate.row, coordinate.col);
  }, this);
  var occupiedCountBefore = occupiedBefore.filter(Boolean).length;

  track.forEach(function (coordinate) {
    var coordinateKey = keyFor(coordinate.row, coordinate.col);
    delete this._vineOwnerByCell[coordinateKey];
    delete this._vinePreviewOwnerByCell[coordinateKey];
    this._clearSpecialCell(coordinate.row, coordinate.col);
    this._setCell(coordinate.row, coordinate.col, ".");
  }, this);

  var directionStep = leftWormhole.moveDirection === "right" ? 1 : -1;
  var moves = [];
  occupiedBefore.forEach(function (cell, sourceIndex) {
    if (!cell) {
      return;
    }
    var targetIndex = (sourceIndex + directionStep + track.length) % track.length;
    var source = track[sourceIndex];
    var target = track[targetIndex];
    var targetKey = keyFor(target.row, target.col);
    var targetCellId = null;
    if (cell.entityCategory === "normal_ball") {
      if (typeof cell.color !== "string" || !cell.color) {
        throw new Error("BubbleGrid wormhole normal cell requires color.");
      }
      this._setCell(target.row, target.col, cell.color);
      if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
        this._vineOwnerByCell[targetKey] = cell.vineOwnerId;
      }
      if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
        this._vinePreviewOwnerByCell[targetKey] = cell.vinePreviewOwnerId;
      }
      targetCellId = target.row + "_" + target.col;
    } else {
      this._setCell(target.row, target.col, ".");
      this._specialCellMap[targetKey] = createSpecialEntityRecord(cell, target.row, target.col);
      targetCellId = String(cell.id);
    }
    moves.push({
      cellId: String(cell.id),
      entityCategory: cell.entityCategory,
      entityType: cell.entityType,
      fromRow: source.row,
      fromCol: source.col,
      toRow: target.row,
      toCol: target.col,
      targetCellId: targetCellId
    });
  }, this);

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("wormhole shift");
  var occupiedCountAfter = track.reduce(function (count, coordinate) {
    return count + (this.hasCell(coordinate.row, coordinate.col) ? 1 : 0);
  }.bind(this), 0);
  if (occupiedCountAfter !== occupiedCountBefore) {
    throw new Error("BubbleGrid wormhole shift changed the number of occupied channel cells.");
  }
  return {
    row: leftWormhole.row,
    leftWormholeId: leftWormhole.id,
    leftCol: leftWormhole.col,
    rightWormholeId: rightWormhole.id,
    rightCol: rightWormhole.col,
    moveDirection: leftWormhole.moveDirection,
    slotCount: track.length,
    moves: moves
  };
};

BubbleGrid.prototype.shiftWormholeInteriors = function () {
  var pairs = this.getWormholePairs();
  return pairs.map(function (pair) {
    return this._shiftWormholePairInterior(pair);
  }, this);
};
}

module.exports = attachBubbleGridSpecialEntityMethods;
