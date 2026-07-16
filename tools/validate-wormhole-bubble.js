"use strict";

var fs = require("fs");
var path = require("path");

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");
var attachLevelRendererSceneFxMethods = require("../gameplay-src/render/LevelRendererSceneFxMethods");
var WormholeShaderRenderer = require("../gameplay-src/render/WormholeShaderRenderer");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function createGrid(levelConfig) {
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
    vineCastEvaluated: false,
    vineCasts: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: [],
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
    scoreEvents: [],
    dangerReached: false
  };
}

function validateConfigAndCompactCodec() {
  var levelPath = path.resolve(__dirname, "../assets/map/config/levels/level_test.json");
  var normalized = LevelConfigLoader.normalizeLevelConfig(readJson(levelPath), "level_test");
  var wormholes = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityType === "wormhole";
  });
  assert(wormholes.length === 2, "Normalized test level must preserve exactly two wormholes.");
  assert(wormholes[0].row === wormholes[1].row, "Normalized wormholes must remain on one row.");
  assert(wormholes[0].moveDirection === "right" && wormholes[1].moveDirection === "right", "Normalized wormhole direction must be right.");

  var fullPack = {
    schemaVersion: 1,
    packId: "wormhole_validation_pack",
    from: 1,
    to: 1,
    levels: {
      level_001: normalized
    }
  };
  var compact = LevelPackCompactCodec.compactPack(fullPack);
  var encodedWormholes = compact.levels.level_001.level.specialEntities.filter(function (entry) {
    return entry[2] === "h";
  });
  assert(encodedWormholes.length === 2, "Compact pack must encode two wormholes with type code h.");
  assert(encodedWormholes.every(function (entry) { return entry[3] === "right"; }), "Compact wormholes must preserve moveDirection.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  var expandedWormholes = expanded.levels.level_001.level.specialEntities.filter(function (entity) {
    return entity.entityType === "wormhole";
  });
  assert(expandedWormholes.length === 2, "Expanded compact pack must restore two wormholes.");
  assert(expandedWormholes.every(function (entity) { return entity.moveDirection === "right"; }), "Expanded wormholes must restore moveDirection.");
}

function validateMixedCellShiftAndProtection() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_MIXED_SHIFT",
      initialDropSpaceRows: 8,
      layout: [
        "R.........",
        ".........",
        "..........",
        ".R.B..G..",
        "..........",
        ".........",
        "..........",
        "........."
      ],
      specialEntities: [
        { id: "wormhole_left", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 3, col: 0 },
        { id: "locked_moving", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 3, col: 2 },
        { id: "vine_moving", entityCategory: "reactive_ball", entityType: "vine_spirit", row: 3, col: 5 },
        { id: "wormhole_right", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 3, col: 8 }
      ]
    }
  };
  var grid = createGrid(levelConfig);
  grid.damageVineSpirit("vine_moving");
  var shifted = grid.shiftWormholeInterior();
  assert(shifted && shifted.slotCount === 7, "Wormhole shift must expose all seven interior slots.");
  assert(grid.getCell(3, 1) === null, "Wrapped empty slot must move into the first interior position.");
  assert(grid.getCell(3, 2).color === "R", "Normal ball must move right by one slot.");
  assert(grid.getCell(3, 3).id === "locked_moving", "Locked special ball must move with the wormhole segment.");
  assert(grid.getCell(3, 4).color === "B", "Second normal ball must move right by one slot.");
  assert(grid.getCell(3, 6).id === "vine_moving" && grid.getCell(3, 6).health === 2, "Moving vine spirit must preserve id and runtime health.");
  assert(grid.getCell(3, 7).color === "G", "Last occupied slot must move right without losing color.");
  assert(grid.getCell(3, 0).id === "wormhole_left" && grid.getCell(3, 8).id === "wormhole_right", "Wormhole endpoints must remain fixed.");
  assert(grid.removeCells([grid.getCell(3, 0), grid.getCell(3, 8)]).length === 0, "Wormholes must reject removal.");
  assert(grid.getClearableCells().length === grid.getCells().length - 2, "Wormholes must be excluded from clearable board cells.");
}

