"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");

var FirstHundredLevelDesign = require("./first-100-level-design");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var GENERATOR_PATH = path.join(__dirname, "generate-1000-level-configs.js");
var EXPECTED_HEADERS = [
  "关卡", "蓝球", "红球", "绿球", "黄球", "紫球", "橙球", "黑球", "白球", "总行数",
  "石头", "雪块", "炸弹", "彩虹球", "燃烧瓶",
  "蓝分裂球", "红分裂球", "绿分裂球", "黄分裂球", "紫分裂球",
  "钥匙", "锁定球", "收集目标1", "收集目标2", "发射球数量", "通关率"
];

function parseTable(text) {
  var hasBom = text.charCodeAt(0) === 0xfeff;
  var normalized = hasBom ? text.slice(1) : text;
  var lines = normalized.trim().split(/\r?\n/);
  if (lines.length !== 1001) {
    throw new Error("Level config table must contain one header and 1000 level rows.");
  }
  var headers = lines[0].split(",");
  if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
    throw new Error("Level config table headers differ from the strict first-100 schema.");
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
    rows: rows
  };
}

function formatTarget(target) {
  if (target === null) {
    return "-";
  }
  if (target.type === "collect_color") {
    return target.color + ":" + target.value;
  }
  if (target.type === "collect_ice_snowball") {
    return "雪球:" + target.value;
  }
  if (target.type === "clear_all" && target.value === 1) {
    return "清空棋盘";
  }
  throw new Error("Unsupported first-100 target type: " + target.type);
}

function buildTableCells(spec) {
  return [
    spec.levelId,
    spec.colorCounts.B,
    spec.colorCounts.R,
    spec.colorCounts.G,
    spec.colorCounts.Y,
    spec.colorCounts.P,
    spec.colorCounts.O,
    spec.colorCounts.K,
    spec.colorCounts.W,
    spec.rowCount,
    spec.specialCounts.stone,
    spec.specialCounts.ice,
    spec.specialCounts.blast,
    spec.specialCounts.rainbow,
    spec.specialCounts.molotov,
    spec.specialCounts.splitters.B,
    spec.specialCounts.splitters.R,
    spec.specialCounts.splitters.G,
    spec.specialCounts.splitters.Y,
    spec.specialCounts.splitters.P,
    spec.specialCounts.key,
    spec.specialCounts.locked,
    formatTarget(spec.target1),
    formatTarget(spec.target2),
    spec.shotLimit,
    spec.passRate.toFixed(1) + "%"
  ].map(function (value) {
    return String(value);
  });
}

function rewriteFirstHundredTable() {
  var parsed = parseTable(fs.readFileSync(TABLE_PATH, "utf8"));
  for (var levelId = FirstHundredLevelDesign.FIRST_LEVEL_ID;
    levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID;
    levelId += 1) {
    parsed.rows[levelId - 1] = buildTableCells(FirstHundredLevelDesign.buildLevelSpec(levelId));
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
  var result = childProcess.spawnSync(process.execPath, [GENERATOR_PATH, "--first100"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("First-100 level generator exited with status " + result.status + ".");
  }
}

function main() {
  rewriteFirstHundredTable();
  runGenerator();
}

main();
