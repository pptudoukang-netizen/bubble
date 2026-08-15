"use strict";

function attachLevelRendererSceneBoardTransformFxMethods(LevelRenderer, context) {
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var BoardLayout = context.BoardLayout;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE = context.WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE;
  var WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION = context.WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION;
  var WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION = context.WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION;
  var WORMHOLE_DIRECTION_ARROW_RESOURCE = context.WORMHOLE_DIRECTION_ARROW_RESOURCE;
  var WORMHOLE_DIRECTION_ARROW_SIZE = context.WORMHOLE_DIRECTION_ARROW_SIZE;
  var WORMHOLE_DIRECTION_ARROW_STAGGER = context.WORMHOLE_DIRECTION_ARROW_STAGGER;
  var WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE = context.WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE;
  var attachLevelRendererSceneBoardTransformFxMethods = context.attachLevelRendererSceneBoardTransformFxMethods;
  var ensureSprite = context.ensureSprite;
  var requirePositiveFiniteNumber = context.requirePositiveFiniteNumber;
  var resolveBoardCellWorldPosition = context.resolveBoardCellWorldPosition;

LevelRenderer.prototype._playSwirlRotationAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.swirlRotations)) {
    throw new Error("Swirl animation requires lastResolution.swirlRotations.");
  }
  if (!resolution.swirlRotations.length) {
    return;
  }
  if (!this.swirlRotationAnimatedIds || typeof this.swirlRotationAnimatedIds !== "object") {
    throw new Error("Swirl animated id map is required.");
  }
  if (
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateBy !== "function"
  ) {
    throw new Error("Swirl animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Swirl animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Swirl animation requires finite board viewportOffsetY.");
  }

  resolution.swirlRotations.forEach(function (rotation) {
    if (!rotation || typeof rotation.id !== "string" || !rotation.id) {
      throw new Error("Swirl animation requires rotation id.");
    }
    if (this.swirlRotationAnimatedIds[rotation.id]) {
      return;
    }
    if (rotation.duration !== SpecialAnimationTiming.swirlRotation.duration) {
      throw new Error("Swirl animation duration must match SpecialAnimationTiming.");
    }
    if (rotation.angleDegrees !== 60) {
      throw new Error("Swirl animation angle must be exactly 60 degrees.");
    }
    if (!Array.isArray(rotation.moves) || !rotation.moves.length) {
      throw new Error("Swirl animation requires occupied track moves.");
    }
    this.swirlRotationAnimatedIds[rotation.id] = true;

    rotation.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Swirl animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Swirl animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = resolveBoardCellWorldPosition(
        runtimeSnapshot,
        move.fromRow,
        move.fromCol,
        "Swirl animation start"
      );
      var targetPosition = resolveBoardCellWorldPosition(
        runtimeSnapshot,
        move.toRow,
        move.toCol,
        "Swirl animation target"
      );
      bubbleNode.stopAllActions();
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.runAction(cc.moveTo(rotation.duration, targetPosition.x, targetPosition.y));
    }, this);

    if (typeof rotation.centerId !== "string" && typeof rotation.centerId !== "number") {
      throw new Error("Swirl animation requires centerId.");
    }
    var centerNode = this.boardBubbleNodes[String(rotation.centerId)];
    if (!centerNode || !centerNode.isValid) {
      throw new Error("Swirl animation center node missing: " + rotation.centerId);
    }
    centerNode.stopAllActions();
    centerNode.runAction(cc.rotateBy(rotation.duration, rotation.angleDegrees));
  }, this);
};

