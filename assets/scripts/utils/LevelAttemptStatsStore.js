"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_level_attempt_stats_v1";
var NAMESPACE = "LevelAttemptStatsStore";
var MAX_RECENT_EVENTS = 50;
var MAX_LAST_ATTEMPT_BY_LEVEL = 50;
var EVENT_LEVEL_START = "level_start";
var EVENT_LEVEL_RESULT = "level_result";
var EVENT_LEVEL_REVIVE = "level_revive";
var EVENT_POWERUP_USED = "powerup_used";

var RESULT_TYPES = {
  win: true,
  lose: true,
  quit: true
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
}

function requireOptionalString(value, fieldName) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string or null.");
  }
  return value;
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

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function normalizePowerupsUsed(rawPowerupsUsed, fieldName) {
  assertObject(rawPowerupsUsed, fieldName);
  var powerupsUsed = {};
  Object.keys(rawPowerupsUsed).forEach(function (powerupType) {
    requireNonEmptyString(powerupType, fieldName + " key");
    powerupsUsed[powerupType] = requireNonNegativeInteger(
      rawPowerupsUsed[powerupType],
      fieldName + "." + powerupType
    );
  });
  return powerupsUsed;
}

function createInitialState() {
  return {
    version: 1,
    totalAttemptCount: 0,
    attemptCountByLevel: {},
    activeAttempt: null,
    lastAttempt: null,
    lastAttemptByLevel: {},
    recentEvents: []
  };
}

function normalizeAttempt(rawAttempt, fieldName) {
  if (rawAttempt === null) {
    return null;
  }
  assertObject(rawAttempt, fieldName);
  return {
    attemptId: requireNonEmptyString(rawAttempt.attemptId, fieldName + ".attemptId"),
    levelId: requirePositiveInteger(rawAttempt.levelId, fieldName + ".levelId"),
    levelCode: requireNonEmptyString(rawAttempt.levelCode, fieldName + ".levelCode"),
    runMode: requireNonEmptyString(rawAttempt.runMode, fieldName + ".runMode"),
    startedAt: requireNonNegativeInteger(rawAttempt.startedAt, fieldName + ".startedAt"),
    endedAt: requireNonNegativeInteger(rawAttempt.endedAt, fieldName + ".endedAt"),
    attemptIndexForLevel: requirePositiveInteger(rawAttempt.attemptIndexForLevel, fieldName + ".attemptIndexForLevel"),
    startState: requireNonEmptyString(rawAttempt.startState, fieldName + ".startState"),
    initialShots: requireNonNegativeInteger(rawAttempt.initialShots, fieldName + ".initialShots"),
    shotsUsed: requireNonNegativeInteger(rawAttempt.shotsUsed, fieldName + ".shotsUsed"),
    shotsRemaining: requireNonNegativeInteger(rawAttempt.shotsRemaining, fieldName + ".shotsRemaining"),
    result: requireOptionalString(rawAttempt.result, fieldName + ".result"),
    failReason: requireOptionalString(rawAttempt.failReason, fieldName + ".failReason"),
    quitReason: requireOptionalString(rawAttempt.quitReason, fieldName + ".quitReason"),
    powerupsUsed: normalizePowerupsUsed(rawAttempt.powerupsUsed, fieldName + ".powerupsUsed"),
    reviveUsed: requireBoolean(rawAttempt.reviveUsed, fieldName + ".reviveUsed"),
    reviveCount: requireNonNegativeInteger(rawAttempt.reviveCount, fieldName + ".reviveCount")
  };
}

