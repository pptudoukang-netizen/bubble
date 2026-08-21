"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

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

function buildNormalizedBudLevel() {
  return LevelConfigLoader.normalizeLevelConfig(
    readJson(path.resolve(__dirname, "../assets/map/config/levels/level_bud_test.json")),
    "level_bud_test"
  );
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

function createBudResolution() {
  return {
    floating: [],
    collected: [],
    budHatches: [],
    budHatchedCells: [],
    budRecolors: [],
    spiritCocoonOpenings: [],
    boardCleared: false
  };
}

function createManager(grid, resolution, levelConfig) {
  var manager = new GameManager();
  var supportSystem = new SupportSystem();
  supportSystem.initialize({});
  supportSystem.configureLevel(levelConfig);
  manager.shotsFired = 1;
  manager.systems = {
    bubbleGrid: grid,
    supportSystem: supportSystem
  };
  manager.pendingBudHatches = [];
  manager.lastResolution = resolution;
  manager.__registeredBudDropBatches = [];
  manager._collectRemovedKeysAndResolveUnlocks = function () {};
  manager._registerResolutionDrops = function (cells, registeredGrid, registeredResolution, dropOptions, timingOptions) {
    manager.__registeredBudDropBatches.push({
      cells: cells.slice(),
      grid: registeredGrid,
      resolution: registeredResolution,
      dropOptions: dropOptions,
      timingOptions: timingOptions
    });
  };
  manager._isBoardCleared = function (activeGrid) {
    return activeGrid.getCells().length === 0;
  };
  manager._continueAfterBudHatches = function () {
    manager.__budContinuationCount = (manager.__budContinuationCount || 0) + 1;
  };
  return manager;
}

function validateConfigAndCodec() {
  var normalized = buildNormalizedBudLevel();
  assert(normalized.level.specialEntities.length === 1, "Bud test level must isolate one special entity.");
  assert(
    normalized.level.specialEntities[0].entityCategory === "reactive_ball" &&
      normalized.level.specialEntities[0].entityType === "bud",
    "LevelConfigLoader must preserve reactive_ball/bud."
  );

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "bud_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  assert(
    compact.levels.level_001.level.specialEntities[0][2] === "u",
    "Compact bud must use type code `u`."
  );
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.specialEntities[0].entityType === "bud",
    "Expanded compact config must restore bud."
  );
}

function validateNormalShotHatchAfterAnimation() {
  var levelConfig = buildNormalizedBudLevel();
  var grid = buildGrid(levelConfig);
  var removedNeighbor = grid.removeCells([grid.getCell(6, 1)]);
  assert(removedNeighbor.length === 1, "Bud validation must remove one adjacent ordinary ball.");
  var resolution = createBudResolution();
  var manager = createManager(grid, resolution, levelConfig);
  var queued = manager._queueBudHatchesAdjacentToCells(removedNeighbor, resolution, {
    ballCategory: "normal",
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  });
  assert(queued.length === 1, "Adjacent ordinary elimination must queue one bud hatch.");
  assert(resolution.budHatches.length === 1, "Resolution must expose one bud hatch animation entry.");
  assert(
    manager._filterFloatingSpiritCocoons([grid.getCell(6, 2)], resolution).length === 0,
    "A bud queued by adjacent elimination must survive the same resolution's support scan."
  );
  assert(
    resolution.budHatches[0].duration === SpecialAnimationTiming.bud.totalDuration,
    "Bud hatch resolution duration must match the eight-frame timing contract."
  );

  var almostComplete = SpecialAnimationTiming.bud.totalDuration - 0.001;
  assert(manager._updatePendingBudHatches(almostComplete) === false, "Bud must not hatch before animation completion.");
  var liveBud = grid.getCell(6, 2);
  assert(liveBud && liveBud.entityType === "bud", "Bud body must remain live while the break animation plays.");
  assert(manager._updatePendingBudHatches(0.001) === true, "Bud must hatch when the animation duration completes.");

  var hatched = grid.getCell(6, 2);
  assert(
    hatched && hatched.entityCategory === "normal_ball" && hatched.color === "R",
    "Normal fired ball must hatch the bud into its own color at the original coordinate."
  );
  grid.getNeighborCoordinates(6, 2).forEach(function (coordinate) {
    var neighbor = grid.getCell(coordinate.row, coordinate.col);
    if (neighbor && neighbor.entityCategory === "normal_ball") {
      assert(neighbor.color === "R", "Every ordinary ball in the bud neighbor ring must use the hatch color.");
    }
  });
  assert(resolution.budRecolors.length >= 1, "Bud hatch must record neighboring ordinary recolors.");
  var hatchEvents = manager.pendingRuntimeEvents.filter(function (event) {
    return event.type === "bud_hatched";
  });
  assert(hatchEvents.length === 1, "One completed bud hatch must emit exactly one bud_hatched audio event.");
  assert(
    hatchEvents[0].bud_id === resolution.budHatches[0].budId &&
      hatchEvents[0].color === "R" &&
      hatchEvents[0].recolored_count === resolution.budRecolors.length &&
      hatchEvents[0].source_entity_category === "normal_ball" &&
      hatchEvents[0].source_entity_type === null,
    "Bud hatch audio event must preserve the authoritative hatch payload."
  );
  assert(manager.__budContinuationCount === 1, "Bud completion must continue the post-shot phase exactly once.");
}

