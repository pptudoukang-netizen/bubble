"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function reflectVector(vector, normal) {
  var dot = vector.x * normal.x + vector.y * normal.y;
  return {
    x: vector.x - 2 * dot * normal.x,
    y: vector.y - 2 * dot * normal.y
  };
}

function getJarRenderCenterY() {
  return (Number(BoardLayout.jarBaseY) || 0) + (Number(BoardLayout.jarRenderYOffset) || 0);
}

function resolveInitialDropVelocity(cell, standardVelocity) {
  if (Object.prototype.hasOwnProperty.call(cell, "__molotovBlastVelocity")) {
    var molotovVelocity = cell.__molotovBlastVelocity;
    if (
      !molotovVelocity ||
      typeof molotovVelocity.x !== "number" ||
      typeof molotovVelocity.y !== "number" ||
      !isFinite(molotovVelocity.x) ||
      !isFinite(molotovVelocity.y)
    ) {
      throw new Error("FallingMarbleSystem molotov blast velocity must be finite.");
    }
    return {
      x: molotovVelocity.x,
      y: molotovVelocity.y
    };
  }
  return standardVelocity;
}

function createEmptyUpdateResult() {
  return {
    updated: false,
    collected: [],
    missed: [],
    bounced: 0
  };
}

var SURPLUS_SHOTS_PER_FRAME = 1;

function FallingMarbleSystem() {
  BaseSystem.call(this, "FallingMarbleSystem");
  this.maxDynamicMarbles = 0;
  this.maxBounces = 0;
  this.totalFallen = 0;
  this.lastDrops = [];
  this.activeDrops = [];
  this.lastCollectedDrops = [];
  this.lastMissedDrops = [];
  this.lastBounceCount = 0;
  this.gravity = 2200;
  this.initialSpeedY = 220;
  this.horizontalSpeed = 190;
  this.bounceDamping = 0.78;
  this.cleanupY = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 4;
  this.jarCount = 0;
  this.jarColors = [];
  this.jarRules = {
    rimBounce: 0.72,
    collectZoneScale: 1,
    sameColorBonus: 1.6
  };
  this.jarZones = [];
  this.rimEdgeThickness = Math.max(1, Number(BoardLayout.jarSideCollisionWidth) || 40);
  this._dropSerial = 0;
  this._renderSnapshotCache = null;
  this._renderSnapshotDirty = true;
  this._dropLeftLimit = BoardLayout.boardLeft + BoardLayout.bubbleRadius;
  this._dropRightLimit = BoardLayout.boardRight - BoardLayout.bubbleRadius;
  this.maxDropLifeTime = 3.2;
  this.maxRimBounces = 5;
  this.stuckDistanceThreshold = 2.5;
  this.stuckTimeThreshold = 0.32;
  this.jarGapAttractAccel = 760;
  this.jarGapMaxSpeed = 260;
  this.rimBounceLiftMin = 55;
  this.rimBounceSpeed = Math.max(120, Number(BoardLayout.jarRimBounceSpeed) || 260);
  this.rimBounceDecay = 0.84;
  this._jarAttractTopY = getJarRenderCenterY();
  this._jarAttractBottomY = getJarRenderCenterY() - BoardLayout.jarHeight;
  this._layoutSignature = "";
  this.pendingSurplusShotBalls = [];
  this.pendingSurplusShotOrigin = null;
  this.pendingSurplusShotIndex = 0;
}

FallingMarbleSystem.prototype = Object.create(BaseSystem.prototype);
FallingMarbleSystem.prototype.constructor = FallingMarbleSystem;

FallingMarbleSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  var rules = (levelConfig.sharedDefaults && levelConfig.sharedDefaults.fallingRules) || {};

  this.maxDynamicMarbles = rules.maxDynamicMarbles || 0;
  this.maxBounces = rules.maxBounces || 0;
  this.totalFallen = 0;
  this.lastDrops = [];
  this.activeDrops = [];
  this.lastCollectedDrops = [];
  this.lastMissedDrops = [];
  this.lastBounceCount = 0;
  this.gravity = typeof rules.gravity === "number" ? Math.max(300, rules.gravity) : 2200;
  this.initialSpeedY = typeof rules.initialSpeedY === "number" ? Math.max(0, rules.initialSpeedY) : 220;
  this.horizontalSpeed = typeof rules.horizontalSpeed === "number" ? Math.max(40, rules.horizontalSpeed) : 190;
  this.jarGapAttractAccel = typeof rules.jarGapAttractAccel === "number" ? Math.max(0, rules.jarGapAttractAccel) : 760;
  this.jarGapMaxSpeed = typeof rules.jarGapMaxSpeed === "number" ? Math.max(40, rules.jarGapMaxSpeed) : 260;
  this.maxDropLifeTime = typeof rules.maxDropLifeTime === "number" ? Math.max(1.2, rules.maxDropLifeTime) : 3.2;
  this.stuckDistanceThreshold = typeof rules.stuckDistanceThreshold === "number" ? Math.max(0.5, rules.stuckDistanceThreshold) : 2.5;
  this.stuckTimeThreshold = typeof rules.stuckTimeThreshold === "number" ? Math.max(0.08, rules.stuckTimeThreshold) : 0.32;
  this.bounceDamping = typeof rules.bounceDamping === "number" ? clamp(rules.bounceDamping, 0.45, 0.95) : 0.78;
  var cleanupUpperBound = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 1.5;
  var defaultCleanupY = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 4;
  this.cleanupY = typeof rules.cleanupY === "number"
    ? Math.min(rules.cleanupY, cleanupUpperBound)
    : defaultCleanupY;

  this.jarCount = levelConfig.level && levelConfig.level.jarCount ? levelConfig.level.jarCount : 0;
  this.jarColors = levelConfig.level && Array.isArray(levelConfig.level.jarColors)
    ? levelConfig.level.jarColors.slice()
    : [];

  var jarRules = levelConfig.level && levelConfig.level.jarRules ? levelConfig.level.jarRules : {};
  this.jarRules = {
    rimBounce: typeof jarRules.rimBounce === "number" ? clamp(jarRules.rimBounce, 0.45, 0.95) : 0.72,
    collectZoneScale: typeof jarRules.collectZoneScale === "number" ? clamp(jarRules.collectZoneScale, 0.72, 1.2) : 1,
    sameColorBonus: typeof jarRules.sameColorBonus === "number" ? Math.max(1, jarRules.sameColorBonus) : 1.6
  };
  this.maxRimBounces = typeof jarRules.maxRimBounces === "number" ? Math.max(0, Math.floor(jarRules.maxRimBounces)) : 5;
  this.rimBounceLiftMin = typeof jarRules.rimBounceLiftMin === "number"
    ? Math.max(0, jarRules.rimBounceLiftMin)
    : 55;
  this.rimBounceSpeed = typeof jarRules.rimBounceSpeed === "number"
    ? Math.max(120, jarRules.rimBounceSpeed)
    : (typeof rules.rimBounceSpeed === "number"
      ? Math.max(120, rules.rimBounceSpeed)
      : Math.max(120, Number(BoardLayout.jarRimBounceSpeed) || 260));
  this.rimBounceDecay = typeof jarRules.rimBounceDecay === "number"
    ? clamp(jarRules.rimBounceDecay, 0.55, 0.98)
    : (typeof rules.rimBounceDecay === "number"
      ? clamp(rules.rimBounceDecay, 0.55, 0.98)
      : 0.84);

  this.jarZones = this._buildJarZones();
  this._rebuildDropBounds();
  this._layoutSignature = this._buildLayoutSignature();
  this._dropSerial = 0;
  this._renderSnapshotCache = null;
  this._renderSnapshotDirty = true;
  this.pendingSurplusShotBalls = [];
  this.pendingSurplusShotOrigin = null;
  this.pendingSurplusShotIndex = 0;
  return this;
};

FallingMarbleSystem.prototype._buildLayoutSignature = function () {
  return [
    BoardLayout.boardLeft,
    BoardLayout.boardRight,
    BoardLayout.jarBaseY,
    BoardLayout.jarRenderYOffset,
    BoardLayout.jarWidth,
    BoardLayout.jarHeight,
    this.jarColors.length
  ].join("|");
};

