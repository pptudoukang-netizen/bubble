"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var FairyAssistSystem = require("../gameplay-src/systems/FairyAssistSystem");
var FallingMarbleSystem = require("../gameplay-src/systems/FallingMarbleSystem");

var ROOT = path.resolve(__dirname, "..");
var TEST_LEVEL_KEY = "level_poison_attachment_test";
var TEST_LEVEL_PATH = path.join(ROOT, "assets/map/config/levels/" + TEST_LEVEL_KEY + ".json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRawPoisonLevel() {
  return readJson(TEST_LEVEL_PATH);
}

function buildNormalizedPoisonLevel() {
  return LevelConfigLoader.normalizeLevelConfig(buildRawPoisonLevel(), TEST_LEVEL_KEY);
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

function buildFallingSystems(levelConfig) {
  var fairy = new FairyAssistSystem();
  var falling = new FallingMarbleSystem();
  fairy.initialize({});
  falling.initialize({});
  falling.attachFairyAssistSystem(fairy);
  fairy.configureLevel(levelConfig);
  falling.configureLevel(levelConfig);
  fairy.syncCollisionCenters([0, 1, 2, 3, 4, 5].map(function (index) {
    return {
      index: index,
      x: -250 + index * 100,
      y: BoardLayout.jarBaseY + 80
    };
  }));
  return {
    fairy: fairy,
    falling: falling
  };
}

function validateConfigAndCodec() {
  assert(fs.existsSync(TEST_LEVEL_PATH), "Poison attachment test config is missing.");
  assert(fs.existsSync(TEST_LEVEL_PATH + ".meta"), "Poison attachment test config meta is missing.");
  var normalized = buildNormalizedPoisonLevel();
  assert(normalized.level.specialEntities.length === 0, "Poison attachment test must isolate cell attachments.");
  assert(normalized.level.layout[8] === "...........", "Poison attachment test must reserve a shootable bottom row.");
  assert(normalized.level.cellAttachments.length === 6, "Poison attachment test must contain six attachments.");
  normalized.level.cellAttachments.forEach(function (attachment, index) {
    assert(attachment.id === "poison_test_0" + (index + 1), "Poison attachment test id mismatch at " + index + ".");
    assert(attachment.type === "poison", "Poison attachment test type mismatch at " + index + ".");
    assert(attachment.row === 7 && attachment.col === index + 2, "Poison attachment test position mismatch at " + index + ".");
    assert(attachment.particleCount === 3, "Poison attachment must keep particleCount 3.");
  });

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "poison_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.cellAttachments[0].id === "poison_test_01",
    "Compact level round trip must preserve poison attachments."
  );

  var invalidCount = buildRawPoisonLevel();
  invalidCount.level.cellAttachments[0].particleCount = 2;
  assertConfigRejected(invalidCount, "particleCount must equal 3");

  var emptyTarget = buildRawPoisonLevel();
  emptyTarget.level.cellAttachments[0].row = 8;
  emptyTarget.level.cellAttachments[0].col = 0;
  assertConfigRejected(emptyTarget, "poison target must be an ordinary ball");
}

function assertConfigRejected(raw, expectedMessage) {
  var rejected = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(raw, TEST_LEVEL_KEY);
  } catch (error) {
    rejected = error.message.indexOf(expectedMessage) >= 0;
  }
  assert(rejected, "Invalid poison config must fail with: " + expectedMessage);
}

function validateBoardStateAndRelease() {
  var levelConfig = buildNormalizedPoisonLevel();
  var grid = buildGrid(levelConfig);
  var poisonedCell = grid.getCell(7, 2);
  assert(poisonedCell.poisonAttachmentId === "poison_test_01", "Board cell must expose poison overlay state.");
  assert(poisonedCell.poisonParticleCount === 3, "Board cell must expose poison particle count.");

  var removed = grid.removeCells([poisonedCell]);
  assert(removed.length === 1, "Normal elimination must remove poisoned ordinary ball.");
  var systems = buildFallingSystems(levelConfig);
  var manager = new GameManager();
  manager.systems = { fallingMarbleSystem: systems.falling };
  manager.runtimeEventSequence = 0;
  manager.pendingRuntimeEvents = [];
  var resolution = { poisonReleases: [] };
  manager._registerPoisonDropletsForEliminatedCells(removed, grid, resolution);

  assert(resolution.poisonReleases.length === 1, "Normal elimination must record one poison release batch.");
  assert(systems.falling.activeDrops.length === 3, "Poison release must create three physical droplets.");
  var speeds = systems.falling.activeDrops.map(function (drop) {
    assert(drop.dropKind === "poison_droplet", "Released particle must use poison_droplet drop kind.");
    return Math.round(Math.sqrt(drop.velocity.x * drop.velocity.x + drop.velocity.y * drop.velocity.y));
  });
  assert(new Set(speeds).size === 3, "Three poison droplets must start with three different speeds.");

  var floatingGrid = buildGrid(levelConfig);
  var floatingSystems = buildFallingSystems(levelConfig);
  var floatingRemoved = floatingGrid.removeFloatingCells([floatingGrid.getCell(7, 2)]);
  assert(floatingRemoved[0].poisonAttachmentId === "poison_test_01", "Floating removal must still clear poison overlay state.");
  assert(floatingSystems.falling.activeDrops.length === 0, "Unsupported floating removal must not create poison droplets.");
}

