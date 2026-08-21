"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var FairyAssistSystem = require("../gameplay-src/systems/FairyAssistSystem");
var FallingMarbleSystem = require("../gameplay-src/systems/FallingMarbleSystem");

var ROOT = path.resolve(__dirname, "..");
var TEST_LEVEL_KEY = "level_ice_crystal_attachment_test";

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

function buildRawLevel() {
  return readJson(path.join(ROOT, "assets/map/config/levels/" + TEST_LEVEL_KEY + ".json"));
}

function buildNormalizedLevel() {
  return LevelConfigLoader.normalizeLevelConfig(buildRawLevel(), TEST_LEVEL_KEY);
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

function assertConfigRejected(raw, expectedMessage) {
  var rejected = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(raw, TEST_LEVEL_KEY);
  } catch (error) {
    rejected = error.message.indexOf(expectedMessage) >= 0;
  }
  assert(rejected, "Invalid ice crystal config must fail with: " + expectedMessage);
}

function validateConfigAndCodec() {
  var normalized = buildNormalizedLevel();
  assert(normalized.level.cellAttachments.length === 10, "Test level must preserve ten ice crystal attachments.");
  assert(normalized.level.layout[8] === "...........", "Test level must reserve a shootable row below the attachments.");
  normalized.level.cellAttachments.forEach(function (attachment, index) {
    assert(attachment.type === "ice_crystal", "Normalized attachment type must be ice_crystal.");
    assert(attachment.row === 7 && attachment.col === index, "Test attachments must cover lowest occupied row columns 0-9.");
    assert(attachment.particleCount === undefined, "Ice crystal attachment must not carry poison particleCount.");
  });

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "ice_crystal_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.cellAttachments[0].id === "ice_crystal_test_01",
    "Compact level round trip must preserve ice crystal attachments."
  );

  var invalidParticleCount = buildRawLevel();
  invalidParticleCount.level.cellAttachments[0].particleCount = 1;
  assertConfigRejected(invalidParticleCount, "particleCount is not allowed for ice_crystal");

  var emptyTarget = buildRawLevel();
  emptyTarget.level.cellAttachments[0].row = 5;
  emptyTarget.level.cellAttachments[0].col = 1;
  assertConfigRejected(emptyTarget, "ice_crystal target must be an ordinary ball");

  var duplicateTarget = buildRawLevel();
  duplicateTarget.level.cellAttachments[1].col = 0;
  assertConfigRejected(duplicateTarget, "duplicate target `7:0`");
}

function registerSingleIcicle(levelConfig, grid, removedCell, systems) {
  var manager = new GameManager();
  manager.systems = { fallingMarbleSystem: systems.falling };
  manager.runtimeEventSequence = 0;
  manager.pendingRuntimeEvents = [];
  var resolution = { icicleReleases: [] };
  manager._registerIciclesForEliminatedCells([removedCell], grid, resolution);
  assert(resolution.icicleReleases.length === 1, "Normal elimination must record one icicle release.");
  assert(systems.falling.activeDrops.length === 1, "One attachment must create one whole icicle drop.");
  assert(manager.pendingRuntimeEvents.length === 1, "One icicle drop must emit one runtime event.");
  assert(manager.pendingRuntimeEvents[0].type === "icicle_released", "Icicle drop must emit icicle_released at registration time.");
  assert(manager.pendingRuntimeEvents[0].dropId === systems.falling.activeDrops[0].id, "Icicle runtime event must identify the actual falling drop.");
  return systems.falling.activeDrops[0];
}

function validateBoardStateAndRelease() {
  var levelConfig = buildNormalizedLevel();
  var grid = buildGrid(levelConfig);
  var attachedCell = grid.getCell(7, 0);
  assert(attachedCell.iceCrystalAttachmentId === "ice_crystal_test_01", "Board cell must expose ice crystal state.");
  var removed = grid.removeCells([attachedCell]);
  assert(removed.length === 1, "Normal elimination must remove the attached ordinary ball.");
  var systems = buildFallingSystems(levelConfig);
  var icicle = registerSingleIcicle(levelConfig, grid, removed[0], systems);
  assert(icicle.dropKind === "icicle", "Released object must use icicle dropKind.");
  assert(icicle.entityCategory === "effect_particle" && icicle.entityType === "icicle", "Icicle must use its own effect entity identity.");
  assert(icicle.velocity.x === 0 && icicle.velocity.y < 0, "Icicle must launch straight downward.");
  assert(icicle.rotationSpeed === 0, "Icicle must remain upright while falling.");

  var floatingGrid = buildGrid(levelConfig);
  var floatingSystems = buildFallingSystems(levelConfig);
  var floatingRemoved = floatingGrid.removeFloatingCells([floatingGrid.getCell(7, 0)]);
  assert(floatingRemoved[0].iceCrystalAttachmentId === "ice_crystal_test_01", "Floating removal must clear the attached ball state.");
  assert(floatingSystems.falling.activeDrops.length === 0, "Unsupported floating removal must not create icicles.");
}

