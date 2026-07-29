"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var RandomChallengeGenerator = require("../assets/scripts/config/RandomChallengeGenerator");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BoardOcclusionSystem = require("../gameplay-src/systems/BoardOcclusionSystem");
var GameManager = require("../gameplay-src/core/GameManager");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function validateAutomaticClears(levelConfig) {
  var timedAttempt = findAttemptByRule(levelConfig, "item_or_seconds");
  var timedSystem = createSystem(levelConfig);
  var timedSnapshot = startAttempt(timedSystem, levelConfig.level.levelId, timedAttempt.attemptIndex);
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

  var shotAttempt = findAttemptByRule(levelConfig, "item_or_shots");
  var shotSystem = createSystem(levelConfig);
  var shotSnapshot = startAttempt(shotSystem, levelConfig.level.levelId, shotAttempt.attemptIndex);
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
    "assets/game/image/props/cloud.png",
    "assets/game/image/props/cloud.png.meta",
    "assets/game/image/props/leaves.png",
    "assets/game/image/props/leaves.png.meta",
    "assets/game/image/props/clock.png",
    "assets/game/image/props/clock.png.meta"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(PROJECT_ROOT, relativePath)), "Missing board occlusion asset: " + relativePath);
  });
}

function main() {
  var levelConfig = loadCampaignLevel(81);
  validateNoRepeat(levelConfig);
  validateVariantContract(levelConfig);
  validateAutomaticClears(levelConfig);
  validateItemClear(levelConfig);
  validateSnowRemovalIntegration(levelConfig);
  validateRandomChallengeDeterminism();
  validateAssets();
  console.log("Board occlusion validation passed.");
}

main();
