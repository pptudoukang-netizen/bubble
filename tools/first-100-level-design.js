"use strict";

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var FIRST_LEVEL_ID = 1;
var LAST_LEVEL_ID = 100;
var COLORS = ["R", "G", "B", "Y", "P"];
var DISPLAY_COLOR_ORDER = ["B", "R", "G", "Y", "P"];
var PATTERNS = [
  "roof_bands",
  "twin_wings",
  "hollow_v",
  "support_bridge",
  "diamond_core",
  "side_gate",
  "diagonal_wave",
  "heart_pocket",
  "split_islands",
  "crown_exam"
];
var PHASE_BALL_OFFSETS = [0, 2, 4, 5, 7, 8, 10, 11, 13, 15];
var PHASE_PASS_RATES = [88, 82, 76, 69, 63, 57, 51, 44, 36, 29];
var MIN_OCCUPIED_LAYOUT_ROWS = 8;
var ADJACENCY_DISTANCE = BoardLayout.bubbleDiameter + 8;

function assertFirstHundredLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId < FIRST_LEVEL_ID || levelId > LAST_LEVEL_ID) {
    throw new Error("First-100 level id must be an integer in [1, 100]: " + levelId);
  }
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
}

function getPhase(levelId) {
  assertFirstHundredLevelId(levelId);
  return ((levelId - 1) % 10) + 1;
}

function getChapterIndex(levelId) {
  assertFirstHundredLevelId(levelId);
  return Math.floor((levelId - 1) / 10);
}

function getPatternName(levelId) {
  assertFirstHundredLevelId(levelId);
  return PATTERNS[(levelId - 1) % PATTERNS.length];
}

function getActiveColors(levelId) {
  assertFirstHundredLevelId(levelId);
  var colorCount;
  if (levelId === 1) {
    colorCount = 2;
  } else if (levelId <= 5) {
    colorCount = 3;
  } else if (levelId <= 74) {
    colorCount = 4;
  } else {
    colorCount = 5;
  }
  return DISPLAY_COLOR_ORDER.slice(0, colorCount);
}

function getTargetColor(levelId, activeColors) {
  if (!Array.isArray(activeColors) || activeColors.length === 0) {
    throw new Error("Active colors are required for level " + levelId + ".");
  }
  if (levelId === 1) {
    return "B";
  }
  return activeColors[(levelId - 1) % activeColors.length];
}

function getNormalBallCount(levelId) {
  var chapterIndex = getChapterIndex(levelId);
  var phase = getPhase(levelId);
  return 26 + chapterIndex * 3 + PHASE_BALL_OFFSETS[phase - 1];
}

function buildColorCounts(levelId, activeColors, targetColor, normalBallCount) {
  var counts = {};
  COLORS.forEach(function (color) {
    counts[color] = 0;
  });
  var base = Math.floor(normalBallCount / activeColors.length);
  var remainder = normalBallCount % activeColors.length;
  activeColors.forEach(function (color) {
    counts[color] = base;
  });
  for (var index = 0; index < remainder; index += 1) {
    var color = activeColors[(levelId + index) % activeColors.length];
    counts[color] += 1;
  }
  if (counts[targetColor] < 3) {
    throw new Error("Target color supply must be at least three for level " + levelId + ".");
  }
  return counts;
}

function makeEmptySplitterCounts() {
  var counts = {};
  COLORS.forEach(function (color) {
    counts[color] = 0;
  });
  return counts;
}

