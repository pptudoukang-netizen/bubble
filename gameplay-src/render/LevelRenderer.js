"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var DebugFlags = require("../../assets/scripts/utils/DebugFlags");
var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var PrefabFactory = require("./PrefabFactory");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var JarScoreConfig = require("../config/JarScoreConfig");
var PropDescriptionConfig = require("../../assets/scripts/config/PropDescriptionConfig");
var RUNTIME_REFRESH_SCOPE = require("../../assets/scripts/config/RuntimeRefreshScope");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var AdRevivePolicy = require("../core/AdRevivePolicy");
var AdRewardCatalog = require("../../assets/scripts/services/AdRewardCatalog");
var RenderNodeHelpers = require("../../assets/scripts/render/RenderNodeHelpers");
var SpriteProxyLayerHelper = require("../../assets/scripts/utils/SpriteProxyLayerHelper");
var BubbleShatterRenderer = require("./BubbleShatterRenderer");
var PropDescriptionViewController = require("../../assets/scripts/ui/PropDescriptionViewController");
var attachLevelRendererSceneMethods = require("./LevelRendererSceneMethods");
var attachLevelRendererFairyMethods = require("./LevelRendererFairyMethods");

var loadSpriteFrame = RenderNodeHelpers.loadSpriteFrame;
var createSolidWhiteSpriteFrame = RenderNodeHelpers.createSolidWhiteSpriteFrame;
var ensureSprite = RenderNodeHelpers.ensureSprite;
var ensureLabel = RenderNodeHelpers.ensureLabel;
var ensureOutline = RenderNodeHelpers.ensureOutline;
var clearChildren = RenderNodeHelpers.clearChildren;
var getOrCreateChild = RenderNodeHelpers.getOrCreateChild;

var BALL_RESOURCES = {
  R: "image/ball/red_ball",
  G: "image/ball/green_ball",
  B: "image/ball/blue_ball",
  Y: "image/ball/yellow_ball",
  P: "image/ball/purple_ball",
  RAINBOW: "image/ball/rainbow_ball",
  BLAST: "image/ball/bomb_ball",
  STONE: "image/ball/stone_ball",
  ICE: "image/ball/ice_ball",
  MOLOTOV: "image/props/fire_box",
  KEY: "image/props/key",
  LOCKED: "image/commone/lock",
  SPLIT_R: "image/ball/split_red_ball",
  SPLIT_G: "image/ball/split_green_ball",
  SPLIT_B: "image/ball/split_blue_ball",
  SPLIT_Y: "image/ball/split_yellow_ball",
  SPLIT_P: "image/ball/split_purple_ball",
  ICE_SNOWBALL: "image/ball/ice_ball",
  BLOCKADE_LINE: "image/ball/blockade_line",
  LIGHT: "image/ball/light_ball",
  SNOW_REMOVAL_TOOLS: "image/ball/snow_removal_tools"
};

var JAR_RESOURCES = {
  R: "image/jar/red_jar",
  G: "image/jar/green_jar",
  B: "image/jar/blue_jar",
  Y: "image/jar/yellow_jar",
  P: "image/jar/purple_jar"
};

var JAR_MASK_RESOURCES = {
  R: "image/jar/red_jar_mask",
  G: "image/jar/green_jar_mask",
  B: "image/jar/blue_jar_mask",
  Y: "image/jar/yellow_jar_mask",
  P: "image/jar/purple_jar_mask"
};

var REWARD_ITEM_RESOURCES = {
  coin: "image/props/coin",
  stamina: "image/props/love"
};

var POWERUP_ICON_RESOURCES = {
  rainbow: "image/props/rainbow_ball",
  swap: "image/props/change_ball",
  blast: "image/props/blast_ball",
  barrier_hammer: "image/props/barrier_hammer",
  precise_aim: "image/props/aim",
  snow_removal: "image/props/snow_removal",
  three_line_elimination: "image/props/three_line_elimination",
  plus_three_balls: "image/props/plus_ball"
};

var WIN_BOTTLE_RESOURCES = {
  R: "image/win/bottle_red",
  G: "image/win/bottle_green",
  B: "image/win/bottle_blue",
  Y: "image/win/bottle_yellow",
  P: "image/win/bottle_purple"
};

var WIN_TARGET_STATUS_RESOURCES = {
  complete: "image/commone/gou",
  incomplete: "image/commone/x"
};
var FAIRY_ANIMATION_BUNDLE_NAME = "animation";
var EXPLODE_ANIMATION_CLIP_PATH = "explode";
var FIREWORKS_PREFAB_PATH = "prefabs/fireworks";
var BOARD_CLEAR_FIREWORKS_BURST_COUNT = 1;
var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = 1.1;

var WIN_TARGET_COLOR_NAMES = {
  R: "红球",
  G: "绿球",
  B: "蓝球",
  Y: "黄球",
  P: "紫球"
};

var HUD_STAR_RESOURCES = {
  lit: "image/ball/img101",
  unlit: "image/ball/img106"
};
var TOP_SLOT_STAR_RESOURCE = "game/top_star";

var PREFAB_PATHS = {
  gameView: "prefabs/ui/GameView",
  hudPanel: "prefabs/ui/HudPanel",
  winView: "prefabs/ui/WinView",
  loseView: "prefabs/ui/LoseView",
  addBallTipsView: "prefabs/ui/AddBallTipsView",
  pauseView: "prefabs/ui/PauseView",
  propDescriptionView: "prefabs/ui/PropDescriptionView",
  bubbleItem: "prefabs/game/BubbleItem",
  fireBubbleItem: "prefabs/game/FireBubbleItem",
  splitBubbleItem: "prefabs/game/SplitBubbleItem",
  lockingBubbleItem: "prefabs/game/LockingBubbleItem",
  keyBubbleItem: "prefabs/game/KeyBubbleItem",
  jarItem: "prefabs/game/JarItem",
  shooterPanel: "prefabs/game/ShooterPanel",
  propsBtn: "prefabs/game/PropsBtn",
  previewBall: "prefabs/game/PreviewBall"
};

var JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var GUIDE_DOT_SPACING = 42;
var GUIDE_DOT_RADIUS = 8;
var GUIDE_DOT_SIZE = GUIDE_DOT_RADIUS * 2;
var GUIDE_DOT_FAR_SCALE = 0.5;
var GUIDE_DOT_MAX_COUNT = 64;
var GUIDE_DOT_MIN_SCALE = 0.5;
var GUIDE_DOT_MAX_SCALE = 1;
var GUIDE_DOT_SPRITE_PATH = "image/ball/white_point";
var GUIDE_DOT_TINTS = {
  R: { r: 255, g: 80, b: 80 },
  G: { r: 78, g: 214, b: 100 },
  B: { r: 72, g: 150, b: 255 },
  Y: { r: 255, g: 211, b: 62 },
  P: { r: 184, g: 96, b: 255 }
};
var BARRIER_HAMMER_HINT_SIZE = new cc.Size(46, 46);
var BARRIER_HAMMER_HINT_OFFSET_X = 16;
var BARRIER_HAMMER_HINT_OFFSET_Y = 18;
var BARRIER_HAMMER_HINT_TAP_OFFSET_X = -10;
var BARRIER_HAMMER_HINT_TAP_OFFSET_Y = -12;
var BARRIER_HAMMER_HINT_LIFT_DURATION = 0.16;
var BARRIER_HAMMER_HINT_STRIKE_DURATION = 0.12;
var BARRIER_HAMMER_HINT_PAUSE_DURATION = 0.1;

function resolveRefreshScope(runtimeSnapshot, options) {
  options = options || {};
  if (typeof options.scope === "string" && options.scope) {
    return options.scope;
  }
  if (runtimeSnapshot && typeof runtimeSnapshot.refreshScope === "string" && runtimeSnapshot.refreshScope) {
    return runtimeSnapshot.refreshScope;
  }
  return RUNTIME_REFRESH_SCOPE.FULL;
}

function assertValidRefreshScope(scope) {
  var valid = false;
  Object.keys(RUNTIME_REFRESH_SCOPE).forEach(function (key) {
    if (RUNTIME_REFRESH_SCOPE[key] === scope) {
      valid = true;
    }
  });
  if (!valid) {
    throw new Error("refreshRuntime requires valid scope: " + scope);
  }
}
var TEST_SLOT_RADIUS = Math.floor(BoardLayout.bubbleRadius * 0.88);
var SHOOTER_MAX_ROTATION = 75;
var ICE_OVERLAY_OPACITY = 255;
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
function requireImpactBounceTiming() {
  if (!SpecialAnimationTiming.impactBounce || typeof SpecialAnimationTiming.impactBounce !== "object") {
    throw new Error("SpecialAnimationTiming.impactBounce is required.");
  }
  return SpecialAnimationTiming.impactBounce;
}
var IMPACT_BOUNCE_TIMING = requireImpactBounceTiming();
var IMPACT_DEFAULT_PUSH_DISTANCE = IMPACT_BOUNCE_TIMING.defaultPushDistance;
var IMPACT_MIN_PUSH_DURATION = IMPACT_BOUNCE_TIMING.minPushDuration;
var IMPACT_MIN_RETURN_DURATION = IMPACT_BOUNCE_TIMING.minReturnDuration;
var IMPACT_RETURN_DURATION_RATIO = IMPACT_BOUNCE_TIMING.returnDurationRatio;
var SHOT_NO_DROP_SHAKE_OFFSET = 10;
var SHOT_NO_DROP_SHAKE_STEP_DURATION = 0.035;
var ROUTE_LINE_WIDTH_ACTIVE = 6;
var ROUTE_LINE_WIDTH_IDLE = 4;
var ROUTE_POINT_RADIUS_ACTIVE = 7;
var ROUTE_POINT_RADIUS_IDLE = 5;
var ICE_THAW_SHAKE_OFFSET = 7;
var ICE_THAW_SHAKE_STEP_DURATION = 0.04;
var ICE_COLLECT_FLY_DURATION = SpecialAnimationTiming.iceSnowballCollect.flyDuration;
var ICE_COLLECT_BEZIER_ARC = 120;
var ICE_COLLECT_FLY_Z_INDEX = 1100;
var ICE_COLLECT_FLY_EASE_RATE = 2;
var ICE_COLLECT_FLY_TWEEN_EASING = "quadIn";
var SPLITTER_SPAWN_FLY_DURATION = 0.36;
var SPLITTER_SPAWN_BEZIER_ARC = 96;
var COMMENT_ANIMATION_RESOURCES = {
  good: "ui/animation/comments/good",
  great: "ui/animation/comments/great",
  excellent: "ui/animation/comments/excellent",
  unbelievable: "ui/animation/comments/unbelievable"
};
var COMMENT_ANIMATION_TIERS = [
  { threshold: 12, key: "unbelievable" },
  { threshold: 10, key: "excellent" },
  { threshold: 7, key: "great" },
  { threshold: 5, key: "good" }
];
var COMMENT_ANIMATION_IN_DURATION = 0.2;
var COMMENT_ANIMATION_SETTLE_DURATION = 0.05;
var COMMENT_ANIMATION_HOLD_DURATION = 0.5;
var COMMENT_ANIMATION_OUT_DURATION = 0.3;
var COMMENT_ANIMATION_START_SCALE = 0.8;
var COMMENT_ANIMATION_PUNCH_SCALE = 1.1;
var COMMENT_ANIMATION_NORMAL_SCALE = 1;
var COMMENT_ANIMATION_OUT_SCALE = 1.3;
var LOSE_COIN_REVIVE_COST = 500;

