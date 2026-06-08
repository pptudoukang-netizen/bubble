"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var SIGN_IN_PREFAB_CANDIDATES = Shared.SIGN_IN_PREFAB_CANDIDATES;
var SIGN_IN_BUTTON_SPRITE_PATHS = Shared.SIGN_IN_BUTTON_SPRITE_PATHS;
var SIGN_IN_ITEM_ICON_PATHS = Shared.SIGN_IN_ITEM_ICON_PATHS;
var SIGN_IN_DAY_ITEM_ICON_PATHS = Shared.SIGN_IN_DAY_ITEM_ICON_PATHS;
var SIGN_IN_ITEM_DISPLAY_NAMES = Shared.SIGN_IN_ITEM_DISPLAY_NAMES;
var AWARD_VIEW_PREFAB_PATH = Shared.AWARD_VIEW_PREFAB_PATH;
var AWARD_ITEM_ICON_PATHS = Shared.AWARD_ITEM_ICON_PATHS;
var AWARD_ITEM_DISPLAY_NAMES = Shared.AWARD_ITEM_DISPLAY_NAMES;
var hasOwn = Shared.hasOwn;
var normalizeAwardPopupItems = Shared.normalizeAwardPopupItems;
var PopupPanelAnimator = Shared.PopupPanelAnimator;
var AWARD_LIST_ITEM_SPACING = 10;
var AWARD_LIST_MIN_VIEWPORT_WIDTH = 160;
var AWARD_LIST_MAX_VIEWPORT_WIDTH = 450;
var SIGN_IN_GIFT_ICON_WIDTH = 70;
var SIGN_IN_GIFT_ITEM_WIDTH = 70;
var SIGN_IN_GIFT_ITEM_HEIGHT = 110;
var SIGN_IN_GIFT_ITEM_SPACING = 8;
var SIGN_IN_DAY_TEXT = [
  "",
  "第一天",
  "第二天",
  "第三天",
  "第四天",
  "第五天",
  "第六天",
  "第七天"
];

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("AwardView requires " + description + ".");
  }
  return node;
}

function requirePositiveNumber(value, description) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error("AwardView requires positive " + description + ".");
  }
  return numberValue;
}

function requirePositiveInteger(value, description) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("AwardView requires positive integer " + description + ".");
  }
  return value;
}

function findNodeByNameWithComponent(rootNode, name, componentClass) {
  requireValidNode(rootNode, "root node");
  if (!name || typeof name !== "string") {
    throw new Error("AwardView requires node name.");
  }
  if (!componentClass) {
    throw new Error("AwardView requires component class.");
  }

  var queue = [rootNode];
  while (queue.length > 0) {
    var node = queue.shift();
    requireValidNode(node, name);
    if (node.name === name && node.getComponent(componentClass)) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      Array.prototype.push.apply(queue, node.children);
    }
  }

  throw new Error("AwardView requires " + name + " with component.");
}

function calculateAwardContentWidth(awardListNode, itemWidth, itemCount) {
  var listWidth = requirePositiveNumber(awardListNode.width, "award list width");
  var totalItemWidth = calculateAwardItemsWidth(itemWidth, itemCount);
  return Math.max(listWidth, totalItemWidth);
}

function calculateAwardListViewportWidth(itemWidth, itemCount) {
  var totalItemWidth = calculateAwardItemsWidth(itemWidth, itemCount);
  return Math.min(
    AWARD_LIST_MAX_VIEWPORT_WIDTH,
    Math.max(AWARD_LIST_MIN_VIEWPORT_WIDTH, totalItemWidth)
  );
}

function calculateAwardItemsWidth(itemWidth, itemCount) {
  requirePositiveNumber(itemWidth, "award item width");
  requirePositiveInteger(itemCount, "award item count");
  return (itemCount * itemWidth) + ((itemCount - 1) * AWARD_LIST_ITEM_SPACING);
}

function calculateCenteredAwardItemX(contentWidth, itemWidth, itemCount, itemIndex) {
  requirePositiveNumber(contentWidth, "award content width");
  requirePositiveNumber(itemWidth, "award item width");
  requirePositiveInteger(itemCount, "award item count");
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) {
    throw new Error("AwardView requires valid award item index.");
  }

  var totalItemWidth = calculateAwardItemsWidth(itemWidth, itemCount);
  var startX = (contentWidth - totalItemWidth) / 2;
  if (startX < 0) {
    throw new Error("AwardView content width is smaller than award item total width.");
  }
  return startX + (itemWidth / 2) + (itemIndex * (itemWidth + AWARD_LIST_ITEM_SPACING));
}

function requireSignInDisplayRewardItem(rewardEntry, day) {
  if (!rewardEntry || !Array.isArray(rewardEntry.items) || rewardEntry.items.length <= 0) {
    throw new Error("Sign-in display reward config is missing for day " + day + ".");
  }

  if (rewardEntry.displayItem) {
    if (typeof rewardEntry.displayItem.id !== "string" || !rewardEntry.displayItem.id) {
      throw new Error("Sign-in displayItem id is missing at day " + day + ".");
    }
    var displayCount = Math.floor(Number(rewardEntry.displayItem.count));
    if (!Number.isFinite(displayCount) || displayCount < 1) {
      throw new Error("Sign-in displayItem count is invalid at day " + day + ".");
    }
    return {
      id: rewardEntry.displayItem.id,
      count: displayCount
    };
  }

  for (var i = 0; i < rewardEntry.items.length; i += 1) {
    var item = rewardEntry.items[i];
    if (!item || typeof item.id !== "string" || !item.id) {
      throw new Error("Sign-in display reward item id is missing at day " + day + ", index " + i + ".");
    }

    var count = Math.floor(Number(item.count));
    if (!Number.isFinite(count) || count < 1) {
      throw new Error("Sign-in display reward item count is invalid at day " + day + ", index " + i + ".");
    }

    if (item.id !== "coin") {
      return {
        id: item.id,
        count: count
      };
    }
  }

  return {
    id: rewardEntry.items[0].id,
    count: Math.floor(Number(rewardEntry.items[0].count))
  };
}

