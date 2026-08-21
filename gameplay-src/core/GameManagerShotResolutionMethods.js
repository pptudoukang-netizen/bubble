"use strict";

var createGameManagerShotScoreMethods = require("./GameManagerShotScoreMethods");
var createGameManagerShotPlanningMethods = require("./GameManagerShotPlanningMethods");
var createGameManagerShotDropMethods = require("./GameManagerShotDropMethods");
var createGameManagerShotMolotovMethods = require("./GameManagerShotMolotovMethods");
var createGameManagerShotReactiveMethods = require("./GameManagerShotReactiveMethods");
var createGameManagerShotCrystalGunMethods = require("./GameManagerShotCrystalGunMethods");
var createGameManagerShotRainbowPrismMethods = require("./GameManagerShotRainbowPrismMethods");
var createGameManagerShotFinalizeMethods = require("./GameManagerShotFinalizeMethods");
var RainbowPrismBallResolver = require("./RainbowPrismBallResolver");

var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var BoardViewportSystem = require("../systems/BoardViewportSystem");
var EliminationSequenceBuilder = require("./EliminationSequenceBuilder");
var JarScoreConfig = require("../config/JarScoreConfig");
var AssistSpiritConfig = require("../../assets/scripts/config/AssistSpiritConfig");

function createGameManagerShotResolutionMethods(deps) {
  var Logger = deps.Logger;
  var BoardLayout = deps.BoardLayout;
  var clone = deps.clone;
  var quantize = deps.quantize;
  var buildProjectilePathFromShotPlan = deps.buildProjectilePathFromShotPlan;
  var measurePathDistance = deps.measurePathDistance;
  var isSkillBall = deps.isSkillBall;
  var isIceBall = deps.isIceBall;
  var isBlastBall = deps.isBlastBall;
  var isCrystalGunBall = deps.isCrystalGunBall;
  var isRainbowPrismBall = deps.isRainbowPrismBall;
  var isBlackHoleBall = deps.isBlackHoleBall;
  var isRainbowBall = deps.isRainbowBall;
  var isMolotovBall = deps.isMolotovBall;
  var isSplitterBall = deps.isSplitterBall;
  var isVineSpiritBall = deps.isVineSpiritBall;
  var isVineEntangledBall = deps.isVineEntangledBall;
  var isLockedBall = deps.isLockedBall;
  var isKeyBall = deps.isKeyBall;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var createEmptyResolution = deps.createEmptyResolution;
  var findPrimaryCollectionObjective = deps.findPrimaryCollectionObjective;
  var listCollectionRewardObjectives = deps.listCollectionRewardObjectives;
  var COMBO_BONUS_PER_HIT = deps.COMBO_BONUS_PER_HIT;
  var MOLOTOV_BLAST_ANIMATION_DURATION = SpecialAnimationTiming.molotovBlast.totalDuration;
  var MOLOTOV_BLAST_TRIGGER_DELAY = SpecialAnimationTiming.molotovBlast.blastTriggerDelay;
  var FLOATING_ICE_DROP_DELAY = SpecialAnimationTiming.iceSnowballCollect.floatingIceDropDelay;
  var KEY_UNLOCK_DROP_DELAY = SpecialAnimationTiming.keyUnlock.totalDuration;
  var MOLOTOV_BLAST_DROP_INNER_SPEED = 860;
  var MOLOTOV_BLAST_DROP_OUTER_SPEED = 640;
  var ELIMINATION_SEQUENCE_INTERVAL_MS = 30;
  var NON_COLLECTIBLE_JAR_SCORE_COLORS = {
    K: true,
    W: true
  };

  function requireFinitePoint(point, ownerName) {
    if (
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !isFinite(point.x) ||
      !isFinite(point.y)
    ) {
      throw new Error(ownerName + " position must be finite.");
    }
    return point;
  }

  function requirePositiveFiniteNumber(value, ownerName) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error(ownerName + " must be a positive finite number.");
    }
    return value;
  }

  function hasUnlockEntryForKey(keyCell, unlockedLockedBalls) {
    if (!keyCell || (typeof keyCell.id !== "string" && typeof keyCell.id !== "number")) {
      throw new Error("Key unlock lookup requires key id.");
    }
    if (!Array.isArray(unlockedLockedBalls)) {
      throw new Error("Key unlock lookup requires unlockedLockedBalls array.");
    }
    return unlockedLockedBalls.some(function (entry) {
      return entry && entry.__sourceKeyId === keyCell.id;
    });
  }

  function buildRowKeyLockPairings(groupKeys, lockedTargets) {
    if (!Array.isArray(groupKeys) || !groupKeys.length) {
      throw new Error("Row key lock pairing requires collected keys.");
    }
    if (!Array.isArray(lockedTargets) || !lockedTargets.length) {
      throw new Error("Row key lock pairing requires locked targets.");
    }
    var keyByRow = {};
    var pairings = [];
    groupKeys.forEach(function (keyCell) {
      if (!keyCell || !Number.isInteger(keyCell.row) || !Number.isInteger(keyCell.col)) {
        throw new Error("Row key lock pairing requires key coordinates.");
      }
      var rowKey = String(keyCell.row);
      if (keyByRow[rowKey]) {
        throw new Error("Lock chain row contains more than one collected key: " + keyCell.row + ".");
      }
      keyByRow[rowKey] = keyCell;
      var rowLocks = lockedTargets.filter(function (lockCell) {
        return lockCell && lockCell.row === keyCell.row;
      }).sort(function (left, right) {
        if (left.col !== right.col) {
          return left.col - right.col;
        }
        return String(left.id).localeCompare(String(right.id));
      });
      if (!rowLocks.length) {
        throw new Error("Collected key has no locked targets in row " + keyCell.row + ": " + keyCell.id + ".");
      }
      rowLocks.forEach(function (lockCell) {
        pairings.push({
          keyCell: keyCell,
          lockCell: lockCell
        });
      });
    });
    return pairings;
  }

  function buildMolotovBlastDropVelocity(active, cell, grid) {
    if (!active || !Number.isInteger(active.row) || !Number.isInteger(active.col)) {
      throw new Error("Molotov blast drop velocity requires active coordinates.");
    }
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Molotov blast drop velocity requires cell coordinates.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("Molotov blast drop velocity requires grid.getCellPosition.");
    }
    var blastCenter = requireFinitePoint(
      grid.getCellPosition(active.row, active.col),
      "Molotov blast center"
    );
    var cellCenter = requireFinitePoint(
      grid.getCellPosition(cell.row, cell.col),
      "Molotov blasted cell"
    );
    var dx = cellCenter.x - blastCenter.x;
    var dy = cellCenter.y - blastCenter.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (!isFinite(distance) || distance <= 0) {
      throw new Error("Molotov blast drop velocity requires non-zero blast direction.");
    }
    var maxDistance = requirePositiveFiniteNumber(BoardLayout.cellWidth, "Molotov blast cell width") * active.blastRadius;
    var distanceRatio = Math.max(0, Math.min(1, distance / maxDistance));
    var speed = MOLOTOV_BLAST_DROP_INNER_SPEED -
      (MOLOTOV_BLAST_DROP_INNER_SPEED - MOLOTOV_BLAST_DROP_OUTER_SPEED) * distanceRatio;
    return {
      x: dx / distance * speed,
      y: dy / distance * speed
    };
  }

  function resolveNextEliminationDelayMs(resolution) {
    if (!resolution || !Array.isArray(resolution.eliminationSequence)) {
      throw new Error("Molotov elimination presentation requires resolution.eliminationSequence.");
    }

    var maxDelayMs = -ELIMINATION_SEQUENCE_INTERVAL_MS;
    resolution.eliminationSequence.forEach(function (entry) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Molotov elimination presentation sequence entry must be an object.");
      }
      var delayMs = Number(entry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Molotov elimination presentation delayMs must be non-negative.");
      }
      if (delayMs > maxDelayMs) {
        maxDelayMs = delayMs;
      }
    });
    return maxDelayMs + ELIMINATION_SEQUENCE_INTERVAL_MS;
  }

  function appendMolotovEliminationSequence(resolution, cells, grid) {
    if (!resolution || !Array.isArray(resolution.eliminationSequence)) {
      throw new Error("Molotov elimination presentation requires resolution.eliminationSequence.");
    }
    if (!Array.isArray(cells)) {
      throw new Error("Molotov elimination presentation requires cells array.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("Molotov elimination presentation requires grid.getCellPosition.");
    }

    var sequenceCellIds = {};
    resolution.eliminationSequence.forEach(function (entry) {
      if (!entry || (typeof entry.cellId !== "string" && typeof entry.cellId !== "number")) {
        throw new Error("Molotov elimination presentation sequence entry requires cellId.");
      }
      sequenceCellIds[String(entry.cellId)] = true;
    });

    var nextDelayMs = resolveNextEliminationDelayMs(resolution);
    cells.forEach(function (cell) {
      if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
        throw new Error("Molotov elimination presentation requires removed cell id.");
      }
      if (cell.entityCategory !== "normal_ball") {
        return;
      }
      if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Molotov elimination presentation requires cell coordinates: " + cell.id);
      }
      var cellId = String(cell.id);
      if (sequenceCellIds[cellId]) {
        return;
      }

      var worldPosition = requireFinitePoint(
        grid.getCellPosition(cell.row, cell.col),
        "Molotov elimination presentation cell"
      );
      resolution.eliminationSequence.push({
        cellId: cell.id,
        row: cell.row,
        col: cell.col,
        worldPosition: {
          x: worldPosition.x,
          y: worldPosition.y
        },
        removeType: "molotov_blast",
        points: 0,
        delayMs: nextDelayMs
      });
      sequenceCellIds[cellId] = true;
      nextDelayMs += ELIMINATION_SEQUENCE_INTERVAL_MS;
    });
  }

  function buildTriggeredSplitterIdsFromPendingSpawns(pendingSplitterSpawns) {
    if (!Array.isArray(pendingSplitterSpawns)) {
      throw new Error("Molotov splitter dedup requires pendingSplitterSpawns array.");
    }
    var triggeredSplitterIds = {};
    pendingSplitterSpawns.forEach(function (pending) {
      if (!pending || typeof pending !== "object" || Array.isArray(pending)) {
        throw new Error("Molotov splitter dedup requires pending splitter entry.");
      }
      if (typeof pending.id !== "string" && typeof pending.id !== "number") {
        throw new Error("Molotov splitter dedup requires pending splitter id.");
      }
      triggeredSplitterIds[pending.id] = true;
    });
    return triggeredSplitterIds;
  }

  var SHOT_RESOLUTION_CONTEXT = {
    AssistSpiritConfig: AssistSpiritConfig,
    BoardLayout: BoardLayout,
    BoardViewportSystem: BoardViewportSystem,
    RainbowPrismBallResolver: RainbowPrismBallResolver,
    COMBO_BONUS_PER_HIT: COMBO_BONUS_PER_HIT,
    EliminationSequenceBuilder: EliminationSequenceBuilder,
    FLOATING_ICE_DROP_DELAY: FLOATING_ICE_DROP_DELAY,
    JarScoreConfig: JarScoreConfig,
    KEY_UNLOCK_DROP_DELAY: KEY_UNLOCK_DROP_DELAY,
    Logger: Logger,
    MOLOTOV_BLAST_ANIMATION_DURATION: MOLOTOV_BLAST_ANIMATION_DURATION,
    MOLOTOV_BLAST_TRIGGER_DELAY: MOLOTOV_BLAST_TRIGGER_DELAY,
    NON_COLLECTIBLE_JAR_SCORE_COLORS: NON_COLLECTIBLE_JAR_SCORE_COLORS,
    SpecialAnimationTiming: SpecialAnimationTiming,
    appendMolotovEliminationSequence: appendMolotovEliminationSequence,
    buildMolotovBlastDropVelocity: buildMolotovBlastDropVelocity,
    buildRowKeyLockPairings: buildRowKeyLockPairings,
    buildProjectilePathFromShotPlan: buildProjectilePathFromShotPlan,
    buildTriggeredSplitterIdsFromPendingSpawns: buildTriggeredSplitterIdsFromPendingSpawns,
    clone: clone,
    createEmptyResolution: createEmptyResolution,
    createGameManagerShotDropMethods: createGameManagerShotDropMethods,
    createGameManagerShotFinalizeMethods: createGameManagerShotFinalizeMethods,
    createGameManagerShotMolotovMethods: createGameManagerShotMolotovMethods,
    createGameManagerShotPlanningMethods: createGameManagerShotPlanningMethods,
    createGameManagerShotReactiveMethods: createGameManagerShotReactiveMethods,
    createGameManagerShotScoreMethods: createGameManagerShotScoreMethods,
    findPrimaryCollectionObjective: findPrimaryCollectionObjective,
    hasUnlockEntryForKey: hasUnlockEntryForKey,
    isBlastBall: isBlastBall,
    isCrystalGunBall: isCrystalGunBall,
    isRainbowPrismBall: isRainbowPrismBall,
    isBlackHoleBall: isBlackHoleBall,
    isIceBall: isIceBall,
    isKeyBall: isKeyBall,
    isLockedBall: isLockedBall,
    isMolotovBall: isMolotovBall,
    isRainbowBall: isRainbowBall,
    isSkillBall: isSkillBall,
    isSplitterBall: isSplitterBall,
    isVineEntangledBall: isVineEntangledBall,
    isVineSpiritBall: isVineSpiritBall,
    listCollectionRewardObjectives: listCollectionRewardObjectives,
    measurePathDistance: measurePathDistance,
    quantize: quantize,
    requireFinitePoint: requireFinitePoint,
    resolveIceInnerColor: resolveIceInnerColor
  };
  return Object.assign({},
    createGameManagerShotScoreMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotPlanningMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotDropMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotMolotovMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotReactiveMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotCrystalGunMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotRainbowPrismMethods(SHOT_RESOLUTION_CONTEXT),
    createGameManagerShotFinalizeMethods(SHOT_RESOLUTION_CONTEXT)
  );
}

module.exports = createGameManagerShotResolutionMethods;