var ROUTE_EDITOR_COLORS = [
  { r: 255, g: 195, b: 0 },
  { r: 53, g: 197, b: 255 },
  { r: 104, g: 211, b: 145 },
  { r: 255, g: 120, b: 120 },
  { r: 179, g: 132, b: 255 },
  { r: 255, g: 153, b: 68 }
];

function getCollectionObjectiveList(levelConfig) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("Level config is required for collection objectives.");
  }
  if (!Array.isArray(levelConfig.level.bonusObjectives)) {
    throw new Error("level.bonusObjectives must be an array for collection objectives.");
  }
  if (!Array.isArray(levelConfig.level.winConditions)) {
    throw new Error("level.winConditions must be an array for collection objectives.");
  }

  return levelConfig.level.bonusObjectives.concat(levelConfig.level.winConditions);
}

function hasIceSnowballCollectionObjective(levelConfig) {
  var objectives = getCollectionObjectiveList(levelConfig);
  for (var i = 0; i < objectives.length; i += 1) {
    var objective = objectives[i];
    if (objective && objective.type === "collect_ice_snowball") {
      return true;
    }
  }
  return false;
}

function findCollectionObjective(levelConfig) {
  var allObjectives = getCollectionObjectiveList(levelConfig);

  for (var i = 0; i < allObjectives.length; i += 1) {
    var objective = allObjectives[i];
    if (!objective || typeof objective.type !== "string") {
      throw new Error("Collection objective entry must include type.");
    }

    if (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice_snowball") {
      return objective;
    }
  }

  return null;
}

function retainSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    throw new Error("Cannot retain empty sprite frame: " + path);
  }
  if (typeof spriteFrame.addRef !== "function") {
    throw new Error("SpriteFrame.addRef is required for gameplay sprite: " + path);
  }
  spriteFrame.addRef();
  return spriteFrame;
}

function releaseRetainedSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    return;
  }
  if (typeof spriteFrame.decRef !== "function") {
    throw new Error("SpriteFrame.decRef is required for gameplay sprite: " + path);
  }
  spriteFrame.decRef();
}

function hasValidSpriteFrame(spriteFrame) {
  if (!spriteFrame) {
    return false;
  }
  if (cc && typeof cc.isValid === "function") {
    return cc.isValid(spriteFrame);
  }
  return true;
}

function pushUniqueSpritePath(paths, path, label) {
  if (typeof path !== "string" || !path) {
    throw new Error("Sprite path is required: " + label);
  }
  if (paths.indexOf(path) < 0) {
    paths.push(path);
  }
}

function pushBallSpritePath(paths, code, label) {
  if (!code) {
    return;
  }
  if (typeof code !== "string" || !BALL_RESOURCES[code]) {
    throw new Error("Unsupported ball sprite code for " + label + ": " + code);
  }
  pushUniqueSpritePath(paths, BALL_RESOURCES[code], label);
}

function collectBallVisualSpritePaths(paths, ballLike, label) {
  var code = resolveBallCode(ballLike);
  pushBallSpritePath(paths, code, label);
  if (isIceBallLike(ballLike)) {
    pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, label + "/ice_overlay");
  }
}

function collectRuntimeBoardSpritePaths(paths, runtimeSnapshot) {
  if (!runtimeSnapshot || runtimeSnapshot.board === undefined) {
    return;
  }
  if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
    throw new Error("Runtime board snapshot must be an object.");
  }
  if (!Array.isArray(runtimeSnapshot.board.cells)) {
    throw new Error("Runtime board snapshot cells must be an array.");
  }
  runtimeSnapshot.board.cells.forEach(function (cell, index) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Runtime board cell must be an object at index " + index + ".");
    }
    collectBallVisualSpritePaths(paths, cell, "runtime board cell " + index);
  });
}

function buildObjectiveDisplayForObjective(objective, runtimeSnapshot) {
  var jars = runtimeSnapshot && runtimeSnapshot.jars ? runtimeSnapshot.jars : null;
  var objectiveSnapshot = runtimeSnapshot && runtimeSnapshot.objectives ? runtimeSnapshot.objectives : null;

  if (!objective) {
    return {
      iconCode: null,
      progress: 0,
      target: 0,
      remaining: 0,
      remainingText: "0",
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
    var snapshotRemaining = Math.max(0, snapshotTarget - snapshotProgress);
    return {
      iconCode: objectiveSnapshot.iconCode || null,
      progress: snapshotProgress,
      target: snapshotTarget,
      remaining: snapshotRemaining,
      remainingText: String(snapshotRemaining),
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
      remaining: Math.max(0, target - progressAny),
      remainingText: String(Math.max(0, target - progressAny)),
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
      remaining: Math.max(0, target - progressColor),
      remainingText: String(Math.max(0, target - progressColor)),
      progressText: progressColor + "/" + target
    };
  }

  if (objective.type === "collect_ice_snowball") {
    var iceCollected = objectiveSnapshot ? (Number(objectiveSnapshot.iceCollectedTotal) || 0) : 0;
    var iceProgress = target > 0 ? Math.min(iceCollected, target) : iceCollected;
    return {
      iconCode: "ICE_SNOWBALL",
      progress: iceProgress,
      target: target,
      remaining: Math.max(0, target - iceProgress),
      remainingText: String(Math.max(0, target - iceProgress)),
      progressText: iceProgress + "/" + target
    };
  }

  return {
    iconCode: null,
    progress: 0,
    target: 0,
    remaining: 0,
    remainingText: "0",
    progressText: "-"
  };
}

function buildObjectiveDisplayData(levelConfig, runtimeSnapshot) {
  return buildObjectiveDisplayForObjective(findCollectionObjective(levelConfig), runtimeSnapshot);
}

function buildWinTargetDescription(objective, targetValue) {
  if (!objective || typeof objective.type !== "string") {
    throw new Error("Win target description requires objective type.");
  }
  if (!Number.isInteger(targetValue) || targetValue <= 0) {
    throw new Error("Win target description requires positive integer target value.");
  }

  if (objective.type === "collect_color") {
    var colorCode = objective.color;
    if (typeof colorCode !== "string" || !WIN_TARGET_COLOR_NAMES[colorCode]) {
      throw new Error("Win target collect_color requires supported color.");
    }
    return WIN_TARGET_COLOR_NAMES[colorCode] + " " + targetValue;
  }

  if (objective.type === "collect_any") {
    return "任意球 " + targetValue;
  }

  if (objective.type === "collect_ice_snowball") {
    return "冰雪球 " + targetValue;
  }

  throw new Error("Unsupported win target objective type: " + objective.type);
}

function buildWinCompletedTargetEntries(levelConfig, runtimeSnapshot) {
  return buildWinTargetEntries(levelConfig, runtimeSnapshot).filter(function (entry) {
    return entry.completed;
  });
}

function buildWinTargetEntries(levelConfig, runtimeSnapshot) {
  var objectives = getCollectionObjectiveList(levelConfig);
  var entries = [];

  objectives.forEach(function (objective) {
    if (!objective || typeof objective.type !== "string") {
      throw new Error("Win target objective entry must include type.");
    }
    if (
      objective.type !== "collect_any" &&
      objective.type !== "collect_color" &&
      objective.type !== "collect_ice_snowball"
    ) {
      return;
    }

    var display = buildObjectiveDisplayForObjective(objective, runtimeSnapshot);
    if (!Number.isInteger(display.target) || display.target <= 0) {
      throw new Error("Win target objective requires positive integer target value.");
    }
    if (typeof display.iconCode !== "string" || !display.iconCode) {
      throw new Error("Win target objective requires iconCode.");
    }
    if (!Number.isInteger(display.remaining) || display.remaining < 0) {
      throw new Error("Win target objective requires non-negative integer remaining.");
    }

    entries.push({
      iconCode: display.iconCode,
      description: buildWinTargetDescription(objective, display.target),
      completed: display.remaining <= 0
    });
  });

  return entries;
}

function buildWinCollectEntries(levelConfig, runtimeSnapshot) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("Win collect list requires level config.");
  }
  if (!Array.isArray(levelConfig.level.jarColors)) {
    throw new Error("Win collect list requires level.jarColors.");
  }
  if (!runtimeSnapshot || !runtimeSnapshot.jars || typeof runtimeSnapshot.jars.collectedByColor !== "object") {
    throw new Error("Win collect list requires runtimeSnapshot.jars.collectedByColor.");
  }

  var collectedByColor = runtimeSnapshot.jars.collectedByColor;
  var entries = [];

  levelConfig.level.jarColors.forEach(function (colorCode) {
    if (typeof colorCode !== "string" || !WIN_BOTTLE_RESOURCES[colorCode]) {
      throw new Error("Win collect list unsupported jar color: " + colorCode);
    }

    var count = Math.floor(Number(collectedByColor[colorCode]));
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Win collect count must be non-negative integer: " + colorCode);
    }
    if (count <= 0) {
      return;
    }

    entries.push({
      colorCode: colorCode,
      count: count
    });
  });

  return entries;
}

