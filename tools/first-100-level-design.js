"use strict";

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var FIRST_LEVEL_ID = 1;
var LAST_LEVEL_ID = 100;
var COLORS = ["R", "G", "B", "Y", "P"];
var DISPLAY_COLOR_ORDER = ["B", "R", "G", "Y", "P"];
var THEME_GROUPS = [
  {
    name: "flower",
    startLevel: 1,
    endLevel: 15,
    silhouettes: [
      { name: "flower_bud", focusName: "bud_core", focusX: 0, focusY: 0.46 },
      { name: "flower_bloom", focusName: "flower_heart", focusX: 0, focusY: 0.42 },
      { name: "flower_lotus", focusName: "lotus_center", focusX: 0.06, focusY: 0.5 },
      { name: "flower_bell", focusName: "bell_core", focusX: -0.06, focusY: 0.48 },
      { name: "flower_twin", focusName: "twin_petal_bridge", focusX: 0, focusY: 0.52 }
    ]
  },
  {
    name: "crystal",
    startLevel: 16,
    endLevel: 30,
    silhouettes: [
      { name: "crystal_spire", focusName: "spire_core", focusX: 0, focusY: 0.48 },
      { name: "crystal_cluster", focusName: "cluster_gem", focusX: 0.06, focusY: 0.44 },
      { name: "crystal_diamond", focusName: "diamond_core", focusX: 0, focusY: 0.52 },
      { name: "crystal_pendant", focusName: "pendant_gem", focusX: -0.06, focusY: 0.58 },
      { name: "crystal_twin", focusName: "twin_crystal_bridge", focusX: 0, focusY: 0.5 }
    ]
  },
  {
    name: "snowflake",
    startLevel: 31,
    endLevel: 45,
    silhouettes: [
      { name: "snowflake_core", focusName: "snow_core", focusX: 0, focusY: 0.5 },
      { name: "snowflake_branch", focusName: "branch_crossing", focusX: 0.06, focusY: 0.48 },
      { name: "snowflake_crown", focusName: "ice_crown", focusX: 0, focusY: 0.42 },
      { name: "snowflake_hourglass", focusName: "frozen_waist", focusX: -0.06, focusY: 0.52 },
      { name: "snowflake_wings", focusName: "wing_crystal", focusX: 0, focusY: 0.5 }
    ]
  },
  {
    name: "star",
    startLevel: 46,
    endLevel: 60,
    silhouettes: [
      { name: "star_core", focusName: "star_center", focusX: 0, focusY: 0.5 },
      { name: "star_burst", focusName: "burst_center", focusX: 0.06, focusY: 0.48 },
      { name: "star_crown", focusName: "crown_star", focusX: 0, focusY: 0.42 },
      { name: "star_gate", focusName: "star_gate_core", focusX: -0.06, focusY: 0.52 },
      { name: "star_twin", focusName: "twin_star_bridge", focusX: 0, focusY: 0.5 }
    ]
  },
  {
    name: "wing",
    startLevel: 61,
    endLevel: 80,
    silhouettes: [
      { name: "wing_butterfly", focusName: "butterfly_body", focusX: 0, focusY: 0.5 },
      { name: "wing_feather", focusName: "feather_spine", focusX: 0.06, focusY: 0.48 },
      { name: "wing_bridge", focusName: "wing_bridge_core", focusX: 0, focusY: 0.54 },
      { name: "wing_crown", focusName: "wing_crown_gem", focusX: -0.06, focusY: 0.44 },
      { name: "wing_heart", focusName: "wing_heart", focusX: 0, focusY: 0.52 }
    ]
  },
  {
    name: "crown",
    startLevel: 81,
    endLevel: 100,
    silhouettes: [
      { name: "crown_arch", focusName: "arch_gem", focusX: 0, focusY: 0.52 },
      { name: "crown_gem", focusName: "royal_gem", focusX: 0.06, focusY: 0.46 },
      { name: "crown_towers", focusName: "tower_bridge", focusX: 0, focusY: 0.5 },
      { name: "crown_keyhole", focusName: "keyhole_core", focusX: -0.06, focusY: 0.54 },
      { name: "crown_exam", focusName: "crown_center", focusX: 0, focusY: 0.48 }
    ]
  }
];
var PATTERNS = THEME_GROUPS.reduce(function (patterns, theme) {
  return patterns.concat(theme.silhouettes.map(function (silhouette) {
    return silhouette.name;
  }));
}, []);
var PHASE_BALL_OFFSETS = [0, 2, 4, 6, 8, 10, 12, 13, 15, 17];
var PHASE_PASS_RATES = [92, 88, 84, 80, 76, 72, 68, 63, 58, 52];
var MIN_OCCUPIED_LAYOUT_ROWS = 8;
var ADJACENCY_DISTANCE = BoardLayout.bubbleDiameter + 8;
var LEVEL_ONE_TUTORIAL_LAYOUT = [
  "BBBBRRRRBB",
  ".BBBBRRR.",
  ".BBBRRRRR.",
  ".BBBRRRR.",
  "..BBRRR...",
  "...BBRR..",
  "...BBR....",
  "...BR...."
];

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

