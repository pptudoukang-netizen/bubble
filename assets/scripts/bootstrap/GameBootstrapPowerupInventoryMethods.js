"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var InventoryStore = Shared.InventoryStore;
var SelectedPowerupsStore = Shared.SelectedPowerupsStore;
var BackpackViewController = Shared.BackpackViewController;
var StartGameViewController = Shared.StartGameViewController;
var PopupPanelAnimator = Shared.PopupPanelAnimator;
var StarRatingPolicy = Shared.StarRatingPolicy;
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");
var PopupPresentationHelper = require("../utils/PopupPresentationHelper");
var PropDescriptionConfig = require("../config/PropDescriptionConfig");
var LevelColorPermutation = require("../config/LevelColorPermutation");
var PropDescriptionViewController = require("../ui/PropDescriptionViewController");
var INVENTORY_VIEW_PREFAB_PATH = Shared.INVENTORY_VIEW_PREFAB_PATH;
var START_GAME_VIEW_PREFAB_PATH = Shared.START_GAME_VIEW_PREFAB_PATH;
var POWER_TIPS_VIEW_PREFAB_PATH = Shared.POWER_TIPS_VIEW_PREFAB_PATH;
var PROP_DESCRIPTION_VIEW_PREFAB_PATH = Shared.PROP_DESCRIPTION_VIEW_PREFAB_PATH;
var POWERUP_TYPE_BY_ITEM_ID = Shared.POWERUP_TYPE_BY_ITEM_ID;
var ITEM_ID_BY_POWERUP_TYPE = Shared.ITEM_ID_BY_POWERUP_TYPE;
var STAMINA_FLY_ICON_PATH = "ui/image/props/love";
var STAMINA_FLY_DURATION = 0.45;
var POWER_TIPS_PROXY_ROOT_NAME = "power_tips_auto_proxy_root";
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");
var STAMINA_FLY_FADE_DURATION = 0.12;
var STAMINA_FLY_ENTER_DELAY = 1;
var LEVEL_ENTRY_STAMINA_COST = 1;
var START_GAME_POWERUP_UNLOCK_LEVEL_BY_ITEM_ID = {
  swap_ball: 5,
  rainbow_ball: 10,
  blast_ball: 15,
  barrier_hammer: 20,
  snow_removal: 16,
  three_line_elimination: 1,
  plus_three_balls: 1,
  precise_aim: 1
};
var START_GAME_PERSISTENT_POWERUP_ITEM_IDS = ["precise_aim", "swap_ball", "rainbow_ball", "blast_ball", "barrier_hammer", "snow_removal"];
var START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID = {
  three_line_elimination: {
    displayName: "消三行",
    adRunPowerupType: "three_line_elimination",
    price: 300
  },
  plus_three_balls: {
    displayName: "加十球",
    adRunPowerupType: "plus_three_balls",
    price: 300
  }
};
var START_GAME_OBJECTIVE_ICON_PATHS = {
  R: "ui/image/preview_balls/red_ball",
  G: "ui/image/preview_balls/green_ball",
  B: "ui/image/preview_balls/blue_ball",
  Y: "ui/image/preview_balls/yellow_ball",
  P: "ui/image/preview_balls/purple_ball",
  RAINBOW: "ui/image/preview_balls/rainbow_ball",
  ICE_SNOWBALL: "ui/image/preview_balls/ice_ball"
};
var START_GAME_COLLECTION_OBJECTIVE_TYPES = {
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true
};
var START_GAME_NATIVE_TEMPLATE_AD_SHOW_DELAY_SEC = 0.3;
var START_GAME_AD_LOG_LABEL = "StartGameAd";
var START_GAME_PROP_DESCRIPTION_VIEW_Z_INDEX = 350;

function loadPropDescriptionSpriteFrame(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("StartGameView prop description sprite path must be a non-empty string.");
  }
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load StartGameView prop description sprite failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("StartGameView prop description sprite frame is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function retainPropDescriptionSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    throw new Error("StartGameView prop description sprite frame is required: " + path);
  }
  if (typeof spriteFrame.addRef !== "function") {
    throw new Error("StartGameView prop description sprite frame addRef is required: " + path);
  }
  spriteFrame.addRef();
  return spriteFrame;
}

function releaseRetainedPropDescriptionSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    return;
  }
  if (typeof spriteFrame.decRef !== "function") {
    throw new Error("StartGameView prop description sprite frame decRef is required: " + path);
  }
  spriteFrame.decRef();
}

function releaseStartGamePropDescriptionSpriteFrameCache(host) {
  var cache = host._startGamePropDescriptionSpriteFrameCache;
  if (!cache) {
    host._startGamePropDescriptionSpriteFrameCache = {};
    return;
  }
  if (typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error("StartGameView prop description sprite frame cache must be an object before release.");
  }
  Object.keys(cache).forEach(function (path) {
    releaseRetainedPropDescriptionSpriteFrame(cache[path], path);
    delete cache[path];
  });
  host._startGamePropDescriptionSpriteFrameCache = {};
}

function retainStartGamePropDescriptionPrefab(host, prefab) {
  if (host._startGamePropDescriptionPrefabLease) {
    throw new Error("StartGameView PropDescriptionView prefab lease is already active.");
  }
  if (!prefab || typeof prefab.addRef !== "function") {
    throw new Error("StartGameView PropDescriptionView prefab addRef is required.");
  }
  prefab.addRef();
  host._startGamePropDescriptionPrefabLease = prefab;
  return prefab;
}

function releaseStartGamePropDescriptionPrefab(host) {
  var prefab = host._startGamePropDescriptionPrefabLease;
  if (!prefab) {
    return;
  }
  if (typeof prefab.decRef !== "function") {
    throw new Error("StartGameView PropDescriptionView prefab decRef is required.");
  }
  prefab.decRef();
  host._startGamePropDescriptionPrefabLease = null;
}

function destroyStartGamePropDescriptionView(host) {
  var viewNode = host._startGamePropDescriptionViewNode;
  if (viewNode && viewNode.isValid) {
    viewNode.removeFromParent(false);
    viewNode.destroy();
  }
  host._startGamePropDescriptionViewNode = null;
  host._startGamePropDescriptionViewController = null;
  host._isStartGamePropDescriptionViewOpen = false;
  releaseStartGamePropDescriptionPrefab(host);
}

function logStartGameNativeTemplateAd() {
  Logger.warn.apply(Logger, ["[" + START_GAME_AD_LOG_LABEL + "]"].concat(Array.prototype.slice.call(arguments)));
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requirePositiveFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive finite number.");
  }
  return numberValue;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function resolveNativeTemplateAdFrameSize() {
  if (typeof wx !== "undefined" && wx && typeof wx.getSystemInfoSync === "function") {
    var systemInfo = wx.getSystemInfoSync();
    var width = Number(systemInfo.screenWidth);
    var height = Number(systemInfo.screenHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return {
        width: width,
        height: height
      };
    }
  }
  if (!cc.view || typeof cc.view.getFrameSize !== "function") {
    throw new Error("cc.view.getFrameSize is required for StartGameView native template ad.");
  }
  var frameSize = cc.view.getFrameSize();
  if (!frameSize || frameSize.width <= 0 || frameSize.height <= 0) {
    throw new Error("Invalid frame size for StartGameView native template ad.");
  }
  return frameSize;
}

function getLevelBody(levelConfig) {
  requireObject(levelConfig, "StartGameView level config");
  return requireObject(levelConfig.level, "StartGameView level data");
}

function getStartGameObjectiveList(levelConfig) {
  var level = getLevelBody(levelConfig);
  if (!Array.isArray(level.bonusObjectives)) {
    throw new Error("StartGameView level bonusObjectives must be an array.");
  }
  if (!Array.isArray(level.winConditions)) {
    throw new Error("StartGameView level winConditions must be an array.");
  }
  return level.bonusObjectives.concat(level.winConditions);
}

function buildStartGameObjectiveEntry(objective) {
  var target = requirePositiveInteger(Math.floor(Number(objective.value)), "StartGameView objective target");

  if (objective.type === "collect_any") {
    return {
      type: objective.type,
      iconPath: START_GAME_OBJECTIVE_ICON_PATHS.RAINBOW,
      target: target
    };
  }

  if (objective.type === "collect_color") {
    if (typeof objective.color !== "string" || !START_GAME_OBJECTIVE_ICON_PATHS[objective.color]) {
      throw new Error("StartGameView collect_color objective requires a supported color.");
    }
    return {
      type: objective.type,
      iconPath: START_GAME_OBJECTIVE_ICON_PATHS[objective.color],
      target: target
    };
  }

  if (objective.type === "collect_ice_snowball") {
    return {
      type: objective.type,
      iconPath: START_GAME_OBJECTIVE_ICON_PATHS.ICE_SNOWBALL,
      target: target
    };
  }

  throw new Error("Unsupported StartGameView objective type: " + objective.type);
}

function buildStartGameObjectives(levelConfig) {
  var objectives = getStartGameObjectiveList(levelConfig);
  var ballObjective = null;
  var iceSnowballObjective = null;

  for (var i = 0; i < objectives.length; i += 1) {
    var objective = objectives[i];
    if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
      throw new Error("StartGameView objective entry must be an object.");
    }
    if (typeof objective.type !== "string") {
      throw new Error("StartGameView objective type must be a string.");
    }
    if (START_GAME_COLLECTION_OBJECTIVE_TYPES[objective.type] !== true) {
      continue;
    }
    if (
      !ballObjective &&
      (objective.type === "collect_any" || objective.type === "collect_color")
    ) {
      ballObjective = objective;
    } else if (!iceSnowballObjective && objective.type === "collect_ice_snowball") {
      iceSnowballObjective = objective;
    }
  }

  if (!ballObjective && !iceSnowballObjective) {
    throw new Error("StartGameView requires at least one collection objective.");
  }

  return {
    ball: ballObjective ? buildStartGameObjectiveEntry(ballObjective) : null,
    iceSnowball: iceSnowballObjective ? buildStartGameObjectiveEntry(iceSnowballObjective) : null
  };
}

function requireStartGameShopServices(host) {
  requireObject(host, "StartGameView host");
  if (!host.shopConfigService || typeof host.shopConfigService.getAllGoodsList !== "function") {
    throw new Error("StartGameView purchase requires ShopConfigService.getAllGoodsList.");
  }
  if (!host.shopStateService || typeof host.shopStateService.getRemainingCount !== "function") {
    throw new Error("StartGameView purchase requires ShopStateService.getRemainingCount.");
  }
  if (!host.shopPurchaseService || typeof host.shopPurchaseService.purchase !== "function") {
    throw new Error("StartGameView purchase requires ShopPurchaseService.purchase.");
  }
}

function getStartGameShopGoodsByItemId(host, itemId) {
  requireStartGameShopServices(host);
  if (!POWERUP_TYPE_BY_ITEM_ID[itemId]) {
    throw new Error("StartGameView purchase item is unsupported: " + itemId);
  }
  var goodsList = host.shopConfigService.getAllGoodsList();
  for (var i = 0; i < goodsList.length; i += 1) {
    var goods = goodsList[i];
    if (goods && goods.itemId === itemId) {
      if (goods.enabled !== true) {
        throw new Error("StartGameView purchase goods disabled: " + goods.skuId);
      }
      return goods;
    }
  }
  throw new Error("StartGameView purchase goods missing for item: " + itemId);
}

function isStartGamePersistentPowerupItem(itemId) {
  return START_GAME_PERSISTENT_POWERUP_ITEM_IDS.indexOf(itemId) >= 0;
}

function isStartGameTemporaryPowerupItem(itemId) {
  return Object.prototype.hasOwnProperty.call(START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID, itemId);
}

function createEmptyStartGameTemporaryPowerups() {
  var temporaryPowerups = {};
  Object.keys(START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID).forEach(function (itemId) {
    temporaryPowerups[itemId] = 0;
  });
  return temporaryPowerups;
}

