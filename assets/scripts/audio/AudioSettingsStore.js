"use strict";

var STORAGE_KEY = "bubble_audio_settings_v1";

function clamp01(value, fallback) {
  var parsed = Number(value);
  if (!isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function createDefaultSettings(defaults) {
  defaults = defaults || {};
  return {
    version: 1,
    musicEnabled: defaults.musicEnabled !== false,
    sfxEnabled: defaults.sfxEnabled !== false,
    vibrationEnabled: defaults.vibrationEnabled !== false,
    musicVolume: clamp01(defaults.musicVolume, 0.6),
    sfxVolume: clamp01(defaults.sfxVolume, 1)
  };
}

function normalizeSettings(raw, defaults) {
  var fallback = createDefaultSettings(defaults);
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  return {
    version: 1,
    musicEnabled: raw.musicEnabled !== false,
    sfxEnabled: raw.sfxEnabled !== false,
    vibrationEnabled: raw.vibrationEnabled !== false,
    musicVolume: clamp01(raw.musicVolume, fallback.musicVolume),
    sfxVolume: clamp01(raw.sfxVolume, fallback.sfxVolume)
  };
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function AudioSettingsStore(defaults) {
  this.defaults = defaults || {};
}

AudioSettingsStore.prototype.load = function () {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return createDefaultSettings(this.defaults);
    }

    var rawText = storage.getItem(STORAGE_KEY);
    if (!rawText) {
      return createDefaultSettings(this.defaults);
    }

    return normalizeSettings(JSON.parse(rawText), this.defaults);
  } catch (error) {
    return createDefaultSettings(this.defaults);
  }
};

AudioSettingsStore.prototype.save = function (settings) {
  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return;
    }

    var normalized = normalizeSettings(settings, this.defaults);
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore save errors to keep runtime stable.
  }
};

AudioSettingsStore.prototype.normalize = function (settings) {
  return clone(normalizeSettings(settings, this.defaults));
};

module.exports = AudioSettingsStore;
