"use strict";

var FAILURE_TIPS_THRESHOLD = 2;
var CAMPAIGN_RUN_MODE = "campaign";
var RANDOM_CHALLENGE_RUN_MODE = "random_challenge";

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireRunMode(runMode) {
  if (runMode !== CAMPAIGN_RUN_MODE && runMode !== RANDOM_CHALLENGE_RUN_MODE) {
    throw new Error("Unsupported current frontier failure run mode: " + runMode);
  }
  return runMode;
}

function requireFailureStore(host) {
  if (
    !host.currentFrontierFailureStore ||
    typeof host.currentFrontierFailureStore.syncFrontier !== "function" ||
    typeof host.currentFrontierFailureStore.recordLoss !== "function" ||
    typeof host.currentFrontierFailureStore.recordWin !== "function" ||
    typeof host.currentFrontierFailureStore.getConsecutiveFailureCount !== "function" ||
    typeof host.currentFrontierFailureStore.save !== "function"
  ) {
    throw new Error("Current frontier failure tracking requires CurrentFrontierFailureStore.");
  }
  return host.currentFrontierFailureStore;
}

function requireHighestUnlockedLevel(host) {
  requireObject(host.levelProgress, "Current frontier level progress");
  return requirePositiveInteger(
    host.levelProgress.highestUnlockedLevel,
    "Current frontier highestUnlockedLevel"
  );
}

function saveFailureState(host, nextState) {
  requireObject(nextState, "Current frontier next failure state");
  host.currentFrontierFailureState = nextState;
  requireFailureStore(host).save(host.currentFrontierFailureState);
}

module.exports = {
  _beginCurrentFrontierFailureTracking: function (levelId, runMode) {
    var safeLevelId = requirePositiveInteger(levelId, "Current frontier attempt levelId");
    var safeRunMode = requireRunMode(runMode);
    if (safeRunMode !== CAMPAIGN_RUN_MODE) {
      this._currentAttemptTracksFrontierFailure = false;
      return false;
    }

    var highestUnlockedLevel = requireHighestUnlockedLevel(this);
    var store = requireFailureStore(this);
    var synchronizedState = store.syncFrontier(
      requireObject(this.currentFrontierFailureState, "Current frontier failure state"),
      highestUnlockedLevel
    );
    if (JSON.stringify(synchronizedState) !== JSON.stringify(this.currentFrontierFailureState)) {
      saveFailureState(this, synchronizedState);
    } else {
      this.currentFrontierFailureState = synchronizedState;
    }
    this._currentAttemptTracksFrontierFailure = safeLevelId === highestUnlockedLevel;
    return this._currentAttemptTracksFrontierFailure;
  },

  _clearCurrentFrontierFailureTracking: function () {
    this._currentAttemptTracksFrontierFailure = false;
  },

  _recordCurrentFrontierAttemptResult: function (levelId, result) {
    var safeLevelId = requirePositiveInteger(levelId, "Current frontier result levelId");
    if (result !== "win" && result !== "lose") {
      throw new Error("Unsupported current frontier attempt result: " + result);
    }
    if (this._currentAttemptTracksFrontierFailure !== true) {
      return false;
    }

    var store = requireFailureStore(this);
    var currentState = requireObject(this.currentFrontierFailureState, "Current frontier failure state");
    var nextState = result === "lose"
      ? store.recordLoss(currentState, safeLevelId)
      : store.recordWin(currentState, safeLevelId, requireHighestUnlockedLevel(this));
    saveFailureState(this, nextState);
    this._currentAttemptTracksFrontierFailure = false;
    return true;
  },

  _shouldShowCurrentFrontierAimingToolTips: function () {
    requireObject(this._currentRunContext, "Current frontier aiming tips run context");
    if (this._currentRunContext.mode !== CAMPAIGN_RUN_MODE) {
      return false;
    }
    if (this._currentAttemptTracksFrontierFailure !== true) {
      return false;
    }
    if (typeof this._pendingStartGamePreciseAimActivation !== "boolean") {
      throw new Error("Current frontier aiming tips requires precise aim carry state.");
    }
    if (this._pendingStartGamePreciseAimActivation) {
      return false;
    }

    var safeLevelId = requirePositiveInteger(this._currentLevelId, "Current frontier aiming tips levelId");
    var failureCount = requireFailureStore(this).getConsecutiveFailureCount(
      requireObject(this.currentFrontierFailureState, "Current frontier failure state"),
      safeLevelId
    );
    return failureCount >= FAILURE_TIPS_THRESHOLD;
  },

  _showCurrentFrontierAimingToolTipsAfterCountdown: function () {
    if (!this._shouldShowCurrentFrontierAimingToolTips()) {
      return Promise.resolve(false);
    }
    if (!this.levelRenderer || typeof this.levelRenderer.showAimingToolTips !== "function") {
      throw new Error("Current frontier aiming tips requires LevelRenderer.showAimingToolTips.");
    }
    return this.levelRenderer.showAimingToolTips().then(function () {
      return true;
    });
  }
};
