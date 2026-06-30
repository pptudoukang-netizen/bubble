"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_player_resources_v1";
var NAMESPACE = "PlayerResourceStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function toDateKey(date) {
  var now = date;
  if (now === undefined) {
    now = new Date();
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("PlayerResourceStore date must be a valid Date.");
  }

  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function createInitialResources(dailyStamina) {
  return {
    version: 1,
    stamina: dailyStamina,
    coins: 0,
    lastDailyResetDate: ""
  };
}

function normalizeResources(raw) {
  assertObject(raw, "Player resources must be an object.");
  if (raw.version !== 1) {
    throw new Error("Player resources version must be 1.");
  }
  if (typeof raw.lastDailyResetDate !== "string") {
    throw new Error("Player resources lastDailyResetDate must be a string.");
  }

  return {
    version: 1,
    stamina: requireNonNegativeInteger(raw.stamina, "Player stamina"),
    coins: requireNonNegativeInteger(raw.coins, "Player coins"),
    lastDailyResetDate: raw.lastDailyResetDate
  };
}

function PlayerResourceStore(options) {
  assertObject(options, "PlayerResourceStore options are required.");
  this.dailyStamina = requirePositiveInteger(options.dailyStamina, "dailyStamina");
}

PlayerResourceStore.prototype.applyDailyReset = function (resources, now) {
  var normalized = normalizeResources(resources);
  var todayKey = toDateKey(now);
  if (normalized.lastDailyResetDate !== todayKey) {
    normalized.lastDailyResetDate = todayKey;
    if (normalized.stamina < this.dailyStamina) {
      normalized.stamina = this.dailyStamina;
    }
  }
  return normalized;
};

PlayerResourceStore.prototype.load = function (now) {
  var rawResources = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialResources(this.dailyStamina);
  }.bind(this));
  var resetApplied = this.applyDailyReset(rawResources, now);
  var normalized = normalizeResources(resetApplied);
  if (JSON.stringify(rawResources) !== JSON.stringify(normalized)) {
    this.save(normalized);
  }
  return clone(normalized);
};

PlayerResourceStore.prototype.save = function (resources) {
  var normalized = normalizeResources(resources);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

PlayerResourceStore.prototype.consumeStamina = function (resources, amount) {
  var normalized = this.applyDailyReset(resources);
  var consumeAmount = requirePositiveInteger(amount, "Stamina consume amount");
  if (normalized.stamina < consumeAmount) {
    return {
      accepted: false,
      resources: clone(normalized)
    };
  }

  normalized.stamina = normalized.stamina - consumeAmount;
  return {
    accepted: true,
    resources: clone(normalized)
  };
};

module.exports = PlayerResourceStore;
