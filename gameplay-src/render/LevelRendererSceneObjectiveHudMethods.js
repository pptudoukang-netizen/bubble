"use strict";

function attachLevelRendererSceneObjectiveHudMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BoardLayout = context.BoardLayout;
  var HUD_SPIRIT_ICON_HEIGHT = context.HUD_SPIRIT_ICON_HEIGHT;
  var MATCHED_TARGET_COLLECT_BEZIER_ARC = context.MATCHED_TARGET_COLLECT_BEZIER_ARC;
  var MATCHED_TARGET_COLLECT_FLY_DURATION = context.MATCHED_TARGET_COLLECT_FLY_DURATION;
  var MATCHED_TARGET_COLLECT_PARTICLE_SIZE = context.MATCHED_TARGET_COLLECT_PARTICLE_SIZE;
  var MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION = context.MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION;
  var MATCHED_TARGET_COLLECT_PUNCH_SCALE = context.MATCHED_TARGET_COLLECT_PUNCH_SCALE;
  var MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION = context.MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION;
  var MATCHED_TARGET_COLLECT_Z_INDEX = context.MATCHED_TARGET_COLLECT_Z_INDEX;
  var applyIceSnowballHudDisplayProgress = context.applyIceSnowballHudDisplayProgress;
  var attachLevelRendererSceneObjectiveHudMethods = context.attachLevelRendererSceneObjectiveHudMethods;
  var buildHudRenderKey = context.buildHudRenderKey;
  var buildHudTargetDisplayData = context.buildHudTargetDisplayData;
  var buildTrappedSpriteResourcePath = context.buildTrappedSpriteResourcePath;
  var ensureSprite = context.ensureSprite;
  var requireChildNode = context.requireChildNode;

  var HUD_TARGET_TEMPLATE_NAME = "item";
  var HUD_TARGET_ICON_NAME = "icon";
  var HUD_TARGET_RUNTIME_CARD_PREFIX = "hud_target_";
  var HUD_TARGET_BALL_CARD_NAME = HUD_TARGET_RUNTIME_CARD_PREFIX + "ball";
  var HUD_TARGET_ICE_BALL_CARD_NAME = HUD_TARGET_RUNTIME_CARD_PREFIX + "ice_ball";

function requireHudTargetSlotName(slotName) {
  if (slotName === "ball" || slotName === "ice_ball" || slotName === "spirit") {
    return slotName;
  }
  throw new Error("Unsupported HUD target slot: " + slotName);
}

function buildHudSpiritCardName(targetId) {
  if (typeof targetId !== "string" || !/^[A-Za-z0-9_-]+$/.test(targetId)) {
    throw new Error("HUD spirit targetId must contain only letters, numbers, underscores, or hyphens.");
  }
  return HUD_TARGET_RUNTIME_CARD_PREFIX + "spirit_" + targetId;
}

LevelRenderer.prototype._getHudTargetLayout = function (panel) {
  return requireChildNode(panel, "target_layout", "HudPanel");
};

LevelRenderer.prototype._getHudTargetTemplate = function (targetLayout) {
  var templateNode = requireChildNode(targetLayout, HUD_TARGET_TEMPLATE_NAME, "HudPanel/target_layout");
  var templateDescription = "HudPanel/target_layout/" + HUD_TARGET_TEMPLATE_NAME;
  var iconNode = requireChildNode(templateNode, HUD_TARGET_ICON_NAME, templateDescription);
  requireChildNode(templateNode, "card_line", templateDescription);
  requireChildNode(iconNode, "TargetValue", templateDescription + "/" + HUD_TARGET_ICON_NAME);
  requireChildNode(iconNode, "complete", templateDescription + "/" + HUD_TARGET_ICON_NAME);
  if (!templateNode.getComponent(cc.Sprite)) {
    throw new Error(templateDescription + " requires cc.Sprite.");
  }
  if (!iconNode.getComponent(cc.Sprite)) {
    throw new Error(templateDescription + "/" + HUD_TARGET_ICON_NAME + " requires cc.Sprite.");
  }
  return templateNode;
};

