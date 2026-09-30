"use strict";

var fs = require("fs");
var path = require("path");
var Catalog = require("./level-combination-catalog");
var DeploymentPolicy = require("./level-combination-deployment-policy");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var CSV_PATH = path.join(PROJECT_ROOT, "LEVEL_COMBINATION_CONFIG_TABLE.csv");
var MARKDOWN_PATH = path.join(PROJECT_ROOT, "docs", "关卡机制与特殊球组合配置表.md");
var EXPECTED_SINGLE_COUNT = 27;
var EXPECTED_DOUBLE_COUNT = 223;
var EXPECTED_TOTAL_COUNT = 250;
var EXPECTED_SINGLE_BALL_CONFIG_COUNT = 16;
var EXPECTED_PAIR_GROUP_COUNTS = Object.freeze({
  "base+base": 45,
  "base+new": 138,
  "base+mode": 26,
  "new+mode": 13,
  "mode+mode": 1
});

function csvCell(value) {
  var text = String(value);
  if (/[",\r\n]/.test(text)) {
    return "\"" + text.replace(/"/g, "\"\"") + "\"";
  }
  return text;
}

function markdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function valueAt(items, index, field) {
  return index < items.length ? items[index][field] : "";
}

function joinRuleText(ruleCodes) {
  return ruleCodes.map(function (ruleCode) {
    if (!Object.prototype.hasOwnProperty.call(Catalog.RULES, ruleCode)) {
      throw new Error("Unknown rule code in generated combination: " + ruleCode + ".");
    }
    return ruleCode + " " + Catalog.RULES[ruleCode];
  }).join("；");
}

function rowSignature(combination) {
  return combination.mechanisms.map(function (mechanism) {
    return mechanism.id;
  }).join("+");
}

function pairGroupKey(left, right) {
  var order = {};
  order[Catalog.GROUP_BASE] = 0;
  order[Catalog.GROUP_NEW] = 1;
  order[Catalog.GROUP_MODE] = 2;
  return order[left.group] <= order[right.group]
    ? left.group + "+" + right.group
    : right.group + "+" + left.group;
}

function validateCombinations(combinations) {
  var ids = {};
  var signatures = {};
  var singleCount = 0;
  var doubleCount = 0;
  var singleBallConfigCount = 0;
  var pairGroupCounts = {
    "base+base": 0,
    "base+new": 0,
    "base+mode": 0,
    "new+mode": 0,
    "mode+mode": 0
  };
  var tierCounts = { T1: 0, T2: 0, T3: 0, F: 0 };

  combinations.forEach(function (combination) {
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    if (Object.prototype.hasOwnProperty.call(ids, combination.id)) {
      throw new Error("Duplicated combination id: " + combination.id + ".");
    }
    ids[combination.id] = true;
    var signature = rowSignature(combination);
    if (Object.prototype.hasOwnProperty.call(signatures, signature)) {
      throw new Error("Duplicated combination signature: " + signature + ".");
    }
    signatures[signature] = true;
    if (combination.mechanisms.length < 1 || combination.mechanisms.length > 2) {
      throw new Error("Combination mechanism count is outside [1, 2]: " + combination.id + ".");
    }
    if (combination.balls.length > 3) {
      throw new Error("Combination special ball type count exceeds 3: " + combination.id + ".");
    }
    var ballIds = {};
    combination.balls.forEach(function (ball) {
      if (Object.prototype.hasOwnProperty.call(ballIds, ball.id)) {
        throw new Error("Duplicated special ball type in " + combination.id + ": " + ball.id + ".");
      }
      ballIds[ball.id] = true;
      var ownerExists = combination.mechanisms.some(function (mechanism) {
        return mechanism.id === ball.owner;
      });
      if (!ownerExists) {
        throw new Error("Orphan special ball type in " + combination.id + ": " + ball.id + ".");
      }
    });
    if (!Number.isInteger(recommendation.complexityScore) || recommendation.complexityScore < 1 || recommendation.complexityScore > 7) {
      throw new Error("Invalid complexity score on " + combination.id + ": " + recommendation.complexityScore + ".");
    }
    if (!Number.isInteger(recommendation.weight) || recommendation.weight < 0 || recommendation.weight > 10) {
      throw new Error("Invalid deployment weight on " + combination.id + ": " + recommendation.weight + ".");
    }
    if (!Number.isInteger(recommendation.firstAllowedLevel) || recommendation.firstAllowedLevel < 1 || recommendation.firstAllowedLevel > 1000) {
      throw new Error("Invalid first allowed level on " + combination.id + ": " + recommendation.firstAllowedLevel + ".");
    }
    if (!Number.isInteger(recommendation.longTermMinimumGap) || recommendation.longTermMinimumGap <= 0) {
      throw new Error("Invalid long-term minimum gap on " + combination.id + ": " + recommendation.longTermMinimumGap + ".");
    }
    if (!Object.prototype.hasOwnProperty.call(tierCounts, recommendation.tierId)) {
      throw new Error("Unknown recommendation tier on " + combination.id + ": " + recommendation.tierId + ".");
    }
    if ((recommendation.tierId === "F") !== (recommendation.weight === 0)) {
      throw new Error("Only fixed/system rows may use weight 0: " + combination.id + ".");
    }
    combination.mechanisms.forEach(function (mechanism) {
      if (recommendation.firstAllowedLevel < DeploymentPolicy.getProfile(mechanism.id).introductionLevel) {
        throw new Error("Combination is allowed before mechanism introduction: " + combination.id + " -> " + mechanism.id + ".");
      }
    });
    tierCounts[recommendation.tierId] += 1;
    if (combination.mechanisms.length === 1) {
      singleCount += 1;
      if (combination.balls.length === 1 && combination.balls[0].standalone) {
        singleBallConfigCount += 1;
      }
    } else {
      doubleCount += 1;
      var decision = Catalog.pairDecision(combination.mechanisms[0], combination.mechanisms[1]);
      if (!decision.allowed) {
        throw new Error("Generated forbidden pair: " + signature + ".");
      }
      var groupKey = pairGroupKey(combination.mechanisms[0], combination.mechanisms[1]);
      if (!Object.prototype.hasOwnProperty.call(pairGroupCounts, groupKey)) {
        throw new Error("Unexpected allowed pair group: " + groupKey + ".");
      }
      pairGroupCounts[groupKey] += 1;
    }
  });

  if (singleCount !== EXPECTED_SINGLE_COUNT) {
    throw new Error("Expected " + EXPECTED_SINGLE_COUNT + " single-mechanism rows, got " + singleCount + ".");
  }
  if (doubleCount !== EXPECTED_DOUBLE_COUNT) {
    throw new Error("Expected " + EXPECTED_DOUBLE_COUNT + " double-mechanism rows, got " + doubleCount + ".");
  }
  if (combinations.length !== EXPECTED_TOTAL_COUNT) {
    throw new Error("Expected " + EXPECTED_TOTAL_COUNT + " total rows, got " + combinations.length + ".");
  }
  if (singleBallConfigCount !== EXPECTED_SINGLE_BALL_CONFIG_COUNT) {
    throw new Error(
      "Expected " + EXPECTED_SINGLE_BALL_CONFIG_COUNT +
      " single-mechanism/single-special-ball rows, got " + singleBallConfigCount + "."
    );
  }
  Object.keys(EXPECTED_PAIR_GROUP_COUNTS).forEach(function (groupKey) {
    if (pairGroupCounts[groupKey] !== EXPECTED_PAIR_GROUP_COUNTS[groupKey]) {
      throw new Error(
        "Expected " + EXPECTED_PAIR_GROUP_COUNTS[groupKey] + " " + groupKey +
        " pairs, got " + pairGroupCounts[groupKey] + "."
      );
    }
  });

  return Object.freeze({
    singleCount: singleCount,
    doubleCount: doubleCount,
    totalCount: combinations.length,
    singleBallConfigCount: singleBallConfigCount,
    pairGroupCounts: Object.freeze(pairGroupCounts),
    tierCounts: Object.freeze(tierCounts)
  });
}

function renderCsv(combinations) {
  var headers = [
    "组合ID", "配置类别", "机制数量",
    "机制ID1", "机制1", "机制配置入口1", "机制ID2", "机制2", "机制配置入口2",
    "特殊球类型数量",
    "特殊球ID1", "特殊球1", "特殊球配置键1", "特殊球ID2", "特殊球2", "特殊球配置键2", "特殊球ID3", "特殊球3", "特殊球配置键3",
    "关卡类型", "玩法模式",
    "复杂度分", "复杂度等级", "推荐投放等级", "投放权重", "首次允许关卡", "推荐投放阶段",
    "同配置长期最小间隔", "复现策略", "投放限制",
    "规则代码", "必要配置约束"
  ];
  var lines = [headers.map(csvCell).join(",")];
  combinations.forEach(function (combination) {
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    var values = [
      combination.id,
      combination.kind,
      combination.mechanisms.length,
      valueAt(combination.mechanisms, 0, "id"),
      valueAt(combination.mechanisms, 0, "label"),
      valueAt(combination.mechanisms, 0, "configPath"),
      valueAt(combination.mechanisms, 1, "id"),
      valueAt(combination.mechanisms, 1, "label"),
      valueAt(combination.mechanisms, 1, "configPath"),
      combination.balls.length,
      valueAt(combination.balls, 0, "id"),
      valueAt(combination.balls, 0, "label"),
      valueAt(combination.balls, 0, "configKey"),
      valueAt(combination.balls, 1, "id"),
      valueAt(combination.balls, 1, "label"),
      valueAt(combination.balls, 1, "configKey"),
      valueAt(combination.balls, 2, "id"),
      valueAt(combination.balls, 2, "label"),
      valueAt(combination.balls, 2, "configKey"),
      combination.levelContract.levelType,
      combination.levelContract.playMode,
      recommendation.complexityScore,
      recommendation.complexityLabel,
      recommendation.tierId + " " + recommendation.tierLabel,
      recommendation.weight,
      recommendation.firstAllowedLevel,
      recommendation.phase,
      recommendation.longTermMinimumGap,
      recommendation.recurrencePolicy,
      recommendation.restriction,
      combination.ruleCodes.join("|"),
      joinRuleText(combination.ruleCodes)
    ];
    lines.push(values.map(csvCell).join(","));
  });
  return lines.join("\n") + "\n";
}

function groupLabel(group) {
  if (group === Catalog.GROUP_BASE) {
    return "基础机制";
  }
  if (group === Catalog.GROUP_NEW) {
    return "新增机制";
  }
  if (group === Catalog.GROUP_MODE) {
    return "系统/模式机制";
  }
  throw new Error("Unknown mechanism group: " + group + ".");
}

function formatMechanism(mechanism) {
  return mechanism.label + " (`" + mechanism.id + "`)";
}

function formatBall(ball) {
  return ball.label + " (`" + ball.id + "`)";
}

function renderMarkdown(combinations, stats) {
  var lines = [];
  lines.push("# 关卡机制与特殊球组合配置表");
  lines.push("");
  lines.push("> 本表由 `tools/level-combination-catalog.js` 和 `tools/generate-level-combination-config-table.js` 确定性生成。禁止手工修改本文件或根目录 CSV；修改规则后运行 `npm run generate:level-combinations`。晶光炮是常规持久道具，不属于关卡机制或棋盘特殊球，未纳入本表。");
  lines.push("");
  lines.push("## 统计结论");
  lines.push("");
  lines.push("- 机制：27 种（10 种基础机制、14 种新增机制、3 种系统/模式机制）。");
  lines.push("- 棋盘可配置特殊球类型：20 种；特殊球归属于机制，不能与所属机制重复计数。");
  lines.push("- 合法类型配置：" + stats.totalCount + " 种，其中单机制 " + stats.singleCount + " 种、双机制 " + stats.doubleCount + " 种。");
  lines.push("- 单机制且恰好包含 1 种可独立配置特殊球：" + stats.singleBallConfigCount + " 种。");
  lines.push("- 投放等级：T1 常规 " + stats.tierCounts.T1 + " 种、T2 进阶 " + stats.tierCounts.T2 + " 种、T3 考核 " + stats.tierCounts.T3 + " 种、F 固定/系统排期 " + stats.tierCounts.F + " 种。");
  lines.push("- 4 种系统组件球不可单独出现：钥匙、锁定球、风眼入口、风眼出口；它们必须成套归入锁链或风眼机制。");
  lines.push("");
  lines.push("这里的“合法”指机制类型组合存在满足全部硬规则的棋盘布局，不代表任意坐标和任意数量都合法。每个实际关卡仍必须经过加载器、紧凑包往返和对应专项校验器。");
  lines.push("");
  lines.push("## 组合口径");
  lines.push("");
  lines.push("1. 同一关至少 1 种、最多 2 种机制，最多 3 种特殊球类型；同类机制不重复计数。");
  lines.push("2. 10 种基础机制之间可两两组合；新增机制与基础机制允许组合，两个新增机制之间不进入正式组合池。");
  lines.push("3. 动态棋盘遮挡可与基础机制及除多精灵救援外的 13 种新增机制共存，也可与限时模式共存。");
  lines.push("4. 限时模式只与基础机制或动态棋盘遮挡组合；单精灵救援只与石、冰、彩虹、爆破、漩涡、藤蔓组合。");
  lines.push("5. 锁链与风眼需要 `key + locked + wind_tunnel_entrance + wind_tunnel_exit` 共 4 种特殊球，超过上限，直接排除。");
  lines.push("6. 多精灵救援目标必须位于顶部第 2 至 6 行（配置 `row=1..5`），并禁用动态棋盘遮挡。");
  lines.push("");
  lines.push("双机制 223 种的分组明细：基础+基础 45 种、基础+新增 138 种、基础+系统/模式 26 种、新增+系统/模式 13 种、系统/模式+系统/模式 1 种。");
  lines.push("");
  lines.push("## 27 种机制定义");
  lines.push("");
  lines.push("| 序号 | 机制ID | 名称 | 分组 | 首次引入关 | 基础复杂度 | 权威配置入口 | 必需特殊球类型 | 规则代码 |");
  lines.push("|---:|---|---|---|---:|---:|---|---|---|");
  Catalog.MECHANISMS.forEach(function (mechanism, index) {
    var profile = DeploymentPolicy.getProfile(mechanism.id);
    var balls = mechanism.balls.length === 0 ? "无" : mechanism.balls.map(function (ballId) {
      return formatBall(Catalog.getBall(ballId));
    }).join("<br>");
    lines.push("| " + (index + 1) + " | `" + mechanism.id + "` | " + mechanism.label + " | " +
      groupLabel(mechanism.group) + " | " + profile.introductionLevel + " | " + profile.complexity + " | `" +
      mechanism.configPath + "` | " + balls + " | " + mechanism.rules.join("、") + " |");
  });
  lines.push("");
  lines.push("## 20 种特殊球定义");
  lines.push("");
  lines.push("| 序号 | 特殊球ID | 名称 | 所属机制 | 精确配置键 | 可作为单机制单特殊球配置 | 数量/结构合同 |");
  lines.push("|---:|---|---|---|---|---|---|");
  Catalog.SPECIAL_BALLS.forEach(function (ball, index) {
    lines.push("| " + (index + 1) + " | `" + ball.id + "` | " + ball.label + " | `" + ball.owner + "` | `" + ball.configKey + "` | " +
      (ball.standalone ? "是" : "否") + " | " + markdownCell(ball.instanceContract) + " |");
  });
  lines.push("");
  lines.push("## 硬规则代码");
  lines.push("");
  lines.push("| 代码 | 规则 |");
  lines.push("|---|---|");
  Object.keys(Catalog.RULES).forEach(function (ruleCode) {
    lines.push("| " + ruleCode + " | " + markdownCell(Catalog.RULES[ruleCode]) + " |");
  });
  lines.push("");
  lines.push("## 投放等级与权重");
  lines.push("");
  lines.push("| 等级 | 用途 | 普通随机池权重 |");
  lines.push("|---|---|---:|");
  lines.push("| T1 | 单机制常规关、低复杂度首次组合 | 6～10 |");
  lines.push("| T2 | 复杂单机制或中复杂度组合 | 3～5 |");
  lines.push("| T3 | 高复杂度后期考核组合 | 1 |");
  lines.push("| F | 限时、救援、遮挡等固定/系统排期 | 0，不进入普通随机池 |");
  lines.push("");
  lines.push("权重只允许在相同投放池内比较，不能用权重覆盖首次引入关、模式排期或互斥规则。每种新机制首次后4～6关安排单机制复习、10～15关安排首次组合；完成这三个近期阶段后，机制长期复现保持50～80关、目标60关。双机制精确组合长期复用至少间隔100关，避免同一搭配重复刷屏。");
  lines.push("");
  lines.push("## 全部 " + stats.totalCount + " 种合法组合");
  lines.push("");
  lines.push("| 组合ID | 类别 | 机制配置 | 特殊球类型数 | 特殊球配置 | levelType / playMode | 复杂度 | 投放等级/权重 | 首次允许关 | 长期最小间隔 | 推荐阶段 | 规则代码 |");
  lines.push("|---|---|---|---:|---|---|---|---|---:|---:|---|---|");
  combinations.forEach(function (combination) {
    var recommendation = DeploymentPolicy.getRecommendation(combination);
    var mechanisms = combination.mechanisms.map(formatMechanism).join("<br>");
    var balls = combination.balls.length === 0 ? "无" : combination.balls.map(formatBall).join("<br>");
    lines.push("| " + combination.id + " | " + combination.kind + " | " + mechanisms + " | " +
      combination.balls.length + " | " + balls + " | `" + combination.levelContract.levelType + "`<br>`" +
      combination.levelContract.playMode + "` | " + recommendation.complexityScore + "（" + recommendation.complexityLabel + "） | " +
      recommendation.tierId + " / " + recommendation.weight + " | " + recommendation.firstAllowedLevel + " | " +
      recommendation.longTermMinimumGap + " | " + recommendation.phase + " | " + combination.ruleCodes.join("、") + " |");
  });
  lines.push("");
  lines.push("完整逐行约束文本同时写入根目录 `LEVEL_COMBINATION_CONFIG_TABLE.csv` 的“必要配置约束”列，便于策划筛选和程序读取。");
  lines.push("");
  return lines.join("\n");
}

function assertGeneratedFile(filePath, expectedContent) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Generated file is missing: " + filePath + ".");
  }
  var actualContent = fs.readFileSync(filePath, "utf8");
  if (actualContent !== expectedContent) {
    throw new Error("Generated file is stale: " + filePath + ". Run npm run generate:level-combinations.");
  }
}

function main() {
  var combinations = Catalog.buildCombinations();
  var stats = validateCombinations(combinations);
  var csv = renderCsv(combinations);
  var markdown = renderMarkdown(combinations, stats);
  var checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
  if (process.argv.length > 2 && !checkOnly) {
    throw new Error("Usage: node tools/generate-level-combination-config-table.js [--check]");
  }
  if (checkOnly) {
    assertGeneratedFile(CSV_PATH, csv);
    assertGeneratedFile(MARKDOWN_PATH, markdown);
    console.log(
      "Validated " + stats.totalCount + " level combinations: " + stats.singleCount +
      " single mechanisms, " + stats.doubleCount + " double mechanisms, " +
      stats.singleBallConfigCount + " single-special-ball configurations."
    );
    return;
  }
  fs.writeFileSync(CSV_PATH, csv, "utf8");
  fs.writeFileSync(MARKDOWN_PATH, markdown, "utf8");
  console.log(
    "Generated " + stats.totalCount + " level combinations: " + stats.singleCount +
    " single mechanisms, " + stats.doubleCount + " double mechanisms, " +
    stats.singleBallConfigCount + " single-special-ball configurations."
  );
}

main();