function validateDeferredSupportDropAndNoAutoMatch() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_SUPPORT_DROP",
      initialDropSpaceRows: 8,
      layout: [
        "..........",
        ".........",
        "..RRR.....",
        "...R.....",
        "..........",
        ".........",
        "..........",
        "........."
      ],
      specialEntities: [
        { id: "wormhole_left", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 2, col: 1 },
        { id: "wormhole_right", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 2, col: 8 }
      ]
    }
  };
  var grid = createGrid(levelConfig);
  var support = new SupportSystem();
  support.initialize({});
  support.configureLevel(levelConfig);
  assert(support.findFloatingCells(grid).length === 0, "Balls connected to a wormhole must be supported before shifting.");

  var dropped = [];
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem = support;
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (cells) {
      dropped = dropped.concat(clone(cells));
      return clone(cells);
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
  var resolution = createResolution();
  manager.lastResolution = resolution;
  var continued = false;
  manager._continueAfterWormholeShift = function (completedResolution) {
    assert(completedResolution === resolution, "Wormhole completion must continue with the same resolution.");
    continued = true;
  };

  assert(manager._beginWormholeShiftForResolution(resolution), "Wormhole phase must start after a shot resolution.");
  assert(resolution.matched.length === 0, "Wormhole movement must not create an automatic color match.");
  assert(grid.getCell(2, 3).color === "R" && grid.getCell(2, 5).color === "R", "Wormhole shift must move the three-ball row without resolving it.");
  manager._updatePendingWormholeShift(SpecialAnimationTiming.wormholeShift.duration * 0.5);
  assert(dropped.length === 0 && continued === false, "Support drops must wait until the wormhole movement animation finishes.");
  manager._updatePendingWormholeShift(SpecialAnimationTiming.wormholeShift.duration * 0.5);
  var droppedCoordinates = dropped.map(function (cell) {
    return cell.row + ":" + cell.col;
  }).sort();
  assert(droppedCoordinates.join(",") === "2:3,2:4,2:5,3:3", "Wormhole movement must immediately drop the newly unsupported chain.");
  assert(manager._isBoardCleared(grid), "A board containing only fixed wormholes must count as cleared.");
  assert(continued, "Wormhole completion must resume the post-shot state machine.");
  assert(manager._tryTopAnchorCollapse() === false, "Top-anchor collapse must not override fixed wormhole support.");
}

