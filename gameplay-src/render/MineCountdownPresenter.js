"use strict";

var BoardLayout = require("../../assets/scripts/config/BoardLayout");

var MINE_COUNTDOWN_LABEL_NODE_NAME = "MineCountdown";
var MINE_COUNTDOWN_LABEL_Z_INDEX = 110;
var MINE_COUNTDOWN_LABEL_SIZE = { width: 36, height: 34 };
var MINE_COUNTDOWN_FONT_SIZE = 3;
var MINE_COUNTDOWN_LINE_HEIGHT = 40;
var MINE_ANIMATION_FRAME_DIRECTORY = "mines";
var MINE_ANIMATION_FRAME_COUNT = 10;
var MINE_IDLE_FRAME_SWITCH_INTERVAL = 0.5;
var MINE_EXPLOSION_FIRST_FRAME_INDEX = 2;
var MINE_EXPLOSION_FRAME_INTERVAL = 0.08;

function buildMineFrameName(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MINE_ANIMATION_FRAME_COUNT) {
    throw new Error("Mine animation frame index is out of range: " + index + ".");
  }
  return "frame_" + String(index).padStart(2, "0");
}

function normalizeMineAnimationFrames(frames) {
  if (!Array.isArray(frames) || frames.length !== MINE_ANIMATION_FRAME_COUNT) {
    throw new Error("Mine animation requires exactly " + MINE_ANIMATION_FRAME_COUNT + " SpriteFrames.");
  }
  var framesByName = {};
  frames.forEach(function (frame, index) {
    if (!frame || frame.isValid !== true) {
      throw new Error("Mine animation SpriteFrame is invalid at index " + index + ".");
    }
    if (typeof frame.name !== "string" || !frame.name) {
      throw new Error("Mine animation SpriteFrame requires a non-empty name at index " + index + ".");
    }
    if (framesByName[frame.name]) {
      throw new Error("Mine animation SpriteFrame name is duplicated: " + frame.name + ".");
    }
    framesByName[frame.name] = frame;
  });
  var normalized = [];
  for (var index = 0; index < MINE_ANIMATION_FRAME_COUNT; index += 1) {
    var frameName = buildMineFrameName(index);
    if (!framesByName[frameName]) {
      throw new Error("Mine animation SpriteFrame is missing: " + frameName + ".");
    }
    normalized.push(framesByName[frameName]);
  }
  return normalized;
}

function requireMineAnimationFrames(renderer) {
  if (!renderer || typeof renderer !== "object") {
    throw new Error("Mine animation requires renderer.");
  }
  return normalizeMineAnimationFrames(renderer.mineAnimationFrames);
}

function requireMineIconNode(node, ownerName) {
  if (!node || !node.isValid) {
    throw new Error(ownerName + " requires valid node.");
  }
  var iconNode = node.getChildByName("Icon");
  if (!iconNode || !iconNode.isValid) {
    throw new Error(ownerName + " requires BubbleItem Icon child.");
  }
  return iconNode;
}

function resolveMineSpriteTarget(node, ownerName) {
  var spriteTarget = requireMineIconNode(node, ownerName);
  var sprite = spriteTarget.getComponent(cc.Sprite);
  if (!sprite || !sprite.node || !sprite.node.isValid) {
    throw new Error(ownerName + " requires cc.Sprite target.");
  }
  return {
    node: spriteTarget,
    sprite: sprite
  };
}

function stopMineIdleAnimation(node) {
  var spriteTarget = requireMineIconNode(node, "Mine idle cleanup");
  if (spriteTarget.__mineIdleAnimationActive !== true) {
    return;
  }
  if (typeof spriteTarget.stopAllActions !== "function") {
    throw new Error("Mine idle cleanup requires node.stopAllActions.");
  }
  spriteTarget.stopAllActions();
  spriteTarget.__mineIdleAnimationActive = false;
}

function requireMineAnimationActionApis(ownerName) {
  if (
    typeof cc === "undefined" ||
    !cc ||
    typeof cc.delayTime !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.repeatForever !== "function"
  ) {
    throw new Error(ownerName + " requires Cocos action APIs.");
  }
}

