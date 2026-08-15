"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var DebugFlags = require("../../assets/scripts/utils/DebugFlags");
var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var PrefabFactory = require("./PrefabFactory");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var AssistSpiritConfig = require("../../assets/scripts/config/AssistSpiritConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var JarScoreConfig = require("../config/JarScoreConfig");
var AssistSpiritSkillConfig = require("../config/AssistSpiritSkillConfig");
var AssistSpiritPresentationConfig = require("../config/AssistSpiritPresentationConfig");
var PropDescriptionConfig = require("../../assets/scripts/config/PropDescriptionConfig");
var RUNTIME_REFRESH_SCOPE = require("../../assets/scripts/config/RuntimeRefreshScope");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var AdRevivePolicy = require("../core/AdRevivePolicy");
var AdRewardCatalog = require("../../assets/scripts/services/AdRewardCatalog");
var RenderNodeHelpers = require("../../assets/scripts/render/RenderNodeHelpers");
var SpriteProxyLayerHelper = require("../../assets/scripts/utils/SpriteProxyLayerHelper");
var BubbleShatterRenderer = require("./BubbleShatterRenderer");
var WormholeShaderRenderer = require("./WormholeShaderRenderer");
var LightningChainRenderer = require("./LightningChainRenderer");
var PropDescriptionViewController = require("../../assets/scripts/ui/PropDescriptionViewController");
var attachLevelRendererSceneMethods = require("./LevelRendererSceneMethods");
var attachLevelRendererFairyMethods = require("./LevelRendererFairyMethods");
var attachLevelRendererAssistSpiritSkillMethods = require("./LevelRendererAssistSpiritSkillMethods");

var loadSpriteFrame = RenderNodeHelpers.loadSpriteFrame;
var createSolidWhiteSpriteFrame = RenderNodeHelpers.createSolidWhiteSpriteFrame;
var ensureSprite = RenderNodeHelpers.ensureSprite;
var ensureLabel = RenderNodeHelpers.ensureLabel;
var ensureOutline = RenderNodeHelpers.ensureOutline;
var clearChildren = RenderNodeHelpers.clearChildren;
var getOrCreateChild = RenderNodeHelpers.getOrCreateChild;

var BALL_RESOURCES = {
  R: "game/image/ball/red_ball",
  G: "game/image/ball/green_ball",
  B: "game/image/ball/blue_ball",
  Y: "game/image/ball/yellow_ball",
  P: "game/image/ball/purple_ball",
  K: "game/image/ball/black_ball",
  O: "game/image/ball/orange_ball",
  W: "game/image/ball/white_ball",
  RAINBOW: "game/image/ball/rainbow_ball",
  BLAST: "game/image/ball/bomb_ball",
  STONE: "game/image/ball/stone_ball",
  ICE: "game/image/ball/ice_ball",
  MOLOTOV: "game/image/props/fire_box",
  KEY: "game/image/props/key",
  LOCKED: "ui/image/commone/lock",
  SPLIT_R: "game/image/ball/split_red_ball",
  SPLIT_G: "game/image/ball/split_green_ball",
  SPLIT_B: "game/image/ball/split_blue_ball",
  SPLIT_Y: "game/image/ball/split_yellow_ball",
  SPLIT_P: "game/image/ball/split_purple_ball",
  BREEDER: "game/image/ball/breeder_ball",
  BLACK_HOLE: "game/image/ball/black_hole",
  SPIRIT_COCOON: "game/image/ball/cocoon_1",
  COCOON_1: "game/image/ball/cocoon_1",
  COCOON_2: "game/image/ball/cocoon_2",
  COCOON_3: "game/image/ball/cocoon_3",
  COCOON_4: "game/image/ball/cocoon_4",
  COCOON_5: "game/image/ball/cocoon_5",
  MIST_SPRITE: "game/image/ball/mist_sprite",
  GLUTTONY_SPRITE: "game/image/ball/gluttony_sprite",
  RAINBOW_SPRITE: "game/image/ball/rainbow_sprite",
  SPIRIT_MIST: "game/image/ball/sandstorm",
  TRANSPARENT_BALL: "game/image/ball/transparent_ball",
  SWIRL: "game/image/ball/swirl_ball",
  WORMHOLE: "game/image/ball/wormhole",
  VINE_SPIRIT: "game/image/ball/vine_spirit",
  VINES: "game/image/ball/vines",
  POISON_OVERLAY: "game/image/ball/poison_overlay",
  POISON_DROPLET: "game/image/ball/poison_droplet",
  ICE_SNOWBALL: "game/image/ball/ice_ball",
  BLOCKADE_LINE: "game/image/ball/blockade_line",
  LIGHT: "game/image/ball/light_ball",
  SNOW_REMOVAL_TOOLS: "game/image/ball/snow_removal_tools"
};
var TIME_BONUS_FONT_RESOURCE = "game/fnt/num_b";
var TRAPPED_SPIRIT_PATH_PREFIX = "game/trapped_spirit/";
var RESCUE_SUCCESSFUL_SPIRIT_PATH_PREFIX = "image/rescue_successful/";
var TRAPPED_SPRITE_LAYER_Z_INDEX = 49;

function buildTrappedSpriteResourcePath(spiritId) {
  AssistSpiritConfig.getSpirit(spiritId);
  return TRAPPED_SPIRIT_PATH_PREFIX + spiritId;
}

function buildRescueSuccessfulSpiritResourcePath(spiritId) {
  AssistSpiritConfig.getSpirit(spiritId);
  return RESCUE_SUCCESSFUL_SPIRIT_PATH_PREFIX + spiritId;
}

function buildSpiritFragmentRewardResourcePath(spiritId) {
  AssistSpiritConfig.getSpirit(spiritId);
  return "ui/image/props/" + spiritId + "_fragments";
}

var BOARD_OCCLUSION_RESOURCES = {
  cloud: "game/image/props/cloud",
  leaves: "game/image/props/leaves"
};
var BOARD_OCCLUSION_CLOCK_RESOURCE = "game/image/props/clock";

var WORMHOLE_DIRECTION_ARROW_RESOURCE = "game/image/ball/arrow";
var WORMHOLE_RENDER_SIZE = new cc.Size(80, 80);
var WORMHOLE_DIRECTION_ARROW_SIZE = new cc.Size(42, 42);
var WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE = 18;
var WORMHOLE_DIRECTION_ARROW_STAGGER = 0.12;
var WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION = 0.2;
var WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION = 0.24;
var WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE = 0.28;

var JAR_RESOURCES = {
  R: "game/image/jar/red_jar",
  G: "game/image/jar/green_jar",
  B: "game/image/jar/blue_jar",
  Y: "game/image/jar/yellow_jar",
  P: "game/image/jar/purple_jar"
};

var JAR_MASK_RESOURCES = {
  R: "game/image/jar/red_jar_mask",
  G: "game/image/jar/green_jar_mask",
  B: "game/image/jar/blue_jar_mask",
  Y: "game/image/jar/yellow_jar_mask",
  P: "game/image/jar/purple_jar_mask"
};

var JAR_SCORE_RESOURCE_COLOR_NAMES = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple"
};

