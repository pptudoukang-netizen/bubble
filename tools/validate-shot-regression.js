"use strict";

var fs = require("fs");
var path = require("path");
var readGameplaySourceFamily = require("./read-gameplay-source-family").readGameplaySourceFamily;

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var AimTuningProfiles = require("../assets/scripts/config/AimTuningProfiles");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var RuntimeGameManager = require("../gameplay-src/core/GameManager");
var EliminationSequenceBuilder = require("../gameplay-src/core/EliminationSequenceBuilder");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var LevelPackManifest = require("../assets/scripts/config/LevelPackManifest");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var StarRatingPolicy = require("../assets/scripts/core/StarRatingPolicy");
var ShooterController = require("../gameplay-src/systems/ShooterController");
var TrajectoryPredictor = require("../gameplay-src/systems/TrajectoryPredictor");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var BubbleBreakSfxPolicy = require("../assets/scripts/audio/BubbleBreakSfxPolicy");
var AudioManager = require("../assets/scripts/audio/AudioManager");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var AdRewardCatalog = require("../assets/scripts/services/AdRewardCatalog");
var AdRevivePolicy = require("../gameplay-src/core/AdRevivePolicy");
var attachLevelRendererScenePopupMethods = require("../gameplay-src/render/LevelRendererScenePopupMethods");
var attachLevelRendererSceneHudMethods = require("../gameplay-src/render/LevelRendererSceneHudMethods");

function GameManager() {
  var manager = new RuntimeGameManager();
  manager.setEquippedAssistSpirit("milu", 1);
  return manager;
}

GameManager.prototype = RuntimeGameManager.prototype;

function createInactiveTrappedSpriteRescueSystemFixture() {
  return {
    isActive: function () {
      return false;
    },
    isRotating: function () {
      return false;
    },
    isMultiTargetActive: function () {
      return false;
    },
    isMultiTargetCompleted: function () {
      return false;
    },
    update: function () {
      return {
        changed: false,
        completed: false
      };
    },
    snapshotForRender: function () {
      return {
        active: false,
        phase: "idle",
        revision: 0
      };
    }
  };
}

function syncHudBottomLineYForValidation() {
  if (typeof BoardLayout.boardStartY !== "number" || !isFinite(BoardLayout.boardStartY)) {
    throw new Error("Validation requires BoardLayout.boardStartY.");
  }
  if (typeof BoardLayout.bubbleRadius !== "number" || !isFinite(BoardLayout.bubbleRadius)) {
    throw new Error("Validation requires BoardLayout.bubbleRadius.");
  }
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
}

function runTimedAndShotLimitedReviveCase() {
  var timedLevelConfig = {
    level: {
      playMode: "timed_infinite_shots"
    }
  };
  var timedPlan = AdRevivePolicy.buildRevivePlan(timedLevelConfig, null);
  if (timedPlan.grantedShots !== 0 || timedPlan.grantedTimeSeconds !== 10 || timedPlan.description !== "+10秒") {
    throw new Error("Timed revive plan must grant exactly 10 seconds and zero balls.");
  }
  var timedPresentation = attachLevelRendererScenePopupMethods.buildLoseRevivePresentation(timedLevelConfig, timedPlan);
  if (timedPresentation.description !== "规定时间内通关" || timedPresentation.descriptionX !== 0 || timedPresentation.showBall !== false || timedPresentation.iconType !== null) {
    throw new Error("Timed LoseView revive presentation must center 规定时间内通关 and hide handsel_ball.");
  }
  var timedRewardEntry = AdRewardCatalog.resolveLoseRewardEntry("lost_objective");
  if (!timedRewardEntry || timedRewardEntry.grantMode !== "current_round_revive") {
    throw new Error("Timed lost_objective must expose a current-round revive entry.");
  }

  var timedManager = new GameManager();
  timedManager.currentLevel = timedLevelConfig;
  timedManager.isTimedInfiniteShots = true;
  timedManager.state = "lost_objective";
  timedManager.remainingShots = 0;
  timedManager.remainingTimeMs = 0;
  timedManager.timeLimitMs = 90000;
  timedManager.systems.bubbleGrid = {
    getCells: function () {
      return [];
    }
  };
  timedManager.getRuntimeSnapshot = function (events) {
    return {
      state: this.state,
      remainingShots: this.remainingShots,
      remainingTimeMs: this.remainingTimeMs,
      runtimeEvents: Array.isArray(events) ? events : []
    };
  };
  var timedResult = timedManager.reviveFromAd();
  if (timedManager.state !== "running" || timedResult.remainingTimeMs !== 10000) {
    throw new Error("Timed revive must resume running with exactly 10 seconds remaining.");
  }
  if (timedResult.grantedTimeSeconds !== 10 || timedResult.grantedShots !== 0 || timedResult.remainingShots !== 0) {
    throw new Error("Timed revive result must not grant or report shot supply.");
  }

  var shotLevelConfig = {
    level: {
      playMode: "shot_limited",
      colors: ["R", "G"],
      bonusObjectives: [],
      winConditions: [
        { type: "collect_color", color: "R", value: 5 }
      ]
    }
  };
  var shotRuntimeSnapshot = {
    board: {
      cells: [
        { color: "R" }
      ]
    },
    objectives: {
      progress: 0,
      target: 5
    }
  };
  var shotPlan = AdRevivePolicy.buildRevivePlan(shotLevelConfig, shotRuntimeSnapshot);
  var shotPresentation = attachLevelRendererScenePopupMethods.buildLoseRevivePresentation(shotLevelConfig, shotPlan);
  if (shotPlan.grantedShots !== 10 || shotPlan.grantedTimeSeconds !== 0) {
    throw new Error("Shot-limited revive plan must grant exactly 10 balls and zero seconds.");
  }
  if (shotPresentation.description !== "赠送10球" || shotPresentation.descriptionX !== 32 || shotPresentation.showBall !== true || shotPresentation.iconType !== "ball") {
    throw new Error("Shot-limited LoseView revive presentation must use x=32 and show handsel_ball.");
  }

  var rescueLevelConfig = {
    level: {
      playMode: "shot_limited",
      levelType: "trapped_sprite_rescue",
      colors: ["R", "G"],
      bonusObjectives: [],
      winConditions: [
        { type: "clear_all", value: 1 }
      ],
      trappedSpriteRescue: {
        spiritId: "milu"
      }
    }
  };
  var rescueRuntimeSnapshot = {
    board: {
      cells: [
        { color: "R" },
        { color: "G" }
      ]
    },
    objectives: {
      progress: 0,
      target: 0
    }
  };
  var rescuePlan = AdRevivePolicy.buildRevivePlan(rescueLevelConfig, rescueRuntimeSnapshot);
  if (
    rescuePlan.grantedShots !== 10 ||
    rescuePlan.grantedTimeSeconds !== 0 ||
    rescuePlan.targetColor !== null ||
    rescuePlan.targetColorBallCount !== 0 ||
    rescuePlan.randomBallCount !== 2 ||
    rescuePlan.description !== "增加随机球x10"
  ) {
    throw new Error("Trapped sprite rescue revive must grant ten shots with two random supply balls.");
  }
  var rescuePresentation = attachLevelRendererScenePopupMethods.buildLoseRevivePresentation(rescueLevelConfig, rescuePlan);
  if (rescuePresentation.description !== "赠送10球" || rescuePresentation.descriptionX !== 32 || rescuePresentation.showBall !== true || rescuePresentation.iconType !== "ball") {
    throw new Error("Trapped sprite rescue LoseView revive presentation must retain the normal ten-ball reward.");
  }
  var rescueClearanceTargetPresentation = attachLevelRendererScenePopupMethods.buildLoseClearanceTargetPresentation(rescueLevelConfig);
  if (!rescueClearanceTargetPresentation || rescueClearanceTargetPresentation.description !== "救出精灵" || rescueClearanceTargetPresentation.spiritId !== "milu") {
    throw new Error("Trapped sprite rescue LoseView clearance target must display the trapped spirit and 救出精灵.");
  }
  if (attachLevelRendererScenePopupMethods.getSpriteFrameWidthAtHeight({
    getOriginalSize: function () {
      return { width: 120, height: 80 };
    }
  }, 65, "validation") !== 97.5) {
    throw new Error("Trapped sprite LoseView clearance target width must preserve its original aspect ratio at height 65.");
  }

  var shotManager = new GameManager();
  shotManager.currentLevel = shotLevelConfig;
  shotManager.isTimedInfiniteShots = false;
  shotManager.state = "out_of_shots";
  shotManager.remainingShots = 0;
  shotManager.remainingTimeMs = 0;
  shotManager.systems.bubbleGrid = {
    getCells: function () {
      return shotRuntimeSnapshot.board.cells.slice();
    }
  };
  shotManager.systems.shooterController = {
    setUpcomingNormalBalls: function (color, count) {
      return { accepted: color === "R" && count === 2 };
    },
    setUpcomingRandomNormalBalls: function () {
      throw new Error("Shot-limited target objective must not request random revive balls.");
    }
  };
  shotManager._buildPrimaryObjectiveSnapshot = function () {
    return shotRuntimeSnapshot.objectives;
  };
  shotManager._getCachedJarSnapshot = function () {
    return {};
  };
  shotManager.getRuntimeSnapshot = timedManager.getRuntimeSnapshot;
  var shotResult = shotManager.reviveFromAd();
  if (shotManager.state !== "running" || shotResult.remainingShots !== 10 || shotResult.grantedTimeSeconds !== 0) {
    throw new Error("Shot-limited revive must resume running with exactly 10 granted shots.");
  }

  var rescueManager = new GameManager();
  rescueManager.currentLevel = rescueLevelConfig;
  rescueManager.isTimedInfiniteShots = false;
  rescueManager.state = "out_of_shots";
  rescueManager.remainingShots = 0;
  rescueManager.remainingTimeMs = 0;
  rescueManager.systems.bubbleGrid = {
    getCells: function () {
      return rescueRuntimeSnapshot.board.cells.slice();
    }
  };
  rescueManager.systems.shooterController = {
    setUpcomingNormalBalls: function () {
      throw new Error("Trapped sprite rescue revive must not request target-color balls.");
    },
    setUpcomingRandomNormalBalls: function (count) {
      return { accepted: count === 2 };
    }
  };
  rescueManager._buildPrimaryObjectiveSnapshot = function () {
    return rescueRuntimeSnapshot.objectives;
  };
  rescueManager._getCachedJarSnapshot = function () {
    return {};
  };
  rescueManager.getRuntimeSnapshot = timedManager.getRuntimeSnapshot;
  var rescueResult = rescueManager.reviveFromAd();
  if (rescueManager.state !== "running" || rescueResult.remainingShots !== 10 || rescueResult.grantedTimeSeconds !== 0) {
    throw new Error("Trapped sprite rescue revive must resume running with exactly ten granted shots.");
  }
}