FallingMarbleSystem.prototype._rebuildDropBounds = function () {
  var leftLimit = BoardLayout.boardLeft + BoardLayout.bubbleRadius;
  var rightLimit = BoardLayout.boardRight - BoardLayout.bubbleRadius;
  if (this.jarZones && this.jarZones.length) {
    var jarMinX = this.jarZones.reduce(function (minValue, zone) {
      return Math.min(minValue, zone.x - zone.outerHalfWidth);
    }, Number.POSITIVE_INFINITY);
    var jarMaxX = this.jarZones.reduce(function (maxValue, zone) {
      return Math.max(maxValue, zone.x + zone.outerHalfWidth);
    }, Number.NEGATIVE_INFINITY);

    // Avoid wall bounce before reaching outer jar mouths, especially for side jars.
    leftLimit = Math.min(leftLimit, jarMinX - BoardLayout.bubbleRadius * 0.25);
    rightLimit = Math.max(rightLimit, jarMaxX + BoardLayout.bubbleRadius * 0.25);
  }

  this._dropLeftLimit = leftLimit;
  this._dropRightLimit = rightLimit;

  if (this.jarZones && this.jarZones.length) {
    this._jarAttractTopY = this.jarZones.reduce(function (maxValue, zone) {
      return Math.max(maxValue, zone.mouthY + zone.contactBand * 1.8);
    }, Number.NEGATIVE_INFINITY);
    this._jarAttractBottomY = this.jarZones.reduce(function (minValue, zone) {
      return Math.min(minValue, zone.bottomY - BoardLayout.bubbleRadius * 0.4);
    }, Number.POSITIVE_INFINITY);
  } else {
    this._jarAttractTopY = getJarRenderCenterY();
    this._jarAttractBottomY = getJarRenderCenterY() - BoardLayout.jarHeight;
  }
};

FallingMarbleSystem.prototype._buildJarZones = function () {
  var count = this.jarColors.length || this.jarCount;
  if (!count) {
    return [];
  }

  var jarPositions = BoardLayout.getJarCenterPositions(count);
  var jarHalfWidth = Math.max(1, Number(BoardLayout.jarWidth) || 237) * 0.5;
  var edgeThickness = clamp(this.rimEdgeThickness, 1, jarHalfWidth);
  // 需求：左右边缘碰撞区各 40（从边界向内）。
  var outerHalfWidth = jarHalfWidth;
  var innerHalfWidth = Math.max(0, jarHalfWidth - edgeThickness);
  var jarHeight = Math.max(1, Number(BoardLayout.jarHeight) || 230);
  var jarCenterY = getJarRenderCenterY();
  var mouthY = jarCenterY + jarHeight * 0.24;
  var bottomY = jarCenterY - jarHeight * 0.42;

  var zones = [];
  for (var index = 0; index < count; index += 1) {
    zones.push({
      index: index,
      color: this.jarColors[index] || null,
      x: jarPositions[index] || 0,
      mouthY: mouthY,
      bottomY: bottomY,
      innerHalfWidth: innerHalfWidth,
      outerHalfWidth: outerHalfWidth,
      // Compatibility alias for existing renderer references.
      rimHalfWidth: outerHalfWidth,
      edgeThickness: edgeThickness,
      contactBand: 18,
      rimBounce: this.jarRules.rimBounce,
      sameColorBonus: this.jarRules.sameColorBonus
    });
  }

  return zones;
};

FallingMarbleSystem.prototype.hasActiveDrops = function () {
  return this.activeDrops.length > 0 || this.pendingSurplusShotBalls.length > 0;
};

