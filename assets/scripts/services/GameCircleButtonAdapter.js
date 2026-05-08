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

function stringifyForError(data) {
  var text = JSON.stringify(data);
  if (text.length > 800) {
    return text.slice(0, 800);
  }
  return text;
}

function resolveCloudDataListPayload(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Game circle cloud function result must be an object.");
  }
  if (Array.isArray(result.dataList)) {
    return {
      dataList: result.dataList
    };
  }
  if (
    result.gameCircleData &&
    result.gameCircleData.data &&
    Array.isArray(result.gameCircleData.data.dataList)
  ) {
    return {
      dataList: result.gameCircleData.data.dataList
    };
  }
  if (
    result.data &&
    typeof result.data === "object" &&
    Array.isArray(result.data.dataList)
  ) {
    return {
      dataList: result.data.dataList
    };
  }
  throw new Error("Game circle cloud function result missing dataList; result=" + stringifyForError(result));
}

function GameCircleButtonAdapter(options) {
  options = options || {};
  this.platform = resolvePlatform(options.platform);
  this.cloud = options.cloud || null;
  this.cloudInitialized = false;
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

GameCircleButtonAdapter.prototype._resolveCloudFunctionName = function () {
  if (!this.cloud || typeof this.cloud !== "object") {
    throw new Error("Game circle cloud config is required for encrypted data.");
  }
  if (typeof this.cloud.functionName !== "string" || !this.cloud.functionName) {
    throw new Error("Game circle cloud functionName is required.");
  }
  return this.cloud.functionName;
};

GameCircleButtonAdapter.prototype._ensureCloudReady = function () {
  if (!this.platform || !this.platform.cloud) {
    return Promise.reject(new Error("wx.cloud is unavailable for game circle data decryption."));
  }
  if (typeof this.platform.cloud.callFunction !== "function") {
    return Promise.reject(new Error("wx.cloud.callFunction is unavailable for game circle data decryption."));
  }
  if (typeof this.platform.cloud.CloudID !== "function") {
    return Promise.reject(new Error("wx.cloud.CloudID is unavailable for game circle data decryption."));
  }
  if (!this.cloud || typeof this.cloud.envId !== "string" || !this.cloud.envId) {
    return Promise.reject(new Error("Game circle cloud envId is required."));
  }
  if (!this.cloudInitialized && typeof this.platform.cloud.init === "function") {
    this.platform.cloud.init({
      env: this.cloud.envId
    });
    this.cloudInitialized = true;
  }
  return Promise.resolve(true);
};

GameCircleButtonAdapter.prototype._decryptGameClubDataByCloud = function (response) {
  if (!response || typeof response !== "object") {
    return Promise.reject(new Error("Game circle encrypted response must be an object."));
  }
  if (typeof response.cloudID !== "string" || !response.cloudID) {
    return Promise.reject(new Error("Game circle encrypted response missing cloudID."));
  }
  var functionName = this._resolveCloudFunctionName();
  return this._ensureCloudReady().then(function () {
    return this.platform.cloud.callFunction({
      name: functionName,
      data: {
        gameCircleData: this.platform.cloud.CloudID(response.cloudID)
      }
    });
  }.bind(this)).then(function (cloudResponse) {
    if (!cloudResponse || typeof cloudResponse !== "object" || !cloudResponse.result) {
      throw new Error("Game circle cloud function returned empty result.");
    }
    return resolveCloudDataListPayload(cloudResponse.result);
  });
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
        if (response && typeof response === "object" && response.code !== undefined && Number(response.code) !== 0) {
          reject(new Error(response.message || response.errMsg || "wx.getGameClubData returned non-zero code."));
          return;
        }
        if (response && typeof response === "object" && response.cloudID) {
          this._decryptGameClubDataByCloud(response).then(resolve).catch(reject);
          return;
        }
        resolve(response);
      }.bind(this),
      fail: function (error) {
        var message = error && (error.errorMessage || error.errMsg || error.message)
          ? (error.errorMessage || error.errMsg || error.message)
          : "wx.getGameClubData failed.";
        reject(new Error(message));
      }
    });
  }.bind(this));
};

module.exports = GameCircleButtonAdapter;
