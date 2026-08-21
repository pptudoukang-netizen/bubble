"use strict";

var fs = require("fs");
var path = require("path");
var readGameplaySourceFamily = require("./read-gameplay-source-family").readGameplaySourceFamily;

global.cc = {
  macro: {
    REPEAT_FOREVER: -1
  },
  size: function (width, height) {
    return { width: width, height: height };
  },
  log: function () {},
  warn: function () {},
  error: function () {}
};

var ROOT = path.resolve(__dirname, "..");
var LEVEL_PATH = path.join(
  ROOT,
  "assets",
  "map",
  "config",
  "levels",
  "level_trapped_sprite_test.json"
);
var MULTI_TARGET_LEVEL_PATH = path.join(
  ROOT,
  "assets",
  "map",
  "config",
  "levels",
  "level_multi_trapped_spirit_test.json"
);
var LEVEL_63_PACK_PATH = path.join(
  ROOT,
  "remote-level-packs",
  "levels_pack_011_100.json"
);
var FLOATING_MAP_PATH = path.join(ROOT, "assets", "map", "config", "floating_map.json");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelBoardSupportValidator = require("../assets/scripts/config/LevelBoardSupportValidator");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");
var AssistSpiritConfig = require("../assets/scripts/config/AssistSpiritConfig");
var AssistSpiritRescueConfig = require("../assets/scripts/config/AssistSpiritRescueConfig");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var uiFlowSharedPath = require.resolve("../assets/scripts/bootstrap/GameBootstrapUiFlowShared");
require.cache[uiFlowSharedPath] = {
  id: uiFlowSharedPath,
  filename: uiFlowSharedPath,
  loaded: true,
  exports: {
    DebugFlags: {},
    Logger: {
      info: function () {}
    },
    BundleLoader: {},
    LevelSelectPolicy: {},
    LevelSelectView: {},
    StarRatingPolicy: {},
    hideGameCircleWelfareViewNode: function () {}
  }
};
var bootstrapSharedPath = require.resolve("../assets/scripts/bootstrap/GameBootstrapShared");
require.cache[bootstrapSharedPath] = {
  id: bootstrapSharedPath,
  filename: bootstrapSharedPath,
  loaded: true,
  exports: {}
};
var floatingMapPath = require.resolve("../assets/scripts/bootstrap/LevelSelectFloatingMap");
require.cache[floatingMapPath] = {
  id: floatingMapPath,
  filename: floatingMapPath,
  loaded: true,
  exports: {}
};
var mapEditorLevelPickerPath = require.resolve("../assets/scripts/editor/MapEditorLevelPicker");
require.cache[mapEditorLevelPickerPath] = {
  id: mapEditorLevelPickerPath,
  filename: mapEditorLevelPickerPath,
  loaded: true,
  exports: {}
};
var GameBootstrapLevelSelectFlowMethods = require("../assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods");
var GameManager = require("../gameplay-src/core/GameManager");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var TrappedSpriteRescueSystem = require("../gameplay-src/systems/TrappedSpriteRescueSystem");
var selectorResourceConfigPath = require.resolve("../gameplay-src/render/LevelRendererResourceConfig");
require.cache[selectorResourceConfigPath] = {
  id: selectorResourceConfigPath,
  filename: selectorResourceConfigPath,
  loaded: true,
  exports: {
    BALL_RESOURCES: {},
    BoardLayout: BoardLayout,
    COMMENT_ANIMATION_TIERS: [],
    ROUTE_EDITOR_COLORS: [],
    SHOOTER_MAX_ROTATION: 0,
    StarRatingPolicy: {},
    buildTrappedSpriteResourcePath: TrappedSpriteRescueSystem.buildSpriteResourcePath
  }
};
var LevelRendererStateSelectors = require("../gameplay-src/render/LevelRendererStateSelectors");
var attachLevelRendererSceneObjectiveHudMethods = require("../gameplay-src/render/LevelRendererSceneObjectiveHudMethods");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nearlyEqual(left, right, epsilon) {
  return Math.abs(left - right) <= epsilon;
}

function cellKey(row, col) {
  return row + ":" + col;
}

function getHexNeighbors(row, col) {
  var offsets = row % 2 === 1 ? [
    [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]
  ] : [
    [-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]
  ];
  return offsets.map(function (offset) {
    return { row: row + offset[0], col: col + offset[1] };
  });
}

function getClockwiseHexNeighbors(row, col) {
  var offsets = row % 2 === 1 ? [
    [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [0, -1]
  ] : [
    [-1, -1], [-1, 0], [0, 1], [1, 0], [1, -1], [0, -1]
  ];
  return offsets.map(function (offset) {
    return { row: row + offset[0], col: col + offset[1] };
  });
}

function getOddRHexDistance(left, right) {
  var leftQ = left.col - (left.row - (left.row & 1)) / 2;
  var rightQ = right.col - (right.row - (right.row & 1)) / 2;
  return Math.max(
    Math.abs(leftQ - rightQ),
    Math.abs(left.row - right.row),
    Math.abs((-leftQ - left.row) - (-rightQ - right.row))
  );
}

function getMaximumCyclicRun(colors) {
  var hasBreak = colors.some(function (color) { return color === null; });
  var maxRun = 0;
  var run = 0;
  var previous = null;
  var iterationCount = hasBreak ? colors.length : colors.length * 2;
  var startIndex = hasBreak ? (colors.indexOf(null) + 1) % colors.length : 0;
  for (var index = 0; index < iterationCount; index += 1) {
    var color = colors[(startIndex + index) % colors.length];
    if (color === null) {
      previous = null;
      run = 0;
    } else if (color === previous) {
      run += 1;
    } else {
      previous = color;
      run = 1;
    }
    maxRun = Math.max(maxRun, Math.min(run, colors.length));
  }
  return maxRun;
}

function validateGeneratedRescueBoardDesign(level, levelId) {
  var anchor = level.trappedSpriteRescue.anchorCell;
  assert(
    anchor.row === CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_ANCHOR_ROW,
    "Remote rescue anchor row mismatch: " + levelId
  );
  assert(
    anchor.col === Math.floor(BoardLayout.getRowColumnCount(anchor.row, BoardLayout.defaultColumns) / 2),
    "Remote rescue anchor column mismatch: " + levelId
  );
  var occupied = {};
  var colors = {};
  level.layout.forEach(function (rowString, row) {
    rowString.split("").forEach(function (cellCode, col) {
      if (cellCode !== ".") {
        occupied[cellKey(row, col)] = true;
        colors[cellKey(row, col)] = cellCode;
      }
    });
  });
  level.specialEntities.forEach(function (entity) {
    var key = cellKey(entity.row, entity.col);
    assert(!occupied[key], "Remote rescue special entity overlaps a normal ball: " + levelId + " at " + key);
    occupied[key] = true;
  });
  var expected = {};
  level.layout.forEach(function (rowString, row) {
    for (var col = 0; col < rowString.length; col += 1) {
      var distance = getOddRHexDistance(anchor, { row: row, col: col });
      if (distance >= 1 && distance <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_HEX_RADIUS) {
        expected[cellKey(row, col)] = true;
      }
    }
  });
  assert(
    Object.keys(expected).length === CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_OCCUPIED_CELL_COUNT,
    "Remote rescue expected hex is clipped: " + levelId
  );
  assert(
    Object.keys(occupied).sort().join(",") === Object.keys(expected).sort().join(","),
    "Remote rescue board must be a complete radius-five regular hex: " + levelId
  );

  var visited = {};
  var largestComponent = 0;
  Object.keys(colors).forEach(function (startKey) {
    if (visited[startKey]) {
      return;
    }
    var color = colors[startKey];
    var queue = [startKey];
    visited[startKey] = true;
    var componentSize = 0;
    while (queue.length > 0) {
      var currentKey = queue.shift();
      var coordinates = currentKey.split(":").map(Number);
      componentSize += 1;
      getHexNeighbors(coordinates[0], coordinates[1]).forEach(function (neighbor) {
        var neighborKey = cellKey(neighbor.row, neighbor.col);
        if (!visited[neighborKey] && colors[neighborKey] === color) {
          visited[neighborKey] = true;
          queue.push(neighborKey);
        }
      });
    }
    largestComponent = Math.max(largestComponent, componentSize);
  });
  assert(
    largestComponent <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT,
    "Remote rescue same-color component exceeds " +
      CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_SAME_COLOR_COMPONENT +
      ": " + levelId + " got " + largestComponent
  );
  var anchorNeighborRun = getMaximumCyclicRun(
    getClockwiseHexNeighbors(anchor.row, anchor.col).map(function (neighbor) {
      return colors[cellKey(neighbor.row, neighbor.col)] || null;
    })
  );
  assert(
    anchorNeighborRun <= CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_MAX_ANCHOR_NEIGHBOR_RUN,
    "Remote rescue anchor-neighbor same-color run exceeds two: " + levelId + " got " + anchorNeighborRun
  );
}

function expectThrow(action, expectedText) {
  var error = null;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  assert(error, "Expected validation failure containing: " + expectedText);
  assert(
    String(error.message).indexOf(expectedText) !== -1,
    "Unexpected validation failure: " + error.message
  );
}

function loadConfig() {
  var raw = JSON.parse(fs.readFileSync(LEVEL_PATH, "utf8"));
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_trapped_sprite_test");
}

function loadMultiTargetConfig() {
  var raw = JSON.parse(fs.readFileSync(MULTI_TARGET_LEVEL_PATH, "utf8"));
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_multi_trapped_spirit_test");
}

function validateMultiTargetConfigContract(config) {
  var level = config.level;
  assert(level.levelType === "multi_trapped_spirit_rescue", "Multi rescue test level type mismatch.");
  assert(level.playMode === "shot_limited", "Multi rescue test must use shot_limited.");
  assert(level.multiTrappedSpiritRescue.targets.length === 2, "Multi rescue test must configure two targets.");
  level.multiTrappedSpiritRescue.targets.forEach(function (target) {
    assert(target.row > 0, "Multi rescue target must not occupy the top row.");
    assert(level.layout[target.row].charAt(target.col) === ".", "Multi rescue target cell must remain empty.");
    assert(
      getHexNeighbors(target.row, target.col).some(function (neighbor) {
        return neighbor.row >= 0 &&
          neighbor.row < level.layout.length &&
          neighbor.col >= 0 &&
          neighbor.col < level.layout[neighbor.row].length &&
          level.layout[neighbor.row].charAt(neighbor.col) !== ".";
      }),
      "Multi rescue target must have adjacent eliminable support."
    );
  });

  var raw = JSON.parse(fs.readFileSync(MULTI_TARGET_LEVEL_PATH, "utf8"));
  var oneTarget = clone(raw);
  oneTarget.level.multiTrappedSpiritRescue.targets.pop();
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(oneTarget, "level_multi_trapped_spirit_test");
  }, "at least two targets");

  var topTarget = clone(raw);
  topTarget.level.multiTrappedSpiritRescue.targets[0].row = 0;
  topTarget.level.multiTrappedSpiritRescue.targets[0].col = 0;
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(topTarget, "level_multi_trapped_spirit_test");
  }, "non-top-row board coordinate");

  var unsupportedTarget = clone(raw);
  var target = unsupportedTarget.level.multiTrappedSpiritRescue.targets[0];
  getHexNeighbors(target.row, target.col).forEach(function (neighbor) {
    if (
      neighbor.row >= 0 &&
      neighbor.row < unsupportedTarget.level.layout.length &&
      neighbor.col >= 0 &&
      neighbor.col < unsupportedTarget.level.layout[neighbor.row].length
    ) {
      var chars = unsupportedTarget.level.layout[neighbor.row].split("");
      chars[neighbor.col] = ".";
      unsupportedTarget.level.layout[neighbor.row] = chars.join("");
    }
  });
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(unsupportedTarget, "level_multi_trapped_spirit_test");
  }, "adjacent eliminable normal support");
}

