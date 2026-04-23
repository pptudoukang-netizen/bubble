"use strict";

var DEFAULT_MOCK_CLOSE_DELAY_MS = 220;

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
  this.mockEnabled = options.mockEnabled !== false;
  this.mockCloseDelayMs = Math.max(
    0,
    Math.floor(Number(options.mockCloseDelayMs) || DEFAULT_MOCK_CLOSE_DELAY_MS)
  );
  this._rewardedAd = null;
  this._isShowing = false;
}

AdService.prototype.setAdUnitId = function (adUnitId) {
  this.adUnitId = typeof adUnitId === "string" ? adUnitId : "";
  this._rewardedAd = null;
};

AdService.prototype.isSupported = function () {
  return hasRewardedVideoApi();
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

AdService.prototype._createRewardedAd = function () {
  if (!this.isSupported()) {
    return null;
  }
  if (!this.adUnitId) {
    return null;
  }

  try {
    return wx.createRewardedVideoAd({
      adUnitId: this.adUnitId
    });
  } catch (error) {
    this._logWarn("Create rewarded ad failed", error && error.message ? error.message : error);
    return null;
  }
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
    return Promise.resolve({
      ok: false,
      code: "unsupported"
    });
  }

  var rewardedAd = this._ensureRewardedAd();
  if (!rewardedAd) {
    return Promise.resolve({
      ok: false,
      code: this.adUnitId ? "init_fail" : "missing_ad_unit"
    });
  }

  return rewardedAd.load().then(function () {
    return {
      ok: true,
      code: "loaded"
    };
  }).catch(function (error) {
    return {
      ok: false,
      code: mapWxAdErrorCode(error, "load_fail"),
      error: error
    };
  });
};

AdService.prototype._showMockRewarded = function () {
  if (!this.mockEnabled) {
    return Promise.resolve({
      ok: false,
      code: "unsupported",
      isCompleted: false
    });
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
  if (this._isShowing) {
    return Promise.resolve({
      ok: false,
      code: "busy",
      isCompleted: false
    });
  }

  if (!this.isSupported()) {
    this._logWarn("Rewarded ad unsupported. Falling back to mock result.");
    return this._showMockRewarded();
  }

  var rewardedAd = this._ensureRewardedAd();
  if (!rewardedAd) {
    if (this.mockEnabled) {
      this._logWarn("Rewarded ad unavailable. Falling back to mock result.");
      return this._showMockRewarded();
    }
    return Promise.resolve({
      ok: false,
      code: this.adUnitId ? "init_fail" : "missing_ad_unit",
      isCompleted: false
    });
  }

  this._isShowing = true;
  return new Promise(function (resolve) {
    var settled = false;
    var phase = "load";

    var closeHandler = null;
    var errorHandler = null;

    var cleanup = function () {
      if (closeHandler && typeof rewardedAd.offClose === "function") {
        rewardedAd.offClose(closeHandler);
      }
      if (errorHandler && typeof rewardedAd.offError === "function") {
        rewardedAd.offError(errorHandler);
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

    closeHandler = function (result) {
      var completed = !!(result && (result.isEnded || result.isCompleted));
      finalize({
        ok: true,
        code: "close",
        isCompleted: completed,
        closePayload: result
      });
    };

    errorHandler = function (error) {
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, phase === "show" ? "show_fail" : "load_fail"),
        isCompleted: false,
        error: error
      });
    };

    if (typeof rewardedAd.onClose === "function") {
      rewardedAd.onClose(closeHandler);
    }
    if (typeof rewardedAd.onError === "function") {
      rewardedAd.onError(errorHandler);
    }

    rewardedAd.load().then(function () {
      phase = "show";
      if (typeof options.onShow === "function") {
        try {
          options.onShow();
        } catch (callbackError) {
          // Never block ad showing when hook fails.
        }
      }
      return rewardedAd.show();
    }).catch(function (error) {
      finalize({
        ok: false,
        code: mapWxAdErrorCode(error, phase === "show" ? "show_fail" : "load_fail"),
        isCompleted: false,
        error: error
      });
    });
  }.bind(this));
};

module.exports = AdService;
