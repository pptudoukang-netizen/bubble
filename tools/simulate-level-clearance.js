"use strict";

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../gameplay-src/config/FairyAssistConfig");
var GameManager = require("../gameplay-src/core/GameManager");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var LEVEL_DIR = path.resolve(__dirname, "../assets/map/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var DEFAULT_ANGLE_STEP_DEG = 2;
var DEFAULT_CANDIDATE_WINDOW = 6;
var DEFAULT_SEARCH_DEPTH = 2;
var FRAME_DT = 0.05;
var MAX_SETTLE_FRAMES = 3000;
var GAME_VIEW_PREFAB_PATH = path.resolve(__dirname, "../assets/game/prefabs/ui/GameView.prefab");

function syncHudBottomLineYForSimulation() {
  if (typeof BoardLayout.boardStartY !== "number" || !isFinite(BoardLayout.boardStartY)) {
    throw new Error("Simulation requires BoardLayout.boardStartY.");
  }
  if (typeof BoardLayout.bubbleRadius !== "number" || !isFinite(BoardLayout.bubbleRadius)) {
    throw new Error("Simulation requires BoardLayout.bubbleRadius.");
  }
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
}

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parsePositiveInteger(value, name) {
  var parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(name + " must be a positive integer.");
  }
  return parsed;
}

function parsePositiveNumber(value, name) {
  var parsed = Number(value);
  if (typeof parsed !== "number" || !isFinite(parsed) || parsed <= 0) {
    throw new Error(name + " must be a positive number.");
  }
  return parsed;
}

