"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {},
  Label: function Label() {}
};

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var RandomChallengeGenerator = require("../assets/scripts/config/RandomChallengeGenerator");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BoardOcclusionConfig = require("../assets/scripts/config/BoardOcclusionConfig");
var BoardOcclusionSystem = require("../gameplay-src/systems/BoardOcclusionSystem");
var GameManager = require("../gameplay-src/core/GameManager");
var attachLevelRendererSceneOcclusionMethods = require(
  "../gameplay-src/render/LevelRendererSceneOcclusionMethods"
);

var PROJECT_ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(callback, expectedMessage, message) {
  var thrown = null;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert(thrown, message + " Expected an error.");
  assert(
    thrown.message.indexOf(expectedMessage) >= 0,
    message + " Unexpected error: " + thrown.message
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

function loadCampaignLevel(levelId) {
  var pack = LevelPackCompactCodec.expandPack(readJson("remote-level-packs/levels_pack_011_100.json"));
  var key = "level_" + String(levelId).padStart(3, "0");
  assert(pack.levels[key], "Missing campaign test level " + key + ".");
  return LevelConfigLoader.normalizeLevelConfig(pack.levels[key], key);
}

function loadBoardOcclusionTestLevel() {
  var raw = readJson("assets/map/config/levels/level_board_occlusion_test.json");
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_board_occlusion_test");
}

function createSystem(levelConfig) {
  var system = new BoardOcclusionSystem();
  system.initialize({});
  system.configureLevel(levelConfig);
  return system;
}

function startAttempt(system, levelId, attemptIndex) {
  return system.startRun({
    runMode: "campaign",
    attemptIndex: attemptIndex,
    seed: "level:" + levelId + ":attempt:" + attemptIndex
  });
}

function validateNoRepeat(levelConfig) {
  var system = createSystem(levelConfig);
  var ids = [];
  for (var attemptIndex = 1; attemptIndex <= 8; attemptIndex += 1) {
    var snapshot = startAttempt(system, levelConfig.level.levelId, attemptIndex);
    assert(snapshot.variantId, "Campaign occlusion attempt requires variantId.");
    if (ids.length) {
      assert(ids[ids.length - 1] !== snapshot.variantId, "Consecutive attempts selected the same occlusion variant.");
    }
    ids.push(snapshot.variantId);
  }
  assert(new Set(ids.slice(0, 4)).size === 4, "First four campaign attempts must cover four distinct variants.");
  assert(ids[0] === ids[4], "Campaign occlusion variants must cycle deterministically.");
}

function validateVariantContract(levelConfig) {
  var variants = levelConfig.level.boardOcclusionPlan.variants;
  var firstZones = variants[0].zones;
  variants.forEach(function (variant) {
    assert(variant.zones.length === firstZones.length, "All occlusion variants must contain the same zone count.");
  });
  firstZones.forEach(function (firstZone, zoneIndex) {
    var cellSignatures = variants.map(function (variant) {
      var zone = variant.zones[zoneIndex];
      assert(
        zone.visualType === firstZone.visualType,
        "Occlusion visual type must remain stable while attempt positions change."
      );
      assert(
        JSON.stringify(zone.clearRule) === JSON.stringify(firstZone.clearRule),
        "Occlusion clear rule must remain stable while attempt positions change."
      );
      return zone.cells.map(function (cell) {
        return cell.row + ":" + cell.col;
      }).sort().join("|");
    });
    assert(
      new Set(cellSignatures).size === variants.length,
      "Every occlusion variant must use a distinct cell region for each zone."
    );
  });
}

function validateDedicatedTestLevel(levelConfig) {
  assert(levelConfig.level.code === "L001_BOARD_OCCLUSION_TEST", "Board occlusion test level code is invalid.");
  var variants = levelConfig.level.boardOcclusionPlan.variants;
  assert(variants.length === 4, "Board occlusion test level requires four variants.");
  variants.forEach(function (variant) {
    assert(variant.zones.length === 2, "Board occlusion test variant requires two zones.");
    assert(
      JSON.stringify(variant.zones.map(function (zone) {
        return zone.visualType;
      }).sort()) === JSON.stringify(["cloud", "leaves"]),
      "Board occlusion test variant must contain cloud and leaves."
    );
    variant.zones.forEach(function (zone) {
      assert(
        zone.clearRule.kind === "item_or_shots",
        "Shot-limited board occlusion test zones must use shot-count clear rules."
      );
      assert(
        zone.clearRule.shots === (zone.visualType === "cloud" ? 4 : 5),
        "Board occlusion test clear-rule shot count is invalid for " + zone.visualType + "."
      );
    });
  });
}

function validatePlayModeClearRules(levelConfig) {
  var expectedKind = levelConfig.level.playMode === "timed_infinite_shots"
    ? "item_or_seconds"
    : "item_or_shots";
  levelConfig.level.boardOcclusionPlan.variants.forEach(function (variant) {
    variant.zones.forEach(function (zone) {
      assert(
        zone.clearRule.kind === expectedKind,
        "Board occlusion clear rule does not match level playMode for " + levelConfig.level.code + "."
      );
    });
  });
}

function validateMismatchedPlayModeRulesFailFast(shotLevelConfig, timedLevelConfig) {
  var invalidShotLevel = JSON.parse(JSON.stringify(shotLevelConfig.level));
  invalidShotLevel.boardOcclusionPlan.variants[0].zones[0].clearRule = {
    kind: "item_or_seconds",
    seconds: 12
  };
  assertThrows(function () {
    BoardOcclusionConfig.normalizePlan(
      invalidShotLevel.boardOcclusionPlan,
      invalidShotLevel,
      "invalid_shot_limited_occlusion"
    );
  }, "must be item_or_shots", "Shot-limited level accepted a seconds-based occlusion rule.");

  var invalidTimedLevel = JSON.parse(JSON.stringify(timedLevelConfig.level));
  invalidTimedLevel.boardOcclusionPlan.variants[0].zones[0].clearRule = {
    kind: "item_or_shots",
    shots: 4
  };
  assertThrows(function () {
    BoardOcclusionConfig.normalizePlan(
      invalidTimedLevel.boardOcclusionPlan,
      invalidTimedLevel,
      "invalid_timed_occlusion"
    );
  }, "must be item_or_seconds", "Timed level accepted a shot-count occlusion rule.");
}

function findAttemptByRule(levelConfig, ruleKind) {
  var system = createSystem(levelConfig);
  for (var attemptIndex = 1; attemptIndex <= levelConfig.level.boardOcclusionPlan.variants.length; attemptIndex += 1) {
    var snapshot = startAttempt(system, levelConfig.level.levelId, attemptIndex);
    if (snapshot.activeZones.some(function (zone) {
      return zone.clearRule.kind === ruleKind;
    })) {
      return {
        attemptIndex: attemptIndex,
        snapshot: snapshot
      };
    }
  }
  throw new Error("No board occlusion attempt found for rule " + ruleKind + ".");
}

function validateAutomaticClears(timedLevelConfig, shotLevelConfig) {
  var timedAttempt = findAttemptByRule(timedLevelConfig, "item_or_seconds");
  var timedSystem = createSystem(timedLevelConfig);
  var timedSnapshot = startAttempt(timedSystem, timedLevelConfig.level.levelId, timedAttempt.attemptIndex);
  var timedZones = timedSnapshot.activeZones.filter(function (zone) {
    return zone.clearRule.kind === "item_or_seconds";
  });
  var maxSeconds = Math.max.apply(null, timedZones.map(function (zone) {
    return zone.clearRule.seconds;
  }));
  var timedRemoved = timedSystem.update(maxSeconds + 0.01, false);
  timedZones.forEach(function (zone) {
    assert(timedRemoved.indexOf(zone.id) !== -1, "Countdown did not clear timed occlusion zone " + zone.id + ".");
  });

  var shotAttempt = findAttemptByRule(shotLevelConfig, "item_or_shots");
  var shotSystem = createSystem(shotLevelConfig);
  var shotSnapshot = startAttempt(shotSystem, shotLevelConfig.level.levelId, shotAttempt.attemptIndex);
  var shotZones = shotSnapshot.activeZones.filter(function (zone) {
    return zone.clearRule.kind === "item_or_shots";
  });
  var maxShots = Math.max.apply(null, shotZones.map(function (zone) {
    return zone.clearRule.shots;
  }));
  var shotRemoved = [];
  for (var shotIndex = 0; shotIndex < maxShots; shotIndex += 1) {
    shotRemoved = shotRemoved.concat(shotSystem.onShotFired());
  }
  shotZones.forEach(function (zone) {
    assert(shotRemoved.indexOf(zone.id) !== -1, "Shot count did not clear occlusion zone " + zone.id + ".");
  });
}

function validateItemClear(levelConfig) {
  var system = createSystem(levelConfig);
  var snapshot = startAttempt(system, levelConfig.level.levelId, 1);
  var expectedIds = snapshot.activeZones.map(function (zone) {
    return zone.id;
  }).sort();
  var removedIds = system.clearAllWithItem().sort();
  assert(JSON.stringify(removedIds) === JSON.stringify(expectedIds), "Item clear did not remove every active occlusion zone.");
  assert(system.snapshotForRender().activeZones.length === 0, "Item clear left active occlusion zones.");
}

function validateEmptyZoneClear(levelConfig) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var manager = new GameManager();
  manager.bootstrap();
  var startSnapshot = manager.startLevel(levelConfig, {
    runMode: "campaign",
    attemptIndex: 1,
    seed: "level:" + levelConfig.level.levelId + ":attempt:1"
  });
  assert(startSnapshot.systems.boardOcclusionSystem.activeZones.length === 2, "Empty-zone test requires two zones.");
  var targetZone = startSnapshot.systems.boardOcclusionSystem.activeZones[0];
  var remainingZoneId = startSnapshot.systems.boardOcclusionSystem.activeZones[1].id;
  var grid = manager.systems.bubbleGrid;
  var coveredCells = targetZone.cells.map(function (cell) {
    var liveCell = grid.getCell(cell.row, cell.col);
    assert(liveCell, "Empty-zone test requires a live covered cell at " + cell.row + ":" + cell.col + ".");
    return liveCell;
  });
  var removedCells = grid.removeCells(coveredCells);
  assert(removedCells.length === coveredCells.length, "Empty-zone test failed to remove every covered cell.");

  var clearedSnapshot = manager.getRuntimeSnapshot();
  var activeZoneIds = clearedSnapshot.systems.boardOcclusionSystem.activeZones.map(function (zone) {
    return zone.id;
  });
  assert(activeZoneIds.indexOf(targetZone.id) === -1, "Empty board occlusion zone did not disappear.");
  assert(activeZoneIds.indexOf(remainingZoneId) !== -1, "Non-empty board occlusion zone disappeared incorrectly.");
  var clearEvents = clearedSnapshot.runtimeEvents.filter(function (event) {
    return event.type === "board_occlusion_cleared" && event.reason === "board_empty";
  });
  assert(clearEvents.length === 1, "Empty board occlusion zone must emit one board_empty clear event.");
  assert(
    clearEvents[0].zoneIds.length === 1 && clearEvents[0].zoneIds[0] === targetZone.id,
    "Empty board occlusion clear event contains incorrect zone ids."
  );
  var repeatedSnapshot = manager.getRuntimeSnapshot();
  assert(
    repeatedSnapshot.runtimeEvents.every(function (event) {
      return !(event.type === "board_occlusion_cleared" && event.reason === "board_empty");
    }),
    "Empty board occlusion zone emitted a duplicate clear event."
  );
}

function validateSnowRemovalIntegration(levelConfig) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var manager = new GameManager();
  manager.bootstrap();
  manager.startLevel(levelConfig, {
    runMode: "campaign",
    attemptIndex: 1,
    seed: "level:" + levelConfig.level.levelId + ":attempt:1"
  });
  manager.systems.boardViewportSystem.finishIntroImmediately();
  var grantResult = manager.grantPowerupInventory("snow_removal", 1);
  assert(grantResult.accepted === true, "Snow removal integration failed to grant runtime inventory.");
  var preview = manager.previewSnowRemoval();
  assert(preview.accepted === true, "Snow removal integration preview was rejected.");
  assert(preview.targetKind === "board_occlusion", "Snow removal must prioritize board occlusions.");
  assert(preview.targets.length > 0, "Snow removal occlusion preview requires targets.");
  var useResult = manager.useSnowRemoval(preview.targets);
  assert(useResult.accepted === true, "Snow removal integration use was rejected.");
  assert(useResult.targetKind === "board_occlusion", "Snow removal integration resolved the wrong target kind.");
  assert(useResult.remaining === 0, "Snow removal integration did not consume one runtime item.");
  assert(
    useResult.snapshot.systems.boardOcclusionSystem.activeZones.length === 0,
    "Snow removal integration left active board occlusions."
  );
}

