"use strict";

var StrictStorage = require("../utils/StrictStorage");

var STORAGE_KEY = "bubble_ad_reward_quota_v1";
var NAMESPACE = "AdRewardQuotaStore";
var QUOTA_TYPES = [
  "lose_next_round",
  "inventory_refill",
  "assist_spirit_skill_charge",
  "stamina_refill",
  "level_select_gem"
];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireKnownQuotaType(quotaType) {
  requireNonEmptyString(quotaType, "quotaType");
  if (QUOTA_TYPES.indexOf(quotaType) < 0) {
    throw new Error("Unsupported ad reward quotaType: " + quotaType);
  }
  return quotaType;
}

function toDayKey(dateLike) {
  var date = dateLike;
  if (date === undefined) {
    date = new Date();
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("AdRewardQuotaStore date must be a valid Date.");
  }

  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function normalizeRule(rawRule, quotaType) {
  assertObject(rawRule, "Ad reward quota rule is required: " + quotaType);
  return {
    dailyLimit: requireNonNegativeInteger(rawRule.dailyLimit, "Ad reward quota rule dailyLimit `" + quotaType + "`"),
    cooldownSec: requireNonNegativeInteger(rawRule.cooldownSec, "Ad reward quota rule cooldownSec `" + quotaType + "`")
  };
}

function normalizeRules(rawRules) {
  assertObject(rawRules, "AdRewardQuotaStore rules are required.");

  Object.keys(rawRules).forEach(function (quotaType) {
    requireKnownQuotaType(quotaType);
  });

  var output = {};
  QUOTA_TYPES.forEach(function (quotaType) {
    if (!Object.prototype.hasOwnProperty.call(rawRules, quotaType)) {
      throw new Error("AdRewardQuotaStore rules missing quotaType: " + quotaType);
    }
    output[quotaType] = normalizeRule(rawRules[quotaType], quotaType);
  });
  return output;
}

function createInitialQuotaData(dayKey) {
  return {
    version: 1,
    dayKey: dayKey,
    grantsByType: {},
    lastGrantAtByType: {}
  };
}

function normalizeTypedIntegerMap(rawMap, mapName) {
  assertObject(rawMap, "Ad reward quota " + mapName + " must be an object.");

  var output = {};
  Object.keys(rawMap).forEach(function (quotaType) {
    requireKnownQuotaType(quotaType);
    output[quotaType] = requireNonNegativeInteger(rawMap[quotaType], "Ad reward quota " + mapName + "." + quotaType);
  });
  return output;
}

function normalizeQuotaData(raw, now) {
  assertObject(raw, "Ad reward quota data must be an object.");
  if (raw.version !== 1) {
    throw new Error("Ad reward quota data version must be 1.");
  }
  requireNonEmptyString(raw.dayKey, "Ad reward quota dayKey");

  var todayKey = toDayKey(now);
  if (raw.dayKey !== todayKey) {
    return createInitialQuotaData(todayKey);
  }

  return {
    version: 1,
    dayKey: raw.dayKey,
    grantsByType: normalizeTypedIntegerMap(raw.grantsByType, "grantsByType"),
    lastGrantAtByType: normalizeTypedIntegerMap(raw.lastGrantAtByType, "lastGrantAtByType")
  };
}

function readCount(map, quotaType) {
  if (!Object.prototype.hasOwnProperty.call(map, quotaType)) {
    return 0;
  }
  return requireNonNegativeInteger(map[quotaType], "Ad reward quota count `" + quotaType + "`");
}

function AdRewardQuotaStore(options) {
  assertObject(options, "AdRewardQuotaStore options are required.");
  this.rules = normalizeRules(options.rules);
}

AdRewardQuotaStore.prototype._load = function (now) {
  var todayKey = toDayKey(now);
  var quotaData = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialQuotaData(todayKey);
  });
  return normalizeQuotaData(quotaData, now);
};

AdRewardQuotaStore.prototype._save = function (quotaData) {
  var normalized = normalizeQuotaData(quotaData, new Date(quotaData.dayKey + "T00:00:00"));
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

AdRewardQuotaStore.prototype._getRule = function (quotaType) {
  var safeQuotaType = requireKnownQuotaType(quotaType);
  return this.rules[safeQuotaType];
};

AdRewardQuotaStore.prototype.canGrant = function (quotaType, now) {
  var safeQuotaType = requireKnownQuotaType(quotaType);
  var rule = this._getRule(safeQuotaType);
  var snapshot = this._load(now);
  var nowDate = now;
  if (nowDate === undefined) {
    nowDate = new Date();
  }
  if (!(nowDate instanceof Date) || Number.isNaN(nowDate.getTime())) {
    throw new Error("AdRewardQuotaStore now must be a valid Date.");
  }

  var nowMs = nowDate.getTime();
  var grantedToday = readCount(snapshot.grantsByType, safeQuotaType);
  var lastGrantAt = readCount(snapshot.lastGrantAtByType, safeQuotaType);
  var cooldownMs = rule.cooldownSec * 1000;

  if (rule.dailyLimit > 0 && grantedToday >= rule.dailyLimit) {
    return {
      allowed: false,
      reason: "daily_limit",
      grantedToday: grantedToday,
      remainingToday: 0,
      cooldownRemainingSec: 0
    };
  }

  if (cooldownMs > 0 && lastGrantAt > 0 && nowMs - lastGrantAt < cooldownMs) {
    return {
      allowed: false,
      reason: "cooldown",
      grantedToday: grantedToday,
      remainingToday: rule.dailyLimit > 0 ? rule.dailyLimit - grantedToday : -1,
      cooldownRemainingSec: Math.ceil((cooldownMs - (nowMs - lastGrantAt)) / 1000)
    };
  }

  return {
    allowed: true,
    reason: "ok",
    grantedToday: grantedToday,
    remainingToday: rule.dailyLimit > 0 ? rule.dailyLimit - grantedToday : -1,
    cooldownRemainingSec: 0
  };
};

AdRewardQuotaStore.prototype.recordGrant = function (quotaType, now) {
  var safeQuotaType = requireKnownQuotaType(quotaType);
  var nowDate = now;
  if (nowDate === undefined) {
    nowDate = new Date();
  }
  if (!(nowDate instanceof Date) || Number.isNaN(nowDate.getTime())) {
    throw new Error("AdRewardQuotaStore now must be a valid Date.");
  }

  var quotaData = this._load(nowDate);
  var grantedToday = readCount(quotaData.grantsByType, safeQuotaType);
  quotaData.grantsByType[safeQuotaType] = grantedToday + 1;
  quotaData.lastGrantAtByType[safeQuotaType] = nowDate.getTime();
  this._save(quotaData);
  return clone(quotaData);
};

AdRewardQuotaStore.QUOTA_TYPES = QUOTA_TYPES.slice();

module.exports = AdRewardQuotaStore;