function parseArgs(argv) {
  var options = {
    from: 1,
    to: 1000,
    limit: null,
    angleStepDeg: DEFAULT_ANGLE_STEP_DEG,
    seed: 20260709,
    attempts: 1,
    candidateWindow: DEFAULT_CANDIDATE_WINDOW,
    searchDepth: DEFAULT_SEARCH_DEPTH,
    continueOnError: false,
    requirePass: false,
    onlyFailures: false,
    verbose: false
  };

  for (var index = 0; index < argv.length; index += 1) {
    var arg = argv[index];
    if (arg === "--from") {
      index += 1;
      options.from = parsePositiveInteger(argv[index], "--from");
    } else if (arg === "--to") {
      index += 1;
      options.to = parsePositiveInteger(argv[index], "--to");
    } else if (arg === "--limit") {
      index += 1;
      options.limit = parsePositiveInteger(argv[index], "--limit");
    } else if (arg === "--angle-step") {
      index += 1;
      options.angleStepDeg = parsePositiveNumber(argv[index], "--angle-step");
    } else if (arg === "--seed") {
      index += 1;
      options.seed = parsePositiveInteger(argv[index], "--seed");
    } else if (arg === "--attempts") {
      index += 1;
      options.attempts = parsePositiveInteger(argv[index], "--attempts");
    } else if (arg === "--candidate-window") {
      index += 1;
      options.candidateWindow = parsePositiveInteger(argv[index], "--candidate-window");
    } else if (arg === "--search-depth") {
      index += 1;
      options.searchDepth = parsePositiveInteger(argv[index], "--search-depth");
    } else if (arg === "--continue-on-error") {
      options.continueOnError = true;
    } else if (arg === "--require-pass") {
      options.requirePass = true;
    } else if (arg === "--only-failures") {
      options.onlyFailures = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else {
      throw new Error("Unknown argument: " + arg);
    }
  }

  if (options.from > options.to) {
    throw new Error("--from must be <= --to.");
  }
  if (options.candidateWindow < 1) {
    throw new Error("--candidate-window must be >= 1.");
  }
  if (options.searchDepth < 1) {
    throw new Error("--search-depth must be >= 1.");
  }
  return options;
}

function createSeededRandom(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildAttemptSeed(baseSeed, levelId, attemptIndex) {
  var seed = (baseSeed >>> 0) ^ ((levelId * 2654435761) >>> 0) ^ ((attemptIndex + 1) * 2246822519);
  return seed >>> 0;
}

function getLevelNumber(fileName) {
  var match = fileName.match(/level_(\d+)\.json$/);
  if (!match) {
    throw new Error("Invalid level file name: " + fileName);
  }
  return Number(match[1]);
}

function normalizeLevelEntry(sourceName, data) {
  if (!data || typeof data !== "object" || !data.level) {
    throw new Error("Level entry requires level block: " + sourceName);
  }
  if (!Number.isInteger(data.level.levelId)) {
    throw new Error("Level entry requires integer levelId: " + sourceName);
  }
  return {
    sourceName: sourceName,
    levelId: data.level.levelId,
    data: data
  };
}

function listLocalLevelEntries() {
  return fs.readdirSync(LEVEL_DIR)
    .filter(function (fileName) {
      return /^level_\d+\.json$/.test(fileName);
    })
    .sort(function (a, b) {
      return getLevelNumber(a) - getLevelNumber(b);
    })
    .map(function (fileName) {
      return normalizeLevelEntry(fileName, readJson(path.join(LEVEL_DIR, fileName)));
    });
}

function listRemotePackEntries() {
  return fs.readdirSync(REMOTE_PACK_DIR)
    .filter(function (fileName) {
      return /^levels_pack_\d{3,}_\d{3,}\.json$/.test(fileName);
    })
    .sort()
    .reduce(function (entries, fileName) {
      var packPath = path.join(REMOTE_PACK_DIR, fileName);
      var compactPack = readJson(packPath);
      if (!compactPack || compactPack.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V1) {
        throw new Error("Remote pack must use compact schema: " + fileName);
      }
      var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
      if (!expandedPack || !expandedPack.levels || typeof expandedPack.levels !== "object") {
        throw new Error("Expanded remote pack requires levels object: " + fileName);
      }

      Object.keys(expandedPack.levels)
        .sort(function (a, b) {
          return getLevelNumber(a + ".json") - getLevelNumber(b + ".json");
        })
        .forEach(function (levelKey) {
          entries.push(normalizeLevelEntry(fileName + "#" + levelKey, expandedPack.levels[levelKey]));
        });
      return entries;
    }, []);
}

function listLevelEntries(options) {
  var allEntries = listLocalLevelEntries().concat(listRemotePackEntries())
    .filter(function (entry) {
      return entry.levelId >= options.from && entry.levelId <= options.to;
    })
    .sort(function (a, b) {
      return a.levelId - b.levelId;
    });

  if (options.limit !== null) {
    return allEntries.slice(0, options.limit);
  }
  return allEntries;
}

function readGameViewPrefab() {
  return readJson(GAME_VIEW_PREFAB_PATH);
}

function findPrefabGeniusesIndex(prefab) {
  var geniusesIndex = prefab.findIndex(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "geniuses";
  });
  assertCondition(geniusesIndex >= 0, "GameView requires geniuses node.");
  return geniusesIndex;
}

function findPrefabFairySlotNode(prefab, geniusesIndex, slotConfig) {
  var node = prefab.find(function (entry) {
    return entry &&
      entry.__type__ === "cc.Node" &&
      entry._name === slotConfig.nodeName &&
      entry._parent &&
      entry._parent.__id__ === geniusesIndex;
  });
  assertCondition(node, "Missing GameView/geniuses/" + slotConfig.nodeName + ".");
  assertCondition(node._trs && Array.isArray(node._trs.array), "Invalid transform for GameView/geniuses/" + slotConfig.nodeName + ".");
  assertCondition(typeof node._trs.array[0] === "number", "Invalid x for GameView/geniuses/" + slotConfig.nodeName + ".");
  assertCondition(typeof node._trs.array[1] === "number", "Invalid y for GameView/geniuses/" + slotConfig.nodeName + ".");
  return node;
}

function readPrefabFairySlotCenters() {
  var prefab = readGameViewPrefab();
  var geniusesIndex = findPrefabGeniusesIndex(prefab);
  return FairyAssistConfig.slots.map(function (slotConfig) {
    var node = findPrefabFairySlotNode(prefab, geniusesIndex, slotConfig);
    return {
      index: slotConfig.index,
      x: node._trs.array[0],
      y: node._trs.array[1]
    };
  });
}

function syncFairyCollisionCentersForSimulation(manager) {
  if (!manager.systems || !manager.systems.fairyAssistSystem) {
    throw new Error("Simulation requires FairyAssistSystem.");
  }
  manager.systems.fairyAssistSystem.syncCollisionCenters(readPrefabFairySlotCenters());
}

function resolveCellColor(cell) {
  if (!cell) {
    return null;
  }
  if (typeof cell.color === "string" && cell.color) {
    return cell.color;
  }
  if (typeof cell.innerColor === "string" && cell.innerColor) {
    return cell.innerColor;
  }
  if (typeof cell.lockedColor === "string" && cell.lockedColor) {
    return cell.lockedColor;
  }
  return null;
}

function getPrimaryCollectColor(levelConfig) {
  var winConditions = levelConfig.level.winConditions;
  if (!Array.isArray(winConditions)) {
    throw new Error("Level winConditions must be an array.");
  }
  for (var index = 0; index < winConditions.length; index += 1) {
    var condition = winConditions[index];
    if (condition && condition.type === "collect_color") {
      if (typeof condition.color !== "string" || !condition.color) {
        throw new Error("collect_color win condition requires color.");
      }
      return condition.color;
    }
  }
  return null;
}

function hasIceObjective(levelConfig) {
  var winConditions = levelConfig.level.winConditions;
  if (!Array.isArray(winConditions)) {
    throw new Error("Level winConditions must be an array.");
  }
  return winConditions.some(function (condition) {
    return condition && condition.type === "collect_ice_snowball";
  });
}

function hasCellKey(row, col, keys) {
  return keys[row + ":" + col] === true;
}

function findSameColorClusterSize(grid, startCell, color, virtualKeys) {
  return collectSameColorClusterCells(grid, startCell, color, virtualKeys).length;
}

function collectSameColorClusterCells(grid, startCell, color, virtualKeys) {
  var queue = [{
    row: startCell.row,
    col: startCell.col
  }];
  var visited = {};
  var cells = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = current.row + ":" + current.col;
    if (visited[key]) {
      continue;
    }
    visited[key] = true;

    var currentColor = null;
    if (hasCellKey(current.row, current.col, virtualKeys)) {
      currentColor = color;
    } else {
      currentColor = resolveCellColor(grid.getCell(current.row, current.col));
    }
    if (currentColor !== color) {
      continue;
    }

    cells.push({
      row: current.row,
      col: current.col,
      virtual: hasCellKey(current.row, current.col, virtualKeys)
    });
    grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = neighbor.row + ":" + neighbor.col;
      if (!visited[neighborKey]) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col
        });
      }
    });
  }

  return cells;
}

