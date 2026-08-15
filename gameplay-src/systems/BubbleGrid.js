"use strict";

var attachBubbleGridSpecialEntityMethods = require("./BubbleGridSpecialEntityMethods");
var attachBubbleGridCollisionMethods = require("./BubbleGridCollisionMethods");
var attachBubbleGridMutationMethods = require("./BubbleGridMutationMethods");

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

function isBlackHoleCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "hazard_ball" &&
    cell.entityType === "black_hole"
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
    capacity: isBlackHoleCell(entity) ? entity.capacity : null,
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
  if (isBlackHoleCell(entity) && (!Number.isInteger(record.capacity) || record.capacity < 1 || record.capacity > 3)) {
    throw new Error("Black hole special entity runtime capacity must be in [1, 3].");
  }
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
  this._spiritMistExpiryByCell = {};
  this._poisonAttachmentByCell = {};
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

BubbleGrid.prototype.isTrappedSpiritReservedCell = function (row, col) {
  return !!(
    this.trappedSpriteRescueSystem &&
    typeof this.trappedSpriteRescueSystem.isReservedCell === "function" &&
    this.trappedSpriteRescueSystem.isReservedCell(row, col)
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
  this._spiritMistExpiryByCell = {};
  this._poisonAttachmentByCell = {};
  var cellAttachments = levelConfig.level.cellAttachments;
  if (cellAttachments === undefined) {
    cellAttachments = [];
  } else if (!Array.isArray(cellAttachments)) {
    throw new Error("BubbleGrid level.cellAttachments must be an array when configured.");
  }
  cellAttachments.forEach(function (attachment, index) {
    if (
      !attachment ||
      attachment.type !== "poison" ||
      typeof attachment.id !== "string" ||
      !attachment.id ||
      !Number.isInteger(attachment.row) ||
      !Number.isInteger(attachment.col) ||
      attachment.particleCount !== 3
    ) {
      throw new Error("BubbleGrid poison attachment is invalid at index " + index + ".");
    }
    var coordinateKey = keyFor(attachment.row, attachment.col);
    if (Object.prototype.hasOwnProperty.call(this._poisonAttachmentByCell, coordinateKey)) {
      throw new Error("BubbleGrid poison attachment target is duplicated: " + coordinateKey + ".");
    }
    if (this.layout[attachment.row].charAt(attachment.col) === ".") {
      throw new Error("BubbleGrid poison attachment target must be an ordinary ball: " + coordinateKey + ".");
    }
    this._poisonAttachmentByCell[coordinateKey] = clone(attachment);
  }, this);
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
      if (this.layout[entity.row].charAt(entity.col) !== ".") {
        throw new Error("BubbleGrid wormhole endpoint must reserve an empty layout slot at " + entityKey + ".");
      }
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
    spiritMistExpiresAfterShot: Object.prototype.hasOwnProperty.call(this._spiritMistExpiryByCell, cellKey)
      ? this._spiritMistExpiryByCell[cellKey]
      : null,
    poisonAttachmentId: Object.prototype.hasOwnProperty.call(this._poisonAttachmentByCell, cellKey)
      ? this._poisonAttachmentByCell[cellKey].id
      : null,
    poisonParticleCount: Object.prototype.hasOwnProperty.call(this._poisonAttachmentByCell, cellKey)
      ? this._poisonAttachmentByCell[cellKey].particleCount
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
    capacity: isBlackHoleCell(entity) ? entity.capacity : null,
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
  if (isBlackHoleCell(entity) && (!Number.isInteger(cell.capacity) || cell.capacity < 1 || cell.capacity > 3)) {
    throw new Error("Black hole runtime capacity must be in [1, 3].");
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

BubbleGrid.prototype.getWormholes = function () {
  return Object.keys(this._wormholeMap).map(function (key) {
    return clone(this._wormholeMap[key]);
  }, this).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    return left.col - right.col;
  });
};

BubbleGrid.prototype.hasWormholeAt = function (row, col) {
  return Object.prototype.hasOwnProperty.call(this._wormholeMap, keyFor(row, col));
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

var BUBBLE_GRID_METHOD_CONTEXT = {
  BaseSystem: BaseSystem,
  BoardLayout: BoardLayout,
  DebugFlags: DebugFlags,
  EPSILON: EPSILON,
  MIN_VISUAL_CELL_DISTANCE: MIN_VISUAL_CELL_DISTANCE,
  VINE_SPIRIT_MAX_HEALTH: VINE_SPIRIT_MAX_HEALTH,
  assertNoDuplicateCellCoordinates: assertNoDuplicateCellCoordinates,
  buildColorCountSignature: buildColorCountSignature,
  clamp: clamp,
  clone: clone,
  createSpecialEntityRecord: createSpecialEntityRecord,
  dot: dot,
  isVineProtectedCell: isVineProtectedCell,
  isVineSpiritCell: isVineSpiritCell,
  isBlackHoleCell: isBlackHoleCell,
  keyFor: keyFor,
  normalize: normalize
};
attachBubbleGridSpecialEntityMethods(BubbleGrid, BUBBLE_GRID_METHOD_CONTEXT);
attachBubbleGridCollisionMethods(BubbleGrid, BUBBLE_GRID_METHOD_CONTEXT);
attachBubbleGridMutationMethods(BubbleGrid, BUBBLE_GRID_METHOD_CONTEXT);

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

module.exports = BubbleGrid;

