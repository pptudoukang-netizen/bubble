"use strict";

function attachLevelRendererSceneKeySplitterFxMethods(LevelRenderer, context) {
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var BoardLayout = context.BoardLayout;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var SPLITTER_SPAWN_BEZIER_ARC = context.SPLITTER_SPAWN_BEZIER_ARC;
  var SPLITTER_SPAWN_FLY_DURATION = context.SPLITTER_SPAWN_FLY_DURATION;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var applyKeyUnlockFlyFrame = context.applyKeyUnlockFlyFrame;
  var attachLevelRendererSceneKeySplitterFxMethods = context.attachLevelRendererSceneKeySplitterFxMethods;
  var createKeyUnlockAnimationKey = context.createKeyUnlockAnimationKey;
  var createSplitterSpawnEntryKey = context.createSplitterSpawnEntryKey;
  var findUnlockedTargetsForKey = context.findUnlockedTargetsForKey;
  var instantiateRequired = context.instantiateRequired;
  var pointDistance = context.pointDistance;
  var requireVisualChild = context.requireVisualChild;
  var resolveKeyUnlockTargetNode = context.resolveKeyUnlockTargetNode;
  var resolveSplitterSpawnTargetNode = context.resolveSplitterSpawnTargetNode;

LevelRenderer.prototype._playKeyUnlockAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var collectedKeys = resolution && Array.isArray(resolution.collectedKeys) ? resolution.collectedKeys : [];
  var unlockedCells = resolution && Array.isArray(resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
  if (!collectedKeys.length || !unlockedCells.length) {
    return;
  }

  var animationKey = createKeyUnlockAnimationKey(resolution);
  if (!animationKey || animationKey === this.lastKeyUnlockAnimationKey) {
    return;
  }
  this.lastKeyUnlockAnimationKey = animationKey;

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Key unlock animation requires board snapshot.");
  }
  if (typeof cc === "undefined" || !cc || typeof cc.tween !== "function") {
    throw new Error("Key unlock animation requires cc.tween.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Key unlock animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = SpecialAnimationTiming.keyUnlock.flyDuration;
  var keyShrinkDuration = SpecialAnimationTiming.keyUnlock.shrinkDuration;
  var lockShakeStep = SpecialAnimationTiming.keyUnlock.lockShakeStepDuration;
  var lockShakeOffset = 8;

  collectedKeys.forEach(function (keyCell) {
    if (!keyCell) {
      throw new Error("Key unlock animation requires collected key.");
    }
    if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
      throw new Error("Key unlock animation requires collected key id.");
    }

    var targetCells = findUnlockedTargetsForKey(keyCell, unlockedCells);
    var primaryTarget = targetCells[0];
    var keyPosition = BoardLayout.getCellPosition(keyCell.row, keyCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var targetPosition = BoardLayout.getCellPosition(primaryTarget.row, primaryTarget.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var travelDistance = pointDistance(keyPosition, targetPosition);
    var arcHeight = Math.max(64, Math.min(140, travelDistance * 0.28));

    var keyFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.keyBubbleItem, this.layers.board, "KeyUnlockFly_" + keyCell.id, "Key unlock animation KeyBubbleItem");
    keyFx.setPosition(keyPosition.x, keyPosition.y);
    keyFx.setScale(1);
    keyFx.opacity = 255;
    keyFx.zIndex = 120;
    requireVisualChild(keyFx, "Icon", "KeyBubbleItem").active = false;
    requireVisualChild(keyFx, "key", "KeyBubbleItem").active = true;

    var lockFxNodes = targetCells.map(function (targetCell) {
      var targetNode = resolveKeyUnlockTargetNode(this, targetCell);
      if (targetNode) {
        targetNode.opacity = 0;
      }

      var lockPosition = BoardLayout.getCellPosition(targetCell.row, targetCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
      var lockFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.lockingBubbleItem, this.layers.board, "LockUnlockFx_" + targetCell.id, "Key unlock animation LockingBubbleItem");
      lockFx.setPosition(lockPosition.x, lockPosition.y);
      lockFx.setScale(1);
      lockFx.opacity = 255;
      lockFx.zIndex = 110;
      this._applyBoardBubbleVisualCached(lockFx, {
        entityType: "locked",
        lockedColor: targetCell.color
      }, BOARD_BUBBLE_SIZE);
      return {
        targetNode: targetNode,
        lockFx: lockFx,
        lockNode: requireVisualChild(lockFx, "lock", "LockingBubbleItem")
      };
    }, this);

    var cleanup = function () {
      if (keyFx && keyFx.isValid) {
        keyFx.removeFromParent(true);
      }
      lockFxNodes.forEach(function (entry) {
        if (entry.targetNode && entry.targetNode.isValid) {
          entry.targetNode.opacity = 255;
        }
        if (entry.lockFx && entry.lockFx.isValid) {
          entry.lockFx.removeFromParent(true);
        }
      });
    };

    var shakeLocks = function () {
      var remaining = lockFxNodes.length;
      var markDone = function () {
        remaining -= 1;
        if (remaining <= 0) {
          cleanup();
        }
      };

      lockFxNodes.forEach(function (entry) {
        var lockNode = entry.lockNode;
        lockNode.stopAllActions();
        var baseX = lockNode.x;
        var baseY = lockNode.y;
        cc.tween(lockNode)
          .to(lockShakeStep, { x: baseX - lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX - lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX, y: baseY, opacity: 0 })
          .call(markDone)
          .start();
      });
    };

    var flyState = { progress: 0 };
    cc.tween(flyState)
      .to(flyDuration, {
        progress: 1
      }, {
        progress: function (start, end, current, ratio) {
          var linearProgress = start + (end - start) * ratio;
          applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, linearProgress, arcHeight);
          return linearProgress;
        }
      })
      .call(function () {
        applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, 1, arcHeight);
        cc.tween(keyFx)
          .to(keyShrinkDuration, {
            scale: 0.35,
            opacity: 0
          }, {
            easing: "quadIn"
          })
          .call(shakeLocks)
          .start();
      })
      .start();
  }, this);
};

