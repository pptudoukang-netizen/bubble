"use strict";

var TORNADO_PATH_MARGIN = 120;
var TORNADO_PATH_INFLUENCE_RADIUS = 96;
var TORNADO_PATH_SAMPLE_SEGMENTS = 36;

var SKILLS_BY_SPIRIT = {
  milu: {
    spiritId: "milu",
    skillId: null,
    iconPath: null
  },
  lumi: {
    spiritId: "lumi",
    skillId: null,
    iconPath: null
  },
  noya: {
    spiritId: "noya",
    skillId: "tornado",
    iconPath: "game/image/skill/icon/skill_tornado",
    effectPath: "game/image/skill/tornado",
    effectDuration: 0.8,
    pathMargin: TORNADO_PATH_MARGIN,
    pathInfluenceRadius: TORNADO_PATH_INFLUENCE_RADIUS,
    pathSampleSegments: TORNADO_PATH_SAMPLE_SEGMENTS,
    copyable: true
  },
  flora: {
    spiritId: "flora",
    skillId: "release_vines",
    iconPath: "game/image/skill/icon/skill_release_vines",
    effectDuration: 0.36,
    copyable: true
  },
  loco: {
    spiritId: "loco",
    skillId: "permanent_thaw",
    iconPath: "game/image/skill/icon/skill_thaw",
    effectDuration: 0.36,
    copyable: true
  },
  kelu: {
    spiritId: "kelu",
    skillId: "lightning_chain",
    iconPath: "game/image/skill/icon/skill_lighting",
    effectDuration: 0.7,
    copyable: true
  },
  yumi: {
    spiritId: "yumi",
    skillId: "starlight_priority",
    iconPath: "game/image/skill/icon/skill_star",
    effectDuration: 0.4,
    copyable: false
  }
};

var YUMI_PRIORITY = [
  "release_vines",
  "permanent_thaw",
  "lightning_chain",
  "tornado"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireSpiritId(spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Assist spirit skill config requires spiritId.");
  }
  var config = SKILLS_BY_SPIRIT[spiritId];
  if (!config) {
    throw new Error("Unknown assist spirit skill config: " + spiritId);
  }
  return config;
}

function getSpiritIdForSkill(skillId) {
  var matchedSpiritId = null;
  Object.keys(SKILLS_BY_SPIRIT).forEach(function (spiritId) {
    var config = SKILLS_BY_SPIRIT[spiritId];
    if (config.skillId === skillId) {
      if (matchedSpiritId) {
        throw new Error("Assist spirit skillId must be unique: " + skillId);
      }
      matchedSpiritId = spiritId;
    }
  });
  if (!matchedSpiritId) {
    throw new Error("Unknown assist spirit skillId: " + skillId);
  }
  return matchedSpiritId;
}

function getAllSpritePaths() {
  var pathMap = {};
  Object.keys(SKILLS_BY_SPIRIT).forEach(function (spiritId) {
    var config = requireSpiritId(spiritId);
    if (config.iconPath) {
      pathMap[config.iconPath] = true;
    }
    if (config.effectPath) {
      pathMap[config.effectPath] = true;
    }
  });
  return Object.keys(pathMap);
}

module.exports = {
  TORNADO_PATH_MARGIN: TORNADO_PATH_MARGIN,
  TORNADO_PATH_INFLUENCE_RADIUS: TORNADO_PATH_INFLUENCE_RADIUS,
  TORNADO_PATH_SAMPLE_SEGMENTS: TORNADO_PATH_SAMPLE_SEGMENTS,
  YUMI_PRIORITY: YUMI_PRIORITY.slice(),
  getBySpiritId: function (spiritId) {
    return clone(requireSpiritId(spiritId));
  },
  getBySkillId: function (skillId) {
    return clone(requireSpiritId(getSpiritIdForSkill(skillId)));
  },
  getAllSpritePaths: getAllSpritePaths
};
