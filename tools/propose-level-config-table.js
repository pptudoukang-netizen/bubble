"use strict";

var fs = require("fs");
var path = require("path");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var LEVEL_DIR = path.resolve(__dirname, "../assets/map/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var OUTPUT_CSV = path.resolve(__dirname, "../LEVEL_CONFIG_TABLE_1_1000.csv");
var OUTPUT_MD = path.resolve(__dirname, "../LEVEL_CONFIG_TABLE_1_1000.md");
var OUTPUT_RULES = path.resolve(__dirname, "../LEVEL_CONFIG_TABLE_PROPOSED_RULES.md");

var PassRateSimulator = require("./level-pass-rate-simulator");

var MAX_BOARD_ROWS = 20;
var MIN_BOARD_ROWS = 8;
var MAX_SHOT_LIMIT = 30;
var ICE_INTRO_LEVEL = 16;
var MIN_ICE_COUNT = 2;
var MAX_ICE_COUNT = 100;
var SPLITTER_TARGET_BONUS_PER_BALL = 5;
var TARGET_OCCUPANCY_RATIO = 0.92;
var MIN_PASS_RATE = PassRateSimulator.MIN_PASS_RATE;
var MAX_TUNE_ITERATIONS = 500;
var TARGET_LEVEL_COUNT = 1000;

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

function findSplitterInfo(specialCounts) {
  var colors = ["B", "R", "G", "Y", "P"];
  var color = null;
  var count = 0;
  colors.forEach(function (code) {
    var splitterCount = specialCounts["splitter" + code];
    if (splitterCount > 0) {
      if (color !== null) {
        throw new Error("multiple splitter colors in one level");
      }
      color = code;
      count = splitterCount;
    }
  });
  return { color: color, count: count };
}

function parseBallCollectionObjective(winConditions) {
  if (!Array.isArray(winConditions)) {
    throw new Error("winConditions must be array");
  }

  var ballObjective = null;
  winConditions.forEach(function (condition, index) {
    if (!condition || typeof condition !== "object") {
      throw new Error("winConditions[" + index + "] must be object");
    }
    if (condition.type === "collect_any" || condition.type === "collect_color") {
      if (ballObjective) {
        throw new Error("winConditions has multiple ball collection objectives");
      }
      ballObjective = condition;
    }
  });

  return ballObjective;
}

function formatBallObjective(objective) {
  if (!objective) {
    throw new Error("ball collection objective is required");
  }
  if (objective.type === "collect_any") {
    return String(objective.value);
  }
  if (objective.type === "collect_color") {
    return objective.color + ":" + objective.value;
  }
  throw new Error("unsupported ball objective type: " + objective.type);
}

function getProgress(levelId) {
  return (levelId - 1) / (TARGET_LEVEL_COUNT - 1);
}

function proposeRowCount(levelId, currentRows) {
  var progress = getProgress(levelId);
  var targetRows = Math.round(MIN_BOARD_ROWS + progress * (MAX_BOARD_ROWS - MIN_BOARD_ROWS));
  return Math.min(MAX_BOARD_ROWS, Math.max(MIN_BOARD_ROWS, Math.max(currentRows, targetRows)));
}

function scaleCount(value, scale) {
  return Math.max(0, Math.round(value * scale));
}

function getRowCapacity(rowIndex) {
  return BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
}

function getBoardCapacity(rowCount) {
  if (!Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error("rowCount must be positive integer");
  }
  var capacity = 0;
  for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    capacity += getRowCapacity(rowIndex);
  }
  return capacity;
}

function sumColorCounts(colorCounts) {
  return colorCounts.B + colorCounts.R + colorCounts.G + colorCounts.Y + colorCounts.P;
}

function sumSpecialCounts(specialCounts, proposedIce) {
  return specialCounts.stone +
    proposedIce +
    specialCounts.blast +
    specialCounts.rainbow +
    specialCounts.molotov +
    specialCounts.splitterB +
    specialCounts.splitterR +
    specialCounts.splitterG +
    specialCounts.splitterY +
    specialCounts.splitterP +
    specialCounts.key +
    specialCounts.locked;
}