LevelRenderer.prototype._playSplitterSpawnAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var spawnedCells = resolution && Array.isArray(resolution.spawnedBySplitters) ? resolution.spawnedBySplitters : [];
  if (!spawnedCells.length) {
    return;
  }

  if (!this.splitterSpawnAnimatedEntryKeys || typeof this.splitterSpawnAnimatedEntryKeys !== "object") {
    throw new Error("Splitter spawn animated entry keys map is required.");
  }

  var pendingSpawnCells = spawnedCells.filter(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    return !this.splitterSpawnAnimatedEntryKeys[entryKey];
  }, this);
  if (!pendingSpawnCells.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Splitter spawn animation requires board snapshot.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Splitter spawn animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = Math.max(0.2, Number(SPLITTER_SPAWN_FLY_DURATION) || 0.36);
  var bezierArc = Math.max(36, Number(SPLITTER_SPAWN_BEZIER_ARC) || 96);

  pendingSpawnCells.forEach(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    if (typeof spawnedCell.sourceSplitterId !== "string" && typeof spawnedCell.sourceSplitterId !== "number") {
      throw new Error("Splitter spawn animation requires sourceSplitterId.");
    }
    if (!Number.isInteger(spawnedCell.sourceSplitterRow) || !Number.isInteger(spawnedCell.sourceSplitterCol)) {
      throw new Error("Splitter spawn animation requires source splitter coordinates.");
    }
    if (!Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
      throw new Error("Splitter spawn animation requires spawned cell coordinates.");
    }
    if (typeof spawnedCell.color !== "string" || !spawnedCell.color) {
      throw new Error("Splitter spawn animation requires spawned cell color.");
    }

    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    this.splitterSpawnAnimatedEntryKeys[entryKey] = true;

    var targetNode = resolveSplitterSpawnTargetNode(this, spawnedCell);
    if (!targetNode || !targetNode.isValid) {
      throw new Error("Splitter spawn animation target node missing: " + spawnedCell.id);
    }

    this._hideSplitterSpawnTarget(spawnedCell.id);

    var startPosition = BoardLayout.getCellPosition(
      spawnedCell.sourceSplitterRow,
      spawnedCell.sourceSplitterCol,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    var endPosition = BoardLayout.getCellPosition(
      spawnedCell.row,
      spawnedCell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );

    var fxNode = new cc.Node("SplitterSpawnFx_" + spawnedCell.id);
    fxNode.parent = this.layers.board;
    fxNode.zIndex = (targetNode.zIndex || 0) + 2;
    fxNode.setPosition(startPosition.x, startPosition.y);
    fxNode.setScale(0.82);
    fxNode.opacity = 255;
    this._applyBallVisualCached(fxNode, {
      color: spawnedCell.color
    }, BOARD_BUBBLE_SIZE);

    var finishFx = function () {
      if (fxNode && fxNode.isValid) {
        fxNode.removeFromParent(true);
      }
      this._revealSplitterSpawnTarget(spawnedCell.id);
    }.bind(this);

    var startX = startPosition.x;
    var startY = startPosition.y;
    var endX = endPosition.x;
    var endY = endPosition.y;
    var controlY = Math.max(startY, endY) + bezierArc;
    var controlX = (startX + endX) * 0.5;

    fxNode.stopAllActions();
    if (
      fxNode.runAction &&
      typeof cc.bezierTo === "function" &&
      typeof cc.sequence === "function" &&
      typeof cc.callFunc === "function" &&
      typeof cc.v2 === "function"
    ) {
      var bezier = [
        cc.v2(controlX, controlY),
        cc.v2(controlX, controlY),
        cc.v2(endX, endY)
      ];
      fxNode.runAction(cc.sequence(
        cc.bezierTo(flyDuration, bezier),
        cc.callFunc(finishFx)
      ));
      return;
    }

    if (typeof cc.tween !== "function") {
      finishFx();
      return;
    }

    cc.tween(fxNode)
      .to(flyDuration, {
        x: endX,
        y: endY,
        scale: 1
      }, {
        easing: "sineOut"
      })
      .call(finishFx)
      .start();
  }, this);
};
}

module.exports = attachLevelRendererSceneKeySplitterFxMethods;