LevelRenderer.prototype._playWormholeShiftAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.wormholeShifts)) {
    throw new Error("Wormhole animation requires lastResolution.wormholeShifts.");
  }
  if (!resolution.wormholeShifts.length) {
    return;
  }
  if (!this.wormholeShiftAnimatedIds || typeof this.wormholeShiftAnimatedIds !== "object") {
    throw new Error("Wormhole animated id map is required.");
  }
  if (typeof cc.moveTo !== "function" || typeof cc.sequence !== "function" ||
      typeof cc.spawn !== "function" || typeof cc.callFunc !== "function" ||
      typeof cc.scaleTo !== "function" || typeof cc.fadeTo !== "function") {
    throw new Error("Wormhole animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Wormhole animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Wormhole animation requires finite board viewportOffsetY.");
  }

  resolution.wormholeShifts.forEach(function (shift) {
    if (!shift || typeof shift.id !== "string" || !shift.id) {
      throw new Error("Wormhole animation requires shift id.");
    }
    if (this.wormholeShiftAnimatedIds[shift.id]) {
      return;
    }
    if (shift.duration !== SpecialAnimationTiming.wormholeShift.duration) {
      throw new Error("Wormhole animation duration must match SpecialAnimationTiming.");
    }
    if (shift.moveDirection !== "left" && shift.moveDirection !== "right") {
      throw new Error("Wormhole animation requires left/right moveDirection.");
    }
    if (
      !Number.isInteger(shift.leftCol) ||
      !Number.isInteger(shift.rightCol) ||
      shift.rightCol - shift.leftCol < 2 ||
      !Number.isInteger(shift.slotCount) ||
      shift.slotCount !== shift.rightCol - shift.leftCol - 1
    ) {
      throw new Error("Wormhole animation requires valid strict interior channel boundaries.");
    }
    if (!Array.isArray(shift.moves)) {
      throw new Error("Wormhole animation requires moves array.");
    }
    this.wormholeShiftAnimatedIds[shift.id] = true;

    shift.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Wormhole animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Wormhole animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = BoardLayout.getCellPosition(
        move.fromRow,
        move.fromCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var targetPosition = BoardLayout.getCellPosition(
        move.toRow,
        move.toCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var isWrappedMove = shift.moveDirection === "left"
        ? move.fromCol === shift.leftCol + 1 && move.toCol === shift.rightCol - 1
        : move.fromCol === shift.rightCol - 1 && move.toCol === shift.leftCol + 1;
      if (move.wrapped !== isWrappedMove) {
        throw new Error("Wormhole animation move wrapped flag does not match strict interior boundaries.");
      }
      if (move.fromRow !== shift.row || move.toRow !== shift.row) {
        throw new Error("Wormhole animation move must stay on its pair row.");
      }
      if (!isWrappedMove) {
        var expectedStep = shift.moveDirection === "left" ? -1 : 1;
        if (move.toCol - move.fromCol !== expectedStep) {
          throw new Error("Wormhole animation move does not match moveDirection.");
        }
      }
      bubbleNode.stopAllActions();
      if (isWrappedMove) {
        var entryCol = shift.moveDirection === "right" ? shift.rightCol : shift.leftCol;
        var exitCol = shift.moveDirection === "right" ? shift.leftCol : shift.rightCol;
        var entryPosition = BoardLayout.getCellPosition(
          shift.row,
          entryCol,
          boardSnapshot.maxColumns,
          boardSnapshot.viewportOffsetY
        );
        var exitPosition = BoardLayout.getCellPosition(
          shift.row,
          exitCol,
          boardSnapshot.maxColumns,
          boardSnapshot.viewportOffsetY
        );
        bubbleNode.setPosition(startPosition.x, startPosition.y);
        bubbleNode.opacity = 255;
        bubbleNode.setScale(1);
        bubbleNode.runAction(cc.sequence(
          cc.spawn(
            cc.moveTo(SpecialAnimationTiming.wormholeShift.inhaleDuration, entryPosition.x, entryPosition.y),
            cc.scaleTo(SpecialAnimationTiming.wormholeShift.inhaleDuration, 0.08),
            cc.fadeTo(SpecialAnimationTiming.wormholeShift.inhaleDuration, 0)
          ),
          cc.callFunc(function (node, data) {
            if (!node || !node.isValid) {
              throw new Error("Wormhole wrapped bubble was destroyed between inhale and exhale.");
            }
            node.setPosition(data.x, data.y);
            node.setScale(0.08);
            node.opacity = 0;
          }, bubbleNode, { x: exitPosition.x, y: exitPosition.y }),
          cc.spawn(
            cc.moveTo(SpecialAnimationTiming.wormholeShift.exhaleDuration, targetPosition.x, targetPosition.y),
            cc.scaleTo(SpecialAnimationTiming.wormholeShift.exhaleDuration, 1),
            cc.fadeTo(SpecialAnimationTiming.wormholeShift.exhaleDuration, 255)
          )
        ));
        return;
      }
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.opacity = 255;
      bubbleNode.setScale(1);
      bubbleNode.runAction(cc.moveTo(shift.duration, targetPosition.x, targetPosition.y));
    }, this);

    [shift.leftWormholeId, shift.rightWormholeId].forEach(function (wormholeId) {
      if (typeof wormholeId !== "string" && typeof wormholeId !== "number") {
        throw new Error("Wormhole animation requires endpoint ids.");
      }
      var wormholeNode = this.boardBubbleNodes[String(wormholeId)];
      if (!wormholeNode || !wormholeNode.isValid) {
        throw new Error("Wormhole animation endpoint node missing: " + wormholeId);
      }
      if (wormholeNode.__wormholeShaderActive !== true) {
        throw new Error("Wormhole animation endpoint must keep its flow shader active: " + wormholeId);
      }
    }, this);
  }, this);
};

