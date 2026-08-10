"use strict";

var bootstrapModuleLoaders = {
  "./GameBootstrapSpiritHallMethods": function () {
    return require("./GameBootstrapSpiritHallMethods");
  },
  "./GameBootstrapSpiritShopMethods": function () {
    return require("./GameBootstrapSpiritShopMethods");
  },
  "./GameBootstrapSignInAwardFlowMethods": function () {
    return require("./GameBootstrapSignInAwardFlowMethods");
  },
  "./GameBootstrapDailyTaskFlowMethods": function () {
    return require("./GameBootstrapDailyTaskFlowMethods");
  },
  "./GameBootstrapRankingShopChestFlowMethods": function () {
    return require("./GameBootstrapRankingShopChestFlowMethods");
  },
  "./GameBootstrapGameCircleFlowMethods": function () {
    return require("./GameBootstrapGameCircleFlowMethods");
  },
  "./GameBootstrapSettingsFlowMethods": function () {
    return require("./GameBootstrapSettingsFlowMethods");
  },
  "./GameBootstrapPowerupInventoryMethods": function () {
    return require("./GameBootstrapPowerupInventoryMethods");
  },
  "./GameBootstrapTelemetryMethods": function () {
    return require("./GameBootstrapTelemetryMethods");
  },
  "./GameBootstrapAdRewardMethods": function () {
    return require("./GameBootstrapAdRewardMethods");
  },
  "./GameBootstrapGameplayMemoryMethods": function () {
    return require("./GameBootstrapGameplayMemoryMethods");
  },
  "./GameBootstrapAssetStatsMethods": function () {
    return require("./GameBootstrapAssetStatsMethods");
  }
};

function loadBootstrapModule(modulePath) {
  var loader = bootstrapModuleLoaders[modulePath];
  if (typeof loader !== "function") {
    throw new Error("Unsupported lazy bootstrap module path: " + modulePath);
  }
  return loader();
}

function createLazyBootstrapMethod(modulePath, methodName) {
  if (typeof modulePath !== "string" || modulePath.trim().length === 0) {
    throw new Error("Lazy bootstrap method requires modulePath.");
  }
  if (typeof methodName !== "string" || methodName.trim().length === 0) {
    throw new Error("Lazy bootstrap method requires methodName.");
  }

  var moduleExports = null;
  return function lazyBootstrapMethod() {
    if (!moduleExports) {
      moduleExports = loadBootstrapModule(modulePath);
    }
    if (!moduleExports || typeof moduleExports[methodName] !== "function") {
      throw new Error("Lazy bootstrap method `" + methodName + "` is missing in " + modulePath + ".");
    }
    return moduleExports[methodName].apply(this, arguments);
  };
}

function createLazyModuleMethods(modulePath, methodNames) {
  if (!Array.isArray(methodNames) || methodNames.length === 0) {
    throw new Error("Lazy bootstrap module requires non-empty methodNames: " + modulePath);
  }

  var methods = {};
  methodNames.forEach(function (methodName) {
    methods[methodName] = createLazyBootstrapMethod(modulePath, methodName);
  });
  return methods;
}

module.exports = {
  createLazyBootstrapMethod: createLazyBootstrapMethod,
  createLazyModuleMethods: createLazyModuleMethods
};
