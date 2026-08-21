"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {},
  Class: function (definition) { return definition; },
  Component: function () {}
};

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var PropDescriptionConfig = require("../assets/scripts/config/PropDescriptionConfig");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var GameBootstrapSpecialIntroduceFlowMethods = require("../assets/scripts/bootstrap/GameBootstrapSpecialIntroduceFlowMethods");
var MapEditorBoardImport = require("../assets/scripts/editor/MapEditorBoardImport");
var MapEditorController = require("../assets/scripts/editor/MapEditorController");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var SupportSystem = require("../gameplay-src/systems/SupportSystem");
var TrajectoryPredictor = require("../gameplay-src/systems/TrajectoryPredictor");

var ROOT = path.resolve(__dirname, "..");
var LEVEL_PATH = path.join(ROOT, "assets/map/config/levels/level_wind_tunnel_test.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildLevel() {
  return LevelConfigLoader.normalizeLevelConfig(readJson(LEVEL_PATH), "level_wind_tunnel_test");
}

function buildGrid(levelConfig) {
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

function validateConfigAndCodec() {
  var normalized = buildLevel();
  var entrances = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityType === "wind_tunnel_entrance";
  });
  var exits = normalized.level.specialEntities.filter(function (entity) {
    return entity.entityType === "wind_tunnel_exit";
  });
  assert(entrances.length === 1, "Wind tunnel test must contain exactly one entrance.");
  assert(exits.length === 3, "Wind tunnel test must contain three exits.");

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "wind_tunnel_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var encodedTypes = compact.levels.level_001.level.specialEntities.map(function (entry) {
    return entry[2];
  });
  assert(encodedTypes.filter(function (code) { return code === "e"; }).length === 1, "Compact wind entrance must use type code e.");
  assert(encodedTypes.filter(function (code) { return code === "x"; }).length === 3, "Compact wind exits must use type code x.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    expanded.levels.level_001.level.specialEntities.filter(function (entity) {
      return entity.entityType === "wind_tunnel_exit";
    }).length === 3,
    "Expanded compact pack must restore all wind tunnel exits."
  );

  var windTunnelDescriptionKeys = PropDescriptionConfig.collectSpecialKeysForLevel(normalized).filter(function (key) {
    return key === "wind_tunnel";
  });
  assert(windTunnelDescriptionKeys.length === 1, "Wind tunnel entrance and exits must share one prop description key.");
  assert(
    PropDescriptionConfig.SPECIAL_DEFINITIONS.wind_tunnel.iconPath === "ui/image/preview_balls/wind_tunnel_entrance",
    "Wind tunnel prop description must use the UI-owned entrance icon."
  );

  var invalid = readJson(LEVEL_PATH);
  invalid.level.specialEntities = invalid.level.specialEntities.filter(function (entity) {
    return entity.id !== "wind_tunnel_exit_test_03";
  }).slice(0, 2);
  var rejected = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(invalid, "level_wind_tunnel_test");
  } catch (error) {
    rejected = /at least two exits/.test(error.message);
  }
  assert(rejected, "Wind tunnel config must reject an entrance with fewer than two exits.");
}

function validateEditorRoundTrip() {
  var normalized = buildLevel();
  var imported = MapEditorBoardImport.importLevelToCellStates(normalized);
  assert(
    imported.nonCellSpecialOverlays["8:5"] &&
    imported.nonCellSpecialOverlays["8:5"].entityType === "wind_tunnel_entrance",
    "Map editor must import the wind tunnel entrance as a non-cell overlay."
  );
  ["3:2", "3:7", "5:4"].forEach(function (key) {
    assert(imported.cells[key].entityType === "wind_tunnel_exit", "Map editor must import wind tunnel exit cell " + key + ".");
  });
  var exported = MapEditorController._collectBoardData.call({
    _rowCount: imported.rowCount,
    _cells: imported.cells,
    _nonCellSpecialOverlays: imported.nonCellSpecialOverlays,
    _buildSpecialEntityExport: MapEditorController._buildSpecialEntityExport
  });
  assert(exported.specialEntities.filter(function (entity) {
    return entity.entityType === "wind_tunnel_entrance";
  }).length === 1, "Map editor export must preserve the wind tunnel entrance.");
  assert(exported.specialEntities.filter(function (entity) {
    return entity.entityType === "wind_tunnel_exit";
  }).length === 3, "Map editor export must preserve all wind tunnel exits.");
}