function estimateFloatingAfterMatchedRemoval(grid, matchedCells) {
  if (!Array.isArray(matchedCells) || matchedCells.length < 3) {
    return 0;
  }

  var removedKeys = {};
  matchedCells.forEach(function (cell) {
    if (!cell.virtual) {
      removedKeys[cell.row + ":" + cell.col] = true;
    }
  });

  var remainingCells = grid.getCells().filter(function (cell) {
    return removedKeys[cell.row + ":" + cell.col] !== true;
  });
  if (!remainingCells.length) {
    return 0;
  }

  var remainingKeyMap = {};
  remainingCells.forEach(function (cell) {
    remainingKeyMap[cell.row + ":" + cell.col] = true;
  });

  var visited = {};
  var queue = [];
  remainingCells.forEach(function (cell) {
    if (cell.row < 1 || (cell.entityCategory === "locked_ball" && cell.entityType === "locked")) {
      queue.push({ row: cell.row, col: cell.col });
    }
  });

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = current.row + ":" + current.col;
    if (visited[key]) {
      continue;
    }
    visited[key] = true;
    grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = neighbor.row + ":" + neighbor.col;
      if (!visited[neighborKey] && remainingKeyMap[neighborKey]) {
        queue.push({ row: neighbor.row, col: neighbor.col });
      }
    });
  }

  return remainingCells.reduce(function (count, cell) {
    return visited[cell.row + ":" + cell.col] ? count : count + 1;
  }, 0);
}

function countAdjacentCells(grid, targetCell, predicate) {
  var count = 0;
  grid.getNeighborCoordinates(targetCell.row, targetCell.col).forEach(function (neighbor) {
    var cell = grid.getCell(neighbor.row, neighbor.col);
    if (cell && predicate(cell)) {
      count += 1;
    }
  });
  return count;
}

function getGridRemainingColorCounts(grid) {
  return grid.getCells().reduce(function (counts, cell) {
    var color = resolveCellColor(cell);
    if (color) {
      if (!Object.prototype.hasOwnProperty.call(counts, color)) {
        counts[color] = 0;
      }
      counts[color] += 1;
    }
    return counts;
  }, {});
}

function summarizeGridRows(grid) {
  var cells = grid.getCells();
  var maxRow = cells.reduce(function (max, cell) {
    return Math.max(max, cell.row);
  }, 0);
  var rows = [];
  for (var row = 0; row <= maxRow; row += 1) {
    var columnCount = grid.getColumnCountForRow(row);
    var values = [];
    for (var col = 0; col < columnCount; col += 1) {
      var cell = grid.getCell(row, col);
      values.push(cell ? (resolveCellColor(cell) || "?") : ".");
    }
    rows.push(values.join(""));
  }
  return rows;
}

function scorePlan(manager, plan, firedColor, context) {
  if (!plan || !plan.valid || !plan.targetCell) {
    return null;
  }

  var grid = manager.systems.bubbleGrid;
  var targetCell = plan.targetCell;
  if (!grid.isValidCell(targetCell.row, targetCell.col)) {
    return null;
  }

  var virtualKeys = {};
  virtualKeys[targetCell.row + ":" + targetCell.col] = true;
  var clusterCells = collectSameColorClusterCells(grid, targetCell, firedColor, virtualKeys);
  var clusterSize = clusterCells.length;
  var willMatch = clusterSize >= 3;
  var estimatedFloating = willMatch ? estimateFloatingAfterMatchedRemoval(grid, clusterCells) : 0;
  var estimatedClearedCells = clusterSize - 1 + estimatedFloating;
  var adjacentIce = countAdjacentCells(grid, targetCell, function (cell) {
    return cell.entityCategory === "obstacle_ball" && cell.entityType === "ice";
  });
  var adjacentTargetColor = context.primaryCollectColor
    ? countAdjacentCells(grid, targetCell, function (cell) {
      return resolveCellColor(cell) === context.primaryCollectColor;
    })
    : 0;
  var remainingColorCount = Object.prototype.hasOwnProperty.call(context.remainingColorCounts, firedColor)
    ? context.remainingColorCounts[firedColor]
    : 0;

  var score = 0;
  score += willMatch ? clusterSize * 1000 : clusterSize * 55;
  score += estimatedFloating * 850;
  score += estimatedClearedCells >= grid.getCells().length ? 20000 : 0;
  score += context.primaryCollectColor === firedColor ? clusterSize * 90 : 0;
  score += adjacentTargetColor * 70;
  score += context.hasIceObjective ? adjacentIce * 260 : adjacentIce * 80;
  score += (targetCell.row <= 1 ? 35 : 0);
  score += Math.max(0, 18 - targetCell.row) * 8;
  score += Math.max(0, 3 - plan.wallBounceCount) * 3;
  score += remainingColorCount <= 2 ? 90 : 0;
  score -= plan.totalDistance * 0.01;

  return {
    score: score,
    plan: plan,
    clusterSize: clusterSize,
    willMatch: willMatch,
    estimatedFloating: estimatedFloating,
    adjacentIce: adjacentIce
  };
}

