"use strict";

var BubbleBreakSfxPolicy = require("../audio/BubbleBreakSfxPolicy");

var JAR_BOUNCE_SFX_MIN_INTERVAL_MS = 80;
var JAR_BOUNCE_SFX_MAX_PER_FRAME = 2;
var JAR_BOUNCE_SFX_SLOT_COUNT = 5;

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
        noElimination: this.noEliminationSfxResource,
        fairyAssistHit: this.fairyAssistHitSfxResource,
        fairyAssistDepart: this.fairyAssistDepartSfxResource,
        gameEntryCountdown: this.gameEntryCountdownSfxResource,
        bomb: this.bombSfxResource,
        lockOpen: this.lockOpenSfxResource,
        fireworks: this.fireworksSfxResource,
        iceBreak: this.iceBreakSfxResource,
        vines: this.vinesSfxResource,
        useProps: this.usePropsSfxResource
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
      throw new Error("Background music playback requires AudioManager.playBgm.");
    }

    return this.audioManager.playBgm(resourcePath, { loop: true }).then(function (clip) {
      if (!clip) {
        return null;
      }
      if (typeof this.audioManager.stopAllSfx !== "function") {
        throw new Error("Background music transition requires AudioManager.stopAllSfx.");
      }
      if (typeof this.audioManager.releaseCachedClipsExcept !== "function") {
        throw new Error("Background music transition requires AudioManager.releaseCachedClipsExcept.");
      }
      this.audioManager.stopAllSfx();
      this.audioManager.releaseCachedClipsExcept([resourcePath]);
      return clip;
    }.bind(this));
  },

  _playLevelSelectBackgroundMusic: function () {
    return this._playBackgroundMusic(this._getLevelSelectBgmPath());
  },

  _playGameplayBackgroundMusic: function () {
    return this._playBackgroundMusic(this._getGameplayBgmPath());
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

  _resolveJarBouncePath: function (jarIndex) {
    if (!Number.isInteger(jarIndex) || jarIndex < 0 || jarIndex >= JAR_BOUNCE_SFX_SLOT_COUNT) {
      throw new Error("Jar bounce sfx requires jarIndex from 0 to " + (JAR_BOUNCE_SFX_SLOT_COUNT - 1) + ".");
    }

    var bouncePaths = this._parseAudioResourceList(this.jarBounceSfxResources);
    if (bouncePaths.length !== JAR_BOUNCE_SFX_SLOT_COUNT) {
      throw new Error(
        "Jar bounce sfx resources must include exactly " +
        JAR_BOUNCE_SFX_SLOT_COUNT +
        " entries (pao1-pao" +
        JAR_BOUNCE_SFX_SLOT_COUNT +
        ")."
      );
    }

    return bouncePaths[jarIndex];
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
        if (!Number.isInteger(event.jarIndex) || event.jarIndex < 0 || event.jarIndex >= JAR_BOUNCE_SFX_SLOT_COUNT) {
          throw new Error("jar_rim_bounce runtime event requires jarIndex from 0 to " + (JAR_BOUNCE_SFX_SLOT_COUNT - 1) + ".");
        }
        if (!this._canPlayJarBounceSfx(now, jarBouncePlayedThisFrame)) {
          return;
        }
        jarBouncePlayedThisFrame += 1;
        this._playSfx(this._resolveJarBouncePath(event.jarIndex));
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
        var breakSfxSchedule = BubbleBreakSfxPolicy.resolveBubbleBreakSfxSchedule(event.count, event.shatterDelaysMs);
        if (!this.audioManager) {
          return;
        }
        if (typeof this.audioManager.playSfxInstances !== "function") {
          throw new Error("bubble_break audio requires AudioManager.playSfxInstances.");
        }
        breakSfxSchedule.forEach(function (entry) {
          if (!Number.isFinite(entry.delayMs) || entry.delayMs < 0 || !Number.isInteger(entry.count) || entry.count < 1) {
            throw new Error("bubble_break audio schedule entry is invalid.");
          }
          if (entry.delayMs <= 0) {
            this.audioManager.playSfxInstances("break", entry.count);
            return;
          }
          if (typeof this.scheduleOnce !== "function") {
            throw new Error("bubble_break delayed audio requires scheduleOnce.");
          }
          this.scheduleOnce(function () {
            if (this.audioManager) {
              this.audioManager.playSfxInstances("break", entry.count);
            }
          }.bind(this), entry.delayMs / 1000);
        }, this);
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

      if (event.type === "top_anchor_collapse_started") {
        this._playSfx("fireworks");
        return;
      }

      if (event.type === "ice_thawed") {
        if (!Number.isInteger(event.count) || event.count < 1) {
          throw new Error("ice_thawed runtime event requires positive integer count.");
        }
        this._playSfx("iceBreak");
        return;
      }

      if (event.type === "vine_entangled") {
        if (!Number.isInteger(event.count) || event.count < 1) {
          throw new Error("vine_entangled runtime event requires positive integer count.");
        }
        this._playSfx("vines");
        return;
      }

      if (event.type === "shot_no_elimination") {
        this._playSfx("noElimination");
        return;
      }

      if (event.type === "shot_no_drop") {
        this._triggerShortVibration();
      }
    }, this);
  }
};
