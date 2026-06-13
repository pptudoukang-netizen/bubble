"use strict";

var RuntimeModeConfig = {
  mode: "release",
  enableInspectorOverrides: false,
  enableSpecialEntitiesTestMode: false,
  showDebugOverlay: false,
  showGridTestLayer: false,
  showDropTestButton: false,
  enableLevelEditor: false,
  enableMockRewardedAdOnUnsupported: false,
  exposeDebugHandle: false
};

function assertBooleanField(config, key) {
  if (typeof config[key] !== "boolean") {
    throw new Error("RuntimeModeConfig." + key + " must be boolean.");
  }
}

RuntimeModeConfig.validate = function () {
  if (this.mode !== "dev" && this.mode !== "release") {
    throw new Error("RuntimeModeConfig.mode must be dev or release.");
  }

  [
    "enableInspectorOverrides",
    "enableSpecialEntitiesTestMode",
    "showDebugOverlay",
    "showGridTestLayer",
    "showDropTestButton",
    "enableLevelEditor",
    "enableMockRewardedAdOnUnsupported",
    "exposeDebugHandle"
  ].forEach(function (key) {
    assertBooleanField(RuntimeModeConfig, key);
  });

  if (this.mode === "release") {
    [
      "enableInspectorOverrides",
      "enableSpecialEntitiesTestMode",
      "showDebugOverlay",
      "showGridTestLayer",
      "showDropTestButton",
      "enableLevelEditor",
      "enableMockRewardedAdOnUnsupported",
      "exposeDebugHandle"
    ].forEach(function (key) {
      if (RuntimeModeConfig[key] !== false) {
        throw new Error("RuntimeModeConfig." + key + " must be false in release mode.");
      }
    });
  }

  return true;
};

RuntimeModeConfig.isRelease = function () {
  return this.mode === "release";
};

RuntimeModeConfig.validate();

module.exports = RuntimeModeConfig;
