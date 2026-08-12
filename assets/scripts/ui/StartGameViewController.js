"use strict";

var BundleLoader = require("../utils/BundleLoader");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var POWERUP_DEFINITIONS = [
  { itemId: "plus_three_balls", unlockLevel: 1, iconPath: "ui/image/props/plus_ball", temporary: true },
  { itemId: "three_line_elimination", unlockLevel: 1, iconPath: "ui/image/props/three_line_elimination", temporary: true },
  { itemId: "precise_aim", unlockLevel: 1, iconPath: "ui/image/props/aim" },
  { itemId: "swap_ball", unlockLevel: 5, iconPath: "ui/image/props/change_ball" },
  { itemId: "rainbow_ball", unlockLevel: 10, iconPath: "ui/image/props/rainbow_ball" },
  { itemId: "blast_ball", unlockLevel: 15, iconPath: "ui/image/props/blast_ball" },
  { itemId: "barrier_hammer", unlockLevel: 20, iconPath: "ui/image/props/barrier_hammer" },
  { itemId: "snow_removal", unlockLevel: 16, iconPath: "ui/image/props/snow_removal" }
];
var LOCK_ICON_PATH = "image/commone/lock";
var PROP_ITEM_HORIZONTAL_PADDING = 12;
var PROP_ITEM_SPACING = 16;
var PROP_ITEM_WIDTH = 144;
var PROP_ITEM_ICON_NODE_NAME = "icon";
var ROLE_ITEM_HORIZONTAL_PADDING = 12;
var ROLE_ITEM_SPACING = 16;
var ROLE_ITEM_ICON_NODE_NAME = "icon";
var START_GAME_SPIRIT_AVATAR_PATH_BY_ID = {
  milu: "ui/image/start_view/milu",
  lumi: "ui/image/start_view/lumi",
  noya: "ui/image/start_view/noya",
  flora: "ui/image/start_view/flora",
  loco: "ui/image/start_view/loco",
  kelu: "ui/image/start_view/kelu",
  yumi: "ui/image/start_view/yumi"
};
var START_GAME_RENDER_PROXY_ROOT_NAME = "start_game_render_proxy_root";
var START_GAME_PROP_RENDER_PROXY_ROOT_NAME = "start_game_prop_render_proxy_root";
var START_GAME_ROLE_RENDER_PROXY_ROOT_NAME = "start_game_role_render_proxy_root";
var TIMED_INFINITE_SHOTS_PLAY_MODE = "timed_infinite_shots";
var SHOT_LIMITED_PLAY_MODE = "shot_limited";
var NORMAL_LEVEL_TYPE = "normal";
var TRAPPED_SPRITE_RESCUE_LEVEL_TYPE = "trapped_sprite_rescue";
var START_GAME_RENDER_PROXY_LAYER_NAMES = {
  panel: "start_game_proxy_panel_layer",
  chrome: "start_game_proxy_chrome_layer",
  target: "start_game_proxy_target_layer",
  propBackground: "start_game_proxy_prop_background_layer",
  propIcon: "start_game_proxy_prop_icon_layer",
  propState: "start_game_proxy_prop_state_layer",
  roleBackground: "start_game_proxy_role_background_layer",
  roleIcon: "start_game_proxy_role_icon_layer",
  roleState: "start_game_proxy_role_state_layer"
};

function findNodeByNameRecursive(rootNode, name) {
  if (!rootNode || !rootNode.isValid) {
    return null;
  }
  if (rootNode.name === name) {
    return rootNode;
  }

  var children = rootNode.children;
  if (!Array.isArray(children)) {
    throw new Error("StartGameView node children must be an array.");
  }
  for (var i = 0; i < children.length; i += 1) {
    var found = findNodeByNameRecursive(children[i], name);
    if (found) {
      return found;
    }
  }
  return null;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("StartGameView requires " + description + ".");
  }
  return node;
}

function getValidSize(node, description) {
  requireValidNode(node, description);
  var size = node.getContentSize();
  if (!size || !Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error("StartGameView requires valid size for " + description + ".");
  }
  return size;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  return requireValidNode(parentNode.getChildByName(childName), parentDescription + "/" + childName);
}

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, description) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(description + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function buildClearanceTargetText(options) {
  requireObject(options, "StartGameView clearance target options");
  var oneStarTargetScore = requirePositiveInteger(
    options.oneStarTargetScore,
    "StartGameView one-star target score"
  );
  if (typeof options.playMode !== "string") {
    throw new Error("StartGameView playMode must be a string.");
  }
  if (typeof options.levelType !== "string") {
    throw new Error("StartGameView levelType must be a string.");
  }

  if (options.playMode === TIMED_INFINITE_SHOTS_PLAY_MODE) {
    var timeLimitSeconds = requirePositiveInteger(
      options.timeLimitSeconds,
      "StartGameView timed level timeLimitSeconds"
    );
    return "目标：" + timeLimitSeconds + "秒内掉落全部球球且达到" + oneStarTargetScore + "分";
  }

  if (options.levelType === TRAPPED_SPRITE_RESCUE_LEVEL_TYPE) {
    if (options.playMode !== SHOT_LIMITED_PLAY_MODE) {
      throw new Error("StartGameView rescue level must use shot_limited playMode.");
    }
    return "目标：救出精灵并达到" + oneStarTargetScore + "分";
  }

  if (options.levelType === NORMAL_LEVEL_TYPE && options.playMode === SHOT_LIMITED_PLAY_MODE) {
    return "目标：掉落全部球球且达到" + oneStarTargetScore + "分";
  }

  throw new Error(
    "Unsupported StartGameView clearance target level type/play mode: " +
    options.levelType + "/" + options.playMode
  );
}

function getOrderedPowerupDefinitionsForLevel(levelId) {
  requirePositiveInteger(levelId, "StartGameView powerup order levelId");
  var unlockedEntries = [];
  var lockedEntries = [];
  POWERUP_DEFINITIONS.forEach(function (definition, index) {
    requirePositiveInteger(definition.unlockLevel, "StartGameView powerup unlockLevel `" + definition.itemId + "`");
    var entry = {
      definition: definition,
      originalIndex: index
    };
    if (levelId >= definition.unlockLevel) {
      unlockedEntries.push(entry);
    } else {
      lockedEntries.push(entry);
    }
  });
  lockedEntries.sort(function (left, right) {
    var unlockLevelDelta = left.definition.unlockLevel - right.definition.unlockLevel;
    if (unlockLevelDelta !== 0) {
      return unlockLevelDelta;
    }
    return left.originalIndex - right.originalIndex;
  });
  return unlockedEntries.concat(lockedEntries).map(function (entry) {
    return entry.definition;
  });
}

function getLabel(node, description) {
  var label = requireValidNode(node, description).getComponent(cc.Label);
  if (!label) {
    throw new Error("StartGameView requires " + description + " cc.Label.");
  }
  return label;
}

function scalePropItemDescendant(node, ratio) {
  requireValidNode(node, "StartGameView prop descendant");
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("StartGameView prop scale ratio must be a positive finite number.");
  }
  var position = node.getPosition();
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("StartGameView prop descendant position must be finite.");
  }
  node.setPosition(position.x * ratio, position.y * ratio);
  var size = node.getContentSize();
  if (size && Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0) {
    node.setContentSize(size.width * ratio, size.height * ratio);
  }
  var sprite = node.getComponent(cc.Sprite);
  if (sprite) {
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  }
  var label = node.getComponent(cc.Label);
  if (label) {
    if (!Number.isFinite(label.fontSize) || label.fontSize <= 0) {
      throw new Error("StartGameView prop label fontSize must be positive.");
    }
    if (!Number.isFinite(label.lineHeight) || label.lineHeight <= 0) {
      throw new Error("StartGameView prop label lineHeight must be positive.");
    }
    label.fontSize = Math.max(1, Math.round(label.fontSize * ratio));
    label.lineHeight = Math.max(1, Math.round(label.lineHeight * ratio));
  }
  var children = node.children;
  if (!Array.isArray(children)) {
    throw new Error("StartGameView prop descendant children must be an array.");
  }
  children.forEach(function (child) {
    scalePropItemDescendant(child, ratio);
  });
}

