"use strict";

var BundleLoader = require("../utils/BundleLoader");

var LOADING_ICON_PATH = "image/loading";
var LOADING_ICON_SIZE = 96;
var MASK_OPACITY = 150;
var ROTATE_DURATION = 0.75;

function requireRootNode(rootNode) {
  if (!rootNode || !rootNode.isValid) {
    throw new Error("NetworkLoadingOverlay requires a valid rootNode.");
  }
  return rootNode;
}

function requirePositiveInteger(value, fieldName) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed !== Number(value)) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return parsed;
}

function createTimeoutError(timeoutMs) {
  var error = new Error("NETWORK_LOADING_TIMEOUT");
  error.code = "NETWORK_LOADING_TIMEOUT";
  error.timeoutMs = timeoutMs;
  return error;
}

function NetworkLoadingOverlay(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("NetworkLoadingOverlay options are required.");
  }
  this.rootNode = requireRootNode(options.rootNode);
  this.timeoutMs = requirePositiveInteger(options.timeoutMs, "NetworkLoadingOverlay timeoutMs");
  this.zIndex = requirePositiveInteger(options.zIndex, "NetworkLoadingOverlay zIndex");
  this._overlayNode = null;
  this._maskGraphics = null;
  this._loadingNode = null;
  this._loadingSprite = null;
  this._spriteFramePromise = null;
  this._spriteFrame = null;
  this._tokens = {};
  this._tokenSeq = 0;
}

NetworkLoadingOverlay.prototype._loadSpriteFrame = function () {
  if (this._spriteFrame) {
    return Promise.resolve(this._spriteFrame);
  }
  if (this._spriteFramePromise) {
    return this._spriteFramePromise;
  }
  this._spriteFramePromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(LOADING_ICON_PATH, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load network loading sprite failed: " + LOADING_ICON_PATH + ", " + error.message));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("Network loading spriteFrame is empty: " + LOADING_ICON_PATH));
        return;
      }
      this._spriteFrame = spriteFrame;
      this._spriteFramePromise = null;
      resolve(spriteFrame);
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this._spriteFramePromise = null;
    throw error;
  }.bind(this));
  return this._spriteFramePromise;
};

NetworkLoadingOverlay.prototype._ensureNodes = function () {
  if (this._overlayNode && cc.isValid(this._overlayNode)) {
    return this._loadSpriteFrame().then(function (spriteFrame) {
      this._loadingSprite.spriteFrame = spriteFrame;
      this.refreshLayout();
      return this._overlayNode;
    }.bind(this));
  }

  var overlayNode = new cc.Node("network_loading_overlay");
  overlayNode.parent = this.rootNode;
  overlayNode.zIndex = this.zIndex;
  overlayNode.active = false;
  overlayNode.setAnchorPoint(0.5, 0.5);
  overlayNode.addComponent(cc.BlockInputEvents);

  var maskGraphics = overlayNode.addComponent(cc.Graphics);
  maskGraphics.fillColor = cc.color(0, 0, 0, MASK_OPACITY);

  var loadingNode = new cc.Node("network_loading_icon");
  loadingNode.parent = overlayNode;
  loadingNode.zIndex = this.zIndex + 1;
  loadingNode.setAnchorPoint(0.5, 0.5);
  loadingNode.setContentSize(LOADING_ICON_SIZE, LOADING_ICON_SIZE);

  var loadingSprite = loadingNode.addComponent(cc.Sprite);
  loadingSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

  this._overlayNode = overlayNode;
  this._maskGraphics = maskGraphics;
  this._loadingNode = loadingNode;
  this._loadingSprite = loadingSprite;

  return this._loadSpriteFrame().then(function (spriteFrame) {
    this._loadingSprite.spriteFrame = spriteFrame;
    this.refreshLayout();
    return this._overlayNode;
  }.bind(this));
};

NetworkLoadingOverlay.prototype.refreshLayout = function () {
  if (!this._overlayNode || !cc.isValid(this._overlayNode)) {
    return;
  }
  var size = cc.winSize;
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new Error("Network loading overlay requires a valid winSize.");
  }
  this._overlayNode.setContentSize(size.width, size.height);
  this._overlayNode.setPosition(0, 0);
  this._maskGraphics.clear();
  this._maskGraphics.fillColor = cc.color(0, 0, 0, MASK_OPACITY);
  this._maskGraphics.rect(-size.width * 0.5, -size.height * 0.5, size.width, size.height);
  this._maskGraphics.fill();
  this._loadingNode.setPosition(0, 0);
  this._loadingNode.setContentSize(LOADING_ICON_SIZE, LOADING_ICON_SIZE);
};

NetworkLoadingOverlay.prototype._activeTokenCount = function () {
  return Object.keys(this._tokens).length;
};