function validateRuntimeStateAndTransit() {
  var grid = buildGrid(buildLevel());
  var entrance = grid.getWindTunnelEntrance();
  var exits = grid.getWindTunnelExits();
  assert(entrance && entrance.id === "wind_tunnel_entrance_test_01", "BubbleGrid must expose the live wind tunnel entrance.");
  var entranceSnapshot = grid.getSpecialEntities().filter(function (entity) {
    return entity.id === entrance.id;
  })[0];
  assert(entranceSnapshot && entranceSnapshot.lockChainProtected === false, "Live wind tunnel entrance snapshot must expose boolean lockChainProtected state.");
  assert(exits.length === 3, "BubbleGrid must expose all wind tunnel exits.");
  assert(exits.filter(function (exit) { return exit.active; }).length === 1, "Exactly one wind tunnel exit must be active.");
  assert(exits.every(function (exit) { return exit.traversable === true; }), "Every wind tunnel exit must be marked traversable.");

  var firstActiveId = grid.getActiveWindTunnelExit().id;
  assert(
    grid.updateWindTunnel(SpecialAnimationTiming.windTunnel.activeExitSwitchInterval, function () { return 0; }, true) === false,
    "Paused wind tunnel timer must not switch the active exit."
  );
  assert(grid.getActiveWindTunnelExit().id === firstActiveId, "Paused active exit must remain unchanged.");
  assert(
    grid.updateWindTunnel(SpecialAnimationTiming.windTunnel.activeExitSwitchInterval, function () { return 0; }, false) === true,
    "Running wind tunnel timer must switch the active exit."
  );
  assert(grid.getActiveWindTunnelExit().id !== firstActiveId, "Timed switch must choose a different active exit.");
  assert(grid.getCells().filter(function (cell) {
    return cell.entityType === "wind_tunnel_exit" && cell.active === true;
  }).length === 1, "Board snapshot cells must mark exactly one active wind tunnel exit.");

  var introduceHost = {
    currentLevelConfig: buildLevel(),
    specialIntroduceStore: {
      hasViewed: function () { return false; },
      markViewed: function () {}
    },
    _specialIntroduceQueue: [],
    _specialIntroduceQueuedKeys: {},
    _specialIntroduceCurrentKey: "",
    _showNextSpecialIntroduceView: function () { return Promise.resolve(false); }
  };
  var introduceAppended = GameBootstrapSpecialIntroduceFlowMethods._syncSpecialIntroduceForRuntimeSnapshot.call(
    introduceHost,
    {
      state: "running",
      timedLevel: false,
      objectives: null,
      board: { cells: grid.getCells() }
    }
  );
  assert(introduceAppended === true, "Runtime wind tunnel exit must enqueue its special introduction.");
  assert(
    introduceHost._specialIntroduceQueue.length === 1 &&
    introduceHost._specialIntroduceQueue[0] === "wind_tunnel",
    "Multiple runtime wind tunnel exits must enqueue one shared wind tunnel introduction."
  );

  var transparentGrid = buildGrid(LevelConfigLoader.normalizeLevelConfig(
    readJson(path.join(ROOT, "assets/map/config/levels/level_transparent_ball_test.json")),
    "level_transparent_ball_test"
  ));
  var transparent = transparentGrid.getCells().filter(function (cell) {
    return cell.entityType === "transparent_ball";
  })[0];
  assert(transparent && transparent.traversable === true, "Transparent balls must be marked traversable.");

  var entrancePosition = grid.getCellPosition(entrance.row, entrance.col);
  var segmentStart = { x: entrancePosition.x, y: entrancePosition.y - 180 };
  var segmentEnd = { x: entrancePosition.x, y: entrancePosition.y + 240 };
  var entranceCollision = grid.findWindTunnelEntranceCollisionOnSegment(
    segmentStart,
    segmentEnd,
    BoardLayout.collisionDistance
  );
  assert(entranceCollision && entranceCollision.cell.id === entrance.id, "Entrance must intercept the projectile segment.");
  var predictor = new TrajectoryPredictor();
  predictor.initialize({});
  predictor.configureLevel(buildLevel());
  var plan = predictor.predictShotPlan(grid, segmentStart, { x: 0, y: 1 });
  assert(plan.hitType === "wind_tunnel" && !plan.targetCell, "Trajectory must stop at the wind tunnel entrance before landing.");

  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.trajectoryPredictor = predictor;
  manager._completeAuthoritativeShotPlan(plan, grid);
  var entryDirection = {
    x: plan.impactDirection.x,
    y: plan.impactDirection.y
  };
  manager.activeProjectile = {
    position: plan.pathPoints[plan.pathPoints.length - 1],
    pathPoints: plan.pathPoints,
    segmentIndex: plan.pathPoints.length - 1,
    segmentProgress: 0,
    destroyedTransparentBalls: [],
    scale: 1,
    targetCell: null,
    shotPlan: plan
  };
  manager._beginWindTunnelTransit(manager.activeProjectile, grid);
  var entryRuntimeEvents = manager._drainRuntimeEvents();
  assert(entryRuntimeEvents.length === 1, "Wind tunnel entry must emit exactly one runtime event.");
  assert(
    entryRuntimeEvents[0].type === "wind_tunnel_projectile_entered" &&
    entryRuntimeEvents[0].entranceId === entrance.id &&
    entryRuntimeEvents[0].entranceRow === entrance.row &&
    entryRuntimeEvents[0].entranceCol === entrance.col &&
    entryRuntimeEvents[0].exitId === manager.activeProjectile.windTunnelTransit.exit.id &&
    entryRuntimeEvents[0].exitRow === manager.activeProjectile.windTunnelTransit.exit.row &&
    entryRuntimeEvents[0].exitCol === manager.activeProjectile.windTunnelTransit.exit.col,
    "Wind tunnel entry runtime event must describe the authoritative entrance and selected exit."
  );
  var transitExitId = manager.activeProjectile.windTunnelTransit.exit.id;
  manager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.inhaleDuration * 0.5);
  assert(manager.activeProjectile.scale > 0 && manager.activeProjectile.scale < 1, "Entrance inhale must shrink the projectile.");
  assert(manager._drainRuntimeEvents().length === 0, "Partial inhale must not emit the wind tunnel exit event.");
  manager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.inhaleDuration * 0.5);
  assert(manager.activeProjectile.windTunnelTransit.phase === "exhale" && manager.activeProjectile.scale === 0, "Completed inhale must teleport the hidden projectile to the active exit.");
  var exitRuntimeEvents = manager._drainRuntimeEvents();
  assert(exitRuntimeEvents.length === 1, "Completed inhale must emit exactly one wind tunnel exit event.");
  assert(
    exitRuntimeEvents[0].type === "wind_tunnel_projectile_exited" &&
    exitRuntimeEvents[0].entranceId === entrance.id &&
    exitRuntimeEvents[0].entranceRow === entrance.row &&
    exitRuntimeEvents[0].entranceCol === entrance.col &&
    exitRuntimeEvents[0].exitId === transitExitId &&
    exitRuntimeEvents[0].exitRow === manager.activeProjectile.windTunnelTransit.exit.row &&
    exitRuntimeEvents[0].exitCol === manager.activeProjectile.windTunnelTransit.exit.col,
    "Wind tunnel exit runtime event must describe the authoritative entrance and selected exit."
  );
  manager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.exhaleDuration);
  assert(manager._drainRuntimeEvents().length === 0, "Wind tunnel exhale updates must not replay transit audio events.");
  assert(manager.activeProjectile.scale === 1, "Exit exhale must restore projectile scale.");
  assert(manager.activeProjectile.windTunnelTransit === null, "Completed wind tunnel transit must leave animation state.");
  assert(
    Math.abs(manager.activeProjectile.shotPlan.direction.x - entryDirection.x) < 0.000001 &&
    Math.abs(manager.activeProjectile.shotPlan.direction.y - entryDirection.y) < 0.000001,
    "Projectile exit direction must equal its final entrance direction."
  );
  var transitExitPosition = grid.getCellPosition(
    manager.activeProjectile.windTunnelTransitRecord.exitRow,
    manager.activeProjectile.windTunnelTransitRecord.exitCol
  );
  assert(
    manager.activeProjectile.pathPoints[0].x === transitExitPosition.x &&
    manager.activeProjectile.pathPoints[0].y === transitExitPosition.y,
    "Projectile continuation path must start at the active exit center."
  );
  assert(manager.activeProjectile.targetCell, "Completed transit must calculate a new landing target from the exit trajectory.");
  assert(
    manager.activeProjectile.targetCell.row === manager.activeProjectile.windTunnelTransitRecord.exitRow &&
    manager.activeProjectile.targetCell.col === manager.activeProjectile.windTunnelTransitRecord.exitCol,
    "A blocked outgoing path must resolve back to the emitting exit cell instead of reversing across the board."
  );
  var outgoingPath = manager.activeProjectile.pathPoints;
  var firstOutgoingSegment = {
    x: outgoingPath[1].x - outgoingPath[0].x,
    y: outgoingPath[1].y - outgoingPath[0].y
  };
  assert(
    firstOutgoingSegment.x * entryDirection.x + firstOutgoingSegment.y * entryDirection.y > 0,
    "Projectile first movement after emission must point along its entrance direction."
  );
  var longestOppositeDistance = 0;
  for (var outgoingIndex = 1; outgoingIndex < outgoingPath.length; outgoingIndex += 1) {
    var outgoingDelta = {
      x: outgoingPath[outgoingIndex].x - outgoingPath[outgoingIndex - 1].x,
      y: outgoingPath[outgoingIndex].y - outgoingPath[outgoingIndex - 1].y
    };
    var outgoingDot = outgoingDelta.x * entryDirection.x + outgoingDelta.y * entryDirection.y;
    if (outgoingDot < 0) {
      longestOppositeDistance = Math.max(
        longestOppositeDistance,
        Math.sqrt(outgoingDelta.x * outgoingDelta.x + outgoingDelta.y * outgoingDelta.y)
      );
    }
  }
  assert(
    longestOppositeDistance <= BoardLayout.collisionDistance,
    "Projectile exit path must not contain a long reverse flight segment."
  );
  assert(manager.pendingProjectileFinalize === false, "Completed transit must resume flight before ordinary landing finalization.");

  var reflectedGrid = buildGrid(buildLevel());
  var reflectedPredictor = new TrajectoryPredictor();
  reflectedPredictor.initialize({});
  reflectedPredictor.configureLevel(buildLevel());
  var reflectedEntrance = reflectedGrid.getWindTunnelEntrance();
  var reflectedEntrancePosition = reflectedGrid.getCellPosition(reflectedEntrance.row, reflectedEntrance.col);
  var reflectedDirection = { x: -0.99, y: Math.sqrt(1 - 0.99 * 0.99) };
  var reflectedPlan = reflectedPredictor.predictShotPlan(
    reflectedGrid,
    { x: reflectedEntrancePosition.x, y: reflectedEntrancePosition.y - 500 },
    reflectedDirection
  );
  assert(
    reflectedPlan.hitType === "wind_tunnel" &&
    reflectedPlan.wallBounceCount > 0 &&
    reflectedPlan.direction.x * reflectedPlan.impactDirection.x < 0,
    "Reflected wind tunnel fixture must enter after reversing its horizontal direction."
  );
  var reflectedManager = new GameManager();
  reflectedManager.systems.bubbleGrid = reflectedGrid;
  reflectedManager.systems.trajectoryPredictor = reflectedPredictor;
  reflectedManager._completeAuthoritativeShotPlan(reflectedPlan, reflectedGrid);
  reflectedManager.activeProjectile = {
    position: reflectedPlan.pathPoints[reflectedPlan.pathPoints.length - 1],
    pathPoints: reflectedPlan.pathPoints,
    segmentIndex: reflectedPlan.pathPoints.length - 1,
    segmentProgress: 0,
    destroyedTransparentBalls: [],
    scale: 1,
    targetCell: null,
    shotPlan: reflectedPlan
  };
  reflectedManager._beginWindTunnelTransit(reflectedManager.activeProjectile, reflectedGrid);
  reflectedManager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.inhaleDuration);
  reflectedManager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.exhaleDuration);
  assert(
    Math.abs(reflectedManager.activeProjectile.shotPlan.direction.x - reflectedPlan.impactDirection.x) < 0.000001 &&
    Math.abs(reflectedManager.activeProjectile.shotPlan.direction.y - reflectedPlan.impactDirection.y) < 0.000001,
    "Reflected projectile must leave the exit along its final entrance segment, not its original launch direction."
  );

  var emittedExit = grid.getWindTunnelExits().filter(function (exit) {
    return exit.id === transitExitId;
  })[0];
  assert(emittedExit, "The exit used for emission must remain live after the projectile leaves.");
  var blocked = grid.blockWindTunnelExitAt(emittedExit.row, emittedExit.col);
  assert(blocked.id === transitExitId && grid.getWindTunnelExits().length === 2, "A projectile that stops on an exit must block and remove that exit.");
  assert(grid.getWindTunnelExits().filter(function (exit) { return exit.active; }).length === 1, "Removing the active exit must activate exactly one survivor immediately.");

  var unsupportedLevel = buildLevel();
  var unsupportedGrid = buildGrid(unsupportedLevel);
  unsupportedGrid.removeCells(unsupportedGrid.getCells().filter(function (cell) {
    return cell.entityType !== "wind_tunnel_exit";
  }));
  var supportSystem = new SupportSystem();
  supportSystem.initialize({});
  supportSystem.configureLevel(unsupportedLevel);
  var unsupportedExits = supportSystem.findFloatingCells(unsupportedGrid);
  assert(
    unsupportedExits.length === 3 && unsupportedExits.every(function (cell) {
      return cell.entityType === "wind_tunnel_exit";
    }),
    "Unsupported wind tunnel fixture must identify all three exits as floating."
  );
  var disappearedExits = unsupportedGrid.removeFloatingCells(unsupportedExits);
  assert(disappearedExits.length === 3, "Unsupported wind tunnel exits must be removed immediately from the grid.");
  var dropManager = new GameManager();
  dropManager._registerResolutionDrops(disappearedExits, unsupportedGrid, dropManager.lastResolution);
  assert(dropManager.systems.fallingMarbleSystem.hasActiveDrops() === false, "Unsupported wind tunnel exits must not enter the falling system.");
  assert(unsupportedGrid.getWindTunnelExits().length === 0, "All unsupported wind tunnel exits must disappear.");
  assert(unsupportedGrid.getWindTunnelEntrance() === null, "Last exit removal must disable the entrance logic immediately.");
  assert(unsupportedGrid.getClosingWindTunnelEntrance().closingFrameIndex === 0, "Entrance disappearance must begin at air_intake_01.");
  var closingEntranceSnapshot = unsupportedGrid.getSpecialEntities().filter(function (entity) {
    return entity.entityType === "wind_tunnel_entrance" && entity.closing === true;
  })[0];
  assert(closingEntranceSnapshot && closingEntranceSnapshot.lockChainProtected === false, "Closing wind tunnel entrance snapshot must expose boolean lockChainProtected state.");
  unsupportedGrid.updateWindTunnel(SpecialAnimationTiming.windTunnel.entranceDisappearFrameDuration, function () { return 0; }, true);
  assert(unsupportedGrid.getClosingWindTunnelEntrance().closingFrameIndex === 1, "Entrance disappearance must advance to air_intake_02.");
  unsupportedGrid.updateWindTunnel(
    SpecialAnimationTiming.windTunnel.entranceDisappearDuration - SpecialAnimationTiming.windTunnel.entranceDisappearFrameDuration - 0.001,
    function () { return 0; },
    true
  );
  assert(unsupportedGrid.getClosingWindTunnelEntrance().closingFrameIndex === 4, "Entrance disappearance must show air_intake_05 before removal.");
  unsupportedGrid.updateWindTunnel(0.001, function () { return 0; }, true);
  assert(unsupportedGrid.getClosingWindTunnelEntrance() === null, "Entrance visual must disappear after all five frames.");
}

