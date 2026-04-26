"use strict";

var BundleLoader = require("../utils/BundleLoader");
var Logger = require("../utils/Logger");

var ITEM_DEFINITIONS = [
  {
    itemId: "swap_ball",
    displayName: "换球",
    iconPath: "image/props/change_ball"
  },
  {
    itemId: "rainbow_ball",
    displayName: "彩虹球",
    iconPath: "image/props/rainbow_ball"
  },
  {
    itemId: "blast_ball",
    displayName: "炸裂球",
    iconPath: "image/props/blast_ball"
  },
  {
    itemId: "barrier_hammer",
    displayName: "破障锤",
    iconPath: "image/props/barrier_hammer"
  }
];

var ITEM_DEFINITION_MAP = ITEM_DEFINITIONS.reduce(function (result, definition) {
  result[definition.itemId] = definition;
  return result;
}, {});

var MAX_SELECTED_POWERUPS = 4;
var TOTAL_SELECTED_TIPS_TEXT = "提示：关卡中最多携带" + MAX_SELECTED_POWERUPS + "个道具";

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children || [];
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function bindTapOnce(node, key, onTap) {
  if (!node || !node.isValid || !key || node[key] === true) {
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
    if (typeof onTap === "function") {
      onTap();
    }
  });
}

function getItemCount(inventory, itemId) {
  var items = inventory && inventory.items ? inventory.items : {};
  return Math.max(0, Math.floor(Number(items[itemId]) || 0));
}

function getSelectedCount(selectedItemCounts, itemId) {
  var source = selectedItemCounts && typeof selectedItemCounts === "object"
    ? selectedItemCounts
    : {};
  return Math.max(1, Math.floor(Number(source[itemId]) || 1));
}

function getTotalSelectedCount(selectedItems, selectedItemCounts, inventory) {
  var safeSelectedItems = Array.isArray(selectedItems) ? selectedItems : [];
  return safeSelectedItems.reduce(function (total, itemId) {
    var selectedCount = getSelectedCount(selectedItemCounts, itemId);
    if (inventory) {
      var inventoryCount = getItemCount(inventory, itemId);
      selectedCount = Math.min(selectedCount, Math.max(1, inventoryCount || 1));
    }
    return total + selectedCount;
  }, 0);
}

function setLabelText(node, text) {
  if (!node || !node.isValid) {
    return;
  }

  var label = node.getComponent(cc.Label);
  if (!label) {
    return;
  }
  label.string = String(text || "");
}

function setSpriteFrame(node, spriteFrame) {
  if (!node || !node.isValid || !spriteFrame) {
    return;
  }

  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    return;
  }

  sprite.spriteFrame = spriteFrame;
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error || !spriteFrame) {
        Logger.warn("Load backpack sprite failed", path, error && error.message ? error.message : error);
        resolve(null);
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function BackpackViewController(options) {
  options = options || {};
  this.node = options.node || null;
  this.onClose = typeof options.onClose === "function" ? options.onClose : function () {};
  this.onConfirm = typeof options.onConfirm === "function" ? options.onConfirm : function () {};
  this.onToggleItem = typeof options.onToggleItem === "function" ? options.onToggleItem : function () {};
  this.onIncreaseItemCount = typeof options.onIncreaseItemCount === "function" ? options.onIncreaseItemCount : function () {};
  this.onDecreaseItemCount = typeof options.onDecreaseItemCount === "function" ? options.onDecreaseItemCount : function () {};
  this._nodes = this._resolveNodes();
  this._packItemNodesByItemId = {};
  this._selectedListItemNodes = [];
  this._itemSpriteFrames = {};
  this._itemSpriteLoadPromise = null;
  this._lastRenderOptions = null;
  this._interactionEnabled = true;
  this._useButtonEnabled = true;
  this._initPackItemNodes();
  this._bindActions();
  this.ensureItemSpriteFrames();
}

BackpackViewController.prototype._resolveNodes = function () {
  if (!this.node || !this.node.isValid) {
    return {};
  }

  var panelNode = findNodeByNameRecursive(this.node, "Panel");
  var packListNode = panelNode ? panelNode.getChildByName("pack_listview") : null;
  var selectListNode = panelNode ? panelNode.getChildByName("select_listview") : null;
  var packItemTemplate = packListNode ? packListNode.getChildByName("prop_item") : null;
  var selectedItemTemplate = selectListNode ? selectListNode.getChildByName("select_item") : null;

  var nodes = {
    mask: findNodeByNameRecursive(this.node, "mask"),
    panel: panelNode,
    closeButton: panelNode ? panelNode.getChildByName("btn_close") : null,
    useButton: panelNode ? panelNode.getChildByName("use_btn") : null,
    titleLabelNode: panelNode ? panelNode.getChildByName("select_title") : null,
    tipsLabelNode: panelNode ? panelNode.getChildByName("tips") : null,
    packListNode: packListNode,
    selectListNode: selectListNode,
    packItemTemplate: packItemTemplate,
    selectedItemTemplate: selectedItemTemplate
  };

  if (
    !nodes.panel ||
    !nodes.packListNode ||
    !nodes.selectListNode ||
    !nodes.packItemTemplate ||
    !nodes.selectedItemTemplate ||
    !nodes.closeButton ||
    !nodes.useButton
  ) {
    Logger.warn("BackpackView prefab structure is incomplete.");
  }

  return nodes;
};

BackpackViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__backpackCloseTapBound", this.onClose);
  bindTapOnce(this._nodes.mask, "__backpackMaskTapBound", this.onClose);
  bindTapOnce(this._nodes.useButton, "__backpackUseTapBound", function () {
    if (!this._useButtonEnabled) {
      return;
    }
    this.onConfirm();
  }.bind(this));
};

