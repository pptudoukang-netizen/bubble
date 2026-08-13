"use strict";

function attachLevelRendererSceneScreenFxMethods(LevelRenderer, context) {
  var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = context.BOARD_CLEAR_FIREWORKS_INTERVAL_SEC;
  var IMPACT_DEFAULT_PUSH_DISTANCE = context.IMPACT_DEFAULT_PUSH_DISTANCE;
  var IMPACT_MIN_PUSH_DURATION = context.IMPACT_MIN_PUSH_DURATION;
  var IMPACT_MIN_RETURN_DURATION = context.IMPACT_MIN_RETURN_DURATION;
  var IMPACT_RETURN_DURATION_RATIO = context.IMPACT_RETURN_DURATION_RATIO;
  var SHOT_NO_DROP_SHAKE_OFFSET = context.SHOT_NO_DROP_SHAKE_OFFSET;
  var SHOT_NO_DROP_SHAKE_STEP_DURATION = context.SHOT_NO_DROP_SHAKE_STEP_DURATION;
  var attachLevelRendererSceneScreenFxMethods = context.attachLevelRendererSceneScreenFxMethods;
  var requireBoardClearFireworksPrefab = context.requireBoardClearFireworksPrefab;
  var requireBoardClearFireworksRootParent = context.requireBoardClearFireworksRootParent;
  var requirePositiveFiniteNumber = context.requirePositiveFiniteNumber;
  var resolveImpactBounceSpeed = context.resolveImpactBounceSpeed;
  var spawnBoardClearFireworksBurst = context.spawnBoardClearFireworksBurst;
  var stopParticleSystemIfPresent = context.stopParticleSystemIfPresent;

LevelRenderer.prototype._playShotNoDropScreenShake = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var shakeEvent = null;
  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (event && event.type === "shot_no_drop") {
      shakeEvent = event;
    }
  }

  if (!shakeEvent) {
    return;
  }
  if (typeof shakeEvent.id !== "number" || !isFinite(shakeEvent.id)) {
    throw new Error("shot_no_drop event requires a numeric id.");
  }
  if (shakeEvent.id === this.lastNoDropShakeEventId) {
    return;
  }

  this.lastNoDropShakeEventId = shakeEvent.id;
  if (!this.layers) {
    throw new Error("shot_no_drop screen shake requires renderer layers.");
  }

  var offset = Number(SHOT_NO_DROP_SHAKE_OFFSET);
  var stepDuration = Number(SHOT_NO_DROP_SHAKE_STEP_DURATION);
  if (!isFinite(offset) || offset <= 0) {
    throw new Error("shot_no_drop screen shake offset must be positive.");
  }
  if (!isFinite(stepDuration) || stepDuration <= 0) {
    throw new Error("shot_no_drop screen shake step duration must be positive.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("shot_no_drop screen shake requires Cocos actions.");
  }

  var layerNames = [
    "dangerLine",
    "jars",
    "shooter",
    "board",
    "falling",
    "jarOcclusion",
    "testGrid"
  ];
  layerNames.forEach(function (name) {
    var layer = this.layers[name];
    if (!layer || !layer.isValid) {
      throw new Error("shot_no_drop screen shake requires layer: " + name);
    }
    if (typeof layer.runAction !== "function" || typeof layer.stopAllActions !== "function") {
      throw new Error("shot_no_drop screen shake layer must support Cocos actions: " + name);
    }

    var basePosition = layer.__shotNoDropShakeBasePosition;
    if (basePosition) {
      layer.setPosition(basePosition.x, basePosition.y);
    } else {
      basePosition = {
        x: layer.x,
        y: layer.y
      };
    }
    if (
      typeof basePosition.x !== "number" ||
      typeof basePosition.y !== "number" ||
      !isFinite(basePosition.x) ||
      !isFinite(basePosition.y)
    ) {
      throw new Error("shot_no_drop screen shake layer position is invalid: " + name);
    }
    layer.__shotNoDropShakeBasePosition = basePosition;
    layer.stopAllActions();

    layer.runAction(cc.sequence(
      cc.moveTo(stepDuration, basePosition.x - offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x - offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x, basePosition.y),
      cc.callFunc(function () {
        layer.__shotNoDropShakeBasePosition = null;
      })
    ));
  }, this);
};

