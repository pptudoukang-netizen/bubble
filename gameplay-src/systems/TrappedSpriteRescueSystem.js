"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var AssistSpiritConfig = require("../../assets/scripts/config/AssistSpiritConfig");

var LEVEL_TYPE = "trapped_sprite_rescue";
var MULTI_TARGET_LEVEL_TYPE = "multi_trapped_spirit_rescue";
var PHASE_IDLE = "idle";
var PHASE_ROTATING = "rotating";
var DEG_TO_RAD = Math.PI / 180;
var TRAPPED_SPIRIT_PATH_PREFIX = "game/trapped_spirit/";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function requireFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(fieldName + " must be a finite number.");
  }
  return value;
}

function requirePositiveNumber(value, fieldName) {
  var numberValue = requireFiniteNumber(value, fieldName);
  if (numberValue <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return numberValue;
}

function requireCoordinate(value, fieldName) {
  if (!value || !Number.isInteger(value.row) || !Number.isInteger(value.col)) {
    throw new Error(fieldName + " requires integer row and col.");
  }
  return {
    row: value.row,
    col: value.col
  };
}

function requirePoint(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return {
    x: requireFiniteNumber(value.x, fieldName + ".x"),
    y: requireFiniteNumber(value.y, fieldName + ".y")
  };
}

function normalizeDirection(direction, fieldName) {
  var point = requirePoint(direction, fieldName);
  var length = Math.sqrt(point.x * point.x + point.y * point.y);
  if (!isFinite(length) || length <= 0.000001) {
    throw new Error(fieldName + " must have positive length.");
  }
  return {
    x: point.x / length,
    y: point.y / length
  };
}

function rotatePoint(point, angleRad) {
  var cosine = Math.cos(angleRad);
  var sine = Math.sin(angleRad);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine
  };
}

function buildSpriteResourcePath(spiritId) {
  AssistSpiritConfig.getSpirit(spiritId);
  return TRAPPED_SPIRIT_PATH_PREFIX + spiritId;
}

function TrappedSpriteRescueSystem() {
  BaseSystem.call(this, "TrappedSpriteRescueSystem");
  this.active = false;
  this.spiritId = "";
  this.spriteResourcePath = "";
  this.anchorCell = null;
  this.worldCenter = null;
  this.renderScale = 1;
  this.rotationConfig = null;
  this.angleRad = 0;
  this.phase = PHASE_IDLE;
  this.elapsedSec = 0;
  this.durationSec = 0;
  this.startAngleRad = 0;
  this.targetAngleRad = 0;
  this.initialAngularVelocityDeg = 0;
  this.revision = 0;
  this.lastRotation = null;
  this.multiTargetActive = false;
  this.targets = [];
  this.rescuedTargetCount = 0;
}

TrappedSpriteRescueSystem.prototype = Object.create(BaseSystem.prototype);
TrappedSpriteRescueSystem.prototype.constructor = TrappedSpriteRescueSystem;

TrappedSpriteRescueSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level) {
    throw new Error("TrappedSpriteRescueSystem.configureLevel requires level config.");
  }

  var level = levelConfig.level;
  this.active = level.levelType === LEVEL_TYPE;
  this.spiritId = "";
  this.spriteResourcePath = "";
  this.anchorCell = null;
  this.worldCenter = null;
  this.renderScale = 1;
  this.rotationConfig = null;
  this.angleRad = 0;
  this.phase = PHASE_IDLE;
  this.elapsedSec = 0;
  this.durationSec = 0;
  this.startAngleRad = 0;
  this.targetAngleRad = 0;
  this.initialAngularVelocityDeg = 0;
  this.revision = 0;
  this.lastRotation = null;
  this.multiTargetActive = false;
  this.targets = [];
  this.rescuedTargetCount = 0;

  if (!this.active && level.levelType !== MULTI_TARGET_LEVEL_TYPE) {
    if (level.trappedSpriteRescue !== undefined) {
      throw new Error("Non-rescue level must not configure level.trappedSpriteRescue.");
    }
    if (level.multiTrappedSpiritRescue !== undefined) {
      throw new Error("Non-multi-rescue level must not configure level.multiTrappedSpiritRescue.");
    }
    return this;
  }

  if (level.levelType === MULTI_TARGET_LEVEL_TYPE) {
    if (level.trappedSpriteRescue !== undefined) {
      throw new Error("Multi trapped spirit rescue level must not configure level.trappedSpriteRescue.");
    }
    var multiConfig = level.multiTrappedSpiritRescue;
    if (!multiConfig || typeof multiConfig !== "object" || Array.isArray(multiConfig)) {
      throw new Error("Multi trapped spirit rescue level requires level.multiTrappedSpiritRescue.");
    }
    if (!Array.isArray(multiConfig.targets) || multiConfig.targets.length < 2) {
      throw new Error("Multi trapped spirit rescue level requires at least two targets.");
    }
    this.multiTargetActive = true;
    this.targets = multiConfig.targets.map(function (target, index) {
      var coordinate = requireCoordinate(target, "Multi trapped spirit target[" + index + "]");
      var spiritId = target.spiritId;
      return {
        id: "multi_trapped_spirit_" + (index + 1),
        spiritId: spiritId,
        spriteResourcePath: buildSpriteResourcePath(spiritId),
        row: coordinate.row,
        col: coordinate.col,
        rescued: false
      };
    });
    return this;
  }

  var config = level.trappedSpriteRescue;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Trapped sprite rescue level requires level.trappedSpriteRescue.");
  }
  if (!config.rotation || typeof config.rotation !== "object" || Array.isArray(config.rotation)) {
    throw new Error("Trapped sprite rescue level requires rotation config.");
  }

  this.spiritId = config.spiritId;
  this.spriteResourcePath = buildSpriteResourcePath(this.spiritId);
  this.anchorCell = requireCoordinate(config.anchorCell, "Trapped sprite anchorCell");
  this.worldCenter = requirePoint(config.worldCenter, "Trapped sprite worldCenter");
  this.renderScale = requirePositiveNumber(config.renderScale, "Trapped sprite renderScale");
  this.rotationConfig = clone(config.rotation);
  return this;
};