function normalizeEvent(rawEvent, index) {
  assertObject(rawEvent, "Level attempt event at index " + index);
  return {
    eventName: requireNonEmptyString(rawEvent.eventName, "Level attempt eventName"),
    eventTimeMs: requireNonNegativeInteger(rawEvent.eventTimeMs, "Level attempt eventTimeMs"),
    attemptId: requireNonEmptyString(rawEvent.attemptId, "Level attempt event attemptId"),
    levelId: requirePositiveInteger(rawEvent.levelId, "Level attempt event levelId"),
    levelCode: requireNonEmptyString(rawEvent.levelCode, "Level attempt event levelCode"),
    runMode: requireNonEmptyString(rawEvent.runMode, "Level attempt event runMode"),
    result: requireOptionalString(rawEvent.result, "Level attempt event result"),
    failReason: requireOptionalString(rawEvent.failReason, "Level attempt event failReason"),
    quitReason: requireOptionalString(rawEvent.quitReason, "Level attempt event quitReason"),
    shotsUsed: requireNonNegativeInteger(rawEvent.shotsUsed, "Level attempt event shotsUsed"),
    shotsRemaining: requireNonNegativeInteger(rawEvent.shotsRemaining, "Level attempt event shotsRemaining"),
    powerupsUsed: normalizePowerupsUsed(rawEvent.powerupsUsed, "Level attempt event powerupsUsed"),
    reviveUsed: requireBoolean(rawEvent.reviveUsed, "Level attempt event reviveUsed"),
    reviveCount: requireNonNegativeInteger(rawEvent.reviveCount, "Level attempt event reviveCount")
  };
}

function normalizeAttemptCountByLevel(rawCounts) {
  assertObject(rawCounts, "Level attempt count by level");
  var counts = {};
  Object.keys(rawCounts).forEach(function (levelKey) {
    requirePositiveInteger(Number(levelKey), "Level attempt count level key");
    counts[levelKey] = requireNonNegativeInteger(rawCounts[levelKey], "Level attempt count `" + levelKey + "`");
  });
  return counts;
}

function normalizeLastAttemptByLevel(rawAttempts) {
  assertObject(rawAttempts, "Level attempt lastAttemptByLevel");
  var entries = Object.keys(rawAttempts).map(function (levelKey) {
    requirePositiveInteger(Number(levelKey), "Level attempt lastAttemptByLevel key");
    return {
      levelKey: levelKey,
      attempt: normalizeAttempt(rawAttempts[levelKey], "Level attempt lastAttemptByLevel." + levelKey)
    };
  });
  entries.sort(function (left, right) {
    var rightTime = right.attempt ? Math.max(right.attempt.endedAt, right.attempt.startedAt) : 0;
    var leftTime = left.attempt ? Math.max(left.attempt.endedAt, left.attempt.startedAt) : 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return Number(right.levelKey) - Number(left.levelKey);
  });
  var attempts = {};
  entries.slice(0, MAX_LAST_ATTEMPT_BY_LEVEL).forEach(function (entry) {
    attempts[entry.levelKey] = entry.attempt;
  });
  return attempts;
}

function normalizeState(rawState) {
  assertObject(rawState, "Level attempt stats state");
  if (rawState.version !== 1) {
    throw new Error("Level attempt stats state version must be 1.");
  }
  if (!Array.isArray(rawState.recentEvents)) {
    throw new Error("Level attempt recentEvents must be an array.");
  }
  return {
    version: 1,
    totalAttemptCount: requireNonNegativeInteger(rawState.totalAttemptCount, "Level attempt totalAttemptCount"),
    attemptCountByLevel: normalizeAttemptCountByLevel(rawState.attemptCountByLevel),
    activeAttempt: normalizeAttempt(rawState.activeAttempt, "Level attempt activeAttempt"),
    lastAttempt: normalizeAttempt(rawState.lastAttempt, "Level attempt lastAttempt"),
    lastAttemptByLevel: normalizeLastAttemptByLevel(rawState.lastAttemptByLevel),
    recentEvents: rawState.recentEvents.map(normalizeEvent).slice(-MAX_RECENT_EVENTS)
  };
}

