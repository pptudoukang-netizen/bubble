"use strict";

var Logger = require("../utils/Logger");

var DEFAULT_TIPS_PREFAB_PATH = "prefabs/ui/Tips";
var DEFAULT_TIPS_CONFIG_PATH = "config/tips_messages";
var DEFAULT_APPEAR_DURATION = 0.28;
var DEFAULT_STAY_DURATION = 2;
var DEFAULT_HIDE_DURATION = 0.16;
var DEFAULT_START_OFFSET_Y = -200;
var DEFAULT_STACK_GAP = 0;
var DEFAULT_Z_INDEX = 120;

function formatTemplate(template, params) {
  if (typeof template !== "string") {
    return "";
  }

  var safeParams = params && typeof params === "object" ? params : {};
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
    if (!Object.prototype.hasOwnProperty.call(safeParams, key)) {
      return "";
    }
    var value = safeParams[key];
    return value === null || typeof value === "undefined" ? "" : String(value);
  });
}

function getTipLabel(tipNode) {
  if (!tipNode) {
    return null;
  }

  var labelNode = tipNode.getChildByName("tips");
  if (!labelNode) {
    return tipNode;
  }

  return labelNode;
}

function TipsPresenter(options) {
  var resolvedOptions = options || {};
  this.rootNode = resolvedOptions.rootNode || null;
  this.resourceGateway = resolvedOptions.resourceGateway || null;
  this.tipsPrefabPath = resolvedOptions.tipsPrefabPath || DEFAULT_TIPS_PREFAB_PATH;
  this.tipsConfigPath = resolvedOptions.tipsConfigPath || DEFAULT_TIPS_CONFIG_PATH;
  this.appearDuration = Math.max(0.05, Number(resolvedOptions.appearDuration) || DEFAULT_APPEAR_DURATION);
  this.stayDuration = Math.max(0, Number(resolvedOptions.stayDuration) || DEFAULT_STAY_DURATION);
  this.hideDuration = Math.max(0, Number(resolvedOptions.hideDuration) || DEFAULT_HIDE_DURATION);
  this.startOffsetY = Number.isFinite(Number(resolvedOptions.startOffsetY))
    ? Number(resolvedOptions.startOffsetY)
    : DEFAULT_START_OFFSET_Y;
  this.stackGap = Math.max(0, Number(resolvedOptions.stackGap) || DEFAULT_STACK_GAP);
  this.zIndex = Math.max(0, Math.floor(Number(resolvedOptions.zIndex) || DEFAULT_Z_INDEX));

  this._tipsPrefab = null;
  this._tipsPrefabPromise = null;
  this._tipMessages = {};
  this._tipMessagesPromise = null;
  this._activeTipNodes = [];
}

TipsPresenter.prototype.warmup = function () {
  return Promise.all([
    this._ensurePrefab(),
    this._ensureMessages()
  ]).then(function () {
    return true;
  });
};

TipsPresenter.prototype.resolveMessage = function (key, params, fallbackText) {
  var template = null;
  if (typeof key === "string" && key && this._tipMessages && typeof this._tipMessages[key] === "string") {
    template = this._tipMessages[key];
  } else if (typeof fallbackText === "string") {
    template = fallbackText;
  } else if (typeof key === "string") {
    template = key;
  }

  return formatTemplate(template || "", params);
};

TipsPresenter.prototype.showByKey = function (key, params, fallbackText) {
  return this._ensureMessages().catch(function () {
    return this._tipMessages;
  }.bind(this)).then(function () {
    var message = this.resolveMessage(key, params, fallbackText);
    return this.showText(message);
  }.bind(this));
};