function validateMultiTargetRuntime(config) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY;
  var manager = createGameManager(config);
  var rescueSystem = manager.systems.trappedSpriteRescueSystem;
  var grid = manager.systems.bubbleGrid;
  assert(!rescueSystem.isActive(), "Multi rescue must not activate rotating rescue mode.");
  assert(rescueSystem.isMultiTargetActive(), "Multi rescue runtime mode must be active.");
  assert(!grid.isTrappedSpriteRescueActive(), "Multi rescue must keep ordinary board geometry.");
  assert(grid.isTrappedSpiritReservedCell(3, 4), "First multi rescue target cell must be reserved.");
  var initialHudDisplay = LevelRendererStateSelectors.buildHudTargetDisplayData(config, {
    systems: {
      trappedSpriteRescueSystem: rescueSystem.snapshotForRender()
    }
  });
  assert(initialHudDisplay.spirits.length === 2, "Multi rescue HUD must expose two spirit target cards.");
  assert(
    initialHudDisplay.spirits[0].targetId === "multi_trapped_spirit_1" &&
      initialHudDisplay.spirits[0].spiritId === "milu" &&
      initialHudDisplay.spirits[0].remaining === 1 &&
      initialHudDisplay.spirits[1].targetId === "multi_trapped_spirit_2" &&
      initialHudDisplay.spirits[1].spiritId === "lumi" &&
      initialHudDisplay.spirits[1].remaining === 1,
    "Multi rescue HUD initial spirit targets mismatch."
  );
  function ObjectiveHudRendererHarness() {}
  attachLevelRendererSceneObjectiveHudMethods(ObjectiveHudRendererHarness, {});
  var hudTargetEntries = new ObjectiveHudRendererHarness()._buildHudTargetEntries(initialHudDisplay);
  assert(
    hudTargetEntries.length === 2 &&
      hudTargetEntries[0].cardName === "hud_target_spirit_multi_trapped_spirit_1" &&
      hudTargetEntries[1].cardName === "hud_target_spirit_multi_trapped_spirit_2",
    "Multi rescue HUD renderer must create one distinct card entry per spirit target."
  );
  expectThrow(function () {
    grid.addBubble({ row: 3, col: 4 }, "R");
  }, "trapped spirit reserved cell");

  manager.systems.matchSystem.findMatchGroup = function () {
    return [];
  };
  manager.systems.boardViewportSystem.offsetY = 58;
  manager.systems.boardViewportSystem.targetOffsetY = 58;
  var firstTrigger = grid.getCell(3, 3);
  assert(firstTrigger, "Multi rescue first trigger fixture cell is missing.");
  var firstResolution = manager._resolveAttachment(firstTrigger, {
    ballCategory: "normal",
    color: firstTrigger.color,
    entityCategory: "normal_ball",
    entityType: null
  });
  assert(firstResolution.matched.length === 0, "Adjacent no-match rescue must not fabricate a match.");
  assert(firstResolution.rescuedTrappedSpirits.length === 1, "Adjacent no-match landing must rescue one target.");
  assert(firstResolution.scoreDelta === 1000 && manager.score === 1000, "First rescued target must award exactly 1000 points.");
  assert(firstResolution.comboRegistered === true, "Adjacent no-match rescue must count as an effective elimination.");
  assert(manager.systems.boardViewportSystem.getOffsetY() === 58, "Non-final rescue must preserve ordinary board offset.");
  var firstRescueHudDisplay = LevelRendererStateSelectors.buildHudTargetDisplayData(config, {
    systems: {
      trappedSpriteRescueSystem: rescueSystem.snapshotForRender()
    }
  });
  assert(
    firstRescueHudDisplay.spirits.length === 2 &&
      firstRescueHudDisplay.spirits[0].remaining === 0 &&
      firstRescueHudDisplay.spirits[1].remaining === 1,
    "Multi rescue HUD must complete only the rescued spirit card."
  );
  var firstEvents = manager._drainRuntimeEvents().filter(function (event) {
    return event.type === "trapped_spirit_target_rescued";
  });
  assert(firstEvents.length === 1 && firstEvents[0].finalTarget === false, "First target rescue event mismatch.");

  var secondTrigger = grid.getCell(5, 4);
  assert(secondTrigger, "Multi rescue second trigger fixture cell is missing.");
  var secondResolution = manager._resolveAttachment(secondTrigger, {
    ballCategory: "normal",
    color: secondTrigger.color,
    entityCategory: "normal_ball",
    entityType: null
  });
  assert(secondResolution.rescuedTrappedSpirits.length === 1, "Second adjacent landing must rescue the final target.");
  assert(secondResolution.multiTrappedSpiritRescueCompleted === true, "Final rescue must mark multi-target completion.");
  assert(secondResolution.boardCleared === true && grid.getCells().length === 0, "Final rescue must clear the remaining board.");
  var secondRescueScore = secondResolution.scoreEvents.filter(function (event) {
    return event.scoreKind === "trapped_spirit_rescue";
  }).reduce(function (sum, event) {
    return sum + event.points;
  }, 0);
  assert(secondRescueScore === 1000, "Final rescued target must add exactly 1000 rescue points.");
  assert(manager.score >= 2000, "Two rescued targets must contribute at least 2000 total points before combo bonuses.");
  assert(manager.systems.boardViewportSystem.getOffsetY() === 0, "Final rescue must reset the map to zero offset.");
  assert(manager.systems.fallingMarbleSystem.hasActiveDrops(), "Final rescue must register remaining balls as victory drops.");
  assert(manager.state === "won_pending", "Final rescue must enter pending victory state while drops settle.");
  var completedHudDisplay = LevelRendererStateSelectors.buildHudTargetDisplayData(config, {
    systems: {
      trappedSpriteRescueSystem: rescueSystem.snapshotForRender()
    }
  });
  assert(
    completedHudDisplay.spirits.length === 2 &&
      completedHudDisplay.spirits[0].remaining === 0 &&
      completedHudDisplay.spirits[1].remaining === 0,
    "Multi rescue HUD must retain both completed spirit cards."
  );
  var finalEvents = manager._drainRuntimeEvents().filter(function (event) {
    return event.type === "trapped_spirit_target_rescued";
  });
  assert(finalEvents.length === 1 && finalEvents[0].finalTarget === true, "Final target rescue event mismatch.");
}

function validateMultiTargetWiring() {
  var rendererSource = readGameplaySourceFamily(ROOT, "gameplay-src/render", "LevelRenderer");
  [
    "_renderMultiTrappedSpiritRescue",
    "_playMultiTrappedSpiritDepartures",
    "trapped_spirit_target_rescued",
    "multiTrappedSpiritDepartingTargetIds",
    "spiritDisplays = multiRescue.targets.map",
    "buildHudSpiritCardName",
    "game/trapped_spirit/"
  ].forEach(function (requiredToken) {
    assert(rendererSource.indexOf(requiredToken) !== -1, "Multi rescue renderer token is missing: " + requiredToken);
  });
}

