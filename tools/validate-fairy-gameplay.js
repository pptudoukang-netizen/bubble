"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../assets/scripts/config/FairyAssistConfig");
var FairyAssistSystem = require("../assets/scripts/systems/FairyAssistSystem");
var FallingMarbleSystem = require("../assets/scripts/systems/FallingMarbleSystem");

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

function buildDrop(id, fairy, splitGeneration) {
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
      y: fairy.position.y + 60
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
    lastStuckY: fairy.position.y + 60,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    rootDropId: id,
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    splitGeneration: splitGeneration
  };
}

function createSystems(maxDynamicMarbles) {
  var levelConfig = buildLevelConfig(maxDynamicMarbles);
  var fairySystem = new FairyAssistSystem();
  fairySystem.configureLevel(levelConfig);
  var fallingSystem = new FallingMarbleSystem();
  fallingSystem.attachFairyAssistSystem(fairySystem);
  fallingSystem.configureLevel(levelConfig);
  return {
    fairy: fairySystem,
    falling: fallingSystem
  };
}

function testPrefabAndAssetContract() {
  var prefabPath = path.join(__dirname, "..", "assets", "resources", "prefabs", "ui", "GameView.prefab");
  var prefab = JSON.parse(fs.readFileSync(prefabPath, "utf8"));
  var geniusesIndex = prefab.findIndex(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "geniuses";
  });
  assert(geniusesIndex >= 0, "GameView requires geniuses node.");
  var geniuses = prefab[geniusesIndex];
  assert.strictEqual(geniuses._children.length, 6);

  FairyAssistConfig.slots.forEach(function (slotConfig) {
    var node = prefab.find(function (entry) {
      return entry &&
        entry.__type__ === "cc.Node" &&
        entry._name === slotConfig.nodeName &&
        entry._parent &&
        entry._parent.__id__ === geniusesIndex;
    });
    assert(node, "Missing GameView/geniuses/" + slotConfig.nodeName + ".");
    assert.strictEqual(node._trs.array[0], slotConfig.x);
    assert.strictEqual(node._trs.array[1], slotConfig.y);
  });

  FairyAssistConfig.colorRules.forEach(function (rule) {
    var relativePath = rule.assetPath + ".png";
    var absolutePath = path.join(__dirname, "..", "assets", "resources", relativePath.replace(/\//g, path.sep));
    assert(fs.existsSync(absolutePath), "Missing fairy asset: " + relativePath);
    assert(fs.existsSync(absolutePath + ".meta"), "Missing fairy asset meta: " + relativePath);
  });
}

function testSpawnRules() {
  var systems = createSystems(20);
  var grid = buildGrid();
  systems.fairy.resolveAfterShot(buildResolution(1, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  assert.deepStrictEqual(
    systems.fairy.snapshotForRender().slots.slice(0, 3).map(function (slot) {
      return slot.fairy.color;
    }),
    ["red", "yellow", "green"]
  );

  var beforeFloatingResolution = systems.fairy.snapshotForRender().revision;
  systems.fairy.resolveAfterShot(buildResolution(10, 1), grid);
  assert.strictEqual(systems.fairy.snapshotForRender().revision, beforeFloatingResolution);

  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  assert.strictEqual(systems.fairy.snapshotForRender().slots[0].fairy, null);
  assert.strictEqual(systems.fairy.snapshotForRender().slots[1].fairy, null);
  assert.strictEqual(systems.fairy.snapshotForRender().slots[2].fairy.color, "green");
}

function testMissRemovalPriority() {
  var systems = createSystems(20);
  var grid = buildGrid();
  systems.fairy.resolveAfterShot(buildResolution(1, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  var slots = systems.fairy.snapshotForRender().slots;
  assert.strictEqual(slots[0].fairy, null);
  assert.strictEqual(slots[1].fairy, null);
  assert.strictEqual(slots[2].fairy.color, "green");

  systems.fairy.resolveAfterShot(buildResolution(10, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  systems.fairy.resolveAfterShot(buildResolution(0, 0), grid);
  slots = systems.fairy.snapshotForRender().slots;
  assert.strictEqual(slots[0].fairy, null);
  assert.strictEqual(slots[1].fairy.color, "yellow");
  assert.strictEqual(slots[2].fairy, null);
}

function testReplacementPriority() {
  var systems = createSystems(20);
  var grid = buildGrid();
  [1, 6, 10, 1, 6, 10].forEach(function (matchedCount) {
    systems.fairy.resolveAfterShot(buildResolution(matchedCount, 0), grid);
  });
  systems.fairy.resolveAfterShot(buildResolution(6, 0), grid);
  var slots = systems.fairy.snapshotForRender().slots;
  assert.strictEqual(slots[0].fairy.color, "yellow");
  assert.strictEqual(slots[3].fairy.color, "red");
}

function testGreenSplitAndCollisionDedupe() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), buildGrid());
  var greenFairy = systems.fairy.snapshotForRender().slots[0].fairy;
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
  child.position.y = greenFairy.position.y + 60;
  child.velocity.x = 0;
  child.velocity.y = -100;
  var repeatUpdate = systems.falling.update(0.01);
  assert.strictEqual(repeatUpdate.splits.length, 0);
  assert.strictEqual(child.finalMultiplier, 4);
}

function testCollisionDiameterContract() {
  var outsideSystems = createSystems(20);
  outsideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var outsideFairy = outsideSystems.fairy.snapshotForRender().slots[0].fairy;
  var outsideDrop = buildDrop("outside_drop", outsideFairy, 1);
  outsideDrop.position.y = outsideFairy.position.y + 73;
  outsideDrop.velocity.y = 0;
  outsideSystems.falling.activeDrops = [outsideDrop];
  assert.strictEqual(outsideSystems.falling.update(0.001).fairyHits.length, 0);

  var insideSystems = createSystems(20);
  insideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var insideFairy = insideSystems.fairy.snapshotForRender().slots[0].fairy;
  var insideDrop = buildDrop("inside_drop", insideFairy, 1);
  insideDrop.position.y = insideFairy.position.y + 71;
  insideDrop.velocity.y = 0;
  insideSystems.falling.activeDrops = [insideDrop];
  assert.strictEqual(insideSystems.falling.update(0.001).fairyHits.length, 1);
}

function testGreenSplitCapacityFailure() {
  var systems = createSystems(1);
  systems.fairy.resolveAfterShot(buildResolution(10, 0), buildGrid());
  var greenFairy = systems.fairy.snapshotForRender().slots[0].fairy;
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
  assert.strictEqual(systems.falling._countActiveDrops(), 3);
  assert.strictEqual(systems.falling.deferredDrops.length, 2);
  assert.strictEqual(systems.falling.hasActiveDrops(), true);

  systems.falling.activeDrops.forEach(function (drop) {
    drop.active = false;
  });
  systems.falling.update(0.01);
  assert.strictEqual(systems.falling._countActiveDrops(), 2);
  assert.strictEqual(systems.falling.deferredDrops.length, 0);
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

  systems.falling.registerDrops(cells, grid, { dropKind: "victory_board_drop" });
  assert.strictEqual(systems.falling.activeDrops.length, cells.length);
  systems.falling.activeDrops.forEach(function (drop) {
    assert.strictEqual(drop.dropKind, "victory_board_drop");
    assert.ok(drop.velocity.y <= 0, "victory board drop must not launch upward");
  });
}

function testCollectedMultiplierContract() {
  var systems = createSystems(20);
  systems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var redFairy = systems.fairy.snapshotForRender().slots[0].fairy;
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
  assert.deepStrictEqual(collected.hitFairyIds, [redFairy.id]);
}

assert.strictEqual(BoardLayout.bubbleRadius, 36);
assert.strictEqual(FairyAssistConfig.fairyCollisionRadius * 2, 72);
testPrefabAndAssetContract();
testSpawnRules();
testMissRemovalPriority();
testReplacementPriority();
testGreenSplitAndCollisionDedupe();
testCollisionDiameterContract();
testGreenSplitCapacityFailure();
testDeferredDropCapacity();
testVictoryBoardDropLaunchesDownward();
testCollectedMultiplierContract();

console.log("Fairy gameplay validation passed.");
