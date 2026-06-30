"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_daily_task_state_v1";
var NAMESPACE = "DailyTaskStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be a boolean.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireDate(now) {
  var value = now === undefined ? new Date() : now;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Daily task date must be a valid Date.");
  }
  return value;
}

function pad2(value) {
  return value < 10 ? ("0" + value) : String(value);
}

function createInitialState(dayKey) {
  return {
    version: 1,
    dayKey: dayKey,
    tasks: {},
    claimLogs: []
  };
}

function normalizeTaskState(taskId, rawTask) {
  assertObject(rawTask, "Daily task state must be an object: " + taskId);
  return {
    progress: requireNonNegativeInteger(rawTask.progress, "Daily task progress `" + taskId + "`"),
    claimed: requireBoolean(rawTask.claimed, "Daily task claimed `" + taskId + "`"),
    completedAt: requireNonNegativeInteger(rawTask.completedAt, "Daily task completedAt `" + taskId + "`"),
    claimedAt: requireNonNegativeInteger(rawTask.claimedAt, "Daily task claimedAt `" + taskId + "`")
  };
}

function normalizeClaimLog(rawLog, index) {
  assertObject(rawLog, "Daily task claim log must be an object at index " + index + ".");
  if (typeof rawLog.taskId !== "string" || rawLog.taskId.length === 0) {
    throw new Error("Daily task claim log taskId is required at index " + index + ".");
  }
  return {
    taskId: rawLog.taskId,
    claimedAt: requireNonNegativeInteger(rawLog.claimedAt, "Daily task claim log claimedAt")
  };
}

function normalizeState(raw) {
  assertObject(raw, "Daily task state must be an object.");
  if (raw.version !== 1) {
    throw new Error("Daily task state version must be 1.");
  }
  if (typeof raw.dayKey !== "string" || raw.dayKey.length === 0) {
    throw new Error("Daily task dayKey must be a non-empty string.");
  }
  assertObject(raw.tasks, "Daily task state tasks are required.");
  if (!Array.isArray(raw.claimLogs)) {
    throw new Error("Daily task claimLogs must be an array.");
  }

  var tasks = {};
  Object.keys(raw.tasks).forEach(function (taskId) {
    tasks[taskId] = normalizeTaskState(taskId, raw.tasks[taskId]);
  });

  return {
    version: 1,
    dayKey: raw.dayKey,
    tasks: tasks,
    claimLogs: raw.claimLogs.map(normalizeClaimLog)
  };
}

function DailyTaskStore(options) {
  assertObject(options, "DailyTaskStore options are required.");
  this.resetTimezone = options.resetTimezone;
  if (this.resetTimezone !== "Asia/Shanghai") {
    throw new Error("DailyTaskStore only supports Asia/Shanghai reset timezone.");
  }
}

DailyTaskStore.prototype.getTodayKey = function (now) {
  var date = requireDate(now);
  var shanghaiTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return [
    String(shanghaiTime.getUTCFullYear()),
    pad2(shanghaiTime.getUTCMonth() + 1),
    pad2(shanghaiTime.getUTCDate())
  ].join("-");
};

DailyTaskStore.prototype.load = function (now) {
  var todayKey = this.getTodayKey(now);
  var rawState = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(todayKey);
  });
  var state = this.ensureDailyReset(normalizeState(rawState), now);
  if (JSON.stringify(rawState) !== JSON.stringify(state)) {
    this.save(state);
  }
  return clone(state);
};

DailyTaskStore.prototype.save = function (state) {
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalizeState(state));
};

DailyTaskStore.prototype.ensureDailyReset = function (state, now) {
  var normalized = normalizeState(state);
  var todayKey = this.getTodayKey(now);
  if (normalized.dayKey === todayKey) {
    return normalized;
  }
  return createInitialState(todayKey);
};

module.exports = DailyTaskStore;
