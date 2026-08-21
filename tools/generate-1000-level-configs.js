"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BoardOcclusionConfig = require("../assets/scripts/config/BoardOcclusionConfig");
var LevelBoardSupportValidator = require("../assets/scripts/config/LevelBoardSupportValidator");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var CampaignLevelModePolicy = require("./campaign-level-mode-policy");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");
var ClusteredLevelLayout = require("./clustered-level-layout");
var FirstHundredLevelDesign = require("./first-100-level-design");
var ReferenceLevels101To300Design = require("./reference-levels-101-300-design");
var SpecialMechanismSchedule = require("./campaign-special-mechanism-schedule");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var RESOURCE_LEVEL_DIR = path.join(PROJECT_ROOT, "assets/map/config/levels");
var RESOURCE_CONFIG_DIR = path.join(PROJECT_ROOT, "assets/map/config");
var MIRROR_LEVEL_DIR = path.join(PROJECT_ROOT, "levels");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(RESOURCE_CONFIG_DIR, "level_manifest.json");
var REMOTE_MANIFEST_PATH = path.join(REMOTE_PACK_DIR, "level_manifest.json");
var LEVEL_CONFIG_TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var TARGET_LEVEL_COUNT = 1000;
var MAX_SHOT_LIMIT = 54;
var MAX_LAYOUT_ROW_COUNT = 100;
var LOCAL_LEVEL_MAX = 10;
var REMOTE_PACK_SIZE = 100;
var START_GENERATED_LEVEL_ID = 41;
var CLOUD_ENV_ID = "cloud1-d7gqettx3e9249ca1";
var CLOUD_FILE_ID_PREFIX = "cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608";
var CLOUD_PACK_ROOT = "level-packs/v3";
var MANIFEST_VERSION = "levels-1000-compact-v2";
var BOOTSTRAP_MANIFEST_VERSION = "levels-1000-bootstrap-v1";
var REMOTE_MANIFEST_FILE_NAME = "level_manifest.json";
var COLORS = CampaignLevelGenerationConfig.NORMAL_BALL_COLORS.slice();
var SPLITTER_COLORS = CampaignLevelGenerationConfig.BASE_SPECIAL_COLORS.slice();
var FIXED_JAR_COLORS = CampaignLevelGenerationConfig.BASE_SPECIAL_COLORS.slice();
var COLOR_NAMES = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple",
  O: "orange",
  K: "black",
  W: "white"
};
var COLOR_TABLE_COLUMNS = {
  B: "蓝球",
  R: "红球",
  G: "绿球",
  Y: "黄球",
  P: "紫球",
  O: "橙球",
  K: "黑球",
  W: "白球"
};
var SPLITTER_TABLE_COLUMNS = {
  B: "蓝分裂球",
  R: "红分裂球",
  G: "绿分裂球",
  Y: "黄分裂球",
  P: "紫分裂球"
};
var TOP_BOARD_ROW_INDEX = 0;
var TIME_BONUS_BALL_SELECTION_SALT = 7919;
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

function parseRequiredStringCell(row, columnName, levelId) {
  if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
    throw new Error("Level config table missing column `" + columnName + "`.");
  }
  if (typeof row[columnName] !== "string" || !row[columnName]) {
    throw new Error("Level " + levelId + " table column `" + columnName + "` must be non-empty.");
  }
  return row[columnName];
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
  if (display === "清空棋盘") {
    return {
      type: "clear_all",
      value: 1
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
  SPLITTER_COLORS.forEach(function (color) {
    splitterCounts[color] = parseNonNegativeIntegerCell(rawRow, SPLITTER_TABLE_COLUMNS[color], levelId);
  });
  var rowCount = parsePositiveIntegerCell(rawRow, "总行数", levelId);
  if (rowCount > MAX_LAYOUT_ROW_COUNT) {
    throw new Error("Level " + levelId + " table row count must be <= " + MAX_LAYOUT_ROW_COUNT + ".");
  }
  var shotLimit = parsePositiveIntegerCell(rawRow, "发射球数量", levelId);
  if (shotLimit > MAX_SHOT_LIMIT) {
    throw new Error("Level " + levelId + " table shot count must be <= " + MAX_SHOT_LIMIT + ".");
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
    reactiveCounts: {
      swirl: parseNonNegativeIntegerCell(rawRow, "漩涡球", levelId),
      vine_spirit: parseNonNegativeIntegerCell(rawRow, "藤蔓精灵", levelId),
      wormholePairs: parseNonNegativeIntegerCell(rawRow, "虫洞对", levelId)
    },
    additionalCounts: {
      blackHole: parseNonNegativeIntegerCell(rawRow, "黑洞", levelId),
      mine: parseNonNegativeIntegerCell(rawRow, "地雷", levelId),
      breeder: parseNonNegativeIntegerCell(rawRow, "繁殖球", levelId),
      bud: parseNonNegativeIntegerCell(rawRow, "花苞球", levelId),
      spiritCocoon: parseNonNegativeIntegerCell(rawRow, "精灵茧", levelId),
      transparentBall: parseNonNegativeIntegerCell(rawRow, "透明球", levelId),
      crystalGun: parseNonNegativeIntegerCell(rawRow, "晶光炮", levelId),
      windTunnelExit: parseNonNegativeIntegerCell(rawRow, "风眼出口", levelId),
      poisonAttachment: parseNonNegativeIntegerCell(rawRow, "毒液附着", levelId),
      iceCrystalAttachment: parseNonNegativeIntegerCell(rawRow, "冰凌附着", levelId),
      bubbleShieldAttachment: parseNonNegativeIntegerCell(rawRow, "气泡护盾附着", levelId),
      spider: parseNonNegativeIntegerCell(rawRow, "蜘蛛", levelId),
      colorCloud: parseNonNegativeIntegerCell(rawRow, "彩云", levelId),
      multiRescueTargets: parseNonNegativeIntegerCell(rawRow, "多精灵救援目标", levelId),
      rainbowPrism: parseNonNegativeIntegerCell(rawRow, "彩虹棱镜球", levelId)
    },
    levelType: parseRequiredStringCell(rawRow, "关卡类型", levelId),
    playMode: parseRequiredStringCell(rawRow, "玩法模式", levelId),
    singleRescueSpiritId: parseRequiredStringCell(rawRow, "单精灵救援", levelId),
    timeBonusBallCount: parseNonNegativeIntegerCell(rawRow, "限时球", levelId),
    boardOcclusionMode: parseRequiredStringCell(rawRow, "棋盘遮挡", levelId),
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

function getHexNeighborCoordinates(row, col) {
  var offsets = row % 2 === 1 ? [
    [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]
  ] : [
    [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
  ];
  return offsets.map(function (offset) {
    return {
      row: row + offset[0],
      col: col + offset[1]
    };
  });
}

function getClockwiseHexNeighborCoordinates(row, col) {
  var offsets = row % 2 === 1 ? [
    [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [0, -1]
  ] : [
    [-1, -1], [-1, 0], [0, 1], [1, 0], [1, -1], [0, -1]
  ];
  return offsets.map(function (offset) {
    return {
      row: row + offset[0],
      col: col + offset[1]
    };
  });
}

function getOddRHexDistance(left, right) {
  var leftQ = left.col - (left.row - (left.row & 1)) / 2;
  var rightQ = right.col - (right.row - (right.row & 1)) / 2;
  var leftS = -leftQ - left.row;
  var rightS = -rightQ - right.row;
  return Math.max(
    Math.abs(leftQ - rightQ),
    Math.abs(left.row - right.row),
    Math.abs(leftS - rightS)
  );
}

function buildTrappedSpriteRescueShapeSlots(rows, occupiedCellCount, rescueConfig, levelId) {
  if (!Array.isArray(rows) || rows.length <=
      CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_ANCHOR_ROW +
      CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_HEX_RADIUS) {
    throw new Error("Trapped sprite rescue board requires the full radius-five hex board: " + levelId);
  }
  if (occupiedCellCount !== CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT) {
    throw new Error(
      "Trapped sprite rescue occupiedCellCount must equal " +
      CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT + ": " + levelId
    );
  }
  if (!rescueConfig || !rescueConfig.anchorCell) {
    throw new Error("Trapped sprite rescue board requires anchorCell: " + levelId);
  }
  var anchor = rescueConfig.anchorCell;
  var slots = [];
  rows.forEach(function (rowString, rowIndex) {
    for (var colIndex = 0; colIndex < rowString.length; colIndex += 1) {
      var cell = { row: rowIndex, col: colIndex };
      var distance = getOddRHexDistance(anchor, cell);
      if (distance >= 1 && distance <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_HEX_RADIUS) {
        slots.push(cell);
      }
    }
  });
  if (slots.length !== CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT) {
    throw new Error("Trapped sprite rescue radius-five hex is clipped by the authored board: " + levelId);
  }
  return slots.sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    return left.col - right.col;
  });
}

function seedTrappedSpriteRescueLayout(rows, slots, specialEntities, tableRow, activeColors) {
  if (!Array.isArray(slots) || !Array.isArray(specialEntities)) {
    throw new Error("Trapped sprite rescue seeding requires slot and special entity arrays: " + tableRow.levelId);
  }
  var specialCellMap = {};
  specialEntities.forEach(function (entity) {
    specialCellMap[entity.row + ":" + entity.col] = true;
  });
  var normalSlots = slots.filter(function (slot) {
    return specialCellMap[buildSlotKey(slot)] !== true;
  });
  if (normalSlots.length !== sumColorCounts(tableRow.colorCounts)) {
    throw new Error("Trapped sprite rescue normal slot count differs from table color counts: " + tableRow.levelId);
  }
  var remaining = {};
  activeColors.forEach(function (color) {
    remaining[color] = tableRow.colorCounts[color];
  });
  var normalSlotMap = {};
  normalSlots.forEach(function (slot) {
    normalSlotMap[buildSlotKey(slot)] = slot;
  });
  var anchor = {
    row: CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_ANCHOR_ROW,
    col: Math.floor(getColumnCount(CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_ANCHOR_ROW) / 2)
  };
  var anchorRing = getClockwiseHexNeighborCoordinates(anchor.row, anchor.col);
  var anchorNormalSlots = anchorRing.filter(function (slot) {
    return normalSlotMap[buildSlotKey(slot)] !== undefined;
  });
  var anchorNormalMap = {};
  anchorNormalSlots.forEach(function (slot) {
    anchorNormalMap[buildSlotKey(slot)] = true;
  });
  var otherSlots = normalSlots.filter(function (slot) {
    return anchorNormalMap[buildSlotKey(slot)] !== true;
  }).sort(function (left, right) {
    var leftDistance = getOddRHexDistance(anchor, left);
    var rightDistance = getOddRHexDistance(anchor, right);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    var leftOrder = (left.row * 17 + left.col * 31 + tableRow.levelId) % 97;
    var rightOrder = (right.row * 17 + right.col * 31 + tableRow.levelId) % 97;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.row !== right.row ? left.row - right.row : left.col - right.col;
  });
  var orderedSlots = anchorNormalSlots.concat(otherSlots);
  var assignments = {};
  var searchSteps = 0;

  function getAnchorNeighborRun() {
    var colors = anchorRing.map(function (slot) {
      return assignments[buildSlotKey(slot)] || null;
    });
    var hasBreak = colors.some(function (color) { return color === null; });
    var maxRun = 0;
    var run = 0;
    var previous = null;
    var iterationCount = hasBreak ? colors.length : colors.length * 2;
    var startIndex = hasBreak ? (colors.indexOf(null) + 1) % colors.length : 0;
    for (var index = 0; index < iterationCount; index += 1) {
      var color = colors[(startIndex + index) % colors.length];
      if (color === null) {
        previous = null;
        run = 0;
      } else if (color === previous) {
        run += 1;
      } else {
        previous = color;
        run = 1;
      }
      maxRun = Math.max(maxRun, Math.min(run, colors.length));
    }
    return maxRun;
  }

  function getAssignedComponentSize(slot, color) {
    var startKey = buildSlotKey(slot);
    assignments[startKey] = color;
    var queue = [slot];
    var visited = {};
    visited[startKey] = true;
    var size = 0;
    while (queue.length > 0) {
      var current = queue.shift();
      size += 1;
      getHexNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
        var key = buildSlotKey(neighbor);
        if (!visited[key] && assignments[key] === color) {
          visited[key] = true;
          queue.push(normalSlotMap[key]);
        }
      });
    }
    delete assignments[startKey];
    return size;
  }

  function assignSlot(slotIndex) {
    searchSteps += 1;
    if (searchSteps > 2000000) {
      throw new Error("Trapped sprite rescue color search exceeded its strict limit: " + tableRow.levelId);
    }
    if (slotIndex === orderedSlots.length) {
      return activeColors.every(function (color) { return remaining[color] === 0; }) &&
        getAnchorNeighborRun() <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN;
    }
    var slot = orderedSlots[slotIndex];
    var slotKey = buildSlotKey(slot);
    var isAnchorNeighbor = anchorNormalMap[slotKey] === true;
    var candidates = activeColors.filter(function (color) {
      if (remaining[color] <= 0) {
        return false;
      }
      var componentSize = getAssignedComponentSize(slot, color);
      return componentSize <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT;
    }).map(function (color) {
      return {
        color: color,
        componentSize: getAssignedComponentSize(slot, color),
        remaining: remaining[color],
        tie: (activeColors.indexOf(color) - tableRow.levelId + activeColors.length * 100) % activeColors.length
      };
    }).sort(function (left, right) {
      var leftGrouped = left.componentSize > 1 ? 1 : 0;
      var rightGrouped = right.componentSize > 1 ? 1 : 0;
      if (leftGrouped !== rightGrouped) {
        return rightGrouped - leftGrouped;
      }
      if (left.componentSize !== right.componentSize) {
        return right.componentSize - left.componentSize;
      }
      if (left.remaining !== right.remaining) {
        return right.remaining - left.remaining;
      }
      return left.tie - right.tie;
    });
    for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      var color = candidates[candidateIndex].color;
      assignments[slotKey] = color;
      remaining[color] -= 1;
      var anchorRunValid = !isAnchorNeighbor ||
        getAnchorNeighborRun() <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN;
      if (anchorRunValid && assignSlot(slotIndex + 1)) {
        return true;
      }
      remaining[color] += 1;
      delete assignments[slotKey];
    }
    return false;
  }

  if (!assignSlot(0)) {
    throw new Error("Trapped sprite rescue color constraints are unsatisfiable: " + tableRow.levelId);
  }
  normalSlots.forEach(function (slot) {
    var color = assignments[buildSlotKey(slot)];
    if (!color) {
      throw new Error("Trapped sprite rescue color assignment is missing: " + tableRow.levelId);
    }
    setCell(rows, slot.row, slot.col, color);
  });
  activeColors.forEach(function (color) {
    if (remaining[color] !== 0) {
      throw new Error("Trapped sprite rescue color count remains for " + color + ": " + tableRow.levelId);
    }
  });
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
  return SPLITTER_COLORS.reduce(function (sum, color) {
    return sum + splitterCounts[color];
  }, 0);
}

