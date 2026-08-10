"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneShooterMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var BoardLayout = deps.BoardLayout;
  var AssistSpiritSkillConfig = deps.AssistSpiritSkillConfig;
  var AssistSpiritPresentationConfig = deps.AssistSpiritPresentationConfig;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var NEXT_SHOT_BUBBLE_SIZE = deps.NEXT_SHOT_BUBBLE_SIZE;
  var GUIDE_DOT_SPACING = deps.GUIDE_DOT_SPACING;
  var GUIDE_DOT_RADIUS = deps.GUIDE_DOT_RADIUS;
  var GUIDE_DOT_SIZE = deps.GUIDE_DOT_SIZE;
  var GUIDE_DOT_FAR_SCALE = deps.GUIDE_DOT_FAR_SCALE;
  var GUIDE_DOT_MAX_COUNT = deps.GUIDE_DOT_MAX_COUNT;
  var GUIDE_DOT_MIN_SCALE = deps.GUIDE_DOT_MIN_SCALE;
  var GUIDE_DOT_MAX_SCALE = deps.GUIDE_DOT_MAX_SCALE;
  var GUIDE_DOT_SPRITE_PATH = deps.GUIDE_DOT_SPRITE_PATH;
  var GUIDE_DOT_TINTS = deps.GUIDE_DOT_TINTS;
  var ROUTE_LINE_WIDTH_ACTIVE = deps.ROUTE_LINE_WIDTH_ACTIVE;
  var ROUTE_LINE_WIDTH_IDLE = deps.ROUTE_LINE_WIDTH_IDLE;
  var ROUTE_POINT_RADIUS_ACTIVE = deps.ROUTE_POINT_RADIUS_ACTIVE;
  var ROUTE_POINT_RADIUS_IDLE = deps.ROUTE_POINT_RADIUS_IDLE;
  var computeShooterAngle = deps.computeShooterAngle;
  var createRouteColor = deps.createRouteColor;
  var buildGuidePathKey = deps.buildGuidePathKey;
  var clipGuidePathToDistance = deps.clipGuidePathToDistance;
  var resolveGuideFrontClipDistance = deps.resolveGuideFrontClipDistance;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var getOrCreateChild = deps.getOrCreateChild;
  var clearChildren = deps.clearChildren;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var SHOOTER_HANDOFF_DURATION = 0.34;
  var SHOOTER_HANDOFF_ARC_HEIGHT = 52;
  var SHOOTER_AIM_RECENTER_DURATION = 0.28;
  var SHOOTER_HERO_NODE_NAME = "handler_milu";
  var SHOOTER_PREFAB_LAYOUT_NODE_NAMES = [
    SHOOTER_HERO_NODE_NAME,
    "CurrentBallAnchor",
    "ChangeBtn",
    "Shooter",
    "ShooterBase",
    "NextBallDock",
    "NextBallAnchor",
    "TurretNumBg",
    "Surplus",
    "Skill"
  ];
  var ASSIST_SKILL_GRAY_COLOR = cc.color(116, 116, 116, 255);

  function requireAssistSkillChargeValue(value, fieldName) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("ShooterPanel Skill " + fieldName + " must be a non-negative integer.");
    }
    return value;
  }

  function getOrCreateAssistSkillChargeFill(skillNode) {
    var fillNode = skillNode.getChildByName("SkillChargeFill");
    if (!fillNode) {
      fillNode = new cc.Node("SkillChargeFill");
      fillNode.setAnchorPoint(skillNode.anchorX, skillNode.anchorY);
      fillNode.setContentSize(skillNode.getContentSize());
      fillNode.setPosition(0, 0);
      skillNode.addChild(fillNode);
      fillNode.setSiblingIndex(0);
      fillNode.addComponent(cc.Sprite);
    }
    var fillSprite = fillNode.getComponent(cc.Sprite);
    if (!fillSprite) {
      throw new Error("ShooterPanel SkillChargeFill requires cc.Sprite.");
    }
    return {
      node: fillNode,
      sprite: fillSprite
    };
  }

  function syncAssistSkillChargeVisual(skillNode, skillFrame, charge, maxCharge) {
    var safeCharge = requireAssistSkillChargeValue(charge, "assistSpiritSkillCharge");
    var safeMaxCharge = requireAssistSkillChargeValue(maxCharge, "assistSpiritSkillChargeMax");
    if (safeMaxCharge <= 0 || safeCharge > safeMaxCharge) {
      throw new Error("ShooterPanel Skill charge must be within a positive maximum.");
    }
    var skillSprite = skillNode.getComponent(cc.Sprite);
    if (!skillSprite) {
      throw new Error("ShooterPanel Skill requires cc.Sprite.");
    }
    var adNode = requireChildNode(skillNode, "ad", "ShooterPanel/Skill");
    var fill = getOrCreateAssistSkillChargeFill(skillNode);
    var ratio = safeCharge / safeMaxCharge;

    skillSprite.spriteFrame = skillFrame;
    skillSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    skillSprite.type = cc.Sprite.Type.SIMPLE;
    skillSprite.node.color = ASSIST_SKILL_GRAY_COLOR;

    fill.node.setContentSize(skillNode.getContentSize());
    fill.node.setPosition(0, 0);
    fill.node.active = ratio > 0;
    if (fill.node.active) {
      fill.sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      fill.sprite.type = cc.Sprite.Type.FILLED;
      fill.sprite.fillType = cc.Sprite.FillType.VERTICAL;
      fill.sprite.fillStart = 1 - ratio;
      fill.sprite.fillRange = ratio;
      fill.sprite.spriteFrame = skillFrame;
      fill.node.setAnchorPoint(skillNode.anchorX, skillNode.anchorY);
      fill.node.setContentSize(skillNode.getContentSize());
      fill.node.setPosition(0, 0);
      fill.node.color = cc.color(255, 255, 255, 255);
    }
    adNode.active = ratio < 1;
  }

  function syncShooterPrefabLayout(shooterPanel, aimOrigin) {
    if (
      !aimOrigin ||
      typeof aimOrigin.x !== "number" ||
      !isFinite(aimOrigin.x) ||
      typeof aimOrigin.y !== "number" ||
      !isFinite(aimOrigin.y)
    ) {
      throw new Error("ShooterPanel layout requires a finite aim origin.");
    }

    var layoutNodes = {};
    SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
      layoutNodes[nodeName] = requireChildNode(shooterPanel, nodeName, "ShooterPanel");
    });

    if (!shooterPanel.__shooterPrefabRelativeLayout) {
      var prefabOriginNode = layoutNodes.CurrentBallAnchor;
      var prefabOriginX = prefabOriginNode.x;
      var prefabOriginY = prefabOriginNode.y;
      if (
        typeof prefabOriginX !== "number" ||
        !isFinite(prefabOriginX) ||
        typeof prefabOriginY !== "number" ||
        !isFinite(prefabOriginY)
      ) {
        throw new Error("ShooterPanel/CurrentBallAnchor prefab position must be finite.");
      }

      shooterPanel.__shooterPrefabRelativeLayout = {};
      SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
        var node = layoutNodes[nodeName];
        if (
          typeof node.x !== "number" ||
          !isFinite(node.x) ||
          typeof node.y !== "number" ||
          !isFinite(node.y)
        ) {
          throw new Error("ShooterPanel/" + nodeName + " prefab position must be finite.");
        }
        shooterPanel.__shooterPrefabRelativeLayout[nodeName] = {
          x: node.x - prefabOriginX,
          y: node.y - prefabOriginY
        };
      });
    }

    SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
      var relativePosition = shooterPanel.__shooterPrefabRelativeLayout[nodeName];
      if (!relativePosition) {
        throw new Error("ShooterPanel prefab relative layout is missing " + nodeName + ".");
      }
      layoutNodes[nodeName].setPosition(
        aimOrigin.x + relativePosition.x,
        aimOrigin.y + relativePosition.y
      );
    });

    return layoutNodes;
  }

  function requireShooterHeroAnimation(heroNode) {
    if (!heroNode || !heroNode.isValid) {
      throw new Error("Shooter hero animation requires " + SHOOTER_HERO_NODE_NAME + " node.");
    }
    var animation = heroNode.getComponent(cc.Animation);
    if (!animation) {
      throw new Error("Shooter hero animation requires cc.Animation on " + SHOOTER_HERO_NODE_NAME + ".");
    }
    if (typeof animation.getClips !== "function") {
      throw new Error("Shooter hero animation requires getClips API.");
    }
    return animation;
  }

  function requireShooterHeroClip(animation, clipName) {
    var clips = animation.getClips();
    if (!Array.isArray(clips) || clips.length <= 0) {
      throw new Error("Shooter hero animation requires clips.");
    }
    for (var i = 0; i < clips.length; i += 1) {
      if (clips[i] && clips[i].name === clipName) {
        return clips[i];
      }
    }
    throw new Error("Shooter hero animation clip is missing: " + clipName + ".");
  }

  function playShooterHeroClip(heroNode, clipName, onFinished) {
    var animation = requireShooterHeroAnimation(heroNode);
    var clip = requireShooterHeroClip(animation, clipName);
    if (!onFinished && heroNode.__shooterHeroPlayingClip === clipName) {
      return clip;
    }

    var previousToken = typeof heroNode.__shooterHeroAnimationToken === "number"
      ? heroNode.__shooterHeroAnimationToken
      : 0;
    heroNode.__shooterHeroAnimationToken = previousToken + 1;
    var token = heroNode.__shooterHeroAnimationToken;
    heroNode.__shooterHeroPlayingClip = clipName;

    if (onFinished) {
      if (typeof animation.once !== "function") {
        throw new Error("Shooter hero animation requires once API.");
      }
      animation.once("finished", function () {
        if (heroNode.__shooterHeroAnimationToken === token) {
          onFinished();
        }
      });
    }
    animation.play(clip.name);
    return clip;
  }

  function playShooterHeroIdle(heroNode, clipName) {
    return playShooterHeroClip(heroNode, clipName, null);
  }

  function installShooterHeroClips(renderer, heroNode, spiritId) {
    var presentation = AssistSpiritPresentationConfig.getBySpiritId(spiritId);
    var idleClip = renderer.assistSpiritAnimationClipCache[presentation.idleClipPath];
    var deliverClip = renderer.assistSpiritAnimationClipCache[presentation.deliverClipPath];
    if (!idleClip || !idleClip.isValid) {
      throw new Error("Shooter hero idle clip was not preloaded: " + presentation.idleClipPath);
    }
    if (!deliverClip || !deliverClip.isValid) {
      throw new Error("Shooter hero deliver clip was not preloaded: " + presentation.deliverClipPath);
    }
    if (idleClip.name !== presentation.idleClipName) {
      throw new Error("Shooter hero idle clip name mismatch: " + idleClip.name);
    }
    if (deliverClip.name !== presentation.deliverClipName) {
      throw new Error("Shooter hero deliver clip name mismatch: " + deliverClip.name);
    }

    var animation = requireShooterHeroAnimation(heroNode);
    if (
      heroNode.__shooterHeroSpiritId === spiritId &&
      requireShooterHeroClip(animation, presentation.idleClipName) === idleClip &&
      requireShooterHeroClip(animation, presentation.deliverClipName) === deliverClip
    ) {
      return presentation;
    }
    if (typeof animation.stop !== "function") {
      throw new Error("Shooter hero animation requires stop API.");
    }
    if (typeof animation.removeClip !== "function") {
      throw new Error("Shooter hero animation requires removeClip API.");
    }
    if (typeof animation.addClip !== "function") {
      throw new Error("Shooter hero animation requires addClip API.");
    }
    animation.stop();
    animation.getClips().slice().forEach(function (clip) {
      animation.removeClip(clip, true);
    });
    animation.addClip(idleClip);
    animation.addClip(deliverClip);
    requireShooterHeroClip(animation, presentation.idleClipName);
    requireShooterHeroClip(animation, presentation.deliverClipName);

    heroNode.__shooterHeroSpiritId = spiritId;
    heroNode.__shooterHeroPlayingClip = "";
    heroNode.__shooterHeroAnimationToken =
      (typeof heroNode.__shooterHeroAnimationToken === "number" ? heroNode.__shooterHeroAnimationToken : 0) + 1;
    return presentation;
  }

  function resolveFiniteRemainingShots(remainingShots, shooterSnapshot, description) {
    if (shooterSnapshot && shooterSnapshot.infiniteShots) {
      return null;
    }
    if (!Number.isInteger(remainingShots) || remainingShots < 0) {
      throw new Error(description + " requires a non-negative integer remainingShots.");
    }
    return remainingShots;
  }
  var RAINBOW_COLOR_SELECTOR_BUTTON_SIZE = 72;
  var RAINBOW_COLOR_SELECTOR_RADIUS = 142;
  var RAINBOW_COLOR_SELECTOR_ANGLE_STEP = 35;
  var RAINBOW_COLOR_SELECTOR_MAX_SPREAD = 140;