function validateIcicleMakesFairyLeave() {
  var levelConfig = buildNormalizedLevel();
  var grid = buildGrid(levelConfig);
  var systems = buildFallingSystems(levelConfig);
  var spawnEvents = systems.fairy.resolveAfterShot({
    matched: [{ row: 7, col: 0 }],
    floating: []
  }, grid);
  assert(spawnEvents.length === 1 && spawnEvents[0].type === "spawn", "Fairy setup must create one fixed fairy.");
  var fairyBefore = systems.fairy.snapshot().slots[spawnEvents[0].slotIndex].fairy;
  var removed = grid.removeCells([grid.getCell(7, 0)]);
  var icicle = registerSingleIcicle(levelConfig, grid, removed[0], systems);
  icicle.position.x = fairyBefore.position.x;
  icicle.position.y = fairyBefore.position.y;
  var hit = systems.falling._applyIcicleFairyCollision(icicle);
  assert(hit && hit.fairyId === fairyBefore.id, "Icicle must identify the collided fixed fairy.");
  assert(icicle.active === false, "Icicle must be consumed on fixed fairy collision.");
  assert(systems.fairy.snapshot().slots[spawnEvents[0].slotIndex].fairy === null, "Icicle collision must make the fixed fairy leave.");
}

function validateRenderAndSettlementContracts() {
  [
    "assets/game/image/ball/ice_crystal_ball.png",
    "assets/game/image/ball/ice_crystal_ball.png.meta",
    "assets/game/image/ball/icicle.png",
    "assets/game/image/ball/icicle.png.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(ROOT, relativePath)), "Ice crystal resource is missing: " + relativePath + ".");
  });

  var resourceConfig = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  var boardRenderer = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneBoardMethods.js"), "utf8");
  var finalizer = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerShotFinalizeMethods.js"), "utf8");
  assert(resourceConfig.indexOf('ICE_CRYSTAL_ATTACHMENT: "game/image/ball/ice_crystal_ball"') >= 0, "Ice crystal overlay resource contract is missing.");
  assert(resourceConfig.indexOf('ICICLE: "game/image/ball/icicle"') >= 0, "Icicle resource contract is missing.");
  assert(boardRenderer.indexOf("ICE_CRYSTAL_ATTACHMENT_OPACITY = 200") >= 0, "Attached ice crystal opacity must be 200.");
  assert(boardRenderer.indexOf("ICICLE_SIZE = { width: 64, height: 34 }") >= 0, "Icicle must render as the whole 64x34 sprite without fragments.");
  assert(finalizer.indexOf("_registerIciclesForEliminatedCells(removedMatches, grid, resolution)") >= 0, "Icicles must release from normal matched removal.");
  assert(finalizer.indexOf("_registerIciclesForEliminatedCells(unsupportedRemoved") === -1, "Unsupported drops must not release icicles.");
}

function validateIcicleAudioRouting() {
  [
    "assets/audio/sound/icicle.mp3",
    "assets/audio/sound/icicle.mp3.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(ROOT, relativePath)), "Icicle audio resource is missing: " + relativePath + ".");
  });

  var bootstrapSource = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrap.js"), "utf8");
  assert(bootstrapSource.indexOf('default: "sound/icicle"') >= 0, "GameBootstrap must expose sound/icicle as the icicle SFX resource.");

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    icicleSfxResource: "sound/icicle"
  });
  assert(audioConfig.sfxMap.icicle === "sound/icicle", "Icicle SFX config must map to sound/icicle.");

  var playedSfx = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (key) {
      playedSfx.push(key);
    }
  }, {
    runtimeEvents: [
      {
        type: "icicle_released",
        attachmentId: "ice_crystal_test_01",
        sourceCellId: "cell_7_0",
        row: 7,
        col: 0,
        dropId: "drop_icicle_01"
      },
      {
        type: "icicle_released",
        attachmentId: "ice_crystal_test_02",
        sourceCellId: "cell_7_1",
        row: 7,
        col: 1,
        dropId: "drop_icicle_02"
      }
    ]
  });
  assert(
    playedSfx.length === 2 && playedSfx.every(function (key) { return key === "icicle"; }),
    "Every actual icicle release must play icicle SFX exactly once."
  );

  var invalidEventRejected = false;
  try {
    GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
      _trackRuntimeTelemetryEvent: function () {},
      _playSfx: function () {}
    }, {
      runtimeEvents: [{
        type: "icicle_released",
        attachmentId: "ice_crystal_test_01",
        sourceCellId: "cell_7_0",
        row: 7,
        col: 0
      }]
    });
  } catch (error) {
    invalidEventRejected = error.message.indexOf("icicle_released audio event payload is invalid") >= 0;
  }
  assert(invalidEventRejected, "Invalid icicle audio events must fail fast.");
}

validateConfigAndCodec();
validateBoardStateAndRelease();
validateIcicleMakesFairyLeave();
validateRenderAndSettlementContracts();
validateIcicleAudioRouting();
console.log("[OK] ice_crystal_attachment", "opacity 200, whole icicle drop, icicle SFX, floating exclusion and fixed fairy departure validated");