function validateRandomChallengeDeterminism() {
  var seed = "board_occlusion_validator_seed";
  var rawConfig = RandomChallengeGenerator.buildConfig({
    seed: seed,
    highestUnlockedLevel: 500
  });
  var levelConfig = LevelConfigLoader.normalizeLevelConfig(rawConfig, "level_1001");
  var firstSystem = createSystem(levelConfig);
  var secondSystem = createSystem(levelConfig);
  var context = {
    runMode: "random_challenge",
    attemptIndex: 1,
    seed: seed
  };
  var first = firstSystem.startRun(context);
  var second = secondSystem.startRun(context);
  assert(first.variantId === second.variantId, "Random challenge occlusion variant must be stable for the same seed.");
  assert(
    JSON.stringify(first.activeZones) === JSON.stringify(second.activeZones),
    "Random challenge occlusion zones must be stable for the same seed."
  );
}

function validateAssets() {
  [
    "assets/map/config/levels/level_board_occlusion_test.json",
    "assets/map/config/levels/level_board_occlusion_test.json.meta",
    "assets/game/image/props/cloud.png",
    "assets/game/image/props/cloud.png.meta",
    "assets/game/image/props/leaves.png",
    "assets/game/image/props/leaves.png.meta",
    "assets/game/image/props/clock.png",
    "assets/game/image/props/clock.png.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), "Missing board occlusion asset: " + relativePath);
  });
  ["cloud", "leaves"].forEach(function (assetName) {
    var textureMeta = readJson("assets/game/image/props/" + assetName + ".png.meta");
    assert(
      textureMeta.packable === false,
      "Board occlusion " + assetName + " must not enter the dynamic atlas."
    );
  });
}