LevelRenderer.prototype._renderRainbowColorSelector = function (shooterPanel, shooterSnapshot, aim) {
  var selectorNode = getOrCreateChild(shooterPanel, "RainbowColorSelector");
  var selection = shooterSnapshot && shooterSnapshot.pendingRainbowColorSelection
    ? shooterSnapshot.pendingRainbowColorSelection
    : null;
  if (!selection) {
    selectorNode.active = false;
    return;
  }

  var colors = Array.isArray(selection.colors) ? selection.colors.slice() : [];
  if (!colors.length) {
    throw new Error("Rainbow color selector requires colors.");
  }

  selectorNode.active = true;
  selectorNode.zIndex = 80;
  var originX = aim.origin.x;
  var originY = aim.origin.y;
  var selectorKey = colors.join("|") + "@" + Math.round(originX) + ":" + Math.round(originY);
  var shouldAnimate = selectorNode.__selectorKey !== selectorKey;
  selectorNode.__selectorKey = selectorKey;

  var buttonSize = new cc.Size(RAINBOW_COLOR_SELECTOR_BUTTON_SIZE, RAINBOW_COLOR_SELECTOR_BUTTON_SIZE);
  var radius = RAINBOW_COLOR_SELECTOR_RADIUS;
  var spread = Math.min(
    RAINBOW_COLOR_SELECTOR_MAX_SPREAD,
    Math.max(0, (colors.length - 1) * RAINBOW_COLOR_SELECTOR_ANGLE_STEP)
  );
  var startAngle = 90 + spread * 0.5;

  colors.forEach(function (colorCode, index) {
    if (!BALL_RESOURCES[colorCode]) {
      throw new Error("Rainbow color selector missing ball resource: " + colorCode);
    }

    var buttonNode = getOrCreateChild(selectorNode, "RainbowColor_" + colorCode);
    buttonNode.active = true;
    buttonNode.zIndex = index + 1;
    buttonNode.setContentSize(buttonSize);
    buttonNode.setScale(1);
    buttonNode.opacity = 255;
    if (!buttonNode.getComponent(cc.Button)) {
      buttonNode.addComponent(cc.Button);
    }
    this._applyBallVisualCached(buttonNode, colorCode, buttonSize);
    this._bindBottomPanelButton(buttonNode, "select_rainbow_color:" + colorCode);

    var angle = colors.length === 1 ? 90 : startAngle - (spread * index / (colors.length - 1));
    var radians = angle * Math.PI / 180;
    var targetX = originX + Math.cos(radians) * radius;
    var targetY = originY + Math.sin(radians) * radius;

    if (shouldAnimate || buttonNode.__rainbowTargetKey !== selectorKey) {
      buttonNode.stopAllActions();
      buttonNode.setPosition(originX, originY);
      buttonNode.setScale(0.35);
      buttonNode.opacity = 0;
      buttonNode.runAction(cc.sequence(
        cc.delayTime(index * 0.035),
        cc.spawn(
          cc.moveTo(0.18, targetX, targetY),
          cc.scaleTo(0.18, 1),
          cc.fadeTo(0.12, 255)
        )
      ));
      buttonNode.__rainbowTargetKey = selectorKey;
    } else {
      buttonNode.setPosition(targetX, targetY);
    }
  }, this);

  selectorNode.children.slice().forEach(function (child) {
    if (child.name.indexOf("RainbowColor_") === 0) {
      var colorCode = child.name.slice("RainbowColor_".length);
      child.active = colors.indexOf(colorCode) !== -1;
    }
  });
};

