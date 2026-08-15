"use strict";

function attachGameManagerAdPowerupMethods(GameManager, context) {
  var ADD_BALL_PROMPT_STATE = context.ADD_BALL_PROMPT_STATE;
  var AD_RUN_POWERUP_TYPES = context.AD_RUN_POWERUP_TYPES;
  var PLUS_THREE_BALLS_AMOUNT = context.PLUS_THREE_BALLS_AMOUNT;
  var ShooterController = context.ShooterController;
  var assertPositiveInteger = context.assertPositiveInteger;
  var createEmptyResolution = context.createEmptyResolution;
  var readRunPowerupCount = context.readRunPowerupCount;

GameManager.prototype.grantPowerupInventory = function (powerupType, count) {
  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.addInventory !== "function") {
    return {
      accepted: false,
      reason: "inventory_system_unavailable",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grantResult = shooterController.addInventory(powerupType, count);
  if (!grantResult || !grantResult.accepted) {
    return {
      accepted: false,
      reason: grantResult && grantResult.reason ? grantResult.reason : "inventory_grant_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    powerupType: grantResult.entityType,
    gained: grantResult.gained,
    total: grantResult.total,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._isInstantAdPowerupBusy = function () {
  var canUseInstantPowerup = this.state === "running" || this.state === ADD_BALL_PROMPT_STATE;
  return !!(
    !canUseInstantPowerup ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSpiritCocoonOpenings() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection ||
    this.systems.fallingMarbleSystem.hasActiveDrops()
  );
};

GameManager.prototype._getAdPowerupRules = function () {
  var level = this.currentLevel && this.currentLevel.level ? this.currentLevel.level : null;
  return level && level.adPowerupRules ? level.adPowerupRules : null;
};

GameManager.prototype._isAdRunPowerupAllowed = function (powerupType) {
  if (AD_RUN_POWERUP_TYPES[powerupType] !== true) {
    throw new Error("Unsupported ad run powerup type: " + powerupType);
  }

  var rules = this._getAdPowerupRules();
  if (!rules || !Array.isArray(rules.allowed)) {
    return false;
  }
  return rules.allowed.indexOf(powerupType) >= 0;
};

GameManager.prototype.grantAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Ad run powerup grant count");
  var granted = readRunPowerupCount(this.adRunPowerupGrantCounts, powerupType);
  this.adRunPowerupGrantCounts[powerupType] = granted + safeCount;
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.grantPreparedAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Prepared ad run powerup grant count");
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.activateRicochetGuide = function () {
  if (this.ricochetGuideActive === true) {
    throw new Error("Ricochet guide is already active for this attempt.");
  }
  this.ricochetGuideActive = true;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.usePreciseAim = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this.ricochetGuideActive === true) {
    return {
      accepted: false,
      reason: "already_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.consumePreciseAim !== "function") {
    throw new Error("Precise aim requires ShooterController.consumePreciseAim.");
  }

  var consumeResult = shooterController.consumePreciseAim();
  if (!consumeResult || typeof consumeResult !== "object") {
    throw new Error("Precise aim consume result must be an object.");
  }
  if (consumeResult.accepted !== true) {
    if (typeof consumeResult.reason !== "string" || !consumeResult.reason) {
      throw new Error("Precise aim consume failure requires reason.");
    }
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.activateRicochetGuide();
  this._pushRuntimeEvent("powerup_precise_aim", {
    remaining: consumeResult.remaining
  });
  return {
    accepted: true,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._consumeAdRunPowerup = function (powerupType) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed"
    };
  }

  var current = readRunPowerupCount(this.adRunPowerupInventory, powerupType);
  if (current <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.adRunPowerupInventory[powerupType] = current - 1;
  return {
    accepted: true,
    remaining: this.adRunPowerupInventory[powerupType]
  };
};

GameManager.prototype.usePlusThreeBalls = function () {
  if (this.isTimedInfiniteShots) {
    return {
      accepted: false,
      reason: "timed_infinite_shots",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var consumeResult = this._consumeAdRunPowerup("plus_three_balls");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.remainingShots += PLUS_THREE_BALLS_AMOUNT;
  var queueResult = this.systems.shooterController.syncFiniteShotQueue(this.remainingShots);
  if (!queueResult || queueResult.accepted !== true) {
    throw new Error("Plus three balls failed to sync shooter queue.");
  }
  this.state = "running";
  this._pushRuntimeEvent("ad_powerup_plus_three_balls", {
    amount: PLUS_THREE_BALLS_AMOUNT,
    remaining_shots: this.remainingShots
  });
  return {
    accepted: true,
    added: PLUS_THREE_BALLS_AMOUNT,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.previewThreeLineElimination = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (!this._isAdRunPowerupAllowed("three_line_elimination")) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (readRunPowerupCount(this.adRunPowerupInventory, "three_line_elimination") <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var cells = grid.getCells();
  if (!cells.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var rowsByIndex = {};
  cells.forEach(function (cell) {
    rowsByIndex[cell.row] = true;
  });
  var rows = Object.keys(rowsByIndex).map(function (row) {
    return Number(row);
  }).sort(function (a, b) {
    return b - a;
  }).slice(0, 3);
  if (!rows.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  return {
    accepted: true,
    rows: rows.map(function (row) {
      return {
        row: row,
        y: grid.getCellPosition(row, 0).y
      };
    }),
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useThreeLineElimination = function (expectedRows) {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var preview = this.previewThreeLineElimination();
  if (!preview.accepted) {
    return preview;
  }

  if (Array.isArray(expectedRows)) {
    var expectedKey = expectedRows.map(function (entry) {
      return typeof entry === "number" ? entry : entry.row;
    }).sort().join(",");
    var actualKey = preview.rows.map(function (entry) {
      return entry.row;
    }).sort().join(",");
    if (expectedKey !== actualKey) {
      throw new Error("Three-line elimination rows changed before resolution.");
    }
  }

  var consumeResult = this._consumeAdRunPowerup("three_line_elimination");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var targetRows = preview.rows.map(function (entry) {
    return entry.row;
  });
  var targetRowMap = {};
  targetRows.forEach(function (row) {
    targetRowMap[row] = true;
  });

  var lineCells = grid.getCells().filter(function (cell) {
    return targetRowMap[cell.row] === true;
  });
  var resolution = createEmptyResolution();
  lineCells = this._unloadBlackHolesHitByRange(lineCells, grid, resolution, "three_line_elimination");
  var removedLineCells = grid.removeCells(lineCells);
  this._pushBubbleBreakEvent(removedLineCells);
  resolution.matched = removedLineCells;
  this._resolveVinesAfterRemoval(removedLineCells, grid, resolution);
  this._collectRemovedKeysAndResolveUnlocks(removedLineCells, grid, resolution);
  this._registerMatchedObjectiveCollection(removedLineCells, resolution.eliminationSequence, resolution, grid);
  if (removedLineCells.length) {
    resolution.impact = this._createImpactEventFromCell(removedLineCells[0]);
  }

  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeFloatingCells(floatingCells);
  this._appendUniqueCells(resolution.floating, removedFloating);
  this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
  var fallingCandidates = removedLineCells.concat(resolution.floating);
  this._registerResolutionDrops(fallingCandidates, grid, resolution, undefined, {
    matchedCellsForDelay: removedLineCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.collected = fallingCandidates;
  resolution.boardCleared = this._isBoardCleared(grid);
  this.lastResolution = resolution;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  this._pushRuntimeEvent("ad_powerup_three_line_elimination", {
    rows: targetRows.slice(),
    removed: removedLineCells.length,
    floating: removedFloating.length,
    ice_collected: resolution.iceCollected
  });

  return {
    accepted: true,
    rows: preview.rows,
    removed: removedLineCells.length,
    floating: removedFloating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};
}

module.exports = attachGameManagerAdPowerupMethods;
