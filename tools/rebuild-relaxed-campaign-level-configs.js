"use strict";

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");
var FirstHundredLevelDesign = require("./first-100-level-design");
var ReferenceLevels101To300Design = require("./reference-levels-101-300-design");
var SpecialMechanismSchedule = require("./campaign-special-mechanism-schedule");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var DOCUMENT_PATH = path.join(PROJECT_ROOT, "docs", "1000关逐关特殊玩法配置.md");
var GENERATOR_PATH = path.join(__dirname, "generate-1000-level-configs.js");
var TARGET_LEVEL_COUNT = 1000;
var COLORS = CampaignLevelGenerationConfig.NORMAL_BALL_COLORS.slice();
var SPLITTER_COLORS = CampaignLevelGenerationConfig.BASE_SPECIAL_COLORS.slice();
var SHOT_LIMIT_ADJUSTMENTS = {
  715: 1
};
var EXPECTED_HEADERS = [
  "关卡", "蓝球", "红球", "绿球", "黄球", "紫球", "橙球", "黑球", "白球", "总行数",
  "石头", "雪块", "炸弹", "彩虹球", "燃烧瓶",
  "蓝分裂球", "红分裂球", "绿分裂球", "黄分裂球", "紫分裂球",
  "钥匙", "锁定球", "收集目标1", "收集目标2", "发射球数量", "通关率"
].concat(SpecialMechanismSchedule.ADDITIONAL_TABLE_COLUMNS);

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
  ].concat(buildMechanismCells(spec.levelId)).map(String);
}

function buildMechanismCells(levelId) {
  var gameplayPlan = CampaignLevelGenerationConfig.getLevelPlan(levelId);
  var additional = gameplayPlan.additionalMechanismPlan;
  var singleRescueSpiritId = gameplayPlan.trappedSpriteRescue
    ? CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId)
    : "-";
  var timedBallCount = gameplayPlan.playMode === "timed_infinite_shots"
    ? CampaignLevelGenerationConfig.getTimedLevelTimeBonusBallCount(levelId)
    : 0;
  return [
    gameplayPlan.reactiveSpecialCounts.swirl,
    gameplayPlan.reactiveSpecialCounts.vine_spirit,
    gameplayPlan.reactiveSpecialCounts.wormholePairs,
    additional.blackHole,
    additional.mine,
    additional.breeder,
    additional.bud,
    additional.spiritCocoon,
    additional.transparentBall,
    additional.crystalGun,
    additional.windTunnelExit,
    additional.poisonAttachment,
    additional.iceCrystalAttachment,
    additional.bubbleShieldAttachment,
    additional.spider,
    additional.colorCloud,
    additional.multiRescueTargets,
    additional.rainbowPrism,
    gameplayPlan.levelType,
    gameplayPlan.playMode,
    singleRescueSpiritId,
    timedBallCount,
    gameplayPlan.boardOcclusionEnabled ? "per_attempt_no_repeat" : "none"
  ];
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
  return CampaignLevelGenerationConfig.getActiveNormalBallColors(levelId);
}

function getRowCapacity(rowCount) {
  var total = 0;
  for (var rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    total += BoardLayout.getRowColumnCount(rowIndex, BoardLayout.defaultColumns);
  }
  return total;
}

function getFillRatio(levelId) {
  return CampaignLevelGenerationConfig.getNormalBallOccupancyTarget(levelId);
}

function makeEmptySplitterCounts() {
  var counts = {};
  SPLITTER_COLORS.forEach(function (color) {
    counts[color] = 0;
  });
  return counts;
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

  if (counts.key > 0) {
    counts.locked = CampaignLevelGenerationConfig.getLockChainLockedCount(
      levelId,
      getRowCount(levelId),
      counts.key
    );
  }

  return counts;
}

function countSplitters(splitterCounts) {
  return SPLITTER_COLORS.reduce(function (sum, color) {
    return sum + splitterCounts[color];
  }, 0);
}

function countNonIceSpecials(counts) {
  return counts.stone + counts.blast + counts.rainbow + counts.molotov +
    countSplitters(counts.splitters) + counts.key + counts.locked;
}

