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

function isWeChatGameRuntime() {
  return !!(
    cc &&
    cc.sys &&
    typeof cc.sys.platform !== "undefined" &&
    typeof cc.sys.WECHAT_GAME !== "undefined" &&
    cc.sys.platform === cc.sys.WECHAT_GAME
  );
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

function resolveSfxResourcePath(sfxMap, keyOrPath) {
  var mappedPath = sfxMap && sfxMap[keyOrPath] ? sfxMap[keyOrPath] : keyOrPath;
  if (Array.isArray(mappedPath)) {
    var availablePaths = mappedPath.filter(function (path) {
      return typeof path === "string" && path.trim();
    }).map(function (path) {
      return path.trim();
    });
    if (!availablePaths.length) {
      return "";
    }

    mappedPath = availablePaths[Math.floor(Math.random() * availablePaths.length)];
  }

  return typeof mappedPath === "string" ? mappedPath.trim() : "";
}

function collectConfiguredAudioPaths(paths, value) {
  if (typeof value === "string" && value.trim()) {
    paths.push(value.trim());
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  value.forEach(function (item) {
    if (typeof item === "string" && item.trim()) {
      paths.push(item.trim());
    }
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
  this.activeBgmPath = "";
  this._bgmRequestId = 0;
  this._pendingBgmPath = "";
  this._pendingBgmLoop = true;
  this._pendingBgmPromise = null;
  this._exclusiveSfxPlaybacks = {};
  this._webAudioGestureUnlocked = false;
  this._webAudioUnlockBindingDone = false;
  this._webAudioUnlockHandler = null;
  this._runtimeLifecycleBound = false;
  this._innerAudioOptionApplied = false;
}

AudioManager.prototype.configure = function (options) {
  options = options || {};
  this.bgmPath = typeof options.bgmPath === "string" ? options.bgmPath.trim() : this.bgmPath;
  this.sfxMap = options.sfxMap && typeof options.sfxMap === "object" ? clone(options.sfxMap) : this.sfxMap;
  this._bindWebAudioUnlockOnUserGesture();
  this._bindRuntimeLifecycleEvents();
  this._applyWeChatAudioOptions();
  this._tryUnlockWebAudio();
  this._applyVolumeSettings();
  return this.snapshot();
};

AudioManager.prototype.snapshot = function () {
  return {
    bgmPath: this.bgmPath,
    currentBgmPath: this.currentBgmPath,
    activeBgmPath: this.activeBgmPath,
    settings: clone(this.settings),
    sfxKeys: Object.keys(this.sfxMap || {})
  };
};

AudioManager.prototype.preloadConfiguredAudio = function () {
  var paths = [];
  collectConfiguredAudioPaths(paths, this.bgmPath);

  Object.keys(this.sfxMap || {}).forEach(function (key) {
    collectConfiguredAudioPaths(paths, this.sfxMap[key]);
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
    if (!clip) {
      throw new Error("Loaded audio clip is empty: " + resourcePath);
    }
    this.clipCache[resourcePath] = clip;
    delete this.clipLoadPromises[resourcePath];
    return clip;
  }.bind(this)).catch(function (error) {
    delete this.clipLoadPromises[resourcePath];
    throw error;
  }.bind(this));

  return this.clipLoadPromises[resourcePath];
};

AudioManager.prototype.releaseCachedClipsExcept = function (retainedPaths) {
  if (!Array.isArray(retainedPaths)) {
    throw new Error("AudioManager.releaseCachedClipsExcept requires an array.");
  }
  if (!cc.assetManager || typeof cc.assetManager.releaseAsset !== "function") {
    throw new Error("AudioManager cache release requires cc.assetManager.releaseAsset.");
  }

  var retainedPathMap = {};
  retainedPaths.forEach(function (path) {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new Error("AudioManager retained audio path must be a non-empty string.");
    }
    retainedPathMap[path.trim()] = true;
  });

  var releasedClips = [];
  Object.keys(this.clipCache).forEach(function (path) {
    if (retainedPathMap[path] === true) {
      return;
    }
    var clip = this.clipCache[path];
    delete this.clipCache[path];
    if (releasedClips.indexOf(clip) < 0) {
      releasedClips.push(clip);
    }
  }, this);

  releasedClips.forEach(function (clip) {
    cc.assetManager.releaseAsset(clip);
  });
  return releasedClips.length;
};

AudioManager.prototype._applyVolumeSettings = function () {
  this._applyMusicVolumeSetting();
  this._applySfxVolumeSetting();
};

AudioManager.prototype._applyMusicVolumeSetting = function () {
  if (!hasAudioEngine()) {
    return;
  }

  cc.audioEngine.setMusicVolume(this.settings.musicEnabled ? this.settings.musicVolume : 0);
};

AudioManager.prototype._applySfxVolumeSetting = function () {
  if (!hasAudioEngine()) {
    return;
  }

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
  var audioContext = getWebAudioContext();
  if (!audioContext || typeof audioContext.resume !== "function") {
    // Runtime does not expose a resumable WebAudio context.
    this._webAudioGestureUnlocked = true;
    return;
  }

  if (this._webAudioGestureUnlocked && audioContext.state === "running") {
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

AudioManager.prototype._bindRuntimeLifecycleEvents = function () {
  if (this._runtimeLifecycleBound) {
    return;
  }

  if (cc && cc.game && typeof cc.game.on === "function") {
    cc.game.on(cc.game.EVENT_HIDE, function () {
      this.pauseBgm();
    }, this);

    cc.game.on(cc.game.EVENT_SHOW, function () {
      this._tryUnlockWebAudio();
      this.resumeBgm();
    }, this);
  }

  if (typeof wx !== "undefined" && wx && typeof wx.onShow === "function") {
    wx.onShow(function () {
      this._tryUnlockWebAudio();
      this.resumeBgm();
    }.bind(this));
  }
  if (typeof wx !== "undefined" && wx && typeof wx.onHide === "function") {
    wx.onHide(function () {
      this.pauseBgm();
    }.bind(this));
  }

  this._runtimeLifecycleBound = true;
};

AudioManager.prototype._applyWeChatAudioOptions = function () {
  if (this._innerAudioOptionApplied || !isWeChatGameRuntime()) {
    return;
  }

  if (typeof wx === "undefined" || !wx || typeof wx.setInnerAudioOption !== "function") {
    return;
  }

  try {
    wx.setInnerAudioOption({
      mixWithOther: true,
      obeyMuteSwitch: false
    });
    this._innerAudioOptionApplied = true;
  } catch (error) {
    Logger.warn("Set WeChat inner audio option failed", error && error.message ? error.message : error);
  }
};

AudioManager.prototype.setMusicEnabled = function (enabled) {
  this.settings.musicEnabled = !!enabled;
  this.store.save(this.settings);
  this._applyMusicVolumeSetting();

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
  this._applySfxVolumeSetting();

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
  this._applyMusicVolumeSetting();
  return this.settings.musicVolume;
};

AudioManager.prototype.setSfxVolume = function (volume) {
  this.settings.sfxVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  this.store.save(this.settings);
  this._applySfxVolumeSetting();
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

  if (!path) {
    return Promise.reject(new Error("AudioManager.playBgm requires a non-empty resource path."));
  }
  if (!hasAudioEngine()) {
    return Promise.reject(new Error("AudioManager.playBgm requires cc.audioEngine."));
  }
  if (!this.settings.musicEnabled) {
    return Promise.resolve(null);
  }

  if (
    this._pendingBgmPromise &&
    this._pendingBgmPath === path &&
    this._pendingBgmLoop === loop
  ) {
    return this._pendingBgmPromise;
  }

  this._bgmRequestId += 1;
  var requestId = this._bgmRequestId;
  var playPromise = this._loadClip(path).then(function (clip) {
    if (requestId !== this._bgmRequestId) {
      return null;
    }
    if (!this.settings.musicEnabled) {
      return null;
    }

    cc.audioEngine.stopMusic();
    var audioId = cc.audioEngine.playMusic(clip, loop);
    if (typeof audioId !== "number" || !Number.isFinite(audioId) || audioId < 0) {
      throw new Error("Failed to start background music: " + path);
    }
    cc.audioEngine.setMusicVolume(this.settings.musicVolume);
    this.activeBgmPath = path;
    return clip;
  }.bind(this));

  this._pendingBgmPath = path;
  this._pendingBgmLoop = loop;
  this._pendingBgmPromise = playPromise;
  var clearPendingBgm = function () {
    if (this._pendingBgmPromise === playPromise) {
      this._pendingBgmPath = "";
      this._pendingBgmPromise = null;
    }
  }.bind(this);
  playPromise.then(clearPendingBgm, clearPendingBgm);
  return playPromise;
};

AudioManager.prototype.stopBgm = function () {
  this._bgmRequestId += 1;
  this.activeBgmPath = "";
  this._pendingBgmPath = "";
  this._pendingBgmPromise = null;
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

  var resourcePath = resolveSfxResourcePath(this.sfxMap, keyOrPath);
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

AudioManager.prototype.playExclusiveSfx = function (channelName, keyOrPath, options) {
  options = options || {};
  if (typeof options !== "object" || Array.isArray(options)) {
    return Promise.reject(new Error("Exclusive SFX playback options must be an object."));
  }
  if (options.loop !== undefined && typeof options.loop !== "boolean") {
    return Promise.reject(new Error("Exclusive SFX playback loop option must be boolean."));
  }
  var channel = typeof channelName === "string" ? channelName.trim() : "";
  if (!channel) {
    return Promise.reject(new Error("Exclusive SFX playback requires a non-empty channel name."));
  }

  this._tryUnlockWebAudio();
  if (!hasAudioEngine() || !this.settings.sfxEnabled) {
    return Promise.resolve(null);
  }
  if (typeof cc.audioEngine.setFinishCallback !== "function") {
    return Promise.reject(new Error("Exclusive SFX playback requires cc.audioEngine.setFinishCallback."));
  }
  if (this._exclusiveSfxPlaybacks[channel]) {
    return Promise.resolve(null);
  }

  var resourcePath = resolveSfxResourcePath(this.sfxMap, keyOrPath);
  if (!resourcePath) {
    return Promise.reject(new Error("Exclusive SFX playback requires a configured audio resource."));
  }

  var playback = {
    audioId: null,
    resourcePath: resourcePath,
    loop: options.loop === true
  };
  this._exclusiveSfxPlaybacks[channel] = playback;

  return this._loadClip(resourcePath).then(function (clip) {
    if (this._exclusiveSfxPlaybacks[channel] !== playback) {
      return null;
    }

    cc.audioEngine.setEffectsVolume(this.settings.sfxVolume);
    var audioId = cc.audioEngine.playEffect(clip, playback.loop);
    if (typeof audioId !== "number" || !Number.isFinite(audioId) || audioId < 0) {
      throw new Error("Failed to start exclusive SFX: " + resourcePath);
    }
    playback.audioId = audioId;
    cc.audioEngine.setFinishCallback(audioId, function () {
      if (this._exclusiveSfxPlaybacks[channel] === playback) {
        delete this._exclusiveSfxPlaybacks[channel];
      }
    }.bind(this));
    return audioId;
  }.bind(this)).catch(function (error) {
    if (this._exclusiveSfxPlaybacks[channel] === playback) {
      delete this._exclusiveSfxPlaybacks[channel];
    }
    throw error;
  }.bind(this));
};

AudioManager.prototype.stopExclusiveSfx = function (channelName) {
  var channel = typeof channelName === "string" ? channelName.trim() : "";
  if (!channel) {
    throw new Error("Stopping exclusive SFX requires a non-empty channel name.");
  }
  var playback = this._exclusiveSfxPlaybacks[channel];
  if (!playback) {
    return false;
  }
  delete this._exclusiveSfxPlaybacks[channel];
  if (playback.audioId === null) {
    return true;
  }
  if (typeof playback.audioId !== "number" || !Number.isFinite(playback.audioId) || playback.audioId < 0) {
    throw new Error("Exclusive SFX playback has an invalid audio id: " + channel + ".");
  }
  if (!hasAudioEngine() || typeof cc.audioEngine.stopEffect !== "function") {
    throw new Error("Stopping exclusive SFX requires cc.audioEngine.stopEffect.");
  }
  cc.audioEngine.stopEffect(playback.audioId);
  return true;
};

AudioManager.prototype.playSfxInstances = function (keyOrPath, count, options) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("AudioManager.playSfxInstances requires positive integer count.");
  }

  options = options || {};
  this._tryUnlockWebAudio();
  if (!hasAudioEngine() || !this.settings.sfxEnabled) {
    return Promise.resolve([]);
  }

  var resourcePath = resolveSfxResourcePath(this.sfxMap, keyOrPath);
  var loop = !!options.loop;
  if (!resourcePath) {
    return Promise.resolve([]);
  }

  return this._loadClip(resourcePath).then(function (clip) {
    if (!clip) {
      return [];
    }

    cc.audioEngine.setEffectsVolume(this.settings.sfxVolume);
    var audioIds = [];
    for (var index = 0; index < count; index += 1) {
      audioIds.push(cc.audioEngine.playEffect(clip, loop));
    }
    return audioIds;
  }.bind(this)).catch(function (error) {
    Logger.warn(error && error.message ? error.message : error);
    return [];
  });
};

AudioManager.prototype.stopAllSfx = function () {
  this._exclusiveSfxPlaybacks = {};
  if (hasAudioEngine()) {
    cc.audioEngine.stopAllEffects();
  }
};

module.exports = AudioManager;