function getActiveColors(tableRow) {
  var activeColors = CampaignLevelGenerationConfig.getActiveNormalBallColors(tableRow.levelId);
  COLORS.forEach(function (color) {
    var expectedActive = activeColors.indexOf(color) >= 0;
    var hasSupply = tableRow.colorCounts[color] > 0;
    if (expectedActive !== hasSupply) {
      throw new Error(
        "Level " + tableRow.levelId + " table color supply differs from campaign palette for " + color + "."
      );
    }
  });
  CampaignLevelGenerationConfig.assertActiveNormalBallColors(tableRow.levelId, activeColors);
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

  var splitterColors = SPLITTER_COLORS.filter(function (color) {
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
  var expectedLockedCount = CampaignLevelGenerationConfig.getLockChainLockedCount(
    tableRow.levelId,
    tableRow.rowCount,
    tableRow.specialCounts.key
  );
  if (tableRow.specialCounts.locked !== expectedLockedCount) {
    throw new Error("Level " + tableRow.levelId + " lock count must equal the selected full lock-chain rows.");
  }
  var gameplayPlan = CampaignLevelGenerationConfig.getLevelPlan(tableRow.levelId);
  var expectedReactive = gameplayPlan.reactiveSpecialCounts;
  if (tableRow.reactiveCounts.swirl !== expectedReactive.swirl ||
      tableRow.reactiveCounts.vine_spirit !== expectedReactive.vine_spirit ||
      tableRow.reactiveCounts.wormholePairs !== expectedReactive.wormholePairs) {
    throw new Error("Level " + tableRow.levelId + " reactive counts differ from the authoritative schedule.");
  }
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    if (tableRow.additionalCounts[definition.key] !== gameplayPlan.additionalMechanismPlan[definition.key]) {
      throw new Error("Level " + tableRow.levelId + " `" + definition.column + "` differs from the authoritative schedule.");
    }
  });
  if (tableRow.levelType !== gameplayPlan.levelType || tableRow.playMode !== gameplayPlan.playMode) {
    throw new Error("Level " + tableRow.levelId + " mode columns differ from the authoritative schedule.");
  }
  var expectedSpiritId = gameplayPlan.trappedSpriteRescue
    ? CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(tableRow.levelId)
    : "-";
  if (tableRow.singleRescueSpiritId !== expectedSpiritId) {
    throw new Error("Level " + tableRow.levelId + " single rescue identity differs from the authoritative schedule.");
  }
  var expectedTimeBonusCount = gameplayPlan.playMode === "timed_infinite_shots"
    ? CampaignLevelGenerationConfig.getTimedLevelTimeBonusBallCount(tableRow.levelId)
    : 0;
  if (tableRow.timeBonusBallCount !== expectedTimeBonusCount) {
    throw new Error("Level " + tableRow.levelId + " timed ball count differs from the authoritative schedule.");
  }
  var expectedOcclusionMode = gameplayPlan.boardOcclusionEnabled ? "per_attempt_no_repeat" : "none";
  if (tableRow.boardOcclusionMode !== expectedOcclusionMode) {
    throw new Error("Level " + tableRow.levelId + " board occlusion mode differs from the authoritative schedule.");
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

  SPLITTER_COLORS.forEach(function (color) {
    pushRepeated(counts.splitters[color], function (index) {
      return {
        id: "splitter_" + color + "_" + String(index + 1).padStart(2, "0"),
        entityCategory: "reactive_ball",
        entityType: "splitter",
        splitColor: color
      };
    });
  });

  var lockRows = CampaignLevelGenerationConfig.getLockChainRows(levelId, tableRow.rowCount, counts.key);
  var lockedIndex = 0;
  lockRows.forEach(function (row, chainIndex) {
    var columnCount = BoardLayout.getRowColumnCount(row, BoardLayout.defaultColumns);
    var keyCol = (Math.floor(columnCount / 2) + levelId + chainIndex * 3) % columnCount;
    entities.push({
      id: "key_chain_" + String(chainIndex + 1).padStart(2, "0"),
      entityCategory: "key_ball",
      entityType: "key",
      row: row,
      col: keyCol
    });
    for (var col = 0; col < columnCount; col += 1) {
      if (col === keyCol) {
        continue;
      }
      lockedIndex += 1;
      entities.push({
        id: "locked_" + String(lockedIndex).padStart(2, "0"),
        entityCategory: "locked_ball",
        entityType: "locked",
        lockedColor: activeColors[(levelId + lockedIndex) % activeColors.length],
        row: row,
        col: col
      });
    }
  });
  if (lockedIndex !== counts.locked) {
    throw new Error("Level " + levelId + " generated lock-chain count differs from the table.");
  }

  var additional = tableRow.additionalCounts;
  pushRepeated(additional.blackHole, function (index) {
    return { id: "black_hole_" + String(index + 1).padStart(2, "0"), entityCategory: "hazard_ball", entityType: "black_hole", capacity: 3 };
  });
  pushRepeated(additional.mine, function (index) {
    return { id: "mine_" + String(index + 1).padStart(2, "0"), entityCategory: "hazard_ball", entityType: "mine", initialLife: 6 };
  });
  pushRepeated(additional.breeder, function (index) {
    return { id: "breeder_" + String(index + 1).padStart(2, "0"), entityCategory: "reactive_ball", entityType: "breeder" };
  });
  pushRepeated(additional.bud, function (index) {
    return { id: "bud_" + String(index + 1).padStart(2, "0"), entityCategory: "reactive_ball", entityType: "bud" };
  });
  pushRepeated(additional.spiritCocoon, function (index) {
    return { id: "spirit_cocoon_" + String(index + 1).padStart(2, "0"), entityCategory: "reactive_ball", entityType: "spirit_cocoon" };
  });
  pushRepeated(additional.transparentBall, function (index) {
    return { id: "transparent_ball_" + String(index + 1).padStart(2, "0"), entityCategory: "reactive_ball", entityType: "transparent_ball" };
  });
  pushRepeated(additional.crystalGun, function (index) {
    return { id: "crystal_gun_" + String(index + 1).padStart(2, "0"), entityCategory: "skill_ball", entityType: "crystal_gun" };
  });
  if (additional.windTunnelExit > 0) {
    entities.push({ id: "wind_tunnel_entrance_01", entityCategory: "reactive_ball", entityType: "wind_tunnel_entrance" });
    pushRepeated(additional.windTunnelExit, function (index) {
      return { id: "wind_tunnel_exit_" + String(index + 1).padStart(2, "0"), entityCategory: "reactive_ball", entityType: "wind_tunnel_exit" };
    });
  }

  var scheduledReactive = CampaignLevelGenerationConfig.buildReactiveSpecialEntities(levelId);
  if (scheduledReactive.filter(function (entity) { return entity.entityType === "swirl"; }).length !== tableRow.reactiveCounts.swirl ||
      scheduledReactive.filter(function (entity) { return entity.entityType === "vine_spirit"; }).length !== tableRow.reactiveCounts.vine_spirit ||
      scheduledReactive.filter(function (entity) { return entity.entityType === "wormhole"; }).length !== tableRow.reactiveCounts.wormholePairs * 2) {
    throw new Error("Level " + levelId + " reactive entity expansion differs from the table.");
  }
  entities = entities.concat(scheduledReactive);

  return entities;
}

function placeTableSpecialEntities(rows, entities, levelId, placementVariant) {
  if (levelId >= 101) {
    placeRelaxedCampaignSpecialEntities(rows, entities, levelId, placementVariant);
    return;
  }
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

function getRelaxedEntityRank(entity) {
  if (entity.entityType === "swirl") {
    return 0;
  }
  if (entity.entityType === "wormhole") {
    return 1;
  }
  if (isSplitterEntity(entity)) {
    return 2;
  }
  if (entity.entityType === "key" || entity.entityType === "locked") {
    return 3;
  }
  if (entity.entityType === "molotov" || entity.entityType === "blast" || entity.entityType === "rainbow") {
    return 4;
  }
  if (entity.entityType === "stone") {
    return 5;
  }
  if (entity.entityType === "ice") {
    return 6;
  }
  return 7;
}

function buildRelaxedCampaignSpecialSlotPool(rows, levelId, placementVariant) {
  if (!Array.isArray(rows) || rows.length <= 2) {
    throw new Error("Relaxed special placement requires at least three rows.");
  }
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("Relaxed special placement variant must be a non-negative integer.");
  }
  var rowsByIndex = [];
  for (var row = 1; row < rows.length - 1; row += 1) {
    var rowSlots = [];
    for (var col = 0; col < rows[row].length; col += 1) {
      rowSlots.push({
        row: row,
        col: col
      });
    }
    rowsByIndex.push(rowSlots);
  }
  var middleRowCount = rows.length - 2;
  var slots = [];
  var seen = {};
  var rowOrder = [];
  for (var rowOffset = 0; rowOffset < middleRowCount; rowOffset += 1) {
    rowOrder.push((levelId + placementVariant * 3 + rowOffset * 5) % middleRowCount);
  }
  var maxColumns = rowsByIndex.reduce(function (max, rowSlots) {
    return Math.max(max, rowSlots.length);
  }, 0);

  for (var wave = 0; wave < maxColumns; wave += 1) {
    rowOrder.forEach(function (rowOrderIndex, orderIndex) {
      var rowSlots = rowsByIndex[rowOrderIndex];
      if (wave >= rowSlots.length) {
        return;
      }
      var rowNumber = rowSlots[0].row;
      var rowLength = rowSlots.length;
      var center = Math.floor((rowLength - 1) / 2);
      var direction = ((levelId + placementVariant + orderIndex + wave) % 2) === 0 ? 1 : -1;
      var distance = Math.floor((wave + 1) / 2);
      var preferredCol = center + direction * distance;
      if (wave === 0) {
        preferredCol = (center + ((levelId + orderIndex) % 3) - 1 + rowLength) % rowLength;
      }
      preferredCol = (preferredCol + rowLength) % rowLength;
      var slot = {
        row: rowNumber,
        col: preferredCol
      };
      var key = slot.row + ":" + slot.col;
      if (!seen[key]) {
        seen[key] = true;
        slots.push(slot);
      }
    });
  }

  rowsByIndex.forEach(function (rowSlots) {
    rowSlots.forEach(function (slot) {
      var key = slot.row + ":" + slot.col;
      if (!seen[key]) {
        seen[key] = true;
        slots.push(slot);
      }
    });
  });
  if (slots.length === 0) {
    throw new Error("Relaxed special placement slot pool is empty.");
  }
  return slots;
}

function placeCampaignSpecialEntitiesInSlots(rows, entities, slots, levelId, placementVariant, sourceName) {
  if (!Array.isArray(entities)) {
    throw new Error(sourceName + " special placement requires entity array.");
  }
  if (slots.length < entities.length) {
    throw new Error(sourceName + " special placement has fewer slots than entities for level " + levelId + ".");
  }
  var eligible = {};
  slots.forEach(function (slot) {
    eligible[buildSlotKey(slot)] = true;
  });
  var used = {};
  var forbidden = {};
  var usedWormholeRows = {};
  entities.forEach(function (entity, index) {
    var hasRow = Number.isInteger(entity.row);
    var hasCol = Number.isInteger(entity.col);
    if (hasRow !== hasCol) {
      throw new Error(sourceName + " pre-positioned entity must define both row and col at index " + index + ".");
    }
    if (!hasRow) {
      return;
    }
    var key = buildSlotKey(entity);
    if (!eligible[key] || used[key]) {
      throw new Error(sourceName + " pre-positioned entity is outside eligible slots or duplicated at " + key + ".");
    }
    used[key] = true;
    setCell(rows, entity.row, entity.col, ".");
  });
  var swirls = entities.filter(function (entity) {
    return entity.entityType === "swirl" && !Number.isInteger(entity.row);
  }).sort(function (left, right) {
    return String(left.id).localeCompare(String(right.id));
  });
  swirls.forEach(function (entity, swirlIndex) {
    var candidates = slots.filter(function (slot) {
      var centerKey = buildSlotKey(slot);
      if (used[centerKey] || forbidden[centerKey]) {
        return false;
      }
      return getHexNeighborCoordinates(slot.row, slot.col).every(function (neighbor) {
        var neighborKey = buildSlotKey(neighbor);
        return eligible[neighborKey] && !used[neighborKey] && !forbidden[neighborKey];
      });
    });
    if (!candidates.length) {
      throw new Error(sourceName + " special placement has no complete swirl track for level " + levelId + ".");
    }
    candidates.sort(function (left, right) {
      var leftCenter = Math.abs(left.col - (rows[left.row].length - 1) / 2);
      var rightCenter = Math.abs(right.col - (rows[right.row].length - 1) / 2);
      return leftCenter - rightCenter || left.row - right.row || left.col - right.col;
    });
    var selected = candidates[(placementVariant + swirlIndex * 5) % Math.min(8, candidates.length)];
    entity.row = selected.row;
    entity.col = selected.col;
    used[buildSlotKey(selected)] = true;
    getHexNeighborCoordinates(selected.row, selected.col).forEach(function (neighbor) {
      forbidden[buildSlotKey(neighbor)] = true;
    });
  });

  var wormholes = entities.filter(function (entity) {
    return entity.entityType === "wormhole" && !Number.isInteger(entity.row);
  }).sort(function (left, right) {
    return String(left.id).localeCompare(String(right.id));
  });
  if (wormholes.length % 2 !== 0) {
    throw new Error(sourceName + " special placement requires an even wormhole endpoint count for level " + levelId + ".");
  }
  for (var pairIndex = 0; pairIndex < wormholes.length / 2; pairIndex += 1) {
    var pair = wormholes.slice(pairIndex * 2, pairIndex * 2 + 2);
    if (pair[0].moveDirection !== pair[1].moveDirection) {
      throw new Error(sourceName + " wormhole pair directions differ for level " + levelId + ".");
    }
    var pairCandidates = [];
    slots.forEach(function (left) {
      if (usedWormholeRows[left.row]) {
        return;
      }
      slots.forEach(function (right) {
        if (right.row !== left.row || right.col - left.col < 3) {
          return;
        }
        for (var col = left.col; col <= right.col; col += 1) {
          var segmentKey = left.row + ":" + col;
          if (!eligible[segmentKey] || used[segmentKey] || forbidden[segmentKey]) {
            return;
          }
        }
        pairCandidates.push({
          left: left,
          right: right,
          score: Math.abs((left.col + right.col) / 2 - (rows[left.row].length - 1) / 2) * 8 -
            (right.col - left.col) * 0.2 + left.row * 0.01
        });
      });
    });
    if (!pairCandidates.length) {
      throw new Error(sourceName + " special placement has no isolated wormhole row for level " + levelId + ".");
    }
    pairCandidates.sort(function (left, right) {
      return left.score - right.score || left.left.row - right.left.row || left.left.col - right.left.col;
    });
    var selectedPair = pairCandidates[(placementVariant + pairIndex * 3) % Math.min(10, pairCandidates.length)];
    pair[0].row = selectedPair.left.row;
    pair[0].col = selectedPair.left.col;
    pair[1].row = selectedPair.right.row;
    pair[1].col = selectedPair.right.col;
    used[buildSlotKey(selectedPair.left)] = true;
    used[buildSlotKey(selectedPair.right)] = true;
    usedWormholeRows[selectedPair.left.row] = true;
    for (var segmentCol = selectedPair.left.col; segmentCol <= selectedPair.right.col; segmentCol += 1) {
      forbidden[selectedPair.left.row + ":" + segmentCol] = true;
    }
  }

  var orderedEntities = entities.filter(function (entity) {
    return entity.entityType !== "swirl" && entity.entityType !== "wormhole" && !Number.isInteger(entity.row);
  }).sort(function (entityA, entityB) {
    var rankDelta = getRelaxedEntityRank(entityA) - getRelaxedEntityRank(entityB);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return String(entityA.id).localeCompare(String(entityB.id));
  });
  orderedEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object") {
      throw new Error(sourceName + " special placement entity must be an object.");
    }
    var candidates = slots.filter(function (slot) {
      var key = buildSlotKey(slot);
      return !used[key] && !forbidden[key];
    });
    if (!candidates.length) {
      throw new Error(sourceName + " special placement exhausted isolated slots for level " + levelId + ".");
    }
    var slot = candidates[(placementVariant + index * 3) % Math.min(12, candidates.length)];
    entity.row = slot.row;
    entity.col = slot.col;
    used[buildSlotKey(slot)] = true;
    setCell(rows, slot.row, slot.col, ".");
  });
}

