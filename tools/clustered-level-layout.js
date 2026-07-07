"use strict";

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelBoardSupportValidator = require("../assets/scripts/config/LevelBoardSupportValidator");

var REDESIGN_LEVEL_IDS = [];
for (var redesignLevelId = 1; redesignLevelId <= 1000; redesignLevelId += 1) {
  REDESIGN_LEVEL_IDS.push(redesignLevelId);
}
var REDESIGN_LEVEL_ID_MAP = {};
var ADJACENCY_DISTANCE = BoardLayout.bubbleDiameter + 8;
var MIN_OCCUPIED_LAYOUT_ROWS = 8;
var FIRST_AESTHETIC_LEVEL_ID = 101;

REDESIGN_LEVEL_IDS.forEach(function (levelId) {
  REDESIGN_LEVEL_ID_MAP[levelId] = true;
});

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
}

function shouldRedesign(levelId) {
  return REDESIGN_LEVEL_ID_MAP[levelId] === true;
}

function getCellPosition(cell) {
  return BoardLayout.getCellPosition(cell.row, cell.col, BoardLayout.defaultColumns, 0);
}

function areAdjacent(cellA, cellB) {
  var positionA = getCellPosition(cellA);
  var positionB = getCellPosition(cellB);
  var dx = positionA.x - positionB.x;
  var dy = positionA.y - positionB.y;
  return Math.sqrt(dx * dx + dy * dy) < ADJACENCY_DISTANCE;
}

function buildSpecialCellMap(specialEntities, rows, levelId) {
  if (!Array.isArray(specialEntities)) {
    throw new Error("Level " + levelId + " specialEntities must be an array.");
  }
  var specialCells = {};
  specialEntities.forEach(function (entity, index) {
    assertObject(entity, "Level " + levelId + " special entity " + index);
    var row = requireNonNegativeInteger(entity.row, "Level " + levelId + " special entity row");
    var col = requireNonNegativeInteger(entity.col, "Level " + levelId + " special entity col");
    if (row >= rows.length || col >= rows[row].length) {
      throw new Error("Level " + levelId + " special entity cell is outside layout: " + row + ":" + col);
    }
    var key = row + ":" + col;
    if (specialCells[key]) {
      throw new Error("Level " + levelId + " has duplicated special entity cell: " + key);
    }
    specialCells[key] = true;
  });
  return specialCells;
}

function normalizeRows(rawRows, levelId) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error("Level " + levelId + " layout rows must be a non-empty array.");
  }
  return rawRows.map(function (row, rowIndex) {
    requireNonEmptyString(row, "Level " + levelId + " layout row " + rowIndex);
    var expectedColumns = BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
    if (row.length !== expectedColumns) {
      throw new Error(
        "Level " + levelId + " layout row " + rowIndex +
        " must contain " + expectedColumns + " cells."
      );
    }
    return row;
  });
}

function makeEmptyRow(rowIndex) {
  return ".".repeat(BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns));
}

function getAestheticMinimumRows(levelId) {
  if (levelId >= 400) {
    return 13;
  }
  if (levelId >= 300) {
    return 12;
  }
  if (levelId >= 200) {
    return 11;
  }
  return 10;
}

function ensureAestheticRows(rows, levelId) {
  var nextRows = rows.slice();
  var minimumRows = getAestheticMinimumRows(levelId);
  while (nextRows.length < minimumRows) {
    nextRows.push(makeEmptyRow(nextRows.length));
  }
  return nextRows;
}

function getNormalizedCoordinates(cell, rows) {
  var rowLength = rows[cell.row].length;
  var x = rowLength === 1 ? 0 : (cell.col / (rowLength - 1)) * 2 - 1;
  var y = rows.length === 1 ? 0 : (cell.row / (rows.length - 1)) * 2 - 1;
  return { x: x, y: y };
}