function validateFullLandingFinalization() {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var levelConfig = buildLevel();
  var manager = new GameManager();
  manager.bootstrap();
  manager.startLevel(levelConfig, {
    seed: "wind_tunnel_finalize_validation",
    attemptIndex: 1,
    runMode: "wind_tunnel_validation"
  });
  manager._resolveFairyAssistsAfterResolution = function () {};
  manager.shotsFired = 1;
  var grid = manager.systems.bubbleGrid;
  var entrance = grid.getWindTunnelEntrance();
  var entrancePosition = grid.getCellPosition(entrance.row, entrance.col);
  var origin = { x: entrancePosition.x, y: entrancePosition.y - 180 };
  var plan = manager.systems.trajectoryPredictor.predictShotPlan(grid, origin, { x: 0, y: 1 });
  assert(plan.hitType === "wind_tunnel", "Full finalization fixture must hit the wind tunnel entrance.");
  manager._completeAuthoritativeShotPlan(plan, grid);
  manager.activeProjectile = {
    position: plan.pathPoints[plan.pathPoints.length - 1],
    color: "R",
    ball: {
      ballCategory: "normal",
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    },
    speed: BoardLayout.projectileSpeed,
    pathPoints: plan.pathPoints,
    segmentIndex: plan.pathPoints.length - 1,
    segmentProgress: 0,
    destroyedTransparentBalls: [],
    colorCloudInsideIds: {},
    scale: 1,
    targetCell: null,
    shotPlan: plan
  };
  manager._finalizePlannedShot();
  assert(manager.activeProjectile.windTunnelTransit, "Entrance finalization must begin transit instead of attaching.");
  var destination = manager.activeProjectile.windTunnelTransit.exit;
  var entryDirection = manager.activeProjectile.windTunnelTransit.direction;
  manager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.inhaleDuration);
  manager._updateWindTunnelTransit(SpecialAnimationTiming.windTunnel.exhaleDuration);
  var continuationPlan = manager.activeProjectile.shotPlan;
  assert(
    Math.abs(continuationPlan.direction.x - entryDirection.x) < 0.000001 &&
    Math.abs(continuationPlan.direction.y - entryDirection.y) < 0.000001,
    "Full finalization must preserve the entrance impact direction after emission."
  );
  assert(continuationPlan.targetCell, "Full finalization continuation must resolve a landing target from the exit path.");
  assert(
    continuationPlan.targetCell.row === destination.row && continuationPlan.targetCell.col === destination.col,
    "Blocked outgoing flight must land on and block the emitting exit."
  );
  var outgoingTarget = {
    row: continuationPlan.targetCell.row,
    col: continuationPlan.targetCell.col
  };
  manager.activeProjectile.position = continuationPlan.pathPoints[continuationPlan.pathPoints.length - 1];
  manager.activeProjectile.segmentIndex = continuationPlan.pathPoints.length - 1;
  manager.activeProjectile.segmentProgress = 0;
  manager._finalizePlannedShot();
  assert(
    manager.lastResolution.attachedCell &&
    manager.lastResolution.attachedCell.row === outgoingTarget.row &&
    manager.lastResolution.attachedCell.col === outgoingTarget.col &&
    manager.lastResolution.attachedCell.color === "R",
    "Transit must re-run ordinary landing at the continued trajectory target."
  );
  assert(!grid.hasWindTunnelExitAt(destination.row, destination.col), "Landing on the emitting exit must remove that exit before attachment.");
  assert(grid.getWindTunnelExits().length === 2, "Exit-coordinate landing must remove exactly the emitting exit.");
  assert(manager.lastResolution.windTunnelTransits.length === 1, "Final resolution must record one wind tunnel transit.");
  assert(manager.lastResolution.windTunnelExitsRemoved.length === 1, "Exit-coordinate landing must record the blocked emitting exit.");
}

