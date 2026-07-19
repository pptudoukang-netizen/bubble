"use strict";

var EXPECTED_DEPLOYMENT_MARKER = "levelEditorDrafts_v20260718_v1";
var DEFAULT_FUNCTION_NAME = "levelEditorDrafts";
var SYNC_BATCH_SIZE = 20;

function assertObject(value, fieldName) {
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
  if (parts.length === 0) {
    parts.push(String(error));
  }
  return parts.join(", ");
}

function normalizeRecord(record, index) {
  assertObject(record, "Level editor cloud sync record " + index);
  var levelId = requirePositiveInteger(record.levelId, "Level editor cloud sync levelId " + index);
  var updatedAt = requireNonNegativeInteger(record.updatedAt, "Level editor cloud sync updatedAt " + index);
  var config = assertObject(record.config, "Level editor cloud sync config " + index);
  if (!config.level || config.level.levelId !== levelId) {
    throw new Error("Level editor cloud sync config levelId mismatch: " + levelId);
  }
  return {
    levelId: levelId,
    updatedAt: updatedAt,
    config: config
  };
}

function normalizeResponse(response, functionName) {
  assertObject(response, functionName + " response");
  var result = response.result && typeof response.result === "object" && !Array.isArray(response.result)
    ? response.result
    : response;
  if (result.deploymentMarker !== EXPECTED_DEPLOYMENT_MARKER) {
    throw new Error(
      functionName + " cloud function deployment mismatch. Expected `" +
      EXPECTED_DEPLOYMENT_MARKER + "`, received `" + String(result.deploymentMarker) + "`."
    );
  }
  if (result.accepted !== true) {
    throw new Error(functionName + " cloud sync was not accepted.");
  }
  return {
    syncedCount: requireNonNegativeInteger(result.syncedCount, functionName + " syncedCount"),
    syncedAt: requireNonNegativeInteger(result.syncedAt, functionName + " syncedAt")
  };
}

function LevelEditorCloudSyncService(options) {
  assertObject(options, "LevelEditorCloudSyncService options");
  this.platform = resolvePlatform(options.platform);
  this.cloudEnvId = requireNonEmptyString(options.cloudEnvId, "LevelEditorCloudSyncService cloudEnvId");
  this.functionName = options.functionName === undefined
    ? DEFAULT_FUNCTION_NAME
    : requireNonEmptyString(options.functionName, "LevelEditorCloudSyncService functionName");
  this._cloudInitialized = false;
}

LevelEditorCloudSyncService.prototype._requireCloud = function () {
  if (!this.platform || !this.platform.cloud) {
    throw new Error("wx.cloud is required to sync level editor drafts.");
  }
  if (typeof this.platform.cloud.callFunction !== "function") {
    throw new Error("wx.cloud.callFunction is required to sync level editor drafts.");
  }
  if (this._cloudInitialized !== true && typeof this.platform.cloud.init === "function") {
    this.platform.cloud.init({
      env: this.cloudEnvId
    });
    this._cloudInitialized = true;
  }
  return this.platform.cloud;
};

LevelEditorCloudSyncService.prototype._syncBatch = function (batch) {
  if (!Array.isArray(batch) || batch.length === 0 || batch.length > SYNC_BATCH_SIZE) {
    throw new Error("Level editor cloud sync batch size must be 1-" + SYNC_BATCH_SIZE + ".");
  }
  return this._requireCloud().callFunction({
    name: this.functionName,
    data: {
      action: "sync",
      levels: batch
    }
  }).then(function (response) {
    return normalizeResponse(response, this.functionName);
  }.bind(this)).catch(function (error) {
    throw new Error("Level editor cloud sync failed: " + describeError(error));
  });
};

LevelEditorCloudSyncService.prototype.syncLevels = function (records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Level editor cloud sync requires at least one local level.");
  }
  var normalized = records.map(normalizeRecord);
  var seen = {};
  normalized.forEach(function (record) {
    if (seen[record.levelId]) {
      throw new Error("Level editor cloud sync contains duplicate levelId: " + record.levelId);
    }
    seen[record.levelId] = true;
  });

  var batches = [];
  for (var index = 0; index < normalized.length; index += SYNC_BATCH_SIZE) {
    batches.push(normalized.slice(index, index + SYNC_BATCH_SIZE));
  }

  var totalSyncedCount = 0;
  var latestSyncedAt = 0;
  return batches.reduce(function (promise, batch) {
    return promise.then(function () {
      return this._syncBatch(batch).then(function (result) {
        if (result.syncedCount !== batch.length) {
          throw new Error("Level editor cloud sync count mismatch.");
        }
        totalSyncedCount += result.syncedCount;
        latestSyncedAt = Math.max(latestSyncedAt, result.syncedAt);
      });
    }.bind(this));
  }.bind(this), Promise.resolve()).then(function () {
    return {
      syncedCount: totalSyncedCount,
      syncedAt: latestSyncedAt
    };
  });
};

LevelEditorCloudSyncService.EXPECTED_DEPLOYMENT_MARKER = EXPECTED_DEPLOYMENT_MARKER;
LevelEditorCloudSyncService.DEFAULT_FUNCTION_NAME = DEFAULT_FUNCTION_NAME;
LevelEditorCloudSyncService.SYNC_BATCH_SIZE = SYNC_BATCH_SIZE;

module.exports = LevelEditorCloudSyncService;