BackpackViewController.prototype._initPackItemNodes = function () {
  var packListNode = this._nodes.packListNode;
  var templateNode = this._nodes.packItemTemplate;
  if (!packListNode || !templateNode || !packListNode.isValid || !templateNode.isValid) {
    return;
  }

  ITEM_DEFINITIONS.forEach(function (definition, index) {
    var itemNode = index === 0 ? templateNode : cc.instantiate(templateNode);
    if (index > 0) {
      itemNode.parent = packListNode;
    }

    itemNode.name = "prop_item_" + definition.itemId;
    itemNode.active = true;
    this._packItemNodesByItemId[definition.itemId] = itemNode;
    bindTapOnce(itemNode, "__backpackPackItemTapBound", function () {
      if (!this._interactionEnabled) {
        return;
      }
      this.onToggleItem(definition.itemId);
    }.bind(this));
  }, this);
};

BackpackViewController.prototype._clearSelectedListItems = function () {
  while (this._selectedListItemNodes.length > 0) {
    var node = this._selectedListItemNodes.pop();
    if (node && node.isValid) {
      node.destroy();
    }
  }
};

BackpackViewController.prototype._renderPackList = function (inventory, selectedItems, selectedItemCounts) {
  ITEM_DEFINITIONS.forEach(function (definition) {
    var itemNode = this._packItemNodesByItemId[definition.itemId];
    if (!itemNode || !itemNode.isValid) {
      return;
    }

    var itemCount = getItemCount(inventory, definition.itemId);
    var isSelected = selectedItems.indexOf(definition.itemId) >= 0;
    var iconNode = itemNode.getChildByName("icon");
    var nameNode = itemNode.getChildByName("name");
    var numNode = itemNode.getChildByName("num");
    var selectedNode = itemNode.getChildByName("selected");

    setLabelText(nameNode, definition.displayName);
    setLabelText(numNode, String(itemCount));

    if (selectedNode && selectedNode.isValid) {
      selectedNode.active = isSelected;
    }

    if (!this._interactionEnabled) {
      itemNode.opacity = itemCount > 0 ? 235 : 140;
    } else {
      itemNode.opacity = itemCount > 0 ? 255 : 150;
    }
    itemNode.color = isSelected ? cc.color(255, 255, 255) : cc.color(235, 235, 235);
    setSpriteFrame(iconNode, this._itemSpriteFrames[definition.itemId] || null);
  }, this);
};

BackpackViewController.prototype._renderSelectedList = function (inventory, selectedItems, selectedItemCounts) {
  var listNode = this._nodes.selectListNode;
  var templateNode = this._nodes.selectedItemTemplate;
  if (!listNode || !templateNode || !listNode.isValid || !templateNode.isValid) {
    return;
  }

  this._clearSelectedListItems();
  templateNode.active = false;
  var totalSelectedCount = getTotalSelectedCount(selectedItems, selectedItemCounts, inventory);

  selectedItems.forEach(function (itemId) {
    var definition = ITEM_DEFINITION_MAP[itemId];
    if (!definition) {
      return;
    }

    var selectedCount = getSelectedCount(selectedItemCounts, itemId);
    var inventoryCount = getItemCount(inventory, itemId);
    selectedCount = Math.min(selectedCount, Math.max(1, inventoryCount || 1));

    var rowNode = cc.instantiate(templateNode);
    rowNode.name = "select_item_" + itemId;
    rowNode.parent = listNode;
    rowNode.active = true;

    var iconNode = rowNode.getChildByName("icon");
    var numNode = rowNode.getChildByName("num");
    var reduceButtonNode = rowNode.getChildByName("reduce_btn");
    var addButtonNode = rowNode.getChildByName("add_btn");

    setSpriteFrame(iconNode, this._itemSpriteFrames[itemId] || null);
    setLabelText(numNode, String(selectedCount));

    bindTapOnce(reduceButtonNode, "__backpackReduceTapBound", function () {
      if (!this._interactionEnabled) {
        return;
      }
      this.onDecreaseItemCount(itemId);
    }.bind(this));
    bindTapOnce(addButtonNode, "__backpackAddTapBound", function () {
      if (!this._interactionEnabled) {
        return;
      }
      this.onIncreaseItemCount(itemId);
    }.bind(this));

    if (addButtonNode && addButtonNode.isValid) {
      if (!this._interactionEnabled) {
        addButtonNode.opacity = 140;
      } else {
        addButtonNode.opacity = (inventoryCount > selectedCount && totalSelectedCount < MAX_SELECTED_POWERUPS) ? 255 : 140;
      }
    }
    if (reduceButtonNode && reduceButtonNode.isValid) {
      if (!this._interactionEnabled) {
        reduceButtonNode.opacity = 140;
      } else {
        reduceButtonNode.opacity = selectedCount > 1 ? 255 : 180;
      }
    }

    this._selectedListItemNodes.push(rowNode);
  }, this);
};