function placeRelaxedCampaignSpecialEntities(rows, entities, levelId, placementVariant) {
  placeCampaignSpecialEntitiesInSlots(
    rows,
    entities,
    buildRelaxedCampaignSpecialSlotPool(rows, levelId, placementVariant),
    levelId,
    placementVariant,
    "Relaxed campaign"
  );
}

function buildSlotKey(slot) {
  if (!slot || !Number.isInteger(slot.row) || !Number.isInteger(slot.col)) {
    throw new Error("Reference layout slot must define integer row and col.");
  }
  return slot.row + ":" + slot.col;
}

function placeReferenceLayoutSpecialEntities(rows, entities, occupiedSlots, levelId, placementVariant) {
  if (!Array.isArray(occupiedSlots) || occupiedSlots.length === 0) {
    throw new Error("Reference layout occupied slots are required for level " + levelId + ".");
  }
  var occupiedSlotMap = {};
  occupiedSlots.forEach(function (slot) {
    occupiedSlotMap[buildSlotKey(slot)] = true;
  });
  var slots = buildRelaxedCampaignSpecialSlotPool(rows, levelId, placementVariant).filter(function (slot) {
    return occupiedSlotMap[buildSlotKey(slot)] === true;
  });
  placeCampaignSpecialEntitiesInSlots(rows, entities, slots, levelId, placementVariant, "Reference layout");
}

