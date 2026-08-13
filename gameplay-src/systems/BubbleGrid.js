"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var DebugFlags = require("../../assets/scripts/utils/DebugFlags");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(row, col) {
  return row + ":" + col;
}

function buildColorCountSignature(colorCounts) {
  return Object.keys(colorCounts).sort().map(function (color) {
    return color + ":" + colorCounts[color];
  }).join("|");
}

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

var EPSILON = 0.000001;
var MIN_VISUAL_CELL_DISTANCE = BoardLayout.bubbleDiameter - 0.5;
var VINE_SPIRIT_MAX_HEALTH = 3;

function isVineSpiritCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "vine_spirit"
  );
}

function isWormholeCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "wormhole"
  );
}

function isVineProtectedCell(cell) {
  return !!(
    cell &&
    (
      isVineSpiritCell(cell) ||
      (cell.entityCategory === "normal_ball" && typeof cell.vineOwnerId === "string" && cell.vineOwnerId)
    )
  );
}

function collectOccupiedRows(cells) {
  var rowMap = {};
  (cells || []).forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row)) {
      throw new Error("BubbleGrid cell row must be an integer.");
    }
    rowMap[cell.row] = true;
  });
  return Object.keys(rowMap).map(function (row) {
    return Number(row);
  }).sort(function (a, b) {
    return a - b;
  });
}

function assertNoDuplicateCellCoordinates(cells) {
  var occupied = {};
  (cells || []).forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("BubbleGrid cell coordinates must be integers.");
    }
    var key = keyFor(cell.row, cell.col);
    if (occupied[key]) {
      throw new Error("BubbleGrid contains duplicate cell coordinates: " + key);
    }
    occupied[key] = true;
  });
}

function createSpecialEntityRecord(entity, row, col) {
  var lockedColor = null;
  if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
    if (typeof entity.lockedColor !== "string" || !entity.lockedColor) {
      throw new Error("Locked special entity requires lockedColor.");
    }
    lockedColor = entity.lockedColor;
  }

  var record = {
    id: entity.id || ("special_" + row + "_" + col),
    entityCategory: entity.entityCategory,
    entityType: entity.entityType,
    innerColor: entity.innerColor || null,
    splitColor: entity.splitColor || null,
    lockedColor: lockedColor,
    blastRadius: Number.isInteger(entity.blastRadius) ? entity.blastRadius : null,
    moveDirection: typeof entity.moveDirection === "string" && entity.moveDirection
      ? entity.moveDirection
      : null,
    temporaryThawed: entity.temporaryThawed === true,
    temporaryThawToken: typeof entity.temporaryThawToken === "string" && entity.temporaryThawToken
      ? entity.temporaryThawToken
      : null,
    row: row,
    col: col
  };
  if (record.temporaryThawed && !(record.entityCategory === "obstacle_ball" && record.entityType === "ice")) {
    throw new Error("Temporary thaw state is only valid on ice obstacles.");
  }
  if (record.temporaryThawed && !record.temporaryThawToken) {
    throw new Error("Temporary thaw state requires temporaryThawToken.");
  }
  if (entity.entityCategory === "reactive_ball" && entity.entityType === "vine_spirit") {
    record.health = Number.isInteger(entity.health) ? entity.health : VINE_SPIRIT_MAX_HEALTH;
    record.maxHealth = VINE_SPIRIT_MAX_HEALTH;
  }
  return record;
}

function BubbleGrid() {
  BaseSystem.call(this, "BubbleGrid");
  this.layout = [];
  this.specialEntities = [];
  this.coordinateSystem = "odd-r-hex";
  this.cells = [];
  this.maxColumns = 0;
  this.version = 0;
  this.boardViewport = null;
  this.trappedSpriteRescueSystem = null;
  this._cellMap = {};
  this._cellsByRow = {};
  this._rescueExtendedNormalCellMap = {};
  this._specialCellMap = {};
  this._wormholeMap = {};
  this._timeBonusByCell = {};
  this._vineOwnerByCell = {};
  this._vinePreviewOwnerByCell = {};
  this._cellRemovalListener = null;
}

BubbleGrid.prototype = Object.create(BaseSystem.prototype);
BubbleGrid.prototype.constructor = BubbleGrid;

BubbleGrid.prototype.attachBoardViewport = function (boardViewport) {
  if (!boardViewport || typeof boardViewport.getOffsetY !== "function") {
    throw new Error("BubbleGrid.attachBoardViewport requires BoardViewportSystem.");
  }
  this.boardViewport = boardViewport;
  return this;
};

BubbleGrid.prototype.attachTrappedSpriteRescueSystem = function (trappedSpriteRescueSystem) {
  if (
    !trappedSpriteRescueSystem ||
    typeof trappedSpriteRescueSystem.isActive !== "function" ||
    typeof trappedSpriteRescueSystem.getCellWorldPosition !== "function" ||
    typeof trappedSpriteRescueSystem.getWorldCenter !== "function"
  ) {
    throw new Error("BubbleGrid.attachTrappedSpriteRescueSystem requires TrappedSpriteRescueSystem.");
  }
  this.trappedSpriteRescueSystem = trappedSpriteRescueSystem;
  return this;
};

BubbleGrid.prototype.attachCellRemovalListener = function (listener) {
  if (typeof listener !== "function") {
    throw new Error("BubbleGrid.attachCellRemovalListener requires function.");
  }
  this._cellRemovalListener = listener;
  return this;
};

BubbleGrid.prototype.isTrappedSpriteRescueActive = function () {
  return !!(
    this.trappedSpriteRescueSystem &&
    this.trappedSpriteRescueSystem.isActive()
  );
};

