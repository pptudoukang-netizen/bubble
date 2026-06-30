"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_game_circle_welfare_state_v1";
var NAMESPACE = "GameCircleWelfareStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toDateKey(date) {
  var now = date instanceof Date ? date : new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function createEmptyMetrics() {
  return {
    joinTime: 0,
    todayLikePostCount: 0,
    todayPublishPostCount: 0
  };
}

function createInitialState(activityId) {
  return {
    version: 1,
    activityId: activityId,
    lastRefreshDate: "",
    lastRefreshAt: 0,
    metrics: createEmptyMetrics(),
    claimedTasks: {},
    dailyClaims: {}
  };
}

function requirePlainObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Game circle welfare state field `" + fieldName + "` must be an object.");
  }
}

function requireNonNegativeInteger(value, fieldName) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed !== Number(value)) {
    throw new Error("Game circle welfare state field `" + fieldName + "` must be a non-negative integer.");
  }
  return parsed;
}

function normalizeState(raw, activityId) {
  if (!raw) {
    return createInitialState(activityId);
  }
  requirePlainObject(raw, "root");
  if (raw.activityId !== activityId) {
    return createInitialState(activityId);
  }
  if (raw.version !== 1) {
    throw new Error("Unsupported game circle welfare state version: " + raw.version);
  }
  if (typeof raw.lastRefreshDate !== "string") {
    throw new Error("Game circle welfare state lastRefreshDate must be a string.");
  }
  requirePlainObject(raw.metrics, "metrics");
  requirePlainObject(raw.claimedTasks, "claimedTasks");
  requirePlainObject(raw.dailyClaims, "dailyClaims");

  return {
    version: 1,
    activityId: activityId,
    lastRefreshDate: raw.lastRefreshDate,
    lastRefreshAt: requireNonNegativeInteger(raw.lastRefreshAt, "lastRefreshAt"),
    metrics: {
      joinTime: requireNonNegativeInteger(raw.metrics.joinTime, "metrics.joinTime"),
      todayLikePostCount: requireNonNegativeInteger(raw.metrics.todayLikePostCount, "metrics.todayLikePostCount"),
      todayPublishPostCount: requireNonNegativeInteger(raw.metrics.todayPublishPostCount, "metrics.todayPublishPostCount")
    },
    claimedTasks: clone(raw.claimedTasks),
    dailyClaims: clone(raw.dailyClaims)
  };
}

function GameCircleWelfareStore(options) {
  if (!options || typeof options.activityId !== "string" || !options.activityId) {
    throw new Error("GameCircleWelfareStore requires a non-empty activityId.");
  }
  this.activityId = options.activityId;
}

GameCircleWelfareStore.prototype.getTodayKey = function (now) {
  return toDateKey(now);
};

GameCircleWelfareStore.prototype._getStorage = function () {
  return StrictStorage.resolveStorage(NAMESPACE);
};

GameCircleWelfareStore.prototype.load = function (now) {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(this.activityId);
  }.bind(this));
  var normalized = normalizeState(state, this.activityId);
  var refreshed = this.ensureCurrentDay(normalized, now || new Date());
  if (JSON.stringify(state) !== JSON.stringify(refreshed)) {
    this.save(refreshed);
  }
  return clone(refreshed);
};

GameCircleWelfareStore.prototype.save = function (state) {
  var normalized = normalizeState(state, this.activityId);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  return true;
};

GameCircleWelfareStore.prototype.ensureCurrentDay = function (state, now) {
  var normalized = normalizeState(state, this.activityId);
  var todayKey = this.getTodayKey(now || new Date());
  if (normalized.lastRefreshDate && normalized.lastRefreshDate !== todayKey) {
    normalized.lastRefreshDate = "";
    normalized.lastRefreshAt = 0;
    normalized.metrics.todayLikePostCount = 0;
    normalized.metrics.todayPublishPostCount = 0;
  }
  return normalized;
};

GameCircleWelfareStore.prototype.markRefreshed = function (state, metrics, now) {
  var normalized = this.ensureCurrentDay(state, now || new Date());
  requirePlainObject(metrics, "metrics");
  normalized.lastRefreshDate = this.getTodayKey(now || new Date());
  normalized.lastRefreshAt = (now instanceof Date ? now.getTime() : Date.now());
  normalized.metrics = {
    joinTime: requireNonNegativeInteger(metrics.joinTime, "metrics.joinTime"),
    todayLikePostCount: requireNonNegativeInteger(metrics.todayLikePostCount, "metrics.todayLikePostCount"),
    todayPublishPostCount: requireNonNegativeInteger(metrics.todayPublishPostCount, "metrics.todayPublishPostCount")
  };
  return normalized;
};

GameCircleWelfareStore.prototype.isTaskClaimed = function (state, task, now) {
  var normalized = this.ensureCurrentDay(state, now || new Date());
  if (!task || typeof task.taskId !== "string" || !task.taskId) {
    throw new Error("Invalid game circle welfare task when checking claim state.");
  }
  if (task.resetMode === "once") {
    return normalized.claimedTasks[task.taskId] === true;
  }
  if (task.resetMode !== "daily") {
    throw new Error("Unsupported game circle welfare reset mode: " + task.resetMode);
  }
  var todayKey = this.getTodayKey(now || new Date());
  var dailyClaim = normalized.dailyClaims[todayKey];
  return !!(dailyClaim && dailyClaim[task.taskId] === true);
};

GameCircleWelfareStore.prototype.markTaskClaimed = function (state, task, now) {
  var normalized = this.ensureCurrentDay(state, now || new Date());
  if (!task || typeof task.taskId !== "string" || !task.taskId) {
    throw new Error("Invalid game circle welfare task when marking claimed.");
  }
  if (task.resetMode === "once") {
    normalized.claimedTasks[task.taskId] = true;
    return normalized;
  }
  if (task.resetMode !== "daily") {
    throw new Error("Unsupported game circle welfare reset mode: " + task.resetMode);
  }
  var todayKey = this.getTodayKey(now || new Date());
  if (!normalized.dailyClaims[todayKey]) {
    normalized.dailyClaims[todayKey] = {};
  }
  normalized.dailyClaims[todayKey][task.taskId] = true;
  return normalized;
};

module.exports = GameCircleWelfareStore;
