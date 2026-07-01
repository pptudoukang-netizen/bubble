"use strict";

var RenderNodeHelpers = require("../render/RenderNodeHelpers");

var POPUP_CONTENT_CONTAINER_NAME = "ContentContainer";
var POPUP_OPEN_ANIM_DURATION = 0.2;
var POPUP_OPEN_ANIM_FROM_SCALE = 0.82;

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function getWhiteSpriteFrameForSize(whiteMaskFrameCache, width, height) {
  requireObject(whiteMaskFrameCache, "PopupPresentationHelper white mask frame cache");
  var safeWidth = Math.max(1, Math.floor(width));
  var safeHeight = Math.max(1, Math.floor(height));
  var key = safeWidth + "x" + safeHeight;
  if (whiteMaskFrameCache[key]) {
    return whiteMaskFrameCache[key];
  }
  var created = RenderNodeHelpers.createSolidWhiteSpriteFrame(safeWidth, safeHeight);
  if (!created) {
    throw new Error("PopupPresentationHelper failed to create white sprite frame: " + key);
  }
  whiteMaskFrameCache[key] = created.frame;
  return created.frame;
}

function ensurePopupMaskVisible(popupNode, sizeSourceNode, opacity, whiteMaskFrameCache) {
  requireValidNode(popupNode, "PopupPresentationHelper popup node");
  var maskNode = popupNode.getChildByName("mask");
  if (!maskNode) {
    throw new Error("PopupPresentationHelper popup node requires mask child.");
  }

  var popupSize = popupNode.getContentSize();
  if (sizeSourceNode && sizeSourceNode.isValid && typeof sizeSourceNode.getContentSize === "function") {
    var rootSize = sizeSourceNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      popupSize = rootSize;
      popupNode.setContentSize(rootSize);
    }
  }

  var maskFrame = getWhiteSpriteFrameForSize(whiteMaskFrameCache, popupSize.width, popupSize.height);
  RenderNodeHelpers.ensureSprite(maskNode, maskFrame);
  maskNode.setContentSize(popupSize);
  maskNode.active = true;
  maskNode.color = cc.color(0, 0, 0);
  maskNode.opacity = typeof opacity === "number" ? opacity : 100;
  maskNode.zIndex = -10;
}

function ensurePopupContentContainer(popupNode) {
  requireValidNode(popupNode, "PopupPresentationHelper popup node");

  var container = popupNode.getChildByName(POPUP_CONTENT_CONTAINER_NAME);
  if (!container) {
    container = new cc.Node(POPUP_CONTENT_CONTAINER_NAME);
    container.parent = popupNode;
    container.setPosition(0, 0);
    container.zIndex = 0;
  }

  var popupSize = popupNode.getContentSize();
  if (popupSize && popupSize.width > 0 && popupSize.height > 0) {
    container.setContentSize(popupSize);
  }

  popupNode.children.slice().forEach(function (child) {
    if (!child || child === container || child.name === "mask") {
      return;
    }

    var localPos = child.getPosition();
    var childScaleX = child.scaleX;
    var childScaleY = child.scaleY;
    var childAngle = child.angle;
    var childZIndex = child.zIndex;

    child.parent = container;
    child.setPosition(localPos);
    child.scaleX = childScaleX;
    child.scaleY = childScaleY;
    child.angle = childAngle;
    child.zIndex = childZIndex;
  });

  container.scale = 1;
  container.opacity = 255;
  return container;
}

function playPopupContentOpenAnimation(container, options) {
  requireValidNode(container, "PopupPresentationHelper popup content container");
  options = options || {};
  var duration = typeof options.duration === "number" ? options.duration : POPUP_OPEN_ANIM_DURATION;
  var fromScale = typeof options.fromScale === "number" ? options.fromScale : POPUP_OPEN_ANIM_FROM_SCALE;
  var easing = typeof options.easing === "string" && options.easing ? options.easing : "backOut";

  container.stopAllActions();
  container.opacity = 0;
  container.scale = fromScale;

  if (typeof cc.tween !== "function") {
    container.opacity = 255;
    container.scale = 1;
    return;
  }

  cc.tween(container)
    .to(duration, {
      opacity: 255,
      scale: 1
    }, { easing: easing })
    .start();
}

module.exports = {
  POPUP_CONTENT_CONTAINER_NAME: POPUP_CONTENT_CONTAINER_NAME,
  ensurePopupMaskVisible: ensurePopupMaskVisible,
  ensurePopupContentContainer: ensurePopupContentContainer,
  playPopupContentOpenAnimation: playPopupContentOpenAnimation
};
