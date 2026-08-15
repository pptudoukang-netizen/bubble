"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");
var TrajectoryPredictor = require("../gameplay-src/systems/TrajectoryPredictor");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function createGrid(levelConfig) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var viewport = new BoardViewportSystem();
  var grid = new BubbleGrid();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.initialize({});
  viewport.configureLevel(levelConfig);
  grid.configureLevel(levelConfig);
  return grid;
}

function buildNormalizedBlackHoleLevel() {
  var raw = readJson(path.resolve(__dirname, "../assets/map/config/levels/level_001.json"));
  raw.level.shotLimit += 3;
  raw.level.specialEntities = [{
    id: "black_hole_validation",
    entityCategory: "hazard_ball",
    entityType: "black_hole",
    capacity: 3,
    row: 4,
    col: 5
  }];
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_001");
}

function validateConfigCodecAndBudget() {
  var normalized = buildNormalizedBlackHoleLevel();
  var blackHole = normalized.level.specialEntities[0];
  assert(blackHole.entityCategory === "hazard_ball" && blackHole.entityType === "black_hole", "Normalized config must preserve hazard_ball/black_hole.");
  assert(blackHole.capacity === 3, "Normalized black hole capacity must remain exactly 3.");

  [undefined, 2, 4].forEach(function (capacity) {
    var invalid = readJson(path.resolve(__dirname, "../assets/map/config/levels/level_001.json"));
    invalid.level.specialEntities = [{
      id: "invalid_black_hole",
      entityCategory: "hazard_ball",
      entityType: "black_hole",
      row: 4,
      col: 5
    }];
    if (capacity !== undefined) {
      invalid.level.specialEntities[0].capacity = capacity;
    }
    var rejected = false;
    try {
      LevelConfigLoader.normalizeLevelConfig(invalid, "level_001");
    } catch (error) {
      rejected = error.message.indexOf("capacity must be exactly 3 for black_hole") >= 0;
    }
    assert(rejected, "Black hole config must reject capacity " + String(capacity) + ".");
  });

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "black_hole_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var encoded = compact.levels.level_001.level.specialEntities[0];
  assert(encoded[2] === "q" && encoded[3] === 3, "Compact black hole must encode type q and capacity 3.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  var expandedBlackHole = expanded.levels.level_001.level.specialEntities[0];
  assert(expandedBlackHole.entityType === "black_hole" && expandedBlackHole.capacity === 3, "Expanded compact pack must restore black hole capacity.");

  var testLevel = LevelConfigLoader.normalizeLevelConfig(
    readJson(path.resolve(__dirname, "../assets/map/config/levels/level_black_hole_test.json")),
    "level_black_hole_test"
  );
  var testBlackHoles = testLevel.level.specialEntities.filter(function (entity) {
    return entity.entityCategory === "hazard_ball" && entity.entityType === "black_hole";
  });
  assert(testBlackHoles.length === 1, "Dedicated black hole test level must contain exactly one black hole.");
  assert(testLevel.level.specialEntities.length === 1, "Dedicated black hole test level must isolate the black hole mechanism.");
  assert(testLevel.level.shotLimit === 12 + testBlackHoles.length * 3, "Dedicated black hole test level must reserve three extra shots for each black hole.");
}

function buildCapacityFixture() {
  return {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "BLACK_HOLE_CAPACITY",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: [
        "....R......",
        "..........",
        "....B......",
        "..........",
        "...........",
        "..........",
        "...........",
        ".........."
      ],
      specialEntities: [{
        id: "capacity_black_hole",
        entityCategory: "hazard_ball",
        entityType: "black_hole",
        capacity: 3,
        row: 1,
        col: 4
      }]
    }
  };
}

function buildProjectile(blackHole, shotSequence) {
  return {
    position: { x: 0, y: 0 },
    ball: {
      ballCategory: "normal",
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    },
    color: "R",
    destroyedTransparentBalls: [],
    targetCell: null,
    shotPlan: {
      valid: true,
      hitType: "black_hole",
      absorbingBlackHole: {
        id: blackHole.id,
        row: blackHole.row,
        col: blackHole.col,
        position: { x: 0, y: 0 }
      },
      penetratedTransparentBalls: [],
      hitPoint: { x: 0, y: 0 },
      wallBounceCount: 0,
      shotSequence: shotSequence
    }
  };
}

