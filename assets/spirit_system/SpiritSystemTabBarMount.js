"use strict";

var TAB_BAR_Y = -595;
var SELECTED_COLOR = cc.color(255, 236, 83, 255);
var NORMAL_COLOR = cc.color(255, 255, 255, 255);

function collectNamedNodes(rootNode, nodeMap) {
  if (!rootNode || !rootNode.isValid) {
    throw new Error("SpiritSystemTabBarMount traversal root is required.");
  }
  if (Object.prototype.hasOwnProperty.call(nodeMap, rootNode.name)) {
    throw new Error("SpiritSystemTabBar contains duplicate node name: " + rootNode.name);
  }
  nodeMap[rootNode.name] = rootNode;
  rootNode.children.forEach(function (childNode) {
    collectNamedNodes(childNode, nodeMap);
  });
}

function requireNamedNode(nodeMap, nodeName) {
  var node = nodeMap[nodeName];
  if (!node || !node.isValid) {
    throw new Error("SpiritSystemTabBar node is required: " + nodeName);
  }
  return node;
}

cc.Class({
  extends: cc.Component,

  properties: {
    tabBarPrefab: {
      default: null,
      type: cc.Prefab
    }
  },

  onLoad: function () {
    if (!this.tabBarPrefab || !cc.isValid(this.tabBarPrefab)) {
      throw new Error("SpiritSystemTabBarMount requires a valid SpiritSystemTabBar prefab.");
    }
    if (this.node.name !== "BottomNavigationMount") {
      throw new Error("SpiritSystemTabBarMount must be attached to BottomNavigationMount.");
    }
    if (this.node.children.length !== 0) {
      throw new Error("BottomNavigationMount must be empty before SpiritSystemTabBar instantiation.");
    }

    var tabBarNode = cc.instantiate(this.tabBarPrefab);
    if (!tabBarNode || !tabBarNode.isValid || tabBarNode.name !== "SpiritSystemTabBar") {
      throw new Error("Instantiate SpiritSystemTabBar failed.");
    }
    tabBarNode.parent = this.node;
    tabBarNode.setPosition(0, TAB_BAR_Y);
    var nodeMap = {};
    collectNamedNodes(tabBarNode, nodeMap);
    requireNamedNode(nodeMap, "hall_tab_label").color = NORMAL_COLOR;
    requireNamedNode(nodeMap, "shop_tab_label").color = SELECTED_COLOR;
    ["source__hall_tab", "proxy__hall_tab"].forEach(function (nodeName) {
      requireNamedNode(nodeMap, nodeName).setScale(0.82);
    });
    ["source__shop_tab", "proxy__shop_tab"].forEach(function (nodeName) {
      requireNamedNode(nodeMap, nodeName).setScale(1.22);
    });
    this._tabBarNode = tabBarNode;
  }
});
