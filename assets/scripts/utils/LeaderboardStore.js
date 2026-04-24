"use strict";

var SELF_PLAYER_ID = "self";
var MAX_RANK_ENTRIES = 10;

var SAMPLE_PLAYERS = [
  { playerId: "friend_01", nickname: "\u661f\u661f\u7cd6", score: 1860, completedLevels: 18 },
  { playerId: "friend_02", nickname: "\u6d77\u76d0\u6ce1\u6ce1", score: 1640, completedLevels: 16 },
  { playerId: "friend_03", nickname: "\u7d2b\u4e91", score: 1420, completedLevels: 14 },
  { playerId: "friend_04", nickname: "\u6708\u5149\u8d1d", score: 1210, completedLevels: 12 },
  { playerId: "friend_05", nickname: "\u5c0f\u6c14\u7403", score: 980, completedLevels: 10 },
  { playerId: "friend_06", nickname: "\u751c\u5fc3", score: 760, completedLevels: 8 },
  { playerId: "friend_07", nickname: "\u6674\u5929", score: 540, completedLevels: 6 }
];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function toSafeInt(value) {
  var parsed = Math.floor(Number(value) || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeProgress(progress) {
  return progress && typeof progress === "object"
    ? progress
    : {
      highestUnlockedLevel: 1,
      completedLevels: {},
      starsByLevel: {}
    };
}

function countCompletedLevels(completedLevels) {
  var source = completedLevels && typeof completedLevels === "object" ? completedLevels : {};
  return Object.keys(source).filter(function (levelId) {
    return !!source[levelId];
  }).length;
}

function countStars(starsByLevel) {
  var source = starsByLevel && typeof starsByLevel === "object" ? starsByLevel : {};
  return Object.keys(source).reduce(function (total, levelId) {
    var stars = toSafeInt(source[levelId]);
    return total + Math.min(3, stars);
  }, 0);
}

function resolveSelfScore(progress) {
  var normalized = normalizeProgress(progress);
  var completedCount = countCompletedLevels(normalized.completedLevels);
  var starCount = countStars(normalized.starsByLevel);
  var highestUnlocked = Math.max(1, toSafeInt(normalized.highestUnlockedLevel));

  return (completedCount * 80) + (starCount * 45) + ((highestUnlocked - 1) * 20);
}

function LeaderboardStore(options) {
  options = options || {};
  this.maxEntries = Math.max(3, Math.floor(Number(options.maxEntries) || MAX_RANK_ENTRIES));
}

LeaderboardStore.prototype.buildEntries = function (progress, playerName) {
  var selfName = typeof playerName === "string" && playerName
    ? playerName
    : "\u6211";
  var normalized = normalizeProgress(progress);
  var entries = clone(SAMPLE_PLAYERS);

  entries.push({
    playerId: SELF_PLAYER_ID,
    nickname: selfName,
    score: resolveSelfScore(normalized),
    completedLevels: countCompletedLevels(normalized.completedLevels),
    isSelf: true
  });

  entries.sort(function (left, right) {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return String(left.nickname).localeCompare(String(right.nickname));
  });

  return entries.slice(0, this.maxEntries).map(function (entry, index) {
    return {
      rank: index + 1,
      playerId: entry.playerId,
      nickname: entry.nickname,
      score: toSafeInt(entry.score),
      completedLevels: toSafeInt(entry.completedLevels),
      isSelf: entry.isSelf === true
    };
  });
};

LeaderboardStore.prototype.resolveSelfRank = function (progress, playerName) {
  var entries = this.buildEntries(progress, playerName);
  for (var i = 0; i < entries.length; i += 1) {
    if (entries[i].isSelf) {
      return entries[i];
    }
  }
  return null;
};

LeaderboardStore.resolveSelfScore = resolveSelfScore;

module.exports = LeaderboardStore;