BubbleGrid.prototype._requireViewportOffsetY = function () {
  if (!this.boardViewport || typeof this.boardViewport.getOffsetY !== "function") {
    throw new Error("BubbleGrid requires attached BoardViewportSystem.");
  }
  return this.boardViewport.getOffsetY();
};

BubbleGrid.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level) {
    throw new Error("BubbleGrid.configureLevel requires level config.");
  }
  if (!this.boardViewport) {
    throw new Error("BubbleGrid.configureLevel requires attached BoardViewportSystem.");
  }
  if (
    levelConfig.level.levelType === "trapped_sprite_rescue" &&
    !this.trappedSpriteRescueSystem
  ) {
    throw new Error("Trapped sprite rescue BubbleGrid requires attached TrappedSpriteRescueSystem.");
  }
  if (
    levelConfig.level.levelType !== "trapped_sprite_rescue" &&
    (!Number.isInteger(levelConfig.level.initialDropSpaceRows) || levelConfig.level.initialDropSpaceRows < 8)
  ) {
    throw new Error("BubbleGrid requires level.initialDropSpaceRows >= 8.");
  }
  this.layout = levelConfig.level.layout.slice();
  this._rescueExtendedNormalCellMap = {};
  this.specialEntities = Array.isArray(levelConfig.level.specialEntities)
    ? clone(levelConfig.level.specialEntities)
    : [];
  this._timeBonusByCell = {};
  if (levelConfig.level.timeBonusBalls !== undefined) {
    if (!Array.isArray(levelConfig.level.timeBonusBalls)) {
      throw new Error("BubbleGrid timeBonusBalls must be an array when configured.");
    }
    levelConfig.level.timeBonusBalls.forEach(function (entry, index) {
      if (!entry || !Number.isInteger(entry.row) || !Number.isInteger(entry.col) ||
          !Number.isInteger(entry.bonusSeconds) || entry.bonusSeconds <= 0) {
        throw new Error("BubbleGrid timeBonusBalls[" + index + "] is invalid.");
      }
      var coordinateKey = keyFor(entry.row, entry.col);
      if (Object.prototype.hasOwnProperty.call(this._timeBonusByCell, coordinateKey)) {
        throw new Error("BubbleGrid timeBonusBalls contains duplicate cell " + coordinateKey + ".");
      }
      this._timeBonusByCell[coordinateKey] = entry.bonusSeconds;
    }, this);
  }
  this.coordinateSystem = levelConfig.coordinateSystem || this.coordinateSystem;
  this._vineOwnerByCell = {};
  this._vinePreviewOwnerByCell = {};
  var layoutMaxColumns = this.layout.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
  if (!Number.isInteger(BoardLayout.defaultColumns) || BoardLayout.defaultColumns <= 0) {
    throw new Error("BoardLayout.defaultColumns must be a positive integer.");
  }
  this.maxColumns = Math.max(BoardLayout.defaultColumns, layoutMaxColumns);
  this._normalizeLayoutRows();
  this._rebuildSpecialCellMap();
  this.version = 1;
  this._rebuildCaches();
  this.boardViewport.planIntroPosition(this.cells);
  this.assertNoVisualOverlap("configureLevel");
  return this;
};

BubbleGrid.prototype.getColumnCountForRow = function (row) {
  return BoardLayout.getRowColumnCount(row, this.maxColumns);
};

BubbleGrid.prototype._isLayoutBackedCell = function (row, col) {
  return Number.isInteger(row) && row >= 0 &&
    Number.isInteger(col) && col >= 0 && col < this.getColumnCountForRow(row);
};

BubbleGrid.prototype.isValidCell = function (row, col) {
  if (this.isTrappedSpriteRescueActive()) {
    return Number.isInteger(row) && Number.isInteger(col);
  }
  return this._isLayoutBackedCell(row, col);
};

BubbleGrid.prototype._normalizeRowString = function (rowIndex, rowString) {
  var rowColumns = this.getColumnCountForRow(rowIndex);
  var source = typeof rowString === "string" ? rowString : "";
  var normalized = source.slice(0, rowColumns);

  if (normalized.length < rowColumns) {
    normalized += ".".repeat(rowColumns - normalized.length);
  }

  return normalized;
};

BubbleGrid.prototype._normalizeLayoutRows = function () {
  this.layout = this.layout.map(function (rowString, rowIndex) {
    return this._normalizeRowString(rowIndex, rowString);
  }, this);
};

BubbleGrid.prototype._rebuildSpecialCellMap = function () {
  this._specialCellMap = {};
  this._wormholeMap = {};

  (this.specialEntities || []).forEach(function (entity) {
    if (!entity || !this.isValidCell(entity.row, entity.col)) {
      return;
    }

    var entityKey = keyFor(entity.row, entity.col);
    var record = createSpecialEntityRecord(entity, entity.row, entity.col);
    if (isWormholeCell(record)) {
      this._wormholeMap[entityKey] = record;
      return;
    }
    this._specialCellMap[entityKey] = record;
  }, this);
};

BubbleGrid.prototype._createNormalCell = function (row, col, colorCode) {
  var cellKey = keyFor(row, col);
  return {
    row: row,
    col: col,
    color: colorCode,
    id: row + "_" + col,
    entityCategory: "normal_ball",
    entityType: null,
    timeBonusSeconds: Object.prototype.hasOwnProperty.call(this._timeBonusByCell, cellKey)
      ? this._timeBonusByCell[cellKey]
      : null,
    vineOwnerId: Object.prototype.hasOwnProperty.call(this._vineOwnerByCell, cellKey)
      ? this._vineOwnerByCell[cellKey]
      : null,
    vinePreviewOwnerId: Object.prototype.hasOwnProperty.call(this._vinePreviewOwnerByCell, cellKey)
      ? this._vinePreviewOwnerByCell[cellKey]
      : null,
    isSpecial: false
  };
};

