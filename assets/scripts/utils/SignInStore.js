"use strict";

var STORAGE_KEY = "bubble_sign_in_state_v1";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafePositiveInt(value, fallback) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.floor(Number(fallback) || 1));
  }
  return parsed;
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

function normalizeClaimedDays(claimedDays, cycleLength) {
  var list = Array.isArray(claimedDays) ? claimedDays : [];
  var normalized = list.map(function (day) {
    return Math.floor(Number(day) || 0);
  }).filter(function (day) {
    return day >= 1 && day <= cycleLength;
  }).filter(function (day, index, source) {
    return source.indexOf(day) === index;
  });

  normalized.sort(function (a, b) {
    return a - b;
  });
  return normalized;
}

function normalizeState(raw, cycleLength) {
  var safeCycleLength = Math.max(1, toSafePositiveInt(cycleLength, 7));
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      cycleIndex: 1,
      currentCycleDay: 1,
      lastClaimDate: "",
      claimedDaysInCycle: [],
      lastPopupDate: ""
    };
  }

  var currentCycleDay = Math.floor(Number(raw.currentCycleDay) || 1);
  if (!Number.isFinite(currentCycleDay) || currentCycleDay < 1) {
    currentCycleDay = 1;
  } else if (currentCycleDay > safeCycleLength) {
    currentCycleDay = safeCycleLength;
  }

  return {
    version: 1,
    cycleIndex: Math.max(1, Math.floor(Number(raw.cycleIndex) || 1)),
    currentCycleDay: currentCycleDay,
    lastClaimDate: typeof raw.lastClaimDate === "string" ? raw.lastClaimDate : "",
    claimedDaysInCycle: normalizeClaimedDays(raw.claimedDaysInCycle, safeCycleLength),
    lastPopupDate: typeof raw.lastPopupDate === "string" ? raw.lastPopupDate : ""
  };
}

function SignInStore(options) {
  options = options || {};
  this.cycleLength = Math.max(1, toSafePositiveInt(options.cycleLength, 7));
  this.autoPopupOnFirstLogin = options.autoPopupOnFirstLogin !== false;
}

SignInStore.prototype.getTodayKey = function (now) {
  return toDateKey(now);
};

SignInStore.prototype.load = function () {
  var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
  var normalized = null;

  try {
    if (!storage) {
      normalized = normalizeState(null, this.cycleLength);
    } else {
      var rawText = storage.getItem(STORAGE_KEY);
      var parsed = rawText ? JSON.parse(rawText) : null;
      normalized = normalizeState(parsed, this.cycleLength);
    }
  } catch (error) {
    normalized = normalizeState(null, this.cycleLength);
  }

  this.save(normalized);
  return clone(normalized);
};

SignInStore.prototype.save = function (state) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeState(state, this.cycleLength);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save failures.
  }
};

SignInStore.prototype.isClaimedToday = function (state, now) {
  var normalized = normalizeState(state, this.cycleLength);
  return normalized.lastClaimDate === this.getTodayKey(now);
};

SignInStore.prototype.canClaimToday = function (state, now) {
  return !this.isClaimedToday(state, now);
};

SignInStore.prototype.shouldAutoPopupToday = function (state, now) {
  if (!this.autoPopupOnFirstLogin) {
    return false;
  }

  var normalized = normalizeState(state, this.cycleLength);
  if (!this.canClaimToday(normalized, now)) {
    return false;
  }
  return normalized.lastPopupDate !== this.getTodayKey(now);
};

SignInStore.prototype.markPopupShown = function (state, now) {
  var normalized = normalizeState(state, this.cycleLength);
  normalized.lastPopupDate = this.getTodayKey(now);
  return {
    state: clone(normalized)
  };
};

SignInStore.prototype.claimToday = function (state, now) {
  var normalized = normalizeState(state, this.cycleLength);
  if (!this.canClaimToday(normalized, now)) {
    return {
      accepted: false,
      reason: "already_claimed_today",
      state: clone(normalized)
    };
  }

  var todayKey = this.getTodayKey(now);
  var claimedDay = normalized.currentCycleDay;
  if (normalized.claimedDaysInCycle.indexOf(claimedDay) < 0) {
    normalized.claimedDaysInCycle.push(claimedDay);
    normalized.claimedDaysInCycle.sort(function (a, b) {
      return a - b;
    });
  }
  normalized.lastClaimDate = todayKey;

  if (claimedDay >= this.cycleLength) {
    normalized.cycleIndex += 1;
    normalized.currentCycleDay = 1;
    normalized.claimedDaysInCycle = [];
  } else {
    normalized.currentCycleDay = claimedDay + 1;
  }

  return {
    accepted: true,
    claimedDay: claimedDay,
    state: clone(normalized)
  };
};

module.exports = SignInStore;
