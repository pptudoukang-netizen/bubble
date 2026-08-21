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
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
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
  assert(floating.some(function (cell) { return cell.row === 1 && cell.col === 3; }), "Unsupported vine spirit must float.");
  assert(floating.some(function (cell) { return cell.row === 4 && cell.col === 4; }), "Unsupported entangled ball must float.");
  assert(floating.some(function (cell) { return cell.row === 5 && cell.col === 4; }), "Ball below an unsupported entangled ball must float.");

  var protectedRemoval = grid.removeCells([
    grid.getCell(1, 3),
    grid.getCell(4, 4)
  ]);
  assert(protectedRemoval.length === 0, "Vine spirit and entangled ball must resist normal removal.");

  var removedFloating = grid.removeFloatingCells(floating);
  var droppedEntangled = removedFloating.find(function (cell) {
    return cell.row === 4 && cell.col === 4;
  });
  assert(droppedEntangled && !droppedEntangled.vineOwnerId, "Entangled ball must release its vine before falling.");
  assert(!grid.getCell(1, 3), "Unsupported vine spirit must leave the board through the floating-drop path.");
  assert(
    grid.getCell(0, 1) && !grid.getCell(0, 1).vineOwnerId,
    "Dropping vine spirit must clear its vines from supported balls."
  );

  var supportedSpiritGrid = buildGrid([
    "RRR.......",
    ".........",
    "..........",
    ".........",
    "....R.....",
    "....R....",
    "..........",
    "........."
  ], 0, 3);
  previewAndEntangle(supportedSpiritGrid, 4, 4);
  var isolatedFloating = supportSystem.findFloatingCells(supportedSpiritGrid);
  var isolatedDrops = supportedSpiritGrid.removeFloatingCells(isolatedFloating);
  var isolatedEntangledDrop = isolatedDrops.find(function (cell) {
    return cell.row === 4 && cell.col === 4;
  });
  assert(isolatedEntangledDrop && !isolatedEntangledDrop.vineOwnerId, "Falling vine ball must release independently.");
  assert(
    supportedSpiritGrid.getCell(0, 3) && supportedSpiritGrid.getCell(0, 3).health === 3,
    "Supported vine spirit must remain after its unsupported vine ball falls."
  );
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
  assert(directVineResolution.releasedVines.length === 0, "Direct hit without elimination must not release an active vine.");
  assert(grid.getCell(0, 0).vineOwnerId === "vine_spirit_validation", "Direct hit without elimination must preserve the vine.");
  var removedDirectNeighbor = grid.removeCells([grid.getCell(1, 0)]);
  manager._resolveVinesAfterRemoval(removedDirectNeighbor, grid, directVineResolution);
  assert(directVineResolution.releasedVines.length === 1, "An eliminated neighboring ball must release the directly hit vine.");
  assert(directVineResolution.releasedVines[0].sourceType === "adjacent_elimination", "Vine release must record adjacent elimination as its only source.");
  assert(grid.getCell(0, 0).color === "R" && !grid.getCell(0, 0).vineOwnerId, "Adjacent elimination must preserve the underlying normal ball after releasing its vine.");

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

