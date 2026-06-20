"use strict";

var StrictStorage = require("../utils/StrictStorage");

var PROFILE_STORAGE_KEY = "bubble_world_leaderboard_profile_v1";
var PROFILE_STORAGE_NAMESPACE = "WorldLeaderboardService";
var PROFILE_STORAGE_VERSION = 1;
var DEFAULT_PROFILE_NICKNAME = "";
var DEFAULT_PROFILE_AVATAR_URL = "";

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

function normalizeCloudFunctionResult(response, functionName) {
  requireObject(response, functionName + " response");
  if (response.result && typeof response.result === "object" && !Array.isArray(response.result)) {
    return response.result;
  }
  return response;
}

function countCompletedLevels(progress) {
  requireObject(progress, "World leaderboard progress");
  requireObject(progress.completedLevels, "World leaderboard completedLevels");
  return Object.keys(progress.completedLevels).reduce(function (total, key) {
    if (progress.completedLevels[key] !== true) {
      throw new Error("World leaderboard completedLevels." + key + " must be true.");
    }
    return total + 1;
  }, 0);
}

function sumBestScores(progress) {
  requireObject(progress, "World leaderboard progress");
  requireObject(progress.bestScoresByLevel, "World leaderboard bestScoresByLevel");
  return Object.keys(progress.bestScoresByLevel).reduce(function (total, key) {
    var value = Math.floor(Number(progress.bestScoresByLevel[key]));
    return total + requireNonNegativeInteger(value, "World leaderboard bestScoresByLevel." + key);
  }, 0);
}

function normalizeUserProfile(userInfo) {
  requireObject(userInfo, "World leaderboard userInfo");
  return {
    nickname: requireString(userInfo.nickName, "World leaderboard nickName"),
    avatarUrl: requireString(userInfo.avatarUrl, "World leaderboard avatarUrl")
  };
}

function normalizeCachedUserProfileRecord(record) {
  requireObject(record, "World leaderboard cached profile record");
  if (record.version !== PROFILE_STORAGE_VERSION) {
    throw new Error("World leaderboard cached profile version must be " + PROFILE_STORAGE_VERSION + ".");
  }
  requireObject(record.profile, "World leaderboard cached profile");
  return {
    version: PROFILE_STORAGE_VERSION,
    profile: {
      nickname: requireString(record.profile.nickname, "World leaderboard cached nickname"),
      avatarUrl: requireString(record.profile.avatarUrl, "World leaderboard cached avatarUrl")
    },
    updatedAt: requireNonNegativeInteger(record.updatedAt, "World leaderboard cached updatedAt")
  };
}

function normalizeEntry(entry, index) {
  requireObject(entry, "World leaderboard entry");
  return {
    rank: requirePositiveInteger(entry.rank, "World leaderboard entry rank"),
    playerId: requireNonEmptyString(entry.playerId, "World leaderboard entry playerId"),
    nickname: requireString(entry.nickname, "World leaderboard entry nickname"),
    avatarUrl: requireString(entry.avatarUrl, "World leaderboard entry avatarUrl"),
    score: requireNonNegativeInteger(entry.score, "World leaderboard entry score"),
    completedLevels: requireNonNegativeInteger(entry.completedLevels, "World leaderboard entry completedLevels"),
    isSelf: entry.isSelf === true
  };
}

function normalizeSubmitAndListResult(result, functionName) {
  requireObject(result, functionName + " result");
  if (result.accepted !== true) {
    throw new Error(functionName + " result must be accepted.");
  }
  if (!Array.isArray(result.entries)) {
    throw new Error(functionName + " entries must be an array.");
  }
  return {
    accepted: true,
    updatedAt: requireNonNegativeInteger(result.updatedAt, functionName + " updatedAt"),
    entries: result.entries.map(normalizeEntry)
  };
}

function WorldLeaderboardService(options) {
  requireObject(options, "WorldLeaderboardService options");
  this.platform = resolvePlatform(options.platform);
  this.cloudEnvId = requireNonEmptyString(options.cloudEnvId, "WorldLeaderboardService cloudEnvId");
  this.functionName = requireNonEmptyString(options.functionName, "WorldLeaderboardService functionName");
  this.limit = requirePositiveInteger(options.limit, "WorldLeaderboardService limit");
  this.cloudInitialized = false;
}

