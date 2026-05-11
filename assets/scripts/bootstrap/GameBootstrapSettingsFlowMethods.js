"use strict";

var Shared = require("./GameBootstrapUiFlowShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var SETTING_VOLUME_STEP = Shared.SETTING_VOLUME_STEP;
var SETTING_STATUS_X_ENABLED = Shared.SETTING_STATUS_X_ENABLED;
var SETTING_STATUS_X_DISABLED = Shared.SETTING_STATUS_X_DISABLED;
var SETTING_VOLUME_ICON_OPEN_PATH = Shared.SETTING_VOLUME_ICON_OPEN_PATH;
var SETTING_VOLUME_ICON_CLOSE_PATH = Shared.SETTING_VOLUME_ICON_CLOSE_PATH;
var hideGameCircleWelfareViewNode = Shared.hideGameCircleWelfareViewNode;

module.exports = {
  _onLevelSelectSettingTap: function () {
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showSettingView();
  },

  _ensureSettingViewPrefab: function () {
    if (this._settingViewPrefab) {
      return Promise.resolve(this._settingViewPrefab);
    }

    return this._loadPrefab("prefabs/ui/SettingView").then(function (prefab) {
      this._settingViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _showSettingView: function () {
    this._hideAwardView();
    this._hideRankingView();
    this._hideSignInView();
    this._hideShopView();
    hideGameCircleWelfareViewNode(this);
    if (typeof this._hideInventoryView === "function") {
      this._hideInventoryView();
    }
    this._ensureSettingViewPrefab().then(function (prefab) {
      if (!prefab) {
        this._setStatus("Failed to load settings view.");
        return;
      }

      var settingNode = this._settingViewNode;
      if (!settingNode || !cc.isValid(settingNode)) {
        settingNode = cc.instantiate(prefab);
        if (!settingNode) {
          this._setStatus("Failed to create settings view.");
          return;
        }
        settingNode.parent = this.node;
        settingNode.zIndex = 280;
        settingNode.setPosition(0, 0);
        this._settingViewNode = settingNode;
        this._bindSettingViewActions(settingNode);
      }

      settingNode.active = true;
      this._ensureSettingVolumeIconSprites().then(function () {
        this._syncSettingViewFromAudioSettings(settingNode);
      }.bind(this));
    }.bind(this)).catch(function (error) {
      Logger.warn("Show setting view failed", error && error.message ? error.message : error);
      this._setStatus("Failed to load settings view.");
    }.bind(this));
  },

  _hideSettingView: function () {
    if (!this._settingViewNode || !cc.isValid(this._settingViewNode)) {
      return;
    }

    this._settingViewNode.active = false;
  },

  _bindSettingViewActions: function (settingViewNode) {
    if (!settingViewNode || !settingViewNode.isValid || settingViewNode.__settingActionBound === true) {
      return;
    }

    settingViewNode.__settingActionBound = true;

    var closeBtnNode = this._findNodeByNameRecursive(settingViewNode, "btn_close");
    var backBtnNode = this._findNodeByNameRecursive(settingViewNode, "btn_back");
    var recoverBtnNode = this._findNodeByNameRecursive(settingViewNode, "btn_recover");
    var controls = this._resolveSettingControlNodes(settingViewNode);

    this._bindNodeTapOnce(closeBtnNode, function () {
      this._playSfx("uiClick");
      this._hideSettingView();
    }.bind(this));
    this._bindNodeTapOnce(backBtnNode, function () {
      this._playSfx("uiClick");
      this._hideSettingView();
    }.bind(this));
    this._bindNodeTapOnce(recoverBtnNode, function () {
      this._playSfx("uiClick");
      this._restoreDefaultAudioSettings();
      this._syncSettingViewFromAudioSettings(settingViewNode);
      this._setStatus("Audio settings restored to default.");
    }.bind(this));

    if (controls) {
      this._bindToggleChangeOnce(controls.musicToggleNode, function (isChecked) {
        if (settingViewNode.__isSyncingSettingAudio === true || !this.audioManager) {
          return;
        }
        this.audioManager.setMusicEnabled(!!isChecked);
        this._syncSettingViewFromAudioSettings(settingViewNode);
      }.bind(this));
      this._bindToggleChangeOnce(controls.sfxToggleNode, function (isChecked) {
        if (settingViewNode.__isSyncingSettingAudio === true || !this.audioManager) {
          return;
        }
        this.audioManager.setSfxEnabled(!!isChecked);
        this._syncSettingViewFromAudioSettings(settingViewNode);
      }.bind(this));
      this._bindToggleChangeOnce(controls.vibrationToggleNode, function (isChecked) {
        if (settingViewNode.__isSyncingSettingAudio === true || !this.audioManager) {
          return;
        }
        if (typeof this.audioManager.setVibrationEnabled === "function") {
          this.audioManager.setVibrationEnabled(!!isChecked);
          this._syncSettingViewFromAudioSettings(settingViewNode);
        }
      }.bind(this));

      this._bindNodeTapOnce(controls.musicReduceButtonNode, function () {
        this._playSfx("uiClick");
        this._adjustSettingVolumeByStep("music", -1, settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.musicAddButtonNode, function () {
        this._playSfx("uiClick");
        this._adjustSettingVolumeByStep("music", 1, settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.sfxReduceButtonNode, function () {
        this._playSfx("uiClick");
        this._adjustSettingVolumeByStep("sfx", -1, settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.sfxAddButtonNode, function () {
        this._playSfx("uiClick");
        this._adjustSettingVolumeByStep("sfx", 1, settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.musicVolumeIconNode, function () {
        this._playSfx("uiClick");
        this._setSettingVolumeToZero("music", settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.sfxVolumeIconNode, function () {
        this._playSfx("uiClick");
        this._setSettingVolumeToZero("sfx", settingViewNode);
      }.bind(this));

      this._bindSettingVolumeDragOnce(controls.musicProgressNode, controls.musicStarNode, "music", settingViewNode);
      this._bindSettingVolumeDragOnce(controls.sfxProgressNode, controls.sfxStarNode, "sfx", settingViewNode);
    }
  },

  _restoreDefaultAudioSettings: function () {
    if (!this.audioManager) {
      return;
    }

    this.audioManager.setMusicEnabled(true);
    this.audioManager.setSfxEnabled(true);
    this.audioManager.setMusicVolume(1);
    this.audioManager.setSfxVolume(1);
    if (typeof this.audioManager.setVibrationEnabled === "function") {
      this.audioManager.setVibrationEnabled(true);
    }
  },

  _syncSettingViewFromAudioSettings: function (settingViewNode) {
    if (!settingViewNode || !settingViewNode.isValid || !this.audioManager) {
      return;
    }

    var settingsSnapshot = this.audioManager.snapshot();
    var settings = settingsSnapshot && settingsSnapshot.settings ? settingsSnapshot.settings : null;
    if (!settings) {
      return;
    }

    var controls = this._resolveSettingControlNodes(settingViewNode);
    if (!controls) {
      return;
    }

    settingViewNode.__isSyncingSettingAudio = true;
    try {
      var musicEnabled = settings.musicEnabled !== false;
      var sfxEnabled = settings.sfxEnabled !== false;
      var vibrationEnabled = settings.vibrationEnabled !== false;

      this._updateSettingToggleStatusView(controls.musicToggle, controls.musicStatusNode, controls.musicStatusLabel, musicEnabled);
      this._updateSettingToggleStatusView(controls.sfxToggle, controls.sfxStatusNode, controls.sfxStatusLabel, sfxEnabled);
      this._updateSettingToggleStatusView(controls.vibrationToggle, controls.vibrationStatusNode, controls.vibrationStatusLabel, vibrationEnabled);

      if (controls.musicProgress) {
        var musicVolume = this._normalizeSettingVolume(settings.musicVolume);
        controls.musicProgress.progress = musicVolume;
        this._syncSettingVolumeStarPosition(controls.musicProgressNode, controls.musicStarNode, musicVolume);
      }
      if (controls.sfxProgress) {
        var sfxVolume = this._normalizeSettingVolume(settings.sfxVolume);
        controls.sfxProgress.progress = sfxVolume;
        this._syncSettingVolumeStarPosition(controls.sfxProgressNode, controls.sfxStarNode, sfxVolume);
      }
      var musicVolumeOpen = musicEnabled && (Number(settings.musicVolume) > 0);
      var sfxVolumeOpen = sfxEnabled && (Number(settings.sfxVolume) > 0);
      this._updateSettingVolumeIconView(controls.musicVolumeIconSprite, musicVolumeOpen);
      this._updateSettingVolumeIconView(controls.sfxVolumeIconSprite, sfxVolumeOpen);
    } finally {
      settingViewNode.__isSyncingSettingAudio = false;
    }
  },

  _adjustSettingVolumeByStep: function (channel, stepDirection, settingViewNode) {
    if (!this.audioManager) {
      return;
    }

    var direction = Number(stepDirection) || 0;
    if (direction === 0) {
      return;
    }

    var snapshot = this.audioManager.snapshot();
    var settings = snapshot && snapshot.settings ? snapshot.settings : null;
    if (!settings) {
      return;
    }

    var isMusicChannel = channel === "music";
    var currentVolume = this._normalizeSettingVolume(isMusicChannel ? settings.musicVolume : settings.sfxVolume);
    var targetVolume = this._normalizeSettingVolume(currentVolume + (SETTING_VOLUME_STEP * direction));

    if (isMusicChannel) {
      this.audioManager.setMusicVolume(targetVolume);
    } else {
      this.audioManager.setSfxVolume(targetVolume);
    }

    this._syncSettingViewFromAudioSettings(settingViewNode || this._settingViewNode);
  },

  _setSettingVolumeToZero: function (channel, settingViewNode) {
    if (!this.audioManager) {
      return;
    }

    if (channel === "music") {
      this.audioManager.setMusicVolume(0);
    } else {
      this.audioManager.setSfxVolume(0);
    }
    this._syncSettingViewFromAudioSettings(settingViewNode || this._settingViewNode);
  },

  _normalizeSettingVolume: function (value) {
    var volume = Math.max(0, Math.min(1, Number(value) || 0));
    return Math.round(volume * 100) / 100;
  },

  _ensureSettingVolumeIconSprites: function () {
    if (this._settingVolumeIconSprites && this._settingVolumeIconSprites.open && this._settingVolumeIconSprites.close) {
      return Promise.resolve(this._settingVolumeIconSprites);
    }
    if (this._settingVolumeIconLoadPromise) {
      return this._settingVolumeIconLoadPromise;
    }

    var loadSpriteFrame = function (path) {
      return new Promise(function (resolve) {
        BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
          if (error) {
            Logger.warn("Load setting icon failed", path, error && error.message ? error.message : error);
            resolve(null);
            return;
          }
          resolve(spriteFrame || null);
        });
      });
    };

    this._settingVolumeIconLoadPromise = Promise.all([
      loadSpriteFrame(SETTING_VOLUME_ICON_OPEN_PATH),
      loadSpriteFrame(SETTING_VOLUME_ICON_CLOSE_PATH)
    ]).then(function (results) {
      this._settingVolumeIconSprites = {
        open: results[0] || null,
        close: results[1] || null
      };
      this._settingVolumeIconLoadPromise = null;
      return this._settingVolumeIconSprites;
    }.bind(this)).catch(function (error) {
      this._settingVolumeIconLoadPromise = null;
      Logger.warn("Load setting icons failed", error && error.message ? error.message : error);
      return {
        open: null,
        close: null
      };
    }.bind(this));

    return this._settingVolumeIconLoadPromise;
  },

  _updateSettingVolumeIconView: function (spriteComponent, isVolumeOpen) {
    if (!spriteComponent || !spriteComponent.node || !spriteComponent.node.isValid || !this._settingVolumeIconSprites) {
      return;
    }

    var targetSpriteFrame = isVolumeOpen
      ? this._settingVolumeIconSprites.open
      : this._settingVolumeIconSprites.close;
    if (!targetSpriteFrame) {
      return;
    }

    spriteComponent.spriteFrame = targetSpriteFrame;
  },

  _updateSettingToggleStatusView: function (toggleComponent, statusNode, statusLabel, isEnabled) {
    if (toggleComponent) {
      toggleComponent.isChecked = !!isEnabled;
    }
    if (statusLabel) {
      statusLabel.string = isEnabled ? "开" : "关";
    }
    if (statusNode && statusNode.isValid) {
      statusNode.x = isEnabled ? SETTING_STATUS_X_ENABLED : SETTING_STATUS_X_DISABLED;
    }
  },

  _bindToggleChangeOnce: function (toggleNode, onToggleChange) {
    if (!toggleNode || !toggleNode.isValid || typeof onToggleChange !== "function" || toggleNode.__toggleChangeBound === true) {
      return;
    }

    toggleNode.__toggleChangeBound = true;
    toggleNode.on("toggle", function () {
      var toggle = toggleNode.getComponent(cc.Toggle);
      onToggleChange(!!(toggle && toggle.isChecked));
    });
  },

  _bindSettingVolumeDragOnce: function (progressNode, starNode, channel, settingViewNode) {
    if (!progressNode || !progressNode.isValid || !starNode || !starNode.isValid) {
      return;
    }

    var dragFlag = "__volumeDragBound_" + channel;
    if (progressNode[dragFlag] === true) {
      return;
    }
    progressNode[dragFlag] = true;

    var onDrag = function (event) {
      if (event) {
        event.stopPropagation();
      }
      this._applySettingVolumeFromTouch(channel, progressNode, settingViewNode, event);
    }.bind(this);

    starNode.on(cc.Node.EventType.TOUCH_START, onDrag);
    starNode.on(cc.Node.EventType.TOUCH_MOVE, onDrag);
    progressNode.on(cc.Node.EventType.TOUCH_START, onDrag);
    progressNode.on(cc.Node.EventType.TOUCH_MOVE, onDrag);
  },

  _applySettingVolumeFromTouch: function (channel, progressNode, settingViewNode, event) {
    if (!this.audioManager || !progressNode || !progressNode.isValid || !event || typeof event.getLocation !== "function") {
      return;
    }

    var width = Number(progressNode.width) || 0;
    if (width <= 0) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = progressNode.convertToNodeSpaceAR(touchLocation);
    var volume = this._normalizeSettingVolume((localPoint.x + (width * 0.5)) / width);

    if (channel === "music") {
      this.audioManager.setMusicVolume(volume);
    } else {
      this.audioManager.setSfxVolume(volume);
    }

    this._syncSettingViewFromAudioSettings(settingViewNode || this._settingViewNode);
  },

  _syncSettingVolumeStarPosition: function (progressNode, starNode, progressValue) {
    if (!progressNode || !progressNode.isValid || !starNode || !starNode.isValid) {
      return;
    }

    var width = Number(progressNode.width) || 0;
    if (width <= 0) {
      return;
    }

    var volume = this._normalizeSettingVolume(progressValue);
    var leftX = -width * 0.5;
    var rightX = width * 0.5;
    var targetX = leftX + (width * volume);
    if (targetX < leftX) {
      targetX = leftX;
    } else if (targetX > rightX) {
      targetX = rightX;
    }
    starNode.x = targetX;
  },

  _resolveSettingControlNodes: function (settingViewNode) {
    if (!settingViewNode || !settingViewNode.isValid) {
      return null;
    }

    var contentNode = this._findNodeByNameRecursive(settingViewNode, "ContentContainer");
    if (!contentNode || !contentNode.isValid) {
      return null;
    }

    var musicToggleNode = this._findNodeByNameRecursive(contentNode, "music_toggle");
    var sfxToggleNode = this._findNodeByNameRecursive(contentNode, "sound_effect_toggle");
    var vibrationToggleNode = this._findNodeByNameRecursive(contentNode, "shock_toggle");
    var musicVolumeItemNode = this._findNodeByNameRecursive(contentNode, "music_volume_item");
    var sfxVolumeItemNode = this._findNodeByNameRecursive(contentNode, "sound_effect_volume_item");
    var musicVolumeIconNode = musicVolumeItemNode
      ? this._findNodeByNameRecursive(musicVolumeItemNode, "music_volume_icon")
      : null;
    var sfxVolumeIconNode = sfxVolumeItemNode
      ? (
        this._findNodeByNameRecursive(sfxVolumeItemNode, "sound_effect_volume_icon") ||
        this._findNodeByNameRecursive(sfxVolumeItemNode, "music_volume_icon")
      )
      : null;
    var musicProgressNode = musicVolumeItemNode ? this._findNodeByNameRecursive(musicVolumeItemNode, "volume_progress") : null;
    var sfxProgressNode = sfxVolumeItemNode ? this._findNodeByNameRecursive(sfxVolumeItemNode, "volume_progress") : null;
    var musicStarNode = musicProgressNode ? this._findNodeByNameRecursive(musicProgressNode, "star") : null;
    var sfxStarNode = sfxProgressNode ? this._findNodeByNameRecursive(sfxProgressNode, "star") : null;
    var musicReduceButtonNode = musicVolumeItemNode ? this._findNodeByNameRecursive(musicVolumeItemNode, "reduce_btn") : null;
    var musicAddButtonNode = musicVolumeItemNode ? this._findNodeByNameRecursive(musicVolumeItemNode, "add_btn") : null;
    var sfxReduceButtonNode = sfxVolumeItemNode ? this._findNodeByNameRecursive(sfxVolumeItemNode, "reduce_btn") : null;
    var sfxAddButtonNode = sfxVolumeItemNode ? this._findNodeByNameRecursive(sfxVolumeItemNode, "add_btn") : null;
    var musicStatusNode = musicToggleNode ? this._findNodeByNameRecursive(musicToggleNode, "status") : null;
    var sfxStatusNode = sfxToggleNode ? this._findNodeByNameRecursive(sfxToggleNode, "status") : null;
    var vibrationStatusNode = vibrationToggleNode ? this._findNodeByNameRecursive(vibrationToggleNode, "status") : null;

    return {
      musicToggleNode: musicToggleNode,
      sfxToggleNode: sfxToggleNode,
      vibrationToggleNode: vibrationToggleNode,
      musicToggle: musicToggleNode ? musicToggleNode.getComponent(cc.Toggle) : null,
      sfxToggle: sfxToggleNode ? sfxToggleNode.getComponent(cc.Toggle) : null,
      vibrationToggle: vibrationToggleNode ? vibrationToggleNode.getComponent(cc.Toggle) : null,
      musicStatusNode: musicStatusNode,
      sfxStatusNode: sfxStatusNode,
      vibrationStatusNode: vibrationStatusNode,
      musicVolumeIconNode: musicVolumeIconNode,
      sfxVolumeIconNode: sfxVolumeIconNode,
      musicVolumeIconSprite: musicVolumeIconNode ? musicVolumeIconNode.getComponent(cc.Sprite) : null,
      sfxVolumeIconSprite: sfxVolumeIconNode ? sfxVolumeIconNode.getComponent(cc.Sprite) : null,
      musicStatusLabel: musicStatusNode ? musicStatusNode.getComponent(cc.Label) : null,
      sfxStatusLabel: sfxStatusNode ? sfxStatusNode.getComponent(cc.Label) : null,
      vibrationStatusLabel: vibrationStatusNode ? vibrationStatusNode.getComponent(cc.Label) : null,
      musicProgress: musicProgressNode ? musicProgressNode.getComponent(cc.ProgressBar) : null,
      sfxProgress: sfxProgressNode ? sfxProgressNode.getComponent(cc.ProgressBar) : null,
      musicProgressNode: musicProgressNode,
      sfxProgressNode: sfxProgressNode,
      musicStarNode: musicStarNode,
      sfxStarNode: sfxStarNode,
      musicReduceButtonNode: musicReduceButtonNode,
      musicAddButtonNode: musicAddButtonNode,
      sfxReduceButtonNode: sfxReduceButtonNode,
      sfxAddButtonNode: sfxAddButtonNode
    };
  }
};