function trimColorCountsToCapacity(colorCounts, specialCounts, proposedRows, proposedIce) {
  var capacity = Math.floor(getBoardCapacity(proposedRows) * TARGET_OCCUPANCY_RATIO);
  var specialTotal = sumSpecialCounts(specialCounts, proposedIce);
  var maxColorTotal = capacity - specialTotal;
  if (maxColorTotal <= 0) {
    throw new Error("special entity count exceeds proposed board capacity");
  }

  var colorTotal = sumColorCounts(colorCounts);
  if (colorTotal <= maxColorTotal) {
    return colorCounts;
  }

  var scale = maxColorTotal / colorTotal;
  var colors = ["B", "R", "G", "Y", "P"];
  var trimmed = {};
  var used = 0;
  colors.forEach(function (color) {
    trimmed[color] = Math.max(0, Math.floor(colorCounts[color] * scale));
    used += trimmed[color];
  });

  var remaining = maxColorTotal - used;
  colors.sort(function (a, b) {
    return colorCounts[b] - colorCounts[a];
  });
  for (var index = 0; index < colors.length && remaining > 0; index += 1) {
    if (colorCounts[colors[index]] > 0) {
      trimmed[colors[index]] += 1;
      remaining -= 1;
    }
  }

  return {
    B: trimmed.B,
    R: trimmed.R,
    G: trimmed.G,
    Y: trimmed.Y,
    P: trimmed.P
  };
}

function computeDesiredIceCount(levelId, progress, currentIce, proposedRows) {
  if (levelId < ICE_INTRO_LEVEL) {
    return 0;
  }

  var rowFactor = proposedRows / MAX_BOARD_ROWS;
  var weightBonus = (levelId % 4 === 0 ? 1 : 0) + (levelId % 7 === 0 ? 1 : 0);
  var fromProgress = Math.round(MIN_ICE_COUNT + progress * (MAX_ICE_COUNT - MIN_ICE_COUNT));
  var fromWeight = Math.ceil((2 + Math.floor(progress * 10) + weightBonus) * rowFactor * 2);
  var fromDensity = Math.max(MIN_ICE_COUNT, Math.round(proposedRows * (0.5 + progress * 4)));
  var proposed = Math.max(currentIce, MIN_ICE_COUNT, fromProgress, fromWeight, fromDensity);
  return Math.min(MAX_ICE_COUNT, proposed);
}

function capIceCountToBoard(proposedIce, proposedRows, proposedColors, specialCounts) {
  if (proposedIce <= 0) {
    return 0;
  }
  var capacity = Math.floor(getBoardCapacity(proposedRows) * TARGET_OCCUPANCY_RATIO);
  var colorTotal = sumColorCounts(proposedColors);
  var otherSpecialTotal = sumSpecialCounts(specialCounts, 0);
  var maxIce = capacity - colorTotal - otherSpecialTotal;
  if (maxIce < MIN_ICE_COUNT) {
    throw new Error("board capacity cannot fit minimum ice count after color and special entities");
  }
  return Math.min(proposedIce, MAX_ICE_COUNT, maxIce);
}

function resolveProposedIce(levelId, progress, currentIce, proposedRows, proposedColors, specialCounts) {
  var desiredIce = computeDesiredIceCount(levelId, progress, currentIce, proposedRows);
  return capIceCountToBoard(desiredIce, proposedRows, proposedColors, specialCounts);
}

function pickCollectColor(levelId, level, proposedColors, splitterInfo) {
  if (splitterInfo.color) {
    return splitterInfo.color;
  }
  if (!Array.isArray(level.colors) || !level.colors.length) {
    throw new Error("level " + levelId + " colors must be non-empty array");
  }

  var preferredColor = level.colors[levelId % level.colors.length];
  if (proposedColors[preferredColor] > 0) {
    return preferredColor;
  }

  var bestColor = null;
  var bestSupply = 0;
  level.colors.forEach(function (color) {
    var supply = proposedColors[color];
    if (supply > bestSupply) {
      bestSupply = supply;
      bestColor = color;
    }
  });
  if (!bestColor || bestSupply <= 0) {
    throw new Error("level " + levelId + " has no positive color supply for collect_color");
  }
  return bestColor;
}