function applyPropItemLayoutSize(propNode, referenceSize, targetWidth) {
  requireValidNode(propNode, "StartGameView prop item");
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("StartGameView prop target width must be a positive finite number.");
  }
  if (!referenceSize || !Number.isFinite(referenceSize.width) || referenceSize.width <= 0 ||
      !Number.isFinite(referenceSize.height) || referenceSize.height <= 0) {
    throw new Error("StartGameView prop reference size must be valid.");
  }
  var ratio = targetWidth / referenceSize.width;
  var targetHeight = referenceSize.height * ratio;
  propNode.setContentSize(targetWidth, targetHeight);
  var children = propNode.children;
  if (!Array.isArray(children)) {
    throw new Error("StartGameView prop item children must be an array.");
  }
  children.forEach(function (child) {
    scalePropItemDescendant(child, ratio);
  });
  return {
    width: targetWidth,
    height: targetHeight
  };
}

function getSprite(node, description) {
  var sprite = requireValidNode(node, description).getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("StartGameView requires " + description + " cc.Sprite.");
  }
  return sprite;
}

function setRawPropIconSpriteFrame(iconNode, spriteFrame, description) {
  requireValidNode(iconNode, description);
  if (!spriteFrame || typeof spriteFrame.getRect !== "function") {
    throw new Error("StartGameView " + description + " spriteFrame is invalid.");
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0 ||
      !Number.isFinite(rect.height) || rect.height <= 0) {
    throw new Error("StartGameView " + description + " spriteFrame size is invalid.");
  }
  var sprite = getSprite(iconNode, description);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.RAW;
}

function setPropIconSpriteFrame(iconNode, spriteFrame, targetWidth, description) {
  requireValidNode(iconNode, description);
  if (!spriteFrame || typeof spriteFrame.getRect !== "function") {
    throw new Error("StartGameView " + description + " spriteFrame is invalid.");
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("StartGameView " + description + " target width is invalid.");
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0 ||
      !Number.isFinite(rect.height) || rect.height <= 0) {
    throw new Error("StartGameView " + description + " spriteFrame size is invalid.");
  }
  var sprite = getSprite(iconNode, description);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  iconNode.setContentSize(targetWidth, targetWidth * rect.height / rect.width);
}

function setLabelText(node, text, description) {
  getLabel(node, description).string = String(text);
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load StartGameView sprite failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("StartGameView sprite frame is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function bindTapOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "StartGameView tap callback");
  if (node[key] === true) {
    return;
  }

  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 0.96;
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    node.scale = 1;
    onTap();
  });
}

function bindTapWithoutScaleOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "StartGameView tap callback");
  if (node[key] === true) {
    return;
  }

  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_START, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    if (event) {
      event.stopPropagation();
    }
  });
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    onTap();
  });
}

function getInventoryCount(inventory, itemId) {
  requireObject(inventory, "StartGameView inventory");
  requireObject(inventory.items, "StartGameView inventory items");
  if (!Object.prototype.hasOwnProperty.call(inventory.items, itemId)) {
    throw new Error("StartGameView inventory missing item count: " + itemId);
  }
  return requireNonNegativeInteger(inventory.items[itemId], "StartGameView inventory item count `" + itemId + "`");
}

function isTemporaryPowerupItem(itemId) {
  return POWERUP_DEFINITIONS.some(function (definition) {
    return definition.itemId === itemId && definition.temporary === true;
  });
}

function normalizeTemporaryPurchases(temporaryPurchasesByItemId) {
  requireObject(temporaryPurchasesByItemId, "StartGameView temporary purchases");
  var output = {};
  POWERUP_DEFINITIONS.forEach(function (definition) {
    if (definition.temporary !== true) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(temporaryPurchasesByItemId, definition.itemId)) {
      throw new Error("StartGameView temporary purchase count missing: " + definition.itemId);
    }
    output[definition.itemId] = requireNonNegativeInteger(
      temporaryPurchasesByItemId[definition.itemId],
      "StartGameView temporary purchase count `" + definition.itemId + "`"
    );
  });
  return output;
}

function getOwnedPowerupCount(renderState, itemId) {
  requireObject(renderState, "StartGameView render state");
  if (isTemporaryPowerupItem(itemId)) {
    return requireNonNegativeInteger(
      renderState.temporaryPurchasesByItemId[itemId],
      "StartGameView temporary purchase count `" + itemId + "`"
    );
  }
  return getInventoryCount(renderState.inventory, itemId);
}

function assertSelectedItems(selectedItems) {
  if (!Array.isArray(selectedItems)) {
    throw new Error("StartGameView selectedItems must be an array.");
  }
  selectedItems.forEach(function (itemId) {
    if (!POWERUP_DEFINITIONS.some(function (definition) { return definition.itemId === itemId; })) {
      throw new Error("StartGameView selected item is unsupported: " + itemId);
    }
  });
}

function normalizePurchaseOptions(purchaseOptionsByItemId) {
  requireObject(purchaseOptionsByItemId, "StartGameView purchase options");
  var output = {};
  POWERUP_DEFINITIONS.forEach(function (definition) {
    var itemId = definition.itemId;
    var option = requireObject(purchaseOptionsByItemId[itemId], "StartGameView purchase option `" + itemId + "`");
    if (typeof option.available !== "boolean") {
      throw new Error("StartGameView purchase available `" + itemId + "` must be boolean.");
    }
    if (typeof option.unavailableMessage !== "string") {
      throw new Error("StartGameView purchase unavailableMessage `" + itemId + "` must be a string.");
    }
    output[itemId] = {
      price: requirePositiveInteger(option.price, "StartGameView purchase price `" + itemId + "`"),
      remaining: requireNonNegativeInteger(option.remaining, "StartGameView purchase remaining `" + itemId + "`"),
      available: option.available,
      unavailableMessage: option.unavailableMessage
    };
  });
  return output;
}

function hasCollectionObjective(objectives) {
  requireObject(objectives, "StartGameView objectives");
  return objectives.ball !== null && objectives.ball !== undefined ||
    objectives.iceSnowball !== null && objectives.iceSnowball !== undefined;
}