LevelRenderer.prototype.isShooterHandoffInProgress = function () {
  if (!this.layers || !this.layers.shooter) {
    return false;
  }
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    return false;
  }
  return shooterPanel.__shooterHandoffInProgress === true;
};

LevelRenderer.prototype._renderShooter = function (shooterSnapshot, activeProjectile, remainingShots) {
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    shooterPanel = this._instantiateOrCreate(PREFAB_PATHS.shooterPanel, this.layers.shooter, "ShooterPanel");
  }

  var aim = shooterSnapshot && shooterSnapshot.aim
    ? shooterSnapshot.aim
    : { origin: BoardLayout.shooterOrigin, direction: { x: 0, y: 1 } };
  var layoutNodes = syncShooterPrefabLayout(shooterPanel, aim.origin);
  var finiteRemainingShots = resolveFiniteRemainingShots(
    remainingShots,
    shooterSnapshot,
    "Shooter render"
  );
  this._syncShooterAimRecenter(
    shooterPanel,
    layoutNodes.Shooter,
    shooterSnapshot,
    activeProjectile,
    computeShooterAngle(aim.direction)
  );
  this._syncShooterHeroAnimation(
    shooterPanel,
    layoutNodes[SHOOTER_HERO_NODE_NAME],
    shooterSnapshot,
    activeProjectile,
    finiteRemainingShots
  );

  var trajectory = shooterSnapshot.trajectory;
  var canUsePowerup = !!(shooterSnapshot && shooterSnapshot.canUsePowerups);
  var pendingBarrierHammer = !!(shooterSnapshot && shooterSnapshot.pendingBarrierHammer);
  var shooterInventory = shooterSnapshot && shooterSnapshot.skillInventory
    ? shooterSnapshot.skillInventory
    : {};
  var swapCount = Math.max(0, Math.floor(Number(shooterInventory.swap) || 0));
  var currentAnchor = layoutNodes.CurrentBallAnchor;
  currentAnchor.setScale(1);
  var currentBallLike = shooterSnapshot.currentBall || shooterSnapshot.currentColor;
  currentAnchor.active = !!currentBallLike;
  if (currentAnchor.active) {
    this._applyBallVisualCached(currentAnchor, currentBallLike, BOARD_BUBBLE_SIZE);
  }
  this._renderRainbowColorSelector(shooterPanel, shooterSnapshot, aim);

  var changeButtonNode = layoutNodes.ChangeBtn;
  var hasSwapInventory = swapCount > 0;
  changeButtonNode.active = hasSwapInventory;
  this._setShooterChangeButtonSpin(changeButtonNode, hasSwapInventory);
  if (hasSwapInventory) {
    this._bindBottomPanelButton(changeButtonNode, "use_swap");
    this._setBottomPanelButtonEnabled(
      changeButtonNode,
      canUsePowerup &&
      !pendingBarrierHammer &&
      !!(shooterSnapshot.currentBall && shooterSnapshot.nextBall),
      {
        dimWhenDisabled: false
      }
    );
  }

  if (!shooterSnapshot || typeof shooterSnapshot.assistSpiritId !== "string") {
    throw new Error("ShooterPanel Skill requires shooterSnapshot.assistSpiritId.");
  }
  var assistSkillConfig = AssistSpiritSkillConfig.getBySpiritId(shooterSnapshot.assistSpiritId);
  var assistSkillNode = layoutNodes.Skill;
  assistSkillNode.active = !!assistSkillConfig.skillId;
  if (assistSkillNode.active) {
    var assistSkillSprite = assistSkillNode.getComponent(cc.Sprite);
    if (!assistSkillSprite) {
      throw new Error("ShooterPanel Skill requires cc.Sprite.");
    }
    var assistSkillButton = assistSkillNode.getComponent(cc.Button);
    if (!assistSkillButton) {
      throw new Error("ShooterPanel Skill requires cc.Button.");
    }
    var assistSkillFrame = this.spriteFrameCache[assistSkillConfig.iconPath];
    if (!assistSkillFrame || !assistSkillFrame.isValid) {
      throw new Error("ShooterPanel Skill SpriteFrame is missing: " + assistSkillConfig.iconPath);
    }
    syncAssistSkillChargeVisual(
      assistSkillNode,
      assistSkillFrame,
      shooterSnapshot.assistSpiritSkillCharge,
      shooterSnapshot.assistSpiritSkillChargeMax
    );
    this._bindBottomPanelButton(assistSkillNode, "use_assist_spirit_skill");
    this._setBottomPanelButtonEnabled(
      assistSkillNode,
      canUsePowerup &&
        !pendingBarrierHammer &&
        (
          shooterSnapshot.assistSpiritSkillCharged !== true ||
          shooterSnapshot.assistSpiritSkillAvailable === true
        )
    );
  }

  var nextAnchor = layoutNodes.NextBallAnchor;
  nextAnchor.setScale(1);
  nextAnchor.opacity = 255;
  var nextBallLike = shooterSnapshot.nextBall || shooterSnapshot.nextColor;
  nextAnchor.active = !!nextBallLike;
  if (nextAnchor.active) {
    this._applyBallVisualCached(nextAnchor, nextBallLike, NEXT_SHOT_BUBBLE_SIZE);
  }
  this._syncShooterBallHandoff(
    shooterPanel,
    layoutNodes,
    shooterSnapshot,
    activeProjectile,
    currentBallLike,
    nextBallLike,
    finiteRemainingShots
  );

  var shotsValue = finiteRemainingShots === null ? 0 : finiteRemainingShots;
  if (
    shooterSnapshot &&
    Object.prototype.hasOwnProperty.call(shooterSnapshot, "surplusRemainingShots")
  ) {
    if (shooterSnapshot.infiniteShots) {
      throw new Error("Shooter render cannot show surplusRemainingShots in infinite-shot mode.");
    }
    if (!Number.isInteger(shooterSnapshot.surplusRemainingShots) || shooterSnapshot.surplusRemainingShots < 0) {
      throw new Error("Shooter render requires non-negative integer surplusRemainingShots.");
    }
    shotsValue = shooterSnapshot.surplusRemainingShots;
  }
  var surplusNode = layoutNodes.Surplus;
  var turretNumBgSprite = layoutNodes.TurretNumBg.getComponent(cc.Sprite);
  if (!turretNumBgSprite) {
    throw new Error("ShooterPanel TurretNumBg requires cc.Sprite.");
  }
  if (!turretNumBgSprite.spriteFrame) {
    throw new Error("ShooterPanel TurretNumBg requires SpriteFrame.");
  }
  var surplusLabel = surplusNode.getComponent(cc.Label);
  if (!surplusLabel) {
    throw new Error("ShooterPanel Surplus requires cc.Label.");
  }
  surplusLabel.string = shooterSnapshot && shooterSnapshot.infiniteShots ? "无限" : String(shotsValue);
  if (!shooterSnapshot.infiniteShots && shotsValue < 10) {
    surplusLabel.node.color = cc.color(255, 72, 72);
  } else {
    surplusLabel.node.color = cc.Color.WHITE;
  }

  var ghost = getOrCreateChild(shooterPanel, "GhostBubble");
  var hasTrajectory = !!(
    trajectory &&
    trajectory.hitType !== "miss" &&
    trajectory.pathPoints &&
    trajectory.pathPoints.length >= 2
  );
  var hasGhostTarget = hasTrajectory && !!trajectory.targetCellPosition;
  var wallBounceCount = hasTrajectory && Number.isInteger(trajectory.wallBounceCount)
    ? trajectory.wallBounceCount
    : 0;
  var ricochetGuideActive = !!(shooterSnapshot && shooterSnapshot.ricochetGuideActive);
  var shouldShowGhost = BoardLayout.showGhostBubble !== false && (ricochetGuideActive || wallBounceCount === 0);
  ghost.active = shouldShowGhost && !activeProjectile && hasGhostTarget && !!currentBallLike;
  if (ghost.active) {
    ghost.setPosition(trajectory.targetCellPosition.x, trajectory.targetCellPosition.y);
    ghost.setScale(1);
    ghost.opacity = 140;
    this._applyBallVisualCached(ghost, currentBallLike, BOARD_BUBBLE_SIZE);
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

  this._syncShooterGuideDots(shooterPanel, shooterSnapshot, activeProjectile);

  var dock = layoutNodes.NextBallDock;
  dock.active = false;
};

