"use strict";

var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var OUTPUT_CSV = path.resolve(__dirname, "../LEVEL_CONFIG_TABLE_1_1000_ACTUAL.csv");
var OUTPUT_MD = path.resolve(__dirname, "../LEVEL_CONFIG_TABLE_1_1000_ACTUAL.md");

var PassRateSimulator = require("./level-pass-rate-simulator");

var HEADERS = [
  "关卡",
  "蓝球",
  "红球",
  "绿球",
  "黄球",
  "紫球",
  "总行数",
  "石头",
  "雪块",
  "炸弹",
  "彩虹球",
  "燃烧瓶",
  "蓝分裂球",
  "红分裂球",
  "绿分裂球",
  "黄分裂球",
  "紫分裂球",
  "钥匙",
  "锁定球",
  "收集目标1",
  "收集目标2",
  "发射球数量",
  "通关率"
];

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

function listLocalLevelEntries() {
  return fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .map(function (fileName) {
      return {
        levelId: getLevelNumber(fileName),
        data: readJson(path.join(LEVEL_DIR, fileName))
      };
    });
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
        throw new Error("remote level pack must be object: " + fileName);
      }
      if (pack.schemaVersion !== 1) {
        throw new Error("remote level pack schemaVersion must be 1: " + fileName);
      }
      if (pack.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1) {
        throw new Error("remote level pack format must be " + LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1 + ": " + fileName);
      }
      pack = LevelPackCompactCodec.expandPack(pack);
      if (!pack.levels || typeof pack.levels !== "object" || Array.isArray(pack.levels)) {
        throw new Error("remote level pack levels must be object: " + fileName);
      }

      for (var levelId = pack.from; levelId <= pack.to; levelId += 1) {
        var levelKey = "level_" + String(levelId).padStart(3, "0");
        if (!pack.levels[levelKey] || typeof pack.levels[levelKey] !== "object" || Array.isArray(pack.levels[levelKey])) {
          throw new Error("remote level pack missing " + levelKey + ": " + fileName);
        }
        entries.push({
          levelId: levelId,
          data: pack.levels[levelKey]
        });
      }
    });

  return entries;
}

function listAllLevelEntries() {
  return listLocalLevelEntries().concat(listRemotePackEntries()).sort(function (a, b) {
    return a.levelId - b.levelId;
  });
}

function countLayoutColors(layout) {
  var counts = { B: 0, R: 0, G: 0, Y: 0, P: 0 };
  if (!Array.isArray(layout)) {
    throw new Error("layout must be array");
  }
  layout.forEach(function (rowString) {
    if (typeof rowString !== "string") {
      throw new Error("layout row must be string");
    }
    rowString.split("").forEach(function (cellCode) {
      if (counts[cellCode] != null) {
        counts[cellCode] += 1;
      }
    });
  });
  return counts;
}

function countSpecialEntities(specialEntities) {
  var counts = {
    stone: 0,
    ice: 0,
    blast: 0,
    rainbow: 0,
    molotov: 0,
    splitterB: 0,
    splitterR: 0,
    splitterG: 0,
    splitterY: 0,
    splitterP: 0,
    key: 0,
    locked: 0
  };

  if (specialEntities == null) {
    return counts;
  }
  if (!Array.isArray(specialEntities)) {
    throw new Error("specialEntities must be array");
  }

  specialEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object") {
      throw new Error("specialEntities[" + index + "] must be object");
    }
    if (entity.entityCategory === "obstacle_ball" && entity.entityType === "stone") {
      counts.stone += 1;
      return;
    }
    if (entity.entityCategory === "obstacle_ball" && entity.entityType === "ice") {
      counts.ice += 1;
      return;
    }
    if (entity.entityCategory === "skill_ball" && entity.entityType === "blast") {
      counts.blast += 1;
      return;
    }
    if (entity.entityCategory === "skill_ball" && entity.entityType === "rainbow") {
      counts.rainbow += 1;
      return;
    }
    if (entity.entityCategory === "reactive_ball" && entity.entityType === "molotov") {
      counts.molotov += 1;
      return;
    }
    if (entity.entityCategory === "reactive_ball" && entity.entityType === "splitter") {
      if (typeof entity.splitColor !== "string") {
        throw new Error("specialEntities[" + index + "].splitColor is required for splitter");
      }
      var splitterKey = "splitter" + entity.splitColor;
      if (counts[splitterKey] == null) {
        throw new Error("specialEntities[" + index + "].splitColor invalid: " + entity.splitColor);
      }
      counts[splitterKey] += 1;
      return;
    }
    if (entity.entityCategory === "key_ball" && entity.entityType === "key") {
      counts.key += 1;
      return;
    }
    if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
      counts.locked += 1;
    }
  });

  return counts;
}

