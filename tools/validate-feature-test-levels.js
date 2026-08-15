"use strict";

var fs = require("fs");
var path = require("path");

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelManager = require("../assets/scripts/config/LevelManager");

var ROOT = path.resolve(__dirname, "..");
var DEFINITIONS = [
  {
    featureKey: "black_hole",
    levelKey: "level_black_hole_test",
    entityCategory: "hazard_ball",
    entityType: "black_hole"
  },
  {
    featureKey: "spirit_cocoon",
    levelKey: "level_spirit_cocoon_test",
    entityCategory: "reactive_ball",
    entityType: "spirit_cocoon"
  },
  {
    featureKey: "multi_trapped_spirit",
    levelKey: "level_multi_trapped_spirit_test",
    levelType: "multi_trapped_spirit_rescue"
  },
  {
    featureKey: "transparent_ball",
    levelKey: "level_transparent_ball_test",
    entityCategory: "reactive_ball",
    entityType: "transparent_ball"
  },
  {
    featureKey: "breeder_ball",
    levelKey: "level_breeder_ball_test",
    entityCategory: "reactive_ball",
    entityType: "breeder"
  }
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateConfigs() {
  DEFINITIONS.forEach(function (definition) {
    var relativePath = "assets/map/config/levels/" + definition.levelKey + ".json";
    var configPath = path.join(ROOT, relativePath);
    assert(fs.existsSync(configPath), "Feature test config is missing: " + relativePath + ".");
    assert(fs.existsSync(configPath + ".meta"), "Feature test config meta is missing: " + relativePath + ".meta.");
    var normalized = LevelConfigLoader.normalizeLevelConfig(readJson(configPath), definition.levelKey);
    if (definition.levelType) {
      assert(normalized.level.levelType === definition.levelType, definition.levelKey + " levelType mismatch.");
      assert(normalized.level.specialEntities.length === 0, definition.levelKey + " must isolate multi-target rescue.");
      assert(normalized.level.multiTrappedSpiritRescue.targets.length >= 2, definition.levelKey + " requires multiple rescue targets.");
      return;
    }
    assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
    assert(normalized.level.specialEntities.length === 1, definition.levelKey + " must contain exactly one special entity.");
    var entity = normalized.level.specialEntities[0];
    assert(entity.entityCategory === definition.entityCategory, definition.levelKey + " entityCategory mismatch.");
    assert(entity.entityType === definition.entityType, definition.levelKey + " entityType mismatch.");
  });

  var legacyTest = LevelConfigLoader.normalizeLevelConfig(
    readJson(path.join(ROOT, "assets/map/config/levels/level_test.json")),
    "level_test"
  );
  var dedicatedTypes = {
    black_hole: true,
    spirit_cocoon: true,
    transparent_ball: true,
    breeder: true
  };
  assert(
    legacyTest.level.specialEntities.every(function (entity) {
      return dedicatedTypes[entity.entityType] !== true;
    }),
    "level_test must not duplicate dedicated feature test entities."
  );
}

function validateEntryWiring() {
  var loadedKeys = [];
  var manager = new LevelManager({
    localLoader: {
      loadLevelByKey: function (levelKey) {
        loadedKeys.push(levelKey);
        return Promise.resolve(readJson(path.join(ROOT, "assets/map/config/levels/" + levelKey + ".json")));
      }
    },
    remoteLoader: {},
    randomChallengeManager: {}
  });
  return Promise.all(DEFINITIONS.map(function (definition) {
    return manager.loadFeatureTestLevel(definition.featureKey);
  })).then(function () {
    assert(
      loadedKeys.join("|") === DEFINITIONS.map(function (definition) {
        return definition.levelKey;
      }).join("|"),
      "LevelManager feature test key mapping mismatch."
    );
    var rejectedUnknownKey = false;
    try {
      manager.loadFeatureTestLevel("unknown_feature");
    } catch (error) {
      rejectedUnknownKey = error.message.indexOf("Unsupported feature test level key") >= 0;
    }
    assert(rejectedUnknownKey, "LevelManager must reject unknown feature test keys.");
  });
}

function validateHiddenButtons() {
  var levelSelectSource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/LevelSelectView.js"),
    "utf8"
  );
  [
    'key: "black_hole", nodeName: "black_hole_test_btn", label: "黑洞"',
    'key: "spirit_cocoon", nodeName: "spirit_cocoon_test_btn", label: "精灵茧"',
    'key: "multi_trapped_spirit", nodeName: "multi_trapped_spirit_test_btn", label: "多救援"',
    'key: "transparent_ball", nodeName: "transparent_ball_test_btn", label: "透明球"',
    'key: "breeder_ball", nodeName: "breeder_ball_test_btn", label: "繁殖球"'
  ].forEach(function (contract) {
    assert(levelSelectSource.indexOf(contract) >= 0, "Hidden feature test button contract is missing: " + contract + ".");
  });
  var flowSource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js"),
    "utf8"
  );
  assert(flowSource.indexOf("_startFeatureTestLevelEntry: function (featureKey)") >= 0, "Feature test start entry is missing.");
  assert(flowSource.indexOf("loadFeatureTestLevel(featureKey)") >= 0, "Feature test entry must load the selected dedicated config.");
  var retrySource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapLevelRuntimeMethods.js"),
    "utf8"
  );
  assert(retrySource.indexOf("this._startFeatureTestLevelEntry(this._currentRunContext.testSource)") >= 0, "Feature test retry wiring is missing.");
}

validateConfigs();
validateHiddenButtons();
validateEntryWiring().then(function () {
  console.log("[OK] feature_test_levels", "five isolated configs, hidden entries and retry wiring validated");
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
