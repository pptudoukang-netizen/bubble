"use strict";

var Shared = require("./GameBootstrapShared");
var AdService = Shared.AdService;
var AdRewardQuotaStore = Shared.AdRewardQuotaStore;
var AdRewardCatalog = Shared.AdRewardCatalog;
var ITEM_ID_BY_POWERUP_TYPE = Shared.ITEM_ID_BY_POWERUP_TYPE;
var Logger = Shared.Logger;
var clone = Shared.clone;
var STAMINA_RECOVERY_LOW_GRANT = 1;
var STAMINA_RECOVERY_HIGH_GRANT = 2;
var STAMINA_RECOVERY_LOW_GRANT_COUNT = 2;
var CONSECUTIVE_LOSE_INTERSTITIAL_THRESHOLD = 3;
var REWARDED_AD_UNAVAILABLE_MESSAGE = "目前没有合适的广告，请稍后再试";

function resolveWechatPlatform() {
  if (typeof wx !== "undefined") {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function isInterstitialLoseState(state) {
  return state === "out_of_shots" || state === "lost_danger" || state === "lost_objective";
}

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

function resolveStaminaRecoveryGrantAmount(grantedTodayBefore) {
  var safeGrantedTodayBefore = requireNonNegativeInteger(grantedTodayBefore, "Stamina recovery grantedToday");
  return safeGrantedTodayBefore < STAMINA_RECOVERY_LOW_GRANT_COUNT
    ? STAMINA_RECOVERY_LOW_GRANT
    : STAMINA_RECOVERY_HIGH_GRANT;
}

module.exports = {
  _buildAttemptRewardKey: function (rewardType) {
    return this._currentAttemptId + "|" + rewardType;
  },

  _hasGrantedAttemptReward: function (rewardType) {
    if (!this._currentAttemptId) {
      return false;
    }
    var key = this._buildAttemptRewardKey(rewardType);
    return !!this._grantedAttemptRewardKeys[key];
  },

  _markAttemptRewardGranted: function (rewardType) {
    if (!this._currentAttemptId) {
      return;
    }
    var key = this._buildAttemptRewardKey(rewardType);
    this._grantedAttemptRewardKeys[key] = true;
  },

  _resolveRewardedVideoAdUnitId: function (options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("Rewarded video ad options must be an object when provided.");
    }

    var adUnitId = options && Object.prototype.hasOwnProperty.call(options, "adUnitId")
      ? options.adUnitId
      : this.rewardedVideoAdUnitId;
    if (typeof adUnitId !== "string") {
      throw new Error("rewarded video ad unit id must be a string.");
    }

    return adUnitId.trim();
  },

  _hasRewardedVideoAdConfig: function (options) {
    return this._resolveRewardedVideoAdUnitId(options).length > 0;
  },

  _requireRewardedVideoAdConfig: function (options) {
    var adUnitId = this._resolveRewardedVideoAdUnitId(options);
    if (adUnitId.length <= 0) {
      throw new Error("Rewarded video ad unit id is required before granting ad rewards.");
    }
    return adUnitId;
  },

  _canShowRewardedVideoAd: function () {
    if (!this.adService || typeof this.adService.canShowRewarded !== "function") {
      throw new Error("Ad reward flow requires AdService.canShowRewarded.");
    }

    return this.adService.canShowRewarded();
  },

  _resolveInterstitialAdUnitId: function () {
    if (typeof this.interstitialAdUnitId !== "string") {
      throw new Error("interstitialAdUnitId must be a string.");
    }
    return this.interstitialAdUnitId.trim();
  },

  _requireInterstitialAdConfig: function () {
    var adUnitId = this._resolveInterstitialAdUnitId();
    if (adUnitId.length <= 0) {
      throw new Error("Interstitial ad unit id is required.");
    }
    return adUnitId;
  },

  _canShowInterstitialAd: function () {
    if (!this.adService || typeof this.adService.canShowInterstitial !== "function") {
      throw new Error("Interstitial ad flow requires AdService.canShowInterstitial.");
    }
    return this.adService.canShowInterstitial();
  },

  _showInterstitialAd: function (placement) {
    var safePlacement = requireNonEmptyString(placement, "Interstitial ad placement");
    if (this._interstitialAdInProgress || this._adFlowInProgress) {
      return Promise.resolve(false);
    }
    if (!this.adService || typeof this.adService.showInterstitial !== "function") {
      throw new Error("Interstitial ad flow requires AdService.showInterstitial.");
    }

    var adUnitId = this._requireInterstitialAdConfig();
    if (!this.adService || typeof this.adService.setInterstitialAdUnitId !== "function") {
      throw new Error("Interstitial ad flow requires AdService.setInterstitialAdUnitId.");
    }
    if (this.adService.interstitialAdUnitId !== adUnitId) {
      this.adService.setInterstitialAdUnitId(adUnitId);
    }
    if (!this._canShowInterstitialAd()) {
      // 模拟器或未接入 wx.createInterstitialAd 时不展示插屏，属预期行为，不打 WARN。
      return Promise.resolve(false);
    }

    this._interstitialAdInProgress = true;
    this._trackTelemetry("interstitial_ad_request", {
      placement: safePlacement
    });

    return this.adService.showInterstitial({
      placement: safePlacement,
      onShow: function () {
        if (this.gameManager && typeof this.gameManager.pauseTimedLevelTimer === "function") {
          this.gameManager.pauseTimedLevelTimer();
        }
        this._trackTelemetry("interstitial_ad_show_attempt", {
          placement: safePlacement
        });
      }.bind(this)
    }).then(function (adResult) {
      if (this.gameManager && typeof this.gameManager.resumeTimedLevelTimer === "function") {
        this.gameManager.resumeTimedLevelTimer();
      }
      if (!adResult || !adResult.ok) {
        this._trackTelemetry("interstitial_ad_fail", {
          placement: safePlacement,
          code: adResult && typeof adResult.code === "string" ? adResult.code : "show_fail"
        });
        return false;
      }
      this._trackTelemetry("interstitial_ad_show", {
        placement: safePlacement,
        code: adResult.code
      });
      return true;
    }.bind(this), function (error) {
      if (this.gameManager && typeof this.gameManager.resumeTimedLevelTimer === "function") {
        this.gameManager.resumeTimedLevelTimer();
      }
      Logger.warn("Interstitial ad show failed", error && error.message ? error.message : error);
      this._trackTelemetry("interstitial_ad_fail", {
        placement: safePlacement,
        code: "show_fail"
      });
      return false;
    }.bind(this)).then(function (shown) {
      this._interstitialAdInProgress = false;
      return shown;
    }.bind(this), function (error) {
      this._interstitialAdInProgress = false;
      throw error;
    }.bind(this));
  },

  _handleInterstitialAdRuntimeStateTransition: function (snapshot, previousState, currentState) {
    if (!snapshot || currentState === previousState) {
      return;
    }
    if (currentState === "won") {
      this._consecutiveLoseCountForInterstitial = 0;
      if (this._canShowInterstitialAd()) {
        this._showInterstitialAd("level_win").catch(function (error) {
          Logger.warn("Level win interstitial ad failed", error && error.message ? error.message : error);
        });
      }
      return;
    }

    if (!isInterstitialLoseState(currentState)) {
      return;
    }
    this._consecutiveLoseCountForInterstitial += 1;
    if (this._consecutiveLoseCountForInterstitial < CONSECUTIVE_LOSE_INTERSTITIAL_THRESHOLD) {
      return;
    }
    this._consecutiveLoseCountForInterstitial = 0;
    if (this._canShowInterstitialAd()) {
      this._showInterstitialAd("three_consecutive_losses").catch(function (error) {
        Logger.warn("Consecutive lose interstitial ad failed", error && error.message ? error.message : error);
      });
    }
  },

  _bindReturnToForegroundInterstitialAd: function () {
    if (this._interstitialReturnShowHandler || this._interstitialReturnHideHandler) {
      return;
    }
    var hideHandler = function () {
      this._interstitialReturnHideObserved = true;
    }.bind(this);
    var showHandler = function () {
      if (this._interstitialReturnHideObserved !== true) {
        return;
      }
      this._interstitialReturnHideObserved = false;
      if (this._adFlowInProgress) {
        return;
      }
      if (!this._canShowInterstitialAd()) {
        return;
      }
      this._showInterstitialAd("return_to_foreground").catch(function (error) {
        Logger.warn("Return foreground interstitial ad failed", error && error.message ? error.message : error);
      });
    }.bind(this);

    this._interstitialReturnHideHandler = hideHandler;
    this._interstitialReturnShowHandler = showHandler;
    if (cc && cc.game && typeof cc.game.on === "function" && cc.game.EVENT_HIDE) {
      cc.game.on(cc.game.EVENT_HIDE, hideHandler);
    }
    if (cc && cc.game && typeof cc.game.on === "function" && cc.game.EVENT_SHOW) {
      cc.game.on(cc.game.EVENT_SHOW, showHandler);
    }
    var platform = resolveWechatPlatform();
    if (platform && typeof platform.onHide === "function") {
      platform.onHide(hideHandler);
    }
    if (platform && typeof platform.onShow === "function") {
      platform.onShow(showHandler);
    }
  },

  _unbindReturnToForegroundInterstitialAd: function () {
    var hideHandler = this._interstitialReturnHideHandler;
    var showHandler = this._interstitialReturnShowHandler;
    if (!hideHandler && !showHandler) {
      return;
    }
    if (hideHandler && cc && cc.game && typeof cc.game.off === "function" && cc.game.EVENT_HIDE) {
      cc.game.off(cc.game.EVENT_HIDE, hideHandler);
    }
    if (showHandler && cc && cc.game && typeof cc.game.off === "function" && cc.game.EVENT_SHOW) {
      cc.game.off(cc.game.EVENT_SHOW, showHandler);
    }
    var platform = resolveWechatPlatform();
    if (hideHandler && platform && typeof platform.offHide === "function") {
      platform.offHide(hideHandler);
    }
    if (showHandler && platform && typeof platform.offShow === "function") {
      platform.offShow(showHandler);
    }
    this._interstitialReturnHideHandler = null;
    this._interstitialReturnShowHandler = null;
    this._interstitialReturnHideObserved = false;
  },

  _setRewardedVideoAdUnavailableStatus: function () {
    if (typeof this._setStatusWithTip === "function") {
      this._setStatusWithTip("rewarded_video_ad_unavailable", null, "当前环境不支持激励视频广告，请在微信开发者工具或真机中重试");
      return;
    }

    this._setStatus("当前环境不支持激励视频广告，请在微信开发者工具或真机中重试");
  },

  _setRewardedAdFailureStatus: function (adResult, fallbackMessage) {
    var code = adResult && typeof adResult.code === "string" ? adResult.code : "";
    if (code === "no_fill") {
      if (typeof this._setStatusWithTip === "function") {
        this._setStatusWithTip("rewarded_ad_no_fill", null, REWARDED_AD_UNAVAILABLE_MESSAGE);
        return;
      }
      this._setStatus(REWARDED_AD_UNAVAILABLE_MESSAGE);
      return;
    }

    if (typeof this._setStatusWithTip === "function") {
      this._setStatusWithTip("rewarded_ad_failed", null, fallbackMessage);
      return;
    }
    this._setStatus(fallbackMessage);
  },

  _setAdQuotaBlockedStatus: function (quotaResult) {
    if (quotaResult.reason === "daily_limit") {
      this._setStatusWithTip("rewarded_ad_daily_limit", null, REWARDED_AD_UNAVAILABLE_MESSAGE);
      return;
    } else if (quotaResult.reason === "cooldown") {
      this._setStatus("操作过快，请" + quotaResult.cooldownRemainingSec + "秒后重试");
    } else {
      this._setStatus("当前无法领取奖励");
    }
  },

  _buildRewardedAdSceneId: function (entry, options) {
    if (!entry || !entry.entryKey) {
      throw new Error("Rewarded ad sceneID requires entry.entryKey.");
    }
    var source = options && typeof options.entrySource === "string" && options.entrySource
      ? options.entrySource
      : entry.entryKey;
    return source + ":" + entry.entryKey;
  },

  _onLoseWatchAdTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    var snapshot = this.gameManager.getRuntimeSnapshot();
    var loseRewardEntry = AdRewardCatalog.resolveLoseRewardEntry(snapshot ? snapshot.state : "");
    if (!loseRewardEntry) {
      this._setStatus("当前失败类型暂无广告奖励");
      return;
    }

    if (!this._hasRewardedVideoAdConfig()) {
      throw new Error("Lose reward requires rewardedVideoAdUnitId.");
    }

    return this._showRewardedAdForEntry(loseRewardEntry, {
      entrySource: "lose_view",
      trackExposure: false,
      onRewardGrantedMessage: "复活成功"
    });
  },

  _showRewardedAdForEntry: function (entry, options) {
    options = options || {};
    if (!entry) {
      throw new Error("Ad reward entry is required.");
    }

    if (this._adFlowInProgress) {
      this._setStatus("广告处理中，请稍候...");
      return Promise.resolve(false);
    }

    if (!this.adService || typeof this.adService.showRewarded !== "function") {
      throw new Error("Ad reward flow requires AdService.showRewarded.");
    }

    if (options.trackExposure !== false) {
      this._trackTelemetry("ad_entry_exposed", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        entry_source: options.entrySource || entry.entryKey
      });
    }

    if (!this.adRewardQuotaStore || typeof this.adRewardQuotaStore.canGrant !== "function") {
      throw new Error("Ad reward flow requires AdRewardQuotaStore.canGrant.");
    }

    var adUnitId = this._requireRewardedVideoAdConfig(options);
    if (!this.adService || typeof this.adService.setAdUnitId !== "function") {
      throw new Error("Ad reward flow requires AdService.setAdUnitId.");
    }
    if (this.adService.adUnitId !== adUnitId) {
      this.adService.setAdUnitId(adUnitId);
    }
    if (!this._canShowRewardedVideoAd()) {
      this._setRewardedVideoAdUnavailableStatus();
      return Promise.resolve(false);
    }

    var quotaResult = this.adRewardQuotaStore.canGrant(entry.quotaType);
    if (!quotaResult.allowed) {
      this._setAdQuotaBlockedStatus(quotaResult);
      return Promise.resolve(false);
    }

    var isCurrentRoundRevive = entry.grantMode === "current_round_revive";
    if (!isCurrentRoundRevive && this._hasGrantedAttemptReward(entry.rewardType)) {
      this._setStatus("本局该奖励已领取");
      return Promise.resolve(false);
    }

    this._adFlowInProgress = true;
    var sceneID = this._buildRewardedAdSceneId(entry, options);
    this._trackTelemetry("ad_request", {
      entry_key: entry.entryKey,
      reward_type: entry.rewardType
    });

    return this.adService.showRewarded({
      placement: options.entrySource || entry.entryKey,
      sceneID: sceneID,
      onShow: function () {
        if (this.gameManager && typeof this.gameManager.pauseTimedLevelTimer === "function") {
          this.gameManager.pauseTimedLevelTimer();
        }
        this._trackTelemetry("ad_show", {
          entry_key: entry.entryKey,
          reward_type: entry.rewardType
        });
      }.bind(this)
    }).then(function (adResult) {
      var safeAdResult = adResult || null;
      var isCompleted = !!(safeAdResult && safeAdResult.isCompleted);
      this._trackTelemetry("ad_close", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        is_completed: isCompleted,
        is_simulated: !!(safeAdResult && safeAdResult.mock)
      });
      if (this.gameManager && typeof this.gameManager.resumeTimedLevelTimer === "function") {
        this.gameManager.resumeTimedLevelTimer();
      }

      if (!safeAdResult || !safeAdResult.ok) {
        this._setRewardedAdFailureStatus(safeAdResult, "广告加载失败，请稍后重试");
        return false;
      }
      if (!isCompleted) {
        this._setStatus("未完整观看广告，奖励未发放");
        return false;
      }

      var grantResult = this._grantAdEntryReward(entry, options, {
        quotaResult: quotaResult
      });
      if (!grantResult || !grantResult.accepted) {
        this.adService.reportHostedRewardFailure(safeAdResult);
        this._setStatus(grantResult && grantResult.message ? grantResult.message : "奖励发放失败");
        return false;
      }

      if (this.adRewardQuotaStore && typeof this.adRewardQuotaStore.recordGrant === "function") {
        this.adRewardQuotaStore.recordGrant(entry.quotaType);
      }
      if (!isCurrentRoundRevive) {
        this._markAttemptRewardGranted(entry.rewardType);
      }
      this._trackTelemetry("ad_reward_grant", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        reward_value: grantResult.rewardValue === undefined ? entry.rewardValue : grantResult.rewardValue
      });

      if (grantResult.snapshot && this.currentLevelConfig && !this.isSelectingLevel) {
        this._handleRuntimeStateTransition(grantResult.snapshot);
        this.levelRenderer.refreshRuntime(this.currentLevelConfig, grantResult.snapshot);
      }
      this._setStatus(grantResult.message || options.onRewardGrantedMessage || "奖励发放成功");
      if (typeof options.onRewardGranted === "function") {
        options.onRewardGranted(grantResult);
      }
      this.adService.reportHostedRewardSuccess(safeAdResult);
      return true;
    }.bind(this), function (error) {
      if (this.gameManager && typeof this.gameManager.resumeTimedLevelTimer === "function") {
        this.gameManager.resumeTimedLevelTimer();
      }
      this._setRewardedAdFailureStatus({
        code: "show_fail",
        error: error
      }, "广告展示失败，请稍后重试");
      return false;
    }.bind(this)).then(function (granted) {
      this._adFlowInProgress = false;
      return granted;
    }.bind(this), function (error) {
      this._adFlowInProgress = false;
      this._setRewardedAdFailureStatus({
        code: "show_fail",
        error: error
      }, "广告处理失败，请稍后重试");
      return false;
    }.bind(this));
  },

  _grantAdEntryReward: function (entry, options, context) {
    options = options || {};
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      throw new Error("Ad reward grant context is required.");
    }
    if (!entry) {
      return {
        accepted: false,
        message: "奖励配置缺失"
      };
    }

    if (entry.grantMode === "next_round") {
      this._queueNextRoundReward(entry);
      return {
        accepted: true,
        message: options.onRewardGrantedMessage || "奖励已解锁，下局生效"
      };
    }

    if (entry.grantMode === "current_round_revive") {
      if (!this.gameManager || typeof this.gameManager.reviveFromAd !== "function") {
        throw new Error("Current round revive requires GameManager.reviveFromAd.");
      }
      var reviveResult = this.gameManager.reviveFromAd();
      if (!reviveResult || !reviveResult.accepted) {
        throw new Error("Current round revive result is invalid.");
      }
      return {
        accepted: true,
        snapshot: reviveResult.snapshot,
        rewardValue: entry.rewardValue,
        message: options.onRewardGrantedMessage || "复活成功"
      };
    }

    if (entry.staminaGrant) {
      this._refreshPlayerResources();
      if (entry.quotaType === "stamina_refill" && (!context.quotaResult || !Number.isInteger(context.quotaResult.grantedToday))) {
        throw new Error("Stamina recovery grant requires quotaResult.grantedToday.");
      }
      var safeGrant = entry.quotaType === "stamina_refill"
        ? resolveStaminaRecoveryGrantAmount(context.quotaResult.grantedToday)
        : requirePositiveInteger(entry.staminaGrant, "Ad stamina grant");
      this.playerResources.stamina = Math.max(
        0,
        Math.floor(Number(this.playerResources.stamina) || 0)
      ) + safeGrant;
      if (this.playerResourceStore && typeof this.playerResourceStore.save === "function") {
        this.playerResourceStore.save(this.playerResources);
      }
      if (options.deferStaminaTopStatusUpdate !== true) {
        this._updateLevelSelectTopStatus();
      }
      return {
        accepted: true,
        staminaGrant: safeGrant,
        rewardValue: safeGrant,
        message: "体力补给成功：+" + safeGrant
      };
    }

    if (entry.inventoryGrant) {
      var inventoryGrant = entry.inventoryGrant;
      var grantResult = this.gameManager.grantPowerupInventory(
        inventoryGrant.powerupType,
        inventoryGrant.amount
      );
      if (!grantResult || !grantResult.accepted) {
        return {
          accepted: false,
          message: "道具补给失败"
        };
      }
      var itemId = ITEM_ID_BY_POWERUP_TYPE[inventoryGrant.powerupType];
      if (itemId && typeof this._addInventoryItem === "function") {
        this._addInventoryItem(itemId, inventoryGrant.amount);
        this._renderInventoryView();
        this._updateInventoryEntryState();
      }
      return {
        accepted: true,
        snapshot: grantResult.snapshot,
        message: "补给成功：" +
          AdRewardCatalog.resolvePowerupDisplayName(inventoryGrant.powerupType) +
          " +" + grantResult.gained
      };
    }

    if (entry.adRunPowerupGrant) {
      var adRunGrant = entry.adRunPowerupGrant;
      if (!this.gameManager || typeof this.gameManager.grantAdRunPowerup !== "function") {
        throw new Error("Ad run powerup reward requires GameManager.grantAdRunPowerup.");
      }
      var adRunGrantResult = this.gameManager.grantAdRunPowerup(
        adRunGrant.powerupType,
        adRunGrant.amount
      );
      if (!adRunGrantResult || !adRunGrantResult.accepted) {
        return {
          accepted: false,
          message: "局内道具补给失败"
        };
      }
      return {
        accepted: true,
        snapshot: adRunGrantResult.snapshot,
        message: "补给成功：" +
          AdRewardCatalog.resolvePowerupDisplayName(adRunGrant.powerupType) +
          " +" + adRunGrantResult.gained
      };
    }

    return {
      accepted: false,
      message: "未知奖励类型"
    };
  },

  _queueNextRoundReward: function (entry) {
    if (!entry || !entry.rewardType) {
      return;
    }

    var queued = this._pendingNextRoundRewards || [];
    var exists = queued.some(function (item) {
      return item && item.rewardType === entry.rewardType;
    });
    if (exists) {
      return;
    }

    queued.push(clone(entry));
    this._pendingNextRoundRewards = queued;
  },

  _applyPendingNextRoundRewards: function (snapshot) {
    var pendingRewards = Array.isArray(this._pendingNextRoundRewards)
      ? this._pendingNextRoundRewards.slice()
      : [];
    if (!pendingRewards.length) {
      return snapshot;
    }

    var appliedRewardTexts = [];
    pendingRewards.forEach(function (rewardEntry) {
      if (rewardEntry.jarScoreBoost) {
        var boostResult = this.gameManager.activateJarScoreBoost({
          multiplier: rewardEntry.jarScoreBoost.multiplier,
          durationMs: rewardEntry.jarScoreBoost.durationMs
        });
        snapshot = boostResult || this.gameManager.getRuntimeSnapshot();
        appliedRewardTexts.push("5秒入缸x2");
        return;
      }

      if (rewardEntry.inventoryGrant) {
        var inventoryGrant = rewardEntry.inventoryGrant;
        var grantResult = this.gameManager.grantPowerupInventory(
          inventoryGrant.powerupType,
          inventoryGrant.amount
        );
        if (grantResult && grantResult.accepted) {
          snapshot = grantResult.snapshot || this.gameManager.getRuntimeSnapshot();
          appliedRewardTexts.push(
            AdRewardCatalog.resolvePowerupDisplayName(inventoryGrant.powerupType) + " +" + grantResult.gained
          );
        }
      }
    }, this);

    this._pendingNextRoundRewards = [];
    if (appliedRewardTexts.length > 0) {
      this._setStatus("下局奖励生效：" + appliedRewardTexts.join("，"));
    }
    return snapshot || this.gameManager.getRuntimeSnapshot();
  },

  _tryRecoverInventoryByAd: function (powerupType) {
    if (!powerupType || this.isSelectingLevel || this.isRestarting || !this.currentLevelConfig) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveInventoryEmptyRewardEntry(powerupType);
    if (!rewardEntry) {
      return;
    }

    this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "inventory_empty",
      adUnitId: this.inventoryRewardedVideoAdUnitId,
      onRewardGrantedMessage: "道具补给成功"
    });
  },

  _tryRecoverAdRunPowerupByAd: function (powerupType) {
    if (!powerupType || this.isSelectingLevel || this.isRestarting || !this.currentLevelConfig) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveAdRunPowerupRewardEntry(powerupType);
    if (!rewardEntry) {
      return;
    }

    this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "ad_run_powerup",
      adUnitId: this.inventoryRewardedVideoAdUnitId,
      onRewardGrantedMessage: "局内道具补给成功"
    });
  },

  _resolveStaminaRecoveryGrantAmount: function () {
    if (!this.adRewardQuotaStore || typeof this.adRewardQuotaStore.canGrant !== "function") {
      throw new Error("Stamina recovery requires AdRewardQuotaStore.canGrant.");
    }

    var quotaResult = this.adRewardQuotaStore.canGrant("stamina_refill");
    return resolveStaminaRecoveryGrantAmount(quotaResult.grantedToday);
  },

  _tryRecoverStaminaByAd: function (onRecovered, options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("Stamina recovery options must be an object when provided.");
    }
    var deferTopStatusUpdate = options && options.deferTopStatusUpdate === true;
    if (this._staminaRecoveryInProgress) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveStaminaRecoveryEntry();
    if (!rewardEntry) {
      return;
    }

    this._staminaRecoveryInProgress = true;
    var recoveredGrantResult = null;
    return this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "stamina_insufficient",
      deferStaminaTopStatusUpdate: deferTopStatusUpdate,
      onRewardGrantedMessage: "体力补给成功，可继续挑战",
      onRewardGranted: function (grantResult) {
        recoveredGrantResult = grantResult;
      }
    }).then(function (granted) {
      this._staminaRecoveryInProgress = false;
      if (granted && typeof onRecovered === "function") {
        return onRecovered(recoveredGrantResult);
      }
    }.bind(this));
  }
};
