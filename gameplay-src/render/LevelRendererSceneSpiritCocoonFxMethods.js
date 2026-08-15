"use strict";

function attachLevelRendererSceneSpiritCocoonFxMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var SpecialAnimationTiming = context.SpecialAnimationTiming;
  var ensureSprite = context.ensureSprite;
  var getOrCreateChild = context.getOrCreateChild;
  var MIST_OVERLAY_NODE_NAME = "SpiritMistOverlay";

  function requireCachedFrame(renderer, path, ownerName) {
    var frame = renderer.spriteFrameCache[path];
    if (!frame) {
      throw new Error(ownerName + " SpriteFrame was not preloaded: " + path);
    }
    return frame;
  }

  function resolveVisualNode(node, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " requires valid node.");
    }
    var icon = node.getChildByName("Icon");
    return icon && icon.isValid ? icon : node;
  }

  function setNodeSpriteFrame(renderer, node, path, ownerName) {
    var visualNode = resolveVisualNode(node, ownerName);
    ensureSprite(visualNode, requireCachedFrame(renderer, path, ownerName));
    visualNode.setContentSize(BOARD_BUBBLE_SIZE);
    visualNode.active = true;
    node.active = true;
  }

  function collectTraversalTargets(renderer, entries, ownerName) {
    if (!Array.isArray(entries)) {
      throw new Error(ownerName + " requires traversal array.");
    }
    return entries.map(function (entry) {
      if (!entry || !Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
        throw new Error(ownerName + " entry requires board coordinates.");
      }
      var targetNode = renderer.boardBubbleNodes[String(entry.id)];
      if (!targetNode || !targetNode.isValid) {
        throw new Error(ownerName + " cannot find board node: " + entry.id);
      }
      return {
        entry: entry,
        node: targetNode,
        x: targetNode.x,
        y: targetNode.y
      };
    });
  }

  LevelRenderer.prototype._setSpiritMistOverlayVisible = function (boardNode, visible) {
    var visualNode = resolveVisualNode(boardNode, "Spirit mist overlay");
    var overlayNode = getOrCreateChild(visualNode, MIST_OVERLAY_NODE_NAME);
    overlayNode.stopAllActions();
    overlayNode.setPosition(0, 0);
    overlayNode.setContentSize(BOARD_BUBBLE_SIZE);
    overlayNode.zIndex = 80;
    overlayNode.opacity = 255;
    overlayNode.active = visible === true;
    if (visible === true) {
      ensureSprite(
        overlayNode,
        requireCachedFrame(this, BALL_RESOURCES.SPIRIT_MIST, "Spirit mist overlay")
      );
    }
  };

  LevelRenderer.prototype._syncSpiritMistOverlay = function (boardNode, cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Spirit mist overlay sync requires board cell.");
    }
    if (cell.entityCategory !== "normal_ball") {
      this._setSpiritMistOverlayVisible(boardNode, false);
      return;
    }
    var expiry = cell.spiritMistExpiresAfterShot;
    if (expiry !== null && (!Number.isInteger(expiry) || expiry < 0)) {
      throw new Error("spiritMistExpiresAfterShot must be null or a non-negative integer.");
    }
    this._setSpiritMistOverlayVisible(boardNode, expiry !== null);
  };

  LevelRenderer.prototype._playSpiritCocoonAnimations = function (runtimeSnapshot) {
    var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution;
    if (!resolution || !Array.isArray(resolution.spiritCocoonOpenings)) {
      throw new Error("Spirit cocoon animation requires lastResolution.spiritCocoonOpenings.");
    }
    if (!this.spiritCocoonAnimatedIds || typeof this.spiritCocoonAnimatedIds !== "object") {
      throw new Error("LevelRenderer spiritCocoonAnimatedIds must be initialized.");
    }
    resolution.spiritCocoonOpenings.forEach(function (opening) {
      if (!opening || typeof opening.id !== "string" || !opening.id) {
        throw new Error("Spirit cocoon opening animation requires id.");
      }
      if (this.spiritCocoonAnimatedIds[opening.id]) {
        return;
      }
      if (!Array.isArray(opening.mistTraversal) ||
          !Array.isArray(opening.gluttonyTraversal) ||
          !Array.isArray(opening.rainbowTraversal)) {
        throw new Error("Spirit cocoon animation requires all traversal arrays.");
      }
      var cocoonNode = this.boardBubbleNodes[String(opening.cocoonId)];
      if (!cocoonNode || !cocoonNode.isValid) {
        throw new Error("Spirit cocoon animation cannot find cocoon node: " + opening.cocoonId);
      }
      var outcomeResourceKey = {
        mist: "MIST_SPRITE",
        gluttony: "GLUTTONY_SPRITE",
        rainbow: "RAINBOW_SPRITE"
      }[opening.outcome];
      if (!outcomeResourceKey) {
        throw new Error("Unsupported spirit cocoon animation outcome: " + opening.outcome);
      }
      if (
        (opening.outcome === "gluttony" || opening.outcome === "rainbow") &&
        opening.direction !== "left" &&
        opening.direction !== "right"
      ) {
        throw new Error("Spirit cocoon row animation requires left or right direction.");
      }
      var mistTraversalMoveCount = opening.mistTraversal.length;
      var rowTraversal = opening.outcome === "gluttony"
        ? opening.gluttonyTraversal
        : (opening.outcome === "rainbow" ? opening.rainbowTraversal : []);
      var expectedDuration = SpecialAnimationTiming.spiritCocoon.totalDuration +
        mistTraversalMoveCount * SpecialAnimationTiming.spiritCocoon.mistTraversalStepDuration +
        rowTraversal.length * SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration;
      if (typeof opening.duration !== "number" || Math.abs(opening.duration - expectedDuration) > 0.000001) {
        throw new Error("Spirit cocoon animation duration does not match timing contract.");
      }

      var renderer = this;
      var mistTargets = collectTraversalTargets(this, opening.mistTraversal, "Spirit cocoon mist traversal");
      var rowTargets = collectTraversalTargets(this, rowTraversal, "Spirit cocoon row traversal");
      var fxLayer = this.layers.board;
      if (!fxLayer || !fxLayer.isValid) {
        throw new Error("Spirit cocoon animation requires board layer.");
      }
      var fxNode = new cc.Node("SpiritCocoonFx_" + opening.id);
      fxNode.parent = fxLayer;
      fxNode.setPosition(cocoonNode.x, cocoonNode.y);
      fxNode.setContentSize(BOARD_BUBBLE_SIZE);
      fxNode.zIndex = 120;
      fxNode.opacity = 0;
      fxNode.scaleX = opening.direction === "right" ? -1 : 1;
      fxNode.scaleY = 1;

      var actions = [];
      for (var frameIndex = 1; frameIndex <= SpecialAnimationTiming.spiritCocoon.frameCount; frameIndex += 1) {
        (function (resourceKey) {
          actions.push(cc.callFunc(function () {
            setNodeSpriteFrame(renderer, cocoonNode, BALL_RESOURCES[resourceKey], "Spirit cocoon frame");
          }));
        }("COCOON_" + frameIndex));
        actions.push(cc.delayTime(SpecialAnimationTiming.spiritCocoon.frameDuration));
      }
      actions.push(cc.callFunc(function () {
        setNodeSpriteFrame(renderer, fxNode, BALL_RESOURCES[outcomeResourceKey], "Spirit cocoon outcome");
        fxNode.opacity = 255;
        if (!cocoonNode || !cocoonNode.isValid) {
          throw new Error("Spirit cocoon node disappeared before outcome reveal.");
        }
        cocoonNode.active = false;
      }));
      actions.push(cc.delayTime(SpecialAnimationTiming.spiritCocoon.revealDuration));

      mistTargets.forEach(function (target) {
        actions.push(cc.moveTo(
          SpecialAnimationTiming.spiritCocoon.mistTraversalStepDuration,
          target.x,
          target.y
        ));
        actions.push(cc.callFunc(function () {
          renderer._setSpiritMistOverlayVisible(target.node, true);
        }));
      });
      rowTargets.forEach(function (target) {
        actions.push(cc.moveTo(
          SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration,
          target.x,
          target.y
        ));
      });
      actions.push(cc.callFunc(function () {
        if (fxNode && fxNode.isValid) {
          fxNode.destroy();
        }
      }));
      this.spiritCocoonAnimatedIds[opening.id] = true;
      cocoonNode.stopAllActions();
      fxNode.runAction(cc.sequence.apply(null, actions));
    }, this);
  };
}

module.exports = attachLevelRendererSceneSpiritCocoonFxMethods;
