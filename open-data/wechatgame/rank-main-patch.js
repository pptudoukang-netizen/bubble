"use strict";

var RANK_STATE_KEY = "bubble_wechat_rank_state_v1";
var MAX_PASS_LEVEL_KEY = "max_pass_level";
var TOTAL_SCORE_KEY = "total_score";
var DESIGN_WIDTH = 720;
var DESIGN_HEIGHT = 1280;
var RANK_MESSAGE_SOURCE = "bubble_friend_rank";
var RANK_MASK_COLOR = cc.color(21, 15, 48, 180);
var RANK_INSTALL_SCHEDULER_KEY = "wechat_rank_install";

function assertWxApi(name) {
  if (typeof wx === "undefined" || !wx || typeof wx[name] !== "function") {
    throw new Error("WeChat rank requires wx." + name + ".");
  }
  return wx[name].bind(wx);
}

function assertStorage() {
  if (!cc || !cc.sys || !cc.sys.localStorage) {
    throw new Error("WeChat rank requires cc.sys.localStorage.");
  }
  return cc.sys.localStorage;
}

function createInitialRankState() {
  return {
    version: 1,
    maxPassedLevel: 0,
    totalScore: 0,
    submittedAttempts: {}
  };
}

function toPositiveInteger(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error("Invalid numeric rank field: " + fieldName + ".");
  }
  var integerValue = Math.floor(numberValue);
  if (integerValue < 0) {
    throw new Error("Rank field must be non-negative: " + fieldName + ".");
  }
  return integerValue;
}

function normalizeRankState(rawState) {
  if (rawState === null) {
    return createInitialRankState();
  }
  if (!rawState || typeof rawState !== "object") {
    throw new Error("Invalid rank state.");
  }
  if (!rawState.submittedAttempts || typeof rawState.submittedAttempts !== "object") {
    throw new Error("Invalid rank submittedAttempts state.");
  }
  return {
    version: 1,
    maxPassedLevel: toPositiveInteger(rawState.maxPassedLevel, "maxPassedLevel"),
    totalScore: toPositiveInteger(rawState.totalScore, "totalScore"),
    submittedAttempts: rawState.submittedAttempts
  };
}

function loadRankState() {
  var storage = assertStorage();
  var rawText = storage.getItem(RANK_STATE_KEY);
  if (rawText === null) {
    return createInitialRankState();
  }
  return normalizeRankState(JSON.parse(rawText));
}

function saveRankState(state) {
  assertStorage().setItem(RANK_STATE_KEY, JSON.stringify(normalizeRankState(state)));
}

function submitCloudStorage(kvDataList) {
  assertWxApi("setUserCloudStorage")({
    KVDataList: kvDataList,
    fail: function (error) {
      throw new Error("wx.setUserCloudStorage failed: " + JSON.stringify(error));
    }
  });
}

function buildMaxPassValue(levelId, totalScoreSnapshot) {
  return JSON.stringify({
    maxPassedLevel: levelId,
    totalScoreSnapshot: totalScoreSnapshot,
    updatedAt: Date.now()
  });
}

function buildTotalScoreValue(totalScore, passedLevel) {
  return JSON.stringify({
    score: totalScore,
    passedLevel: passedLevel,
    updatedAt: Date.now()
  });
}

function resolveSnapshotScore(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Rank upload requires runtime snapshot.");
  }
  if (snapshot.winStats && typeof snapshot.winStats.totalScore !== "undefined") {
    return toPositiveInteger(snapshot.winStats.totalScore, "snapshot.winStats.totalScore");
  }
  if (typeof snapshot.score !== "undefined") {
    return toPositiveInteger(snapshot.score, "snapshot.score");
  }
  throw new Error("Rank upload requires snapshot score.");
}

function resolveAttemptKey(host, levelId) {
  if (host && typeof host._currentAttemptId === "string" && host._currentAttemptId) {
    return host._currentAttemptId;
  }
  throw new Error("Rank upload requires current attempt id.");
}

function submitLevelWin(host, snapshot) {
  if (!host || typeof host !== "object") {
    throw new Error("Rank upload requires GameBootstrap host.");
  }
  var levelId = toPositiveInteger(host._currentLevelId, "host._currentLevelId");
  if (levelId <= 0) {
    throw new Error("Rank upload requires positive current level id.");
  }
  var score = resolveSnapshotScore(snapshot);
  var attemptKey = resolveAttemptKey(host, levelId);
  var state = loadRankState();
  if (state.submittedAttempts[attemptKey] === true) {
    return;
  }

  state.submittedAttempts[attemptKey] = true;
  state.totalScore += score;
  if (levelId > state.maxPassedLevel) {
    state.maxPassedLevel = levelId;
  }
  saveRankState(state);

  submitCloudStorage([
    {
      key: MAX_PASS_LEVEL_KEY,
      value: buildMaxPassValue(state.maxPassedLevel, state.totalScore)
    },
    {
      key: TOTAL_SCORE_KEY,
      value: buildTotalScoreValue(state.totalScore, state.maxPassedLevel)
    }
  ]);
}

