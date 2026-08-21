"use strict";

var fs = require("fs");
var path = require("path");

var projectRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function createLocalStorage() {
  var values = {};
  return {
    get length() {
      return Object.keys(values).length;
    },
    key: function (index) {
      var keys = Object.keys(values);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem: function (key, value) {
      values[key] = String(value);
    }
  };
}

global.cc = {
  sys: {
    localStorage: createLocalStorage()
  }
};

var CurrentFrontierFailureStore = require(path.join(
  projectRoot,
  "assets/scripts/utils/CurrentFrontierFailureStore"
));
var CurrentFrontierFailureMethods = require(path.join(
  projectRoot,
  "assets/scripts/bootstrap/GameBootstrapCurrentFrontierFailureMethods"
));

function validateStoreContract() {
  var store = new CurrentFrontierFailureStore();
  var state = store.load(12);
  assert(state.frontierLevelId === 12, "Initial frontier level must match highest unlocked level.");
  assert(state.consecutiveFailureCount === 0, "Initial consecutive failure count must be zero.");

  state = store.recordLoss(state, 12);
  state = store.recordLoss(state, 12);
  store.save(state);
  assert(
    store.load(12).consecutiveFailureCount === 2,
    "Two consecutive frontier losses must persist locally."
  );

  state = store.recordWin(state, 12, 13);
  assert(state.frontierLevelId === 13, "Frontier win must advance persisted frontier level.");
  assert(state.consecutiveFailureCount === 0, "Frontier win must clear consecutive failure count.");
  store.save(state);
  var externallyAdvancedState = store.load(14);
  assert(
    externallyAdvancedState.frontierLevelId === 14 && externallyAdvancedState.consecutiveFailureCount === 0,
    "External frontier progress change must reset the local-only streak."
  );

  assert(
    CurrentFrontierFailureStore.STORAGE_KEY === "bubble_current_frontier_failure_v1",
    "Current frontier failure storage key changed unexpectedly."
  );
}

function validateLocalOnlyContract() {
  var cloudSource = read("assets/scripts/services/PlayerCloudProfileService.js");
  assert(
    cloudSource.indexOf(CurrentFrontierFailureStore.STORAGE_KEY) < 0,
    "Current frontier failure state must not be included in player cloud profile storage entries."
  );
}

function validateBootstrapDecisionContract() {
  var store = new CurrentFrontierFailureStore();
  var state = store.load(21);
  state = store.recordLoss(state, 21);
  state = store.recordLoss(state, 21);
  store.save(state);
  var showCount = 0;
  var host = Object.assign({}, CurrentFrontierFailureMethods, {
    currentFrontierFailureStore: store,
    currentFrontierFailureState: state,
    levelProgress: { highestUnlockedLevel: 21 },
    _currentRunContext: { mode: "campaign", levelId: 21 },
    _currentLevelId: 21,
    _currentAttemptTracksFrontierFailure: true,
    _pendingStartGamePreciseAimActivation: false,
    levelRenderer: {
      showAimingToolTips: function () {
        showCount += 1;
        return Promise.resolve(true);
      }
    }
  });

  assert(
    host._shouldShowCurrentFrontierAimingToolTips() === true,
    "Two frontier losses without carried precise aim must show AimingToolTips."
  );
  host._pendingStartGamePreciseAimActivation = true;
  assert(
    host._shouldShowCurrentFrontierAimingToolTips() === false,
    "Carried precise aim must suppress AimingToolTips."
  );
  host._pendingStartGamePreciseAimActivation = false;
  host._currentAttemptTracksFrontierFailure = false;
  assert(
    host._shouldShowCurrentFrontierAimingToolTips() === false,
    "A non-frontier campaign attempt must suppress AimingToolTips."
  );
  host._currentAttemptTracksFrontierFailure = true;
  host._currentRunContext.mode = "random_challenge";
  assert(
    host._shouldShowCurrentFrontierAimingToolTips() === false,
    "Random challenge attempts must suppress AimingToolTips."
  );
  host._currentRunContext.mode = "campaign";

  return host._showCurrentFrontierAimingToolTipsAfterCountdown().then(function (shown) {
    assert(shown === true, "Eligible AimingToolTips decision must wait for popup closure.");
    assert(showCount === 1, "Eligible AimingToolTips decision must open exactly one popup.");
  });
}

function validateCountdownAndCarryContract() {
  var methodsSource = read("assets/scripts/bootstrap/GameBootstrapCurrentFrontierFailureMethods.js");
  assert(
    methodsSource.indexOf("failureCount >= FAILURE_TIPS_THRESHOLD") >= 0,
    "AimingToolTips must require at least two consecutive failures."
  );
  assert(
    methodsSource.indexOf("this._pendingStartGamePreciseAimActivation") >= 0,
    "AimingToolTips must use the prepared precise-aim carry authority."
  );
  assert(
    methodsSource.indexOf("this._currentAttemptTracksFrontierFailure !== true") >= 0,
    "AimingToolTips must be restricted to the current frontier attempt."
  );

  var flowSource = read("assets/scripts/bootstrap/GameBootstrapRouteEditorFlowMethods.js");
  var countdownIndex = flowSource.indexOf("this._runGameEntryCountdown().then");
  var tipsIndex = flowSource.indexOf("this._showCurrentFrontierAimingToolTipsAfterCountdown()", countdownIndex);
  var interactionIndex = flowSource.indexOf("this.levelRenderer.setGameplayInteractionEnabled(true)", tipsIndex);
  assert(countdownIndex >= 0, "Campaign entry flow must run the gameplay countdown.");
  assert(tipsIndex > countdownIndex, "AimingToolTips decision must run after the gameplay countdown.");
  assert(
    interactionIndex > tipsIndex,
    "Gameplay interaction must remain disabled until AimingToolTips closes."
  );
}

function findNodeIndex(prefab, name, parentIndex) {
  for (var index = 0; index < prefab.length; index += 1) {
    var entry = prefab[index];
    if (!entry || entry.__type__ !== "cc.Node" || entry._name !== name) {
      continue;
    }
    if (parentIndex === null) {
      if (!entry._parent) {
        return index;
      }
      continue;
    }
    if (entry._parent && entry._parent.__id__ === parentIndex) {
      return index;
    }
  }
  return -1;
}

function nodeHasComponent(prefab, nodeIndex, componentType) {
  var node = prefab[nodeIndex];
  return node._components.some(function (reference) {
    var component = prefab[reference.__id__];
    return component && component.__type__ === componentType;
  });
}

function validatePrefabAndRendererContract() {
  var prefab = JSON.parse(read("assets/game/prefabs/game/AimingToolTips.prefab"));
  var rootIndex = findNodeIndex(prefab, "AimingToolTips", null);
  var maskIndex = findNodeIndex(prefab, "mask", rootIndex);
  var panelIndex = findNodeIndex(prefab, "Panel", rootIndex);
  var backgroundIndex = findNodeIndex(prefab, "bg", panelIndex);
  assert(rootIndex >= 0, "AimingToolTips prefab root is missing.");
  assert(maskIndex >= 0, "AimingToolTips/mask is missing.");
  assert(panelIndex >= 0, "AimingToolTips/Panel is missing.");
  assert(backgroundIndex >= 0, "AimingToolTips/Panel/bg is missing.");
  assert(nodeHasComponent(prefab, rootIndex, "cc.BlockInputEvents"), "AimingToolTips root must block input.");
  assert(nodeHasComponent(prefab, panelIndex, "cc.BlockInputEvents"), "AimingToolTips Panel must block input.");
  assert(nodeHasComponent(prefab, maskIndex, "cc.Sprite"), "AimingToolTips mask must use cc.Sprite.");
  assert(nodeHasComponent(prefab, backgroundIndex, "cc.Sprite"), "AimingToolTips bg must use cc.Sprite.");

  var rendererSource = read("gameplay-src/render/LevelRendererSceneModalPopupMethods.js");
  assert(
    rendererSource.indexOf("SpriteProxyLayerHelper.rebuildAutoProxyTree") >= 0 &&
      rendererSource.indexOf("AIMING_TOOL_TIPS_PROXY_ROOT_NAME") >= 0,
    "AimingToolTips must render through the Sprite proxy layer."
  );
  assert(
    rendererSource.indexOf("bindAimingToolTipsCloseNode(viewNode, closeHandler)") >= 0 &&
      rendererSource.indexOf("bindAimingToolTipsCloseNode(maskNode, closeHandler)") >= 0 &&
      rendererSource.indexOf("bindAimingToolTipsCloseNode(panelNode, closeHandler)") >= 0,
    "AimingToolTips must close from root, mask, and panel taps."
  );

  var resourceSource = read("gameplay-src/render/LevelRendererResourceMethods.js");
  assert(
    resourceSource.indexOf("PREFAB_PATHS.aimingToolTips") >= 0,
    "AimingToolTips prefab must be included in interaction warmup."
  );

  var generatedGameplaySource = read("assets/game/generated/lazy-gameplay-code.js");
  assert(
    generatedGameplaySource.indexOf("LevelRenderer.prototype.showAimingToolTips") >= 0 &&
      generatedGameplaySource.indexOf('aimingToolTips: "game/prefabs/game/AimingToolTips"') >= 0,
    "Generated gameplay code must contain the current AimingToolTips renderer contract."
  );
}

validateStoreContract();
validateLocalOnlyContract();
validateCountdownAndCarryContract();
validatePrefabAndRendererContract();
validateBootstrapDecisionContract().then(function () {
  console.log("Current frontier AimingToolTips validation passed.");
}).catch(function (error) {
  process.nextTick(function () {
    throw error;
  });
});
