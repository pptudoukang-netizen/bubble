"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var PLAYER_RESOURCE_STORE_PATH = path.join(PROJECT_ROOT, "assets/scripts/utils/PlayerResourceStore.js");
var BOOTSTRAP_COMPOSITION_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapCompositionMethods.js");
var STATUS_RESOURCE_FLOW_PATH = path.join(PROJECT_ROOT, "assets/scripts/bootstrap/GameBootstrapStatusResourceFlowMethods.js");

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

function createStore() {
  var PlayerResourceStore = require(PLAYER_RESOURCE_STORE_PATH);
  return new PlayerResourceStore({
    dailyStamina: 20
  });
}

function assertSourceConfig() {
  var compositionSource = readText(BOOTSTRAP_COMPOSITION_PATH);
  var statusSource = readText(STATUS_RESOURCE_FLOW_PATH);

  assert(compositionSource.indexOf("dailyStamina: 20") >= 0, "GameBootstrap must initialize dailyStamina to 20.");
  assert(statusSource.indexOf("var STAMINA_NATURAL_RECOVERY_MAX = 20;") >= 0, "Natural stamina recovery max must be 20.");
}

function assertInitialResources() {
  var store = createStore();
  var resources = store.load(new Date("2026-05-25T08:00:00"));

  assert(resources.version === 1, "Initial resources version must be 1.");
  assert(resources.stamina === 20, "New player initial stamina must be 20.");
  assert(resources.coins === 0, "New player initial coins must be 0.");
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
  var accepted = store.consumeStamina({
    version: 1,
    stamina: 1,
    coins: 0,
    lastDailyResetDate: "2026-05-25"
  }, 1);
  assert(accepted.accepted === true, "consumeStamina must accept when stamina is enough.");
  assert(accepted.resources.stamina === 0, "consumeStamina must deduct exactly the requested amount.");

  var rejected = store.consumeStamina({
    version: 1,
    stamina: 0,
    coins: 0,
    lastDailyResetDate: "2026-05-25"
  }, 1);
  assert(rejected.accepted === false, "consumeStamina must reject when stamina is insufficient.");
  assert(rejected.resources.stamina === 0, "consumeStamina must not make stamina negative.");
}

global.cc = {
  sys: {
    localStorage: createMemoryStorage()
  }
};

assertSourceConfig();
assertInitialResources();
assertDailyBaselineRefill();
assertDailyBaselineDoesNotOverwriteSurplus();
assertSameDayDoesNotRefill();
assertConsumeRules();

console.log("Stamina system validation passed.");
