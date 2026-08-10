"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var PREFAB_PATH = path.join(PROJECT_ROOT, "assets", "spirit_system", "prefabs", "SpiritHallView.prefab");
var ADAPTER_PATH = path.join(PROJECT_ROOT, "assets", "spirit_system", "SpiritHallScreenAdapter.js");
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
  assert.ok(capturedDefinition, "SpiritHallScreenAdapter cc.Class definition must be captured.");
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
  safeAreaRoot.components[widgetClass] = {
    updateAlignment: function () {}
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
  var topBar = requireNodeByPath(logicLayer, ["TopBar"]);
  var heroShowcase = requireNodeByPath(logicLayer, ["HeroShowcase"]);
  var abilityDetails = requireNodeByPath(logicLayer, ["AbilityDetails"]);
  var bottomNavigationMount = requireNodeByPath(logicLayer, ["BottomNavigationMount"]);
  assert.ok(Math.abs(topBar.y - viewport.expectedHalfExtension) < 1e-8, name + " top extension");
  assert.ok(Math.abs(heroShowcase.y + viewport.expectedHalfExtension) < 1e-8, name + " hero showcase bottom extension");
  assert.ok(Math.abs(abilityDetails.y + viewport.expectedHalfExtension) < 1e-8, name + " ability details bottom extension");
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
  var sourceHero = requireNodeByPath(heroShowcase, ["source__hero_nameplate"]);
  var proxyHero = findNodeRecursive(rootNode, "proxy__hero_nameplate");
  assert.ok(proxyHero, name + " hero proxy");
  assert.ok(
    Math.abs(proxyHero.y - (sourceHero.y + heroShowcase.y)) < 1e-8,
    name + " hero proxy alignment"
  );
  var sourceAbility = requireNodeByPath(abilityDetails, ["source__ability_stats_panel"]);
  var proxyAbility = findNodeRecursive(rootNode, "proxy__ability_stats_panel");
  assert.ok(proxyAbility, name + " ability proxy");
  assert.ok(
    Math.abs(proxyAbility.y - (sourceAbility.y + abilityDetails.y)) < 1e-8,
    name + " ability proxy alignment"
  );

  var backgroundProxy = requireNodeByPath(rootNode, ["FullBleedBackgroundLayer", "proxy__background"]);
  assert.ok(Math.abs(backgroundProxy.scaleX - viewport.expectedBackgroundScale) < 1e-8, name + " background scale");
  assert.ok(Math.abs(backgroundProxy.y - viewport.expectedBackgroundY) < 1e-8, name + " background offset");
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
  expectedBackgroundScale: 1,
  expectedBackgroundY: 40
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
  expectedBackgroundScale: 1,
  expectedBackgroundY: 0
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
  expectedBackgroundScale: 1,
  expectedBackgroundY: 40
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
  expectedBackgroundScale: 1600 / 1560,
  expectedBackgroundY: 0
});

console.log("Spirit hall screen adapter validation passed: 4 viewport scenarios.");
