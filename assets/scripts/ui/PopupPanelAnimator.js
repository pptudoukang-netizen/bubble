"use strict";

var PANEL_NODE_NAME = "Panel";
var INITIAL_SCALE = 0.2;
var OVERSHOOT_SCALE = 1.1;
var FINAL_SCALE = 1;
var OVERSHOOT_DURATION = 0.15;
var SETTLE_DURATION = 0.1;

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
    throw new Error("PopupPanelAnimator requires " + description + ".");
  }
  return node;
}

function play(panelOwnerNode, options) {
  var settings = options || {};
  var targetNodeName = settings.targetNodeName || PANEL_NODE_NAME;
  if (typeof targetNodeName !== "string" || !targetNodeName) {
    throw new Error("PopupPanelAnimator requires target node name.");
  }

  requireValidNode(panelOwnerNode, "valid popup root node");
  if (!cc || typeof cc.tween !== "function") {
    throw new Error("PopupPanelAnimator requires cc.tween.");
  }

  var panelNode = requireValidNode(
    findNodeByNameRecursive(panelOwnerNode, targetNodeName),
    targetNodeName
  );
  panelNode.stopAllActions();
  panelNode.scale = INITIAL_SCALE;
  cc.tween(panelNode)
    .to(OVERSHOOT_DURATION, { scale: OVERSHOOT_SCALE })
    .to(SETTLE_DURATION, { scale: FINAL_SCALE })
    .start();
  return panelNode;
}

module.exports = {
  play: play
};
