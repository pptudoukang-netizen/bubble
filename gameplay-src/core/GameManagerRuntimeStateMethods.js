"use strict";

function attachGameManagerRuntimeStateMethods(GameManager, context) {
  var ADD_BALL_PROMPT_STATE = context.ADD_BALL_PROMPT_STATE;
  var AssistSpiritSkillChargeConfig = context.AssistSpiritSkillChargeConfig;
  var AssistSpiritSkillConfig = context.AssistSpiritSkillConfig;
  var BoardViewportSystem = context.BoardViewportSystem;
  var BubbleGrid = context.BubbleGrid;
  var DEFAULT_JAR_SCORE_BOOST_DURATION_MS = context.DEFAULT_JAR_SCORE_BOOST_DURATION_MS;
  var DEFAULT_JAR_SCORE_BOOST_MULTIPLIER = context.DEFAULT_JAR_SCORE_BOOST_MULTIPLIER;
  var assertFiniteNumber = context.assertFiniteNumber;
  var assertPositiveInteger = context.assertPositiveInteger;
  var buildBubbleBreakShatterDelaysMs = context.buildBubbleBreakShatterDelaysMs;
  var buildIceSnowballCollectEntry = context.buildIceSnowballCollectEntry;
  var calculateStarRating = context.calculateStarRating;
  var findPrimaryCollectionObjective = context.findPrimaryCollectionObjective;
  var isIceBall = context.isIceBall;
  var listCollectionRewardObjectives = context.listCollectionRewardObjectives;
  var resolveIceInnerColor = context.resolveIceInnerColor;

GameManager.prototype._clearJarScoreBoost = function () {
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
};

GameManager.prototype.activateJarScoreBoost = function (options) {
  options = options || {};
  var multiplier = Math.max(
    1,
    Number(options.multiplier || options.jarScoreBoostMultiplier) || DEFAULT_JAR_SCORE_BOOST_MULTIPLIER
  );
  var durationMs = Math.max(
    0,
    Math.floor(Number(options.durationMs || options.jarScoreBoostRemainingMs) || DEFAULT_JAR_SCORE_BOOST_DURATION_MS)
  );

  if (multiplier <= 1 || durationMs <= 0) {
    this._clearJarScoreBoost();
    return this.getRuntimeSnapshot();
  }

  this.jarScoreBoostActive = true;
  this.jarScoreBoostMultiplier = multiplier;
  this.jarScoreBoostRemainingMs = durationMs;
  this._pushRuntimeEvent("jar_score_boost_activated", {
    boost_multiplier: multiplier,
    remaining_ms: durationMs
  });
  return this.getRuntimeSnapshot(this._drainRuntimeEvents());
};

GameManager.prototype._updateJarScoreBoost = function (dt) {
  if (!this.jarScoreBoostActive) {
    return false;
  }

  var safeDtMs = Math.max(0, Number(dt) || 0) * 1000;
  if (safeDtMs <= 0) {
    return false;
  }

  var previousRemainingMs = this.jarScoreBoostRemainingMs;
  this.jarScoreBoostRemainingMs = Math.max(0, previousRemainingMs - safeDtMs);
  if (this.jarScoreBoostRemainingMs > 0) {
    return this.jarScoreBoostRemainingMs !== previousRemainingMs;
  }

  this._clearJarScoreBoost();
  this._pushRuntimeEvent("jar_score_boost_expired");
  return true;
};

GameManager.prototype._isBoardCleared = function (grid) {
  if (!grid || typeof grid.getCells !== "function") {
    throw new Error("Board cleared check requires BubbleGrid.getCells.");
  }
  var cells = grid.getCells();
  if (!Array.isArray(cells)) {
    throw new Error("Board cleared check requires BubbleGrid.getCells array.");
  }
  return cells.length === 0;
};

GameManager.prototype._resolveTrappedSpriteRescueBoardEmpty = function () {
  var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;
  if (!trappedSpriteRescueSystem.isActive()) {
    return false;
  }
  if (this.state !== "running" && this.state !== "out_of_shots_pending") {
    return false;
  }
  if (!this._isBoardCleared(this.systems.bubbleGrid)) {
    return false;
  }

  // A rescue clear is authoritative as soon as the support scan has removed the
  // final board cells. Do not depend on an individual resolution branch to report it.
  this._resolveBoardClearedOutcome();
  return true;
};

GameManager.prototype._resolveOutOfShotsOutcome = function () {
  if (this._isBoardCleared(this.systems.bubbleGrid)) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = "out_of_shots";
};

GameManager.prototype._showOutOfShotsAddBallPrompt = function () {
  if (this._isBoardCleared(this.systems.bubbleGrid)) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = ADD_BALL_PROMPT_STATE;
};

GameManager.prototype.confirmOutOfShotsAddBallPromptClosed = function () {
  if (this.state !== ADD_BALL_PROMPT_STATE) {
    throw new Error("Add ball prompt can only be closed from state: " + ADD_BALL_PROMPT_STATE);
  }

  this._resolveOutOfShotsOutcome();
  return this.getRuntimeSnapshot();
};

GameManager.prototype._pushBubbleBreakEvent = function (removedCells, eliminationSequence, chargeSource) {
  if (!Array.isArray(removedCells) || !removedCells.length) {
    return;
  }

  this._collectAssistSpiritSkillCharge(removedCells, chargeSource || "board_elimination");

  var shatterDelaysMs = buildBubbleBreakShatterDelaysMs(removedCells, eliminationSequence);
  if (!shatterDelaysMs.length) {
    return;
  }

  this._pushRuntimeEvent("bubble_break", {
    count: shatterDelaysMs.length,
    shatterDelaysMs: shatterDelaysMs
  });
};

GameManager.prototype._isGlobalAssistSpiritSkillEquipped = function () {
  if (typeof this.equippedAssistSpiritId !== "string" || !this.equippedAssistSpiritId) {
    return false;
  }
  return !!AssistSpiritSkillConfig.getBySpiritId(this.equippedAssistSpiritId).skillId;
};

GameManager.prototype._getAssistSpiritSkillChargeSnapshot = function () {
  if (!this._isGlobalAssistSpiritSkillEquipped()) {
    return {
      charge: 0,
      maxCharge: 0,
      isCharged: false
    };
  }
  var maxCharge = AssistSpiritSkillChargeConfig.getMaxCharge(
    this.equippedAssistSpiritId,
    this.equippedAssistSpiritLevel
  );
  if (!Number.isInteger(this.assistSpiritSkillCharge) || this.assistSpiritSkillCharge < 0 || this.assistSpiritSkillCharge > maxCharge) {
    throw new Error("Assist spirit skill charge is invalid.");
  }
  if (this.assistSpiritSkillChargeMax !== maxCharge) {
    throw new Error("Assist spirit skill charge max is inconsistent with config.");
  }
  return {
    charge: this.assistSpiritSkillCharge,
    maxCharge: maxCharge,
    isCharged: this.assistSpiritSkillCharge === maxCharge
  };
};

GameManager.prototype._collectAssistSpiritSkillCharge = function (removedCells, source) {
  if (!Array.isArray(removedCells)) {
    throw new Error("Assist spirit skill charge collection requires removedCells array.");
  }
  if (typeof source !== "string" || !source) {
    throw new Error("Assist spirit skill charge collection requires source.");
  }
  if (!this._isGlobalAssistSpiritSkillEquipped() || source === "assist_spirit_skill" || this.assistSpiritSkillChargeSuppressed === true) {
    return 0;
  }
  if (!this.assistSpiritSkillChargedCellIds || typeof this.assistSpiritSkillChargedCellIds !== "object" || Array.isArray(this.assistSpiritSkillChargedCellIds)) {
    throw new Error("Assist spirit skill charged cell ids must be an object.");
  }

  var chargeState = this._getAssistSpiritSkillChargeSnapshot();
  var gained = 0;
  removedCells.forEach(function (cell) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Assist spirit skill charge collection requires removed cell id.");
    }
    if (cell.entityCategory !== "normal_ball") {
      return;
    }
    var cellId = String(cell.id);
    if (this.assistSpiritSkillChargedCellIds[cellId] === true) {
      return;
    }
    this.assistSpiritSkillChargedCellIds[cellId] = true;
    gained += 1;
  }, this);

  if (gained <= 0 || chargeState.isCharged) {
    return 0;
  }
  var nextCharge = Math.min(chargeState.maxCharge, chargeState.charge + gained);
  var appliedGained = nextCharge - chargeState.charge;
  this.assistSpiritSkillCharge = nextCharge;
  this._pushRuntimeEvent("assist_spirit_skill_charge_changed", {
    source: source,
    gained_count: appliedGained,
    charge: nextCharge,
    charge_max: chargeState.maxCharge
  });
  if (nextCharge === chargeState.maxCharge) {
    this._pushRuntimeEvent("assist_spirit_skill_ready", {
      charge_max: chargeState.maxCharge
    });
  }
  return appliedGained;
};

