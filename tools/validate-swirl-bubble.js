"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");
var GameManager = require("../gameplay-src/core/GameManager");
var FairyAssistConfig = require("../gameplay-src/config/FairyAssistConfig");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var attachLevelRendererSceneBoardMethods = require("../gameplay-src/render/LevelRendererSceneBoardMethods");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function replaceCharacter(text, index, value) {
  if (typeof text !== "string" || !Number.isInteger(index) || index < 0 || index >= text.length) {
    throw new Error("replaceCharacter requires a valid string index.");
  }
  return text.slice(0, index) + value + text.slice(index + 1);
}

function syncHudBottomLineY() {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
}

function createGrid(levelConfig) {
  syncHudBottomLineY();
  var viewport = new BoardViewportSystem();
  var grid = new BubbleGrid();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.initialize({});
  viewport.configureLevel(levelConfig);
  grid.configureLevel(levelConfig);
  return grid;
}

function createResolution() {
  return {
    attachedCell: null,
    matched: [],
    floating: [],
    collected: [],
    thawed: [],
    iceCollected: 0,
    matchedObjectiveCollected: [],
    injectedSkills: [],
    reactiveTriggered: [],
    blastExplosions: [],
    spawnedBySplitters: [],
    swirlRotations: [],
    wormholeShifts: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    fairyAssistEvents: [],
    fairyAssistResolved: true,
    impact: null,
    scoreDelta: 0,
    boardCleared: false,
    boardDropped: false,
    boardViewportAdjusted: false,
    topAnchorCollapse: false,
    eliminationSequence: [],
    scoreEvents: []
  };
}

function validateConfigAndCompactCodec() {
  var levelPath = path.resolve(__dirname, "../assets/map/config/levels/level_001.json");
  var raw = readJson(levelPath);
  raw.level.layout[4] = replaceCharacter(raw.level.layout[4], 4, ".");
  raw.level.specialEntities.push({
    id: "swirl_validation",
    entityCategory: "reactive_ball",
    entityType: "swirl",
    row: 4,
    col: 4
  });
  var normalized = LevelConfigLoader.normalizeLevelConfig(raw, "level_001");
  var swirl = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityType === "swirl";
  });
  if (swirl.length !== 1) {
    throw new Error("Swirl config normalization must preserve one swirl entity.");
  }

  var fullPack = {
    schemaVersion: 1,
    packId: "swirl_validation_pack",
    from: 1,
    to: 1,
    levels: {
      level_001: normalized
    }
  };
  var compact = LevelPackCompactCodec.compactPack(fullPack);
  if (compact.levels.level_001.level.specialEntities[0][2] !== "w") {
    throw new Error("Compact swirl entity must use type code `w`.");
  }
  var expanded = LevelPackCompactCodec.expandPack(compact);
  if (expanded.levels.level_001.level.specialEntities[0].entityType !== "swirl") {
    throw new Error("Expanded compact swirl entity must restore entityType swirl.");
  }
}

