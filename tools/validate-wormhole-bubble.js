"use strict";

var fs = require("fs");
var path = require("path");
var readGameplaySourceFamily = require("./read-gameplay-source-family").readGameplaySourceFamily;

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");
var TrajectoryPredictor = require("../gameplay-src/systems/TrajectoryPredictor");
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
    transparentBallsDestroyed: [],
    rescuedTrappedSpirits: [],
    spawnedBySplitters: [],
    breederResolved: false,
    breederSpawns: [],
    swirlRotations: [],
    wormholeShifts: [],
    wormholeProjectileAbsorptions: [],
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

  var overlapFixture = readJson(levelPath);
  var overlapEndpoint = overlapFixture.level.specialEntities.filter(function (entity) {
    return entity.entityType === "wormhole";
  })[0];
  var overlapRow = overlapFixture.level.layout[overlapEndpoint.row].split("");
  overlapRow[overlapEndpoint.col] = overlapFixture.level.colors[0];
  overlapFixture.level.layout[overlapEndpoint.row] = overlapRow.join("");
  var overlapRejected = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(overlapFixture, "level_test");
  } catch (error) {
    overlapRejected = /special entity must be placed on/.test(error.message);
  }
  assert(overlapRejected, "Wormhole config must reject a board ball in an endpoint coordinate.");
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
  assert(shifted && shifted.slotCount === 7, "Wormhole shift must expose only the seven strict interior slots.");
  assert(grid.getCell(3, 0) === null && grid.getCell(3, 8) === null, "Wormhole endpoint coordinates must remain empty after cycling.");
  assert(grid.getCell(3, 1) === null, "Wrapped interior empty slot must emerge beside the left endpoint.");
  assert(grid.getCell(3, 2).color === "R", "Normal ball must move right by one interior slot.");
  assert(grid.getCell(3, 3).id === "locked_moving", "Locked special ball must move with the strict interior segment.");
  assert(grid.getCell(3, 4).color === "B", "Second normal ball must move right by one interior slot.");
  assert(grid.getCell(3, 6).id === "vine_moving" && grid.getCell(3, 6).health === 2, "Moving vine spirit must preserve id and runtime health.");
  assert(grid.getCell(3, 7).color === "G", "Last occupied slot must move right without losing color.");
  assert(grid.getCells().every(function (cell) { return cell.entityType !== "wormhole"; }), "Wormholes must not enter BubbleGrid.cells.");
  assert(grid.getSpecialEntities().filter(function (entity) { return entity.entityType === "wormhole"; }).length === 2, "Wormhole overlays must remain fixed special entities.");
  assert(grid.getClearableCells().length === grid.getCells().length, "Every occupied board cell must remain clearable independently of wormhole overlays.");
  var emptyEndpointPosition = grid.getCellPosition(3, 8);
  assert(grid.findCollision(emptyEndpointPosition, 1) === null, "An empty wormhole endpoint must not block the shot collision path.");
  assert(
    grid.findWormholeCollisionOnSegment(
      { x: emptyEndpointPosition.x, y: emptyEndpointPosition.y - 200 },
      { x: emptyEndpointPosition.x, y: emptyEndpointPosition.y + 20 },
      BoardLayout.bubbleDiameter
    ).cell.id === "wormhole_right",
    "Wormhole endpoints must absorb the shot path independently of BubbleGrid.cells."
  );
  var endpointAttachRejected = false;
  try {
    grid.addBubble({ row: 3, col: 8 }, "B");
  } catch (error) {
    endpointAttachRejected = /wormhole endpoint/.test(error.message);
  }
  assert(endpointAttachRejected, "Runtime attachment must reject every wormhole endpoint coordinate.");
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
  assert(grid.getCell(4, 3).color === "Y" && grid.getCell(4, 5).color === "G", "Left-moving pair must wrap only across its strict interior.");
  assert(grid.getWormholePairs()[1][0].row === 4 && grid.getWormholePairs()[1][1].row === 4, "Second overlay pair must remain isolated on its row.");
}

