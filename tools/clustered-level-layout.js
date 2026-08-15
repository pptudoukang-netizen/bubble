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
var REFERENCE_PROJECTED_LAST_LEVEL_ID = 300;
var MAX_CONSECUTIVE_BOTH_EDGE_EMPTY_ROWS = 3;
var MAX_TOP_ROW_SAME_COLOR_RUN = LevelBoardSupportValidator.MAX_TOP_ROW_SAME_COLOR_RUN;

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

function usesReferenceProjectedGeometry(levelId) {
  return levelId >= FIRST_AESTHETIC_LEVEL_ID && levelId <= REFERENCE_PROJECTED_LAST_LEVEL_ID;
}

function resolveCandidateProfile(options) {
  if (options.candidateProfile === undefined || options.candidateProfile === "full") {
    return "full";
  }
  if (options.candidateProfile === "relaxed_campaign") {
    return "relaxed_campaign";
  }
  throw new Error("Unsupported clustered layout candidateProfile: " + options.candidateProfile);
}

function buildAestheticShapeModes(levelId, candidateProfile) {
  if (candidateProfile === "full") {
    return [0, 1, 2, 3, 4, 5, 6, 7];
  }
  var primary = levelId % 8;
  var secondary = (primary + 3) % 8;
  return [primary, secondary];
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

function hasSelectedNeighbor(selected, cell) {
  return selected.some(function (selectedCell) {
    return areAdjacent(cell, selectedCell);
  });
}

function buildEdgeCandidateColumns(rowLength, preferRight) {
  var lastColumn = rowLength - 1;
  if (rowLength <= 1) {
    return [0];
  }
  if (rowLength === 2) {
    return preferRight ? [lastColumn, 0] : [0, lastColumn];
  }
  return preferRight
    ? [lastColumn, 0, lastColumn - 1, 1]
    : [0, lastColumn, 1, lastColumn - 1];
}

function findReachableEdgeAnchorCell(rowIndex, rows, selected, selectedMap, preferRight) {
  var columns = buildEdgeCandidateColumns(rows[rowIndex].length, preferRight);
  for (var index = 0; index < columns.length; index += 1) {
    var cell = {
      row: rowIndex,
      col: columns[index]
    };
    var key = cell.row + ":" + cell.col;
    if (selectedMap[key]) {
      continue;
    }
    if (hasSelectedNeighbor(selected, cell)) {
      return cell;
    }
  }
  return null;
}

function addPeriodicEdgeAnchors(rows, selected, selectedMap, occupiedCount, levelId) {
  for (var rowIndex = 1; rowIndex < rows.length && selected.length < occupiedCount; rowIndex += 1) {
    var preferRight = levelId % 2 === 0;
    var anchorCell = findReachableEdgeAnchorCell(rowIndex, rows, selected, selectedMap, preferRight);
    if (anchorCell) {
      pushSelectedCell(selected, selectedMap, anchorCell);
    }
  }
}

function buildAestheticSelectedSlots(rows, specialCells, requiredNormalCells, normalCount, levelId, shapeMode) {
  var allCells = collectAllCells(rows);
  var specialKeys = Object.keys(specialCells);
  var occupiedCount = normalCount + specialKeys.length;
  var selected = [];
  var selectedMap = {};
  var selectedByRow = {};

  function pushAestheticSlot(cell) {
    var key = cell.row + ":" + cell.col;
    if (selectedMap[key]) {
      return;
    }
    pushSelectedCell(selected, selectedMap, cell);
    selectedByRow[cell.row] = (selectedByRow[cell.row] || 0) + 1;
  }

  function scoreAestheticCandidate(cell) {
    var rowFill = selectedByRow[cell.row] || 0;
    var targetRowFill = Math.ceil(occupiedCount / rows.length);
    return scoreAestheticCell(cell, rows, levelId, shapeMode) +
      Math.max(0, rowFill - targetRowFill + 1) * 14 +
      rowFill * 3 -
      cell.row * 0.55;
  }

  allCells.forEach(function (cell) {
    if (cell.row === 0 || specialCells[cell.row + ":" + cell.col] || requiredNormalCells[cell.row + ":" + cell.col]) {
      pushAestheticSlot(cell);
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
      return scoreAestheticCandidate(cellA) - scoreAestheticCandidate(cellB);
    });
    pushAestheticSlot(rowCandidates[0]);
  }

  addPeriodicEdgeAnchors(rows, selected, selectedMap, occupiedCount, levelId);

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
      return scoreAestheticCandidate(cellA) - scoreAestheticCandidate(cellB);
    });
    pushAestheticSlot(frontier[0]);
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

