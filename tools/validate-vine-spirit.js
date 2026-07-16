"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var MatchSystem = require("../gameplay-src/systems/MatchSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function syncHudBottomLineY() {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
}

function buildGrid(layout, spiritRow, spiritCol) {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "VINE_SPIRIT_VALIDATION",
      initialDropSpaceRows: 8,
      layout: layout,
      specialEntities: [{
        id: "vine_spirit_validation",
        entityCategory: "reactive_ball",
        entityType: "vine_spirit",
        row: spiritRow,
        col: spiritCol
      }]
    }
  };
  syncHudBottomLineY();
  var viewport = new BoardViewportSystem();
  var grid = new BubbleGrid();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.initialize({});
  viewport.configureLevel(levelConfig);
  grid.configureLevel(levelConfig);
  return grid;
}

function createVineResolution() {
  return {
    vineCastEvaluated: false,
    vineCasts: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: [],
    boardCleared: false
  };
}

function previewAndEntangle(grid, row, col) {
  grid.beginVinePreview("vine_spirit_validation", { row: row, col: col });
  return grid.completeVineEntanglement("vine_spirit_validation", { row: row, col: col });
}

function validateConfigAndCompactCodec() {
  var testLevelPath = path.resolve(__dirname, "../assets/map/config/levels/level_test.json");
  var normalized = LevelConfigLoader.normalizeLevelConfig(readJson(testLevelPath), "level_test");
  var vineSpirits = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityCategory === "reactive_ball" && entity.entityType === "vine_spirit";
  });
  assert(vineSpirits.length === 1, "Test level must contain exactly one vine spirit.");

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "vine_spirit_validation_pack",
    from: 1,
    to: 1,
    levels: {
      level_001: normalized
    }
  });
  var encodedVines = compact.levels.level_001.level.specialEntities.filter(function (entry) {
    return entry[2] === "v";
  });
  assert(encodedVines.length === 1, "Compact vine spirit must use type code `v`.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  var expandedVines = expanded.levels.level_001.level.specialEntities.filter(function (entity) {
    return entity.entityType === "vine_spirit";
  });
  assert(expandedVines.length === 1, "Expanded compact config must restore vine_spirit.");
}

function validateMatchAndSupportRules() {
  var grid = buildGrid([
    "RRR.......",
    ".........",
    "..........",
    ".........",
    "....R.....",
    "....R....",
    "..........",
    "........."
  ], 1, 3);
  previewAndEntangle(grid, 0, 1);

  var matchSystem = new MatchSystem();
  matchSystem.initialize({});
  matchSystem.configureLevel({ level: { colors: ["R"] } });
  var match = matchSystem.findMatchGroup(grid, grid.getCell(0, 0));
  assert(match.length === 0, "Entangled ball must break the normal color match group.");

  previewAndEntangle(grid, 4, 4);
  var supportSystem = new SupportSystem();
  supportSystem.initialize({});
  supportSystem.configureLevel({ level: {} });
  var floating = supportSystem.findFloatingCells(grid);
  assert(!floating.some(function (cell) { return cell.row === 4 && cell.col === 4; }), "Entangled ball must not float.");
  assert(!floating.some(function (cell) { return cell.row === 5 && cell.col === 4; }), "Ball supported by an entangled anchor must not float.");

  var protectedRemoval = grid.removeCells([
    grid.getCell(1, 3),
    grid.getCell(4, 4)
  ]);
  assert(protectedRemoval.length === 0, "Vine spirit and entangled ball must resist normal removal.");
}