function buildSpecialCounts(levelId, targetColor) {
  assertFirstHundredLevelId(levelId);
  var phase = getPhase(levelId);
  var counts = {
    stone: 0,
    ice: 0,
    blast: 0,
    rainbow: 0,
    molotov: 0,
    splitters: makeEmptySplitterCounts(),
    key: 0,
    locked: 0
  };

  if (levelId <= 9) {
    return counts;
  }
  if (levelId === 10) {
    counts.stone = 1;
    return counts;
  }
  if (levelId === 11) {
    counts.stone = 2;
    return counts;
  }
  if (levelId === 12) {
    counts.rainbow = 1;
    return counts;
  }
  if (levelId === 13) {
    counts.stone = 1;
    counts.rainbow = 1;
    return counts;
  }
  if (levelId === 14) {
    counts.stone = 1;
    counts.blast = 1;
    return counts;
  }
  if (levelId === 15) {
    counts.blast = 1;
    return counts;
  }
  if (levelId === 16) {
    counts.ice = 3;
    return counts;
  }
  if (levelId === 17) {
    counts.ice = 4;
    return counts;
  }
  if (levelId === 18) {
    counts.ice = 4;
    counts.stone = 1;
    return counts;
  }
  if (levelId === 19) {
    counts.ice = 5;
    counts.blast = 1;
    return counts;
  }
  if (levelId === 20) {
    counts.ice = 5;
    counts.stone = 1;
    counts.rainbow = 1;
    return counts;
  }

  if (levelId <= 40) {
    counts.ice = 4 + ((phase - 1) % 4);
    if (phase === 3 || phase === 8) {
      counts.stone = 1;
    } else if (phase === 5) {
      counts.blast = 1;
    } else if (phase === 7) {
      counts.rainbow = 1;
    } else if (phase === 10) {
      counts.stone = 1;
      counts.blast = 1;
    }
    return counts;
  }

  if (levelId <= 60) {
    counts.molotov = phase >= 8 ? 2 : 1;
    if (phase === 3) {
      counts.rainbow = 1;
    } else if (phase === 5) {
      counts.stone = 1;
    } else if (phase === 7) {
      counts.blast = 1;
    } else if (phase === 10) {
      counts.ice = 3;
    }
    return counts;
  }

  if (levelId <= 80) {
    counts.splitters[targetColor] = 1;
    if (phase === 3) {
      counts.rainbow = 1;
    } else if (phase === 5) {
      counts.stone = 1;
    } else if (phase === 7) {
      counts.blast = 1;
    } else if (phase === 10) {
      counts.molotov = 1;
      counts.ice = 3;
    } else if (phase === 4 || phase === 8) {
      counts.ice = 2;
    }
    return counts;
  }

  counts.key = phase === 10 ? 2 : 1;
  counts.locked = counts.key;
  if (phase === 3) {
    counts.rainbow = 1;
  } else if (phase === 5) {
    counts.stone = 1;
  } else if (phase === 7) {
    counts.blast = 1;
  } else if (phase === 10) {
    counts.splitters[targetColor] = 1;
    counts.ice = 3;
  } else if (phase === 4 || phase === 8) {
    counts.ice = 2;
  }
  return counts;
}

function countSplitters(splitterCounts) {
  return COLORS.reduce(function (sum, color) {
    return sum + splitterCounts[color];
  }, 0);
}

function countSpecials(specialCounts) {
  return specialCounts.stone + specialCounts.ice + specialCounts.blast +
    specialCounts.rainbow + specialCounts.molotov +
    countSplitters(specialCounts.splitters) + specialCounts.key + specialCounts.locked;
}

function resolveRowCount(totalOccupied) {
  if (!Number.isInteger(totalOccupied) || totalOccupied <= 0) {
    throw new Error("Occupied cell count must be a positive integer.");
  }
  if (totalOccupied <= 52) {
    return 8;
  }
  if (totalOccupied <= 70) {
    return 9;
  }
  return 10;
}

function buildShotLimit(levelId, normalBallCount, specialCounts) {
  var phase = getPhase(levelId);
  var reactiveCount = specialCounts.molotov + countSplitters(specialCounts.splitters);
  var complexity = specialCounts.stone + specialCounts.ice * 0.5 +
    specialCounts.blast + specialCounts.rainbow + reactiveCount * 2 + specialCounts.key * 2;
  var pressure = phase >= 9 ? 3 : (phase >= 7 ? 2 : (phase >= 4 ? 1 : 0));
  var shotLimit = Math.ceil(normalBallCount / 2.15) + 4 + Math.ceil(complexity / 2) - pressure;
  if (levelId === 1) {
    return 14;
  }
  if (levelId === 2) {
    return 18;
  }
  if (levelId === 3) {
    return 20;
  }
  return Math.max(14, Math.min(38, shotLimit));
}