function formatObjective(condition, index) {
  if (!condition || typeof condition !== "object") {
    throw new Error("winConditions[" + index + "] must be object");
  }
  if (condition.type === "collect_any") {
    return String(condition.value);
  }
  if (condition.type === "collect_color") {
    return condition.color + ":" + condition.value;
  }
  if (condition.type === "collect_ice_snowball") {
    return "雪球:" + condition.value;
  }
  throw new Error("winConditions[" + index + "] unsupported type: " + condition.type);
}

function formatWinTargets(winConditions) {
  if (!Array.isArray(winConditions)) {
    throw new Error("winConditions must be array");
  }
  if (winConditions.length < 1 || winConditions.length > 2) {
    throw new Error("winConditions must contain one or two collection objectives");
  }
  return [
    formatObjective(winConditions[0], 0),
    winConditions.length === 2 ? formatObjective(winConditions[1], 1) : "-"
  ];
}

function buildRow(entry) {
  var level = entry.data.level;
  if (!level || typeof level !== "object") {
    throw new Error("level " + entry.levelId + " missing level object");
  }
  if (level.levelId !== entry.levelId) {
    throw new Error("level " + entry.levelId + " levelId mismatch: " + level.levelId);
  }
  if (!Number.isInteger(level.shotLimit)) {
    throw new Error("level " + entry.levelId + " shotLimit must be integer");
  }

  var colorCounts = countLayoutColors(level.layout);
  var specialCounts = countSpecialEntities(level.specialEntities);
  var objectiveDisplays = formatWinTargets(level.winConditions);
  var ballTotal = colorCounts.B + colorCounts.R + colorCounts.G + colorCounts.Y + colorCounts.P;
  var splitterTotal =
    specialCounts.splitterB +
    specialCounts.splitterR +
    specialCounts.splitterG +
    specialCounts.splitterY +
    specialCounts.splitterP;
  var passRate = PassRateSimulator.simulatePassRate({
    levelId: entry.levelId,
    ballTotal: ballTotal,
    rows: level.layout.length,
    shots: level.shotLimit,
    stone: specialCounts.stone,
    ice: specialCounts.ice,
    blast: specialCounts.blast,
    rainbow: specialCounts.rainbow,
    molotov: specialCounts.molotov,
    splitterTotal: splitterTotal,
    key: specialCounts.key,
    locked: specialCounts.locked,
    primaryTargetDisplay: objectiveDisplays[0],
    secondaryTargetDisplay: objectiveDisplays[1],
    colorCounts: colorCounts
  });

  return [
    entry.levelId,
    colorCounts.B,
    colorCounts.R,
    colorCounts.G,
    colorCounts.Y,
    colorCounts.P,
    level.layout.length,
    specialCounts.stone,
    specialCounts.ice,
    specialCounts.blast,
    specialCounts.rainbow,
    specialCounts.molotov,
    specialCounts.splitterB,
    specialCounts.splitterR,
    specialCounts.splitterG,
    specialCounts.splitterY,
    specialCounts.splitterP,
    specialCounts.key,
    specialCounts.locked,
    objectiveDisplays[0],
    objectiveDisplays[1],
    level.shotLimit,
    PassRateSimulator.formatPassRate(passRate)
  ];
}

function escapeCsvCell(value) {
  var text = String(value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function writeCsv(rows, filePath) {
  var lines = [HEADERS.map(escapeCsvCell).join(",")];
  rows.forEach(function (row) {
    lines.push(row.map(escapeCsvCell).join(","));
  });
  fs.writeFileSync(filePath, "\ufeff" + lines.join("\r\n"), "utf8");
}

function writeMarkdown(rows, filePath) {
  var lines = [];
  lines.push("# 关卡现网配置表（1-1000）");
  lines.push("");
  lines.push("本表直接反映当前关卡 JSON，行数未做设计调整。");
  lines.push("| " + HEADERS.join(" | ") + " |");
  lines.push("| " + HEADERS.map(function () { return "---"; }).join(" | ") + " |");
  rows.forEach(function (row) {
    lines.push("| " + row.join(" | ") + " |");
  });
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function main() {
  var entries = listAllLevelEntries();
  if (entries.length !== 1000) {
    throw new Error("expected 1000 levels but found " + entries.length);
  }

  var rows = entries.map(buildRow);
  writeCsv(rows, OUTPUT_CSV);
  writeMarkdown(rows, OUTPUT_MD);

  console.log("Exported " + rows.length + " levels");
  console.log("CSV: " + OUTPUT_CSV);
  console.log("Markdown: " + OUTPUT_MD);
}

main();