LevelRenderer.prototype._findHudTargetCard = function (targetLayout, cardName) {
  if (typeof cardName !== "string" || cardName.indexOf(HUD_TARGET_RUNTIME_CARD_PREFIX) !== 0) {
    throw new Error("HUD target runtime card name is invalid.");
  }
  var matchedCard = null;
  targetLayout.children.forEach(function (childNode) {
    if (childNode.name !== cardName) {
      return;
    }
    if (matchedCard) {
      throw new Error("Duplicated HUD target card: " + cardName);
    }
    matchedCard = childNode;
  });
  return matchedCard;
};

LevelRenderer.prototype._buildHudTargetEntries = function (targetDisplay) {
  if (!targetDisplay || typeof targetDisplay !== "object" || Array.isArray(targetDisplay)) {
    throw new Error("HUD target display data must be an object.");
  }
  var entries = [];
  [
    {
      slotName: "ball",
      cardName: HUD_TARGET_BALL_CARD_NAME,
      displayData: targetDisplay.ball
    },
    {
      slotName: "ice_ball",
      cardName: HUD_TARGET_ICE_BALL_CARD_NAME,
      displayData: targetDisplay.iceSnowball
    }
  ].forEach(function (entry) {
    if (entry.displayData !== null && (typeof entry.displayData !== "object" || Array.isArray(entry.displayData))) {
      throw new Error("HUD target display entry must be an object or null: " + entry.slotName);
    }
    if (entry.displayData !== null) {
      entries.push(entry);
    }
  });

  if (!Array.isArray(targetDisplay.spirits)) {
    throw new Error("HUD target display spirits must be an array.");
  }
  var spiritCardNames = {};
  targetDisplay.spirits.forEach(function (displayData, index) {
    if (!displayData || typeof displayData !== "object" || Array.isArray(displayData)) {
      throw new Error("HUD spirit target display entry is invalid at index " + index + ".");
    }
    var cardName = buildHudSpiritCardName(displayData.targetId);
    if (spiritCardNames[cardName] === true) {
      throw new Error("Duplicated HUD spirit target card: " + cardName);
    }
    spiritCardNames[cardName] = true;
    entries.push({
      slotName: "spirit",
      cardName: cardName,
      displayData: displayData
    });
  });
  return entries;
};

LevelRenderer.prototype._syncHudTargetCards = function (targetLayout, entries) {
  if (typeof cc.instantiate !== "function") {
    throw new Error("HUD target dynamic creation requires cc.instantiate.");
  }
  if (!Array.isArray(entries)) {
    throw new Error("HUD target entries must be an array.");
  }
  var templateNode = this._getHudTargetTemplate(targetLayout);
  templateNode.active = false;
  var activeCardNames = {};
  entries.forEach(function (entry) {
    if (activeCardNames[entry.cardName] === true) {
      throw new Error("Duplicated HUD target entry card: " + entry.cardName);
    }
    activeCardNames[entry.cardName] = true;
  });

  targetLayout.children.slice().forEach(function (childNode) {
    if (childNode === templateNode) {
      return;
    }
    if (childNode.name.indexOf(HUD_TARGET_RUNTIME_CARD_PREFIX) !== 0) {
      throw new Error("HudPanel/target_layout contains unexpected runtime child: " + childNode.name);
    }
    if (activeCardNames[childNode.name] !== true) {
      childNode.active = false;
      if (typeof childNode.removeFromParent !== "function" || typeof childNode.destroy !== "function") {
        throw new Error("HUD target card cannot be removed: " + childNode.name);
      }
      childNode.removeFromParent(false);
      childNode.destroy();
    }
  });

  entries.forEach(function (entry, index) {
    var cardNode = this._findHudTargetCard(targetLayout, entry.cardName);
    if (!cardNode) {
      cardNode = cc.instantiate(templateNode);
      if (!cardNode || !cardNode.isValid) {
        throw new Error("Failed to clone HUD target template for card: " + entry.cardName);
      }
      cardNode.name = entry.cardName;
      cardNode.parent = targetLayout;
    }
    cardNode.active = true;
    if (typeof cardNode.setSiblingIndex !== "function") {
      throw new Error("HUD target card requires setSiblingIndex: " + entry.cardName);
    }
    cardNode.setSiblingIndex(index + 1);
  }, this);

  return entries;
};

