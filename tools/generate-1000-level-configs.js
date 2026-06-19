"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var RESOURCE_LEVEL_DIR = path.join(PROJECT_ROOT, "assets/resources/config/levels");
var RESOURCE_CONFIG_DIR = path.join(PROJECT_ROOT, "assets/resources/config");
var MIRROR_LEVEL_DIR = path.join(PROJECT_ROOT, "levels");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(RESOURCE_CONFIG_DIR, "level_manifest.json");
var LEVEL_CONFIG_TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var TARGET_LEVEL_COUNT = 1000;
var LOCAL_LEVEL_MAX = 10;
var REMOTE_PACK_SIZE = 100;
var START_GENERATED_LEVEL_ID = 41;
var CLOUD_ENV_ID = "cloud1-d7gqettx3e9249ca1";
var CLOUD_FILE_ID_PREFIX = "cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608";
var CLOUD_PACK_ROOT = "level-packs-compact";
var MANIFEST_VERSION = "levels-1000-compact-v1";
var COLORS = ["R", "G", "B", "Y", "P"];
var COLOR_NAMES = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple"
};
var COLOR_TABLE_COLUMNS = {
  B: "蓝球",
  R: "红球",
  G: "绿球",
  Y: "黄球",
  P: "紫球"
};
var SPLITTER_TABLE_COLUMNS = {
  B: "蓝分裂球",
  R: "红分裂球",
  G: "绿分裂球",
  Y: "黄分裂球",
  P: "紫分裂球"
};
var TOP_BOARD_ROW_INDEX = 0;
var PATTERNS = [
  "arrow",
  "heart",
  "diamond",
  "spiral",
  "gate",
  "flame",
  "flower",
  "keyhole",
  "crown",
  "wave"
];
var SPECIAL_SLOTS = [
  { row: 1, col: 1 },
  { row: 1, col: 6 },
  { row: 2, col: 3 },
  { row: 2, col: 6 },
  { row: 3, col: 2 },
  { row: 3, col: 5 },
  { row: 4, col: 1 },
  { row: 4, col: 4 },
  { row: 4, col: 7 },
  { row: 5, col: 3 },
  { row: 5, col: 6 },
  { row: 6, col: 2 },
  { row: 6, col: 5 },
  { row: 7, col: 1 },
  { row: 7, col: 4 },
  { row: 7, col: 7 }
];

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function getLevelFileName(levelId) {
  return "level_" + padLevelId(levelId) + ".json";
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function parseCsvLine(line) {
  var cells = [];
  var cell = "";
  var inQuotes = false;
  for (var index = 0; index < line.length; index += 1) {
    var ch = line[index];
    if (ch === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (inQuotes) {
    throw new Error("CSV line has unclosed quote: " + line);
  }
  cells.push(cell);
  return cells;
}

function parsePositiveIntegerCell(row, columnName, levelId) {
  if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
    throw new Error("Level config table missing column `" + columnName + "`.");
  }
  var value = Number(row[columnName]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Level " + levelId + " table column `" + columnName + "` must be positive integer.");
  }
  return value;
}

function parseNonNegativeIntegerCell(row, columnName, levelId) {
  if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
    throw new Error("Level config table missing column `" + columnName + "`.");
  }
  var value = Number(row[columnName]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Level " + levelId + " table column `" + columnName + "` must be non-negative integer.");
  }
  return value;
}

function loadLevelConfigTable() {
  if (!fs.existsSync(LEVEL_CONFIG_TABLE_PATH)) {
    throw new Error("Missing level config table: " + LEVEL_CONFIG_TABLE_PATH);
  }

  var text = stripBom(fs.readFileSync(LEVEL_CONFIG_TABLE_PATH, "utf8")).replace(/\r\n/g, "\n").trim();
  var lines = text.split("\n");
  if (lines.length !== TARGET_LEVEL_COUNT + 1) {
    throw new Error("Level config table must contain header plus " + TARGET_LEVEL_COUNT + " rows.");
  }

  var headers = parseCsvLine(lines[0]);
  var table = {};
  for (var lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    var cells = parseCsvLine(lines[lineIndex]);
    if (cells.length !== headers.length) {
      throw new Error("Level config table row " + lineIndex + " column count mismatch.");
    }
    var rawRow = {};
    headers.forEach(function (header, index) {
      rawRow[header] = cells[index];
    });
    var levelId = parsePositiveIntegerCell(rawRow, "关卡", lineIndex);
    if (levelId !== lineIndex) {
      throw new Error("Level config table must be continuous at row " + lineIndex + ", got level " + levelId);
    }
    table[levelId] = normalizeTableRow(rawRow, levelId);
  }

  return table;
}

var levelConfigTableCache = null;

function getLevelConfigTable() {
  if (!levelConfigTableCache) {
    levelConfigTableCache = loadLevelConfigTable();
  }
  return levelConfigTableCache;
}

function getTableRow(levelId) {
  var table = getLevelConfigTable();
  var row = table[levelId];
  if (!row) {
    throw new Error("Missing level config table row for level " + levelId);
  }
  return row;
}

function parseCollectionTargetDisplay(display, levelId, fieldName) {
  if (typeof display !== "string" || !display.trim() || display === "-") {
    return null;
  }
  if (/^\d+$/.test(display)) {
    return {
      type: "collect_any",
      value: parsePositiveIntegerCell({ value: display }, "value", levelId)
    };
  }
  if (/^[RGBYP]:\d+$/.test(display)) {
    return {
      type: "collect_color",
      color: display[0],
      value: parsePositiveIntegerCell({ value: display.slice(2) }, "value", levelId)
    };
  }
  if (/^雪球:\d+$/.test(display)) {
    return {
      type: "collect_ice_snowball",
      value: parsePositiveIntegerCell({ value: display.slice(3) }, "value", levelId)
    };
  }
  throw new Error("Level " + levelId + " table `" + fieldName + "` has invalid target display: " + display);
}

function normalizeTableRow(rawRow, levelId) {
  var colorCounts = {};
  COLORS.forEach(function (color) {
    colorCounts[color] = parseNonNegativeIntegerCell(rawRow, COLOR_TABLE_COLUMNS[color], levelId);
  });
  var splitterCounts = {};
  COLORS.forEach(function (color) {
    splitterCounts[color] = parseNonNegativeIntegerCell(rawRow, SPLITTER_TABLE_COLUMNS[color], levelId);
  });
  var rowCount = parsePositiveIntegerCell(rawRow, "总行数", levelId);
  if (rowCount > 20) {
    throw new Error("Level " + levelId + " table row count must be <= 20.");
  }
  var shotLimit = parsePositiveIntegerCell(rawRow, "发射球数量", levelId);
  if (shotLimit > 30) {
    throw new Error("Level " + levelId + " table shot count must be <= 30.");
  }

  var target1 = parseCollectionTargetDisplay(rawRow["收集目标1"], levelId, "收集目标1");
  var target2 = parseCollectionTargetDisplay(rawRow["收集目标2"], levelId, "收集目标2");
  if (!target1) {
    throw new Error("Level " + levelId + " table requires 收集目标1.");
  }
  if (target2 && target2.type !== "collect_ice_snowball") {
    throw new Error("Level " + levelId + " table 收集目标2 only supports 雪球 target.");
  }

  return {
    levelId: levelId,
    colorCounts: colorCounts,
    rowCount: rowCount,
    specialCounts: {
      stone: parseNonNegativeIntegerCell(rawRow, "石头", levelId),
      ice: parseNonNegativeIntegerCell(rawRow, "雪块", levelId),
      blast: parseNonNegativeIntegerCell(rawRow, "炸弹", levelId),
      rainbow: parseNonNegativeIntegerCell(rawRow, "彩虹球", levelId),
      molotov: parseNonNegativeIntegerCell(rawRow, "燃烧瓶", levelId),
      splitters: splitterCounts,
      key: parseNonNegativeIntegerCell(rawRow, "钥匙", levelId),
      locked: parseNonNegativeIntegerCell(rawRow, "锁定球", levelId)
    },
    target1: target1,
    target2: target2,
    shotLimit: shotLimit
  };
}

function getPackId(from, to) {
  return "levels_pack_" + padLevelId(from) + "_" + padLevelId(to);
}

function getPackFileName(from, to) {
  return getPackId(from, to) + ".json";
}

function makeUuid(seed) {
  var hex = crypto.createHash("md5").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, toJsonText(value), "utf8");
}

