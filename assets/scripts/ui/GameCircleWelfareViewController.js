"use strict";

var BundleLoader = require("../utils/BundleLoader");

var REWARD_ICON_PATHS = {
  coin: "image/props/coin",
  stamina: "image/props/treasure_chest",
  swap_ball: "image/props/change_ball",
  rainbow_ball: "image/props/rainbow_ball",
  blast_ball: "image/props/blast_ball",
  barrier_hammer: "image/props/barrier_hammer"
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
  var goButtonNode = taskItemNode.getChildByName("go_btn");
  var taskNameNode = taskItemNode.getChildByName("task_name");
  var describeNode = taskItemNode.getChildByName("describe");
  var progressValueNode = taskItemNode.getChildByName("progress_value");
  var progressBarNode = taskItemNode.getChildByName("progressBar");
  var numNode = taskItemNode.getChildByName("num");
  var awardIconNode = taskItemNode.getChildByName("award_icon");
  var taskNameLabel = taskNameNode ? taskNameNode.getComponent(cc.Label) : null;
  var describeLabel = describeNode ? describeNode.getComponent(cc.Label) : null;
  var progressValueLabel = progressValueNode ? progressValueNode.getComponent(cc.Label) : null;
  var progressBar = progressBarNode ? progressBarNode.getComponent(cc.ProgressBar) : null;
  var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
  var awardIconSprite = awardIconNode ? awardIconNode.getComponent(cc.Sprite) : null;
  if (!goButtonNode || !taskNameLabel || !describeLabel || !progressValueLabel || !progressBar || !numLabel || !awardIconSprite) {
    throw new Error("GamingCircleView task item structure is incomplete.");
  }
  return {
    goButtonNode: goButtonNode,
    taskNameLabel: taskNameLabel,
    describeLabel: describeLabel,
    progressValueLabel: progressValueLabel,
    progressBar: progressBar,
    numLabel: numLabel,
    awardIconSprite: awardIconSprite
  };
};

GameCircleWelfareViewController.prototype._resolveAction = function (task) {
  if (task.complete || task.claimed) {
    return "completed";
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
  var button = nodes.goButtonNode.getComponent(cc.Button);
  if (!button) {
    throw new Error("GamingCircleView go_btn is missing cc.Button.");
  }
  applyTaskButtonCompletedVisual(nodes.goButtonNode, action === "completed");
  button.interactable = action !== "completed";

  if (action === "completed") {
    nodes.goButtonNode.__gameCircleTaskHandler = null;
  } else {
    nodes.goButtonNode.__gameCircleTaskHandler = this.onOpenGameCircle;
  }
  bindTapWithDynamicHandler(nodes.goButtonNode, "__gameCircleTaskHandler");

  return this._loadRewardIcon(rewardItem.id).then(function (spriteFrame) {
    if (!nodes.awardIconSprite || !nodes.awardIconSprite.node || !nodes.awardIconSprite.node.isValid) {
      throw new Error("GamingCircleView award icon node is invalid while rendering.");
    }
    nodes.awardIconSprite.spriteFrame = spriteFrame;
    return {
      taskId: task.taskId,
      action: action,
      goButtonNode: nodes.goButtonNode
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