LevelRenderer.prototype._resolveHudTargetSlot = function (targetLayout, slotName, cardName) {
  requireHudTargetSlotName(slotName);
  var cardNode = this._findHudTargetCard(targetLayout, cardName);
  if (!cardNode) {
    throw new Error("HUD target card is missing: " + cardName);
  }

  var targetNode = requireChildNode(cardNode, HUD_TARGET_ICON_NAME, "HudPanel/target_layout/" + cardName);
  return {
    cardNode: cardNode,
    targetNode: targetNode,
    description: "HudPanel/target_layout/" + cardName + "/" + HUD_TARGET_ICON_NAME
  };
};

LevelRenderer.prototype._renderHudTargets = function (panel, targetDisplay) {
  if (!targetDisplay || typeof targetDisplay !== "object" || Array.isArray(targetDisplay)) {
    throw new Error("HUD target display data must be an object.");
  }

  var targetLayout = this._getHudTargetLayout(panel);
  var entries = this._buildHudTargetEntries(targetDisplay);
  this._syncHudTargetCards(targetLayout, entries);
  entries.forEach(function (entry) {
    this._renderHudTargetSlot(
      targetLayout,
      entry.slotName,
      entry.displayData,
      entry.cardName
    );
  }, this);

  var layout = targetLayout.getComponent(cc.Layout);
  if (!layout || typeof layout.updateLayout !== "function") {
    throw new Error("HudPanel/target_layout requires cc.Layout.updateLayout.");
  }
  layout.updateLayout();
};

LevelRenderer.prototype._renderHudTargetSlot = function (targetLayout, slotName, displayData, cardName) {
  var slot = this._resolveHudTargetSlot(targetLayout, slotName, cardName);
  var cardNode = slot.cardNode;
  var targetNode = slot.targetNode;
  var valueNode = requireChildNode(targetNode, "TargetValue", slot.description);
  var completeNode = requireChildNode(targetNode, "complete", slot.description);
  var valueLabel = valueNode.getComponent(cc.Label);
  if (!valueLabel) {
    throw new Error(slot.description + "/TargetValue requires cc.Label.");
  }

  if (!displayData || typeof displayData !== "object" || Array.isArray(displayData)) {
    throw new Error("HUD target display data is required: " + slotName);
  }

  if (typeof displayData.remaining !== "number" || !isFinite(displayData.remaining) || displayData.remaining < 0) {
    throw new Error("HUD target display remaining is required: " + slotName);
  }
  if (typeof displayData.remainingText !== "string" || !displayData.remainingText) {
    throw new Error("HUD target display remainingText is required: " + slotName);
  }

  var spritePath = "";
  if (slotName === "spirit") {
    if (typeof displayData.spiritId !== "string" || !displayData.spiritId) {
      throw new Error("HUD spirit target requires spiritId.");
    }
    spritePath = buildTrappedSpriteResourcePath(displayData.spiritId);
    if (displayData.spritePath !== spritePath) {
      throw new Error("HUD spirit target spritePath does not match spiritId.");
    }
  } else {
    if (typeof displayData.iconCode !== "string" || !displayData.iconCode) {
      throw new Error("HUD target display iconCode is required: " + slotName);
    }
    spritePath = BALL_RESOURCES[displayData.iconCode];
    if (!spritePath) {
      throw new Error("Unsupported HUD target icon code: " + displayData.iconCode);
    }
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD target sprite frame is missing: " + spritePath);
  }

  cardNode.active = true;
  targetNode.active = true;
  var sprite = ensureSprite(targetNode, spriteFrame);
  if (slotName === "spirit") {
    if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
      throw new Error("HUD spirit target requires SpriteFrame.getOriginalSize.");
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
      throw new Error("HUD spirit target SpriteFrame original size is invalid.");
    }
    sprite.trim = false;
    targetNode.setContentSize(
      HUD_SPIRIT_ICON_HEIGHT * originalSize.width / originalSize.height,
      HUD_SPIRIT_ICON_HEIGHT
    );
  }
  var targetComplete = displayData.remaining <= 0;
  valueNode.active = !targetComplete;
  completeNode.active = targetComplete;
  valueLabel.string = displayData.remainingText;
};