function getDifficultyTuning(levelId) {
  var phase = getPhase(levelId);
  var chapterIndex = getChapterIndex(levelId);
  var difficulty;
  if (phase <= 3) {
    difficulty = "advanced";
  } else if (phase <= 8) {
    difficulty = "hard";
  } else {
    difficulty = "expert";
  }
  var baseDropInterval = levelId <= 20 ? 8 : (levelId <= 60 ? 7 : 6);
  var dropInterval = phase === 10
    ? baseDropInterval - 2
    : (phase >= 8 ? baseDropInterval - 1 : baseDropInterval);
  return {
    difficulty: difficulty,
    difficultyScore: Math.min(88, 20 + chapterIndex * 4 + phase * 3),
    dropInterval: Math.max(4, dropInterval)
  };
}

function buildLevelSpec(levelId) {
  assertFirstHundredLevelId(levelId);
  var activeColors = getActiveColors(levelId);
  var targetColor = getTargetColor(levelId, activeColors);
  var normalBallCount = getNormalBallCount(levelId);
  var colorCounts = buildColorCounts(levelId, activeColors, targetColor, normalBallCount);
  var specialCounts = buildSpecialCounts(levelId, targetColor);
  var specialCount = countSpecials(specialCounts);
  var rowCount = resolveRowCount(normalBallCount + specialCount);
  var splitterCount = specialCounts.splitters[targetColor];
  var target1 = {
    type: "collect_color",
    color: targetColor,
    value: colorCounts[targetColor] + splitterCount * 5
  };
  var target2 = specialCounts.ice >= 3
    ? { type: "collect_ice_snowball", value: specialCounts.ice }
    : null;
  var jarColors = COLORS.filter(function (color) {
    return colorCounts[color] > 0;
  }).slice(0, 4);
  if (jarColors.indexOf(targetColor) === -1) {
    jarColors[jarColors.length - 1] = targetColor;
  }
  if (levelId === 1) {
    while (jarColors.length < 3) {
      jarColors.push(targetColor);
    }
  }
  return {
    levelId: levelId,
    patternName: getPatternName(levelId),
    activeColors: activeColors,
    targetColor: targetColor,
    normalBallCount: normalBallCount,
    colorCounts: colorCounts,
    specialCounts: specialCounts,
    specialCount: specialCount,
    rowCount: rowCount,
    target1: target1,
    target2: target2,
    jarCount: jarColors.length,
    jarColors: jarColors,
    shotLimit: buildShotLimit(levelId, normalBallCount, specialCounts),
    passRate: Math.max(24, PHASE_PASS_RATES[getPhase(levelId) - 1] - getChapterIndex(levelId) * 0.6),
    tuning: getDifficultyTuning(levelId)
  };
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

function getNormalizedCoordinates(cell, rows) {
  var rowLength = rows[cell.row].length;
  var x = rowLength === 1 ? 0 : (cell.col / (rowLength - 1)) * 2 - 1;
  var y = rows.length === 1 ? 0 : cell.row / (rows.length - 1);
  return { x: x, y: y };
}

function scorePatternCell(patternName, cell, rows, levelId) {
  var coordinates = getNormalizedCoordinates(cell, rows);
  var x = levelId % 2 === 0 ? -coordinates.x : coordinates.x;
  var y = coordinates.y;
  var score;
  if (patternName === "roof_bands") {
    score = y * 12 + Math.abs(x) * 1.5;
  } else if (patternName === "twin_wings") {
    score = y * 3 + Math.abs(Math.abs(x) - 0.58) * 10 + Math.max(0, 0.28 - Math.abs(x)) * 18;
  } else if (patternName === "hollow_v") {
    score = Math.abs(Math.abs(x) - (0.22 + y * 0.7)) * 11 + y * 2;
  } else if (patternName === "support_bridge") {
    score = Math.min(Math.abs(cell.row - 1), Math.abs(cell.row - 4), Math.abs(cell.row - 6)) * 6 + Math.abs(x);
  } else if (patternName === "diamond_core") {
    score = Math.abs(x) * 5 + Math.abs(y - 0.48) * 8 + y;
  } else if (patternName === "side_gate") {
    score = Math.min(Math.abs(Math.abs(x) - 0.72) * 9, Math.abs(y - 0.46) * 8) + y * 1.5;
  } else if (patternName === "diagonal_wave") {
    score = Math.abs(x - Math.sin((y * 1.8 + levelId * 0.07) * Math.PI) * 0.48) * 8 + y * 2;
  } else if (patternName === "heart_pocket") {
    score = y < 0.46
      ? Math.abs(Math.abs(x) - 0.42) * 9 + y
      : Math.abs(x) * 7 + Math.abs(y - 0.62) * 3;
  } else if (patternName === "split_islands") {
    score = Math.abs(Math.abs(x) - 0.55) * 9 + y * 2 + Math.max(0, 0.22 - Math.abs(x)) * 14;
  } else if (patternName === "crown_exam") {
    var peakDistance = Math.min(Math.abs(x + 0.62), Math.abs(x), Math.abs(x - 0.62));
    score = y < 0.48 ? peakDistance * 8 + y : Math.abs(x) * 2 + y * 3;
  } else {
    throw new Error("Unsupported first-100 pattern: " + patternName);
  }
  return score + cell.row * 0.0001 + cell.col * 0.00001;
}

function buildShapeSlots(rows, patternName, requiredCount, levelId) {
  assertFirstHundredLevelId(levelId);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Rows are required to build first-100 shape slots.");
  }
  var allCells = [];
  rows.forEach(function (row, rowIndex) {
    for (var col = 0; col < row.length; col += 1) {
      allCells.push({ row: rowIndex, col: col });
    }
  });
  if (!Number.isInteger(requiredCount) || requiredCount < rows[0].length || requiredCount > allCells.length) {
    throw new Error("Invalid first-100 occupied cell count for level " + levelId + ": " + requiredCount);
  }
  var requiredOccupiedRows = Math.min(MIN_OCCUPIED_LAYOUT_ROWS, rows.length);
  if (requiredCount < rows[0].length + requiredOccupiedRows - 1) {
    throw new Error(
      "First-100 occupied cell count cannot cover " +
      requiredOccupiedRows + " rows for level " + levelId + "."
    );
  }

  var selected = [];
  var selectedMap = {};
  allCells.filter(function (cell) {
    return cell.row === 0;
  }).forEach(function (cell) {
    selected.push(cell);
    selectedMap[cell.row + ":" + cell.col] = true;
  });
  for (var requiredRow = 1; requiredRow < requiredOccupiedRows; requiredRow += 1) {
    var rowCandidates = allCells.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (cell.row !== requiredRow || selectedMap[key]) {
        return false;
      }
      return selected.some(function (selectedCell) {
        return areAdjacent(cell, selectedCell);
      });
    });
    if (rowCandidates.length === 0) {
      throw new Error("First-100 shape cannot reach required row " + requiredRow + " for level " + levelId + ".");
    }
    rowCandidates.sort(function (cellA, cellB) {
      return scorePatternCell(patternName, cellA, rows, levelId) -
        scorePatternCell(patternName, cellB, rows, levelId);
    });
    selected.push(rowCandidates[0]);
    selectedMap[rowCandidates[0].row + ":" + rowCandidates[0].col] = true;
  }

  while (selected.length < requiredCount) {
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
      throw new Error("First-100 shape frontier exhausted for level " + levelId + ".");
    }
    frontier.sort(function (cellA, cellB) {
      return scorePatternCell(patternName, cellA, rows, levelId) -
        scorePatternCell(patternName, cellB, rows, levelId);
    });
    var nextCell = frontier[0];
    selected.push(nextCell);
    selectedMap[nextCell.row + ":" + nextCell.col] = true;
  }
  selected.sort(function (cellA, cellB) {
    if (cellA.row !== cellB.row) {
      return cellA.row - cellB.row;
    }
    return cellA.col - cellB.col;
  });
  return selected;
}