function validateRotationAndDeferredDrop() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "SWIRL_VALIDATION",
      initialDropSpaceRows: 8,
      layout: [
        "...R......",
        "...R.....",
        "...B......",
        "..G......",
        "..R.......",
        ".B.......",
        "..R.......",
        "........."
      ],
      specialEntities: [
        {
          id: "swirl_center",
          entityCategory: "reactive_ball",
          entityType: "swirl",
          row: 2,
          col: 4
        }
      ]
    }
  };
  var grid = createGrid(levelConfig);
  var countBefore = grid.getCells().length;
  var dropped = [];
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem = new SupportSystem();
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (cells) {
      dropped = dropped.concat(clone(cells));
    },
    hasActiveDrops: function () {
      return dropped.length > 0;
    }
  };
  manager.systems.jarCollectorSystem = {
    collect: function () {
      return [];
    }
  };
  manager.shotsFired = 1;
  manager.remainingShots = 2;
  manager.isTimedInfiniteShots = false;
  manager.state = "running";
  manager.pendingSplitterSpawns = [];
  var resolution = createResolution();
  manager.lastResolution = resolution;
  var continuationCalled = false;
  manager._continueAfterSwirlRotation = function (completedResolution) {
    if (completedResolution !== resolution) {
      throw new Error("Swirl completion must continue with the same resolution.");
    }
    continuationCalled = true;
  };

  if (!manager._beginSwirlRotationForResolution(resolution)) {
    throw new Error("Swirl validation board must start a rotation.");
  }
  if (grid.getCells().length !== countBefore) {
    throw new Error("Swirl rotation must preserve total bubble count before support resolution.");
  }
  if (grid.getCell(1, 3).color !== "B" || grid.getCell(1, 4).color !== "R") {
    throw new Error("Swirl track must move colors one cell clockwise.");
  }
  if (resolution.swirlRotations.length !== 1 || resolution.swirlRotations[0].moves.length !== 2) {
    throw new Error("Swirl resolution must expose the exact occupied track moves.");
  }

  manager._updatePendingSwirlRotation(SpecialAnimationTiming.swirlRotation.duration * 0.5);
  if (dropped.length !== 0 || continuationCalled) {
    throw new Error("Swirl support scan must wait for the rotation animation to finish.");
  }
  manager._updatePendingSwirlRotation(SpecialAnimationTiming.swirlRotation.duration * 0.5);
  var droppedCoordinates = dropped.map(function (cell) {
    return cell.row + ":" + cell.col;
  }).sort();
  if (
    dropped.length !== 4 ||
    droppedCoordinates.join(",") !== "3:2,4:2,5:1,6:2"
  ) {
    throw new Error("Swirl completion must drop the entire newly unsupported chain through the normal drop pipeline.");
  }
  if (!continuationCalled) {
    throw new Error("Swirl completion must resume the shot state machine immediately.");
  }
}

function validateFloatingNodesOverridePendingShatterRetention() {
  function FakeLevelRenderer() {}
  attachLevelRendererSceneBoardMethods(FakeLevelRenderer, {
    BoardLayout: BoardLayout,
    FairyAssistConfig: FairyAssistConfig
  });

  function createNode() {
    return {
      __boardTick: 1,
      __bubblePrefabPath: "prefab/NormalBubbleItem",
      active: true,
      stopAllActions: function () {},
      removeFromParent: function () {}
    };
  }

  var floatingNode = createNode();
  var shatterOnlyNode = createNode();
  var renderer = new FakeLevelRenderer();
  renderer.lastRuntimeSnapshot = {
    lastResolution: {
      floating: [{ id: "3_2" }]
    }
  };
  renderer.boardBubbleNodes = {
    "3_2": floatingNode,
    "9_9": shatterOnlyNode
  };
  renderer.boardCellRenderKeys = {
    "3_2": "floating",
    "9_9": "shatter_only"
  };
  renderer.boardBubbleNodePool = {};
  renderer.bubbleShatterRenderer = {
    isCellShatterPending: function () {
      return true;
    }
  };
  renderer.wormholeShaderRenderer = {
    resetNode: function (node) {
      if (!node) {
        throw new Error("Swirl board recycling fixture requires a node for wormhole material reset.");
      }
      node.__wormholeShaderActive = false;
    }
  };
  renderer._removeBarrierHammerHintNodeByCellId = function () {};

  renderer._syncCurrentResolutionFloatingCellIds();
  renderer._recycleInactiveBoardBubbleNodes(2);

  if (renderer.boardBubbleNodes["3_2"] || floatingNode.active !== false) {
    throw new Error("Floating board node must be recycled even when its coordinate is pending shatter.");
  }
  if (renderer.boardBubbleNodes["9_9"] !== shatterOnlyNode || shatterOnlyNode.active !== true) {
    throw new Error("Non-floating pending shatter node must keep its original presentation timing.");
  }
}

validateConfigAndCompactCodec();
validateRotationAndDeferredDrop();
validateFloatingNodesOverridePendingShatterRetention();
console.log("[OK] swirl_bubble config, clockwise rotation, full-chain support drop and board-node recycling");