function normalizeAssistSpiritState(state) {
  requireObject(state, "StartGameView assist spirit state");
  if (typeof state.equippedSpiritId !== "string" || state.equippedSpiritId.length === 0) {
    throw new Error("StartGameView equippedSpiritId must be a non-empty string.");
  }
  requireObject(state.spirits, "StartGameView assist spirit roster");
  var catalog = AssistSpiritConfig.getCatalog();
  var normalizedSpirits = {};
  catalog.forEach(function (spirit) {
    var entry = requireObject(state.spirits[spirit.id], "StartGameView assist spirit `" + spirit.id + "`");
    if (typeof entry.owned !== "boolean") {
      throw new Error("StartGameView assist spirit owned state must be boolean: " + spirit.id);
    }
    normalizedSpirits[spirit.id] = {
      owned: entry.owned
    };
  });
  if (!normalizedSpirits[state.equippedSpiritId]) {
    throw new Error("StartGameView equipped assist spirit is unsupported: " + state.equippedSpiritId);
  }
  if (normalizedSpirits[state.equippedSpiritId].owned !== true) {
    throw new Error("StartGameView equipped assist spirit must be unlocked.");
  }
  return {
    equippedSpiritId: state.equippedSpiritId,
    spirits: normalizedSpirits
  };
}

function getStartGameSpiritAvatarPath(spiritId) {
  var spirit = AssistSpiritConfig.getSpirit(spiritId);
  var path = START_GAME_SPIRIT_AVATAR_PATH_BY_ID[spirit.id];
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("StartGameView avatar path is missing for assist spirit: " + spirit.id);
  }
  return path;
}

function StartGameViewController(options) {
  requireObject(options, "StartGameViewController options");
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "StartGameViewController onClose");
  this.onPlay = requireFunction(options.onPlay, "StartGameViewController onPlay");
  this.onUnavailable = requireFunction(options.onUnavailable, "StartGameViewController onUnavailable");
  this.onEquipSpirit = requireFunction(options.onEquipSpirit, "StartGameViewController onEquipSpirit");
  this.onPurchasePowerup = requireFunction(options.onPurchasePowerup, "StartGameViewController onPurchasePowerup");
  this.onOpenPropDescription = requireFunction(options.onOpenPropDescription, "StartGameViewController onOpenPropDescription");
  this._nodes = this._resolveNodes();
  this._propNodes = [];
  this._roleNodes = [];
  this._spriteFrames = {};
  this._spriteLoadPromise = null;
  this._renderState = null;
  this._selectedItems = [];
  this._propItemLayoutSize = null;
  this._purchaseInProgressItemId = "";
  this._renderProxyRoot = null;
  this._renderProxyLayers = {};
  this._renderProxyRecords = [];
  this._propRenderProxyRoot = null;
  this._propRenderProxyLayers = {};
  this._propRenderProxyRecords = [];
  this._roleRenderProxyRoot = null;
  this._roleRenderProxyLayers = {};
  this._roleRenderProxyRecords = [];
  this._initPropNodes();
  this._initRoleNodes();
  this._bindActions();
}

StartGameViewController.prototype._resolveNodes = function () {
  var panelNode = requireValidNode(findNodeByNameRecursive(this.node, "Panel"), "Panel");
  var titleBgNode = requireChildNode(panelNode, "title_bg", "Panel");
  var playButtonNode = requireChildNode(panelNode, "play_btn", "Panel");
  var targetNode = requireChildNode(panelNode, "target", "Panel");
  var targetScoreBgNode = requireChildNode(panelNode, "target_score_bg", "Panel");
  var targetLayoutNode = requireChildNode(targetNode, "traget_layout", "Panel/target");
  var targetBallNode = requireChildNode(targetLayoutNode, "target_ball", "Panel/target/traget_layout");
  var targetIceNode = requireChildNode(targetLayoutNode, "target_ice", "Panel/target/traget_layout");
  var targetSpiritNode = requireChildNode(targetLayoutNode, "target_spirit", "Panel/target/traget_layout");
  var propNode = requireChildNode(panelNode, "prop_node", "Panel");
  var propListNode = requireChildNode(propNode, "prop_listview", "Panel/prop_node");
  var propViewNode = requireChildNode(propListNode, "view", "Panel/prop_node/prop_listview");
  var propContentNode = requireChildNode(propViewNode, "content", "Panel/prop_node/prop_listview/view");
  var propTemplateNode = requireChildNode(propContentNode, "prop", "Panel/prop_node/prop_listview/view/content");
  var roleNode = requireChildNode(panelNode, "role_node", "Panel");
  var roleListNode = requireChildNode(roleNode, "role_listview", "Panel/role_node");
  var roleViewNode = requireChildNode(roleListNode, "view", "Panel/role_node/role_listview");
  var roleContentNode = requireChildNode(roleViewNode, "content", "Panel/role_node/role_listview/view");
  var roleTemplateNode = requireChildNode(roleContentNode, "role", "Panel/role_node/role_listview/view/content");
  var scrollView = propListNode.getComponent(cc.ScrollView);
  var roleScrollView = roleListNode.getComponent(cc.ScrollView);
  if (!scrollView) {
    throw new Error("StartGameView prop_listview requires cc.ScrollView.");
  }
  if (scrollView.content !== propContentNode) {
    throw new Error("StartGameView prop_listview ScrollView.content must be Panel/prop_listview/view/content.");
  }
  if (!roleScrollView) {
    throw new Error("StartGameView role_listview requires cc.ScrollView.");
  }
  if (roleScrollView.content !== roleContentNode) {
    throw new Error("StartGameView role_listview ScrollView.content must be Panel/role_listview/view/content.");
  }

  return {
    mask: requireValidNode(findNodeByNameRecursive(this.node, "mask"), "mask"),
    panel: panelNode,
    closeButton: requireChildNode(titleBgNode, "btn_close", "Panel/title_bg"),
    levelLabelNode: requireChildNode(titleBgNode, "level", "Panel/title_bg"),
    playButton: playButtonNode,
    staminaCostLabelNode: requireChildNode(playButtonNode, "num", "Panel/play_btn"),
    targetNode: targetNode,
    targetScoreLabelNode: requireChildNode(targetScoreBgNode, "target_score", "Panel/target_score_bg"),
    targetLayoutNode: targetLayoutNode,
    targetBallNode: targetBallNode,
    targetBallCountLabelNode: requireChildNode(targetBallNode, "num", "Panel/target/traget_layout/target_ball"),
    targetIceNode: targetIceNode,
    targetIceCountLabelNode: requireChildNode(targetIceNode, "num", "Panel/target/traget_layout/target_ice"),
    targetSpiritNode: targetSpiritNode,
    propNode: propNode,
    propListNode: propListNode,
    propViewNode: propViewNode,
    propContentNode: propContentNode,
    propScrollView: scrollView,
    propTemplateNode: propTemplateNode,
    roleListNode: roleListNode,
    roleViewNode: roleViewNode,
    roleContentNode: roleContentNode,
    roleScrollView: roleScrollView,
    roleTemplateNode: roleTemplateNode,
    directionsButton: requireChildNode(propNode, "directions_btn", "Panel/prop_node")
  };
};