TrappedSpriteRescueSystem.prototype.isActive = function () {
  return this.active === true;
};

TrappedSpriteRescueSystem.prototype.isRotating = function () {
  return this.active === true && this.phase === PHASE_ROTATING;
};

TrappedSpriteRescueSystem.prototype.isMultiTargetActive = function () {
  return this.multiTargetActive === true;
};

TrappedSpriteRescueSystem.prototype.isMultiTargetCompleted = function () {
  return this.multiTargetActive === true && this.rescuedTargetCount === this.targets.length;
};

TrappedSpriteRescueSystem.prototype.isReservedCell = function (row, col) {
  if (this.active && this.anchorCell && row === this.anchorCell.row && col === this.anchorCell.col) {
    return true;
  }
  if (!this.multiTargetActive) {
    return false;
  }
  return this.targets.some(function (target) {
    return target.rescued !== true && target.row === row && target.col === col;
  });
};

TrappedSpriteRescueSystem.prototype.rescueTargetsAdjacentToCells = function (cells) {
  if (!this.multiTargetActive) {
    throw new Error("Multi trapped spirit rescue requires active multi-target mode.");
  }
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error("Multi trapped spirit rescue requires at least one trigger cell.");
  }
  var triggerKeys = {};
  cells.forEach(function (cell, index) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Multi trapped spirit trigger cell is invalid at index " + index + ".");
    }
    triggerKeys[cell.row + ":" + cell.col] = true;
  });
  var rescued = [];
  this.targets.forEach(function (target) {
    if (target.rescued) {
      return;
    }
    var offsets = target.row % 2 !== 0 ? [
      [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]
    ] : [
      [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
    ];
    var adjacent = offsets.some(function (offset) {
      return triggerKeys[(target.row + offset[0]) + ":" + (target.col + offset[1])] === true;
    });
    if (!adjacent) {
      return;
    }
    target.rescued = true;
    this.rescuedTargetCount += 1;
    rescued.push(clone(target));
  }, this);
  if (this.rescuedTargetCount > this.targets.length) {
    throw new Error("Multi trapped spirit rescued target count exceeded target count.");
  }
  if (rescued.length) {
    this.revision += 1;
  }
  return rescued;
};

TrappedSpriteRescueSystem.prototype.getAnchorCell = function () {
  if (!this.active || !this.anchorCell) {
    throw new Error("Trapped sprite anchor is unavailable outside rescue mode.");
  }
  return clone(this.anchorCell);
};

TrappedSpriteRescueSystem.prototype.getWorldCenter = function () {
  if (!this.active || !this.worldCenter) {
    throw new Error("Trapped sprite world center is unavailable outside rescue mode.");
  }
  return clone(this.worldCenter);
};

TrappedSpriteRescueSystem.prototype.getCellWorldPosition = function (row, col, maxColumns) {
  if (!this.active) {
    throw new Error("Trapped sprite world transform requires active rescue mode.");
  }
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new Error("Trapped sprite world transform requires integer row and col.");
  }
  if (!Number.isInteger(maxColumns) || maxColumns <= 0) {
    throw new Error("Trapped sprite world transform requires positive maxColumns.");
  }

  var anchorPosition = BoardLayout.getCellPosition(
    this.anchorCell.row,
    this.anchorCell.col,
    maxColumns,
    0
  );
  var cellPosition = BoardLayout.getCellPosition(row, col, maxColumns, 0);
  var rotated = rotatePoint({
    x: cellPosition.x - anchorPosition.x,
    y: cellPosition.y - anchorPosition.y
  }, this.angleRad);
  return {
    x: this.worldCenter.x + rotated.x,
    y: this.worldCenter.y + rotated.y
  };
};