BubbleGrid.prototype._createSpecialCell = function (entity, row, col) {
  var lockedColor = null;
  if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
    if (typeof entity.lockedColor !== "string" || !entity.lockedColor) {
      throw new Error("Locked special cell requires lockedColor.");
    }
    lockedColor = entity.lockedColor;
  }

  var cell = {
    row: row,
    col: col,
    color: entity.temporaryThawed === true ? entity.innerColor : null,
    id: entity.id || ("special_" + row + "_" + col),
    entityCategory: entity.entityCategory,
    entityType: entity.entityType,
    innerColor: entity.innerColor || null,
    splitColor: entity.splitColor || null,
    lockedColor: lockedColor,
    blastRadius: Number.isInteger(entity.blastRadius) ? entity.blastRadius : null,
    moveDirection: typeof entity.moveDirection === "string" && entity.moveDirection
      ? entity.moveDirection
      : null,
    temporaryThawed: entity.temporaryThawed === true,
    temporaryThawToken: typeof entity.temporaryThawToken === "string" && entity.temporaryThawToken
      ? entity.temporaryThawToken
      : null,
    isSpecial: true
  };
  if (cell.temporaryThawed) {
    if (!(cell.entityCategory === "obstacle_ball" && cell.entityType === "ice")) {
      throw new Error("Temporary thaw cell must remain an ice obstacle.");
    }
    if (typeof cell.innerColor !== "string" || !cell.innerColor) {
      throw new Error("Temporary thaw cell requires innerColor.");
    }
    if (!cell.temporaryThawToken) {
      throw new Error("Temporary thaw cell requires temporaryThawToken.");
    }
  }
  if (isVineSpiritCell(entity)) {
    if (!Number.isInteger(entity.health) || entity.health <= 0 || entity.health > VINE_SPIRIT_MAX_HEALTH) {
      throw new Error("Vine spirit special cell requires health in [1, 3].");
    }
    cell.health = entity.health;
    cell.maxHealth = VINE_SPIRIT_MAX_HEALTH;
  }
  return cell;
};

BubbleGrid.prototype._rebuildCaches = function () {
  this.cells = [];
  this._cellMap = {};
  this._cellsByRow = {};

  this.layout.forEach(function (row, rowIndex) {
    var normalizedRow = this._normalizeRowString(rowIndex, row);
    this.layout[rowIndex] = normalizedRow;
    normalizedRow.split("").forEach(function (cellCode, columnIndex) {
      if (cellCode === ".") {
        return;
      }

      var cell = this._createNormalCell(rowIndex, columnIndex, cellCode);

      this.cells.push(cell);
      this._cellMap[keyFor(rowIndex, columnIndex)] = cell;
      this._pushCellToRowBucket(cell);
    }, this);
  }, this);

  Object.keys(this._rescueExtendedNormalCellMap).forEach(function (key) {
    var extendedCell = this._rescueExtendedNormalCellMap[key];
    if (!this.isTrappedSpriteRescueActive()) {
      throw new Error("BubbleGrid extended cells require active trapped sprite rescue mode.");
    }
    if (this._isLayoutBackedCell(extendedCell.row, extendedCell.col)) {
      throw new Error("BubbleGrid extended cell must remain outside authored layout coordinates: " + key);
    }
    if (this._cellMap[key]) {
      throw new Error("BubbleGrid extended cell overlaps an authored layout cell: " + key);
    }

    var normalCell = this._createNormalCell(extendedCell.row, extendedCell.col, extendedCell.color);
    this.cells.push(normalCell);
    this._cellMap[key] = normalCell;
    this._pushCellToRowBucket(normalCell);
  }, this);

  Object.keys(this._specialCellMap).forEach(function (key) {
    if (this._cellMap[key]) {
      // Keep normal layout data authoritative when overlap happens by mistake.
      return;
    }

    var entity = this._specialCellMap[key];
    var specialCell = this._createSpecialCell(entity, entity.row, entity.col);
    this.cells.push(specialCell);
    this._cellMap[key] = specialCell;
    this._pushCellToRowBucket(specialCell);
  }, this);
};

BubbleGrid.prototype._pushCellToRowBucket = function (cell) {
  if (!cell || !Number.isInteger(cell.row)) {
    throw new Error("BubbleGrid row bucket requires integer cell.row.");
  }
  var rowKey = String(cell.row);
  if (!this._cellsByRow[rowKey]) {
    this._cellsByRow[rowKey] = [];
  }
  this._cellsByRow[rowKey].push(cell);
};

BubbleGrid.prototype._resolveSegmentPaddingRows = function (collisionRadius) {
  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.bubbleDiameter;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("BubbleGrid segment padding requires positive collision radius.");
  }
  var rowHeight = BoardLayout.rowHeight;
  if (typeof rowHeight !== "number" || !Number.isFinite(rowHeight) || rowHeight <= 0) {
    throw new Error("BoardLayout.rowHeight must be a positive number.");
  }
  return Math.ceil(radius / rowHeight) + 1;
};