function scoreAestheticCell(cell, rows, levelId, shapeMode) {
  var coordinates = getNormalizedCoordinates(cell, rows);
  var x = levelId % 2 === 0 ? -coordinates.x : coordinates.x;
  var y = coordinates.y;
  var score;
  if (shapeMode === 0) {
    score = Math.abs(x) * 5 + Math.abs(y) * 3 + Math.max(0, Math.abs(x) + Math.abs(y) * 0.72 - 0.92) * 18;
  } else if (shapeMode === 1) {
    score = Math.abs(Math.abs(x) - (0.28 + Math.abs(y) * 0.42)) * 9 + Math.abs(y) * 2.2;
  } else if (shapeMode === 2) {
    score = Math.abs(x) * (3.2 + Math.abs(y) * 5.5) + Math.abs(y) * 2.4;
  } else if (shapeMode === 3) {
    score = Math.abs(Math.abs(x) - 0.58) * 7 + Math.max(0, 0.2 - Math.abs(x)) * 14 + Math.abs(y) * 1.7;
  } else if (shapeMode === 4) {
    score = Math.abs(x - y * 0.62) * 6 + Math.abs(x + y * 0.62) * 2 + Math.abs(y) * 1.8;
  } else if (shapeMode === 5) {
    score = Math.abs(x + y * 0.62) * 6 + Math.abs(x - y * 0.62) * 2 + Math.abs(y) * 1.8;
  } else if (shapeMode === 6) {
    score = Math.abs(Math.abs(x) + Math.abs(y) * 0.52 - 0.62) * 9 + Math.abs(y) * 1.4;
  } else if (shapeMode === 7) {
    score = Math.abs(x) * 3 + Math.abs(Math.sin((y + 1) * Math.PI) * 0.44 - Math.abs(x)) * 6 + Math.abs(y) * 1.6;
  } else {
    throw new Error("Unsupported aesthetic shape mode: " + shapeMode);
  }
  return score + cell.row * 0.0001 + cell.col * 0.00001;
}

function collectAllCells(rows) {
  var cells = [];
  rows.forEach(function (row, rowIndex) {
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      cells.push({ row: rowIndex, col: colIndex });
    }
  });
  return cells;
}

function pushSelectedCell(selected, selectedMap, cell) {
  var key = cell.row + ":" + cell.col;
  if (selectedMap[key]) {
    return;
  }
  selectedMap[key] = true;
  selected.push(cell);
}

function buildAestheticSelectedSlots(rows, specialCells, normalCount, levelId, shapeMode) {
  var allCells = collectAllCells(rows);
  var specialKeys = Object.keys(specialCells);
  var occupiedCount = normalCount + specialKeys.length;
  var selected = [];
  var selectedMap = {};

  allCells.forEach(function (cell) {
    if (cell.row === 0 || specialCells[cell.row + ":" + cell.col]) {
      pushSelectedCell(selected, selectedMap, cell);
    }
  });
  if (selected.length > occupiedCount) {
    throw new Error("Level " + levelId + " aesthetic occupied count cannot cover required top row and specials.");
  }

  var requiredRows = Math.min(getAestheticMinimumRows(levelId), rows.length);
  for (var requiredRow = 1; requiredRow < requiredRows; requiredRow += 1) {
    var rowHasSelection = selected.some(function (cell) {
      return cell.row === requiredRow;
    });
    if (rowHasSelection) {
      continue;
    }
    var rowCandidates = allCells.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      return cell.row === requiredRow && !selectedMap[key] && selected.some(function (selectedCell) {
        return areAdjacent(cell, selectedCell);
      });
    });
    if (rowCandidates.length === 0) {
      throw new Error("Level " + levelId + " aesthetic shape cannot reach row " + requiredRow + ".");
    }
    rowCandidates.sort(function (cellA, cellB) {
      return scoreAestheticCell(cellA, rows, levelId, shapeMode) -
        scoreAestheticCell(cellB, rows, levelId, shapeMode);
    });
    pushSelectedCell(selected, selectedMap, rowCandidates[0]);
  }

  while (selected.length < occupiedCount) {
    var frontier = allCells.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (selectedMap[key]) {
        return false;
      }
      return selected.some(function (selectedCell) {
        return areAdjacent(cell, selectedCell);
      });
    });
    if (frontier.length === 0) {
      throw new Error("Level " + levelId + " aesthetic shape frontier exhausted.");
    }
    frontier.sort(function (cellA, cellB) {
      return scoreAestheticCell(cellA, rows, levelId, shapeMode) -
        scoreAestheticCell(cellB, rows, levelId, shapeMode);
    });
    pushSelectedCell(selected, selectedMap, frontier[0]);
  }

  return selected.filter(function (cell) {
    return specialCells[cell.row + ":" + cell.col] !== true;
  }).sort(function (cellA, cellB) {
    if (cellA.row !== cellB.row) {
      return cellA.row - cellB.row;
    }
    return cellA.col - cellB.col;
  });
}

