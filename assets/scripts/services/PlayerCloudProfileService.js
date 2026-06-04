"use strict";

var StrictStorage = require("../utils/StrictStorage");

var PROFILE_VERSION = 1;
var SYNC_SOURCE_CLOUD = "cloud";
var SYNC_SOURCE_LOCAL = "local";
var STORAGE_ENTRIES = [
  { storageKey: "bubble_level_progress_v1", namespace: "LevelProgressStore" },
  { storageKey: "bubble_player_resources_v1", namespace: "PlayerResourceStore" },
  { storageKey: "bubble_stamina_recovery_state_v1", namespace: "StaminaRecoveryStore" },
  { storageKey: "bubble_daily_task_state_v1", namespace: "DailyTaskStore" },
  { storageKey: "bubble_player_inventory_v1", namespace: "InventoryStore" },
  { storageKey: "bubble_selected_powerups_v1", namespace: "SelectedPowerupsStore" },
  { storageKey: "bubble_sign_in_state_v1", namespace: "SignInStore" },
  { storageKey: "bubble_new_gift_state_v1", namespace: "NewGiftStore" },
  { storageKey: "bubble_star_chest_state_v1", namespace: "StarChestStore" },
  { storageKey: "bubble_shop_state_v1", namespace: "ShopStateStore" },
  { storageKey: "bubble_game_circle_welfare_state_v1", namespace: "GameCircleWelfareStore" }
];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function resolvePlatform(explicitPlatform) {
  if (explicitPlatform) {
    return explicitPlatform;
  }
  if (typeof wx !== "undefined" && wx) {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be boolean.");
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

function buildEntryMap(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Player cloud profile storage entries must be a non-empty array.");
  }

  var map = {};
  entries.forEach(function (entry, index) {
    assertObject(entry, "Player cloud profile storage entry " + index);
    var storageKey = requireNonEmptyString(entry.storageKey, "Player cloud profile storageKey " + index);
    var namespace = requireNonEmptyString(entry.namespace, "Player cloud profile namespace " + index);
    if (map[storageKey]) {
      throw new Error("Duplicated player cloud profile storageKey: " + storageKey);
    }
    map[storageKey] = {
      storageKey: storageKey,
      namespace: namespace
    };
  });
  return map;
}

function parseStoredValue(rawText, storageKey) {
  if (typeof rawText !== "string") {
    throw new Error("Player cloud profile storage value must be a string: " + storageKey);
  }
  if (rawText.trim().length === 0) {
    throw new Error("Player cloud profile storage JSON must not be empty: " + storageKey);
  }
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error("Player cloud profile local JSON is invalid for `" + storageKey + "`: " + error.message);
  }
}

function normalizeProfile(profile, entryMap) {
  assertObject(profile, "Player cloud profile");
  if (profile.version !== PROFILE_VERSION) {
    throw new Error("Player cloud profile version must be " + PROFILE_VERSION + ".");
  }
  assertObject(profile.storage, "Player cloud profile storage");

  Object.keys(profile.storage).forEach(function (storageKey) {
    if (!entryMap[storageKey]) {
      throw new Error("Unsupported player cloud profile storageKey: " + storageKey);
    }
  });

  var normalizedStorage = {};
  Object.keys(entryMap).forEach(function (storageKey) {
    if (!Object.prototype.hasOwnProperty.call(profile.storage, storageKey)) {
      throw new Error("Player cloud profile missing storageKey: " + storageKey);
    }
    var entry = profile.storage[storageKey];
    assertObject(entry, "Player cloud profile storage entry `" + storageKey + "`");
    if (entry.namespace !== entryMap[storageKey].namespace) {
      throw new Error("Player cloud profile namespace mismatch for `" + storageKey + "`.");
    }
    assertObject(entry.value, "Player cloud profile value `" + storageKey + "`");
    normalizedStorage[storageKey] = {
      namespace: entry.namespace,
      value: clone(entry.value)
    };
  });

  return {
    version: PROFILE_VERSION,
    storage: normalizedStorage
  };
}

