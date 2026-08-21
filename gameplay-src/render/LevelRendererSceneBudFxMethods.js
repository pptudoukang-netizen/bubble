"use strict";

function attachLevelRendererSceneBudFxMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var ensureSprite = context.ensureSprite;

  function requireCachedFrame(renderer, path) {
    var frame = renderer.spriteFrameCache[path];
    if (!frame) {
      throw new Error("Bud hatch SpriteFrame was not preloaded: " + path);
    }
    return frame;
  }

  function resolveVisualNode(node) {
    if (!node || !node.isValid) {
      throw new Error("Bud hatch requires a valid board node.");
    }
    var icon = node.getChildByName("Icon");
    return icon && icon.isValid ? icon : node;
  }

  function setBudFrame(renderer, budNode, path) {
    var visualNode = resolveVisualNode(budNode);
    ensureSprite(visualNode, requireCachedFrame(renderer, path));
    visualNode.setContentSize(BOARD_BUBBLE_SIZE);
    visualNode.active = true;
    budNode.active = true;
  }

  LevelRenderer.prototype._playBudHatchAnimations = function (runtimeSnapshot) {
    var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution;
    if (!resolution || !Array.isArray(resolution.budHatches)) {
      throw new Error("Bud hatch animation requires lastResolution.budHatches.");
    }
    if (!this.budHatchAnimatedIds || typeof this.budHatchAnimatedIds !== "object") {
      throw new Error("LevelRenderer budHatchAnimatedIds must be initialized.");
    }
    resolution.budHatches.forEach(function (hatch) {
      if (!hatch || typeof hatch.id !== "string" || !hatch.id) {
        throw new Error("Bud hatch animation requires id.");
      }
      if (this.budHatchAnimatedIds[hatch.id]) {
        return;
      }
      if (typeof hatch.budId !== "string" || !hatch.budId) {
        throw new Error("Bud hatch animation requires budId.");
      }
      if (
        typeof hatch.duration !== "number" ||
        Math.abs(hatch.duration - SpecialAnimationTiming.bud.totalDuration) > 0.000001
      ) {
        throw new Error("Bud hatch animation duration does not match timing contract.");
      }
      var budNode = this.boardBubbleNodes[hatch.budId];
      if (!budNode || !budNode.isValid) {
        throw new Error("Bud hatch animation cannot find bud node: " + hatch.budId);
      }
      var fxLayer = this.layers.board;
      if (!fxLayer || !fxLayer.isValid) {
        throw new Error("Bud hatch animation requires board layer.");
      }
      var timerNode = new cc.Node("BudHatchFx_" + hatch.id);
      timerNode.parent = fxLayer;
      timerNode.setPosition(budNode.x, budNode.y);
      timerNode.setContentSize(BOARD_BUBBLE_SIZE);
      timerNode.zIndex = 121;

      var renderer = this;
      var actions = [];
      for (var frameIndex = 1; frameIndex <= SpecialAnimationTiming.bud.frameCount; frameIndex += 1) {
        (function (resourceKey) {
          actions.push(cc.callFunc(function () {
            setBudFrame(renderer, budNode, BALL_RESOURCES[resourceKey]);
          }));
        }("BUD_" + frameIndex));
        actions.push(cc.delayTime(SpecialAnimationTiming.bud.frameDuration));
      }
      actions.push(cc.callFunc(function () {
        if (timerNode && timerNode.isValid) {
          timerNode.destroy();
        }
      }));
      this.budHatchAnimatedIds[hatch.id] = true;
      budNode.stopAllActions();
      timerNode.runAction(cc.sequence.apply(null, actions));
    }, this);
  };
}

module.exports = attachLevelRendererSceneBudFxMethods;
