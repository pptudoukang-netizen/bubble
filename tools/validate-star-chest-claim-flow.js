"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");

function loadModule(relativePath, dependencies, globals) {
  var absolutePath = path.join(ROOT, relativePath);
  var source = fs.readFileSync(absolutePath, "utf8");
  var sandbox = Object.assign({
    module: { exports: {} },
    exports: {},
    require: function (request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error("Unexpected dependency while loading " + relativePath + ": " + request);
      }
      return dependencies[request];
    },
    console: console,
    Promise: Promise,
    Date: Date,
    Number: Number,
    Array: Array,
    Object: Object,
    Math: Math,
    Error: Error
  }, globals);
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, { filename: absolutePath });
  return sandbox.module.exports;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRankingShared() {
  return {
    Logger: { error: function () {} },
    RankingViewController: function () {},
    ShopViewController: function () {},
    BuyViewController: function () {},
    PopupPanelAnimator: {},
    RANKING_VIEW_PREFAB_PATH: "ranking",
    SHOP_VIEW_PREFAB_PATH: "shop",
    BUY_VIEW_PREFAB_PATH: "buy",
    formatRewardItems: function (items) {
      return items.map(function (item) {
        return item.id + "x" + item.count;
      }).join(",");
    },
    showStatusAndTip: function (host, message) {
      host.tipMessages.push(message);
    },
    hideGameCircleWelfareViewNode: function () {},
    resolveStarChestFailMessage: function (reason) {
      return reason;
    }
  };
}

function createStarChestHost(methods, openableCount, openChest) {
  var host = Object.assign({}, methods, {
    isSelectingLevel: true,
    isRestarting: false,
    levelProgress: { starsByLevel: { "1": 3 } },
    starChestService: { openChest: openChest },
    awardGroups: null,
    statuses: [],
    tipMessages: [],
    telemetry: [],
    _getStarChestSummary: function () {
      return {
        enabled: true,
        availableStars: openableCount * 15,
        starsPerChest: 15,
        openableCount: openableCount
      };
    },
    _showAwardViewSequence: function (groups) {
      this.awardGroups = clone(groups);
      return Promise.resolve();
    },
    _trackTelemetry: function (eventName, payload) {
      this.telemetry.push({ eventName: eventName, payload: clone(payload) });
    },
    _setStatus: function (message) {
      this.statuses.push(message);
    },
    _playSfx: function () {},
    _hideSettingView: function () {},
    _hideRankingView: function () {},
    _hideSignInView: function () {},
    _hideDailyTaskView: function () {},
    _hideShopView: function () {},
    _hideInventoryView: function () {},
    _refreshPlayerResources: function () {},
    _refreshPlayerInventory: function () {},
    _updateLevelSelectTopStatus: function () {},
    _renderInventoryView: function () {}
  });
  return host;
}

async function validateStarChestBatchClaim() {
  var rankingMethods = loadModule(
    "assets/scripts/bootstrap/GameBootstrapRankingShopChestFlowMethods.js",
    {
      "./GameBootstrapUiFlowShared": createRankingShared(),
      "../utils/UiModalReleaseHelper": {}
    },
    { cc: {} }
  );
  var grantedRewards = [
    [{ id: "coin", count: 120 }],
    [{ id: "stamina", count: 1 }],
    [{ id: "blast_ball", count: 1 }]
  ];
  var openCallCount = 0;
  var host = createStarChestHost(rankingMethods, grantedRewards.length, function () {
    var rewardItems = grantedRewards[openCallCount];
    openCallCount += 1;
    return { accepted: true, rewardItems: clone(rewardItems) };
  });

  await host._openStarChest();
  assert.strictEqual(openCallCount, 3, "One star chest tap must claim every openable chest.");
  assert.deepStrictEqual(host.awardGroups, grantedRewards, "Award popup groups must preserve chest claim order.");
  assert.strictEqual(host.telemetry.length, 1, "Batch claim must emit one click event.");

  var rejectedOpenCalls = 0;
  var rejectedHost = createStarChestHost(rankingMethods, 0, function () {
    rejectedOpenCalls += 1;
    return { accepted: false, reason: "STAR_CHEST_NOT_ENOUGH_STARS" };
  });
  rejectedHost._openStarChest();
  assert.strictEqual(rejectedOpenCalls, 1, "Non-claimable tap must retain the authoritative rejection path.");
  assert.strictEqual(rejectedHost.awardGroups, null, "Rejected star chest claim must not open an award sequence.");
  assert.deepStrictEqual(rejectedHost.tipMessages, ["STAR_CHEST_NOT_ENOUGH_STARS"]);

  var partialCallCount = 0;
  var inconsistentHost = createStarChestHost(rankingMethods, 2, function () {
    partialCallCount += 1;
    if (partialCallCount === 2) {
      return { accepted: false, reason: "STAR_CHEST_NOT_ENOUGH_STARS" };
    }
    return { accepted: true, rewardItems: [{ id: "coin", count: 120 }] };
  });
  assert.throws(function () {
    inconsistentHost._openStarChest();
  }, /Star chest batch open failed at index 1/);
}

