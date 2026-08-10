"use strict";

var Shared = require("./GameBootstrapShared");
var AdRewardCatalog = Shared.AdRewardCatalog;

var TERMINAL_RESULT_BY_STATE = {
  won: {
    result: "win",
    failReason: null
  },
  won_pending: {
    result: "win",
    failReason: null
  },
  won_surplus_shots_pending: {
    result: "win",
    failReason: null
  },
  won_settlement_pending: {
    result: "win",
    failReason: null
  },
  out_of_shots: {
    result: "lose",
    failReason: "run_out_of_shots"
  },
  out_of_shots_pending: {
    result: "lose",
    failReason: "run_out_of_shots"
  },
  lost_danger: {
    result: "lose",
    failReason: "danger_line"
  },
  lost_objective: {
    result: "lose",
    failReason: "objective_failed"
  }
};
var TELEMETRY_RESULT_STATES = {
  won: true,
  out_of_shots: true,
  lost_danger: true,
  lost_objective: true
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

function requireAttemptStore(host) {
  if (!host.levelAttemptStatsStore || typeof host.levelAttemptStatsStore.save !== "function") {
    throw new Error("Level attempt tracking requires LevelAttemptStatsStore.save.");
  }
  return host.levelAttemptStatsStore;
}

function requireRunMode(host) {
  assertObject(host._currentRunContext, "Level attempt run context");
  return requireNonEmptyString(host._currentRunContext.mode, "Level attempt run mode");
}

function requireLevelData(levelConfig) {
  assertObject(levelConfig, "Level attempt levelConfig");
  assertObject(levelConfig.level, "Level attempt level");
  return {
    levelId: requirePositiveInteger(levelConfig.level.levelId, "Level attempt levelId"),
    levelCode: requireNonEmptyString(levelConfig.level.code, "Level attempt levelCode")
  };
}

function requireSnapshot(snapshot) {
  assertObject(snapshot, "Level attempt snapshot");
  return snapshot;
}

function getActiveAttempt(host) {
  assertObject(host.levelAttemptStats, "Level attempt stats");
  if (host.levelAttemptStats.activeAttempt === null) {
    return null;
  }
  assertObject(host.levelAttemptStats.activeAttempt, "Level attempt activeAttempt");
  return host.levelAttemptStats.activeAttempt;
}

function readCurrentSnapshot(host) {
  if (!host.gameManager || typeof host.gameManager.getRuntimeSnapshot !== "function") {
    throw new Error("Level attempt quit requires GameManager.getRuntimeSnapshot.");
  }
  return host.gameManager.getRuntimeSnapshot();
}

function canReadCurrentSnapshot(host) {
  return !!(host.gameManager && typeof host.gameManager.getRuntimeSnapshot === "function");
}

function isTerminalState(state) {
  return Object.prototype.hasOwnProperty.call(TERMINAL_RESULT_BY_STATE, state);
}

function buildResultPayload(host, attempt, snapshot, result, failReason, quitReason) {
  var safeSnapshot = requireSnapshot(snapshot);
  return {
    attemptId: requireNonEmptyString(attempt.attemptId, "Level attempt result attemptId"),
    endedAt: Date.now(),
    result: requireNonEmptyString(result, "Level attempt result"),
    failReason: failReason,
    quitReason: quitReason,
    shotsUsed: requireNonNegativeInteger(safeSnapshot.shotsFired, "Level attempt shotsUsed"),
    shotsRemaining: requireNonNegativeInteger(safeSnapshot.remainingShots, "Level attempt shotsRemaining"),
    powerupsUsed: clone(assertObject(attempt.powerupsUsed, "Level attempt powerupsUsed")),
    reviveUsed: attempt.reviveUsed === true,
    reviveCount: requireNonNegativeInteger(attempt.reviveCount, "Level attempt reviveCount")
  };
}

function buildResultPayloadFromAttempt(attempt, result, failReason, quitReason) {
  return {
    attemptId: requireNonEmptyString(attempt.attemptId, "Level attempt result attemptId"),
    endedAt: Date.now(),
    result: requireNonEmptyString(result, "Level attempt result"),
    failReason: failReason,
    quitReason: quitReason,
    shotsUsed: requireNonNegativeInteger(attempt.shotsUsed, "Level attempt shotsUsed"),
    shotsRemaining: requireNonNegativeInteger(attempt.shotsRemaining, "Level attempt shotsRemaining"),
    powerupsUsed: clone(assertObject(attempt.powerupsUsed, "Level attempt powerupsUsed")),
    reviveUsed: attempt.reviveUsed === true,
    reviveCount: requireNonNegativeInteger(attempt.reviveCount, "Level attempt reviveCount")
  };
}

function saveAttemptStats(host, nextState) {
  var store = requireAttemptStore(host);
  host.levelAttemptStats = nextState;
  store.save(host.levelAttemptStats);
}

module.exports = {
  _trackTelemetry: function (eventName, payload) {
    if (!this.telemetryService || typeof this.telemetryService.track !== "function") {
      return null;
    }

    this.telemetryService.setContext({
      attempt_id: this._currentAttemptId || "",
      level_id: this._currentLevelId || "",
      level_code: this.currentLevelConfig && this.currentLevelConfig.level
        ? this.currentLevelConfig.level.code
        : ""
    });
    return this.telemetryService.track(eventName, payload);
  },

  _beginLevelAttemptTracking: function (levelConfig, snapshot) {
    var levelData = requireLevelData(levelConfig);
    var safeSnapshot = requireSnapshot(snapshot);
    this._attemptSequence += 1;
    this._currentAttemptId = [
      "attempt",
      String(this._attemptSequence),
      String(levelData.levelId),
      Date.now().toString(36)
    ].join("_");
    this._trackedResultAttemptId = "";
    this._grantedAttemptRewardKeys = {};
    var nextAttemptStats = requireAttemptStore(this).recordStart(this.levelAttemptStats, {
      attemptId: this._currentAttemptId,
      levelId: levelData.levelId,
      levelCode: levelData.levelCode,
      runMode: requireRunMode(this),
      startedAt: Date.now(),
      startState: requireNonEmptyString(safeSnapshot.state, "Level attempt start state"),
      initialShots: requireNonNegativeInteger(safeSnapshot.remainingShots, "Level attempt initialShots")
    });
    assertObject(nextAttemptStats.activeAttempt, "Level attempt started activeAttempt");
    this._currentAttemptLevelId = requirePositiveInteger(
      nextAttemptStats.activeAttempt.levelId,
      "Current attempt levelId"
    );
    this._currentAttemptIndexForLevel = requirePositiveInteger(
      nextAttemptStats.activeAttempt.attemptIndexForLevel,
      "Current attempt indexForLevel"
    );
    saveAttemptStats(this, nextAttemptStats);

    this._trackTelemetry("level_start", {
      result_state: safeSnapshot.state
    });
  },

  _trackRuntimeTelemetryEvent: function (runtimeEvent) {
    if (!runtimeEvent || typeof runtimeEvent.type !== "string") {
      return;
    }

    if (runtimeEvent.type === "ad_revive_granted") {
      saveAttemptStats(this, requireAttemptStore(this).recordReviveUsed(
        this.levelAttemptStats,
        this._currentAttemptId
      ));
    }

    if (runtimeEvent.type === "jar_collect_scored") {
      this._trackTelemetry("jar_collect_scored", {
        count: Math.max(0, Math.floor(Number(runtimeEvent.count) || 0)),
        gained: Math.max(0, Math.floor(Number(runtimeEvent.gained) || 0)),
        is_score_boosted: !!runtimeEvent.is_score_boosted,
        boost_multiplier: Number(runtimeEvent.boost_multiplier) || 1
      });
    }
  },

  _recordAttemptPowerupUsed: function (powerupType) {
    var safePowerupType = requireNonEmptyString(powerupType, "Level attempt powerup type");
    if (requireRunMode(this) === "test") {
      return false;
    }
    saveAttemptStats(this, requireAttemptStore(this).recordPowerupUsed(
      this.levelAttemptStats,
      this._currentAttemptId,
      safePowerupType
    ));
    return true;
  },

  _recordCurrentAttemptQuit: function (quitReason, snapshot) {
    var activeAttempt = getActiveAttempt(this);
    if (activeAttempt === null) {
      return;
    }
    var safeQuitReason = requireNonEmptyString(quitReason, "Level attempt quitReason");
    if (snapshot === undefined && !canReadCurrentSnapshot(this)) {
      saveAttemptStats(this, requireAttemptStore(this).recordResult(
        this.levelAttemptStats,
        buildResultPayloadFromAttempt(activeAttempt, "quit", null, safeQuitReason)
      ));
      return;
    }
    var safeSnapshot = snapshot === undefined ? readCurrentSnapshot(this) : requireSnapshot(snapshot);
    if (isTerminalState(safeSnapshot.state)) {
      return;
    }
    saveAttemptStats(this, requireAttemptStore(this).recordResult(
      this.levelAttemptStats,
      buildResultPayload(this, activeAttempt, safeSnapshot, "quit", null, safeQuitReason)
    ));
  },

  _onRuntimeStateTransition: function (snapshot, previousState, currentState) {
    if (currentState === previousState) {
      return;
    }

    var terminalResult = Object.prototype.hasOwnProperty.call(TERMINAL_RESULT_BY_STATE, currentState)
      ? TERMINAL_RESULT_BY_STATE[currentState]
      : null;
    var currentStateIsTerminal = terminalResult !== null;

    if (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective") {
      var loseRewardEntry = AdRewardCatalog.resolveLoseRewardEntry(currentState);
      if (loseRewardEntry) {
        this._trackTelemetry("ad_entry_exposed", {
          entry_key: loseRewardEntry.entryKey,
          reward_type: loseRewardEntry.rewardType,
          result_state: currentState
        });
      }
    }

    if (currentStateIsTerminal) {
      var activeAttempt = getActiveAttempt(this);
      if (activeAttempt !== null && activeAttempt.attemptId === this._currentAttemptId) {
        saveAttemptStats(this, requireAttemptStore(this).recordResult(
          this.levelAttemptStats,
          buildResultPayload(this, activeAttempt, snapshot, terminalResult.result, terminalResult.failReason, null)
        ));
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(TELEMETRY_RESULT_STATES, currentState) &&
      this._trackedResultAttemptId !== this._currentAttemptId
    ) {
      this._trackedResultAttemptId = this._currentAttemptId;
      this._trackTelemetry("level_result", {
        result_state: currentState
      });
    }
  }
};
