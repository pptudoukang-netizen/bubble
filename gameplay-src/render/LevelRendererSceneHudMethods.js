"use strict";

var attachLevelRendererSceneHudCoreMethods = require("./LevelRendererSceneHudCoreMethods");
var attachLevelRendererSceneFloatingScoreMethods = require("./LevelRendererSceneFloatingScoreMethods");
var attachLevelRendererSceneJarScoreHudMethods = require("./LevelRendererSceneJarScoreHudMethods");
var attachLevelRendererSceneBottomPanelMethods = require("./LevelRendererSceneBottomPanelMethods");
var attachLevelRendererScenePowerupFeedbackMethods = require("./LevelRendererScenePowerupFeedbackMethods");
var attachLevelRendererSceneObjectiveHudMethods = require("./LevelRendererSceneObjectiveHudMethods");
var attachLevelRendererSceneStarHudMethods = require("./LevelRendererSceneStarHudMethods");

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneHudMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var requireChildNode = SceneShared.requireChildNode;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var POWERUP_ICON_RESOURCES = deps.POWERUP_ICON_RESOURCES;
  var HUD_STAR_RESOURCES = deps.HUD_STAR_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JarScoreConfig = deps.JarScoreConfig;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var buildTrappedSpriteResourcePath = deps.buildTrappedSpriteResourcePath;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildHudTargetDisplayData = deps.buildHudTargetDisplayData;
  var applyIceSnowballHudDisplayProgress = deps.applyIceSnowballHudDisplayProgress;
  var hasIceSnowballCollectionObjective = deps.hasIceSnowballCollectionObjective;
  var buildStateText = deps.buildStateText;
  var buildHudRenderKey = deps.buildHudRenderKey;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var clamp = deps.clamp;
  var HUD_STAR_MARKER_FALLBACK_RATIOS = [0.3 / 0.85, 0.6 / 0.85, 1];
  var HUD_STAR_PARTICLE_NODE_NAME = "starParticle";
  var HUD_STAR_PARTICLE_DURATION = 0.7;
  var HUD_STAR_PARTICLE_HOLD_DURATION = 0.5;
  var HUD_STAR_PUNCH_SCALE = 1.35;
  var HUD_STAR_PUNCH_UP_DURATION = 0.12;
  var HUD_STAR_PUNCH_DOWN_DURATION = 0.14;
  var BOTTOM_PANEL_POWERUP_SLOTS = [
    { nodeName: "plus_ball_btn", iconKey: "plus_three_balls" },
    { nodeName: "eliminate_three_line_btn", iconKey: "three_line_elimination" },
    { nodeName: "precise_aim_btn", iconKey: "precise_aim" },
    { nodeName: "rainbow_btn", iconKey: "rainbow" },
    { nodeName: "change_btn", iconKey: "swap" },
    { nodeName: "destroy_btn", iconKey: "barrier_hammer" },
    { nodeName: "snow_removal_btn", iconKey: "snow_removal" },
    { nodeName: "bomb_btn", iconKey: "blast" }
  ];
  var POWERUP_LOAD_ANIMATION_CONFIG = {
    rainbow: {
      buttonNodeName: "rainbow_btn",
      spriteCode: "RAINBOW"
    },
    blast: {
      buttonNodeName: "bomb_btn",
      spriteCode: "BLAST"
    }
  };
  var SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING = 16;
  var SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON = 0.5;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE = 1.24;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE = 0.96;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE = 1.13;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE = 1.34;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE = 0.92;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE = 1.16;
  var SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION = 0.11;
  var SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION = 0.08;
  var SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION = 0.1;
  var SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION = 0.12;
  var SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION = 0.08;
  var HUD_SPIRIT_ICON_HEIGHT = 37.9;

  function resolveBottomPanelBoardTargets(runtimeSnapshot) {
    if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object") {
      throw new Error("Bottom panel requires board snapshot.");
    }
    if (!Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("Bottom panel requires board cells.");
    }

    var hasIce = false;
    var hasStone = false;
    runtimeSnapshot.board.cells.forEach(function (cell, index) {
      if (!cell || typeof cell !== "object") {
        throw new Error("Bottom panel board.cells[" + index + "] must be an object.");
      }
      if (cell.entityCategory === "obstacle_ball" && cell.entityType === "ice") {
        hasIce = true;
      }
      if (cell.entityCategory === "obstacle_ball" && cell.entityType === "stone") {
        hasStone = true;
      }
    });

    if (
      !runtimeSnapshot.systems ||
      !runtimeSnapshot.systems.boardOcclusionSystem ||
      !Array.isArray(runtimeSnapshot.systems.boardOcclusionSystem.activeZones)
    ) {
      throw new Error("Bottom panel requires board occlusion snapshot.");
    }
    return {
      hasIce: hasIce,
      hasStone: hasStone,
      hasBoardOcclusion: runtimeSnapshot.systems.boardOcclusionSystem.activeZones.length > 0
    };
  }

