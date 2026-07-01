"use strict";

var Shared = require("./GameBootstrapShared");
var FairyAssistConfig = require("../config/FairyAssistConfig");

var JAR_BOUNCE_SFX_MIN_INTERVAL_MS = 80;
var JAR_BOUNCE_SFX_MAX_PER_FRAME = 2;
var JAR_BOUNCE_PIANO_SLOT_COUNT = FairyAssistConfig.maxGlowStacks;

module.exports = {
  _buildAudioConfig: function () {
    return {
      bgmPath: this._getGameplayBgmPath(),
      sfxMap: {
        uiClick: this.uiClickSfxResource,
        shot: this.shotSfxResource,
        win: this.winSfxResource,
        lose: this.loseSfxResource,
        jarBounce: this._parseAudioResourceList(this.jarBounceSfxResources),
        jarCollectBottom: this.jarCollectBottomSfxResource,
        break: this.breakSfxResource,
        fairyAssistHit: this.fairyAssistHitSfxResource,
        fairyAssistDepart: this.fairyAssistDepartSfxResource,
        gameEntryCountdown: this.gameEntryCountdownSfxResource,
        bomb: this.bombSfxResource,
        lockOpen: this.lockOpenSfxResource
      }
    };
  },

  _getLevelSelectBgmPath: function () {
    return typeof this.levelBackgroundMusicResource === "string"
      ? this.levelBackgroundMusicResource.trim()
      : "";
  },

  _getGameplayBgmPath: function () {
    return typeof this.gameBackgroundMusicResource === "string"
      ? this.gameBackgroundMusicResource.trim()
      : "";
  },

  _parseAudioResourceList: function (value) {
    if (Array.isArray(value)) {
      return value.filter(function (item) {
        return typeof item === "string" && item.trim();
      }).map(function (item) {
        return item.trim();
      });
    }

    if (typeof value !== "string") {
      return [];
    }

    return value.split(",").map(function (item) {
      return item.trim();
    }).filter(function (item) {
      return !!item;
    });
  },

  _preloadStartupAudio: function () {
    if (!this.audioManager) {
      return Promise.resolve();
    }

    var bgmPaths = [
      this._getLevelSelectBgmPath(),
      this._getGameplayBgmPath()
    ].filter(function (path, index, list) {
      return !!path && list.indexOf(path) === index;
    });

    var preloadTasks = [];
    if (typeof this.audioManager.preloadConfiguredAudio === "function") {
      preloadTasks.push(this.audioManager.preloadConfiguredAudio());
    }
    if (bgmPaths.length && typeof this.audioManager.preloadPaths === "function") {
      preloadTasks.push(this.audioManager.preloadPaths(bgmPaths));
    }

    return Promise.all(preloadTasks);
  },

  _playBackgroundMusic: function (resourcePath) {
    if (!this.audioManager || typeof this.audioManager.playBgm !== "function") {
      return;
    }

    this.audioManager.playBgm(resourcePath, { loop: true });
  },

  _playLevelSelectBackgroundMusic: function () {
    this._playBackgroundMusic(this._getLevelSelectBgmPath());
  },

  _playGameplayBackgroundMusic: function () {
    this._playBackgroundMusic(this._getGameplayBgmPath());
  },

  _playSfx: function (name) {
    if (!this.audioManager || typeof this.audioManager.playSfx !== "function") {
      return;
    }

    this.audioManager.playSfx(name);
  },

  _runGameEntryCountdown: function () {
    if (!this.levelRenderer || typeof this.levelRenderer.playGameEntryCountdown !== "function") {
      throw new Error("Game entry countdown requires levelRenderer.playGameEntryCountdown.");
    }

    this._playSfx("gameEntryCountdown");
    return this.levelRenderer.playGameEntryCountdown();
  },

  _resolveJarBouncePianoPath: function (pianoSlotIndex) {
    if (
      !Number.isInteger(pianoSlotIndex) ||
      pianoSlotIndex < 1 ||
      pianoSlotIndex > JAR_BOUNCE_PIANO_SLOT_COUNT
    ) {
      throw new Error(
        "Jar bounce sfx requires piano slot index in [1, " + JAR_BOUNCE_PIANO_SLOT_COUNT + "]."
      );
    }

    var pianoPaths = this._parseAudioResourceList(this.jarBounceSfxResources);
    if (pianoPaths.length < JAR_BOUNCE_PIANO_SLOT_COUNT) {
      throw new Error(
        "Jar bounce sfx resources must include at least " +
        JAR_BOUNCE_PIANO_SLOT_COUNT +
        " entries (piano1-" +
        JAR_BOUNCE_PIANO_SLOT_COUNT +
        ")."
      );
    }

    return pianoPaths[pianoSlotIndex - 1];
  },

  _canPlayJarBounceSfx: function (now, playedThisFrame) {
    if (!Number.isFinite(now)) {
      throw new Error("Jar bounce sfx throttle requires finite timestamp.");
    }
    if (playedThisFrame >= JAR_BOUNCE_SFX_MAX_PER_FRAME) {
      return false;
    }
    if (
      typeof this._lastJarBounceSfxAt === "number" &&
      now - this._lastJarBounceSfxAt < JAR_BOUNCE_SFX_MIN_INTERVAL_MS
    ) {
      return false;
    }

    this._lastJarBounceSfxAt = now;
    return true;
  },

  _triggerShortVibration: function () {
    if (!cc.sys || !cc.sys.isMobile) {
      return;
    }
    if (
      this.audioManager &&
      this.audioManager.settings &&
      this.audioManager.settings.vibrationEnabled === false
    ) {
      return;
    }

    if (typeof wx !== "undefined" && wx && typeof wx.vibrateShort === "function") {
      try {
        wx.vibrateShort({ type: "light" });
        return;
      } catch (error) {
        // Fall through to other vibration APIs.
      }
    }

    if (typeof navigator !== "undefined" && navigator && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(20);
        return;
      } catch (error) {
        // Fall through to native jsb vibration if available.
      }
    }

    if (typeof jsb !== "undefined" && jsb && jsb.device && typeof jsb.device.vibrate === "function") {
      try {
        jsb.device.vibrate();
      } catch (error) {
        // Ignore vibration failures to avoid breaking gameplay loop.
      }
    }
  },

  _playRuntimeAudioEvents: function (snapshot) {
    var runtimeEvents = snapshot && Array.isArray(snapshot.runtimeEvents) ? snapshot.runtimeEvents : [];
    if (!runtimeEvents.length) {
      return;
    }

    var now = Date.now();
    var jarBouncePlayedThisFrame = 0;

    runtimeEvents.forEach(function (event) {
      if (!event || typeof event.type !== "string") {
        return;
      }
      this._trackRuntimeTelemetryEvent(event, snapshot);

      if (event.type === "jar_rim_bounce") {
        if (!Number.isInteger(event.bounceCount) || event.bounceCount < 1) {
          throw new Error("jar_rim_bounce runtime event requires positive integer bounceCount.");
        }
        if (!this._canPlayJarBounceSfx(now, jarBouncePlayedThisFrame)) {
          return;
        }
        jarBouncePlayedThisFrame += 1;
        var rimBouncePianoSlot = Math.min(JAR_BOUNCE_PIANO_SLOT_COUNT, event.bounceCount);
        this._playSfx(this._resolveJarBouncePianoPath(rimBouncePianoSlot));
        return;
      }

      if (event.type === "fairy_assist_hit") {
        this._playSfx("fairyAssistHit");
        return;
      }

      if (event.type === "fairy_assist_depart") {
        this._playSfx("fairyAssistDepart");
        return;
      }

      if (event.type === "jar_collect_bottom") {
        this._playSfx("jarCollectBottom");
        return;
      }

      if (event.type === "bubble_break") {
        this._playSfx("break");
        return;
      }

      if (event.type === "bomb_explosion") {
        this._playSfx("bomb");
        return;
      }

      if (event.type === "lock_open") {
        this._playSfx("lockOpen");
        return;
      }

      if (event.type === "shot_no_drop") {
        this._triggerShortVibration();
      }
    }, this);
  }
};