LevelRenderer.prototype._syncShooterBallHandoff = function (
  shooterPanel,
  layoutNodes,
  shooterSnapshot,
  activeProjectile,
  currentBallLike,
  nextBallLike,
  finiteRemainingShots
) {
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter handoff requires a non-negative queueAdvanceRevision.");
  }

  if (typeof shooterPanel.__lastQueueAdvanceRevision !== "number") {
    shooterPanel.__lastQueueAdvanceRevision = revision;
    return;
  }
  if (revision < shooterPanel.__lastQueueAdvanceRevision) {
    throw new Error("Shooter queueAdvanceRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastQueueAdvanceRevision) {
    if (revision !== shooterPanel.__lastQueueAdvanceRevision + 1) {
      throw new Error("Shooter queueAdvanceRevision must advance one step at a time.");
    }
    if (finiteRemainingShots === 0) {
      shooterPanel.__lastQueueAdvanceRevision = revision;
      layoutNodes.CurrentBallAnchor.active = false;
      layoutNodes.NextBallAnchor.active = false;
      return;
    }
    if (!activeProjectile) {
      throw new Error("Shooter handoff animation requires an active projectile.");
    }
    if (!currentBallLike) {
      if (nextBallLike) {
        throw new Error("Shooter handoff cannot keep next ball without promoted current ball.");
      }
      shooterPanel.__lastQueueAdvanceRevision = revision;
      return;
    }
    if (shooterPanel.__shooterHandoffInProgress) {
      throw new Error("Shooter handoff animation cannot overlap.");
    }

    shooterPanel.__lastQueueAdvanceRevision = revision;
    this._playShooterBallHandoff(
      shooterPanel,
      layoutNodes.CurrentBallAnchor,
      layoutNodes.NextBallAnchor,
      currentBallLike,
      nextBallLike,
      revision
    );
  }

  if (shooterPanel.__shooterHandoffInProgress) {
    layoutNodes.CurrentBallAnchor.active = false;
    layoutNodes.NextBallAnchor.active = false;
  }
};