BackpackViewController.prototype._renderHeaderAndButton = function (selectedItems, selectedItemCounts) {
  var safeSelectedItems = Array.isArray(selectedItems) ? selectedItems : [];
  var safeSelectedItemCounts = selectedItemCounts && typeof selectedItemCounts === "object"
    ? selectedItemCounts
    : {};
  var totalSelectedCount = getTotalSelectedCount(safeSelectedItems, safeSelectedItemCounts);
  var titleLabelNode = this._nodes.titleLabelNode;
  var tipsLabelNode = this._nodes.tipsLabelNode;
  var useButtonNode = this._nodes.useButton;
  var useButton = useButtonNode ? useButtonNode.getComponent(cc.Button) : null;
  var canConfirm = !!this._useButtonEnabled;

  setLabelText(titleLabelNode, "---已选择道具--- " + totalSelectedCount + "/" + MAX_SELECTED_POWERUPS);
  setLabelText(tipsLabelNode, TOTAL_SELECTED_TIPS_TEXT);

  if (useButton) {
    useButton.interactable = canConfirm;
  }
  if (useButtonNode && useButtonNode.isValid) {
    useButtonNode.opacity = canConfirm ? 255 : 170;
  }
};

BackpackViewController.prototype.render = function (options) {
  var safeOptions = options || {};
  this._lastRenderOptions = safeOptions;
  this._interactionEnabled = safeOptions.interactionEnabled !== false;
  this._useButtonEnabled = safeOptions.useButtonEnabled !== false;
  var inventory = safeOptions.inventory || { items: {} };
  var selectedItems = Array.isArray(safeOptions.selectedItems) ? safeOptions.selectedItems.slice() : [];
  var selectedItemCounts = safeOptions.selectedItemCounts && typeof safeOptions.selectedItemCounts === "object"
    ? safeOptions.selectedItemCounts
    : {};

  this._renderPackList(inventory, selectedItems, selectedItemCounts);
  this._renderSelectedList(inventory, selectedItems, selectedItemCounts);
  this._renderHeaderAndButton(selectedItems, selectedItemCounts);
  this.ensureItemSpriteFrames();
};

BackpackViewController.prototype.ensureItemSpriteFrames = function () {
  if (this._itemSpriteLoadPromise) {
    return this._itemSpriteLoadPromise;
  }

  var missingDefinitions = ITEM_DEFINITIONS.filter(function (definition) {
    return !this._itemSpriteFrames[definition.itemId];
  }, this);
  if (!missingDefinitions.length) {
    return Promise.resolve(this._itemSpriteFrames);
  }

  this._itemSpriteLoadPromise = Promise.all(missingDefinitions.map(function (definition) {
    return loadSpriteFrame(definition.iconPath).then(function (spriteFrame) {
      return {
        itemId: definition.itemId,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (results) {
    results.forEach(function (entry) {
      if (!entry || !entry.itemId || !entry.spriteFrame) {
        return;
      }
      this._itemSpriteFrames[entry.itemId] = entry.spriteFrame;
    }, this);
    this._itemSpriteLoadPromise = null;
    if (this._lastRenderOptions) {
      this.render(this._lastRenderOptions);
    }
    return this._itemSpriteFrames;
  }.bind(this)).catch(function (error) {
    this._itemSpriteLoadPromise = null;
    Logger.warn("Load backpack sprite frames failed", error && error.message ? error.message : error);
    return this._itemSpriteFrames;
  }.bind(this));

  return this._itemSpriteLoadPromise;
};

BackpackViewController.ITEM_DEFINITIONS = ITEM_DEFINITIONS.slice();
BackpackViewController.MAX_SELECTED_POWERUPS = MAX_SELECTED_POWERUPS;

module.exports = BackpackViewController;