NetworkLoadingOverlay.prototype._startSpin = function () {
  if (!this._loadingNode || !cc.isValid(this._loadingNode)) {
    throw new Error("Network loading icon node is not ready.");
  }
  this._loadingNode.stopAllActions();
  this._loadingNode.angle = 0;
  this._loadingNode.runAction(cc.repeatForever(cc.rotateBy(ROTATE_DURATION, -360)));
};

NetworkLoadingOverlay.prototype._stopSpin = function () {
  if (this._loadingNode && cc.isValid(this._loadingNode)) {
    this._loadingNode.stopAllActions();
    this._loadingNode.angle = 0;
  }
};

NetworkLoadingOverlay.prototype.show = function (options) {
  var showOptions = options;
  if (showOptions === undefined) {
    showOptions = {};
  }
  if (!showOptions || typeof showOptions !== "object" || Array.isArray(showOptions)) {
    throw new Error("Network loading show options must be an object.");
  }
  var timeoutMs = showOptions.timeoutMs === undefined
    ? this.timeoutMs
    : requirePositiveInteger(showOptions.timeoutMs, "Network loading timeoutMs");
  var onTimeout = showOptions.onTimeout;
  if (onTimeout !== undefined && typeof onTimeout !== "function") {
    throw new Error("Network loading onTimeout must be a function.");
  }

  return this._ensureNodes().then(function () {
    this._tokenSeq += 1;
    var token = {
      id: "network_loading_" + this._tokenSeq
    };
    var timerId = setTimeout(function () {
      if (!this._tokens[token.id]) {
        return;
      }
      var error = createTimeoutError(timeoutMs);
      this.hide(token);
      if (typeof onTimeout === "function") {
        onTimeout(error);
      }
    }.bind(this), timeoutMs);
    this._tokens[token.id] = {
      timerId: timerId
    };
    this._overlayNode.active = true;
    this._overlayNode.zIndex = this.zIndex;
    this.refreshLayout();
    this._startSpin();
    return token;
  }.bind(this));
};

NetworkLoadingOverlay.prototype.hide = function (token) {
  if (!token || typeof token.id !== "string" || !token.id) {
    throw new Error("Network loading token is required.");
  }
  var record = this._tokens[token.id];
  if (!record) {
    return;
  }
  clearTimeout(record.timerId);
  delete this._tokens[token.id];
  if (this._activeTokenCount() > 0) {
    return;
  }
  this._stopSpin();
  if (this._overlayNode && cc.isValid(this._overlayNode)) {
    this._overlayNode.active = false;
  }
};

NetworkLoadingOverlay.prototype.run = function (promiseFactory, options) {
  if (typeof promiseFactory !== "function") {
    return Promise.reject(new Error("Network loading task must be a function."));
  }
  var runOptions = options;
  if (runOptions === undefined) {
    runOptions = {};
  }
  if (!runOptions || typeof runOptions !== "object" || Array.isArray(runOptions)) {
    return Promise.reject(new Error("Network loading run options must be an object."));
  }
  var token = null;
  var settled = false;
  return new Promise(function (resolve, reject) {
    this.show({
      timeoutMs: runOptions.timeoutMs,
      onTimeout: function (error) {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      }
    }).then(function (loadingToken) {
      token = loadingToken;
      var taskPromise = promiseFactory();
      if (!taskPromise || typeof taskPromise.then !== "function") {
        throw new Error("Network loading task must return a Promise.");
      }
      taskPromise.then(function (result) {
        if (settled) {
          return;
        }
        settled = true;
        this.hide(token);
        resolve(result);
      }.bind(this)).catch(function (error) {
        if (settled) {
          return;
        }
        settled = true;
        this.hide(token);
        reject(error);
      }.bind(this));
    }.bind(this)).catch(function (error) {
      if (settled) {
        return;
      }
      settled = true;
      if (token) {
        this.hide(token);
      }
      reject(error);
    }.bind(this));
  }.bind(this));
};

NetworkLoadingOverlay.prototype.destroy = function () {
  Object.keys(this._tokens).forEach(function (tokenId) {
    clearTimeout(this._tokens[tokenId].timerId);
    delete this._tokens[tokenId];
  }, this);
  this._stopSpin();
  if (this._overlayNode && cc.isValid(this._overlayNode)) {
    this._overlayNode.destroy();
  }
  this._overlayNode = null;
  this._maskGraphics = null;
  this._loadingNode = null;
  this._loadingSprite = null;
};

NetworkLoadingOverlay.isTimeoutError = function (error) {
  return !!(error && (error.code === "NETWORK_LOADING_TIMEOUT" || error.message === "NETWORK_LOADING_TIMEOUT"));
};

module.exports = NetworkLoadingOverlay;
