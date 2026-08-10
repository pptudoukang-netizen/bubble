"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var PLAYER_RESOURCE_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/PlayerResourceStore.js");
var LEVEL_PROGRESS_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/LevelProgressStore.js");
var STRICT_STORAGE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/StrictStorage.js");
var LEVEL_ATTEMPT_STATS_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/LevelAttemptStatsStore.js");
var ASSIST_SPIRIT_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/AssistSpiritStore.js");
var SPIRIT_SHOP_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/SpiritShopStore.js");
var PLAYER_CLOUD_PROFILE_SERVICE_PATH = path.join(PROJECT_ROOT, "assets/scripts/services/PlayerCloudProfileService.js");
var BOOTSTRAP_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrap.js");
var BOOTSTRAP_COMPOSITION_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapCompositionMethods.js");
var STATUS_RESOURCE_FLOW_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapStatusResourceFlowMethods.js");
var LEVEL_SELECT_FLOW_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js");
var TELEMETRY_METHODS_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapTelemetryMethods.js");

function createMemoryStorage() {
  var data = {};
  var keys = [];
  return {
    get length() {
      return keys.length;
    },
    key: function (index) {
      return keys[index];
    },
    getItem: function (key) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        return null;
      }
      return data[key];
    },
    setItem: function (key, value) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        keys.push(key);
      }
      data[key] = String(value);
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadTelemetryMethodsForTest() {
  var source = readText(TELEMETRY_METHODS_PATH);
  var module = {
    exports: {}
  };
  var sandbox = {
    module: module,
    exports: module.exports,
    require: function (request) {
      if (request === "./GameBootstrapShared") {
        return {
          AdRewardCatalog: {
            resolveLoseRewardEntry: function () {
              return null;
            }
          }
        };
      }
      throw new Error("Unexpected telemetry validation dependency: " + request);
    }
  };
  vm.runInNewContext(source, sandbox, {
    filename: TELEMETRY_METHODS_PATH
  });
  return module.exports;
}

