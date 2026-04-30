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

function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") {
    throw new Error("Game circle button rect is required.");
  }
  var left = Number(rect.left);
  var top = Number(rect.top);
  var width = Number(rect.width);
  var height = Number(rect.height);
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Game circle button rect contains invalid number.");
  }
  if (width <= 0 || height <= 0) {
    throw new Error("Game circle button rect width and height must be positive.");
  }
  return {
    left: left,
    top: top,
    width: width,
    height: height
  };
}

function buildCreateOptions(rect, entry) {
  var options = {
    type: "text",
    text: "",
    style: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      backgroundColor: "rgba(0,0,0,0)",
      borderColor: "rgba(0,0,0,0)",
      borderWidth: 0,
      borderRadius: 0,
      color: "rgba(0,0,0,0)",
      fontSize: 1,
      textAlign: "center",
      lineHeight: rect.height
    }
  };
  if (entry && typeof entry.openlink === "string" && entry.openlink) {
    options.openlink = entry.openlink;
    options.hasRedDot = false;
  }
  return options;
}

function GameCircleButtonAdapter(options) {
  options = options || {};
  this.platform = resolvePlatform(options.platform);
  this.buttons = {};
  this.tapHandlers = {};
}

GameCircleButtonAdapter.prototype.isSupported = function () {
  return !!(this.platform && typeof this.platform.createGameClubButton === "function");
};

GameCircleButtonAdapter.prototype.canGetGameClubData = function () {
  return !!(this.platform && typeof this.platform.getGameClubData === "function");
};

GameCircleButtonAdapter.prototype.showButton = function (key, rect, entry, onTap) {
  if (typeof key !== "string" || !key) {
    throw new Error("Game circle button key is required.");
  }
  if (!this.isSupported()) {
    throw new Error("wx.createGameClubButton is unavailable.");
  }

  var normalizedRect = normalizeRect(rect);
  this.hideButton(key);
  var button = this.platform.createGameClubButton(buildCreateOptions(normalizedRect, entry));
  if (!button) {
    throw new Error("wx.createGameClubButton returned empty button.");
  }
  if (typeof button.show !== "function" || typeof button.hide !== "function" || typeof button.destroy !== "function") {
    throw new Error("GameClubButton instance is missing required lifecycle methods.");
  }
  if (typeof onTap === "function") {
    if (typeof button.onTap !== "function") {
      throw new Error("GameClubButton instance is missing onTap.");
    }
    button.onTap(onTap);
    this.tapHandlers[key] = onTap;
  }
  this.buttons[key] = button;
  button.show();
  return button;
};

GameCircleButtonAdapter.prototype.hideButton = function (key) {
  var button = this.buttons[key];
  if (!button) {
    return;
  }
  var handler = this.tapHandlers[key];
  if (handler && typeof button.offTap === "function") {
    button.offTap(handler);
  }
  button.hide();
  button.destroy();
  delete this.buttons[key];
  delete this.tapHandlers[key];
};

GameCircleButtonAdapter.prototype.hideAllButtons = function () {
  Object.keys(this.buttons).forEach(function (key) {
    this.hideButton(key);
  }, this);
};

GameCircleButtonAdapter.prototype.getGameClubData = function (dataTypeList) {
  if (!this.canGetGameClubData()) {
    return Promise.reject(new Error("wx.getGameClubData is unavailable."));
  }
  if (!Array.isArray(dataTypeList) || dataTypeList.length === 0) {
    return Promise.reject(new Error("Game circle dataTypeList must be non-empty."));
  }

  return new Promise(function (resolve, reject) {
    this.platform.getGameClubData({
      dataTypeList: dataTypeList,
      success: function (response) {
        resolve(response);
      },
      fail: function (error) {
        var message = error && error.errorMessage ? error.errorMessage : "wx.getGameClubData failed.";
        reject(new Error(message));
      }
    });
  }.bind(this));
};

module.exports = GameCircleButtonAdapter;
