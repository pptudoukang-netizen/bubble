"use strict";

var TARGET_LEVEL_COUNT = 1000;
var REPEAT_INTERVAL = 150;
var INTRODUCTIONS = Object.freeze([
  Object.freeze({ key: "blackHole", column: "黑洞", firstLevel: 301, count: 1, label: "黑洞" }),
  Object.freeze({ key: "poisonAttachment", column: "毒液附着", firstLevel: 311, count: 3, label: "毒液附着" }),
  Object.freeze({ key: "spiritCocoon", column: "精灵茧", firstLevel: 321, count: 1, label: "精灵茧" }),
  Object.freeze({ key: "iceCrystalAttachment", column: "冰凌附着", firstLevel: 331, count: 3, label: "冰凌附着" }),
  Object.freeze({ key: "transparentBall", column: "透明球", firstLevel: 341, count: 1, label: "透明球" }),
  Object.freeze({ key: "breeder", column: "繁殖球", firstLevel: 351, count: 1, label: "繁殖球" }),
  Object.freeze({ key: "bubbleShieldAttachment", column: "气泡护盾附着", firstLevel: 361, count: 3, label: "气泡护盾" }),
  Object.freeze({ key: "mine", column: "地雷", firstLevel: 371, count: 1, label: "地雷" }),
  Object.freeze({ key: "bud", column: "花苞球", firstLevel: 381, count: 1, label: "花苞球" }),
  Object.freeze({ key: "crystalGun", column: "晶光炮", firstLevel: 391, count: 1, label: "晶光炮" }),
  Object.freeze({ key: "multiRescueTargets", column: "多精灵救援目标", firstLevel: 401, count: 2, label: "多精灵救援" }),
  Object.freeze({ key: "colorCloud", column: "彩云", firstLevel: 411, count: 1, label: "彩云" }),
  Object.freeze({ key: "spider", column: "蜘蛛", firstLevel: 421, count: 2, label: "蜘蛛" }),
  Object.freeze({ key: "windTunnelExit", column: "风眼出口", firstLevel: 431, count: 3, label: "风眼" }),
  Object.freeze({ key: "rainbowPrism", column: "彩虹棱镜球", firstLevel: 441, count: 1, label: "彩虹棱镜球" })
]);

var ADDITIONAL_TABLE_COLUMNS = Object.freeze([
  "漩涡球", "藤蔓精灵", "虫洞对",
  "黑洞", "地雷", "繁殖球", "花苞球", "精灵茧", "透明球", "晶光炮", "风眼出口",
  "毒液附着", "冰凌附着", "气泡护盾附着", "蜘蛛", "彩云", "多精灵救援目标", "彩虹棱镜球",
  "关卡类型", "玩法模式", "单精灵救援", "限时球", "棋盘遮挡"
]);

function assertLevelId(levelId) {
  if (!Number.isInteger(levelId) || levelId <= 0 || levelId > TARGET_LEVEL_COUNT) {
    throw new Error("Special mechanism schedule requires levelId in [1, 1000]: " + levelId);
  }
}

function isScheduledLevel(levelId, firstLevel) {
  return levelId >= firstLevel && (levelId - firstLevel) % REPEAT_INTERVAL === 0;
}

function getPlan(levelId) {
  assertLevelId(levelId);
  var plan = {};
  INTRODUCTIONS.forEach(function (definition) {
    plan[definition.key] = isScheduledLevel(levelId, definition.firstLevel) ? definition.count : 0;
  });
  return plan;
}

function getScheduledLevelIds(definition) {
  var levelIds = [];
  for (var levelId = definition.firstLevel; levelId <= TARGET_LEVEL_COUNT; levelId += REPEAT_INTERVAL) {
    levelIds.push(levelId);
  }
  return levelIds;
}

INTRODUCTIONS.forEach(function (definition) {
  getScheduledLevelIds(definition).forEach(function (levelId) {
    if (levelId % 10 === 0) {
      throw new Error(definition.label + " schedule overlaps timed level " + levelId + ".");
    }
  });
});

module.exports = Object.freeze({
  TARGET_LEVEL_COUNT: TARGET_LEVEL_COUNT,
  REPEAT_INTERVAL: REPEAT_INTERVAL,
  INTRODUCTIONS: INTRODUCTIONS,
  ADDITIONAL_TABLE_COLUMNS: ADDITIONAL_TABLE_COLUMNS,
  getPlan: getPlan,
  getScheduledLevelIds: getScheduledLevelIds
});
