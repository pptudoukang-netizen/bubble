"use strict";

var StrictStorage = require("./StrictStorage");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");
var AssistSpiritRescueConfig = require("../config/AssistSpiritRescueConfig");

var STORAGE_KEY = "bubble_assist_spirit_state_v1";
var NAMESPACE = "AssistSpiritStore";
var VERSION = 4;
var LEGACY_VERSION = 1;
var LEVEL_SCALE_VERSION = 2;
var STAR_VERSION = 3;
var PREVIOUS_MAX_LEVEL = 20;

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
      owned: spirit.id === AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID,
      level: 1,
      fragments: 0
    };
  });
  return {
    version: VERSION,
    equippedSpiritId: AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID,
    spirits: spirits
  };
}

function migrateVersion1State(rawState) {
  AssistSpiritConfig.getSpirit(rawState.equippedSpiritId);
  assertObject(rawState.spirits, "Assist spirit v1 roster state");
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
    throw new Error("Assist spirit v1 roster state must exactly match configured spirit ids.");
  }
  var migrated = {
    version: LEVEL_SCALE_VERSION,
    equippedSpiritId: AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID,
    spirits: {}
  };
  catalog.forEach(function (spirit) {
    var entry = rawState.spirits[spirit.id];
    assertObject(entry, "Assist spirit v1 state `" + spirit.id + "`");
    if (entry.owned !== true) {
      throw new Error("Assist spirit v1 owned flag must be true: " + spirit.id);
    }
    migrated.spirits[spirit.id] = {
      owned: spirit.id === AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID,
      level: entry.level,
      stars: entry.stars,
      fragments: entry.fragments
    };
  });
  return migrated;
}

function migrateVersion2State(rawState) {
  AssistSpiritConfig.getSpirit(rawState.equippedSpiritId);
  assertObject(rawState.spirits, "Assist spirit v2 roster state");
  var migrated = clone(rawState);
  migrated.version = STAR_VERSION;
  AssistSpiritConfig.getCatalog().forEach(function (spirit) {
    var entry = migrated.spirits[spirit.id];
    assertObject(entry, "Assist spirit v2 state `" + spirit.id + "`");
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > PREVIOUS_MAX_LEVEL) {
      throw new Error("Assist spirit v2 level is invalid: " + spirit.id);
    }
    entry.level = Math.ceil(entry.level / 2);
  });
  return migrated;
}

function migrateVersion3State(rawState) {
  AssistSpiritConfig.getSpirit(rawState.equippedSpiritId);
  assertObject(rawState.spirits, "Assist spirit v3 roster state");
  var migrated = clone(rawState);
  migrated.version = VERSION;
  AssistSpiritConfig.getCatalog().forEach(function (spirit) {
    var entry = migrated.spirits[spirit.id];
    assertObject(entry, "Assist spirit v3 state `" + spirit.id + "`");
    if (!Number.isInteger(entry.stars) || entry.stars < 1 || entry.stars > 5) {
      throw new Error("Assist spirit v3 stars are invalid: " + spirit.id);
    }
    delete entry.stars;
  });
  return migrated;
}

function normalizeState(rawState) {
  assertObject(rawState, "Assist spirit state");
  if (rawState.version === LEGACY_VERSION) {
    rawState = migrateVersion1State(rawState);
  }
  if (rawState.version === LEVEL_SCALE_VERSION) {
    rawState = migrateVersion2State(rawState);
  }
  if (rawState.version === STAR_VERSION) {
    rawState = migrateVersion3State(rawState);
  }
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
    if (typeof entry.owned !== "boolean") {
      throw new Error("Assist spirit owned flag must be boolean: " + spirit.id);
    }
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > AssistSpiritConfig.MAX_LEVEL) {
      throw new Error("Assist spirit level is invalid: " + spirit.id);
    }
    spirits[spirit.id] = {
      owned: entry.owned,
      level: entry.level,
      fragments: requireNonNegativeInteger(entry.fragments, "Assist spirit fragments `" + spirit.id + "`")
    };
  });

  if (spirits[AssistSpiritConfig.DEFAULT_EQUIPPED_SPIRIT_ID].owned !== true) {
    throw new Error("Default assist spirit must remain owned.");
  }

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
  var rawState = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, createInitialState);
  var normalized = normalizeState(rawState);
  if (JSON.stringify(rawState) !== JSON.stringify(normalized)) {
    StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  }
  return clone(normalized);
};

AssistSpiritStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
  return clone(normalized);
};

AssistSpiritStore.prototype.loadWithRescueProgress = function (completedLevels) {
  var state = this.load();
  var result = this.reconcileRescueUnlocks(state, completedLevels);
  return result.changed ? this.save(result.state) : state;
};

AssistSpiritStore.prototype.buildLevelUpgrade = function (state, spiritId) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  var entry = normalized.spirits[spiritConfig.id];
  if (entry.owned !== true) {
    return {
      accepted: false,
      reason: "NOT_OWNED",
      state: clone(normalized)
    };
  }
  var cost = AssistSpiritConfig.getLevelUpFragmentCost(entry.level);
  if (cost === null) {
    return {
      accepted: false,
      reason: "MAX_LEVEL",
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
  entry.level += 1;
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

AssistSpiritStore.prototype.buildUnlock = function (state, spiritId) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  var entry = normalized.spirits[spiritConfig.id];
  if (entry.owned === true) {
    return {
      accepted: false,
      reason: "ALREADY_OWNED",
      state: clone(normalized)
    };
  }
  entry.owned = true;
  return {
    accepted: true,
    spiritId: spiritConfig.id,
    state: clone(normalized)
  };
};

AssistSpiritStore.prototype.reconcileRescueUnlocks = function (state, completedLevels) {
  var normalized = normalizeState(state);
  assertObject(completedLevels, "Assist spirit rescue completedLevels");
  var unlockedSpiritIds = [];
  Object.keys(completedLevels).forEach(function (levelKey) {
    if (!/^[1-9]\d*$/.test(levelKey) || completedLevels[levelKey] !== true) {
      throw new Error("Assist spirit rescue completed level entry is invalid: " + levelKey);
    }
    var levelId = Number(levelKey);
    var spiritId = AssistSpiritRescueConfig.findSpiritIdByLevelId(levelId);
    if (spiritId === null || normalized.spirits[spiritId].owned === true) {
      return;
    }
    normalized.spirits[spiritId].owned = true;
    unlockedSpiritIds.push(spiritId);
  });
  return {
    changed: unlockedSpiritIds.length > 0,
    unlockedSpiritIds: unlockedSpiritIds,
    state: clone(normalized)
  };
};

AssistSpiritStore.prototype.buildAddFragments = function (state, spiritId, amount) {
  var normalized = normalizeState(state);
  var spiritConfig = AssistSpiritConfig.getSpirit(spiritId);
  var gained = requireNonNegativeInteger(amount, "Assist spirit fragment add amount");
  if (gained <= 0) {
    throw new Error("Assist spirit fragment add amount must be a positive integer.");
  }
  normalized.spirits[spiritConfig.id].fragments += gained;
  return {
    accepted: true,
    spiritId: spiritConfig.id,
    gained: gained,
    total: normalized.spirits[spiritConfig.id].fragments,
    state: clone(normalized)
  };
};

AssistSpiritStore.STORAGE_KEY = STORAGE_KEY;
AssistSpiritStore.NAMESPACE = NAMESPACE;
AssistSpiritStore.createInitialState = createInitialState;
AssistSpiritStore.normalizeState = normalizeState;
AssistSpiritStore.VERSION = VERSION;

module.exports = AssistSpiritStore;
