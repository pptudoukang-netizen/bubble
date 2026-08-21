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
var PROP_TIPS_VIEW_PREFAB_PATH = "prefabs/ui/PropTipsView";
var PROP_TIPS_VIEW_NAME = "PropTipsView";
var PROP_TIPS_VIEW_Z_INDEX = 12;
var PROP_TIPS_LABEL_NAME = "tips";
var PROP_TIPS_TITLE_PROP_NAME = "title_prop";
var PROP_TIPS_TITLE_RULE_NAME = "title_rule";
var PROP_TIPS_TITLE_MODE_PROP = "prop";
var PROP_TIPS_TITLE_MODE_RULE = "rule";
var PROP_TIPS_HUD_BOTTOM_MARGIN = 12;
var SKILL_POWERUP_GUIDE_STEP_SELECT = "select_powerup";
var SKILL_POWERUP_GUIDE_STEP_COLOR = "select_rainbow_color";
var SKILL_POWERUP_GUIDE_STEP_FIRE = "fire_powerup";
var SKILL_POWERUP_FIRE_HOLE_HALF_SIZE = 100;
var RAINBOW_COLOR_SELECTOR_ANIMATION_WAIT_MS = 260;
var SKILL_POWERUP_GUIDE_BUTTONS = {
  rainbow: "rainbow_btn",
  blast: "bomb_btn"
};
var SKILL_POWERUP_GUIDE_TYPES = SkillPowerupGuideStore.SUPPORTED_TYPES;
var SKILL_POWERUP_GUIDE_TIPS = {
  rainbow: {
    select_powerup: "彩虹球可选择一种颜色，发射后消除同色泡泡。\n点击彩虹球道具装填彩虹球",
    select_rainbow_color: "选择彩虹球要变成的颜色",
    fire_powerup: "点击屏幕中间发射彩虹球"
  },
  blast: {
    select_powerup: "炸弹球可炸掉命中点周围的泡泡。\n点击炸弹道具装填炸弹球",
    fire_powerup: "点击屏幕中间发射炸弹球"
  }
};

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

function requireNonEmptyString(value, description) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(description + " must be a non-empty string.");
  }
  return value;
}

function resolveSkillPowerupGuideTipsText(entityType, step) {
  var safeType = requireSkillPowerupGuideType(entityType, "Skill powerup guide tips type");
  var typeTips = SKILL_POWERUP_GUIDE_TIPS[safeType];
  if (!typeTips || typeof typeTips !== "object") {
    throw new Error("Skill powerup guide tips config missing: " + safeType);
  }
  if (!Object.prototype.hasOwnProperty.call(typeTips, step)) {
    throw new Error("Skill powerup guide tips step missing: " + safeType + "/" + step);
  }
  return requireNonEmptyString(typeTips[step], "Skill powerup guide tips text");
}

function resolvePropTipsLabel(viewNode) {
  var tipsNode = requireChildNode(viewNode, PROP_TIPS_LABEL_NAME, "PropTipsView");
  var label = tipsNode.getComponent(cc.Label);
  if (!label) {
    throw new Error("PropTipsView tips requires cc.Label.");
  }
  return label;
}

function requireSpriteNode(node, description) {
  requireValidNode(node, description);
  if (!node.getComponent(cc.Sprite)) {
    throw new Error(description + " requires cc.Sprite.");
  }
  return node;
}

function resolvePropTipsTitleNodes(viewNode) {
  return {
    prop: requireSpriteNode(requireChildNode(viewNode, PROP_TIPS_TITLE_PROP_NAME, "PropTipsView"), "PropTipsView/" + PROP_TIPS_TITLE_PROP_NAME),
    rule: requireSpriteNode(requireChildNode(viewNode, PROP_TIPS_TITLE_RULE_NAME, "PropTipsView"), "PropTipsView/" + PROP_TIPS_TITLE_RULE_NAME)
  };
}

