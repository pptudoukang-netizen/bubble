"use strict";

function attachLevelRendererScenePowerupFeedbackMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOARD_BUBBLE_SIZE = context.BOARD_BUBBLE_SIZE;
  var POWERUP_LOAD_ANIMATION_CONFIG = context.POWERUP_LOAD_ANIMATION_CONFIG;
  var POWERUP_LOAD_BEZIER_ARC = context.POWERUP_LOAD_BEZIER_ARC;
  var POWERUP_LOAD_END_SCALE = context.POWERUP_LOAD_END_SCALE;
  var POWERUP_LOAD_FLY_DURATION = context.POWERUP_LOAD_FLY_DURATION;
  var POWERUP_LOAD_FX_Z_INDEX = context.POWERUP_LOAD_FX_Z_INDEX;
  var POWERUP_LOAD_START_SCALE = context.POWERUP_LOAD_START_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE = context.SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE;
  var SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION = context.SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION;
  var SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION = context.SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION;
  var SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION = context.SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION;
  var SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION = context.SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION;
  var SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION = context.SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION;
  var SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING = context.SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING;
  var SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON = context.SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON;
  var SNOW_REMOVAL_FX_SIZE = context.SNOW_REMOVAL_FX_SIZE;
  var SNOW_REMOVAL_FX_SWEEP_DISTANCE = context.SNOW_REMOVAL_FX_SWEEP_DISTANCE;
  var SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION = context.SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION;
  var SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION = context.SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION;
  var SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION = context.SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION;
  var SNOW_REMOVAL_FX_Z_INDEX = context.SNOW_REMOVAL_FX_Z_INDEX;
  var attachLevelRendererScenePowerupFeedbackMethods = context.attachLevelRendererScenePowerupFeedbackMethods;
  var ensureSprite = context.ensureSprite;
  var requireChildNode = context.requireChildNode;

LevelRenderer.prototype._requireSkillPowerupCollectedFeedbackNodes = function (entityType) {
  var config = POWERUP_LOAD_ANIMATION_CONFIG[entityType];
  if (!config) {
    throw new Error("Unsupported collected skill powerup feedback type: " + entityType);
  }
  if (!this.layers || !this.layers.hud) {
    throw new Error("Collected skill powerup feedback requires HUD layer.");
  }

  var panelNode = requireChildNode(this.layers.hud, "BttomPanel", "HUD layer");
  var scrollNode = requireChildNode(panelNode, "props_scroll", "BttomPanel");
  var viewNode = requireChildNode(scrollNode, "view", "BttomPanel/props_scroll");
  var contentNode = requireChildNode(viewNode, "content", "BttomPanel/props_scroll/view");
  var buttonNode = requireChildNode(
    contentNode,
    config.buttonNodeName,
    "BttomPanel/props_scroll/view/content"
  );
  var badgeNode = requireChildNode(
    buttonNode,
    "num_bg",
    "BttomPanel/props_scroll/view/content/" + config.buttonNodeName
  );
  if (!buttonNode.active || !badgeNode.active) {
    throw new Error("Collected skill powerup feedback requires visible inventory nodes: " + entityType);
  }

  return {
    scrollNode: scrollNode,
    viewNode: viewNode,
    contentNode: contentNode,
    buttonNode: buttonNode,
    badgeNode: badgeNode
  };
};