function normalizeColors(rawColors, levelId) {
  if (!Array.isArray(rawColors) || rawColors.length === 0) {
    throw new Error("Level " + levelId + " colors must be a non-empty array.");
  }
  var seen = {};
  return rawColors.map(function (color, index) {
    var normalized = requireNonEmptyString(color, "Level " + levelId + " color " + index);
    if (seen[normalized]) {
      throw new Error("Level " + levelId + " contains duplicated color: " + normalized);
    }
    seen[normalized] = true;
    return normalized;
  });
}

function normalizeColorCounts(rawCounts, colors, levelId) {
  assertObject(rawCounts, "Level " + levelId + " colorCounts");
  var counts = {};
  var total = 0;
  colors.forEach(function (color) {
    var count = requireNonNegativeInteger(rawCounts[color], "Level " + levelId + " color count " + color);
    counts[color] = count;
    total += count;
  });
  Object.keys(rawCounts).forEach(function (color) {
    if (colors.indexOf(color) < 0 && rawCounts[color] !== 0) {
      throw new Error("Level " + levelId + " has count for inactive color: " + color);
    }
  });
  if (total <= 0) {
    throw new Error("Level " + levelId + " clustered layout requires normal balls.");
  }
  return {
    counts: counts,
    total: total
  };
}

function collectLayoutSlots(rows, colors, colorCounts, specialCells, levelId) {
  var occupiedSlots = [];
  var availableSlots = [];
  var observedCounts = {};
  colors.forEach(function (color) {
    observedCounts[color] = 0;
  });

  rows.forEach(function (row, rowIndex) {
    row.split("").forEach(function (cellValue, colIndex) {
      var key = rowIndex + ":" + colIndex;
      if (!specialCells[key]) {
        availableSlots.push({ row: rowIndex, col: colIndex });
      }
      if (cellValue === ".") {
        return;
      }
      if (specialCells[key]) {
        throw new Error("Level " + levelId + " normal ball overlaps special entity: " + key);
      }
      if (colors.indexOf(cellValue) < 0) {
        throw new Error("Level " + levelId + " layout contains inactive color: " + cellValue);
      }
      observedCounts[cellValue] += 1;
      occupiedSlots.push({ row: rowIndex, col: colIndex });
    });
  });

  var expectedTotal = Object.keys(colorCounts).reduce(function (sum, color) {
    return sum + colorCounts[color];
  }, 0);
  if (occupiedSlots.length === 0) {
    if (availableSlots.length < expectedTotal) {
      throw new Error("Level " + levelId + " color counts exceed available layout slots.");
    }
    return availableSlots.slice(0, expectedTotal);
  }
  if (occupiedSlots.length !== expectedTotal) {
    throw new Error("Level " + levelId + " occupied slot count does not match color counts.");
  }
  colors.forEach(function (color) {
    if (observedCounts[color] !== colorCounts[color]) {
      throw new Error("Level " + levelId + " layout count mismatch for color " + color + ".");
    }
  });
  return occupiedSlots;
}

function countOccupiedRows(rows, specialCells) {
  var occupiedRows = {};
  rows.forEach(function (row, rowIndex) {
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (row.charAt(colIndex) !== ".") {
        occupiedRows[rowIndex] = true;
        break;
      }
    }
  });
  Object.keys(specialCells).forEach(function (cellKey) {
    var row = Number(cellKey.split(":")[0]);
    if (Number.isInteger(row)) {
      occupiedRows[row] = true;
    }
  });
  return Object.keys(occupiedRows).length;
}

function splitIntoBalancedChunks(count, targetChunkSize) {
  if (count === 0) {
    return [];
  }
  var chunkCount = Math.max(1, Math.round(count / targetChunkSize));
  while (chunkCount > 1 && Math.floor(count / chunkCount) < 3) {
    chunkCount -= 1;
  }
  var baseSize = Math.floor(count / chunkCount);
  var remainder = count % chunkCount;
  var chunks = [];
  for (var index = 0; index < chunkCount; index += 1) {
    chunks.push(baseSize + (index < remainder ? 1 : 0));
  }
  return chunks;
}

