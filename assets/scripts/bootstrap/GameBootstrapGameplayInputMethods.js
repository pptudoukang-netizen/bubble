"use strict";

var Shared = require("./GameBootstrapShared");
var BoardLayout = Shared.BoardLayout;
var RUNTIME_REFRESH_SCOPE = require("../config/RuntimeRefreshScope");

module.exports = {
  update: function (dt) {
    if (this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }

    if (!this.currentLevelConfig) {
      return;
    }
    if (!this.gameManager || !this.levelRenderer) {
      return;
    }
    if (this._skillBallLoadAnimationInProgress === true) {
      return;
    }
    if (this.isRestarting) {
      if (typeof this.gameManager.updateBoardViewportIntro !== "function") {
        throw new Error("GameBootstrap requires GameManager.updateBoardViewportIntro during level entry.");
      }
      var entrySnapshot = this.gameManager.updateBoardViewportIntro(dt);
      if (entrySnapshot) {
        this.levelRenderer.refreshRuntime(this.currentLevelConfig, entrySnapshot);
      }
      return;
    }

    if (typeof this.levelRenderer.syncFairyAssistCollisionCenters === "function") {
      this.levelRenderer.syncFairyAssistCollisionCenters();
    }

    var snapshot = this.gameManager.update(dt);
    if (!snapshot) {
      return;
    }

    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._syncSkillPowerupGuideForRuntimeSnapshot(snapshot);
    this._syncSpecialIntroduceForRuntimeSnapshot(snapshot);
    this._syncGeniusTipsForRuntimeSnapshot(snapshot);
    this._syncSartTipsForRuntimeSnapshot(snapshot);
    this._playRuntimeAudioEvents(snapshot);
    if (!snapshot.activeProjectile) {
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
    }
  },

  lateUpdate: function (dt) {
    if (this.isSelectingLevel || this.isGameplayPaused || this.isRestarting) {
      return;
    }
    if (!this.currentLevelConfig || !this.gameManager || !this.levelRenderer) {
      return;
    }
    if (this._skillBallLoadAnimationInProgress === true) {
      return;
    }
    var fallingMarbleSystem = this.gameManager.systems.fallingMarbleSystem;
    if (!fallingMarbleSystem || typeof fallingMarbleSystem.processPendingEliminationPresentationRelease !== "function") {
      throw new Error("GameBootstrap lateUpdate requires FallingMarbleSystem.processPendingEliminationPresentationRelease.");
    }
    if (!fallingMarbleSystem.processPendingEliminationPresentationRelease(dt)) {
      return;
    }
    var snapshot = this.gameManager.getRuntimeSnapshot();
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot, {
      scope: RUNTIME_REFRESH_SCOPE.FALLING
    });
  },

  _bindInput: function () {
    this.node.on(cc.Node.EventType.TOUCH_START, this._onAimStart, this);
    this.node.on(cc.Node.EventType.TOUCH_MOVE, this._onAimMove, this);
    this.node.on(cc.Node.EventType.TOUCH_END, this._onFireTouch, this);
    this.node.on(cc.Node.EventType.TOUCH_CANCEL, this._onAimCancel, this);
  },

  _getShooterOriginPoint: function () {
    if (
      this.gameManager &&
      this.gameManager.systems &&
      this.gameManager.systems.shooterController &&
      this.gameManager.systems.shooterController.origin
    ) {
      return this.gameManager.systems.shooterController.origin;
    }

    return BoardLayout && BoardLayout.shooterOrigin
      ? BoardLayout.shooterOrigin
      : null;
  },

  _isShotTouchPointValid: function (localPoint) {
    if (!localPoint || typeof localPoint.y !== "number") {
      return false;
    }

    var shooterOrigin = this._getShooterOriginPoint();
    if (!shooterOrigin || typeof shooterOrigin.y !== "number") {
      return true;
    }

    // 仅允许炮台发射点上方的触摸生效。
    return localPoint.y > shooterOrigin.y;
  },

  _isShooterHandoffInputLocked: function () {
    if (!this.levelRenderer || typeof this.levelRenderer.isShooterHandoffInProgress !== "function") {
      throw new Error("GameBootstrap shot input requires LevelRenderer.isShooterHandoffInProgress.");
    }
    if (this.levelRenderer.isShooterHandoffInProgress()) {
      return true;
    }
    if (typeof this.levelRenderer.isPowerupLoadAnimationInProgress !== "function") {
      throw new Error("GameBootstrap shot input requires LevelRenderer.isPowerupLoadAnimationInProgress.");
    }
    return this.levelRenderer.isPowerupLoadAnimationInProgress();
  },

  _onAimStart: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchStart(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }
    if (this._isShooterHandoffInputLocked()) {
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var snapshot = this.gameManager.beginAim(localPoint);
    this._lastAimPlanRefreshTime = Date.now();
    this._lastAimRefreshPoint = {
      x: localPoint.x,
      y: localPoint.y
    };
    this._lastAimRefreshScreenPoint = {
      x: touchLocation.x,
      y: touchLocation.y
    };
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot, {
      scope: RUNTIME_REFRESH_SCOPE.SHOOTER_AIM
    });
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimMove: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchMove(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }
    if (this._isShooterHandoffInputLocked()) {
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var minDistance = Math.max(0, Number(this.aimRefreshMinDistance) || 0);
    var minIntervalMs = Math.max(0, Math.floor(Number(this.aimRefreshMinIntervalMs) || 0));
    var now = Date.now();
    var shouldRefreshByDistance = true;
    if (minDistance > 0 && this._lastAimRefreshScreenPoint) {
      var dx = touchLocation.x - this._lastAimRefreshScreenPoint.x;
      var dy = touchLocation.y - this._lastAimRefreshScreenPoint.y;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        shouldRefreshByDistance = false;
      }
    }
    var shouldRefreshByTime = true;
    if (minIntervalMs > 0 && this._lastAimPlanRefreshTime) {
      shouldRefreshByTime = (now - this._lastAimPlanRefreshTime) >= minIntervalMs;
    }
    var shouldRefreshPlan = shouldRefreshByDistance && shouldRefreshByTime;

    var snapshot = this.gameManager.isAiming
      ? this.gameManager.setAim(localPoint)
      : this.gameManager.beginAim(localPoint);

    if (shouldRefreshPlan) {
      this._lastAimPlanRefreshTime = now;
    }

    if (shouldRefreshPlan || !this._lastAimRefreshScreenPoint) {
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot, {
      scope: shouldRefreshPlan
        ? RUNTIME_REFRESH_SCOPE.SHOOTER_AIM
        : RUNTIME_REFRESH_SCOPE.SHOOTER_AIM_ANGLE
    });
    if (shouldRefreshPlan) {
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
    }
  },

  _onFireTouch: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = this.node.convertToNodeSpaceAR(touchLocation);
    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchEnd(localPoint);
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      this._handleBarrierHammerTargetTouch(localPoint);
      return;
    }
    if (this._isShooterHandoffInputLocked()) {
      return;
    }
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    if (!this.gameManager.isAiming) {
      this.gameManager.beginAim(localPoint);
      this._lastAimRefreshPoint = {
        x: localPoint.x,
        y: localPoint.y
      };
      this._lastAimRefreshScreenPoint = {
        x: touchLocation.x,
        y: touchLocation.y
      };
    }
    var shotsBeforeFire = Math.max(0, Number(this.gameManager.remainingShots) || 0);
    var snapshot = this.gameManager.fireShot();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this._lastAimPlanRefreshTime = 0;
    if (snapshot && Math.max(0, Number(snapshot.remainingShots) || 0) < shotsBeforeFire) {
      this._playSfx("shot");
      this._completeNewUserGuide();
      this._completeActiveSkillPowerupFireGuide();
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._syncSkillPowerupGuideForRuntimeSnapshot(snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimCancel: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }

    if (this._isRouteEditorCapturingInput()) {
      this._handleRouteEditorTouchCancel();
      return;
    }
    if (this._isBarrierHammerTargeting()) {
      return;
    }

    var snapshot = this.gameManager.endAim();
    this._lastAimRefreshPoint = null;
    this._lastAimRefreshScreenPoint = null;
    this._lastAimPlanRefreshTime = 0;
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  }
};