LevelRenderer.prototype._revealSkillPowerupCollectedFeedbackButton = function (nodes) {
  var scrollView = nodes.scrollNode.getComponent(cc.ScrollView);
  if (!scrollView) {
    throw new Error("Collected skill powerup feedback requires cc.ScrollView.");
  }
  if (typeof scrollView.stopAutoScroll !== "function") {
    throw new Error("Collected skill powerup feedback requires ScrollView.stopAutoScroll.");
  }
  if (typeof nodes.buttonNode.getBoundingBoxToWorld !== "function" ||
      typeof nodes.viewNode.getBoundingBoxToWorld !== "function") {
    throw new Error("Collected skill powerup feedback requires world bounding boxes.");
  }

  scrollView.stopAutoScroll();
  var buttonRect = nodes.buttonNode.getBoundingBoxToWorld();
  var viewRect = nodes.viewNode.getBoundingBoxToWorld();
  var rectValues = [buttonRect.xMin, buttonRect.xMax, viewRect.xMin, viewRect.xMax];
  rectValues.forEach(function (value) {
    if (!Number.isFinite(value)) {
      throw new Error("Collected skill powerup feedback requires finite world bounds.");
    }
  });

  var leftLimit = viewRect.xMin + SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING;
  var rightLimit = viewRect.xMax - SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING;
  var deltaWorldX = 0;
  if (buttonRect.xMin < leftLimit) {
    deltaWorldX = leftLimit - buttonRect.xMin;
  } else if (buttonRect.xMax > rightLimit) {
    deltaWorldX = rightLimit - buttonRect.xMax;
  } else {
    return;
  }

  var contentParent = nodes.contentNode.parent;
  if (!contentParent || !contentParent.isValid || typeof contentParent.convertToNodeSpaceAR !== "function") {
    throw new Error("Collected skill powerup feedback requires valid content parent transform.");
  }
  var localOrigin = contentParent.convertToNodeSpaceAR(cc.v2(0, 0));
  var localShift = contentParent.convertToNodeSpaceAR(cc.v2(deltaWorldX, 0));
  var deltaLocalX = localShift.x - localOrigin.x;
  if (!Number.isFinite(deltaLocalX)) {
    throw new Error("Collected skill powerup feedback scroll delta must be finite.");
  }
  nodes.contentNode.setPosition(nodes.contentNode.x + deltaLocalX, nodes.contentNode.y);

  buttonRect = nodes.buttonNode.getBoundingBoxToWorld();
  viewRect = nodes.viewNode.getBoundingBoxToWorld();
  var leftOverflow = viewRect.xMin - buttonRect.xMin;
  var rightOverflow = buttonRect.xMax - viewRect.xMax;
  if (!Number.isFinite(leftOverflow) || !Number.isFinite(rightOverflow)) {
    throw new Error("Collected skill powerup feedback post-scroll bounds must be finite.");
  }
  if (
    leftOverflow > SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON ||
    rightOverflow > SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON
  ) {
    throw new Error(
      "Collected skill powerup feedback button failed to enter the visible scroll area: leftOverflow=" +
      leftOverflow + ", rightOverflow=" + rightOverflow
    );
  }
};