function validateProjectileAbsorptionPlanningAndSettlement() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_PROJECTILE_ABSORPTION",
      initialDropSpaceRows: 8,
      layout: [
        "R.........",
        ".........",
        "..........",
        ".........",
        "..........",
        ".........",
        "..........",
        "........."
      ],
      specialEntities: [
        { id: "absorb_left", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 3, col: 4 },
        { id: "absorb_right", entityCategory: "reactive_ball", entityType: "wormhole", moveDirection: "right", row: 3, col: 7 }
      ]
    }
  };
  var grid = createGrid(levelConfig);
  var targetPosition = grid.getCellPosition(3, 4);
  var predictor = new TrajectoryPredictor();
  predictor.initialize({});
  predictor.configureLevel(levelConfig);
  var plan = predictor.predictShotPlan(
    grid,
    { x: targetPosition.x, y: targetPosition.y - 300 },
    { x: 0, y: 1 }
  );
  assert(plan.hitType === "wormhole", "Aim prediction must stop at the first wormhole endpoint.");
  assert(plan.targetCell === null && plan.targetCellPosition === null, "Wormhole shot plan must not expose an attachment or ghost target.");
  assert(plan.absorbingWormhole.id === "absorb_left", "Wormhole shot plan must record the exact absorbing endpoint.");
  assert(plan.pathPoints.length >= 2, "Wormhole shot plan must keep a finite projectile path to the contact point.");
  plan.penetratedTransparentBalls = [];

  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.boardOcclusionSystem = {
    onShotFired: function () {
      return [];
    }
  };
  manager.shotsFired = 1;
  manager.remainingShots = 3;
  manager.state = "running";
  manager.activeProjectile = {
    position: clone(plan.pathPoints[plan.pathPoints.length - 1]),
    ball: {
      ballCategory: "normal",
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    },
    color: "R",
    destroyedTransparentBalls: [],
    targetCell: null,
    shotPlan: clone(plan)
  };
  var continuedResolution = null;
  manager._beginSwirlRotationForResolution = function () { return false; };
  manager._beginWormholeShiftForResolution = function () { return false; };
  manager._beginVineCastForResolution = function () { return false; };
  manager._continueAfterVineCast = function (resolution) {
    continuedResolution = resolution;
  };
  manager._finalizePlannedShot();
  assert(manager.activeProjectile === null, "Absorbed projectile must disappear instead of attaching to the board.");
  assert(manager.lastResolution.wormholeProjectileAbsorptions.length === 1, "Absorbed projectile must create exactly one visual event.");
  var absorption = manager.lastResolution.wormholeProjectileAbsorptions[0];
  assert(absorption.wormholeId === "absorb_left", "Absorption event must preserve the absorbing endpoint id.");
  assert(absorption.duration === SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration, "Absorption event must use authoritative timing.");
  assert(continuedResolution === manager.lastResolution, "Absorbed shot must continue the ordinary post-shot special phase chain.");
}