LevelRenderer.prototype._playWormholeProjectileAbsorptionAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.wormholeProjectileAbsorptions)) {
    throw new Error("Wormhole projectile animation requires lastResolution.wormholeProjectileAbsorptions.");
  }
  if (!resolution.wormholeProjectileAbsorptions.length) {
    return;
  }
  if (!this.wormholeProjectileAbsorptionAnimatedIds || typeof this.wormholeProjectileAbsorptionAnimatedIds !== "object") {
    throw new Error("Wormhole projectile animated id map is required.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Wormhole projectile animation requires board layer.");
  }
  if (typeof cc.Node !== "function" || typeof cc.sequence !== "function" ||
      typeof cc.spawn !== "function" || typeof cc.moveTo !== "function" ||
      typeof cc.scaleTo !== "function" || typeof cc.fadeTo !== "function" ||
      typeof cc.callFunc !== "function") {
    throw new Error("Wormhole projectile animation requires Cocos node and action APIs.");
  }
  if (!BOARD_BUBBLE_SIZE || BOARD_BUBBLE_SIZE.width <= 0 || BOARD_BUBBLE_SIZE.height <= 0) {
    throw new Error("Wormhole projectile animation requires positive board bubble size.");
  }

  resolution.wormholeProjectileAbsorptions.forEach(function (absorption) {
    if (!absorption || typeof absorption.id !== "string" || !absorption.id) {
      throw new Error("Wormhole projectile animation requires absorption id.");
    }
    if (this.wormholeProjectileAbsorptionAnimatedIds[absorption.id]) {
      return;
    }
    if (absorption.duration !== SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration) {
      throw new Error("Wormhole projectile absorption duration must match SpecialAnimationTiming.");
    }
    [absorption.startPosition, absorption.targetPosition].forEach(function (position) {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        throw new Error("Wormhole projectile animation requires finite start and target positions.");
      }
    });
    if (!absorption.ball || typeof absorption.ball !== "object" || Array.isArray(absorption.ball)) {
      throw new Error("Wormhole projectile animation requires fired ball data.");
    }
    var wormholeNode = this.boardBubbleNodes[String(absorption.wormholeId)];
    if (!wormholeNode || !wormholeNode.isValid || wormholeNode.__wormholeShaderActive !== true) {
      throw new Error("Wormhole projectile animation requires live shader endpoint: " + absorption.wormholeId);
    }

    this.wormholeProjectileAbsorptionAnimatedIds[absorption.id] = true;
    var projectileFxNode = new cc.Node("WormholeAbsorbedProjectile_" + absorption.id);
    projectileFxNode.parent = this.layers.board;
    projectileFxNode.zIndex = 1000;
    projectileFxNode.setContentSize(BOARD_BUBBLE_SIZE);
    projectileFxNode.setPosition(absorption.startPosition.x, absorption.startPosition.y);
    projectileFxNode.opacity = 255;
    projectileFxNode.setScale(1);
    this._applyBallVisualCached(projectileFxNode, absorption.ball, BOARD_BUBBLE_SIZE);
    projectileFxNode.runAction(cc.sequence(
      cc.spawn(
        cc.moveTo(absorption.duration, absorption.targetPosition.x, absorption.targetPosition.y),
        cc.scaleTo(absorption.duration, 0.05),
        cc.fadeTo(absorption.duration, 0)
      ),
      cc.callFunc(function (node) {
        if (!node || !node.isValid) {
          throw new Error("Wormhole absorbed projectile node was destroyed before animation completion.");
        }
        node.removeFromParent(true);
        node.destroy();
      }, projectileFxNode)
    ));
  }, this);
};

