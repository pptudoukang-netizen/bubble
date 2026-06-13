"use strict";

var createLazyModuleMethods = require("./GameBootstrapLazyModule").createLazyModuleMethods;
var LazyRegistry = require("./GameBootstrapLazyRegistry");

var startupFlowModules = [
  require("./GameBootstrapNetworkLoadingFlowMethods"),
  require("./GameBootstrapShareFlowMethods"),
  require("./GameBootstrapStatusResourceFlowMethods"),
  require("./GameBootstrapLevelSelectFlowMethods"),
  require("./GameBootstrapRouteEditorFlowMethods")
];

var deferredLazyMethods = Object.assign(
  {},
  createLazyModuleMethods("./GameBootstrapSignInAwardFlowMethods", LazyRegistry.SIGN_IN_AWARD_FLOW_METHODS),
  createLazyModuleMethods("./GameBootstrapDailyTaskFlowMethods", LazyRegistry.DAILY_TASK_FLOW_METHODS),
  createLazyModuleMethods("./GameBootstrapRankingShopChestFlowMethods", LazyRegistry.RANKING_SHOP_CHEST_FLOW_METHODS),
  createLazyModuleMethods("./GameBootstrapGameCircleFlowMethods", LazyRegistry.GAME_CIRCLE_FLOW_METHODS),
  createLazyModuleMethods("./GameBootstrapSettingsFlowMethods", LazyRegistry.SETTINGS_FLOW_METHODS)
);

var hasOwn = Object.prototype.hasOwnProperty;

function mergeMethods(target, source, moduleIndex) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("GameBootstrap UI flow module must export an object at index " + moduleIndex + ".");
  }

  Object.keys(source).forEach(function (methodName) {
    if (hasOwn.call(target, methodName)) {
      throw new Error("Duplicated GameBootstrap UI flow method: " + methodName);
    }
    target[methodName] = source[methodName];
  });
}

var methods = {};
startupFlowModules.forEach(function (flowModule, index) {
  mergeMethods(methods, flowModule, index);
});
mergeMethods(methods, deferredLazyMethods, startupFlowModules.length);

module.exports = methods;
