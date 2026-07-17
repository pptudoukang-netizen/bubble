"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../gameplay-src/config/FairyAssistConfig");
var FairyAssistSystem = require("../gameplay-src/systems/FairyAssistSystem");
var FallingMarbleSystem = require("../gameplay-src/systems/FallingMarbleSystem");
var attachLevelRendererSceneJarMethods = require("../gameplay-src/render/LevelRendererSceneJarMethods");

function buildLevelConfig(maxDynamicMarbles) {
  return {
    level: {
      levelId: 1,
      jarCount: 0,
      jarColors: [],
      jarRules: {}
    },
    sharedDefaults: {
      fallingRules: {
        maxDynamicMarbles: maxDynamicMarbles,
        maxBounces: 2,
        gravity: 900,
        initialSpeedY: 220,
        horizontalSpeed: 190
      }
    }
  };
}

function buildGrid() {
  return {
    getCellPosition: function (row, col) {
      return {
        x: col * 10,
        y: row * 10
      };
    }
  };
}

function buildResolution(matchedCount, floatingCount) {
  return {
    matched: Array.from({ length: matchedCount }, function (_, index) {
      return {
        id: "matched_" + index,
        row: index,
        col: index
      };
    }),
    floating: Array.from({ length: floatingCount }, function (_, index) {
      return {
        id: "floating_" + index,
        row: index,
        col: index
      };
    })
  };
}

function resolveFairyCollisionProbeY(fairy) {
  return fairy.position.y + FairyAssistConfig.fairyCollisionRadius + BoardLayout.bubbleRadius - 1;
}

function buildDrop(id, fairy, splitGeneration) {
  var probeY = resolveFairyCollisionProbeY(fairy);
  return {
    id: id,
    sourceId: id,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null,
    splitColor: null,
    innerColor: null,
    iceSnowballAlreadyCollected: false,
    row: 0,
    col: 0,
    position: {
      x: fairy.position.x,
      y: probeY
    },
    velocity: { x: 0, y: -100 },
    remainingBounces: 2,
    rotation: 0,
    rotationSpeed: 100,
    jarCooldown: 0,
    startDelay: 0,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: fairy.position.x,
    lastStuckY: probeY,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    rootDropId: id,
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: splitGeneration
  };
}

function syncFairyCollisionCentersForTests(fairySystem) {
  fairySystem.syncCollisionCenters(readPrefabFairySlotCenters().map(function (slotCenter) {
    return {
      index: slotCenter.index,
      x: slotCenter.x,
      y: slotCenter.y
    };
  }));
}

function readGameViewPrefab() {
  var prefabPath = path.join(__dirname, "..", "assets", "game", "prefabs", "ui", "GameView.prefab");
  return JSON.parse(fs.readFileSync(prefabPath, "utf8"));
}

function readFairyAnimationBundleMeta() {
  var metaPath = path.join(__dirname, "..", "assets", "animation.meta");
  assert(fs.existsSync(metaPath), "Missing animation bundle meta.");
  return JSON.parse(fs.readFileSync(metaPath, "utf8"));
}

function findPrefabGeniusesIndex(prefab) {
  var geniusesIndex = prefab.findIndex(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "geniuses";
  });
  assert(geniusesIndex >= 0, "GameView requires geniuses node.");
  return geniusesIndex;
}

function findPrefabFairySlotNode(prefab, geniusesIndex, slotConfig) {
  var node = prefab.find(function (entry) {
    return entry &&
      entry.__type__ === "cc.Node" &&
      entry._name === slotConfig.nodeName &&
      entry._parent &&
      entry._parent.__id__ === geniusesIndex;
  });
  assert(node, "Missing GameView/geniuses/" + slotConfig.nodeName + ".");
  assert(node._trs && Array.isArray(node._trs.array), "Invalid transform for GameView/geniuses/" + slotConfig.nodeName + ".");
  assert.strictEqual(typeof node._trs.array[0], "number", "Invalid x for GameView/geniuses/" + slotConfig.nodeName + ".");
  assert.strictEqual(typeof node._trs.array[1], "number", "Invalid y for GameView/geniuses/" + slotConfig.nodeName + ".");
  return node;
}

function readPrefabFairySlotCenters() {
  var prefab = readGameViewPrefab();
  var geniusesIndex = findPrefabGeniusesIndex(prefab);
  return FairyAssistConfig.slots.map(function (slotConfig) {
    var node = findPrefabFairySlotNode(prefab, geniusesIndex, slotConfig);
    return {
      index: slotConfig.index,
      x: node._trs.array[0],
      y: node._trs.array[1]
    };
  });
}

