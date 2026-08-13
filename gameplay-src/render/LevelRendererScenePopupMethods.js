"use strict";

var SceneShared = require("./LevelRendererSceneShared");
var LOSE_REVIVE_ICON_SIZE = 50;
var LOSE_CLEARANCE_TARGET_ICON_HEIGHT = 65;

function getSpriteFrameWidthAtHeight(spriteFrame, height, description) {
  if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error(description + " requires SpriteFrame.getOriginalSize.");
  }
  if (typeof height !== "number" || !isFinite(height) || height <= 0) {
    throw new Error(description + " height must be positive.");
  }
  var originalSize = spriteFrame.getOriginalSize();
  if (
    !originalSize ||
    typeof originalSize.width !== "number" ||
    !isFinite(originalSize.width) ||
    originalSize.width <= 0 ||
    typeof originalSize.height !== "number" ||
    !isFinite(originalSize.height) ||
    originalSize.height <= 0
  ) {
    throw new Error(description + " original size is invalid.");
  }
  return height * originalSize.width / originalSize.height;
}
function buildLoseRevivePresentation(levelConfig, revivePlan) {
  if (!levelConfig || !levelConfig.level || typeof levelConfig.level.playMode !== "string") {
    throw new Error("LoseView revive presentation requires level.playMode.");
  }
  if (!revivePlan || typeof revivePlan !== "object" || Array.isArray(revivePlan)) {
    throw new Error("LoseView revive presentation requires revive plan.");
  }
  var level = levelConfig.level;
  if (level.playMode === "timed_infinite_shots") {
    if (revivePlan.grantedShots !== 0 || !Number.isInteger(revivePlan.grantedTimeSeconds) || revivePlan.grantedTimeSeconds <= 0) {
      throw new Error("Timed LoseView revive presentation requires positive grantedTimeSeconds and zero grantedShots.");
    }
    return {
      description: "规定时间内通关",
      descriptionX: 0,
      showBall: false,
      iconType: null
    };
  }
  if (level.playMode !== "shot_limited") {
    throw new Error("LoseView revive presentation level.playMode is unsupported: " + level.playMode);
  }
  if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0 || revivePlan.grantedTimeSeconds !== 0) {
    throw new Error("Shot-limited LoseView revive presentation requires positive grantedShots and zero grantedTimeSeconds.");
  }
  return {
    description: "赠送" + revivePlan.grantedShots + "球",
    descriptionX: 32,
    showBall: true,
    iconType: "ball"
  };
}

function buildLoseClearanceTargetPresentation(levelConfig) {
  if (!levelConfig || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("LoseView clearance target presentation requires level config.");
  }
  var level = levelConfig.level;
  if (level.levelType !== "trapped_sprite_rescue") {
    return null;
  }
  if (!level.trappedSpriteRescue || typeof level.trappedSpriteRescue.spiritId !== "string" || !level.trappedSpriteRescue.spiritId) {
    throw new Error("Trapped sprite rescue LoseView clearance target requires level.trappedSpriteRescue.spiritId.");
  }
  return {
    description: "救出精灵",
    spiritId: level.trappedSpriteRescue.spiritId
  };
}

function attachLevelRendererScenePopupMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var setRequiredLabelString = SceneShared.setRequiredLabelString;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var LOSE_STATUS_RESOURCES = deps.LOSE_STATUS_RESOURCES;
  var REWARD_ITEM_RESOURCES = deps.REWARD_ITEM_RESOURCES;
  var buildTrappedSpriteResourcePath = deps.buildTrappedSpriteResourcePath;
  var buildRescueSuccessfulSpiritResourcePath = deps.buildRescueSuccessfulSpiritResourcePath;
  var buildSpiritFragmentRewardResourcePath = deps.buildSpiritFragmentRewardResourcePath;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var SpriteProxyLayerHelper = deps.SpriteProxyLayerHelper;
  var PropDescriptionViewController = deps.PropDescriptionViewController;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
  var WIN_VIEW_PROXY_ROOT_NAME = "win_view_auto_proxy_root";
  var RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME = "rescue_successful_view_auto_proxy_root";
  var RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC = 2;
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
    var backButtonNode = requireChildNode(loseContent, "btn_back", "LoseView");

    ensureLoseOriginalY(backButtonNode, "LoseView/btn_back");

    if (canRevive) {
      backButtonNode.setPosition(backButtonNode.x, backButtonNode._loseOriginalY);
      return;
    }

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

  function renderLoseClearanceTarget(renderer, loseContent, levelConfig) {
    var statusLayoutNode = requireChildNode(loseContent, "taget", "LoseView");
    var targetBallNode = requireChildNode(statusLayoutNode, "ball", "LoseView/taget");
    var clearTargetNode = requireChildNode(statusLayoutNode, "clearn_target", "LoseView/taget");
    var targetBallSprite = targetBallNode.getComponent(cc.Sprite);
    var clearTargetLabel = clearTargetNode.getComponent(cc.Label);
    if (!targetBallSprite || !targetBallSprite.spriteFrame) {
      throw new Error("LoseView/taget/ball requires authored SpriteFrame.");
    }
    if (!clearTargetLabel || typeof clearTargetLabel.string !== "string") {
      throw new Error("LoseView/taget/clearn_target requires cc.Label.");
    }
    if (!targetBallNode.__loseClearTargetDefaultSpriteFrame) {
      targetBallNode.__loseClearTargetDefaultSpriteFrame = targetBallSprite.spriteFrame;
      targetBallNode.__loseClearTargetDefaultTrim = targetBallSprite.trim;
    }
    if (!targetBallNode.__loseClearTargetDefaultContentSize) {
      if (typeof targetBallNode.getContentSize !== "function") {
        throw new Error("LoseView/taget/ball requires getContentSize.");
      }
      var defaultContentSize = targetBallNode.getContentSize();
      if (!defaultContentSize || defaultContentSize.width <= 0 || defaultContentSize.height <= 0) {
        throw new Error("LoseView/taget/ball authored content size must be positive.");
      }
      targetBallNode.__loseClearTargetDefaultContentSize = {
        width: defaultContentSize.width,
        height: defaultContentSize.height
      };
    }
    if (typeof clearTargetNode.__loseClearTargetDefaultText !== "string") {
      clearTargetNode.__loseClearTargetDefaultText = clearTargetLabel.string;
    }

    var presentation = buildLoseClearanceTargetPresentation(levelConfig);
    if (!presentation) {
      var defaultSprite = ensureSprite(targetBallNode, targetBallNode.__loseClearTargetDefaultSpriteFrame);
      defaultSprite.trim = targetBallNode.__loseClearTargetDefaultTrim;
      targetBallNode.setContentSize(
        targetBallNode.__loseClearTargetDefaultContentSize.width,
        targetBallNode.__loseClearTargetDefaultContentSize.height
      );
      setRequiredLabelString(clearTargetNode, clearTargetNode.__loseClearTargetDefaultText, "LoseView/taget/clearn_target");
      return;
    }
    if (typeof buildTrappedSpriteResourcePath !== "function") {
      throw new Error("LoseView rescue clearance target requires a trapped sprite resource resolver.");
    }
    var spritePath = buildTrappedSpriteResourcePath(presentation.spiritId);
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView rescue clearance target sprite is not preloaded: " + spritePath);
    }
    var sprite = ensureSprite(targetBallNode, spriteFrame);
    sprite.trim = false;
    targetBallNode.setContentSize(
      getSpriteFrameWidthAtHeight(spriteFrame, LOSE_CLEARANCE_TARGET_ICON_HEIGHT, "LoseView rescue clearance target"),
      LOSE_CLEARANCE_TARGET_ICON_HEIGHT
    );
    setRequiredLabelString(clearTargetNode, presentation.description, "LoseView/taget/clearn_target");
  }

  function renderLoseFailureStatus(renderer, loseContent, levelConfig, runtimeSnapshot) {
    if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
      throw new Error("LoseView failure status requires runtime snapshot.");
    }
    if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.");
    }
    if (!Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.cells.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object" || Array.isArray(runtimeSnapshot.winStats)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.winStats.");
    }

    var starRating = Number(runtimeSnapshot.winStats.starRating);
    if (!Number.isInteger(starRating) || starRating < 0) {
      throw new Error("LoseView failure status requires non-negative integer winStats.starRating.");
    }

    var ballComplete = runtimeSnapshot.board.cells.length === 0;
    var starComplete = starRating >= 1;
    var failTips;
    if (starComplete && !ballComplete) {
      failTips = "分数已达标\n但是还有球球未清空";
    } else if (ballComplete && !starComplete) {
      failTips = "球球已清空\n但是分数未达标";
    } else if (!ballComplete && !starComplete) {
      failTips = "分数未达标\n且球球也未清空";
    } else {
      throw new Error("LoseView failure status cannot be shown for a completed board and score.");
    }

    var failTipsNode = requireChildNode(loseContent, "fail_tips", "LoseView");
    var statusLayoutNode = requireChildNode(loseContent, "taget", "LoseView");
    var ballStatusNode = requireChildNode(statusLayoutNode, "ball_complete", "LoseView/taget");
    var starStatusNode = requireChildNode(statusLayoutNode, "star_complete", "LoseView/taget");
    var completeSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.complete];
    var incompleteSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.incomplete];
    if (!completeSpriteFrame) {
      throw new Error("LoseView complete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.complete);
    }
    if (!incompleteSpriteFrame) {
      throw new Error("LoseView incomplete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.incomplete);
    }

    setRequiredLabelString(failTipsNode, failTips, "LoseView/fail_tips");
    renderLoseClearanceTarget(renderer, loseContent, levelConfig);
    ensureSprite(ballStatusNode, ballComplete ? completeSpriteFrame : incompleteSpriteFrame);
    ensureSprite(starStatusNode, starComplete ? completeSpriteFrame : incompleteSpriteFrame);
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
    var presentation = buildLoseRevivePresentation(levelConfig, revivePlan);
    var ballNode = requireChildNode(getNode, "handsel_ball", "LoseView/get");
    var desNode = requireChildNode(getNode, "handsel_des", "LoseView/get");
    if (typeof desNode.setPosition !== "function" || typeof desNode.y !== "number") {
      throw new Error("LoseView/get/handsel_des position is invalid.");
    }
    desNode.setPosition(presentation.descriptionX, desNode.y);
    setRequiredLabelString(desNode, presentation.description, "LoseView/get/handsel_des");
    ballNode.active = presentation.showBall;
    if (!presentation.showBall) {
      return;
    }

    var spritePath;
    if (presentation.iconType === "ball") {
      var iconCode = revivePlan.targetColor ? revivePlan.targetColor : "RAINBOW";
      spritePath = BALL_RESOURCES[iconCode];
    } else {
      throw new Error("LoseView revive gain requires a supported icon type.");
    }
    if (!spritePath) {
      throw new Error("LoseView revive gain icon resource path is required.");
    }
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView revive gain sprite is not preloaded: " + spritePath);
    }
    ensureSprite(ballNode, spriteFrame);
    ballNode.setContentSize(LOSE_REVIVE_ICON_SIZE, LOSE_REVIVE_ICON_SIZE);
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

  function resolveRewardItemSpritePath(rewardItem) {
    if (!rewardItem || typeof rewardItem !== "object") {
      throw new Error("WinView reward item is required.");
    }
    if (rewardItem.id === "spirit_fragment") {
      if (typeof buildSpiritFragmentRewardResourcePath !== "function") {
        throw new Error("WinView requires spirit fragment reward resource resolver.");
      }
      if (typeof rewardItem.spiritId !== "string" || rewardItem.spiritId.length === 0) {
        throw new Error("WinView spirit fragment reward requires spiritId.");
      }
      return buildSpiritFragmentRewardResourcePath(rewardItem.spiritId);
    }
    if (!REWARD_ITEM_RESOURCES || !REWARD_ITEM_RESOURCES[rewardItem.id]) {
      throw new Error("WinView unsupported reward item id: " + rewardItem.id);
    }
    return REWARD_ITEM_RESOURCES[rewardItem.id];
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
    var spritePath = resolveRewardItemSpritePath(rewardItem);
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

LevelRenderer.prototype._bindRescueSuccessfulCloseButton = function (buttonNode) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("RescueSuccessfulView close button is required.");
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("RescueSuccessfulView/Panel/btn_close must contain cc.Button.");
  }
  if (buttonNode.__rescueSuccessfulCloseBound === true) {
    throw new Error("RescueSuccessfulView close button must be bound exactly once.");
  }

  buttonNode.__rescueSuccessfulCloseBound = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this.hideRescueSuccessfulView();
  }, this);
};