function requirePropTipsTitleMode(titleMode) {
  if (titleMode !== PROP_TIPS_TITLE_MODE_PROP && titleMode !== PROP_TIPS_TITLE_MODE_RULE) {
    throw new Error("PropTipsView titleMode must be prop or rule.");
  }
  return titleMode;
}

function syncPropTipsTitleMode(viewNode, titleMode) {
  var safeMode = requirePropTipsTitleMode(titleMode);
  var titleNodes = resolvePropTipsTitleNodes(viewNode);
  titleNodes.prop.active = safeMode === PROP_TIPS_TITLE_MODE_PROP;
  titleNodes.rule.active = safeMode === PROP_TIPS_TITLE_MODE_RULE;
}

function bindPropTipsTap(viewNode, onTap) {
  requireValidNode(viewNode, "PropTipsView");
  if (onTap !== null && typeof onTap !== "function") {
    throw new Error("PropTipsView onTap must be a function.");
  }
  viewNode.__propTipsTapHandler = onTap;
  if (onTap === null) {
    return;
  }
  if (viewNode.__propTipsTapBound === true) {
    return;
  }
  viewNode.__propTipsTapBound = true;
  viewNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = viewNode.__propTipsTapHandler;
    if (handler === null) {
      return;
    }
    if (typeof handler !== "function") {
      throw new Error("PropTipsView tap handler is invalid.");
    }
    handler();
  });
}

function renderPropTipsView(viewNode, options) {
  requireValidNode(viewNode, "PropTipsView");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("PropTipsView render options must be an object.");
  }
  var text = requireNonEmptyString(options.text, "PropTipsView tips text");
  var titleMode = requirePropTipsTitleMode(options.titleMode);
  var onTap = Object.prototype.hasOwnProperty.call(options, "onTap") ? options.onTap : null;
  syncPropTipsTitleMode(viewNode, titleMode);
  resolvePropTipsLabel(viewNode).string = text;
  bindPropTipsTap(viewNode, onTap);
}

function resolveMountedHudPanel(host) {
  if (!host.levelRenderer || !host.levelRenderer.layers || !host.levelRenderer.layers.hud) {
    throw new Error("PropTipsView position requires mounted HUD layer.");
  }
  var hudLayer = host.levelRenderer.layers.hud;
  var directPanel = hudLayer.getChildByName("HudPanel");
  if (directPanel && directPanel.isValid) {
    return directPanel;
  }
  var gameViewNode = hudLayer.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("PropTipsView position requires GameView under HUD layer.");
  }
  var hudPanel = gameViewNode.getChildByName("HudPanel");
  if (!hudPanel || !hudPanel.isValid) {
    throw new Error("PropTipsView position requires HudPanel.");
  }
  return hudPanel;
}

function resolvePropTipsPositionBelowHud(host, viewNode) {
  requireValidNode(viewNode, "PropTipsView");
  if (typeof viewNode.getContentSize !== "function") {
    throw new Error("PropTipsView requires content size.");
  }
  var size = viewNode.getContentSize();
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error("PropTipsView size is invalid.");
  }
  var hudRect = resolveGuideTargetRectInRoot(resolveMountedHudPanel(host), host.node);
  var anchorY = Number.isFinite(viewNode.anchorY) ? viewNode.anchorY : 0.5;
  var topOffset = size.height * (1 - anchorY);
  return cc.v2(0, hudRect.bottom - PROP_TIPS_HUD_BOTTOM_MARGIN - topOffset);
}

function syncPropTipsPositionBelowHud(host, viewNode) {
  viewNode.setPosition(resolvePropTipsPositionBelowHud(host, viewNode));
}

