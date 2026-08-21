"use strict";

function attachLevelRendererSceneBlackHoleMethods(LevelRenderer, context) {
  var SpecialAnimationTiming = context.SpecialAnimationTiming;

  function requireBlackHoleTiming() {
    var timing = SpecialAnimationTiming.blackHole;
    if (
      !timing ||
      typeof timing.unsupportedDisappearDuration !== "number" ||
      !Number.isFinite(timing.unsupportedDisappearDuration) ||
      timing.unsupportedDisappearDuration <= 0
    ) {
      throw new Error("SpecialAnimationTiming.blackHole.unsupportedDisappearDuration must be positive.");
    }
    return timing;
  }

  function recycleDetachedBoardNode(renderer, node) {
    if (!node || !node.isValid) {
      throw new Error("Black-hole unsupported disappearance requires valid completed node.");
    }
    if (typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error("Black-hole unsupported disappearance node requires prefab path.");
    }
    if (!renderer.boardBubbleNodePool || typeof renderer.boardBubbleNodePool !== "object") {
      throw new Error("Black-hole unsupported disappearance requires board node pool.");
    }
    if (!Array.isArray(renderer.boardBubbleNodePool[node.__bubblePrefabPath])) {
      renderer.boardBubbleNodePool[node.__bubblePrefabPath] = [];
    }
    node.active = false;
    node.removeFromParent(false);
    node.setScale(1);
    renderer.boardBubbleNodePool[node.__bubblePrefabPath].push(node);
  }

  LevelRenderer.prototype._playBlackHoleUnsupportedDisappearAnimations = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.lastResolution) {
      throw new Error("Black-hole unsupported disappearance requires runtime lastResolution.");
    }
    var entries = runtimeSnapshot.lastResolution.blackHoleUnsupportedDisappears;
    if (!Array.isArray(entries)) {
      throw new Error("Black-hole unsupported disappearance requires lastResolution.blackHoleUnsupportedDisappears.");
    }
    if (!this.blackHoleUnsupportedDisappearAnimatedIds ||
        typeof this.blackHoleUnsupportedDisappearAnimatedIds !== "object" ||
        Array.isArray(this.blackHoleUnsupportedDisappearAnimatedIds)) {
      throw new Error("Black-hole unsupported disappearance animation registry is invalid.");
    }
    var timing = requireBlackHoleTiming();

    entries.forEach(function (entry) {
      if (!entry || typeof entry.id !== "string" || !entry.id) {
        throw new Error("Black-hole unsupported disappearance requires entry id.");
      }
      if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
        throw new Error("Black-hole unsupported disappearance requires integer coordinates.");
      }
      if (entry.duration !== timing.unsupportedDisappearDuration) {
        throw new Error("Black-hole unsupported disappearance duration must match SpecialAnimationTiming.");
      }
      if (this.blackHoleUnsupportedDisappearAnimatedIds[entry.id] === true) {
        return;
      }

      var node = this.boardBubbleNodes[entry.id];
      if (!node || !node.isValid) {
        throw new Error("Black-hole unsupported disappearance requires live board node: " + entry.id);
      }
      this.blackHoleUnsupportedDisappearAnimatedIds[entry.id] = true;
      delete this.boardBubbleNodes[entry.id];
      delete this.boardCellRenderKeys[entry.id];
      node.stopAllActions();
      node.runAction(cc.sequence(
        cc.scaleTo(entry.duration, 0),
        cc.callFunc(function () {
          recycleDetachedBoardNode(this, node);
        }.bind(this))
      ));
    }, this);
  };
}

module.exports = attachLevelRendererSceneBlackHoleMethods;