TrappedSpriteRescueSystem.prototype.worldDirectionToLocal = function (direction) {
  if (!this.active) {
    throw new Error("Trapped sprite direction transform requires active rescue mode.");
  }
  return rotatePoint(normalizeDirection(direction, "Trapped sprite world direction"), -this.angleRad);
};

TrappedSpriteRescueSystem.prototype.beginImpactRotation = function (impactPoint, incomingDirection, supportedCells, grid) {
  if (!this.active) {
    throw new Error("Trapped sprite impact rotation requires active rescue mode.");
  }
  if (this.isRotating()) {
    throw new Error("Trapped sprite impact rotation cannot overlap another rotation.");
  }
  if (!Array.isArray(supportedCells)) {
    throw new Error("Trapped sprite impact rotation requires supportedCells array.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("Trapped sprite impact rotation requires BubbleGrid.");
  }

  var impact = requirePoint(impactPoint, "Trapped sprite impactPoint");
  var incoming = normalizeDirection(incomingDirection, "Trapped sprite incomingDirection");
  var radiusVector = {
    x: impact.x - this.worldCenter.x,
    y: impact.y - this.worldCenter.y
  };
  var impactRadius = Math.sqrt(
    radiusVector.x * radiusVector.x +
    radiusVector.y * radiusVector.y
  );
  if (!isFinite(impactRadius) || impactRadius <= 0.000001) {
    throw new Error("Trapped sprite impact radius must be positive.");
  }

  var radialDirection = {
    x: radiusVector.x / impactRadius,
    y: radiusVector.y / impactRadius
  };
  var signedTangentialFactor =
    radialDirection.x * incoming.y -
    radialDirection.y * incoming.x;
  var rotationConfig = this.rotationConfig;
  var deadZone = requireFiniteNumber(
    rotationConfig.tangentialDeadZone,
    "Trapped sprite tangentialDeadZone"
  );
  var radiusUnit = impactRadius / BoardLayout.bubbleDiameter;
  var inertia = requirePositiveNumber(
    rotationConfig.coreInertia,
    "Trapped sprite coreInertia"
  );

  supportedCells.forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Trapped sprite inertia requires supported cell coordinates.");
    }
    var position = grid.getCellPosition(cell.row, cell.col);
    var dx = position.x - this.worldCenter.x;
    var dy = position.y - this.worldCenter.y;
    var normalizedRadiusSq = (dx * dx + dy * dy) /
      (BoardLayout.bubbleDiameter * BoardLayout.bubbleDiameter);
    inertia += normalizedRadiusSq;
  }, this);

  var torque = 0;
  var initialAngularVelocityDeg = 0;
  if (Math.abs(signedTangentialFactor) > deadZone && supportedCells.length > 0) {
    torque =
      requirePositiveNumber(rotationConfig.projectileImpulse, "Trapped sprite projectileImpulse") *
      requirePositiveNumber(rotationConfig.torqueScale, "Trapped sprite torqueScale") *
      radiusUnit *
      signedTangentialFactor;
    var maxAngularSpeedDeg = requirePositiveNumber(
      rotationConfig.maxAngularSpeedDeg,
      "Trapped sprite maxAngularSpeedDeg"
    );
    initialAngularVelocityDeg = clamp(
      torque / inertia,
      -maxAngularSpeedDeg,
      maxAngularSpeedDeg
    );
  }

  var damping = requirePositiveNumber(
    rotationConfig.angularDamping,
    "Trapped sprite angularDamping"
  );
  var stopSpeedDeg = requirePositiveNumber(
    rotationConfig.stopAngularSpeedDeg,
    "Trapped sprite stopAngularSpeedDeg"
  );
  var maxDurationSec = requirePositiveNumber(
    rotationConfig.maxDurationSec,
    "Trapped sprite maxDurationSec"
  );
  var durationSec = 0;
  var deltaAngleDeg = 0;
  if (Math.abs(initialAngularVelocityDeg) > stopSpeedDeg) {
    durationSec = Math.min(
      maxDurationSec,
      Math.log(Math.abs(initialAngularVelocityDeg) / stopSpeedDeg) / damping
    );
    deltaAngleDeg =
      initialAngularVelocityDeg /
      damping *
      (1 - Math.exp(-damping * durationSec));
    var maxStepAngleDeg = requirePositiveNumber(
      rotationConfig.maxStepAngleDeg,
      "Trapped sprite maxStepAngleDeg"
    );
    deltaAngleDeg = clamp(deltaAngleDeg, -maxStepAngleDeg, maxStepAngleDeg);
  }

  var rotation = {
    started: durationSec > 0 && Math.abs(deltaAngleDeg) > 0.0001,
    impactPoint: impact,
    incomingDirection: incoming,
    impactRadius: impactRadius,
    tangentialFactor: signedTangentialFactor,
    torque: torque,
    momentOfInertia: inertia,
    supportedCellCount: supportedCells.length,
    initialAngularVelocityDeg: initialAngularVelocityDeg,
    startAngleRad: this.angleRad,
    targetAngleRad: this.angleRad + deltaAngleDeg * DEG_TO_RAD,
    deltaAngleDeg: deltaAngleDeg,
    durationSec: durationSec
  };
  this.lastRotation = clone(rotation);

  if (!rotation.started) {
    return clone(rotation);
  }

  this.phase = PHASE_ROTATING;
  this.elapsedSec = 0;
  this.durationSec = durationSec;
  this.startAngleRad = rotation.startAngleRad;
  this.targetAngleRad = rotation.targetAngleRad;
  this.initialAngularVelocityDeg = initialAngularVelocityDeg;
  this.revision += 1;
  return clone(rotation);
};