LevelRenderer.prototype._readRuntimeIceSnowballCollectedTotal = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.objectives) {
    return 0;
  }
  var total = Number(runtimeSnapshot.objectives.iceCollectedTotal);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Runtime snapshot iceCollectedTotal must be a non-negative number.");
  }
  return Math.floor(total);
};

LevelRenderer.prototype._syncDisplayedIceSnowballCollectedTotal = function (runtimeSnapshot) {
  this.displayedIceSnowballCollectedTotal = this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
};

LevelRenderer.prototype._resolveIceSnowballHudDisplayProgress = function (runtimeSnapshot) {
  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
  }
  return Math.max(0, Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0));
};

LevelRenderer.prototype._buildHudTargetDisplayForRender = function (levelConfig, runtimeSnapshot) {
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  return applyIceSnowballHudDisplayProgress(
    hudTargetDisplay,
    this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
  );
};

LevelRenderer.prototype._incrementDisplayedIceSnowballCollectedTotal = function () {
  var next = Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0) + 1;
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error("Displayed ice snowball collected total must increment to a positive integer.");
  }
  this.displayedIceSnowballCollectedTotal = next;
};

LevelRenderer.prototype._refreshIceSnowballHudTarget = function () {
  if (!this.currentLevelConfig || !this.lastRuntimeSnapshot) {
    throw new Error("Ice snowball HUD target refresh requires level config and runtime snapshot.");
  }
  var panel = this._getMountedHudPanel();
  if (!panel) {
    return;
  }

  var targetLayout = this._getHudTargetLayout(panel);
  var hudTargetDisplay = this._buildHudTargetDisplayForRender(this.currentLevelConfig, this.lastRuntimeSnapshot);
  this._renderHudTargetSlot(
    targetLayout,
    "ice_ball",
    hudTargetDisplay.iceSnowball,
    HUD_TARGET_ICE_BALL_CARD_NAME
  );
  var layout = targetLayout.getComponent(cc.Layout);
  if (!layout || typeof layout.updateLayout !== "function") {
    throw new Error("HudPanel/target_layout requires cc.Layout.updateLayout.");
  }
  layout.updateLayout();
  this.lastHudRenderKey = buildHudRenderKey(
    this.currentLevelConfig,
    this.lastRuntimeSnapshot,
    this._resolveIceSnowballHudDisplayProgress(this.lastRuntimeSnapshot)
  );
};

LevelRenderer.prototype._getHudTargetIceBallPositionInGameView = function () {
  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var iceCardNode = targetLayout ? this._findHudTargetCard(targetLayout, HUD_TARGET_ICE_BALL_CARD_NAME) : null;
  var ballNode = iceCardNode ? requireChildNode(iceCardNode, HUD_TARGET_ICON_NAME, "HudPanel/target_layout/hud_target_ice_ball") : null;
  if (!iceCardNode || !iceCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }

  return this._convertNodePositionToGameView(ballNode);
};

LevelRenderer.prototype._getHudTargetBallNode = function () {
  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var ballCardNode = targetLayout ? this._findHudTargetCard(targetLayout, HUD_TARGET_BALL_CARD_NAME) : null;
  var ballNode = ballCardNode ? requireChildNode(ballCardNode, HUD_TARGET_ICON_NAME, "HudPanel/target_layout/hud_target_ball") : null;
  if (!ballCardNode || !ballCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }
  return ballNode;
};

