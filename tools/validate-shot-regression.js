"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");
var BubbleGrid = require("../assets/scripts/systems/BubbleGrid");
var GameManager = require("../assets/scripts/core/GameManager");
var LevelPackManifest = require("../assets/scripts/config/LevelPackManifest");
var SpecialAnimationTiming = require("../assets/scripts/config/SpecialAnimationTiming");
var TrajectoryPredictor = require("../assets/scripts/systems/TrajectoryPredictor");

var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var MANIFEST_PATH = path.resolve(__dirname, "../assets/resources/config/level_manifest.json");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  return JSON.parse(raw);
}

function normalizeDirection(origin, target) {
  var dx = target.x - origin.x;
  var dy = target.y - origin.y;
  var length = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    x: dx / length,
    y: dy / length
  };
}

function stableSignature(plan) {
  return [
    plan.hitType,
    plan.targetCell ? plan.targetCell.row : "-",
    plan.targetCell ? plan.targetCell.col : "-",
    plan.wallBounceCount,
    plan.targetCellPosition ? plan.targetCellPosition.x.toFixed(3) : "-",
    plan.targetCellPosition ? plan.targetCellPosition.y.toFixed(3) : "-"
  ].join("|");
}

function loadLevelRaw(levelId) {
  var key = "level_" + String(levelId).padStart(3, "0");
  if (levelId <= LevelPackManifest.LOCAL_LEVEL_MAX) {
    return readJson(path.join(LEVEL_DIR, key + ".json"));
  }

  var manifest = LevelPackManifest.normalizeManifest(readJson(MANIFEST_PATH));
  var pack = LevelPackManifest.findPackForLevelId(manifest, levelId);
  var packData = readJson(path.join(REMOTE_PACK_DIR, pack.id + ".json"));
  if (!packData.levels || !packData.levels[key]) {
    throw new Error("Missing remote level config: " + key + " in " + pack.id);
  }
  return packData.levels[key];
}

function createLevelConfig(levelId) {
  var key = "level_" + String(levelId).padStart(3, "0");
  var raw = loadLevelRaw(levelId);

  if (!raw.level || !Array.isArray(raw.level.layout)) {
    throw new Error("Invalid level config: " + key);
  }

  var cloned = JSON.parse(JSON.stringify(raw));
  var aimMeta = AimTuningProfiles.applyToLevel(cloned.level);
  cloned.meta = {
    resourceKey: key,
    loadedAt: Date.now(),
    aimProfile: aimMeta.profile,
    aimDifficulty: aimMeta.difficulty
  };

  return cloned;
}

function buildRegressionCases() {
  return [
    {
      levelId: 1,
      shots: [
        { name: "center", point: { x: 0, y: 500 } },
        { name: "left_bank", point: { x: -260, y: 420 } },
        { name: "right_bank", point: { x: 260, y: 420 } },
        { name: "narrow_left", point: { x: -110, y: 640 } }
      ]
    },
    {
      levelId: 10,
      shots: [
        { name: "center", point: { x: 0, y: 520 } },
        { name: "left_bank", point: { x: -280, y: 440 } },
        { name: "right_bank", point: { x: 280, y: 440 } },
        { name: "steep_right", point: { x: 120, y: 660 } }
      ]
    },
    {
      levelId: 20,
      shots: [
        { name: "center", point: { x: 0, y: 520 } },
        { name: "left_bank", point: { x: -300, y: 450 } },
        { name: "right_bank", point: { x: 300, y: 450 } },
        { name: "steep_left", point: { x: -130, y: 670 } }
      ]
    }
  ];
}

function runCase(levelCase) {
  var levelConfig = createLevelConfig(levelCase.levelId);
  var grid = new BubbleGrid();
  var predictor = new TrajectoryPredictor();

  grid.initialize({});
  predictor.initialize({});

  grid.configureLevel(levelConfig);
  predictor.configureLevel(levelConfig);

  var origin = {
    x: BoardLayout.shooterOrigin.x,
    y: BoardLayout.shooterOrigin.y
  };

  var failures = [];
  levelCase.shots.forEach(function (shot) {
    var direction = normalizeDirection(origin, shot.point);
    if (direction.y <= 0) {
      failures.push("" + shot.name + ": invalid direction (y<=0)");
      return;
    }

    var firstPlan = predictor.predictShotPlan(grid, origin, direction);
    if (!firstPlan || !firstPlan.valid || !firstPlan.targetCell) {
      failures.push("" + shot.name + ": no valid plan");
      return;
    }

    var baseSignature = stableSignature(firstPlan);

    for (var i = 0; i < 24; i += 1) {
      var replayPlan = predictor.predictShotPlan(grid, origin, direction);
      if (!replayPlan || !replayPlan.valid || !replayPlan.targetCell) {
        failures.push("" + shot.name + ": replay invalid at #" + i);
        break;
      }

      var replaySignature = stableSignature(replayPlan);
      if (replaySignature !== baseSignature) {
        failures.push(
          "" + shot.name + ": unstable endpoint (base=" + baseSignature + ", replay=" + replaySignature + ")"
        );
        break;
      }
    }
  });

  return {
    levelCode: levelConfig.level.code,
    levelId: levelCase.levelId,
    ok: failures.length === 0,
    failures: failures
  };
}