function buildHudTargetDisplayData(levelConfig, runtimeSnapshot) {
  var objectives = getCollectionObjectiveList(levelConfig);
  var ballObjective = null;
  var iceSnowballObjective = null;

  for (var i = 0; i < objectives.length; i += 1) {
    var objective = objectives[i];
    if (!objective || typeof objective.type !== "string") {
      throw new Error("HUD target objective entry must include type.");
    }

    if (
      !ballObjective &&
      (objective.type === "collect_any" || objective.type === "collect_color")
    ) {
      ballObjective = objective;
    } else if (!iceSnowballObjective && objective.type === "collect_ice_snowball") {
      iceSnowballObjective = objective;
    }
  }

  return {
    ball: ballObjective ? buildObjectiveDisplayForObjective(ballObjective, runtimeSnapshot) : null,
    iceSnowball: iceSnowballObjective ? buildObjectiveDisplayForObjective(iceSnowballObjective, runtimeSnapshot) : null
  };
}

function applyIceSnowballHudDisplayProgress(hudTargetDisplay, displayProgress) {
  if (!hudTargetDisplay || !hudTargetDisplay.iceSnowball) {
    return hudTargetDisplay;
  }
  if (!Number.isInteger(displayProgress) || displayProgress < 0) {
    throw new Error("Ice snowball HUD display progress must be a non-negative integer.");
  }

  var target = hudTargetDisplay.iceSnowball.target;
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error("Ice snowball HUD display requires positive integer target.");
  }

  var progress = Math.min(displayProgress, target);
  var remaining = Math.max(0, target - progress);
  return {
    ball: hudTargetDisplay.ball,
    iceSnowball: {
      iconCode: hudTargetDisplay.iceSnowball.iconCode,
      progress: progress,
      target: target,
      remaining: remaining,
      remainingText: String(remaining),
      progressText: progress + "/" + target
    }
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

  if (runtimeSnapshot.state === "out_of_shots_add_ball_prompt") {
    return "步数耗尽，等待加球确认";
  }

  if (runtimeSnapshot.state === "out_of_shots") {
    return "步数耗尽";
  }

  if (runtimeSnapshot.state === "won_surplus_shots_pending") {
    return "剩余球结算中";
  }

  if (runtimeSnapshot.state === "won_pending") {
    return "清屏结算中";
  }

  if (runtimeSnapshot.state === "won_settlement_pending") {
    return "";
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

function buildHudRenderKey(levelConfig, runtimeSnapshot, iceSnowballDisplayProgress) {
  var levelCode = levelConfig && levelConfig.level ? levelConfig.level.code : "";
  var matched = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.matched
    ? runtimeSnapshot.lastResolution.matched.length
    : 0;
  var floating = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.floating
    ? runtimeSnapshot.lastResolution.floating.length
    : 0;
  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  if (Number.isInteger(iceSnowballDisplayProgress) && iceSnowballDisplayProgress >= 0) {
    hudTargetDisplay = applyIceSnowballHudDisplayProgress(hudTargetDisplay, iceSnowballDisplayProgress);
  }

  return [
    levelCode,
    runtimeSnapshot ? runtimeSnapshot.state : "",
    runtimeSnapshot ? runtimeSnapshot.score : 0,
    runtimeSnapshot ? runtimeSnapshot.turnsUntilDrop : "",
    matched,
    floating,
    objectiveDisplay.progress || 0,
    objectiveDisplay.iconCode || "",
    objectiveDisplay.progressText ? objectiveDisplay.progressText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.remainingText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.progressText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.iconCode : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.remainingText : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.progressText : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.iconCode : ""
  ].join("|");
}

function quantizeRenderValue(value, step) {
  return Math.round(value / step) * step;
}

function resolveRuntimeBallKey(ballLike) {
  if (!ballLike || typeof ballLike !== "object") {
    return "";
  }
  if (typeof ballLike.color === "string" && ballLike.color) {
    return ballLike.color;
  }
  if (typeof ballLike.entityType === "string" && ballLike.entityType) {
    return ballLike.entityType;
  }
  return "";
}

function buildBottomPanelRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var shooter = runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var skillInventory = shooter.skillInventory ? shooter.skillInventory : {};
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "precise_aim")) {
    throw new Error("Bottom panel render key requires precise_aim count.");
  }
  var preciseAimCount = Number(skillInventory.precise_aim);
  if (!Number.isInteger(preciseAimCount) || preciseAimCount < 0) {
    throw new Error("Bottom panel render key precise_aim count must be a non-negative integer.");
  }
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "snow_removal")) {
    throw new Error("Bottom panel render key requires snow_removal count.");
  }
  var snowRemovalCount = Number(skillInventory.snow_removal);
  if (!Number.isInteger(snowRemovalCount) || snowRemovalCount < 0) {
    throw new Error("Bottom panel render key snow_removal count must be a non-negative integer.");
  }
  var adRunPowerups = runtimeSnapshot.adRunPowerups ? runtimeSnapshot.adRunPowerups : {};
  var adRunPowerupAllowed = runtimeSnapshot.adRunPowerupAllowed ? runtimeSnapshot.adRunPowerupAllowed : {};
  return [
    runtimeSnapshot.state || "",
    shooter.canUsePowerups ? 1 : 0,
    shooter.pendingBarrierHammer ? 1 : 0,
    shooter.pendingRainbowColorSelection ? 1 : 0,
    runtimeSnapshot.infiniteShots ? 1 : 0,
    Math.max(0, Math.floor(Number(skillInventory.rainbow) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.blast) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.swap) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.barrier_hammer) || 0)),
    preciseAimCount,
    shooter.ricochetGuideActive === true ? 1 : 0,
    snowRemovalCount,
    Math.max(0, Math.floor(Number(adRunPowerups.three_line_elimination) || 0)),
    Math.max(0, Math.floor(Number(adRunPowerups.plus_three_balls) || 0)),
    adRunPowerupAllowed.three_line_elimination === true ? 1 : 0,
    adRunPowerupAllowed.plus_three_balls === true ? 1 : 0
  ].join("|");
}

function buildShooterRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var shooter = runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var aim = shooter.aim ? shooter.aim : { origin: {}, direction: {} };
  var origin = aim.origin ? aim.origin : {};
  var direction = aim.direction ? aim.direction : {};
  var trajectory = shooter.trajectory;
  var projectile = runtimeSnapshot.activeProjectile;
  var rainbowSelection = shooter.pendingRainbowColorSelection;
  var rainbowColorsKey = rainbowSelection && Array.isArray(rainbowSelection.colors)
    ? rainbowSelection.colors.join(",")
    : "";
  return [
    runtimeSnapshot.remainingShots,
    shooter.infiniteShots ? 1 : 0,
    shooter.isAiming ? 1 : 0,
    shooter.ricochetGuideActive === true ? 1 : 0,
    shooter.canUsePowerups ? 1 : 0,
    shooter.pendingBarrierHammer ? 1 : 0,
    rainbowColorsKey,
    quantizeRenderValue(origin.x || 0, 0.5).toFixed(1),
    quantizeRenderValue(origin.y || 0, 0.5).toFixed(1),
    quantizeRenderValue(direction.x || 0, 0.001).toFixed(3),
    quantizeRenderValue(direction.y || 0, 0.001).toFixed(3),
    resolveRuntimeBallKey(shooter.currentBall || shooter.currentColor),
    resolveRuntimeBallKey(shooter.nextBall || shooter.nextColor),
    shooter.queueAdvanceRevision,
    shooter.surplusShotAimRecenterRevision,
    Math.max(0, Math.floor(Number(shooter.skillInventory && shooter.skillInventory.swap) || 0)),
    trajectory && trajectory.targetCell ? (trajectory.targetCell.row + ":" + trajectory.targetCell.col) : "",
    projectile && projectile.position
      ? (Math.round(projectile.position.x) + ":" + Math.round(projectile.position.y))
      : ""
  ].join("|");
}

function buildTimerRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var jarSeconds = runtimeSnapshot.jarScoreBoostActive
    ? Math.ceil(Math.max(0, Number(runtimeSnapshot.jarScoreBoostRemainingMs) || 0) / 1000)
    : 0;
  var timedTick = runtimeSnapshot.timedLevel
    ? Math.ceil(Math.max(0, Number(runtimeSnapshot.remainingTimeMs) || 0) / 250)
    : -1;
  return [
    runtimeSnapshot.jarScoreBoostActive ? 1 : 0,
    jarSeconds,
    runtimeSnapshot.timedLevel ? 1 : 0,
    timedTick
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

function measurePathDistance(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return 0;
  }

  var total = 0;
  for (var index = 1; index < pathPoints.length; index += 1) {
    total += pointDistance(pathPoints[index - 1], pathPoints[index]);
  }
  return total;
}

