"use strict";

var CrystalGunPath = require("./CrystalGunPath");

var ENDPOINT_TOLERANCE = 0.5;

function distance(left, right) {
  var dx = right.x - left.x;
  var dy = right.y - left.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function requireSupportedHitType(hitType) {
  if (hitType !== "bubble" && hitType !== "slot" && hitType !== "top" && hitType !== "fallback") {
    throw new Error("Crystal gun does not support shotPlan.hitType: " + hitType);
  }
  return hitType;
}

function requireCoordinate(coordinate, description) {
  if (
    !coordinate ||
    typeof coordinate !== "object" ||
    Array.isArray(coordinate) ||
    !Number.isInteger(coordinate.row) ||
    !Number.isInteger(coordinate.col)
  ) {
    throw new Error(description + " must contain integer row and col.");
  }
  return coordinate;
}

function findLastPointIndex(pathPoints, expectedPoint) {
  var matchedIndex = -1;
  pathPoints.forEach(function (point, index) {
    if (distance(point, expectedPoint) <= ENDPOINT_TOLERANCE) {
      matchedIndex = index;
    }
  });
  return matchedIndex;
}

function createGameManagerShotCrystalGunMethods(context) {
  var Logger = context.Logger;
  var clone = context.clone;
  var createEmptyResolution = context.createEmptyResolution;
  var isCrystalGunBall = context.isCrystalGunBall;
  var measurePathDistance = context.measurePathDistance;
  var requireFinitePoint = context.requireFinitePoint;

  function requirePreparedPath(shotPlan) {
    var path = shotPlan.crystalGunPath;
    if (!path || typeof path !== "object" || Array.isArray(path)) {
      throw new Error("Crystal gun shot requires a prepared shotPlan.crystalGunPath.");
    }
    requireFinitePoint(path.origin, "Crystal gun prepared origin");
    requireFinitePoint(path.direction, "Crystal gun prepared direction");
    requireFinitePoint(path.endPoint, "Crystal gun prepared endPoint");
    if (!Array.isArray(path.cells)) {
      throw new Error("Crystal gun prepared path requires cells array.");
    }
    path.cells.forEach(function (coordinate, index) {
      requireCoordinate(coordinate, "Crystal gun prepared path cell at index " + index);
    });
    return path;
  }

  return {
    _prepareCrystalGunProjectilePath: function (firedBall, shotPlan) {
      if (!isCrystalGunBall(firedBall)) {
        throw new Error("Crystal gun projectile preparation requires a crystal_gun ball.");
      }
      if (!shotPlan || typeof shotPlan !== "object" || Array.isArray(shotPlan)) {
        throw new Error("Crystal gun projectile preparation requires shotPlan.");
      }
      requireSupportedHitType(shotPlan.hitType);
      requireCoordinate(shotPlan.targetCell, "Crystal gun shotPlan.targetCell");
      requireFinitePoint(shotPlan.hitPoint, "Crystal gun shotPlan.hitPoint");
      requireFinitePoint(shotPlan.impactDirection, "Crystal gun shotPlan.impactDirection");
      if (!Array.isArray(shotPlan.pathPoints) || shotPlan.pathPoints.length < 2) {
        throw new Error("Crystal gun projectile preparation requires at least two shotPlan.pathPoints.");
      }
      shotPlan.pathPoints.forEach(function (point, index) {
        requireFinitePoint(point, "Crystal gun shotPlan.pathPoints[" + index + "]");
      });

      var grid = this.systems.bubbleGrid;
      if (!grid || typeof grid.getCell !== "function") {
        throw new Error("Crystal gun projectile preparation requires BubbleGrid.getCell.");
      }

      var preparedShotPlan = clone(shotPlan);
      var geometryPath = CrystalGunPath.buildPath(
        grid,
        preparedShotPlan.targetCell,
        preparedShotPlan.hitPoint,
        preparedShotPlan.impactDirection
      );
      var farthestOccupiedExitDistance = null;
      geometryPath.cells.forEach(function (coordinate, index) {
        requireCoordinate(coordinate, "Crystal gun geometry path cell at index " + index);
        if (
          typeof coordinate.entryDistance !== "number" ||
          !isFinite(coordinate.entryDistance) ||
          coordinate.entryDistance < 0 ||
          typeof coordinate.exitDistance !== "number" ||
          !isFinite(coordinate.exitDistance) ||
          coordinate.exitDistance < coordinate.entryDistance
        ) {
          throw new Error("Crystal gun geometry path distances are invalid at index " + index + ".");
        }
        if (grid.getCell(coordinate.row, coordinate.col)) {
          farthestOccupiedExitDistance = farthestOccupiedExitDistance === null
            ? coordinate.exitDistance
            : Math.max(farthestOccupiedExitDistance, coordinate.exitDistance);
        }
      });

      var endPoint = clone(preparedShotPlan.pathPoints[preparedShotPlan.pathPoints.length - 1]);
      if (farthestOccupiedExitDistance !== null) {
        endPoint = {
          x: geometryPath.origin.x + geometryPath.direction.x * farthestOccupiedExitDistance,
          y: geometryPath.origin.y + geometryPath.direction.y * farthestOccupiedExitDistance
        };
        var hitPointIndex = findLastPointIndex(preparedShotPlan.pathPoints, geometryPath.origin);
        if (hitPointIndex < 1) {
          throw new Error("Crystal gun authoritative projectile path does not reach shotPlan.hitPoint.");
        }
        preparedShotPlan.pathPoints = preparedShotPlan.pathPoints.slice(0, hitPointIndex + 1);
        if (distance(preparedShotPlan.pathPoints[preparedShotPlan.pathPoints.length - 1], endPoint) > ENDPOINT_TOLERANCE) {
          preparedShotPlan.pathPoints.push(clone(endPoint));
        } else {
          preparedShotPlan.pathPoints[preparedShotPlan.pathPoints.length - 1] = clone(endPoint);
        }
      }
      preparedShotPlan.totalDistance = measurePathDistance(preparedShotPlan.pathPoints);
      preparedShotPlan.crystalGunPath = {
        origin: clone(geometryPath.origin),
        direction: clone(geometryPath.direction),
        endPoint: clone(endPoint),
        cells: geometryPath.cells.map(function (coordinate) {
          return {
            row: coordinate.row,
            col: coordinate.col
          };
        })
      };
      return preparedShotPlan;
    },

    _resolveCrystalGunShot: function (projectile, targetCell) {
      if (!projectile || !projectile.shotPlan) {
        throw new Error("Crystal gun shot requires projectile.shotPlan.");
      }
      if (!projectile.shotPlan.impactDirection) {
        throw new Error("Crystal gun shot requires shotPlan.impactDirection.");
      }
      if (!projectile.shotPlan.hitPoint) {
        throw new Error("Crystal gun shot requires shotPlan.hitPoint.");
      }

      requireSupportedHitType(projectile.shotPlan.hitType);
      if (!targetCell) {
        throw new Error("Crystal gun shot requires its authoritative landing targetCell.");
      }
      requireCoordinate(targetCell, "Crystal gun authoritative landing targetCell");
      requireCoordinate(projectile.shotPlan.targetCell, "Crystal gun shotPlan.targetCell");
      if (
        targetCell.row !== projectile.shotPlan.targetCell.row ||
        targetCell.col !== projectile.shotPlan.targetCell.col
      ) {
        throw new Error("Crystal gun landing targetCell must match shotPlan.targetCell.");
      }

      var grid = this.systems.bubbleGrid;
      var path = requirePreparedPath(projectile.shotPlan);
      if (!Array.isArray(projectile.pathPoints) || projectile.pathPoints.length < 2) {
        throw new Error("Crystal gun projectile requires its authoritative pathPoints.");
      }
      var projectileEndPoint = requireFinitePoint(
        projectile.pathPoints[projectile.pathPoints.length - 1],
        "Crystal gun projectile path endPoint"
      );
      var projectilePosition = requireFinitePoint(projectile.position, "Crystal gun projectile");
      if (distance(projectileEndPoint, path.endPoint) > ENDPOINT_TOLERANCE) {
        throw new Error("Crystal gun projectile path must end at the final elimination endpoint.");
      }
      if (distance(projectilePosition, path.endPoint) > ENDPOINT_TOLERANCE) {
        throw new Error("Crystal gun projectile must reach the final elimination endpoint before resolution.");
      }
      var resolution = createEmptyResolution();
      resolution.crystalGunPath = {
        origin: {
          x: path.origin.x,
          y: path.origin.y
        },
        direction: {
          x: path.direction.x,
          y: path.direction.y
        },
        endPoint: {
          x: path.endPoint.x,
          y: path.endPoint.y
        },
        cells: path.cells.map(function (cell) {
          return {
            row: cell.row,
            col: cell.col
          };
        })
      };

      var lineCells = path.cells.map(function (coordinate) {
        return grid.getCell(coordinate.row, coordinate.col);
      }).filter(function (cell) {
        return !!cell;
      });
      lineCells = this._unloadBlackHolesHitByRange(lineCells, grid, resolution, "crystal_gun");
      lineCells = this._resolveBubbleShieldsHitBySpecial(lineCells, grid, resolution, "crystal_gun");
      var removedLineCells = grid.removeCells(lineCells);
      this._pushBubbleBreakEvent(removedLineCells);
      resolution.matched = removedLineCells;
      this._resolveVinesAfterRemoval(removedLineCells, grid, resolution);
      this._collectRemovedKeysAndResolveUnlocks(removedLineCells, grid, resolution);
      this._registerMatchedObjectiveCollection(
        removedLineCells,
        resolution.eliminationSequence,
        resolution,
        grid
      );
      this._queueBudHatchesAdjacentToCells(removedLineCells, resolution, projectile.ball);

      var floatingCells = this._findFloatingCellsBeforeSwirlRotation(grid, resolution);
      var removedFloating = grid.removeFloatingCells(
        this._filterFloatingSpiritCocoons(floatingCells, resolution)
      );
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var removedAll = removedLineCells.concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);
      this._registerResolutionDrops(
        resolution.floating,
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: removedLineCells
        }
      );
      this.systems.jarCollectorSystem.collect([]);

      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(targetCell);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "crystalGunDrop");
      this._registerComboElimination(resolution);

      Logger.info("Crystal gun resolution", {
        rayDirection: path.direction,
        affectedRows: path.cells.length,
        cleared: removedLineCells.length,
        floating: resolution.floating.length,
        scoreDelta: resolution.scoreDelta
      });
      return resolution;
    }
  };
}

module.exports = createGameManagerShotCrystalGunMethods;
