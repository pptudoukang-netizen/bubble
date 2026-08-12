"use strict";

var fs = require("fs");
var path = require("path");

var RuntimeModeConfig = require("../assets/scripts/config/RuntimeModeConfig");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var GAME_SCENE_PATH = path.join(PROJECT_ROOT, "assets/scens/game.fire");
var GAME_BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrap.js");
var BUNDLE_LOADER_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/BundleLoader.js");
var LEVEL_SELECT_FLOW_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js");
var LEVEL_SELECT_VIEW_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/LevelSelectView.js");
var LEVEL_SELECT_GEM_REWARDED_VIDEO_AD_UNIT_ID = "adunit-dfa53e016c63a38d";
var ASSETS_ROOT = path.join(PROJECT_ROOT, "assets");
var AUDIO_EXTENSIONS = {
  ".m4a": true,
  ".mp3": true,
  ".ogg": true,
  ".wav": true
};

function readJson(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertReleaseBooleanField(sceneComponent, key) {
  if (sceneComponent[key] !== false) {
    throw new Error("Release scene field `" + key + "` must be false.");
  }
}

function findBootstrapComponent(sceneData) {
  if (!Array.isArray(sceneData)) {
    throw new Error("game.fire root must be an array.");
  }

  var matches = sceneData.filter(function (entry) {
    return entry &&
      typeof entry === "object" &&
      Object.prototype.hasOwnProperty.call(entry, "enableSpecialEntitiesTestMode") &&
      Object.prototype.hasOwnProperty.call(entry, "rewardedVideoAdUnitId");
  });

  if (matches.length !== 1) {
    throw new Error("Expected exactly one GameBootstrap component in game.fire, found " + matches.length + ".");
  }

  return matches[0];
}

function assertRuntimeModeConfig() {
  RuntimeModeConfig.validate();
  if (RuntimeModeConfig.mode !== "release") {
    throw new Error("RuntimeModeConfig.mode must be release for release validation.");
  }
}

function assertSceneConfig() {
  var component = findBootstrapComponent(readJson(GAME_SCENE_PATH));
  [
    "enableSpecialEntitiesTestMode",
    "showDebugOverlay",
    "showGridTestLayer",
    "showDropTestButton",
    "enableLevelEditor",
    "enableMockRewardedAdOnUnsupported"
  ].forEach(function (key) {
    assertReleaseBooleanField(component, key);
  });

  if (typeof component.rewardedVideoAdUnitId !== "string" || component.rewardedVideoAdUnitId.trim().length === 0) {
    throw new Error("Release rewardedVideoAdUnitId must be configured in assets/scens/game.fire.");
  }
  if (typeof component.interstitialAdUnitId !== "string" || component.interstitialAdUnitId.trim().length === 0) {
    throw new Error("Release interstitialAdUnitId must be configured in assets/scens/game.fire.");
  }
  if (component.levelSelectGemRewardedVideoAdUnitId !== LEVEL_SELECT_GEM_REWARDED_VIDEO_AD_UNIT_ID) {
    throw new Error(
      "Release levelSelectGemRewardedVideoAdUnitId must be " +
      LEVEL_SELECT_GEM_REWARDED_VIDEO_AD_UNIT_ID +
      "."
    );
  }
}

function assertBootstrapSource() {
  var source = readText(GAME_BOOTSTRAP_PATH);
  [
    "_grantLoseRewardWithoutAdConfig",
    "missing_ad_config_skip",
    "window.__bubbleDebug ="
  ].forEach(function (forbiddenText) {
    if (source.indexOf(forbiddenText) >= 0) {
      throw new Error("Forbidden release source pattern found: " + forbiddenText);
    }
  });
}

function assertDirectoryExists(directoryPath, description) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(description + " directory is required: " + directoryPath);
  }
}

function assertBundleMeta(bundleName, priority) {
  var metaPath = path.join(ASSETS_ROOT, bundleName + ".meta");
  var meta = readJson(metaPath);
  if (meta.isBundle !== true) {
    throw new Error("assets/" + bundleName + " must be an asset bundle.");
  }
  if (meta.bundleName !== bundleName) {
    throw new Error("assets/" + bundleName + " bundleName must be `" + bundleName + "`.");
  }
  if (meta.priority !== priority) {
    throw new Error("assets/" + bundleName + " priority must be " + priority + ".");
  }
  if (!meta.compressionType || meta.compressionType.wechatgame !== "subpackage") {
    throw new Error("assets/" + bundleName + " must build as a WeChat subpackage.");
  }
}

function collectFiles(directoryPath, output) {
  fs.readdirSync(directoryPath).forEach(function (name) {
    var entryPath = path.join(directoryPath, name);
    var stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      collectFiles(entryPath, output);
      return;
    }
    if (stat.isFile()) {
      output.push(entryPath);
    }
  });
}

