"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;

module.exports = {
  _loadInitialLevel: function () {
    var startupLevelId = this._getStartupLevelId();
    this._setStatus("Loading level_" + ("000" + startupLevelId).slice(-3) + "...");
    this._loadLevelById(startupLevelId, "Bootstrap finished", "Bootstrap failed. Check console logs.");
  },

  _getStartupLevelId: function () {
    var fallbackLevelId = Math.max(1, Number(this.initialLevelId) || 1);
    if (!this.enableSpecialEntitiesTestMode) {
      return fallbackLevelId;
    }

    var testLevelId = Math.max(1, Number(this.specialEntitiesTestLevelId) || fallbackLevelId);
    return testLevelId;
  },

  _restartCurrentLevel: function () {
    if (!this.currentLevelConfig) {
      return;
    }

    this._playSfx("uiClick");
    this.isRestarting = true;
    this._setStatus("Restarting level...");

    var snapshot = this.gameManager.startLevel(this.currentLevelConfig);
    if (typeof this._applySelectedPowerupsToRuntime === "function") {
      snapshot = this._applySelectedPowerupsToRuntime(snapshot);
    }
    snapshot = this._applyPendingNextRoundRewards(snapshot);
    this._beginLevelAttemptTracking(this.currentLevelConfig, snapshot);
    snapshot = this.gameManager.endAim();
    this._lastRuntimeState = snapshot ? snapshot.state : null;
    this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).then(function () {
      this.isRestarting = false;
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
      this._playGameplayBackgroundMusic();
      Logger.info("Level restarted", this.currentLevelConfig.level.code);
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._refreshRouteEditorButtons();
      this._setStatus("Restart failed. Check console logs.");
      Logger.error(error);
    }.bind(this));
  },

  _isTerminalState: function () {
    var snapshot = this.gameManager.getRuntimeSnapshot();
    return snapshot.state === "won" ||
      snapshot.state === "out_of_shots" ||
      snapshot.state === "out_of_shots_pending" ||
      snapshot.state === "lost_danger" ||
      snapshot.state === "lost_objective";
  }
};
