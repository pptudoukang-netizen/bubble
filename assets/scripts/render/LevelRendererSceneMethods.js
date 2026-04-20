"use strict";

function attachLevelRendererSceneMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var JAR_RESOURCES = deps.JAR_RESOURCES;
  var JAR_MASK_RESOURCES = deps.JAR_MASK_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JAR_RENDER_Y_OFFSET = deps.JAR_RENDER_Y_OFFSET;
  var GUIDE_DOT_SPACING = deps.GUIDE_DOT_SPACING;
  var GUIDE_DOT_RADIUS = deps.GUIDE_DOT_RADIUS;
  var GUIDE_DOT_SIZE = deps.GUIDE_DOT_SIZE;
  var GUIDE_DOT_MAX_COUNT = deps.GUIDE_DOT_MAX_COUNT;
  var GUIDE_DOT_SPRITE_PATH = deps.GUIDE_DOT_SPRITE_PATH;
  var GUIDE_DOT_PULSE_DURATION = deps.GUIDE_DOT_PULSE_DURATION;
  var GUIDE_DOT_PULSE_SCALE_LARGE = deps.GUIDE_DOT_PULSE_SCALE_LARGE;
  var GUIDE_DOT_PULSE_SCALE_SMALL = deps.GUIDE_DOT_PULSE_SCALE_SMALL;
  var TEST_SLOT_RADIUS = deps.TEST_SLOT_RADIUS;
  var ICE_OVERLAY_OPACITY = deps.ICE_OVERLAY_OPACITY;
  var REMAINING_SHOTS_OFFSET_Y = deps.REMAINING_SHOTS_OFFSET_Y;
  var NEXT_SHOT_OFFSET_X = deps.NEXT_SHOT_OFFSET_X;
  var NEXT_SHOT_OFFSET_Y = deps.NEXT_SHOT_OFFSET_Y;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var NEXT_SHOT_BUBBLE_SIZE = deps.NEXT_SHOT_BUBBLE_SIZE;
  var JAR_RENDER_SIZE = deps.JAR_RENDER_SIZE;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
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
  var IMPACT_DEFAULT_PUSH_DISTANCE = deps.IMPACT_DEFAULT_PUSH_DISTANCE;
  var IMPACT_MIN_PUSH_DURATION = deps.IMPACT_MIN_PUSH_DURATION;
  var IMPACT_MIN_RETURN_DURATION = deps.IMPACT_MIN_RETURN_DURATION;
  var IMPACT_RETURN_DURATION_RATIO = deps.IMPACT_RETURN_DURATION_RATIO;
  var ROUTE_LINE_WIDTH_ACTIVE = deps.ROUTE_LINE_WIDTH_ACTIVE;
  var ROUTE_LINE_WIDTH_IDLE = deps.ROUTE_LINE_WIDTH_IDLE;
  var ROUTE_POINT_RADIUS_ACTIVE = deps.ROUTE_POINT_RADIUS_ACTIVE;
  var ROUTE_POINT_RADIUS_IDLE = deps.ROUTE_POINT_RADIUS_IDLE;
  var loadSpriteFrame = deps.loadSpriteFrame;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildObjectiveDisplayData = deps.buildObjectiveDisplayData;
  var buildStateText = deps.buildStateText;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var buildHudRenderKey = deps.buildHudRenderKey;
  var buildJarRenderKey = deps.buildJarRenderKey;
  var buildGuidePathKey = deps.buildGuidePathKey;
  var clipGuidePathToDistance = deps.clipGuidePathToDistance;
  var resolveImpactBounceSpeed = deps.resolveImpactBounceSpeed;
  var getJarBaseY = deps.getJarBaseY;
  var resolveBallCode = deps.resolveBallCode;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var computeShooterAngle = deps.computeShooterAngle;
  var createRouteColor = deps.createRouteColor;
  var clamp = deps.clamp;
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

}

module.exports = attachLevelRendererSceneMethods;