function validateThreeShotCapacityAndTurnAdvance() {
  var levelConfig = buildCapacityFixture();
  var grid = createGrid(levelConfig);
  var support = new SupportSystem();
  support.initialize({});
  support.configureLevel(levelConfig);
  assert(support.findFloatingCells(grid).length === 0, "Black hole capacity fixture must begin fully supported.");

  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem = support;
  manager.systems.boardOcclusionSystem = { onShotFired: function () { return []; } };
  manager.systems.fallingMarbleSystem = { hasActiveDrops: function () { return false; } };
  manager.remainingShots = 3;
  manager.isTimedInfiniteShots = false;
  manager.state = "running";
  manager._filterFloatingSpiritCocoons = function (cells) { return cells; };
  manager._collectRemovedKeysAndResolveUnlocks = function () {};
  var registeredDrops = [];
  manager._registerResolutionDrops = function (cells) {
    registeredDrops = registeredDrops.concat(clone(cells));
  };
  manager._beginSwirlRotationForResolution = function () { return false; };
  manager._beginWormholeShiftForResolution = function () { return false; };
  manager._beginVineCastForResolution = function () { return false; };
  var advancedTurnCount = 0;
  manager._continueAfterVineCast = function () { advancedTurnCount += 1; };

  for (var shot = 1; shot <= 3; shot += 1) {
    var liveBlackHole = grid.getCell(1, 4);
    assert(liveBlackHole && liveBlackHole.capacity === 4 - shot, "Black hole capacity before shot " + shot + " is invalid.");
    manager.shotsFired = shot;
    manager.activeProjectile = buildProjectile(liveBlackHole, shot);
    manager._finalizePlannedShot();
    assert(manager.activeProjectile === null, "Black hole shot " + shot + " must consume the projectile.");
    assert(manager.lastResolution.matched.length === 0, "Black hole shot must not enter ordinary match elimination.");
    assert(manager.lastResolution.blackHoleProjectileAbsorptions.length === 1, "Each black hole shot must record exactly one absorption.");
    assert(manager.lastResolution.blackHoleProjectileAbsorptions[0].capacityAfter === 3 - shot, "Black hole capacity after shot " + shot + " is invalid.");
  }

  assert(grid.getCell(1, 4) === null, "Third projectile must remove the black hole.");
  assert(grid.getCell(2, 4) === null, "Third projectile must rerun support and drop the disconnected bubble.");
  assert(registeredDrops.length === 1 && registeredDrops[0].row === 2 && registeredDrops[0].col === 4, "Third projectile must register the newly floating bubble exactly once.");
  assert(advancedTurnCount === 3, "Every swallowed projectile must continue the ordinary post-shot turn chain.");
}

function validateDirectContactTrajectory() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "BLACK_HOLE_TRAJECTORY",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: [
        "R..........",
        "..........",
        "...........",
        "..........",
        "...........",
        "..........",
        "...........",
        ".........."
      ],
      specialEntities: [{
        id: "trajectory_black_hole",
        entityCategory: "hazard_ball",
        entityType: "black_hole",
        capacity: 3,
        row: 3,
        col: 4
      }]
    }
  };
  var grid = createGrid(levelConfig);
  var targetPosition = grid.getCellPosition(3, 4);
  var predictor = new TrajectoryPredictor();
  predictor.initialize({});
  predictor.configureLevel(levelConfig);
  var plan = predictor.predictShotPlan(grid, { x: targetPosition.x, y: targetPosition.y - 300 }, { x: 0, y: 1 });
  assert(plan.hitType === "black_hole", "Trajectory must stop at first direct black hole contact.");
  assert(plan.targetCell === null && plan.targetCellPosition === null, "Black hole trajectory must not expose an attachment target.");
  assert(plan.absorbingBlackHole.id === "trajectory_black_hole", "Black hole trajectory must preserve the exact target id.");
}