FallingMarbleSystem.prototype._buildDropFromCell = function (cell, index, grid, startDelay) {
  if (!cell || !grid || typeof grid.getCellPosition !== "function") {
    throw new Error("FallingMarbleSystem._buildDropFromCell requires cell and grid.");
  }

  var start = grid.getCellPosition(cell.row, cell.col);
  var direction = index % 2 === 0 ? -1 : 1;
  var spread = 1 + (index % 4) * 0.18;
  var standardVelocity = {
    x: direction * this.horizontalSpeed * spread,
    y: this.initialSpeedY + index * 35
  };

  return {
    id: (cell.id || (cell.row + "_" + cell.col)) + "_drop_" + (this._dropSerial += 1),
    sourceId: cell.id,
    color: cell.color,
    entityCategory: cell.entityCategory || "normal_ball",
    entityType: cell.entityType || null,
    splitColor: typeof cell.splitColor === "string" ? cell.splitColor : null,
    innerColor: cell.innerColor || null,
    iceSnowballAlreadyCollected: cell.iceSnowballAlreadyCollected === true,
    row: cell.row,
    col: cell.col,
    position: { x: start.x, y: start.y },
    velocity: resolveInitialDropVelocity(cell, standardVelocity),
    remainingBounces: this.maxBounces,
    rotation: 0,
    rotationSpeed: direction * (180 + index * 25),
    jarCooldown: 0,
    startDelay: startDelay,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: start.x,
    lastStuckY: start.y,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true
  };
};

FallingMarbleSystem.prototype._activateDropBatch = function (drops) {
  if (!drops || !drops.length) {
    return [];
  }

  Array.prototype.push.apply(this.activeDrops, drops);
  this.totalFallen += drops.length;
  this._renderSnapshotDirty = true;
  return drops;
};

FallingMarbleSystem.prototype.hasPendingSurplusShots = function () {
  return this.pendingSurplusShotBalls.length > 0;
};

FallingMarbleSystem.prototype._createSurplusShotDrop = function (ball, spawnIndex, origin) {
  if (!ball || typeof ball !== "object") {
    throw new Error("Surplus shot ball must be object at index " + spawnIndex + ".");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("Surplus shot drop requires shooter origin.");
  }

  var lateralSign = spawnIndex % 2 === 0 ? -1 : 1;
  var lateralSpread = 0.95 + Math.random() * 1.05;
  var upwardSpeed = 820 + Math.random() * 560;
  var horizontalSpeed = lateralSign * this.horizontalSpeed * lateralSpread * (0.85 + Math.random() * 0.75);
  var spawnOffsetX = lateralSign * BoardLayout.bubbleRadius * (0.55 + Math.random() * 0.75);

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
      x: origin.x + spawnOffsetX,
      y: origin.y + BoardLayout.bubbleRadius * 0.15
    },
    velocity: {
      x: horizontalSpeed,
      y: upwardSpeed
    },
    remainingBounces: this.maxBounces,
    rotation: 0,
    rotationSpeed: lateralSign * (200 + Math.random() * 160),
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
    dropKind: "surplus_shot"
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

FallingMarbleSystem.prototype._processPendingSurplusShots = function () {
  if (!this.pendingSurplusShotBalls.length) {
    return;
  }
  if (!this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }

  var batchSize = Math.min(SURPLUS_SHOTS_PER_FRAME, this.pendingSurplusShotBalls.length);
  if (!batchSize) {
    return;
  }

  var batch = this.pendingSurplusShotBalls.slice(0, batchSize);
  this.pendingSurplusShotBalls = this.pendingSurplusShotBalls.slice(batchSize);
  this.lastDrops = this._spawnSurplusShotBatch(batch, this.pendingSurplusShotOrigin, this.pendingSurplusShotIndex);
  this.pendingSurplusShotIndex += batch.length;

  if (!this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotOrigin = null;
    this.pendingSurplusShotIndex = 0;
  }
};

FallingMarbleSystem.prototype.registerDrops = function (cells, grid, options) {
  this.lastDrops = [];

  if (!cells || !cells.length || !grid || this.maxDynamicMarbles <= 0) {
    return this.lastDrops;
  }

  var startDelay = 0;
  if (options && Object.prototype.hasOwnProperty.call(options, "startDelay")) {
    if (typeof options.startDelay !== "number" || !Number.isFinite(options.startDelay) || options.startDelay < 0) {
      throw new Error("FallingMarbleSystem.registerDrops startDelay must be a non-negative number.");
    }
    startDelay = options.startDelay;
  }

  this.lastDrops = cells.map(function (cell, index) {
    return this._buildDropFromCell(cell, index, grid, startDelay);
  }, this);

  this._activateDropBatch(this.lastDrops);
  return this.lastDrops;
};

