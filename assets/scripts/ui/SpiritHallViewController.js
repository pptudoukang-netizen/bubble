"use strict";

var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var SELECTED_COLOR = cc.color(255, 236, 83, 255);
var NORMAL_COLOR = cc.color(255, 255, 255, 255);
var UPGRADE_EFFECT_MAGIC_CIRCLE_NODES = [
  "source__upgrade_magic_circle",
  "proxy__upgrade_magic_circle"
];
var UPGRADE_EFFECT_LIGHT_NODES = [
  "source__upgrade_light",
  "proxy__upgrade_light"
];

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function collectNamedNodes(rootNode, nodeMap) {
  requireValidNode(rootNode, "SpiritHallView traversal root");
  if (Object.prototype.hasOwnProperty.call(nodeMap, rootNode.name)) {
    throw new Error("SpiritHallView contains duplicate node name: " + rootNode.name);
  }
  nodeMap[rootNode.name] = rootNode;
  rootNode.children.forEach(function (childNode) {
    collectNamedNodes(childNode, nodeMap);
  });
}

function requireNamedNode(nodeMap, nodeName) {
  var node = nodeMap[nodeName];
  if (!node || !node.isValid) {
    throw new Error("SpiritHallView node is required: " + nodeName);
  }
  return node;
}

function requireLabel(nodeMap, nodeName) {
  var label = requireNamedNode(nodeMap, nodeName).getComponent(cc.Label);
  if (!label) {
    throw new Error("SpiritHallView label component is required: " + nodeName);
  }
  return label;
}

function requireSprite(nodeMap, nodeName) {
  var sprite = requireNamedNode(nodeMap, nodeName).getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("SpiritHallView sprite component is required: " + nodeName);
  }
  return sprite;
}

function requireProgressBar(nodeMap, nodeName) {
  var progressBar = requireNamedNode(nodeMap, nodeName).getComponent(cc.ProgressBar);
  if (!progressBar) {
    throw new Error("SpiritHallView ProgressBar component is required: " + nodeName);
  }
  return progressBar;
}

function requireCallback(options, key) {
  if (typeof options[key] !== "function") {
    throw new Error("SpiritHallViewController requires " + key + " callback.");
  }
  return options[key];
}

function requireOperationAccepted(value, description) {
  if (typeof value !== "boolean") {
    throw new Error(description + " must return boolean accepted state.");
  }
  return value;
}

function requireUpgradeEffectActionApi() {
  ["sequence", "spawn", "fadeTo", "scaleTo", "rotateBy", "callFunc"].forEach(function (methodName) {
    if (typeof cc[methodName] !== "function") {
      throw new Error("SpiritHallView upgrade effect requires cc." + methodName + ".");
    }
  });
}

function buildMagicCircleAction() {
  return cc.sequence(
    cc.spawn(
      cc.fadeTo(0.16, 255),
      cc.scaleTo(0.22, 1)
    ),
    cc.spawn(
      cc.rotateBy(0.54, 60),
      cc.scaleTo(0.54, 1.08)
    ),
    cc.spawn(
      cc.fadeTo(0.3, 0),
      cc.scaleTo(0.3, 1.22)
    )
  );
}

function buildLightAction(onComplete) {
  var actions = [
    cc.spawn(
      cc.fadeTo(0.18, 255),
      cc.scaleTo(0.18, 0.9)
    ),
    cc.spawn(
      cc.fadeTo(0.58, 230),
      cc.scaleTo(0.58, 1.08)
    ),
    cc.spawn(
      cc.fadeTo(0.3, 0),
      cc.scaleTo(0.3, 1.24)
    )
  ];
  if (onComplete) {
    actions.push(cc.callFunc(onComplete));
  }
  return cc.sequence.apply(cc, actions);
}

function formatInteger(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("SpiritHallView integer display value must be non-negative.");
  }
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCoinValue(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("SpiritHallView coin value must be a non-negative integer.");
  }
  if (value < 10000) {
    return formatInteger(value);
  }
  var tenThousands = Math.floor(value / 1000) / 10;
  return String(tenThousands).replace(/\.0$/, "") + "万";
}

