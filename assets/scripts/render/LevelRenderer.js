"use strict";

var Logger = require("../utils/Logger");
var DebugFlags = require("../utils/DebugFlags");
var PrefabFactory = require("./PrefabFactory");
var BoardLayout = require("../config/BoardLayout");
var StarRatingPolicy = require("../core/StarRatingPolicy");

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
var ICE_OVERLAY_OPACITY = 150;
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

var ROUTE_EDITOR_COLORS = [
  { r: 255, g: 195, b: 0 },
  { r: 53, g: 197, b: 255 },
  { r: 104, g: 211, b: 145 },
  { r: 255, g: 120, b: 120 },
  { r: 179, g: 132, b: 255 },
  { r: 255, g: 153, b: 68 }
];

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    cc.loader.loadRes(path, cc.SpriteFrame, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load sprite frame `" + path + "`: " + error.message));
        return;
      }

      resolve(asset);
    });
  });
}

function createSolidWhiteSpriteFrame(width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var texture = new cc.Texture2D();
  var pixels = new Uint8Array(safeWidth * safeHeight * 4);
  pixels.fill(255);

  var pixelFormat = cc.Texture2D.PixelFormat.RGBA8888;
  var ok = texture.initWithData(pixels, pixelFormat, safeWidth, safeHeight);

  if (!ok) {
    return null;
  }

  return {
    texture: texture,
    frame: new cc.SpriteFrame(texture),
    width: safeWidth,
    height: safeHeight
  };
}

function ensureSprite(node, spriteFrame) {
  var sprite = node.getComponent(cc.Sprite) || node.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  return sprite;
}

function ensureLabel(node, text, fontSize, lineHeight, align) {
  var label = node.getComponent(cc.Label) || node.addComponent(cc.Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = lineHeight || Math.round(fontSize * 1.2);
  label.horizontalAlign = align || cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = cc.Label.Overflow.SHRINK;
  return label;
}

function ensureOutline(node, color, width) {
  var outline = node.getComponent(cc.LabelOutline) || node.addComponent(cc.LabelOutline);
  outline.color = color;
  outline.width = width;
  return outline;
}

function clearChildren(node) {
  if (!node) {
    return;
  }

  node.removeAllChildren();
}

function getOrCreateChild(parent, name) {
  var node = parent.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = parent;
  }

  return node;
}

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

    if (objective.type === "collect_any" || objective.type === "collect_color") {
      return objective;
    }
  }

  return null;
}

