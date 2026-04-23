"use strict";

var STORAGE_KEY = "bubble_ad_reward_quota_v1";

var DEFAULT_RULES = {
  lose_next_round: {
    dailyLimit: 20,
    cooldownSec: 3
  },
  inventory_refill: {
    dailyLimit: 12,
    cooldownSec: 8
  },
  stamina_refill: {
    dailyLimit: 5,
    cooldownSec: 10
  }
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafeInteger(value, fallback) {
  var parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, parsed);
}

function toDayKey(dateLike) {
  var date = dateLike instanceof Date ? dateLike : new Date();
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();
  return [
    String(year),
    month < 10 ? ("0" + month) : String(month),
    day < 10 ? ("0" + day) : String(day)
  ].join("-");
}

function normalizeRule(rawRule, defaultRule) {
  var base = defaultRule || { dailyLimit: 0, cooldownSec: 0 };
  var safeRule = rawRule && typeof rawRule === "object" ? rawRule : {};
  return {
    dailyLimit: toSafeInteger(safeRule.dailyLimit, base.dailyLimit),
    cooldownSec: toSafeInteger(safeRule.cooldownSec, base.cooldownSec)
  };
}

function normalizeRules(rawRules) {
  var source = rawRules && typeof rawRules === "object" ? rawRules : {};
  var output = {};
  var allKeys = Object.keys(DEFAULT_RULES);

  Object.keys(source).forEach(function (typeKey) {
    if (allKeys.indexOf(typeKey) === -1) {
      allKeys.push(typeKey);
    }
  });

  allKeys.forEach(function (typeKey) {
    output[typeKey] = normalizeRule(source[typeKey], DEFAULT_RULES[typeKey]);
  });

  return output;
}

function createDefaultQuotaData(dayKey) {
  return {
    version: 1,
    dayKey: dayKey || toDayKey(),
    grantsByType: {},
    lastGrantAtByType: {}
  };
}

function normalizeQuotaData(raw, now) {
  var dayKey = toDayKey(now);
  if (!raw || typeof raw !== "object") {
    return createDefaultQuotaData(dayKey);
  }

  var normalized = {
    version: 1,
    dayKey: typeof raw.dayKey === "string" && raw.dayKey ? raw.dayKey : dayKey,
    grantsByType: {},
    lastGrantAtByType: {}
  };

  if (raw.grantsByType && typeof raw.grantsByType === "object") {
    Object.keys(raw.grantsByType).forEach(function (typeKey) {
      normalized.grantsByType[typeKey] = toSafeInteger(raw.grantsByType[typeKey], 0);
    });
  }

  if (raw.lastGrantAtByType && typeof raw.lastGrantAtByType === "object") {
    Object.keys(raw.lastGrantAtByType).forEach(function (typeKey) {
      var safeTimestamp = Math.floor(Number(raw.lastGrantAtByType[typeKey]) || 0);
      if (Number.isFinite(safeTimestamp) && safeTimestamp > 0) {
        normalized.lastGrantAtByType[typeKey] = safeTimestamp;
      }
    });
  }

  if (normalized.dayKey !== dayKey) {
    normalized.dayKey = dayKey;
    normalized.grantsByType = {};
  }

  return normalized;
}

function AdRewardQuotaStore(options) {
  options = options || {};
  this.rules = normalizeRules(options.rules);
}

AdRewardQuotaStore.prototype._getStorage = function () {
  return cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
};

AdRewardQuotaStore.prototype._load = function (now) {
  var storage = this._getStorage();
  if (!storage) {
    return createDefaultQuotaData(toDayKey(now));
  }

  try {
    var rawText = storage.getItem(STORAGE_KEY);
    var parsed = rawText ? JSON.parse(rawText) : null;
    return normalizeQuotaData(parsed, now);
  } catch (error) {
    return createDefaultQuotaData(toDayKey(now));
  }
};

AdRewardQuotaStore.prototype._save = function (quotaData) {
  var storage = this._getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(quotaData));
  } catch (error) {
    // Ignore save errors to keep runtime flow stable.
  }
};

AdRewardQuotaStore.prototype._getRule = function (quotaType) {
  if (typeof quotaType !== "string" || !quotaType) {
    return {
      dailyLimit: 0,
      cooldownSec: 0
    };
  }

  if (!this.rules[quotaType]) {
    this.rules[quotaType] = normalizeRule(null, null);
  }
  return this.rules[quotaType];
};

AdRewardQuotaStore.prototype.canGrant = function (quotaType, now) {
  var rule = this._getRule(quotaType);
  var snapshot = this._load(now);
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  var grantedToday = toSafeInteger(snapshot.grantsByType[quotaType], 0);
  var lastGrantAt = toSafeInteger(snapshot.lastGrantAtByType[quotaType], 0);
  var cooldownMs = Math.max(0, rule.cooldownSec) * 1000;

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
      remainingToday: rule.dailyLimit > 0 ? Math.max(0, rule.dailyLimit - grantedToday) : -1,
      cooldownRemainingSec: Math.ceil((cooldownMs - (nowMs - lastGrantAt)) / 1000)
    };
  }

  return {
    allowed: true,
    reason: "ok",
    grantedToday: grantedToday,
    remainingToday: rule.dailyLimit > 0 ? Math.max(0, rule.dailyLimit - grantedToday) : -1,
    cooldownRemainingSec: 0
  };
};

AdRewardQuotaStore.prototype.recordGrant = function (quotaType, now) {
  var nowDate = now instanceof Date ? now : new Date();
  var nowMs = nowDate.getTime();
  var quotaData = this._load(nowDate);
  var grantedToday = toSafeInteger(quotaData.grantsByType[quotaType], 0);
  quotaData.grantsByType[quotaType] = grantedToday + 1;
  quotaData.lastGrantAtByType[quotaType] = nowMs;
  this._save(quotaData);
  return clone(quotaData);
};

module.exports = AdRewardQuotaStore;