LevelRenderer.prototype.hideRescueSuccessfulView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("RescueSuccessfulView hide requires the gameplay modal layer.");
  }
  var viewNode = this.layers.modal.getChildByName("RescueSuccessfulView");
  if (!viewNode || !viewNode.isValid || !viewNode.active) {
    throw new Error("Cannot hide an inactive RescueSuccessfulView.");
  }
  viewNode.removeFromParent(false);
  viewNode.destroy();
  if (this.lastRuntimeSnapshot && this.lastRuntimeSnapshot.state === "won") {
    this._renderWinView(this.lastRuntimeSnapshot);
  }
};

LevelRenderer.prototype._dismissRescueSuccessfulViewForWin = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("WinView rescue-popup dismissal requires the gameplay modal layer.");
  }
  var viewNode = this.layers.modal.getChildByName("RescueSuccessfulView");
  if (viewNode && viewNode.isValid && viewNode.active) {
    if (viewNode.__minimumDisplayCompleted !== true) {
      throw new Error("WinView cannot dismiss RescueSuccessfulView before its two-second minimum display completes.");
    }
    viewNode.removeFromParent(false);
    viewNode.destroy();
  }
};

LevelRenderer.prototype._showRescueSuccessfulView = function (spiritId) {
  var spritePath = buildRescueSuccessfulSpiritResourcePath(spiritId);
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("RescueSuccessfulView show requires the gameplay modal layer.");
  }
  var existing = this.layers.modal.getChildByName("RescueSuccessfulView");
  if (existing && existing.isValid) {
    throw new Error("RescueSuccessfulView must be shown exactly once per rescue.");
  }
  var activeWinView = this.layers.modal.getChildByName("WinView");
  if (activeWinView && activeWinView.isValid && activeWinView.active) {
    throw new Error("RescueSuccessfulView cannot open after WinView is active.");
  }

  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("RescueSuccessfulView spirit SpriteFrame was not preloaded: " + spritePath);
  }
  var viewNode = this._instantiateOrCreate(
    PREFAB_PATHS.rescueSuccessfulView,
    this.layers.modal,
    "RescueSuccessfulView"
  );
  if (!viewNode || !viewNode.isValid) {
    throw new Error("RescueSuccessfulView prefab could not be instantiated.");
  }

  viewNode.active = true;
  viewNode.setPosition(0, 0);
  viewNode.__minimumDisplayCompleted = false;
  SpriteProxyLayerHelper.destroyProxyRoot(viewNode, RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(viewNode, 200);
  var content = this._ensurePopupContentContainer(viewNode);
  var panel = requireChildNode(content, "Panel", "RescueSuccessfulView content");
  var roleNode = requireChildNode(panel, "role", "RescueSuccessfulView/Panel");
  var authoredRoleSize = roleNode.getContentSize();
  if (
    !authoredRoleSize ||
    typeof authoredRoleSize.width !== "number" ||
    !isFinite(authoredRoleSize.width) ||
    authoredRoleSize.width <= 0 ||
    typeof authoredRoleSize.height !== "number" ||
    !isFinite(authoredRoleSize.height) ||
    authoredRoleSize.height <= 0
  ) {
    throw new Error("RescueSuccessfulView/Panel/role authored size must be positive.");
  }
  var roleSprite = ensureSprite(roleNode, spriteFrame);
  roleSprite.trim = false;
  roleNode.setContentSize(authoredRoleSize);
  var closeButtonNode = requireChildNode(panel, "btn_close", "RescueSuccessfulView/Panel");
  this._bindRescueSuccessfulCloseButton(closeButtonNode);
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: viewNode,
    proxyRootName: RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME
  });
  this._playPopupContentOpenAnimation(content);
  if (typeof cc.tween !== "function") {
    throw new Error("RescueSuccessfulView minimum display requires cc.tween.");
  }
  cc.tween(viewNode)
    .delay(RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC)
    .call(function () {
      if (viewNode.isValid && viewNode.parent === this.layers.modal) {
        viewNode.__minimumDisplayCompleted = true;
        if (this.lastRuntimeSnapshot && this.lastRuntimeSnapshot.state === "won") {
          this._renderWinView(this.lastRuntimeSnapshot);
        }
      }
    }.bind(this))
    .start();
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
    var starRating = resolveWinStarRating(levelConfig, runtimeSnapshot);
    if (!Number.isFinite(starRating)) {
      throw new Error("WinView render key requires finite star rating.");
    }

    return JSON.stringify({
      levelId: levelId,
      totalScore: requireFiniteWinNumber(winStats.totalScore, "WinView render key totalScore"),
      personalBest: winStats.isPersonalBestScore,
      rewardItems: getRuntimeWinClearRewardItems(runtimeSnapshot),
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

  var rescueSuccessfulView = this.layers.modal.getChildByName("RescueSuccessfulView");
  if (
    rescueSuccessfulView &&
    rescueSuccessfulView.isValid &&
    rescueSuccessfulView.active &&
    rescueSuccessfulView.__minimumDisplayCompleted !== true
  ) {
    if (wasActive) {
      throw new Error("WinView became active before RescueSuccessfulView completed its minimum display.");
    }
    return;
  }

  this._dismissRescueSuccessfulViewForWin();

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
  this._setWinValueText(requireWinChild(scoreBgNode, "score_value", "score_bg"), String(totalScore));
  this._renderWinAwardInfo(winContent, rewardItems);
  this._renderWinMaxScoreStamp(scoreBgNode, runtimeSnapshot);

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

  renderLoseFailureStatus(this, loseContent, this.currentLevelConfig, runtimeSnapshot);

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

  var loseCloseButtonNode = loseContent ? loseContent.getChildByName("btn_close") : null;
  if (!loseCloseButtonNode && loseView) {
    loseCloseButtonNode = loseView.getChildByName("btn_close");
  }
  this._bindLoseButton(loseCloseButtonNode, "back");
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
module.exports.buildLoseRevivePresentation = buildLoseRevivePresentation;
module.exports.buildLoseClearanceTargetPresentation = buildLoseClearanceTargetPresentation;
module.exports.getSpriteFrameWidthAtHeight = getSpriteFrameWidthAtHeight;
