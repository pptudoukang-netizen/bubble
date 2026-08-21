"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var GAMEPLAY_SOURCE_ROOT = path.join(PROJECT_ROOT, "gameplay-src");
var MAX_SOURCE_LINES = 1200;

var REQUIRED_MODULE_FAMILIES = {
  "core/GameManager.js": [
    "GameManagerLifecycleMethods",
    "GameManagerSnapshotMethods",
    "GameManagerBoardPhaseMethods",
    "GameManagerSpecialPhaseMethods",
    "GameManagerBudMethods",
    "GameManagerRuntimeStateMethods",
    "GameManagerInputMethods",
    "GameManagerAdPowerupMethods",
    "GameManagerPowerupMethods",
    "GameManagerColorCloudMethods",
    "GameManagerUpdateMethods",
    "GameManagerShotResolutionMethods",
    "GameManagerAssistSpiritSkillMethods"
  ],
  "core/GameManagerShotResolutionMethods.js": [
    "GameManagerShotScoreMethods",
    "GameManagerShotPlanningMethods",
    "GameManagerShotDropMethods",
    "GameManagerShotMolotovMethods",
    "GameManagerShotReactiveMethods",
    "GameManagerShotFinalizeMethods"
  ],
  "render/LevelRenderer.js": [
    "LevelRendererCoreContext",
    "LevelRendererActionMethods",
    "LevelRendererRuntimeMethods",
    "LevelRendererResourceMethods",
    "LevelRendererSharedVisualMethods"
  ],
  "render/LevelRendererCoreContext.js": [
    "LevelRendererResourceConfig",
    "LevelRendererStateSelectors"
  ],
  "render/LevelRendererSceneMethods.js": [
    "LevelRendererSceneColorCloudMethods"
  ],
  "render/LevelRendererSceneHudMethods.js": [
    "LevelRendererSceneHudCoreMethods",
    "LevelRendererSceneFloatingScoreMethods",
    "LevelRendererSceneJarScoreHudMethods",
    "LevelRendererSceneBottomPanelMethods",
    "LevelRendererScenePowerupFeedbackMethods",
    "LevelRendererSceneObjectiveHudMethods",
    "LevelRendererSceneStarHudMethods"
  ],
  "render/LevelRendererSceneFxMethods.js": [
    "LevelRendererSceneBarrierFxMethods",
    "LevelRendererSceneKeySplitterFxMethods",
    "LevelRendererSceneBoardTransformFxMethods",
    "LevelRendererSceneExplosionIceFxMethods",
    "LevelRendererSceneScreenFxMethods",
    "LevelRendererSceneBudFxMethods"
  ],
  "render/LevelRendererScenePopupMethods.js": [
    "LevelRendererSceneWinPopupMethods",
    "LevelRendererSceneModalPopupMethods",
    "LevelRendererSceneResultPopupMethods"
  ],
  "systems/BubbleGrid.js": [
    "BubbleGridSpecialEntityMethods",
    "BubbleGridCollisionMethods",
    "BubbleGridMutationMethods"
  ],
  "systems/FallingMarbleSystem.js": [
    "FallingMarbleSurplusMethods",
    "FallingMarbleJarPhysicsMethods",
    "FallingMarbleRuntimeMethods"
  ]
};

var REQUIRED_PUBLIC_EXPORTS = {
  "core/GameManager.js": "module.exports = GameManager;",
  "render/LevelRenderer.js": "module.exports = LevelRenderer;",
  "systems/BubbleGrid.js": "module.exports = BubbleGrid;",
  "systems/FallingMarbleSystem.js": "module.exports = FallingMarbleSystem;"
};

function assertDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error("Gameplay source directory is missing: " + directoryPath);
  }
}

function collectJavaScriptFiles(directoryPath) {
  var result = [];
  fs.readdirSync(directoryPath).sort().forEach(function (entryName) {
    var entryPath = path.join(directoryPath, entryName);
    var stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      result = result.concat(collectJavaScriptFiles(entryPath));
      return;
    }
    if (stat.isFile() && path.extname(entryPath) === ".js") {
      result.push(entryPath);
    }
  });
  return result;
}

function readSource(relativePath) {
  var absolutePath = path.join(GAMEPLAY_SOURCE_ROOT, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error("Required gameplay module is missing: " + relativePath);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function countLines(source) {
  return source.split(/\r?\n/).length;
}

assertDirectory(GAMEPLAY_SOURCE_ROOT);

var oversizedModules = collectJavaScriptFiles(GAMEPLAY_SOURCE_ROOT).map(function (filePath) {
  var source = fs.readFileSync(filePath, "utf8");
  return {
    relativePath: path.relative(GAMEPLAY_SOURCE_ROOT, filePath).replace(/\\/g, "/"),
    lineCount: countLines(source)
  };
}).filter(function (entry) {
  return entry.lineCount > MAX_SOURCE_LINES;
});

if (oversizedModules.length) {
  throw new Error(
    "Gameplay source modules must not exceed " + MAX_SOURCE_LINES + " lines:\n" +
    oversizedModules.map(function (entry) {
      return "- " + entry.relativePath + ": " + entry.lineCount;
    }).join("\n")
  );
}

Object.keys(REQUIRED_MODULE_FAMILIES).forEach(function (facadePath) {
  var source = readSource(facadePath);
  REQUIRED_MODULE_FAMILIES[facadePath].forEach(function (moduleName) {
    readSource(path.posix.join(path.posix.dirname(facadePath), moduleName + ".js"));
    var requireText = "require(\"./" + moduleName + "\")";
    if (source.indexOf(requireText) < 0) {
      throw new Error(facadePath + " must explicitly require " + moduleName + ".");
    }
  });
});

Object.keys(REQUIRED_PUBLIC_EXPORTS).forEach(function (facadePath) {
  if (readSource(facadePath).indexOf(REQUIRED_PUBLIC_EXPORTS[facadePath]) < 0) {
    throw new Error(facadePath + " must preserve its public constructor export.");
  }
});

function createCocosModuleLoadStub() {
  var stub;
  stub = new Proxy(function () {
    return stub;
  }, {
    get: function () {
      return stub;
    },
    apply: function () {
      return stub;
    },
    construct: function () {
      return {};
    }
  });
  return stub;
}

global.cc = createCocosModuleLoadStub();
var GameManager = require(path.join(GAMEPLAY_SOURCE_ROOT, "core", "GameManager.js"));
var LevelRenderer = require(path.join(GAMEPLAY_SOURCE_ROOT, "render", "LevelRenderer.js"));
if (typeof GameManager !== "function" || typeof LevelRenderer !== "function") {
  throw new Error("Gameplay public facades must load as constructors.");
}

console.log(
  "Gameplay module structure validation passed: max " + MAX_SOURCE_LINES +
  " lines, explicit domain modules, stable public constructors."
);