function buildEvent(eventName, attempt) {
  var normalizedAttempt = normalizeAttempt(attempt, "Level attempt event source");
  return {
    eventName: requireNonEmptyString(eventName, "Level attempt eventName"),
    eventTimeMs: Date.now(),
    attemptId: normalizedAttempt.attemptId,
    levelId: normalizedAttempt.levelId,
    levelCode: normalizedAttempt.levelCode,
    runMode: normalizedAttempt.runMode,
    result: normalizedAttempt.result,
    failReason: normalizedAttempt.failReason,
    quitReason: normalizedAttempt.quitReason,
    shotsUsed: normalizedAttempt.shotsUsed,
    shotsRemaining: normalizedAttempt.shotsRemaining,
    powerupsUsed: clone(normalizedAttempt.powerupsUsed),
    reviveUsed: normalizedAttempt.reviveUsed,
    reviveCount: normalizedAttempt.reviveCount
  };
}

function appendEvent(state, eventName, attempt) {
  var normalized = normalizeState(state);
  normalized.recentEvents.push(buildEvent(eventName, attempt));
  if (normalized.recentEvents.length > MAX_RECENT_EVENTS) {
    normalized.recentEvents = normalized.recentEvents.slice(-MAX_RECENT_EVENTS);
  }
  return normalized;
}

function buildStartedAttempt(state, payload) {
  var normalized = normalizeState(state);
  var levelId = requirePositiveInteger(payload.levelId, "Level attempt start levelId");
  var levelKey = String(levelId);
  var previousCount = Object.prototype.hasOwnProperty.call(normalized.attemptCountByLevel, levelKey)
    ? requireNonNegativeInteger(normalized.attemptCountByLevel[levelKey], "Level attempt previous count")
    : 0;
  return {
    attempt: {
      attemptId: requireNonEmptyString(payload.attemptId, "Level attempt start attemptId"),
      levelId: levelId,
      levelCode: requireNonEmptyString(payload.levelCode, "Level attempt start levelCode"),
      runMode: requireNonEmptyString(payload.runMode, "Level attempt start runMode"),
      startedAt: requireNonNegativeInteger(payload.startedAt, "Level attempt start startedAt"),
      endedAt: 0,
      attemptIndexForLevel: previousCount + 1,
      startState: requireNonEmptyString(payload.startState, "Level attempt start startState"),
      initialShots: requireNonNegativeInteger(payload.initialShots, "Level attempt start initialShots"),
      shotsUsed: 0,
      shotsRemaining: requireNonNegativeInteger(payload.initialShots, "Level attempt start initialShots"),
      result: null,
      failReason: null,
      quitReason: null,
      powerupsUsed: {},
      reviveUsed: false,
      reviveCount: 0
    },
    previousCount: previousCount
  };
}

function resolveActiveAttemptForMutation(state, attemptId, mutationName) {
  var normalized = normalizeState(state);
  var safeAttemptId = requireNonEmptyString(attemptId, mutationName + " attemptId");
  if (normalized.activeAttempt && normalized.activeAttempt.attemptId === safeAttemptId) {
    return {
      state: normalized,
      attempt: normalized.activeAttempt
    };
  }
  if (normalized.lastAttempt && normalized.lastAttempt.attemptId === safeAttemptId) {
    normalized.activeAttempt = clone(normalized.lastAttempt);
    return {
      state: normalized,
      attempt: normalized.activeAttempt
    };
  }
  throw new Error(mutationName + " requires active attempt: " + safeAttemptId);
}

function LevelAttemptStatsStore() {}

LevelAttemptStatsStore.prototype.load = function () {
  var rawState = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(rawState);
  if (JSON.stringify(rawState) !== JSON.stringify(normalized)) {
    this.save(normalized);
  }
  return clone(normalized);
};

LevelAttemptStatsStore.prototype.save = function (state) {
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalizeState(state));
};

LevelAttemptStatsStore.prototype.recordStart = function (state, payload) {
  assertObject(payload, "Level attempt start payload");
  var normalized = normalizeState(state);
  if (normalized.activeAttempt) {
    throw new Error("Cannot start a new level attempt before closing active attempt.");
  }
  var startResult = buildStartedAttempt(normalized, payload);
  var attempt = startResult.attempt;
  var levelKey = String(attempt.levelId);
  normalized.totalAttemptCount += 1;
  normalized.attemptCountByLevel[levelKey] = startResult.previousCount + 1;
  normalized.activeAttempt = attempt;
  normalized = appendEvent(normalized, EVENT_LEVEL_START, attempt);
  return clone(normalized);
};

