"use strict";

var Logger = require("../utils/Logger");
var DebugFlags = require("../utils/DebugFlags");
var PrefabFactory = require("./PrefabFactory");
var BoardLayout = require("../config/BoardLayout");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var RenderNodeHelpers = require("./RenderNodeHelpers");
var attachLevelRendererSceneMethods = require("./LevelRendererSceneMethods");

var loadSpriteFrame = RenderNodeHelpers.loadSpriteFrame;
var createSolidWhiteSpriteFrame = RenderNodeHelpers.createSolidWhiteSpriteFrame;
var ensureSprite = RenderNodeHelpers.ensureSprite;
var ensureLabel = RenderNodeHelpers.ensureLabel;
var ensureOutline = RenderNodeHelpers.ensureOutline;
var clearChildren = RenderNodeHelpers.clearChildren;
var getOrCreateChild = RenderNodeHelpers.getOrCreateChild;

var BALL_RESOURCES = {
  R: "image/red_ball",
  G: "image/green_ball",
  B: "image/blue_ball",
  Y: "image/yellow_ball",
  P: "image/purple_ball",
  RAINBOW: "image/rainbow_ball",
  BLAST: "image/bomb_ball",
  STONE: "image/stone_ball",
  ICE: "image/ice_ball"
};

var JAR_RESOURCES = {
  R: "image/red_jar",
  G: "image/green_jar",
  B: "image/blue_jar",
  Y: "image/yellow_jar",
  P: "image/purple_jar"
};

var JAR_MASK_RESOURCES = {
  R: "image/red_jar_mask",
  G: "image/green_jar_mask",
  B: "image/blue_jar_mask",
  Y: "image/yellow_jar_mask",
  P: "image/purple_jar_mask"
};

var PREFAB_PATHS = {
  gameView: "prefabs/ui/GameView",
  hudPanel: "prefabs/ui/HudPanel",
  winView: "prefabs/ui/WinView",
  loseView: "prefabs/ui/LoseView",
  dangerLine: "prefabs/ui/DangerLine",
  bubbleItem: "prefabs/game/BubbleItem",
  jarItem: "prefabs/game/JarItem",
  shooterPanel: "prefabs/game/ShooterPanel",
  previewBall: "prefabs/game/PreviewBall"
};

var JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var GUIDE_DOT_SPACING = 42;
var GUIDE_DOT_RADIUS = 4;
var GUIDE_DOT_SIZE = GUIDE_DOT_RADIUS * 2;
var GUIDE_DOT_MAX_COUNT = 64;
var GUIDE_DOT_SPRITE_PATH = "image/white_point";
var GUIDE_DOT_PULSE_DURATION = 0.36;
var GUIDE_DOT_PULSE_SCALE_LARGE = 1.5;
var GUIDE_DOT_PULSE_SCALE_SMALL = 0.5;
var TEST_SLOT_RADIUS = Math.floor(BoardLayout.bubbleRadius * 0.88);
var SHOOTER_MAX_ROTATION = 75;
var ICE_OVERLAY_OPACITY = 255;
var REMAINING_SHOTS_OFFSET_Y = 68;
var NEXT_SHOT_OFFSET_X = 118;
var NEXT_SHOT_OFFSET_Y = -40;
var BOARD_BUBBLE_SIZE = new cc.Size(72, 72);
var NEXT_SHOT_BUBBLE_SIZE = new cc.Size(50, 50);
var JAR_RENDER_SIZE = new cc.Size(
  Math.max(1, Number(BoardLayout.jarWidth) || 237),
  Math.max(1, Number(BoardLayout.jarHeight) || 230)
);
var POPUP_CONTENT_CONTAINER_NAME = "ContentContainer";
var POPUP_OPEN_ANIM_DURATION = 0.2;
var POPUP_OPEN_ANIM_FROM_SCALE = 0.82;
var WIN_POPUP_OPEN_ANIM_DURATION = 0.24;
var WIN_POPUP_OPEN_ANIM_FROM_SCALE = 0.72;
var WIN_STAR_ANIM_START_DELAY = 0.06;
var WIN_STAR_ANIM_STAGGER = 0.07;
var WIN_STAR_PUNCH_FROM_SCALE = 1.56;
var WIN_STAR_PUNCH_DOWN_SCALE = 0.9;
var WIN_STAR_SHRINK_DURATION = 0.2;
var WIN_STAR_RECOVER_DURATION = 0.08;
var IMPACT_DEFAULT_PUSH_DISTANCE = 12;
var IMPACT_DEFAULT_BOUNCE_SPEED = 220;
var IMPACT_MIN_PUSH_DURATION = 0.028;
var IMPACT_MIN_RETURN_DURATION = 0.06;
var IMPACT_RETURN_DURATION_RATIO = 2.2;
var ROUTE_LINE_WIDTH_ACTIVE = 6;
var ROUTE_LINE_WIDTH_IDLE = 4;
var ROUTE_POINT_RADIUS_ACTIVE = 7;
var ROUTE_POINT_RADIUS_IDLE = 5;
var ICE_THAW_SHAKE_OFFSET = 7;
var ICE_THAW_SHAKE_STEP_DURATION = 0.04;
var ICE_COLLECT_FLY_DURATION = 0.34;
var ICE_COLLECT_BEZIER_ARC = 120;

