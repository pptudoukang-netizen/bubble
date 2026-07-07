"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererScenePopupMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var setRequiredLabelString = SceneShared.setRequiredLabelString;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var WIN_BOTTLE_RESOURCES = deps.WIN_BOTTLE_RESOURCES;
  var WIN_TARGET_STATUS_RESOURCES = deps.WIN_TARGET_STATUS_RESOURCES;
  var REWARD_ITEM_RESOURCES = deps.REWARD_ITEM_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var SpriteProxyLayerHelper = deps.SpriteProxyLayerHelper;
  var PropDescriptionViewController = deps.PropDescriptionViewController;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
  var WIN_VIEW_PROXY_ROOT_NAME = "win_view_auto_proxy_root";
  var LOSE_VIEW_PROXY_ROOT_NAME = "lose_view_auto_proxy_root";
  var ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME = "add_ball_tips_view_auto_proxy_root";
  var PAUSE_VIEW_PROXY_ROOT_NAME = "pause_view_auto_proxy_root";
  var POPUP_OPEN_ANIM_DURATION = deps.POPUP_OPEN_ANIM_DURATION;
  var POPUP_OPEN_ANIM_FROM_SCALE = deps.POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_POPUP_OPEN_ANIM_DURATION = deps.WIN_POPUP_OPEN_ANIM_DURATION;
  var WIN_POPUP_OPEN_ANIM_FROM_SCALE = deps.WIN_POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_STAR_ANIM_START_DELAY = deps.WIN_STAR_ANIM_START_DELAY;
  var WIN_STAR_ANIM_STAGGER = deps.WIN_STAR_ANIM_STAGGER;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildWinTargetEntries = deps.buildWinTargetEntries;
  var buildWinCollectEntries = deps.buildWinCollectEntries;
  var buildResultTexts = deps.buildResultTexts;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var buildAdRevivePlan = deps.buildAdRevivePlan;
  var resolveLoseRewardEntry = deps.resolveLoseRewardEntry;
  var LOSE_NO_REVIVE_ACTION_BUTTON_Y = -285;
  function ensureLoseOriginalY(node, description) {
    if (!node || !node.isValid) {
      throw new Error(description + " is required.");
    }
    if (typeof node.y !== "number") {
      throw new Error(description + " position Y is invalid.");
    }
    if (typeof node._loseOriginalY !== "number") {
      node._loseOriginalY = node.y;
    }
  }

  function applyLoseReviveLayout(loseContent, canRevive) {
    var retryButtonNode = requireChildNode(loseContent, "btn_retry", "LoseView");
    var backButtonNode = requireChildNode(loseContent, "btn_back", "LoseView");

    ensureLoseOriginalY(retryButtonNode, "LoseView/btn_retry");
    ensureLoseOriginalY(backButtonNode, "LoseView/btn_back");

    if (canRevive) {
      retryButtonNode.setPosition(retryButtonNode.x, retryButtonNode._loseOriginalY);
      backButtonNode.setPosition(backButtonNode.x, backButtonNode._loseOriginalY);
      return;
    }

    retryButtonNode.setPosition(retryButtonNode.x, LOSE_NO_REVIVE_ACTION_BUTTON_Y);
    backButtonNode.setPosition(backButtonNode.x, LOSE_NO_REVIVE_ACTION_BUTTON_Y);
  }

  function setNodeTreeActive(node, active) {
    if (!node || !node.isValid) {
      throw new Error("LoseView node tree target is required.");
    }
    node.active = active === true;
    if (!Array.isArray(node.children)) {
      throw new Error("LoseView node tree children must be an array: " + node.name);
    }
    node.children.forEach(function (childNode) {
      setNodeTreeActive(childNode, active);
    });
  }

  function resetLoseOriginalPosition(node, propertyName) {
    if (!node || !node.isValid) {
      throw new Error("LoseView layout node is required.");
    }
    if (typeof node[propertyName] !== "number") {
      node[propertyName] = propertyName === "_loseOriginalY" ? node.y : node.x;
    }
    if (propertyName === "_loseOriginalY") {
      node.setPosition(node.x, node[propertyName]);
    } else {
      node.setPosition(node[propertyName], node.y);
    }
  }

  function getLoseTopInfoNode(topInfoNode, childName) {
    return requireChildNode(topInfoNode, childName, "LoseView/top_info");
  }

  function resetLoseTopInfoNode(topInfoNode, childName) {
    var node = getLoseTopInfoNode(topInfoNode, childName);
    resetLoseOriginalPosition(node, "_loseOriginalX");
    return node;
  }

  function renderLoseTopInfo(topInfoNode, runtimeSnapshot) {
    if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
      throw new Error("LoseView top_info requires runtimeSnapshot.");
    }
    var score = Number(runtimeSnapshot.score);
    if (!Number.isFinite(score) || score < 0) {
      throw new Error("LoseView top_info requires non-negative runtime score.");
    }
    var earnedScore = Math.floor(score);
    var text1Node = resetLoseTopInfoNode(topInfoNode, "text1");
    var numNode = resetLoseTopInfoNode(topInfoNode, "target1_text_num");
    text1Node.active = true;
    numNode.active = true;
    setRequiredLabelString(text1Node, "本局得分 ", "LoseView/top_info/text1");
    setRequiredLabelString(numNode, String(earnedScore), "LoseView/top_info/target1_text_num");
    var layout = topInfoNode.getComponent(cc.Layout);
    if (!layout || typeof layout.updateLayout !== "function") {
      throw new Error("LoseView top_info requires cc.Layout.updateLayout.");
    }
    layout.updateLayout();
  }

  function renderLoseReviveGain(renderer, loseContent, levelConfig, runtimeSnapshot, canRevive) {
    var getNode = requireChildNode(loseContent, "get", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(getNode, false);
      return;
    }
    setNodeTreeActive(getNode, true);
    if (typeof buildAdRevivePlan !== "function") {
      throw new Error("LoseView requires buildAdRevivePlan.");
    }
    var revivePlan = buildAdRevivePlan(levelConfig, runtimeSnapshot);
    var upNode = requireChildNode(getNode, "up", "LoseView/get");
    var ballNode = requireChildNode(getNode, "handsel_ball", "LoseView/get");
    var desNode = requireChildNode(getNode, "handsel_des", "LoseView/get");
    if (!Number.isInteger(revivePlan.dangerLineSpaceRows) || revivePlan.dangerLineSpaceRows <= 0) {
      throw new Error("LoseView revive plan requires positive integer dangerLineSpaceRows.");
    }
    if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0) {
      throw new Error("LoseView revive plan requires positive integer grantedShots.");
    }
    setRequiredLabelString(upNode, "上移" + revivePlan.dangerLineSpaceRows + "行", "LoseView/get/up");
    setRequiredLabelString(desNode, "赠送" + revivePlan.grantedShots + "球", "LoseView/get/handsel_des");

    var iconCode = revivePlan.targetColor ? revivePlan.targetColor : "RAINBOW";
    var spritePath = BALL_RESOURCES[iconCode];
    if (!spritePath) {
      throw new Error("LoseView revive gain unsupported icon code: " + iconCode);
    }
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView revive gain sprite is not preloaded: " + spritePath);
    }
    ballNode.active = true;
    ensureSprite(ballNode, spriteFrame);
  }

  function renderLoseCoinButton(renderer, loseContent, canRevive) {
    var coinButtonNode = requireChildNode(loseContent, "btn_coin", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(coinButtonNode, false);
      return;
    }
    setNodeTreeActive(coinButtonNode, true);
    if (!renderer.loseCoinPresentation || typeof renderer.loseCoinPresentation !== "object") {
      throw new Error("LoseView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.loseCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("LoseView coin revive cost must be a positive integer.");
    }
    if (typeof renderer.loseCoinPresentation.getCoinCount !== "function") {
      throw new Error("LoseView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.loseCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("LoseView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "label", "LoseView/btn_coin");
    var coinNode = requireChildNode(coinButtonNode, "coin", "LoseView/btn_coin");
    var numNode = requireChildNode(coinNode, "num", "LoseView/btn_coin/coin");
    setRequiredLabelString(labelNode, String(cost) + "复活", "LoseView/btn_coin/label");
    setRequiredLabelString(numNode, String(coinCount), "LoseView/btn_coin/coin/num");
    renderer._bindLoseButton(coinButtonNode, "coin");
  }

  function renderAddBallTipsCoinButton(renderer, panel) {
    var coinButtonNode = requireChildNode(panel, "coin_btn", "AddBallTipsView/Panel");
    if (!renderer.addBallTipsCoinPresentation || typeof renderer.addBallTipsCoinPresentation !== "object") {
      throw new Error("AddBallTipsView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.addBallTipsCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("AddBallTipsView coin cost must be a positive integer.");
    }
    if (typeof renderer.addBallTipsCoinPresentation.getCoinCount !== "function") {
      throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.addBallTipsCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("AddBallTipsView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "lab", "AddBallTipsView/Panel/coin_btn");
    setRequiredLabelString(labelNode, String(cost), "AddBallTipsView/Panel/coin_btn/lab");
    renderer._bindAddBallTipsButton(coinButtonNode, "coin");
  }

LevelRenderer.prototype._setWinValueText = function (valueNode, text) {
  if (!valueNode) {
    return;
  }

  var label = valueNode.getComponent(cc.Label);
  if (!label) {
    label = valueNode.addComponent(cc.Label);
  }
  label.string = text;
};

  function getRuntimeWinClearRewardItems(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView clear rewards require won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView clear rewards require runtimeSnapshot.winStats.");
    }
    if (!Array.isArray(runtimeSnapshot.winStats.clearRewardItems)) {
      throw new Error("WinView clear rewards require winStats.clearRewardItems.");
    }
    return runtimeSnapshot.winStats.clearRewardItems;
  }

  function resolveRewardItemSpritePath(itemId) {
    if (!REWARD_ITEM_RESOURCES || !REWARD_ITEM_RESOURCES[itemId]) {
      throw new Error("WinView unsupported reward item id: " + itemId);
    }
    return REWARD_ITEM_RESOURCES[itemId];
  }

  function requireWinChild(parentNode, childName, ownerName) {
    if (!parentNode || !parentNode.isValid) {
      throw new Error("WinView requires valid parent for " + childName + ".");
    }
    var childNode = parentNode.getChildByName(childName);
    if (!childNode || !childNode.isValid) {
      throw new Error("WinView " + ownerName + " requires child node: " + childName);
    }
    return childNode;
  }

LevelRenderer.prototype._renderWinAwardInfo = function (winContent, rewardItems) {
  if (!Array.isArray(rewardItems)) {
    throw new Error("WinView award_info requires reward items array.");
  }
  var awardInfoNode = winContent ? winContent.getChildByName("award_info") : null;
  if (rewardItems.length === 0) {
    if (awardInfoNode) {
      awardInfoNode.active = false;
    }
    return;
  }

  if (!awardInfoNode || !awardInfoNode.isValid) {
    throw new Error("WinView requires award_info when clearRewardItems are configured.");
  }
  awardInfoNode.active = true;

  var giftListNode = requireWinChild(awardInfoNode, "gift_list", "award_info");
  var templateNode = requireWinChild(giftListNode, "gift", "award_info.gift_list");
  var activeNodes = [];

  rewardItems.forEach(function (rewardItem, index) {
    if (!rewardItem || typeof rewardItem !== "object") {
      throw new Error("WinView clear reward item must be object at index " + index + ".");
    }
    var itemId = typeof rewardItem.id === "string" ? rewardItem.id : "";
    var count = Number(rewardItem.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("WinView clear reward count must be positive integer: " + itemId);
    }

    var itemNode = null;
    if (index === 0) {
      itemNode = templateNode;
    } else {
      itemNode = giftListNode.getChildByName("gift_" + index);
      if (!itemNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple reward items require cc.instantiate.");
        }
        itemNode = cc.instantiate(templateNode);
        itemNode.name = "gift_" + index;
        itemNode.parent = giftListNode;
      }
    }

    itemNode.active = true;
    activeNodes.push(itemNode);

    var iconNode = requireWinChild(itemNode, "icon", itemNode.name);
    var numNode = requireWinChild(itemNode, "num", itemNode.name);
    var spritePath = resolveRewardItemSpritePath(itemId);
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame || (cc && typeof cc.isValid === "function" && !cc.isValid(spriteFrame))) {
      throw new Error("WinView reward sprite is not preloaded: " + spritePath);
    }

    ensureSprite(iconNode, spriteFrame);
    var iconSize = iconNode.getContentSize();
    if (!iconSize || iconSize.width <= 0 || iconSize.height <= 0) {
      iconNode.setContentSize(spriteFrame.getOriginalSize());
    }
    this._setWinValueText(numNode, "x" + count);
  }, this);

  giftListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = giftListNode.getComponent(cc.Layout);
  if (layout) {
    layout.spacingX = rewardItems.length > 1 ? 24 : 0;
    if (typeof layout.updateLayout === "function") {
      layout.updateLayout();
    }
  }
};

LevelRenderer.prototype._renderWinMaxScoreStamp = function (scoreBgNode, runtimeSnapshot) {
  var maxScoreNode = requireWinChild(scoreBgNode, "max_score", "score_bg");
  maxScoreNode.setSiblingIndex(scoreBgNode.children.length - 1);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    maxScoreNode.active = false;
    return;
  }
  if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
    throw new Error("WinView max_score requires runtimeSnapshot.winStats.");
  }
  if (typeof runtimeSnapshot.winStats.isPersonalBestScore !== "boolean") {
    throw new Error("WinView max_score requires boolean winStats.isPersonalBestScore.");
  }
  maxScoreNode.active = runtimeSnapshot.winStats.isPersonalBestScore;
};

