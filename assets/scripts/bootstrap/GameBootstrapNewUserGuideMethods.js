"use strict";

var Shared = require("./GameBootstrapShared");
var BundleLoader = Shared.BundleLoader;
var BoardLayout = Shared.BoardLayout;
var NewUserGuideStore = Shared.NewUserGuideStore;
var SkillPowerupGuideStore = Shared.SkillPowerupGuideStore;

var FINGER_SPRITE_PATH = "image/finger";
var GUIDE_LAYER_NAME = "NewUserGuideLayer";
var GUIDE_FINGER_NAME = "NewUserGuideFinger";
var GUIDE_ARC_NAME = "NewUserGuideArc";
var GUIDE_MASK_PREFIX = "NewUserGuideMask";
var STEP_QUICK_START = NewUserGuideStore.STEP_QUICK_START;
var STEP_START_GAME = NewUserGuideStore.STEP_START_GAME;
var STEP_GAME_FIRE = NewUserGuideStore.STEP_GAME_FIRE;
var FINGER_BASE_SCALE = 0.82;
var MASK_OPACITY = 150;
var BUTTON_HOLE_PADDING = 24;
var GAMEPLAY_HOLE_PADDING = 96;
var START_GAME_GUIDE_SHOW_DELAY_MS = 300;
var SKILL_POWERUP_GUIDE_BUTTONS = {
  rainbow: "rainbow_btn",
  blast: "bomb_btn"
};
var SKILL_POWERUP_GUIDE_TYPES = SkillPowerupGuideStore.SUPPORTED_TYPES;

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " must be a valid node.");
  }
  return node;
}

function requireGuideStore(host) {
  if (!host.newUserGuideStore || typeof host.newUserGuideStore.load !== "function") {
    throw new Error("New user guide requires NewUserGuideStore.");
  }
  return host.newUserGuideStore;
}

function requireSkillPowerupGuideStore(host) {
  if (!host.skillPowerupGuideStore || typeof host.skillPowerupGuideStore.load !== "function") {
    throw new Error("Skill powerup guide requires SkillPowerupGuideStore.");
  }
  return host.skillPowerupGuideStore;
}

function requireSkillPowerupGuideType(entityType, description) {
  if (SKILL_POWERUP_GUIDE_TYPES.indexOf(entityType) === -1) {
    throw new Error(description + " must be rainbow or blast.");
  }
  return entityType;
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load new user guide sprite `" + path + "`: " + error.message));
        return;
      }
      if (!asset) {
        reject(new Error("New user guide sprite frame is empty: " + path));
        return;
      }
      resolve(asset);
    });
  });
}

function resolveSpriteSize(spriteFrame) {
  if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error("New user guide finger sprite frame must expose original size.");
  }
  var size = spriteFrame.getOriginalSize();
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error("New user guide finger sprite size is invalid.");
  }
  return size;
}

function resolveRootRect(rootNode) {
  requireValidNode(rootNode, "New user guide root node");
  if (typeof rootNode.getContentSize !== "function") {
    throw new Error("New user guide root node must expose content size.");
  }
  var size = rootNode.getContentSize();
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error("New user guide root size is invalid.");
  }
  var anchorX = Number.isFinite(rootNode.anchorX) ? rootNode.anchorX : 0.5;
  var anchorY = Number.isFinite(rootNode.anchorY) ? rootNode.anchorY : 0.5;
  return {
    left: -size.width * anchorX,
    right: size.width * (1 - anchorX),
    bottom: -size.height * anchorY,
    top: size.height * (1 - anchorY)
  };
}

function normalizeRect(rect, description) {
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.right) || !Number.isFinite(rect.bottom) || !Number.isFinite(rect.top)) {
    throw new Error(description + " must be a finite rect.");
  }
  if (rect.right <= rect.left || rect.top <= rect.bottom) {
    throw new Error(description + " must have positive size.");
  }
  return {
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    top: rect.top
  };
}