function buildColorChunks(colors, colorCounts, targetChunkSize, rotation, reversed) {
  var orderedColors = colors.slice();
  if (reversed) {
    orderedColors.reverse();
  }
  orderedColors = orderedColors.slice(rotation).concat(orderedColors.slice(0, rotation));
  var chunkQueues = {};
  orderedColors.forEach(function (color) {
    chunkQueues[color] = splitIntoBalancedChunks(colorCounts[color], targetChunkSize);
  });

  var chunks = [];
  while (orderedColors.some(function (color) { return chunkQueues[color].length > 0; })) {
    orderedColors.forEach(function (color) {
      if (chunkQueues[color].length > 0) {
        chunks.push({
          color: color,
          count: chunkQueues[color].shift()
        });
      }
    });
    orderedColors.push(orderedColors.shift());
  }
  return chunks;
}

function buildTargetFirstColorChunks(colors, colorCounts, targetColor, targetChunkSize, rotation, reversed) {
  var remainingCounts = {};
  colors.forEach(function (color) {
    remainingCounts[color] = colorCounts[color];
  });
  var chunks = [];
  if (remainingCounts[targetColor] > 0) {
    chunks.push({
      color: targetColor,
      count: remainingCounts[targetColor]
    });
    remainingCounts[targetColor] = 0;
  }
  return chunks.concat(buildColorChunks(colors, remainingCounts, targetChunkSize, rotation, reversed));
}

function orderSlots(slots, mode, flip, rows) {
  var ordered = slots.slice();
  if (mode === 6 || mode === 7) {
    return orderSlotsByAdjacency(ordered, flip, mode === 7);
  }
  if (mode === 8 || mode === 9) {
    return orderSlotsByComponents(ordered, flip, mode === 9);
  }
  ordered.sort(function (cellA, cellB) {
    if (mode === 0) {
      if (cellA.row !== cellB.row) {
        return cellA.row - cellB.row;
      }
      return (cellA.row + flip) % 2 === 0
        ? cellA.col - cellB.col
        : cellB.col - cellA.col;
    }
    if (cellA.col !== cellB.col) {
      return cellA.col - cellB.col;
    }
    return (cellA.col + flip) % 2 === 0
      ? cellA.row - cellB.row
      : cellB.row - cellA.row;
  });
  if (mode >= 2) {
    ordered.sort(function (cellA, cellB) {
      var coordA = getNormalizedCoordinates(cellA, rows);
      var coordB = getNormalizedCoordinates(cellB, rows);
      if (mode === 2) {
        var diagonalA = cellA.row + cellA.col;
        var diagonalB = cellB.row + cellB.col;
        if (diagonalA !== diagonalB) {
          return flip === 0 ? diagonalA - diagonalB : diagonalB - diagonalA;
        }
        return cellA.row - cellB.row;
      }
      if (mode === 3) {
        var antiA = cellA.row - cellA.col;
        var antiB = cellB.row - cellB.col;
        if (antiA !== antiB) {
          return flip === 0 ? antiA - antiB : antiB - antiA;
        }
        return cellA.row - cellB.row;
      }
      if (mode === 4) {
        var radiusA = Math.abs(coordA.x) + Math.abs(coordA.y);
        var radiusB = Math.abs(coordB.x) + Math.abs(coordB.y);
        if (radiusA !== radiusB) {
          return flip === 0 ? radiusA - radiusB : radiusB - radiusA;
        }
        return coordA.x - coordB.x;
      }
      var bandA = Math.round(Math.abs(coordA.x) * 100);
      var bandB = Math.round(Math.abs(coordB.x) * 100);
      if (bandA !== bandB) {
        return flip === 0 ? bandA - bandB : bandB - bandA;
      }
      return cellA.row - cellB.row;
    });
  }
  if (mode < 0 || mode > 9) {
    throw new Error("Unsupported clustered slot order mode: " + mode);
  }
  return ordered;
}