LevelRenderer.prototype._renderWinMaxCombo = function (scoreBgNode, runtimeSnapshot) {
  var batterValueNode = requireWinChild(scoreBgNode, "batter_value", "score_bg");
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    batterValueNode.active = false;
    return;
  }
  if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
    throw new Error("WinView batter_value requires runtimeSnapshot.winStats.");
  }
  if (typeof runtimeSnapshot.winStats.maxComboStreak !== "number") {
    throw new Error("WinView batter_value requires winStats.maxComboStreak.");
  }

  var maxComboStreak = Math.floor(runtimeSnapshot.winStats.maxComboStreak);
  if (!Number.isInteger(maxComboStreak) || maxComboStreak < 0) {
    throw new Error("WinView batter_value maxComboStreak must be non-negative integer.");
  }

  batterValueNode.active = true;
  var comboDisplay = maxComboStreak >= 2 ? maxComboStreak - 1 : 0;
  this._setWinValueText(batterValueNode, String(comboDisplay));
};

LevelRenderer.prototype._renderWinCollectList = function (winContent, levelConfig, runtimeSnapshot, targetEntries) {
  var collectBgNode = winContent ? winContent.getChildByName("collect_bg") : null;
  if (!collectBgNode) {
    throw new Error("WinView requires collect_bg.");
  }
  if (!Array.isArray(targetEntries)) {
    throw new Error("WinView collect list requires target entries.");
  }

  var collectListNode = requireWinChild(collectBgNode, "collect_list", "collect_bg");
  var templateNode = requireWinChild(collectListNode, "bottle", "collect_list");
  var entries = buildWinCollectEntries(levelConfig, runtimeSnapshot);
  var hasNoCompletedTargets = targetEntries.length > 0 && targetEntries.every(function (entry) {
    if (!entry || typeof entry.completed !== "boolean") {
      throw new Error("WinView target entry requires completed state.");
    }
    return !entry.completed;
  });

  if (entries.length === 0 && !hasNoCompletedTargets) {
    collectBgNode.active = false;
    return;
  }

  collectBgNode.active = true;
  var activeNodes = [];

  entries.forEach(function (entry, index) {
    var bottleNode = null;
    if (index === 0) {
      bottleNode = templateNode;
    } else {
      bottleNode = collectListNode.getChildByName("bottle_" + index);
      if (!bottleNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple collect bottles require cc.instantiate.");
        }
        bottleNode = cc.instantiate(templateNode);
        bottleNode.name = "bottle_" + index;
        bottleNode.parent = collectListNode;
      }
    }

    bottleNode.active = true;
    activeNodes.push(bottleNode);

    var spritePath = WIN_BOTTLE_RESOURCES[entry.colorCode];
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("WinView collect bottle sprite is not preloaded: " + spritePath);
    }

    ensureSprite(bottleNode, spriteFrame);
    var numNode = requireWinChild(bottleNode, "num", bottleNode.name);
    this._setWinValueText(numNode, String(entry.count));
  }, this);

  collectListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = collectListNode.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._renderWinTargetList = function (winContent, levelConfig, runtimeSnapshot, entries) {
  var targetBgNode = winContent ? winContent.getChildByName("target_bg") : null;
  if (!targetBgNode) {
    throw new Error("WinView requires target_bg.");
  }
  if (!Array.isArray(entries)) {
    throw new Error("WinView target list requires target entries.");
  }

  var targetListNode = requireWinChild(targetBgNode, "target_list", "target_bg");
  var templateNode = requireWinChild(targetListNode, "target", "target_list");

  if (entries.length === 0) {
    targetBgNode.active = false;
    return;
  }

  targetBgNode.active = true;
  var activeNodes = [];

  entries.forEach(function (entry, index) {
    var targetNode = null;
    if (index === 0) {
      targetNode = templateNode;
    } else {
      targetNode = targetListNode.getChildByName("target_" + index);
      if (!targetNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple targets require cc.instantiate.");
        }
        targetNode = cc.instantiate(templateNode);
        targetNode.name = "target_" + index;
        targetNode.parent = targetListNode;
      }
    }

    targetNode.active = true;
    activeNodes.push(targetNode);

    var spritePath = BALL_RESOURCES[entry.iconCode];
    if (!spritePath) {
      throw new Error("WinView unsupported target icon code: " + entry.iconCode);
    }
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("WinView target sprite is not preloaded: " + spritePath);
    }

    ensureSprite(targetNode, spriteFrame);
    var targetDesNode = requireWinChild(targetNode, "target_des", targetNode.name);
    var gouNode = requireWinChild(targetNode, "gou", targetNode.name);
    var statusPath = entry.completed ? WIN_TARGET_STATUS_RESOURCES.complete : WIN_TARGET_STATUS_RESOURCES.incomplete;
    var statusSpriteFrame = this.spriteFrameCache[statusPath];
    if (!statusSpriteFrame) {
      throw new Error("WinView target status sprite is not preloaded: " + statusPath);
    }
    this._setWinValueText(targetDesNode, entry.description);
    ensureSprite(gouNode, statusSpriteFrame);
    gouNode.active = true;
  }, this);

  targetListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = targetListNode.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._ensurePopupMaskVisible = function (popupNode, opacity) {
  if (!popupNode) {
    return;
  }

  var maskNode = popupNode.getChildByName("mask");
  if (!maskNode) {
    return;
  }

  var popupSize = popupNode.getContentSize();
  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      popupSize = rootSize;
      popupNode.setContentSize(rootSize);
    }
  }

  var maskFrame = this._getWhiteSpriteFrameForSize(popupSize.width, popupSize.height);
  if (maskFrame) {
    ensureSprite(maskNode, maskFrame);
    maskNode.setContentSize(popupSize);
  }

  maskNode.active = true;
  maskNode.color = cc.color(0, 0, 0);
  maskNode.opacity = typeof opacity === "number" ? opacity : 100;
  maskNode.zIndex = -10;
};

