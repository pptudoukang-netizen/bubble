"use strict";

function attachLevelRendererSceneBoardMethods(LevelRenderer, deps) {
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var ICE_OVERLAY_OPACITY = deps.ICE_OVERLAY_OPACITY;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var TEST_SLOT_RADIUS = deps.TEST_SLOT_RADIUS;
  var FairyAssistConfig = deps.FairyAssistConfig;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var DROP_COLLISION_GLOW_NODE_NAME = "DropCollisionGlow";
  var DROP_GLOW_UV_EPSILON = 0.000001;
  var DROP_GLOW_UV_CORNER_EPSILON = 0.0001;

  function requireFiniteNumber(value, fieldName) {
    var numberValue = Number(value);
    if (!isFinite(numberValue)) {
      throw new Error(fieldName + " must be finite.");
    }
    return numberValue;
  }

  function requirePositiveSize(size, fieldName) {
    if (
      !size ||
      typeof size.width !== "number" ||
      !isFinite(size.width) ||
      size.width <= 0 ||
      typeof size.height !== "number" ||
      !isFinite(size.height) ||
      size.height <= 0
    ) {
      throw new Error(fieldName + " must be a positive size.");
    }
    return size;
  }

  function buildDropGlowUvBasis(spriteFrame) {
    if (!spriteFrame || !spriteFrame.isValid) {
      throw new Error("Drop collision glow requires valid SpriteFrame.");
    }
    var uv = spriteFrame.uv;
    if (!uv || uv.length < 8) {
      throw new Error("Drop collision glow requires four UV corners.");
    }

    var originX = requireFiniteNumber(uv[0], "Drop collision glow UV origin x");
    var originY = requireFiniteNumber(uv[1], "Drop collision glow UV origin y");
    var axisXX = requireFiniteNumber(uv[2], "Drop collision glow UV right x") - originX;
    var axisXY = requireFiniteNumber(uv[3], "Drop collision glow UV right y") - originY;
    var axisYX = requireFiniteNumber(uv[4], "Drop collision glow UV top x") - originX;
    var axisYY = requireFiniteNumber(uv[5], "Drop collision glow UV top y") - originY;
    var axisXLengthSquared = axisXX * axisXX + axisXY * axisXY;
    var axisYLengthSquared = axisYX * axisYX + axisYY * axisYY;
    if (axisXLengthSquared <= DROP_GLOW_UV_EPSILON || axisYLengthSquared <= DROP_GLOW_UV_EPSILON) {
      throw new Error("Drop collision glow UV basis is degenerate.");
    }

    var expectedTopRightX = originX + axisXX + axisYX;
    var expectedTopRightY = originY + axisXY + axisYY;
    if (
      Math.abs(expectedTopRightX - Number(uv[6])) > DROP_GLOW_UV_CORNER_EPSILON ||
      Math.abs(expectedTopRightY - Number(uv[7])) > DROP_GLOW_UV_CORNER_EPSILON
    ) {
      throw new Error("Drop collision glow UV corners must form a parallelogram.");
    }

    return {
      originAxisX: cc.v4(originX, originY, axisXX, axisXY),
      axisY: cc.v4(axisYX, axisYY, axisXLengthSquared, axisYLengthSquared)
    };
  }

  function resolveDropGlowSpriteTarget(dropNode) {
    if (!dropNode || !dropNode.isValid) {
      throw new Error("Drop collision glow requires falling drop node.");
    }
    var iconNode = dropNode.getChildByName("Icon");
    var iconSprite = iconNode && iconNode.isValid ? iconNode.getComponent(cc.Sprite) : null;
    if (iconSprite && iconSprite.spriteFrame) {
      return {
        node: iconNode,
        sprite: iconSprite
      };
    }

    var rootSprite = dropNode.getComponent(cc.Sprite);
    if (rootSprite && rootSprite.spriteFrame) {
      return {
        node: dropNode,
        sprite: rootSprite
      };
    }

    throw new Error("Drop collision glow requires a rendered SpriteFrame on the falling drop.");
  }

  function hideDropCollisionGlowFrom(parentNode) {
    if (!parentNode || !parentNode.isValid) {
      return;
    }
    var glowNode = parentNode.getChildByName(DROP_COLLISION_GLOW_NODE_NAME);
    if (!glowNode) {
      return;
    }
    glowNode.active = false;
    glowNode.opacity = 255;
  }

  function hideDropCollisionGlow(dropNode) {
    hideDropCollisionGlowFrom(dropNode);
    var iconNode = dropNode && dropNode.isValid ? dropNode.getChildByName("Icon") : null;
    hideDropCollisionGlowFrom(iconNode);
  }

  function requireDropCollisionGlowEffect(renderer) {
    if (!renderer || !renderer.dropCollisionGlowEffectAsset || !renderer.dropCollisionGlowEffectAsset.isValid) {
      throw new Error("Drop collision glow effect must be preloaded before rendering.");
    }
    if (!cc.Material || typeof cc.Material.create !== "function") {
      throw new Error("Drop collision glow requires cc.Material.create.");
    }
    return renderer.dropCollisionGlowEffectAsset;
  }

  function ensureDropCollisionGlowNode(targetNode) {
    var glowNode = targetNode.getChildByName(DROP_COLLISION_GLOW_NODE_NAME);
    if (!glowNode) {
      glowNode = new cc.Node(DROP_COLLISION_GLOW_NODE_NAME);
      glowNode.parent = targetNode;
      glowNode.setPosition(0, 0);
      glowNode.zIndex = 12;
    }
    var glowSprite = glowNode.getComponent(cc.Sprite);
    if (!glowSprite) {
      glowSprite = glowNode.addComponent(cc.Sprite);
    }
    if (!glowSprite) {
      throw new Error("Drop collision glow node requires cc.Sprite.");
    }
    return {
      node: glowNode,
      sprite: glowSprite
    };
  }

  function applyDropCollisionGlow(renderer, dropNode, drop) {
    if (!drop || !Number.isInteger(drop.glowStacks) || drop.glowStacks < 0) {
      throw new Error("Falling drop glowStacks must be a non-negative integer.");
    }
    var visualStacks = Math.min(drop.glowStacks, FairyAssistConfig.maxGlowStacks);
    if (visualStacks === 0) {
      hideDropCollisionGlow(dropNode);
      return;
    }

    var target = resolveDropGlowSpriteTarget(dropNode);
    var spriteFrame = target.sprite.spriteFrame;
    var glow = ensureDropCollisionGlowNode(target.node);
    var effectAsset = requireDropCollisionGlowEffect(renderer);
    if (!glow.node.__dropCollisionGlowMaterial || glow.node.__dropCollisionGlowEffectAsset !== effectAsset) {
      var material = cc.Material.create(effectAsset);
      if (!material) {
        throw new Error("Drop collision glow material creation failed.");
      }
      glow.node.__dropCollisionGlowMaterial = glow.sprite.setMaterial(0, material);
      glow.node.__dropCollisionGlowEffectAsset = effectAsset;
    }
    var glowMaterial = glow.node.__dropCollisionGlowMaterial;
    if (!glowMaterial) {
      throw new Error("Drop collision glow material is missing.");
    }

    var targetSize = requirePositiveSize(target.node.getContentSize(), "Drop collision glow target size");
    var levelRatio = visualStacks / FairyAssistConfig.maxGlowStacks;
    var uvBasis = buildDropGlowUvBasis(spriteFrame);
    ensureSprite(glow.node, spriteFrame);
    glow.node.setContentSize(targetSize);
    glow.node.active = true;
    glow.node.opacity = 255;
    glow.node.setScale(1);
    glowMaterial.setProperty("uvOriginAxisX", uvBasis.originAxisX);
    glowMaterial.setProperty("uvAxisY", uvBasis.axisY);
    glowMaterial.setProperty("glowColor", cc.v4(1, 0.72, 0.18, 1));
    glowMaterial.setProperty(
      "glowParams",
      cc.v4(
        levelRatio,
        (2.2 + levelRatio * 3.4) / Math.max(targetSize.width, targetSize.height),
        0.32 + levelRatio * 0.58,
        0.52 + levelRatio * 0.58
      )
    );
  }

  function isBoardSpecialPrefabCell(cell) {
    return !!(
      cell &&
      (
        cell.entityType === "molotov" ||
        cell.entityType === "splitter" ||
        cell.entityType === "locked" ||
        cell.entityType === "key"
      )
    );
  }

  function buildBoardCellRenderKey(cell, boardSnapshot) {
    if (!cell || !cell.id) {
      throw new Error("Board cell render key requires cell id.");
    }
    if (!boardSnapshot || typeof boardSnapshot !== "object") {
      throw new Error("Board cell render key requires board snapshot.");
    }
    return [
      String(cell.id),
      cell.row,
      cell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY,
      resolveBoardBubblePrefabPath(cell),
      resolveBallVisualKey(cell)
    ].join("|");
  }

  function resolveBoardBubblePrefabPath(cell) {
    if (!cell || !isBoardSpecialPrefabCell(cell)) {
      return PREFAB_PATHS.bubbleItem;
    }
    if (cell.entityType === "molotov") {
      return PREFAB_PATHS.fireBubbleItem;
    }
    if (cell.entityType === "splitter") {
      return PREFAB_PATHS.splitBubbleItem;
    }
    if (cell.entityType === "locked") {
      return PREFAB_PATHS.lockingBubbleItem;
    }
    if (cell.entityType === "key") {
      return PREFAB_PATHS.keyBubbleItem;
    }
    throw new Error("Unsupported board special prefab entityType: " + cell.entityType);
  }

  function getNodePool(poolMap, prefabPath) {
    if (!poolMap || typeof poolMap !== "object" || Array.isArray(poolMap)) {
      throw new Error("Board node pool map is required.");
    }
    if (typeof prefabPath !== "string" || !prefabPath) {
      throw new Error("Board node pool prefabPath is required.");
    }
    if (!Array.isArray(poolMap[prefabPath])) {
      poolMap[prefabPath] = [];
    }
    return poolMap[prefabPath];
  }

  function requireVisualChild(node, childName, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    var child = node.getChildByName(childName);
    if (!child || !child.isValid) {
      throw new Error(ownerName + " requires child `" + childName + "`.");
    }
    return child;
  }

  function restoreSpriteNodeVisible(node, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    node.active = true;
    node.opacity = 255;
    var sprite = node.getComponent(cc.Sprite);
    if (sprite) {
      sprite.enabled = true;
    }
  }

  function restoreGenericBubbleVisualState(node) {
    restoreSpriteNodeVisible(node, "Bubble visual");
    var iconNode = node.getChildByName("Icon");
    if (iconNode && iconNode.isValid) {
      restoreSpriteNodeVisible(iconNode, "Bubble visual Icon");
    }
  }

  function rebindKeyBubbleVisual(renderer, node) {
    restoreSpriteNodeVisible(node, "KeyBubbleItem");
    var iconNode = requireVisualChild(node, "Icon", "KeyBubbleItem");
    iconNode.active = true;
    var keyNode = requireVisualChild(node, "key", "KeyBubbleItem");
    restoreSpriteNodeVisible(keyNode, "KeyBubbleItem key");

    var keyFrame = renderer.spriteFrameCache[BALL_RESOURCES.KEY];
    if (!keyFrame) {
      throw new Error("Missing preloaded KeyBubbleItem sprite frame: " + BALL_RESOURCES.KEY);
    }
    ensureSprite(keyNode, keyFrame);
  }

  function restoreBoardBubbleVisualState(renderer, node, cell) {
    if (cell && cell.entityType === "key") {
      rebindKeyBubbleVisual(renderer, node);
      return;
    }
    restoreGenericBubbleVisualState(node);
    if (cell && cell.entityType === "locked") {
      var lockNode = requireVisualChild(node, "lock", "LockingBubbleItem");
      restoreSpriteNodeVisible(lockNode, "LockingBubbleItem lock");
    }
  }

  function instantiateRequired(prefabFactory, prefabPath, parent, name, ownerName) {
    if (!prefabFactory || typeof prefabFactory.instantiate !== "function") {
      throw new Error(ownerName + " requires prefabFactory.instantiate.");
    }
    var node = prefabFactory.instantiate(prefabPath, parent, name);
    if (!node || !node.isValid) {
      throw new Error(ownerName + " prefab instantiate failed: " + prefabPath);
    }
    return node;
  }

  function requireNodePrefabPath(node, ownerName) {
    if (!node || typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error(ownerName + " requires __bubblePrefabPath.");
    }
    return node.__bubblePrefabPath;
  }

LevelRenderer.prototype._renderBoard = function (boardSnapshot) {
  this.lastBoardVersion = boardSnapshot.version;
  this.lastBoardViewportOffsetY = boardSnapshot.viewportOffsetY;
  this.boardRenderTick += 1;
  var currentTick = this.boardRenderTick;
  if (!this.boardCellRenderKeys || typeof this.boardCellRenderKeys !== "object") {
    this.boardCellRenderKeys = {};
  }

  boardSnapshot.cells.forEach(function (cell) {
    var cellId = String(cell.id);
    var renderKey = buildBoardCellRenderKey(cell, boardSnapshot);
    var cachedRenderKey = this.boardCellRenderKeys[cellId];
    var existingNode = this.boardBubbleNodes[cellId];
    if (existingNode && cachedRenderKey === renderKey) {
      existingNode.__boardTick = currentTick;
      if (!existingNode.parent || existingNode.parent !== this.layers.board) {
        existingNode.parent = this.layers.board;
      }
      restoreBoardBubbleVisualState(this, existingNode, cell);
      this._applySplitterSpawnHiddenBoardState(existingNode, cell.id);
      this._applyMolotovBlastHiddenBoardState(existingNode, cell.id);
      return;
    }

    this.boardCellRenderKeys[cellId] = renderKey;
    var cellPosition = BoardLayout.getCellPosition(cell.row, cell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var bubbleNode = this._acquireBoardBubbleNode(cell);
    bubbleNode.__boardTick = currentTick;
    bubbleNode.setPosition(cellPosition.x, cellPosition.y);
    bubbleNode.setScale(1);
    bubbleNode.opacity = 255;
    this._applyBoardBubbleVisualCached(bubbleNode, cell, BOARD_BUBBLE_SIZE);
    this._applySplitterSpawnHiddenBoardState(bubbleNode, cell.id);
    this._applyMolotovBlastHiddenBoardState(bubbleNode, cell.id);
  }, this);

  this._recycleInactiveBoardBubbleNodes(currentTick);
};

LevelRenderer.prototype._acquireBoardBubbleNode = function (cell) {
  if (!cell || !cell.id) {
    throw new Error("Board bubble node requires cell id.");
  }
  var nodeId = String(cell.id);
  var existing = this.boardBubbleNodes[nodeId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(cell);
    if (existing.__bubblePrefabPath !== expectedPath) {
      this._removeBarrierHammerHintNodeByCellId(nodeId);
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(existing, "Board bubble node")).push(existing);
      delete this.boardBubbleNodes[nodeId];
    } else {
      this._resetBubblePrefabNode(existing, cell);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(cell);
  var pool = getNodePool(this.boardBubbleNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Board bubble node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, cell);

  node.name = "Bubble_" + nodeId;
  if (node.parent !== this.layers.board) {
    node.parent = this.layers.board;
  }
  node.active = true;
  node.setScale(1);
  this.boardBubbleNodes[nodeId] = node;
  return node;
};

LevelRenderer.prototype._resetBubblePrefabNode = function (node, cell) {
  if (!node || !node.isValid) {
    throw new Error("Bubble prefab node is required.");
  }
  node.stopAllActions();
  node.angle = 0;
  node.opacity = 255;
  node.active = true;
  restoreBoardBubbleVisualState(this, node, cell);

  if (cell && cell.entityType === "key") {
    requireVisualChild(node, "Icon", "KeyBubbleItem").active = true;
    requireVisualChild(node, "key", "KeyBubbleItem").active = true;
  } else if (cell && cell.entityType === "locked") {
    requireVisualChild(node, "Icon", "LockingBubbleItem").active = true;
    requireVisualChild(node, "lock", "LockingBubbleItem").active = true;
  }
};

LevelRenderer.prototype._applyBoardBubbleVisualCached = function (node, cell, forcedSize) {
  if (!node || !cell) {
    throw new Error("Board bubble visual requires node and cell.");
  }

  if (cell.entityType === "key" || cell.entityType === "molotov") {
    node.__ballVisualKey = "prefab:" + cell.entityType;
    return;
  }

  if (cell.entityType === "locked") {
    if (typeof cell.lockedColor !== "string" || !cell.lockedColor) {
      throw new Error("LockingBubbleItem visual requires lockedColor.");
    }
    this._applyBallVisualCached(node, { color: cell.lockedColor }, forcedSize);
    return;
  }

  if (cell.entityType === "splitter") {
    this._applyBallVisualCached(node, cell, forcedSize);
    return;
  }

  this._applyBallVisualCached(node, cell, forcedSize);
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
    if (this.bubbleShatterRenderer && this.bubbleShatterRenderer.isCellShatterPending(cellId)) {
      continue;
    }

    if (node) {
      this._removeBarrierHammerHintNodeByCellId(cellId);
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(node, "Board bubble node")).push(node);
    }

    delete this.boardBubbleNodes[cellId];
    if (this.boardCellRenderKeys && Object.prototype.hasOwnProperty.call(this.boardCellRenderKeys, cellId)) {
      delete this.boardCellRenderKeys[cellId];
    }
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
    if (!drop.active) {
      return;
    }

    var dropNode = this._acquireFallingDropNode(drop);
    dropNode.__fallingTick = currentTick;
    dropNode.setPosition(drop.position.x, drop.position.y);
    dropNode.angle = drop.rotation || 0;
    dropNode.opacity = 255;
    this._applyBoardBubbleVisualCached(dropNode, drop, BOARD_BUBBLE_SIZE);
    applyDropCollisionGlow(this, dropNode, drop);
  }, this);
  this._recycleInactiveFallingDropNodes(currentTick);
  this.lastRenderedFallingCount = drops.length;
};

LevelRenderer.prototype._acquireFallingDropNode = function (drop) {
  if (!drop || !drop.id) {
    throw new Error("Falling drop node requires drop id.");
  }
  var dropId = String(drop.id);
  var existing = this.fallingDropNodes[dropId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(drop);
    if (existing.__bubblePrefabPath !== expectedPath) {
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(existing, "Falling drop node")).push(existing);
      delete this.fallingDropNodes[dropId];
    } else {
      this._resetBubblePrefabNode(existing, drop);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(drop);
  var pool = getNodePool(this.fallingDropNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Falling drop node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, drop);

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
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(node, "Falling drop node")).push(node);
    }
    delete this.fallingDropNodes[dropId];
  }
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
      var cellPosition = BoardLayout.getCellPosition(row, col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
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


}

module.exports = attachLevelRendererSceneBoardMethods;