LevelRenderer.prototype._syncShooterHeroAnimation = function (
  shooterPanel,
  heroNode,
  shooterSnapshot,
  activeProjectile,
  finiteRemainingShots
) {
  if (!shooterSnapshot || typeof shooterSnapshot.assistSpiritId !== "string" || !shooterSnapshot.assistSpiritId) {
    throw new Error("Shooter hero animation requires shooterSnapshot.assistSpiritId.");
  }
  var presentation = installShooterHeroClips(this, heroNode, shooterSnapshot.assistSpiritId);
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter hero animation requires a non-negative queueAdvanceRevision.");
  }

  if (typeof shooterPanel.__lastShooterHeroFireRevision !== "number") {
    shooterPanel.__lastShooterHeroFireRevision = revision;
    playShooterHeroIdle(heroNode, presentation.idleClipName);
    return;
  }
  if (revision < shooterPanel.__lastShooterHeroFireRevision) {
    throw new Error("Shooter hero animation queueAdvanceRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastShooterHeroFireRevision) {
    if (revision !== shooterPanel.__lastShooterHeroFireRevision + 1) {
      throw new Error("Shooter hero animation queueAdvanceRevision must advance one step at a time.");
    }
    if (finiteRemainingShots === 0) {
      shooterPanel.__lastShooterHeroFireRevision = revision;
      playShooterHeroIdle(heroNode, presentation.idleClipName);
      return;
    }
    if (!activeProjectile) {
      throw new Error("Shooter hero fire animation requires an active projectile.");
    }
    shooterPanel.__lastShooterHeroFireRevision = revision;
    this._playShooterHeroFireAnimation(heroNode, presentation);
    return;
  }

  if (!heroNode.__shooterHeroPlayingClip) {
    playShooterHeroIdle(heroNode, presentation.idleClipName);
  }
};