function SpiritHallViewController(options) {
  assertObject(options, "SpiritHallViewController options");
  this.node = requireValidNode(options.node, "SpiritHallViewController node");
  this.onClose = requireCallback(options, "onClose");
  this.onUpgrade = requireCallback(options, "onUpgrade");
  this.onEquip = requireCallback(options, "onEquip");
  this.onOpenShop = requireCallback(options, "onOpenShop");
  this.onUnavailableTab = requireCallback(options, "onUnavailableTab");
  assertObject(options.spriteFrameCache, "SpiritHallViewController spriteFrameCache");
  this.spriteFrameCache = options.spriteFrameCache;
  this.catalog = AssistSpiritConfig.getCatalog();
  this.nodeMap = {};
  collectNamedNodes(this.node, this.nodeMap);
  this.selectedSpiritId = "";
  this._pendingUpgradeEffectCount = 0;
  this._upgradeEffectPlaying = false;
  this._bindActions();
}

SpiritHallViewController.prototype._bindButton = function (nodeName, callback) {
  var node = requireNamedNode(this.nodeMap, nodeName);
  if (!node.getComponent(cc.Button)) {
    throw new Error("SpiritHallView button component is required: " + nodeName);
  }
  node.on("click", callback, this);
};

SpiritHallViewController.prototype._bindActions = function () {
  this._bindButton("source__back_button", function () {
    this.onClose();
  });
  this._bindButton("source__hero_left_arrow", function () {
    this._selectOffset(-1);
  });
  this._bindButton("source__hero_right_arrow", function () {
    this._selectOffset(1);
  });
  this._bindButton("source__roster_left_arrow", function () {
    this._selectOffset(-1);
  });
  this._bindButton("source__roster_right_arrow", function () {
    this._selectOffset(1);
  });
  this.catalog.forEach(function (spirit) {
    this._bindButton("source__" + spirit.id + "_frame", function () {
      this.selectedSpiritId = spirit.id;
      this._renderSelectedSpirit();
    });
  }, this);
  this._bindButton("source__upgrade_button", function () {
    if (requireOperationAccepted(
      this.onUpgrade(this.selectedSpiritId),
      "SpiritHallView onUpgrade"
    )) {
      this.playUpgradeEffect();
    }
  });
  this._bindButton("source__battle_button", function () {
    this.onEquip(this.selectedSpiritId);
  });
  this._bindButton("source__shop_tab", function () {
    this.onOpenShop();
  });
  [
    "source__home_tab",
    "source__bond_tab",
    "source__growth_tab"
  ].forEach(function (nodeName) {
    this._bindButton(nodeName, function () {
      this.onUnavailableTab();
    });
  }, this);
};

SpiritHallViewController.prototype._selectOffset = function (offset) {
  if (!Number.isInteger(offset) || Math.abs(offset) !== 1) {
    throw new Error("SpiritHallView selection offset must be -1 or 1.");
  }
  var currentIndex = this.catalog.findIndex(function (spirit) {
    return spirit.id === this.selectedSpiritId;
  }, this);
  if (currentIndex < 0) {
    throw new Error("SpiritHallView selected spirit is not in catalog: " + this.selectedSpiritId);
  }
  var nextIndex = (currentIndex + offset + this.catalog.length) % this.catalog.length;
  this.selectedSpiritId = this.catalog[nextIndex].id;
  this._renderSelectedSpirit();
};

SpiritHallViewController.prototype._setLabel = function (nodeName, value) {
  requireLabel(this.nodeMap, nodeName).string = String(value);
};

SpiritHallViewController.prototype._setAbilityEffectDetail = function (nodeName, value) {
  var node = requireNamedNode(this.nodeMap, nodeName);
  var label = requireLabel(this.nodeMap, nodeName);
  node.setContentSize(190, 54);
  label.fontSize = 20;
  label.lineHeight = 25;
  this._setLabel(nodeName, value);
};

SpiritHallViewController.prototype._setSpriteFrame = function (nodeName, path) {
  var spriteFrame = this.spriteFrameCache[path];
  if (!spriteFrame) {
    throw new Error("SpiritHallView sprite frame is not loaded: " + path);
  }
  requireSprite(this.nodeMap, nodeName).spriteFrame = spriteFrame;
};

