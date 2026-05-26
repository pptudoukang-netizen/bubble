"use strict";

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
    var currentLevelId = this.currentLevelConfig.level
      ? Math.max(1, Math.floor(Number(this.currentLevelConfig.level.levelId) || 0))
      : 0;
    if (!currentLevelId) {
      throw new Error("Restart requires current level id.");
    }
    if (typeof this._showStartGameView !== "function") {
      throw new Error("Restart requires StartGameView entry method.");
    }
    if (typeof this._showLevelSelectView !== "function") {
      throw new Error("Restart requires level select entry method.");
    }
    this._showLevelSelectView({
      targetLevelId: currentLevelId,
      prepareLevelId: currentLevelId
    });
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
