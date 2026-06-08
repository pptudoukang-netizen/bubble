"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeVector(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createNormalBall(colorCode) {
  return {
    ballCategory: "normal",
    color: colorCode,
    entityCategory: "normal_ball",
    entityType: null
  };
}

function createSkillBall(entityType) {
  return {
    ballCategory: "skill",
    color: null,
    entityCategory: "skill_ball",
    entityType: entityType
  };
}

function resolveBallDisplayCode(ball) {
  if (!ball) {
    return null;
  }

  if (ball.color) {
    return ball.color;
  }

  if (ball.entityType === "rainbow") {
    return "RAINBOW";
  }

  if (ball.entityType === "blast") {
    return "BLAST";
  }

  if (ball.entityType === "stone") {
    return "STONE";
  }

  return null;
}

function ShooterController() {
  BaseSystem.call(this, "ShooterController");
  this.shotLimit = 0;
  this.availableColors = [];
  this.spawnWeights = {};
  this.skillInventory = {
    rainbow: 0,
    blast: 0,
    swap: 0,
    barrier_hammer: 0
  };
  this.currentBall = null;
  this.nextBall = null;
  this.currentColor = null;
  this.nextColor = null;
  this.aimDirection = { x: 0, y: 1 };
  this.origin = clone(BoardLayout.shooterOrigin);
  this.maxAimAngleDeg = 75;
}

ShooterController.prototype = Object.create(BaseSystem.prototype);
ShooterController.prototype.constructor = ShooterController;

ShooterController.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.shotLimit = levelConfig.level.shotLimit || 0;
  this.availableColors = (levelConfig.level.colors || []).slice();
  this.spawnWeights = Object.assign({}, levelConfig.level.spawnWeights || {});
  this.skillInventory.rainbow = 0;
  this.skillInventory.blast = 0;
  var initialPowerups = levelConfig && levelConfig.level && levelConfig.level.initialPowerups
    ? levelConfig.level.initialPowerups
    : {};
  this.skillInventory.swap = Math.max(0, Math.floor(Number(initialPowerups.swap) || 0));
  this.skillInventory.barrier_hammer = Math.max(0, Math.floor(Number(initialPowerups.barrier_hammer) || 0));
  this.currentBall = this._pickNormalBall();
  this.nextBall = this._pickNormalBall();
  if (Array.isArray(levelConfig.level.initialShotBalls)) {
    this._applyInitialShotBalls(levelConfig.level.initialShotBalls);
  }
  this._syncLegacyColorFields();
  this.aimDirection = { x: 0, y: 1 };
  var configuredMaxAimAngle = levelConfig.level && typeof levelConfig.level.aimMaxAngleDeg === "number"
    ? levelConfig.level.aimMaxAngleDeg
    : 75;
  this.maxAimAngleDeg = clamp(configuredMaxAimAngle, 35, 85);
  return this;
};

ShooterController.prototype._applyInitialShotBalls = function (initialShotBalls) {
  if (!Array.isArray(initialShotBalls) || initialShotBalls.length <= 0 || initialShotBalls.length > 2) {
    throw new Error("ShooterController initialShotBalls must contain 1 or 2 colors.");
  }
  initialShotBalls.forEach(function (colorCode, index) {
    if (this.availableColors.indexOf(colorCode) === -1) {
      throw new Error("ShooterController initialShotBalls[" + index + "] must exist in availableColors: " + colorCode);
    }
  }, this);
  this.currentBall = createNormalBall(initialShotBalls[0]);
  if (initialShotBalls.length >= 2) {
    this.nextBall = createNormalBall(initialShotBalls[1]);
  }
};

ShooterController.prototype.setAimFromPoint = function (point) {
  var dx = point.x - this.origin.x;
  var dy = point.y - this.origin.y;
  var minForward = 8;
  if (dy < minForward) {
    dy = minForward;
  }

  var maxAimRadians = (this.maxAimAngleDeg * Math.PI) / 180;
  var maxAbsDx = Math.tan(maxAimRadians) * dy;
  dx = clamp(dx, -maxAbsDx, maxAbsDx);
  this.aimDirection = normalizeVector({ x: dx, y: dy });
  return this.getAimState();
};