function buildAimPoint(origin, angleDeg) {
  var radians = angleDeg * Math.PI / 180;
  var direction = {
    x: Math.sin(radians),
    y: Math.cos(radians)
  };
  return {
    x: origin.x + direction.x * 1800,
    y: origin.y + direction.y * 1800
  };
}

function chooseAimCandidates(manager, levelConfig, angleStepDeg) {
  var shooter = manager.systems.shooterController.getShooterState();
  if (!shooter.currentBall) {
    throw new Error("Simulator requires current shooter ball.");
  }
  if (typeof shooter.currentBall.color !== "string" || !shooter.currentBall.color) {
    throw new Error("Simulator only supports normal current balls.");
  }

  var origin = shooter.aim.origin;
  var maxAngleDeg = manager.systems.shooterController.maxAimAngleDeg;
  if (typeof maxAngleDeg !== "number" || !isFinite(maxAngleDeg) || maxAngleDeg <= 0) {
    throw new Error("Simulator requires positive maxAimAngleDeg.");
  }

  var context = {
    primaryCollectColor: getPrimaryCollectColor(levelConfig),
    hasIceObjective: hasIceObjective(levelConfig),
    remainingColorCounts: getGridRemainingColorCounts(manager.systems.bubbleGrid)
  };
  var candidates = [];
  var rejectedPlans = {
    missing: 0,
    invalidTarget: 0,
    invalidPlan: 0,
    samples: []
  };

  for (var angle = -maxAngleDeg; angle <= maxAngleDeg + 0.0001; angle += angleStepDeg) {
    var aimPoint = buildAimPoint(origin, angle);
    manager.beginAim(aimPoint);
    manager.setAim(aimPoint);
    var plan = manager.pendingShotPlan ? clone(manager.pendingShotPlan) : null;
    manager.endAim();
    if (!plan) {
      rejectedPlans.missing += 1;
    } else if (!plan.valid || !plan.targetCell) {
      rejectedPlans.invalidPlan += 1;
      if (rejectedPlans.samples.length < 3) {
        rejectedPlans.samples.push({ angle: angle, plan: plan });
      }
    } else if (!manager.systems.bubbleGrid.isValidCell(plan.targetCell.row, plan.targetCell.col)) {
      rejectedPlans.invalidTarget += 1;
      if (rejectedPlans.samples.length < 3) {
        rejectedPlans.samples.push({ angle: angle, targetCell: plan.targetCell, hitType: plan.hitType });
      }
    }
    var candidate = scorePlan(manager, plan, shooter.currentBall.color, context);
    if (!candidate) {
      continue;
    }
    candidate.aimPoint = aimPoint;
    candidate.angleDeg = angle;
    candidates.push(candidate);
  }

  if (!candidates.length) {
    var cells = manager.systems.bubbleGrid.getCells();
    throw new Error("Simulator could not find a valid aim: " + JSON.stringify({
      state: manager.state,
      remainingShots: manager.remainingShots,
      inputLocked: manager.getRuntimeSnapshot().inputLocked,
      boardAdvanceBusy: manager._isBoardAdvanceBusy(),
      pendingSplitterSpawns: manager.pendingSplitterSpawns.length,
      pendingMolotovBlastQueue: manager.pendingMolotovBlastQueue.length,
      activeMolotovBlast: !!manager.activeMolotovBlast,
      currentBall: shooter.currentBall,
      nextBall: shooter.nextBall,
      boardCells: cells.length,
      minRow: cells.reduce(function (min, cell) { return Math.min(min, cell.row); }, Number.POSITIVE_INFINITY),
      maxRow: cells.reduce(function (max, cell) { return Math.max(max, cell.row); }, Number.NEGATIVE_INFINITY),
      rejectedPlans: rejectedPlans,
      boardRows: summarizeGridRows(manager.systems.bubbleGrid),
      boardViewport: manager.systems.boardViewportSystem.snapshot()
    }));
  }
  candidates.sort(function (left, right) {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return Math.abs(left.angleDeg) - Math.abs(right.angleDeg);
  });
  return candidates;
}

function resolveClearedRunningBoard(manager) {
  if (manager.state !== "running") {
    return false;
  }
  var cells = manager.systems.bubbleGrid.getCells();
  if (cells.length > 0) {
    return false;
  }
  if (typeof manager._resolveBoardClearedOutcome !== "function") {
    throw new Error("Simulation requires GameManager._resolveBoardClearedOutcome.");
  }
  manager._resolveBoardClearedOutcome();
  return true;
}

