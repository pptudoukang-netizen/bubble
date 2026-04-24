"use strict";

var PANEL_WIDTH = 645;
var PANEL_HEIGHT = 1008;
var MAX_VISIBLE_ROWS = 8;
var ROW_WIDTH = 540;
var ROW_HEIGHT = 92;
var ROW_GAP = 18;
var ROW_START_Y = 264;

var TEXT = {
  title: "\u597d\u53cb\u6392\u884c\u699c",
  scoreSuffix: "\u5206",
  levelPrefix: "\u901a\u5173 ",
  levelSuffix: "\u5173",
  empty: "\u6682\u65e0\u6392\u884c\u6570\u636e"
};

function bindTapOnce(node, onTap) {
  if (!node || !node.isValid || node.__rankingTapBound === true) {
    return;
  }

  node.__rankingTapBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 0.96;
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
    if (typeof onTap === "function") {
      onTap();
    }
  });
}

function bindCloseAreaOnce(node, onTap) {
  if (!node || !node.isValid || node.__rankingCloseAreaBound === true) {
    return;
  }

  node.__rankingCloseAreaBound = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    if (typeof onTap === "function") {
      onTap();
    }
  });
}

function createLabel(parentNode, name, options) {
  options = options || {};
  var node = new cc.Node(name);
  node.parent = parentNode;
  node.setContentSize(Number(options.width) || 160, Number(options.height) || 40);
  node.setPosition(Number(options.x) || 0, Number(options.y) || 0);
  node.color = options.color || cc.color(255, 255, 255);

  var label = node.addComponent(cc.Label);
  label.string = String(options.text || "");
  label.fontSize = Math.max(12, Math.floor(Number(options.fontSize) || 28));
  label.lineHeight = Math.max(label.fontSize + 2, Math.floor(Number(options.lineHeight) || (label.fontSize + 4)));
  label.horizontalAlign = options.align || cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = options.overflow || cc.Label.Overflow.SHRINK;

  if (options.outlineWidth) {
    var outline = node.addComponent(cc.LabelOutline);
    outline.color = options.outlineColor || cc.color(88, 28, 145);
    outline.width = Math.max(1, Math.floor(Number(options.outlineWidth) || 1));
  }

  return {
    node: node,
    label: label
  };
}

function drawRoundedRect(node, width, height, fillColor, strokeColor, lineWidth, radius) {
  var graphics = node.addComponent(cc.Graphics);
  graphics.clear();
  graphics.fillColor = fillColor;
  graphics.roundRect(-(width * 0.5), -(height * 0.5), width, height, radius);
  graphics.fill();
  if (strokeColor && lineWidth > 0) {
    graphics.strokeColor = strokeColor;
    graphics.lineWidth = lineWidth;
    graphics.roundRect(-(width * 0.5), -(height * 0.5), width, height, radius);
    graphics.stroke();
  }
  return graphics;
}

function createRootNode(parentNode) {
  var root = new cc.Node("RankingView");
  root.parent = parentNode || null;
  root.zIndex = 330;
  root.setPosition(0, 0);
  root.setContentSize(720, 1280);
  root.addComponent(cc.BlockInputEvents);

  var mask = new cc.Node("Mask");
  mask.parent = root;
  mask.setContentSize(720, 1280);
  mask.setPosition(0, 0);
  var maskGraphics = mask.addComponent(cc.Graphics);
  maskGraphics.clear();
  maskGraphics.fillColor = cc.color(16, 7, 40, 150);
  maskGraphics.rect(-360, -640, 720, 1280);
  maskGraphics.fill();

  var panel = new cc.Node("Panel");
  panel.parent = root;
  panel.setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
  panel.setPosition(0, -14);
  panel.addComponent(cc.Sprite);

  var title = createLabel(panel, "TitleLabel", {
    text: TEXT.title,
    y: 430,
    width: 440,
    height: 70,
    fontSize: 42,
    lineHeight: 48,
    color: cc.color(255, 226, 255),
    outlineWidth: 4,
    outlineColor: cc.color(105, 34, 172)
  });
  title.node.zIndex = 10;

  var closeButton = new cc.Node("CloseButton");
  closeButton.parent = panel;
  closeButton.zIndex = 20;
  closeButton.setContentSize(82, 82);
  closeButton.setPosition(286, 414);
  drawRoundedRect(closeButton, 82, 82, cc.color(181, 91, 238, 255), cc.color(255, 206, 255, 255), 5, 41);
  createLabel(closeButton, "CloseLabel", {
    text: "X",
    width: 68,
    height: 68,
    fontSize: 44,
    lineHeight: 48,
    color: cc.color(255, 237, 255),
    outlineWidth: 3,
    outlineColor: cc.color(93, 31, 145)
  });

  var list = new cc.Node("RankList");
  list.parent = panel;
  list.zIndex = 10;
  list.setContentSize(ROW_WIDTH, MAX_VISIBLE_ROWS * (ROW_HEIGHT + ROW_GAP));
  list.setPosition(0, 0);

  root.__rankingNodes = {
    mask: mask,
    panel: panel,
    list: list,
    closeButton: closeButton
  };

  return root;
}