LevelRenderer.prototype._startBoardClearFireworks = function () {
  if (this.boardClearFireworksActive === true) {
    if (!this.boardClearFireworksRoot || !this.boardClearFireworksRoot.isValid) {
      throw new Error("Board clear fireworks active state requires valid root.");
    }
    return;
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.delayTime !== "function" ||
    typeof cc.repeatForever !== "function"
  ) {
    throw new Error("Board clear fireworks requires Cocos action APIs.");
  }
  requireBoardClearFireworksPrefab(this);
  var rootParent = requireBoardClearFireworksRootParent(this);
  var existingRoot = rootParent.getChildByName("BoardClearFireworksRoot");
  if (existingRoot && existingRoot.isValid) {
    throw new Error("Board clear fireworks root already exists.");
  }

  var intervalSec = Number(BOARD_CLEAR_FIREWORKS_INTERVAL_SEC);
  requirePositiveFiniteNumber(intervalSec, "Board clear fireworks interval");
  var root = new cc.Node("BoardClearFireworksRoot");
  root.parent = rootParent;
  root.setPosition(0, 0);
  root.zIndex = 300;
  root.active = true;
  this.boardClearFireworksRoot = root;
  this.boardClearFireworksActive = true;
  spawnBoardClearFireworksBurst(this);
  root.runAction(cc.repeatForever(cc.sequence(
    cc.delayTime(intervalSec),
    cc.callFunc(function () {
      spawnBoardClearFireworksBurst(this);
    }.bind(this))
  )));
};

LevelRenderer.prototype._stopBoardClearFireworks = function () {
  var root = this.boardClearFireworksRoot;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  if (!root || !root.isValid) {
    return;
  }
  root.stopAllActions();
  root.children.slice().forEach(function (child) {
    stopParticleSystemIfPresent(child);
  });
  root.removeFromParent(false);
  root.destroy();
};

LevelRenderer.prototype._syncBoardClearFireworks = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot.state !== "string") {
    throw new Error("Board clear fireworks requires runtime snapshot state.");
  }
  if (
    runtimeSnapshot.state === "won_pending" ||
    runtimeSnapshot.state === "won_surplus_shots_pending" ||
    runtimeSnapshot.state === "board_clear_score_recheck_surplus_shots_pending" ||
    runtimeSnapshot.state === "won_settlement_pending"
  ) {
    this._startBoardClearFireworks();
    return;
  }
  this._stopBoardClearFireworks();
};

LevelRenderer.prototype._playImpactBounce = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  if (!impact || !impact.seq || impact.seq === this.lastImpactSeq) {
    return;
  }

  this.lastImpactSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var center = impact.center || { x: 0, y: 0 };
  var pushDistance = Math.max(2, Number(impact.pushDistance) || IMPACT_DEFAULT_PUSH_DISTANCE);
  var bounceSpeed = resolveImpactBounceSpeed(impact);
  var pushDuration = Math.max(IMPACT_MIN_PUSH_DURATION, pushDistance / bounceSpeed);
  var returnDuration = Math.max(IMPACT_MIN_RETURN_DURATION, pushDuration * IMPACT_RETURN_DURATION_RATIO);
  var neighbors = Array.isArray(impact.neighbors) ? impact.neighbors : [];
  var fallingActiveCount = runtimeSnapshot && runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem
    ? Math.max(0, Number(runtimeSnapshot.systems.fallingMarbleSystem.activeDropCount) || 0)
    : 0;
  var neighborBudget = fallingActiveCount >= 36 ? 2 : (fallingActiveCount >= 18 ? 4 : neighbors.length);

  for (var index = 0; index < neighbors.length && index < neighborBudget; index += 1) {
    var neighbor = neighbors[index];
    if (!neighbor || !neighbor.id) {
      continue;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + neighbor.id);
    if (!bubbleNode) {
      continue;
    }

    var baseX = typeof neighbor.x === "number"
      ? neighbor.x
      : (typeof neighbor.position === "object" && typeof neighbor.position.x === "number"
        ? neighbor.position.x
        : bubbleNode.x);
    var baseY = typeof neighbor.y === "number"
      ? neighbor.y
      : (typeof neighbor.position === "object" && typeof neighbor.position.y === "number"
        ? neighbor.position.y
        : bubbleNode.y);
    var dirX = baseX - center.x;
    var dirY = baseY - center.y;
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.0001) {
      dirX = 0;
      dirY = 1;
      len = 1;
    }

    var pushX = baseX + dirX / len * pushDistance;
    var pushY = baseY + dirY / len * pushDistance;

    bubbleNode.stopAllActions();
    bubbleNode.x = baseX;
    bubbleNode.y = baseY;

    if (typeof cc.tween !== "function") {
      bubbleNode.x = baseX;
      bubbleNode.y = baseY;
      continue;
    }

    cc.tween(bubbleNode)
      .to(pushDuration, {
        x: pushX,
        y: pushY
      }, {
        easing: "quadOut"
      })
      .to(returnDuration, {
        x: baseX,
        y: baseY
      }, {
        easing: "quadIn"
      })
      .start();
  }
};
}

module.exports = attachLevelRendererSceneScreenFxMethods;
