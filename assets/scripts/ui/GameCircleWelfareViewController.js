"use strict";

var BundleLoader = require("../utils/BundleLoader");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var REWARD_ICON_PATHS = {
  coin: "image/props/coin",
  stamina: "image/props/treasure_chest",
  swap_ball: "image/props/change_ball",
  rainbow_ball: "image/props/rainbow_ball",
  blast_ball: "image/props/blast_ball",
  barrier_hammer: "image/props/barrier_hammer"
};
var GAME_CIRCLE_RENDER_PROXY_ROOT_NAME = "game_circle_render_proxy_root";
var GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES = {
  panel: "game_circle_proxy_panel_layer",
  button: "game_circle_proxy_button_layer",
  itemBackground: "game_circle_proxy_item_background_layer",
  itemIcon: "game_circle_proxy_item_icon_layer",
  progress: "game_circle_proxy_progress_layer",
  reward: "game_circle_proxy_reward_layer",
  action: "game_circle_proxy_action_layer"
};

function bindTapWithDynamicHandler(node, handlerProperty) {
  if (!node || !node.isValid) {
    throw new Error("Cannot bind tap on invalid game circle welfare node.");
  }
  if (node.__gameCircleTapBound === true) {
    return;
  }
  node.__gameCircleTapBound = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    var handler = node[handlerProperty];
    if (typeof handler === "function") {
      handler();
    }
  });
}

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid || !name) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }
  var queue = rootNode.children ? rootNode.children.slice() : [];
  while (queue.length > 0) {
    var node = queue.shift();
    if (!node || !node.isValid) {
      continue;
    }
    if (node.name === name) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      Array.prototype.push.apply(queue, node.children);
    }
  }
  return null;
}

function removeRuntimeButtonLabel(buttonNode) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Button node is required for game circle welfare runtime label cleanup.");
  }
  var labelNode = buttonNode.getChildByName("runtime_label");
  if (labelNode) {
    labelNode.destroy();
  }
}

function ensureOriginalButtonVisual(buttonNode) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Button node is required for game circle welfare visual state.");
  }
  if (!buttonNode.color) {
    throw new Error("Button node color is required for game circle welfare visual state.");
  }
  if (!buttonNode.__gameCircleOriginalVisual) {
    buttonNode.__gameCircleOriginalVisual = {
      opacity: buttonNode.opacity,
      color: cc.color(buttonNode.color.r, buttonNode.color.g, buttonNode.color.b)
    };
  }
  return buttonNode.__gameCircleOriginalVisual;
}

function applyTaskButtonCompletedVisual(buttonNode, completed) {
  var originalVisual = ensureOriginalButtonVisual(buttonNode);
  if (completed) {
    buttonNode.opacity = Math.min(originalVisual.opacity, 170);
    buttonNode.color = cc.color(150, 150, 150);
  } else {
    buttonNode.opacity = originalVisual.opacity;
    buttonNode.color = cc.color(
      originalVisual.color.r,
      originalVisual.color.g,
      originalVisual.color.b
    );
  }
}

function setNodeVisible(node, visible) {
  if (!node || !node.isValid) {
    throw new Error("Cannot set visibility on invalid game circle welfare node.");
  }
  node.active = visible === true;
}

function applyReceiveButtonVisual(buttonNode, claimed) {
  var originalVisual = ensureOriginalButtonVisual(buttonNode);
  if (claimed) {
    buttonNode.opacity = Math.min(originalVisual.opacity, 170);
    buttonNode.color = cc.color(150, 150, 150);
    return;
  }
  buttonNode.opacity = originalVisual.opacity;
  buttonNode.color = cc.color(
    originalVisual.color.r,
    originalVisual.color.g,
    originalVisual.color.b
  );
}

function ensureButtonComponent(buttonNode, nodeName) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Invalid game circle welfare button node: " + nodeName);
  }
  var button = buttonNode.getComponent(cc.Button);
  if (!button) {
    throw new Error("GamingCircleView " + nodeName + " is missing cc.Button.");
  }
  return button;
}