function getRankColors(rank, isSelf) {
  if (isSelf) {
    return {
      fill: cc.color(94, 46, 154, 238),
      stroke: cc.color(255, 220, 112, 255),
      medal: cc.color(255, 211, 84, 255)
    };
  }
  if (rank === 1) {
    return {
      fill: cc.color(120, 54, 134, 238),
      stroke: cc.color(255, 214, 115, 255),
      medal: cc.color(255, 190, 42, 255)
    };
  }
  if (rank === 2) {
    return {
      fill: cc.color(76, 70, 164, 230),
      stroke: cc.color(197, 224, 255, 255),
      medal: cc.color(149, 190, 255, 255)
    };
  }
  if (rank === 3) {
    return {
      fill: cc.color(111, 60, 116, 230),
      stroke: cc.color(255, 172, 102, 255),
      medal: cc.color(226, 126, 58, 255)
    };
  }
  return {
    fill: cc.color(68, 43, 138, 215),
    stroke: cc.color(185, 126, 255, 210),
    medal: cc.color(146, 104, 232, 255)
  };
}

function createRankRow(parentNode, entry, index) {
  var rank = Math.max(1, Math.floor(Number(entry.rank) || (index + 1)));
  var colors = getRankColors(rank, entry.isSelf === true);
  var row = new cc.Node("RankRow" + rank);
  row.parent = parentNode;
  row.setContentSize(ROW_WIDTH, ROW_HEIGHT);
  row.setPosition(0, ROW_START_Y - (index * (ROW_HEIGHT + ROW_GAP)));
  drawRoundedRect(row, ROW_WIDTH, ROW_HEIGHT, colors.fill, colors.stroke, rank <= 3 || entry.isSelf ? 4 : 2, 18);

  var medal = new cc.Node("RankBadge");
  medal.parent = row;
  medal.setContentSize(74, 74);
  medal.setPosition(-222, 0);
  var medalGraphics = medal.addComponent(cc.Graphics);
  medalGraphics.clear();
  medalGraphics.fillColor = colors.medal;
  medalGraphics.circle(0, 0, 35);
  medalGraphics.fill();
  medalGraphics.strokeColor = cc.color(255, 246, 210, 240);
  medalGraphics.lineWidth = 4;
  medalGraphics.circle(0, 0, 35);
  medalGraphics.stroke();
  createLabel(medal, "RankLabel", {
    text: String(rank),
    width: 64,
    height: 58,
    fontSize: rank <= 3 ? 40 : 32,
    lineHeight: 44,
    color: cc.color(255, 255, 255),
    outlineWidth: 3,
    outlineColor: cc.color(105, 56, 29)
  });

  var avatar = new cc.Node("Avatar");
  avatar.parent = row;
  avatar.setContentSize(68, 68);
  avatar.setPosition(-144, 0);
  var avatarGraphics = avatar.addComponent(cc.Graphics);
  avatarGraphics.clear();
  avatarGraphics.fillColor = entry.isSelf ? cc.color(255, 220, 94, 255) : cc.color(255, 174, 218, 255);
  avatarGraphics.circle(0, 0, 31);
  avatarGraphics.fill();
  avatarGraphics.strokeColor = cc.color(255, 250, 218, 255);
  avatarGraphics.lineWidth = 3;
  avatarGraphics.circle(0, 0, 31);
  avatarGraphics.stroke();
  createLabel(avatar, "AvatarLabel", {
    text: String(entry.nickname || "?").charAt(0),
    width: 58,
    height: 58,
    fontSize: 30,
    lineHeight: 34,
    color: cc.color(111, 45, 142),
    outlineWidth: 1,
    outlineColor: cc.color(255, 255, 255)
  });

  createLabel(row, "NameLabel", {
    text: String(entry.nickname || ""),
    x: -64,
    y: 16,
    width: 190,
    height: 36,
    fontSize: 30,
    lineHeight: 34,
    align: cc.Label.HorizontalAlign.LEFT,
    color: entry.isSelf ? cc.color(255, 246, 171) : cc.color(255, 255, 255),
    outlineWidth: 2,
    outlineColor: cc.color(74, 27, 122)
  });

  createLabel(row, "LevelLabel", {
    text: TEXT.levelPrefix + Math.max(0, Math.floor(Number(entry.completedLevels) || 0)) + TEXT.levelSuffix,
    x: -64,
    y: -20,
    width: 190,
    height: 28,
    fontSize: 22,
    lineHeight: 26,
    align: cc.Label.HorizontalAlign.LEFT,
    color: cc.color(215, 196, 255)
  });

  createLabel(row, "StarLabel", {
    text: "\u2605",
    x: 104,
    y: 2,
    width: 46,
    height: 46,
    fontSize: 38,
    lineHeight: 42,
    color: cc.color(255, 222, 55),
    outlineWidth: 2,
    outlineColor: cc.color(161, 92, 21)
  });

  createLabel(row, "ScoreLabel", {
    text: Math.max(0, Math.floor(Number(entry.score) || 0)) + TEXT.scoreSuffix,
    x: 208,
    y: 0,
    width: 148,
    height: 42,
    fontSize: 30,
    lineHeight: 34,
    align: cc.Label.HorizontalAlign.LEFT,
    color: cc.color(255, 255, 255),
    outlineWidth: 2,
    outlineColor: cc.color(74, 27, 122)
  });

  return row;
}