function createAwardShared() {
  return {
    Logger: { error: function () {}, warn: function () {} },
    BundleLoader: {},
    SIGN_IN_PREFAB_CANDIDATES: [],
    SIGN_IN_BUTTON_SPRITE_PATHS: {},
    SIGN_IN_DAY_BG_SPRITE_PATHS: {},
    SIGN_IN_ITEM_ICON_PATHS: {},
    SIGN_IN_DAY_ITEM_ICON_PATHS: {},
    SIGN_IN_ITEM_DISPLAY_NAMES: {},
    AWARD_VIEW_PREFAB_PATH: "award",
    AWARD_ITEM_ICON_PATHS: {},
    AWARD_ITEM_DISPLAY_NAMES: {},
    hasOwn: Object.prototype.hasOwnProperty,
    normalizeAwardPopupItems: function (items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Reward items are required.");
      }
      return clone(items);
    },
    PopupPanelAnimator: {}
  };
}

function createAwardSequenceHost(methods, showAward) {
  return Object.assign({}, methods, {
    _awardViewSequence: null,
    _awardViewNode: null,
    _awardViewPrefab: null,
    _awardItemIconSpriteFrameCache: {},
    _gameCircleWelfareViewNode: null,
    _showAwardViewForRewardItems: showAward
  });
}

async function validateAwardPopupSequence() {
  var awardMethods = loadModule(
    "assets/scripts/bootstrap/GameBootstrapSignInAwardFlowMethods.js",
    {
      "./GameBootstrapUiFlowShared": createAwardShared(),
      "../utils/UiModalReleaseHelper": {
        releaseCachedModal: function (host, options) {
          host[options.nodeKey] = null;
          host[options.prefabKey] = null;
          host[options.spriteFrameCacheKey] = {};
        }
      },
      "../utils/SpriteProxyLayerHelper": {}
    },
    {
      cc: {
        color: function (r, g, b, a) {
          return { r: r, g: g, b: b, a: a };
        },
        isValid: function (node) {
          return Boolean(node && node.isValid);
        }
      }
    }
  );
  var groups = [
    [{ id: "coin", count: 120 }],
    [{ id: "stamina", count: 1 }],
    [{ id: "blast_ball", count: 1 }]
  ];
  var shownGroups = [];
  var host = createAwardSequenceHost(awardMethods, function (items) {
    shownGroups.push(clone(items));
    return Promise.resolve();
  });
  var sequencePromise = host._showAwardViewSequence(groups);
  assert.deepStrictEqual(shownGroups, [groups[0]], "Only the first reward popup may show initially.");
  assert.throws(function () {
    host._showAwardViewSequence(groups);
  }, /AwardView sequence is already active/);

  host._hideAwardView(true);
  assert.deepStrictEqual(shownGroups, [groups[0], groups[1]], "Closing the first popup must show the second.");
  host._hideAwardView(true);
  assert.deepStrictEqual(shownGroups, groups, "Closing each popup must preserve reward order.");
  host._hideAwardView(true);
  await sequencePromise;
  assert.strictEqual(host._awardViewSequence, null, "AwardView sequence must clear after the final popup.");

  var interruptedHost = createAwardSequenceHost(awardMethods, function () {
    return Promise.resolve();
  });
  var interruptedPromise = interruptedHost._showAwardViewSequence([groups[0], groups[1]]);
  interruptedHost._hideAwardView();
  await assert.rejects(interruptedPromise, /interrupted before completion/);
  assert.strictEqual(interruptedHost._awardViewSequence, null, "Programmatic close must cancel the active sequence.");

  var renderError = new Error("award render failed");
  var failingHost = createAwardSequenceHost(awardMethods, function () {
    return Promise.reject(renderError);
  });
  await assert.rejects(
    failingHost._showAwardViewSequence([groups[0]]),
    /award render failed/
  );
  assert.strictEqual(failingHost._awardViewSequence, null, "Failed AwardView sequence must clear its active state.");
}

function validateAwardSequenceWiring() {
  var registrySource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapLazyRegistry.js"),
    "utf8"
  );
  var bootstrapSource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrap.js"),
    "utf8"
  );
  var compositionSource = fs.readFileSync(
    path.join(ROOT, "assets/scripts/bootstrap/GameBootstrapCompositionMethods.js"),
    "utf8"
  );
  ["_showAwardViewSequence", "_showNextAwardViewInSequence"].forEach(function (methodName) {
    assert.ok(
      registrySource.indexOf('"' + methodName + '"') >= 0,
      "AwardView sequence method must be registered for lazy loading: " + methodName
    );
    assert.ok(
      bootstrapSource.indexOf(methodName + ": GameBootstrapUiFlowMethods." + methodName) >= 0,
      "GameBootstrap must expose AwardView sequence method: " + methodName
    );
  });
  assert.ok(
    compositionSource.indexOf("this._awardViewSequence = null;") >= 0,
    "GameBootstrap composition must initialize AwardView sequence state."
  );
}

async function main() {
  await validateStarChestBatchClaim();
  await validateAwardPopupSequence();
  validateAwardSequenceWiring();
  console.log("Star chest claim flow validation passed.");
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