function pushMissingTaskItemPart(missingParts, partName, value) {
  if (!value) {
    missingParts.push(partName);
  }
}

function GameCircleWelfareViewController(options) {
  options = options || {};
  if (!options.node || !options.node.isValid) {
    throw new Error("GameCircleWelfareViewController requires node.");
  }
  if (typeof options.onClose !== "function") {
    throw new Error("GameCircleWelfareViewController requires onClose.");
  }
  if (typeof options.onRefresh !== "function") {
    throw new Error("GameCircleWelfareViewController requires onRefresh.");
  }
  if (typeof options.onClaim !== "function") {
    throw new Error("GameCircleWelfareViewController requires onClaim.");
  }
  if (typeof options.onOpenGameCircle !== "function") {
    throw new Error("GameCircleWelfareViewController requires onOpenGameCircle.");
  }
  if (typeof options.onSyncNativeButtons !== "function") {
    throw new Error("GameCircleWelfareViewController requires onSyncNativeButtons.");
  }
  this.node = options.node;
  this.onClose = options.onClose;
  this.onRefresh = options.onRefresh;
  this.onClaim = options.onClaim;
  this.onOpenGameCircle = options.onOpenGameCircle;
  this.onSyncNativeButtons = options.onSyncNativeButtons;
  this._iconSpriteFrameCache = {};
  this._renderProxyRoot = null;
  this._renderProxyLayers = {};
  this._renderProxyRecords = [];
  this.nodes = this._resolveNodes();
  this._bindActions();
}

GameCircleWelfareViewController.prototype._resolveNodes = function () {
  var panelNode = findNodeByNameRecursive(this.node, "Panel");
  var maskNode = findNodeByNameRecursive(this.node, "mask");
  var closeButtonNode = findNodeByNameRecursive(this.node, "btn_close");
  var circleButtonNode = findNodeByNameRecursive(this.node, "sure_btn");
  var taskListNode = findNodeByNameRecursive(this.node, "task_list");
  if (!panelNode || !maskNode || !closeButtonNode || !circleButtonNode || !taskListNode) {
    throw new Error("GamingCircleView prefab structure is incomplete.");
  }

  var taskItemNodes = [
    taskListNode.getChildByName("task_item1"),
    taskListNode.getChildByName("task_item2"),
    taskListNode.getChildByName("task_item3")
  ];
  taskItemNodes.forEach(function (taskItemNode, index) {
    if (!taskItemNode || !taskItemNode.isValid) {
      throw new Error("GamingCircleView missing task_item" + (index + 1) + ".");
    }
  });

  return {
    panelNode: panelNode,
    maskNode: maskNode,
    closeButtonNode: closeButtonNode,
    circleButtonNode: circleButtonNode,
    taskItemNodes: taskItemNodes
  };
};

GameCircleWelfareViewController.prototype._bindActions = function () {
  bindTapWithDynamicHandler(this.nodes.closeButtonNode, "__gameCircleCloseHandler");
  bindTapWithDynamicHandler(this.nodes.maskNode, "__gameCircleCloseHandler");
  bindTapWithDynamicHandler(this.nodes.circleButtonNode, "__gameCircleOpenHandler");
  this.nodes.closeButtonNode.__gameCircleCloseHandler = this.onClose;
  this.nodes.maskNode.__gameCircleCloseHandler = this.onClose;
  this.nodes.circleButtonNode.__gameCircleOpenHandler = this.onOpenGameCircle;
  removeRuntimeButtonLabel(this.nodes.circleButtonNode);
  this._bindProxySyncToNode(this.nodes.circleButtonNode);
};

GameCircleWelfareViewController.prototype._bindProxySyncToNode = function (node) {
  if (!node || !node.isValid) {
    throw new Error("Game circle welfare proxy sync node is invalid.");
  }
  if (node.__gameCircleProxySyncBound === true) {
    return;
  }
  node.__gameCircleProxySyncBound = true;
  node.on(cc.Node.EventType.TOUCH_END, function () {
    this._syncRenderProxies();
  }, this);
};

