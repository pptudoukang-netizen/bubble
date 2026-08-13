"use strict";

var BubbleBreakSfxPolicy = require("../audio/BubbleBreakSfxPolicy");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var JAR_SLOT_COUNT = 5;
var FAIRY_ASSIST_HIT_SFX_PATHS = Object.freeze([
  "sound/hit_spirit_1",
  "sound/hit_spirit_2",
  "sound/hit_spirit_3",
  "sound/hit_spirit_4",
  "sound/hit_spirit_5"
]);
var ASSIST_SPIRIT_SKILL_SFX_BY_ID = Object.freeze({
  permanent_thaw: "ablation",
  release_vines: "releaseVines"
});

function requireFairyAssistHitSfxPaths(paths) {
  if (
    !Array.isArray(paths) ||
    paths.length !== FAIRY_ASSIST_HIT_SFX_PATHS.length ||
    FAIRY_ASSIST_HIT_SFX_PATHS.some(function (expectedPath) {
      return paths.indexOf(expectedPath) < 0;
    })
  ) {
    throw new Error("Fairy assist hit sfx resources must contain exactly sound/hit_spirit_1 through sound/hit_spirit_5.");
  }
  return paths.slice();
}

module.exports = {
  _buildAudioConfig: function () {
    var fairyAssistHitPaths = requireFairyAssistHitSfxPaths(
      this._parseAudioResourceList(this.fairyAssistHitSfxResources)
    );
    return {
      bgmPath: this._getGameplayBgmPath(),
      sfxMap: {
        uiClick: this.uiClickSfxResource,
        congratulations: this.congratulationsSfxResource,
        upgrade: this.upgradeSfxResource,
        shot: this.shotSfxResource,
        emission: this.emissionSfxResource,
        win: this.winSfxResource,
        lose: this.loseSfxResource,
        jarCollectBottom: this.jarCollectBottomSfxResource,
        joy: this.joySfxResource,
        break: this.breakSfxResource,
        hitBucket: this.hitBucketSfxResource,
        fairyAssistHit: fairyAssistHitPaths,
        fairyAssistDepart: this.fairyAssistDepartSfxResource,
        gameEntryCountdown: this.gameEntryCountdownSfxResource,
        bomb: this.bombSfxResource,
        lockOpen: this.lockOpenSfxResource,
        fireworks: this.fireworksSfxResource,
        iceBreak: this.iceBreakSfxResource,
        vines: this.vinesSfxResource,
        releaseVines: this.releaseVinesSfxResource,
        tornado: this.tornadoSfxResource,
        lighting: this.lightingSfxResource,
        ablation: this.ablationSfxResource,
        skillCompleted: this.skillCompletedSfxResource,
        trappedSpriteRescued: this.trappedSpriteRescuedSfxResource,
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

  _getTimedLevelGameplayBgmPath: function () {
    return typeof this.timedLevelBackgroundMusicResource === "string"
      ? this.timedLevelBackgroundMusicResource.trim()
      : "";
  },

  _getGameplayBgmPathForLevel: function (levelConfig) {
    if (!levelConfig || !levelConfig.level || typeof levelConfig.level.playMode !== "string") {
      throw new Error("Gameplay background music requires level.playMode.");
    }

    if (levelConfig.level.playMode === "timed_infinite_shots") {
      return this._getTimedLevelGameplayBgmPath();
    }
    if (levelConfig.level.playMode === "shot_limited") {
      return this._getGameplayBgmPath();
    }
    throw new Error("Unsupported gameplay BGM playMode: " + levelConfig.level.playMode);
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
      throw new Error("Startup background music preload requires AudioManager.");
    }

    var levelSelectBgmPath = this._getLevelSelectBgmPath();
    var gameplayBgmPath = this._getGameplayBgmPath();
    var timedGameplayBgmPath = this._getTimedLevelGameplayBgmPath();
    if (!levelSelectBgmPath || !gameplayBgmPath || !timedGameplayBgmPath) {
      throw new Error("Startup requires level-select, gameplay, and timed-level background music resources.");
    }
    var bgmPaths = [levelSelectBgmPath, gameplayBgmPath, timedGameplayBgmPath].filter(function (path, index, list) {
      return !!path && list.indexOf(path) === index;
    });
    if (typeof this.audioManager.preloadPaths !== "function") {
      throw new Error("Startup background music preload requires AudioManager.preloadPaths.");
    }

    return this.audioManager.preloadPaths(bgmPaths).then(function (clips) {
      if (!Array.isArray(clips) || clips.length !== bgmPaths.length || clips.some(function (clip) { return !clip; })) {
        throw new Error("Startup background music preload did not return every configured clip.");
      }
      return clips;
    });
  },

  _playBackgroundMusic: function (resourcePath) {
    if (!this.audioManager || typeof this.audioManager.playBgm !== "function") {
      throw new Error("Background music playback requires AudioManager.playBgm.");
    }

    if (typeof resourcePath !== "string" || resourcePath.trim().length === 0) {
      throw new Error("Background music resource path must be a non-empty string.");
    }

    return this.audioManager.playBgm(resourcePath, { loop: true }).then(function (clip) {
      if (!clip) {
        var snapshot = this.audioManager.snapshot();
        if (!snapshot || !snapshot.settings || typeof snapshot.settings.musicEnabled !== "boolean") {
          throw new Error("Background music playback requires a valid AudioManager settings snapshot.");
        }
        if (snapshot.settings.musicEnabled) {
          throw new Error("Background music did not start: " + resourcePath);
        }
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

  _playGameplayBackgroundMusic: function (levelConfig) {
    return this._playBackgroundMusic(this._getGameplayBgmPathForLevel(levelConfig));
  },

  _playSfx: function (name) {
    if (!this.audioManager || typeof this.audioManager.playSfx !== "function") {
      return;
    }

    this.audioManager.playSfx(name);
  },

  _playFairyAssistHitSfx: function () {
    if (!this.audioManager || typeof this.audioManager.playExclusiveSfx !== "function") {
      throw new Error("Fairy assist hit audio requires AudioManager.playExclusiveSfx.");
    }

    return this.audioManager.playExclusiveSfx("fairyAssistHit", "fairyAssistHit");
  },

  _runGameEntryCountdown: function () {
    if (!this.levelRenderer || typeof this.levelRenderer.playGameEntryCountdown !== "function") {
      throw new Error("Game entry countdown requires levelRenderer.playGameEntryCountdown.");
    }

    this._playSfx("gameEntryCountdown");
    return this.levelRenderer.playGameEntryCountdown();
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

    runtimeEvents.forEach(function (event) {
      if (!event || typeof event.type !== "string") {
        return;
      }
      this._trackRuntimeTelemetryEvent(event, snapshot);

      if (event.type === "jar_rim_bounce") {
        if (!Number.isInteger(event.bounceCount) || event.bounceCount < 1) {
          throw new Error("jar_rim_bounce runtime event requires positive integer bounceCount.");
        }
        if (!Number.isInteger(event.jarIndex) || event.jarIndex < 0 || event.jarIndex >= JAR_SLOT_COUNT) {
          throw new Error("jar_rim_bounce runtime event requires jarIndex from 0 to " + (JAR_SLOT_COUNT - 1) + ".");
        }
        return;
      }

      if (event.type === "fairy_assist_hit") {
        this._playFairyAssistHitSfx();
        return;
      }

      if (event.type === "assist_spirit_skill_ready") {
        if (!Number.isInteger(event.charge_max) || event.charge_max <= 0) {
          throw new Error("assist_spirit_skill_ready runtime event requires positive integer charge_max.");
        }
        this._playSfx("skillCompleted");
        return;
      }

      if (event.type === "surplus_shot_launched") {
        this._playSfx("emission");
        return;
      }

      if (event.type === "surplus_shots_finished") {
        this._playSfx("joy");
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

      if (event.type === "vine_entanglement_started") {
        if (!Number.isInteger(event.count) || event.count < 1) {
          throw new Error("vine_entanglement_started runtime event requires positive integer count.");
        }
        this._playSfx("vines");
        return;
      }

      if (event.type === "assist_spirit_skill_resolved") {
        if (typeof event.skill_id !== "string" || !event.skill_id) {
          throw new Error("assist_spirit_skill_resolved runtime event requires skill_id.");
        }
        if (event.skill_id === "lightning_chain" || event.skill_id === "tornado") {
          return;
        }
        var assistSpiritSkillSfxKey = ASSIST_SPIRIT_SKILL_SFX_BY_ID[event.skill_id];
        if (!assistSpiritSkillSfxKey) {
          throw new Error("Unsupported assist spirit skill audio mapping: " + event.skill_id);
        }
        this._playSfx(assistSpiritSkillSfxKey);
        return;
      }

      if (event.type === "trapped_sprite_rescued") {
        AssistSpiritConfig.getSpirit(event.spiritId);
        this._playSfx("trappedSpriteRescued");
        return;
      }

      if (event.type === "shot_wall_bounce_no_elimination") {
        if (!Number.isInteger(event.wallBounceCount) || event.wallBounceCount < 1) {
          throw new Error("shot_wall_bounce_no_elimination runtime event requires positive integer wallBounceCount.");
        }
        this._playSfx("hitBucket");
        return;
      }

      if (event.type === "shot_no_drop") {
        this._triggerShortVibration();
      }
    }, this);
  }
};
