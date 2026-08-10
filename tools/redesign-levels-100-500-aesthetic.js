"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var ClusteredLevelLayout = require("./clustered-level-layout");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(REMOTE_PACK_DIR, "level_manifest.json");
var DEFAULT_START_LEVEL_ID = 100;
var DEFAULT_END_LEVEL_ID = 500;
var PACKS = [
  { id: "levels_pack_011_100", fileName: "levels_pack_011_100.json", from: 11, to: 100 },
  { id: "levels_pack_101_200", fileName: "levels_pack_101_200.json", from: 101, to: 200 },
  { id: "levels_pack_201_300", fileName: "levels_pack_201_300.json", from: 201, to: 300 },
  { id: "levels_pack_301_400", fileName: "levels_pack_301_400.json", from: 301, to: 400 },
  { id: "levels_pack_401_500", fileName: "levels_pack_401_500.json", from: 401, to: 500 },
  { id: "levels_pack_501_600", fileName: "levels_pack_501_600.json", from: 501, to: 600 },
  { id: "levels_pack_601_700", fileName: "levels_pack_601_700.json", from: 601, to: 700 },
  { id: "levels_pack_701_800", fileName: "levels_pack_701_800.json", from: 701, to: 800 },
  { id: "levels_pack_801_900", fileName: "levels_pack_801_900.json", from: 801, to: 900 },
  { id: "levels_pack_901_1000", fileName: "levels_pack_901_1000.json", from: 901, to: 1000 }
];

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function readJson(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 4) + "\n", "utf8");
}

function toCompactJsonText(value) {
  return JSON.stringify(value);
}

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function getLevelKey(levelId) {
  return "level_" + padLevelId(levelId);
}

function makeEmptyRowsLike(rows, levelId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Level " + levelId + " layout rows must be a non-empty array.");
  }
  return rows.map(function (row, rowIndex) {
    if (typeof row !== "string" || row.length === 0) {
      throw new Error("Level " + levelId + " layout row " + rowIndex + " must be a non-empty string.");
    }
    return ".".repeat(row.length);
  });
}

function collectColorCounts(level) {
  if (!Array.isArray(level.colors) || level.colors.length === 0) {
    throw new Error("Level " + level.levelId + " colors must be a non-empty array.");
  }
  if (!Array.isArray(level.layout) || level.layout.length === 0) {
    throw new Error("Level " + level.levelId + " layout must be a non-empty array.");
  }
  var counts = {};
  level.colors.forEach(function (color) {
    counts[color] = 0;
  });
  level.layout.forEach(function (row) {
    row.split("").forEach(function (cellValue) {
      if (cellValue === ".") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(counts, cellValue)) {
        throw new Error("Level " + level.levelId + " layout contains inactive color: " + cellValue);
      }
      counts[cellValue] += 1;
    });
  });
  return counts;
}

function resolveTargetColor(level) {
  if (!Array.isArray(level.winConditions)) {
    throw new Error("Level " + level.levelId + " winConditions must be an array.");
  }
  var colorConditions = level.winConditions.filter(function (condition) {
    return condition && condition.type === "collect_color";
  });
  if (colorConditions.length !== 1 || typeof colorConditions[0].color !== "string" || colorConditions[0].color.length === 0) {
    throw new Error("Level " + level.levelId + " must have exactly one collect_color target.");
  }
  return colorConditions[0].color;
}

function requireLevelConfig(config, levelId) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Level " + levelId + " config must be an object.");
  }
  if (!config.level || typeof config.level !== "object" || Array.isArray(config.level)) {
    throw new Error("Level " + levelId + " config.level must be an object.");
  }
  if (config.level.levelId !== levelId) {
    throw new Error("Level config id mismatch: expected " + levelId + ".");
  }
  return config.level;
}