GameCircleWelfareViewController.prototype._ensureRenderProxyLayers = function () {
  if (this._renderProxyRoot && this._renderProxyRoot.isValid) {
    return;
  }
  var root = SpriteProxyLayerHelper.createProxyRoot(this.nodes.panelNode, {
    name: GAME_CIRCLE_RENDER_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._renderProxyRoot = root;
  this._renderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "panel", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.panel, zIndex: 0 },
    { key: "button", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.button, zIndex: 1 },
    { key: "itemBackground", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.itemBackground, zIndex: 2 },
    { key: "itemIcon", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.itemIcon, zIndex: 3 },
    { key: "progress", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.progress, zIndex: 4 },
    { key: "reward", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.reward, zIndex: 5 },
    { key: "action", name: GAME_CIRCLE_RENDER_PROXY_LAYER_NAMES.action, zIndex: 6 }
  ]);
};

GameCircleWelfareViewController.prototype._clearRenderProxyRecords = function () {
  SpriteProxyLayerHelper.clearRecords(this._renderProxyRecords);
};

GameCircleWelfareViewController.prototype._createSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._renderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("Game circle welfare render proxy layer is invalid: " + layerKey);
  }
  this._renderProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._renderProxyRoot,
    name: name,
    visible: visible === true
  }));
};

GameCircleWelfareViewController.prototype._hideSourceSprites = function () {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this.nodes.panelNode, false, "GamingCircleView Panel background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this.nodes.closeButtonNode, false, "GamingCircleView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this.nodes.circleButtonNode, false, "GamingCircleView sure_btn");
  this.nodes.taskItemNodes.forEach(function (taskItemNode) {
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode, false, "GamingCircleView task item background");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode.getChildByName("icon"), false, "GamingCircleView task icon");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode.getChildByName("1"), false, "GamingCircleView task ordinal");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode.getChildByName("award_icon"), false, "GamingCircleView award_icon");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode.getChildByName("go_btn"), false, "GamingCircleView go_btn");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode.getChildByName("receive_btn"), false, "GamingCircleView receive_btn");
    var progressBarNode = taskItemNode.getChildByName("progressBar");
    SpriteProxyLayerHelper.setSpriteRenderEnabled(progressBarNode, false, "GamingCircleView progressBar");
  });
};

GameCircleWelfareViewController.prototype._rebuildRenderProxies = function () {
  this._ensureRenderProxyLayers();
  this._clearRenderProxyRecords();
  this._hideSourceSprites();
  this._createSpriteProxyRecord("panel", this.nodes.panelNode, "game_circle_panel_bg_proxy", true);
  this._createSpriteProxyRecord("button", this.nodes.closeButtonNode, "game_circle_close_button_proxy", true);
  this._createSpriteProxyRecord("button", this.nodes.circleButtonNode, "game_circle_sure_button_proxy", true);
  this.nodes.taskItemNodes.forEach(function (taskItemNode, index) {
    var progressBarNode = taskItemNode.getChildByName("progressBar");
    this._createSpriteProxyRecord("itemBackground", taskItemNode, "game_circle_item_bg_proxy_" + index, true);
    this._createSpriteProxyRecord("itemIcon", taskItemNode.getChildByName("icon"), "game_circle_item_icon_proxy_" + index, true);
    this._createSpriteProxyRecord("itemIcon", taskItemNode.getChildByName("1"), "game_circle_item_ordinal_proxy_" + index, true);
    this._createSpriteProxyRecord("progress", progressBarNode, "game_circle_progress_bg_proxy_" + index, true);
    this._createSpriteProxyRecord("reward", taskItemNode.getChildByName("award_icon"), "game_circle_award_icon_proxy_" + index, true);
    this._createSpriteProxyRecord("action", taskItemNode.getChildByName("go_btn"), "game_circle_go_button_proxy_" + index, taskItemNode.getChildByName("go_btn").active === true);
    this._createSpriteProxyRecord("action", taskItemNode.getChildByName("receive_btn"), "game_circle_receive_button_proxy_" + index, taskItemNode.getChildByName("receive_btn").active === true);
  }, this);
};