function runKeyUnlockBoardAdvanceDelayCase() {
  var manager = new GameManager();
  var advancedCount = 0;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;

  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  try {
    manager.dropInterval = 1;
    manager.shotsFired = 1;
    manager.lastResolution = {
      collectedKeys: [
        { id: "key_1", row: 1, col: 1, unlockGroup: "group_a" }
      ],
      unlockedLockedBalls: [
        { id: "locked_1", row: 1, col: 2, __sourceUnlockGroup: "group_a" }
      ],
      boardDropped: false
    };
    manager.systems.bubbleGrid = {
      advanceRows: function (rows) {
        if (rows !== 1) {
          throw new Error("Board advance regression expected one row.");
        }
        advancedCount += 1;
      },
      getDropOffsetRows: function () {
        return advancedCount;
      }
    };

    if (!manager._scheduleBoardAdvanceAfterImpact()) {
      throw new Error("Key unlock board advance regression expected scheduled advance.");
    }

    var keyUnlockDuration = SpecialAnimationTiming.keyUnlock.totalDuration;
    if (manager._updatePendingBoardAdvance(keyUnlockDuration - 0.001)) {
      throw new Error("Board advanced before key unlock animation finished.");
    }
    if (advancedCount !== 0) {
      throw new Error("Board advance count changed during key unlock animation.");
    }
    if (manager._updatePendingBoardAdvance(0.001)) {
      throw new Error("Board advanced in the same frame key unlock animation finished.");
    }
    if (manager._updatePendingBoardAdvance(0.199)) {
      throw new Error("Board advanced before post-impact delay finished.");
    }
    if (!manager._updatePendingBoardAdvance(0.001)) {
      throw new Error("Board did not advance after key unlock animation and impact delay.");
    }
    if (advancedCount !== 1 || manager.lastResolution.boardDropped !== true) {
      throw new Error("Board advance regression did not mark the expected single drop.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runKeyUnlockSingleTargetCase() {
  var manager = new GameManager();
  var grid = new BubbleGrid();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        ".........",
        ".........",
        "........."
      ],
      specialEntities: [
        { id: "key_1", entityCategory: "key_ball", entityType: "key", unlockGroup: "group_a", row: 1, col: 1 },
        { id: "locked_1", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", lockGroup: "group_a", row: 1, col: 2 },
        { id: "locked_2", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", lockGroup: "group_a", row: 2, col: 1 }
      ]
    }
  };
  var resolution = {
    collectedKeys: [],
    unlockedLockedBalls: []
  };

  grid.configureLevel(levelConfig);
  var keyCell = grid.getCell(1, 1);
  if (!keyCell || keyCell.entityCategory !== "key_ball") {
    throw new Error("Key unlock regression setup failed to create key cell.");
  }

  var removedKeys = manager._triggerAdjacentKeys([keyCell], grid, resolution);
  if (removedKeys.length !== 1 || resolution.collectedKeys.length !== 1) {
    throw new Error("Key unlock regression expected exactly one collected key.");
  }
  if (resolution.unlockedLockedBalls.length !== 1) {
    throw new Error("One key must unlock exactly one locked ball.");
  }
  if (resolution.unlockedLockedBalls[0].__sourceKeyId !== "key_1") {
    throw new Error("Unlocked locked ball must record source key id.");
  }

  var remainingLockedCount = grid.getCells().filter(function (cell) {
    return cell && cell.entityCategory === "locked_ball" && cell.lockGroup === "group_a";
  }).length;
  if (remainingLockedCount !== 1) {
    throw new Error("One key must leave the second same-group locked ball locked.");
  }
}

function main() {
  var cases = buildRegressionCases();
  var results = cases.map(runCase);
  var failed = false;

  results.forEach(function (result) {
    if (result.ok) {
      console.log("[OK]", result.levelCode, "(L" + result.levelId + ")", "stable trajectory samples passed");
      return;
    }

    failed = true;
    console.log("[FAIL]", result.levelCode, "(L" + result.levelId + ")");
    result.failures.forEach(function (item) {
      console.log("  -", item);
    });
  });

  runKeyUnlockBoardAdvanceDelayCase();
  console.log("[OK]", "key_unlock_board_advance_delay", "waited for special animation before board advance");
  runKeyUnlockSingleTargetCase();
  console.log("[OK]", "key_unlock_single_target", "one key unlocked one locked ball");

  if (failed) {
    console.log("\nShot regression validation failed.");
    process.exit(1);
  }

  console.log("\nShot regression validation passed for", results.length, "levels.");
}

main();
