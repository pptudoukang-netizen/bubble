"use strict";

var BaseSystem = require("./BaseSystem");
var FairyAssistConfig = require("../config/FairyAssistConfig");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireFinitePoint(point, fieldName) {
  if (
    !point ||
    typeof point.x !== "number" ||
    !isFinite(point.x) ||
    typeof point.y !== "number" ||
    !isFinite(point.y)
  ) {
    throw new Error(fieldName + " must be a finite point.");
  }
  return point;
}

function countDropHitsOnFairy(drop, fairyId) {
  var hitCount = 0;
  for (var index = 0; index < drop.hitFairyIds.length; index += 1) {
    if (drop.hitFairyIds[index] === fairyId) {
      hitCount += 1;
    }
  }
  return hitCount;
}

function findColorRule(eliminatedCount) {
  if (!Number.isInteger(eliminatedCount) || eliminatedCount <= 0) {
    throw new Error("Fairy assist color requires a positive elimination count.");
  }

  for (var index = 0; index < FairyAssistConfig.colorRules.length; index += 1) {
    var rule = FairyAssistConfig.colorRules[index];
    if (eliminatedCount >= rule.minEliminated && eliminatedCount <= rule.maxEliminated) {
      return rule;
    }
  }
  throw new Error("Fairy assist color range is incomplete for elimination count " + eliminatedCount + ".");
}

function FairyAssistSystem() {
  BaseSystem.call(this, "FairyAssistSystem");
  this.slots = [];
  this.revision = 0;
  this._fairySerial = 0;
  this._entrySerial = 0;
  this.collisionCentersSynced = false;
  this._resetSlots();
}

FairyAssistSystem.prototype = Object.create(BaseSystem.prototype);
FairyAssistSystem.prototype.constructor = FairyAssistSystem;

FairyAssistSystem.prototype._resetSlots = function () {
  this.slots = FairyAssistConfig.slots.map(function (slotConfig) {
    return {
      index: slotConfig.index,
      nodeName: slotConfig.nodeName,
      position: null,
      fairy: null
    };
  });
};

FairyAssistSystem.prototype.configureLevel = function (levelConfig) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("FairyAssistSystem.configureLevel requires level config.");
  }
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.revision = 0;
  this._fairySerial = 0;
  this._entrySerial = 0;
  this.collisionCentersSynced = false;
  this._resetSlots();
  return this;
};

FairyAssistSystem.prototype.syncCollisionCenters = function (centers) {
  if (!Array.isArray(centers) || centers.length !== this.slots.length) {
    throw new Error("FairyAssistSystem.syncCollisionCenters requires one center per slot.");
  }

  for (var index = 0; index < centers.length; index += 1) {
    var center = centers[index];
    if (!center || center.index !== index) {
      throw new Error("FairyAssistSystem.syncCollisionCenters requires contiguous slot indexes.");
    }
    var slot = this.slots[index];
    if (!slot || slot.index !== index) {
      throw new Error("FairyAssistSystem slot state is inconsistent at index " + index + ".");
    }
    var boardPoint = requireFinitePoint(center, "Fairy collision center at index " + index);
    slot.position = {
      x: boardPoint.x,
      y: boardPoint.y
    };
    if (slot.fairy) {
      slot.fairy.position.x = boardPoint.x;
      slot.fairy.position.y = boardPoint.y;
    }
  }
  this.collisionCentersSynced = true;
  return this;
};

FairyAssistSystem.prototype._getActiveFairies = function () {
  return this.slots.filter(function (slot) {
    return slot.fairy !== null;
  }).map(function (slot) {
    return slot.fairy;
  });
};

FairyAssistSystem.prototype._removeByDeparturePriority = function (count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("FairyAssistSystem._removeByDeparturePriority requires positive count.");
  }

  var active = this._getActiveFairies().sort(function (left, right) {
    if (left.bonusStep !== right.bonusStep) {
      return right.bonusStep - left.bonusStep;
    }
    return left.enteredAt - right.enteredAt;
  });
  var removals = active.slice(0, count);
  var events = [];

  removals.forEach(function (fairy) {
    var slot = this.slots[fairy.slotIndex];
    if (!slot || !slot.fairy || slot.fairy.id !== fairy.id) {
      throw new Error("FairyAssistSystem active fairy slot state is inconsistent.");
    }
    slot.fairy = null;
    events.push({
      type: "remove",
      fairyId: fairy.id,
      color: fairy.color,
      slotIndex: fairy.slotIndex
    });
  }, this);

  if (events.length > 0) {
    this.revision += 1;
  }
  return events;
};

FairyAssistSystem.prototype.removeFairyByPoison = function (fairyId) {
  if (typeof fairyId !== "string" || !fairyId) {
    throw new Error("Poison fairy removal requires fairyId.");
  }
  for (var index = 0; index < this.slots.length; index += 1) {
    var slot = this.slots[index];
    if (!slot.fairy || slot.fairy.id !== fairyId) {
      continue;
    }
    var fairy = slot.fairy;
    slot.fairy = null;
    this.revision += 1;
    return {
      type: "remove",
      reason: "poison",
      fairyId: fairy.id,
      color: fairy.color,
      slotIndex: fairy.slotIndex
    };
  }
  throw new Error("Poison fairy removal requires a live fairy: " + fairyId + ".");
};

