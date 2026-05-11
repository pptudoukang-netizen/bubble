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
var PACK_LIST_ITEM_SPACING = 20;
var SELECTED_LIST_ITEM_SPACING = 16;

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

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("BackpackView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  return requireValidNode(
    parentNode.getChildByName(childName),
    parentDescription + "/" + childName
  );
}

function requirePositiveNumber(value, description) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error("BackpackView requires positive " + description + ".");
  }
  return numberValue;
}

function calculatePackContentWidth(packListNode, itemWidth, visibleItemCount) {
  var packListWidth = requirePositiveNumber(packListNode.width, "pack list width");
  if (visibleItemCount <= 0) {
    return packListWidth;
  }

  var totalItemWidth = (visibleItemCount * itemWidth) + ((visibleItemCount - 1) * PACK_LIST_ITEM_SPACING);
  return Math.max(packListWidth, totalItemWidth);
}

function calculateSelectedContentWidth(selectListNode, itemWidth, visibleItemCount) {
  var selectListWidth = requirePositiveNumber(selectListNode.width, "selected list width");
  if (visibleItemCount <= 0) {
    return selectListWidth;
  }

  var totalItemWidth = (visibleItemCount * itemWidth) + ((visibleItemCount - 1) * SELECTED_LIST_ITEM_SPACING);
  return Math.max(selectListWidth, totalItemWidth);
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
    throw new Error("BackpackView requires root node.");
  }

  var panelNode = requireValidNode(findNodeByNameRecursive(this.node, "Panel"), "Panel");
  var packListNode = requireChildNode(panelNode, "pack_listview", "Panel");
  var packScrollView = packListNode.getComponent(cc.ScrollView);
  if (!packScrollView) {
    throw new Error("BackpackView requires Panel/pack_listview to have cc.ScrollView.");
  }
  var packContentNode = requireValidNode(packScrollView.content, "Panel/pack_listview ScrollView.content");
  var selectListNode = requireChildNode(panelNode, "select_listview", "Panel");
  var selectScrollView = selectListNode.getComponent(cc.ScrollView);
  if (!selectScrollView) {
    throw new Error("BackpackView requires Panel/select_listview to have cc.ScrollView.");
  }
  var selectContentNode = requireValidNode(selectScrollView.content, "Panel/select_listview ScrollView.content");
  var packItemTemplate = requireChildNode(packContentNode, "prop_item", "Panel/pack_listview/content");
  var selectedItemTemplate = requireChildNode(selectContentNode, "select_item", "Panel/select_listview/content");

  var nodes = {
    mask: requireValidNode(findNodeByNameRecursive(this.node, "mask"), "mask"),
    panel: panelNode,
    closeButton: requireChildNode(panelNode, "btn_close", "Panel"),
    useButton: requireChildNode(panelNode, "use_btn", "Panel"),
    titleLabelNode: requireChildNode(panelNode, "select_title", "Panel"),
    tipsLabelNode: requireChildNode(panelNode, "tips", "Panel"),
    packListNode: packListNode,
    packScrollView: packScrollView,
    packContentNode: packContentNode,
    selectListNode: selectListNode,
    selectScrollView: selectScrollView,
    selectContentNode: selectContentNode,
    packItemTemplate: packItemTemplate,
    selectedItemTemplate: selectedItemTemplate
  };

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
  var packListNode = requireValidNode(this._nodes.packListNode, "Panel/pack_listview");
  var packContentNode = requireValidNode(this._nodes.packContentNode, "Panel/pack_listview ScrollView.content");
  var templateNode = requireValidNode(this._nodes.packItemTemplate, "Panel/pack_listview/content/prop_item");

  var itemWidth = requirePositiveNumber(templateNode.width, "pack item width");
  packContentNode.width = calculatePackContentWidth(packListNode, itemWidth, 0);

  ITEM_DEFINITIONS.forEach(function (definition, index) {
    var itemNode = index === 0 ? templateNode : cc.instantiate(templateNode);
    if (index > 0) {
      itemNode.parent = packContentNode;
    }

    itemNode.name = "prop_item_" + definition.itemId;
    itemNode.active = false;
    itemNode.x = 0;
    itemNode.y = 0;
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
  var packListNode = requireValidNode(this._nodes.packListNode, "Panel/pack_listview");
  var packContentNode = requireValidNode(this._nodes.packContentNode, "Panel/pack_listview ScrollView.content");
  var templateNode = requireValidNode(this._nodes.packItemTemplate, "Panel/pack_listview/content/prop_item");
  var itemWidth = requirePositiveNumber(templateNode.width, "pack item width");
  var visibleIndex = 0;

  ITEM_DEFINITIONS.forEach(function (definition) {
    var itemNode = requireValidNode(
      this._packItemNodesByItemId[definition.itemId],
      "pack item node for " + definition.itemId
    );
    var itemCount = getItemCount(inventory, definition.itemId);
    if (itemCount <= 0) {
      itemNode.active = false;
    } else {
      var isSelected = selectedItems.indexOf(definition.itemId) >= 0;
      var iconNode = itemNode.getChildByName("icon");
      var nameNode = itemNode.getChildByName("name");
      var numNode = itemNode.getChildByName("num");
      var selectedNode = itemNode.getChildByName("selected");

      itemNode.active = true;
      itemNode.x = (itemWidth / 2) + (visibleIndex * (itemWidth + PACK_LIST_ITEM_SPACING));
      itemNode.y = 0;
      visibleIndex += 1;

      setLabelText(nameNode, definition.displayName);
      setLabelText(numNode, String(itemCount));

      if (selectedNode && selectedNode.isValid) {
        selectedNode.active = isSelected;
      }

      if (!this._interactionEnabled) {
        itemNode.opacity = 235;
      } else {
        itemNode.opacity = 255;
      }
      itemNode.color = isSelected ? cc.color(255, 255, 255) : cc.color(235, 235, 235);
      setSpriteFrame(iconNode, this._itemSpriteFrames[definition.itemId] || null);
    }
  }, this);

  packContentNode.width = calculatePackContentWidth(packListNode, itemWidth, visibleIndex);
};

BackpackViewController.prototype._renderSelectedList = function (inventory, selectedItems, selectedItemCounts) {
  var listNode = requireValidNode(this._nodes.selectListNode, "Panel/select_listview");
  var contentNode = requireValidNode(this._nodes.selectContentNode, "Panel/select_listview ScrollView.content");
  var templateNode = requireValidNode(this._nodes.selectedItemTemplate, "Panel/select_listview/content/select_item");
  var itemWidth = requirePositiveNumber(templateNode.width, "selected item width");

  this._clearSelectedListItems();
  templateNode.active = false;
  contentNode.width = calculateSelectedContentWidth(listNode, itemWidth, 0);
  var totalSelectedCount = getTotalSelectedCount(selectedItems, selectedItemCounts, inventory);
  var visibleIndex = 0;

  selectedItems.forEach(function (itemId) {
    var definition = ITEM_DEFINITION_MAP[itemId];
    if (!definition) {
      throw new Error("BackpackView selected item is unsupported: " + itemId);
    }

    var selectedCount = getSelectedCount(selectedItemCounts, itemId);
    var inventoryCount = getItemCount(inventory, itemId);
    selectedCount = Math.min(selectedCount, Math.max(1, inventoryCount || 1));

    var rowNode = cc.instantiate(templateNode);
    rowNode.name = "select_item_" + itemId;
    rowNode.parent = contentNode;
    rowNode.active = true;
    rowNode.x = (itemWidth / 2) + (visibleIndex * (itemWidth + SELECTED_LIST_ITEM_SPACING));
    rowNode.y = 0;
    visibleIndex += 1;

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

  contentNode.width = calculateSelectedContentWidth(listNode, itemWidth, visibleIndex);
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
