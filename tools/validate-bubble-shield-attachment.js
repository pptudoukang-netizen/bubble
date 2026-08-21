"use strict";

var fs = require("fs");
var path = require("path");

global.cc = { log: function () {} };

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var MatchSystem = require("../gameplay-src/systems/MatchSystem");

var ROOT = path.resolve(__dirname, "..");
var TEST_LEVEL_KEY = "level_bubble_shield_attachment_test";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function assertConfigRejected(raw, expectedMessage) {
  var rejected = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(raw, TEST_LEVEL_KEY);
  } catch (error) {
    rejected = error.message.indexOf(expectedMessage) >= 0;
  }
  assert(rejected, "Invalid bubble shield config must fail with: " + expectedMessage);
}

function validateConfigAndCodec() {
  var normalized = buildNormalizedLevel();
  assert(normalized.level.cellAttachments.length === 4, "Bubble shield test must preserve four attachments.");
  normalized.level.cellAttachments.forEach(function (attachment, index) {
    assert(attachment.type === "bubble_shield", "Normalized bubble shield type mismatch at " + index + ".");
    assert(attachment.row === 7 && attachment.col === index + 3, "Bubble shield test coordinate mismatch at " + index + ".");
    assert(attachment.particleCount === undefined, "Bubble shield must not carry particleCount.");
  });

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "bubble_shield_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.cellAttachments[0].id === "bubble_shield_test_01" &&
    expanded.levels.level_001.level.cellAttachments[0].type === "bubble_shield",
    "Compact level round trip must preserve bubble shield attachments."
  );

  var invalidParticleCount = buildRawLevel();
  invalidParticleCount.level.cellAttachments[0].particleCount = 1;
  assertConfigRejected(invalidParticleCount, "particleCount is not allowed for bubble_shield");

  var emptyTarget = buildRawLevel();
  emptyTarget.level.cellAttachments[0].row = 8;
  emptyTarget.level.cellAttachments[0].col = 0;
  assertConfigRejected(emptyTarget, "bubble_shield target must be an ordinary ball");

  var specialTarget = buildRawLevel();
  specialTarget.level.specialEntities = [{
    id: "shield_forbidden_stone",
    entityCategory: "obstacle_ball",
    entityType: "stone",
    row: 7,
    col: 3
  }];
  assertConfigRejected(specialTarget, "bubble_shield target must be an ordinary ball");

  var duplicateTarget = buildRawLevel();
  duplicateTarget.level.cellAttachments[1].col = 3;
  assertConfigRejected(duplicateTarget, "duplicate target `7:3`");
}

function createResolution() {
  return { bubbleShieldsRemoved: [] };
}

function createManager() {
  var manager = new GameManager();
  manager._pushRuntimeEvent = function () {};
  return manager;
}

function validateNormalMatchExclusionAndAdjacentBreak() {
  var levelConfig = buildNormalizedLevel();
  var grid = buildGrid(levelConfig);
  var matchSystem = new MatchSystem();
  matchSystem.initialize({});
  matchSystem.configureLevel(levelConfig);

  var matched = matchSystem.findMatchGroup(grid, grid.getCell(7, 0));
  assert(matched.length === 3, "Only the unshielded red trio may enter ordinary same-color search.");
  assert(
    matched.map(function (cell) { return cell.col; }).sort().join(",") === "0,1,2",
    "Ordinary matching must stop at the first shielded red ball."
  );
  assert(matchSystem.findMatchGroup(grid, grid.getCell(7, 4)).length === 0, "A shielded start ball must not enter ordinary matching.");

  var removedMatches = grid.removeCells(matched);
  var resolution = createResolution();
  createManager()._clearBubbleShieldsAdjacentToOrdinaryElimination(removedMatches, grid, resolution);
  var exposedCell = grid.getCell(7, 3);
  assert(exposedCell && exposedCell.color === "R", "Adjacent ordinary elimination must preserve the protected underlying ball.");
  assert(exposedCell.bubbleShieldAttachmentId === null, "Adjacent ordinary elimination must remove the neighboring shield first.");
  assert(grid.getCell(7, 4).bubbleShieldAttachmentId === "bubble_shield_test_02", "Non-adjacent shields must remain attached.");
  assert(
    resolution.bubbleShieldsRemoved.length === 1 &&
    resolution.bubbleShieldsRemoved[0].sourceType === "adjacent_normal_elimination",
    "Adjacent shield removal must be recorded in the authoritative resolution."
  );
}

