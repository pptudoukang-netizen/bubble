"use strict";

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("GeniusTipsView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error("GeniusTipsView requires " + parentDescription + "/" + childName + ".");
  }
  return childNode;
}

function bindTapOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "GeniusTipsView tap callback");
  node[key + "Handler"] = onTap;
  if (node[key] === true) {
    return;
  }
  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("GeniusTipsView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function GeniusTipsViewController(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("GeniusTipsViewController options must be an object.");
  }
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "GeniusTipsViewController onClose");
  this._nodes = this._resolveNodes();
  this._bindActions();
}

GeniusTipsViewController.prototype._resolveNodes = function () {
  var panelNode = requireChildNode(this.node, "Panel", "GeniusTipsView");
  return {
    panelNode: panelNode,
    closeButton: requireChildNode(panelNode, "btn_close", "GeniusTipsView/Panel")
  };
};

GeniusTipsViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__geniusTipsCloseTapBound", function () {
    this.onClose();
  }.bind(this));
};

module.exports = GeniusTipsViewController;
