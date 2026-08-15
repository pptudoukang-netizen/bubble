"use strict";

var fs = require("fs");
var path = require("path");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpiritCocoonTriggerStore = require("../assets/scripts/utils/SpiritCocoonTriggerStore");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizedTestLevel() {
  return LevelConfigLoader.normalizeLevelConfig(
    readJson(path.resolve(__dirname, "../assets/map/config/levels/level_spirit_cocoon_test.json")),
    "level_spirit_cocoon_test"
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

function createManager(grid, firstTrigger, randomValues) {
  var manager = new GameManager({
    spiritCocoonFirstTriggerStore: {
      consumeFirstTrigger: function () {
        return firstTrigger;
      }
    }
  });
  var randomIndex = 0;
  manager.systems.bubbleGrid = grid;
  manager.shotsFired = 3;
  manager.spiritCocoonRandom = function () {
    if (randomIndex >= randomValues.length) {
      throw new Error("Spirit cocoon validator exhausted random values.");
    }
    var value = randomValues[randomIndex];
    randomIndex += 1;
    return value;
  };
  manager.spiritCocoonSupportChecks = 0;
  manager._resolveFloatingAfterSpiritCocoon = function () {
    manager.spiritCocoonSupportChecks += 1;
  };
  manager._continueAfterSpiritCocoon = function () {};
  manager._getMatchedDropScorePerBallForNextCombo = function () {
    return 200;
  };
  return manager;
}

function triggerAtLowerNeighbor(manager) {
  return manager._queueSpiritCocoonsAdjacentToCells([{
    id: "removed_neighbor",
    row: 4,
    col: 4
  }], manager.lastResolution);
}

function validateConfigAndCodec() {
  var levelConfig = normalizedTestLevel();
  var cocoons = levelConfig.level.specialEntities.filter(function (entity) {
    return entity.entityType === "spirit_cocoon";
  });
  assert(cocoons.length === 1, "Dedicated spirit cocoon test level must contain one spirit cocoon.");
  assert(levelConfig.level.specialEntities.length === 1, "Dedicated spirit cocoon test level must isolate the spirit cocoon mechanism.");
  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "spirit_cocoon_validation",
    from: 1,
    to: 1,
    levels: { level_spirit_cocoon_test: levelConfig }
  });
  assert(
    compact.levels.level_spirit_cocoon_test.level.specialEntities.some(function (entry) {
      return entry[2] === "c";
    }),
    "Compact spirit cocoon must use code `c`."
  );
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_spirit_cocoon_test.level.specialEntities.some(function (entity) {
      return entity.entityType === "spirit_cocoon";
    }),
    "Expanded compact config must restore spirit cocoon."
  );
}

function validateVisualAssetContract() {
  [
    "cocoon_1",
    "cocoon_2",
    "cocoon_3",
    "cocoon_4",
    "cocoon_5",
    "mist_sprite",
    "gluttony_sprite",
    "rainbow_sprite",
    "sandstorm"
  ].forEach(function (assetName) {
    var pngPath = path.resolve(__dirname, "../assets/game/image/ball/" + assetName + ".png");
    assert(fs.existsSync(pngPath), "Spirit cocoon visual asset is missing: " + assetName + ".png");
    assert(fs.statSync(pngPath).size > 0, "Spirit cocoon visual asset is empty: " + assetName + ".png");
    assert(fs.existsSync(pngPath + ".meta"), "Spirit cocoon visual asset meta is missing: " + assetName + ".png.meta");
  });
  var resourceSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererResourceConfig.js"),
    "utf8"
  );
  assert(
    resourceSource.indexOf('SPIRIT_MIST: "game/image/ball/sandstorm"') >= 0,
    "Mist cover must use sandstorm instead of mist_sprite."
  );
  var animationSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneSpiritCocoonFxMethods.js"),
    "utf8"
  );
  assert(animationSource.indexOf("cc.moveTo(") >= 0, "Mist sprite must move across adjacent board nodes.");
  assert(
    animationSource.indexOf("_setSpiritMistOverlayVisible(target.node, true)") >= 0,
    "Mist cover must appear when the sprite reaches each traversed ball."
  );
  assert(
    animationSource.indexOf("rowTargets.forEach") >= 0,
    "Gluttony and rainbow sprites must move through their row traversal targets."
  );
  assert(
    animationSource.indexOf('fxNode.scaleX = opening.direction === "right" ? -1 : 1') >= 0,
    "Right-moving row spirits must flip only their X scale."
  );
}

function validateFirstTriggerGluttony() {
  var grid = buildGrid(normalizedTestLevel());
  var manager = createManager(grid, true, [0.1]);
  var queued = triggerAtLowerNeighbor(manager);
  assert(queued.length === 1, "Adjacent ordinary removal must queue cocoon opening.");
  assert(queued[0].outcome === "gluttony", "First local trigger must force gluttony interval.");
  assert(queued[0].direction === "left", "Deterministic first trigger direction must be left.");
  assert(queued[0].gluttonyTraversal.length === 2, "Gluttony validation requires two ordered targets.");
  manager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.totalDuration);
  assert(!grid.hasCell(3, 4), "Opened cocoon must be removed.");
  assert(manager.lastResolution.scoreDelta === 1000, "Gluttony must not score a target before reaching it.");
  assert(manager.lastResolution.spiritCocoonConsumed.length === 0, "Gluttony must not consume targets before movement.");
  assert(manager.spiritCocoonSupportChecks === 0, "Gluttony must not scan support before movement ends.");
  manager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration);
  assert(manager.lastResolution.spiritCocoonConsumed.length === 1, "Gluttony must consume exactly the first reached ball.");
  assert(manager.lastResolution.scoreDelta === 1200, "First reached gluttony ball must score immediately.");
  assert(manager.spiritCocoonSupportChecks === 0, "Gluttony must defer support after an intermediate target.");
  manager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration);
  assert(manager.lastResolution.scoreDelta === 1400, "Gluttony must add 1000 base plus two combo-scored balls.");
  assert(manager.lastResolution.spiritCocoonConsumed.length === 2, "Gluttony must consume all balls on chosen row side.");
  assert(manager.spiritCocoonSupportChecks === 1, "Gluttony must scan support once after all movement ends.");
}

