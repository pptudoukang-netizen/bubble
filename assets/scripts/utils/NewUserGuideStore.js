"use strict";

var StrictStorage = require("./StrictStorage");

var STORAGE_KEY = "bubble_new_user_guide_state_v1";
var NAMESPACE = "NewUserGuideStore";
var STEP_QUICK_START = "quick_start";
var STEP_START_GAME = "start_game";
var STEP_GAME_FIRE = "game_fire";
var STEP_DONE = "done";
var VALID_STEPS = {};
VALID_STEPS[STEP_QUICK_START] = true;
VALID_STEPS[STEP_START_GAME] = true;
VALID_STEPS[STEP_GAME_FIRE] = true;
VALID_STEPS[STEP_DONE] = true;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(fieldName + " must be boolean.");
  }
  return value;
}

function requireStep(step, fieldName) {
  if (typeof step !== "string" || VALID_STEPS[step] !== true) {
    throw new Error(fieldName + " must be a valid new user guide step.");
  }
  return step;
}

function createInitialState(initialActive) {
  return {
    version: 2,
    completed: !initialActive,
    step: initialActive ? STEP_QUICK_START : STEP_DONE,
    initialPreparationShown: !initialActive
  };
}

function normalizeStateFields(raw, version, initialPreparationShown) {
  var completed = requireBoolean(raw.completed, "New user guide completed");
  var step = requireStep(raw.step, "New user guide step");
  if (completed && step !== STEP_DONE) {
    throw new Error("Completed new user guide state must use done step.");
  }
  if (!completed && step === STEP_DONE) {
    throw new Error("Active new user guide state cannot use done step.");
  }

  return {
    version: version,
    completed: completed,
    step: step,
    initialPreparationShown: initialPreparationShown
  };
}

function normalizeState(raw) {
  assertObject(raw, "New user guide state must be an object.");
  if (raw.version === 1) {
    var legacyCompleted = requireBoolean(raw.completed, "New user guide completed");
    var legacyStep = requireStep(raw.step, "New user guide step");
    return normalizeStateFields(raw, 2, legacyCompleted || legacyStep !== STEP_QUICK_START);
  }
  if (raw.version !== 2) {
    throw new Error("New user guide state version must be 1 or 2.");
  }
  return normalizeStateFields(
    raw,
    2,
    requireBoolean(raw.initialPreparationShown, "New user guide initialPreparationShown")
  );
}

function NewUserGuideStore(options) {
  assertObject(options, "NewUserGuideStore options are required.");
  this.initialActive = requireBoolean(options.initialActive, "NewUserGuideStore initialActive");
}

NewUserGuideStore.prototype.load = function () {
  var state = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return createInitialState(this.initialActive);
  }.bind(this));
  var normalized = normalizeState(state);
  this.save(normalized);
  return clone(normalized);
};

NewUserGuideStore.prototype.save = function (state) {
  var normalized = normalizeState(state);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

NewUserGuideStore.prototype.isActive = function (state) {
  return normalizeState(state).completed !== true;
};

NewUserGuideStore.prototype.isStep = function (state, step) {
  var normalized = normalizeState(state);
  var safeStep = requireStep(step, "New user guide target step");
  return normalized.completed !== true && normalized.step === safeStep;
};

NewUserGuideStore.prototype.markStep = function (state, step) {
  var normalized = normalizeState(state);
  var safeStep = requireStep(step, "New user guide next step");
  if (safeStep === STEP_DONE) {
    throw new Error("Use markCompleted to finish new user guide.");
  }
  normalized.completed = false;
  normalized.step = safeStep;
  return {
    state: clone(normalized)
  };
};

NewUserGuideStore.prototype.markCompleted = function (state) {
  var normalized = normalizeState(state);
  return {
    state: {
      version: 2,
      completed: true,
      step: STEP_DONE,
      initialPreparationShown: normalized.initialPreparationShown
    }
  };
};

NewUserGuideStore.prototype.consumeInitialPreparation = function (state) {
  var normalized = normalizeState(state);
  if (normalized.initialPreparationShown === true) {
    return {
      shouldOpen: false,
      state: clone(normalized)
    };
  }
  if (normalized.completed === true || normalized.step !== STEP_QUICK_START) {
    throw new Error("Initial StartGameView preparation requires an active quick_start guide state.");
  }
  normalized.initialPreparationShown = true;
  return {
    shouldOpen: true,
    state: clone(normalized)
  };
};

NewUserGuideStore.STEP_QUICK_START = STEP_QUICK_START;
NewUserGuideStore.STEP_START_GAME = STEP_START_GAME;
NewUserGuideStore.STEP_GAME_FIRE = STEP_GAME_FIRE;

module.exports = NewUserGuideStore;