function getThemeGroup(levelId) {
  assertFirstHundredLevelId(levelId);
  for (var index = 0; index < THEME_GROUPS.length; index += 1) {
    var theme = THEME_GROUPS[index];
    if (levelId >= theme.startLevel && levelId <= theme.endLevel) {
      return theme;
    }
  }
  throw new Error("First-100 theme group missing for level " + levelId + ".");
}

function getSilhouette(levelId) {
  var theme = getThemeGroup(levelId);
  var silhouetteIndex = (levelId - theme.startLevel) % theme.silhouettes.length;
  return theme.silhouettes[silhouetteIndex];
}

function getPatternName(levelId) {
  return getSilhouette(levelId).name;
}

function getActiveColors(levelId) {
  assertFirstHundredLevelId(levelId);
  var colorCount;
  if (levelId === 1) {
    colorCount = 2;
  } else if (levelId <= 8) {
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

function getBoardCapacity(rowCount) {
  if (!Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error("First-100 rowCount must be a positive integer.");
  }
  var total = 0;
  for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
  }
  return total;
}

function getMinimumOccupiedCount(levelId, rowCount) {
  assertFirstHundredLevelId(levelId);
  var capacity = getBoardCapacity(rowCount);
  if (levelId === 1) {
    return Math.floor(capacity * 0.6) + 1;
  }
  return Math.ceil(capacity * 0.6);
}

function getBaseNormalBallCount(levelId) {
  var chapterIndex = getChapterIndex(levelId);
  var phase = getPhase(levelId);
  if (levelId === 1) {
    return 46;
  }
  return 30 + chapterIndex * 4 + PHASE_BALL_OFFSETS[phase - 1];
}

function resolveNormalBallCount(levelId, rowCount, specialCount) {
  if (!Number.isInteger(specialCount) || specialCount < 0) {
    throw new Error("First-100 specialCount must be a non-negative integer.");
  }
  var minimumNormalCount = getMinimumOccupiedCount(levelId, rowCount) - specialCount;
  return Math.max(getBaseNormalBallCount(levelId), minimumNormalCount);
}

function buildColorCounts(levelId, activeColors, targetColor, normalBallCount) {
  var counts = {};
  COLORS.forEach(function (color) {
    counts[color] = 0;
  });
  if (levelId !== 1) {
    var otherColors = activeColors.filter(function (color) {
      return color !== targetColor;
    });
    if (!otherColors.length) {
      throw new Error("First-100 color distribution requires non-target colors for level " + levelId + ".");
    }
    var targetCount = Math.max(8, Math.round(normalBallCount * (levelId <= 20 ? 0.38 : 0.34)));
    var remaining = normalBallCount - targetCount;
    var minimumOtherSupply = otherColors.length * 4;
    if (remaining < minimumOtherSupply) {
      targetCount -= minimumOtherSupply - remaining;
      remaining = minimumOtherSupply;
    }
    if (targetCount < 3) {
      throw new Error("Target color supply must be at least three for level " + levelId + ".");
    }
    counts[targetColor] = targetCount;
    var otherBase = Math.floor(remaining / otherColors.length);
    var otherRemainder = remaining % otherColors.length;
    otherColors.forEach(function (color) {
      counts[color] = otherBase;
    });
    for (var otherIndex = 0; otherIndex < otherRemainder; otherIndex += 1) {
      counts[otherColors[(levelId + otherIndex) % otherColors.length]] += 1;
    }
    return counts;
  }
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

function resolveRowCount(levelId) {
  assertFirstHundredLevelId(levelId);
  if (levelId === 1) {
    return 8;
  }
  if (levelId < 20) {
    return 10;
  }
  return 15;
}

function buildShotLimit(levelId, normalBallCount, specialCounts) {
  var phase = getPhase(levelId);
  var reactiveCount = specialCounts.molotov + countSplitters(specialCounts.splitters);
  var complexity = specialCounts.stone + specialCounts.ice * 0.5 +
    specialCounts.blast + specialCounts.rainbow + reactiveCount * 2 + specialCounts.key * 2;
  var pressure = phase >= 9 ? 3 : (phase >= 7 ? 2 : (phase >= 4 ? 1 : 0));
  var shotLimit = Math.ceil(normalBallCount / 2.35) + 4 + Math.ceil(complexity / 4) - pressure;
  if (levelId === 1) {
    return 12;
  }
  if (levelId === 2) {
    return 14;
  }
  if (levelId === 3) {
    return 16;
  }
  var shotCap = levelId >= 75 ? 32 : (levelId >= 20 ? 22 : 20);
  return Math.max(14, Math.min(shotCap, shotLimit));
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
  var theme = getThemeGroup(levelId);
  var silhouette = getSilhouette(levelId);
  var activeColors = getActiveColors(levelId);
  var targetColor = getTargetColor(levelId, activeColors);
  var specialCounts = buildSpecialCounts(levelId, targetColor);
  var specialCount = countSpecials(specialCounts);
  var rowCount = resolveRowCount(levelId);
  var normalBallCount = resolveNormalBallCount(levelId, rowCount, specialCount);
  var colorCounts = buildColorCounts(levelId, activeColors, targetColor, normalBallCount);
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
    themeName: theme.name,
    patternName: silhouette.name,
    focusName: silhouette.focusName,
    focusX: silhouette.focusX,
    focusY: silhouette.focusY,
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

function pointDistance(x, y, targetX, targetY, xScale, yScale) {
  var dx = (x - targetX) * xScale;
  var dy = (y - targetY) * yScale;
  return Math.sqrt(dx * dx + dy * dy);
}

function scorePatternCell(patternName, cell, rows, levelId) {
  var coordinates = getNormalizedCoordinates(cell, rows);
  var silhouette = getSilhouette(levelId);
  if (silhouette.name !== patternName) {
    throw new Error("First-100 pattern differs from theme silhouette for level " + levelId + ".");
  }
  var accentDirection = levelId % 2 === 0 ? -1 : 1;
  var x = coordinates.x - silhouette.focusX * accentDirection;
  var y = coordinates.y;
  var score;
  var radius;
  var angle;
  var targetRadius;

  if (patternName === "flower_bud") {
    var budRing = Math.abs(pointDistance(x, y, 0, 0.4, 1, 1.45) - 0.44) * 9;
    var budStem = Math.abs(x) * 7 + Math.abs(y - 0.72) * 1.5;
    score = Math.min(budRing, budStem) + y * 0.8;
  } else if (patternName === "flower_bloom") {
    score = Math.min(
      pointDistance(x, y, -0.36, 0.34, 1.15, 1.5),
      pointDistance(x, y, 0.36, 0.34, 1.15, 1.5),
      pointDistance(x, y, -0.3, 0.58, 1.2, 1.55),
      pointDistance(x, y, 0.3, 0.58, 1.2, 1.55),
      pointDistance(x, y, 0, 0.47, 1.4, 1.4) * 0.82
    ) * 7 + y * 0.7;
  } else if (patternName === "flower_lotus") {
    var lotusWidth = 0.2 + Math.sin(Math.min(1, y) * Math.PI) * 0.5;
    var lotusPetal = Math.abs(Math.abs(x) - lotusWidth) * 8 + Math.abs(y - 0.48) * 1.2;
    var lotusCore = pointDistance(x, y, 0, 0.52, 1.5, 1.8) * 5;
    score = Math.min(lotusPetal, lotusCore);
  } else if (patternName === "flower_bell") {
    var bellWidth = 0.18 + Math.sin(Math.min(1, y) * Math.PI * 0.86) * 0.5;
    var bellEdge = Math.abs(Math.abs(x) - bellWidth) * 8 + y * 1.1;
    var bellClapper = Math.abs(x) * 7 + Math.abs(y - 0.72) * 2;
    score = Math.min(bellEdge, bellClapper);
  } else if (patternName === "flower_twin") {
    var leftFlower = pointDistance(x, y, -0.4, 0.46, 1.1, 1.45);
    var rightFlower = pointDistance(x, y, 0.4, 0.46, 1.1, 1.45);
    var flowerBridge = Math.abs(y - 0.53) * 7 + Math.abs(x) * 0.7;
    score = Math.min(leftFlower * 6, rightFlower * 6, flowerBridge) + y * 0.5;
  } else if (patternName === "crystal_spire") {
    var spireEdge = Math.abs(Math.abs(x) + Math.abs(y - 0.5) * 0.82 - 0.68) * 9;
    var spireAxis = Math.abs(x) * 6 + Math.abs(y - 0.55) * 1.2;
    score = Math.min(spireEdge, spireAxis);
  } else if (patternName === "crystal_cluster") {
    var centerCrystal = Math.abs(Math.abs(x) + Math.abs(y - 0.48) * 0.8 - 0.58) * 8;
    var leftCrystal = Math.abs(Math.abs(x + 0.45) + Math.abs(y - 0.58) * 0.9 - 0.42) * 8;
    var rightCrystal = Math.abs(Math.abs(x - 0.45) + Math.abs(y - 0.54) * 0.9 - 0.42) * 8;
    score = Math.min(centerCrystal, leftCrystal, rightCrystal) + y * 0.45;
  } else if (patternName === "crystal_diamond") {
    score = Math.abs(Math.abs(x) + Math.abs(y - 0.52) * 1.35 - 0.78) * 8 + Math.abs(x) * 0.35;
  } else if (patternName === "crystal_pendant") {
    var pendantGem = Math.abs(Math.abs(x) + Math.abs(y - 0.53) * 1.2 - 0.66) * 8;
    var pendantChain = Math.abs(x) * 7 + Math.abs(y - 0.22) * 1.5;
    var pendantTip = pointDistance(x, y, 0, 0.78, 1.4, 2) * 5;
    score = Math.min(pendantGem, pendantChain, pendantTip);
  } else if (patternName === "crystal_twin") {
    var twinLeft = Math.abs(Math.abs(x + 0.38) + Math.abs(y - 0.52) - 0.48) * 8;
    var twinRight = Math.abs(Math.abs(x - 0.38) + Math.abs(y - 0.52) - 0.48) * 8;
    var twinBridge = Math.abs(y - 0.5) * 7 + Math.abs(x) * 0.8;
    score = Math.min(twinLeft, twinRight, twinBridge);
  } else if (patternName === "snowflake_core") {
    var snowVertical = Math.abs(x) * 7;
    var snowHorizontal = Math.abs(y - 0.5) * 8;
    var snowDiagonalA = Math.abs(x - (y - 0.5) * 1.25) * 5.5;
    var snowDiagonalB = Math.abs(x + (y - 0.5) * 1.25) * 5.5;
    score = Math.min(snowVertical, snowHorizontal, snowDiagonalA, snowDiagonalB) + Math.abs(y - 0.5) * 0.7;
  } else if (patternName === "snowflake_branch") {
    var branchAxis = Math.abs(x) * 6;
    var branchUpper = Math.min(Math.abs(x - (0.36 - y) * 1.35), Math.abs(x + (0.36 - y) * 1.35)) * 5;
    var branchLower = Math.min(Math.abs(x - (y - 0.62) * 1.15), Math.abs(x + (y - 0.62) * 1.15)) * 5;
    score = Math.min(branchAxis, branchUpper, branchLower) + y * 0.6;
  } else if (patternName === "snowflake_crown") {
    var icePeakDistance = Math.min(Math.abs(x + 0.58), Math.abs(x), Math.abs(x - 0.58));
    var icePeaks = icePeakDistance * 6 + Math.abs(y - 0.32) * 2;
    var iceBase = Math.abs(y - 0.58) * 7 + Math.abs(x) * 0.5;
    score = Math.min(icePeaks, iceBase);
  } else if (patternName === "snowflake_hourglass") {
    score = Math.abs(Math.abs(x) - (0.16 + Math.abs(y - 0.52) * 1.05)) * 7 + Math.abs(y - 0.52) * 0.5;
  } else if (patternName === "snowflake_wings") {
    var snowWing = Math.abs(Math.abs(x) - (0.28 + Math.sin(y * Math.PI) * 0.36)) * 7;
    var snowCore = Math.abs(x) * 6 + Math.abs(y - 0.5) * 1.3;
    score = Math.min(snowWing, snowCore);
  } else if (patternName === "star_core" || patternName === "star_burst") {
    var centeredY = (y - 0.5) * 1.35;
    radius = Math.sqrt(x * x + centeredY * centeredY);
    angle = Math.atan2(centeredY, x);
    var rayCount = patternName === "star_core" ? 5 : 8;
    targetRadius = 0.44 + Math.cos(angle * rayCount) * (patternName === "star_core" ? 0.2 : 0.16);
    score = Math.abs(radius - targetRadius) * 8 + radius * 0.3;
  } else if (patternName === "star_crown") {
    var starPeakDistance = Math.min(Math.abs(x + 0.62), Math.abs(x), Math.abs(x - 0.62));
    var starPeaks = starPeakDistance * 6 + Math.abs(y - 0.34) * 2;
    var starBody = Math.abs(Math.abs(x) + Math.abs(y - 0.58) - 0.7) * 7;
    score = Math.min(starPeaks, starBody);
  } else if (patternName === "star_gate") {
    var starGateSides = Math.abs(Math.abs(x) - 0.58) * 7 + Math.abs(y - 0.5) * 0.5;
    var starGateTop = Math.abs(y - 0.32) * 7 + Math.abs(x) * 0.8;
    var starGateGem = pointDistance(x, y, 0, 0.54, 1.3, 1.7) * 5;
    score = Math.min(starGateSides, starGateTop, starGateGem);
  } else if (patternName === "star_twin") {
    var leftStar = pointDistance(x, y, -0.4, 0.5, 1.1, 1.45);
    var rightStar = pointDistance(x, y, 0.4, 0.5, 1.1, 1.45);
    var starBridge = Math.abs(y - 0.5) * 7 + Math.abs(x) * 0.8;
    score = Math.min(leftStar * 6, rightStar * 6, starBridge);
  } else if (patternName === "wing_butterfly") {
    var butterflyWing = Math.abs(Math.abs(x) - (0.26 + Math.sin(y * Math.PI) * 0.48)) * 7;
    var butterflyBody = Math.abs(x) * 7 + Math.abs(y - 0.5) * 0.8;
    score = Math.min(butterflyWing, butterflyBody);
  } else if (patternName === "wing_feather") {
    var featherSpine = Math.abs(x) * 7;
    var featherBarbA = Math.abs(Math.abs(x) - (0.16 + y * 0.56)) * 6;
    var featherBarbB = Math.abs(Math.abs(x) - (0.7 - y * 0.48)) * 6;
    score = Math.min(featherSpine, featherBarbA, featherBarbB) + y * 0.35;
  } else if (patternName === "wing_bridge") {
    var wingSides = Math.abs(Math.abs(x) - 0.58) * 7 + Math.abs(y - 0.46) * 0.7;
    var wingBridge = Math.abs(y - 0.56) * 7 + Math.abs(x) * 0.6;
    score = Math.min(wingSides, wingBridge);
  } else if (patternName === "wing_crown") {
    var wingPeakDistance = Math.min(Math.abs(x + 0.58), Math.abs(x), Math.abs(x - 0.58));
    var wingCrown = wingPeakDistance * 6 + Math.abs(y - 0.34) * 2;
    var wingSweep = Math.abs(Math.abs(x) - (0.26 + y * 0.52)) * 6;
    score = Math.min(wingCrown, wingSweep);
  } else if (patternName === "wing_heart") {
    var heartUpper = Math.abs(Math.abs(x) - 0.4) * 7 + Math.abs(y - 0.35) * 1.4;
    var heartLower = Math.abs(Math.abs(x) - Math.max(0.08, 0.68 - y * 0.72)) * 7;
    score = Math.min(heartUpper, heartLower);
  } else if (patternName === "crown_arch") {
    var archRadius = Math.abs(pointDistance(x, y, 0, 0.58, 1, 1.45) - 0.62) * 7;
    var archBase = Math.abs(y - 0.62) * 7 + Math.abs(x) * 0.6;
    score = Math.min(archRadius, archBase);
  } else if (patternName === "crown_gem") {
    var crownGem = Math.abs(Math.abs(x) + Math.abs(y - 0.5) * 1.2 - 0.68) * 7;
    var crownBand = Math.abs(y - 0.3) * 7 + Math.abs(x) * 0.5;
    score = Math.min(crownGem, crownBand);
  } else if (patternName === "crown_towers") {
    var towerSides = Math.abs(Math.abs(x) - 0.58) * 7;
    var towerBridge = Math.abs(y - 0.54) * 7 + Math.abs(x) * 0.7;
    var towerCore = Math.abs(x) * 7 + Math.abs(y - 0.46) * 1.1;
    score = Math.min(towerSides, towerBridge, towerCore);
  } else if (patternName === "crown_keyhole") {
    var keyholeRing = Math.abs(pointDistance(x, y, 0, 0.42, 1.1, 1.5) - 0.38) * 8;
    var keyholeStem = Math.abs(x) * 7 + Math.abs(y - 0.7) * 1.2;
    score = Math.min(keyholeRing, keyholeStem);
  } else if (patternName === "crown_exam") {
    var crownPeakDistance = Math.min(Math.abs(x + 0.62), Math.abs(x), Math.abs(x - 0.62));
    var crownPeaks = crownPeakDistance * 6 + Math.abs(y - 0.32) * 2;
    var crownBody = Math.abs(Math.abs(x) + Math.abs(y - 0.56) - 0.72) * 6;
    var crownCore = pointDistance(x, y, 0, 0.5, 1.4, 1.7) * 5;
    score = Math.min(crownPeaks, crownBody, crownCore);
  } else {
    throw new Error("Unsupported first-100 pattern: " + patternName);
  }
  return score + cell.row * 0.0001 + cell.col * 0.00001;
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

function buildCenterCandidateColumns(rowLength, preferRight) {
  var leftCenter = Math.floor((rowLength - 1) / 2);
  var rightCenter = Math.ceil((rowLength - 1) / 2);
  if (leftCenter === rightCenter) {
    return [leftCenter, leftCenter - 1, leftCenter + 1].filter(function (col) {
      return col >= 0 && col < rowLength;
    });
  }
  return preferRight
    ? [rightCenter, leftCenter, rightCenter + 1, leftCenter - 1].filter(function (col) {
      return col >= 0 && col < rowLength;
    })
    : [leftCenter, rightCenter, leftCenter - 1, rightCenter + 1].filter(function (col) {
      return col >= 0 && col < rowLength;
    });
}

function findReachableAnchorCell(rowIndex, rows, selected, selectedMap, columns) {
  for (var index = 0; index < columns.length; index += 1) {
    var cell = {
      row: rowIndex,
      col: columns[index]
    };
    var key = cell.row + ":" + cell.col;
    if (selectedMap[key]) {
      continue;
    }
    if (selected.some(function (selectedCell) {
      return areAdjacent(cell, selectedCell);
    })) {
      return cell;
    }
  }
  return null;
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
  var requiredOccupiedRows = Math.min(
    levelId === 1 ? MIN_OCCUPIED_LAYOUT_ROWS : rows.length,
    rows.length
  );
  if (requiredCount < rows[0].length + requiredOccupiedRows - 1) {
    throw new Error(
      "First-100 occupied cell count cannot cover " +
      requiredOccupiedRows + " rows for level " + levelId + "."
    );
  }
  if (levelId === 1) {
    return buildSlotsFromFixedLayout(rows, LEVEL_ONE_TUTORIAL_LAYOUT, requiredCount, levelId);
  }

  var selected = [];
  var selectedMap = {};
  var selectedByRow = {};
  var selectedMomentX = 0;
  var selectedLeftCount = 0;
  var selectedRightCount = 0;
  function pushShapeSlot(cell) {
    var key = cell.row + ":" + cell.col;
    if (selectedMap[key]) {
      return;
    }
    selected.push(cell);
    selectedMap[key] = true;
    selectedByRow[cell.row] = (selectedByRow[cell.row] || 0) + 1;
    var normalizedX = getNormalizedCoordinates(cell, rows).x;
    selectedMomentX += normalizedX;
    if (normalizedX < -0.08) {
      selectedLeftCount += 1;
    } else if (normalizedX > 0.08) {
      selectedRightCount += 1;
    }
  }
  function pushReferenceAnchors() {
    for (var edgeRow = 2; edgeRow < rows.length && selected.length < requiredCount; edgeRow += 3) {
      var leftAnchor = findReachableAnchorCell(
        edgeRow,
        rows,
        selected,
        selectedMap,
        buildEdgeCandidateColumns(rows[edgeRow].length, false)
      );
      if (leftAnchor) {
        pushShapeSlot(leftAnchor);
      }
      var rightAnchor = findReachableAnchorCell(
        edgeRow,
        rows,
        selected,
        selectedMap,
        buildEdgeCandidateColumns(rows[edgeRow].length, true)
      );
      if (rightAnchor && selected.length < requiredCount) {
        pushShapeSlot(rightAnchor);
      }
    }
    for (var centerRow = 1; centerRow < rows.length && selected.length < requiredCount; centerRow += 4) {
      var preferRightCenter = (levelId + centerRow) % 2 === 0;
      var centerAnchor = findReachableAnchorCell(
        centerRow,
        rows,
        selected,
        selectedMap,
        buildCenterCandidateColumns(rows[centerRow].length, preferRightCenter)
      );
      if (centerAnchor) {
        pushShapeSlot(centerAnchor);
      }
    }
  }
  function scoreShapeCandidate(cell) {
    var rowFill = selectedByRow[cell.row] || 0;
    var targetRowFill = Math.ceil(requiredCount / rows.length);
    var normalizedX = getNormalizedCoordinates(cell, rows).x;
    var nextLeftCount = selectedLeftCount + (normalizedX < -0.08 ? 1 : 0);
    var nextRightCount = selectedRightCount + (normalizedX > 0.08 ? 1 : 0);
    var balancePenalty = Math.abs(selectedMomentX + normalizedX) * 2.8 +
      Math.abs(nextLeftCount - nextRightCount) * 0.9;
    return scorePatternCell(patternName, cell, rows, levelId) +
      Math.max(0, rowFill - targetRowFill - 1) * 4 +
      rowFill * 0.4 +
      cell.row * 0.08 +
      balancePenalty;
  }
  function pushFocusAnchor() {
    var silhouette = getSilhouette(levelId);
    var accentDirection = levelId % 2 === 0 ? -1 : 1;
    var focusX = silhouette.focusX * accentDirection;
    var candidates = allCells.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (selectedMap[key]) {
        return false;
      }
      return selected.some(function (selectedCell) {
        return areAdjacent(cell, selectedCell);
      });
    });
    candidates.sort(function (cellA, cellB) {
      var coordinatesA = getNormalizedCoordinates(cellA, rows);
      var coordinatesB = getNormalizedCoordinates(cellB, rows);
      var distanceA = pointDistance(coordinatesA.x, coordinatesA.y, focusX, silhouette.focusY, 1, 1.25);
      var distanceB = pointDistance(coordinatesB.x, coordinatesB.y, focusX, silhouette.focusY, 1, 1.25);
      return distanceA - distanceB;
    });
    if (candidates.length === 0) {
      throw new Error("First-100 silhouette focus is unreachable for level " + levelId + ".");
    }
    pushShapeSlot(candidates[0]);
  }
  allCells.filter(function (cell) {
    return cell.row === 0;
  }).forEach(function (cell) {
    pushShapeSlot(cell);
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
      return scoreShapeCandidate(cellA) - scoreShapeCandidate(cellB);
    });
    pushShapeSlot(rowCandidates[0]);
  }
  pushFocusAnchor();
  var themeName = getThemeGroup(levelId).name;
  if (levelId !== 1 && (themeName === "snowflake" || themeName === "star" || themeName === "wing")) {
    pushReferenceAnchors();
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
      return scoreShapeCandidate(cellA) - scoreShapeCandidate(cellB);
    });
    var nextCell = frontier[0];
    pushShapeSlot(nextCell);
  }
  selected.sort(function (cellA, cellB) {
    if (cellA.row !== cellB.row) {
      return cellA.row - cellB.row;
    }
    return cellA.col - cellB.col;
  });
  return selected;
}