ShooterController.prototype.advanceQueue = function () {
  var firedBall = clone(this.currentBall);
  this.currentBall = this.nextBall ? clone(this.nextBall) : this._pickNormalBall();
  this.nextBall = this._pickNormalBall();
  this._syncLegacyColorFields();

  return {
    firedBall: firedBall,
    firedColor: resolveBallDisplayCode(firedBall),
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    currentColor: this.currentColor,
    nextColor: this.nextColor
  };
};

ShooterController.prototype.addSkillInventory = function (entityType, count) {
  if (entityType !== "rainbow" && entityType !== "blast") {
    return {
      accepted: false,
      reason: "invalid_skill_type"
    };
  }

  return this.addInventory(entityType, count);
};

ShooterController.prototype.addInventory = function (entityType, count) {
  var supportedTypes = ["rainbow", "blast", "swap", "barrier_hammer"];
  if (supportedTypes.indexOf(entityType) === -1) {
    return {
      accepted: false,
      reason: "invalid_inventory_type"
    };
  }

  var gained = Math.max(1, Math.floor(Number(count) || 1));
  this.skillInventory[entityType] = Math.max(0, Math.floor(Number(this.skillInventory[entityType]) || 0)) + gained;
  return {
    accepted: true,
    entityType: entityType,
    gained: gained,
    total: this.skillInventory[entityType]
  };
};