var JAR_SCORE_RESOURCE_VALUES = {
  40: true,
  60: true,
  80: true,
  90: true,
  120: true
};

function resolveJarScoreSpritePath(colorCode, baseScore) {
  var colorName = JAR_SCORE_RESOURCE_COLOR_NAMES[colorCode];
  if (!colorName) {
    throw new Error("Unsupported jar score color: " + colorCode);
  }
  if (!Number.isInteger(baseScore) || !JAR_SCORE_RESOURCE_VALUES[baseScore]) {
    throw new Error("Unsupported jar base score sprite value: " + baseScore);
  }
  return "game/image/jar/" + colorName + "_" + baseScore;
}

var REWARD_ITEM_RESOURCES = {
  coin: "ui/image/props/coin",
  stamina: "ui/image/props/love"
};

var LOSE_STATUS_RESOURCES = {
  complete: "ui/image/lose/complete",
  incomplete: "ui/image/lose/un_complete"
};

var POWERUP_ICON_RESOURCES = {
  rainbow: "ui/image/props/rainbow_ball",
  swap: "ui/image/props/change_ball",
  blast: "ui/image/props/blast_ball",
  barrier_hammer: "ui/image/props/barrier_hammer",
  precise_aim: "ui/image/props/aim",
  snow_removal: "ui/image/props/snow_removal",
  three_line_elimination: "ui/image/props/three_line_elimination",
  plus_three_balls: "ui/image/props/plus_ball"
};