function loadLevel63Config() {
  var compactPack = JSON.parse(fs.readFileSync(LEVEL_63_PACK_PATH, "utf8"));
  var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
  var config = expandedPack.levels.level_063;
  if (!config || !config.level || config.level.levelId !== 63) {
    throw new Error("Remote level pack must contain rescue level 63.");
  }
  return LevelConfigLoader.normalizeLevelConfig(config, "level_063");
}

function createPlainRescueConfig(config) {
  var plain = clone(config);
  plain.level.specialEntities = [];
  return LevelConfigLoader.normalizeLevelConfig(plain, "level_trapped_sprite_test");
}

function syncFairyCenters(gameManager) {
  gameManager.systems.fairyAssistSystem.syncCollisionCenters(
    [0, 1, 2, 3, 4, 5].map(function (index) {
      return {
        index: index,
        x: (index - 2.5) * 100,
        y: -300
      };
    })
  );
}

function createGameManager(config) {
  var gameManager = new GameManager();
  gameManager.bootstrap();
  gameManager.setEquippedAssistSpirit("milu", 1);
  gameManager.startLevel(config, {
    seed: "trapped-sprite-validator",
    attemptIndex: 1,
    runMode: "test"
  });
  syncFairyCenters(gameManager);
  return gameManager;
}

function runProjectileUntilSettled(gameManager) {
  var stepCount = 0;
  var sawRotationSnapshot = false;
  while (
    (
      gameManager.activeProjectile ||
      gameManager.pendingProjectileFinalize ||
      gameManager.systems.trappedSpriteRescueSystem.isRotating() ||
      gameManager._hasPendingTrappedSpritePostImpactResolution() ||
      gameManager._hasPendingSwirlRotation() ||
      gameManager._hasPendingWormholeShift() ||
      gameManager._hasPendingVineCast()
    ) &&
    stepCount < 1200
  ) {
    var updateSnapshot = gameManager.update(1 / 60);
    if (gameManager.systems.trappedSpriteRescueSystem.isRotating()) {
      assert(updateSnapshot, "Trapped sprite rotation frame must emit a runtime snapshot.");
      assert(updateSnapshot.refreshScope === "full", "Trapped sprite rotation frame must force full refresh.");
      assert(
        !gameManager._hasPendingSwirlRotation() && !gameManager._hasPendingVineCast(),
        "Swirl and vine topology effects must wait until trapped sprite rotation completes."
      );
      sawRotationSnapshot = true;
    }
    stepCount += 1;
  }
  assert(
    stepCount < 1200,
    "Trapped sprite projectile/rotation did not settle: activeProjectile=" + !!gameManager.activeProjectile +
      ", pendingFinalize=" + !!gameManager.pendingProjectileFinalize +
      ", rotating=" + gameManager.systems.trappedSpriteRescueSystem.isRotating() +
      ", trappedPostImpact=" + gameManager._hasPendingTrappedSpritePostImpactResolution() +
      ", swirl=" + gameManager._hasPendingSwirlRotation() +
      ", wormhole=" + gameManager._hasPendingWormholeShift() +
      ", vine=" + gameManager._hasPendingVineCast()
  );
  return sawRotationSnapshot;
}

function validateAssets() {
  var spiritIds = AssistSpiritConfig.getCatalog().map(function (spirit) {
    return spirit.id;
  });
  assert(spiritIds.length === 7, "Trapped sprite rescue requires seven assist spirit identities.");
  var mapSpriteFrameUuids = [];
  spiritIds.forEach(function (spiritId) {
    [
      path.join(ROOT, "assets", "game", "trapped_spirit", spiritId + ".png"),
      path.join(ROOT, "assets", "map", "image", "trapped_spirit", spiritId + ".png"),
      path.join(ROOT, "assets", "ui", "image", "props", spiritId + "_fragments.png"),
      path.join(ROOT, "assets", "ui", "image", "rescue_successful", spiritId + ".png")
    ].forEach(function (pngPath) {
      assert(fs.existsSync(pngPath), "Missing trapped spirit art: " + pngPath);
      assert(fs.existsSync(pngPath + ".meta"), "Missing trapped spirit art meta: " + pngPath + ".meta");
    });
    var mapMetaPath = path.join(
      ROOT,
      "assets",
      "map",
      "image",
      "trapped_spirit",
      spiritId + ".png.meta"
    );
    var mapMeta = JSON.parse(fs.readFileSync(mapMetaPath, "utf8"));
    assert(
      mapMeta.subMetas &&
      mapMeta.subMetas[spiritId] &&
      typeof mapMeta.subMetas[spiritId].uuid === "string" &&
      mapMeta.subMetas[spiritId].uuid.length > 0,
      "Map trapped spirit SpriteFrame meta is invalid: " + spiritId
    );
    mapSpriteFrameUuids.push(mapMeta.subMetas[spiritId].uuid);
  });
  var landmarkPrefabPath = path.join(ROOT, "assets", "map", "prefabs", "landmark1.prefab");
  var landmarkPrefab = JSON.parse(fs.readFileSync(landmarkPrefabPath, "utf8"));
  var spiritNode = landmarkPrefab.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "spirit";
  });
  assert(spiritNode, "landmark1 must contain the spirit node.");
  assert(
    Array.isArray(spiritNode._components) &&
    spiritNode._components.length === 1 &&
    Number.isInteger(spiritNode._components[0].__id__),
    "landmark1 spirit node must contain exactly one serialized component."
  );
  var spiritSprite = landmarkPrefab[spiritNode._components[0].__id__];
  assert(spiritSprite && spiritSprite.__type__ === "cc.Sprite", "landmark1 spirit component must be cc.Sprite.");
  assert(
    spiritSprite._spriteFrame &&
    mapSpriteFrameUuids.indexOf(spiritSprite._spriteFrame.__uuid__) >= 0,
    "landmark1 spirit SpriteFrame must reference one of the seven current map trapped-spirit assets."
  );
  var rescueSfxPath = path.join(ROOT, "assets", "audio", "sound", "cute_laughter.mp3");
  assert(fs.existsSync(rescueSfxPath), "Missing trapped sprite rescue sfx: " + rescueSfxPath);
  assert(fs.existsSync(rescueSfxPath + ".meta"), "Missing trapped sprite rescue sfx meta: " + rescueSfxPath + ".meta");
  var rescuePopupSfxPath = path.join(ROOT, "assets", "audio", "sound", "congratulations.mp3");
  assert(fs.existsSync(rescuePopupSfxPath), "Missing RescueSuccessfulView sfx: " + rescuePopupSfxPath);
  assert(fs.existsSync(rescuePopupSfxPath + ".meta"), "Missing RescueSuccessfulView sfx meta: " + rescuePopupSfxPath + ".meta");
}

function validateRescueSuccessfulPrefab() {
  var prefabPath = path.join(ROOT, "assets", "ui", "prefabs", "RescueSuccessfulView.prefab");
  assert(fs.existsSync(prefabPath), "Missing RescueSuccessfulView prefab.");
  assert(fs.existsSync(prefabPath + ".meta"), "Missing RescueSuccessfulView prefab meta.");
  var prefab = JSON.parse(fs.readFileSync(prefabPath, "utf8"));

  function resolveNode(reference, description) {
    assert(reference && Number.isInteger(reference.__id__), description + " reference is invalid.");
    var node = prefab[reference.__id__];
    assert(node && node.__type__ === "cc.Node", description + " must be a cc.Node.");
    return node;
  }

  function requireChild(parentNode, name, description) {
    var matches = parentNode._children.map(function (reference) {
      return resolveNode(reference, description + "/" + name);
    }).filter(function (node) {
      return node._name === name;
    });
    assert(matches.length === 1, description + " must contain exactly one child named " + name + ".");
    return matches[0];
  }

  function requireComponent(node, componentType, description) {
    var matches = node._components.map(function (reference) {
      assert(reference && Number.isInteger(reference.__id__), description + " component reference is invalid.");
      return prefab[reference.__id__];
    }).filter(function (component) {
      return component && component.__type__ === componentType;
    });
    assert(matches.length === 1, description + " must contain exactly one " + componentType + ".");
    return matches[0];
  }

  var root = resolveNode(prefab[0].data, "RescueSuccessfulView");
  assert(root._name === "RescueSuccessfulView", "RescueSuccessfulView root name mismatch.");
  requireChild(root, "mask", "RescueSuccessfulView");
  var panel = requireChild(root, "Panel", "RescueSuccessfulView");
  var role = requireChild(panel, "role", "RescueSuccessfulView/Panel");
  var closeButton = requireChild(panel, "btn_close", "RescueSuccessfulView/Panel");
  var panelSprite = requireComponent(panel, "cc.Sprite", "RescueSuccessfulView/Panel");
  var roleSprite = requireComponent(role, "cc.Sprite", "RescueSuccessfulView/Panel/role");
  var closeButtonSprite = requireComponent(closeButton, "cc.Sprite", "RescueSuccessfulView/Panel/btn_close");
  requireComponent(closeButton, "cc.Button", "RescueSuccessfulView/Panel/btn_close");

  function readPopupSpriteFrameUuid(assetName) {
    var metaPath = path.join(
      ROOT,
      "assets",
      "ui",
      "image",
      "rescue_successful",
      assetName + ".png.meta"
    );
    var meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    assert(
      meta.subMetas &&
      meta.subMetas[assetName] &&
      typeof meta.subMetas[assetName].uuid === "string" &&
      meta.subMetas[assetName].uuid.length > 0,
      "Rescue successful popup SpriteFrame meta is invalid: " + assetName
    );
    return meta.subMetas[assetName].uuid;
  }

  assert(
    panelSprite._spriteFrame && panelSprite._spriteFrame.__uuid__ === readPopupSpriteFrameUuid("bg"),
    "RescueSuccessfulView Panel must use rescue_successful/bg."
  );
  assert(
    closeButtonSprite._spriteFrame && closeButtonSprite._spriteFrame.__uuid__ === readPopupSpriteFrameUuid("sure_btn"),
    "RescueSuccessfulView close button must use rescue_successful/sure_btn."
  );

  var popupSpiritFrameUuids = AssistSpiritConfig.getCatalog().map(function (spirit) {
    return readPopupSpriteFrameUuid(spirit.id);
  });
  assert(
    popupSpiritFrameUuids.filter(function (uuid, index, values) {
      return values.indexOf(uuid) === index;
    }).length === popupSpiritFrameUuids.length,
    "Rescue successful popup spirit SpriteFrame UUIDs must be unique."
  );
  assert(
    roleSprite._spriteFrame && popupSpiritFrameUuids.indexOf(roleSprite._spriteFrame.__uuid__) >= 0,
    "RescueSuccessfulView role must reference one of the seven popup spirit assets."
  );
}

