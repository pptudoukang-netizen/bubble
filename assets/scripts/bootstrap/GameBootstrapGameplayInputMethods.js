"use strict";

var Shared = require("./GameBootstrapShared");
var BoardLayout = Shared.BoardLayout;

module.exports = {
  update: function (dt) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var snapshot = this.gameManager.update(dt);
    if (!snapshot) {
      return;
    }

    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    if (!snapshot.activeProjectile) {
      this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
    }
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

  _onAimStart: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
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
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var snapshot = this.gameManager.beginAim(localPoint);
    this._lastAimRefreshPoint = {
      x: localPoint.x,
      y: localPoint.y
    };
    this._lastAimRefreshScreenPoint = {
      x: touchLocation.x,
      y: touchLocation.y
    };
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimMove: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
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
    if (!this._isShotTouchPointValid(localPoint)) {
      return;
    }

    var minDistance = Math.max(0, Number(this.aimRefreshMinDistance) || 0);
    var shouldRefreshPlan = true;
    if (minDistance > 0 && this._lastAimRefreshScreenPoint) {
      var dx = touchLocation.x - this._lastAimRefreshScreenPoint.x;
      var dy = touchLocation.y - this._lastAimRefreshScreenPoint.y;
      if (dx * dx + dy * dy < minDistance * minDistance) {
        shouldRefreshPlan = false;
      }
    }

    var snapshot = this.gameManager.isAiming
      ? this.gameManager.setAim(localPoint, { skipPlanRefresh: !shouldRefreshPlan })
      : this.gameManager.beginAim(localPoint);

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
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onFireTouch: function (event) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
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
    if (snapshot && Math.max(0, Number(snapshot.remainingShots) || 0) < shotsBeforeFire) {
      this._playSfx("shot");
      this._completeNewUserGuide();
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._playRuntimeAudioEvents(snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAimCancel: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
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
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  }
};