function getCellDistance(cellA, cellB) {
  var positionA = getCellPosition(cellA);
  var positionB = getCellPosition(cellB);
  var dx = positionA.x - positionB.x;
  var dy = positionA.y - positionB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function orderSlotsByAdjacency(slots, flip, reversed) {
  var remaining = slots.slice().sort(function (cellA, cellB) {
    if (cellA.row !== cellB.row) {
      return reversed ? cellB.row - cellA.row : cellA.row - cellB.row;
    }
    return flip === 0 ? cellA.col - cellB.col : cellB.col - cellA.col;
  });
  var ordered = [];
  var current = remaining.shift();
  ordered.push(current);
  while (remaining.length > 0) {
    var bestIndex = 0;
    var bestScore = Number.POSITIVE_INFINITY;
    for (var index = 0; index < remaining.length; index += 1) {
      var candidate = remaining[index];
      var distance = getCellDistance(current, candidate);
      var adjacencyBonus = areAdjacent(current, candidate) ? -1000 : 0;
      var score = adjacencyBonus + distance + candidate.row * 0.001 + candidate.col * 0.0001;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    current = remaining.splice(bestIndex, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

function buildSlotComponents(slots) {
  var remaining = slots.slice();
  var components = [];
  while (remaining.length > 0) {
    var root = remaining.shift();
    var queue = [root];
    var component = [root];
    while (queue.length > 0) {
      var current = queue.pop();
      for (var index = remaining.length - 1; index >= 0; index -= 1) {
        if (areAdjacent(current, remaining[index])) {
          var next = remaining.splice(index, 1)[0];
          component.push(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function orderSlotsByComponents(slots, flip, largestFirst) {
  var components = buildSlotComponents(slots);
  components.forEach(function (component) {
    component.sort(function (cellA, cellB) {
      if (cellA.row !== cellB.row) {
        return cellA.row - cellB.row;
      }
      return flip === 0 ? cellA.col - cellB.col : cellB.col - cellA.col;
    });
  });
  components.sort(function (componentA, componentB) {
    if (largestFirst && componentA.length !== componentB.length) {
      return componentB.length - componentA.length;
    }
    if (!largestFirst && componentA[0].row !== componentB[0].row) {
      return componentA[0].row - componentB[0].row;
    }
    if (componentA[0].col !== componentB[0].col) {
      return componentA[0].col - componentB[0].col;
    }
    return componentB.length - componentA.length;
  });
  return components.reduce(function (ordered, component) {
    return ordered.concat(component);
  }, []);
}

function assignChunksToRows(rows, slots, chunks, levelId) {
  var nextRows = rows.map(function (row) {
    return row.split("").map(function () { return "."; });
  });
  var slotIndex = 0;
  chunks.forEach(function (chunk) {
    for (var countIndex = 0; countIndex < chunk.count; countIndex += 1) {
      var slot = slots[slotIndex];
      if (!slot) {
        throw new Error("Level " + levelId + " clustered chunks exceed selected layout slots.");
      }
      nextRows[slot.row][slot.col] = chunk.color;
      slotIndex += 1;
    }
  });
  if (slotIndex !== slots.length) {
    throw new Error("Level " + levelId + " clustered chunks did not fill every selected layout slot.");
  }
  return nextRows.map(function (row) { return row.join(""); });
}

function countGeometricIsolatedSlots(slots) {
  var isolatedCount = 0;
  slots.forEach(function (slot) {
    var hasNeighbor = slots.some(function (candidate) {
      return candidate !== slot && areAdjacent(slot, candidate);
    });
    if (!hasNeighbor) {
      isolatedCount += 1;
    }
  });
  return isolatedCount;
}

function buildColorComponents(rows) {
  var cells = [];
  rows.forEach(function (row, rowIndex) {
    row.split("").forEach(function (color, colIndex) {
      if (color !== ".") {
        cells.push({
          id: rowIndex + ":" + colIndex,
          row: rowIndex,
          col: colIndex,
          color: color
        });
      }
    });
  });

  var visited = {};
  var components = [];
  cells.forEach(function (root) {
    if (visited[root.id]) {
      return;
    }
    var queue = [root];
    var component = [];
    visited[root.id] = true;
    while (queue.length > 0) {
      var current = queue.pop();
      component.push(current);
      cells.forEach(function (candidate) {
        if (!visited[candidate.id] && candidate.color === current.color && areAdjacent(current, candidate)) {
          visited[candidate.id] = true;
          queue.push(candidate);
        }
      });
    }
    components.push(component);
  });
  return {
    cells: cells,
    components: components
  };
}

function analyzeLayout(rows, targetColor) {
  var componentState = buildColorComponents(rows);
  var cells = componentState.cells;
  var components = componentState.components;
  var groupedCellCount = 0;
  var isolatedCellCount = 0;
  var targetComponentSizes = [];

  components.forEach(function (component) {
    if (component.length >= 3) {
      groupedCellCount += component.length;
    }
    if (component.length === 1) {
      isolatedCellCount += 1;
    }
    if (component[0].color === targetColor) {
      targetComponentSizes.push(component.length);
    }
  });
  targetComponentSizes.sort(function (sizeA, sizeB) { return sizeB - sizeA; });
  return {
    normalBallCount: cells.length,
    groupedRatio: groupedCellCount / cells.length,
    isolatedRatio: isolatedCellCount / cells.length,
    targetComponentSizes: targetComponentSizes,
    targetLargestComponent: targetComponentSizes[0],
    targetComponentCount: targetComponentSizes.length,
    targetSingletonCount: targetComponentSizes.filter(function (size) { return size === 1; }).length
  };
}

function calculateCandidateLimits(colorCounts, colors) {
  var total = 0;
  var clusterable = 0;
  var unavoidableSingletons = 0;
  colors.forEach(function (color) {
    var count = colorCounts[color];
    total += count;
    if (count >= 3) {
      clusterable += count;
    }
    if (count === 1) {
      unavoidableSingletons += 1;
    }
  });
  var maximumGroupedRatio = clusterable / total;
  return {
    maximumGroupedRatio: maximumGroupedRatio,
    requiredGroupedRatio: Math.min(0.65, maximumGroupedRatio * 0.8),
    allowedIsolatedRatio: Math.max(0.2, unavoidableSingletons / total + 0.08)
  };
}

function scoreCandidate(metrics, limits, targetCount) {
  var desiredGroupedRatio = Math.min(0.85, limits.maximumGroupedRatio);
  var desiredTargetComponents = Math.max(1, Math.min(4, Math.round(targetCount / 5)));
  return Math.abs(metrics.groupedRatio - desiredGroupedRatio) * 40 +
    metrics.isolatedRatio * 80 +
    Math.abs(metrics.targetComponentCount - desiredTargetComponents) * 6 +
    Math.max(0, metrics.targetLargestComponent - 10) * 1.5;
}

function buildClusteredLayout(options) {
  assertObject(options, "Clustered level layout options");
  var levelId = requirePositiveInteger(options.levelId, "Clustered levelId");
  if (!shouldRedesign(levelId)) {
    throw new Error("Level " + levelId + " is not registered for clustered redesign.");
  }
  var rows = normalizeRows(options.rows, levelId);
  if (levelId >= FIRST_AESTHETIC_LEVEL_ID && options.preserveOccupiedSlots !== true) {
    rows = ensureAestheticRows(rows, levelId);
  }
  var colors = normalizeColors(options.colors, levelId);
  var colorState = normalizeColorCounts(options.colorCounts, colors, levelId);
  var targetColor = requireNonEmptyString(options.targetColor, "Level " + levelId + " targetColor");
  if (colors.indexOf(targetColor) < 0 || colorState.counts[targetColor] < 3) {
    throw new Error("Level " + levelId + " clustered targetColor must have at least three balls.");
  }
  var specialCells = buildSpecialCellMap(options.specialEntities, rows, levelId);
  var limits = calculateCandidateLimits(colorState.counts, colors);
  var baseAllowedIsolatedRatio = Math.min(limits.allowedIsolatedRatio, 0.1);
  var candidates = [];
  var bestRejected = null;
  var selectedSlotSets = [];

  if (levelId >= FIRST_AESTHETIC_LEVEL_ID && options.preserveOccupiedSlots !== true) {
    for (var shapeMode = 0; shapeMode <= 7; shapeMode += 1) {
      selectedSlotSets.push({
        slots: buildAestheticSelectedSlots(rows, specialCells, colorState.total, levelId, shapeMode),
        shapeMode: shapeMode,
        allowedIsolatedRatio: baseAllowedIsolatedRatio,
        allowedTargetSingletons: 0
      });
    }
  } else {
    var preservedSlots = collectLayoutSlots(rows, colors, colorState.counts, specialCells, levelId);
    var preservedGeometricIsolatedCount = countGeometricIsolatedSlots(preservedSlots);
    selectedSlotSets.push({
      slots: preservedSlots,
      shapeMode: -1,
      allowedIsolatedRatio: Math.max(baseAllowedIsolatedRatio, Math.min(1, (preservedGeometricIsolatedCount + 1) / preservedSlots.length)),
      allowedTargetSingletons: preservedGeometricIsolatedCount
    });
  }

  selectedSlotSets.forEach(function (slotSet) {
    for (var chunkSize = 4; chunkSize <= 8; chunkSize += 1) {
      for (var mode = 0; mode <= 9; mode += 1) {
        for (var flip = 0; flip <= 1; flip += 1) {
          for (var rotation = 0; rotation < colors.length; rotation += 1) {
            for (var reverseIndex = 0; reverseIndex <= 1; reverseIndex += 1) {
              var orderedSlots = orderSlots(slotSet.slots, mode, flip, rows);
              for (var chunkPlan = 0; chunkPlan <= 1; chunkPlan += 1) {
                var chunks = chunkPlan === 0
                  ? buildColorChunks(colors, colorState.counts, chunkSize, rotation, reverseIndex === 1)
                  : buildTargetFirstColorChunks(colors, colorState.counts, targetColor, chunkSize, rotation, reverseIndex === 1);
                var candidateRows = assignChunksToRows(rows, orderedSlots, chunks, levelId);
                var metrics = analyzeLayout(candidateRows, targetColor);
                var unsupportedCells = LevelBoardSupportValidator.findUnsupportedInitialCells({
                  layout: candidateRows,
                  specialEntities: options.specialEntities
                }, "level_" + String(levelId).padStart(3, "0"));
                if (!bestRejected ||
                    metrics.groupedRatio > bestRejected.metrics.groupedRatio ||
                    (metrics.groupedRatio === bestRejected.metrics.groupedRatio && metrics.isolatedRatio < bestRejected.metrics.isolatedRatio)) {
                  bestRejected = {
                    metrics: metrics,
                    unsupportedCount: unsupportedCells.length,
                    variant: [slotSet.shapeMode, chunkSize, mode, flip, rotation, reverseIndex, chunkPlan],
                    allowedIsolatedRatio: slotSet.allowedIsolatedRatio
                  };
                }
                if (metrics.groupedRatio < limits.requiredGroupedRatio ||
                    metrics.isolatedRatio > slotSet.allowedIsolatedRatio ||
                    metrics.targetSingletonCount > slotSet.allowedTargetSingletons ||
                    metrics.targetLargestComponent < 3 ||
                    countOccupiedRows(candidateRows, specialCells) < Math.min(getAestheticMinimumRows(levelId), rows.length) ||
                    unsupportedCells.length > 0) {
                  continue;
                }
                candidates.push({
                  rows: candidateRows,
                  metrics: metrics,
                  score: scoreCandidate(metrics, limits, colorState.counts[targetColor]),
                  variant: [slotSet.shapeMode, chunkSize, mode, flip, rotation, reverseIndex, chunkPlan]
                });
              }
            }
          }
        }
      }
    }
  });

  if (candidates.length === 0) {
    if (bestRejected) {
      throw new Error(
        "Level " + levelId + " has no clustered layout candidate satisfying quality limits." +
        " bestGrouped=" + Math.round(bestRejected.metrics.groupedRatio * 100) + "%" +
        " bestIsolated=" + Math.round(bestRejected.metrics.isolatedRatio * 100) + "%" +
        " allowedIsolated=" + Math.round(bestRejected.allowedIsolatedRatio * 100) + "%" +
        " targetSingletons=" + bestRejected.metrics.targetSingletonCount +
        " unsupported=" + bestRejected.unsupportedCount +
        " variant=" + bestRejected.variant.join(":")
      );
    }
    throw new Error("Level " + levelId + " has no clustered layout candidate satisfying quality limits.");
  }
  candidates.sort(function (candidateA, candidateB) {
    if (candidateA.score !== candidateB.score) {
      return candidateA.score - candidateB.score;
    }
    return candidateA.variant.join(":").localeCompare(candidateB.variant.join(":"));
  });
  return {
    rows: candidates[0].rows,
    metrics: candidates[0].metrics,
    variant: candidates[0].variant.slice()
  };
}

function validateClusteredLevel(level) {
  assertObject(level, "Clustered level");
  var levelId = requirePositiveInteger(level.levelId, "Clustered level.levelId");
  if (!shouldRedesign(levelId)) {
    throw new Error("Level " + levelId + " is not registered for clustered validation.");
  }
  var colors = normalizeColors(level.colors, levelId);
  var rows = normalizeRows(level.layout, levelId);
  var specialCells = buildSpecialCellMap(level.specialEntities, rows, levelId);
  var occupiedRowCount = countOccupiedRows(rows, specialCells);
  var requiredOccupiedRows = levelId >= FIRST_AESTHETIC_LEVEL_ID
    ? Math.min(getAestheticMinimumRows(levelId), rows.length)
    : MIN_OCCUPIED_LAYOUT_ROWS;
  if (occupiedRowCount < requiredOccupiedRows) {
    throw new Error(
      "Level " + levelId + " layout must occupy at least " +
      requiredOccupiedRows + " rows."
    );
  }
  if (!Array.isArray(level.winConditions)) {
    throw new Error("Level " + levelId + " winConditions must be an array.");
  }
  var targetConditions = level.winConditions.filter(function (condition) {
    return condition && condition.type === "collect_color";
  });
  if (targetConditions.length !== 1) {
    throw new Error("Level " + levelId + " must have exactly one collect_color target.");
  }
  var targetColor = requireNonEmptyString(targetConditions[0].color, "Level " + levelId + " target color");
  var counts = {};
  colors.forEach(function (color) {
    counts[color] = 0;
  });
  rows.forEach(function (row) {
    row.split("").forEach(function (cellValue) {
      if (cellValue !== ".") {
        if (!Object.prototype.hasOwnProperty.call(counts, cellValue)) {
          throw new Error("Level " + levelId + " layout contains inactive color: " + cellValue);
        }
        counts[cellValue] += 1;
      }
    });
  });
  if (counts[targetColor] < 3) {
    throw new Error("Level " + levelId + " target color must have at least three balls.");
  }

  var limits = calculateCandidateLimits(counts, colors);
  var selectedSlots = collectLayoutSlots(rows, colors, counts, specialCells, levelId);
  var geometricIsolatedCount = countGeometricIsolatedSlots(selectedSlots);
  var allowedIsolatedRatio = Math.max(
    Math.min(limits.allowedIsolatedRatio, 0.1),
    Math.min(1, (geometricIsolatedCount + 1) / selectedSlots.length)
  );
  var metrics = analyzeLayout(rows, targetColor);
  metrics.allowedIsolatedRatio = allowedIsolatedRatio;
  metrics.allowedTargetSingletons = geometricIsolatedCount;
  if (metrics.groupedRatio < limits.requiredGroupedRatio) {
    throw new Error(
      "Level " + levelId + " grouped color coverage is too low: " +
      Math.round(metrics.groupedRatio * 100) + "%"
    );
  }
  if (metrics.isolatedRatio > allowedIsolatedRatio) {
    throw new Error(
      "Level " + levelId + " isolated color ratio is too high: " +
      Math.round(metrics.isolatedRatio * 100) + "%"
    );
  }
  if (metrics.targetSingletonCount > metrics.allowedTargetSingletons || metrics.targetLargestComponent < 3) {
    throw new Error("Level " + levelId + " target color must not contain isolated balls.");
  }
  return metrics;
}

module.exports = {
  REDESIGN_LEVEL_IDS: REDESIGN_LEVEL_IDS.slice(),
  shouldRedesign: shouldRedesign,
  buildClusteredLayout: buildClusteredLayout,
  validateClusteredLevel: validateClusteredLevel,
  analyzeLayout: analyzeLayout
};