function settleManager(manager) {
  var snapshot = manager.getRuntimeSnapshot();
  var settlementTicks = 0;
  for (var frame = 0; frame < MAX_SETTLE_FRAMES; frame += 1) {
    if (resolveClearedRunningBoard(manager)) {
      snapshot = manager.getRuntimeSnapshot();
      continue;
    }
    if (
      manager.state === "won_settlement_pending" &&
      !manager.systems.fallingMarbleSystem.hasActiveDrops() &&
      !manager._hasPendingSplitterSpawns() &&
      !manager._hasPendingMolotovBlasts()
    ) {
      return snapshot;
    }
    if (
      manager.state === "won" ||
      manager.state === "out_of_shots" ||
      manager.state === "out_of_shots_add_ball_prompt" ||
      manager.state === "lost_danger" ||
      manager.state === "lost_objective"
    ) {
      return snapshot;
    }
    if (manager.state === "won_settlement_pending") {
      if (typeof manager._updatePendingWinSettlement !== "function") {
        throw new Error("Simulation requires GameManager._updatePendingWinSettlement.");
      }
      settlementTicks += 1;
      manager._updatePendingWinSettlement(FRAME_DT);
      snapshot = manager.getRuntimeSnapshot();
      continue;
    }
    if (
      !snapshot.activeProjectile &&
      !snapshot.surplusShotsSettling &&
      !snapshot.inputLocked &&
      !manager._hasPendingSplitterSpawns() &&
      !manager._hasPendingMolotovBlasts() &&
      manager.state !== "won_pending" &&
      manager.state !== "won_settlement_pending" &&
      manager.state !== "out_of_shots_pending"
    ) {
      return snapshot;
    }
    var hasHeldDrops = manager.systems.fallingMarbleSystem.activeDrops.some(function (drop) {
      return drop && drop.holdUntilEliminationPresentationComplete === true;
    });
    if (manager.pendingBoardAdvanceEliminationPresentation === true || hasHeldDrops) {
      var fallingMarbleSystem = manager.systems.fallingMarbleSystem;
      if (!fallingMarbleSystem || typeof fallingMarbleSystem.requestEliminationPresentationDropRelease !== "function") {
        throw new Error("Simulation requires FallingMarbleSystem.requestEliminationPresentationDropRelease.");
      }
      if (typeof fallingMarbleSystem.processPendingEliminationPresentationRelease !== "function") {
        throw new Error("Simulation requires FallingMarbleSystem.processPendingEliminationPresentationRelease.");
      }
      if (typeof manager.notifyBoardAdvanceEliminationPresentationComplete !== "function") {
        throw new Error("Simulation requires GameManager.notifyBoardAdvanceEliminationPresentationComplete.");
      }
      fallingMarbleSystem.requestEliminationPresentationDropRelease();
      if (manager.pendingBoardAdvanceEliminationPresentation === true) {
        manager.notifyBoardAdvanceEliminationPresentationComplete();
      }
      fallingMarbleSystem.processPendingEliminationPresentationRelease(FRAME_DT);
    }
    snapshot = manager.update(FRAME_DT);
    if (snapshot === null) {
      snapshot = manager.getRuntimeSnapshot();
    }
  }
  throw new Error("Simulator exceeded settle frame budget at state " + manager.state + ": " + JSON.stringify({
    activeProjectile: !!snapshot.activeProjectile,
    inputLocked: snapshot.inputLocked,
    surplusShotsSettling: snapshot.surplusShotsSettling,
    boardViewport: snapshot.boardViewport,
    boardCells: snapshot.board ? snapshot.board.cellCount : null,
    remainingShots: snapshot.remainingShots,
    pendingBoardAdvanceSpecialAnimationDelay: manager.pendingBoardAdvanceSpecialAnimationDelay,
    pendingBoardAdvanceDelay: manager.pendingBoardAdvanceDelay,
    pendingBoardAdvanceEliminationPresentation: manager.pendingBoardAdvanceEliminationPresentation,
    pendingSplitterSpawns: manager.pendingSplitterSpawns.length,
    pendingMolotovBlastQueue: manager.pendingMolotovBlastQueue.length,
    activeMolotovBlast: !!manager.activeMolotovBlast,
    activeDrops: manager.systems.fallingMarbleSystem.activeDrops.length,
    dropSamples: manager.systems.fallingMarbleSystem.activeDrops.slice(0, 3).map(function (drop) {
      return {
        id: drop.id,
        active: drop.active,
        inJar: drop.inJar,
        hold: drop.holdUntilEliminationPresentationComplete,
        startDelay: drop.startDelay,
        lifeTime: drop.lifeTime,
        x: drop.position ? Number(drop.position.x.toFixed(2)) : null,
        y: drop.position ? Number(drop.position.y.toFixed(2)) : null,
        vx: drop.velocity ? Number(drop.velocity.x.toFixed(2)) : null,
        vy: drop.velocity ? Number(drop.velocity.y.toFixed(2)) : null
      };
    }),
    deferredDrops: manager.systems.fallingMarbleSystem.deferredDrops.length,
    pendingSurplusShots: manager.systems.fallingMarbleSystem.getPendingSurplusShotCount(),
    pendingWinSettlementDelay: manager.pendingWinSettlementDelay,
    settlementTicks: settlementTicks
  }));
}

