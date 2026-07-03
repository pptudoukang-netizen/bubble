"use strict";

var STAR_BREATHE_MIN_OPACITY = 120;
var STAR_BREATHE_MAX_OPACITY = 255;
var STAR_BREATHE_DURATION = 0.6;

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("SartTipsView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error("SartTipsView requires " + parentDescription + "/" + childName + ".");
  }
  return childNode;
}

function requireSlotPosition(position, index) {
  if (!position || typeof position !== "object" || Array.isArray(position)) {
    throw new Error("SartTipsView slot position[" + index + "] must be an object.");
  }
  if (typeof position.x !== "number" || !isFinite(position.x)) {
    throw new Error("SartTipsView slot position[" + index + "].x must be finite.");
  }
  if (typeof position.y !== "number" || !isFinite(position.y)) {
    throw new Error("SartTipsView slot position[" + index + "].y must be finite.");
  }
  return position;
}

function bindTapOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "SartTipsView tap callback");
  node[key + "Handler"] = onTap;
  if (node[key] === true) {
    return;
  }
  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("SartTipsView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function startStarOpacityBreathing(starNode) {
  requireValidNode(starNode, "star clone node");
  if (
    typeof cc.repeatForever !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.fadeTo !== "function"
  ) {
    throw new Error("SartTipsView star breathing requires Cocos action APIs.");
  }

  starNode.stopAllActions();
  starNode.opacity = STAR_BREATHE_MIN_OPACITY;
  starNode.runAction(cc.repeatForever(cc.sequence(
    cc.fadeTo(STAR_BREATHE_DURATION, STAR_BREATHE_MAX_OPACITY),
    cc.fadeTo(STAR_BREATHE_DURATION, STAR_BREATHE_MIN_OPACITY)
  )));
}

function SartTipsViewController(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("SartTipsViewController options must be an object.");
  }
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "SartTipsViewController onClose");
  this._clonedStarNodes = [];
  this._nodes = this._resolveNodes();
  this._bindActions();
}

SartTipsViewController.prototype._resolveNodes = function () {
  return {
    starTemplate: requireChildNode(this.node, "star", "SartTipsView")
  };
};

SartTipsViewController.prototype._bindActions = function () {
  bindTapOnce(this.node, "__sartTipsRootTapBound", function () {
    this.onClose();
  }.bind(this));
};

SartTipsViewController.prototype._clearClonedStars = function () {
  this._clonedStarNodes.forEach(function (cloneNode) {
    if (cloneNode && cloneNode.isValid) {
      cloneNode.stopAllActions();
      cloneNode.destroy();
    }
  });
  this._clonedStarNodes.length = 0;
};

SartTipsViewController.prototype.render = function (slotPositions) {
  if (!Array.isArray(slotPositions)) {
    throw new Error("SartTipsView render requires slotPositions array.");
  }
  if (slotPositions.length === 0) {
    throw new Error("SartTipsView render requires at least one slot position.");
  }

  this._clearClonedStars();
  this._nodes.starTemplate.active = false;

  slotPositions.forEach(function (position, index) {
    var safePosition = requireSlotPosition(position, index);
    var cloneNode = cc.instantiate(this._nodes.starTemplate);
    if (!cloneNode || !cloneNode.isValid) {
      throw new Error("SartTipsView failed to clone star template for slot[" + index + "].");
    }
    cloneNode.name = "star_clone_" + index;
    cloneNode.parent = this.node;
    cloneNode.setPosition(safePosition.x, safePosition.y);
    cloneNode.active = true;
    startStarOpacityBreathing(cloneNode);
    this._clonedStarNodes.push(cloneNode);
  }, this);
};

module.exports = SartTipsViewController;