function destroySkillPowerupPropTipsView(host) {
  var viewNode = host._skillPowerupPropTipsViewNode;
  if (viewNode && viewNode.isValid) {
    viewNode.removeFromParent(false);
    viewNode.destroy();
  }
  host._skillPowerupPropTipsViewNode = null;
  host._skillPowerupPropTipsViewPromise = null;
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

function resolveGameplayFireGuideTipPoint() {
  return cc.v2(0, 0);
}

function buildCenteredFireGuideRect(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Skill powerup fire guide point must be finite.");
  }
  return normalizeRect({
    left: point.x - SKILL_POWERUP_FIRE_HOLE_HALF_SIZE,
    right: point.x + SKILL_POWERUP_FIRE_HOLE_HALF_SIZE,
    bottom: point.y - SKILL_POWERUP_FIRE_HOLE_HALF_SIZE,
    top: point.y + SKILL_POWERUP_FIRE_HOLE_HALF_SIZE
  }, "Skill powerup fire guide rect");
}

function resolveRainbowColorSelectorGuideRect(host) {
  if (!host.levelRenderer || !host.levelRenderer.layers || !host.levelRenderer.layers.shooter) {
    throw new Error("Rainbow color guide requires shooter layer.");
  }
  var shooterPanel = requireChildNode(host.levelRenderer.layers.shooter, "ShooterPanel", "Shooter layer");
  var selectorNode = requireChildNode(shooterPanel, "RainbowColorSelector", "ShooterPanel");
  if (selectorNode.active !== true) {
    throw new Error("Rainbow color guide requires active RainbowColorSelector.");
  }

  var points = [];
  selectorNode.children.forEach(function (childNode) {
    if (!childNode || !childNode.isValid || childNode.active !== true || childNode.name.indexOf("RainbowColor_") !== 0) {
      return;
    }
    var rect = resolveGuideTargetRectInRoot(childNode, host.node);
    points.push(cc.v2(rect.left, rect.bottom));
    points.push(cc.v2(rect.left, rect.top));
    points.push(cc.v2(rect.right, rect.bottom));
    points.push(cc.v2(rect.right, rect.top));
  });
  if (points.length === 0) {
    throw new Error("Rainbow color guide requires visible color buttons.");
  }
  return buildRectFromPoints(points);
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
    if (!Number.isInteger(event.total) || event.total <= 0) {
      throw new Error("Skill powerup collected event requires positive total.");
    }
    if (event.entityType === "crystal_gun") {
      return;
    }
    var entityType = requireSkillPowerupGuideType(event.entityType, "Skill powerup collected event entityType");
    if (collectedTypes.indexOf(entityType) === -1) {
      collectedTypes.push(entityType);
    }
  });
  return collectedTypes;
}