LevelRenderer.prototype._playShooterHeroFireAnimation = function (heroNode, presentation) {
  if (!presentation || typeof presentation.deliverClipName !== "string" || typeof presentation.idleClipName !== "string") {
    throw new Error("Shooter hero deliver animation requires presentation config.");
  }
  playShooterHeroClip(heroNode, presentation.deliverClipName, function () {
    playShooterHeroIdle(heroNode, presentation.idleClipName);
  });
};

LevelRenderer.prototype._syncShooterAimRecenter = function (
  shooterPanel,
  shooterNode,
  shooterSnapshot,
  activeProjectile,
  targetAngle
) {
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter aim recenter requires a non-negative queueAdvanceRevision.");
  }
  var surplusRecenterRevision = shooterSnapshot.surplusShotAimRecenterRevision;
  if (!Number.isInteger(surplusRecenterRevision) || surplusRecenterRevision < 0) {
    throw new Error("Shooter aim recenter requires a non-negative surplusShotAimRecenterRevision.");
  }

  if (typeof shooterPanel.__lastAimRecenterRevision !== "number") {
    shooterPanel.__lastAimRecenterRevision = revision;
    shooterNode.angle = targetAngle;
  }
  if (typeof shooterPanel.__lastSurplusAimRecenterRevision !== "number") {
    shooterPanel.__lastSurplusAimRecenterRevision = surplusRecenterRevision;
  }
  if (revision < shooterPanel.__lastAimRecenterRevision) {
    throw new Error("Shooter aim recenter queueAdvanceRevision cannot move backwards.");
  }
  if (surplusRecenterRevision < shooterPanel.__lastSurplusAimRecenterRevision) {
    throw new Error("Shooter aim recenter surplusShotAimRecenterRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastAimRecenterRevision) {
    if (revision !== shooterPanel.__lastAimRecenterRevision + 1) {
      throw new Error("Shooter aim recenter queueAdvanceRevision must advance one step at a time.");
    }
    if (!activeProjectile) {
      throw new Error("Shooter aim recenter requires an active projectile.");
    }
    if (shooterPanel.__shooterAimRecenterInProgress) {
      throw new Error("Shooter aim recenter animation cannot overlap.");
    }

    shooterPanel.__lastAimRecenterRevision = revision;
    this._playShooterAimRecenter(shooterPanel, shooterNode, revision);
    return;
  }

  if (surplusRecenterRevision > shooterPanel.__lastSurplusAimRecenterRevision) {
    if (shooterPanel.__shooterAimRecenterInProgress) {
      throw new Error("Shooter surplus aim recenter animation cannot overlap.");
    }
    var surplusRecenterDirection = shooterSnapshot.surplusShotAimRecenterDirection;
    if (
      !surplusRecenterDirection ||
      typeof surplusRecenterDirection.x !== "number" ||
      !isFinite(surplusRecenterDirection.x) ||
      typeof surplusRecenterDirection.y !== "number" ||
      !isFinite(surplusRecenterDirection.y)
    ) {
      throw new Error("Shooter surplus aim recenter requires a finite surplusShotAimRecenterDirection.");
    }

    shooterPanel.__lastSurplusAimRecenterRevision = surplusRecenterRevision;
    shooterNode.angle = computeShooterAngle(surplusRecenterDirection);
    this._playShooterAimRecenter(shooterPanel, shooterNode, revision);
    return;
  }

  if (!shooterPanel.__shooterAimRecenterInProgress) {
    shooterNode.angle = targetAngle;
  }
};

