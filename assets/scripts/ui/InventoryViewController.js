"use strict";

var ITEM_DEFINITIONS = [
  {
    itemId: "swap_ball",
    cardName: "SwapBallCard",
    displayName: "换球"
  },
  {
    itemId: "rainbow_ball",
    cardName: "RainbowBallCard",
    displayName: "彩虹"
  },
  {
    itemId: "blast_ball",
    cardName: "BlastBallCard",
    displayName: "炸裂"
  },
  {
    itemId: "barrier_hammer",
    cardName: "BarrierHammerCard",
    displayName: "破障锤"
  }
];
var MAX_SELECTED_POWERUPS = 4;

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

function bindTapOnce(node, onTap) {
  if (!node || !node.isValid || node.__inventoryTapBound === true) {
    return;
  }

  node.__inventoryTapBound = true;
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

function InventoryViewController(options) {
  options = options || {};
  this.node = options.node || null;
  this.onClose = typeof options.onClose === "function" ? options.onClose : function () {};
  this.onConfirm = typeof options.onConfirm === "function" ? options.onConfirm : function () {};
  this.onToggleItem = typeof options.onToggleItem === "function" ? options.onToggleItem : function () {};
  this.onSelectionLimit = typeof options.onSelectionLimit === "function" ? options.onSelectionLimit : function () {};
  this.cardNodesByItemId = {};
  this._bindActions();
}

InventoryViewController.prototype._bindActions = function () {
  if (!this.node || !this.node.isValid) {
    return;
  }

  bindTapOnce(findNodeByNameRecursive(this.node, "CloseButton"), this.onClose);
  bindTapOnce(findNodeByNameRecursive(this.node, "ConfirmButton"), this.onConfirm);

  ITEM_DEFINITIONS.forEach(function (item) {
    var cardNode = findNodeByNameRecursive(this.node, item.cardName);
    if (!cardNode || !cardNode.isValid) {
      return;
    }

    this.cardNodesByItemId[item.itemId] = cardNode;
    bindTapOnce(cardNode, function () {
      this.onToggleItem(item.itemId);
    }.bind(this));
  }, this);
};

InventoryViewController.prototype.render = function (options) {
  options = options || {};
  var inventory = options.inventory || { items: {} };
  var selectedItems = Array.isArray(options.selectedItems) ? options.selectedItems : [];
  var coinCount = Math.max(0, Math.floor(Number(options.coinCount) || 0));

  this._setLabelText("CoinCount", String(coinCount));
  this._setLabelText("EquippedCountLabel", "出战道具 " + selectedItems.length + "/" + MAX_SELECTED_POWERUPS);

  ITEM_DEFINITIONS.forEach(function (item) {
    this._renderItemCard(item, inventory, selectedItems);
  }, this);
};

InventoryViewController.prototype._renderItemCard = function (item, inventory, selectedItems) {
  var cardNode = this.cardNodesByItemId[item.itemId];
  if (!cardNode || !cardNode.isValid) {
    return;
  }

  var count = getItemCount(inventory, item.itemId);
  var isSelected = selectedItems.indexOf(item.itemId) >= 0;
  var nameLabel = cardNode.getChildByName("NameLabel");
  var countLabel = cardNode.getChildByName("CountLabel");
  var selectedBadge = cardNode.getChildByName("SelectedBadge");
  var addBadge = cardNode.getChildByName("AddBadge");
  var button = cardNode.getComponent(cc.Button);

  if (nameLabel) {
    var nameText = nameLabel.getComponent(cc.Label);
    if (nameText) {
      nameText.string = item.displayName;
    }
  }
  if (countLabel) {
    var countText = countLabel.getComponent(cc.Label);
    if (countText) {
      countText.string = "持有 " + count;
    }
  }
  if (selectedBadge) {
    selectedBadge.active = isSelected;
  }
  if (addBadge) {
    addBadge.active = !isSelected && count > 0;
  }
  if (button) {
    button.interactable = count > 0 || isSelected;
  }

  cardNode.opacity = count > 0 ? 255 : 150;
  cardNode.color = isSelected ? cc.color(255, 255, 255) : cc.color(230, 218, 255);
};

InventoryViewController.prototype._setLabelText = function (nodeName, text) {
  var labelNode = findNodeByNameRecursive(this.node, nodeName);
  var label = labelNode ? labelNode.getComponent(cc.Label) : null;
  if (!label) {
    return;
  }

  label.string = String(text);
};

InventoryViewController.ITEM_DEFINITIONS = ITEM_DEFINITIONS.slice();
InventoryViewController.MAX_SELECTED_POWERUPS = MAX_SELECTED_POWERUPS;

module.exports = InventoryViewController;