LevelRenderer.prototype._ensurePopupContentContainer = function (popupNode) {
  if (!popupNode) {
    return null;
  }

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

  return container;
};

LevelRenderer.prototype._playPopupContentOpenAnimation = function (container, options) {
  if (!container) {
    return;
  }

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
    }, {
      easing: easing
    })
    .start();
};

LevelRenderer.prototype._bindWinButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__winBoundAction === action) {
    return;
  }

  buttonNode.__winBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeWinAction(action);
  }, this);
};

LevelRenderer.prototype._getWinStarNodes = function (winContent) {
  if (!winContent) {
    return [];
  }

  return [
    winContent.getChildByName("star1"),
    winContent.getChildByName("star2"),
    winContent.getChildByName("star3") || winContent.getChildByName("start3")
  ];
};

LevelRenderer.prototype._renderWinStars = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));
  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }
    starNode.active = index < safeStarRating;
  });
};

LevelRenderer.prototype._playWinStarsPunchAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));

  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    starNode.stopAllActions();
    if (index >= safeStarRating || !starNode.active) {
      starNode.scale = 1;
      return;
    }

    starNode.scale = WIN_STAR_PUNCH_FROM_SCALE;
    if (typeof cc.tween !== "function") {
      starNode.scale = 1;
      return;
    }

    cc.tween(starNode)
      .delay(WIN_STAR_ANIM_START_DELAY + index * WIN_STAR_ANIM_STAGGER)
      // 由慢到快收缩，制造“砸下去”的打击感。
      .to(WIN_STAR_SHRINK_DURATION, {
        scale: WIN_STAR_PUNCH_DOWN_SCALE
      }, {
        easing: "quartIn"
      })
      .to(WIN_STAR_RECOVER_DURATION, {
        scale: 1
      }, {
        easing: "quadOut"
      })
      .start();
  });
};