function validateExplosionInteractions() {
  var grid = buildGrid([
    "R.........",
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
  previewAndEntangle(grid, 1, 1);

  var entangledBeforeExplosion = grid.getCell(1, 1);
  var spiritBeforeExplosion = grid.getCell(1, 2);
  var resolution = createVineResolution();
  manager._resolveVineSpiritsHitByExplosion([
    entangledBeforeExplosion,
    spiritBeforeExplosion,
    entangledBeforeExplosion,
    spiritBeforeExplosion
  ], grid, resolution);

  assert(resolution.releasedVines.length === 0, "Direct explosion coverage without a neighboring elimination must not release a vine.");
  assert(resolution.vineSpiritHits.length === 1, "One explosion must damage each affected spirit once.");
  assert(resolution.vineSpiritHits[0].sourceType === "explosion", "Explosion spirit damage must record its source.");
  assert(grid.getCell(1, 2).health === 2, "Explosion must deal exactly 1 damage to the vine spirit.");
  assert(
    grid.getCell(1, 1) && grid.getCell(1, 1).color === "R" && grid.getCell(1, 1).vineOwnerId === "vine_spirit_validation",
    "Direct explosion coverage must preserve both the vine and its underlying normal ball."
  );

  manager._resolveVineSpiritsHitByExplosion([grid.getCell(1, 2)], grid, resolution);
  assert(grid.getCell(1, 2).health === 2, "The same resolution must not damage one spirit twice.");

  var blastGrid = buildGrid([
    "R.........",
    "RR.......",
    "..........",
    ".........",
    "..........",
    ".........",
    "..........",
    "........."
  ], 1, 2);
  previewAndEntangle(blastGrid, 1, 1);
  var blastManager = new GameManager();
  blastManager.shotsFired = 1;
  blastManager.systems = {
    bubbleGrid: blastGrid,
    supportSystem: {
      findFloatingCells: function () {
        return [];
      },
      clearFloatingCells: function () {
        throw new Error("Vine blast fixture without swirl must not defer support.");
      }
    },
    fallingMarbleSystem: {
      registerDrops: function () {}
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  blastManager._pushBombExplosionEvent = function () {};
  blastManager._registerIceCollection = function () { return 0; };
  blastManager._resolveReactiveEntitiesAfterRemoval = function () { return []; };
  blastManager._hasPendingMolotovBlasts = function () { return false; };
  blastManager._collectRemovedKeysAndResolveUnlocks = function () {};
  blastManager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  blastManager._registerResolutionDrops = function () {};
  blastManager._pushBubbleBreakEvent = function () {};
  blastManager._registerMatchedObjectiveCollection = function () {};
  blastManager._isBoardCleared = function () { return false; };
  blastManager._applyResolutionDropScore = function () {};
  blastManager._registerComboElimination = function () {};
  blastManager._createImpactEventFromCell = function () { return null; };
  var previousCc = global.cc;
  global.cc = { log: function () {} };
  var blastResolution = blastManager._resolveBlastShot({
    ball: {
      ballCategory: "skill",
      color: null,
      entityCategory: "skill_ball",
      entityType: "blast"
    }
  }, { row: 1, col: 1 });
  if (previousCc === undefined) {
    delete global.cc;
  } else {
    global.cc = previousCc;
  }
  assert(blastResolution.vineSpiritHits.length === 1, "Blast shot must route explosion damage into vine resolution.");
  assert(blastResolution.releasedVines.length === 1, "Blast shot must release a vine only through an eliminated neighboring ball.");
  assert(blastResolution.releasedVines[0].sourceType === "adjacent_elimination", "Blast-driven vine release must record adjacent elimination as its source.");
  assert(blastGrid.getCell(1, 2).health === 2, "Blast shot must deal exactly 1 damage to the spirit.");
  assert(
    blastGrid.getCell(1, 1) && blastGrid.getCell(1, 1).color === "R" && !blastGrid.getCell(1, 1).vineOwnerId,
    "Blast shot must preserve the released underlying ball."
  );
}

function validateTopAnchorCollapseDropsVineEntities() {
  var grid = buildGrid([
    "RRRR.......",
    "..........",
    "...........",
    "..........",
    "...........",
    "..........",
    "...........",
    ".........."
  ], 1, 2);
  previewAndEntangle(grid, 0, 1);

  var manager = new GameManager();
  var registeredDrops = [];
  manager.state = "running";
  manager.lastResolution = {
    floating: []
  };
  manager.systems.bubbleGrid = grid;
  manager._registerResolutionDrops = function (removedCells) {
    registeredDrops = removedCells.slice();
  };

  assert(manager._tryTopAnchorCollapse(), "Top anchor collapse must trigger with more than five empty top slots.");
  assert(grid.getCells().length === 0, "Top anchor collapse must remove the vine spirit and every entangled ball.");
  assert(registeredDrops.length === 5, "Top anchor collapse must register every vine entity and normal ball as a drop.");
  var droppedEntangled = registeredDrops.find(function (cell) {
    return cell.row === 0 && cell.col === 1;
  });
  assert(droppedEntangled && !droppedEntangled.vineOwnerId, "Top anchor collapse must release a vine before its ball falls.");
  assert(registeredDrops.some(function (cell) {
    return cell.entityCategory === "reactive_ball" && cell.entityType === "vine_spirit";
  }), "Top anchor collapse must include the vine spirit in falling cells.");
  assert(manager.state === "won_pending", "Top anchor collapse must wait for every registered drop to settle.");
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
  var vineAudioEvents = manager.pendingRuntimeEvents.filter(function (event) {
    return event.type === "vine_entanglement_started";
  });
  assert(
    vineAudioEvents.length === 1 && vineAudioEvents[0].count === 1,
    "Vine preview start must emit one vine_entanglement_started audio event with the target count."
  );

  manager._updatePendingVineCast(SpecialAnimationTiming.vineCast.previewDuration * 0.5);
  assert(!continued, "Vine cast must remain pending during the warning.");
  assert(
    manager.pendingRuntimeEvents.filter(function (event) { return event.type === "vine_entanglement_started"; }).length === 1,
    "Incomplete vine warning must not emit a duplicate entanglement audio event."
  );
  manager._updatePendingVineCast(SpecialAnimationTiming.vineCast.previewDuration * 0.5);
  var entangled = grid.getCell(cast.targetRow, cast.targetCol);
  assert(entangled.vineOwnerId === "vine_spirit_validation", "Warning completion must activate the vine.");
  assert(!entangled.vinePreviewOwnerId, "Warning completion must clear preview ownership.");
  assert(cast.completed === true && continued, "Completed vine cast must resume the shot state machine.");
  assert(
    manager.pendingRuntimeEvents.filter(function (event) { return event.type === "vine_entanglement_started"; }).length === 1,
    "Completed vine cast must not emit a duplicate entanglement audio event."
  );
  assert(
    !manager.pendingRuntimeEvents.some(function (event) { return event.type === "vine_entangled"; }),
    "Vine completion must not retain the delayed vine_entangled audio event."
  );

  var nonThirdResolution = createVineResolution();
  manager.shotsFired = 4;
  assert(!manager._beginVineCastForResolution(nonThirdResolution), "Non-third shots must not start a vine cast.");
}

function validateVineEntanglementAudioRouting() {
  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    vinesSfxResource: "sound/vines"
  });
  assert(audioConfig.sfxMap.vines === "sound/vines", "Vine sfx config must map vines to sound/vines.");

  var playedSfx = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (key) {
      playedSfx.push(key);
    }
  }, {
    runtimeEvents: [{
      type: "vine_entanglement_started",
      count: 2
    }]
  });
  assert(playedSfx.length === 1 && playedSfx[0] === "vines", "vine_entanglement_started must play the vines sfx once.");
}

validateConfigAndCompactCodec();
validateMatchAndSupportRules();
validateDamageReleaseAndDeathCleanup();
validateExplosionInteractions();
validateTopAnchorCollapseDropsVineEntities();
validateThirdShotPreviewAndCast();
validateVineEntanglementAudioRouting();
console.log("[OK] vine_spirit config, codec, health, adjacent-only vine release, direct/explosion spirit damage, unsupported and top-collapse drops, third-shot preview, entanglement audio and death cleanup");
