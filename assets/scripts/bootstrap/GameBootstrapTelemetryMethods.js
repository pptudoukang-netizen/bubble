"use strict";

var Shared = require("./GameBootstrapShared");
var AdRewardCatalog = Shared.AdRewardCatalog;

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
    var safeLevelConfig = levelConfig && levelConfig.level ? levelConfig.level : {};
    this._attemptSequence += 1;
    this._currentAttemptId = [
      "attempt",
      String(this._attemptSequence),
      String(safeLevelConfig.levelId || this._currentLevelId || 0),
      Date.now().toString(36)
    ].join("_");
    this._trackedResultAttemptId = "";
    this._grantedAttemptRewardKeys = {};

    this._trackTelemetry("level_start", {
      result_state: snapshot && snapshot.state ? snapshot.state : "running"
    });
  },

  _trackRuntimeTelemetryEvent: function (runtimeEvent) {
    if (!runtimeEvent || typeof runtimeEvent.type !== "string") {
      return;
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

  _onRuntimeStateTransition: function (snapshot, previousState, currentState) {
    if (currentState === previousState) {
      return;
    }

    var isTerminalState = currentState === "won" ||
      currentState === "out_of_shots" ||
      currentState === "lost_danger" ||
      currentState === "lost_objective";

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

    if (isTerminalState && this._trackedResultAttemptId !== this._currentAttemptId) {
      this._trackedResultAttemptId = this._currentAttemptId;
      this._trackTelemetry("level_result", {
        result_state: currentState
      });
    }
  }
};
