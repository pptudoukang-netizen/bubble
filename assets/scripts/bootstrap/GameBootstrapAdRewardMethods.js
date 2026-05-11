"use strict";

var Shared = require("./GameBootstrapShared");
var AdService = Shared.AdService;
var AdRewardQuotaStore = Shared.AdRewardQuotaStore;
var AdRewardCatalog = Shared.AdRewardCatalog;
var ITEM_ID_BY_POWERUP_TYPE = Shared.ITEM_ID_BY_POWERUP_TYPE;
var clone = Shared.clone;

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

  _hasRewardedVideoAdConfig: function () {
    if (typeof this.rewardedVideoAdUnitId !== "string") {
      throw new Error("rewardedVideoAdUnitId must be a string.");
    }

    return this.rewardedVideoAdUnitId.trim().length > 0;
  },

  _requireRewardedVideoAdConfig: function () {
    if (!this._hasRewardedVideoAdConfig()) {
      throw new Error("Rewarded video ad unit id is required before granting ad rewards.");
    }
  },

  _setAdQuotaBlockedStatus: function (quotaResult) {
    if (quotaResult.reason === "daily_limit") {
      this._setStatus("今日奖励次数已达上限");
    } else if (quotaResult.reason === "cooldown") {
      this._setStatus("操作过快，请" + quotaResult.cooldownRemainingSec + "秒后重试");
    } else {
      this._setStatus("当前无法领取奖励");
    }
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

    this._showRewardedAdForEntry(loseRewardEntry, {
      entrySource: "lose_view",
      trackExposure: false,
      onRewardGrantedMessage: "奖励已生效，正在重新开局...",
      onRewardGranted: function () {
        this._restartCurrentLevel();
      }.bind(this)
    }).then(function (granted) {
      if (granted) {
        return;
      }

      if (this.isRestarting || this.isSelectingLevel) {
        return;
      }

      this._setStatusWithTip("ad_reward_not_granted_back_to_level", null, "广告未发奖，返回选关页面");
      this._onBackToLevelTap();
    }.bind(this));
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

    this._requireRewardedVideoAdConfig();
    var quotaResult = this.adRewardQuotaStore.canGrant(entry.quotaType);
    if (!quotaResult.allowed) {
      this._setAdQuotaBlockedStatus(quotaResult);
      return Promise.resolve(false);
    }

    if (this._hasGrantedAttemptReward(entry.rewardType)) {
      this._setStatus("本局该奖励已领取");
      return Promise.resolve(false);
    }

    this._adFlowInProgress = true;
    this._trackTelemetry("ad_request", {
      entry_key: entry.entryKey,
      reward_type: entry.rewardType
    });

    return this.adService.showRewarded({
      placement: options.entrySource || entry.entryKey,
      onShow: function () {
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

      if (!safeAdResult || !safeAdResult.ok) {
        this._setStatus("广告加载失败，请稍后重试");
        return false;
      }
      if (!isCompleted) {
        this._setStatus("未完整观看广告，奖励未发放");
        return false;
      }

      var grantResult = this._grantAdEntryReward(entry, options);
      if (!grantResult || !grantResult.accepted) {
        this._setStatus(grantResult && grantResult.message ? grantResult.message : "奖励发放失败");
        return false;
      }

      if (this.adRewardQuotaStore && typeof this.adRewardQuotaStore.recordGrant === "function") {
        this.adRewardQuotaStore.recordGrant(entry.quotaType);
      }
      this._markAttemptRewardGranted(entry.rewardType);
      this._trackTelemetry("ad_reward_grant", {
        entry_key: entry.entryKey,
        reward_type: entry.rewardType,
        reward_value: entry.rewardValue
      });

      if (grantResult.snapshot && this.currentLevelConfig && !this.isSelectingLevel) {
        this.levelRenderer.refreshRuntime(this.currentLevelConfig, grantResult.snapshot);
      }
      this._setStatus(grantResult.message || options.onRewardGrantedMessage || "奖励发放成功");
      if (typeof options.onRewardGranted === "function") {
        options.onRewardGranted();
      }
      return true;
    }.bind(this), function () {
      this._setStatus("广告展示失败，请稍后重试");
      return false;
    }.bind(this)).then(function (granted) {
      this._adFlowInProgress = false;
      return granted;
    }.bind(this), function () {
      this._adFlowInProgress = false;
      return false;
    }.bind(this));
  },

  _grantAdEntryReward: function (entry, options) {
    options = options || {};
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

    if (entry.staminaGrant) {
      this._refreshPlayerResources();
      var safeGrant = Math.max(1, Math.floor(Number(entry.staminaGrant) || 1));
      this.playerResources.stamina = Math.max(
        0,
        Math.floor(Number(this.playerResources.stamina) || 0)
      ) + safeGrant;
      if (this.playerResourceStore && typeof this.playerResourceStore.save === "function") {
        this.playerResourceStore.save(this.playerResources);
      }
      this._updateLevelSelectTopStatus();
      return {
        accepted: true,
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
      onRewardGrantedMessage: "道具补给成功"
    });
  },

  _tryRecoverStaminaByAd: function (onRecovered) {
    if (this._staminaRecoveryInProgress) {
      return;
    }

    var rewardEntry = AdRewardCatalog.resolveStaminaRecoveryEntry();
    if (!rewardEntry) {
      return;
    }

    this._staminaRecoveryInProgress = true;
    this._showRewardedAdForEntry(rewardEntry, {
      entrySource: "stamina_insufficient",
      onRewardGrantedMessage: "体力补给成功，可继续挑战"
    }).then(function (granted) {
      this._staminaRecoveryInProgress = false;
      if (granted && typeof onRecovered === "function") {
        onRecovered();
      }
    }.bind(this));
  }
};