function seedReferenceLayoutColors(rows, occupiedSlots, entities, tableRow, activeColors) {
  var specialCellMap = {};
  entities.forEach(function (entity) {
    specialCellMap[entity.row + ":" + entity.col] = true;
  });
  var normalSlots = occupiedSlots.filter(function (slot) {
    return specialCellMap[buildSlotKey(slot)] !== true;
  });
  var expectedNormalCount = sumColorCounts(tableRow.colorCounts);
  if (normalSlots.length !== expectedNormalCount) {
    throw new Error(
      "Reference layout normal slot count mismatch for level " + tableRow.levelId +
      ": expected " + expectedNormalCount + ", got " + normalSlots.length + "."
    );
  }
  var remaining = {};
  activeColors.forEach(function (color) {
    remaining[color] = tableRow.colorCounts[color];
  });
  normalSlots.forEach(function (slot, slotIndex) {
    var selectedColor = null;
    for (var offset = 0; offset < activeColors.length; offset += 1) {
      var candidate = activeColors[(slotIndex + levelIdOffset(tableRow.levelId) + offset) % activeColors.length];
      if (remaining[candidate] > 0) {
        selectedColor = candidate;
        break;
      }
    }
    if (selectedColor === null) {
      throw new Error("Reference layout color seed exhausted for level " + tableRow.levelId + ".");
    }
    setCell(rows, slot.row, slot.col, selectedColor);
    remaining[selectedColor] -= 1;
  });
  activeColors.forEach(function (color) {
    if (remaining[color] !== 0) {
      throw new Error("Reference layout color seed mismatch for level " + tableRow.levelId + " color " + color + ".");
    }
  });
}

function countLayoutColors(rows, activeColors) {
  var counts = {};
  activeColors.forEach(function (color) {
    counts[color] = 0;
  });
  rows.forEach(function (rowString) {
    rowString.split("").forEach(function (cellCode) {
      if (cellCode === ".") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(counts, cellCode)) {
        throw new Error("Fixed level layout contains inactive color: " + cellCode);
      }
      counts[cellCode] += 1;
    });
  });
  return counts;
}

function applyFirstLevelTutorialLayout(rows, entities, tableRow, activeColors) {
  if (tableRow.levelId !== 1) {
    throw new Error("First level tutorial layout can only be applied to level 1.");
  }
  if (entities.length !== 0) {
    throw new Error("Level 1 tutorial layout must not contain special entities.");
  }
  var fixedLayout = FirstHundredLevelDesign.LEVEL_ONE_TUTORIAL_LAYOUT;
  if (!Array.isArray(fixedLayout) || fixedLayout.length !== rows.length) {
    throw new Error("Level 1 tutorial layout row count mismatch.");
  }
  fixedLayout.forEach(function (rowString, rowIndex) {
    if (typeof rowString !== "string" || rowString.length !== rows[rowIndex].length) {
      throw new Error("Level 1 tutorial layout row length mismatch at row " + rowIndex + ".");
    }
  });
  var layoutCounts = countLayoutColors(fixedLayout, activeColors);
  activeColors.forEach(function (color) {
    if (layoutCounts[color] !== tableRow.colorCounts[color]) {
      throw new Error(
        "Level 1 tutorial layout color count mismatch for " + color +
        ": expected " + tableRow.colorCounts[color] + ", got " + layoutCounts[color] + "."
      );
    }
  });
  fixedLayout.forEach(function (rowString, rowIndex) {
    rows[rowIndex] = rowString;
  });
}

function buildRequiredReactiveNormalSlots(rows, entities, levelId) {
  var required = {};
  entities.filter(function (entity) {
    return entity.entityType === "swirl";
  }).forEach(function (entity) {
    getHexNeighborCoordinates(entity.row, entity.col).forEach(function (neighbor) {
      if (neighbor.row < 0 || neighbor.row >= rows.length || neighbor.col < 0 || neighbor.col >= rows[neighbor.row].length) {
        throw new Error("Level " + levelId + " swirl track extends outside generated rows.");
      }
      required[buildSlotKey(neighbor)] = neighbor;
    });
  });
  var wormholesByRow = {};
  entities.filter(function (entity) {
    return entity.entityType === "wormhole";
  }).forEach(function (entity) {
    if (!wormholesByRow[entity.row]) {
      wormholesByRow[entity.row] = [];
    }
    wormholesByRow[entity.row].push(entity);
  });
  Object.keys(wormholesByRow).forEach(function (rowKey) {
    var pair = wormholesByRow[rowKey].slice().sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      throw new Error("Level " + levelId + " requires exactly two wormhole endpoints on row " + rowKey + ".");
    }
    for (var col = pair[0].col + 1; col < pair[1].col; col += 1) {
      var slot = { row: pair[0].row, col: col };
      required[buildSlotKey(slot)] = slot;
    }
  });
  return Object.keys(required).map(function (key) {
    return required[key];
  });
}

function fillTableLayoutColors(
  rows,
  entities,
  tableRow,
  activeColors,
  firstHundredSpec,
  preserveOccupiedSlots,
  boardContext
) {
  var specialCells = {};
  entities.forEach(function (entity) {
    specialCells[entity.row + ":" + entity.col] = true;
  });

  var remaining = {};
  activeColors.forEach(function (color) {
    remaining[color] = tableRow.colorCounts[color];
  });
  var remainingTotal = sumColorCounts(tableRow.colorCounts);
  if (ClusteredLevelLayout.shouldRedesign(tableRow.levelId)) {
    var clusteredResult = ClusteredLevelLayout.buildClusteredLayout({
      levelId: tableRow.levelId,
      rows: rows,
      colors: activeColors,
      colorCounts: tableRow.colorCounts,
      targetColor: tableRow.target1.color,
      specialEntities: entities,
      requiredNormalSlots: buildRequiredReactiveNormalSlots(rows, entities, tableRow.levelId),
      preserveOccupiedSlots: preserveOccupiedSlots,
      levelType: boardContext ? boardContext.levelType : undefined,
      trappedSpriteRescue: boardContext ? boardContext.trappedSpriteRescue : undefined,
      cascadeBalancePolicy: CampaignLevelGenerationConfig.getClearanceRebalanceCascadePolicy(tableRow.levelId),
      candidateProfile: tableRow.levelId > FirstHundredLevelDesign.LAST_LEVEL_ID
        ? "relaxed_campaign"
        : "full"
    });
    clusteredResult.rows.forEach(function (clusteredRow, rowIndex) {
      rows[rowIndex] = clusteredRow;
    });
    return;
  }
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
  if (!Array.isArray(activeColors) || activeColors.length === 0) {
    throw new Error("Jar colors require activeColors.");
  }
  if (!target || target.type !== "collect_color" || FIXED_JAR_COLORS.indexOf(target.color) === -1) {
    throw new Error("Jar colors require a supported collect_color target.");
  }
  return FIXED_JAR_COLORS.slice();
}

function buildScoreDesignFromTable(tableRow, levelMode, designBeat) {
  if (!levelMode || typeof levelMode !== "object") {
    throw new Error("Target score requires level mode.");
  }
  var normalTotal = sumColorCounts(tableRow.colorCounts);
  var baseSpecialTotal = tableRow.specialCounts.stone +
    tableRow.specialCounts.blast +
    tableRow.specialCounts.rainbow +
    tableRow.specialCounts.molotov +
    countTableSplitters(tableRow.specialCounts.splitters) +
    tableRow.specialCounts.key +
    tableRow.specialCounts.locked;
  var additional = tableRow.additionalCounts;
  baseSpecialTotal += additional.blackHole + additional.mine + additional.breeder + additional.bud +
    additional.spiritCocoon + additional.transparentBall + additional.crystalGun +
    (additional.windTunnelExit > 0 ? additional.windTunnelExit + 1 : 0);
  var isRescueMode = CampaignLevelGenerationConfig.isTrappedSpriteRescueLevelId(tableRow.levelId) ||
    additional.multiRescueTargets > 0;
  return CampaignLevelGenerationConfig.buildCampaignScoreDesign({
    levelId: tableRow.levelId,
    normalBallCount: normalTotal,
    iceCount: tableRow.specialCounts.ice,
    baseSpecialCount: baseSpecialTotal,
    reactiveSpecialCounts: CampaignLevelGenerationConfig.getReactiveSpecialCounts(tableRow.levelId),
    primaryObjectiveValue: isRescueMode
      ? normalTotal
      : tableRow.target1.value,
    secondaryObjectiveValue: isRescueMode
      ? 0
      : (tableRow.target2 ? tableRow.target2.value : 0),
    shotLimit: levelMode.playMode === "shot_limited" ? tableRow.shotLimit : undefined,
    timeLimitSeconds: levelMode.playMode === "timed_infinite_shots" ? levelMode.timeLimitSeconds : undefined,
    designBeat: designBeat
  });
}