function setRequiredMineSpriteFrame(sprite, frame, ownerName) {
  if (!sprite || !sprite.node || !sprite.node.isValid || !frame || frame.isValid !== true) {
    throw new Error(ownerName + " encountered invalid Sprite or SpriteFrame.");
  }
  sprite.spriteFrame = frame;
}

function syncMineIdleAnimation(renderer, node, cell) {
  var isMine = !!(
    cell &&
    cell.entityCategory === "hazard_ball" &&
    cell.entityType === "mine"
  );
  if (!isMine) {
    stopMineIdleAnimation(node);
    return;
  }

  var target = resolveMineSpriteTarget(node, "Mine idle animation");
  var frames = requireMineAnimationFrames(renderer);
  var currentFrame = target.sprite.spriteFrame;
  if (
    target.node.__mineIdleAnimationActive === true &&
    (currentFrame === frames[0] || currentFrame === frames[1])
  ) {
    return;
  }

  stopMineIdleAnimation(node);
  requireMineAnimationActionApis("Mine idle animation");
  target.node.setContentSize(BoardLayout.bubbleDiameter, BoardLayout.bubbleDiameter);
  target.sprite.trim = false;
  target.sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  setRequiredMineSpriteFrame(target.sprite, frames[0], "Mine idle animation");
  target.node.__mineIdleAnimationActive = true;
  target.node.runAction(cc.repeatForever(cc.sequence(
    cc.delayTime(MINE_IDLE_FRAME_SWITCH_INTERVAL),
    cc.callFunc(function () {
      setRequiredMineSpriteFrame(target.sprite, frames[1], "Mine idle animation");
    }),
    cc.delayTime(MINE_IDLE_FRAME_SWITCH_INTERVAL),
    cc.callFunc(function () {
      setRequiredMineSpriteFrame(target.sprite, frames[0], "Mine idle animation");
    })
  )));
}

function requireMineFrameOriginalSize(frame, ownerName) {
  if (!frame || typeof frame.getOriginalSize !== "function") {
    throw new Error(ownerName + " requires SpriteFrame.getOriginalSize.");
  }
  var size = frame.getOriginalSize();
  if (!size || !Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error(ownerName + " requires positive SpriteFrame size.");
  }
  return size;
}

function playMineExplosionFrameSequence(renderer, nodeName, position) {
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Mine explosion animation requires node name.");
  }
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("Mine explosion animation requires finite position.");
  }
  if (!renderer || !renderer.layers || !renderer.layers.board || !renderer.layers.board.isValid) {
    throw new Error("Mine explosion animation requires board layer.");
  }
  requireMineAnimationActionApis("Mine explosion animation");
  if (typeof cc.Node !== "function" || typeof cc.Sprite !== "function") {
    throw new Error("Mine explosion animation requires Cocos Node and Sprite.");
  }

  var frames = requireMineAnimationFrames(renderer).slice(MINE_EXPLOSION_FIRST_FRAME_INDEX);
  if (!frames.length) {
    throw new Error("Mine explosion animation requires explosion frames.");
  }
  var fxNode = new cc.Node(nodeName);
  fxNode.parent = renderer.layers.board;
  fxNode.zIndex = 130;
  fxNode.setPosition(position.x, position.y);
  var originalSize = requireMineFrameOriginalSize(frames[0], "Mine explosion animation");
  fxNode.setContentSize(originalSize.width, originalSize.height);
  var sprite = fxNode.addComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("Mine explosion animation failed to add cc.Sprite.");
  }
  sprite.trim = false;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  setRequiredMineSpriteFrame(sprite, frames[0], "Mine explosion animation");

  var actions = [];
  frames.slice(1).forEach(function (frame) {
    actions.push(cc.delayTime(MINE_EXPLOSION_FRAME_INTERVAL));
    actions.push(cc.callFunc(function () {
      setRequiredMineSpriteFrame(sprite, frame, "Mine explosion animation");
    }));
  });
  actions.push(cc.delayTime(MINE_EXPLOSION_FRAME_INTERVAL));
  actions.push(cc.callFunc(function () {
    if (!fxNode || !fxNode.isValid) {
      throw new Error("Mine explosion animation node became invalid before completion.");
    }
    fxNode.removeFromParent(true);
  }));
  fxNode.runAction(cc.sequence.apply(cc, actions));
  return fxNode;
}

