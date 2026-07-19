"use strict";

var crypto = require("crypto");
var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "level_editor_drafts";
var DEPLOYMENT_MARKER = "levelEditorDrafts_v20260718_v1";
var MAX_BATCH_SIZE = 20;
var MAX_CONFIG_BYTES = 800 * 1024;

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

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

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeConfig(rawConfig, expectedLevelId, index) {
  var config = requireObject(rawConfig, "level editor draft config " + index);
  if (config.schemaVersion !== 1) {
    throw new Error("level editor draft schemaVersion must be 1: " + expectedLevelId);
  }
  requireNonEmptyString(config.coordinateSystem, "level editor draft coordinateSystem " + index);
  var level = requireObject(config.level, "level editor draft level " + index);
  var levelId = requirePositiveInteger(level.levelId, "level editor draft config levelId " + index);
  if (levelId !== expectedLevelId) {
    throw new Error("level editor draft config levelId mismatch: " + expectedLevelId);
  }
  requireNonEmptyString(level.code, "level editor draft level code " + index);
  if (!Array.isArray(level.layout) || level.layout.length === 0) {
    throw new Error("level editor draft layout must be a non-empty array: " + levelId);
  }
  if (!Array.isArray(level.specialEntities)) {
    throw new Error("level editor draft specialEntities must be an array: " + levelId);
  }
  var normalized = clone(config);
  var bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > MAX_CONFIG_BYTES) {
    throw new Error("level editor draft config exceeds byte limit: " + levelId + ", bytes=" + bytes);
  }
  return normalized;
}

function normalizeLevels(rawLevels) {
  if (!Array.isArray(rawLevels) || rawLevels.length === 0 || rawLevels.length > MAX_BATCH_SIZE) {
    throw new Error("level editor draft batch size must be 1-" + MAX_BATCH_SIZE + ".");
  }
  var seen = {};
  return rawLevels.map(function (rawRecord, index) {
    var record = requireObject(rawRecord, "level editor draft record " + index);
    var levelId = requirePositiveInteger(record.levelId, "level editor draft levelId " + index);
    if (seen[levelId]) {
      throw new Error("level editor draft contains duplicate levelId: " + levelId);
    }
    seen[levelId] = true;
    return {
      levelId: levelId,
      updatedAt: requireNonNegativeInteger(record.updatedAt, "level editor draft updatedAt " + index),
      config: normalizeConfig(record.config, levelId, index)
    };
  });
}

function buildOwnerKey(openid) {
  return crypto.createHash("sha1").update(openid).digest("hex");
}

function buildRecordId(ownerKey, levelId) {
  return "level_editor_draft_" + ownerKey + "_" + levelId;
}

async function syncDrafts(collection, openid, levels) {
  var ownerKey = buildOwnerKey(openid);
  var syncedAt = Date.now();
  await Promise.all(levels.map(async function (record) {
    var recordId = buildRecordId(ownerKey, record.levelId);
    var result = await collection.doc(recordId).set({
      data: {
        openid: openid,
        source: "local_level_editor",
        draftVersion: 1,
        levelId: record.levelId,
        localUpdatedAt: record.updatedAt,
        syncedAt: syncedAt,
        config: record.config
      }
    });
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Save level editor draft failed: " + record.levelId);
    }
  }));
  return {
    deploymentMarker: DEPLOYMENT_MARKER,
    accepted: true,
    syncedCount: levels.length,
    syncedAt: syncedAt
  };
}

exports.main = async function (event) {
  requireObject(event, "levelEditorDrafts event");
  var action = requireNonEmptyString(event.action, "levelEditorDrafts action");
  if (action !== "sync") {
    throw new Error("Unsupported levelEditorDrafts action: " + action);
  }
  var context = cloud.getWXContext();
  var openid = requireNonEmptyString(context.OPENID, "level editor OPENID");
  var levels = normalizeLevels(event.levels);
  return syncDrafts(cloud.database().collection(COLLECTION_NAME), openid, levels);
};
