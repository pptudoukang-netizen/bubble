"use strict";

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

  function measureWorldDistanceSqBetweenCells(leftCell, rightCell, grid) {
    if (!leftCell || !Number.isInteger(leftCell.row) || !Number.isInteger(leftCell.col)) {
      throw new Error("World distance requires left cell coordinates.");
    }
    if (!rightCell || !Number.isInteger(rightCell.row) || !Number.isInteger(rightCell.col)) {
      throw new Error("World distance requires right cell coordinates.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("World distance requires grid.getCellPosition.");
    }

    var leftPosition = requireFinitePoint(
      grid.getCellPosition(leftCell.row, leftCell.col),
      "Left cell"
    );
    var rightPosition = requireFinitePoint(
      grid.getCellPosition(rightCell.row, rightCell.col),
      "Right cell"
    );
    var dx = rightPosition.x - leftPosition.x;
    var dy = rightPosition.y - leftPosition.y;
    return dx * dx + dy * dy;
  }

  function compareWorldDistanceSq(leftDistanceSq, rightDistanceSq) {
    if (typeof leftDistanceSq !== "number" || !isFinite(leftDistanceSq)) {
      throw new Error("World distance compare requires left distanceSq.");
    }
    if (typeof rightDistanceSq !== "number" || !isFinite(rightDistanceSq)) {
      throw new Error("World distance compare requires right distanceSq.");
    }
    return leftDistanceSq - rightDistanceSq;
  }

  function compareKeysForStableTiebreak(leftKey, rightKey) {
    if (!leftKey || !Number.isInteger(leftKey.row) || !Number.isInteger(leftKey.col)) {
      throw new Error("Key tiebreak requires left key coordinates.");
    }
    if (!rightKey || !Number.isInteger(rightKey.row) || !Number.isInteger(rightKey.col)) {
      throw new Error("Key tiebreak requires right key coordinates.");
    }
    if (leftKey.row !== rightKey.row) {
      return leftKey.row - rightKey.row;
    }
    if (leftKey.col !== rightKey.col) {
      return leftKey.col - rightKey.col;
    }
    return String(leftKey.id).localeCompare(String(rightKey.id));
  }

  function compareLocksForStableTiebreak(leftLock, rightLock) {
    if (!leftLock || !Number.isInteger(leftLock.row) || !Number.isInteger(leftLock.col)) {
      throw new Error("Lock tiebreak requires left lock coordinates.");
    }
    if (!rightLock || !Number.isInteger(rightLock.row) || !Number.isInteger(rightLock.col)) {
      throw new Error("Lock tiebreak requires right lock coordinates.");
    }
    if (leftLock.row !== rightLock.row) {
      return leftLock.row - rightLock.row;
    }
    if (leftLock.col !== rightLock.col) {
      return leftLock.col - rightLock.col;
    }
    return String(leftLock.id).localeCompare(String(rightLock.id));
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

  function findNearestLockForKey(keyCell, lockedTargets, grid) {
    if (!keyCell) {
      throw new Error("Nearest lock selection requires key cell.");
    }
    if (!Array.isArray(lockedTargets) || !lockedTargets.length) {
      throw new Error("Nearest lock selection requires locked targets.");
    }

    var nearestLock = null;
    var nearestDistanceSq = null;
    lockedTargets.forEach(function (lockCell) {
      var distanceSq = measureWorldDistanceSqBetweenCells(keyCell, lockCell, grid);
      if (
        nearestLock === null ||
        compareWorldDistanceSq(distanceSq, nearestDistanceSq) < 0 ||
        (
          compareWorldDistanceSq(distanceSq, nearestDistanceSq) === 0 &&
          compareLocksForStableTiebreak(lockCell, nearestLock) < 0
        )
      ) {
        nearestLock = lockCell;
        nearestDistanceSq = distanceSq;
      }
    });

    if (!nearestLock) {
      throw new Error("Nearest lock selection failed for key: " + keyCell.id);
    }
    return nearestLock;
  }

  function buildNearestKeyLockPairings(groupKeys, lockedTargets, grid) {
    if (!Array.isArray(groupKeys) || !groupKeys.length) {
      throw new Error("Nearest key lock pairing requires group keys.");
    }
    if (!Array.isArray(lockedTargets) || !lockedTargets.length) {
      throw new Error("Nearest key lock pairing requires locked targets.");
    }
    if (lockedTargets.length < groupKeys.length) {
      throw new Error("Nearest key lock pairing requires at least one locked target per key.");
    }

    if (groupKeys.length === 1) {
      return [{
        keyCell: groupKeys[0],
        lockCell: findNearestLockForKey(groupKeys[0], lockedTargets, grid)
      }];
    }

    var remainingKeys = groupKeys.slice();
    var remainingLocks = lockedTargets.slice();
    var pairings = [];

    while (remainingKeys.length && remainingLocks.length) {
      var bestPair = null;
      var bestDistanceSq = null;

      remainingKeys.forEach(function (keyCell) {
        remainingLocks.forEach(function (lockCell) {
          var distanceSq = measureWorldDistanceSqBetweenCells(keyCell, lockCell, grid);
          if (
            !bestPair ||
            compareWorldDistanceSq(distanceSq, bestDistanceSq) < 0 ||
            (
              compareWorldDistanceSq(distanceSq, bestDistanceSq) === 0 &&
              (
                compareKeysForStableTiebreak(keyCell, bestPair.keyCell) < 0 ||
                (
                  compareKeysForStableTiebreak(keyCell, bestPair.keyCell) === 0 &&
                  compareLocksForStableTiebreak(lockCell, bestPair.lockCell) < 0
                )
              )
            )
          ) {
            bestPair = {
              keyCell: keyCell,
              lockCell: lockCell
            };
            bestDistanceSq = distanceSq;
          }
        });
      });

      if (!bestPair) {
        throw new Error("Nearest key lock pairing failed to resolve target.");
      }

      pairings.push(bestPair);
      remainingKeys = remainingKeys.filter(function (cell) {
        return cell.id !== bestPair.keyCell.id;
      });
      remainingLocks = remainingLocks.filter(function (cell) {
        return cell.id !== bestPair.lockCell.id;
      });
    }

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

  return {
    _resetComboStreak: function () {
      this.comboStreak = 0;
    },

    _getMatchedDropScorePerBallForNextCombo: function (matchedRuleKey) {
      if (typeof matchedRuleKey !== "undefined" && (typeof matchedRuleKey !== "string" || !matchedRuleKey)) {
        throw new Error("Matched combo score rule key must be a non-empty string.");
      }
      var ruleKey = typeof matchedRuleKey === "undefined" ? "matchedDrop" : matchedRuleKey;
      var baseScore = this._getScoreRule(ruleKey);
      if (!Number.isInteger(baseScore) || baseScore < 0) {
        throw new Error("Matched drop score rule must be a non-negative integer.");
      }
      if (!Number.isInteger(this.comboStreak) || this.comboStreak < 0) {
        throw new Error("Combo streak must be a non-negative integer.");
      }
      if (!Number.isInteger(COMBO_BONUS_PER_HIT) || COMBO_BONUS_PER_HIT <= 0) {
        throw new Error("Combo bonus per hit must be a positive integer.");
      }

      return baseScore + this.comboStreak * COMBO_BONUS_PER_HIT;
    },

    _resolveComboAttachAnchor: function (resolution) {
      if (!resolution) {
        throw new Error("Combo attach anchor requires resolution.");
      }

      var attachedCell = resolution.attachedCell;
      if (
        attachedCell &&
        Number.isInteger(attachedCell.row) &&
        Number.isInteger(attachedCell.col)
      ) {
        return {
          row: attachedCell.row,
          col: attachedCell.col
        };
      }

      var impact = resolution.impact;
      if (
        impact &&
        impact.center &&
        typeof impact.center.x === "number" &&
        isFinite(impact.center.x) &&
        typeof impact.center.y === "number" &&
        isFinite(impact.center.y)
      ) {
        return {
          x: impact.center.x,
          y: impact.center.y
        };
      }

      var blastExplosions = resolution.blastExplosions;
      if (Array.isArray(blastExplosions) && blastExplosions.length) {
        var blastExplosion = blastExplosions[0];
        if (
          !blastExplosion ||
          !Number.isInteger(blastExplosion.row) ||
          !Number.isInteger(blastExplosion.col)
        ) {
          throw new Error("Combo blast attach anchor requires blast explosion row and col.");
        }
        return {
          row: blastExplosion.row,
          col: blastExplosion.col
        };
      }

      throw new Error("Combo attach anchor requires resolution.attachedCell or impact.center.");
    },

    _registerComboElimination: function (resolution) {
      if (!resolution) {
        throw new Error("Combo registration requires resolution.");
      }

      var matchedCount = Array.isArray(resolution.matched) ? resolution.matched.length : 0;
      var floatingCount = Array.isArray(resolution.floating) ? resolution.floating.length : 0;
      if (matchedCount + floatingCount <= 0) {
        return;
      }

      this.comboStreak += 1;
      if (this.comboStreak > this.maxComboStreak) {
        this.maxComboStreak = this.comboStreak;
      }
      if (this.comboStreak < 2) {
        return;
      }

      var comboDisplay = this.comboStreak - 1;
      var comboBonusAlreadyApplied = resolution.comboMatchedScoreBonusApplied === true;
      var bonusGained = comboBonusAlreadyApplied
        ? resolution.comboMatchedScoreBonus
        : COMBO_BONUS_PER_HIT;
      if (!Number.isInteger(bonusGained) || bonusGained <= 0) {
        throw new Error("Combo bonus gained must be a positive integer.");
      }
      if (!comboBonusAlreadyApplied) {
        this.score += bonusGained;
        resolution.scoreDelta += bonusGained;
      }

      if (typeof this._pushRuntimeEvent === "function") {
        var attachAnchor = this._resolveComboAttachAnchor(resolution);
        var comboEventPayload = {
          combo_display: comboDisplay,
          combo_streak: this.comboStreak,
          bonus_gained: bonusGained
        };
        if (Object.prototype.hasOwnProperty.call(attachAnchor, "row")) {
          comboEventPayload.attach_row = attachAnchor.row;
          comboEventPayload.attach_col = attachAnchor.col;
        } else {
          comboEventPayload.attach_x = attachAnchor.x;
          comboEventPayload.attach_y = attachAnchor.y;
        }
        this._pushRuntimeEvent("combo_bonus_awarded", comboEventPayload);
      }

      Logger.info("Combo bonus", {
        comboDisplay: comboDisplay,
        comboStreak: this.comboStreak,
        bonusGained: bonusGained
      });
    },

    _applyJarCollectionScore: function (collectedDrops) {
      if (!collectedDrops || !collectedDrops.length) {
        return 0;
      }

      var jarColors = this.systems.jarCollectorSystem && Array.isArray(this.systems.jarCollectorSystem.jarColors)
        ? this.systems.jarCollectorSystem.jarColors
        : [];
      var scoredDrops = collectedDrops.filter(function (drop) {
        return !!(drop && typeof drop.color === "string" && jarColors.indexOf(drop.color) !== -1);
      });

      if (!scoredDrops.length) {
        return 0;
      }

      var jarCollectBase = this._getScoreRule("jarCollectBase");
      var jarCount = this.systems.jarCollectorSystem.jarCount;
      var scoreBoostMultiplier = this.jarScoreBoostActive
        ? Math.max(1, Number(this.jarScoreBoostMultiplier) || 1)
        : 1;
      var isScoreBoosted = scoreBoostMultiplier > 1;
      var computeDropPoints = function (drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        var sameColorMultiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
        if (typeof drop.fairyMultiplier !== "number" || !isFinite(drop.fairyMultiplier) || drop.fairyMultiplier < 1) {
          throw new Error("Scored jar drop requires fairyMultiplier >= 1.");
        }
        var multiplier = sameColorMultiplier * drop.fairyMultiplier * scoreBoostMultiplier;
        return Math.round(baseScore * multiplier);
      };
      var gainedByJarIndex = {};
      var gained = 0;
      scoredDrops.forEach(function (drop) {
        if (typeof drop.jarIndex !== "number" || !Number.isInteger(drop.jarIndex) || drop.jarIndex < 0) {
          throw new Error("Scored jar drop requires non-negative integer jarIndex.");
        }
        var dropPoints = computeDropPoints(drop);
        gained += dropPoints;
        gainedByJarIndex[drop.jarIndex] = (gainedByJarIndex[drop.jarIndex] || 0) + dropPoints;
      });
      var jarScoreEntries = Object.keys(gainedByJarIndex).map(function (jarIndexKey) {
        return {
          jar_index: Number(jarIndexKey),
          gained: gainedByJarIndex[jarIndexKey]
        };
      });
      jarScoreEntries.sort(function (left, right) {
        return left.jar_index - right.jar_index;
      });
      var scoredDropEntries = scoredDrops.map(function (drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        return {
          drop_id: drop.id,
          jar_index: drop.jarIndex,
          base_score: baseScore,
          same_color_multiplier: drop.bonusMultiplier,
          fairy_multiplier: drop.fairyMultiplier,
          score_boost_multiplier: scoreBoostMultiplier,
          final_score: computeDropPoints(drop)
        };
      });
      var stoneDropEntries = collectedDrops.filter(function (drop) {
        return drop && drop.entityCategory === "obstacle_ball" && drop.entityType === "stone";
      }).map(function (drop) {
        return {
          drop_id: drop.id,
          jar_index: drop.jarIndex,
          base_score: 0,
          same_color_multiplier: 1,
          fairy_multiplier: 1,
          score_boost_multiplier: 1,
          final_score: 0
        };
      });
      if (stoneDropEntries.length) {
        Array.prototype.push.apply(scoredDropEntries, stoneDropEntries);
      }
      var sameColorCount = scoredDrops.reduce(function (count, drop) {
        return count + (drop.sameColor && drop.scoreOnly !== true ? 1 : 0);
      }, 0);
      var bonusGained = scoredDrops.reduce(function (sum, drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        var total = computeDropPoints(drop);
        return sum + Math.max(0, total - baseScore);
      }, 0);

      this.score += gained;
      this.sameColorJarCollected += sameColorCount;
      this.sameColorJarBonusScore += bonusGained;

      if (this.lastResolution) {
        this.lastResolution.scoreDelta += gained;
      }
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("jar_collect_scored", {
          count: scoredDrops.length,
          gained: gained,
          entries: jarScoreEntries,
          drop_entries: scoredDropEntries,
          is_score_boosted: isScoreBoosted,
          boost_multiplier: scoreBoostMultiplier
        });
      }

      Logger.info("Jar collect", {
        count: scoredDrops.length,
        gained: gained,
        sameColorCount: sameColorCount,
        bonusGained: bonusGained,
        isScoreBoosted: isScoreBoosted,
        scoreBoostMultiplier: scoreBoostMultiplier
      });

      return gained;
    },

    _applyResolutionDropScore: function (resolution, matchedRuleKey, options) {
      if (!resolution) {
        return 0;
      }

      var scoreOptions = {};
      if (typeof options !== "undefined") {
        if (!options || typeof options !== "object" || Array.isArray(options)) {
          throw new Error("Resolution drop score options must be an object.");
        }
        scoreOptions = options;
      }
      if (typeof matchedRuleKey !== "undefined" && (typeof matchedRuleKey !== "string" || !matchedRuleKey)) {
        throw new Error("Matched score rule key must be a non-empty string.");
      }
      var ruleKey = typeof matchedRuleKey === "undefined" ? "matchedDrop" : matchedRuleKey;
      var matchedCount = Array.isArray(resolution.matched) ? resolution.matched.length : 0;
      var floatingCount = Array.isArray(resolution.floating) ? resolution.floating.length : 0;
      var baseMatchedScorePerBall = this._getScoreRule(ruleKey);
      if (!Number.isInteger(baseMatchedScorePerBall) || baseMatchedScorePerBall < 0) {
        throw new Error("Matched drop score rule must be a non-negative integer.");
      }
      var matchedScorePerBall = Object.prototype.hasOwnProperty.call(scoreOptions, "matchedScorePerBall")
        ? scoreOptions.matchedScorePerBall
        : baseMatchedScorePerBall;
      if (!Number.isInteger(matchedScorePerBall) || matchedScorePerBall < baseMatchedScorePerBall) {
        throw new Error("Matched score per ball must be an integer not lower than the base score.");
      }
      var matchedScore = matchedCount * matchedScorePerBall;
      var floatingScore = floatingCount * this._getScoreRule("floatingDrop");
      var gained = matchedScore + floatingScore;
      if (gained <= 0) {
        return 0;
      }

      var comboMatchedScoreBonus = matchedCount * (matchedScorePerBall - baseMatchedScorePerBall);
      resolution.comboMatchedScoreBonus = comboMatchedScoreBonus;
      resolution.comboMatchedScoreBonusApplied = comboMatchedScoreBonus > 0;
      resolution.matchedScorePerBall = matchedScorePerBall;
      this.score += gained;
      resolution.scoreDelta += gained;

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("drop_score_awarded", {
          matched: matchedCount,
          floating: floatingCount,
          matched_score_per_ball: matchedScorePerBall,
          gained: gained
        });
      }

      Logger.info("Drop score", {
        matched: matchedCount,
        floating: floatingCount,
        matchedScorePerBall: matchedScorePerBall,
        gained: gained
      });

      return gained;
    },

    _scheduleBoardViewportSettle: function (resolution) {
      if (this.systems.trappedSpriteRescueSystem.isActive()) {
        return false;
      }
      var viewport = this.systems.boardViewportSystem;
      var grid = this.systems.bubbleGrid;
      if (!viewport || !grid) {
        throw new Error("Board viewport settle requires BoardViewportSystem and BubbleGrid.");
      }
      if (viewport.introActive) {
        return false;
      }
      var boardSnapshot = grid.snapshot();
      viewport.planSettle(boardSnapshot);
      if (resolution) {
        resolution.boardViewportAdjusted = viewport.isMoving();
      }
      if (viewport.isMoving() && typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("board_view_move_started", {
          targetOffsetY: viewport.targetOffsetY
        });
      }
      return viewport.isMoving();
    },

    _onBoardViewportMoveFinished: function () {
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("board_view_move_finished", {});
      }
    },

    _tryTopAnchorCollapse: function () {
      if (this.systems.trappedSpriteRescueSystem.isActive()) {
        return false;
      }
      if (this.state !== "running" && this.state !== "out_of_shots_pending") {
        return false;
      }
      var grid = this.systems.bubbleGrid;
      var cells = grid.getCells();
      var wormholesByRow = {};
      cells.filter(function (cell) {
        return cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole";
      }).forEach(function (wormhole) {
        if (!wormholesByRow[wormhole.row]) {
          wormholesByRow[wormhole.row] = [];
        }
        wormholesByRow[wormhole.row].push(wormhole);
      });
      Object.keys(wormholesByRow).forEach(function (rowKey) {
        if (wormholesByRow[rowKey].length !== 2) {
          throw new Error("Top anchor collapse requires exactly two live wormholes on row " + rowKey + ".");
        }
      });
      if (!cells.length) {
        return false;
      }
      if (!Number.isInteger(grid.maxColumns) || grid.maxColumns <= 0) {
        throw new Error("Top anchor collapse requires positive integer bubbleGrid.maxColumns.");
      }
      if (!BoardViewportSystem.shouldTriggerTopAnchorCollapse(cells, grid.maxColumns)) {
        return false;
      }
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("top_anchor_collapse_started", {
          topRowCount: BoardViewportSystem.countTopRowOccupied(cells),
          topRowEmptySlots: BoardViewportSystem.countTopRowEmptySlots(cells, grid.maxColumns)
        });
      }
      var collapsibleCells = cells.filter(function (cell) {
        return !(cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole");
      });
      var removedCells = grid.removeFloatingCells(collapsibleCells);
      if (removedCells.length !== collapsibleCells.length) {
        throw new Error("Top anchor collapse must remove every non-wormhole board cell.");
      }
      this._cancelPendingSplitterSpawnsForDroppedCells(removedCells);
      if (this.lastResolution) {
        this.lastResolution.topAnchorCollapse = true;
        this._appendUniqueCells(this.lastResolution.floating, removedCells);
      }
      this._registerResolutionDrops(removedCells, grid, this.lastResolution, {
        dropKind: "victory_board_drop"
      }, {
        skipEliminationPresentationHold: true
      });
      this.state = "won_pending";
      return true;
    },

    _ensureMinimumVisibleBoardRows: function (resolution) {
      if (this.systems.trappedSpriteRescueSystem.isActive()) {
        return false;
      }
      if (this._tryTopAnchorCollapse()) {
        return true;
      }
      if (this.state !== "running" && this.state !== "out_of_shots_pending") {
        return false;
      }
      return this._scheduleBoardViewportSettle(resolution);
    },

    _refreshShotPlan: function (force) {
      if (this.state !== "running" || this.activeProjectile || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast()) {
        this.pendingShotPlan = null;
        return;
      }

      if (!force && !this.isAiming) {
        this.pendingShotPlan = null;
        return;
      }

      var shooterController = this.systems.shooterController;
      var cacheKey = this._buildShotPlanCacheKey({
        aim: {
          origin: shooterController.origin,
          direction: shooterController.aimDirection
        }
      });

      if (this.trajectoryCacheKey === cacheKey && this.trajectoryCachePlan) {
        this.pendingShotPlan = this.trajectoryCachePlan;
        return;
      }

      var planned = this.systems.trajectoryPredictor.predictShotPlan(
        this.systems.bubbleGrid,
        shooterController.origin,
        shooterController.aimDirection
      );

      if (planned && planned.valid) {
        if (planned.collidedCell) {
          planned.collidedCellPosition = this.systems.bubbleGrid.getCellPosition(
            planned.collidedCell.row,
            planned.collidedCell.col
          );
        }
        planned.pathPoints = buildProjectilePathFromShotPlan(planned);
        planned.totalDistance = measurePathDistance(planned.pathPoints);
      }

      this.pendingShotPlan = planned || null;
      this.trajectoryCacheKey = cacheKey;
      this.trajectoryCachePlan = planned || null;
    },

    _buildShotPlanCacheKey: function (shooterSnapshot) {
      var aim = shooterSnapshot && shooterSnapshot.aim ? shooterSnapshot.aim : { origin: { x: 0, y: 0 }, direction: { x: 0, y: 1 } };
      var direction = aim.direction || { x: 0, y: 1 };
      var origin = aim.origin || { x: 0, y: 0 };
      var grid = this.systems.bubbleGrid;
      var quantizedDX = quantize(direction.x, 0.001).toFixed(3);
      var quantizedDY = quantize(direction.y, 0.001).toFixed(3);
      var quantizedOX = quantize(origin.x, 0.1).toFixed(1);
      var quantizedOY = quantize(origin.y, 0.1).toFixed(1);

      return [
        grid.version,
        grid.getViewportOffsetY(),
        this.systems.trajectoryPredictor.maxBounces,
        quantizedOX,
        quantizedOY,
        quantizedDX,
        quantizedDY
      ].join("|");
    },

    _buildRainbowAssimilationContext: function (targetCell) {
      var grid = this.systems.bubbleGrid;
      var contactsByKey = {};
      var contactCells = [];
      var candidatesByColor = {};
      var rainbowQueue = [];
      var rainbowVisited = {};

      var addContactCell = function (cell) {
        var key = cell.row + ":" + cell.col;
        if (!contactsByKey[key]) {
          contactsByKey[key] = true;
          contactCells.push(cell);
        }
      };

      var addCandidateCell = function (cell) {
        var position = grid.getCellPosition(cell.row, cell.col);
        var candidate = candidatesByColor[cell.color];
        if (
          !candidate ||
          position.y > candidate.position.y ||
          (position.y === candidate.position.y && position.x < candidate.position.x)
        ) {
          candidatesByColor[cell.color] = {
            color: cell.color,
            sourceCell: cell,
            position: position
          };
        }
      };

      var enqueueRainbowContact = function (cell) {
        var key = cell.row + ":" + cell.col;
        addContactCell(cell);
        if (!rainbowVisited[key]) {
          rainbowVisited[key] = true;
          rainbowQueue.push(cell);
        }
      };

      grid.getNeighborCoordinates(targetCell.row, targetCell.col).forEach(function (coord) {
        var cell = grid.getCell(coord.row, coord.col);
        if (cell) {
          if (typeof cell.color === "string" && cell.color) {
            addContactCell(cell);
            addCandidateCell(cell);
          } else if (isRainbowBall(cell)) {
            enqueueRainbowContact(cell);
          }
        }
      });

      for (var cursor = 0; cursor < rainbowQueue.length; cursor += 1) {
        var rainbowCell = rainbowQueue[cursor];
        grid.getNeighborCoordinates(rainbowCell.row, rainbowCell.col).forEach(function (coord) {
          var cell = grid.getCell(coord.row, coord.col);
          if (cell) {
            if (typeof cell.color === "string" && cell.color) {
              addCandidateCell(cell);
            } else if (isRainbowBall(cell)) {
              enqueueRainbowContact(cell);
            }
          }
        });
      }

      return {
        contactCells: contactCells,
        candidates: Object.keys(candidatesByColor).map(function (color) {
          return candidatesByColor[color];
        })
      };
    },

    _buildRainbowContactCandidates: function (targetCell) {
      return this._buildRainbowAssimilationContext(targetCell).candidates;
    },

    _isRainbowSelfOnlyContact: function (cell) {
      return !!(
        isBlastBall(cell) ||
        (
          cell &&
          cell.entityCategory === "obstacle_ball" &&
          cell.entityType === "stone"
        )
      );
    },

    _selectRandomRainbowAttachColor: function () {
      var level = this.currentLevel && this.currentLevel.level ? this.currentLevel.level : null;
      if (!level || !Array.isArray(level.colors) || !level.colors.length) {
        throw new Error("Rainbow random attach requires level.colors.");
      }
      if (!level.spawnWeights || typeof level.spawnWeights !== "object" || Array.isArray(level.spawnWeights)) {
        throw new Error("Rainbow random attach requires level.spawnWeights.");
      }

      var colors = level.colors.slice();
      var totalWeight = colors.reduce(function (sum, colorCode) {
        var weight = level.spawnWeights[colorCode];
        if (typeof weight !== "number" || weight <= 0) {
          throw new Error("Rainbow random attach spawn weight must be > 0: " + colorCode);
        }

        return sum + weight;
      }, 0);
      var threshold = Math.random() * totalWeight;
      var running = 0;

      for (var i = 0; i < colors.length; i += 1) {
        var colorCode = colors[i];
        running += level.spawnWeights[colorCode];
        if (threshold <= running) {
          return colorCode;
        }
      }

      throw new Error("Rainbow random attach failed to select a color.");
    },

    _getVirtualRainbowColorAt: function (cell, colorByKey) {
      var key = cell.row + ":" + cell.col;
      if (Object.prototype.hasOwnProperty.call(colorByKey, key)) {
        return colorByKey[key];
      }

      var gridCell = this.systems.bubbleGrid.getCell(cell.row, cell.col);
      return gridCell && typeof gridCell.color === "string" ? gridCell.color : null;
    },

    _findVirtualRainbowMatchGroup: function (targetCell, colorByKey) {
      var grid = this.systems.bubbleGrid;
      var targetColor = this._getVirtualRainbowColorAt(targetCell, colorByKey);
      if (!targetColor) {
        throw new Error("Rainbow resolution requires a target color.");
      }

      var queue = [{
        row: targetCell.row,
        col: targetCell.col
      }];
      var visited = {};
      var group = [];

      for (var cursor = 0; cursor < queue.length; cursor += 1) {
        var current = queue[cursor];
        var key = current.row + ":" + current.col;
        if (visited[key]) {
          continue;
        }

        visited[key] = true;
        if (this._getVirtualRainbowColorAt(current, colorByKey) !== targetColor) {
          continue;
        }

        group.push({
          row: current.row,
          col: current.col
        });

        grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
          var neighborKey = neighbor.row + ":" + neighbor.col;
          if (visited[neighborKey]) {
            return;
          }

          if (this._getVirtualRainbowColorAt(neighbor, colorByKey) === targetColor) {
            queue.push({
              row: neighbor.row,
              col: neighbor.col
            });
          }
        }, this);
      }

      if (!this.systems.matchSystem || !Number.isInteger(this.systems.matchSystem.matchThreshold)) {
        throw new Error("Rainbow resolution requires MatchSystem.matchThreshold.");
      }

      var threshold = this.systems.matchSystem.matchThreshold;
      return group.length >= threshold ? group : [];
    },

    _evaluateRainbowCandidate: function (targetCell, contactCells, candidate) {
      var colorByKey = {};
      colorByKey[targetCell.row + ":" + targetCell.col] = candidate.color;
      contactCells.forEach(function (cell) {
        colorByKey[cell.row + ":" + cell.col] = candidate.color;
      });

      var matchedCells = this._findVirtualRainbowMatchGroup(targetCell, colorByKey);
      return {
        color: candidate.color,
        sourceCell: candidate.sourceCell,
        position: candidate.position,
        dropCount: matchedCells.length,
        matchedCount: matchedCells.length
      };
    },

    _selectRainbowAssimilation: function (targetCell, collidedCell) {
      if (this._isRainbowSelfOnlyContact(collidedCell)) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: [],
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var context = this._buildRainbowAssimilationContext(targetCell);
      var contactCells = context.contactCells;
      if (!contactCells.length) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: [],
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var candidates = context.candidates;
      if (!candidates.length) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: contactCells,
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var best = null;
      candidates.forEach(function (candidate) {
        var evaluated = this._evaluateRainbowCandidate(targetCell, contactCells, candidate);
        if (
          !best ||
          evaluated.dropCount > best.dropCount ||
          (
            evaluated.dropCount === best.dropCount &&
            (
              evaluated.position.y > best.position.y ||
              (evaluated.position.y === best.position.y && evaluated.position.x < best.position.x)
            )
          )
        ) {
          best = evaluated;
        }
      }, this);

      return {
        color: best.color,
        contactCells: contactCells,
        expectedDropCount: best.dropCount,
        matchedCount: best.matchedCount
      };
    },

    _resolveRainbowShot: function (projectile, targetCell) {
      var grid = this.systems.bubbleGrid;
      var collidedCell = projectile && projectile.shotPlan ? projectile.shotPlan.collidedCell : null;
      var assimilation = this._selectRainbowAssimilation(targetCell, collidedCell);
      grid.addBubble(targetCell, assimilation.color);
      assimilation.contactCells.forEach(function (cell) {
        grid.addBubble({
          row: cell.row,
          col: cell.col
        }, assimilation.color);
      });

      var attachedBubble = grid.getCell(targetCell.row, targetCell.col);
      return this._resolveAttachment(attachedBubble);
    },

    _injectCollectedSkillBalls: function (collectedDrops) {
      var skillCells = (collectedDrops || []).filter(function (cell) {
        return isSkillBall(cell) && (cell.entityType === "rainbow" || cell.entityType === "blast");
      });
      if (!skillCells.length) {
        return 0;
      }

      var resolution = this.lastResolution;
      if (!resolution || !Array.isArray(resolution.injectedSkills)) {
        return 0;
      }

      skillCells.sort(function (a, b) {
        var leftJar = typeof a.jarIndex === "number" ? a.jarIndex : -1;
        var rightJar = typeof b.jarIndex === "number" ? b.jarIndex : -1;
        if (leftJar !== rightJar) {
          return leftJar - rightJar;
        }

        return String(a.id || "").localeCompare(String(b.id || ""));
      });

      var injectedCount = 0;
      skillCells.forEach(function (cell) {
        var receiveResult = this.systems.shooterController.addSkillInventory(cell.entityType, 1);
        if (receiveResult && receiveResult.accepted) {
          resolution.injectedSkills.push({
            id: cell.id,
            entityType: cell.entityType,
            status: "stored",
            total: receiveResult.total,
            jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
          });
          if (typeof this._pushRuntimeEvent === "function") {
            this._pushRuntimeEvent("skill_powerup_collected", {
              entityType: cell.entityType,
              sourceId: cell.id,
              total: receiveResult.total,
              jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
            });
          }
          injectedCount += 1;
        }
      }, this);

      return injectedCount;
    },

    _appendUniqueCells: function (target, cells) {
      var seen = {};
      (target || []).forEach(function (cell) {
        if (cell) {
          seen[cell.row + ":" + cell.col + ":" + cell.id] = true;
        }
      });
      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        var key = cell.row + ":" + cell.col + ":" + cell.id;
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        target.push(cell);
      });
      return target;
    },

    _findMatchedBallCollectionObjective: function () {
      if (typeof listCollectionRewardObjectives !== "function") {
        throw new Error("Matched objective collection requires listCollectionRewardObjectives.");
      }
      var objectives = listCollectionRewardObjectives(this.currentLevel);
      for (var index = 0; index < objectives.length; index += 1) {
        var objective = objectives[index];
        if (objective && (objective.type === "collect_any" || objective.type === "collect_color")) {
          return objective;
        }
      }
      return null;
    },

    _buildMatchedObjectiveCollectionEntries: function (collectedCells, eliminationSequence, grid) {
      if (!Array.isArray(collectedCells)) {
        throw new Error("Matched objective collection entries require collected cells array.");
      }
      if (!Array.isArray(eliminationSequence)) {
        throw new Error("Matched objective collection entries require eliminationSequence array.");
      }
      if (grid !== undefined && (!grid || typeof grid.getCellPosition !== "function")) {
        throw new Error("Matched objective collection entries require grid.getCellPosition when grid is provided.");
      }

      var sequenceByCellId = {};
      eliminationSequence.forEach(function (entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error("Matched objective collection sequence entry must be an object.");
        }
        if (typeof entry.cellId !== "string" && typeof entry.cellId !== "number") {
          throw new Error("Matched objective collection sequence entry requires cellId.");
        }
        sequenceByCellId[String(entry.cellId)] = entry;
      });

      return collectedCells.map(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collected cell requires id.");
        }
        var sequenceEntry = sequenceByCellId[String(cell.id)];
        if (!sequenceEntry) {
          if (!grid) {
            throw new Error("Matched objective collected cell missing elimination sequence: " + cell.id);
          }
          var cellPosition = requireFinitePoint(
            grid.getCellPosition(cell.row, cell.col),
            "Matched objective collected cell"
          );
          return {
            id: cell.id,
            color: cell.color,
            row: cell.row,
            col: cell.col,
            worldPosition: {
              x: cellPosition.x,
              y: cellPosition.y
            },
            delayMs: 0
          };
        }
        if (
          !sequenceEntry.worldPosition ||
          typeof sequenceEntry.worldPosition.x !== "number" ||
          typeof sequenceEntry.worldPosition.y !== "number" ||
          !isFinite(sequenceEntry.worldPosition.x) ||
          !isFinite(sequenceEntry.worldPosition.y)
        ) {
          throw new Error("Matched objective collection requires sequence worldPosition: " + cell.id);
        }

        return {
          id: cell.id,
          color: cell.color,
          row: cell.row,
          col: cell.col,
          worldPosition: {
            x: sequenceEntry.worldPosition.x,
            y: sequenceEntry.worldPosition.y
          },
          delayMs: sequenceEntry.delayMs
        };
      });
    },

    _registerMatchedObjectiveCollection: function (matchedCells, eliminationSequence, resolution, grid) {
      if (!resolution) {
        throw new Error("Matched objective collection requires resolution.");
      }
      if (!Array.isArray(matchedCells)) {
        throw new Error("Matched objective collection requires matched cells array.");
      }
      if (!Array.isArray(resolution.matchedObjectiveCollected)) {
        throw new Error("Resolution requires matchedObjectiveCollected array.");
      }

      var objective = this._findMatchedBallCollectionObjective();
      if (!objective) {
        return [];
      }
      var jarCollectorSystem = this.systems.jarCollectorSystem;
      if (!jarCollectorSystem || typeof jarCollectorSystem.collectEliminatedObjectiveCells !== "function") {
        throw new Error("Matched objective collection requires JarCollectorSystem.collectEliminatedObjectiveCells.");
      }

      var alreadyCollected = {};
      resolution.matchedObjectiveCollected.forEach(function (entry) {
        if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
          throw new Error("Resolution matchedObjectiveCollected entry requires id.");
        }
        alreadyCollected[String(entry.id)] = true;
      });
      var pendingCells = matchedCells.filter(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collection matched cell requires id.");
        }
        return alreadyCollected[String(cell.id)] !== true;
      });
      if (!pendingCells.length) {
        return [];
      }

      var collectedCells = jarCollectorSystem.collectEliminatedObjectiveCells(pendingCells, objective);
      if (!collectedCells.length) {
        return [];
      }

      var eventEntries = this._buildMatchedObjectiveCollectionEntries(collectedCells, eliminationSequence, grid);
      resolution.matchedObjectiveCollected = resolution.matchedObjectiveCollected.concat(eventEntries);
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("matched_objective_collect", {
          objectiveType: objective.type,
          objectiveColor: objective.type === "collect_color" ? objective.color : null,
          count: eventEntries.length,
          entries: eventEntries
        });
      }
      return eventEntries;
    },

    _splitMolotovDropCandidates: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Molotov drop candidate split requires cells array.");
      }
      var immediate = [];
      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Molotov drop candidate cell is required.");
        }
        if (isKeyBall(cell)) {
          continue;
        }
        immediate.push(cell);
      }
      return {
        immediate: immediate
      };
    },

    _buildThawedFloatingIceDropCell: function (cell) {
      if (!isIceBall(cell)) {
        throw new Error("Thawed floating ice drop requires ice obstacle cell.");
      }
      var innerColor = resolveIceInnerColor(cell);
      if (typeof innerColor !== "string" || !innerColor) {
        throw new Error("Thawed floating ice drop requires innerColor.");
      }

      var thawedDropCell = clone(cell);
      thawedDropCell.entityCategory = "normal_ball";
      thawedDropCell.entityType = null;
      thawedDropCell.color = innerColor;
      thawedDropCell.iceSnowballAlreadyCollected = true;
      return thawedDropCell;
    },

    _prepareResolutionDropCells: function (cells, resolution) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop preparation requires cells array.");
      }

      var immediateCells = [];
      var delayedIceDropCells = [];

      cells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop preparation requires cell.");
        }
        if (!isIceBall(cell)) {
          immediateCells.push(cell);
          return;
        }
        if (!resolution) {
          throw new Error("Resolution drop preparation requires resolution when ice cells are present.");
        }
        if (typeof this._registerIceCollection !== "function") {
          throw new Error("Resolution drop preparation requires _registerIceCollection for ice cells.");
        }

        var innerColor = resolveIceInnerColor(cell);
        if (typeof innerColor !== "string" || !innerColor) {
          throw new Error("Floating ice drop requires innerColor.");
        }

        resolution.iceCollected += this._registerIceCollection([cell]);
        if (!Array.isArray(resolution.thawed)) {
          resolution.thawed = [];
        }
        resolution.thawed.push({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          color: innerColor
        });
        delayedIceDropCells.push(this._buildThawedFloatingIceDropCell(cell));
      }, this);

      return {
        immediate: immediateCells,
        delayedIce: delayedIceDropCells
      };
    },

    _buildResolutionDropRegisterOptions: function (resolution, dropOptions, timingOptions) {
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }
      if (
        timingOptions &&
        Object.prototype.hasOwnProperty.call(timingOptions, "skipAssistSpiritSkillCharge") &&
        typeof timingOptions.skipAssistSpiritSkillCharge !== "boolean"
      ) {
        throw new Error("Resolution drop registration timingOptions.skipAssistSpiritSkillCharge must be boolean.");
      }

      var matchedCellsForDelay = timingOptions && timingOptions.matchedCellsForDelay;
      if (
        matchedCellsForDelay !== undefined &&
        (!Array.isArray(matchedCellsForDelay) || !matchedCellsForDelay.length)
      ) {
        throw new Error("Resolution drop registration matchedCellsForDelay must be a non-empty array when provided.");
      }

      var skipEliminationPresentationHold = !!(
        timingOptions &&
        Object.prototype.hasOwnProperty.call(timingOptions, "skipEliminationPresentationHold")
      );
      if (skipEliminationPresentationHold && timingOptions.skipEliminationPresentationHold !== true) {
        throw new Error("Resolution drop registration skipEliminationPresentationHold must be true when provided.");
      }

      var requiresEliminationHold = skipEliminationPresentationHold
        ? false
        : EliminationSequenceBuilder.resolveRequiresEliminationPresentationHold(
          resolution,
          matchedCellsForDelay
        );
      var baseDelay = 0;
      if (dropOptions && Object.prototype.hasOwnProperty.call(dropOptions, "startDelay")) {
        if (
          typeof dropOptions.startDelay !== "number" ||
          !Number.isFinite(dropOptions.startDelay) ||
          dropOptions.startDelay < 0
        ) {
          throw new Error("Resolution drop registration dropOptions.startDelay must be a non-negative number.");
        }
        baseDelay = dropOptions.startDelay;
      }

      var registerOptions = dropOptions ? Object.assign({}, dropOptions) : {};
      registerOptions.startDelay = baseDelay;
      if (requiresEliminationHold) {
        registerOptions.holdUntilEliminationPresentationComplete = true;
      }
      return registerOptions;
    },

    _registerResolutionDrops: function (cells, grid, resolution, dropOptions, timingOptions) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop registration requires cells array.");
      }
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }

      var pendingCells = cells.filter(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop registration requires cell.");
        }
        return cell.__resolutionDropRegistered !== true;
      });
      if (!pendingCells.length) {
        return;
      }

      if (!timingOptions || timingOptions.skipAssistSpiritSkillCharge !== true) {
        this._collectAssistSpiritSkillCharge(pendingCells, "floating_drop");
      }

      var prepared = this._prepareResolutionDropCells(pendingCells, resolution);
      var registerOptions = this._buildResolutionDropRegisterOptions(resolution, dropOptions, timingOptions);
      var immediateCandidates = this._splitMolotovDropCandidates(prepared.immediate);
      if (immediateCandidates.immediate.length) {
        this.systems.fallingMarbleSystem.registerDrops(
          immediateCandidates.immediate,
          grid,
          registerOptions
        );
        immediateCandidates.immediate.forEach(function (cell) {
          cell.__resolutionDropRegistered = true;
        });
      }

      if (prepared.delayedIce.length) {
        var delayedCandidates = this._splitMolotovDropCandidates(prepared.delayedIce);
        if (delayedCandidates.immediate.length) {
          var delayedIceRegisterOptions = this._buildResolutionDropRegisterOptions(
            resolution,
            { startDelay: FLOATING_ICE_DROP_DELAY },
            timingOptions
          );
          this.systems.fallingMarbleSystem.registerDrops(
            delayedCandidates.immediate,
            grid,
            delayedIceRegisterOptions
          );
          delayedCandidates.immediate.forEach(function (cell) {
            cell.__resolutionDropRegistered = true;
          });
        }
      }
    },

    _resolveFairyAssistsAfterResolution: function (resolution) {
      if (!resolution || !Array.isArray(resolution.fairyAssistEvents)) {
        throw new Error("Fairy assist resolution requires resolution.fairyAssistEvents.");
      }
      if (resolution.fairyAssistResolved === true) {
        throw new Error("Fairy assist resolution cannot run twice for one shot.");
      }
      if (!this.systems || !this.systems.fairyAssistSystem) {
        throw new Error("Fairy assist resolution requires FairyAssistSystem.");
      }

      resolution.fairyAssistEvents = this.systems.fairyAssistSystem.resolveAfterShot(
        resolution,
        this.systems.bubbleGrid
      );
      this._pushFairyAssistDepartEvents(resolution.fairyAssistEvents);
      resolution.fairyAssistResolved = true;
    },

    _resetMolotovBlastSequence: function () {
      this.pendingMolotovBlastQueue = [];
      this.activeMolotovBlast = null;
      this.molotovBlastTriggeredIds = {};
    },

    _queueMolotovBlasts: function (molotovs, resolution) {
      if (!Array.isArray(molotovs)) {
        throw new Error("Molotov blast queue requires molotovs array.");
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast queue requires resolution.reactiveTriggered.");
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue)) {
        throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
      }
      if (!this.molotovBlastTriggeredIds || typeof this.molotovBlastTriggeredIds !== "object") {
        throw new Error("GameManager molotovBlastTriggeredIds must be an object.");
      }

      molotovs.forEach(function (molotov) {
        if (!molotov || (typeof molotov.id !== "string" && typeof molotov.id !== "number")) {
          throw new Error("Molotov blast queue requires molotov id.");
        }
        if (this.molotovBlastTriggeredIds[molotov.id]) {
          return;
        }
        var radius = molotov.blastRadius;
        if (!Number.isInteger(radius) || radius !== 2) {
          throw new Error("Molotov blastRadius must be 2.");
        }
        if (!Number.isInteger(molotov.row) || !Number.isInteger(molotov.col)) {
          throw new Error("Molotov blast queue requires molotov coordinates.");
        }
        this.molotovBlastTriggeredIds[molotov.id] = true;
        this.pendingMolotovBlastQueue.push({
          id: molotov.id,
          row: molotov.row,
          col: molotov.col,
          blastRadius: radius
        });
      }, this);

      this._startNextMolotovBlastIfIdle(resolution);
    },

    _startNextMolotovBlastIfIdle: function (resolution) {
      if (this.activeMolotovBlast) {
        return;
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue) || !this.pendingMolotovBlastQueue.length) {
        return;
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast start requires resolution.reactiveTriggered.");
      }

      var next = this.pendingMolotovBlastQueue.shift();
      if (!next || (typeof next.id !== "string" && typeof next.id !== "number")) {
        throw new Error("Molotov blast start requires pending entry id.");
      }
      if (!Number.isInteger(next.row) || !Number.isInteger(next.col)) {
        throw new Error("Molotov blast start requires pending entry coordinates.");
      }
      if (!Number.isInteger(next.blastRadius) || next.blastRadius !== 2) {
        throw new Error("Molotov blast start requires blastRadius 2.");
      }

      this.activeMolotovBlast = {
        id: next.id,
        row: next.row,
        col: next.col,
        blastRadius: next.blastRadius,
        elapsed: 0,
        blastExecuted: false,
        completeExecuted: false
      };
      resolution.reactiveTriggered.push({
        id: next.id,
        entityType: "molotov",
        row: next.row,
        col: next.col
      });
      this._pushBombExplosionEvent();
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _executeMolotovBlastPhaseAtAnimationStart: function (resolution) {
      if (MOLOTOV_BLAST_TRIGGER_DELAY !== 0) {
        return false;
      }
      if (!this.activeMolotovBlast || this.activeMolotovBlast.blastExecuted) {
        return false;
      }
      if (!this.molotovPendingResolutionContext) {
        return false;
      }
      this.activeMolotovBlast.blastExecuted = true;
      this._executeMolotovBlastPhase(this.activeMolotovBlast, this.systems.bubbleGrid, resolution);
      return true;
    },

    _executeMolotovBlastPhase: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast phase requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast phase requires active blast coordinates.");
      }
      if (!Number.isInteger(active.blastRadius) || active.blastRadius !== 2) {
        throw new Error("Molotov blast phase requires blastRadius 2.");
      }
      if (!resolution) {
        throw new Error("Molotov blast phase requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast phase requires molotovPendingResolutionContext.allRemoved.");
      }

      var blastCells = [];
      grid.getCoordinatesWithinRadius(active.row, active.col, active.blastRadius).forEach(function (coord) {
        if (coord.distance === 0) {
          return;
        }
        var occupiedCell = grid.getCell(coord.row, coord.col);
        if (!occupiedCell || isLockedBall(occupiedCell)) {
          return;
        }
        blastCells.push(occupiedCell);
      });

      this._resolveVineSpiritsHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedByBlast = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedByBlast, grid, resolution);
      appendMolotovEliminationSequence(resolution, removedByBlast, grid);
      this._pushBubbleBreakEvent(removedByBlast, resolution.eliminationSequence);
      removedByBlast.forEach(function (cell) {
        cell.__molotovBlastVelocity = buildMolotovBlastDropVelocity(active, cell, grid);
      });

      var removedKeys = this._triggerKeysAndResolveUnlocks(removedByBlast, grid, resolution);
      var triggeredSplitterIds = this.molotovPendingResolutionContext.triggeredSplitterIds;
      if (!triggeredSplitterIds || typeof triggeredSplitterIds !== "object" || Array.isArray(triggeredSplitterIds)) {
        throw new Error("Molotov blast phase requires context.triggeredSplitterIds.");
      }
      this._triggerAdjacentSplitters(removedByBlast, grid, resolution, triggeredSplitterIds);

      var chainMolotovs = this._collectAdjacentMolotovs(removedByBlast, grid, this.molotovBlastTriggeredIds);
      this._queueMolotovBlasts(chainMolotovs, resolution);

      var removedSourceMolotov = [];
      var liveSourceMolotov = grid.getCell(active.row, active.col);
      if (liveSourceMolotov) {
        if (!isMolotovBall(liveSourceMolotov)) {
          throw new Error("Molotov blast source cell is not molotov.");
        }
        removedSourceMolotov = grid.removeCells([liveSourceMolotov]);
        this._resolveVinesAfterRemoval(removedSourceMolotov, grid, resolution);
        appendMolotovEliminationSequence(resolution, removedSourceMolotov, grid);
        this._pushBubbleBreakEvent(removedSourceMolotov, resolution.eliminationSequence);
        this._registerMatchedObjectiveCollection(removedSourceMolotov, resolution.eliminationSequence, resolution, grid);
      }

      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedKeys);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedByBlast);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedSourceMolotov);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedByBlast.concat(removedKeys).concat(removedSourceMolotov));
      this._registerResolutionDrops(
        removedByBlast.concat(removedKeys),
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved.slice()
        }
      );

      resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
      this._registerMatchedObjectiveCollection(removedByBlast, resolution.eliminationSequence, resolution, grid);
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
    },

    _completeMolotovBlast: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast completion requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast completion requires active blast coordinates.");
      }
      if (!resolution) {
        throw new Error("Molotov blast completion requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast completion requires molotovPendingResolutionContext.allRemoved.");
      }

      var liveMolotov = grid.getCell(active.row, active.col);
      if (liveMolotov) {
        if (!isMolotovBall(liveMolotov)) {
          throw new Error("Molotov blast completion cell is not molotov.");
        }
        var removedMolotov = grid.removeCells([liveMolotov]);
        appendMolotovEliminationSequence(resolution, removedMolotov, grid);
        this._pushBubbleBreakEvent(removedMolotov, resolution.eliminationSequence);
        this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedMolotov);
        resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
        resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
        this._registerMatchedObjectiveCollection(removedMolotov, resolution.eliminationSequence, resolution, grid);
        this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
      }
    },

    _updatePendingMolotovBlasts: function (dt) {
      if (!this._hasPendingMolotovBlasts()) {
        return false;
      }
      if (this._isBoardAdvanceBusy()) {
        return false;
      }

      var safeDt = Number(dt);
      if (!Number.isFinite(safeDt) || safeDt < 0) {
        throw new Error("Pending molotov blast update requires non-negative finite dt.");
      }
      if (!this.lastResolution) {
        throw new Error("Pending molotov blast update requires lastResolution.");
      }

      var grid = this.systems.bubbleGrid;
      var resolution = this.lastResolution;
      var updated = false;

      if (!this.activeMolotovBlast) {
        if (!this.pendingMolotovBlastQueue.length && this.molotovResolutionPending) {
          this._finalizeMolotovPendingResolution();
          return true;
        }
        this._startNextMolotovBlastIfIdle(resolution);
        return !!this.activeMolotovBlast;
      }

      var active = this.activeMolotovBlast;
      active.elapsed += safeDt;

      if (!active.blastExecuted && active.elapsed >= MOLOTOV_BLAST_TRIGGER_DELAY) {
        active.blastExecuted = true;
        this._executeMolotovBlastPhase(active, grid, resolution);
        updated = true;
      }

      if (!active.completeExecuted && active.elapsed >= MOLOTOV_BLAST_ANIMATION_DURATION) {
        active.completeExecuted = true;
        this._completeMolotovBlast(active, grid, resolution);
        this.activeMolotovBlast = null;
        updated = true;

        if (this.pendingMolotovBlastQueue.length) {
          this._startNextMolotovBlastIfIdle(resolution);
        } else {
          this._finalizeMolotovPendingResolution();
        }
      }

      if (grid && typeof grid.assertNoVisualOverlap === "function") {
        grid.assertNoVisualOverlap("pending molotov blast");
      }
      return updated;
    },

    _beginMolotovPendingResolution: function (resolution, dropScoreRuleKey, syncRemoved) {
      if (!resolution) {
        throw new Error("Molotov pending resolution requires resolution.");
      }
      if (typeof dropScoreRuleKey !== "string" || !dropScoreRuleKey) {
        throw new Error("Molotov pending resolution requires dropScoreRuleKey.");
      }
      if (!Array.isArray(syncRemoved)) {
        throw new Error("Molotov pending resolution requires syncRemoved array.");
      }

      this.molotovResolutionPending = true;
      this.molotovPendingResolutionContext = {
        dropScoreRuleKey: dropScoreRuleKey,
        allRemoved: syncRemoved.slice(),
        triggeredSplitterIds: {}
      };

      this._cancelPendingSplitterSpawnsForDroppedCells(syncRemoved);
      this.molotovPendingResolutionContext.triggeredSplitterIds = buildTriggeredSplitterIdsFromPendingSpawns(this.pendingSplitterSpawns);
      this.systems.jarCollectorSystem.collect([]);

      appendMolotovEliminationSequence(resolution, syncRemoved, this.systems.bubbleGrid);
      this._pushBubbleBreakEvent(syncRemoved, resolution.eliminationSequence);
      resolution.matched = syncRemoved.slice();
      resolution.collected = syncRemoved.slice();
      this._registerMatchedObjectiveCollection(
        syncRemoved,
        resolution.eliminationSequence,
        resolution,
        this.systems.bubbleGrid
      );
      resolution.boardCleared = false;
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _resolveMolotovFloatingAfterBoardMutation: function (grid, resolution) {
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov floating resolution requires molotovPendingResolutionContext.allRemoved.");
      }
      if (!grid || typeof grid.removeCells !== "function") {
        throw new Error("Molotov floating resolution requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.floating)) {
        throw new Error("Molotov floating resolution requires resolution.floating array.");
      }
      if (!this.systems.supportSystem || typeof this.systems.supportSystem.findFloatingCells !== "function") {
        throw new Error("Molotov floating resolution requires supportSystem.findFloatingCells.");
      }

      var removedAllFloating = [];
      while (true) {
        if (Array.isArray(resolution.collectedKeys) && resolution.collectedKeys.length) {
          this._resolveCollectedKeyUnlocks(grid, resolution);
        }

        var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
        if (!floatingCells.length) {
          break;
        }
        var removedFloating = grid.removeFloatingCells(floatingCells);
        if (!removedFloating.length) {
          throw new Error("Molotov floating resolution found cells that could not be removed.");
        }

        this._appendUniqueCells(removedAllFloating, removedFloating);
        this._appendUniqueCells(resolution.floating, removedFloating);
        this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
        this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
        this._removeSpawnedSplitterEntriesForCells(removedFloating, resolution);
        this._registerResolutionDrops(
          removedFloating,
          grid,
          resolution,
          undefined,
          {
            matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved
          }
        );
        this.systems.jarCollectorSystem.collect([]);
      }
      if (!removedAllFloating.length) {
        return [];
      }
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.concat(resolution.floating);
      return removedAllFloating;
    },

    _finalizeMolotovPendingResolution: function () {
      if (!this.molotovResolutionPending) {
        return;
      }
      var context = this.molotovPendingResolutionContext;
      if (!context || !Array.isArray(context.allRemoved)) {
        throw new Error("Molotov pending resolution finalize requires context.allRemoved.");
      }
      if (typeof context.dropScoreRuleKey !== "string" || !context.dropScoreRuleKey) {
        throw new Error("Molotov pending resolution finalize requires dropScoreRuleKey.");
      }
      if (!this.lastResolution) {
        throw new Error("Molotov pending resolution finalize requires lastResolution.");
      }

      var resolution = this.lastResolution;
      var grid = this.systems.bubbleGrid;
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);

      resolution.matched = context.allRemoved.slice();
      resolution.collected = context.allRemoved.concat(resolution.floating);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, context.dropScoreRuleKey);
      this._registerComboElimination(resolution);

      this.molotovResolutionPending = false;
      this.molotovPendingResolutionContext = null;
      this._resolveFairyAssistsAfterResolution(resolution);

      if (this._beginSwirlRotationForResolution(resolution)) {
        return;
      }
      if (this._beginWormholeShiftForResolution(resolution)) {
        return;
      }
      if (this._beginVineCastForResolution(resolution)) {
        return;
      }

      if (resolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }
      if (this._tryTopAnchorCollapse()) {
        return;
      }
      var eliminationPresentationWasComplete = this.pendingBoardAdvanceEliminationPresentation === false;
      if (this._applyPostImpactBoardShiftPolicy(resolution)) {
        if (eliminationPresentationWasComplete) {
          this.notifyBoardAdvanceEliminationPresentationComplete();
        }
        return;
      }
      if (this._scheduleBoardAdvanceAfterImpact()) {
        return;
      }
      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
      }
    },

    _cancelPendingSplitterSpawnsForDroppedCells: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Cancel pending splitter spawns requires cells array.");
      }
      if (typeof this._cancelPendingSplitterSpawn !== "function") {
        throw new Error("Cancel pending splitter spawns requires GameManager._cancelPendingSplitterSpawn.");
      }

      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Cancel pending splitter spawns requires cell.");
        }
        if (isSplitterBall(cell)) {
          this._cancelPendingSplitterSpawn(cell);
        }
      }
    },

    _removeSpawnedSplitterEntriesForCells: function (cells, resolution) {
      if (!Array.isArray(cells)) {
        throw new Error("Remove spawned splitter entries requires cells array.");
      }
      if (!resolution || !Array.isArray(resolution.spawnedBySplitters)) {
        throw new Error("Remove spawned splitter entries requires resolution.spawnedBySplitters array.");
      }
      if (!cells.length || !resolution.spawnedBySplitters.length) {
        return 0;
      }

      var removedKeys = {};
      cells.forEach(function (cell) {
        if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
          throw new Error("Remove spawned splitter entries requires cell coordinates.");
        }
        removedKeys[cell.row + ":" + cell.col] = true;
        if (typeof cell.id === "string" || typeof cell.id === "number") {
          removedKeys[String(cell.id)] = true;
        }
      });

      var kept = [];
      var removedCount = 0;
      resolution.spawnedBySplitters.forEach(function (spawnedCell) {
        if (!spawnedCell || !Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
          throw new Error("Spawned splitter entry requires coordinates.");
        }
        var coordinateKey = spawnedCell.row + ":" + spawnedCell.col;
        var idKey = (typeof spawnedCell.id === "string" || typeof spawnedCell.id === "number")
          ? String(spawnedCell.id)
          : null;
        if (removedKeys[coordinateKey] || (idKey && removedKeys[idKey])) {
          removedCount += 1;
          return;
        }
        kept.push(spawnedCell);
      });

      resolution.spawnedBySplitters = kept;
      return removedCount;
    },

    _removeUnsupportedUnlockedCells: function (unlockedEntries, grid, resolution) {
      if (!Array.isArray(unlockedEntries)) {
        throw new Error("Unsupported unlocked flush requires unlockedEntries array.");
      }
      if (!unlockedEntries.length) {
        return [];
      }
      if (!grid || typeof grid.removeCells !== "function") {
        throw new Error("Unsupported unlocked flush requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.floating)) {
        throw new Error("Unsupported unlocked flush requires resolution.floating array.");
      }
      if (!this.systems.supportSystem || typeof this.systems.supportSystem.findFloatingCells !== "function") {
        throw new Error("Unsupported unlocked flush requires supportSystem.findFloatingCells.");
      }

      var unlockedPositions = {};
      unlockedEntries.forEach(function (entry) {
        if (!entry || !Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
          throw new Error("Unsupported unlocked flush requires unlocked cell coordinates.");
        }
        unlockedPositions[entry.row + ":" + entry.col] = true;
      });

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var targets = floatingCells.filter(function (cell) {
        return unlockedPositions[cell.row + ":" + cell.col] === true;
      });
      if (!targets.length) {
        return [];
      }

      var removed = grid.removeCells(targets);
      this._appendUniqueCells(resolution.floating, removed);
      if (removed.length) {
        this._cancelPendingSplitterSpawnsForDroppedCells(removed);
        this._registerResolutionDrops(removed, grid, resolution, {
          startDelay: KEY_UNLOCK_DROP_DELAY
        });
      }
      return removed;
    },

    _resolveCollectedKeyUnlocks: function (grid, resolution) {
      if (!grid || typeof grid.getSpecialEntities !== "function" || typeof grid.addBubble !== "function") {
        throw new Error("Collected key unlock requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.collectedKeys)) {
        throw new Error("Collected key unlock requires resolution.collectedKeys array.");
      }
      if (!Array.isArray(resolution.unlockedLockedBalls)) {
        throw new Error("Collected key unlock requires resolution.unlockedLockedBalls array.");
      }
      if (!Array.isArray(resolution.floating)) {
        throw new Error("Collected key unlock requires resolution.floating array.");
      }

      var pendingKeys = resolution.collectedKeys.filter(function (keyCell) {
        return keyCell && !hasUnlockEntryForKey(keyCell, resolution.unlockedLockedBalls);
      });
      if (!pendingKeys.length) {
        return [];
      }

      var manager = this;
      var unlocked = [];
      pendingKeys.forEach(function (keyCell) {
        if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
          throw new Error("Collected key requires id.");
        }
      });

      var lockedTargets = grid.getSpecialEntities().filter(function (cell) {
        return isLockedBall(cell);
      });
      if (!lockedTargets.length) {
        throw new Error("Collected key has no locked target.");
      }
      if (lockedTargets.length < pendingKeys.length) {
        throw new Error("Collected keys exceed remaining locked targets.");
      }

      var pairings = buildNearestKeyLockPairings(pendingKeys, lockedTargets, grid);
      pairings.forEach(function (pair) {
        var keyCell = pair.keyCell;
        var targetCell = pair.lockCell;
        if (typeof targetCell.lockedColor !== "string" || !targetCell.lockedColor) {
          throw new Error("Locked ball requires lockedColor before unlock.");
        }
        var unlockedCell = grid.addBubble({ row: targetCell.row, col: targetCell.col }, targetCell.lockedColor);
        if (!unlockedCell) {
          throw new Error("Locked ball unlock failed for key: " + keyCell.id);
        }
        unlocked.push({
          id: unlockedCell.id,
          row: unlockedCell.row,
          col: unlockedCell.col,
          color: unlockedCell.color,
          entityCategory: unlockedCell.entityCategory,
          entityType: unlockedCell.entityType,
          __sourceKeyId: keyCell.id
        });
        manager._pushLockOpenEvent(unlockedCell);
      });

      this._appendUniqueCells(resolution.unlockedLockedBalls, unlocked);
      this._removeUnsupportedUnlockedCells(unlocked, grid, resolution);
      return unlocked;
    },

    _triggerKeysAndResolveUnlocks: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Key removal trigger requires removedCells array.");
      }
      var removedKeys = this._triggerAdjacentKeys(removedCells, grid, resolution);
      if (removedKeys.length) {
        this._resolveCollectedKeyUnlocks(grid, resolution);
      }
      return removedKeys;
    },

    _collectRemovedKeysAndResolveUnlocks: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Removed key collection requires removedCells array.");
      }
      var removedKeys = removedCells.filter(function (cell) {
        return isKeyBall(cell);
      });
      if (!removedKeys.length) {
        return [];
      }
      this._appendUniqueCells(resolution.collectedKeys, removedKeys);
      this._resolveCollectedKeyUnlocks(grid, resolution);
      return removedKeys;
    },

    _releaseVineAfterAdjacentEliminationOnce: function (cell, grid, resolution) {
      if (!isVineEntangledBall(cell)) {
        throw new Error("Vine release requires an entangled normal ball.");
      }
      if (!grid || typeof grid.removeVineAt !== "function") {
        throw new Error("Vine release requires BubbleGrid.removeVineAt.");
      }
      if (!resolution || !Array.isArray(resolution.releasedVines)) {
        throw new Error("Vine release requires resolution.releasedVines.");
      }
      var alreadyReleased = resolution.releasedVines.some(function (entry) {
        return entry && entry.cellId === cell.id;
      });
      if (alreadyReleased) {
        return null;
      }
      var liveCell = grid.getCell(cell.row, cell.col);
      if (!liveCell || !isVineEntangledBall(liveCell)) {
        throw new Error("Vine release target must remain entangled: " + cell.id);
      }
      var released = grid.removeVineAt(cell.row, cell.col);
      var entry = {
        cellId: released.id,
        ownerId: released.vineOwnerId,
        row: released.row,
        col: released.col,
        sourceType: "adjacent_elimination"
      };
      resolution.releasedVines.push(entry);
      return entry;
    },

    _damageVineSpiritOnce: function (spirit, grid, resolution, sourceType) {
      if (!isVineSpiritBall(spirit)) {
        throw new Error("Vine spirit damage requires a vine spirit.");
      }
      if (!grid || typeof grid.damageVineSpirit !== "function") {
        throw new Error("Vine spirit damage requires BubbleGrid.damageVineSpirit.");
      }
      if (!resolution || !Array.isArray(resolution.vineSpiritHits) || !Array.isArray(resolution.witheredVines)) {
        throw new Error("Vine spirit damage requires resolution vine arrays.");
      }
      if (sourceType !== "direct_hit" && sourceType !== "adjacent_elimination" && sourceType !== "explosion") {
        throw new Error("Vine spirit damage sourceType is invalid: " + sourceType);
      }
      var alreadyDamaged = resolution.vineSpiritHits.some(function (entry) {
        return entry && entry.spiritId === spirit.id;
      });
      if (alreadyDamaged) {
        return null;
      }
      var result = grid.damageVineSpirit(spirit.id);
      var hitEntry = {
        spiritId: result.spiritId,
        row: result.row,
        col: result.col,
        healthBefore: result.healthBefore,
        healthAfter: result.healthAfter,
        destroyed: result.destroyed,
        sourceType: sourceType
      };
      resolution.vineSpiritHits.push(hitEntry);
      result.clearedVines.forEach(function (withered) {
        resolution.witheredVines.push({
          cellId: withered.cellId,
          ownerId: withered.ownerId,
          row: withered.row,
          col: withered.col
        });
      });
      return hitEntry;
    },

    _resolveVinesAfterRemoval: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Vine adjacency resolution requires removedCells array.");
      }
      if (!removedCells.length) {
        return;
      }
      if (!grid || typeof grid.getNeighborCoordinates !== "function" || typeof grid.getCell !== "function") {
        throw new Error("Vine adjacency resolution requires bubble grid.");
      }
      var entangledById = {};
      var spiritsById = {};
      removedCells.forEach(function (removedCell) {
        if (!removedCell || !Number.isInteger(removedCell.row) || !Number.isInteger(removedCell.col)) {
          throw new Error("Vine adjacency resolution requires removed cell coordinates.");
        }
        grid.getNeighborCoordinates(removedCell.row, removedCell.col).forEach(function (coordinate) {
          var neighbor = grid.getCell(coordinate.row, coordinate.col);
          if (isVineEntangledBall(neighbor)) {
            entangledById[neighbor.id] = neighbor;
          }
          if (isVineSpiritBall(neighbor)) {
            spiritsById[neighbor.id] = neighbor;
          }
        });
      });
      Object.keys(entangledById).sort().forEach(function (cellId) {
        this._releaseVineAfterAdjacentEliminationOnce(entangledById[cellId], grid, resolution);
      }, this);
      Object.keys(spiritsById).sort().forEach(function (spiritId) {
        this._damageVineSpiritOnce(spiritsById[spiritId], grid, resolution, "adjacent_elimination");
      }, this);
    },

    _resolveVineSpiritsHitByExplosion: function (affectedCells, grid, resolution) {
      if (!Array.isArray(affectedCells)) {
        throw new Error("Vine explosion resolution requires affectedCells array.");
      }
      if (!grid || typeof grid.getCell !== "function") {
        throw new Error("Vine explosion resolution requires bubble grid.");
      }
      var spiritsById = {};
      affectedCells.forEach(function (affectedCell) {
        if (!affectedCell || !Number.isInteger(affectedCell.row) || !Number.isInteger(affectedCell.col)) {
          throw new Error("Vine explosion resolution requires affected cell coordinates.");
        }
        var liveCell = grid.getCell(affectedCell.row, affectedCell.col);
        if (isVineSpiritBall(liveCell)) {
          spiritsById[liveCell.id] = liveCell;
        }
      });
      Object.keys(spiritsById).sort().forEach(function (spiritId) {
        this._damageVineSpiritOnce(spiritsById[spiritId], grid, resolution, "explosion");
      }, this);
    },

    _resolveDirectVineImpact: function (projectile, grid, resolution) {
      if (!projectile || !projectile.shotPlan || !projectile.shotPlan.collidedCell) {
        return;
      }
      var collided = projectile.shotPlan.collidedCell;
      if (!Number.isInteger(collided.row) || !Number.isInteger(collided.col)) {
        throw new Error("Direct vine impact requires collided cell coordinates.");
      }
      var liveCell = grid.getCell(collided.row, collided.col);
      if (liveCell && isVineEntangledBall(liveCell)) {
        return;
      }
      if (liveCell && isVineSpiritBall(liveCell)) {
        this._damageVineSpiritOnce(liveCell, grid, resolution, "direct_hit");
        return;
      }
      if (isVineEntangledBall(collided)) {
        var vineWasReleased = resolution.releasedVines.some(function (entry) {
          return entry && entry.cellId === collided.id;
        });
        if (!vineWasReleased) {
          throw new Error("Directly hit vine disappeared without a release record: " + collided.id);
        }
      }
      if (isVineSpiritBall(collided)) {
        var spiritWasDamaged = resolution.vineSpiritHits.some(function (entry) {
          return entry && entry.spiritId === collided.id;
        });
        if (!spiritWasDamaged) {
          throw new Error("Directly hit vine spirit disappeared without a damage record: " + collided.id);
        }
      }
    },

    _triggerAdjacentKeys: function (removedCells, grid, resolution) {
      var touched = {};
      var keys = [];
      (removedCells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        if (isKeyBall(cell)) {
          touched[cell.row + ":" + cell.col] = true;
          keys.push(cell);
        }
        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }
          var neighbor = grid.getCell(coord.row, coord.col);
          if (!isKeyBall(neighbor)) {
            return;
          }
          touched[key] = true;
          keys.push(neighbor);
        });
      });

      if (!keys.length) {
        return [];
      }

      var liveKeys = keys.filter(function (keyCell) {
        return grid.hasCell(keyCell.row, keyCell.col);
      });
      var removedKeys = grid.removeCells(liveKeys);
      this._appendUniqueCells(removedKeys, keys);
      this._appendUniqueCells(resolution.collectedKeys, removedKeys);
      return removedKeys;
    },

    _triggerAdjacentSplitters: function (removedCells, grid, resolution, triggeredSplitterIds) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Adjacent splitter trigger requires removedCells array.");
      }
      var manager = this;
      var touched = {};
      var triggered = [];
      removedCells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Adjacent splitter trigger requires removed cell.");
        }
        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }
          var splitter = grid.getCell(coord.row, coord.col);
          if (!isSplitterBall(splitter)) {
            return;
          }
          touched[key] = true;
          if (triggeredSplitterIds[splitter.id]) {
            return;
          }
          triggeredSplitterIds[splitter.id] = true;
          if (typeof splitter.splitColor !== "string" || !splitter.splitColor) {
            throw new Error("Splitter requires splitColor.");
          }
          if (typeof manager._queuePendingSplitterSpawn !== "function") {
            throw new Error("Splitter trigger requires GameManager._queuePendingSplitterSpawn.");
          }
          manager._queuePendingSplitterSpawn(splitter, resolution);
          triggered.push(splitter);
        });
      });

      return triggered;
    },

    _collectAdjacentMolotovs: function (removedCells, grid, queuedMolotovIds) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Adjacent molotov collection requires removedCells array.");
      }
      if (!grid || typeof grid.getNeighborCoordinates !== "function" || typeof grid.getCell !== "function") {
        throw new Error("Adjacent molotov collection requires bubble grid.");
      }
      if (!queuedMolotovIds || typeof queuedMolotovIds !== "object") {
        throw new Error("Adjacent molotov collection requires queued id map.");
      }
      var molotovs = [];
      var blockedMolotovIds = {};
      var seenMolotovIds = {};
      Object.keys(queuedMolotovIds).forEach(function (id) {
        if (queuedMolotovIds[id] !== true) {
          throw new Error("Adjacent molotov queued id map must contain true flags.");
        }
        blockedMolotovIds[id] = true;
      });

      function collectMolotov(cell) {
        if (cell && isMolotovBall(cell)) {
          if (typeof cell.id !== "string" && typeof cell.id !== "number") {
            throw new Error("Adjacent molotov collection requires molotov id.");
          }
          if (!blockedMolotovIds[cell.id] && !seenMolotovIds[cell.id]) {
            seenMolotovIds[cell.id] = true;
            molotovs.push(cell);
          }
        }
      }

      removedCells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Adjacent molotov collection requires removed cell.");
        }
        collectMolotov(cell);
        var neighborCoordinates = grid.getNeighborCoordinates(cell.row, cell.col);
        if (!Array.isArray(neighborCoordinates)) {
          throw new Error("Adjacent molotov collection requires neighbor coordinates array.");
        }
        neighborCoordinates.forEach(function (coord) {
          var neighbor = grid.getCell(coord.row, coord.col);
          collectMolotov(neighbor);
        });
      });
      return molotovs;
    },

    _resolveReactiveEntitiesAfterRemoval: function (removedCells, grid, resolution) {
      if (!removedCells || !removedCells.length) {
        return [];
      }

      this._resetMolotovBlastSequence();
      this._resolveVinesAfterRemoval(removedCells, grid, resolution);

      var collected = [];
      var queuedMolotovIds = {};
      var triggeredSplitterIds = {};

      var removedKeys = this._triggerKeysAndResolveUnlocks(removedCells, grid, resolution);
      this._appendUniqueCells(collected, removedKeys);
      this._triggerAdjacentSplitters(removedCells, grid, resolution, triggeredSplitterIds);

      var molotovs = this._collectAdjacentMolotovs(removedCells, grid, queuedMolotovIds);
      if (molotovs.length) {
        this._queueMolotovBlasts(molotovs, resolution);
      }

      var iceRemoved = collected.filter(function (cell) {
        return isIceBall(cell);
      });
      if (iceRemoved.length && typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(iceRemoved);
      }

      return collected;
    },

    _findAdjacentIceCells: function (cells, grid) {
      var touched = {};
      var adjacentIce = [];

      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }

        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }

          var neighbor = grid.getCell(coord.row, coord.col);
          if (!isIceBall(neighbor)) {
            return;
          }

          touched[key] = true;
          adjacentIce.push(neighbor);
        });
      });

      return adjacentIce;
    },

    _thawIceCells: function (cells, grid) {
      var thawed = [];
      var touched = {};

      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }

        var key = cell.row + ":" + cell.col;
        if (touched[key]) {
          return;
        }

        touched[key] = true;
        var currentCell = grid.getCell(cell.row, cell.col);
        if (!isIceBall(currentCell)) {
          return;
        }

        var innerColor = resolveIceInnerColor(currentCell);
        if (!innerColor) {
          return;
        }

        var thawedCell = grid.addBubble({ row: cell.row, col: cell.col }, innerColor);
        if (thawedCell) {
          thawed.push(thawedCell);
        }
      });

      if (thawed.length > 0) {
        this._pushRuntimeEvent("ice_thawed", {
          count: thawed.length
        });
      }

      return thawed;
    },

    _resolveBlastShot: function (projectile, targetCell) {
      var resolution = createEmptyResolution();

      var grid = this.systems.bubbleGrid;
      var centerCoordinate = null;
      if (targetCell && grid.isValidCell(targetCell.row, targetCell.col)) {
        centerCoordinate = {
          row: targetCell.row,
          col: targetCell.col
        };
      } else if (projectile && projectile.shotPlan && projectile.shotPlan.collidedCell) {
        centerCoordinate = {
          row: projectile.shotPlan.collidedCell.row,
          col: projectile.shotPlan.collidedCell.col
        };
      } else if (projectile && projectile.position) {
        var fallbackCenterCell = grid.findCollision(projectile.position, BoardLayout.bubbleDiameter * 1.15);
        if (fallbackCenterCell) {
          centerCoordinate = {
            row: fallbackCenterCell.row,
            col: fallbackCenterCell.col
          };
        }
      }
      if (!centerCoordinate) {
        throw new Error("Blast shot requires a resolved explosion center.");
      }

      var blastCells = [];
      var iceCellsToThaw = [];
      var affectedCoords = [{
        row: centerCoordinate.row,
        col: centerCoordinate.col
      }].concat(grid.getNeighborCoordinates(centerCoordinate.row, centerCoordinate.col));
      var touched = {};

      affectedCoords.forEach(function (coord) {
        var key = coord.row + ":" + coord.col;
        if (touched[key]) {
          return;
        }
        touched[key] = true;

        var occupiedCell = grid.getCell(coord.row, coord.col);
        if (occupiedCell) {
          if (isIceBall(occupiedCell)) {
            iceCellsToThaw.push(occupiedCell);
          } else if (isLockedBall(occupiedCell)) {
            return;
          } else {
            blastCells.push(occupiedCell);
          }
        }
      });

      this._resolveVineSpiritsHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedBlastCells = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedBlastCells, grid, resolution);
      if (!Array.isArray(resolution.blastExplosions)) {
        throw new Error("Blast resolution requires blastExplosions array.");
      }
      if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
        throw new Error("Blast explosion requires a positive shotsFired id.");
      }
      resolution.blastExplosions.push({
        id: "blast_shot_" + this.shotsFired,
        entityType: "blast",
        row: centerCoordinate.row,
        col: centerCoordinate.col
      });
      this._pushBombExplosionEvent();
      resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }
      var removedReactive = this._resolveReactiveEntitiesAfterRemoval(removedBlastCells, grid, resolution);
      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "blastDrop",
          removedBlastCells.concat(removedReactive)
        );
        Logger.info("Blast resolution pending molotov", {
          cleared: removedBlastCells.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var removedAll = removedBlastCells.concat(removedReactive).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);

      var matchedCells = removedBlastCells.concat(removedReactive);
      this._registerResolutionDrops(
        resolution.floating,
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: matchedCells
        }
      );
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCells);
      resolution.matched = matchedCells;
      this._registerMatchedObjectiveCollection(matchedCells, resolution.eliminationSequence, resolution, grid);
      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(centerCoordinate);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "blastDrop");
      this._registerComboElimination(resolution);

      Logger.info("Blast resolution", {
        cleared: removedBlastCells.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _finalizePlannedShot: function () {
      if (!this.activeProjectile) {
        return;
      }

      var projectile = this.activeProjectile;
      var grid = this.systems.bubbleGrid;
      var targetCell = projectile.targetCell;
      var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;

      if (
        projectile.shotPlan &&
        projectile.shotPlan.hitType === "miss" &&
        trappedSpriteRescueSystem.isActive()
      ) {
        this.lastResolution = createEmptyResolution();
        this.lastResolution.shotMissed = true;
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_missed_board");
          this._pushRuntimeEvent("shot_no_elimination");
        }
        this.activeProjectile = null;
        this.pendingProjectileFinalize = false;
        this.pendingShotPlan = null;
        var missClearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
        if (missClearedOcclusionZoneIds.length) {
          this._pushRuntimeEvent("board_occlusion_cleared", {
            reason: "shot_count",
            zoneIds: missClearedOcclusionZoneIds
          });
        }
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this._showOutOfShotsAddBallPrompt();
        }
        return;
      }

      if (!targetCell || grid.hasCell(targetCell.row, targetCell.col)) {
        var fallbackPoint = projectile.shotPlan && projectile.shotPlan.hitPoint
          ? projectile.shotPlan.hitPoint
          : projectile.position;
        var fallbackCollidedCell = projectile.shotPlan ? projectile.shotPlan.collidedCell : null;
        targetCell = grid.findAttachmentCell(
          fallbackPoint,
          fallbackCollidedCell,
          this.systems.shooterController.getAimState().direction,
          projectile.position
        );
      }
      if (!targetCell) {
        throw new Error("Planned shot could not resolve an attachment cell.");
      }

      var firedBall = projectile.ball || {
        ballCategory: "normal",
        color: projectile.color,
        entityCategory: "normal_ball",
        entityType: null
      };

      if (isBlastBall(firedBall)) {
        this.lastResolution = this._resolveBlastShot(projectile, targetCell);
      } else if (isRainbowBall(firedBall)) {
        this.lastResolution = this._resolveRainbowShot(projectile, targetCell);
      } else {
        var attachedColor = firedBall.color;
        var attachedBubble = grid.addBubble(targetCell, attachedColor);
        this.lastResolution = this._resolveAttachment(attachedBubble);
      }
      if (trappedSpriteRescueSystem.isActive()) {
        if (
          !projectile.shotPlan ||
          !projectile.shotPlan.impactDirection
        ) {
          throw new Error("Trapped sprite impact requires shotPlan.impactDirection.");
        }
        this.lastResolution.trappedSpriteRotation =
          trappedSpriteRescueSystem.beginImpactRotation(
            grid.getCellPosition(targetCell.row, targetCell.col),
            projectile.shotPlan.impactDirection,
            grid.getCells(),
            grid
          );
        if (this.lastResolution.trappedSpriteRotation.started) {
          this.lastResolution.impact = null;
        }
      }
      this._resolveDirectVineImpact(projectile, grid, this.lastResolution);
      if (!this.molotovResolutionPending) {
        this._resolveFairyAssistsAfterResolution(this.lastResolution);
      }
      var trappedSpriteRotationStarted = !!(
        this.lastResolution.trappedSpriteRotation &&
        this.lastResolution.trappedSpriteRotation.started
      );
      var swirlRotationStarted = false;
      var wormholeShiftStarted = false;
      var vineCastStarted = false;
      if (trappedSpriteRotationStarted) {
        this._deferTrappedSpritePostImpactResolution(this.lastResolution);
      } else {
        swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(this.lastResolution);
        wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(this.lastResolution);
        vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(this.lastResolution);
      }
      var postShotSpecialStarted = trappedSpriteRotationStarted || swirlRotationStarted || wormholeShiftStarted || vineCastStarted;
      var deferredBoardShift = postShotSpecialStarted ? true : this._applyPostImpactBoardShiftPolicy(this.lastResolution);

      var noEliminationTriggered = !(
        this.lastResolution &&
        Array.isArray(this.lastResolution.matched) &&
        this.lastResolution.matched.length > 0
      );
      if (noEliminationTriggered) {
        if (
          !projectile.shotPlan ||
          !Number.isInteger(projectile.shotPlan.wallBounceCount) ||
          projectile.shotPlan.wallBounceCount < 0
        ) {
          throw new Error("Finalized projectile requires a non-negative integer shotPlan.wallBounceCount.");
        }
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_no_elimination");
          if (projectile.shotPlan.wallBounceCount > 0) {
            this._pushRuntimeEvent("shot_wall_bounce_no_elimination", {
              wallBounceCount: projectile.shotPlan.wallBounceCount
            });
          }
        }
      }

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;
      var clearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
      if (clearedOcclusionZoneIds.length) {
        this._pushRuntimeEvent("board_occlusion_cleared", {
          reason: "shot_count",
          zoneIds: clearedOcclusionZoneIds
        });
      }

      if (postShotSpecialStarted) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (this.lastResolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }

      if (this._tryTopAnchorCollapse()) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._hasPendingMolotovBlasts()) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (deferredBoardShift) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._ensureMinimumVisibleBoardRows(this.lastResolution)) {
        this.pendingShotPlan = null;
        if (this.state === "won_pending") {
          return;
        }
        return;
      }

      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
        return;
      }

      this.pendingShotPlan = null;
    },

    _resolveAttachment: function (attachedBubble) {
      var resolution = createEmptyResolution();
      resolution.attachedCell = attachedBubble;
      resolution.impact = this._createImpactEventFromCell(attachedBubble);

      var grid = this.systems.bubbleGrid;
      var matchedCells = this.systems.matchSystem.findMatchGroup(grid, attachedBubble);

      if (!matchedCells.length) {
        if (this.systems.trappedSpriteRescueSystem.isActive()) {
          var unsupportedCells = this.systems.supportSystem.findFloatingCells(grid);
          var unsupportedRemoved = grid.removeFloatingCells(unsupportedCells);
          this._appendUniqueCells(resolution.floating, unsupportedRemoved);
          resolution.collected = unsupportedRemoved.slice();
          this._registerResolutionDrops(unsupportedRemoved, grid, resolution);
          this._applyResolutionDropScore(resolution, "matchedDrop");
        } else {
          this.systems.supportSystem.clearFloatingCells();
          this.systems.fallingMarbleSystem.registerDrops([], grid);
        }
        this.systems.jarCollectorSystem.collect([]);
        resolution.boardCleared = this._isBoardCleared(grid);
        return resolution;
      }

      var removedMatches = grid.removeCells(matchedCells);
      var removedReactiveMatches = this._resolveReactiveEntitiesAfterRemoval(removedMatches, grid, resolution);
      if (resolution.impact) {
        resolution.impact = this._filterImpactEventSurvivors(
          resolution.impact,
          removedMatches.concat(removedReactiveMatches)
        );
      }
      var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
      resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }

      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "matchedDrop",
          removedMatches.concat(removedReactiveMatches)
        );
        Logger.info("Resolution pending molotov", {
          matched: removedMatches.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var collectedCells = removedMatches.concat(removedReactiveMatches).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(collectedCells);

      var matchedCellsForScore = removedMatches.concat(removedReactiveMatches);
      var matchedScorePerBall = this._getMatchedDropScorePerBallForNextCombo("matchedDrop");
      var eliminationData = EliminationSequenceBuilder.buildEliminationSequence(
        attachedBubble,
        matchedCellsForScore,
        grid,
        matchedScorePerBall
      );
      resolution.eliminationSequence = eliminationData.eliminationSequence;
      resolution.scoreEvents = eliminationData.scoreEvents;

      resolution.matched = matchedCellsForScore;
      this._registerMatchedObjectiveCollection(
        matchedCellsForScore,
        resolution.eliminationSequence,
        resolution,
        grid
      );
      this._registerResolutionDrops(resolution.floating, grid, resolution);
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCellsForScore, resolution.eliminationSequence);
      resolution.collected = collectedCells;
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "matchedDrop", {
        matchedScorePerBall: matchedScorePerBall
      });
      this._registerComboElimination(resolution);

      Logger.info("Resolution", {
        matched: removedMatches.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        collected: collectedCells.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _isPrimaryObjectiveCompleted: function () {
      var objective = findPrimaryCollectionObjective(this.currentLevel);
      if (!objective) {
        return true;
      }

      var target = Math.max(0, Math.floor(Number(objective.value) || 0));
      if (target <= 0) {
        return true;
      }

      var jarsSnapshot = this._getCachedJarSnapshot();
      if (!jarsSnapshot) {
        return false;
      }

      if (typeof this._getPrimaryObjectiveProgressValue === "function") {
        return this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) >= target;
      }

      return true;
    },

    _emitTrappedSpriteRescueEvent: function () {
      var trappedSpriteRescueSystem = this.systems.trappedSpriteRescueSystem;
      if (!trappedSpriteRescueSystem.isActive() || this.trappedSpriteRescueEventEmitted) {
        return false;
      }
      var trappedSpriteSnapshot = trappedSpriteRescueSystem.snapshotForRender();
      if (
        !trappedSpriteSnapshot.active ||
        typeof trappedSpriteSnapshot.spiritId !== "string"
      ) {
        throw new Error("Trapped sprite rescue completion requires spiritId.");
      }
      AssistSpiritConfig.getSpirit(trappedSpriteSnapshot.spiritId);
      this._pushRuntimeEvent("trapped_sprite_rescued", {
        spiritId: trappedSpriteSnapshot.spiritId
      });
      this.trappedSpriteRescueEventEmitted = true;
      return true;
    },

    _resolveBoardClearedOutcome: function () {
      this._emitTrappedSpriteRescueEvent();

      // 清屏后若仍有掉落中的玻璃球，先进入等待态；
      // 等掉落完成并计分后，再决定本局最终胜负。
      if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast() || this._hasPendingTrappedSpritePostImpactResolution() || this.systems.trappedSpriteRescueSystem.isRotating()) {
        this.state = "won_pending";
        return;
      }

      if (!this._isClearWinCompleted()) {
        this.state = "lost_objective";
        return;
      }

      this._resolveClearWinOutcome();
    },

    _beginSurplusShotBonus: function () {
      if (this.isTimedInfiniteShots) {
        throw new Error("Surplus shot bonus cannot run in timed infinite-shot mode.");
      }

      var remainingCount = Math.floor(Number(this.remainingShots) || 0);
      if (!Number.isInteger(remainingCount) || remainingCount <= 0) {
        throw new Error("Surplus shot bonus requires positive remainingShots.");
      }

      var shooterController = this.systems.shooterController;
      if (!shooterController || typeof shooterController.drainRemainingShotBalls !== "function") {
        throw new Error("Surplus shot bonus requires ShooterController.drainRemainingShotBalls.");
      }

      var fallingMarbleSystem = this.systems.fallingMarbleSystem;
      if (!fallingMarbleSystem || typeof fallingMarbleSystem.registerSurplusShotsFromOrigin !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.registerSurplusShotsFromOrigin.");
      }
      if (typeof fallingMarbleSystem.hasPendingSurplusShots !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.hasPendingSurplusShots.");
      }

      if (this.activeProjectile) {
        throw new Error("Surplus shot bonus cannot start while projectile is active.");
      }
      if (fallingMarbleSystem.hasActiveDrops()) {
        throw new Error("Surplus shot bonus cannot start while board drops are still active.");
      }

      var aimState = shooterController.getAimState();
      var origin = aimState && aimState.origin ? aimState.origin : null;
      if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
        throw new Error("Surplus shot bonus requires shooter aim origin.");
      }

      var drainedBalls = shooterController.drainRemainingShotBalls(remainingCount);
      this.remainingShots = 0;
      this.isAiming = false;
      this.pendingShotPlan = null;
      this.surplusShotAimRecentered = false;
      var initialSurplusDrops = fallingMarbleSystem.registerSurplusShotsFromOrigin(
        drainedBalls,
        origin,
        this.levelRandomSeed
      );
      if (
        !Array.isArray(initialSurplusDrops) ||
        initialSurplusDrops.length !== 1 ||
        initialSurplusDrops[0].dropKind !== "surplus_shot"
      ) {
        throw new Error("Surplus shot bonus must launch exactly one surplus shot immediately.");
      }
      this.state = "won_surplus_shots_pending";
      if (!fallingMarbleSystem.hasPendingSurplusShots()) {
        this.surplusShotAimRecentered = true;
        this.surplusShotAimRecenterRevision += 1;
      }

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("surplus_shot_launched", {});
        this._pushRuntimeEvent("surplus_shots_started", {
          count: drainedBalls.length
        });
      }

      Logger.info("Surplus shot bonus started", {
        count: drainedBalls.length
      });
    }
  };
}

module.exports = createGameManagerShotResolutionMethods;