function validateUnsupportedHatchDropsImmediately() {
  var levelConfig = buildNormalizedBudLevel();
  var grid = buildGrid(levelConfig);
  var bud = grid.getCell(6, 2);
  var triggerNeighbor = grid.getCell(6, 1);
  assert(bud && triggerNeighbor, "Unsupported bud validation requires its bud and trigger neighbor.");
  var removedScaffold = grid.removeCells(grid.getCells().filter(function (cell) {
    return cell.id !== bud.id && cell.id !== triggerNeighbor.id;
  }));
  assert(removedScaffold.length > 0, "Unsupported bud validation must remove the supporting scaffold.");
  var removedNeighbor = grid.removeCells([triggerNeighbor]);
  assert(removedNeighbor.length === 1, "Unsupported bud validation must remove its trigger neighbor.");

  var resolution = createBudResolution();
  var manager = createManager(grid, resolution, levelConfig);
  manager._queueBudHatchesAdjacentToCells(removedNeighbor, resolution, {
    ballCategory: "normal",
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  });
  assert(
    manager._filterFloatingSpiritCocoons([grid.getCell(6, 2)], resolution).length === 0,
    "Unsupported bud must remain protected until its hatch animation completes."
  );

  manager._updatePendingBudHatches(SpecialAnimationTiming.bud.totalDuration);

  assert(grid.getCell(6, 2) === null, "Unsupported ordinary ball created by bud hatch must leave the grid immediately.");
  assert(resolution.budHatchedCells.length === 1, "Unsupported bud must still record its completed hatch.");
  var hatchedId = resolution.budHatchedCells[0].id;
  assert(
    resolution.floating.some(function (cell) {
      return cell.id === hatchedId && cell.row === 6 && cell.col === 2 && cell.entityCategory === "normal_ball";
    }),
    "Unsupported hatched ordinary ball must be recorded as floating."
  );
  assert(
    resolution.collected.some(function (cell) {
      return cell.id === hatchedId;
    }),
    "Unsupported hatched ordinary ball must join the resolution collection."
  );
  assert(manager.__registeredBudDropBatches.length === 1, "Unsupported hatch must register exactly one immediate drop batch.");
  var dropBatch = manager.__registeredBudDropBatches[0];
  assert(
    dropBatch.cells.length === 1 && dropBatch.cells[0].id === hatchedId,
    "Unsupported hatch drop batch must contain the hatched ordinary ball."
  );
  assert(
    dropBatch.grid === grid &&
      dropBatch.resolution === resolution &&
      dropBatch.dropOptions === undefined &&
      dropBatch.timingOptions &&
      dropBatch.timingOptions.skipEliminationPresentationHold === true,
    "Post-hatch drop must start immediately without waiting for the completed elimination presentation."
  );
  assert(resolution.boardCleared === true, "Dropping the last unsupported hatch must clear the board.");
  assert(manager.__budContinuationCount === 1, "Unsupported hatch drop must continue the post-shot phase exactly once.");
}

function validateSpecialShotColorSelection() {
  var levelConfig = buildNormalizedBudLevel();
  var grid = buildGrid(levelConfig);
  var removedNeighbor = grid.removeCells([grid.getCell(6, 1)]);
  var resolution = createBudResolution();
  var manager = createManager(grid, resolution, levelConfig);
  manager.budRandom = function () {
    return 0;
  };
  manager._queueBudHatchesAdjacentToCells(removedNeighbor, resolution, {
    ballCategory: "skill",
    color: null,
    entityCategory: "skill_ball",
    entityType: "rainbow"
  });
  assert(
    resolution.budHatches[0].color === "B",
    "Special fired ball must choose from sorted ordinary colors still present on the board."
  );
  assert(
    resolution.budHatches[0].sourceEntityType === "rainbow",
    "Special fired ball type must be recorded but must not be used as a hatch color."
  );
}

