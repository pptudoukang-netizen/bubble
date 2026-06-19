"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");
var BubbleGrid = require("../assets/scripts/systems/BubbleGrid");
var GameManager = require("../assets/scripts/core/GameManager");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var LevelPackManifest = require("../assets/scripts/config/LevelPackManifest");
var SpecialAnimationTiming = require("../assets/scripts/config/SpecialAnimationTiming");
var TrajectoryPredictor = require("../assets/scripts/systems/TrajectoryPredictor");

var LEVEL_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var MANIFEST_PATH = path.resolve(__dirname, "../assets/resources/config/level_manifest.json");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");

function createKeyUnlockRegressionManager() {
  var SupportSystem = require("../assets/scripts/systems/SupportSystem");
  var manager = new GameManager();
  manager.systems = {
    supportSystem: new SupportSystem(),
    fallingMarbleSystem: {
      registerDrops: function () {}
    }
  };
  return manager;
}

function createKeyUnlockResolution() {
  return {
    collectedKeys: [],
    unlockedLockedBalls: [],
    floating: []
  };
}

function collectKeysAndResolveUnlocks(manager, removedCells, grid, resolution) {
  var removedKeys = manager._triggerAdjacentKeys(removedCells, grid, resolution);
  manager._resolveCollectedKeyUnlocks(grid, resolution);
  return removedKeys;
}

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
  if (packData.format !== pack.format) {
    throw new Error("Remote pack format mismatch: " + pack.id);
  }
  if (pack.format !== LevelPackManifest.PACK_FORMAT_COMPACT_V1) {
    throw new Error("Remote pack format unsupported: " + pack.format);
  }
  packData = LevelPackCompactCodec.expandPack(packData);
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
        { id: "key_1", row: 1, col: 1 }
      ],
      unlockedLockedBalls: [
        { id: "locked_1", row: 1, col: 2, __sourceKeyId: "key_1" }
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
    var impactBounceDuration = SpecialAnimationTiming.calculateImpactBounceTotalDuration(
      SpecialAnimationTiming.impactBounce.defaultPushDistance,
      BoardLayout.impactBounceSpeed
    );
    if (manager._updatePendingBoardAdvance(impactBounceDuration - 0.001)) {
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

function runImpactBounceBoardAdvanceDelayCase() {
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
      collectedKeys: [],
      unlockedLockedBalls: [],
      impact: {
        seq: 1,
        pushDistance: SpecialAnimationTiming.impactBounce.defaultPushDistance,
        bounceSpeed: BoardLayout.impactBounceSpeed
      },
      boardDropped: false
    };
    manager.systems.bubbleGrid = {
      advanceRows: function (rows) {
        if (rows !== 1) {
          throw new Error("Impact board advance regression expected one row.");
        }
        advancedCount += 1;
      },
      getDropOffsetRows: function () {
        return advancedCount;
      }
    };

    if (!manager._scheduleBoardAdvanceAfterImpact()) {
      throw new Error("Impact board advance regression expected scheduled advance.");
    }

    var impactBounceDuration = SpecialAnimationTiming.calculateImpactBounceTotalDuration(
      SpecialAnimationTiming.impactBounce.defaultPushDistance,
      BoardLayout.impactBounceSpeed
    );
    if (impactBounceDuration <= 0.2) {
      throw new Error("Impact board advance delay must cover bounce animation and settle frame.");
    }
    if (manager._updatePendingBoardAdvance(impactBounceDuration - 0.001)) {
      throw new Error("Board advanced before impact bounce animation finished.");
    }
    if (advancedCount !== 0) {
      throw new Error("Board advance count changed during impact bounce animation.");
    }
    if (!manager._updatePendingBoardAdvance(0.001)) {
      throw new Error("Board did not advance after impact bounce animation finished.");
    }
    if (advancedCount !== 1 || manager.lastResolution.boardDropped !== true) {
      throw new Error("Impact board advance regression did not mark the expected single drop.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runImpactBounceBoardAdvanceSameUpdateFrameCase() {
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
    manager.boardAdvanceUpdateSerial = 3;
    manager.lastResolution = {
      collectedKeys: [],
      unlockedLockedBalls: [],
      impact: {
        seq: 1,
        pushDistance: SpecialAnimationTiming.impactBounce.defaultPushDistance,
        bounceSpeed: BoardLayout.impactBounceSpeed
      },
      boardDropped: false
    };
    manager.systems.bubbleGrid = {
      advanceRows: function (rows) {
        if (rows !== 1) {
          throw new Error("Impact same-frame regression expected one row.");
        }
        advancedCount += 1;
      },
      getDropOffsetRows: function () {
        return advancedCount;
      }
    };

    if (!manager._scheduleBoardAdvanceAfterImpact()) {
      throw new Error("Impact same-frame regression expected scheduled advance.");
    }
    if (manager._updatePendingBoardAdvance(999)) {
      throw new Error("Board advanced in the same update frame the impact bounce was scheduled.");
    }
    if (advancedCount !== 0) {
      throw new Error("Board advance count changed in the scheduling update frame.");
    }

    manager.boardAdvanceUpdateSerial = 4;
    var impactBounceDuration = SpecialAnimationTiming.calculateImpactBounceTotalDuration(
      SpecialAnimationTiming.impactBounce.defaultPushDistance,
      BoardLayout.impactBounceSpeed
    );
    if (!manager._updatePendingBoardAdvance(impactBounceDuration)) {
      throw new Error("Board did not advance after impact bounce delay on the next update frame.");
    }
    if (advancedCount !== 1 || manager.lastResolution.boardDropped !== true) {
      throw new Error("Impact same-frame regression did not mark the expected single drop.");
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
  var manager = createKeyUnlockRegressionManager();
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
        { id: "key_1", entityCategory: "key_ball", entityType: "key", row: 1, col: 1 },
        { id: "locked_1", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 1, col: 2 },
        { id: "locked_2", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 1 }
      ]
    }
  };
  var resolution = createKeyUnlockResolution();

  grid.configureLevel(levelConfig);
  var keyCell = grid.getCell(1, 1);
  if (!keyCell || keyCell.entityCategory !== "key_ball") {
    throw new Error("Key unlock regression setup failed to create key cell.");
  }

  var removedKeys = collectKeysAndResolveUnlocks(manager, [keyCell], grid, resolution);
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
    return cell && cell.entityCategory === "locked_ball";
  }).length;
  if (remainingLockedCount !== 1) {
    throw new Error("One key must leave the second same-group locked ball locked.");
  }
}