function expandRect(rect, padding) {
  var safeRect = normalizeRect(rect, "New user guide rect");
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error("New user guide rect padding must be non-negative.");
  }
  return {
    left: safeRect.left - padding,
    right: safeRect.right + padding,
    bottom: safeRect.bottom - padding,
    top: safeRect.top + padding
  };
}

function resolveRectCenter(rect) {
  var safeRect = normalizeRect(rect, "New user guide center rect");
  return cc.v2((safeRect.left + safeRect.right) * 0.5, (safeRect.bottom + safeRect.top) * 0.5);
}

function resolveNodeRectInRoot(targetNode, rootNode) {
  requireValidNode(targetNode, "New user guide target node");
  requireValidNode(rootNode, "New user guide root node");
  if (typeof targetNode.getContentSize !== "function" || typeof targetNode.convertToWorldSpaceAR !== "function") {
    throw new Error("New user guide target node must expose bounds conversion.");
  }
  if (typeof rootNode.convertToNodeSpaceAR !== "function") {
    throw new Error("New user guide root node cannot convert to local space.");
  }
  var size = targetNode.getContentSize();
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error("New user guide target node size is invalid.");
  }
  var left = -targetNode.anchorX * size.width;
  var right = (1 - targetNode.anchorX) * size.width;
  var bottom = -targetNode.anchorY * size.height;
  var top = (1 - targetNode.anchorY) * size.height;
  var localCorners = [
    cc.v2(left, bottom),
    cc.v2(left, top),
    cc.v2(right, bottom),
    cc.v2(right, top)
  ];
  var rootCorners = localCorners.map(function (corner) {
    return rootNode.convertToNodeSpaceAR(targetNode.convertToWorldSpaceAR(corner));
  });
  var xs = rootCorners.map(function (point) { return point.x; });
  var ys = rootCorners.map(function (point) { return point.y; });
  return normalizeRect({
    left: Math.min.apply(Math, xs),
    right: Math.max.apply(Math, xs),
    bottom: Math.min.apply(Math, ys),
    top: Math.max.apply(Math, ys)
  }, "New user guide target rect");
}

function syncGuideTargetWidgetAlignment(targetNode, rootNode) {
  requireValidNode(targetNode, "New user guide widget sync target");
  requireValidNode(rootNode, "New user guide widget sync root");
  if (!cc || !cc.Widget) {
    throw new Error("New user guide widget sync requires cc.Widget.");
  }

  var chain = [];
  var current = targetNode;
  while (current && current.isValid) {
    chain.push(current);
    if (current === rootNode) {
      break;
    }
    current = current.parent;
  }
  if (chain.length === 0 || chain[chain.length - 1] !== rootNode) {
    throw new Error("New user guide widget sync target must be under root node.");
  }

  chain.reverse().forEach(function (node) {
    var widget = node.getComponent(cc.Widget);
    if (!widget || widget.enabled !== true) {
      return;
    }
    if (typeof widget.updateAlignment !== "function") {
      throw new Error("New user guide widget sync requires updateAlignment on " + node.name + ".");
    }
    widget.updateAlignment();
  });
}

function resolveGuideTargetRectInRoot(targetNode, rootNode) {
  syncGuideTargetWidgetAlignment(targetNode, rootNode);
  return resolveNodeRectInRoot(targetNode, rootNode);
}

function clampRectToRoot(rect, rootRect) {
  var safeRect = normalizeRect(rect, "New user guide hole rect");
  var safeRoot = normalizeRect(rootRect, "New user guide root rect");
  var clamped = {
    left: Math.max(safeRoot.left, safeRect.left),
    right: Math.min(safeRoot.right, safeRect.right),
    bottom: Math.max(safeRoot.bottom, safeRect.bottom),
    top: Math.min(safeRoot.top, safeRect.top)
  };
  return normalizeRect(clamped, "New user guide clamped hole rect");
}

function buildRectFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error("New user guide point rect requires points.");
  }
  var xs = points.map(function (point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("New user guide rect point is invalid.");
    }
    return point.x;
  });
  var ys = points.map(function (point) {
    return point.y;
  });
  return normalizeRect({
    left: Math.min.apply(Math, xs),
    right: Math.max.apply(Math, xs),
    bottom: Math.min.apply(Math, ys),
    top: Math.max.apply(Math, ys)
  }, "New user guide point rect");
}

