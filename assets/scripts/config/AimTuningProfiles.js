"use strict";

var BoardLayout = require("./BoardLayout");

var AIM_KEYS = [
  "aimCollisionRadius",
  "aimTunnelAssistRadius",
  "aimSlotProbeRadius",
  "aimSlotCaptureTightness",
  "aimSlotOpenMinAlignment",
  "aimSlotVsBubbleTieDistance",
  "aimSlotPriorityConfidence"
];

var AIM_LIMITS = {
  aimCollisionRadius: { min: BoardLayout.bubbleRadius, max: BoardLayout.bubbleDiameter },
  aimTunnelAssistRadius: { min: BoardLayout.bubbleRadius, max: BoardLayout.bubbleDiameter },
  aimSlotProbeRadius: { min: 10, max: BoardLayout.bubbleRadius },
  aimSlotCaptureTightness: { min: 0.45, max: 1 },
  aimSlotOpenMinAlignment: { min: -0.2, max: 0.95 },
  aimSlotVsBubbleTieDistance: { min: 0, max: BoardLayout.bubbleDiameter },
  aimSlotPriorityConfidence: { min: 0, max: 1 }
};

var AIM_BASE_DEFAULTS = {
  aimCollisionRadius: Math.max(BoardLayout.bubbleRadius, BoardLayout.collisionDistance - 4),
  aimTunnelAssistRadius: Math.max(BoardLayout.bubbleRadius, BoardLayout.collisionDistance - 12),
  aimSlotProbeRadius: Math.max(12, BoardLayout.bubbleRadius * 0.62),
  aimSlotCaptureTightness: 0.78,
  aimSlotOpenMinAlignment: 0.2,
  aimSlotVsBubbleTieDistance: 14,
  aimSlotPriorityConfidence: 0.58
};

var DIFFICULTY_PROFILES = {
  tutorial: {
    aimCollisionRadius: 60,
    aimTunnelAssistRadius: 46,
    aimSlotProbeRadius: 24,
    aimSlotCaptureTightness: 0.83,
    aimSlotOpenMinAlignment: 0.1,
    aimSlotVsBubbleTieDistance: 18,
    aimSlotPriorityConfidence: 0.54
  },
  easy: {
    aimCollisionRadius: 59,
    aimTunnelAssistRadius: 44,
    aimSlotProbeRadius: 24,
    aimSlotCaptureTightness: 0.8,
    aimSlotOpenMinAlignment: 0.16,
    aimSlotVsBubbleTieDistance: 16,
    aimSlotPriorityConfidence: 0.56
  },
  normal: {
    aimCollisionRadius: 58,
    aimTunnelAssistRadius: 42,
    aimSlotProbeRadius: 23,
    aimSlotCaptureTightness: 0.78,
    aimSlotOpenMinAlignment: 0.2,
    aimSlotVsBubbleTieDistance: 14,
    aimSlotPriorityConfidence: 0.58
  },
  hard: {
    aimCollisionRadius: 56,
    aimTunnelAssistRadius: 40,
    aimSlotProbeRadius: 22,
    aimSlotCaptureTightness: 0.74,
    aimSlotOpenMinAlignment: 0.28,
    aimSlotVsBubbleTieDistance: 11,
    aimSlotPriorityConfidence: 0.62
  }
};
var DIFFICULTY_ALIASES = {
  beginner: "tutorial",
  medium: "normal",
  difficult: "hard",
  expert: "hard"
};

var NAMED_PROFILES = {
  default: {},
  precision: {
    aimCollisionRadius: 55,
    aimTunnelAssistRadius: 39,
    aimSlotProbeRadius: 21,
    aimSlotCaptureTightness: 0.73,
    aimSlotOpenMinAlignment: 0.32,
    aimSlotVsBubbleTieDistance: 10,
    aimSlotPriorityConfidence: 0.65
  },
  forgiving: {
    aimCollisionRadius: 61,
    aimTunnelAssistRadius: 48,
    aimSlotProbeRadius: 24,
    aimSlotCaptureTightness: 0.85,
    aimSlotOpenMinAlignment: 0.08,
    aimSlotVsBubbleTieDistance: 20,
    aimSlotPriorityConfidence: 0.52
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeName(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  var normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

function sanitizeAimValues(values) {
  var sanitized = {};

  AIM_KEYS.forEach(function (key) {
    var limit = AIM_LIMITS[key];
    var numericValue = typeof values[key] === "number" ? values[key] : AIM_BASE_DEFAULTS[key];
    sanitized[key] = clamp(numericValue, limit.min, limit.max);
  });

  if (sanitized.aimTunnelAssistRadius > sanitized.aimCollisionRadius) {
    sanitized.aimTunnelAssistRadius = sanitized.aimCollisionRadius;
  }

  return sanitized;
}

function resolveDifficulty(difficulty) {
  if (DIFFICULTY_PROFILES[difficulty]) {
    return difficulty;
  }

  return DIFFICULTY_ALIASES[difficulty] || "normal";
}

function resolveDefaultProfile(difficulty) {
  return DIFFICULTY_PROFILES[resolveDifficulty(difficulty)] || DIFFICULTY_PROFILES.normal;
}

function resolveNamedProfile(profileName) {
  return NAMED_PROFILES[profileName] || null;
}

function applyToLevel(level) {
  var requestedDifficulty = normalizeName(level && level.difficulty, "normal");
  var difficulty = resolveDifficulty(requestedDifficulty);
  var explicitProfileName = normalizeName(level && level.aimProfile, "");
  var difficultyDefaults = resolveDefaultProfile(difficulty);
  var namedProfile = explicitProfileName ? resolveNamedProfile(explicitProfileName) : null;

  var merged = Object.assign({}, AIM_BASE_DEFAULTS, difficultyDefaults);
  if (namedProfile) {
    merged = Object.assign(merged, namedProfile);
  }

  AIM_KEYS.forEach(function (key) {
    if (level && typeof level[key] === "number") {
      merged[key] = level[key];
    }
  });

  var sanitized = sanitizeAimValues(merged);

  AIM_KEYS.forEach(function (key) {
    level[key] = sanitized[key];
  });

  return {
    requestedDifficulty: requestedDifficulty,
    difficulty: difficulty,
    profile: namedProfile ? explicitProfileName : "difficulty:" + difficulty,
    hasExplicitProfile: !!namedProfile,
    explicitProfileName: namedProfile ? explicitProfileName : null,
    values: clone(sanitized)
  };
}

module.exports = {
  aimKeys: AIM_KEYS,
  aimLimits: AIM_LIMITS,
  baseDefaults: AIM_BASE_DEFAULTS,
  difficultyProfiles: DIFFICULTY_PROFILES,
  namedProfiles: NAMED_PROFILES,
  applyToLevel: applyToLevel,
  sanitizeAimValues: sanitizeAimValues
};




