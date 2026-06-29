"use strict";

function requireChildNode(parentNode, childName, parentDescription) {
  if (!parentNode || !parentNode.isValid) {
    throw new Error(parentDescription + " is required.");
  }
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error(parentDescription + "/" + childName + " is required.");
  }
  return childNode;
}

function requireLabelComponent(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error(description + " requires cc.Label.");
  }
  return label;
}

function setRequiredLabelString(node, value, description) {
  var label = requireLabelComponent(node, description);
  label.string = String(value);
}

module.exports = {
  requireChildNode: requireChildNode,
  requireLabelComponent: requireLabelComponent,
  setRequiredLabelString: setRequiredLabelString
};
