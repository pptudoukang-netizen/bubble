"use strict";

function attachLevelRendererSceneBlackHoleMethods(LevelRenderer, context) {
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;

  function requireBlackHoleTiming() {
    var timing = SpecialAnimationTiming.blackHole;
    if (
      !timing ||
      typeof timing.projectileAbsorbDuration !== "number" ||
      !Number.isFinite(timing.projectileAbsorbDuration) ||
      timing.projectileAbsorbDuration <= 0 ||
      typeof timing.unsupportedDisappearDuration !== "number" ||
      !Number.isFinite(timing.unsupportedDisappearDuration) ||
      timing.unsupportedDisappearDuration <= 0
    ) {
      throw new Error("SpecialAnimationTiming.blackHole durations must be positive.");
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

  LevelRenderer.prototype._playBlackHoleProjectileAbsorptionAnimations = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.lastResolution) {
      throw new Error("Black-hole projectile absorption requires runtime lastResolution.");
    }
    var entries = runtimeSnapshot.lastResolution.blackHoleProjectileAbsorptions;
    if (!Array.isArray(entries)) {
      throw new Error("Black-hole projectile absorption requires lastResolution.blackHoleProjectileAbsorptions.");
    }
    if (entries.length === 0) {
      return;
    }
    if (!this.blackHoleProjectileAbsorptionAnimatedIds ||
        typeof this.blackHoleProjectileAbsorptionAnimatedIds !== "object" ||
        Array.isArray(this.blackHoleProjectileAbsorptionAnimatedIds)) {
      throw new Error("Black-hole projectile absorption animation registry is invalid.");
    }
    if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
      throw new Error("Black-hole projectile absorption requires board layer.");
    }
    if (!BOARD_BUBBLE_SIZE || BOARD_BUBBLE_SIZE.width <= 0 || BOARD_BUBBLE_SIZE.height <= 0) {
      throw new Error("Black-hole projectile absorption requires positive board bubble size.");
    }
    if (typeof cc.Node !== "function" || typeof cc.sequence !== "function" ||
        typeof cc.spawn !== "function" || typeof cc.moveTo !== "function" ||
        typeof cc.scaleTo !== "function" || typeof cc.fadeTo !== "function" ||
        typeof cc.callFunc !== "function") {
      throw new Error("Black-hole projectile absorption requires Cocos node and action APIs.");
    }
    var timing = requireBlackHoleTiming();

    entries.forEach(function (entry) {
      if (!entry || typeof entry.id !== "string" || !entry.id) {
        throw new Error("Black-hole projectile absorption requires entry id.");
      }
      if (this.blackHoleProjectileAbsorptionAnimatedIds[entry.id] === true) {
        return;
      }
      if (typeof entry.blackHoleId !== "string" || !entry.blackHoleId) {
        throw new Error("Black-hole projectile absorption requires blackHoleId.");
      }
      if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
        throw new Error("Black-hole projectile absorption requires integer coordinates.");
      }
      if (entry.duration !== timing.projectileAbsorbDuration) {
        throw new Error("Black-hole projectile absorption duration must match SpecialAnimationTiming.");
      }
      [entry.startPosition, entry.targetPosition].forEach(function (position) {
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
          throw new Error("Black-hole projectile absorption requires finite start and target positions.");
        }
      });
      if (!entry.ball || typeof entry.ball !== "object" || Array.isArray(entry.ball)) {
        throw new Error("Black-hole projectile absorption requires fired ball data.");
      }
      var blackHoleNode = this.boardBubbleNodes[entry.blackHoleId];
      if (!blackHoleNode || !blackHoleNode.isValid) {
        throw new Error("Black-hole projectile absorption requires live black-hole node: " + entry.blackHoleId);
      }

      this.blackHoleProjectileAbsorptionAnimatedIds[entry.id] = true;
      var projectileNode = new cc.Node("BlackHoleAbsorbedProjectile_" + entry.id);
      projectileNode.parent = this.layers.board;
      projectileNode.zIndex = 1000;
      projectileNode.setContentSize(BOARD_BUBBLE_SIZE);
      projectileNode.setPosition(entry.startPosition.x, entry.startPosition.y);
      projectileNode.opacity = 255;
      projectileNode.setScale(1);
      this._applyBallVisualCached(projectileNode, entry.ball, BOARD_BUBBLE_SIZE);
      projectileNode.runAction(cc.sequence(
        cc.spawn(
          cc.moveTo(entry.duration, entry.targetPosition.x, entry.targetPosition.y),
          cc.scaleTo(entry.duration, 0.05),
          cc.fadeTo(entry.duration, 0)
        ),
        cc.callFunc(function (node) {
          if (!node || !node.isValid) {
            throw new Error("Black-hole absorbed projectile node was destroyed before animation completion.");
          }
          node.removeFromParent(true);
          node.destroy();
        }, projectileNode)
      ));
    }, this);
  };

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
