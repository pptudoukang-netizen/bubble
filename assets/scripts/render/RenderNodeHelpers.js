"use strict";

var BundleLoader = require("../utils/BundleLoader");

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load sprite frame `" + path + "`: " + error.message));
        return;
      }

      resolve(asset);
    });
  });
}

function createSolidWhiteSpriteFrame(width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var texture = new cc.Texture2D();
  var pixels = new Uint8Array(safeWidth * safeHeight * 4);
  pixels.fill(255);

  var pixelFormat = cc.Texture2D.PixelFormat.RGBA8888;
  var ok = texture.initWithData(pixels, pixelFormat, safeWidth, safeHeight);

  if (!ok) {
    return null;
  }

  return {
    texture: texture,
    frame: new cc.SpriteFrame(texture),
    width: safeWidth,
    height: safeHeight
  };
}

function ensureSprite(node, spriteFrame) {
  var sprite = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  return sprite;
}

function ensureLabel(node, text, fontSize, lineHeight, align) {
  var label = node.getComponent(cc.Label) || node.addComponent(cc.Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = lineHeight || Math.round(fontSize * 1.2);
  label.horizontalAlign = align || cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = cc.Label.Overflow.SHRINK;
  return label;
}

function ensureOutline(node, color, width) {
  var outline = node.getComponent(cc.LabelOutline) || node.addComponent(cc.LabelOutline);
  outline.color = color;
  outline.width = width;
  return outline;
}

function clearChildren(node) {
  if (!node) {
    return;
  }

  node.removeAllChildren();
}

function getOrCreateChild(parent, name) {
  var node = parent.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = parent;
  }

  return node;
}

module.exports = {
  loadSpriteFrame: loadSpriteFrame,
  createSolidWhiteSpriteFrame: createSolidWhiteSpriteFrame,
  ensureSprite: ensureSprite,
  ensureLabel: ensureLabel,
  ensureOutline: ensureOutline,
  clearChildren: clearChildren,
  getOrCreateChild: getOrCreateChild
};