function normalizeCloudFunctionResponse(response, functionName) {
  assertObject(response, functionName + " response");
  if (response.result && typeof response.result === "object" && !Array.isArray(response.result)) {
    return response.result;
  }
  return response;
}

function PlayerCloudProfileService(options) {
  assertObject(options, "PlayerCloudProfileService options");
  this.platform = resolvePlatform(options.platform);
  this.cloudEnvId = requireNonEmptyString(options.cloudEnvId, "PlayerCloudProfileService cloudEnvId");
  this.functionName = requireNonEmptyString(options.functionName, "PlayerCloudProfileService functionName");
  this.syncDebounceMs = requireNonNegativeInteger(options.syncDebounceMs, "PlayerCloudProfileService syncDebounceMs");
  this.logger = options.logger === undefined ? null : options.logger;
  this.storageEntries = STORAGE_ENTRIES.map(function (entry) {
    return {
      storageKey: entry.storageKey,
      namespace: entry.namespace
    };
  });
  this.entryMap = buildEntryMap(this.storageEntries);
  this.cloudInitialized = false;
  this.observerInstalled = false;
  this.uploadTimer = null;
  this.uploadInFlight = null;
  this.pendingUploadAfterInFlight = false;
  this.lastUploadError = null;
}

PlayerCloudProfileService.prototype._requireCloud = function () {
  if (!this.platform || !this.platform.cloud) {
    throw new Error("wx.cloud is required for player cloud profile.");
  }
  if (typeof this.platform.cloud.callFunction !== "function") {
    throw new Error("wx.cloud.callFunction is required for player cloud profile.");
  }
  if (this.cloudInitialized !== true && typeof this.platform.cloud.init === "function") {
    this.platform.cloud.init({
      env: this.cloudEnvId
    });
    this.cloudInitialized = true;
  }
  return this.platform.cloud;
};

PlayerCloudProfileService.prototype._callFunction = function (data) {
  assertObject(data, "Player cloud profile call data");
  return this._requireCloud().callFunction({
    name: this.functionName,
    data: data
  }).then(function (response) {
    return normalizeCloudFunctionResponse(response, this.functionName);
  }.bind(this));
};

PlayerCloudProfileService.prototype.collectLocalProfile = function () {
  var storage = StrictStorage.resolveStorage("PlayerCloudProfileService");
  var profileStorage = {};
  this.storageEntries.forEach(function (entry) {
    var rawText = storage.getItem(entry.storageKey);
    if (rawText === null) {
      throw new Error("Player cloud profile local storage missing key: " + entry.storageKey);
    }
    profileStorage[entry.storageKey] = {
      namespace: entry.namespace,
      value: parseStoredValue(rawText, entry.storageKey)
    };
  });
  return normalizeProfile({
    version: PROFILE_VERSION,
    storage: profileStorage
  }, this.entryMap);
};

PlayerCloudProfileService.prototype.applyCloudProfile = function (profile) {
  var normalized = normalizeProfile(profile, this.entryMap);
  StrictStorage.suspendWriteObserver(function () {
    Object.keys(normalized.storage).forEach(function (storageKey) {
      var entry = normalized.storage[storageKey];
      StrictStorage.writeJson(storageKey, entry.namespace, entry.value);
    });
  });
  return normalized;
};

PlayerCloudProfileService.prototype.syncFromCloudOrUploadLocal = function () {
  var localProfile = this.collectLocalProfile();
  return this._callFunction({
    action: "get"
  }).then(function (result) {
    requireBoolean(result.exists, "playerProfile get exists");
    if (result.exists === true) {
      this.applyCloudProfile(result.profile);
      return {
        source: SYNC_SOURCE_CLOUD,
        updatedAt: requireNonNegativeInteger(result.updatedAt, "playerProfile get updatedAt")
      };
    }
    return this.uploadProfile(localProfile, "startup_initial_upload").then(function (uploadResult) {
      return {
        source: SYNC_SOURCE_LOCAL,
        updatedAt: uploadResult.updatedAt
      };
    });
  }.bind(this));
};

