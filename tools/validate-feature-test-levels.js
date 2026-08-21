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
  },
  {
    featureKey: "mine",
    levelKey: "level_mine_test",
    entityCategory: "hazard_ball",
    entityType: "mine"
  },
  {
    featureKey: "bud",
    levelKey: "level_bud_test",
    entityCategory: "reactive_ball",
    entityType: "bud"
  },
  {
    featureKey: "crystal_gun",
    levelKey: "level_crystal_gun_test",
    entityCategory: "skill_ball",
    entityType: "crystal_gun"
  },
  {
    featureKey: "rainbow_prism_ball",
    levelKey: "level_rainbow_prism_ball_test",
    entityCategory: "obstacle_ball",
    entityType: "stone",
    testPowerupType: "rainbow_prism_ball"
  },
  {
    featureKey: "poison_attachment",
    levelKey: "level_poison_attachment_test",
    attachmentType: "poison",
    attachmentCount: 6,
    attachmentRow: 7,
    attachmentStartCol: 2,
    attachmentParticleCount: 3
  },
  {
    featureKey: "ice_crystal_attachment",
    levelKey: "level_ice_crystal_attachment_test",
    attachmentType: "ice_crystal",
    attachmentCount: 10,
    attachmentRow: 7,
    attachmentStartCol: 0
  },
  {
    featureKey: "bubble_shield_attachment",
    levelKey: "level_bubble_shield_attachment_test",
    attachmentType: "bubble_shield",
    attachmentCount: 4,
    attachmentRow: 7,
    attachmentStartCol: 3
  },
  {
    featureKey: "lock_chain",
    levelKey: "level_lock_chain_test",
    lockChainRows: [2, 6]
  },
  {
    featureKey: "color_cloud",
    levelKey: "level_color_cloud_test",
    colorCloudCount: 4
  },
  {
    featureKey: "spider",
    levelKey: "level_spider_test",
    spiderRows: [2, 7],
    spiderCount: 3
  },
  {
    featureKey: "wind_tunnel",
    levelKey: "level_wind_tunnel_test",
    windTunnelExitCount: 3
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
    if (definition.attachmentType) {
      assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
      assert(normalized.level.specialEntities.length === 0, definition.levelKey + " must isolate cell attachments.");
      assert(normalized.level.cellAttachments.length === definition.attachmentCount, definition.levelKey + " attachment count mismatch.");
      assert(normalized.level.layout[8] === "...........", definition.levelKey + " must reserve a shootable row below the attachments.");
      normalized.level.cellAttachments.forEach(function (attachment, index) {
        assert(attachment.type === definition.attachmentType, definition.levelKey + " attachment type mismatch at " + index + ".");
        assert(
          attachment.row === definition.attachmentRow &&
          attachment.col === definition.attachmentStartCol + index,
          definition.levelKey + " attachments must cover the authored lowest-row range."
        );
        if (definition.attachmentParticleCount !== undefined) {
          assert(
            attachment.particleCount === definition.attachmentParticleCount,
            definition.levelKey + " attachment particleCount mismatch at " + index + "."
          );
        }
      });
      return;
    }
    if (definition.lockChainRows) {
      assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
      definition.lockChainRows.forEach(function (row) {
        var rowEntities = normalized.level.specialEntities.filter(function (entity) {
          return entity.row === row;
        });
        var keys = rowEntities.filter(function (entity) {
          return entity.entityCategory === "key_ball" && entity.entityType === "key";
        });
        var locks = rowEntities.filter(function (entity) {
          return entity.entityCategory === "locked_ball" && entity.entityType === "locked";
        });
        assert(keys.length === 1, definition.levelKey + " row " + row + " must contain one key.");
        assert(locks.length === normalized.level.layout[row].length - 1, definition.levelKey + " row " + row + " must lock every other slot.");
        assert(rowEntities.length === normalized.level.layout[row].length, definition.levelKey + " row " + row + " must contain only its key and locks.");
        assert(normalized.level.layout[row].replace(/\./g, "").length === 0, definition.levelKey + " row " + row + " must reserve all chain slots.");
      });
      return;
    }
    if (definition.colorCloudCount) {
      assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
      assert(normalized.level.specialEntities.length === 0, definition.levelKey + " must isolate color clouds.");
      assert(normalized.level.colorClouds.length === definition.colorCloudCount, definition.levelKey + " color cloud count mismatch.");
      assert(normalized.level.colorClouds.filter(function (cloud) { return cloud.visible; }).length === 3, definition.levelKey + " must expose exactly three visible color clouds.");
      assert(normalized.level.colorClouds.some(function (cloud) { return cloud.color === "RAINBOW"; }), definition.levelKey + " must contain a rainbow cloud.");
      assert(normalized.level.colorClouds.some(function (cloud) { return cloud.visible === false; }), definition.levelKey + " must contain one hidden group.");
      return;
    }
    if (definition.spiderRows) {
      assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
      assert(normalized.level.specialEntities.length === 0, definition.levelKey + " must isolate spider rows.");
      assert(normalized.level.spiderRows.length === definition.spiderCount, definition.levelKey + " spider count mismatch.");
      assert(normalized.level.layout[8] === "...........", definition.levelKey + " must reserve a shootable row below the lower web.");
      definition.spiderRows.forEach(function (row) {
        assert(normalized.level.spiderRows.some(function (spider) {
          return spider.row === row;
        }), definition.levelKey + " missing spider row " + row + ".");
      });
      assert(normalized.level.spiderRows.filter(function (spider) {
        return spider.lockRowId === "lower_spider_row";
      }).length === 2, definition.levelKey + " lower row must contain two spiders.");
      return;
    }
    if (definition.windTunnelExitCount) {
      var entrances = normalized.level.specialEntities.filter(function (entity) {
        return entity.entityCategory === "reactive_ball" && entity.entityType === "wind_tunnel_entrance";
      });
      var exits = normalized.level.specialEntities.filter(function (entity) {
        return entity.entityCategory === "reactive_ball" && entity.entityType === "wind_tunnel_exit";
      });
      assert(entrances.length === 1, definition.levelKey + " must contain exactly one wind tunnel entrance.");
      assert(exits.length === definition.windTunnelExitCount, definition.levelKey + " wind tunnel exit count mismatch.");
      assert(entrances[0].row === 8 && entrances[0].col === 5, definition.levelKey + " entrance must remain on the exposed central test slot.");
      return;
    }
    assert(normalized.level.levelType === "normal", definition.levelKey + " must use a normal board.");
    assert(normalized.level.specialEntities.length === 1, definition.levelKey + " must contain exactly one special entity.");
    var entity = normalized.level.specialEntities[0];
    assert(entity.entityCategory === definition.entityCategory, definition.levelKey + " entityCategory mismatch.");
    assert(entity.entityType === definition.entityType, definition.levelKey + " entityType mismatch.");
    if (definition.featureKey === "crystal_gun") {
      assert(normalized.level.layout.length === 10, definition.levelKey + " must expose exactly ten test rows.");
      assert(entity.row === 9 && entity.col === 4, definition.levelKey + " crystal gun collection target must remain at row 9 column 4.");
      var crystalGunEmptySlots = [];
      normalized.level.layout.forEach(function (rowText, row) {
        for (var col = 0; col < rowText.length; col += 1) {
          if (rowText.charAt(col) === ".") {
            crystalGunEmptySlots.push(row + ":" + col);
          }
        }
      });
      assert(crystalGunEmptySlots.join("|") === "9:4", definition.levelKey + " must reserve only the crystal gun special slot.");
      assert(normalized.level.layout[9].charAt(0) !== ".", definition.levelKey + " must expose the left-side physical-ray exit target.");
      assert(normalized.level.layout[9].charAt(9) !== ".", definition.levelKey + " must expose the right-side physical-ray exit target.");
    }
    if (definition.testPowerupType) {
      assert(normalized.level.layout.length === 14, definition.levelKey + " must expose a fourteen-row visibility test board.");
      assert(entity.row === 13, definition.levelKey + " non-ordinary contact target must be exposed on the bottom row.");
      var hiddenColorCodes = normalized.level.layout.slice(0, 3).join("").replace(/\./g, "");
      var visibleColorCodes = normalized.level.layout.slice(4).join("").replace(/\./g, "");
      ["R", "G", "B", "Y"].forEach(function (color) {
        assert(hiddenColorCodes.indexOf(color) >= 0, definition.levelKey + " hidden rows must contain color " + color + ".");
        assert(visibleColorCodes.indexOf(color) >= 0, definition.levelKey + " visible rows must contain color " + color + ".");
      });
    }
  });

  var legacyTest = LevelConfigLoader.normalizeLevelConfig(
    readJson(path.join(ROOT, "assets/map/config/levels/level_test.json")),
    "level_test"
  );
  var dedicatedTypes = {
    black_hole: true,
    spirit_cocoon: true,
    transparent_ball: true,
    breeder: true,
    mine: true,
    bud: true
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
    'key: "breeder_ball", nodeName: "breeder_ball_test_btn", label: "繁殖球"',
    'key: "mine", nodeName: "mine_test_btn", label: "地雷"',
    'key: "bud", nodeName: "bud_test_btn", label: "花苞球"',
    'key: "crystal_gun", nodeName: "crystal_gun_test_btn", label: "晶光炮"',
    'key: "rainbow_prism_ball", nodeName: "rainbow_prism_ball_test_btn", label: "棱镜球"',
    'key: "poison_attachment", nodeName: "poison_attachment_test_btn", label: "毒液"',
    'key: "ice_crystal_attachment", nodeName: "ice_crystal_attachment_test_btn", label: "冰凌"',
    'key: "bubble_shield_attachment", nodeName: "bubble_shield_attachment_test_btn", label: "护盾"',
    'key: "lock_chain", nodeName: "lock_chain_test_btn", label: "锁定球"',
    'key: "color_cloud", nodeName: "color_cloud_test_btn", label: "彩云"',
    'key: "spider", nodeName: "spider_test_btn", label: "蜘蛛"',
    'key: "wind_tunnel", nodeName: "wind_tunnel_test_btn", label: "风眼"'
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
  assert(retrySource.indexOf('this._currentRunContext.testSource === "crystal_gun"') >= 0, "Crystal gun test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "poison_attachment"') >= 0, "Poison attachment test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "ice_crystal_attachment"') >= 0, "Ice crystal attachment test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "bubble_shield_attachment"') >= 0, "Bubble shield attachment test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "mine"') >= 0, "Mine test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "lock_chain"') >= 0, "Lock chain test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "color_cloud"') >= 0, "Color cloud test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "spider"') >= 0, "Spider test retry source is missing.");
  assert(retrySource.indexOf('this._currentRunContext.testSource === "wind_tunnel"') >= 0, "Wind tunnel test retry source is missing.");
  var routeSource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapRouteEditorFlowMethods.js"),
    "utf8"
  );
  assert(routeSource.indexOf('normalizedEntryOptions.testSource === "rainbow_prism_ball"') >= 0, "Rainbow prism test source routing is missing.");
  assert(routeSource.indexOf('grantPowerupInventory("rainbow_prism_ball", 6)') >= 0, "Rainbow prism test entry must grant six prism balls.");
  assert(routeSource.indexOf('normalizedEntryOptions.testSource === "crystal_gun"') >= 0, "Crystal gun test source routing is missing.");
  assert(routeSource.indexOf('grantPowerupInventory("crystal_gun", 6)') >= 0, "Crystal gun test entry must grant six crystal guns.");
  assert(routeSource.indexOf('normalizedEntryOptions.testSource === "bubble_shield_attachment"') >= 0, "Bubble shield test source routing is missing.");
  assert(routeSource.indexOf('grantPowerupInventory("blast", 6)') >= 0, "Bubble shield test entry must grant six blast balls.");
  assert(routeSource.indexOf('options.testSource !== "poison_attachment"') >= 0, "Poison attachment test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "ice_crystal_attachment"') >= 0, "Ice crystal attachment test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "bubble_shield_attachment"') >= 0, "Bubble shield attachment test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "mine"') >= 0, "Mine test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "lock_chain"') >= 0, "Lock chain test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "color_cloud"') >= 0, "Color cloud test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "spider"') >= 0, "Spider test source routing is missing.");
  assert(routeSource.indexOf('options.testSource !== "wind_tunnel"') >= 0, "Wind tunnel test source routing is missing.");
  assert(routeSource.indexOf('normalizedEntryOptions.testSource === "spider"') >= 0, "Spider test inventory grant source is missing.");
}

validateConfigs();
validateHiddenButtons();
validateEntryWiring().then(function () {
  console.log("[OK] feature_test_levels", "sixteen isolated configs, hidden entries, test inventory grants and retry wiring validated");
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
