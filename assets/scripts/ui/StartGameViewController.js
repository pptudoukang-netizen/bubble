"use strict";

var BundleLoader = require("../utils/BundleLoader");

var POWERUP_DEFINITIONS = [
  { itemId: "swap_ball", unlockLevel: 5, iconPath: "image/props/change_ball" },
  { itemId: "rainbow_ball", unlockLevel: 10, iconPath: "image/props/rainbow_ball" },
  { itemId: "blast_ball", unlockLevel: 15, iconPath: "image/props/blast_ball" },
  { itemId: "barrier_hammer", unlockLevel: 20, iconPath: "image/props/barrier_hammer" }
];
var LOCK_ICON_PATH = "image/lock";

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children;
  if (!Array.isArray(children)) {
    throw new Error("StartGameView node children must be an array.");
  }
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("StartGameView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  return requireValidNode(parentNode.getChildByName(childName), parentDescription + "/" + childName);
}

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, description) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(description + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function getLabel(node, description) {
  var label = requireValidNode(node, description).getComponent(cc.Label);
  if (!label) {
    throw new Error("StartGameView requires " + description + " cc.Label.");
  }
  return label;
}

function getSprite(node, description) {
  var sprite = requireValidNode(node, description).getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("StartGameView requires " + description + " cc.Sprite.");
  }
  return sprite;
}

function setLabelText(node, text, description) {
  getLabel(node, description).string = String(text);
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load StartGameView sprite failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("StartGameView sprite frame is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function bindTapOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "StartGameView tap callback");
  if (node[key] === true) {
    return;
  }

  node[key] = true;
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
    onTap();
  });
}

function bindTapWithoutScaleOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "StartGameView tap callback");
  if (node[key] === true) {
    return;
  }

  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    onTap();
  });
}

function getInventoryCount(inventory, itemId) {
  requireObject(inventory, "StartGameView inventory");
  requireObject(inventory.items, "StartGameView inventory items");
  if (!Object.prototype.hasOwnProperty.call(inventory.items, itemId)) {
    throw new Error("StartGameView inventory missing item count: " + itemId);
  }
  return requireNonNegativeInteger(inventory.items[itemId], "StartGameView inventory item count `" + itemId + "`");
}

function assertSelectedItems(selectedItems) {
  if (!Array.isArray(selectedItems)) {
    throw new Error("StartGameView selectedItems must be an array.");
  }
  selectedItems.forEach(function (itemId) {
    if (!POWERUP_DEFINITIONS.some(function (definition) { return definition.itemId === itemId; })) {
      throw new Error("StartGameView selected item is unsupported: " + itemId);
    }
  });
}

function normalizePurchaseOptions(purchaseOptionsByItemId) {
  requireObject(purchaseOptionsByItemId, "StartGameView purchase options");
  var output = {};
  POWERUP_DEFINITIONS.forEach(function (definition) {
    var itemId = definition.itemId;
    var option = requireObject(purchaseOptionsByItemId[itemId], "StartGameView purchase option `" + itemId + "`");
    output[itemId] = {
      price: requirePositiveInteger(option.price, "StartGameView purchase price `" + itemId + "`"),
      remaining: requireNonNegativeInteger(option.remaining, "StartGameView purchase remaining `" + itemId + "`")
    };
  });
  return output;
}

function StartGameViewController(options) {
  requireObject(options, "StartGameViewController options");
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "StartGameViewController onClose");
  this.onPlay = requireFunction(options.onPlay, "StartGameViewController onPlay");
  this.onUnavailable = requireFunction(options.onUnavailable, "StartGameViewController onUnavailable");
  this.onPurchasePowerup = requireFunction(options.onPurchasePowerup, "StartGameViewController onPurchasePowerup");
  this._nodes = this._resolveNodes();
  this._nodes.awardTipsNode.active = false;
  this._propNodes = [];
  this._spriteFrames = {};
  this._spriteLoadPromise = null;
  this._renderState = null;
  this._selectedItems = [];
  this._purchaseInProgressItemId = "";
  this._initPropNodes();
  this._bindActions();
}

