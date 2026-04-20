"use strict";

function createOrGetChild(parentNode, name) {
  var node = parentNode.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = parentNode;
  }

  return node;
}

function setLevelButtonStars(buttonNode, starCount) {
  var names = ["start1", "start2", "start3"];
  names.forEach(function (name, index) {
    var starNode = buttonNode.getChildByName(name);
    if (!starNode) {
      return;
    }

    starNode.active = index < starCount;
  });
}

function ensureLevelCurrentHighlight(buttonNode, enabled) {
  var highlightNode = buttonNode.getChildByName("CurrentHighlight");
  if (!enabled) {
    if (highlightNode) {
      highlightNode.active = false;
    }
    return;
  }

  if (!highlightNode) {
    highlightNode = new cc.Node("CurrentHighlight");
    highlightNode.parent = buttonNode;
    highlightNode.setPosition(0, 0);
    highlightNode.zIndex = 50;
    var graphics = highlightNode.addComponent(cc.Graphics);
    graphics.clear();
    graphics.lineWidth = 5;
    graphics.strokeColor = cc.color(255, 234, 120);
    graphics.roundRect(-48, -50, 96, 100, 18);
    graphics.stroke();
  }

  highlightNode.active = true;
}

function applyLevelButtonState(buttonNode, options) {
  options = options || {};
  var isPassed = !!options.isPassed;
  var isUnlocked = !!options.isUnlocked;
  var isCurrent = !!options.isCurrent;
  var starCount = Math.max(0, Math.min(3, Math.floor(Number(options.starCount) || 0)));

  var labelNode = buttonNode.getChildByName("level");
  var button = buttonNode.getComponent(cc.Button);
  if (button) {
    button.interactable = isUnlocked;
    button.enableAutoGrayEffect = false;
  }

  // 通关关卡亮色显示；未通过统一灰色，未解锁更深灰。
  if (isPassed) {
    buttonNode.color = cc.color(255, 255, 255);
    if (labelNode) {
      labelNode.color = cc.color(255, 255, 255);
    }
  } else {
    var grayColor = isUnlocked ? cc.color(156, 156, 156) : cc.color(108, 108, 108);
    buttonNode.color = grayColor;
    if (labelNode) {
      labelNode.color = cc.color(230, 230, 230);
    }
  }

  setLevelButtonStars(buttonNode, isPassed ? starCount : 0);
  ensureLevelCurrentHighlight(buttonNode, isCurrent);
}

function renderLevelSelectContent(options) {
  var hostNode = options.hostNode;
  var levelViewPrefab = options.levelViewPrefab;
  var levelButtonPrefab = options.levelButtonPrefab;
  var levelIds = Array.isArray(options.levelIds) ? options.levelIds : [];
  var isRouteEditorMode = !!options.levelSelectRouteEditorMode;
  var highestUnlocked = Math.max(1, Number(options.highestUnlocked) || 1);
  var highlightedLevelId = Math.max(1, Number(options.highlightedLevelId) || 1);
  var getLevelStarCount = typeof options.getLevelStarCount === "function"
    ? options.getLevelStarCount
    : function () { return 0; };
  var isLevelCompleted = typeof options.isLevelCompleted === "function"
    ? options.isLevelCompleted
    : function () { return false; };
  var onLevelSelectTap = typeof options.onLevelSelectTap === "function"
    ? options.onLevelSelectTap
    : function () {};

  var levelView = options.existingLevelSelectNode;
  if (!levelView || !levelView.isValid) {
    levelView = cc.instantiate(levelViewPrefab);
    levelView.parent = hostNode;
    levelView.zIndex = 160;
    levelView.setPosition(0, 0);
    if (!levelView.getComponent(cc.BlockInputEvents)) {
      levelView.addComponent(cc.BlockInputEvents);
    }
  }

  levelView.active = true;

  var titleNode = createOrGetChild(levelView, "LevelTitle");
  titleNode.setPosition(0, 500);
  titleNode.color = cc.color(255, 255, 255);
  var titleLabel = titleNode.getComponent(cc.Label) || titleNode.addComponent(cc.Label);
  titleLabel.string = isRouteEditorMode ? "关卡选择 · 路线编辑" : "关卡选择";
  titleLabel.fontSize = 56;
  titleLabel.lineHeight = 60;
  titleLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  titleLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
  var titleOutline = titleNode.getComponent(cc.LabelOutline) || titleNode.addComponent(cc.LabelOutline);
  titleOutline.color = cc.color(31, 62, 98);
  titleOutline.width = 3;

  var subtitleNode = createOrGetChild(levelView, "LevelSubtitle");
  subtitleNode.setPosition(0, 450);
  subtitleNode.color = cc.color(235, 245, 255);
  var subtitleLabel = subtitleNode.getComponent(cc.Label) || subtitleNode.addComponent(cc.Label);
  subtitleLabel.string = isRouteEditorMode
    ? "当前为路线编辑模式，点击关卡会进入该关卡的路线编辑"
    : "点击关卡直接开始游戏";
  subtitleLabel.fontSize = 24;
  subtitleLabel.lineHeight = 28;
  subtitleLabel.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  subtitleLabel.verticalAlign = cc.Label.VerticalAlign.CENTER;
  var subtitleOutline = subtitleNode.getComponent(cc.LabelOutline) || subtitleNode.addComponent(cc.LabelOutline);
  subtitleOutline.color = cc.color(31, 62, 98);
  subtitleOutline.width = 2;

  var gridNode = createOrGetChild(levelView, "LevelGrid");
  gridNode.setPosition(0, 100);
  gridNode.removeAllChildren();

  var columns = 5;
  var spacingX = 120;
  var spacingY = 120;
  var startY = 260;

  levelIds.forEach(function (levelId, index) {
    var buttonNode = cc.instantiate(levelButtonPrefab);
    buttonNode.parent = gridNode;
    buttonNode.name = "LevelBtn_" + levelId;
    buttonNode.setScale(1);

    var row = Math.floor(index / columns);
    var col = index % columns;
    var x = (col - (columns - 1) * 0.5) * spacingX;
    var y = startY - row * spacingY;
    buttonNode.setPosition(x, y);

    var levelLabelNode = buttonNode.getChildByName("level");
    var levelLabel = levelLabelNode ? levelLabelNode.getComponent(cc.Label) : null;
    if (levelLabel) {
      levelLabel.string = String(levelId);
    }

    var starCount = getLevelStarCount(levelId);
    var isPassed = isLevelCompleted(levelId);
    var isUnlocked = levelId <= highestUnlocked;
    var isCurrent = levelId === highlightedLevelId;
    applyLevelButtonState(buttonNode, {
      isPassed: isPassed,
      isUnlocked: isUnlocked,
      isCurrent: isCurrent,
      starCount: starCount
    });

    buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
      if (event) {
        event.stopPropagation();
      }
      if (!isUnlocked) {
        return;
      }
      onLevelSelectTap(levelId);
    });
  });

  return {
    levelViewNode: levelView
  };
}

module.exports = {
  renderLevelSelectContent: renderLevelSelectContent
};