BubbleGrid.prototype._resolveSegmentRowBounds = function (startPoint, endPoint, paddingRows) {
  if (!startPoint || !endPoint) {
    throw new Error("BubbleGrid segment row bounds require start and end points.");
  }
  var rowHeight = BoardLayout.rowHeight;
  if (typeof rowHeight !== "number" || !Number.isFinite(rowHeight) || rowHeight <= 0) {
    throw new Error("BoardLayout.rowHeight must be a positive number.");
  }
  var padding = Math.max(0, Math.floor(Number(paddingRows) || 0));
  var minSegmentY = Math.min(startPoint.y, endPoint.y);
  var maxSegmentY = Math.max(startPoint.y, endPoint.y);
  var viewportOffsetY = this._requireViewportOffsetY();
  var minRow = Math.floor((BoardLayout.boardStartY - maxSegmentY + viewportOffsetY) / rowHeight) - padding;
  var maxRow = Math.ceil((BoardLayout.boardStartY - minSegmentY + viewportOffsetY) / rowHeight) + padding;
  return {
    minRow: Math.max(0, minRow),
    maxRow: Math.min(this.getRowCount() + 1, maxRow)
  };
};

BubbleGrid.prototype._iterateCellsNearSegment = function (startPoint, endPoint, paddingRows, callback) {
  if (typeof callback !== "function") {
    throw new Error("BubbleGrid segment iteration requires callback.");
  }
  if (this.isTrappedSpriteRescueActive()) {
    this.cells.forEach(function (cell) {
      callback.call(this, cell);
    }, this);
    return;
  }
  var bounds = this._resolveSegmentRowBounds(startPoint, endPoint, paddingRows);
  for (var row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    var rowCells = this._cellsByRow[String(row)];
    if (!rowCells || !rowCells.length) {
      continue;
    }
    for (var cellIndex = 0; cellIndex < rowCells.length; cellIndex += 1) {
      callback.call(this, rowCells[cellIndex]);
    }
  }
};

BubbleGrid.prototype._testSegmentCircleHit = function (cell, startPoint, segment, segmentLengthSq, radius) {
  var center = this.getCellPosition(cell.row, cell.col);
  var startToCenter = {
    x: startPoint.x - center.x,
    y: startPoint.y - center.y
  };
  var radiusSq = radius * radius;
  var c = dot(startToCenter, startToCenter) - radiusSq;
  var hitT = null;

  if (c <= 0) {
    hitT = 0;
  } else if (segmentLengthSq > EPSILON) {
    var b = 2 * dot(segment, startToCenter);
    var discriminant = b * b - 4 * segmentLengthSq * c;
    if (discriminant >= 0) {
      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * segmentLengthSq);
      var t2 = (-b + sqrtDiscriminant) / (2 * segmentLengthSq);

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }
    }
  }

  if (hitT === null) {
    return null;
  }

  return {
    cell: cell,
    center: center,
    t: hitT,
    distanceToStartSq: c
  };
};

BubbleGrid.prototype._shouldReplaceSegmentHit = function (currentBest, candidate) {
  if (!candidate) {
    return false;
  }
  if (!currentBest) {
    return true;
  }
  return (
    candidate.t < currentBest.t - EPSILON ||
    (Math.abs(candidate.t - currentBest.t) <= EPSILON && candidate.distanceToStartSq < currentBest.distanceToStartSq)
  );
};

BubbleGrid.prototype._buildSegmentCollisionResult = function (bestHit, startPoint, segment) {
  var hitPoint = {
    x: startPoint.x + segment.x * bestHit.t,
    y: startPoint.y + segment.y * bestHit.t
  };
  var hitNormal = normalize({
    x: hitPoint.x - bestHit.center.x,
    y: hitPoint.y - bestHit.center.y
  });

  if (Math.abs(hitNormal.x) <= 0.0001 && Math.abs(hitNormal.y) <= 0.0001) {
    hitNormal = normalize({
      x: -segment.x,
      y: -segment.y
    });
  }

  return {
    cell: clone(bestHit.cell),
    point: hitPoint,
    normal: hitNormal,
    t: bestHit.t
  };
};

BubbleGrid.prototype._ensureRow = function (rowIndex) {
  while (this.layout.length <= rowIndex) {
    this.layout.push(".".repeat(this.getColumnCountForRow(this.layout.length)));
  }
};

BubbleGrid.prototype._setCell = function (row, col, color) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new Error("BubbleGrid._setCell requires integer coordinates.");
  }
  if (!this._isLayoutBackedCell(row, col)) {
    if (!this.isTrappedSpriteRescueActive()) {
      throw new Error("BubbleGrid cannot write outside authored layout coordinates.");
    }
    var extendedKey = keyFor(row, col);
    if (color === ".") {
      delete this._rescueExtendedNormalCellMap[extendedKey];
    } else {
      this._rescueExtendedNormalCellMap[extendedKey] = {
        row: row,
        col: col,
        color: color
      };
    }
    return;
  }
  this._ensureRow(row);
  var normalizedRow = this._normalizeRowString(row, this.layout[row]);
  var chars = normalizedRow.split("");
  chars[col] = color;
  this.layout[row] = chars.join("");
};