StartGameViewController.prototype._resolveNodes = function () {
  var panelNode = requireValidNode(findNodeByNameRecursive(this.node, "Panel"), "Panel");
  var titleBgNode = requireChildNode(panelNode, "title_bg", "Panel");
  var playButtonNode = requireChildNode(panelNode, "play_btn", "Panel");
  var targetNode = requireChildNode(panelNode, "target", "Panel");
  var targetLayoutNode = requireChildNode(targetNode, "traget_layout", "Panel/target");
  var targetBallNode = requireChildNode(targetLayoutNode, "target_ball", "Panel/target/traget_layout");
  var targetIceNode = requireChildNode(targetLayoutNode, "target_ice", "Panel/target/traget_layout");
  var propListNode = requireChildNode(panelNode, "prop_listview", "Panel");
  var propTemplateNode = requireChildNode(propListNode, "prop", "Panel/prop_listview");

  return {
    mask: requireValidNode(findNodeByNameRecursive(this.node, "mask"), "mask"),
    panel: panelNode,
    closeButton: requireChildNode(panelNode, "btn_close", "Panel"),
    awardTipsNode: requireChildNode(panelNode, "award_tips", "Panel"),
    levelLabelNode: requireChildNode(titleBgNode, "level", "Panel/title_bg"),
    playButton: playButtonNode,
    staminaCostLabelNode: requireChildNode(playButtonNode, "num", "Panel/play_btn"),
    targetTitleNode: requireChildNode(targetNode, "target_title", "Panel/target"),
    targetLayoutNode: targetLayoutNode,
    targetBallNode: targetBallNode,
    targetBallCountLabelNode: requireChildNode(targetBallNode, "num", "Panel/target/traget_layout/target_ball"),
    targetIceNode: targetIceNode,
    targetIceCountLabelNode: requireChildNode(targetIceNode, "num", "Panel/target/traget_layout/target_ice"),
    propListNode: propListNode,
    propTemplateNode: propTemplateNode
  };
};

StartGameViewController.prototype._selectObjectiveTargetNodes = function (objective) {
  requireObject(objective, "StartGameView objective");
  if (typeof objective.type !== "string") {
    throw new Error("StartGameView objective type must be a string.");
  }

  if (objective.type === "collect_ice_snowball") {
    this._nodes.targetBallNode.active = false;
    this._nodes.targetIceNode.active = true;
    return {
      iconNode: this._nodes.targetIceNode,
      countLabelNode: this._nodes.targetIceCountLabelNode,
      description: "Panel/target/traget_layout/target_ice"
    };
  }

  if (objective.type === "collect_any" || objective.type === "collect_color") {
    this._nodes.targetBallNode.active = true;
    this._nodes.targetIceNode.active = false;
    return {
      iconNode: this._nodes.targetBallNode,
      countLabelNode: this._nodes.targetBallCountLabelNode,
      description: "Panel/target/traget_layout/target_ball"
    };
  }

  throw new Error("Unsupported StartGameView objective type: " + objective.type);
};

StartGameViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__startGameCloseTapBound", this.onClose);
  bindTapWithoutScaleOnce(this._nodes.mask, "__startGameMaskTapBound", this.onClose);
  bindTapOnce(this._nodes.playButton, "__startGamePlayTapBound", function () {
    if (this._purchaseInProgressItemId) {
      this.onUnavailable("购买处理中，请稍候");
      return;
    }
    this.onPlay(this._selectedItems.slice());
  }.bind(this));
};

StartGameViewController.prototype._initPropNodes = function () {
  var propListNode = requireValidNode(this._nodes.propListNode, "Panel/prop_listview");
  var propTemplateNode = requireValidNode(this._nodes.propTemplateNode, "Panel/prop_listview/prop");

  POWERUP_DEFINITIONS.forEach(function (definition, index) {
    var propNode = index === 0 ? propTemplateNode : cc.instantiate(propTemplateNode);
    if (index > 0) {
      propNode.parent = propListNode;
    }
    propNode.name = "prop_" + definition.itemId;
    propNode.active = true;
    var coinNode = requireChildNode(propNode, "coin", propNode.name);
    this._propNodes.push({
      definition: definition,
      node: propNode,
      iconNode: requireChildNode(propNode, "icon", propNode.name),
      numNode: requireChildNode(propNode, "num", propNode.name),
      coinNode: coinNode,
      coinPriceNode: requireChildNode(coinNode, "num", propNode.name + "/coin"),
      limitNode: requireChildNode(propNode, "limit", propNode.name),
      selectNode: requireChildNode(propNode, "select", propNode.name)
    });
  }, this);

  this._propNodes.forEach(function (entry) {
    bindTapOnce(entry.node, "__startGamePropTapBound", function () {
      this._onPropTap(entry.definition.itemId);
    }.bind(this));
  }, this);
};