SpiritHallViewController.prototype._setSpriteFrameAtOriginalSize = function (nodeName, path) {
  var spriteFrame = this.spriteFrameCache[path];
  if (!spriteFrame) {
    throw new Error("SpiritHallView SpriteFrame is not loaded: " + path);
  }
  if (typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error("SpiritHallView SpriteFrame.getOriginalSize is required: " + path);
  }
  var originalSize = spriteFrame.getOriginalSize();
  if (
    !originalSize ||
    !Number.isFinite(originalSize.width) ||
    originalSize.width <= 0 ||
    !Number.isFinite(originalSize.height) ||
    originalSize.height <= 0
  ) {
    throw new Error("SpiritHallView SpriteFrame original size is invalid: " + path);
  }
  var node = requireNamedNode(this.nodeMap, nodeName);
  var sprite = requireSprite(this.nodeMap, nodeName);
  if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.RAW === undefined) {
    throw new Error("SpiritHallView requires cc.Sprite.SizeMode.RAW.");
  }
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.RAW;
  sprite.trim = false;
  node.setContentSize(originalSize.width, originalSize.height);
};

SpiritHallViewController.prototype._setSpriteGrayState = function (nodeName, grayed) {
  if (typeof grayed !== "boolean") {
    throw new Error("SpiritHallView gray state must be boolean: " + nodeName);
  }
  if (!cc.Material || typeof cc.Material.getBuiltinMaterial !== "function") {
    throw new Error("SpiritHallView requires cc.Material.getBuiltinMaterial.");
  }
  var sprite = requireSprite(this.nodeMap, nodeName);
  if (sprite.__spiritHallGrayed === grayed) {
    return;
  }
  if (typeof sprite.setMaterial !== "function") {
    throw new Error("SpiritHallView Sprite.setMaterial is required: " + nodeName);
  }
  var materialName = grayed ? "2d-gray-sprite" : "2d-sprite";
  var material = cc.Material.getBuiltinMaterial(materialName);
  if (!material) {
    throw new Error("SpiritHallView built-in material is missing: " + materialName);
  }
  var appliedMaterial = sprite.setMaterial(0, material);
  if (!appliedMaterial) {
    throw new Error("SpiritHallView failed to apply material: " + materialName + " at " + nodeName);
  }
  sprite.__spiritHallGrayed = grayed;
};

SpiritHallViewController.prototype._setButtonInteractable = function (nodeName, interactable) {
  if (typeof interactable !== "boolean") {
    throw new Error("SpiritHallView button interactable must be boolean: " + nodeName);
  }
  var sourceNode = requireNamedNode(this.nodeMap, nodeName);
  var button = sourceNode.getComponent(cc.Button);
  if (!button) {
    throw new Error("SpiritHallView button component is required: " + nodeName);
  }
  button.interactable = interactable;
  if (!button.target || !button.target.isValid) {
    throw new Error("SpiritHallView button target is required: " + nodeName);
  }
  button.target.opacity = interactable ? 255 : 150;
};

SpiritHallViewController.prototype._setNodeActive = function (nodeName, active) {
  if (typeof active !== "boolean") {
    throw new Error("SpiritHallView node active state must be boolean: " + nodeName);
  }
  requireNamedNode(this.nodeMap, nodeName).active = active;
};

SpiritHallViewController.prototype._canUpgradeSpirit = function (entry) {
  if (entry.owned !== true) {
    return false;
  }
  if (!Number.isInteger(entry.fragments) || entry.fragments < 0) {
    throw new Error("SpiritHallView spirit fragments must be a non-negative integer.");
  }
  var levelCost = AssistSpiritConfig.getLevelUpFragmentCost(entry.level);
  return levelCost !== null && entry.fragments >= levelCost;
};

SpiritHallViewController.prototype._requireUpgradeEffectNodes = function () {
  return {
    magicCircleNodes: UPGRADE_EFFECT_MAGIC_CIRCLE_NODES.map(function (nodeName) {
      return requireNamedNode(this.nodeMap, nodeName);
    }, this),
    lightNodes: UPGRADE_EFFECT_LIGHT_NODES.map(function (nodeName) {
      return requireNamedNode(this.nodeMap, nodeName);
    }, this)
  };
};