function validateSpecialHitAbsorbsOnce() {
  var grid = buildGrid(buildNormalizedLevel());
  var manager = createManager();
  var shieldedCell = grid.getCell(7, 4);
  var unshieldedCell = grid.getCell(7, 9);
  var firstResolution = createResolution();
  var firstRemovable = manager._resolveBubbleShieldsHitBySpecial(
    [shieldedCell, unshieldedCell],
    grid,
    firstResolution,
    "blast"
  );
  assert(firstRemovable.length === 1 && firstRemovable[0].col === 9, "First blast must exclude the shielded underlying ball from its clear list.");
  assert(grid.removeCells(firstRemovable).length === 1 && grid.getCell(7, 9) === null, "First blast must still clear unshielded targets in range.");
  var protectedAfterFirstHit = grid.getCell(7, 4);
  assert(protectedAfterFirstHit && protectedAfterFirstHit.color === "R", "Bubble shield must absorb one special hit.");
  assert(protectedAfterFirstHit.bubbleShieldAttachmentId === null, "Absorbed special hit must remove the shield.");
  assert(firstResolution.bubbleShieldsRemoved.length === 1, "First blast must record exactly one removed shield.");

  var secondResolution = createResolution();
  var secondRemovable = manager._resolveBubbleShieldsHitBySpecial(
    [protectedAfterFirstHit],
    grid,
    secondResolution,
    "blast"
  );
  assert(secondRemovable.length === 1, "The exposed underlying ball must enter the next special clear list.");
  assert(secondResolution.bubbleShieldsRemoved.length === 0, "The consumed shield must not absorb a second hit.");
  assert(grid.removeCells(secondRemovable).length === 1 && grid.getCell(7, 4) === null, "The second blast must clear the exposed underlying ball.");
}

