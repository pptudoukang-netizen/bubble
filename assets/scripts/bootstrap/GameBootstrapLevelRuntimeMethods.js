"use strict";

module.exports = {
  _loadInitialLevel: function () {
    var startupLevelId = this._getStartupLevelId();
    this._setStatus("Loading level_" + String(startupLevelId).padStart(3, "0") + "...");
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
    if (this._currentRunContext && this._currentRunContext.mode === "random_challenge") {
      if (typeof this._startRandomChallengeRun !== "function") {
        throw new Error("Random challenge retry requires _startRandomChallengeRun.");
      }
      this._startRandomChallengeRun({
        seed: this._currentRunContext.seed
      });
      return;
    }
    if (this._currentRunContext && this._currentRunContext.mode === "test") {
      if (this._currentRunContext.testSource === "local") {
        if (typeof this._startLocalEditedLevelEntry !== "function") {
          throw new Error("Local edited level retry requires _startLocalEditedLevelEntry.");
        }
        this._startLocalEditedLevelEntry(this._currentRunContext.levelId);
        return;
      }
      if (this._currentRunContext.testSource !== "bundled") {
        throw new Error("Test level retry requires a supported testSource.");
      }
      if (typeof this._startTestLevelEntry !== "function") {
        throw new Error("Test level retry requires _startTestLevelEntry.");
      }
      this._startTestLevelEntry();
      return;
    }
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

  _openPauseView: function () {
    if (this.isRestarting || this.isSelectingLevel) {
      throw new Error("PauseView cannot open outside active gameplay.");
    }
    if (!this.currentLevelConfig || !this.gameManager || !this.levelRenderer) {
      throw new Error("PauseView requires an active gameplay runtime.");
    }
    if (this.isGameplayPaused) {
      throw new Error("Gameplay is already paused.");
    }
    if (this._isTerminalState()) {
      throw new Error("PauseView cannot open after gameplay has ended.");
    }

    if (this.gameManager.isAiming) {
      var snapshot = this.gameManager.endAim();
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    }
    this.levelRenderer.showPauseView();
    this.isGameplayPaused = true;
    this._playSfx("uiClick");
  },

  _continuePausedLevel: function () {
    this._requirePausedGameplay("continue");
    this.levelRenderer.hidePauseView();
    this.isGameplayPaused = false;
    this._playSfx("uiClick");
  },

  _openPropDescriptionView: function () {
    if (this.isRestarting || this.isSelectingLevel) {
      throw new Error("PropDescriptionView cannot open outside active gameplay.");
    }
    if (!this.currentLevelConfig || !this.gameManager || !this.levelRenderer) {
      throw new Error("PropDescriptionView requires an active gameplay runtime.");
    }
    if (this.isGameplayPaused || this.isPropDescriptionViewOpen) {
      throw new Error("PropDescriptionView cannot open while gameplay is paused.");
    }
    if (this._isTerminalState()) {
      throw new Error("PropDescriptionView cannot open after gameplay has ended.");
    }

    if (this.gameManager.isAiming) {
      var snapshot = this.gameManager.endAim();
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    }
    this.levelRenderer.showPropDescriptionView(this.currentLevelConfig);
    this.isPropDescriptionViewOpen = true;
    this.isGameplayPaused = true;
    this._playSfx("uiClick");
  },

  _closePropDescriptionView: function () {
    if (!this.isPropDescriptionViewOpen || !this.isGameplayPaused) {
      throw new Error("PropDescriptionView close requires an active description modal.");
    }
    if (!this.currentLevelConfig || !this.gameManager || !this.levelRenderer) {
      throw new Error("PropDescriptionView close requires an active gameplay runtime.");
    }
    this.levelRenderer.hidePropDescriptionView();
    this.isPropDescriptionViewOpen = false;
    this.isGameplayPaused = false;
    this._playSfx("uiClick");
  },

  _retryPausedLevel: function () {
    this._requirePausedGameplay("retry");
    this.levelRenderer.hidePauseView();
    this.isGameplayPaused = false;
    this._restartCurrentLevel();
  },

  _exitPausedLevel: function () {
    this._requirePausedGameplay("exit");
    this.levelRenderer.hidePauseView();
    this.isGameplayPaused = false;
    this._onBackToLevelTap();
  },

  _requirePausedGameplay: function (action) {
    if (!this.isGameplayPaused) {
      throw new Error("PauseView " + action + " requires paused gameplay.");
    }
    if (!this.currentLevelConfig || !this.gameManager || !this.levelRenderer) {
      throw new Error("PauseView " + action + " requires an active gameplay runtime.");
    }
  },

  _isTerminalState: function () {
    var snapshot = this.gameManager.getRuntimeSnapshot();
    return snapshot.state === "won" ||
      snapshot.state === "won_pending" ||
      snapshot.state === "won_surplus_shots_pending" ||
      snapshot.state === "won_settlement_pending" ||
      snapshot.state === "out_of_shots" ||
      snapshot.state === "out_of_shots_pending" ||
      snapshot.state === "lost_danger" ||
      snapshot.state === "lost_objective";
  }
};
