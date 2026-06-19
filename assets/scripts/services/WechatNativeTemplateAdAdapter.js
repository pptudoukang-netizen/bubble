"use strict";

function resolvePlatform(explicitPlatform) {
  if (explicitPlatform) {
    return explicitPlatform;
  }
  if (typeof wx !== "undefined") {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
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

function requireFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be a finite number.");
  }
  return numberValue;
}

function requirePositiveInteger(value, fieldName) {
  var numberValue = Math.floor(Number(value));
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return numberValue;
}

function normalizePlacement(placement) {
  if (placement === "top") {
    return "top";
  }
  if (placement === "bottom") {
    return "bottom";
  }
  throw new Error("Native template ad placement must be `top` or `bottom`.");
}

function resolveScreenSize(platform) {
  if (platform && typeof platform.getSystemInfoSync === "function") {
    var systemInfo = platform.getSystemInfoSync();
    var width = Number(systemInfo.screenWidth);
    var height = Number(systemInfo.screenHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return {
        width: width,
        height: height
      };
    }
  }
  if (cc && cc.view && typeof cc.view.getFrameSize === "function") {
    var frameSize = cc.view.getFrameSize();
    if (frameSize && frameSize.width > 0 && frameSize.height > 0) {
      return {
        width: frameSize.width,
        height: frameSize.height
      };
    }
  }
  throw new Error("Screen size is required for native template ad.");
}

function normalizeStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    throw new Error("Native template ad style is required.");
  }

  var left = requireFiniteNumber(style.left, "Native template ad style.left");
  var top = requireFiniteNumber(style.top, "Native template ad style.top");
  var width = requireFiniteNumber(style.width, "Native template ad style.width");
  if (width <= 0) {
    throw new Error("Native template ad style.width must be positive.");
  }
  return {
    left: left,
    top: top,
    width: width
  };
}

function resolvePayloadHeight(payload) {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  var height = Number(payload.height);
  if (Number.isFinite(height) && height > 0) {
    return height;
  }
  height = Number(payload.realHeight);
  if (Number.isFinite(height) && height > 0) {
    return height;
  }
  return 0;
}

function resolveAdHeight(ad, payload) {
  var payloadHeight = resolvePayloadHeight(payload);
  if (payloadHeight > 0) {
    return payloadHeight;
  }
  if (!ad || !ad.style || typeof ad.style !== "object") {
    return 0;
  }
  var realHeight = Number(ad.style.realHeight);
  if (Number.isFinite(realHeight) && realHeight > 0) {
    return realHeight;
  }
  var height = Number(ad.style.height);
  if (Number.isFinite(height) && height > 0) {
    return height;
  }
  return 0;
}

function formatWxAdError(error) {
  if (!error) {
    return "unknown native template ad error";
  }
  if (error instanceof Error) {
    return error.message || String(error);
  }
  if (typeof error !== "object") {
    return String(error);
  }
  var errCode = Number(error.errCode);
  var errMsg = typeof error.errMsg === "string" ? error.errMsg : "";
  if (Number.isFinite(errCode) && errMsg) {
    return errCode + ": " + errMsg;
  }
  if (errMsg) {
    return errMsg;
  }
  if (Number.isFinite(errCode)) {
    return "native template ad error code " + errCode;
  }
  return JSON.stringify(error);
}

function WechatNativeTemplateAdAdapter(options) {
  options = options || {};
  this.platform = resolvePlatform(options.platform);
  this.logger = options.logger || null;
  this.customAd = null;
  this.handlers = null;
  this.placement = "";
  this.screenSize = null;
}

WechatNativeTemplateAdAdapter.prototype.isSupported = function () {
  return !!(this.platform && typeof this.platform.createCustomAd === "function");
};

WechatNativeTemplateAdAdapter.prototype._logWarn = function () {
  if (!this.logger || typeof this.logger.warn !== "function") {
    return;
  }
  this.logger.warn.apply(this.logger, arguments);
};

WechatNativeTemplateAdAdapter.prototype._resolveSdkVersion = function () {
  if (!this.platform || typeof this.platform.getSystemInfoSync !== "function") {
    return "";
  }
  var systemInfo = this.platform.getSystemInfoSync();
  if (!systemInfo || typeof systemInfo.SDKVersion !== "string") {
    return "";
  }
  return systemInfo.SDKVersion;
};

WechatNativeTemplateAdAdapter.prototype._emitHeight = function (payload, source) {
  if (!this.handlers || typeof this.handlers.onHeightChange !== "function") {
    return 0;
  }
  var height = resolveAdHeight(this.customAd, payload);
  if (height <= 0) {
    return 0;
  }
  this.handlers.onHeightChange(height, source);
  return height;
};

WechatNativeTemplateAdAdapter.prototype._syncBottomPlacement = function () {
  var customAd = this.customAd;
  var screenSize = this.screenSize;
  if (!customAd || !customAd.style || !screenSize) {
    return 0;
  }
  var realHeight = resolveAdHeight(customAd, null);
  if (realHeight <= 0) {
    return 0;
  }
  customAd.style.left = 0;
  customAd.style.width = screenSize.width;
  customAd.style.top = screenSize.height - realHeight;
  return realHeight;
};

WechatNativeTemplateAdAdapter.prototype._syncPlacement = function (payload, source) {
  if (this.placement === "bottom") {
    this._syncBottomPlacement();
  }
  return this._emitHeight(payload, source);
};