function isIntroduceTipsOverlayActive(host) {
  if (!Array.isArray(host._specialIntroduceQueue)) {
    throw new Error("Skill powerup guide requires special introduce queue.");
  }
  return !!(
    host._specialIntroduceViewActive === true ||
    host._specialIntroduceOpening === true ||
    host._geniusTipsViewActive === true ||
    host._geniusTipsViewOpening === true ||
    host._sartTipsViewActive === true ||
    host._sartTipsViewOpening === true ||
    host._specialIntroduceQueue.length > 0
  );
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
    fingerNode.zIndex = 30;
    fingerNode.opacity = 255;
    fingerNode.active = true;
    this._newUserGuideFingerNode = fingerNode;
    return fingerNode;
  },

  _hideNewUserGuide: function () {
    stopGuideNodeActions(this._newUserGuideFingerNode);
    destroySkillPowerupPropTipsView(this);
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

  _ensureSkillPowerupPropTipsView: function () {
    if (this._skillPowerupPropTipsViewNode && this._skillPowerupPropTipsViewNode.isValid) {
      return Promise.resolve(this._skillPowerupPropTipsViewNode);
    }
    if (this._skillPowerupPropTipsViewPromise) {
      return this._skillPowerupPropTipsViewPromise;
    }

    this._skillPowerupPropTipsViewPromise = this._loadPrefab(PROP_TIPS_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("PropTipsView prefab is required.");
      }
      var layerNode = this._ensureNewUserGuideLayer();
      var viewNode = cc.instantiate(prefab);
      if (!viewNode || !viewNode.isValid) {
        throw new Error("Instantiate PropTipsView prefab failed.");
      }
      if (viewNode.name !== PROP_TIPS_VIEW_NAME) {
        throw new Error("PropTipsView root node name must be " + PROP_TIPS_VIEW_NAME + ".");
      }
      resolvePropTipsLabel(viewNode);
      resolvePropTipsTitleNodes(viewNode);
      viewNode.parent = layerNode;
      syncPropTipsPositionBelowHud(this, viewNode);
      viewNode.zIndex = PROP_TIPS_VIEW_Z_INDEX;
      viewNode.active = true;
      this._skillPowerupPropTipsViewPrefab = prefab;
      this._skillPowerupPropTipsViewNode = viewNode;
      this._skillPowerupPropTipsViewPromise = null;
      return viewNode;
    }.bind(this)).catch(function (error) {
      this._skillPowerupPropTipsViewPromise = null;
      throw error;
    }.bind(this));

    return this._skillPowerupPropTipsViewPromise;
  },

  _showSkillPowerupPropTipsView: function (entityType, step) {
    var text = resolveSkillPowerupGuideTipsText(entityType, step);
    return this._ensureSkillPowerupPropTipsView().then(function (viewNode) {
      viewNode.active = true;
      syncPropTipsPositionBelowHud(this, viewNode);
      viewNode.zIndex = PROP_TIPS_VIEW_Z_INDEX;
      renderPropTipsView(viewNode, {
        text: text,
        titleMode: PROP_TIPS_TITLE_MODE_PROP,
        onTap: null
      });
      return viewNode;
    }.bind(this));
  },

  _showPropTipsView: function (options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("PropTipsView show options must be an object.");
    }
    var text = requireNonEmptyString(options.text, "PropTipsView show text");
    var titleMode = requirePropTipsTitleMode(options.titleMode);
    var onTap = Object.prototype.hasOwnProperty.call(options, "onTap") ? options.onTap : null;
    var layerNode = this._ensureNewUserGuideLayer();
    layerNode.active = true;
    return this._ensureSkillPowerupPropTipsView().then(function (viewNode) {
      viewNode.active = true;
      syncPropTipsPositionBelowHud(this, viewNode);
      viewNode.zIndex = PROP_TIPS_VIEW_Z_INDEX;
      renderPropTipsView(viewNode, {
        text: text,
        titleMode: titleMode,
        onTap: onTap
      });
      return viewNode;
    }.bind(this));
  },

  _hidePropTipsView: function () {
    destroySkillPowerupPropTipsView(this);
  },

  _hideSkillPowerupPropTipsView: function () {
    destroySkillPowerupPropTipsView(this);
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
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      throw new Error("New user guide start game step requires active StartGameView.");
    }
    if (!this._startGameViewController || typeof this._startGameViewController.getPlayButtonNode !== "function") {
      throw new Error("New user guide start game step requires StartGameViewController.getPlayButtonNode.");
    }
    var playButtonNode = this._startGameViewController.getPlayButtonNode();
    var playButtonRect = resolveGuideTargetRectInRoot(playButtonNode, this.node);
    this._applyNewUserGuideMask(expandRect(playButtonRect, BUTTON_HOLE_PADDING));
    return this._showNewUserGuideFingerAtTip(resolveRectCenter(playButtonRect));
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
    this._activeSkillPowerupGuideStep = SKILL_POWERUP_GUIDE_STEP_SELECT;
    return this._showNewUserGuideFingerAtTip(resolveRectCenter(buttonRect)).then(function (fingerNode) {
      return this._showSkillPowerupPropTipsView(safeType, SKILL_POWERUP_GUIDE_STEP_SELECT).then(function () {
        return fingerNode;
      });
    }.bind(this));
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
    if (isIntroduceTipsOverlayActive(this) === true) {
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

  _advanceSkillPowerupGuideAfterSkillSelected: function (entityType, runtimeSnapshot) {
    if (entityType === "crystal_gun" || entityType === "rainbow_prism_ball") {
      return null;
    }
    var safeType = requireSkillPowerupGuideType(entityType, "Skill powerup selected guide type");
    if (this._activeSkillPowerupGuideType !== safeType) {
      return null;
    }
    if (this._activeSkillPowerupGuideStep !== SKILL_POWERUP_GUIDE_STEP_SELECT) {
      return null;
    }

    if (safeType === "blast") {
      this._activeSkillPowerupGuideStep = SKILL_POWERUP_GUIDE_STEP_FIRE;
      var firePoint = resolveGameplayFireGuideTipPoint();
      this._applyNewUserGuideMask(expandRect(buildCenteredFireGuideRect(firePoint), GAMEPLAY_HOLE_PADDING));
      return this._showNewUserGuideFingerAtTip(firePoint).then(function (fingerNode) {
        return this._showSkillPowerupPropTipsView(safeType, SKILL_POWERUP_GUIDE_STEP_FIRE).then(function () {
          return fingerNode;
        });
      }.bind(this));
    }

    if (safeType !== "rainbow") {
      throw new Error("Unsupported skill powerup selected guide type: " + safeType);
    }
    if (!runtimeSnapshot || !runtimeSnapshot.shooter || !runtimeSnapshot.shooter.pendingRainbowColorSelection) {
      throw new Error("Rainbow skill guide requires pendingRainbowColorSelection after selection.");
    }
    this._activeSkillPowerupGuideStep = SKILL_POWERUP_GUIDE_STEP_COLOR;
    return waitMilliseconds(RAINBOW_COLOR_SELECTOR_ANIMATION_WAIT_MS).then(function () {
      if (this._activeSkillPowerupGuideType !== safeType || this._activeSkillPowerupGuideStep !== SKILL_POWERUP_GUIDE_STEP_COLOR) {
        return null;
      }
      var selectorRect = resolveRainbowColorSelectorGuideRect(this);
      this._applyNewUserGuideMask(expandRect(selectorRect, BUTTON_HOLE_PADDING));
      return this._showNewUserGuideFingerAtTip(resolveRectCenter(selectorRect)).then(function (fingerNode) {
        return this._showSkillPowerupPropTipsView(safeType, SKILL_POWERUP_GUIDE_STEP_COLOR).then(function () {
          return fingerNode;
        });
      }.bind(this));
    }.bind(this));
  },

  _advanceSkillPowerupGuideAfterRainbowColorSelected: function (runtimeSnapshot) {
    if (this._activeSkillPowerupGuideType !== "rainbow") {
      return null;
    }
    if (this._activeSkillPowerupGuideStep !== SKILL_POWERUP_GUIDE_STEP_COLOR) {
      return null;
    }
    if (!runtimeSnapshot || !runtimeSnapshot.shooter || runtimeSnapshot.shooter.pendingRainbowColorSelection) {
      throw new Error("Rainbow skill fire guide requires completed color selection.");
    }

    this._activeSkillPowerupGuideStep = SKILL_POWERUP_GUIDE_STEP_FIRE;
    var firePoint = resolveGameplayFireGuideTipPoint();
    this._applyNewUserGuideMask(expandRect(buildCenteredFireGuideRect(firePoint), GAMEPLAY_HOLE_PADDING));
    return this._showNewUserGuideFingerAtTip(firePoint).then(function (fingerNode) {
      return this._showSkillPowerupPropTipsView("rainbow", SKILL_POWERUP_GUIDE_STEP_FIRE).then(function () {
        return fingerNode;
      });
    }.bind(this));
  },

  _completeActiveSkillPowerupFireGuide: function () {
    if (!this._activeSkillPowerupGuideType) {
      return;
    }
    if (this._activeSkillPowerupGuideStep !== SKILL_POWERUP_GUIDE_STEP_FIRE) {
      return;
    }
    this._completeSkillPowerupUseGuide(this._activeSkillPowerupGuideType);
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
    this._activeSkillPowerupGuideStep = "";
    this._hideNewUserGuide();
  }
};