var ROUTE_EDITOR_COLORS = [
  { r: 255, g: 195, b: 0 },
  { r: 53, g: 197, b: 255 },
  { r: 104, g: 211, b: 145 },
  { r: 255, g: 120, b: 120 },
  { r: 179, g: 132, b: 255 },
  { r: 255, g: 153, b: 68 }
];

function findCollectionObjective(levelConfig) {
  var bonusObjectives = levelConfig && levelConfig.level && Array.isArray(levelConfig.level.bonusObjectives)
    ? levelConfig.level.bonusObjectives
    : [];
  var winConditions = levelConfig && levelConfig.level && Array.isArray(levelConfig.level.winConditions)
    ? levelConfig.level.winConditions
    : [];
  var allObjectives = bonusObjectives.concat(winConditions);

  for (var i = 0; i < allObjectives.length; i += 1) {
    var objective = allObjectives[i];
    if (!objective || typeof objective.type !== "string") {
      continue;
    }

    if (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice") {
      return objective;
    }
  }

  return null;
}

function buildObjectiveDisplayData(levelConfig, runtimeSnapshot) {
  var objective = findCollectionObjective(levelConfig);
  var jars = runtimeSnapshot && runtimeSnapshot.jars ? runtimeSnapshot.jars : null;
  var objectiveSnapshot = runtimeSnapshot && runtimeSnapshot.objectives ? runtimeSnapshot.objectives : null;

  if (!objective) {
    return {
      iconCode: null,
      progress: 0,
      target: 0,
      progressText: "-"
    };
  }

  if (
    objectiveSnapshot &&
    typeof objectiveSnapshot.type === "string" &&
    objectiveSnapshot.type === objective.type
  ) {
    var snapshotProgress = Math.max(0, Number(objectiveSnapshot.progress) || 0);
    var snapshotTarget = Math.max(0, Number(objectiveSnapshot.target) || 0);
    return {
      iconCode: objectiveSnapshot.iconCode || null,
      progress: snapshotProgress,
      target: snapshotTarget,
      progressText: snapshotTarget > 0 ? (snapshotProgress + "/" + snapshotTarget) : String(snapshotProgress)
    };
  }

  var target = Math.max(0, Number(objective.value) || 0);
  if (objective.type === "collect_any") {
    var collectedAny = jars ? (Number(jars.collectedTotal) || 0) : 0;
    var progressAny = target > 0 ? Math.min(collectedAny, target) : collectedAny;
    return {
      iconCode: "RAINBOW",
      progress: progressAny,
      target: target,
      progressText: progressAny + "/" + target
    };
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : null;
    var collectedByColor = jars && jars.collectedByColor ? jars.collectedByColor : {};
    var collectedColor = colorCode ? (Number(collectedByColor[colorCode]) || 0) : 0;
    var progressColor = target > 0 ? Math.min(collectedColor, target) : collectedColor;
    return {
      iconCode: colorCode,
      progress: progressColor,
      target: target,
      progressText: progressColor + "/" + target
    };
  }

  if (objective.type === "collect_ice") {
    var iceCollected = objectiveSnapshot ? (Number(objectiveSnapshot.iceCollectedTotal) || 0) : 0;
    var iceProgress = target > 0 ? Math.min(iceCollected, target) : iceCollected;
    return {
      iconCode: "ICE",
      progress: iceProgress,
      target: target,
      progressText: iceProgress + "/" + target
    };
  }

  return {
    iconCode: null,
    progress: 0,
    target: 0,
    progressText: "-"
  };
}

function buildStateText(runtimeSnapshot) {
  if (runtimeSnapshot.state === "won") {
    return "";
  }

  if (runtimeSnapshot.state === "lost_danger") {
    return "触碰危险线";
  }

  if (runtimeSnapshot.state === "lost_objective") {
    return "目标未完成";
  }

  if (runtimeSnapshot.state === "out_of_shots_pending") {
    return "步数耗尽，等待掉落结算";
  }

  if (runtimeSnapshot.state === "out_of_shots") {
    return "步数耗尽";
  }

  var matched = runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution.matched.length : 0;
  var floating = runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution.floating.length : 0;
  if (matched || floating) {
    return "";
  }

  return "";
}

function buildResultTexts(runtimeSnapshot) {
  return null;
}