function formatSignInDayText(day) {
  if (!Number.isInteger(day) || day < 1 || day >= SIGN_IN_DAY_TEXT.length) {
    throw new Error("Sign-in day text requires day within cycle: " + day);
  }
  return SIGN_IN_DAY_TEXT[day];
}

function resolveSignInStatusText(day, dayState) {
  if (dayState === "claimed") {
    return "已领取";
  }
  if (dayState === "claimable" || dayState === "locked") {
    return formatSignInDayText(day);
  }
  throw new Error("Sign-in day state is invalid: " + dayState);
}

function requireCustomSpriteSizeMode(description) {
  if (!cc || !cc.Sprite || !cc.Sprite.SizeMode || !Number.isInteger(cc.Sprite.SizeMode.CUSTOM)) {
    throw new Error(description + " requires cc.Sprite.SizeMode.CUSTOM.");
  }
  return cc.Sprite.SizeMode.CUSTOM;
}

function resizeSpriteNodeToSpriteFrameWidth(node, sprite, spriteFrame, targetWidth, description) {
  requireValidNode(node, description + " node");
  if (!sprite || !sprite.node || !sprite.node.isValid) {
    throw new Error(description + " sprite is invalid.");
  }
  if (!spriteFrame || typeof spriteFrame.getRect !== "function") {
    throw new Error(description + " sprite frame must expose rect.");
  }

  var rect = spriteFrame.getRect();
  var frameWidth = requirePositiveNumber(rect && rect.width, description + " frame width");
  var frameHeight = requirePositiveNumber(rect && rect.height, description + " frame height");
  var safeTargetWidth = requirePositiveNumber(targetWidth, description + " target width");
  sprite.sizeMode = requireCustomSpriteSizeMode(description);
  node.scaleX = 1;
  node.scaleY = 1;
  node.setContentSize(safeTargetWidth, (safeTargetWidth * frameHeight) / frameWidth);
}

