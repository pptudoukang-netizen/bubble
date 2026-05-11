"use strict";

var StrictStorage = require("../utils/StrictStorage");

var STORAGE_KEY = "bubble_audio_settings_v1";
var NAMESPACE = "AudioSettingsStore";

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

function requireNumberInRange(value, fieldName, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(fieldName + " must be a number in [" + min + ", " + max + "].");
  }
  return value;
}

function createInitialSettings(defaults) {
  assertObject(defaults, "AudioSettingsStore defaults are required.");
  return {
    version: 1,
    musicEnabled: requireBoolean(defaults.musicEnabled, "Audio default musicEnabled"),
    sfxEnabled: requireBoolean(defaults.sfxEnabled, "Audio default sfxEnabled"),
    vibrationEnabled: requireBoolean(defaults.vibrationEnabled, "Audio default vibrationEnabled"),
    musicVolume: requireNumberInRange(defaults.musicVolume, "Audio default musicVolume", 0, 1),
    sfxVolume: requireNumberInRange(defaults.sfxVolume, "Audio default sfxVolume", 0, 1)
  };
}

function normalizeSettings(raw) {
  assertObject(raw, "Audio settings must be an object.");
  if (raw.version !== 1) {
    throw new Error("Audio settings version must be 1.");
  }

  return {
    version: 1,
    musicEnabled: requireBoolean(raw.musicEnabled, "Audio settings musicEnabled"),
    sfxEnabled: requireBoolean(raw.sfxEnabled, "Audio settings sfxEnabled"),
    vibrationEnabled: requireBoolean(raw.vibrationEnabled, "Audio settings vibrationEnabled"),
    musicVolume: requireNumberInRange(raw.musicVolume, "Audio settings musicVolume", 0, 1),
    sfxVolume: requireNumberInRange(raw.sfxVolume, "Audio settings sfxVolume", 0, 1)
  };
}

function AudioSettingsStore(defaults) {
  this.defaults = createInitialSettings(defaults);
}

AudioSettingsStore.prototype.load = function () {
  var settings = StrictStorage.readJsonOrCreate(STORAGE_KEY, NAMESPACE, function () {
    return clone(this.defaults);
  }.bind(this));
  return clone(normalizeSettings(settings));
};

AudioSettingsStore.prototype.save = function (settings) {
  var normalized = normalizeSettings(settings);
  StrictStorage.writeJson(STORAGE_KEY, NAMESPACE, normalized);
};

AudioSettingsStore.prototype.normalize = function (settings) {
  return clone(normalizeSettings(settings));
};

module.exports = AudioSettingsStore;
