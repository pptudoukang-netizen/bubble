"use strict";

var fs = require("fs");
var path = require("path");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var LEVEL_DIR = path.resolve(__dirname, "../assets/map/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  return JSON.parse(raw);
}

function getLevelNumber(fileName) {
  var match = fileName.match(/level_(\d+)\.json$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function validateLevelData(parsed, sourceName) {
  if (!parsed || !parsed.level) {
    return {
      ok: false,
      levelCode: sourceName,
      issues: ["missing level block"]
    };
  }

  var level = JSON.parse(JSON.stringify(parsed.level));
  var original = parsed.level;
  var meta = AimTuningProfiles.applyToLevel(level);
  var issues = [];
  var explicitCount = 0;

  AimTuningProfiles.aimKeys.forEach(function (key) {
    if (typeof original[key] === "number") {
      explicitCount += 1;
    }

    if (typeof level[key] !== "number" || Number.isNaN(level[key])) {
      issues.push(key + " is not numeric");
      return;
    }

    var limit = AimTuningProfiles.aimLimits[key];
    if (level[key] < limit.min || level[key] > limit.max) {
      issues.push(key + " out of range [" + limit.min + ", " + limit.max + "]");
    }
  });

  return {
    ok: issues.length === 0,
    levelCode: level.code || sourceName,
    difficulty: level.difficulty || "unknown",
    profile: meta.profile,
    explicitCount: explicitCount,
    values: level,
    issues: issues
  };
}

function validateLevel(filePath) {
  return validateLevelData(readJson(filePath), path.basename(filePath));
}

function listRemotePackEntries() {
  if (!fs.existsSync(REMOTE_PACK_DIR)) {
    return [];
  }
  var entries = [];
  fs.readdirSync(REMOTE_PACK_DIR)
    .filter(function (fileName) {
      return /^levels_pack_\d{3,}_\d{3,}\.json$/.test(fileName);
    })
    .sort()
    .forEach(function (fileName) {
      var pack = readJson(path.join(REMOTE_PACK_DIR, fileName));
      if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
        throw new Error("remote level pack invalid: " + fileName);
      }
      if (pack.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1) {
        throw new Error("remote level pack format must be " + LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1 + ": " + fileName);
      }
      pack = LevelPackCompactCodec.expandPack(pack);
      if (!pack.levels || typeof pack.levels !== "object" || Array.isArray(pack.levels)) {
        throw new Error("remote level pack levels invalid: " + fileName);
      }
      Object.keys(pack.levels).sort(function (a, b) {
        return getLevelNumber(a + ".json") - getLevelNumber(b + ".json");
      }).forEach(function (levelKey) {
        entries.push({
          sourceName: fileName + "#" + levelKey,
          data: pack.levels[levelKey]
        });
      });
    });
  return entries;
}

function listAllLevelEntries() {
  var localEntries = fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .sort(function (a, b) {
      return getLevelNumber(a) - getLevelNumber(b);
    })
    .map(function (fileName) {
      return {
        sourceName: fileName,
        data: readJson(path.join(LEVEL_DIR, fileName))
      };
    });
  return localEntries.concat(listRemotePackEntries());
}

function printResult(result) {
  if (!result.ok) {
    console.log("[FAIL]", result.levelCode, "=>", result.issues.join("; "));
    return;
  }

  var compact = [
    "CR=" + result.values.aimCollisionRadius,
    "TA=" + result.values.aimTunnelAssistRadius,
    "SP=" + result.values.aimSlotProbeRadius,
    "CT=" + result.values.aimSlotCaptureTightness,
    "OA=" + result.values.aimSlotOpenMinAlignment,
    "TD=" + result.values.aimSlotVsBubbleTieDistance,
    "PC=" + result.values.aimSlotPriorityConfidence
  ].join(" ");

  console.log(
    "[OK]",
    result.levelCode,
    "difficulty=" + result.difficulty,
    "profile=" + result.profile,
    "explicit=" + result.explicitCount,
    compact
  );
}

function main() {
  var entries = listAllLevelEntries();

  if (!entries.length) {
    console.log("No level json files found.");
    process.exit(1);
  }

  var failed = false;
  entries.forEach(function (entry) {
    var result = validateLevelData(entry.data, entry.sourceName);
    printResult(result);
    if (!result.ok) {
      failed = true;
    }
  });

  if (failed) {
    console.log("\nAim profile validation failed.");
    process.exit(1);
  }

  console.log("\nAim profile validation passed for", entries.length, "levels.");
}

main();