LevelRenderer.prototype._playShooterAimRecenter = function (shooterPanel, shooterNode, revision) {
  var fromAngle = shooterNode.angle;
  if (Math.abs(fromAngle) < 0.01) {
    shooterNode.angle = 0;
    return;
  }

  shooterNode.stopAllActions();
  shooterPanel.__shooterAimRecenterInProgress = true;

  shooterNode.runAction(cc.sequence(
    cc.rotateTo(SHOOTER_AIM_RECENTER_DURATION, 0).easing(cc.easeSineOut()),
    cc.callFunc(function () {
      if (shooterPanel.__lastAimRecenterRevision !== revision) {
        throw new Error("Shooter aim recenter revision changed before animation completed.");
      }
      shooterPanel.__shooterAimRecenterInProgress = false;
      shooterNode.angle = 0;
    })
  ));
};

LevelRenderer.prototype._playShooterBallHandoff = function (
  shooterPanel,
  currentAnchor,
  nextAnchor,
  promotedBallLike,
  nextBallLike,
  revision
) {
  var handoffNode = getOrCreateChild(shooterPanel, "NextBallHandoff");
  handoffNode.stopAllActions();
  handoffNode.active = true;
  handoffNode.opacity = 255;
  handoffNode.setScale(1);
  handoffNode.setPosition(nextAnchor.x, nextAnchor.y);
  this._applyBallVisualCached(handoffNode, promotedBallLike, NEXT_SHOT_BUBBLE_SIZE);

  currentAnchor.active = false;
  nextAnchor.active = false;
  shooterPanel.__shooterHandoffInProgress = true;

  var deltaX = currentAnchor.x - nextAnchor.x;
  var deltaY = currentAnchor.y - nextAnchor.y;
  var controlPoint1 = cc.v2(
    nextAnchor.x + deltaX * 0.34,
    nextAnchor.y + deltaY * 0.34 + SHOOTER_HANDOFF_ARC_HEIGHT
  );
  var controlPoint2 = cc.v2(
    nextAnchor.x + deltaX * 0.72,
    nextAnchor.y + deltaY * 0.72 + SHOOTER_HANDOFF_ARC_HEIGHT
  );
  var destination = cc.v2(currentAnchor.x, currentAnchor.y);
  var targetScale = BOARD_BUBBLE_SIZE.width / NEXT_SHOT_BUBBLE_SIZE.width;

  handoffNode.runAction(cc.sequence(
    cc.spawn(
      cc.bezierTo(
        SHOOTER_HANDOFF_DURATION,
        [controlPoint1, controlPoint2, destination]
      ).easing(cc.easeSineInOut()),
      cc.scaleTo(SHOOTER_HANDOFF_DURATION, targetScale)
    ),
    cc.callFunc(function () {
      if (shooterPanel.__lastQueueAdvanceRevision !== revision) {
        throw new Error("Shooter handoff revision changed before animation completed.");
      }
      handoffNode.active = false;
      handoffNode.setScale(1);
      shooterPanel.__shooterHandoffInProgress = false;
      currentAnchor.active = !!promotedBallLike;
      nextAnchor.active = !!nextBallLike;
    })
  ));
};

LevelRenderer.prototype._syncShooterGuideDots = function (shooterPanel, shooterSnapshot, activeProjectile) {
  var guideDots = getOrCreateChild(shooterPanel, "GuideDots");
  var currentBall = shooterSnapshot ? shooterSnapshot.currentBall : null;
  if (currentBall) {
    if (currentBall.ballCategory === "normal") {
      if (currentBall.entityCategory !== "normal_ball") {
        throw new Error("Guide dot normal ball requires entityCategory normal_ball.");
      }
      if (typeof currentBall.color !== "string" || !GUIDE_DOT_TINTS[currentBall.color]) {
        throw new Error("Guide dot normal ball requires a supported color.");
      }
      this.lastGuideDotColorCode = currentBall.color;
    } else if (currentBall.ballCategory === "skill") {
      if (currentBall.entityCategory !== "skill_ball" ||
        (currentBall.entityType !== "rainbow" && currentBall.entityType !== "blast")) {
        throw new Error("Guide dot skill ball requires a supported firing powerup.");
      }
    } else {
      throw new Error("Guide dot current ball requires normal or skill ballCategory.");
    }
  }
  var trajectory = shooterSnapshot ? shooterSnapshot.trajectory : null;
  var hasTrajectory = !!(
    trajectory &&
    trajectory.valid &&
    trajectory.pathPoints &&
    trajectory.pathPoints.length >= 2
  );
  var guidePath = null;
  if (hasTrajectory) {
    var aimGuidePath = shooterSnapshot && Array.isArray(shooterSnapshot.aimGuidePath)
      ? shooterSnapshot.aimGuidePath
      : null;
    guidePath = aimGuidePath && aimGuidePath.length >= 2
      ? aimGuidePath
      : trajectory.pathPoints;
    // 辅助线最长只显示到“幽灵球与上方碰撞球之间”的碰撞前端位置，且不超过实际命中点。
    var frontDistance = resolveGuideFrontClipDistance(trajectory);
    if (guidePath && frontDistance !== null) {
      guidePath = clipGuidePathToDistance(guidePath, frontDistance);
    }
  }

  var shouldShowGuide = !activeProjectile &&
    !!(shooterSnapshot && shooterSnapshot.isAiming) &&
    !!(guidePath && guidePath.length >= 2);

  if (shouldShowGuide) {
    if (!this.lastGuideDotColorCode || !GUIDE_DOT_TINTS[this.lastGuideDotColorCode]) {
      throw new Error("Visible guide dots require a previously resolved normal ball color.");
    }
    var guideKey = buildGuidePathKey(guidePath) + "|" + this.lastGuideDotColorCode;
    guideDots.active = true;
    if (!this.lastGuideDotsVisible || guideKey !== this.lastGuidePathKey) {
      this._renderGuideDots(guideDots, guidePath, this.lastGuideDotColorCode);
      this.lastGuidePathKey = guideKey;
    }
    this.lastGuideDotsVisible = true;
  } else if (this.lastGuideDotsVisible) {
    guideDots.active = false;
    this._renderGuideDots(guideDots, null);
    this.lastGuideDotsVisible = false;
    this.lastGuidePathKey = "";
  } else {
    guideDots.active = false;
  }
};

