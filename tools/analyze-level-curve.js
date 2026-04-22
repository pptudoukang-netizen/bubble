"use strict";

var fs = require("fs");
var path = require("path");

var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");

var DIFFICULTY_ORDER = ["tutorial", "easy", "normal", "hard", "expert"];
var DIFFICULTY_BASE = {
  tutorial: 8,
  easy: 16,
  normal: 24,
  hard: 34,
  expert: 42
};

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

function getLevelNumber(fileName) {
  var match = fileName.match(/level_(\d+)\.json$/);
  return match ? Number(match[1]) : Number.NaN;
}

function getOccupiedRatio(layout) {
  var occupied = 0;
  var total = 0;

  (layout || []).forEach(function (rowString) {
    var chars = String(rowString).split("");
    total += chars.length;
    chars.forEach(function (ch) {
      if (ch !== ".") {
        occupied += 1;
      }
    });
  });

  if (!total) {
    return 0;
  }

  return occupied / total;
}

function getObjectivePressure(level) {
  var pressure = 0;
  var winConditions = Array.isArray(level.winConditions) ? level.winConditions : [];

  winConditions.forEach(function (condition) {
    if (condition.type === "collect_any") {
      pressure += condition.value * 0.7;
    }
    if (condition.type === "collect_color") {
      pressure += condition.value * 0.95;
    }
    if (condition.type === "collect_ice") {
      pressure += condition.value * 0.9;
    }
  });

  return pressure;
}

function calcDifficultyScore(level) {
  var base = DIFFICULTY_BASE[level.difficulty] || DIFFICULTY_BASE.normal;
  var colorPressure = Math.max(0, (level.colorCount || 0) - 3) * 4.2;
  var shotPressure = Math.max(0, 18 - (level.shotLimit || 18)) * 2.1;
  var dropPressure = Math.max(0, 8 - (level.dropInterval || 8)) * 2.8;
  var densityPressure = getOccupiedRatio(level.layout) * 8;
  var objectivePressure = getObjectivePressure(level);
  var jarTightPressure = level.jarRules && typeof level.jarRules.collectZoneScale === "number"
    ? Math.max(0, 1.12 - level.jarRules.collectZoneScale) * 10
    : 0;

  return base + colorPressure + shotPressure + dropPressure + densityPressure + objectivePressure + jarTightPressure;
}

function analyzeLevels(levels) {
  var warnings = [];
  var groups = {
    tutorial: [],
    easy: [],
    normal: [],
    hard: []
  };

  levels.forEach(function (item, index) {
    groups[item.difficulty] = groups[item.difficulty] || [];
    groups[item.difficulty].push(item.score);

    if (index > 0) {
      var previous = levels[index - 1];
      if (item.score < previous.score - 6) {
        warnings.push(
          "Level " + item.levelId + " score drops too much from previous level (" + previous.score.toFixed(1) + " -> " + item.score.toFixed(1) + ")"
        );
      }
    }
  });

  function average(values) {
    if (!values.length) {
      return 0;
    }
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  var tierAverages = DIFFICULTY_ORDER.map(function (difficulty) {
    return {
      difficulty: difficulty,
      average: average(groups[difficulty] || [])
    };
  });

  for (var i = 1; i < tierAverages.length; i += 1) {
    if (tierAverages[i].average <= tierAverages[i - 1].average) {
      warnings.push(
        "Tier average not increasing: " +
        tierAverages[i - 1].difficulty + "(" + tierAverages[i - 1].average.toFixed(1) + ") >= " +
        tierAverages[i].difficulty + "(" + tierAverages[i].average.toFixed(1) + ")"
      );
    }
  }

  return {
    warnings: warnings,
    tierAverages: tierAverages
  };
}

function printTable(levels) {
  console.log("ID  Code                        Diff      Score  colors shot drop collectZone");
  console.log("--  --------------------------  --------  -----  ------ ---- ---- -----------");

  levels.forEach(function (item) {
    var collectZone = item.collectZoneScale == null ? "-" : item.collectZoneScale.toFixed(2);
    var line = [
      String(item.levelId).padStart(2, "0"),
      String(item.code || "-").padEnd(26, " "),
      String(item.difficulty || "-").padEnd(8, " "),
      item.score.toFixed(1).padStart(6, " "),
      String(item.colorCount).padStart(6, " "),
      String(item.shotLimit).padStart(4, " "),
      String(item.dropInterval).padStart(4, " "),
      collectZone.padStart(11, " ")
    ];
    console.log(line.join("  "));
  });
}

function main() {
  var files = fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .sort(function (a, b) {
      return getLevelNumber(a) - getLevelNumber(b);
    });

  if (!files.length) {
    console.log("No level files found in " + LEVEL_DIR);
    process.exit(1);
  }

  var levels = files.map(function (fileName) {
    var parsed = readJson(path.join(LEVEL_DIR, fileName));
    var level = parsed.level || {};
    return {
      levelId: level.levelId,
      code: level.code,
      difficulty: level.difficulty,
      colorCount: level.colorCount,
      shotLimit: level.shotLimit,
      dropInterval: level.dropInterval,
      collectZoneScale: level.jarRules && level.jarRules.collectZoneScale,
      score: calcDifficultyScore(level)
    };
  });

  printTable(levels);

  var analysis = analyzeLevels(levels);
  console.log("\nTier Averages:");
  analysis.tierAverages.forEach(function (tier) {
    console.log("- " + tier.difficulty + ": " + tier.average.toFixed(2));
  });

  if (analysis.warnings.length) {
    console.log("\nCurve Warnings:");
    analysis.warnings.forEach(function (warning) {
      console.log("- " + warning);
    });
    console.log("\nDifficulty curve check failed.");
    process.exit(1);
  }

  console.log("\nDifficulty curve check passed.");
}

main();
