"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function createZeroMap(colors) {
  return (colors || []).reduce(function (result, colorCode) {
    result[colorCode] = 0;
    return result;
  }, {});
}

function getCollectAnyTarget(levelConfig) {
  var objectives = levelConfig.level.bonusObjectives || [];
  for (var i = 0; i < objectives.length; i += 1) {
    if (objectives[i].type === "collect_any") {
      return objectives[i].value || 0;
    }
  }

  return 0;
}

function requireCollectObjective(objective) {
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
    throw new Error("Eliminated objective collection requires objective.");
  }
  if (objective.type !== "collect_any" && objective.type !== "collect_color") {
    throw new Error("Eliminated objective collection unsupported objective type: " + objective.type);
  }
  if (objective.type === "collect_color" && (typeof objective.color !== "string" || !objective.color)) {
    throw new Error("Eliminated collect_color objective requires color.");
  }
}

function isCollectableEliminatedCell(cell, objective, jarColors) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Eliminated objective collection requires cell objects.");
  }
  if (cell.entityCategory !== "normal_ball") {
    return false;
  }
  if (typeof cell.color !== "string" || !cell.color) {
    throw new Error("Eliminated normal ball requires color.");
  }
  if (objective.type === "collect_color") {
    return cell.color === objective.color;
  }
  return jarColors.indexOf(cell.color) !== -1;
}

function JarCollectorSystem() {
  BaseSystem.call(this, "JarCollectorSystem");
  this.jarCount = 0;
  this.jarColors = [];
  this.collectedTotal = 0;
  this.collectedByColor = {};
  this.objectiveTarget = 0;
  this.lastCollected = [];
}

JarCollectorSystem.prototype = Object.create(BaseSystem.prototype);
JarCollectorSystem.prototype.constructor = JarCollectorSystem;

JarCollectorSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.jarCount = levelConfig.level.jarCount || 0;
  this.jarColors = (levelConfig.level.jarColors || []).slice();
  this.collectedTotal = 0;
  this.collectedByColor = createZeroMap(this.jarColors);
  this.objectiveTarget = getCollectAnyTarget(levelConfig);
  this.lastCollected = [];
  return this;
};

JarCollectorSystem.prototype.collect = function (cells) {
  this.lastCollected = [];

  (cells || []).forEach(function (cell) {
    if (!cell || this.jarColors.indexOf(cell.color) === -1) {
      return;
    }

    this.collectedTotal += 1;
    this.collectedByColor[cell.color] = (this.collectedByColor[cell.color] || 0) + 1;
    this.lastCollected.push({
      color: cell.color,
      row: cell.row,
      col: cell.col,
      id: cell.id,
      jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1,
      jarColor: cell.jarColor || null,
      sameColor: !!cell.sameColor,
      bonusMultiplier: typeof cell.bonusMultiplier === "number" ? cell.bonusMultiplier : 1
    });
  }, this);

  return this.snapshot();
};

JarCollectorSystem.prototype.collectEliminatedObjectiveCells = function (cells, objective) {
  if (!Array.isArray(cells)) {
    throw new Error("Eliminated objective collection requires cells array.");
  }
  requireCollectObjective(objective);
  if (objective.type === "collect_color" && this.jarColors.indexOf(objective.color) === -1) {
    throw new Error("Eliminated collect_color target must be present in jarColors: " + objective.color);
  }

  var collected = [];
  cells.forEach(function (cell) {
    if (!isCollectableEliminatedCell(cell, objective, this.jarColors)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this.collectedByColor, cell.color)) {
      throw new Error("Eliminated objective color missing from collectedByColor: " + cell.color);
    }

    this.collectedTotal += 1;
    this.collectedByColor[cell.color] += 1;
    collected.push({
      color: cell.color,
      row: cell.row,
      col: cell.col,
      id: cell.id
    });
  }, this);

  return collected;
};

JarCollectorSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.jarCount = this.jarCount;
  snapshot.jarColors = this.jarColors.slice();
  snapshot.collectedTotal = this.collectedTotal;
  snapshot.collectedByColor = Object.assign({}, this.collectedByColor);
  snapshot.objectiveTarget = this.objectiveTarget;
  snapshot.objectiveProgress = Math.min(this.collectedTotal, this.objectiveTarget || this.collectedTotal);
  snapshot.lastCollected = clone(this.lastCollected);
  return snapshot;
};

module.exports = JarCollectorSystem;