StartGameViewController.prototype.getPlayButtonNode = function () {
  return requireValidNode(this._nodes.playButton, "StartGameView play_btn");
};

StartGameViewController.prototype._renderStartGameTargetSlot = function (objective, iconNode, countLabelNode, description) {
  if (!objective) {
    iconNode.active = false;
    return;
  }

  requireObject(objective, "StartGameView objective");
  requirePositiveInteger(objective.target, "StartGameView objective target");
  if (typeof objective.iconPath !== "string" || objective.iconPath.length === 0) {
    throw new Error("StartGameView objective iconPath must be a non-empty string.");
  }

  iconNode.active = true;
  setLabelText(countLabelNode, String(objective.target), description + "/num");
  getSprite(iconNode, description).spriteFrame = this._spriteFrames[objective.iconPath];
};

StartGameViewController.prototype._updateTargetLayout = function () {
  var layout = requireValidNode(this._nodes.targetLayoutNode, "Panel/target/traget_layout").getComponent(cc.Layout);
  if (!layout) {
    throw new Error("StartGameView target layout requires cc.Layout.");
  }
  if (typeof layout.updateLayout !== "function") {
    throw new Error("StartGameView target layout requires cc.Layout.updateLayout.");
  }
  layout.updateLayout();
};

StartGameViewController.prototype._updatePanelLayout = function () {
  var layout = requireValidNode(this._nodes.panel, "Panel").getComponent(cc.Layout);
  if (!layout) {
    throw new Error("StartGameView Panel requires cc.Layout.");
  }
  if (typeof layout.updateLayout !== "function") {
    throw new Error("StartGameView Panel requires cc.Layout.updateLayout.");
  }
  layout.updateLayout();
};

StartGameViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__startGameCloseTapBound", this.onClose);
  bindTapWithoutScaleOnce(this._nodes.mask, "__startGameMaskTapBound", this.onClose);
  bindTapOnce(this._nodes.directionsButton, "__startGameDirectionsTapBound", this.onOpenPropDescription);
  bindTapOnce(this._nodes.playButton, "__startGamePlayTapBound", function () {
    if (this._purchaseInProgressItemId) {
      this.onUnavailable("购买处理中，请稍候");
      return;
    }
    this.onPlay(this._selectedItems.slice());
  }.bind(this));
  this._bindProxySyncToNode(this._nodes.closeButton);
  this._bindProxySyncToNode(this._nodes.playButton);
  this._bindProxySyncToNode(this._nodes.directionsButton);
};

StartGameViewController.prototype._bindProxySyncToNode = function (node) {
  requireValidNode(node, "StartGameView proxy sync node");
  if (node.__startGameProxySyncBound === true) {
    return;
  }
  node.__startGameProxySyncBound = true;
  node.on(cc.Node.EventType.TOUCH_START, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_CANCEL, function () {
    this._syncRenderProxies();
  }, this);
  node.on(cc.Node.EventType.TOUCH_END, function () {
    this._syncRenderProxies();
  }, this);
};

StartGameViewController.prototype._ensureRenderProxyLayers = function () {
  if (
    this._renderProxyRoot && this._renderProxyRoot.isValid &&
    this._propRenderProxyRoot && this._propRenderProxyRoot.isValid &&
    this._roleRenderProxyRoot && this._roleRenderProxyRoot.isValid
  ) {
    return;
  }

  var root = SpriteProxyLayerHelper.createProxyRoot(this.node, {
    name: START_GAME_RENDER_PROXY_ROOT_NAME,
    zIndex: 0
  });
  root.setSiblingIndex(this._nodes.panel.getSiblingIndex());
  this._renderProxyRoot = root;
  this._renderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(root, [
    { key: "panel", name: START_GAME_RENDER_PROXY_LAYER_NAMES.panel, zIndex: 0 },
    { key: "chrome", name: START_GAME_RENDER_PROXY_LAYER_NAMES.chrome, zIndex: 1 },
    { key: "target", name: START_GAME_RENDER_PROXY_LAYER_NAMES.target, zIndex: 2 },
    { key: "propBackground", name: START_GAME_RENDER_PROXY_LAYER_NAMES.propBackground, zIndex: 3 },
    { key: "roleBackground", name: START_GAME_RENDER_PROXY_LAYER_NAMES.roleBackground, zIndex: 4 }
  ]);

  var propRoot = SpriteProxyLayerHelper.createProxyRoot(this._nodes.propContentNode, {
    name: START_GAME_PROP_RENDER_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._propRenderProxyRoot = propRoot;
  this._propRenderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(propRoot, [
    { key: "propBackground", name: START_GAME_RENDER_PROXY_LAYER_NAMES.propBackground, zIndex: 0 },
    { key: "propIcon", name: START_GAME_RENDER_PROXY_LAYER_NAMES.propIcon, zIndex: 1 },
    { key: "propState", name: START_GAME_RENDER_PROXY_LAYER_NAMES.propState, zIndex: 2 }
  ]);

  var roleRoot = SpriteProxyLayerHelper.createProxyRoot(this._nodes.roleContentNode, {
    name: START_GAME_ROLE_RENDER_PROXY_ROOT_NAME,
    zIndex: -1
  });
  this._roleRenderProxyRoot = roleRoot;
  this._roleRenderProxyLayers = SpriteProxyLayerHelper.createProxyLayers(roleRoot, [
    { key: "roleState", name: START_GAME_RENDER_PROXY_LAYER_NAMES.roleState, zIndex: 0 },
    { key: "roleIcon", name: START_GAME_RENDER_PROXY_LAYER_NAMES.roleIcon, zIndex: 1 }
  ]);
};

StartGameViewController.prototype._clearRenderProxyRecords = function () {
  SpriteProxyLayerHelper.clearRecords(this._renderProxyRecords);
  SpriteProxyLayerHelper.clearRecords(this._propRenderProxyRecords);
  SpriteProxyLayerHelper.clearRecords(this._roleRenderProxyRecords);
};

StartGameViewController.prototype._createRoleSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._roleRenderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("StartGameView role render proxy layer is invalid: " + layerKey);
  }
  var record = SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._roleRenderProxyRoot,
    name: name,
    visible: visible === true
  });
  this._roleRenderProxyRecords.push(record);
  return record;
};

StartGameViewController.prototype._createSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._renderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("StartGameView render proxy layer is invalid: " + layerKey);
  }
  this._renderProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._renderProxyRoot,
    name: name,
    visible: visible === true
  }));
};

StartGameViewController.prototype._createPropSpriteProxyRecord = function (layerKey, sourceNode, name, visible) {
  var layerNode = this._propRenderProxyLayers[layerKey];
  if (!layerNode || !layerNode.isValid) {
    throw new Error("StartGameView prop render proxy layer is invalid: " + layerKey);
  }
  this._propRenderProxyRecords.push(SpriteProxyLayerHelper.createRecord({
    layerNode: layerNode,
    sourceNode: sourceNode,
    rootNode: this._propRenderProxyRoot,
    name: name,
    visible: visible === true
  }));
};

