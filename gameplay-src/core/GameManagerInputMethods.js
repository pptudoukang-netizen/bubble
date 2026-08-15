"use strict";

function attachGameManagerInputMethods(GameManager, context) {
  var Logger = context.Logger;
  var buildActiveProjectile = context.buildActiveProjectile;
  var createEmptyResolution = context.createEmptyResolution;
  var isPowerupShotBall = context.isPowerupShotBall;

GameManager.prototype.setAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSpiritCocoonOpenings() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.systems.shooterController.setAimFromPoint(point);
  this._refreshShotPlan(false);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.beginAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSpiritCocoonOpenings() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.isAiming = true;
  if (point) {
    this.systems.shooterController.setAimFromPoint(point);
  }

  this._refreshShotPlan(true);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.endAim = function () {
  this.isAiming = false;
  this.pendingShotPlan = null;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.fireShot = function () {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSpiritCocoonOpenings() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
    this._showOutOfShotsAddBallPrompt();
    return this.getRuntimeSnapshot();
  }

  var shotPlan = this.pendingShotPlan;
  var wormholeAbsorptionAllowed = function (plan) {
    return !!(
      plan &&
      plan.valid &&
      plan.hitType === "wormhole" &&
      plan.absorbingWormhole &&
      !plan.targetCell
    );
  };
  var blackHoleAbsorptionAllowed = function (plan) {
    return !!(
      plan &&
      plan.valid &&
      plan.hitType === "black_hole" &&
      plan.absorbingBlackHole &&
      !plan.targetCell
    );
  };
  var rescueMissAllowed = function (plan) {
    return !!(
      plan &&
      plan.valid &&
      plan.hitType === "miss" &&
      this.systems.trappedSpriteRescueSystem.isActive()
    );
  }.bind(this);
  if (!shotPlan || !shotPlan.valid || (!shotPlan.targetCell && !rescueMissAllowed(shotPlan) && !wormholeAbsorptionAllowed(shotPlan) && !blackHoleAbsorptionAllowed(shotPlan))) {
    // 发射优先沿用当前幽灵球路线；仅在缺失时才临时重算。
    this._refreshShotPlan(true);
    shotPlan = this.pendingShotPlan;
  }
  if (!shotPlan || !shotPlan.valid || (!shotPlan.targetCell && !rescueMissAllowed(shotPlan) && !wormholeAbsorptionAllowed(shotPlan) && !blackHoleAbsorptionAllowed(shotPlan))) {
    Logger.warn("Missing valid shot plan, fire aborted");
    return this.getRuntimeSnapshot();
  }

  var currentBall = this.systems.shooterController.currentBall;
  var remainingShotsAfterFire = this.isTimedInfiniteShots
    ? 0
    : this.remainingShots - (isPowerupShotBall(currentBall) ? 0 : 1);
  var queueResult = this.systems.shooterController.advanceQueue(
    remainingShotsAfterFire,
    this.isTimedInfiniteShots
  );
  this.systems.shooterController.resetAimDirection();

  if (!this.isTimedInfiniteShots) {
    this.remainingShots = remainingShotsAfterFire;
  }
  this.shotsFired += 1;
  this._resolveAssistSpiritProducedBallAfterFire();
  this.lastFiredColor = queueResult.firedColor;
  this.lastResolution = createEmptyResolution();
  this.lastResolution.spiritMistCleared = this.systems.bubbleGrid.clearExpiredSpiritMist(this.shotsFired);
  this.activeProjectile = buildActiveProjectile(queueResult.firedBall, shotPlan);
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;

  Logger.info("Shot fired", queueResult.firedColor, "remaining", this.remainingShots, "bounce", shotPlan.wallBounceCount);
  return this.getRuntimeSnapshot(this._drainRuntimeEvents());
};
}

module.exports = attachGameManagerInputMethods;