FallingMarbleSystem.prototype.registerSurplusShotsFromOrigin = function (balls, origin) {
  if (!balls || !balls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires at least one ball.");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires shooter origin.");
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires positive maxDynamicMarbles.");
  }
  if (this.pendingSurplusShotBalls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin cannot run while surplus shots are pending.");
  }

  this.pendingSurplusShotBalls = balls.slice();
  this.pendingSurplusShotOrigin = {
    x: origin.x,
    y: origin.y
  };
  this.pendingSurplusShotIndex = 0;
  this._processPendingSurplusShots();
  return this.lastDrops;
};

FallingMarbleSystem.prototype._getJarZoneByIndex = function (jarIndex) {
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  if (jarIndex >= 0 && jarIndex < this.jarZones.length && this.jarZones[jarIndex].index === jarIndex) {
    return this.jarZones[jarIndex];
  }

  for (var i = 0; i < this.jarZones.length; i += 1) {
    if (this.jarZones[i].index === jarIndex) {
      return this.jarZones[i];
    }
  }

  return null;
};

FallingMarbleSystem.prototype._findNearestJarZone = function (x) {
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  var nearest = null;
  var minDx = Number.POSITIVE_INFINITY;
  for (var i = 0; i < this.jarZones.length; i += 1) {
    var zone = this.jarZones[i];
    var dx = Math.abs((x || 0) - zone.x);
    if (dx < minDx) {
      minDx = dx;
      nearest = zone;
    }
  }
  return nearest;
};

FallingMarbleSystem.prototype._consumeDropInteraction = function (result, interaction) {
  if (!interaction) {
    return;
  }

  if (interaction.bounced) {
    result.bounced += 1;
  }

  if (interaction.collected) {
    result.collected.push(interaction.collected);
  }

  if (interaction.missed) {
    result.missed.push(interaction.missed);
  }
};

FallingMarbleSystem.prototype._forceDropResolution = function (drop, collectPreferred) {
  var nearestZone = this._findNearestJarZone(drop.position ? drop.position.x : 0);
  if (collectPreferred && nearestZone) {
    drop.inJar = true;
    drop.jarIndex = nearestZone.index;
    drop.jarColor = nearestZone.color || null;
    drop.position.x = nearestZone.x;
    drop.active = false;
    return {
      collected: this._createCollectedEvent(drop, nearestZone)
    };
  }

  drop.active = false;
  return {
    missed: this._createMissedEvent(drop)
  };
};

FallingMarbleSystem.prototype._applyGapAttraction = function (drop, dt) {
  if (drop.inJar || !this.jarZones || this.jarZones.length < 2) {
    return;
  }

  if (drop.position.y > this._jarAttractTopY || drop.position.y < this._jarAttractBottomY) {
    return;
  }

  var nearestZone = this._findNearestJarZone(drop.position.x);
  if (!nearestZone) {
    return;
  }

  var dx = nearestZone.x - drop.position.x;
  if (Math.abs(dx) < 0.5) {
    return;
  }

  var direction = dx > 0 ? 1 : -1;
  drop.velocity.x += direction * this.jarGapAttractAccel * dt;
  drop.velocity.x = clamp(drop.velocity.x, -this.jarGapMaxSpeed, this.jarGapMaxSpeed);
};

FallingMarbleSystem.prototype._resolveStuckDropIfNeeded = function (drop, dt) {
  if (drop.inJar) {
    drop.stuckTimer = 0;
    drop.lastStuckX = drop.position.x;
    drop.lastStuckY = drop.position.y;
    return null;
  }

  var dx = drop.position.x - (typeof drop.lastStuckX === "number" ? drop.lastStuckX : drop.position.x);
  var dy = drop.position.y - (typeof drop.lastStuckY === "number" ? drop.lastStuckY : drop.position.y);
  var movedSq = dx * dx + dy * dy;
  var distanceThreshold = this.stuckDistanceThreshold * this.stuckDistanceThreshold;
  if (movedSq <= distanceThreshold) {
    drop.stuckTimer = (drop.stuckTimer || 0) + dt;
  } else {
    drop.stuckTimer = 0;
    drop.lastStuckX = drop.position.x;
    drop.lastStuckY = drop.position.y;
  }

  if ((drop.stuckTimer || 0) < this.stuckTimeThreshold) {
    return null;
  }

  return this._forceDropResolution(drop, true);
};