BubbleGrid.prototype._clearSpecialCell = function (row, col) {
  delete this._specialCellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getSpecialEntities = function () {
  var cellEntities = Object.keys(this._specialCellMap).map(function (key) {
    return clone(this._specialCellMap[key]);
  }, this);
  var wormholes = Object.keys(this._wormholeMap).map(function (key) {
    return clone(this._wormholeMap[key]);
  }, this);
  return cellEntities.concat(wormholes);
};

BubbleGrid.prototype.getRowCount = function () {
  return this.layout.length;
};

BubbleGrid.prototype.getCells = function () {
  return clone(this.cells);
};

BubbleGrid.prototype.getClearableCells = function () {
  return clone(this.cells);
};

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

BubbleGrid.prototype.getMaxColumns = function () {
  return this.maxColumns;
};

BubbleGrid.prototype.getViewportOffsetY = function () {
  return this._requireViewportOffsetY();
};

BubbleGrid.prototype.getCell = function (row, col) {
  var cell = this._cellMap[keyFor(row, col)];
  return cell ? clone(cell) : null;
};

BubbleGrid.prototype.hasCell = function (row, col) {
  return !!this._cellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getCellPosition = function (row, col) {
  if (this.isTrappedSpriteRescueActive()) {
    return this.trappedSpriteRescueSystem.getCellWorldPosition(row, col, this.maxColumns);
  }
  return BoardLayout.getCellPosition(row, col, this.maxColumns, this._requireViewportOffsetY());
};

BubbleGrid.prototype.notifyWorldTransformChanged = function () {
  if (!this.isTrappedSpriteRescueActive()) {
    throw new Error("BubbleGrid world transform changes are only valid in trapped sprite rescue mode.");
  }
  this.version += 1;
};

BubbleGrid.prototype.getNeighborCoordinates = function (row, col) {
  var offsets = row % 2 !== 0 ? [
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
    return this.isValidCell(candidate.row, candidate.col);
  }, this);
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
  for (var col = leftWormhole.col + 1; col < rightWormhole.col; col += 1) {
    if (!this.isValidCell(leftWormhole.row, col)) {
      throw new Error("BubbleGrid wormhole interior contains an invalid cell.");
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
    throw new Error("BubbleGrid wormhole shift changed the number of occupied interior cells.");
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

BubbleGrid.prototype.getNeighborCells = function (row, col) {
  return this.getNeighborCoordinates(row, col).map(function (candidate) {
    return this.getCell(candidate.row, candidate.col);
  }, this).filter(Boolean);
};

BubbleGrid.prototype.getOccupiedNeighborCount = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (count, neighbor) {
    return count + (this.hasCell(neighbor.row, neighbor.col) ? 1 : 0);
  }.bind(this), 0);
};


BubbleGrid.prototype.getOccupiedNeighborStats = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (stats, neighbor) {
    if (!this.hasCell(neighbor.row, neighbor.col)) {
      return stats;
    }

    stats.total += 1;
    if (neighbor.row < row) {
      stats.upper += 1;
    } else if (neighbor.row === row) {
      stats.same += 1;
    } else {
      stats.lower += 1;
    }

    return stats;
  }.bind(this), {
    total: 0,
    upper: 0,
    same: 0,
    lower: 0
  });
};

BubbleGrid.prototype.isAttachableCell = function (row, col, direction, options) {
  options = options || {};

  if (!this.isValidCell(row, col) || this.hasCell(row, col)) {
    return false;
  }
  if (
    this.isTrappedSpriteRescueActive() &&
    this.trappedSpriteRescueSystem.isReservedCell(row, col)
  ) {
    return false;
  }

  if (row === 0) {
    if (this.isTrappedSpriteRescueActive()) {
      return false;
    }
    return options.allowTopRow !== false;
  }

  var minOccupiedNeighbors = typeof options.minOccupiedNeighbors === "number"
    ? Math.max(1, Math.floor(options.minOccupiedNeighbors))
    : 1;
  var minUpperOccupiedNeighbors = typeof options.minUpperOccupiedNeighbors === "number"
    ? Math.max(0, Math.floor(options.minUpperOccupiedNeighbors))
    : 0;
  var occupiedStats = this.getOccupiedNeighborStats(row, col);

  if (occupiedStats.total < minOccupiedNeighbors) {
    return false;
  }

  if (occupiedStats.upper < minUpperOccupiedNeighbors) {
    return false;
  }

  return this._isAttachmentCandidateReachable({ row: row, col: col }, direction || { x: 0, y: 1 });
};