function validateLeavesMotionContract() {
  var rendererSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "gameplay-src/render/LevelRendererSceneOcclusionMethods.js"),
    "utf8"
  );
  assert(
    rendererSource.indexOf("cc.rotateTo") === -1,
    "Board occlusion leaves must not use rotation actions."
  );
}

function validateCloudMotionContract() {
  var rendererSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "gameplay-src/render/LevelRendererSceneOcclusionMethods.js"),
    "utf8"
  );
  assert(
    rendererSource.indexOf("var CLOUD_BREATH_HALF_DURATION_SECONDS = 2.4;") >= 0 &&
      rendererSource.indexOf("var CLOUD_BREATH_START_OPACITY = 244;") >= 0 &&
      rendererSource.indexOf("var CLOUD_BREATH_MAX_OPACITY = 252;") >= 0 &&
      rendererSource.indexOf("var CLOUD_BREATH_MIN_OPACITY = 236;") >= 0 &&
      rendererSource.indexOf(
        "cc.fadeTo(CLOUD_BREATH_HALF_DURATION_SECONDS, CLOUD_BREATH_MAX_OPACITY)"
      ) >= 0 &&
      rendererSource.indexOf(
        "cc.fadeTo(CLOUD_BREATH_HALF_DURATION_SECONDS, CLOUD_BREATH_MIN_OPACITY)"
      ) >= 0,
    "Board occlusion cloud must use the slow, high-opacity breathing contract."
  );
}

