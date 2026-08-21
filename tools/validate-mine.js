"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var PropDescriptionConfig = require("../assets/scripts/config/PropDescriptionConfig");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var MineCountdownPresenter = require("../gameplay-src/render/MineCountdownPresenter");

var ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
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

function createManagerGrid(levelConfig) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var manager = new GameManager();
  var viewport = manager.systems.boardViewportSystem;
  var grid = manager.systems.bubbleGrid;
  grid.initialize({});
  viewport.initialize({});
  viewport.configureLevel(levelConfig);
  grid.configureLevel(levelConfig);
  return { manager: manager, grid: grid };
}

function createMineResolution() {
  return {
    mineCountdownResolved: false,
    mineCountdowns: [],
    mineExplosions: [],
    dangerReached: false
  };
}

function buildMineFixture(initialLife, sealed) {
  if (!Number.isInteger(initialLife) || initialLife <= 0) {
    throw new Error("Mine fixture requires positive initialLife.");
  }
  return {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: sealed ? "MINE_SEALED" : "MINE_EXPOSED",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: sealed ? [
        "...........",
        "..........",
        "....RR.....",
        "...R.R....",
        "....RR.....",
        "..........",
        "...........",
        ".........."
      ] : [
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
        id: sealed ? "sealed_mine" : "exposed_mine",
        entityCategory: "hazard_ball",
        entityType: "mine",
        row: 3,
        col: 4,
        initialLife: initialLife
      }]
    }
  };
}

function validateConfigAndCodec() {
  var rawTest = readJson("assets/map/config/levels/level_mine_test.json");
  var normalized = LevelConfigLoader.normalizeLevelConfig(rawTest, "level_mine_test");
  var mine = normalized.level.specialEntities[0];
  assert(mine.entityCategory === "hazard_ball" && mine.entityType === "mine", "Mine test config must preserve hazard_ball/mine.");
  assert(mine.initialLife === 2, "Mine test config must preserve configured initialLife 2.");
  var mineKeys = PropDescriptionConfig.collectSpecialKeysForLevel(normalized).filter(function (key) {
    return key === "mine";
  });
  assert(mineKeys.length === 1, "Mine test config must produce exactly one mine level introduction.");
  assert(PropDescriptionConfig.SPECIAL_DEFINITIONS.mine.iconPath === "ui/image/preview_balls/mines", "Mine level introduction must use the UI-owned mines icon copy.");

  var defaultRaw = clone(rawTest);
  delete defaultRaw.level.specialEntities[0].initialLife;
  var defaultNormalized = LevelConfigLoader.normalizeLevelConfig(defaultRaw, "level_mine_test");
  assert(defaultNormalized.level.specialEntities[0].initialLife === 6, "Mine initialLife must default to 6 when omitted.");

  var invalidRaw = clone(rawTest);
  invalidRaw.level.specialEntities[0].initialLife = 0;
  var rejectedInvalidLife = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(invalidRaw, "level_mine_test");
  } catch (error) {
    rejectedInvalidLife = error.message.indexOf("initialLife must be a positive integer for mine") >= 0;
  }
  assert(rejectedInvalidLife, "Mine config must reject non-positive initialLife.");

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "mine_validation_pack",
    from: 1,
    to: 1,
    levels: { level_mine_test: normalized }
  });
  var encoded = compact.levels.level_mine_test.level.specialEntities[0];
  assert(encoded[2] === "n" && encoded[3] === 2, "Compact mine must encode type n and initialLife.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  var expandedMine = expanded.levels.level_mine_test.level.specialEntities[0];
  assert(expandedMine.entityType === "mine" && expandedMine.initialLife === 2, "Expanded compact mine must restore initialLife.");
}