var FAIRY_ANIMATION_BUNDLE_NAME = "animation";
var EXPLODE_ANIMATION_CLIP_PATH = "explode";
var FIREWORKS_PREFAB_PATH = "prefabs/fireworks";
var BOARD_CLEAR_FIREWORKS_BURST_COUNT = 1;
var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = 1.1;

var HUD_STAR_RESOURCES = {
  lit: "game/image/ball/img101",
  unlit: "game/image/ball/img106"
};
var TOP_SLOT_STAR_RESOURCE = "game/top_star";
var GAME_RESOURCE_PATH_PREFIX = "game/";

var PREFAB_PATHS = {
  gameView: "game/prefabs/ui/GameView",
  hudPanel: "prefabs/ui/HudPanel",
  winView: "prefabs/ui/WinView",
  rescueSuccessfulView: "prefabs/ui/RescueSuccessfulView",
  loseView: "prefabs/ui/LoseView",
  addBallTipsView: "prefabs/ui/AddBallTipsView",
  pauseView: "prefabs/ui/PauseView",
  propDescriptionView: "prefabs/ui/PropDescriptionView",
  bubbleItem: "game/prefabs/game/BubbleItem",
  fireBubbleItem: "game/prefabs/game/FireBubbleItem",
  splitBubbleItem: "game/prefabs/game/SplitBubbleItem",
  lockingBubbleItem: "game/prefabs/game/LockingBubbleItem",
  keyBubbleItem: "game/prefabs/game/KeyBubbleItem",
  jarItem: "game/prefabs/game/JarItem",
  shooterPanel: "game/prefabs/game/ShooterPanel",
  propsBtn: "game/prefabs/game/PropsBtn",
  previewBall: "game/prefabs/game/PreviewBall"
};

var JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var GUIDE_DOT_SPACING = 42;
var GUIDE_DOT_RADIUS = 8;
var GUIDE_DOT_SIZE = GUIDE_DOT_RADIUS * 2;
var GUIDE_DOT_FAR_SCALE = 0.5;
var GUIDE_DOT_MAX_COUNT = 64;
var GUIDE_DOT_MIN_SCALE = 0.5;
var GUIDE_DOT_MAX_SCALE = 1;
var GUIDE_DOT_SPRITE_PATH = "game/image/ball/white_point";
var GUIDE_DOT_TINTS = {
  R: { r: 255, g: 80, b: 80 },
  G: { r: 78, g: 214, b: 100 },
  B: { r: 72, g: 150, b: 255 },
  Y: { r: 255, g: 211, b: 62 },
  P: { r: 184, g: 96, b: 255 },
  K: { r: 48, g: 48, b: 48 },
  O: { r: 255, g: 145, b: 45 },
  W: { r: 245, g: 245, b: 245 }
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
var BOARD_BUBBLE_SIZE = new cc.Size(BoardLayout.bubbleDiameter, BoardLayout.bubbleDiameter);
// vine_spirit.png and vines.png share a 140x172 raw canvas; render at exact half scale.
var VINE_VISUAL_SIZE = new cc.Size(70, 86);
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

var buildAdRevivePlan = AdRevivePolicy.buildRevivePlan;
var buildAdReviveDescription = AdRevivePolicy.buildReviveDescription;
var resolveLoseRewardEntry = AdRewardCatalog.resolveLoseRewardEntry;
var LEVEL_RENDERER_RESOURCE_CONTEXT = {
  AdRevivePolicy: AdRevivePolicy,
  AdRewardCatalog: AdRewardCatalog,
  AssistSpiritConfig: AssistSpiritConfig,
  AssistSpiritPresentationConfig: AssistSpiritPresentationConfig,
  AssistSpiritSkillConfig: AssistSpiritSkillConfig,
  BALL_RESOURCES: BALL_RESOURCES,
  BARRIER_HAMMER_HINT_LIFT_DURATION: BARRIER_HAMMER_HINT_LIFT_DURATION,
  BARRIER_HAMMER_HINT_OFFSET_X: BARRIER_HAMMER_HINT_OFFSET_X,
  BARRIER_HAMMER_HINT_OFFSET_Y: BARRIER_HAMMER_HINT_OFFSET_Y,
  BARRIER_HAMMER_HINT_PAUSE_DURATION: BARRIER_HAMMER_HINT_PAUSE_DURATION,
  BARRIER_HAMMER_HINT_SIZE: BARRIER_HAMMER_HINT_SIZE,
  BARRIER_HAMMER_HINT_STRIKE_DURATION: BARRIER_HAMMER_HINT_STRIKE_DURATION,
  BARRIER_HAMMER_HINT_TAP_OFFSET_X: BARRIER_HAMMER_HINT_TAP_OFFSET_X,
  BARRIER_HAMMER_HINT_TAP_OFFSET_Y: BARRIER_HAMMER_HINT_TAP_OFFSET_Y,
  BOARD_BUBBLE_SIZE: BOARD_BUBBLE_SIZE,
  BOARD_CLEAR_FIREWORKS_BURST_COUNT: BOARD_CLEAR_FIREWORKS_BURST_COUNT,
  BOARD_CLEAR_FIREWORKS_INTERVAL_SEC: BOARD_CLEAR_FIREWORKS_INTERVAL_SEC,
  BOARD_OCCLUSION_CLOCK_RESOURCE: BOARD_OCCLUSION_CLOCK_RESOURCE,
  BOARD_OCCLUSION_RESOURCES: BOARD_OCCLUSION_RESOURCES,
  BoardLayout: BoardLayout,
  BubbleShatterRenderer: BubbleShatterRenderer,
  BundleLoader: BundleLoader,
  COMMENT_ANIMATION_HOLD_DURATION: COMMENT_ANIMATION_HOLD_DURATION,
  COMMENT_ANIMATION_IN_DURATION: COMMENT_ANIMATION_IN_DURATION,
  COMMENT_ANIMATION_NORMAL_SCALE: COMMENT_ANIMATION_NORMAL_SCALE,
  COMMENT_ANIMATION_OUT_DURATION: COMMENT_ANIMATION_OUT_DURATION,
  COMMENT_ANIMATION_OUT_SCALE: COMMENT_ANIMATION_OUT_SCALE,
  COMMENT_ANIMATION_PUNCH_SCALE: COMMENT_ANIMATION_PUNCH_SCALE,
  COMMENT_ANIMATION_RESOURCES: COMMENT_ANIMATION_RESOURCES,
  COMMENT_ANIMATION_SETTLE_DURATION: COMMENT_ANIMATION_SETTLE_DURATION,
  COMMENT_ANIMATION_START_SCALE: COMMENT_ANIMATION_START_SCALE,
  COMMENT_ANIMATION_TIERS: COMMENT_ANIMATION_TIERS,
  DebugFlags: DebugFlags,
  EXPLODE_ANIMATION_CLIP_PATH: EXPLODE_ANIMATION_CLIP_PATH,
  FAIRY_ANIMATION_BUNDLE_NAME: FAIRY_ANIMATION_BUNDLE_NAME,
  FIREWORKS_PREFAB_PATH: FIREWORKS_PREFAB_PATH,
  FairyAssistConfig: FairyAssistConfig,
  GAME_RESOURCE_PATH_PREFIX: GAME_RESOURCE_PATH_PREFIX,
  GUIDE_DOT_FAR_SCALE: GUIDE_DOT_FAR_SCALE,
  GUIDE_DOT_MAX_COUNT: GUIDE_DOT_MAX_COUNT,
  GUIDE_DOT_MAX_SCALE: GUIDE_DOT_MAX_SCALE,
  GUIDE_DOT_MIN_SCALE: GUIDE_DOT_MIN_SCALE,
  GUIDE_DOT_RADIUS: GUIDE_DOT_RADIUS,
  GUIDE_DOT_SIZE: GUIDE_DOT_SIZE,
  GUIDE_DOT_SPACING: GUIDE_DOT_SPACING,
  GUIDE_DOT_SPRITE_PATH: GUIDE_DOT_SPRITE_PATH,
  GUIDE_DOT_TINTS: GUIDE_DOT_TINTS,
  HUD_STAR_RESOURCES: HUD_STAR_RESOURCES,
  ICE_COLLECT_BEZIER_ARC: ICE_COLLECT_BEZIER_ARC,
  ICE_COLLECT_FLY_DURATION: ICE_COLLECT_FLY_DURATION,
  ICE_COLLECT_FLY_EASE_RATE: ICE_COLLECT_FLY_EASE_RATE,
  ICE_COLLECT_FLY_TWEEN_EASING: ICE_COLLECT_FLY_TWEEN_EASING,
  ICE_COLLECT_FLY_Z_INDEX: ICE_COLLECT_FLY_Z_INDEX,
  ICE_OVERLAY_OPACITY: ICE_OVERLAY_OPACITY,
  ICE_THAW_SHAKE_OFFSET: ICE_THAW_SHAKE_OFFSET,
  ICE_THAW_SHAKE_STEP_DURATION: ICE_THAW_SHAKE_STEP_DURATION,
  IMPACT_BOUNCE_TIMING: IMPACT_BOUNCE_TIMING,
  IMPACT_DEFAULT_PUSH_DISTANCE: IMPACT_DEFAULT_PUSH_DISTANCE,
  IMPACT_MIN_PUSH_DURATION: IMPACT_MIN_PUSH_DURATION,
  IMPACT_MIN_RETURN_DURATION: IMPACT_MIN_RETURN_DURATION,
  IMPACT_RETURN_DURATION_RATIO: IMPACT_RETURN_DURATION_RATIO,
  JAR_MASK_RESOURCES: JAR_MASK_RESOURCES,
  JAR_RENDER_SIZE: JAR_RENDER_SIZE,
  JAR_RENDER_Y_OFFSET: JAR_RENDER_Y_OFFSET,
  JAR_RESOURCES: JAR_RESOURCES,
  JAR_SCORE_RESOURCE_COLOR_NAMES: JAR_SCORE_RESOURCE_COLOR_NAMES,
  JAR_SCORE_RESOURCE_VALUES: JAR_SCORE_RESOURCE_VALUES,
  JarScoreConfig: JarScoreConfig,
  LOSE_COIN_REVIVE_COST: LOSE_COIN_REVIVE_COST,
  LOSE_STATUS_RESOURCES: LOSE_STATUS_RESOURCES,
  LightningChainRenderer: LightningChainRenderer,
  Logger: Logger,
  NEXT_SHOT_BUBBLE_SIZE: NEXT_SHOT_BUBBLE_SIZE,
  POPUP_CONTENT_CONTAINER_NAME: POPUP_CONTENT_CONTAINER_NAME,
  POPUP_OPEN_ANIM_DURATION: POPUP_OPEN_ANIM_DURATION,
  POPUP_OPEN_ANIM_FROM_SCALE: POPUP_OPEN_ANIM_FROM_SCALE,
  POWERUP_ICON_RESOURCES: POWERUP_ICON_RESOURCES,
  PREFAB_PATHS: PREFAB_PATHS,
  PrefabFactory: PrefabFactory,
  PropDescriptionConfig: PropDescriptionConfig,
  PropDescriptionViewController: PropDescriptionViewController,
  RESCUE_SUCCESSFUL_SPIRIT_PATH_PREFIX: RESCUE_SUCCESSFUL_SPIRIT_PATH_PREFIX,
  REWARD_ITEM_RESOURCES: REWARD_ITEM_RESOURCES,
  ROUTE_EDITOR_COLORS: ROUTE_EDITOR_COLORS,
  ROUTE_LINE_WIDTH_ACTIVE: ROUTE_LINE_WIDTH_ACTIVE,
  ROUTE_LINE_WIDTH_IDLE: ROUTE_LINE_WIDTH_IDLE,
  ROUTE_POINT_RADIUS_ACTIVE: ROUTE_POINT_RADIUS_ACTIVE,
  ROUTE_POINT_RADIUS_IDLE: ROUTE_POINT_RADIUS_IDLE,
  RUNTIME_REFRESH_SCOPE: RUNTIME_REFRESH_SCOPE,
  RenderNodeHelpers: RenderNodeHelpers,
  SHOOTER_MAX_ROTATION: SHOOTER_MAX_ROTATION,
  SHOT_NO_DROP_SHAKE_OFFSET: SHOT_NO_DROP_SHAKE_OFFSET,
  SHOT_NO_DROP_SHAKE_STEP_DURATION: SHOT_NO_DROP_SHAKE_STEP_DURATION,
  SPLITTER_SPAWN_BEZIER_ARC: SPLITTER_SPAWN_BEZIER_ARC,
  SPLITTER_SPAWN_FLY_DURATION: SPLITTER_SPAWN_FLY_DURATION,
  SpecialAnimationTiming: SpecialAnimationTiming,
  SpriteProxyLayerHelper: SpriteProxyLayerHelper,
  StarRatingPolicy: StarRatingPolicy,
  TEST_SLOT_RADIUS: TEST_SLOT_RADIUS,
  TIME_BONUS_FONT_RESOURCE: TIME_BONUS_FONT_RESOURCE,
  TOP_SLOT_STAR_RESOURCE: TOP_SLOT_STAR_RESOURCE,
  TRAPPED_SPIRIT_PATH_PREFIX: TRAPPED_SPIRIT_PATH_PREFIX,
  TRAPPED_SPRITE_LAYER_Z_INDEX: TRAPPED_SPRITE_LAYER_Z_INDEX,
  VINE_VISUAL_SIZE: VINE_VISUAL_SIZE,
  WIN_POPUP_OPEN_ANIM_DURATION: WIN_POPUP_OPEN_ANIM_DURATION,
  WIN_POPUP_OPEN_ANIM_FROM_SCALE: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
  WIN_STAR_ANIM_STAGGER: WIN_STAR_ANIM_STAGGER,
  WIN_STAR_ANIM_START_DELAY: WIN_STAR_ANIM_START_DELAY,
  WIN_STAR_PUNCH_DOWN_SCALE: WIN_STAR_PUNCH_DOWN_SCALE,
  WIN_STAR_PUNCH_FROM_SCALE: WIN_STAR_PUNCH_FROM_SCALE,
  WIN_STAR_RECOVER_DURATION: WIN_STAR_RECOVER_DURATION,
  WIN_STAR_SHRINK_DURATION: WIN_STAR_SHRINK_DURATION,
  WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE: WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE,
  WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION,
  WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION,
  WORMHOLE_DIRECTION_ARROW_RESOURCE: WORMHOLE_DIRECTION_ARROW_RESOURCE,
  WORMHOLE_DIRECTION_ARROW_SIZE: WORMHOLE_DIRECTION_ARROW_SIZE,
  WORMHOLE_DIRECTION_ARROW_STAGGER: WORMHOLE_DIRECTION_ARROW_STAGGER,
  WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE: WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE,
  WORMHOLE_RENDER_SIZE: WORMHOLE_RENDER_SIZE,
  WormholeShaderRenderer: WormholeShaderRenderer,
  assertValidRefreshScope: assertValidRefreshScope,
  attachLevelRendererAssistSpiritSkillMethods: attachLevelRendererAssistSpiritSkillMethods,
  attachLevelRendererFairyMethods: attachLevelRendererFairyMethods,
  attachLevelRendererSceneMethods: attachLevelRendererSceneMethods,
  buildAdReviveDescription: buildAdReviveDescription,
  buildAdRevivePlan: buildAdRevivePlan,
  buildRescueSuccessfulSpiritResourcePath: buildRescueSuccessfulSpiritResourcePath,
  buildSpiritFragmentRewardResourcePath: buildSpiritFragmentRewardResourcePath,
  buildTrappedSpriteResourcePath: buildTrappedSpriteResourcePath,
  clearChildren: clearChildren,
  createSolidWhiteSpriteFrame: createSolidWhiteSpriteFrame,
  ensureLabel: ensureLabel,
  ensureOutline: ensureOutline,
  ensureSprite: ensureSprite,
  getOrCreateChild: getOrCreateChild,
  loadSpriteFrame: loadSpriteFrame,
  requireImpactBounceTiming: requireImpactBounceTiming,
  resolveJarScoreSpritePath: resolveJarScoreSpritePath,
  resolveLoseRewardEntry: resolveLoseRewardEntry,
  resolveRefreshScope: resolveRefreshScope
};

module.exports = LEVEL_RENDERER_RESOURCE_CONTEXT;