function resolveGuideFrontClipDistance(trajectory) {
  if (!trajectory || typeof trajectory.totalDistance !== "number") {
    return null;
  }

  var clipRadiusScale = Math.max(0, Number(BoardLayout.guideFrontClipRadiusScale) || 1);
  var tailClipDistance = BoardLayout.bubbleRadius * clipRadiusScale;
  if (trajectory.targetCellPosition && trajectory.collidedCellPosition) {
    var centerDistance = pointDistance(trajectory.targetCellPosition, trajectory.collidedCellPosition);
    tailClipDistance = (centerDistance * 0.5) * clipRadiusScale;
  }

  var frontDistance = Math.max(0, trajectory.totalDistance - tailClipDistance);

  if (trajectory.origin && trajectory.hitPoint) {
    var prefixPoints = [{
      x: trajectory.origin.x,
      y: trajectory.origin.y
    }];
    (trajectory.wallPoints || []).forEach(function (wallPoint) {
      prefixPoints.push({
        x: wallPoint.x,
        y: wallPoint.y
      });
    });
    prefixPoints.push({
      x: trajectory.hitPoint.x,
      y: trajectory.hitPoint.y
    });
    var distanceToHit = measurePathDistance(prefixPoints);
    if (isFinite(distanceToHit) && distanceToHit > 0) {
      frontDistance = Math.min(frontDistance, distanceToHit);
    }
  }

  return frontDistance;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveImpactBounceSpeed(impact) {
  var impactSpeed = Number(impact && impact.bounceSpeed);
  if (isFinite(impactSpeed) && impactSpeed > 0) {
    return Math.max(80, impactSpeed);
  }

  var boardBounceSpeed = Number(BoardLayout.impactBounceSpeed);
  if (!isFinite(boardBounceSpeed) || boardBounceSpeed <= 0) {
    throw new Error("BoardLayout.impactBounceSpeed must be a positive number.");
  }
  return Math.max(80, boardBounceSpeed);
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

    if (ballLike.entityType === "molotov") {
      return "MOLOTOV";
    }

    if (ballLike.entityType === "key") {
      return "KEY";
    }

    if (ballLike.entityType === "locked") {
      return "LOCKED";
    }

    if (ballLike.entityType === "splitter") {
      if (typeof ballLike.splitColor !== "string" || !BALL_RESOURCES["SPLIT_" + ballLike.splitColor]) {
        throw new Error("Splitter visual requires supported splitColor.");
      }
      return "SPLIT_" + ballLike.splitColor;
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
  this.spriteFrameLoadPromises = {};
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  this.layers = null;
  this.prefabFactory = new PrefabFactory();
  this.bubbleShatterRenderer = new BubbleShatterRenderer({
    boardLayout: BoardLayout,
    ballResources: BALL_RESOURCES,
    resolveBallCode: resolveBallCode,
    bubbleWidth: BOARD_BUBBLE_SIZE.width,
    bubbleHeight: BOARD_BUBBLE_SIZE.height
  });
  this._sharedWarmupPromise = null;
  this.currentLevelConfig = null;
  this.lastRuntimeSnapshot = null;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.whiteMaskFrames = {};
  this.whiteMaskTextures = [];
  this.lastHudRenderKey = "";
  this.lastHudStarRating = null;
  this.hudStarDisplayedRating = null;
  this.hudStarQueuedRating = 0;
  this.hudStarAnimationQueue = [];
  this.hudStarAnimationActive = false;
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastWinViewRenderKey = "";
  this.lastAddBallTipsViewRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.gameplayInteractionEnabled = true;
  this.lastImpactSeq = -1;
  this.lastNoDropShakeEventId = -1;
  this.lastIceThawShakeSeq = -1;
  this.lastIceSnowballCollectEventId = -1;
  this.lastMatchedObjectiveCollectEventId = -1;
  this.lastKeyUnlockAnimationKey = "";
  this.splitterSpawnAnimatedEntryKeys = {};
  this.splitterSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.boardBubbleNodes = {};
  this.boardBubbleNodePool = {};
  this.boardCellRenderKeys = {};
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.barrierHammerHintNodes = {};
  this.lastBarrierHammerHintKey = "";
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingDropNodes = {};
  this.fallingDropNodePool = {};
  this.fallingRenderTick = 1;
  this.jarFractionNodePool = [];
  this.ballScoreNodePool = [];
  this.ballScoreDisplayGeneration = 0;
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
  this.winActionHandlers = {
    onNextLevel: null,
    onRetryLevel: null
  };
  this.loseActionHandlers = {
    onRetryLevel: null,
    onBackLevel: null,
    onWatchAd: null,
    onCoinRevive: null
  };
  this.addBallTipsActionHandlers = {
    onClose: null,
    onWatchAd: null,
    onCoinBuy: null
  };
  this.pauseActionHandlers = {
    onContinue: null,
    onRetryLevel: null,
    onExitLevel: null
  };
  this.propDescriptionViewController = null;
  this.resultViewLifecycleHandlers = {
    onWinViewShow: null,
    onWinViewHide: null,
    onLoseViewShow: null,
    onLoseViewHide: null
  };
  this.loseAdPresentation = {
    showVideoIcon: true,
    showCoinIcon: false
  };
  this.loseCoinPresentation = {
    cost: LOSE_COIN_REVIVE_COST,
    getCoinCount: null
  };
  this.addBallTipsCoinPresentation = {
    cost: 0,
    getCoinCount: null
  };
  this.gameplayActionHandlers = {
    onBackToLevel: null,
    onOpenPause: null,
    onOpenSettings: null,
    onOpenPropDescription: null,
    onClosePropDescription: null,
    onUseRainbow: null,
    onUseBlast: null,
    onUseSwap: null,
    onUseBarrierHammer: null,
    onUseSnowRemoval: null,
    onUseThreeLineElimination: null,
    onUsePlusThreeBalls: null,
    onRecoverAdRunPowerupByAd: null,
    onSelectRainbowColor: null,
    onRecoverInventoryByAd: null
  };
}

LevelRenderer.prototype.setLoseAdPresentation = function (options) {
  options = options || {};
  var showVideoIcon = options.showVideoIcon === true;
  var showCoinIcon = options.showCoinIcon === true;
  if (showVideoIcon && showCoinIcon) {
    throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
  }
  this.loseAdPresentation = {
    showVideoIcon: showVideoIcon,
    showCoinIcon: showCoinIcon
  };
};

LevelRenderer.prototype.setLoseCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("LoseView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("LoseView coin revive cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("LoseView coin presentation requires getCoinCount.");
  }
  this.loseCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.setAddBallTipsCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("AddBallTipsView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("AddBallTipsView coin cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
  }
  this.addBallTipsCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.warmupSharedAssets = function () {
  if (this._sharedWarmupPromise) {
    return this._sharedWarmupPromise;
  }

  this._sharedWarmupPromise = Promise.all([
    this._preloadSprites(this._collectCommonSpritePaths()),
    this._preloadFairyPrefabs(),
    this._preloadExplodeAnimationClip(),
    this._preloadFireworksPrefab(),
    this.prefabFactory.preload(this._collectPrefabPaths()),
    this.bubbleShatterRenderer.preload()
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
    onBackLevel: typeof handlers.onBackLevel === "function" ? handlers.onBackLevel : null,
    onWatchAd: typeof handlers.onWatchAd === "function" ? handlers.onWatchAd : null,
    onCoinRevive: typeof handlers.onCoinRevive === "function" ? handlers.onCoinRevive : null
  };
};

LevelRenderer.prototype.setAddBallTipsActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("AddBallTipsView action handlers are required.");
  }
  if (typeof handlers.onClose !== "function") {
    throw new Error("AddBallTipsView requires onClose handler.");
  }
  if (typeof handlers.onWatchAd !== "function") {
    throw new Error("AddBallTipsView requires onWatchAd handler.");
  }
  if (typeof handlers.onCoinBuy !== "function") {
    throw new Error("AddBallTipsView requires onCoinBuy handler.");
  }
  this.addBallTipsActionHandlers = {
    onClose: handlers.onClose,
    onWatchAd: handlers.onWatchAd,
    onCoinBuy: handlers.onCoinBuy
  };
};

LevelRenderer.prototype.setPauseActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("PauseView action handlers are required.");
  }
  if (typeof handlers.onContinue !== "function") {
    throw new Error("PauseView requires onContinue handler.");
  }
  if (typeof handlers.onRetryLevel !== "function") {
    throw new Error("PauseView requires onRetryLevel handler.");
  }
  if (typeof handlers.onExitLevel !== "function") {
    throw new Error("PauseView requires onExitLevel handler.");
  }
  this.pauseActionHandlers = {
    onContinue: handlers.onContinue,
    onRetryLevel: handlers.onRetryLevel,
    onExitLevel: handlers.onExitLevel
  };
};

LevelRenderer.prototype.setResultViewLifecycleHandlers = function (handlers) {
  handlers = handlers || {};
  this.resultViewLifecycleHandlers = {
    onWinViewShow: typeof handlers.onWinViewShow === "function" ? handlers.onWinViewShow : null,
    onWinViewHide: typeof handlers.onWinViewHide === "function" ? handlers.onWinViewHide : null,
    onLoseViewShow: typeof handlers.onLoseViewShow === "function" ? handlers.onLoseViewShow : null,
    onLoseViewHide: typeof handlers.onLoseViewHide === "function" ? handlers.onLoseViewHide : null
  };
};

LevelRenderer.prototype.setGameplayActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.gameplayActionHandlers = {
    onBackToLevel: typeof handlers.onBackToLevel === "function" ? handlers.onBackToLevel : null,
    onOpenPause: typeof handlers.onOpenPause === "function" ? handlers.onOpenPause : null,
    onOpenSettings: typeof handlers.onOpenSettings === "function" ? handlers.onOpenSettings : null,
    onOpenPropDescription: typeof handlers.onOpenPropDescription === "function" ? handlers.onOpenPropDescription : null,
    onClosePropDescription: typeof handlers.onClosePropDescription === "function" ? handlers.onClosePropDescription : null,
    onUseRainbow: typeof handlers.onUseRainbow === "function" ? handlers.onUseRainbow : null,
    onUseBlast: typeof handlers.onUseBlast === "function" ? handlers.onUseBlast : null,
    onUseSwap: typeof handlers.onUseSwap === "function" ? handlers.onUseSwap : null,
    onUseBarrierHammer: typeof handlers.onUseBarrierHammer === "function" ? handlers.onUseBarrierHammer : null,
    onUseSnowRemoval: typeof handlers.onUseSnowRemoval === "function" ? handlers.onUseSnowRemoval : null,
    onUseThreeLineElimination: typeof handlers.onUseThreeLineElimination === "function" ? handlers.onUseThreeLineElimination : null,
    onUsePlusThreeBalls: typeof handlers.onUsePlusThreeBalls === "function" ? handlers.onUsePlusThreeBalls : null,
    onRecoverAdRunPowerupByAd: typeof handlers.onRecoverAdRunPowerupByAd === "function" ? handlers.onRecoverAdRunPowerupByAd : null,
    onSelectRainbowColor: typeof handlers.onSelectRainbowColor === "function" ? handlers.onSelectRainbowColor : null,
    onRecoverInventoryByAd: typeof handlers.onRecoverInventoryByAd === "function" ? handlers.onRecoverInventoryByAd : null
  };
};