function validateFirstClearRescueFragmentRewards() {
  assert(
    AssistSpiritRescueConfig.FIRST_CLEAR_FRAGMENT_REWARD_COUNT === 1,
    "First-clear rescue fragment reward count must be configured as one."
  );

  function runCase(initiallyOwned, isFirstCompletion) {
    var spiritState = {
      spirits: {
        milu: {
          owned: initiallyOwned,
          fragments: 4
        }
      }
    };
    var host = {
      _lastRuntimeState: null,
      _currentLevelId: 25,
      _currentLevelEnteredByTestUnlock: false,
      _currentRunContext: null,
      currentLevelConfig: {
        level: {
          levelId: 25,
          levelType: "trapped_sprite_rescue",
          trappedSpriteRescue: {
            spiritId: "milu"
          }
        }
      },
      assistSpiritStore: {
        load: function () {
          return clone(spiritState);
        },
        buildAddFragments: function (state, spiritId, count) {
          state.spirits[spiritId].fragments += count;
          return {
            accepted: true,
            spiritId: spiritId,
            gained: count,
            state: state
          };
        },
        save: function (state) {
          spiritState = clone(state);
          return clone(spiritState);
        }
      },
      _syncCollectedSkillPowerupsToInventory: function () {},
      _playSfx: function () {},
      _isLevelCompleted: function () {
        return !isFirstCompletion;
      },
      _recordCurrentLevelWin: function () {
        spiritState.spirits.milu.owned = true;
      },
      _grantCurrentLevelClearRewardItems: function () {
        return [];
      },
      _grantFirstAttemptClearStaminaReward: function () {
        return [];
      },
      _applyCurrentLevelBestScoreFlag: function () {},
      _applyCurrentLevelClearRewardItems: GameBootstrapLevelSelectFlowMethods._applyCurrentLevelClearRewardItems
    };
    var snapshot = {
      state: "won",
      winStats: {
        collectionRewardCompleted: false
      }
    };
    GameBootstrapLevelSelectFlowMethods._handleRuntimeStateTransition.call(host, snapshot);
    return {
      state: spiritState,
      rewardItems: snapshot.winStats.clearRewardItems
    };
  }

  var ownedFirstClear = runCase(true, true);
  assert(
    ownedFirstClear.state.spirits.milu.fragments === 5,
    "Already-owned rescue spirit must receive one fragment on first clear."
  );
  assert(
    ownedFirstClear.rewardItems.length === 1 &&
      ownedFirstClear.rewardItems[0].id === "spirit_fragment" &&
      ownedFirstClear.rewardItems[0].spiritId === "milu" &&
      ownedFirstClear.rewardItems[0].count === 1,
    "WinView reward items must expose the matching granted spirit fragment."
  );

  var newlyUnlockedFirstClear = runCase(false, true);
  assert(
    newlyUnlockedFirstClear.state.spirits.milu.fragments === 4 &&
      newlyUnlockedFirstClear.rewardItems.length === 0,
    "A spirit newly unlocked by this rescue clear must not receive its fragment reward."
  );

  var ownedRepeatClear = runCase(true, false);
  assert(
    ownedRepeatClear.state.spirits.milu.fragments === 4 && ownedRepeatClear.rewardItems.length === 0,
    "Already-owned rescue spirit must not receive fragments on repeat clears."
  );
}

function validateFloatingMapLandmarkRule() {
  var floatingMap = JSON.parse(fs.readFileSync(FLOATING_MAP_PATH, "utf8"));
  var expectedRescueLevelIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS;
  assert(floatingMap.schemaVersion === 3, "Floating map schemaVersion must be 3.");
  assert(
    Array.isArray(floatingMap.rescueLevelIds) &&
    floatingMap.rescueLevelIds.join(",") === expectedRescueLevelIds.join(","),
    "Floating map rescue schedule must match campaign configuration."
  );
  var rescueLookup = {};
  var landmarkLevelIds = [];
  expectedRescueLevelIds.forEach(function (levelId) {
    rescueLookup[String(levelId)] = true;
  });
  floatingMap.nodes.forEach(function (node) {
    node.levelIds.forEach(function (levelId) {
      var rescue = rescueLookup[String(levelId)] === true;
      if (node.prefab === "landmark1") {
        assert(node.type === "special", "landmark1 must use the special floating-map node type.");
        assert(node.capacity === 1 && node.levelIds.length === 1, "landmark1 must contain exactly one rescue level.");
        assert(rescue, "Non-rescue level must not use landmark1: " + levelId);
        assert(
          node.rescueSpiritId === CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId),
          "landmark1 rescueSpiritId must match the level rescue identity: " + levelId
        );
        landmarkLevelIds.push(levelId);
      } else {
        assert(!rescue, "Rescue level must use landmark1: " + levelId);
        assert(
          !Object.prototype.hasOwnProperty.call(node, "rescueSpiritId"),
          "Non-rescue floating-map node must not configure rescueSpiritId: " + levelId
        );
      }
    });
  });
  assert(
    landmarkLevelIds.join(",") === expectedRescueLevelIds.join(","),
    "Every scheduled rescue level must use landmark1 exactly once."
  );
}

function validateRemoteRescueIdentitySchedule() {
  var manifestPath = path.join(ROOT, "remote-level-packs", "level_manifest.json");
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert(Array.isArray(manifest.packs), "Remote level manifest packs must be an array.");
  var validatedLevelIds = [];
  manifest.packs.forEach(function (packEntry) {
    var expectedLevelIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.filter(function (levelId) {
      return levelId >= packEntry.from && levelId <= packEntry.to;
    });
    if (expectedLevelIds.length === 0) {
      return;
    }
    var packPath = path.join(ROOT, "remote-level-packs", packEntry.id + ".json");
    var pack = LevelPackCompactCodec.expandPack(JSON.parse(fs.readFileSync(packPath, "utf8")));
    expectedLevelIds.forEach(function (levelId) {
      var levelKey = "level_" + String(levelId).padStart(3, "0");
      var config = pack.levels[levelKey];
      assert(config && config.level, "Remote rescue level is missing: " + levelId);
      assert(config.level.levelType === "trapped_sprite_rescue", "Remote rescue level type mismatch: " + levelId);
      assert(
        config.level.trappedSpriteRescue &&
        config.level.trappedSpriteRescue.spiritId === CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId),
        "Remote rescue spiritId mismatch: " + levelId
      );
      assert(
        !Object.prototype.hasOwnProperty.call(config.level.trappedSpriteRescue, "spriteId"),
        "Remote rescue level must not retain legacy spriteId: " + levelId
      );
      validateGeneratedRescueBoardDesign(config.level, levelId);
      validatedLevelIds.push(levelId);
    });
  });
  assert(
    validatedLevelIds.join(",") === CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.join(","),
    "Remote rescue identity validation must cover all scheduled levels in order."
  );
}