function validateAssetsAndRenderingContracts() {
  [
    "wind_tunnel_entrance",
    "inactive_exit",
    "activated_exit",
    "air_intake_01",
    "air_intake_02",
    "air_intake_03",
    "air_intake_04",
    "air_intake_05"
  ].forEach(function (assetName) {
    var assetPath = path.join(ROOT, "assets/game/image/special_item/" + assetName + ".png");
    assert(fs.existsSync(assetPath), "Wind tunnel asset is missing: " + assetName + ".png.");
    assert(fs.existsSync(assetPath + ".meta"), "Wind tunnel asset meta is missing: " + assetName + ".png.meta.");
  });
  var gameEntrancePath = path.join(ROOT, "assets/game/image/special_item/wind_tunnel_entrance.png");
  var uiEntrancePath = path.join(ROOT, "assets/ui/image/preview_balls/wind_tunnel_entrance.png");
  assert(fs.existsSync(uiEntrancePath), "Wind tunnel UI introduction icon is missing.");
  assert(fs.existsSync(uiEntrancePath + ".meta"), "Wind tunnel UI introduction icon meta is missing.");
  assert(
    fs.readFileSync(gameEntrancePath).equals(fs.readFileSync(uiEntrancePath)),
    "Wind tunnel game and UI entrance icons must remain byte-identical."
  );
  var windAudioPath = path.join(ROOT, "assets/audio/sound/wind.mp3");
  assert(fs.existsSync(windAudioPath), "Wind tunnel ambient audio is missing: wind.mp3.");
  assert(fs.existsSync(windAudioPath + ".meta"), "Wind tunnel ambient audio meta is missing: wind.mp3.meta.");
  var inhalationAudioPath = path.join(ROOT, "assets/audio/sound/inhalation.mp3");
  assert(fs.existsSync(inhalationAudioPath), "Wind tunnel entry audio is missing: inhalation.mp3.");
  assert(fs.existsSync(inhalationAudioPath + ".meta"), "Wind tunnel entry audio meta is missing: inhalation.mp3.meta.");
  var spitOutAudioPath = path.join(ROOT, "assets/audio/sound/spit_out.mp3");
  assert(fs.existsSync(spitOutAudioPath), "Wind tunnel exit audio is missing: spit_out.mp3.");
  assert(fs.existsSync(spitOutAudioPath + ".meta"), "Wind tunnel exit audio meta is missing: spit_out.mp3.meta.");
  var selectorSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererStateSelectors.js"), "utf8");
  var resourceSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  var boardVisualSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererWindTunnelBoardVisuals.js"), "utf8");
  var bootstrapAudioSource = fs.readFileSync(path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapAudioMethods.js"), "utf8");
  assert(selectorSource.indexOf('? "WIND_TUNNEL_EXIT_ACTIVE" : "WIND_TUNNEL_EXIT_INACTIVE"') >= 0, "Exit visual must branch on active state.");
  assert(resourceSource.indexOf('WIND_TUNNEL_EXIT_ACTIVE: "game/image/special_item/activated_exit"') >= 0, "Active wind tunnel exit must use activated_exit.");
  assert(selectorSource.indexOf('return "AIR_INTAKE_0" + (ballLike.closingFrameIndex + 1)') >= 0, "Entrance disappearance must select air_intake_01-05 by frame.");
  assert(boardVisualSource.indexOf("cc.rotateBy(timing.entranceIdleRotationDuration, 360)") >= 0, "Idle wind tunnel entrance must loop clockwise rotation.");
  assert(
    bootstrapAudioSource.indexOf("windTunnelAmbient: this.windTunnelSfxResource") >= 0,
    "Audio config must map the wind tunnel ambient key to windTunnelSfxResource."
  );
  assert(
    bootstrapAudioSource.indexOf("windTunnelInhalation: this.windTunnelInhalationSfxResource") >= 0,
    "Audio config must map the wind tunnel entry key to windTunnelInhalationSfxResource."
  );
  assert(
    bootstrapAudioSource.indexOf("windTunnelSpitOut: this.windTunnelSpitOutSfxResource") >= 0,
    "Audio config must map the wind tunnel exit key to windTunnelSpitOutSfxResource."
  );
}

function validateWindTunnelTransitAudioEvents() {
  var playedSfxKeys = [];
  var trackedEventTypes = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function (event) {
      trackedEventTypes.push(event.type);
    },
    _playSfx: function (key) {
      playedSfxKeys.push(key);
    }
  }, {
    runtimeEvents: [
      {
        id: 1,
        type: "wind_tunnel_projectile_entered",
        entranceId: "wind_tunnel_entrance_test_01",
        entranceRow: 8,
        entranceCol: 5,
        exitId: "wind_tunnel_exit_test_02",
        exitRow: 3,
        exitCol: 7
      },
      {
        id: 2,
        type: "wind_tunnel_projectile_exited",
        entranceId: "wind_tunnel_entrance_test_01",
        entranceRow: 8,
        entranceCol: 5,
        exitId: "wind_tunnel_exit_test_02",
        exitRow: 3,
        exitCol: 7
      }
    ]
  });
  assert(
    trackedEventTypes.length === 2 &&
    trackedEventTypes[0] === "wind_tunnel_projectile_entered" &&
    trackedEventTypes[1] === "wind_tunnel_projectile_exited",
    "Wind tunnel entry and exit audio events must remain visible to runtime telemetry tracking."
  );
  assert(
    playedSfxKeys.length === 2 &&
    playedSfxKeys[0] === "windTunnelInhalation" &&
    playedSfxKeys[1] === "windTunnelSpitOut",
    "Each authoritative wind tunnel transit must play inhalation and spit_out once in order."
  );
}