function scoreSpecialSlot(entity, cell, rows, levelId, entityIndex, placementVariant) {
  var coordinates = getNormalizedCoordinates(cell, rows);
  var x = coordinates.x;
  var y = coordinates.y;
  var centerDistance = Math.abs(x);
  var score;
  if (entity.entityType === "ice") {
    var barrierRow = Math.min(rows.length - 2, 2 + (levelId % Math.max(2, rows.length - 3)));
    score = Math.abs(cell.row - barrierRow) * 20 + centerDistance * 3;
  } else if (entity.entityType === "stone") {
    score = Math.abs(y - 0.48) * 12 + centerDistance * 3;
  } else if (entity.entityType === "blast" || entity.entityType === "rainbow") {
    score = Math.abs(y - 0.56) * 10 + centerDistance * 5;
  } else if (entity.entityType === "molotov" || entity.entityType === "splitter") {
    score = Math.abs(y - 0.62) * 12 + centerDistance * 4;
  } else if (entity.entityType === "key") {
    score = Math.abs(y - 0.68) * 12 + Math.abs(x - (entityIndex % 2 === 0 ? -0.42 : 0.42)) * 5;
  } else if (entity.entityType === "locked") {
    score = Math.abs(y - 0.38) * 12 + Math.abs(x - (entityIndex % 2 === 0 ? 0.42 : -0.42)) * 5;
  } else {
    throw new Error("Unsupported first-100 special entity type: " + entity.entityType);
  }
  var variantSalt = ((cell.row * 11 + cell.col * 7 + placementVariant * 13) % 17) * 0.015;
  return score + variantSalt + cell.row * 0.0001 + cell.col * 0.00001;
}

