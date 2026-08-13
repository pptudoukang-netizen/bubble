"use strict";

function attachLevelRendererSceneStarHudMethods(LevelRenderer, context) {
  var HUD_STAR_MARKER_FALLBACK_RATIOS = context.HUD_STAR_MARKER_FALLBACK_RATIOS;
  var HUD_STAR_PARTICLE_DURATION = context.HUD_STAR_PARTICLE_DURATION;
  var HUD_STAR_PARTICLE_HOLD_DURATION = context.HUD_STAR_PARTICLE_HOLD_DURATION;
  var HUD_STAR_PARTICLE_NODE_NAME = context.HUD_STAR_PARTICLE_NODE_NAME;
  var HUD_STAR_PUNCH_DOWN_DURATION = context.HUD_STAR_PUNCH_DOWN_DURATION;
  var HUD_STAR_PUNCH_SCALE = context.HUD_STAR_PUNCH_SCALE;
  var HUD_STAR_PUNCH_UP_DURATION = context.HUD_STAR_PUNCH_UP_DURATION;
  var HUD_STAR_RESOURCES = context.HUD_STAR_RESOURCES;
  var attachLevelRendererSceneStarHudMethods = context.attachLevelRendererSceneStarHudMethods;
  var clamp = context.clamp;
  var ensureSprite = context.ensureSprite;
  var getOrCreateChild = context.getOrCreateChild;
  var requireChildNode = context.requireChildNode;

LevelRenderer.prototype._alignHudPanelToTop = function (panel) {
  // Keep for backward compatibility. HudPanel positioning is now driven by GameView's SafeArea+Widget.
  return;
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

  var spritePath = lit ? HUD_STAR_RESOURCES.lit : HUD_STAR_RESOURCES.unlit;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD star sprite frame is missing: " + spritePath);
  }

  starNode.active = true;
  ensureSprite(starNode, spriteFrame);
  starNode.color = cc.color(255, 255, 255);
  starNode.opacity = 255;
};

LevelRenderer.prototype._getGameViewNode = function () {
  if (!this.layers || !this.layers.hud) {
    return null;
  }

  return this.layers.hud.getChildByName("GameView");
};

LevelRenderer.prototype._getHudStarParticleNode = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for HUD star particle.");
  }

  var particleNode = gameViewNode.getChildByName(HUD_STAR_PARTICLE_NODE_NAME);
  if (!particleNode || !particleNode.isValid) {
    throw new Error("GameView requires starParticle node.");
  }
  particleNode.zIndex = 1000;
  return particleNode;
};

LevelRenderer.prototype._convertNodePositionToGameView = function (node) {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for coordinate conversion.");
  }
  if (!node || !node.isValid || !node.parent || !node.parent.isValid) {
    throw new Error("Valid source node is required for coordinate conversion.");
  }

  var worldPosition = node.parent.convertToWorldSpaceAR(node.getPosition());
  return gameViewNode.convertToNodeSpaceAR(worldPosition);
};

LevelRenderer.prototype._resolveShooterParticleStartPosition = function () {
  var shooterPanel = this.layers && this.layers.shooter
    ? this.layers.shooter.getChildByName("ShooterPanel")
    : null;
  if (!shooterPanel || !shooterPanel.isValid) {
    throw new Error("ShooterPanel is required for HUD star particle start position.");
  }

  var shooterNode = requireChildNode(shooterPanel, "CurrentBallAnchor", "ShooterPanel");
  return this._convertNodePositionToGameView(shooterNode);
};

LevelRenderer.prototype._buildHudStarBezierPoints = function (startPosition, endPosition) {
  if (!startPosition || !endPosition) {
    throw new Error("HUD star particle bezier requires start and end positions.");
  }

  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  return [
    cc.v2(startPosition.x + deltaX * 0.28, startPosition.y + Math.max(120, deltaY * 0.28)),
    cc.v2(startPosition.x + deltaX * 0.72, endPosition.y + Math.max(80, Math.abs(deltaX) * 0.12)),
    cc.v2(endPosition.x, endPosition.y)
  ];
};

LevelRenderer.prototype._playHudStarPunch = function (starNode) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star punch requires a valid star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star punch requires cc.tween.");
  }

  starNode.stopAllActions();
  starNode.scale = 1;
  cc.tween(starNode)
    .to(HUD_STAR_PUNCH_UP_DURATION, { scale: HUD_STAR_PUNCH_SCALE })
    .to(HUD_STAR_PUNCH_DOWN_DURATION, { scale: 1 })
    .start();
};

LevelRenderer.prototype._playHudStarParticleToStar = function (starNode, onArrive, onComplete) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star particle requires a valid target star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star particle requires cc.tween.");
  }

  var particleNode = this._getHudStarParticleNode();
  var particleSystem = particleNode.getComponent(cc.ParticleSystem);
  if (!particleSystem) {
    throw new Error("GameView.starParticle requires cc.ParticleSystem.");
  }

  var startPosition = this._resolveShooterParticleStartPosition();
  var endPosition = this._convertNodePositionToGameView(starNode);
  particleNode.stopAllActions();
  particleNode.active = true;
  particleNode.setPosition(startPosition);
  if (typeof particleSystem.resetSystem !== "function") {
    throw new Error("GameView.starParticle ParticleSystem requires resetSystem.");
  }
  particleSystem.resetSystem();

  var bezierPoints = this._buildHudStarBezierPoints(startPosition, endPosition);
  cc.tween(particleNode)
    .bezierTo(
      HUD_STAR_PARTICLE_DURATION,
      bezierPoints[0],
      bezierPoints[1],
      bezierPoints[2]
    )
    .call(function () {
      if (typeof onArrive === "function") {
        onArrive();
      }
    })
    .delay(HUD_STAR_PARTICLE_HOLD_DURATION)
    .call(function () {
      if (typeof particleSystem.stopSystem === "function") {
        particleSystem.stopSystem();
      }
      particleNode.active = false;
      if (typeof onComplete === "function") {
        onComplete();
      }
    })
    .start();
};