function buildObjectiveDisplayData(levelConfig, runtimeSnapshot) {
  var objective = findCollectionObjective(levelConfig);
  var jars = runtimeSnapshot && runtimeSnapshot.jars ? runtimeSnapshot.jars : null;

  if (!objective) {
    return {
      iconCode: null,
      progress: 0,
      target: 0,
      progressText: "-"
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
  var objectiveProgress = runtimeSnapshot && runtimeSnapshot.jars
    ? (runtimeSnapshot.jars.objectiveProgress || 0)
    : 0;
  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);

  return [
    levelCode,
    runtimeSnapshot ? runtimeSnapshot.state : "",
    runtimeSnapshot ? runtimeSnapshot.score : 0,
    runtimeSnapshot ? runtimeSnapshot.turnsUntilDrop : "",
    matched,
    floating,
    objectiveProgress,
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
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
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

LevelRenderer.prototype.renderLevel = function (levelConfig, runtimeSnapshot) {
  this.currentLevelConfig = levelConfig;
  this.lastBoardVersion = -1;
  this.lastHudRenderKey = "";
  this.lastJarRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.dangerLineReady = false;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
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
    clearChildren(this.layers.overlay);
    clearChildren(this.layers.modal);
    clearChildren(this.layers.routeEditor);
    clearChildren(this.layers.shooter);
    clearChildren(this.layers.testGrid);

    this._renderBackground();
    this._renderHud(levelConfig, runtimeSnapshot);
    this._renderBoard(runtimeSnapshot.board);
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this._renderFallingDrops(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderDangerLine();
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

  var nextJarKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
  if (nextJarKey !== this.lastJarRenderKey) {
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = nextJarKey;
  }

  this._renderFallingDrops(runtimeSnapshot);
  this._playImpactBounce(runtimeSnapshot);
  if (!this.dangerLineReady) {
    this._renderDangerLine();
  }
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
  return Object.keys(PREFAB_PATHS).map(function (key) {
    return PREFAB_PATHS[key];
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

LevelRenderer.prototype._renderBackground = function () {
  // Scene already has a static `bg` node; avoid drawing a second runtime background.
  var sceneBgNode = this.rootNode ? this.rootNode.getChildByName("bg") : null;
  var runtimeBgNode = this.layers && this.layers.background
    ? this.layers.background.getChildByName("Background")
    : null;
  if (sceneBgNode) {
    if (this.rootNode && this.rootNode.getContentSize) {
      sceneBgNode.setContentSize(this.rootNode.getContentSize());
      sceneBgNode.setPosition(0, 0);
    }
    if (runtimeBgNode) {
      runtimeBgNode.active = false;
    }
    return;
  }

  var node = this._instantiateOrCreate(null, this.layers.background, "Background");
  var frame = this.spriteFrameCache["image/bg"];
  if (!frame) {
    return;
  }

  ensureSprite(node, frame);
  node.setPosition(0, 0);
  node.setContentSize(this.rootNode.getContentSize());
};

LevelRenderer.prototype._renderHud = function (levelConfig, runtimeSnapshot) {
  var panel = this.layers.hud.getChildByName("HudPanel");
  if (!panel) {
    panel = this._instantiateOrCreate(PREFAB_PATHS.hudPanel, this.layers.hud, "HudPanel");
  }
  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);

  this._alignHudPanelToTop(panel);
  this._setHudLabel(panel, "LevelTitle", "关卡");
  this._setHudLabel(panel, "LevelValue", String(levelConfig.level.levelId));
  this._setHudLabel(panel, "ScoreTitle", "得分");
  this._setHudLabel(panel, "ScoreValue", String(runtimeSnapshot.score));
  this._setHudLabel(panel, "TargetTitle", "目标:");
  this._setHudLabel(panel, "TargetValue", objectiveDisplay.progressText || "-");
  this._setHudTargetBallIcon(panel, objectiveDisplay.iconCode);
  this._renderHudStarProgress(panel, runtimeSnapshot);
  var stateValueNode = panel.getChildByName("StateValue");
  if (stateValueNode) {
    stateValueNode.active = false;
  }
  var dropValueNode = panel.getChildByName("DropValue");
  if (dropValueNode) {
    dropValueNode.active = false;
  }
};

LevelRenderer.prototype._setHudTargetBallIcon = function (panel, iconCode) {
  var ballNode = panel ? panel.getChildByName("ball") : null;
  if (!ballNode) {
    return;
  }

  var spritePath = iconCode ? BALL_RESOURCES[iconCode] : null;
  var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
  if (!spriteFrame) {
    ballNode.active = false;
    return;
  }

  ballNode.active = true;
  ensureSprite(ballNode, spriteFrame);
};

LevelRenderer.prototype._alignHudPanelToTop = function (panel) {
  if (!panel || !this.rootNode) {
    return;
  }

  var rootSize = this.rootNode.getContentSize();
  var panelHeight = panel.getContentSize().height || 0;
  panel.setPosition(0, rootSize.height * 0.5 - panelHeight * 0.5);
};

LevelRenderer.prototype._setHudLabel = function (panel, childName, text) {
  var node = getOrCreateChild(panel, childName);
  var label = node.getComponent(cc.Label);
  if (!label) {
    label = node.addComponent(cc.Label);
  }
  label.string = text;
};

LevelRenderer.prototype._getHudProgressBar = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return null;
  }

  return progressNode.getComponent(cc.ProgressBar);
};

LevelRenderer.prototype._getHudStarNodes = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return [];
  }

  return [
    progressNode.getChildByName("star1"),
    progressNode.getChildByName("star2"),
    progressNode.getChildByName("star3") || progressNode.getChildByName("start3")
  ];
};

LevelRenderer.prototype._setHudStarLit = function (starNode, lit) {
  if (!starNode) {
    return;
  }

  starNode.active = true;
  starNode.color = lit ? cc.color(255, 255, 255) : cc.color(125, 125, 125);
  starNode.opacity = lit ? 255 : 190;
};

LevelRenderer.prototype._renderHudStarProgress = function (panel, runtimeSnapshot) {
  var progressBar = this._getHudProgressBar(panel);
  var winStats = runtimeSnapshot && runtimeSnapshot.winStats ? runtimeSnapshot.winStats : null;
  var starProgress = winStats ? clamp(Number(winStats.starProgress) || 0, 0, 1) : 0;
  var starRating = winStats ? clamp(Math.floor(Number(winStats.starRating) || 0), 0, 3) : 0;

  if (progressBar) {
    progressBar.progress = starProgress;
    var barNode = progressBar.node.getChildByName("bar");
    if (barNode) {
      barNode.color = cc.color(255, 214, 87);
      barNode.opacity = 255;
    }
  }

  this._getHudStarNodes(panel).forEach(function (starNode, index) {
    this._setHudStarLit(starNode, index < starRating);
  }, this);
};

LevelRenderer.prototype._renderBoard = function (boardSnapshot) {
  this.lastBoardVersion = boardSnapshot.version;
  this.boardRenderTick += 1;
  var currentTick = this.boardRenderTick;

  boardSnapshot.cells.forEach(function (cell) {
    var cellPosition = BoardLayout.getCellPosition(cell.row, cell.col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
    var bubbleNode = this._acquireBoardBubbleNode(cell.id);
    bubbleNode.__boardTick = currentTick;
    bubbleNode.setPosition(cellPosition.x, cellPosition.y);
    bubbleNode.setScale(1);
    this._applyBallVisualCached(bubbleNode, cell, BOARD_BUBBLE_SIZE);
  }, this);

  this._recycleInactiveBoardBubbleNodes(currentTick);
};

LevelRenderer.prototype._acquireBoardBubbleNode = function (cellId) {
  var nodeId = String(cellId);
  var existing = this.boardBubbleNodes[nodeId];
  if (existing) {
    return existing;
  }

  var node = this.boardBubbleNodePool.length ? this.boardBubbleNodePool.pop() : null;
  if (!node) {
    node = this.prefabFactory.instantiate(PREFAB_PATHS.bubbleItem, null, null) || new cc.Node();
    node.setScale(1);
  }

  node.name = "Bubble_" + nodeId;
  if (node.parent !== this.layers.board) {
    node.parent = this.layers.board;
  }
  node.active = true;
  node.setScale(1);
  this.boardBubbleNodes[nodeId] = node;
  return node;
};

LevelRenderer.prototype._recycleInactiveBoardBubbleNodes = function (activeTick) {
  for (var cellId in this.boardBubbleNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.boardBubbleNodes, cellId)) {
      continue;
    }

    var node = this.boardBubbleNodes[cellId];
    if (node && node.__boardTick === activeTick) {
      continue;
    }

    if (node) {
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      this.boardBubbleNodePool.push(node);
    }

    delete this.boardBubbleNodes[cellId];
  }
};

LevelRenderer.prototype._renderFallingDrops = function (runtimeSnapshot) {
  if (!this.layers || !this.layers.falling) {
    return;
  }

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var drops = fallingSnapshot && fallingSnapshot.activeDrops ? fallingSnapshot.activeDrops : [];
  this.fallingRenderTick += 1;
  var currentTick = this.fallingRenderTick;
  if (!drops.length) {
    this._recycleInactiveFallingDropNodes(currentTick);
    this.lastRenderedFallingCount = 0;
    return;
  }

  drops.forEach(function (drop) {
    var dropId = String(drop.id);
    if (!dropId) {
      return;
    }

    var dropNode = this._acquireFallingDropNode(dropId);
    dropNode.__fallingTick = currentTick;
    dropNode.setPosition(drop.position.x, drop.position.y);
    dropNode.angle = drop.rotation || 0;
    dropNode.opacity = 230;
    this._applyBallVisualCached(dropNode, drop, BOARD_BUBBLE_SIZE);
  }, this);
  this._recycleInactiveFallingDropNodes(currentTick);
  this.lastRenderedFallingCount = drops.length;
};

LevelRenderer.prototype._acquireFallingDropNode = function (dropId) {
  var existing = this.fallingDropNodes[dropId];
  if (existing) {
    return existing;
  }

  var node = this.fallingDropNodePool.length ? this.fallingDropNodePool.pop() : null;
  if (!node) {
    node = this.prefabFactory.instantiate(PREFAB_PATHS.bubbleItem, null, null) || new cc.Node();
    node.setScale(1);
  }

  node.name = "Falling_" + dropId;
  if (node.parent !== this.layers.falling) {
    node.parent = this.layers.falling;
  }
  node.setScale(1);
  node.active = true;
  this.fallingDropNodes[dropId] = node;
  return node;
};

LevelRenderer.prototype._recycleInactiveFallingDropNodes = function (activeTick) {
  for (var dropId in this.fallingDropNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.fallingDropNodes, dropId)) {
      continue;
    }
    var node = this.fallingDropNodes[dropId];
    if (node && node.__fallingTick === activeTick) {
      continue;
    }

    if (node) {
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      this.fallingDropNodePool.push(node);
    }
    delete this.fallingDropNodes[dropId];
  }
};

