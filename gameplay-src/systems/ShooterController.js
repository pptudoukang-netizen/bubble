"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");

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

  if (ball.entityType === "crystal_gun") {
    return "CRYSTAL_GUN";
  }

  if (ball.entityType === "rainbow_prism_ball") {
    return "RAINBOW_PRISM_BALL";
  }

  if (ball.entityType === "stone") {
    return "STONE";
  }

  return null;
}

function requireRemainingShotCount(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function ShooterController() {
  BaseSystem.call(this, "ShooterController");
  this.shotLimit = 0;
  this.availableColors = [];
  this.spawnWeights = {};
  this.skillInventory = {
    precise_aim: 0,
    rainbow: 0,
    blast: 0,
    crystal_gun: 0,
    rainbow_prism_ball: 0,
    swap: 0,
    barrier_hammer: 0,
    snow_removal: 0
  };
  this.currentBall = null;
  this.nextBall = null;
  this.authoredOpeningQueue = [];
  this.lastRandomColor = null;
  this.consecutiveRandomColorCount = 0;
  this.currentColor = null;
  this.nextColor = null;
  this.queueAdvanceRevision = 0;
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
  this.skillInventory.crystal_gun = 0;
  this.skillInventory.rainbow_prism_ball = 0;
  this.skillInventory.precise_aim = 0;
  var initialPowerups = levelConfig.level.initialPowerups;
  if (!initialPowerups || typeof initialPowerups !== "object" || Array.isArray(initialPowerups)) {
    throw new Error("ShooterController requires normalized level.initialPowerups.");
  }
  ["swap", "barrier_hammer", "rainbow_prism_ball"].forEach(function (powerupType) {
    if (!Object.prototype.hasOwnProperty.call(initialPowerups, powerupType) ||
        !Number.isInteger(initialPowerups[powerupType]) || initialPowerups[powerupType] < 0) {
      throw new Error("ShooterController requires non-negative integer initialPowerups." + powerupType + ".");
    }
  });
  this.skillInventory.swap = initialPowerups.swap;
  this.skillInventory.barrier_hammer = initialPowerups.barrier_hammer;
  this.skillInventory.rainbow_prism_ball = initialPowerups.rainbow_prism_ball;
  this.skillInventory.snow_removal = 0;
  this.currentBall = null;
  this.nextBall = null;
  this.authoredOpeningQueue = [];
  this.lastRandomColor = null;
  this.consecutiveRandomColorCount = 0;
  if (levelConfig.level.openingShotBalls !== undefined && levelConfig.level.initialShotBalls !== undefined) {
    throw new Error("ShooterController openingShotBalls and initialShotBalls cannot both be configured.");
  }
  if (levelConfig.level.openingShotBalls !== undefined) {
    this._applyOpeningShotBalls(levelConfig.level.openingShotBalls);
  }
  if (Array.isArray(levelConfig.level.initialShotBalls)) {
    this._applyInitialShotBalls(levelConfig.level.initialShotBalls);
  }
  this._syncQueueForRemainingShots(
    levelConfig.level.playMode === "timed_infinite_shots" ? 2 : this.shotLimit
  );
  this.queueAdvanceRevision = 0;
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

ShooterController.prototype._applyOpeningShotBalls = function (openingShotBalls) {
  if (!Array.isArray(openingShotBalls) || openingShotBalls.length < 3 || openingShotBalls.length > 6) {
    throw new Error("ShooterController openingShotBalls must contain 3 to 6 colors.");
  }
  if (openingShotBalls.length > this.shotLimit) {
    throw new Error("ShooterController openingShotBalls length must not exceed shotLimit.");
  }
  openingShotBalls.forEach(function (colorCode, index) {
    if (this.availableColors.indexOf(colorCode) === -1) {
      throw new Error("ShooterController openingShotBalls[" + index + "] must exist in availableColors: " + colorCode);
    }
  }, this);
  this.authoredOpeningQueue = openingShotBalls.slice();
};

ShooterController.prototype.resetAimDirection = function () {
  this.aimDirection = { x: 0, y: 1 };
  return this.getAimState();
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

ShooterController.prototype._syncQueueForRemainingShots = function (remainingShotCount) {
  requireRemainingShotCount(remainingShotCount, "ShooterController remainingShotCount");

  if (remainingShotCount <= 0) {
    this.currentBall = null;
    this.nextBall = null;
    this._syncLegacyColorFields();
    return {
      currentBall: null,
      nextBall: null
    };
  }

  if (!this.currentBall) {
    this.currentBall = this._pickNormalBall();
    if (!this.currentBall) {
      throw new Error("ShooterController requires current ball for remaining shots.");
    }
  }

  if (remainingShotCount === 1) {
    this.nextBall = null;
    this._syncLegacyColorFields();
    return {
      currentBall: clone(this.currentBall),
      nextBall: null
    };
  }

  if (!this.nextBall) {
    this.nextBall = this._pickNormalBall();
    if (!this.nextBall) {
      throw new Error("ShooterController requires next ball for remaining shots.");
    }
  }

  this._syncLegacyColorFields();
  return {
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.syncFiniteShotQueue = function (remainingShotCount) {
  var result = this._syncQueueForRemainingShots(remainingShotCount);
  return {
    accepted: true,
    remainingShotCount: remainingShotCount,
    currentBall: result.currentBall,
    nextBall: result.nextBall
  };
};

ShooterController.prototype.advanceQueue = function (remainingShotCountAfterFire, infiniteShots) {
  if (!this.currentBall) {
    throw new Error("ShooterController.advanceQueue requires current ball.");
  }

  var firedBall = clone(this.currentBall);
  this.currentBall = this.nextBall ? clone(this.nextBall) : null;
  this.nextBall = null;

  if (infiniteShots) {
    this._syncQueueForRemainingShots(2);
  } else {
    this._syncQueueForRemainingShots(
      requireRemainingShotCount(remainingShotCountAfterFire, "ShooterController remainingShotCountAfterFire")
    );
  }

  this.queueAdvanceRevision += 1;
  this._syncLegacyColorFields();

  return {
    firedBall: firedBall,
    firedColor: resolveBallDisplayCode(firedBall),
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    queueAdvanceRevision: this.queueAdvanceRevision,
    currentColor: this.currentColor,
    nextColor: this.nextColor
  };
};

ShooterController.prototype.addSkillInventory = function (entityType, count) {
  if (
    entityType !== "rainbow" &&
    entityType !== "blast" &&
    entityType !== "crystal_gun" &&
    entityType !== "rainbow_prism_ball"
  ) {
    return {
      accepted: false,
      reason: "invalid_skill_type"
    };
  }

  return this.addInventory(entityType, count);
};

ShooterController.prototype.addInventory = function (entityType, count) {
  var supportedTypes = ["precise_aim", "rainbow", "blast", "crystal_gun", "rainbow_prism_ball", "swap", "barrier_hammer", "snow_removal"];
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

ShooterController.prototype.consumePreciseAim = function () {
  if (!Object.prototype.hasOwnProperty.call(this.skillInventory, "precise_aim")) {
    throw new Error("ShooterController precise_aim inventory is missing.");
  }
  var preciseAimCount = Number(this.skillInventory.precise_aim);
  if (!Number.isInteger(preciseAimCount) || preciseAimCount < 0) {
    throw new Error("ShooterController precise_aim inventory must be a non-negative integer.");
  }
  if (preciseAimCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.precise_aim = preciseAimCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.precise_aim
  };
};

ShooterController.prototype.setUpcomingNormalBalls = function (colorCode, count) {
  if (this.availableColors.indexOf(colorCode) < 0) {
    throw new Error("ShooterController revive color must exist in availableColors: " + colorCode);
  }
  if (!Number.isInteger(count) || count <= 0 || count > 2) {
    throw new Error("ShooterController revive queue count must be 1 or 2.");
  }

  this.authoredOpeningQueue = [];
  if (count >= 1) {
    this.currentBall = createNormalBall(colorCode);
  }
  if (count >= 2) {
    this.nextBall = createNormalBall(colorCode);
  } else {
    this.nextBall = null;
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

  this.authoredOpeningQueue = [];
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
  } else {
    this.nextBall = null;
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
  if (
    entityType !== "rainbow" &&
    entityType !== "blast" &&
    entityType !== "crystal_gun" &&
    entityType !== "rainbow_prism_ball"
  ) {
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

ShooterController.prototype.convertCurrentNormalBallToSkillBall = function (entityType) {
  if (entityType !== "blast") {
    throw new Error("ShooterController produced ball type is unsupported: " + entityType);
  }
  if (!this.currentBall || this.currentBall.ballCategory !== "normal") {
    throw new Error("ShooterController produced ball conversion requires a current normal ball.");
  }

  var replacedBall = clone(this.currentBall);
  this.currentBall = createSkillBall(entityType);
  this._syncLegacyColorFields();
  return {
    accepted: true,
    entityType: entityType,
    replacedBall: replacedBall,
    currentBall: clone(this.currentBall)
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
  this.currentBall.sourceSkillBallType = "rainbow";
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

ShooterController.prototype.consumeSnowRemoval = function () {
  if (!Object.prototype.hasOwnProperty.call(this.skillInventory, "snow_removal")) {
    throw new Error("ShooterController snow_removal inventory is missing.");
  }
  var snowRemovalCount = Number(this.skillInventory.snow_removal);
  if (!Number.isInteger(snowRemovalCount) || snowRemovalCount < 0) {
    throw new Error("ShooterController snow_removal inventory must be a non-negative integer.");
  }
  if (snowRemovalCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.snow_removal = snowRemovalCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.snow_removal
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

ShooterController.prototype.getShooterStateForRender = function () {
  return {
    currentBall: this.currentBall,
    nextBall: this.nextBall,
    queueAdvanceRevision: this.queueAdvanceRevision,
    skillInventory: this.skillInventory,
    currentColor: this.currentColor,
    nextColor: this.nextColor,
    aim: {
      origin: this.origin,
      direction: this.aimDirection
    },
    shotLimit: this.shotLimit
  };
};

ShooterController.prototype.getShooterState = function () {
  return {
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    queueAdvanceRevision: this.queueAdvanceRevision,
    skillInventory: clone(this.skillInventory),
    currentColor: this.currentColor,
    nextColor: this.nextColor,
    authoredOpeningQueue: this.authoredOpeningQueue.slice(),
    aim: this.getAimState(),
    shotLimit: this.shotLimit
  };
};

ShooterController.prototype._pickColor = function () {
  if (!this.availableColors.length) {
    return null;
  }

  var candidateColors = this.consecutiveRandomColorCount >= 2
    ? this.availableColors.filter(function (colorCode) {
      return colorCode !== this.lastRandomColor;
    }.bind(this))
    : this.availableColors;
  if (!candidateColors.length) {
    throw new Error("ShooterController cannot generate a third consecutive random color without another available color.");
  }

  var totalWeight = candidateColors.reduce(function (sum, colorCode) {
    return sum + (this.spawnWeights[colorCode] || 1);
  }.bind(this), 0);

  var threshold = Math.random() * totalWeight;
  var running = 0;

  var selectedColor = candidateColors[candidateColors.length - 1];
  for (var i = 0; i < candidateColors.length; i += 1) {
    var colorCode = candidateColors[i];
    running += this.spawnWeights[colorCode] || 1;
    if (threshold <= running) {
      selectedColor = colorCode;
      break;
    }
  }

  if (selectedColor === this.lastRandomColor) {
    this.consecutiveRandomColorCount += 1;
  } else {
    this.lastRandomColor = selectedColor;
    this.consecutiveRandomColorCount = 1;
  }
  return selectedColor;
};

ShooterController.prototype._pickNormalBall = function () {
  var colorCode = this.authoredOpeningQueue.length > 0
    ? this.authoredOpeningQueue.shift()
    : this._pickColor();
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
  snapshot.queueAdvanceRevision = this.queueAdvanceRevision;
  snapshot.skillInventory = clone(this.skillInventory);
  snapshot.currentColor = this.currentColor;
  snapshot.nextColor = this.nextColor;
  snapshot.authoredOpeningQueue = this.authoredOpeningQueue.slice();
  snapshot.origin = clone(this.origin);
  snapshot.aimDirection = clone(this.aimDirection);
  snapshot.maxAimAngleDeg = this.maxAimAngleDeg;
  return snapshot;
};

module.exports = ShooterController;
