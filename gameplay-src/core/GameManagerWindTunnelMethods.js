"use strict";

function attachGameManagerWindTunnelMethods(GameManager, context) {
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var clone = context.clone;
  var lerpPoint = context.lerpPoint;

  function requireTransitDirection(direction) {
    if (
      !direction ||
      !Number.isFinite(direction.x) ||
      !Number.isFinite(direction.y)
    ) {
      throw new Error("Wind tunnel transit requires a finite entry direction.");
    }
    var length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error("Wind tunnel transit entry direction must be non-zero.");
    }
    return {
      x: direction.x / length,
      y: direction.y / length
    };
  }

  function requireTransitTiming() {
    var timing = SpecialAnimationTiming.windTunnel;
    if (
      !timing ||
      !Number.isFinite(timing.inhaleDuration) || timing.inhaleDuration <= 0 ||
      !Number.isFinite(timing.exhaleDuration) || timing.exhaleDuration <= 0
    ) {
      throw new Error("SpecialAnimationTiming.windTunnel transit timing is invalid.");
    }
    return timing;
  }

  GameManager.prototype._beginWindTunnelTransit = function (projectile, grid) {
    if (!projectile || !projectile.shotPlan || projectile.shotPlan.hitType !== "wind_tunnel") {
      throw new Error("Wind tunnel transit requires a wind_tunnel shot plan.");
    }
    if (projectile.windTunnelTransit) {
      throw new Error("Wind tunnel transit cannot begin twice.");
    }
    var entrance = grid.getWindTunnelEntrance();
    var activeExit = grid.getActiveWindTunnelExit();
    if (!entrance || !activeExit) {
      throw new Error("Wind tunnel transit requires one live entrance and one active exit.");
    }
    if (
      !projectile.shotPlan.windTunnelEntrance ||
      projectile.shotPlan.windTunnelEntrance.id !== entrance.id
    ) {
      throw new Error("Wind tunnel entrance changed before projectile arrival.");
    }
    var entrancePosition = grid.getCellPosition(entrance.row, entrance.col);
    var exitPosition = grid.getCellPosition(activeExit.row, activeExit.col);
    var entryDirection = requireTransitDirection(projectile.shotPlan.impactDirection);
    projectile.windTunnelTransit = {
      phase: "inhale",
      elapsed: 0,
      startPosition: clone(projectile.position),
      direction: entryDirection,
      entrance: {
        id: entrance.id,
        row: entrance.row,
        col: entrance.col,
        position: entrancePosition
      },
      exit: {
        id: activeExit.id,
        row: activeExit.row,
        col: activeExit.col,
        position: exitPosition
      }
    };
    projectile.scale = 1;
    this.pendingProjectileFinalize = false;
    this._pushRuntimeEvent("wind_tunnel_projectile_entered", {
      entranceId: entrance.id,
      entranceRow: entrance.row,
      entranceCol: entrance.col,
      exitId: activeExit.id,
      exitRow: activeExit.row,
      exitCol: activeExit.col
    });
  };

  GameManager.prototype._beginWindTunnelTransitIfPlanned = function (projectile, grid) {
    if (!projectile || !projectile.shotPlan || projectile.shotPlan.hitType !== "wind_tunnel") {
      return false;
    }
    this._beginWindTunnelTransit(projectile, grid);
    return true;
  };

  GameManager.prototype._blockPlannedWindTunnelExit = function (projectile, grid, targetCell) {
    if (!projectile || !projectile.shotPlan) {
      return null;
    }
    var exitTarget = projectile.shotPlan.windTunnelDestinationExit ||
      projectile.shotPlan.windTunnelExitAttachmentTarget ||
      null;
    if (!exitTarget) {
      return null;
    }
    if (!targetCell || targetCell.row !== exitTarget.row || targetCell.col !== exitTarget.col) {
      throw new Error("Wind tunnel exit attachment target changed before finalization.");
    }
    var liveExit = grid.getCell(targetCell.row, targetCell.col);
    if (!liveExit || liveExit.entityType !== "wind_tunnel_exit" || liveExit.id !== exitTarget.id) {
      throw new Error("Wind tunnel exit attachment target is no longer live.");
    }
    return grid.blockWindTunnelExitAt(targetCell.row, targetCell.col);
  };

  GameManager.prototype._appendWindTunnelShotResolution = function (projectile, blockedExit, grid) {
    if (projectile.windTunnelTransitRecord) {
      this.lastResolution.windTunnelTransits.push(clone(projectile.windTunnelTransitRecord));
    }
    if (!blockedExit) {
      return;
    }
    this.lastResolution.windTunnelExitsRemoved.push(clone(blockedExit));
    this.lastResolution.windTunnelEntranceClosed = !!(
      !grid.getWindTunnelEntrance() && grid.getClosingWindTunnelEntrance()
    );
  };

  GameManager.prototype._updateWindTunnelTransit = function (dt) {
    var projectile = this.activeProjectile;
    if (!projectile || !projectile.windTunnelTransit) {
      return false;
    }
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error("Wind tunnel transit update requires non-negative finite dt.");
    }
    var timing = requireTransitTiming();
    var transit = projectile.windTunnelTransit;
    var remaining = dt;
    while (remaining > 0 && projectile.windTunnelTransit) {
      var duration = transit.phase === "inhale" ? timing.inhaleDuration : timing.exhaleDuration;
      var phaseRemaining = duration - transit.elapsed;
      var step = Math.min(remaining, phaseRemaining);
      transit.elapsed += step;
      remaining -= step;
      var progress = Math.min(1, transit.elapsed / duration);
      if (transit.phase === "inhale") {
        projectile.position = lerpPoint(transit.startPosition, transit.entrance.position, progress);
        projectile.scale = 1 - progress;
      } else if (transit.phase === "exhale") {
        projectile.position = clone(transit.exit.position);
        projectile.scale = progress;
      } else {
        throw new Error("Wind tunnel transit phase is invalid: " + transit.phase + ".");
      }
      if (progress < 1) {
        continue;
      }
      if (transit.phase === "inhale") {
        transit.phase = "exhale";
        transit.elapsed = 0;
        projectile.position = clone(transit.exit.position);
        projectile.scale = 0;
        this._pushRuntimeEvent("wind_tunnel_projectile_exited", {
          entranceId: transit.entrance.id,
          entranceRow: transit.entrance.row,
          entranceCol: transit.entrance.col,
          exitId: transit.exit.id,
          exitRow: transit.exit.row,
          exitCol: transit.exit.col
        });
        continue;
      }
      var completedTransit = clone(transit);
      if (!Array.isArray(projectile.shotPlan.penetratedTransparentBalls)) {
        throw new Error("Wind tunnel entry shot plan requires penetratedTransparentBalls array.");
      }
      if (
        !this.systems ||
        !this.systems.trajectoryPredictor ||
        typeof this.systems.trajectoryPredictor.predictShotPlan !== "function"
      ) {
        throw new Error("Wind tunnel exit continuation requires TrajectoryPredictor.");
      }
      if (typeof this._completeAuthoritativeShotPlan !== "function") {
        throw new Error("Wind tunnel exit continuation requires authoritative shot plan completion.");
      }
      var entryTransparentBalls = clone(projectile.shotPlan.penetratedTransparentBalls);
      var continuationPlan = this.systems.trajectoryPredictor.predictShotPlan(
        this.systems.bubbleGrid,
        transit.exit.position,
        transit.direction
      );
      if (!continuationPlan || continuationPlan.valid !== true) {
        throw new Error("Wind tunnel exit continuation did not produce a valid shot plan.");
      }
      this._completeAuthoritativeShotPlan(continuationPlan, this.systems.bubbleGrid);
      continuationPlan.penetratedTransparentBalls = entryTransparentBalls.concat(
        continuationPlan.penetratedTransparentBalls
      );
      projectile.position = clone(transit.exit.position);
      projectile.scale = 1;
      projectile.targetCell = continuationPlan.targetCell ? clone(continuationPlan.targetCell) : null;
      projectile.shotPlan = clone(continuationPlan);
      projectile.pathPoints = clone(continuationPlan.pathPoints);
      projectile.segmentIndex = 0;
      projectile.segmentProgress = 0;
      projectile.windTunnelTransitRecord = {
        entranceId: completedTransit.entrance.id,
        entranceRow: completedTransit.entrance.row,
        entranceCol: completedTransit.entrance.col,
        exitId: completedTransit.exit.id,
        exitRow: completedTransit.exit.row,
        exitCol: completedTransit.exit.col,
        direction: clone(completedTransit.direction),
        inhaleDuration: timing.inhaleDuration,
        exhaleDuration: timing.exhaleDuration
      };
      projectile.windTunnelTransit = null;
      this.pendingProjectileFinalize = false;
    }
    return true;
  };
}

module.exports = attachGameManagerWindTunnelMethods;