WechatNativeTemplateAdAdapter.prototype.showAd = function (options) {
  if (!this.isSupported()) {
    return Promise.reject(new Error("wx.createCustomAd is unavailable."));
  }
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return Promise.reject(new Error("Native template ad options are required."));
  }

  var placement = normalizePlacement(options.placement);
  var adUnitId = requireNonEmptyString(options.adUnitId, "Native template ad unit id");
  var adLogLabel = typeof options.adLogLabel === "string" && options.adLogLabel.trim()
    ? options.adLogLabel.trim()
    : "NativeTemplateAd";
  var screenSize = resolveScreenSize(this.platform);
  this._logWarn(adLogLabel + " create", {
    placement: placement,
    adUnitId: adUnitId,
    sdkVersion: this._resolveSdkVersion(),
    screenWidth: screenSize.width,
    screenHeight: screenSize.height
  });
  var style = normalizeStyle(options.style);
  if (placement === "bottom") {
    style = {
      left: 0,
      top: 0,
      width: screenSize.width
    };
  }
  this.hideAd();

  var createOptions = {
    adUnitId: adUnitId,
    style: {
      left: style.left,
      top: style.top,
      width: style.width
    }
  };
  if (options.adIntervals !== undefined) {
    createOptions.adIntervals = requirePositiveInteger(options.adIntervals, "Native template ad adIntervals");
  }

  var customAd;
  try {
    customAd = this.platform.createCustomAd(createOptions);
  } catch (error) {
    return Promise.reject(new Error("wx.createCustomAd failed: " + formatWxAdError(error)));
  }
  if (!customAd || typeof customAd.show !== "function" || typeof customAd.hide !== "function" || typeof customAd.destroy !== "function") {
    return Promise.reject(new Error("wx.createCustomAd returned invalid ad instance."));
  }
  if (!customAd.style || typeof customAd.style !== "object") {
    return Promise.reject(new Error("wx.createCustomAd returned ad without style."));
  }

  var self = this;
  return new Promise(function (resolve, reject) {
    var settled = false;
    var handlers = {
      onHeightChange: options.onHeightChange,
      onError: options.onError,
      load: null,
      resize: null,
      error: null,
      hide: null
    };

    function settleResolve() {
      if (settled) {
        return;
      }
      settled = true;
      if (self.placement === "bottom") {
        self._syncBottomPlacement();
      }
      var height = self._emitHeight(null, "show");
      var isShowing = typeof customAd.isShow === "function" ? customAd.isShow() : null;
      self._logWarn(adLogLabel + " show", {
        isShow: isShowing,
        top: customAd.style ? customAd.style.top : null,
        height: height
      });
      resolve(customAd);
    }

    function settleReject(error) {
      if (settled) {
        return;
      }
      settled = true;
      var message = formatWxAdError(error);
      self._logWarn(adLogLabel + " failed", message);
      self.hideAd();
      reject(new Error(message));
    }

    function startShow() {
      Promise.resolve(customAd.show()).then(settleResolve, settleReject);
    }

    handlers.load = function (payload) {
      self._syncPlacement(payload, "load");
      startShow();
    };
    handlers.resize = function (payload) {
      self._syncPlacement(payload, "resize");
    };
    handlers.error = function (error) {
      self._logWarn(adLogLabel + " error", formatWxAdError(error));
      if (settled) {
        if (typeof handlers.onError === "function") {
          handlers.onError(error);
        }
        return;
      }
      settleReject(error);
    };
    handlers.hide = function () {
      self._logWarn(adLogLabel + " hide");
    };

    if (typeof customAd.onLoad === "function") {
      customAd.onLoad(handlers.load);
    }
    if (typeof customAd.onResize === "function") {
      customAd.onResize(handlers.resize);
    }
    if (typeof customAd.onError === "function") {
      customAd.onError(handlers.error);
    }
    if (typeof customAd.onHide === "function") {
      customAd.onHide(handlers.hide);
    }

    self.customAd = customAd;
    self.handlers = handlers;
    self.placement = placement;
    self.screenSize = screenSize;
    self._syncPlacement(null, "create");

    if (typeof customAd.onLoad !== "function") {
      startShow();
    }
  });
};

WechatNativeTemplateAdAdapter.prototype.showTopAd = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return Promise.reject(new Error("Native template ad options are required."));
  }
  return this.showAd({
    adUnitId: options.adUnitId,
    adIntervals: options.adIntervals,
    style: options.style,
    onHeightChange: options.onHeightChange,
    onError: options.onError,
    placement: "top"
  });
};

WechatNativeTemplateAdAdapter.prototype.updateStyle = function (style) {
  if (!this.customAd) {
    return false;
  }
  var normalizedStyle = normalizeStyle(style);
  this.customAd.style.left = normalizedStyle.left;
  this.customAd.style.top = normalizedStyle.top;
  this.customAd.style.width = normalizedStyle.width;
  if (this.placement === "bottom") {
    this._syncBottomPlacement();
  }
  return true;
};

WechatNativeTemplateAdAdapter.prototype.hideAd = function () {
  var customAd = this.customAd;
  if (!customAd) {
    return;
  }
  var handlers = this.handlers;
  if (handlers) {
    if (handlers.load && typeof customAd.offLoad === "function") {
      customAd.offLoad(handlers.load);
    }
    if (handlers.resize && typeof customAd.offResize === "function") {
      customAd.offResize(handlers.resize);
    }
    if (handlers.error && typeof customAd.offError === "function") {
      customAd.offError(handlers.error);
    }
    if (handlers.hide && typeof customAd.offHide === "function") {
      customAd.offHide(handlers.hide);
    }
  }
  customAd.hide();
  customAd.destroy();
  this.customAd = null;
  this.handlers = null;
  this.placement = "";
  this.screenSize = null;
};

module.exports = WechatNativeTemplateAdAdapter;