BubbleGrid.prototype.findFirstAttachableSlotOnSegment = function (startPoint, endPoint, direction, slotProbeRadius, slotCaptureTightness) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);
  if (a <= EPSILON) {
    return null;
  }

  var radius = typeof slotProbeRadius === "number"
    ? slotProbeRadius
    : Math.max(10, BoardLayout.bubbleRadius * 0.62);
  var captureTightness = typeof slotCaptureTightness === "number"
    ? clamp(slotCaptureTightness, 0.45, 1)
    : 0.78;
  var captureRadius = radius * captureTightness;
  var captureRadiusSq = captureRadius * captureRadius;
  var minEntryAlignment = this.levelConfig &&
    this.levelConfig.level &&
    typeof this.levelConfig.level.aimSlotOpenMinAlignment === "number"
    ? clamp(this.levelConfig.level.aimSlotOpenMinAlignment, -0.2, 0.95)
    : 0.2;

  var slotPaddingRows = Math.ceil(radius / BoardLayout.rowHeight) + 2;
  // Rotated rescue boards no longer have screen-space rows.  Scan the
  // authoritative grid coordinates and evaluate each slot in world space,
  // otherwise a real opening can be hidden behind the first nearby bubble.
  var rowBounds = this.isTrappedSpriteRescueActive()
    ? { minRow: 0, maxRow: this.getRowCount() - 1 }
    : this._resolveSegmentRowBounds(startPoint, endPoint, slotPaddingRows);
  var best = null;

  for (var row = rowBounds.minRow; row <= rowBounds.maxRow; row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (!this.isAttachableCell(row, col, direction, { minOccupiedNeighbors: 2, minUpperOccupiedNeighbors: 1, allowTopRow: true })) {
        continue;
      }

      var center = this.getCellPosition(row, col);
      var toStart = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y
      };
      var b = 2 * dot(segment, toStart);
      var c = dot(toStart, toStart) - radius * radius;
      var discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        continue;
      }

      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }

      if (hitT === null) {
        continue;
      }

      var centerT = clamp(-dot(segment, toStart) / a, 0, 1);
      var closestPoint = {
        x: startPoint.x + segment.x * centerT,
        y: startPoint.y + segment.y * centerT
      };
      var dxClosest = closestPoint.x - center.x;
      var dyClosest = closestPoint.y - center.y;
      var closestDistanceSq = dxClosest * dxClosest + dyClosest * dyClosest;
      if (closestDistanceSq > captureRadiusSq) {
        continue;
      }

      var entryAssessment = this._buildSlotEntryAssessment(row, col, direction || segment, minEntryAlignment);
      if (!entryAssessment.allowed) {
        continue;
      }

      var captureDistanceRatio = 1 - clamp(Math.sqrt(closestDistanceSq) / Math.max(captureRadius, EPSILON), 0, 1);
      var slotConfidence = clamp(
        captureDistanceRatio * 0.45 +
        entryAssessment.alignmentScore * 0.35 +
        entryAssessment.opennessScore * 0.2,
        0,
        1
      );

      if (
        !best ||
        hitT < best.t - EPSILON ||
        (
          Math.abs(hitT - best.t) <= EPSILON &&
          (
            slotConfidence > best.confidence + 0.015 ||
            (
              Math.abs(slotConfidence - best.confidence) <= 0.015 &&
              centerT < best.centerT - EPSILON
            )
          )
        )
      ) {
        best = {
          row: row,
          col: col,
          center: center,
          t: hitT,
          centerT: centerT,
          confidence: slotConfidence,
          entryAlignment: entryAssessment.entryAlignment,
          openNeighborCount: entryAssessment.openNeighborCount,
          point: {
            x: startPoint.x + segment.x * hitT,
            y: startPoint.y + segment.y * hitT
          }
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    cell: { row: best.row, col: best.col },
    point: best.point,
    center: best.center,
    t: best.t,
    confidence: best.confidence,
    entryAlignment: best.entryAlignment,
    openNeighborCount: best.openNeighborCount
  };
};

BubbleGrid.prototype._buildSlotEntryAssessment = function (row, col, incomingDirection, minEntryAlignment) {
  var center = this.getCellPosition(row, col);
  var openNeighbors = this.getNeighborCoordinates(row, col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return {
      allowed: false,
      entryAlignment: -1,
      alignmentScore: 0,
      opennessScore: 0,
      openNeighborCount: 0
    };
  }

  var incoming = normalize(incomingDirection || { x: 0, y: 1 });
  var bestAlignment = -1;

  openNeighbors.forEach(function (neighbor) {
    var neighborPos = this.getCellPosition(neighbor.row, neighbor.col);
    var openDirection = normalize({
      x: center.x - neighborPos.x,
      y: center.y - neighborPos.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, openDirection));
  }, this);

  var threshold = typeof minEntryAlignment === "number" ? minEntryAlignment : 0.2;
  var normalizedAlignment = clamp((bestAlignment - threshold) / Math.max(1 - threshold, EPSILON), 0, 1);
  var opennessScore = clamp(openNeighbors.length / 4, 0, 1);

  return {
    allowed: bestAlignment >= threshold - EPSILON,
    entryAlignment: bestAlignment,
    alignmentScore: normalizedAlignment,
    opennessScore: opennessScore,
    openNeighborCount: openNeighbors.length
  };
};
BubbleGrid.prototype.findCollision = function (point, collisionRadius) {
  var nearest = null;
  var nearestDistance = Number.MAX_VALUE;
  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.collisionDistance;

  this.cells.forEach(function (cell) {
    var cellPosition = this.getCellPosition(cell.row, cell.col);
    var dx = point.x - cellPosition.x;
    var dy = point.y - cellPosition.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius && distance < nearestDistance) {
      nearest = cell;
      nearestDistance = distance;
    }
  }, this);

  return nearest ? clone(nearest) : null;
};

BubbleGrid.prototype.findCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);

  if (a <= EPSILON) {
    var staticCollision = this.findCollision(endPoint, collisionRadius);
    if (!staticCollision) {
      return null;
    }

    var staticCenter = this.getCellPosition(staticCollision.row, staticCollision.col);
    return {
      cell: staticCollision,
      point: clone(endPoint),
      normal: normalize({
        x: endPoint.x - staticCenter.x,
        y: endPoint.y - staticCenter.y
      }),
      t: 1
    };
  }

  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.bubbleDiameter;
  var bestHit = null;
  var paddingRows = this._resolveSegmentPaddingRows(radius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    var candidate = this._testSegmentCircleHit(cell, startPoint, segment, a, radius);
    if (this._shouldReplaceSegmentHit(bestHit, candidate)) {
      bestHit = candidate;
    }
  });

  if (!bestHit) {
    return null;
  }

  return this._buildSegmentCollisionResult(bestHit, startPoint, segment);
};