LevelRenderer.prototype.setFallingMarbleSystem = function (fallingMarbleSystem, boardAdvancePresentationTarget) {
  if (
    !fallingMarbleSystem ||
    typeof fallingMarbleSystem.requestEliminationPresentationDropRelease !== "function"
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires FallingMarbleSystem.");
  }
  if (
    boardAdvancePresentationTarget !== undefined &&
    (
      !boardAdvancePresentationTarget ||
      typeof boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete !== "function"
    )
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires board advance presentation target when provided.");
  }
  this.bubbleShatterRenderer.setPresentationCompleteHandler(function () {
    fallingMarbleSystem.requestEliminationPresentationDropRelease();
    if (boardAdvancePresentationTarget) {
      boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete();
    }
  });
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
  } else if (action === "ad") {
    handler = this.loseActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.loseActionHandlers.onCoinRevive;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeAddBallTipsAction = function (action) {
  var handler = null;
  if (action === "close") {
    handler = this.addBallTipsActionHandlers.onClose;
  } else if (action === "ad") {
    handler = this.addBallTipsActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.addBallTipsActionHandlers.onCoinBuy;
  } else {
    throw new Error("Unsupported AddBallTipsView action: " + action);
  }

  if (typeof handler !== "function") {
    throw new Error("AddBallTipsView action handler is missing: " + action);
  }

  handler();
};

LevelRenderer.prototype._invokePauseAction = function (action) {
  var handler = null;
  if (action === "continue") {
    handler = this.pauseActionHandlers.onContinue;
  } else if (action === "retry") {
    handler = this.pauseActionHandlers.onRetryLevel;
  } else if (action === "exit") {
    handler = this.pauseActionHandlers.onExitLevel;
  } else {
    throw new Error("Unsupported PauseView action: " + action);
  }
  if (typeof handler !== "function") {
    throw new Error("PauseView action handler is missing: " + action);
  }
  handler();
};

LevelRenderer.prototype._invokeGameplayAction = function (action) {
  if (this.gameplayInteractionEnabled !== true) {
    return;
  }

  var handler = null;
  if (action === "back") {
    handler = this.gameplayActionHandlers.onBackToLevel;
  } else if (action === "open_pause") {
    handler = this.gameplayActionHandlers.onOpenPause;
  } else if (action === "open_settings") {
    handler = this.gameplayActionHandlers.onOpenSettings;
  } else if (action === "open_prop_description") {
    handler = this.gameplayActionHandlers.onOpenPropDescription;
  } else if (action === "close_prop_description") {
    handler = this.gameplayActionHandlers.onClosePropDescription;
  } else if (action === "use_rainbow") {
    handler = this.gameplayActionHandlers.onUseRainbow;
  } else if (action === "use_blast") {
    handler = this.gameplayActionHandlers.onUseBlast;
  } else if (action === "use_swap") {
    handler = this.gameplayActionHandlers.onUseSwap;
  } else if (action === "use_barrier_hammer") {
    handler = this.gameplayActionHandlers.onUseBarrierHammer;
  } else if (action === "use_snow_removal") {
    handler = this.gameplayActionHandlers.onUseSnowRemoval;
  } else if (action === "use_precise_aim") {
    handler = this.gameplayActionHandlers.onUsePreciseAim;
  } else if (action === "use_three_line_elimination") {
    handler = this.gameplayActionHandlers.onUseThreeLineElimination;
  } else if (action === "use_plus_three_balls") {
    handler = this.gameplayActionHandlers.onUsePlusThreeBalls;
  } else if (action.indexOf("select_rainbow_color:") === 0) {
    handler = this.gameplayActionHandlers.onSelectRainbowColor;
    if (typeof handler === "function") {
      handler(action.slice("select_rainbow_color:".length));
      return;
    }
  } else if (action.indexOf("recover_inventory:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverInventoryByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_inventory:".length));
      return;
    }
  } else if (action.indexOf("recover_ad_powerup:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverAdRunPowerupByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_ad_powerup:".length));
      return;
    }
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype.setGameplayInteractionEnabled = function (enabled) {
  if (typeof enabled !== "boolean") {
    throw new Error("Gameplay interaction enabled state must be boolean.");
  }
  this.gameplayInteractionEnabled = enabled;
};

LevelRenderer.prototype._notifyResultViewLifecycle = function (handlerName) {
  if (!this.resultViewLifecycleHandlers) {
    return;
  }
  var handler = this.resultViewLifecycleHandlers[handlerName];
  if (typeof handler === "function") {
    handler();
  }
};

LevelRenderer.prototype._notifyActiveResultViewsHidden = function () {
  if (!this.layers || !this.layers.modal) {
    return;
  }
  var winView = this.layers.modal.getChildByName("WinView");
  if (winView && winView.active) {
    this._notifyResultViewLifecycle("onWinViewHide");
  }
  var loseView = this.layers.modal.getChildByName("LoseView");
  if (loseView && loseView.active) {
    this._notifyResultViewLifecycle("onLoseViewHide");
  }
};

LevelRenderer.prototype.renderLevel = function (levelConfig, runtimeSnapshot) {
  if (typeof this._stopBoardClearFireworks === "function") {
    this._stopBoardClearFireworks("render_level");
  }
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.lastHudRenderKey = "";
  this.lastHudStarRating = null;
  this.hudStarDisplayedRating = null;
  this.hudStarQueuedRating = 0;
  this.hudStarAnimationQueue = [];
  this.hudStarAnimationActive = false;
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
  this.lastNoDropShakeEventId = -1;
  this.lastIceThawShakeSeq = -1;
  this.lastIceSnowballCollectEventId = -1;
  this.lastMatchedObjectiveCollectEventId = -1;
  this.lastKeyUnlockAnimationKey = "";
  this.splitterSpawnAnimatedEntryKeys = {};
  this.splitterSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingRenderTick = 1;
  this._ensureLayers();
  this.bubbleShatterRenderer.setLayer(this.layers.shatter);
  this.bubbleShatterRenderer.reset();
  this.setGameplayLayersVisible(true);

  var spritePaths = this._collectSpritePaths(levelConfig, runtimeSnapshot);

  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return Promise.all([
      this.warmupSharedAssets(),
      this._preloadSprites(spritePaths)
    ]);
  }.bind(this)).then(function () {
    clearChildren(this.layers.background);
    clearChildren(this.layers.board);
    this.boardBubbleNodes = {};
    this.boardBubbleNodePool = {};
    this.boardCellRenderKeys = {};
    this.topSlotStarNodes = {};
    this.topSlotStarNodePool = [];
    this.barrierHammerHintNodes = {};
    this.lastBarrierHammerHintKey = "";
    clearChildren(this.layers.testGrid);
    this.testSlotNodes = {};
    this.testSlotNodePool = [];
    clearChildren(this.layers.falling);
    this.fallingDropNodes = {};
    this.fallingDropNodePool = {};
    clearChildren(this.layers.jarOcclusion);
    clearChildren(this.layers.jars);
    this._recycleJarFractionNodesBeforeHudClear();
    this._resetBallScoreHudBeforeHudClear();
    clearChildren(this.layers.hud);
    clearChildren(this.layers.dangerLine);
    clearChildren(this.layers.overlay);
    clearChildren(this.layers.comment);
    this._notifyActiveResultViewsHidden();
    clearChildren(this.layers.modal);
    this.lastWinViewRenderKey = "";
    this.lastAddBallTipsViewRenderKey = "";
    clearChildren(this.layers.routeEditor);
    clearChildren(this.layers.shooter);
    clearChildren(this.layers.testGrid);

    this._mountGameViewScaffold();
    this.syncBoardLayoutHudBottomLine();
    if (this._fairyAssistSystem) {
      this.syncFairyAssistCollisionCenters();
    }
    this._renderBackground();
    this._renderHud(levelConfig, runtimeSnapshot);
    this._initializeComboBatterHud();
    this._initializeFractionHud();
    this._initializeBallScoreHud();
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this._renderBottomPanel(runtimeSnapshot);
    this._renderBoard(runtimeSnapshot.board);
    this._syncBarrierHammerStoneHints(runtimeSnapshot);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this._renderFairyAssists(runtimeSnapshot);
    this._renderFallingDrops(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    this._renderWinView(runtimeSnapshot);
    this._renderAddBallTipsView(runtimeSnapshot);
    this._renderLoseView(runtimeSnapshot);
    this._renderResultPopup(runtimeSnapshot);
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this.lastHudRenderKey = buildHudRenderKey(
      levelConfig,
      runtimeSnapshot,
      this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
    );
    this.lastJarRenderKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
    this.lastBottomPanelRenderKey = buildBottomPanelRenderKey(runtimeSnapshot);
    this.lastShooterRenderKey = buildShooterRenderKey(runtimeSnapshot);
    this.lastTimerRenderKey = buildTimerRenderKey(runtimeSnapshot);
    Logger.info("Rendered runtime view", levelConfig.level.code);
  }.bind(this));
};

