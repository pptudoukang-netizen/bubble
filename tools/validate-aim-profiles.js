"use strict";

var fs = require("fs");
var path = require("path");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");

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

function validateLevel(filePath) {
  var parsed = readJson(filePath);
  if (!parsed || !parsed.level) {
    return {
      ok: false,
      levelCode: path.basename(filePath),
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
    levelCode: level.code || path.basename(filePath),
    difficulty: level.difficulty || "unknown",
    profile: meta.profile,
    explicitCount: explicitCount,
    values: level,
    issues: issues
  };
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
  var levelsDir = path.resolve(__dirname, "../assets/resources/config/levels");
  var files = fs.readdirSync(levelsDir)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .sort(function (a, b) {
      return getLevelNumber(a) - getLevelNumber(b);
    });

  if (!files.length) {
    console.log("No level json files found.");
    process.exit(1);
  }

  var failed = false;
  files.forEach(function (fileName) {
    var result = validateLevel(path.join(levelsDir, fileName));
    printResult(result);
    if (!result.ok) {
      failed = true;
    }
  });

  if (failed) {
    console.log("\nAim profile validation failed.");
    process.exit(1);
  }

  console.log("\nAim profile validation passed for", files.length, "levels.");
}

main();

