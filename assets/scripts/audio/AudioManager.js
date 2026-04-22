"use strict";

var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");
var AudioSettingsStore = require("./AudioSettingsStore");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function hasAudioEngine() {
  return !!(cc && cc.audioEngine);
}

function isBrowserRuntime() {
  return !!(cc && cc.sys && cc.sys.isBrowser);
}

function getWebAudioContext() {
  if (!hasAudioEngine()) {
    return null;
  }

  var engine = cc.audioEngine;
  if (engine._audioContext) {
    return engine._audioContext;
  }

  if (engine._impl && engine._impl._ctx) {
    return engine._impl._ctx;
  }

  return null;
}

function warmupWebAudioContext(audioContext) {
  if (!audioContext || typeof audioContext.createBuffer !== "function" || typeof audioContext.createBufferSource !== "function") {
    return;
  }

  try {
    var buffer = audioContext.createBuffer(1, 1, 22050);
    var source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    if (typeof source.stop === "function") {
      source.stop(0);
    }
  } catch (error) {
    // Ignore warmup failures; unlock is still best-effort.
  }
}

function loadAudioClip(resourcePath) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(resourcePath, cc.AudioClip, function (error, clip) {
      if (error) {
        reject(new Error("Failed to load audio `" + resourcePath + "`: " + error.message));
        return;
      }

      resolve(clip);
    });
  });
}

function AudioManager(options) {
  options = options || {};

  this.store = new AudioSettingsStore(options.settingsDefaults || {});
  this.settings = this.store.load();
  this.clipCache = {};
  this.clipLoadPromises = {};
  this.bgmPath = "sound/bg.mp3";
  this.sfxMap = {};
  this.currentBgmPath = "";
  this.currentBgmLoop = true;
  this._webAudioGestureUnlocked = false;
  this._webAudioUnlockBindingDone = false;
  this._webAudioUnlockHandler = null;
}

AudioManager.prototype.configure = function (options) {
  options = options || {};
  this.bgmPath = typeof options.bgmPath === "string" ? options.bgmPath.trim() : this.bgmPath;
  this.sfxMap = options.sfxMap && typeof options.sfxMap === "object" ? clone(options.sfxMap) : this.sfxMap;
  this._bindWebAudioUnlockOnUserGesture();
  this._tryUnlockWebAudio();
  this._applyVolumeSettings();
  return this.snapshot();
};

AudioManager.prototype.snapshot = function () {
  return {
    bgmPath: this.bgmPath,
    currentBgmPath: this.currentBgmPath,
    settings: clone(this.settings),
    sfxKeys: Object.keys(this.sfxMap || {})
  };
};

AudioManager.prototype.preloadConfiguredAudio = function () {
  var paths = [];
  if (this.bgmPath) {
    paths.push(this.bgmPath);
  }

  Object.keys(this.sfxMap || {}).forEach(function (key) {
    var path = this.sfxMap[key];
    if (typeof path === "string" && path) {
      paths.push(path);
    }
  }, this);

  var uniquePaths = paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });

  return this.preloadPaths(uniquePaths);
};

AudioManager.prototype.preloadPaths = function (paths) {
  var safePaths = Array.isArray(paths) ? paths.filter(function (path, index, list) {
    return typeof path === "string" && path && list.indexOf(path) === index;
  }) : [];

  if (!safePaths.length) {
    return Promise.resolve([]);
  }

  return Promise.all(safePaths.map(function (path) {
    return this._loadClip(path).catch(function (error) {
      Logger.warn(error && error.message ? error.message : error);
      return null;
    });
  }, this));
};

