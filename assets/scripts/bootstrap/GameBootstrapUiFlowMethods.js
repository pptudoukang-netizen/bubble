"use strict";

var flowModules = [
  require("./GameBootstrapStatusResourceFlowMethods"),
  require("./GameBootstrapSignInAwardFlowMethods"),
  require("./GameBootstrapRankingShopChestFlowMethods"),
  require("./GameBootstrapGameCircleFlowMethods"),
  require("./GameBootstrapSettingsFlowMethods"),
  require("./GameBootstrapRouteEditorFlowMethods"),
  require("./GameBootstrapLevelSelectFlowMethods")
];
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
flowModules.forEach(function (flowModule, index) {
  mergeMethods(methods, flowModule, index);
});

module.exports = methods;
