"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var FallingRulesDefaults = require("../config/FallingRulesDefaults");

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

function rotateVector(vector, degrees) {
  var radians = degrees * Math.PI / 180;
  var cosine = Math.cos(radians);
  var sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine
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

var DROP_LAUNCH_ANGLE_MIN_DEG = 15;
var DROP_LAUNCH_ANGLE_MAX_DEG = 165;
var DROP_LAUNCH_VERTICAL_ANGLE_DEG = 90;
var DROP_LAUNCH_VERTICAL_EXCLUSION_DEG = 15;

function hashDropLaunchUnit(seedMaterial) {
  if (typeof seedMaterial !== "string" || !seedMaterial) {
    throw new Error("Drop launch hash requires non-empty seed material.");
  }
  var hash = 2166136261;
  for (var index = 0; index < seedMaterial.length; index += 1) {
    hash ^= seedMaterial.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildDownwardLaunchVelocity(speed, seedMaterial) {
  if (typeof speed !== "number" || !isFinite(speed) || speed <= 0) {
    throw new Error("Drop launch speed must be a positive finite number.");
  }
  var unit = hashDropLaunchUnit(seedMaterial);
  var angleDeg = resolveDownwardLaunchAngleDeg(unit);
  var angleRad = angleDeg * Math.PI / 180;
  return {
    x: Math.cos(angleRad) * speed,
    y: -Math.sin(angleRad) * speed
  };
}

function resolveDownwardLaunchAngleDeg(unit) {
  if (typeof unit !== "number" || !isFinite(unit) || unit < 0 || unit > 1) {
    throw new Error("Drop launch angle unit must be a finite number between 0 and 1.");
  }
  var leftMax = DROP_LAUNCH_VERTICAL_ANGLE_DEG - DROP_LAUNCH_VERTICAL_EXCLUSION_DEG;
  var rightMin = DROP_LAUNCH_VERTICAL_ANGLE_DEG + DROP_LAUNCH_VERTICAL_EXCLUSION_DEG;
  if (unit < 0.5) {
    return DROP_LAUNCH_ANGLE_MIN_DEG + unit * 2 * (leftMax - DROP_LAUNCH_ANGLE_MIN_DEG);
  }
  return rightMin + (unit - 0.5) * 2 * (DROP_LAUNCH_ANGLE_MAX_DEG - rightMin);
}

function buildDropLaunchSeed(sourceId, launchIndex, dropSerial) {
  if (typeof sourceId !== "string" && typeof sourceId !== "number") {
    throw new Error("Drop launch seed requires sourceId.");
  }
  if (!Number.isInteger(launchIndex) || launchIndex < 0) {
    throw new Error("Drop launch seed requires non-negative integer launchIndex.");
  }
  if (!Number.isInteger(dropSerial) || dropSerial <= 0) {
    throw new Error("Drop launch seed requires positive integer dropSerial.");
  }
  return String(sourceId) + ":" + launchIndex + ":" + dropSerial;
}

function resolveDownwardLaunchSpeed(fallingSystem, index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Drop launch speed requires non-negative integer index.");
  }
  return fallingSystem.initialSpeedY + (index % 5) * 36;
}

function resolveDropKind(options) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "dropKind")) {
    return null;
  }
  if (options.dropKind !== "victory_board_drop") {
    throw new Error("FallingMarbleSystem.registerDrops unsupported dropKind: " + options.dropKind);
  }
  return options.dropKind;
}

function createEmptyUpdateResult() {
  return {
    updated: false,
    surplusUpdated: false,
    collected: [],
    cleanupScored: [],
    missed: [],
    bounced: 0,
    bounceEvents: [],
    fairyHits: [],
    splits: []
  };
}

var SURPLUS_SHOT_INTERVAL_SEC = 0.2;
var SURPLUS_TURRET_ROTATE_INTERVAL_SEC = 0.2;
var DEFERRED_DROP_STAGGER_SEC = 0.05;
var SURPLUS_TURRET_ANGLE_MIN_DEG = 60;
var SURPLUS_TURRET_ANGLE_MAX_DEG = 120;
var SURPLUS_TURRET_ANGLE_STEP_DEG = 15;
var SURPLUS_TURRET_ANGLE_LADDER = [];
for (
  var surplusAngleDeg = SURPLUS_TURRET_ANGLE_MIN_DEG;
  surplusAngleDeg <= SURPLUS_TURRET_ANGLE_MAX_DEG;
  surplusAngleDeg += SURPLUS_TURRET_ANGLE_STEP_DEG
) {
  if (surplusAngleDeg !== DROP_LAUNCH_VERTICAL_ANGLE_DEG) {
    SURPLUS_TURRET_ANGLE_LADDER.push(surplusAngleDeg);
  }
}