LevelRenderer.prototype._playNextSkillPowerupCollectedFeedback = function () {
  if (this.skillPowerupCollectedFeedbackActive === true) {
    return;
  }
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be an array.");
  }
  if (!this.skillPowerupCollectedFeedbackQueue.length) {
    return;
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Collected skill powerup feedback requires cc.tween.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Collected skill powerup feedback requires cc.Tween.stopAllByTarget.");
  }

  var entityType = this.skillPowerupCollectedFeedbackQueue.shift();
  var nodes = this._requireSkillPowerupCollectedFeedbackNodes(entityType);
  this._revealSkillPowerupCollectedFeedbackButton(nodes);

  var buttonBaseScaleX = nodes.buttonNode.scaleX;
  var buttonBaseScaleY = nodes.buttonNode.scaleY;
  var buttonBaseAngle = nodes.buttonNode.angle;
  var badgeBaseScaleX = nodes.badgeNode.scaleX;
  var badgeBaseScaleY = nodes.badgeNode.scaleY;
  var transformValues = [
    buttonBaseScaleX,
    buttonBaseScaleY,
    buttonBaseAngle,
    badgeBaseScaleX,
    badgeBaseScaleY
  ];
  transformValues.forEach(function (value) {
    if (!Number.isFinite(value)) {
      throw new Error("Collected skill powerup feedback requires finite node transforms.");
    }
  });

  cc.Tween.stopAllByTarget(nodes.buttonNode);
  cc.Tween.stopAllByTarget(nodes.badgeNode);
  this.skillPowerupCollectedFeedbackActive = true;
  var activeState = {
    buttonNode: nodes.buttonNode,
    badgeNode: nodes.badgeNode,
    buttonBaseScaleX: buttonBaseScaleX,
    buttonBaseScaleY: buttonBaseScaleY,
    buttonBaseAngle: buttonBaseAngle,
    badgeBaseScaleX: badgeBaseScaleX,
    badgeBaseScaleY: badgeBaseScaleY
  };
  this.skillPowerupCollectedFeedbackActiveState = activeState;
  var renderer = this;

  cc.tween(nodes.badgeNode)
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE
    }, {
      easing: "backOut"
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION, {
      scaleX: badgeBaseScaleX,
      scaleY: badgeBaseScaleY
    })
    .start();

  cc.tween(nodes.buttonNode)
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE,
      angle: buttonBaseAngle - 7
    }, {
      easing: "backOut"
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE,
      angle: buttonBaseAngle + 5
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE,
      angle: buttonBaseAngle - 3
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION, {
      scaleX: buttonBaseScaleX,
      scaleY: buttonBaseScaleY,
      angle: buttonBaseAngle
    })
    .delay(SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION)
    .call(function () {
      if (renderer.skillPowerupCollectedFeedbackActiveState !== activeState) {
        throw new Error("Collected skill powerup feedback active state changed during playback.");
      }
      nodes.buttonNode.setScale(buttonBaseScaleX, buttonBaseScaleY);
      nodes.buttonNode.angle = buttonBaseAngle;
      nodes.badgeNode.setScale(badgeBaseScaleX, badgeBaseScaleY);
      renderer.skillPowerupCollectedFeedbackActive = false;
      renderer.skillPowerupCollectedFeedbackActiveState = null;
      renderer._playNextSkillPowerupCollectedFeedback();
    })
    .start();
};

LevelRenderer.prototype._cancelSkillPowerupCollectedFeedback = function () {
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be initialized before cleanup.");
  }
  this.skillPowerupCollectedFeedbackQueue.length = 0;

  if (this.skillPowerupCollectedFeedbackActive !== true) {
    if (this.skillPowerupCollectedFeedbackActiveState !== null) {
      throw new Error("Inactive collected skill powerup feedback cannot keep active state.");
    }
    return;
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Collected skill powerup feedback cleanup requires cc.Tween.stopAllByTarget.");
  }

  var activeState = this.skillPowerupCollectedFeedbackActiveState;
  if (!activeState || typeof activeState !== "object" || Array.isArray(activeState)) {
    throw new Error("Active collected skill powerup feedback requires active state.");
  }
  if (!activeState.buttonNode || !activeState.buttonNode.isValid ||
      !activeState.badgeNode || !activeState.badgeNode.isValid) {
    throw new Error("Collected skill powerup feedback cleanup requires valid animated nodes.");
  }

  cc.Tween.stopAllByTarget(activeState.buttonNode);
  cc.Tween.stopAllByTarget(activeState.badgeNode);
  activeState.buttonNode.setScale(activeState.buttonBaseScaleX, activeState.buttonBaseScaleY);
  activeState.buttonNode.angle = activeState.buttonBaseAngle;
  activeState.badgeNode.setScale(activeState.badgeBaseScaleX, activeState.badgeBaseScaleY);
  this.skillPowerupCollectedFeedbackActive = false;
  this.skillPowerupCollectedFeedbackActiveState = null;
};

