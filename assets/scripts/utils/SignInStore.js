"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_sign_in_state_v1";
var NAMESPACE = "SignInStore";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be boolean.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  return value;
}

function toDateKey(date) {
  var now = date;
  if (now === undefined) {
    now = new Date();
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("SignInStore date must be a valid Date.");
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

function normalizeClaimedDays(claimedDays, cycleLength) {
  if (!Array.isArray(claimedDays)) {
    throw new Error("Sign-in claimedDaysInCycle must be an array.");
  }

  var seen = {};
  var normalized = claimedDays.map(function (day) {
    if (!Number.isInteger(day) || day < 1 || day > cycleLength) {
      throw new Error("Sign-in claimed day must be an integer within cycle.");
    }
    if (seen[day]) {
      throw new Error("Sign-in claimedDaysInCycle contains duplicated day: " + day);
    }
    seen[day] = true;
    return day;
  });

  normalized.sort(function (a, b) {
    return a - b;
  });
  return normalized;
}

function createInitialState() {
  return {
    version: 1,
    cycleIndex: 1,
    currentCycleDay: 1,
    lastClaimDate: "",
    claimedDaysInCycle: [],
    lastPopupDate: ""
  };
}

function normalizeState(raw, cycleLength) {
  assertObject(raw, "Sign-in state must be an object.");
  if (raw.version !== 1) {
    throw new Error("Sign-in state version must be 1.");
  }

  var currentCycleDay = requirePositiveInteger(raw.currentCycleDay, "Sign-in currentCycleDay");
  if (currentCycleDay > cycleLength) {
    throw new Error("Sign-in currentCycleDay exceeds cycleLength.");
  }

  return {
    version: 1,
    cycleIndex: requirePositiveInteger(raw.cycleIndex, "Sign-in cycleIndex"),
    currentCycleDay: currentCycleDay,
    lastClaimDate: requireString(raw.lastClaimDate, "Sign-in lastClaimDate"),
    claimedDaysInCycle: normalizeClaimedDays(raw.claimedDaysInCycle, cycleLength),
    lastPopupDate: requireString(raw.lastPopupDate, "Sign-in lastPopupDate")
  };
}

function SignInStore(options) {
  assertObject(options, "SignInStore options are required.");
  this.cycleLength = requirePositiveInteger(options.cycleLength, "SignInStore cycleLength");
  this.autoPopupOnFirstLogin = requireBoolean(options.autoPopupOnFirstLogin, "SignInStore autoPopupOnFirstLogin");
}

SignInStore.prototype.getTodayKey = function (now) {
  return toDateKey(now);
};

SignInStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(state, this.cycleLength);
  this.save(normalized);
  return clone(normalized);
};

SignInStore.prototype.save = function (state) {
  var normalized = normalizeState(state, this.cycleLength);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
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
