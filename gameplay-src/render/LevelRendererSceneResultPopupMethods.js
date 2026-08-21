"use strict";

function attachLevelRendererSceneResultPopupMethods(LevelRenderer, context) {
  var ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME = context.ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME;
  var LOSE_VIEW_PROXY_ROOT_NAME = context.LOSE_VIEW_PROXY_ROOT_NAME;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var SpriteProxyLayerHelper = context.SpriteProxyLayerHelper;
  var WIN_VIEW_PROXY_ROOT_NAME = context.WIN_VIEW_PROXY_ROOT_NAME;
  var applyLoseReviveLayout = context.applyLoseReviveLayout;
  var attachLevelRendererSceneResultPopupMethods = context.attachLevelRendererSceneResultPopupMethods;
  var buildResultTexts = context.buildResultTexts;
  var buildWinViewRenderKey = context.buildWinViewRenderKey;
  var ensureLabel = context.ensureLabel;
  var ensureOutline = context.ensureOutline;
  var ensureSprite = context.ensureSprite;
  var getOrCreateChild = context.getOrCreateChild;
  var getRuntimeWinClearRewardItems = context.getRuntimeWinClearRewardItems;
  var renderAddBallTipsCoinButton = context.renderAddBallTipsCoinButton;
  var renderLoseCoinButton = context.renderLoseCoinButton;
  var renderLoseFailureStatus = context.renderLoseFailureStatus;
  var renderLoseReviveGain = context.renderLoseReviveGain;
  var requireChildNode = context.requireChildNode;
  var requireFiniteWinNumber = context.requireFiniteWinNumber;
  var requireRuntimeWinStats = context.requireRuntimeWinStats;
  var requireWinChild = context.requireWinChild;
  var resolveLoseRewardEntry = context.resolveLoseRewardEntry;
  var resolveWinLevelDisplayText = context.resolveWinLevelDisplayText;
  var resolveWinStarRating = context.resolveWinStarRating;
  var setNodeTreeActive = context.setNodeTreeActive;
  var setRequiredLabelString = context.setRequiredLabelString;

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
    (runtimeSnapshot.state === "lost_danger" || runtimeSnapshot.state === "lost_hazard" || runtimeSnapshot.state === "out_of_shots" || runtimeSnapshot.state === "lost_objective")
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

module.exports = attachLevelRendererSceneResultPopupMethods;
