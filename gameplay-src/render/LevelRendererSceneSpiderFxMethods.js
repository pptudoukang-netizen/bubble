"use strict";

function attachLevelRendererSceneSpiderFxMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var ensureSprite = context.ensureSprite;

  function requireCachedFrame(renderer, resourceKey) {
    var path = BALL_RESOURCES[resourceKey];
    if (typeof path !== "string" || !path) {
      throw new Error("Spider cocoon animation resource is missing: " + resourceKey + ".");
    }
    var frame = renderer.spriteFrameCache[path];
    if (!frame) {
      throw new Error("Spider cocoon animation SpriteFrame was not preloaded: " + path + ".");
    }
    return frame;
  }

  LevelRenderer.prototype._playSpiderCocoonBreakAnimations = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
      throw new Error("Spider cocoon animation requires runtimeEvents array.");
    }
    if (!this.spiderCocoonBreakAnimatedEventIds || typeof this.spiderCocoonBreakAnimatedEventIds !== "object") {
      throw new Error("Spider cocoon animation event state must be initialized.");
    }
    if (!this.layers || !this.layers.spiderLock || !this.layers.spiderLock.isValid) {
      throw new Error("Spider cocoon animation requires SpiderLockLayer.");
    }
    runtimeSnapshot.runtimeEvents.forEach(function (event) {
      if (!event || event.type !== "spider_cocoons_removed") {
        return;
      }
      if (!Number.isInteger(event.id) || event.id <= 0 || !Array.isArray(event.cocoons) || !event.cocoons.length) {
        throw new Error("Spider cocoon removal event is invalid.");
      }
      if (this.spiderCocoonBreakAnimatedEventIds[String(event.id)]) {
        return;
      }
      event.cocoons.forEach(function (cocoon, cocoonIndex) {
        if (
          !cocoon ||
          typeof cocoon.id !== "string" ||
          !cocoon.id ||
          !cocoon.position ||
          typeof cocoon.position.x !== "number" ||
          !isFinite(cocoon.position.x) ||
          typeof cocoon.position.y !== "number" ||
          !isFinite(cocoon.position.y)
        ) {
          throw new Error("Spider cocoon removal entry is invalid at index " + cocoonIndex + ".");
        }
        var fxNode = new cc.Node("SpiderCocoonBreak_" + event.id + "_" + cocoon.id);
        fxNode.parent = this.layers.spiderLock;
        fxNode.setPosition(cocoon.position.x, cocoon.position.y);
        fxNode.setContentSize(65, 65);
        fxNode.zIndex = 2;
        var sprite = ensureSprite(fxNode);
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

        var renderer = this;
        var actions = [];
        for (var frameIndex = 1; frameIndex <= SpecialAnimationTiming.spiderCocoon.frameCount; frameIndex += 1) {
          (function (resourceKey) {
            actions.push(cc.callFunc(function () {
              sprite.spriteFrame = requireCachedFrame(renderer, resourceKey);
            }));
          }("SPIDER_COCOON_0" + frameIndex));
          actions.push(cc.delayTime(SpecialAnimationTiming.spiderCocoon.frameDuration));
        }
        actions.push(cc.callFunc(function () {
          if (!fxNode || !fxNode.isValid) {
            throw new Error("Spider cocoon animation node became invalid before completion.");
          }
          fxNode.destroy();
        }));
        fxNode.runAction(cc.sequence.apply(null, actions));
      }, this);
      this.spiderCocoonBreakAnimatedEventIds[String(event.id)] = true;
    }, this);
  };
}

module.exports = attachLevelRendererSceneSpiderFxMethods;