function validateShotCountdownLayoutContract() {
  var rendererSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "gameplay-src/render/LevelRendererSceneOcclusionMethods.js"),
    "utf8"
  );
  assert(
      rendererSource.indexOf('labelNode.setPosition(0, 0);') >= 0 &&
      rendererSource.indexOf('labelNode.zIndex = 2;') >= 0 &&
      rendererSource.indexOf('ensureLabel(labelNode, "", 42, 48, cc.Label.HorizontalAlign.CENTER);') >= 0 &&
      rendererSource.indexOf('labelNode.color = cc.color(255, 138, 31);') >= 0 &&
      rendererSource.indexOf('label.overflow = cc.Label.Overflow.NONE;') >= 0 &&
      rendererSource.indexOf('label.enableWrapText = false;') >= 0 &&
      rendererSource.indexOf('label.string = String(zone.remainingShots);') >= 0,
    "Shot-count occlusion label must display only the remaining number at the center above the occlusion visual."
  );
}

function validateClockLayoutContract() {
  var rendererSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "gameplay-src/render/LevelRendererSceneOcclusionMethods.js"),
    "utf8"
  );
  assert(
    rendererSource.indexOf("clockNode.setScale") === -1,
    "Board occlusion countdown clock must use its original 58x60 size."
  );
  assert(
    rendererSource.indexOf("clockNode.setPosition(0, 0)") >= 0 &&
      rendererSource.indexOf("clockNode.zIndex = 1") >= 0 &&
      rendererSource.indexOf("labelY: -originalSize.height * 0.25") >= 0 &&
      rendererSource.indexOf("labelNode.zIndex = 2") >= 0 &&
      rendererSource.indexOf('label.string = Math.ceil(zone.remainingTimeMs / 1000) + "秒"') >= 0,
    "Board occlusion clock must be centered with countdown text above its bottom frame."
  );
}

