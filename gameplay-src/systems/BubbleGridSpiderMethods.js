"use strict";

function attachBubbleGridSpiderMethods(BubbleGrid, context) {
  var clone = context.clone;
  var keyFor = context.keyFor;

  function compareSpiders(left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.col !== right.col) {
      return left.col - right.col;
    }
    return String(left.id).localeCompare(String(right.id));
  }

  BubbleGrid.prototype._createSpiderCocoonAt = function (lockRowId, row, col) {
    if (typeof lockRowId !== "string" || !lockRowId) {
      throw new Error("Spider cocoon requires lockRowId.");
    }
    if (!Number.isInteger(row) || !Number.isInteger(col) || !this._isLayoutBackedCell(row, col)) {
      throw new Error("Spider cocoon requires valid layout coordinates.");
    }
    var coordinateKey = keyFor(row, col);
    if (this.layout[row].charAt(col) !== ".") {
      throw new Error("Spider cocoon target must remain an empty layout slot: " + coordinateKey + ".");
    }
    if (this._specialCellMap[coordinateKey] || this._wormholeMap[coordinateKey]) {
      throw new Error("Spider cocoon target is already occupied: " + coordinateKey + ".");
    }
    var cocoon = {
      id: "spider_cocoon_" + lockRowId + "_" + row + "_" + col,
      entityCategory: "obstacle_ball",
      entityType: "spider_cocoon",
      row: row,
      col: col,
      spiderCocoonLockRowId: lockRowId
    };
    this._specialCellMap[coordinateKey] = cocoon;
    this._spiderCocoonByCell[coordinateKey] = cocoon;
    return clone(cocoon);
  };

  BubbleGrid.prototype._fillSpiderRowCocoons = function () {
    Object.keys(this._spiderLocksById).forEach(function (lockRowId) {
      var lock = this._spiderLocksById[lockRowId];
      if (!lock || !Number.isInteger(lock.row) || !lock.spiderIds || typeof lock.spiderIds !== "object") {
        throw new Error("Spider row lock state is invalid: " + lockRowId + ".");
      }
      if (!Object.keys(lock.spiderIds).length) {
        throw new Error("Active spider row lock must retain at least one spider: " + lockRowId + ".");
      }
      var columnCount = this.getColumnCountForRow(lock.row);
      for (var col = 0; col < columnCount; col += 1) {
        var coordinateKey = keyFor(lock.row, col);
        if (
          this.layout[lock.row].charAt(col) !== "." ||
          this._specialCellMap[coordinateKey] ||
          this._wormholeMap[coordinateKey]
        ) {
          continue;
        }
        this._createSpiderCocoonAt(lockRowId, lock.row, col);
      }
    }, this);
  };

  BubbleGrid.prototype._configureSpiderRows = function (spiderRows) {
    var configuredRows = spiderRows === undefined ? [] : spiderRows;
    if (!Array.isArray(configuredRows)) {
      throw new Error("BubbleGrid level.spiderRows must be an array when configured.");
    }
    this._spidersById = {};
    this._spiderIdByCell = {};
    this._spiderLocksById = {};
    this._spiderLockIdByRow = {};
    this._spiderCocoonByCell = {};
    this._spiderLockCount = 0;

    configuredRows.forEach(function (spider, index) {
      if (
        !spider ||
        typeof spider.id !== "string" ||
        !spider.id ||
        typeof spider.lockRowId !== "string" ||
        !spider.lockRowId ||
        !Number.isInteger(spider.row) ||
        !Number.isInteger(spider.col)
      ) {
        throw new Error("BubbleGrid spiderRows entry is invalid at index " + index + ".");
      }
      if (this._spidersById[spider.id]) {
        throw new Error("BubbleGrid spider id is duplicated: " + spider.id + ".");
      }
      if (!this._isLayoutBackedCell(spider.row, spider.col)) {
        throw new Error("BubbleGrid spider anchor is outside the authored layout: " + spider.id + ".");
      }
      var coordinateKey = keyFor(spider.row, spider.col);
      if (this.layout[spider.row].charAt(spider.col) === ".") {
        throw new Error("BubbleGrid spider anchor must be an ordinary ball: " + coordinateKey + ".");
      }
      if (this._specialCellMap[coordinateKey] || this._wormholeMap[coordinateKey]) {
        throw new Error("BubbleGrid spider anchor cannot target a special entity: " + coordinateKey + ".");
      }
      if (this._spiderIdByCell[coordinateKey]) {
        throw new Error("BubbleGrid spider anchor is duplicated: " + coordinateKey + ".");
      }
      var existingRowLockId = this._spiderLockIdByRow[String(spider.row)];
      if (existingRowLockId && existingRowLockId !== spider.lockRowId) {
        throw new Error("BubbleGrid spider row must use one lockRowId: " + spider.row + ".");
      }
      var lock = this._spiderLocksById[spider.lockRowId];
      if (!lock) {
        lock = {
          lockRowId: spider.lockRowId,
          row: spider.row,
          spiderIds: {}
        };
        this._spiderLocksById[spider.lockRowId] = lock;
      } else if (lock.row !== spider.row) {
        throw new Error("BubbleGrid spider lockRowId spans multiple rows: " + spider.lockRowId + ".");
      }
      var record = {
        id: spider.id,
        lockRowId: spider.lockRowId,
        row: spider.row,
        col: spider.col
      };
      this._spidersById[record.id] = record;
      this._spiderIdByCell[coordinateKey] = record.id;
      this._spiderLockIdByRow[String(record.row)] = record.lockRowId;
      lock.spiderIds[record.id] = true;
    }, this);
    this._spiderLockCount = Object.keys(this._spiderLocksById).length;
    this._fillSpiderRowCocoons();
  };

  BubbleGrid.prototype.getActiveSpiderRow = function () {
    var activeRow = null;
    Object.keys(this._spiderLocksById).forEach(function (lockRowId) {
      var lock = this._spiderLocksById[lockRowId];
      if (!lock || !Number.isInteger(lock.row) || !Object.keys(lock.spiderIds).length) {
        throw new Error("Active spider row lock is invalid: " + lockRowId + ".");
      }
      if (activeRow === null || lock.row > activeRow) {
        activeRow = lock.row;
      }
    }, this);
    return activeRow;
  };

  BubbleGrid.prototype.getSpiderRows = function () {
    return Object.keys(this._spiderLocksById).map(function (lockRowId) {
      var lock = this._spiderLocksById[lockRowId];
      var spiders = Object.keys(lock.spiderIds).map(function (spiderId) {
        var spider = this._spidersById[spiderId];
        if (!spider) {
          throw new Error("Spider row lock lost spider state: " + spiderId + ".");
        }
        return clone(spider);
      }, this).sort(compareSpiders);
      return {
        lockRowId: lock.lockRowId,
        row: lock.row,
        spiderIds: spiders.map(function (spider) { return spider.id; }),
        spiders: spiders
      };
    }, this).sort(function (left, right) {
      if (left.row !== right.row) {
        return left.row - right.row;
      }
      return left.lockRowId.localeCompare(right.lockRowId);
    });
  };

  BubbleGrid.prototype._applySpiderStateToCell = function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Spider cell state requires integer coordinates.");
    }
    var coordinateKey = keyFor(cell.row, cell.col);
    var lockRowId = this._spiderLockIdByRow[String(cell.row)] || null;
    var spiderId = this._spiderIdByCell[coordinateKey] || null;
    var cocoon = this._spiderCocoonByCell[coordinateKey] || null;
    if (this._spiderLockCount === 0 && !spiderId && !cocoon) {
      return cell;
    }
    if (spiderId && !lockRowId) {
      throw new Error("Spider anchor lost its row lock: " + coordinateKey + ".");
    }
    if (cocoon && (!lockRowId || cocoon.spiderCocoonLockRowId !== lockRowId)) {
      throw new Error("Spider cocoon lost its row lock: " + coordinateKey + ".");
    }
    cell.spiderLocked = lockRowId !== null;
    cell.spiderLockRowId = lockRowId;
    cell.spiderId = spiderId;
    cell.spiderCocoonLockRowId = cocoon ? cocoon.spiderCocoonLockRowId : null;
    var activeRow = this.getActiveSpiderRow();
    cell.spiderProtected = activeRow !== null && cell.row < activeRow;
    return cell;
  };

  BubbleGrid.prototype.isSpiderSpecialProtectedCell = function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Spider special protection lookup requires cell coordinates.");
    }
    var liveCell = this.getCell(cell.row, cell.col);
    if (!liveCell) {
      return false;
    }
    return liveCell.spiderProtected === true || (
      liveCell.spiderLocked === true &&
      !(typeof liveCell.spiderId === "string" && liveCell.spiderId)
    );
  };

  BubbleGrid.prototype.resolveSpiderSpecialHits = function (cells) {
    if (!Array.isArray(cells)) {
      throw new Error("Spider special hit filtering requires cells array.");
    }
    var touched = {};
    return cells.reduce(function (result, cell, index) {
      if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Spider special hit requires cell coordinates at index " + index + ".");
      }
      var coordinateKey = keyFor(cell.row, cell.col);
      if (touched[coordinateKey]) {
        return result;
      }
      touched[coordinateKey] = true;
      var liveCell = this.getCell(cell.row, cell.col);
      if (liveCell && !this.isSpiderSpecialProtectedCell(liveCell)) {
        result.push(liveCell);
      }
      return result;
    }.bind(this), []);
  };

  BubbleGrid.prototype._resolveRemovedSpiderHosts = function (removedHosts) {
    if (!Array.isArray(removedHosts)) {
      throw new Error("Spider host removal requires removedHosts array.");
    }
    var removedCocoons = [];
    var impactedLocks = {};
    removedHosts.forEach(function (host) {
      if (!host || typeof host.spiderId !== "string" || !host.spiderId) {
        throw new Error("Removed spider host requires spiderId.");
      }
      var spider = this._spidersById[host.spiderId];
      if (!spider || spider.row !== host.row || spider.col !== host.col) {
        throw new Error("Removed spider host does not match runtime spider: " + host.spiderId + ".");
      }
      var lock = this._spiderLocksById[spider.lockRowId];
      if (!lock || lock.spiderIds[spider.id] !== true) {
        throw new Error("Removed spider host lost its row lock: " + spider.id + ".");
      }
      if (!impactedLocks[spider.lockRowId]) {
        impactedLocks[spider.lockRowId] = {
          lock: lock,
          removedCoordinates: []
        };
      }
      impactedLocks[spider.lockRowId].removedCoordinates.push({ row: spider.row, col: spider.col });
      delete lock.spiderIds[spider.id];
      delete this._spidersById[spider.id];
      delete this._spiderIdByCell[keyFor(spider.row, spider.col)];
    }, this);

    Object.keys(impactedLocks).forEach(function (lockRowId) {
      var impacted = impactedLocks[lockRowId];
      var remainingSpiderIds = Object.keys(impacted.lock.spiderIds);
      if (remainingSpiderIds.length) {
        impacted.removedCoordinates.forEach(function (coordinate) {
          this._createSpiderCocoonAt(lockRowId, coordinate.row, coordinate.col);
        }, this);
        return;
      }

      Object.keys(this._spiderCocoonByCell).forEach(function (coordinateKey) {
        var cocoon = this._spiderCocoonByCell[coordinateKey];
        if (cocoon.spiderCocoonLockRowId !== lockRowId) {
          return;
        }
        var liveCocoon = this._createSpecialCell(cocoon, cocoon.row, cocoon.col);
        liveCocoon.spiderLocked = true;
        liveCocoon.spiderLockRowId = lockRowId;
        liveCocoon.spiderId = null;
        liveCocoon.spiderCocoonLockRowId = lockRowId;
        liveCocoon.spiderProtected = false;
        removedCocoons.push(liveCocoon);
        delete this._specialCellMap[coordinateKey];
        delete this._spiderCocoonByCell[coordinateKey];
      }, this);
      delete this._spiderLockIdByRow[String(impacted.lock.row)];
      delete this._spiderLocksById[lockRowId];
    }, this);
    this._spiderLockCount = Object.keys(this._spiderLocksById).length;
    return removedCocoons;
  };
}

module.exports = attachBubbleGridSpiderMethods;