function validateExposureLatchAndExplosion() {
  var exposedGrid = createGrid(buildMineFixture(2, false));
  var firstTick = exposedGrid.advanceMinesAfterShot();
  assert(firstTick.ticks.length === 1 && firstTick.explosion === null, "Exposed mine must tick without exploding at life 2.");
  assert(firstTick.ticks[0].countdownStartedThisShot === true, "First exposed shot must latch mine countdown.");
  assert(exposedGrid.getMines()[0].life === 1 && exposedGrid.getMines()[0].countdownStarted === true, "Exposed mine must persist latched at life 1.");
  var secondTick = exposedGrid.advanceMinesAfterShot();
  assert(secondTick.explosion && secondTick.explosion.mineId === "exposed_mine", "Latched mine must explode at life 0.");
  assert(exposedGrid.getMines().length === 0, "Exploded mine must be removed from the live mine collection.");

  var sealedGrid = createGrid(buildMineFixture(2, true));
  var sealedVersion = sealedGrid.version;
  var sealedTick = sealedGrid.advanceMinesAfterShot();
  assert(sealedTick.ticks.length === 0 && sealedTick.explosion === null, "Mine with all valid neighbors occupied must not start countdown.");
  assert(sealedGrid.version === sealedVersion, "Sealed mine must not mutate board version.");
  assert(sealedGrid.getMines()[0].life === 2 && sealedGrid.getMines()[0].countdownStarted === false, "Sealed mine life must remain unchanged.");

  var openedNeighbor = sealedGrid.getCell(4, 5);
  sealedGrid.removeCells([openedNeighbor]);
  var openingTick = sealedGrid.advanceMinesAfterShot();
  assert(openingTick.ticks[0].lifeAfter === 1 && openingTick.ticks[0].countdownStartedThisShot === true, "Opening one valid neighbor must start and tick countdown in the same shot.");
  sealedGrid.addBubble({ row: 4, col: 5 }, "R");
  var reclosedTick = sealedGrid.advanceMinesAfterShot();
  assert(reclosedTick.explosion && reclosedTick.explosion.mineId === "sealed_mine", "Countdown must stay latched after valid neighbors become full again.");
}

function validateRemovalStopsCountdown() {
  var eliminationRuntime = createManagerGrid(buildMineFixture(3, false));
  var eliminationGrid = eliminationRuntime.grid;
  var eliminationEvents = [];
  var eliminationAudioCount = 0;
  eliminationRuntime.manager._pushRuntimeEvent = function (eventType, payload) {
    eliminationEvents.push({ eventType: eventType, payload: payload });
  };
  eliminationRuntime.manager._pushBombExplosionEvent = function () {
    eliminationAudioCount += 1;
  };
  eliminationGrid.advanceMinesAfterShot();
  eliminationGrid.removeCells([eliminationGrid.getCell(3, 4)]);
  assert(eliminationGrid.getMines().length === 0, "Generic elimination removal must delete mine collection entry.");
  assert(eliminationGrid.advanceMinesAfterShot().ticks.length === 0, "Eliminated mine must stop countdown.");
  assert(eliminationEvents.length === 1 && eliminationEvents[0].eventType === "mine_disappeared", "Eliminated mine must emit one disappearance event.");
  assert(eliminationEvents[0].payload.reason === "elimination", "Normal and special mine clears must use the elimination disappearance reason.");
  assert(eliminationAudioCount === 1, "Eliminated mine must play bomb audio exactly once.");

  var fallingRuntime = createManagerGrid(buildMineFixture(3, false));
  var fallingGrid = fallingRuntime.grid;
  var fallingEvents = [];
  var fallingAudioCount = 0;
  fallingRuntime.manager._pushRuntimeEvent = function (eventType, payload) {
    fallingEvents.push({ eventType: eventType, payload: payload });
  };
  fallingRuntime.manager._pushBombExplosionEvent = function () {
    fallingAudioCount += 1;
  };
  fallingGrid.advanceMinesAfterShot();
  fallingGrid.removeFloatingCells([fallingGrid.getCell(3, 4)]);
  assert(fallingGrid.getMines().length === 0, "Floating drop removal must delete mine collection entry.");
  assert(fallingGrid.advanceMinesAfterShot().ticks.length === 0, "Dropped mine must stop countdown.");
  assert(fallingEvents.length === 1 && fallingEvents[0].eventType === "mine_disappeared", "Dropped mine must emit one disappearance event.");
  assert(fallingEvents[0].payload.reason === "floating_drop", "Dropped mine must preserve the floating_drop disappearance reason.");
  assert(fallingAudioCount === 1, "Dropped mine must play bomb audio exactly once.");
}