function resolveFingerCenterForTip(tipPoint, fingerSize) {
  if (!tipPoint || !Number.isFinite(tipPoint.x) || !Number.isFinite(tipPoint.y)) {
    throw new Error("New user guide tip point is invalid.");
  }
  if (!fingerSize || !Number.isFinite(fingerSize.width) || !Number.isFinite(fingerSize.height)) {
    throw new Error("New user guide finger size is invalid.");
  }
  return cc.v2(
    tipPoint.x + fingerSize.width * FINGER_BASE_SCALE * 0.5,
    tipPoint.y - fingerSize.height * FINGER_BASE_SCALE * 0.5
  );
}

function stopGuideNodeActions(node) {
  if (node && node.isValid) {
    node.stopAllActions();
  }
}

function waitMilliseconds(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("New user guide wait duration must be non-negative.");
  }
  if (typeof setTimeout !== "function") {
    throw new Error("New user guide requires setTimeout.");
  }
  return new Promise(function (resolve) {
    setTimeout(resolve, durationMs);
  });
}

function ensureMaskBlockNode(layerNode, name, rect) {
  requireValidNode(layerNode, "New user guide layer");
  var safeRect = normalizeRect(rect, "New user guide mask block rect");
  var node = layerNode.getChildByName(name);
  if (!node || !node.isValid) {
    node = new cc.Node(name);
    node.parent = layerNode;
    node.anchorX = 0.5;
    node.anchorY = 0.5;
    node.addComponent(cc.BlockInputEvents);
  }
  node.zIndex = -10;
  node.active = true;
  node.setPosition((safeRect.left + safeRect.right) * 0.5, (safeRect.bottom + safeRect.top) * 0.5);
  node.setContentSize(safeRect.right - safeRect.left, safeRect.top - safeRect.bottom);
  var graphics = node.getComponent(cc.Graphics) || node.addComponent(cc.Graphics);
  graphics.clear();
  graphics.fillColor = cc.color(0, 0, 0, MASK_OPACITY);
  graphics.rect(
    -(safeRect.right - safeRect.left) * 0.5,
    -(safeRect.top - safeRect.bottom) * 0.5,
    safeRect.right - safeRect.left,
    safeRect.top - safeRect.bottom
  );
  graphics.fill();
  return node;
}

function hideMaskBlockNode(layerNode, name) {
  var node = layerNode.getChildByName(name);
  if (node && node.isValid) {
    node.active = false;
  }
}

function requireChildNode(parent, childName, description) {
  requireValidNode(parent, description);
  var child = parent.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error(description + " requires child node: " + childName);
  }
  return child;
}

function resolveSkillPowerupGuideButtonName(entityType) {
  var safeType = requireSkillPowerupGuideType(entityType, "Skill powerup guide type");
  if (!Object.prototype.hasOwnProperty.call(SKILL_POWERUP_GUIDE_BUTTONS, safeType)) {
    throw new Error("Skill powerup guide button mapping missing: " + safeType);
  }
  return SKILL_POWERUP_GUIDE_BUTTONS[safeType];
}

