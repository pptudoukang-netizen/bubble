"use strict";

var DEFAULT_MOCK_CLOSE_DELAY_MS = 220;
var DEFAULT_RECREATE_DELAY_MS = 900;

function mapWxAdErrorCode(rawError, fallbackCode) {
  var error = rawError && typeof rawError === "object" ? rawError : {};
  var errCode = Number(error.errCode);
  if (!Number.isFinite(errCode)) {
    return fallbackCode;
  }

  if (errCode === 1004) {
    return "no_fill";
  }
  if (errCode === 1002 || errCode === 1003) {
    return "load_fail";
  }

  return fallbackCode;
}

function hasRewardedVideoApi() {
  return !!(
    typeof wx !== "undefined" &&
    wx &&
    typeof wx.createRewardedVideoAd === "function"
  );
}

function AdService(options) {
  options = options || {};
  this.adUnitId = typeof options.adUnitId === "string" ? options.adUnitId : "";
  this.logger = options.logger || null;
  this.mockEnabled = options.mockEnabled === true;
  this.hostedShareBehaviorEnabled = options.hostedShareBehaviorEnabled === true;
  this.mockCloseDelayMs = Math.max(
    0,
    Math.floor(Number(options.mockCloseDelayMs) || DEFAULT_MOCK_CLOSE_DELAY_MS)
  );
  this.recreateDelayMs = Math.max(
    0,
    Math.floor(Number(options.recreateDelayMs) || DEFAULT_RECREATE_DELAY_MS)
  );
  this._rewardedAd = null;
  this._rewardedAdLoadHandler = null;
  this._rewardedAdLoadSubscribers = [];
  this._rewardedAdErrorHandler = null;
  this._rewardedAdErrorSubscribers = [];
  this._rewardedAdErrorEmitted = false;
  this._lastHostedRecommendation = null;
  this._lastHostedRecommendationError = null;
  this._rewardedAdNeedsRecreate = false;
  this._lastRewardedAdDisposeAt = 0;
  this._isShowing = false;
}

AdService.prototype.setAdUnitId = function (adUnitId) {
  this._disposeRewardedAd();
  this.adUnitId = typeof adUnitId === "string" ? adUnitId : "";
};

AdService.prototype.isSupported = function () {
  return hasRewardedVideoApi();
};

AdService.prototype.canShowRewarded = function () {
  return this.isSupported() || this.mockEnabled === true;
};

AdService.prototype._logInfo = function () {
  if (!this.logger || typeof this.logger.info !== "function") {
    return;
  }
  this.logger.info.apply(this.logger, arguments);
};

AdService.prototype._logWarn = function () {
  if (!this.logger || typeof this.logger.warn !== "function") {
    return;
  }
  this.logger.warn.apply(this.logger, arguments);
};

AdService.prototype._disposeRewardedAd = function () {
  var hadRewardedAd = !!this._rewardedAd;
  if (
    this._rewardedAd &&
    this._rewardedAdLoadHandler &&
    typeof this._rewardedAd.offLoad === "function"
  ) {
    this._rewardedAd.offLoad(this._rewardedAdLoadHandler);
  }
  if (
    this._rewardedAd &&
    this._rewardedAdErrorHandler &&
    typeof this._rewardedAd.offError === "function"
  ) {
    this._rewardedAd.offError(this._rewardedAdErrorHandler);
  }
  if (this._rewardedAd && typeof this._rewardedAd.destroy === "function") {
    this._rewardedAd.destroy();
  }

  this._rewardedAd = null;
  this._rewardedAdLoadHandler = null;
  this._rewardedAdLoadSubscribers = [];
  this._rewardedAdErrorHandler = null;
  this._rewardedAdErrorSubscribers = [];
  this._rewardedAdErrorEmitted = false;
  this._lastHostedRecommendation = null;
  this._lastHostedRecommendationError = null;
  this._rewardedAdNeedsRecreate = false;
  if (hadRewardedAd) {
    this._lastRewardedAdDisposeAt = Date.now();
  }
  this._isShowing = false;
};

AdService.prototype._waitForRewardedAdRecreateCooldown = function () {
  if (this._rewardedAd || this.recreateDelayMs <= 0 || this._lastRewardedAdDisposeAt <= 0) {
    return Promise.resolve();
  }

  var elapsedMs = Date.now() - this._lastRewardedAdDisposeAt;
  var waitMs = this.recreateDelayMs - elapsedMs;
  if (waitMs <= 0) {
    this._lastRewardedAdDisposeAt = 0;
    return Promise.resolve();
  }

  return new Promise(function (resolve) {
    setTimeout(function () {
      this._lastRewardedAdDisposeAt = 0;
      resolve();
    }.bind(this), waitMs);
  }.bind(this));
};

