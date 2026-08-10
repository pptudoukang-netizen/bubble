"use strict";

var DESIGN_WIDTH = 720;
var DESIGN_HEIGHT = 1280;
var BACKGROUND_WIDTH = 720;
var BACKGROUND_HEIGHT = 1280;
var MAX_VERTICAL_EXTENSION = 280;
var TOP_SECTION_NAMES = ["TopBar"];
var BOTTOM_SECTION_NAMES = ["FragmentMarket", "CategoryMarket", "BottomNavigationMount"];
var TEXT_SECTION_NAMES = {
  TopBar: "TopBarText",
  FragmentMarket: "FragmentMarketText",
  CategoryMarket: "CategoryMarketText"
};

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function requireDirectChild(parentNode, childName) {
  requireValidNode(parentNode, "SpiritShopScreenAdapter parent node");
  var child = parentNode.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error("SpiritShopScreenAdapter node is missing: " + parentNode.name + "/" + childName);
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
  requireValidNode(rootNode, "SpiritShopScreenAdapter traversal root");
  if (Object.prototype.hasOwnProperty.call(result, rootNode.name)) {
    throw new Error("SpiritShopScreenAdapter duplicate node name: " + rootNode.name);
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
    this._rootWidget = requireComponent(this.node, cc.Widget, "SpiritShopView root Widget");
    this._safeAreaRoot = requireDirectChild(this.node, "SafeAreaRoot");
    this._safeAreaWidget = requireComponent(this._safeAreaRoot, cc.Widget, "SpiritShopView SafeAreaRoot Widget");
    this._safeArea = requireComponent(this._safeAreaRoot, cc.SafeArea, "SpiritShopView SafeAreaRoot SafeArea");
    this._designContent = requireDirectChild(this._safeAreaRoot, "DesignContent");
    this._spriteRenderLayer = requireDirectChild(this._designContent, "SpriteRenderLayer");
    this._textRenderLayer = requireDirectChild(this._designContent, "TextRenderLayer");
    this._logicLayer = requireDirectChild(this._designContent, "LogicLayer");
    this._backgroundRenderLayer = requireDirectChild(this.node, "FullBleedBackgroundLayer");
    this._backgroundProxy = requireDirectChild(this._backgroundRenderLayer, "proxy__background");
    this._fragmentOfferProxyViewport = requireDirectChild(
      this._spriteRenderLayer,
      "fragment_offer_proxy_viewport"
    );

    this._proxyNodesByName = {};
    collectNamedNodes(this._spriteRenderLayer, this._proxyNodesByName);

    this._sectionNodes = {};
    this._logicLayer.children.forEach(function (sectionNode) {
      if (Object.prototype.hasOwnProperty.call(this._sectionNodes, sectionNode.name)) {
        throw new Error("SpiritShopScreenAdapter duplicate logic section: " + sectionNode.name);
      }
      this._sectionNodes[sectionNode.name] = sectionNode;
    }, this);

    TOP_SECTION_NAMES.concat(BOTTOM_SECTION_NAMES).forEach(function (sectionName) {
      if (!Object.prototype.hasOwnProperty.call(this._sectionNodes, sectionName)) {
        throw new Error("SpiritShopScreenAdapter required logic section is missing: " + sectionName);
      }
    }, this);
    this._fragmentOfferScrollViewport = requireDirectChild(
      this._sectionNodes.FragmentMarket,
      "fragment_offer_scroll_viewport"
    );

    this._textSectionNodes = {};
    Object.keys(TEXT_SECTION_NAMES).forEach(function (sectionName) {
      var textSectionName = TEXT_SECTION_NAMES[sectionName];
      this._textSectionNodes[sectionName] = requireDirectChild(this._textRenderLayer, textSectionName);
    }, this);
  },

  _readViewportSignature: function () {
    if (!cc.view || typeof cc.view.getVisibleSize !== "function") {
      throw new Error("SpiritShopScreenAdapter requires cc.view.getVisibleSize.");
    }
    if (!cc.sys || typeof cc.sys.getSafeAreaRect !== "function") {
      throw new Error("SpiritShopScreenAdapter requires cc.sys.getSafeAreaRect.");
    }
    var visibleSize = requirePositiveSize(cc.view.getVisibleSize(), "SpiritShopScreenAdapter visible");
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
      throw new Error("SpiritShopScreenAdapter safe-area rectangle must be positive and finite.");
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
      throw new Error("SpiritShopScreenAdapter layout signature is required.");
    }

    this._rootWidget.updateAlignment();
    this._safeAreaWidget.updateAlignment();
    this._safeArea.updateArea();
    this._safeAreaWidget.updateAlignment();

    var rootSize = requirePositiveSize(this.node.getContentSize(), "SpiritShopView root");
    // SafeArea updates its Widget asynchronously on some devices.  Its node can
    // therefore still report the 720x1280 authored size in this frame even when
    // the actual safe area is taller.  The engine safe-area rectangle is the
    // authoritative runtime measurement for all vertical layout calculations.
    var safeRect = cc.sys.getSafeAreaRect();
    var safeSize = requirePositiveSize({
      width: safeRect.width,
      height: safeRect.height
    }, "SpiritShopView safe area");
    var contentScale = Math.min(
      1,
      safeSize.width / DESIGN_WIDTH,
      safeSize.height / DESIGN_HEIGHT
    );
    if (!Number.isFinite(contentScale) || contentScale <= 0) {
      throw new Error("SpiritShopScreenAdapter calculated an invalid content scale.");
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
      throw new Error("SpiritShopScreenAdapter calculated an invalid bottom screen offset.");
    }
    this._sectionNodes.BottomNavigationMount.setPosition(
      0,
      -bottomNavigationExtension - bottomScreenOffset
    );

    Object.keys(this._sectionNodes).forEach(function (sectionName) {
      this._syncSectionProxyPositions(this._sectionNodes[sectionName]);
    }, this);
    this._fragmentOfferProxyViewport.setPosition(
      this._sectionNodes.FragmentMarket.x + this._fragmentOfferScrollViewport.x,
      this._sectionNodes.FragmentMarket.y + this._fragmentOfferScrollViewport.y
    );
    Object.keys(this._textSectionNodes).forEach(function (sectionName) {
      this._textSectionNodes[sectionName].setPosition(0, this._sectionNodes[sectionName].y);
    }, this);

    var backgroundScale = Math.max(
      rootSize.width / BACKGROUND_WIDTH,
      rootSize.height / BACKGROUND_HEIGHT
    );
    if (!Number.isFinite(backgroundScale) || backgroundScale <= 0) {
      throw new Error("SpiritShopScreenAdapter calculated an invalid background scale.");
    }
    this._backgroundProxy.setScale(backgroundScale);
    this._backgroundProxy.setPosition(0, 0);

    this._layoutSignature = signature;
  },

  _syncSectionProxyPositions: function (sectionNode) {
    requireValidNode(sectionNode, "SpiritShopScreenAdapter logic section");
    sectionNode.children.forEach(function (sourceNode) {
      if (sourceNode.name.indexOf("source__") !== 0) {
        return;
      }
      var proxyName = "proxy__" + sourceNode.name.slice("source__".length);
      var proxyNode = this._proxyNodesByName[proxyName];
      if (!proxyNode || !proxyNode.isValid) {
        throw new Error("SpiritShopScreenAdapter proxy node is missing: " + proxyName);
      }
      proxyNode.setPosition(
        sectionNode.x + sourceNode.x,
        sectionNode.y + sourceNode.y
      );
    }, this);
  }
});
