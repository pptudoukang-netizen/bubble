"use strict";

var attachFallingMarbleSurplusMethods = require("./FallingMarbleSurplusMethods");
var attachFallingMarbleJarPhysicsMethods = require("./FallingMarbleJarPhysicsMethods");
var attachFallingMarbleRuntimeMethods = require("./FallingMarbleRuntimeMethods");

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
    surplusShotLaunchedCount: 0,
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
  if (typeof drop.jarCooldown !== "number" || !isFinite(drop.jarCooldown) || drop.jarCooldown < 0) {
    throw new Error("Falling drop side-wall escape requires non-negative jarCooldown.");
  }

  var escapeDirection = drop.position.x <= this._dropLeftLimit ? 1 : -1;
  if (drop.jarCooldown > 0) {
    if (Math.abs(drop.velocity.x) <= 0) {
      throw new Error("Recent jar rim bounce must reach the side wall with horizontal speed.");
    }
    // A side wall reached immediately after a jar-rim bounce only redirects the motion.
    // It must not apply a second damping pass that makes shallow rim bounces look slower.
    drop.velocity.x = escapeDirection * Math.abs(drop.velocity.x);
    return;
  }
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

var FALLING_MARBLE_METHOD_CONTEXT = {
  BaseSystem: BaseSystem,
  BoardLayout: BoardLayout,
  FairyAssistConfig: FairyAssistConfig,
  SURPLUS_SHOT_INTERVAL_SEC: SURPLUS_SHOT_INTERVAL_SEC,
  SURPLUS_TURRET_ANGLE_LADDER: SURPLUS_TURRET_ANGLE_LADDER,
  SURPLUS_TURRET_ROTATE_INTERVAL_SEC: SURPLUS_TURRET_ROTATE_INTERVAL_SEC,
  clamp: clamp,
  clone: clone,
  createEmptyUpdateResult: createEmptyUpdateResult,
  normalize: normalize,
  reflectVector: reflectVector,
  resolveLaunchDeviationFromTurretAngleDeg: resolveLaunchDeviationFromTurretAngleDeg,
  rotateVector: rotateVector
};
attachFallingMarbleSurplusMethods(FallingMarbleSystem, FALLING_MARBLE_METHOD_CONTEXT);
attachFallingMarbleJarPhysicsMethods(FallingMarbleSystem, FALLING_MARBLE_METHOD_CONTEXT);
attachFallingMarbleRuntimeMethods(FallingMarbleSystem, FALLING_MARBLE_METHOD_CONTEXT);

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

module.exports = FallingMarbleSystem;
