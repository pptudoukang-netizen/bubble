"use strict";

function attachLevelRendererSceneWinPopupMethods(LevelRenderer, context) {
  var POPUP_CONTENT_CONTAINER_NAME = context.POPUP_CONTENT_CONTAINER_NAME;
  var POPUP_OPEN_ANIM_DURATION = context.POPUP_OPEN_ANIM_DURATION;
  var POPUP_OPEN_ANIM_FROM_SCALE = context.POPUP_OPEN_ANIM_FROM_SCALE;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC = context.RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC;
  var RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME = context.RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME;
  var SpriteProxyLayerHelper = context.SpriteProxyLayerHelper;
  var WIN_POPUP_OPEN_ANIM_DURATION = context.WIN_POPUP_OPEN_ANIM_DURATION;
  var WIN_POPUP_OPEN_ANIM_FROM_SCALE = context.WIN_POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_STAR_ANIM_STAGGER = context.WIN_STAR_ANIM_STAGGER;
  var WIN_STAR_ANIM_START_DELAY = context.WIN_STAR_ANIM_START_DELAY;
  var WIN_STAR_PUNCH_DOWN_SCALE = context.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_PUNCH_FROM_SCALE = context.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_RECOVER_DURATION = context.WIN_STAR_RECOVER_DURATION;
  var WIN_STAR_SHRINK_DURATION = context.WIN_STAR_SHRINK_DURATION;
  var attachLevelRendererSceneWinPopupMethods = context.attachLevelRendererSceneWinPopupMethods;
  var buildRescueSuccessfulSpiritResourcePath = context.buildRescueSuccessfulSpiritResourcePath;
  var ensureSprite = context.ensureSprite;
  var requireChildNode = context.requireChildNode;
  var requireWinChild = context.requireWinChild;
  var resolveRewardItemSpritePath = context.resolveRewardItemSpritePath;

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
  this._notifyResultViewLifecycle("onRescueSuccessfulViewShow");
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
}

module.exports = attachLevelRendererSceneWinPopupMethods;
