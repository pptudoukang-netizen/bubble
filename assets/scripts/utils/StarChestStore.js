"use strict";

var STORAGE_KEY = "bubble_star_chest_state_v1";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafeCount(value, fallback) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, parsed);
}

function normalizeLog(rawLog) {
  var source = rawLog && typeof rawLog === "object" ? rawLog : {};
  return {
    openId: typeof source.openId === "string" ? source.openId : "",
    totalStarsAtOpen: toSafeCount(source.totalStarsAtOpen, 0),
    consumedStarsAfterOpen: toSafeCount(source.consumedStarsAfterOpen, 0),
    rewardId: typeof source.rewardId === "string" ? source.rewardId : "",
    rewardItems: Array.isArray(source.rewardItems) ? clone(source.rewardItems) : [],
    timestamp: toSafeCount(source.timestamp, 0)
  };
}

function normalizeState(raw, activityId) {
  var source = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    activityId: typeof source.activityId === "string" && source.activityId
      ? source.activityId
      : activityId,
    consumedStars: toSafeCount(source.consumedStars, 0),
    openedCount: toSafeCount(source.openedCount, 0),
    lastOpenAt: toSafeCount(source.lastOpenAt, 0),
    openLogs: Array.isArray(source.openLogs) ? source.openLogs.map(normalizeLog) : []
  };
}

function StarChestStore(options) {
  options = options || {};
  this.activityId = typeof options.activityId === "string" && options.activityId
    ? options.activityId
    : "star_chest_v1";
}

StarChestStore.prototype.normalizeState = function (raw) {
  return normalizeState(raw, this.activityId);
};

StarChestStore.prototype.load = function () {
  var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
  var normalized = null;

  try {
    if (!storage) {
      normalized = this.normalizeState(null);
    } else {
      var rawText = storage.getItem(STORAGE_KEY);
      normalized = this.normalizeState(rawText ? JSON.parse(rawText) : null);
    }
  } catch (error) {
    normalized = this.normalizeState(null);
  }

  this.save(normalized);
  return clone(normalized);
};

StarChestStore.prototype.save = function (state) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return true;
    }

    storage.setItem(STORAGE_KEY, JSON.stringify(this.normalizeState(state)));
    return true;
  } catch (error) {
    return false;
  }
};

StarChestStore.prototype.appendOpenLog = function (state, log, maxLogs) {
  var normalized = this.normalizeState(state);
  var limit = Math.max(1, toSafeCount(maxLogs, 20));
  normalized.openLogs.unshift(normalizeLog(log));
  normalized.openLogs = normalized.openLogs.slice(0, limit);
  return normalized;
};

module.exports = StarChestStore;