function validateWindTunnelAmbientAudioLifecycle() {
  var grid = buildGrid(buildLevel());
  var liveSnapshot = {
    board: {
      specialEntities: grid.getSpecialEntities()
    }
  };
  var playCalls = [];
  var stopCalls = [];
  var audioHost = {
    _windTunnelAmbientRequested: false,
    audioManager: {
      playExclusiveSfx: function (channelName, key, options) {
        playCalls.push({
          channelName: channelName,
          key: key,
          loop: options.loop
        });
        return Promise.resolve(17);
      },
      stopExclusiveSfx: function (channelName) {
        stopCalls.push(channelName);
        return true;
      }
    }
  };
  audioHost._stopWindTunnelAmbientSfx = function () {
    return GameBootstrapAudioMethods._stopWindTunnelAmbientSfx.call(audioHost);
  };

  return GameBootstrapAudioMethods._startWindTunnelAmbientSfx.call(audioHost, liveSnapshot).then(function (audioId) {
    assert(audioId === 17, "Wind tunnel ambient audio must expose the exclusive playback id.");
    assert(audioHost._windTunnelAmbientRequested === true, "Wind tunnel ambient lifecycle must become active after countdown playback starts.");
    assert(
      playCalls.length === 1 &&
      playCalls[0].channelName === "windTunnelAmbient" &&
      playCalls[0].key === "windTunnelAmbient" &&
      playCalls[0].loop === true,
      "Wind tunnel ambient audio must use one looping exclusive channel."
    );

    grid.getWindTunnelExits().slice().forEach(function (exit) {
      grid.blockWindTunnelExitAt(exit.row, exit.col);
    });
    var closingSnapshot = {
      board: {
        specialEntities: grid.getSpecialEntities()
      }
    };
    assert(
      closingSnapshot.board.specialEntities.some(function (entity) {
        return entity.entityType === "wind_tunnel_entrance" && entity.closing === true;
      }),
      "Wind tunnel ambient fixture must retain the closing entrance through air_intake_01-05."
    );
    assert(
      GameBootstrapAudioMethods._syncWindTunnelAmbientSfxForRuntimeSnapshot.call(audioHost, closingSnapshot) === false,
      "Wind tunnel ambient audio must continue throughout the entrance closing animation."
    );
    assert(stopCalls.length === 0, "Closing entrance frames must not stop wind tunnel ambient audio.");

    grid.updateWindTunnel(
      SpecialAnimationTiming.windTunnel.entranceDisappearDuration,
      function () { return 0; },
      true
    );
    var disappearedSnapshot = {
      board: {
        specialEntities: grid.getSpecialEntities()
      }
    };
    assert(
      disappearedSnapshot.board.specialEntities.every(function (entity) {
        return entity.entityType !== "wind_tunnel_entrance";
      }),
      "Wind tunnel ambient fixture must remove the entrance after the fifth closing frame."
    );
    assert(
      GameBootstrapAudioMethods._syncWindTunnelAmbientSfxForRuntimeSnapshot.call(audioHost, disappearedSnapshot) === true,
      "Wind tunnel ambient audio must stop when the entrance runtime entity disappears."
    );
    assert(
      stopCalls.length === 1 && stopCalls[0] === "windTunnelAmbient",
      "Wind tunnel ambient lifecycle must stop its exclusive channel exactly once."
    );
    assert(audioHost._windTunnelAmbientRequested === false, "Stopped wind tunnel ambient lifecycle must clear its active state.");

    var countdownOrder = [];
    var interactionWarmupResolved = false;
    var resolveInteractionWarmup;
    var resolveWindStarted;
    var windStartedPromise = new Promise(function (resolve) {
      resolveWindStarted = resolve;
    });
    var countdownSnapshot = {
      board: {
        specialEntities: buildGrid(buildLevel()).getSpecialEntities()
      }
    };
    var countdownHost = {
      windTunnelSfxResource: "sound/wind",
      windTunnelInhalationSfxResource: "sound/inhalation",
      windTunnelSpitOutSfxResource: "sound/spit_out",
      spiderCrawlingSfxResource: "sound/spider_crawling",
      gameManager: {
        getRuntimeSnapshot: function () {
          return countdownSnapshot;
        }
      },
      levelRenderer: {
        hasPendingSpiderEntrance: function () { return false; },
        playGameEntryCountdown: function () {
          countdownOrder.push("countdown_animation");
          return Promise.resolve(null);
        },
        warmupGameplayInteractionAssets: function () {
          countdownOrder.push("interaction_warmup");
          return new Promise(function (resolve) {
            resolveInteractionWarmup = function () {
              interactionWarmupResolved = true;
              resolve(null);
            };
          });
        }
      },
      audioManager: {
        preloadPaths: function (paths) {
          countdownOrder.push("preload:" + paths.join(","));
          return Promise.resolve(paths.map(function (audioPath) {
            return { path: audioPath };
          }));
        }
      },
      _stopWindTunnelAmbientSfx: function () {
        countdownOrder.push("stop_previous_wind");
        return false;
      },
      _playSfx: function (key) {
        assert(key === "gameEntryCountdown", "Countdown must retain its configured SFX key.");
        countdownOrder.push("countdown_sfx");
      },
      _startWindTunnelAmbientSfx: function (snapshot) {
        assert(snapshot === countdownSnapshot, "Countdown must start wind from its authoritative runtime snapshot.");
        assert(interactionWarmupResolved === false, "Wind loop must not wait for slower interaction warmup after countdown completion.");
        countdownOrder.push("wind_loop");
        resolveWindStarted();
        return Promise.resolve(19);
      },
      _runSpiderEntranceAfterCountdown: function () {
        throw new Error("Wind-only countdown fixture must not run spider entrance playback.");
      }
    };

    var countdownReadinessPromise = GameBootstrapAudioMethods._runGameEntryCountdown.call(countdownHost);
    return windStartedPromise.then(function () {
      var countdownAnimationIndex = countdownOrder.indexOf("countdown_animation");
      var interactionWarmupIndex = countdownOrder.indexOf("interaction_warmup");
      var windLoopIndex = countdownOrder.indexOf("wind_loop");
      assert(
        countdownOrder.indexOf("preload:sound/wind,sound/inhalation,sound/spit_out") >= 0,
        "Wind ambient, inhalation and spit_out audio must preload before the entry countdown starts."
      );
      assert(countdownAnimationIndex >= 0 && interactionWarmupIndex >= 0, "Entry countdown and interaction warmup must both run.");
      assert(
        windLoopIndex > countdownAnimationIndex && windLoopIndex > interactionWarmupIndex,
        "Wind tunnel ambient loop must start only after the entry countdown completes."
      );
      assert(interactionWarmupResolved === false, "Wind audio must start immediately after countdown while slower interaction warmup is still pending.");
      resolveInteractionWarmup();
      return countdownReadinessPromise;
    });
  });
}

Promise.resolve().then(function () {
  validateConfigAndCodec();
  validateEditorRoundTrip();
  validateRuntimeStateAndTransit();
  validateFullLandingFinalization();
  validateAssetsAndRenderingContracts();
  validateWindTunnelTransitAudioEvents();
  return validateWindTunnelAmbientAudioLifecycle();
}).then(function () {
  console.log("[OK] wind_tunnel runtime, direction-preserving flight, traversal, removal, visuals, wind loop, inhalation and one-shot spit_out exit audio validated");
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