function ensureBreederInitialEmptyNeighbors(rows, entities, levelId, placementVariant) {
  var occupiedSpecialCells = {};
  entities.forEach(function (entity) {
    occupiedSpecialCells[entity.row + ":" + entity.col] = entity;
  });
  entities.filter(function (entity) {
    return entity.entityType === "breeder";
  }).forEach(function (breeder, breederIndex) {
    var hasEmptyNeighbor = getHexNeighborCoordinates(breeder.row, breeder.col).some(function (neighbor) {
      return neighbor.row >= 0 && neighbor.row < rows.length &&
        neighbor.col >= 0 && neighbor.col < rows[neighbor.row].length &&
        rows[neighbor.row].charAt(neighbor.col) === "." &&
        !occupiedSpecialCells[neighbor.row + ":" + neighbor.col];
    });
    if (hasEmptyNeighbor) {
      return;
    }
    delete occupiedSpecialCells[breeder.row + ":" + breeder.col];
    var candidates = [];
    rows.forEach(function (rowString, row) {
      rowString.split("").forEach(function (cellCode, col) {
        var key = row + ":" + col;
        if (cellCode !== "." || occupiedSpecialCells[key]) {
          return;
        }
        var neighbors = getHexNeighborCoordinates(row, col).filter(function (neighbor) {
          return neighbor.row >= 0 && neighbor.row < rows.length &&
            neighbor.col >= 0 && neighbor.col < rows[neighbor.row].length;
        });
        var hasOrdinarySupport = neighbors.some(function (neighbor) {
          return rows[neighbor.row].charAt(neighbor.col) !== ".";
        });
        var keepsEmptyNeighbor = neighbors.some(function (neighbor) {
          return rows[neighbor.row].charAt(neighbor.col) === "." &&
            !occupiedSpecialCells[neighbor.row + ":" + neighbor.col] &&
            (neighbor.row !== breeder.row || neighbor.col !== breeder.col);
        });
        if (hasOrdinarySupport && keepsEmptyNeighbor) {
          candidates.push({ row: row, col: col });
        }
      });
    });
    if (!candidates.length) {
      throw new Error("Level " + levelId + " cannot reserve an initial empty breeder neighbor.");
    }
    candidates.sort(function (left, right) {
      var leftSalt = (left.row * 17 + left.col * 11 + placementVariant * 5 + breederIndex * 7) % 97;
      var rightSalt = (right.row * 17 + right.col * 11 + placementVariant * 5 + breederIndex * 7) % 97;
      return leftSalt - rightSalt || left.row - right.row || left.col - right.col;
    });
    breeder.row = candidates[0].row;
    breeder.col = candidates[0].col;
    occupiedSpecialCells[breeder.row + ":" + breeder.col] = breeder;
  });
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
  if (levelId <= 9) {
    return "cluster_fundamentals";
  }
  if (levelId <= 15) {
    return "legacy_skill_intro";
  }
  if (levelId <= 40) {
    return "ice_route_training";
  }
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
  if (chapter === "cluster_fundamentals") {
    return ["color_cluster", "support_drop"];
  }
  if (chapter === "legacy_skill_intro") {
    return ["legacy_skill_ball"];
  }
  if (chapter === "ice_route_training") {
    return ["ice_route"];
  }
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

function buildTimedLevelTimeBonusBalls(rows, levelId) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Timed level time bonus selection requires generated layout rows.");
  }
  if (!CampaignLevelGenerationConfig.isTimedLevelId(levelId)) {
    throw new Error("Timed level time bonus selection requires timed level id: " + levelId);
  }
  var candidates = [];
  rows.forEach(function (rowString, row) {
    if (typeof rowString !== "string") {
      throw new Error("Timed level time bonus selection requires string layout row " + row + ".");
    }
    rowString.split("").forEach(function (cellCode, col) {
      if (cellCode !== ".") {
        var rankSeed = Math.imul(levelId + 1, 0x9e3779b1) ^
          Math.imul(row + 1, 0x85ebca6b) ^
          Math.imul(col + 1, TIME_BONUS_BALL_SELECTION_SALT);
        rankSeed = Math.imul(rankSeed ^ (rankSeed >>> 16), 0xc2b2ae35);
        rankSeed = rankSeed ^ (rankSeed >>> 13);
        candidates.push({
          row: row,
          col: col,
          rank: rankSeed >>> 0
        });
      }
    });
  });
  var requiredCount = CampaignLevelGenerationConfig.getTimedLevelTimeBonusBallCount(levelId);
  if (candidates.length < requiredCount) {
    throw new Error("Timed level " + levelId + " has insufficient normal balls for time bonuses.");
  }
  return candidates.sort(function (left, right) {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    return left.col - right.col;
  }).slice(0, requiredCount).map(function (candidate) {
    return {
      row: candidate.row,
      col: candidate.col,
      bonusSeconds: CampaignLevelGenerationConfig.TIMED_LEVEL_TIME_BONUS_SECONDS
    };
  });
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

function buildAdditionalLevelFeatures(rows, specialEntities, tableRow, activeColors) {
  var specialByCoordinate = {};
  specialEntities.forEach(function (entity) {
    specialByCoordinate[entity.row + ":" + entity.col] = true;
  });
  var ordinaryCells = [];
  var emptyCells = [];
  rows.forEach(function (rowString, row) {
    rowString.split("").forEach(function (cellCode, col) {
      var key = row + ":" + col;
      if (cellCode !== "." && !specialByCoordinate[key]) {
        ordinaryCells.push({ row: row, col: col });
      } else if (cellCode === "." && !specialByCoordinate[key]) {
        emptyCells.push({ row: row, col: col });
      }
    });
  });
  ordinaryCells.sort(function (left, right) {
    return right.row - left.row || left.col - right.col;
  });
  var counts = tableRow.additionalCounts;
  var attachmentDefinitions = [
    { type: "poison", count: counts.poisonAttachment },
    { type: "ice_crystal", count: counts.iceCrystalAttachment },
    { type: "bubble_shield", count: counts.bubbleShieldAttachment }
  ];
  var cellAttachments = [];
  var claimedOrdinary = {};
  attachmentDefinitions.forEach(function (definition) {
    for (var index = 0; index < definition.count; index += 1) {
      var target = ordinaryCells.find(function (cell) {
        return !claimedOrdinary[cell.row + ":" + cell.col];
      });
      if (!target) {
        throw new Error("Level " + tableRow.levelId + " has too few ordinary balls for " + definition.type + " attachments.");
      }
      var coordinateKey = target.row + ":" + target.col;
      claimedOrdinary[coordinateKey] = true;
      var attachment = {
        id: definition.type + "_campaign_" + String(index + 1).padStart(2, "0"),
        type: definition.type,
        row: target.row,
        col: target.col
      };
      if (definition.type === "poison") {
        attachment.particleCount = 3;
      }
      cellAttachments.push(attachment);
    }
  });

  var spiderRows = [];
  if (counts.spider > 0) {
    var rowsWithCandidates = {};
    ordinaryCells.forEach(function (cell) {
      var key = cell.row + ":" + cell.col;
      if (claimedOrdinary[key]) {
        return;
      }
      if (!rowsWithCandidates[cell.row]) {
        rowsWithCandidates[cell.row] = [];
      }
      rowsWithCandidates[cell.row].push(cell);
    });
    var spiderRow = Object.keys(rowsWithCandidates).map(Number).sort(function (left, right) {
      return right - left;
    }).find(function (row) {
      return rowsWithCandidates[row].length >= counts.spider;
    });
    if (!Number.isInteger(spiderRow)) {
      throw new Error("Level " + tableRow.levelId + " has no row with enough ordinary spider anchors.");
    }
    rowsWithCandidates[spiderRow].slice(0, counts.spider).forEach(function (cell, index) {
      spiderRows.push({
        id: "spider_campaign_" + String(index + 1).padStart(2, "0"),
        lockRowId: "spider_row_" + spiderRow,
        row: cell.row,
        col: cell.col
      });
    });
  }

  var multiTrappedSpiritRescue;
  if (counts.multiRescueTargets > 0) {
    var targets = [];
    var spiritIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_SPIRIT_IDS;
    emptyCells.filter(function (cell) {
      return cell.row > 0 && getHexNeighborCoordinates(cell.row, cell.col).some(function (neighbor) {
        return neighbor.row >= 0 && neighbor.row < rows.length &&
          neighbor.col >= 0 && neighbor.col < rows[neighbor.row].length &&
          rows[neighbor.row].charAt(neighbor.col) !== "." &&
          !specialByCoordinate[neighbor.row + ":" + neighbor.col];
      });
    }).sort(function (left, right) {
      return right.row - left.row || left.col - right.col;
    }).forEach(function (cell) {
      if (targets.length >= counts.multiRescueTargets) {
        return;
      }
      if (targets.every(function (target) {
        return target.row !== cell.row || Math.abs(target.col - cell.col) >= 3;
      })) {
        targets.push({
          spiritId: spiritIds[(tableRow.levelId + targets.length) % spiritIds.length],
          row: cell.row,
          col: cell.col
        });
      }
    });
    if (targets.length !== counts.multiRescueTargets) {
      throw new Error("Level " + tableRow.levelId + " cannot place all multi-rescue targets.");
    }
    multiTrappedSpiritRescue = { targets: targets };
  }

  var colorClouds;
  if (counts.colorCloud > 0) {
    colorClouds = [];
    for (var cloudIndex = 0; cloudIndex < counts.colorCloud; cloudIndex += 1) {
      colorClouds.push({
        visible: true,
        position: { x: cloudIndex % 2 === 0 ? -120 : 120, y: -40 + cloudIndex * 120 },
        hitDispearTime: 2,
        startTime: cloudIndex,
        speed: cloudIndex % 2 === 0 ? 60 : -60,
        color: cloudIndex % 2 === 0
          ? activeColors[(tableRow.levelId + cloudIndex) % activeColors.length]
          : "RAINBOW"
      });
    }
  }

  var initialPowerups;
  if (counts.rainbowPrism > 0) {
    initialPowerups = { rainbow_prism_ball: counts.rainbowPrism };
  }
  return {
    cellAttachments: cellAttachments.length ? cellAttachments : undefined,
    spiderRows: spiderRows.length ? spiderRows : undefined,
    colorClouds: colorClouds,
    multiTrappedSpiritRescue: multiTrappedSpiritRescue,
    initialPowerups: initialPowerups
  };
}


