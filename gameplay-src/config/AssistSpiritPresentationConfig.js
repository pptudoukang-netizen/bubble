"use strict";

var SPIRIT_IDS = [
  "milu",
  "lumi",
  "noya",
  "flora",
  "loco",
  "kelu",
  "yumi"
];

var PRESENTATION_BY_SPIRIT_ID = {};

SPIRIT_IDS.forEach(function (spiritId) {
  PRESENTATION_BY_SPIRIT_ID[spiritId] = {
    spiritId: spiritId,
    skeletonDataPath: "game/spine/diqiushou",
    skinName: spiritId,
    idleClipName: "idle",
    deliverClipName: "passball",
    winClipName: "win",
    loseClipName: "fail"
  };
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requirePresentation(spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Assist spirit presentation requires spiritId.");
  }
  var presentation = PRESENTATION_BY_SPIRIT_ID[spiritId];
  if (!presentation) {
    throw new Error("Unknown assist spirit presentation: " + spiritId);
  }
  return presentation;
}

module.exports = {
  getSpiritIds: function () {
    return SPIRIT_IDS.slice();
  },
  getBySpiritId: function (spiritId) {
    return clone(requirePresentation(spiritId));
  }
};