function validateFailurePhase() {
  var grid = createGrid(buildMineFixture(1, false));
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.state = "running";
  manager.shotsFired = 1;
  manager.pendingShotPlan = { valid: true };
  var explosionAudioCount = 0;
  var runtimeEvents = [];
  manager._pushBombExplosionEvent = function () {
    explosionAudioCount += 1;
  };
  manager._pushRuntimeEvent = function (eventType, payload) {
    runtimeEvents.push({ eventType: eventType, payload: payload });
  };

  var resolution = createMineResolution();
  var failed = manager._resolveMineCountdownPhase(resolution);
  assert(failed === true && manager.state === "lost_hazard", "Life 0 mine must enter lost_hazard immediately.");
  assert(manager.pendingShotPlan === null, "Mine failure must clear pendingShotPlan and lock the running input state.");
  assert(resolution.dangerReached === true && resolution.mineExplosions.length === 1, "Mine failure resolution must record danger and explosion.");
  assert(explosionAudioCount === 1, "Mine explosion must reuse the bomb explosion audio event.");
  assert(runtimeEvents.length === 1 && runtimeEvents[0].eventType === "mine_exploded", "Mine failure must emit mine_exploded runtime event.");
}

function validateRenderAndFailureContracts() {
  [
    "assets/game/image/ball/mines.png",
    "assets/game/image/ball/mines.png.meta",
    "assets/ui/image/preview_balls/mines.png",
    "assets/ui/image/preview_balls/mines.png.meta",
    "assets/animation/mines.meta",
    "assets/game/fnt/clock.fnt",
    "assets/game/fnt/clock.png",
    "assets/game/fnt/clock.fnt.meta",
    "assets/game/fnt/clock.png.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(ROOT, relativePath)), "Mine resource is missing: " + relativePath + ".");
  });
  for (var frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    var frameName = "frame_" + String(frameIndex).padStart(2, "0") + ".png";
    [frameName, frameName + ".meta"].forEach(function (fileName) {
      var relativePath = "assets/animation/mines/" + fileName;
      assert(fs.existsSync(path.join(ROOT, relativePath)), "Mine animation resource is missing: " + relativePath + ".");
    });
  }
  assert(
    fs.readFileSync(path.join(ROOT, "assets/game/image/ball/mines.png")).equals(
      fs.readFileSync(path.join(ROOT, "assets/ui/image/preview_balls/mines.png"))
    ),
    "Game and UI mine icons must remain byte-identical."
  );
  assert(MineCountdownPresenter.MINE_COUNTDOWN_FONT_SIZE === 3, "Mine countdown font size must remain fixed at 3.");
  assert(MineCountdownPresenter.MINE_COUNTDOWN_LINE_HEIGHT === 40, "Mine countdown line height must remain fixed at 40.");
  assert(MineCountdownPresenter.MINE_ANIMATION_FRAME_DIRECTORY === "mines", "Mine animation must load assets/animation/mines.");
  assert(MineCountdownPresenter.MINE_ANIMATION_FRAME_COUNT === 10, "Mine animation must contain frames 0 through 9.");
  assert(MineCountdownPresenter.MINE_IDLE_FRAME_SWITCH_INTERVAL === 0.5, "Mine idle frames must switch every 0.5 seconds.");
  assert(MineCountdownPresenter.MINE_EXPLOSION_FIRST_FRAME_INDEX === 2, "Mine explosion must start from frame 2 after idle frames 0 and 1.");
  assert(MineCountdownPresenter.MINE_EXPLOSION_FRAME_INTERVAL > 0, "Mine explosion frame interval must be positive.");
  var unorderedFrames = [];
  for (var animationIndex = 9; animationIndex >= 0; animationIndex -= 1) {
    unorderedFrames.push({ name: "frame_" + String(animationIndex).padStart(2, "0"), isValid: true });
  }
  var normalizedFrames = MineCountdownPresenter.normalizeMineAnimationFrames(unorderedFrames);
  assert(normalizedFrames[0].name === "frame_00" && normalizedFrames[9].name === "frame_09", "Mine animation frames must normalize into numeric order.");
  var resourceSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  assert(resourceSource.indexOf('MINE: "game/image/ball/mines"') >= 0, "Mine renderer must use the mines icon.");
  assert(resourceSource.indexOf('MINE_COUNTDOWN_FONT_RESOURCE = "game/fnt/clock"') >= 0, "Mine renderer must use the clock font.");
  var descriptionSource = fs.readFileSync(path.join(ROOT, "assets/scripts/config/PropDescriptionConfig.js"), "utf8");
  assert(descriptionSource.indexOf('mine: "mine"') >= 0, "Mine level introduction must map the mine entity type.");
  assert(descriptionSource.indexOf('iconPath: "ui/image/preview_balls/mines"') >= 0, "Mine level introduction must use the UI-owned mines icon copy.");
  var boardSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneBoardMethods.js"), "utf8");
  var presenterSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/MineCountdownPresenter.js"), "utf8");
  var resourceMethodsSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceMethods.js"), "utf8");
  var explosionSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneExplosionIceFxMethods.js"), "utf8");
  var managerSource = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManager.js"), "utf8");
  var runtimeStateSource = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerRuntimeStateMethods.js"), "utf8");
  assert(boardSource.indexOf('require("./MineCountdownPresenter")') >= 0, "Board rendering must attach the mine countdown presenter.");
  assert(boardSource.indexOf("MineCountdownPresenter.stopMineIdleAnimation") >= 0, "Recycled mine nodes must stop their idle frame loop.");
  assert(presenterSource.indexOf("cc.Label.VerticalAlign.TOP") >= 0, "Mine countdown must use top vertical alignment.");
  assert(presenterSource.indexOf("cc.Label.Overflow.SHRINK") >= 0, "Mine countdown must use label shrink overflow.");
  assert(presenterSource.indexOf('node.getChildByName("Icon")') >= 0, "Mine animation must target the authoritative BubbleItem Icon child.");
  assert(presenterSource.indexOf('getChildByName("Icon") || node') < 0, "Mine animation must not fall back from a missing BubbleItem Icon child.");
  assert(presenterSource.indexOf("syncMineIdleAnimation(renderer, node, cell)") >= 0, "Mine rendering must attach the idle frame loop.");
  assert(resourceMethodsSource.indexOf("_preloadMineAnimationFrames") >= 0, "Mine levels must preload their frame animation.");
  assert(resourceMethodsSource.indexOf("bundle.loadDir(MineCountdownPresenter.MINE_ANIMATION_FRAME_DIRECTORY") >= 0, "Mine frame preload must load the animation/mines directory.");
  assert(explosionSource.indexOf("MineCountdownPresenter.playMineExplosionFrameSequence") >= 0, "Mine disappearance must use the dedicated mine explosion frames.");
  assert(explosionSource.indexOf('event.type !== "mine_disappeared"') >= 0, "Mine renderer must consume unified disappearance events.");
  assert(managerSource.indexOf("this._pushMineDisappearEvents(removedCells, removalReason)") >= 0, "Unified board removals must publish mine disappearance events.");
  assert(runtimeStateSource.indexOf('this._pushRuntimeEvent("mine_disappeared"') >= 0, "Mine disappearance must publish its coordinates for rendering.");
  assert(runtimeStateSource.indexOf("this._pushBombExplosionEvent()") >= 0, "Every unified mine disappearance must emit bomb audio.");
  var specialPhaseAudioSource = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerSpecialPhaseMethods.js"), "utf8");
  var gameplayAudioSource = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapAudioMethods.js"), "utf8");
  assert(specialPhaseAudioSource.indexOf("this._pushBombExplosionEvent()") >= 0, "Mine explosion must emit the bomb explosion event.");
  assert(gameplayAudioSource.indexOf('this._playSfx("bomb")') >= 0, "Mine explosion event must play the bomb SFX.");
  var runtimeSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererRuntimeMethods.js"), "utf8");
  assert(runtimeSource.indexOf('getBuiltinMaterial("2d-gray-sprite")') >= 0, "Mine failure must gray the board sprites.");
  var levelFlowSource = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js"), "utf8");
  assert(levelFlowSource.indexOf('currentState === "lost_hazard"') >= 0, "Mine failure must enter the shared lose audio and result flow.");
  var adFlowSource = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapAdRewardMethods.js"), "utf8");
  assert(adFlowSource.indexOf('state === "lost_hazard"') >= 0, "Mine failure must enter the shared interstitial lose flow.");
  var specialPhaseSource = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerSpecialPhaseMethods.js"), "utf8");
  var minePhaseIndex = specialPhaseSource.indexOf("this._resolveMineCountdownPhase(resolution)");
  var breederPhaseIndex = specialPhaseSource.indexOf("this._resolveBreederPhase(resolution)", minePhaseIndex);
  assert(minePhaseIndex >= 0 && breederPhaseIndex > minePhaseIndex, "Mine countdown must resolve before breeder growth in the final structural phase.");
}

validateConfigAndCodec();
validateExposureLatchAndExplosion();
validateRemovalStopsCountdown();
validateFailurePhase();
validateRenderAndFailureContracts();
console.log("[OK] mine", "config default/codec, exposure latch, per-shot countdown, removals, explosion failure and render contracts validated");