function runKeyUnlockNearestTargetCase() {
  var manager = createKeyUnlockRegressionManager();
  var grid = new BubbleGrid();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        ".........",
        ".........",
        ".........",
        "........."
      ],
      specialEntities: [
        { id: "key_1", entityCategory: "key_ball", entityType: "key", row: 1, col: 1 },
        { id: "locked_far", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 1, col: 3 },
        { id: "locked_near", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 1 }
      ]
    }
  };
  var resolution = createKeyUnlockResolution();

  grid.configureLevel(levelConfig);
  var keyCell = grid.getCell(1, 1);
  if (!keyCell || keyCell.entityCategory !== "key_ball") {
    throw new Error("Key nearest-target regression setup failed to create key cell.");
  }

  collectKeysAndResolveUnlocks(manager, [keyCell], grid, resolution);
  if (resolution.unlockedLockedBalls.length !== 1) {
    throw new Error("Key nearest-target regression expected exactly one unlocked locked ball.");
  }
  var unlockedTarget = resolution.unlockedLockedBalls[0];
  if (unlockedTarget.row !== 2 || unlockedTarget.col !== 1) {
    throw new Error("Key must unlock the visually nearest locked ball.");
  }
}

function runKeyUnlockCompetitiveNearestCase() {
  var manager = createKeyUnlockRegressionManager();
  var grid = new BubbleGrid();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        ".........",
        ".........",
        ".........",
        "........."
      ],
      specialEntities: [
        { id: "key_left", entityCategory: "key_ball", entityType: "key", row: 2, col: 1 },
        { id: "key_right", entityCategory: "key_ball", entityType: "key", row: 2, col: 5 },
        { id: "locked_left", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 2, col: 2 },
        { id: "locked_right", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 4 }
      ]
    }
  };
  var resolution = createKeyUnlockResolution();

  grid.configureLevel(levelConfig);
  var leftKey = grid.getCell(2, 1);
  var rightKey = grid.getCell(2, 5);
  if (!leftKey || !rightKey) {
    throw new Error("Competitive nearest-key regression setup failed to create key cells.");
  }

  collectKeysAndResolveUnlocks(manager, [leftKey, rightKey], grid, resolution);
  if (resolution.unlockedLockedBalls.length !== 2) {
    throw new Error("Competitive nearest-key regression expected two unlocked locked balls.");
  }

  var leftUnlock = resolution.unlockedLockedBalls.find(function (cell) {
    return cell.__sourceKeyId === "key_left";
  });
  var rightUnlock = resolution.unlockedLockedBalls.find(function (cell) {
    return cell.__sourceKeyId === "key_right";
  });
  if (!leftUnlock || leftUnlock.row !== 2 || leftUnlock.col !== 2) {
    throw new Error("Left key must unlock nearest locked ball on its right.");
  }
  if (!rightUnlock || rightUnlock.row !== 2 || rightUnlock.col !== 4) {
    throw new Error("Right key must unlock nearest locked ball on its left.");
  }
}

