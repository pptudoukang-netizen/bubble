"use strict";

var BundleLoader = require("../utils/BundleLoader");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");

var UI_BUNDLE_NAME = "ui";
var COIN_ICON_PATH = "ui/image/props/coin";
var GO_BUTTON_PATH = "image/dailytask/go_btn";
var CLAIM_BUTTON_PATH = "image/dailytask/get_btn";
var TASK_ITEM_GAP = 15;
var DAILY_TASK_STATIC_PROXY_ROOT_NAME = "daily_task_static_proxy_root";
var DAILY_TASK_LIST_PROXY_ROOT_NAME = "daily_task_list_proxy_root";
var DAILY_TASK_STATIC_PROXY_LAYER_NAMES = {
  panel: "daily_task_proxy_panel_layer",
  chrome: "daily_task_proxy_chrome_layer"
};
var DAILY_TASK_LIST_PROXY_LAYER_NAMES = {
  itemBackground: "daily_task_proxy_item_background_layer",
  itemIcon: "daily_task_proxy_item_icon_layer",
  progress: "daily_task_proxy_progress_layer",
  reward: "daily_task_proxy_reward_layer",
  button: "daily_task_proxy_button_layer"
};

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertFunction(value, message) {
  if (typeof value !== "function") {
    throw new Error(message);
  }
}

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children;
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function requireChild(rootNode, name) {
  var node = findNodeByNameRecursive(rootNode, name);
  if (!node || !node.isValid) {
    throw new Error("DailyTaskView prefab missing node: " + name);
  }
  return node;
}

function requireLabel(rootNode, name) {
  var node = requireChild(rootNode, name);
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error("DailyTaskView node requires cc.Label: " + name);
  }
  return label;
}

function requireSprite(rootNode, name) {
  var node = requireChild(rootNode, name);
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("DailyTaskView node requires cc.Sprite: " + name);
  }
  return sprite;
}

function requireProgressBar(rootNode, name) {
  var node = requireChild(rootNode, name);
  var progressBar = node.getComponent(cc.ProgressBar);
  if (!progressBar) {
    throw new Error("DailyTaskView node requires cc.ProgressBar: " + name);
  }
  return progressBar;
}

function setSpriteFrame(sprite, spriteFrame) {
  if (!sprite || !sprite.node || !sprite.node.isValid) {
    throw new Error("DailyTaskView sprite target is invalid.");
  }
  if (!spriteFrame) {
    throw new Error("DailyTaskView spriteFrame is required.");
  }
  sprite.spriteFrame = spriteFrame;
  if (cc.Sprite.SizeMode && cc.Sprite.SizeMode.CUSTOM !== undefined) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
}

function bindTapWithDynamicHandler(node, handlerProperty) {
  if (!node || !node.isValid) {
    throw new Error("Cannot bind tap on invalid DailyTaskView node.");
  }
  if (node.__dailyTaskTapBound === true) {
    return;
  }
  node.__dailyTaskTapBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 0.96;
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
    var handler = node[handlerProperty];
    if (typeof handler === "function") {
      handler();
    }
  });
}

function ensureTaskButtonComponent(buttonNode) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("DailyTaskView go_btn node is invalid.");
  }
  var button = buttonNode.getComponent(cc.Button);
  if (!button) {
    button = buttonNode.addComponent(cc.Button);
    button.transition = cc.Button.Transition.SCALE;
    button.duration = 0.1;
    button.zoomScale = 0.96;
  }
  return button;
}

function bindTaskButtonWithDynamicHandler(buttonNode, handlerProperty) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Cannot bind task button on invalid DailyTaskView node.");
  }
  ensureTaskButtonComponent(buttonNode);
  if (buttonNode.__dailyTaskButtonTapBound === true) {
    return;
  }
  buttonNode.__dailyTaskButtonTapBound = true;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    var handler = buttonNode[handlerProperty];
    if (typeof handler !== "function") {
      return;
    }
    var result = handler();
    if (result && typeof result.then === "function") {
      result.catch(function (error) {
        throw error;
      });
    }
  });
}

function loadResourceSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load DailyTaskView resource sprite failed `" + path + "`: " + error.message));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("DailyTaskView resource sprite is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function loadUiSpriteFrame(path) {
  return BundleLoader.ensureNamedBundleLoaded(UI_BUNDLE_NAME).then(function (bundle) {
    return new Promise(function (resolve, reject) {
      bundle.load(path, cc.SpriteFrame, function (error, spriteFrame) {
        if (error) {
          reject(new Error("Load DailyTaskView UI sprite failed `" + path + "`: " + error.message));
          return;
        }
        if (!spriteFrame) {
          reject(new Error("DailyTaskView UI sprite is empty: " + path));
          return;
        }
        resolve(spriteFrame);
      });
    });
  });
}

function getTaskAction(task) {
  if (task.claimed === true) {
    return "claimed";
  }
  if (task.claimable === true) {
    return "claim";
  }
  return "open";
}

function disableWidget(node, description) {
  var widget = node.getComponent(cc.Widget);
  if (widget) {
    widget.enabled = false;
  }
  if (!node || !node.isValid) {
    throw new Error(description + " is invalid.");
  }
}

function DailyTaskViewController(options) {
  assertObject(options, "DailyTaskViewController options are required.");
  if (!options.node || !options.node.isValid) {
    throw new Error("DailyTaskViewController requires a valid node.");
  }
  assertFunction(options.onClose, "DailyTaskViewController requires onClose.");
  assertFunction(options.onClaim, "DailyTaskViewController requires onClaim.");
  assertFunction(options.onGo, "DailyTaskViewController requires onGo.");

  this.node = options.node;
  this.onClose = options.onClose;
  this.onClaim = options.onClaim;
  this.onGo = options.onGo;
  this._itemNodes = [];
  this._spriteFrames = {};
  this._spriteFrameLoadPromise = null;
  this._staticProxyRoot = null;
  this._staticProxyLayers = {};
  this._staticProxyRecords = [];
  this._listProxyRoot = null;
  this._listProxyLayers = {};
  this._listProxyRecords = [];
  this._nodes = this._resolveNodes();
  this._bindActions();
}

DailyTaskViewController.prototype._resolveNodes = function () {
  if (!this.node.getComponent(cc.BlockInputEvents)) {
    this.node.addComponent(cc.BlockInputEvents);
  }
  var panelNode = requireChild(this.node, "Panel");
  var taskListNode = requireChild(panelNode, "task_list");
  var viewNode = requireChild(taskListNode, "view");
  var contentNode = requireChild(taskListNode, "content");
  var taskItemTemplate = requireChild(contentNode, "task_item");
  disableWidget(contentNode, "DailyTaskView content node");
  disableWidget(taskItemTemplate, "DailyTaskView task item template");
  taskItemTemplate.active = true;
  return {
    maskNode: requireChild(this.node, "mask"),
    panelNode: panelNode,
    closeButtonNode: requireChild(panelNode, "btn_close"),
    taskListNode: taskListNode,
    viewNode: viewNode,
    contentNode: contentNode,
    taskItemTemplate: taskItemTemplate
  };
};

DailyTaskViewController.prototype._bindActions = function () {
  bindTapWithDynamicHandler(this._nodes.maskNode, "__dailyTaskCloseHandler");
  bindTapWithDynamicHandler(this._nodes.closeButtonNode, "__dailyTaskCloseHandler");
  this._nodes.maskNode.__dailyTaskCloseHandler = this.onClose;
  this._nodes.closeButtonNode.__dailyTaskCloseHandler = this.onClose;
  this._bindProxySyncToNode(this._nodes.closeButtonNode);
};