function validateConfigContract(config) {
  assert(config.level.levelType === "trapped_sprite_rescue", "Test level type mismatch.");
  assert(config.level.layout[0] === "...........", "Rescue top row must be empty.");
  assert(config.level.trappedSpriteRescue.spiritId === "milu", "Test spiritId must be milu.");
  assert(config.level.dropInterval === undefined, "Rescue level must not normalize dropInterval.");
  assert(config.level.initialDropSpaceRows === undefined, "Rescue level must not normalize initialDropSpaceRows.");
  var expectedSpecialEntityKeys = [
    "obstacle_ball:ice",
    "obstacle_ball:stone",
    "reactive_ball:swirl",
    "reactive_ball:vine_spirit",
    "skill_ball:blast",
    "skill_ball:rainbow"
  ];
  var actualSpecialEntityKeys = config.level.specialEntities.map(function (entity) {
    return entity.entityCategory + ":" + entity.entityType;
  }).sort();
  assert(
    actualSpecialEntityKeys.join("|") === expectedSpecialEntityKeys.join("|"),
    "Rescue test level must configure all six supported special entity types."
  );
  assert(
    LevelBoardSupportValidator.findUnsupportedInitialCells(
      config.level,
      "level_trapped_sprite_test"
    ).length === 0,
    "Initial trapped sprite board must be fully supported."
  );

  var invalidTop = clone(config);
  invalidTop.level.layout[0] = "R..........";
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(invalidTop, "level_trapped_sprite_test");
  }, "top row must be empty");

  var invalidAnchor = clone(config);
  invalidAnchor.level.layout[4] = "..R.BRB.R..";
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(invalidAnchor, "level_trapped_sprite_test");
  }, "anchorCell must remain empty");

  var invalidAnchorSpecial = clone(config);
  invalidAnchorSpecial.level.specialEntities.push({
    id: "invalid_anchor_skill",
    entityCategory: "skill_ball",
    entityType: "rainbow",
    row: 4,
    col: 5
  });
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(invalidAnchorSpecial, "level_trapped_sprite_test");
  }, "anchorCell overlaps a special entity");

  var invalidTopSpecial = clone(config);
  invalidTopSpecial.level.specialEntities.push({
    id: "invalid_top_stone",
    entityCategory: "obstacle_ball",
    entityType: "stone",
    row: 0,
    col: 5
  });
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(invalidTopSpecial, "level_trapped_sprite_test");
  }, "special entity must not occupy the top row");

  var incompatibleSpecial = clone(config);
  incompatibleSpecial.level.specialEntities.push({
    id: "invalid_rescue_molotov",
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2,
    row: 8,
    col: 3
  });
  expectThrow(function () {
    LevelConfigLoader.normalizeLevelConfig(incompatibleSpecial, "level_trapped_sprite_test");
  }, "is incompatible: reactive_ball:molotov");

  var topOnly = clone(config.level);
  topOnly.layout = [
    "R..........",
    "..........",
    "...........",
    "..........",
    "...........",
    "..........",
    "...........",
    ".........."
  ];
  topOnly.trappedSpriteRescue.anchorCell = { row: 4, col: 5 };
  topOnly.specialEntities = [];
  assert(
    LevelBoardSupportValidator.findUnsupportedInitialCells(topOnly, "top_not_anchor").length === 1,
    "Top row must not seed support in trapped sprite rescue mode."
  );
}

function validateRotationMath(config, grid) {
  function createSystem() {
    var system = new TrappedSpriteRescueSystem();
    system.initialize({});
    system.configureLevel(config);
    return system;
  }

  var supported = grid.getCells();
  var rightSystem = createSystem();
  var leftSystem = createSystem();
  var radialSystem = createSystem();
  var right = rightSystem.beginImpactRotation(
    { x: 130, y: 51 },
    { x: 0.26423514707860024, y: 0.9644582868368909 },
    supported,
    grid
  );
  var left = leftSystem.beginImpactRotation(
    { x: -130, y: 51 },
    { x: -0.26423514707860024, y: 0.9644582868368909 },
    supported,
    grid
  );
  var radial = radialSystem.beginImpactRotation(
    { x: 0, y: 51 },
    { x: 0, y: 1 },
    supported,
    grid
  );
  assert(right.started && left.started, "Tangential impacts must start rotation.");
  assert(right.deltaAngleDeg * left.deltaAngleDeg < 0, "Mirrored impacts must rotate in opposite directions.");
  assert(
    nearlyEqual(Math.abs(right.deltaAngleDeg), Math.abs(left.deltaAngleDeg), 0.000001),
    "Mirrored impacts must have equal rotation magnitude."
  );
  assert(!radial.started && nearlyEqual(radial.deltaAngleDeg, 0, 0.000001), "Radial impact must not rotate.");

  var transformSystem = createSystem();
  var anchor = transformSystem.getWorldCenter();
  var original = transformSystem.getCellWorldPosition(4, 6, BoardLayout.defaultColumns);
  transformSystem.angleRad = Math.PI / 3;
  var rotated = transformSystem.getCellWorldPosition(4, 6, BoardLayout.defaultColumns);
  var originalRadius = Math.hypot(original.x - anchor.x, original.y - anchor.y);
  var rotatedRadius = Math.hypot(rotated.x - anchor.x, rotated.y - anchor.y);
  assert(nearlyEqual(originalRadius, rotatedRadius, 0.000001), "Rotation must preserve orbit radius.");
  assert(!nearlyEqual(original.x, rotated.x, 0.001), "Rotation must change cell world position.");
}

function validateRuntime(config) {
  var hitManager = createGameManager(config);
  validateRotationMath(config, hitManager.systems.bubbleGrid);
  hitManager.beginAim({ x: 200, y: 300 });
  assert(hitManager.pendingShotPlan.hitType === "bubble", "Right-side test aim must hit a bubble.");
  assert(hitManager.pendingShotPlan.targetCell, "Bubble hit must produce an attachment cell.");
  hitManager.fireShot();
  assert(runProjectileUntilSettled(hitManager), "Bubble hit must render at least one rotation frame.");
  assert(
    hitManager.lastResolution.trappedSpriteRotation &&
    hitManager.lastResolution.trappedSpriteRotation.started,
    "Bubble attachment must produce trapped sprite rotation."
  );
  assert(
    hitManager.lastResolution.impact === null,
    "Attachment that starts trapped sprite rotation must suppress neighbor impact bounce."
  );
  assert(
    Math.abs(hitManager.systems.trappedSpriteRescueSystem.angleRad) > 0.001,
    "Settled trapped sprite board angle must remain non-zero."
  );
  assert(
    hitManager.lastResolution.swirlRotations.length > 0,
    "Rescue shot must execute configured swirl after the whole-board rotation settles."
  );

  var plainConfig = createPlainRescueConfig(config);
  var missManager = createGameManager(plainConfig);
  var missGrid = missManager.systems.bubbleGrid;
  var missAnchor = missManager.systems.trappedSpriteRescueSystem.getAnchorCell();
  var retainedSupportCell = missGrid.getNeighborCoordinates(missAnchor.row, missAnchor.col).map(function (coordinate) {
    return missGrid.getCell(coordinate.row, coordinate.col);
  }).filter(Boolean)[0];
  assert(retainedSupportCell, "Rescue miss regression requires one direct support cell.");
  missManager.systems.bubbleGrid.removeCells(
    missManager.systems.bubbleGrid.getCells().filter(function (cell) {
      return cell.id !== retainedSupportCell.id;
    })
  );
  var cellsBeforeMiss = missManager.systems.bubbleGrid.getCells().length;
  missManager.beginAim({ x: 280, y: 300 });
  var missPlan = missManager.pendingShotPlan;
  var topAttachY = missManager.systems.bubbleGrid.getTopAttachY();
  var shooterOriginY = missManager.systems.shooterController.origin.y;
  assert(cellsBeforeMiss === 1, "Rescue miss regression must keep the board logically non-empty.");
  assert(missPlan.hitType === "miss", "Sparse rescue board shot must resolve as miss.");
  assert(missPlan.targetCell === null, "Rescue exit miss must not have targetCell.");
  assert(
    missPlan.wallPoints.some(function (point) {
      return nearlyEqual(point.y, topAttachY, 0.01);
    }),
    "Rescue trajectory must bounce at the board top."
  );
  assert(
    missPlan.pathPoints.some(function (point) {
      return nearlyEqual(point.y, topAttachY, 0.01);
    }),
    "Rescue projectile execution path must preserve the predicted top bounce point."
  );
  assert(
    missPlan.pathPoints[missPlan.pathPoints.length - 1].y < shooterOriginY,
    "Rescue projectile may disappear only below the shooter origin."
  );
  missManager.fireShot();
  runProjectileUntilSettled(missManager);
  assert(missManager.lastResolution.shotMissed === true, "Below-shooter miss resolution flag missing.");
  assert(
    missManager.systems.bubbleGrid.getCells().length === cellsBeforeMiss,
    "Below-shooter miss must not attach a bubble."
  );

  var supportManager = createGameManager(plainConfig);
  var grid = supportManager.systems.bubbleGrid;
  var anchor = supportManager.systems.trappedSpriteRescueSystem.getAnchorCell();
  var directSupportCells = grid.getNeighborCoordinates(anchor.row, anchor.col).map(function (coordinate) {
    return grid.getCell(coordinate.row, coordinate.col);
  }).filter(Boolean);
  assert(directSupportCells.length > 0, "Test board requires direct trapped sprite support cells.");
  grid.removeCells(directSupportCells);
  assert(grid.getCells().length > 0, "Support-drop test requires an outer cluster.");
  var attached = grid.addBubble({ row: 9, col: 4 }, "K");
  var resolution = supportManager._resolveAttachment(attached, {
    ballCategory: "normal",
    color: attached.color,
    entityCategory: "normal_ball",
    entityType: null
  });
  assert(resolution.floating.length > 0, "Unsupported outer cluster must drop in the same resolution.");
  assert(grid.getCells().length === 0, "Unsupported cells must not remain on the board.");
}

