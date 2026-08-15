"use strict";

function createGameManagerShotReactiveMethods(context) {
  var isBlackHoleBall = context.isBlackHoleBall;
  var KEY_UNLOCK_DROP_DELAY = context.KEY_UNLOCK_DROP_DELAY;
  var buildNearestKeyLockPairings = context.buildNearestKeyLockPairings;
  var createGameManagerShotReactiveMethods = context.createGameManagerShotReactiveMethods;
  var hasUnlockEntryForKey = context.hasUnlockEntryForKey;
  var isIceBall = context.isIceBall;
  var isKeyBall = context.isKeyBall;
  var isLockedBall = context.isLockedBall;
  var isMolotovBall = context.isMolotovBall;
  var isSplitterBall = context.isSplitterBall;
  var isVineEntangledBall = context.isVineEntangledBall;
  var isVineSpiritBall = context.isVineSpiritBall;
  var resolveIceInnerColor = context.resolveIceInnerColor;

  return {
    _unloadBlackHolesHitByRange: function (affectedCells, grid, resolution, sourceType) {
      if (!Array.isArray(affectedCells)) {
        throw new Error("Black hole range unload requires affectedCells array.");
      }
      if (!grid || typeof grid.getCell !== "function") {
        throw new Error("Black hole range unload requires BubbleGrid.getCell.");
      }
      if (typeof sourceType !== "string" || !sourceType) {
        throw new Error("Black hole range unload requires sourceType.");
      }
      var remainingCells = [];
      var unloadedKeys = {};
      affectedCells.forEach(function (affectedCell) {
        if (!affectedCell || !Number.isInteger(affectedCell.row) || !Number.isInteger(affectedCell.col)) {
          throw new Error("Black hole range unload requires affected cell coordinates.");
        }
        var liveCell = grid.getCell(affectedCell.row, affectedCell.col);
        if (!liveCell) {
          return;
        }
        if (!isBlackHoleBall(liveCell)) {
          remainingCells.push(liveCell);
          return;
        }
        if (typeof grid.unloadBlackHole !== "function") {
          throw new Error("Black hole range unload requires BubbleGrid.unloadBlackHole when a black hole is hit.");
        }
        if (!resolution || !Array.isArray(resolution.blackHolesUnloaded)) {
          throw new Error("Black hole range unload requires resolution.blackHolesUnloaded when a black hole is hit.");
        }
        var cellKey = liveCell.row + ":" + liveCell.col;
        if (unloadedKeys[cellKey]) {
          return;
        }
        unloadedKeys[cellKey] = true;
        var removedBlackHole = grid.unloadBlackHole(liveCell.row, liveCell.col);
        resolution.blackHolesUnloaded.push({
          id: "black_hole_unload_" + sourceType + "_" + removedBlackHole.id,
          blackHoleId: removedBlackHole.id,
          row: removedBlackHole.row,
          col: removedBlackHole.col,
          capacityBefore: removedBlackHole.capacity,
          sourceType: sourceType
        });
      });
      return remainingCells;
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

      this._queueSpiritCocoonsAdjacentToCells(removedCells, resolution);
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
    }
  };
}

module.exports = createGameManagerShotReactiveMethods;