function toDateKey(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function createStore() {
  var PlayerResourceStore = require(PLAYER_RESOURCE_STORE_PATH);
  return new PlayerResourceStore({
    dailyStamina: 20
  });
}

function createAttempt(attemptId, levelId, attemptIndexForLevel, result) {
  return {
    attemptId: attemptId,
    levelId: levelId,
    levelCode: "L" + String(levelId),
    runMode: "normal",
    startedAt: 1000,
    endedAt: result ? 2000 : 0,
    attemptIndexForLevel: attemptIndexForLevel,
    startState: "aiming",
    initialShots: 20,
    shotsUsed: result ? 12 : 0,
    shotsRemaining: result ? 8 : 20,
    result: result,
    failReason: null,
    quitReason: null,
    powerupsUsed: {},
    reviveUsed: false,
    reviveCount: 0
  };
}

function loadStatusResourceFlowMethodsForTest() {
  var source = readText(STATUS_RESOURCE_FLOW_PATH);
  var module = {
    exports: {}
  };
  var sandbox = {
    module: module,
    exports: module.exports,
    require: function (request) {
      if (request === "./GameBootstrapUiFlowShared") {
        return {
          DebugFlags: {
            get: function () {
              return false;
            }
          },
          Logger: {
            info: function () {},
            warn: function () {},
            error: function () {}
          },
          LevelSelectView: {
            updateDailyChallengeAttemptCount: function () {}
          }
        };
      }
      if (request === "../utils/LevelSelectMemoryDiagnostics") {
        return {
          increment: function () {}
        };
      }
      if (request === "../config/LevelPackManifest") {
        return {
          TOTAL_LEVEL_COUNT: 1000
        };
      }
      throw new Error("Unexpected require in stamina flow validation: " + request);
    },
    Date: Date,
    JSON: JSON,
    Math: Math,
    Number: Number,
    Object: Object,
    String: String,
    Array: Array,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  vm.runInNewContext(source, sandbox, {
    filename: STATUS_RESOURCE_FLOW_PATH
  });
  return module.exports;
}

function loadLevelSelectFlowMethodsForTest() {
  var source = readText(LEVEL_SELECT_FLOW_PATH);
  var module = {
    exports: {}
  };
  var sandbox = {
    module: module,
    exports: module.exports,
    require: function (request) {
      if (request === "./GameBootstrapUiFlowShared") {
        return {
          DebugFlags: {
            get: function () {
              return false;
            }
          },
          Logger: {
            info: function () {},
            warn: function () {},
            error: function () {}
          },
          BundleLoader: {},
          LevelSelectPolicy: {},
          LevelSelectView: {},
          StarRatingPolicy: {},
          hideGameCircleWelfareViewNode: function () {}
        };
      }
      if (request === "./GameBootstrapShared") {
        return {
          buildBoardOcclusionStartContext: function () {
            return {};
          }
        };
      }
      if (request === "./LevelSelectFloatingMap") {
        return {};
      }
      if (request === "../utils/LevelSelectMemoryDiagnostics") {
        return {
          increment: function () {}
        };
      }
      if (request === "../config/RandomChallengeRules") {
        return {
          MODE: "random_challenge"
        };
      }
      if (request === "../config/AssistSpiritRescueConfig") {
        return {
          findSpiritIdByLevelId: function () {
            return null;
          },
          requireSpiritIdByLevelId: function () {
            throw new Error("Stamina validation must not resolve a rescue spirit.");
          }
        };
      }
      if (request === "../config/LocalEditedLevelStore") {
        return function LocalEditedLevelStore() {};
      }
      if (request === "../editor/MapEditorLevelPicker") {
        return {};
      }
      throw new Error("Unexpected require in level select flow validation: " + request);
    },
    Date: Date,
    JSON: JSON,
    Math: Math,
    Number: Number,
    Object: Object,
    String: String,
    Array: Array
  };
  vm.runInNewContext(source, sandbox, {
    filename: LEVEL_SELECT_FLOW_PATH
  });
  return module.exports;
}

function assertSourceConfig() {
  var bootstrapSource = readText(BOOTSTRAP_PATH);
  var compositionSource = readText(BOOTSTRAP_COMPOSITION_PATH);
  var statusSource = readText(STATUS_RESOURCE_FLOW_PATH);

  assert(compositionSource.indexOf("dailyStamina: 20") >= 0, "GameBootstrap must initialize dailyStamina to 20.");
  assert(statusSource.indexOf("var STAMINA_NATURAL_RECOVERY_MAX = 20;") >= 0, "Natural stamina recovery max must be 20.");
  assert(
    bootstrapSource.indexOf("_grantFirstAttemptClearStaminaReward: GameBootstrapUiFlowMethods._grantFirstAttemptClearStaminaReward") >= 0,
    "GameBootstrap must mount first-attempt stamina reward grant."
  );
}

function assertInitialResources() {
  var store = createStore();
  var resources = store.load(new Date("2026-05-25T08:00:00"));

  assert(resources.version === 2, "Initial resources version must be 2.");
  assert(resources.stamina === 20, "New player initial stamina must be 20.");
  assert(resources.coins === 0, "New player initial coins must be 0.");
  assert(resources.gems === 200, "New player initial gems must be 200.");
  assert(resources.lastDailyResetDate === "2026-05-25", "Initial resources must use current day key.");
}

function assertDailyBaselineRefill() {
  var store = createStore();
  var resources = {
    version: 1,
    stamina: 7,
    coins: 300,
    lastDailyResetDate: "2026-05-24"
  };
  var reset = store.applyDailyReset(resources, new Date("2026-05-25T09:00:00"));

  assert(reset.stamina === 20, "Daily reset must refill stamina below 20 to 20.");
  assert(reset.coins === 300, "Daily reset must preserve coins.");
  assert(reset.lastDailyResetDate === "2026-05-25", "Daily reset must update lastDailyResetDate.");
}

function assertDailyBaselineDoesNotOverwriteSurplus() {
  var store = createStore();
  var resources = {
    version: 1,
    stamina: 25,
    coins: 120,
    lastDailyResetDate: "2026-05-24"
  };
  var reset = store.applyDailyReset(resources, new Date("2026-05-25T09:00:00"));

  assert(reset.stamina === 25, "Daily reset must not overwrite stamina above 20.");
  assert(reset.coins === 120, "Daily reset must preserve coins for surplus stamina.");
  assert(reset.lastDailyResetDate === "2026-05-25", "Daily reset must update date for surplus stamina.");
}

function assertSameDayDoesNotRefill() {
  var store = createStore();
  var resources = {
    version: 1,
    stamina: 3,
    coins: 0,
    lastDailyResetDate: "2026-05-25"
  };
  var reset = store.applyDailyReset(resources, new Date("2026-05-25T18:00:00"));

  assert(reset.stamina === 3, "Same-day refresh must not apply daily baseline again.");
  assert(reset.lastDailyResetDate === "2026-05-25", "Same-day refresh must preserve date.");
}

function assertConsumeRules() {
  var store = createStore();
  var todayKey = toDateKey(new Date());
  var accepted = store.consumeStamina({
    version: 1,
    stamina: 1,
    coins: 0,
    lastDailyResetDate: todayKey
  }, 1);
  assert(accepted.accepted === true, "consumeStamina must accept when stamina is enough.");
  assert(accepted.resources.stamina === 0, "consumeStamina must deduct exactly the requested amount.");

  var rejected = store.consumeStamina({
    version: 1,
    stamina: 0,
    coins: 0,
    lastDailyResetDate: todayKey
  }, 1);
  assert(rejected.accepted === false, "consumeStamina must reject when stamina is insufficient.");
  assert(rejected.resources.stamina === 0, "consumeStamina must not make stamina negative.");
}

function createFirstAttemptHost(methods, stamina, attemptIndexForLevel, completed) {
  var store = createStore();
  var todayKey = toDateKey(new Date());
  var dailyTaskEvents = [];
  var safeAttemptIndexForLevel = Math.max(1, Math.floor(Number(attemptIndexForLevel) || 1));
  var host = {
    unlockAllLevelsForTest: false,
    _currentLevelId: 1,
    _currentLevelEnteredByTestUnlock: false,
    _currentAttemptId: "attempt_validation",
    _currentAttemptLevelId: 1,
    _currentAttemptIndexForLevel: safeAttemptIndexForLevel,
    levelProgress: {
      version: 2,
      highestUnlockedLevel: 1,
      selectedLevelId: 1,
      completedLevels: completed ? { "1": true } : {},
      starsByLevel: {},
      bestScoresByLevel: {}
    },
    levelAttemptStats: {
      version: 1,
      totalAttemptCount: safeAttemptIndexForLevel,
      attemptCountByLevel: { "1": safeAttemptIndexForLevel },
      activeAttempt: null,
      lastAttempt: null,
      lastAttemptByLevel: {},
      recentEvents: []
    },
    playerResources: {
      version: 1,
      stamina: stamina,
      coins: 0,
      lastDailyResetDate: todayKey
    },
    playerResourceStore: store,
    _getDailyTaskEvents: function () {
      return dailyTaskEvents.slice();
    }
  };
  Object.keys(methods).forEach(function (key) {
    host[key] = methods[key];
  });
  host._refreshPlayerResources = function () {
    return this.playerResources;
  };
  host._markStaminaRecoveryBaseline = function () {};
  host._recordDailyTaskEvent = function (eventName, payload) {
    dailyTaskEvents.push({
      eventName: eventName,
      payload: payload
    });
  };
  host._updateLevelSelectTopStatus = function () {};
  return host;
}

function assertFirstAttemptStaminaRewardRules() {
  var methods = loadStatusResourceFlowMethodsForTest();

  var firstWinHost = createFirstAttemptHost(methods, 3, 1, false);
  assert(firstWinHost._consumeStaminaForLevelEntry() === true, "First level attempt with stamina must enter.");
  assert(firstWinHost.playerResources.stamina === 2, "First level attempt must deduct stamina on entry.");
  assert(firstWinHost._getDailyTaskEvents().length === 1, "First level attempt must record spend_stamina on entry.");
  assert(firstWinHost._getDailyTaskEvents()[0].payload.reason === "level_entry", "First level attempt spend reason must remain level_entry.");
  var firstWinRewardItems = firstWinHost._grantFirstAttemptClearStaminaReward(true);
  assert(firstWinRewardItems.length === 1, "First-attempt one-pass win must grant one stamina reward item.");
  assert(firstWinRewardItems[0].id === "stamina", "First-attempt one-pass reward item must be stamina.");
  assert(firstWinRewardItems[0].count === 1, "First-attempt one-pass reward item count must be 1.");
  assert(firstWinHost.playerResources.stamina === 3, "First-attempt one-pass win must have zero net stamina cost.");
  assert(firstWinHost._getDailyTaskEvents().length === 1, "First-attempt one-pass win must preserve spend_stamina task progress.");

  var repeatHost = createFirstAttemptHost(methods, 3, 2, false);
  assert(repeatHost._consumeStaminaForLevelEntry() === true, "Repeat attempt with stamina must enter.");
  assert(repeatHost.playerResources.stamina === 2, "Repeat attempt must deduct stamina immediately.");
  var repeatRewardItems = repeatHost._grantFirstAttemptClearStaminaReward(true);
  assert(repeatRewardItems.length === 0, "Repeat attempt clear must not grant first-attempt stamina reward.");
  assert(repeatHost.playerResources.stamina === 2, "Repeat attempt clear must keep stamina deducted.");

  var completedHost = createFirstAttemptHost(methods, 3, 1, true);
  assert(completedHost._consumeStaminaForLevelEntry() === true, "Completed level replay with stamina must enter.");
  assert(completedHost.playerResources.stamina === 2, "Completed level replay must deduct stamina immediately.");
  var completedRewardItems = completedHost._grantFirstAttemptClearStaminaReward(false);
  assert(completedRewardItems.length === 0, "Completed level replay must not grant first-attempt stamina reward.");
  assert(completedHost.playerResources.stamina === 2, "Completed level replay must keep stamina deducted.");
}

function assertFinalCampaignLevelNextAction() {
  var methods = loadStatusResourceFlowMethodsForTest();
  var terminalRoute = null;
  methods._onNextLevelTap.call({
    currentLevelConfig: {
      level: {
        levelId: 1000
      }
    },
    isRestarting: false,
    _currentRunContext: null,
    _playSfx: function () {},
    _showLevelSelectView: function (options) {
      terminalRoute = options;
    }
  });
  assert(terminalRoute !== null, "Final campaign level must return to level select.");
  assert(terminalRoute.targetLevelId === 1000, "Final campaign level must keep focus on level 1000.");
  assert(
    !Object.prototype.hasOwnProperty.call(terminalRoute, "prepareLevelId"),
    "Final campaign level must not prepare a nonexistent next level."
  );
}

function assertFinalCampaignLevelProgressBoundary() {
  var LevelProgressStore = require(LEVEL_PROGRESS_STORE_PATH);
  var store = new LevelProgressStore();
  cc.sys.localStorage.setItem("bubble_level_progress_v1", JSON.stringify({
    version: 2,
    highestUnlockedLevel: 1001,
    selectedLevelId: 1000,
    completedLevels: {
      "1000": true
    },
    starsByLevel: {
      "1000": 3
    },
    bestScoresByLevel: {
      "1000": 12345
    }
  }));

  var loaded = store.load();
  assert(loaded.highestUnlockedLevel === 1000, "Legacy terminal progress must normalize highest unlocked to 1000.");
  assert(
    JSON.parse(cc.sys.localStorage.getItem("bubble_level_progress_v1")).highestUnlockedLevel === 1000,
    "Legacy terminal progress normalization must be persisted."
  );

  var completed = store.recordCompletion(loaded, 1000, 3, 13000);
  assert(completed.highestUnlockedLevel === 1000, "Completing level 1000 must not unlock level 1001.");
  assert(completed.selectedLevelId === 1000, "Completing level 1000 must keep selected level at 1000.");
}

function assertWinRewardStaminaItemsMergeForDisplay() {
  var methods = loadLevelSelectFlowMethodsForTest();
  var snapshot = {
    state: "won",
    winStats: {
      collectionRewardCompleted: false,
      totalScore: 100
    }
  };
  var host = {
    _lastRuntimeState: "aiming",
    _currentRunContext: null,
    _currentLevelId: 8,
    _currentLevelEnteredByTestUnlock: false,
    _syncCollectedSkillPowerupsToInventory: function () {},
    _playSfx: function () {},
    _isLevelCompleted: function () {
      return false;
    },
    _recordCurrentLevelWin: function () {},
    _grantCurrentLevelClearRewardItems: function (isFirstCompletion, collectionRewardCompleted) {
      assert(isFirstCompletion === true, "Win reward merge validation must run as first completion.");
      assert(collectionRewardCompleted === false, "Win reward merge validation must keep collection bonus disabled.");
      return [{
        id: "coin",
        count: 10
      }, {
        id: "stamina",
        count: 2
      }];
    },
    _grantFirstAttemptClearStaminaReward: function (isFirstCompletion) {
      assert(isFirstCompletion === true, "First-attempt reward must receive first-completion flag.");
      return [{
        id: "stamina",
        count: 1
      }];
    },
    _applyCurrentLevelBestScoreFlag: function (winSnapshot) {
      return winSnapshot;
    },
    _applyCurrentLevelClearRewardItems: methods._applyCurrentLevelClearRewardItems
  };

  methods._handleRuntimeStateTransition.call(host, snapshot);

  assert(Array.isArray(snapshot.winStats.clearRewardItems), "WinView reward items must be written to winStats.");
  assert(snapshot.winStats.clearRewardItems.length === 2, "WinView must merge duplicate stamina reward items.");
  assert(snapshot.winStats.clearRewardItems[0].id === "coin", "WinView reward merge must preserve first reward id order.");
  assert(snapshot.winStats.clearRewardItems[0].count === 10, "WinView reward merge must preserve coin reward count.");
  assert(snapshot.winStats.clearRewardItems[1].id === "stamina", "WinView reward merge must keep one stamina reward item.");
  assert(snapshot.winStats.clearRewardItems[1].count === 3, "WinView reward merge must sum stamina reward counts.");
}

function buildProfileStorageValue(entry, LevelAttemptStatsStore, attemptState) {
  if (entry.storageKey === LevelAttemptStatsStore.STORAGE_KEY) {
    return attemptState;
  }
  var AssistSpiritStore = require(ASSIST_SPIRIT_STORE_PATH);
  if (entry.storageKey === AssistSpiritStore.STORAGE_KEY) {
    return AssistSpiritStore.createInitialState();
  }
  var SpiritShopStore = require(SPIRIT_SHOP_STORE_PATH);
  if (entry.storageKey === SpiritShopStore.STORAGE_KEY) {
    return SpiritShopStore.createInitialState(new Date("2026-05-25T08:00:00"));
  }
  return {};
}

function buildProfileWithAttemptState(PlayerCloudProfileService, LevelAttemptStatsStore, attemptState) {
  var storage = {};
  PlayerCloudProfileService.STORAGE_ENTRIES.forEach(function (entry) {
    storage[entry.storageKey] = {
      namespace: entry.namespace,
      value: buildProfileStorageValue(entry, LevelAttemptStatsStore, attemptState)
    };
  });
  return {
    version: PlayerCloudProfileService.PROFILE_VERSION,
    storage: storage
  };
}

function seedProfileStorage(StrictStorage, PlayerCloudProfileService, LevelAttemptStatsStore, attemptState) {
  PlayerCloudProfileService.STORAGE_ENTRIES.forEach(function (entry) {
    StrictStorage.writeJson(
      entry.storageKey,
      entry.namespace,
      buildProfileStorageValue(entry, LevelAttemptStatsStore, attemptState)
    );
  });
}

function createCloudProfilePlatform(PlayerCloudProfileService, cloudProfile) {
  return {
    cloud: {
      init: function () {},
      callFunction: function (request) {
        assert(request.name === "playerProfile", "Player cloud profile sync must call playerProfile.");
        assert(request.data.action === "get", "Player cloud profile sync test expects get action.");
        return Promise.resolve({
          result: {
            deploymentMarker: PlayerCloudProfileService.EXPECTED_DEPLOYMENT_MARKER,
            exists: true,
            updatedAt: 3000,
            profile: cloudProfile
          }
        });
      }
    }
  };
}

function assertCloudProfileSyncDefersGameplayApply() {
  var StrictStorage = require(STRICT_STORAGE_PATH);
  var LevelAttemptStatsStore = require(LEVEL_ATTEMPT_STATS_STORE_PATH);
  var PlayerCloudProfileService = require(PLAYER_CLOUD_PROFILE_SERVICE_PATH);
  var localAttemptState = LevelAttemptStatsStore.createInitialState();
  localAttemptState.totalAttemptCount = 1;
  localAttemptState.attemptCountByLevel = { "355": 1 };
  localAttemptState.activeAttempt = createAttempt("attempt_live_355", 355, 1, null);

  var cloudAttemptState = LevelAttemptStatsStore.createInitialState();
  cloudAttemptState.totalAttemptCount = 1;
  cloudAttemptState.attemptCountByLevel = { "354": 1 };
  cloudAttemptState.lastAttempt = createAttempt("attempt_cloud_354", 354, 1, "win");
  cloudAttemptState.lastAttemptByLevel = {
    "354": cloudAttemptState.lastAttempt
  };

  seedProfileStorage(StrictStorage, PlayerCloudProfileService, LevelAttemptStatsStore, localAttemptState);
  var cloudProfile = buildProfileWithAttemptState(
    PlayerCloudProfileService,
    LevelAttemptStatsStore,
    cloudAttemptState
  );
  var service = new PlayerCloudProfileService({
    platform: createCloudProfilePlatform(PlayerCloudProfileService, cloudProfile),
    cloudEnvId: "cloud-test",
    functionName: "playerProfile",
    syncDebounceMs: 1,
    logger: null
  });

  return service.syncFromCloudOrUploadLocal({
    shouldApplyCloudProfile: function () {
      return false;
    }
  }).then(function (result) {
    assert(result.source === "cloud", "Deferred profile sync must report cloud source.");
    assert(result.applied === false, "Deferred profile sync must report unapplied cloud profile.");
    var storedText = cc.sys.localStorage.getItem(LevelAttemptStatsStore.STORAGE_KEY);
    var storedAttemptState = JSON.parse(storedText);
    assert(
      storedAttemptState.activeAttempt.attemptId === "attempt_live_355",
      "Unapplied cloud profile must preserve in-flight activeAttempt."
    );
    return service.syncFromCloudOrUploadLocal({
      shouldApplyCloudProfile: function () {
        return true;
      }
    });
  }).then(function (result) {
    assert(result.source === "cloud", "Applied profile sync must report cloud source.");
    assert(result.applied === true, "Applied profile sync must report applied cloud profile.");
    var storedText = cc.sys.localStorage.getItem(LevelAttemptStatsStore.STORAGE_KEY);
    var storedAttemptState = JSON.parse(storedText);
    assert(
      storedAttemptState.activeAttempt === null,
      "Applied cloud profile must write cloud activeAttempt state."
    );
  });
}

function assertTestRunPowerupAttemptTrackingRules() {
  var methods = loadTelemetryMethodsForTest();
  var LevelAttemptStatsStore = require(LEVEL_ATTEMPT_STATS_STORE_PATH);
  var store = new LevelAttemptStatsStore();
  var initialState = LevelAttemptStatsStore.createInitialState();
  var testHost = {
    _currentRunContext: {
      mode: "test"
    },
    _currentAttemptId: "",
    levelAttemptStatsStore: store,
    levelAttemptStats: initialState
  };

  assert(
    methods._recordAttemptPowerupUsed.call(testHost, "blast") === false,
    "Test run powerup use must explicitly skip player attempt statistics."
  );
  assert(
    testHost.levelAttemptStats.totalAttemptCount === 0 && testHost.levelAttemptStats.activeAttempt === null,
    "Test run powerup use must not create or mutate a player attempt."
  );

  var missingAttemptHost = {
    _currentRunContext: {
      mode: "normal"
    },
    _currentAttemptId: "",
    levelAttemptStatsStore: store,
    levelAttemptStats: LevelAttemptStatsStore.createInitialState()
  };
  var missingAttemptError = null;
  try {
    methods._recordAttemptPowerupUsed.call(missingAttemptHost, "blast");
  } catch (error) {
    missingAttemptError = error;
  }
  assert(
    missingAttemptError && missingAttemptError.message.indexOf("attemptId must be a non-empty string") >= 0,
    "Normal run powerup use must remain fail-fast when attemptId is missing."
  );

  var activeState = store.recordStart(LevelAttemptStatsStore.createInitialState(), {
    attemptId: "attempt_powerup_validation",
    levelId: 15,
    levelCode: "L015_POWERUP_VALIDATION",
    runMode: "normal",
    startedAt: 1000,
    startState: "aiming",
    initialShots: 20
  });
  var normalHost = {
    _currentRunContext: {
      mode: "normal"
    },
    _currentAttemptId: "attempt_powerup_validation",
    levelAttemptStatsStore: store,
    levelAttemptStats: activeState
  };
  assert(
    methods._recordAttemptPowerupUsed.call(normalHost, "blast") === true,
    "Normal run powerup use must persist player attempt statistics."
  );
  assert(
    normalHost.levelAttemptStats.activeAttempt.powerupsUsed.blast === 1,
    "Normal run blast use must increment the active attempt powerup count."
  );
}

global.cc = {
  sys: {
    localStorage: createMemoryStorage()
  }
};

Promise.resolve().then(function () {
  assertSourceConfig();
  assertInitialResources();
  assertDailyBaselineRefill();
  assertDailyBaselineDoesNotOverwriteSurplus();
  assertSameDayDoesNotRefill();
  assertConsumeRules();
  assertTestRunPowerupAttemptTrackingRules();
  assertFirstAttemptStaminaRewardRules();
  assertFinalCampaignLevelNextAction();
  assertFinalCampaignLevelProgressBoundary();
  assertWinRewardStaminaItemsMergeForDisplay();
  return assertCloudProfileSyncDefersGameplayApply();
}).then(function () {
  console.log("Stamina system validation passed.");
}).catch(function (error) {
  setTimeout(function () {
    throw error;
  }, 0);
});
