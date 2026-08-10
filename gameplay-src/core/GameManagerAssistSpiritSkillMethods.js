"use strict";

var AssistSpiritSkillConfig = require("../config/AssistSpiritSkillConfig");
var AssistSpiritSkillChargeConfig = require("../config/AssistSpiritSkillChargeConfig");
var AssistSpiritConfig = require("../../assets/scripts/config/AssistSpiritConfig");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cellKey(cell) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error("Assist spirit skill target requires integer coordinates.");
  }
  return cell.row + ":" + cell.col;
}

function compareCellCoordinates(left, right) {
  if (left.row !== right.row) {
    return left.row - right.row;
  }
  return left.col - right.col;
}

function isIceCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "obstacle_ball" &&
    cell.entityType === "ice" &&
    cell.temporaryThawed !== true
  );
}

function isActiveVineCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "normal_ball" &&
    typeof cell.vineOwnerId === "string" &&
    cell.vineOwnerId
  );
}

function isDirectSkillTarget(cell) {
  if (!cell || cell.temporaryThawed === true) {
    return false;
  }
  if (cell.entityCategory === "normal_ball") {
    return !isActiveVineCell(cell);
  }
  if (cell.entityCategory === "skill_ball") {
    return true;
  }
  return isIceCell(cell);
}

function isTornadoTarget(cell) {
  if (!cell) {
    return false;
  }
  if (cell.entityCategory === "normal_ball") {
    return !isActiveVineCell(cell);
  }
  return cell.entityCategory === "skill_ball";
}

function normalizeExpectedPlan(expectedPlan) {
  if (!expectedPlan || typeof expectedPlan !== "object" || Array.isArray(expectedPlan)) {
    throw new Error("Assist spirit skill use requires the authoritative preview plan.");
  }
  if (typeof expectedPlan.requestedSpiritId !== "string" || !expectedPlan.requestedSpiritId) {
    throw new Error("Assist spirit skill preview requires requestedSpiritId.");
  }
  if (typeof expectedPlan.resolvedSpiritId !== "string" || !expectedPlan.resolvedSpiritId) {
    throw new Error("Assist spirit skill preview requires resolvedSpiritId.");
  }
  if (typeof expectedPlan.skillId !== "string" || !expectedPlan.skillId) {
    throw new Error("Assist spirit skill preview requires skillId.");
  }
  if (!Array.isArray(expectedPlan.targets)) {
    throw new Error("Assist spirit skill preview requires targets array.");
  }
  if (expectedPlan.targets.length === 0 && expectedPlan.skillId !== "tornado") {
    throw new Error("Assist spirit skill preview requires targets.");
  }
  return expectedPlan;
}

function buildPlanKey(plan) {
  normalizeExpectedPlan(plan);
  var tornadoPathKey = "";
  if (plan.skillId === "tornado") {
    if (
      !plan.path ||
      !plan.path.start ||
      !plan.path.control1 ||
      !plan.path.control2 ||
      !plan.path.end
    ) {
      throw new Error("Tornado preview plan requires cubic Bezier path.");
    }
    if (!Number.isInteger(plan.nearbyCandidateCount) || plan.nearbyCandidateCount < 0) {
      throw new Error("Tornado preview plan requires non-negative nearbyCandidateCount.");
    }
    tornadoPathKey = [
      plan.path.start.x,
      plan.path.start.y,
      plan.path.control1.x,
      plan.path.control1.y,
      plan.path.control2.x,
      plan.path.control2.y,
      plan.path.end.x,
      plan.path.end.y,
      plan.nearbyCandidateCount
    ].join(",");
  }
  return [
    plan.requestedSpiritId,
    plan.resolvedSpiritId,
    plan.skillId,
    plan.targets.map(cellKey).sort().join("|"),
    tornadoPathKey
  ].join("#");
}

function buildLightningTargets(grid, maxTargets) {
  var remaining = grid.getCells().filter(isDirectSkillTarget);
  if (remaining.length < 2) {
    return [];
  }
  remaining.sort(function (left, right) {
    if (left.row !== right.row) {
      return right.row - left.row;
    }
    return left.col - right.col;
  });
  var chain = [remaining.shift()];
  while (remaining.length && chain.length < maxTargets) {
    var previous = chain[chain.length - 1];
    var previousPosition = grid.getCellPosition(previous.row, previous.col);
    remaining.sort(function (left, right) {
      var leftPosition = grid.getCellPosition(left.row, left.col);
      var rightPosition = grid.getCellPosition(right.row, right.col);
      var leftDistance = Math.pow(leftPosition.x - previousPosition.x, 2) +
        Math.pow(leftPosition.y - previousPosition.y, 2);
      var rightDistance = Math.pow(rightPosition.x - previousPosition.x, 2) +
        Math.pow(rightPosition.y - previousPosition.y, 2);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return compareCellCoordinates(left, right);
    });
    chain.push(remaining.shift());
  }
  return chain;
}