function createSyncMineCountdownLabel(deps) {
  if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
    throw new Error("Mine countdown presenter requires dependencies.");
  }
  if (typeof deps.fontResource !== "string" || !deps.fontResource) {
    throw new Error("Mine countdown presenter requires fontResource.");
  }
  if (typeof deps.ensureLabel !== "function" || typeof deps.getOrCreateChild !== "function") {
    throw new Error("Mine countdown presenter requires label helpers.");
  }

  return function syncMineCountdownLabel(renderer, node, cell) {
    if (!node || !node.isValid) {
      throw new Error("Mine countdown label requires valid board node.");
    }
    var labelNode = deps.getOrCreateChild(node, MINE_COUNTDOWN_LABEL_NODE_NAME);
    var isMine = !!(
      cell &&
      cell.entityCategory === "hazard_ball" &&
      cell.entityType === "mine"
    );
    if (!isMine) {
      labelNode.active = false;
      syncMineIdleAnimation(renderer, node, cell);
      return;
    }
    if (!Number.isInteger(cell.initialLife) || cell.initialLife <= 0) {
      throw new Error("Mine countdown rendering requires positive initialLife.");
    }
    if (!Number.isInteger(cell.life) || cell.life <= 0 || cell.life > cell.initialLife) {
      throw new Error("Mine countdown rendering requires life in [1, initialLife].");
    }
    if (typeof cell.countdownStarted !== "boolean") {
      throw new Error("Mine countdown rendering requires countdownStarted boolean.");
    }
    if (!renderer.mineCountdownBitmapFont) {
      throw new Error("Mine countdown font was not preloaded: " + deps.fontResource);
    }
    syncMineIdleAnimation(renderer, node, cell);
    labelNode.active = true;
    labelNode.setPosition(0, 0);
    labelNode.setContentSize(MINE_COUNTDOWN_LABEL_SIZE);
    labelNode.zIndex = MINE_COUNTDOWN_LABEL_Z_INDEX;
    labelNode.color = cc.Color.WHITE;
    var label = deps.ensureLabel(
      labelNode,
      String(cell.life),
      MINE_COUNTDOWN_FONT_SIZE,
      MINE_COUNTDOWN_LINE_HEIGHT
    );
    label.useSystemFont = false;
    label.font = renderer.mineCountdownBitmapFont;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.TOP;
    label.overflow = cc.Label.Overflow.SHRINK;
  };
}

module.exports = {
  MINE_ANIMATION_FRAME_COUNT: MINE_ANIMATION_FRAME_COUNT,
  MINE_ANIMATION_FRAME_DIRECTORY: MINE_ANIMATION_FRAME_DIRECTORY,
  createSyncMineCountdownLabel: createSyncMineCountdownLabel,
  MINE_COUNTDOWN_FONT_SIZE: MINE_COUNTDOWN_FONT_SIZE,
  MINE_COUNTDOWN_LINE_HEIGHT: MINE_COUNTDOWN_LINE_HEIGHT,
  MINE_EXPLOSION_FIRST_FRAME_INDEX: MINE_EXPLOSION_FIRST_FRAME_INDEX,
  MINE_EXPLOSION_FRAME_INTERVAL: MINE_EXPLOSION_FRAME_INTERVAL,
  MINE_IDLE_FRAME_SWITCH_INTERVAL: MINE_IDLE_FRAME_SWITCH_INTERVAL,
  normalizeMineAnimationFrames: normalizeMineAnimationFrames,
  playMineExplosionFrameSequence: playMineExplosionFrameSequence,
  stopMineIdleAnimation: stopMineIdleAnimation
};
