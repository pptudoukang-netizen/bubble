"use strict";

var crypto = require("crypto");
var cloud = require("wx-server-sdk");

var COLLECTION_NAME = "world_leaderboard";
var DEPLOYMENT_MARKER = "worldLeaderboard_v20260619_2";

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

function requireString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  return value.trim();
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function buildLeaderboardRecordId(openid) {
  var digest = crypto.createHash("sha1").update(openid).digest("hex");
  return "world_rank_" + digest;
}

function buildPlayerId(openid) {
  return crypto.createHash("sha1").update(openid).digest("hex");
}

function normalizeLimit(value) {
  var limit = requirePositiveInteger(value, "worldLeaderboard limit");
  if (limit > 100) {
    throw new Error("worldLeaderboard limit must be <= 100.");
  }
  return limit;
}

function normalizeProfile(profile) {
  requireObject(profile, "worldLeaderboard profile");
  return {
    nickname: requireString(profile.nickname, "worldLeaderboard nickname"),
    avatarUrl: requireString(profile.avatarUrl, "worldLeaderboard avatarUrl")
  };
}

function normalizeSubmission(event, options) {
  requireObject(event, "worldLeaderboard event");
  var settings = options || {};
  var submission = {
    profile: normalizeProfile(event.profile),
    score: requireNonNegativeInteger(event.score, "worldLeaderboard score"),
    completedLevels: requireNonNegativeInteger(event.completedLevels, "worldLeaderboard completedLevels")
  };
  if (settings.requireLimit === true) {
    submission.limit = normalizeLimit(event.limit);
  }
  return submission;
}

function normalizeRecord(record, selfOpenid, rank) {
  requireObject(record, "worldLeaderboard record");
  return {
    rank: requirePositiveInteger(rank, "worldLeaderboard rank"),
    playerId: requireNonEmptyString(record.playerId, "worldLeaderboard playerId"),
    nickname: requireString(record.nickname, "worldLeaderboard record nickname"),
    avatarUrl: requireString(record.avatarUrl, "worldLeaderboard record avatarUrl"),
    score: requireNonNegativeInteger(record.score, "worldLeaderboard record score"),
    completedLevels: requireNonNegativeInteger(record.completedLevels, "worldLeaderboard record completedLevels"),
    isSelf: requireNonEmptyString(record.openid, "worldLeaderboard record openid") === selfOpenid
  };
}

function compareRecords(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.completedLevels !== left.completedLevels) {
    return right.completedLevels - left.completedLevels;
  }
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt - right.updatedAt;
  }
  return String(left.playerId).localeCompare(String(right.playerId));
}

async function submitRecord(collection, openid, event) {
  var submission = normalizeSubmission(event, {
    requireLimit: event.action === "submitAndList"
  });
  var now = Date.now();
  var recordId = buildLeaderboardRecordId(openid);
  var result = await collection.doc(recordId).set({
    data: {
      openid: openid,
      playerId: buildPlayerId(openid),
      nickname: submission.profile.nickname,
      avatarUrl: submission.profile.avatarUrl,
      score: submission.score,
      completedLevels: submission.completedLevels,
      updatedAt: now
    }
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Save world leaderboard record failed.");
  }
  return {
    updatedAt: now,
    limit: submission.limit
  };
}

async function listRecords(collection, openid, limit) {
  var result = await collection
    .orderBy("score", "desc")
    .orderBy("completedLevels", "desc")
    .orderBy("updatedAt", "asc")
    .limit(limit)
    .get();
  if (!result || !Array.isArray(result.data)) {
    throw new Error("Get world leaderboard query result is invalid.");
  }
  var sortedRecords = result.data.slice().sort(compareRecords);
  return sortedRecords.map(function (record, index) {
    return normalizeRecord(record, openid, index + 1);
  });
}

exports.main = async function (event) {
  console.log("[Bubble]", DEPLOYMENT_MARKER, "invoked");
  requireObject(event, "worldLeaderboard event");
  var action = requireNonEmptyString(event.action, "worldLeaderboard action");
  var context = cloud.getWXContext();
  var openid = requireNonEmptyString(context.OPENID, "player OPENID");
  var collection = cloud.database().collection(COLLECTION_NAME);

  if (action === "submit") {
    var submitResult = await submitRecord(collection, openid, event);
    return {
      accepted: true,
      updatedAt: submitResult.updatedAt
    };
  }

  if (action === "submitAndList") {
    var submissionResult = await submitRecord(collection, openid, event);
    var entries = await listRecords(collection, openid, submissionResult.limit);
    return {
      accepted: true,
      updatedAt: submissionResult.updatedAt,
      entries: entries
    };
  }

  throw new Error("Unsupported worldLeaderboard action: " + action);
};