StartGameViewController.prototype._getRequiredSpritePaths = function (options) {
  requireObject(options, "StartGameView render options");
  requireObject(options.objective, "StartGameView objective");
  if (typeof options.objective.iconPath !== "string" || options.objective.iconPath.length === 0) {
    throw new Error("StartGameView objective iconPath must be a non-empty string.");
  }
  return [LOCK_ICON_PATH, options.objective.iconPath].concat(POWERUP_DEFINITIONS.map(function (definition) {
    return definition.iconPath;
  })).filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

StartGameViewController.prototype._ensureSpriteFrames = function (options) {
  var paths = this._getRequiredSpritePaths(options);
  var missingPaths = paths.filter(function (path) {
    return !this._spriteFrames[path];
  }, this);
  if (missingPaths.length === 0) {
    return Promise.resolve(this._spriteFrames);
  }
  if (this._spriteLoadPromise) {
    return this._spriteLoadPromise;
  }

  this._spriteLoadPromise = Promise.all(missingPaths.map(function (path) {
    return loadSpriteFrame(path).then(function (spriteFrame) {
      return {
        path: path,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (results) {
    results.forEach(function (entry) {
      if (!entry || typeof entry.path !== "string" || !entry.spriteFrame) {
        throw new Error("StartGameView sprite load result is invalid.");
      }
      this._spriteFrames[entry.path] = entry.spriteFrame;
    }, this);
    this._spriteLoadPromise = null;
    return this._spriteFrames;
  }.bind(this)).catch(function (error) {
    this._spriteLoadPromise = null;
    throw error;
  }.bind(this));

  return this._spriteLoadPromise;
};

StartGameViewController.prototype._onPropTap = function (itemId) {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before selecting props.");
  }
  var definition = POWERUP_DEFINITIONS.filter(function (entry) {
    return entry.itemId === itemId;
  })[0];
  if (!definition) {
    throw new Error("StartGameView prop item is unsupported: " + itemId);
  }
  var levelId = this._renderState.levelId;
  var unlocked = levelId >= definition.unlockLevel;
  if (!unlocked) {
    this.onUnavailable(definition.unlockLevel + "关解锁");
    return;
  }

  var index = this._selectedItems.indexOf(itemId);
  if (index >= 0) {
    this._selectedItems.splice(index, 1);
    this._renderPropSelectionState();
    return;
  }

  var count = getInventoryCount(this._renderState.inventory, itemId);
  if (count <= 0) {
    this._purchasePowerupAndSelect(itemId);
    return;
  }

  this._selectedItems.push(itemId);
  this._renderPropSelectionState();
};

StartGameViewController.prototype._purchasePowerupAndSelect = function (itemId) {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before purchasing props.");
  }
  var purchaseOption = this._renderState.purchaseOptionsByItemId[itemId];
  if (!purchaseOption) {
    throw new Error("StartGameView purchase option missing for item: " + itemId);
  }
  if (purchaseOption.remaining <= 0) {
    this.onUnavailable("今日售罄");
    return;
  }
  if (this._purchaseInProgressItemId) {
    this.onUnavailable("购买处理中，请稍候");
    return;
  }

  this._purchaseInProgressItemId = itemId;
  Promise.resolve(this.onPurchasePowerup(itemId)).then(function (purchaseResult) {
    if (!purchaseResult || typeof purchaseResult.accepted !== "boolean") {
      throw new Error("StartGameView purchase result is invalid.");
    }
    if (!purchaseResult.accepted) {
      this.onUnavailable(purchaseResult.message);
      return;
    }
    requireObject(purchaseResult.inventory, "StartGameView purchase result inventory");
    this._renderState.inventory = purchaseResult.inventory;
    if (purchaseResult.purchaseOptionsByItemId !== undefined) {
      this._renderState.purchaseOptionsByItemId = normalizePurchaseOptions(purchaseResult.purchaseOptionsByItemId);
    }
    if (getInventoryCount(this._renderState.inventory, itemId) <= 0) {
      throw new Error("StartGameView purchased item must be added to inventory: " + itemId);
    }
    if (this._selectedItems.indexOf(itemId) < 0) {
      this._selectedItems.push(itemId);
    }
    this._renderPropItems();
    this._renderPropSelectionState();
  }.bind(this)).catch(function (error) {
    this.onUnavailable(error && error.message ? error.message : String(error));
  }.bind(this)).then(function () {
    this._purchaseInProgressItemId = "";
  }.bind(this));
};

StartGameViewController.prototype._renderPropItems = function () {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before rendering props.");
  }

  var levelId = this._renderState.levelId;
  var inventory = this._renderState.inventory;
  var purchaseOptionsByItemId = this._renderState.purchaseOptionsByItemId;
  this._propNodes.forEach(function (entry) {
    var definition = entry.definition;
    var unlocked = levelId >= definition.unlockLevel;
    var iconPath = unlocked ? definition.iconPath : LOCK_ICON_PATH;
    getSprite(entry.iconNode, entry.node.name + "/icon").spriteFrame = this._spriteFrames[iconPath];
    entry.numNode.active = unlocked;
    entry.coinNode.active = false;
    entry.limitNode.active = true;
    if (unlocked) {
      var count = getInventoryCount(inventory, definition.itemId);
      if (count > 0) {
        setLabelText(entry.numNode, String(count), entry.node.name + "/num");
        setLabelText(entry.limitNode, "可使用", entry.node.name + "/limit");
      } else {
        var purchaseOption = purchaseOptionsByItemId[definition.itemId];
        if (!purchaseOption) {
          throw new Error("StartGameView purchase option missing for item: " + definition.itemId);
        }
        entry.numNode.active = false;
        if (purchaseOption.remaining > 0) {
          entry.coinNode.active = true;
          entry.limitNode.active = false;
          setLabelText(entry.coinPriceNode, String(purchaseOption.price), entry.node.name + "/coin/num");
        } else {
          setLabelText(entry.limitNode, "今日售罄", entry.node.name + "/limit");
        }
      }
    } else {
      setLabelText(entry.limitNode, definition.unlockLevel + "关解锁", entry.node.name + "/limit");
      var selectedIndex = this._selectedItems.indexOf(definition.itemId);
      if (selectedIndex >= 0) {
        this._selectedItems.splice(selectedIndex, 1);
      }
    }
  }, this);
};

StartGameViewController.prototype._renderPropSelectionState = function () {
  this._propNodes.forEach(function (entry) {
    entry.selectNode.active = this._selectedItems.indexOf(entry.definition.itemId) >= 0;
  }, this);
};

StartGameViewController.prototype._renderContent = function (options) {
  var levelId = requirePositiveInteger(options.levelId, "StartGameView levelId");
  var staminaCost = requirePositiveInteger(options.staminaCost, "StartGameView staminaCost");
  requireObject(options.inventory, "StartGameView inventory");
  requireObject(options.objective, "StartGameView objective");
  requirePositiveInteger(options.objective.target, "StartGameView objective target");
  var targetNodes = this._selectObjectiveTargetNodes(options.objective);
  if (typeof options.showAwardTips !== "boolean") {
    throw new Error("StartGameView showAwardTips must be boolean.");
  }
  assertSelectedItems(options.selectedItems);
  var purchaseOptionsByItemId = normalizePurchaseOptions(options.purchaseOptionsByItemId);

  this._renderState = {
    levelId: levelId,
    inventory: options.inventory,
    purchaseOptionsByItemId: purchaseOptionsByItemId
  };
  this._selectedItems = options.selectedItems.filter(function (itemId, index, list) {
    var definition = POWERUP_DEFINITIONS.filter(function (entry) {
      return entry.itemId === itemId;
    })[0];
    if (!definition) {
      throw new Error("StartGameView selected item is unsupported: " + itemId);
    }
    return list.indexOf(itemId) === index &&
      levelId >= definition.unlockLevel &&
      getInventoryCount(options.inventory, itemId) > 0;
  });

  setLabelText(this._nodes.levelLabelNode, "第" + levelId + "关", "Panel/title_bg/level");
  setLabelText(this._nodes.staminaCostLabelNode, String(staminaCost), "Panel/play_btn/num");
  setLabelText(this._nodes.targetTitleNode, "收集目标", "Panel/target/target_title");
  setLabelText(targetNodes.countLabelNode, String(options.objective.target), targetNodes.description + "/num");
  getSprite(targetNodes.iconNode, targetNodes.description).spriteFrame = this._spriteFrames[options.objective.iconPath];
  this._nodes.awardTipsNode.active = options.showAwardTips;

  this._renderPropItems();
  this._renderPropSelectionState();
};

StartGameViewController.prototype.render = function (options) {
  requireObject(options, "StartGameView render options");
  if (typeof options.showAwardTips !== "boolean") {
    throw new Error("StartGameView showAwardTips must be boolean.");
  }
  this._nodes.awardTipsNode.active = options.showAwardTips;
  return this._ensureSpriteFrames(options).then(function () {
    this._renderContent(options);
  }.bind(this));
};

StartGameViewController.POWERUP_DEFINITIONS = POWERUP_DEFINITIONS.slice();

module.exports = StartGameViewController;
