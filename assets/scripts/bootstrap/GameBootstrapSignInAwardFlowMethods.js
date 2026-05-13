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
var SIGN_IN_STATUS_TEXT = Shared.SIGN_IN_STATUS_TEXT;
var hasOwn = Shared.hasOwn;
var normalizeAwardPopupItems = Shared.normalizeAwardPopupItems;
var AWARD_LIST_ITEM_SPACING = 10;

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
  if (itemCount <= 0) {
    return listWidth;
  }

  var totalItemWidth = (itemCount * itemWidth) + ((itemCount - 1) * AWARD_LIST_ITEM_SPACING);
  return Math.max(listWidth, totalItemWidth);
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
      this._signInButtonSpriteFrames.claimable
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
      loadSpriteFrame(SIGN_IN_BUTTON_SPRITE_PATHS.claimable)
    ]).then(function (results) {
      this._signInButtonSpriteFrames = {
        claimed: results[0] || null,
        claimable: results[1] || null
      };
      this._signInButtonSpriteLoadPromise = null;
      return this._signInButtonSpriteFrames;
    }.bind(this)).catch(function (error) {
      this._signInButtonSpriteLoadPromise = null;
      Logger.warn("Load sign-in button sprites failed", error && error.message ? error.message : error);
      return {
        claimed: null,
        claimable: null
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

  _resolveSignInDisplayRewardItem: function (rewardEntry) {
    var items = rewardEntry && Array.isArray(rewardEntry.items) ? rewardEntry.items : [];
    if (!items.length) {
      return null;
    }

    for (var i = 0; i < items.length; i += 1) {
      if (items[i] && items[i].id !== "coin") {
        return items[i];
      }
    }
    return items[0];
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

  _bindSignInViewActions: function (signInViewNode) {
    if (!signInViewNode || !signInViewNode.isValid) {
      return;
    }

    var closeButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_close");
    var claimButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award");
    var claimAdButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award_ad");
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
        dayLabel.string = "第" + day + "天";
      }

      var rewardEntry = this._resolveSignInRewardByDay(day);
      var displayItem = this._resolveSignInDisplayRewardItem(rewardEntry);
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

      var dayState = this._resolveSignInDayUiState(day, currentState, canClaimToday);
      var awardButtonNode = dayNode.getChildByName("award_btn");
      var statusNode = awardButtonNode ? awardButtonNode.getChildByName("status") : null;
      var statusLabel = statusNode ? statusNode.getComponent(cc.Label) : null;
      if (statusLabel) {
        statusLabel.string = SIGN_IN_STATUS_TEXT[dayState] || SIGN_IN_STATUS_TEXT.locked;
      }
      if (awardButtonNode && awardButtonNode.isValid) {
        var awardButton = awardButtonNode.getComponent(cc.Button);
        if (awardButton) {
          awardButton.interactable = false;
        }
        var awardSprite = awardButtonNode.getComponent(cc.Sprite);
        if (awardSprite && this._signInButtonSpriteFrames) {
          awardSprite.spriteFrame = dayState === "claimed"
            ? this._signInButtonSpriteFrames.claimed
            : this._signInButtonSpriteFrames.claimable;
        }
      }
    }

    var claimButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award");
    if (claimButtonNode && claimButtonNode.isValid) {
      var claimButton = claimButtonNode.getComponent(cc.Button);
      if (claimButton) {
        claimButton.enableAutoGrayEffect = true;
        claimButton.interactable = canClaimToday;
      }
      claimButtonNode.color = canClaimToday ? cc.color(255, 255, 255, 255) : cc.color(170, 170, 170, 255);
    }
    var claimAdButtonNode = this._findNodeByNameRecursive(signInViewNode, "btn_award_ad");
    if (claimAdButtonNode && claimAdButtonNode.isValid) {
      var claimAdButton = claimAdButtonNode.getComponent(cc.Button);
      if (claimAdButton) {
        claimAdButton.enableAutoGrayEffect = true;
        claimAdButton.interactable = canClaimToday;
      }
      claimAdButtonNode.color = canClaimToday ? cc.color(255, 255, 255, 255) : cc.color(170, 170, 170, 255);
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
    var contentNode = scrollView ? scrollView.content : null;
    var itemTemplateNode = contentNode ? contentNode.getChildByName("award_item") : null;

    if (!panelNode || !maskNode || !closeButtonNode || !confirmButtonNode || !awardListNode || !scrollView || !contentNode || !itemTemplateNode) {
      throw new Error("AwardView prefab structure is incomplete.");
    }

    return {
      panelNode: panelNode,
      maskNode: maskNode,
      closeButtonNode: closeButtonNode,
      confirmButtonNode: confirmButtonNode,
      awardListNode: awardListNode,
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

    contentNode.width = calculateAwardContentWidth(awardListNode, itemWidth, normalizedItems.length);

    var iconTasks = [];
    for (var i = 0; i < normalizedItems.length; i += 1) {
      var rewardItem = normalizedItems[i];
      var itemNode = i === 0 ? itemTemplateNode : cc.instantiate(itemTemplateNode);
      if (i > 0) {
        itemNode.parent = contentNode;
      }
      itemNode.active = true;
      itemNode.x = (itemWidth / 2) + (i * (itemWidth + AWARD_LIST_ITEM_SPACING));
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
