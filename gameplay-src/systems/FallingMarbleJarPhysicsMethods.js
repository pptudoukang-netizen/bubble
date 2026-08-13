"use strict";

function attachFallingMarbleJarPhysicsMethods(FallingMarbleSystem, context) {
  var BoardLayout = context.BoardLayout;
  var FairyAssistConfig = context.FairyAssistConfig;
  var clamp = context.clamp;
  var clone = context.clone;
  var normalize = context.normalize;
  var reflectVector = context.reflectVector;
  var rotateVector = context.rotateVector;

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
  if (!Number.isInteger(drop.glowStacks) || drop.glowStacks < 0) {
    throw new Error("Falling drop glowStacks must be a non-negative integer.");
  }
  drop.glowStacks = Math.min(
    FairyAssistConfig.maxGlowStacks,
    drop.glowStacks + collision.fairy.bonusStep
  );
  drop.finalMultiplier = FairyAssistConfig.getScoreMultiplierForGlowStacks(drop.glowStacks);

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
}

module.exports = attachFallingMarbleJarPhysicsMethods;