LevelRenderer.prototype._playWinPopupOpenAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  this._playPopupContentOpenAnimation(winContent, {
    duration: WIN_POPUP_OPEN_ANIM_DURATION,
    fromScale: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
    easing: "backOut"
  });
  this._playWinStarsPunchAnimation(winContent, starRating);
};

  function requireRuntimeWinStats(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView render key requires won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView render key requires runtimeSnapshot.winStats.");
    }
    return runtimeSnapshot.winStats;
  }

  function requireFiniteWinNumber(value, description) {
    var numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(description + " must be a finite number.");
    }
    return numberValue;
  }

  function resolveWinLevelDisplayText(levelConfig) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView level display requires level config.");
    }
    var randomChallenge = levelConfig.level.randomChallenge;
    if (randomChallenge && randomChallenge.mode === "random_challenge") {
      return "挑战关";
    }
    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView level display requires positive integer level id.");
    }
    return "第" + levelId + "关";
  }

  function buildWinViewRenderKey(levelConfig, runtimeSnapshot) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView render key requires level config.");
    }

    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView render key requires positive integer level id.");
    }

    var winStats = requireRuntimeWinStats(runtimeSnapshot);
    if (typeof winStats.isPersonalBestScore !== "boolean") {
      throw new Error("WinView render key requires boolean isPersonalBestScore.");
    }
    if (typeof winStats.maxComboStreak !== "number") {
      throw new Error("WinView render key requires numeric maxComboStreak.");
    }

    var starRating = resolveWinStarRating(levelConfig, runtimeSnapshot);
    if (!Number.isFinite(starRating)) {
      throw new Error("WinView render key requires finite star rating.");
    }

    return JSON.stringify({
      levelId: levelId,
      totalScore: requireFiniteWinNumber(winStats.totalScore, "WinView render key totalScore"),
      personalBest: winStats.isPersonalBestScore,
      maxComboStreak: Math.floor(winStats.maxComboStreak),
      rewardItems: getRuntimeWinClearRewardItems(runtimeSnapshot),
      collectEntries: buildWinCollectEntries(levelConfig, runtimeSnapshot),
      targetEntries: buildWinTargetEntries(levelConfig, runtimeSnapshot),
      starRating: Math.floor(starRating)
    });
  }