GameCircleWelfareViewController.prototype._syncRenderProxies = function () {
  if (!this._renderProxyRoot || !this._renderProxyRoot.isValid) {
    return;
  }
  SpriteProxyLayerHelper.syncRecords(this._renderProxyRecords, this._renderProxyRoot);
};

GameCircleWelfareViewController.prototype._loadRewardIcon = function (itemId) {
  if (!Object.prototype.hasOwnProperty.call(REWARD_ICON_PATHS, itemId)) {
    return Promise.reject(new Error("Unsupported game circle welfare reward icon: " + itemId));
  }
  if (this._iconSpriteFrameCache[itemId]) {
    return Promise.resolve(this._iconSpriteFrameCache[itemId]);
  }
  var path = REWARD_ICON_PATHS[itemId];
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load game circle welfare reward icon failed: " + path + ", " + error.message));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("Game circle welfare reward icon is empty: " + path));
        return;
      }
      this._iconSpriteFrameCache[itemId] = spriteFrame;
      resolve(spriteFrame);
    }.bind(this));
  }.bind(this));
};

GameCircleWelfareViewController.prototype._resolveTaskNodes = function (taskItemNode) {
  if (!taskItemNode || !taskItemNode.isValid) {
    throw new Error("GamingCircleView task item node is invalid.");
  }
  var taskItemName = taskItemNode.name;
  var goButtonNode = taskItemNode.getChildByName("go_btn");
  var receiveButtonNode = taskItemNode.getChildByName("receive_btn");
  var taskNameNode = taskItemNode.getChildByName("task_name");
  var describeNode = taskItemNode.getChildByName("describe");
  var progressValueNode = taskItemNode.getChildByName("progress_value");
  var progressBarNode = taskItemNode.getChildByName("progressBar");
  var numNode = taskItemNode.getChildByName("num");
  var awardIconNode = taskItemNode.getChildByName("award_icon");
  var receiveTextNode = receiveButtonNode ? receiveButtonNode.getChildByName("receive") : null;
  var taskNameLabel = taskNameNode ? taskNameNode.getComponent(cc.Label) : null;
  var describeLabel = describeNode ? describeNode.getComponent(cc.Label) : null;
  var progressValueLabel = progressValueNode ? progressValueNode.getComponent(cc.Label) : null;
  var progressBar = progressBarNode ? progressBarNode.getComponent(cc.ProgressBar) : null;
  var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
  var awardIconSprite = awardIconNode ? awardIconNode.getComponent(cc.Sprite) : null;
  var receiveTextLabel = receiveTextNode ? receiveTextNode.getComponent(cc.Label) : null;
  var missingParts = [];
  console.log("receiveButtonNode:" + receiveButtonNode);
  pushMissingTaskItemPart(missingParts, taskItemName + ".go_btn node", goButtonNode);
  pushMissingTaskItemPart(missingParts, taskItemName + ".receive_btn node", receiveButtonNode);
  pushMissingTaskItemPart(missingParts, taskItemName + ".task_name cc.Label", taskNameLabel);
  pushMissingTaskItemPart(missingParts, taskItemName + ".describe cc.Label", describeLabel);
  pushMissingTaskItemPart(missingParts, taskItemName + ".progress_value cc.Label", progressValueLabel);
  pushMissingTaskItemPart(missingParts, taskItemName + ".progressBar cc.ProgressBar", progressBar);
  pushMissingTaskItemPart(missingParts, taskItemName + ".num cc.Label", numLabel);
  pushMissingTaskItemPart(missingParts, taskItemName + ".award_icon cc.Sprite", awardIconSprite);
  pushMissingTaskItemPart(missingParts, taskItemName + ".receive_btn.receive cc.Label", receiveTextLabel);
  if (missingParts.length > 0) {
    throw new Error("GamingCircleView task item structure is incomplete: " + missingParts.join(", "));
  }
  return {
    goButtonNode: goButtonNode,
    receiveButtonNode: receiveButtonNode,
    taskNameLabel: taskNameLabel,
    describeLabel: describeLabel,
    progressValueLabel: progressValueLabel,
    progressBar: progressBar,
    numLabel: numLabel,
    awardIconSprite: awardIconSprite,
    receiveTextLabel: receiveTextLabel
  };
};