function resolveLaunchDeviationFromTurretAngleDeg(turretAngleDeg) {
  if (typeof turretAngleDeg !== "number" || !isFinite(turretAngleDeg)) {
    throw new Error("Surplus turret angle must be finite.");
  }
  if (
    turretAngleDeg < SURPLUS_TURRET_ANGLE_MIN_DEG ||
    turretAngleDeg > SURPLUS_TURRET_ANGLE_MAX_DEG ||
    turretAngleDeg % SURPLUS_TURRET_ANGLE_STEP_DEG !== 0 ||
    turretAngleDeg === DROP_LAUNCH_VERTICAL_ANGLE_DEG
  ) {
    throw new Error("Surplus turret angle must be a non-vertical 15° step between 60° and 120°.");
  }
  return 90 - turretAngleDeg;
}

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
  this.gravity = Math.max(300, Number(BoardLayout.dropGravity));
  this.initialSpeedY = Math.max(0, Number(BoardLayout.dropInitialSpeedY));
  this.horizontalSpeed = FallingRulesDefaults.horizontalSpeed;
  this.bounceDamping = FallingRulesDefaults.bounceDamping;
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
  this._spawnedDropsBuffer = [];
  this._renderSnapshotCache = null;
  this._renderSnapshotDirty = true;
  this._dropLeftLimit = BoardLayout.boardLeft;
  this._dropRightLimit = BoardLayout.boardRight;
  this.maxDropLifeTime = FallingRulesDefaults.maxDropLifeTime;
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
  this.pendingSurplusShotTimer = 0;
  this.surplusTurretAngleDeg = 90;
  this.surplusTurretRotateTimer = 0;
  this.surplusAngleCursor = 0;
  this.surplusAngleDirection = 1;
  this.surplusVolleySeed = 0;
  this.fairyAssistSystem = null;
  this.deferredDrops = [];
  this.pendingEliminationPresentationRelease = false;
  this.lastUpdateDt = 0;
}

FallingMarbleSystem.prototype = Object.create(BaseSystem.prototype);
FallingMarbleSystem.prototype.constructor = FallingMarbleSystem;

FallingMarbleSystem.prototype.attachFairyAssistSystem = function (fairyAssistSystem) {
  if (!fairyAssistSystem || typeof fairyAssistSystem.resolveFirstCollision !== "function") {
    throw new Error("FallingMarbleSystem.attachFairyAssistSystem requires FairyAssistSystem.");
  }
  this.fairyAssistSystem = fairyAssistSystem;
  return this;
};

FallingMarbleSystem.prototype.configureLevel = function (levelConfig) {
  if (!this.fairyAssistSystem) {
    throw new Error("FallingMarbleSystem.configureLevel requires attached FairyAssistSystem.");
  }
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  var rules = (levelConfig.sharedDefaults && levelConfig.sharedDefaults.fallingRules) || {};

  if (
    !Number.isInteger(FallingRulesDefaults.maxDynamicMarbles) ||
    FallingRulesDefaults.maxDynamicMarbles <= 0
  ) {
    throw new Error("FallingRulesDefaults.maxDynamicMarbles must be a positive integer.");
  }
  this.maxDynamicMarbles = FallingRulesDefaults.maxDynamicMarbles;
  this.maxBounces = rules.maxBounces || 0;
  this.totalFallen = 0;
  this._spawnedDropsBuffer.length = 0;
  this.lastDrops = [];
  this.activeDrops = [];
  this.lastCollectedDrops = [];
  this.lastMissedDrops = [];
  this.lastBounceCount = 0;
  this.gravity = Math.max(300, Number(BoardLayout.dropGravity));
  this.initialSpeedY = Math.max(0, Number(BoardLayout.dropInitialSpeedY));
  this.horizontalSpeed = typeof rules.horizontalSpeed === "number" ? Math.max(40, rules.horizontalSpeed) : FallingRulesDefaults.horizontalSpeed;
  this.jarGapAttractAccel = typeof rules.jarGapAttractAccel === "number" ? Math.max(0, rules.jarGapAttractAccel) : 760;
  this.jarGapMaxSpeed = typeof rules.jarGapMaxSpeed === "number" ? Math.max(40, rules.jarGapMaxSpeed) : 260;
  this.maxDropLifeTime = typeof rules.maxDropLifeTime === "number" ? Math.max(1.2, rules.maxDropLifeTime) : FallingRulesDefaults.maxDropLifeTime;
  this.stuckDistanceThreshold = typeof rules.stuckDistanceThreshold === "number" ? Math.max(0.5, rules.stuckDistanceThreshold) : 2.5;
  this.stuckTimeThreshold = typeof rules.stuckTimeThreshold === "number" ? Math.max(0.08, rules.stuckTimeThreshold) : 0.32;
  this.bounceDamping = typeof rules.bounceDamping === "number" ? clamp(rules.bounceDamping, 0.45, 0.95) : FallingRulesDefaults.bounceDamping;
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
  this.pendingSurplusShotTimer = 0;
  this.surplusTurretAngleDeg = 90;
  this.surplusTurretRotateTimer = 0;
  this.surplusAngleCursor = 0;
  this.surplusAngleDirection = 1;
  this.surplusVolleySeed = 0;
  this.deferredDrops = [];
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
    BoardLayout.jarMouthWidth,
    BoardLayout.jarLayoutWidth,
    this.jarColors.length
  ].join("|");
};

