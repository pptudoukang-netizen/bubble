"use strict";

function attachFallingMarbleRuntimeMethods(FallingMarbleSystem, context) {
  var BaseSystem = context.BaseSystem;
  var clone = context.clone;
  var createEmptyUpdateResult = context.createEmptyUpdateResult;

FallingMarbleSystem.prototype.update = function (dt) {
  var result = createEmptyUpdateResult();
  var safeDt = typeof dt === "number" && isFinite(dt) && dt > 0 ? dt : 0;
  this.lastUpdateDt = safeDt;

  var pendingSurplusShotCountBeforeUpdate = this.pendingSurplusShotBalls.length;
  result.surplusUpdated = this._processPendingSurplusShots(safeDt);
  result.surplusShotLaunchedCount = pendingSurplusShotCountBeforeUpdate - this.pendingSurplusShotBalls.length;
  if (
    !Number.isInteger(result.surplusShotLaunchedCount) ||
    result.surplusShotLaunchedCount < 0 ||
    result.surplusShotLaunchedCount > 1
  ) {
    throw new Error("FallingMarbleSystem update must launch at most one surplus shot.");
  }
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
    if (drop.dropKind !== "poison_droplet" && drop.dropKind !== "icicle") {
      this._applyGapAttraction(drop, dt);
    }
    drop.velocity.y -= this.gravity * dt;
    drop.position.x += drop.velocity.x * dt;
    drop.position.y += drop.velocity.y * dt;
    drop.rotation += drop.rotationSpeed * dt;

    if (drop.dropKind === "poison_droplet" || drop.dropKind === "icicle") {
      var attachmentCollision = drop.dropKind === "poison_droplet"
        ? this._applyPoisonFairyCollision(drop)
        : this._applyIcicleFairyCollision(drop);
      if (attachmentCollision) {
        if (drop.dropKind === "poison_droplet") {
          result.poisonFairyHits.push(attachmentCollision);
        } else {
          result.icicleFairyHits.push(attachmentCollision);
        }
        activeDropCount -= 1;
        continue;
      }
      if (drop.position.y <= this.cleanupY) {
        drop.active = false;
        result.missed.push(this._createMissedEvent(drop));
        activeDropCount -= 1;
        continue;
      }
      drops[writeIndex] = drop;
      writeIndex += 1;
      continue;
    }

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
}

module.exports = attachFallingMarbleRuntimeMethods;