function RankingViewController(options) {
  options = options || {};
  this.node = options.node || null;
  this.onClose = typeof options.onClose === "function" ? options.onClose : function () {};
  this._nodes = this.node && this.node.__rankingNodes ? this.node.__rankingNodes : {};
  this._bindActions();
}

RankingViewController.createViewNode = createRootNode;

RankingViewController.prototype._bindActions = function () {
  if (!this.node || !this.node.isValid) {
    return;
  }

  bindTapOnce(this._nodes.closeButton, this.onClose);
  bindCloseAreaOnce(this._nodes.mask, this.onClose);
};

RankingViewController.prototype.setBackgroundSpriteFrame = function (spriteFrame) {
  var panel = this._nodes.panel;
  var sprite = panel ? panel.getComponent(cc.Sprite) : null;
  if (!sprite || !spriteFrame) {
    return;
  }

  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite && cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
  panel.setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
};

RankingViewController.prototype.render = function (entries) {
  var listNode = this._nodes.list;
  if (!listNode || !listNode.isValid) {
    return;
  }

  listNode.removeAllChildren();
  var safeEntries = Array.isArray(entries) ? entries.slice(0, MAX_VISIBLE_ROWS) : [];
  if (safeEntries.length === 0) {
    createLabel(listNode, "EmptyLabel", {
      text: TEXT.empty,
      y: 60,
      width: 430,
      height: 50,
      fontSize: 28,
      lineHeight: 32,
      color: cc.color(226, 212, 255),
      outlineWidth: 2,
      outlineColor: cc.color(73, 31, 148)
    });
    return;
  }

  safeEntries.forEach(function (entry, index) {
    createRankRow(listNode, entry, index);
  });
};

module.exports = RankingViewController;