SpiritHallViewController.prototype.playUpgradeEffect = function () {
  this._pendingUpgradeEffectCount += 1;
  this._playNextUpgradeEffect();
};

SpiritHallViewController.prototype._playNextUpgradeEffect = function () {
  if (this._upgradeEffectPlaying || this._pendingUpgradeEffectCount === 0) {
    return false;
  }
  requireUpgradeEffectActionApi();
  var effectNodes = this._requireUpgradeEffectNodes();
  this._pendingUpgradeEffectCount -= 1;
  this._upgradeEffectPlaying = true;

  effectNodes.magicCircleNodes.forEach(function (node) {
    node.stopAllActions();
    node.active = true;
    node.opacity = 0;
    node.angle = 0;
    node.setScale(0.58);
    node.runAction(buildMagicCircleAction());
  });
  effectNodes.lightNodes.forEach(function (node, nodeIndex) {
    node.stopAllActions();
    node.active = true;
    node.opacity = 0;
    node.angle = 0;
    node.setScale(0.52);
    node.runAction(buildLightAction(
      nodeIndex === effectNodes.lightNodes.length - 1
        ? this._finishUpgradeEffect.bind(this)
        : null
    ));
  }, this);
  return true;
};

SpiritHallViewController.prototype._finishUpgradeEffect = function () {
  if (!this._upgradeEffectPlaying) {
    throw new Error("SpiritHallView upgrade effect finished without active playback.");
  }
  var effectNodes = this._requireUpgradeEffectNodes();
  effectNodes.magicCircleNodes.concat(effectNodes.lightNodes).forEach(function (node) {
    node.stopAllActions();
    node.opacity = 0;
    node.active = false;
  });
  this._upgradeEffectPlaying = false;
  this._playNextUpgradeEffect();
};

SpiritHallViewController.prototype._requireStateEntry = function (spiritId) {
  var entry = this.state.spirits[spiritId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("SpiritHallView state is missing spirit: " + spiritId);
  }
  return entry;
};

SpiritHallViewController.prototype._renderRosterSelection = function () {
  this.catalog.forEach(function (spirit) {
    var selected = spirit.id === this.selectedSpiritId;
    var entry = this._requireStateEntry(spirit.id);
    var frameNode = requireNamedNode(this.nodeMap, "proxy__" + spirit.id + "_frame");
    var avatarNode = requireNamedNode(this.nodeMap, "proxy__" + spirit.id + "_avatar");
    var nameNode = requireNamedNode(this.nodeMap, spirit.id + "_name");
    frameNode.scale = selected ? 1.14 : 1;
    avatarNode.scale = selected ? 1.1 : 1;
    nameNode.color = selected ? SELECTED_COLOR : NORMAL_COLOR;
    this._setSpriteGrayState("proxy__" + spirit.id + "_avatar", entry.owned !== true);
    var showUpgradeNotification = this._canUpgradeSpirit(entry);
    this._setNodeActive("source__" + spirit.id + "_upgrade_notification", showUpgradeNotification);
    this._setNodeActive("proxy__" + spirit.id + "_upgrade_notification", showUpgradeNotification);
  }, this);
};