StartGameViewController.prototype._hideStaticSourceSprites = function () {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.panel, false, "StartGameView Panel background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.closeButton, false, "StartGameView close button");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.playButton, false, "StartGameView play_btn");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(requireChildNode(this._nodes.playButton, "love", "Panel/play_btn"), false, "StartGameView play_btn/love");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.targetNode, false, "StartGameView target");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.targetBallNode, false, "StartGameView target_ball");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.targetIceNode, false, "StartGameView target_ice");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.targetSpiritNode, false, "StartGameView target_spirit");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.propListNode, false, "StartGameView prop_listview");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(this._nodes.roleListNode, false, "StartGameView role_listview");
};

StartGameViewController.prototype._hideRoleSourceSprites = function (entry) {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.iconNode, false, "StartGameView role icon");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.selectNode, false, "StartGameView role select");
};

StartGameViewController.prototype._setRoleAvatarGrayState = function (entry, grayed) {
  if (typeof grayed !== "boolean") {
    throw new Error("StartGameView role gray state must be boolean: " + entry.spirit.id);
  }
  if (!cc.Material || typeof cc.Material.getBuiltinMaterial !== "function") {
    throw new Error("StartGameView role gray state requires cc.Material.getBuiltinMaterial.");
  }
  var materialName = grayed ? "2d-gray-sprite" : "2d-sprite";
  var material = cc.Material.getBuiltinMaterial(materialName);
  if (!material) {
    throw new Error("StartGameView role material is missing: " + materialName);
  }
  [entry.iconNode, entry.iconProxyRecord && entry.iconProxyRecord.proxyNode].forEach(function (node) {
    if (!node) {
      return;
    }
    var sprite = getSprite(node, "StartGameView role avatar");
    if (typeof sprite.setMaterial !== "function") {
      throw new Error("StartGameView role avatar requires Sprite.setMaterial.");
    }
    if (!sprite.setMaterial(0, material)) {
      throw new Error("StartGameView failed to apply role material: " + materialName);
    }
  });
};

StartGameViewController.prototype._hidePropSourceSprites = function (entry) {
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.node, false, "StartGameView prop background");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.iconNode, false, "StartGameView prop icon");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.selectNode, false, "StartGameView prop select");
  SpriteProxyLayerHelper.setSpriteRenderEnabled(entry.coinNode, false, "StartGameView prop coin");
};

StartGameViewController.prototype._rebuildRenderProxies = function () {
  this._ensureRenderProxyLayers();
  this._clearRenderProxyRecords();
  this._hideStaticSourceSprites();

  this._createSpriteProxyRecord("panel", this._nodes.panel, "start_game_panel_bg_proxy", true);
  this._createSpriteProxyRecord("chrome", this._nodes.closeButton, "start_game_close_button_proxy", true);
  this._createSpriteProxyRecord("chrome", this._nodes.playButton, "start_game_play_button_proxy", true);
  this._createSpriteProxyRecord("chrome", requireChildNode(this._nodes.playButton, "love", "Panel/play_btn"), "start_game_play_love_proxy", true);
  var targetVisible = this._nodes.targetNode.active === true;
  this._createSpriteProxyRecord("target", this._nodes.targetNode, "start_game_target_bg_proxy", targetVisible);
  this._createSpriteProxyRecord("target", this._nodes.targetBallNode, "start_game_target_ball_proxy", targetVisible && this._nodes.targetBallNode.active === true);
  this._createSpriteProxyRecord("target", this._nodes.targetIceNode, "start_game_target_ice_proxy", targetVisible && this._nodes.targetIceNode.active === true);
  this._createSpriteProxyRecord("target", this._nodes.targetSpiritNode, "start_game_target_spirit_proxy", targetVisible && this._nodes.targetSpiritNode.active === true);
  this._createSpriteProxyRecord("propBackground", this._nodes.propListNode, "start_game_prop_list_bg_proxy", true);
  this._createSpriteProxyRecord("roleBackground", this._nodes.roleListNode, "start_game_role_list_bg_proxy", true);

  this._propNodes.forEach(function (entry, index) {
    this._hidePropSourceSprites(entry);
    this._createPropSpriteProxyRecord("propBackground", entry.node, "start_game_prop_bg_proxy_" + index, true);
    this._createPropSpriteProxyRecord("propIcon", entry.iconNode, "start_game_prop_icon_proxy_" + index, true);
    this._createPropSpriteProxyRecord("propState", entry.selectNode, "start_game_prop_select_proxy_" + index, true);
    this._createPropSpriteProxyRecord("propState", entry.coinNode, "start_game_prop_coin_proxy_" + index, true);
  }, this);

  this._roleNodes.forEach(function (entry, index) {
    this._hideRoleSourceSprites(entry);
    entry.iconProxyRecord = this._createRoleSpriteProxyRecord("roleIcon", entry.iconNode, "start_game_role_icon_proxy_" + index, true);
    this._createRoleSpriteProxyRecord("roleState", entry.selectNode, "start_game_role_select_proxy_" + index, true);
    this._setRoleAvatarGrayState(entry, entry.owned !== true);
  }, this);

  SpriteProxyLayerHelper.enableRecordAutoSync(this._renderProxyRoot, this._renderProxyRecords);
  SpriteProxyLayerHelper.enableRecordAutoSync(this._propRenderProxyRoot, this._propRenderProxyRecords);
  SpriteProxyLayerHelper.enableRecordAutoSync(this._roleRenderProxyRoot, this._roleRenderProxyRecords);
};

StartGameViewController.prototype._syncRenderProxies = function () {
  if (
    !this._renderProxyRoot || !this._renderProxyRoot.isValid ||
    !this._propRenderProxyRoot || !this._propRenderProxyRoot.isValid ||
    !this._roleRenderProxyRoot || !this._roleRenderProxyRoot.isValid
  ) {
    return;
  }
  SpriteProxyLayerHelper.syncRecords(this._renderProxyRecords, this._renderProxyRoot);
  SpriteProxyLayerHelper.syncRecords(this._propRenderProxyRecords, this._propRenderProxyRoot);
  SpriteProxyLayerHelper.syncRecords(this._roleRenderProxyRecords, this._roleRenderProxyRoot);
};

StartGameViewController.prototype._layoutPropNodes = function () {
  var contentNode = requireValidNode(this._nodes.propContentNode, "Panel/prop_listview/view/content");
  var viewSize = getValidSize(this._nodes.propViewNode, "Panel/prop_listview/view");
  var itemSize = this._propItemLayoutSize;
  if (!itemSize || !Number.isFinite(itemSize.width) || itemSize.width <= 0 ||
      !Number.isFinite(itemSize.height) || itemSize.height <= 0) {
    throw new Error("StartGameView prop item layout size is required.");
  }
  var contentAnchor = contentNode.getAnchorPoint();
  var itemAnchor = this._nodes.propTemplateNode.getAnchorPoint();
  var itemY = this._nodes.propTemplateNode.y;
  if (!Number.isFinite(itemY)) {
    throw new Error("StartGameView prop template y must be finite.");
  }
  var contentWidth = Math.max(
    viewSize.width,
    PROP_ITEM_HORIZONTAL_PADDING * 2 + itemSize.width * this._propNodes.length + PROP_ITEM_SPACING * (this._propNodes.length - 1)
  );
  contentNode.setContentSize(contentWidth, viewSize.height);

  this._propNodes.forEach(function (entry, index) {
    var x = -contentWidth * contentAnchor.x + PROP_ITEM_HORIZONTAL_PADDING + itemSize.width * itemAnchor.x + (itemSize.width + PROP_ITEM_SPACING) * index;
    entry.node.setPosition(x, itemY);
  }, this);
};