GameManager.prototype._pushBombExplosionEvent = function () {
  this._pushRuntimeEvent("bomb_explosion", {});
};

GameManager.prototype._pushLockOpenEvent = function (unlockedCell) {
  if (!unlockedCell || (typeof unlockedCell.id !== "string" && typeof unlockedCell.id !== "number")) {
    throw new Error("Lock open sfx requires unlocked cell id.");
  }
  if (!Number.isInteger(unlockedCell.row) || !Number.isInteger(unlockedCell.col)) {
    throw new Error("Lock open sfx requires unlocked cell coordinates.");
  }

  this._pushRuntimeEvent("lock_open", {
    id: unlockedCell.id,
    row: unlockedCell.row,
    col: unlockedCell.col
  });
};

GameManager.prototype._pushRuntimeEvent = function (type, payload) {
  if (typeof type !== "string" || !type) {
    return;
  }

  this.runtimeEventSequence += 1;
  var eventData = {
    id: this.runtimeEventSequence,
    type: type
  };

  if (payload && typeof payload === "object") {
    Object.keys(payload).forEach(function (key) {
      eventData[key] = payload[key];
    });
  }

  this.pendingRuntimeEvents.push(eventData);
};

GameManager.prototype._pushFairyAssistDepartEvents = function (events) {
  if (!Array.isArray(events)) {
    throw new Error("Fairy assist depart events requires array.");
  }

  events.forEach(function (event) {
    if (!event || typeof event.type !== "string") {
      throw new Error("Fairy assist event requires type.");
    }
    if (event.type === "remove") {
      if (typeof event.fairyId !== "string" || !event.fairyId) {
        throw new Error("Fairy assist remove event requires fairyId.");
      }
      this._pushRuntimeEvent("fairy_assist_depart", {
        fairyId: event.fairyId,
        reason: "remove"
      });
      return;
    }
    if (event.type === "spawn") {
      if (typeof event.replacedFairyId === "string" && event.replacedFairyId) {
        this._pushRuntimeEvent("fairy_assist_depart", {
          fairyId: event.replacedFairyId,
          reason: "replace"
        });
      }
    }
  }, this);
};