function placeSpecialEntities(rows, shapeSlots, entities, levelId, placementVariant) {
  if (!Array.isArray(entities)) {
    throw new Error("Special entities must be an array for level " + levelId + ".");
  }
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("First-100 placement variant must be a non-negative integer.");
  }
  var used = {};
  entities.forEach(function (entity, entityIndex) {
    assertObject(entity, "Special entity " + entityIndex);
    var candidates = shapeSlots.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (used[key]) {
        return false;
      }
      return !(entity.entityType === "splitter" && cell.row === 0);
    });
    if (candidates.length === 0) {
      throw new Error("No first-100 special slot available for level " + levelId + ".");
    }
    candidates.sort(function (cellA, cellB) {
      return scoreSpecialSlot(entity, cellA, rows, levelId, entityIndex, placementVariant) -
        scoreSpecialSlot(entity, cellB, rows, levelId, entityIndex, placementVariant);
    });
    var variantCandidateCount = Math.min(12, candidates.length);
    var candidateIndex = (placementVariant + entityIndex * 3) % variantCandidateCount;
    var slot = candidates[candidateIndex];
    used[slot.row + ":" + slot.col] = true;
    entity.row = slot.row;
    entity.col = slot.col;
  });
}

function setCell(rows, row, col, value) {
  var chars = rows[row].split("");
  chars[col] = value;
  rows[row] = chars.join("");
}

function seedNormalLayout(rows, shapeSlots, entities, colors, colorCounts, levelId) {
  var specialCells = {};
  entities.forEach(function (entity) {
    specialCells[entity.row + ":" + entity.col] = true;
  });
  var normalSlots = shapeSlots.filter(function (cell) {
    return specialCells[cell.row + ":" + cell.col] !== true;
  });
  var expectedNormalCount = colors.reduce(function (sum, color) {
    return sum + colorCounts[color];
  }, 0);
  if (normalSlots.length !== expectedNormalCount) {
    throw new Error("First-100 normal slot count mismatch for level " + levelId + ".");
  }
  var slotIndex = 0;
  colors.forEach(function (color) {
    for (var count = 0; count < colorCounts[color]; count += 1) {
      var slot = normalSlots[slotIndex];
      setCell(rows, slot.row, slot.col, color);
      slotIndex += 1;
    }
  });
  if (slotIndex !== normalSlots.length) {
    throw new Error("First-100 seed layout did not fill every normal slot for level " + levelId + ".");
  }
}

