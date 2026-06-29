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
var StarRatingPolicy = require("../assets/scripts/core/StarRatingPolicy");
var TrajectoryPredictor = require("../assets/scripts/systems/TrajectoryPredictor");
var BoardViewportSystem = require("../assets/scripts/systems/BoardViewportSystem");

function syncHudBottomLineYForValidation() {
  if (typeof BoardLayout.boardStartY !== "number" || !isFinite(BoardLayout.boardStartY)) {
    throw new Error("Validation requires BoardLayout.boardStartY.");
  }
  if (typeof BoardLayout.bubbleRadius !== "number" || !isFinite(BoardLayout.bubbleRadius)) {
    throw new Error("Validation requires BoardLayout.bubbleRadius.");
  }
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
}

function createGridWithViewport(levelConfig) {
  syncHudBottomLineYForValidation();
  var grid = new BubbleGrid();
  var viewport = new BoardViewportSystem();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.configureLevel(levelConfig);
  grid.configureLevel(levelConfig);
  return grid;
}

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
  var grid = createGridWithViewport(levelConfig);
  var predictor = new TrajectoryPredictor();

  predictor.initialize({});
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
  var settlePlanned = false;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;

  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  try {
    manager.shotsFired = 1;
    manager.state = "running";
    manager._tryTopAnchorCollapse = function () {
      return false;
    };
    manager.lastResolution = {
      impact: {
        seq: 1,
        center: { x: 0, y: 0 },
        neighbors: [{ id: "n1", row: 1, col: 1, x: 0, y: 0 }],
        pushDistance: 10,
        bounceSpeed: 100
      },
      collectedKeys: [
        { id: "key_1", row: 1, col: 1 }
      ],
      unlockedLockedBalls: [
        { id: "locked_1", row: 1, col: 2, __sourceKeyId: "key_1" }
      ],
      boardViewportAdjusted: false
    };
    manager.systems.boardViewportSystem = {
      introActive: false,
      isMoving: function () {
        return settlePlanned;
      },
      planSettle: function () {
        settlePlanned = true;
        return true;
      }
    };
    manager.systems.bubbleGrid = {
      snapshot: function () {
        return { cells: [{ row: 1, col: 1 }] };
      }
    };

    if (!manager._applyPostImpactBoardShiftPolicy(manager.lastResolution)) {
      throw new Error("Post-impact board shift regression expected deferred viewport settle.");
    }

    var combinedDelay = manager.pendingBoardAdvanceSpecialAnimationDelay;
    if (combinedDelay <= 0) {
      throw new Error("Post-impact regression expected positive special animation delay.");
    }
    if (manager._updatePendingBoardAdvance(combinedDelay - 0.001)) {
      throw new Error("Viewport settle started before post-impact animation delay finished.");
    }
    if (!manager._updatePendingBoardAdvance(0.001)) {
      throw new Error("Viewport settle did not start after post-impact animation delay.");
    }
    if (!settlePlanned || manager.lastResolution.boardViewportAdjusted !== true) {
      throw new Error("Viewport settle regression did not mark boardViewportAdjusted.");
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
  var settlePlanned = false;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;

  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  try {
    manager.shotsFired = 1;
    manager.state = "running";
    manager._tryTopAnchorCollapse = function () {
      return false;
    };
    manager.lastResolution = {
      collectedKeys: [],
      unlockedLockedBalls: [],
      impact: {
        seq: 1,
        center: { x: 0, y: 0 },
        neighbors: [{ id: "n1", row: 1, col: 1, x: 0, y: 0 }],
        pushDistance: SpecialAnimationTiming.impactBounce.defaultPushDistance,
        bounceSpeed: BoardLayout.impactBounceSpeed
      },
      boardViewportAdjusted: false
    };
    manager.systems.boardViewportSystem = {
      introActive: false,
      isMoving: function () {
        return settlePlanned;
      },
      planSettle: function () {
        settlePlanned = true;
        return true;
      }
    };
    manager.systems.bubbleGrid = {
      snapshot: function () {
        return { cells: [{ row: 1, col: 1 }] };
      }
    };

    if (!manager._applyPostImpactBoardShiftPolicy(manager.lastResolution)) {
      throw new Error("Impact post-shift regression expected deferred viewport settle.");
    }

    var impactDelay = manager.pendingBoardAdvanceSpecialAnimationDelay;
    if (impactDelay <= 0.2) {
      throw new Error("Impact viewport settle delay must cover bounce animation.");
    }
    if (manager._updatePendingBoardAdvance(impactDelay - 0.001)) {
      throw new Error("Viewport settle started before impact bounce animation finished.");
    }
    if (!manager._updatePendingBoardAdvance(0.001)) {
      throw new Error("Viewport settle did not start after impact bounce animation finished.");
    }
    if (!settlePlanned || manager.lastResolution.boardViewportAdjusted !== true) {
      throw new Error("Impact viewport settle regression did not mark boardViewportAdjusted.");
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
  var settlePlanned = false;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;

  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  try {
    manager.shotsFired = 1;
    manager.state = "running";
    manager._tryTopAnchorCollapse = function () {
      return false;
    };
    manager.boardAdvanceUpdateSerial = 3;
    manager.lastResolution = {
      collectedKeys: [],
      unlockedLockedBalls: [],
      impact: {
        seq: 1,
        center: { x: 0, y: 0 },
        neighbors: [{ id: "n1", row: 1, col: 1, x: 0, y: 0 }],
        pushDistance: SpecialAnimationTiming.impactBounce.defaultPushDistance,
        bounceSpeed: BoardLayout.impactBounceSpeed
      },
      boardViewportAdjusted: false
    };
    manager.systems.boardViewportSystem = {
      introActive: false,
      isMoving: function () {
        return settlePlanned;
      },
      planSettle: function () {
        settlePlanned = true;
        return true;
      }
    };
    manager.systems.bubbleGrid = {
      snapshot: function () {
        return { cells: [{ row: 1, col: 1 }] };
      }
    };

    if (!manager._applyPostImpactBoardShiftPolicy(manager.lastResolution)) {
      throw new Error("Impact same-frame regression expected deferred viewport settle.");
    }
    manager.pendingBoardAdvanceScheduledUpdateSerial = manager.boardAdvanceUpdateSerial;
    if (manager._updatePendingBoardAdvance(999)) {
      throw new Error("Viewport settle started in the scheduling update frame.");
    }
    manager.boardAdvanceUpdateSerial = 4;
    if (!manager._updatePendingBoardAdvance(999)) {
      throw new Error("Viewport settle did not start on the next update frame.");
    }
    if (!settlePlanned || manager.lastResolution.boardViewportAdjusted !== true) {
      throw new Error("Impact same-frame viewport settle regression failed.");
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
  var grid = createGridWithViewport(levelConfig);
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
  var grid = createGridWithViewport(levelConfig);
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
  var grid = createGridWithViewport(levelConfig);
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
  var grid = createGridWithViewport(levelConfig);
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
  var support = require("../assets/scripts/systems/SupportSystem");
  var supportSystem = new support();
  var falling = require("../assets/scripts/systems/FallingMarbleSystem");
  var fallingMarbleSystem = new falling();
  var fairyAssistSystem = manager.systems.fairyAssistSystem;
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

  var grid = createGridWithViewport(levelConfig);
  supportSystem.configureLevel(levelConfig);
  matchSystem.configureLevel(levelConfig);
  fairyAssistSystem.configureLevel(levelConfig);
  fallingMarbleSystem.attachFairyAssistSystem(fairyAssistSystem);
  fallingMarbleSystem.configureLevel(levelConfig);
  jarCollectorSystem.configureLevel(levelConfig);

  manager.systems = {
    bubbleGrid: grid,
    supportSystem: supportSystem,
    matchSystem: matchSystem,
    fairyAssistSystem: fairyAssistSystem,
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

function runCollectionRewardDoesNotClearRemainingBoardCase() {
  var manager = new GameManager();
  manager.currentLevel = {
    level: {
      bonusObjectives: [],
      winConditions: [
        { type: "collect_any", value: 2 }
      ]
    }
  };
  manager.requiredStarCount = 1;
  manager.scoreHeatBand = {
    min: 100,
    target: 200,
    max: 300
  };
  manager.score = 150;
  manager.remainingShots = 3;
  manager.state = "running";
  manager.lastResolution = {
    matched: [],
    floating: [],
    collected: []
  };

  var boardCells = [
    { id: "board_r1", row: 1, col: 1, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "board_r2", row: 2, col: 2, color: "B", entityCategory: "normal_ball", entityType: null }
  ];
  manager.systems = {
    bubbleGrid: {
      getCells: function () {
        return boardCells.slice();
      },
      removeCells: function (cells) {
        boardCells = [];
        return cells.slice();
      }
    },
    fallingMarbleSystem: {
      hasActiveDrops: function () {
        return false;
      },
      registerDrops: function (cells, grid, options) {
        throw new Error("Collection reward completion must not register victory board drops.");
      }
    },
    jarCollectorSystem: {
      jarColors: ["R", "B"],
      collectedByColor: { R: 2, B: 0 },
      collectedTotal: 2,
      objectiveTarget: 2,
      lastCollected: [],
      snapshot: function () {
        return {
          collectedTotal: 2,
          collectedByColor: { R: 2, B: 0 }
        };
      }
    }
  };
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";

  manager._resolveOutOfShotsOutcome();

  if (manager.state !== "out_of_shots") {
    throw new Error("Completed collection reward must not pass with remaining board cells.");
  }
  if (boardCells.length !== 2) {
    throw new Error("Completed collection reward must leave remaining board cells unchanged.");
  }
}

function runClearWinRequiresStarAndEmptyBoardCase() {
  var manager = new GameManager();
  manager.currentLevel = {
    level: {
      bonusObjectives: [
        { type: "collect_ice_snowball", value: 2 }
      ],
      winConditions: [
        { type: "collect_any", value: 3 }
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
  var boardCells = [];
  manager.systems.bubbleGrid = {
    getCells: function () {
      return boardCells.slice();
    }
  };
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  manager.iceCollectedTotal = 2;
  manager.score = 99;

  if (manager._isClearWinCompleted()) {
    throw new Error("Clear win must require at least one star.");
  }

  manager.score = 100;
  manager.iceCollectedTotal = 1;
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  if (!manager._isClearWinCompleted()) {
    throw new Error("Clear win must ignore incomplete collection reward targets.");
  }
  if (manager._areCollectionRewardObjectivesCompleted()) {
    throw new Error("Collection reward completion must still require every collection target.");
  }

  boardCells = [{ id: "remaining", row: 0, col: 0, color: "R" }];
  if (manager._isClearWinCompleted()) {
    throw new Error("Clear win must require an empty board.");
  }

  boardCells = [];
  manager.iceCollectedTotal = 2;
  manager.cachedJarSnapshot = null;
  manager.cachedJarSnapshotKey = "";
  if (!manager._isClearWinCompleted()) {
    throw new Error("Clear win should pass after one star with an empty board.");
  }
  if (!manager._areCollectionRewardObjectivesCompleted()) {
    throw new Error("Collection reward should complete after every collection target is complete.");
  }
}

function runOneStarTargetScoreCase() {
  var oneStarTargetScore = StarRatingPolicy.resolveOneStarTargetScore({
    level: {
      targetScore: 2580
    }
  });
  if (oneStarTargetScore !== 774) {
    throw new Error("One-star target score must use the runtime star threshold policy.");
  }
}

function runReviveDangerSpaceKeepsLockedBallCase() {
  var grid = createGridWithViewport({
    coordinateSystem: "odd-r-hex",
    level: {
      initialDropSpaceRows: 8,
      layout: [
        "RRRRRRRRRR",
        "RRRRRRRRRR",
        "RRRRRRRRRR",
        "RRRRRRRRRR",
        "RRRRRRRRRR",
        "RRRRRRRRRR",
        "RRRRRRRRRR"
      ],
      specialEntities: []
    }
  });
  var shiftRoomRows = 2;
  var maxOffsetY = grid.boardViewport.getMaxOffsetY();
  grid.boardViewport.offsetY = maxOffsetY - shiftRoomRows * BoardLayout.rowHeight;
  grid.boardViewport.targetOffsetY = grid.boardViewport.offsetY;
  var beforeOffsetY = grid.getViewportOffsetY();
  grid.boardViewport.shiftOffsetYByRows(-shiftRoomRows);
  if (grid.getViewportOffsetY() !== beforeOffsetY) {
    throw new Error("Ad revive viewport shift must not directly set BubbleGrid cell coordinates.");
  }
  if (!grid.boardViewport.isMoving()) {
    throw new Error("Ad revive viewport shift must start animated movement.");
  }
  if (Math.abs(grid.boardViewport.targetOffsetY - beforeOffsetY - 2 * BoardLayout.rowHeight) > 0.5) {
    throw new Error("Ad revive viewport shift must target the requested row offset.");
  }
  grid.boardViewport.update(grid.boardViewport.moveDurationSec / 2);
  if (Math.abs(grid.getViewportOffsetY() - (beforeOffsetY + BoardLayout.rowHeight)) > 0.5) {
    throw new Error("Ad revive viewport shift must move linearly at half duration.");
  }
  grid.boardViewport.update(grid.boardViewport.moveDurationSec - grid.boardViewport.moveElapsedSec);
  if (Math.abs(grid.getViewportOffsetY() - (beforeOffsetY + 2 * BoardLayout.rowHeight)) > 0.5) {
    throw new Error("Ad revive viewport shift must reach the target through update.");
  }
}

function runBoardIntroViewportCase() {
  var BoardViewportConfig = require("../assets/scripts/config/BoardViewportConfig");
  var BoardViewportSystem = require("../assets/scripts/systems/BoardViewportSystem");

  syncHudBottomLineYForValidation();

  function buildRowCells(topRow, bottomRow) {
    var cells = [];
    for (var row = topRow; row <= bottomRow; row += 1) {
      cells.push({ row: row, col: 0 });
    }
    return cells;
  }

  function planIntro(cells) {
    var viewport = new BoardViewportSystem();
    return viewport.planIntroPosition(cells);
  }

  function assertTopRowAlignedToHud(cells, offsetY) {
    var topRow = cells.reduce(function (min, cell) {
      return Math.min(min, cell.row);
    }, cells[0].row);
    var topEdgeY = BoardLayout.boardStartY - topRow * BoardLayout.rowHeight + offsetY + BoardLayout.bubbleRadius;
    if (Math.abs(topEdgeY - BoardLayout.getHudBottomLineY()) > 0.5) {
      throw new Error("Top row must align to HUD bottom edge, got topEdgeY=" + topEdgeY + ".");
    }
  }

  function assertBottomRowAlignedToHudSlot(cells, offsetY, slotNumber) {
    var bottomRow = cells.reduce(function (max, cell) {
      return Math.max(max, cell.row);
    }, cells[0].row);
    var bottomCenterY = BoardLayout.boardStartY - bottomRow * BoardLayout.rowHeight + offsetY;
    var expectedCenterY = BoardLayout.getHudBottomLineY() - BoardLayout.bubbleRadius - (slotNumber - 1) * BoardLayout.rowHeight;
    if (Math.abs(bottomCenterY - expectedCenterY) > 0.5) {
      throw new Error("Bottom row must align to HUD slot " + slotNumber + ", got centerY=" + bottomCenterY + ".");
    }
  }

  var threeRowCells = buildRowCells(0, 2);
  var threeIntro = planIntro(threeRowCells);
  if (threeIntro.needsScroll) {
    throw new Error("3-row board intro must not scroll.");
  }
  assertTopRowAlignedToHud(threeRowCells, threeIntro.targetOffsetY);
  if (BoardViewportSystem.countVisibleOccupiedRows(threeRowCells, threeIntro.targetOffsetY) !== 3) {
    throw new Error("3-row board intro must show all 3 rows in viewport.");
  }

  var tenRowCells = buildRowCells(0, 9);
  var tenIntro = planIntro(tenRowCells);
  if (tenIntro.needsScroll) {
    throw new Error("10-row board intro must not scroll.");
  }
  assertTopRowAlignedToHud(tenRowCells, tenIntro.targetOffsetY);
  if (BoardViewportSystem.countVisibleOccupiedRows(tenRowCells, tenIntro.targetOffsetY) !== 10) {
    throw new Error("10-row board intro must show all 10 rows below HUD.");
  }

  var elevenRowCells = buildRowCells(0, 10);
  var elevenIntro = planIntro(elevenRowCells);
  if (!elevenIntro.needsScroll) {
    throw new Error("11-row board intro must scroll upward.");
  }
  assertTopRowAlignedToHud(elevenRowCells, elevenIntro.startOffsetY);
  assertBottomRowAlignedToHudSlot(elevenRowCells, elevenIntro.targetOffsetY, BoardViewportConfig.targetVisibleRows);
  if (Math.abs(elevenIntro.targetOffsetY - elevenIntro.startOffsetY - BoardLayout.rowHeight) > 0.5) {
    throw new Error("11-row board intro must move upward exactly one row.");
  }

  var sevenRowCells = buildRowCells(0, 6);
  var sevenIntro = planIntro(sevenRowCells);
  if (sevenIntro.needsScroll) {
    throw new Error("7-row board intro must not scroll.");
  }
  assertTopRowAlignedToHud(sevenRowCells, sevenIntro.targetOffsetY);
  if (BoardViewportSystem.countVisibleOccupiedRows(sevenRowCells, sevenIntro.targetOffsetY) !== 7) {
    throw new Error("7-row board intro must show all 7 rows in viewport.");
  }

  var twentyRowCells = buildRowCells(0, 19);
  var twentyIntro = planIntro(twentyRowCells);
  if (!twentyIntro.needsScroll) {
    throw new Error("20-row board intro must scroll upward.");
  }
  assertTopRowAlignedToHud(twentyRowCells, twentyIntro.startOffsetY);
  assertBottomRowAlignedToHudSlot(twentyRowCells, twentyIntro.targetOffsetY, BoardViewportConfig.targetVisibleRows);
  if (BoardViewportSystem.countVisibleOccupiedRows(twentyRowCells, twentyIntro.targetOffsetY) !== BoardViewportConfig.targetVisibleRows) {
    throw new Error("20-row board intro must end with exactly 10 visible rows.");
  }
  if (twentyIntro.targetOffsetY <= twentyIntro.startOffsetY) {
    throw new Error("20-row board intro target offset must be above start offset.");
  }
}

function runBoardMidGameViewportSettleCase() {
  var BoardViewportConfig = require("../assets/scripts/config/BoardViewportConfig");
  var BoardViewportSystem = require("../assets/scripts/systems/BoardViewportSystem");

  syncHudBottomLineYForValidation();

  function buildRowCells(topRow, bottomRow) {
    var cells = [];
    for (var row = topRow; row <= bottomRow; row += 1) {
      cells.push({ row: row, col: 0 });
    }
    return cells;
  }

  var viewport = new BoardViewportSystem();
  var tenRowCells = buildRowCells(0, 9);
  var tenRowIntro = viewport.planIntroPosition(tenRowCells);
  if (tenRowIntro.needsScroll) {
    throw new Error("10-row mid-game settle setup must not intro-scroll.");
  }
  viewport.offsetY = tenRowIntro.targetOffsetY;
  viewport.targetOffsetY = tenRowIntro.targetOffsetY;
  viewport.introActive = false;
  viewport.phase = "idle";

  viewport.planSettle({ cells: tenRowCells });
  if (viewport.isMoving()) {
    throw new Error("Post-resolution board with final 10 rows must not move after a temporary 11th-row attachment is cleared.");
  }

  var elevenRowCells = buildRowCells(0, 10);
  if (BoardViewportSystem.countVisibleOccupiedRows(elevenRowCells, viewport.offsetY) !== 11) {
    throw new Error("11-row board must show 11 rows before mid-game settle.");
  }

  viewport.planSettle({ cells: elevenRowCells });
  if (!viewport.isMoving()) {
    throw new Error("11-row mid-game settle must trigger viewport movement.");
  }
  if (Math.abs(viewport.targetOffsetY - viewport.offsetY - BoardLayout.rowHeight) > 0.5) {
    throw new Error("11-row mid-game settle must scroll upward exactly one row.");
  }
  if (BoardViewportSystem.countVisibleOccupiedRows(elevenRowCells, viewport.targetOffsetY) !== BoardViewportConfig.targetVisibleRows) {
    throw new Error("11-row mid-game settle must cap visible rows to targetVisibleRows.");
  }
  if (viewport.getMaxOffsetY() < viewport.targetOffsetY) {
    throw new Error("11-row mid-game settle must refresh maxOffsetY for expanded board span.");
  }

  var moveStartOffsetY = viewport.offsetY;
  var moveTargetOffsetY = viewport.targetOffsetY;
  viewport.update(viewport.moveDurationSec / 2);
  var expectedHalfOffsetY = (moveStartOffsetY + moveTargetOffsetY) / 2;
  if (Math.abs(viewport.offsetY - expectedHalfOffsetY) > 0.5) {
    throw new Error("Mid-game board movement must remain linear at half duration.");
  }
  viewport.update(viewport.moveDurationSec - viewport.moveElapsedSec);

  var thirteenRowCells = buildRowCells(0, 12);
  viewport.planSettle({ cells: thirteenRowCells });
  viewport.update(viewport.moveDurationSec);
  var thirteenRowOffsetY = viewport.offsetY;
  viewport.planSettle({ cells: elevenRowCells });
  if (!viewport.isMoving() || viewport.targetOffsetY >= thirteenRowOffsetY) {
    throw new Error("Row reduction above 10 rows must move the board downward.");
  }
  viewport.update(viewport.moveDurationSec);

  var nineRowCells = buildRowCells(0, 8);
  viewport.planSettle({ cells: nineRowCells });
  if (!viewport.isMoving() || viewport.targetOffsetY >= viewport.offsetY) {
    throw new Error("Board reduced below 10 rows must return its top row to the HUD edge.");
  }
  viewport.update(viewport.moveDurationSec);
  var nineRowOffsetY = viewport.offsetY;
  viewport.planSettle({ cells: buildRowCells(0, 7) });
  if (viewport.isMoving() || Math.abs(viewport.offsetY - nineRowOffsetY) > 0.5) {
    throw new Error("Board already below 10 rows with top at HUD must not move after another bottom-row reduction.");
  }
}

function runBoardViewportFireLockCase() {
  var manager = new GameManager();
  manager.state = "running";
  manager.shotsFired = 3;
  manager.systems.boardViewportSystem.phase = "settling";
  manager.getRuntimeSnapshot = function () {
    return { inputLocked: true };
  };

  var snapshot = manager.fireShot();
  if (manager.shotsFired !== 3 || !snapshot.inputLocked) {
    throw new Error("Board viewport movement must lock firing until movement completes.");
  }
}

function runBoardViewportRenderRefreshCase() {
  var levelRendererSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/render/LevelRenderer.js"),
    "utf8"
  );
  var levelRendererSceneSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/render/LevelRendererSceneMethods.js"),
    "utf8"
  );
  if (levelRendererSource.indexOf("lastBoardViewportOffsetY") < 0) {
    throw new Error("LevelRenderer must cache the last rendered board viewport offset.");
  }
  if (levelRendererSource.indexOf("boardViewportOffsetY !== this.lastBoardViewportOffsetY") < 0) {
    throw new Error("LevelRenderer must refresh board rendering when viewportOffsetY changes.");
  }
  if (levelRendererSceneSource.indexOf("this.lastBoardViewportOffsetY = boardSnapshot.viewportOffsetY") < 0) {
    throw new Error("Board render must record the rendered viewportOffsetY.");
  }
  if (levelRendererSceneSource.indexOf("Number.isInteger(boardSnapshot.viewportOffsetY)") >= 0) {
    throw new Error("Board viewport render paths must accept fractional viewportOffsetY during linear movement.");
  }
  var gameManagerSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/core/GameManager.js"),
    "utf8"
  );
  if (gameManagerSource.indexOf("var viewportWasMoving = this.systems.boardViewportSystem.isMoving()") < 0) {
    throw new Error("GameManager.update must detect in-progress board viewport movement before update.");
  }
  if (gameManagerSource.indexOf("viewportUpdated ||") < 0) {
    throw new Error("GameManager.update must return render snapshots while board viewport is moving.");
  }
}

function runBoardViewportSnapshotCacheCase() {
  var manager = new GameManager();
  var viewportOffsetY = 0;
  var snapshotCalls = 0;
  manager.systems.bubbleGrid = {
    version: 1,
    getViewportOffsetY: function () {
      return viewportOffsetY;
    },
    snapshot: function () {
      snapshotCalls += 1;
      return {
        version: this.version,
        viewportOffsetY: viewportOffsetY,
        snapshotCall: snapshotCalls
      };
    }
  };

  var firstSnapshot = manager._getCachedBoardSnapshot();
  var secondSnapshot = manager._getCachedBoardSnapshot();
  if (firstSnapshot !== secondSnapshot || snapshotCalls !== 1) {
    throw new Error("Board snapshot cache must reuse identical version and viewportOffsetY.");
  }

  viewportOffsetY = 12.5;
  var movedSnapshot = manager._getCachedBoardSnapshot();
  if (movedSnapshot === firstSnapshot || movedSnapshot.viewportOffsetY !== 12.5 || snapshotCalls !== 2) {
    throw new Error("Board snapshot cache must refresh when viewportOffsetY changes.");
  }
}

function runBoardViewportEntryUpdateCase() {
  var gameplaySource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrapGameplayInputMethods.js"),
    "utf8"
  );
  if (gameplaySource.indexOf("this.gameManager.updateBoardViewportIntro(dt)") < 0) {
    throw new Error("Level entry update must advance board viewport intro while isRestarting.");
  }
  if (gameplaySource.indexOf("this.levelRenderer.refreshRuntime(this.currentLevelConfig, entrySnapshot)") < 0) {
    throw new Error("Level entry update must refresh rendering for board viewport intro snapshots.");
  }
}

function runStoneBallJarScoreZeroCase() {
  var methods = require("../assets/scripts/core/GameManagerShotResolutionMethods");
  var GameManagerCtor = require("../assets/scripts/core/GameManager");
  var JarCollectorSystem = require("../assets/scripts/systems/JarCollectorSystem");
  var manager = new GameManagerCtor();
  manager.score = 500;
  manager.lastResolution = { scoreDelta: 0 };
  manager.systems = {
    jarCollectorSystem: new JarCollectorSystem()
  };
  manager.systems.jarCollectorSystem.jarCount = 1;
  manager.systems.jarCollectorSystem.jarColors = ["R"];
  manager._getScoreRule = function (key) {
    if (key === "jarCollectBase") {
      return 60;
    }
    return 0;
  };
  manager._pushRuntimeEvent = function () {};

  var gained = manager._applyJarCollectionScore([
    {
      id: "stone_drop_1",
      entityCategory: "obstacle_ball",
      entityType: "stone",
      jarIndex: 0,
      bonusMultiplier: 1,
      fairyMultiplier: 1
    }
  ]);
  if (gained !== 0) {
    throw new Error("Stone ball jar collection must score 0 points.");
  }
  if (manager.score !== 500) {
    throw new Error("Stone ball jar collection must not change total score.");
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
  runCollectionRewardDoesNotClearRemainingBoardCase();
  console.log("[OK]", "collection_reward_does_not_clear_board", "keeps remaining board cells and does not pass");
  runClearWinRequiresStarAndEmptyBoardCase();
  console.log("[OK]", "clear_win_requires_star_and_empty_board", "ignores collection targets for pass and requires an empty board");
  runOneStarTargetScoreCase();
  console.log("[OK]", "one_star_target_score", "uses the same one-star threshold policy as runtime scoring");
  runReviveDangerSpaceKeepsLockedBallCase();
  console.log("[OK]", "revive_danger_space_keeps_locked_ball", "shifted board up without removing unsupported locked ball");
  runStoneBallJarScoreZeroCase();
  console.log("[OK]", "stone_ball_jar_score_zero", "stone ball in jar scores 0 and keeps total score");
  runBoardIntroViewportCase();
  runBoardMidGameViewportSettleCase();
  runBoardViewportFireLockCase();
  runBoardViewportRenderRefreshCase();
  runBoardViewportSnapshotCacheCase();
  runBoardViewportEntryUpdateCase();
  console.log("[OK]", "board_viewport", "10-row intro/runtime alignment, final-row settle, render refresh, snapshot cache, entry update, linear movement, and fire lock passed");

  if (failed) {
    console.log("\nShot regression validation failed.");
    process.exit(1);
  }

  console.log("\nShot regression validation passed for", results.length, "levels.");
}

main();