LevelRenderer.prototype._bindLoseButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__loseBoundAction === action) {
    return;
  }

  buttonNode.__loseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeLoseAction(action);
  }, this);
};

LevelRenderer.prototype._bindAddBallTipsButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("AddBallTipsView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("AddBallTipsView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__addBallTipsBoundAction === action) {
    return;
  }
  if (buttonNode.__addBallTipsBoundAction) {
    throw new Error("AddBallTipsView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__addBallTipsBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeAddBallTipsAction(action);
  }, this);
};

LevelRenderer.prototype._bindPauseButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("PauseView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("PauseView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__pauseBoundAction === action) {
    return;
  }
  if (buttonNode.__pauseBoundAction) {
    throw new Error("PauseView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__pauseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokePauseAction(action);
  }, this);
};

LevelRenderer.prototype.showPauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView requires the gameplay modal layer.");
  }
  var existing = this.layers.modal.getChildByName("PauseView");
  if (existing && existing.active) {
    throw new Error("PauseView is already active.");
  }

  var pauseView = existing || this._instantiateOrCreate(PREFAB_PATHS.pauseView, this.layers.modal, "PauseView");
  if (!pauseView || !pauseView.isValid) {
    throw new Error("PauseView prefab could not be instantiated.");
  }
  pauseView.active = true;
  pauseView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(pauseView, PAUSE_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(pauseView, 164);
  var pauseContent = this._ensurePopupContentContainer(pauseView);
  var panel = requireChildNode(pauseContent, "Panel", "PauseView content");

  this._bindPauseButton(requireChildNode(panel, "btn_close", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "continue", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "rechage", "PauseView/Panel"), "retry");
  this._bindPauseButton(requireChildNode(panel, "back", "PauseView/Panel"), "exit");
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: pauseView,
    proxyRootName: PAUSE_VIEW_PROXY_ROOT_NAME
  });
  this._playPopupContentOpenAnimation(pauseContent);
};

