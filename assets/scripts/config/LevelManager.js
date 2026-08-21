"use strict";

var LevelConfigLoader = require("./LevelConfigLoader");
var RemoteLevelPackLoader = require("./RemoteLevelPackLoader");
var LevelPackManifest = require("./LevelPackManifest");
var RandomChallengeManager = require("./RandomChallengeManager");
var TEST_LEVEL_KEY = "level_test";
var TRAPPED_SPRITE_TEST_LEVEL_KEY = "level_trapped_sprite_test";
var BOARD_OCCLUSION_TEST_LEVEL_KEY = "level_board_occlusion_test";
var FEATURE_TEST_LEVEL_KEYS = {
  black_hole: "level_black_hole_test",
  spirit_cocoon: "level_spirit_cocoon_test",
  multi_trapped_spirit: "level_multi_trapped_spirit_test",
  transparent_ball: "level_transparent_ball_test",
  breeder_ball: "level_breeder_ball_test",
  mine: "level_mine_test",
  bud: "level_bud_test",
  crystal_gun: "level_crystal_gun_test",
  rainbow_prism_ball: "level_rainbow_prism_ball_test",
  poison_attachment: "level_poison_attachment_test",
  ice_crystal_attachment: "level_ice_crystal_attachment_test",
  bubble_shield_attachment: "level_bubble_shield_attachment_test",
  lock_chain: "level_lock_chain_test",
  color_cloud: "level_color_cloud_test",
  spider: "level_spider_test",
  wind_tunnel: "level_wind_tunnel_test"
};

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function LevelManager(options) {
  var opts = options || {};
  if (options && typeof options.loadLevelByKey === "function") {
    opts = {
      localLoader: options
    };
  }
  this._loader = opts.localLoader || new LevelConfigLoader();
  this._remoteLoader = opts.remoteLoader || new RemoteLevelPackLoader();
  this._randomChallengeManager = opts.randomChallengeManager === undefined
    ? RandomChallengeManager
    : opts.randomChallengeManager;
  this._localLevelMax = opts.localLevelMax || LevelPackManifest.LOCAL_LEVEL_MAX;
  this._cache = {};
}

LevelManager.prototype.getLevelKey = function (levelId) {
  return "level_" + padLevelId(levelId);
};

LevelManager.prototype.loadLevel = function (levelId) {
  var levelKey = this.getLevelKey(levelId);

  if (this._cache[levelKey]) {
    return Promise.resolve(clone(this._cache[levelKey]));
  }

  var loader = levelId <= this._localLevelMax ? this._loader : this._remoteLoader;
  if (!loader || typeof loader.loadLevelByKey !== "function") {
    throw new Error("Level loader missing loadLevelByKey for " + levelKey + ".");
  }

  return loader.loadLevelByKey(levelKey).then(function (config) {
    this._cache[levelKey] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.loadTestLevel = function () {
  if (this._cache[TEST_LEVEL_KEY]) {
    return Promise.resolve(clone(this._cache[TEST_LEVEL_KEY]));
  }
  if (!this._loader || typeof this._loader.loadLevelByKey !== "function") {
    throw new Error("Local level loader missing loadLevelByKey for " + TEST_LEVEL_KEY + ".");
  }

  return this._loader.loadLevelByKey(TEST_LEVEL_KEY).then(function (config) {
    this._cache[TEST_LEVEL_KEY] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.loadTrappedSpriteTestLevel = function () {
  if (this._cache[TRAPPED_SPRITE_TEST_LEVEL_KEY]) {
    return Promise.resolve(clone(this._cache[TRAPPED_SPRITE_TEST_LEVEL_KEY]));
  }
  if (!this._loader || typeof this._loader.loadLevelByKey !== "function") {
    throw new Error("Local level loader missing loadLevelByKey for " + TRAPPED_SPRITE_TEST_LEVEL_KEY + ".");
  }

  return this._loader.loadLevelByKey(TRAPPED_SPRITE_TEST_LEVEL_KEY).then(function (config) {
    this._cache[TRAPPED_SPRITE_TEST_LEVEL_KEY] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.loadBoardOcclusionTestLevel = function () {
  if (this._cache[BOARD_OCCLUSION_TEST_LEVEL_KEY]) {
    return Promise.resolve(clone(this._cache[BOARD_OCCLUSION_TEST_LEVEL_KEY]));
  }
  if (!this._loader || typeof this._loader.loadLevelByKey !== "function") {
    throw new Error("Local level loader missing loadLevelByKey for " + BOARD_OCCLUSION_TEST_LEVEL_KEY + ".");
  }

  return this._loader.loadLevelByKey(BOARD_OCCLUSION_TEST_LEVEL_KEY).then(function (config) {
    this._cache[BOARD_OCCLUSION_TEST_LEVEL_KEY] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.loadFeatureTestLevel = function (featureKey) {
  var levelKey = FEATURE_TEST_LEVEL_KEYS[featureKey];
  if (!levelKey) {
    throw new Error("Unsupported feature test level key: " + featureKey + ".");
  }
  if (this._cache[levelKey]) {
    return Promise.resolve(clone(this._cache[levelKey]));
  }
  if (!this._loader || typeof this._loader.loadLevelByKey !== "function") {
    throw new Error("Local level loader missing loadLevelByKey for " + levelKey + ".");
  }

  return this._loader.loadLevelByKey(levelKey).then(function (config) {
    this._cache[levelKey] = config;
    return clone(config);
  }.bind(this));
};

LevelManager.prototype.preloadLevels = function (levelIds) {
  return Promise.all(levelIds.map(function (levelId) {
    return this.loadLevel(levelId);
  }, this));
};

LevelManager.prototype.preloadAllRemotePacks = function (priorityLevelId, options) {
  if (!this._remoteLoader || typeof this._remoteLoader.preloadAllPacks !== "function") {
    throw new Error("Remote level loader missing preloadAllPacks.");
  }
  return this._remoteLoader.preloadAllPacks(priorityLevelId, options);
};

LevelManager.prototype.loadAvailableLevelIds = function () {
  if (!this._remoteLoader || typeof this._remoteLoader.loadAvailableLevelIds !== "function") {
    throw new Error("Remote level loader missing loadAvailableLevelIds.");
  }
  return this._remoteLoader.loadAvailableLevelIds();
};

LevelManager.prototype.createRandomChallengeRun = function (options) {
  if (!this._randomChallengeManager || typeof this._randomChallengeManager.buildRun !== "function") {
    throw new Error("Random challenge manager missing buildRun.");
  }
  return this._randomChallengeManager.buildRun(options);
};

module.exports = LevelManager;
