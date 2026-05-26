"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;

var WECHAT_SHARE_ENV_MESSAGE = "分享功能仅微信小游戏环境可开启";

function buildShareConfig(host) {
  return {
    title: host.shareTitle,
    imageUrl: host.shareImageUrl,
    query: host.shareQuery
  };
}

function requireWechatShareService(host) {
  if (!host.wechatShareService) {
    throw new Error("Wechat share service is not ready.");
  }
  return host.wechatShareService;
}

module.exports = {
  _initializeWechatShare: function () {
    var service = requireWechatShareService(this);
    service.configure(buildShareConfig(this));

    if (!service.isWechatGameRuntime()) {
      Logger.info(WECHAT_SHARE_ENV_MESSAGE);
      return Promise.resolve(false);
    }
    if (!service.isMenuShareSupported()) {
      throw new Error("Wechat menu share requires wx.showShareMenu and wx.onShareAppMessage.");
    }

    return service.enableMenuShare();
  },

  _shareGame: function () {
    var service = requireWechatShareService(this);
    service.configure(buildShareConfig(this));

    if (!service.isWechatGameRuntime()) {
      if (typeof this._setStatusWithTip === "function") {
        this._setStatusWithTip("wechat_share_unavailable", null, WECHAT_SHARE_ENV_MESSAGE);
      } else {
        this._setStatus(WECHAT_SHARE_ENV_MESSAGE);
      }
      return Promise.reject(new Error(WECHAT_SHARE_ENV_MESSAGE));
    }
    if (!service.isActiveShareSupported()) {
      throw new Error("Wechat active share requires wx.shareAppMessage.");
    }

    return service.shareAppMessage();
  }
};