GameCircleWelfareViewController.prototype._resolveAction = function (task) {
  if (task.claimed) {
    return "claimed";
  }
  if (task.claimable) {
    return "claim";
  }
  return "open";
};

GameCircleWelfareViewController.prototype._renderTask = function (taskItemNode, task) {
  var nodes = this._resolveTaskNodes(taskItemNode);
  nodes.taskNameLabel.string = task.title;
  nodes.describeLabel.string = task.description;
  nodes.progressValueLabel.string = task.progress + "/" + task.target;
  nodes.progressBar.progress = Math.max(0, Math.min(1, task.progress / task.target));

  var rewardItem = task.rewardItems[0];
  if (!rewardItem || !rewardItem.id) {
    throw new Error("Game circle welfare task reward item is missing: " + task.taskId);
  }
  nodes.numLabel.string = "x" + rewardItem.count;

  var action = this._resolveAction(task);
  removeRuntimeButtonLabel(nodes.goButtonNode);
  removeRuntimeButtonLabel(nodes.receiveButtonNode);
  var goButton = ensureButtonComponent(nodes.goButtonNode, "go_btn");
  var receiveButton = ensureButtonComponent(nodes.receiveButtonNode, "receive_btn");

  setNodeVisible(nodes.goButtonNode, action === "open");
  setNodeVisible(nodes.receiveButtonNode, action === "claim" || action === "claimed");
  applyTaskButtonCompletedVisual(nodes.goButtonNode, false);
  applyReceiveButtonVisual(nodes.receiveButtonNode, action === "claimed");
  goButton.interactable = action === "open";
  receiveButton.interactable = action === "claim";
  nodes.receiveTextLabel.string = action === "claimed" ? "已领" : "领取";

  if (action === "open") {
    nodes.goButtonNode.__gameCircleTaskHandler = this.onOpenGameCircle;
  } else {
    nodes.goButtonNode.__gameCircleTaskHandler = null;
  }
  nodes.receiveButtonNode.__gameCircleClaimHandler = action === "claim"
    ? function () {
      this.onClaim(task.taskId);
    }.bind(this)
    : null;
  bindTapWithDynamicHandler(nodes.goButtonNode, "__gameCircleTaskHandler");
  bindTapWithDynamicHandler(nodes.receiveButtonNode, "__gameCircleClaimHandler");
  this._bindProxySyncToNode(nodes.goButtonNode);
  this._bindProxySyncToNode(nodes.receiveButtonNode);

  return this._loadRewardIcon(rewardItem.id).then(function (spriteFrame) {
    if (!nodes.awardIconSprite || !nodes.awardIconSprite.node || !nodes.awardIconSprite.node.isValid) {
      throw new Error("GamingCircleView award icon node is invalid while rendering.");
    }
    nodes.awardIconSprite.spriteFrame = spriteFrame;
    return {
      taskId: task.taskId,
      action: action,
      goButtonNode: action === "open" ? nodes.goButtonNode : null
    };
  });
};

GameCircleWelfareViewController.prototype.render = function (summary) {
  if (!summary || !Array.isArray(summary.tasks) || summary.tasks.length !== 3) {
    return Promise.reject(new Error("Game circle welfare summary must contain exactly 3 tasks."));
  }
  var renderTasks = summary.tasks.map(function (task, index) {
    return this._renderTask(this.nodes.taskItemNodes[index], task);
  }, this);
  return Promise.all(renderTasks).then(function (buttonStates) {
    this._rebuildRenderProxies();
    this.onSyncNativeButtons({
      circleButtonNode: this.nodes.circleButtonNode,
      taskButtons: buttonStates
    });
    return buttonStates;
  }.bind(this));
};

GameCircleWelfareViewController.prototype.hideNativeButtons = function () {
  this.onSyncNativeButtons({
    circleButtonNode: null,
    taskButtons: []
  });
};

module.exports = GameCircleWelfareViewController;