LevelRenderer.prototype.refreshRuntime = function (levelConfig, runtimeSnapshot, options) {
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  var scope = resolveRefreshScope(runtimeSnapshot, options);
  assertValidRefreshScope(scope);
  this._syncBoardClearFireworks(runtimeSnapshot);

  if (scope === RUNTIME_REFRESH_SCOPE.PROJECTILE) {
    this._refreshRuntimeProjectile(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM_ANGLE) {
    this._refreshRuntimeShooterAimAngle(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM) {
    this._refreshRuntimeShooterAim(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.FALLING) {
    this._refreshRuntimeFalling(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.TIMER) {
    this._refreshRuntimeTimer(runtimeSnapshot);
    return;
  }

  this._refreshRuntimeFull(levelConfig, runtimeSnapshot);
};

LevelRenderer.prototype._refreshRuntimeProjectile = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.activeProjectile) {
    throw new Error("Projectile refresh scope requires activeProjectile.");
  }
  this._updateProjectileOnly(runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAimAngle = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim angle refresh scope requires shooter snapshot.");
  }
  this._renderShooterAimAngleOnly(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAim = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim refresh scope requires shooter snapshot.");
  }
  this._renderShooter(
    runtimeSnapshot.shooter,
    runtimeSnapshot.activeProjectile,
    runtimeSnapshot.remainingShots
  );
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (!runtimeSnapshot.activeProjectile) {
    this.lastShooterRenderKey = nextShooterKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFalling = function (runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot
    ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0))
    : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);
};

LevelRenderer.prototype._refreshRuntimeTimer = function (runtimeSnapshot) {
  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFull = function (levelConfig, runtimeSnapshot) {
  var boardViewportOffsetY = runtimeSnapshot.board.viewportOffsetY;
  if (typeof boardViewportOffsetY !== "number" || !isFinite(boardViewportOffsetY)) {
    throw new Error("Runtime board viewportOffsetY must be a finite number.");
  }
  var boardChanged = runtimeSnapshot.board.version !== this.lastBoardVersion ||
    boardViewportOffsetY !== this.lastBoardViewportOffsetY;
  this.bubbleShatterRenderer.playResolution(
    runtimeSnapshot.lastResolution,
    runtimeSnapshot.board,
    this.boardBubbleNodes,
    this.spriteFrameCache
  );
  this._playBallScoreDisplay(runtimeSnapshot);
  if (boardChanged) {
    this._renderBoard(runtimeSnapshot.board);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
  }
  this._syncBarrierHammerStoneHints(runtimeSnapshot);

  if (!this._shouldFlyIceSnowballToHud(levelConfig)) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
  }

  var iceSnowballDisplayProgress = this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot);
  var nextHudKey = buildHudRenderKey(levelConfig, runtimeSnapshot, iceSnowballDisplayProgress);
  if (nextHudKey !== this.lastHudRenderKey) {
    this._renderHud(levelConfig, runtimeSnapshot);
    this.lastHudRenderKey = nextHudKey;
  }

  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }

  var nextBottomPanelKey = buildBottomPanelRenderKey(runtimeSnapshot);
  if (nextBottomPanelKey !== this.lastBottomPanelRenderKey) {
    this._renderBottomPanel(runtimeSnapshot);
    this.lastBottomPanelRenderKey = nextBottomPanelKey;
  }

  var nextJarKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
  if (nextJarKey !== this.lastJarRenderKey) {
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = nextJarKey;
  }

  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0)) : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);

  this._playIceThawShake(runtimeSnapshot);
  this._playMatchedObjectiveCollectFly(runtimeSnapshot);
  this._playIceSnowballCollectFly(runtimeSnapshot);
  this._playShotNoDropScreenShake(runtimeSnapshot);
  this._playComboBatterDisplay(runtimeSnapshot);
  this._playJarFractionDisplay(runtimeSnapshot);
  this._playImpactBounce(runtimeSnapshot);
  this._playKeyUnlockAnimation(runtimeSnapshot);
  this._playSplitterSpawnAnimation(runtimeSnapshot);
  this._playMolotovBlastAnimation(runtimeSnapshot);
  this._playBlastExplosionAnimation(runtimeSnapshot);
  this._playCommentAnimation(runtimeSnapshot);

  var hasActiveProjectile = !!(runtimeSnapshot.activeProjectile);
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (hasActiveProjectile || nextShooterKey !== this.lastShooterRenderKey) {
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    if (!hasActiveProjectile) {
      this.lastShooterRenderKey = nextShooterKey;
    }
  }

  this._renderWinView(runtimeSnapshot);
  this._renderAddBallTipsView(runtimeSnapshot);
  this._renderLoseView(runtimeSnapshot);
  this._renderResultPopup(runtimeSnapshot);
};

LevelRenderer.RUNTIME_REFRESH_SCOPE = RUNTIME_REFRESH_SCOPE;

LevelRenderer.prototype._forEachGameplayLayer = function (callback) {
  if (typeof callback !== "function") {
    throw new Error("Gameplay layer callback must be a function.");
  }
  if (!this.layers) {
    return;
  }

  Object.keys(this.layers).forEach(function (layerKey) {
    var layerNode = this.layers[layerKey];
    if (!layerNode || !layerNode.isValid) {
      throw new Error("Gameplay layer node is missing or invalid: " + layerKey);
    }
    callback(layerNode, layerKey);
  }.bind(this));
};

LevelRenderer.prototype.setGameplayLayersVisible = function (visible) {
  if (typeof visible !== "boolean") {
    throw new Error("setGameplayLayersVisible requires boolean visible.");
  }
  if (!this.layers) {
    if (visible) {
      this._ensureLayers();
    }
    return;
  }

  if (!visible) {
    this._notifyActiveResultViewsHidden();
    if (typeof this._stopBoardClearFireworks === "function") {
      this._stopBoardClearFireworks("hide_gameplay_layers");
    }
  }

  this._forEachGameplayLayer(function (layerNode) {
    layerNode.active = visible;
  });
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
    shatter: this._getOrCreateLayer("BubbleShatterLayer", 44),
    // 掉落球前置到固定球前方，提升层次与动效可见度。
    falling: this._getOrCreateLayer("FallingLayer", 45),
    // 罐体遮罩继续位于掉落球之上，保持“入缸后被遮挡”的视觉。
    jarOcclusion: this._getOrCreateLayer("JarOcclusionLayer", 46),
    testGrid: this._getOrCreateLayer("TestGridLayer", 47),
    routeEditor: this._getOrCreateLayer("RouteEditorLayer", 48),
    hud: this._getOrCreateLayer("HUDLayer", 50),
    comment: this._getOrCreateLayer("CommentLayer", 95),
    modal: this._getOrCreateLayer("ModalLayer", 100)
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

  if (!levelConfig || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("LevelRenderer sprite collection requires level config.");
  }

  var level = levelConfig.level;
  if (!Array.isArray(level.colors)) {
    throw new Error("LevelRenderer sprite collection requires level.colors.");
  }
  level.colors.forEach(function (colorCode, index) {
    pushBallSpritePath(paths, colorCode, "level.colors[" + index + "]");
  });

  if (!Array.isArray(level.jarColors)) {
    throw new Error("LevelRenderer sprite collection requires level.jarColors.");
  }
  level.jarColors.forEach(function (colorCode, index) {
    if (typeof colorCode !== "string" || !JAR_RESOURCES[colorCode] || !JAR_MASK_RESOURCES[colorCode]) {
      throw new Error("Unsupported jar color for level.jarColors[" + index + "]: " + colorCode);
    }
    pushUniqueSpritePath(paths, JAR_RESOURCES[colorCode], "level.jarColors[" + index + "]");
    pushUniqueSpritePath(paths, JAR_MASK_RESOURCES[colorCode], "level.jarColors[" + index + "]/mask");
    if (WIN_BOTTLE_RESOURCES[colorCode]) {
      pushUniqueSpritePath(paths, WIN_BOTTLE_RESOURCES[colorCode], "level.jarColors[" + index + "]/win_bottle");
    }
  });

  getCollectionObjectiveList(levelConfig).forEach(function (objective) {
    if (!objective || typeof objective.type !== "string") {
      throw new Error("Sprite preload objective entry must include type.");
    }
    if (objective.type === "collect_any") {
      pushUniqueSpritePath(paths, BALL_RESOURCES.RAINBOW, "collect_any objective");
      return;
    }
    if (objective.type === "collect_color") {
      pushBallSpritePath(paths, objective.color, "collect_color objective");
      return;
    }
    if (objective.type === "collect_ice_snowball") {
      pushUniqueSpritePath(paths, BALL_RESOURCES.ICE_SNOWBALL, "collect_ice_snowball objective");
      pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, "collect_ice_snowball objective overlay");
    }
  });

  if (level.specialEntities !== undefined) {
    if (!Array.isArray(level.specialEntities)) {
      throw new Error("LevelRenderer sprite collection requires level.specialEntities array when present.");
    }
    level.specialEntities.forEach(function (entity, index) {
      collectBallVisualSpritePaths(paths, entity, "level.specialEntities[" + index + "]");
    });
  }

  collectRuntimeBoardSpritePaths(paths, runtimeSnapshot);

  if (runtimeSnapshot && runtimeSnapshot.shooter) {
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.shooter.currentBall !== undefined ? runtimeSnapshot.shooter.currentBall : runtimeSnapshot.shooter.currentColor,
      "runtime shooter current ball"
    );
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.shooter.nextBall !== undefined ? runtimeSnapshot.shooter.nextBall : runtimeSnapshot.shooter.nextColor,
      "runtime shooter next ball"
    );
  }

  if (runtimeSnapshot && runtimeSnapshot.activeProjectile) {
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.activeProjectile.ball !== undefined ? runtimeSnapshot.activeProjectile.ball : runtimeSnapshot.activeProjectile.color,
      "runtime active projectile"
    );
  }
  if (
    runtimeSnapshot &&
    runtimeSnapshot.shooter &&
    runtimeSnapshot.shooter.pendingRainbowColorSelection &&
    Array.isArray(runtimeSnapshot.shooter.pendingRainbowColorSelection.colors)
  ) {
    runtimeSnapshot.shooter.pendingRainbowColorSelection.colors.forEach(function (colorCode) {
      pushBallSpritePath(paths, colorCode, "pending rainbow color");
    });
  }

  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);
  if (objectiveDisplay.iconCode) {
    pushBallSpritePath(paths, objectiveDisplay.iconCode, "objective display");
  }
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  if (hudTargetDisplay.ball && hudTargetDisplay.ball.iconCode) {
    pushBallSpritePath(paths, hudTargetDisplay.ball.iconCode, "HUD target ball");
  }
  if (hudTargetDisplay.iceSnowball && hudTargetDisplay.iceSnowball.iconCode) {
    pushBallSpritePath(paths, hudTargetDisplay.iceSnowball.iconCode, "HUD ice snowball target");
    pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, "HUD ice snowball overlay");
  }

  if (level.clearRewardItems !== undefined) {
    if (!Array.isArray(level.clearRewardItems)) {
      throw new Error("LevelRenderer sprite collection requires level.clearRewardItems array when present.");
    }
    level.clearRewardItems.forEach(function (rewardItem) {
      if (!rewardItem || !REWARD_ITEM_RESOURCES[rewardItem.id]) {
        throw new Error("Unsupported level clear reward item id: " + (rewardItem && rewardItem.id));
      }
      pushUniqueSpritePath(paths, REWARD_ITEM_RESOURCES[rewardItem.id], "level clear reward " + rewardItem.id);
    });
  }

  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectRetainedSpritePaths = function () {
  return this._collectCommonSpritePaths().filter(function (path, index, list) {
    return !!path && list.indexOf(path) === index;
  });
};