function validateFlowShaderAndShiftCompatibility() {
  var effectPath = path.resolve(__dirname, "../assets/game/effects/WormholeFlow.effect");
  var effectMetaPath = effectPath + ".meta";
  var wormholeTextureMetaPath = path.resolve(__dirname, "../assets/game/image/ball/wormhole.png.meta");
  var boardRendererSourcePath = path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js");
  var effectText = fs.readFileSync(effectPath, "utf8");
  var boardRendererSource = fs.readFileSync(boardRendererSourcePath, "utf8");
  var effectMeta = readJson(effectMetaPath);
  var wormholeTextureMeta = readJson(wormholeTextureMetaPath);
  [
    "cc_time.x",
    "centerStrength",
    "rotationAngle",
    "streakMask",
    "breath",
    "centerPulse"
  ].forEach(function (requiredToken) {
    assert(effectText.indexOf(requiredToken) >= 0, "Wormhole flow shader token is missing: " + requiredToken);
  });
  assert(effectMeta.importer === "effect" && Array.isArray(effectMeta.compiledShaders), "Wormhole flow effect meta must use the effect importer.");
  assert(wormholeTextureMeta.packable === false, "Wormhole texture must stay outside the dynamic atlas for stable UV distortion.");
  assert(!Object.prototype.hasOwnProperty.call(SpecialAnimationTiming, "wormholeRotation"), "Mechanical wormhole rotation timing must be removed.");
  assert(boardRendererSource.indexOf("__wormholeRotationActive") < 0, "Mechanical wormhole node rotation state must be removed.");

  var previousCc = global.cc;
  function Sprite() {}
  var createdMaterial = {
    isValid: true,
    properties: {},
    setProperty: function (name, value) {
      this.properties[name] = value;
    }
  };
  global.cc = {
    Sprite: Sprite,
    Material: {
      create: function (effectAsset) {
        assert(effectAsset && effectAsset.isValid, "Wormhole shader material requires valid effect asset.");
        return createdMaterial;
      }
    },
    v4: function (x, y, z, w) {
      return { x: x, y: y, z: z, w: w };
    },
    moveTo: function (duration, x, y) {
      return { type: "moveTo", duration: duration, x: x, y: y };
    }
  };

  try {
    var originalMaterial = { isValid: true, name: "original_sprite_material" };
    var assignedMaterial = originalMaterial;
    var sprite = {
      spriteFrame: {
        isValid: true,
        uv: [0, 0, 1, 0, 0, 1, 1, 1]
      },
      getMaterial: function (materialIndex) {
        assert(materialIndex === 0, "Wormhole shader must use Sprite material slot 0.");
        return assignedMaterial;
      },
      setMaterial: function (materialIndex, material) {
        assert(materialIndex === 0, "Wormhole shader must bind Sprite material slot 0.");
        assignedMaterial = {
          isValid: true,
          source: material
        };
        return assignedMaterial;
      }
    };
    var wormholeNode = {
      isValid: true,
      getChildByName: function () {
        return null;
      },
      getComponent: function (componentType) {
        return componentType === Sprite ? sprite : null;
      }
    };
    var shaderRenderer = new WormholeShaderRenderer();
    shaderRenderer.effectAsset = { isValid: true };
    shaderRenderer.syncNode(wormholeNode, { entityType: "wormhole" });
    assert(wormholeNode.__wormholeShaderActive === true, "Wormhole node must mark its flow shader active.");
    assert(assignedMaterial.source === createdMaterial, "Wormhole Sprite must bind the shared flow shader material.");
    assert(createdMaterial.properties.motionParams.x === 0.55, "Wormhole nebula rotation speed must remain slow.");
    assert(createdMaterial.properties.motionParams.y === 4.8, "Wormhole ring streak speed must remain faster than the nebula.");
    assert(createdMaterial.properties.shapeParams.w === 0.13, "Wormhole center pulse radius must remain configured.");
    shaderRenderer.resetNode(wormholeNode);
    assert(wormholeNode.__wormholeShaderActive === false, "Reused non-wormhole nodes must clear the shader state.");
    assert(assignedMaterial.source === originalMaterial, "Reused non-wormhole nodes must restore their original Sprite material.");

    function FxRenderer() {}
    attachLevelRendererSceneFxMethods(FxRenderer, {
      BoardLayout: {
        getCellPosition: function (row, col) {
          return { x: col * 10, y: row * 10 };
        }
      },
      SpecialAnimationTiming: SpecialAnimationTiming
    });

    function createEndpointNode() {
      return {
        isValid: true,
        __wormholeShaderActive: true,
        stopCount: 0,
        stopAllActions: function () {
          this.stopCount += 1;
        }
      };
    }
    var movingNode = {
      isValid: true,
      stopCount: 0,
      action: null,
      stopAllActions: function () {
        this.stopCount += 1;
      },
      setPosition: function (x, y) {
        this.x = x;
        this.y = y;
      },
      runAction: function (action) {
        this.action = action;
      }
    };
    var leftEndpoint = createEndpointNode();
    var rightEndpoint = createEndpointNode();
    var fxRenderer = new FxRenderer();
    fxRenderer.wormholeShiftAnimatedIds = {};
    fxRenderer.boardBubbleNodes = {
      moving: movingNode,
      wormhole_left: leftEndpoint,
      wormhole_right: rightEndpoint
    };
    fxRenderer._playWormholeShiftAnimation({
      board: {
        maxColumns: 10,
        viewportOffsetY: 0
      },
      lastResolution: {
        wormholeShifts: [{
          id: "wormhole_shift_animation_test",
          duration: SpecialAnimationTiming.wormholeShift.duration,
          moveDirection: "right",
          leftWormholeId: "wormhole_left",
          rightWormholeId: "wormhole_right",
          moves: [{
            fromRow: 3,
            fromCol: 1,
            toRow: 3,
            toCol: 2,
            targetCellId: "moving"
          }]
        }]
      }
    });
    assert(movingNode.stopCount === 1 && movingNode.action.type === "moveTo", "Interior bubble must still play the shift movement.");
    assert(leftEndpoint.stopCount === 0 && rightEndpoint.stopCount === 0, "Wormhole shift must not interrupt endpoint flow shaders.");
  } finally {
    if (typeof previousCc === "undefined") {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

validateConfigAndCompactCodec();
validateMixedCellShiftAndProtection();
validateDeferredSupportDropAndNoAutoMatch();
validateFlowShaderAndShiftCompatibility();
console.log("[OK] wormhole config, compact codec, mixed-cell cyclic shift, fixed support, deferred drop, clear-state and layered flow shader rules");