function validateCountdownRenderRefresh() {
  function TestLevelRenderer() {}
  attachLevelRendererSceneOcclusionMethods(TestLevelRenderer, {
    BoardLayout: {},
    BOARD_BUBBLE_SIZE: {},
    BOARD_OCCLUSION_RESOURCES: {},
    BOARD_OCCLUSION_CLOCK_RESOURCE: "game/image/props/clock",
    ensureSprite: function () {},
    ensureLabel: function () {}
  });

  var countdownLabel = { string: "12秒" };
  var countdownNode = {
    isValid: true,
    getComponent: function (componentType) {
      assert(componentType === global.cc.Label, "Countdown refresh requested the wrong component type.");
      return countdownLabel;
    }
  };
  var rootNode = {
    isValid: true,
    getChildByName: function (name) {
      return name === "Countdown" ? countdownNode : null;
    }
  };
  var layer = {
    isValid: true,
    children: [rootNode],
    getChildByName: function (name) {
      return name === "BoardOcclusion_0_zone_1" ? rootNode : null;
    }
  };
  var renderer = new TestLevelRenderer();
  renderer.layers = { boardOcclusion: layer };
  renderer.lastBoardOcclusionRenderKey = "previous";
  renderer._refreshBoardOcclusionCountdowns({
    board: {
      maxColumns: 11,
      viewportOffsetY: 0
    },
    systems: {
      boardOcclusionSystem: {
        version: 3,
        activeZones: [{
          id: "zone_1",
          remainingTimeMs: 10400
        }]
      }
    }
  });
  assert(countdownLabel.string === "11秒", "Timed occlusion countdown label did not update its second bucket.");
  assert(
    renderer.lastBoardOcclusionRenderKey === "3|11|0",
    "Timed occlusion countdown refresh did not synchronize the render key."
  );

  var levelRendererSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "gameplay-src/render/LevelRenderer.js"),
    "utf8"
  );
  assert(
    levelRendererSource.indexOf(
      "LevelRenderer.prototype._refreshRuntimeTimer = function (runtimeSnapshot) {\n" +
      "  this._refreshBoardOcclusionCountdowns(runtimeSnapshot);"
    ) >= 0,
    "Timer refresh scope must update board occlusion countdown labels."
  );
}