function walkNodes(node, visitor) {
  if (node && node.isValid) {
    visitor(node);
    var children = node.children;
    for (var index = 0; index < children.length; index += 1) {
      walkNodes(children[index], visitor);
    }
  }
}

function findNodeByName(root, name) {
  var result = null;
  walkNodes(root, function (node) {
    if (result === null && node.name === name) {
      result = node;
    }
  });
  return result;
}

function findCanvasNode() {
  var scene = cc.director.getScene();
  var canvasNode = null;
  walkNodes(scene, function (node) {
    if (canvasNode === null && node.getComponent && node.getComponent(cc.Canvas)) {
      canvasNode = node;
    }
  });
  return canvasNode;
}

function findBootstrapHost() {
  var scene = cc.director.getScene();
  var host = null;
  walkNodes(scene, function (node) {
    if (host === null) {
      var components = node._components;
      for (var index = 0; index < components.length; index += 1) {
        var component = components[index];
        if (
          component &&
          typeof component._recordCurrentLevelWin === "function" &&
          typeof component._showRankingView === "function"
        ) {
          host = component;
          index = components.length;
        }
      }
    }
  });
  return host;
}

function resolveRankParent() {
  return findCanvasNode() || cc.director.getScene();
}

function applyFullScreenMask(layer, width, height) {
  var graphics = layer.getComponent(cc.Graphics);
  if (!graphics) {
    graphics = layer.addComponent(cc.Graphics);
  }
  graphics.clear();
  graphics.fillColor = RANK_MASK_COLOR;
  graphics.rect(-width * 0.5, -height * 0.5, width, height);
  graphics.fill();
}

function resolveRankLayerScale(parentNode) {
  if (!parentNode || !parentNode.isValid) {
    throw new Error("Rank layer parent is invalid.");
  }
  var width = Number(parentNode.width);
  var height = Number(parentNode.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    var visibleSize = cc.view.getVisibleSize();
    width = Number(visibleSize && visibleSize.width);
    height = Number(visibleSize && visibleSize.height);
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Rank layer requires a valid parent size.");
  }
  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
}

function hideLocalRankingView() {
  var scene = cc.director.getScene();
  var localRankingView = findNodeByName(scene, "RankingView");
  if (localRankingView !== null) {
    localRankingView.active = false;
  }
}

function createTouchableNode(name, parent, x, y, width, height, onTap) {
  var node = new cc.Node(name);
  node.parent = parent;
  node.setContentSize(width, height);
  node.setPosition(x, y);
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    onTap();
  });
  return node;
}

function createRankPanel(parent, scale) {
  var panel = new cc.Node("WechatFriendRankPanel");
  panel.parent = parent;
  panel.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
  panel.setPosition(0, 0);
  panel.setScale(scale);
  return panel;
}