LevelRenderer.prototype._getHudTargetBallPositionInGameView = function () {
  var ballNode = this._getHudTargetBallNode();
  if (!ballNode) {
    return null;
  }
  return this._convertNodePositionToGameView(ballNode);
};

LevelRenderer.prototype._resolveMatchedObjectiveCollectStartPositionInGameView = function (entry, boardSnapshot) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Matched objective collect entry is required.");
  }
  if (typeof entry.color !== "string" || !entry.color) {
    throw new Error("Matched objective collect entry requires color.");
  }

  var worldPosition = entry.worldPosition;
  if (
    worldPosition &&
    typeof worldPosition === "object" &&
    !Array.isArray(worldPosition) &&
    typeof worldPosition.x === "number" &&
    typeof worldPosition.y === "number" &&
    isFinite(worldPosition.x) &&
    isFinite(worldPosition.y)
  ) {
    return this._convertBoardPointToGameView(worldPosition.x, worldPosition.y);
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Matched objective collect entry position requires board snapshot.");
  }
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
    throw new Error("Matched objective collect entry requires row and col when worldPosition is missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    entry.row,
    entry.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._buildMatchedObjectiveCollectBezierPoints = function (startPosition, endPosition) {
  if (!startPosition || !endPosition) {
    throw new Error("Matched objective collect bezier requires start and end positions.");
  }
  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  var arc = Math.max(MATCHED_TARGET_COLLECT_BEZIER_ARC, Math.abs(deltaY) * 0.18);
  return [
    cc.v2(startPosition.x + deltaX * 0.25, startPosition.y + arc),
    cc.v2(startPosition.x + deltaX * 0.72, endPosition.y + arc * 0.55),
    cc.v2(endPosition.x, endPosition.y)
  ];
};

LevelRenderer.prototype._playMatchedObjectiveTargetPunch = function () {
  var targetNode = this._getHudTargetBallNode();
  if (!targetNode || !targetNode.isValid) {
    throw new Error("Matched objective collect target punch requires HUD target ball node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Matched objective collect target punch requires cc.tween.");
  }

  targetNode.stopAllActions();
  targetNode.scale = 1;
  cc.tween(targetNode)
    .to(MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION, { scale: MATCHED_TARGET_COLLECT_PUNCH_SCALE })
    .to(MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION, { scale: 1 })
    .start();
};

LevelRenderer.prototype._spawnMatchedObjectiveCollectParticle = function (entry, startPosition, endPosition) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Matched objective collect particle requires entry.");
  }
  if (typeof entry.color !== "string" || !entry.color) {
    throw new Error("Matched objective collect particle requires color.");
  }
  if (!startPosition || typeof startPosition.x !== "number" || typeof startPosition.y !== "number" || !isFinite(startPosition.x) || !isFinite(startPosition.y)) {
    throw new Error("Matched objective collect particle requires finite start position.");
  }
  if (!endPosition || typeof endPosition.x !== "number" || typeof endPosition.y !== "number" || !isFinite(endPosition.x) || !isFinite(endPosition.y)) {
    throw new Error("Matched objective collect particle requires finite end position.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for matched objective collect particle.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Matched objective collect particle requires cc.tween.");
  }
  if (typeof cc.Node !== "function") {
    throw new Error("Matched objective collect particle requires cc.Node.");
  }

  var spritePath = BALL_RESOURCES[entry.color];
  if (!spritePath) {
    throw new Error("Matched objective collect particle unsupported color: " + entry.color);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Matched objective collect particle sprite frame is missing: " + spritePath);
  }

  var particleNode = new cc.Node("matched_objective_collect_" + String(entry.id));
  particleNode.parent = gameViewNode;
  particleNode.zIndex = MATCHED_TARGET_COLLECT_Z_INDEX;
  particleNode.opacity = 0;
  particleNode.scale = 0.72;
  particleNode.setPosition(startPosition.x, startPosition.y);
  particleNode.setContentSize(MATCHED_TARGET_COLLECT_PARTICLE_SIZE, MATCHED_TARGET_COLLECT_PARTICLE_SIZE);
  ensureSprite(particleNode, spriteFrame);

  var delayMs = Number(entry.delayMs);
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Matched objective collect particle delayMs must be non-negative.");
  }
  var bezierPoints = this._buildMatchedObjectiveCollectBezierPoints(startPosition, endPosition);
  var renderer = this;
  cc.tween(particleNode)
    .delay(delayMs / 1000)
    .call(function () {
      particleNode.opacity = 255;
    })
    .parallel(
      cc.tween().bezierTo(
        MATCHED_TARGET_COLLECT_FLY_DURATION,
        bezierPoints[0],
        bezierPoints[1],
        bezierPoints[2]
      ),
      cc.tween().to(MATCHED_TARGET_COLLECT_FLY_DURATION, {
        scale: 0.5,
        opacity: 210
      }, {
        easing: "quadIn"
      })
    )
    .call(function () {
      renderer._playMatchedObjectiveTargetPunch();
      particleNode.destroy();
    })
    .start();
};