function toJsonText(value) {
  return JSON.stringify(value, null, 4) + "\n";
}

function toCompactJsonText(value) {
  return JSON.stringify(value) + "\n";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getColumnCount(rowIndex) {
  return BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
}

function makeEmptyRows(rowCount) {
  var rows = [];
  for (var row = 0; row < rowCount; row += 1) {
    rows.push(".".repeat(getColumnCount(row)));
  }
  return rows;
}

function setCell(rows, row, col, value) {
  if (!Number.isInteger(row) || row < 0 || row >= rows.length) {
    throw new Error("Generated row out of range: " + row);
  }
  if (!Number.isInteger(col) || col < 0 || col >= rows[row].length) {
    throw new Error("Generated col out of range: " + row + ":" + col);
  }
  var chars = rows[row].split("");
  chars[col] = value;
  rows[row] = chars.join("");
}

function fillRows(levelId, colors, patternName) {
  var rows = makeEmptyRows(8);
  for (var row = 0; row < rows.length; row += 1) {
    for (var col = 0; col < rows[row].length; col += 1) {
      var index = row * 3 + col * 5 + levelId;
      if (patternName === "arrow" && col >= Math.max(0, 4 - row) && col <= Math.min(rows[row].length - 1, 3 + row)) {
        index += 2;
      } else if (patternName === "heart" && row < 3 && (col === 1 || col === 2 || col === 5 || col === 6)) {
        index += 3;
      } else if (patternName === "diamond" && Math.abs(col - 3.5) <= Math.max(0.5, 3.5 - Math.abs(row - 3.5))) {
        index += 4;
      } else if (patternName === "spiral" && (row === 0 || col === 0 || row === rows.length - 1 || col === rows[row].length - 1)) {
        index += 1;
      } else if (patternName === "gate" && (col === 1 || col === rows[row].length - 2 || row === 0)) {
        index += 2;
      } else if (patternName === "flame" && row >= 2 && Math.abs(col - 3.5) <= 2) {
        index += row;
      } else if (patternName === "flower" && (row === 2 || row === 5 || col === 2 || col === 5)) {
        index += 4;
      } else if (patternName === "keyhole" && (row < 3 || (col >= 3 && col <= 4))) {
        index += 3;
      } else if (patternName === "crown" && (row === 0 || (row === 1 && (col === 1 || col === 3 || col === 6)))) {
        index += 2;
      } else if (patternName === "wave" && ((row + col + levelId) % 4 === 0)) {
        index += 1;
      }
      setCell(rows, row, col, colors[index % colors.length]);
    }
  }
  return rows;
}

function buildSpecialSlotPool(rows) {
  var seen = {};
  var slots = [];

  function pushSlot(row, col) {
    if (row >= rows.length || col >= rows[row].length) {
      return;
    }
    var key = row + ":" + col;
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    slots.push({
      row: row,
      col: col
    });
  }

  SPECIAL_SLOTS.forEach(function (slot) {
    pushSlot(slot.row, slot.col);
  });
  for (var row = 0; row < rows.length; row += 1) {
    for (var col = 0; col < rows[row].length; col += 1) {
      pushSlot(row, col);
    }
  }

  return slots;
}

function hashString(value) {
  var text = String(value);
  var hash = 0;
  for (var index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function isSplitterEntity(entity) {
  return !!(entity && entity.entityCategory === "reactive_ball" && entity.entityType === "splitter");
}

function isForbiddenSpecialSlot(entity, slot) {
  if (!slot) {
    throw new Error("Special entity slot is required.");
  }
  return isSplitterEntity(entity) && slot.row === TOP_BOARD_ROW_INDEX;
}

function assignSpecialEntitySlot(rows, slotPool, usedSlotIndexes, entity, levelId, entityIndex, placementVariant) {
  if (!Array.isArray(slotPool) || slotPool.length <= 0) {
    throw new Error("Special entity slot pool is empty.");
  }
  if (!Array.isArray(rows) || rows.length <= 0) {
    throw new Error("Special entity rows are required.");
  }
  var entityHash = hashString(entity.entityCategory + ":" + entity.entityType + ":" + entity.id);
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("Special entity placement variant must be a non-negative integer.");
  }
  var rowStep = rows.length % 2 === 0 ? 5 : 3;
  var typeSalt = hashString(entity.entityCategory + ":" + entity.entityType);
  var levelWave = levelId + Math.floor(levelId / 2) * 3 + Math.floor(levelId / 5) * 5 + placementVariant * 17;
  var levelSalt = hashString(levelId + ":" + rows.length + ":" + entityIndex + ":" + placementVariant);
  var preferredRow = (entityHash + levelWave * rowStep + entityIndex * 11 + typeSalt + (levelSalt % 17)) % rows.length;
  var preferredCol = ((entityHash >>> 3) + levelWave * 9 + entityIndex * 7 + typeSalt + ((levelSalt >>> 4) % 19)) % rows[preferredRow].length;
  var baseIndex = -1;
  for (var index = 0; index < slotPool.length; index += 1) {
    if (slotPool[index].row === preferredRow && slotPool[index].col === preferredCol) {
      baseIndex = index;
      break;
    }
  }
  if (baseIndex < 0) {
    throw new Error("Special entity preferred slot is missing from slot pool.");
  }
  var selectedIndex = -1;
  var searchStep = 1 + ((typeSalt + levelSalt + levelWave * 13 + entityIndex * 19) % Math.max(1, slotPool.length - 1));
  for (var offset = 0; offset < slotPool.length; offset += 1) {
    var candidateIndex = (baseIndex + offset * searchStep) % slotPool.length;
    if (usedSlotIndexes[candidateIndex] !== true && !isForbiddenSpecialSlot(entity, slotPool[candidateIndex])) {
      selectedIndex = candidateIndex;
      break;
    }
  }
  if (selectedIndex < 0) {
    for (var fallbackIndex = 0; fallbackIndex < slotPool.length; fallbackIndex += 1) {
      if (usedSlotIndexes[fallbackIndex] !== true && !isForbiddenSpecialSlot(entity, slotPool[fallbackIndex])) {
        selectedIndex = fallbackIndex;
        break;
      }
    }
  }
  if (selectedIndex < 0) {
    throw new Error("Special entity could not resolve an unused slot.");
  }
  usedSlotIndexes[selectedIndex] = true;
  var slot = slotPool[selectedIndex];
  setCell(rows, slot.row, slot.col, ".");
  return slot;
}

function sumColorCounts(colorCounts) {
  return COLORS.reduce(function (sum, color) {
    return sum + colorCounts[color];
  }, 0);
}

function countTableSplitters(splitterCounts) {
  return COLORS.reduce(function (sum, color) {
    return sum + splitterCounts[color];
  }, 0);
}

function getActiveColors(tableRow) {
  var activeColors = COLORS.filter(function (color) {
    return tableRow.colorCounts[color] > 0;
  });
  if (!activeColors.length) {
    throw new Error("Level " + tableRow.levelId + " table requires at least one color count.");
  }
  return activeColors;
}

function requireTargetColorSupply(tableRow, color, targetValue, extraSupply) {
  var supply = tableRow.colorCounts[color];
  if (!Number.isInteger(supply) || supply <= 0) {
    throw new Error("Level " + tableRow.levelId + " target color has no supply: " + color);
  }
  if (targetValue > supply + extraSupply) {
    throw new Error("Level " + tableRow.levelId + " target exceeds color supply: " + color);
  }
}

function validateTableTargets(tableRow) {
  if (tableRow.target1.type === "collect_any") {
    throw new Error("Level " + tableRow.levelId + " table no longer supports collect_any.");
  }
  if (tableRow.target1.type === "collect_color") {
    var splitterCount = tableRow.specialCounts.splitters[tableRow.target1.color];
    var splitterBonus = splitterCount * 5;
    var colorSupply = tableRow.colorCounts[tableRow.target1.color];
    if (!Number.isInteger(colorSupply) || colorSupply <= 0) {
      throw new Error("Level " + tableRow.levelId + " target color has no supply: " + tableRow.target1.color);
    }
    var minTarget = colorSupply + splitterBonus;
    if (tableRow.target1.value < minTarget) {
      throw new Error("Level " + tableRow.levelId + " collect_color target below minimum: " + tableRow.target1.color);
    }
    requireTargetColorSupply(tableRow, tableRow.target1.color, tableRow.target1.value, splitterBonus);
  }
  if (tableRow.target2) {
    if (tableRow.target2.value !== tableRow.specialCounts.ice) {
      throw new Error("Level " + tableRow.levelId + " snow target must equal ice count.");
    }
  }

  var splitterColors = COLORS.filter(function (color) {
    return tableRow.specialCounts.splitters[color] > 0;
  });
  if (splitterColors.length > 1) {
    throw new Error("Level " + tableRow.levelId + " table cannot configure multiple splitter colors.");
  }
  if (splitterColors.length === 1) {
    if (tableRow.target1.type !== "collect_color" || tableRow.target1.color !== splitterColors[0]) {
      throw new Error("Level " + tableRow.levelId + " splitter target must match split color.");
    }
  }
  if (tableRow.specialCounts.key !== tableRow.specialCounts.locked) {
    throw new Error("Level " + tableRow.levelId + " key and locked counts must match.");
  }
}

function buildTableSpecialEntities(tableRow, activeColors) {
  var levelId = tableRow.levelId;
  var counts = tableRow.specialCounts;
  var entities = [];

  function pushRepeated(count, factory) {
    for (var index = 0; index < count; index += 1) {
      entities.push(factory(index));
    }
  }

  pushRepeated(counts.stone, function (index) {
    return {
      id: "stone_" + String(index + 1).padStart(2, "0"),
      entityCategory: "obstacle_ball",
      entityType: "stone"
    };
  });
  pushRepeated(counts.ice, function (index) {
    return {
      id: "ice_" + String(index + 1).padStart(2, "0"),
      entityCategory: "obstacle_ball",
      entityType: "ice",
      innerColor: activeColors[(levelId + index) % activeColors.length]
    };
  });
  pushRepeated(counts.blast, function (index) {
    return {
      id: "skill_blast_" + String(index + 1).padStart(2, "0"),
      entityCategory: "skill_ball",
      entityType: "blast"
    };
  });
  pushRepeated(counts.rainbow, function (index) {
    return {
      id: "skill_rainbow_" + String(index + 1).padStart(2, "0"),
      entityCategory: "skill_ball",
      entityType: "rainbow"
    };
  });
  pushRepeated(counts.molotov, function (index) {
    return {
      id: "molotov_" + String(index + 1).padStart(2, "0"),
      entityCategory: "reactive_ball",
      entityType: "molotov",
      blastRadius: 2
    };
  });

  COLORS.forEach(function (color) {
    pushRepeated(counts.splitters[color], function (index) {
      return {
        id: "splitter_" + color + "_" + String(index + 1).padStart(2, "0"),
        entityCategory: "reactive_ball",
        entityType: "splitter",
        splitColor: color
      };
    });
  });

  pushRepeated(counts.key, function (index) {
    return {
      id: "key_" + String(index + 1).padStart(2, "0"),
      entityCategory: "key_ball",
      entityType: "key"
    };
  });
  pushRepeated(counts.locked, function (index) {
    return {
      id: "locked_" + String(index + 1).padStart(2, "0"),
      entityCategory: "locked_ball",
      entityType: "locked",
      lockedColor: activeColors[(levelId + index + 1) % activeColors.length]
    };
  });

  return entities;
}

function placeTableSpecialEntities(rows, entities, levelId, placementVariant) {
  var slots = buildSpecialSlotPool(rows);
  var usedSlotIndexes = {};
  var orderedEntities = entities.slice().sort(function (entityA, entityB) {
    var rank = function (entity) {
      if (isSplitterEntity(entity)) {
        return 0;
      }
      return 1;
    };
    return rank(entityA) - rank(entityB);
  });
  orderedEntities.forEach(function (entity, index) {
    var slot = assignSpecialEntitySlot(rows, slots, usedSlotIndexes, entity, levelId, index, placementVariant);
    entity.row = slot.row;
    entity.col = slot.col;
  });
}

function fillTableLayoutColors(rows, entities, tableRow, activeColors) {
  var specialCells = {};
  entities.forEach(function (entity) {
    specialCells[entity.row + ":" + entity.col] = true;
  });

  var remaining = {};
  activeColors.forEach(function (color) {
    remaining[color] = tableRow.colorCounts[color];
  });
  var remainingTotal = sumColorCounts(tableRow.colorCounts);
  var fillIndex = 0;
  for (var row = 0; row < rows.length && remainingTotal > 0; row += 1) {
    for (var col = 0; col < rows[row].length && remainingTotal > 0; col += 1) {
      if (specialCells[row + ":" + col]) {
        continue;
      }
      var selectedColor = null;
      for (var offset = 0; offset < activeColors.length; offset += 1) {
        var candidate = activeColors[(fillIndex + levelIdOffset(tableRow.levelId) + offset) % activeColors.length];
        if (remaining[candidate] > 0) {
          selectedColor = candidate;
          break;
        }
      }
      if (!selectedColor) {
        throw new Error("Level " + tableRow.levelId + " has unresolved color fill state.");
      }
      setCell(rows, row, col, selectedColor);
      remaining[selectedColor] -= 1;
      remainingTotal -= 1;
      fillIndex += 1;
    }
  }

  if (remainingTotal !== 0) {
    throw new Error("Level " + tableRow.levelId + " table color counts exceed available layout slots.");
  }
}

function levelIdOffset(levelId) {
  return (levelId * 7) % COLORS.length;
}

function buildWinConditionsFromTable(tableRow) {
  var conditions = [clone(tableRow.target1)];
  if (tableRow.target2) {
    conditions.push(clone(tableRow.target2));
  }
  return conditions;
}

function resolveJarColors(activeColors, target) {
  var jarColors = activeColors.slice(0, Math.min(4, activeColors.length));
  if (target && target.type === "collect_color" && jarColors.indexOf(target.color) === -1) {
    if (!jarColors.length) {
      throw new Error("Jar colors require at least one active color.");
    }
    jarColors[jarColors.length - 1] = target.color;
  }
  return jarColors;
}

function buildTargetScoreFromTable(tableRow) {
  var primaryValue = Math.max(0, Math.floor(Number(tableRow.target1.value) || 0));
  var snowValue = tableRow.target2 ? Math.max(0, Math.floor(Number(tableRow.target2.value) || 0)) : 0;
  var specialTotal = tableRow.specialCounts.stone +
    tableRow.specialCounts.ice +
    tableRow.specialCounts.blast +
    tableRow.specialCounts.rainbow +
    tableRow.specialCounts.molotov +
    countTableSplitters(tableRow.specialCounts.splitters) +
    tableRow.specialCounts.key +
    tableRow.specialCounts.locked;
  return Math.max(100, Math.round(primaryValue * 180 + snowValue * 220 + specialTotal * 40 + tableRow.rowCount * 30));
}

function buildRewardItemsFromTable(levelId) {
  var progress = (levelId - 1) / (TARGET_LEVEL_COUNT - 1);
  var items = [{
    id: "coin",
    count: Math.min(300, 50 + Math.floor(progress * 250))
  }];
  if (levelId <= 4 || levelId % 10 === 0) {
    items.push({
      id: "stamina",
      count: Math.min(3, 1 + Math.floor(progress * 2))
    });
  }
  return items;
}

function getChapter(levelId) {
  if (levelId <= 60) {
    return "molotov_intro";
  }
  if (levelId <= 80) {
    return "splitter_intro";
  }
  if (levelId <= 100) {
    return "lock_key_intro";
  }
  if (levelId <= 140) {
    return "molotov_splitter_combo";
  }
  if (levelId <= 180) {
    return "splitter_lock_combo";
  }
  if (levelId <= 200) {
    return "full_reactive_exam";
  }
  var cycle = Math.floor((levelId - 201) / 100) % 4;
  return ["blast_chain_routes", "growth_and_keys", "symbolic_patterns", "full_system_mastery"][cycle];
}

function getMechanics(levelId) {
  var chapter = getChapter(levelId);
  if (chapter === "molotov_intro") {
    return ["molotov"];
  }
  if (chapter === "splitter_intro") {
    return ["splitter"];
  }
  if (chapter === "lock_key_intro") {
    return ["locked"];
  }
  if (chapter === "molotov_splitter_combo") {
    return ["molotov", "splitter"];
  }
  if (chapter === "splitter_lock_combo") {
    return ["splitter", "locked"];
  }
  if (chapter === "full_reactive_exam" || chapter === "full_system_mastery") {
    return ["molotov", "splitter", "locked"];
  }
  if (chapter === "blast_chain_routes") {
    return ["molotov", "legacy"];
  }
  if (chapter === "growth_and_keys") {
    return ["splitter", "locked"];
  }
  return ["molotov", "splitter", "locked", "legacy"];
}

function makeSpecialEntities(levelId, rows, colors, mechanics, placementVariant) {
  var slots = buildSpecialSlotPool(rows);
  var entities = [];
  var slotIndex = 0;
  var usedSlotIndexes = {};

  function nextSlot(entity) {
    if (slotIndex >= slots.length) {
      throw new Error("Generated special entity exceeded available slot count.");
    }
    var slot = assignSpecialEntitySlot(rows, slots, usedSlotIndexes, entity, levelId, slotIndex, placementVariant);
    slotIndex += 1;
    return slot;
  }

  function pushEntity(entity) {
    var slot = nextSlot(entity);
    entity.row = slot.row;
    entity.col = slot.col;
    entities.push(entity);
  }

  if (mechanics.indexOf("molotov") >= 0) {
    pushEntity({
      id: "molotov_01",
      entityCategory: "reactive_ball",
      entityType: "molotov",
      blastRadius: 2
    });
    if (levelId >= 55) {
      pushEntity({
        id: "molotov_02",
        entityCategory: "reactive_ball",
        entityType: "molotov",
        blastRadius: 2
      });
    }
  }

  if (mechanics.indexOf("splitter") >= 0) {
    var splitterColor = colors[levelId % colors.length];
    pushEntity({
      id: "splitter_01",
      entityCategory: "reactive_ball",
      entityType: "splitter",
      splitColor: splitterColor
    });
    if (levelId >= 120) {
      pushEntity({
        id: "splitter_02",
        entityCategory: "reactive_ball",
        entityType: "splitter",
        splitColor: splitterColor
      });
    }
  }

  if (mechanics.indexOf("locked") >= 0) {
    var lockedColors = [colors[(levelId + 1) % colors.length]];
    if (levelId >= 160) {
      lockedColors.push(colors[(levelId + 3) % colors.length]);
    }
    lockedColors.forEach(function (lockedColor, index) {
      var suffix = String(index + 1).padStart(2, "0");
      pushEntity({
        id: "key_" + suffix,
        entityCategory: "key_ball",
        entityType: "key"
      });
      pushEntity({
        id: "locked_" + suffix,
        entityCategory: "locked_ball",
        entityType: "locked",
        lockedColor: lockedColor
      });
    });
  }

  if (mechanics.indexOf("legacy") >= 0 || levelId % 5 === 0) {
    pushEntity({
      id: "stone_01",
      entityCategory: "obstacle_ball",
      entityType: "stone"
    });
  }
  if (mechanics.indexOf("legacy") >= 0 || levelId % 7 === 0) {
    pushEntity({
      id: "skill_blast_01",
      entityCategory: "skill_ball",
      entityType: "blast"
    });
  }
  if (levelId % 9 === 0) {
    pushEntity({
      id: "skill_rainbow_01",
      entityCategory: "skill_ball",
      entityType: "rainbow"
    });
  }
  if (levelId % 11 === 0) {
    pushEntity({
      id: "ice_01",
      entityCategory: "obstacle_ball",
      entityType: "ice",
      innerColor: colors[(levelId + 4) % colors.length]
    });
  }

  return entities;
}

function findSplitterCollectColor(specialEntities) {
  var splitterColor = null;
  specialEntities.forEach(function (entity) {
    if (!entity || entity.entityCategory !== "reactive_ball" || entity.entityType !== "splitter") {
      return;
    }
    if (typeof entity.splitColor !== "string" || !entity.splitColor) {
      throw new Error("Generated splitter requires splitColor.");
    }
    if (splitterColor !== null && splitterColor !== entity.splitColor) {
      throw new Error("Generated splitter colors must match within one level.");
    }
    splitterColor = entity.splitColor;
  });
  return splitterColor;
}

function ensureJarContainsCollectColor(jarColors, collectColor) {
  if (typeof collectColor !== "string" || !collectColor) {
    throw new Error("Collect color is required.");
  }
  if (jarColors.indexOf(collectColor) >= 0) {
    return jarColors;
  }
  if (!jarColors.length) {
    throw new Error("jarColors must be non-empty before collect color injection.");
  }
  jarColors[jarColors.length - 1] = collectColor;
  return jarColors;
}

function buildWinConditions(levelId, collectTarget, collectColor, splitterCollectColor) {
  if (splitterCollectColor) {
    return [
      { type: "clear_all", value: 1 },
      { type: "collect_color", color: splitterCollectColor, value: Math.max(8, Math.floor(collectTarget * 0.55)) }
    ];
  }
  return [
    { type: "clear_all", value: 1 },
    levelId % 4 === 0
      ? { type: "collect_color", color: collectColor, value: Math.max(8, Math.floor(collectTarget * 0.45)) }
      : { type: "collect_any", value: collectTarget }
  ];
}

function makeLevel(levelId, placementVariant) {
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("Level placement variant must be a non-negative integer: " + levelId);
  }
  var progress = (levelId - 1) / (TARGET_LEVEL_COUNT - 1);
  var tableRow = getTableRow(levelId);
  validateTableTargets(tableRow);
  var colors = getActiveColors(tableRow);
  var patternName = PATTERNS[levelId % PATTERNS.length];
  var rows = makeEmptyRows(tableRow.rowCount);
  var specialEntities = buildTableSpecialEntities(tableRow, colors);
  placeTableSpecialEntities(rows, specialEntities, levelId, placementVariant);
  fillTableLayoutColors(rows, specialEntities, tableRow, colors);
  var mechanics = getMechanics(levelId);
  var jarColors = resolveJarColors(colors, tableRow.target1);

  var spawnWeights = {};
  colors.forEach(function (color, index) {
    spawnWeights[color] = 1 + ((levelId + index) % 3) * 0.15;
  });

  return {
    schemaVersion: 1,
    gameMode: "glass_marble_bubble",
    coordinateSystem: "odd-r-hex",
    layoutNotes: {
      description: "Top-to-bottom rows. Each character represents one grid cell.",
      legend: colors.reduce(function (legend, color) {
        legend[color] = COLOR_NAMES[color];
        return legend;
      }, { ".": "empty" }),
      pattern: patternName
    },
    sharedDefaults: {
      collectMode: "any_with_same_color_bonus",
      loseConditions: [
        { type: "reach_danger_line", value: 1 },
        { type: "run_out_of_shots", value: 1 }
      ],
      fallingRules: {
        maxDynamicMarbles: 10,
        maxBounces: 2,
        enableMarbleMarbleCollision: true
      }
    },
    level: {
      levelId: levelId,
      code: "L" + padLevelId(levelId) + "_" + getChapter(levelId).toUpperCase(),
      difficulty: progress < 0.18 ? "advanced" : (progress < 0.55 ? "hard" : "expert"),
      teaches: mechanics.concat([patternName + "_pattern"]),
      colorCount: colors.length,
      colors: colors,
      shotLimit: tableRow.shotLimit,
      targetScore: buildTargetScoreFromTable(tableRow),
      dropInterval: Math.max(3, 6 - Math.floor(progress * 4)),
      jarCount: Math.min(4, colors.length),
      jarColors: jarColors,
      spawnWeights: spawnWeights,
      jarRules: {
        rimBounce: Math.min(0.92, 0.68 + progress * 0.22),
        collectZoneScale: Math.max(0.78, 1.1 - progress * 0.25),
        sameColorBonus: Math.min(2.5, 1.5 + progress * 0.8)
      },
      winConditions: buildWinConditionsFromTable(tableRow),
      bonusObjectives: [
        levelId % 3 === 0
          ? { type: "single_turn_drop_count", value: Math.min(18, 6 + Math.floor(progress * 10)) }
          : { type: "clear_with_shots_remaining", value: Math.min(tableRow.shotLimit, 3 + Math.floor(progress * 8)) }
      ],
      clearRewardItems: buildRewardItemsFromTable(levelId),
      layout: rows,
      designNotes: "Generated from LEVEL_CONFIG_TABLE_1_1000.csv. Chapter `" + getChapter(levelId) + "` uses " + mechanics.join(", ") + " with a " + patternName + " board silhouette.",
      difficultyScore: Math.min(100, 34 + Math.floor(progress * 66)),
      specialEntities: specialEntities,
      levelType: "normal",
      playMode: "shot_limited",
      initialDropSpaceRows: 8,
      adPowerupRules: {
        allowed: ["three_line_elimination", "plus_three_balls"],
        maxGrantsPerRun: {
          three_line_elimination: 1,
          plus_three_balls: 1
        }
      }
    },
    difficultyScaleMax: 100
  };
}

var generatedSpecialPositionState = {
  previous: null,
  recentByType: {}
};

function resetGeneratedSpecialPositionState() {
  generatedSpecialPositionState = {
    previous: null,
    recentByType: {}
  };
}

function buildGeneratedSpecialPositionSignatures(level) {
  if (!level || typeof level !== "object") {
    throw new Error("Generated level is required for special position signatures.");
  }
  if (!Array.isArray(level.specialEntities)) {
    throw new Error("Generated level.specialEntities must be an array: " + level.levelId);
  }

  var grouped = {};
  level.specialEntities.forEach(function (entity) {
    if (!entity || typeof entity !== "object") {
      throw new Error("Generated special entity must be an object: " + level.levelId);
    }
    if (typeof entity.entityCategory !== "string" || !entity.entityCategory) {
      throw new Error("Generated special entity entityCategory is required: " + level.levelId);
    }
    if (typeof entity.entityType !== "string" || !entity.entityType) {
      throw new Error("Generated special entity entityType is required: " + level.levelId);
    }
    if (!Number.isInteger(entity.row) || !Number.isInteger(entity.col)) {
      throw new Error("Generated special entity row/col must be integers: " + level.levelId);
    }
    var key = entity.entityCategory + ":" + entity.entityType;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(entity.row + ":" + entity.col);
  });

  var signatures = {};
  Object.keys(grouped).forEach(function (key) {
    signatures[key] = grouped[key].sort().join(",");
  });
  return signatures;
}

function findGeneratedSpecialPositionIssue(config) {
  if (!config || !config.level || typeof config.level !== "object") {
    throw new Error("Generated config missing level.");
  }
  var level = config.level;
  var signatures = buildGeneratedSpecialPositionSignatures(level);

  if (generatedSpecialPositionState.previous) {
    var previous = generatedSpecialPositionState.previous;
    var adjacentRepeatType = Object.keys(signatures).find(function (typeKey) {
      return previous.signatures[typeKey] && previous.signatures[typeKey] === signatures[typeKey];
    });
    if (adjacentRepeatType) {
      return "level " + level.levelId + " repeats adjacent " + adjacentRepeatType + " special positions from level " + previous.levelId;
    }
  }

  var recentRepeatType = Object.keys(signatures).find(function (typeKey) {
    var history = generatedSpecialPositionState.recentByType[typeKey];
    if (!history) {
      return false;
    }
    var sameCount = history.filter(function (item) {
      return item.signature === signatures[typeKey];
    }).length;
    return sameCount >= 2;
  });
  if (recentRepeatType) {
    return "level " + level.levelId + " repeats " + recentRepeatType + " special positions more than twice within 5 levels";
  }

  return "";
}

function commitGeneratedSpecialPositionState(config) {
  if (!config || !config.level || typeof config.level !== "object") {
    throw new Error("Generated config missing level.");
  }
  var level = config.level;
  var signatures = buildGeneratedSpecialPositionSignatures(level);
  Object.keys(signatures).forEach(function (typeKey) {
    var history = generatedSpecialPositionState.recentByType[typeKey];
    if (!history) {
      history = [];
    }
    history.push({
      levelId: level.levelId,
      signature: signatures[typeKey]
    });
    generatedSpecialPositionState.recentByType[typeKey] = history.slice(-4);
  });
  generatedSpecialPositionState.previous = {
    levelId: level.levelId,
    signatures: signatures
  };
}

function makeValidatedLevel(levelId) {
  var maxPlacementVariants = 256;
  var lastIssue = "";
  for (var placementVariant = 0; placementVariant < maxPlacementVariants; placementVariant += 1) {
    var config = makeLevel(levelId, placementVariant);
    var issue = findGeneratedSpecialPositionIssue(config);
    if (!issue) {
      commitGeneratedSpecialPositionState(config);
      return config;
    }
    lastIssue = issue;
  }
  throw new Error("Unable to generate non-repeating special positions for level " + levelId + ": " + lastIssue);
}

function resolveManualCoinRewardCount(levelId) {
  var progress = (levelId - 1) / Math.max(1, LOCAL_LEVEL_MAX - 1);
  return Math.min(300, 50 + Math.floor(progress * 250));
}

function ensureLevelCoinReward(config) {
  if (!config || !config.level || typeof config.level !== "object") {
    throw new Error("Manual level config missing level.");
  }
  var level = config.level;
  if (!Array.isArray(level.clearRewardItems)) {
    level.clearRewardItems = [];
  }
  var hasCoin = false;
  level.clearRewardItems.forEach(function (item) {
    if (item && item.id === "coin") {
      hasCoin = true;
    }
  });
  if (!hasCoin) {
    level.clearRewardItems.unshift({
      id: "coin",
      count: resolveManualCoinRewardCount(level.levelId)
    });
  }
}

function repositionManualSpecialEntities(config) {
  var level = config.level;
  if (!Array.isArray(level.specialEntities) || level.specialEntities.length === 0) {
    return;
  }
  if (!Array.isArray(level.layout) || level.layout.length === 0) {
    throw new Error("Manual special entity reposition requires layout.");
  }

  var rows = level.layout.slice();
  var slots = buildSpecialSlotPool(rows);
  var usedSlotIndexes = {};
  level.specialEntities.forEach(function (entity, index) {
    var slot = assignSpecialEntitySlot(rows, slots, usedSlotIndexes, entity, level.levelId, index, 0);
    entity.row = slot.row;
    entity.col = slot.col;
  });
  level.layout = rows;
}

function normalizeManualSplitterObjectives(config) {
  var level = config.level;
  var splitterColor = findSplitterCollectColor(level.specialEntities || []);
  if (!splitterColor) {
    return;
  }
  ensureJarContainsCollectColor(level.jarColors, splitterColor);
  if (!Array.isArray(level.winConditions)) {
    throw new Error("Manual splitter level requires winConditions.");
  }
  var collectTarget = 0;
  var nextWinConditions = level.winConditions.filter(function (condition) {
    if (!condition || condition.type === "clear_all") {
      return true;
    }
    if (condition.type === "collect_any" || condition.type === "collect_color") {
      collectTarget = Math.max(collectTarget, Math.floor(Number(condition.value)));
      return false;
    }
    return true;
  });
  if (collectTarget <= 0) {
    throw new Error("Manual splitter level requires positive collection target.");
  }
  nextWinConditions.push({
    type: "collect_color",
    color: splitterColor,
    value: collectTarget
  });
  level.winConditions = nextWinConditions;
}

function normalizeManualLocalLevels() {
  for (var levelId = 1; levelId <= LOCAL_LEVEL_MAX; levelId += 1) {
    var filePath = path.join(RESOURCE_LEVEL_DIR, getLevelFileName(levelId));
    writeJson(filePath, makeValidatedLevel(levelId));
    writeMeta(levelId);
  }
}

function buildRemotePackRanges() {
  var ranges = [];
  if (LOCAL_LEVEL_MAX < 100) {
    ranges.push({
      from: LOCAL_LEVEL_MAX + 1,
      to: 100
    });
  }
  var remoteStart = LOCAL_LEVEL_MAX < 100 ? 101 : LOCAL_LEVEL_MAX + 1;
  for (var from = remoteStart; from <= TARGET_LEVEL_COUNT; from += REMOTE_PACK_SIZE) {
    ranges.push({
      from: from,
      to: Math.min(TARGET_LEVEL_COUNT, from + REMOTE_PACK_SIZE - 1)
    });
  }
  return ranges;
}

function loadLevelForPack(levelId, packFrom, packTo) {
  return makeValidatedLevel(levelId);
}

function writeMeta(levelId) {
  var metaPath = path.join(RESOURCE_LEVEL_DIR, getLevelFileName(levelId) + ".meta");
  if (fs.existsSync(metaPath)) {
    return;
  }
  writeJson(metaPath, {
    ver: "1.0.2",
    uuid: makeUuid("bubble-level-json-" + levelId),
    importer: "json",
    subMetas: {}
  });
}

function writeManifestMeta() {
  var metaPath = MANIFEST_PATH + ".meta";
  if (fs.existsSync(metaPath)) {
    return;
  }
  writeJson(metaPath, {
    ver: "1.0.2",
    uuid: makeUuid("bubble-level-pack-manifest"),
    importer: "json",
    subMetas: {}
  });
}

function removeGeneratedRemoteLocalFiles() {
  [RESOURCE_LEVEL_DIR, MIRROR_LEVEL_DIR].forEach(function (dirPath) {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    fs.readdirSync(dirPath).forEach(function (name) {
      var match = name.match(/^level_(\d{3,})\.json(\.meta)?$/);
      if (!match) {
        return;
      }
      var levelId = Number(match[1]);
      if (levelId > LOCAL_LEVEL_MAX) {
        fs.unlinkSync(path.join(dirPath, name));
      }
    });
  });

  [RESOURCE_LEVEL_DIR, MIRROR_LEVEL_DIR].forEach(function (dirPath) {
    var examplePath = path.join(dirPath, "level_021_special_entities_example.json");
    if (fs.existsSync(examplePath)) {
      fs.unlinkSync(examplePath);
    }
    var exampleMetaPath = examplePath + ".meta";
    if (fs.existsSync(exampleMetaPath)) {
      fs.unlinkSync(exampleMetaPath);
    }
  });
}

function syncMirror() {
  fs.readdirSync(RESOURCE_LEVEL_DIR).filter(function (name) {
    return /^level_\d{3,}\.json$/.test(name);
  }).forEach(function (name) {
    fs.copyFileSync(path.join(RESOURCE_LEVEL_DIR, name), path.join(MIRROR_LEVEL_DIR, name));
  });
}

function buildRemotePacks() {
  ensureDirectory(REMOTE_PACK_DIR);

  var manifestPacks = [];
  buildRemotePackRanges().forEach(function (range) {
    var from = range.from;
    var to = range.to;
    var packId = getPackId(from, to);
    var pack = {
      schemaVersion: 1,
      packId: packId,
      from: from,
      to: to,
      levels: {}
    };
    for (var levelId = from; levelId <= to; levelId += 1) {
      pack.levels["level_" + padLevelId(levelId)] = loadLevelForPack(levelId, from, to);
    }

    var compactPack = LevelPackCompactCodec.compactPack(pack);
    var packText = toCompactJsonText(compactPack);
    var packFileName = getPackFileName(from, to);
    fs.writeFileSync(path.join(REMOTE_PACK_DIR, packFileName), packText, "utf8");
    manifestPacks.push({
      id: packId,
      from: from,
      to: to,
      fileID: CLOUD_FILE_ID_PREFIX + "/" + CLOUD_PACK_ROOT + "/" + packFileName,
      sha256: sha256Text(packText),
      bytes: Buffer.byteLength(packText, "utf8"),
      format: LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1
    });
  });
  return manifestPacks;
}

function writeManifest(packs) {
  writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    version: MANIFEST_VERSION,
    totalLevelCount: TARGET_LEVEL_COUNT,
    localLevelMax: LOCAL_LEVEL_MAX,
    cloud: {
      envId: CLOUD_ENV_ID
    },
    packs: packs
  });
  writeManifestMeta();
}

function main() {
  if (!fs.existsSync(RESOURCE_LEVEL_DIR)) {
    throw new Error("Missing resources level directory.");
  }
  if (!fs.existsSync(MIRROR_LEVEL_DIR)) {
    throw new Error("Missing mirror level directory.");
  }
  if (!fs.existsSync(RESOURCE_CONFIG_DIR)) {
    throw new Error("Missing resources config directory.");
  }

  resetGeneratedSpecialPositionState();
  normalizeManualLocalLevels();
  var packs = buildRemotePacks();
  removeGeneratedRemoteLocalFiles();
  writeManifest(packs);
  syncMirror();
  console.log(
    "Generated local levels 1-" + LOCAL_LEVEL_MAX +
    ", remote packs " + (LOCAL_LEVEL_MAX + 1) + "-" + TARGET_LEVEL_COUNT +
    ", and synced mirror directory."
  );
}

main();
