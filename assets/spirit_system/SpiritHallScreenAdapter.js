"use strict";

var DESIGN_WIDTH = 720;
var DESIGN_HEIGHT = 1280;
var BACKGROUND_WIDTH = 720;
var BACKGROUND_HEIGHT = 1560;
var BACKGROUND_BASE_OFFSET_Y = 40;
var MAX_VERTICAL_EXTENSION = BACKGROUND_HEIGHT - DESIGN_HEIGHT;
var TOP_SECTION_NAMES = ["TopBar", "CurrentSpiritCard"];
var BOTTOM_SECTION_NAMES = ["HeroShowcase", "AbilityDetails", "SpiritRoster", "GrowthActions", "BottomNavigationMount"];

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function requireDirectChild(parentNode, childName) {
  requireValidNode(parentNode, "SpiritHallScreenAdapter parent node");
  var child = parentNode.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error("SpiritHallScreenAdapter node is missing: " + parentNode.name + "/" + childName);
  }
  return child;
}

function requireComponent(node, componentClass, description) {
  requireValidNode(node, description + " node");
  var component = node.getComponent(componentClass);
  if (!component) {
    throw new Error(description + " component is required.");
  }
  return component;
}

function requirePositiveSize(size, description) {
  if (
    !size ||
    !Number.isFinite(size.width) ||
    size.width <= 0 ||
    !Number.isFinite(size.height) ||
    size.height <= 0
  ) {
    throw new Error(description + " size must be positive and finite.");
  }
  return size;
}

function collectNamedNodes(rootNode, result) {
  requireValidNode(rootNode, "SpiritHallScreenAdapter traversal root");
  if (Object.prototype.hasOwnProperty.call(result, rootNode.name)) {
    throw new Error("SpiritHallScreenAdapter duplicate node name: " + rootNode.name);
  }
  result[rootNode.name] = rootNode;
  rootNode.children.forEach(function (child) {
    collectNamedNodes(child, result);
  });
}