DailyTaskViewController.prototype._bindProxySyncToNode = function (node) {
  if (!node || !node.isValid) {
    throw new Error("DailyTaskView proxy sync node is invalid.");
  }
  if (node.__dailyTaskProxySyncBound === true) {
    return;
  }
  node.__dailyTaskProxySyncBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_END, function () {
    this._syncRenderProxies();
  }, this);
};

DailyTaskViewController.prototype._ensureStaticProxyLayers = function () {
  if (this._staticProxyRoot && this._staticProxyRoot.isValid) {
    return;
  }
  var root = SpriteProxyLayerHelper.createProxyRoot(this._nodes.panelNode, {
    name: DAILY_TASK_STATIC_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._staticProxyRoot = root;
  this._staticProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "panel", name: DAILY_TASK_STATIC_PROXY_LAYER_NAMES.panel, zIndex: 0 },
    { key: "chrome", name: DAILY_TASK_STATIC_PROXY_LAYER_NAMES.chrome, zIndex: 1 }
  ]);
};

DailyTaskViewController.prototype._ensureListProxyLayers = function () {
  SpriteProxyLayerHelper.clearRecords(this._listProxyRecords);
  this._listProxyRoot = SpriteProxyLayerHelper.createProxyRoot(this._nodes.contentNode, {
    name: DAILY_TASK_LIST_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._listProxyLayers = SpriteProxyLayerHelper.createProxyLayers(this._listProxyRoot, [
    { key: "itemBackground", name: DAILY_TASK_LIST_PROXY_LAYER_NAMES.itemBackground, zIndex: 0 },
    { key: "itemIcon", name: DAILY_TASK_LIST_PROXY_LAYER_NAMES.itemIcon, zIndex: 1 },
    { key: "progress", name: DAILY_TASK_LIST_PROXY_LAYER_NAMES.progress, zIndex: 2 },
    { key: "reward", name: DAILY_TASK_LIST_PROXY_LAYER_NAMES.reward, zIndex: 3 },
    { key: "button", name: DAILY_TASK_LIST_PROXY_LAYER_NAMES.button, zIndex: 4 }
  ]);
};

DailyTaskViewController.prototype._createStaticProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._staticProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("DailyTaskView static proxy layer is invalid: " + layerKey);
  }
  this._staticProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._staticProxyRoot,
    name: name,
    visible: visible === true
  }));
};

DailyTaskViewController.prototype._createListProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._listProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("DailyTaskView list proxy layer is invalid: " + layerKey);
  }
  this._listProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._listProxyRoot,
    name: name,
    visible: visible === true
  }));
};

DailyTaskViewController.prototype._hideStaticSourceSprites = function () {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.panelNode, false, "DailyTaskView Panel background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.closeButtonNode, false, "DailyTaskView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(this._nodes.panelNode, "tips"), false, "DailyTaskView tips");
};

