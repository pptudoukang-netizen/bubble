"use strict";

var fs = require("fs");
var path = require("path");

var CORE_MARKER = "__BUBBLE_CORE_CODE_LOADED__";
var BUSINESS_MARKER = "GameBootstrapShared";

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Required WeChat build file is missing: " + filePath);
  }
}

function readText(filePath) {
  assertFile(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function resolveBuiltInMainGameJsPath(outputRoot) {
  var subpackagePath = path.join(outputRoot, "subpackages/main/game.js");
  var rootPath = path.join(outputRoot, "game.js");
  if (fs.existsSync(subpackagePath) && fs.statSync(subpackagePath).isFile()) {
    return subpackagePath;
  }
  assertFile(rootPath);
  return rootPath;
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

  if (settingsSource.indexOf('launchScene:"db://assets/scens/boot.fire"') < 0) {
    throw new Error("WeChat build launchScene must be boot.fire.");
  }
  if (settingsSource.indexOf('"core"') < 0) {
    throw new Error("WeChat build settings must register the core subpackage.");
  }
  if (settingsSource.indexOf("assets/boot/BootLoader.js") < 0) {
    throw new Error("WeChat build jsList must contain BootLoader.js.");
  }
  if (coreSource.indexOf(CORE_MARKER) < 0 || coreSource.indexOf(BUSINESS_MARKER) < 0) {
    throw new Error("core subpackage is missing bootstrap business code or its execution marker.");
  }
  if (mainSource.indexOf(CORE_MARKER) >= 0 || mainSource.indexOf(BUSINESS_MARKER) >= 0) {
    throw new Error("Built-in main subpackage still contains core bootstrap business code.");
  }

  return {
    settingsPath: settingsPath,
    coreGameJsPath: coreGameJsPath,
    mainGameJsPath: mainGameJsPath,
    coreBytes: fs.statSync(coreGameJsPath).size,
    mainBytes: fs.statSync(mainGameJsPath).size
  };
}

if (require.main === module) {
  var result = verifyWeChatCoreBundleBuild(process.argv[2]);
  console.log("Verified WeChat core subpackage: " + result.coreGameJsPath);
  console.log("Core script bytes: " + result.coreBytes);
  console.log("Main script bytes: " + result.mainBytes);
}

module.exports = {
  verifyWeChatCoreBundleBuild: verifyWeChatCoreBundleBuild
};