function validatePoisonMakesFairyLeave() {
  var levelConfig = buildNormalizedPoisonLevel();
  var grid = buildGrid(levelConfig);
  var systems = buildFallingSystems(levelConfig);
  var spawnEvent = systems.fairy._spawnFairy(3, grid.getCellPosition(7, 2))[0];
  var fairyBefore = systems.fairy.snapshot().slots[spawnEvent.slotIndex].fairy;
  assert(fairyBefore && fairyBefore.id === spawnEvent.fairyId, "Validation requires a live fairy target.");

  var manager = new GameManager();
  manager.systems = { fallingMarbleSystem: systems.falling };
  manager.runtimeEventSequence = 0;
  manager.pendingRuntimeEvents = [];
  var removed = grid.removeCells([grid.getCell(7, 2)]);
  manager._registerPoisonDropletsForEliminatedCells(removed, grid, { poisonReleases: [] });
  var droplet = systems.falling.activeDrops[0];
  droplet.position.x = fairyBefore.position.x;
  droplet.position.y = fairyBefore.position.y;
  var hit = systems.falling._applyPoisonFairyCollision(droplet);
  assert(hit && hit.fairyId === fairyBefore.id, "Poison droplet must identify the collided fairy.");
  assert(droplet.active === false, "Poison droplet must be consumed on fairy collision.");
  assert(systems.fairy.snapshot().slots[spawnEvent.slotIndex].fairy === null, "Poison collision must make fairy leave its slot.");
}

function validateRenderAndAuthoritativeCallSite() {
  ["poison_overlay", "poison_droplet"].forEach(function (assetName) {
    var pngPath = path.resolve(__dirname, "../assets/game/image/ball/" + assetName + ".png");
    assert(fs.existsSync(pngPath), "Poison asset is missing: " + assetName + ".png");
    assert(fs.statSync(pngPath).size > 0, "Poison asset is empty: " + assetName + ".png");
    assert(fs.existsSync(pngPath + ".meta"), "Poison asset meta is missing: " + assetName + ".png.meta");
  });
  var renderSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js"),
    "utf8"
  );
  assert(renderSource.indexOf("syncPoisonOverlay") >= 0, "Board rendering must synchronize poison overlay.");
  assert(
    renderSource.indexOf("syncPoisonOverlay(this, dropNode, drop);") >= 0,
    "Unsupported poisoned balls must keep their overlay while the ball itself falls."
  );
  assert(renderSource.indexOf('drop.entityType === "poison_droplet"') >= 0, "Falling rendering must use poison droplet size.");

  var finalizeSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/core/GameManagerShotFinalizeMethods.js"),
    "utf8"
  );
  var normalRemovalIndex = finalizeSource.indexOf("var removedMatches = grid.removeCells(matchedCells);");
  var poisonReleaseIndex = finalizeSource.indexOf("this._registerPoisonDropletsForEliminatedCells(removedMatches, grid, resolution);");
  assert(normalRemovalIndex >= 0 && poisonReleaseIndex > normalRemovalIndex, "Poison release must follow authoritative normal match removal.");
  assert(
    finalizeSource.indexOf("_registerPoisonDropletsForEliminatedCells(removedFloating") < 0,
    "Floating removal path must not register poison droplets."
  );
}

validateConfigAndCodec();
validateBoardStateAndRelease();
validatePoisonMakesFairyLeave();
validateRenderAndAuthoritativeCallSite();

console.log("[OK] poison attachment test config, overlay, three-speed droplets, floating exclusion and fairy departure validated");