function makeLevel(levelId, placementVariant) {
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("Level placement variant must be a non-negative integer: " + levelId);
  }
  var progress = (levelId - 1) / (TARGET_LEVEL_COUNT - 1);
  var tableRow = getTableRow(levelId);
  var gameplayPlan = CampaignLevelGenerationConfig.getLevelPlan(levelId);
  var levelMode = CampaignLevelModePolicy.getExpectedMode(levelId);
  var isTrappedSpriteRescue = gameplayPlan.trappedSpriteRescue === true;
  var firstHundredSpec = levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID
    ? FirstHundredLevelDesign.buildLevelSpec(levelId)
    : null;
  var referenceLayout = levelId <= FirstHundredLevelDesign.REFERENCE_TARGET_LAST_LEVEL_ID
    ? FirstHundredLevelDesign.buildReferenceLayoutDescriptor(levelId)
    : null;
  if (firstHundredSpec) {
    FirstHundredLevelDesign.assertTableRowMatchesDesign(tableRow);
  } else if (levelId >= ReferenceLevels101To300Design.FIRST_LEVEL_ID &&
    levelId <= ReferenceLevels101To300Design.LAST_LEVEL_ID) {
    ReferenceLevels101To300Design.assertTableRowMatchesDesign(tableRow);
  }
  validateTableTargets(tableRow);
  var colors = getActiveColors(tableRow);
  var patternName = referenceLayout
    ? referenceLayout.patternName
    : PATTERNS[levelId % PATTERNS.length];
  var rows = makeEmptyRows(tableRow.rowCount);
  var specialEntities = buildTableSpecialEntities(tableRow, colors);
  var referenceShapeSlots = null;
  var trappedSpriteRescueConfig;
  if (isTrappedSpriteRescue) {
    trappedSpriteRescueConfig = CampaignLevelGenerationConfig.buildTrappedSpriteRescueConfig(levelId, rows);
    var rescueShapeSlots = buildTrappedSpriteRescueShapeSlots(
      rows,
      sumColorCounts(tableRow.colorCounts) + specialEntities.length,
      trappedSpriteRescueConfig,
      levelId
    );
    placeCampaignSpecialEntitiesInSlots(
      rows,
      specialEntities,
      rescueShapeSlots,
      levelId,
      placementVariant,
      "Trapped sprite rescue"
    );
    seedTrappedSpriteRescueLayout(rows, rescueShapeSlots, specialEntities, tableRow, colors);
  } else if (levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID) {
    FirstHundredLevelDesign.buildBoard({
      levelId: levelId,
      rows: rows,
      colors: colors,
      colorCounts: tableRow.colorCounts,
      specialEntities: specialEntities,
      placementVariant: placementVariant
    });
  } else if (referenceLayout) {
    referenceShapeSlots = FirstHundredLevelDesign.buildReferenceShapeSlots(
      rows,
      patternName,
      sumColorCounts(tableRow.colorCounts) + specialEntities.length,
      levelId,
      specialEntities.filter(function (entity) {
        return entity.entityType === "key" || entity.entityType === "locked";
      }).map(function (entity) {
        return { row: entity.row, col: entity.col };
      })
    );
    placeReferenceLayoutSpecialEntities(
      rows,
      specialEntities,
      referenceShapeSlots,
      levelId,
      placementVariant
    );
    seedReferenceLayoutColors(rows, referenceShapeSlots, specialEntities, tableRow, colors);
  } else {
    placeTableSpecialEntities(rows, specialEntities, levelId, placementVariant);
  }
  if (!isTrappedSpriteRescue) {
    fillTableLayoutColors(
      rows,
      specialEntities,
      tableRow,
      colors,
      firstHundredSpec,
      referenceShapeSlots !== null
    );
  }
  ensureBreederInitialEmptyNeighbors(rows, specialEntities, levelId, placementVariant);
  var additionalFeatures = buildAdditionalLevelFeatures(rows, specialEntities, tableRow, colors);
  var mechanics = getMechanics(levelId).concat(gameplayPlan.teaches).filter(function (mechanic, index, allMechanics) {
    return allMechanics.indexOf(mechanic) === index;
  });
  var jarColors = firstHundredSpec
    ? firstHundredSpec.jarColors.slice()
    : resolveJarColors(colors, tableRow.target1);
  var firstHundredTuning = firstHundredSpec
    ? firstHundredSpec.tuning
    : null;
  var scoreDesign = buildScoreDesignFromTable(
    tableRow,
    levelMode,
    isTrappedSpriteRescue
      ? "rescue"
      : (firstHundredSpec ? firstHundredSpec.designBeat : CampaignLevelGenerationConfig.getScoreDesignBeat(levelId))
  );
  var targetScore = scoreDesign.targetScore;
  var isTimedLevel = levelMode.playMode === "timed_infinite_shots";

  var spawnWeights = {};
  colors.forEach(function (color, index) {
    spawnWeights[color] = color === tableRow.target1.color
      ? 2.4
      : 1 + ((levelId + index) % 3) * 0.12;
  });

  var config = {
    schemaVersion: 1,
    gameMode: "glass_marble_bubble",
    coordinateSystem: "odd-r-hex",
    layoutNotes: {
      description: isTrappedSpriteRescue
        ? "Trapped sprite rescue board. The top row is empty and all ordinary balls are supported by the center anchor."
        : "Top-to-bottom rows. Each character represents one grid cell.",
      legend: colors.reduce(function (legend, color) {
        legend[color] = COLOR_NAMES[color];
        return legend;
      }, { ".": "empty" }),
      pattern: isTrappedSpriteRescue ? "trapped_sprite_orbit" : patternName,
      theme: isTrappedSpriteRescue ? "trapped_sprite" : (firstHundredSpec ? firstHundredSpec.themeName : getChapter(levelId)),
      focus: isTrappedSpriteRescue
        ? "center_anchor_support"
        : (firstHundredSpec
        ? firstHundredSpec.focusName
        : (referenceLayout ? referenceLayout.focusName : patternName)),
      silhouetteVariant: isTrappedSpriteRescue
        ? "trapped_sprite_orbit"
        : (firstHundredSpec
        ? firstHundredSpec.silhouetteVariantName
        : (referenceLayout ? referenceLayout.patternName : undefined)),
      designBeat: scoreDesign.designBeat
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
        enableMarbleMarbleCollision: true,
        gravity: 900,
        initialSpeedY: 120,
        horizontalSpeed: 165,
        maxDropLifeTime: 6,
        bounceDamping: 0.82
      }
    },
    level: {
      levelId: levelId,
      code: "L" + padLevelId(levelId) + "_" +
        (isTrappedSpriteRescue ? "TRAPPED_SPRITE_RESCUE" : getChapter(levelId).toUpperCase()),
      difficulty: firstHundredTuning
        ? firstHundredTuning.difficulty
        : (progress < 0.18 ? "advanced" : (progress < 0.55 ? "hard" : "expert")),
      teaches: mechanics.concat(
        firstHundredSpec
          ? [
            firstHundredSpec.themeName + "_theme",
            patternName + "_pattern",
            firstHundredSpec.silhouetteVariantName + "_silhouette",
            firstHundredSpec.focusName + "_focus",
            firstHundredSpec.designBeat + "_design_beat"
          ]
          : [isTrappedSpriteRescue ? "trapped_sprite_orbit_pattern" : patternName + "_pattern"]
      ),
      colorCount: colors.length,
      colors: colors,
	      shotLimit: isTimedLevel ? undefined : tableRow.shotLimit,
	      timeLimitSeconds: isTimedLevel ? levelMode.timeLimitSeconds : undefined,
	      requiredStarCount: isTimedLevel ? levelMode.requiredStarCount : undefined,
	      timeBonusBalls: isTimedLevel ? buildTimedLevelTimeBonusBalls(rows, levelId) : undefined,
      targetScore: targetScore,
      starThresholds: scoreDesign.starThresholds,
      dropInterval: isTrappedSpriteRescue
        ? undefined
        : (firstHundredTuning
        ? firstHundredTuning.dropInterval
        : Math.max(3, 6 - Math.floor(progress * 4))),
      jarCount: jarColors.length,
      jarColors: jarColors,
      spawnWeights: spawnWeights,
      initialShotBalls: firstHundredSpec && !isTimedLevel && !isTrappedSpriteRescue
        ? undefined
        : [tableRow.target1.color, tableRow.target1.color],
      openingShotBalls: firstHundredSpec && !isTimedLevel && !isTrappedSpriteRescue
        ? firstHundredSpec.openingShotBalls.slice()
        : undefined,
      jarRules: {
        rimBounce: Math.min(0.92, 0.68 + progress * 0.22),
        collectZoneScale: Math.max(0.78, 1.1 - progress * 0.25),
        sameColorBonus: Math.min(2.5, 1.5 + progress * 0.8)
      },
      winConditions: isTrappedSpriteRescue
        ? [{ type: "clear_all", value: 1 }]
        : (gameplayPlan.multiTrappedSpiritRescue
          ? [{ type: "clear_all", value: 1 }]
          : buildWinConditionsFromTable(tableRow)),
      bonusObjectives: [
        isTimedLevel || levelId % 3 === 0
          ? { type: "single_turn_drop_count", value: Math.min(18, 6 + Math.floor(progress * 10)) }
          : { type: "clear_with_shots_remaining", value: Math.min(tableRow.shotLimit, 3 + Math.floor(progress * 8)) }
      ],
      clearRewardItems: buildRewardItemsFromTable(levelId),
      layout: rows,
      designNotes: isTrappedSpriteRescue
        ? "Generated trapped sprite rescue level. The center anchor is surrounded by a complete radius-five regular hex; same-color components are capped at eight and the anchor ring run is capped at two."
        : (referenceLayout
        ? "Gameplay is generated from the current LEVEL_CONFIG_TABLE_1_1000.csv rules; only the occupancy silhouette " +
          "is projected from E:\\kxppm\\decrypted_config\\all_levels.json level " +
          referenceLayout.sourceLevelId + " into current level " + levelId +
          (referenceLayout.mirrored ? " as a mirrored 11/10-column variant." : " on the current 11/10-column board.")
        : "Generated from LEVEL_CONFIG_TABLE_1_1000.csv. Chapter `" + getChapter(levelId) + "` uses " +
          mechanics.join(", ") + " with a " + patternName + " board silhouette."),
      difficultyScore: firstHundredTuning
        ? firstHundredTuning.difficultyScore
        : Math.min(100, 34 + Math.floor(progress * 66)),
      specialEntities: specialEntities,
      cellAttachments: additionalFeatures.cellAttachments,
      spiderRows: additionalFeatures.spiderRows,
      colorClouds: additionalFeatures.colorClouds,
      multiTrappedSpiritRescue: additionalFeatures.multiTrappedSpiritRescue,
      initialPowerups: additionalFeatures.initialPowerups,
      levelType: levelMode.levelType,
      playMode: levelMode.playMode,
      trappedSpriteRescue: trappedSpriteRescueConfig,
      initialDropSpaceRows: isTrappedSpriteRescue ? undefined : 8,
      adPowerupRules: {
        allowed: isTrappedSpriteRescue
          ? []
          : (isTimedLevel
          ? ["three_line_elimination"]
          : ["three_line_elimination", "plus_three_balls"])
      }
    },
    difficultyScaleMax: 100
  };
  config.level.boardOcclusionPlan = BoardOcclusionConfig.buildCampaignPlan(config.level);
  var generatedBoardMetrics = LevelBoardSupportValidator.assertGeneratedBoardRules(
    config.level,
    "level_" + padLevelId(levelId)
  );
  LevelBoardSupportValidator.assertInitialBoardSupported(config.level, "level_" + padLevelId(levelId));
  if (gameplayPlan.boardOcclusionEnabled !== (config.level.boardOcclusionPlan.mode !== BoardOcclusionConfig.MODE_NONE)) {
    throw new Error("Generated board occlusion plan differs from campaign gameplay plan: " + levelId);
  }
  if (generatedBoardMetrics.enforceMinimumNormalBallOccupancy &&
      generatedBoardMetrics.normalBallOccupancyRatio + Number.EPSILON <
      CampaignLevelGenerationConfig.getNormalBallOccupancyTarget(levelId)) {
    throw new Error("Generated normal-ball occupancy is below the configured target: " + levelId);
  }

  return config;
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

