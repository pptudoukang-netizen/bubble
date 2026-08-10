"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var PREFAB_PATH = path.join(PROJECT_ROOT, "assets", "spirit_system", "prefabs", "SpiritShopView.prefab");
var ADAPTER_PATH = path.join(PROJECT_ROOT, "assets", "spirit_system", "SpiritShopScreenAdapter.js");
var DESIGN_HEIGHT = 1280;
var TAB_BAR_Y = -595;
var TAB_BAR_HEIGHT = 90;

function createNode(serializedNode) {
  return {
    name: serializedNode._name,
    isValid: true,
    x: serializedNode._trs.array[0],
    y: serializedNode._trs.array[1],
    scaleX: serializedNode._trs.array[7],
    scaleY: serializedNode._trs.array[8],
    width: serializedNode._contentSize.width,
    height: serializedNode._contentSize.height,
    children: [],
    components: {},
    getChildByName: function (childName) {
      for (var index = 0; index < this.children.length; index += 1) {
        if (this.children[index].name === childName) {
          return this.children[index];
        }
      }
      return null;
    },
    getComponent: function (componentClass) {
      return this.components[componentClass];
    },
    getContentSize: function () {
      return {
        width: this.width,
        height: this.height
      };
    },
    setPosition: function (x, y) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      this.x = x;
      this.y = y;
    },
    setScale: function (scale) {
      assert.ok(Number.isFinite(scale) && scale > 0);
      this.scaleX = scale;
      this.scaleY = scale;
    }
  };
}

function createPrefabTree(objects) {
  var nodesByObjectId = {};
  objects.forEach(function (object, objectId) {
    if (object.__type__ === "cc.Node") {
      nodesByObjectId[objectId] = createNode(object);
    }
  });
  objects.forEach(function (object, objectId) {
    if (object.__type__ !== "cc.Node") {
      return;
    }
    var node = nodesByObjectId[objectId];
    object._children.forEach(function (childReference) {
      var childNode = nodesByObjectId[childReference.__id__];
      assert.ok(childNode, "Serialized child node must exist.");
      node.children.push(childNode);
    });
  });
  return nodesByObjectId[objects[0].data.__id__];
}

function requireNodeByPath(rootNode, pathSegments) {
  var current = rootNode;
  pathSegments.forEach(function (segment) {
    current = current.getChildByName(segment);
    assert.ok(current, "Missing node in validator path: " + pathSegments.join("/"));
  });
  return current;
}

function findNodeRecursive(rootNode, nodeName) {
  if (rootNode.name === nodeName) {
    return rootNode;
  }
  for (var index = 0; index < rootNode.children.length; index += 1) {
    var result = findNodeRecursive(rootNode.children[index], nodeName);
    if (result) {
      return result;
    }
  }
  return null;
}

function loadAdapterDefinition(runtimeState, widgetClass, safeAreaClass) {
  var capturedDefinition = null;
  var sandbox = {
    cc: {
      Component: function Component() {},
      Widget: widgetClass,
      SafeArea: safeAreaClass,
      Class: function (definition) {
        capturedDefinition = definition;
        return definition;
      },
      view: {
        getVisibleSize: function () {
          return {
            width: runtimeState.visibleWidth,
            height: runtimeState.visibleHeight
          };
        }
      },
      sys: {
        getSafeAreaRect: function () {
          return {
            x: runtimeState.safeX,
            y: runtimeState.safeY,
            width: runtimeState.safeWidth,
            height: runtimeState.safeHeight
          };
        }
      }
    },
    Number: Number,
    Object: Object,
    Math: Math,
    Error: Error
  };
  vm.runInNewContext(fs.readFileSync(ADAPTER_PATH, "utf8"), sandbox, {
    filename: ADAPTER_PATH
  });
  assert.ok(capturedDefinition, "SpiritShopScreenAdapter cc.Class definition must be captured.");
  return capturedDefinition;
}

function createAdapterInstance(definition, rootNode) {
  var instance = {
    node: rootNode
  };
  Object.keys(definition).forEach(function (key) {
    if (key !== "extends") {
      instance[key] = definition[key];
    }
  });
  return instance;
}

