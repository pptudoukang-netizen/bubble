"use strict";

function attachFallingMarbleSurplusMethods(FallingMarbleSystem, context) {
  var BoardLayout = context.BoardLayout;
  var SURPLUS_SHOT_INTERVAL_SEC = context.SURPLUS_SHOT_INTERVAL_SEC;
  var SURPLUS_TURRET_ANGLE_LADDER = context.SURPLUS_TURRET_ANGLE_LADDER;
  var SURPLUS_TURRET_ROTATE_INTERVAL_SEC = context.SURPLUS_TURRET_ROTATE_INTERVAL_SEC;
  var normalize = context.normalize;
  var resolveLaunchDeviationFromTurretAngleDeg = context.resolveLaunchDeviationFromTurretAngleDeg;

FallingMarbleSystem.prototype.hasPendingSurplusShots = function () {
  return this.pendingSurplusShotBalls.length > 0;
};

FallingMarbleSystem.prototype._resetSurplusAngleState = function (seed) {
  if (!Number.isInteger(seed)) {
    throw new Error("FallingMarbleSystem surplus volley requires integer seed.");
  }
  this.surplusVolleySeed = seed;
  var startFromLowEnd = seed % 2 === 0;
  this.surplusAngleCursor = startFromLowEnd ? 0 : SURPLUS_TURRET_ANGLE_LADDER.length - 1;
  this.surplusAngleDirection = startFromLowEnd ? 1 : -1;
  this.surplusTurretAngleDeg = SURPLUS_TURRET_ANGLE_LADDER[this.surplusAngleCursor];
  this.surplusTurretRotateTimer = SURPLUS_TURRET_ROTATE_INTERVAL_SEC;
};

FallingMarbleSystem.prototype._advanceSurplusTurretAngle = function () {
  var nextCursor = this.surplusAngleCursor + this.surplusAngleDirection;
  if (nextCursor < 0 || nextCursor >= SURPLUS_TURRET_ANGLE_LADDER.length) {
    this.surplusAngleDirection = -this.surplusAngleDirection;
    nextCursor = this.surplusAngleCursor + this.surplusAngleDirection;
  }
  if (nextCursor < 0 || nextCursor >= SURPLUS_TURRET_ANGLE_LADDER.length) {
    throw new Error("FallingMarbleSystem surplus turret angle cursor out of range.");
  }
  this.surplusAngleCursor = nextCursor;
  this.surplusTurretAngleDeg = SURPLUS_TURRET_ANGLE_LADDER[this.surplusAngleCursor];
};

FallingMarbleSystem.prototype.getSurplusTurretAimDirection = function () {
  var launchDeviationDeg = resolveLaunchDeviationFromTurretAngleDeg(this.surplusTurretAngleDeg);
  var radians = launchDeviationDeg * Math.PI / 180;
  return normalize({
    x: Math.sin(radians),
    y: Math.cos(radians)
  });
};

FallingMarbleSystem.prototype.isSurplusVolleyActive = function () {
  return this.pendingSurplusShotBalls.length > 0 || this.pendingSurplusShotOrigin !== null;
};

FallingMarbleSystem.prototype.getPendingSurplusShotCount = function () {
  if (this.pendingSurplusShotBalls.length > 0 && !this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }
  return this.pendingSurplusShotBalls.length;
};

FallingMarbleSystem.prototype._createSurplusShotDrop = function (ball, spawnIndex, origin) {
  if (!ball || typeof ball !== "object") {
    throw new Error("Surplus shot ball must be object at index " + spawnIndex + ".");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("Surplus shot drop requires shooter origin.");
  }

  var launchDirection = this.getSurplusTurretAimDirection();
  var launchDeviationDeg = resolveLaunchDeviationFromTurretAngleDeg(this.surplusTurretAngleDeg);
  var launchSpeed = 980;
  var horizontalSpeed = launchDirection.x * launchSpeed;
  var upwardSpeed = launchDirection.y * launchSpeed;
  var dropSerial = this._dropSerial + 1;

  return {
    id: "surplus_shot_" + (this._dropSerial += 1),
    sourceId: "surplus_shot",
    color: ball.color || null,
    entityCategory: ball.entityCategory || "normal_ball",
    entityType: ball.entityType || null,
    innerColor: ball.innerColor || null,
    iceSnowballAlreadyCollected: false,
    row: -1,
    col: -1,
    position: {
      x: origin.x,
      y: origin.y + BoardLayout.bubbleRadius * 0.15
    },
    velocity: {
      x: horizontalSpeed,
      y: upwardSpeed
    },
    remainingBounces: this.maxBounces,
    rotation: 0,
    rotationSpeed: horizontalSpeed >= 0 ? 220 : -220,
    jarCooldown: 0,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: origin.x,
    lastStuckY: origin.y,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    launchIndex: spawnIndex,
    launchDropSerial: dropSerial,
    dropKind: "surplus_shot",
    launchAngleDeg: launchDeviationDeg,
    turretAngleDeg: this.surplusTurretAngleDeg,
    rootDropId: "surplus_shot_" + spawnIndex,
    hitFairyIds: [],
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
};

FallingMarbleSystem.prototype._spawnSurplusShotBatch = function (balls, origin, startIndex) {
  if (!balls || !balls.length) {
    throw new Error("FallingMarbleSystem._spawnSurplusShotBatch requires at least one ball.");
  }

  var spawned = [];
  for (var index = 0; index < balls.length; index += 1) {
    spawned.push(this._createSurplusShotDrop(balls[index], startIndex + index, origin));
  }

  return this._activateDropBatch(spawned);
};

FallingMarbleSystem.prototype._spawnNextSurplusShot = function () {
  if (!this.pendingSurplusShotBalls.length) {
    return [];
  }
  if (!this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }
  if (this._countActiveDrops() >= this.maxDynamicMarbles) {
    return [];
  }
  var ball = this.pendingSurplusShotBalls.shift();
  var drop = this._createSurplusShotDrop(ball, this.pendingSurplusShotIndex, this.pendingSurplusShotOrigin);
  this.pendingSurplusShotIndex += 1;
  this.lastDrops = this._activateDropBatch([drop]);
  if (!this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotOrigin = null;
  }
  return this.lastDrops;
};

FallingMarbleSystem.prototype._processPendingSurplusShots = function (dt) {
  var volleyActive = this.isSurplusVolleyActive();
  if (!volleyActive) {
    this.pendingSurplusShotTimer = 0;
    this.surplusTurretRotateTimer = 0;
    return false;
  }
  if (!this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }

  var updated = false;
  var safeDt = typeof dt === "number" && isFinite(dt) && dt > 0 ? dt : 0;
  if (safeDt > 0) {
    this.surplusTurretRotateTimer -= safeDt;
    if (this.surplusTurretRotateTimer <= 0) {
      this._advanceSurplusTurretAngle();
      this.surplusTurretRotateTimer = SURPLUS_TURRET_ROTATE_INTERVAL_SEC;
      updated = true;
    }
  }

  if (!this.pendingSurplusShotBalls.length) {
    return updated;
  }

  this.pendingSurplusShotTimer -= safeDt;
  if (this.pendingSurplusShotTimer > 0) {
    return updated;
  }

  this._spawnNextSurplusShot();
  updated = true;
  if (this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotTimer = SURPLUS_SHOT_INTERVAL_SEC;
  } else {
    this.pendingSurplusShotTimer = 0;
    this.pendingSurplusShotIndex = 0;
  }
  return updated;
};

FallingMarbleSystem.prototype.registerSurplusShotsFromOrigin = function (balls, origin, levelSeed) {
  if (!balls || !balls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires at least one ball.");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires shooter origin.");
  }
  if (!Number.isInteger(levelSeed)) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires integer levelSeed.");
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires positive maxDynamicMarbles.");
  }
  if (this.pendingSurplusShotBalls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin cannot run while surplus shots are pending.");
  }

  this._resetSurplusAngleState(levelSeed);
  this.pendingSurplusShotBalls = balls.slice();
  this.pendingSurplusShotOrigin = {
    x: origin.x,
    y: origin.y
  };
  this.pendingSurplusShotIndex = 0;
  this.pendingSurplusShotTimer = 0;
  this._spawnNextSurplusShot();
  if (this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotTimer = SURPLUS_SHOT_INTERVAL_SEC;
  }
  return this.lastDrops;
};
}

module.exports = attachFallingMarbleSurplusMethods;