function validateSealedBoundaryCollisionAttachesToExtendedNeighbor() {
  var remotePackPath = path.join(ROOT, "remote-level-packs", "levels_pack_501_600.json");
  var remotePack = LevelPackCompactCodec.expandPack(JSON.parse(fs.readFileSync(remotePackPath, "utf8")));
  var levelConfig = LevelConfigLoader.normalizeLevelConfig(remotePack.levels.level_599, "level_599");
  var manager = createGameManager(levelConfig);
  var rescueSystem = manager.systems.trappedSpriteRescueSystem;
  var grid = manager.systems.bubbleGrid;
  var origin = manager.systems.shooterController.origin;

  rescueSystem.angleRad = -0.9;
  grid.notifyWorldTransformChanged();
  manager.beginAim({ x: origin.x + 900, y: 100 });

  var plan = manager.pendingShotPlan;
  assert(plan && plan.valid, "Sealed rescue boundary collision must produce a valid aiming plan.");
  assert(plan.hitType === "bubble", "A real rescue-board bubble collision must remain an attachment hit.");
  assert(plan.collidedCell, "Rescue boundary plan must preserve the real collided bubble.");
  assert(plan.targetCell, "Rescue boundary collision must resolve a six-neighbor attachment cell.");
  assert(plan.targetCellPosition, "Rescue boundary collision must expose the extended ghost target position.");
  assert(
    grid.getNeighborCoordinates(plan.collidedCell.row, plan.collidedCell.col).some(function (coordinate) {
      return coordinate.row === plan.targetCell.row && coordinate.col === plan.targetCell.col;
    }),
    "Rescue boundary target must be a direct hex neighbor of the collided bubble."
  );
  assert(
    !grid._isLayoutBackedCell(plan.targetCell.row, plan.targetCell.col),
    "Level 599 regression must attach outside the authored 11/10-column boundary."
  );
  assert(
    plan.targetCell.col >= grid.getColumnCountForRow(plan.targetCell.row),
    "Level 599 regression must cover the sealed right-edge attachment cell."
  );

  var shotsBefore = manager.remainingShots;
  var angleBefore = rescueSystem.angleRad;
  manager.fireShot();
  assert(manager.remainingShots === shotsBefore - 1, "Rescue boundary attachment must consume exactly one shot.");
  assert(manager.activeProjectile !== null, "Rescue boundary attachment must launch along the visible guide.");
  runProjectileUntilSettled(manager);
  assert(
    manager.lastResolution.attachedCell &&
      manager.lastResolution.attachedCell.row === plan.targetCell.row &&
      manager.lastResolution.attachedCell.col === plan.targetCell.col,
    "Rescue boundary shot must settle at the same extended cell shown by the ghost bubble."
  );
  assert(
    manager.lastResolution.trappedSpriteRotation &&
      manager.lastResolution.trappedSpriteRotation.started === true &&
      !nearlyEqual(rescueSystem.angleRad, angleBefore, 0.000001),
    "Rescue boundary attachment must apply its real impact to board rotation."
  );
}

function validateRotatedRescueSlotDiscovery(config) {
  var manager = createGameManager(createPlainRescueConfig(config));
  var grid = manager.systems.bubbleGrid;
  var rescueSystem = manager.systems.trappedSpriteRescueSystem;
  var anchorCell = rescueSystem.getAnchorCell();

  grid.removeCells(grid.getCells());
  rescueSystem.angleRad = 0.3;
  grid.notifyWorldTransformChanged();

  var candidate = null;
  for (var row = 1; row < grid.getRowCount() && !candidate; row += 1) {
    for (var col = 0; col < grid.getColumnCountForRow(row); col += 1) {
      if (anchorCell.row === row && anchorCell.col === col) {
        continue;
      }
      var neighbors = grid.getNeighborCoordinates(row, col);
      var upperNeighbors = neighbors.filter(function (neighbor) {
        return neighbor.row < row && !(anchorCell.row === neighbor.row && anchorCell.col === neighbor.col);
      });
      var lowerNeighbor = neighbors.filter(function (neighbor) {
        return neighbor.row > row && !(anchorCell.row === neighbor.row && anchorCell.col === neighbor.col);
      })[0];
      if (upperNeighbors.length >= 2 && lowerNeighbor) {
        candidate = {
          row: row,
          col: col,
          upperNeighbors: upperNeighbors.slice(0, 2),
          lowerNeighbor: lowerNeighbor
        };
        break;
      }
    }
  }
  assert(candidate, "Rotated rescue slot test requires a non-anchor hex slot with upper and lower neighbors.");

  candidate.upperNeighbors.forEach(function (neighbor) {
    grid.addBubble(neighbor, "G");
  });

  var center = grid.getCellPosition(candidate.row, candidate.col);
  var entry = grid.getCellPosition(candidate.lowerNeighbor.row, candidate.lowerNeighbor.col);
  var dx = center.x - entry.x;
  var dy = center.y - entry.y;
  var length = Math.sqrt(dx * dx + dy * dy);
  assert(length > 0, "Rotated rescue slot test requires distinct world positions.");
  var direction = { x: dx / length, y: dy / length };
  var start = { x: center.x - direction.x * 180, y: center.y - direction.y * 180 };
  var end = { x: center.x + direction.x * 180, y: center.y + direction.y * 180 };
  var slot = grid.findFirstAttachableSlotOnSegment(
    start,
    end,
    direction,
    BoardLayout.bubbleRadius * 0.62,
    0.78
  );

  assert(slot, "Rotated rescue gap must produce an attachable slot.");
  assert(
    slot.cell.row === candidate.row && slot.cell.col === candidate.col,
    "Rotated rescue gap must resolve to its world-space slot."
  );
}

function validateSupportedSpecialEntities(config) {
  var transformManager = createGameManager(config);
  var grid = transformManager.systems.bubbleGrid;
  var configuredCells = config.level.specialEntities.map(function (entity) {
    var cell = grid.getCell(entity.row, entity.col);
    assert(cell, "Configured rescue special entity must exist on the runtime board: " + entity.id);
    assert(cell.entityCategory === entity.entityCategory, "Rescue special entity category mismatch: " + entity.id);
    assert(cell.entityType === entity.entityType, "Rescue special entity type mismatch: " + entity.id);
    return {
      id: entity.id,
      row: entity.row,
      col: entity.col,
      before: grid.getCellPosition(entity.row, entity.col)
    };
  });
  transformManager.systems.trappedSpriteRescueSystem.angleRad = Math.PI / 7;
  grid.notifyWorldTransformChanged();
  configuredCells.forEach(function (entry) {
    var after = grid.getCellPosition(entry.row, entry.col);
    assert(
      !nearlyEqual(entry.before.x, after.x, 0.001) || !nearlyEqual(entry.before.y, after.y, 0.001),
      "Rescue special entity must follow the authoritative whole-board transform: " + entry.id
    );
  });

  var skillManager = createGameManager(config);
  skillManager.lastResolution = { injectedSkills: [] };
  var injected = skillManager._injectCollectedSkillBalls([
    {
      id: "rescue_collected_rainbow",
      entityCategory: "skill_ball",
      entityType: "rainbow",
      jarIndex: 0
    },
    {
      id: "rescue_collected_blast",
      entityCategory: "skill_ball",
      entityType: "blast",
      jarIndex: 1
    }
  ]);
  assert(injected === 2, "Rescue dropped rainbow and blast balls must enter shooter skill inventory.");
  assert(
    skillManager.lastResolution.injectedSkills.map(function (entry) {
      return entry.entityType;
    }).sort().join("|") === "blast|rainbow",
    "Rescue skill inventory injection must preserve rainbow and blast types."
  );

  var vineManager = createGameManager(config);
  vineManager.shotsFired = 3;
  var vineResolution = {
    boardCleared: false,
    vineCastEvaluated: false,
    vineCasts: []
  };
  vineManager.lastResolution = vineResolution;
  assert(
    vineManager._beginVineCastForResolution(vineResolution),
    "Rescue vine spirit must start its third-shot entanglement preview."
  );
  assert(vineResolution.vineCasts.length === 1, "Rescue test level must produce one vine cast.");
  var vineTarget = vineManager.systems.bubbleGrid.getCell(
    vineResolution.vineCasts[0].targetRow,
    vineResolution.vineCasts[0].targetCol
  );
  assert(vineTarget, "Rescue vine cast target must remain on the board.");
}

