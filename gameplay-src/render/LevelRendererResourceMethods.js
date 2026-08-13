"use strict";

function attachLevelRendererResourceMethods(LevelRenderer, context) {
  var AssistSpiritPresentationConfig = context.AssistSpiritPresentationConfig;
  var AssistSpiritSkillConfig = context.AssistSpiritSkillConfig;
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOARD_OCCLUSION_CLOCK_RESOURCE = context.BOARD_OCCLUSION_CLOCK_RESOURCE;
  var BOARD_OCCLUSION_RESOURCES = context.BOARD_OCCLUSION_RESOURCES;
  var BoardLayout = context.BoardLayout;
  var BubbleShatterRenderer = context.BubbleShatterRenderer;
  var BundleLoader = context.BundleLoader;
  var COMMENT_ANIMATION_RESOURCES = context.COMMENT_ANIMATION_RESOURCES;
  var EXPLODE_ANIMATION_CLIP_PATH = context.EXPLODE_ANIMATION_CLIP_PATH;
  var FAIRY_ANIMATION_BUNDLE_NAME = context.FAIRY_ANIMATION_BUNDLE_NAME;
  var FIREWORKS_PREFAB_PATH = context.FIREWORKS_PREFAB_PATH;
  var FairyAssistConfig = context.FairyAssistConfig;
  var GAME_RESOURCE_PATH_PREFIX = context.GAME_RESOURCE_PATH_PREFIX;
  var GUIDE_DOT_SIZE = context.GUIDE_DOT_SIZE;
  var GUIDE_DOT_SPRITE_PATH = context.GUIDE_DOT_SPRITE_PATH;
  var HUD_STAR_RESOURCES = context.HUD_STAR_RESOURCES;
  var JAR_MASK_RESOURCES = context.JAR_MASK_RESOURCES;
  var JAR_RESOURCES = context.JAR_RESOURCES;
  var JarScoreConfig = context.JarScoreConfig;
  var LOSE_STATUS_RESOURCES = context.LOSE_STATUS_RESOURCES;
  var LightningChainRenderer = context.LightningChainRenderer;
  var POWERUP_ICON_RESOURCES = context.POWERUP_ICON_RESOURCES;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var PrefabFactory = context.PrefabFactory;
  var PropDescriptionConfig = context.PropDescriptionConfig;
  var REWARD_ITEM_RESOURCES = context.REWARD_ITEM_RESOURCES;
  var TIME_BONUS_FONT_RESOURCE = context.TIME_BONUS_FONT_RESOURCE;
  var TOP_SLOT_STAR_RESOURCE = context.TOP_SLOT_STAR_RESOURCE;
  var WORMHOLE_DIRECTION_ARROW_RESOURCE = context.WORMHOLE_DIRECTION_ARROW_RESOURCE;
  var WormholeShaderRenderer = context.WormholeShaderRenderer;
  var assertNoPendingSpriteFrameLoadsByPrefix = context.assertNoPendingSpriteFrameLoadsByPrefix;
  var buildHudTargetDisplayData = context.buildHudTargetDisplayData;
  var buildObjectiveDisplayData = context.buildObjectiveDisplayData;
  var buildRescueSuccessfulSpiritResourcePath = context.buildRescueSuccessfulSpiritResourcePath;
  var buildSpiritFragmentRewardResourcePath = context.buildSpiritFragmentRewardResourcePath;
  var buildTrappedSpriteResourcePath = context.buildTrappedSpriteResourcePath;
  var collectBallVisualSpritePaths = context.collectBallVisualSpritePaths;
  var collectRuntimeBoardSpritePaths = context.collectRuntimeBoardSpritePaths;
  var ensureSprite = context.ensureSprite;
  var getCollectionObjectiveList = context.getCollectionObjectiveList;
  var hasValidSpriteFrame = context.hasValidSpriteFrame;
  var loadSpriteFrame = context.loadSpriteFrame;
  var pushBallSpritePath = context.pushBallSpritePath;
  var pushUniqueSpritePath = context.pushUniqueSpritePath;
  var releaseRetainedSpriteFrame = context.releaseRetainedSpriteFrame;
  var releaseRetainedSpriteFramesByPrefix = context.releaseRetainedSpriteFramesByPrefix;
  var resolveJarScoreSpritePath = context.resolveJarScoreSpritePath;
  var retainSpriteFrame = context.retainSpriteFrame;

LevelRenderer.prototype.warmupSharedAssets = function () {
  if (this._sharedWarmupPromise) {
    return this._sharedWarmupPromise;
  }

  this._sharedWarmupPromise = Promise.all([
    this._preloadSprites(this._collectCommonSpritePaths()),
    this._preloadTimeBonusBitmapFont(),
    this._preloadFairyPrefabs(),
    this._preloadExplodeAnimationClip(),
    this._preloadAssistSpiritAnimationClips(),
    this._preloadFireworksPrefab(),
    this.prefabFactory.preload(this._collectPrefabPaths()),
    this.bubbleShatterRenderer.preload(),
    this.wormholeShaderRenderer.preload()
  ]).catch(function (error) {
    this._sharedWarmupPromise = null;
    throw error;
  }.bind(this));

  return this._sharedWarmupPromise;
};

LevelRenderer.prototype.preloadLightningChainEffect = function () {
  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return this._preloadSprites(LightningChainRenderer.RESOURCE_PATHS);
  }.bind(this));
};