function resolveBottomPanelPowerupGuideTarget(host, entityType) {
  var buttonName = resolveSkillPowerupGuideButtonName(entityType);
  if (!host.levelRenderer || !host.levelRenderer.layers || !host.levelRenderer.layers.hud) {
    throw new Error("Skill powerup guide requires mounted HUD layer.");
  }

  var hudLayer = host.levelRenderer.layers.hud;
  var panel = requireChildNode(hudLayer, "BttomPanel", "HUD layer");
  var propsScrollNode = requireChildNode(panel, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var buttonNode = requireChildNode(
    propsContentNode,
    buttonName,
    "BttomPanel/props_scroll/view/content"
  );
  return {
    buttonNode: buttonNode,
    viewNode: propsViewNode,
    contentNode: propsContentNode
  };
}

function stopGuideScrollAutoMovement(viewNode) {
  var scrollNode = viewNode && viewNode.parent ? viewNode.parent : null;
  var scrollView = scrollNode ? scrollNode.getComponent(cc.ScrollView) : null;
  if (!scrollView) {
    return;
  }
  if (typeof scrollView.stopAutoScroll !== "function") {
    throw new Error("Skill powerup guide ScrollView requires stopAutoScroll.");
  }
  scrollView.stopAutoScroll();
}

function isRectInsideHorizontalView(targetRect, viewRect) {
  return targetRect.left >= viewRect.left + BUTTON_HOLE_PADDING &&
    targetRect.right <= viewRect.right - BUTTON_HOLE_PADDING;
}

function revealSkillPowerupGuideButton(host, target) {
  requireValidNode(target.buttonNode, "Skill powerup guide button");
  requireValidNode(target.viewNode, "Skill powerup guide scroll view");
  requireValidNode(target.contentNode, "Skill powerup guide scroll content");

  stopGuideScrollAutoMovement(target.viewNode);
  var viewRect = resolveGuideTargetRectInRoot(target.viewNode, host.node);
  var buttonRect = resolveGuideTargetRectInRoot(target.buttonNode, host.node);
  if (isRectInsideHorizontalView(buttonRect, viewRect)) {
    return buttonRect;
  }

  var deltaX = 0;
  if (buttonRect.left < viewRect.left + BUTTON_HOLE_PADDING) {
    deltaX = (viewRect.left + BUTTON_HOLE_PADDING) - buttonRect.left;
  } else if (buttonRect.right > viewRect.right - BUTTON_HOLE_PADDING) {
    deltaX = (viewRect.right - BUTTON_HOLE_PADDING) - buttonRect.right;
  } else {
    throw new Error("Skill powerup guide button visibility delta cannot be resolved.");
  }

  target.contentNode.setPosition(target.contentNode.x + deltaX, target.contentNode.y);
  buttonRect = resolveGuideTargetRectInRoot(target.buttonNode, host.node);
  viewRect = resolveGuideTargetRectInRoot(target.viewNode, host.node);
  if (buttonRect.right <= viewRect.left || buttonRect.left >= viewRect.right) {
    throw new Error("Skill powerup guide button failed to enter visible scroll area.");
  }
  return buttonRect;
}

function requireSkillPowerupGuideState(host) {
  requireSkillPowerupGuideStore(host);
  if (!host.skillPowerupGuideState) {
    throw new Error("Skill powerup guide state must be loaded.");
  }
  return host.skillPowerupGuideState;
}

function ensureSkillPowerupGuideQueue(host) {
  if (!Array.isArray(host._pendingSkillPowerupGuideTypes)) {
    throw new Error("Pending skill powerup guide queue must be an array.");
  }
  return host._pendingSkillPowerupGuideTypes;
}

function isSkillPowerupGuideQueued(host, entityType) {
  var queue = ensureSkillPowerupGuideQueue(host);
  return queue.indexOf(entityType) >= 0;
}

function enqueueSkillPowerupGuide(host, entityType) {
  var safeType = requireSkillPowerupGuideType(entityType, "Queued skill powerup guide type");
  if (isSkillPowerupGuideQueued(host, safeType)) {
    return;
  }
  ensureSkillPowerupGuideQueue(host).push(safeType);
}

function removeQueuedSkillPowerupGuide(host, entityType) {
  var queue = ensureSkillPowerupGuideQueue(host);
  var nextQueue = [];
  queue.forEach(function (queuedType) {
    if (queuedType !== entityType) {
      nextQueue.push(queuedType);
    }
  });
  host._pendingSkillPowerupGuideTypes = nextQueue;
}

function readRuntimeSkillInventoryCount(snapshot, entityType) {
  var safeType = requireSkillPowerupGuideType(entityType, "Runtime skill powerup guide type");
  if (!snapshot || !snapshot.shooter || !snapshot.shooter.skillInventory) {
    throw new Error("Skill powerup guide requires shooter skillInventory snapshot.");
  }
  var skillInventory = snapshot.shooter.skillInventory;
  if (!Object.prototype.hasOwnProperty.call(skillInventory, safeType)) {
    throw new Error("Skill powerup guide inventory count missing: " + safeType);
  }
  var count = Number(skillInventory[safeType]);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Skill powerup guide inventory count must be a non-negative integer: " + safeType);
  }
  return count;
}