var COMBO_BATTER_POP_DURATION = 0.15;
var COMBO_BATTER_SETTLE_DURATION = 0.1;
var COMBO_BATTER_HOLD_DURATION = 0.85;
var COMBO_BATTER_FADE_DURATION = 0.25;
var COMBO_BATTER_POP_SCALE = 1.2;
var COMBO_BATTER_OFFSET_Y = -30;

var JAR_FRACTION_MOUTH_OFFSET_RATIO = 0.24;
var JAR_FRACTION_START_Y_OFFSET = 20;
var JAR_FRACTION_RISE_DURATION = 0.55;
var JAR_FRACTION_FADE_DURATION = 0.25;
var JAR_FRACTION_RISE_DISTANCE = 72;
var JAR_FRACTION_END_SCALE = 2;
var JAR_FRACTION_START_SCALE = 0.6;

var BALL_SCORE_FADE_IN_DURATION = 0.2;
var BALL_SCORE_HOLD_DURATION = 0.5;
var BALL_SCORE_FADE_OUT_RISE_DURATION = 0.2;
var BALL_SCORE_RISE_DISTANCE = 20;
var MATCHED_TARGET_COLLECT_FLY_DURATION = 0.46;
var MATCHED_TARGET_COLLECT_BEZIER_ARC = 90;
var MATCHED_TARGET_COLLECT_PARTICLE_SIZE = 34;
var MATCHED_TARGET_COLLECT_Z_INDEX = 1250;
var MATCHED_TARGET_COLLECT_PUNCH_SCALE = 1.16;
var MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION = 0.08;
var MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION = 0.1;
  var BALL_SCORE_Z_INDEX = 1200;
  var SCHEDULE_ONCE_REPEAT = 0;
  var SNOW_REMOVAL_FX_SIZE = 96;
  var SNOW_REMOVAL_FX_Z_INDEX = 1300;
  var SNOW_REMOVAL_FX_SWEEP_DISTANCE = 96;
  var SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION = 0.28;
  var SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION = 0.48;
  var SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION = 0.28;
  var POWERUP_LOAD_FX_Z_INDEX = 1340;
  var POWERUP_LOAD_FLY_DURATION = 0.34;
  var POWERUP_LOAD_BEZIER_ARC = 110;
  var POWERUP_LOAD_START_SCALE = 0.62;
  var POWERUP_LOAD_END_SCALE = 1.05;

function requireDirectorScheduler(description) {
  if (!cc || !cc.director || typeof cc.director.getScheduler !== "function") {
    throw new Error(description + " requires cc.director.getScheduler.");
  }
  var scheduler = cc.director.getScheduler();
  if (!scheduler || typeof scheduler.schedule !== "function" || typeof scheduler.unschedule !== "function") {
    throw new Error(description + " requires director scheduler APIs.");
  }
  return scheduler;
}

