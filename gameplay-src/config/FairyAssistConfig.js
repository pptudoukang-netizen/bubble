"use strict";

var COLOR_RULES = [
  {
    color: "red",
    minEliminated: 1,
    maxEliminated: 5,
    bonusStep: 1,
    canSplit: false,
    prefabPath: "prefabs/genius_red"
  },
  {
    color: "yellow",
    minEliminated: 6,
    maxEliminated: 9,
    bonusStep: 2,
    canSplit: false,
    prefabPath: "prefabs/genius_yellow"
  },
  {
    color: "green",
    minEliminated: 10,
    maxEliminated: Number.MAX_SAFE_INTEGER,
    bonusStep: 3,
    canSplit: true,
    prefabPath: "prefabs/genius_green"
  }
];

var SLOTS = [
  { index: 0, nodeName: "genius1" },
  { index: 1, nodeName: "genius2" },
  { index: 2, nodeName: "genius3" },
  { index: 3, nodeName: "genius4" },
  { index: 4, nodeName: "genius5" },
  { index: 5, nodeName: "genius6" }
];

function requirePositiveFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive finite number.");
  }
}

function validateColorRules(rules) {
  if (!Array.isArray(rules) || rules.length !== 3) {
    throw new Error("FairyAssistConfig.colorRules must define red, yellow and green.");
  }

  var expectedMin = 1;
  var seenColors = {};
  rules.forEach(function (rule, index) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error("FairyAssistConfig color rule must be an object at index " + index + ".");
    }
    if (typeof rule.color !== "string" || !rule.color) {
      throw new Error("FairyAssistConfig color rule requires color at index " + index + ".");
    }
    if (seenColors[rule.color]) {
      throw new Error("FairyAssistConfig color is duplicated: " + rule.color);
    }
    seenColors[rule.color] = true;
    if (!Number.isInteger(rule.minEliminated) || rule.minEliminated !== expectedMin) {
      throw new Error("FairyAssistConfig color ranges must be contiguous at " + rule.color + ".");
    }
    if (!Number.isInteger(rule.maxEliminated) || rule.maxEliminated < rule.minEliminated) {
      throw new Error("FairyAssistConfig maxEliminated is invalid for " + rule.color + ".");
    }
    if (!Number.isInteger(rule.bonusStep) || rule.bonusStep <= 0) {
      throw new Error("FairyAssistConfig bonusStep is invalid for " + rule.color + ".");
    }
    if (typeof rule.canSplit !== "boolean") {
      throw new Error("FairyAssistConfig canSplit must be boolean for " + rule.color + ".");
    }
    if (typeof rule.prefabPath !== "string" || !rule.prefabPath) {
      throw new Error("FairyAssistConfig prefabPath is required for " + rule.color + ".");
    }
    expectedMin = rule.maxEliminated + 1;
  });

  if (!seenColors.red || !seenColors.yellow || !seenColors.green) {
    throw new Error("FairyAssistConfig must include red, yellow and green color rules.");
  }
  if (rules[rules.length - 1].maxEliminated !== Number.MAX_SAFE_INTEGER) {
    throw new Error("FairyAssistConfig final color range must cover every positive elimination count.");
  }
}

function validateSlots(slots) {
  if (!Array.isArray(slots) || slots.length !== 6) {
    throw new Error("FairyAssistConfig.slots must define exactly six slots.");
  }

  var nodeNames = {};
  slots.forEach(function (slot, index) {
    if (!slot || slot.index !== index) {
      throw new Error("FairyAssistConfig slot indexes must be contiguous from zero.");
    }
    if (typeof slot.nodeName !== "string" || !slot.nodeName) {
      throw new Error("FairyAssistConfig slot nodeName is required at index " + index + ".");
    }
    if (nodeNames[slot.nodeName]) {
      throw new Error("FairyAssistConfig slot nodeName is duplicated: " + slot.nodeName);
    }
    nodeNames[slot.nodeName] = true;
  });
}

validateColorRules(COLOR_RULES);
validateSlots(SLOTS);

var CONFIG = {
  colorRules: COLOR_RULES,
  slots: SLOTS,
  removeCountOnMiss: 2,
  maxCollisionsPerFairy: 7,
  fairyCollisionRadius: 20,
  bounceDamping: 0.82,
  minimumUpwardSpeed: 180,
  splitAngleDegrees: 18,
  spriteWidth: 200,
  spriteHeight: 160,
  dropCollisionGlowScale: 86 / 72,
  maxGlowStacks: 7
};

if (!Number.isInteger(CONFIG.removeCountOnMiss) || CONFIG.removeCountOnMiss <= 0) {
  throw new Error("FairyAssistConfig.removeCountOnMiss must be a positive integer.");
}
if (!Number.isInteger(CONFIG.maxCollisionsPerFairy) || CONFIG.maxCollisionsPerFairy <= 0) {
  throw new Error("FairyAssistConfig.maxCollisionsPerFairy must be a positive integer.");
}
requirePositiveFiniteNumber(CONFIG.fairyCollisionRadius, "FairyAssistConfig.fairyCollisionRadius");
requirePositiveFiniteNumber(CONFIG.bounceDamping, "FairyAssistConfig.bounceDamping");
requirePositiveFiniteNumber(CONFIG.minimumUpwardSpeed, "FairyAssistConfig.minimumUpwardSpeed");
requirePositiveFiniteNumber(CONFIG.splitAngleDegrees, "FairyAssistConfig.splitAngleDegrees");
requirePositiveFiniteNumber(CONFIG.spriteWidth, "FairyAssistConfig.spriteWidth");
requirePositiveFiniteNumber(CONFIG.spriteHeight, "FairyAssistConfig.spriteHeight");
requirePositiveFiniteNumber(CONFIG.dropCollisionGlowScale, "FairyAssistConfig.dropCollisionGlowScale");
if (!Number.isInteger(CONFIG.maxGlowStacks) || CONFIG.maxGlowStacks <= 0) {
  throw new Error("FairyAssistConfig.maxGlowStacks must be a positive integer.");
}

COLOR_RULES.forEach(Object.freeze);
SLOTS.forEach(Object.freeze);
Object.freeze(COLOR_RULES);
Object.freeze(SLOTS);

module.exports = Object.freeze(CONFIG);