function buildSlotsFromFixedLayout(rows, fixedLayout, requiredCount, levelId) {
  if (!Array.isArray(fixedLayout) || fixedLayout.length !== rows.length) {
    throw new Error("Fixed first-100 layout row count mismatch for level " + levelId + ".");
  }
  var slots = [];
  fixedLayout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string" || rowString.length !== rows[rowIndex].length) {
      throw new Error("Fixed first-100 layout row length mismatch for level " + levelId + " row " + rowIndex + ".");
    }
    rowString.split("").forEach(function (cellCode, colIndex) {
      if (cellCode !== ".") {
        slots.push({
          row: rowIndex,
          col: colIndex
        });
      }
    });
  });
  if (slots.length !== requiredCount) {
    throw new Error("Fixed first-100 layout occupied count mismatch for level " + levelId + ".");
  }
  return slots;
}

function getFocalEntityRank(entity) {
  if (entity.entityType === "rainbow" || entity.entityType === "blast" ||
      entity.entityType === "molotov" || entity.entityType === "splitter" ||
      entity.entityType === "key") {
    return 0;
  }
  if (entity.entityType === "stone" || entity.entityType === "locked") {
    return 1;
  }
  if (entity.entityType === "ice") {
    return 2;
  }
  throw new Error("Unsupported first-100 focal entity type: " + entity.entityType);
}