function buildBoard(options) {
  assertObject(options, "First-100 board options");
  var levelId = options.levelId;
  assertFirstHundredLevelId(levelId);
  if (!Array.isArray(options.rows) || options.rows.length === 0) {
    throw new Error("First-100 board rows are required.");
  }
  if (!Array.isArray(options.colors) || options.colors.length === 0) {
    throw new Error("First-100 board colors are required.");
  }
  assertObject(options.colorCounts, "First-100 color counts");
  if (!Array.isArray(options.specialEntities)) {
    throw new Error("First-100 special entities must be an array.");
  }
  var spec = buildLevelSpec(levelId);
  var occupiedCount = spec.normalBallCount + spec.specialCount;
  var shapeSlots = buildShapeSlots(options.rows, spec.patternName, occupiedCount, levelId);
  if (!Number.isInteger(options.placementVariant) || options.placementVariant < 0) {
    throw new Error("First-100 board placementVariant must be a non-negative integer.");
  }
  placeSpecialEntities(options.rows, shapeSlots, options.specialEntities, levelId, options.placementVariant);
  seedNormalLayout(options.rows, shapeSlots, options.specialEntities, options.colors, options.colorCounts, levelId);
  return {
    patternName: spec.patternName,
    shapeSlots: shapeSlots
  };
}

function compareNumber(actual, expected, fieldName, levelId) {
  if (actual !== expected) {
    throw new Error("Level " + levelId + " " + fieldName + " mismatch: expected " + expected + ", got " + actual + ".");
  }
}

function assertTableRowMatchesDesign(tableRow) {
  assertObject(tableRow, "First-100 table row");
  var spec = buildLevelSpec(tableRow.levelId);
  compareNumber(tableRow.rowCount, spec.rowCount, "rowCount", tableRow.levelId);
  compareNumber(tableRow.shotLimit, spec.shotLimit, "shotLimit", tableRow.levelId);
  COLORS.forEach(function (color) {
    compareNumber(tableRow.colorCounts[color], spec.colorCounts[color], "color count " + color, tableRow.levelId);
    compareNumber(tableRow.specialCounts.splitters[color], spec.specialCounts.splitters[color], "splitter count " + color, tableRow.levelId);
  });
  ["stone", "ice", "blast", "rainbow", "molotov", "key", "locked"].forEach(function (type) {
    compareNumber(tableRow.specialCounts[type], spec.specialCounts[type], "special count " + type, tableRow.levelId);
  });
  if (tableRow.target1.type !== spec.target1.type ||
      tableRow.target1.color !== spec.target1.color ||
      tableRow.target1.value !== spec.target1.value) {
    throw new Error("Level " + tableRow.levelId + " primary target differs from first-100 design.");
  }
  if (spec.target2 === null) {
    if (tableRow.target2 !== null) {
      throw new Error("Level " + tableRow.levelId + " must not define a secondary target.");
    }
  } else if (!tableRow.target2 || tableRow.target2.type !== spec.target2.type || tableRow.target2.value !== spec.target2.value) {
    throw new Error("Level " + tableRow.levelId + " secondary target differs from first-100 design.");
  }
}

function countLevelColors(level) {
  var counts = {};
  COLORS.forEach(function (color) {
    counts[color] = 0;
  });
  level.layout.forEach(function (row) {
    row.split("").forEach(function (cellValue) {
      if (cellValue !== ".") {
        if (!Object.prototype.hasOwnProperty.call(counts, cellValue)) {
          throw new Error("Level " + level.levelId + " contains unsupported color " + cellValue + ".");
        }
        counts[cellValue] += 1;
      }
    });
  });
  return counts;
}