function buildCandidateOrder(candidates, shotIndex, choiceOverrides) {
  if (!Array.isArray(choiceOverrides) || shotIndex >= choiceOverrides.length) {
    return {
      order: candidates,
      preferredRank: 0
    };
  }
  var preferredRank = choiceOverrides[shotIndex];
  if (!Number.isInteger(preferredRank) || preferredRank < 0) {
    throw new Error("Choice override rank must be a non-negative integer at shot " + (shotIndex + 1) + ".");
  }
  if (preferredRank >= candidates.length) {
    throw new Error("Choice override rank " + preferredRank + " exceeds candidate count " + candidates.length + " at shot " + (shotIndex + 1) + ".");
  }
  return {
    order: [candidates[preferredRank]].concat(candidates.slice(0, preferredRank), candidates.slice(preferredRank + 1)),
    preferredRank: preferredRank
  };
}

function runSingleAttempt(entry, options, attemptIndex, attemptSeed, choiceOverrides) {
  var manager = new GameManager();
  var levelConfig = clone(entry.data);
  syncHudBottomLineYForSimulation();
  manager.startLevel(levelConfig, {
    runMode: "simulation",
    attemptIndex: 1,
    seed: "simulation-level:" + levelConfig.level.levelId + ":attempt:1"
  });
  manager.systems.boardViewportSystem.finishIntroImmediately();
  syncFairyCollisionCentersForSimulation(manager);
  var snapshot = settleManager(manager);
  var shotLog = [];

  while (manager.state === "running" && (manager.isTimedInfiniteShots || manager.remainingShots > 0)) {
    var candidates;
    try {
      candidates = chooseAimCandidates(manager, levelConfig, options.angleStepDeg);
    } catch (error) {
      error.partialShotLog = shotLog.slice();
      error.partialShotsFired = manager.shotsFired;
      error.partialRemainingShots = manager.remainingShots;
      error.partialRemainingTimeMs = manager.isTimedInfiniteShots ? manager.remainingTimeMs : null;
      error.partialScore = manager.score;
      error.partialBoardCells = manager.systems.bubbleGrid.getCells().length;
      throw error;
    }
    var choice = null;
    var candidateOrder = buildCandidateOrder(candidates, shotLog.length, choiceOverrides);
    var firedRank = candidateOrder.preferredRank;
    for (var candidateIndex = 0; candidateIndex < candidateOrder.order.length; candidateIndex += 1) {
      choice = candidateOrder.order[candidateIndex];
      if (candidateIndex > 0) {
        firedRank = candidates.indexOf(choice);
      }
      manager.beginAim(choice.aimPoint);
      manager.setAim(choice.aimPoint);
      if (manager.pendingShotPlan && manager.pendingShotPlan.valid && manager.pendingShotPlan.targetCell) {
        snapshot = manager.fireShot();
        if (snapshot.activeProjectile) {
          break;
        }
      }
      manager.endAim();
      choice = null;
    }
    if (!snapshot.activeProjectile) {
      throw new Error("Simulator fireShot did not create an active projectile for level " + entry.levelId + ": " + JSON.stringify({
        state: manager.state,
        inputLocked: snapshot.inputLocked,
        remainingShots: manager.remainingShots,
        activeProjectile: !!manager.activeProjectile,
        pendingShotPlanValid: !!(manager.pendingShotPlan && manager.pendingShotPlan.valid),
        pendingShotPlanTarget: manager.pendingShotPlan ? manager.pendingShotPlan.targetCell : null,
        pendingBarrierHammer: manager.pendingBarrierHammer,
        pendingRainbowColorSelection: manager.pendingRainbowColorSelection,
        currentBall: manager.systems.shooterController.getShooterState().currentBall,
        nextBall: manager.systems.shooterController.getShooterState().nextBall,
        boardCells: manager.systems.bubbleGrid.getCells().length
      }));
    }
    snapshot = settleManager(manager);

    var resolution = manager.lastResolution;
    if (!resolution || typeof resolution !== "object") {
      throw new Error("Simulator requires lastResolution after shot.");
    }
    shotLog.push({
      angleDeg: Number(choice.angleDeg.toFixed(2)),
      candidateRank: firedRank,
      score: Number(choice.score.toFixed(2)),
      clusterSize: choice.clusterSize,
      estimatedFloating: choice.estimatedFloating,
      matched: Array.isArray(resolution.matched) ? resolution.matched.length : 0,
      floating: Array.isArray(resolution.floating) ? resolution.floating.length : 0,
      thawed: Array.isArray(resolution.thawed) ? resolution.thawed.length : 0,
      remainingShots: snapshot.remainingShots,
      boardCells: snapshot.board.cellCount,
      state: snapshot.state
    });
  }

  snapshot = settleManager(manager);
  var passed = manager.state === "won" || manager.state === "won_settlement_pending";
  return {
    levelId: entry.levelId,
    code: levelConfig.level.code,
    sourceName: entry.sourceName,
    attempt: attemptIndex + 1,
    seed: attemptSeed,
    choiceOverrides: Array.isArray(choiceOverrides) ? choiceOverrides.slice() : [],
    passed: passed,
    state: manager.state,
    timedLevel: manager.isTimedInfiniteShots,
    shotLimit: manager.isTimedInfiniteShots ? null : levelConfig.level.shotLimit,
    timeLimitMs: manager.isTimedInfiniteShots ? manager.timeLimitMs : null,
    remainingTimeMs: manager.isTimedInfiniteShots ? manager.remainingTimeMs : null,
    shotsFired: manager.shotsFired,
    clearRemainingShots: manager.isTimedInfiniteShots
      ? null
      : Math.max(0, levelConfig.level.shotLimit - manager.shotsFired),
    runtimeRemainingShots: manager.remainingShots,
    score: manager.score,
    boardCells: manager.systems.bubbleGrid.getCells().length,
    log: shotLog
  };
}

