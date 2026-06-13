"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var RESOURCE_LEVEL_DIR = path.join(PROJECT_ROOT, "assets/resources/config/levels");
var RESOURCE_CONFIG_DIR = path.join(PROJECT_ROOT, "assets/resources/config");
var MIRROR_LEVEL_DIR = path.join(PROJECT_ROOT, "levels");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(RESOURCE_CONFIG_DIR, "level_manifest.json");
var TARGET_LEVEL_COUNT = 1000;
var LOCAL_LEVEL_MAX = 10;
var REMOTE_PACK_SIZE = 100;
var START_GENERATED_LEVEL_ID = 41;
var CLOUD_ENV_ID = "cloud1-d7gqettx3e9249ca1";
var CLOUD_FILE_ID_PREFIX = "cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608";
var CLOUD_PACK_ROOT = "level-packs";
var MANIFEST_VERSION = "levels-1000-v1";
var COLORS = ["R", "G", "B", "Y", "P"];
var COLOR_NAMES = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple"
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

function assignSpecialEntitySlot(rows, slotPool, usedSlotIndexes, entity, levelId, entityIndex) {
  if (!Array.isArray(slotPool) || slotPool.length <= 0) {
    throw new Error("Special entity slot pool is empty.");
  }
  if (!Array.isArray(rows) || rows.length <= 0) {
    throw new Error("Special entity rows are required.");
  }
  var entityHash = hashString(entity.entityCategory + ":" + entity.entityType + ":" + entity.id);
  var rowStep = rows.length % 2 === 0 ? 3 : 2;
  var preferredRow = (entityHash + levelId * rowStep + entityIndex * 2) % rows.length;
  var preferredCol = ((entityHash >>> 3) + levelId * 5 + entityIndex * 3) % rows[preferredRow].length;
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
  for (var offset = 0; offset < slotPool.length; offset += 1) {
    var candidateIndex = (baseIndex + offset) % slotPool.length;
    if (usedSlotIndexes[candidateIndex] !== true && !isForbiddenSpecialSlot(entity, slotPool[candidateIndex])) {
      selectedIndex = candidateIndex;
      break;
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

function makeSpecialEntities(levelId, rows, colors, mechanics) {
  var slots = buildSpecialSlotPool(rows);
  var entities = [];
  var slotIndex = 0;
  var usedSlotIndexes = {};

  function nextSlot(entity) {
    if (slotIndex >= slots.length) {
      throw new Error("Generated special entity exceeded available slot count.");
    }
    var slot = assignSpecialEntitySlot(rows, slots, usedSlotIndexes, entity, levelId, slotIndex);
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
    var group = "g" + (levelId % 3 + 1);
    var lockedColors = [colors[(levelId + 1) % colors.length]];
    if (levelId >= 160) {
      lockedColors.push(colors[(levelId + 3) % colors.length]);
    }
    lockedColors.forEach(function (lockedColor, index) {
      var suffix = String(index + 1).padStart(2, "0");
      pushEntity({
        id: "key_" + group + "_" + suffix,
        entityCategory: "key_ball",
        entityType: "key",
        unlockGroup: group
      });
      pushEntity({
        id: "locked_" + group + "_" + suffix,
        entityCategory: "locked_ball",
        entityType: "locked",
        lockedColor: lockedColor,
        lockGroup: group
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

function makeLevel(levelId) {
  var progress = (levelId - 1) / (TARGET_LEVEL_COUNT - 1);
  var colorCount = levelId < 75 ? 4 : 5;
  var colors = COLORS.slice(0, colorCount);
  var patternName = PATTERNS[levelId % PATTERNS.length];
  var rows = fillRows(levelId, colors, patternName);
  var mechanics = getMechanics(levelId);
  var specialEntities = makeSpecialEntities(levelId, rows, colors, mechanics);
  var shotLimit = 34 + Math.floor(progress * 42) + Math.min(12, specialEntities.length);
  var collectTarget = Math.min(62, 16 + Math.floor(progress * 40) + Math.floor(specialEntities.length / 2));
  var collectColor = colors[levelId % colors.length];
  var splitterCollectColor = findSplitterCollectColor(specialEntities);
  var jarColors = colors.slice(0, Math.min(4, colors.length));
  if (splitterCollectColor) {
    ensureJarContainsCollectColor(jarColors, splitterCollectColor);
  }
  if (levelId % 4 === 0 && jarColors.indexOf(collectColor) === -1) {
    ensureJarContainsCollectColor(jarColors, collectColor);
  }
  var rewardItems = [{
    id: "coin",
    count: Math.min(300, 80 + Math.floor(progress * 220))
  }];
  if (levelId % 10 === 0) {
    rewardItems.push({
      id: "stamina",
      count: Math.min(3, 1 + Math.floor(progress * 3))
    });
  }

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
      shotLimit: shotLimit,
      targetScore: Math.round(5200 + progress * 43500 + specialEntities.length * 180),
      dropInterval: Math.max(3, 6 - Math.floor(progress * 4)),
      jarCount: Math.min(4, colors.length),
      jarColors: jarColors,
      spawnWeights: spawnWeights,
      jarRules: {
        rimBounce: Math.min(0.92, 0.68 + progress * 0.22),
        collectZoneScale: Math.max(0.78, 1.1 - progress * 0.25),
        sameColorBonus: Math.min(2.5, 1.5 + progress * 0.8)
      },
      winConditions: buildWinConditions(levelId, collectTarget, collectColor, splitterCollectColor),
      bonusObjectives: [
        levelId % 3 === 0
          ? { type: "single_turn_drop_count", value: Math.min(18, 6 + Math.floor(progress * 10)) }
          : { type: "clear_with_shots_remaining", value: Math.min(12, 3 + Math.floor(progress * 8)) }
      ],
      clearRewardItems: rewardItems,
      layout: rows,
      designNotes: "Generated 1000-level campaign stage. Chapter `" + getChapter(levelId) + "` uses " + mechanics.join(", ") + " with a " + patternName + " board silhouette.",
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
    var slot = assignSpecialEntitySlot(rows, slots, usedSlotIndexes, entity, level.levelId, index);
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
    if (!fs.existsSync(filePath)) {
      throw new Error("Missing manual local level: " + filePath);
    }
    var config = JSON.parse(fs.readFileSync(filePath, "utf8"));
    ensureLevelCoinReward(config);
    repositionManualSpecialEntities(config);
    normalizeManualSplitterObjectives(config);
    writeJson(filePath, config);
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
  var localFilePath = path.join(RESOURCE_LEVEL_DIR, getLevelFileName(levelId));
  if (fs.existsSync(localFilePath)) {
    return JSON.parse(fs.readFileSync(localFilePath, "utf8"));
  }
  if (levelId >= START_GENERATED_LEVEL_ID) {
    return makeLevel(levelId);
  }

  var existingPackPath = path.join(REMOTE_PACK_DIR, getPackFileName(packFrom, packTo));
  if (fs.existsSync(existingPackPath)) {
    var existingPack = JSON.parse(fs.readFileSync(existingPackPath, "utf8"));
    var levelKey = "level_" + padLevelId(levelId);
    if (
      existingPack &&
      existingPack.levels &&
      typeof existingPack.levels === "object" &&
      existingPack.levels[levelKey] &&
      typeof existingPack.levels[levelKey] === "object" &&
      !Array.isArray(existingPack.levels[levelKey])
    ) {
      return existingPack.levels[levelKey];
    }
  }

  return makeLevel(levelId);
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

    var packText = toJsonText(pack);
    var packFileName = getPackFileName(from, to);
    fs.writeFileSync(path.join(REMOTE_PACK_DIR, packFileName), packText, "utf8");
    manifestPacks.push({
      id: packId,
      from: from,
      to: to,
      fileID: CLOUD_FILE_ID_PREFIX + "/" + CLOUD_PACK_ROOT + "/" + packFileName,
      sha256: sha256Text(packText),
      bytes: Buffer.byteLength(packText, "utf8")
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
