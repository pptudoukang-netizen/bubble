"use strict";

var ResourceConfig = require("./LevelRendererResourceConfig");
var BALL_RESOURCES = ResourceConfig.BALL_RESOURCES;
var BoardLayout = ResourceConfig.BoardLayout;
var COMMENT_ANIMATION_TIERS = ResourceConfig.COMMENT_ANIMATION_TIERS;
var ROUTE_EDITOR_COLORS = ResourceConfig.ROUTE_EDITOR_COLORS;
var SHOOTER_MAX_ROTATION = ResourceConfig.SHOOTER_MAX_ROTATION;
var StarRatingPolicy = ResourceConfig.StarRatingPolicy;
var buildTrappedSpriteResourcePath = ResourceConfig.buildTrappedSpriteResourcePath;

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

function releaseRetainedSpriteFramesByPrefix(cache, pathPrefix) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error("LevelRenderer retained SpriteFrame cache must be an object.");
  }
  if (typeof pathPrefix !== "string" || pathPrefix.length === 0 || pathPrefix.charAt(pathPrefix.length - 1) !== "/") {
    throw new Error("LevelRenderer retained SpriteFrame path prefix must end with '/'.");
  }
  Object.keys(cache).forEach(function (path) {
    if (path.indexOf(pathPrefix) !== 0) {
      return;
    }
    var spriteFrame = cache[path];
    delete cache[path];
    releaseRetainedSpriteFrame(spriteFrame, path);
  });
}

