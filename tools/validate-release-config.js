"use strict";

var fs = require("fs");
var path = require("path");

var RuntimeModeConfig = require("../assets/scripts/config/RuntimeModeConfig");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var GAME_SCENE_PATH = path.join(PROJECT_ROOT, "assets/scens/game.fire");
var GAME_BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrap.js");

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

function main() {
  assertRuntimeModeConfig();
  assertSceneConfig();
  assertBootstrapSource();
  console.log("Release config validation passed.");
}

main();