LevelRenderer.prototype.hidePauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView hide requires the gameplay modal layer.");
  }
  var pauseView = this.layers.modal.getChildByName("PauseView");
  if (!pauseView || !pauseView.isValid || !pauseView.active) {
    throw new Error("Cannot hide an inactive PauseView.");
  }
  pauseView.active = false;
};

LevelRenderer.prototype.showPropDescriptionView = function (levelConfig) {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView requires the gameplay modal layer.");
  }
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("PropDescriptionView requires current levelConfig.");
  }
  var existing = this.layers.modal.getChildByName("PropDescriptionView");
  if (existing && existing.isValid && existing.active) {
    throw new Error("PropDescriptionView is already active.");
  }
  if (existing && existing.isValid) {
    existing.removeFromParent(false);
    existing.destroy();
    this.propDescriptionViewController = null;
  }

  var viewNode = this._instantiateOrCreate(
    PREFAB_PATHS.propDescriptionView,
    this.layers.modal,
    "PropDescriptionView"
  );
  if (!viewNode || !viewNode.isValid) {
    throw new Error("PropDescriptionView prefab could not be instantiated.");
  }
  viewNode.active = true;
  viewNode.setPosition(0, 0);
  this._ensurePopupMaskVisible(viewNode, 164);
  var popupContent = this._ensurePopupContentContainer(viewNode);
  requireChildNode(popupContent, "Panel", "PropDescriptionView content");

  if (
    !this.propDescriptionViewController ||
    this.propDescriptionViewController.node !== viewNode ||
    !this.propDescriptionViewController.node.isValid
  ) {
    this.propDescriptionViewController = new PropDescriptionViewController({
      node: viewNode,
      onClose: function () {
        this._invokeGameplayAction("close_prop_description");
      }.bind(this)
    });
  }
  try {
    this.propDescriptionViewController.render({
      levelConfig: levelConfig,
      spriteFrameCache: this.spriteFrameCache
    });
  } catch (error) {
    viewNode.removeFromParent(false);
    viewNode.destroy();
    this.propDescriptionViewController = null;
    throw error;
  }
  this._playPopupContentOpenAnimation(popupContent);
};

LevelRenderer.prototype.hidePropDescriptionView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView hide requires the gameplay modal layer.");
  }
  var viewNode = this.layers.modal.getChildByName("PropDescriptionView");
  if (!viewNode || !viewNode.isValid || !viewNode.active) {
    throw new Error("Cannot hide an inactive PropDescriptionView.");
  }
  viewNode.removeFromParent(false);
  viewNode.destroy();
  this.propDescriptionViewController = null;
};