StartGameViewController.prototype._syncPropNodeOrderForLevel = function (levelId) {
  var orderedDefinitions = getOrderedPowerupDefinitionsForLevel(levelId);
  var entriesByItemId = {};
  this._propNodes.forEach(function (entry) {
    var itemId = entry.definition.itemId;
    if (entriesByItemId[itemId]) {
      throw new Error("StartGameView prop node duplicated for item: " + itemId);
    }
    entriesByItemId[itemId] = entry;
  });

  this._propNodes = orderedDefinitions.map(function (definition, index) {
    var entry = entriesByItemId[definition.itemId];
    if (!entry) {
      throw new Error("StartGameView prop node missing for item: " + definition.itemId);
    }
    entry.node.setSiblingIndex(index);
    return entry;
  });
  this._layoutPropNodes();
};

StartGameViewController.prototype._resetPropListScrollPosition = function () {
  var scrollView = this._nodes.propScrollView;
  var contentNode = requireValidNode(this._nodes.propContentNode, "Panel/prop_listview/view/content");
  if (!scrollView || scrollView.content !== contentNode) {
    throw new Error("StartGameView prop_listview ScrollView.content is invalid.");
  }
  if (typeof scrollView.stopAutoScroll !== "function") {
    throw new Error("StartGameView prop_listview ScrollView requires stopAutoScroll.");
  }
  if (typeof scrollView.scrollToLeft !== "function") {
    throw new Error("StartGameView prop_listview ScrollView requires scrollToLeft.");
  }

  scrollView.stopAutoScroll();
  scrollView.scrollToLeft(0);
  this._syncRenderProxies();
};

StartGameViewController.prototype._layoutRoleNodes = function () {
  var contentNode = requireValidNode(this._nodes.roleContentNode, "Panel/role_listview/view/content");
  var viewSize = getValidSize(this._nodes.roleViewNode, "Panel/role_listview/view");
  var itemSize = getValidSize(this._nodes.roleTemplateNode, "Panel/role_listview/view/content/role");
  var contentAnchor = contentNode.getAnchorPoint();
  var itemAnchor = this._nodes.roleTemplateNode.getAnchorPoint();
  var itemY = this._nodes.roleTemplateNode.y;
  if (!Number.isFinite(itemY)) {
    throw new Error("StartGameView role template y must be finite.");
  }
  var contentWidth = Math.max(
    viewSize.width,
    ROLE_ITEM_HORIZONTAL_PADDING * 2 + itemSize.width * this._roleNodes.length + ROLE_ITEM_SPACING * (this._roleNodes.length - 1)
  );
  contentNode.setContentSize(contentWidth, viewSize.height);
  this._roleNodes.forEach(function (entry, index) {
    var x = -contentWidth * contentAnchor.x + ROLE_ITEM_HORIZONTAL_PADDING + itemSize.width * itemAnchor.x + (itemSize.width + ROLE_ITEM_SPACING) * index;
    entry.node.setPosition(x, itemY);
  });
};

StartGameViewController.prototype._resetRoleListScrollPosition = function () {
  var scrollView = this._nodes.roleScrollView;
  var contentNode = requireValidNode(this._nodes.roleContentNode, "Panel/role_listview/view/content");
  if (!scrollView || scrollView.content !== contentNode) {
    throw new Error("StartGameView role_listview ScrollView.content is invalid.");
  }
  if (typeof scrollView.stopAutoScroll !== "function" || typeof scrollView.scrollToLeft !== "function") {
    throw new Error("StartGameView role_listview requires horizontal scroll APIs.");
  }
  scrollView.stopAutoScroll();
  scrollView.scrollToLeft(0);
  this._syncRenderProxies();
};

StartGameViewController.prototype._initPropNodes = function () {
  var propContentNode = requireValidNode(this._nodes.propContentNode, "Panel/prop_listview/view/content");
  var propTemplateNode = requireValidNode(this._nodes.propTemplateNode, "Panel/prop_listview/view/content/prop");
  var referenceSize = getValidSize(propTemplateNode, "Panel/prop_listview/view/content/prop");
  this._propItemLayoutSize = applyPropItemLayoutSize(propTemplateNode, referenceSize, PROP_ITEM_WIDTH);
  POWERUP_DEFINITIONS.forEach(function (definition, index) {
    var propNode = index === 0 ? propTemplateNode : cc.instantiate(propTemplateNode);
    if (index > 0) {
      propNode.parent = propContentNode;
    }
    propNode.name = "prop_" + definition.itemId;
    propNode.active = true;
    var coinNode = requireChildNode(propNode, "coin", propNode.name);
    this._propNodes.push({
      definition: definition,
      node: propNode,
      iconNode: requireChildNode(propNode, "icon", propNode.name),
      numNode: requireChildNode(propNode, "num", propNode.name),
      coinNode: coinNode,
      coinPriceNode: requireChildNode(coinNode, "num", propNode.name + "/coin"),
      limitNode: requireChildNode(propNode, "limit", propNode.name),
      selectNode: requireChildNode(propNode, "select", propNode.name)
    });
  }, this);
  this._layoutPropNodes();
  this._resetPropListScrollPosition();

  this._propNodes.forEach(function (entry) {
    bindTapOnce(entry.node, "__startGamePropTapBound", function () {
      this._onPropTap(entry.definition.itemId);
    }.bind(this));
    this._bindProxySyncToNode(entry.node);
  }, this);
};

StartGameViewController.prototype._initRoleNodes = function () {
  var roleContentNode = requireValidNode(this._nodes.roleContentNode, "Panel/role_listview/view/content");
  var roleTemplateNode = requireValidNode(this._nodes.roleTemplateNode, "Panel/role_listview/view/content/role");
  AssistSpiritConfig.getCatalog().forEach(function (spirit, index) {
    var roleNode = index === 0 ? roleTemplateNode : cc.instantiate(roleTemplateNode);
    if (index > 0) {
      roleNode.parent = roleContentNode;
    }
    roleNode.name = "role_" + spirit.id;
    roleNode.active = true;
    var entry = {
      spirit: spirit,
      node: roleNode,
      iconNode: requireChildNode(roleNode, ROLE_ITEM_ICON_NODE_NAME, roleNode.name),
      selectNode: requireChildNode(roleNode, "select", roleNode.name),
      nameNode: requireChildNode(roleNode, "name", roleNode.name),
      iconProxyRecord: null,
      owned: false
    };
    this._roleNodes.push(entry);
    bindTapOnce(roleNode, "__startGameRoleTapBound", function () {
      this._onRoleTap(spirit.id);
    }.bind(this));
    this._bindProxySyncToNode(roleNode);
  }, this);
  this._layoutRoleNodes();
  this._resetRoleListScrollPosition();
};

