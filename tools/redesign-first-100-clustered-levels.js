"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var ClusteredLevelLayout = require("./clustered-level-layout");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var RESOURCE_LEVEL_DIR = path.join(PROJECT_ROOT, "assets/map/config/levels");
var MIRROR_LEVEL_DIR = path.join(PROJECT_ROOT, "levels");
var REMOTE_PACK_PATH = path.join(PROJECT_ROOT, "remote-level-packs/levels_pack_011_100.json");
var MANIFEST_PATH = path.join(PROJECT_ROOT, "remote-level-packs/level_manifest.json");
var REMOTE_PACK_ID = "levels_pack_011_100";

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function writePrettyJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 4) + "\n", "utf8");
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
  if (colorConditions.length !== 1 || typeof colorConditions[0].color !== "string") {
    throw new Error("Level " + level.levelId + " must have exactly one collect_color target.");
  }
  return colorConditions[0].color;
}

function redesignConfig(config, levelId) {
  var level = requireLevelConfig(config, levelId);
  var result = ClusteredLevelLayout.buildClusteredLayout({
    levelId: levelId,
    rows: level.layout,
    colors: level.colors,
    colorCounts: collectColorCounts(level),
    targetColor: resolveTargetColor(level),
    specialEntities: level.specialEntities
  });
  level.layout = result.rows;
  return result;
}

function updateLocalLevel(levelId) {
  var fileName = "level_" + String(levelId).padStart(3, "0") + ".json";
  var resourcePath = path.join(RESOURCE_LEVEL_DIR, fileName);
  var mirrorPath = path.join(MIRROR_LEVEL_DIR, fileName);
  var config = readJson(resourcePath);
  var result = redesignConfig(config, levelId);
  writePrettyJson(resourcePath, config);
  writePrettyJson(mirrorPath, config);
  return result;
}

function updateRemotePack(levelIds) {
  var compactPack = readJson(REMOTE_PACK_PATH);
  var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
  var results = {};
  levelIds.forEach(function (levelId) {
    var levelKey = "level_" + String(levelId).padStart(3, "0");
    if (!expandedPack.levels[levelKey]) {
      throw new Error("Remote pack missing level: " + levelKey);
    }
    results[levelId] = redesignConfig(expandedPack.levels[levelKey], levelId);
  });

  var nextCompactPack = LevelPackCompactCodec.compactPack(expandedPack);
  var packText = JSON.stringify(nextCompactPack);
  fs.writeFileSync(REMOTE_PACK_PATH, packText, "utf8");

  var manifest = readJson(MANIFEST_PATH);
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Level manifest packs must be an array.");
  }
  var matches = manifest.packs.filter(function (pack) {
    return pack && pack.id === REMOTE_PACK_ID;
  });
  if (matches.length !== 1) {
    throw new Error("Level manifest must contain exactly one " + REMOTE_PACK_ID + " entry.");
  }
  matches[0].sha256 = crypto.createHash("sha256").update(packText, "utf8").digest("hex");
  matches[0].bytes = Buffer.byteLength(packText, "utf8");
  writePrettyJson(MANIFEST_PATH, manifest);
  return results;
}

function formatResult(levelId, result) {
  return "[OK] level " + levelId +
    " grouped=" + Math.round(result.metrics.groupedRatio * 100) + "%" +
    " isolated=" + Math.round(result.metrics.isolatedRatio * 100) + "%" +
    " targetGroups=" + result.metrics.targetComponentSizes.join("/") +
    " variant=" + result.variant.join(":");
}

function main() {
  var localIds = ClusteredLevelLayout.REDESIGN_LEVEL_IDS.filter(function (levelId) {
    return levelId <= 10;
  });
  var remoteIds = ClusteredLevelLayout.REDESIGN_LEVEL_IDS.filter(function (levelId) {
    return levelId >= 11 && levelId <= 100;
  });
  var results = {};
  localIds.forEach(function (levelId) {
    results[levelId] = updateLocalLevel(levelId);
  });
  var remoteResults = updateRemotePack(remoteIds);
  Object.keys(remoteResults).forEach(function (levelId) {
    results[levelId] = remoteResults[levelId];
  });
  if (Object.keys(results).length !== ClusteredLevelLayout.REDESIGN_LEVEL_IDS.length) {
    throw new Error("Clustered redesign did not update every registered level.");
  }
  ClusteredLevelLayout.REDESIGN_LEVEL_IDS.forEach(function (levelId) {
    console.log(formatResult(levelId, results[levelId]));
  });
}

main();
