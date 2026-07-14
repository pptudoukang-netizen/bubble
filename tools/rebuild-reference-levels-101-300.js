"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");

var ReferenceDesign = require("./reference-levels-101-300-design");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var GENERATOR_PATH = path.join(__dirname, "generate-1000-level-configs.js");
var TARGET_LEVEL_COUNT = 1000;
var SHOT_LIMIT_HEADER = "发射球数量";

function parseTable(text) {
  var hasBom = text.charCodeAt(0) === 0xfeff;
  var normalized = hasBom ? text.slice(1) : text;
  var lines = normalized.trim().split(/\r?\n/);
  if (lines.length !== TARGET_LEVEL_COUNT + 1) {
    throw new Error("Level config table must contain one header and 1000 level rows.");
  }
  var headers = lines[0].split(",");
  var shotLimitIndex = headers.indexOf(SHOT_LIMIT_HEADER);
  if (shotLimitIndex < 0 || headers.lastIndexOf(SHOT_LIMIT_HEADER) !== shotLimitIndex) {
    throw new Error("Level config table must contain exactly one 发射球数量 column.");
  }
  var rows = lines.slice(1).map(function (line, index) {
    var cells = line.split(",");
    if (cells.length !== headers.length) {
      throw new Error("Level config table row " + (index + 1) + " has invalid column count.");
    }
    if (Number(cells[0]) !== index + 1) {
      throw new Error("Level config table row id mismatch at " + (index + 1) + ".");
    }
    return cells;
  });
  return {
    hasBom: hasBom,
    headers: headers,
    rows: rows,
    shotLimitIndex: shotLimitIndex
  };
}

function rewriteShotLimits() {
  var parsed = parseTable(fs.readFileSync(TABLE_PATH, "utf8"));
  for (var levelId = ReferenceDesign.FIRST_LEVEL_ID;
    levelId <= ReferenceDesign.LAST_LEVEL_ID;
    levelId += 1) {
    parsed.rows[levelId - 1][parsed.shotLimitIndex] = String(ReferenceDesign.getShotLimit(levelId));
  }
  var output = parsed.headers.join(",") + "\n" + parsed.rows.map(function (cells) {
    return cells.join(",");
  }).join("\n") + "\n";
  if (parsed.hasBom) {
    output = "\ufeff" + output;
  }
  fs.writeFileSync(TABLE_PATH, output, "utf8");
}

function runGenerator() {
  var result = childProcess.spawnSync(process.execPath, [GENERATOR_PATH, "--reference101-300"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Reference levels 101-300 generator exited with status " + result.status + ".");
  }
}

function main() {
  rewriteShotLimits();
  runGenerator();
}

main();