LevelRenderer.prototype._playImpactBounce = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  if (!impact || !impact.seq || impact.seq === this.lastImpactSeq) {
    return;
  }

  this.lastImpactSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var center = impact.center || { x: 0, y: 0 };
  var pushDistance = Math.max(2, Number(impact.pushDistance) || IMPACT_DEFAULT_PUSH_DISTANCE);
  var bounceSpeed = resolveImpactBounceSpeed(impact);
  var pushDuration = Math.max(IMPACT_MIN_PUSH_DURATION, pushDistance / bounceSpeed);
  var returnDuration = Math.max(IMPACT_MIN_RETURN_DURATION, pushDuration * IMPACT_RETURN_DURATION_RATIO);
  var neighbors = Array.isArray(impact.neighbors) ? impact.neighbors : [];
  var fallingActiveCount = runtimeSnapshot && runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem
    ? Math.max(0, Number(runtimeSnapshot.systems.fallingMarbleSystem.activeDropCount) || 0)
    : 0;
  var neighborBudget = fallingActiveCount >= 36 ? 2 : (fallingActiveCount >= 18 ? 4 : neighbors.length);

  for (var index = 0; index < neighbors.length && index < neighborBudget; index += 1) {
    var neighbor = neighbors[index];
    if (!neighbor || !neighbor.id) {
      continue;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + neighbor.id);
    if (!bubbleNode) {
      continue;
    }

    var baseX = typeof neighbor.x === "number"
      ? neighbor.x
      : (typeof neighbor.position === "object" && typeof neighbor.position.x === "number"
        ? neighbor.position.x
        : bubbleNode.x);
    var baseY = typeof neighbor.y === "number"
      ? neighbor.y
      : (typeof neighbor.position === "object" && typeof neighbor.position.y === "number"
        ? neighbor.position.y
        : bubbleNode.y);
    var dirX = baseX - center.x;
    var dirY = baseY - center.y;
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.0001) {
      dirX = 0;
      dirY = 1;
      len = 1;
    }

    var pushX = baseX + dirX / len * pushDistance;
    var pushY = baseY + dirY / len * pushDistance;

    bubbleNode.stopAllActions();
    bubbleNode.x = baseX;
    bubbleNode.y = baseY;

    if (typeof cc.tween !== "function") {
      bubbleNode.x = baseX;
      bubbleNode.y = baseY;
      continue;
    }

    cc.tween(bubbleNode)
      .to(pushDuration, {
        x: pushX,
        y: pushY
      }, {
        easing: "quadOut"
      })
      .to(returnDuration, {
        x: baseX,
        y: baseY
      }, {
        easing: "quadIn"
      })
      .start();
  }
};

LevelRenderer.prototype._clearJarDropContainers = function () {
  if (!this.layers || !this.layers.jars) {
    return;
  }

  this.layers.jars.children.forEach(function (jarNode) {
    var container = jarNode.getChildByName("FallingInJar");
    if (container) {
      clearChildren(container);
    }
  });
};

LevelRenderer.prototype._findJarInteriorZone = function (drop, runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];
  if (!zones.length) {
    return null;
  }

  var bottomY = drop.position.y - BoardLayout.bubbleRadius;
  var topY = drop.position.y + BoardLayout.bubbleRadius;
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var dx = Math.abs(drop.position.x - zone.x);
    var xInside = dx <= Math.max(6, zone.innerHalfWidth || 0);
    // Delay occlusion so marbles are hidden later, after sinking deeper into the jar mouth.
    var hideTriggerY = zone.mouthY - Math.max(10, BoardLayout.bubbleRadius * 0.35);
    var underMouth = bottomY <= hideTriggerY;
    var aboveBottom = topY >= ((zone.bottomY || 0) + 2);
    if (xInside && underMouth && aboveBottom) {
      return zone;
    }
  }

  return null;
};

LevelRenderer.prototype._resolveJarDropContainer = function (drop, runtimeSnapshot) {
  var zone = this._findJarInteriorZone(drop, runtimeSnapshot);
  if (!zone || !this.layers || !this.layers.jars) {
    return null;
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + zone.index);
  if (!jarNode) {
    return null;
  }

  return this._ensureJarDropContainer(jarNode);
};