function ensureRankLayer() {
  var rankParent = resolveRankParent();
  var existing = findNodeByName(rankParent, "WechatFriendRankLayer");
  if (existing !== null) {
    existing.setContentSize(rankParent.width, rankParent.height);
    existing.setPosition(0, 0);
    applyFullScreenMask(existing, rankParent.width, rankParent.height);
    var existingPanel = findNodeByName(existing, "WechatFriendRankPanel");
    if (existingPanel !== null) {
      existingPanel.setScale(resolveRankLayerScale(rankParent));
      existingPanel.setPosition(0, 0);
    }
    return existing;
  }

  var sharedCanvas = assertWxApi("getOpenDataContext")().canvas;
  if (!sharedCanvas) {
    throw new Error("WeChat rank requires openDataContext.canvas.");
  }
  sharedCanvas.width = DESIGN_WIDTH;
  sharedCanvas.height = DESIGN_HEIGHT;

  var layer = new cc.Node("WechatFriendRankLayer");
  layer.parent = rankParent;
  layer.zIndex = 900;
  layer.setContentSize(rankParent.width, rankParent.height);
  layer.setPosition(0, 0);
  applyFullScreenMask(layer, rankParent.width, rankParent.height);
  layer.addComponent(cc.BlockInputEvents);

  var panel = createRankPanel(layer, resolveRankLayerScale(rankParent));

  var texture = new cc.Texture2D();
  texture.initWithElement(sharedCanvas);
  texture.handleLoadedTexture();
  var spriteFrame = new cc.SpriteFrame(texture);
  var spriteNode = new cc.Node("WechatFriendRankSharedCanvas");
  spriteNode.parent = panel;
  spriteNode.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
  var sprite = spriteNode.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

  layer.__rankTexture = texture;
  layer.__rankSprite = sprite;
  createTouchableNode("WechatFriendRankProgressTab", panel, -105, 326, 190, 70, function () {
    showRankLayer("progress");
  });
  createTouchableNode("WechatFriendRankTotalTab", panel, 105, 326, 190, 70, function () {
    showRankLayer("total");
  });
  createTouchableNode("WechatFriendRankClose", panel, 282, 438, 96, 96, hideRankLayer);
  layer.on(cc.Node.EventType.TOUCH_MOVE, function (event) {
    var delta = event.getDelta();
    var scrollDelta = -delta.y;
    if (scrollDelta !== 0) {
      assertWxApi("getOpenDataContext")().postMessage({
        source: RANK_MESSAGE_SOURCE,
        type: "scroll_rank",
        deltaY: scrollDelta
      });
      layer.runAction(cc.sequence(
        cc.delayTime(0.03),
        cc.callFunc(function () {
          refreshSharedCanvasTexture(layer);
        })
      ));
    }
  });
  layer.active = false;
  return layer;
}

function refreshSharedCanvasTexture(layer) {
  if (!layer || !layer.isValid) {
    throw new Error("Rank layer is invalid during shared canvas refresh.");
  }
  layer.__rankTexture.handleLoadedTexture();
}

function showRankLayer(rankType) {
  var messageType = rankType === "total" ? "show_total_rank" : "show_progress_rank";
  var layer = ensureRankLayer();
  layer.active = true;
  assertWxApi("getOpenDataContext")().postMessage({
    source: RANK_MESSAGE_SOURCE,
    type: messageType
  });
  hideLocalRankingView();
  layer.stopAllActions();
  layer.runAction(cc.repeat(cc.sequence(
    cc.delayTime(0.12),
    cc.callFunc(function () {
      refreshSharedCanvasTexture(layer);
      hideLocalRankingView();
    })
  ), 12));
}

function hideRankLayer() {
  var scene = cc.director.getScene();
  var layer = findNodeByName(scene, "WechatFriendRankLayer");
  if (layer !== null) {
    layer.active = false;
  }
  assertWxApi("getOpenDataContext")().postMessage({
    source: RANK_MESSAGE_SOURCE,
    type: "hide_rank"
  });
  hideLocalRankingView();
}

function patchBootstrapHost(host) {
  if (!host) {
    throw new Error("GameBootstrap host is required for rank patch.");
  }
  if (host.__wechatRankPatched !== true) {
    var originalRecordWin = host._recordCurrentLevelWin;
    if (typeof originalRecordWin !== "function") {
      throw new Error("GameBootstrap._recordCurrentLevelWin is required for rank upload.");
    }
    host._recordCurrentLevelWin = function (snapshot) {
      var result = originalRecordWin.call(this, snapshot);
      submitLevelWin(this, snapshot);
      return result;
    };
    host.__wechatRankPatched = true;
  }
}

function bindRankingButton() {
  var scene = cc.director.getScene();
  if (!scene) {
    throw new Error("Scene is required when binding rank button.");
  }
  var rankButton = findNodeByName(scene, "ranking_btn");
  if (rankButton !== null && rankButton.__wechatRankTapBound !== true) {
    rankButton.__wechatRankTapBound = true;
    rankButton.on(cc.Node.EventType.TOUCH_END, function () {
      showRankLayer("progress");
    });
  }
}

function install() {
  assertWxApi("getOpenDataContext");
  assertWxApi("setUserCloudStorage");
  var host = findBootstrapHost();
  if (host !== null) {
    patchBootstrapHost(host);
  }
  var scheduler = cc.director.getScheduler();
  var schedulerTarget = {
    id: RANK_INSTALL_SCHEDULER_KEY
  };
  if (scheduler && typeof scheduler.enableForTarget === "function") {
    scheduler.enableForTarget(schedulerTarget);
  }
  scheduler.schedule(function () {
    var nextHost = findBootstrapHost();
    if (nextHost !== null) {
      patchBootstrapHost(nextHost);
    }
    bindRankingButton();
  }, schedulerTarget, 0.5, cc.macro.REPEAT_FOREVER, 0, false, RANK_INSTALL_SCHEDULER_KEY);
}

module.exports = {
  install: install
};
