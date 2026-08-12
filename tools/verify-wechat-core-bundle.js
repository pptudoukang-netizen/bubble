"use strict";

var fs = require("fs");
var path = require("path");

var CORE_MARKER = "__BUBBLE_CORE_CODE_LOADED__";
var BUSINESS_MARKER = "GameBootstrapShared";
var LEVEL_SELECT_GEM_REWARDED_AD_MARKERS = [
  "resolveLevelSelectGemRewardEntry",
  "levelSelectGemRewardedVideoAdUnitId",
  "showGemRewardVideoIcon",
  "onClaimGemReward",
  "__gemRewardVideoTapBound",
  "map/image/props/gem_icon"
];

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Required WeChat build file is missing: " + filePath);
  }
}

function readText(filePath) {
  assertFile(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function verifyTrappedRescueOccupancyContract(coreSource) {
  var rescueMetricPattern =
    /enforceMinimumNormalBallOccupancy\s*:\s*["']trapped_sprite_rescue["']\s*!==\s*[A-Za-z_$][\w$]*\.levelType/;
  var guardedOccupancyPattern =
    /\.enforceMinimumNormalBallOccupancy\s*&&\s*[A-Za-z_$][\w$]*\.normalBallOccupancyRatio/;
  if (!rescueMetricPattern.test(coreSource) || !guardedOccupancyPattern.test(coreSource)) {
    throw new Error("core subpackage is stale or missing the trapped-rescue occupancy contract.");
  }
}

function verifyBuiltStartGameViewPrefabContract(outputRoot) {
  var uiImportRoot = path.join(outputRoot, "subpackages/ui/import");
  if (!fs.existsSync(uiImportRoot) || !fs.statSync(uiImportRoot).isDirectory()) {
    throw new Error("WeChat build is missing the ui import directory: " + uiImportRoot);
  }

  var candidates = [];
  fs.readdirSync(uiImportRoot).forEach(function (directoryName) {
    var directoryPath = path.join(uiImportRoot, directoryName);
    if (!fs.statSync(directoryPath).isDirectory()) {
      return;
    }
    fs.readdirSync(directoryPath).forEach(function (fileName) {
      if (path.extname(fileName) !== ".json") {
        return;
      }
      var filePath = path.join(directoryPath, fileName);
      var source = readText(filePath);
      if (source.indexOf('"StartGameView"') >= 0) {
        candidates.push({
          filePath: filePath,
          source: source
        });
      }
    });
  });

  if (candidates.length !== 1) {
    throw new Error("WeChat build must contain exactly one StartGameView prefab asset, found: " + candidates.length);
  }
  if (candidates[0].source.indexOf('"title_bg"') < 0 || candidates[0].source.indexOf('"level"') < 0) {
    throw new Error("Built StartGameView prefab is missing Panel/title_bg/level: " + candidates[0].filePath);
  }
  return candidates[0].filePath;
}

function resolveBuiltInMainGameJsPath(outputRoot) {
  var subpackagePath = path.join(outputRoot, "subpackages/main/game.js");
  if (fs.existsSync(subpackagePath) && fs.statSync(subpackagePath).isFile()) {
    return subpackagePath;
  }
  var builtInBundlePath = path.join(outputRoot, "assets/main/index.js");
  assertFile(builtInBundlePath);
  return builtInBundlePath;
}

function verifyWeChatCoreBundleBuild(buildOutputDir) {
  if (typeof buildOutputDir !== "string" || buildOutputDir.trim().length === 0) {
    throw new Error("Core bundle verification requires an explicit build output directory.");
  }
  var outputRoot = path.resolve(buildOutputDir);
  var settingsPath = path.join(outputRoot, "src/settings.js");
  var coreGameJsPath = path.join(outputRoot, "subpackages/core/game.js");
  var mainGameJsPath = resolveBuiltInMainGameJsPath(outputRoot);
  var settingsSource = readText(settingsPath);
  var coreSource = readText(coreGameJsPath);
  var mainSource = readText(mainGameJsPath);
  var startGameViewPrefabPath = verifyBuiltStartGameViewPrefabContract(outputRoot);

  if (settingsSource.indexOf('launchScene:"db://assets/scens/boot.fire"') < 0) {
    throw new Error("WeChat build launchScene must be boot.fire.");
  }
  if (settingsSource.indexOf('"core"') < 0) {
    throw new Error("WeChat build settings must register the core subpackage.");
  }
  if (settingsSource.indexOf("assets/boot/BootLoader.js") >= 0) {
    throw new Error("WeChat build must compile BootLoader as a scene component, not a global plugin.");
  }
  if (
    mainSource.indexOf("BootLoader requires a runtime global object.") < 0 ||
    mainSource.indexOf("BootLoader must run on the boot scene Canvas.") < 0
  ) {
    throw new Error("Built-in main subpackage is missing the BootLoader scene component.");
  }
  if (coreSource.indexOf(CORE_MARKER) < 0 || coreSource.indexOf(BUSINESS_MARKER) < 0) {
    throw new Error("core subpackage is missing bootstrap business code or its execution marker.");
  }
  if (mainSource.indexOf(BUSINESS_MARKER) >= 0) {
    throw new Error("Built-in main subpackage still contains core bootstrap business code.");
  }
  LEVEL_SELECT_GEM_REWARDED_AD_MARKERS.forEach(function (marker) {
    if (coreSource.indexOf(marker) < 0) {
      throw new Error("core subpackage is missing LevelView gem rewarded-ad marker: " + marker);
    }
  });
  verifyTrappedRescueOccupancyContract(coreSource);

  return {
    settingsPath: settingsPath,
    coreGameJsPath: coreGameJsPath,
    mainGameJsPath: mainGameJsPath,
    startGameViewPrefabPath: startGameViewPrefabPath,
    coreBytes: fs.statSync(coreGameJsPath).size,
    mainBytes: fs.statSync(mainGameJsPath).size
  };
}

if (require.main === module) {
  var result = verifyWeChatCoreBundleBuild(process.argv[2]);
  console.log("Verified WeChat core subpackage: " + result.coreGameJsPath);
  console.log("Verified StartGameView prefab contract: " + result.startGameViewPrefabPath);
  console.log("Core script bytes: " + result.coreBytes);
  console.log("Main script bytes: " + result.mainBytes);
}

module.exports = {
  verifyWeChatCoreBundleBuild: verifyWeChatCoreBundleBuild
};