cc.Class({
  extends: cc.Component,

  onLoad: function () {
    this._layoutSignature = "";
    this._resolveStructure();
    this._applyLayout(this._readViewportSignature());
  },

  update: function () {
    var signature = this._readViewportSignature();
    if (signature !== this._layoutSignature) {
      this._applyLayout(signature);
    }
  },

  _resolveStructure: function () {
    this._rootWidget = requireComponent(this.node, cc.Widget, "SpiritHallView root Widget");
    this._safeAreaRoot = requireDirectChild(this.node, "SafeAreaRoot");
    this._safeAreaWidget = requireComponent(this._safeAreaRoot, cc.Widget, "SpiritHallView SafeAreaRoot Widget");
    this._safeArea = requireComponent(this._safeAreaRoot, cc.SafeArea, "SpiritHallView SafeAreaRoot SafeArea");
    this._designContent = requireDirectChild(this._safeAreaRoot, "DesignContent");
    this._spriteRenderLayer = requireDirectChild(this._designContent, "SpriteRenderLayer");
    this._logicLayer = requireDirectChild(this._designContent, "LogicLayer");
    this._backgroundRenderLayer = requireDirectChild(this.node, "FullBleedBackgroundLayer");
    this._backgroundProxy = requireDirectChild(this._backgroundRenderLayer, "proxy__background");

    this._proxyNodesByName = {};
    collectNamedNodes(this._spriteRenderLayer, this._proxyNodesByName);

    this._sectionNodes = {};
    this._logicLayer.children.forEach(function (sectionNode) {
      if (Object.prototype.hasOwnProperty.call(this._sectionNodes, sectionNode.name)) {
        throw new Error("SpiritHallScreenAdapter duplicate logic section: " + sectionNode.name);
      }
      this._sectionNodes[sectionNode.name] = sectionNode;
    }, this);

    TOP_SECTION_NAMES.concat(BOTTOM_SECTION_NAMES).forEach(function (sectionName) {
      if (!Object.prototype.hasOwnProperty.call(this._sectionNodes, sectionName)) {
        throw new Error("SpiritHallScreenAdapter required logic section is missing: " + sectionName);
      }
    }, this);
  },

  _readViewportSignature: function () {
    if (!cc.view || typeof cc.view.getVisibleSize !== "function") {
      throw new Error("SpiritHallScreenAdapter requires cc.view.getVisibleSize.");
    }
    if (!cc.sys || typeof cc.sys.getSafeAreaRect !== "function") {
      throw new Error("SpiritHallScreenAdapter requires cc.sys.getSafeAreaRect.");
    }
    var visibleSize = requirePositiveSize(cc.view.getVisibleSize(), "SpiritHallScreenAdapter visible");
    var safeRect = cc.sys.getSafeAreaRect();
    if (
      !safeRect ||
      !Number.isFinite(safeRect.x) ||
      !Number.isFinite(safeRect.y) ||
      !Number.isFinite(safeRect.width) ||
      safeRect.width <= 0 ||
      !Number.isFinite(safeRect.height) ||
      safeRect.height <= 0
    ) {
      throw new Error("SpiritHallScreenAdapter safe-area rectangle must be positive and finite.");
    }
    return [
      visibleSize.width,
      visibleSize.height,
      safeRect.x,
      safeRect.y,
      safeRect.width,
      safeRect.height
    ].join(":");
  },

  _applyLayout: function (signature) {
    if (typeof signature !== "string" || signature.length === 0) {
      throw new Error("SpiritHallScreenAdapter layout signature is required.");
    }

    this._rootWidget.updateAlignment();
    this._safeAreaWidget.updateAlignment();
    this._safeArea.updateArea();
    this._safeAreaWidget.updateAlignment();

    var rootSize = requirePositiveSize(this.node.getContentSize(), "SpiritHallView root");
    var safeRect = cc.sys.getSafeAreaRect();
    var safeSize = requirePositiveSize({
      width: safeRect.width,
      height: safeRect.height
    }, "SpiritHallView safe area");
    var contentScale = Math.min(
      1,
      safeSize.width / DESIGN_WIDTH,
      safeSize.height / DESIGN_HEIGHT
    );
    if (!Number.isFinite(contentScale) || contentScale <= 0) {
      throw new Error("SpiritHallScreenAdapter calculated an invalid content scale.");
    }

    this._designContent.setPosition(0, 0);
    this._designContent.setScale(contentScale);

    var visibleDesignHeight = safeSize.height / contentScale;
    var verticalExtension = Math.min(
      MAX_VERTICAL_EXTENSION,
      Math.max(0, visibleDesignHeight - DESIGN_HEIGHT)
    );
    var halfVerticalExtension = verticalExtension / 2;
    var bottomNavigationExtension = Math.max(
      0,
      visibleDesignHeight - DESIGN_HEIGHT
    ) / 2;

    TOP_SECTION_NAMES.forEach(function (sectionName) {
      this._sectionNodes[sectionName].setPosition(0, halfVerticalExtension);
    }, this);
    BOTTOM_SECTION_NAMES.forEach(function (sectionName) {
      this._sectionNodes[sectionName].setPosition(0, -halfVerticalExtension);
    }, this);
    var bottomScreenOffset = safeRect.y / contentScale;
    if (!Number.isFinite(bottomScreenOffset) || bottomScreenOffset < 0) {
      throw new Error("SpiritHallScreenAdapter calculated an invalid bottom screen offset.");
    }
    this._sectionNodes.BottomNavigationMount.setPosition(
      0,
      -bottomNavigationExtension - bottomScreenOffset
    );

    Object.keys(this._sectionNodes).forEach(function (sectionName) {
      this._syncSectionProxyPositions(this._sectionNodes[sectionName]);
    }, this);

    var backgroundScale = Math.max(
      rootSize.width / BACKGROUND_WIDTH,
      rootSize.height / BACKGROUND_HEIGHT
    );
    if (!Number.isFinite(backgroundScale) || backgroundScale <= 0) {
      throw new Error("SpiritHallScreenAdapter calculated an invalid background scale.");
    }
    var verticalBackgroundMargin = (
      BACKGROUND_HEIGHT * backgroundScale - rootSize.height
    ) / 2;
    var backgroundOffsetY = Math.min(
      BACKGROUND_BASE_OFFSET_Y * backgroundScale,
      verticalBackgroundMargin
    );
    this._backgroundProxy.setScale(backgroundScale);
    this._backgroundProxy.setPosition(0, backgroundOffsetY);

    this._layoutSignature = signature;
  },

  _syncSectionProxyPositions: function (sectionNode) {
    requireValidNode(sectionNode, "SpiritHallScreenAdapter logic section");
    sectionNode.children.forEach(function (sourceNode) {
      if (sourceNode.name.indexOf("source__") !== 0) {
        return;
      }
      var proxyName = "proxy__" + sourceNode.name.slice("source__".length);
      var proxyNode = this._proxyNodesByName[proxyName];
      if (!proxyNode || !proxyNode.isValid) {
        throw new Error("SpiritHallScreenAdapter proxy node is missing: " + proxyName);
      }
      proxyNode.setPosition(
        sectionNode.x + sourceNode.x,
        sectionNode.y + sourceNode.y
      );
    }, this);
  }
});