LevelRenderer.prototype._queueSkillPowerupCollectedFeedback = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object" || Array.isArray(runtimeSnapshot)) {
    throw new Error("Collected skill powerup feedback requires runtime snapshot.");
  }
  if (!Array.isArray(runtimeSnapshot.runtimeEvents)) {
    throw new Error("Collected skill powerup feedback requires runtimeEvents array.");
  }
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be initialized.");
  }
  if (!Number.isInteger(this.lastSkillPowerupCollectedEventId) || this.lastSkillPowerupCollectedEventId < -1) {
    throw new Error("Collected skill powerup feedback event id state is invalid.");
  }

  runtimeSnapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "skill_powerup_collected") {
      return;
    }
    if (!Number.isInteger(event.id) || event.id <= 0) {
      throw new Error("skill_powerup_collected event requires a positive integer id.");
    }
    if (event.id <= this.lastSkillPowerupCollectedEventId) {
      return;
    }
    if (!POWERUP_LOAD_ANIMATION_CONFIG[event.entityType]) {
      throw new Error("skill_powerup_collected event has unsupported entityType: " + event.entityType);
    }
    if (!Number.isInteger(event.total) || event.total <= 0) {
      throw new Error("skill_powerup_collected event requires a positive integer total.");
    }

    this.lastSkillPowerupCollectedEventId = event.id;
    this.skillPowerupCollectedFeedbackQueue.push(event.entityType);
  }, this);

  this._playNextSkillPowerupCollectedFeedback();
};

LevelRenderer.prototype.isPowerupLoadAnimationInProgress = function () {
  return this.powerupLoadAnimationInProgress === true;
};