PlayerCloudProfileService.prototype.uploadProfile = function (profile, reason) {
  var normalized = normalizeProfile(profile, this.entryMap);
  return this._callFunction({
    action: "save",
    reason: requireNonEmptyString(reason, "Player cloud profile upload reason"),
    profile: normalized
  }).then(function (result) {
    requireBoolean(result.accepted, "playerProfile save accepted");
    if (result.accepted !== true) {
      throw new Error("playerProfile save was not accepted.");
    }
    return {
      updatedAt: requireNonNegativeInteger(result.updatedAt, "playerProfile save updatedAt")
    };
  });
};

PlayerCloudProfileService.prototype.uploadCurrentLocalProfile = function (reason) {
  return this.uploadProfile(this.collectLocalProfile(), reason);
};

PlayerCloudProfileService.prototype._isWatchedStorageKey = function (storageKey) {
  return Object.prototype.hasOwnProperty.call(this.entryMap, storageKey);
};

PlayerCloudProfileService.prototype.installStorageObserver = function () {
  if (this.observerInstalled === true) {
    throw new Error("Player cloud profile storage observer already installed.");
  }
  StrictStorage.setWriteObserver(function (event) {
    assertObject(event, "StrictStorage write event");
    var storageKey = requireNonEmptyString(event.storageKey, "StrictStorage write event storageKey");
    if (!this._isWatchedStorageKey(storageKey)) {
      return;
    }
    this.queueUpload("local_storage_write");
  }.bind(this));
  this.observerInstalled = true;
};

PlayerCloudProfileService.prototype.queueUpload = function (reason) {
  requireNonEmptyString(reason, "Player cloud profile queue reason");
  if (this.uploadTimer !== null) {
    clearTimeout(this.uploadTimer);
  }

  this.uploadTimer = setTimeout(function () {
    this.uploadTimer = null;
    this.flushUploadQueue(reason).catch(function (error) {
      this.lastUploadError = error;
      if (this.logger && typeof this.logger.error === "function") {
        this.logger.error("Player cloud profile upload failed", error && error.stack ? error.stack : String(error));
      }
    }.bind(this));
  }.bind(this), this.syncDebounceMs);
};

PlayerCloudProfileService.prototype.flushUploadQueue = function (reason) {
  requireNonEmptyString(reason, "Player cloud profile flush reason");
  if (this.uploadTimer !== null) {
    clearTimeout(this.uploadTimer);
    this.uploadTimer = null;
  }
  if (this.uploadInFlight) {
    this.pendingUploadAfterInFlight = true;
    return this.uploadInFlight;
  }

  this.uploadInFlight = this.uploadCurrentLocalProfile(reason).then(function (result) {
    this.lastUploadError = null;
    return result;
  }.bind(this)).then(function (result) {
    this.uploadInFlight = null;
    if (this.pendingUploadAfterInFlight === true) {
      this.pendingUploadAfterInFlight = false;
      return this.flushUploadQueue("local_storage_write_after_in_flight");
    }
    return result;
  }.bind(this)).catch(function (error) {
    this.uploadInFlight = null;
    this.lastUploadError = error;
    throw error;
  }.bind(this));

  return this.uploadInFlight;
};

PlayerCloudProfileService.PROFILE_VERSION = PROFILE_VERSION;
PlayerCloudProfileService.STORAGE_ENTRIES = STORAGE_ENTRIES.map(function (entry) {
  return {
    storageKey: entry.storageKey,
    namespace: entry.namespace
  };
});

module.exports = PlayerCloudProfileService;
