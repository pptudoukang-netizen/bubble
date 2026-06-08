"use strict";

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
  var isLockedBall = deps.isLockedBall;
  var isKeyBall = deps.isKeyBall;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var createEmptyResolution = deps.createEmptyResolution;
  var findPrimaryCollectionObjective = deps.findPrimaryCollectionObjective;
  var COMBO_BONUS_PER_HIT = deps.COMBO_BONUS_PER_HIT;
  var MOLOTOV_BLAST_DROP_DELAY_SECONDS = 0.5;

  return {
    _resetComboStreak: function () {
      this.comboStreak = 0;
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
      if (this.comboStreak < 2) {
        return;
      }

      var comboDisplay = this.comboStreak - 1;
      var bonusGained = COMBO_BONUS_PER_HIT;
      this.score += bonusGained;
      resolution.scoreDelta += bonusGained;

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("combo_bonus_awarded", {
          combo_display: comboDisplay,
          combo_streak: this.comboStreak,
          bonus_gained: bonusGained
        });
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
      var scoreBoostMultiplier = this.jarScoreBoostActive
        ? Math.max(1, Number(this.jarScoreBoostMultiplier) || 1)
        : 1;
      var isScoreBoosted = scoreBoostMultiplier > 1;
      var computeDropPoints = function (drop) {
        var dropMultiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
        var multiplier = dropMultiplier * scoreBoostMultiplier;
        return Math.round(jarCollectBase * multiplier);
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
      var sameColorCount = scoredDrops.reduce(function (count, drop) {
        return count + (drop.sameColor ? 1 : 0);
      }, 0);
      var bonusGained = scoredDrops.reduce(function (sum, drop) {
        var total = computeDropPoints(drop);
        return sum + Math.max(0, total - jarCollectBase);
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

    _applyResolutionDropScore: function (resolution, matchedRuleKey) {
      if (!resolution) {
        return 0;
      }

      var matchedCount = Array.isArray(resolution.matched) ? resolution.matched.length : 0;
      var floatingCount = Array.isArray(resolution.floating) ? resolution.floating.length : 0;
      var matchedScore = matchedCount * this._getScoreRule(matchedRuleKey || "matchedDrop");
      var floatingScore = floatingCount * this._getScoreRule("floatingDrop");
      var gained = matchedScore + floatingScore;
      if (gained <= 0) {
        return 0;
      }

      this.score += gained;
      resolution.scoreDelta += gained;

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("drop_score_awarded", {
          matched: matchedCount,
          floating: floatingCount,
          gained: gained
        });
      }

      Logger.info("Drop score", {
        matched: matchedCount,
        floating: floatingCount,
        gained: gained
      });

      return gained;
    },

    _ensureMinimumVisibleBoardRows: function (resolution) {
      var grid = this.systems && this.systems.bubbleGrid ? this.systems.bubbleGrid : null;
      if (!grid || typeof grid.ensureMinimumVisibleRows !== "function") {
        throw new Error("Minimum visible board rows require BubbleGrid.ensureMinimumVisibleRows.");
      }
      var result = grid.ensureMinimumVisibleRows(6);
      if (result.shiftRows > 0) {
        if (resolution) {
          resolution.boardDropped = true;
          resolution.visibleRowShiftRows = result.shiftRows;
        }
        Logger.info("Board advanced for minimum visible rows", result);
      }
      return result;
    },

    _refreshShotPlan: function (force) {
      if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance() || this._hasPendingSplitterSpawns()) {
        this.pendingShotPlan = null;
        return;
      }

      if (!force && !this.isAiming) {
        this.pendingShotPlan = null;
        return;
      }

      var shooterSnapshot = this.systems.shooterController.getShooterState();
      var cacheKey = this._buildShotPlanCacheKey(shooterSnapshot);

      if (this.trajectoryCacheKey === cacheKey && this.trajectoryCachePlan) {
        this.pendingShotPlan = clone(this.trajectoryCachePlan);
        return;
      }

      var planned = this.systems.trajectoryPredictor.predictShotPlan(
        this.systems.bubbleGrid,
        shooterSnapshot.aim.origin,
        shooterSnapshot.aim.direction
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
      this.trajectoryCachePlan = planned ? clone(planned) : null;
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
        grid.dropOffsetRows,
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

    _splitMolotovDropCandidates: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Molotov drop candidate split requires cells array.");
      }
      var immediate = [];
      var delayed = [];
      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Molotov drop candidate cell is required.");
        }
        if (isMolotovBall(cell) || isKeyBall(cell)) {
          continue;
        } else if (cell.__molotovBlastDropDelay === MOLOTOV_BLAST_DROP_DELAY_SECONDS) {
          delayed.push(cell);
        } else {
          immediate.push(cell);
        }
      }
      return {
        immediate: immediate,
        delayed: delayed
      };
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
      var unlocked = [];
      removedKeys.forEach(function (keyCell) {
        var unlockGroup = keyCell.unlockGroup;
        if (typeof unlockGroup !== "string" || !unlockGroup) {
          throw new Error("Collected key requires unlockGroup.");
        }
        grid.getCells().forEach(function (cell) {
          if (!isLockedBall(cell) || cell.lockGroup !== unlockGroup) {
            return;
          }
          if (typeof cell.lockedColor !== "string" || !cell.lockedColor) {
            throw new Error("Locked ball requires lockedColor before unlock.");
          }
          var unlockedCell = grid.addBubble({ row: cell.row, col: cell.col }, cell.lockedColor);
          if (unlockedCell) {
            unlocked.push({
              id: unlockedCell.id,
              row: unlockedCell.row,
              col: unlockedCell.col,
              color: unlockedCell.color,
              entityCategory: unlockedCell.entityCategory,
              entityType: unlockedCell.entityType,
              __sourceUnlockGroup: unlockGroup
            });
          }
        });
      });
      this._appendUniqueCells(resolution.unlockedLockedBalls, unlocked);
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
      var molotovs = [];
      (removedCells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        if (isMolotovBall(cell) && !queuedMolotovIds[cell.id]) {
          queuedMolotovIds[cell.id] = true;
          molotovs.push(cell);
        }
        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var neighbor = grid.getCell(coord.row, coord.col);
          if (!isMolotovBall(neighbor) || queuedMolotovIds[neighbor.id]) {
            return;
          }
          queuedMolotovIds[neighbor.id] = true;
          molotovs.push(neighbor);
        });
      });
      return molotovs;
    },

    _resolveReactiveEntitiesAfterRemoval: function (removedCells, grid, resolution) {
      if (!removedCells || !removedCells.length) {
        return [];
      }

      var collected = [];
      var triggeredMolotovIds = {};
      var queuedMolotovIds = {};
      var triggeredSplitterIds = {};
      var queue = removedCells.slice();

      for (var cursor = 0; cursor < queue.length; cursor += 1) {
        var seeds = [queue[cursor]];
        var removedKeys = this._triggerAdjacentKeys(seeds, grid, resolution);
        this._appendUniqueCells(collected, removedKeys);
        this._triggerAdjacentSplitters(seeds, grid, resolution, triggeredSplitterIds);

        var molotovs = this._collectAdjacentMolotovs(seeds, grid, queuedMolotovIds);
        molotovs.forEach(function (molotov) {
          if (triggeredMolotovIds[molotov.id]) {
            return;
          }
          triggeredMolotovIds[molotov.id] = true;
          var liveMolotov = grid.getCell(molotov.row, molotov.col);
          if (liveMolotov) {
            var removedMolotov = grid.removeCells([liveMolotov]);
            this._appendUniqueCells(collected, removedMolotov);
          }
          resolution.reactiveTriggered.push({
            id: molotov.id,
            entityType: "molotov",
            row: molotov.row,
            col: molotov.col
          });

          var radius = molotov.blastRadius;
          if (!Number.isInteger(radius) || radius !== 2) {
            throw new Error("Molotov blastRadius must be 2.");
          }
          var blastCells = [];
          grid.getCoordinatesWithinRadius(molotov.row, molotov.col, radius).forEach(function (coord) {
            if (coord.distance === 0) {
              return;
            }
            var occupiedCell = grid.getCell(coord.row, coord.col);
            if (!occupiedCell || isLockedBall(occupiedCell)) {
              return;
            }
            blastCells.push(occupiedCell);
          });
          var removedByBlast = grid.removeCells(blastCells);
          removedByBlast.forEach(function (cell) {
            cell.__molotovBlastDropDelay = MOLOTOV_BLAST_DROP_DELAY_SECONDS;
          });
          this._appendUniqueCells(collected, removedByBlast);
          removedByBlast.forEach(function (cell) {
            queue.push(cell);
          });
        }, this);
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

      var blastCells = [];
      var iceCellsToThaw = [];
      if (centerCoordinate) {
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
      }

      var removedBlastCells = grid.removeCells(blastCells);
      resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }
      var removedReactive = this._resolveReactiveEntitiesAfterRemoval(removedBlastCells, grid, resolution);
      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeCells(floatingCells);
      var removedAll = removedBlastCells.concat(removedReactive).concat(removedFloating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);

      // 玩法调整：炸裂清除与断层清除都进入掉落链路，不再直接消失。
      var fallingCandidates = this._splitMolotovDropCandidates(removedAll);
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates.immediate, grid);
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates.delayed, grid, {
        startDelay: MOLOTOV_BLAST_DROP_DELAY_SECONDS
      });
      this.systems.jarCollectorSystem.collect([]);


      resolution.matched = removedBlastCells.concat(removedReactive);
      resolution.floating = removedFloating;
      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(centerCoordinate);
      resolution.boardCleared = grid.getCells().length === 0;
      this._applyResolutionDropScore(resolution, "blastDrop");
      this._registerComboElimination(resolution);

      Logger.info("Blast resolution", {
        cleared: removedBlastCells.length,
        thawed: resolution.thawed.length,
        floating: removedFloating.length,
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
      this._ensureMinimumVisibleBoardRows(this.lastResolution);

      var noDropTriggered = !(
        this.lastResolution &&
        Array.isArray(this.lastResolution.collected) &&
        this.lastResolution.collected.length > 0
      );
      if (noDropTriggered) {
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_no_drop");
        }
      }

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;

      if (this.lastResolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }

      if (this._scheduleBoardAdvanceAfterImpact()) {
        this.pendingShotPlan = null;
        return;
      }

      if (grid.hasReachedDangerLine()) {
        this.lastResolution.dangerReached = true;
        this.state = "lost_danger";
        return;
      }

      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isWaitingBoardAdvance() || this._hasPendingSplitterSpawns()) {
          this.state = "out_of_shots_pending";
        } else {
          this._resolveOutOfShotsOutcome();
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
        this.systems.supportSystem.clearFloatingCells();
        this.systems.fallingMarbleSystem.registerDrops([], grid);
        this.systems.jarCollectorSystem.collect([]);
        resolution.boardCleared = grid.getCells().length === 0;
        return resolution;
      }

      var removedMatches = grid.removeCells(matchedCells);
      var removedReactiveMatches = this._resolveReactiveEntitiesAfterRemoval(removedMatches, grid, resolution);
      var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
      resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }
      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeCells(floatingCells);
      var collectedCells = removedMatches.concat(removedReactiveMatches).concat(removedFloating);
      this._cancelPendingSplitterSpawnsForDroppedCells(collectedCells);

      // 玩法调整：普通三消命中的珠子与断层珠统一按掉落结算。
      var fallingCandidates = this._splitMolotovDropCandidates(collectedCells);
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates.immediate, grid);
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates.delayed, grid, {
        startDelay: MOLOTOV_BLAST_DROP_DELAY_SECONDS
      });
      this.systems.jarCollectorSystem.collect([]);

      resolution.matched = removedMatches.concat(removedReactiveMatches);
      resolution.floating = removedFloating;
      resolution.collected = collectedCells;
      resolution.boardCleared = grid.getCells().length === 0;
      this._applyResolutionDropScore(resolution, "matchedDrop");
      this._registerComboElimination(resolution);

      Logger.info("Resolution", {
        matched: removedMatches.length,
        thawed: resolution.thawed.length,
        floating: removedFloating.length,
        collected: collectedCells.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _advanceBoardIfNeeded: function () {
      if (!this.dropInterval || this.shotsFired % this.dropInterval !== 0) {
        return;
      }

      this.systems.bubbleGrid.advanceRows(1);
      this.lastResolution.boardDropped = true;
      Logger.info("Board advanced", this.systems.bubbleGrid.getDropOffsetRows());
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

    _resolveBoardClearedOutcome: function () {
      // 清屏后若仍有掉落中的玻璃球，先进入等待态；
      // 等掉落完成并计分后，再决定本局最终胜负。
      if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._hasPendingSplitterSpawns()) {
        this.state = "won_pending";
        return;
      }

      var grid = this.systems.bubbleGrid;
      var dangerReached = grid.hasReachedDangerLine();
      if (dangerReached && this.lastResolution) {
        this.lastResolution.dangerReached = true;
      }

      if (dangerReached) {
        this.state = "lost_danger";
        return;
      }

      if (!this._isPrimaryObjectiveCompleted()) {
        this.state = "lost_objective";
        return;
      }

      if (this.isTimedInfiniteShots && !this._isTimedWinCompleted()) {
        this.state = "lost_objective";
        return;
      }

      if (!this.isTimedInfiniteShots && this.remainingShots > 0) {
        this._beginSurplusShotBonus();
        return;
      }

      this._scheduleWinSettlement();
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
      fallingMarbleSystem.registerSurplusShotsFromOrigin(drainedBalls, origin);
      this.state = "won_surplus_shots_pending";

      if (typeof this._pushRuntimeEvent === "function") {
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
