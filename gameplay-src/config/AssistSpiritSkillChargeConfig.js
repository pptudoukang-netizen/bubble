"use strict";

var AssistSpiritConfig = require("../../assets/scripts/config/AssistSpiritConfig");

function requireGlobalSkillSpiritId(spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Assist spirit skill charge requires spiritId.");
  }
  return spiritId;
}

module.exports = {
  getMaxCharge: function (spiritId, level) {
    requireGlobalSkillSpiritId(spiritId);
    var abilityConfig = AssistSpiritConfig.getAbilityRuntimeConfig(spiritId);
    if (abilityConfig.abilityType !== "global_skill") {
      throw new Error("Assist spirit skill charge requires a global-skill spirit: " + spiritId);
    }
    return AssistSpiritConfig.getGlobalSkillChargeMax(level);
  }
};