function validateTrappedSpriteSupportAttachment(config) {
  var manager = createGameManager(createPlainRescueConfig(config));
  var grid = manager.systems.bubbleGrid;
  grid.removeCells(grid.getCells());
  [
    [1, 6, "R"],
    [2, 5, "R"],
    [2, 6, "R"],
    [2, 7, "B"],
    [3, 4, "R"],
    [3, 5, "R"],
    [3, 6, "B"],
    [3, 7, "B"],
    [4, 6, "B"],
    [4, 7, "B"],
    [4, 8, "R"],
    [5, 6, "B"],
    [5, 7, "B"],
    [6, 7, "B"]
  ].forEach(function (entry) {
    grid.addBubble({ row: entry[0], col: entry[1] }, entry[2]);
  });
  manager.systems.trappedSpriteRescueSystem.angleRad = -1.229024971449392;
  grid.notifyWorldTransformChanged();

  var origin = manager.systems.shooterController.origin;
  var regressionDirection = { x: 0.8785654712260217, y: 0.47762193497514166 };
  manager.beginAim({
    x: origin.x + regressionDirection.x * 1000,
    y: origin.y + regressionDirection.y * 1000
  });
  var plan = manager.pendingShotPlan;
  var center = manager.systems.trappedSpriteRescueSystem.getWorldCenter();
  var anchor = manager.systems.trappedSpriteRescueSystem.getAnchorCell();
  var anchorNeighbors = grid.getNeighborCoordinates(anchor.row, anchor.col);
  assert(plan.hitType === "trapped_sprite", "Shot through the anchor gap must hit the trapped sprite support.");
  assert(plan.targetCell, "Trapped sprite support impact must resolve an attachment cell.");
  assert(
    anchorNeighbors.some(function (neighbor) {
      return neighbor.row === plan.targetCell.row && neighbor.col === plan.targetCell.col;
    }),
    "Trapped sprite support impact must attach to an anchor neighbor."
  );
  assert(
    plan.targetCell.row !== anchor.row || plan.targetCell.col !== anchor.col,
    "Trapped sprite support impact must never attach to the reserved anchor cell."
  );
  assert(
    nearlyEqual(
      Math.hypot(plan.hitPoint.x - center.x, plan.hitPoint.y - center.y),
      manager.systems.trajectoryPredictor.predictionCollisionRadius,
      0.01
    ),
    "Trapped sprite support impact point must use the sprite collision radius."
  );
  assert(
    !plan.wallPoints.some(function (point) {
      return nearlyEqual(point.x, plan.hitPoint.x, 0.01) && nearlyEqual(point.y, plan.hitPoint.y, 0.01);
    }),
    "Trapped sprite support impact must not be recorded as a bounce point."
  );

  grid.removeCells(grid.getCells());
  grid.addBubble({ row: 3, col: 4 }, "R");
  manager.systems.trappedSpriteRescueSystem.angleRad = 0;
  grid.notifyWorldTransformChanged();
  manager.beginAim({
    x: origin.x,
    y: origin.y + 600
  });
  var directPlan = manager.pendingShotPlan;
  assert(directPlan.hitType === "trapped_sprite", "Direct center shot must hit the trapped sprite support.");
  assert(directPlan.wallPoints.length === 0, "Direct trapped sprite support shot must not bounce.");
  assert(
    directPlan.targetCell && grid.getNeighborCoordinates(anchor.row, anchor.col).some(function (neighbor) {
      return neighbor.row === directPlan.targetCell.row && neighbor.col === directPlan.targetCell.col;
    }),
    "Direct trapped sprite support shot must target an anchor neighbor."
  );
  manager.fireShot();
  runProjectileUntilSettled(manager);
  assert(
    grid.hasCell(directPlan.targetCell.row, directPlan.targetCell.col),
    "Direct trapped sprite support shot must attach beside the anchor."
  );
}

function validateRescueCompletionAudio(config) {
  var rotatingManager = createGameManager(createPlainRescueConfig(config));
  rotatingManager.lastResolution = {
    boardCleared: true
  };
  rotatingManager.systems.trappedSpriteRescueSystem.phase = "rotating";
  rotatingManager._deferTrappedSpritePostImpactResolution(rotatingManager.lastResolution);
  var rotatingRescueEvents = rotatingManager._drainRuntimeEvents().filter(function (event) {
    return event.type === "trapped_sprite_rescued";
  });
  assert(
    rotatingRescueEvents.length === 1 && rotatingRescueEvents[0].spiritId === "milu",
    "Trapped sprite rescue event must emit when the board clears before its rotation finishes."
  );
  assert(
    rotatingManager.systems.trappedSpriteRescueSystem.isRotating(),
    "Trapped sprite rescue event must not skip the pending board rotation."
  );

  var manager = createGameManager(createPlainRescueConfig(config));
  var removedCells = manager.systems.bubbleGrid.removeCells(manager.systems.bubbleGrid.getCells());
  manager.systems.fallingMarbleSystem.registerDrops(
    [removedCells[0]],
    manager.systems.bubbleGrid
  );
  manager.score = config.level.starThresholds.star3;
  manager.remainingShots = 0;
  manager.state = "won_pending";

  assert(
    manager.systems.fallingMarbleSystem.hasActiveDrops(),
    "Immediate rescue event test requires an active falling marble."
  );
  manager._resolveBoardClearedOutcome();
  var rescueEvents = manager._drainRuntimeEvents().filter(function (event) {
    return event.type === "trapped_sprite_rescued";
  });
  assert(
    manager.systems.fallingMarbleSystem.hasActiveDrops(),
    "Trapped sprite must depart before falling marbles finish."
  );
  assert(manager.state === "won_pending", "Falling marbles must still delay final win settlement.");
  manager._resolveBoardClearedOutcome();
  assert(
    manager._drainRuntimeEvents().filter(function (event) {
      return event.type === "trapped_sprite_rescued";
    }).length === 0,
    "Repeated pending settlement checks must not emit duplicate trapped sprite rescue events."
  );
  assert(rescueEvents.length === 1, "Trapped sprite rescue completion must emit exactly one audio event.");
  assert(rescueEvents[0].spiritId === "milu", "Trapped sprite rescue audio event must include spiritId.");

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    congratulationsSfxResource: "sound/congratulations",
    trappedSpriteRescuedSfxResource: "sound/cute_laughter"
  });
  assert(
    audioConfig.sfxMap.congratulations === "sound/congratulations",
    "RescueSuccessfulView sfx must map to sound/congratulations."
  );
  assert(
    audioConfig.sfxMap.trappedSpriteRescued === "sound/cute_laughter",
    "Trapped sprite rescue sfx must map to sound/cute_laughter."
  );

  var playedSfx = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      playedSfx.push(sfxKey);
    }
  }, {
    runtimeEvents: rescueEvents
  });
  assert(
    playedSfx.length === 1 && playedSfx[0] === "trappedSpriteRescued",
    "trapped_sprite_rescued must play cute_laughter exactly once."
  );
}

function validateLevel63BoardEmptyRescue(level63Config) {
  var manager = createGameManager(level63Config);
  var grid = manager.systems.bubbleGrid;
  var removedCells = grid.removeFloatingCells(grid.getCells());
  assert(removedCells.length > 0, "Level 63 rescue regression requires board cells to drop.");
  manager.systems.fallingMarbleSystem.registerDrops(removedCells, grid);

  var snapshot = manager.update(0);
  assert(snapshot, "Level 63 board-empty rescue must emit a runtime snapshot.");
  var rescueEvents = snapshot.runtimeEvents.filter(function (event) {
    return event.type === "trapped_sprite_rescued";
  });
  assert(
    rescueEvents.length === 1 && rescueEvents[0].spiritId === "noya",
    "Level 63 must emit its rescued-spirit event immediately when all board balls drop."
  );
  assert(
    manager.state === "won_pending",
    "Level 63 must wait for falling-ball settlement only after emitting its rescue event."
  );
}