LevelRenderer.prototype._renderWinView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("WinView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    if (existing) {
      existing.active = false;
      if (wasActive) {
        this._notifyResultViewLifecycle("onWinViewHide");
      }
    }
    this.lastWinViewRenderKey = "";
    return;
  }

  var renderKey = buildWinViewRenderKey(this.currentLevelConfig, runtimeSnapshot);
  if (
    existing &&
    existing.active &&
    this.lastWinViewRenderKey === renderKey &&
    SpriteProxyLayerHelper.hasAutoProxyTree(existing, WIN_VIEW_PROXY_ROOT_NAME)
  ) {
    return;
  }

  var winView = existing;
  if (!winView) {
    winView = this._instantiateOrCreate(PREFAB_PATHS.winView, this.layers.modal, "WinView");
  }

  if (!winView) {
    throw new Error("WinView prefab could not be instantiated.");
  }

  winView.active = true;
  winView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(winView, WIN_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(winView, 100);
  var winContent = this._ensurePopupContentContainer(winView);

  var winStats = requireRuntimeWinStats(runtimeSnapshot);
  var totalScore = requireFiniteWinNumber(winStats.totalScore, "WinView totalScore");
  var scoreBgNode = winContent ? winContent.getChildByName("score_bg") : null;
  var rewardItems = getRuntimeWinClearRewardItems(runtimeSnapshot);
  var targetEntries = buildWinTargetEntries(this.currentLevelConfig, runtimeSnapshot);
  this._setWinValueText(requireWinChild(scoreBgNode, "score_value", "score_bg"), String(totalScore));
  this._renderWinAwardInfo(winContent, rewardItems);
  this._renderWinMaxScoreStamp(scoreBgNode, runtimeSnapshot);
  this._renderWinMaxCombo(scoreBgNode, runtimeSnapshot);
  this._renderWinCollectList(winContent, this.currentLevelConfig, runtimeSnapshot, targetEntries);
  this._renderWinTargetList(winContent, this.currentLevelConfig, runtimeSnapshot, targetEntries);

  var starRating = resolveWinStarRating(this.currentLevelConfig, runtimeSnapshot);
  this._renderWinStars(winContent, starRating);
  if (!wasActive) {
    this._playWinPopupOpenAnimation(winContent, starRating);
  }

  var levelBgNode = winContent ? winContent.getChildByName("level_bg") : null;
  var currentLevelNode = levelBgNode
    ? levelBgNode.getChildByName("cur_level")
    : (winContent ? winContent.getChildByName("cur_level") : null);
  this._setWinValueText(currentLevelNode, resolveWinLevelDisplayText(this.currentLevelConfig));

  var closeButtonNode = winContent ? winContent.getChildByName("btn_close") : null;
  if (!closeButtonNode && winView) {
    closeButtonNode = winView.getChildByName("btn_close");
  }
  this._bindWinButton(closeButtonNode, "back");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_next") : null, "next");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_retry") : null, "retry");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_back") : null, "back");
  var maxScoreNode = scoreBgNode ? requireWinChild(scoreBgNode, "max_score", "score_bg") : null;
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: winView,
    proxyRootName: WIN_VIEW_PROXY_ROOT_NAME,
    excludeRoots: maxScoreNode ? [maxScoreNode] : []
  });
  this.lastWinViewRenderKey = renderKey;
  if (!wasActive) {
    this._notifyResultViewLifecycle("onWinViewShow");
  }
};

LevelRenderer.prototype._renderAddBallTipsView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("AddBallTipsView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "out_of_shots_add_ball_prompt") {
    if (existing) {
      existing.active = false;
    }
    this.lastAddBallTipsViewRenderKey = "";
    return;
  }

  var renderKey = [
    runtimeSnapshot.state,
    Math.max(0, Math.floor(Number(runtimeSnapshot.remainingShots))),
    this.addBallTipsCoinPresentation ? Math.floor(Number(this.addBallTipsCoinPresentation.cost)) : 0
  ].join("|");
  if (
    existing &&
    existing.active &&
    this.lastAddBallTipsViewRenderKey === renderKey &&
    SpriteProxyLayerHelper.hasAutoProxyTree(existing, ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME)
  ) {
    return;
  }

  var tipsView = existing;
  if (!tipsView) {
    tipsView = this._instantiateOrCreate(PREFAB_PATHS.addBallTipsView, this.layers.modal, "AddBallTipsView");
  }
  if (!tipsView) {
    throw new Error("AddBallTipsView prefab could not be instantiated.");
  }

  tipsView.active = true;
  tipsView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(tipsView, ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(tipsView, 200);
  var content = this._ensurePopupContentContainer(tipsView);
  var panel = requireChildNode(content, "Panel", "AddBallTipsView content");
  if (!wasActive) {
    this._playPopupContentOpenAnimation(content);
  }

  var adButtonNode = requireChildNode(panel, "ad_btn", "AddBallTipsView/Panel");
  var adLabelNode = requireChildNode(adButtonNode, "lab", "AddBallTipsView/Panel/ad_btn");
  setRequiredLabelString(adLabelNode, "10", "AddBallTipsView/Panel/ad_btn/lab");
  this._bindAddBallTipsButton(requireChildNode(panel, "btn_close", "AddBallTipsView/Panel"), "close");
  this._bindAddBallTipsButton(adButtonNode, "ad");
  renderAddBallTipsCoinButton(this, panel);
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: tipsView,
    proxyRootName: ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME
  });
  this.lastAddBallTipsViewRenderKey = renderKey;
};