AdService.prototype._subscribeRewardedAdLoad = function (listener) {
  if (typeof listener !== "function") {
    throw new Error("Rewarded video ad load listener is required.");
  }

  this._rewardedAdLoadSubscribers.push(listener);
  return function () {
    var index = this._rewardedAdLoadSubscribers.indexOf(listener);
    if (index >= 0) {
      this._rewardedAdLoadSubscribers.splice(index, 1);
    }
  }.bind(this);
};

AdService.prototype._subscribeRewardedAdError = function (listener) {
  if (typeof listener !== "function") {
    throw new Error("Rewarded video ad error listener is required.");
  }

  this._rewardedAdErrorSubscribers.push(listener);
  return function () {
    var index = this._rewardedAdErrorSubscribers.indexOf(listener);
    if (index >= 0) {
      this._rewardedAdErrorSubscribers.splice(index, 1);
    }
  }.bind(this);
};

AdService.prototype._normalizeHostedRecommendation = function (payload) {
  if (!this.hostedShareBehaviorEnabled) {
    return null;
  }

  var source = payload && typeof payload === "object" ? payload : {};
  if (typeof source.shareValue === "undefined" && typeof source.rewardValue === "undefined") {
    return null;
  }
  var shareValue = Number(source.shareValue);
  var rewardValue = Number(source.rewardValue);
  if ((shareValue !== 0 && shareValue !== 1) || (rewardValue !== 0 && rewardValue !== 1)) {
    throw new Error("Rewarded video ad onLoad must provide shareValue and rewardValue in hosted mode.");
  }
  if (shareValue === rewardValue) {
    throw new Error("Rewarded video ad hosted shareValue and rewardValue must be mutually exclusive.");
  }

  return {
    shareValue: shareValue,
    rewardValue: rewardValue
  };
};

AdService.prototype._bindRewardedAdLoadHandler = function (rewardedAd) {
  if (!this.hostedShareBehaviorEnabled) {
    return;
  }
  if (!rewardedAd || typeof rewardedAd.onLoad !== "function") {
    throw new Error("Rewarded video ad requires onLoad support for hosted share behavior.");
  }

  this._rewardedAdLoadHandler = function (payload) {
    var recommendation = null;
    try {
      recommendation = this._normalizeHostedRecommendation(payload);
      this._lastHostedRecommendation = recommendation;
      this._lastHostedRecommendationError = null;
    } catch (error) {
      this._lastHostedRecommendation = null;
      this._lastHostedRecommendationError = error;
    }
    this._rewardedAdLoadSubscribers.slice().forEach(function (subscriber) {
      subscriber(recommendation);
    });
  }.bind(this);

  rewardedAd.onLoad(this._rewardedAdLoadHandler);
};

AdService.prototype._bindRewardedAdErrorHandler = function (rewardedAd) {
  if (!rewardedAd || typeof rewardedAd.onError !== "function") {
    throw new Error("Rewarded video ad requires onError support.");
  }

  this._rewardedAdErrorEmitted = false;
  this._rewardedAdErrorHandler = function (error) {
    if (this._rewardedAdErrorEmitted) {
      return;
    }
    this._rewardedAdErrorEmitted = true;

    var subscribers = this._rewardedAdErrorSubscribers.slice();
    if (subscribers.length === 0) {
      this._logWarn(
        "Rewarded video ad error",
        mapWxAdErrorCode(error, "ad_error"),
        error && error.errMsg ? error.errMsg : error
      );
      return;
    }

    subscribers.forEach(function (subscriber) {
      subscriber(error);
    });
  }.bind(this);

  rewardedAd.onError(this._rewardedAdErrorHandler);
};

AdService.prototype._resolveSceneId = function (options) {
  var sceneID = options && typeof options.sceneID === "string" ? options.sceneID.trim() : "";
  if (sceneID) {
    return sceneID;
  }
  var placement = options && typeof options.placement === "string" ? options.placement.trim() : "";
  if (placement) {
    return placement;
  }
  throw new Error("Rewarded video ad hosted reporting requires sceneID.");
};

AdService.prototype._buildHostedReportContext = function (sceneID, recommendation) {
  if (!this.hostedShareBehaviorEnabled) {
    return null;
  }
  if (!this.adUnitId) {
    throw new Error("Rewarded video ad hosted reporting requires adUnitId.");
  }
  if (!recommendation) {
    return null;
  }

  var useWechatAdStrategy = recommendation.rewardValue === 1;
  return {
    currentShow: 0,
    strategy: useWechatAdStrategy ? 1 : 0,
    adunit: this.adUnitId,
    sceneID: sceneID,
    shareValue: useWechatAdStrategy ? recommendation.shareValue : 0,
    rewardValue: useWechatAdStrategy ? recommendation.rewardValue : 0
  };
};

