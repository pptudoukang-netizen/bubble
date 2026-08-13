"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var readGameplaySourceFamily = require("./read-gameplay-source-family").readGameplaySourceFamily;

var projectRoot = path.resolve(__dirname, "..");
var LightningChainRenderer = require(path.join(
  projectRoot,
  "gameplay-src",
  "render",
  "LightningChainRenderer"
));

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertThrowsMessage(callback, pattern) {
  assert.throws(callback, pattern);
}

function validateResources() {
  var atlasPath = path.join(
    projectRoot,
    "assets",
    "game",
    "image",
    "skill",
    "lightning",
    "AutoAtlas.pac"
  );
  assert.ok(fs.existsSync(atlasPath), "Lightning AutoAtlas.pac must exist.");
  var atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
  assert.strictEqual(atlas.__type__, "cc.SpriteAtlas", "Lightning assets must use cc.SpriteAtlas.");

  LightningChainRenderer.RESOURCE_PATHS.forEach(function (resourcePath) {
    assert.ok(
      resourcePath.indexOf("game/image/skill/lightning/") === 0,
      "Lightning resource must remain inside the game Bundle: " + resourcePath
    );
    var assetRelativePath = resourcePath.slice("game/".length) + ".png";
    var pngPath = path.join(projectRoot, "assets", "game", assetRelativePath);
    var metaPath = pngPath + ".meta";
    assert.ok(fs.existsSync(pngPath), "Missing lightning PNG: " + pngPath);
    assert.ok(fs.existsSync(metaPath), "Missing lightning PNG meta: " + metaPath);
    var meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    assert.strictEqual(meta.importer, "texture", "Lightning asset must import as texture: " + resourcePath);
    assert.strictEqual(meta.type, "sprite", "Lightning asset must import as sprite: " + resourcePath);
    assert.strictEqual(meta.packable, true, "Lightning asset must be packable: " + resourcePath);
  });
}

function validateGeometryAndContract() {
  var geometry = LightningChainRenderer.resolveSegmentGeometry(
    { x: 10, y: 20 },
    { x: 13, y: 24 },
    0
  );
  assert.strictEqual(geometry.x, 10);
  assert.strictEqual(geometry.y, 20);
  assert.strictEqual(geometry.width, 5);
  assert.strictEqual(geometry.height, 56);
  assert.ok(Math.abs(geometry.angle - 53.13010235415598) < 0.000001);

  var normalized = LightningChainRenderer.validatePlayConfig({
    chainId: "kelu-shot-18",
    hitPoints: [
      { id: "bubble-a", x: -80, y: 120 },
      { id: "bubble-b", x: 10, y: 170 },
      { id: "bubble-c", x: 96, y: 118 }
    ]
  });
  assert.deepStrictEqual(
    normalized.hitPoints.map(function (point) {
      return point.id;
    }),
    ["bubble-a", "bubble-b", "bubble-c"],
    "Lightning chain must preserve authoritative hit order."
  );

  assertThrowsMessage(function () {
    LightningChainRenderer.validatePlayConfig({
      chainId: "empty",
      hitPoints: []
    });
  }, /at least two hit points/);
  assertThrowsMessage(function () {
    LightningChainRenderer.validatePlayConfig({
      chainId: "single",
      hitPoints: [
        { id: "only", x: 10, y: 0 }
      ]
    });
  }, /at least two hit points/);
  assertThrowsMessage(function () {
    LightningChainRenderer.validatePlayConfig({
      chainId: "duplicate",
      hitPoints: [
        { id: "same", x: 10, y: 0 },
        { id: "same", x: 20, y: 0 }
      ]
    });
  }, /must be unique/);
  assertThrowsMessage(function () {
    LightningChainRenderer.validatePlayConfig({
      chainId: "zero-length",
      hitPoints: [
        { id: "same-position-a", x: 10, y: 10 },
        { id: "same-position-b", x: 10, y: 10 }
      ]
    });
  }, /length must be at least/);
}

function validateLevelRendererIntegration() {
  var levelRendererSource = readGameplaySourceFamily(
    projectRoot,
    "gameplay-src/render",
    "LevelRenderer"
  );
  [
    "new LightningChainRenderer()",
    "preloadLightningChainEffect",
    "playLightningChainEffect",
    "lightningChainRenderer.reset(\"render_level\")",
    "lightningChainRenderer.reset(\"hide_gameplay_layers\")",
    "lightningChainRenderer.reset(\"gameplay_bundle_unload\")",
    "BoardLayout.getCellPosition("
  ].forEach(function (requiredSource) {
    assert.ok(
      levelRendererSource.indexOf(requiredSource) >= 0,
      "LevelRenderer lightning integration is missing: " + requiredSource
    );
  });
  assert.strictEqual(
    levelRendererSource.indexOf("origin: config.origin"),
    -1,
    "Board lightning chain must start from the first authoritative hit point."
  );

  var assistRendererSource = readProjectFile("gameplay-src/render/LevelRendererAssistSpiritSkillMethods.js");
  assert.strictEqual(
    assistRendererSource.indexOf("Assist spirit lightning"),
    -1,
    "Assist spirit lightning must not inject the shooter origin."
  );
  var assistGameplaySource = readProjectFile("gameplay-src/core/GameManagerAssistSpiritSkillMethods.js");
  assert.strictEqual(
    assistGameplaySource.indexOf("plan.origin = clone(manager.systems.shooterController.origin)"),
    -1,
    "Authoritative lightning plan must contain targets only."
  );

  var scaffoldSource = readProjectFile("gameplay-src/render/LevelRendererSceneScaffoldMethods.js");
  assert.ok(
    scaffoldSource.indexOf("lightningChainRenderer.reset(\"level_select_return\")") >= 0,
    "Level select return must cancel an active lightning chain."
  );
}