TipsPresenter.prototype.showText = function (message) {
  var text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    return Promise.resolve(false);
  }

  return this._ensurePrefab().then(function (prefab) {
    if (!prefab || !this.rootNode || !cc.isValid(this.rootNode)) {
      return false;
    }

    var tipNode = cc.instantiate(prefab);
    if (!tipNode) {
      return false;
    }

    tipNode.parent = this.rootNode;
    tipNode.zIndex = this.zIndex;
    tipNode.opacity = 0;

    var labelNode = getTipLabel(tipNode);
    var label = labelNode ? labelNode.getComponent(cc.Label) : null;
    if (label) {
      label.string = text;
      label.overflow = cc.Label.Overflow.SHRINK;
      label.enableWrapText = true;
    }

    this._activeTipNodes = this._activeTipNodes.filter(function (node) {
      return !!(node && cc.isValid(node));
    });

    var lane = this._activeTipNodes.length;
    var targetY = lane * this.stackGap;
    var startY = targetY + this.startOffsetY;
    tipNode.setPosition(0, startY);
    this._activeTipNodes.push(tipNode);

    this._playTipAnimation(tipNode, targetY);
    return true;
  }.bind(this)).catch(function (error) {
    Logger.warn("TipsPresenter show failed", error && error.message ? error.message : error);
    return false;
  });
};

TipsPresenter.prototype._playTipAnimation = function (tipNode, targetY) {
  if (!tipNode || !cc.isValid(tipNode)) {
    return;
  }

  var cleanup = function () {
    this._activeTipNodes = this._activeTipNodes.filter(function (node) {
      return node !== tipNode && !!(node && cc.isValid(node));
    });
    if (cc.isValid(tipNode)) {
      tipNode.stopAllActions();
      tipNode.destroy();
    }
  }.bind(this);

  if (typeof cc.tween === "function") {
    cc.tween(tipNode)
      .to(this.appearDuration, {
        y: targetY,
        opacity: 255
      }, {
        easing: "quartOut"
      })
      .delay(this.stayDuration)
      .to(this.hideDuration, {
        opacity: 0
      }, {
        easing: "quadIn"
      })
      .call(cleanup)
      .start();
    return;
  }

  var moveIn = cc.moveTo(this.appearDuration, 0, targetY);
  var fadeIn = cc.fadeTo(this.appearDuration, 255);
  var stay = cc.delayTime(this.stayDuration);
  var fadeOut = cc.fadeTo(this.hideDuration, 0);
  var finish = cc.callFunc(cleanup);
  tipNode.runAction(cc.sequence(cc.spawn(moveIn, fadeIn), stay, fadeOut, finish));
};

TipsPresenter.prototype._ensurePrefab = function () {
  if (this._tipsPrefab) {
    return Promise.resolve(this._tipsPrefab);
  }

  if (this._tipsPrefabPromise) {
    return this._tipsPrefabPromise;
  }

  if (!this.resourceGateway || typeof this.resourceGateway.loadPrefab !== "function") {
    return Promise.reject(new Error("TipsPresenter requires ResourceGateway.loadPrefab"));
  }

  this._tipsPrefabPromise = this.resourceGateway.loadPrefab(this.tipsPrefabPath).then(function (prefab) {
    this._tipsPrefab = prefab || null;
    this._tipsPrefabPromise = null;
    return this._tipsPrefab;
  }.bind(this)).catch(function (error) {
    this._tipsPrefabPromise = null;
    throw error;
  }.bind(this));

  return this._tipsPrefabPromise;
};

TipsPresenter.prototype._ensureMessages = function () {
  if (this._tipMessages && Object.keys(this._tipMessages).length > 0) {
    return Promise.resolve(this._tipMessages);
  }

  if (this._tipMessagesPromise) {
    return this._tipMessagesPromise;
  }

  if (!this.resourceGateway || typeof this.resourceGateway.loadJson !== "function") {
    return Promise.reject(new Error("TipsPresenter requires ResourceGateway.loadJson"));
  }

  this._tipMessagesPromise = this.resourceGateway.loadJson(this.tipsConfigPath).then(function (json) {
    var messages = json && typeof json === "object" && json.messages && typeof json.messages === "object"
      ? json.messages
      : {};
    this._tipMessages = messages;
    this._tipMessagesPromise = null;
    return this._tipMessages;
  }.bind(this)).catch(function (error) {
    this._tipMessagesPromise = null;
    Logger.warn("TipsPresenter message config load failed", error && error.message ? error.message : error);
    this._tipMessages = {};
    return this._tipMessages;
  }.bind(this));

  return this._tipMessagesPromise;
};

module.exports = TipsPresenter;
