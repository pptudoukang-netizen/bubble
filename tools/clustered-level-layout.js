"use strict";

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var REDESIGN_LEVEL_IDS = [
  9, 10, 12, 13, 15, 16, 19, 29, 36, 37, 38, 40,
  75, 77, 78, 79, 80, 81, 82, 83, 84, 85, 87, 89,
  90, 91, 93, 95, 96, 98, 99, 100
];
var REDESIGN_LEVEL_ID_MAP = {};
var ADJACENCY_DISTANCE = BoardLayout.bubbleDiameter + 8;

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

function orderSlots(slots, mode, flip) {
  var ordered = slots.slice();
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
  return ordered;
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
  var colors = normalizeColors(options.colors, levelId);
  var colorState = normalizeColorCounts(options.colorCounts, colors, levelId);
  var targetColor = requireNonEmptyString(options.targetColor, "Level " + levelId + " targetColor");
  if (colors.indexOf(targetColor) < 0 || colorState.counts[targetColor] < 3) {
    throw new Error("Level " + levelId + " clustered targetColor must have at least three balls.");
  }
  var specialCells = buildSpecialCellMap(options.specialEntities, rows, levelId);
  var selectedSlots = collectLayoutSlots(rows, colors, colorState.counts, specialCells, levelId);
  var limits = calculateCandidateLimits(colorState.counts, colors);
  var candidates = [];

  for (var chunkSize = 4; chunkSize <= 7; chunkSize += 1) {
    for (var mode = 0; mode <= 1; mode += 1) {
      for (var flip = 0; flip <= 1; flip += 1) {
        for (var rotation = 0; rotation < colors.length; rotation += 1) {
          for (var reverseIndex = 0; reverseIndex <= 1; reverseIndex += 1) {
            var orderedSlots = orderSlots(selectedSlots, mode, flip);
            var chunks = buildColorChunks(colors, colorState.counts, chunkSize, rotation, reverseIndex === 1);
            var candidateRows = assignChunksToRows(rows, orderedSlots, chunks, levelId);
            var metrics = analyzeLayout(candidateRows, targetColor);
            if (metrics.groupedRatio < limits.requiredGroupedRatio ||
                metrics.isolatedRatio > limits.allowedIsolatedRatio ||
                metrics.targetSingletonCount > 0 ||
                metrics.targetLargestComponent < 3) {
              continue;
            }
            candidates.push({
              rows: candidateRows,
              metrics: metrics,
              score: scoreCandidate(metrics, limits, colorState.counts[targetColor]),
              variant: [chunkSize, mode, flip, rotation, reverseIndex]
            });
          }
        }
      }
    }
  }

  if (candidates.length === 0) {
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
  var metrics = analyzeLayout(rows, targetColor);
  if (metrics.groupedRatio < limits.requiredGroupedRatio) {
    throw new Error(
      "Level " + levelId + " grouped color coverage is too low: " +
      Math.round(metrics.groupedRatio * 100) + "%"
    );
  }
  if (metrics.isolatedRatio > limits.allowedIsolatedRatio) {
    throw new Error(
      "Level " + levelId + " isolated color ratio is too high: " +
      Math.round(metrics.isolatedRatio * 100) + "%"
    );
  }
  if (metrics.targetSingletonCount > 0 || metrics.targetLargestComponent < 3) {
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