LevelAttemptStatsStore.prototype.recordResult = function (state, payload) {
  assertObject(payload, "Level attempt result payload");
  var activeResult = resolveActiveAttemptForMutation(state, payload.attemptId, "Level attempt result");
  var normalized = activeResult.state;
  var attempt = activeResult.attempt;
  var result = requireNonEmptyString(payload.result, "Level attempt result");
  if (RESULT_TYPES[result] !== true) {
    throw new Error("Unsupported level attempt result: " + result);
  }
  attempt.endedAt = requireNonNegativeInteger(payload.endedAt, "Level attempt result endedAt");
  attempt.shotsUsed = requireNonNegativeInteger(payload.shotsUsed, "Level attempt result shotsUsed");
  attempt.shotsRemaining = requireNonNegativeInteger(payload.shotsRemaining, "Level attempt result shotsRemaining");
  attempt.result = result;
  attempt.failReason = requireOptionalString(payload.failReason, "Level attempt result failReason");
  attempt.quitReason = requireOptionalString(payload.quitReason, "Level attempt result quitReason");
  attempt.powerupsUsed = normalizePowerupsUsed(payload.powerupsUsed, "Level attempt result powerupsUsed");
  attempt.reviveUsed = requireBoolean(payload.reviveUsed, "Level attempt result reviveUsed");
  attempt.reviveCount = requireNonNegativeInteger(payload.reviveCount, "Level attempt result reviveCount");
  normalized.lastAttempt = clone(attempt);
  normalized.lastAttemptByLevel[String(attempt.levelId)] = clone(attempt);
  normalized.lastAttemptByLevel = normalizeLastAttemptByLevel(normalized.lastAttemptByLevel);
  normalized.activeAttempt = null;
  normalized = appendEvent(normalized, EVENT_LEVEL_RESULT, attempt);
  return clone(normalized);
};

LevelAttemptStatsStore.prototype.recordPowerupUsed = function (state, attemptId, powerupType) {
  var activeResult = resolveActiveAttemptForMutation(state, attemptId, "Level attempt powerup use");
  var normalized = activeResult.state;
  var attempt = activeResult.attempt;
  var safePowerupType = requireNonEmptyString(powerupType, "Level attempt powerup type");
  var previousCount = Object.prototype.hasOwnProperty.call(attempt.powerupsUsed, safePowerupType)
    ? requireNonNegativeInteger(attempt.powerupsUsed[safePowerupType], "Level attempt powerup previous count")
    : 0;
  attempt.powerupsUsed[safePowerupType] = previousCount + 1;
  normalized.activeAttempt = attempt;
  normalized = appendEvent(normalized, EVENT_POWERUP_USED, attempt);
  return clone(normalized);
};

LevelAttemptStatsStore.prototype.recordReviveUsed = function (state, attemptId) {
  var activeResult = resolveActiveAttemptForMutation(state, attemptId, "Level attempt revive");
  var normalized = activeResult.state;
  var attempt = activeResult.attempt;
  attempt.endedAt = 0;
  attempt.result = null;
  attempt.failReason = null;
  attempt.quitReason = null;
  attempt.reviveUsed = true;
  attempt.reviveCount += 1;
  normalized.activeAttempt = attempt;
  normalized = appendEvent(normalized, EVENT_LEVEL_REVIVE, attempt);
  return clone(normalized);
};

LevelAttemptStatsStore.createInitialState = createInitialState;
LevelAttemptStatsStore.normalizeState = normalizeState;
LevelAttemptStatsStore.STORAGE_KEY = STORAGE_KEY;
LevelAttemptStatsStore.NAMESPACE = NAMESPACE;
LevelAttemptStatsStore.MAX_RECENT_EVENTS = MAX_RECENT_EVENTS;
LevelAttemptStatsStore.MAX_LAST_ATTEMPT_BY_LEVEL = MAX_LAST_ATTEMPT_BY_LEVEL;

module.exports = LevelAttemptStatsStore;