function installCocosActionMock() {
  var createdNodeNames = [];
  function MockSprite() {
    this.spriteFrame = null;
    this.sizeMode = null;
  }
  MockSprite.SizeMode = {
    CUSTOM: "custom"
  };

  function executeAction(node, action) {
    if (action.kind === "sequence" || action.kind === "spawn") {
      action.actions.forEach(function (childAction) {
        executeAction(node, childAction);
      });
      return;
    }
    if (action.kind === "call") {
      action.callback();
      return;
    }
    if (action.kind === "fade") {
      node.opacity = action.opacity;
      return;
    }
    if (action.kind === "scale") {
      node.scale = action.scale;
      return;
    }
    if (action.kind === "rotate") {
      node.angle += action.angle;
    }
  }

  function MockNode(name) {
    createdNodeNames.push(name);
    this.name = name;
    this.children = [];
    this.isValid = true;
    this.active = true;
    this.opacity = 255;
    this.scale = 1;
    this.angle = 0;
    this.x = 0;
    this.y = 0;
    this.zIndex = 0;
    this._parent = null;
  }

  Object.defineProperty(MockNode.prototype, "parent", {
    get: function () {
      return this._parent;
    },
    set: function (parent) {
      if (this._parent) {
        var previousIndex = this._parent.children.indexOf(this);
        if (previousIndex >= 0) {
          this._parent.children.splice(previousIndex, 1);
        }
      }
      this._parent = parent;
      if (parent) {
        parent.children.push(this);
      }
    }
  });
  MockNode.prototype.setContentSize = function (width, height) {
    this.width = width;
    this.height = height;
  };
  MockNode.prototype.setPosition = function (x, y) {
    this.x = x;
    this.y = y;
  };
  MockNode.prototype.setScale = function (scale) {
    this.scale = scale;
  };
  MockNode.prototype.addComponent = function (ComponentType) {
    return new ComponentType();
  };
  MockNode.prototype.runAction = function (action) {
    executeAction(this, action);
  };
  MockNode.prototype.stopAllActions = function () {};
  MockNode.prototype.removeFromParent = function () {
    this.parent = null;
  };
  MockNode.prototype.destroy = function () {
    this.isValid = false;
    this.children.slice().forEach(function (child) {
      child.destroy();
    });
    this.children.length = 0;
  };

  global.cc = {
    Node: MockNode,
    Sprite: MockSprite,
    isValid: function (value) {
      return !!value && value.isValid !== false;
    },
    sequence: function () {
      return {
        kind: "sequence",
        actions: Array.prototype.slice.call(arguments)
      };
    },
    spawn: function () {
      return {
        kind: "spawn",
        actions: Array.prototype.slice.call(arguments)
      };
    },
    callFunc: function (callback) {
      return {
        kind: "call",
        callback: callback
      };
    },
    delayTime: function () {
      return {
        kind: "delay"
      };
    },
    fadeTo: function (duration, opacity) {
      return {
        kind: "fade",
        duration: duration,
        opacity: opacity
      };
    },
    scaleTo: function (duration, scale) {
      return {
        kind: "scale",
        duration: duration,
        scale: scale
      };
    },
    rotateBy: function (duration, angle) {
      return {
        kind: "rotate",
        duration: duration,
        angle: angle
      };
    }
  };
  return createdNodeNames;
}

function buildMockSpriteFrameCache() {
  var cache = {};
  LightningChainRenderer.RESOURCE_PATHS.forEach(function (resourcePath) {
    cache[resourcePath] = {
      isValid: true,
      resourcePath: resourcePath
    };
  });
  return cache;
}

async function validateRuntimePlayback() {
  var createdNodeNames = installCocosActionMock();
  var renderer = new LightningChainRenderer();
  var layer = new global.cc.Node("SkillFxLayer");
  var hitOrder = [];
  var result = await renderer.play(layer, buildMockSpriteFrameCache(), {
    chainId: "runtime-chain",
    hitPoints: [
      { id: "bubble-1", x: -50, y: 10 },
      { id: "bubble-2", x: 20, y: 70 },
      { id: "bubble-3", x: 86, y: 32 }
    ],
    onHit: function (hitPoint) {
      hitOrder.push(hitPoint.id);
    }
  });

  assert.deepStrictEqual(hitOrder, ["bubble-1", "bubble-2", "bubble-3"]);
  assert.deepStrictEqual(result.completedHitIds, hitOrder);
  assert.strictEqual(result.cancelled, false);
  assert.strictEqual(result.reason, "completed");
  assert.deepStrictEqual(
    createdNodeNames.filter(function (name) {
      return name.indexOf("LightningSegment_") === 0;
    }),
    ["LightningSegment_0", "LightningSegment_1"],
    "A-B-C must create exactly the A→B and B→C lightning segments."
  );
  assert.deepStrictEqual(
    createdNodeNames.filter(function (name) {
      return name.indexOf("LightningRing_") === 0;
    }),
    ["LightningRing_0", "LightningRing_1", "LightningRing_2"],
    "A-B-C must keep one centered impact presentation for every hit bubble."
  );
  assert.strictEqual(renderer.isPlaying(), false);
  assert.strictEqual(layer.children.length, 0, "Completed lightning chain must remove its render root.");
}

async function run() {
  validateResources();
  validateGeometryAndContract();
  validateLevelRendererIntegration();
  await validateRuntimePlayback();
  console.log("Lightning chain effect validation passed.");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
