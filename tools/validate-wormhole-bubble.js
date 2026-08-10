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
var attachLevelRendererSceneScaffoldMethods = require("../gameplay-src/render/LevelRendererSceneScaffoldMethods");
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
  var shifts = grid.shiftWormholeInteriors();
  assert(shifts.length === 1, "Single wormhole pair fixture must produce one shift.");
  var shifted = shifts[0];
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

function validateMultiplePairShift() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_MULTI_PAIR_SHIFT",
      initialDropSpaceRows: 8,
      layout: [
        "R.........",
        ".........",
        ".R.B......",
        ".........",
        "..G.Y.....",
        ".........",
        "..........",
        "........."
      ],
      specialEntities: [
        { id: "pair_01_left", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 2, col: 0 },
        { id: "pair_01_right", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 2, col: 5 },
        { id: "pair_02_left", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "left", row: 4, col: 1 },
        { id: "pair_02_right", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "left", row: 4, col: 6 }
      ]
    }
  };
  var grid = createGrid(levelConfig);
  var pairs = grid.getWormholePairs();
  assert(pairs.length === 2, "BubbleGrid must resolve two wormhole pairs by row.");
  var shifts = grid.shiftWormholeInteriors();
  assert(shifts.length === 2 && shifts[0].row === 2 && shifts[1].row === 4, "Both wormhole rows must shift in one phase.");
  assert(grid.getCell(2, 2).color === "R" && grid.getCell(2, 4).color === "B", "Right-moving pair must rotate its own interior.");
  assert(grid.getCell(4, 1).id === "pair_02_left" && grid.getCell(4, 6).id === "pair_02_right", "Second pair endpoints must remain fixed.");
  assert(grid.getCell(4, 1).row === 4 && grid.getCell(4, 6).row === 4, "Second pair must remain isolated on its row.");
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
  var dropRegisterOptions = [];
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem = support;
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (cells, passedGrid, options) {
      assert(passedGrid === grid, "Wormhole floating drops must register against the active grid.");
      dropRegisterOptions.push(clone(options));
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
  resolution.matched = [{
    id: "matched_before_wormhole",
    entityCategory: "normal_ball",
    entityType: null,
    color: "R",
    row: 1,
    col: 1
  }];
  var inheritedDropOptions = manager._buildResolutionDropRegisterOptions(
    resolution,
    undefined,
    undefined
  );
  assert(inheritedDropOptions.holdUntilEliminationPresentationComplete === true, "Regression fixture must reproduce the stale elimination-presentation hold.");
  manager.lastResolution = resolution;
  var continued = false;
  manager._continueAfterWormholeShift = function (completedResolution) {
    assert(completedResolution === resolution, "Wormhole completion must continue with the same resolution.");
    continued = true;
  };

  assert(manager._beginWormholeShiftForResolution(resolution), "Wormhole phase must start after a shot resolution.");
  assert(resolution.matched.length === 1 && resolution.matched[0].id === "matched_before_wormhole", "Wormhole movement must not create an automatic color match.");
  assert(grid.getCell(2, 3).color === "R" && grid.getCell(2, 5).color === "R", "Wormhole shift must move the three-ball row without resolving it.");
  manager._updatePendingWormholeShift(SpecialAnimationTiming.wormholeShift.duration * 0.5);
  assert(dropped.length === 0 && continued === false, "Support drops must wait until the wormhole movement animation finishes.");
  manager._updatePendingWormholeShift(SpecialAnimationTiming.wormholeShift.duration * 0.5);
  var droppedCoordinates = dropped.map(function (cell) {
    return cell.row + ":" + cell.col;
  }).sort();
  assert(droppedCoordinates.join(",") === "2:3,2:4,2:5,3:3", "Wormhole movement must immediately drop the newly unsupported chain.");
  assert(dropRegisterOptions.length === 1, "Wormhole completion must register one immediate floating-drop batch.");
  assert(dropRegisterOptions[0].startDelay === 0, "Wormhole floating drops must not add a start delay.");
  assert(dropRegisterOptions[0].holdUntilEliminationPresentationComplete !== true, "Wormhole floating drops must not wait for an elimination callback that already completed.");
  assert(manager._isBoardCleared(grid), "A board containing only fixed wormholes must count as cleared.");
  assert(continued, "Wormhole completion must resume the post-shot state machine.");
}