AdService.prototype._reportHostedShareBehavior = function (rewardedAd, context, operation) {
  if (!this.hostedShareBehaviorEnabled) {
    return null;
  }
  if (!context) {
    return null;
  }
  if (!rewardedAd || typeof rewardedAd.reportShareBehavior !== "function") {
    throw new Error("Rewarded video ad requires reportShareBehavior in hosted share behavior mode.");
  }

  var reportResult = rewardedAd.reportShareBehavior({
    operation: operation,
    currentShow: context.currentShow,
    strategy: context.strategy,
    adunit: context.adunit,
    sceneID: context.sceneID,
    shareValue: context.shareValue,
    rewardValue: context.rewardValue
  });
  if (!reportResult || reportResult.success !== true) {
    throw new Error("Rewarded video ad reportShareBehavior failed: " + (reportResult && reportResult.message ? reportResult.message : "unknown"));
  }
  return reportResult;
};

AdService.prototype.reportHostedRewardSuccess = function (adResult) {
  if (!this.hostedShareBehaviorEnabled) {
    return null;
  }
  if (adResult && adResult.mock === true) {
    return null;
  }
  if (!adResult || !adResult.hostedReportContext) {
    return null;
  }
  var rewardedAd = adResult.hostedRewardedAd || this._rewardedAd;
  if (!rewardedAd) {
    throw new Error("Rewarded video ad success report requires current rewarded ad.");
  }
  return this._reportHostedShareBehavior(rewardedAd, adResult.hostedReportContext, 4);
};

AdService.prototype.reportHostedRewardFailure = function (adResult) {
  if (!this.hostedShareBehaviorEnabled) {
    return null;
  }
  if (adResult && adResult.mock === true) {
    return null;
  }
  if (!adResult || !adResult.hostedReportContext) {
    return null;
  }
  var rewardedAd = adResult.hostedRewardedAd || this._rewardedAd;
  if (!rewardedAd) {
    throw new Error("Rewarded video ad failure report requires current rewarded ad.");
  }
  return this._reportHostedShareBehavior(rewardedAd, adResult.hostedReportContext, 5);
};

AdService.prototype._createRewardedAd = function () {
  if (!this.isSupported()) {
    throw new Error("Rewarded video ad API is unavailable.");
  }
  if (!this.adUnitId) {
    throw new Error("Rewarded video ad unit id is required.");
  }

  var rewardedAd = wx.createRewardedVideoAd({
    adUnitId: this.adUnitId
  });
  this._bindRewardedAdLoadHandler(rewardedAd);
  this._bindRewardedAdErrorHandler(rewardedAd);
  return rewardedAd;
};

AdService.prototype._ensureRewardedAd = function () {
  if (this._rewardedAd) {
    return this._rewardedAd;
  }

  this._rewardedAd = this._createRewardedAd();
  return this._rewardedAd;
};

AdService.prototype.preloadRewarded = function () {
  if (!this.isSupported()) {
    return Promise.reject(new Error("Rewarded video ad API is unavailable."));
  }

  var rewardedAd = this._ensureRewardedAd();
  return new Promise(function (resolve) {
    var settled = false;
    var unsubscribeError = null;

    var finalize = function (result) {
      if (settled) {
        return;
      }
      settled = true;
      if (unsubscribeError) {
        unsubscribeError();
      }
      resolve(result);
    };

    unsubscribeError = this._subscribeRewardedAdError(function (error) {
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, "load_fail"),
        error: error
      });
    });

    this._lastHostedRecommendation = null;
    this._lastHostedRecommendationError = null;
    rewardedAd.load().then(function () {
      if (this._lastHostedRecommendationError) {
        throw this._lastHostedRecommendationError;
      }
      finalize({
        ok: true,
        code: "loaded"
      });
    }.bind(this)).catch(function (error) {
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, "load_fail"),
        error: error
      });
    });
  }.bind(this));
};

AdService.prototype._showMockRewarded = function () {
  if (!this.mockEnabled) {
    return Promise.reject(new Error("Mock rewarded ad is disabled."));
  }

  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve({
        ok: true,
        code: "mock_close",
        isCompleted: true,
        mock: true
      });
    }, this.mockCloseDelayMs);
  }.bind(this));
};

