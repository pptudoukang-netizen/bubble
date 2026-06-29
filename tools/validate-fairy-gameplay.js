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
    splitGeneration: splitGeneration
  };
}

function syncFairyCollisionCentersForTests(fairySystem) {
  fairySystem.syncCollisionCenters(FairyAssistConfig.slots.map(function (slotConfig) {
    return {
      index: slotConfig.index,
      x: slotConfig.x,
      y: slotConfig.y
    };
  }));
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
  var redFairy = systems.fairy.snapshotForRender().slots[0].fairy;
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

function testCollisionDiameterContract() {
  var combinedCollisionDistance = FairyAssistConfig.fairyCollisionRadius + BoardLayout.bubbleRadius;
  var outsideSystems = createSystems(20);
  outsideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var outsideFairy = outsideSystems.fairy.snapshotForRender().slots[0].fairy;
  var outsideDrop = buildDrop("outside_drop", outsideFairy, 1);
  outsideDrop.position.y = outsideFairy.position.y + combinedCollisionDistance + 1;
  outsideDrop.velocity.y = 0;
  outsideSystems.falling.activeDrops = [outsideDrop];
  assert.strictEqual(outsideSystems.falling.update(0.001).fairyHits.length, 0);

  var insideSystems = createSystems(20);
  insideSystems.fairy.resolveAfterShot(buildResolution(1, 0), buildGrid());
  var insideFairy = insideSystems.fairy.snapshotForRender().slots[0].fairy;
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
  var fairy = systems.fairy.snapshotForRender().slots[0].fairy;
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
  systems.falling.update(0.01);
  var drop = systems.falling.activeDrops[0];
  assert(drop, "victory board rim drop should remain active after rim bounce.");
  assert.strictEqual(drop.inJar, false);
  assert.strictEqual(drop.jarIndex, -1);
  assert.strictEqual(systems.falling.lastBounceCount, 1);
  assert.ok(drop.velocity.y > 0, "victory board rim drop must bounce upward off jar rim.");
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
    splitGeneration: 0
  };
  systems.falling.activeDrops = [drop];
  systems.falling.update(0.01);
  assert.strictEqual(systems.falling.lastBounceCount, 0);
  assert.strictEqual(drop.remainingBounces, 2);
  assert.ok(drop.velocity.y <= 0, "victory board drop must not gain upward speed from wall bounce.");
  assert.ok(drop.position.x >= leftLimit, "victory board drop must clamp to wall without rebound.");
}

function testTopAnchorCollapseStartsSurplusVolley() {
  var GameManager = require("../assets/scripts/core/GameManager");
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
assert.strictEqual(FairyAssistConfig.fairyCollisionRadius * 2, 40);
testPrefabAndAssetContract();
testSpawnRules();
testMissRemovalPriority();
testReplacementPriority();
testGreenSplitAndCollisionDedupe();
testMaxCollisionsPerFairyCap();
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
testVictoryBoardDropSkipsWallBounce();
testTopAnchorCollapseStartsSurplusVolley();
testSurplusShotVelocityMatchesTurretAim();
testCollectedMultiplierContract();

console.log("Fairy gameplay validation passed.");