function validateTopAnchorCollapsePreservesWormholes() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_TOP_ANCHOR_COLLAPSE",
      initialDropSpaceRows: 8,
      layout: [
        "RRRRR.....",
        ".........",
        "..........",
        ".........",
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
  var registeredDrops = [];
  var registeredDropOptions = null;
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (cells, passedGrid, options) {
      assert(passedGrid === grid, "Top-anchor collapse must register drops against the active grid.");
      registeredDrops = clone(cells);
      registeredDropOptions = clone(options);
      return clone(cells);
    },
    hasActiveDrops: function () {
      return registeredDrops.length > 0;
    }
  };
  manager.state = "running";
  manager.lastResolution = createResolution();

  assert(BoardViewportSystem.countTopRowEmptySlots(grid.getCells(), grid.maxColumns) === 6, "Top-anchor collapse fixture must expose exactly six top-row empty slots.");
  assert(manager._tryTopAnchorCollapse(), "Six top-row empty slots must trigger collapse even when a wormhole pair exists.");
  assert(registeredDrops.length === 5, "Top-anchor collapse must drop every non-wormhole board cell.");
  assert(registeredDropOptions.startDelay === 0, "Top-anchor collapse drops must start without delay.");
  assert(registeredDropOptions.holdUntilEliminationPresentationComplete !== true, "Top-anchor collapse drops must not wait for an elimination callback that already completed.");
  assert(grid.getCells().length === 2 && grid.hasWormholePair(), "Top-anchor collapse must preserve both fixed wormhole endpoints.");
  assert(manager.lastResolution.topAnchorCollapse === true, "Top-anchor collapse must be recorded on the active resolution.");
  assert(manager.state === "won_pending", "Top-anchor collapse must enter pending win settlement.");

  function ScaffoldRenderer() {}
  attachLevelRendererSceneScaffoldMethods(ScaffoldRenderer, {
    BoardLayout: BoardLayout,
    PREFAB_PATHS: {}
  });
  var collapsedBoardSnapshot = grid.snapshot();
  var mainlandTargetY = Object.create(ScaffoldRenderer.prototype)._resolveTopRowBubbleVisualTopY(collapsedBoardSnapshot);
  assert(mainlandTargetY === collapsedBoardSnapshot.topAttachY + BoardLayout.bubbleRadius, "Top mainland must stay at the board boundary when only fixed wormholes remain.");
}

