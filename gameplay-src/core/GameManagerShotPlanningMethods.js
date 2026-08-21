"use strict";

function isSamePathPoint(left, right) {
  return !!(
    left &&
    right &&
    Number.isFinite(left.x) &&
    Number.isFinite(left.y) &&
    Number.isFinite(right.x) &&
    Number.isFinite(right.y) &&
    Math.abs(left.x - right.x) <= 0.5 &&
    Math.abs(left.y - right.y) <= 0.5
  );
}

function buildPhysicalImpactPath(shotPlan) {
  if (!shotPlan || !Array.isArray(shotPlan.pathPoints) || shotPlan.pathPoints.length < 2) {
    throw new Error("Transparent ball planning requires an authoritative shot path.");
  }
  if (!shotPlan.hitPoint) {
    throw new Error("Transparent ball planning requires shotPlan.hitPoint.");
  }

  var impactIndex = -1;
  shotPlan.pathPoints.forEach(function (point, index) {
    if (isSamePathPoint(point, shotPlan.hitPoint)) {
      impactIndex = index;
    }
  });
  if (impactIndex < 1 && shotPlan.hitType === "fallback") {
    return shotPlan.pathPoints.slice();
  }
  if (impactIndex < 1) {
    throw new Error("Transparent ball planning could not locate the physical impact point on the shot path.");
  }
  return shotPlan.pathPoints.slice(0, impactIndex + 1);
}

function applyTraversableAttachmentTarget(shotPlan, traversedCells, grid) {
  if (shotPlan.hitType !== "bubble" || traversedCells.length === 0) {
    return;
  }
  if (!shotPlan.collidedCell) {
    throw new Error("Transparent ball attachment requires the rear collided cell.");
  }

  var neighborKeys = {};
  grid.getNeighborCoordinates(shotPlan.collidedCell.row, shotPlan.collidedCell.col).forEach(function (coord) {
    neighborKeys[coord.row + ":" + coord.col] = true;
  });
  var attachmentTarget = null;
  traversedCells.forEach(function (cell) {
    if (neighborKeys[cell.row + ":" + cell.col]) {
      attachmentTarget = cell;
    }
  });
  if (!attachmentTarget) {
    return;
  }

  var targetPosition = grid.getCellPosition(attachmentTarget.row, attachmentTarget.col);
  shotPlan.targetCell = {
    row: attachmentTarget.row,
    col: attachmentTarget.col
  };
  shotPlan.targetCellPosition = targetPosition;
  if (attachmentTarget.entityType === "transparent_ball") {
    shotPlan.transparentAttachmentTarget = {
      id: attachmentTarget.id,
      row: attachmentTarget.row,
      col: attachmentTarget.col
    };
  } else if (attachmentTarget.entityType === "wind_tunnel_exit") {
    shotPlan.windTunnelExitAttachmentTarget = {
      id: attachmentTarget.id,
      row: attachmentTarget.row,
      col: attachmentTarget.col
    };
  } else {
    throw new Error("Traversable attachment target has unsupported entityType: " + attachmentTarget.entityType + ".");
  }

  var physicalPath = buildPhysicalImpactPath(shotPlan);
  if (!isSamePathPoint(physicalPath[physicalPath.length - 1], targetPosition)) {
    physicalPath.push(targetPosition);
  }
  shotPlan.pathPoints = physicalPath;
}

function createGameManagerShotPlanningMethods(context) {
  var BoardViewportSystem = context.BoardViewportSystem;
  var buildProjectilePathFromShotPlan = context.buildProjectilePathFromShotPlan;
  var createGameManagerShotPlanningMethods = context.createGameManagerShotPlanningMethods;
  var isBlastBall = context.isBlastBall;
  var isRainbowBall = context.isRainbowBall;
  var measurePathDistance = context.measurePathDistance;
  var quantize = context.quantize;

  return {
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
      if (
        this.systems.trappedSpriteRescueSystem.isMultiTargetActive() &&
        !this.systems.trappedSpriteRescueSystem.isMultiTargetCompleted()
      ) {
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

    _completeAuthoritativeShotPlan: function (planned, grid) {
      if (!planned || planned.valid !== true) {
        throw new Error("Authoritative shot plan completion requires a valid plan.");
      }
      if (
        !grid ||
        typeof grid.getCellPosition !== "function" ||
        typeof grid.findTransparentBallCollisionsOnPath !== "function" ||
        typeof grid.findWindTunnelExitCollisionsOnPath !== "function"
      ) {
        throw new Error("Authoritative shot plan completion requires BubbleGrid traversal methods.");
      }
      if (planned.collidedCell) {
        planned.collidedCellPosition = grid.getCellPosition(
          planned.collidedCell.row,
          planned.collidedCell.col
        );
      }
      planned.pathPoints = buildProjectilePathFromShotPlan(planned);
      var physicalImpactPath = buildPhysicalImpactPath(planned);
      planned.penetratedTransparentBalls = grid.findTransparentBallCollisionsOnPath(
        physicalImpactPath,
        this.systems.trajectoryPredictor.predictionCollisionRadius
      );
      planned.traversedWindTunnelExits = grid.findWindTunnelExitCollisionsOnPath(
        physicalImpactPath,
        this.systems.trajectoryPredictor.predictionCollisionRadius
      );
      var traversedCells = planned.penetratedTransparentBalls.concat(planned.traversedWindTunnelExits).sort(function (left, right) {
        if (left.pathSegmentIndex !== right.pathSegmentIndex) {
          return left.pathSegmentIndex - right.pathSegmentIndex;
        }
        return left.pathSegmentProgress - right.pathSegmentProgress;
      });
      applyTraversableAttachmentTarget(planned, traversedCells, grid);
      planned.totalDistance = measurePathDistance(planned.pathPoints);
      return planned;
    },

    _refreshShotPlan: function (force) {
      if (this.state !== "running" || this.activeProjectile || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingBudHatches() || this._hasPendingSpiritCocoonOpenings() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast()) {
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
        this._completeAuthoritativeShotPlan(planned, this.systems.bubbleGrid);
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
          if (
            typeof cell.color === "string" &&
            cell.color &&
            !(typeof cell.bubbleShieldAttachmentId === "string" && cell.bubbleShieldAttachmentId)
          ) {
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
            if (
              typeof cell.color === "string" &&
              cell.color &&
              !(typeof cell.bubbleShieldAttachmentId === "string" && cell.bubbleShieldAttachmentId)
            ) {
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
      if (
        gridCell &&
        typeof gridCell.bubbleShieldAttachmentId === "string" &&
        gridCell.bubbleShieldAttachmentId
      ) {
        return null;
      }
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
      return this._resolveAttachment(attachedBubble, projectile.ball);
    }
  };
}

module.exports = createGameManagerShotPlanningMethods;