LevelRenderer.prototype.releaseLevelSpecificSpriteCache = function () {
  var retainPaths = {};
  this._collectRetainedSpritePaths().forEach(function (path) {
    retainPaths[path] = true;
  });

  Object.keys(this.spriteFrameCache).forEach(function (path) {
    if (retainPaths[path]) {
      return;
    }
    var spriteFrame = this.spriteFrameCache[path];
    delete this.spriteFrameCache[path];
    releaseRetainedSpriteFrame(spriteFrame, path);
  }.bind(this));
};

LevelRenderer.prototype.releaseAfterGameplayBundleUnload = function () {
  Object.keys(this.spriteFrameCache).forEach(function (path) {
    var spriteFrame = this.spriteFrameCache[path];
    releaseRetainedSpriteFrame(spriteFrame, path);
  }.bind(this));
  this.spriteFrameCache = {};
  this.spriteFrameLoadPromises = {};
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  this._sharedWarmupPromise = null;
  if (this.prefabFactory && typeof this.prefabFactory.releaseLoadedCache === "function") {
    this.prefabFactory.releaseLoadedCache();
  } else {
    throw new Error("LevelRenderer requires PrefabFactory.releaseLoadedCache.");
  }
  this.lastHudRenderKey = "";
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastWinViewRenderKey = "";
  this.lastAddBallTipsViewRenderKey = "";
  this.bottomPanelInitialBoardTargets = null;
};

LevelRenderer.prototype._setGuideDotsActiveCount = function (guideCanvas, count, dotFrame, dotTint) {
  var required = Math.max(0, Math.floor(Number(count) || 0));
  if (required > 0 && !dotTint) {
    throw new Error("Guide dots require a color tint when visible.");
  }
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
    dotNode.scale = 1;
    dotNode.color = cc.color(dotTint.r, dotTint.g, dotTint.b);
  }

  for (var recycleIndex = required; recycleIndex < this.guideDotNodes.length; recycleIndex += 1) {
    var inactiveNode = this.guideDotNodes[recycleIndex];
    if (inactiveNode && cc.isValid(inactiveNode)) {
      inactiveNode.stopAllActions();
      inactiveNode.scale = 1;
      inactiveNode.active = false;
    }
  }
};

