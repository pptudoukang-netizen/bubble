"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceCharacter(text, index, replacement) {
  if (typeof text !== "string" || !Number.isInteger(index) || index < 0 || index >= text.length) {
    throw new Error("replaceCharacter requires an in-range string index.");
  }
  if (typeof replacement !== "string" || replacement.length !== 1) {
    throw new Error("replaceCharacter requires one replacement character.");
  }
  return text.slice(0, index) + replacement + text.slice(index + 1);
}

function createBreederResolution(matched) {
  return {
    matched: matched || [],
    breederResolved: false,
    breederSpawns: [],
    boardCleared: false
  };
}

function buildGrid(levelConfig) {
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

function createManager(grid) {
  var manager = new GameManager();
  manager.shotsFired = 1;
  manager.systems = {
    bubbleGrid: grid
  };
  return manager;
}

function withRandomValues(values, callback) {
  if (!Array.isArray(values) || !values.length) {
    throw new Error("withRandomValues requires random values.");
  }
  var previousRandom = Math.random;
  var index = 0;
  Math.random = function () {
    if (index >= values.length) {
      throw new Error("Breeder validation exhausted deterministic random values.");
    }
    var value = values[index];
    index += 1;
    return value;
  };
  try {
    return callback();
  } finally {
    Math.random = previousRandom;
  }
}

function buildNormalizedBreederLevel() {
  var raw = readJson(path.resolve(__dirname, "../assets/map/config/levels/level_001.json"));
  raw.level.specialEntities = [{
    id: "breeder_validation",
    entityCategory: "reactive_ball",
    entityType: "breeder",
    row: 4,
    col: 5
  }];
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_001");
}

function validateConfigAndCompactCodec() {
  var normalized = buildNormalizedBreederLevel();
  var breeders = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityCategory === "reactive_ball" && entity.entityType === "breeder";
  });
  assert(breeders.length === 1, "Normalized config must preserve one breeder.");
  var normalizedTestLevel = LevelConfigLoader.normalizeLevelConfig(
    readJson(path.resolve(__dirname, "../assets/map/config/levels/level_breeder_ball_test.json")),
    "level_breeder_ball_test"
  );
  assert(
    normalizedTestLevel.level.specialEntities.some(function (entity) {
      return entity.id === "breeder_ball_test_01" && entity.entityType === "breeder";
    }),
    "Dedicated breeder ball test level must expose breeder_ball_test_01."
  );
  assert(
    normalizedTestLevel.level.specialEntities.length === 1,
    "Dedicated breeder ball test level must isolate the breeder mechanism."
  );

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "breeder_validation_pack",
    from: 1,
    to: 1,
    levels: {
      level_001: normalized
    }
  });
  var encodedBreeders = compact.levels.level_001.level.specialEntities.filter(function (entry) {
    return entry[2] === "d";
  });
  assert(encodedBreeders.length === 1, "Compact breeder must use type code `d`.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.specialEntities.some(function (entity) {
      return entity.entityCategory === "reactive_ball" && entity.entityType === "breeder";
    }),
    "Expanded compact config must restore breeder."
  );

  var blockedRaw = readJson(path.resolve(__dirname, "../assets/map/config/levels/level_001.json"));
  blockedRaw.level.layout[4] = replaceCharacter(blockedRaw.level.layout[4], 6, "R");
  blockedRaw.level.specialEntities = [{
    id: "blocked_breeder_validation",
    entityCategory: "reactive_ball",
    entityType: "breeder",
    row: 4,
    col: 5
  }];
  var rejectedBlockedBreeder = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(blockedRaw, "level_001");
  } catch (error) {
    rejectedBlockedBreeder = error.message.indexOf("breeder requires at least one initial empty neighbor") >= 0;
  }
  assert(rejectedBlockedBreeder, "Config must reject a breeder with no initial empty neighbor.");
}

function validateSpawnAndBoardShiftOrder() {
  var levelConfig = buildNormalizedBreederLevel();
  var grid = buildGrid(levelConfig);
  var manager = createManager(grid);
  var resolution = createBreederResolution([]);
  var boardShiftObservedSpawn = false;
  manager._tryTopAnchorCollapse = function () {
    return false;
  };
  manager._applyPostImpactBoardShiftPolicy = function (currentResolution) {
    boardShiftObservedSpawn = currentResolution.breederSpawns.length === 1 && grid.hasCell(4, 6);
    return true;
  };

  withRandomValues([0, 0.99], function () {
    manager._continueAfterVineCast(resolution);
  });
  var spawned = grid.getCell(4, 6);
  assert(boardShiftObservedSpawn, "Ordinary board movement policy must run after breeder growth.");
  assert(spawned && spawned.entityCategory === "normal_ball", "Breeder must create an ordinary ball.");
  assert(spawned.color === "R", "Breeder color must come from current ordinary board colors.");
  assert(resolution.breederSpawns.length === 1, "Breeder phase must record one spawn.");
  assert(resolution.breederSpawns[0].cellId === spawned.id, "Breeder spawn record must identify the target board cell.");
  assert(
    resolution.breederSpawns[0].breederId === "breeder_validation" &&
      resolution.breederSpawns[0].breederRow === 4 &&
      resolution.breederSpawns[0].breederCol === 5,
    "Breeder spawn record must preserve the birth source coordinates."
  );
}

