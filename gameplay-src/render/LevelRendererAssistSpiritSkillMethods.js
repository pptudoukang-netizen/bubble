"use strict";

var AssistSpiritSkillConfig = require("../config/AssistSpiritSkillConfig");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");

var TORNADO_BREATH_CYCLE_COUNT = 3;
var TORNADO_BREATH_MIN_SCALE_X = 0.9;
var TORNADO_BREATH_MAX_SCALE_X = 1.1;

function requireFinitePoint(point, description) {
  if (
    !point ||
    typeof point.x !== "number" ||
    !isFinite(point.x) ||
    typeof point.y !== "number" ||
    !isFinite(point.y)
  ) {
    throw new Error(description + " requires a finite point.");
  }
  return point;
}

function requirePositiveDuration(value, description) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new Error(description + " requires a positive duration.");
  }
  return value;
}

function createEffectNode(renderer, path, name) {
  if (!renderer.layers || !renderer.layers.shatter || !renderer.layers.shatter.isValid) {
    throw new Error("Assist spirit skill effect requires shatter layer.");
  }
  var spriteFrame = renderer.spriteFrameCache[path];
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Assist spirit skill SpriteFrame is missing: " + path);
  }
  var node = new cc.Node(name);
  node.parent = renderer.layers.shatter;
  node.zIndex = 120;
  var sprite = node.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.RAW;
  node.setContentSize(spriteFrame.getOriginalSize());
  return node;
}

function runActionPromise(node, action) {
  return new Promise(function (resolve) {
    node.runAction(cc.sequence(
      action,
      cc.callFunc(function () {
        if (node && node.isValid) {
          node.destroy();
        }
        resolve();
      })
    ));
  });
}

function playPulse(renderer, path, name, duration, position) {
  var node = createEffectNode(renderer, path, name);
  node.setPosition(position.x, position.y);
  node.opacity = 0;
  node.setScale(0.45);
  var halfDuration = duration * 0.5;
  return runActionPromise(node, cc.sequence(
    cc.spawn(
      cc.scaleTo(halfDuration, 1.18),
      cc.fadeTo(halfDuration, 255)
    ),
    cc.spawn(
      cc.scaleTo(halfDuration, 1.45),
      cc.fadeTo(halfDuration, 0)
    )
  ));
}

function resolveEffectCenter(renderer, plan) {
  if (!renderer.lastRuntimeSnapshot || !renderer.lastRuntimeSnapshot.board) {
    throw new Error("Assist spirit skill effect requires current board snapshot.");
  }
  var board = renderer.lastRuntimeSnapshot.board;
  if (!Array.isArray(plan.targets) || !plan.targets.length) {
    if (
      plan.skillId === "tornado" &&
      plan.path &&
      plan.path.start &&
      plan.path.control1 &&
      plan.path.control2 &&
      plan.path.end
    ) {
      var start = requireFinitePoint(plan.path.start, "Assist spirit tornado center start");
      var control1 = requireFinitePoint(plan.path.control1, "Assist spirit tornado center control1");
      var control2 = requireFinitePoint(plan.path.control2, "Assist spirit tornado center control2");
      var end = requireFinitePoint(plan.path.end, "Assist spirit tornado center end");
      return {
        x: (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8,
        y: (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8
      };
    }
    throw new Error("Assist spirit skill effect requires targets.");
  }
  var total = plan.targets.reduce(function (sum, target) {
    var position = renderer.lastRuntimeSnapshot.board.cells.find(function (cell) {
      return cell && String(cell.id) === String(target.id);
    });
    if (!position) {
      throw new Error("Assist spirit skill effect target is missing from board snapshot: " + target.id);
    }
    var boardPosition = BoardLayout.getCellPosition(
      position.row,
      position.col,
      board.maxColumns,
      board.viewportOffsetY
    );
    sum.x += boardPosition.x;
    sum.y += boardPosition.y;
    return sum;
  }, { x: 0, y: 0 });
  return {
    x: total.x / plan.targets.length,
    y: total.y / plan.targets.length
  };
}

function attachLevelRendererAssistSpiritSkillMethods(LevelRenderer) {
  LevelRenderer.prototype.playAssistSpiritSkillEffect = function (plan, onSkillEffectStarted) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan) || plan.accepted !== true) {
      throw new Error("Assist spirit skill effect requires an accepted preview plan.");
    }
    if (typeof plan.requestedSpiritId !== "string" || typeof plan.skillId !== "string") {
      throw new Error("Assist spirit skill effect requires spirit and skill ids.");
    }
    if (typeof onSkillEffectStarted !== "function") {
      throw new Error("Assist spirit skill effect requires onSkillEffectStarted callback.");
    }

    var playResolvedEffect = function () {
      onSkillEffectStarted(plan.skillId);
      var skillConfig = AssistSpiritSkillConfig.getBySkillId(plan.skillId);
      if (plan.skillId === "lightning_chain") {
        return this.playLightningChainEffect({
          chainId: [
            "assist",
            plan.requestedSpiritId,
            plan.targets.map(function (target) {
              return target.id;
            }).join("_")
          ].join("_"),
          hitPoints: plan.targets
        });
      }
      if (plan.skillId === "tornado") {
        if (!plan.path || typeof plan.effectPath !== "string" || !plan.effectPath) {
          throw new Error("Assist spirit tornado preview requires path and effectPath.");
        }
        var tornadoNode = createEffectNode(this, plan.effectPath, "AssistSpiritTornado");
        var start = requireFinitePoint(plan.path.start, "Assist spirit tornado start");
        var control1 = requireFinitePoint(plan.path.control1, "Assist spirit tornado control1");
        var control2 = requireFinitePoint(plan.path.control2, "Assist spirit tornado control2");
        var end = requireFinitePoint(plan.path.end, "Assist spirit tornado end");
        var tornadoDuration = requirePositiveDuration(plan.effectDuration, "Assist spirit tornado");
        var tornadoBreathHalfDuration = tornadoDuration / (TORNADO_BREATH_CYCLE_COUNT * 2);
        if (typeof cc.bezierTo !== "function") {
          throw new Error("Assist spirit tornado requires cc.bezierTo.");
        }
        tornadoNode.setPosition(start.x, start.y);
        return runActionPromise(tornadoNode, cc.spawn(
          cc.bezierTo(tornadoDuration, [
            cc.v2(control1.x, control1.y),
            cc.v2(control2.x, control2.y),
            cc.v2(end.x, end.y)
          ]),
          cc.repeat(
            cc.sequence(
              cc.scaleTo(tornadoBreathHalfDuration, TORNADO_BREATH_MAX_SCALE_X, 1),
              cc.scaleTo(tornadoBreathHalfDuration, TORNADO_BREATH_MIN_SCALE_X, 1)
            ),
            TORNADO_BREATH_CYCLE_COUNT
          )
        ));
      }
      return playPulse(
        this,
        skillConfig.iconPath,
        "AssistSpiritSkill_" + plan.skillId,
        requirePositiveDuration(plan.effectDuration, "Assist spirit skill pulse"),
        resolveEffectCenter(this, plan)
      );
    }.bind(this);

    if (plan.requestedSpiritId !== "yumi") {
      return playResolvedEffect();
    }
    var yumiConfig = AssistSpiritSkillConfig.getBySpiritId("yumi");
    return playPulse(
      this,
      yumiConfig.iconPath,
      "AssistSpiritStarlight",
      requirePositiveDuration(plan.starlightEffectDuration, "Yumi starlight"),
      resolveEffectCenter(this, plan)
    ).then(playResolvedEffect);
  };
}

module.exports = attachLevelRendererAssistSpiritSkillMethods;