function assertFairyAnimationPrefabContract(rule) {
  assert(rule && typeof rule.prefabPath === "string" && rule.prefabPath, "Fairy color rule requires prefabPath.");
  var relativePath = rule.prefabPath + ".prefab";
  var absolutePath = path.join(__dirname, "..", "assets", "animation", relativePath.replace(/\//g, path.sep));
  assert(fs.existsSync(absolutePath), "Missing fairy animation prefab: " + relativePath);
  assert(fs.existsSync(absolutePath + ".meta"), "Missing fairy animation prefab meta: " + relativePath);

  var prefab = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  var rootNode = prefab.find(function (entry) {
    return entry && entry.__type__ === "cc.Node";
  });
  assert(rootNode, "Fairy animation prefab requires root node: " + relativePath);
  assert(rootNode._contentSize && rootNode._contentSize.width > 0 && rootNode._contentSize.height > 0, "Fairy animation prefab requires positive size: " + relativePath);
  var animation = prefab.find(function (entry) {
    return entry && entry.__type__ === "cc.Animation";
  });
  assert(animation, "Fairy animation prefab requires cc.Animation: " + relativePath);
  assert(animation._defaultClip && animation._defaultClip.__uuid__, "Fairy animation prefab requires default clip: " + relativePath);
  assert(Array.isArray(animation._clips) && animation._clips.length > 0, "Fairy animation prefab requires clips: " + relativePath);
}

function getActiveFairies(fairySystem) {
  return fairySystem.snapshotForRender().slots.filter(function (slot) {
    return slot.fairy !== null;
  }).map(function (slot) {
    return slot.fairy;
  });
}

function findFairyByColor(fairySystem, color) {
  var matches = getActiveFairies(fairySystem).filter(function (fairy) {
    return fairy.color === color;
  });
  if (matches.length !== 1) {
    throw new Error("Expected exactly one active " + color + " fairy, found " + matches.length + ".");
  }
  return matches[0];
}

function findFairiesByColor(fairySystem, color) {
  return getActiveFairies(fairySystem).filter(function (fairy) {
    return fairy.color === color;
  });
}

function collectActiveColors(fairySystem) {
  return getActiveFairies(fairySystem).map(function (fairy) {
    return fairy.color;
  }).sort();
}

function createSystems(maxDynamicMarbles) {
  var levelConfig = buildLevelConfig(maxDynamicMarbles);
  var fairySystem = new FairyAssistSystem();
  fairySystem.configureLevel(levelConfig);
  syncFairyCollisionCentersForTests(fairySystem);
  var fallingSystem = new FallingMarbleSystem();
  fallingSystem.attachFairyAssistSystem(fairySystem);
  fallingSystem.configureLevel(levelConfig);
  return {
    fairy: fairySystem,
    falling: fallingSystem
  };
}

function createSystemsWithJar(maxDynamicMarbles) {
  var levelConfig = buildLevelConfig(maxDynamicMarbles);
  levelConfig.level.jarCount = 1;
  levelConfig.level.jarColors = ["R"];
  var fairySystem = new FairyAssistSystem();
  fairySystem.configureLevel(levelConfig);
  syncFairyCollisionCentersForTests(fairySystem);
  var fallingSystem = new FallingMarbleSystem();
  fallingSystem.attachFairyAssistSystem(fairySystem);
  fallingSystem.configureLevel(levelConfig);
  return {
    fairy: fairySystem,
    falling: fallingSystem
  };
}

function testPrefabAndAssetContract() {
  var prefab = readGameViewPrefab();
  var geniusesIndex = findPrefabGeniusesIndex(prefab);
  var geniuses = prefab[geniusesIndex];
  assert.strictEqual(geniuses._children.length, 6);

  FairyAssistConfig.slots.forEach(function (slotConfig) {
    findPrefabFairySlotNode(prefab, geniusesIndex, slotConfig);
  });

  var animationMeta = readFairyAnimationBundleMeta();
  assert.strictEqual(animationMeta.isBundle, true, "assets/animation must be a bundle.");
  assert(animationMeta.compressionType && animationMeta.compressionType.wechatgame === "subpackage", "assets/animation must build as WeChat subpackage.");
  FairyAssistConfig.colorRules.forEach(function (rule) {
    assertFairyAnimationPrefabContract(rule);
  });
}

function testJarOcclusionCopiesRenderedJarTransform() {
  var previousCc = global.cc;
  function MockNode(name) {
    this.name = name;
    this.isValid = true;
    this.children = [];
    this.x = 0;
    this.y = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.zIndex = 0;
    Object.defineProperty(this, "parent", {
      set: function (parent) {
        this._parent = parent;
        parent.children.push(this);
      }
    });
  }
  MockNode.prototype.setPosition = function (x, y) {
    this.x = x;
    this.y = y;
  };
  MockNode.prototype.setScale = function (scaleX, scaleY) {
    this.scaleX = scaleX;
    this.scaleY = scaleY;
  };
  MockNode.prototype.setContentSize = function (size) {
    this.contentSize = size;
  };

  global.cc = { Node: MockNode };
  try {
    function TestRenderer() {}
    attachLevelRendererSceneJarMethods(TestRenderer, {
      BoardLayout: BoardLayout,
      JAR_MASK_RESOURCES: { R: "jar/red_mask" },
      JAR_RENDER_SIZE: { width: 237, height: 230 },
      clearChildren: function (layer) {
        layer.children.length = 0;
      },
      ensureSprite: function () {
        return foregroundSprite;
      }
    });

    var renderedJar = {
      isValid: true,
      x: -284.8,
      y: -605,
      scaleX: 0.627,
      scaleY: 0.627,
      zIndex: 0
    };
    var jarLayer = {
      isValid: true,
      getChildByName: function (name) {
        assert.strictEqual(name, "BottomJar_0");
        return renderedJar;
      }
    };
    var occlusionLayer = { isValid: true, children: [] };
    var foregroundSprite = { trim: true };
    var renderer = new TestRenderer();
    renderer.layers = { jars: jarLayer, jarOcclusion: occlusionLayer };
    renderer.spriteFrameCache = { "jar/red_mask": { isValid: true } };

    renderer._renderJarOcclusionLayer(["R"]);
    assert.strictEqual(occlusionLayer.children.length, 1);
    var foreground = occlusionLayer.children[0];
    assert.strictEqual(foreground.x, renderedJar.x);
    assert.strictEqual(foreground.y, renderedJar.y);
    assert.strictEqual(foreground.scaleX, renderedJar.scaleX);
    assert.strictEqual(foreground.scaleY, renderedJar.scaleY);
    assert.strictEqual(foreground.zIndex, renderedJar.zIndex);
    assert.strictEqual(foregroundSprite.trim, false);
  } finally {
    if (typeof previousCc === "undefined") {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function testRandomEmptySlotSelection() {
  var systems = createSystems(20);
  var grid = buildGrid();
  var usedSlotIndexes = {};
  for (var attempt = 0; attempt < 48; attempt += 1) {
    systems.fairy.configureLevel(buildLevelConfig(20));
    syncFairyCollisionCentersForTests(systems.fairy);
    systems.fairy.resolveAfterShot(buildResolution(1, 0), grid);
    var fairy = findFairyByColor(systems.fairy, "red");
    usedSlotIndexes[fairy.slotIndex] = true;
  }
  assert(Object.keys(usedSlotIndexes).length > 1, "Fairy spawn must pick among empty slots randomly.");
}

function testSpawnRules() {
  var systems = createSystems(20);
  var grid = buildGrid();
  systems.fairy.resolveAfterShot(buildResolution(1, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  assert.deepStrictEqual(collectActiveColors(systems.fairy), ["green", "red", "yellow"]);

  var floatingResolutionEvents = systems.fairy.resolveAfterShot(buildResolution(10, 1), grid);
  assert.strictEqual(floatingResolutionEvents.length, 1);
  assert.strictEqual(floatingResolutionEvents[0].type, "spawn");
  assert.strictEqual(floatingResolutionEvents[0].color, "green");
  assert.deepStrictEqual(collectActiveColors(systems.fairy), ["green", "green", "red", "yellow"]);

  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  assert.deepStrictEqual(collectActiveColors(systems.fairy), ["red", "yellow"]);
  assert.strictEqual(getActiveFairies(systems.fairy).length, 2);
}

function testMissRemovalPriority() {
  var systems = createSystems(20);
  var grid = buildGrid();
  systems.fairy.resolveAfterShot(buildResolution(1, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  assert.deepStrictEqual(collectActiveColors(systems.fairy), ["red"]);
  assert.strictEqual(getActiveFairies(systems.fairy).length, 1);

  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  assert.deepStrictEqual(collectActiveColors(systems.fairy), ["red"]);
  assert.strictEqual(getActiveFairies(systems.fairy).length, 1);
}

function testReplacementPriority() {
  var systems = createSystems(20);
  var grid = buildGrid();
  [1, 6, 10, 1, 6, 10].forEach(function (matchedCount) {
    systems.fairy.resolveAfterShot(buildResolution(matchedCount, 0), grid);
  });
  var oldestRed = findFairiesByColor(systems.fairy, "red").reduce(function (oldest, fairy) {
    return !oldest || fairy.enteredAt < oldest.enteredAt ? fairy : oldest;
  }, null);
  assert(oldestRed, "replacement priority test requires at least one red fairy.");
  var replacedSlotIndex = oldestRed.slotIndex;
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  var slots = systems.fairy.snapshotForRender().slots;
  assert.strictEqual(slots[replacedSlotIndex].fairy.color, "yellow");
  assert.strictEqual(findFairiesByColor(systems.fairy, "red").length, 1);
  assert.strictEqual(findFairiesByColor(systems.fairy, "yellow").length, 3);
  assert.strictEqual(findFairiesByColor(systems.fairy, "green").length, 2);
}

function testGreenSplitAndCollisionDedupe() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), buildGrid());
  var greenFairy = findFairyByColor(systems.fairy, "green");
  systems.falling.activeDrops = [buildDrop("green_root", greenFairy, 0)];

  var update = systems.falling.update(0.01);
  assert.strictEqual(update.fairyHits.length, 1);
  assert.strictEqual(update.splits.length, 1);
  assert.strictEqual(systems.falling.activeDrops.length, 2);
  systems.falling.activeDrops.forEach(function (drop) {
    assert.strictEqual(drop.finalMultiplier, 4);
    assert.strictEqual(drop.splitGeneration, 1);
    assert.deepStrictEqual(drop.hitFairyIds, [greenFairy.id]);
  });

  var child = systems.falling.activeDrops[0];
  child.position.x = greenFairy.position.x;
  child.position.y = resolveFairyCollisionProbeY(greenFairy);
  child.velocity.x = 0;
  child.velocity.y = -100;
  var repeatUpdate = systems.falling.update(0.01);
  assert.strictEqual(repeatUpdate.splits.length, 0);
  assert.strictEqual(repeatUpdate.fairyHits.length, 1);
  assert.strictEqual(child.finalMultiplier, 7);
  assert.deepStrictEqual(child.hitFairyIds, [greenFairy.id, greenFairy.id]);
}

function testMaxCollisionsPerFairyCap() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var redFairy = findFairyByColor(systems.fairy, "red");
  var drop = buildDrop("red_repeat", redFairy, 1);
  systems.falling.activeDrops = [drop];

  for (var hitIndex = 0; hitIndex < FairyAssistConfig.maxCollisionsPerFairy; hitIndex += 1) {
    drop.position.x = redFairy.position.x;
    drop.position.y = resolveFairyCollisionProbeY(redFairy);
    drop.velocity.x = 0;
    drop.velocity.y = -100;
    var update = systems.falling.update(0.01);
    assert.strictEqual(update.fairyHits.length, 1, "fairy hit " + (hitIndex + 1));
    assert.strictEqual(drop.hitFairyIds.length, hitIndex + 1);
    assert.strictEqual(drop.fairyBonusSteps, hitIndex + 1);
    assert.strictEqual(drop.finalMultiplier, hitIndex + 2);
  }

  drop.position.x = redFairy.position.x;
  drop.position.y = resolveFairyCollisionProbeY(redFairy);
  drop.velocity.x = 0;
  drop.velocity.y = -100;
  var cappedUpdate = systems.falling.update(0.01);
  assert.strictEqual(cappedUpdate.fairyHits.length, 0);
  assert.strictEqual(drop.hitFairyIds.length, FairyAssistConfig.maxCollisionsPerFairy);
  assert.strictEqual(drop.fairyBonusSteps, FairyAssistConfig.maxCollisionsPerFairy);
  assert.strictEqual(drop.finalMultiplier, FairyAssistConfig.maxCollisionsPerFairy + 1);
}

function testDropGlowStacksCap() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var redFairy = findFairyByColor(systems.fairy, "red");
  var drop = buildDrop("red_glow", redFairy, 1);
  systems.falling.activeDrops = [drop];

  for (var hitIndex = 0; hitIndex < FairyAssistConfig.maxGlowStacks + 2; hitIndex += 1) {
    drop.position.x = redFairy.position.x;
    drop.position.y = resolveFairyCollisionProbeY(redFairy);
    drop.velocity.x = 0;
    drop.velocity.y = -100;
    var update = systems.falling.update(0.01);
    assert.strictEqual(update.fairyHits.length, hitIndex < FairyAssistConfig.maxCollisionsPerFairy ? 1 : 0);
    assert.strictEqual(redFairy.glowStacks, 0);
    assert.strictEqual(
      drop.glowStacks,
      Math.min(hitIndex + 1, FairyAssistConfig.maxGlowStacks, FairyAssistConfig.maxCollisionsPerFairy)
    );
  }
}

function testCollisionDiameterContract() {
  var combinedCollisionDistance = FairyAssistConfig.fairyCollisionRadius + BoardLayout.bubbleRadius;
  var outsideSystems = createSystems(20);
  outsideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var outsideFairy = findFairyByColor(outsideSystems.fairy, "red");
  var outsideDrop = buildDrop("outside_drop", outsideFairy, 1);
  outsideDrop.position.y = outsideFairy.position.y + combinedCollisionDistance + 1;
  outsideDrop.velocity.y = 0;
  outsideSystems.falling.activeDrops = [outsideDrop];
  assert.strictEqual(outsideSystems.falling.update(0.001).fairyHits.length, 0);

  var insideSystems = createSystems(20);
  insideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var insideFairy = findFairyByColor(insideSystems.fairy, "red");
  var insideDrop = buildDrop("inside_drop", insideFairy, 1);
  insideDrop.position.y = insideFairy.position.y + combinedCollisionDistance - 1;
  insideDrop.velocity.y = 0;
  insideSystems.falling.activeDrops = [insideDrop];
  assert.strictEqual(insideSystems.falling.update(0.001).fairyHits.length, 1);
}

function testGreenSplitCapacityFailure() {
  var systems = createSystems(1);
  systems.falling.maxDynamicMarbles = 1;
  systems.fairy.resolveAfterShot(buildResolution(10, 0), buildGrid());
  var greenFairy = findFairyByColor(systems.fairy, "green");
  systems.falling.activeDrops = [buildDrop("capacity_root", greenFairy, 0)];
  assert.throws(function () {
    systems.falling.update(0.01);
  }, /exceeds maxDynamicMarbles/);
}

function testDeferredDropCapacity() {
  var systems = createSystems(3);
  var grid = buildGrid();
  var cells = Array.from({ length: 5 }, function (_, index) {
    return {
      id: "deferred_cell_" + index,
      row: index,
      col: index,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    };
  });
  systems.falling.registerDrops(cells, grid);
  assert.strictEqual(systems.falling._countActiveDrops(), 5);
  assert.strictEqual(systems.falling.deferredDrops.length, 0);
  assert.strictEqual(systems.falling.hasActiveDrops(), true);
}

function testDeferredDropActivationFallsDownward() {
  var systems = createSystems(2);
  var grid = buildGrid();
  var drop = systems.falling._buildDropFromCell({
    id: "deferred_manual",
    row: 4,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  }, 0, grid, 0, null);
  assert.ok(drop.velocity.y < 0, "fresh drop must start falling downward.");
  systems.falling._prepareDeferredDropForActivation(drop, 0);
  assert.ok(drop.velocity.y < 0, "prepared deferred drop must fall downward instead of popping upward.");
}

function testInJarDropsDoNotBlockDeferredFlush() {
  var systems = createSystemsWithJar(2);
  systems.falling.maxDynamicMarbles = 2;
  var zone = systems.falling.jarZones[0];
  assert(zone, "in-jar deferred flush test requires jar zone.");
  var grid = buildGrid();
  var cells = [
    { id: "jar_block_a", row: 0, col: 0, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "jar_block_b", row: 0, col: 1, color: "R", entityCategory: "normal_ball", entityType: null }
  ];
  systems.falling.registerDrops(cells, grid);
  assert.strictEqual(systems.falling.deferredDrops.length, 0);

  var queuedDrop = systems.falling._buildDropFromCell({
    id: "jar_block_c",
    row: 1,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  }, 0, grid, 0, null);
  systems.falling.deferredDrops.push(queuedDrop);

  systems.falling.activeDrops.forEach(function (drop) {
    drop.inJar = true;
    drop.jarIndex = zone.index;
    drop.jarColor = zone.color;
    drop.velocity.x = 0;
    drop.velocity.y = -120;
  });
  assert.strictEqual(systems.falling._countActiveDrops(), 0);

  systems.falling._flushDeferredDrops();
  assert.strictEqual(systems.falling.deferredDrops.length, 0);
  assert.strictEqual(systems.falling._countActiveDrops(), 1);
  assert.ok(systems.falling.activeDrops[2].velocity.y < 0, "deferred drop flushed while others sink must fall downward.");
}

function testUnsupportedDropStartsFallingDownward() {
  var systems = createSystems(5);
  var grid = buildGrid();
  var cell = {
    id: "fall_down",
    row: 2,
    col: 2,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  systems.falling.registerDrops([cell], grid);
  assert.strictEqual(systems.falling.activeDrops.length, 1);
  assert.ok(systems.falling.activeDrops[0].velocity.y < 0, "unsupported drop must start with downward velocity.");
}

function testDropLaunchUsesDownwardAngleCone() {
  var systems = createSystems(5);
  var grid = buildGrid();
  for (var index = 0; index < 24; index += 1) {
    var cell = {
      id: "launch_angle_" + index,
      row: index % 4,
      col: index % 5,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    };
    var drop = systems.falling._buildDropFromCell(cell, index, grid, 0, null);
    assert.ok(drop.velocity.y < 0, "launch velocity must point downward.");
    var angleDeg = Math.atan2(-drop.velocity.y, drop.velocity.x) * 180 / Math.PI;
    assert.ok(
      angleDeg >= 15 - 0.01 && angleDeg <= 165 + 0.01,
      "launch angle out of range: " + angleDeg
    );
    assert.ok(
      angleDeg <= 75 + 0.01 || angleDeg >= 105 - 0.01,
      "launch angle must avoid vertical down: " + angleDeg
    );
  }
}

function testVictoryBoardDropLaunchesDownward() {
  var systems = createSystems(50);
  var grid = buildGrid();
  var cells = Array.from({ length: 40 }, function (_, index) {
    return {
      id: "victory_board_cell_" + index,
      row: index,
      col: index % 8,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    };
  });
  var minHorizontalRatio = Math.sin(15 * Math.PI / 180) * 0.99;

  systems.falling.registerDrops(cells, grid, { dropKind: "victory_board_drop" });
  assert.strictEqual(systems.falling.activeDrops.length, cells.length);
  systems.falling.activeDrops.forEach(function (drop) {
    assert.strictEqual(drop.dropKind, "victory_board_drop");
    assert.ok(drop.velocity.y <= 0, "victory board drop must not launch upward");
    var speed = Math.sqrt(drop.velocity.x * drop.velocity.x + drop.velocity.y * drop.velocity.y);
    assert.ok(speed > 0, "victory board drop must launch with positive speed.");
    assert.ok(
      Math.abs(drop.velocity.x) >= speed * minHorizontalRatio,
      "victory board drop must launch with horizontal speed: " + drop.velocity.x
    );
  });
}

function testDeferredVictoryDropActivationKeepsHorizontalSpeed() {
  var systems = createSystems(2);
  systems.falling.maxDynamicMarbles = 2;
  var grid = buildGrid();
  var cells = [
    { id: "victory_deferred_a", row: 0, col: 0, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "victory_deferred_b", row: 0, col: 1, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "victory_deferred_c", row: 1, col: 0, color: "R", entityCategory: "normal_ball", entityType: null }
  ];
  var minHorizontalRatio = Math.sin(15 * Math.PI / 180) * 0.99;

  systems.falling.registerDrops(cells, grid, { dropKind: "victory_board_drop" });
  assert.strictEqual(systems.falling._countActiveDrops(), 2);
  assert.strictEqual(systems.falling.deferredDrops.length, 1);

  systems.falling.activeDrops.forEach(function (drop) {
    drop.inJar = true;
    drop.jarIndex = 0;
  });
  assert.strictEqual(systems.falling._countActiveDrops(), 0);

  systems.falling._flushDeferredDrops();
  assert.strictEqual(systems.falling.deferredDrops.length, 0);
  assert.strictEqual(systems.falling._countActiveDrops(), 1);

  var deferredDrop = systems.falling.activeDrops[systems.falling.activeDrops.length - 1];
  var speed = Math.sqrt(deferredDrop.velocity.x * deferredDrop.velocity.x + deferredDrop.velocity.y * deferredDrop.velocity.y);
  assert.ok(deferredDrop.velocity.y < 0, "deferred victory drop must fall downward.");
  assert.ok(
    Math.abs(deferredDrop.velocity.x) >= speed * minHorizontalRatio,
    "deferred victory drop must launch with horizontal speed: " + deferredDrop.velocity.x
  );
}

function testVictoryBoardDropIgnoresFairyBounce() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var fairy = findFairyByColor(systems.fairy, "red");
  var grid = {
    getCellPosition: function () {
      return {
        x: fairy.position.x,
        y: resolveFairyCollisionProbeY(fairy)
      };
    }
  };
  var cell = {
    id: "victory_board_fairy_collision",
    row: 0,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };

  systems.falling.registerDrops([cell], grid, { dropKind: "victory_board_drop" });
  systems.falling.update(0.01);
  var drop = systems.falling.activeDrops[0];
  assert(drop, "victory board drop should remain active after first update.");
  assert.strictEqual(drop.fairyBonusSteps, 0);
  assert.deepStrictEqual(drop.hitFairyIds, []);
  assert.ok(drop.velocity.y < 0, "victory board drop must keep falling through fairies.");
}

function testVictoryBoardDropRimBounces() {
  var systems = createSystemsWithJar(5);
  var zone = systems.falling.jarZones[0];
  assert(zone, "victory board rim test requires jar zone.");
  var grid = {
    getCellPosition: function () {
      return {
        x: zone.x + zone.innerHalfWidth + zone.edgeThickness * 0.5,
        y: zone.mouthY + BoardLayout.bubbleRadius
      };
    }
  };
  var cell = {
    id: "victory_board_rim",
    row: 0,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };

  systems.falling.registerDrops([cell], grid, { dropKind: "victory_board_drop" });
  systems.falling.activeDrops[0].glowStacks = FairyAssistConfig.maxGlowStacks;
  var update = systems.falling.update(0.01);
  var drop = systems.falling.activeDrops[0];
  assert(drop, "victory board rim drop should remain active after rim bounce.");
  assert.strictEqual(drop.inJar, false);
  assert.strictEqual(drop.jarIndex, -1);
  assert.strictEqual(systems.falling.lastBounceCount, 1);
  assert.strictEqual(update.bounceEvents.length, 1);
  assert.strictEqual(update.bounceEvents[0].glowStacks, FairyAssistConfig.maxGlowStacks);
  assert.ok(drop.velocity.y > 0, "victory board rim drop must bounce upward off jar rim.");
}

function testFinalJarRimContactEmitsBounceEvent() {
  var systems = createSystemsWithJar(5);
  var zone = systems.falling.jarZones[0];
  assert(zone, "final rim contact test requires jar zone.");
  var grid = {
    getCellPosition: function () {
      return {
        x: zone.x + zone.innerHalfWidth + zone.edgeThickness * 0.5,
        y: zone.mouthY + BoardLayout.bubbleRadius
      };
    }
  };
  var cell = {
    id: "final_rim_contact",
    row: 0,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };

  systems.falling.registerDrops([cell], grid);
  var drop = systems.falling.activeDrops[0];
  drop.rimBounceCount = systems.falling.maxRimBounces;
  drop.glowStacks = 2;
  var update = systems.falling.update(0.01);

  assert(drop, "final rim contact drop should remain active while sinking into jar.");
  assert.strictEqual(drop.inJar, true);
  assert.strictEqual(drop.jarIndex, zone.index);
  assert.strictEqual(update.bounceEvents.length, 1);
  assert.strictEqual(update.bounceEvents[0].bounceCount, systems.falling.maxRimBounces + 1);
  assert.strictEqual(update.bounceEvents[0].glowStacks, 2);
  assert.strictEqual(systems.falling.lastBounceCount, 1);
}

function testVictoryBoardDropSkipsWallBounce() {
  var systems = createSystems(5);
  var leftLimit = systems.falling._dropLeftLimit;
  var drop = {
    id: "victory_board_wall",
    sourceId: "victory_board_wall",
    color: "R",
    entityCategory: "normal_ball",
    entityType: null,
    row: 0,
    col: 0,
    position: { x: leftLimit - 4, y: 0 },
    velocity: { x: -120, y: -80 },
    remainingBounces: 2,
    rotation: 0,
    rotationSpeed: 0,
    jarCooldown: 0,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: leftLimit - 4,
    lastStuckY: 0,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    dropKind: "victory_board_drop",
    rootDropId: "victory_board_wall",
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
  systems.falling.activeDrops = [drop];
  systems.falling.update(0.01);
  assert.strictEqual(systems.falling.lastBounceCount, 0);
  assert.strictEqual(drop.remainingBounces, 2);
  assert.ok(drop.velocity.x > 0, "victory board drop must get horizontal escape from side wall.");
  assert.ok(drop.velocity.y <= 0, "victory board drop must not gain upward speed from wall bounce.");
  assert.ok(drop.position.x >= leftLimit, "victory board drop must clamp to wall without rebound.");
}

function buildSideWallDrop(id, x, velocityX, remainingBounces) {
  return {
    id: id,
    sourceId: id,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null,
    row: 0,
    col: 0,
    position: { x: x, y: 0 },
    velocity: { x: velocityX, y: -100 },
    remainingBounces: remainingBounces,
    rotation: 0,
    rotationSpeed: 0,
    jarCooldown: 0,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: x,
    lastStuckY: 0,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    dropKind: null,
    rootDropId: id,
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
}

function testSideWallBounceKeepsHorizontalEscapeVelocity() {
  var systems = createSystems(5);
  var minEscapeSpeed = systems.falling.horizontalSpeed * 0.45;
  var leftDrop = buildSideWallDrop("left_wall_escape", systems.falling._dropLeftLimit - 2, -1, 2);
  systems.falling.activeDrops = [leftDrop];
  systems.falling.update(0.01);
  assert.ok(leftDrop.velocity.x >= minEscapeSpeed, "left wall bounce must push drop back into screen.");
  assert.ok(leftDrop.velocity.y > 0, "side wall bounce with remaining bounces must lift the drop.");
  assert.strictEqual(leftDrop.remainingBounces, 1);

  var rightDrop = buildSideWallDrop("right_wall_escape", systems.falling._dropRightLimit + 2, 1, 2);
  systems.falling.activeDrops = [rightDrop];
  systems.falling.update(0.01);
  assert.ok(rightDrop.velocity.x <= -minEscapeSpeed, "right wall bounce must push drop back into screen.");
  assert.ok(rightDrop.velocity.y > 0, "right wall bounce with remaining bounces must lift the drop.");
  assert.strictEqual(rightDrop.remainingBounces, 1);

  var exhaustedDrop = buildSideWallDrop("exhausted_wall_escape", systems.falling._dropLeftLimit - 2, -1, 0);
  systems.falling.activeDrops = [exhaustedDrop];
  systems.falling.update(0.01);
  assert.ok(exhaustedDrop.velocity.x >= minEscapeSpeed, "exhausted side-wall drop must still get horizontal escape velocity.");
  assert.ok(exhaustedDrop.velocity.y <= -100, "exhausted side-wall drop must not receive extra upward bounce.");
  assert.strictEqual(exhaustedDrop.remainingBounces, 0);

  var pinnedDrop = buildSideWallDrop("pinned_wall_escape", systems.falling._dropRightLimit, 0, 2);
  systems.falling.activeDrops = [pinnedDrop];
  systems.falling.update(0.01);
  assert.ok(pinnedDrop.velocity.x <= -minEscapeSpeed, "pinned right-wall drop must escape even without crossing the wall.");
  assert.strictEqual(pinnedDrop.remainingBounces, 1);

  var victoryDrop = buildSideWallDrop("victory_pinned_wall_escape", systems.falling._dropRightLimit, 0, 2);
  victoryDrop.dropKind = "victory_board_drop";
  systems.falling.activeDrops = [victoryDrop];
  systems.falling.update(0.01);
  assert.ok(victoryDrop.velocity.x <= -minEscapeSpeed, "victory board drop must escape side wall without crossing it.");
  assert.ok(victoryDrop.velocity.y <= -100, "victory board drop must not receive side-wall lift.");
  assert.strictEqual(victoryDrop.remainingBounces, 2);
}

function testLeftmostJarOuterRimBounce() {
  var levelConfig = buildLevelConfig(5);
  levelConfig.level.jarCount = 5;
  levelConfig.level.jarColors = ["R", "G", "B", "Y", "P"];
  var fairySystem = new FairyAssistSystem();
  fairySystem.configureLevel(levelConfig);
  syncFairyCollisionCentersForTests(fairySystem);
  var fallingSystem = new FallingMarbleSystem();
  fallingSystem.attachFairyAssistSystem(fairySystem);
  fallingSystem.configureLevel(levelConfig);

  var leftZone = fallingSystem.jarZones.reduce(function (best, zone) {
    return !best || zone.x < best.x ? zone : best;
  }, null);
  assert(leftZone, "leftmost jar outer rim test requires jar zone.");
  var outerEdgeX = leftZone.x - leftZone.outerHalfWidth;
  var grid = {
    getCellPosition: function () {
      return {
        x: outerEdgeX,
        y: leftZone.mouthY + BoardLayout.bubbleRadius * 0.2
      };
    }
  };
  var cell = {
    id: "leftmost_outer_rim",
    row: 0,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };

  fallingSystem.registerDrops([cell], grid);
  var drop = fallingSystem.activeDrops[0];
  drop.position.x = outerEdgeX + 4;
  drop.velocity = { x: -80, y: -180 };
  var update = fallingSystem.update(0.016);
  assert.strictEqual(update.bounceEvents.length, 1, "leftmost outer rim overshoot must emit jar bounce.");
  assert.strictEqual(fallingSystem.lastBounceCount, 1);
  assert.ok(drop.velocity.y > 0, "leftmost outer rim must bounce upward off jar rim.");
  assert.strictEqual(fallingSystem._dropLeftLimit, BoardLayout.boardLeft);
  assert.strictEqual(fallingSystem._dropRightLimit, BoardLayout.boardRight);
  assert.ok(
    drop.position.x >= fallingSystem._dropLeftLimit,
    "leftmost outer rim bounce must clamp to side wall without wall rebound."
  );
}

function testFiveJarAdaptiveMouthLayout() {
  var originalLayoutWidth = BoardLayout.jarLayoutWidth;
  try {
    [720, 750, 828, 1080].forEach(function (screenWidth) {
      BoardLayout.jarLayoutWidth = screenWidth;
      var layout = BoardLayout.getJarLayout(5);
      assert.strictEqual(layout.positions.length, 5, "adaptive jar layout must produce five positions.");
      layout.positions.forEach(function (position, index) {
        var left = position - layout.mouthWidth * 0.5;
        var right = position + layout.mouthWidth * 0.5;
        assert.ok(left >= -screenWidth * 0.5 - 0.001, "jar mouth left edge must stay inside screen at index " + index + ".");
        assert.ok(right <= screenWidth * 0.5 + 0.001, "jar mouth right edge must stay inside screen at index " + index + ".");
        if (index > 0) {
          assert.ok(
            position - layout.positions[index - 1] >= layout.mouthWidth - 0.001,
            "adjacent jar mouths must not overlap at index " + index + "."
          );
        }
      });
    });
    BoardLayout.jarLayoutWidth = 720;
    var baselineLayout = BoardLayout.getJarLayout(5);
    assert.ok(
      baselineLayout.renderWidth > baselineLayout.centerStep,
      "baseline five-jar layout must allow jar bodies to overlap while mouths remain separate."
    );
    assert.deepStrictEqual(
      [0, 1, 2, 3, 4].map(function (jarIndex) {
        return BoardLayout.jarRenderYOffset + BoardLayout.getJarRenderYOffset(jarIndex, 5);
      }),
      [70, 60, 50, 60, 70],
      "five jars must rise by ten per step away from the center jar."
    );
  } finally {
    BoardLayout.jarLayoutWidth = originalLayoutWidth;
  }
}

function testRightmostJarOuterRimBounceStaysInsideScreen() {
  var levelConfig = buildLevelConfig(5);
  levelConfig.level.jarCount = 5;
  levelConfig.level.jarColors = ["R", "G", "B", "Y", "P"];
  var fairySystem = new FairyAssistSystem();
  fairySystem.configureLevel(levelConfig);
  syncFairyCollisionCentersForTests(fairySystem);
  var fallingSystem = new FallingMarbleSystem();
  fallingSystem.attachFairyAssistSystem(fairySystem);
  fallingSystem.configureLevel(levelConfig);

  var rightZone = fallingSystem.jarZones.reduce(function (best, zone) {
    return !best || zone.x > best.x ? zone : best;
  }, null);
  assert(rightZone, "rightmost jar outer rim test requires jar zone.");
  var outerEdgeX = rightZone.x + rightZone.outerHalfWidth;
  var grid = {
    getCellPosition: function () {
      return {
        x: outerEdgeX,
        y: rightZone.mouthY + BoardLayout.bubbleRadius * 0.2
      };
    }
  };
  var cell = {
    id: "rightmost_outer_rim",
    row: 0,
    col: 0,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };

  fallingSystem.registerDrops([cell], grid);
  var drop = fallingSystem.activeDrops[0];
  drop.position.x = outerEdgeX - 4;
  drop.velocity = { x: 80, y: -180 };
  var update = fallingSystem.update(0.016);
  assert.strictEqual(update.bounceEvents.length, 1, "rightmost outer rim overshoot must emit jar bounce.");
  assert.strictEqual(fallingSystem.lastBounceCount, 1);
  assert.ok(drop.velocity.y > 0, "rightmost outer rim must bounce upward off jar rim.");
  assert.strictEqual(fallingSystem._dropLeftLimit, BoardLayout.boardLeft);
  assert.strictEqual(fallingSystem._dropRightLimit, BoardLayout.boardRight);
  assert.ok(
    drop.position.x <= fallingSystem._dropRightLimit,
    "rightmost outer rim bounce must keep the falling ball inside the side wall."
  );
}

function testTopAnchorCollapseStartsSurplusVolley() {
  var GameManager = require("../gameplay-src/core/GameManager");
  var manager = new GameManager();
  manager.isTimedInfiniteShots = false;
  manager.remainingShots = 6;
  manager.lastResolution = { topAnchorCollapse: true };
  manager._beginSurplusShotBonus = function () {
    manager.state = "won_surplus_shots_pending";
  };
  manager._scheduleWinSettlement = function () {
    throw new Error("Top anchor collapse clear win with remaining shots must start surplus volley.");
  };
  manager._resolveClearWinOutcome();
  assert.strictEqual(manager.state, "won_surplus_shots_pending");
}

function assertSurplusDropVelocityMatchesTurretAim(fallingSystem, drop) {
  var aimDirection = fallingSystem.getSurplusTurretAimDirection();
  var speed = Math.sqrt(drop.velocity.x * drop.velocity.x + drop.velocity.y * drop.velocity.y);
  assert.ok(speed > 0, "surplus shot must launch with positive speed.");
  assert.ok(Math.abs(drop.velocity.x) > 0.000001, "surplus shot must not launch vertically.");
  assert.ok(Math.abs((drop.velocity.x / speed) - aimDirection.x) < 0.000001);
  assert.ok(Math.abs((drop.velocity.y / speed) - aimDirection.y) < 0.000001);
}

function testSurplusShotVelocityMatchesTurretAim() {
  var systems = createSystems(20);
  var origin = { x: BoardLayout.shooterOrigin.x, y: BoardLayout.shooterOrigin.y };
  systems.falling.registerSurplusShotsFromOrigin([
    { color: "R", entityCategory: "normal_ball", entityType: null }
  ], origin, 2);
  assert.strictEqual(systems.falling.activeDrops.length, 1);
  assertSurplusDropVelocityMatchesTurretAim(systems.falling, systems.falling.activeDrops[0]);

  systems.falling._advanceSurplusTurretAngle();
  var nextDrop = systems.falling._createSurplusShotDrop(
    { color: "Y", entityCategory: "normal_ball", entityType: null },
    1,
    origin
  );
  assertSurplusDropVelocityMatchesTurretAim(systems.falling, nextDrop);

  for (var index = 0; index < 16; index += 1) {
    systems.falling._advanceSurplusTurretAngle();
    var cycledDrop = systems.falling._createSurplusShotDrop(
      { color: "B", entityCategory: "normal_ball", entityType: null },
      index + 2,
      origin
    );
    assertSurplusDropVelocityMatchesTurretAim(systems.falling, cycledDrop);
  }
}

function testSurplusShotTurretAngleStaysWithinThirtyDegrees() {
  var systems = createSystems(20);
  var origin = { x: BoardLayout.shooterOrigin.x, y: BoardLayout.shooterOrigin.y };
  var minTurretAngle = 60;
  var maxTurretAngle = 120;
  systems.falling.registerSurplusShotsFromOrigin([
    { color: "R", entityCategory: "normal_ball", entityType: null }
  ], origin, 2);

  for (var index = 0; index < 12; index += 1) {
    var drop = systems.falling._createSurplusShotDrop(
      { color: "Y", entityCategory: "normal_ball", entityType: null },
      index + 1,
      origin
    );
    assert.ok(drop.turretAngleDeg >= minTurretAngle, "surplus turret angle must not rotate more than 30 degrees left.");
    assert.ok(drop.turretAngleDeg <= maxTurretAngle, "surplus turret angle must not rotate more than 30 degrees right.");
    assert.ok(Math.abs(drop.launchAngleDeg) <= 30, "surplus shot launch deviation must stay within 30 degrees.");
    systems.falling._advanceSurplusTurretAngle();
  }
}

function testSurplusShotPendingCountFollowsVolleyLaunch() {
  var systems = createSystems(20);
  var origin = { x: BoardLayout.shooterOrigin.x, y: BoardLayout.shooterOrigin.y };
  systems.falling.registerSurplusShotsFromOrigin([
    { color: "R", entityCategory: "normal_ball", entityType: null },
    { color: "Y", entityCategory: "normal_ball", entityType: null },
    { color: "B", entityCategory: "normal_ball", entityType: null }
  ], origin, 2);

  assert.strictEqual(systems.falling.getPendingSurplusShotCount(), 2);
  systems.falling.update(0.21);
  assert.strictEqual(systems.falling.getPendingSurplusShotCount(), 1);
  systems.falling.update(0.21);
  assert.strictEqual(systems.falling.getPendingSurplusShotCount(), 0);
}

function testCollectedMultiplierContract() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var redFairy = findFairyByColor(systems.fairy, "red");
  var drop = buildDrop("red_root", redFairy, 1);
  systems.falling.activeDrops = [drop];
  systems.falling.update(0.01);
  assert.strictEqual(drop.fairyBonusSteps, 1);
  assert.strictEqual(drop.finalMultiplier, 2);

  var collected = systems.falling._createCollectedEvent(drop, {
    index: 0,
    color: "R",
    sameColorBonus: 1.6
  });
  assert.strictEqual(collected.fairyMultiplier, 2);
  assert.strictEqual(collected.bonusMultiplier, 1.6);
  assert.strictEqual(collected.glowStacks, 1);
  assert.deepStrictEqual(collected.hitFairyIds, [redFairy.id]);
}

assert.strictEqual(BoardLayout.bubbleRadius, 32.5);
assert.strictEqual(FairyAssistConfig.fairyCollisionRadius * 2, 40);
assert.strictEqual(
  BoardLayout.bubbleDiameter * FairyAssistConfig.dropCollisionGlowScale,
  65 * 86 / 72
);
assert.strictEqual(FairyAssistConfig.maxCollisionsPerFairy, 7);
assert.strictEqual(FairyAssistConfig.maxGlowStacks, 7);
testPrefabAndAssetContract();
testJarOcclusionCopiesRenderedJarTransform();
testRandomEmptySlotSelection();
testSpawnRules();
testMissRemovalPriority();
testReplacementPriority();
testGreenSplitAndCollisionDedupe();
testMaxCollisionsPerFairyCap();
testDropGlowStacksCap();
testCollisionDiameterContract();
testGreenSplitCapacityFailure();
testDeferredDropCapacity();
testDeferredDropActivationFallsDownward();
testInJarDropsDoNotBlockDeferredFlush();
testUnsupportedDropStartsFallingDownward();
testDropLaunchUsesDownwardAngleCone();
testVictoryBoardDropLaunchesDownward();
testDeferredVictoryDropActivationKeepsHorizontalSpeed();
testVictoryBoardDropIgnoresFairyBounce();
testVictoryBoardDropRimBounces();
testFinalJarRimContactEmitsBounceEvent();
testVictoryBoardDropSkipsWallBounce();
testSideWallBounceKeepsHorizontalEscapeVelocity();
testFiveJarAdaptiveMouthLayout();
testLeftmostJarOuterRimBounce();
testRightmostJarOuterRimBounceStaysInsideScreen();
testTopAnchorCollapseStartsSurplusVolley();
testSurplusShotVelocityMatchesTurretAim();
testSurplusShotTurretAngleStaysWithinThirtyDegrees();
testSurplusShotPendingCountFollowsVolleyLaunch();
testCollectedMultiplierContract();

console.log("Fairy gameplay validation passed.");