AudioManager.prototype._loadClip = function (resourcePath) {
  if (!resourcePath) {
    return Promise.resolve(null);
  }

  if (this.clipCache[resourcePath]) {
    return Promise.resolve(this.clipCache[resourcePath]);
  }

  if (this.clipLoadPromises[resourcePath]) {
    return this.clipLoadPromises[resourcePath];
  }

  this.clipLoadPromises[resourcePath] = loadAudioClip(resourcePath).then(function (clip) {
    this.clipCache[resourcePath] = clip;
    delete this.clipLoadPromises[resourcePath];
    return clip;
  }.bind(this)).catch(function (error) {
    delete this.clipLoadPromises[resourcePath];
    throw error;
  }.bind(this));

  return this.clipLoadPromises[resourcePath];
};

AudioManager.prototype._applyVolumeSettings = function () {
  if (!hasAudioEngine()) {
    return;
  }

  cc.audioEngine.setMusicVolume(this.settings.musicEnabled ? this.settings.musicVolume : 0);
  cc.audioEngine.setEffectsVolume(this.settings.sfxEnabled ? this.settings.sfxVolume : 0);
};

AudioManager.prototype._bindWebAudioUnlockOnUserGesture = function () {
  if (this._webAudioUnlockBindingDone || !isBrowserRuntime() || typeof window === "undefined") {
    return;
  }

  var handler = function () {
    this._tryUnlockWebAudio();
  }.bind(this);
  this._webAudioUnlockHandler = handler;
  ["touchstart", "touchend", "mousedown", "pointerdown", "keydown"].forEach(function (eventName) {
    window.addEventListener(eventName, handler, true);
  });
  this._webAudioUnlockBindingDone = true;
};

AudioManager.prototype._unbindWebAudioUnlockGesture = function () {
  if (!this._webAudioUnlockBindingDone || !this._webAudioUnlockHandler || typeof window === "undefined") {
    return;
  }

  ["touchstart", "touchend", "mousedown", "pointerdown", "keydown"].forEach(function (eventName) {
    window.removeEventListener(eventName, this._webAudioUnlockHandler, true);
  }, this);
  this._webAudioUnlockBindingDone = false;
  this._webAudioUnlockHandler = null;
};

AudioManager.prototype._tryUnlockWebAudio = function () {
  if (this._webAudioGestureUnlocked) {
    return;
  }

  if (!isBrowserRuntime()) {
    this._webAudioGestureUnlocked = true;
    return;
  }

  var audioContext = getWebAudioContext();
  if (!audioContext || typeof audioContext.resume !== "function") {
    return;
  }
  if (audioContext.state === "running") {
    warmupWebAudioContext(audioContext);
    this._webAudioGestureUnlocked = true;
    this._unbindWebAudioUnlockGesture();
    return;
  }

  var markUnlocked = function () {
    if (!audioContext || audioContext.state === "running") {
      warmupWebAudioContext(audioContext);
      this._webAudioGestureUnlocked = true;
      this._unbindWebAudioUnlockGesture();
      if (this.currentBgmPath && this.settings.musicEnabled) {
        this.playBgm(this.currentBgmPath, { loop: this.currentBgmLoop });
      }
    }
  }.bind(this);

  try {
    var resumeResult = audioContext.resume();
    if (resumeResult && typeof resumeResult.then === "function") {
      resumeResult.then(markUnlocked).catch(function () {});
    } else {
      markUnlocked();
    }
  } catch (error) {
    // Ignore unlock failures and let subsequent user gestures retry.
  }
};

AudioManager.prototype.setMusicEnabled = function (enabled) {
  this.settings.musicEnabled = !!enabled;
  this.store.save(this.settings);
  this._applyVolumeSettings();

  if (!this.settings.musicEnabled && hasAudioEngine()) {
    cc.audioEngine.stopMusic();
  } else if (this.settings.musicEnabled && this.currentBgmPath) {
    this.playBgm(this.currentBgmPath, { loop: this.currentBgmLoop });
  }

  return this.settings.musicEnabled;
};

AudioManager.prototype.setSfxEnabled = function (enabled) {
  this.settings.sfxEnabled = !!enabled;
  this.store.save(this.settings);
  this._applyVolumeSettings();

  if (!this.settings.sfxEnabled && hasAudioEngine()) {
    cc.audioEngine.stopAllEffects();
  }

  return this.settings.sfxEnabled;
};