function normalizeStartGameTemporaryPowerups(temporaryPowerups) {
  requireObject(temporaryPowerups, "StartGameView temporary powerups");
  var normalized = createEmptyStartGameTemporaryPowerups();
  Object.keys(temporaryPowerups).forEach(function (itemId) {
    if (!isStartGameTemporaryPowerupItem(itemId)) {
      throw new Error("StartGameView temporary powerup is unsupported: " + itemId);
    }
  });
  Object.keys(normalized).forEach(function (itemId) {
    if (!Object.prototype.hasOwnProperty.call(temporaryPowerups, itemId)) {
      throw new Error("StartGameView temporary powerup count missing: " + itemId);
    }
    normalized[itemId] = requireNonNegativeInteger(temporaryPowerups[itemId], "StartGameView temporary powerup count `" + itemId + "`");
  });
  return normalized;
}

function getStartGameTemporaryPowerupCount(host, itemId) {
  var temporaryPowerups = normalizeStartGameTemporaryPowerups(host._pendingStartGameTemporaryPowerups);
  return requireNonNegativeInteger(temporaryPowerups[itemId], "StartGameView temporary powerup count `" + itemId + "`");
}

function getStartGameAdPowerupRules(levelConfig) {
  var level = getLevelBody(levelConfig);
  if (!level.adPowerupRules || typeof level.adPowerupRules !== "object" || Array.isArray(level.adPowerupRules)) {
    throw new Error("StartGameView level adPowerupRules must be an object.");
  }
  if (!Array.isArray(level.adPowerupRules.allowed)) {
    throw new Error("StartGameView level adPowerupRules.allowed must be an array.");
  }
  return level.adPowerupRules;
}

function isStartGameTemporaryPowerupAllowed(levelConfig, itemId) {
  var config = START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID[itemId];
  if (!config) {
    throw new Error("StartGameView temporary powerup config missing: " + itemId);
  }
  if (config.activateRicochetGuide === true) {
    return true;
  }
  var rules = getStartGameAdPowerupRules(levelConfig);
  if (rules.allowed.indexOf(config.adRunPowerupType) < 0) {
    return false;
  }
  return true;
}

function buildStartGamePurchaseOptions(host, levelConfig) {
  requireStartGameShopServices(host);
  if (typeof host.shopStateService.ensureDailyReset !== "function") {
    throw new Error("StartGameView purchase requires ShopStateService.ensureDailyReset.");
  }
  host.shopStateService.ensureDailyReset();

  var optionsByItemId = {};
  START_GAME_PERSISTENT_POWERUP_ITEM_IDS.forEach(function (itemId) {
    var goods = getStartGameShopGoodsByItemId(host, itemId);
    optionsByItemId[itemId] = {
      price: requirePositiveInteger(goods.price.amount, "StartGameView purchase price `" + itemId + "`"),
      remaining: requireNonNegativeInteger(host.shopStateService.getRemainingCount(goods.skuId), "StartGameView purchase remaining `" + itemId + "`"),
      available: true,
      unavailableMessage: ""
    };
  });
  Object.keys(START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID).forEach(function (itemId) {
    var config = START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID[itemId];
    var purchasedCount = getStartGameTemporaryPowerupCount(host, itemId);
    var allowed = isStartGameTemporaryPowerupAllowed(levelConfig, itemId);
    optionsByItemId[itemId] = {
      price: requirePositiveInteger(config.price, "StartGameView temporary powerup price `" + itemId + "`"),
      remaining: allowed && purchasedCount <= 0 ? 1 : 0,
      available: allowed,
      unavailableMessage: allowed ? "" : "本关不可用"
    };
  });
  return optionsByItemId;
}

function normalizeStartGameLevelId(levelId) {
  return requirePositiveInteger(Math.floor(Number(levelId)), "StartGameView levelId");
}

function shouldShowFirstClearAwardTips(host, levelId) {
  requireObject(host, "StartGameView host");
  requireObject(host.levelProgress, "StartGameView level progress");
  requireObject(host.levelProgress.completedLevels, "StartGameView completed levels");
  var safeLevelId = normalizeStartGameLevelId(levelId);
  var highestUnlockedLevel = normalizeStartGameLevelId(host.levelProgress.highestUnlockedLevel);
  var key = String(safeLevelId);
  var completedValue = host.levelProgress.completedLevels[key];
  if (completedValue !== undefined && completedValue !== true) {
    throw new Error("StartGameView completed level value must be true: " + key);
  }
  return safeLevelId === highestUnlockedLevel && completedValue !== true;
}

function validateStartGameSelectedPowerups(host, levelId, selectedItems) {
  if (!Array.isArray(selectedItems)) {
    throw new Error("StartGameView selected powerups must be an array.");
  }
  if (!host.inventoryStore || typeof host.inventoryStore.getItemCount !== "function") {
    throw new Error("StartGameView requires InventoryStore.getItemCount.");
  }
  if (typeof host._refreshPlayerInventory !== "function") {
    throw new Error("StartGameView requires player inventory refresh method.");
  }

  host._refreshPlayerInventory();
  var temporaryPowerups = normalizeStartGameTemporaryPowerups(host._pendingStartGameTemporaryPowerups);
  var levelConfig = host._startGameLevelConfig || host.currentLevelConfig;
  return selectedItems.map(function (itemId, index) {
    if (selectedItems.indexOf(itemId) !== index) {
      throw new Error("StartGameView selected powerups contain duplicate item: " + itemId);
    }
    if (!isStartGamePersistentPowerupItem(itemId) && !isStartGameTemporaryPowerupItem(itemId)) {
      throw new Error("StartGameView selected powerup is unsupported: " + itemId);
    }
    var unlockLevel = START_GAME_POWERUP_UNLOCK_LEVEL_BY_ITEM_ID[itemId];
    if (!Number.isInteger(unlockLevel)) {
      throw new Error("StartGameView unlock level missing for item: " + itemId);
    }
    if (levelId < unlockLevel) {
      throw new Error("StartGameView selected locked powerup: " + itemId);
    }
    if (isStartGameTemporaryPowerupItem(itemId)) {
      if (!levelConfig) {
        throw new Error("StartGameView temporary selected powerup requires level config: " + itemId);
      }
      if (!isStartGameTemporaryPowerupAllowed(levelConfig, itemId)) {
        throw new Error("StartGameView selected temporary powerup is unavailable for level: " + itemId);
      }
      if (temporaryPowerups[itemId] <= 0) {
        throw new Error("StartGameView selected temporary powerup was not purchased: " + itemId);
      }
      return itemId;
    }
    if (host.inventoryStore.getItemCount(host.playerInventory, itemId) <= 0) {
      throw new Error("StartGameView selected powerup inventory is empty: " + itemId);
    }
    return itemId;
  });
}

function buildDefaultStartGameSelectedPowerups(host, levelId) {
  if (!host.inventoryStore || typeof host.inventoryStore.getItemCount !== "function") {
    throw new Error("StartGameView requires InventoryStore.getItemCount.");
  }
  if (typeof host._refreshPlayerInventory !== "function") {
    throw new Error("StartGameView requires player inventory refresh method.");
  }
  host._refreshPlayerInventory();

  var safeLevelId = normalizeStartGameLevelId(levelId);
  var selectedItems = [];
  START_GAME_PERSISTENT_POWERUP_ITEM_IDS.forEach(function (itemId) {
    var unlockLevel = START_GAME_POWERUP_UNLOCK_LEVEL_BY_ITEM_ID[itemId];
    if (!Number.isInteger(unlockLevel)) {
      throw new Error("StartGameView unlock level missing for item: " + itemId);
    }
    if (safeLevelId < unlockLevel) {
      return;
    }
    if (host.inventoryStore.getItemCount(host.playerInventory, itemId) <= 0) {
      return;
    }
    selectedItems.push(itemId);
  });
  return validateStartGameSelectedPowerups(host, safeLevelId, selectedItems);
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  return node;
}

function resolveNodeWorldPositionInParent(node, parentNode) {
  requireValidNode(node, "Target node");
  requireValidNode(parentNode, "Parent node");
  if (!node.parent || typeof node.parent.convertToWorldSpaceAR !== "function") {
    throw new Error("Target node parent cannot convert to world space.");
  }
  if (typeof parentNode.convertToNodeSpaceAR !== "function") {
    throw new Error("Parent node cannot convert to local space.");
  }

  var worldPosition = node.parent.convertToWorldSpaceAR(node.getPosition());
  return parentNode.convertToNodeSpaceAR(worldPosition);
}

function waitMilliseconds(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("waitMilliseconds requires a non-negative finite duration.");
  }
  if (typeof setTimeout !== "function") {
    throw new Error("waitMilliseconds requires setTimeout.");
  }
  return new Promise(function (resolve) {
    setTimeout(resolve, durationMs);
  });
}

