"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var showStatusAndTip = Shared.showStatusAndTip;
var DailyTaskViewController = require("../ui/DailyTaskViewController");
var FriendGiftService = require("../services/FriendGiftService");
var PopupPanelAnimator = Shared.PopupPanelAnimator;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");

var DAILY_TASK_VIEW_PREFAB_PATH = "prefabs/ui/DailyTaskView";
var FRIEND_STAMINA_GIFT_COST = 1;
var DAILY_CHALLENGE_ATTEMPT_TASK_ID = "challenge_attempt_10";
var EMPTY_DAILY_CHALLENGE_ATTEMPT_COUNT = 0;

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireDailyTaskService(host) {
  if (!host.dailyTaskService) {
    throw new Error("Daily task service is not ready.");
  }
  return host.dailyTaskService;
}

function requireDailyTaskStore(host) {
  if (!host.dailyTaskStore) {
    throw new Error("Daily task store is not ready.");
  }
  return host.dailyTaskStore;
}

function buildDailyTaskSummary(host) {
  var service = requireDailyTaskService(host);
  return {
    tasks: service.getTaskList(new Date())
  };
}

function resolveDailyTaskGoStatus(task) {
  if (task.taskId === "clear_level_5") {
    return "请选择关卡完成每日任务";
  }
  if (task.taskId === "spend_stamina_20") {
    return "请选择关卡消耗体力";
  }
  if (task.taskId === "use_rainbow_ball_2") {
    return "进入关卡后使用彩虹球";
  }
  if (task.taskId === "use_barrier_hammer_1") {
    return "进入关卡后使用破障锤";
  }
  if (task.taskId === "gift_friend_stamina_3") {
    return "正在打开好友体力赠送";
  }
  if (isChallengeDailyTask(task.taskId)) {
    return "正在打开每日挑战";
  }
  throw new Error("Unknown daily task go action: " + task.taskId);
}

function isChallengeDailyTask(taskId) {
  return taskId === "challenge_attempt_10" ||
    taskId === "challenge_clear_3" ||
    taskId === "challenge_clear_5" ||
    taskId === "challenge_clear_10";
}