module.exports = {
  _getDailySignInConfig: function () {
    if (this.dailySignInConfig && Array.isArray(this.dailySignInConfig.rewards)) {
      return this.dailySignInConfig;
    }
    throw new Error("GameBootstrap requires dailySignInConfig.rewards.");
  },

  _refreshSignInState: function () {
    if (!this.signInStore || typeof this.signInStore.load !== "function") {
      throw new Error("GameBootstrap requires SignInStore.load.");
    }

    this.signInState = this.signInStore.load();
    return this.signInState;
  },

  _markSignInPopupShown: function (now) {
    if (!this.signInStore || typeof this.signInStore.markPopupShown !== "function") {
      throw new Error("GameBootstrap requires SignInStore.markPopupShown.");
    }

    this._refreshSignInState();
    var markResult = this.signInStore.markPopupShown(this.signInState, now === undefined ? new Date() : now);
    if (!markResult || !markResult.state) {
      throw new Error("SignInStore.markPopupShown must return state.");
    }
    this.signInState = markResult.state;
    this.signInStore.save(this.signInState);
  },

  _canClaimSignInToday: function (now) {
    this._refreshSignInState();
    if (this.signInStore && typeof this.signInStore.canClaimToday === "function") {
      return this.signInStore.canClaimToday(this.signInState, now === undefined ? new Date() : now);
    }
    throw new Error("GameBootstrap requires SignInStore.canClaimToday.");
  },

  _ensureSignInEntryRedDot: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      return null;
    }

    var redDotNode = entryNode.getChildByName("sign_in_red_dot");
    if (redDotNode && redDotNode.isValid) {
      return redDotNode;
    }

    redDotNode = new cc.Node("sign_in_red_dot");
    redDotNode.parent = entryNode;
    redDotNode.zIndex = 20;
    redDotNode.setPosition((entryNode.width * 0.5) - 14, (entryNode.height * 0.5) - 10);
    var graphics = redDotNode.addComponent(cc.Graphics);
    graphics.clear();
    graphics.fillColor = cc.color(255, 58, 58, 255);
    graphics.circle(0, 0, 10);
    graphics.fill();

    return redDotNode;
  },

  _updateSignInEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    if (!bottomLayerNode || !bottomLayerNode.isValid) {
      throw new Error("LevelView bottom_layer is required for sign-in entry.");
    }

    var signButtonNode = bottomLayerNode.getChildByName("sign_btn");
    if (!signButtonNode || !signButtonNode.isValid) {
      throw new Error("LevelView bottom_layer requires sign_btn.");
    }

    this._bindNodeTapOnce(signButtonNode, function () {
      this._playSfx("uiClick");
      this._showSignInView({
        markPopupShown: true
      });
    }.bind(this));

    var redDotNode = this._ensureSignInEntryRedDot(signButtonNode);
    if (!redDotNode || !redDotNode.isValid) {
      return;
    }

    redDotNode.active = this._canClaimSignInToday();
  },

  _ensureSignInViewPrefab: function () {
    if (this._signInViewPrefab) {
      return Promise.resolve(this._signInViewPrefab);
    }

    return this._tryLoadFirstAvailablePrefab(SIGN_IN_PREFAB_CANDIDATES, {
      silent: true
    }).then(function (prefab) {
      if (!prefab) {
        throw new Error("SignInView prefab not found.");
      }
      this._signInViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureSignInButtonSpriteFrames: function () {
    if (
      this._signInButtonSpriteFrames &&
      this._signInButtonSpriteFrames.claimed &&
      this._signInButtonSpriteFrames.claimable &&
      this._signInButtonSpriteFrames.locked
    ) {
      return Promise.resolve(this._signInButtonSpriteFrames);
    }
    if (this._signInButtonSpriteLoadPromise) {
      return this._signInButtonSpriteLoadPromise;
    }

    var loadSpriteFrame = function (path) {
      return new Promise(function (resolve) {
        BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
          if (error) {
            Logger.warn("Load sign-in sprite failed", path, error && error.message ? error.message : error);
            resolve(null);
            return;
          }

          resolve(spriteFrame || null);
        });
      });
    };

    this._signInButtonSpriteLoadPromise = Promise.all([
      loadSpriteFrame(SIGN_IN_BUTTON_SPRITE_PATHS.claimed),
      loadSpriteFrame(SIGN_IN_BUTTON_SPRITE_PATHS.claimable),
      loadSpriteFrame(SIGN_IN_BUTTON_SPRITE_PATHS.locked)
    ]).then(function (results) {
      this._signInButtonSpriteFrames = {
        claimed: results[0] || null,
        claimable: results[1] || null,
        locked: results[2] || null
      };
      this._signInButtonSpriteLoadPromise = null;
      return this._signInButtonSpriteFrames;
    }.bind(this)).catch(function (error) {
      this._signInButtonSpriteLoadPromise = null;
      Logger.warn("Load sign-in button sprites failed", error && error.message ? error.message : error);
      return {
        claimed: null,
        claimable: null,
        locked: null
      };
    }.bind(this));

    return this._signInButtonSpriteLoadPromise;
  },

  _resolveSignInRewardByDay: function (day) {
    var signInConfig = this._getDailySignInConfig();
    var rewards = Array.isArray(signInConfig.rewards) ? signInConfig.rewards : [];
    for (var i = 0; i < rewards.length; i += 1) {
      if (Math.floor(Number(rewards[i].day) || 0) === day) {
        return rewards[i];
      }
    }
    return null;
  },

  _resolveSignInDisplayRewardItem: function (rewardEntry, day) {
    return requireSignInDisplayRewardItem(rewardEntry, day);
  },

  _resolveSignInIconPath: function (day, itemId) {
    var safeItemId = typeof itemId === "string" && itemId ? itemId : "coin";
    var dayIconPaths = SIGN_IN_DAY_ITEM_ICON_PATHS[Math.floor(Number(day) || 0)] || null;
    if (dayIconPaths && dayIconPaths[safeItemId]) {
      return dayIconPaths[safeItemId];
    }
    return SIGN_IN_ITEM_ICON_PATHS[safeItemId] || SIGN_IN_ITEM_ICON_PATHS.coin;
  },

  _ensureSignInIconSpriteFrame: function (itemId, day) {
    var safeItemId = typeof itemId === "string" && itemId ? itemId : "coin";
    var path = this._resolveSignInIconPath(day, safeItemId);
    var cacheKey = (path || "") + "|" + safeItemId;
    this._signInIconSpriteFrameCache = this._signInIconSpriteFrameCache || {};
    if (this._signInIconSpriteFrameCache[cacheKey]) {
      return Promise.resolve(this._signInIconSpriteFrameCache[cacheKey]);
    }

    return new Promise(function (resolve) {
      BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
        if (error) {
          Logger.warn("Load sign-in icon failed", path, error && error.message ? error.message : error);
          resolve(null);
          return;
        }

        this._signInIconSpriteFrameCache[cacheKey] = spriteFrame || null;
        resolve(this._signInIconSpriteFrameCache[cacheKey]);
      }.bind(this));
    }.bind(this));
  },

  _resolveSignInDayUiState: function (day, state, canClaimToday) {
    var claimedDays = state && Array.isArray(state.claimedDaysInCycle) ? state.claimedDaysInCycle : [];
    if (claimedDays.indexOf(day) >= 0) {
      return "claimed";
    }

    var currentCycleDay = Math.max(1, Math.floor(Number(state && state.currentCycleDay) || 1));
    if (canClaimToday && day === currentCycleDay) {
      return "claimable";
    }

    return "locked";
  },

  _isSignInAutoPopupEnabled: function () {
    if (!this.signInStore || typeof this.signInStore.isAutoPopupEnabled !== "function") {
      throw new Error("GameBootstrap requires SignInStore.isAutoPopupEnabled.");
    }
    return this.signInStore.isAutoPopupEnabled();
  },

  _setSignInAutoPopupEnabled: function (enabled) {
    if (!this.signInStore || typeof this.signInStore.setAutoPopupEnabled !== "function") {
      throw new Error("GameBootstrap requires SignInStore.setAutoPopupEnabled.");
    }
    this.signInStore.setAutoPopupEnabled(enabled);
  },

  _renderSignInAutoPopupCheckbox: function (signInViewNode) {
    var checkBoxNode = this._findNodeByNameRecursive(signInViewNode, "check_box");
    if (!checkBoxNode || !checkBoxNode.isValid) {
      throw new Error("SignInView requires check_box.");
    }
    var selectNode = checkBoxNode.getChildByName("select");
    if (!selectNode || !selectNode.isValid) {
      throw new Error("SignInView check_box requires select.");
    }

    selectNode.active = this._isSignInAutoPopupEnabled();
  },

  _renderSignInGiftList: function (dayNode, rewardEntry, iconLoadTasks) {
    if (!dayNode || !dayNode.isValid) {
      throw new Error("SignInView day7 node is invalid.");
    }
    if (!rewardEntry || !Array.isArray(rewardEntry.items) || rewardEntry.items.length <= 0) {
      throw new Error("SignInView day7 gift_list requires reward items.");
    }
    if (!Array.isArray(iconLoadTasks)) {
      throw new Error("SignInView day7 gift_list requires icon load task list.");
    }

    var giftListNode = dayNode.getChildByName("gift_list");
    if (!giftListNode || !giftListNode.isValid) {
      throw new Error("SignInView day7 requires gift_list.");
    }
    var itemTemplateNode = giftListNode.getChildByName("item");
    if (!itemTemplateNode || !itemTemplateNode.isValid) {
      throw new Error("SignInView day7 gift_list requires item template.");
    }

    var layout = giftListNode.getComponent(cc.Layout);
    if (layout) {
      layout.enabled = false;
    }

    for (var childIndex = giftListNode.children.length - 1; childIndex >= 0; childIndex -= 1) {
      var child = giftListNode.children[childIndex];
      if (!child || !child.isValid || child === itemTemplateNode) {
        continue;
      }
      child.destroy();
    }

    var itemCount = rewardEntry.items.length;
    if (itemCount !== 3) {
      throw new Error("SignInView day7 gift_list requires exactly 3 reward items.");
    }
    var totalWidth = (itemCount * SIGN_IN_GIFT_ITEM_WIDTH) + ((itemCount - 1) * SIGN_IN_GIFT_ITEM_SPACING);
    giftListNode.setContentSize(totalWidth, SIGN_IN_GIFT_ITEM_HEIGHT);
    itemTemplateNode.active = false;

    var startX = -totalWidth / 2 + SIGN_IN_GIFT_ITEM_WIDTH / 2;
    for (var i = 0; i < itemCount; i += 1) {
      var rewardItem = rewardEntry.items[i];
      if (!rewardItem || typeof rewardItem.id !== "string" || !rewardItem.id) {
        throw new Error("SignInView day7 gift item id is missing at index " + i + ".");
      }
      var count = Math.floor(Number(rewardItem.count));
      if (!Number.isFinite(count) || count < 1) {
        throw new Error("SignInView day7 gift item count is invalid at index " + i + ".");
      }

      var itemNode = cc.instantiate(itemTemplateNode);
      if (!itemNode || !itemNode.isValid) {
        throw new Error("SignInView day7 gift item instantiate failed at index " + i + ".");
      }
      itemNode.name = "item_" + (i + 1);
      itemNode.parent = giftListNode;
      itemNode.active = true;
      itemNode.setContentSize(SIGN_IN_GIFT_ITEM_WIDTH, SIGN_IN_GIFT_ITEM_HEIGHT);
      itemNode.x = startX + (i * (SIGN_IN_GIFT_ITEM_WIDTH + SIGN_IN_GIFT_ITEM_SPACING));
      itemNode.y = 0;

      var iconNode = itemNode.getChildByName("icon");
      var iconSprite = iconNode ? iconNode.getComponent(cc.Sprite) : null;
      var numNode = itemNode.getChildByName("num");
      var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
      if (!iconNode || !iconNode.isValid || !iconSprite || !numLabel) {
        throw new Error("SignInView day7 gift item structure is incomplete.");
      }
      iconSprite.sizeMode = requireCustomSpriteSizeMode("Sign-in gift icon");
      iconNode.scaleX = 1;
      iconNode.scaleY = 1;
      iconNode.width = SIGN_IN_GIFT_ICON_WIDTH;

      numLabel.string = "x" + count;
      (function (targetIconNode, targetSprite, targetItemId) {
        iconLoadTasks.push(this._ensureSignInIconSpriteFrame(targetItemId, 7).then(function (spriteFrame) {
          if (!targetSprite || !targetSprite.node || !targetSprite.node.isValid) {
            throw new Error("SignInView day7 gift icon node invalid while rendering.");
          }
          if (!spriteFrame) {
            throw new Error("SignInView day7 gift icon sprite frame is empty: " + targetItemId);
          }
          targetSprite.sizeMode = requireCustomSpriteSizeMode("Sign-in gift icon");
          targetSprite.spriteFrame = spriteFrame;
          resizeSpriteNodeToSpriteFrameWidth(targetIconNode, targetSprite, spriteFrame, SIGN_IN_GIFT_ICON_WIDTH, "Sign-in gift icon");
        }));
      }.bind(this))(iconNode, iconSprite, rewardItem.id);
    }
  },

  _bindSignInViewActions: function (signInViewNode) {
    if (!signInViewNode || !signInViewNode.isValid) {
      return;
    }

    var closeButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_close");
    var claimButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award");
    var claimAdButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award_ad");
    var checkBoxNode = this._findNodeByNameRecursive(signInViewNode, "check_box");
    var maskNode = this._findNodeByNameRecursive(signInViewNode, "mask");

    this._bindNodeTapOnce(closeButtonNode, function () {
      this._playSfx("uiClick");
      this._hideSignInView();
    }.bind(this));
    this._bindNodeTapOnce(maskNode, function () {
      this._playSfx("uiClick");
      this._hideSignInView();
    }.bind(this));
    this._bindNodeTapOnce(claimButtonNode, function () {
      this._playSfx("uiClick");
      this._claimTodaySignInReward();
    }.bind(this));
    this._bindNodeTapOnce(claimAdButtonNode, function () {
      this._playSfx("uiClick");
      this._claimTodaySignInRewardByAd();
    }.bind(this));
    this._bindNodeTapOnce(checkBoxNode, function () {
      this._playSfx("uiClick");
      var nextEnabled = !this._isSignInAutoPopupEnabled();
      this._setSignInAutoPopupEnabled(nextEnabled);
      this._renderSignInAutoPopupCheckbox(signInViewNode);
      this._setStatus(nextEnabled ? "已开启签到自动弹出" : "已关闭签到自动弹出");
    }.bind(this));
  },

  _renderSignInView: function () {
    var signInViewNode = this._signInViewNode;
    if (!signInViewNode || !signInViewNode.isValid) {
      return;
    }

    this._refreshSignInState();
    var canClaimToday = this._canClaimSignInToday();
    var currentState = this.signInState || {
      currentCycleDay: 1,
      claimedDaysInCycle: []
    };
    var iconLoadTasks = [];

    for (var day = 1; day <= 7; day += 1) {
      var dayNode = this._findNodeByNameRecursive(signInViewNode, "day" + day);
      if (!dayNode || !dayNode.isValid) {
        continue;
      }

      var dayLabelNode = dayNode.getChildByName("day");
      var dayLabel = dayLabelNode ? dayLabelNode.getComponent(cc.Label) : null;
      if (dayLabel) {
        dayLabel.string = formatSignInDayText(day);
      }

      var rewardEntry = this._resolveSignInRewardByDay(day);
      var displayItem = this._resolveSignInDisplayRewardItem(rewardEntry, day);
      var iconNode = dayNode.getChildByName("icon");
      var iconSprite = iconNode ? iconNode.getComponent(cc.Sprite) : null;
      if (iconSprite && displayItem && displayItem.id) {
        (function (targetSprite, targetItemId, targetDay) {
          iconLoadTasks.push(this._ensureSignInIconSpriteFrame(targetItemId, targetDay).then(function (spriteFrame) {
            if (!targetSprite || !targetSprite.node || !targetSprite.node.isValid || !spriteFrame) {
              return;
            }
            targetSprite.spriteFrame = spriteFrame;
          }));
        }.bind(this))(iconSprite, displayItem.id, day);
      }

      var numNode = dayNode.getChildByName("num");
      var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
      if (!numLabel && day < 7) {
        throw new Error("SignInView day" + day + " requires num label.");
      }
      if (numLabel) {
        numLabel.string = "x" + displayItem.count;
      }

      var dayState = this._resolveSignInDayUiState(day, currentState, canClaimToday);
      var awardButtonNode = dayNode.getChildByName("award_btn");
      var statusNode = awardButtonNode ? awardButtonNode.getChildByName("status") : null;
      var statusLabel = statusNode ? statusNode.getComponent(cc.Label) : null;
      if (statusLabel) {
        statusLabel.string = resolveSignInStatusText(day, dayState);
      }
      if (awardButtonNode && awardButtonNode.isValid) {
        var awardButton = awardButtonNode.getComponent(cc.Button);
        if (awardButton) {
          awardButton.enableAutoGrayEffect = false;
          awardButton.interactable = true;
        }
        awardButtonNode.color = cc.color(255, 255, 255, 255);
        var awardSprite = awardButtonNode.getComponent(cc.Sprite);
        if (awardSprite && this._signInButtonSpriteFrames) {
          awardSprite.spriteFrame = this._signInButtonSpriteFrames[dayState];
        }
      }

      if (day === 7) {
        this._renderSignInGiftList(dayNode, rewardEntry, iconLoadTasks);
      }
    }

    this._renderSignInAutoPopupCheckbox(signInViewNode);

    var claimButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award");
    if (claimButtonNode && claimButtonNode.isValid) {
      var claimButton = claimButtonNode.getComponent(cc.Button);
      if (claimButton) {
        claimButton.enableAutoGrayEffect = false;
        claimButton.interactable = true;
      }
      claimButtonNode.color = cc.color(255, 255, 255, 255);
    }
    var claimAdButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award_ad");
    if (claimAdButtonNode && claimAdButtonNode.isValid) {
      var claimAdButton = claimAdButtonNode.getComponent(cc.Button);
      if (claimAdButton) {
        claimAdButton.enableAutoGrayEffect = false;
        claimAdButton.interactable = true;
      }
      claimAdButtonNode.color = cc.color(255, 255, 255, 255);
    }

    Promise.all(iconLoadTasks).catch(function (error) {
      Logger.warn("Render sign-in icons failed", error && error.message ? error.message : error);
    });
  },

  _showSignInView: function (options) {
    options = options || {};
    if (options.markPopupShown !== false) {
      this._markSignInPopupShown(options.now || new Date());
    }
    this._hideAwardView();
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
    this._hideShopView();

    this._ensureSignInViewPrefab().then(function (prefab) {
      if (!prefab) {
        this._setStatus("签到界面加载失败");
        return;
      }

      return this._ensureSignInButtonSpriteFrames().then(function () {
        var signInViewNode = this._signInViewNode;
        if (!signInViewNode || !signInViewNode.isValid) {
          signInViewNode = cc.instantiate(prefab);
          if (!signInViewNode) {
            this._setStatus("签到界面创建失败");
            return;
          }
          signInViewNode.parent = this.node;
          signInViewNode.setPosition(0, 0);
          signInViewNode.zIndex = 300;
          this._signInViewNode = signInViewNode;
          this._bindSignInViewActions(signInViewNode);
        }

        signInViewNode.active = true;
        PopupPanelAnimator.play(signInViewNode, { targetNodeName: "ContentContainer" });
        this._renderSignInView();
      }.bind(this));
    }.bind(this)).catch(function (error) {
      Logger.warn("Show sign-in view failed", error && error.message ? error.message : error);
      this._setStatus("签到界面加载失败");
    }.bind(this));
  },

  _hideSignInView: function () {
    if (!this._signInViewNode || !this._signInViewNode.isValid) {
      return;
    }
    this._signInViewNode.active = false;
  },

  _ensureAwardViewPrefab: function () {
    if (this._awardViewPrefab) {
      return Promise.resolve(this._awardViewPrefab);
    }

    return this._loadPrefab(AWARD_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("AwardView prefab load returned empty.");
      }
      this._awardViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureAwardItemIconSpriteFrame: function (itemId) {
    if (!hasOwn.call(AWARD_ITEM_ICON_PATHS, itemId)) {
      throw new Error("Unsupported award icon item id: " + itemId);
    }

    this._awardItemIconSpriteFrameCache = this._awardItemIconSpriteFrameCache || {};
    if (this._awardItemIconSpriteFrameCache[itemId]) {
      return Promise.resolve(this._awardItemIconSpriteFrameCache[itemId]);
    }

    var path = AWARD_ITEM_ICON_PATHS[itemId];
    return new Promise(function (resolve, reject) {
      BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
        if (error) {
          reject(new Error("Load award icon failed: " + path + ", " + (error.message || error)));
          return;
        }
        if (!spriteFrame) {
          reject(new Error("Award icon sprite frame is empty: " + path));
          return;
        }

        this._awardItemIconSpriteFrameCache[itemId] = spriteFrame;
        resolve(spriteFrame);
      }.bind(this));
    }.bind(this));
  },

  _resolveAwardViewNodes: function (awardViewNode) {
    if (!awardViewNode || !awardViewNode.isValid) {
      throw new Error("AwardView node is invalid.");
    }

    var panelNode = this._findNodeByNameRecursive(awardViewNode, "Panel");
    var maskNode = this._findNodeByNameRecursive(awardViewNode, "mask");
    var closeButtonNode = this._findNodeByNameRecursive(awardViewNode, "btn_close");
    var confirmButtonNode = this._findNodeByNameRecursive(awardViewNode, "sure_btn");
    var awardListNode = findNodeByNameWithComponent(awardViewNode, "award_list", cc.ScrollView);
    var scrollView = awardListNode.getComponent(cc.ScrollView);
    var viewNode = awardListNode.getChildByName("view");
    var contentNode = scrollView ? scrollView.content : null;
    var itemTemplateNode = contentNode ? contentNode.getChildByName("award_item") : null;

    if (!panelNode || !maskNode || !closeButtonNode || !confirmButtonNode || !awardListNode || !scrollView || !viewNode || !contentNode || !itemTemplateNode) {
      throw new Error("AwardView prefab structure is incomplete.");
    }

    return {
      panelNode: panelNode,
      maskNode: maskNode,
      closeButtonNode: closeButtonNode,
      confirmButtonNode: confirmButtonNode,
      awardListNode: awardListNode,
      viewNode: viewNode,
      scrollView: scrollView,
      contentNode: contentNode,
      itemTemplateNode: itemTemplateNode,
    };
  },

  _bindAwardViewActions: function (awardViewNode) {
    var nodes = this._resolveAwardViewNodes(awardViewNode);
    this._bindNodeTapOnce(nodes.closeButtonNode, function () {
      this._playSfx("uiClick");
      this._hideAwardView();
    }.bind(this));
    this._bindNodeTapOnce(nodes.maskNode, function () {
      this._playSfx("uiClick");
      this._hideAwardView();
    }.bind(this));
    this._bindNodeTapOnce(nodes.confirmButtonNode, function () {
      this._playSfx("uiClick");
      this._hideAwardView();
    }.bind(this));
  },

  _renderAwardView: function (rewardItems) {
    var normalizedItems = normalizeAwardPopupItems(rewardItems);
    var nodes = this._resolveAwardViewNodes(this._awardViewNode);
    var awardListNode = nodes.awardListNode;
    var viewNode = nodes.viewNode;
    var contentNode = nodes.contentNode;
    var itemTemplateNode = nodes.itemTemplateNode;
    var itemWidth = requirePositiveNumber(itemTemplateNode.width, "award item width");

    for (var childIndex = contentNode.children.length - 1; childIndex >= 0; childIndex -= 1) {
      var child = contentNode.children[childIndex];
      if (!child || !child.isValid || child === itemTemplateNode) {
        continue;
      }
      child.destroy();
    }

    var viewportWidth = calculateAwardListViewportWidth(itemWidth, normalizedItems.length);
    awardListNode.width = viewportWidth;
    viewNode.width = viewportWidth;
    var contentWidth = calculateAwardContentWidth(awardListNode, itemWidth, normalizedItems.length);
    contentNode.width = contentWidth;

    var iconTasks = [];
    for (var i = 0; i < normalizedItems.length; i += 1) {
      var rewardItem = normalizedItems[i];
      var itemNode = i === 0 ? itemTemplateNode : cc.instantiate(itemTemplateNode);
      if (i > 0) {
        itemNode.parent = contentNode;
      }
      itemNode.active = true;
      itemNode.x = calculateCenteredAwardItemX(contentWidth, itemWidth, normalizedItems.length, i);
      itemNode.y = 0;

      var iconNode = itemNode.getChildByName("icon");
      var iconSprite = iconNode ? iconNode.getComponent(cc.Sprite) : null;
      var nameNode = itemNode.getChildByName("name");
      var nameLabel = nameNode ? nameNode.getComponent(cc.Label) : null;
      var numNode = itemNode.getChildByName("num");
      var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
      if (!iconSprite || !nameLabel || !numLabel) {
        throw new Error("Award item node structure is incomplete.");
      }

      nameLabel.string = AWARD_ITEM_DISPLAY_NAMES[rewardItem.id];
      numLabel.string = "x" + rewardItem.count;

      (function (targetSprite, itemId) {
        iconTasks.push(this._ensureAwardItemIconSpriteFrame(itemId).then(function (spriteFrame) {
          if (!targetSprite || !targetSprite.node || !targetSprite.node.isValid) {
            throw new Error("Award icon node invalid while rendering.");
          }
          targetSprite.spriteFrame = spriteFrame;
        }));
      }.bind(this))(iconSprite, rewardItem.id);
    }

    return Promise.all(iconTasks);
  },

  _showAwardViewForRewardItems: function (rewardItems) {
    var normalizedItems = normalizeAwardPopupItems(rewardItems);
    return this._ensureAwardViewPrefab().then(function (prefab) {
      var awardViewNode = this._awardViewNode;
      if (!awardViewNode || !cc.isValid(awardViewNode)) {
        awardViewNode = cc.instantiate(prefab);
        if (!awardViewNode || !awardViewNode.isValid) {
          throw new Error("Create AwardView node failed.");
        }
        awardViewNode.parent = this.node;
        awardViewNode.zIndex = 360;
        awardViewNode.setPosition(0, 0);
        this._awardViewNode = awardViewNode;
        this._bindAwardViewActions(awardViewNode);
      }

      awardViewNode.active = true;
      PopupPanelAnimator.play(awardViewNode);
      return this._renderAwardView(normalizedItems);
    }.bind(this));
  },

  _hideAwardView: function () {
    if (!this._awardViewNode || !this._awardViewNode.isValid) {
      return;
    }
    this._awardViewNode.active = false;
    if (
      this._gameCircleWelfareViewNode &&
      cc.isValid(this._gameCircleWelfareViewNode) &&
      this._gameCircleWelfareViewNode.active &&
      this._gameCircleWelfareViewController
    ) {
      this._renderGameCircleWelfareView().catch(function (error) {
        Logger.error("Restore game circle welfare view after award close failed", error && error.message ? error.message : error);
      });
    }
  },

  _grantSignInRewardItems: function (rewardItems) {
    var summaryTexts = [];
    var items = Array.isArray(rewardItems) ? rewardItems : [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i] || {};
      var itemId = typeof item.id === "string" ? item.id : "";
      var count = Math.max(1, Math.floor(Number(item.count) || 1));

      if (itemId === "coin") {
        this._refreshPlayerResources();
        this.playerResources.coins = Math.max(0, Math.floor(Number(this.playerResources.coins) || 0)) + count;
        if (this.playerResourceStore && typeof this.playerResourceStore.save === "function") {
          this.playerResourceStore.save(this.playerResources);
        }
        summaryTexts.push("金币 +" + count);
        continue;
      }

      if (typeof this._addInventoryItem === "function") {
        var addResult = this._addInventoryItem(itemId, count);
        if (addResult && addResult.accepted) {
          var displayName = SIGN_IN_ITEM_DISPLAY_NAMES[itemId] || itemId;
          summaryTexts.push(displayName + " +" + addResult.gained);
        }
      }
    }

    return summaryTexts;
  },

  _resolveSignInRewardItemsForDay: function (day, multiplier) {
    var safeDay = Math.floor(Number(day));
    if (!Number.isFinite(safeDay) || safeDay < 1) {
      throw new Error("Sign-in reward day is invalid: " + day);
    }

    var safeMultiplier = Math.floor(Number(multiplier));
    if (!Number.isFinite(safeMultiplier) || safeMultiplier < 1) {
      throw new Error("Sign-in reward multiplier is invalid: " + multiplier);
    }

    var rewardEntry = this._resolveSignInRewardByDay(safeDay);
    if (!rewardEntry || !Array.isArray(rewardEntry.items) || rewardEntry.items.length <= 0) {
      throw new Error("Sign-in reward config is missing for day " + safeDay + ".");
    }

    return rewardEntry.items.map(function (item, index) {
      if (!item || typeof item.id !== "string" || !item.id) {
        throw new Error("Sign-in reward item id is missing at day " + safeDay + ", index " + index + ".");
      }

      var count = Math.floor(Number(item.count));
      if (!Number.isFinite(count) || count < 1) {
        throw new Error("Sign-in reward item count is invalid at day " + safeDay + ", index " + index + ".");
      }

      return {
        id: item.id,
        count: count * safeMultiplier
      };
    });
  },

  _completeTodaySignInRewardClaim: function (claimResult, multiplier, successPrefix) {
    if (!claimResult || !claimResult.accepted) {
      throw new Error("Accepted sign-in claim result is required.");
    }

    var rewardItems = this._resolveSignInRewardItemsForDay(claimResult.claimedDay, multiplier);
    this.signInState = claimResult.state;
    this.signInStore.save(this.signInState);

    var summaryTexts = this._grantSignInRewardItems(rewardItems);

    this._updateLevelSelectTopStatus();
    this._renderSignInView();
    this._updateSignInEntryState();

    var summary = summaryTexts.length > 0 ? summaryTexts.join("，") : "奖励已发放";
    this._setStatus(successPrefix + "：" + summary);
    this._showAwardViewForRewardItems(rewardItems).catch(function (error) {
      Logger.error("Show sign-in award view failed", error && error.message ? error.message : error);
      this._setStatus("签到奖励弹窗加载失败");
    }.bind(this));
  },

  _claimTodaySignInReward: function () {
    if (!this.signInStore || typeof this.signInStore.claimToday !== "function") {
      this._setStatus("签到系统未就绪");
      return;
    }

    this._refreshSignInState();
    var now = new Date();
    var claimResult = this.signInStore.claimToday(this.signInState, now);
    if (!claimResult || !claimResult.accepted) {
      if (typeof this._setStatusWithTip === "function") {
        this._setStatusWithTip("sign_in_already_claimed", null, "今日奖励已领取");
      } else {
        this._setStatus("今日奖励已领取");
      }
      this._renderSignInView();
      this._updateSignInEntryState();
      return;
    }

    this._completeTodaySignInRewardClaim(claimResult, 1, "签到成功");
  },

  _claimTodaySignInRewardByAd: function () {
    if (this._signInAdClaimInProgress) {
      this._setStatus("广告处理中，请稍候...");
      return;
    }

    if (typeof this._hasRewardedVideoAdConfig !== "function" || !this._hasRewardedVideoAdConfig()) {
      if (typeof this._setStatusWithTip === "function") {
        this._setStatusWithTip("sign_in_ad_unavailable", null, "暂时还没有广告可看哦");
      } else {
        this._setStatus("暂时还没有广告可看哦");
      }
      return;
    }

    if (!this.signInStore || typeof this.signInStore.claimToday !== "function") {
      throw new Error("Sign-in ad reward requires SignInStore.claimToday.");
    }
    if (typeof this.signInStore.canClaimToday !== "function") {
      throw new Error("Sign-in ad reward requires SignInStore.canClaimToday.");
    }
    if (!this.adService || typeof this.adService.showRewarded !== "function") {
      throw new Error("Sign-in ad reward requires AdService.showRewarded.");
    }
    if (typeof this._canShowRewardedVideoAd !== "function") {
      throw new Error("Sign-in ad reward requires rewarded video ad runtime validation.");
    }
    if (typeof this._requireRewardedVideoAdConfig !== "function") {
      throw new Error("Sign-in ad reward requires rewarded video ad config validation.");
    }
    this._requireRewardedVideoAdConfig();
    if (!this._canShowRewardedVideoAd()) {
      this._setRewardedVideoAdUnavailableStatus();
      return;
    }

    this._refreshSignInState();
    var now = new Date();
    if (!this.signInStore.canClaimToday(this.signInState, now)) {
      if (typeof this._setStatusWithTip === "function") {
        this._setStatusWithTip("sign_in_already_claimed", null, "今日奖励已领取");
      } else {
        this._setStatus("今日奖励已领取");
      }
      this._renderSignInView();
      this._updateSignInEntryState();
      return;
    }

    this._signInAdClaimInProgress = true;
    var adSceneID = "sign_in:double_reward";
    this._trackTelemetry("ad_request", {
      entry_key: "sign_in_double_reward",
      reward_type: "sign_in_double_reward"
    });

    this.adService.showRewarded({
      placement: "sign_in_double_reward",
      sceneID: adSceneID,
      onShow: function () {
        this._trackTelemetry("ad_show", {
          entry_key: "sign_in_double_reward",
          reward_type: "sign_in_double_reward"
        });
      }.bind(this)
    }).then(function (adResult) {
      var isCompleted = !!(adResult && adResult.ok && adResult.isCompleted);
      this._trackTelemetry("ad_close", {
        entry_key: "sign_in_double_reward",
        reward_type: "sign_in_double_reward",
        is_completed: isCompleted,
        is_simulated: !!(adResult && adResult.mock)
      });

      if (!adResult || !adResult.ok) {
        this._setRewardedAdFailureStatus(adResult, "广告加载失败，请稍后重试");
        return;
      }
      if (!isCompleted) {
        this._setStatus("未完整观看广告，签到奖励未发放");
        return;
      }

      var claimResult = this.signInStore.claimToday(this.signInState, now);
      if (!claimResult || !claimResult.accepted) {
        this.adService.reportHostedRewardFailure(adResult);
        this._setStatus("今日奖励已领取");
        this._renderSignInView();
        this._updateSignInEntryState();
        return;
      }

      this._completeTodaySignInRewardClaim(claimResult, 2, "签到双倍领取成功");
      this._trackTelemetry("ad_reward_grant", {
        entry_key: "sign_in_double_reward",
        reward_type: "sign_in_double_reward",
        reward_value: "x2"
      });
      this.adService.reportHostedRewardSuccess(adResult);
    }.bind(this), function (error) {
      this._setRewardedAdFailureStatus({
        code: "show_fail",
        error: error
      }, "广告展示失败，请稍后重试");
    }.bind(this)).then(function () {
      this._signInAdClaimInProgress = false;
    }.bind(this), function (error) {
      this._signInAdClaimInProgress = false;
      this._setRewardedAdFailureStatus({
        code: "show_fail",
        error: error
      }, "广告处理失败，请稍后重试");
      throw error;
    }.bind(this));
  },

  _maybeAutoShowSignInView: function () {
    var signInConfig = this._getDailySignInConfig();
    if (!signInConfig || signInConfig.autoPopupOnFirstLogin === false) {
      return;
    }
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }
    if (typeof this._isNewUserGuideActive !== "function") {
      throw new Error("Sign-in auto popup requires new user guide state method.");
    }
    if (this._isNewUserGuideActive()) {
      return;
    }
    if (!this.signInStore || typeof this.signInStore.shouldAutoPopupToday !== "function") {
      throw new Error("GameBootstrap requires SignInStore.shouldAutoPopupToday.");
    }

    this._refreshSignInState();
    if (!this.signInStore.shouldAutoPopupToday(this.signInState, new Date())) {
      return;
    }

    this._showSignInView({
      markPopupShown: true
    });
  }
};
