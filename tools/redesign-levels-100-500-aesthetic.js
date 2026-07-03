"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var ClusteredLevelLayout = require("./clustered-level-layout");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(PROJECT_ROOT, "assets/resources/config/level_manifest.json");
var START_LEVEL_ID = 100;
var END_LEVEL_ID = 500;
var PACKS = [
  { id: "levels_pack_011_100", fileName: "levels_pack_011_100.json", from: 11, to: 100 },
  { id: "levels_pack_101_200", fileName: "levels_pack_101_200.json", from: 101, to: 200 },
  { id: "levels_pack_201_300", fileName: "levels_pack_201_300.json", from: 201, to: 300 },
  { id: "levels_pack_301_400", fileName: "levels_pack_301_400.json", from: 301, to: 400 },
  { id: "levels_pack_401_500", fileName: "levels_pack_401_500.json", from: 401, to: 500 }
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
  var sourceRows = levelId === 100 ? level.layout.slice() : makeEmptyRowsLike(level.layout, levelId);
  var result = ClusteredLevelLayout.buildClusteredLayout({
    levelId: levelId,
    rows: sourceRows,
    colors: level.colors,
    colorCounts: collectColorCounts(level),
    targetColor: resolveTargetColor(level),
    specialEntities: level.specialEntities
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
  var manifest = readJson(MANIFEST_PATH);
  var results = {};
  PACKS.forEach(function (packInfo) {
    var packPath = path.join(REMOTE_PACK_DIR, packInfo.fileName);
    var expandedPack = LevelPackCompactCodec.expandPack(readJson(packPath));
    for (var levelId = Math.max(START_LEVEL_ID, packInfo.from); levelId <= Math.min(END_LEVEL_ID, packInfo.to); levelId += 1) {
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
  writeJson(MANIFEST_PATH, manifest);
  summarize(results);
}

main();