DailyTaskViewController.prototype._hideTaskSourceSprites = function (taskItemNode) {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(taskItemNode, false, "DailyTaskView task item background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(taskItemNode, "hammer_icon"), false, "DailyTaskView hammer_icon");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(taskItemNode, "progressBar"), false, "DailyTaskView progressBar");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(taskItemNode, "award"), false, "DailyTaskView award");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChild(taskItemNode, "go_btn"), false, "DailyTaskView go_btn");
};

DailyTaskViewController.prototype._rebuildStaticRenderProxies = function () {
  this._ensureStaticProxyLayers();
  SpriteProxyLayerHelper.clearRecords(this._staticProxyRecords);
  this._hideStaticSourceSprites();
  this._createStaticProxyRecord("panel", this._nodes.panelNode, "daily_task_panel_bg_proxy", true);
  this._createStaticProxyRecord("chrome", this._nodes.closeButtonNode, "daily_task_close_button_proxy", true);
  this._createStaticProxyRecord("chrome", requireChild(this._nodes.panelNode, "tips"), "daily_task_tips_proxy", true);
};

DailyTaskViewController.prototype._rebuildListRenderProxies = function () {
  this._ensureListProxyLayers();
  var nodes = [this._nodes.taskItemTemplate].concat(this._itemNodes);
  nodes.forEach(function (taskItemNode, index) {
    this._hideTaskSourceSprites(taskItemNode);
    var progressBarNode = requireChild(taskItemNode, "progressBar");
    this._createListProxyRecord("itemBackground", taskItemNode, "daily_task_item_bg_proxy_" + index, true);
    this._createListProxyRecord("itemIcon", requireChild(taskItemNode, "hammer_icon"), "daily_task_icon_proxy_" + index, true);
    this._createListProxyRecord("progress", progressBarNode, "daily_task_progress_bg_proxy_" + index, true);
    this._createListProxyRecord("reward", requireChild(taskItemNode, "award"), "daily_task_award_proxy_" + index, true);
    this._createListProxyRecord("button", requireChild(taskItemNode, "go_btn"), "daily_task_button_proxy_" + index, true);
  }, this);
};

DailyTaskViewController.prototype._syncRenderProxies = function () {
  if (this._staticProxyRoot && this._staticProxyRoot.isValid) {
    SpriteProxyLayerHelper.syncRecords(this._staticProxyRecords, this._staticProxyRoot);
  }
  if (this._listProxyRoot && this._listProxyRoot.isValid) {
    SpriteProxyLayerHelper.syncRecords(this._listProxyRecords, this._listProxyRoot);
  }
};

DailyTaskViewController.prototype._clearItemNodes = function () {
  while (this._itemNodes.length > 0) {
    var node = this._itemNodes.pop();
    if (node && node.isValid) {
      node.destroy();
    }
  }
  SpriteProxyLayerHelper.clearRecords(this._listProxyRecords);
};

DailyTaskViewController.prototype._ensureSpriteFrame = function (path, source) {
  if (this._spriteFrames[path]) {
    return Promise.resolve(this._spriteFrames[path]);
  }

  var loader = source === "ui" ? loadUiSpriteFrame : loadResourceSpriteFrame;
  return loader(path).then(function (spriteFrame) {
    this._spriteFrames[path] = spriteFrame;
    return spriteFrame;
  }.bind(this));
};

DailyTaskViewController.prototype._ensureSpriteFrames = function (tasks) {
  if (this._spriteFrameLoadPromise) {
    return this._spriteFrameLoadPromise;
  }
  var paths = {};
  paths[GO_BUTTON_PATH] = "ui";
  paths[CLAIM_BUTTON_PATH] = "ui";
  paths[COIN_ICON_PATH] = "resource";
  tasks.forEach(function (task) {
    paths[task.iconPath] = "ui";
  });

  var loadTasks = Object.keys(paths).filter(function (path) {
    return !this._spriteFrames[path];
  }, this).map(function (path) {
    return this._ensureSpriteFrame(path, paths[path]);
  }, this);

  this._spriteFrameLoadPromise = Promise.all(loadTasks).then(function () {
    this._spriteFrameLoadPromise = null;
    return this._spriteFrames;
  }.bind(this));

  return this._spriteFrameLoadPromise;
};

DailyTaskViewController.prototype._resolveTaskItemNodes = function (taskItemNode) {
  var buttonNode = requireChild(taskItemNode, "go_btn");
  return {
    iconSprite: requireSprite(taskItemNode, "hammer_icon"),
    progressBar: requireProgressBar(taskItemNode, "progressBar"),
    progressLabel: requireLabel(taskItemNode, "progress"),
    targetLabel: requireLabel(taskItemNode, "task_target"),
    descriptionLabel: requireLabel(taskItemNode, "des"),
    awardSprite: requireSprite(taskItemNode, "award"),
    rewardCountLabel: requireLabel(taskItemNode, "num"),
    buttonNode: buttonNode,
    buttonSprite: requireSprite(taskItemNode, "go_btn")
  };
};

DailyTaskViewController.prototype._layoutTaskItem = function (taskItemNode, index, totalCount) {
  var itemHeight = taskItemNode.height;
  var totalHeight = (itemHeight * totalCount) + (TASK_ITEM_GAP * (totalCount - 1));
  this._nodes.contentNode.height = Math.max(totalHeight, this._nodes.viewNode.height);
  this._nodes.contentNode.y = this._nodes.viewNode.height * 0.5;
  taskItemNode.y = -(itemHeight * 0.5) - (index * (itemHeight + TASK_ITEM_GAP));
  taskItemNode.x = 0;
};

DailyTaskViewController.prototype._renderTask = function (task, index, totalCount) {
  var taskItemNode = index === 0
    ? this._nodes.taskItemTemplate
    : cc.instantiate(this._nodes.taskItemTemplate);
  if (!taskItemNode || !taskItemNode.isValid) {
    throw new Error("Instantiate DailyTaskView task item failed.");
  }
  if (index > 0) {
    taskItemNode.parent = this._nodes.contentNode;
    this._itemNodes.push(taskItemNode);
  }
  taskItemNode.name = "task_item_" + task.taskId;
  taskItemNode.active = true;
  this._layoutTaskItem(taskItemNode, index, totalCount);

  var nodes = this._resolveTaskItemNodes(taskItemNode);
  nodes.targetLabel.string = task.title;
  nodes.descriptionLabel.string = task.description;
  nodes.progressLabel.string = task.progress + "/" + task.target;
  nodes.progressBar.progress = task.progress / task.target;

  var rewardItem = task.rewardItems[0];
  if (!rewardItem || rewardItem.id !== "coin") {
    throw new Error("DailyTaskView only supports coin reward: " + task.taskId);
  }
  nodes.rewardCountLabel.string = "x" + rewardItem.count;
  setSpriteFrame(nodes.iconSprite, this._spriteFrames[task.iconPath]);
  setSpriteFrame(nodes.awardSprite, this._spriteFrames[COIN_ICON_PATH]);

  var action = getTaskAction(task);
  var taskButton = ensureTaskButtonComponent(nodes.buttonNode);
  var buttonFrame = action === "open" ? this._spriteFrames[GO_BUTTON_PATH] : this._spriteFrames[CLAIM_BUTTON_PATH];
  setSpriteFrame(nodes.buttonSprite, buttonFrame);
  nodes.buttonNode.opacity = action === "claimed" ? 150 : 255;
  nodes.buttonNode.color = action === "claimed" ? cc.color(150, 150, 150) : cc.color(255, 255, 255);
  taskButton.interactable = action === "open" || action === "claim";
  nodes.buttonNode.__dailyTaskActionHandler = null;
  if (action === "claim") {
    nodes.buttonNode.__dailyTaskActionHandler = function () {
      this.onClaim(task.taskId);
    }.bind(this);
  } else if (action === "open") {
    nodes.buttonNode.__dailyTaskActionHandler = function () {
      this.onGo(task);
    }.bind(this);
  }
  bindTaskButtonWithDynamicHandler(nodes.buttonNode, "__dailyTaskActionHandler");
  this._bindProxySyncToNode(nodes.buttonNode);
};

DailyTaskViewController.prototype.render = function (summary) {
  assertObject(summary, "DailyTaskView render summary is required.");
  if (!Array.isArray(summary.tasks) || summary.tasks.length === 0) {
    return Promise.reject(new Error("DailyTaskView requires non-empty tasks."));
  }

  return this._ensureSpriteFrames(summary.tasks).then(function () {
    this._clearItemNodes();
    summary.tasks.forEach(function (task, index) {
      this._renderTask(task, index, summary.tasks.length);
    }, this);
    this._rebuildStaticRenderProxies();
    this._rebuildListRenderProxies();
    this._syncRenderProxies();
  }.bind(this));
};

module.exports = DailyTaskViewController;