function findGeneratedSpecialPositionRepeatIssue(level) {
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

function findGeneratedSpecialPositionIssue(config) {
  if (!config || !config.level || typeof config.level !== "object") {
    throw new Error("Generated config missing level.");
  }
  var level = config.level;
  var unsupportedCells = LevelBoardSupportValidator.findUnsupportedInitialCells(level, "level_" + padLevelId(level.levelId));
  if (unsupportedCells.length > 0) {
    return "level " + level.levelId + " initial board has unsupported cells: " + unsupportedCells.map(function (cell) {
      return cell.row + ":" + cell.col;
    }).join(", ");
  }
  return findGeneratedSpecialPositionRepeatIssue(level);
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

function makeSpecialPositionProbe(levelId, placementVariant) {
  if (!Number.isInteger(levelId) || levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID) {
    throw new Error("Special position probe is only for generated campaign levels above 100.");
  }
  if (!Number.isInteger(placementVariant) || placementVariant < 0) {
    throw new Error("Special position probe variant must be a non-negative integer: " + levelId);
  }
  var tableRow = getTableRow(levelId);
  validateTableTargets(tableRow);
  var colors = getActiveColors(tableRow);
  var rows = makeEmptyRows(tableRow.rowCount);
  var specialEntities = buildTableSpecialEntities(tableRow, colors);
  placeTableSpecialEntities(rows, specialEntities, levelId, placementVariant);
  return {
    levelId: levelId,
    specialEntities: specialEntities
  };
}

function buildSpecialPlacementVariantCandidates(levelId, maxPlacementVariants) {
  var candidates = [];
  var lastIssue = "";
  for (var placementVariant = 0; placementVariant < maxPlacementVariants; placementVariant += 1) {
    try {
      var probe = makeSpecialPositionProbe(levelId, placementVariant);
      var issue = findGeneratedSpecialPositionRepeatIssue(probe);
      if (!issue) {
        candidates.push(placementVariant);
      } else {
        lastIssue = issue;
      }
    } catch (error) {
      lastIssue = error && error.message ? error.message : String(error);
    }
  }
  if (candidates.length === 0) {
    throw new Error("Unable to find special placement candidate for level " + levelId + ": " + lastIssue);
  }
  return candidates;
}

function makeValidatedLevel(levelId) {
  var maxPlacementVariants = 256;
  var lastIssue = "";
  var placementVariants = levelId > FirstHundredLevelDesign.LAST_LEVEL_ID
    ? buildSpecialPlacementVariantCandidates(levelId, maxPlacementVariants)
    : null;
  var variantCount = placementVariants ? placementVariants.length : maxPlacementVariants;
  for (var variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
    var placementVariant = placementVariants ? placementVariants[variantIndex] : variantIndex;
    var config;
    try {
      config = makeLevel(levelId, placementVariant);
    } catch (error) {
      lastIssue = error && error.message ? error.message : String(error);
      continue;
    }
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

function buildRemotePack(range) {
  if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from > range.to) {
    throw new Error("Remote pack range is invalid.");
  }
  var from = range.from;
  var to = range.to;
  var packId = getPackId(from, to);
  console.log("Building " + packId + " (" + from + "-" + to + ")...");
  var pack = {
    schemaVersion: 1,
    packId: packId,
    from: from,
    to: to,
    levels: {}
  };
  for (var levelId = from; levelId <= to; levelId += 1) {
    if (levelId === from || levelId === to || levelId % 25 === 0) {
      console.log("  generating level " + levelId + "...");
    }
    pack.levels["level_" + padLevelId(levelId)] = loadLevelForPack(levelId, from, to);
  }
  var compactPack = LevelPackCompactCodec.compactPack(pack);
  var packText = toCompactJsonText(compactPack);
  var packFileName = getPackFileName(from, to);
  fs.writeFileSync(path.join(REMOTE_PACK_DIR, packFileName), packText, "utf8");
  console.log("Built " + packId + ".");
  return buildRemotePackManifestEntry(from, to, packText);
}

function buildRemotePackManifestEntry(from, to, packText) {
  var packFileName = getPackFileName(from, to);
  return {
    id: getPackId(from, to),
    from: from,
    to: to,
    fileID: CLOUD_FILE_ID_PREFIX + "/" + CLOUD_PACK_ROOT + "/" + packFileName,
    sha256: sha256Text(packText),
    bytes: Buffer.byteLength(packText, "utf8"),
    format: LevelPackCompactCodec.PACK_FORMAT_COMPACT_V2
  };
}

function updateSelectedManifestPacks(packEntries, rebuildLabel) {
  if (!Array.isArray(packEntries) || packEntries.length === 0) {
    throw new Error(rebuildLabel + " requires at least one pack entry.");
  }
  var entriesById = {};
  packEntries.forEach(function (entry) {
    if (!entry || typeof entry.id !== "string" || entriesById[entry.id]) {
      throw new Error(rebuildLabel + " pack entry is invalid or duplicated.");
    }
    entriesById[entry.id] = entry;
  });
  var manifest = JSON.parse(stripBom(fs.readFileSync(REMOTE_MANIFEST_PATH, "utf8")));
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Level manifest packs must be an array.");
  }
  var matchCounts = {};
  Object.keys(entriesById).forEach(function (packId) {
    matchCounts[packId] = 0;
  });
  manifest.packs = manifest.packs.map(function (pack) {
    if (!entriesById[pack.id]) {
      return pack;
    }
    matchCounts[pack.id] += 1;
    return entriesById[pack.id];
  });
  Object.keys(matchCounts).forEach(function (packId) {
    if (matchCounts[packId] !== 1) {
      throw new Error("Level manifest must contain exactly one " + packId + " entry.");
    }
  });
  writeJson(REMOTE_MANIFEST_PATH, manifest);
  writeManifestMeta();
}

function buildRemotePacks() {
  ensureDirectory(REMOTE_PACK_DIR);
  return buildRemotePackRanges().map(function (range) {
    return buildRemotePack(range);
  });
}

function finalizeExistingRemotePacks() {
  var packEntries = buildRemotePackRanges().map(function (range) {
    var packPath = path.join(REMOTE_PACK_DIR, getPackFileName(range.from, range.to));
    if (!fs.existsSync(packPath)) {
      throw new Error("Missing generated remote pack before finalization: " + packPath);
    }
    return buildRemotePackManifestEntry(range.from, range.to, fs.readFileSync(packPath, "utf8"));
  });
  validateFirstHundredGeneratedOutputs();
  removeGeneratedRemoteLocalFiles();
  writeManifest(packEntries);
  syncMirror();
  console.log("Validated and finalized the existing generated level packs.");
}

function checkScheduledMechanismLevels() {
  var scheduled = {};
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    SpecialMechanismSchedule.getScheduledLevelIds(definition).forEach(function (levelId) {
      scheduled[levelId] = true;
    });
  });
  Object.keys(scheduled).map(Number).sort(function (left, right) {
    return left - right;
  }).forEach(function (levelId) {
    resetGeneratedSpecialPositionState();
    var config = makeValidatedLevel(levelId);
    LevelConfigLoader.normalizeLevelConfig(config, "level_" + padLevelId(levelId));
  });
  console.log("Validated all scheduled mechanism levels against the runtime loader before full generation.");
}

function writeManifest(packs) {
  var remoteManifest = {
    schemaVersion: 1,
    version: MANIFEST_VERSION,
    totalLevelCount: TARGET_LEVEL_COUNT,
    localLevelMax: LOCAL_LEVEL_MAX,
    cloud: {
      envId: CLOUD_ENV_ID
    },
    packs: packs
  };
  writeJson(REMOTE_MANIFEST_PATH, remoteManifest);
  writeJson(MANIFEST_PATH, {
    schemaVersion: 1,
    version: BOOTSTRAP_MANIFEST_VERSION,
    totalLevelCount: TARGET_LEVEL_COUNT,
    localLevelMax: LOCAL_LEVEL_MAX,
    cloud: {
      envId: CLOUD_ENV_ID
    },
    remoteManifest: {
      id: "level_manifest_current",
      fileID: CLOUD_FILE_ID_PREFIX + "/" + CLOUD_PACK_ROOT + "/" + REMOTE_MANIFEST_FILE_NAME,
      format: "level-pack-manifest-v1"
    }
  });
  writeManifestMeta();
}

function updateFirstHundredManifestPack(packEntry) {
  var manifest = JSON.parse(stripBom(fs.readFileSync(REMOTE_MANIFEST_PATH, "utf8")));
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Level manifest packs must be an array.");
  }
  var matchCount = 0;
  manifest.packs = manifest.packs.map(function (pack) {
    if (pack.id !== packEntry.id) {
      return pack;
    }
    matchCount += 1;
    return packEntry;
  });
  if (matchCount !== 1) {
    throw new Error("Level manifest must contain exactly one " + packEntry.id + " entry.");
  }
  writeJson(REMOTE_MANIFEST_PATH, manifest);
  writeManifestMeta();
}

function updateReferenceManifestPacks(packEntries) {
  if (!Array.isArray(packEntries) || packEntries.length !== 2) {
    throw new Error("Reference levels 101-300 rebuild requires exactly two pack entries.");
  }
  var entriesById = {};
  packEntries.forEach(function (entry) {
    if (!entry || typeof entry.id !== "string" || entriesById[entry.id]) {
      throw new Error("Reference levels 101-300 pack entry is invalid or duplicated.");
    }
    entriesById[entry.id] = entry;
  });
  var manifest = JSON.parse(stripBom(fs.readFileSync(REMOTE_MANIFEST_PATH, "utf8")));
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Level manifest packs must be an array.");
  }
  var matchCounts = {};
  Object.keys(entriesById).forEach(function (packId) {
    matchCounts[packId] = 0;
  });
  manifest.packs = manifest.packs.map(function (pack) {
    if (!entriesById[pack.id]) {
      return pack;
    }
    matchCounts[pack.id] += 1;
    return entriesById[pack.id];
  });
  Object.keys(matchCounts).forEach(function (packId) {
    if (matchCounts[packId] !== 1) {
      throw new Error("Level manifest must contain exactly one " + packId + " entry.");
    }
  });
  writeJson(REMOTE_MANIFEST_PATH, manifest);
  writeManifestMeta();
}