function runScenario(name, viewport) {
  var objects = JSON.parse(fs.readFileSync(PREFAB_PATH, "utf8"));
  var rootNode = createPrefabTree(objects);
  var widgetClass = "Widget";
  var safeAreaClass = "SafeArea";
  var safeAreaRoot = requireNodeByPath(rootNode, ["SafeAreaRoot"]);
  var designContent = requireNodeByPath(rootNode, ["SafeAreaRoot", "DesignContent"]);

  rootNode.width = viewport.visibleWidth;
  rootNode.height = viewport.visibleHeight;
  rootNode.components[widgetClass] = {
    updateAlignment: function () {}
  };
  var safeAreaWidgetAlignmentCount = 0;
  safeAreaRoot.components[widgetClass] = {
    updateAlignment: function () {
      safeAreaWidgetAlignmentCount += 1;
      if (viewport.keepAuthoredSafeAreaNodeSize && safeAreaWidgetAlignmentCount === 2) {
        safeAreaRoot.width = 720;
        safeAreaRoot.height = DESIGN_HEIGHT;
      }
    }
  };
  safeAreaRoot.components[safeAreaClass] = {
    updateArea: function () {
      safeAreaRoot.width = viewport.safeWidth;
      safeAreaRoot.height = viewport.safeHeight;
      safeAreaRoot.x = viewport.safeCenterX;
      safeAreaRoot.y = viewport.safeCenterY;
    }
  };

  var runtimeState = {
    visibleWidth: viewport.visibleWidth,
    visibleHeight: viewport.visibleHeight,
    safeX: viewport.safeX,
    safeY: viewport.safeY,
    safeWidth: viewport.safeWidth,
    safeHeight: viewport.safeHeight
  };
  var definition = loadAdapterDefinition(runtimeState, widgetClass, safeAreaClass);
  var instance = createAdapterInstance(definition, rootNode);
  instance.onLoad();

  assert.strictEqual(instance._layoutSignature, instance._readViewportSignature(), name + " signature");
  assert.ok(Math.abs(designContent.scaleX - viewport.expectedScale) < 1e-8, name + " content scale");
  assert.ok(Math.abs(designContent.scaleY - viewport.expectedScale) < 1e-8, name + " content scaleY");

  var logicLayer = requireNodeByPath(rootNode, ["SafeAreaRoot", "DesignContent", "LogicLayer"]);
  var textLayer = requireNodeByPath(rootNode, ["SafeAreaRoot", "DesignContent", "TextRenderLayer"]);
  var topBar = requireNodeByPath(logicLayer, ["TopBar"]);
  var fragmentMarket = requireNodeByPath(logicLayer, ["FragmentMarket"]);
  var categoryMarket = requireNodeByPath(logicLayer, ["CategoryMarket"]);
  var bottomNavigationMount = requireNodeByPath(logicLayer, ["BottomNavigationMount"]);
  var topBarText = requireNodeByPath(textLayer, ["TopBarText"]);
  var fragmentMarketText = requireNodeByPath(textLayer, ["FragmentMarketText"]);
  var categoryMarketText = requireNodeByPath(textLayer, ["CategoryMarketText"]);

  assert.ok(Math.abs(topBar.y - viewport.expectedHalfExtension) < 1e-8, name + " top extension");
  assert.ok(Math.abs(fragmentMarket.y + viewport.expectedHalfExtension) < 1e-8, name + " fragment extension");
  assert.ok(Math.abs(categoryMarket.y + viewport.expectedHalfExtension) < 1e-8, name + " category extension");
  assert.strictEqual(topBarText.y, topBar.y, name + " top text alignment");
  assert.strictEqual(fragmentMarketText.y, fragmentMarket.y, name + " fragment text alignment");
  assert.strictEqual(categoryMarketText.y, categoryMarket.y, name + " category text alignment");

  var expectedBottomNavigationExtension = Math.max(
    0,
    viewport.safeHeight / viewport.expectedScale - DESIGN_HEIGHT
  ) / 2;
  var expectedBottomNavigationY = -expectedBottomNavigationExtension - viewport.safeY / viewport.expectedScale;
  assert.ok(
    Math.abs(bottomNavigationMount.y - expectedBottomNavigationY) < 1e-8,
    name + " bottom screen offset"
  );
  var tabBarBottomY = safeAreaRoot.y + viewport.expectedScale * (
    bottomNavigationMount.y + TAB_BAR_Y - TAB_BAR_HEIGHT / 2
  );
  assert.ok(
    Math.abs(tabBarBottomY + viewport.visibleHeight / 2) < 1e-8,
    name + " tab bar bottom must align with screen bottom"
  );

  var sourceBack = requireNodeByPath(topBar, ["source__back_button"]);
  var proxyBack = findNodeRecursive(rootNode, "proxy__back_button");
  assert.ok(proxyBack, name + " back proxy");
  assert.ok(Math.abs(proxyBack.y - (sourceBack.y + topBar.y)) < 1e-8, name + " top proxy alignment");
  var sourceCategory = requireNodeByPath(categoryMarket, ["source__favor_panel"]);
  var proxyCategory = findNodeRecursive(rootNode, "proxy__favor_panel");
  assert.ok(proxyCategory, name + " category proxy");
  assert.ok(
    Math.abs(proxyCategory.y - (sourceCategory.y + categoryMarket.y)) < 1e-8,
    name + " category proxy alignment"
  );
  var sourceFragmentPanel = requireNodeByPath(fragmentMarket, ["source__fragment_market_panel"]);
  var proxyFragmentPanel = findNodeRecursive(rootNode, "proxy__fragment_market_panel");
  assert.ok(proxyFragmentPanel, name + " fragment panel proxy");
  assert.ok(
    Math.abs(proxyFragmentPanel.y - (sourceFragmentPanel.y + fragmentMarket.y)) < 1e-8,
    name + " fragment panel proxy alignment"
  );
  var sourceFragmentOffer = requireNodeByPath(fragmentMarket, ["fragment_offer_scroll_viewport"]);
  var proxyFragmentOffer = requireNodeByPath(rootNode, ["SafeAreaRoot", "DesignContent", "SpriteRenderLayer", "fragment_offer_proxy_viewport"]);
  assert.ok(
    Math.abs(proxyFragmentOffer.y - (sourceFragmentOffer.y + fragmentMarket.y)) < 1e-8,
    name + " fragment offer scroll proxy alignment"
  );

  var backgroundProxy = requireNodeByPath(rootNode, ["FullBleedBackgroundLayer", "proxy__background"]);
  assert.ok(Math.abs(backgroundProxy.scaleX - viewport.expectedBackgroundScale) < 1e-8, name + " background scale");
  assert.strictEqual(backgroundProxy.y, 0, name + " background center");
}

