"use strict";

function buildSequentialLevelIds(maxLevelId) {
  var result = [];
  var safeMax = Math.max(1, Math.floor(Number(maxLevelId) || 1));
  for (var levelId = 1; levelId <= safeMax; levelId += 1) {
    result.push(levelId);
  }
  return result;
}

function getLevelIdFromResourcePath(resourcePath) {
  if (typeof resourcePath !== "string") {
    return 0;
  }

  var match = resourcePath.match(/level_(\d+)/i);
  if (!match) {
    return 0;
  }

  return Number(match[1]) || 0;
}

function resolveHighlightedLevelId(levelIds, options) {
  var ids = Array.isArray(levelIds) ? levelIds : [];
  var safeOptions = options && typeof options === "object" ? options : {};

  var selectedLevelId = Math.max(1, Number(safeOptions.selectedLevelId) || 1);
  var highestUnlocked = Math.max(1, Number(safeOptions.highestUnlocked) || 1);
  var currentLevelId = Math.max(0, Number(safeOptions.currentLevelId) || 0);

  var preferredLevelId = currentLevelId || selectedLevelId || highestUnlocked || 1;
  if (ids.indexOf(preferredLevelId) >= 0) {
    return preferredLevelId;
  }

  if (ids.indexOf(highestUnlocked) >= 0) {
    return highestUnlocked;
  }

  return ids.length ? ids[0] : 1;
}

module.exports = {
  buildSequentialLevelIds: buildSequentialLevelIds,
  getLevelIdFromResourcePath: getLevelIdFromResourcePath,
  resolveHighlightedLevelId: resolveHighlightedLevelId
};