function runKeyUnlockSequentialWaveCase() {
  var manager = createKeyUnlockRegressionManager();
  var grid = new BubbleGrid();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        ".........",
        ".........",
        ".........",
        ".........",
        "........."
      ],
      specialEntities: [
        { id: "key_far", entityCategory: "key_ball", entityType: "key", row: 2, col: 1 },
        { id: "key_near", entityCategory: "key_ball", entityType: "key", row: 2, col: 3 },
        { id: "locked_a", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 2, col: 4 },
        { id: "locked_b", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 6 }
      ]
    }
  };
  var resolution = createKeyUnlockResolution();

  grid.configureLevel(levelConfig);
  var farKey = grid.getCell(2, 1);
  var nearKey = grid.getCell(2, 3);
  if (!farKey || !nearKey) {
    throw new Error("Sequential key unlock regression setup failed to create key cells.");
  }

  manager._triggerAdjacentKeys([farKey], grid, resolution);
  manager._triggerAdjacentKeys([nearKey], grid, resolution);
  manager._resolveCollectedKeyUnlocks(grid, resolution);

  if (resolution.unlockedLockedBalls.length !== 2) {
    throw new Error("Sequential key unlock regression expected two unlocked locked balls.");
  }

  var nearUnlock = resolution.unlockedLockedBalls.find(function (cell) {
    return cell.__sourceKeyId === "key_near";
  });
  var farUnlock = resolution.unlockedLockedBalls.find(function (cell) {
    return cell.__sourceKeyId === "key_far";
  });
  if (!nearUnlock || nearUnlock.row !== 2 || nearUnlock.col !== 4) {
    throw new Error("Near key must unlock the visually nearest locked ball after deferred pairing.");
  }
  if (!farUnlock || farUnlock.row !== 2 || farUnlock.col !== 6) {
    throw new Error("Far key must unlock the remaining locked ball after deferred pairing.");
  }
}

