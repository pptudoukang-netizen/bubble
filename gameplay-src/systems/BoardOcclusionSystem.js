"use strict";

var BaseSystem = require("./BaseSystem");
var BoardOcclusionConfig = require("../../assets/scripts/config/BoardOcclusionConfig");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function BoardOcclusionSystem() {
  BaseSystem.call(this, "BoardOcclusionSystem");
  this.plan = BoardOcclusionConfig.createNonePlan();
  this.variantId = null;
  this.selectionSeed = null;
  this.activeZones = [];
  this.version = 0;
}

BoardOcclusionSystem.prototype = Object.create(BaseSystem.prototype);
BoardOcclusionSystem.prototype.constructor = BoardOcclusionSystem;

BoardOcclusionSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level) {
    throw new Error("BoardOcclusionSystem requires level config.");
  }
  this.plan = BoardOcclusionConfig.normalizePlan(
    levelConfig.level.boardOcclusionPlan,
    levelConfig.level,
    levelConfig.meta && levelConfig.meta.resourceKey ? levelConfig.meta.resourceKey : levelConfig.level.code
  );
  this.variantId = null;
  this.selectionSeed = null;
  this.activeZones = [];
  this.version += 1;
  return this;
};

BoardOcclusionSystem.prototype.startRun = function (startContext) {
  requireObject(startContext, "Board occlusion startContext");
  if (typeof startContext.seed !== "string" || !startContext.seed) {
    throw new Error("Board occlusion startContext.seed must be a non-empty string.");
  }
  if (!Number.isInteger(startContext.attemptIndex) || startContext.attemptIndex <= 0) {
    throw new Error("Board occlusion startContext.attemptIndex must be a positive integer.");
  }
  if (typeof startContext.runMode !== "string" || !startContext.runMode) {
    throw new Error("Board occlusion startContext.runMode must be a non-empty string.");
  }

  this.selectionSeed = startContext.seed;
  if (this.plan.mode === BoardOcclusionConfig.MODE_NONE) {
    this.variantId = null;
    this.activeZones = [];
    this.version += 1;
    return this.snapshotForRender();
  }

  var variantIndex;
  if (this.plan.mode === BoardOcclusionConfig.MODE_PER_ATTEMPT) {
    var baseOffset = BoardOcclusionConfig.hashString(
      this.selectionSeed.split(":attempt:")[0] + ":" + this.plan.generatorVersion
    ) % this.plan.variants.length;
    variantIndex = (baseOffset + startContext.attemptIndex - 1) % this.plan.variants.length;
  } else if (this.plan.mode === BoardOcclusionConfig.MODE_PER_RUN) {
    variantIndex = BoardOcclusionConfig.hashString(
      this.selectionSeed + ":" + this.plan.generatorVersion
    ) % this.plan.variants.length;
  } else {
    throw new Error("Unsupported board occlusion mode at run start: " + this.plan.mode);
  }

  var variant = this.plan.variants[variantIndex];
  if (!variant) {
    throw new Error("Board occlusion selected variant is missing at index " + variantIndex + ".");
  }
  this.variantId = variant.id;
  this.activeZones = variant.zones.map(function (zone) {
    var runtimeZone = clone(zone);
    runtimeZone.remainingShots = zone.clearRule.kind === "item_or_shots"
      ? zone.clearRule.shots
      : null;
    runtimeZone.remainingTimeMs = zone.clearRule.kind === "item_or_seconds"
      ? zone.clearRule.seconds * 1000
      : null;
    return runtimeZone;
  });
  this.version += 1;
  return this.snapshotForRender();
};

BoardOcclusionSystem.prototype.hasActiveZones = function () {
  return this.activeZones.length > 0;
};

BoardOcclusionSystem.prototype._removeExpiredZones = function () {
  var removed = [];
  this.activeZones = this.activeZones.filter(function (zone) {
    var expiredByShots = zone.remainingShots !== null && zone.remainingShots <= 0;
    var expiredByTime = zone.remainingTimeMs !== null && zone.remainingTimeMs <= 0;
    if (expiredByShots || expiredByTime) {
      removed.push(zone.id);
      return false;
    }
    return true;
  });
  if (removed.length) {
    this.version += 1;
  }
  return removed;
};

BoardOcclusionSystem.prototype.onShotFired = function () {
  var changed = false;
  this.activeZones.forEach(function (zone) {
    if (zone.remainingShots !== null) {
      zone.remainingShots -= 1;
      changed = true;
    }
  });
  if (changed) {
    this.version += 1;
  }
  return this._removeExpiredZones();
};

BoardOcclusionSystem.prototype.update = function (dt, paused) {
  if (typeof dt !== "number" || !isFinite(dt) || dt < 0) {
    throw new Error("BoardOcclusionSystem.update dt must be a non-negative finite number.");
  }
  if (typeof paused !== "boolean") {
    throw new Error("BoardOcclusionSystem.update paused must be boolean.");
  }
  if (paused || dt === 0 || !this.activeZones.length) {
    return [];
  }
  var changedBucket = false;
  this.activeZones.forEach(function (zone) {
    if (zone.remainingTimeMs === null) {
      return;
    }
    var previousBucket = Math.ceil(zone.remainingTimeMs / 1000);
    zone.remainingTimeMs = Math.max(0, zone.remainingTimeMs - dt * 1000);
    var nextBucket = Math.ceil(zone.remainingTimeMs / 1000);
    if (previousBucket !== nextBucket) {
      changedBucket = true;
    }
  });
  if (changedBucket) {
    this.version += 1;
  }
  return this._removeExpiredZones();
};

BoardOcclusionSystem.prototype.clearAllWithItem = function () {
  if (!this.activeZones.length) {
    return [];
  }
  var removed = this.activeZones.map(function (zone) {
    return zone.id;
  });
  this.activeZones = [];
  this.version += 1;
  return removed;
};

BoardOcclusionSystem.prototype.snapshotForRender = function () {
  return {
    version: this.version,
    mode: this.plan.mode,
    variantId: this.variantId,
    selectionSeed: this.selectionSeed,
    activeZones: this.activeZones.map(function (zone) {
      return {
        id: zone.id,
        visualType: zone.visualType,
        cells: clone(zone.cells),
        clearRule: clone(zone.clearRule),
        remainingShots: zone.remainingShots,
        remainingTimeMs: zone.remainingTimeMs
      };
    })
  };
};

BoardOcclusionSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.plan = clone(this.plan);
  snapshot.runtime = this.snapshotForRender();
  return snapshot;
};

module.exports = BoardOcclusionSystem;
