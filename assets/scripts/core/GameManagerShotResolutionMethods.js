"use strict";

function createGameManagerShotResolutionMethods(deps) {
  var Logger = deps.Logger;
  var BoardLayout = deps.BoardLayout;
  var clone = deps.clone;
  var quantize = deps.quantize;
  var buildProjectilePathFromShotPlan = deps.buildProjectilePathFromShotPlan;
  var measurePathDistance = deps.measurePathDistance;
  var RAINBOW_TIE_BREAK_ORDER = deps.RAINBOW_TIE_BREAK_ORDER;
  var isSkillBall = deps.isSkillBall;
  var isIceBall = deps.isIceBall;
  var isBlastBall = deps.isBlastBall;
  var isRainbowBall = deps.isRainbowBall;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var createEmptyResolution = deps.createEmptyResolution;
  var findPrimaryCollectionObjective = deps.findPrimaryCollectionObjective;

  return {
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
      var gained = scoredDrops.reduce(function (sum, drop) {
        var base = jarCollectBase;
        var multiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
        return sum + Math.round(base * multiplier);
      }, 0);
      var sameColorCount = scoredDrops.reduce(function (count, drop) {
        return count + (drop.sameColor ? 1 : 0);
      }, 0);
      var bonusGained = scoredDrops.reduce(function (sum, drop) {
        var base = jarCollectBase;
        var multiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
        var total = Math.round(base * multiplier);
        return sum + Math.max(0, total - base);
      }, 0);

      this.score += gained;
      this.sameColorJarCollected += sameColorCount;
      this.sameColorJarBonusScore += bonusGained;

      if (this.lastResolution) {
        this.lastResolution.scoreDelta += gained;
      }

      Logger.info("Jar collect", {
        count: scoredDrops.length,
        gained: gained,
        sameColorCount: sameColorCount,
        bonusGained: bonusGained
      });

      return gained;
    },

    _refreshShotPlan: function (force) {
      if (this.state !== "running" || this.activeProjectile || this._isWaitingBoardAdvance()) {
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

    _estimateColorGroupAt: function (targetCell, colorCode) {
      var grid = this.systems.bubbleGrid;
      var queue = [];
      var visited = {};
      var groupCount = 1;
      var directNeighbors = 0;

      grid.getNeighborCoordinates(targetCell.row, targetCell.col).forEach(function (neighbor) {
        var neighborCell = grid.getCell(neighbor.row, neighbor.col);
        if (!neighborCell || neighborCell.color !== colorCode) {
          return;
        }

        directNeighbors += 1;
        queue.push({
          row: neighbor.row,
          col: neighbor.col
        });
      });

      while (queue.length) {
        var current = queue.shift();
        var key = current.row + ":" + current.col;
        if (visited[key]) {
          continue;
        }

        visited[key] = true;
        var gridCell = grid.getCell(current.row, current.col);
        if (!gridCell || gridCell.color !== colorCode) {
          continue;
        }

        groupCount += 1;
        grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
          var neighborKey = neighbor.row + ":" + neighbor.col;
          if (visited[neighborKey]) {
            return;
          }

          var neighborCell = grid.getCell(neighbor.row, neighbor.col);
          if (neighborCell && neighborCell.color === colorCode) {
            queue.push({
              row: neighbor.row,
              col: neighbor.col
            });
          }
        });
      }

      return {
        color: colorCode,
        groupSize: groupCount,
        directNeighbors: directNeighbors,
        canImmediateClear: groupCount >= 3
      };
    },

    _selectRainbowAttachColor: function (targetCell) {
      var availableColors = this.currentLevel && this.currentLevel.level && Array.isArray(this.currentLevel.level.colors)
        ? this.currentLevel.level.colors.slice()
        : [];
      if (!availableColors.length) {
        return "R";
      }

      var best = null;
      availableColors.forEach(function (colorCode) {
        var estimate = this._estimateColorGroupAt(targetCell, colorCode);
        var tieScore = RAINBOW_TIE_BREAK_ORDER[colorCode] || 0;
        if (!best) {
          best = {
            estimate: estimate,
            tieScore: tieScore
          };
          return;
        }

        if (estimate.canImmediateClear !== best.estimate.canImmediateClear) {
          if (estimate.canImmediateClear) {
            best = {
              estimate: estimate,
              tieScore: tieScore
            };
          }
          return;
        }

        if (estimate.groupSize > best.estimate.groupSize) {
          best = {
            estimate: estimate,
            tieScore: tieScore
          };
          return;
        }

        if (estimate.groupSize === best.estimate.groupSize) {
          if (estimate.directNeighbors > best.estimate.directNeighbors) {
            best = {
              estimate: estimate,
              tieScore: tieScore
            };
            return;
          }

          if (estimate.directNeighbors === best.estimate.directNeighbors && tieScore > best.tieScore) {
            best = {
              estimate: estimate,
              tieScore: tieScore
            };
          }
        }
      }, this);

      return best ? best.estimate.color : availableColors[0];
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
            } else {
              blastCells.push(occupiedCell);
            }
          }
        });
      }

      var removedBlastCells = grid.removeCells(blastCells);
      resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected = this._registerIceCollection(resolution.thawed);
      }
      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeCells(floatingCells);
      var removedAll = removedBlastCells.concat(removedFloating);

      // 玩法调整：炸裂清除与断层清除都进入掉落链路，不再直接消失。
      var fallingCandidates = removedAll;
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates, grid);
      this.systems.jarCollectorSystem.collect([]);


      resolution.matched = removedBlastCells;
      resolution.floating = removedFloating;
      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(centerCoordinate);
      resolution.boardCleared = grid.getCells().length === 0;

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
      } else {
        var attachedColor = firedBall.color;
        if (isRainbowBall(firedBall)) {
          attachedColor = this._selectRainbowAttachColor(targetCell);
        }

        var attachedBubble = grid.addBubble(targetCell, attachedColor);
        this.lastResolution = this._resolveAttachment(attachedBubble);
      }

      var noDropTriggered = !(
        this.lastResolution &&
        Array.isArray(this.lastResolution.collected) &&
        this.lastResolution.collected.length > 0
      );
      if (noDropTriggered && typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("shot_no_drop");
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

      if (this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isWaitingBoardAdvance()) {
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
      var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
      resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected = this._registerIceCollection(resolution.thawed);
      }
      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeCells(floatingCells);
      var collectedCells = removedMatches.concat(removedFloating);

      // 玩法调整：普通三消命中的珠子与断层珠统一按掉落结算。
      var fallingCandidates = collectedCells;
      this.systems.fallingMarbleSystem.registerDrops(fallingCandidates, grid);
      this.systems.jarCollectorSystem.collect([]);

      resolution.matched = removedMatches;
      resolution.floating = removedFloating;
      resolution.collected = collectedCells;
      resolution.boardCleared = grid.getCells().length === 0;

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
      if (this.systems.fallingMarbleSystem.hasActiveDrops()) {
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

      this.state = "won";
    }
  };
}

module.exports = createGameManagerShotResolutionMethods;