LevelRenderer.prototype._ensureJarDropContainer = function (jarNode) {
  var container = getOrCreateChild(jarNode, "FallingInJar");
  var maskNode = jarNode.getChildByName("mask") || jarNode.getChildByName("Mask");

  container.zIndex = 10;
  if (maskNode) {
    maskNode.zIndex = 20;
  }

  return container;
};
LevelRenderer.prototype._renderTestGrid = function (boardSnapshot) {
  if (!this.layers || !this.layers.testGrid) {
    return;
  }

  if (!DebugFlags.get("testLayer")) {
    this.layers.testGrid.active = false;
    return;
  }

  this.layers.testGrid.active = true;
  this.layers.testGrid.opacity = 255;
  this.testGridRenderTick += 1;
  var currentTick = this.testGridRenderTick;

  var occupied = {};
  (boardSnapshot.cells || []).forEach(function (cell) {
    occupied[cell.row + ":" + cell.col] = true;
  });

  var index = 1;
  for (var row = 0; row < boardSnapshot.rowCount; row += 1) {
    var rowColumns = BoardLayout.getRowColumnCount(row, boardSnapshot.maxColumns);
    for (var col = 0; col < rowColumns; col += 1) {
      var key = row + ":" + col;
      var isOccupied = !!occupied[key];
      var cellPosition = BoardLayout.getCellPosition(row, col, boardSnapshot.maxColumns, boardSnapshot.dropOffsetRows);
      var slotNode = this._acquireTestSlotNode(row, col);
      slotNode.__testGridTick = currentTick;
      slotNode.setPosition(cellPosition.x, cellPosition.y);
      slotNode.opacity = 200;
      slotNode.zIndex = 0;

      var graphics = slotNode.getComponent(cc.Graphics) || slotNode.addComponent(cc.Graphics);
      graphics.clear();
      graphics.fillColor = isOccupied ? new cc.Color(130, 220, 255, 92) : new cc.Color(255, 255, 255, 46);
      graphics.strokeColor = isOccupied ? new cc.Color(130, 220, 255, 215) : new cc.Color(255, 255, 255, 140);
      graphics.lineWidth = 2;
      graphics.circle(0, 0, TEST_SLOT_RADIUS);
      graphics.fill();
      graphics.stroke();

      var labelNode = new cc.Node("IndexLabel");
      labelNode.parent = slotNode;
      labelNode.zIndex = 2;
      labelNode.setPosition(0, 0);
      labelNode.setContentSize(TEST_SLOT_RADIUS * 1.9, TEST_SLOT_RADIUS * 1.6);
      labelNode.opacity = 255;
      var indexLabel = ensureLabel(labelNode, String(index), 22, 24);
      indexLabel.overflow = cc.Label.Overflow.NONE;
      indexLabel.enableWrapText = false;
      labelNode.color = cc.color(0, 0, 0);

      index += 1;
    }
  }

  this._recycleInactiveTestSlotNodes(currentTick);
};

LevelRenderer.prototype._acquireTestSlotNode = function (row, col) {
  var slotId = row + ":" + col;
  var existing = this.testSlotNodes[slotId];
  if (existing) {
    return existing;
  }

  var slotNode = this.testSlotNodePool.length ? this.testSlotNodePool.pop() : null;
  if (!slotNode) {
    slotNode = new cc.Node("TestSlot_" + row + "_" + col);
  }

  slotNode.name = "TestSlot_" + row + "_" + col;
  if (slotNode.parent !== this.layers.testGrid) {
    slotNode.parent = this.layers.testGrid;
  }
  slotNode.active = true;
  this.testSlotNodes[slotId] = slotNode;
  return slotNode;
};

LevelRenderer.prototype._recycleInactiveTestSlotNodes = function (activeTick) {
  for (var slotId in this.testSlotNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.testSlotNodes, slotId)) {
      continue;
    }

    var slotNode = this.testSlotNodes[slotId];
    if (slotNode && slotNode.__testGridTick === activeTick) {
      continue;
    }

    if (slotNode) {
      slotNode.active = false;
      slotNode.removeFromParent(false);
      this.testSlotNodePool.push(slotNode);
    }

    delete this.testSlotNodes[slotId];
  }
};

LevelRenderer.prototype._renderDangerLine = function () {
  var node = this.layers.overlay.getChildByName("DangerLine");
  if (!node) {
    node = this._instantiateOrCreate(PREFAB_PATHS.dangerLine, this.layers.overlay, "DangerLine");
  }

  node.setPosition(0, BoardLayout.dangerLineY);

  var band = getOrCreateChild(node, "BandBg");
  band.opacity = 110;

  var labelNode = getOrCreateChild(node, "Label");
  labelNode.color = cc.color(255, 250, 235);
  ensureLabel(labelNode, "危险线", 38, 42);
  ensureOutline(labelNode, cc.color(151, 86, 86), 3);
  this.dangerLineReady = true;
};