LevelRenderer.prototype.playPowerupLoadAnimation = function (entityType) {
  if (typeof entityType !== "string" || !POWERUP_LOAD_ANIMATION_CONFIG[entityType]) {
    throw new Error("Unsupported powerup load animation type: " + entityType);
  }
  if (this.powerupLoadAnimationInProgress === true) {
    throw new Error("Powerup load animation cannot overlap.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Powerup load animation requires cc.tween.");
  }
  if (!BOARD_BUBBLE_SIZE || !Number.isFinite(BOARD_BUBBLE_SIZE.width) || !Number.isFinite(BOARD_BUBBLE_SIZE.height) ||
      BOARD_BUBBLE_SIZE.width <= 0 || BOARD_BUBBLE_SIZE.height <= 0) {
    throw new Error("Powerup load animation requires valid BOARD_BUBBLE_SIZE.");
  }

  var config = POWERUP_LOAD_ANIMATION_CONFIG[entityType];
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Powerup load animation requires GameView.");
  }

  var bottomPanelNode = this.layers && this.layers.hud
    ? this.layers.hud.getChildByName("BttomPanel")
    : null;
  var propsScrollNode = requireChildNode(bottomPanelNode, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var buttonNode = requireChildNode(propsContentNode, config.buttonNodeName, "BttomPanel/props_scroll/view/content");
  var iconNode = requireChildNode(buttonNode, "icon", "BttomPanel/props_scroll/view/content/" + config.buttonNodeName);
  var startPosition = this._convertNodePositionToGameView(iconNode);

  var shooterPanel = this.layers && this.layers.shooter
    ? this.layers.shooter.getChildByName("ShooterPanel")
    : null;
  if (!shooterPanel || !shooterPanel.isValid) {
    throw new Error("Powerup load animation requires ShooterPanel.");
  }
  var currentBallAnchor = requireChildNode(shooterPanel, "CurrentBallAnchor", "ShooterPanel");
  var endPosition = this._convertNodePositionToGameView(currentBallAnchor);

  var spritePath = BALL_RESOURCES[config.spriteCode];
  if (!spritePath) {
    throw new Error("Powerup load animation sprite path missing: " + config.spriteCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Powerup load animation sprite frame is missing: " + spritePath);
  }

  var fxNode = new cc.Node("powerup_load_fx_" + entityType);
  fxNode.parent = gameViewNode;
  fxNode.zIndex = POWERUP_LOAD_FX_Z_INDEX;
  fxNode.opacity = 255;
  fxNode.scale = POWERUP_LOAD_START_SCALE;
  fxNode.setPosition(startPosition);
  fxNode.setContentSize(BOARD_BUBBLE_SIZE.width, BOARD_BUBBLE_SIZE.height);
  ensureSprite(fxNode, spriteFrame);

  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  var arc = Math.max(POWERUP_LOAD_BEZIER_ARC, Math.abs(deltaY) * 0.28);
  var bezierPoints = [
    cc.v2(startPosition.x + deltaX * 0.28, startPosition.y + deltaY * 0.2 + arc),
    cc.v2(startPosition.x + deltaX * 0.72, startPosition.y + deltaY * 0.78 + arc),
    cc.v2(endPosition.x, endPosition.y)
  ];
  var renderer = this;
  this.powerupLoadAnimationInProgress = true;

  return new Promise(function (resolve) {
    cc.tween(fxNode)
      .parallel(
        cc.tween().bezierTo(
          POWERUP_LOAD_FLY_DURATION,
          bezierPoints[0],
          bezierPoints[1],
          bezierPoints[2]
        ),
        cc.tween().to(POWERUP_LOAD_FLY_DURATION, {
          scale: POWERUP_LOAD_END_SCALE
        }, {
          easing: "quadOut"
        })
      )
      .to(0.08, {
        scale: 0.35,
        opacity: 0
      }, {
        easing: "quadIn"
      })
      .call(function () {
        if (fxNode && fxNode.isValid) {
          fxNode.destroy();
        }
        renderer.powerupLoadAnimationInProgress = false;
        resolve();
      })
      .start();
  });
};

LevelRenderer.prototype.playSnowRemovalAnimation = function () {
  if (typeof cc.tween !== "function") {
    throw new Error("Snow removal animation requires cc.tween.");
  }
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Snow removal animation requires GameView.");
  }
  var bottomPanelNode = this.layers && this.layers.hud
    ? this.layers.hud.getChildByName("BttomPanel")
    : null;
  var propsScrollNode = requireChildNode(bottomPanelNode, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var snowButtonNode = requireChildNode(propsContentNode, "snow_removal_btn", "BttomPanel/props_scroll/view/content");
  var iconNode = requireChildNode(snowButtonNode, "icon", "BttomPanel/props_scroll/view/content/snow_removal_btn");
  var startPosition = this._convertNodePositionToGameView(iconNode);
  var spritePath = BALL_RESOURCES.SNOW_REMOVAL_TOOLS;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Snow removal tool sprite frame is missing: " + spritePath);
  }

  var fxNode = new cc.Node("snow_removal_tool_fx");
  fxNode.parent = gameViewNode;
  fxNode.zIndex = SNOW_REMOVAL_FX_Z_INDEX;
  fxNode.setPosition(startPosition);
  fxNode.setContentSize(SNOW_REMOVAL_FX_SIZE, SNOW_REMOVAL_FX_SIZE);
  fxNode.scale = 0.72;
  fxNode.opacity = 255;
  var sprite = ensureSprite(fxNode, spriteFrame);
  if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.CUSTOM === undefined) {
    throw new Error("Snow removal animation requires cc.Sprite.SizeMode.CUSTOM.");
  }
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

  return new Promise(function (resolve) {
    cc.tween(fxNode)
      .to(0.28, {
        x: 0,
        y: 0,
        scale: 1.12
      }, {
        easing: "quadOut"
      })
      .call(function () {
        fxNode.angle = 45;
      })
      .to(SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION, {
        x: -SNOW_REMOVAL_FX_SWEEP_DISTANCE
      })
      .to(SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION, {
        x: SNOW_REMOVAL_FX_SWEEP_DISTANCE
      })
      .to(SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION, {
        x: 0
      })
      .to(0.12, {
        opacity: 0
      })
      .call(function () {
        if (fxNode && fxNode.isValid) {
          fxNode.destroy();
        }
        resolve();
      })
      .start();
  });
};
}

module.exports = attachLevelRendererScenePowerupFeedbackMethods;
