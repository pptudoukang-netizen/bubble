"use strict";

var attachLevelRendererSceneWinPopupMethods = require("./LevelRendererSceneWinPopupMethods");
var attachLevelRendererSceneModalPopupMethods = require("./LevelRendererSceneModalPopupMethods");
var attachLevelRendererSceneResultPopupMethods = require("./LevelRendererSceneResultPopupMethods");

var SceneShared = require("./LevelRendererSceneShared");
var LOSE_REVIVE_ICON_SIZE = 50;
var LOSE_CLEARANCE_TARGET_ICON_HEIGHT = 65;

function getSpriteFrameWidthAtHeight(spriteFrame, height, description) {
  if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error(description + " requires SpriteFrame.getOriginalSize.");
  }
  if (typeof height !== "number" || !isFinite(height) || height <= 0) {
    throw new Error(description + " height must be positive.");
  }
  var originalSize = spriteFrame.getOriginalSize();
  if (
    !originalSize ||
    typeof originalSize.width !== "number" ||
    !isFinite(originalSize.width) ||
    originalSize.width <= 0 ||
    typeof originalSize.height !== "number" ||
    !isFinite(originalSize.height) ||
    originalSize.height <= 0
  ) {
    throw new Error(description + " original size is invalid.");
  }
  return height * originalSize.width / originalSize.height;
}
function buildLoseRevivePresentation(levelConfig, revivePlan) {
  if (!levelConfig || !levelConfig.level || typeof levelConfig.level.playMode !== "string") {
    throw new Error("LoseView revive presentation requires level.playMode.");
  }
  if (!revivePlan || typeof revivePlan !== "object" || Array.isArray(revivePlan)) {
    throw new Error("LoseView revive presentation requires revive plan.");
  }
  var level = levelConfig.level;
  if (level.playMode === "timed_infinite_shots") {
    if (revivePlan.grantedShots !== 0 || !Number.isInteger(revivePlan.grantedTimeSeconds) || revivePlan.grantedTimeSeconds <= 0) {
      throw new Error("Timed LoseView revive presentation requires positive grantedTimeSeconds and zero grantedShots.");
    }
    return {
      description: "规定时间内通关",
      descriptionX: 0,
      showBall: false,
      iconType: null
    };
  }
  if (level.playMode !== "shot_limited") {
    throw new Error("LoseView revive presentation level.playMode is unsupported: " + level.playMode);
  }
  if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0 || revivePlan.grantedTimeSeconds !== 0) {
    throw new Error("Shot-limited LoseView revive presentation requires positive grantedShots and zero grantedTimeSeconds.");
  }
  return {
    description: "赠送" + revivePlan.grantedShots + "球",
    descriptionX: 32,
    showBall: true,
    iconType: "ball"
  };
}

function buildLoseClearanceTargetPresentation(levelConfig) {
  if (!levelConfig || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("LoseView clearance target presentation requires level config.");
  }
  var level = levelConfig.level;
  if (
    level.levelType !== "trapped_sprite_rescue" &&
    level.levelType !== "multi_trapped_spirit_rescue"
  ) {
    return null;
  }
  if (level.levelType === "multi_trapped_spirit_rescue") {
    if (
      !level.multiTrappedSpiritRescue ||
      !Array.isArray(level.multiTrappedSpiritRescue.targets) ||
      level.multiTrappedSpiritRescue.targets.length < 2
    ) {
      throw new Error("Multi trapped spirit rescue LoseView requires at least two targets.");
    }
    return {
      description: "救出全部精灵",
      spiritId: level.multiTrappedSpiritRescue.targets[0].spiritId
    };
  }
  if (!level.trappedSpriteRescue || typeof level.trappedSpriteRescue.spiritId !== "string" || !level.trappedSpriteRescue.spiritId) {
    throw new Error("Trapped sprite rescue LoseView clearance target requires level.trappedSpriteRescue.spiritId.");
  }
  return {
    description: "救出精灵",
    spiritId: level.trappedSpriteRescue.spiritId
  };
}

function attachLevelRendererScenePopupMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var setRequiredLabelString = SceneShared.setRequiredLabelString;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var LOSE_STATUS_RESOURCES = deps.LOSE_STATUS_RESOURCES;
  var REWARD_ITEM_RESOURCES = deps.REWARD_ITEM_RESOURCES;
  var buildTrappedSpriteResourcePath = deps.buildTrappedSpriteResourcePath;
  var buildRescueSuccessfulSpiritResourcePath = deps.buildRescueSuccessfulSpiritResourcePath;
  var buildSpiritFragmentRewardResourcePath = deps.buildSpiritFragmentRewardResourcePath;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var SpriteProxyLayerHelper = deps.SpriteProxyLayerHelper;
  var PropDescriptionViewController = deps.PropDescriptionViewController;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
  var WIN_VIEW_PROXY_ROOT_NAME = "win_view_auto_proxy_root";
  var RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME = "rescue_successful_view_auto_proxy_root";
  var RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC = 2;
  var LOSE_VIEW_PROXY_ROOT_NAME = "lose_view_auto_proxy_root";
  var ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME = "add_ball_tips_view_auto_proxy_root";
  var AIMING_TOOL_TIPS_PROXY_ROOT_NAME = "aiming_tool_tips_auto_proxy_root";
  var PAUSE_VIEW_PROXY_ROOT_NAME = "pause_view_auto_proxy_root";
  var POPUP_OPEN_ANIM_DURATION = deps.POPUP_OPEN_ANIM_DURATION;
  var POPUP_OPEN_ANIM_FROM_SCALE = deps.POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_POPUP_OPEN_ANIM_DURATION = deps.WIN_POPUP_OPEN_ANIM_DURATION;
  var WIN_POPUP_OPEN_ANIM_FROM_SCALE = deps.WIN_POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_STAR_ANIM_START_DELAY = deps.WIN_STAR_ANIM_START_DELAY;
  var WIN_STAR_ANIM_STAGGER = deps.WIN_STAR_ANIM_STAGGER;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildResultTexts = deps.buildResultTexts;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var buildAdRevivePlan = deps.buildAdRevivePlan;
  var resolveLoseRewardEntry = deps.resolveLoseRewardEntry;
  var LOSE_NO_REVIVE_ACTION_BUTTON_Y = -285;
  function ensureLoseOriginalY(node, description) {
    if (!node || !node.isValid) {
      throw new Error(description + " is required.");
    }
    if (typeof node.y !== "number") {
      throw new Error(description + " position Y is invalid.");
    }
    if (typeof node._loseOriginalY !== "number") {
      node._loseOriginalY = node.y;
    }
  }

  function applyLoseReviveLayout(loseContent, canRevive) {
    var backButtonNode = requireChildNode(loseContent, "btn_back", "LoseView");

    ensureLoseOriginalY(backButtonNode, "LoseView/btn_back");

    if (canRevive) {
      backButtonNode.setPosition(backButtonNode.x, backButtonNode._loseOriginalY);
      return;
    }

    backButtonNode.setPosition(backButtonNode.x, LOSE_NO_REVIVE_ACTION_BUTTON_Y);
  }

  function setNodeTreeActive(node, active) {
    if (!node || !node.isValid) {
      throw new Error("LoseView node tree target is required.");
    }
    node.active = active === true;
    if (!Array.isArray(node.children)) {
      throw new Error("LoseView node tree children must be an array: " + node.name);
    }
    node.children.forEach(function (childNode) {
      setNodeTreeActive(childNode, active);
    });
  }

  function renderLoseClearanceTarget(renderer, loseContent, levelConfig) {
    var statusLayoutNode = requireChildNode(loseContent, "taget", "LoseView");
    var targetBallNode = requireChildNode(statusLayoutNode, "ball", "LoseView/taget");
    var clearTargetNode = requireChildNode(statusLayoutNode, "clearn_target", "LoseView/taget");
    var targetBallSprite = targetBallNode.getComponent(cc.Sprite);
    var clearTargetLabel = clearTargetNode.getComponent(cc.Label);
    if (!targetBallSprite || !targetBallSprite.spriteFrame) {
      throw new Error("LoseView/taget/ball requires authored SpriteFrame.");
    }
    if (!clearTargetLabel || typeof clearTargetLabel.string !== "string") {
      throw new Error("LoseView/taget/clearn_target requires cc.Label.");
    }
    if (!targetBallNode.__loseClearTargetDefaultSpriteFrame) {
      targetBallNode.__loseClearTargetDefaultSpriteFrame = targetBallSprite.spriteFrame;
      targetBallNode.__loseClearTargetDefaultTrim = targetBallSprite.trim;
    }
    if (!targetBallNode.__loseClearTargetDefaultContentSize) {
      if (typeof targetBallNode.getContentSize !== "function") {
        throw new Error("LoseView/taget/ball requires getContentSize.");
      }
      var defaultContentSize = targetBallNode.getContentSize();
      if (!defaultContentSize || defaultContentSize.width <= 0 || defaultContentSize.height <= 0) {
        throw new Error("LoseView/taget/ball authored content size must be positive.");
      }
      targetBallNode.__loseClearTargetDefaultContentSize = {
        width: defaultContentSize.width,
        height: defaultContentSize.height
      };
    }
    if (typeof clearTargetNode.__loseClearTargetDefaultText !== "string") {
      clearTargetNode.__loseClearTargetDefaultText = clearTargetLabel.string;
    }

    var presentation = buildLoseClearanceTargetPresentation(levelConfig);
    if (!presentation) {
      var defaultSprite = ensureSprite(targetBallNode, targetBallNode.__loseClearTargetDefaultSpriteFrame);
      defaultSprite.trim = targetBallNode.__loseClearTargetDefaultTrim;
      targetBallNode.setContentSize(
        targetBallNode.__loseClearTargetDefaultContentSize.width,
        targetBallNode.__loseClearTargetDefaultContentSize.height
      );
      setRequiredLabelString(clearTargetNode, clearTargetNode.__loseClearTargetDefaultText, "LoseView/taget/clearn_target");
      return;
    }
    if (typeof buildTrappedSpriteResourcePath !== "function") {
      throw new Error("LoseView rescue clearance target requires a trapped sprite resource resolver.");
    }
    var spritePath = buildTrappedSpriteResourcePath(presentation.spiritId);
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView rescue clearance target sprite is not preloaded: " + spritePath);
    }
    var sprite = ensureSprite(targetBallNode, spriteFrame);
    sprite.trim = false;
    targetBallNode.setContentSize(
      getSpriteFrameWidthAtHeight(spriteFrame, LOSE_CLEARANCE_TARGET_ICON_HEIGHT, "LoseView rescue clearance target"),
      LOSE_CLEARANCE_TARGET_ICON_HEIGHT
    );
    setRequiredLabelString(clearTargetNode, presentation.description, "LoseView/taget/clearn_target");
  }

  function renderLoseFailureStatus(renderer, loseContent, levelConfig, runtimeSnapshot) {
    if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
      throw new Error("LoseView failure status requires runtime snapshot.");
    }
    if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.");
    }
    if (!Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.cells.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object" || Array.isArray(runtimeSnapshot.winStats)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.winStats.");
    }

    var starRating = Number(runtimeSnapshot.winStats.starRating);
    if (!Number.isInteger(starRating) || starRating < 0) {
      throw new Error("LoseView failure status requires non-negative integer winStats.starRating.");
    }

    var ballComplete = runtimeSnapshot.board.cells.length === 0;
    var starComplete = starRating >= 1;
    var failTips;
    if (runtimeSnapshot.state === "lost_hazard") {
      failTips = "地雷爆炸\n挑战失败";
    } else if (starComplete && !ballComplete) {
      failTips = "分数已达标\n但是还有球球未清空";
    } else if (ballComplete && !starComplete) {
      failTips = "球球已清空\n但是分数未达标";
    } else if (!ballComplete && !starComplete) {
      failTips = "分数未达标\n且球球也未清空";
    } else {
      throw new Error("LoseView failure status cannot be shown for a completed board and score.");
    }

    var failTipsNode = requireChildNode(loseContent, "fail_tips", "LoseView");
    var statusLayoutNode = requireChildNode(loseContent, "taget", "LoseView");
    var ballStatusNode = requireChildNode(statusLayoutNode, "ball_complete", "LoseView/taget");
    var starStatusNode = requireChildNode(statusLayoutNode, "star_complete", "LoseView/taget");
    var completeSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.complete];
    var incompleteSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.incomplete];
    if (!completeSpriteFrame) {
      throw new Error("LoseView complete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.complete);
    }
    if (!incompleteSpriteFrame) {
      throw new Error("LoseView incomplete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.incomplete);
    }

    setRequiredLabelString(failTipsNode, failTips, "LoseView/fail_tips");
    renderLoseClearanceTarget(renderer, loseContent, levelConfig);
    ensureSprite(ballStatusNode, ballComplete ? completeSpriteFrame : incompleteSpriteFrame);
    ensureSprite(starStatusNode, starComplete ? completeSpriteFrame : incompleteSpriteFrame);
  }

  function renderLoseReviveGain(renderer, loseContent, levelConfig, runtimeSnapshot, canRevive) {
    var getNode = requireChildNode(loseContent, "get", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(getNode, false);
      return;
    }
    setNodeTreeActive(getNode, true);
    if (typeof buildAdRevivePlan !== "function") {
      throw new Error("LoseView requires buildAdRevivePlan.");
    }
    var revivePlan = buildAdRevivePlan(levelConfig, runtimeSnapshot);
    var presentation = buildLoseRevivePresentation(levelConfig, revivePlan);
    var ballNode = requireChildNode(getNode, "handsel_ball", "LoseView/get");
    var desNode = requireChildNode(getNode, "handsel_des", "LoseView/get");
    if (typeof desNode.setPosition !== "function" || typeof desNode.y !== "number") {
      throw new Error("LoseView/get/handsel_des position is invalid.");
    }
    desNode.setPosition(presentation.descriptionX, desNode.y);
    setRequiredLabelString(desNode, presentation.description, "LoseView/get/handsel_des");
    ballNode.active = presentation.showBall;
    if (!presentation.showBall) {
      return;
    }

    var spritePath;
    if (presentation.iconType === "ball") {
      var iconCode = revivePlan.targetColor ? revivePlan.targetColor : "RAINBOW";
      spritePath = BALL_RESOURCES[iconCode];
    } else {
      throw new Error("LoseView revive gain requires a supported icon type.");
    }
    if (!spritePath) {
      throw new Error("LoseView revive gain icon resource path is required.");
    }
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView revive gain sprite is not preloaded: " + spritePath);
    }
    ensureSprite(ballNode, spriteFrame);
    ballNode.setContentSize(LOSE_REVIVE_ICON_SIZE, LOSE_REVIVE_ICON_SIZE);
  }

  function renderLoseCoinButton(renderer, loseContent, canRevive) {
    var coinButtonNode = requireChildNode(loseContent, "btn_coin", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(coinButtonNode, false);
      return;
    }
    setNodeTreeActive(coinButtonNode, true);
    if (!renderer.loseCoinPresentation || typeof renderer.loseCoinPresentation !== "object") {
      throw new Error("LoseView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.loseCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("LoseView coin revive cost must be a positive integer.");
    }
    if (typeof renderer.loseCoinPresentation.getCoinCount !== "function") {
      throw new Error("LoseView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.loseCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("LoseView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "label", "LoseView/btn_coin");
    var coinNode = requireChildNode(coinButtonNode, "coin", "LoseView/btn_coin");
    var numNode = requireChildNode(coinNode, "num", "LoseView/btn_coin/coin");
    setRequiredLabelString(labelNode, String(cost) + "复活", "LoseView/btn_coin/label");
    setRequiredLabelString(numNode, String(coinCount), "LoseView/btn_coin/coin/num");
    renderer._bindLoseButton(coinButtonNode, "coin");
  }

  function renderAddBallTipsCoinButton(renderer, panel) {
    var coinButtonNode = requireChildNode(panel, "coin_btn", "AddBallTipsView/Panel");
    if (!renderer.addBallTipsCoinPresentation || typeof renderer.addBallTipsCoinPresentation !== "object") {
      throw new Error("AddBallTipsView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.addBallTipsCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("AddBallTipsView coin cost must be a positive integer.");
    }
    if (typeof renderer.addBallTipsCoinPresentation.getCoinCount !== "function") {
      throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.addBallTipsCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("AddBallTipsView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "lab", "AddBallTipsView/Panel/coin_btn");
    setRequiredLabelString(labelNode, String(cost), "AddBallTipsView/Panel/coin_btn/lab");
    renderer._bindAddBallTipsButton(coinButtonNode, "coin");
  }


  function getRuntimeWinClearRewardItems(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView clear rewards require won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView clear rewards require runtimeSnapshot.winStats.");
    }
    if (!Array.isArray(runtimeSnapshot.winStats.clearRewardItems)) {
      throw new Error("WinView clear rewards require winStats.clearRewardItems.");
    }
    return runtimeSnapshot.winStats.clearRewardItems;
  }

  function resolveRewardItemSpritePath(rewardItem) {
    if (!rewardItem || typeof rewardItem !== "object") {
      throw new Error("WinView reward item is required.");
    }
    if (rewardItem.id === "spirit_fragment") {
      if (typeof buildSpiritFragmentRewardResourcePath !== "function") {
        throw new Error("WinView requires spirit fragment reward resource resolver.");
      }
      if (typeof rewardItem.spiritId !== "string" || rewardItem.spiritId.length === 0) {
        throw new Error("WinView spirit fragment reward requires spiritId.");
      }
      return buildSpiritFragmentRewardResourcePath(rewardItem.spiritId);
    }
    if (!REWARD_ITEM_RESOURCES || !REWARD_ITEM_RESOURCES[rewardItem.id]) {
      throw new Error("WinView unsupported reward item id: " + rewardItem.id);
    }
    return REWARD_ITEM_RESOURCES[rewardItem.id];
  }

  function requireWinChild(parentNode, childName, ownerName) {
    if (!parentNode || !parentNode.isValid) {
      throw new Error("WinView requires valid parent for " + childName + ".");
    }
    var childNode = parentNode.getChildByName(childName);
    if (!childNode || !childNode.isValid) {
      throw new Error("WinView " + ownerName + " requires child node: " + childName);
    }
    return childNode;
  }

function requireRuntimeWinStats(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView render key requires won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView render key requires runtimeSnapshot.winStats.");
    }
    return runtimeSnapshot.winStats;
  }

  function requireFiniteWinNumber(value, description) {
    var numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(description + " must be a finite number.");
    }
    return numberValue;
  }

  function resolveWinLevelDisplayText(levelConfig) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView level display requires level config.");
    }
    var randomChallenge = levelConfig.level.randomChallenge;
    if (randomChallenge && randomChallenge.mode === "random_challenge") {
      return "挑战关";
    }
    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView level display requires positive integer level id.");
    }
    return "第" + levelId + "关";
  }

  function buildWinViewRenderKey(levelConfig, runtimeSnapshot) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView render key requires level config.");
    }

    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView render key requires positive integer level id.");
    }

    var winStats = requireRuntimeWinStats(runtimeSnapshot);
    if (typeof winStats.isPersonalBestScore !== "boolean") {
      throw new Error("WinView render key requires boolean isPersonalBestScore.");
    }
    var starRating = resolveWinStarRating(levelConfig, runtimeSnapshot);
    if (!Number.isFinite(starRating)) {
      throw new Error("WinView render key requires finite star rating.");
    }

    return JSON.stringify({
      levelId: levelId,
      totalScore: requireFiniteWinNumber(winStats.totalScore, "WinView render key totalScore"),
      personalBest: winStats.isPersonalBestScore,
      rewardItems: getRuntimeWinClearRewardItems(runtimeSnapshot),
      starRating: Math.floor(starRating)
    });
  }