WorldLeaderboardService.prototype._requireCloud = function () {
  if (!this.platform || !this.platform.cloud) {
    throw new Error("wx.cloud is required for world leaderboard.");
  }
  if (typeof this.platform.cloud.callFunction !== "function") {
    throw new Error("wx.cloud.callFunction is required for world leaderboard.");
  }
  if (this.cloudInitialized !== true && typeof this.platform.cloud.init === "function") {
    this.platform.cloud.init({
      env: this.cloudEnvId
    });
    this.cloudInitialized = true;
  }
  return this.platform.cloud;
};

WorldLeaderboardService.prototype.requestUserProfile = function () {
  if (!this.platform || typeof this.platform.getUserProfile !== "function") {
    throw new Error("wx.getUserProfile is required for world leaderboard.");
  }
  return new Promise(function (resolve, reject) {
    this.platform.getUserProfile({
      desc: "用于展示世界排行榜昵称和头像",
      success: function (result) {
        requireObject(result, "wx.getUserProfile result");
        resolve(normalizeUserProfile(result.userInfo));
      },
      fail: function (error) {
        reject(new Error("wx.getUserProfile failed for world leaderboard: " + JSON.stringify(error)));
      }
    });
  }.bind(this));
};

WorldLeaderboardService.prototype.loadCachedUserProfile = function () {
  var rawText = StrictStorage.readStoredText(PROFILE_STORAGE_KEY, PROFILE_STORAGE_NAMESPACE);
  if (rawText === null) {
    return null;
  }
  return normalizeCachedUserProfileRecord(JSON.parse(rawText)).profile;
};

WorldLeaderboardService.prototype.saveCachedUserProfile = function (profile) {
  requireObject(profile, "World leaderboard cached profile");
  var normalizedProfile = {
    nickname: requireString(profile.nickname, "World leaderboard cached nickname"),
    avatarUrl: requireString(profile.avatarUrl, "World leaderboard cached avatarUrl")
  };
  StrictStorage.writeJson(PROFILE_STORAGE_KEY, PROFILE_STORAGE_NAMESPACE, {
    version: PROFILE_STORAGE_VERSION,
    profile: normalizedProfile,
    updatedAt: Date.now()
  });
  return normalizedProfile;
};

WorldLeaderboardService.prototype.createAnonymousUserProfile = function () {
  return {
    nickname: DEFAULT_PROFILE_NICKNAME,
    avatarUrl: DEFAULT_PROFILE_AVATAR_URL
  };
};

WorldLeaderboardService.prototype.buildSubmission = function (progress, userProfile) {
  var profile = requireObject(userProfile, "World leaderboard user profile");
  return {
    nickname: requireString(profile.nickname, "World leaderboard nickname"),
    avatarUrl: requireString(profile.avatarUrl, "World leaderboard avatarUrl"),
    score: sumBestScores(progress),
    completedLevels: countCompletedLevels(progress)
  };
};

WorldLeaderboardService.prototype.submit = function (progress, userProfile) {
  var submission = this.buildSubmission(progress, userProfile);
  return this._requireCloud().callFunction({
    name: this.functionName,
    data: {
      action: "submit",
      profile: {
        nickname: submission.nickname,
        avatarUrl: submission.avatarUrl
      },
      score: submission.score,
      completedLevels: submission.completedLevels
    }
  }).then(function (response) {
    var result = normalizeCloudFunctionResult(response, this.functionName);
    requireObject(result, this.functionName + " submit result");
    if (result.accepted !== true) {
      throw new Error(this.functionName + " submit result must be accepted.");
    }
    return {
      accepted: true,
      updatedAt: requireNonNegativeInteger(result.updatedAt, this.functionName + " submit updatedAt")
    };
  }.bind(this));
};

WorldLeaderboardService.prototype.submitAndList = function (progress, userProfile) {
  var submission = this.buildSubmission(progress, userProfile);
  return this._requireCloud().callFunction({
    name: this.functionName,
    data: {
      action: "submitAndList",
      limit: this.limit,
      profile: {
        nickname: submission.nickname,
        avatarUrl: submission.avatarUrl
      },
      score: submission.score,
      completedLevels: submission.completedLevels
    }
  }).then(function (response) {
    return normalizeSubmitAndListResult(
      normalizeCloudFunctionResult(response, this.functionName),
      this.functionName
    );
  }.bind(this));
};

module.exports = WorldLeaderboardService;
