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

function hasInterstitialAdApi() {
  return !!(
    typeof wx !== "undefined" &&
    wx &&
    typeof wx.createInterstitialAd === "function"
  );
}

function AdService(options) {
  options = options || {};
  this.adUnitId = typeof options.adUnitId === "string" ? options.adUnitId : "";
  this.interstitialAdUnitId = typeof options.interstitialAdUnitId === "string" ? options.interstitialAdUnitId : "";
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
  this._rewardedAdsByUnitId = {};
  this._lastHostedRecommendation = null;
  this._lastHostedRecommendationError = null;
  this._rewardedAdNeedsRecreate = false;
  this._lastRewardedAdDisposeAt = 0;
  this._interstitialAd = null;
  this._interstitialAdsByUnitId = {};
  this._isShowing = false;
  this._isShowingInterstitial = false;
  this._activeShowToken = 0;
}

AdService.prototype.setAdUnitId = function (adUnitId) {
  var nextAdUnitId = typeof adUnitId === "string" ? adUnitId : "";
  if (this._isShowing && nextAdUnitId !== this.adUnitId) {
    throw new Error("Cannot switch rewarded video ad unit while showing.");
  }

  this.adUnitId = nextAdUnitId;
  this._rewardedAd = this._rewardedAdsByUnitId[nextAdUnitId] || null;
  this._lastHostedRecommendation = null;
  this._lastHostedRecommendationError = null;
  this._rewardedAdErrorEmitted = false;
  this._lastRewardedAdDisposeAt = 0;
};

AdService.prototype.setInterstitialAdUnitId = function (adUnitId) {
  var nextAdUnitId = typeof adUnitId === "string" ? adUnitId : "";
  if (this._isShowingInterstitial && nextAdUnitId !== this.interstitialAdUnitId) {
    throw new Error("Cannot switch interstitial ad unit while showing.");
  }

  this.interstitialAdUnitId = nextAdUnitId;
  this._interstitialAd = this._interstitialAdsByUnitId[nextAdUnitId] || null;
};

AdService.prototype.isSupported = function () {
  return hasRewardedVideoApi();
};

AdService.prototype.canShowRewarded = function () {
  return this.isSupported() || this.mockEnabled === true;
};

AdService.prototype.canShowInterstitial = function () {
  return hasInterstitialAdApi();
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

AdService.prototype._disposeRewardedAd = function (expectedRewardedAd) {
  if (expectedRewardedAd && this._rewardedAd !== expectedRewardedAd) {
    return false;
  }

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
  return hadRewardedAd;
};

AdService.prototype._waitForRewardedAdRecreateCooldown = function () {
  if (this._rewardedAd) {
    return Promise.resolve();
  }
  if (this.recreateDelayMs <= 0 || this._lastRewardedAdDisposeAt <= 0) {
    this._lastRewardedAdDisposeAt = 0;
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
    if (rewardedAd !== this._rewardedAd) {
      return;
    }
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

  this._rewardedAdErrorHandler = function (error) {
    if (rewardedAd !== this._rewardedAd) {
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
    adUnitId: this.adUnitId,
    multiton: true
  });
  this._rewardedAdsByUnitId[this.adUnitId] = rewardedAd;
  this._bindRewardedAdLoadHandler(rewardedAd);
  this._bindRewardedAdErrorHandler(rewardedAd);
  return rewardedAd;
};

AdService.prototype._ensureRewardedAd = function () {
  if (this._rewardedAd) {
    return this._rewardedAd;
  }

  var cachedAd = this._rewardedAdsByUnitId[this.adUnitId];
  if (cachedAd) {
    this._rewardedAd = cachedAd;
    return this._rewardedAd;
  }

  this._rewardedAd = this._createRewardedAd();
  return this._rewardedAd;
};

AdService.prototype._createInterstitialAd = function () {
  if (!this.canShowInterstitial()) {
    throw new Error("Interstitial ad API is unavailable.");
  }
  if (!this.interstitialAdUnitId) {
    throw new Error("Interstitial ad unit id is required.");
  }

  var interstitialAd = wx.createInterstitialAd({
    adUnitId: this.interstitialAdUnitId
  });
  if (!interstitialAd || typeof interstitialAd.show !== "function") {
    throw new Error("wx.createInterstitialAd returned invalid ad instance.");
  }
  if (typeof interstitialAd.onError === "function") {
    interstitialAd.onError(function (error) {
      this._logWarn(
        "Interstitial ad error",
        mapWxAdErrorCode(error, "ad_error"),
        error && error.errMsg ? error.errMsg : error
      );
    }.bind(this));
  }
  this._interstitialAdsByUnitId[this.interstitialAdUnitId] = interstitialAd;
  return interstitialAd;
};

AdService.prototype._ensureInterstitialAd = function () {
  if (this._interstitialAd) {
    return this._interstitialAd;
  }

  var cachedAd = this._interstitialAdsByUnitId[this.interstitialAdUnitId];
  if (cachedAd) {
    this._interstitialAd = cachedAd;
    return this._interstitialAd;
  }

  this._interstitialAd = this._createInterstitialAd();
  return this._interstitialAd;
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

AdService.prototype.showInterstitial = function (options) {
  options = options || {};
  if (this._isShowing || this._isShowingInterstitial) {
    return Promise.resolve({
      ok: false,
      code: "busy"
    });
  }

  if (!this.canShowInterstitial()) {
    return Promise.reject(new Error("Interstitial ad API is unavailable."));
  }

  var interstitialAd = null;
  try {
    interstitialAd = this._ensureInterstitialAd();
  } catch (error) {
    return Promise.reject(error);
  }

  this._isShowingInterstitial = true;
  return new Promise(function (resolve) {
    var settled = false;
    var showStarted = false;
    var closeHandler = null;

    var cleanup = function () {
      if (closeHandler && typeof interstitialAd.offClose === "function") {
        interstitialAd.offClose(closeHandler);
      }
      this._isShowingInterstitial = false;
    }.bind(this);

    var finalize = function (result) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    closeHandler = function (result) {
      finalize({
        ok: true,
        code: "close",
        closePayload: result
      });
    };

    if (typeof interstitialAd.onClose === "function") {
      interstitialAd.onClose(closeHandler);
    }

    var displayInterstitialAd = function () {
      if (!showStarted && typeof options.onShow === "function") {
        showStarted = true;
        options.onShow();
      }
      return interstitialAd.show();
    };

    displayInterstitialAd().catch(function () {
      if (typeof interstitialAd.load !== "function") {
        throw new Error("Interstitial ad load API is unavailable after show failure.");
      }
      return interstitialAd.load().then(displayInterstitialAd);
    }).then(function () {
      if (typeof interstitialAd.onClose !== "function") {
        finalize({
          ok: true,
          code: "show"
        });
      }
    }).catch(function (error) {
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, "show_fail"),
        error: error
      });
    });
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
  this._activeShowToken += 1;
  var showToken = this._activeShowToken;
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
      if (this._activeShowToken === showToken) {
        this._isShowing = false;
      }
      resolve(result);
    }.bind(this);

    var failWithReportError = function (error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (this._activeShowToken === showToken) {
        this._isShowing = false;
      }
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
        failWithReportError(reportError);
        return;
      }
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
        failWithReportError(reportError);
        return;
      }
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