LevelRenderer.prototype._renderLoseView = function (runtimeSnapshot) {
  var isLoseState = !!(
    runtimeSnapshot &&
    (runtimeSnapshot.state === "lost_danger" || runtimeSnapshot.state === "out_of_shots" || runtimeSnapshot.state === "lost_objective")
  );
  var existing = this.layers.modal.getChildByName("LoseView");
  var wasActive = !!(existing && existing.active);
  if (!isLoseState) {
    if (existing) {
      existing.active = false;
      if (wasActive) {
        this._notifyResultViewLifecycle("onLoseViewHide");
      }
    }
    return;
  }

  var loseView = existing;
  if (!loseView) {
    loseView = this._instantiateOrCreate(PREFAB_PATHS.loseView, this.layers.modal, "LoseView");
  }

  if (!loseView) {
    return;
  }

  loseView.active = true;
  loseView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(loseView, LOSE_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(loseView, 164);
  var loseContent = this._ensurePopupContentContainer(loseView);
  if (!wasActive) {
    this._playPopupContentOpenAnimation(loseContent);
  }

  renderLoseTopInfo(requireChildNode(loseContent, "top_info", "LoseView"), runtimeSnapshot);

  var loseRewardEntry = typeof resolveLoseRewardEntry === "function"
    ? resolveLoseRewardEntry(runtimeSnapshot.state)
    : null;
  var canRevive = !!loseRewardEntry;
  renderLoseReviveGain(this, loseContent, this.currentLevelConfig, runtimeSnapshot, canRevive);
  renderLoseCoinButton(this, loseContent, canRevive);
  var adButtonNode = loseContent ? loseContent.getChildByName("btn_ad") : null;
  if (adButtonNode) {
    if (!canRevive) {
      setNodeTreeActive(adButtonNode, false);
    } else if (loseRewardEntry) {
      setNodeTreeActive(adButtonNode, true);
      var videoIconNode = adButtonNode.getChildByName("vido_icon");
      var coinIconNode = adButtonNode.getChildByName("coin");
      var showVideoIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showVideoIcon);
      var showCoinIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showCoinIcon);
      if (showVideoIcon && showCoinIcon) {
        throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
      }
      if (videoIconNode) {
        videoIconNode.active = showVideoIcon;
      }
      if (coinIconNode) {
        coinIconNode.active = showCoinIcon;
      }
      var awardTipsNode = adButtonNode.getChildByName("award_tips");
      var awardTipsLabel = awardTipsNode ? awardTipsNode.getComponent(cc.Label) : null;
      if (awardTipsLabel) {
        awardTipsLabel.string = awardTipsLabel.string || String(loseRewardEntry.awardTips || "");
      }
      this._bindLoseButton(adButtonNode, "ad");
    }
  }

  applyLoseReviveLayout(loseContent, canRevive);
  var retryButtonNode = loseContent ? loseContent.getChildByName("btn_retry") : null;

  var loseCloseButtonNode = loseContent ? loseContent.getChildByName("btn_close") : null;
  if (!loseCloseButtonNode && loseView) {
    loseCloseButtonNode = loseView.getChildByName("btn_close");
  }
  this._bindLoseButton(loseCloseButtonNode, "back");
  this._bindLoseButton(retryButtonNode, "retry");
  this._bindLoseButton(loseContent ? loseContent.getChildByName("btn_back") : null, "back");
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: loseView,
    proxyRootName: LOSE_VIEW_PROXY_ROOT_NAME
  });
  if (!wasActive) {
    this._notifyResultViewLifecycle("onLoseViewShow");
  }
};

LevelRenderer.prototype._renderResultPopup = function (runtimeSnapshot) {
  var popup = this._instantiateOrCreate(null, this.layers.modal, "ResultPopup");
  var resultTexts = buildResultTexts(runtimeSnapshot);

  if (!resultTexts) {
    popup.active = false;
    return;
  }

  popup.active = true;
  popup.setPosition(0, 40);

  var bg = getOrCreateChild(popup, "PopupBg");
  var frame = this._getWhiteSpriteFrameForSize(1, 1);
  if (frame) {
    ensureSprite(bg, frame);
    bg.setContentSize(new cc.Size(540, 320));
    bg.opacity = 215;
  }

  var title = getOrCreateChild(popup, "Title");
  title.setPosition(0, 50);
  title.color = cc.color(255, 255, 255);
  ensureLabel(title, resultTexts.title, 54, 58);
  ensureOutline(title, cc.color(83, 109, 138), 4);

  var subtitle = getOrCreateChild(popup, "Subtitle");
  subtitle.setPosition(0, -20);
  subtitle.color = cc.color(255, 250, 235);
  ensureLabel(subtitle, resultTexts.subtitle, 28, 34);
  ensureOutline(subtitle, cc.color(83, 109, 138), 3);

  var detail = getOrCreateChild(popup, "Detail");
  detail.setPosition(0, -95);
  detail.color = cc.color(255, 250, 235);
  ensureLabel(detail, resultTexts.detail, 24, 30);
  ensureOutline(detail, cc.color(83, 109, 138), 2);
};
}

module.exports = attachLevelRendererScenePopupMethods;
