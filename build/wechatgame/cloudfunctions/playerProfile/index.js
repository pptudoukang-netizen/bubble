"use strict";

var crypto = require("crypto");
var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "player_profiles";
var PROFILE_VERSION = 1;
var DEPLOYMENT_MARKER = "playerProfile_v20260704_game_circle_welfare_v1";
var LEVEL_ATTEMPT_STATS_STORAGE_KEY = "bubble_level_attempt_stats_v1";
var SUPPORTED_STORAGE_KEYS = {
  bubble_level_progress_v1: "LevelProgressStore",
  bubble_level_attempt_stats_v1: "LevelAttemptStatsStore",
  bubble_player_resources_v1: "PlayerResourceStore",
  bubble_stamina_recovery_state_v1: "StaminaRecoveryStore",
  bubble_daily_task_state_v1: "DailyTaskStore",
  bubble_player_inventory_v1: "InventoryStore",
  bubble_selected_powerups_v1: "SelectedPowerupsStore",
  bubble_sign_in_state_v1: "SignInStore",
  bubble_new_gift_state_v1: "NewGiftStore",
  bubble_star_chest_state_v1: "StarChestStore",
  bubble_shop_state_v1: "ShopStateStore",
  bubble_game_circle_welfare_state_v1: "GameCircleWelfareStore"
};

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function measureJsonBytes(data) {
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

function describeError(error) {
  if (!error || typeof error !== "object") {
    return String(error);
  }
  var parts = [];
  if (error.message) {
    parts.push(error.message);
  }
  if (error.errMsg) {
    parts.push("errMsg=" + error.errMsg);
  }
  if (error.errCode !== undefined) {
    parts.push("errCode=" + String(error.errCode));
  }
  if (error.code !== undefined) {
    parts.push("code=" + String(error.code));
  }
  if (parts.length === 0) {
    parts.push(String(error));
  }
  return parts.join(", ");
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function buildProfileRecordId(openid) {
  var digest = crypto.createHash("sha1").update(openid).digest("hex");
  return "player_profile_" + digest;
}

function createEmptyLevelAttemptStats() {
  return {
    version: 1,
    totalAttemptCount: 0,
    attemptCountByLevel: {},
    activeAttempt: null,
    lastAttempt: null,
    lastAttemptByLevel: {},
    recentEvents: []
  };
}

function createMissingStorageEntry(storageKey) {
  if (storageKey === LEVEL_ATTEMPT_STATS_STORAGE_KEY) {
    return {
      namespace: SUPPORTED_STORAGE_KEYS[storageKey],
      value: createEmptyLevelAttemptStats()
    };
  }
  throw new Error("player profile missing storageKey: " + storageKey);
}

function normalizeProfile(profile) {
  requireObject(profile, "player profile");
  if (profile.version !== PROFILE_VERSION) {
    throw new Error("player profile version must be " + PROFILE_VERSION + ".");
  }
  requireObject(profile.storage, "player profile storage");

  Object.keys(profile.storage).forEach(function (storageKey) {
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_STORAGE_KEYS, storageKey)) {
      throw new Error("Unsupported player profile storageKey: " + storageKey);
    }
  });

  var normalizedStorage = {};
  Object.keys(SUPPORTED_STORAGE_KEYS).forEach(function (storageKey) {
    if (!Object.prototype.hasOwnProperty.call(profile.storage, storageKey)) {
      normalizedStorage[storageKey] = createMissingStorageEntry(storageKey);
      return;
    }
    var entry = profile.storage[storageKey];
    requireObject(entry, "player profile storage entry `" + storageKey + "`");
    var namespace = requireNonEmptyString(entry.namespace, "player profile namespace `" + storageKey + "`");
    if (namespace !== SUPPORTED_STORAGE_KEYS[storageKey]) {
      throw new Error("player profile namespace mismatch for `" + storageKey + "`.");
    }
    normalizedStorage[storageKey] = {
      namespace: namespace,
      value: requireObject(entry.value, "player profile value `" + storageKey + "`")
    };
  });

  return {
    version: PROFILE_VERSION,
    storage: clone(normalizedStorage)
  };
}

async function getProfile(collection, openid) {
  var result = await collection.where({
    openid: openid
  }).limit(1).get();
  if (!result || !Array.isArray(result.data)) {
    throw new Error("Get player profile query result is invalid.");
  }
  if (result.data.length === 0) {
    return {
      deploymentMarker: DEPLOYMENT_MARKER,
      exists: false,
      updatedAt: 0
    };
  }
  if (result.data.length !== 1) {
    throw new Error("Get player profile query must return at most one record.");
  }

  var record = requireObject(result.data[0], "player profile record");
  return {
    deploymentMarker: DEPLOYMENT_MARKER,
    exists: true,
    updatedAt: requireNonNegativeInteger(record.updatedAt, "player profile updatedAt"),
    profile: normalizeProfile(record.profile)
  };
}

async function saveProfile(collection, openid, event) {
  var profile = normalizeProfile(event.profile);
  var reason = requireNonEmptyString(event.reason, "player profile save reason");
  var profileBytes = measureJsonBytes(profile);
  var now = Date.now();
  var recordId = buildProfileRecordId(openid);
  var result = null;
  try {
    result = await collection.doc(recordId).set({
      data: {
        openid: openid,
        profile: profile,
        updatedAt: now,
        saveReason: reason
      }
    });
  } catch (error) {
    throw new Error(
      "Save player profile record failed. collection=" + COLLECTION_NAME +
      ", recordId=" + recordId +
      ", reason=" + reason +
      ", profileBytes=" + profileBytes +
      ", cause=" + describeError(error)
    );
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Save player profile record failed.");
  }

  return {
    deploymentMarker: DEPLOYMENT_MARKER,
    accepted: true,
    updatedAt: now
  };
}

exports.main = async function (event) {
  console.log("[Bubble]", DEPLOYMENT_MARKER, "invoked");
  requireObject(event, "playerProfile event");
  var action = requireNonEmptyString(event.action, "playerProfile action");
  var context = cloud.getWXContext();
  var openid = requireNonEmptyString(context.OPENID, "player OPENID");
  var collection = cloud.database().collection(COLLECTION_NAME);

  if (action === "get") {
    return getProfile(collection, openid);
  }
  if (action === "save") {
    return saveProfile(collection, openid, event);
  }
  throw new Error("Unsupported playerProfile action: " + action);
};