function buildLevelOccupancySignature(level) {
  if (!level || !Array.isArray(level.layout) || !Array.isArray(level.specialEntities)) {
    throw new Error("Reference level occupancy signature requires layout and specialEntities.");
  }
  var rows = level.layout.map(function (rowString) {
    return rowString.split("").map(function (cellValue) {
      return cellValue === "." ? "." : "#";
    });
  });
  level.specialEntities.forEach(function (entity) {
    if (!rows[entity.row] || rows[entity.row][entity.col] === undefined) {
      throw new Error("Level " + level.levelId + " special entity is outside its layout.");
    }
    if (rows[entity.row][entity.col] !== ".") {
      throw new Error("Level " + level.levelId + " normal ball overlaps special entity.");
    }
    rows[entity.row][entity.col] = "#";
  });
  return rows.map(function (row) { return row.join(""); }).join("|");
}

function validateReferenceLevels101To300Outputs() {
  var signatures = {};
  var referenceProjectionCount = 0;
  var trappedSpriteRescueLayoutCount = 0;
  var maxCentroidOffset = 0;
  var maxSideBalanceDelta = 0;
  for (var levelId = ReferenceLevels101To300Design.FIRST_LEVEL_ID;
    levelId <= ReferenceLevels101To300Design.LAST_LEVEL_ID;
    levelId += 1) {
    var packFrom = Math.floor((levelId - 1) / 100) * 100 + 1;
    var packTo = packFrom + 99;
    var packPath = path.join(REMOTE_PACK_DIR, getPackFileName(packFrom, packTo));
    var expandedPack = LevelPackCompactCodec.expandPack(
      JSON.parse(stripBom(fs.readFileSync(packPath, "utf8")))
    );
    var levelKey = "level_" + padLevelId(levelId);
    if (!expandedPack.levels[levelKey] || !expandedPack.levels[levelKey].level) {
      throw new Error("Reference rebuild output is missing " + levelKey + ".");
    }
    var level = expandedPack.levels[levelKey].level;
    var tableRow = getTableRow(levelId);
    CampaignLevelModePolicy.assertExpectedLevelMode(level, tableRow.shotLimit);
    var actualSignature = buildLevelOccupancySignature(level);
    signatures[actualSignature] = true;
    if (CampaignLevelGenerationConfig.isTrappedSpriteRescueLevelId(levelId)) {
      LevelBoardSupportValidator.assertGeneratedBoardRules(level, levelKey);
      LevelBoardSupportValidator.assertInitialBoardSupported(level, levelKey);
      trappedSpriteRescueLayoutCount += 1;
      continue;
    }
    var descriptor = FirstHundredLevelDesign.buildReferenceLayoutDescriptor(levelId);
    var expectedSlots = FirstHundredLevelDesign.buildReferenceShapeSlots(
      makeEmptyRows(tableRow.rowCount),
      descriptor.patternName,
      sumColorCounts(tableRow.colorCounts) + level.specialEntities.length,
      levelId,
      level.specialEntities.filter(function (entity) {
        return entity.entityType === "key" || entity.entityType === "locked";
      }).map(function (entity) {
        return { row: entity.row, col: entity.col };
      })
    );
    var expectedRows = makeEmptyRows(tableRow.rowCount).map(function (rowString) {
      return rowString.split("");
    });
    expectedSlots.forEach(function (slot) {
      expectedRows[slot.row][slot.col] = "#";
    });
    var expectedSignature = expectedRows.map(function (row) { return row.join(""); }).join("|");
    if (actualSignature !== expectedSignature) {
      throw new Error("Level " + levelId + " occupancy differs from its reference projection.");
    }
    var horizontalMoment = 0;
    var leftCount = 0;
    var rightCount = 0;
    expectedSlots.forEach(function (slot) {
      var rowLength = expectedRows[slot.row].length;
      var normalizedX = rowLength === 1 ? 0 : (slot.col / (rowLength - 1)) * 2 - 1;
      horizontalMoment += normalizedX;
      if (normalizedX < -0.05) {
        leftCount += 1;
      } else if (normalizedX > 0.05) {
        rightCount += 1;
      }
    });
    var centroidOffset = Math.abs(horizontalMoment / expectedSlots.length);
    var sideBalanceDelta = Math.abs(leftCount - rightCount) / expectedSlots.length;
    if (centroidOffset > 0.2 || sideBalanceDelta > 0.2) {
      throw new Error(
        "Level " + levelId + " reference projection is visually unbalanced: centroid=" +
        centroidOffset.toFixed(3) + ", sideDelta=" + sideBalanceDelta.toFixed(3) + "."
      );
    }
    maxCentroidOffset = Math.max(maxCentroidOffset, centroidOffset);
    maxSideBalanceDelta = Math.max(maxSideBalanceDelta, sideBalanceDelta);
    referenceProjectionCount += 1;
  }
  console.log(
    "Validated reference occupancy for levels 101-300 (" +
    referenceProjectionCount + " reference projections plus " +
    trappedSpriteRescueLayoutCount + " trapped sprite rescue layouts, " +
    Object.keys(signatures).length + " distinct occupancy signatures, max centroid " +
    maxCentroidOffset.toFixed(3) + ", max side delta " + maxSideBalanceDelta.toFixed(3) + ")."
  );
}

function validateFirstHundredGeneratedOutputs() {
  var generatedFirstHundredLevels = [];
  for (var localLevelId = 1; localLevelId <= LOCAL_LEVEL_MAX; localLevelId += 1) {
    generatedFirstHundredLevels.push(
      JSON.parse(stripBom(fs.readFileSync(
        path.join(RESOURCE_LEVEL_DIR, getLevelFileName(localLevelId)),
        "utf8"
      ))).level
    );
  }
  var firstHundredPackPath = path.join(
    REMOTE_PACK_DIR,
    getPackFileName(LOCAL_LEVEL_MAX + 1, FirstHundredLevelDesign.LAST_LEVEL_ID)
  );
  var expandedFirstHundredPack = LevelPackCompactCodec.expandPack(
    JSON.parse(stripBom(fs.readFileSync(firstHundredPackPath, "utf8")))
  );
  for (var remoteLevelId = LOCAL_LEVEL_MAX + 1;
    remoteLevelId <= FirstHundredLevelDesign.LAST_LEVEL_ID;
    remoteLevelId += 1) {
    generatedFirstHundredLevels.push(
      expandedFirstHundredPack.levels["level_" + padLevelId(remoteLevelId)].level
    );
  }
  var silhouetteAudit = FirstHundredLevelDesign.validateGeneratedLevelSet(generatedFirstHundredLevels);
  console.log(
    "Validated " + silhouetteAudit.uniqueSilhouetteCount +
    " unique silhouettes across levels 1-100."
  );
  return silhouetteAudit;
}

function rebuildFirstHundred() {
  resetGeneratedSpecialPositionState();
  normalizeManualLocalLevels();
  ensureDirectory(REMOTE_PACK_DIR);
  var firstRemotePack = buildRemotePack({
    from: LOCAL_LEVEL_MAX + 1,
    to: FirstHundredLevelDesign.LAST_LEVEL_ID
  });
  validateFirstHundredGeneratedOutputs();
  updateFirstHundredManifestPack(firstRemotePack);
  syncMirror();
  console.log("Rebuilt levels 1-100 and updated the 11-100 remote pack manifest entry.");
}

function rebuildReferenceLevels101To300() {
  resetGeneratedSpecialPositionState();
  ensureDirectory(REMOTE_PACK_DIR);
  var packEntries = [
    buildRemotePack({ from: 101, to: 200 }),
    buildRemotePack({ from: 201, to: 300 })
  ];
  validateReferenceLevels101To300Outputs();
  updateReferenceManifestPacks(packEntries);
  console.log("Rebuilt levels 101-300 and updated their two remote pack manifest entries.");
}

function rebuildTrappedSpriteRescueLevels() {
  ensureDirectory(REMOTE_PACK_DIR);
  var packStates = buildRemotePackRanges().map(function (range) {
    var packPath = path.join(REMOTE_PACK_DIR, getPackFileName(range.from, range.to));
    if (!fs.existsSync(packPath)) {
      throw new Error("Trapped sprite rescue rebuild is missing remote pack: " + packPath);
    }
    var pack = LevelPackCompactCodec.expandPack(JSON.parse(stripBom(fs.readFileSync(packPath, "utf8"))));
    if (pack.from !== range.from || pack.to !== range.to || !pack.levels) {
      throw new Error("Trapped sprite rescue rebuild found an invalid remote pack: " + packPath);
    }
    return { range: range, pack: pack, changed: false };
  });

  CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.forEach(function (levelId) {
    resetGeneratedSpecialPositionState();
    var generatedConfig = makeValidatedLevel(levelId);
    var state = packStates.filter(function (candidate) {
      return levelId >= candidate.range.from && levelId <= candidate.range.to;
    })[0];
    if (!state) {
      throw new Error("Trapped sprite rescue level has no remote pack: " + levelId);
    }
    state.pack.levels["level_" + padLevelId(levelId)] = generatedConfig;
    state.changed = true;
  });

  var packEntries = packStates.filter(function (state) {
    return state.changed;
  }).map(function (state) {
    var compactPack = LevelPackCompactCodec.compactPack(state.pack);
    var packText = toCompactJsonText(compactPack);
    var packPath = path.join(REMOTE_PACK_DIR, getPackFileName(state.range.from, state.range.to));
    fs.writeFileSync(packPath, packText, "utf8");
    return buildRemotePackManifestEntry(state.range.from, state.range.to, packText);
  });
  updateSelectedManifestPacks(packEntries, "Trapped sprite rescue rebuild");
  console.log("Rebuilt all trapped sprite rescue levels and updated their remote pack manifest entries.");
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

  var args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--first100") {
    rebuildFirstHundred();
    return;
  }
  if (args.length === 1 && args[0] === "--reference101-300") {
    rebuildReferenceLevels101To300();
    return;
  }
  if (args.length === 1 && args[0] === "--trapped-rescue") {
    rebuildTrappedSpriteRescueLevels();
    return;
  }
  if (args.length === 1 && args[0] === "--finalize-existing-packs") {
    finalizeExistingRemotePacks();
    return;
  }
  if (args.length === 1 && args[0] === "--check-scheduled-mechanisms") {
    checkScheduledMechanismLevels();
    return;
  }
  if (args.length !== 0) {
    throw new Error("Unsupported level generator arguments: " + args.join(" "));
  }

  resetGeneratedSpecialPositionState();
  normalizeManualLocalLevels();
  var packs = buildRemotePacks();
  validateFirstHundredGeneratedOutputs();
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