LevelRenderer.prototype._renderShooter = function (shooterSnapshot, activeProjectile, remainingShots) {
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    shooterPanel = this._instantiateOrCreate(PREFAB_PATHS.shooterPanel, this.layers.shooter, "ShooterPanel");
  }

  var aim = shooterSnapshot && shooterSnapshot.aim
    ? shooterSnapshot.aim
    : { origin: BoardLayout.shooterOrigin, direction: { x: 0, y: 1 } };
  var shooterAngle = computeShooterAngle(aim.direction);
  var fortNode = getOrCreateChild(shooterPanel, "ShooterBase");
  var fortFrame = this.spriteFrameCache["image/fort"];
  if (fortFrame && fortNode.__fortApplied !== true) {
    ensureSprite(fortNode, fortFrame);
    fortNode.setContentSize(fortFrame.getOriginalSize());
    fortNode.__fortApplied = true;
  }
  fortNode.setPosition(aim.origin.x, aim.origin.y);
  fortNode.angle = shooterAngle;

  var trajectory = shooterSnapshot.trajectory;
  var currentAnchor = getOrCreateChild(shooterPanel, "CurrentBallAnchor");
  currentAnchor.setPosition(aim.origin.x, aim.origin.y);
  currentAnchor.setScale(1);
  this._applyBallVisualCached(currentAnchor, shooterSnapshot.currentBall || shooterSnapshot.currentColor, BOARD_BUBBLE_SIZE);

  var shotsValue = Math.max(0, Math.floor(Number(remainingShots) || 0));
  var remainingShotsNode = getOrCreateChild(shooterPanel, "RemainingShotsValue");
  remainingShotsNode.setPosition(aim.origin.x, aim.origin.y + REMAINING_SHOTS_OFFSET_Y);
  remainingShotsNode.setContentSize(140, 42);
  remainingShotsNode.zIndex = 30;
  remainingShotsNode.color = cc.color(255, 255, 255);
  var remainingShotsLabel = ensureLabel(remainingShotsNode, String(shotsValue), 32, 36);
  remainingShotsLabel.overflow = cc.Label.Overflow.NONE;
  remainingShotsLabel.enableWrapText = false;
  ensureOutline(remainingShotsNode, cc.color(83, 109, 138), 3);

  var nextAnchor = getOrCreateChild(shooterPanel, "NextBallAnchor");
  nextAnchor.setPosition(aim.origin.x + NEXT_SHOT_OFFSET_X, aim.origin.y + NEXT_SHOT_OFFSET_Y);
  nextAnchor.setScale(1);
  nextAnchor.opacity = 200;
  this._applyBallVisualCached(nextAnchor, shooterSnapshot.nextBall || shooterSnapshot.nextColor, NEXT_SHOT_BUBBLE_SIZE);

  var ghost = getOrCreateChild(shooterPanel, "GhostBubble");
  var hasTrajectory = !!(trajectory && trajectory.targetCellPosition && trajectory.pathPoints && trajectory.pathPoints.length >= 2);
  var shouldShowGhost = BoardLayout.showGhostBubble !== false;
  ghost.active = shouldShowGhost && !activeProjectile && hasTrajectory;
  if (ghost.active) {
    ghost.setPosition(trajectory.targetCellPosition.x, trajectory.targetCellPosition.y);
    ghost.setScale(1);
    ghost.opacity = 140;
    this._applyBallVisualCached(ghost, shooterSnapshot.currentBall || shooterSnapshot.currentColor, BOARD_BUBBLE_SIZE);
  }

  var projectileNode = getOrCreateChild(this.layers.shooter, "ActiveProjectile");
  if (activeProjectile) {
    projectileNode.active = true;
    projectileNode.setPosition(activeProjectile.position.x, activeProjectile.position.y);
    projectileNode.setScale(1);
    this._applyBallVisualCached(projectileNode, activeProjectile.ball || activeProjectile.color, BOARD_BUBBLE_SIZE);
  } else {
    projectileNode.active = false;
  }

  var guideDots = getOrCreateChild(shooterPanel, "GuideDots");
  var aimGuidePath = shooterSnapshot && Array.isArray(shooterSnapshot.aimGuidePath)
    ? shooterSnapshot.aimGuidePath
    : null;
  var guidePath = aimGuidePath && aimGuidePath.length >= 2
    ? aimGuidePath
    : (hasTrajectory ? trajectory.pathPoints : null);
  // 辅助线最长只显示到“幽灵球与上方碰撞球之间”的碰撞前端位置。
  // 有碰撞球时：按“目标中心 <-> 碰撞球中心”中点为基准；否则回退到目标中心前半径。
  if (guidePath && hasTrajectory && typeof trajectory.totalDistance === "number") {
    var clipRadiusScale = Math.max(0, Number(BoardLayout.guideFrontClipRadiusScale) || 1);
    var tailClipDistance = BoardLayout.bubbleRadius * clipRadiusScale;
    if (trajectory.targetCellPosition && trajectory.collidedCellPosition) {
      var centerDistance = pointDistance(trajectory.targetCellPosition, trajectory.collidedCellPosition);
      tailClipDistance = (centerDistance * 0.5) * clipRadiusScale;
    }
    var frontDistance = Math.max(0, trajectory.totalDistance - tailClipDistance);
    guidePath = clipGuidePathToDistance(guidePath, frontDistance);
  }

  var shouldShowGuide = !activeProjectile &&
    !!(shooterSnapshot && shooterSnapshot.isAiming) &&
    !!(guidePath && guidePath.length >= 2);

  if (shouldShowGuide) {
    var guideKey = buildGuidePathKey(guidePath);
    guideDots.active = true;
    if (!this.lastGuideDotsVisible || guideKey !== this.lastGuidePathKey) {
      this._renderGuideDots(guideDots, guidePath);
      this.lastGuidePathKey = guideKey;
    }
    this.lastGuideDotsVisible = true;
  } else {
    if (this.lastGuideDotsVisible) {
      guideDots.active = false;
      this._renderGuideDots(guideDots, null);
      this.lastGuideDotsVisible = false;
      this.lastGuidePathKey = "";
    } else {
      guideDots.active = false;
    }
  }

  var dock = getOrCreateChild(shooterPanel, "NextBallDock");
  dock.active = false;
};

LevelRenderer.prototype._applyBallVisualCached = function (node, ballLike, forcedSize) {
  if (!node) {
    return;
  }

  var visualKey = resolveBallVisualKey(ballLike);
  var sizeKey = forcedSize ? (Math.round(forcedSize.width) + "x" + Math.round(forcedSize.height)) : "auto";
  var cacheKey = visualKey + "|" + sizeKey;
  if (node.__ballVisualKey === cacheKey) {
    return;
  }

  this._applyBallVisual(node, ballLike, forcedSize);
  node.__ballVisualKey = cacheKey;
};

LevelRenderer.prototype._renderGuideDots = function (guideContainer, pathPoints) {
  var guideCanvas = getOrCreateChild(guideContainer, "GuideDotsCanvas");
  var dotFrame = this.spriteFrameCache[GUIDE_DOT_SPRITE_PATH];
  if (!dotFrame || !pathPoints || pathPoints.length < 2) {
    this._setGuideDotsActiveCount(guideCanvas, 0, dotFrame);
    return;
  }

  var positions = [];
  for (var segmentIndex = 1; segmentIndex < pathPoints.length; segmentIndex += 1) {
    var from = pathPoints[segmentIndex - 1];
    var to = pathPoints[segmentIndex];
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength < 0.0001) {
      continue;
    }

    var dotsOnSegment = Math.max(1, Math.floor(segmentLength / GUIDE_DOT_SPACING));
    for (var i = 1; i <= dotsOnSegment; i += 1) {
      var t = i / dotsOnSegment;
      positions.push({
        x: from.x + dx * t,
        y: from.y + dy * t
      });
    }
  }

  if (positions.length > GUIDE_DOT_MAX_COUNT) {
    var sampled = [];
    var sampleStep = positions.length / GUIDE_DOT_MAX_COUNT;
    for (var sampleIndex = 0; sampleIndex < GUIDE_DOT_MAX_COUNT; sampleIndex += 1) {
      sampled.push(positions[Math.floor(sampleIndex * sampleStep)]);
    }
    positions = sampled;
  }

  this._setGuideDotsActiveCount(guideCanvas, positions.length, dotFrame);
  for (var pointIndex = 0; pointIndex < positions.length; pointIndex += 1) {
    var dotNode = this.guideDotNodes[pointIndex];
    if (!dotNode || !cc.isValid(dotNode)) {
      continue;
    }
    dotNode.setPosition(positions[pointIndex].x, positions[pointIndex].y);
    this._applyGuideDotPulse(dotNode, pointIndex);
  }
};

