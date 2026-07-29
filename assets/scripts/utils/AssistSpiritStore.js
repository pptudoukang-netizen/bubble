"use strict";

var StrictStorage = require("./StrictStorage");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var STORAGE_KEY = "bubble_assist_spirit_state_v1";
var NAMESPACE = "AssistSpiritStore";
var VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
}

function requireNonNegativeInteger(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function createInitialState() {
  var spirits = {};
  AssistSpiritConfig.getCatalog().forEach(function (spirit) {
    spirits[spirit.id] = {
      owned: true,
      level: 1,
      stars: 1,
      fragments: 0
    };
  });
  return {
    version: VERSION,
    equippedSpiritId: AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID,
    spirits: spirits
  };
}

function normalizeState(rawState) {
  assertObject(rawState, "Assist spirit state");
  if (rawState.version !== VERSION) {
    throw new Error("Assist spirit state version must be " + VERSION + ".");
  }
  AssistSpiritConfig.getSpirit(rawState.equippedSpiritId);
  assertObject(rawState.spirits, "Assist spirit roster state");

  var catalog = AssistSpiritConfig.getCatalog();
  var expectedIds = catalog.map(function (spirit) {
    return spirit.id;
  });
  var storedIds = Object.keys(rawState.spirits);
  if (
    storedIds.length !== expectedIds.length ||
    storedIds.some(function (spiritId) {
      return expectedIds.indexOf(spiritId) < 0;
    })
  ) {
    throw new Error("Assist spirit roster state must exactly match configured spirit ids.");
  }

  var spirits = {};
  catalog.forEach(function (spirit) {
    var entry = rawState.spirits[spirit.id];
    assertObject(entry, "Assist spirit state `" + spirit.id + "`");
    if (entry.owned !== true) {
      throw new Error("Configured assist spirit must be owned in current roster: " + spirit.id);
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > AssistSpiritConfig.MAX_LEVEL) {
      throw new Error("Assist spirit level is invalid: " + spirit.id);
    }
    if (!Number.isInteger(entry.stars) || entry.stars < 1 || entry.stars > AssistSpiritConfig.MAX_STARS) {
      throw new Error("Assist spirit stars are invalid: " + spirit.id);
    }
    spirits[spirit.id] = {
      owned: true,
      level: entry.level,
      stars: entry.stars,
      fragments: requireNonNegativeInteger(entry.fragments, "Assist spirit fragments `" + spirit.id + "`")
    };
  });

  if (!spirits[rawState.equippedSpiritId].owned) {
    throw new Error("Equipped assist spirit must be owned.");
  }

  return {
    version: VERSION,
    equippedSpiritId: rawState.equippedSpiritId,
    spirits: spirits
  };
}

function AssistSpiritStore() {}

AssistSpiritStore.prototype.load = function () {
  return clone(normalizeState(StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState)));
};

AssistSpiritStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  return clone(normalized);
};

AssistSpiritStore.prototype.buildLevelUpgrade = function (state, spiritId, coinBalance) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  var entry = normalized.spirits[spiritConfig.id];
  var currentCoins = requireNonNegativeInteger(coinBalance, "Assist spirit upgrade coin balance");
  var cost = AssistSpiritConfig.getLevelUpCoinCost(entry.level);
  if (cost === null) {
    return {
      accepted: false,
      reason: "MAX_LEVEL",
      state: clone(normalized)
    };
  }
  if (currentCoins < cost) {
    return {
      accepted: false,
      reason: "COIN_NOT_ENOUGH",
      cost: cost,
      state: clone(normalized)
    };
  }
  entry.level += 1;
  return {
    accepted: true,
    cost: cost,
    state: clone(normalized)
  };
};

AssistSpiritStore.prototype.buildStarAdvance = function (state, spiritId) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  var entry = normalized.spirits[spiritConfig.id];
  var cost = AssistSpiritConfig.getStarUpFragmentCost(entry.stars);
  if (cost === null) {
    return {
      accepted: false,
      reason: "MAX_STARS",
      state: clone(normalized)
    };
  }
  if (entry.fragments < cost) {
    return {
      accepted: false,
      reason: "FRAGMENT_NOT_ENOUGH",
      cost: cost,
      state: clone(normalized)
    };
  }
  entry.fragments -= cost;
  entry.stars += 1;
  return {
    accepted: true,
    cost: cost,
    state: clone(normalized)
  };
};

AssistSpiritStore.prototype.buildEquip = function (state, spiritId) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  if (!normalized.spirits[spiritConfig.id].owned) {
    throw new Error("Cannot equip an unowned assist spirit: " + spiritConfig.id);
  }
  normalized.equippedSpiritId = spiritConfig.id;
  return clone(normalized);
};

AssistSpiritStore.STORAGE_KEY = STORAGE_KEY;
AssistSpiritStore.NAMESPACE = NAMESPACE;
AssistSpiritStore.createInitialState = createInitialState;
AssistSpiritStore.normalizeState = normalizeState;

module.exports = AssistSpiritStore;
