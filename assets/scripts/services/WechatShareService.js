"use strict";

function resolvePlatform(explicitPlatform) {
  if (explicitPlatform) {
    return explicitPlatform;
  }
  if (typeof wx !== "undefined" && wx) {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function isWechatGameRuntime() {
  return !!(
    typeof cc !== "undefined" &&
    cc &&
    cc.sys &&
    typeof cc.sys.platform !== "undefined" &&
    typeof cc.sys.WECHAT_GAME !== "undefined" &&
    cc.sys.platform === cc.sys.WECHAT_GAME
  );
}

function normalizeNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function normalizeOptionalString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  return value.trim();
}

function normalizeShareConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Wechat share config must be an object.");
  }
  return {
    title: normalizeNonEmptyString(config.title, "shareTitle"),
    imageUrl: normalizeOptionalString(config.imageUrl, "shareImageUrl"),
    query: normalizeOptionalString(config.query, "shareQuery")
  };
}

function appendOptionalPayloadField(payload, key, value) {
  if (value) {
    payload[key] = value;
  }
}

function buildWxErrorMessage(prefix, error) {
  if (error && typeof error === "object") {
    if (typeof error.errMsg === "string" && error.errMsg) {
      return prefix + ": " + error.errMsg;
    }
    if (typeof error.message === "string" && error.message) {
      return prefix + ": " + error.message;
    }
  }
  return prefix + ".";
}

function completeShareOnce(context, resolve, reject, error) {
  if (context.completed === true) {
    return;
  }
  context.completed = true;
  if (context.showHandler && context.platform && typeof context.platform.offShow === "function") {
    context.platform.offShow(context.showHandler);
  }
  if (error) {
    reject(error);
    return;
  }
  resolve(true);
}

function WechatShareService(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("WechatShareService options are required.");
  }
  this.platform = resolvePlatform(options.platform);
  this.logger = options.logger;
  this.shareConfig = normalizeShareConfig(options.shareConfig);
  this._menuShareHandlerRegistered = false;
}

WechatShareService.prototype.isWechatGameRuntime = function () {
  return isWechatGameRuntime();
};

WechatShareService.prototype.isMenuShareSupported = function () {
  return !!(
    this.platform &&
    typeof this.platform.showShareMenu === "function" &&
    typeof this.platform.onShareAppMessage === "function"
  );
};

WechatShareService.prototype.isActiveShareSupported = function () {
  return !!(this.platform && typeof this.platform.shareAppMessage === "function");
};

WechatShareService.prototype.configure = function (shareConfig) {
  this.shareConfig = normalizeShareConfig(shareConfig);
};

WechatShareService.prototype.buildSharePayload = function (overrideConfig) {
  var config = overrideConfig ? normalizeShareConfig(overrideConfig) : this.shareConfig;
  var payload = {
    title: config.title
  };
  appendOptionalPayloadField(payload, "imageUrl", config.imageUrl);
  appendOptionalPayloadField(payload, "query", config.query);
  return payload;
};

WechatShareService.prototype.registerMenuShareHandler = function () {
  if (!this.platform || typeof this.platform.onShareAppMessage !== "function") {
    throw new Error("wx.onShareAppMessage is unavailable.");
  }
  if (this._menuShareHandlerRegistered === true) {
    return true;
  }
  this.platform.onShareAppMessage(function () {
    return this.buildSharePayload();
  }.bind(this));
  this._menuShareHandlerRegistered = true;
  return true;
};

WechatShareService.prototype.showShareMenu = function () {
  if (!this.platform || typeof this.platform.showShareMenu !== "function") {
    return Promise.reject(new Error("wx.showShareMenu is unavailable."));
  }

  return new Promise(function (resolve, reject) {
    this.platform.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage"],
      success: function () {
        resolve(true);
      },
      fail: function (error) {
        reject(new Error(buildWxErrorMessage("wx.showShareMenu failed", error)));
      }
    });
  }.bind(this));
};

WechatShareService.prototype.enableMenuShare = function () {
  this.registerMenuShareHandler();
  return this.showShareMenu();
};

WechatShareService.prototype.shareAppMessage = function (overrideConfig) {
  if (!this.platform || typeof this.platform.shareAppMessage !== "function") {
    return Promise.reject(new Error("wx.shareAppMessage is unavailable."));
  }
  if (typeof this.platform.onShow !== "function") {
    return Promise.reject(new Error("wx.onShow is required to observe active share return."));
  }
  if (typeof this.platform.offShow !== "function") {
    return Promise.reject(new Error("wx.offShow is required to cleanup active share return observer."));
  }
  var payload = this.buildSharePayload(overrideConfig);
  return new Promise(function (resolve, reject) {
    var context = {
      completed: false,
      platform: this.platform,
      showHandler: null
    };
    context.showHandler = function () {
      completeShareOnce(context, resolve, reject);
    };
    var options = {
      title: payload.title,
      success: function () {
        completeShareOnce(context, resolve, reject);
      },
      fail: function (error) {
        completeShareOnce(context, resolve, reject, new Error(buildWxErrorMessage("wx.shareAppMessage failed", error)));
      }
    };
    appendOptionalPayloadField(options, "imageUrl", payload.imageUrl);
    appendOptionalPayloadField(options, "query", payload.query);
    this.platform.onShow(context.showHandler);
    try {
      this.platform.shareAppMessage(options);
    } catch (error) {
      completeShareOnce(context, resolve, reject, error);
    }
  }.bind(this));
};

module.exports = WechatShareService;
