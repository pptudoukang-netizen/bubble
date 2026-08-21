"use strict";

var BubbleBreakSfxPolicy = require("../audio/BubbleBreakSfxPolicy");
var AssistSpiritConfig = require("../config/AssistSpiritConfig");

var JAR_SLOT_COUNT = 5;
var BUBBLE_SHIELD_BREAK_SFX_PATH = "sound/pao_break1";
var WIND_TUNNEL_AMBIENT_CHANNEL = "windTunnelAmbient";
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

function hasWindTunnelEntrance(runtimeSnapshot, owner) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object" || Array.isArray(runtimeSnapshot)) {
    throw new Error(owner + " requires a runtime snapshot.");
  }
  if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
    throw new Error(owner + " requires runtimeSnapshot.board.");
  }
  if (!Array.isArray(runtimeSnapshot.board.specialEntities)) {
    throw new Error(owner + " requires runtimeSnapshot.board.specialEntities.");
  }

  var entranceCount = 0;
  runtimeSnapshot.board.specialEntities.forEach(function (entity) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      throw new Error(owner + " received an invalid board special entity.");
    }
    if (typeof entity.entityType !== "string" || !entity.entityType) {
      throw new Error(owner + " requires every board special entity to expose entityType.");
    }
    if (entity.entityType === "wind_tunnel_entrance") {
      entranceCount += 1;
    }
  });
  if (entranceCount > 1) {
    throw new Error(owner + " received multiple wind tunnel entrances.");
  }
  return entranceCount === 1;
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
        laser: this.laserSfxResource,
        emission: this.emissionSfxResource,
        win: this.winSfxResource,
        lose: this.loseSfxResource,
        jarCollectBottom: this.jarCollectBottomSfxResource,
        joy: this.joySfxResource,
        break: this.breakSfxResource,
        bubbleShieldBreak: BUBBLE_SHIELD_BREAK_SFX_PATH,
        hitBucket: this.hitBucketSfxResource,
        fairyAssistHit: fairyAssistHitPaths,
        fairyAssistDepart: this.fairyAssistDepartSfxResource,
        gameEntryCountdown: this.gameEntryCountdownSfxResource,
        spiderCrawling: this.spiderCrawlingSfxResource,
        windTunnelAmbient: this.windTunnelSfxResource,
        windTunnelInhalation: this.windTunnelInhalationSfxResource,
        windTunnelSpitOut: this.windTunnelSpitOutSfxResource,
        bomb: this.bombSfxResource,
        flowerDie: this.flowerDieSfxResource,
        lockOpen: this.lockOpenSfxResource,
        fireworks: this.fireworksSfxResource,
        iceBreak: this.iceBreakSfxResource,
        icicle: this.icicleSfxResource,
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

  _resolveFiredShotSfxKey: function (firedBall) {
    if (!firedBall || typeof firedBall !== "object" || Array.isArray(firedBall)) {
      throw new Error("Fired shot audio requires firedBall.");
    }
    if (typeof firedBall.entityCategory !== "string" || !firedBall.entityCategory) {
      throw new Error("Fired shot audio requires firedBall.entityCategory.");
    }
    if (firedBall.entityCategory === "normal_ball") {
      return "shot";
    }
    if (firedBall.entityCategory === "skill_ball") {
      if (typeof firedBall.entityType !== "string" || !firedBall.entityType) {
        throw new Error("Skill-ball shot audio requires firedBall.entityType.");
      }
      return firedBall.entityType === "crystal_gun" ? "laser" : "shot";
    }
    throw new Error("Unsupported fired-ball audio category: " + firedBall.entityCategory);
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

    this._stopWindTunnelAmbientSfx();
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

  _runSpiderEntranceAfterCountdown: function () {
    if (!this.levelRenderer || typeof this.levelRenderer.hasPendingSpiderEntrance !== "function") {
      throw new Error("Spider entrance requires levelRenderer.hasPendingSpiderEntrance.");
    }
    if (!this.levelRenderer.hasPendingSpiderEntrance()) {
      return Promise.resolve(null);
    }
    if (typeof this.levelRenderer.playSpiderEntrance !== "function") {
      throw new Error("Spider entrance requires levelRenderer.playSpiderEntrance.");
    }
    if (!this.audioManager || typeof this.audioManager.playExclusiveSfx !== "function") {
      throw new Error("Spider entrance requires AudioManager.playExclusiveSfx.");
    }
    if (typeof this.audioManager.stopExclusiveSfx !== "function") {
      throw new Error("Spider entrance requires AudioManager.stopExclusiveSfx.");
    }

    var channelName = "spiderCrawling";
    var audioOutcomePromise = this.audioManager.playExclusiveSfx(
      channelName,
      "spiderCrawling",
      { loop: true }
    ).then(function (audioId) {
      return { audioId: audioId, error: null };
    }, function (error) {
      return { audioId: null, error: error };
    });
    var entrancePromise;
    try {
      entrancePromise = this.levelRenderer.playSpiderEntrance();
    } catch (error) {
      this.audioManager.stopExclusiveSfx(channelName);
      throw error;
    }

    return Promise.resolve(entrancePromise).then(function () {
      this.audioManager.stopExclusiveSfx(channelName);
      return audioOutcomePromise.then(function (outcome) {
        if (outcome.error) {
          throw outcome.error;
        }
        return null;
      });
    }.bind(this), function (error) {
      this.audioManager.stopExclusiveSfx(channelName);
      throw error;
    }.bind(this));
  },

  _startWindTunnelAmbientSfx: function (runtimeSnapshot) {
    if (typeof this._windTunnelAmbientRequested !== "boolean") {
      throw new Error("Wind tunnel ambient audio requires initialized lifecycle state.");
    }
    if (!hasWindTunnelEntrance(runtimeSnapshot, "Wind tunnel ambient audio")) {
      return Promise.resolve(null);
    }
    if (this._windTunnelAmbientRequested) {
      throw new Error("Wind tunnel ambient audio was started more than once for the same entrance lifecycle.");
    }
    if (!this.audioManager || typeof this.audioManager.playExclusiveSfx !== "function") {
      throw new Error("Wind tunnel ambient audio requires AudioManager.playExclusiveSfx.");
    }

    this._windTunnelAmbientRequested = true;
    var playbackPromise;
    try {
      playbackPromise = this.audioManager.playExclusiveSfx(
        WIND_TUNNEL_AMBIENT_CHANNEL,
        "windTunnelAmbient",
        { loop: true }
      );
    } catch (error) {
      this._windTunnelAmbientRequested = false;
      throw error;
    }
    if (!playbackPromise || typeof playbackPromise.then !== "function") {
      this._windTunnelAmbientRequested = false;
      throw new Error("Wind tunnel ambient audio playback must return a Promise.");
    }
    return playbackPromise.then(function (audioId) {
      return audioId;
    }, function (error) {
      this._windTunnelAmbientRequested = false;
      throw error;
    }.bind(this));
  },

  _stopWindTunnelAmbientSfx: function () {
    if (typeof this._windTunnelAmbientRequested !== "boolean") {
      throw new Error("Wind tunnel ambient audio requires initialized lifecycle state.");
    }
    if (!this.audioManager || typeof this.audioManager.stopExclusiveSfx !== "function") {
      throw new Error("Wind tunnel ambient audio requires AudioManager.stopExclusiveSfx.");
    }
    var stopped = this.audioManager.stopExclusiveSfx(WIND_TUNNEL_AMBIENT_CHANNEL);
    this._windTunnelAmbientRequested = false;
    return stopped;
  },

  _syncWindTunnelAmbientSfxForRuntimeSnapshot: function (runtimeSnapshot) {
    var entrancePresent = hasWindTunnelEntrance(runtimeSnapshot, "Wind tunnel ambient audio sync");
    if (typeof this._windTunnelAmbientRequested !== "boolean") {
      throw new Error("Wind tunnel ambient audio sync requires initialized lifecycle state.");
    }
    if (!this._windTunnelAmbientRequested || entrancePresent) {
      return false;
    }
    return this._stopWindTunnelAmbientSfx();
  },

  _runGameEntryCountdown: function () {
    if (!this.levelRenderer || typeof this.levelRenderer.playGameEntryCountdown !== "function") {
      throw new Error("Game entry countdown requires levelRenderer.playGameEntryCountdown.");
    }
    if (typeof this.levelRenderer.warmupGameplayInteractionAssets !== "function") {
      throw new Error("Game entry countdown requires levelRenderer.warmupGameplayInteractionAssets.");
    }
    if (typeof this.levelRenderer.hasPendingSpiderEntrance !== "function") {
      throw new Error("Game entry countdown requires levelRenderer.hasPendingSpiderEntrance.");
    }
    if (!this.gameManager || typeof this.gameManager.getRuntimeSnapshot !== "function") {
      throw new Error("Game entry countdown requires GameManager.getRuntimeSnapshot.");
    }

    this._stopWindTunnelAmbientSfx();
    var runtimeSnapshot = this.gameManager.getRuntimeSnapshot();
    var windTunnelEntrancePresent = hasWindTunnelEntrance(runtimeSnapshot, "Game entry countdown wind tunnel audio");
    var spiderEntrancePending = this.levelRenderer.hasPendingSpiderEntrance();
    var spiderAudioPreloadPromise = Promise.resolve(null);
    if (spiderEntrancePending) {
      if (!this.audioManager || typeof this.audioManager.preloadPaths !== "function") {
        throw new Error("Spider entrance countdown requires AudioManager.preloadPaths.");
      }
      if (typeof this.spiderCrawlingSfxResource !== "string" || !this.spiderCrawlingSfxResource.trim()) {
        throw new Error("Spider entrance countdown requires spiderCrawlingSfxResource.");
      }
      var spiderAudioPath = this.spiderCrawlingSfxResource.trim();
      spiderAudioPreloadPromise = this.audioManager.preloadPaths([spiderAudioPath]).then(function (clips) {
        if (!Array.isArray(clips) || clips.length !== 1 || !clips[0]) {
          throw new Error("Spider crawling audio preload failed: " + spiderAudioPath + ".");
        }
        return clips[0];
      });
    }
    var windTunnelAudioPreloadPromise = Promise.resolve(null);
    if (windTunnelEntrancePresent) {
      if (!this.audioManager || typeof this.audioManager.preloadPaths !== "function") {
        throw new Error("Wind tunnel countdown requires AudioManager.preloadPaths.");
      }
      if (typeof this.windTunnelSfxResource !== "string" || !this.windTunnelSfxResource.trim()) {
        throw new Error("Wind tunnel countdown requires windTunnelSfxResource.");
      }
      if (
        typeof this.windTunnelInhalationSfxResource !== "string" ||
        !this.windTunnelInhalationSfxResource.trim()
      ) {
        throw new Error("Wind tunnel countdown requires windTunnelInhalationSfxResource.");
      }
      if (
        typeof this.windTunnelSpitOutSfxResource !== "string" ||
        !this.windTunnelSpitOutSfxResource.trim()
      ) {
        throw new Error("Wind tunnel countdown requires windTunnelSpitOutSfxResource.");
      }
      var windTunnelAudioPath = this.windTunnelSfxResource.trim();
      var windTunnelInhalationAudioPath = this.windTunnelInhalationSfxResource.trim();
      var windTunnelSpitOutAudioPath = this.windTunnelSpitOutSfxResource.trim();
      var windTunnelAudioPaths = [
        windTunnelAudioPath,
        windTunnelInhalationAudioPath,
        windTunnelSpitOutAudioPath
      ];
      windTunnelAudioPreloadPromise = this.audioManager.preloadPaths(windTunnelAudioPaths).then(function (clips) {
        if (
          !Array.isArray(clips) ||
          clips.length !== windTunnelAudioPaths.length ||
          clips.some(function (clip) { return !clip; })
        ) {
          throw new Error("Wind tunnel audio preload failed: " + windTunnelAudioPaths.join(", ") + ".");
        }
        return clips;
      });
    }
    var windTunnelEntryFailure = null;
    var startCountdown = function () {
      this._playSfx("gameEntryCountdown");
      var countdownAnimationPromise = Promise.resolve(this.levelRenderer.playGameEntryCountdown());
      var interactionWarmupPromise = Promise.resolve(this.levelRenderer.warmupGameplayInteractionAssets());
      var windTunnelPlaybackPromise = Promise.resolve(null);
      if (windTunnelEntrancePresent) {
        windTunnelPlaybackPromise = countdownAnimationPromise.then(function () {
          if (windTunnelEntryFailure) {
            throw windTunnelEntryFailure;
          }
          return this._startWindTunnelAmbientSfx(runtimeSnapshot);
        }.bind(this));
      }
      return Promise.all([
        countdownAnimationPromise,
        interactionWarmupPromise,
        windTunnelPlaybackPromise
      ]);
    }.bind(this);
    var countdownAudioPreloadPromises = [];
    if (spiderEntrancePending) {
      countdownAudioPreloadPromises.push(spiderAudioPreloadPromise);
    }
    if (windTunnelEntrancePresent) {
      countdownAudioPreloadPromises.push(windTunnelAudioPreloadPromise);
    }
    var countdownPromise = countdownAudioPreloadPromises.length > 0
      ? Promise.all(countdownAudioPreloadPromises).then(startCountdown)
      : startCountdown();
    return countdownPromise.then(function () {
      return spiderEntrancePending
        ? this._runSpiderEntranceAfterCountdown()
        : null;
    }.bind(this)).then(null, function (error) {
      windTunnelEntryFailure = error;
      this._stopWindTunnelAmbientSfx();
      throw error;
    }.bind(this));
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

      if (event.type === "wind_tunnel_projectile_entered") {
        if (
          typeof event.entranceId !== "string" ||
          !event.entranceId ||
          !Number.isInteger(event.entranceRow) ||
          event.entranceRow < 0 ||
          !Number.isInteger(event.entranceCol) ||
          event.entranceCol < 0 ||
          typeof event.exitId !== "string" ||
          !event.exitId ||
          !Number.isInteger(event.exitRow) ||
          event.exitRow < 0 ||
          !Number.isInteger(event.exitCol) ||
          event.exitCol < 0
        ) {
          throw new Error("wind_tunnel_projectile_entered audio event payload is invalid.");
        }
        this._playSfx("windTunnelInhalation");
        return;
      }

      if (event.type === "wind_tunnel_projectile_exited") {
        if (
          typeof event.entranceId !== "string" ||
          !event.entranceId ||
          !Number.isInteger(event.entranceRow) ||
          event.entranceRow < 0 ||
          !Number.isInteger(event.entranceCol) ||
          event.entranceCol < 0 ||
          typeof event.exitId !== "string" ||
          !event.exitId ||
          !Number.isInteger(event.exitRow) ||
          event.exitRow < 0 ||
          !Number.isInteger(event.exitCol) ||
          event.exitCol < 0
        ) {
          throw new Error("wind_tunnel_projectile_exited audio event payload is invalid.");
        }
        this._playSfx("windTunnelSpitOut");
        return;
      }

      if (event.type === "bubble_shield_removed") {
        if (
          typeof event.sourceType !== "string" ||
          !event.sourceType ||
          !Number.isInteger(event.count) ||
          event.count <= 0 ||
          !Array.isArray(event.shieldIds) ||
          event.shieldIds.length !== event.count ||
          event.shieldIds.some(function (shieldId) {
            return typeof shieldId !== "string" || !shieldId;
          })
        ) {
          throw new Error("bubble_shield_removed audio event payload is invalid.");
        }
        this._playSfx("bubbleShieldBreak");
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

      if (event.type === "bud_hatched") {
        if (
          typeof event.bud_id !== "string" ||
          !event.bud_id ||
          typeof event.color !== "string" ||
          !event.color ||
          !Number.isInteger(event.recolored_count) ||
          event.recolored_count < 0 ||
          (event.source_entity_category !== "normal_ball" && event.source_entity_category !== "skill_ball") ||
          (
            event.source_entity_category === "normal_ball" &&
            event.source_entity_type !== null
          ) ||
          (
            event.source_entity_category === "skill_ball" &&
            (typeof event.source_entity_type !== "string" || !event.source_entity_type)
          )
        ) {
          throw new Error("bud_hatched audio event payload is invalid.");
        }
        this._playSfx("flowerDie");
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

      if (event.type === "icicle_released") {
        if (
          typeof event.attachmentId !== "string" ||
          !event.attachmentId ||
          typeof event.sourceCellId !== "string" ||
          !event.sourceCellId ||
          !Number.isInteger(event.row) ||
          event.row < 0 ||
          !Number.isInteger(event.col) ||
          event.col < 0 ||
          typeof event.dropId !== "string" ||
          !event.dropId
        ) {
          throw new Error("icicle_released audio event payload is invalid.");
        }
        this._playSfx("icicle");
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