module.exports = {
  _refreshDailyTaskState: function () {
    this.dailyTaskState = requireDailyTaskStore(this).load(new Date());
    return this.dailyTaskState;
  },

  _getDailyChallengeAttemptCount: function () {
    var state = requireDailyTaskStore(this).load(new Date());
    if (!state.tasks || typeof state.tasks !== "object" || Array.isArray(state.tasks)) {
      throw new Error("Daily task state tasks are required for daily challenge count.");
    }
    var taskState = state.tasks[DAILY_CHALLENGE_ATTEMPT_TASK_ID];
    if (!taskState) {
      return EMPTY_DAILY_CHALLENGE_ATTEMPT_COUNT;
    }
    return requireNonNegativeInteger(taskState.progress, "Daily challenge attempt progress");
  },

  _recordDailyTaskEvent: function (eventType, payload) {
    var result = requireDailyTaskService(this).recordEvent(eventType, payload, new Date());
    this.dailyTaskState = result.state;
    this._updateDailyTaskEntryState();
    if (this._dailyTaskViewNode && cc.isValid(this._dailyTaskViewNode) && this._dailyTaskViewNode.active) {
      this._renderDailyTaskView();
    }
    return result;
  },

  _ensureDailyTaskEntryRedDot: function (entryNode) {
    if (!entryNode || !entryNode.isValid) {
      throw new Error("Daily task entry node is required.");
    }

    var redDotNode = entryNode.getChildByName("daily_task_red_dot");
    if (redDotNode && redDotNode.isValid) {
      return redDotNode;
    }

    redDotNode = new cc.Node("daily_task_red_dot");
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

  _updateDailyTaskEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var topLayerNode = this._getLevelSelectTopLayerNode();
    if (!topLayerNode || !topLayerNode.isValid) {
      throw new Error("LevelView top_layer is required for daily task entry.");
    }

    var entryNode = topLayerNode.getChildByName("daily_tasks_btn");
    if (!entryNode || !entryNode.isValid) {
      throw new Error("LevelView top_layer requires daily_tasks_btn.");
    }

    if (entryNode.__dailyTasksTapBound !== true) {
      this._bindNodeTapOnce(entryNode, function () {
        this._playSfx("uiClick");
        this._showDailyTaskView();
      }.bind(this));
    }

    var redDotNode = this._ensureDailyTaskEntryRedDot(entryNode);
    redDotNode.active = requireDailyTaskService(this).hasClaimableTask(new Date());
  },

  _ensureDailyTaskViewPrefab: function () {
    if (this._dailyTaskViewPrefab) {
      return Promise.resolve(this._dailyTaskViewPrefab);
    }

    return this._loadPrefab(DAILY_TASK_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("DailyTaskView prefab load returned empty.");
      }
      this._dailyTaskViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _showDailyTaskView: function () {
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    return this._ensureDailyTaskViewPrefab().then(function (prefab) {
      var viewNode = this._dailyTaskViewNode;
      if (!viewNode || !cc.isValid(viewNode)) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode) {
          throw new Error("Instantiate DailyTaskView prefab failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = 340;
        this._dailyTaskViewNode = viewNode;
        this._dailyTaskViewController = new DailyTaskViewController({
          node: viewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._hideDailyTaskView();
          }.bind(this),
          onClaim: this._claimDailyTaskReward.bind(this),
          onGo: this._handleDailyTaskGo.bind(this)
        });
      }

      viewNode.active = true;
      PopupPanelAnimator.play(viewNode);
      this._trackTelemetry("daily_task_panel_open", {});
      return this._renderDailyTaskView();
    }.bind(this)).catch(function (error) {
      Logger.error("Show DailyTaskView failed", error && error.stack ? error.stack : error);
      this._setStatus("每日任务加载失败");
      throw error;
    }.bind(this));
  },

  _hideDailyTaskView: function () {
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "DailyTaskView",
      nodeKey: "_dailyTaskViewNode",
      prefabKey: "_dailyTaskViewPrefab",
      controllerKey: "_dailyTaskViewController"
    });
  },

  _renderDailyTaskView: function () {
    if (!this._dailyTaskViewController || !this._dailyTaskViewNode || !cc.isValid(this._dailyTaskViewNode)) {
      throw new Error("DailyTaskView controller is required before rendering.");
    }
    return this._dailyTaskViewController.render(buildDailyTaskSummary(this)).catch(function (error) {
      Logger.error("Render DailyTaskView failed", error && error.stack ? error.stack : error);
      this._setStatus("每日任务刷新失败");
      throw error;
    }.bind(this));
  },

  _claimDailyTaskReward: function (taskId) {
    this._playSfx("uiClick");
    var claimResult = requireDailyTaskService(this).claimReward(taskId, new Date());
    this.dailyTaskState = claimResult.state;
    this._updateLevelSelectTopStatus();
    this._updateDailyTaskEntryState();
    this._renderDailyTaskView();
    this._setStatus("每日任务奖励领取成功");
    this._showAwardViewForRewardItems(claimResult.rewardItems).catch(function (error) {
      Logger.error("Show daily task award view failed", error && error.stack ? error.stack : error);
      throw error;
    });
    return claimResult;
  },

  _handleDailyTaskGo: function (task) {
    if (!task || typeof task.taskId !== "string") {
      throw new Error("Daily task go action requires task.");
    }
    this._playSfx("uiClick");
    if (task.taskId === "gift_friend_stamina_3") {
      return this._giftFriendStaminaBySelfManagedGift();
    }
    this._hideDailyTaskView();
    showStatusAndTip(this, resolveDailyTaskGoStatus(task));
    if (isChallengeDailyTask(task.taskId)) {
      if (typeof this._startRandomChallengeRun !== "function") {
        throw new Error("Daily challenge task go action requires _startRandomChallengeRun.");
      }
      return this._startRandomChallengeRun({});
    }
    return Promise.resolve(false);
  },

  _giftFriendStaminaBySelfManagedGift: function () {
    if (!this.friendGiftService || typeof this.friendGiftService.createStaminaGift !== "function") {
      throw new Error("Daily task friend stamina gift requires FriendGiftService.createStaminaGift.");
    }
    if (!this.wechatShareService || typeof this.wechatShareService.shareAppMessage !== "function") {
      throw new Error("Daily task friend stamina gift requires WechatShareService.shareAppMessage.");
    }
    if (!this.wechatShareService.isWechatGameRuntime()) {
      showStatusAndTip(this, "好友体力赠送仅微信小游戏环境可用");
      return Promise.reject(new Error("Daily task friend stamina gift requires WeChat mini game runtime."));
    }
    if (!this.wechatShareService.isActiveShareSupported()) {
      throw new Error("Daily task friend stamina gift requires wx.shareAppMessage.");
    }
    if (this._getCurrentStamina() < FRIEND_STAMINA_GIFT_COST) {
      showStatusAndTip(this, "体力不足，无法赠送好友体力");
      return Promise.resolve(false);
    }

    var consumeAccepted = this._consumeStaminaForFriendGift();
    if (consumeAccepted !== true) {
      showStatusAndTip(this, "体力不足，无法赠送好友体力");
      return Promise.resolve({
        accepted: false,
        reason: "DAILY_TASK_GIFT_STAMINA_NOT_ENOUGH"
      });
    }

    var giftRecordId = FriendGiftService.buildClientGiftRecordId();
    var shareQuery = [
      "friendGiftType=stamina",
      "friendGiftId=" + encodeURIComponent(giftRecordId)
    ].join("&");
    var createGiftPromise = this.friendGiftService.createStaminaGift(FRIEND_STAMINA_GIFT_COST, giftRecordId);
    var sharePromise = this.wechatShareService.shareAppMessage({
      title: "送你 1 点体力，继续泡泡挑战",
      imageUrl: this.shareImageUrl,
      query: shareQuery
    });

    return Promise.all([createGiftPromise, sharePromise]).then(function (results) {
      var giftResult = results[0];
      if (!giftResult || giftResult.amount !== FRIEND_STAMINA_GIFT_COST) {
        throw new Error("Create friend stamina gift result is invalid.");
      }
      if (giftResult.giftRecordId !== giftRecordId) {
        throw new Error("Create friend stamina gift result giftRecordId is invalid.");
      }
      var result = this._recordFriendStaminaGiftSuccess(giftRecordId);
      showStatusAndTip(this, "好友体力赠送成功");
      return result;
    }.bind(this)).catch(function (error) {
      this._refundStaminaForFriendGift(FRIEND_STAMINA_GIFT_COST);
      Logger.error("Daily task self managed friend stamina gift failed", error && error.stack ? error.stack : error);
      showStatusAndTip(this, "好友体力赠送失败");
      throw error;
    }.bind(this));
  },

  _consumeStaminaForFriendGift: function () {
    if (!this.playerResourceStore || typeof this.playerResourceStore.consumeStamina !== "function") {
      throw new Error("Daily task friend stamina gift requires PlayerResourceStore.consumeStamina.");
    }
    if (!this.playerResourceStore || typeof this.playerResourceStore.save !== "function") {
      throw new Error("Daily task friend stamina gift requires PlayerResourceStore.save.");
    }

    this._refreshPlayerResources();
    var consumeResult = this.playerResourceStore.consumeStamina(this.playerResources, FRIEND_STAMINA_GIFT_COST);
    if (!consumeResult || typeof consumeResult.accepted !== "boolean" || !consumeResult.resources) {
      throw new Error("Friend stamina gift consume result is invalid.");
    }
    this.playerResources = consumeResult.resources;
    if (!consumeResult.accepted) {
      this._updateLevelSelectTopStatus();
      if (this._dailyTaskViewNode && cc.isValid(this._dailyTaskViewNode) && this._dailyTaskViewNode.active) {
        this._renderDailyTaskView();
      }
      return false;
    }

    this.playerResourceStore.save(this.playerResources);
    this._markStaminaRecoveryBaseline(new Date());
    this._updateLevelSelectTopStatus();
    return true;
  },

  _refundStaminaForFriendGift: function (amount) {
    var refundAmount = requirePositiveInteger(amount, "Friend stamina gift refund amount");
    this._refreshPlayerResources();
    var currentStamina = Math.floor(Number(this.playerResources.stamina));
    if (!Number.isInteger(currentStamina) || currentStamina < 0) {
      throw new Error("Player stamina value is invalid before friend gift refund.");
    }
    this.playerResources.stamina = currentStamina + refundAmount;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    if (this._dailyTaskViewNode && cc.isValid(this._dailyTaskViewNode) && this._dailyTaskViewNode.active) {
      this._renderDailyTaskView();
    }
    return {
      accepted: true,
      refund: refundAmount,
      staminaAfter: this.playerResources.stamina
    };
  },

  _recordFriendStaminaGiftSuccess: function (friendId) {
    if (typeof friendId !== "string" || friendId.length === 0) {
      throw new Error("Friend stamina gift requires friendId.");
    }
    this._recordDailyTaskEvent("spend_stamina", {
      amount: FRIEND_STAMINA_GIFT_COST,
      reason: "friend_stamina_gift"
    });
    return this._recordDailyTaskEvent("gift_friend_stamina", {
      friendId: friendId,
      amount: FRIEND_STAMINA_GIFT_COST
    });
  },

  _claimPendingFriendStaminaGiftFromLaunchOptions: function () {
    if (!this.friendGiftService || typeof this.friendGiftService.resolveEnterQuery !== "function") {
      throw new Error("FriendGiftService.resolveEnterQuery is required.");
    }
    var query = this.friendGiftService.resolveEnterQuery();
    if (!query) {
      return Promise.resolve(false);
    }
    if (query.friendGiftId === undefined) {
      return Promise.resolve(false);
    }
    if (query.friendGiftType !== "stamina") {
      throw new Error("Unsupported friend gift type from launch query: " + query.friendGiftType);
    }
    return this._claimFriendStaminaGift(query.friendGiftId);
  },

  _claimFriendStaminaGift: function (giftRecordId) {
    if (!this.friendGiftService || typeof this.friendGiftService.claimStaminaGift !== "function") {
      throw new Error("FriendGiftService.claimStaminaGift is required.");
    }
    if (typeof this._showAwardViewForRewardItems !== "function") {
      throw new Error("AwardView display is required for claimed friend stamina gift.");
    }
    return this.friendGiftService.claimStaminaGift(giftRecordId).then(function (claimResult) {
      if (!claimResult || typeof claimResult.accepted !== "boolean") {
        throw new Error("Friend stamina gift claim result is invalid.");
      }
      if (claimResult.accepted !== true) {
        this._setStatus("好友体力已领取或不可领取");
        return claimResult;
      }
      this._grantClaimedFriendStaminaGift(claimResult.amount);
      this._setStatus("领取好友体力成功：体力 +" + claimResult.amount);
      return this._showAwardViewForRewardItems([
        {
          id: "stamina",
          count: claimResult.amount
        }
      ]).then(function () {
        return claimResult;
      });
    }.bind(this));
  },

  _grantClaimedFriendStaminaGift: function (amount) {
    var grantAmount = requirePositiveInteger(amount, "Claimed friend stamina amount");
    this._refreshPlayerResources();
    var currentStamina = Math.floor(Number(this.playerResources.stamina));
    if (!Number.isInteger(currentStamina) || currentStamina < 0) {
      throw new Error("Player stamina value is invalid before friend gift claim.");
    }
    this.playerResources.stamina = currentStamina + grantAmount;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return {
      accepted: true,
      gained: grantAmount,
      staminaAfter: this.playerResources.stamina
    };
  },

  _bindFriendGiftEnterClaim: function () {
    if (this._friendGiftEnterShowHandler) {
      return;
    }
    if (!this.friendGiftService || typeof this.friendGiftService.getPlatform !== "function") {
      return;
    }
    var handler = function () {
      var claimGift = function () {
        return this._claimPendingFriendStaminaGiftFromLaunchOptions();
      }.bind(this);

      var runClaim = function () {
        return claimGift().catch(function (error) {
          Logger.error("Claim friend stamina gift on enter failed", error && error.stack ? error.stack : error);
          this._setStatus("好友体力领取失败");
          throw error;
        }.bind(this));
      }.bind(this);

      if (this._startupFlowPromise) {
        return this._startupFlowPromise.then(runClaim);
      }

      return runClaim();
    }.bind(this);
    this._friendGiftEnterShowHandler = handler;
    if (cc && cc.game && typeof cc.game.on === "function" && cc.game.EVENT_SHOW) {
      cc.game.on(cc.game.EVENT_SHOW, handler);
    }
    var platform = this.friendGiftService.getPlatform();
    if (platform && typeof platform.onShow === "function") {
      platform.onShow(handler);
    }
  },

  _unbindFriendGiftEnterClaim: function () {
    var handler = this._friendGiftEnterShowHandler;
    if (!handler) {
      return;
    }
    if (cc && cc.game && typeof cc.game.off === "function" && cc.game.EVENT_SHOW) {
      cc.game.off(cc.game.EVENT_SHOW, handler);
    }
    if (this.friendGiftService && typeof this.friendGiftService.getPlatform === "function") {
      var platform = this.friendGiftService.getPlatform();
      if (platform && typeof platform.offShow === "function") {
        platform.offShow(handler);
      }
    }
    this._friendGiftEnterShowHandler = null;
  },

  _onLevelSelectDailyTasksTap: function () {
    if (this.isSelectingLevel && !this.isRestarting) {
      this._playSfx("uiClick");
      this._showDailyTaskView();
    }
  }
};