runScenario("baseline 16:9", {
  visibleWidth: 720,
  visibleHeight: 1280,
  safeX: 0,
  safeY: 0,
  safeWidth: 720,
  safeHeight: 1280,
  safeCenterX: 0,
  safeCenterY: 0,
  expectedScale: 1,
  expectedHalfExtension: 0,
  expectedBackgroundScale: 1
});

runScenario("tall 9:19.5", {
  visibleWidth: 720,
  visibleHeight: 1560,
  safeX: 0,
  safeY: 0,
  safeWidth: 720,
  safeHeight: 1560,
  safeCenterX: 0,
  safeCenterY: 0,
  expectedScale: 1,
  expectedHalfExtension: 140,
  expectedBackgroundScale: 1560 / 1280
});

runScenario("notched compact safe area", {
  visibleWidth: 720,
  visibleHeight: 1280,
  safeX: 20,
  safeY: 50,
  safeWidth: 680,
  safeHeight: 1180,
  safeCenterX: 0,
  safeCenterY: 0,
  expectedScale: 0.921875,
  expectedHalfExtension: 0,
  expectedBackgroundScale: 1
});

runScenario("extra tall 9:20", {
  visibleWidth: 720,
  visibleHeight: 1600,
  safeX: 0,
  safeY: 0,
  safeWidth: 720,
  safeHeight: 1600,
  safeCenterX: 0,
  safeCenterY: 0,
  expectedScale: 1,
  expectedHalfExtension: 140,
  expectedBackgroundScale: 1.25
});

runScenario("tall safe-area widget refresh lag", {
  visibleWidth: 720,
  visibleHeight: 1560,
  safeX: 0,
  safeY: 0,
  safeWidth: 720,
  safeHeight: 1560,
  safeCenterX: 0,
  safeCenterY: 0,
  keepAuthoredSafeAreaNodeSize: true,
  expectedScale: 1,
  expectedHalfExtension: 140,
  expectedBackgroundScale: 1560 / 1280
});

console.log("Spirit shop screen adapter validation passed: 5 viewport scenarios.");