function runKeyUnlockUnsupportedFallsCase() {
  var manager = new GameManager();
  var grid = new BubbleGrid();
  var support = require("../assets/scripts/systems/SupportSystem");
  var supportSystem = new support();
  var falling = require("../assets/scripts/systems/FallingMarbleSystem");
  var fallingMarbleSystem = new falling();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    colors: ["R", "G", "B"],
    level: {
      initialDropSpaceRows: 8,
      colors: ["R", "G", "B"],
      jarColors: ["R", "G", "B"],
      layout: [
        ".........",
        ".........",
        "GGG.......",
        "G.........",
        "........."
      ],
      specialEntities: [
        { id: "key_1", entityCategory: "key_ball", entityType: "key", row: 3, col: 1 },
        { id: "locked_1", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 3, col: 2 }
      ]
    },
    sharedDefaults: {
      fallingRules: {
        maxDynamicMarbles: 20,
        maxBounces: 3
      }
    }
  };
  var match = require("../assets/scripts/systems/MatchSystem");
  var matchSystem = new match();
  var jars = require("../assets/scripts/systems/JarCollectorSystem");
  var jarCollectorSystem = new jars();

  grid.configureLevel(levelConfig);
  supportSystem.configureLevel(levelConfig);
  matchSystem.configureLevel(levelConfig);
  fallingMarbleSystem.configureLevel(levelConfig);
  jarCollectorSystem.configureLevel(levelConfig);

  manager.systems = {
    bubbleGrid: grid,
    supportSystem: supportSystem,
    matchSystem: matchSystem,
    fallingMarbleSystem: fallingMarbleSystem,
    jarCollectorSystem: jarCollectorSystem
  };

  var previousCc = global.cc;
  global.cc = { log: function () {} };

  try {
    var attached = grid.getCell(2, 1);
    if (!attached || attached.color !== "G") {
      throw new Error("Unsupported unlock fall regression setup failed to create green match anchor.");
    }
    var resolution = manager._resolveAttachment(attached);
    if (resolution.floating.length !== 1) {
      throw new Error("Unsupported unlocked locked ball must enter floating resolution.");
    }
    if (resolution.floating[0].row !== 3 || resolution.floating[0].col !== 2 || resolution.floating[0].color !== "R") {
      throw new Error("Unsupported unlocked locked ball must float as unlocked color.");
    }
    if (grid.getCell(3, 2)) {
      throw new Error("Unsupported unlocked locked ball must be removed from the board.");
    }
    if (fallingMarbleSystem.activeDrops.length < 1) {
      throw new Error("Unsupported unlocked locked ball must register falling drops.");
    }
    var unlockedDrop = fallingMarbleSystem.activeDrops.find(function (drop) {
      return drop && drop.row === 3 && drop.col === 2 && drop.color === "R";
    });
    if (!unlockedDrop) {
      throw new Error("Unsupported unlocked locked ball must produce a falling drop at unlock coordinates.");
    }
    if (unlockedDrop.startDelay !== SpecialAnimationTiming.keyUnlock.totalDuration) {
      throw new Error("Unsupported unlocked locked ball must wait for key unlock animation.");
    }
    if (resolution.floating[0].__resolutionDropRegistered !== true) {
      throw new Error("Unsupported unlocked locked ball must register drops during unlock flush.");
    }
    var dropCountAfterResolve = fallingMarbleSystem.activeDrops.length;
    manager._registerResolutionDrops(resolution.floating, grid, resolution);
    if (fallingMarbleSystem.activeDrops.length !== dropCountAfterResolve) {
      throw new Error("Unsupported unlocked locked ball drops must not be registered twice.");
    }
  } finally {
    if (previousCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runMolotovChainQueueCase() {
  var manager = new GameManager();
  var removedByFirstBlast = [
    { id: "normal_neighbor", row: 1, col: 1, color: "R", entityCategory: "normal_ball", entityType: null }
  ];
  var chainedMolotov = {
    id: "molotov_chain",
    row: 1,
    col: 2,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var grid = {
    getNeighborCoordinates: function (row, col) {
      if (row !== 1 || col !== 1) {
        throw new Error("Molotov chain regression queried unexpected coordinates.");
      }
      return [{ row: 1, col: 2 }];
    },
    getCell: function (row, col) {
      if (row === 1 && col === 2) {
        return chainedMolotov;
      }
      return null;
    }
  };
  var resolution = {
    reactiveTriggered: []
  };

  manager.molotovBlastTriggeredIds = {
    molotov_first: true
  };
  var chainMolotovs = manager._collectAdjacentMolotovs(
    removedByFirstBlast,
    grid,
    manager.molotovBlastTriggeredIds
  );
  if (manager.molotovBlastTriggeredIds.molotov_chain === true) {
    throw new Error("Molotov chain collection must not pre-mark chain target as triggered.");
  }
  manager._queueMolotovBlasts(chainMolotovs, resolution);

  if (!manager.activeMolotovBlast || manager.activeMolotovBlast.id !== "molotov_chain") {
    throw new Error("Molotov chain regression expected adjacent molotov to become active.");
  }
  if (resolution.reactiveTriggered.length !== 1 || resolution.reactiveTriggered[0].id !== "molotov_chain") {
    throw new Error("Molotov chain regression expected one reactive trigger event.");
  }
}

function runAdjacentIceThawSnowballCollectionCase() {
  var manager = new GameManager();
  manager.iceCollectedTotal = 0;
  manager.lastResolution = { iceCollected: 0 };
  manager.pendingRuntimeEvents = [];

  var thawGain = manager._registerIceCollection([
    { id: "thawed_1", entityCategory: "normal_ball", entityType: null, color: "R", row: 2, col: 3 }
  ]);
  if (thawGain !== 1 || manager.iceCollectedTotal !== 1 || manager.lastResolution.iceCollected !== 1) {
    throw new Error("Adjacent ice thaw must count one snowball collection.");
  }
  if (manager.pendingRuntimeEvents.length !== 1 || manager.pendingRuntimeEvents[0].type !== "ice_snowball_collect") {
    throw new Error("Adjacent ice thaw must emit ice_snowball_collect runtime event.");
  }
  if (
    !Array.isArray(manager.pendingRuntimeEvents[0].entries) ||
    manager.pendingRuntimeEvents[0].entries.length !== 1 ||
    manager.pendingRuntimeEvents[0].entries[0].innerColor !== "R"
  ) {
    throw new Error("Adjacent ice thaw event must include collect entry.");
  }

  var iceCell = {
    id: "ice_1",
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: "R",
    row: 1,
    col: 1
  };
  var directGain = manager._registerIceCollection([iceCell]);
  if (directGain !== 1 || manager.iceCollectedTotal !== 2 || manager.lastResolution.iceCollected !== 2) {
    throw new Error("Direct ice removal must count one snowball collection.");
  }
  if (iceCell.iceSnowballAlreadyCollected !== true) {
    throw new Error("Direct ice removal must mark snowball as already collected.");
  }
  var duplicateGain = manager._registerIceSnowballCollection([iceCell]);
  if (duplicateGain !== 0 || manager.iceCollectedTotal !== 2) {
    throw new Error("Collected ice drop must not double count snowball.");
  }
}

function runFloatingIceDropThawBeforeFallCase() {
  var manager = new GameManager();
  manager.iceCollectedTotal = 0;
  manager.pendingRuntimeEvents = [];
  manager.systems.fallingMarbleSystem.configureLevel({
    level: {
      jarCount: 1,
      jarColors: ["R"]
    },
    sharedDefaults: {
      fallingRules: {
        maxDynamicMarbles: 8
      }
    }
  });

  var grid = {
    getCellPosition: function (row, col) {
      return BoardLayout.getCellPosition(row, col, 11, 0);
    }
  };

  var resolution = {
    thawed: [],
    iceCollected: 0,
    impact: { seq: 1 }
  };
  var iceCell = {
    id: "ice_floating",
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: "R",
    row: 3,
    col: 4
  };
  var normalCell = {
    id: "ball_floating",
    entityCategory: "normal_ball",
    entityType: null,
    color: "G",
    row: 2,
    col: 4
  };

  manager._registerResolutionDrops([normalCell, iceCell], grid, resolution);

  if (resolution.iceCollected !== 1 || manager.iceCollectedTotal !== 1) {
    throw new Error("Floating ice drop must count one snowball before fall.");
  }
  if (resolution.thawed.length !== 1 || resolution.thawed[0].color !== "R") {
    throw new Error("Floating ice drop must append thaw entry for shake animation.");
  }
  if (manager.pendingRuntimeEvents.length !== 1 || manager.pendingRuntimeEvents[0].type !== "ice_snowball_collect") {
    throw new Error("Floating ice drop must emit ice_snowball_collect runtime event.");
  }

  var activeDrops = manager.systems.fallingMarbleSystem.activeDrops;
  if (activeDrops.length !== 2) {
    throw new Error("Floating ice drop must register immediate and delayed drops.");
  }

  var immediateDrop = activeDrops[0];
  var delayedDrop = activeDrops[1];
  if (immediateDrop.color !== "G") {
    throw new Error("Floating ice drop must keep normal ball as immediate drop.");
  }
  if (typeof immediateDrop.startDelay !== "number" || immediateDrop.startDelay > 0) {
    throw new Error("Normal floating drop must start immediately.");
  }
  if (delayedDrop.color !== "R" || delayedDrop.entityCategory !== "normal_ball") {
    throw new Error("Floating ice drop must fall as thawed inner color ball.");
  }
  if (delayedDrop.iceSnowballAlreadyCollected !== true) {
    throw new Error("Floating ice drop must mark snowball as already collected.");
  }
  if (delayedDrop.startDelay !== SpecialAnimationTiming.iceSnowballCollect.floatingIceDropDelay) {
    throw new Error("Floating ice drop must wait for thaw and fly animation.");
  }
}

function runObjectiveWinRequiresStarAndAllTargetsCase() {
  var manager = new GameManager();
  manager.currentLevel = {
    level: {
      winConditions: [
        { type: "collect_any", value: 3 },
        { type: "collect_ice_snowball", value: 2 }
      ]
    }
  };
  manager.requiredStarCount = 1;
  manager.scoreHeatBand = {
    min: 100,
    target: 200,
    max: 300
  };
  manager.systems.jarCollectorSystem = {
    jarColors: ["R", "B"],
    collectedByColor: { R: 2, B: 1 },
    collectedTotal: 3,
    objectiveTarget: 3,
    lastCollected: [],
    snapshot: function () {
      return {
        collectedTotal: 3,
        collectedByColor: { R: 2, B: 1 }
      };
    }
  };
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  manager.iceCollectedTotal = 2;
  manager.score = 99;

  if (manager._isObjectiveWinCompleted()) {
    throw new Error("Objective win must require at least one star.");
  }

  manager.score = 100;
  manager.iceCollectedTotal = 1;
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  if (manager._isObjectiveWinCompleted()) {
    throw new Error("Objective win must require every collection objective.");
  }

  manager.iceCollectedTotal = 2;
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  if (!manager._isObjectiveWinCompleted()) {
    throw new Error("Objective win should pass after one star and all collection objectives are complete.");
  }
}

function runReviveDangerSpaceKeepsLockedBallCase() {
  var grid = new BubbleGrid();
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        ".........."
      ],
      specialEntities: [
        {
          id: "locked_revive_anchor",
          entityCategory: "locked_ball",
          entityType: "locked",
          lockedColor: "R",
          row: 8,
          col: 4
        }
      ]
    }
  };

  grid.configureLevel(levelConfig);
  grid.advanceRows(10);

  var result = grid.ensureDangerLineSpaceRows(3);
  if (result.shiftRows !== 3) {
    throw new Error("Ad revive danger space must shift the board up three rows when initial top space allows it.");
  }
  if (result.removedCells.length !== 0) {
    throw new Error("Ad revive danger space must not remove cells when three-row shift is available.");
  }

  var lockedCell = grid.getCell(8, 4);
  if (!lockedCell || lockedCell.entityCategory !== "locked_ball" || lockedCell.entityType !== "locked") {
    throw new Error("Ad revive danger space must keep unsupported locked balls on the board.");
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
  runImpactBounceBoardAdvanceDelayCase();
  console.log("[OK]", "impact_bounce_board_advance_delay", "waited for impact bounce before board advance");
  runImpactBounceBoardAdvanceSameUpdateFrameCase();
  console.log("[OK]", "impact_bounce_board_advance_same_update_frame", "did not consume delay in the scheduling update frame");
  runKeyUnlockSingleTargetCase();
  console.log("[OK]", "key_unlock_single_target", "one key unlocked one locked ball");
  runKeyUnlockNearestTargetCase();
  console.log("[OK]", "key_unlock_nearest_target", "key unlocked visually nearest locked ball");
  runKeyUnlockCompetitiveNearestCase();
  console.log("[OK]", "key_unlock_competitive_nearest", "each key unlocked nearest lock in shared group");
  runKeyUnlockSequentialWaveCase();
  console.log("[OK]", "key_unlock_sequential_wave", "deferred pairing kept nearest lock for later collected key");
  runKeyUnlockUnsupportedFallsCase();
  console.log("[OK]", "key_unlock_unsupported_falls", "unsupported unlocked locked ball falls instead of disappearing");
  runMolotovChainQueueCase();
  console.log("[OK]", "molotov_chain_queue", "adjacent molotov queued after neighbor removal");
  runAdjacentIceThawSnowballCollectionCase();
  console.log("[OK]", "adjacent_ice_thaw_snowball_collection", "neighbor thaw and direct ice removal count snowballs once");
  runFloatingIceDropThawBeforeFallCase();
  console.log("[OK]", "floating_ice_drop_thaw_before_fall", "floating ice thaws, flies, then drops inner ball");
  runObjectiveWinRequiresStarAndAllTargetsCase();
  console.log("[OK]", "objective_win_requires_star_and_all_targets", "requires one star and every collection target");
  runReviveDangerSpaceKeepsLockedBallCase();
  console.log("[OK]", "revive_danger_space_keeps_locked_ball", "shifted board up without removing unsupported locked ball");

  if (failed) {
    console.log("\nShot regression validation failed.");
    process.exit(1);
  }

  console.log("\nShot regression validation passed for", results.length, "levels.");
}

main();