module.exports = {
  _onUseThreeLineEliminationTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._threeLineEliminationInProgress) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "three_line_elimination"
    });
    this._playSfx("uiClick");

    var preview = this.gameManager.previewThreeLineElimination();
    if (!preview || !preview.accepted) {
      var previewReason = preview && typeof preview.reason === "string" ? preview.reason : "preview_failed";
      if (previewReason === "inventory_empty") {
        this._setStatusWithTip("three_line_inventory_empty", null, "消三行道具库存不足");
        this._tryRecoverAdRunPowerupByAd("three_line_elimination");
        return;
      }
      if (previewReason === "no_target") {
        this._setStatusWithTip("three_line_no_target", null, "当前没有可消除的行");
        return;
      }
      this._setStatusWithTip("three_line_unavailable", null, "当前状态不可使用消三行");
      return;
    }

    if (!this.levelRenderer || typeof this.levelRenderer.playThreeLineEliminationAnimation !== "function") {
      throw new Error("Three-line elimination requires LevelRenderer.playThreeLineEliminationAnimation.");
    }

    this._threeLineEliminationInProgress = true;
    return this.levelRenderer.playThreeLineEliminationAnimation(preview.rows).then(function () {
      return waitMilliseconds(200);
    }).then(function () {
      var useResult = this.gameManager.useThreeLineElimination(preview.rows);
      var snapshot = useResult && useResult.snapshot
        ? useResult.snapshot
        : this.gameManager.getRuntimeSnapshot();
      if (useResult && useResult.accepted) {
        this._recordAttemptPowerupUsed("three_line_elimination");
      }
      this._handleRuntimeStateTransition(snapshot);
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

      if (!useResult || !useResult.accepted) {
        this._setStatusWithTip("three_line_failed", null, "消三行失败");
      }
    }.bind(this)).then(function () {
      this._threeLineEliminationInProgress = false;
    }.bind(this), function (error) {
      this._threeLineEliminationInProgress = false;
      throw error;
    }.bind(this));
  },

  _applyPlusThreeBallsUseResult: function (useResult) {
    var snapshot = useResult && useResult.snapshot
      ? useResult.snapshot
      : this.gameManager.getRuntimeSnapshot();
    if (useResult && useResult.accepted) {
      this._recordAttemptPowerupUsed("plus_three_balls");
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (useResult && useResult.accepted) {
      return useResult;
    }

    var reason = useResult && typeof useResult.reason === "string" ? useResult.reason : "plus_three_balls_failed";
    if (reason === "timed_infinite_shots") {
      this._setStatusWithTip("plus_three_balls_timed_unavailable", null, "计时关无需加球");
      return useResult;
    }
    this._setStatusWithTip("plus_three_balls_failed", null, "当前状态不可使用加十球");
    return useResult;
  },

  _autoUsePlusThreeBallsAfterAdGrant: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    var snapshot = this.gameManager.getRuntimeSnapshot();
    if (this._isTerminalState() && snapshot.state !== "out_of_shots_add_ball_prompt") {
      return;
    }
    return this._applyPlusThreeBallsUseResult(this.gameManager.usePlusThreeBalls());
  },

  _applyPreciseAimUseResult: function (useResult, options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("Precise aim use options must be an object when provided.");
    }
    if (!useResult || typeof useResult !== "object") {
      throw new Error("Precise aim use result must be an object.");
    }
    if (!useResult.snapshot) {
      throw new Error("Precise aim use result requires snapshot.");
    }
    var snapshot = useResult.snapshot;

    if (useResult.accepted === true && (options === undefined || options.recordAttempt !== false)) {
      this._recordAttemptPowerupUsed("precise_aim");
    }
    this._handleRuntimeStateTransition(snapshot);
    if (options === undefined || options.refreshRuntime !== false) {
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    }

    if (useResult.accepted === true) {
      if ((options === undefined || options.consumePersistent !== false) && this._consumePersistentInventoryItemForPowerup("precise_aim") !== true) {
        throw new Error("Precise aim persistent inventory consume failed.");
      }
      this._setStatusWithTip("precise_aim_active", null, "精确瞄准已生效");
      return useResult;
    }

    if (typeof useResult.reason !== "string" || !useResult.reason) {
      throw new Error("Precise aim failure requires reason.");
    }
    var reason = useResult.reason;
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "precise_aim",
        reason: reason
      });
      this._setStatusWithTip("precise_aim_inventory_empty", null, "精确瞄准道具库存不足");
      if (options === undefined || options.recoverByAd !== false) {
        this._tryRecoverInventoryByAd("precise_aim");
      }
      return useResult;
    }
    if (reason === "already_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "precise_aim",
        reason: reason
      });
      this._setStatusWithTip("precise_aim_already_active", null, "精确瞄准已生效");
      return useResult;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "precise_aim",
        reason: reason
      });
      this._setStatusWithTip("precise_aim_busy", null, "当前状态不可使用精确瞄准");
      return useResult;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "precise_aim",
      reason: reason
    });
    this._setStatusWithTip("precise_aim_failed", null, "精确瞄准使用失败");
    return useResult;
  },

  _autoUsePreciseAimAfterInventoryGrant: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (!this.gameManager || typeof this.gameManager.usePreciseAim !== "function") {
      throw new Error("Precise aim auto use requires GameManager.usePreciseAim.");
    }
    return this._applyPreciseAimUseResult(this.gameManager.usePreciseAim(), {
      recoverByAd: false
    });
  },

  _onAddBallTipsCloseTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (!this.gameManager || typeof this.gameManager.confirmOutOfShotsAddBallPromptClosed !== "function") {
      throw new Error("AddBallTipsView close requires GameManager.confirmOutOfShotsAddBallPromptClosed.");
    }

    this._playSfx("uiClick");
    var snapshot = this.gameManager.confirmOutOfShotsAddBallPromptClosed();
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _onAddBallTipsWatchAdTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    var snapshot = this.gameManager.getRuntimeSnapshot();
    if (!snapshot || snapshot.state !== "out_of_shots_add_ball_prompt") {
      throw new Error("AddBallTipsView ad action requires add-ball prompt state.");
    }

    this._playSfx("uiClick");
    this._trackTelemetry("add_ball_tips_action", {
      action: "watch_ad"
    });
    return this._tryRecoverAdRunPowerupByAd("plus_three_balls");
  },

  _onAddBallTipsCoinBuyTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    var snapshot = this.gameManager.getRuntimeSnapshot();
    if (!snapshot || snapshot.state !== "out_of_shots_add_ball_prompt") {
      throw new Error("AddBallTipsView coin action requires add-ball prompt state.");
    }
    if (typeof this._spendCoinsForAddBallTips !== "function") {
      throw new Error("AddBallTipsView coin action requires _spendCoinsForAddBallTips.");
    }
    if (typeof this._refundCoinsForAddBallTips !== "function") {
      throw new Error("AddBallTipsView coin action requires _refundCoinsForAddBallTips.");
    }
    if (!this.gameManager || typeof this.gameManager.grantPreparedAdRunPowerup !== "function") {
      throw new Error("AddBallTipsView coin action requires GameManager.grantPreparedAdRunPowerup.");
    }

    this._playSfx("uiClick");
    this._trackTelemetry("add_ball_tips_action", {
      action: "coin"
    });
    var cost = Shared.ADD_BALL_TIPS_COIN_COST;
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("AddBallTipsView coin cost must be a positive integer.");
    }
    var spendResult = this._spendCoinsForAddBallTips(cost, "add_ball_tips_plus_three_balls");
    if (!spendResult || spendResult.accepted !== true) {
      this._setStatusWithTip("add_ball_tips_coin_not_enough", null, "金币不足");
      return;
    }

    var useResult = null;
    try {
      var grantResult = this.gameManager.grantPreparedAdRunPowerup("plus_three_balls", 1);
      if (!grantResult || grantResult.accepted !== true) {
        throw new Error("AddBallTipsView coin grant failed.");
      }
      useResult = this.gameManager.usePlusThreeBalls();
    } catch (error) {
      this._refundCoinsForAddBallTips(cost, "add_ball_tips_plus_three_balls_rollback");
      throw error;
    }
    if (!useResult || useResult.accepted !== true || !useResult.snapshot) {
      this._refundCoinsForAddBallTips(cost, "add_ball_tips_plus_three_balls_rollback");
      throw new Error("AddBallTipsView plus three balls use result is invalid.");
    }

    this._refreshPlayerResources();
    this._setStatus("加十球购买成功");
    return this._applyPlusThreeBallsUseResult(useResult);
  },

  _onUsePlusThreeBallsTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "plus_three_balls"
    });
    this._playSfx("uiClick");
    var useResult = this.gameManager.usePlusThreeBalls();
    if (useResult && useResult.reason === "inventory_empty") {
      this._setStatusWithTip("plus_three_balls_inventory_empty", null, "加十球道具库存不足");
      this._tryRecoverAdRunPowerupByAd("plus_three_balls");
      return;
    }
    this._applyPlusThreeBallsUseResult(useResult);
  },

  _onUseSnowRemovalTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (this._isTerminalState()) {
      return;
    }
    if (this._snowRemovalInProgress) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "snow_removal"
    });
    this._playSfx("uiClick");

    var preview = this.gameManager.previewSnowRemoval();
    if (!preview || !preview.accepted) {
      var previewReason = preview && typeof preview.reason === "string" ? preview.reason : "preview_failed";
      if (previewReason === "inventory_empty") {
        this._trackTelemetry("powerup_fail", {
          powerup_type: "snow_removal",
          reason: previewReason
        });
        this._setStatusWithTip("snow_removal_inventory_empty", null, "除雪剂道具库存不足");
        this._tryRecoverInventoryByAd("snow_removal");
        return;
      }
      if (previewReason === "no_target") {
        this._trackTelemetry("powerup_fail", {
          powerup_type: "snow_removal",
          reason: previewReason
        });
        this._setStatusWithTip("snow_removal_no_target", null, "当前没有可清理的雪块");
        return;
      }
      this._trackTelemetry("powerup_fail", {
        powerup_type: "snow_removal",
        reason: previewReason
      });
      this._setStatusWithTip("snow_removal_unavailable", null, "当前状态不可使用除雪剂");
      return;
    }

    if (!this.levelRenderer || typeof this.levelRenderer.playSnowRemovalAnimation !== "function") {
      throw new Error("Snow removal requires LevelRenderer.playSnowRemovalAnimation.");
    }

    this._snowRemovalInProgress = true;
    return this.levelRenderer.playSnowRemovalAnimation().then(function () {
      var useResult = this.gameManager.useSnowRemoval(preview.targets);
      var snapshot = useResult && useResult.snapshot
        ? useResult.snapshot
        : this.gameManager.getRuntimeSnapshot();
      if (useResult && useResult.accepted) {
        this._recordAttemptPowerupUsed("snow_removal");
      }
      this._handleRuntimeStateTransition(snapshot);
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

      if (useResult && useResult.accepted) {
        this._consumePersistentInventoryItemForPowerup("snow_removal");
        return;
      }

      var reason = useResult && typeof useResult.reason === "string" ? useResult.reason : "snow_removal_failed";
      if (reason === "inventory_empty") {
        this._setStatusWithTip("snow_removal_inventory_empty", null, "除雪剂道具库存不足");
        this._tryRecoverInventoryByAd("snow_removal");
        return;
      }
      if (reason === "no_target") {
        this._setStatusWithTip("snow_removal_no_target", null, "当前没有可清理的雪块");
        return;
      }
      this._setStatusWithTip("snow_removal_failed", null, "除雪剂使用失败");
    }.bind(this)).then(function () {
      this._snowRemovalInProgress = false;
    }.bind(this), function (error) {
      this._snowRemovalInProgress = false;
      throw error;
    }.bind(this));
  },

  _onUsePreciseAimTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "precise_aim"
    });
    this._playSfx("uiClick");
    return this._applyPreciseAimUseResult(this.gameManager.usePreciseAim());
  },

  _onUseSkillBallTap: function (entityType) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    if (this._skillBallLoadAnimationInProgress === true) {
      this._setStatusWithTip("skill_loading", null, "道具正在装填");
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: entityType
    });
    this._playSfx("uiClick");
    var useResult = this.gameManager.useSkillBall(entityType);
    var snapshot = useResult && useResult.snapshot
      ? useResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    if (useResult && useResult.accepted) {
      this._recordAttemptPowerupUsed(entityType);
      if (!this.levelRenderer || typeof this.levelRenderer.playPowerupLoadAnimation !== "function") {
        throw new Error("Skill ball loading requires LevelRenderer.playPowerupLoadAnimation.");
      }
      this._playSfx("useProps");
      this._skillBallLoadAnimationInProgress = true;
      var loadAnimationPromise = null;
      try {
        loadAnimationPromise = this.levelRenderer.playPowerupLoadAnimation(entityType);
      } catch (error) {
        this._skillBallLoadAnimationInProgress = false;
        throw error;
      }
      return loadAnimationPromise.then(function () {
        this._skillBallLoadAnimationInProgress = false;
        this._handleRuntimeStateTransition(snapshot);
        this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
        this._consumePersistentInventoryItemForPowerup(entityType);
        if (entityType === "rainbow" && typeof this._recordDailyTaskEvent === "function") {
          this._recordDailyTaskEvent("use_powerup", {
            itemId: "rainbow_ball",
            powerupType: entityType
          });
        }
        return this._advanceSkillPowerupGuideAfterSkillSelected(entityType, snapshot);
      }.bind(this), function (error) {
        this._skillBallLoadAnimationInProgress = false;
        throw error;
      }.bind(this));
    }

    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    var reason = useResult && typeof useResult.reason === "string" ? useResult.reason : "equip_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_inventory_empty", null, "该道具库存不足");
      this._tryRecoverInventoryByAd(entityType);
      return;
    }
    if (reason === "current_slot_occupied_by_skill") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_current_slot_occupied", null, "当前炮台已装填道具球，请先发射");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("skill_busy", null, "当前状态不可切换道具");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: entityType,
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: entityType,
      reason: reason
    });
    this._setStatusWithTip("skill_equip_failed", null, "道具装填失败");
  },

  _onUseSwapBallTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "swap"
    });
    this._playSfx("uiClick");
    var swapResult = this.gameManager.useSwapBall();
    var snapshot = swapResult && swapResult.snapshot
      ? swapResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    if (swapResult && swapResult.accepted) {
      this._recordAttemptPowerupUsed("swap");
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (swapResult && swapResult.accepted) {
      this._consumePersistentInventoryItemForPowerup("swap");
      return;
    }

    var reason = swapResult && typeof swapResult.reason === "string" ? swapResult.reason : "swap_failed";
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_inventory_empty", null, "换球道具库存不足");
      this._tryRecoverInventoryByAd("swap");
      return;
    }
    if (reason === "queue_missing") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_queue_missing", null, "当前无法换球");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("swap_busy", null, "当前状态不可使用换球");
      return;
    }
    if (reason === "targeting_active") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "swap",
        reason: reason
      });
      this._setStatusWithTip("targeting_active", null, "请先完成破障锤目标选择");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "swap",
      reason: reason
    });
    this._setStatusWithTip("swap_failed", null, "换球失败");
  },

  _onSelectRainbowColorTap: function (colorCode) {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("rainbow_color_select", {
      color: colorCode
    });
    this._playSfx("uiClick");

    var selectResult = this.gameManager.selectRainbowColor(colorCode);
    var snapshot = selectResult && selectResult.snapshot
      ? selectResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (selectResult && selectResult.accepted) {
      return this._advanceSkillPowerupGuideAfterRainbowColorSelected(snapshot);
    }

    var reason = selectResult && typeof selectResult.reason === "string" ? selectResult.reason : "rainbow_color_select_failed";
    this._trackTelemetry("rainbow_color_select_fail", {
      color: colorCode,
      reason: reason
    });
    this._setStatusWithTip("rainbow_color_select_failed", null, "彩虹球选色失败");
  },

  _onUseBarrierHammerTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel) {
      return;
    }

    if (this._isTerminalState()) {
      return;
    }

    this._trackTelemetry("powerup_tap", {
      powerup_type: "barrier_hammer"
    });
    this._playSfx("uiClick");
    var isTargeting = this._isBarrierHammerTargeting();
    var hammerResult = isTargeting
      ? this.gameManager.cancelBarrierHammer()
      : this.gameManager.beginBarrierHammer();
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (isTargeting) {
      this._setStatusWithTip("hammer_cancelled", null, "已取消破障锤");
      return;
    }

    if (hammerResult && hammerResult.accepted) {
      this._setStatusWithTip("hammer_ready", null, "破障锤已就绪，请点选石头或冰冻球");
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_obstacle") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_no_obstacle", null, "没有需要破除的障碍");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_enable_failed", null, "破障锤启用失败");
  },

  _handleBarrierHammerTargetTouch: function (localPoint) {
    var hammerResult = this.gameManager.useBarrierHammerAt(localPoint);
    var snapshot = hammerResult && hammerResult.snapshot
      ? hammerResult.snapshot
      : this.gameManager.getRuntimeSnapshot();

    if (hammerResult && hammerResult.accepted) {
      this._recordAttemptPowerupUsed("barrier_hammer");
    }
    this._handleRuntimeStateTransition(snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);

    if (hammerResult && hammerResult.accepted) {
      this._consumePersistentInventoryItemForPowerup("barrier_hammer");
      if (typeof this._recordDailyTaskEvent === "function") {
        this._recordDailyTaskEvent("use_powerup", {
          itemId: "barrier_hammer",
          powerupType: "barrier_hammer"
        });
      }
      return;
    }

    var reason = hammerResult && typeof hammerResult.reason === "string" ? hammerResult.reason : "hammer_failed";
    if (reason === "no_target" || reason === "target_invalid") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_target_invalid", null, "请点选石头或冰冻球");
      return;
    }
    if (reason === "inventory_empty") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_inventory_empty", null, "破障锤库存不足");
      this._tryRecoverInventoryByAd("barrier_hammer");
      return;
    }
    if (reason === "busy") {
      this._trackTelemetry("powerup_fail", {
        powerup_type: "barrier_hammer",
        reason: reason
      });
      this._setStatusWithTip("hammer_busy", null, "当前状态不可使用破障锤");
      return;
    }
    this._trackTelemetry("powerup_fail", {
      powerup_type: "barrier_hammer",
      reason: reason
    });
    this._setStatusWithTip("hammer_use_failed", null, "破障锤使用失败");
  },

  _isBarrierHammerTargeting: function () {
    return !!(this.gameManager && this.gameManager.pendingBarrierHammer);
  },

  _setStatusWithTip: function (tipKey, params, fallbackMessage) {
    var message = typeof fallbackMessage === "string" ? fallbackMessage : "";
    if (this.tipsPresenter && typeof this.tipsPresenter.resolveMessage === "function") {
      message = this.tipsPresenter.resolveMessage(tipKey, params, fallbackMessage);
    }

    this._setStatus(message);
    if (this.tipsPresenter && typeof this.tipsPresenter.showByKey === "function") {
      this.tipsPresenter.showByKey(tipKey, params, fallbackMessage);
    }
  },

  _refreshPlayerInventory: function () {
    if (!this.inventoryStore) {
      throw new Error("GameBootstrap requires InventoryStore.");
    }

    this.playerInventory = this.inventoryStore.load();
    return this.playerInventory;
  },

  _addInventoryItem: function (itemId, count) {
    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.addItem !== "function") {
      throw new Error("GameBootstrap requires InventoryStore.addItem.");
    }

    var addResult = this.inventoryStore.addItem(this.playerInventory, itemId, count);
    if (!addResult || !addResult.accepted) {
      return {
        accepted: false,
        reason: addResult && addResult.reason ? addResult.reason : "inventory_add_failed"
      };
    }

    this.playerInventory = addResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    return addResult;
  },

  _syncCollectedSkillPowerupsToInventory: function (snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("Collected skill powerup inventory sync requires runtime snapshot.");
    }
    if (!Array.isArray(snapshot.runtimeEvents) || snapshot.runtimeEvents.length === 0) {
      return {
        accepted: true,
        added: 0
      };
    }
    if (typeof this._addInventoryItem !== "function") {
      throw new Error("Collected skill powerup inventory sync requires _addInventoryItem.");
    }

    var addedCount = 0;
    snapshot.runtimeEvents.forEach(function (event) {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new Error("Runtime event must be an object.");
      }
      if (event.type !== "skill_powerup_collected") {
        return;
      }

      var entityType = requireNonEmptyString(event.entityType, "Collected skill powerup entityType");
      if (entityType !== "rainbow" && entityType !== "blast") {
        throw new Error("Collected skill powerup entityType is unsupported: " + entityType);
      }
      requireNonEmptyString(event.sourceId, "Collected skill powerup sourceId");
      requirePositiveInteger(event.total, "Collected skill powerup runtime total");

      var itemId = ITEM_ID_BY_POWERUP_TYPE[entityType];
      if (!itemId) {
        throw new Error("Collected skill powerup item mapping is missing: " + entityType);
      }
      var addResult = this._addInventoryItem(itemId, 1);
      if (!addResult || addResult.accepted !== true) {
        throw new Error("Collected skill powerup inventory add failed: " + itemId);
      }
      addedCount += addResult.gained;
    }, this);

    if (addedCount > 0) {
      this._renderInventoryView();
      this._updateInventoryEntryState();
    }
    return {
      accepted: true,
      added: addedCount
    };
  },

  _refreshSelectedPowerups: function () {
    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.load !== "function") {
      throw new Error("GameBootstrap requires SelectedPowerupsStore.load.");
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.load();
    return this.selectedPowerupsState;
  },

  _saveSelectedPowerups: function (selectedItems, selectedItemCounts) {
    if (!Array.isArray(selectedItems)) {
      throw new Error("Selected powerup item list must be an array.");
    }
    if (!selectedItemCounts || typeof selectedItemCounts !== "object" || Array.isArray(selectedItemCounts)) {
      throw new Error("Selected powerup item counts must be an object.");
    }

    var safeSelectedItems = selectedItems.slice();
    var sourceCounts = selectedItemCounts;
    var safeSelectedItemCounts = {};
    safeSelectedItems.forEach(function (itemId) {
      var count = sourceCounts[itemId];
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error("Selected powerup count must be a positive integer: " + itemId);
      }
      safeSelectedItemCounts[itemId] = count;
    });

    if (!this.selectedPowerupsStore || typeof this.selectedPowerupsStore.setSelectedItems !== "function") {
      throw new Error("GameBootstrap requires SelectedPowerupsStore.setSelectedItems.");
    }

    this.selectedPowerupsState = this.selectedPowerupsStore.setSelectedItems({
      version: 2,
      selectedItems: safeSelectedItems,
      selectedItemCounts: safeSelectedItemCounts
    });
    return this.selectedPowerupsState;
  },

  _getSelectedPowerupTotalCount: function (selectedItems, selectedItemCounts) {
    var safeSelectedItems = Array.isArray(selectedItems) ? selectedItems : [];
    var safeSelectedItemCounts = selectedItemCounts && typeof selectedItemCounts === "object"
      ? selectedItemCounts
      : {};

    return safeSelectedItems.reduce(function (total, itemId) {
      return total + Math.max(1, Math.floor(Number(safeSelectedItemCounts[itemId]) || 1));
    }, 0);
  },

  _normalizeSelectedPowerupCountsByTotalLimit: function (selectedItems, selectedItemCounts) {
    if (!Array.isArray(selectedItems)) {
      throw new Error("Selected powerup items must be an array.");
    }
    var normalizedItems = selectedItems.slice();

    var sourceCounts = selectedItemCounts && typeof selectedItemCounts === "object"
      ? selectedItemCounts
      : {};
    var normalizedCounts = {};
    normalizedItems.forEach(function (itemId) {
      var safeCount = Math.max(1, Math.floor(Number(sourceCounts[itemId]) || 1));
      normalizedCounts[itemId] = safeCount;
    });

    return {
      selectedItems: normalizedItems,
      selectedItemCounts: normalizedCounts
    };
  },

  _getAvailableSelectedPowerupItems: function () {
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    var selectedItemCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var availableSelectedItems = selectedItems.filter(function (itemId, index, list) {
      return list.indexOf(itemId) === index &&
        POWERUP_TYPE_BY_ITEM_ID[itemId] &&
        this.inventoryStore &&
        this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this);
    var normalizedCounts = {};
    availableSelectedItems.forEach(function (itemId) {
      var inventoryCount = this.inventoryStore
        ? this.inventoryStore.getItemCount(this.playerInventory, itemId)
        : 0;
      var selectedCount = Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1));
      normalizedCounts[itemId] = Math.min(selectedCount, Math.max(1, inventoryCount));
    }, this);
    var normalizedSelection = this._normalizeSelectedPowerupCountsByTotalLimit(availableSelectedItems, normalizedCounts);
    availableSelectedItems = normalizedSelection.selectedItems;
    normalizedCounts = normalizedSelection.selectedItemCounts;

    var hasSelectionChanged = availableSelectedItems.length !== selectedItems.length;
    if (!hasSelectionChanged) {
      for (var i = 0; i < availableSelectedItems.length; i += 1) {
        if (availableSelectedItems[i] !== selectedItems[i]) {
          hasSelectionChanged = true;
          break;
        }
      }
    }

    var hasCountChanged = false;
    if (!hasSelectionChanged) {
      Object.keys(selectedItemCounts).forEach(function (itemId) {
        if (availableSelectedItems.indexOf(itemId) < 0) {
          hasCountChanged = true;
        }
      });
      availableSelectedItems.forEach(function (itemId) {
        var previousCount = Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1));
        if (normalizedCounts[itemId] !== previousCount) {
          hasCountChanged = true;
        }
      });
    }

    if (hasSelectionChanged || hasCountChanged) {
      this._saveSelectedPowerups(availableSelectedItems, normalizedCounts);
    } else if (this.selectedPowerupsState) {
      this.selectedPowerupsState.selectedItemCounts = normalizedCounts;
    }
    return availableSelectedItems;
  },

  _getSelectedPowerupLoadouts: function () {
    var selectedItems = this._getAvailableSelectedPowerupItems();
    var selectedItemCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};

    return selectedItems.map(function (itemId) {
      return {
        itemId: itemId,
        count: Math.max(1, Math.floor(Number(selectedItemCounts[itemId]) || 1))
      };
    });
  },

  _applySelectedPowerupsToRuntime: function (snapshot) {
    if (!Array.isArray(this._pendingStartGamePowerups)) {
      throw new Error("StartGameView pending powerups must be an array.");
    }
    this._pendingStartGamePreciseAimActivation = false;
    var temporaryPowerups = normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups);
    var hasTemporaryPowerups = Object.keys(temporaryPowerups).some(function (itemId) {
      return temporaryPowerups[itemId] > 0;
    });
    if (this._pendingStartGamePowerups.length === 0 && !hasTemporaryPowerups) {
      return snapshot;
    }
    if (!this.gameManager || typeof this.gameManager.grantPowerupInventory !== "function") {
      throw new Error("StartGameView requires GameManager.grantPowerupInventory.");
    }
    if (!this.gameManager || typeof this.gameManager.grantPreparedAdRunPowerup !== "function") {
      throw new Error("StartGameView requires GameManager.grantPreparedAdRunPowerup.");
    }
    var levelId = normalizeStartGameLevelId(this._currentLevelId);
    var selectedItems = validateStartGameSelectedPowerups(this, levelId, this._pendingStartGamePowerups);
    var runtimeSnapshot = snapshot;
    selectedItems.forEach(function (itemId) {
      if (isStartGameTemporaryPowerupItem(itemId)) {
        return;
      }
      var powerupType = POWERUP_TYPE_BY_ITEM_ID[itemId];
      var inventoryCount = this.inventoryStore.getItemCount(this.playerInventory, itemId);
      if (!Number.isInteger(inventoryCount) || inventoryCount <= 0) {
        throw new Error("StartGameView selected powerup inventory is empty: " + itemId);
      }
      var grantResult = this.gameManager.grantPowerupInventory(powerupType, inventoryCount);
      if (!grantResult || grantResult.accepted !== true) {
        throw new Error("StartGameView grant runtime powerup failed: " + itemId);
      }
      if (!grantResult.snapshot) {
        throw new Error("StartGameView grant runtime powerup result missing snapshot: " + itemId);
      }
      runtimeSnapshot = grantResult.snapshot;
      if (itemId === "precise_aim") {
        this._pendingStartGamePreciseAimActivation = true;
      }
    }, this);
    Object.keys(temporaryPowerups).forEach(function (itemId) {
      var count = temporaryPowerups[itemId];
      if (count <= 0) {
        return;
      }
      var config = START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID[itemId];
      var grantResult = this.gameManager.grantPreparedAdRunPowerup(config.adRunPowerupType, count);
      if (!grantResult || grantResult.accepted !== true) {
        throw new Error("StartGameView grant temporary powerup failed: " + itemId);
      }
      if (!grantResult.snapshot) {
        throw new Error("StartGameView grant temporary powerup result missing snapshot: " + itemId);
      }
      runtimeSnapshot = grantResult.snapshot;
    }, this);

    this._pendingStartGamePowerups = [];
    this._pendingStartGameTemporaryPowerups = createEmptyStartGameTemporaryPowerups();
    this._pendingStartGameTemporaryPowerupCosts = {};
    this._startGameTemporaryPowerupsCommitted = false;
    return runtimeSnapshot;
  },

  _applyPendingStartGamePreciseAimActivation: function (snapshot) {
    if (this._pendingStartGamePreciseAimActivation !== true) {
      return snapshot;
    }
    if (!this.gameManager || typeof this.gameManager.usePreciseAim !== "function") {
      throw new Error("StartGameView precise aim requires GameManager.usePreciseAim.");
    }
    if (typeof this._applyPreciseAimUseResult !== "function") {
      throw new Error("StartGameView precise aim requires _applyPreciseAimUseResult.");
    }
    var preciseAimUseResult = this.gameManager.usePreciseAim();
    if (!preciseAimUseResult || typeof preciseAimUseResult !== "object") {
      throw new Error("StartGameView precise aim activation result must be an object.");
    }
    this._applyPreciseAimUseResult(preciseAimUseResult, {
      recoverByAd: false
    });
    if (preciseAimUseResult.accepted !== true) {
      var preciseAimReason = typeof preciseAimUseResult.reason === "string" && preciseAimUseResult.reason
        ? preciseAimUseResult.reason
        : "unknown";
      throw new Error("StartGameView precise aim activation failed: " + preciseAimReason);
    }
    this._pendingStartGamePreciseAimActivation = false;
    return preciseAimUseResult.snapshot;
  },

  _applyGameplayInventoryQuickBuy: function (purchaseResult, context) {
    requireObject(purchaseResult, "Gameplay inventory quick buy purchase result");
    requireObject(context, "Gameplay inventory quick buy context");
    if (context.source !== "gameplay_inventory_quick_buy") {
      throw new Error("Unsupported gameplay inventory quick buy source: " + context.source);
    }
    if (!purchaseResult.accepted) {
      throw new Error("Gameplay inventory quick buy requires accepted purchase result.");
    }
    if (!purchaseResult.goods || purchaseResult.goods.itemId !== context.itemId) {
      throw new Error("Gameplay inventory quick buy goods itemId mismatch.");
    }
    var powerupType = POWERUP_TYPE_BY_ITEM_ID[context.itemId];
    if (!powerupType || powerupType !== context.powerupType) {
      throw new Error("Gameplay inventory quick buy powerup type mismatch: " + context.itemId);
    }
    var grantCount = requirePositiveInteger(purchaseResult.itemCount, "Gameplay inventory quick buy itemCount");
    if (!this.currentLevelConfig || this.isSelectingLevel || this.isRestarting) {
      throw new Error("Gameplay inventory quick buy requires active gameplay.");
    }
    if (!this.gameManager || typeof this.gameManager.grantPowerupInventory !== "function") {
      throw new Error("Gameplay inventory quick buy requires GameManager.grantPowerupInventory.");
    }
    if (!this.levelRenderer || typeof this.levelRenderer.refreshRuntime !== "function") {
      throw new Error("Gameplay inventory quick buy requires LevelRenderer.refreshRuntime.");
    }

    var grantResult = this.gameManager.grantPowerupInventory(powerupType, grantCount);
    if (!grantResult || grantResult.accepted !== true) {
      throw new Error("Gameplay inventory quick buy runtime grant failed: " + powerupType);
    }
    if (!grantResult.snapshot) {
      throw new Error("Gameplay inventory quick buy runtime grant result missing snapshot: " + powerupType);
    }

    this._handleRuntimeStateTransition(grantResult.snapshot);
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, grantResult.snapshot);
    return grantResult;
  },

  _consumePersistentInventoryItemForPowerup: function (powerupType) {
    var itemId = ITEM_ID_BY_POWERUP_TYPE[powerupType];
    if (!itemId || !this.inventoryStore || typeof this.inventoryStore.removeItem !== "function") {
      return false;
    }

    this._refreshPlayerInventory();
    var removeResult = this.inventoryStore.removeItem(this.playerInventory, itemId, 1);
    if (!removeResult || !removeResult.accepted) {
      this._getAvailableSelectedPowerupItems();
      return false;
    }

    this.playerInventory = removeResult.inventory;
    this.inventoryStore.save(this.playerInventory);
    this._getAvailableSelectedPowerupItems();
    this._renderInventoryView();
    this._updateInventoryEntryState();
    return true;
  },

  _ensureInventoryViewPrefab: function () {
    if (this._inventoryViewPrefab) {
      return Promise.resolve(this._inventoryViewPrefab);
    }

    return this._loadPrefab(INVENTORY_VIEW_PREFAB_PATH).then(function (prefab) {
      this._inventoryViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureStartGameViewPrefab: function () {
    if (this._startGameViewPrefab) {
      return Promise.resolve(this._startGameViewPrefab);
    }

    return this._loadPrefab(START_GAME_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("StartGameView prefab is required.");
      }
      this._startGameViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _showStartGameView: function (levelId, options) {
    var safeLevelId = normalizeStartGameLevelId(levelId);
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("StartGameView options must be an object when provided.");
    }
    if (!this.levelManager || typeof this.levelManager.loadLevel !== "function") {
      throw new Error("StartGameView requires LevelManager.loadLevel.");
    }
    if (typeof this.levelManager.preloadRemotePackAfterLevel !== "function") {
      throw new Error("StartGameView requires LevelManager.preloadRemotePackAfterLevel.");
    }
    this._pendingStartGamePowerups = options && options.selectedItems !== undefined
      ? validateStartGameSelectedPowerups(this, safeLevelId, options.selectedItems)
      : buildDefaultStartGameSelectedPowerups(this, safeLevelId);
    this._pendingStartGameTemporaryPowerups = createEmptyStartGameTemporaryPowerups();
    this._pendingStartGameTemporaryPowerupCosts = {};
    this._startGameTemporaryPowerupsCommitted = false;
    this._startGameLevelId = safeLevelId;
    this._startGameLevelConfig = null;
    this._pendingPreparedLevelConfig = null;
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    return Promise.all([
      this._ensureStartGameViewPrefab(),
      this.levelManager.loadLevel(safeLevelId),
      this.levelManager.preloadRemotePackAfterLevel(safeLevelId)
    ]).then(function (results) {
      var prefab = results[0];
      var levelConfig = results[1];
      var remotePackPreload = results[2];
      LevelColorPermutation.apply(levelConfig);
      if (!remotePackPreload || typeof remotePackPreload !== "object" || Array.isArray(remotePackPreload)) {
        throw new Error("StartGameView remote pack preload result is invalid.");
      }
      if (remotePackPreload.preloaded === true) {
        Logger.info("Preloaded next remote level pack", {
          levelId: safeLevelId,
          packId: remotePackPreload.packId,
          from: remotePackPreload.from,
          to: remotePackPreload.to
        });
      }
      var startGameViewNode = this._startGameViewNode;
      if (!startGameViewNode || !startGameViewNode.isValid) {
        startGameViewNode = cc.instantiate(prefab);
        if (!startGameViewNode) {
          throw new Error("Instantiate StartGameView prefab failed.");
        }
        startGameViewNode.parent = this.node;
        startGameViewNode.setPosition(0, 0);
        startGameViewNode.zIndex = 340;
        this._startGameViewNode = startGameViewNode;
        this._startGameViewController = new StartGameViewController({
          node: startGameViewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._rewindNewUserGuideToQuickStart();
            this._pendingStartGamePowerups = [];
            this._pendingStartGamePreciseAimActivation = false;
            this._hideStartGameView({
              refundTemporaryPowerups: true
            });
            var guideShowResult = this._showNewUserGuideForQuickStart();
            if (guideShowResult && typeof guideShowResult.catch === "function") {
              guideShowResult.catch(function (error) {
                Logger.error("Show quick start new user guide after StartGameView close failed", error && error.stack ? error.stack : String(error));
                throw error;
              });
            }
          }.bind(this),
          onPlay: function (selectedItems) {
            this._playSfx("uiClick");
            this._startPreparedLevelEntry(safeLevelId, selectedItems);
          }.bind(this),
          onPurchasePowerup: function (itemId) {
            this._playSfx("uiClick");
            return this._purchaseStartGamePowerup(itemId);
          }.bind(this),
          onOpenPropDescription: function () {
            this._playSfx("uiClick");
            return this._showStartGamePropDescriptionView();
          }.bind(this),
          onUnavailable: function (message) {
            this._setStatus(message);
            if (this.tipsPresenter && typeof this.tipsPresenter.showText === "function") {
              this.tipsPresenter.showText(message);
            }
          }.bind(this)
        });
      }

      this._startGameViewController.onPlay = function (selectedItems) {
        this._playSfx("uiClick");
        this._startPreparedLevelEntry(normalizeStartGameLevelId(this._startGameLevelId), selectedItems);
      }.bind(this);
      this._startGameViewController.onPurchasePowerup = function (itemId) {
        this._playSfx("uiClick");
        return this._purchaseStartGamePowerup(itemId);
      }.bind(this);
      this._startGameViewController.onOpenPropDescription = function () {
        this._playSfx("uiClick");
        return this._showStartGamePropDescriptionView();
      }.bind(this);
      this._startGameLevelConfig = levelConfig;
      startGameViewNode.active = true;
      PopupPanelAnimator.play(startGameViewNode);
      return this._renderStartGameView().then(function () {
        return waitMilliseconds(PopupPanelAnimator.getOpenDurationMilliseconds());
      }).then(function () {
        return Promise.resolve(this._showNewUserGuideForStartGame()).then(function () {
          return this._showStartGameNativeTemplateAd();
        }.bind(this));
      }.bind(this));
    }.bind(this)).catch(function (error) {
      Logger.error("Show StartGameView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _renderStartGameView: function () {
    if (!this._startGameViewController || !this._startGameViewNode || !this._startGameViewNode.isValid) {
      throw new Error("StartGameView controller is required before rendering.");
    }
    if (!this._startGameLevelConfig) {
      throw new Error("StartGameView level config is required before rendering.");
    }

    this._refreshPlayerInventory();
    return this._startGameViewController.render({
      levelId: normalizeStartGameLevelId(this._startGameLevelId),
      staminaCost: LEVEL_ENTRY_STAMINA_COST,
      oneStarTargetScore: StarRatingPolicy.resolveOneStarTargetScore(this._startGameLevelConfig),
      inventory: this.playerInventory,
      objectives: buildStartGameObjectives(this._startGameLevelConfig),
      showAwardTips: shouldShowFirstClearAwardTips(this, this._startGameLevelId),
      selectedItems: this._pendingStartGamePowerups,
      temporaryPurchasesByItemId: normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups),
      purchaseOptionsByItemId: buildStartGamePurchaseOptions(this, this._startGameLevelConfig)
    });
  },

  _resolveStartGameNativeTemplateAdUnitId: function () {
    return requireNonEmptyString(this.startGameNativeTemplateAdUnitId, "startGameNativeTemplateAdUnitId");
  },

  _resolveStartGameNativeTemplateAdStyle: function (nativeHeightPx) {
    var frameSize = resolveNativeTemplateAdFrameSize();
    if (nativeHeightPx === undefined || nativeHeightPx === null) {
      return {
        left: 0,
        top: 0,
        width: frameSize.width
      };
    }
    var heightPx = requirePositiveFiniteNumber(nativeHeightPx, "StartGameView native template ad height");
    return {
      left: 0,
      top: Math.max(0, frameSize.height - heightPx),
      width: frameSize.width
    };
  },

  _applyStartGameNativeTemplateAdHeight: function (nativeHeightPx) {
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      return;
    }
    var heightPx = requirePositiveFiniteNumber(
      nativeHeightPx,
      "StartGameView native template ad height"
    );
    if (this._startGameNativeTemplateAdHeightPx === heightPx) {
      return;
    }
    this._startGameNativeTemplateAdHeightPx = heightPx;
  },

  _showStartGameNativeTemplateAd: function () {
    if (!this.startGameNativeTemplateAdAdapter || typeof this.startGameNativeTemplateAdAdapter.isSupported !== "function") {
      throw new Error("StartGameView native template ad adapter is required.");
    }
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      logStartGameNativeTemplateAd("skip", "StartGameView node is not active.");
      return Promise.resolve(false);
    }
    if (!this.startGameNativeTemplateAdAdapter.isSupported()) {
      logStartGameNativeTemplateAd("skip", "wx.createCustomAd is unavailable in current runtime.");
      this._hideStartGameNativeTemplateAd();
      return Promise.resolve(false);
    }
    if (typeof this.scheduleOnce !== "function") {
      throw new Error("StartGameView native template ad requires GameBootstrap.scheduleOnce.");
    }

    logStartGameNativeTemplateAd("schedule", {
      levelId: this._startGameLevelId,
      delaySec: START_GAME_NATIVE_TEMPLATE_AD_SHOW_DELAY_SEC
    });
    var self = this;
    return new Promise(function (resolve) {
      self.scheduleOnce(function () {
        resolve(self._invokeStartGameNativeTemplateAd());
      }, START_GAME_NATIVE_TEMPLATE_AD_SHOW_DELAY_SEC);
    });
  },

  _invokeStartGameNativeTemplateAd: function () {
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      logStartGameNativeTemplateAd("skip", "StartGameView closed before native ad show.");
      return Promise.resolve(false);
    }
    if (typeof this._hideLevelSelectNativeTemplateAd === "function") {
      this._hideLevelSelectNativeTemplateAd();
    }
    if (typeof this._hideResultNativeTemplateAd === "function") {
      this._hideResultNativeTemplateAd();
    }

    var adUnitId = this._resolveStartGameNativeTemplateAdUnitId();
    var style = this._resolveStartGameNativeTemplateAdStyle();
    logStartGameNativeTemplateAd("invoke", {
      adUnitId: adUnitId,
      style: style
    });
    return Promise.resolve().then(function () {
      return this.startGameNativeTemplateAdAdapter.showAd({
        adUnitId: adUnitId,
        adIntervals: 40,
        placement: "bottom",
        adLogLabel: START_GAME_AD_LOG_LABEL,
        style: style,
        onHeightChange: function (heightPx, source) {
          logStartGameNativeTemplateAd("height", {
            heightPx: heightPx,
            source: source
          });
          this._applyStartGameNativeTemplateAdHeight(heightPx);
        }.bind(this),
        onError: function (error) {
          Logger.error("StartGameView native template ad error", error && error.errMsg ? error.errMsg : error);
          this._hideStartGameNativeTemplateAd();
        }.bind(this)
      });
    }.bind(this)).then(function () {
      this._startGameNativeTemplateAdShowing = true;
      logStartGameNativeTemplateAd("shown", {
        heightPx: this._startGameNativeTemplateAdHeightPx
      });
      return true;
    }.bind(this)).catch(function (error) {
      Logger.error("StartGameView native template ad show failed: " + (error && error.message ? error.message : String(error)));
      this._hideStartGameNativeTemplateAd();
      return false;
    }.bind(this));
  },

  _hideStartGameNativeTemplateAd: function () {
    if (this.startGameNativeTemplateAdAdapter && typeof this.startGameNativeTemplateAdAdapter.hideAd === "function") {
      this.startGameNativeTemplateAdAdapter.hideAd();
    }
    this._startGameNativeTemplateAdShowing = false;
    this._startGameNativeTemplateAdHeightPx = 0;
  },

  _refreshStartGameNativeTemplateAdLayout: function () {
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      return;
    }
    if (this._startGameNativeTemplateAdShowing !== true) {
      return;
    }
    if (!this.startGameNativeTemplateAdAdapter || typeof this.startGameNativeTemplateAdAdapter.updateStyle !== "function") {
      throw new Error("StartGameView native template ad adapter cannot update style.");
    }
    if (this._startGameNativeTemplateAdHeightPx <= 0) {
      return;
    }
    var updated = this.startGameNativeTemplateAdAdapter.updateStyle(
      this._resolveStartGameNativeTemplateAdStyle(this._startGameNativeTemplateAdHeightPx)
    );
    if (updated !== true) {
      throw new Error("StartGameView native template ad style update failed because ad instance is missing.");
    }
  },

  _purchaseStartGamePowerup: function (itemId) {
    if (isStartGameTemporaryPowerupItem(itemId)) {
      return this._purchaseStartGameTemporaryPowerup(itemId);
    }
    var goods = getStartGameShopGoodsByItemId(this, itemId);
    var result = this.shopPurchaseService.purchase(goods.skuId, 1);
    if (!result || typeof result.accepted !== "boolean") {
      throw new Error("StartGameView purchase result is invalid.");
    }
    if (!result.accepted) {
      return {
        accepted: false,
        message: this._resolveShopPurchaseFailMessage(result.reason)
      };
    }

    this._refreshPlayerResources();
    this._refreshPlayerInventory();
    this._updateLevelSelectTopStatus();
    this._renderInventoryView();
    this._updateInventoryEntryState();
    if (this._shopViewNode && cc.isValid(this._shopViewNode) && this._shopViewNode.active) {
      this._renderShopView();
    }

    var message = "获得" + result.goods.displayName + " +" + result.itemCount;
    this._setStatusWithTip("shop_purchase_success", null, message);
    return {
      accepted: true,
      inventory: this.playerInventory,
      temporaryPurchasesByItemId: normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups),
      purchaseOptionsByItemId: buildStartGamePurchaseOptions(this, this._startGameLevelConfig),
      message: message
    };
  },

  _purchaseStartGameTemporaryPowerup: function (itemId) {
    if (!isStartGameTemporaryPowerupItem(itemId)) {
      throw new Error("StartGameView temporary purchase item is unsupported: " + itemId);
    }
    if (!this._startGameLevelConfig) {
      throw new Error("StartGameView temporary purchase requires level config.");
    }
    if (!isStartGameTemporaryPowerupAllowed(this._startGameLevelConfig, itemId)) {
      return {
        accepted: false,
        message: "本关不可用"
      };
    }
    var temporaryPowerups = normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups);
    if (temporaryPowerups[itemId] > 0) {
      return {
        accepted: false,
        message: "已购买"
      };
    }
    if (typeof this._spendCoinsForStartGamePowerup !== "function") {
      throw new Error("StartGameView temporary purchase requires _spendCoinsForStartGamePowerup.");
    }
    var config = START_GAME_TEMPORARY_POWERUP_CONFIG_BY_ITEM_ID[itemId];
    var spendResult = this._spendCoinsForStartGamePowerup(config.price, "start_game_powerup");
    if (!spendResult || spendResult.accepted !== true) {
      if (!spendResult || typeof spendResult.reason !== "string") {
        throw new Error("StartGameView temporary purchase spend result is invalid.");
      }
      return {
        accepted: false,
        message: this._resolveShopPurchaseFailMessage(spendResult.reason)
      };
    }

    temporaryPowerups[itemId] = 1;
    this._pendingStartGameTemporaryPowerups = temporaryPowerups;
    if (!this._pendingStartGameTemporaryPowerupCosts || typeof this._pendingStartGameTemporaryPowerupCosts !== "object" || Array.isArray(this._pendingStartGameTemporaryPowerupCosts)) {
      this._pendingStartGameTemporaryPowerupCosts = {};
    }
    this._pendingStartGameTemporaryPowerupCosts[itemId] = requirePositiveInteger(spendResult.cost, "StartGameView temporary spend cost");
    this._refreshPlayerResources();
    this._updateLevelSelectTopStatus();

    var message = "购买" + config.displayName + "成功";
    this._setStatusWithTip("start_game_temporary_powerup_purchase_success", null, message);
    return {
      accepted: true,
      inventory: this.playerInventory,
      temporaryPurchasesByItemId: normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups),
      purchaseOptionsByItemId: buildStartGamePurchaseOptions(this, this._startGameLevelConfig),
      message: message
    };
  },

  _refundPendingStartGameTemporaryPowerups: function () {
    var temporaryPowerups = normalizeStartGameTemporaryPowerups(this._pendingStartGameTemporaryPowerups);
    var costs = this._pendingStartGameTemporaryPowerupCosts;
    if (!costs || typeof costs !== "object" || Array.isArray(costs)) {
      costs = {};
    }
    var refundTotal = 0;
    Object.keys(temporaryPowerups).forEach(function (itemId) {
      if (temporaryPowerups[itemId] <= 0) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(costs, itemId)) {
        throw new Error("StartGameView temporary powerup refund cost missing: " + itemId);
      }
      refundTotal += requirePositiveInteger(costs[itemId], "StartGameView temporary refund cost `" + itemId + "`");
    });
    if (refundTotal > 0) {
      if (typeof this._refundCoinsForStartGamePowerup !== "function") {
        throw new Error("StartGameView temporary refund requires _refundCoinsForStartGamePowerup.");
      }
      this._refundCoinsForStartGamePowerup(refundTotal, "start_game_powerup_rollback");
      this._setStatusWithTip("start_game_temporary_powerup_refund", null, "已返还未开局道具金币");
    }
    this._pendingStartGameTemporaryPowerups = createEmptyStartGameTemporaryPowerups();
    this._pendingStartGameTemporaryPowerupCosts = {};
    this._startGameTemporaryPowerupsCommitted = false;
  },

  _hideStartGameView: function (options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("StartGameView hide options must be an object when provided.");
    }
    this._hideStartGamePropDescriptionView();
    var shouldRefundTemporaryPowerups = !options || options.refundTemporaryPowerups !== false;
    if (shouldRefundTemporaryPowerups && this._startGameTemporaryPowerupsCommitted !== true) {
      this._refundPendingStartGameTemporaryPowerups();
    }
    this._startGameLevelId = 0;
    this._startGameLevelConfig = null;
    this._hideStartGameNativeTemplateAd();
    this._hideNewUserGuide();
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "StartGameView",
      nodeKey: "_startGameViewNode",
      prefabKey: "_startGameViewPrefab",
      controllerKey: "_startGameViewController"
    });
    destroyStartGamePropDescriptionView(this);
    releaseStartGamePropDescriptionSpriteFrameCache(this);
  },

  _ensureStartGamePropDescriptionViewPrefab: function () {
    return this._loadPrefab(PROP_DESCRIPTION_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab || !cc.isValid(prefab)) {
        throw new Error("StartGameView loaded an invalid PropDescriptionView prefab.");
      }
      return retainStartGamePropDescriptionPrefab(this, prefab);
    }.bind(this));
  },

  _ensureStartGamePropDescriptionSpriteFrames: function () {
    var paths = PropDescriptionConfig.getAllIconPaths();
    var cache = this._startGamePropDescriptionSpriteFrameCache;
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
      throw new Error("StartGameView prop description sprite frame cache must be an object.");
    }
    var missingPaths = paths.filter(function (path) {
      return !cache[path];
    });
    if (missingPaths.length === 0) {
      return Promise.resolve(cache);
    }
    if (this._startGamePropDescriptionSpriteLoadPromise) {
      return this._startGamePropDescriptionSpriteLoadPromise;
    }
    this._startGamePropDescriptionSpriteLoadPromise = Promise.all(missingPaths.map(function (path) {
      return loadPropDescriptionSpriteFrame(path).then(function (spriteFrame) {
        return {
          path: path,
          spriteFrame: retainPropDescriptionSpriteFrame(spriteFrame, path)
        };
      });
    })).then(function (results) {
      results.forEach(function (entry) {
        if (!entry || typeof entry.path !== "string" || !entry.spriteFrame) {
          throw new Error("StartGameView prop description sprite load result is invalid.");
        }
        cache[entry.path] = entry.spriteFrame;
      });
      this._startGamePropDescriptionSpriteLoadPromise = null;
      return cache;
    }.bind(this)).catch(function (error) {
      this._startGamePropDescriptionSpriteLoadPromise = null;
      throw error;
    }.bind(this));
    return this._startGamePropDescriptionSpriteLoadPromise;
  },

  _showStartGamePropDescriptionView: function () {
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      throw new Error("StartGameView prop description requires active StartGameView.");
    }
    if (!this._startGameLevelConfig) {
      throw new Error("StartGameView prop description requires level config.");
    }
    if (this._isStartGamePropDescriptionViewOpen === true) {
      throw new Error("StartGameView prop description is already open.");
    }
    return this._ensureStartGamePropDescriptionViewPrefab().then(function (prefab) {
      return this._ensureStartGamePropDescriptionSpriteFrames().then(function (spriteFrameCache) {
        var viewNode = this._startGamePropDescriptionViewNode;
        if (!viewNode || !viewNode.isValid) {
          viewNode = cc.instantiate(prefab);
          if (!viewNode) {
            throw new Error("Instantiate StartGameView PropDescriptionView prefab failed.");
          }
          viewNode.parent = this.node;
          viewNode.setPosition(0, 0);
          viewNode.zIndex = START_GAME_PROP_DESCRIPTION_VIEW_Z_INDEX;
          this._startGamePropDescriptionViewNode = viewNode;
          this._startGamePropDescriptionViewController = new PropDescriptionViewController({
            node: viewNode,
            onClose: function () {
              this._closeStartGamePropDescriptionView();
            }.bind(this)
          });
        }
        viewNode.active = true;
        viewNode.setPosition(0, 0);
        PopupPresentationHelper.ensurePopupMaskVisible(
          viewNode,
          this.node,
          164,
          this._startGamePropDescriptionWhiteMaskFrames
        );
        var popupContent = PopupPresentationHelper.ensurePopupContentContainer(viewNode);
        try {
          this._startGamePropDescriptionViewController.render({
            levelConfig: this._startGameLevelConfig,
            spriteFrameCache: spriteFrameCache
          });
        } catch (error) {
          destroyStartGamePropDescriptionView(this);
          throw error;
        }
        PopupPresentationHelper.playPopupContentOpenAnimation(popupContent);
        this._isStartGamePropDescriptionViewOpen = true;
      }.bind(this));
    }.bind(this)).catch(function (error) {
      destroyStartGamePropDescriptionView(this);
      throw error;
    }.bind(this));
  },

  _hideStartGamePropDescriptionView: function () {
    if (this._isStartGamePropDescriptionViewOpen !== true) {
      return;
    }
    if (!this._startGamePropDescriptionViewNode || !this._startGamePropDescriptionViewNode.isValid) {
      throw new Error("StartGameView prop description node is invalid.");
    }
    destroyStartGamePropDescriptionView(this);
  },

  _closeStartGamePropDescriptionView: function () {
    if (this._isStartGamePropDescriptionViewOpen !== true) {
      throw new Error("StartGameView prop description close requires an active modal.");
    }
    this._playSfx("uiClick");
    this._hideStartGamePropDescriptionView();
  },

  _loadPreparedLevelFromLevelSelect: function (levelId, selectedItems) {
    var safeLevelId = normalizeStartGameLevelId(levelId);
    var preparedItems = validateStartGameSelectedPowerups(this, safeLevelId, selectedItems);
    this._pendingStartGamePowerups = preparedItems.slice();
    this._setStatus("Loading level_" + String(safeLevelId).padStart(3, "0") + "...");
    this._loadLevelById(safeLevelId, "Level selected", "Load selected level failed. Check console logs.");
  },

  _startPreparedLevelEntry: function (levelId, selectedItems) {
    var safeLevelId = normalizeStartGameLevelId(levelId);
    var preparedItems = validateStartGameSelectedPowerups(this, safeLevelId, selectedItems);

    if (!this._consumeStaminaForLevelEntry()) {
      this._showPowerTipsView(function () {
        return this._startPreparedLevelEntry(safeLevelId, preparedItems);
      }.bind(this));
      return false;
    }

    this._pendingStartGamePowerups = preparedItems.slice();
    this._startGameTemporaryPowerupsCommitted = true;
    if (!this._startGameLevelConfig || !this._startGameLevelConfig.level || this._startGameLevelConfig.level.levelId !== safeLevelId) {
      throw new Error("StartGameView prepared level config must match selected level.");
    }
    this._pendingPreparedLevelConfig = {
      levelId: safeLevelId,
      levelConfig: this._startGameLevelConfig
    };
    this._hideStartGameView({
      refundTemporaryPowerups: false
    });
    this._advanceNewUserGuideToGameplay();
    this._setStatus("Loading level_" + String(safeLevelId).padStart(3, "0") + "...");
    this._loadLevelById(safeLevelId, "Level selected", "Load selected level failed. Check console logs.");
    return true;
  },

  _ensurePowerTipsViewPrefab: function () {
    if (this._powerTipsViewPrefab) {
      return Promise.resolve(this._powerTipsViewPrefab);
    }

    return this._loadPrefab(POWER_TIPS_VIEW_PREFAB_PATH).then(function (prefab) {
      this._powerTipsViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _bindPowerTipsViewActions: function (powerTipsViewNode) {
    var adButtonNode = this._findNodeByNameRecursive(powerTipsViewNode, "ad_btn");
    var closeButtonNode = this._findNodeByNameRecursive(powerTipsViewNode, "btn_close");
    var maskNode = this._findNodeByNameRecursive(powerTipsViewNode, "mask");
    if (!adButtonNode || !closeButtonNode || !maskNode) {
      throw new Error("PowerTipsView requires mask, ad_btn and btn_close nodes.");
    }

    this._bindNodeTapOnce(closeButtonNode, function () {
      this._playSfx("uiClick");
      this._hidePowerTipsView();
    }.bind(this));

    this._bindNodeTapOnce(maskNode, function () {
      this._playSfx("uiClick");
      this._hidePowerTipsView();
    }.bind(this));

    this._bindNodeTapOnce(adButtonNode, function () {
      this._onPowerTipsAdTap();
    }.bind(this));
  },

  _renderPowerTipsView: function () {
    if (!this._powerTipsViewNode || !cc.isValid(this._powerTipsViewNode)) {
      throw new Error("PowerTipsView node is required before rendering.");
    }
    if (typeof this._resolveStaminaRecoveryGrantAmount !== "function") {
      throw new Error("PowerTipsView requires stamina recovery grant resolver.");
    }

    var powerItemNode = this._findNodeByNameRecursive(this._powerTipsViewNode, "power_item");
    var numNode = powerItemNode ? powerItemNode.getChildByName("num") : null;
    var numLabel = numNode ? numNode.getComponent(cc.Label) : null;
    if (!numLabel) {
      throw new Error("PowerTipsView power_item requires num label.");
    }

    numLabel.string = "x" + this._resolveStaminaRecoveryGrantAmount();
    SpriteProxyLayerHelper.rebuildAutoProxyTree({
      rootNode: this._powerTipsViewNode,
      proxyRootName: POWER_TIPS_PROXY_ROOT_NAME
    });
  },

  _showPowerTipsView: function (onRecovered) {
    if (typeof onRecovered !== "function") {
      throw new Error("PowerTipsView requires a recovery callback.");
    }

    this._pendingPowerTipsRecovery = {
      onRecovered: onRecovered,
      source: this.isSelectingLevel ? "level_select" : "runtime"
    };
    this._hideAwardView();
    this._hideSettingView();
    this._hideRankingView();
    this._hideShopView();
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }

    this._ensurePowerTipsViewPrefab().then(function (prefab) {
      var powerTipsViewNode = this._powerTipsViewNode;
      if (!powerTipsViewNode || !cc.isValid(powerTipsViewNode)) {
        powerTipsViewNode = cc.instantiate(prefab);
        if (!powerTipsViewNode) {
          throw new Error("Instantiate PowerTipsView prefab failed.");
        }
        powerTipsViewNode.parent = this.node;
        powerTipsViewNode.setPosition(0, 0);
        powerTipsViewNode.zIndex = 360;
        this._powerTipsViewNode = powerTipsViewNode;
        this._bindPowerTipsViewActions(powerTipsViewNode);
      }

      powerTipsViewNode.active = true;
      PopupPanelAnimator.play(powerTipsViewNode);
      this._renderPowerTipsView();
      this._setStatus("体力不足，观看广告可恢复体力");
    }.bind(this)).catch(function (error) {
      Logger.error("Show PowerTipsView failed", error && error.stack ? error.stack : error);
      this._pendingPowerTipsRecovery = null;
      this._setStatus("体力不足提示加载失败");
    }.bind(this));
  },

  _hidePowerTipsView: function () {
    this._pendingPowerTipsRecovery = null;
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "PowerTipsView",
      nodeKey: "_powerTipsViewNode",
      prefabKey: "_powerTipsViewPrefab"
    });
  },

  _ensureStaminaFlySpriteFrame: function () {
    if (this._staminaFlySpriteFrame) {
      return Promise.resolve(this._staminaFlySpriteFrame);
    }

    return new Promise(function (resolve, reject) {
      BundleLoader.loadRes(STAMINA_FLY_ICON_PATH, cc.SpriteFrame, function (error, spriteFrame) {
        if (error) {
          reject(new Error("Load stamina fly icon failed: " + (error.message || error)));
          return;
        }
        if (!spriteFrame) {
          reject(new Error("Stamina fly icon sprite frame is empty."));
          return;
        }
        this._staminaFlySpriteFrame = spriteFrame;
        resolve(spriteFrame);
      }.bind(this));
    }.bind(this));
  },

  _playStaminaFlyToTop: function () {
    if (!this.node || !this.node.isValid) {
      throw new Error("Stamina fly animation requires root node.");
    }
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      throw new Error("Stamina fly animation requires LevelView.");
    }
    if (typeof cc.tween !== "function") {
      throw new Error("Stamina fly animation requires cc.tween.");
    }

    var topLayerNode = this._getLevelSelectTopLayerNode();
    var loveInfoNode = topLayerNode ? topLayerNode.getChildByName("love_info") : null;
    requireValidNode(loveInfoNode, "LevelView top_layer/love_info");

    return this._ensureStaminaFlySpriteFrame().then(function (spriteFrame) {
      var flyNode = new cc.Node("stamina_fly_icon");
      flyNode.parent = this.node;
      flyNode.zIndex = 950;
      flyNode.setPosition(0, 0);
      flyNode.width = 72;
      flyNode.height = 72;
      flyNode.scale = 1;
      flyNode.opacity = 255;

      var sprite = flyNode.addComponent(cc.Sprite);
      sprite.spriteFrame = spriteFrame;

      var targetPosition = resolveNodeWorldPositionInParent(loveInfoNode, this.node);
      return new Promise(function (resolve) {
        cc.tween(flyNode)
          .to(STAMINA_FLY_DURATION, {
            x: targetPosition.x,
            y: targetPosition.y,
            scale: 0.55
          }, {
            easing: "quadInOut"
          })
          .to(STAMINA_FLY_FADE_DURATION, {
            opacity: 0
          })
          .call(function () {
            if (flyNode && flyNode.isValid) {
              flyNode.destroy();
            }
            resolve();
          })
          .start();
      });
    }.bind(this));
  },

  _delayAfterStaminaFly: function () {
    return new Promise(function (resolve) {
      setTimeout(resolve, STAMINA_FLY_ENTER_DELAY * 1000);
    });
  },

  _onPowerTipsAdTap: function () {
    if (this._staminaRecoveryInProgress) {
      this._setStatus("广告处理中，请稍候...");
      return;
    }
    if (!this._pendingPowerTipsRecovery || typeof this._pendingPowerTipsRecovery.onRecovered !== "function") {
      throw new Error("PowerTipsView recovery callback is missing.");
    }

    this._playSfx("uiClick");
    var recoverySource = this._pendingPowerTipsRecovery.source;
    return this._tryRecoverStaminaByAd(function () {
      var recoveryContext = this._pendingPowerTipsRecovery;
      if (!recoveryContext || typeof recoveryContext.onRecovered !== "function") {
        throw new Error("PowerTipsView recovery callback was cleared before reward grant.");
      }
      var onRecovered = recoveryContext.onRecovered;
      this._hidePowerTipsView();

      if (recoverySource !== "level_select") {
        return onRecovered();
      }

      return this._playStaminaFlyToTop().then(function () {
        this._updateLevelSelectTopStatus();
        return this._delayAfterStaminaFly();
      }.bind(this)).then(function () {
        return onRecovered();
      }.bind(this));
    }.bind(this), {
      deferTopStatusUpdate: recoverySource === "level_select"
    });
  },

  _setPendingLevelEntry: function (levelId) {
    var safeLevelId = Math.max(1, Math.floor(Number(levelId) || 0));
    if (safeLevelId <= 0) {
      this._pendingLevelEntry = null;
      return null;
    }

    this._pendingLevelEntry = {
      levelId: safeLevelId
    };
    return this._pendingLevelEntry;
  },

  _clearPendingLevelEntry: function () {
    this._pendingLevelEntry = null;
    this._inventoryViewReadOnly = true;
  },

  _isInventorySelectionOperable: function () {
    return !!(this._pendingLevelEntry && this._pendingLevelEntry.levelId);
  },

  _hasAvailableInventoryForLevelEntry: function () {
    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.getItemCount !== "function") {
      var rawItems = this.playerInventory && this.playerInventory.items ? this.playerInventory.items : {};
      return Object.keys(POWERUP_TYPE_BY_ITEM_ID).some(function (itemId) {
        return Math.max(0, Math.floor(Number(rawItems[itemId]) || 0)) > 0;
      });
    }

    return Object.keys(POWERUP_TYPE_BY_ITEM_ID).some(function (itemId) {
      return this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this);
  },

  _enterLevelFromLevelSelect: function (levelId) {
    var safeLevelId = normalizeStartGameLevelId(levelId);

    if (!this._consumeStaminaForLevelEntry()) {
      this._showPowerTipsView(function () {
        return this._showStartGameView(safeLevelId, {
          selectedItems: []
        });
      }.bind(this));
      return false;
    }

    this._loadPreparedLevelFromLevelSelect(safeLevelId, []);
    return true;
  },

  _startPendingLevelEntry: function () {
    if (!this._pendingLevelEntry || !this._pendingLevelEntry.levelId) {
      return false;
    }

    var levelId = this._pendingLevelEntry.levelId;
    this._clearPendingLevelEntry();
    return this._enterLevelFromLevelSelect(levelId);
  },

  _showInventoryView: function (options) {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("Inventory view options must be an object.");
    }
    this._clearPendingLevelEntry();
    this._inventoryViewReadOnly = true;

    this._playSfx("uiClick");
    this._hideSettingView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
    this._updateInventoryEntryState();
    this._ensureInventoryViewPrefab().then(function (prefab) {
      if (!prefab) {
        throw new Error("BackpackView prefab is required.");
      }

      var inventoryViewNode = this._inventoryViewNode;
      if (!inventoryViewNode || !inventoryViewNode.isValid) {
        inventoryViewNode = cc.instantiate(prefab);
        inventoryViewNode.parent = this.node;
        inventoryViewNode.setPosition(0, 0);
        inventoryViewNode.zIndex = 320;
        this._inventoryViewNode = inventoryViewNode;
        this._inventoryViewController = new BackpackViewController({
          node: inventoryViewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._clearPendingLevelEntry();
            this._inventoryViewReadOnly = true;
            this._hideInventoryView();
          }.bind(this)
        });
      }

      inventoryViewNode.active = true;
      PopupPanelAnimator.play(inventoryViewNode);
      return this._renderInventoryView();
    }.bind(this)).catch(function (error) {
      Logger.error("Show inventory view failed", error && error.stack ? error.stack : error);
      throw error;
    }.bind(this));
  },

  _hideInventoryView: function () {
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "BackpackView",
      nodeKey: "_inventoryViewNode",
      prefabKey: "_inventoryViewPrefab",
      controllerKey: "_inventoryViewController"
    });
    if (!this._isInventorySelectionOperable()) {
      this._inventoryViewReadOnly = true;
    }
  },

  _confirmInventorySelection: function () {
    this._hideInventoryView();
  },

  _toggleInventorySelection: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    if (!this.inventoryStore || this.inventoryStore.getItemCount(this.playerInventory, itemId) <= 0) {
      this._setStatusWithTip("inventory_item_empty", null, "该道具库存不足");
      return;
    }

    var toggleResult = this.selectedPowerupsStore.toggleItem(this.selectedPowerupsState, itemId);
    if (!toggleResult || !toggleResult.accepted) {
      this._setStatusWithTip("inventory_selection_failed", null, "道具选择失败");
      return;
    }

    this.selectedPowerupsState = toggleResult.state;
    this.selectedPowerupsStore.save(this.selectedPowerupsState);
    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _increaseInventorySelectionCount: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    if (!this.inventoryStore || this.inventoryStore.getItemCount(this.playerInventory, itemId) <= 0) {
      this._setStatusWithTip("inventory_item_empty", null, "该道具库存不足");
      return;
    }

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    if (selectedItems.indexOf(itemId) < 0) {
      this._setStatusWithTip("inventory_selection_failed", null, "请先选择该道具");
      return;
    }

    var selectedCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var currentCount = Math.max(1, Math.floor(Number(selectedCounts[itemId]) || 1));
    var inventoryCount = this.inventoryStore.getItemCount(this.playerInventory, itemId);
    if (currentCount >= inventoryCount) {
      this._setStatusWithTip("inventory_count_max", null, "已达到库存上限");
      return;
    }
    var nextCounts = {};
    selectedItems.forEach(function (selectedItemId) {
      nextCounts[selectedItemId] = Math.max(1, Math.floor(Number(selectedCounts[selectedItemId]) || 1));
    });
    nextCounts[itemId] = Math.min(inventoryCount, currentCount + 1);
    this._saveSelectedPowerups(selectedItems, nextCounts);
    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _decreaseInventorySelectionCount: function (itemId) {
    if (!this._isInventorySelectionOperable()) {
      return;
    }

    this._playSfx("uiClick");
    this._refreshPlayerInventory();
    this._refreshSelectedPowerups();

    var selectedItems = this.selectedPowerupsState && Array.isArray(this.selectedPowerupsState.selectedItems)
      ? this.selectedPowerupsState.selectedItems.slice()
      : [];
    if (selectedItems.indexOf(itemId) < 0) {
      return;
    }

    var selectedCounts = this.selectedPowerupsState && this.selectedPowerupsState.selectedItemCounts
      ? this.selectedPowerupsState.selectedItemCounts
      : {};
    var currentCount = Math.max(1, Math.floor(Number(selectedCounts[itemId]) || 1));
    var nextCounts = {};
    selectedItems.forEach(function (selectedItemId) {
      nextCounts[selectedItemId] = Math.max(1, Math.floor(Number(selectedCounts[selectedItemId]) || 1));
    });

    if (currentCount <= 1) {
      var remainingItems = selectedItems.filter(function (selectedItemId) {
        return selectedItemId !== itemId;
      });
      delete nextCounts[itemId];
      this._saveSelectedPowerups(remainingItems, nextCounts);
      this._setStatusWithTip("inventory_item_removed", null, "已取消选择该道具");
    } else {
      nextCounts[itemId] = currentCount - 1;
      this._saveSelectedPowerups(selectedItems, nextCounts);
    }

    this._renderInventoryView();
    this._updateInventoryEntryState();
  },

  _renderInventoryView: function () {
    if (!this._inventoryViewController || !this._inventoryViewNode || !this._inventoryViewNode.isValid) {
      return;
    }

    this._refreshPlayerInventory();
    return this._inventoryViewController.render({
      inventory: this.playerInventory
    });
  },

  _updateInventoryEntryState: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var bottomLayerNode = this._levelSelectNode.getChildByName("bottom_layer");
    var entryNode = bottomLayerNode ? bottomLayerNode.getChildByName("backpack_btn") : null;
    if (!entryNode || !entryNode.isValid) {
      return;
    }

    this._refreshPlayerInventory();
    if (!this.inventoryStore || typeof this.inventoryStore.getItemCount !== "function") {
      throw new Error("Inventory entry state requires InventoryStore.getItemCount.");
    }
    var hasAnyItem = Object.keys(POWERUP_TYPE_BY_ITEM_ID).some(function (itemId) {
      return this.inventoryStore.getItemCount(this.playerInventory, itemId) > 0;
    }, this);
    entryNode.opacity = hasAnyItem ? 255 : 230;
  }
};