function scoreSpecialSlot(entity, cell, rows, levelId, entityIndex, placementVariant, placedMomentX) {
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
  var silhouette = getSilhouette(levelId);
  var accentDirection = levelId % 2 === 0 ? -1 : 1;
  if (entityIndex === 0) {
    score += pointDistance(
      x,
      y,
      silhouette.focusX * accentDirection,
      silhouette.focusY,
      1,
      1.25
    ) * 40;
  } else {
    score += Math.abs(placedMomentX + x) * 4;
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
  var placedMomentX = 0;
  var orderedEntities = entities.slice().sort(function (entityA, entityB) {
    var rankDelta = getFocalEntityRank(entityA) - getFocalEntityRank(entityB);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return String(entityA.id).localeCompare(String(entityB.id));
  });
  orderedEntities.forEach(function (entity, entityIndex) {
    assertObject(entity, "Special entity " + entityIndex);
    var candidates = shapeSlots.filter(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (used[key]) {
        return false;
      }
      return !(entity.entityType === "splitter" && cell.row === 0);
    });
    if (entityIndex === 0) {
      var silhouette = getSilhouette(levelId);
      var accentDirection = levelId % 2 === 0 ? -1 : 1;
      candidates = candidates.filter(function (cell) {
        var coordinates = getNormalizedCoordinates(cell, rows);
        return pointDistance(
          coordinates.x,
          coordinates.y,
          silhouette.focusX * accentDirection,
          silhouette.focusY,
          1,
          1.25
        ) <= 0.58;
      });
    }
    if (candidates.length === 0) {
      throw new Error("No first-100 special slot available for level " + levelId + ".");
    }
    candidates.sort(function (cellA, cellB) {
      return scoreSpecialSlot(entity, cellA, rows, levelId, entityIndex, placementVariant, placedMomentX) -
        scoreSpecialSlot(entity, cellB, rows, levelId, entityIndex, placementVariant, placedMomentX);
    });
    var variantCandidateCount = Math.min(8, candidates.length);
    var focalCandidateCount = Math.min(8, candidates.length);
    var candidateIndex = entityIndex === 0
      ? placementVariant % focalCandidateCount
      : (placementVariant + entityIndex * 3) % variantCandidateCount;
    var slot = candidates[candidateIndex];
    used[slot.row + ":" + slot.col] = true;
    entity.row = slot.row;
    entity.col = slot.col;
    placedMomentX += getNormalizedCoordinates(slot, rows).x;
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

function collectOccupiedVisualCells(level) {
  var cells = [];
  level.layout.forEach(function (rowString, rowIndex) {
    rowString.split("").forEach(function (cellValue, colIndex) {
      if (cellValue !== ".") {
        cells.push({ row: rowIndex, col: colIndex, special: false });
      }
    });
  });
  level.specialEntities.forEach(function (entity) {
    cells.push({ row: entity.row, col: entity.col, special: true, entity: entity });
  });
  return cells;
}

function analyzeVisualComposition(level, spec) {
  var cells = collectOccupiedVisualCells(level);
  if (cells.length === 0) {
    throw new Error("Level " + level.levelId + " visual composition has no occupied cells.");
  }
  var leftCount = 0;
  var rightCount = 0;
  var momentX = 0;
  var leftBottomRow = -1;
  var rightBottomRow = -1;
  var rows = level.layout;
  var rowBounds = [];
  var focusNearCount = 0;
  var accentDirection = level.levelId % 2 === 0 ? -1 : 1;
  var focusX = spec.focusX * accentDirection;

  cells.forEach(function (cell) {
    var coordinates = getNormalizedCoordinates(cell, rows);
    momentX += coordinates.x;
    if (coordinates.x < -0.08) {
      leftCount += 1;
      leftBottomRow = Math.max(leftBottomRow, cell.row);
    } else if (coordinates.x > 0.08) {
      rightCount += 1;
      rightBottomRow = Math.max(rightBottomRow, cell.row);
    }
    if (pointDistance(coordinates.x, coordinates.y, focusX, spec.focusY, 1, 1.25) <= 0.4) {
      focusNearCount += 1;
    }
    if (!rowBounds[cell.row]) {
      rowBounds[cell.row] = {
        count: 0,
        minX: coordinates.x,
        maxX: coordinates.x
      };
    }
    rowBounds[cell.row].count += 1;
    rowBounds[cell.row].minX = Math.min(rowBounds[cell.row].minX, coordinates.x);
    rowBounds[cell.row].maxX = Math.max(rowBounds[cell.row].maxX, coordinates.x);
  });

  var maxRowCountJump = 0;
  var maxEdgeJump = 0;
  var repeatedRectangleRun = 1;
  var maxRepeatedRectangleRun = 1;
  for (var rowIndex = 2; rowIndex < rowBounds.length; rowIndex += 1) {
    var previous = rowBounds[rowIndex - 1];
    var current = rowBounds[rowIndex];
    if (!previous || !current) {
      throw new Error("Level " + level.levelId + " silhouette contains an empty occupied row gap.");
    }
    maxRowCountJump = Math.max(maxRowCountJump, Math.abs(current.count - previous.count));
    maxEdgeJump = Math.max(
      maxEdgeJump,
      Math.abs(current.minX - previous.minX),
      Math.abs(current.maxX - previous.maxX)
    );
    if (Math.abs(current.minX - previous.minX) < 0.01 &&
        Math.abs(current.maxX - previous.maxX) < 0.01 &&
        current.count === previous.count) {
      repeatedRectangleRun += 1;
      maxRepeatedRectangleRun = Math.max(maxRepeatedRectangleRun, repeatedRectangleRun);
    } else {
      repeatedRectangleRun = 1;
    }
  }

  var focalSpecialDistance = null;
  if (level.specialEntities.length > 0) {
    var focalEntity = level.specialEntities.slice().sort(function (entityA, entityB) {
      var rankDelta = getFocalEntityRank(entityA) - getFocalEntityRank(entityB);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return String(entityA.id).localeCompare(String(entityB.id));
    })[0];
    var focalCoordinates = getNormalizedCoordinates(focalEntity, rows);
    focalSpecialDistance = pointDistance(
      focalCoordinates.x,
      focalCoordinates.y,
      focusX,
      spec.focusY,
      1,
      1.25
    );
  }

  return {
    occupiedCount: cells.length,
    centroidX: momentX / cells.length,
    sideCountDifference: Math.abs(leftCount - rightCount),
    allowedSideCountDifference: Math.max(1, Math.ceil(cells.length * 0.1)),
    bottomRowDifference: Math.abs(leftBottomRow - rightBottomRow),
    maxRowCountJump: maxRowCountJump,
    maxEdgeJump: maxEdgeJump,
    maxRepeatedRectangleRun: maxRepeatedRectangleRun,
    focusNearCount: focusNearCount,
    focalSpecialDistance: focalSpecialDistance
  };
}

function validateVisualComposition(level, spec) {
  var metrics = analyzeVisualComposition(level, spec);
  if (Math.abs(metrics.centroidX) > 0.12) {
    throw new Error("Level " + level.levelId + " visual centroid is unstable: " + metrics.centroidX.toFixed(3) + ".");
  }
  if (metrics.sideCountDifference > metrics.allowedSideCountDifference) {
    throw new Error(
      "Level " + level.levelId + " left-right visual weight differs by " +
      metrics.sideCountDifference + " cells."
    );
  }
  if (metrics.bottomRowDifference > 1) {
    throw new Error("Level " + level.levelId + " left-right bottom extent differs by more than one row.");
  }
  if (metrics.maxRowCountJump > 4) {
    throw new Error("Level " + level.levelId + " silhouette row width changes too abruptly.");
  }
  if (metrics.maxEdgeJump > 0.56) {
    throw new Error("Level " + level.levelId + " silhouette edge has a hard step.");
  }
  if (metrics.maxRepeatedRectangleRun > 3) {
    throw new Error("Level " + level.levelId + " silhouette contains a rigid rectangular edge run.");
  }
  if (metrics.focusNearCount < 3) {
    throw new Error("Level " + level.levelId + " silhouette does not establish its visual focus.");
  }
  if (metrics.focalSpecialDistance !== null && metrics.focalSpecialDistance > 0.58) {
    throw new Error("Level " + level.levelId + " focal special entity is too far from the visual focus.");
  }
  return metrics;
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
  var visualMetrics = validateVisualComposition(level, spec);
  return {
    themeName: spec.themeName,
    patternName: spec.patternName,
    focusName: spec.focusName,
    specialDensity: specialDensity,
    visualMetrics: visualMetrics
  };
}

module.exports = {
  FIRST_LEVEL_ID: FIRST_LEVEL_ID,
  LAST_LEVEL_ID: LAST_LEVEL_ID,
  COLORS: COLORS.slice(),
  PATTERNS: PATTERNS.slice(),
  THEME_GROUPS: JSON.parse(JSON.stringify(THEME_GROUPS)),
  LEVEL_ONE_TUTORIAL_LAYOUT: LEVEL_ONE_TUTORIAL_LAYOUT.slice(),
  buildLevelSpec: buildLevelSpec,
  buildBoard: buildBoard,
  getDifficultyTuning: getDifficultyTuning,
  assertTableRowMatchesDesign: assertTableRowMatchesDesign,
  analyzeVisualComposition: analyzeVisualComposition,
  validateVisualComposition: validateVisualComposition,
  validateGeneratedLevel: validateGeneratedLevel
};