function proposePrimaryObjective(levelId, proposedColors, level, splitterInfo) {
  var collectColor = pickCollectColor(levelId, level, proposedColors, splitterInfo);
  var colorSupply = proposedColors[collectColor];
  if (!Number.isFinite(colorSupply) || colorSupply <= 0) {
    throw new Error("level " + levelId + " collect color supply must be positive: " + collectColor);
  }

  var colorValue = colorSupply + splitterInfo.count * SPLITTER_TARGET_BONUS_PER_BALL;
  return {
    type: "collect_color",
    color: collectColor,
    value: colorValue,
    display: collectColor + ":" + colorValue
  };
}

function proposeSnowObjective(levelId, proposedIce) {
  if (levelId < ICE_INTRO_LEVEL || proposedIce <= 0) {
    return {
      type: null,
      value: 0,
      display: "-"
    };
  }

  return {
    type: "collect_ice_snowball",
    value: proposedIce,
    display: "雪球:" + proposedIce
  };
}

function proposeShotLimit(levelId, proposedRows, primaryObjective, snowObjective, specialCounts) {
  var progress = getProgress(levelId);
  var specialPressure =
    specialCounts.stone * 0.45 +
    specialCounts.blast * -0.25 +
    specialCounts.rainbow * -0.3 +
    specialCounts.molotov * 0.35 +
    specialCounts.key * 0.35 +
    specialCounts.locked * 0.45;
  var proposed = Math.ceil(
    8 +
    proposedRows * 0.35 +
    primaryObjective.value * 0.22 +
    snowObjective.value * 0.85 +
    specialPressure +
    progress * 5
  );
  return Math.min(MAX_SHOT_LIMIT, Math.max(6, proposed));
}

function rebuildPrimaryDisplay(primaryObjective) {
  if (primaryObjective.type !== "collect_color") {
    throw new Error("primary objective must be collect_color");
  }
  return primaryObjective.color + ":" + primaryObjective.value;
}

function resolveMinimumPrimaryValue(primaryObjective, proposedColors, splitterCount) {
  if (primaryObjective.type !== "collect_color") {
    throw new Error("primary objective must be collect_color");
  }
  var colorSupply = proposedColors[primaryObjective.color];
  if (!Number.isFinite(colorSupply) || colorSupply <= 0) {
    throw new Error("missing color supply for minimum primary target: " + primaryObjective.color);
  }
  return colorSupply + splitterCount * SPLITTER_TARGET_BONUS_PER_BALL;
}

function buildPassRateMetrics(params) {
  return {
    levelId: params.levelId,
    ballTotal: params.ballTotal,
    rows: params.rows,
    shots: params.shots,
    stone: params.stone,
    ice: params.ice,
    blast: params.blast,
    rainbow: params.rainbow,
    molotov: params.molotov,
    splitterTotal: params.splitterTotal,
    key: params.key,
    locked: params.locked,
    primaryTargetDisplay: params.primaryDisplay,
    secondaryTargetDisplay: params.snowDisplay,
    colorCounts: params.colorCounts
  };
}

function tuneForMinimumPassRate(levelId, primaryObjective, snowObjective, proposedShots, metricsBase, minPrimaryValue, minSnowValue) {
  var shots = Math.min(MAX_SHOT_LIMIT, proposedShots);
  var primary = {
    type: primaryObjective.type,
    color: primaryObjective.color,
    value: primaryObjective.value,
    display: primaryObjective.display
  };
  var snow = {
    type: snowObjective.type,
    value: snowObjective.value,
    display: snowObjective.display
  };

  function simulateCurrent(applyFloor) {
    return PassRateSimulator.computePassRate(buildPassRateMetrics({
      levelId: metricsBase.levelId,
      ballTotal: metricsBase.ballTotal,
      rows: metricsBase.rows,
      shots: shots,
      stone: metricsBase.stone,
      ice: metricsBase.ice,
      blast: metricsBase.blast,
      rainbow: metricsBase.rainbow,
      molotov: metricsBase.molotov,
      splitterTotal: metricsBase.splitterTotal,
      key: metricsBase.key,
      locked: metricsBase.locked,
      primaryDisplay: primary.display,
      snowDisplay: snow.display,
      colorCounts: metricsBase.colorCounts
    }), { applyFloor: applyFloor === true });
  }

  var passRate = simulateCurrent(false);
  var iteration = 0;

  while (passRate < MIN_PASS_RATE && iteration < MAX_TUNE_ITERATIONS) {
    if (shots < MAX_SHOT_LIMIT) {
      shots += 1;
    } else if (primary.value > minPrimaryValue) {
      primary.value = Math.max(minPrimaryValue, Math.ceil(primary.value * 0.90));
      primary.display = rebuildPrimaryDisplay(primary);
    } else if (snow.value > minSnowValue) {
      snow.value -= 1;
      snow.display = "雪球:" + snow.value;
    } else {
      break;
    }
    passRate = simulateCurrent(false);
    iteration += 1;
  }

  return {
    primaryObjective: primary,
    snowObjective: snow,
    proposedShots: shots,
    passRate: simulateCurrent(true)
  };
}