GameManager.prototype._drainRuntimeEvents = function () {
  if (!Array.isArray(this.pendingRuntimeEvents) || !this.pendingRuntimeEvents.length) {
    return [];
  }

  var drained = this.pendingRuntimeEvents.slice();
  this.pendingRuntimeEvents.length = 0;
  return drained;
};

GameManager.prototype._getCachedBoardSnapshot = function () {
  var grid = this.systems.bubbleGrid;
  var viewportOffsetY = grid.getViewportOffsetY();
  if (
    !this.cachedBoardSnapshot ||
    this.cachedBoardVersion !== grid.version ||
    this.cachedBoardViewportOffsetY !== viewportOffsetY
  ) {
    this.cachedBoardSnapshot = grid.snapshot();
    this.cachedBoardVersion = grid.version;
    this.cachedBoardViewportOffsetY = viewportOffsetY;
  }
  return this.cachedBoardSnapshot;
};

GameManager.prototype.updateBoardViewportIntro = function (dt) {
  var safeDt = assertFiniteNumber(dt, "GameManager.updateBoardViewportIntro dt");
  if (safeDt < 0) {
    throw new Error("GameManager.updateBoardViewportIntro dt must be non-negative.");
  }
  var viewport = this.systems.boardViewportSystem;
  if (!viewport || typeof viewport.update !== "function") {
    throw new Error("GameManager.updateBoardViewportIntro requires BoardViewportSystem.");
  }
  if (!viewport.introActive && !viewport.isMoving()) {
    return null;
  }
  var viewportFinished = viewport.update(safeDt);
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  return this.getRuntimeSnapshot(this._drainRuntimeEvents(), { refreshScope: "full" });
};