LevelRenderer.prototype._renderShooterAimAngleOnly = function (shooterSnapshot, activeProjectile) {
  if (!this.layers || !this.layers.shooter) {
    throw new Error("Shooter aim angle refresh requires shooter layer.");
  }
  if (!shooterSnapshot || !shooterSnapshot.aim) {
    throw new Error("Shooter aim angle refresh requires shooter aim.");
  }

  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    throw new Error("Shooter aim angle refresh requires ShooterPanel.");
  }

  var aim = shooterSnapshot.aim;
  var layoutNodes = syncShooterPrefabLayout(shooterPanel, aim.origin);
  var shooterNode = layoutNodes.Shooter;
  if (shooterPanel.__shooterAimRecenterInProgress) {
    shooterNode.stopAllActions();
    shooterPanel.__shooterAimRecenterInProgress = false;
  }
  shooterNode.angle = computeShooterAngle(aim.direction);
  // 轻量刷新只跳过炮台 UI 重绘，辅助线仍按当前轨迹每帧更新。
  this._syncShooterGuideDots(shooterPanel, shooterSnapshot, activeProjectile);
};

LevelRenderer.prototype._updateProjectileOnly = function (activeProjectile) {
  if (!this.layers || !this.layers.shooter) {
    throw new Error("Projectile refresh requires shooter layer.");
  }
  if (!activeProjectile || !activeProjectile.position) {
    throw new Error("Projectile refresh requires active projectile position.");
  }

  var projectileNode = getOrCreateChild(this.layers.shooter, "ActiveProjectile");
  projectileNode.active = true;
  projectileNode.setPosition(activeProjectile.position.x, activeProjectile.position.y);
  projectileNode.setScale(1);
  this._applyBallVisualCached(
    projectileNode,
    activeProjectile.ball || activeProjectile.color,
    BOARD_BUBBLE_SIZE
  );
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

LevelRenderer.prototype._renderGuideDots = function (guideContainer, pathPoints, colorCode) {
  var guideCanvas = getOrCreateChild(guideContainer, "GuideDotsCanvas");
  var dotFrame = this.spriteFrameCache[GUIDE_DOT_SPRITE_PATH];
  if (!dotFrame || !pathPoints || pathPoints.length < 2) {
    this._setGuideDotsActiveCount(guideCanvas, 0, dotFrame, null);
    return;
  }
  var dotTint = GUIDE_DOT_TINTS[colorCode];
  if (!dotTint) {
    throw new Error("Guide dot tint is missing for color: " + colorCode);
  }

  var positions = [];
  var walkedDistance = 0;
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
        y: from.y + dy * t,
        distance: walkedDistance + segmentLength * t
      });
    }
    walkedDistance += segmentLength;
  }

  if (positions.length > GUIDE_DOT_MAX_COUNT) {
    var sampled = [];
    var sampleStep = positions.length / GUIDE_DOT_MAX_COUNT;
    for (var sampleIndex = 0; sampleIndex < GUIDE_DOT_MAX_COUNT; sampleIndex += 1) {
      sampled.push(positions[Math.floor(sampleIndex * sampleStep)]);
    }
    positions = sampled;
  }

  var maxDistance = positions[positions.length - 1].distance;
  var nearScale = 1;
  var farScale = GUIDE_DOT_FAR_SCALE;
  var scaleSpan = nearScale - farScale;

  this._setGuideDotsActiveCount(guideCanvas, positions.length, dotFrame, dotTint);
  for (var pointIndex = 0; pointIndex < positions.length; pointIndex += 1) {
    var dotNode = this.guideDotNodes[pointIndex];
    if (!dotNode || !cc.isValid(dotNode)) {
      throw new Error("Guide dot node is missing after allocation: " + pointIndex);
    }
    var point = positions[pointIndex];
    dotNode.setPosition(point.x, point.y);
    var distanceRatio = maxDistance > 0.0001 ? point.distance / maxDistance : 0;
    dotNode.scale = nearScale - scaleSpan * distanceRatio;
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
}

module.exports = attachLevelRendererSceneShooterMethods;