function distributeColorCounts(levelId, activeColors, targetColor, normalCount) {
  var counts = {};
  COLORS.forEach(function (color) {
    counts[color] = 0;
  });
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
  var targetColor = CampaignLevelGenerationConfig.getCollectibleTargetColor(levelId, activeColors);
  var gameplayPlan = CampaignLevelGenerationConfig.getLevelPlan(levelId);
  var specialCounts = buildSpecialCounts(levelId, targetColor);
  var capacity = getRowCapacity(rowCount);
  var normalBallOccupancyTarget = getFillRatio(levelId);
  specialCounts.ice = CampaignLevelGenerationConfig.getIceBallCount(levelId, capacity);
  if (gameplayPlan.trappedSpriteRescue || gameplayPlan.multiTrappedSpiritRescue) {
    specialCounts = CampaignLevelGenerationConfig.buildTrappedSpriteRescueBaseSpecialCounts(specialCounts);
  }
  var nonIceSpecials = countNonIceSpecials(specialCounts);
  var reactiveSpecialSlotCount = gameplayPlan.reactiveSpecialCounts.swirl +
    gameplayPlan.reactiveSpecialCounts.vine_spirit +
    gameplayPlan.reactiveSpecialCounts.wormhole;
  var additional = gameplayPlan.additionalMechanismPlan;
  var additionalEntitySlotCount = additional.blackHole + additional.mine + additional.breeder +
    additional.bud + additional.spiritCocoon + additional.transparentBall + additional.crystalGun +
    (additional.windTunnelExit > 0 ? additional.windTunnelExit + 1 : 0);
  var specialSlotCount = specialCounts.ice + nonIceSpecials + reactiveSpecialSlotCount + additionalEntitySlotCount;
  var excludedGameplaySlotCount = specialSlotCount +
    (gameplayPlan.trappedSpriteRescue ? 1 : 0);
  var normalCount = gameplayPlan.trappedSpriteRescue
    ? CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT - specialSlotCount
    : Math.ceil((capacity - excludedGameplaySlotCount) * normalBallOccupancyTarget);
  if (normalCount < activeColors.length * 8) {
    throw new Error("Level " + levelId + " relaxed design leaves too few normal balls.");
  }
  if (normalCount + excludedGameplaySlotCount > capacity) {
    throw new Error("Level " + levelId + " relaxed design exceeds board capacity.");
  }
  var colorCounts = distributeColorCounts(levelId, activeColors, targetColor, normalCount);
  var splitterCount = specialCounts.splitters[targetColor];
  var shotLimit;
  if (!gameplayPlan.trappedSpriteRescue &&
    levelId >= ReferenceLevels101To300Design.FIRST_LEVEL_ID &&
    levelId <= ReferenceLevels101To300Design.LAST_LEVEL_ID) {
    shotLimit = ReferenceLevels101To300Design.getShotLimit(levelId);
  } else if (gameplayPlan.trappedSpriteRescue) {
    shotLimit = CampaignLevelGenerationConfig.buildTrappedSpriteRescueShotLimit({
      levelId: levelId,
      normalBallCount: normalCount,
      rowCount: rowCount,
      iceCount: specialCounts.ice,
      baseSpecialCount: specialCounts.stone + specialCounts.blast + specialCounts.rainbow,
      reactiveSpecialCounts: gameplayPlan.reactiveSpecialCounts
    });
  } else {
    shotLimit = Math.ceil((normalCount + specialSlotCount) * 0.25 + rowCount * 0.65 +
      (nonIceSpecials + additionalEntitySlotCount) * 0.5);
    if (getPhase(levelId) >= 7) {
      shotLimit += 1;
    }
    if (getPhase(levelId) >= 9) {
      shotLimit += 1;
    }
    if (Object.prototype.hasOwnProperty.call(SHOT_LIMIT_ADJUSTMENTS, levelId)) {
      shotLimit += SHOT_LIMIT_ADJUSTMENTS[levelId];
    }
    shotLimit = CampaignLevelGenerationConfig.applyClearanceRebalanceShotLimit(
      levelId,
      Math.max(28, Math.min(46, shotLimit))
    );
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
  ].concat(buildMechanismCells(spec.levelId)).map(String);
}

function buildAllRows() {
  var rows = [];
  for (var levelId = 1; levelId <= TARGET_LEVEL_COUNT; levelId += 1) {
    rows.push(levelId <= FirstHundredLevelDesign.LAST_LEVEL_ID
      ? buildFirstHundredCells(FirstHundredLevelDesign.buildLevelSpec(levelId))
      : buildRelaxedCells(buildRelaxedSpec(levelId)));
  }
  return rows;
}

