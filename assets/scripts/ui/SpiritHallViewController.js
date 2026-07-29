"use strict";

var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var SELECTED_COLOR = cc.color(255, 236, 83, 255);
var NORMAL_COLOR = cc.color(255, 255, 255, 255);

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
    throw new Error("SpiritHallViewController requires " + key + ".");
  }
  return options[key];
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

function buildStars(stars) {
  if (!Number.isInteger(stars) || stars < 1 || stars > AssistSpiritConfig.MAX_STARS) {
    throw new Error("SpiritHallView star value is invalid.");
  }
  return new Array(stars + 1).join("★");
}

function SpiritHallViewController(options) {
  assertObject(options, "SpiritHallViewController options");
  this.node = requireValidNode(options.node, "SpiritHallViewController node");
  this.onClose = requireCallback(options, "onClose");
  this.onUpgrade = requireCallback(options, "onUpgrade");
  this.onAdvance = requireCallback(options, "onAdvance");
  this.onEquip = requireCallback(options, "onEquip");
  assertObject(options.spriteFrameCache, "SpiritHallViewController spriteFrameCache");
  this.spriteFrameCache = options.spriteFrameCache;
  this.catalog = AssistSpiritConfig.getCatalog();
  this.nodeMap = {};
  collectNamedNodes(this.node, this.nodeMap);
  this.selectedSpiritId = "";
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
    this.onUpgrade(this.selectedSpiritId);
  });
  this._bindButton("source__advance_button", function () {
    this.onAdvance(this.selectedSpiritId);
  });
  this._bindButton("source__battle_button", function () {
    this.onEquip(this.selectedSpiritId);
  });
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
    var frameNode = requireNamedNode(this.nodeMap, "proxy__" + spirit.id + "_frame");
    var avatarNode = requireNamedNode(this.nodeMap, "proxy__" + spirit.id + "_avatar");
    var nameNode = requireNamedNode(this.nodeMap, spirit.id + "_name");
    frameNode.scale = selected ? 1.14 : 1;
    avatarNode.scale = selected ? 1.1 : 1;
    nameNode.color = selected ? SELECTED_COLOR : NORMAL_COLOR;
  }, this);
};

SpiritHallViewController.prototype._renderSelectedSpirit = function () {
  if (!this.state) {
    throw new Error("SpiritHallView must receive state before rendering selection.");
  }
  var spirit = AssistSpiritConfig.getSpirit(this.selectedSpiritId);
  var entry = this._requireStateEntry(spirit.id);
  var currentProbability = AssistSpiritConfig.getProbability(spirit.id, entry.level);
  var nextLevel = entry.level < AssistSpiritConfig.MAX_LEVEL ? entry.level + 1 : entry.level;
  var nextProbability = AssistSpiritConfig.getProbability(spirit.id, nextLevel);
  var levelCost = AssistSpiritConfig.getLevelUpCoinCost(entry.level);
  var starCost = AssistSpiritConfig.getStarUpFragmentCost(entry.stars);

  this._setSpriteFrameAtOriginalSize("proxy__selected_role", spirit.rolePath);
  this._setSpriteFrame("proxy__hero_element_icon", spirit.elementIconPath);
  this._setSpriteFrame("proxy__ability_icon", spirit.abilityIconPath);
  this._setLabel("hero_name", spirit.title);
  this._setLabel("hero_level", "Lv." + entry.level);
  this._setLabel("hero_stars", buildStars(entry.stars));
  this._setLabel("ability_kind_value", spirit.abilityKind);
  this._setLabel("current_probability_stat_value", currentProbability + "%");
  this._setLabel("next_probability_stat_value", nextProbability + "%");
  this._setLabel("rarity_value", buildStars(entry.stars));
  this._setLabel("ability_name", spirit.abilityName);
  this._setLabel("ability_kind_tag", spirit.abilityKindTag);
  this._setLabel("ability_description", spirit.description);
  this._setLabel("current_probability_title", "Lv." + entry.level + " 当前概率");
  this._setLabel("current_probability_value", currentProbability + "%");
  this._setLabel(
    "next_probability_title",
    entry.level < AssistSpiritConfig.MAX_LEVEL ? ("Lv." + nextLevel + " 下级概率") : "已达最高等级"
  );
  this._setLabel("next_probability_value", nextProbability + "%");

  requireProgressBar(this.nodeMap, "proxy__ability_kind_bar_base").progress = spirit.abilityKindProgress;
  requireProgressBar(this.nodeMap, "proxy__current_probability_bar_base").progress = currentProbability / 30;
  requireProgressBar(this.nodeMap, "proxy__next_probability_bar_base").progress = nextProbability / 30;
  requireProgressBar(this.nodeMap, "proxy__rarity_bar_base").progress = entry.stars / AssistSpiritConfig.MAX_STARS;

  this._setLabel("upgrade_cost", levelCost === null ? "已满级" : formatInteger(levelCost));
  this._setLabel(
    "advance_cost",
    starCost === null ? "已满星" : (formatInteger(entry.fragments) + "/" + formatInteger(starCost))
  );
  this._setButtonInteractable("source__upgrade_button", levelCost !== null);
  this._setButtonInteractable("source__advance_button", starCost !== null);
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
  var totalStars = 0;
  var totalFragments = 0;
  this.catalog.forEach(function (spirit) {
    var entry = this._requireStateEntry(spirit.id);
    totalStars += entry.stars;
    totalFragments += entry.fragments;
  }, this);

  this._setLabel("coin_value", formatCoinValue(snapshot.coins));
  this._setLabel("crystal_value", formatInteger(totalStars));
  this._setLabel("shard_value", formatInteger(totalFragments));
  this._setSpriteFrame("proxy__current_card_avatar_frame", equippedSpirit.framePath);
  this._setSpriteFrame("proxy__current_card_avatar", equippedSpirit.avatarPath);
  this._setLabel("current_card_stars", buildStars(equippedEntry.stars));
  this._setLabel("current_card_name", equippedSpirit.displayName + " Lv." + equippedEntry.level);
  this._renderSelectedSpirit();
};

module.exports = SpiritHallViewController;