function resolveWinStarRating(levelConfig, runtimeSnapshot) {
  return StarRatingPolicy.calculateStarRatingFromSnapshot(runtimeSnapshot);
}

function buildHudRenderKey(levelConfig, runtimeSnapshot) {
  var levelCode = levelConfig && levelConfig.level ? levelConfig.level.code : "";
  var matched = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.matched
    ? runtimeSnapshot.lastResolution.matched.length
    : 0;
  var floating = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.floating
    ? runtimeSnapshot.lastResolution.floating.length
    : 0;
  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);

  return [
    levelCode,
    runtimeSnapshot ? runtimeSnapshot.state : "",
    runtimeSnapshot ? runtimeSnapshot.score : 0,
    runtimeSnapshot ? runtimeSnapshot.turnsUntilDrop : "",
    matched,
    floating,
    objectiveDisplay.progress || 0,
    objectiveDisplay.iconCode || "",
    objectiveDisplay.progressText || ""
  ].join("|");
}

function buildJarRenderKey(levelConfig, runtimeSnapshot) {
  var jarColors = levelConfig && levelConfig.level && Array.isArray(levelConfig.level.jarColors)
    ? levelConfig.level.jarColors
    : [];
  var progress = runtimeSnapshot && runtimeSnapshot.jars && runtimeSnapshot.jars.collectedByColor
    ? runtimeSnapshot.jars.collectedByColor
    : {};
  var zones = runtimeSnapshot &&
    runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem &&
    Array.isArray(runtimeSnapshot.systems.fallingMarbleSystem.jarZones)
    ? runtimeSnapshot.systems.fallingMarbleSystem.jarZones
    : [];

  var progressKey = jarColors.map(function (colorCode) {
    return colorCode + ":" + (progress[colorCode] || 0);
  }).join(",");
  var zoneKey = zones.map(function (zone) {
    return [
      zone.index,
      zone.x,
      zone.mouthY,
      zone.bottomY,
      zone.innerHalfWidth,
      zone.outerHalfWidth,
      zone.contactBand
    ].join(":");
  }).join(",");

  return progressKey + "|" + zoneKey;
}

function buildGuidePathKey(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return "";
  }

  return pathPoints.map(function (point) {
    return Math.round(point.x * 10) + ":" + Math.round(point.y * 10);
  }).join("|");
}