function simulateSingleAttempt(entry, options, attemptIndex, choiceOverrides) {
  var attemptSeed = buildAttemptSeed(options.seed, entry.levelId, attemptIndex);
  var previousRandom = Math.random;
  Math.random = createSeededRandom(attemptSeed);
  try {
    return runSingleAttempt(entry, options, attemptIndex, attemptSeed, choiceOverrides);
  } finally {
    Math.random = previousRandom;
  }
}

function compareAttemptResults(left, right) {
  if (left.simulatorError && !right.simulatorError) {
    return -1;
  }
  if (!left.simulatorError && right.simulatorError) {
    return 1;
  }
  if (left.passed !== right.passed) {
    return left.passed ? 1 : -1;
  }
  if (left.passed) {
    var leftRemaining = left.timedLevel ? left.remainingTimeMs : left.clearRemainingShots;
    var rightRemaining = right.timedLevel ? right.remainingTimeMs : right.clearRemainingShots;
    if (leftRemaining !== rightRemaining) {
      return leftRemaining - rightRemaining;
    }
  }
  if (left.score !== right.score) {
    return left.score - right.score;
  }
  if (left.boardCells !== right.boardCells) {
    return right.boardCells - left.boardCells;
  }
  return right.shotsFired - left.shotsFired;
}

function buildChoiceOverrideVariants(candidateWindow, searchDepth) {
  var variants = [];

  function appendPrefixes(prefix, targetDepth) {
    if (prefix.length === targetDepth - 1) {
      for (var rank = 1; rank < candidateWindow; rank += 1) {
        variants.push(prefix.concat([rank]));
      }
      return;
    }
    for (var prefixRank = 0; prefixRank < candidateWindow; prefixRank += 1) {
      appendPrefixes(prefix.concat([prefixRank]), targetDepth);
    }
  }

  for (var depth = 1; depth <= searchDepth; depth += 1) {
    appendPrefixes([], depth);
  }
  return variants;
}

function buildSimulatorErrorResult(entry, attemptIndex, seed, error) {
  var result = {
    levelId: entry.levelId,
    code: entry.data.level.code,
    sourceName: entry.sourceName,
    attempt: attemptIndex + 1,
    seed: seed,
    passed: false,
    simulatorError: true,
    state: "simulator_error",
    timedLevel: entry.data.level.playMode === "timed_infinite_shots",
    shotLimit: entry.data.level.playMode === "timed_infinite_shots" ? null : entry.data.level.shotLimit,
    timeLimitMs: entry.data.level.playMode === "timed_infinite_shots"
      ? entry.data.level.timeLimitSeconds * 1000
      : null,
    remainingTimeMs: Number.isFinite(error.partialRemainingTimeMs) ? error.partialRemainingTimeMs : null,
    shotsFired: 0,
    clearRemainingShots: entry.data.level.playMode === "timed_infinite_shots" ? null : 0,
    runtimeRemainingShots: Number.isInteger(error.partialRemainingShots) ? error.partialRemainingShots : 0,
    score: Number.isFinite(error.partialScore) ? error.partialScore : 0,
    boardCells: Number.isInteger(error.partialBoardCells) ? error.partialBoardCells : 0,
    errorMessage: error && error.message ? error.message : String(error),
    log: Array.isArray(error.partialShotLog) ? error.partialShotLog : []
  };
  if (Number.isInteger(error.partialShotsFired)) {
    result.shotsFired = error.partialShotsFired;
    if (!result.timedLevel) {
      result.clearRemainingShots = Math.max(0, entry.data.level.shotLimit - error.partialShotsFired);
    }
  }
  return result;
}

function simulateLevel(entry, options) {
  var best = null;
  var lastError = null;
  for (var attemptIndex = 0; attemptIndex < options.attempts; attemptIndex += 1) {
    var result = null;
    try {
      result = simulateSingleAttempt(entry, options, attemptIndex, []);
    } catch (error) {
      lastError = error;
      if (!options.continueOnError) {
        throw error;
      }
      result = buildSimulatorErrorResult(entry, attemptIndex, buildAttemptSeed(options.seed, entry.levelId, attemptIndex), error);
    }
    if (!best || compareAttemptResults(result, best) > 0) {
      best = result;
    }
    if (best.passed) {
      return best;
    }
  }

  if (options.candidateWindow > 1) {
    var variants = buildChoiceOverrideVariants(options.candidateWindow, options.searchDepth);
    for (var variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
      for (var branchAttemptIndex = 0; branchAttemptIndex < options.attempts; branchAttemptIndex += 1) {
        var branchResult;
        try {
          branchResult = simulateSingleAttempt(entry, options, branchAttemptIndex, variants[variantIndex]);
        } catch (branchError) {
          lastError = branchError;
          if (!options.continueOnError) {
            continue;
          }
          branchResult = buildSimulatorErrorResult(
            entry,
            branchAttemptIndex,
            buildAttemptSeed(options.seed, entry.levelId, branchAttemptIndex),
            branchError
          );
          branchResult.choiceOverrides = variants[variantIndex].slice();
        }
        if (!best || compareAttemptResults(branchResult, best) > 0) {
          best = branchResult;
        }
        if (best.passed) {
          return best;
        }
      }
    }
  }
  if (best && best.simulatorError && lastError && !options.continueOnError) {
    throw lastError;
  }
  return best;
}