BubbleGrid.prototype.findTrappedSpriteCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!this.isTrappedSpriteRescueActive()) {
    return null;
  }
  if (!startPoint || !endPoint) {
    throw new Error("Trapped sprite collision requires start and end points.");
  }
  if (!Number.isFinite(collisionRadius) || collisionRadius <= 0) {
    throw new Error("Trapped sprite collision requires positive collisionRadius.");
  }

  var center = this.trappedSpriteRescueSystem.getWorldCenter();
  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    return null;
  }

  var startToCenter = {
    x: startPoint.x - center.x,
    y: startPoint.y - center.y
  };
  var b = 2 * dot(segment, startToCenter);
  var c = dot(startToCenter, startToCenter) - collisionRadius * collisionRadius;
  var discriminant = b * b - 4 * segmentLengthSq * c;
  if (discriminant < 0) {
    return null;
  }

  var sqrtDiscriminant = Math.sqrt(discriminant);
  var t1 = (-b - sqrtDiscriminant) / (2 * segmentLengthSq);
  var t2 = (-b + sqrtDiscriminant) / (2 * segmentLengthSq);
  var hitT = null;
  if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
    hitT = clamp(t1, 0, 1);
  } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
    hitT = clamp(t2, 0, 1);
  }
  if (hitT === null) {
    return null;
  }

  var hitPoint = {
    x: startPoint.x + segment.x * hitT,
    y: startPoint.y + segment.y * hitT
  };
  var hitNormal = normalize({
    x: hitPoint.x - center.x,
    y: hitPoint.y - center.y
  });
  if (Math.abs(hitNormal.x) <= 0.0001 && Math.abs(hitNormal.y) <= 0.0001) {
    throw new Error("Trapped sprite collision normal cannot be zero.");
  }

  return {
    point: hitPoint,
    normal: hitNormal,
    center: center,
    t: hitT
  };
};

BubbleGrid.prototype.findCollisionsOnSegmentForRadii = function (startPoint, endPoint, radii) {
  if (!startPoint || !endPoint) {
    return null;
  }
  if (!Array.isArray(radii) || !radii.length) {
    throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires non-empty radii.");
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    var staticHits = {};
    radii.forEach(function (radiusValue) {
      var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
      var staticCollision = this.findCollision(endPoint, radius);
      staticHits[radius] = staticCollision ? {
        cell: staticCollision,
        point: clone(endPoint),
        normal: normalize({
          x: endPoint.x - this.getCellPosition(staticCollision.row, staticCollision.col).x,
          y: endPoint.y - this.getCellPosition(staticCollision.row, staticCollision.col).y
        }),
        t: 1
      } : null;
    }, this);
    return staticHits;
  }

  var uniqueRadii = [];
  var maxRadius = 0;
  radii.forEach(function (radiusValue) {
    var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires positive radius.");
    }
    if (uniqueRadii.indexOf(radius) === -1) {
      uniqueRadii.push(radius);
    }
    if (radius > maxRadius) {
      maxRadius = radius;
    }
  });

  var bestHits = {};
  uniqueRadii.forEach(function (radius) {
    bestHits[radius] = null;
  });
  var paddingRows = this._resolveSegmentPaddingRows(maxRadius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    uniqueRadii.forEach(function (radius) {
      var candidate = this._testSegmentCircleHit(cell, startPoint, segment, segmentLengthSq, radius);
      if (this._shouldReplaceSegmentHit(bestHits[radius], candidate)) {
        bestHits[radius] = candidate;
      }
    }, this);
  });

  var results = {};
  uniqueRadii.forEach(function (radius) {
    var bestHit = bestHits[radius];
    results[radius] = bestHit ? this._buildSegmentCollisionResult(bestHit, startPoint, segment) : null;
  }, this);
  return results;
};

BubbleGrid.prototype.findAttachmentCell = function (point, collidedCell, direction, previousPoint) {
  if (!collidedCell) {
    if (this.isTrappedSpriteRescueActive()) {
      return null;
    }
    return this._findTopSlot(point.x);
  }

  var incomingDirection = direction || { x: 0, y: 1 };
  var candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
    if (this.hasCell(candidate.row, candidate.col)) {
      return false;
    }
    if (
      this.isTrappedSpriteRescueActive() &&
      this.trappedSpriteRescueSystem.isReservedCell(candidate.row, candidate.col)
    ) {
      return false;
    }

    return this._isAttachmentCandidateReachable(candidate, incomingDirection);
  }, this);

  if (!candidates.length) {
    candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
      return !this.hasCell(candidate.row, candidate.col) && !(
        this.isTrappedSpriteRescueActive() &&
        this.trappedSpriteRescueSystem.isReservedCell(candidate.row, candidate.col)
      );
    }, this);
  }

  if (!candidates.length) {
    if (this.isTrappedSpriteRescueActive()) {
      return null;
    }
    return this._findTopSlot(point.x);
  }

  var collidedPosition = this.getCellPosition(collidedCell.row, collidedCell.col);
  var contact = this._resolveAttachmentContact(
    previousPoint || point,
    point,
    collidedPosition,
    incomingDirection
  );

  candidates.sort(function (a, b) {
    var posA = this.getCellPosition(a.row, a.col);
    var posB = this.getCellPosition(b.row, b.col);
    var scoreA = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posA);
    var scoreB = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posB);
    return scoreA - scoreB;
  }.bind(this));

  return candidates[0];
};

BubbleGrid.prototype.findTrappedSpriteAttachmentCell = function (point, direction, previousPoint) {
  if (!this.isTrappedSpriteRescueActive()) {
    throw new Error("Trapped sprite attachment requires active trapped sprite rescue mode.");
  }
  var anchorCell = this.trappedSpriteRescueSystem.getAnchorCell();
  return this.findAttachmentCell(
    point,
    anchorCell,
    direction || { x: 0, y: 1 },
    previousPoint || point
  );
};