FallingMarbleSystem.prototype._createCollectedEvent = function (drop, zone) {
  var sameColor = !!(zone && zone.color && drop.color === zone.color);

  return {
    id: drop.id,
    sourceId: drop.sourceId,
    color: drop.color,
    entityCategory: drop.entityCategory || "normal_ball",
    entityType: drop.entityType || null,
    splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
    innerColor: drop.innerColor || null,
    iceSnowballAlreadyCollected: drop.iceSnowballAlreadyCollected === true,
    row: drop.row,
    col: drop.col,
    jarIndex: zone ? zone.index : -1,
    jarColor: zone ? zone.color : null,
    sameColor: sameColor,
    bonusMultiplier: sameColor ? zone.sameColorBonus : 1
  };
};

FallingMarbleSystem.prototype._createMissedEvent = function (drop) {
  return {
    id: drop.id,
    sourceId: drop.sourceId,
    color: drop.color,
    entityCategory: drop.entityCategory || "normal_ball",
    entityType: drop.entityType || null,
    splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
    innerColor: drop.innerColor || null,
    row: drop.row,
    col: drop.col,
    reason: "fell_outside_jar"
  };
};

FallingMarbleSystem.prototype._applyRimArcBounce = function (drop, zone, side, edgeType, bottomPoint) {
  var edgeX = edgeType === "outer"
    ? zone.x + side * zone.outerHalfWidth
    : zone.x + side * zone.innerHalfWidth;
  var edgeCenter = {
    x: edgeX,
    y: zone.mouthY
  };
  var desiredXSign = edgeType === "outer" ? side : -side;

  var normal = normalize({
    x: bottomPoint.x - edgeCenter.x,
    y: bottomPoint.y - edgeCenter.y
  });

  // Keep the reflected direction semantically correct:
  // outer edge => bounce away from jar, inner edge => bounce toward jar center.
  if (Math.abs(normal.x) < 0.18 || normal.x * desiredXSign < 0) {
    normal = normalize({
      x: desiredXSign,
      y: 0.52
    });
  }

  var reflected = reflectVector(drop.velocity, normal);
  var reflectedSideSpeed = Math.abs(reflected.x) * zone.rimBounce;
  var reflectedUpSpeed = Math.abs(reflected.y) * zone.rimBounce;
  var minSideSpeed = this.horizontalSpeed * 0.22;
  var sideSpeed = Math.max(minSideSpeed, reflectedSideSpeed);
  var upSpeed = Math.max(this.rimBounceLiftMin, reflectedUpSpeed);
  var currentSpeed = Math.sqrt(sideSpeed * sideSpeed + upSpeed * upSpeed) || 1;
  var bounceIndex = Math.max(0, Math.floor(drop.rimBounceCount || 0));
  var decayByCount = this.rimBounceSpeed * Math.pow(this.rimBounceDecay, bounceIndex);
  var previousBounceSpeed = Number(drop.lastRimBounceSpeed) || 0;
  var decayByPrevious = previousBounceSpeed > 0
    ? previousBounceSpeed * this.rimBounceDecay
    : decayByCount;
  // 反弹速度只允许衰减：受“反射速度 / 次数衰减 / 上次衰减”三重上限约束。
  var targetBounceSpeed = Math.min(currentSpeed, decayByCount, decayByPrevious);
  targetBounceSpeed = Math.max(this.rimBounceLiftMin + 1, targetBounceSpeed);
  var speedScale = targetBounceSpeed / currentSpeed;
  var finalSideSpeed = sideSpeed * speedScale;
  var finalUpSpeed = upSpeed * speedScale;
  if (finalUpSpeed < this.rimBounceLiftMin) {
    finalUpSpeed = this.rimBounceLiftMin;
    if (targetBounceSpeed > finalUpSpeed) {
      finalSideSpeed = Math.sqrt(Math.max(0, targetBounceSpeed * targetBounceSpeed - finalUpSpeed * finalUpSpeed));
    } else {
      finalSideSpeed = 0;
    }
  }
  // Always preserve the semantic lateral direction:
  // outer edge -> outward, inner edge -> toward jar center.
  drop.velocity.x = desiredXSign * finalSideSpeed;
  drop.velocity.y = finalUpSpeed;
  drop.lastRimBounceSpeed = Math.sqrt(
    drop.velocity.x * drop.velocity.x + drop.velocity.y * drop.velocity.y
  );
  drop.rimBounceCount = (drop.rimBounceCount || 0) + 1;

  // Move the center slightly above the rim collision band to avoid sticky repeated hits.
  drop.position.y = zone.mouthY + zone.contactBand + BoardLayout.bubbleRadius * 0.2;
  drop.jarCooldown = 0.09;
};