GameManager.prototype._buildJarSnapshotKey = function () {
  var jars = this.systems.jarCollectorSystem;
  var colorKey = jars.jarColors.map(function (colorCode) {
    return colorCode + ":" + (jars.collectedByColor[colorCode] || 0);
  }).join(",");
  return [
    jars.collectedTotal,
    jars.objectiveTarget,
    colorKey,
    jars.lastCollected.length
  ].join("|");
};

GameManager.prototype._getCachedJarSnapshot = function () {
  var key = this._buildJarSnapshotKey();
  if (!this.cachedJarSnapshot || this.cachedJarSnapshotKey !== key) {
    this.cachedJarSnapshot = this.systems.jarCollectorSystem.snapshot();
    this.cachedJarSnapshotKey = key;
  }
  return this.cachedJarSnapshot;
};

GameManager.prototype._registerIceCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var iceObstacleCells = [];
  var thawEntries = [];

  cells.forEach(function (cell) {
    if (!cell) {
      return;
    }
    if (cell.entityCategory === "obstacle_ball" && cell.entityType === "ice") {
      iceObstacleCells.push(cell);
      return;
    }
    if (cell.entityCategory === "normal_ball") {
      if (typeof cell.color !== "string" || !cell.color) {
        throw new Error("Thawed ice snowball collection requires color.");
      }
      thawEntries.push(buildIceSnowballCollectEntry(cell, cell.color));
    }
  });

  var gained = this._registerIceSnowballCollection(iceObstacleCells);
  if (thawEntries.length) {
    this.iceCollectedTotal += thawEntries.length;
    if (this.lastResolution) {
      this.lastResolution.iceCollected += thawEntries.length;
    }
    gained += thawEntries.length;
    this._pushRuntimeEvent("ice_snowball_collect", {
      count: thawEntries.length,
      entries: thawEntries
    });
  }
  return gained;
};

GameManager.prototype._registerIceSnowballCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var gained = 0;
  var entries = [];
  cells.forEach(function (cell) {
    if (!(
      cell &&
      cell.entityCategory === "obstacle_ball" &&
      cell.entityType === "ice" &&
      cell.iceSnowballAlreadyCollected !== true
    )) {
      return;
    }

    var innerColor = cell.innerColor || resolveIceInnerColor(cell);
    entries.push(buildIceSnowballCollectEntry(cell, innerColor));
    cell.iceSnowballAlreadyCollected = true;
    gained += 1;
  });
  if (gained <= 0) {
    return 0;
  }

  this.iceCollectedTotal += gained;
  if (this.lastResolution) {
    this.lastResolution.iceCollected += gained;
  }
  this._pushRuntimeEvent("ice_snowball_collect", {
    count: gained,
    entries: entries
  });
  return gained;
};