AudioManager.prototype.setVibrationEnabled = function (enabled) {
  this.settings.vibrationEnabled = !!enabled;
  this.store.save(this.settings);
  return this.settings.vibrationEnabled;
};

AudioManager.prototype.setMusicVolume = function (volume) {
  this.settings.musicVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  this.store.save(this.settings);
  this._applyVolumeSettings();
  return this.settings.musicVolume;
};

AudioManager.prototype.setSfxVolume = function (volume) {
  this.settings.sfxVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  this.store.save(this.settings);
  this._applyVolumeSettings();
  return this.settings.sfxVolume;
};

AudioManager.prototype.playConfiguredBgm = function (options) {
  if (!this.bgmPath) {
    return Promise.resolve(null);
  }

  return this.playBgm(this.bgmPath, options);
};

AudioManager.prototype.playBgm = function (resourcePath, options) {
  options = options || {};
  var path = typeof resourcePath === "string" ? resourcePath.trim() : "";
  var loop = options.loop !== false;
  this.currentBgmPath = path;
  this.currentBgmLoop = loop;
  this._tryUnlockWebAudio();

  if (!path || !hasAudioEngine() || !this.settings.musicEnabled) {
    return Promise.resolve(null);
  }

  return this._loadClip(path).then(function (clip) {
    if (!clip) {
      return null;
    }

    cc.audioEngine.stopMusic();
    cc.audioEngine.playMusic(clip, loop);
    cc.audioEngine.setMusicVolume(this.settings.musicVolume);
    return clip;
  }.bind(this)).catch(function (error) {
    Logger.warn(error && error.message ? error.message : error);
    return null;
  });
};

AudioManager.prototype.stopBgm = function () {
  if (hasAudioEngine()) {
    cc.audioEngine.stopMusic();
  }
};

AudioManager.prototype.pauseBgm = function () {
  if (hasAudioEngine()) {
    cc.audioEngine.pauseMusic();
  }
};

AudioManager.prototype.resumeBgm = function () {
  if (!hasAudioEngine() || !this.settings.musicEnabled) {
    return;
  }

  if (this.currentBgmPath) {
    this.playBgm(this.currentBgmPath, { loop: this.currentBgmLoop });
    return;
  }

  cc.audioEngine.resumeMusic();
};

AudioManager.prototype.playSfx = function (keyOrPath, options) {
  options = options || {};
  this._tryUnlockWebAudio();
  if (!hasAudioEngine() || !this.settings.sfxEnabled) {
    return Promise.resolve(null);
  }

  var mappedPath = this.sfxMap && this.sfxMap[keyOrPath] ? this.sfxMap[keyOrPath] : keyOrPath;
  if (Array.isArray(mappedPath)) {
    var availablePaths = mappedPath.filter(function (path) {
      return typeof path === "string" && path.trim();
    }).map(function (path) {
      return path.trim();
    });
    if (!availablePaths.length) {
      return Promise.resolve(null);
    }

    mappedPath = availablePaths[Math.floor(Math.random() * availablePaths.length)];
  }

  var resourcePath = typeof mappedPath === "string" ? mappedPath.trim() : "";
  var loop = !!options.loop;
  if (!resourcePath) {
    return Promise.resolve(null);
  }

  return this._loadClip(resourcePath).then(function (clip) {
    if (!clip) {
      return null;
    }

    cc.audioEngine.setEffectsVolume(this.settings.sfxVolume);
    return cc.audioEngine.playEffect(clip, loop);
  }.bind(this)).catch(function (error) {
    Logger.warn(error && error.message ? error.message : error);
    return null;
  });
};

AudioManager.prototype.stopAllSfx = function () {
  if (hasAudioEngine()) {
    cc.audioEngine.stopAllEffects();
  }
};

module.exports = AudioManager;