function validateGeneratedLevel(level) {
  assertObject(level, "First-100 generated level");
  var spec = buildLevelSpec(level.levelId);
  compareNumber(level.layout.length, spec.rowCount, "layout row count", level.levelId);
  compareNumber(level.shotLimit, spec.shotLimit, "shotLimit", level.levelId);
  compareNumber(level.dropInterval, spec.tuning.dropInterval, "dropInterval", level.levelId);
  compareNumber(level.difficultyScore, spec.tuning.difficultyScore, "difficultyScore", level.levelId);
  compareNumber(level.jarCount, spec.jarCount, "jarCount", level.levelId);
  if (JSON.stringify(level.jarColors) !== JSON.stringify(spec.jarColors)) {
    throw new Error("Level " + level.levelId + " jarColors differ from first-100 design.");
  }
  if (level.difficulty !== spec.tuning.difficulty) {
    throw new Error("Level " + level.levelId + " difficulty differs from first-100 design.");
  }
  var colorCounts = countLevelColors(level);
  COLORS.forEach(function (color) {
    compareNumber(colorCounts[color], spec.colorCounts[color], "generated color count " + color, level.levelId);
  });
  compareNumber(level.specialEntities.length, spec.specialCount, "special entity count", level.levelId);

  var actualSpecialCounts = {
    stone: 0,
    ice: 0,
    blast: 0,
    rainbow: 0,
    molotov: 0,
    splitters: makeEmptySplitterCounts(),
    key: 0,
    locked: 0
  };
  level.specialEntities.forEach(function (entity) {
    if (entity.entityType === "splitter") {
      if (!Object.prototype.hasOwnProperty.call(actualSpecialCounts.splitters, entity.splitColor)) {
        throw new Error("Level " + level.levelId + " splitter has unsupported splitColor.");
      }
      actualSpecialCounts.splitters[entity.splitColor] += 1;
    } else if (Object.prototype.hasOwnProperty.call(actualSpecialCounts, entity.entityType)) {
      actualSpecialCounts[entity.entityType] += 1;
    } else {
      throw new Error("Level " + level.levelId + " contains unsupported first-100 special type.");
    }
  });
  ["stone", "ice", "blast", "rainbow", "molotov", "key", "locked"].forEach(function (type) {
    compareNumber(actualSpecialCounts[type], spec.specialCounts[type], "generated special count " + type, level.levelId);
  });
  COLORS.forEach(function (color) {
    compareNumber(
      actualSpecialCounts.splitters[color],
      spec.specialCounts.splitters[color],
      "generated splitter count " + color,
      level.levelId
    );
  });

  var expectedWinConditions = [spec.target1];
  if (spec.target2 !== null) {
    expectedWinConditions.push(spec.target2);
  }
  if (JSON.stringify(level.winConditions) !== JSON.stringify(expectedWinConditions)) {
    throw new Error("Level " + level.levelId + " win conditions differ from first-100 design.");
  }

  var occupancy = {};
  level.layout.forEach(function (row, rowIndex) {
    row.split("").forEach(function (cellValue, colIndex) {
      if (cellValue !== ".") {
        occupancy[rowIndex + ":" + colIndex] = true;
      }
    });
  });
  level.specialEntities.forEach(function (entity) {
    occupancy[entity.row + ":" + entity.col] = true;
  });
  var emptyRows = level.layout.map(function (row) {
    return ".".repeat(row.length);
  });
  var expectedSlots = buildShapeSlots(emptyRows, spec.patternName, spec.normalBallCount + spec.specialCount, level.levelId);
  var expectedMap = {};
  expectedSlots.forEach(function (cell) {
    expectedMap[cell.row + ":" + cell.col] = true;
  });
  var actualKeys = Object.keys(occupancy).sort();
  var expectedKeys = Object.keys(expectedMap).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Level " + level.levelId + " occupancy does not match pattern " + spec.patternName + ".");
  }
  var specialDensity = spec.specialCount / (spec.normalBallCount + spec.specialCount);
  if (specialDensity > 0.3) {
    throw new Error("Level " + level.levelId + " special density exceeds 30%.");
  }
  var specialTypes = {};
  level.specialEntities.forEach(function (entity) {
    specialTypes[entity.entityType] = true;
  });
  if (Object.keys(specialTypes).length > 4) {
    throw new Error("Level " + level.levelId + " uses more than four special entity types.");
  }
  return {
    patternName: spec.patternName,
    specialDensity: specialDensity
  };
}

module.exports = {
  FIRST_LEVEL_ID: FIRST_LEVEL_ID,
  LAST_LEVEL_ID: LAST_LEVEL_ID,
  COLORS: COLORS.slice(),
  PATTERNS: PATTERNS.slice(),
  buildLevelSpec: buildLevelSpec,
  buildBoard: buildBoard,
  getDifficultyTuning: getDifficultyTuning,
  assertTableRowMatchesDesign: assertTableRowMatchesDesign,
  validateGeneratedLevel: validateGeneratedLevel
};
