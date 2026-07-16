"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var ASSETS_ROOT = path.join(PROJECT_ROOT, "assets");
var BOOT_SCENE_PATH = path.join(ASSETS_ROOT, "scens/boot.fire");
var GAME_SCENE_PATH = path.join(ASSETS_ROOT, "scens/game.fire");
var BOOT_META_PATH = BOOT_SCENE_PATH + ".meta";
var BOOT_LOADER_PATH = path.join(ASSETS_ROOT, "boot/BootLoader.js");
var BOOT_LOADER_META_PATH = BOOT_LOADER_PATH + ".meta";
var CORE_MARKER_PATH = path.join(ASSETS_ROOT, "scripts/bootstrap/CoreBundleReady.js");
var SCRIPTS_META_PATH = path.join(ASSETS_ROOT, "scripts.meta");
var BUILDER_SETTINGS_PATH = path.join(PROJECT_ROOT, "settings/builder.json");
var PROJECT_SETTINGS_PATH = path.join(PROJECT_ROOT, "settings/project.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function findEntries(sceneData, predicate) {
  return sceneData.filter(function (entry) {
    return entry && predicate(entry);
  });
}

function assertSingleSceneNode(sceneData, nodeName) {
  var nodes = findEntries(sceneData, function (entry) {
    return entry.__type__ === "cc.Node" && entry._name === nodeName;
  });
  if (nodes.length !== 1) {
    throw new Error("boot.fire must contain exactly one node named `" + nodeName + "`.");
  }
}

function assertBootScene() {
  var bootScene = readJson(BOOT_SCENE_PATH);
  if (!Array.isArray(bootScene)) {
    throw new Error("boot.fire root must be an array.");
  }
  ["Canvas", "Main Camera", "LoadingView", "ProgressTrack"].forEach(function (nodeName) {
    assertSingleSceneNode(bootScene, nodeName);
  });

  var customComponents = findEntries(bootScene, function (entry) {
    return typeof entry.__type__ === "string" && entry.__type__.indexOf("cc.") !== 0;
  });
  if (customComponents.length !== 0) {
    throw new Error("boot.fire must not reference business script components.");
  }

  var gameScene = readJson(GAME_SCENE_PATH);
  var bootstrapComponents = findEntries(gameScene, function (entry) {
    return Object.prototype.hasOwnProperty.call(entry, "initialLevelId") &&
      Object.prototype.hasOwnProperty.call(entry, "rewardedVideoAdUnitId");
  });
  if (bootstrapComponents.length !== 1) {
    throw new Error("game.fire must remain the single full GameBootstrap scene.");
  }
}

function assertStartSceneSettings() {
  var bootMeta = readJson(BOOT_META_PATH);
  var builderSettings = readJson(BUILDER_SETTINGS_PATH);
  var projectSettings = readJson(PROJECT_SETTINGS_PATH);
  if (builderSettings.startScene !== bootMeta.uuid) {
    throw new Error("settings/builder.json startScene must point to boot.fire.");
  }
  if (projectSettings["start-scene"] !== bootMeta.uuid) {
    throw new Error("settings/project.json start-scene must point to boot.fire.");
  }
}

function assertCoreBundleMeta() {
  var scriptsMeta = readJson(SCRIPTS_META_PATH);
  if (scriptsMeta.isBundle !== true || scriptsMeta.bundleName !== "core") {
    throw new Error("assets/scripts must be the `core` asset bundle.");
  }
  if (scriptsMeta.priority !== 7) {
    throw new Error("core bundle priority must be 7.");
  }
  if (!scriptsMeta.compressionType || scriptsMeta.compressionType.wechatgame !== "subpackage") {
    throw new Error("core bundle must build as a WeChat subpackage.");
  }
}

function assertBootLoader() {
  var loaderMeta = readJson(BOOT_LOADER_META_PATH);
  if (loaderMeta.isPlugin !== true || loaderMeta.loadPluginInEditor !== false) {
    throw new Error("BootLoader must be a runtime-only plugin script.");
  }
  var loaderSource = readText(BOOT_LOADER_PATH);
  [
    'var BOOT_SCENE_NAME = "boot"',
    'var CORE_BUNDLE_NAME = "core"',
    'wx.loadSubpackage',
    'cc.assetManager.loadBundle',
    'cc.director.preloadScene',
    'cc.Director.EVENT_AFTER_DRAW',
    '__BUBBLE_CORE_CODE_LOADED__',
    'Math.max(progressBar.progress, next)',
    'event.totalBytesWritten',
    'event.totalBytesExpectedToWrite',
    'if (hasWrittenBytes || hasExpectedBytes)',
    'resolveSubpackageProgress01(event)'
  ].forEach(function (requiredText) {
    if (loaderSource.indexOf(requiredText) < 0) {
      throw new Error("BootLoader startup step missing: " + requiredText);
    }
  });
  if (/\brequire\s*\(/.test(loaderSource)) {
    throw new Error("BootLoader must not synchronously require core business modules.");
  }

  var markerSource = readText(CORE_MARKER_PATH);
  if (markerSource.indexOf("__BUBBLE_CORE_CODE_LOADED__ = true") < 0) {
    throw new Error("Core bundle execution marker is missing.");
  }
}

function main() {
  assertBootScene();
  assertStartSceneSettings();
  assertCoreBundleMeta();
  assertBootLoader();
  console.log("Boot startup validation passed.");
}

main();
