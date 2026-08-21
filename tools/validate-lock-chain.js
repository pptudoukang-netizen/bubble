"use strict";

var fs = require("fs");
var path = require("path");

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var MatchSystem = require("../gameplay-src/systems/MatchSystem");
var GameManager = require("../gameplay-src/core/GameManager");

var ROOT = path.resolve(__dirname, "..");
var LEVEL_KEY = "level_lock_chain_test";
var CONFIG_PATH = path.join(ROOT, "assets/map/config/levels/" + LEVEL_KEY + ".json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectNormalizeFailure(rawConfig, expectedMessage) {
  var failed = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(rawConfig, LEVEL_KEY);
  } catch (error) {
    failed = true;
    assert(
      error && typeof error.message === "string" && error.message.indexOf(expectedMessage) >= 0,
      "Unexpected lock-chain validation error: " + (error && error.message)
    );
  }
  assert(failed, "Expected lock-chain config validation to fail: " + expectedMessage);
}

function createResolution() {
  return {
    collectedKeys: [],
    unlockedLockedBalls: [],
    floating: [],
    spawnedBySplitters: [],
    swirlRotations: []
  };
}

function unlockKey(manager, grid, keyId) {
  var keyCell = grid.getCells().find(function (cell) {
    return cell.id === keyId;
  });
  assert(keyCell && keyCell.entityCategory === "key_ball", "Missing live key: " + keyId + ".");
  var removedKeys = grid.removeCells([keyCell]);
  assert(removedKeys.length === 1 && removedKeys[0].id === keyId, "Active lock-chain key must be removable: " + keyId + ".");
  var resolution = createResolution();
  manager._collectRemovedKeysAndResolveUnlocks(removedKeys, grid, resolution);
  return resolution;
}

function validateConfigContract(rawConfig, normalized) {
  assert(normalized.level.specialEntities.length === 22, "Lock-chain test must contain two keys and twenty locks.");
  [2, 6].forEach(function (row) {
    var rowEntities = normalized.level.specialEntities.filter(function (entity) {
      return entity.row === row;
    });
    assert(rowEntities.filter(function (entity) {
      return entity.entityCategory === "key_ball" && entity.entityType === "key";
    }).length === 1, "Lock-chain row " + row + " must contain exactly one key.");
    assert(rowEntities.filter(function (entity) {
      return entity.entityCategory === "locked_ball" && entity.entityType === "locked";
    }).length === 10, "Lock-chain row " + row + " must contain ten locks.");
    assert(normalized.level.layout[row] === "...........", "Lock-chain row " + row + " must reserve every special slot.");
  });

  var duplicateKey = clone(rawConfig);
  duplicateKey.level.specialEntities = duplicateKey.level.specialEntities.map(function (entity) {
    if (entity.id !== "lower_lock_10") {
      return entity;
    }
    return {
      id: "lower_key_duplicate",
      entityCategory: "key_ball",
      entityType: "key",
      row: 6,
      col: 10
    };
  });
  expectNormalizeFailure(duplicateKey, "must contain exactly one key");

  var ordinaryBallInChain = clone(rawConfig);
  ordinaryBallInChain.level.layout[6] = "R..........";
  expectNormalizeFailure(ordinaryBallInChain, "must be placed on `.` layout slot");

  var missingKey = clone(rawConfig);
  missingKey.level.specialEntities = missingKey.level.specialEntities.filter(function (entity) {
    return entity.id !== "lower_key";
  });
  expectNormalizeFailure(missingKey, "must contain exactly one key");
}

function validateRuntime(normalized) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var grid = new BubbleGrid();
  var viewport = new BoardViewportSystem();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.configureLevel(normalized);
  grid.configureLevel(normalized);
  var matchSystem = new MatchSystem();
  matchSystem.configureLevel(normalized);
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem.configureLevel(normalized);

  assert(grid.getActiveLockChainRow() === 6, "The lowest remaining lock-chain row must be active first.");
  assert(grid.snapshot().activeLockChainRow === 6, "Board snapshot must expose the active lock-chain row.");
  assert(grid.getCell(3, 0).lockChainProtected === true, "Balls above the active lock-chain row must be protected.");
  assert(grid.getCell(7, 0).lockChainProtected === false, "Balls below the active lock-chain row must remain playable.");
  assert(matchSystem.findMatchGroup(grid, grid.getCell(0, 0)).length === 0, "Protected upper balls must not enter ordinary matches.");
  assert(grid.removeCells([grid.getCell(3, 0)]).length === 0, "Protected upper balls must reject elimination removal.");
  assert(grid.removeCells([grid.getCell(6, 0)]).length === 0, "Locked balls must reject direct elimination removal.");
  assert(grid.removeCells([grid.getCell(2, 5)]).length === 0, "A key above the active chain must not be collected early.");

  var lowerResolution = unlockKey(manager, grid, "lower_key");
  assert(lowerResolution.collectedKeys.length === 1, "Lower lock-chain unlock must collect one key.");
  assert(lowerResolution.unlockedLockedBalls.length === 10, "One lower-row key must unlock every other ball in its row.");
  assert(lowerResolution.unlockedLockedBalls.every(function (cell) {
    return cell.row === 6 && cell.__sourceKeyId === "lower_key";
  }), "Every lower-row unlock must reference the lower key.");
  assert(grid.getActiveLockChainRow() === 2, "Unlocking the lower row must advance protection to the next chain row.");
  assert(grid.getCell(3, 0).lockChainProtected === false, "Rows exposed below the next chain must become playable.");
  assert(grid.getCell(0, 0).lockChainProtected === true, "Rows above the remaining upper chain must stay protected.");
  assert(grid.getCell(6, 0).entityCategory === "normal_ball", "Unlocked lower-row balls must become ordinary colored balls.");

  var upperResolution = unlockKey(manager, grid, "upper_key");
  assert(upperResolution.unlockedLockedBalls.length === 10, "One upper-row key must unlock every other ball in its row.");
  assert(upperResolution.unlockedLockedBalls.every(function (cell) {
    return cell.row === 2 && cell.__sourceKeyId === "upper_key";
  }), "Every upper-row unlock must reference the upper key.");
  assert(grid.getActiveLockChainRow() === null, "All lock-chain protection must end after the final row unlocks.");
  assert(grid.getCell(0, 0).lockChainProtected === false, "Final unlock must restore upper balls to playable state.");
  assert(matchSystem.findMatchGroup(grid, grid.getCell(0, 0)).length >= 3, "Final unlock must restore ordinary color matching.");
}

function validatePresentationContract() {
  var boardSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneBoardMethods.js"), "utf8");
  var sharedVisualSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSharedVisualMethods.js"), "utf8");
  var fxSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneFxMethods.js"), "utf8");
  assert(boardSource.indexOf("applyLockChainProtectionTint") >= 0, "Board renderer must tint protected lock-chain cells.");
  assert(sharedVisualSource.indexOf("cc.color(118, 118, 118, 255)") >= 0, "Protected lock-chain cells must use the authored gray tint.");
  assert(fxSource.indexOf("candidates.length < 1") >= 0, "Key unlock animation must accept multiple same-row targets.");
}

var rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
var normalized = LevelConfigLoader.normalizeLevelConfig(clone(rawConfig), LEVEL_KEY);
validateConfigContract(rawConfig, normalized);
validateRuntime(normalized);
validatePresentationContract();
console.log("[OK] lock_chain", "row config, staged protection, gray rendering and same-row mass unlock validated");