function redesignLevel(config, levelId) {
  var level = requireLevelConfig(config, levelId);
  var colorCounts = collectColorCounts(level);
  var normalCount = Object.keys(colorCounts).reduce(function (sum, color) {
    return sum + colorCounts[color];
  }, 0);
  var preserveReferenceOccupiedSlots = levelId >= 101 && levelId <= 300;
  var preserveOccupiedSlots = preserveReferenceOccupiedSlots ||
    (Array.isArray(level.specialEntities) && level.specialEntities.length > normalCount);
  var sourceRows = levelId === 100 || preserveOccupiedSlots ? level.layout.slice() : makeEmptyRowsLike(level.layout, levelId);
  var result = ClusteredLevelLayout.buildClusteredLayout({
    levelId: levelId,
    rows: sourceRows,
    colors: level.colors,
    colorCounts: colorCounts,
    targetColor: resolveTargetColor(level),
    specialEntities: level.specialEntities,
    requiredNormalSlots: [],
    preserveOccupiedSlots: preserveOccupiedSlots
  });
  level.layout = result.rows;
  return result;
}

function updateManifestPack(manifest, packId, packText) {
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Level manifest packs must be an array.");
  }
  var matches = manifest.packs.filter(function (pack) {
    return pack && pack.id === packId;
  });
  if (matches.length !== 1) {
    throw new Error("Level manifest must contain exactly one " + packId + " entry.");
  }
  matches[0].sha256 = crypto.createHash("sha256").update(packText, "utf8").digest("hex");
  matches[0].bytes = Buffer.byteLength(packText, "utf8");
}

function parseRangeArgs() {
  var args = process.argv.slice(2);
  if (args.length === 0) {
    return {
      start: DEFAULT_START_LEVEL_ID,
      end: DEFAULT_END_LEVEL_ID
    };
  }
  if (args.length !== 3 || args[0] !== "--range") {
    throw new Error("Usage: node tools/redesign-levels-100-500-aesthetic.js [--range <start> <end>]");
  }
  var start = Number(args[1]);
  var end = Number(args[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 100 || end > 1000 || start > end) {
    throw new Error("Aesthetic redesign range must be integer levels within 100-1000.");
  }
  return {
    start: start,
    end: end
  };
}

function summarize(results) {
  var levelIds = Object.keys(results).map(function (levelId) {
    return Number(levelId);
  }).sort(function (levelA, levelB) {
    return levelA - levelB;
  });
  var groupedTotal = 0;
  var isolatedTotal = 0;
  var minRows = Number.MAX_SAFE_INTEGER;
  var maxRows = 0;
  levelIds.forEach(function (levelId) {
    var result = results[levelId];
    groupedTotal += result.metrics.groupedRatio;
    isolatedTotal += result.metrics.isolatedRatio;
    minRows = Math.min(minRows, result.rows.length);
    maxRows = Math.max(maxRows, result.rows.length);
  });
  console.log(
    "Redesigned " + levelIds.length + " levels (" + levelIds[0] + "-" + levelIds[levelIds.length - 1] + ")" +
    " avgGrouped=" + Math.round(groupedTotal / levelIds.length * 100) + "%" +
    " avgIsolated=" + Math.round(isolatedTotal / levelIds.length * 100) + "%" +
    " rows=" + minRows + "-" + maxRows
  );
}

function main() {
  var range = parseRangeArgs();
  var manifest = readJson(MANIFEST_PATH);
  var results = {};
  PACKS.forEach(function (packInfo) {
    if (packInfo.to < range.start || packInfo.from > range.end) {
      return;
    }
    var packPath = path.join(REMOTE_PACK_DIR, packInfo.fileName);
    var expandedPack = LevelPackCompactCodec.expandPack(readJson(packPath));
    for (var levelId = Math.max(range.start, packInfo.from); levelId <= Math.min(range.end, packInfo.to); levelId += 1) {
      var levelKey = getLevelKey(levelId);
      if (!expandedPack.levels[levelKey]) {
        throw new Error("Remote pack missing level: " + levelKey);
      }
      results[levelId] = redesignLevel(expandedPack.levels[levelKey], levelId);
    }
    var compactPack = LevelPackCompactCodec.compactPack(expandedPack);
    var packText = toCompactJsonText(compactPack);
    fs.writeFileSync(packPath, packText, "utf8");
    updateManifestPack(manifest, packInfo.id, packText);
  });
  if (Object.keys(results).length !== range.end - range.start + 1) {
    throw new Error("Aesthetic redesign did not update every level in range " + range.start + "-" + range.end + ".");
  }
  writeJson(MANIFEST_PATH, manifest);
  summarize(results);
}

main();