function validateMistTraversalAndExpiry() {
  var grid = buildGrid(normalizedTestLevel());
  var manager = createManager(grid, false, [0.1]);
  var queued = triggerAtLowerNeighbor(manager);
  var opening = queued[0];
  assert(opening.outcome === "mist", "Roll below 20% must select mist.");
  assert(opening.mistTraversal.length > 0, "Mist must have adjacent ordinary balls to traverse.");
  var center = grid.getCellPosition(opening.row, opening.col);
  var previousAngle = -Infinity;
  opening.mistTraversal.forEach(function (entry) {
    var position = grid.getCellPosition(entry.row, entry.col);
    var angle = Math.atan2(position.y - center.y, position.x - center.x);
    assert(angle >= previousAngle, "Mist traversal must be counterclockwise by board coordinates.");
    previousAngle = angle;
  });
  var expectedDuration = SpecialAnimationTiming.spiritCocoon.totalDuration +
    opening.mistTraversal.length *
      SpecialAnimationTiming.spiritCocoon.mistTraversalStepDuration;
  assert(opening.duration === expectedDuration, "Mist traversal duration must lock the whole movement.");
  manager._updatePendingSpiritCocoonOpenings(opening.duration);
  assert(
    manager.lastResolution.spiritMistApplied.length === opening.mistTraversal.length,
    "Every traversed ordinary ball must receive sandstorm mist state."
  );
  opening.mistTraversal.forEach(function (entry) {
    assert(
      grid.getCell(entry.row, entry.col).spiritMistExpiresAfterShot === 8,
      "Mist must expire after five subsequent shots."
    );
  });
  assert(grid.clearExpiredSpiritMist(7).length === 0, "Mist must remain before the fifth subsequent shot.");
  assert(
    grid.clearExpiredSpiritMist(8).length === opening.mistTraversal.length,
    "All mist must disappear on the fifth subsequent shot."
  );
}

function validateRainbowAndFallingTrigger() {
  var rainbowGrid = buildGrid(normalizedTestLevel());
  var rainbowManager = createManager(rainbowGrid, false, [0.9, 0.9, 0]);
  var opening = triggerAtLowerNeighbor(rainbowManager)[0];
  assert(opening.outcome === "rainbow" && opening.direction === "right", "Rainbow roll must retain right direction.");
  assert(opening.rainbowTraversal.length === 2, "Rainbow validation requires two ordered targets.");
  rainbowManager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.totalDuration);
  assert(rainbowManager.lastResolution.spiritCocoonRecolors.length === 0, "Rainbow must not recolor before movement reaches a ball.");
  assert(rainbowManager.spiritCocoonSupportChecks === 0, "Rainbow must not scan support before movement ends.");
  rainbowManager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration);
  assert(rainbowManager.lastResolution.spiritCocoonRecolors.length === 1, "Rainbow must recolor exactly the first reached ball.");
  assert(rainbowManager.spiritCocoonSupportChecks === 0, "Rainbow must defer support after an intermediate target.");
  rainbowManager._updatePendingSpiritCocoonOpenings(SpecialAnimationTiming.spiritCocoon.rowTraversalStepDuration);
  assert(rainbowManager.lastResolution.spiritCocoonRecolors.length === 2, "Rainbow must recolor every ordinary ball on chosen side.");
  assert(rainbowManager.spiritCocoonSupportChecks === 1, "Rainbow must scan support once after all movement ends.");

  var fallingGrid = buildGrid(normalizedTestLevel());
  var fallingManager = createManager(fallingGrid, true, [0.9]);
  var cocoon = fallingGrid.getCell(3, 4);
  var filtered = fallingManager._filterFloatingSpiritCocoons([
    fallingGrid.getCell(4, 4),
    cocoon
  ], fallingManager.lastResolution);
  assert(fallingManager.pendingSpiritCocoonOpenings.length === 1, "Adjacent falling ball must queue cocoon opening.");
  assert(!filtered.some(function (cell) { return cell.id === cocoon.id; }), "Queued cocoon must remain until opening animation completes.");
}

function validatePersistentFirstTriggerStore() {
  var values = {};
  global.cc = {
    sys: {
      localStorage: {
        get length() { return Object.keys(values).length; },
        key: function (index) { return Object.keys(values)[index]; },
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = value; }
      }
    }
  };
  var firstStore = new SpiritCocoonTriggerStore();
  assert(firstStore.consumeFirstTrigger() === true, "Fresh local state must consume first trigger once.");
  var reloadedStore = new SpiritCocoonTriggerStore();
  assert(reloadedStore.consumeFirstTrigger() === false, "Reloaded local state must not repeat forced gluttony.");
  delete global.cc;
}

validateConfigAndCodec();
validateVisualAssetContract();
validateFirstTriggerGluttony();
validateMistTraversalAndExpiry();
validateRainbowAndFallingTrigger();
validatePersistentFirstTriggerStore();
console.log("Spirit cocoon validation passed.");