LevelRenderer.prototype._runHudStarAnimationQueue = function () {
  this._ensureHudStarAnimationState();
  if (this.hudStarAnimationActive) {
    return;
  }
  if (this.hudStarAnimationQueue.length === 0) {
    return;
  }

  var item = this.hudStarAnimationQueue.shift();
  if (!item || !item.starNode || !item.starNode.isValid) {
    throw new Error("HUD star animation queue contains invalid target.");
  }

  this.hudStarAnimationActive = true;
  this._playHudStarParticleToStar(item.starNode, function () {
    this._setHudStarLit(item.starNode, true);
    this.hudStarDisplayedRating = Math.max(
      Math.floor(Number(this.hudStarDisplayedRating) || 0),
      Math.floor(Number(item.rating) || 0)
    );
    this._playHudStarPunch(item.starNode);
  }.bind(this), function () {
    this.hudStarAnimationActive = false;
    this._runHudStarAnimationQueue();
  }.bind(this));
};

LevelRenderer.prototype._queueHudStarUnlockAnimations = function (starNodes, nextRating) {
  this._ensureHudStarAnimationState();
  if (!Array.isArray(starNodes)) {
    throw new Error("HUD star unlock animation requires star nodes.");
  }
  var queuedRating = Math.max(0, Math.floor(Number(this.hudStarQueuedRating) || 0));
  if (nextRating <= queuedRating) {
    return;
  }

  for (var index = queuedRating; index < nextRating; index += 1) {
    var starNode = starNodes[index];
    if (!starNode || !starNode.isValid) {
      throw new Error("HUD star node is missing for rating index " + index + ".");
    }
    this.hudStarAnimationQueue.push({
      starNode: starNode,
      rating: index + 1
    });
  }
  this.hudStarQueuedRating = nextRating;
  this._runHudStarAnimationQueue();
};

LevelRenderer.prototype._resolveHudStarMarkerRatios = function (winStats) {
  var thresholds = winStats && winStats.starThresholds ? winStats.starThresholds : null;
  var star1 = Math.max(0, Number(thresholds && thresholds.star1) || 0);
  var star2 = Math.max(0, Number(thresholds && thresholds.star2) || 0);
  var star3 = Math.max(0, Number(thresholds && thresholds.star3) || 0);

  if (star3 <= 0) {
    return HUD_STAR_MARKER_FALLBACK_RATIOS.slice();
  }

  return [
    clamp(star1 / star3, 0, 1),
    clamp(star2 / star3, 0, 1),
    1
  ];
};

LevelRenderer.prototype._layoutHudStarMarkers = function (panel, winStats, starNodes) {
  var progressBar = this._getHudProgressBar(panel);
  if (!progressBar || !Array.isArray(starNodes) || !starNodes.length) {
    return;
  }

  var progressNode = progressBar.node || null;
  var progressSize = progressNode && progressNode.getContentSize
    ? progressNode.getContentSize()
    : null;
  var totalLength = Math.max(
    0,
    Number(progressBar.totalLength) ||
      (progressSize ? Number(progressSize.width) : 0) ||
      Number(progressNode && progressNode.width) ||
      0
  );
  if (totalLength <= 0) {
    return;
  }

  var markerRatios = this._resolveHudStarMarkerRatios(winStats);
  starNodes.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    var markerX = Math.round(totalLength * markerRatios[index] * 1000) / 1000;
    starNode.setPosition(markerX, starNode.y || 0);
  });
};

LevelRenderer.prototype._renderHudStarProgress = function (panel, runtimeSnapshot) {
  this._ensureHudStarAnimationState();
  var progressBar = this._getHudProgressBar(panel);
  var winStats = runtimeSnapshot && runtimeSnapshot.winStats ? runtimeSnapshot.winStats : null;
  var starProgress = winStats ? clamp(Number(winStats.starProgress) || 0, 0, 1) : 0;
  var starRating = winStats ? clamp(Math.floor(Number(winStats.starRating) || 0), 0, 3) : 0;

  if (progressBar) {
    progressBar.progress = starProgress;
  }

  var starNodes = this._getHudStarNodes(panel);
  this._layoutHudStarMarkers(panel, winStats, starNodes);
  if (this.lastHudStarRating === null) {
    this.lastHudStarRating = starRating;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    starNodes.forEach(function (starNode, index) {
      this._setHudStarLit(starNode, index < starRating);
    }, this);
    return;
  }

  var displayedRating = Math.max(0, Math.floor(Number(this.hudStarDisplayedRating) || 0));
  if (starRating < displayedRating) {
    this.hudStarAnimationQueue = [];
    this.hudStarAnimationActive = false;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    displayedRating = starRating;
  }

  starNodes.forEach(function (starNode, index) {
    this._setHudStarLit(starNode, index < displayedRating);
  }, this);
  this.lastHudStarRating = starRating;
  this._queueHudStarUnlockAnimations(starNodes, starRating);
};
}

module.exports = attachLevelRendererSceneStarHudMethods;
