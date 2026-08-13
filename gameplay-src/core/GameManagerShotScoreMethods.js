"use strict";

function createGameManagerShotScoreMethods(context) {
  var COMBO_BONUS_PER_HIT = context.COMBO_BONUS_PER_HIT;
  var JarScoreConfig = context.JarScoreConfig;
  var Logger = context.Logger;
  var NON_COLLECTIBLE_JAR_SCORE_COLORS = context.NON_COLLECTIBLE_JAR_SCORE_COLORS;
  var createGameManagerShotScoreMethods = context.createGameManagerShotScoreMethods;

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
        return !!(
          drop &&
          typeof drop.color === "string" &&
          (jarColors.indexOf(drop.color) !== -1 || NON_COLLECTIBLE_JAR_SCORE_COLORS[drop.color] === true)
        );
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
    }
  };
}

module.exports = createGameManagerShotScoreMethods;