LevelRenderer.prototype._destroyWormholeDirectionGuide = function () {
  if (!this.wormholeDirectionGuideRoot) {
    this.lastWormholeDirectionGuideKey = "";
    return;
  }
  if (!this.wormholeDirectionGuideRoot.isValid) {
    throw new Error("Wormhole direction guide root became invalid unexpectedly.");
  }
  if (typeof this.wormholeDirectionGuideRoot.destroy !== "function") {
    throw new Error("Wormhole direction guide root requires destroy API.");
  }
  this.wormholeDirectionGuideRoot.removeFromParent(true);
  this.wormholeDirectionGuideRoot.destroy();
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
};

LevelRenderer.prototype._syncWormholeDirectionGuide = function (boardSnapshot) {
  if (!boardSnapshot || !Array.isArray(boardSnapshot.specialEntities) || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Wormhole direction guide requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Wormhole direction guide requires finite board viewportOffsetY.");
  }
  if (!this.layers || !this.layers.wormholeDirection || !this.layers.wormholeDirection.isValid) {
    throw new Error("Wormhole direction guide requires wormhole direction layer.");
  }

  var wormholes = boardSnapshot.specialEntities.filter(function (cell) {
    return !!(cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole");
  });

  if (!wormholes.length) {
    this._destroyWormholeDirectionGuide();
    return;
  }
  var wormholesByRow = {};
  wormholes.forEach(function (wormhole) {
    if (!Number.isInteger(wormhole.row) || !Number.isInteger(wormhole.col)) {
      throw new Error("Wormhole direction guide requires integer endpoint coordinates.");
    }
    if (!wormholesByRow[wormhole.row]) {
      wormholesByRow[wormhole.row] = [];
    }
    wormholesByRow[wormhole.row].push(wormhole);
  });
  var pairs = Object.keys(wormholesByRow).map(function (rowKey) {
    var pair = wormholesByRow[rowKey].sort(function (left, right) {
      return left.col - right.col;
    });
    if (pair.length !== 2) {
      throw new Error("Wormhole direction guide row " + rowKey + " requires exactly two endpoints.");
    }
    if (pair[1].col - pair[0].col < 2) {
      throw new Error("Wormhole direction guide row " + rowKey + " requires at least one interior slot.");
    }
    if ((pair[0].moveDirection !== "left" && pair[0].moveDirection !== "right") ||
        pair[0].moveDirection !== pair[1].moveDirection) {
      throw new Error("Wormhole direction guide row " + rowKey + " requires matching left/right moveDirection.");
    }
    return pair;
  }).sort(function (left, right) {
    return left[0].row - right[0].row;
  });

  var guideKey = pairs.map(function (pair) {
    return [pair[0].row, pair[0].col, pair[1].col, pair[0].moveDirection].join(":");
  }).concat([boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY]).join("|");
  if (this.lastWormholeDirectionGuideKey === guideKey) {
    if (!this.wormholeDirectionGuideRoot || !this.wormholeDirectionGuideRoot.isValid) {
      throw new Error("Wormhole direction guide key requires a valid guide root.");
    }
    return;
  }

  var arrowFrame = this.spriteFrameCache[WORMHOLE_DIRECTION_ARROW_RESOURCE];
  if (!arrowFrame || !arrowFrame.isValid) {
    throw new Error("Wormhole direction guide requires preloaded arrow SpriteFrame: " + WORMHOLE_DIRECTION_ARROW_RESOURCE);
  }
  if (!WORMHOLE_DIRECTION_ARROW_SIZE ||
      typeof WORMHOLE_DIRECTION_ARROW_SIZE.width !== "number" || WORMHOLE_DIRECTION_ARROW_SIZE.width <= 0 ||
      typeof WORMHOLE_DIRECTION_ARROW_SIZE.height !== "number" || WORMHOLE_DIRECTION_ARROW_SIZE.height <= 0) {
    throw new Error("Wormhole direction arrow size must be positive.");
  }
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE,
    "Wormhole direction arrow travel distance"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_STAGGER,
    "Wormhole direction arrow stagger"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION,
    "Wormhole direction arrow fade-in duration"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION,
    "Wormhole direction arrow fade-out duration"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE,
    "Wormhole direction arrow cycle pause"
  );
  if (typeof cc.Node !== "function" || typeof cc.sequence !== "function" ||
      typeof cc.spawn !== "function" || typeof cc.callFunc !== "function" ||
      typeof cc.delayTime !== "function" || typeof cc.moveBy !== "function" ||
      typeof cc.fadeTo !== "function" || typeof cc.scaleTo !== "function" ||
      typeof cc.repeatForever !== "function") {
    throw new Error("Wormhole direction guide requires Cocos node and action APIs.");
  }

  this._destroyWormholeDirectionGuide();

  var guideRoot = new cc.Node("WormholeDirectionGuide");
  guideRoot.parent = this.layers.wormholeDirection;
  this.wormholeDirectionGuideRoot = guideRoot;
  this.lastWormholeDirectionGuideKey = guideKey;

  pairs.forEach(function (pair, pairIndex) {
    var leftWormhole = pair[0];
    var rightWormhole = pair[1];
    var direction = leftWormhole.moveDirection;
    var interiorSlotCount = rightWormhole.col - leftWormhole.col - 1;
    var directionSign = direction === "right" ? 1 : -1;
    for (var slotIndex = 0; slotIndex < interiorSlotCount; slotIndex += 1) {
      var col = leftWormhole.col + 1 + slotIndex;
      var position = BoardLayout.getCellPosition(
        leftWormhole.row,
        col,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
    if (!position || typeof position.x !== "number" || !isFinite(position.x) ||
        typeof position.y !== "number" || !isFinite(position.y)) {
      throw new Error("Wormhole direction guide received invalid cell position.");
    }

      var arrowNode = new cc.Node("DirectionArrow_" + pairIndex + "_" + slotIndex);
    arrowNode.parent = guideRoot;
    arrowNode.setContentSize(WORMHOLE_DIRECTION_ARROW_SIZE);
    arrowNode.setPosition(position.x, position.y);
    arrowNode.angle = direction === "right" ? 0 : 180;
    arrowNode.opacity = 0;
    arrowNode.setScale(0.78);
    ensureSprite(arrowNode, arrowFrame);

    var flowOrder = direction === "right" ? slotIndex : interiorSlotCount - 1 - slotIndex;
    var initialDelay = flowOrder * WORMHOLE_DIRECTION_ARROW_STAGGER;
    var trailingDelay = (interiorSlotCount - flowOrder) * WORMHOLE_DIRECTION_ARROW_STAGGER +
      WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE;
    var baseX = position.x;
    var baseY = position.y;
      arrowNode.runAction(cc.repeatForever(cc.sequence(
      cc.callFunc(function (node, data) {
        if (!node || !node.isValid) {
          throw new Error("Wormhole direction arrow was destroyed during animation.");
        }
        node.setPosition(data.x, data.y);
        node.opacity = 0;
        node.setScale(0.78);
      }, arrowNode, { x: baseX, y: baseY }),
      cc.delayTime(initialDelay),
      cc.spawn(
        cc.moveBy(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, directionSign * WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE * 0.5, 0),
        cc.fadeTo(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, 235),
        cc.scaleTo(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, 1)
      ),
      cc.spawn(
        cc.moveBy(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, directionSign * WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE * 0.5, 0),
        cc.fadeTo(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, 0),
        cc.scaleTo(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, 0.82)
      ),
      cc.delayTime(trailingDelay)
      )));
    }
  });
};
}

module.exports = attachLevelRendererSceneBoardTransformFxMethods;