function hashString(text) {
  if (typeof text !== "string" || !text) {
    throw new Error("Assist spirit skill random seed must be a non-empty string.");
  }
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  var state = hashString(seed);
  if (state === 0) {
    throw new Error("Assist spirit skill seed produced an invalid zero state.");
  }
  return function () {
    state += 0x6D2B79F5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random, min, max) {
  if (typeof random !== "function") {
    throw new Error("Assist spirit skill random source is required.");
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new Error("Assist spirit skill random range is invalid.");
  }
  return min + (max - min) * random();
}

function buildTornadoRandom(manager) {
  if (typeof manager.assistSpiritSkillSeed !== "string" || !manager.assistSpiritSkillSeed) {
    throw new Error("Tornado skill requires the current run seed.");
  }
  if (
    !Number.isInteger(manager.assistSpiritSkillResolutionSequence) ||
    manager.assistSpiritSkillResolutionSequence < 0
  ) {
    throw new Error("Tornado skill requires a non-negative resolution sequence.");
  }
  return createSeededRandom([
    manager.assistSpiritSkillSeed,
    "assist_spirit_tornado",
    manager.assistSpiritSkillResolutionSequence
  ].join("|"));
}

function buildProducedBallRandom(manager, shotSequence) {
  if (typeof manager.assistSpiritSkillSeed !== "string" || !manager.assistSpiritSkillSeed) {
    throw new Error("Produced-ball assist spirit requires the current run seed.");
  }
  if (!Number.isInteger(shotSequence) || shotSequence <= 0) {
    throw new Error("Produced-ball assist spirit requires a positive shot sequence.");
  }
  return createSeededRandom([
    manager.assistSpiritSkillSeed,
    "assist_spirit_produced_ball",
    manager.equippedAssistSpiritId,
    shotSequence
  ].join("|"));
}

function buildTornadoPath(grid, pathCells, skillConfig, random) {
  if (!Array.isArray(pathCells) || pathCells.length === 0) {
    throw new Error("Tornado path requires board cells.");
  }
  if (!Number.isFinite(skillConfig.pathMargin) || skillConfig.pathMargin <= 0) {
    throw new Error("Tornado path requires positive pathMargin.");
  }
  var positions = pathCells.map(function (cell) {
    return grid.getCellPosition(cell.row, cell.col);
  });
  var minX = Math.min.apply(Math, positions.map(function (position) {
    return position.x;
  }));
  var maxX = Math.max.apply(Math, positions.map(function (position) {
    return position.x;
  }));
  var minY = Math.min.apply(Math, positions.map(function (position) {
    return position.y;
  }));
  var maxY = Math.max.apply(Math, positions.map(function (position) {
    return position.y;
  }));
  var startY = minY - skillConfig.pathMargin;
  var endY = maxY + skillConfig.pathMargin;
  var verticalSpan = endY - startY;
  return {
    start: {
      x: randomBetween(random, minX, maxX),
      y: startY
    },
    control1: {
      x: randomBetween(random, minX, maxX),
      y: startY + verticalSpan * randomBetween(random, 0.24, 0.4)
    },
    control2: {
      x: randomBetween(random, minX, maxX),
      y: startY + verticalSpan * randomBetween(random, 0.6, 0.76)
    },
    end: {
      x: randomBetween(random, minX, maxX),
      y: endY
    }
  };
}

function evaluateCubicBezier(path, t) {
  var inverse = 1 - t;
  var inverseSquared = inverse * inverse;
  var tSquared = t * t;
  return {
    x:
      inverseSquared * inverse * path.start.x +
      3 * inverseSquared * t * path.control1.x +
      3 * inverse * tSquared * path.control2.x +
      tSquared * t * path.end.x,
    y:
      inverseSquared * inverse * path.start.y +
      3 * inverseSquared * t * path.control1.y +
      3 * inverse * tSquared * path.control2.y +
      tSquared * t * path.end.y
  };
}

function distanceSquaredToSegment(point, start, end) {
  var deltaX = end.x - start.x;
  var deltaY = end.y - start.y;
  var lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared <= 0) {
    return Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2);
  }
  var projection = (
    (point.x - start.x) * deltaX +
    (point.y - start.y) * deltaY
  ) / lengthSquared;
  var clampedProjection = Math.max(0, Math.min(1, projection));
  var closestX = start.x + deltaX * clampedProjection;
  var closestY = start.y + deltaY * clampedProjection;
  return Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2);
}