var POPUP_METHOD_CONTEXT = {
    ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME: ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME,
    AIMING_TOOL_TIPS_PROXY_ROOT_NAME: AIMING_TOOL_TIPS_PROXY_ROOT_NAME,
    LOSE_VIEW_PROXY_ROOT_NAME: LOSE_VIEW_PROXY_ROOT_NAME,
    PAUSE_VIEW_PROXY_ROOT_NAME: PAUSE_VIEW_PROXY_ROOT_NAME,
    POPUP_CONTENT_CONTAINER_NAME: POPUP_CONTENT_CONTAINER_NAME,
    POPUP_OPEN_ANIM_DURATION: POPUP_OPEN_ANIM_DURATION,
    POPUP_OPEN_ANIM_FROM_SCALE: POPUP_OPEN_ANIM_FROM_SCALE,
    PREFAB_PATHS: PREFAB_PATHS,
    PropDescriptionViewController: PropDescriptionViewController,
    RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC: RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC,
    RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME: RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME,
    SpriteProxyLayerHelper: SpriteProxyLayerHelper,
    WIN_POPUP_OPEN_ANIM_DURATION: WIN_POPUP_OPEN_ANIM_DURATION,
    WIN_POPUP_OPEN_ANIM_FROM_SCALE: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
    WIN_STAR_ANIM_STAGGER: WIN_STAR_ANIM_STAGGER,
    WIN_STAR_ANIM_START_DELAY: WIN_STAR_ANIM_START_DELAY,
    WIN_STAR_PUNCH_DOWN_SCALE: WIN_STAR_PUNCH_DOWN_SCALE,
    WIN_STAR_PUNCH_FROM_SCALE: WIN_STAR_PUNCH_FROM_SCALE,
    WIN_STAR_RECOVER_DURATION: WIN_STAR_RECOVER_DURATION,
    WIN_STAR_SHRINK_DURATION: WIN_STAR_SHRINK_DURATION,
    WIN_VIEW_PROXY_ROOT_NAME: WIN_VIEW_PROXY_ROOT_NAME,
    applyLoseReviveLayout: applyLoseReviveLayout,
    attachLevelRendererSceneModalPopupMethods: attachLevelRendererSceneModalPopupMethods,
    attachLevelRendererSceneResultPopupMethods: attachLevelRendererSceneResultPopupMethods,
    attachLevelRendererSceneWinPopupMethods: attachLevelRendererSceneWinPopupMethods,
    buildRescueSuccessfulSpiritResourcePath: buildRescueSuccessfulSpiritResourcePath,
    buildResultTexts: buildResultTexts,
    buildWinViewRenderKey: buildWinViewRenderKey,
    ensureLabel: ensureLabel,
    ensureOutline: ensureOutline,
    ensureSprite: ensureSprite,
    getOrCreateChild: getOrCreateChild,
    getRuntimeWinClearRewardItems: getRuntimeWinClearRewardItems,
    renderAddBallTipsCoinButton: renderAddBallTipsCoinButton,
    renderLoseCoinButton: renderLoseCoinButton,
    renderLoseFailureStatus: renderLoseFailureStatus,
    renderLoseReviveGain: renderLoseReviveGain,
    requireChildNode: requireChildNode,
    requireFiniteWinNumber: requireFiniteWinNumber,
    requireRuntimeWinStats: requireRuntimeWinStats,
    requireWinChild: requireWinChild,
    resolveLoseRewardEntry: resolveLoseRewardEntry,
    resolveRewardItemSpritePath: resolveRewardItemSpritePath,
    resolveWinLevelDisplayText: resolveWinLevelDisplayText,
    resolveWinStarRating: resolveWinStarRating,
    setNodeTreeActive: setNodeTreeActive,
    setRequiredLabelString: setRequiredLabelString
  };
  attachLevelRendererSceneWinPopupMethods(LevelRenderer, POPUP_METHOD_CONTEXT);
  attachLevelRendererSceneModalPopupMethods(LevelRenderer, POPUP_METHOD_CONTEXT);
  attachLevelRendererSceneResultPopupMethods(LevelRenderer, POPUP_METHOD_CONTEXT);

}

module.exports = attachLevelRendererScenePopupMethods;
module.exports.buildLoseRevivePresentation = buildLoseRevivePresentation;
module.exports.buildLoseClearanceTargetPresentation = buildLoseClearanceTargetPresentation;
module.exports.getSpriteFrameWidthAtHeight = getSpriteFrameWidthAtHeight;