function validateCapacitySurvivesWormholeShift() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "BLACK_HOLE_WORMHOLE_SHIFT",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: [
        "R..........",
        "..........",
        "...........",
        "..........",
        "...........",
        "..........",
        "...........",
        ".........."
      ],
      specialEntities: [{
        id: "shift_black_hole",
        entityCategory: "hazard_ball",
        entityType: "black_hole",
        capacity: 3,
        row: 3,
        col: 2
      }, {
        id: "shift_wormhole_left",
        entityCategory: "reactive_ball",
        entityType: "wormhole",
        moveDirection: "right",
        row: 3,
        col: 0
      }, {
        id: "shift_wormhole_right",
        entityCategory: "reactive_ball",
        entityType: "wormhole",
        moveDirection: "right",
        row: 3,
        col: 8
      }]
    }
  };
  var grid = createGrid(levelConfig);
  var consumption = grid.consumeBlackHole(3, 2);
  assert(consumption.capacityAfter === 2 && !consumption.destroyed, "Combination fixture must reduce black hole capacity before wormhole movement.");
  grid.shiftWormholeInteriors();
  var shiftedBlackHole = grid.getCell(3, 3);
  assert(shiftedBlackHole && shiftedBlackHole.entityType === "black_hole" && shiftedBlackHole.capacity === 2, "Wormhole movement must preserve remaining black hole capacity.");
}

function validateRangeUnloadAndRendering() {
  var grid = createGrid(buildCapacityFixture());
  var manager = new GameManager();
  var resolution = { blackHolesUnloaded: [] };
  var affected = [grid.getCell(1, 4), grid.getCell(2, 4)];
  var remaining = manager._unloadBlackHolesHitByRange(affected, grid, resolution, "blast");
  assert(remaining.length === 1 && remaining[0].entityCategory === "normal_ball", "Range unload must return only ordinary blast candidates.");
  assert(resolution.blackHolesUnloaded.length === 1 && resolution.blackHolesUnloaded[0].sourceType === "blast", "Range unload must record a dedicated black hole event.");
  assert(grid.getCell(1, 4) === null, "Range unload must remove the black hole immediately.");

  var finalizeSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/core/GameManagerShotFinalizeMethods.js"), "utf8");
  var molotovSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/core/GameManagerShotMolotovMethods.js"), "utf8");
  var lineSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/core/GameManagerAdPowerupMethods.js"), "utf8");
  assert(finalizeSource.indexOf('_unloadBlackHolesHitByRange(blastCells, grid, resolution, "blast")') >= 0, "Blast must use dedicated black hole unload.");
  assert(molotovSource.indexOf('_unloadBlackHolesHitByRange(blastCells, grid, resolution, "molotov")') >= 0, "Molotov must use dedicated black hole unload.");
  assert(lineSource.indexOf('_unloadBlackHolesHitByRange(lineCells, grid, resolution, "three_line_elimination")') >= 0, "Three-line clear must use dedicated black hole unload.");
  var assistSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/core/GameManagerAssistSpiritSkillMethods.js"), "utf8");
  assert(assistSource.indexOf('_unloadBlackHolesHitByRange(targetCells, grid, resolution, "lightning_chain")') >= 0, "Lightning chain must use dedicated black hole unload.");
  assert(assistSource.indexOf('_unloadBlackHolesHitByRange(targetCells, grid, resolution, "tornado")') >= 0, "Tornado must use dedicated black hole unload.");

  var selectorSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/render/LevelRendererStateSelectors.js"), "utf8");
  var resourceSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  assert(selectorSource.indexOf('ballLike.entityType === "black_hole"') >= 0 && selectorSource.indexOf('return "BLACK_HOLE";') >= 0, "Black hole render selector must resolve BLACK_HOLE.");
  assert(resourceSource.indexOf('BLACK_HOLE: "game/image/ball/black_hole"') >= 0, "Black hole resource must use black_hole.");
  assert(fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/black_hole.png")) && fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/black_hole.png.meta")), "Black hole image and meta must exist.");
}

validateConfigCodecAndBudget();
validateThreeShotCapacityAndTurnAdvance();
validateDirectContactTrajectory();
validateCapacitySurvivesWormholeShift();
validateRangeUnloadAndRendering();

console.log("[OK] black_hole", "capacity, direct absorption, support rerun, range unload, turn advance, shot budget, codec and rendering validated");