FallingMarbleSystem.prototype._processJarInteraction = function (drop) {
  if (!this.jarZones.length) {
    return null;
  }

  if (drop.inJar) {
    var inJarZone = this._getJarZoneByIndex(drop.jarIndex);
    if (!inJarZone) {
      drop.active = false;
      return {
        missed: this._createMissedEvent(drop)
      };
    }

    drop.jarColor = inJarZone.color || drop.jarColor || null;
    // Keep marbles sinking toward the center once they pass the mouth.
    drop.position.x += (inJarZone.x - drop.position.x) * 0.2;
    drop.velocity.x *= 0.75;
    drop.velocity.y = Math.min(drop.velocity.y, -140);
    drop.rotationSpeed *= 0.9;

    var settleY = inJarZone.bottomY + BoardLayout.bubbleRadius * 0.35;
    if (drop.position.y <= settleY) {
      drop.active = false;
      return {
        collected: this._createCollectedEvent(drop, inJarZone)
      };
    }

    return {
      inJar: true
    };
  }

  var bottomPoint = {
    x: drop.position.x,
    y: drop.position.y - BoardLayout.bubbleRadius
  };

  for (var i = 0; i < this.jarZones.length; i += 1) {
    var zone = this.jarZones[i];
    var dx = bottomPoint.x - zone.x;
    var absDx = Math.abs(dx);

    if (
      absDx <= zone.innerHalfWidth &&
      bottomPoint.y <= zone.mouthY + zone.contactBand &&
      drop.position.y >= zone.bottomY &&
      drop.velocity.y <= 0
    ) {
      drop.inJar = true;
      drop.jarIndex = zone.index;
      drop.jarColor = zone.color || null;
      drop.velocity.x *= 0.35;
      drop.velocity.y = Math.min(drop.velocity.y, -120);
      return {
        inJar: true
      };
    }

    if (
      drop.velocity.y < -45 &&
      bottomPoint.y <= zone.mouthY + zone.contactBand &&
      bottomPoint.y >= zone.mouthY - zone.edgeThickness * 1.4 &&
      absDx <= zone.outerHalfWidth &&
      absDx >= zone.innerHalfWidth
    ) {
      var side = dx >= 0 ? 1 : -1;
      var outerEdgeThreshold = zone.innerHalfWidth + zone.edgeThickness * 0.5;
      var edgeType = absDx >= outerEdgeThreshold ? "outer" : "inner";
      if ((drop.rimBounceCount || 0) >= this.maxRimBounces) {
        drop.inJar = true;
        drop.jarIndex = zone.index;
        drop.jarColor = zone.color || null;
        drop.velocity.x *= 0.2;
        drop.velocity.y = Math.min(drop.velocity.y, -150);
        return {
          inJar: true
        };
      }

      this._applyRimArcBounce(drop, zone, side, edgeType, bottomPoint);
      return {
        bounced: true,
        edgeType: edgeType
      };
    }
  }

  return null;
};