function writeConfigurationDocument(rows) {
  var mechanicsColumns = EXPECTED_HEADERS.slice(10, 22).concat(EXPECTED_HEADERS.slice(26, 44));
  var lines = [
    "# 1000关逐关特殊玩法配置",
    "",
    "> 本文档由 `tools/rebuild-relaxed-campaign-level-configs.js --table-only` 从正式排期生成。`LEVEL_CONFIG_TABLE_1_1000.csv` 是生成器唯一读取的机器配置源；本文档是与其同步的人读版本。",
    "",
    "## 硬性规则",
    "",
    "- 普通关与救援关的同色六向连通块均不超过 8。",
    "- 每条钥匙/锁球链独占完整一行：该行恰好 1 个钥匙球、至少 1 个锁球、0 个普通球，也不混入其他特殊实体。`钥匙`列表示锁链行数，`锁定球`列表示这些行的实际锁球总数。",
    "- 新增特殊玩法从 301 关后分批引入，每 150 关复现一次；不与每 10 关的限时关、单精灵救援关重叠。",
    "- `风眼出口`大于 0 时固定同时生成 1 个入口；`彩虹棱镜球`表示本关初始道具库存；附着类数量表示被附着普通球数量。",
    "",
    "## 新机制投放总表",
    "",
    "| 机制 | 首次关卡 | 重复间隔 | 单关配置 | 投放关卡 |",
    "|---|---:|---:|---:|---|"
  ];
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    lines.push("| " + definition.label + " | " + definition.firstLevel + " | " +
      SpecialMechanismSchedule.REPEAT_INTERVAL + " | " + definition.count + " | " +
      SpecialMechanismSchedule.getScheduledLevelIds(definition).join("、") + " |");
  });
  lines.push("", "## 逐关配置", "", "| 关卡 | 关卡类型 | 玩法模式 | 特殊玩法配置 |", "|---:|---|---|---|");
  rows.forEach(function (cells) {
    var row = {};
    EXPECTED_HEADERS.forEach(function (header, index) { row[header] = cells[index]; });
    var entries = [];
    mechanicsColumns.forEach(function (column) {
      var value = row[column];
      if (value !== "0" && value !== "-" && value !== "none") {
        entries.push(column + "=" + value);
      }
    });
    if (row["单精灵救援"] !== "-") {
      entries.push("单精灵救援=" + row["单精灵救援"]);
    }
    if (row["限时球"] !== "0") {
      entries.push("限时球=" + row["限时球"]);
    }
    if (row["棋盘遮挡"] !== "none") {
      entries.push("棋盘遮挡=" + row["棋盘遮挡"]);
    }
    lines.push("| " + row["关卡"] + " | " + row["关卡类型"] + " | " + row["玩法模式"] + " | " +
      (entries.length ? entries.join("；") : "普通球配置") + " |");
  });
  fs.writeFileSync(DOCUMENT_PATH, lines.join("\n") + "\n", "utf8");
}

function rewriteTable(onlyTrappedSpriteRescue) {
  var parsed;
  if (onlyTrappedSpriteRescue) {
    parsed = parseTable(fs.readFileSync(TABLE_PATH, "utf8"));
  } else {
    var existingText = fs.readFileSync(TABLE_PATH, "utf8");
    parsed = {
      hasBom: existingText.charCodeAt(0) === 0xfeff,
      headers: EXPECTED_HEADERS.slice(),
      rows: buildAllRows()
    };
  }
  for (var levelId = 1; levelId <= TARGET_LEVEL_COUNT; levelId += 1) {
    if (onlyTrappedSpriteRescue && !CampaignLevelGenerationConfig.isTrappedSpriteRescueLevelId(levelId)) {
      continue;
    }
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
  writeConfigurationDocument(parsed.rows);
}

function runGenerator(onlyTrappedSpriteRescue) {
  var generatorArgs = [GENERATOR_PATH];
  if (onlyTrappedSpriteRescue) {
    generatorArgs.push("--trapped-rescue");
  }
  var result = childProcess.spawnSync(process.execPath, generatorArgs, {
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
  var args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--trapped-rescue" && args[0] !== "--table-only")) {
    throw new Error("Unsupported relaxed campaign rebuild arguments: " + args.join(" "));
  }
  var onlyTrappedSpriteRescue = args[0] === "--trapped-rescue";
  rewriteTable(onlyTrappedSpriteRescue);
  if (args[0] !== "--table-only") {
    runGenerator(onlyTrappedSpriteRescue);
  }
}

main();
