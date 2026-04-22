"use strict";

var STORAGE_KEY = "bubble_player_resources_v1";
var DEFAULT_DAILY_STAMINA = 10;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafeNumber(value, fallback) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, parsed);
}

function toDateKey(date) {
  var now = date instanceof Date ? date : new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function normalizeResources(raw, dailyStamina) {
  var safeDailyStamina = Math.max(1, toSafeNumber(dailyStamina, DEFAULT_DAILY_STAMINA));
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      stamina: safeDailyStamina,
      coins: 0,
      lastDailyResetDate: ""
    };
  }

  return {
    version: 1,
    stamina: toSafeNumber(raw.stamina, safeDailyStamina),
    coins: toSafeNumber(raw.coins, 0),
    lastDailyResetDate: typeof raw.lastDailyResetDate === "string" ? raw.lastDailyResetDate : ""
  };
}

function PlayerResourceStore(options) {
  options = options || {};
  this.dailyStamina = Math.max(1, toSafeNumber(options.dailyStamina, DEFAULT_DAILY_STAMINA));
}

PlayerResourceStore.prototype.applyDailyReset = function (resources, now) {
  var normalized = normalizeResources(resources, this.dailyStamina);
  var todayKey = toDateKey(now);
  if (normalized.lastDailyResetDate !== todayKey) {
    normalized.stamina = this.dailyStamina;
    normalized.lastDailyResetDate = todayKey;
  }
  return normalized;
};

PlayerResourceStore.prototype.load = function (now) {
  var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
  var normalized = null;

  try {
    if (!storage) {
      normalized = normalizeResources(null, this.dailyStamina);
    } else {
      var rawText = storage.getItem(STORAGE_KEY);
      var parsed = rawText ? JSON.parse(rawText) : null;
      normalized = normalizeResources(parsed, this.dailyStamina);
    }
  } catch (error) {
    normalized = normalizeResources(null, this.dailyStamina);
  }

  var resetApplied = this.applyDailyReset(normalized, now);
  this.save(resetApplied);
  return clone(resetApplied);
};

PlayerResourceStore.prototype.save = function (resources) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeResources(resources, this.dailyStamina);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save failures.
  }
};

PlayerResourceStore.prototype.consumeStamina = function (resources, amount) {
  var normalized = normalizeResources(resources, this.dailyStamina);
  normalized = this.applyDailyReset(normalized);

  var consumeAmount = Math.max(1, toSafeNumber(amount, 1));
  if (normalized.stamina < consumeAmount) {
    return {
      accepted: false,
      resources: clone(normalized)
    };
  }

  normalized.stamina = Math.max(0, normalized.stamina - consumeAmount);
  return {
    accepted: true,
    resources: clone(normalized)
  };
};

module.exports = PlayerResourceStore;