function buildProposedRow(entry) {
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

  var progress = getProgress(entry.levelId);
  var currentRows = level.layout.length;
  var proposedRows = proposeRowCount(entry.levelId, currentRows);
  var rowScale = proposedRows / currentRows;

  var colorCounts = countLayoutColors(level.layout);
  var specialCounts = countSpecialEntities(level.specialEntities);
  var splitterInfo = findSplitterInfo(specialCounts);
  var desiredIce = computeDesiredIceCount(entry.levelId, progress, specialCounts.ice, proposedRows);

  var proposedColors = {
    B: scaleCount(colorCounts.B, rowScale),
    R: scaleCount(colorCounts.R, rowScale),
    G: scaleCount(colorCounts.G, rowScale),
    Y: scaleCount(colorCounts.Y, rowScale),
    P: scaleCount(colorCounts.P, rowScale)
  };
  proposedColors = trimColorCountsToCapacity(proposedColors, specialCounts, proposedRows, desiredIce);
  var proposedIce = resolveProposedIce(entry.levelId, progress, specialCounts.ice, proposedRows, proposedColors, specialCounts);
  proposedColors = trimColorCountsToCapacity(proposedColors, specialCounts, proposedRows, proposedIce);
  var ballTotal = proposedColors.B + proposedColors.R + proposedColors.G + proposedColors.Y + proposedColors.P;

  var primaryObjective = proposePrimaryObjective(
    entry.levelId,
    proposedColors,
    level,
    splitterInfo
  );
  var snowObjective = proposeSnowObjective(entry.levelId, proposedIce);
  var proposedShots = proposeShotLimit(
    entry.levelId,
    proposedRows,
    primaryObjective,
    snowObjective,
    specialCounts
  );

  if (snowObjective.value > proposedIce) {
    throw new Error("level " + entry.levelId + " snow target exceeds ice supply");
  }

  var splitterTotal =
    specialCounts.splitterB +
    specialCounts.splitterR +
    specialCounts.splitterG +
    specialCounts.splitterY +
    specialCounts.splitterP;
  var minPrimaryValue = resolveMinimumPrimaryValue(primaryObjective, proposedColors, splitterInfo.count);
  var minSnowValue = snowObjective.value;
  var tuned = tuneForMinimumPassRate(
    entry.levelId,
    primaryObjective,
    snowObjective,
    proposedShots,
    {
      levelId: entry.levelId,
      ballTotal: ballTotal,
      rows: proposedRows,
      stone: specialCounts.stone,
      ice: proposedIce,
      blast: specialCounts.blast,
      rainbow: specialCounts.rainbow,
      molotov: specialCounts.molotov,
      splitterTotal: splitterTotal,
      key: specialCounts.key,
      locked: specialCounts.locked,
      colorCounts: proposedColors
    },
    minPrimaryValue,
    minSnowValue
  );

  if (tuned.snowObjective.value > proposedIce) {
    throw new Error("level " + entry.levelId + " tuned snow target exceeds ice supply");
  }

  return [
    entry.levelId,
    proposedColors.B,
    proposedColors.R,
    proposedColors.G,
    proposedColors.Y,
    proposedColors.P,
    proposedRows,
    specialCounts.stone,
    proposedIce,
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
    tuned.primaryObjective.display,
    tuned.snowObjective.display,
    tuned.proposedShots,
    PassRateSimulator.formatPassRate(tuned.passRate)
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
  lines.push("# 关卡配置表（1-1000）");
  lines.push("");
  lines.push("本表为策划建议值（含 8~20 行、30 发上限、目标结算、模拟通关率），尚未写入关卡 JSON。");
  lines.push("");
  lines.push("| " + HEADERS.join(" | ") + " |");
  lines.push("| " + HEADERS.map(function () { return "---"; }).join(" | ") + " |");
  rows.forEach(function (row) {
    lines.push("| " + row.join(" | ") + " |");
  });
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function writeRules(filePath) {
  var lines = [
    "# 关卡建议配置规则",
    "",
    "本规则用于生成 `LEVEL_CONFIG_TABLE_1_1000.csv`，不修改实际关卡 JSON。",
    "",
    "## 行数",
    "",
    "- 棋盘最高行数提升至 **20 行**",
    "- 第 1 关起最低 **8 行**，随关卡进度线性增至 20 行",
    "- 公式：`round(8 + progress * 12)`，其中 `progress = (levelId - 1) / 999`",
    "- 颜色球数量按 `建议行数 / 当前行数` 等比放大后，再按真实 10/9 交替列容量裁剪",
    "- 颜色球 + 特殊球总占位控制在棋盘容量的 92% 以内，避免布局生成时溢出",
    "",
    "## 雪块",
    "",
    "- 第 **16 关** 起引入雪块（与现网雪块教学关对齐）",
    "- 棋盘中雪块数量 **最少 2 个、最多 100 个**，随关卡进度与行数递增",
    "- 雪块数量同时受棋盘 92% 占用上限约束，不得超过「容量 − 颜色球 − 其他特殊实体」",
    "- 权重公式综合：进度基数、每 4/7 关额外加权、行数密度",
    "",
    "## 收集目标（双目标）",
    "",
    "- 过关参考开心消消乐：不要求清屏，只要求 `winConditions` 中收集目标全部达成，且星级达到 1 星",
    "- **收集目标1**：固定为单色球 `collect_color`，不再使用 `collect_any`",
    "- **收集目标2**：雪块雪球收集（`collect_ice_snowball`），第 16 关起与目标1并行",
    "- 雪球与颜色球 **同时累计**，互不影响",
    "- 雪球目标值 **等于** 棋盘中全部雪块数量",
    "",
    "## 收集目标强度",
    "",
    "- 单色收集目标 **至少等于** 棋盘中该颜色球总数",
    "- **有分裂球** 的关卡：收集目标1 固定为分裂色 `collect_color`，并在同色球总数基础上 **每多 1 个分裂球额外 +5**",
    "- 无分裂球关卡按 `level.colors` 轮换选取目标色；若该色供给为 0，则取本关可用色中供给最多者",
    "",
    "## 发射球数量",
    "",
    "- 发射球数量硬上限为 **30 球**",
    "- 发射球数量根据行数、收集目标、雪球目标和特殊实体压力估算",
    "- 调参优先增加发射球数；已达 30 发上限且收集/雪球目标已为规则下限时，不再下调目标，通关率显示应用 15% 下限",
    "",
    "## 未调整项",
    "",
    "- 石头、炸弹、彩虹球、燃烧瓶、分裂球、钥匙、锁定球数量保持现有关卡配置不变",
    "- 实际 layout / specialEntities / winConditions JSON 需后续批量生成脚本落地",
    "",
    "## 通关率（模拟）",
    "",
    "- 基于表格中的行数、发射球、收集目标和特殊实体数量做 **启发式模拟**",
    "- 非真实玩家数据；衡量「30 发预算 / 达成目标工作量」比值，经 sigmoid 映射到 4%~97%",
    "- 不再按清屏计算主压力；双收集目标、同色高比例目标、分裂球/锁定/石头等会压低通关率；彩虹/炸弹技能球会略抬高",
    "- 第 1~2 关保底 ≥86%，第 3~10 关保底 ≥58%",
    "- **全关通关率下限 15%**：只作为建议表显示下限，不作为突破 30 发上限的理由"
  ];
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function main() {
  var entries = listAllLevelEntries();
  if (entries.length !== 1000) {
    throw new Error("expected 1000 levels but found " + entries.length);
  }

  var rows = entries.map(buildProposedRow);
  writeCsv(rows, OUTPUT_CSV);
  writeMarkdown(rows, OUTPUT_MD);
  writeRules(OUTPUT_RULES);

  console.log("Proposed " + rows.length + " levels");
  console.log("CSV: " + OUTPUT_CSV);
  console.log("Markdown: " + OUTPUT_MD);
  console.log("Rules: " + OUTPUT_RULES);
}

main();
