"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");
var BubbleGrid = require("../assets/scripts/systems/BubbleGrid");
var TrajectoryPredictor = require("../assets/scripts/systems/TrajectoryPredictor");

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

function createLevelConfig(levelId) {
  var key = "level_" + ("000" + levelId).slice(-3);
  var filePath = path.resolve(__dirname, "../assets/resources/config/levels/" + key + ".json");
  var raw = readJson(filePath);

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

  if (failed) {
    console.log("\nShot regression validation failed.");
    process.exit(1);
  }

  console.log("\nShot regression validation passed for", results.length, "levels.");
}

main();