ShooterController.prototype.setUpcomingNormalBalls = function (colorCode, count) {
  if (this.availableColors.indexOf(colorCode) < 0) {
    throw new Error("ShooterController revive color must exist in availableColors: " + colorCode);
  }
  if (!Number.isInteger(count) || count <= 0 || count > 2) {
    throw new Error("ShooterController revive queue count must be 1 or 2.");
  }

  if (count >= 1) {
    this.currentBall = createNormalBall(colorCode);
  }
  if (count >= 2) {
    this.nextBall = createNormalBall(colorCode);
  }
  this._syncLegacyColorFields();
  return {
    accepted: true,
    color: colorCode,
    assignedCount: count,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.setUpcomingRandomNormalBalls = function (count) {
  if (!Number.isInteger(count) || count <= 0 || count > 2) {
    throw new Error("ShooterController revive random queue count must be 1 or 2.");
  }

  if (count >= 1) {
    this.currentBall = this._pickNormalBall();
    if (!this.currentBall) {
      throw new Error("ShooterController revive random current ball is missing.");
    }
  }
  if (count >= 2) {
    this.nextBall = this._pickNormalBall();
    if (!this.nextBall) {
      throw new Error("ShooterController revive random next ball is missing.");
    }
  }
  this._syncLegacyColorFields();
  return {
    accepted: true,
    assignedCount: count,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.equipSkillBall = function (entityType) {
  if (entityType !== "rainbow" && entityType !== "blast") {
    return {
      accepted: false,
      reason: "invalid_skill_type"
    };
  }

  var inventoryCount = Math.max(0, Math.floor(Number(this.skillInventory[entityType]) || 0));
  if (inventoryCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  if (this.currentBall && this.currentBall.ballCategory === "skill") {
    return {
      accepted: false,
      reason: "current_slot_occupied_by_skill"
    };
  }

  this.skillInventory[entityType] = inventoryCount - 1;
  this.currentBall = createSkillBall(entityType);
  this._syncLegacyColorFields();

  return {
    accepted: true,
    entityType: entityType,
    remaining: this.skillInventory[entityType]
  };
};

ShooterController.prototype.resolveCurrentRainbowColor = function (colorCode) {
  if (this.availableColors.indexOf(colorCode) === -1) {
    return {
      accepted: false,
      reason: "invalid_color"
    };
  }

  if (!this.currentBall || this.currentBall.entityCategory !== "skill_ball" || this.currentBall.entityType !== "rainbow") {
    return {
      accepted: false,
      reason: "current_ball_not_rainbow"
    };
  }

  this.currentBall = createNormalBall(colorCode);
  this._syncLegacyColorFields();

  return {
    accepted: true,
    color: colorCode,
    currentBall: clone(this.currentBall)
  };
};

ShooterController.prototype.swapCurrentAndNextBall = function () {
  var swapCount = Math.max(0, Math.floor(Number(this.skillInventory.swap) || 0));
  if (swapCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  if (!this.currentBall || !this.nextBall) {
    return {
      accepted: false,
      reason: "queue_missing"
    };
  }

  var nextCurrent = clone(this.nextBall);
  var nextPreview = clone(this.currentBall);
  this.currentBall = nextCurrent;
  this.nextBall = nextPreview;
  this.skillInventory.swap = swapCount - 1;
  this._syncLegacyColorFields();

  return {
    accepted: true,
    remaining: this.skillInventory.swap,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.consumeBarrierHammer = function () {
  var hammerCount = Math.max(0, Math.floor(Number(this.skillInventory.barrier_hammer) || 0));
  if (hammerCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.barrier_hammer = hammerCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.barrier_hammer
  };
};

ShooterController.prototype.getAimState = function () {
  return {
    origin: clone(this.origin),
    direction: clone(this.aimDirection)
  };
};

ShooterController.prototype.drainRemainingShotBalls = function (remainingCount) {
  if (!Number.isInteger(remainingCount) || remainingCount <= 0) {
    throw new Error("ShooterController.drainRemainingShotBalls requires positive integer remainingCount.");
  }

  var drained = [];
  var current = this.currentBall ? clone(this.currentBall) : null;
  var next = this.nextBall ? clone(this.nextBall) : null;

  for (var index = 0; index < remainingCount; index += 1) {
    if (!current) {
      throw new Error("ShooterController.drainRemainingShotBalls requires current ball at index " + index + ".");
    }
    drained.push(clone(current));
    if (index === remainingCount - 1) {
      break;
    }
    current = next ? clone(next) : this._pickNormalBall();
    if (!current) {
      throw new Error("ShooterController.drainRemainingShotBalls requires next ball at index " + index + ".");
    }
    next = this._pickNormalBall();
    if (!next) {
      throw new Error("ShooterController.drainRemainingShotBalls requires generated preview ball at index " + index + ".");
    }
  }

  this.currentBall = null;
  this.nextBall = null;
  this._syncLegacyColorFields();

  return drained;
};

ShooterController.prototype.getShooterState = function () {
  return {
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    skillInventory: clone(this.skillInventory),
    currentColor: this.currentColor,
    nextColor: this.nextColor,
    aim: this.getAimState(),
    shotLimit: this.shotLimit
  };
};

ShooterController.prototype._pickColor = function () {
  if (!this.availableColors.length) {
    return null;
  }

  var totalWeight = this.availableColors.reduce(function (sum, colorCode) {
    return sum + (this.spawnWeights[colorCode] || 1);
  }.bind(this), 0);

  var threshold = Math.random() * totalWeight;
  var running = 0;

  for (var i = 0; i < this.availableColors.length; i += 1) {
    var colorCode = this.availableColors[i];
    running += this.spawnWeights[colorCode] || 1;
    if (threshold <= running) {
      return colorCode;
    }
  }

  return this.availableColors[this.availableColors.length - 1];
};

ShooterController.prototype._pickNormalBall = function () {
  var colorCode = this._pickColor();
  if (!colorCode) {
    return null;
  }
  return createNormalBall(colorCode);
};

ShooterController.prototype._syncLegacyColorFields = function () {
  this.currentColor = resolveBallDisplayCode(this.currentBall);
  this.nextColor = resolveBallDisplayCode(this.nextBall);
};

ShooterController.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.shotLimit = this.shotLimit;
  snapshot.currentBall = clone(this.currentBall);
  snapshot.nextBall = clone(this.nextBall);
  snapshot.skillInventory = clone(this.skillInventory);
  snapshot.currentColor = this.currentColor;
  snapshot.nextColor = this.nextColor;
  snapshot.origin = clone(this.origin);
  snapshot.aimDirection = clone(this.aimDirection);
  snapshot.maxAimAngleDeg = this.maxAimAngleDeg;
  return snapshot;
};

module.exports = ShooterController;