TrappedSpriteRescueSystem.prototype.update = function (dt) {
  var safeDt = requireFiniteNumber(dt, "TrappedSpriteRescueSystem.update dt");
  if (safeDt < 0) {
    throw new Error("TrappedSpriteRescueSystem.update dt must not be negative.");
  }
  if (!this.isRotating()) {
    return {
      changed: false,
      completed: false
    };
  }

  this.elapsedSec = Math.min(this.durationSec, this.elapsedSec + safeDt);
  var damping = requirePositiveNumber(
    this.rotationConfig.angularDamping,
    "Trapped sprite angularDamping"
  );
  var denominator = 1 - Math.exp(-damping * this.durationSec);
  if (!isFinite(denominator) || denominator <= 0) {
    throw new Error("Trapped sprite rotation easing denominator must be positive.");
  }
  var normalizedProgress =
    (1 - Math.exp(-damping * this.elapsedSec)) /
    denominator;
  normalizedProgress = clamp(normalizedProgress, 0, 1);
  this.angleRad =
    this.startAngleRad +
    (this.targetAngleRad - this.startAngleRad) * normalizedProgress;
  this.revision += 1;

  var completed = this.elapsedSec >= this.durationSec;
  if (completed) {
    this.angleRad = this.targetAngleRad;
    this.phase = PHASE_IDLE;
    this.elapsedSec = 0;
    this.durationSec = 0;
    this.initialAngularVelocityDeg = 0;
    this.revision += 1;
  }

  return {
    changed: true,
    completed: completed
  };
};

TrappedSpriteRescueSystem.prototype.snapshotForRender = function () {
  if (this.multiTargetActive) {
    return {
      active: false,
      multiTargetActive: true,
      targets: clone(this.targets),
      rescuedTargetCount: this.rescuedTargetCount,
      targetCount: this.targets.length,
      completed: this.isMultiTargetCompleted(),
      phase: PHASE_IDLE,
      revision: this.revision
    };
  }
  if (!this.active) {
    return {
      active: false,
      multiTargetActive: false,
      phase: PHASE_IDLE,
      revision: this.revision
    };
  }
  return {
    active: true,
    spiritId: this.spiritId,
    spriteResourcePath: this.spriteResourcePath,
    anchorCell: clone(this.anchorCell),
    worldCenter: clone(this.worldCenter),
    renderScale: this.renderScale,
    angleRad: this.angleRad,
    angleDeg: this.angleRad / DEG_TO_RAD,
    phase: this.phase,
    rotating: this.isRotating(),
    revision: this.revision,
    lastRotation: this.lastRotation ? clone(this.lastRotation) : null
  };
};

TrappedSpriteRescueSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  var renderSnapshot = this.snapshotForRender();
  Object.keys(renderSnapshot).forEach(function (key) {
    snapshot[key] = renderSnapshot[key];
  });
  return snapshot;
};

TrappedSpriteRescueSystem.LEVEL_TYPE = LEVEL_TYPE;
TrappedSpriteRescueSystem.MULTI_TARGET_LEVEL_TYPE = MULTI_TARGET_LEVEL_TYPE;
TrappedSpriteRescueSystem.buildSpriteResourcePath = buildSpriteResourcePath;

module.exports = TrappedSpriteRescueSystem;