function validateFlowShaderAndShiftCompatibility() {
  var effectPath = path.resolve(__dirname, "../assets/game/effects/WormholeFlow.effect");
  var effectMetaPath = effectPath + ".meta";
  var wormholeTextureMetaPath = path.resolve(__dirname, "../assets/game/image/ball/wormhole.png.meta");
  var directionArrowMetaPath = path.resolve(__dirname, "../assets/game/image/ball/arrow.png.meta");
  var levelRendererSourcePath = path.resolve(__dirname, "../gameplay-src/render/LevelRenderer.js");
  var boardRendererSourcePath = path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js");
  var sceneFxSourcePath = path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneFxMethods.js");
  var effectText = fs.readFileSync(effectPath, "utf8");
  var levelRendererSource = fs.readFileSync(levelRendererSourcePath, "utf8");
  var boardRendererSource = fs.readFileSync(boardRendererSourcePath, "utf8");
  var sceneFxSource = fs.readFileSync(sceneFxSourcePath, "utf8");
  var effectMeta = readJson(effectMetaPath);
  var wormholeTextureMeta = readJson(wormholeTextureMetaPath);
  var directionArrowMeta = readJson(directionArrowMetaPath);
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
  assert(directionArrowMeta.importer === "texture" && directionArrowMeta.type === "sprite", "Wormhole direction arrow must import as Sprite texture.");
  assert(directionArrowMeta.width > 0 && directionArrowMeta.height > 0, "Wormhole direction arrow texture size must be positive.");
  assert(levelRendererSource.indexOf('"game/image/ball/arrow"') >= 0, "LevelRenderer must preload the wormhole direction arrow resource.");
  assert(boardRendererSource.indexOf("this._syncWormholeDirectionGuide(boardSnapshot);") >= 0, "Board rendering must synchronize the wormhole direction guide.");
  [
    "WormholeDirectionGuide",
    'direction === "right" ? 0 : 180',
    "cc.repeatForever",
    "flowOrder",
    "WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE"
  ].forEach(function (requiredToken) {
    assert(sceneFxSource.indexOf(requiredToken) >= 0, "Wormhole direction guide token is missing: " + requiredToken);
  });
  assert(!Object.prototype.hasOwnProperty.call(SpecialAnimationTiming, "wormholeRotation"), "Mechanical wormhole rotation timing must be removed.");
  assert(boardRendererSource.indexOf("__wormholeRotationActive") < 0, "Mechanical wormhole node rotation state must be removed.");

  var previousCc = global.cc;
  function Sprite() {}
  function MockNode(name) {
    this.name = name;
    this.isValid = true;
    this.children = [];
    this.opacity = 255;
    this.angle = 0;
    this._parent = null;
    Object.defineProperty(this, "parent", {
      get: function () {
        return this._parent;
      },
      set: function (parent) {
        this._parent = parent;
        if (parent && Array.isArray(parent.children)) {
          parent.children.push(this);
        }
      }
    });
  }
  MockNode.prototype.setContentSize = function (size) {
    this.contentSize = size;
  };
  MockNode.prototype.setPosition = function (x, y) {
    this.x = x;
    this.y = y;
  };
  MockNode.prototype.setScale = function (scale) {
    this.scale = scale;
  };
  MockNode.prototype.runAction = function (action) {
    this.action = action;
  };
  MockNode.prototype.removeFromParent = function (destroy) {
    assert(destroy === true, "Wormhole direction guide removal must clean up its render actions.");
    this._parent = null;
  };
  MockNode.prototype.destroy = function () {
    this.isValid = false;
  };
  var createdMaterial = {
    isValid: true,
    properties: {},
    setProperty: function (name, value) {
      this.properties[name] = value;
    }
  };
  global.cc = {
    Node: MockNode,
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
    },
    moveBy: function (duration, x, y) {
      return { type: "moveBy", duration: duration, x: x, y: y };
    },
    fadeTo: function (duration, opacity) {
      return { type: "fadeTo", duration: duration, opacity: opacity };
    },
    scaleTo: function (duration, scale) {
      return { type: "scaleTo", duration: duration, scale: scale };
    },
    delayTime: function (duration) {
      return { type: "delayTime", duration: duration };
    },
    callFunc: function (callback, target, data) {
      return { type: "callFunc", callback: callback, target: target, data: data };
    },
    spawn: function () {
      return { type: "spawn", actions: Array.prototype.slice.call(arguments) };
    },
    sequence: function () {
      return { type: "sequence", actions: Array.prototype.slice.call(arguments) };
    },
    repeatForever: function (action) {
      return { type: "repeatForever", action: action };
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
      SpecialAnimationTiming: SpecialAnimationTiming,
      WORMHOLE_DIRECTION_ARROW_RESOURCE: "game/image/ball/arrow",
      WORMHOLE_DIRECTION_ARROW_SIZE: { width: 42, height: 42 },
      WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE: 18,
      WORMHOLE_DIRECTION_ARROW_STAGGER: 0.12,
      WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION: 0.2,
      WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION: 0.24,
      WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE: 0.28,
      ensureSprite: function (node, spriteFrame) {
        node.spriteFrame = spriteFrame;
        return { spriteFrame: spriteFrame };
      }
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

    fxRenderer.layers = {
      board: new MockNode("BoardLayer")
    };
    fxRenderer.spriteFrameCache = {
      "game/image/ball/arrow": { isValid: true }
    };
    fxRenderer.wormholeDirectionGuideRoot = null;
    fxRenderer.lastWormholeDirectionGuideKey = "";
    fxRenderer._syncWormholeDirectionGuide({
      maxColumns: 10,
      viewportOffsetY: 0,
      cells: [
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 3, col: 1, moveDirection: "right" },
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 3, col: 4, moveDirection: "right" }
      ]
    });
    assert(fxRenderer.wormholeDirectionGuideRoot.children.length === 2, "Wormhole direction guide must create one arrow for every interior slot.");
    assert(fxRenderer.wormholeDirectionGuideRoot.children.every(function (node) {
      return node.angle === 0 && node.action && node.action.type === "repeatForever";
    }), "Right-moving wormhole arrows must face right and loop their flow actions.");

    fxRenderer._syncWormholeDirectionGuide({
      maxColumns: 10,
      viewportOffsetY: 0,
      cells: [
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 2, col: 1, moveDirection: "right" },
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 2, col: 4, moveDirection: "right" },
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 5, col: 2, moveDirection: "left" },
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 5, col: 5, moveDirection: "left" }
      ]
    });
    assert(fxRenderer.wormholeDirectionGuideRoot.children.length === 4, "Two wormhole pairs must render arrows for both isolated interiors.");
    assert(fxRenderer.wormholeDirectionGuideRoot.children.filter(function (node) { return node.angle === 0; }).length === 2, "First wormhole pair arrows must face right.");
    assert(fxRenderer.wormholeDirectionGuideRoot.children.filter(function (node) { return node.angle === 180; }).length === 2, "Second wormhole pair arrows must face left.");

    fxRenderer._syncWormholeDirectionGuide({
      maxColumns: 10,
      viewportOffsetY: 0,
      cells: [
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 3, col: 1, moveDirection: "left" },
        { entityCategory: "reactive_ball", entityType: "wormhole", row: 3, col: 4, moveDirection: "left" }
      ]
    });
    assert(fxRenderer.wormholeDirectionGuideRoot.children.every(function (node) {
      return node.angle === 180;
    }), "Left-moving wormhole arrows must face left.");

    fxRenderer._syncWormholeDirectionGuide({
      maxColumns: 10,
      viewportOffsetY: 0,
      cells: []
    });
    assert(fxRenderer.wormholeDirectionGuideRoot === null, "Non-wormhole boards must remove the direction guide.");
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
validateMultiplePairShift();
validateDeferredSupportDropAndNoAutoMatch();
validateTopAnchorCollapsePreservesWormholes();
validateFlowShaderAndShiftCompatibility();
console.log("[OK] wormhole config, compact codec, multi-pair mixed-cell cyclic shift, direction guide, fixed support, top-anchor collapse, deferred drop, clear-state and layered flow shader rules");