StartGameViewController.prototype._renderRoleItems = function (assistSpiritState) {
  var state = normalizeAssistSpiritState(assistSpiritState);
  this._roleNodes.forEach(function (entry) {
    var spiritState = state.spirits[entry.spirit.id];
    entry.owned = spiritState.owned;
    setPropIconSpriteFrame(
      entry.iconNode,
      this._spriteFrames[getStartGameSpiritAvatarPath(entry.spirit.id)],
      getValidSize(entry.iconNode, entry.node.name + "/icon").width,
      entry.node.name + "/icon"
    );
    setLabelText(entry.nameNode, entry.spirit.displayName, entry.node.name + "/name");
    entry.selectNode.active = state.equippedSpiritId === entry.spirit.id;
    this._setRoleAvatarGrayState(entry, entry.owned !== true);
  }, this);
};

StartGameViewController.prototype._onRoleTap = function (spiritId) {
  if (!this._renderState || !this._renderState.assistSpiritState) {
    throw new Error("StartGameView assist spirit state is required before selecting a role.");
  }
  var spirit = AssistSpiritConfig.getSpirit(spiritId);
  var state = normalizeAssistSpiritState(this._renderState.assistSpiritState);
  if (state.spirits[spirit.id].owned !== true) {
    this.onUnavailable(AssistSpiritConfig.NOT_UNLOCKED_TIP);
    return;
  }
  this.onEquipSpirit(spirit.id);
};

StartGameViewController.prototype._getRequiredSpritePaths = function (options) {
  requireObject(options, "StartGameView render options");
  requireObject(options.objectives, "StartGameView objectives");
  var paths = [LOCK_ICON_PATH];
  [options.objectives.ball, options.objectives.iceSnowball].forEach(function (objective) {
    if (!objective) {
      return;
    }
    if (typeof objective.iconPath !== "string" || objective.iconPath.length === 0) {
      throw new Error("StartGameView objective iconPath must be a non-empty string.");
    }
    paths.push(objective.iconPath);
  });
  POWERUP_DEFINITIONS.forEach(function (definition) {
    paths.push(definition.iconPath);
  });
  AssistSpiritConfig.getCatalog().forEach(function (spirit) {
    paths.push(getStartGameSpiritAvatarPath(spirit.id));
  });
  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

StartGameViewController.prototype._ensureSpriteFrames = function (options) {
  var paths = this._getRequiredSpritePaths(options);
  var missingPaths = paths.filter(function (path) {
    return !this._spriteFrames[path];
  }, this);
  if (missingPaths.length === 0) {
    return Promise.resolve(this._spriteFrames);
  }
  if (this._spriteLoadPromise) {
    return this._spriteLoadPromise.then(function () {
      return this._ensureSpriteFrames(options);
    }.bind(this));
  }

  this._spriteLoadPromise = Promise.all(missingPaths.map(function (path) {
    return loadSpriteFrame(path).then(function (spriteFrame) {
      return {
        path: path,
        spriteFrame: spriteFrame
      };
    });
  })).then(function (results) {
    results.forEach(function (entry) {
      if (!entry || typeof entry.path !== "string" || !entry.spriteFrame) {
        throw new Error("StartGameView sprite load result is invalid.");
      }
      this._spriteFrames[entry.path] = entry.spriteFrame;
    }, this);
    this._spriteLoadPromise = null;
    return this._spriteFrames;
  }.bind(this)).catch(function (error) {
    this._spriteLoadPromise = null;
    throw error;
  }.bind(this));

  return this._spriteLoadPromise;
};

StartGameViewController.prototype._onPropTap = function (itemId) {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before selecting props.");
  }
  var definition = POWERUP_DEFINITIONS.filter(function (entry) {
    return entry.itemId === itemId;
  })[0];
  if (!definition) {
    throw new Error("StartGameView prop item is unsupported: " + itemId);
  }
  var levelId = this._renderState.levelId;
  var unlocked = levelId >= definition.unlockLevel;
  if (!unlocked) {
    this.onUnavailable(definition.unlockLevel + "关解锁");
    return;
  }

  var index = this._selectedItems.indexOf(itemId);
  if (index >= 0) {
    if (isTemporaryPowerupItem(itemId)) {
      this.onUnavailable("已购买，本局开始后生效");
      return;
    }
    this._selectedItems.splice(index, 1);
    this._renderPropSelectionState();
    this._syncRenderProxies();
    return;
  }

  var count = getOwnedPowerupCount(this._renderState, itemId);
  if (count <= 0) {
    this._purchasePowerupAndSelect(itemId);
    return;
  }

  this._selectedItems.push(itemId);
  this._renderPropSelectionState();
  this._syncRenderProxies();
};

StartGameViewController.prototype._purchasePowerupAndSelect = function (itemId) {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before purchasing props.");
  }
  var purchaseOption = this._renderState.purchaseOptionsByItemId[itemId];
  if (!purchaseOption) {
    throw new Error("StartGameView purchase option missing for item: " + itemId);
  }
  if (purchaseOption.available !== true) {
    if (purchaseOption.unavailableMessage.length === 0) {
      throw new Error("StartGameView unavailable purchase option requires message: " + itemId);
    }
    this.onUnavailable(purchaseOption.unavailableMessage);
    return;
  }
  if (purchaseOption.remaining <= 0) {
    this.onUnavailable("今日售罄");
    return;
  }
  if (this._purchaseInProgressItemId) {
    this.onUnavailable("购买处理中，请稍候");
    return;
  }

  this._purchaseInProgressItemId = itemId;
  Promise.resolve(this.onPurchasePowerup(itemId)).then(function (purchaseResult) {
    if (!purchaseResult || typeof purchaseResult.accepted !== "boolean") {
      throw new Error("StartGameView purchase result is invalid.");
    }
    if (!purchaseResult.accepted) {
      this.onUnavailable(purchaseResult.message);
      return;
    }
    if (purchaseResult.inventory !== undefined) {
      requireObject(purchaseResult.inventory, "StartGameView purchase result inventory");
      this._renderState.inventory = purchaseResult.inventory;
    }
    if (purchaseResult.temporaryPurchasesByItemId !== undefined) {
      this._renderState.temporaryPurchasesByItemId = normalizeTemporaryPurchases(purchaseResult.temporaryPurchasesByItemId);
    }
    if (purchaseResult.purchaseOptionsByItemId !== undefined) {
      this._renderState.purchaseOptionsByItemId = normalizePurchaseOptions(purchaseResult.purchaseOptionsByItemId);
    }
    if (getOwnedPowerupCount(this._renderState, itemId) <= 0) {
      throw new Error("StartGameView purchased item must be available: " + itemId);
    }
    if (this._selectedItems.indexOf(itemId) < 0) {
      this._selectedItems.push(itemId);
    }
    this._renderPropItems();
    this._renderPropSelectionState();
    this._syncRenderProxies();
  }.bind(this)).catch(function (error) {
    this.onUnavailable(error && error.message ? error.message : String(error));
  }.bind(this)).then(function () {
    this._purchaseInProgressItemId = "";
  }.bind(this));
};