var HUD_METHOD_CONTEXT = {
    BALL_RESOURCES: BALL_RESOURCES,
    BALL_SCORE_FADE_IN_DURATION: BALL_SCORE_FADE_IN_DURATION,
    BALL_SCORE_FADE_OUT_RISE_DURATION: BALL_SCORE_FADE_OUT_RISE_DURATION,
    BALL_SCORE_HOLD_DURATION: BALL_SCORE_HOLD_DURATION,
    BALL_SCORE_RISE_DISTANCE: BALL_SCORE_RISE_DISTANCE,
    BALL_SCORE_Z_INDEX: BALL_SCORE_Z_INDEX,
    BOARD_BUBBLE_SIZE: BOARD_BUBBLE_SIZE,
    BOTTOM_PANEL_POWERUP_SLOTS: BOTTOM_PANEL_POWERUP_SLOTS,
    BoardLayout: BoardLayout,
    COMBO_BATTER_FADE_DURATION: COMBO_BATTER_FADE_DURATION,
    COMBO_BATTER_HOLD_DURATION: COMBO_BATTER_HOLD_DURATION,
    COMBO_BATTER_OFFSET_Y: COMBO_BATTER_OFFSET_Y,
    COMBO_BATTER_POP_DURATION: COMBO_BATTER_POP_DURATION,
    COMBO_BATTER_POP_SCALE: COMBO_BATTER_POP_SCALE,
    COMBO_BATTER_SETTLE_DURATION: COMBO_BATTER_SETTLE_DURATION,
    HUD_SPIRIT_ICON_HEIGHT: HUD_SPIRIT_ICON_HEIGHT,
    HUD_STAR_MARKER_FALLBACK_RATIOS: HUD_STAR_MARKER_FALLBACK_RATIOS,
    HUD_STAR_PARTICLE_DURATION: HUD_STAR_PARTICLE_DURATION,
    HUD_STAR_PARTICLE_HOLD_DURATION: HUD_STAR_PARTICLE_HOLD_DURATION,
    HUD_STAR_PARTICLE_NODE_NAME: HUD_STAR_PARTICLE_NODE_NAME,
    HUD_STAR_PUNCH_DOWN_DURATION: HUD_STAR_PUNCH_DOWN_DURATION,
    HUD_STAR_PUNCH_SCALE: HUD_STAR_PUNCH_SCALE,
    HUD_STAR_PUNCH_UP_DURATION: HUD_STAR_PUNCH_UP_DURATION,
    HUD_STAR_RESOURCES: HUD_STAR_RESOURCES,
    JAR_FRACTION_END_SCALE: JAR_FRACTION_END_SCALE,
    JAR_FRACTION_FADE_DURATION: JAR_FRACTION_FADE_DURATION,
    JAR_FRACTION_MOUTH_OFFSET_RATIO: JAR_FRACTION_MOUTH_OFFSET_RATIO,
    JAR_FRACTION_RISE_DISTANCE: JAR_FRACTION_RISE_DISTANCE,
    JAR_FRACTION_RISE_DURATION: JAR_FRACTION_RISE_DURATION,
    JAR_FRACTION_START_SCALE: JAR_FRACTION_START_SCALE,
    JAR_FRACTION_START_Y_OFFSET: JAR_FRACTION_START_Y_OFFSET,
    Logger: Logger,
    MATCHED_TARGET_COLLECT_BEZIER_ARC: MATCHED_TARGET_COLLECT_BEZIER_ARC,
    MATCHED_TARGET_COLLECT_FLY_DURATION: MATCHED_TARGET_COLLECT_FLY_DURATION,
    MATCHED_TARGET_COLLECT_PARTICLE_SIZE: MATCHED_TARGET_COLLECT_PARTICLE_SIZE,
    MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION: MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION,
    MATCHED_TARGET_COLLECT_PUNCH_SCALE: MATCHED_TARGET_COLLECT_PUNCH_SCALE,
    MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION: MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION,
    MATCHED_TARGET_COLLECT_Z_INDEX: MATCHED_TARGET_COLLECT_Z_INDEX,
    POWERUP_ICON_RESOURCES: POWERUP_ICON_RESOURCES,
    POWERUP_LOAD_ANIMATION_CONFIG: POWERUP_LOAD_ANIMATION_CONFIG,
    POWERUP_LOAD_BEZIER_ARC: POWERUP_LOAD_BEZIER_ARC,
    POWERUP_LOAD_END_SCALE: POWERUP_LOAD_END_SCALE,
    POWERUP_LOAD_FLY_DURATION: POWERUP_LOAD_FLY_DURATION,
    POWERUP_LOAD_FX_Z_INDEX: POWERUP_LOAD_FX_Z_INDEX,
    POWERUP_LOAD_START_SCALE: POWERUP_LOAD_START_SCALE,
    PREFAB_PATHS: PREFAB_PATHS,
    SCHEDULE_ONCE_REPEAT: SCHEDULE_ONCE_REPEAT,
    SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE: SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE,
    SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION: SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION,
    SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION: SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION,
    SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION: SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION,
    SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION: SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION,
    SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION: SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION,
    SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING: SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING,
    SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON: SKILL_POWERUP_COLLECT_FEEDBACK_VISIBILITY_EPSILON,
    SNOW_REMOVAL_FX_SIZE: SNOW_REMOVAL_FX_SIZE,
    SNOW_REMOVAL_FX_SWEEP_DISTANCE: SNOW_REMOVAL_FX_SWEEP_DISTANCE,
    SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION: SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION,
    SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION: SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION,
    SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION: SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION,
    SNOW_REMOVAL_FX_Z_INDEX: SNOW_REMOVAL_FX_Z_INDEX,
    applyIceSnowballHudDisplayProgress: applyIceSnowballHudDisplayProgress,
    attachLevelRendererSceneBottomPanelMethods: attachLevelRendererSceneBottomPanelMethods,
    attachLevelRendererSceneFloatingScoreMethods: attachLevelRendererSceneFloatingScoreMethods,
    attachLevelRendererSceneHudCoreMethods: attachLevelRendererSceneHudCoreMethods,
    attachLevelRendererSceneJarScoreHudMethods: attachLevelRendererSceneJarScoreHudMethods,
    attachLevelRendererSceneObjectiveHudMethods: attachLevelRendererSceneObjectiveHudMethods,
    attachLevelRendererScenePowerupFeedbackMethods: attachLevelRendererScenePowerupFeedbackMethods,
    attachLevelRendererSceneStarHudMethods: attachLevelRendererSceneStarHudMethods,
    buildHudRenderKey: buildHudRenderKey,
    buildHudTargetDisplayData: buildHudTargetDisplayData,
    buildTrappedSpriteResourcePath: buildTrappedSpriteResourcePath,
    clamp: clamp,
    ensureSprite: ensureSprite,
    getOrCreateChild: getOrCreateChild,
    requireChildNode: requireChildNode,
    requireDirectorScheduler: requireDirectorScheduler,
    resolveBottomPanelBoardTargets: resolveBottomPanelBoardTargets
  };
  attachLevelRendererSceneHudCoreMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererSceneFloatingScoreMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererSceneJarScoreHudMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererSceneBottomPanelMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererScenePowerupFeedbackMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererSceneObjectiveHudMethods(LevelRenderer, HUD_METHOD_CONTEXT);
  attachLevelRendererSceneStarHudMethods(LevelRenderer, HUD_METHOD_CONTEXT);

}

module.exports = attachLevelRendererSceneHudMethods;