function assertNoPendingSpriteFrameLoadsByPrefix(loadPromises, pathPrefix) {
  if (!loadPromises || typeof loadPromises !== "object" || Array.isArray(loadPromises)) {
    throw new Error("LevelRenderer SpriteFrame load promise cache must be an object.");
  }
  var pendingPaths = Object.keys(loadPromises).filter(function (path) {
    return path.indexOf(pathPrefix) === 0;
  });
  if (pendingPaths.length > 0) {
    throw new Error("Cannot release gameplay assets while SpriteFrames are still loading: " + pendingPaths.join(", "));
  }
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
  if (
    ballLike &&
    typeof ballLike === "object" &&
    (
      ballLike.entityType === "vine_spirit" ||
      (typeof ballLike.vineOwnerId === "string" && ballLike.vineOwnerId) ||
      (typeof ballLike.vinePreviewOwnerId === "string" && ballLike.vinePreviewOwnerId)
    )
  ) {
    pushUniqueSpritePath(paths, BALL_RESOURCES.VINES, label + "/vines");
  }
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

function buildHudTargetDisplayData(levelConfig, runtimeSnapshot) {
  var objectives = getCollectionObjectiveList(levelConfig);
  var ballObjective = null;
  var iceSnowballObjective = null;
  var spiritDisplay = null;

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

  var level = levelConfig.level;
  if (level.levelType === "trapped_sprite_rescue") {
    if (
      !level.trappedSpriteRescue ||
      typeof level.trappedSpriteRescue.spiritId !== "string" ||
      !level.trappedSpriteRescue.spiritId
    ) {
      throw new Error("Trapped sprite rescue HUD target requires level.trappedSpriteRescue.spiritId.");
    }
    if (
      !runtimeSnapshot ||
      !runtimeSnapshot.systems ||
      !runtimeSnapshot.systems.trappedSpriteRescueSystem ||
      runtimeSnapshot.systems.trappedSpriteRescueSystem.active !== true
    ) {
      throw new Error("Trapped sprite rescue HUD target requires active rescue system snapshot.");
    }
    if (runtimeSnapshot.systems.trappedSpriteRescueSystem.spiritId !== level.trappedSpriteRescue.spiritId) {
      throw new Error("Trapped sprite rescue HUD target spiritId does not match runtime snapshot.");
    }
    if (!runtimeSnapshot.board || !Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("Trapped sprite rescue HUD target requires runtime board cells.");
    }
    var spiritRescued = runtimeSnapshot.board.cells.length === 0;
    spiritDisplay = {
      spiritId: level.trappedSpriteRescue.spiritId,
      spritePath: buildTrappedSpriteResourcePath(level.trappedSpriteRescue.spiritId),
      progress: spiritRescued ? 1 : 0,
      target: 1,
      remaining: spiritRescued ? 0 : 1,
      remainingText: spiritRescued ? "0" : "1",
      progressText: spiritRescued ? "1/1" : "0/1"
    };
  }

  return {
    ball: ballObjective ? buildObjectiveDisplayForObjective(ballObjective, runtimeSnapshot) : null,
    iceSnowball: iceSnowballObjective ? buildObjectiveDisplayForObjective(iceSnowballObjective, runtimeSnapshot) : null,
    spirit: spiritDisplay
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
    spirit: hudTargetDisplay.spirit,
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

  if (
    runtimeSnapshot.state === "won_surplus_shots_pending" ||
    runtimeSnapshot.state === "board_clear_score_recheck_surplus_shots_pending"
  ) {
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
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.iconCode : "",
    hudTargetDisplay.spirit ? hudTargetDisplay.spirit.remainingText : "",
    hudTargetDisplay.spirit ? hudTargetDisplay.spirit.progressText : "",
    hudTargetDisplay.spirit ? hudTargetDisplay.spirit.spritePath : ""
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
  if (!runtimeSnapshot.systems || !runtimeSnapshot.systems.boardOcclusionSystem) {
    throw new Error("Bottom panel render key requires board occlusion snapshot.");
  }
  var boardOcclusionVersion = runtimeSnapshot.systems.boardOcclusionSystem.version;
  if (!Number.isInteger(boardOcclusionVersion) || boardOcclusionVersion < 0) {
    throw new Error("Bottom panel render key requires non-negative board occlusion version.");
  }
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
    adRunPowerupAllowed.plus_three_balls === true ? 1 : 0,
    boardOcclusionVersion
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
    shooter.assistSpiritId,
    shooter.assistSpiritSkillCharge,
    shooter.assistSpiritSkillChargeMax,
    shooter.assistSpiritSkillCharged === true ? 1 : 0,
    shooter.assistSpiritSkillAvailable === true ? 1 : 0,
    shooter.assistSpiritSkillUnavailableReason,
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

    if (ballLike.entityType === "swirl") {
      return "SWIRL";
    }

    if (ballLike.entityType === "wormhole") {
      return "WORMHOLE";
    }

    if (ballLike.entityType === "vine_spirit") {
      return "VINE_SPIRIT";
    }
  }

  return null;
}

function isIceBallLike(ballLike) {
  return !!(
    ballLike &&
    typeof ballLike === "object" &&
    ballLike.entityCategory === "obstacle_ball" &&
    ballLike.entityType === "ice" &&
    ballLike.temporaryThawed !== true
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

function resolveCommentAnimationKey(clearedCount) {
  for (var index = 0; index < COMMENT_ANIMATION_TIERS.length; index += 1) {
    var tier = COMMENT_ANIMATION_TIERS[index];
    if (clearedCount >= tier.threshold) {
      return tier.key;
    }
  }

  return null;
}

var LEVEL_RENDERER_SELECTOR_CONTEXT = {
  applyIceSnowballHudDisplayProgress: applyIceSnowballHudDisplayProgress,
  assertNoPendingSpriteFrameLoadsByPrefix: assertNoPendingSpriteFrameLoadsByPrefix,
  buildBottomPanelRenderKey: buildBottomPanelRenderKey,
  buildGuidePathKey: buildGuidePathKey,
  buildHudRenderKey: buildHudRenderKey,
  buildHudTargetDisplayData: buildHudTargetDisplayData,
  buildJarRenderKey: buildJarRenderKey,
  buildObjectiveDisplayData: buildObjectiveDisplayData,
  buildObjectiveDisplayForObjective: buildObjectiveDisplayForObjective,
  buildResultTexts: buildResultTexts,
  buildShooterRenderKey: buildShooterRenderKey,
  buildStateText: buildStateText,
  buildTimerRenderKey: buildTimerRenderKey,
  clamp: clamp,
  clipGuidePathToDistance: clipGuidePathToDistance,
  collectBallVisualSpritePaths: collectBallVisualSpritePaths,
  collectRuntimeBoardSpritePaths: collectRuntimeBoardSpritePaths,
  computeShooterAngle: computeShooterAngle,
  createRouteColor: createRouteColor,
  findCollectionObjective: findCollectionObjective,
  getCollectionObjectiveList: getCollectionObjectiveList,
  getJarBaseY: getJarBaseY,
  hasIceSnowballCollectionObjective: hasIceSnowballCollectionObjective,
  hasValidSpriteFrame: hasValidSpriteFrame,
  isIceBallLike: isIceBallLike,
  measurePathDistance: measurePathDistance,
  pointDistance: pointDistance,
  pushBallSpritePath: pushBallSpritePath,
  pushUniqueSpritePath: pushUniqueSpritePath,
  quantizeRenderValue: quantizeRenderValue,
  releaseRetainedSpriteFrame: releaseRetainedSpriteFrame,
  releaseRetainedSpriteFramesByPrefix: releaseRetainedSpriteFramesByPrefix,
  resolveBallCode: resolveBallCode,
  resolveBallVisualKey: resolveBallVisualKey,
  resolveCommentAnimationKey: resolveCommentAnimationKey,
  resolveGuideFrontClipDistance: resolveGuideFrontClipDistance,
  resolveIceInnerColor: resolveIceInnerColor,
  resolveImpactBounceSpeed: resolveImpactBounceSpeed,
  resolveRuntimeBallKey: resolveRuntimeBallKey,
  resolveWinStarRating: resolveWinStarRating,
  retainSpriteFrame: retainSpriteFrame
};

module.exports = LEVEL_RENDERER_SELECTOR_CONTEXT;