function buildRequiredNormalCellMap(requiredNormalSlots, specialCells, rows, levelId) {
  if (!Array.isArray(requiredNormalSlots)) {
    throw new Error("Level " + levelId + " requiredNormalSlots must be an array.");
  }
  var required = {};
  requiredNormalSlots.forEach(function (slot, index) {
    assertObject(slot, "Level " + levelId + " required normal slot " + index);
    var row = requireNonNegativeInteger(slot.row, "Level " + levelId + " required normal row");
    var col = requireNonNegativeInteger(slot.col, "Level " + levelId + " required normal col");
    if (row >= rows.length || col >= rows[row].length) {
      throw new Error("Level " + levelId + " required normal slot is outside layout: " + row + ":" + col);
    }
    var key = row + ":" + col;
    if (specialCells[key]) {
      throw new Error("Level " + levelId + " required normal slot overlaps a special entity: " + key);
    }
    required[key] = true;
  });
  return required;
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

function buildTargetLastColorChunks(colors, colorCounts, targetColor, targetChunkSize, rotation, reversed) {
  var remainingCounts = {};
  colors.forEach(function (color) {
    remainingCounts[color] = colorCounts[color];
  });
  var targetCount = remainingCounts[targetColor];
  remainingCounts[targetColor] = 0;
  var chunks = buildColorChunks(colors, remainingCounts, targetChunkSize, rotation, reversed);
  if (targetCount > 0) {
    chunks.push({
      color: targetColor,
      count: targetCount
    });
  }
  return chunks;
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

function analyzeCascadeRiskWithSpecialCells(rows, specialCells, isTrappedSpriteRescue, trappedSpriteRescue) {
  var componentState = buildColorComponents(rows);
  var occupiedCells = componentState.cells.map(function (cell) {
    return {
      id: cell.id,
      row: cell.row,
      col: cell.col,
      color: cell.color,
      normal: true
    };
  });
  Object.keys(specialCells).forEach(function (cellKey) {
    var parts = cellKey.split(":");
    occupiedCells.push({
      id: cellKey,
      row: Number(parts[0]),
      col: Number(parts[1]),
      color: null,
      normal: false
    });
  });
  var occupiedCellMap = {};
  occupiedCells.forEach(function (cell) {
    occupiedCellMap[cell.id] = cell;
  });
  var supportRootIds;
  if (isTrappedSpriteRescue) {
    var anchorCell = trappedSpriteRescue.anchorCell;
    supportRootIds = occupiedCells.filter(function (cell) {
      return areAdjacent(anchorCell, cell);
    }).map(function (cell) {
      return cell.id;
    });
  } else {
    supportRootIds = occupiedCells.filter(function (cell) {
      return cell.row === 0;
    }).map(function (cell) {
      return cell.id;
    });
  }
  if (supportRootIds.length === 0) {
    throw new Error("Cascade risk analysis requires at least one support root.");
  }

  var maximumImpact = 0;
  var maximumFloating = 0;
  var maximumComponentSize = 0;
  var maximumComponentColor = null;
  componentState.components.forEach(function (component) {
    if (component.length < 3) {
      return;
    }
    var removedCellMap = {};
    component.forEach(function (cell) {
      removedCellMap[cell.id] = true;
    });
    var supportedCellMap = {};
    var queue = supportRootIds.filter(function (cellId) {
      return !removedCellMap[cellId];
    });
    while (queue.length > 0) {
      var currentId = queue.pop();
      if (supportedCellMap[currentId] || removedCellMap[currentId]) {
        continue;
      }
      var current = occupiedCellMap[currentId];
      if (!current) {
        throw new Error("Cascade risk support traversal lost occupied cell " + currentId + ".");
      }
      supportedCellMap[currentId] = true;
      occupiedCells.forEach(function (candidate) {
        if (!supportedCellMap[candidate.id] && !removedCellMap[candidate.id] && areAdjacent(current, candidate)) {
          queue.push(candidate.id);
        }
      });
    }
    var remainingCount = occupiedCells.length - component.length;
    var supportedCount = Object.keys(supportedCellMap).length;
    var floatingCount = remainingCount - supportedCount;
    var impact = component.length + floatingCount;
    if (impact > maximumImpact) {
      maximumImpact = impact;
      maximumFloating = floatingCount;
      maximumComponentSize = component.length;
      maximumComponentColor = component[0].color;
    }
  });
  return {
    occupiedCellCount: occupiedCells.length,
    maximumImmediateImpact: maximumImpact,
    maximumImmediateImpactRatio: maximumImpact / occupiedCells.length,
    maximumImmediateFloating: maximumFloating,
    maximumImmediateFloatingRatio: maximumFloating / occupiedCells.length,
    triggeringComponentSize: maximumComponentSize,
    triggeringComponentColor: maximumComponentColor
  };
}

function analyzeCascadeRisk(options) {
  assertObject(options, "Cascade risk options");
  var levelId = requirePositiveInteger(options.levelId, "Cascade risk levelId");
  var rows = normalizeRows(options.rows, levelId);
  var specialCells = buildSpecialCellMap(options.specialEntities, rows, levelId);
  var isTrappedSpriteRescue = options.levelType === "trapped_sprite_rescue";
  if (isTrappedSpriteRescue && (!options.trappedSpriteRescue || !options.trappedSpriteRescue.anchorCell)) {
    throw new Error("Level " + levelId + " cascade risk requires trappedSpriteRescue.anchorCell.");
  }
  return analyzeCascadeRiskWithSpecialCells(
    rows,
    specialCells,
    isTrappedSpriteRescue,
    options.trappedSpriteRescue
  );
}

function normalizeCascadeBalancePolicy(rawPolicy, levelId) {
  if (rawPolicy === undefined || rawPolicy === null) {
    return null;
  }
  assertObject(rawPolicy, "Level " + levelId + " cascadeBalancePolicy");
  ["preferredImmediateImpactRatio", "maximumImmediateImpactRatio"].forEach(function (fieldName) {
    var fieldValue = rawPolicy[fieldName];
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue <= 0 || fieldValue >= 1) {
      throw new Error("Level " + levelId + " cascadeBalancePolicy." + fieldName + " must be within (0, 1).");
    }
  });
  if (rawPolicy.preferredImmediateImpactRatio > rawPolicy.maximumImmediateImpactRatio) {
    throw new Error(
      "Level " + levelId + " cascadeBalancePolicy preferred ratio must not exceed maximum ratio."
    );
  }
  if (!Number.isInteger(rawPolicy.candidateLimit) || rawPolicy.candidateLimit < 2) {
    throw new Error("Level " + levelId + " cascadeBalancePolicy.candidateLimit must be an integer >= 2.");
  }
  return {
    preferredImmediateImpactRatio: rawPolicy.preferredImmediateImpactRatio,
    maximumImmediateImpactRatio: rawPolicy.maximumImmediateImpactRatio,
    candidateLimit: rawPolicy.candidateLimit
  };
}

function normalizeVisualFocus(rawFocus, targetColor, levelId) {
  if (rawFocus === undefined) {
    return null;
  }
  assertObject(rawFocus, "Level " + levelId + " visualFocus");
  if (typeof rawFocus.x !== "number" || !Number.isFinite(rawFocus.x) || rawFocus.x < -1 || rawFocus.x > 1) {
    throw new Error("Level " + levelId + " visualFocus.x must be within [-1, 1].");
  }
  if (typeof rawFocus.y !== "number" || !Number.isFinite(rawFocus.y) || rawFocus.y < 0 || rawFocus.y > 1) {
    throw new Error("Level " + levelId + " visualFocus.y must be within [0, 1].");
  }
  if (rawFocus.targetColor !== targetColor) {
    throw new Error("Level " + levelId + " visualFocus.targetColor must equal targetColor.");
  }
  return {
    x: rawFocus.x,
    y: rawFocus.y,
    targetColor: rawFocus.targetColor
  };
}

function analyzeColorComposition(rows, colors, visualFocus) {
  if (visualFocus === null) {
    return null;
  }
  var sideCounts = {};
  colors.forEach(function (color) {
    sideCounts[color] = { left: 0, right: 0, total: 0 };
  });
  var focusTargetCount = 0;
  var mirroredPairCount = 0;
  var mirroredColorEchoCount = 0;
  rows.forEach(function (rowString, rowIndex) {
    for (var colIndex = 0; colIndex < rowString.length; colIndex += 1) {
      var color = rowString.charAt(colIndex);
      if (color === ".") {
        continue;
      }
      var coordinates = getNormalizedCoordinates({ row: rowIndex, col: colIndex }, rows);
      var compositionY = rows.length === 1 ? 0 : rowIndex / (rows.length - 1);
      sideCounts[color].total += 1;
      if (coordinates.x < -0.08) {
        sideCounts[color].left += 1;
      } else if (coordinates.x > 0.08) {
        sideCounts[color].right += 1;
      }
      var dx = coordinates.x - visualFocus.x;
      var dy = (compositionY - visualFocus.y) * 1.25;
      if (color === visualFocus.targetColor && Math.sqrt(dx * dx + dy * dy) <= 0.4) {
        focusTargetCount += 1;
      }
    }
    for (var pairIndex = 0; pairIndex < Math.floor(rowString.length / 2); pairIndex += 1) {
      var mirrorIndex = rowString.length - 1 - pairIndex;
      var leftColor = rowString.charAt(pairIndex);
      var rightColor = rowString.charAt(mirrorIndex);
      if (leftColor === "." || rightColor === ".") {
        continue;
      }
      mirroredPairCount += 1;
      if (leftColor === rightColor) {
        mirroredColorEchoCount += 1;
      }
    }
  });
  var maxColorSideImbalanceRatio = 0;
  colors.forEach(function (color) {
    var counts = sideCounts[color];
    maxColorSideImbalanceRatio = Math.max(
      maxColorSideImbalanceRatio,
      Math.abs(counts.left - counts.right) / counts.total
    );
  });
  return {
    focusTargetCount: focusTargetCount,
    maxColorSideImbalanceRatio: maxColorSideImbalanceRatio,
    mirroredColorEchoRatio: mirroredPairCount > 0 ? mirroredColorEchoCount / mirroredPairCount : 0
  };
}

function scoreColorComposition(composition) {
  if (composition === null) {
    return 0;
  }
  return composition.maxColorSideImbalanceRatio * 42 +
    Math.max(0, 3 - composition.focusTargetCount) * 24 +
    Math.max(0, 0.35 - composition.mirroredColorEchoRatio) * 38;
}

function buildSlotKeyMap(slots, levelId) {
  var map = {};
  slots.forEach(function (slot) {
    var key = slot.row + ":" + slot.col;
    if (map[key]) {
      throw new Error("Level " + levelId + " has duplicated clustered slot: " + key);
    }
    map[key] = true;
  });
  return map;
}

function isGeometryCellOccupied(row, col, normalSlotMap, specialCells) {
  var key = row + ":" + col;
  if (normalSlotMap[key] === true) {
    return true;
  }
  return specialCells[key] === true;
}

function analyzeOccupiedGeometry(rows, slots, specialCells, levelId) {
  var normalSlotMap = buildSlotKeyMap(slots, levelId);
  var stats = [];
  var bothEdgeEmptyRows = 0;
  var sideAnchorRows = 0;
  var thinRows = 0;
  var maxConsecutiveBothEdgeEmptyRows = 0;
  var currentConsecutiveBothEdgeEmptyRows = 0;
  var neckRows = 0;

  rows.forEach(function (row, rowIndex) {
    var occupiedCount = 0;
    var minCol = row.length;
    var maxCol = -1;
    for (var colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (isGeometryCellOccupied(rowIndex, colIndex, normalSlotMap, specialCells)) {
        occupiedCount += 1;
        minCol = Math.min(minCol, colIndex);
        maxCol = Math.max(maxCol, colIndex);
      }
    }

    var leftEdgeOccupied = occupiedCount > 0 && minCol === 0;
    var rightEdgeOccupied = occupiedCount > 0 && maxCol === row.length - 1;
    var bothEdgesEmpty = occupiedCount > 0 && !leftEdgeOccupied && !rightEdgeOccupied;
    if (rowIndex > 0 && bothEdgesEmpty) {
      bothEdgeEmptyRows += 1;
      currentConsecutiveBothEdgeEmptyRows += 1;
      maxConsecutiveBothEdgeEmptyRows = Math.max(
        maxConsecutiveBothEdgeEmptyRows,
        currentConsecutiveBothEdgeEmptyRows
      );
    } else if (rowIndex > 0) {
      currentConsecutiveBothEdgeEmptyRows = 0;
    }
    if (rowIndex > 0 && (leftEdgeOccupied || rightEdgeOccupied)) {
      sideAnchorRows += 1;
    }
    if (rowIndex > 0 && occupiedCount > 0 && occupiedCount <= 3) {
      thinRows += 1;
    }
    stats.push({
      occupiedCount: occupiedCount
    });
  });

  for (var index = 1; index < stats.length - 1; index += 1) {
    if (stats[index].occupiedCount <= 3 &&
        stats[index - 1].occupiedCount >= 5 &&
        stats[index + 1].occupiedCount >= 5) {
      neckRows += 1;
    }
  }

  return {
    bothEdgeEmptyRows: bothEdgeEmptyRows,
    sideAnchorRows: sideAnchorRows,
    thinRows: thinRows,
    maxConsecutiveBothEdgeEmptyRows: maxConsecutiveBothEdgeEmptyRows,
    neckRows: neckRows
  };
}

function getMinimumSideAnchorRows(rowCount) {
  if (rowCount >= 15) {
    return 5;
  }
  if (rowCount >= 10) {
    return 3;
  }
  return 2;
}

function getMaximumThinRows(rowCount) {
  if (rowCount >= 15) {
    return 2;
  }
  if (rowCount >= 10) {
    return 1;
  }
  return 0;
}

function isGeometryStable(metrics, rowCount) {
  return metrics.sideAnchorRows >= getMinimumSideAnchorRows(rowCount) &&
    metrics.maxConsecutiveBothEdgeEmptyRows <= MAX_CONSECUTIVE_BOTH_EDGE_EMPTY_ROWS &&
    metrics.thinRows <= getMaximumThinRows(rowCount) &&
    metrics.neckRows === 0;
}

function getMaxSameColorRun(row) {
  var maxRun = 0;
  var currentColor = null;
  var currentRun = 0;
  for (var index = 0; index < row.length; index += 1) {
    var cellValue = row.charAt(index);
    if (cellValue === ".") {
      currentColor = null;
      currentRun = 0;
      continue;
    }
    if (cellValue === currentColor) {
      currentRun += 1;
    } else {
      currentColor = cellValue;
      currentRun = 1;
    }
    maxRun = Math.max(maxRun, currentRun);
  }
  return maxRun;
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

function scoreCandidate(metrics, limits, targetCount, candidateProfile, colorComposition) {
  if (candidateProfile === "relaxed_campaign") {
    var relaxedDesiredTargetComponents = targetCount >= 24 ? 4 : 3;
    var relaxedLargestTargetFloor = Math.ceil(targetCount * 0.22);
    var relaxedLargestTargetCeiling = Math.ceil(targetCount * 0.46);
    return Math.abs(metrics.groupedRatio - Math.min(0.92, limits.maximumGroupedRatio)) * 35 +
      metrics.isolatedRatio * 95 +
      Math.abs(metrics.targetComponentCount - relaxedDesiredTargetComponents) * 18 +
      Math.max(0, relaxedLargestTargetFloor - metrics.targetLargestComponent) * 6 +
      Math.max(0, metrics.targetLargestComponent - relaxedLargestTargetCeiling) * 7 +
      scoreColorComposition(colorComposition);
  }
  var desiredGroupedRatio = Math.min(0.85, limits.maximumGroupedRatio);
  var desiredTargetComponents = Math.max(1, Math.min(4, Math.round(targetCount / 5)));
  return Math.abs(metrics.groupedRatio - desiredGroupedRatio) * 40 +
    metrics.isolatedRatio * 80 +
    Math.abs(metrics.targetComponentCount - desiredTargetComponents) * 6 +
    Math.max(0, metrics.targetLargestComponent - 10) * 1.5 +
    scoreColorComposition(colorComposition);
}

function buildClusteredLayout(options) {
  assertObject(options, "Clustered level layout options");
  var levelId = requirePositiveInteger(options.levelId, "Clustered levelId");
  if (!shouldRedesign(levelId)) {
    throw new Error("Level " + levelId + " is not registered for clustered redesign.");
  }
  var candidateProfile = resolveCandidateProfile(options);
  var cascadeBalancePolicy = normalizeCascadeBalancePolicy(options.cascadeBalancePolicy, levelId);
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
  var visualFocus = normalizeVisualFocus(options.visualFocus, targetColor, levelId);
  var specialCells = buildSpecialCellMap(options.specialEntities, rows, levelId);
  var requiredNormalCells = buildRequiredNormalCellMap(options.requiredNormalSlots, specialCells, rows, levelId);
  var isTrappedSpriteRescue = options.levelType === "trapped_sprite_rescue";
  if (isTrappedSpriteRescue && (!options.trappedSpriteRescue || !options.trappedSpriteRescue.anchorCell)) {
    throw new Error("Level " + levelId + " trapped sprite rescue layout requires anchorCell.");
  }
  var limits = calculateCandidateLimits(colorState.counts, colors);
  if (candidateProfile === "full" && levelId <= 40) {
    limits.requiredGroupedRatio = Math.min(0.7, limits.maximumGroupedRatio);
  }
  var baseAllowedIsolatedRatio = Math.min(limits.allowedIsolatedRatio, 0.1);
  var candidates = [];
  var bestRejected = null;
  var selectedSlotSets = [];

  if (levelId >= FIRST_AESTHETIC_LEVEL_ID && options.preserveOccupiedSlots !== true) {
    buildAestheticShapeModes(levelId, candidateProfile).forEach(function (shapeMode) {
      selectedSlotSets.push({
        slots: buildAestheticSelectedSlots(rows, specialCells, requiredNormalCells, colorState.total, levelId, shapeMode),
        shapeMode: shapeMode,
        allowedIsolatedRatio: baseAllowedIsolatedRatio,
        allowedTargetSingletons: 0
      });
    });
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

  var minChunkSize = 3;
  var maxChunkSize = candidateProfile === "relaxed_campaign" ? 7 : 8;
  var maxOrderingMode = candidateProfile === "relaxed_campaign" ? 7 : 9;
  selectedSlotSets.forEach(function (slotSet) {
    if (cascadeBalancePolicy !== null && candidates.length >= cascadeBalancePolicy.candidateLimit) {
      return;
    }
    if (levelId >= FIRST_AESTHETIC_LEVEL_ID && !usesReferenceProjectedGeometry(levelId) && !isTrappedSpriteRescue) {
      var occupiedGeometry = analyzeOccupiedGeometry(rows, slotSet.slots, specialCells, levelId);
      if (!isGeometryStable(occupiedGeometry, rows.length)) {
        if (!bestRejected) {
          bestRejected = {
            metrics: {
              groupedRatio: 0,
              isolatedRatio: 1,
              targetSingletonCount: 0
            },
            unsupportedCount: 0,
            variant: [
              slotSet.shapeMode,
              "geometry",
              occupiedGeometry.sideAnchorRows,
              occupiedGeometry.maxConsecutiveBothEdgeEmptyRows,
              occupiedGeometry.thinRows,
              occupiedGeometry.neckRows
            ],
            allowedIsolatedRatio: slotSet.allowedIsolatedRatio
          };
        }
        return;
      }
    }
    for (var chunkSize = minChunkSize; chunkSize <= maxChunkSize; chunkSize += 1) {
      for (var mode = 0; mode <= maxOrderingMode; mode += 1) {
        for (var flip = 0; flip <= 1; flip += 1) {
          for (var rotation = 0; rotation < colors.length; rotation += 1) {
            for (var reverseIndex = 0; reverseIndex <= 1; reverseIndex += 1) {
              var orderedSlots = orderSlots(slotSet.slots, mode, flip, rows);
              var maxChunkPlan = candidateProfile === "relaxed_campaign" ? 2 : 1;
              for (var chunkPlan = 0; chunkPlan <= maxChunkPlan; chunkPlan += 1) {
                var chunks;
                if (chunkPlan === 0) {
                  chunks = buildColorChunks(colors, colorState.counts, chunkSize, rotation, reverseIndex === 1);
                } else if (chunkPlan === 1) {
                  chunks = buildTargetFirstColorChunks(colors, colorState.counts, targetColor, chunkSize, rotation, reverseIndex === 1);
                } else {
                  chunks = buildTargetLastColorChunks(colors, colorState.counts, targetColor, chunkSize, rotation, reverseIndex === 1);
                }
                var candidateRows = assignChunksToRows(rows, orderedSlots, chunks, levelId);
                var topRowSameColorRun = getMaxSameColorRun(candidateRows[0]);
                if (topRowSameColorRun > MAX_TOP_ROW_SAME_COLOR_RUN) {
                  continue;
                }
                var metrics = analyzeLayout(candidateRows, targetColor);
                var colorComposition = analyzeColorComposition(candidateRows, colors, visualFocus);
                if (!bestRejected ||
                    metrics.groupedRatio > bestRejected.metrics.groupedRatio ||
                    (metrics.groupedRatio === bestRejected.metrics.groupedRatio && metrics.isolatedRatio < bestRejected.metrics.isolatedRatio)) {
                  bestRejected = {
                    metrics: metrics,
                    unsupportedCount: 0,
                    variant: [slotSet.shapeMode, chunkSize, mode, flip, rotation, reverseIndex, chunkPlan],
                    allowedIsolatedRatio: slotSet.allowedIsolatedRatio
                  };
                }
                if (metrics.groupedRatio < limits.requiredGroupedRatio ||
                    metrics.isolatedRatio > slotSet.allowedIsolatedRatio ||
                    metrics.targetSingletonCount > slotSet.allowedTargetSingletons ||
                    metrics.targetLargestComponent < 3 ||
                    (colorComposition !== null && colorComposition.focusTargetCount < 2) ||
                    (colorComposition !== null && colorComposition.maxColorSideImbalanceRatio > 0.75) ||
                    (colorComposition !== null && colorComposition.mirroredColorEchoRatio < 0.12) ||
                    countOccupiedRows(candidateRows, specialCells) < Math.min(getAestheticMinimumRows(levelId), rows.length)) {
                  continue;
                }
                var unsupportedCells = LevelBoardSupportValidator.findUnsupportedInitialCells({
                  layout: candidateRows,
                  specialEntities: options.specialEntities,
                  levelType: options.levelType,
                  trappedSpriteRescue: options.trappedSpriteRescue
                }, "level_" + String(levelId).padStart(3, "0"));
                if (unsupportedCells.length > 0) {
                  continue;
                }
                var cascadeRisk = cascadeBalancePolicy === null
                  ? null
                  : analyzeCascadeRiskWithSpecialCells(
                    candidateRows,
                    specialCells,
                    isTrappedSpriteRescue,
                    options.trappedSpriteRescue
                  );
                candidates.push({
                  rows: candidateRows,
                  metrics: metrics,
                  colorComposition: colorComposition,
                  cascadeRisk: cascadeRisk,
                  score: scoreCandidate(metrics, limits, colorState.counts[targetColor], candidateProfile, colorComposition),
                  variant: [slotSet.shapeMode, chunkSize, mode, flip, rotation, reverseIndex, chunkPlan]
                });
                if (cascadeBalancePolicy !== null &&
                    candidates.length >= cascadeBalancePolicy.candidateLimit) {
                  return;
                }
                if (candidateProfile === "relaxed_campaign" && cascadeBalancePolicy === null) {
                  return;
                }
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
    if (cascadeBalancePolicy !== null) {
      var cascadeDistanceA = Math.abs(
        candidateA.cascadeRisk.maximumImmediateImpactRatio -
        cascadeBalancePolicy.preferredImmediateImpactRatio
      );
      var cascadeDistanceB = Math.abs(
        candidateB.cascadeRisk.maximumImmediateImpactRatio -
        cascadeBalancePolicy.preferredImmediateImpactRatio
      );
      if (cascadeDistanceA !== cascadeDistanceB) {
        return cascadeDistanceA - cascadeDistanceB;
      }
      if (candidateA.cascadeRisk.maximumImmediateFloatingRatio !==
          candidateB.cascadeRisk.maximumImmediateFloatingRatio) {
        return candidateA.cascadeRisk.maximumImmediateFloatingRatio -
          candidateB.cascadeRisk.maximumImmediateFloatingRatio;
      }
    }
    if (candidateA.score !== candidateB.score) {
      return candidateA.score - candidateB.score;
    }
    return candidateA.variant.join(":").localeCompare(candidateB.variant.join(":"));
  });
  if (cascadeBalancePolicy !== null &&
      candidates[0].cascadeRisk.maximumImmediateImpactRatio > cascadeBalancePolicy.maximumImmediateImpactRatio) {
    throw new Error(
      "Level " + levelId + " has no sampled cascade-balanced layout candidate." +
      " bestImmediateImpact=" +
      Math.round(candidates[0].cascadeRisk.maximumImmediateImpactRatio * 100) + "%" +
      " maximumImmediateImpact=" +
      Math.round(cascadeBalancePolicy.maximumImmediateImpactRatio * 100) + "%" +
      " sampledCandidates=" + candidates.length
    );
  }
  return {
    rows: candidates[0].rows,
    metrics: candidates[0].metrics,
    colorComposition: candidates[0].colorComposition,
    cascadeRisk: candidates[0].cascadeRisk,
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
  var topRowSameColorRun = getMaxSameColorRun(rows[0]);
  if (topRowSameColorRun > MAX_TOP_ROW_SAME_COLOR_RUN) {
    throw new Error(
      "Level " + levelId + " top row same color run must be <= " +
      MAX_TOP_ROW_SAME_COLOR_RUN + ", got " + topRowSameColorRun + "."
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
  if (levelId >= FIRST_AESTHETIC_LEVEL_ID && !usesReferenceProjectedGeometry(levelId) &&
      level.levelType !== "trapped_sprite_rescue") {
    var geometryMetrics = analyzeOccupiedGeometry(rows, selectedSlots, specialCells, levelId);
    if (!isGeometryStable(geometryMetrics, rows.length)) {
      throw new Error(
        "Level " + levelId + " layout has unstable side support." +
        " sideAnchorRows=" + geometryMetrics.sideAnchorRows +
        " bothEdgeEmptyRun=" + geometryMetrics.maxConsecutiveBothEdgeEmptyRows +
        " thinRows=" + geometryMetrics.thinRows +
        " neckRows=" + geometryMetrics.neckRows
      );
    }
  }
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
  analyzeLayout: analyzeLayout,
  analyzeCascadeRisk: analyzeCascadeRisk
};