function validateRangeRemoval() {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var manager = new GameManager();
  manager.bootstrap();
  manager.startLevel(buildNormalizedBudLevel(), {
    seed: "bud_range_validation",
    attemptIndex: 1,
    runMode: "bud_validation"
  });
  manager.shotsFired = 1;
  var resolution = manager._resolveBlastShot({
    ball: {
      ballCategory: "skill",
      color: null,
      entityCategory: "skill_ball",
      entityType: "blast"
    },
    shotPlan: {
      collidedCell: { row: 6, col: 1 }
    }
  }, { row: 6, col: 1 });
  assert(
    resolution.matched.some(function (cell) {
      return cell.entityCategory === "reactive_ball" && cell.entityType === "bud";
    }),
    "Blast resolution must include the bud body in its removed cells."
  );
  assert(manager.systems.bubbleGrid.getCell(6, 2) === null, "Range explosion must leave the bud coordinate empty.");
  assert(resolution.budHatches.length === 0, "A bud removed by range explosion must not hatch afterward.");
}

function validateRenderingAndAssets() {
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
  var fxSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBudFxMethods.js"),
    "utf8"
  );
  assert(
    selectorSource.indexOf('ballLike.entityType === "bud"') >= 0 &&
      selectorSource.indexOf('return "BUD";') >= 0,
    "Bud render selector must resolve the BUD sprite code."
  );
  assert(resourceSource.indexOf('BUD: "game/image/ball/bud"') >= 0, "Bud body resource path is missing.");
  for (var frameIndex = 1; frameIndex <= 8; frameIndex += 1) {
    var resourceContract = 'BUD_' + frameIndex + ': "game/image/ball/bud_' + frameIndex + '"';
    assert(resourceSource.indexOf(resourceContract) >= 0, "Bud frame resource is missing: " + resourceContract);
    assert(
      fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/bud_" + frameIndex + ".png")) &&
        fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/bud_" + frameIndex + ".png.meta")),
      "Bud break frame and meta must exist: bud_" + frameIndex
    );
  }
  assert(
    runtimeSource.indexOf("this._playBudHatchAnimations(runtimeSnapshot);") >= 0,
    "Runtime refresh must play bud hatch animation."
  );
  assert(
    fxSource.indexOf("LevelRenderer.prototype._playBudHatchAnimations") >= 0 &&
      fxSource.indexOf('new cc.Node("BudHatchFx_" + hatch.id)') >= 0 &&
      fxSource.indexOf('("BUD_" + frameIndex)') >= 0,
    "Bud hatch renderer must play the strict bud_1 through bud_8 frame sequence."
  );
  assert(
    fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/bud.png")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/game/image/ball/bud.png.meta")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/ui/image/preview_balls/bud.png")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/ui/image/preview_balls/bud.png.meta")),
    "Bud body and UI preview assets must exist."
  );
}

function validateAudioRouting() {
  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    flowerDieSfxResource: "sound/flower_die"
  });
  assert(audioConfig.sfxMap.flowerDie === "sound/flower_die", "Bud hatch SFX must resolve exactly to sound/flower_die.");
  assert(
    fs.existsSync(path.resolve(__dirname, "../assets/audio/sound/flower_die.mp3")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/audio/sound/flower_die.mp3.meta")),
    "Bud hatch flower_die audio asset and meta must exist."
  );

  var playedSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (key) {
      playedSfxKeys.push(key);
    }
  }, {
    runtimeEvents: [{
      type: "bud_hatched",
      bud_id: "bud_audio_validation",
      color: "R",
      recolored_count: 3,
      source_entity_category: "normal_ball",
      source_entity_type: null
    }]
  });
  assert(
    playedSfxKeys.length === 1 && playedSfxKeys[0] === "flowerDie",
    "Each authoritative bud_hatched event must play flower_die exactly once."
  );
}

validateConfigAndCodec();
validateNormalShotHatchAfterAnimation();
validateUnsupportedHatchDropsImmediately();
validateSpecialShotColorSelection();
validateRangeRemoval();
validateRenderingAndAssets();
validateAudioRouting();

console.log("[OK] bud_ball", "config, compact codec, delayed hatch, flower_die audio, immediate unsupported drop, color rules, neighbor recolor, range removal and eight-frame rendering validated");
