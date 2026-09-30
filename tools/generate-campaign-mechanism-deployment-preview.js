"use strict";

var fs = require("fs");
var path = require("path");

var Catalog = require("./level-combination-catalog");
var DeploymentPlan = require("./campaign-mechanism-deployment-plan");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var CURRENT_TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var JSON_PATH = path.join(PROJECT_ROOT, "LEVEL_MECHANISM_DEPLOYMENT_PREVIEW.json");
var MARKDOWN_PATH = path.join(PROJECT_ROOT, "docs", "1000关机制投放差异预览.md");
var REQUIRED_HEADERS = Object.freeze([
  "关卡", "石头", "雪块", "炸弹", "彩虹球", "燃烧瓶",
  "蓝分裂球", "红分裂球", "绿分裂球", "黄分裂球", "紫分裂球",
  "钥匙", "锁定球", "漩涡球", "藤蔓精灵", "虫洞对",
  "黑洞", "地雷", "繁殖球", "花苞球", "精灵茧", "透明球", "晶光炮", "风眼出口",
  "毒液附着", "冰凌附着", "气泡护盾附着", "蜘蛛", "彩云", "多精灵救援目标", "彩虹棱镜球",
  "关卡类型", "玩法模式", "单精灵救援", "限时球", "棋盘遮挡"
]);
var BASE_DETECTORS = Object.freeze([
  Object.freeze({ id: "stone", columns: ["石头"] }),
  Object.freeze({ id: "ice", columns: ["雪块"] }),
  Object.freeze({ id: "rainbow", columns: ["彩虹球"] }),
  Object.freeze({ id: "blast", columns: ["炸弹"] }),
  Object.freeze({ id: "molotov", columns: ["燃烧瓶"] }),
  Object.freeze({ id: "splitter", columns: ["蓝分裂球", "红分裂球", "绿分裂球", "黄分裂球", "紫分裂球"] }),
  Object.freeze({ id: "swirl", columns: ["漩涡球"] }),
  Object.freeze({ id: "vine_spirit", columns: ["藤蔓精灵"] }),
  Object.freeze({ id: "wormhole", columns: ["虫洞对"] })
]);
var NEW_MECHANISM_COLUMNS = Object.freeze({
  black_hole: "黑洞",
  poison_attachment: "毒液附着",
  spirit_cocoon: "精灵茧",
  ice_crystal_attachment: "冰凌附着",
  transparent_ball: "透明球",
  breeder: "繁殖球",
  bubble_shield_attachment: "气泡护盾附着",
  mine: "地雷",
  bud: "花苞球",
  multi_rescue: "多精灵救援目标",
  color_cloud: "彩云",
  spider: "蜘蛛",
  wind_tunnel: "风眼出口",
  rainbow_prism: "彩虹棱镜球"
});
var STAGE_LABELS = Object.freeze({
  teaching: "教学",
  review: "复习",
  combination: "首次组合",
  recurrence: "长期复现"
});
var TARGET_KIND_LABELS = Object.freeze({
  single: "单机制",
  base_pair: "新增+基础",
  board_pair: "新增+遮挡"
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseCsvLine(line) {
  var cells = [];
  var value = "";
  var quoted = false;
  for (var index = 0; index < line.length; index += 1) {
    var character = line.charAt(index);
    if (quoted) {
      if (character === '"') {
        if (line.charAt(index + 1) === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) {
    throw new Error("Unclosed quote in campaign table CSV line.");
  }
  cells.push(value);
  return cells;
}

function readCampaignRows() {
  if (!fs.existsSync(CURRENT_TABLE_PATH)) {
    throw new Error("Current campaign table is missing: " + CURRENT_TABLE_PATH + ".");
  }
  var text = fs.readFileSync(CURRENT_TABLE_PATH, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  var lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1001) {
    throw new Error("Current campaign table must contain one header and 1000 rows.");
  }
  var headers = parseCsvLine(lines[0]);
  var headerIndexes = {};
  headers.forEach(function (header, index) {
    if (hasOwn(headerIndexes, header)) {
      throw new Error("Duplicated campaign table header: " + header + ".");
    }
    headerIndexes[header] = index;
  });
  REQUIRED_HEADERS.forEach(function (header) {
    if (!hasOwn(headerIndexes, header)) {
      throw new Error("Campaign table is missing required preview header: " + header + ".");
    }
  });
  var rows = {};
  for (var lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    var cells = parseCsvLine(lines[lineIndex]);
    if (cells.length !== headers.length) {
      throw new Error("Campaign table column count mismatch at row " + lineIndex + ".");
    }
    var row = {};
    headers.forEach(function (header, index) {
      row[header] = cells[index];
    });
    var levelId = Number(row["关卡"]);
    if (!Number.isInteger(levelId) || levelId !== lineIndex) {
      throw new Error("Campaign table level id mismatch at row " + lineIndex + ".");
    }
    rows[levelId] = row;
  }
  return rows;
}

function readNonNegativeInteger(row, column, levelId) {
  if (!hasOwn(row, column)) {
    throw new Error("Level " + levelId + " is missing column " + column + ".");
  }
  var value = Number(row[column]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Level " + levelId + " column " + column + " must be a non-negative integer.");
  }
  return value;
}

function hasPositiveColumn(row, columns, levelId) {
  return columns.some(function (column) {
    return readNonNegativeInteger(row, column, levelId) > 0;
  });
}

function getCurrentMechanismIds(row, levelId) {
  var ids = [];
  BASE_DETECTORS.forEach(function (definition) {
    if (hasPositiveColumn(row, definition.columns, levelId)) {
      ids.push(definition.id);
    }
  });
  var keyCount = readNonNegativeInteger(row, "钥匙", levelId);
  var lockedCount = readNonNegativeInteger(row, "锁定球", levelId);
  if ((keyCount > 0) !== (lockedCount > 0)) {
    throw new Error("Level " + levelId + " has an incomplete lock-chain count pair.");
  }
  if (keyCount > 0) {
    ids.push("lock_chain");
  }
  Object.keys(NEW_MECHANISM_COLUMNS).forEach(function (mechanismId) {
    if (readNonNegativeInteger(row, NEW_MECHANISM_COLUMNS[mechanismId], levelId) > 0) {
      ids.push(mechanismId);
    }
  });
  if (readNonNegativeInteger(row, "晶光炮", levelId) !== 0) {
    throw new Error("Level " + levelId + " configures crystal gun in the campaign table.");
  }
  if (row["棋盘遮挡"] !== "none") {
    if (row["棋盘遮挡"] !== "per_attempt_no_repeat") {
      throw new Error("Level " + levelId + " has an unsupported board occlusion mode: " + row["棋盘遮挡"] + ".");
    }
    ids.push("board_occlusion");
  }
  if (row["玩法模式"] === "timed_infinite_shots") {
    ids.push("timed_mode");
  } else if (row["玩法模式"] !== "shot_limited") {
    throw new Error("Level " + levelId + " has an unsupported play mode: " + row["玩法模式"] + ".");
  }
  if (row["关卡类型"] === "trapped_sprite_rescue") {
    ids.push("single_rescue");
  }
  return ids;
}

function getSpecialBallIds(mechanismIds) {
  var seen = {};
  var result = [];
  mechanismIds.forEach(function (mechanismId) {
    Catalog.getMechanism(mechanismId).balls.forEach(function (ballId) {
      if (!hasOwn(seen, ballId)) {
        seen[ballId] = true;
        result.push(ballId);
      }
    });
  });
  return result;
}

function mechanismDisplay(mechanismIds) {
  return mechanismIds.map(function (mechanismId) {
    var mechanism = Catalog.getMechanism(mechanismId);
    return mechanism.label + "(" + mechanism.id + ")";
  }).join(" + ");
}

function ballDisplay(ballIds) {
  return ballIds.map(function (ballId) {
    var ball = Catalog.getBall(ballId);
    return ball.label + "(" + ball.id + ")";
  }).join(" + ");
}

function difference(left, right) {
  return left.filter(function (value) { return right.indexOf(value) < 0; });
}

function buildActionText(removed, added) {
  var actions = [];
  if (removed.length > 0) {
    actions.push("移除:" + removed.join("|"));
  }
  if (added.length > 0) {
    actions.push("新增:" + added.join("|"));
  }
  return actions.length === 0 ? "保持" : actions.join("；");
}

function roundTwo(value) {
  return Math.round(value * 100) / 100;
}

function buildPreview() {
  var campaignRows = readCampaignRows();
  var plan = DeploymentPlan.buildDeploymentPlan();
  var summary = {
    scheduledLevelCount: plan.length,
    changedLevelCount: 0,
    unchangedLevelCount: 0,
    currentOverMechanismLimitCount: 0,
    currentOverBallLimitCount: 0,
    proposedOverMechanismLimitCount: 0,
    proposedOverBallLimitCount: 0,
    currentBoardOcclusionCount: 0,
    proposedBoardOcclusionCount: 0,
    proposedSingleCount: 0,
    proposedBasePairCount: 0,
    proposedBoardPairCount: 0,
    proposedTierCounts: { T1: 0, T2: 0, T3: 0, F: 0 },
    stageCounts: { teaching: 0, review: 0, combination: 0, recurrence: 0 },
    currentMechanismCountTotal: 0,
    proposedMechanismCountTotal: 0
  };
  var rows = plan.map(function (planRow) {
    var currentRow = campaignRows[planRow.levelId];
    if (currentRow === undefined) {
      throw new Error("Preview cannot find campaign row " + planRow.levelId + ".");
    }
    var currentMechanismIds = getCurrentMechanismIds(currentRow, planRow.levelId);
    if (currentMechanismIds.indexOf(planRow.mechanismId) < 0) {
      throw new Error(
        "Current campaign row " + planRow.levelId + " is missing scheduled mechanism " +
        planRow.mechanismId + "."
      );
    }
    var proposedMechanismIds = planRow.combination.mechanisms.map(function (mechanism) {
      return mechanism.id;
    });
    var currentBallIds = getSpecialBallIds(currentMechanismIds);
    var proposedBallIds = planRow.combination.balls.map(function (ball) { return ball.id; });
    var removed = difference(currentMechanismIds, proposedMechanismIds);
    var added = difference(proposedMechanismIds, currentMechanismIds);
    var changed = removed.length > 0 || added.length > 0;
    var currentBoardOcclusion = currentMechanismIds.indexOf("board_occlusion") >= 0;
    var proposedBoardOcclusion = proposedMechanismIds.indexOf("board_occlusion") >= 0;
    summary.changedLevelCount += changed ? 1 : 0;
    summary.unchangedLevelCount += changed ? 0 : 1;
    summary.currentOverMechanismLimitCount += currentMechanismIds.length > 2 ? 1 : 0;
    summary.currentOverBallLimitCount += currentBallIds.length > 3 ? 1 : 0;
    summary.proposedOverMechanismLimitCount += proposedMechanismIds.length > 2 ? 1 : 0;
    summary.proposedOverBallLimitCount += proposedBallIds.length > 3 ? 1 : 0;
    summary.currentBoardOcclusionCount += currentBoardOcclusion ? 1 : 0;
    summary.proposedBoardOcclusionCount += proposedBoardOcclusion ? 1 : 0;
    summary.proposedSingleCount += planRow.targetKind === "single" ? 1 : 0;
    summary.proposedBasePairCount += planRow.targetKind === "base_pair" ? 1 : 0;
    summary.proposedBoardPairCount += planRow.targetKind === "board_pair" ? 1 : 0;
    summary.proposedTierCounts[planRow.recommendation.tierId] += 1;
    summary.stageCounts[planRow.stage] += 1;
    summary.currentMechanismCountTotal += currentMechanismIds.length;
    summary.proposedMechanismCountTotal += proposedMechanismIds.length;
    return {
      levelId: planRow.levelId,
      stage: planRow.stage,
      stageLabel: STAGE_LABELS[planRow.stage],
      recurrenceIndex: planRow.recurrenceIndex,
      scheduledMechanismId: planRow.mechanismId,
      scheduledMechanismLabel: Catalog.getMechanism(planRow.mechanismId).label,
      currentMechanismIds: currentMechanismIds,
      currentMechanismDisplay: mechanismDisplay(currentMechanismIds),
      currentMechanismCount: currentMechanismIds.length,
      currentSpecialBallIds: currentBallIds,
      currentSpecialBallDisplay: ballDisplay(currentBallIds),
      currentSpecialBallTypeCount: currentBallIds.length,
      proposedCombinationId: planRow.combination.id,
      proposedTargetKind: planRow.targetKind,
      proposedTargetKindLabel: TARGET_KIND_LABELS[planRow.targetKind],
      proposedMechanismIds: proposedMechanismIds,
      proposedMechanismDisplay: mechanismDisplay(proposedMechanismIds),
      proposedMechanismCount: proposedMechanismIds.length,
      proposedSpecialBallIds: proposedBallIds,
      proposedSpecialBallDisplay: ballDisplay(proposedBallIds),
      proposedSpecialBallTypeCount: proposedBallIds.length,
      complexityScore: planRow.recommendation.complexityScore,
      complexityLabel: planRow.recommendation.complexityLabel,
      tierId: planRow.recommendation.tierId,
      tierLabel: planRow.recommendation.tierLabel,
      weight: planRow.recommendation.weight,
      firstAllowedLevel: planRow.recommendation.firstAllowedLevel,
      longTermMinimumGap: planRow.recommendation.longTermMinimumGap,
      removedMechanismIds: removed,
      addedMechanismIds: added,
      action: buildActionText(removed, added),
      changed: changed
    };
  });
  summary.currentAverageMechanismCount = roundTwo(
    summary.currentMechanismCountTotal / summary.scheduledLevelCount
  );
  summary.proposedAverageMechanismCount = roundTwo(
    summary.proposedMechanismCountTotal / summary.scheduledLevelCount
  );
  if (summary.proposedOverMechanismLimitCount !== 0 || summary.proposedOverBallLimitCount !== 0) {
    throw new Error("Proposed deployment preview violates mechanism or special-ball limits.");
  }
  if (summary.changedLevelCount + summary.unchangedLevelCount !== summary.scheduledLevelCount) {
    throw new Error("Deployment preview changed/unchanged totals are inconsistent.");
  }
  return {
    schemaVersion: 1,
    sourceTable: "LEVEL_CONFIG_TABLE_1_1000.csv",
    policyFiles: [
      "tools/level-combination-catalog.js",
      "tools/level-combination-deployment-policy.js",
      "tools/campaign-mechanism-deployment-plan.js"
    ],
    previewOnly: true,
    summary: summary,
    rows: rows
  };
}

function markdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderMarkdown(preview) {
  var summary = preview.summary;
  var lines = [
    "# 1000关机制投放差异预览",
    "",
    "> 本文件是只读预览，不是正式投放表。生成过程没有修改 `LEVEL_CONFIG_TABLE_1_1000.csv`、本地关卡、远程关包或 manifest。确认后才允许把计划接入正式生成链。",
    "",
    "## 预览结论",
    "",
    "- 新机制排期关：" + summary.scheduledLevelCount + " 关；建议调整 " + summary.changedLevelCount + " 关，保持 " + summary.unchangedLevelCount + " 关。",
    "- 当前这些关平均包含 " + summary.currentAverageMechanismCount + " 种机制；建议降为 " + summary.proposedAverageMechanismCount + " 种。",
    "- 当前超过2种机制的排期关：" + summary.currentOverMechanismLimitCount + "；建议方案：" + summary.proposedOverMechanismLimitCount + "。",
    "- 当前超过3种特殊球类型的排期关：" + summary.currentOverBallLimitCount + "；建议方案：" + summary.proposedOverBallLimitCount + "。",
    "- 当前叠加动态遮挡：" + summary.currentBoardOcclusionCount + " 关；建议保留为明确的新增+遮挡复现：" + summary.proposedBoardOcclusionCount + " 关。",
    "- 建议结构：单机制 " + summary.proposedSingleCount + " 关、新增+基础 " + summary.proposedBasePairCount + " 关、新增+遮挡 " + summary.proposedBoardPairCount + " 关。",
    "- 建议等级：T1 " + summary.proposedTierCounts.T1 + "、T2 " + summary.proposedTierCounts.T2 + "、T3 " + summary.proposedTierCounts.T3 + "、F " + summary.proposedTierCounts.F + "。",
    "",
    "## 生成规则",
    "",
    "1. 教学、复习阶段只保留当前新增机制，不叠加基础机制或动态遮挡。",
    "2. 首次组合固定选择一个合法基础机制；高复杂度组合必须等待至少3次单机制体验。",
    "3. 普通长期复现按“单机制 → 新增+基础 → 新增+遮挡”循环；多精灵救援因禁用遮挡，按“单机制 → 新增+基础”循环。",
    "4. 基础搭档按组合权重、已使用次数和同组合长期最小间隔确定性选择；不会使用运行时随机数。",
    "5. 每个建议关最多2种机制、3种特殊球类型；晶光炮继续保持关卡配置为0。",
    "",
    "这一步只比较机制类型。正式应用时必须由生成器同步重算特殊球数量、普通球数量、收集目标、发射数、布局坐标、compact关包和manifest，禁止直接手改CSV数量。",
    "",
    "## 逐关差异",
    "",
    "| 关卡 | 阶段 | 新机制 | 当前机制 | 建议组合ID | 建议机制 | 类型 | 等级/权重 | 复杂度 | 操作 |",
    "|---:|---|---|---|---|---|---|---|---:|---|"
  ];
  preview.rows.forEach(function (row) {
    lines.push(
      "| " + row.levelId + " | " + row.stageLabel + " | `" + row.scheduledMechanismId + "` | " +
      markdownCell(row.currentMechanismDisplay) + " | " + row.proposedCombinationId + " | " +
      markdownCell(row.proposedMechanismDisplay) + " | " + row.proposedTargetKindLabel + " | " +
      row.tierId + "/" + row.weight + " | " + row.complexityScore + " | " + markdownCell(row.action) + " |"
    );
  });
  lines.push("");
  return lines.join("\n");
}

function assertGeneratedFile(filePath, expectedContent) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Generated deployment preview is missing: " + filePath + ".");
  }
  if (fs.readFileSync(filePath, "utf8") !== expectedContent) {
    throw new Error(
      "Generated deployment preview is stale: " + filePath +
      ". Run npm run generate:level-deployment-preview."
    );
  }
}

function main() {
  var args = process.argv.slice(2);
  var checkOnly = args.length === 1 && args[0] === "--check";
  if (args.length > 0 && !checkOnly) {
    throw new Error("Usage: node tools/generate-campaign-mechanism-deployment-preview.js [--check]");
  }
  var preview = buildPreview();
  var json = JSON.stringify(preview, null, 2) + "\n";
  var markdown = renderMarkdown(preview);
  if (checkOnly) {
    assertGeneratedFile(JSON_PATH, json);
    assertGeneratedFile(MARKDOWN_PATH, markdown);
    console.log(
      "Validated deployment preview for " + preview.summary.scheduledLevelCount +
      " scheduled levels; " + preview.summary.changedLevelCount + " changes proposed."
    );
    return;
  }
  fs.writeFileSync(JSON_PATH, json, "utf8");
  fs.writeFileSync(MARKDOWN_PATH, markdown, "utf8");
  console.log(
    "Generated deployment preview for " + preview.summary.scheduledLevelCount +
    " scheduled levels; " + preview.summary.changedLevelCount + " changes proposed."
  );
}

main();
