"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpecialMechanismSchedule = require("./campaign-special-mechanism-schedule");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var TABLE_PATH = path.join(PROJECT_ROOT, "LEVEL_CONFIG_TABLE_1_1000.csv");
var LOCAL_LEVEL_DIR = path.join(PROJECT_ROOT, "assets", "map", "config", "levels");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var ENTITY_COLUMNS = Object.freeze({
  "石头": "stone",
  "雪块": "ice",
  "炸弹": "blast",
  "彩虹球": "rainbow",
  "燃烧瓶": "molotov",
  "漩涡球": "swirl",
  "藤蔓精灵": "vine_spirit",
  "黑洞": "black_hole",
  "地雷": "mine",
  "繁殖球": "breeder",
  "花苞球": "bud",
  "精灵茧": "spirit_cocoon",
  "透明球": "transparent_ball",
  "晶光炮": "crystal_gun"
});
var SPLITTER_COLUMNS = Object.freeze({
  "蓝分裂球": "B",
  "红分裂球": "R",
  "绿分裂球": "G",
  "黄分裂球": "Y",
  "紫分裂球": "P"
});

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function loadTable() {
  var lines = stripBom(fs.readFileSync(TABLE_PATH, "utf8")).trim().split(/\r?\n/);
  if (lines.length !== SpecialMechanismSchedule.TARGET_LEVEL_COUNT + 1) {
    throw new Error("Campaign mechanism table must contain exactly 1000 rows.");
  }
  var headers = lines[0].split(",");
  return lines.slice(1).map(function (line, index) {
    var cells = line.split(",");
    if (cells.length !== headers.length) {
      throw new Error("Campaign mechanism table column count mismatch at level " + (index + 1) + ".");
    }
    var row = {};
    headers.forEach(function (header, cellIndex) { row[header] = cells[cellIndex]; });
    if (Number(row["关卡"]) !== index + 1) {
      throw new Error("Campaign mechanism table is not continuous at level " + (index + 1) + ".");
    }
    return row;
  });
}

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function loadAllLevels() {
  var levels = {};
  for (var localId = 1; localId <= 10; localId += 1) {
    var localKey = "level_" + padLevelId(localId);
    levels[localId] = JSON.parse(stripBom(fs.readFileSync(path.join(LOCAL_LEVEL_DIR, localKey + ".json"), "utf8")));
  }
  var ranges = [{ from: 11, to: 100 }];
  for (var from = 101; from <= 901; from += 100) {
    ranges.push({ from: from, to: from + 99 });
  }
  ranges.forEach(function (range) {
    var fileName = "levels_pack_" + padLevelId(range.from) + "_" + padLevelId(range.to) + ".json";
    var pack = LevelPackCompactCodec.expandPack(JSON.parse(stripBom(fs.readFileSync(path.join(REMOTE_PACK_DIR, fileName), "utf8"))));
    for (var levelId = range.from; levelId <= range.to; levelId += 1) {
      var levelKey = "level_" + padLevelId(levelId);
      if (!pack.levels[levelKey]) {
        throw new Error("Remote campaign pack is missing " + levelKey + ".");
      }
      levels[levelId] = pack.levels[levelKey];
    }
  });
  return levels;
}

function countEntities(level, entityType) {
  return level.specialEntities.filter(function (entity) { return entity.entityType === entityType; }).length;
}

function assertCount(levelId, fieldName, actual, expected) {
  if (actual !== expected) {
    throw new Error("Level " + levelId + " `" + fieldName + "` mismatch: expected " + expected + ", got " + actual + ".");
  }
}

function validateLockChainRows(levelId, level, tableRow) {
  var chainEntities = level.specialEntities.filter(function (entity) {
    return entity.entityType === "key" || entity.entityType === "locked";
  });
  var byRow = {};
  chainEntities.forEach(function (entity) {
    if (!byRow[entity.row]) {
      byRow[entity.row] = [];
    }
    byRow[entity.row].push(entity);
  });
  var rowIds = Object.keys(byRow);
  assertCount(levelId, "钥匙", rowIds.length, Number(tableRow["钥匙"]));
  assertCount(levelId, "锁定球", countEntities(level, "locked"), Number(tableRow["锁定球"]));
  rowIds.forEach(function (rowKey) {
    var row = Number(rowKey);
    var entities = byRow[row];
    var keys = entities.filter(function (entity) { return entity.entityType === "key"; });
    var locks = entities.filter(function (entity) { return entity.entityType === "locked"; });
    var width = BoardLayout.getRowColumnCount(row, BoardLayout.defaultColumns);
    if (keys.length !== 1 || locks.length !== width - 1 || entities.length !== width) {
      throw new Error("Level " + levelId + " lock-chain row " + row + " must contain one key and locks in every other cell.");
    }
    if (level.layout[row] !== ".".repeat(width)) {
      throw new Error("Level " + levelId + " lock-chain row " + row + " must not contain ordinary balls.");
    }
    var foreign = level.specialEntities.filter(function (entity) {
      return entity.row === row && entity.entityType !== "key" && entity.entityType !== "locked";
    });
    if (foreign.length) {
      throw new Error("Level " + levelId + " lock-chain row " + row + " contains another special entity.");
    }
  });
}