function runTimedTimeBonusBallSettlementCase() {
  var manager = new GameManager();
  var events = [];
  manager.isTimedInfiniteShots = true;
  manager.state = "running";
  manager.remainingTimeMs = 3000;
  manager.grantedTimeBonusCellIds = {};
  manager._pushRuntimeEvent = function (type, data) {
    events.push({ type: type, data: data });
  };

  manager._grantTimeBonusForRemovedCells([
    {
      id: "2_4",
      row: 2,
      col: 4,
      entityCategory: "normal_ball",
      timeBonusSeconds: 5
    }
  ], "floating_drop");
  if (manager.remainingTimeMs !== 8000) {
    throw new Error("Timed time bonus ball must add five seconds without an upper cap.");
  }
  if (events.length !== 1 || events[0].type !== "time_bonus_awarded" ||
      events[0].data.reason !== "floating_drop" || events[0].data.granted_time_seconds !== 5 ||
      events[0].data.remaining_time_ms !== 8000 || !Array.isArray(events[0].data.cells) ||
      events[0].data.cells.length !== 1 || events[0].data.cells[0].id !== "2_4" ||
      events[0].data.cells[0].row !== 2 || events[0].data.cells[0].col !== 4 ||
      events[0].data.cells[0].bonusSeconds !== 5) {
    throw new Error("Timed time bonus ball must emit an exact floating-drop runtime event.");
  }

  var duplicateRejected = false;
  try {
    manager._grantTimeBonusForRemovedCells([
      {
        id: "2_4",
        row: 2,
        col: 4,
        entityCategory: "normal_ball",
        timeBonusSeconds: 5
      }
    ], "elimination");
  } catch (error) {
    duplicateRejected = /more than once/.test(error.message);
  }
  if (!duplicateRejected) {
    throw new Error("Timed time bonus ball must reject duplicate settlement.");
  }
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

var LEVEL_DIR = path.resolve(__dirname, "../assets/map/config/levels");
var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");
var MANIFEST_PATH = path.resolve(REMOTE_PACK_DIR, "level_manifest.json");

function createKeyUnlockRegressionManager() {
  var SupportSystem = require("../gameplay-src/systems/SupportSystem");
  var manager = new GameManager();
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
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
    floating: [],
    spiritCocoonOpenings: []
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
  if (pack.format !== LevelPackManifest.PACK_FORMAT_COMPACT_V2) {
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

function runReflectedShotDoesNotTunnelPastFirstCollisionCase() {
  var levelConfig = createLevelConfig(1);
  var grid = createGridWithViewport(levelConfig);
  var predictor = new TrajectoryPredictor();
  predictor.initialize({});
  predictor.configureLevel(levelConfig);

  var origin = {
    x: BoardLayout.shooterOrigin.x,
    y: BoardLayout.shooterOrigin.y
  };
  var plan = predictor.predictShotPlan(
    grid,
    origin,
    normalizeDirection(origin, { x: 540, y: 100 })
  );

  if (!plan || !plan.valid || plan.wallBounceCount !== 1) {
    throw new Error("Reflected-shot fixture must produce exactly one wall bounce.");
  }
  if (!plan.collidedCell || plan.collidedCell.row !== 7 || plan.collidedCell.col !== 7) {
    throw new Error("Reflected shot must attach from its first physical collision instead of tunneling past it.");
  }
  if (!plan.targetCell || plan.targetCell.row !== 8 || plan.targetCell.col !== 8) {
    throw new Error("Reflected shot must retain the first collision's legal attachment cell.");
  }
}

function runTransparentBallPassThroughAndSettlementCase() {
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  var dedicatedRawConfig = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../assets/map/config/levels/level_transparent_ball_test.json"),
    "utf8"
  ));
  var dedicatedConfig = LevelConfigLoader.normalizeLevelConfig(
    dedicatedRawConfig,
    "level_transparent_ball_test"
  );
  if (
    dedicatedConfig.level.specialEntities.length !== 1 ||
    dedicatedConfig.level.specialEntities[0].entityCategory !== "reactive_ball" ||
    dedicatedConfig.level.specialEntities[0].entityType !== "transparent_ball"
  ) {
    throw new Error("Dedicated transparent ball test level must isolate one transparent ball.");
  }
  var dedicatedGrid = createGridWithViewport(dedicatedConfig);
  var dedicatedTransparent = dedicatedConfig.level.specialEntities[0];
  var dedicatedTransparentPosition = dedicatedGrid.getCellPosition(
    dedicatedTransparent.row,
    dedicatedTransparent.col
  );
  var planningManager = new GameManager();
  planningManager.state = "running";
  planningManager.activeProjectile = null;
  planningManager.isAiming = true;
  planningManager._isBoardAdvanceBusy = function () { return false; };
  planningManager._hasPendingSplitterSpawns = function () { return false; };
  planningManager._hasPendingMolotovBlasts = function () { return false; };
  planningManager._hasPendingSpiritCocoonOpenings = function () { return false; };
  planningManager._hasPendingSwirlRotation = function () { return false; };
  planningManager._hasPendingWormholeShift = function () { return false; };
  planningManager._hasPendingVineCast = function () { return false; };
  planningManager.systems = {
    bubbleGrid: dedicatedGrid,
    trajectoryPredictor: new TrajectoryPredictor(),
    shooterController: {
      origin: {
        x: BoardLayout.shooterOrigin.x,
        y: BoardLayout.shooterOrigin.y
      },
      aimDirection: normalizeDirection(BoardLayout.shooterOrigin, dedicatedTransparentPosition)
    }
  };
  planningManager._refreshShotPlan(true);
  var attachmentPlan = planningManager.pendingShotPlan;
  var collidedBehindTransparent = !!(
    attachmentPlan &&
    attachmentPlan.collidedCell &&
    attachmentPlan.collidedCell.entityCategory === "normal_ball" &&
    dedicatedGrid.getNeighborCoordinates(
      dedicatedTransparent.row,
      dedicatedTransparent.col
    ).some(function (coord) {
      return (
        coord.row === attachmentPlan.collidedCell.row &&
        coord.col === attachmentPlan.collidedCell.col
      );
    })
  );
  if (
    !attachmentPlan ||
    attachmentPlan.hitType !== "bubble" ||
    !collidedBehindTransparent
  ) {
    throw new Error(
      "Transparent ball test shot must terminate at the rear solid ball: " +
      JSON.stringify({
        hitType: attachmentPlan && attachmentPlan.hitType,
        collidedCell: attachmentPlan && attachmentPlan.collidedCell,
        targetCell: attachmentPlan && attachmentPlan.targetCell
      })
    );
  }
  if (
    !attachmentPlan.targetCell ||
    attachmentPlan.targetCell.row !== dedicatedTransparent.row ||
    attachmentPlan.targetCell.col !== dedicatedTransparent.col ||
    !attachmentPlan.transparentAttachmentTarget ||
    attachmentPlan.transparentAttachmentTarget.id !== dedicatedTransparent.id
  ) {
    throw new Error("Shot through a transparent ball must attach in that transparent ball's original cell.");
  }
  var attachmentPathEnd = attachmentPlan.pathPoints[attachmentPlan.pathPoints.length - 1];
  if (
    Math.abs(attachmentPathEnd.x - dedicatedTransparentPosition.x) > 0.5 ||
    Math.abs(attachmentPathEnd.y - dedicatedTransparentPosition.y) > 0.5
  ) {
    throw new Error("Transparent ball shot path must end at the destroyed transparent ball cell.");
  }

  var rawConfig = loadLevelRaw(1);
  rawConfig.level.specialEntities.push({
    id: "transparent_ball_validation",
    entityCategory: "reactive_ball",
    entityType: "transparent_ball",
    row: 6,
    col: 5
  });
  var normalizedConfig = LevelConfigLoader.normalizeLevelConfig(rawConfig, "level_001");
  var normalizedTransparent = normalizedConfig.level.specialEntities.filter(function (entity) {
    return entity.id === "transparent_ball_validation";
  });
  if (
    normalizedTransparent.length !== 1 ||
    normalizedTransparent[0].entityCategory !== "reactive_ball" ||
    normalizedTransparent[0].entityType !== "transparent_ball"
  ) {
    throw new Error("Transparent ball level config normalization failed.");
  }
  var collisionConfig = createLevelConfig(1);
  collisionConfig.level.layout = [
    ".....R.....",
    "..........",
    ".....R.....",
    "..........",
    "...........",
    "..........",
    "...........",
    ".........."
  ];
  collisionConfig.level.specialEntities = [{
    id: "transparent_path",
    entityCategory: "reactive_ball",
    entityType: "transparent_ball",
    row: 6,
    col: 5
  }];
  var grid = createGridWithViewport(collisionConfig);
  var transparentPosition = grid.getCellPosition(6, 5);
  var blockerPosition = grid.getCellPosition(2, 5);
  var startPoint = {
    x: transparentPosition.x,
    y: transparentPosition.y - BoardLayout.bubbleDiameter * 2
  };
  var endPoint = {
    x: blockerPosition.x,
    y: blockerPosition.y + BoardLayout.bubbleDiameter
  };
  var blockingCollision = grid.findCollisionOnSegment(startPoint, endPoint, BoardLayout.collisionDistance - 4);
  if (!blockingCollision || blockingCollision.cell.entityType === "transparent_ball") {
    throw new Error("Transparent ball must not stop the projectile collision path.");
  }
  var penetrated = grid.findTransparentBallCollisionsOnPath(
    [startPoint, blockingCollision.point],
    BoardLayout.collisionDistance - 4
  );
  if (penetrated.length !== 1 || penetrated[0].id !== "transparent_path") {
    throw new Error("Projectile path must record the transparent ball it crosses.");
  }
  if (
    !Number.isInteger(penetrated[0].pathSegmentIndex) ||
    !Number.isFinite(penetrated[0].pathSegmentProgress) ||
    penetrated[0].pathSegmentProgress <= 0
  ) {
    throw new Error("Transparent ball path record must include exact projectile progress.");
  }

  var manager = new GameManager();
  manager.score = 0;
  manager.comboStreak = 1;
  manager.maxComboStreak = 1;
  manager.pendingRuntimeEvents = [];
  var liveTransparentForFlight = {
    id: "transparent_path",
    row: 6,
    col: 5,
    entityCategory: "reactive_ball",
    entityType: "transparent_ball"
  };
  var flightProjectile = {
    shotPlan: {
      penetratedTransparentBalls: penetrated
    },
    segmentIndex: penetrated[0].pathSegmentIndex,
    segmentProgress: penetrated[0].pathSegmentProgress,
    destroyedTransparentBalls: []
  };
  var flightRemoved = false;
  manager._destroyReachedTransparentBalls(flightProjectile, {
    getCell: function () {
      return flightRemoved ? null : liveTransparentForFlight;
    },
    removeCells: function (cells) {
      if (cells.length !== 1 || cells[0] !== liveTransparentForFlight) {
        throw new Error("Transparent flight destruction fixture received unexpected cells.");
      }
      flightRemoved = true;
      return [liveTransparentForFlight];
    }
  });
  if (!flightRemoved || flightProjectile.destroyedTransparentBalls.length !== 1) {
    throw new Error("Transparent ball must be removed when projectile progress reaches the hit point.");
  }
  var supportChecks = 0;
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    supportSystem: {
      findFloatingCells: function () {
        supportChecks += 1;
        return [];
      }
    }
  };
  var settlementGrid = {
    removeFloatingCells: function (cells) {
      if (!Array.isArray(cells) || cells.length !== 0) {
        throw new Error("Transparent ball settlement fixture expected no floating cells.");
      }
      return [];
    },
    getCellPosition: function (row, col) {
      return { x: col * 70, y: row * -60 };
    },
    getCells: function () {
      return [{ id: "attached", row: 7, col: 5, entityCategory: "normal_ball", entityType: null }];
    }
  };
  var resolution = {
    attachedCell: { id: "attached", row: 7, col: 5 },
    matched: [],
    floating: [],
    collected: [],
    transparentBallsDestroyed: [],
    spiritCocoonOpenings: [],
    eliminationSequence: [],
    scoreEvents: [],
    comboRegistered: false,
    scoreDelta: 0,
    boardCleared: false
  };
  manager._settleTransparentBallPenetration(
    resolution,
    flightProjectile.destroyedTransparentBalls,
    settlementGrid
  );

  if (supportChecks !== 1) {
    throw new Error("Destroying only a transparent ball must run one floating support check.");
  }
  if (manager.score < 1000 || resolution.scoreDelta !== manager.score) {
    throw new Error("Transparent ball fixed score and existing combo bonus must stay synchronized.");
  }
  if (
    resolution.scoreEvents.length !== 1 ||
    resolution.scoreEvents[0].points !== 1000 ||
    resolution.scoreEvents[0].scoreKind !== "transparent_ball_break"
  ) {
    throw new Error("Transparent ball destruction must create one +1000 floating score event.");
  }
  if (manager.comboStreak !== 2 || manager.maxComboStreak !== 2) {
    throw new Error("Transparent-only destruction must increase combo instead of clearing it.");
  }
  var destroyedEvents = manager._drainRuntimeEvents().filter(function (event) {
    return event.type === "transparent_ball_destroyed";
  });
  if (destroyedEvents.length !== 1 || destroyedEvents[0].gained !== 1000) {
    throw new Error("Transparent ball destruction runtime event must report the fixed score.");
  }
  if (hadCc) {
    global.cc = previousCc;
  } else {
    delete global.cc;
  }
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
      matched: [],
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
      matched: [],
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
      matched: [],
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

function runEliminationPresentationBoardAdvanceGateCase() {
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
      matched: [
        { id: "matched_1", row: 2, col: 2 }
      ],
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
      throw new Error("Elimination presentation regression expected deferred viewport settle.");
    }
    if (manager.pendingBoardAdvanceEliminationPresentation !== true) {
      throw new Error("Elimination presentation regression expected board advance presentation wait.");
    }

    var impactDelay = manager.pendingBoardAdvanceSpecialAnimationDelay;
    if (manager._updatePendingBoardAdvance(impactDelay)) {
      throw new Error("Viewport settle started before elimination presentation completed.");
    }
    if (settlePlanned) {
      throw new Error("Elimination presentation gate allowed early viewport settle.");
    }

    manager.notifyBoardAdvanceEliminationPresentationComplete();
    if (!manager._updatePendingBoardAdvance(0)) {
      throw new Error("Viewport settle did not start after elimination presentation completed.");
    }
    if (!settlePlanned || manager.lastResolution.boardViewportAdjusted !== true) {
      throw new Error("Elimination presentation viewport settle regression failed.");
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
  if (manager.pendingRuntimeEvents.length !== 1 || manager.pendingRuntimeEvents[0].type !== "lock_open") {
    throw new Error("Key unlock must push one lock_open runtime event.");
  }
  if (manager.pendingRuntimeEvents[0].row !== 1 || manager.pendingRuntimeEvents[0].col !== 2) {
    throw new Error("Key unlock lock_open event must identify the unlocked cell.");
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

function runKeyUnlockRemovedByExplosionCase() {
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
        { id: "key_blasted", entityCategory: "key_ball", entityType: "key", row: 0, col: 1 },
        { id: "locked_blasted", entityCategory: "locked_ball", entityType: "locked", lockedColor: "R", row: 0, col: 2 }
      ]
    }
  };
  var resolution = createKeyUnlockResolution();
  var grid = createGridWithViewport(levelConfig);
  manager.systems.bubbleGrid = grid;
  var keyCell = grid.getCell(0, 1);
  if (!keyCell || keyCell.entityCategory !== "key_ball") {
    throw new Error("Key explosion removal regression setup failed to create key cell.");
  }

  var removedKey = grid.removeCells([keyCell]);
  var collected = manager._resolveReactiveEntitiesAfterRemoval(removedKey, grid, resolution);
  if (collected.length !== 1 || collected[0].id !== "key_blasted") {
    throw new Error("Explosion-removed key must be collected through reactive resolution.");
  }
  if (resolution.collectedKeys.length !== 1 || resolution.collectedKeys[0].id !== "key_blasted") {
    throw new Error("Explosion-removed key must be recorded as collected key.");
  }
  if (resolution.unlockedLockedBalls.length !== 1) {
    throw new Error("Explosion-removed key must immediately unlock one locked ball.");
  }
  var unlockedCell = grid.getCell(0, 2);
  if (!unlockedCell || unlockedCell.entityCategory !== "normal_ball" || unlockedCell.color !== "R") {
    throw new Error("Explosion-removed key must replace locked target with its lockedColor.");
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

function runKeyUnlockMolotovFloatingRemovalCase() {
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
        { id: "key_floating", entityCategory: "key_ball", entityType: "key", row: 2, col: 1 },
        { id: "locked_after_float", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 2 }
      ]
    }
  };
  var grid = createGridWithViewport(levelConfig);
  var keyCell = grid.getCell(2, 1);
  if (!keyCell || keyCell.entityCategory !== "key_ball") {
    throw new Error("Molotov floating key regression setup failed to create key cell.");
  }

  var registeredDrops = [];
  var scanCount = 0;
  manager.systems.supportSystem = {
    findFloatingCells: function () {
      scanCount += 1;
      return scanCount === 1 ? [keyCell] : [];
    }
  };
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (drops) {
      registeredDrops = registeredDrops.concat(drops);
    }
  };
  manager.systems.jarCollectorSystem = {
    collect: function () {}
  };
  manager.molotovPendingResolutionContext = {
    allRemoved: [{
      id: "molotov_removed_anchor",
      row: 1,
      col: 1,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    }]
  };

  var resolution = {
    floating: [],
    collected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    spawnedBySplitters: [],
    thawed: [],
    iceCollected: 0
  };
  var removedFloating = manager._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
  if (removedFloating.length !== 1 || removedFloating[0].id !== "key_floating") {
    throw new Error("Molotov floating resolution must remove the floating key.");
  }
  if (resolution.collectedKeys.length !== 1 || resolution.collectedKeys[0].id !== "key_floating") {
    throw new Error("Floating key must be recorded as collected key.");
  }
  if (resolution.unlockedLockedBalls.length !== 1) {
    throw new Error("Floating key must immediately unlock one locked ball.");
  }
  if (registeredDrops.length !== 0) {
    throw new Error("Floating key must unlock instead of registering as a normal falling drop.");
  }
  var unlockedCell = grid.getCell(2, 2);
  if (!unlockedCell || unlockedCell.entityCategory !== "normal_ball" || unlockedCell.color !== "B") {
    throw new Error("Floating key must replace locked target with its lockedColor.");
  }
}