function validateDamageReleaseAndDeathCleanup() {
  var grid = buildGrid([
    "R.........",
    "RR.......",
    "..R.......",
    "...R.....",
    "..........",
    ".........",
    "..........",
    "........."
  ], 1, 2);
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;

  previewAndEntangle(grid, 2, 2);
  var adjacencyResolution = createVineResolution();
  var removed = grid.removeCells([grid.getCell(1, 1)]);
  manager._resolveVinesAfterRemoval(removed, grid, adjacencyResolution);
  assert(adjacencyResolution.releasedVines.length === 1, "Adjacent elimination must release one vine.");
  assert(adjacencyResolution.vineSpiritHits.length === 1, "Adjacent elimination must damage the spirit once.");
  assert(grid.getCell(1, 2).health === 2, "Vine spirit health must decrease from 3 to 2.");
  assert(!grid.getCell(2, 2).vineOwnerId, "Released ball must keep its color without vine ownership.");

  previewAndEntangle(grid, 0, 0);
  var directVineResolution = createVineResolution();
  manager._resolveDirectVineImpact({
    shotPlan: {
      collidedCell: grid.getCell(0, 0)
    }
  }, grid, directVineResolution);
  assert(directVineResolution.releasedVines.length === 1, "Direct hit must release an active vine.");
  assert(grid.getCell(0, 0).color === "R", "Direct vine release must preserve the underlying normal ball.");

  var secondHitResolution = createVineResolution();
  manager._resolveDirectVineImpact({
    shotPlan: {
      collidedCell: grid.getCell(1, 2)
    }
  }, grid, secondHitResolution);
  assert(grid.getCell(1, 2).health === 1, "Second spirit hit must leave exactly 1 health.");

  previewAndEntangle(grid, 3, 3);
  var deathResolution = createVineResolution();
  manager._resolveDirectVineImpact({
    shotPlan: {
      collidedCell: grid.getCell(1, 2)
    }
  }, grid, deathResolution);
  assert(!grid.getCell(1, 2), "Third spirit hit must remove the vine spirit cell.");
  assert(deathResolution.vineSpiritHits[0].destroyed === true, "Third spirit hit must report destruction.");
  assert(deathResolution.witheredVines.length === 1, "Spirit death must wither every owned active vine.");
  assert(!grid.getCell(3, 3).vineOwnerId, "Withered vine target must remain as a normal ball.");
}

function validateThirdShotPreviewAndCast() {
  var grid = buildGrid([
    "RR........",
    "RR.......",
    "..........",
    ".........",
    "..........",
    ".........",
    "..........",
    "........."
  ], 1, 2);
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.shotsFired = 3;
  manager.remainingShots = 5;
  manager.state = "running";
  var resolution = createVineResolution();
  manager.lastResolution = resolution;
  var continued = false;
  manager._continueAfterVineCast = function (completedResolution) {
    assert(completedResolution === resolution, "Vine cast must continue with the same resolution.");
    continued = true;
  };

  assert(manager._beginVineCastForResolution(resolution), "Third fired shot must start vine preview.");
  assert(resolution.vineCasts.length === 1, "One live spirit must schedule one vine cast.");
  var cast = resolution.vineCasts[0];
  var previewCell = grid.getCell(cast.targetRow, cast.targetCol);
  assert(previewCell.vinePreviewOwnerId === "vine_spirit_validation", "Vine target must expose preview ownership.");
  assert(!previewCell.vineOwnerId, "Preview target must not be active before the warning completes.");

  manager._updatePendingVineCast(SpecialAnimationTiming.vineCast.previewDuration * 0.5);
  assert(!continued, "Vine cast must remain pending during the warning.");
  manager._updatePendingVineCast(SpecialAnimationTiming.vineCast.previewDuration * 0.5);
  var entangled = grid.getCell(cast.targetRow, cast.targetCol);
  assert(entangled.vineOwnerId === "vine_spirit_validation", "Warning completion must activate the vine.");
  assert(!entangled.vinePreviewOwnerId, "Warning completion must clear preview ownership.");
  assert(cast.completed === true && continued, "Completed vine cast must resume the shot state machine.");

  var nonThirdResolution = createVineResolution();
  manager.shotsFired = 4;
  assert(!manager._beginVineCastForResolution(nonThirdResolution), "Non-third shots must not start a vine cast.");
}

validateConfigAndCompactCodec();
validateMatchAndSupportRules();
validateDamageReleaseAndDeathCleanup();
validateThirdShotPreviewAndCast();
console.log("[OK] vine_spirit config, codec, health, damage, vine release, support lock, third-shot preview and death cleanup");