FallingMarbleSystem.prototype._rebuildDropBounds = function () {
  this._dropLeftLimit = BoardLayout.boardLeft;
  this._dropRightLimit = BoardLayout.boardRight;

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

  var jarLayout = BoardLayout.getJarLayout(count);
  var jarPositions = jarLayout.positions;
  var mouthHalfWidth = jarLayout.mouthWidth * 0.5;
  var edgeThickness = clamp(this.rimEdgeThickness * jarLayout.scale, 1, mouthHalfWidth);
  // 需求：左右边缘碰撞区各 40（从边界向内）。
  var outerHalfWidth = mouthHalfWidth;
  var innerHalfWidth = Math.max(0, mouthHalfWidth - edgeThickness);
  var collectHalfWidth = innerHalfWidth - BoardLayout.bubbleRadius;
  if (!isFinite(collectHalfWidth) || collectHalfWidth <= 0) {
    throw new Error("Jar mouth must be wide enough to fully contain one falling ball.");
  }
  var jarHeight = jarLayout.renderHeight;
  var baseJarCenterY = getJarRenderCenterY();

  var zones = [];
  for (var index = 0; index < count; index += 1) {
    var jarCenterY = baseJarCenterY + BoardLayout.getJarRenderYOffset(index, count);
    var mouthY = jarCenterY + jarHeight * 0.24;
    var bottomY = jarCenterY - jarHeight * 0.42;
    zones.push({
      index: index,
      color: this.jarColors[index] || null,
      x: jarPositions[index] || 0,
      mouthY: mouthY,
      bottomY: bottomY,
      collectHalfWidth: collectHalfWidth,
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

  for (var zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
    var previousZone = zoneIndex > 0 ? zones[zoneIndex - 1] : null;
    var nextZone = zoneIndex + 1 < zones.length ? zones[zoneIndex + 1] : null;
    var collisionLeft = previousZone
      ? (previousZone.x + zones[zoneIndex].x) * 0.5
      : BoardLayout.boardLeft;
    var collisionRight = nextZone
      ? (zones[zoneIndex].x + nextZone.x) * 0.5
      : BoardLayout.boardRight;
    if (!isFinite(collisionLeft) || !isFinite(collisionRight) || collisionLeft >= collisionRight) {
      throw new Error("Jar collision partition must have positive finite width at index " + zoneIndex + ".");
    }
    zones[zoneIndex].collisionLeft = collisionLeft;
    zones[zoneIndex].collisionRight = collisionRight;
  }

  return zones;
};

FallingMarbleSystem.prototype.hasActiveDrops = function () {
  return (
    this.activeDrops.length > 0 ||
    this.deferredDrops.length > 0 ||
    this.pendingSurplusShotBalls.length > 0
  );
};

FallingMarbleSystem.prototype._countActiveDrops = function (drops) {
  var source = drops || this.activeDrops;
  var count = 0;
  for (var index = 0; index < source.length; index += 1) {
    var drop = source[index];
    if (drop.active && drop.inJar !== true) {
      count += 1;
    }
  }
  return count;
};

FallingMarbleSystem.prototype._applyDropLaunchVelocity = function (drop, launchIndex) {
  if (!drop) {
    throw new Error("Drop launch velocity requires drop.");
  }
  if (typeof drop.sourceId !== "string" && typeof drop.sourceId !== "number") {
    throw new Error("Drop launch velocity requires sourceId.");
  }
  if (!Number.isInteger(launchIndex) || launchIndex < 0) {
    throw new Error("Drop launch velocity requires non-negative integer launchIndex.");
  }
  if (!Number.isInteger(drop.launchDropSerial) || drop.launchDropSerial <= 0) {
    throw new Error("Drop launch velocity requires positive launchDropSerial.");
  }

  var launchSpeed = resolveDownwardLaunchSpeed(this, launchIndex);
  var launchSeed = buildDropLaunchSeed(drop.sourceId, launchIndex, drop.launchDropSerial);
  var launchVelocity = buildDownwardLaunchVelocity(launchSpeed, launchSeed);
  drop.velocity = {
    x: launchVelocity.x,
    y: launchVelocity.y
  };
  drop.launchIndex = launchIndex;
  return drop;
};

FallingMarbleSystem.prototype._advanceDropMotion = function (drop, dt) {
  if (!drop || drop.active !== true) {
    throw new Error("Drop motion advance requires active drop.");
  }
  if (typeof dt !== "number" || !Number.isFinite(dt) || dt < 0) {
    throw new Error("Drop motion advance requires non-negative finite dt.");
  }
  if (dt <= 0) {
    return;
  }
  drop.jarCooldown = Math.max(0, (drop.jarCooldown || 0) - dt);
  this._applyGapAttraction(drop, dt);
  drop.velocity.y -= this.gravity * dt;
  drop.position.x += drop.velocity.x * dt;
  drop.position.y += drop.velocity.y * dt;
  drop.rotation += drop.rotationSpeed * dt;
  drop.lifeTime = (drop.lifeTime || 0) + dt;
  this._clampDropToSideBounds(drop);
};

FallingMarbleSystem.prototype._clampDropToSideBounds = function (drop) {
  if (!drop || !drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-bound clamp requires finite position.x.");
  }
  var clampedX = clamp(drop.position.x, this._dropLeftLimit, this._dropRightLimit);
  if (clampedX === drop.position.x) {
    return false;
  }
  drop.position.x = clampedX;
  return true;
};

FallingMarbleSystem.prototype._isDropPressingSideBounds = function (drop) {
  if (!drop || !drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-bound contact requires finite position.x.");
  }
  if (!drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Falling drop side-bound contact requires finite velocity.x.");
  }

  var epsilon = 0.001;
  return (
    (drop.position.x <= this._dropLeftLimit + epsilon && drop.velocity.x <= 0) ||
    (drop.position.x >= this._dropRightLimit - epsilon && drop.velocity.x >= 0)
  );
};

FallingMarbleSystem.prototype._applySideWallEscape = function (drop, allowLift) {
  if (!drop || !drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Falling drop side-wall escape requires finite velocity.x.");
  }
  if (!drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-wall escape requires finite position.x.");
  }

  var escapeDirection = drop.position.x <= this._dropLeftLimit ? 1 : -1;
  var minEscapeSpeed = Math.max(40, this.horizontalSpeed * 0.45);
  var reboundSpeed = Math.max(Math.abs(drop.velocity.x) * this.bounceDamping, minEscapeSpeed);
  drop.velocity.x = escapeDirection * reboundSpeed;

  if (allowLift === true && drop.remainingBounces > 0) {
    drop.velocity.y = Math.max(drop.velocity.y, -420) + 140;
    drop.remainingBounces -= 1;
  }
};

FallingMarbleSystem.prototype.requestEliminationPresentationDropRelease = function () {
  this.pendingEliminationPresentationRelease = true;
};

FallingMarbleSystem.prototype.processPendingEliminationPresentationRelease = function (dt) {
  if (this.pendingEliminationPresentationRelease !== true) {
    return false;
  }
  this.pendingEliminationPresentationRelease = false;
  this.releaseEliminationPresentationDropHold(dt);
  return true;
};

FallingMarbleSystem.prototype._prepareDeferredDropForActivation = function (drop, activationIndex) {
  if (!drop || drop.active !== true) {
    throw new Error("Deferred drop activation requires active drop.");
  }
  if (!drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Deferred drop activation requires finite position.x.");
  }
  if (typeof drop.position.y !== "number" || !isFinite(drop.position.y)) {
    throw new Error("Deferred drop activation requires finite position.y.");
  }
  if (!drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Deferred drop activation requires finite velocity.x.");
  }
  if (typeof drop.velocity.y !== "number" || !isFinite(drop.velocity.y)) {
    throw new Error("Deferred drop activation requires finite velocity.y.");
  }
  if (drop.dropKind === "surplus_shot") {
    throw new Error("Deferred drop queue cannot contain surplus_shot drops.");
  }
  if (!Number.isInteger(activationIndex) || activationIndex < 0) {
    throw new Error("Deferred drop activation requires non-negative integer activationIndex.");
  }
  if (!Number.isInteger(drop.launchIndex) || drop.launchIndex < 0) {
    throw new Error("Deferred drop activation requires non-negative integer launchIndex.");
  }

  this._applyDropLaunchVelocity(drop, drop.launchIndex);

  if (activationIndex > 0) {
    var existingDelay = typeof drop.startDelay === "number" && isFinite(drop.startDelay) && drop.startDelay > 0
      ? drop.startDelay
      : 0;
    drop.startDelay = existingDelay + activationIndex * DEFERRED_DROP_STAGGER_SEC;
  }

  drop.lifeTime = 0;
  drop.stuckTimer = 0;
  drop.lastStuckX = drop.position.x;
  drop.lastStuckY = drop.position.y;
  drop.inJar = false;
  drop.jarIndex = -1;
  drop.jarColor = null;
  drop.jarCooldown = 0;
  return drop;
};

FallingMarbleSystem.prototype._flushDeferredDrops = function () {
  if (!this.deferredDrops.length) {
    return 0;
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem._flushDeferredDrops requires positive maxDynamicMarbles.");
  }

  var activated = 0;
  while (this.deferredDrops.length > 0 && this._countActiveDrops() < this.maxDynamicMarbles) {
    var drop = this.deferredDrops.shift();
    this._prepareDeferredDropForActivation(drop, activated);
    this._activateDropBatch([drop]);
    activated += 1;
  }
  return activated;
};

FallingMarbleSystem.prototype._buildDropFromCell = function (
  cell,
  index,
  grid,
  startDelay,
  dropKind,
  holdUntilEliminationPresentationComplete
) {
  if (!cell || !grid || typeof grid.getCellPosition !== "function") {
    throw new Error("FallingMarbleSystem._buildDropFromCell requires cell and grid.");
  }
  if (typeof cell.id !== "string" && typeof cell.id !== "number") {
    throw new Error("FallingMarbleSystem drop cell requires id.");
  }

  var start = grid.getCellPosition(cell.row, cell.col);
  var dropSerial = this._dropSerial + 1;
  var launchSpeed = resolveDownwardLaunchSpeed(this, index);
  var launchSeed = buildDropLaunchSeed(cell.id, index, dropSerial);
  var launchVelocity = buildDownwardLaunchVelocity(launchSpeed, launchSeed);
  var standardVelocity = {
    x: launchVelocity.x,
    y: launchVelocity.y
  };
  var rotationDirection = launchVelocity.x >= 0 ? 1 : -1;

  return {
    id: String(cell.id) + "_drop_" + (this._dropSerial += 1),
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
    rotationSpeed: rotationDirection * (180 + index * 25),
    jarCooldown: 0,
    startDelay: startDelay,
    holdUntilEliminationPresentationComplete: holdUntilEliminationPresentationComplete === true,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: start.x,
    lastStuckY: start.y,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    launchIndex: index,
    launchDropSerial: dropSerial,
    dropKind: dropKind,
    rootDropId: Object.prototype.hasOwnProperty.call(cell, "rootDropId")
      ? String(cell.rootDropId)
      : String(cell.id),
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
};

FallingMarbleSystem.prototype._activateDropBatch = function (drops) {
  if (!drops || !drops.length) {
    return [];
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem._activateDropBatch requires positive maxDynamicMarbles.");
  }

  var activated = [];
  var activeCount = this._countActiveDrops();
  for (var index = 0; index < drops.length; index += 1) {
    var drop = drops[index];
    if (activeCount + activated.length >= this.maxDynamicMarbles) {
      this.deferredDrops.push(drop);
      continue;
    }
    if (!Number.isInteger(drop.launchIndex) || drop.launchIndex < 0) {
      throw new Error("FallingMarbleSystem._activateDropBatch requires non-negative integer launchIndex.");
    }
    if (!Number.isInteger(drop.launchDropSerial) || drop.launchDropSerial <= 0) {
      throw new Error("FallingMarbleSystem._activateDropBatch requires positive launchDropSerial.");
    }
    if (drop.dropKind !== "surplus_shot") {
      this._applyDropLaunchVelocity(drop, drop.launchIndex);
    } else if (
      !drop.velocity ||
      typeof drop.velocity.x !== "number" ||
      !isFinite(drop.velocity.x) ||
      typeof drop.velocity.y !== "number" ||
      !isFinite(drop.velocity.y)
    ) {
      throw new Error("Surplus shot activation requires finite launch velocity.");
    }
    activated.push(drop);
  }

  if (activated.length > 0) {
    Array.prototype.push.apply(this.activeDrops, activated);
    this.totalFallen += activated.length;
    this._renderSnapshotDirty = true;
  }
  return activated;
};

FallingMarbleSystem.prototype.releaseEliminationPresentationDropHold = function (dt) {
  var safeDt = typeof dt === "number" && Number.isFinite(dt) && dt > 0 ? dt : 0;
  var released = false;
  this.activeDrops.forEach(function (drop) {
    if (drop && drop.holdUntilEliminationPresentationComplete === true) {
      drop.holdUntilEliminationPresentationComplete = false;
      released = true;
      if (safeDt > 0) {
        this._advanceDropMotion(drop, safeDt);
      }
    }
  }, this);
  this.deferredDrops.forEach(function (drop) {
    if (drop && drop.holdUntilEliminationPresentationComplete === true) {
      drop.holdUntilEliminationPresentationComplete = false;
      released = true;
    }
  });
  if (released) {
    this._renderSnapshotDirty = true;
  }
};

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
    fairyBonusSteps: 0,
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
  var holdUntilEliminationPresentationComplete = false;
  if (options && Object.prototype.hasOwnProperty.call(options, "holdUntilEliminationPresentationComplete")) {
    if (options.holdUntilEliminationPresentationComplete !== true) {
      throw new Error("FallingMarbleSystem.registerDrops holdUntilEliminationPresentationComplete must be true when provided.");
    }
    holdUntilEliminationPresentationComplete = true;
  }
  var dropKind = resolveDropKind(options);

  this.lastDrops = cells.map(function (cell, index) {
    return this._buildDropFromCell(
      cell,
      index,
      grid,
      startDelay,
      dropKind,
      holdUntilEliminationPresentationComplete
    );
  }, this);

  this._activateDropBatch(this.lastDrops);
  return this.lastDrops;
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

FallingMarbleSystem.prototype._findJarCollisionZone = function (x) {
  if (typeof x !== "number" || !isFinite(x)) {
    throw new Error("Jar collision lookup requires finite x.");
  }
  if (x < this._dropLeftLimit || x > this._dropRightLimit) {
    return null;
  }
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  for (var i = 0; i < this.jarZones.length; i += 1) {
    var zone = this.jarZones[i];
    var includesRightBoundary = i === this.jarZones.length - 1;
    if (
      x >= zone.collisionLeft &&
      (x < zone.collisionRight || (includesRightBoundary && x <= zone.collisionRight))
    ) {
      return zone;
    }
  }

  throw new Error("Jar collision partitions must continuously cover the board width.");
};

FallingMarbleSystem.prototype._consumeDropInteraction = function (result, interaction) {
  if (!interaction) {
    return;
  }

  if (interaction.bounced) {
    if (!Number.isInteger(interaction.bounceCount) || interaction.bounceCount < 1) {
      throw new Error("FallingMarbleSystem bounced interaction requires positive integer bounceCount.");
    }
    if (!Number.isInteger(interaction.glowStacks) || interaction.glowStacks < 0) {
      throw new Error("FallingMarbleSystem bounced interaction requires non-negative integer glowStacks.");
    }
    if (!Number.isInteger(interaction.jarIndex) || interaction.jarIndex < 0 || interaction.jarIndex >= this.jarCount) {
      throw new Error("FallingMarbleSystem bounced interaction requires valid jarIndex.");
    }
    result.bounced += 1;
    result.bounceEvents.push({
      bounceCount: interaction.bounceCount,
      glowStacks: interaction.glowStacks,
      jarIndex: interaction.jarIndex
    });
  }

  if (interaction.collected) {
    result.collected.push(interaction.collected);
  }

  if (interaction.cleanupScored) {
    result.cleanupScored.push(interaction.cleanupScored);
  }

  if (interaction.missed) {
    result.missed.push(interaction.missed);
  }
};

FallingMarbleSystem.prototype._forceDropResolution = function (drop, collectPreferred) {
  var inJarZone = drop.inJar === true ? this._getJarZoneByIndex(drop.jarIndex) : null;
  if (collectPreferred && inJarZone) {
    drop.active = false;
    return {
      collected: this._createCollectedEvent(drop, inJarZone)
    };
  }

  var nearestZone = collectPreferred && drop.position
    ? this._findNearestJarZone(drop.position.x)
    : null;
  if (nearestZone) {
    var cleanupScored = this._createCollectedEvent(drop, nearestZone);
    cleanupScored.scoreOnly = true;
    cleanupScored.reason = "outside_jar_cleanup";
    drop.active = false;
    return {
      cleanupScored: cleanupScored
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
    position: {
      x: drop.position.x,
      y: drop.position.y
    },
    jarIndex: zone ? zone.index : -1,
    jarColor: zone ? zone.color : null,
    sameColor: sameColor,
    bonusMultiplier: sameColor ? zone.sameColorBonus : 1,
    fairyBonusSteps: drop.fairyBonusSteps,
    fairyMultiplier: drop.finalMultiplier,
    finalMultiplier: drop.finalMultiplier,
    glowStacks: drop.glowStacks,
    rootDropId: drop.rootDropId,
    splitGeneration: drop.splitGeneration,
    hitFairyIds: drop.hitFairyIds.slice()
  };
};

FallingMarbleSystem.prototype._isFairySplittableDrop = function (drop) {
  return !!(
    drop &&
    drop.entityCategory === "normal_ball" &&
    drop.entityType === null &&
    typeof drop.color === "string" &&
    drop.color &&
    drop.splitGeneration === 0
  );
};

FallingMarbleSystem.prototype._createSplitChildren = function (drop) {
  if (!this._isFairySplittableDrop(drop)) {
    throw new Error("Green fairy split requires a splittable normal drop.");
  }
  var angles = [-FairyAssistConfig.splitAngleDegrees, FairyAssistConfig.splitAngleDegrees];
  return angles.map(function (angle, index) {
    var child = clone(drop);
    child.id = drop.rootDropId + "_fairy_split_" + (this._dropSerial += 1);
    child.velocity = rotateVector(drop.velocity, angle);
    child.rotationSpeed = index === 0 ? -Math.abs(drop.rotationSpeed) : Math.abs(drop.rotationSpeed);
    child.splitGeneration = 1;
    child.active = true;
    child.lifeTime = 0;
    child.stuckTimer = 0;
    child.lastStuckX = child.position.x;
    child.lastStuckY = child.position.y;
    return child;
  }, this);
};

FallingMarbleSystem.prototype._applyFairyCollision = function (drop, activeDropCount) {
  if (drop && drop.dropKind === "victory_board_drop") {
    return null;
  }
  if (!this.fairyAssistSystem) {
    throw new Error("FallingMarbleSystem fairy collision requires FairyAssistSystem.");
  }
  var collision = this.fairyAssistSystem.resolveFirstCollision(drop, BoardLayout.bubbleRadius);
  if (!collision) {
    return null;
  }

  var normal;
  var distance = Math.sqrt(collision.dx * collision.dx + collision.dy * collision.dy);
  if (distance > 0.000001) {
    normal = {
      x: collision.dx / distance,
      y: collision.dy / distance
    };
  } else {
    normal = normalize({
      x: -drop.velocity.x,
      y: -drop.velocity.y
    });
    if (normal.x === 0 && normal.y === 0) {
      normal = { x: 0, y: 1 };
    }
  }

  var reflected = reflectVector(drop.velocity, normal);
  drop.velocity.x = reflected.x * FairyAssistConfig.bounceDamping;
  drop.velocity.y = Math.max(
    reflected.y * FairyAssistConfig.bounceDamping,
    FairyAssistConfig.minimumUpwardSpeed
  );
  drop.position.x = collision.fairy.position.x + normal.x * collision.collisionDistance;
  drop.position.y = collision.fairy.position.y + normal.y * collision.collisionDistance;
  drop.fairyBonusSteps += collision.fairy.bonusStep;
  drop.finalMultiplier = 1 + drop.fairyBonusSteps;
  if (!Number.isInteger(drop.glowStacks) || drop.glowStacks < 0) {
    throw new Error("Falling drop glowStacks must be a non-negative integer.");
  }
  drop.glowStacks = Math.min(FairyAssistConfig.maxGlowStacks, drop.glowStacks + 1);

  var result = {
    fairyId: collision.fairy.id,
    fairyColor: collision.fairy.color,
    dropId: drop.id,
    bonusStep: collision.fairy.bonusStep,
    finalMultiplier: drop.finalMultiplier,
    splitChildren: []
  };

  if (collision.fairy.canSplit && this._isFairySplittableDrop(drop)) {
    if (!Number.isInteger(activeDropCount) || activeDropCount <= 0) {
      throw new Error("Green fairy split requires positive active drop count.");
    }
    if (activeDropCount + 1 > this.maxDynamicMarbles) {
      throw new Error(
        "Green fairy split exceeds maxDynamicMarbles: " +
        (activeDropCount + 1) + " > " + this.maxDynamicMarbles + "."
      );
    }
    result.splitChildren = this._createSplitChildren(drop);
    drop.active = false;
  }
  return result;
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
  // Inspector 配置决定首次缸口反弹速度；后续反弹只允许按次数和上次速度继续衰减。
  var targetBounceSpeed = Math.min(decayByCount, decayByPrevious);
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

  var zone = this._findJarCollisionZone(bottomPoint.x);
  if (!zone) {
    return null;
  }
  var dx = bottomPoint.x - zone.x;
  var absDx = Math.abs(dx);

  if (
    absDx <= zone.collectHalfWidth &&
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
    drop.velocity.y < 0 &&
    bottomPoint.y <= zone.mouthY + zone.contactBand &&
    bottomPoint.y >= zone.mouthY - zone.edgeThickness * 1.4
  ) {
    var side = dx >= 0 ? 1 : -1;
    var outerEdgeThreshold = zone.innerHalfWidth + zone.edgeThickness * 0.5;
    var edgeType = absDx >= outerEdgeThreshold ? "outer" : "inner";
    if ((drop.rimBounceCount || 0) >= this.maxRimBounces) {
      edgeType = "inner";
    }

    this._applyRimArcBounce(drop, zone, side, edgeType, bottomPoint);
    return {
      bounced: true,
      bounceCount: drop.rimBounceCount,
      glowStacks: drop.glowStacks,
      jarIndex: zone.index,
      edgeType: edgeType
    };
  }

  return null;
};

FallingMarbleSystem.prototype.update = function (dt) {
  var result = createEmptyUpdateResult();
  var safeDt = typeof dt === "number" && isFinite(dt) && dt > 0 ? dt : 0;
  this.lastUpdateDt = safeDt;

  result.surplusUpdated = this._processPendingSurplusShots(safeDt);
  this._flushDeferredDrops();

  var layoutSignature = this._buildLayoutSignature();
  if (layoutSignature !== this._layoutSignature) {
    this.jarZones = this._buildJarZones();
    this._rebuildDropBounds();
    this._layoutSignature = layoutSignature;
    this._renderSnapshotDirty = true;
  }

  if (!safeDt || !this.activeDrops.length) {
    this.lastCollectedDrops = [];
    this.lastMissedDrops = [];
    this.lastBounceCount = 0;
    return result;
  }

  var drops = this.activeDrops;
  var activeDropCount = 0;
  for (var activeIndex = 0; activeIndex < drops.length; activeIndex += 1) {
    if (drops[activeIndex].active) {
      activeDropCount += 1;
    }
  }
  var spawnedDrops = this._spawnedDropsBuffer;
  spawnedDrops.length = 0;
  var writeIndex = 0;
  for (var readIndex = 0; readIndex < drops.length; readIndex += 1) {
    var drop = drops[readIndex];
    if (!drop.active) {
      continue;
    }

    result.updated = true;
    if (drop.holdUntilEliminationPresentationComplete === true) {
      drops[writeIndex] = drop;
      writeIndex += 1;
      this._renderSnapshotDirty = true;
      continue;
    }
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
      activeDropCount -= 1;
      continue;
    }

    drop.jarCooldown = Math.max(0, (drop.jarCooldown || 0) - dt);
    this._applyGapAttraction(drop, dt);
    drop.velocity.y -= this.gravity * dt;
    drop.position.x += drop.velocity.x * dt;
    drop.position.y += drop.velocity.y * dt;
    drop.rotation += drop.rotationSpeed * dt;

    var fairyCollision = this._applyFairyCollision(drop, activeDropCount + spawnedDrops.length);
    if (fairyCollision) {
      result.fairyHits.push({
        fairyId: fairyCollision.fairyId,
        fairyColor: fairyCollision.fairyColor,
        dropId: fairyCollision.dropId,
        bonusStep: fairyCollision.bonusStep,
        finalMultiplier: fairyCollision.finalMultiplier
      });
      if (fairyCollision.splitChildren.length > 0) {
        Array.prototype.push.apply(spawnedDrops, fairyCollision.splitChildren);
        result.splits.push({
          rootDropId: drop.rootDropId,
          sourceDropId: drop.id,
          childDropIds: fairyCollision.splitChildren.map(function (child) {
            return child.id;
          })
        });
        activeDropCount -= 1;
        continue;
      }
    }

    var jarInteraction = this._processJarInteraction(drop);
    if (jarInteraction) {
      this._consumeDropInteraction(result, jarInteraction);

      if (drop.active) {
        this._clampDropToSideBounds(drop);
        if (this._isDropPressingSideBounds(drop)) {
          this._applySideWallEscape(drop, false);
        }
        drops[writeIndex] = drop;
        writeIndex += 1;
      } else {
        activeDropCount -= 1;
      }
      continue;
    }

    var clampedToSideBounds = this._clampDropToSideBounds(drop);
    if (
      (clampedToSideBounds || this._isDropPressingSideBounds(drop))
    ) {
      this._applySideWallEscape(drop, drop.dropKind !== "victory_board_drop");
    }

    this._consumeDropInteraction(result, this._resolveStuckDropIfNeeded(drop, dt));
    if (!drop.active) {
      activeDropCount -= 1;
      continue;
    }

    if (drop.position.y <= this.cleanupY) {
      drop.active = false;
      result.missed.push(this._createMissedEvent(drop));
      activeDropCount -= 1;
    }
    if (drop.active) {
      drops[writeIndex] = drop;
      writeIndex += 1;
    }
  }
  if (writeIndex !== drops.length) {
    drops.length = writeIndex;
  }
  if (spawnedDrops.length > 0) {
    Array.prototype.push.apply(drops, spawnedDrops);
    this.totalFallen += spawnedDrops.length;
  }
  this._flushDeferredDrops();

  this.lastCollectedDrops = result.collected.slice();
  this.lastMissedDrops = result.missed.slice();
  this.lastBounceCount = result.bounced;
  this._renderSnapshotDirty = true;

  return result;
};

FallingMarbleSystem.prototype.snapshotForRender = function () {
  var visibleDropCount = this._countVisibleFallingDrops();
  if (!this._renderSnapshotCache) {
    this._renderSnapshotCache = {
      activeDrops: this.activeDrops,
      activeDropCount: visibleDropCount,
      jarZones: this.jarZones
    };
    this._renderSnapshotDirty = false;
    return this._renderSnapshotCache;
  }

  if (this._renderSnapshotDirty) {
    this._renderSnapshotCache.activeDrops = this.activeDrops;
    this._renderSnapshotCache.activeDropCount = visibleDropCount;
    this._renderSnapshotCache.jarZones = this.jarZones;
    this._renderSnapshotDirty = false;
  }
  return this._renderSnapshotCache;
};

FallingMarbleSystem.prototype._countVisibleFallingDrops = function () {
  var count = 0;
  for (var index = 0; index < this.activeDrops.length; index += 1) {
    if (this.activeDrops[index].active) {
      count += 1;
    }
  }
  return count;
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
