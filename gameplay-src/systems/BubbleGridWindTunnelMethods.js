"use strict";

var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

function attachBubbleGridWindTunnelMethods(BubbleGrid, context) {
  var clone = context.clone;
  var keyFor = context.keyFor;

  function isWindTunnelExit(cell) {
    return !!(
      cell &&
      cell.entityCategory === "reactive_ball" &&
      cell.entityType === "wind_tunnel_exit"
    );
  }

  function requireWindTunnelTiming() {
    var timing = SpecialAnimationTiming.windTunnel;
    if (
      !timing ||
      !Number.isFinite(timing.activeExitSwitchInterval) ||
      timing.activeExitSwitchInterval <= 0 ||
      !Number.isFinite(timing.entranceDisappearFrameDuration) ||
      timing.entranceDisappearFrameDuration <= 0 ||
      !Number.isInteger(timing.entranceDisappearFrameCount) ||
      timing.entranceDisappearFrameCount !== 5 ||
      !Number.isFinite(timing.entranceDisappearDuration) ||
      timing.entranceDisappearDuration !== timing.entranceDisappearFrameDuration * timing.entranceDisappearFrameCount
    ) {
      throw new Error("SpecialAnimationTiming.windTunnel is invalid.");
    }
    return timing;
  }

  BubbleGrid.prototype._initializeWindTunnelState = function () {
    var entrances = this.specialEntities.filter(function (entity) {
      return entity && entity.entityCategory === "reactive_ball" && entity.entityType === "wind_tunnel_entrance";
    });
    if (entrances.length > 1) {
      throw new Error("BubbleGrid wind tunnel requires at most one entrance.");
    }
    this._windTunnelEntrance = entrances.length ? clone(entrances[0]) : null;
    this._closingWindTunnelEntrance = null;
    this._activeWindTunnelExitId = null;
    this._windTunnelExitSwitchElapsed = 0;
    var exits = this.getWindTunnelExits();
    if (this._windTunnelEntrance && exits.length < 2) {
      throw new Error("BubbleGrid wind tunnel entrance requires at least two exits.");
    }
    if (!this._windTunnelEntrance && exits.length) {
      throw new Error("BubbleGrid wind tunnel exits require one entrance.");
    }
    if (exits.length) {
      this._activeWindTunnelExitId = exits[0].id;
    }
  };

  BubbleGrid.prototype.getWindTunnelEntrance = function () {
    return this._windTunnelEntrance ? clone(this._windTunnelEntrance) : null;
  };

  BubbleGrid.prototype.getClosingWindTunnelEntrance = function () {
    return this._closingWindTunnelEntrance ? clone(this._closingWindTunnelEntrance) : null;
  };

  BubbleGrid.prototype.getWindTunnelExits = function () {
    return Object.keys(this._specialCellMap).map(function (key) {
      return this._specialCellMap[key];
    }, this).filter(isWindTunnelExit).map(function (exit) {
      var snapshot = clone(exit);
      snapshot.traversable = true;
      snapshot.active = snapshot.id === this._activeWindTunnelExitId;
      return snapshot;
    }, this).sort(function (left, right) {
      if (left.row !== right.row) {
        return left.row - right.row;
      }
      if (left.col !== right.col) {
        return left.col - right.col;
      }
      return String(left.id) < String(right.id) ? -1 : 1;
    });
  };

  BubbleGrid.prototype.hasWindTunnelExitAt = function (row, col) {
    return isWindTunnelExit(this._specialCellMap[keyFor(row, col)]);
  };

  BubbleGrid.prototype.getActiveWindTunnelExit = function () {
    var activeId = this._activeWindTunnelExitId;
    if (activeId === null) {
      return null;
    }
    var active = this.getWindTunnelExits().filter(function (exit) {
      return exit.id === activeId;
    });
    if (active.length !== 1) {
      throw new Error("BubbleGrid active wind tunnel exit is not live: " + activeId + ".");
    }
    return active[0];
  };

  BubbleGrid.prototype._selectWindTunnelExitByIndex = function (exitIndex) {
    var exits = this.getWindTunnelExits();
    if (!Number.isInteger(exitIndex) || exitIndex < 0 || exitIndex >= exits.length) {
      throw new Error("BubbleGrid wind tunnel exit index is invalid.");
    }
    this._activeWindTunnelExitId = exits[exitIndex].id;
    this._windTunnelExitSwitchElapsed = 0;
  };

  BubbleGrid.prototype._syncWindTunnelAfterExitRemoval = function () {
    var exits = this.getWindTunnelExits();
    if (!exits.length) {
      this._activeWindTunnelExitId = null;
      this._windTunnelExitSwitchElapsed = 0;
      if (this._windTunnelEntrance) {
        var closing = clone(this._windTunnelEntrance);
        closing.closing = true;
        closing.closingElapsed = 0;
        closing.closingFrameIndex = 0;
        this._closingWindTunnelEntrance = closing;
        this._windTunnelEntrance = null;
      }
      return;
    }
    var activeStillLive = exits.some(function (exit) {
      return exit.id === this._activeWindTunnelExitId;
    }, this);
    if (!activeStillLive) {
      this._selectWindTunnelExitByIndex(0);
    }
  };

  BubbleGrid.prototype.blockWindTunnelExitAt = function (row, col) {
    var key = keyFor(row, col);
    var exit = this._specialCellMap[key];
    if (!isWindTunnelExit(exit)) {
      throw new Error("BubbleGrid wind tunnel block target must be a live exit at " + key + ".");
    }
    var removed = clone(exit);
    removed.traversable = true;
    removed.active = removed.id === this._activeWindTunnelExitId;
    delete this._specialCellMap[key];
    this._setCell(row, col, ".");
    this._syncWindTunnelAfterExitRemoval();
    this.version += 1;
    this._rebuildCaches();
    this.assertNoVisualOverlap("block wind tunnel exit");
    if (this._cellRemovalListener) {
      this._cellRemovalListener([removed], "wind_tunnel_block");
    }
    return removed;
  };

  BubbleGrid.prototype.updateWindTunnel = function (dt, randomValueProvider, paused) {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error("BubbleGrid.updateWindTunnel requires non-negative finite dt.");
    }
    if (typeof randomValueProvider !== "function") {
      throw new Error("BubbleGrid.updateWindTunnel requires randomValueProvider.");
    }
    if (typeof paused !== "boolean") {
      throw new Error("BubbleGrid.updateWindTunnel requires paused boolean.");
    }
    var timing = requireWindTunnelTiming();
    var changed = false;

    if (this._closingWindTunnelEntrance) {
      var previousFrameIndex = this._closingWindTunnelEntrance.closingFrameIndex;
      this._closingWindTunnelEntrance.closingElapsed += dt;
      if (this._closingWindTunnelEntrance.closingElapsed >= timing.entranceDisappearDuration) {
        this._closingWindTunnelEntrance = null;
        changed = true;
      } else {
        this._closingWindTunnelEntrance.closingFrameIndex = Math.min(
          timing.entranceDisappearFrameCount - 1,
          Math.floor(this._closingWindTunnelEntrance.closingElapsed / timing.entranceDisappearFrameDuration)
        );
        changed = this._closingWindTunnelEntrance.closingFrameIndex !== previousFrameIndex;
      }
    }

    var exits = this.getWindTunnelExits();
    if (!paused && this._windTunnelEntrance && exits.length > 1) {
      this._windTunnelExitSwitchElapsed += dt;
      if (this._windTunnelExitSwitchElapsed >= timing.activeExitSwitchInterval) {
        var randomValue = randomValueProvider();
        if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
          throw new Error("Wind tunnel random value must be in [0, 1).");
        }
        var currentIndex = exits.findIndex(function (exit) {
          return exit.id === this._activeWindTunnelExitId;
        }, this);
        if (currentIndex < 0) {
          throw new Error("Wind tunnel active exit disappeared before timed switch.");
        }
        var nextOffset = 1 + Math.floor(randomValue * (exits.length - 1));
        this._selectWindTunnelExitByIndex((currentIndex + nextOffset) % exits.length);
        changed = true;
      }
    }

    if (changed) {
      this.version += 1;
    }
    return changed;
  };
}

module.exports = attachBubbleGridWindTunnelMethods;