function validateLevel(levelId, config, tableRow, coverage) {
  if (!config || !config.level) {
    throw new Error("Campaign config is missing level " + levelId + ".");
  }
  var level = config.level;
  if (level.levelId !== levelId) {
    throw new Error("Campaign config levelId mismatch at " + levelId + ".");
  }
  Object.keys(ENTITY_COLUMNS).forEach(function (column) {
    assertCount(levelId, column, countEntities(level, ENTITY_COLUMNS[column]), Number(tableRow[column]));
  });
  Object.keys(SPLITTER_COLUMNS).forEach(function (column) {
    var color = SPLITTER_COLUMNS[column];
    var actual = level.specialEntities.filter(function (entity) {
      return entity.entityType === "splitter" && entity.splitColor === color;
    }).length;
    assertCount(levelId, column, actual, Number(tableRow[column]));
  });
  assertCount(levelId, "虫洞对", countEntities(level, "wormhole") / 2, Number(tableRow["虫洞对"]));
  assertCount(levelId, "风眼出口", countEntities(level, "wind_tunnel_exit"), Number(tableRow["风眼出口"]));
  assertCount(levelId, "风眼入口", countEntities(level, "wind_tunnel_entrance"), Number(tableRow["风眼出口"]) > 0 ? 1 : 0);
  validateLockChainRows(levelId, level, tableRow);

  var attachments = Array.isArray(level.cellAttachments) ? level.cellAttachments : [];
  [["毒液附着", "poison"], ["冰凌附着", "ice_crystal"], ["气泡护盾附着", "bubble_shield"]].forEach(function (mapping) {
    assertCount(levelId, mapping[0], attachments.filter(function (item) { return item.type === mapping[1]; }).length, Number(tableRow[mapping[0]]));
  });
  assertCount(levelId, "蜘蛛", Array.isArray(level.spiderRows) ? level.spiderRows.length : 0, Number(tableRow["蜘蛛"]));
  assertCount(levelId, "彩云", Array.isArray(level.colorClouds) ? level.colorClouds.length : 0, Number(tableRow["彩云"]));
  var rescueTargetCount = level.multiTrappedSpiritRescue && Array.isArray(level.multiTrappedSpiritRescue.targets)
    ? level.multiTrappedSpiritRescue.targets.length
    : 0;
  assertCount(levelId, "多精灵救援目标", rescueTargetCount, Number(tableRow["多精灵救援目标"]));
  var prismCount = level.initialPowerups && Number.isInteger(level.initialPowerups.rainbow_prism_ball)
    ? level.initialPowerups.rainbow_prism_ball
    : 0;
  assertCount(levelId, "彩虹棱镜球", prismCount, Number(tableRow["彩虹棱镜球"]));
  if (level.levelType !== tableRow["关卡类型"] || level.playMode !== tableRow["玩法模式"]) {
    throw new Error("Level " + levelId + " mode fields differ from the table.");
  }
  var timeBonusCount = Array.isArray(level.timeBonusBalls) ? level.timeBonusBalls.length : 0;
  assertCount(levelId, "限时球", timeBonusCount, Number(tableRow["限时球"]));
  var occlusionMode = level.boardOcclusionPlan.mode;
  if (occlusionMode !== tableRow["棋盘遮挡"]) {
    throw new Error("Level " + levelId + " board occlusion differs from the table.");
  }
  var singleSpiritId = level.trappedSpriteRescue ? level.trappedSpriteRescue.spiritId : "-";
  if (singleSpiritId !== tableRow["单精灵救援"]) {
    throw new Error("Level " + levelId + " single rescue identity differs from the table.");
  }
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    if (Number(tableRow[definition.column]) > 0) {
      coverage[definition.key] += 1;
    }
  });
}

function main() {
  var table = loadTable();
  var levels = loadAllLevels();
  var coverage = {};
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) { coverage[definition.key] = 0; });
  table.forEach(function (row, index) {
    validateLevel(index + 1, levels[index + 1], row, coverage);
  });
  SpecialMechanismSchedule.INTRODUCTIONS.forEach(function (definition) {
    var expectedLevelCount = SpecialMechanismSchedule.getScheduledLevelIds(definition).length;
    if (coverage[definition.key] !== expectedLevelCount) {
      throw new Error(definition.label + " coverage mismatch: expected " + expectedLevelCount + ", got " + coverage[definition.key] + ".");
    }
  });
  console.log("Validated authoritative table-to-config parity for 1000 campaign levels and all scheduled mechanisms.");
}

main();