LevelRenderer.prototype.renderRouteEditor = function (editorState) {
  this._ensureLayers();

  var routeLayer = this.layers.routeEditor;
  if (!editorState || !Array.isArray(editorState.routes)) {
    routeLayer.active = false;
    clearChildren(routeLayer);
    return;
  }

  var hasRoutes = editorState.routes.some(function (route) {
    return route && Array.isArray(route.points) && route.points.length > 0;
  });
  routeLayer.active = !!(editorState.enabled || hasRoutes);

  var canvas = getOrCreateChild(routeLayer, "RouteCanvas");
  var graphics = canvas.getComponent(cc.Graphics) || canvas.addComponent(cc.Graphics);
  graphics.clear();

  var infoNode = getOrCreateChild(routeLayer, "RouteInfo");
  infoNode.setContentSize(420, 160);
  infoNode.setPosition(-110, 0);
  infoNode.zIndex = 5;
  var infoLabel = ensureLabel(infoNode, "", 24, 32, cc.Label.HorizontalAlign.LEFT);
  infoLabel.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
  infoLabel.enableWrapText = true;
  infoNode.color = cc.color(255, 255, 255);
  ensureOutline(infoNode, cc.color(24, 42, 59), 2);

  var activeRouteId = editorState.activeRouteId;
  var totalPointCount = 0;
  var activeRoute = null;

  editorState.routes.forEach(function (route, index) {
    if (!route || !Array.isArray(route.points) || route.points.length <= 0) {
      return;
    }

    totalPointCount += route.points.length;
    var isActive = route.id === activeRouteId;
    if (isActive) {
      activeRoute = route;
    }

    var strokeColor = createRouteColor(index, isActive);
    graphics.lineWidth = isActive ? ROUTE_LINE_WIDTH_ACTIVE : ROUTE_LINE_WIDTH_IDLE;
    graphics.strokeColor = strokeColor;
    graphics.moveTo(route.points[0].x, route.points[0].y);
    for (var pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
      graphics.lineTo(route.points[pointIndex].x, route.points[pointIndex].y);
    }
    graphics.stroke();

    graphics.fillColor = strokeColor;
    route.points.forEach(function (point) {
      graphics.circle(
        point.x,
        point.y,
        isActive ? ROUTE_POINT_RADIUS_ACTIVE : ROUTE_POINT_RADIUS_IDLE
      );
    });
    graphics.fill();
  });

  if (!activeRoute && editorState.routes.length > 0) {
    activeRoute = editorState.routes[0];
  }

  var latestPoint = activeRoute && Array.isArray(activeRoute.points) && activeRoute.points.length > 0
    ? activeRoute.points[activeRoute.points.length - 1]
    : null;
  var modeText = editorState.enabled ? "开启" : "关闭";
  infoLabel.string = [
    "路线编辑: " + modeText,
    "路线数: " + editorState.routes.length,
    "总点位: " + totalPointCount,
    "当前路线: " + (activeRoute ? activeRoute.name : "-"),
    "当前点数: " + (activeRoute && activeRoute.points ? activeRoute.points.length : 0),
    "最后坐标: " + (latestPoint ? (latestPoint.x + ", " + latestPoint.y) : "-")
  ].join("\n");
  infoNode.active = routeLayer.active;
};

LevelRenderer.prototype._getWhiteSpriteFrameForSize = function (width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var key = safeWidth + "x" + safeHeight;

  if (this.whiteMaskFrames[key]) {
    return this.whiteMaskFrames[key];
  }

  var created = createSolidWhiteSpriteFrame(safeWidth, safeHeight);
  if (!created) {
    Logger.warn("Failed to create white sprite frame", key);
    return null;
  }

  this.whiteMaskTextures.push(created.texture);
  this.whiteMaskFrames[key] = created.frame;
  return created.frame;
};

LevelRenderer.prototype._renderJarCollisionMasks = function (runtimeSnapshot) {
  var maskRoot = getOrCreateChild(this.layers.overlay, "JarCollisionMaskRoot");
  maskRoot.zIndex = 29;
  clearChildren(maskRoot);
  if (!DebugFlags.get("testLayer")) {
    maskRoot.active = false;
    return;
  }
  maskRoot.active = true;

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];

  zones.forEach(function (zone, index) {
    var rimHeight = Math.max(6, (zone.contactBand || 16) * 2);
    var rimWidth = Math.max(8, (zone.rimHalfWidth || 0) * 2);

    var rimFrame = this._getWhiteSpriteFrameForSize(rimWidth, rimHeight);
    if (rimFrame) {
      var rimNode = new cc.Node("RimMask_" + index);
      rimNode.parent = maskRoot;
      rimNode.setPosition(zone.x || 0, zone.mouthY || 0);
      rimNode.color = cc.color(255, 255, 255);
      rimNode.opacity = 80;
      ensureSprite(rimNode, rimFrame);
      rimNode.setContentSize(rimWidth, rimHeight);
    }
}, this);

};
LevelRenderer.prototype._renderBottomJars = function (levelConfig, runtimeSnapshot) {
  var jarColors = levelConfig.level.jarColors || ["R", "G", "B"];
  var jarProgress = runtimeSnapshot.jars ? runtimeSnapshot.jars.collectedByColor : {};
  var jarPositions = BoardLayout.getJarCenterPositions(jarColors.length);


  jarColors.forEach(function (colorCode, index) {
    var jarNode = this._instantiateOrCreate(PREFAB_PATHS.jarItem, this.layers.jars, "BottomJar_" + index);
    jarNode.setPosition(jarPositions[index] || 0, getJarBaseY() + JAR_RENDER_Y_OFFSET);
    jarNode.setScale(1);
    this._applyJarVisual(jarNode, colorCode);
    this._applyJarMaskVisual(jarNode, colorCode);
    this._ensureJarDropContainer(jarNode);

    var countNode = getOrCreateChild(jarNode, "CountLabel");
    countNode.setPosition(0, -118);
    countNode.color = cc.color(255, 255, 255);
    ensureLabel(countNode, String(jarProgress[colorCode] || 0), 34, 38);
    ensureOutline(countNode, cc.color(83, 109, 138), 3);
  }, this);

  this._renderJarOcclusionLayer(jarColors, jarPositions);
  this._renderJarCollisionMasks(runtimeSnapshot);
};