FallingMarbleSystem.prototype.update = function (dt) {
  var result = createEmptyUpdateResult();

  this._processPendingSurplusShots();

  var layoutSignature = this._buildLayoutSignature();
  if (layoutSignature !== this._layoutSignature) {
    this.jarZones = this._buildJarZones();
    this._rebuildDropBounds();
    this._layoutSignature = layoutSignature;
    this._renderSnapshotDirty = true;
  }

  if (!dt || dt <= 0 || !this.activeDrops.length) {
    this.lastCollectedDrops = [];
    this.lastMissedDrops = [];
    this.lastBounceCount = 0;
    return result;
  }

  var leftLimit = this._dropLeftLimit;
  var rightLimit = this._dropRightLimit;

  var drops = this.activeDrops;
  var writeIndex = 0;
  for (var readIndex = 0; readIndex < drops.length; readIndex += 1) {
    var drop = drops[readIndex];
    if (!drop.active) {
      continue;
    }

    result.updated = true;
    if (typeof drop.startDelay === "number" && drop.startDelay > 0) {
      drop.startDelay = Math.max(0, drop.startDelay - dt);
      drops[writeIndex] = drop;
      writeIndex += 1;
      this._renderSnapshotDirty = true;
      continue;
    }

    drop.lifeTime = (drop.lifeTime || 0) + dt;
    if (drop.lifeTime >= this.maxDropLifeTime) {
      this._consumeDropInteraction(result, this._forceDropResolution(drop, true));
      continue;
    }

    drop.jarCooldown = Math.max(0, (drop.jarCooldown || 0) - dt);
    this._applyGapAttraction(drop, dt);
    drop.velocity.y -= this.gravity * dt;
    drop.position.x += drop.velocity.x * dt;
    drop.position.y += drop.velocity.y * dt;
    drop.rotation += drop.rotationSpeed * dt;

    if (!drop.inJar && (drop.position.x < leftLimit || drop.position.x > rightLimit)) {
      if (drop.remainingBounces > 0) {
        drop.position.x = clamp(drop.position.x, leftLimit, rightLimit);
        drop.velocity.x = -drop.velocity.x * this.bounceDamping;
        drop.velocity.y = Math.max(drop.velocity.y, -420) + 140;
        drop.remainingBounces -= 1;
      } else {
        drop.position.x = clamp(drop.position.x, leftLimit, rightLimit);
      }
    }

    var jarInteraction = this._processJarInteraction(drop);
    if (jarInteraction) {
      this._consumeDropInteraction(result, jarInteraction);

      if (drop.active) {
        drops[writeIndex] = drop;
        writeIndex += 1;
      }
      continue;
    }

    this._consumeDropInteraction(result, this._resolveStuckDropIfNeeded(drop, dt));
    if (!drop.active) {
      continue;
    }

    if (drop.position.y <= this.cleanupY) {
      drop.active = false;
      result.missed.push(this._createMissedEvent(drop));
    }
    if (drop.active) {
      drops[writeIndex] = drop;
      writeIndex += 1;
    }
  }
  if (writeIndex !== drops.length) {
    drops.length = writeIndex;
  }

  this.lastCollectedDrops = result.collected.slice();
  this.lastMissedDrops = result.missed.slice();
  this.lastBounceCount = result.bounced;
  this._renderSnapshotDirty = true;

  return result;
};

FallingMarbleSystem.prototype.snapshotForRender = function () {
  if (!this._renderSnapshotCache) {
    this._renderSnapshotCache = {
      activeDrops: this.activeDrops,
      activeDropCount: this.activeDrops.length,
      jarZones: this.jarZones
    };
    this._renderSnapshotDirty = false;
    return this._renderSnapshotCache;
  }

  if (this._renderSnapshotDirty) {
    this._renderSnapshotCache.activeDrops = this.activeDrops;
    this._renderSnapshotCache.activeDropCount = this.activeDrops.length;
    this._renderSnapshotCache.jarZones = this.jarZones;
    this._renderSnapshotDirty = false;
  }
  return this._renderSnapshotCache;
};

FallingMarbleSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.maxDynamicMarbles = this.maxDynamicMarbles;
  snapshot.maxBounces = this.maxBounces;
  snapshot.totalFallen = this.totalFallen;
  snapshot.lastDrops = clone(this.lastDrops);
  snapshot.activeDrops = clone(this.activeDrops);
  snapshot.activeDropCount = this.activeDrops.length;
  snapshot.lastCollectedDrops = clone(this.lastCollectedDrops);
  snapshot.lastMissedDrops = clone(this.lastMissedDrops);
  snapshot.lastBounceCount = this.lastBounceCount;
  snapshot.jarZones = clone(this.jarZones);
  return snapshot;
};

module.exports = FallingMarbleSystem;