LevelRenderer.prototype._playMatchedObjectiveCollectFly = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }
  if (!runtimeSnapshot.board) {
    throw new Error("Matched objective collect fly requires runtimeSnapshot.board.");
  }

  var targetPosition = null;
  for (var eventIndex = 0; eventIndex < runtimeSnapshot.runtimeEvents.length; eventIndex += 1) {
    var event = runtimeSnapshot.runtimeEvents[eventIndex];
    if (!event || event.type !== "matched_objective_collect") {
      continue;
    }
    if (typeof event.id !== "number" || !isFinite(event.id)) {
      throw new Error("matched_objective_collect event requires numeric id.");
    }
    if (event.id <= this.lastMatchedObjectiveCollectEventId) {
      continue;
    }
    if (!Array.isArray(event.entries) || !event.entries.length) {
      throw new Error("matched_objective_collect event requires entries.");
    }

    if (!targetPosition) {
      targetPosition = this._getHudTargetBallPositionInGameView();
      if (!targetPosition) {
        throw new Error("matched_objective_collect event requires active HUD ball target.");
      }
    }

    event.entries.forEach(function (entry) {
      var startPosition = this._resolveMatchedObjectiveCollectStartPositionInGameView(entry, runtimeSnapshot.board);
      this._spawnMatchedObjectiveCollectParticle(entry, startPosition, targetPosition);
    }, this);
    this.lastMatchedObjectiveCollectEventId = event.id;
  }
};

LevelRenderer.prototype._convertBoardPointToGameView = function (x, y) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Board layer is required for coordinate conversion.");
  }
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) {
    throw new Error("Board point conversion requires finite x/y.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView is required for board point conversion.");
  }

  var worldPos = this.layers.board.convertToWorldSpaceAR(cc.v2(x, y));
  return gameViewNode.convertToNodeSpaceAR(worldPos);
};

LevelRenderer.prototype._resolveIceSnowballCollectStartPositionInGameView = function (entry, boardSnapshot) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Ice snowball collect entry is required.");
  }
  if (typeof entry.innerColor !== "string" || !entry.innerColor) {
    throw new Error("Ice snowball collect entry requires innerColor.");
  }

  if (typeof entry.x === "number" && typeof entry.y === "number" && isFinite(entry.x) && isFinite(entry.y)) {
    if (this.layers && this.layers.falling) {
      var gameViewNode = this._getGameViewNode();
      if (!gameViewNode || !gameViewNode.isValid) {
        throw new Error("GameView is required for falling drop collect position.");
      }
      var worldPos = this.layers.falling.convertToWorldSpaceAR(cc.v2(entry.x, entry.y));
      return gameViewNode.convertToNodeSpaceAR(worldPos);
    }
    return this._convertBoardPointToGameView(entry.x, entry.y);
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Ice snowball collect entry position requires board snapshot.");
  }
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
    throw new Error("Ice snowball collect entry requires row and col when x/y are missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    entry.row,
    entry.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};
}

module.exports = attachLevelRendererSceneObjectiveHudMethods;