function assertAssetBundleLayout() {
  var resourcesPath = path.join(ASSETS_ROOT, "resources");
  if (fs.existsSync(resourcesPath) || fs.existsSync(resourcesPath + ".meta")) {
    throw new Error("assets/resources must not exist after explicit bundle migration.");
  }

  assertBundleMeta("game", 3);
  assertBundleMeta("audio", 5);
  assertBundleMeta("map", 6);

  [
    "assets/map/image/AutoAtlas.pac.meta",
    "assets/map/image/level_view/AutoAtlas.pac.meta"
  ].forEach(function (relativePath) {
    var atlasMeta = readJson(path.join(PROJECT_ROOT, relativePath));
    var minigameFormats = atlasMeta.platformSettings && atlasMeta.platformSettings.minigame
      ? atlasMeta.platformSettings.minigame.formats
      : null;
    if (
      !Array.isArray(minigameFormats) ||
      minigameFormats.length !== 1 ||
      minigameFormats[0].name !== "astc_8x8"
    ) {
      throw new Error("Map startup AutoAtlas must use minigame astc_8x8 compression: " + relativePath);
    }
  });

  var scriptsMeta = readJson(path.join(ASSETS_ROOT, "scripts.meta"));
  if (scriptsMeta.isBundle !== true || scriptsMeta.bundleName !== "core" || scriptsMeta.priority !== 7) {
    throw new Error("assets/scripts must be the priority-7 `core` asset bundle.");
  }
  if (!scriptsMeta.compressionType || scriptsMeta.compressionType.wechatgame !== "subpackage") {
    throw new Error("assets/scripts core bundle must build as a WeChat subpackage.");
  }

  [
    ["map/config", "Map config"],
    ["map/prefabs/ui", "Map UI prefab"],
    ["game/effects", "Gameplay effect"],
    ["game/generated", "Generated gameplay code"],
    ["game/image", "Gameplay image"],
    ["game/prefabs", "Gameplay prefab"],
    ["audio/sound", "Audio"]
  ].forEach(function (entry) {
    assertDirectoryExists(path.join(ASSETS_ROOT, entry[0]), entry[1]);
  });

  var assetFiles = [];
  collectFiles(ASSETS_ROOT, assetFiles);
  var audioRoot = path.join(ASSETS_ROOT, "audio") + path.sep;
  assetFiles.forEach(function (filePath) {
    if (AUDIO_EXTENSIONS[path.extname(filePath).toLowerCase()] === true && filePath.indexOf(audioRoot) !== 0) {
      throw new Error("Audio asset must be inside assets/audio: " + filePath);
    }
  });

  var bundleLoaderSource = readText(BUNDLE_LOADER_PATH);
  if (bundleLoaderSource.indexOf("cc.resources.load") >= 0) {
    throw new Error("BundleLoader must not call cc.resources.load after resources migration.");
  }
  ["MAP_BUNDLE_NAME", "GAME_BUNDLE_NAME", "AUDIO_BUNDLE_NAME"].forEach(function (requiredText) {
    if (bundleLoaderSource.indexOf(requiredText) < 0) {
      throw new Error("BundleLoader route missing: " + requiredText);
    }
  });
}

function assertLevelSelectMapBundleLifecycle() {
  var flowSource = readText(LEVEL_SELECT_FLOW_PATH);
  var hideMethodIndex = flowSource.indexOf("_hideLevelSelectView: function ()");
  var destroyNodeIndex = flowSource.indexOf("levelSelectNode.destroy()", hideMethodIndex);
  var clearNodeIndex = flowSource.indexOf("this._levelSelectNode = null", hideMethodIndex);
  var clearPrefabIndex = flowSource.indexOf("this._levelSelectViewPrefab = null", hideMethodIndex);
  var releaseViewAssetsIndex = flowSource.indexOf("LevelSelectView.releaseMapBundleAssets()", hideMethodIndex);
  var releaseBundleIndex = flowSource.indexOf('BundleLoader.releaseNamedBundle("map")', hideMethodIndex);
  var orderedIndices = [
    hideMethodIndex,
    releaseViewAssetsIndex,
    destroyNodeIndex,
    clearNodeIndex,
    clearPrefabIndex,
    releaseBundleIndex
  ];
  orderedIndices.forEach(function (currentIndex, index) {
    if (currentIndex < 0) {
      throw new Error("Level select map bundle lifecycle step missing at index " + index + ".");
    }
    if (index > 0 && currentIndex <= orderedIndices[index - 1]) {
      throw new Error("Level select map bundle lifecycle order is invalid at index " + index + ".");
    }
  });

  var viewSource = readText(LEVEL_SELECT_VIEW_PATH);
  if (viewSource.indexOf("function releaseMapBundleAssets()") < 0) {
    throw new Error("LevelSelectView.releaseMapBundleAssets implementation is required.");
  }
  if (viewSource.indexOf("releaseMapBundleAssets: releaseMapBundleAssets") < 0) {
    throw new Error("LevelSelectView.releaseMapBundleAssets export is required.");
  }
}

function main() {
  assertRuntimeModeConfig();
  assertSceneConfig();
  assertBootstrapSource();
  assertAssetBundleLayout();
  assertLevelSelectMapBundleLifecycle();
  console.log("Release config validation passed.");
}

main();