function summarize(results) {
  var passed = results.filter(function (result) {
    return result.passed;
  });
  var failed = results.filter(function (result) {
    return !result.passed;
  });
  var simulatorErrors = results.filter(function (result) {
    return result.simulatorError === true;
  });
  var remainingValues = passed.filter(function (result) {
    return !result.timedLevel;
  }).map(function (result) {
    return result.clearRemainingShots;
  }).sort(function (a, b) {
    return a - b;
  });

  function percentile(ratio) {
    if (!remainingValues.length) {
      return null;
    }
    var index = Math.min(remainingValues.length - 1, Math.floor((remainingValues.length - 1) * ratio));
    return remainingValues[index];
  }

  var averageRemaining = remainingValues.length
    ? remainingValues.reduce(function (sum, value) { return sum + value; }, 0) / remainingValues.length
    : null;

  return {
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    simulatorErrors: simulatorErrors.length,
    passRate: results.length ? passed.length / results.length : 0,
    averageRemaining: averageRemaining,
    minRemaining: percentile(0),
    p25Remaining: percentile(0.25),
    p50Remaining: percentile(0.5),
    p75Remaining: percentile(0.75),
    failedLevels: failed.slice(0, 20).map(function (result) {
      return {
        levelId: result.levelId,
        state: result.state,
        simulatorError: result.simulatorError === true,
        shotsFired: result.shotsFired,
        clearRemainingShots: result.clearRemainingShots,
        runtimeRemainingShots: result.runtimeRemainingShots,
        boardCells: result.boardCells,
        errorMessage: result.errorMessage
      };
    })
  };
}

function formatPercent(value) {
  return (value * 100).toFixed(2) + "%";
}

function printResult(result, verbose) {
  var status = result.simulatorError ? "SIM_ERROR" : (result.passed ? "PASS" : "FAIL");
  var supplyText = result.timedLevel
    ? "time=" + Math.ceil(result.remainingTimeMs / 1000) + "s/" + Math.ceil(result.timeLimitMs / 1000) + "s"
    : "shots=" + result.shotsFired + "/" + result.shotLimit;
  console.log(
    "[" + status + "]",
    "L" + String(result.levelId).padStart(3, "0"),
    result.code,
    "attempt=" + result.attempt,
    "seed=" + result.seed,
    "state=" + result.state,
    supplyText,
    "clearRemaining=" + result.clearRemainingShots,
    "runtimeRemaining=" + result.runtimeRemainingShots,
    "score=" + result.score,
    "boardCells=" + result.boardCells
  );
  if (result.simulatorError) {
    console.log("  error=" + result.errorMessage);
  }

  if (verbose) {
    result.log.forEach(function (entry, index) {
      console.log(
        "  #" + String(index + 1).padStart(2, "0"),
        "angle=" + entry.angleDeg,
        "rank=" + entry.candidateRank,
        "cluster=" + entry.clusterSize,
        "estimatedFloating=" + entry.estimatedFloating,
        "matched=" + entry.matched,
        "floating=" + entry.floating,
        "thawed=" + entry.thawed,
        "remaining=" + entry.remainingShots,
        "cells=" + entry.boardCells,
        "state=" + entry.state
      );
    });
  }
}

function main() {
  var options = parseArgs(process.argv.slice(2));
  var entries = listLevelEntries(options);
  if (!entries.length) {
    throw new Error("No levels selected for simulation.");
  }

  console.log(
    "Simulating",
    entries.length,
    "levels with greedy real-logic bot",
    "angleStep=" + options.angleStepDeg + "deg",
    "candidateWindow=" + options.candidateWindow,
    "searchDepth=" + options.searchDepth
  );

  var results = entries.map(function (entry) {
    var result = simulateLevel(entry, options);
    if (!options.onlyFailures || !result.passed) {
      printResult(result, options.verbose);
    }
    return result;
  });
  var summary = summarize(results);

  console.log("\nSummary");
  console.log("levels:", summary.total);
  console.log("passed:", summary.passed);
  console.log("failed:", summary.failed);
  console.log("simulatorErrors:", summary.simulatorErrors);
  console.log("passRate:", formatPercent(summary.passRate));
  console.log("averageRemaining:", summary.averageRemaining === null ? "n/a" : summary.averageRemaining.toFixed(2));
  console.log("remaining[min/p25/p50/p75]:", [
    summary.minRemaining,
    summary.p25Remaining,
    summary.p50Remaining,
    summary.p75Remaining
  ].map(function (value) {
    return value === null ? "n/a" : String(value);
  }).join("/"));
  if (summary.failedLevels.length) {
    console.log("failedLevels(first20):", JSON.stringify(summary.failedLevels));
  }

  if (options.requirePass && summary.failed > 0) {
    process.exit(1);
  }
}

main();