function pointDistance(a, b) {
  var dx = (b.x || 0) - (a.x || 0);
  var dy = (b.y || 0) - (a.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function clipGuidePathToDistance(pathPoints, maxDistance) {
  if (!pathPoints || pathPoints.length < 2) {
    return pathPoints;
  }

  var limit = Number(maxDistance);
  if (!isFinite(limit)) {
    return pathPoints;
  }

  if (limit <= 0) {
    return [pathPoints[0]];
  }

  var result = [{
    x: pathPoints[0].x,
    y: pathPoints[0].y
  }];
  var remaining = limit;
  var EPSILON = 0.0001;

  for (var index = 1; index < pathPoints.length; index += 1) {
    var from = pathPoints[index - 1];
    var to = pathPoints[index];
    var segmentLength = pointDistance(from, to);
    if (segmentLength <= EPSILON) {
      continue;
    }

    if (remaining >= segmentLength - EPSILON) {
      result.push({
        x: to.x,
        y: to.y
      });
      remaining -= segmentLength;
      continue;
    }

    var t = remaining / segmentLength;
    result.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t
    });
    break;
  }

  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveImpactBounceSpeed(impact) {
  var impactSpeed = Number(impact && impact.bounceSpeed);
  if (isFinite(impactSpeed) && impactSpeed > 0) {
    return Math.max(80, impactSpeed);
  }

  return Math.max(80, Number(BoardLayout.impactBounceSpeed) || IMPACT_DEFAULT_BOUNCE_SPEED);
}

function getJarBaseY() {
  return Number(BoardLayout.jarBaseY) || 0;
}

function resolveBallCode(ballLike) {
  if (!ballLike) {
    return null;
  }

  if (typeof ballLike === "string") {
    return ballLike;
  }

  if (typeof ballLike === "object") {
    if (typeof ballLike.color === "string" && ballLike.color) {
      return ballLike.color;
    }

    if (isIceBallLike(ballLike)) {
      var innerColor = resolveIceInnerColor(ballLike);
      if (innerColor) {
        return innerColor;
      }
    }

    if (ballLike.entityType === "rainbow") {
      return "RAINBOW";
    }

    if (ballLike.entityType === "blast") {
      return "BLAST";
    }

    if (ballLike.entityType === "stone") {
      return "STONE";
    }
  }

  return null;
}

function isIceBallLike(ballLike) {
  return !!(
    ballLike &&
    typeof ballLike === "object" &&
    ballLike.entityCategory === "obstacle_ball" &&
    ballLike.entityType === "ice"
  );
}

function resolveIceInnerColor(ballLike) {
  if (!ballLike || typeof ballLike !== "object") {
    return null;
  }

  if (typeof ballLike.innerColor === "string" && ballLike.innerColor) {
    return ballLike.innerColor;
  }

  return null;
}

function resolveBallVisualKey(ballLike) {
  var code = resolveBallCode(ballLike) || "NONE";
  var iceFlag = isIceBallLike(ballLike) && !!resolveIceInnerColor(ballLike) ? "ICE" : "NORMAL";
  return code + "|" + iceFlag;
}

function computeShooterAngle(direction) {
  var dirX = direction && typeof direction.x === "number" ? direction.x : 0;
  var dirY = direction && typeof direction.y === "number" ? direction.y : 1;
  if (Math.abs(dirX) < 0.0001 && Math.abs(dirY) < 0.0001) {
    return 0;
  }

  // Shooter art faces up by default, so angle is measured from +Y axis.
  var rawAngle = Math.atan2(dirX, dirY) * 180 / Math.PI;
  return clamp(-rawAngle, -SHOOTER_MAX_ROTATION, SHOOTER_MAX_ROTATION);
}

function createRouteColor(index, isActive) {
  var base = ROUTE_EDITOR_COLORS[index % ROUTE_EDITOR_COLORS.length];
  return cc.color(base.r, base.g, base.b, isActive ? 255 : 190);
}

function LevelRenderer(rootNode) {
  this.rootNode = rootNode;
  this.spriteFrameCache = {};
  this.layers = null;
  this.prefabFactory = new PrefabFactory();
  this._sharedWarmupPromise = null;
  this.currentLevelConfig = null;
  this.lastBoardVersion = -1;
  this.whiteMaskFrames = {};
  this.whiteMaskTextures = [];
  this.lastHudRenderKey = "";
  this.lastJarRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.dangerLineReady = false;
  this.dangerLineWarningActive = false;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
  this.lastIceThawShakeSeq = -1;
  this.boardBubbleNodes = {};
  this.boardBubbleNodePool = [];
  this.boardRenderTick = 1;
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingDropNodes = {};
  this.fallingDropNodePool = [];
  this.fallingRenderTick = 1;
  this.winActionHandlers = {
    onNextLevel: null,
    onRetryLevel: null
  };
  this.loseActionHandlers = {
    onRetryLevel: null,
    onBackLevel: null
  };
  this.gameplayActionHandlers = {
    onBackToLevel: null,
    onUseRainbow: null,
    onUseBlast: null
  };
}

LevelRenderer.prototype.warmupSharedAssets = function () {
  if (this._sharedWarmupPromise) {
    return this._sharedWarmupPromise;
  }

  this._sharedWarmupPromise = Promise.all([
    this._preloadSprites(this._collectCommonSpritePaths()),
    this.prefabFactory.preload(this._collectPrefabPaths())
  ]).catch(function (error) {
    this._sharedWarmupPromise = null;
    throw error;
  }.bind(this));

  return this._sharedWarmupPromise;
};

LevelRenderer.prototype.setWinActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.winActionHandlers = {
    onNextLevel: typeof handlers.onNextLevel === "function" ? handlers.onNextLevel : null,
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null
  };
};

LevelRenderer.prototype.setLoseActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.loseActionHandlers = {
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null,
    onBackLevel: typeof handlers.onBackLevel === "function" ? handlers.onBackLevel : null
  };
};

LevelRenderer.prototype.setGameplayActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.gameplayActionHandlers = {
    onBackToLevel: typeof handlers.onBackToLevel === "function" ? handlers.onBackToLevel : null,
    onUseRainbow: typeof handlers.onUseRainbow === "function" ? handlers.onUseRainbow : null,
    onUseBlast: typeof handlers.onUseBlast === "function" ? handlers.onUseBlast : null
  };
};