function distanceSquaredToTornadoPath(position, path, sampleSegments) {
  if (!Number.isInteger(sampleSegments) || sampleSegments < 2) {
    throw new Error("Tornado path sampleSegments must be an integer of at least 2.");
  }
  var minimumDistanceSquared = Infinity;
  var previous = evaluateCubicBezier(path, 0);
  for (var index = 1; index <= sampleSegments; index += 1) {
    var current = evaluateCubicBezier(path, index / sampleSegments);
    minimumDistanceSquared = Math.min(
      minimumDistanceSquared,
      distanceSquaredToSegment(position, previous, current)
    );
    previous = current;
  }
  return minimumDistanceSquared;
}

function buildTornadoTargets(grid, eligibleCells, path, skillConfig, maxTargets) {
  if (!Number.isFinite(skillConfig.pathInfluenceRadius) || skillConfig.pathInfluenceRadius <= 0) {
    throw new Error("Tornado skill requires positive pathInfluenceRadius.");
  }
  if (!Number.isInteger(maxTargets) || maxTargets <= 0) {
    throw new Error("Tornado skill requires positive integer maxTargets.");
  }
  var influenceRadiusSquared = skillConfig.pathInfluenceRadius * skillConfig.pathInfluenceRadius;
  var nearbyCandidates = eligibleCells.map(function (cell) {
    return {
      cell: cell,
      distanceSquared: distanceSquaredToTornadoPath(
        grid.getCellPosition(cell.row, cell.col),
        path,
        skillConfig.pathSampleSegments
      )
    };
  }).filter(function (candidate) {
    return candidate.distanceSquared <= influenceRadiusSquared;
  }).sort(function (left, right) {
    if (left.distanceSquared !== right.distanceSquared) {
      return left.distanceSquared - right.distanceSquared;
    }
    return compareCellCoordinates(left.cell, right.cell);
  });
  return {
    nearbyCandidateCount: nearbyCandidates.length,
    targets: nearbyCandidates.slice(0, maxTargets).map(function (candidate) {
      return candidate.cell;
    })
  };
}

function limitTargetsByLevel(targets, maxTargets, description) {
  if (!Array.isArray(targets)) {
    throw new Error(description + " targets must be an array.");
  }
  if (maxTargets === null) {
    return targets;
  }
  if (!Number.isInteger(maxTargets) || maxTargets <= 0) {
    throw new Error(description + " requires a positive integer maxTargets or null for all.");
  }
  return targets.slice(0, maxTargets);
}