BubbleGrid.prototype._isAttachmentCandidateReachable = function (candidate, direction) {
  var openNeighbors = this.getNeighborCoordinates(candidate.row, candidate.col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return false;
  }

  var incoming = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var candidatePosition = this.getCellPosition(candidate.row, candidate.col);
  var bestAlignment = -1;

  openNeighbors.forEach(function (openNeighbor) {
    var openPosition = this.getCellPosition(openNeighbor.row, openNeighbor.col);
    var escapeVector = normalize({
      x: openPosition.x - candidatePosition.x,
      y: openPosition.y - candidatePosition.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, escapeVector));
  }, this);

  return bestAlignment > -0.05;
};

BubbleGrid.prototype._resolveAttachmentContact = function (previousPoint, currentPoint, collidedPosition, direction) {
  var start = previousPoint || currentPoint;
  var end = currentPoint || previousPoint;
  var fallbackNormal = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var segment = {
    x: end.x - start.x,
    y: end.y - start.y
  };
  var radius = BoardLayout.bubbleDiameter;
  var a = dot(segment, segment);
  var contactPoint = null;

  if (a > 0) {
    var toStart = {
      x: start.x - collidedPosition.x,
      y: start.y - collidedPosition.y
    };
    var b = 2 * dot(segment, toStart);
    var c = dot(toStart, toStart) - radius * radius;
    var discriminant = b * b - 4 * a * c;

    if (discriminant >= 0) {
      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= 0 && t1 <= 1) {
        hitT = t1;
      } else if (t2 >= 0 && t2 <= 1) {
        hitT = t2;
      }

      if (hitT !== null) {
        contactPoint = {
          x: start.x + segment.x * hitT,
          y: start.y + segment.y * hitT
        };
      }
    }
  }

  if (!contactPoint) {
    var closestT = a > 0 ? clamp(dot({
      x: collidedPosition.x - start.x,
      y: collidedPosition.y - start.y
    }, segment) / a, 0, 1) : 0;
    var closestPoint = {
      x: start.x + segment.x * closestT,
      y: start.y + segment.y * closestT
    };
    var fallbackFromSegment = normalize({
      x: closestPoint.x - collidedPosition.x,
      y: closestPoint.y - collidedPosition.y
    });
    var resolvedNormal = (Math.abs(fallbackFromSegment.x) > 0.0001 || Math.abs(fallbackFromSegment.y) > 0.0001)
      ? fallbackFromSegment
      : fallbackNormal;

    contactPoint = {
      x: collidedPosition.x + resolvedNormal.x * radius,
      y: collidedPosition.y + resolvedNormal.y * radius
    };
  }

  var contactNormal = normalize({
    x: contactPoint.x - collidedPosition.x,
    y: contactPoint.y - collidedPosition.y
  });

  if (Math.abs(contactNormal.x) <= 0.0001 && Math.abs(contactNormal.y) <= 0.0001) {
    contactNormal = fallbackNormal;
  }

  return {
    point: contactPoint,
    normal: contactNormal
  };
};

BubbleGrid.prototype._measureAttachmentScore = function (contactPoint, contactNormal, collidedPosition, candidatePosition) {
  var candidateVector = normalize({
    x: candidatePosition.x - collidedPosition.x,
    y: candidatePosition.y - collidedPosition.y
  });
  var alignment = clamp(dot(contactNormal, candidateVector), -1, 1);
  var alignmentPenalty = (1 - alignment) * 420;
  var reversePenalty = alignment < -0.2 ? 40000 : 0;
  var dxContact = contactPoint.x - candidatePosition.x;
  var dyContact = contactPoint.y - candidatePosition.y;
  var distancePenalty = dxContact * dxContact + dyContact * dyContact;
  return distancePenalty + alignmentPenalty + reversePenalty;
};

BubbleGrid.prototype._findTopSlot = function (impactX) {
  var row = 0;
  var bestCol = 0;
  var bestDistance = Number.MAX_VALUE;

  for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
    if (this.hasCell(row, col)) {
      continue;
    }

    var pos = this.getCellPosition(row, col);
    var distance = Math.abs(impactX - pos.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCol = col;
    }
  }

  if (bestDistance < Number.MAX_VALUE) {
    return { row: row, col: bestCol };
  }

  var fallbackRow = this.getRowCount();
  var fallbackColumns = this.getColumnCountForRow(fallbackRow);
  var fallbackBaseX = this.getCellPosition(fallbackRow, 0).x;

  return {
    row: fallbackRow,
    col: Math.max(0, Math.min(fallbackColumns - 1, Math.round((impactX - fallbackBaseX) / BoardLayout.cellWidth)))
  };
};

BubbleGrid.prototype.getCoordinatesWithinRadius = function (row, col, radius) {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error("BubbleGrid.getCoordinatesWithinRadius requires a non-negative integer radius.");
  }

  var visited = {};
  var queue = [{
    row: row,
    col: col,
    distance: 0
  }];
  var result = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = keyFor(current.row, current.col);
    if (visited[key]) {
      continue;
    }
    visited[key] = true;
    result.push({
      row: current.row,
      col: current.col,
      distance: current.distance
    });
    if (current.distance >= radius) {
      continue;
    }
    this.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (!visited[neighborKey]) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col,
          distance: current.distance + 1
        });
      }
    });
  }

  return result;
};

BubbleGrid.prototype.findSplitterSpawnCell = function (splitterCell) {
  if (!splitterCell || !Number.isInteger(splitterCell.row) || !Number.isInteger(splitterCell.col)) {
    throw new Error("BubbleGrid.findSplitterSpawnCell requires splitter cell coordinates.");
  }

  var candidates = [];
  for (var row = 0; row < this.getRowCount(); row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (this.isAttachableCell(row, col, { x: 0, y: 1 }, { allowTopRow: true })) {
        candidates.push({
          row: row,
          col: col
        });
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
};

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

module.exports = BubbleGrid;






