SpiritHallViewController.prototype._renderSelectedSpirit = function () {
  if (!this.state) {
    throw new Error("SpiritHallView must receive state before rendering selection.");
  }
  var spirit = AssistSpiritConfig.getSpirit(this.selectedSpiritId);
  var entry = this._requireStateEntry(spirit.id);
  var currentAbility = AssistSpiritConfig.getAbilityLevelPresentation(spirit.id, entry.level);
  var nextLevel = entry.level < AssistSpiritConfig.MAX_LEVEL ? entry.level + 1 : entry.level;
  var nextAbility = AssistSpiritConfig.getAbilityLevelPresentation(spirit.id, nextLevel);
  var levelCost = AssistSpiritConfig.getLevelUpFragmentCost(entry.level);

  this._setSpriteFrameAtOriginalSize("proxy__selected_role", spirit.rolePath);
  this._setSpriteFrame("proxy__hero_element_icon", spirit.elementIconPath);
  this._setSpriteFrame("proxy__ability_icon", spirit.abilityIconPath);
  this._setSpriteFrame("proxy__upgrade_fragment_icon", spirit.fragmentIconPath);
  this._setLabel("hero_name", spirit.title);
  this._setLabel("hero_level", "Lv." + entry.level);
  this._setLabel("ability_kind_value", spirit.abilityKind);
  this._setLabel("current_probability_label", currentAbility.statLabel);
  this._setLabel("current_probability_stat_value", currentAbility.statValue);
  this._setLabel("next_probability_label", nextAbility.statLabel.replace("当前", "下级"));
  this._setLabel("next_probability_stat_value", nextAbility.statValue);
  this._setLabel("fragment_count_value", formatInteger(entry.fragments));
  this._setLabel("ability_name", spirit.abilityName);
  this._setLabel("ability_kind_tag", spirit.abilityKindTag);
  this._setLabel("ability_description", currentAbility.description);
  this._setLabel("current_probability_title", "Lv." + entry.level + " 当前效果");
  this._setAbilityEffectDetail("current_probability_value", currentAbility.detail);
  this._setLabel(
    "next_probability_title",
    entry.level < AssistSpiritConfig.MAX_LEVEL ? ("Lv." + nextLevel + " 下级效果") : "已达最高等级"
  );
  this._setAbilityEffectDetail(
    "next_probability_value",
    entry.level < AssistSpiritConfig.MAX_LEVEL ? nextAbility.detail : "已达最高等级"
  );

  requireProgressBar(this.nodeMap, "proxy__ability_kind_bar_base").progress = spirit.abilityKindProgress;
  requireProgressBar(this.nodeMap, "proxy__current_probability_bar_base").progress = entry.level / AssistSpiritConfig.MAX_LEVEL;
  requireProgressBar(this.nodeMap, "proxy__next_probability_bar_base").progress = nextLevel / AssistSpiritConfig.MAX_LEVEL;
  requireProgressBar(this.nodeMap, "proxy__fragment_count_bar_base").progress = levelCost === null
    ? 1
    : Math.min(1, entry.fragments / levelCost);

  this._setLabel("upgrade_cost", levelCost === null ? "已满级" : (formatInteger(entry.fragments) + "/" + formatInteger(levelCost)));
  this._setButtonInteractable("source__upgrade_button", entry.owned !== true || levelCost !== null);
  var equipped = this.state.equippedSpiritId === spirit.id;
  this._setLabel("battle_text", equipped ? "出战中" : "出战");
  this._setButtonInteractable("source__battle_button", !equipped);
  this._renderRosterSelection();
};

SpiritHallViewController.prototype.render = function (snapshot) {
  assertObject(snapshot, "SpiritHallView snapshot");
  if (!Number.isInteger(snapshot.coins) || snapshot.coins < 0) {
    throw new Error("SpiritHallView snapshot coins must be a non-negative integer.");
  }
  if (!Number.isInteger(snapshot.gems) || snapshot.gems < 0) {
    throw new Error("SpiritHallView snapshot gems must be a non-negative integer.");
  }
  assertObject(snapshot.state, "SpiritHallView snapshot state");
  AssistSpiritConfig.getSpirit(snapshot.state.equippedSpiritId);
  assertObject(snapshot.state.spirits, "SpiritHallView snapshot roster");
  this.state = JSON.parse(JSON.stringify(snapshot.state));
  if (!this.selectedSpiritId) {
    this.selectedSpiritId = this.state.equippedSpiritId;
  }
  AssistSpiritConfig.getSpirit(this.selectedSpiritId);

  var equippedSpirit = AssistSpiritConfig.getSpirit(this.state.equippedSpiritId);
  var equippedEntry = this._requireStateEntry(equippedSpirit.id);

  this._setLabel("coin_value", formatCoinValue(snapshot.coins));
  this._setLabel("crystal_value", formatInteger(snapshot.gems));
  this._setSpriteFrame("proxy__current_card_avatar_frame", equippedSpirit.framePath);
  this._setSpriteFrame("proxy__current_card_avatar", equippedSpirit.avatarPath);
  this._setLabel("current_card_name", equippedSpirit.displayName + " Lv." + equippedEntry.level);
  this._renderSelectedSpirit();
};

module.exports = SpiritHallViewController;