GameManager.prototype._thawIceCellAtCurrentPosition = function (grid, targetCell) {
  if (!grid || typeof grid.addBubble !== "function") {
    throw new Error("Ice thaw requires BubbleGrid.addBubble.");
  }
  if (!isIceBall(targetCell)) {
    throw new Error("Ice thaw target must be an ice obstacle.");
  }
  var innerColor = resolveIceInnerColor(targetCell);
  if (!innerColor) {
    throw new Error("Ice thaw target requires innerColor.");
  }
  var thawedCell = grid.addBubble({
    row: targetCell.row,
    col: targetCell.col
  }, innerColor);
  if (!thawedCell || thawedCell.entityCategory !== "normal_ball" || thawedCell.color !== innerColor) {
    throw new Error("Ice thaw must replace obstacle with inner normal ball.");
  }
  return thawedCell;
};

GameManager.prototype._getPrimaryObjectiveProgressValue = function (objective, jarsSnapshot) {
  if (!objective || typeof objective.type !== "string") {
    return 0;
  }

  var jars = jarsSnapshot || this._getCachedJarSnapshot();
  if (objective.type === "collect_any") {
    return Math.max(0, Number(jars && jars.collectedTotal) || 0);
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : "";
    if (!colorCode) {
      return 0;
    }
    var byColor = jars && jars.collectedByColor ? jars.collectedByColor : {};
    return Math.max(0, Number(byColor[colorCode]) || 0);
  }

  if (objective.type === "collect_ice_snowball") {
    return Math.max(0, Number(this.iceCollectedTotal) || 0);
  }

  return 0;
};

GameManager.prototype._areCollectionRewardObjectivesCompleted = function () {
  var objectives = listCollectionRewardObjectives(this.currentLevel);
  if (!objectives.length) {
    return false;
  }

  var jarsSnapshot = this._getCachedJarSnapshot();
  if (!jarsSnapshot) {
    return false;
  }

  for (var index = 0; index < objectives.length; index += 1) {
    var objective = objectives[index];
    var target = assertPositiveInteger(objective.value, "Collection reward objective value");
    if (this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) < target) {
      return false;
    }
  }

  return true;
};

GameManager.prototype._hasRequiredStarRating = function () {
  var requiredStarCount = assertPositiveInteger(this.requiredStarCount, "GameManager.requiredStarCount");
  if (requiredStarCount !== 1) {
    throw new Error("Clear win requires requiredStarCount to be 1.");
  }
  return calculateStarRating(this.score, this.scoreHeatBand) >= requiredStarCount;
};

GameManager.prototype._isClearWinCompleted = function () {
  return this._hasRequiredStarRating() && this._isBoardCleared(this.systems.bubbleGrid);
};

GameManager.prototype._resolveClearWinOutcome = function () {
  if (this.isTimedInfiniteShots) {
    this.state = "won";
    return;
  }

  if (this.remainingShots > 0) {
    this._beginSurplusShotBonus("clear_win");
    return;
  }

  this._scheduleWinSettlement();
};

GameManager.prototype._buildPrimaryObjectiveSnapshot = function (jarsSnapshot) {
  var objective = findPrimaryCollectionObjective(this.currentLevel);
  if (!objective) {
    return {
      type: null,
      color: null,
      iconCode: null,
      target: 0,
      progress: 0,
      rawProgress: 0,
      progressText: "-",
      iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
    };
  }

  var target = Math.max(0, Math.floor(Number(objective.value) || 0));
  var rawProgress = this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot);
  var progress = target > 0 ? Math.min(rawProgress, target) : rawProgress;
  var iconCode = null;
  if (objective.type === "collect_any") {
    iconCode = "RAINBOW";
  } else if (objective.type === "collect_color") {
    iconCode = typeof objective.color === "string" ? objective.color : null;
  } else if (objective.type === "collect_ice_snowball") {
    iconCode = "ICE_SNOWBALL";
  }

  return {
    type: objective.type,
    color: typeof objective.color === "string" ? objective.color : null,
    iconCode: iconCode,
    target: target,
    progress: progress,
    rawProgress: rawProgress,
    progressText: target > 0 ? (progress + "/" + target) : String(progress),
    iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
  };
};
}

module.exports = attachGameManagerRuntimeStateMethods;