function buildPlanForSkill(manager, skillId, requestedSpiritId) {
  var skillConfig = AssistSpiritSkillConfig.getBySkillId(skillId);
  var levelConfig = AssistSpiritConfig.getGlobalSkillRuntimeConfig(skillId, manager.equippedAssistSpiritLevel);
  var grid = manager.systems.bubbleGrid;
  var targets = [];
  var plan = {
    accepted: false,
    reason: "no_target",
    requestedSpiritId: requestedSpiritId,
    resolvedSpiritId: skillConfig.spiritId,
    skillId: skillId,
    iconPath: skillConfig.iconPath,
    effectDuration: skillConfig.effectDuration,
    effectLevel: levelConfig.level,
    maxTargets: levelConfig.maxTargets,
    targets: []
  };

  if (skillId === "release_vines") {
    targets = limitTargetsByLevel(
      grid.getCells().filter(isActiveVineCell).sort(compareCellCoordinates),
      levelConfig.maxTargets,
      "Vine release skill"
    );
  } else if (skillId === "permanent_thaw") {
    targets = limitTargetsByLevel(
      grid.getCells().filter(isIceCell).sort(compareCellCoordinates),
      levelConfig.maxTargets,
      "Permanent thaw skill"
    );
  } else if (skillId === "lightning_chain") {
    targets = buildLightningTargets(grid, levelConfig.maxTargets);
  } else if (skillId === "tornado") {
    var tornadoPathCells = grid.getCells().sort(compareCellCoordinates);
    var tornadoEligibleCells = grid.getCells().filter(isTornadoTarget).sort(compareCellCoordinates);
    if (tornadoPathCells.length) {
      var tornadoRandom = buildTornadoRandom(manager);
      plan.path = buildTornadoPath(grid, tornadoPathCells, skillConfig, tornadoRandom);
      plan.effectPath = skillConfig.effectPath;
      plan.pathInfluenceRadius = skillConfig.pathInfluenceRadius;
      var tornadoSelection = buildTornadoTargets(
        grid,
        tornadoEligibleCells,
        plan.path,
        skillConfig,
        levelConfig.maxTargets
      );
      plan.nearbyCandidateCount = tornadoSelection.nearbyCandidateCount;
      targets = tornadoSelection.targets;
    }
  } else {
    throw new Error("Unsupported assist spirit skill: " + skillId);
  }

  if (
    !targets.length &&
    !(skillId === "tornado" && plan.path && Number.isInteger(plan.nearbyCandidateCount))
  ) {
    return plan;
  }
  plan.accepted = true;
  plan.reason = null;
  plan.targets = targets.map(function (target) {
    return {
      id: target.id,
      row: target.row,
      col: target.col
    };
  });
  return plan;
}

function buildAuthoritativePlan(manager, spiritId) {
  var spiritConfig = AssistSpiritSkillConfig.getBySpiritId(spiritId);
  if (!spiritConfig.skillId) {
    return {
      accepted: false,
      reason: "no_global_skill",
      requestedSpiritId: spiritId,
      resolvedSpiritId: spiritId,
      skillId: null,
      targets: []
    };
  }
  if (spiritId !== "yumi") {
    return buildPlanForSkill(manager, spiritConfig.skillId, spiritId);
  }

  for (var index = 0; index < AssistSpiritSkillConfig.YUMI_PRIORITY.length; index += 1) {
    var skillId = AssistSpiritSkillConfig.YUMI_PRIORITY[index];
    var candidate = buildPlanForSkill(manager, skillId, "yumi");
    if (candidate.accepted) {
      candidate.starlightIconPath = spiritConfig.iconPath;
      candidate.starlightEffectDuration = spiritConfig.effectDuration;
      return candidate;
    }
  }
  return {
    accepted: false,
    reason: "no_target",
    requestedSpiritId: "yumi",
    resolvedSpiritId: "yumi",
    skillId: "starlight_priority",
    targets: []
  };
}

function collectFloatingAfterSkill(manager, grid, resolution) {
  var floatingCells = manager.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeFloatingCells(floatingCells);
  manager._appendUniqueCells(resolution.floating, removedFloating);
  manager._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
  manager._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
    skipEliminationPresentationHold: true,
    skipAssistSpiritSkillCharge: true
  });
  manager.systems.jarCollectorSystem.collect([]);
  return removedFloating;
}

function finalizeImmediateResolution(manager, resolution, shouldTryTopAnchorCollapse) {
  if (typeof shouldTryTopAnchorCollapse !== "boolean") {
    throw new Error("Assist spirit immediate resolution requires top-collapse policy.");
  }
  var grid = manager.systems.bubbleGrid;
  resolution.boardCleared = manager._isBoardCleared(grid);
  manager.lastResolution = resolution;
  manager.pendingShotPlan = null;
  manager.isAiming = false;
  if (resolution.boardCleared) {
    manager._resolveBoardClearedOutcome();
    return;
  }
  if (shouldTryTopAnchorCollapse && manager._tryTopAnchorCollapse()) {
    return;
  }
}