function validateHiddenTestEntryIntegration() {
  var levelManagerSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/config/LevelManager.js"),
    "utf8"
  );
  var bootstrapSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrap.js"),
    "utf8"
  );
  var levelSelectViewSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/LevelSelectView.js"),
    "utf8"
  );
  var levelSelectFlowSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js"),
    "utf8"
  );
  var routeFlowSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapRouteEditorFlowMethods.js"),
    "utf8"
  );
  var levelRuntimeSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapLevelRuntimeMethods.js"),
    "utf8"
  );
  var powerupSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js"),
    "utf8"
  );
  assert(
    levelManagerSource.indexOf("loadBoardOcclusionTestLevel") >= 0,
    "LevelManager must expose loadBoardOcclusionTestLevel."
  );
  assert(
    bootstrapSource.indexOf(
      "_startBoardOcclusionTestLevelEntry: GameBootstrapUiFlowMethods._startBoardOcclusionTestLevelEntry"
    ) >= 0 &&
      bootstrapSource.indexOf(
        "_onLevelSelectBoardOcclusionTestTap: GameBootstrapUiFlowMethods._onLevelSelectBoardOcclusionTestTap"
      ) >= 0,
    "GameBootstrap must attach both board occlusion test entry methods."
  );
  assert(
    levelSelectViewSource.indexOf("board_occlusion_test_btn") >= 0 &&
      levelSelectViewSource.indexOf('label.string = "遮挡"') >= 0,
    "Hidden test mode must create the 遮挡 button."
  );
  assert(
    levelSelectFlowSource.indexOf("_startBoardOcclusionTestLevelEntry") >= 0 &&
      levelSelectFlowSource.indexOf('testSource: "board_occlusion"') >= 0,
    "Level select flow must enter the dedicated board occlusion test."
  );
  assert(
    routeFlowSource.indexOf('grantPowerupInventory("snow_removal", 3)') >= 0,
    "Board occlusion test must grant three runtime snow_removal items."
  );
  assert(
    levelRuntimeSource.indexOf('testSource === "board_occlusion"') >= 0 &&
      levelRuntimeSource.indexOf("_startBoardOcclusionTestLevelEntry") >= 0,
    "Board occlusion test retry must restart the dedicated test entry."
  );
  assert(
    powerupSource.indexOf('this._currentRunContext.testSource === "board_occlusion"') >= 0,
    "Board occlusion test snow_removal use must not consume persistent inventory."
  );
}

function main() {
  var timedCampaignLevelConfig = loadCampaignLevel(80);
  var shotCampaignLevelConfig = loadCampaignLevel(81);
  var testLevelConfig = loadBoardOcclusionTestLevel();
  validateNoRepeat(shotCampaignLevelConfig);
  validateVariantContract(shotCampaignLevelConfig);
  validateDedicatedTestLevel(testLevelConfig);
  validateNoRepeat(testLevelConfig);
  validateVariantContract(testLevelConfig);
  validatePlayModeClearRules(timedCampaignLevelConfig);
  validatePlayModeClearRules(shotCampaignLevelConfig);
  validatePlayModeClearRules(testLevelConfig);
  validateMismatchedPlayModeRulesFailFast(shotCampaignLevelConfig, timedCampaignLevelConfig);
  validateAutomaticClears(timedCampaignLevelConfig, testLevelConfig);
  validateItemClear(testLevelConfig);
  validateEmptyZoneClear(testLevelConfig);
  validateSnowRemovalIntegration(testLevelConfig);
  validateRandomChallengeDeterminism();
  validateAssets();
  validateLeavesMotionContract();
  validateCloudMotionContract();
  validateShotCountdownLayoutContract();
  validateClockLayoutContract();
  validateCountdownRenderRefresh();
  validateHiddenTestEntryIntegration();
  console.log("Board occlusion validation passed.");
}

main();