AdService.prototype.showRewarded = function (options) {
  options = options || {};
  var retryCount = Math.max(0, Math.floor(Number(options._retryCount) || 0));
  if (this._isShowing) {
    return Promise.resolve({
      ok: false,
      code: "busy",
      isCompleted: false
    });
  }

  if (!this.isSupported()) {
    if (this.mockEnabled) {
      this._logWarn("Rewarded ad unsupported. Using explicitly enabled mock result.");
      return this._showMockRewarded();
    }
    return Promise.reject(new Error("Rewarded video ad API is unavailable."));
  }

  if (!this._rewardedAd && this._lastRewardedAdDisposeAt > 0) {
    return this._waitForRewardedAdRecreateCooldown().then(function () {
      return this.showRewarded(options);
    }.bind(this));
  }

  var rewardedAd = null;
  try {
    rewardedAd = this._ensureRewardedAd();
  } catch (error) {
    return Promise.reject(error);
  }

  this._isShowing = true;
  return new Promise(function (resolve, reject) {
    var settled = false;
    var phase = "load";
    var sceneID = this._resolveSceneId(options);
    var hostedReportContext = this._buildHostedReportContext(sceneID, null);

    var closeHandler = null;
    var unsubscribeLoad = null;
    var unsubscribeError = null;

    var cleanup = function () {
      if (closeHandler && typeof rewardedAd.offClose === "function") {
        rewardedAd.offClose(closeHandler);
      }
      if (unsubscribeLoad) {
        unsubscribeLoad();
      }
      if (unsubscribeError) {
        unsubscribeError();
      }
    };

    var finalize = function (result) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      this._isShowing = false;
      resolve(result);
    }.bind(this);

    var failWithReportError = function (error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      this._isShowing = false;
      reject(error);
    }.bind(this);

    closeHandler = function (result) {
      if (settled) {
        return;
      }
      var completed = !!(result && (result.isEnded || result.isCompleted));
      try {
        this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 3);
        if (!completed) {
          this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 5);
        }
      } catch (reportError) {
        this._disposeRewardedAd();
        failWithReportError(reportError);
        return;
      }
      finalize({
        ok: true,
        code: "close",
        isCompleted: completed,
        closePayload: result,
        hostedReportContext: hostedReportContext,
        hostedRewardedAd: completed ? rewardedAd : null
      });
    }.bind(this);

    unsubscribeLoad = this._subscribeRewardedAdLoad(function (recommendation) {
      hostedReportContext = this._buildHostedReportContext(sceneID, recommendation);
    }.bind(this));

    unsubscribeError = this._subscribeRewardedAdError(function (error) {
      if (settled) {
        return;
      }
      try {
        this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 5);
      } catch (reportError) {
        this._disposeRewardedAd();
        failWithReportError(reportError);
        return;
      }
      this._disposeRewardedAd();
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, phase === "show" ? "show_fail" : "load_fail"),
        isCompleted: false,
        error: error,
        hostedReportContext: hostedReportContext
      });
    }.bind(this));

    if (typeof rewardedAd.onClose === "function") {
      rewardedAd.onClose(closeHandler);
    }

    this._lastHostedRecommendation = null;
    this._lastHostedRecommendationError = null;
    var displayRewardedAd = function () {
      phase = "show";
      if (typeof options.onShow === "function") {
        options.onShow();
      }
      return rewardedAd.show().then(function () {
        this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 1);
      }.bind(this));
    }.bind(this);

    var showLoadedAd = function () {
      if (this._lastHostedRecommendationError) {
        throw this._lastHostedRecommendationError;
      }
      if (this.hostedShareBehaviorEnabled && this._lastHostedRecommendation) {
        hostedReportContext = this._buildHostedReportContext(sceneID, this._lastHostedRecommendation);
      }
      this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 2);
      return displayRewardedAd();
    }.bind(this);

    displayRewardedAd().catch(function () {
      phase = "load";
      return rewardedAd.load().then(showLoadedAd);
    }.bind(this)).catch(function (error) {
      if (settled) {
        return;
      }
      var errorCode = mapWxAdErrorCode(error, phase === "show" ? "show_fail" : "load_fail");
      try {
        this._reportHostedShareBehavior(rewardedAd, hostedReportContext, 5);
      } catch (reportError) {
        this._disposeRewardedAd();
        failWithReportError(reportError);
        return;
      }
      this._disposeRewardedAd();
      if (errorCode === "show_fail" && retryCount < 1) {
        this._waitForRewardedAdRecreateCooldown().then(function () {
          var retryOptions = {};
          Object.keys(options).forEach(function (key) {
            retryOptions[key] = options[key];
          });
          retryOptions._retryCount = retryCount + 1;
          this.showRewarded(retryOptions).then(resolve, reject);
        }.bind(this), reject);
        return;
      }
      finalize({
        ok: false,
        code: errorCode,
        isCompleted: false,
        error: error,
        hostedReportContext: hostedReportContext
      });
    }.bind(this));
  }.bind(this));
};

module.exports = AdService;
