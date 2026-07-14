"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var FirstHundredLevelDesign = require("./first-100-level-design");
var ReferenceLevels101To300Design = require("./reference-levels-101-300-design");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var GENERATOR_PATH = path.join(__dirname, "generate-1000-level-configs.js");
var TARGET_LEVEL_COUNT = 1000;
var COLORS = ["B", "R", "G", "Y", "P"];
var SHOT_LIMIT_ADJUSTMENTS = {
  715: 1
};
var EXPECTED_HEADERS = [
  "关卡", "蓝球", "红球", "绿球", "黄球", "紫球", "总行数",
  "石头", "雪块", "炸弹", "彩虹球", "燃烧瓶",
  "蓝分裂球", "红分裂球", "绿分裂球", "黄分裂球", "紫分裂球",
  "钥匙", "锁定球", "收集目标1", "收集目标2", "发射球数量", "通关率"
];

function parseTable(text) {
  var hasBom = text.charCodeAt(0) === 0xfeff;
  var normalized = hasBom ? text.slice(1) : text;
  var lines = normalized.trim().split(/\r?\n/);
  if (lines.length !== TARGET_LEVEL_COUNT + 1) {
    throw new Error("Level config table must contain one header and 1000 level rows.");
  }
  var headers = lines[0].split(",");
  if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
    throw new Error("Level config table headers differ from the relaxed campaign schema.");
  }
  return {
    hasBom: hasBom,
    headers: headers,
    rows: lines.slice(1).map(function (line, index) {
      var cells = line.split(",");
      if (cells.length !== headers.length) {
        throw new Error("Level config table row " + (index + 1) + " has invalid column count.");
      }
      if (Number(cells[0]) !== index + 1) {
        throw new Error("Level config table row id mismatch at " + (index + 1) + ".");
      }
      return cells;
    })
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
  throw new Error("Unsupported target type: " + target.type);
}

function buildFirstHundredCells(spec) {
  return [
    spec.levelId,
    spec.colorCounts.B,
    spec.colorCounts.R,
    spec.colorCounts.G,
    spec.colorCounts.Y,
    spec.colorCounts.P,
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
  ].map(String);
}

function getPhase(levelId) {
  return ((levelId - 1) % 10) + 1;
}

function getRowCount(levelId) {
  if (!Number.isInteger(levelId) || levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Relaxed campaign row count requires level id in [101, 1000]: " + levelId);
  }
  return 15;
}

function getActiveColors(levelId) {
  if (levelId <= 160) {
    return COLORS.slice(0, 4);
  }
  return COLORS.slice();
}

function getRowCapacity(rowCount) {
  var total = 0;
  for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
  }
  return total;
}

function getFillRatio(levelId) {
  if (levelId <= 200) {
    return 0.66;
  }
  if (levelId <= 300) {
    return 0.67;
  }
  if (levelId <= 500) {
    return 0.68;
  }
  if (levelId <= 700) {
    return 0.69;
  }
  return 0.7;
}

function getIceRatio(levelId) {
  var phase = getPhase(levelId);
  var wave = (phase - 1) / 9;
  if (levelId <= 200) {
    return 0.12 + wave * 0.03;
  }
  if (levelId <= 300) {
    return 0.14 + wave * 0.04;
  }
  if (levelId <= 500) {
    return 0.16 + wave * 0.05;
  }
  if (levelId <= 700) {
    return 0.18 + wave * 0.04;
  }
  return 0.2 + wave * 0.04;
}

function makeEmptySplitterCounts() {
  return {
    B: 0,
    R: 0,
    G: 0,
    Y: 0,
    P: 0
  };
}