LevelRenderer.prototype._renderJarOcclusionLayer = function (jarColors, jarPositions) {
  if (!this.layers || !this.layers.jarOcclusion) {
    return;
  }

  clearChildren(this.layers.jarOcclusion);
  jarColors.forEach(function (colorCode, index) {
    var spritePath = JAR_MASK_RESOURCES[colorCode];
    var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
    if (!spriteFrame) {
      return;
    }

    var maskNode = new cc.Node("JarOcclusion_" + index);
    maskNode.parent = this.layers.jarOcclusion;
    maskNode.setPosition(jarPositions[index] || 0, getJarBaseY());
    maskNode.setScale(1);
    maskNode.zIndex = index;
    maskNode.opacity = 255;
    ensureSprite(maskNode, spriteFrame);
    maskNode.setContentSize(JAR_RENDER_SIZE);
  }, this);
};

LevelRenderer.prototype._setWinValueText = function (valueNode, text) {
  if (!valueNode) {
    return;
  }

  var label = valueNode.getComponent(cc.Label);
  if (!label) {
    label = valueNode.addComponent(cc.Label);
  }
  label.string = text;
};

LevelRenderer.prototype._ensurePopupMaskVisible = function (popupNode, opacity) {
  if (!popupNode) {
    return;
  }

  var maskNode = popupNode.getChildByName("mask");
  if (!maskNode) {
    return;
  }

  var popupSize = popupNode.getContentSize();
  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      popupSize = rootSize;
      popupNode.setContentSize(rootSize);
    }
  }

  var maskFrame = this._getWhiteSpriteFrameForSize(popupSize.width, popupSize.height);
  if (maskFrame) {
    ensureSprite(maskNode, maskFrame);
    maskNode.setContentSize(popupSize);
  }

  maskNode.active = true;
  maskNode.color = cc.color(0, 0, 0);
  maskNode.opacity = typeof opacity === "number" ? opacity : 100;
  maskNode.zIndex = -10;
};

LevelRenderer.prototype._ensurePopupContentContainer = function (popupNode) {
  if (!popupNode) {
    return null;
  }

  var container = popupNode.getChildByName(POPUP_CONTENT_CONTAINER_NAME);
  if (!container) {
    container = new cc.Node(POPUP_CONTENT_CONTAINER_NAME);
    container.parent = popupNode;
    container.setPosition(0, 0);
    container.zIndex = 0;
  }

  var popupSize = popupNode.getContentSize();
  if (popupSize && popupSize.width > 0 && popupSize.height > 0) {
    container.setContentSize(popupSize);
  }

  popupNode.children.slice().forEach(function (child) {
    if (!child || child === container || child.name === "mask") {
      return;
    }

    var localPos = child.getPosition();
    var childScaleX = child.scaleX;
    var childScaleY = child.scaleY;
    var childAngle = child.angle;
    var childZIndex = child.zIndex;

    child.parent = container;
    child.setPosition(localPos);
    child.scaleX = childScaleX;
    child.scaleY = childScaleY;
    child.angle = childAngle;
    child.zIndex = childZIndex;
  });

  return container;
};

LevelRenderer.prototype._playPopupContentOpenAnimation = function (container, options) {
  if (!container) {
    return;
  }

  options = options || {};
  var duration = typeof options.duration === "number" ? options.duration : POPUP_OPEN_ANIM_DURATION;
  var fromScale = typeof options.fromScale === "number" ? options.fromScale : POPUP_OPEN_ANIM_FROM_SCALE;
  var easing = typeof options.easing === "string" && options.easing ? options.easing : "backOut";

  container.stopAllActions();
  container.opacity = 0;
  container.scale = fromScale;

  if (typeof cc.tween !== "function") {
    container.opacity = 255;
    container.scale = 1;
    return;
  }

  cc.tween(container)
    .to(duration, {
      opacity: 255,
      scale: 1
    }, {
      easing: easing
    })
    .start();
};

LevelRenderer.prototype._bindWinButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__winBoundAction === action) {
    return;
  }

  buttonNode.__winBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeWinAction(action);
  }, this);
};

LevelRenderer.prototype._getWinStarNodes = function (winContent) {
  if (!winContent) {
    return [];
  }

  return [
    winContent.getChildByName("star1"),
    winContent.getChildByName("star2"),
    winContent.getChildByName("star3") || winContent.getChildByName("start3")
  ];
};

LevelRenderer.prototype._renderWinStars = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));
  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }
    starNode.active = index < safeStarRating;
  });
};

LevelRenderer.prototype._playWinStarsPunchAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));

  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    starNode.stopAllActions();
    if (index >= safeStarRating || !starNode.active) {
      starNode.scale = 1;
      return;
    }

    starNode.scale = WIN_STAR_PUNCH_FROM_SCALE;
    if (typeof cc.tween !== "function") {
      starNode.scale = 1;
      return;
    }

    cc.tween(starNode)
      .delay(WIN_STAR_ANIM_START_DELAY + index * WIN_STAR_ANIM_STAGGER)
      // 由慢到快收缩，制造“砸下去”的打击感。
      .to(WIN_STAR_SHRINK_DURATION, {
        scale: WIN_STAR_PUNCH_DOWN_SCALE
      }, {
        easing: "quartIn"
      })
      .to(WIN_STAR_RECOVER_DURATION, {
        scale: 1
      }, {
        easing: "quadOut"
      })
      .start();
  });
};

LevelRenderer.prototype._playWinPopupOpenAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  this._playPopupContentOpenAnimation(winContent, {
    duration: WIN_POPUP_OPEN_ANIM_DURATION,
    fromScale: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
    easing: "backOut"
  });
  this._playWinStarsPunchAnimation(winContent, starRating);
};

LevelRenderer.prototype._bindLoseButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__loseBoundAction === action) {
    return;
  }

  buttonNode.__loseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeLoseAction(action);
  }, this);
};