StartGameViewController.prototype._renderPropItems = function () {
  if (!this._renderState) {
    throw new Error("StartGameView render state is required before rendering props.");
  }
  var levelId = this._renderState.levelId;
  var purchaseOptionsByItemId = this._renderState.purchaseOptionsByItemId;
  this._propNodes.forEach(function (entry) {
    var definition = entry.definition;
    var unlocked = levelId >= definition.unlockLevel;
    var iconPath = unlocked ? definition.iconPath : LOCK_ICON_PATH;
    var spriteFrame = this._spriteFrames[iconPath];
    if (!spriteFrame) {
      throw new Error("StartGameView prop icon sprite frame is missing: " + iconPath);
    }
    setRawPropIconSpriteFrame(
      entry.iconNode,
      spriteFrame,
      entry.node.name + "/icon"
    );
    entry.numNode.active = unlocked;
    entry.coinNode.active = false;
    entry.limitNode.active = true;
    if (unlocked) {
      var count = getOwnedPowerupCount(this._renderState, definition.itemId);
      if (count > 0) {
        setLabelText(entry.numNode, String(count), entry.node.name + "/num");
        setLabelText(entry.limitNode, "可使用", entry.node.name + "/limit");
      } else {
        var purchaseOption = purchaseOptionsByItemId[definition.itemId];
        if (!purchaseOption) {
          throw new Error("StartGameView purchase option missing for item: " + definition.itemId);
        }
        entry.numNode.active = false;
        if (purchaseOption.available !== true) {
          if (purchaseOption.unavailableMessage.length === 0) {
            throw new Error("StartGameView unavailable purchase option requires message: " + definition.itemId);
          }
          setLabelText(entry.limitNode, purchaseOption.unavailableMessage, entry.node.name + "/limit");
        } else if (purchaseOption.remaining > 0) {
          entry.coinNode.active = true;
          entry.limitNode.active = false;
          setLabelText(entry.coinPriceNode, String(purchaseOption.price), entry.node.name + "/coin/num");
        } else {
          setLabelText(entry.limitNode, "今日售罄", entry.node.name + "/limit");
        }
      }
    } else {
      setLabelText(entry.limitNode, definition.unlockLevel + "关解锁", entry.node.name + "/limit");
      var selectedIndex = this._selectedItems.indexOf(definition.itemId);
      if (selectedIndex >= 0) {
        this._selectedItems.splice(selectedIndex, 1);
      }
    }
  }, this);
};

StartGameViewController.prototype._renderPropSelectionState = function () {
  this._propNodes.forEach(function (entry) {
    entry.selectNode.active = this._selectedItems.indexOf(entry.definition.itemId) >= 0;
  }, this);
};

StartGameViewController.prototype._renderContent = function (options, shouldResetScrollPosition) {
  var levelId = requirePositiveInteger(options.levelId, "StartGameView levelId");
  var staminaCost = requirePositiveInteger(options.staminaCost, "StartGameView staminaCost");
  var oneStarTargetScore = requirePositiveInteger(options.oneStarTargetScore, "StartGameView one-star target score");
  var clearanceTargetText = buildClearanceTargetText({
    oneStarTargetScore: oneStarTargetScore,
    playMode: options.playMode,
    levelType: options.levelType,
    timeLimitSeconds: options.timeLimitSeconds
  });
  requireObject(options.inventory, "StartGameView inventory");
  requireObject(options.objectives, "StartGameView objectives");
  var assistSpiritState = normalizeAssistSpiritState(options.assistSpiritState);
  var temporaryPurchasesByItemId = normalizeTemporaryPurchases(options.temporaryPurchasesByItemId);
  if (
    !options.objectives.ball &&
    !options.objectives.iceSnowball &&
    options.levelType !== TRAPPED_SPRITE_RESCUE_LEVEL_TYPE
  ) {
    throw new Error("StartGameView requires at least one collection objective.");
  }
  if (typeof options.showAwardTips !== "boolean") {
    throw new Error("StartGameView showAwardTips must be boolean.");
  }
  assertSelectedItems(options.selectedItems);
  var purchaseOptionsByItemId = normalizePurchaseOptions(options.purchaseOptionsByItemId);

  this._renderState = {
    levelId: levelId,
    inventory: options.inventory,
    assistSpiritState: assistSpiritState,
    temporaryPurchasesByItemId: temporaryPurchasesByItemId,
    purchaseOptionsByItemId: purchaseOptionsByItemId
  };
  var renderState = this._renderState;
  this._selectedItems = options.selectedItems.filter(function (itemId, index, list) {
    var definition = POWERUP_DEFINITIONS.filter(function (entry) {
      return entry.itemId === itemId;
    })[0];
    if (!definition) {
      throw new Error("StartGameView selected item is unsupported: " + itemId);
    }
    return list.indexOf(itemId) === index &&
      levelId >= definition.unlockLevel &&
      getOwnedPowerupCount(renderState, itemId) > 0;
  });

  setLabelText(this._nodes.levelLabelNode, "第" + levelId + "关", "Panel/title_bg/level");
  setLabelText(this._nodes.staminaCostLabelNode, String(staminaCost), "Panel/play_btn/num");
  var isRescueLevel = options.levelType === TRAPPED_SPRITE_RESCUE_LEVEL_TYPE;
  var showCollectionTarget = hasCollectionObjective(options.objectives);
  setLabelText(
    this._nodes.targetScoreLabelNode,
    clearanceTargetText,
    "Panel/target_score_bg/target_score"
  );
  this._renderStartGameTargetSlot(
    options.objectives.ball,
    this._nodes.targetBallNode,
    this._nodes.targetBallCountLabelNode,
    "Panel/target/traget_layout/target_ball"
  );
  this._renderStartGameTargetSlot(
    options.objectives.iceSnowball,
    this._nodes.targetIceNode,
    this._nodes.targetIceCountLabelNode,
    "Panel/target/traget_layout/target_ice"
  );
  this._nodes.targetNode.active = showCollectionTarget;
  this._nodes.targetSpiritNode.active = showCollectionTarget && isRescueLevel;
  if (showCollectionTarget) {
    this._updateTargetLayout();
  }
  this._updatePanelLayout();

  this._renderRoleItems(assistSpiritState);
  this._syncPropNodeOrderForLevel(levelId);
  this._renderPropItems();
  this._renderPropSelectionState();
  this._rebuildRenderProxies();
  if (shouldResetScrollPosition) {
    this._resetPropListScrollPosition();
    this._resetRoleListScrollPosition();
  }
};

StartGameViewController.prototype.render = function (options, shouldResetScrollPosition) {
  requireObject(options, "StartGameView render options");
  if (typeof shouldResetScrollPosition !== "boolean") {
    throw new Error("StartGameView shouldResetScrollPosition must be boolean.");
  }
  if (typeof options.showAwardTips !== "boolean") {
    throw new Error("StartGameView showAwardTips must be boolean.");
  }
  return this._ensureSpriteFrames(options).then(function () {
    this._renderContent(options, shouldResetScrollPosition);
  }.bind(this));
};

StartGameViewController.POWERUP_DEFINITIONS = POWERUP_DEFINITIONS.slice();
StartGameViewController.buildClearanceTargetText = buildClearanceTargetText;

module.exports = StartGameViewController;