LevelRenderer.prototype._invokeWinAction = function (action) {
  var handler = null;
  if (action === "next") {
    handler = this.winActionHandlers.onNextLevel;
  } else if (action === "retry") {
    handler = this.winActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeLoseAction = function (action) {
  var handler = null;
  if (action === "retry") {
    handler = this.loseActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeGameplayAction = function (action) {
  var handler = null;
  if (action === "back") {
    handler = this.gameplayActionHandlers.onBackToLevel;
  } else if (action === "use_rainbow") {
    handler = this.gameplayActionHandlers.onUseRainbow;
  } else if (action === "use_blast") {
    handler = this.gameplayActionHandlers.onUseBlast;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype.renderLevel = function (levelConfig, runtimeSnapshot) {
  this.currentLevelConfig = levelConfig;
  this.lastBoardVersion = -1;
  this.lastHudRenderKey = "";
  this.lastJarRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.dangerLineReady = false;
  this.dangerLineWarningActive = false;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
  this.lastIceThawShakeSeq = -1;
  this.boardRenderTick = 1;
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingRenderTick = 1;
  this._ensureLayers();

  var spritePaths = this._collectSpritePaths(levelConfig, runtimeSnapshot);

  return Promise.all([
    this.warmupSharedAssets(),
    this._preloadSprites(spritePaths)
  ]).then(function () {
    clearChildren(this.layers.background);
    clearChildren(this.layers.board);
    this.boardBubbleNodes = {};
    this.boardBubbleNodePool = [];
    clearChildren(this.layers.testGrid);
    this.testSlotNodes = {};
    this.testSlotNodePool = [];
    clearChildren(this.layers.falling);
    this.fallingDropNodes = {};
    this.fallingDropNodePool = [];
    clearChildren(this.layers.jarOcclusion);
    clearChildren(this.layers.jars);
    clearChildren(this.layers.hud);
    clearChildren(this.layers.dangerLine);
    clearChildren(this.layers.overlay);
    clearChildren(this.layers.modal);
    clearChildren(this.layers.routeEditor);
    clearChildren(this.layers.shooter);
    clearChildren(this.layers.testGrid);

    this._mountGameViewScaffold();
    this._renderBackground();
    this._renderHud(levelConfig, runtimeSnapshot);
    this._renderBottomPanel(runtimeSnapshot);
    this._renderBoard(runtimeSnapshot.board);
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this._renderFallingDrops(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderDangerLine(runtimeSnapshot);
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    this._renderWinView(runtimeSnapshot);
    this._renderLoseView(runtimeSnapshot);
    this._renderResultPopup(runtimeSnapshot);
    this.lastHudRenderKey = buildHudRenderKey(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
    Logger.info("Rendered runtime view", levelConfig.level.code);
  }.bind(this));
};

LevelRenderer.prototype.refreshRuntime = function (levelConfig, runtimeSnapshot) {
  var boardChanged = runtimeSnapshot.board.version !== this.lastBoardVersion;
  if (boardChanged) {
    this._renderBoard(runtimeSnapshot.board);
    this._renderTestGrid(runtimeSnapshot.board);
  }

  var nextHudKey = buildHudRenderKey(levelConfig, runtimeSnapshot);
  if (nextHudKey !== this.lastHudRenderKey) {
    this._renderHud(levelConfig, runtimeSnapshot);
    this.lastHudRenderKey = nextHudKey;
  }

  this._renderBottomPanel(runtimeSnapshot);
  var nextJarKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
  if (nextJarKey !== this.lastJarRenderKey) {
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = nextJarKey;
  }

  this._renderFallingDrops(runtimeSnapshot);
  this._playIceThawShake(runtimeSnapshot);
  this._playImpactBounce(runtimeSnapshot);
  this._renderDangerLine(runtimeSnapshot);
  this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
  this._renderWinView(runtimeSnapshot);
  this._renderLoseView(runtimeSnapshot);
  this._renderResultPopup(runtimeSnapshot);
};

LevelRenderer.prototype._ensureLayers = function () {
  if (this.layers) {
    return;
  }

  this.layers = {
    background: this._getOrCreateLayer("BackgroundLayer", 0),
    dangerLine: this._getOrCreateLayer("DangerLineLayer", 10),
    jars: this._getOrCreateLayer("JarLayer", 20),
    shooter: this._getOrCreateLayer("ShooterLayer", 25),
    overlay: this._getOrCreateLayer("OverlayLayer", 30),
    board: this._getOrCreateLayer("BoardLayer", 40),
    // 掉落球前置到固定球前方，提升层次与动效可见度。
    falling: this._getOrCreateLayer("FallingLayer", 45),
    // 罐体遮罩继续位于掉落球之上，保持“入缸后被遮挡”的视觉。
    jarOcclusion: this._getOrCreateLayer("JarOcclusionLayer", 46),
    testGrid: this._getOrCreateLayer("TestGridLayer", 47),
    routeEditor: this._getOrCreateLayer("RouteEditorLayer", 48),
    hud: this._getOrCreateLayer("HUDLayer", 50),
    modal: this._getOrCreateLayer("ModalLayer", 90)
  };
};
LevelRenderer.prototype._getOrCreateLayer = function (name, zIndex) {
  var node = this.rootNode.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = this.rootNode;
  }

  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      node.setContentSize(rootSize);
      node.setPosition(0, 0);
    }
  }

  node.zIndex = zIndex;
  return node;
};

LevelRenderer.prototype._collectSpritePaths = function (levelConfig, runtimeSnapshot) {
  var paths = this._collectCommonSpritePaths().slice();

  (levelConfig.level.colors || []).forEach(function (colorCode) {
    paths.push(BALL_RESOURCES[colorCode]);
  });

  (levelConfig.level.jarColors || []).forEach(function (colorCode) {
    paths.push(JAR_RESOURCES[colorCode]);
    paths.push(JAR_MASK_RESOURCES[colorCode]);
  });

  (levelConfig.level.specialEntities || []).forEach(function (entity) {
    paths.push(BALL_RESOURCES[resolveBallCode(entity)]);
  });

  if (runtimeSnapshot && runtimeSnapshot.shooter) {
    paths.push(BALL_RESOURCES[resolveBallCode(runtimeSnapshot.shooter.currentBall || runtimeSnapshot.shooter.currentColor)]);
    paths.push(BALL_RESOURCES[resolveBallCode(runtimeSnapshot.shooter.nextBall || runtimeSnapshot.shooter.nextColor)]);
  }

  if (runtimeSnapshot && runtimeSnapshot.activeProjectile) {
    paths.push(BALL_RESOURCES[resolveBallCode(runtimeSnapshot.activeProjectile.ball || runtimeSnapshot.activeProjectile.color)]);
  }

  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);
  if (objectiveDisplay.iconCode) {
    paths.push(BALL_RESOURCES[objectiveDisplay.iconCode]);
  }

  return paths.filter(Boolean).filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._setGuideDotsActiveCount = function (guideCanvas, count, dotFrame) {
  var required = Math.max(0, Math.floor(Number(count) || 0));
  for (var index = 0; index < required; index += 1) {
    var dotNode = this.guideDotNodes[index];
    if (!dotNode || !cc.isValid(dotNode)) {
      dotNode = new cc.Node("GuideDot_" + index);
      dotNode.__guideDotFrame = null;
      this.guideDotNodes[index] = dotNode;
    }

    if (dotNode.parent !== guideCanvas) {
      dotNode.parent = guideCanvas;
    }

    if (dotNode.__guideDotFrame !== dotFrame) {
      ensureSprite(dotNode, dotFrame);
      dotNode.setContentSize(GUIDE_DOT_SIZE, GUIDE_DOT_SIZE);
      dotNode.__guideDotFrame = dotFrame;
    }

    dotNode.active = true;
    dotNode.opacity = 255;
  }

  for (var recycleIndex = required; recycleIndex < this.guideDotNodes.length; recycleIndex += 1) {
    var inactiveNode = this.guideDotNodes[recycleIndex];
    if (inactiveNode && cc.isValid(inactiveNode)) {
      inactiveNode.stopAllActions();
      inactiveNode.__guidePulseParity = null;
      inactiveNode.__guidePulseSpeedScale = null;
      inactiveNode.scale = 1;
      inactiveNode.active = false;
    }
  }
};

LevelRenderer.prototype._applyGuideDotPulse = function (dotNode, pointIndex) {
  if (!dotNode || !cc.isValid(dotNode)) {
    return;
  }

  // Point #1/#3/#5... (0-based even index) starts larger; #2/#4/#6... starts smaller.
  var pulseParity = pointIndex % 2;
  var speedScale = Math.max(0.1, Number(BoardLayout.guideDotPulseSpeedScale) || 1);
  if (dotNode.__guidePulseParity === pulseParity && dotNode.__guidePulseSpeedScale === speedScale) {
    return;
  }

  dotNode.stopAllActions();
  dotNode.__guidePulseParity = pulseParity;
  dotNode.__guidePulseSpeedScale = speedScale;

  var startsLarge = pulseParity === 0;
  var firstScale = startsLarge ? GUIDE_DOT_PULSE_SCALE_LARGE : GUIDE_DOT_PULSE_SCALE_SMALL;
  var secondScale = startsLarge ? GUIDE_DOT_PULSE_SCALE_SMALL : GUIDE_DOT_PULSE_SCALE_LARGE;
  var pulseDuration = GUIDE_DOT_PULSE_DURATION / speedScale;
  dotNode.scale = firstScale;

  if (typeof cc.tween !== "function") {
    return;
  }

  // Cocos 的稳定循环写法：repeatForever(子 tween)。
  cc.tween(dotNode)
    .repeatForever(
      cc.tween()
        .to(pulseDuration, { scale: secondScale }, { easing: "sineInOut" })
        .to(pulseDuration, { scale: firstScale }, { easing: "sineInOut" })
    )
    .start();
};

LevelRenderer.prototype._collectCommonSpritePaths = function () {
  return [
    "image/bg",
    "image/fort",
    GUIDE_DOT_SPRITE_PATH,
    BALL_RESOURCES.R,
    BALL_RESOURCES.G,
    BALL_RESOURCES.B,
    BALL_RESOURCES.Y,
    BALL_RESOURCES.P,
    BALL_RESOURCES.RAINBOW,
    BALL_RESOURCES.BLAST,
    BALL_RESOURCES.STONE,
    BALL_RESOURCES.ICE,
    JAR_RESOURCES.R,
    JAR_RESOURCES.G,
    JAR_RESOURCES.B,
    JAR_RESOURCES.Y,
    JAR_RESOURCES.P,
    JAR_MASK_RESOURCES.R,
    JAR_MASK_RESOURCES.G,
    JAR_MASK_RESOURCES.B,
    JAR_MASK_RESOURCES.Y,
    JAR_MASK_RESOURCES.P
  ];
};

LevelRenderer.prototype._collectPrefabPaths = function () {
  var preloadPaths = [
    PREFAB_PATHS.gameView,
    PREFAB_PATHS.winView,
    PREFAB_PATHS.loseView,
    PREFAB_PATHS.shooterPanel,
    PREFAB_PATHS.bubbleItem,
    PREFAB_PATHS.jarItem,
    PREFAB_PATHS.previewBall
  ];

  return preloadPaths.filter(function (path, index, list) {
    return !!path && list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._preloadSprites = function (paths) {
  return Promise.all(paths.map(function (path) {
    if (this.spriteFrameCache[path]) {
      return Promise.resolve(this.spriteFrameCache[path]);
    }

    return loadSpriteFrame(path).then(function (spriteFrame) {
      this.spriteFrameCache[path] = spriteFrame;
      return spriteFrame;
    }.bind(this));
  }, this));
};

var LEVEL_RENDERER_SCENE_DEPS = {
  Logger: Logger,
  DebugFlags: DebugFlags,
  BoardLayout: BoardLayout,
  BALL_RESOURCES: BALL_RESOURCES,
  JAR_RESOURCES: JAR_RESOURCES,
  JAR_MASK_RESOURCES: JAR_MASK_RESOURCES,
  PREFAB_PATHS: PREFAB_PATHS,
  JAR_RENDER_Y_OFFSET: JAR_RENDER_Y_OFFSET,
  GUIDE_DOT_SPACING: GUIDE_DOT_SPACING,
  GUIDE_DOT_RADIUS: GUIDE_DOT_RADIUS,
  GUIDE_DOT_SIZE: GUIDE_DOT_SIZE,
  GUIDE_DOT_MAX_COUNT: GUIDE_DOT_MAX_COUNT,
  GUIDE_DOT_SPRITE_PATH: GUIDE_DOT_SPRITE_PATH,
  GUIDE_DOT_PULSE_DURATION: GUIDE_DOT_PULSE_DURATION,
  GUIDE_DOT_PULSE_SCALE_LARGE: GUIDE_DOT_PULSE_SCALE_LARGE,
  GUIDE_DOT_PULSE_SCALE_SMALL: GUIDE_DOT_PULSE_SCALE_SMALL,
  TEST_SLOT_RADIUS: TEST_SLOT_RADIUS,
  ICE_OVERLAY_OPACITY: ICE_OVERLAY_OPACITY,
  REMAINING_SHOTS_OFFSET_Y: REMAINING_SHOTS_OFFSET_Y,
  NEXT_SHOT_OFFSET_X: NEXT_SHOT_OFFSET_X,
  NEXT_SHOT_OFFSET_Y: NEXT_SHOT_OFFSET_Y,
  BOARD_BUBBLE_SIZE: BOARD_BUBBLE_SIZE,
  NEXT_SHOT_BUBBLE_SIZE: NEXT_SHOT_BUBBLE_SIZE,
  JAR_RENDER_SIZE: JAR_RENDER_SIZE,
  POPUP_CONTENT_CONTAINER_NAME: POPUP_CONTENT_CONTAINER_NAME,
  POPUP_OPEN_ANIM_DURATION: POPUP_OPEN_ANIM_DURATION,
  POPUP_OPEN_ANIM_FROM_SCALE: POPUP_OPEN_ANIM_FROM_SCALE,
  WIN_POPUP_OPEN_ANIM_DURATION: WIN_POPUP_OPEN_ANIM_DURATION,
  WIN_POPUP_OPEN_ANIM_FROM_SCALE: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
  WIN_STAR_ANIM_START_DELAY: WIN_STAR_ANIM_START_DELAY,
  WIN_STAR_ANIM_STAGGER: WIN_STAR_ANIM_STAGGER,
  WIN_STAR_PUNCH_FROM_SCALE: WIN_STAR_PUNCH_FROM_SCALE,
  WIN_STAR_PUNCH_DOWN_SCALE: WIN_STAR_PUNCH_DOWN_SCALE,
  WIN_STAR_SHRINK_DURATION: WIN_STAR_SHRINK_DURATION,
  WIN_STAR_RECOVER_DURATION: WIN_STAR_RECOVER_DURATION,
  IMPACT_DEFAULT_PUSH_DISTANCE: IMPACT_DEFAULT_PUSH_DISTANCE,
  IMPACT_MIN_PUSH_DURATION: IMPACT_MIN_PUSH_DURATION,
  IMPACT_MIN_RETURN_DURATION: IMPACT_MIN_RETURN_DURATION,
  IMPACT_RETURN_DURATION_RATIO: IMPACT_RETURN_DURATION_RATIO,
  ROUTE_LINE_WIDTH_ACTIVE: ROUTE_LINE_WIDTH_ACTIVE,
  ROUTE_LINE_WIDTH_IDLE: ROUTE_LINE_WIDTH_IDLE,
  ROUTE_POINT_RADIUS_ACTIVE: ROUTE_POINT_RADIUS_ACTIVE,
  ROUTE_POINT_RADIUS_IDLE: ROUTE_POINT_RADIUS_IDLE,
  ICE_THAW_SHAKE_OFFSET: ICE_THAW_SHAKE_OFFSET,
  ICE_THAW_SHAKE_STEP_DURATION: ICE_THAW_SHAKE_STEP_DURATION,
  ICE_COLLECT_FLY_DURATION: ICE_COLLECT_FLY_DURATION,
  ICE_COLLECT_BEZIER_ARC: ICE_COLLECT_BEZIER_ARC,
  loadSpriteFrame: loadSpriteFrame,
  createSolidWhiteSpriteFrame: createSolidWhiteSpriteFrame,
  ensureSprite: ensureSprite,
  ensureLabel: ensureLabel,
  ensureOutline: ensureOutline,
  clearChildren: clearChildren,
  getOrCreateChild: getOrCreateChild,
  buildObjectiveDisplayData: buildObjectiveDisplayData,
  buildStateText: buildStateText,
  buildResultTexts: buildResultTexts,
  resolveWinStarRating: resolveWinStarRating,
  buildHudRenderKey: buildHudRenderKey,
  buildJarRenderKey: buildJarRenderKey,
  buildGuidePathKey: buildGuidePathKey,
  clipGuidePathToDistance: clipGuidePathToDistance,
  pointDistance: pointDistance,
  resolveImpactBounceSpeed: resolveImpactBounceSpeed,
  getJarBaseY: getJarBaseY,
  resolveBallCode: resolveBallCode,
  isIceBallLike: isIceBallLike,
  resolveIceInnerColor: resolveIceInnerColor,
  resolveBallVisualKey: resolveBallVisualKey,
  computeShooterAngle: computeShooterAngle,
  createRouteColor: createRouteColor,
  clamp: clamp
};

attachLevelRendererSceneMethods(LevelRenderer, LEVEL_RENDERER_SCENE_DEPS);

LevelRenderer.prototype._instantiateOrCreate = function (prefabPath, parent, name) {
  var existing = parent && name ? parent.getChildByName(name) : null;
  if (existing) {
    return existing;
  }

  var node = prefabPath ? this.prefabFactory.instantiate(prefabPath, parent, name) : null;
  if (!node) {
    node = new cc.Node(name);
    node.parent = parent;
  }
  return node;
};

LevelRenderer.prototype._applyBallVisual = function (node, ballLike, forcedSize) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteCode = resolveBallCode(ballLike);
  var spriteFrame = this.spriteFrameCache[BALL_RESOURCES[spriteCode]];
  if (!spriteFrame) {
    return;
  }

  ensureSprite(spriteTarget, spriteFrame);
  var visualSize = forcedSize || spriteFrame.getOriginalSize();
  spriteTarget.setContentSize(visualSize);

  var iceOverlayNode = getOrCreateChild(spriteTarget, "IceOverlay");
  var shouldShowIceOverlay = isIceBallLike(ballLike) && !!resolveIceInnerColor(ballLike);
  if (shouldShowIceOverlay) {
    var iceFrame = this.spriteFrameCache[BALL_RESOURCES.ICE];
    if (iceFrame) {
      iceOverlayNode.active = true;
      iceOverlayNode.setPosition(0, 0);
      iceOverlayNode.opacity = ICE_OVERLAY_OPACITY;
      iceOverlayNode.zIndex = 5;
      ensureSprite(iceOverlayNode, iceFrame);
      iceOverlayNode.setContentSize(visualSize);
    } else {
      iceOverlayNode.active = false;
    }
  } else {
    iceOverlayNode.active = false;
  }
};

LevelRenderer.prototype._applyJarVisual = function (node, colorCode) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteFrame = this.spriteFrameCache[JAR_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  ensureSprite(spriteTarget, spriteFrame);
  spriteTarget.setContentSize(JAR_RENDER_SIZE);
};

LevelRenderer.prototype._applyJarMaskVisual = function (node, colorCode) {
  var maskNode = node.getChildByName("mask") || node.getChildByName("Mask");
  if (!maskNode) {
    return;
  }

  var spriteFrame = this.spriteFrameCache[JAR_MASK_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  ensureSprite(maskNode, spriteFrame);
  maskNode.setContentSize(JAR_RENDER_SIZE);
};

module.exports = LevelRenderer;