LevelRenderer.prototype._collectCommonSpritePaths = function () {
  var paths = [
    GUIDE_DOT_SPRITE_PATH,
    BALL_RESOURCES.RAINBOW,
    BALL_RESOURCES.BLAST,
    BALL_RESOURCES.BLOCKADE_LINE,
    BALL_RESOURCES.LIGHT,
    BALL_RESOURCES.SNOW_REMOVAL_TOOLS,
    HUD_STAR_RESOURCES.lit,
    HUD_STAR_RESOURCES.unlit,
    TOP_SLOT_STAR_RESOURCE,
    WIN_TARGET_STATUS_RESOURCES.complete,
    WIN_TARGET_STATUS_RESOURCES.incomplete,
    REWARD_ITEM_RESOURCES.coin,
    REWARD_ITEM_RESOURCES.stamina,
    POWERUP_ICON_RESOURCES.rainbow,
    POWERUP_ICON_RESOURCES.swap,
    POWERUP_ICON_RESOURCES.blast,
    POWERUP_ICON_RESOURCES.barrier_hammer,
    POWERUP_ICON_RESOURCES.precise_aim,
    POWERUP_ICON_RESOURCES.snow_removal,
    POWERUP_ICON_RESOURCES.three_line_elimination,
    POWERUP_ICON_RESOURCES.plus_three_balls,
    COMMENT_ANIMATION_RESOURCES.good,
    COMMENT_ANIMATION_RESOURCES.great,
    COMMENT_ANIMATION_RESOURCES.excellent,
    COMMENT_ANIMATION_RESOURCES.unbelievable
  ];
  PropDescriptionConfig.getAllIconPaths().forEach(function (path) {
    paths.push(path);
  });
  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectPrefabPaths = function () {
  var preloadPaths = [
    PREFAB_PATHS.gameView,
    PREFAB_PATHS.winView,
    PREFAB_PATHS.loseView,
    PREFAB_PATHS.addBallTipsView,
    PREFAB_PATHS.pauseView,
    PREFAB_PATHS.propDescriptionView,
    PREFAB_PATHS.shooterPanel,
    PREFAB_PATHS.propsBtn,
    PREFAB_PATHS.bubbleItem,
    PREFAB_PATHS.fireBubbleItem,
    PREFAB_PATHS.splitBubbleItem,
    PREFAB_PATHS.lockingBubbleItem,
    PREFAB_PATHS.keyBubbleItem,
    PREFAB_PATHS.jarItem,
    PREFAB_PATHS.previewBall
  ];

  return preloadPaths.filter(function (path, index, list) {
    return !!path && list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectFairyPrefabPaths = function () {
  return FairyAssistConfig.colorRules.map(function (rule) {
    if (!rule || typeof rule.prefabPath !== "string" || !rule.prefabPath) {
      throw new Error("Fairy prefab path is required for color rule.");
    }
    return rule.prefabPath;
  }).filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._preloadFairyPrefabs = function () {
  var paths = this._collectFairyPrefabPaths();
  return BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return Promise.all(paths.map(function (path) {
      if (this.fairyPrefabCache[path]) {
        return Promise.resolve(this.fairyPrefabCache[path]);
      }
      if (this.fairyPrefabLoadPromises[path]) {
        return this.fairyPrefabLoadPromises[path];
      }

      this.fairyPrefabLoadPromises[path] = new Promise(function (resolve, reject) {
        if (!bundle || typeof bundle.load !== "function") {
          reject(new Error("Fairy animation bundle is invalid."));
          return;
        }
        bundle.load(path, cc.Prefab, function (error, prefab) {
          if (error) {
            reject(new Error("Load fairy prefab failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + path + "`: " + error.message));
            return;
          }
          if (!prefab) {
            reject(new Error("Load fairy prefab returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + path));
            return;
          }
          this.fairyPrefabCache[path] = prefab;
          delete this.fairyPrefabLoadPromises[path];
          resolve(prefab);
        }.bind(this));
      }.bind(this)).catch(function (error) {
        delete this.fairyPrefabLoadPromises[path];
        throw error;
      }.bind(this));
      return this.fairyPrefabLoadPromises[path];
    }, this));
  }.bind(this));
};

LevelRenderer.prototype._preloadExplodeAnimationClip = function () {
  if (this.explodeAnimationClip) {
    return Promise.resolve(this.explodeAnimationClip);
  }
  if (this.explodeAnimationClipPromise) {
    return this.explodeAnimationClipPromise;
  }

  this.explodeAnimationClipPromise = BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return new Promise(function (resolve, reject) {
      if (!bundle || typeof bundle.load !== "function") {
        reject(new Error("Explode animation bundle is invalid."));
        return;
      }
      bundle.load(EXPLODE_ANIMATION_CLIP_PATH, cc.AnimationClip, function (error, clip) {
        if (error) {
          reject(new Error("Load explode animation clip failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + EXPLODE_ANIMATION_CLIP_PATH + "`: " + error.message));
          return;
        }
        if (!clip) {
          reject(new Error("Load explode animation clip returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + EXPLODE_ANIMATION_CLIP_PATH));
          return;
        }
        if (typeof clip.duration !== "number" || !isFinite(clip.duration) || clip.duration <= 0) {
          reject(new Error("Explode animation clip duration is invalid: " + clip.duration));
          return;
        }
        this.explodeAnimationClip = clip;
        this.explodeAnimationClipPromise = null;
        resolve(clip);
      }.bind(this));
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.explodeAnimationClipPromise = null;
    throw error;
  }.bind(this));

  return this.explodeAnimationClipPromise;
};

LevelRenderer.prototype._preloadFireworksPrefab = function () {
  if (this.fireworksPrefab) {
    return Promise.resolve(this.fireworksPrefab);
  }
  if (this.fireworksPrefabLoadPromise) {
    return this.fireworksPrefabLoadPromise;
  }

  this.fireworksPrefabLoadPromise = BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return new Promise(function (resolve, reject) {
      if (!bundle || typeof bundle.load !== "function") {
        reject(new Error("Fireworks animation bundle is invalid."));
        return;
      }
      bundle.load(FIREWORKS_PREFAB_PATH, cc.Prefab, function (error, prefab) {
        if (error) {
          reject(new Error("Load fireworks prefab failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + FIREWORKS_PREFAB_PATH + "`: " + error.message));
          return;
        }
        if (!prefab) {
          reject(new Error("Load fireworks prefab returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + FIREWORKS_PREFAB_PATH));
          return;
        }
        this.fireworksPrefab = prefab;
        this.fireworksPrefabLoadPromise = null;
        resolve(prefab);
      }.bind(this));
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.fireworksPrefabLoadPromise = null;
    throw error;
  }.bind(this));

  return this.fireworksPrefabLoadPromise;
};

LevelRenderer.prototype._preloadSprites = function (paths) {
  return Promise.all(paths.map(function (path) {
    var cachedSpriteFrame = this.spriteFrameCache[path];
    if (cachedSpriteFrame) {
      if (hasValidSpriteFrame(cachedSpriteFrame)) {
        return Promise.resolve(cachedSpriteFrame);
      }
      delete this.spriteFrameCache[path];
    }
    if (this.spriteFrameLoadPromises[path]) {
      return this.spriteFrameLoadPromises[path];
    }

    this.spriteFrameLoadPromises[path] = loadSpriteFrame(path).then(function (spriteFrame) {
      this.spriteFrameCache[path] = retainSpriteFrame(spriteFrame, path);
      delete this.spriteFrameLoadPromises[path];
      return this.spriteFrameCache[path];
    }.bind(this)).catch(function (error) {
      delete this.spriteFrameLoadPromises[path];
      throw error;
    }.bind(this));
    return this.spriteFrameLoadPromises[path];
  }, this));
};

var LEVEL_RENDERER_SCENE_DEPS = {
  Logger: Logger,
  DebugFlags: DebugFlags,
  BoardLayout: BoardLayout,
  SpecialAnimationTiming: SpecialAnimationTiming,
  BALL_RESOURCES: BALL_RESOURCES,
  WIN_BOTTLE_RESOURCES: WIN_BOTTLE_RESOURCES,
  WIN_TARGET_STATUS_RESOURCES: WIN_TARGET_STATUS_RESOURCES,
  JAR_RESOURCES: JAR_RESOURCES,
  JAR_MASK_RESOURCES: JAR_MASK_RESOURCES,
  REWARD_ITEM_RESOURCES: REWARD_ITEM_RESOURCES,
  POWERUP_ICON_RESOURCES: POWERUP_ICON_RESOURCES,
  HUD_STAR_RESOURCES: HUD_STAR_RESOURCES,
  TOP_SLOT_STAR_RESOURCE: TOP_SLOT_STAR_RESOURCE,
  PREFAB_PATHS: PREFAB_PATHS,
  JAR_RENDER_Y_OFFSET: JAR_RENDER_Y_OFFSET,
  GUIDE_DOT_SPACING: GUIDE_DOT_SPACING,
  GUIDE_DOT_RADIUS: GUIDE_DOT_RADIUS,
  GUIDE_DOT_SIZE: GUIDE_DOT_SIZE,
  GUIDE_DOT_FAR_SCALE: GUIDE_DOT_FAR_SCALE,
  GUIDE_DOT_MAX_COUNT: GUIDE_DOT_MAX_COUNT,
  GUIDE_DOT_SPRITE_PATH: GUIDE_DOT_SPRITE_PATH,
  GUIDE_DOT_TINTS: GUIDE_DOT_TINTS,
  BARRIER_HAMMER_HINT_SIZE: BARRIER_HAMMER_HINT_SIZE,
  BARRIER_HAMMER_HINT_OFFSET_X: BARRIER_HAMMER_HINT_OFFSET_X,
  BARRIER_HAMMER_HINT_OFFSET_Y: BARRIER_HAMMER_HINT_OFFSET_Y,
  BARRIER_HAMMER_HINT_TAP_OFFSET_X: BARRIER_HAMMER_HINT_TAP_OFFSET_X,
  BARRIER_HAMMER_HINT_TAP_OFFSET_Y: BARRIER_HAMMER_HINT_TAP_OFFSET_Y,
  BARRIER_HAMMER_HINT_LIFT_DURATION: BARRIER_HAMMER_HINT_LIFT_DURATION,
  BARRIER_HAMMER_HINT_STRIKE_DURATION: BARRIER_HAMMER_HINT_STRIKE_DURATION,
  BARRIER_HAMMER_HINT_PAUSE_DURATION: BARRIER_HAMMER_HINT_PAUSE_DURATION,
  TEST_SLOT_RADIUS: TEST_SLOT_RADIUS,
  FairyAssistConfig: FairyAssistConfig,
  ICE_OVERLAY_OPACITY: ICE_OVERLAY_OPACITY,
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
  SHOT_NO_DROP_SHAKE_OFFSET: SHOT_NO_DROP_SHAKE_OFFSET,
  SHOT_NO_DROP_SHAKE_STEP_DURATION: SHOT_NO_DROP_SHAKE_STEP_DURATION,
  ROUTE_LINE_WIDTH_ACTIVE: ROUTE_LINE_WIDTH_ACTIVE,
  ROUTE_LINE_WIDTH_IDLE: ROUTE_LINE_WIDTH_IDLE,
  ROUTE_POINT_RADIUS_ACTIVE: ROUTE_POINT_RADIUS_ACTIVE,
  ROUTE_POINT_RADIUS_IDLE: ROUTE_POINT_RADIUS_IDLE,
  ICE_THAW_SHAKE_OFFSET: ICE_THAW_SHAKE_OFFSET,
  ICE_THAW_SHAKE_STEP_DURATION: ICE_THAW_SHAKE_STEP_DURATION,
  ICE_COLLECT_FLY_DURATION: ICE_COLLECT_FLY_DURATION,
  ICE_COLLECT_BEZIER_ARC: ICE_COLLECT_BEZIER_ARC,
  ICE_COLLECT_FLY_Z_INDEX: ICE_COLLECT_FLY_Z_INDEX,
  ICE_COLLECT_FLY_EASE_RATE: ICE_COLLECT_FLY_EASE_RATE,
  ICE_COLLECT_FLY_TWEEN_EASING: ICE_COLLECT_FLY_TWEEN_EASING,
  SPLITTER_SPAWN_FLY_DURATION: SPLITTER_SPAWN_FLY_DURATION,
  SPLITTER_SPAWN_BEZIER_ARC: SPLITTER_SPAWN_BEZIER_ARC,
  FIREWORKS_PREFAB_PATH: FIREWORKS_PREFAB_PATH,
  BOARD_CLEAR_FIREWORKS_BURST_COUNT: BOARD_CLEAR_FIREWORKS_BURST_COUNT,
  BOARD_CLEAR_FIREWORKS_INTERVAL_SEC: BOARD_CLEAR_FIREWORKS_INTERVAL_SEC,
  loadSpriteFrame: loadSpriteFrame,
  createSolidWhiteSpriteFrame: createSolidWhiteSpriteFrame,
  ensureSprite: ensureSprite,
  ensureLabel: ensureLabel,
  ensureOutline: ensureOutline,
  clearChildren: clearChildren,
  getOrCreateChild: getOrCreateChild,
  SpriteProxyLayerHelper: SpriteProxyLayerHelper,
  PropDescriptionViewController: PropDescriptionViewController,
  buildObjectiveDisplayData: buildObjectiveDisplayData,
  buildWinCompletedTargetEntries: buildWinCompletedTargetEntries,
  buildWinTargetEntries: buildWinTargetEntries,
  buildWinCollectEntries: buildWinCollectEntries,
  buildHudTargetDisplayData: buildHudTargetDisplayData,
  applyIceSnowballHudDisplayProgress: applyIceSnowballHudDisplayProgress,
  hasIceSnowballCollectionObjective: hasIceSnowballCollectionObjective,
  buildStateText: buildStateText,
  buildResultTexts: buildResultTexts,
  resolveWinStarRating: resolveWinStarRating,
  buildHudRenderKey: buildHudRenderKey,
  buildJarRenderKey: buildJarRenderKey,
  buildGuidePathKey: buildGuidePathKey,
  clipGuidePathToDistance: clipGuidePathToDistance,
  resolveGuideFrontClipDistance: resolveGuideFrontClipDistance,
  pointDistance: pointDistance,
  resolveImpactBounceSpeed: resolveImpactBounceSpeed,
  getJarBaseY: getJarBaseY,
  resolveBallCode: resolveBallCode,
  isIceBallLike: isIceBallLike,
  resolveIceInnerColor: resolveIceInnerColor,
  resolveBallVisualKey: resolveBallVisualKey,
  computeShooterAngle: computeShooterAngle,
  createRouteColor: createRouteColor,
  buildAdRevivePlan: AdRevivePolicy.buildRevivePlan,
  buildAdReviveDescription: AdRevivePolicy.buildReviveDescription,
  resolveLoseRewardEntry: AdRewardCatalog.resolveLoseRewardEntry,
  clamp: clamp,
  JarScoreConfig: JarScoreConfig
};

attachLevelRendererSceneMethods(LevelRenderer, LEVEL_RENDERER_SCENE_DEPS);
attachLevelRendererFairyMethods(LevelRenderer);

function resolveCommentAnimationKey(clearedCount) {
  for (var index = 0; index < COMMENT_ANIMATION_TIERS.length; index += 1) {
    var tier = COMMENT_ANIMATION_TIERS[index];
    if (clearedCount >= tier.threshold) {
      return tier.key;
    }
  }

  return null;
}

LevelRenderer.prototype._playCommentAnimation = function (runtimeSnapshot) {
  if (!runtimeSnapshot) {
    throw new Error("Comment animation requires runtime snapshot.");
  }
  if (!runtimeSnapshot.lastResolution) {
    throw new Error("Comment animation requires lastResolution.");
  }

  var resolution = runtimeSnapshot.lastResolution;
  if (resolution === this.lastCommentResolution) {
    return;
  }

  if (!Array.isArray(resolution.matched)) {
    throw new Error("Comment animation requires lastResolution.matched array.");
  }
  if (!Array.isArray(resolution.floating)) {
    throw new Error("Comment animation requires lastResolution.floating array.");
  }

  var matchedCount = resolution.matched.length;
  var floatingCount = resolution.floating.length;
  var clearedCount = matchedCount + floatingCount;
  var commentKey = resolveCommentAnimationKey(clearedCount);
  if (!commentKey) {
    return;
  }

  this.lastCommentResolution = resolution;
  if (!this.layers || !this.layers.comment) {
    throw new Error("Comment animation requires CommentLayer.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Comment animation requires cc.tween.");
  }

  var spritePath = COMMENT_ANIMATION_RESOURCES[commentKey];
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Comment animation sprite is not preloaded: " + spritePath);
  }

  clearChildren(this.layers.comment);
  var commentNode = new cc.Node("Comment_" + commentKey);
  commentNode.parent = this.layers.comment;
  commentNode.setPosition(0, 0);
  commentNode.setScale(COMMENT_ANIMATION_START_SCALE);
  commentNode.opacity = 255;
  ensureSprite(commentNode, spriteFrame);
  commentNode.setContentSize(spriteFrame.getOriginalSize());

  cc.tween(commentNode)
    .to(COMMENT_ANIMATION_IN_DURATION, {
      scale: COMMENT_ANIMATION_PUNCH_SCALE
    }, {
      easing: "backOut"
    })
    .to(COMMENT_ANIMATION_SETTLE_DURATION, {
      scale: COMMENT_ANIMATION_NORMAL_SCALE
    }, {
      easing: "quadOut"
    })
    .delay(COMMENT_ANIMATION_HOLD_DURATION)
    .to(COMMENT_ANIMATION_OUT_DURATION, {
      scale: COMMENT_ANIMATION_OUT_SCALE,
      opacity: 0
    }, {
      easing: "quadIn"
    })
    .call(function () {
      if (commentNode && commentNode.isValid) {
        commentNode.removeFromParent(true);
      }
    })
    .start();
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
  var spritePath = BALL_RESOURCES[spriteCode];
  if (!spritePath) {
    throw new Error("Unsupported ball visual code: " + spriteCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded ball sprite frame: " + spritePath);
  }

  spriteTarget.active = true;
  spriteTarget.opacity = 255;
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