function validateWiring() {
  var rendererSource = readGameplaySourceFamily(ROOT, "gameplay-src/render", "LevelRenderer");
  var hudSource = readGameplaySourceFamily(ROOT, "gameplay-src/render", "LevelRenderer");
  var gameViewPrefab = JSON.parse(fs.readFileSync(
    path.join(ROOT, "assets", "game", "prefabs", "ui", "GameView.prefab"),
    "utf8"
  ));
  function resolvePrefabNode(reference, description) {
    assert(reference && Number.isInteger(reference.__id__), description + " reference is invalid.");
    var node = gameViewPrefab[reference.__id__];
    assert(node && node.__type__ === "cc.Node", description + " node is invalid.");
    return node;
  }
  function requirePrefabChild(parentNode, childName, description) {
    var child = null;
    parentNode._children.forEach(function (reference) {
      var candidate = resolvePrefabNode(reference, description + "/" + childName);
      if (candidate._name === childName) {
        child = candidate;
      }
    });
    assert(child, description + " is missing child " + childName + ".");
    return child;
  }
  var gameViewNode = resolvePrefabNode(gameViewPrefab[0].data, "GameView");
  var hudPanelNode = requirePrefabChild(gameViewNode, "HudPanel", "GameView");
  var targetLayoutNode = requirePrefabChild(hudPanelNode, "target_layout", "GameView/HudPanel");
  assert(
    targetLayoutNode._children.length === 1,
    "GameView/HudPanel/target_layout must retain exactly one HUD target template."
  );
  var targetTemplateNode = requirePrefabChild(targetLayoutNode, "item", "GameView/HudPanel/target_layout");
  requirePrefabChild(targetTemplateNode, "card_line", "GameView/HudPanel/target_layout/item");
  var targetIconNode = requirePrefabChild(targetTemplateNode, "icon", "GameView/HudPanel/target_layout/item");
  requirePrefabChild(targetIconNode, "TargetValue", "GameView/HudPanel/target_layout/item/icon");
  requirePrefabChild(targetIconNode, "complete", "GameView/HudPanel/target_layout/item/icon");
  assert(
    rendererSource.indexOf("game/trapped_spirit/") !== -1,
    "Renderer trapped sprite resource mapping is missing."
  );
  assert(
    rendererSource.indexOf("spiritDisplays.push({") !== -1 &&
      rendererSource.indexOf("spritePath: buildTrappedSpriteResourcePath(level.trappedSpriteRescue.spiritId)") !== -1 &&
      rendererSource.indexOf("var spiritRescued = runtimeSnapshot.board.cells.length === 0;") !== -1,
    "Rescue HUD target must use the configured trapped-spirit image and board-empty completion state."
  );
  [
    'var HUD_TARGET_TEMPLATE_NAME = "item";',
    'cardNode = cc.instantiate(templateNode);',
    'buildHudSpiritCardName(displayData.targetId)',
    'targetDisplay.spirits.forEach(function (displayData, index)',
    "sprite.trim = false;",
    "HUD_SPIRIT_ICON_HEIGHT * originalSize.width / originalSize.height"
  ].forEach(function (requiredToken) {
    assert(
      hudSource.indexOf(requiredToken) !== -1,
      "Rescue HUD target renderer token is missing: " + requiredToken
    );
  });
  assert(
    rendererSource.indexOf('"ui/image/props/" + spiritId + "_fragments"') !== -1,
    "Renderer rescue fragment reward resource mapping is missing."
  );
  var popupSource = readGameplaySourceFamily(ROOT, "gameplay-src/render", "LevelRenderer");
  assert(
    popupSource.indexOf('rewardItem.id === "spirit_fragment"') !== -1 &&
      popupSource.indexOf("buildSpiritFragmentRewardResourcePath(rewardItem.spiritId)") !== -1,
    "WinView spirit fragment reward rendering is missing."
  );
  [
    'rescueSuccessfulView: "prefabs/ui/RescueSuccessfulView"',
    'var RESCUE_SUCCESSFUL_SPIRIT_PATH_PREFIX = "image/rescue_successful/";',
    "buildRescueSuccessfulSpiritResourcePath(level.trappedSpriteRescue.spiritId)",
    "this._showRescueSuccessfulView(rescueEvent.spiritId);",
    "PREFAB_PATHS.rescueSuccessfulView"
  ].forEach(function (requiredToken) {
    assert(
      rendererSource.indexOf(requiredToken) !== -1,
      "RescueSuccessfulView renderer token is missing: " + requiredToken
    );
  });
  [
    "LevelRenderer.prototype._showRescueSuccessfulView",
    "LevelRenderer.prototype.hideRescueSuccessfulView",
    "LevelRenderer.prototype._dismissRescueSuccessfulViewForWin",
    "buildRescueSuccessfulSpiritResourcePath(spiritId)",
    "roleSprite.trim = false;",
    "roleNode.setContentSize(authoredRoleSize);",
    "RESCUE_SUCCESSFUL_VIEW_PROXY_ROOT_NAME",
    "var RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC = 2;",
    ".delay(RESCUE_SUCCESSFUL_MIN_DISPLAY_DURATION_SEC)",
    "viewNode.__minimumDisplayCompleted = true;",
    'this._notifyResultViewLifecycle("onRescueSuccessfulViewShow");'
  ].forEach(function (requiredToken) {
    assert(
      popupSource.indexOf(requiredToken) !== -1,
      "RescueSuccessfulView popup token is missing: " + requiredToken
    );
  });
  assert(
    popupSource.indexOf("closeButton.interactable = false;") === -1 &&
      popupSource.indexOf("cannot close before its two-second minimum display completes") === -1,
    "Player-initiated RescueSuccessfulView close must remain available before two seconds."
  );
  assert(
    popupSource.indexOf('LevelRenderer.prototype.hideRescueSuccessfulView = function () {') <
      popupSource.indexOf('this._renderWinView(this.lastRuntimeSnapshot);'),
    "Player-initiated rescue popup close must immediately resume a pending WinView render."
  );
  assert(
    popupSource.indexOf("rescueSuccessfulView.__minimumDisplayCompleted !== true") <
      popupSource.indexOf("this._dismissRescueSuccessfulViewForWin();"),
    "WinView must wait until RescueSuccessfulView has displayed for two seconds."
  );
  assert(
    popupSource.indexOf("this._dismissRescueSuccessfulViewForWin();") <
      popupSource.indexOf("var renderKey = buildWinViewRenderKey(this.currentLevelConfig, runtimeSnapshot);"),
    "WinView must dismiss RescueSuccessfulView before rendering or returning from its active render path."
  );
  var bundleLoaderSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "utils", "BundleLoader.js"),
    "utf8"
  );
  assert(
    bundleLoaderSource.indexOf("RescueSuccessfulView: true") !== -1,
    "BundleLoader must route RescueSuccessfulView through the UI bundle."
  );
  assert(
    rendererSource.indexOf("onRescueSuccessfulViewShow:") !== -1,
    "LevelRenderer lifecycle handlers must expose RescueSuccessfulView show."
  );
  var compositionSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "bootstrap", "GameBootstrapCompositionMethods.js"),
    "utf8"
  );
  assert(
    compositionSource.indexOf("onRescueSuccessfulViewShow: function () {") !== -1 &&
      compositionSource.indexOf('this._playSfx("congratulations");') !== -1,
    "RescueSuccessfulView show must play congratulations through GameBootstrap audio."
  );
  var audioMethodsSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "bootstrap", "GameBootstrapAudioMethods.js"),
    "utf8"
  );
  assert(
    audioMethodsSource.indexOf("congratulations: this.congratulationsSfxResource") !== -1,
    "GameBootstrap audio config must map congratulations sfx."
  );
  assert(
    rendererSource.indexOf("var TRAPPED_SPRITE_LAYER_Z_INDEX = 49;") !== -1 &&
    rendererSource.indexOf('this._getOrCreateLayer("TrappedSpriteLayer", TRAPPED_SPRITE_LAYER_Z_INDEX)') !== -1 &&
    rendererSource.indexOf("node.parent = this.layers.trappedSprite;") !== -1,
    "Trapped sprite must use a dedicated layer above every bubble layer."
  );
  assert(
    rendererSource.indexOf("node.setScale(1);") !== -1 &&
      rendererSource.indexOf("node.setContentSize(BOARD_BUBBLE_SIZE);") !== -1 &&
      rendererSource.indexOf("sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;") !== -1,
    "Trapped sprite must render at the normal board bubble size."
  );
  assert(
    rendererSource.indexOf("var sprite = ensureSprite(node, spriteFrame);") <
      rendererSource.indexOf("node.setContentSize(BOARD_BUBBLE_SIZE);") &&
      rendererSource.indexOf("sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;") <
        rendererSource.indexOf("node.setContentSize(BOARD_BUBBLE_SIZE);"),
    "Trapped sprite must set its 65x65 board size after the SpriteFrame is bound."
  );
  assert(
    SpecialAnimationTiming.trappedSpriteRescue.flyOutDuration === 0.65 &&
    SpecialAnimationTiming.trappedSpriteRescue.exitMargin === 80,
    "Trapped sprite rescue departure timing mismatch."
  );
  [
    "_playTrappedSpriteRescueDeparture",
    "trappedSpriteDepartureActive",
    "trappedSpriteDepartureCompleted",
    "var targetY = layerTopY + nodeSize.height * scaleY * 0.5 + timing.exitMargin;",
    "node.active = false;"
  ].forEach(function (requiredToken) {
    assert(
      rendererSource.indexOf(requiredToken) !== -1,
      "Trapped sprite departure renderer token is missing: " + requiredToken
    );
  });
  var bootstrapSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "bootstrap", "GameBootstrap.js"),
    "utf8"
  );
  assert(
    bootstrapSource.indexOf("_startTrappedSpriteTestLevelEntry") !== -1,
    "GameBootstrap trapped sprite test entry mapping is missing."
  );
  var specialIntroduceFlowSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "bootstrap", "GameBootstrapSpecialIntroduceFlowMethods.js"),
    "utf8"
  );
  assert(
    specialIntroduceFlowSource.indexOf("if (snapshot.board.trappedSpriteRescueActive === true) {") !== -1,
    "Top-slot tips must not validate authored-grid coordinates during trapped sprite rescue."
  );
  var routeEditorFlowSource = fs.readFileSync(
    path.join(ROOT, "assets", "scripts", "bootstrap", "GameBootstrapRouteEditorFlowMethods.js"),
    "utf8"
  );
  assert(
    routeEditorFlowSource.indexOf('options.testSource !== "trapped_sprite"') !== -1,
    "GameBootstrap level entry must accept the trapped_sprite testSource."
  );
  var sceneFxSource = readGameplaySourceFamily(ROOT, "gameplay-src/render", "LevelRenderer");
  [
    "resolveBoardCellWorldPosition",
    "rescueSnapshot.angleRad",
    '"Swirl animation start"',
    '"Blast explosion"',
    '"Ice thaw animation"'
  ].forEach(function (requiredToken) {
    assert(
      sceneFxSource.indexOf(requiredToken) !== -1,
      "Rescue special-effect world transform token is missing: " + requiredToken
    );
  });
}

var config = loadConfig();
var multiTargetConfig = loadMultiTargetConfig();
var level63Config = loadLevel63Config();
validateAssets();
validateRescueSuccessfulPrefab();
validateFloatingMapLandmarkRule();
validateRemoteRescueIdentitySchedule();
validateConfigContract(config);
validateMultiTargetConfigContract(multiTargetConfig);
validateMultiTargetRuntime(multiTargetConfig);
validateMultiTargetWiring();
validateRuntime(config);
validateSealedBoundaryCollisionAttachesToExtendedNeighbor();
validateRotatedRescueSlotDiscovery(config);
validateSupportedSpecialEntities(config);
validateTrappedSpriteSupportAttachment(config);
validateRescueCompletionAudio(config);
validateLevel63BoardEmptyRescue(level63Config);
validateFirstClearRescueFragmentRewards();
validateWiring();
console.log("Trapped sprite rescue validation passed.");