function validateAdjacentExplosionAndFullNeighbors() {
  var levelConfig = buildNormalizedBreederLevel();
  var explosionGrid = buildGrid(levelConfig);
  var explosionManager = createManager(explosionGrid);
  var explosionResolution = createBreederResolution([{
    id: "removed_neighbor",
    row: 4,
    col: 6,
    entityCategory: "normal_ball",
    entityType: null,
    color: "R"
  }]);
  explosionManager._resolveBreederPhase(explosionResolution);
  assert(explosionResolution.breederSpawns.length === 0, "Adjacent current-turn explosion must skip breeder growth.");
  assert(!explosionGrid.hasCell(4, 6), "Adjacent explosion space must remain empty this turn.");

  var fullGrid = buildGrid(levelConfig);
  fullGrid.addBubble({ row: 4, col: 6 }, "B");
  var fullManager = createManager(fullGrid);
  var fullResolution = createBreederResolution([]);
  fullManager._resolveBreederPhase(fullResolution);
  assert(fullResolution.breederSpawns.length === 0, "A breeder with full neighbors must do nothing.");
  var fullBreeder = fullGrid.getCell(4, 5);
  assert(fullBreeder && fullBreeder.entityType === "breeder", "Full-neighbor branch must not recolor the breeder.");
}

function validateSharedNarrowGrowth() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "BREEDER_SHARED_SPACE_VALIDATION",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: [
        ".B.B.......",
        "B..B......",
        ".B.B.......",
        "..........",
        "...........",
        "..........",
        "...........",
        ".........."
      ],
      specialEntities: [{
        id: "breeder_a",
        entityCategory: "reactive_ball",
        entityType: "breeder",
        row: 1,
        col: 1
      }, {
        id: "breeder_b",
        entityCategory: "reactive_ball",
        entityType: "breeder",
        row: 1,
        col: 2
      }]
    }
  };
  var grid = buildGrid(levelConfig);
  var manager = createManager(grid);
  var resolution = createBreederResolution([]);
  withRandomValues([0, 0, 0, 0], function () {
    manager._resolveBreederPhase(resolution);
  });
  assert(resolution.breederSpawns.length === 2, "Two breeders sharing two empty cells must both grow in one turn.");
  var spawnKeys = {};
  resolution.breederSpawns.forEach(function (entry) {
    var key = entry.row + ":" + entry.col;
    assert(!spawnKeys[key], "Breeders must not occupy the same cell.");
    spawnKeys[key] = true;
  });
  assert(spawnKeys["0:2"] && spawnKeys["2:2"], "Breeders must consume the shared narrow empty region sequentially.");
}

function validateRemovalAndRendering() {
  var levelConfig = buildNormalizedBreederLevel();
  var clearGrid = buildGrid(levelConfig);
  var removedBySpecialClear = clearGrid.removeCells([clearGrid.getCell(4, 5)]);
  assert(
    removedBySpecialClear.length === 1 && removedBySpecialClear[0].entityType === "breeder",
    "Special clear path must remove the breeder body."
  );

  var dropGrid = buildGrid(levelConfig);
  var removedByDrop = dropGrid.removeFloatingCells([dropGrid.getCell(4, 5)]);
  assert(
    removedByDrop.length === 1 && removedByDrop[0].entityType === "breeder",
    "Ordinary floating-drop path must remove the breeder body."
  );

  var selectorSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererStateSelectors.js"),
    "utf8"
  );
  var resourceSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererResourceConfig.js"),
    "utf8"
  );
  var runtimeSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererRuntimeMethods.js"),
    "utf8"
  );
  var boardSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js"),
    "utf8"
  );
  var breederFxSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneKeySplitterFxMethods.js"),
    "utf8"
  );
  var hiddenStateSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBarrierFxMethods.js"),
    "utf8"
  );
  assert(
    selectorSource.indexOf('ballLike.entityType === "breeder"') >= 0 &&
      selectorSource.indexOf('return "BREEDER";') >= 0,
    "Breeder render selector must resolve the BREEDER sprite code."
  );
  assert(
    resourceSource.indexOf('BREEDER: "game/image/ball/breeder_ball"') >= 0,
    "Breeder render resource must use breeder_ball."
  );
  assert(
    runtimeSource.indexOf("this._playBreederSpawnAnimation(runtimeSnapshot);") >= 0,
    "Runtime refresh must play breeder birth animation."
  );
  assert(
    breederFxSource.indexOf("LevelRenderer.prototype._playBreederSpawnAnimation") >= 0 &&
      breederFxSource.indexOf('new cc.Node("BreederSpawnFx_" + entry.id)') >= 0 &&
      breederFxSource.indexOf("cc.bezierTo(SPLITTER_SPAWN_FLY_DURATION, bezier)") >= 0,
    "Breeder spawn must reuse the splitter-style bezier flight."
  );
  assert(
    hiddenStateSource.indexOf("LevelRenderer.prototype._hideBreederSpawnTarget") >= 0 &&
      hiddenStateSource.indexOf("LevelRenderer.prototype._revealBreederSpawnTarget") >= 0 &&
      boardSource.indexOf("this._applyBreederSpawnHiddenBoardState") >= 0,
    "Breeder target board ball must stay hidden until the birth flight completes."
  );
  assert(
    fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/breeder_ball.png")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/breeder_ball.png.meta")),
    "Breeder image and meta file must exist."
  );
}

validateConfigAndCompactCodec();
validateSpawnAndBoardShiftOrder();
validateAdjacentExplosionAndFullNeighbors();
validateSharedNarrowGrowth();
validateRemovalAndRendering();

console.log("[OK] breeder_ball", "config, growth, birth flight, explosion skip, shared space, removal, rendering and board-shift order validated");