function getChapter(levelId) {
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

function buildSpecialCounts(levelId, targetColor) {
  var phase = getPhase(levelId);
  var chapter = getChapter(levelId);
  var splitters = makeEmptySplitterCounts();
  var counts = {
    stone: 0,
    ice: 0,
    blast: 0,
    rainbow: 0,
    molotov: 0,
    splitters: splitters,
    key: 0,
    locked: 0
  };

  if (chapter === "molotov_splitter_combo") {
    counts.molotov = phase >= 6 ? 2 : 1;
    if (phase === 4 || phase === 8 || phase === 10) {
      splitters[targetColor] = 1;
    }
    if (phase === 7) {
      counts.blast = 1;
    }
  } else if (chapter === "splitter_lock_combo") {
    splitters[targetColor] = 1;
    counts.key = phase >= 8 ? 2 : 1;
    counts.locked = counts.key;
    if (phase === 5) {
      counts.rainbow = 1;
    }
  } else if (chapter === "full_reactive_exam") {
    counts.molotov = phase >= 5 ? 2 : 1;
    splitters[targetColor] = 1;
    counts.key = phase >= 8 ? 2 : 1;
    counts.locked = counts.key;
    counts.blast = phase === 10 ? 1 : 0;
  } else if (chapter === "blast_chain_routes") {
    counts.molotov = phase >= 6 ? 2 : 1;
    counts.blast = phase === 3 || phase === 7 || phase === 10 ? 1 : 0;
    counts.stone = phase === 5 || phase === 10 ? 1 : 0;
  } else if (chapter === "growth_and_keys") {
    splitters[targetColor] = phase >= 4 ? 2 : 1;
    counts.key = phase >= 6 ? 2 : 1;
    counts.locked = counts.key;
    counts.rainbow = phase === 8 ? 1 : 0;
  } else if (chapter === "symbolic_patterns") {
    if (phase === 2 || phase === 6) {
      counts.molotov = 1;
    }
    if (phase === 4 || phase === 8) {
      splitters[targetColor] = 1;
    }
    if (phase === 5 || phase === 10) {
      counts.key = phase === 10 ? 2 : 1;
      counts.locked = counts.key;
    }
    counts.blast = phase === 7 || phase === 8 ? 1 : 0;
  } else if (chapter === "full_system_mastery") {
    if (phase === 1 || phase === 4 || phase === 7 || phase === 9 || phase === 10) {
      counts.molotov = phase === 10 ? 2 : 1;
    }
    if (phase === 2 || phase === 5 || phase === 7 || phase === 8 || phase === 10) {
      splitters[targetColor] = phase === 10 ? 2 : 1;
    }
    if (phase === 3 || phase === 6 || phase === 8 || phase === 9 || phase === 10) {
      counts.key = phase === 10 ? 2 : 1;
      counts.locked = counts.key;
    }
    counts.blast = phase === 4 || phase === 10 ? 1 : 0;
    counts.stone = phase === 5 || phase === 10 ? 1 : 0;
    counts.rainbow = phase === 6 ? 1 : 0;
  } else {
    throw new Error("Unsupported chapter for level " + levelId + ": " + chapter);
  }

  return counts;
}

function countSplitters(splitterCounts) {
  return COLORS.reduce(function (sum, color) {
    return sum + splitterCounts[color];
  }, 0);
}

function countNonIceSpecials(counts) {
  return counts.stone + counts.blast + counts.rainbow + counts.molotov +
    countSplitters(counts.splitters) + counts.key + counts.locked;
}

function distributeColorCounts(levelId, activeColors, targetColor, normalCount) {
  var counts = {
    B: 0,
    R: 0,
    G: 0,
    Y: 0,
    P: 0
  };
  var targetRatio = levelId <= 200 ? 0.38 : (levelId <= 500 ? 0.36 : 0.34);
  var targetCount = Math.max(10, Math.round(normalCount * targetRatio));
  var otherColors = activeColors.filter(function (color) {
    return color !== targetColor;
  });
  if (!otherColors.length) {
    throw new Error("Relaxed campaign requires non-target colors for level " + levelId + ".");
  }
  var remaining = normalCount - targetCount;
  var minimumOtherSupply = otherColors.length * 8;
  if (remaining < minimumOtherSupply) {
    targetCount -= minimumOtherSupply - remaining;
    remaining = minimumOtherSupply;
  }
  if (targetCount < 8) {
    throw new Error("Unable to reserve target color supply for level " + levelId + ".");
  }
  counts[targetColor] = targetCount;
  var base = Math.floor(remaining / otherColors.length);
  var remainder = remaining % otherColors.length;
  otherColors.forEach(function (color) {
    counts[color] = base;
  });
  for (var index = 0; index < remainder; index += 1) {
    counts[otherColors[(levelId + index) % otherColors.length]] += 1;
  }
  return counts;
}

function buildRelaxedSpec(levelId) {
  var rowCount = getRowCount(levelId);
  var activeColors = getActiveColors(levelId);
  var targetColor = activeColors[(levelId - 1) % activeColors.length];
  var specialCounts = buildSpecialCounts(levelId, targetColor);
  var capacity = getRowCapacity(rowCount);
  var occupiedTarget = Math.round(capacity * getFillRatio(levelId));
  var iceTarget = Math.round(occupiedTarget * getIceRatio(levelId));
  var nonIceSpecials = countNonIceSpecials(specialCounts);
  var maxIce = Math.max(3, Math.floor((occupiedTarget - nonIceSpecials) * 0.24));
  specialCounts.ice = Math.max(3, Math.min(maxIce, iceTarget));
  var normalCount = occupiedTarget - specialCounts.ice - nonIceSpecials;
  if (normalCount < activeColors.length * 8) {
    throw new Error("Level " + levelId + " relaxed design leaves too few normal balls.");
  }
  var colorCounts = distributeColorCounts(levelId, activeColors, targetColor, normalCount);
  var splitterCount = specialCounts.splitters[targetColor];
  var shotLimit;
  if (levelId >= ReferenceLevels101To300Design.FIRST_LEVEL_ID &&
    levelId <= ReferenceLevels101To300Design.LAST_LEVEL_ID) {
    shotLimit = ReferenceLevels101To300Design.getShotLimit(levelId);
  } else {
    shotLimit = Math.ceil(occupiedTarget * 0.25 + rowCount * 0.65 + nonIceSpecials * 0.5);
    if (getPhase(levelId) >= 7) {
      shotLimit += 1;
    }
    if (getPhase(levelId) >= 9) {
      shotLimit += 1;
    }
    if (Object.prototype.hasOwnProperty.call(SHOT_LIMIT_ADJUSTMENTS, levelId)) {
      shotLimit += SHOT_LIMIT_ADJUSTMENTS[levelId];
    }
    shotLimit = Math.max(28, Math.min(46, shotLimit));
  }
  var passRate = Math.max(42, 78 - Math.floor((levelId - 101) / 100) * 4 - (getPhase(levelId) - 1) * 1.8);

  return {
    levelId: levelId,
    colorCounts: colorCounts,
    rowCount: rowCount,
    specialCounts: specialCounts,
    target1: {
      type: "collect_color",
      color: targetColor,
      value: colorCounts[targetColor] + splitterCount * 5
    },
    target2: specialCounts.ice >= 3
      ? { type: "collect_ice_snowball", value: specialCounts.ice }
      : null,
    shotLimit: shotLimit,
    passRate: passRate
  };
}

function buildRelaxedCells(spec) {
  return [
    spec.levelId,
    spec.colorCounts.B,
    spec.colorCounts.R,
    spec.colorCounts.G,
    spec.colorCounts.Y,
    spec.colorCounts.P,
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
  ].map(String);
}

function rewriteTable() {
  var parsed = parseTable(fs.readFileSync(TABLE_PATH, "utf8"));
  for (var levelId = 1; levelId <= TARGET_LEVEL_COUNT; levelId += 1) {
    if (levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID) {
      parsed.rows[levelId - 1] = buildFirstHundredCells(FirstHundredLevelDesign.buildLevelSpec(levelId));
    } else {
      parsed.rows[levelId - 1] = buildRelaxedCells(buildRelaxedSpec(levelId));
    }
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
  var result = childProcess.spawnSync(process.execPath, [GENERATOR_PATH], {
    cwd: PROJECT_ROOT,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Relaxed campaign generator exited with status " + result.status + ".");
  }
}

function main() {
  rewriteTable();
  runGenerator();
}

main();