function runMolotovFloatingMolotovRegistersDropCase() {
  var manager = new GameManager();
  var floatingMolotov = {
    id: "floating_chain_molotov",
    row: 3,
    col: 2,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var registeredDrops = [];
  var scanCount = 0;
  var grid = {
    removeCells: function (cells) {
      return cells.slice();
    },
    removeFloatingCells: function (cells) {
      return cells.slice();
    }
  };
  var resolution = {
    floating: [],
    collected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    spawnedBySplitters: [],
    thawed: [],
    iceCollected: 0
  };

  manager.systems = {

    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function (targetGrid) {
        if (targetGrid !== grid) {
          throw new Error("Molotov floating molotov regression must inspect the live grid.");
        }
        scanCount += 1;
        return scanCount === 1 ? [floatingMolotov] : [];
      }
    },
    fallingMarbleSystem: {
      registerDrops: function (drops) {
        registeredDrops = registeredDrops.concat(drops);
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.molotovPendingResolutionContext = {
    allRemoved: [{
      id: "molotov_removed_anchor",
      row: 2,
      col: 2,
      color: "G",
      entityCategory: "normal_ball",
      entityType: null
    }]
  };
  manager._resolveCollectedKeyUnlocks = function () {};
  manager._collectRemovedKeysAndResolveUnlocks = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};

  var removedFloating = manager._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
  if (removedFloating.length !== 1 || removedFloating[0].id !== "floating_chain_molotov") {
    throw new Error("Molotov floating resolution must remove unsupported chain molotov.");
  }
  if (registeredDrops.length !== 1 || registeredDrops[0].id !== "floating_chain_molotov") {
    throw new Error("Unsupported chain molotov must register as a falling drop immediately.");
  }
}

function runMolotovFloatingKeyUnlockCascadesUnsupportedDropCase() {
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
        { id: "key_floating_chain", entityCategory: "key_ball", entityType: "key", row: 2, col: 1 },
        { id: "locked_chain_support", entityCategory: "locked_ball", entityType: "locked", lockedColor: "B", row: 2, col: 2 },
        { id: "child_after_unlock", entityCategory: "normal_ball", entityType: null, color: "R", row: 3, col: 2 }
      ]
    }
  };
  var grid = createGridWithViewport(levelConfig);
  var keyCell = grid.getCell(2, 1);
  var registeredDrops = [];
  var scanCount = 0;

  manager.systems.supportSystem = {
    findFloatingCells: function () {
      scanCount += 1;
      if (scanCount === 1) {
        return [keyCell];
      }
      if (scanCount === 2) {
        var unlocked = grid.getCell(2, 2);
        if (!unlocked || unlocked.entityCategory !== "normal_ball") {
          throw new Error("Molotov key cascade regression expected unlocked support cell.");
        }
        return [unlocked];
      }
      if (scanCount === 3) {
        var child = grid.getCell(3, 2);
        if (!child || child.id !== "child_after_unlock") {
          throw new Error("Molotov key cascade regression expected child to remain until cascade scan.");
        }
        return [child];
      }
      return [];
    }
  };
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (drops) {
      registeredDrops = registeredDrops.concat(drops);
    }
  };
  manager.systems.jarCollectorSystem = {
    collect: function () {}
  };
  manager.molotovPendingResolutionContext = {
    allRemoved: [{
      id: "molotov_removed_anchor",
      row: 1,
      col: 1,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    }]
  };

  var resolution = {
    floating: [],
    collected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    spawnedBySplitters: [],
    thawed: [],
    iceCollected: 0
  };
  var removedFloating = manager._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
  if (removedFloating.length !== 2) {
    throw new Error("Molotov key cascade must remove the key and newly unsupported child through molotov floating resolution.");
  }
  if (resolution.floating.length !== 3) {
    throw new Error("Molotov key cascade must include key, unlocked support, and child in floating resolution.");
  }
  var unlockedDrop = registeredDrops.find(function (drop) {
    return drop.id === "2_2";
  });
  var childDrop = registeredDrops.find(function (drop) {
    return drop.id === "child_after_unlock";
  });
  if (!unlockedDrop || !childDrop) {
    throw new Error("Molotov key cascade must register unlocked support and child drops in the same resolution.");
  }
  if (grid.getCell(2, 2) || grid.getCell(3, 2)) {
    throw new Error("Molotov key cascade must remove all unsupported descendants from the live grid.");
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
  var support = require("../gameplay-src/systems/SupportSystem");
  var supportSystem = new support();
  var falling = require("../gameplay-src/systems/FallingMarbleSystem");
  var fallingMarbleSystem = new falling();
  var fairyAssistSystem = manager.systems.fairyAssistSystem;
  var levelConfig = {
    coordinateSystem: "odd-r-hex",
    colors: ["R", "G", "B"],
    level: {
      initialDropSpaceRows: 8,
      colors: ["R", "G", "B"],
      jarColors: ["R", "G", "B"],
      winConditions: [],
      bonusObjectives: [],
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
  var match = require("../gameplay-src/systems/MatchSystem");
  var matchSystem = new match();
  var jars = require("../gameplay-src/systems/JarCollectorSystem");
  var jarCollectorSystem = new jars();

  var grid = createGridWithViewport(levelConfig);
  manager.currentLevel = levelConfig;
  supportSystem.configureLevel(levelConfig);
  matchSystem.configureLevel(levelConfig);
  fairyAssistSystem.configureLevel(levelConfig);
  fallingMarbleSystem.attachFairyAssistSystem(fairyAssistSystem);
  fallingMarbleSystem.configureLevel(levelConfig);
  jarCollectorSystem.configureLevel(levelConfig);

  manager.systems = {

    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
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

function runMolotovEliminationSequencePositionCase() {
  var manager = new GameManager();
  var blastedCell = {
    id: "1_7",
    row: 1,
    col: 7,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var grid = {
    getCoordinatesWithinRadius: function (row, col, radius) {
      if (row !== 1 || col !== 6 || radius !== 2) {
        throw new Error("Molotov elimination sequence regression queried unexpected radius.");
      }
      return [
        { row: 1, col: 6, distance: 0 },
        { row: 1, col: 7, distance: 1 }
      ];
    },
    getCell: function (row, col) {
      if (row === 1 && col === 7) {
        return blastedCell;
      }
      return null;
    },
    getNeighborCoordinates: function () {
      return [];
    },
    removeCells: function (cells) {
      return cells.slice();
    },
    getCellPosition: function (row, col) {
      return {
        x: col * 10,
        y: row * 10
      };
    }
  };
  var resolution = {
    matched: [],
    collected: [],
    floating: [],
    reactiveTriggered: [],
    eliminationSequence: [],
    matchedObjectiveCollected: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: []
  };
  manager.currentLevel = {
    level: {
      bonusObjectives: [],
      winConditions: []
    }
  };

  manager.systems = {

    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function () {
        return [];
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.molotovPendingResolutionContext = {
    allRemoved: [],
    triggeredSplitterIds: {}
  };
  manager.molotovBlastTriggeredIds = {};
  manager._triggerAdjacentKeys = function () {
    return [];
  };
  manager._triggerAdjacentSplitters = function () {};
  manager._collectAdjacentMolotovs = function () {
    return [];
  };
  manager._queueMolotovBlasts = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  manager._registerResolutionDrops = function () {};

  manager._executeMolotovBlastPhase({
    id: "molotov_source",
    row: 1,
    col: 6,
    blastRadius: 2
  }, grid, resolution);

  if (resolution.eliminationSequence.length !== 1) {
    throw new Error("Molotov blast must append one elimination sequence entry for the blasted normal ball.");
  }
  var entry = resolution.eliminationSequence[0];
  if (entry.cellId !== "1_7") {
    throw new Error("Molotov blast elimination sequence must preserve blasted cell id.");
  }
  if (!entry.worldPosition || entry.worldPosition.x !== 70 || entry.worldPosition.y !== 10) {
    throw new Error("Molotov blast elimination sequence must preserve pre-removal worldPosition.");
  }
}

function runMolotovChainSplitterDedupCase() {
  var manager = new GameManager();
  var splitter = {
    id: "splitter_shared",
    row: 1,
    col: 3,
    splitColor: "P",
    entityCategory: "reactive_ball",
    entityType: "splitter"
  };
  var normalFirst = {
    id: "normal_first",
    row: 1,
    col: 2,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var normalSecond = {
    id: "normal_second",
    row: 2,
    col: 2,
    color: "G",
    entityCategory: "normal_ball",
    entityType: null
  };
  var molotovFirst = {
    id: "molotov_first",
    row: 1,
    col: 1,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var molotovSecond = {
    id: "molotov_second",
    row: 2,
    col: 1,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var cellsById = {
    normal_first: normalFirst,
    normal_second: normalSecond,
    molotov_first: molotovFirst,
    molotov_second: molotovSecond,
    splitter_shared: splitter
  };
  var queuedSplitterIds = [];
  var grid = {
    getCoordinatesWithinRadius: function (row, col, radius) {
      if (radius !== 2) {
        throw new Error("Molotov splitter dedup regression requires radius 2.");
      }
      if (row === 1 && col === 1) {
        return [
          { row: 1, col: 1, distance: 0 },
          { row: 1, col: 2, distance: 1 }
        ];
      }
      if (row === 2 && col === 1) {
        return [
          { row: 2, col: 1, distance: 0 },
          { row: 2, col: 2, distance: 1 }
        ];
      }
      throw new Error("Molotov splitter dedup regression queried unexpected blast center.");
    },
    getNeighborCoordinates: function (row, col) {
      if (row === 1 && col === 2) {
        return [{ row: 1, col: 3 }];
      }
      if (row === 2 && col === 2) {
        return [{ row: 1, col: 3 }];
      }
      return [];
    },
    getCell: function (row, col) {
      if (row === 1 && col === 2) {
        return cellsById.normal_first || null;
      }
      if (row === 2 && col === 2) {
        return cellsById.normal_second || null;
      }
      if (row === 1 && col === 1) {
        return cellsById.molotov_first || null;
      }
      if (row === 2 && col === 1) {
        return cellsById.molotov_second || null;
      }
      if (row === 1 && col === 3) {
        return splitter;
      }
      return null;
    },
    removeCells: function (cells) {
      cells.forEach(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Molotov splitter dedup remove requires cell id.");
        }
        delete cellsById[cell.id];
      });
      return cells.slice();
    },
    getCellPosition: function (row, col) {
      return {
        x: col * 10,
        y: row * 10
      };
    }
  };
  var resolution = {
    matched: [],
    collected: [],
    floating: [],
    reactiveTriggered: [],
    spawnedBySplitters: [],
    eliminationSequence: [],
    matchedObjectiveCollected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: []
  };

  manager.currentLevel = {
    level: {
      bonusObjectives: [],
      winConditions: []
    }
  };
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function () {
        return [];
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.pendingSplitterSpawns = [];
  manager.molotovPendingResolutionContext = {
    allRemoved: [],
    triggeredSplitterIds: {}
  };
  manager.molotovBlastTriggeredIds = {};
  manager._triggerAdjacentKeys = function () {
    return [];
  };
  manager._queuePendingSplitterSpawn = function (splitterCell, targetResolution) {
    GameManager.prototype._queuePendingSplitterSpawn.call(this, splitterCell, targetResolution);
    queuedSplitterIds.push(splitterCell.id);
  };
  manager._collectAdjacentMolotovs = function () {
    return [];
  };
  manager._queueMolotovBlasts = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  manager._registerResolutionDrops = function () {};

  manager._executeMolotovBlastPhase({
    id: "molotov_first",
    row: 1,
    col: 1,
    blastRadius: 2
  }, grid, resolution);
  manager._executeMolotovBlastPhase({
    id: "molotov_second",
    row: 2,
    col: 1,
    blastRadius: 2
  }, grid, resolution);

  if (queuedSplitterIds.length !== 1 || queuedSplitterIds[0] !== "splitter_shared") {
    throw new Error("Molotov chain must queue a shared adjacent splitter exactly once.");
  }
  if (manager.pendingSplitterSpawns.length !== 1 || manager.pendingSplitterSpawns[0].id !== "splitter_shared") {
    throw new Error("Molotov chain must leave one pending splitter spawn.");
  }
  if (resolution.reactiveTriggered.length !== 1 || resolution.reactiveTriggered[0].id !== "splitter_shared") {
    throw new Error("Molotov chain must emit one splitter reactive trigger event.");
  }
}

function runMolotovPendingResolutionSeedsSplitterDedupCase() {
  var manager = new GameManager();
  var splitter = {
    id: "splitter_already_pending",
    row: 1,
    col: 3,
    splitColor: "P",
    entityCategory: "reactive_ball",
    entityType: "splitter"
  };
  var normal = {
    id: "normal_before_molotov",
    row: 1,
    col: 2,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var molotov = {
    id: "molotov_pending",
    row: 1,
    col: 1,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var cellsById = {
    normal_before_molotov: normal,
    molotov_pending: molotov,
    splitter_already_pending: splitter
  };
  var grid = {
    getCoordinatesWithinRadius: function (row, col, radius) {
      if (row !== 1 || col !== 1 || radius !== 2) {
        throw new Error("Molotov pending splitter seed regression queried unexpected blast center.");
      }
      return [
        { row: 1, col: 1, distance: 0 },
        { row: 1, col: 2, distance: 1 }
      ];
    },
    getNeighborCoordinates: function (row, col) {
      if (row === 1 && col === 2) {
        return [{ row: 1, col: 3 }];
      }
      return [];
    },
    getCell: function (row, col) {
      if (row === 1 && col === 2) {
        return cellsById.normal_before_molotov || null;
      }
      if (row === 1 && col === 1) {
        return cellsById.molotov_pending || null;
      }
      if (row === 1 && col === 3) {
        return splitter;
      }
      return null;
    },
    removeCells: function (cells) {
      cells.forEach(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Molotov pending splitter seed remove requires cell id.");
        }
        delete cellsById[cell.id];
      });
      return cells.slice();
    },
    getCellPosition: function (row, col) {
      return {
        x: col * 10,
        y: row * 10
      };
    }
  };
  var resolution = {
    matched: [],
    collected: [],
    floating: [],
    reactiveTriggered: [],
    spawnedBySplitters: [],
    eliminationSequence: [],
    matchedObjectiveCollected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: []
  };

  manager.currentLevel = {
    level: {
      bonusObjectives: [],
      winConditions: []
    }
  };
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function () {
        return [];
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.pendingSplitterSpawns = [{
    id: "splitter_already_pending",
    row: 1,
    col: 3,
    splitColor: "P",
    remainingDelay: 0.2
  }];
  manager.activeMolotovBlast = {
    id: "molotov_pending",
    row: 1,
    col: 1,
    blastRadius: 2,
    elapsed: 0,
    blastExecuted: false,
    completeExecuted: false
  };
  manager.molotovBlastTriggeredIds = {};
  manager._triggerAdjacentKeys = function () {
    return [];
  };
  manager._queuePendingSplitterSpawn = function () {
    throw new Error("Molotov pending resolution must seed already pending splitters before blast scans.");
  };
  manager._collectAdjacentMolotovs = function () {
    return [];
  };
  manager._queueMolotovBlasts = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = GameManager.prototype._cancelPendingSplitterSpawnsForDroppedCells.bind(manager);
  manager._registerResolutionDrops = function () {};

  manager._beginMolotovPendingResolution(resolution, "matchedDrop", []);

  if (manager.pendingSplitterSpawns.length !== 1 || manager.pendingSplitterSpawns[0].id !== "splitter_already_pending") {
    throw new Error("Molotov pending splitter seed must keep the existing pending splitter spawn.");
  }
  if (resolution.reactiveTriggered.length !== 0) {
    throw new Error("Molotov pending splitter seed must not emit a duplicate splitter trigger.");
  }
  if (!manager.molotovPendingResolutionContext.triggeredSplitterIds.splitter_already_pending) {
    throw new Error("Molotov pending splitter seed must mark existing pending splitter id.");
  }
}

function runMolotovBlastPhaseDropsUnsupportedSourceSupportCase() {
  var manager = new GameManager();
  var sourceMolotov = {
    id: "molotov_source_support",
    row: 1,
    col: 1,
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  };
  var floatingCell = {
    id: "unsupported_after_source",
    row: 2,
    col: 1,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var sourceRemoved = false;
  var registeredDrops = [];
  var scanCount = 0;
  var grid = {
    getCoordinatesWithinRadius: function (row, col, radius) {
      if (row !== 1 || col !== 1 || radius !== 2) {
        throw new Error("Molotov source-support regression queried unexpected radius.");
      }
      return [
        { row: 1, col: 1, distance: 0 }
      ];
    },
    getCell: function (row, col) {
      if (row === 1 && col === 1 && !sourceRemoved) {
        return sourceMolotov;
      }
      return null;
    },
    getNeighborCoordinates: function () {
      return [];
    },
    removeCells: function (cells) {
      return cells.map(function (cell) {
        if (cell.id === "molotov_source_support") {
          sourceRemoved = true;
        }
        return cell;
      });
    },
    removeFloatingCells: function (cells) {
      return cells.slice();
    },
    getCellPosition: function (row, col) {
      return {
        x: col * 10,
        y: row * 10
      };
    }
  };
  var resolution = {
    matched: [],
    collected: [],
    floating: [],
    reactiveTriggered: [],
    eliminationSequence: [],
    matchedObjectiveCollected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    spawnedBySplitters: [{
      id: "unsupported_after_source",
      row: 2,
      col: 1,
      color: "R",
      sourceSplitterId: "splitter_source",
      sourceSplitterRow: 2,
      sourceSplitterCol: 0
    }],
    thawed: [],
    iceCollected: 0,
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: []
  };

  manager.currentLevel = {
    level: {
      bonusObjectives: [],
      winConditions: []
    }
  };
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function () {
        if (!sourceRemoved) {
          throw new Error("Molotov floating scan must run after source molotov is removed.");
        }
        scanCount += 1;
        return scanCount === 1 ? [floatingCell] : [];
      }
    },
    fallingMarbleSystem: {
      registerDrops: function (cells) {
        registeredDrops = registeredDrops.concat(cells);
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.molotovPendingResolutionContext = {
    allRemoved: [],
    triggeredSplitterIds: {}
  };
  manager.molotovBlastTriggeredIds = {};
  manager._triggerAdjacentKeys = function () {
    return [];
  };
  manager._triggerAdjacentSplitters = function () {};
  manager._collectAdjacentMolotovs = function () {
    return [];
  };
  manager._queueMolotovBlasts = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};

  manager._executeMolotovBlastPhase({
    id: "molotov_source_support",
    row: 1,
    col: 1,
    blastRadius: 2
  }, grid, resolution);

  if (!sourceRemoved) {
    throw new Error("Molotov source cell must be removed during blast phase.");
  }
  if (resolution.floating.length !== 1 || resolution.floating[0].id !== "unsupported_after_source") {
    throw new Error("Molotov blast phase must resolve unsupported cells caused by source removal.");
  }
  if (registeredDrops.length !== 1 || registeredDrops[0].id !== "unsupported_after_source") {
    throw new Error("Molotov blast phase must register unsupported drops immediately.");
  }
  if (resolution.spawnedBySplitters.length !== 0) {
    throw new Error("Molotov floating resolution must remove spawned splitter animation entries for dropped targets.");
  }
}

function runMolotovPendingResolutionFinalizeCase() {
  var manager = new GameManager();
  var floatingCell = {
    id: "floating_after_molotov",
    row: 3,
    col: 2,
    color: "R",
    entityCategory: "normal_ball",
    entityType: null
  };
  var registeredDrops = [];
  var scanCount = 0;
  var grid = {
    removeCells: function (cells) {
      return cells.slice();
    },
    removeFloatingCells: function (cells) {
      return cells.slice();
    },
    getCells: function () {
      return [
        { id: "anchored_survivor", row: 0, col: 0, color: "B", entityCategory: "normal_ball", entityType: null }
      ];
    },
    getSpecialEntities: function () {
      return [];
    },
    getVineSpirits: function () {
      return [];
    },
    assertNoVisualOverlap: function () {}
  };

  manager.systems = {

    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function (targetGrid) {
        if (targetGrid !== grid) {
          throw new Error("Molotov pending finalize must inspect the live grid.");
        }
        scanCount += 1;
        return scanCount === 1 ? [floatingCell] : [];
      }
    },
    fallingMarbleSystem: {
      hasActiveDrops: function () {
        return false;
      },
      registerDrops: function (cells) {
        registeredDrops = cells.slice();
      }
    },
    jarCollectorSystem: {
      collect: function () {}
    }
  };
  manager.lastResolution = {
    matched: [],
    collected: [],
    floating: [],
    spawnedBySplitters: [],
    breederResolved: false,
    breederSpawns: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    fairyAssistEvents: [],
    vineCastEvaluated: false,
    vineCasts: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: [],
    impact: {
      center: { row: 0, col: 0 }
    }
  };
  manager.remainingShots = 1;
  manager.shotsFired = 1;
  manager.molotovResolutionPending = true;
  manager.molotovPendingResolutionContext = {
    dropScoreRuleKey: "matchedDrop",
    allRemoved: [
      { id: "molotov_removed_support", row: 2, col: 2, color: "G", entityCategory: "normal_ball", entityType: null }
    ],
    triggeredSplitterIds: {}
  };
  manager.pendingMolotovBlastQueue = [];
  manager.activeMolotovBlast = null;
  manager._resolveCollectedKeyUnlocks = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  manager._applyResolutionDropScore = function () {};
  manager._registerComboElimination = function () {};
  manager._resolveFairyAssistsAfterResolution = function () {};
  manager._tryTopAnchorCollapse = function () {
    return false;
  };
  manager._scheduleBoardAdvanceAfterImpact = function () {
    return false;
  };

  var updated = manager._updatePendingMolotovBlasts(0);
  if (!updated) {
    throw new Error("Molotov pending resolution must update when only finalize work remains.");
  }
  if (manager.molotovResolutionPending) {
    throw new Error("Molotov pending resolution must clear after finalize.");
  }
  if (manager.lastResolution.floating.length !== 1 || manager.lastResolution.floating[0].id !== "floating_after_molotov") {
    throw new Error("Molotov pending finalize must resolve unsupported floating cells immediately.");
  }
  if (registeredDrops.length !== 1 || registeredDrops[0].id !== "floating_after_molotov") {
    throw new Error("Molotov pending finalize must register floating drops immediately.");
  }
  if (manager.pendingBoardAdvanceEliminationPresentation !== false) {
    throw new Error("Molotov pending finalize must not re-arm a completed elimination presentation gate.");
  }
}

function runMolotovBlastUpdateForcesFullRefreshCase() {
  var manager = new GameManager();
  manager.state = "running";
  manager.isTimedInfiniteShots = false;
  manager.remainingShots = 1;
  manager.activeProjectile = null;
  manager.pendingProjectileFinalize = false;
  manager.pendingRuntimeEvents = [];
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    fallingMarbleSystem: {
      hasActiveDrops: function () {
        return true;
      },
      update: function () {
        return {
          updated: false,
          collected: [],
          fairyHits: [],
          splits: [],
          bounceEvents: []
        };
      }
    },
    boardViewportSystem: {
      isMoving: function () {
        return false;
      },
      update: function () {
        return false;
      }
    },
    boardOcclusionSystem: {
      clearZonesWithoutBoardCells: function (boardCells) {
        if (!Array.isArray(boardCells)) {
          throw new Error("Shot regression board occlusion stub requires board cells array.");
        }
        return [];
      },
      update: function () {
        return [];
      }
    }
  };
  manager._updateJarScoreBoost = function () {
    return false;
  };
  manager._updatePendingBoardAdvance = function () {
    return false;
  };
  manager._hasBoardAdvancedThisFrame = function () {
    return false;
  };
  manager._updatePendingSplitterSpawns = function () {
    return false;
  };
  manager._updatePendingMolotovBlasts = function () {
    return true;
  };
  manager._hasPendingSplitterSpawns = function () {
    return false;
  };
  manager._hasPendingMolotovBlasts = function () {
    return false;
  };
  manager.getRuntimeSnapshot = function (_runtimeEvents, renderOptions) {
    return {
      refreshScope: renderOptions && renderOptions.refreshScope
    };
  };

  var snapshot = manager.update(0.016);
  if (!snapshot) {
    throw new Error("Molotov blast update must return a runtime snapshot.");
  }
  if (snapshot.refreshScope !== "full") {
    throw new Error("Molotov blast update must force full refresh so board removals render immediately.");
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

function runSnowRemovalKeepsInnerNormalBallCase() {
  var manager = new GameManager();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  var levelConfig = createLevelConfig(1);
  levelConfig.level.levelId = 16;
  levelConfig.level.code = "L016_SNOW_REMOVAL_REGRESSION";
  levelConfig.level.colors = ["R", "B"];
  levelConfig.level.colorCount = 2;
  delete levelConfig.level.initialShotBalls;
  delete levelConfig.level.openingShotBalls;
  levelConfig.level.shotLimit = 8;
  levelConfig.level.targetScore = 100;
  levelConfig.level.starThresholds = { star1: 30, star2: 60, star3: 85 };
  levelConfig.level.jarCount = 2;
  levelConfig.level.jarColors = ["R", "B"];
  levelConfig.level.winConditions = [
    { type: "collect_any", value: 1 }
  ];
  levelConfig.level.bonusObjectives = [
    { type: "collect_ice_snowball", value: 1 }
  ];
  levelConfig.level.layout = [
    "R........",
    "R........",
    "........."
  ];
  levelConfig.level.specialEntities = [
    { id: "ice_snow_1", entityCategory: "obstacle_ball", entityType: "ice", innerColor: "B", row: 2, col: 0 }
  ];
  levelConfig.level.adPowerupRules = {
    allowed: ["snow_removal"]
  };

  try {
    manager.startLevel(levelConfig, {
      runMode: "shot_regression",
      attemptIndex: 1,
      seed: "shot-regression-level:" + levelConfig.level.levelId + ":attempt:1"
    });
    manager.systems.shooterController.skillInventory.snow_removal = 1;
    var beforeCells = manager.systems.bubbleGrid.getCells();
    if (beforeCells.length !== 3) {
      throw new Error("Snow removal regression setup must start with two normal balls and one snow block.");
    }

    var result = manager.useSnowRemoval();
    if (!result || result.accepted !== true) {
      throw new Error("Snow removal regression expected accepted use.");
    }
    if (result.removed !== 1 || result.thawed !== 1 || result.floating !== 0) {
      throw new Error("Snow removal must thaw exactly one snow block without dropping supported balls.");
    }
    if (manager.iceCollectedTotal !== 1 || manager.lastResolution.iceCollected !== 1) {
      throw new Error("Snow removal must collect exactly one snow block objective.");
    }
    if (manager.lastResolution.matched.length !== 0 || manager.lastResolution.thawed.length !== 1) {
      throw new Error("Snow removal must record thawed snow blocks instead of matched removed balls.");
    }

    var afterCells = manager.systems.bubbleGrid.getCells();
    if (afterCells.length !== beforeCells.length) {
      throw new Error("Snow removal must keep the inner normal ball on the board.");
    }
    var thawedCell = manager.systems.bubbleGrid.getCell(2, 0);
    if (!thawedCell || thawedCell.entityCategory !== "normal_ball" || thawedCell.color !== "B") {
      throw new Error("Snow removal must replace the snow block with its inner normal ball.");
    }
    if (manager.systems.shooterController.skillInventory.snow_removal !== 0) {
      throw new Error("Snow removal must consume exactly one inventory item.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
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
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
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
    },
    boardOcclusionSystem: {
      clearZonesWithoutBoardCells: function (boardCells) {
        if (!Array.isArray(boardCells)) {
          throw new Error("Shot regression board occlusion stub requires board cells array.");
        }
        return [];
      },
      snapshotForRender: function () {
        return {
          version: 0,
          mode: "none",
          variantId: null,
          selectionSeed: null,
          activeZones: []
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

function createAddBallPromptRegressionManager() {
  var manager = new GameManager();
  var boardCells = [
    {
      id: "remaining_1",
      row: 0,
      col: 0,
      color: "R",
      entityCategory: "normal_ball"
    }
  ];
  manager.currentLevel = {
    level: {
      code: "TEST_ADD_BALL_PROMPT",
      adPowerupRules: {
        allowed: ["plus_three_balls"]
      },
      bonusObjectives: [
        { type: "collect_any", value: 1 }
      ],
      winConditions: []
    }
  };
  manager.remainingShots = 0;
  manager.state = "running";
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    bubbleGrid: {
      version: 1,
      getCells: function () {
        return boardCells.slice();
      },
      getViewportOffsetY: function () {
        return 0;
      },
      snapshot: function () {
        return {
          cells: boardCells.slice(),
          version: 1
        };
      },
      getTopAttachY: function () {
        return BoardLayout.boardStartY + BoardLayout.bubbleRadius;
      }
    },
    shooterController: {
      origin: { x: 0, y: 0 },
      aimDirection: { x: 0, y: 1 },
      getShooterStateForRender: function () {
        return {
          aim: {
            origin: { x: 0, y: 0 },
            direction: { x: 0, y: 1 }
          },
          skillInventory: {},
          adRunPowerupInventory: {},
          queueAdvanceRevision: 0
        };
      },
      syncFiniteShotQueue: function (remainingShots) {
        if (remainingShots !== 10) {
          throw new Error("Add-ball prompt expected plus ten shooter sync.");
        }
        return {
          accepted: true
        };
      }
    },
    trajectoryPredictor: {
      maxBounces: 0
    },
    boardViewportSystem: {
      isMoving: function () {
        return false;
      },
      snapshot: function () {
        return {
          offsetY: 0,
          targetOffsetY: 0,
          moving: false,
          introActive: false
        };
      },
      introActive: false
    },
    fallingMarbleSystem: {
      hasActiveDrops: function () {
        return false;
      },
      snapshotForRender: function () {
        return {
          activeDrops: [],
          activeDropCount: 0
        };
      }
    },
    fairyAssistSystem: {
      snapshotForRender: function () {
        return {
          slots: []
        };
      }
    },
    jarCollectorSystem: {
      jarColors: ["R"],
      collectedByColor: { R: 0 },
      collectedTotal: 0,
      objectiveTarget: 1,
      lastCollected: [],
      snapshot: function () {
        return {
          collectedTotal: 0,
          collectedByColor: { R: 0 }
        };
      }
    },
    boardOcclusionSystem: {
      clearZonesWithoutBoardCells: function (boardCells) {
        if (!Array.isArray(boardCells)) {
          throw new Error("Shot regression board occlusion stub requires board cells array.");
        }
        return [];
      },
      snapshotForRender: function () {
        return {
          version: 0,
          mode: "none",
          variantId: null,
          selectionSeed: null,
          activeZones: []
        };
      }
    }
  };
  return manager;
}

function runOutOfShotsAddBallPromptCase() {
  var manager = createAddBallPromptRegressionManager();
  manager._showOutOfShotsAddBallPrompt();
  if (manager.state !== "out_of_shots_add_ball_prompt") {
    throw new Error("Final shot exhaustion should enter add-ball prompt before lose settlement.");
  }

  var closeSnapshot = manager.confirmOutOfShotsAddBallPromptClosed();
  if (!closeSnapshot || closeSnapshot.state !== "out_of_shots") {
    throw new Error("Closing AddBallTipsView should continue out_of_shots settlement.");
  }
}

function runAddBallPromptPlusTenCase() {
  var manager = createAddBallPromptRegressionManager();
  manager._showOutOfShotsAddBallPrompt();
  manager.adRunPowerupInventory.plus_three_balls = 1;

  var useResult = manager.usePlusThreeBalls();
  if (!useResult || useResult.accepted !== true) {
    throw new Error("Add-ball prompt should allow using plus ten balls.");
  }
  if (manager.state !== "running") {
    throw new Error("Using plus ten balls from AddBallTipsView should resume running state.");
  }
  if (manager.remainingShots !== 10) {
    throw new Error("Using plus ten balls from AddBallTipsView should grant 10 shots.");
  }
}

function runPreciseAimInventoryActivatesGuideCase() {
  var manager = new GameManager();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var levelConfig = createLevelConfig(1);
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    manager.startLevel(levelConfig, {
      runMode: "shot_regression",
      attemptIndex: 1,
      seed: "shot-regression-level:" + levelConfig.level.levelId + ":attempt:1"
    });

    var grantResult = manager.grantPowerupInventory("precise_aim", 1);
    if (!grantResult || grantResult.accepted !== true) {
      throw new Error("Precise aim inventory grant should be accepted.");
    }
    if (manager.systems.shooterController.skillInventory.precise_aim !== 1) {
      throw new Error("Precise aim inventory grant should add one runtime item.");
    }

    var useResult = manager.usePreciseAim();
    if (!useResult || useResult.accepted !== true) {
      throw new Error("Precise aim use should be accepted when runtime inventory exists.");
    }
    if (manager.ricochetGuideActive !== true) {
      throw new Error("Precise aim use should activate ricochet guide.");
    }
    if (manager.systems.shooterController.skillInventory.precise_aim !== 0) {
      throw new Error("Precise aim use should consume one runtime item.");
    }
    if (!useResult.snapshot || !useResult.snapshot.shooter || useResult.snapshot.shooter.ricochetGuideActive !== true) {
      throw new Error("Precise aim use snapshot should expose active ricochet guide.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runCollectedSkillPowerupsEmitInventoryEventsCase() {
  var manager = new GameManager();
  manager.lastResolution = {
    injectedSkills: []
  };

  var injectedCount = manager._injectCollectedSkillBalls([
    {
      id: "rainbow_drop_1",
      entityCategory: "skill_ball",
      entityType: "rainbow",
      jarIndex: 0
    },
    {
      id: "blast_drop_1",
      entityCategory: "skill_ball",
      entityType: "blast",
      jarIndex: 1
    }
  ]);

  if (injectedCount !== 2) {
    throw new Error("Collected rainbow and blast balls should both inject runtime inventory.");
  }
  if (manager.systems.shooterController.skillInventory.rainbow !== 1) {
    throw new Error("Collected rainbow ball should increase runtime rainbow inventory.");
  }
  if (manager.systems.shooterController.skillInventory.blast !== 1) {
    throw new Error("Collected blast ball should increase runtime blast inventory.");
  }
  if (manager.lastResolution.injectedSkills.length !== 2) {
    throw new Error("Collected skill balls should be recorded in resolution injectedSkills.");
  }
  if (manager.pendingRuntimeEvents.length !== 2) {
    throw new Error("Collected skill balls should emit one runtime event per collected powerup.");
  }
  if (
    manager.pendingRuntimeEvents[0].type !== "skill_powerup_collected" ||
    manager.pendingRuntimeEvents[0].entityType !== "rainbow" ||
    manager.pendingRuntimeEvents[0].sourceId !== "rainbow_drop_1" ||
    manager.pendingRuntimeEvents[0].total !== 1
  ) {
    throw new Error("Collected rainbow event should carry inventory sync payload.");
  }
  if (
    manager.pendingRuntimeEvents[1].type !== "skill_powerup_collected" ||
    manager.pendingRuntimeEvents[1].entityType !== "blast" ||
    manager.pendingRuntimeEvents[1].sourceId !== "blast_drop_1" ||
    manager.pendingRuntimeEvents[1].total !== 1
  ) {
    throw new Error("Collected blast event should carry inventory sync payload.");
  }
}

function runTimedOutSkillPowerupsIncreaseInventoryCase() {
  var manager = new GameManager();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var levelConfig = createLevelConfig(1);
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    manager.startLevel(levelConfig, {
      runMode: "shot_regression",
      attemptIndex: 1,
      seed: "shot-regression-timeout-skill-powerups"
    });

    var fallingSystem = manager.systems.fallingMarbleSystem;
    var timedOutDrops = fallingSystem.registerDrops([
      {
        id: "rainbow_timeout",
        entityCategory: "skill_ball",
        entityType: "rainbow",
        row: 0,
        col: 0
      },
      {
        id: "blast_timeout",
        entityCategory: "skill_ball",
        entityType: "blast",
        row: 0,
        col: 1
      }
    ], manager.systems.bubbleGrid);
    if (timedOutDrops.length !== 2) {
      throw new Error("Timeout skill powerup regression requires two active falling drops.");
    }
    timedOutDrops.forEach(function (drop) {
      drop.lifeTime = fallingSystem.maxDropLifeTime;
    });

    var snapshot = manager.update(0.016);
    if (manager.systems.shooterController.skillInventory.rainbow !== 1) {
      throw new Error("Timed-out rainbow drop must increase runtime rainbow inventory.");
    }
    if (manager.systems.shooterController.skillInventory.blast !== 1) {
      throw new Error("Timed-out blast drop must increase runtime blast inventory.");
    }
    if (manager.lastResolution.injectedSkills.length !== 2) {
      throw new Error("Timed-out skill drops must be recorded in resolution injectedSkills.");
    }

    var collectedEvents = snapshot.runtimeEvents.filter(function (event) {
      return event && event.type === "skill_powerup_collected";
    });
    var collectedEntityTypes = collectedEvents.map(function (event) {
      return event.entityType;
    }).sort();
    if (
      collectedEvents.length !== 2 ||
      collectedEntityTypes[0] !== "blast" ||
      collectedEntityTypes[1] !== "rainbow"
    ) {
      throw new Error("Timed-out rainbow and blast drops must each emit one inventory sync event.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runCollectedSkillPowerupHudFeedbackQueueCase() {
  function ValidationRenderer() {}
  attachLevelRendererSceneHudMethods(ValidationRenderer, {
    BoardLayout: BoardLayout
  });

  var renderer = Object.create(ValidationRenderer.prototype);
  renderer.lastSkillPowerupCollectedEventId = -1;
  renderer.skillPowerupCollectedFeedbackQueue = [];
  renderer.skillPowerupCollectedFeedbackActive = false;
  var playNextCallCount = 0;
  renderer._playNextSkillPowerupCollectedFeedback = function () {
    playNextCallCount += 1;
  };
  var snapshot = {
    runtimeEvents: [
      { id: 1, type: "jar_collect_bottom" },
      { id: 2, type: "skill_powerup_collected", entityType: "rainbow", total: 1 },
      { id: 3, type: "skill_powerup_collected", entityType: "blast", total: 2 }
    ]
  };

  renderer._queueSkillPowerupCollectedFeedback(snapshot);
  if (renderer.skillPowerupCollectedFeedbackQueue.join(",") !== "rainbow,blast") {
    throw new Error("Collected skill powerup HUD feedback should queue rainbow and blast in event order.");
  }
  if (renderer.lastSkillPowerupCollectedEventId !== 3 || playNextCallCount !== 1) {
    throw new Error("Collected skill powerup HUD feedback should advance event identity and start playback once.");
  }

  renderer._queueSkillPowerupCollectedFeedback(snapshot);
  if (renderer.skillPowerupCollectedFeedbackQueue.join(",") !== "rainbow,blast") {
    throw new Error("Collected skill powerup HUD feedback must not replay consumed runtime events.");
  }
  if (playNextCallCount !== 2) {
    throw new Error("Collected skill powerup HUD feedback should keep the playback pump active.");
  }

  var rejectedUnsupportedType = false;
  try {
    renderer._queueSkillPowerupCollectedFeedback({
      runtimeEvents: [
        { id: 4, type: "skill_powerup_collected", entityType: "swap", total: 1 }
      ]
    });
  } catch (error) {
    rejectedUnsupportedType = /unsupported entityType/.test(error.message);
  }
  if (!rejectedUnsupportedType) {
    throw new Error("Collected skill powerup HUD feedback should fail fast on unsupported entity types.");
  }
}

function runCollectedSkillPowerupHudFeedbackRevealToleranceCase() {
  var previousCc = global.cc;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  function ScrollView() {}
  global.cc = {
    ScrollView: ScrollView,
    v2: function (x, y) {
      return { x: x, y: y };
    }
  };
  try {
    function ValidationRenderer() {}
    attachLevelRendererSceneHudMethods(ValidationRenderer, {
      BoardLayout: BoardLayout
    });
    var renderer = Object.create(ValidationRenderer.prototype);
    var buttonRect = { xMin: 620, xMax: 700 };
    var viewRect = { xMin: 0, xMax: 614 };
    var scrollStopped = false;
    var contentNode = {
      x: 0,
      y: 0,
      parent: {
        isValid: true,
        convertToNodeSpaceAR: function (point) {
          return { x: point.x, y: point.y };
        }
      },
      setPosition: function (x, y) {
        var appliedDelta = x - this.x + 6.3;
        this.x = x;
        this.y = y;
        buttonRect = {
          xMin: buttonRect.xMin + appliedDelta,
          xMax: buttonRect.xMax + appliedDelta
        };
      }
    };
    var nodes = {
      scrollNode: {
        getComponent: function (componentType) {
          if (componentType !== ScrollView) {
            throw new Error("Collected feedback reveal requested an unexpected component.");
          }
          return {
            stopAutoScroll: function () {
              scrollStopped = true;
            }
          };
        }
      },
      viewNode: {
        getBoundingBoxToWorld: function () {
          return viewRect;
        }
      },
      contentNode: contentNode,
      buttonNode: {
        getBoundingBoxToWorld: function () {
          return buttonRect;
        }
      }
    };
    renderer._revealSkillPowerupCollectedFeedbackButton(nodes);
    if (!scrollStopped || Math.abs(buttonRect.xMax - (viewRect.xMax - 16 + 6.3)) > 0.001 || buttonRect.xMax > viewRect.xMax) {
      throw new Error("Collected skill feedback reveal must accept padding shortfall when the button is inside the viewport.");
    }

    buttonRect = { xMin: 620, xMax: 700 };
    contentNode.x = 0;
    contentNode.setPosition = function (x, y) {
      this.x = x;
      this.y = y;
    };
    var rejectedRealOverflow = false;
    try {
      renderer._revealSkillPowerupCollectedFeedbackButton(nodes);
    } catch (error) {
      rejectedRealOverflow = /leftOverflow=.*rightOverflow=/.test(error.message);
    }
    if (!rejectedRealOverflow) {
      throw new Error("Collected skill feedback reveal must still fail fast on real post-scroll overflow.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
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

  manager.currentLevel.level.bonusObjectives = [];
  manager.currentLevel.level.winConditions = [
    { type: "clear_all", value: 1 }
  ];
  if (manager._areCollectionRewardObjectivesCompleted()) {
    throw new Error("Clear-only level must not award the collection reward multiplier.");
  }
}

function runOneStarTargetScoreCase() {
  var oneStarTargetScore = StarRatingPolicy.resolveOneStarTargetScore({
    level: {
      targetScore: 2580
    }
  });
  if (oneStarTargetScore !== 1290) {
    throw new Error("One-star target score must use the runtime star threshold policy.");
  }
  var authoredThresholds = StarRatingPolicy.resolveStarThresholds({
    level: {
      targetScore: 2580,
      starThresholds: {
        star1: 920,
        star2: 1700,
        star3: 2320
      }
    }
  });
  if (authoredThresholds.star1 !== 920 || authoredThresholds.star2 !== 1700 || authoredThresholds.star3 !== 2320) {
    throw new Error("Runtime star policy must preserve authored star thresholds.");
  }
}

function runAuthoredOpeningShotQueueCase() {
  var opening = ["B", "R", "G", "B", "Y", "R"];
  var shooter = new ShooterController();
  shooter.initialize({});
  shooter.configureLevel({
    level: {
      levelId: 50,
      shotLimit: 8,
      playMode: "shot_limited",
      colors: ["B", "R", "G", "Y"],
      spawnWeights: { B: 1, R: 1, G: 1, Y: 1 },
      openingShotBalls: opening
    }
  });
  opening.forEach(function (expectedColor, index) {
    if (!shooter.currentBall || shooter.currentBall.color !== expectedColor) {
      throw new Error("Authored opening shot order mismatch at index " + index + ".");
    }
    shooter.advanceQueue(7 - index, false);
  });
  if (shooter.getShooterState().authoredOpeningQueue.length !== 0) {
    throw new Error("Authored opening shot queue must be exhausted after six shots.");
  }

  var revivedShooter = new ShooterController();
  revivedShooter.initialize({});
  revivedShooter.configureLevel({
    level: {
      levelId: 50,
      shotLimit: 8,
      playMode: "shot_limited",
      colors: ["B", "R", "G", "Y"],
      spawnWeights: { B: 1, R: 1, G: 1, Y: 1 },
      openingShotBalls: opening
    }
  });
  revivedShooter.setUpcomingRandomNormalBalls(2);
  if (revivedShooter.getShooterState().authoredOpeningQueue.length !== 0) {
    throw new Error("Revive queue replacement must clear the remaining authored opening shots.");
  }
}

function runSkillBallShotsDoNotConsumeRemainingShotsCase() {
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
  ["rainbow", "blast"].forEach(function (entityType) {
    var manager = new GameManager();
    manager.state = "running";
    manager.isTimedInfiniteShots = false;
    manager.remainingShots = 3;
    manager.shotsFired = 0;
    manager._isBoardAdvanceBusy = function () {
      return false;
    };
    manager._resolveAssistSpiritProducedBallAfterFire = function () {};
    manager.getRuntimeSnapshot = function (events) {
      return {
        remainingShots: this.remainingShots,
        shotsFired: this.shotsFired,
        activeProjectile: this.activeProjectile,
        runtimeEvents: Array.isArray(events) ? events : []
      };
    };

    var shooter = manager.systems.shooterController;
    var levelConfig = {
      level: {
        levelId: 54,
        shotLimit: 3,
        playMode: "shot_limited",
        colors: ["R", "B"],
        spawnWeights: { R: 1, B: 1 },
        initialShotBalls: ["R", "B"]
      }
    };
    manager.currentLevel = levelConfig;
    shooter.initialize({});
    shooter.configureLevel(levelConfig);
    shooter.skillInventory[entityType] = 1;

    var useResult = manager.useSkillBall(entityType);
    if (!useResult.accepted) {
      throw new Error(entityType + " skill ball must equip before the shot-supply regression check.");
    }
    if (entityType === "rainbow") {
      var colorResult = manager.selectRainbowColor("R");
      if (!colorResult.accepted) {
        throw new Error("Rainbow skill ball color selection must succeed before firing.");
      }
    }

    manager.pendingShotPlan = {
      valid: true,
      hitType: "cell",
      targetCell: { row: 0, col: 0 },
      wallBounceCount: 0,
      pathPoints: [
        { x: 0, y: 0 },
        { x: 0, y: 100 }
      ]
    };
    var snapshot = manager.fireShot();
    if (manager.remainingShots !== 3 || snapshot.remainingShots !== 3) {
      throw new Error(entityType + " skill ball shot must not consume remaining normal shots.");
    }
    if (manager.shotsFired !== 1 || snapshot.shotsFired !== 1) {
      throw new Error(entityType + " skill ball shot must still count as a real fired shot.");
    }
    if (
      !manager.activeProjectile ||
      !manager.activeProjectile.ball ||
      (
        entityType === "rainbow" &&
        manager.activeProjectile.ball.sourceSkillBallType !== "rainbow"
      ) ||
      (
        entityType === "blast" &&
        (
          manager.activeProjectile.ball.entityCategory !== "skill_ball" ||
          manager.activeProjectile.ball.entityType !== "blast"
        )
      )
    ) {
      throw new Error(entityType + " skill ball shot must create the matching skill projectile.");
    }
    if (!shooter.currentBall || shooter.currentBall.entityCategory !== "normal_ball" || !shooter.nextBall) {
      throw new Error(entityType + " skill ball shot must preserve all three remaining normal shots in the queue.");
    }
  });

  var normalManager = new GameManager();
  normalManager.state = "running";
  normalManager.isTimedInfiniteShots = false;
  normalManager.remainingShots = 3;
  normalManager.shotsFired = 0;
  normalManager._isBoardAdvanceBusy = function () {
    return false;
  };
  normalManager._resolveAssistSpiritProducedBallAfterFire = function () {};
  normalManager.getRuntimeSnapshot = function () {
    return {
      remainingShots: this.remainingShots,
      shotsFired: this.shotsFired
    };
  };
  normalManager.systems.shooterController.initialize({});
  normalManager.systems.shooterController.configureLevel({
    level: {
      levelId: 55,
      shotLimit: 3,
      playMode: "shot_limited",
      colors: ["R", "B"],
      spawnWeights: { R: 1, B: 1 },
      initialShotBalls: ["R", "B"]
    }
  });
  normalManager.pendingShotPlan = {
    valid: true,
    hitType: "cell",
    targetCell: { row: 0, col: 0 },
    wallBounceCount: 0,
    pathPoints: [
      { x: 0, y: 0 },
      { x: 0, y: 100 }
    ]
  };
  normalManager.fireShot();
  if (normalManager.remainingShots !== 2 || normalManager.shotsFired !== 1) {
    throw new Error("Normal ball shots must continue consuming exactly one remaining shot.");
  }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runRandomShotColorStreakLimitCase() {
  var previousRandom = Math.random;
  try {
    Math.random = function () {
      return 0;
    };

    var shooter = new ShooterController();
    shooter.initialize({});
    shooter.configureLevel({
      level: {
        levelId: 51,
        shotLimit: 8,
        playMode: "shot_limited",
        colors: ["R", "B"],
        spawnWeights: { R: 100, B: 1 }
      }
    });

    var firedColors = [];
    for (var index = 0; index < 6; index += 1) {
      firedColors.push(shooter.currentBall.color);
      shooter.advanceQueue(7 - index, false);
    }
    if (JSON.stringify(firedColors) !== JSON.stringify(["R", "R", "B", "R", "R", "B"])) {
      throw new Error("Random shot colors must exclude a color after two consecutive selections.");
    }

    var initialColorShooter = new ShooterController();
    initialColorShooter.initialize({});
    initialColorShooter.configureLevel({
      level: {
        levelId: 52,
        shotLimit: 5,
        playMode: "shot_limited",
        colors: ["R", "B"],
        spawnWeights: { R: 100, B: 1 },
        initialShotBalls: ["B", "B"]
      }
    });
    var initialThenRandomColors = [];
    for (var initialIndex = 0; initialIndex < 5; initialIndex += 1) {
      initialThenRandomColors.push(initialColorShooter.currentBall.color);
      initialColorShooter.advanceQueue(4 - initialIndex, false);
    }
    if (JSON.stringify(initialThenRandomColors) !== JSON.stringify(["B", "B", "R", "R", "B"])) {
      throw new Error("Configured initial shot colors must not count toward the random color streak.");
    }

    var singleColorShooter = new ShooterController();
    singleColorShooter.initialize({});
    singleColorShooter.configureLevel({
      level: {
        levelId: 53,
        shotLimit: 3,
        playMode: "shot_limited",
        colors: ["R"],
        spawnWeights: { R: 1 }
      }
    });
    var rejectedImpossibleThirdColor = false;
    try {
      singleColorShooter.advanceQueue(2, false);
    } catch (error) {
      rejectedImpossibleThirdColor = error.message.indexOf("third consecutive random color") >= 0;
    }
    if (!rejectedImpossibleThirdColor) {
      throw new Error("A single-color random queue must fail fast before generating a third same-color ball.");
    }
  } finally {
    Math.random = previousRandom;
  }
}

function runBoardIntroViewportCase() {
  var BoardViewportConfig = require("../gameplay-src/config/BoardViewportConfig");
  var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");

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
  var BoardViewportConfig = require("../gameplay-src/config/BoardViewportConfig");
  var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");

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

function runTopAnchorCollapseTriggerCase() {
  var maxColumns = 11;
  var singleRowFiveEmptySlots = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
    { row: 0, col: 4 },
    { row: 0, col: 5 }
  ];
  if (BoardViewportSystem.shouldTriggerTopAnchorCollapse(singleRowFiveEmptySlots, maxColumns)) {
    throw new Error("Single remaining row must not trigger top anchor collapse when top empty slots are not greater than 5.");
  }

  var singleRowSixEmptySlots = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
    { row: 0, col: 4 }
  ];
  if (!BoardViewportSystem.shouldTriggerTopAnchorCollapse(singleRowSixEmptySlots, maxColumns)) {
    throw new Error("Top anchor collapse must trigger when top empty slots are greater than 5.");
  }
}

function runTopAnchorCollapseCancelsPendingSplitterSpawnCase() {
  var manager = new GameManager();
  var cells = [
    {
      id: "splitter_top_0",
      row: 0,
      col: 0,
      color: "G",
      entityCategory: "reactive_ball",
      entityType: "splitter",
      splitColor: "G"
    },
    {
      id: "normal_1_0",
      row: 1,
      col: 0,
      color: "R",
      entityCategory: "normal_ball",
      entityType: null
    }
  ];
  var registeredDrops = [];
  var registeredDropOptions = null;

  manager.state = "running";
  manager.lastResolution = {
    spawnedBySplitters: [],
    reactiveTriggered: [],
    matched: [],
    floating: [],
    collected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    boardViewportAdjusted: false
  };
  manager.pendingSplitterSpawns = [{
    id: "splitter_top_0",
    row: 0,
    col: 0,
    splitColor: "G",
    remainingDelay: 0
  }];
  manager.systems.bubbleGrid = {
    maxColumns: 11,
    getCells: function () {
      return cells.slice();
    },
    getWormholePairs: function () {
      return [];
    },
    removeFloatingCells: function (removeTargets) {
      var removed = [];
      removeTargets.forEach(function (target) {
        var index = cells.findIndex(function (cell) {
          return cell.row === target.row && cell.col === target.col;
        });
        if (index >= 0) {
          removed.push(cells[index]);
          cells.splice(index, 1);
        }
      });
      return removed;
    }
  };
  manager.systems.fallingMarbleSystem = {
    registerDrops: function (drops, grid, options) {
      registeredDrops = registeredDrops.concat(drops);
      registeredDropOptions = options;
    }
  };

  if (!manager._tryTopAnchorCollapse()) {
    throw new Error("Top anchor collapse pending splitter regression expected collapse.");
  }
  if (manager.pendingSplitterSpawns.length !== 0) {
    throw new Error("Top anchor collapse must cancel pending splitter spawns from removed splitters.");
  }
  if (cells.length !== 0) {
    throw new Error("Top anchor collapse must remove all live board cells.");
  }
  if (registeredDrops.length !== 2) {
    throw new Error("Top anchor collapse must register all removed cells as drops.");
  }
  if (!registeredDropOptions || registeredDropOptions.startDelay !== 0) {
    throw new Error("Top anchor collapse drops must start without delay.");
  }
  if (registeredDropOptions.holdUntilEliminationPresentationComplete === true) {
    throw new Error("Top anchor collapse drops must not wait for an elimination callback that already completed.");
  }
  if (manager.state !== "won_pending") {
    throw new Error("Top anchor collapse must enter won_pending while drops settle.");
  }
  if (manager.lastResolution.topAnchorCollapse !== true) {
    throw new Error("Top anchor collapse must mark lastResolution.topAnchorCollapse.");
  }
  if (manager._updatePendingSplitterSpawns(0.01)) {
    throw new Error("Canceled splitter spawn must not recreate a residual top bubble after collapse.");
  }
}

function runSplitterSpawnViewportSettleCase() {
  var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");

  syncHudBottomLineYForValidation();

  function cloneCells(cells) {
    return cells.map(function (cell) {
      return {
        row: cell.row,
        col: cell.col
      };
    });
  }

  var manager = new GameManager();
  var viewport = new BoardViewportSystem();
  var cells = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
    { row: 1, col: 0 },
    { row: 2, col: 0 },
    { row: 3, col: 0 },
    { row: 4, col: 0 },
    { row: 5, col: 0 },
    { row: 6, col: 0 },
    { row: 7, col: 0 },
    { row: 8, col: 0 },
    { row: 9, col: 0 }
  ];
  var intro = viewport.planIntroPosition(cells);
  if (intro.needsScroll) {
    throw new Error("Splitter spawn viewport setup must start from a settled 10-row board.");
  }
  viewport.offsetY = intro.targetOffsetY;
  viewport.targetOffsetY = intro.targetOffsetY;
  viewport.introActive = false;
  viewport.phase = "idle";

  manager.state = "running";
  manager.remainingShots = 1;
  manager.lastResolution = {
    spawnedBySplitters: [],
    reactiveTriggered: [],
    matched: [],
    floating: [],
    collected: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    boardViewportAdjusted: false
  };
  manager.pendingSplitterSpawns = [{
    id: "splitter_5_0",
    row: 5,
    col: 0,
    splitColor: "G",
    remainingDelay: 0
  }];
  manager.systems.boardViewportSystem = viewport;
  manager.systems.bubbleGrid = {
    maxColumns: 9,
    version: 1,
    getCells: function () {
      return cloneCells(cells);
    },
    snapshot: function () {
      return {
        cells: cloneCells(cells),
        viewportOffsetY: viewport.offsetY
      };
    },
    findSplitterSpawnCell: function () {
      return { row: 10, col: 0 };
    },
    addBubble: function (cell, color) {
      if (color !== "G") {
        throw new Error("Splitter spawn regression expected splitColor G.");
      }
      cells.push({ row: cell.row, col: cell.col });
      this.version += 1;
      return {
        id: "spawned_10_0",
        row: cell.row,
        col: cell.col,
        color: color
      };
    },
    assertNoVisualOverlap: function () {
      return true;
    }
  };
  manager.systems.fallingMarbleSystem = {
    hasActiveDrops: function () {
      return false;
    }
  };

  if (!manager._updatePendingSplitterSpawns(0.01)) {
    throw new Error("Splitter spawn viewport regression expected a spawned cell.");
  }
  if (manager.lastResolution.spawnedBySplitters.length !== 1) {
    throw new Error("Splitter spawn viewport regression must record spawned splitter cells.");
  }
  if (manager.lastResolution.boardViewportAdjusted !== true) {
    throw new Error("Splitter spawn must mark boardViewportAdjusted when it expands the board past 10 rows.");
  }
  if (!viewport.isMoving()) {
    throw new Error("Splitter spawn on the 11th row must start board viewport settling.");
  }
  if (Math.abs(viewport.targetOffsetY - viewport.offsetY - BoardLayout.rowHeight) > 0.5) {
    throw new Error("Splitter spawn viewport settle must move upward exactly one row.");
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
  var projectRoot = path.resolve(__dirname, "..");
  var levelRendererSource = readGameplaySourceFamily(
    projectRoot,
    "gameplay-src/render",
    "LevelRenderer"
  );
  var levelRendererSceneBoardSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneBoardMethods.js"),
    "utf8"
  );
  if (levelRendererSource.indexOf("lastBoardViewportOffsetY") < 0) {
    throw new Error("LevelRenderer must cache the last rendered board viewport offset.");
  }
  if (levelRendererSource.indexOf("boardViewportOffsetY !== this.lastBoardViewportOffsetY") < 0) {
    throw new Error("LevelRenderer must refresh board rendering when viewportOffsetY changes.");
  }
  if (levelRendererSceneBoardSource.indexOf("this.lastBoardViewportOffsetY = boardSnapshot.viewportOffsetY") < 0) {
    throw new Error("Board render must record the rendered viewportOffsetY.");
  }
  if (levelRendererSceneBoardSource.indexOf("Number.isInteger(boardSnapshot.viewportOffsetY)") >= 0) {
    throw new Error("Board viewport render paths must accept fractional viewportOffsetY during linear movement.");
  }
  var gameManagerSource = readGameplaySourceFamily(
    projectRoot,
    "gameplay-src/core",
    "GameManager"
  );
  if (gameManagerSource.indexOf("var viewportWasMoving = this.systems.boardViewportSystem.isMoving()") < 0) {
    throw new Error("GameManager.update must detect in-progress board viewport movement before update.");
  }
  if (gameManagerSource.indexOf("viewportUpdated ||") < 0) {
    throw new Error("GameManager.update must return render snapshots while board viewport is moving.");
  }
}

function runShooterHandoffInputLockCase() {
  var shooterMethodsSource = fs.readFileSync(
    path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneShooterMethods.js"),
    "utf8"
  );
  var gameplayInputSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrapGameplayInputMethods.js"),
    "utf8"
  );
  var gameBootstrapSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrap.js"),
    "utf8"
  );
  if (shooterMethodsSource.indexOf("isShooterHandoffInProgress") < 0) {
    throw new Error("LevelRenderer must expose shooter handoff busy state for input locking.");
  }
  if (gameplayInputSource.indexOf("_isShooterHandoffInputLocked") < 0) {
    throw new Error("GameBootstrap gameplay input must check shooter handoff lock.");
  }
  if (gameplayInputSource.indexOf("GameBootstrap shot input requires LevelRenderer.isShooterHandoffInProgress.") < 0) {
    throw new Error("Shooter handoff input lock must fail fast when renderer contract is missing.");
  }
  if (
    gameplayInputSource.indexOf('this.node.on(cc.Node.EventType.TOUCH_CANCEL, this._onAimCancel, this)') < 0 ||
    gameplayInputSource.indexOf("this.gameManager.isAiming && event && typeof event.getLocation === \"function\"") < 0 ||
    gameplayInputSource.indexOf("this._onFireTouch(event)") < 0
  ) {
    throw new Error("Aiming touch cancellation above the shooter must fire the visible trajectory at the node boundary.");
  }
  var handoffLockCheckCount = (gameplayInputSource.match(/this\._isShooterHandoffInputLocked\(\)\)/g) || []).length;
  if (handoffLockCheckCount < 3) {
    throw new Error("Aim and fire input must not advance shooter queue while handoff is still animating.");
  }
  if (gameBootstrapSource.indexOf("_isShooterHandoffInputLocked: GameBootstrapGameplayInputMethods._isShooterHandoffInputLocked") < 0) {
    throw new Error("GameBootstrap must attach shooter handoff input lock helper to the component.");
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
  var methods = require("../gameplay-src/core/GameManagerShotResolutionMethods");
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var manager = new GameManagerCtor();
  manager.score = 500;
  manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
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
      fairyMultiplier: 1,
      position: { x: 0, y: -320 }
    }
  ]);
  if (gained !== 0) {
    throw new Error("Stone ball jar collection must score 0 points.");
  }
  if (manager.score !== 500) {
    throw new Error("Stone ball jar collection must not change total score.");
  }
  if (manager.lastResolution.scoreEvents.length !== 0) {
    throw new Error("Stone ball jar collection must not emit floating score events.");
  }
}

function runJarCollectionFloatingScoreEventCase() {
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var manager = new GameManagerCtor();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    manager.score = 0;
    manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
    manager.systems = {
      trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
      jarCollectorSystem: new JarCollectorSystem()
    };
    manager.systems.jarCollectorSystem.jarCount = 1;
    manager.systems.jarCollectorSystem.jarColors = ["R"];
    manager._getScoreRule = function () {
      return 0;
    };
    var runtimeEvents = [];
    manager._pushRuntimeEvent = function (type, payload) {
      runtimeEvents.push({
        type: type,
        payload: payload
      });
    };

    var gained = manager._applyJarCollectionScore([
      {
        id: "red_drop_1",
        color: "R",
        row: 4,
        col: 2,
        jarIndex: 0,
        bonusMultiplier: 1,
        fairyMultiplier: 1,
        position: { x: 32, y: -729 }
      }
    ]);

    if (gained <= 0 || manager.score !== gained || manager.lastResolution.scoreDelta !== gained) {
      throw new Error("Jar collection should add scored drop points to score and resolution.");
    }
    if (manager.lastResolution.scoreEvents.length !== 0) {
      throw new Error("Jar collection must not emit a second ball score event.");
    }
    if (runtimeEvents.length !== 1 || runtimeEvents[0].type !== "jar_collect_scored") {
      throw new Error("Jar collection should emit the dedicated jar score display event.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runOutsideJarCleanupScoreCase() {
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  var manager = new GameManagerCtor();
  manager.score = 0;
  manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
  manager.sameColorJarCollected = 0;
  manager.sameColorJarBonusScore = 0;
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    jarCollectorSystem: new JarCollectorSystem()
  };
  manager.systems.jarCollectorSystem.jarCount = 1;
  manager.systems.jarCollectorSystem.jarColors = ["R"];
  manager.systems.jarCollectorSystem.collectedTotal = 0;
  manager.systems.jarCollectorSystem.collectedByColor = { R: 0 };
  manager._getScoreRule = function () {
    return 0;
  };
  var runtimeEvents = [];
  manager._pushRuntimeEvent = function (type, payload) {
    runtimeEvents.push({ type: type, payload: payload });
  };

  try {
    var gained = manager._applyJarCollectionScore([
      {
        id: "outside_cleanup_red",
        color: "R",
        row: 4,
        col: 2,
        jarIndex: 0,
        jarColor: "R",
        sameColor: true,
        bonusMultiplier: 1.6,
        fairyMultiplier: 1,
        scoreOnly: true,
        reason: "outside_jar_cleanup",
        position: { x: 100, y: -600 }
      }
    ]);

    if (gained <= 0 || manager.score !== gained || manager.lastResolution.scoreDelta !== gained) {
      throw new Error("Outside-jar cleanup must preserve jar score settlement.");
    }
    if (manager.sameColorJarCollected !== 0) {
      throw new Error("Outside-jar cleanup score must not increment same-color collection count.");
    }
    if (
      manager.systems.jarCollectorSystem.collectedTotal !== 0 ||
      manager.systems.jarCollectorSystem.collectedByColor.R !== 0
    ) {
      throw new Error("Outside-jar cleanup score must not increment jar collection objectives.");
    }
    if (runtimeEvents.length !== 1 || runtimeEvents[0].type !== "jar_collect_scored") {
      throw new Error("Outside-jar cleanup score must emit the jar floating-score event.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runBlackAndWhiteJarScoreCase() {
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    var manager = new GameManagerCtor();
    manager.score = 0;
    manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
    manager.systems = {
      trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
      jarCollectorSystem: new JarCollectorSystem()
    };
    manager.systems.jarCollectorSystem.jarCount = 1;
    manager.systems.jarCollectorSystem.jarColors = ["R"];
    manager._getScoreRule = function () {
      return 0;
    };
    var runtimeEvents = [];
    manager._pushRuntimeEvent = function (type, payload) {
      runtimeEvents.push({ type: type, payload: payload });
    };

    var gained = manager._applyJarCollectionScore([
      {
        id: "black_drop_1",
        color: "K",
        jarIndex: 0,
        bonusMultiplier: 1,
        fairyMultiplier: 1,
        position: { x: 0, y: -320 }
      },
      {
        id: "white_drop_1",
        color: "W",
        jarIndex: 0,
        bonusMultiplier: 1,
        fairyMultiplier: 1,
        position: { x: 0, y: -320 }
      }
    ]);

    if (gained <= 0 || manager.score !== gained || manager.lastResolution.scoreDelta !== gained) {
      throw new Error("Black and white balls entering jars must receive normal jar score.");
    }
    if (
      runtimeEvents.length !== 1 ||
      runtimeEvents[0].type !== "jar_collect_scored" ||
      runtimeEvents[0].payload.count !== 2
    ) {
      throw new Error("Black and white jar scores must emit one normal jar score event.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runJarScoreIntegerRoundingCase() {
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    var manager = new GameManagerCtor();
    manager.score = 0;
    manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
    manager.systems = {
      trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
      jarCollectorSystem: new JarCollectorSystem()
    };
    manager.systems.jarCollectorSystem.jarCount = 3;
    manager.systems.jarCollectorSystem.jarColors = ["R", "G", "B"];
    manager._getScoreRule = function () {
      return 0;
    };
    var runtimeEvents = [];
    manager._pushRuntimeEvent = function (type, payload) {
      runtimeEvents.push({ type: type, payload: payload });
    };

    var gained = manager._applyJarCollectionScore([{
      id: "rounded_fairy_drop",
      color: "R",
      jarIndex: 0,
      bonusMultiplier: 2.3,
      fairyMultiplier: 1.25,
      position: { x: 0, y: -320 }
    }]);
    if (gained !== 173 || !Number.isInteger(gained) || manager.score !== 173) {
      throw new Error("Jar score must round the final fairy multiplier result to one integer score.");
    }
    if (
      runtimeEvents.length !== 1 ||
      runtimeEvents[0].payload.drop_entries[0].final_score !== 173 ||
      !Number.isInteger(runtimeEvents[0].payload.drop_entries[0].final_score)
    ) {
      throw new Error("Jar score floating event must expose the final integer score.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runColorPermutationJarScoreCase() {
  var GameManagerCtor = require("../gameplay-src/core/GameManager");
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var LevelColorPermutation = require("../assets/scripts/config/LevelColorPermutation");
  var sourceLevel = require("../assets/map/config/levels/level_001.json");
  var levelConfig = JSON.parse(JSON.stringify(sourceLevel));
  levelConfig.level.colors = ["R", "B"];
  levelConfig.level.colorCount = 2;
  levelConfig.level.layout = levelConfig.level.layout.map(function (rowString, rowIndex) {
    return rowString.split("").map(function (cellCode, colIndex) {
      return cellCode === "." ? "." : ((rowIndex + colIndex) % 2 === 0 ? "R" : "B");
    }).join("");
  });
  levelConfig.level.jarColors = ["R", "B", "B"];
  levelConfig.level.spawnWeights = { R: 1, B: 1 };
  levelConfig.level.winConditions = [
    { type: "collect_color", color: "B", value: 1 }
  ];
  levelConfig.level.bonusObjectives = [];
  levelConfig.level.specialEntities = [];
  delete levelConfig.level.initialShotBalls;
  delete levelConfig.level.openingShotBalls;
  levelConfig.meta = {
    levelKey: "level_001"
  };
  var previousRandom = Math.random;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    Math.random = function () {
      return 0;
    };
    LevelColorPermutation.apply(levelConfig);
    var level = levelConfig.level;
    if (JSON.stringify(level.colors) !== JSON.stringify(["G", "Y"])) {
      throw new Error("Color permutation should map first-level colors from R/B to G/Y.");
    }
    if (JSON.stringify(level.jarColors) !== JSON.stringify(["G", "Y", "Y"])) {
      throw new Error("Color permutation should map jarColors with runtime colors.");
    }
    if (!level.winConditions[0] || level.winConditions[0].color !== "Y") {
      throw new Error("Color permutation should map collect_color objective.");
    }

    var manager = new GameManagerCtor();
    manager.score = 0;
    manager.lastResolution = { scoreDelta: 0, scoreEvents: [] };
    manager.systems = {
      trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
      jarCollectorSystem: new JarCollectorSystem()
    };
    manager.systems.jarCollectorSystem.configureLevel(levelConfig);
    manager._pushRuntimeEvent = function () {};

    var gained = manager._applyJarCollectionScore([
      {
        id: "permuted_green_into_yellow_jar",
        color: "G",
        row: 4,
        col: 2,
        jarIndex: 1,
        jarColor: "Y",
        sameColor: false,
        bonusMultiplier: 1,
        fairyMultiplier: 1,
        position: { x: 12, y: -729 }
      }
    ]);

    if (gained <= 0 || manager.score !== gained || manager.lastResolution.scoreDelta !== gained) {
      throw new Error("Permuted non-same-color jar drop should score base jar points.");
    }
    if (manager.lastResolution.scoreEvents.length !== 0) {
      throw new Error("Permuted non-same-color jar drop must not emit a second ball score event.");
    }
  } finally {
    Math.random = previousRandom;
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runComboMatchedBallScoreDisplayCase() {
  var manager = new GameManager();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    manager.score = 0;
    manager.comboStreak = 1;
    manager.maxComboStreak = 1;
    manager.scoreRules = {
      matchedDrop: 10,
      floatingDrop: 80
    };
    var runtimeEvents = [];
    manager._pushRuntimeEvent = function (type, payload) {
      runtimeEvents.push({
        type: type,
        payload: payload
      });
    };

    var attachedCell = { id: "attached", row: 0, col: 0 };
    var matchedCells = [
      { id: "m1", row: 0, col: 0 },
      { id: "m2", row: 0, col: 1 },
      { id: "m3", row: 1, col: 0 }
    ];
    var grid = {
      getCellPosition: function (row, col) {
        return { x: col * 10, y: row * 10 };
      }
    };

    manager.comboStreak = 0;
    var baseScorePerBall = manager._getMatchedDropScorePerBallForNextCombo("matchedDrop");
    if (baseScorePerBall !== 10) {
      throw new Error("Base matched ball score should be 10.");
    }
    manager.comboStreak = 1;
    var secondComboScorePerBall = manager._getMatchedDropScorePerBallForNextCombo("matchedDrop");
    if (secondComboScorePerBall !== 15) {
      throw new Error("Second combo matched ball score should be 15.");
    }
    var secondElimination = EliminationSequenceBuilder.buildEliminationSequence(
      attachedCell,
      matchedCells,
      grid,
      secondComboScorePerBall
    );
    secondElimination.scoreEvents.forEach(function (scoreEvent) {
      if (scoreEvent.points !== 15) {
        throw new Error("Second combo floating score display should use 15 per shattered ball.");
      }
    });

    var resolution = {
      attachedCell: attachedCell,
      matched: matchedCells,
      floating: [],
      scoreDelta: 0,
      eliminationSequence: secondElimination.eliminationSequence,
      scoreEvents: secondElimination.scoreEvents
    };
    manager._applyResolutionDropScore(resolution, "matchedDrop", {
      matchedScorePerBall: secondComboScorePerBall
    });
    manager._registerComboElimination(resolution);
    if (manager.score !== 45 || resolution.scoreDelta !== 45) {
      throw new Error("Second combo score should be fully carried by matched shattered balls.");
    }
    if (runtimeEvents.length !== 2 || runtimeEvents[1].payload.combo_display !== 1 || runtimeEvents[1].payload.bonus_gained !== 15) {
      throw new Error("Second combo event should report the matched-ball combo bonus without adding a separate fixed score.");
    }

    var thirdComboScorePerBall = manager._getMatchedDropScorePerBallForNextCombo("matchedDrop");
    if (thirdComboScorePerBall !== 20) {
      throw new Error("Third combo matched ball score should be 20.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runBallScoreDisplayGenerationCase() {
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var scheduledCallbacks = [];
  var spawned = [];

  global.cc = {
    director: {
      getScheduler: function () {
        return {
          schedule: function (callback) {
            scheduledCallbacks.push(callback);
          },
          unschedule: function () {}
        };
      }
    }
  };

  try {
    function ValidationRenderer() {}
    attachLevelRendererSceneHudMethods(ValidationRenderer, {
      BoardLayout: BoardLayout
    });

    var renderer = Object.create(ValidationRenderer.prototype);
    renderer.playedBallScoreCellIds = {};
    renderer.pendingBallScoreCellIds = {};
    renderer.pendingBallScoreCallbacks = {};
    renderer.ballScoreDisplayGeneration = 1;
    renderer.currentBallScoreResolution = null;
    renderer._getGameViewNode = function () {
      return { isValid: true };
    };
    renderer._convertBoardPointToGameView = function (x, y) {
      return { x: x, y: y };
    };
    renderer._spawnBallScoreDisplay = function (scoreEvent, position) {
      spawned.push({
        cellId: scoreEvent.cellId,
        position: position
      });
    };

    var oldResolution = {
      eliminationSequence: [
        { cellId: "same", worldPosition: { x: 1, y: 2 } }
      ]
    };
    var newResolution = {
      eliminationSequence: [
        { cellId: "same", worldPosition: { x: 3, y: 4 } }
      ]
    };

    renderer.currentBallScoreResolution = oldResolution;
    renderer._scheduleBallScoreEvent(
      { cellId: "same", points: 10, delayMs: 30 },
      oldResolution,
      { maxColumns: 10, viewportOffsetY: 0 },
      0,
      1
    );
    renderer.currentBallScoreResolution = newResolution;
    renderer.ballScoreDisplayGeneration = 2;
    scheduledCallbacks[0]();
    if (spawned.length !== 0) {
      throw new Error("Stale ball score callback must not spawn into a newer resolution.");
    }

    renderer._scheduleBallScoreEvent(
      { cellId: "same", points: 10, delayMs: 0, worldPosition: { x: 9, y: 8 } },
      newResolution,
      { maxColumns: 10, viewportOffsetY: 0 },
      0,
      2
    );
    renderer._scheduleBallScoreEvent(
      { cellId: "same", points: 20, delayMs: 0, worldPosition: { x: 7, y: 6 } },
      newResolution,
      { maxColumns: 10, viewportOffsetY: 0 },
      1,
      2
    );
    if (
      spawned.length !== 2 ||
      spawned[0].position.x !== 9 ||
      spawned[1].position.x !== 7
    ) {
      throw new Error("Ball score events with the same cellId must keep independent displays and positions.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runTimeBonusFloatingScoreDisplayCase() {
  function ValidationRenderer() {}
  attachLevelRendererSceneHudMethods(ValidationRenderer, {
    BoardLayout: BoardLayout
  });

  var renderer = Object.create(ValidationRenderer.prototype);
  renderer.playedTimeBonusAwardedEvents = [];
  var spawned = [];
  renderer._convertBoardPointToGameView = function (x, y) {
    return { x: x + 17, y: y - 23 };
  };
  renderer._spawnBallScoreDisplay = function (scoreEvent, position) {
    spawned.push({
      cellId: scoreEvent.cellId,
      points: scoreEvent.points,
      position: position
    });
  };

  var firstEvent = {
    id: 41,
    type: "time_bonus_awarded",
    cells: [
      { id: "2_4", row: 2, col: 4, bonusSeconds: 5 },
      { id: "3_1", row: 3, col: 1, bonusSeconds: 5 }
    ]
  };
  var snapshot = {
    board: { maxColumns: 10, viewportOffsetY: 0 },
    runtimeEvents: [firstEvent]
  };
  renderer._playTimeBonusFloatingScoreDisplay(snapshot);
  renderer._playTimeBonusFloatingScoreDisplay(snapshot);

  var expectedFirstPosition = BoardLayout.getCellPosition(2, 4, 10, 0);
  if (
    spawned.length !== 2 ||
    spawned[0].cellId !== "time_bonus_41_2_4" ||
    spawned[0].points !== 5 ||
    spawned[0].position.x !== expectedFirstPosition.x + 17 ||
    spawned[0].position.y !== expectedFirstPosition.y - 23
  ) {
    throw new Error("Time bonus award must float +5 from the removed ball position exactly once.");
  }

  var sameIdNewEvent = {
    id: 41,
    type: "time_bonus_awarded",
    cells: [
      { id: "4_2", row: 4, col: 2, bonusSeconds: 5 }
    ]
  };
  renderer._playTimeBonusFloatingScoreDisplay({
    board: { maxColumns: 10, viewportOffsetY: 0 },
    runtimeEvents: [sameIdNewEvent]
  });
  if (spawned.length !== 3 || spawned[2].cellId !== "time_bonus_41_4_2") {
    throw new Error("Time bonus floating score must use event-object identity rather than a persistent numeric id.");
  }
}

function runJarFractionDisplayEventIdentityCase() {
  function ValidationRenderer() {}
  attachLevelRendererSceneHudMethods(ValidationRenderer, {
    BoardLayout: BoardLayout
  });

  var renderer = Object.create(ValidationRenderer.prototype);
  renderer.lastJarCollectScoredEvent = null;
  var spawned = [];
  renderer._spawnJarFractionDisplay = function (entry) {
    spawned.push(entry.jarIndex);
  };

  var firstEvent = {
    id: 1,
    type: "jar_collect_scored",
    entries: [{ jarIndex: 0, gained: 10 }]
  };
  renderer._playJarFractionDisplay({ runtimeEvents: [firstEvent] });
  renderer._playJarFractionDisplay({ runtimeEvents: [firstEvent] });

  var secondEvent = {
    id: 1,
    type: "jar_collect_scored",
    entries: [{ jarIndex: 1, gained: 20 }]
  };
  renderer._playJarFractionDisplay({ runtimeEvents: [secondEvent] });

  if (spawned.length !== 2 || spawned[0] !== 0 || spawned[1] !== 1) {
    throw new Error("Jar score events with the same id must display once per event object.");
  }
}

function runJarFractionBundleUnloadCleanupCase() {
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var stoppedNodes = [];

  global.cc = {
    Tween: {
      stopAllByTarget: function (node) {
        stoppedNodes.push(node.name);
      }
    }
  };

  try {
    function ValidationRenderer() {}
    attachLevelRendererSceneHudMethods(ValidationRenderer, {
      BoardLayout: BoardLayout
    });

    function createClone(name, isPooled) {
      return {
        name: name,
        isValid: true,
        __isJarFractionClone: true,
        __isJarFractionPooled: isPooled,
        __jarFractionDisplayToken: "old-token",
        destroy: function () {
          this.isValid = false;
        }
      };
    }

    var pooledClone = createClone("pooled_fraction", true);
    var activeClone = createClone("active_fraction", false);
    var templateNode = {
      name: "fraction",
      isValid: true
    };
    var renderer = Object.create(ValidationRenderer.prototype);
    renderer.jarFractionNodePool = [pooledClone];
    renderer.jarFractionDisplayGeneration = 4;
    renderer.lastJarCollectScoredEvent = { id: 8 };
    renderer._getGameViewNode = function () {
      return {
        isValid: true,
        children: [templateNode, activeClone]
      };
    };

    renderer._releaseJarFractionNodesBeforeGameplayBundleUnload();

    if (renderer.jarFractionNodePool.length !== 0) {
      throw new Error("Gameplay bundle release must clear the jar fraction node pool.");
    }
    if (renderer.jarFractionDisplayGeneration !== 5 || renderer.lastJarCollectScoredEvent !== null) {
      throw new Error("Gameplay bundle release must invalidate jar fraction display state.");
    }
    if (pooledClone.isValid || activeClone.isValid || !templateNode.isValid) {
      throw new Error("Gameplay bundle release must destroy only jar fraction clones.");
    }
    if (stoppedNodes.length !== 2) {
      throw new Error("Gameplay bundle release must stop every jar fraction clone tween.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runMatchedObjectiveCollectionCase() {
  var JarCollectorSystem = require("../gameplay-src/systems/JarCollectorSystem");
  var manager = new GameManager();
  manager.currentLevel = {
    level: {
      jarCount: 1,
      jarColors: ["R"],
      bonusObjectives: [
        { type: "collect_color", color: "R", value: 3 }
      ],
      winConditions: []
    }
  };
  manager.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    jarCollectorSystem: new JarCollectorSystem()
  };
  manager.systems.jarCollectorSystem.configureLevel(manager.currentLevel);
  var runtimeEvents = [];
  manager._pushRuntimeEvent = function (type, payload) {
    runtimeEvents.push({
      type: type,
      payload: payload
    });
  };

  var matchedCells = [
    { id: "target_1", row: 0, col: 0, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "other_1", row: 0, col: 1, color: "B", entityCategory: "normal_ball", entityType: null },
    { id: "target_2", row: 1, col: 0, color: "R", entityCategory: "normal_ball", entityType: null }
  ];
  var eliminationSequence = [
    { cellId: "target_1", row: 0, col: 0, worldPosition: { x: 10, y: 20 }, delayMs: 0 },
    { cellId: "other_1", row: 0, col: 1, worldPosition: { x: 30, y: 20 }, delayMs: 30 },
    { cellId: "target_2", row: 1, col: 0, worldPosition: { x: 10, y: 40 }, delayMs: 60 }
  ];
  var resolution = {
    matchedObjectiveCollected: []
  };

  var collected = manager._registerMatchedObjectiveCollection(matchedCells, eliminationSequence, resolution);
  if (collected.length !== 2) {
    throw new Error("Matched target-color eliminations should count only target balls.");
  }
  if (manager.systems.jarCollectorSystem.collectedByColor.R !== 2) {
    throw new Error("Matched target-color eliminations should increment collectedByColor.");
  }
  if (manager.systems.jarCollectorSystem.collectedTotal !== 2) {
    throw new Error("Matched target-color eliminations should increment collectedTotal.");
  }
  if (manager.systems.jarCollectorSystem.lastCollected.length !== 0) {
    throw new Error("Matched target-color eliminations must not masquerade as jar bottom collections.");
  }
  if (resolution.matchedObjectiveCollected.length !== 2) {
    throw new Error("Matched target-color eliminations should be recorded in resolution payload.");
  }
  if (
    runtimeEvents.length !== 1 ||
    runtimeEvents[0].type !== "matched_objective_collect" ||
    runtimeEvents[0].payload.count !== 2 ||
    runtimeEvents[0].payload.entries[1].worldPosition.y !== 40 ||
    runtimeEvents[0].payload.entries[1].delayMs !== 60
  ) {
    throw new Error("Matched target-color collection event should carry fly-to-HUD payload.");
  }

  var managerWithoutSequence = new GameManager();
  managerWithoutSequence.currentLevel = manager.currentLevel;
  managerWithoutSequence.systems = {
    trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
    jarCollectorSystem: new JarCollectorSystem()
  };
  managerWithoutSequence.systems.jarCollectorSystem.configureLevel(manager.currentLevel);
  var noSequenceEvents = [];
  managerWithoutSequence._pushRuntimeEvent = function (type, payload) {
    noSequenceEvents.push({
      type: type,
      payload: payload
    });
  };
  var noSequenceResolution = {
    matchedObjectiveCollected: []
  };
  var noSequenceGrid = {
    getCellPosition: function (row, col) {
      return {
        x: col * 100 + 7,
        y: row * 100 + 9
      };
    }
  };
  managerWithoutSequence._registerMatchedObjectiveCollection(
    [
      { id: "target_no_sequence", row: 2, col: 3, color: "R", entityCategory: "normal_ball", entityType: null }
    ],
    [],
    noSequenceResolution,
    noSequenceGrid
  );
  if (
    noSequenceEvents.length !== 1 ||
    noSequenceEvents[0].payload.entries[0].worldPosition.x !== 307 ||
    noSequenceEvents[0].payload.entries[0].worldPosition.y !== 209
  ) {
    throw new Error("Matched target collection without eliminationSequence should use grid positions for HUD fly payload.");
  }
}

function runBlastComboAttachAnchorCase() {
  var manager = new GameManager();
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };

  try {
    manager.score = 0;
    manager.comboStreak = 1;
    manager.maxComboStreak = 1;
    manager.scoreRules = {
      blastDrop: 100,
      floatingDrop: 80
    };
    var runtimeEvents = [];
    manager._pushRuntimeEvent = function (type, payload) {
      runtimeEvents.push({
        type: type,
        payload: payload
      });
    };

    var resolution = {
      matched: [
        { id: "blast_removed", row: 2, col: 3 }
      ],
      floating: [],
      scoreDelta: 0,
      blastExplosions: [
        {
          id: "blast_shot_1",
          entityType: "blast",
          row: 2,
          col: 3
        }
      ]
    };

    manager._applyResolutionDropScore(resolution, "blastDrop");
    manager._registerComboElimination(resolution);

    if (runtimeEvents.length !== 2 || runtimeEvents[1].type !== "combo_bonus_awarded") {
      throw new Error("Blast combo anchor regression expected combo_bonus_awarded event.");
    }
    if (runtimeEvents[1].payload.attach_row !== 2 || runtimeEvents[1].payload.attach_col !== 3) {
      throw new Error("Blast combo event must use blast explosion coordinates as attach anchor.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runBubbleBreakSfxCountCase() {
  var threeBallSfxCount = BubbleBreakSfxPolicy.resolveBubbleBreakSfxCount(3);
  if (threeBallSfxCount !== 1) {
    throw new Error("bubble_break should play the break sfx once per event.");
  }
  var threeBallSfxSchedule = BubbleBreakSfxPolicy.resolveBubbleBreakSfxSchedule(3, [0, 30, 60]);
  if (
    threeBallSfxSchedule.length !== 1 ||
    threeBallSfxSchedule[0].delayMs !== 0 ||
    threeBallSfxSchedule[0].count !== 1
  ) {
    throw new Error("bubble_break should schedule only one break sfx at the first shatter.");
  }

  var cappedSfxCount = BubbleBreakSfxPolicy.resolveBubbleBreakSfxCount(8);
  if (cappedSfxCount !== BubbleBreakSfxPolicy.MAX_BUBBLE_BREAK_SFX_PER_EVENT) {
    throw new Error("bubble_break should cap break sfx playback at one per event.");
  }
  var cappedSfxSchedule = BubbleBreakSfxPolicy.resolveBubbleBreakSfxSchedule(8, [0, 30, 60, 90, 120, 150, 180, 210]);
  if (
    cappedSfxSchedule.length !== BubbleBreakSfxPolicy.MAX_BUBBLE_BREAK_SFX_PER_EVENT ||
    cappedSfxSchedule[0].delayMs !== 0 ||
    cappedSfxSchedule[0].count !== 1
  ) {
    throw new Error("bubble_break should schedule only one break sfx for large shatter events.");
  }

  var rejectedInvalidCount = false;
  try {
    BubbleBreakSfxPolicy.resolveBubbleBreakSfxCount(0);
  } catch (error) {
    rejectedInvalidCount = /positive integer count/.test(error.message);
  }
  if (!rejectedInvalidCount) {
    throw new Error("bubble_break should fail fast when count is not a positive integer.");
  }

  var runtimeEvents = [];
  var manager = new GameManager();
  manager._pushRuntimeEvent = function (type, payload) {
    runtimeEvents.push({
      type: type,
      payload: payload
    });
  };
  manager._pushBubbleBreakEvent(
    [
      { id: "cell_1" },
      { id: "cell_2" },
      { id: "cell_3" }
    ],
    [
      { cellId: "cell_1", delayMs: 0 },
      { cellId: "cell_2", delayMs: 30 },
      { cellId: "cell_3", delayMs: 60 }
    ]
  );
  if (
    runtimeEvents.length !== 1 ||
    runtimeEvents[0].type !== "bubble_break" ||
    runtimeEvents[0].payload.count !== 3 ||
    runtimeEvents[0].payload.shatterDelaysMs.join(",") !== "0,30,60"
  ) {
    throw new Error("bubble_break runtime event should carry per-cell shatter delays.");
  }

  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var playedEffects = [];
  var volumeSetCount = 0;
  global.cc = {
    audioEngine: {
      setEffectsVolume: function (volume) {
        if (volume !== 0.7) {
          throw new Error("AudioManager.playSfxInstances should apply the configured sfx volume.");
        }
        volumeSetCount += 1;
      },
      playEffect: function (clip, loop) {
        if (clip !== "break_clip" || loop !== false) {
          throw new Error("AudioManager.playSfxInstances should play the resolved clip without looping.");
        }
        var id = playedEffects.length + 1;
        playedEffects.push(id);
        return id;
      }
    }
  };

  try {
    var audioManager = Object.create(AudioManager.prototype);
    audioManager.settings = {
      sfxEnabled: true,
      sfxVolume: 0.7
    };
    audioManager.sfxMap = {
      break: "sound/break"
    };
    audioManager._tryUnlockWebAudio = function () {};
    audioManager._loadClip = function (resourcePath) {
      if (resourcePath !== "sound/break") {
        throw new Error("AudioManager.playSfxInstances should resolve break sfx resource path.");
      }
      return {
        then: function (callback) {
          var result = callback("break_clip");
          return {
            catch: function () {
              return result;
            }
          };
        }
      };
    };

    var audioIds = audioManager.playSfxInstances("break", threeBallSfxCount);
    if (audioIds.length !== 1 || playedEffects.length !== 1) {
      throw new Error("bubble_break should create exactly one playEffect instance per event.");
    }
    if (volumeSetCount !== 1) {
      throw new Error("AudioManager.playSfxInstances should set effects volume once per concurrent batch.");
    }
  } finally {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  }
}

function runConfiguredAudioPreloadsArraySfxCase() {
  var audioManager = Object.create(AudioManager.prototype);
  audioManager.bgmPath = "sound/game_bg1";
  audioManager.sfxMap = {
    multiHit: ["sound/hit1", "sound/hit2", "sound/hit1"],
    jarCollectBottom: "sound/score",
    empty: []
  };
  var preloadedPaths = null;
  audioManager.preloadPaths = function (paths) {
    preloadedPaths = paths;
    return Promise.resolve(paths);
  };

  audioManager.preloadConfiguredAudio();

  var expected = [
    "sound/game_bg1",
    "sound/hit1",
    "sound/hit2",
    "sound/score"
  ];
  if (!preloadedPaths || preloadedPaths.join(",") !== expected.join(",")) {
    throw new Error("AudioManager.preloadConfiguredAudio should preload unique string and array sfx paths.");
  }
}

function runJarRimBounceAudioDisabledCase() {
  var gameBootstrapSource = fs.readFileSync(
    path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrap.js"),
    "utf8"
  );
  if (gameBootstrapSource.indexOf("jarBounceSfxResources") >= 0 || gameBootstrapSource.indexOf("_playJarBounceSfx") >= 0) {
    throw new Error("GameBootstrap must not expose jar rim bounce audio configuration or playback methods.");
  }

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5"
  });
  if (Object.prototype.hasOwnProperty.call(audioConfig.sfxMap, "jarBounce")) {
    throw new Error("Audio config must not preload or expose jar rim bounce SFX.");
  }

  var trackedEventTypes = [];
  var playedSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function (event) {
      trackedEventTypes.push(event.type);
    },
    _playSfx: function (sfxKey) {
      playedSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{ type: "jar_rim_bounce", bounceCount: 1, jarIndex: 2 }]
  });
  if (trackedEventTypes.length !== 1 || trackedEventTypes[0] !== "jar_rim_bounce") {
    throw new Error("jar_rim_bounce must remain available to runtime telemetry.");
  }
  if (playedSfxKeys.length !== 0) {
    throw new Error("jar_rim_bounce must not play SFX.");
  }

  var rejectedInvalidBounce = false;
  try {
    GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
      _trackRuntimeTelemetryEvent: function () {}
    }, {
      runtimeEvents: [{ type: "jar_rim_bounce", bounceCount: 0, jarIndex: 2 }]
    });
  } catch (error) {
    rejectedInvalidBounce = error.message.indexOf("positive integer bounceCount") >= 0;
  }
  if (!rejectedInvalidBounce) {
    throw new Error("Silent jar rim bounce events must retain fail-fast payload validation.");
  }
}

function runNoEliminationSfxDisabledCase() {
  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5"
  });
  if (Object.prototype.hasOwnProperty.call(audioConfig.sfxMap, "noElimination")) {
    throw new Error("No-elimination SFX must not remain in the configured audio map.");
  }

  var trackedEventTypes = [];
  var playedSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function (event) {
      trackedEventTypes.push(event.type);
    },
    _playSfx: function (sfxKey) {
      playedSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{ type: "shot_no_elimination" }]
  });

  if (trackedEventTypes.length !== 1 || trackedEventTypes[0] !== "shot_no_elimination") {
    throw new Error("shot_no_elimination must remain available to runtime telemetry.");
  }
  if (playedSfxKeys.length !== 0) {
    throw new Error("shot_no_elimination must not play SFX.");
  }
}

function runWallBounceNoEliminationAudioCase() {
  var hitBucketAssetPath = path.resolve(__dirname, "../assets/audio/sound/hit_bucket.mp3");
  if (!fs.existsSync(hitBucketAssetPath) || !fs.existsSync(hitBucketAssetPath + ".meta")) {
    throw new Error("Wall-bounce no-elimination audio requires hit_bucket.mp3 and its meta file.");
  }

  function finalizeShot(wallBounceCount, matchedCount) {
    var manager = new GameManager();
    manager.pendingRuntimeEvents = [];
    manager.remainingShots = 2;
    manager.isTimedInfiniteShots = false;
    manager.molotovResolutionPending = false;
    manager.pendingProjectileFinalize = true;
    manager.activeProjectile = {
      position: { x: 0, y: 0 },
      color: "R",
      ball: {
        ballCategory: "normal",
        color: "R",
        entityCategory: "normal_ball",
        entityType: null
      },
      targetCell: { row: 0, col: 0 },
      shotPlan: {
        hitType: "cell",
        wallBounceCount: wallBounceCount,
        penetratedTransparentBalls: []
      },
      destroyedTransparentBalls: []
    };
    manager.systems = {
      bubbleGrid: {
        hasCell: function () {
          return false;
        },
        addBubble: function () {
          return { id: "attached", row: 0, col: 0, color: "R" };
        }
      },
      trappedSpriteRescueSystem: createInactiveTrappedSpriteRescueSystemFixture(),
      boardOcclusionSystem: {
        onShotFired: function () {
          return [];
        }
      }
    };
    manager._resolveAttachment = function () {
      return {
        matched: Array.from({ length: matchedCount }, function (_, index) {
          return { id: "matched_" + index, row: 0, col: index };
        }),
        transparentBallsDestroyed: [],
        trappedSpriteRotation: null,
        boardCleared: false
      };
    };
    manager._resolveDirectVineImpact = function () {};
    manager._resolveFairyAssistsAfterResolution = function () {};
    manager._beginSwirlRotationForResolution = function () {
      return true;
    };

    manager._finalizePlannedShot();
    return manager._drainRuntimeEvents();
  }

  var bouncedNoEliminationEvents = finalizeShot(1, 0);
  var bounceAudioEvents = bouncedNoEliminationEvents.filter(function (event) {
    return event.type === "shot_wall_bounce_no_elimination";
  });
  if (bounceAudioEvents.length !== 1 || bounceAudioEvents[0].wallBounceCount !== 1) {
    throw new Error("A bounced shot without elimination must emit one wall-bounce audio event.");
  }
  if (!bouncedNoEliminationEvents.some(function (event) { return event.type === "shot_no_elimination"; })) {
    throw new Error("Bounced no-elimination shot must preserve the base shot_no_elimination event.");
  }

  if (finalizeShot(0, 0).some(function (event) { return event.type === "shot_wall_bounce_no_elimination"; })) {
    throw new Error("A direct shot without elimination must not emit wall-bounce audio.");
  }
  if (finalizeShot(2, 1).some(function (event) { return event.type === "shot_wall_bounce_no_elimination"; })) {
    throw new Error("A bounced shot with elimination must not emit wall-bounce no-elimination audio.");
  }

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    hitBucketSfxResource: "sound/hit_bucket"
  });
  if (audioConfig.sfxMap.hitBucket !== "sound/hit_bucket") {
    throw new Error("Wall-bounce no-elimination audio must map hitBucket to sound/hit_bucket.");
  }

  var playedSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      playedSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{
      type: "shot_wall_bounce_no_elimination",
      wallBounceCount: 1
    }]
  });
  if (playedSfxKeys.length !== 1 || playedSfxKeys[0] !== "hitBucket") {
    throw new Error("Wall-bounce no-elimination runtime event must play hitBucket exactly once.");
  }
}

function runIceThawRuntimeEventCase() {
  var iceCell = {
    id: "ice_1",
    row: 0,
    col: 0,
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: "R"
  };
  var thawEvents = [];
  var manager = new GameManager();
  manager._pushRuntimeEvent = function (type, payload) {
    thawEvents.push({ type: type, payload: payload });
  };
  var thawed = manager._thawIceCells([iceCell], {
    getCell: function () {
      return iceCell;
    },
    addBubble: function (coordinate, color) {
      return {
        id: "normal_1",
        row: coordinate.row,
        col: coordinate.col,
        color: color,
        entityCategory: "normal_ball"
      };
    }
  });
  if (
    thawed.length !== 1 ||
    thawEvents.length !== 1 ||
    thawEvents[0].type !== "ice_thawed" ||
    thawEvents[0].payload.count !== 1
  ) {
    throw new Error("Successful ice thaw must emit one ice_thawed runtime event with thawed count.");
  }
}

function runBubbleShatterRearmsAppendedMolotovSequenceCase() {
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var previousCc = global.cc;
  var scheduledPresentationRelease = null;
  var unscheduledCount = 0;
  var shatterLayer = { isValid: true };
  global.cc = {
    Class: function (definition) {
      function ComponentClass() {
        if (definition && typeof definition.ctor === "function") {
          definition.ctor.call(this);
        }
      }
      Object.keys(definition).forEach(function (key) {
        if (key !== "extends" && key !== "ctor") {
          ComponentClass.prototype[key] = definition[key];
        }
      });
      return ComponentClass;
    },
    Component: function () {},
    Sprite: {
      SizeMode: {
        CUSTOM: "CUSTOM"
      }
    },
    game: {
      RENDER_TYPE_CANVAS: 0,
      renderType: 1
    },
    v2: function (x, y) {
      return { x: x, y: y };
    },
    v4: function () {
      return {
        set: function () {}
      };
    },
    director: {
      getScheduler: function () {
        return {
          schedule: function (callback, target, interval, repeat, delay) {
            if (target !== shatterLayer) {
              throw new Error("Bubble shatter appended sequence should schedule against shatter layer.");
            }
            if (interval !== 0 || repeat !== 0 || !(delay > 0)) {
              throw new Error("Bubble shatter appended sequence should schedule one positive release delay.");
            }
            scheduledPresentationRelease = callback;
          },
          unschedule: function () {
            unscheduledCount += 1;
          }
        };
      }
    }
  };

  var rendererPath = path.resolve(__dirname, "../gameplay-src/render/BubbleShatterRenderer.js");
  delete require.cache[rendererPath];

  try {
    var BubbleShatterRenderer = require(rendererPath);
    var releaseCount = 0;
    var renderer = new BubbleShatterRenderer({
      boardLayout: {
        getCellPosition: function (row, col) {
          return { x: col * 10, y: row * 10 };
        }
      },
      ballResources: {
        R: "ball/red"
      },
      resolveBallCode: function () {
        return "R";
      },
      bubbleWidth: 64,
      bubbleHeight: 64
    });
    renderer.layer = shatterLayer;
    renderer.effectAsset = { isValid: true };
    renderer.setPresentationCompleteHandler(function () {
      releaseCount += 1;
    });
    renderer._scheduleCellShatter = function () {};

    var resolution = {
      matched: [
        { id: "first", row: 1, col: 1, color: "R", entityCategory: "normal_ball" }
      ],
      eliminationSequence: [
        { cellId: "first", delayMs: 0, worldPosition: { x: 10, y: 10 } }
      ]
    };
    var boardSnapshot = { maxColumns: 10 };
    var boardBubbleNodes = {};
    var spriteFrameCache = {};

    renderer.playResolution(resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
    if (releaseCount <= 0) {
      throw new Error("Bubble shatter should release after the initial zero-delay sequence.");
    }
    var releaseCountAfterInitialSequence = releaseCount;

    resolution.matched.push({
      id: "second_outer_ring",
      row: 2,
      col: 2,
      color: "R",
      entityCategory: "normal_ball"
    });
    resolution.eliminationSequence.push({
      cellId: "second_outer_ring",
      delayMs: 900,
      worldPosition: { x: 20, y: 20 }
    });

    renderer.playResolution(resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
    if (releaseCount !== releaseCountAfterInitialSequence || typeof scheduledPresentationRelease !== "function") {
      throw new Error("Bubble shatter must re-arm release when molotov appends shatter entries to the same resolution.");
    }
    if (unscheduledCount !== 0) {
      throw new Error("Bubble shatter should not unschedule a completed presentation release.");
    }

    scheduledPresentationRelease();
    if (releaseCount !== releaseCountAfterInitialSequence + 1) {
      throw new Error("Bubble shatter appended sequence release should notify after the new delay.");
    }
  } finally {
    delete require.cache[rendererPath];
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
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

  runReflectedShotDoesNotTunnelPastFirstCollisionCase();
  console.log("[OK]", "reflected_shot_first_collision", "bank shot does not tunnel to a later attachment point");

  runTransparentBallPassThroughAndSettlementCase();
  console.log("[OK]", "transparent_ball", "passes through, awards 1000, checks drops, and keeps combo");

  runKeyUnlockBoardAdvanceDelayCase();
  console.log("[OK]", "key_unlock_board_advance_delay", "waited for special animation before board advance");
  runImpactBounceBoardAdvanceDelayCase();
  console.log("[OK]", "impact_bounce_board_advance_delay", "waited for impact bounce before board advance");
  runImpactBounceBoardAdvanceSameUpdateFrameCase();
  console.log("[OK]", "impact_bounce_board_advance_same_update_frame", "did not consume delay in the scheduling update frame");
  runEliminationPresentationBoardAdvanceGateCase();
  console.log("[OK]", "elimination_presentation_board_advance_gate", "waited for elimination presentation before board advance");
  runKeyUnlockSingleTargetCase();
  console.log("[OK]", "key_unlock_single_target", "one key unlocked one locked ball");
  runKeyUnlockNearestTargetCase();
  console.log("[OK]", "key_unlock_nearest_target", "key unlocked visually nearest locked ball");
  runKeyUnlockRemovedByExplosionCase();
  console.log("[OK]", "key_unlock_removed_by_explosion", "explosion-removed key unlocked a locked ball");
  runKeyUnlockCompetitiveNearestCase();
  console.log("[OK]", "key_unlock_competitive_nearest", "each key unlocked nearest lock in shared group");
  runKeyUnlockMolotovFloatingRemovalCase();
  console.log("[OK]", "key_unlock_molotov_floating_removal", "floating key unlocked instead of dropping");
  runMolotovFloatingMolotovRegistersDropCase();
  console.log("[OK]", "molotov_floating_molotov_registers_drop", "unsupported chain molotov drops immediately");
  runMolotovFloatingKeyUnlockCascadesUnsupportedDropCase();
  console.log("[OK]", "molotov_floating_key_unlock_cascade", "molotov key unlock cascades unsupported descendants immediately");
  runKeyUnlockSequentialWaveCase();
  console.log("[OK]", "key_unlock_sequential_wave", "deferred pairing kept nearest lock for later collected key");
  runKeyUnlockUnsupportedFallsCase();
  console.log("[OK]", "key_unlock_unsupported_falls", "unsupported unlocked locked ball falls instead of disappearing");
  runMolotovChainQueueCase();
  console.log("[OK]", "molotov_chain_queue", "adjacent molotov queued after neighbor removal");
  runMolotovEliminationSequencePositionCase();
  console.log("[OK]", "molotov_elimination_sequence_position", "blasted normal balls keep pre-removal positions");
  runMolotovChainSplitterDedupCase();
  console.log("[OK]", "molotov_chain_splitter_dedup", "shared splitter queues once across chained molotov blasts");
  runMolotovPendingResolutionSeedsSplitterDedupCase();
  console.log("[OK]", "molotov_pending_splitter_seed", "already pending splitters seed molotov dedup");
  runMolotovBlastPhaseDropsUnsupportedSourceSupportCase();
  console.log("[OK]", "molotov_blast_phase_drops_source_support", "source molotov removal drops unsupported cells immediately");
  runMolotovPendingResolutionFinalizeCase();
  console.log("[OK]", "molotov_pending_resolution_finalize", "unsupported cells drop when molotov finalize is the only pending work");
  runMolotovBlastUpdateForcesFullRefreshCase();
  console.log("[OK]", "molotov_blast_update_forces_full_refresh", "molotov blast refreshes board and falling drops together");
  runBubbleShatterRearmsAppendedMolotovSequenceCase();
  console.log("[OK]", "bubble_shatter_rearms_appended_molotov_sequence", "appended molotov shatters re-arm delayed drop release");
  runAdjacentIceThawSnowballCollectionCase();
  console.log("[OK]", "adjacent_ice_thaw_snowball_collection", "neighbor thaw and direct ice removal count snowballs once");
  runSnowRemovalKeepsInnerNormalBallCase();
  console.log("[OK]", "snow_removal_keeps_inner_normal_ball", "snow removal clears snow and keeps the inner normal ball");
  runFloatingIceDropThawBeforeFallCase();
  console.log("[OK]", "floating_ice_drop_thaw_before_fall", "floating ice thaws, flies, then drops inner ball");
  runCollectionRewardDoesNotClearRemainingBoardCase();
  console.log("[OK]", "collection_reward_does_not_clear_board", "keeps remaining board cells and does not pass");
  runOutOfShotsAddBallPromptCase();
  console.log("[OK]", "out_of_shots_add_ball_prompt", "final shot prompts before lose settlement and close continues settlement");
  runAddBallPromptPlusTenCase();
  console.log("[OK]", "add_ball_prompt_plus_ten", "plus ten balls resumes running from add-ball prompt");
  runTimedAndShotLimitedReviveCase();
  console.log("[OK]", "timed_and_shot_limited_revive", "timed revive grants 10 seconds with centered text and hidden ball while shot-limited revive keeps 10 balls at x=32");
  runTimedTimeBonusBallSettlementCase();
  console.log("[OK]", "timed_time_bonus_ball_settlement", "normal time bonus ball grants five seconds once for floating drop without an upper cap");
  runPreciseAimInventoryActivatesGuideCase();
  console.log("[OK]", "precise_aim_inventory_activates_guide", "precise aim inventory activates ricochet guide and consumes one item");
  runCollectedSkillPowerupsEmitInventoryEventsCase();
  console.log("[OK]", "collected_skill_powerups_emit_inventory_events", "collected rainbow and blast emit inventory sync events");
  runTimedOutSkillPowerupsIncreaseInventoryCase();
  console.log("[OK]", "timed_out_skill_powerups_increase_inventory", "timed-out rainbow and blast drops still increase runtime inventory");
  runCollectedSkillPowerupHudFeedbackQueueCase();
  runCollectedSkillPowerupHudFeedbackRevealToleranceCase();
  console.log("[OK]", "collected_skill_powerup_hud_feedback_queue", "collected rainbow and blast queue one-shot bottom-toolbar feedback in event order");
  runClearWinRequiresStarAndEmptyBoardCase();
  console.log("[OK]", "clear_win_requires_star_and_empty_board", "ignores collection targets for pass and requires an empty board");
  runOneStarTargetScoreCase();
  console.log("[OK]", "one_star_target_score", "uses the same one-star threshold policy as runtime scoring");
  runAuthoredOpeningShotQueueCase();
  console.log("[OK]", "authored_opening_shot_queue", "plays six authored colors in order and clears them on revive override");
  runSkillBallShotsDoNotConsumeRemainingShotsCase();
  console.log("[OK]", "skill_ball_shots_do_not_consume_remaining_shots", "rainbow and blast shots preserve normal shot supply while normal shots still consume one");
  runRandomShotColorStreakLimitCase();
  console.log("[OK]", "random_shot_color_streak_limit", "random normal balls never select the same color more than twice in a row");
  runStoneBallJarScoreZeroCase();
  console.log("[OK]", "stone_ball_jar_score_zero", "stone ball in jar scores 0 and keeps total score");
  runJarCollectionFloatingScoreEventCase();
  console.log("[OK]", "jar_collection_floating_score_event", "scored jar drops emit floating score events at jar mouth position");
  runOutsideJarCleanupScoreCase();
  console.log("[OK]", "outside_jar_cleanup_score", "outside-jar cleanup adds score without collection progress");
  runBlackAndWhiteJarScoreCase();
  console.log("[OK]", "black_and_white_jar_score", "black and white balls score normally when entering jars");
  runJarScoreIntegerRoundingCase();
  console.log("[OK]", "jar_score_integer_rounding", "fairy glow multiplier rounds only the final jar score to an integer");
  runColorPermutationJarScoreCase();
  console.log("[OK]", "color_permutation_jar_score", "permuted jar colors and collect_color targets keep non-same-color jar score");
  runComboMatchedBallScoreDisplayCase();
  console.log("[OK]", "combo_matched_ball_score_display", "combo raises shattered-ball score and floating score display");
  runBallScoreDisplayGenerationCase();
  console.log("[OK]", "ball_score_display_generation", "stale score callbacks are isolated and same-id events display independently");
  runTimeBonusFloatingScoreDisplayCase();
  console.log("[OK]", "time_bonus_floating_score_display", "removed time bonus balls float +5 from their board positions exactly once");
  runJarFractionDisplayEventIdentityCase();
  console.log("[OK]", "jar_fraction_display_event_identity", "same-id jar score events display independently without replaying the same event");
  runJarFractionBundleUnloadCleanupCase();
  console.log("[OK]", "jar_fraction_bundle_unload_cleanup", "bundle unload destroys stale jar fraction clones before renderer reuse");
  runMatchedObjectiveCollectionCase();
  console.log("[OK]", "matched_objective_collection", "matched target balls count into collection target and emit HUD fly payload");
  runBlastComboAttachAnchorCase();
  console.log("[OK]", "blast_combo_attach_anchor", "blast combo display uses explosion coordinates without impact");
  runBubbleBreakSfxCountCase();
  console.log("[OK]", "bubble_break_sfx_count", "break sfx plays once per bubble_break event");
  runConfiguredAudioPreloadsArraySfxCase();
  console.log("[OK]", "configured_audio_array_sfx_preload", "array sfx paths are preloaded for immediate playback");
  runJarRimBounceAudioDisabledCase();
  console.log("[OK]", "jar_rim_bounce_audio_disabled", "jar rim bounce remains observable but does not play SFX");
  runNoEliminationSfxDisabledCase();
  console.log("[OK]", "no_elimination_sfx_disabled", "shot_no_elimination remains silent while telemetry is preserved");
  runWallBounceNoEliminationAudioCase();
  console.log("[OK]", "wall_bounce_no_elimination_audio", "only bounced shots without elimination play hit_bucket");
  runIceThawRuntimeEventCase();
  console.log("[OK]", "ice_thaw_runtime_event", "successful ice thaw emits one counted runtime event");
  runBoardIntroViewportCase();
  runBoardMidGameViewportSettleCase();
  runTopAnchorCollapseTriggerCase();
  runTopAnchorCollapseCancelsPendingSplitterSpawnCase();
  runSplitterSpawnViewportSettleCase();
  runBoardViewportFireLockCase();
  runBoardViewportRenderRefreshCase();
  runShooterHandoffInputLockCase();
  runBoardViewportSnapshotCacheCase();
  runBoardViewportEntryUpdateCase();
  console.log("[OK]", "board_viewport", "10-row intro/runtime alignment, top-anchor collapse trigger, render refresh, shooter handoff input lock, snapshot cache, entry update, linear movement, and fire lock passed");

  if (failed) {
    console.log("\nShot regression validation failed.");
    process.exit(1);
  }

  console.log("\nShot regression validation passed for", results.length, "levels.");
}

main();