function validateDeferredSupportDropAndNoAutoMatch() {
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "WORMHOLE_SUPPORT_DROP",
      initialDropSpaceRows: 8,
      layout: [
        ".R........",
        ".R.......",
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
  assert(support.findFloatingCells(grid).length === 0, "Top-connected balls must be supported before the shot removes their real support.");
  var removedSupport = grid.removeCells([grid.getCell(0, 1), grid.getCell(1, 1)]);
  assert(removedSupport.length === 2, "Wormhole support regression fixture must remove both real top supports.");
  assert(support.findFloatingCells(grid).length === 4, "Wormholes must not keep the disconnected chain supported.");

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
  resolution.matched = removedSupport;
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
  assert(resolution.matched.length === 2, "Wormhole movement must not create an automatic color match.");
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
  assert(manager._isBoardCleared(grid), "Wormhole overlays must not prevent an empty board from counting as cleared.");
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
  assert(grid.getCells().length === 0 && grid.hasWormholePair(), "Top-anchor collapse must leave an empty grid while preserving both wormhole overlays.");
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
  var boardRendererSourcePath = path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js");
  var effectText = fs.readFileSync(effectPath, "utf8");
  var projectRoot = path.resolve(__dirname, "..");
  var levelRendererSource = readGameplaySourceFamily(projectRoot, "gameplay-src/render", "LevelRenderer");
  var boardRendererSource = fs.readFileSync(boardRendererSourcePath, "utf8");
  var sceneFxSource = readGameplaySourceFamily(projectRoot, "gameplay-src/render", "LevelRenderer");
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
  assert(levelRendererSource.indexOf("new cc.Size(80, 80)") >= 0, "Wormhole endpoints must render at exactly 80x80.");
  assert(
    levelRendererSource.indexOf('wormhole: this._getOrCreateLayer("WormholeLayer", 24)') >= 0 &&
      levelRendererSource.indexOf('board: this._getOrCreateLayer("BoardLayer", 40)') >= 0 &&
      levelRendererSource.indexOf('wormholeDirection: this._getOrCreateLayer("WormholeDirectionLayer", 42)') >= 0,
    "Wormhole endpoints must render below board balls and direction arrows must render above them."
  );
  assert(boardRendererSource.indexOf("isWormholeEntity(cell) ? WORMHOLE_RENDER_SIZE : BOARD_BUBBLE_SIZE") >= 0, "Board rendering must apply the dedicated wormhole size.");
  assert(sceneFxSource.indexOf("boardSnapshot.specialEntities.filter") >= 0, "Wormhole direction guide must use non-grid special entities.");
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
      BOARD_BUBBLE_SIZE: { width: 80, height: 80 },
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
    function createMovingNode() {
      return {
        isValid: true,
        opacity: 255,
        scale: 1,
        stopCount: 0,
        action: null,
        stopAllActions: function () {
          this.stopCount += 1;
        },
        setPosition: function (x, y) {
          this.x = x;
          this.y = y;
        },
        setScale: function (scale) {
          this.scale = scale;
        },
        runAction: function (action) {
          this.action = action;
        }
      };
    }
    var movingNode = createMovingNode();
    var leftWrappedNode = createMovingNode();
    var rightWrappedNode = createMovingNode();
    var leftEndpoint = createEndpointNode();
    var rightEndpoint = createEndpointNode();
    var fxRenderer = new FxRenderer();
    fxRenderer.wormholeShiftAnimatedIds = {};
    fxRenderer.boardBubbleNodes = {
      moving: movingNode,
      left_wrapped: leftWrappedNode,
      right_wrapped: rightWrappedNode,
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
          row: 3,
          duration: SpecialAnimationTiming.wormholeShift.duration,
          moveDirection: "right",
          leftWormholeId: "wormhole_left",
          leftCol: 0,
          rightWormholeId: "wormhole_right",
          rightCol: 4,
          slotCount: 3,
          moves: [{
            fromRow: 3,
            fromCol: 1,
            toRow: 3,
            toCol: 2,
            targetCellId: "moving",
            wrapped: false
          }, {
            fromRow: 3,
            fromCol: 3,
            toRow: 3,
            toCol: 1,
            targetCellId: "right_wrapped",
            wrapped: true
          }]
        }, {
          id: "wormhole_shift_animation_left_wrap_test",
          row: 3,
          duration: SpecialAnimationTiming.wormholeShift.duration,
          moveDirection: "left",
          leftWormholeId: "wormhole_left",
          leftCol: 0,
          rightWormholeId: "wormhole_right",
          rightCol: 4,
          slotCount: 3,
          moves: [{
            fromRow: 3,
            fromCol: 1,
            toRow: 3,
            toCol: 3,
            targetCellId: "left_wrapped",
            wrapped: true
          }]
        }]
      }
    });
    assert(movingNode.stopCount === 1 && movingNode.action.type === "moveTo", "Interior bubble must still play the shift movement.");
    assert(leftWrappedNode.stopCount === 1 && leftWrappedNode.action.type === "sequence", "Left-moving wrapped bubble must play inhale and exhale actions.");
    assert(rightWrappedNode.stopCount === 1 && rightWrappedNode.action.type === "sequence", "Right-moving wrapped bubble must play inhale and exhale actions.");
    assert(leftWrappedNode.action.actions[0].type === "spawn" && leftWrappedNode.action.actions[2].type === "spawn", "Wrapped bubble must shrink into one endpoint and grow from the other endpoint.");
    assert(rightWrappedNode.action.actions[0].actions[1].type === "scaleTo" && rightWrappedNode.action.actions[2].actions[2].type === "fadeTo", "Wrapped bubble inhale/exhale must include scale and opacity changes.");
    assert(leftEndpoint.stopCount === 0 && rightEndpoint.stopCount === 0, "Wormhole shift must not interrupt endpoint flow shaders.");

    fxRenderer.layers = {
      board: new MockNode("BoardLayer"),
      wormholeDirection: new MockNode("WormholeDirectionLayer")
    };
    fxRenderer.wormholeProjectileAbsorptionAnimatedIds = {};
    fxRenderer._applyBallVisualCached = function (node, ball) {
      node.renderedBall = clone(ball);
    };
    fxRenderer._playWormholeProjectileAbsorptionAnimation({
      lastResolution: {
        wormholeProjectileAbsorptions: [{
          id: "projectile_absorption_visual",
          wormholeId: "wormhole_left",
          row: 3,
          col: 0,
          startPosition: { x: 0, y: 0 },
          targetPosition: { x: 0, y: 30 },
          duration: SpecialAnimationTiming.wormholeShift.projectileAbsorbDuration,
          ball: { ballCategory: "normal", color: "R", entityCategory: "normal_ball", entityType: null }
        }]
      }
    });
    assert(fxRenderer.layers.board.children.length === 1, "Projectile absorption must create one board-layer visual node.");
    assert(fxRenderer.layers.board.children[0].action.type === "sequence", "Projectile absorption visual must move, shrink and fade into the endpoint.");
    assert(fxRenderer.layers.board.children[0].action.actions[0].actions.length === 3, "Projectile absorption visual must combine movement, scale and opacity actions.");
    fxRenderer.spriteFrameCache = {
      "game/image/ball/arrow": { isValid: true }
    };
    fxRenderer.wormholeDirectionGuideRoot = null;
    fxRenderer.lastWormholeDirectionGuideKey = "";
    fxRenderer._syncWormholeDirectionGuide({
      maxColumns: 10,
      viewportOffsetY: 0,
      specialEntities: [
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
      specialEntities: [
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
      specialEntities: [
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
      specialEntities: []
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
validateProjectileAbsorptionPlanningAndSettlement();
validateDeferredSupportDropAndNoAutoMatch();
validateTopAnchorCollapsePreservesWormholes();
validateFlowShaderAndShiftCompatibility();
console.log("[OK] wormhole reserved endpoints, absorption collision/settlement, non-support rules, strict-interior cyclic shift, inhale/exhale visuals, 80x80 below-ball rendering, above-ball arrows, top-anchor collapse, deferred drop and clear-state rules");