LevelRenderer.prototype._renderWinView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("WinView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    if (existing) {
      existing.active = false;
    }
    return;
  }

  var winView = existing;
  if (!winView) {
    winView = this._instantiateOrCreate(PREFAB_PATHS.winView, this.layers.modal, "WinView");
  }

  if (!winView) {
    return;
  }

  winView.active = true;
  winView.setPosition(0, 0);
  this._ensurePopupMaskVisible(winView, 100);
  var winContent = this._ensurePopupContentContainer(winView);

  var winStats = runtimeSnapshot.winStats || {};
  var totalScore = Number(winStats.totalScore) || runtimeSnapshot.score || 0;
  var sameColorProgress = Number(winStats.sameColorProgress) || 0;
  var sameColorTarget = Number(winStats.sameColorTarget) || 0;
  var sameColorBonusScore = Number(winStats.sameColorBonusScore) || 0;
  var objectiveDisplay = buildObjectiveDisplayData(this.currentLevelConfig, runtimeSnapshot);
  var progressText = sameColorTarget > 0
    ? (sameColorProgress + "/" + sameColorTarget)
    : String(sameColorProgress);

  var metricRows = (winContent ? winContent.children : []).filter(function (child) {
    return child && child.name === "label_bg";
  }).sort(function (a, b) {
    return b.y - a.y;
  });

  if (metricRows.length >= 3) {
    this._setWinValueText(metricRows[0].getChildByName("score_value"), String(totalScore));
    this._setWinValueText(metricRows[1].getChildByName("score_value"), progressText);
    this._setWinValueText(metricRows[2].getChildByName("score_value"), String(sameColorBonusScore));

    var winBallNode = metricRows[1].getChildByName("ball");
    if (winBallNode) {
      var iconCode = objectiveDisplay.iconCode;
      var spritePath = iconCode ? BALL_RESOURCES[iconCode] : null;
      var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
      if (spriteFrame) {
        winBallNode.active = true;
        ensureSprite(winBallNode, spriteFrame);
      } else {
        winBallNode.active = false;
      }
    }
  }

  var starRating = resolveWinStarRating(this.currentLevelConfig, runtimeSnapshot);
  this._renderWinStars(winContent, starRating);
  if (!wasActive) {
    this._playWinPopupOpenAnimation(winContent, starRating);
  }

  this._bindWinButton(winContent ? winContent.getChildByName("btn_next") : null, "next");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_retry") : null, "retry");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_back") : null, "back");
};

LevelRenderer.prototype._renderLoseView = function (runtimeSnapshot) {
  var isLoseState = !!(
    runtimeSnapshot &&
    (runtimeSnapshot.state === "lost_danger" || runtimeSnapshot.state === "out_of_shots" || runtimeSnapshot.state === "lost_objective")
  );
  var existing = this.layers.modal.getChildByName("LoseView");
  var wasActive = !!(existing && existing.active);
  if (!isLoseState) {
    if (existing) {
      existing.active = false;
    }
    return;
  }

  var loseView = existing;
  if (!loseView) {
    loseView = this._instantiateOrCreate(PREFAB_PATHS.loseView, this.layers.modal, "LoseView");
  }

  if (!loseView) {
    return;
  }

  loseView.active = true;
  loseView.setPosition(0, 0);
  this._ensurePopupMaskVisible(loseView, 164);
  var loseContent = this._ensurePopupContentContainer(loseView);
  if (!wasActive) {
    this._playPopupContentOpenAnimation(loseContent);
  }

  var objectiveDisplay = buildObjectiveDisplayData(this.currentLevelConfig, runtimeSnapshot);
  var objectiveProgressText = objectiveDisplay.progressText || "-";
  var touchedDanger = runtimeSnapshot.state === "lost_danger" || !!(runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.dangerReached);
  var leftBallCount = runtimeSnapshot
    ? Math.max(0, Math.floor(Number(runtimeSnapshot.remainingShots) || 0))
    : 0;

  var scoreValueNode = loseContent ? loseContent.getChildByName("score_value") : null;
  this._setWinValueText(scoreValueNode, objectiveProgressText);
  var leftBallValueNode = loseContent ? loseContent.getChildByName("left_ball_value") : null;
  this._setWinValueText(leftBallValueNode, String(leftBallCount));

  var titleRows = (loseContent ? loseContent.children : []).filter(function (child) {
    return child && child.name === "target_title";
  }).sort(function (a, b) {
    return b.y - a.y;
  });
  if (titleRows.length >= 1) {
    this._setWinValueText(titleRows[0], "当前目标进度");
  }
  if (titleRows.length >= 2) {
    this._setWinValueText(titleRows[1], "是否触碰危险线：" + (touchedDanger ? "是" : "否"));
  }

  var loseBallNode = loseContent ? loseContent.getChildByName("ball") : null;
  if (loseBallNode) {
    var loseIconCode = objectiveDisplay.iconCode;
    var loseSpritePath = loseIconCode ? BALL_RESOURCES[loseIconCode] : null;
    var loseSpriteFrame = loseSpritePath ? this.spriteFrameCache[loseSpritePath] : null;
    if (loseSpriteFrame) {
      loseBallNode.active = true;
      ensureSprite(loseBallNode, loseSpriteFrame);
    } else {
      loseBallNode.active = false;
    }
  }

  this._bindLoseButton(loseContent ? loseContent.getChildByName("btn_retry") : null, "retry");
  this._bindLoseButton(loseContent ? loseContent.getChildByName("btn_back") : null, "back");
};

LevelRenderer.prototype._renderResultPopup = function (runtimeSnapshot) {
  var popup = this._instantiateOrCreate(null, this.layers.modal, "ResultPopup");
  var resultTexts = buildResultTexts(runtimeSnapshot);

  if (!resultTexts) {
    popup.active = false;
    return;
  }

  popup.active = true;
  popup.setPosition(0, 40);

  var bg = getOrCreateChild(popup, "PopupBg");
  var frame = this.spriteFrameCache["image/bg"];
  if (frame) {
    ensureSprite(bg, frame);
    bg.setContentSize(new cc.Size(540, 320));
    bg.opacity = 215;
  }

  var title = getOrCreateChild(popup, "Title");
  title.setPosition(0, 50);
  title.color = cc.color(255, 255, 255);
  ensureLabel(title, resultTexts.title, 54, 58);
  ensureOutline(title, cc.color(83, 109, 138), 4);

  var subtitle = getOrCreateChild(popup, "Subtitle");
  subtitle.setPosition(0, -20);
  subtitle.color = cc.color(255, 250, 235);
  ensureLabel(subtitle, resultTexts.subtitle, 28, 34);
  ensureOutline(subtitle, cc.color(83, 109, 138), 3);

  var detail = getOrCreateChild(popup, "Detail");
  detail.setPosition(0, -95);
  detail.color = cc.color(255, 250, 235);
  ensureLabel(detail, resultTexts.detail, 24, 30);
  ensureOutline(detail, cc.color(83, 109, 138), 2);
};

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
