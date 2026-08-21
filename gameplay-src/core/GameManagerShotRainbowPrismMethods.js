"use strict";

function createGameManagerShotRainbowPrismMethods(context) {
  var EliminationSequenceBuilder = context.EliminationSequenceBuilder;
  var RainbowPrismBallResolver = context.RainbowPrismBallResolver;
  var Logger = context.Logger;
  var clone = context.clone;
  var createEmptyResolution = context.createEmptyResolution;

  return {
    _resolveRainbowPrismBallShot: function (projectile) {
      if (!projectile || !projectile.shotPlan) {
        throw new Error("Rainbow prism ball shot requires projectile.shotPlan.");
      }
      var hitPoint = projectile.shotPlan.hitPoint;
      if (
        !hitPoint ||
        typeof hitPoint.x !== "number" ||
        !isFinite(hitPoint.x) ||
        typeof hitPoint.y !== "number" ||
        !isFinite(hitPoint.y)
      ) {
        throw new Error("Rainbow prism ball shot requires finite hitPoint.");
      }
      var grid = this.systems.bubbleGrid;
      var prismPlan = RainbowPrismBallResolver.resolve(
        grid,
        projectile.shotPlan,
        this.rainbowPrismRandom
      );
      var resolution = createEmptyResolution();
      resolution.rainbowPrismClear = {
        color: prismPlan.color,
        selectionSource: prismPlan.selectionSource,
        hitPoint: clone(hitPoint),
        visibleRows: prismPlan.visibleRows.slice(),
        clearedCount: prismPlan.targets.length
      };
      var contactCell = projectile.shotPlan.collidedCell;
      if (contactCell) {
        resolution.impact = this._createImpactEventFromCell(contactCell);
      }

      var removableColorCells = this._resolveBubbleShieldsHitBySpecial(
        prismPlan.targets,
        grid,
        resolution,
        "rainbow_prism_ball"
      );
      var removedColorCells = grid.removeCells(removableColorCells);
      if (removedColorCells.length !== removableColorCells.length) {
        throw new Error("Rainbow prism ball failed to remove every unshielded visible same-color ordinary ball.");
      }
      resolution.rainbowPrismClear.clearedCount = removedColorCells.length;
      resolution.eliminationSequence = EliminationSequenceBuilder.buildBottomUpRowEliminationSequence(
        removedColorCells,
        grid
      );
      var removedReactive = this._resolveReactiveEntitiesAfterRemoval(
        removedColorCells,
        grid,
        resolution
      );
      var matchedCells = removedColorCells.concat(removedReactive);
      resolution.matched = matchedCells;
      if (resolution.impact) {
        resolution.impact = this._filterImpactEventSurvivors(resolution.impact, matchedCells);
      }
      this._pushBubbleBreakEvent(matchedCells, resolution.eliminationSequence);
      this._registerMatchedObjectiveCollection(
        matchedCells,
        resolution.eliminationSequence,
        resolution,
        grid
      );

      if (this._hasPendingMolotovBlasts()) {
        resolution.collected = matchedCells.slice();
        this._beginMolotovPendingResolution(resolution, "matchedDrop", matchedCells);
        this._pushRuntimeEvent("rainbow_prism_ball_cleared", {
          color: prismPlan.color,
          selection_source: prismPlan.selectionSource,
          removed: removedColorCells.length,
          visible_rows: prismPlan.visibleRows.slice()
        });
        return resolution;
      }

      var floatingCells = this._findFloatingCellsBeforeSwirlRotation(grid, resolution);
      var removedFloating = grid.removeFloatingCells(
        this._filterFloatingSpiritCocoons(floatingCells, resolution)
      );
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var removedAll = matchedCells.concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);
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

      resolution.collected = removedAll;
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "matchedDrop");
      this._registerComboElimination(resolution);
      this._resolveMultiTrappedSpiritTargets(resolution, matchedCells, grid);
      this._pushRuntimeEvent("rainbow_prism_ball_cleared", {
        color: prismPlan.color,
        selection_source: prismPlan.selectionSource,
        removed: removedColorCells.length,
        visible_rows: prismPlan.visibleRows.slice()
      });

      Logger.info("Rainbow prism ball resolution", {
        color: prismPlan.color,
        selectionSource: prismPlan.selectionSource,
        removed: removedColorCells.length,
        floating: resolution.floating.length,
        scoreDelta: resolution.scoreDelta
      });
      return resolution;
    }
  };
}

module.exports = createGameManagerShotRainbowPrismMethods;