function canShowSkillPowerupGuide(snapshot, entityType) {
  var count = readRuntimeSkillInventoryCount(snapshot, entityType);
  if (count <= 0) {
    return false;
  }
  if (!snapshot.shooter || snapshot.shooter.canUsePowerups !== true) {
    return false;
  }
  if (snapshot.shooter.pendingBarrierHammer) {
    return false;
  }
  if (snapshot.shooter.pendingRainbowColorSelection) {
    return false;
  }
  return true;
}

function collectSkillPowerupGuideTypesFromSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.runtimeEvents) || snapshot.runtimeEvents.length === 0) {
    return [];
  }

  var collectedTypes = [];
  snapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "skill_powerup_collected") {
      return;
    }
    var entityType = requireSkillPowerupGuideType(event.entityType, "Skill powerup collected event entityType");
    if (!Number.isInteger(event.total) || event.total <= 0) {
      throw new Error("Skill powerup collected event requires positive total.");
    }
    if (collectedTypes.indexOf(entityType) === -1) {
      collectedTypes.push(entityType);
    }
  });
  return collectedTypes;
}

module.exports = {
  _refreshNewUserGuideState: function () {
    this.newUserGuideState = requireGuideStore(this).load();
    return this.newUserGuideState;
  },

  _saveNewUserGuideState: function () {
    requireGuideStore(this).save(this.newUserGuideState);
  },

  _refreshSkillPowerupGuideState: function () {
    this.skillPowerupGuideState = requireSkillPowerupGuideStore(this).load();
    return this.skillPowerupGuideState;
  },

  _saveSkillPowerupGuideState: function () {
    requireSkillPowerupGuideStore(this).save(this.skillPowerupGuideState);
  },

  _isNewUserGuideActive: function () {
    requireGuideStore(this);
    this._refreshNewUserGuideState();
    return this.newUserGuideStore.isActive(this.newUserGuideState);
  },

  _isNewUserGuideStep: function (step) {
    requireGuideStore(this);
    this._refreshNewUserGuideState();
    return this.newUserGuideStore.isStep(this.newUserGuideState, step);
  },

  _ensureNewUserGuideSpriteFrame: function () {
    if (this._newUserGuideFingerSpriteFrame) {
      return Promise.resolve(this._newUserGuideFingerSpriteFrame);
    }
    if (this._newUserGuideFingerSpriteFramePromise) {
      return this._newUserGuideFingerSpriteFramePromise;
    }

    this._newUserGuideFingerSpriteFramePromise = loadSpriteFrame(FINGER_SPRITE_PATH).then(function (spriteFrame) {
      this._newUserGuideFingerSpriteFrame = spriteFrame;
      this._newUserGuideFingerSize = resolveSpriteSize(spriteFrame);
      this._newUserGuideFingerSpriteFramePromise = null;
      return spriteFrame;
    }.bind(this)).catch(function (error) {
      this._newUserGuideFingerSpriteFramePromise = null;
      throw error;
    }.bind(this));

    return this._newUserGuideFingerSpriteFramePromise;
  },

  _ensureNewUserGuideLayer: function () {
    requireValidNode(this.node, "New user guide host root");
    if (this._newUserGuideLayer && this._newUserGuideLayer.isValid) {
      return this._newUserGuideLayer;
    }

    var layerNode = this.node.getChildByName(GUIDE_LAYER_NAME);
    if (!layerNode || !layerNode.isValid) {
      layerNode = new cc.Node(GUIDE_LAYER_NAME);
      layerNode.parent = this.node;
    }
    layerNode.setPosition(0, 0);
    layerNode.zIndex = 900;
    this._newUserGuideLayer = layerNode;
    return layerNode;
  },

  _ensureNewUserGuideFingerNode: function () {
    var layerNode = this._ensureNewUserGuideLayer();
    var fingerNode = layerNode.getChildByName(GUIDE_FINGER_NAME);
    if (!fingerNode || !fingerNode.isValid) {
      fingerNode = new cc.Node(GUIDE_FINGER_NAME);
      fingerNode.parent = layerNode;
      fingerNode.anchorX = 0.5;
      fingerNode.anchorY = 0.5;
    }

    var sprite = fingerNode.getComponent(cc.Sprite) || fingerNode.addComponent(cc.Sprite);
    sprite.spriteFrame = this._newUserGuideFingerSpriteFrame;
    sprite.sizeMode = cc.Sprite.SizeMode.RAW;
    fingerNode.setContentSize(this._newUserGuideFingerSize);
    fingerNode.opacity = 255;
    fingerNode.active = true;
    this._newUserGuideFingerNode = fingerNode;
    return fingerNode;
  },

  _hideNewUserGuide: function () {
    stopGuideNodeActions(this._newUserGuideFingerNode);
    if (this._newUserGuideLayer && this._newUserGuideLayer.isValid) {
      this._newUserGuideLayer.active = false;
    }
  },

  _runNewUserGuideFingerBreath: function (fingerNode) {
    requireValidNode(fingerNode, "New user guide finger");
    fingerNode.stopAllActions();
    fingerNode.scale = FINGER_BASE_SCALE;
    fingerNode.runAction(cc.repeatForever(cc.sequence(
      cc.scaleTo(0.36, FINGER_BASE_SCALE * 1.13),
      cc.scaleTo(0.36, FINGER_BASE_SCALE * 0.94),
      cc.delayTime(0.18),
      cc.scaleTo(0.08, FINGER_BASE_SCALE * 1.22),
      cc.scaleTo(0.12, FINGER_BASE_SCALE),
      cc.delayTime(0.36)
    )));
  },

  _showNewUserGuideFingerAtTip: function (tipPoint) {
    var layerNode = this._ensureNewUserGuideLayer();
    layerNode.active = true;
    this._clearNewUserGuideArc();
    return this._ensureNewUserGuideSpriteFrame().then(function () {
      var fingerNode = this._ensureNewUserGuideFingerNode();
      fingerNode.setPosition(resolveFingerCenterForTip(tipPoint, this._newUserGuideFingerSize));
      this._runNewUserGuideFingerBreath(fingerNode);
      return fingerNode;
    }.bind(this));
  },

  _applyNewUserGuideMask: function (holeRect) {
    var layerNode = this._ensureNewUserGuideLayer();
    var rootRect = resolveRootRect(this.node);
    var hole = clampRectToRoot(holeRect, rootRect);
    var blocks = [
      {
        name: GUIDE_MASK_PREFIX + "Top",
        rect: { left: rootRect.left, right: rootRect.right, bottom: hole.top, top: rootRect.top }
      },
      {
        name: GUIDE_MASK_PREFIX + "Bottom",
        rect: { left: rootRect.left, right: rootRect.right, bottom: rootRect.bottom, top: hole.bottom }
      },
      {
        name: GUIDE_MASK_PREFIX + "Left",
        rect: { left: rootRect.left, right: hole.left, bottom: hole.bottom, top: hole.top }
      },
      {
        name: GUIDE_MASK_PREFIX + "Right",
        rect: { left: hole.right, right: rootRect.right, bottom: hole.bottom, top: hole.top }
      }
    ];
    blocks.forEach(function (entry) {
      if (entry.rect.right > entry.rect.left && entry.rect.top > entry.rect.bottom) {
        ensureMaskBlockNode(layerNode, entry.name, entry.rect);
        return;
      }
      hideMaskBlockNode(layerNode, entry.name);
    });
  },

  _clearNewUserGuideArc: function () {
    if (!this._newUserGuideLayer || !this._newUserGuideLayer.isValid) {
      return;
    }
    var arcNode = this._newUserGuideLayer.getChildByName(GUIDE_ARC_NAME);
    if (arcNode && arcNode.isValid) {
      arcNode.destroy();
    }
  },

  _showNewUserGuideForQuickStart: function () {
    if (!this._isNewUserGuideStep(STEP_QUICK_START)) {
      return;
    }
    if (!this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("New user guide quick start step requires LevelView.");
    }
    var quickStartNode = this._levelSelectNode.getChildByName("quick_start_btn");
    if (!quickStartNode || !quickStartNode.isValid) {
      throw new Error("New user guide requires quick_start_btn.");
    }
    var quickStartRect = resolveGuideTargetRectInRoot(quickStartNode, this.node);
    this._applyNewUserGuideMask(expandRect(quickStartRect, BUTTON_HOLE_PADDING));
    return this._showNewUserGuideFingerAtTip(resolveRectCenter(quickStartRect));
  },

  _showNewUserGuideForStartGame: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    return waitMilliseconds(START_GAME_GUIDE_SHOW_DELAY_MS).then(function () {
      if (!this._isNewUserGuideStep(STEP_START_GAME)) {
        return null;
      }
      if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
        throw new Error("New user guide start game step requires active StartGameView.");
      }
      var playButtonNode = this._findNodeByNameRecursive(this._startGameViewNode, "play_btn");
      if (!playButtonNode || !playButtonNode.isValid) {
        throw new Error("New user guide requires StartGameView play_btn.");
      }
      var playButtonRect = resolveGuideTargetRectInRoot(playButtonNode, this.node);
      this._applyNewUserGuideMask(expandRect(playButtonRect, BUTTON_HOLE_PADDING));
      return this._showNewUserGuideFingerAtTip(resolveRectCenter(playButtonRect));
    }.bind(this));
  },

  _showNewUserGuideForGameplay: function () {
    if (!this._isNewUserGuideStep(STEP_GAME_FIRE)) {
      return;
    }
    return this._ensureNewUserGuideSpriteFrame().then(function () {
      var layerNode = this._ensureNewUserGuideLayer();
      var fingerNode = this._ensureNewUserGuideFingerNode();
      var shooterOrigin = this._getShooterOriginPoint();
      if (!shooterOrigin || !Number.isFinite(shooterOrigin.x) || !Number.isFinite(shooterOrigin.y)) {
        throw new Error("New user guide gameplay step requires shooter origin.");
      }

      layerNode.active = true;
      this._clearNewUserGuideArc();
      var arcNode = new cc.Node(GUIDE_ARC_NAME);
      arcNode.parent = layerNode;
      arcNode.zIndex = -1;
      var graphics = arcNode.addComponent(cc.Graphics);
      graphics.lineWidth = 8;
      graphics.strokeColor = cc.color(255, 244, 137, 210);
      var radius = 520;
      var startAngle = Math.PI * 0.36;
      var endAngle = Math.PI * 0.64;
      graphics.arc(shooterOrigin.x, shooterOrigin.y, radius, startAngle, endAngle, false);
      graphics.stroke();

      var middleTip = cc.v2(0, (BoardLayout.boardStartY + BoardLayout.dangerLineY) * 0.5);
      var leftTip = cc.v2(
        shooterOrigin.x + Math.cos(endAngle) * radius,
        shooterOrigin.y + Math.sin(endAngle) * radius
      );
      var rightTip = cc.v2(
        shooterOrigin.x + Math.cos(startAngle) * radius,
        shooterOrigin.y + Math.sin(startAngle) * radius
      );
      var middleCenter = resolveFingerCenterForTip(middleTip, this._newUserGuideFingerSize);
      var leftCenter = resolveFingerCenterForTip(leftTip, this._newUserGuideFingerSize);
      var rightCenter = resolveFingerCenterForTip(rightTip, this._newUserGuideFingerSize);
      this._applyNewUserGuideMask(expandRect(buildRectFromPoints([leftTip, rightTip, middleTip]), GAMEPLAY_HOLE_PADDING));

      fingerNode.setPosition(middleCenter);
      fingerNode.scale = FINGER_BASE_SCALE;
      fingerNode.stopAllActions();
      fingerNode.runAction(cc.repeatForever(cc.sequence(
        cc.delayTime(0.22),
        cc.scaleTo(0.12, FINGER_BASE_SCALE * 1.22),
        cc.scaleTo(0.12, FINGER_BASE_SCALE),
        cc.delayTime(0.26),
        cc.moveTo(0.58, leftCenter),
        cc.delayTime(0.16),
        cc.moveTo(1.16, rightCenter),
        cc.delayTime(0.18),
        cc.moveTo(0.52, middleCenter),
        cc.delayTime(0.42)
      )));
      return fingerNode;
    }.bind(this));
  },

  _showSkillPowerupUseGuide: function (entityType, runtimeSnapshot) {
    var safeType = requireSkillPowerupGuideType(entityType, "Skill powerup guide show type");
    this._refreshSkillPowerupGuideState();
    if (this.skillPowerupGuideStore.isCompleted(this.skillPowerupGuideState, safeType)) {
      removeQueuedSkillPowerupGuide(this, safeType);
      return;
    }
    if (!canShowSkillPowerupGuide(runtimeSnapshot, safeType)) {
      return;
    }

    var target = resolveBottomPanelPowerupGuideTarget(this, safeType);
    var buttonRect = revealSkillPowerupGuideButton(this, target);
    this._applyNewUserGuideMask(expandRect(buttonRect, BUTTON_HOLE_PADDING));
    this._activeSkillPowerupGuideType = safeType;
    return this._showNewUserGuideFingerAtTip(resolveRectCenter(buttonRect));
  },

  _syncSkillPowerupGuideForRuntimeSnapshot: function (runtimeSnapshot) {
    requireSkillPowerupGuideState(this);
    var collectedTypes = collectSkillPowerupGuideTypesFromSnapshot(runtimeSnapshot);
    collectedTypes.forEach(function (entityType) {
      this._refreshSkillPowerupGuideState();
      if (!this.skillPowerupGuideStore.isCompleted(this.skillPowerupGuideState, entityType)) {
        enqueueSkillPowerupGuide(this, entityType);
      }
    }, this);

    if (this._activeSkillPowerupGuideType) {
      return;
    }

    var queue = ensureSkillPowerupGuideQueue(this);
    for (var index = 0; index < queue.length; index += 1) {
      var queuedType = requireSkillPowerupGuideType(queue[index], "Pending skill powerup guide type");
      this._refreshSkillPowerupGuideState();
      if (this.skillPowerupGuideStore.isCompleted(this.skillPowerupGuideState, queuedType)) {
        removeQueuedSkillPowerupGuide(this, queuedType);
        index -= 1;
      } else if (canShowSkillPowerupGuide(runtimeSnapshot, queuedType)) {
        this._showSkillPowerupUseGuide(queuedType, runtimeSnapshot);
        return;
      }
    }
  },

  _advanceNewUserGuideToStartGame: function () {
    if (!this._isNewUserGuideStep(STEP_QUICK_START)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_START_GAME);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _rewindNewUserGuideToQuickStart: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_QUICK_START);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _advanceNewUserGuideToGameplay: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_GAME_FIRE);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _completeNewUserGuide: function () {
    if (!this._isNewUserGuideStep(STEP_GAME_FIRE)) {
      return;
    }
    var result = this.newUserGuideStore.markCompleted(this.newUserGuideState);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _completeSkillPowerupUseGuide: function (entityType) {
    var safeType = requireSkillPowerupGuideType(entityType, "Skill powerup guide complete type");
    if (this._activeSkillPowerupGuideType !== safeType) {
      return;
    }
    this._refreshSkillPowerupGuideState();
    var result = this.skillPowerupGuideStore.markCompleted(this.skillPowerupGuideState, safeType);
    this.skillPowerupGuideState = result.state;
    this._saveSkillPowerupGuideState();
    removeQueuedSkillPowerupGuide(this, safeType);
    this._activeSkillPowerupGuideType = "";
    this._hideNewUserGuide();
  }
};