LevelRenderer.prototype.playLightningChainEffect = function (config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Board lightning chain config is required.");
  }
  if (!this.layers || !this.layers.shatter || !this.layers.shatter.isValid) {
    throw new Error("Board lightning chain requires rendered gameplay layers.");
  }
  if (!this.lastRuntimeSnapshot || !this.lastRuntimeSnapshot.board) {
    throw new Error("Board lightning chain requires current board snapshot.");
  }
  if (!Array.isArray(config.hitPoints) || config.hitPoints.length < 2) {
    throw new Error("Board lightning chain requires at least two hit points.");
  }

  var boardSnapshot = this.lastRuntimeSnapshot.board;
  if (!Array.isArray(boardSnapshot.cells)) {
    throw new Error("Board lightning chain requires board.cells.");
  }
  if (!Number.isInteger(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
    throw new Error("Board lightning chain requires positive board.maxColumns.");
  }
  if (
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Board lightning chain requires finite board.viewportOffsetY.");
  }

  var resolvedHitPoints = config.hitPoints.map(function (hitPoint, index) {
    if (!hitPoint || typeof hitPoint !== "object" || Array.isArray(hitPoint)) {
      throw new Error("Board lightning chain hit point " + index + " must be an object.");
    }
    if (
      (typeof hitPoint.id !== "string" && typeof hitPoint.id !== "number") ||
      String(hitPoint.id).length === 0
    ) {
      throw new Error("Board lightning chain hit point " + index + " requires bubble id.");
    }
    if (!Number.isInteger(hitPoint.row) || !Number.isInteger(hitPoint.col)) {
      throw new Error("Board lightning chain hit point " + index + " requires integer row and col.");
    }

    var normalizedId = String(hitPoint.id);
    var boardCell = null;
    for (var cellIndex = 0; cellIndex < boardSnapshot.cells.length; cellIndex += 1) {
      var candidate = boardSnapshot.cells[cellIndex];
      if (
        candidate &&
        (typeof candidate.id === "string" || typeof candidate.id === "number") &&
        String(candidate.id) === normalizedId
      ) {
        boardCell = candidate;
        break;
      }
    }
    if (!boardCell) {
      throw new Error("Board lightning chain target is not present on the board: " + normalizedId);
    }
    if (boardCell.row !== hitPoint.row || boardCell.col !== hitPoint.col) {
      throw new Error("Board lightning chain target coordinates do not match bubble: " + normalizedId);
    }

    var position = BoardLayout.getCellPosition(
      hitPoint.row,
      hitPoint.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    return {
      id: normalizedId,
      x: position.x,
      y: position.y
    };
  });

  return this.lightningChainRenderer.play(
    this.layers.shatter,
    this.spriteFrameCache,
    {
      chainId: config.chainId,
      hitPoints: resolvedHitPoints,
      onHit: config.onHit
    }
  );
};

LevelRenderer.prototype._collectSpritePaths = function (levelConfig, runtimeSnapshot) {
  var paths = this._collectCommonSpritePaths().slice();

  if (!levelConfig || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("LevelRenderer sprite collection requires level config.");
  }

  var level = levelConfig.level;
  if (level.levelType === "trapped_sprite_rescue") {
    if (
      !level.trappedSpriteRescue ||
      typeof level.trappedSpriteRescue.spiritId !== "string"
    ) {
      throw new Error("Trapped sprite rescue rendering requires level.trappedSpriteRescue.spiritId.");
    }
    pushUniqueSpritePath(
      paths,
      buildTrappedSpriteResourcePath(level.trappedSpriteRescue.spiritId),
      "trapped sprite rescue center"
    );
    pushUniqueSpritePath(
      paths,
      buildSpiritFragmentRewardResourcePath(level.trappedSpriteRescue.spiritId),
      "trapped sprite rescue fragment reward"
    );
    pushUniqueSpritePath(
      paths,
      buildRescueSuccessfulSpiritResourcePath(level.trappedSpriteRescue.spiritId),
      "rescue successful popup spirit"
    );
  }
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
    var baseScore = JarScoreConfig.getBaseScoreForJarIndex(level.jarColors.length, index);
    pushUniqueSpritePath(paths, JAR_RESOURCES[colorCode], "level.jarColors[" + index + "]");
    pushUniqueSpritePath(paths, JAR_MASK_RESOURCES[colorCode], "level.jarColors[" + index + "]/mask");
    pushUniqueSpritePath(
      paths,
      resolveJarScoreSpritePath(colorCode, baseScore),
      "level.jarColors[" + index + "]/base-score"
    );
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
      if (entity && entity.entityType === "wormhole") {
        pushUniqueSpritePath(paths, WORMHOLE_DIRECTION_ARROW_RESOURCE, "wormhole direction guide");
      }
    });
  }
  if (!level.boardOcclusionPlan || !Array.isArray(level.boardOcclusionPlan.variants)) {
    throw new Error("LevelRenderer sprite collection requires level.boardOcclusionPlan.");
  }
  level.boardOcclusionPlan.variants.forEach(function (variant, variantIndex) {
    if (!variant || !Array.isArray(variant.zones)) {
      throw new Error("Board occlusion variant requires zones: " + variantIndex);
    }
    variant.zones.forEach(function (zone, zoneIndex) {
      if (!zone || !BOARD_OCCLUSION_RESOURCES[zone.visualType]) {
        throw new Error("Unsupported board occlusion visual type at " + variantIndex + ":" + zoneIndex);
      }
      if (!zone.clearRule || typeof zone.clearRule.kind !== "string") {
        throw new Error("Board occlusion zone requires clearRule at " + variantIndex + ":" + zoneIndex);
      }
      pushUniqueSpritePath(
        paths,
        BOARD_OCCLUSION_RESOURCES[zone.visualType],
        "board occlusion " + zone.visualType
      );
      if (zone.clearRule.kind === "item_or_seconds") {
        pushUniqueSpritePath(
          paths,
          BOARD_OCCLUSION_CLOCK_RESOURCE,
          "board occlusion countdown clock"
        );
      }
    });
  });

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
  this.lightningChainRenderer.reset("gameplay_bundle_unload");
  if (typeof this._releaseJarFractionNodesBeforeGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires jar fraction bundle release cleanup.");
  }
  this._releaseJarFractionNodesBeforeGameplayBundleUnload();
  assertNoPendingSpriteFrameLoadsByPrefix(this.spriteFrameLoadPromises, GAME_RESOURCE_PATH_PREFIX);
  releaseRetainedSpriteFramesByPrefix(this.spriteFrameCache, GAME_RESOURCE_PATH_PREFIX);
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  if (Object.keys(this.assistSpiritAnimationClipLoadPromises).length > 0) {
    throw new Error("Cannot unload gameplay bundle while assist spirit animation clips are loading.");
  }
  this.assistSpiritAnimationClipCache = {};
  this.assistSpiritAnimationClipLoadPromises = {};
  this._sharedWarmupPromise = null;
  if (this.timeBonusBitmapFontLoadPromise) {
    throw new Error("Cannot unload gameplay bundle while time bonus font is loading.");
  }
  this.timeBonusBitmapFont = null;
  if (!this.bubbleShatterRenderer || typeof this.bubbleShatterRenderer.releaseAfterGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires BubbleShatterRenderer.releaseAfterGameplayBundleUnload.");
  }
  this.bubbleShatterRenderer.releaseAfterGameplayBundleUnload();
  if (!this.wormholeShaderRenderer || typeof this.wormholeShaderRenderer.releaseAfterGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires WormholeShaderRenderer.releaseAfterGameplayBundleUnload.");
  }
  this.wormholeShaderRenderer.releaseAfterGameplayBundleUnload();
  if (this.prefabFactory && typeof this.prefabFactory.releaseLoadedCacheByPrefix === "function") {
    this.prefabFactory.releaseLoadedCacheByPrefix(GAME_RESOURCE_PATH_PREFIX);
  } else {
    throw new Error("LevelRenderer requires PrefabFactory.releaseLoadedCacheByPrefix.");
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
    LOSE_STATUS_RESOURCES.complete,
    LOSE_STATUS_RESOURCES.incomplete,
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
  LightningChainRenderer.RESOURCE_PATHS.forEach(function (path) {
    paths.push(path);
  });
  AssistSpiritSkillConfig.getAllSpritePaths().forEach(function (path) {
    paths.push(path);
  });
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
    PREFAB_PATHS.rescueSuccessfulView,
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

LevelRenderer.prototype._preloadAssistSpiritAnimationClips = function () {
  return Promise.all(AssistSpiritPresentationConfig.getAllClipPaths().map(function (path) {
    var cachedClip = this.assistSpiritAnimationClipCache[path];
    if (cachedClip) {
      if (!cachedClip.isValid) {
        throw new Error("Cached assist spirit animation clip is invalid: " + path);
      }
      return Promise.resolve(cachedClip);
    }
    if (this.assistSpiritAnimationClipLoadPromises[path]) {
      return this.assistSpiritAnimationClipLoadPromises[path];
    }

    this.assistSpiritAnimationClipLoadPromises[path] = new Promise(function (resolve, reject) {
      BundleLoader.loadRes(path, cc.AnimationClip, function (error, clip) {
        if (error) {
          reject(new Error("Load assist spirit animation clip failed `" + path + "`: " + error.message));
          return;
        }
        if (!clip || !clip.isValid) {
          reject(new Error("Load assist spirit animation clip returned invalid asset: " + path));
          return;
        }
        var expectedClipName = path.slice(path.lastIndexOf("/") + 1);
        if (clip.name !== expectedClipName) {
          reject(new Error(
            "Assist spirit animation clip name mismatch `" + path + "`: expected `" +
            expectedClipName + "`, received `" + clip.name + "`."
          ));
          return;
        }
        if (typeof clip.duration !== "number" || !isFinite(clip.duration) || clip.duration <= 0) {
          reject(new Error("Assist spirit animation clip duration is invalid: " + path));
          return;
        }
        this.assistSpiritAnimationClipCache[path] = clip;
        delete this.assistSpiritAnimationClipLoadPromises[path];
        resolve(clip);
      }.bind(this));
    }.bind(this)).catch(function (error) {
      delete this.assistSpiritAnimationClipLoadPromises[path];
      throw error;
    }.bind(this));
    return this.assistSpiritAnimationClipLoadPromises[path];
  }, this));
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

LevelRenderer.prototype._preloadTimeBonusBitmapFont = function () {
  if (this.timeBonusBitmapFont) {
    return Promise.resolve(this.timeBonusBitmapFont);
  }
  if (this.timeBonusBitmapFontLoadPromise) {
    return this.timeBonusBitmapFontLoadPromise;
  }
  if (typeof cc.BitmapFont !== "function") {
    throw new Error("Time bonus display requires cc.BitmapFont.");
  }
  this.timeBonusBitmapFontLoadPromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(TIME_BONUS_FONT_RESOURCE, cc.BitmapFont, function (error, font) {
      this.timeBonusBitmapFontLoadPromise = null;
      if (error) {
        reject(new Error("Load time bonus bitmap font failed `" + TIME_BONUS_FONT_RESOURCE + "`: " + error.message));
        return;
      }
      if (!font) {
        reject(new Error("Load time bonus bitmap font returned empty asset: " + TIME_BONUS_FONT_RESOURCE));
        return;
      }
      this.timeBonusBitmapFont = font;
      resolve(font);
    }.bind(this));
  }.bind(this));
  return this.timeBonusBitmapFontLoadPromise;
};
}

module.exports = attachLevelRendererResourceMethods;