function validateRenderAndIntegrationContracts() {
  [
    "assets/game/image/ball/transparent_bubbles.png",
    "assets/game/image/ball/transparent_bubbles.png.meta",
    "assets/game/effects/BubbleShatter.effect",
    "assets/game/effects/BubbleShatter.effect.meta",
    "assets/audio/sound/pao_break1.mp3",
    "assets/audio/sound/pao_break1.mp3.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(ROOT, relativePath)), "Bubble shield resource is missing: " + relativePath + ".");
  });

  var resourceConfig = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  var boardRenderer = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneBoardMethods.js"), "utf8");
  var bubbleShatterRenderer = fs.readFileSync(path.join(ROOT, "gameplay-src/render/BubbleShatterRenderer.js"), "utf8");
  var runtimeRenderer = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererRuntimeMethods.js"), "utf8");
  var audioMethods = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapAudioMethods.js"), "utf8");
  var finalizer = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerShotFinalizeMethods.js"), "utf8");
  var molotov = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerShotMolotovMethods.js"), "utf8");
  var crystalGun = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerShotCrystalGunMethods.js"), "utf8");
  var prism = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerShotRainbowPrismMethods.js"), "utf8");
  assert(resourceConfig.indexOf('BUBBLE_SHIELD: "game/image/ball/transparent_bubbles"') >= 0, "Bubble shield transparent_bubbles resource contract is missing.");
  assert(boardRenderer.indexOf("syncBubbleShieldAttachment") >= 0, "Bubble shield overlay renderer is missing.");
  var shieldShatterMethodStart = bubbleShatterRenderer.indexOf("BubbleShatterRenderer.prototype.playBubbleShieldRemovals");
  var shieldShatterMethodEnd = bubbleShatterRenderer.indexOf("\n};", shieldShatterMethodStart);
  assert(shieldShatterMethodStart >= 0 && shieldShatterMethodEnd > shieldShatterMethodStart, "Bubble shield shatter renderer entry is missing.");
  var shieldShatterMethod = bubbleShatterRenderer.slice(shieldShatterMethodStart, shieldShatterMethodEnd);
  assert(shieldShatterMethod.indexOf("this._getSharedMaterial(spritePath, spriteFrame)") >= 0, "Bubble shield removal must reuse the ball shatter shader material path.");
  assert(shieldShatterMethod.indexOf("BubbleShieldShatter_") >= 0, "Bubble shield shatter node contract is missing.");
  assert(shieldShatterMethod.indexOf("_hideBoardBubbleNode") < 0, "Bubble shield shatter must not hide the protected underlying ball.");
  assert(runtimeRenderer.indexOf("this.bubbleShatterRenderer.playBubbleShieldRemovals(") >= 0, "Runtime full refresh must play bubble shield shatter presentation.");
  assert(audioMethods.indexOf('BUBBLE_SHIELD_BREAK_SFX_PATH = "sound/pao_break1"') >= 0, "Bubble shield break SFX must be pao_break1.");
  assert(finalizer.indexOf("_clearBubbleShieldsAdjacentToOrdinaryElimination(removedMatches, grid, resolution)") >= 0, "Ordinary matched removal must clear adjacent shields.");
  assert(finalizer.indexOf('_resolveBubbleShieldsHitBySpecial(blastCells, grid, resolution, "blast")') >= 0, "Blast clear-list shielding is missing.");
  assert(finalizer.indexOf("Array.isArray(this.lastResolution.bubbleShieldsRemoved)") >= 0, "Shield-only special hits must not be reported as no-elimination shots.");
  assert(molotov.indexOf('_resolveBubbleShieldsHitBySpecial(blastCells, grid, resolution, "molotov")') >= 0, "Molotov clear-list shielding is missing.");
  assert(crystalGun.indexOf('_resolveBubbleShieldsHitBySpecial(lineCells, grid, resolution, "crystal_gun")') >= 0, "Crystal gun clear-list shielding is missing.");
  assert(prism.indexOf('"rainbow_prism_ball"') >= 0 && prism.indexOf("_resolveBubbleShieldsHitBySpecial") >= 0, "Rainbow prism clear-list shielding is missing.");

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () { return "sound/game_bg1"; },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5"
  });
  assert(audioConfig.sfxMap.bubbleShieldBreak === "sound/pao_break1", "Bubble shield SFX map must resolve exactly to pao_break1.");
  var playedSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (key) { playedSfxKeys.push(key); }
  }, {
    runtimeEvents: [{
      type: "bubble_shield_removed",
      sourceType: "blast",
      count: 2,
      shieldIds: ["shield_1", "shield_2"]
    }]
  });
  assert(playedSfxKeys.length === 1 && playedSfxKeys[0] === "bubbleShieldBreak", "Bubble shield removal must play its configured break SFX once per removal event.");

  var invalidAudioEventRejected = false;
  try {
    GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
      _trackRuntimeTelemetryEvent: function () {},
      _playSfx: function () {}
    }, {
      runtimeEvents: [{
        type: "bubble_shield_removed",
        sourceType: "blast",
        count: 1,
        shieldIds: []
      }]
    });
  } catch (error) {
    invalidAudioEventRejected = error.message.indexOf("bubble_shield_removed audio event payload is invalid") >= 0;
  }
  assert(invalidAudioEventRejected, "Malformed bubble shield audio events must fail fast.");
}

validateConfigAndCodec();
validateNormalMatchExclusionAndAdjacentBreak();
validateSpecialHitAbsorbsOnce();
validateRenderAndIntegrationContracts();
console.log("[OK] bubble_shield_attachment", "match exclusion, adjacent break, one-hit special absorption, BubbleShatter shader, pao_break1 audio and config round trip validated");