FairyAssistSystem.prototype.removeFairyByIcicle = function (fairyId) {
  if (typeof fairyId !== "string" || !fairyId) {
    throw new Error("Icicle fairy removal requires fairyId.");
  }
  for (var index = 0; index < this.slots.length; index += 1) {
    var slot = this.slots[index];
    if (!slot.fairy || slot.fairy.id !== fairyId) {
      continue;
    }
    var fairy = slot.fairy;
    slot.fairy = null;
    this.revision += 1;
    return {
      type: "remove",
      reason: "icicle",
      fairyId: fairy.id,
      color: fairy.color,
      slotIndex: fairy.slotIndex
    };
  }
  throw new Error("Icicle fairy removal requires a live fairy: " + fairyId + ".");
};

FairyAssistSystem.prototype._resolveDestinationSlot = function () {
  var emptySlots = [];
  for (var index = 0; index < this.slots.length; index += 1) {
    if (this.slots[index].fairy === null) {
      emptySlots.push(this.slots[index]);
    }
  }
  if (emptySlots.length > 0) {
    var randomIndex = Math.floor(Math.random() * emptySlots.length);
    return {
      slot: emptySlots[randomIndex],
      replacedFairy: null
    };
  }

  var occupied = this.slots.slice().sort(function (left, right) {
    if (left.fairy.bonusStep !== right.fairy.bonusStep) {
      return left.fairy.bonusStep - right.fairy.bonusStep;
    }
    return left.fairy.enteredAt - right.fairy.enteredAt;
  });
  if (!occupied.length || !occupied[0].fairy) {
    throw new Error("FairyAssistSystem replacement requires occupied slots.");
  }
  return {
    slot: occupied[0],
    replacedFairy: occupied[0].fairy
  };
};

FairyAssistSystem.prototype._spawnFairy = function (eliminatedCount, spawnFrom) {
  if (!this.collisionCentersSynced) {
    throw new Error("FairyAssistSystem spawn requires board-space centers synced from renderer.");
  }
  var rule = findColorRule(eliminatedCount);
  var destination = this._resolveDestinationSlot();
  var slot = destination.slot;
  requireFinitePoint(slot.position, "Fairy assist destination slot position");
  var replacedFairy = destination.replacedFairy;
  var fairy = {
    id: "fairy_assist_" + (this._fairySerial += 1),
    color: rule.color,
    bonusStep: rule.bonusStep,
    canSplit: rule.canSplit,
    skinName: rule.skinName,
    slotIndex: slot.index,
    position: {
      x: slot.position.x,
      y: slot.position.y
    },
    spawnFrom: {
      x: spawnFrom.x,
      y: spawnFrom.y
    },
    enteredAt: this._entrySerial += 1,
    glowStacks: 0
  };

  slot.fairy = fairy;
  this.revision += 1;
  return [{
    type: "spawn",
    fairyId: fairy.id,
    color: fairy.color,
    slotIndex: fairy.slotIndex,
    from: clone(fairy.spawnFrom),
    to: clone(fairy.position),
    replacedFairyId: replacedFairy ? replacedFairy.id : null
  }];
};

FairyAssistSystem.prototype.resolveAfterShot = function (resolution, grid) {
  if (!resolution || !Array.isArray(resolution.matched) || !Array.isArray(resolution.floating)) {
    throw new Error("FairyAssistSystem.resolveAfterShot requires matched and floating arrays.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("FairyAssistSystem.resolveAfterShot requires grid.getCellPosition.");
  }

  if (resolution.matched.length === 0) {
    return this._removeByDeparturePriority(FairyAssistConfig.removeCountOnMiss);
  }

  var lastEliminated = resolution.matched[resolution.matched.length - 1];
  if (!lastEliminated || !Number.isInteger(lastEliminated.row) || !Number.isInteger(lastEliminated.col)) {
    throw new Error("Fairy assist spawn requires final eliminated cell coordinates.");
  }
  var spawnFrom = requireFinitePoint(
    grid.getCellPosition(lastEliminated.row, lastEliminated.col),
    "Fairy assist spawn point"
  );
  return this._spawnFairy(resolution.matched.length, spawnFrom);
};

FairyAssistSystem.prototype.resolveFirstCollision = function (drop, bubbleRadius) {
  if (!this.collisionCentersSynced) {
    throw new Error("FairyAssistSystem collision requires board-space centers synced from renderer.");
  }
  if (!drop || !drop.position || !Array.isArray(drop.hitFairyIds)) {
    throw new Error("FairyAssistSystem collision requires drop position and hitFairyIds.");
  }
  requireFinitePoint(drop.position, "Fairy assist collision drop position");
  if (typeof bubbleRadius !== "number" || !isFinite(bubbleRadius) || bubbleRadius <= 0) {
    throw new Error("FairyAssistSystem collision requires positive bubbleRadius.");
  }

  var collisionDistance = FairyAssistConfig.fairyCollisionRadius + bubbleRadius;
  var collisionDistanceSq = collisionDistance * collisionDistance;
  for (var index = 0; index < this.slots.length; index += 1) {
    var fairy = this.slots[index].fairy;
    if (fairy === null) {
      continue;
    }
    if (countDropHitsOnFairy(drop, fairy.id) >= FairyAssistConfig.maxCollisionsPerFairy) {
      continue;
    }
    var dx = drop.position.x - fairy.position.x;
    var dy = drop.position.y - fairy.position.y;
    if (dx * dx + dy * dy > collisionDistanceSq) {
      continue;
    }

    drop.hitFairyIds.push(fairy.id);
    this.revision += 1;
    return {
      fairy: fairy,
      collisionDistance: collisionDistance,
      dx: dx,
      dy: dy
    };
  }
  return null;
};

FairyAssistSystem.prototype.snapshotForRender = function () {
  return {
    revision: this.revision,
    slots: this.slots
  };
};

FairyAssistSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.revision = this.revision;
  snapshot.slots = clone(this.slots);
  return snapshot;
};

module.exports = FairyAssistSystem;