function createGameManagerAssistSpiritSkillMethods(deps) {
  var createEmptyResolution = deps.createEmptyResolution;

  return {
    setEquippedAssistSpirit: function (spiritId, level) {
      AssistSpiritSkillConfig.getBySpiritId(spiritId);
      var abilityConfig = AssistSpiritConfig.getAbilityRuntimeConfig(spiritId);
      AssistSpiritConfig.getProbability(spiritId, level);
      this.equippedAssistSpiritId = spiritId;
      this.equippedAssistSpiritLevel = level;
      this.assistSpiritSkillChargeMax = abilityConfig.abilityType === "global_skill"
        ? AssistSpiritSkillChargeConfig.getMaxCharge(spiritId, level)
        : 0;
      return {
        spiritId: spiritId,
        level: level
      };
    },

    _resolveAssistSpiritProducedBallAfterFire: function () {
      if (typeof this.equippedAssistSpiritId !== "string" || !this.equippedAssistSpiritId) {
        throw new Error("Produced-ball resolution requires equipped assist spirit.");
      }
      if (!Number.isInteger(this.equippedAssistSpiritLevel)) {
        throw new Error("Produced-ball resolution requires equipped assist spirit level.");
      }
      if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
        throw new Error("Produced-ball resolution requires a positive fired shot count.");
      }

      var abilityConfig = AssistSpiritConfig.getAbilityRuntimeConfig(this.equippedAssistSpiritId);
      if (abilityConfig.abilityType !== "produced_ball") {
        return {
          evaluated: false,
          reason: "not_produced_ball_spirit"
        };
      }
      if (
        !Number.isInteger(this.lastAssistSpiritProducedBallEvaluationShot) ||
        this.lastAssistSpiritProducedBallEvaluationShot < 0
      ) {
        throw new Error("Produced-ball evaluation sequence is invalid.");
      }
      if (this.lastAssistSpiritProducedBallEvaluationShot !== this.shotsFired - 1) {
        throw new Error("Produced-ball ability must be evaluated exactly once per real shot.");
      }
      this.lastAssistSpiritProducedBallEvaluationShot = this.shotsFired;

      var shooterController = this.systems && this.systems.shooterController;
      if (!shooterController || typeof shooterController.convertCurrentNormalBallToSkillBall !== "function") {
        throw new Error("Produced-ball resolution requires ShooterController conversion authority.");
      }
      var currentBall = shooterController.currentBall;
      if (!currentBall) {
        return {
          evaluated: false,
          reason: "no_loaded_ball",
          shotSequence: this.shotsFired
        };
      }
      if (currentBall.ballCategory !== "normal") {
        return {
          evaluated: false,
          reason: "loaded_ball_not_normal",
          shotSequence: this.shotsFired
        };
      }

      var probabilityPercent = AssistSpiritConfig.getProbability(
        this.equippedAssistSpiritId,
        this.equippedAssistSpiritLevel
      );
      if (!Number.isInteger(probabilityPercent) || probabilityPercent <= 0 || probabilityPercent > 100) {
        throw new Error("Produced-ball probability must be an integer percentage in (0, 100].");
      }
      var random = buildProducedBallRandom(this, this.shotsFired);
      var rollBasisPoints = Math.floor(random() * 10000);
      var thresholdBasisPoints = probabilityPercent * 100;
      var triggered = rollBasisPoints < thresholdBasisPoints;
      if (triggered) {
        var conversion = shooterController.convertCurrentNormalBallToSkillBall(abilityConfig.producedBallType);
        if (
          !conversion ||
          conversion.accepted !== true ||
          !conversion.currentBall ||
          conversion.currentBall.entityType !== abilityConfig.producedBallType
        ) {
          throw new Error("Produced-ball conversion did not return the authoritative skill ball.");
        }
      }

      var result = {
        evaluated: true,
        triggered: triggered,
        spiritId: this.equippedAssistSpiritId,
        spiritLevel: this.equippedAssistSpiritLevel,
        shotSequence: this.shotsFired,
        probabilityPercent: probabilityPercent,
        rollBasisPoints: rollBasisPoints,
        producedBallType: abilityConfig.producedBallType
      };
      this._pushRuntimeEvent("assist_spirit_produced_ball_rolled", {
        spirit_id: result.spiritId,
        spirit_level: result.spiritLevel,
        shot_sequence: result.shotSequence,
        probability_percent: result.probabilityPercent,
        roll_basis_points: result.rollBasisPoints,
        triggered: result.triggered,
        produced_ball_type: result.producedBallType
      });
      return result;
    },

    getAssistSpiritSkillAvailability: function () {
      if (typeof this.equippedAssistSpiritId !== "string" || !this.equippedAssistSpiritId) {
        throw new Error("GameManager requires equipped assist spirit before rendering gameplay.");
      }
      if (this._isInstantAdPowerupBusy()) {
        var busyChargeState = this._getAssistSpiritSkillChargeSnapshot();
        return {
          spiritId: this.equippedAssistSpiritId,
          available: false,
          reason: "busy",
          skillId: AssistSpiritSkillConfig.getBySpiritId(this.equippedAssistSpiritId).skillId,
          charge: busyChargeState.charge,
          maxCharge: busyChargeState.maxCharge,
          isCharged: busyChargeState.isCharged
        };
      }
      if (!this._isGlobalAssistSpiritSkillEquipped()) {
        var unavailablePlan = buildAuthoritativePlan(this, this.equippedAssistSpiritId);
        return {
          spiritId: this.equippedAssistSpiritId,
          available: false,
          reason: unavailablePlan.reason,
          skillId: unavailablePlan.skillId,
          charge: 0,
          maxCharge: 0,
          isCharged: false
        };
      }
      var chargeState = this._getAssistSpiritSkillChargeSnapshot();
      if (!chargeState.isCharged) {
        var chargingSpiritConfig = AssistSpiritSkillConfig.getBySpiritId(this.equippedAssistSpiritId);
        return {
          spiritId: this.equippedAssistSpiritId,
          available: false,
          reason: "charging",
          skillId: chargingSpiritConfig.skillId,
          charge: chargeState.charge,
          maxCharge: chargeState.maxCharge,
          isCharged: false
        };
      }
      var plan = buildAuthoritativePlan(this, this.equippedAssistSpiritId);
      return {
        spiritId: this.equippedAssistSpiritId,
        available: plan.accepted === true,
        reason: plan.accepted ? null : plan.reason,
        skillId: plan.skillId,
        charge: chargeState.charge,
        maxCharge: chargeState.maxCharge,
        isCharged: true
      };
    },

    previewAssistSpiritSkill: function (spiritId) {
      if (spiritId !== this.equippedAssistSpiritId) {
        throw new Error("Assist spirit skill preview must use the equipped spirit.");
      }
      if (this._isInstantAdPowerupBusy()) {
        return {
          accepted: false,
          reason: "busy",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      if (!this._isGlobalAssistSpiritSkillEquipped()) {
        var unavailablePlan = buildAuthoritativePlan(this, spiritId);
        unavailablePlan.snapshot = this.getRuntimeSnapshot();
        return clone(unavailablePlan);
      }
      if (!this._getAssistSpiritSkillChargeSnapshot().isCharged) {
        return {
          accepted: false,
          reason: "charging",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      var plan = buildAuthoritativePlan(this, spiritId);
      plan.snapshot = this.getRuntimeSnapshot();
      return clone(plan);
    },

    useAssistSpiritSkill: function (spiritId, expectedPlan) {
      if (spiritId !== this.equippedAssistSpiritId) {
        throw new Error("Assist spirit skill use must use the equipped spirit.");
      }
      if (this._isInstantAdPowerupBusy()) {
        return {
          accepted: false,
          reason: "busy",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      if (!this._isGlobalAssistSpiritSkillEquipped()) {
        return {
          accepted: false,
          reason: "no_global_skill",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      if (!this._getAssistSpiritSkillChargeSnapshot().isCharged) {
        return {
          accepted: false,
          reason: "charging",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      var safeExpectedPlan = normalizeExpectedPlan(expectedPlan);
      var actualPlan = buildAuthoritativePlan(this, spiritId);
      if (!actualPlan.accepted) {
        return {
          accepted: false,
          reason: actualPlan.reason,
          snapshot: this.getRuntimeSnapshot()
        };
      }
      if (buildPlanKey(actualPlan) !== buildPlanKey(safeExpectedPlan)) {
        throw new Error("Assist spirit skill targets changed before resolution.");
      }

      var grid = this.systems.bubbleGrid;
      var resolution = createEmptyResolution();
      var skillId = actualPlan.skillId;
      this.assistSpiritSkillChargeSuppressed = true;
      var targetCells = actualPlan.targets.map(function (target) {
        var cell = grid.getCell(target.row, target.col);
        if (!cell || String(cell.id) !== String(target.id)) {
          throw new Error("Assist spirit skill target is no longer on the board: " + cellKey(target));
        }
        return cell;
      });

      if (skillId === "release_vines") {
        resolution.releasedVines = targetCells.map(function (target) {
          return grid.removeVineAt(target.row, target.col);
        });
        collectFloatingAfterSkill(this, grid, resolution);
      } else if (skillId === "permanent_thaw") {
        resolution.iceCollected += this._registerIceCollection(targetCells);
        resolution.thawed = targetCells.map(function (target) {
          return this._thawIceCellAtCurrentPosition(grid, target);
        }, this);
      } else if (skillId === "lightning_chain") {
        var removedLightning = grid.removeCells(targetCells);
        if (removedLightning.length !== targetCells.length) {
          throw new Error("Lightning chain failed to remove every authoritative target.");
        }
        this._pushBubbleBreakEvent(removedLightning, undefined, "assist_spirit_skill");
        resolution.matched = removedLightning;
        this._resolveVinesAfterRemoval(removedLightning, grid, resolution);
        this._collectRemovedKeysAndResolveUnlocks(removedLightning, grid, resolution);
        this._registerMatchedObjectiveCollection(removedLightning, resolution.eliminationSequence, resolution, grid);
        collectFloatingAfterSkill(this, grid, resolution);
        resolution.collected = removedLightning.concat(resolution.floating);
      } else if (skillId === "tornado") {
        var removedTornado = grid.removeCells(targetCells);
        if (removedTornado.length !== targetCells.length) {
          throw new Error("Tornado failed to detach every authoritative target.");
        }
        this._collectRemovedKeysAndResolveUnlocks(removedTornado, grid, resolution);
        resolution.floating = removedTornado;
        if (removedTornado.length > 0) {
          collectFloatingAfterSkill(this, grid, resolution);
        this._registerResolutionDrops(removedTornado, grid, resolution, undefined, {
          skipEliminationPresentationHold: true,
          skipAssistSpiritSkillCharge: true
          });
        }
        resolution.collected = resolution.floating.slice();
      } else {
        throw new Error("Unsupported assist spirit skill resolution: " + skillId);
      }

      finalizeImmediateResolution(
        this,
        resolution,
        skillId === "lightning_chain" ||
          (skillId === "tornado" && resolution.floating.length > 0)
      );
      this.assistSpiritSkillChargeSuppressed = false;
      var chargeState = this._getAssistSpiritSkillChargeSnapshot();
      if (!chargeState.isCharged) {
        throw new Error("Assist spirit skill resolution requires a fully charged skill.");
      }
      this.assistSpiritSkillCharge = 0;
      this._pushRuntimeEvent("assist_spirit_skill_charge_consumed", {
        charge_max: chargeState.maxCharge,
        skill_id: skillId
      });
      if (
        !Number.isInteger(this.assistSpiritSkillResolutionSequence) ||
        this.assistSpiritSkillResolutionSequence < 0
      ) {
        throw new Error("Assist spirit skill resolution sequence is invalid.");
      }
      this.assistSpiritSkillResolutionSequence += 1;
      this._pushRuntimeEvent("assist_spirit_skill_resolved", {
        requested_spirit_id: spiritId,
        resolved_spirit_id: actualPlan.resolvedSpiritId,
        skill_id: skillId,
        target_count: actualPlan.targets.length,
        duration_shots: actualPlan.durationShots || 0
      });
      return {
        accepted: true,
        requestedSpiritId: spiritId,
        resolvedSpiritId: actualPlan.resolvedSpiritId,
        skillId: skillId,
        targetCount: actualPlan.targets.length,
        snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
      };
    },

    grantAssistSpiritSkillChargeFromAd: function () {
      if (this._isInstantAdPowerupBusy()) {
        return {
          accepted: false,
          reason: "busy",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      if (!this._isGlobalAssistSpiritSkillEquipped()) {
        throw new Error("Assist spirit skill ad charge requires a global-skill spirit.");
      }
      var chargeState = this._getAssistSpiritSkillChargeSnapshot();
      if (chargeState.isCharged) {
        return {
          accepted: false,
          reason: "already_charged",
          snapshot: this.getRuntimeSnapshot()
        };
      }
      this.assistSpiritSkillCharge = chargeState.maxCharge;
      this._pushRuntimeEvent("assist_spirit_skill_ad_granted", {
        charge_max: chargeState.maxCharge
      });
      this._pushRuntimeEvent("assist_spirit_skill_ready", {
        charge_max: chargeState.maxCharge,
        source: "rewarded_ad"
      });
      return {
        accepted: true,
        gained: chargeState.maxCharge - chargeState.charge,
        snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
      };
    }
  };
}

module.exports = createGameManagerAssistSpiritSkillMethods;
