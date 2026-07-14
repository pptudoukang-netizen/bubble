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
var PopupPanelAnimator = Shared.PopupPanelAnimator;
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");
var SpriteProxyLayerHelper = require("../utils/SpriteProxyLayerHelper");
var SETTING_PROXY_ROOT_NAME = "setting_content_auto_proxy_root";
var LEGACY_SETTING_PROXY_ROOT_NAME = "setting_auto_proxy_root";
var SETTING_VOLUME_EDGE_SNAP_RATIO = 0.01;
var SETTING_MUTED_RESTORE_VOLUME = 1;

function assertSettingAudioChannel(channel) {
  if (channel !== "music" && channel !== "sfx") {
    throw new Error("Unsupported setting audio channel: " + channel);
  }
  return channel;
}

function getSettingChannelVolume(settings, channel) {
  assertSettingAudioChannel(channel);
  if (!settings || typeof settings !== "object") {
    throw new Error("Audio settings snapshot is required for setting channel volume.");
  }
  return channel === "music" ? settings.musicVolume : settings.sfxVolume;
}

function setSettingChannelVolume(audioManager, channel, volume) {
  assertSettingAudioChannel(channel);
  if (!audioManager) {
    throw new Error("AudioManager is required to set setting channel volume.");
  }
  if (channel === "music") {
    audioManager.setMusicVolume(volume);
    return;
  }
  audioManager.setSfxVolume(volume);
}

function getLastPositiveSettingVolumeKey(channel) {
  assertSettingAudioChannel(channel);
  return channel === "music" ? "_settingLastPositiveMusicVolume" : "_settingLastPositiveSfxVolume";
}

function rememberPositiveSettingVolume(host, channel, volume) {
  var normalizedVolume = host._normalizeSettingVolume(volume);
  if (normalizedVolume <= 0) {
    return;
  }
  host[getLastPositiveSettingVolumeKey(channel)] = normalizedVolume;
}

function resolveMutedSettingRestoreVolume(host, channel) {
  var key = getLastPositiveSettingVolumeKey(channel);
  var rememberedVolume = host._normalizeSettingVolume(host[key]);
  if (rememberedVolume > 0) {
    return rememberedVolume;
  }
  return SETTING_MUTED_RESTORE_VOLUME;
}

function snapSettingVolumeToEdge(volume) {
  if (volume <= SETTING_VOLUME_EDGE_SNAP_RATIO) {
    return 0;
  }
  if (volume >= 1 - SETTING_VOLUME_EDGE_SNAP_RATIO) {
    return 1;
  }
  return volume;
}

function buildSettingProxyExcludeRoots(controls) {
  if (!controls) {
    throw new Error("SettingView controls are required for proxy excludes.");
  }
  return [
    controls.musicProgressNode,
    controls.sfxProgressNode,
    controls.musicVolumeIconNode,
    controls.sfxVolumeIconNode
  ];
}

module.exports = {
  _onLevelSelectSettingTap: function () {
    if (!this.isSelectingLevel || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showSettingView();
  },

  _onGameplaySettingTap: function () {
    if (this.isRestarting || this.isSelectingLevel) {
      return;
    }
    if (!this.currentLevelConfig || !this.currentLevelConfig.level) {
      throw new Error("Gameplay settings requires active level config.");
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
    if (typeof this._hideDailyTaskView === "function") {
      this._hideDailyTaskView();
    }
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
      PopupPanelAnimator.play(settingNode, { targetNodeName: "ContentContainer" });
      this._ensureSettingVolumeIconSprites().then(function () {
        this._syncSettingViewFromAudioSettings(settingNode);
      }.bind(this));
    }.bind(this)).catch(function (error) {
      Logger.warn("Show setting view failed", error && error.message ? error.message : error);
      this._setStatus("Failed to load settings view.");
    }.bind(this));
  },

  _hideSettingView: function () {
    this._settingVolumeIconLoadVersion = (Number(this._settingVolumeIconLoadVersion) || 0) + 1;
    this._settingVolumeIconSprites = null;
    this._settingVolumeIconLoadPromise = null;
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SettingView",
      nodeKey: "_settingViewNode",
      prefabKey: "_settingViewPrefab"
    });
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
        this._toggleSettingChannelVolume("music", settingViewNode);
      }.bind(this));
      this._bindNodeTapOnce(controls.sfxVolumeIconNode, function () {
        this._playSfx("uiClick");
        this._toggleSettingChannelVolume("sfx", settingViewNode);
      }.bind(this));

      this._bindSettingVolumeDragOnce(controls.musicProgressNode, controls.musicStarNode, "music", settingViewNode, controls.musicVolumeIconNode);
      this._bindSettingVolumeDragOnce(controls.sfxProgressNode, controls.sfxStarNode, "sfx", settingViewNode, controls.sfxVolumeIconNode);
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
    var contentContainerNode = settingViewNode.getChildByName("ContentContainer");
    if (!contentContainerNode || !contentContainerNode.isValid) {
      throw new Error("SettingView requires ContentContainer.");
    }
    var maskNode = settingViewNode.getChildByName("mask");
    if (!maskNode || !maskNode.isValid) {
      throw new Error("SettingView requires mask.");
    }
    SpriteProxyLayerHelper.setSpriteRenderEnabled(maskNode, true, "SettingView mask");
    SpriteProxyLayerHelper.destroyProxyRoot(settingViewNode, LEGACY_SETTING_PROXY_ROOT_NAME);

    var settingsSnapshot = this.audioManager.snapshot();
    var settings = settingsSnapshot && settingsSnapshot.settings ? settingsSnapshot.settings : null;
    if (!settings) {
      return;
    }

    var controls = this._resolveSettingControlNodes(settingViewNode);
    if (!controls) {
      return;
    }
    this._restoreSettingVolumeSliderSprites(controls);

    settingViewNode.__isSyncingSettingAudio = true;
    try {
      var musicEnabled = settings.musicEnabled !== false;
      var sfxEnabled = settings.sfxEnabled !== false;
      var vibrationEnabled = settings.vibrationEnabled !== false;

      this._updateSettingToggleStatusView(controls.musicToggle, controls.musicStatusNode, controls.musicStatusLabel, musicEnabled);
      this._updateSettingToggleStatusView(controls.sfxToggle, controls.sfxStatusNode, controls.sfxStatusLabel, sfxEnabled);
      this._updateSettingToggleStatusView(controls.vibrationToggle, controls.vibrationStatusNode, controls.vibrationStatusLabel, vibrationEnabled);

      var musicVolume = this._normalizeSettingVolume(settings.musicVolume);
      var sfxVolume = this._normalizeSettingVolume(settings.sfxVolume);
      rememberPositiveSettingVolume(this, "music", musicVolume);
      rememberPositiveSettingVolume(this, "sfx", sfxVolume);
      if (controls.musicProgress) {
        controls.musicProgress.progress = musicVolume;
        this._syncSettingVolumeStarPosition(controls.musicProgressNode, controls.musicStarNode, musicVolume);
      }
      if (controls.sfxProgress) {
        controls.sfxProgress.progress = sfxVolume;
        this._syncSettingVolumeStarPosition(controls.sfxProgressNode, controls.sfxStarNode, sfxVolume);
      }
      var musicVolumeOpen = musicVolume > 0;
      var sfxVolumeOpen = sfxVolume > 0;
      this._updateSettingVolumeIconView(controls.musicVolumeIconSprite, musicVolumeOpen);
      this._updateSettingVolumeIconView(controls.sfxVolumeIconSprite, sfxVolumeOpen);
    } finally {
      settingViewNode.__isSyncingSettingAudio = false;
    }
    if (
      contentContainerNode.__settingProxyExcludesDynamicVolume === true &&
      SpriteProxyLayerHelper.hasAutoProxyTree(contentContainerNode, SETTING_PROXY_ROOT_NAME)
    ) {
      SpriteProxyLayerHelper.syncAutoProxyTree(contentContainerNode, SETTING_PROXY_ROOT_NAME);
      return;
    }
    SpriteProxyLayerHelper.destroyProxyRoot(contentContainerNode, SETTING_PROXY_ROOT_NAME);
    SpriteProxyLayerHelper.rebuildAutoProxyTree({
      rootNode: contentContainerNode,
      proxyRootName: SETTING_PROXY_ROOT_NAME,
      excludeRoots: buildSettingProxyExcludeRoots(controls),
      autoSync: false
    });
    contentContainerNode.__settingProxyExcludesDynamicVolume = true;
    this._restoreSettingVolumeSliderSprites(controls);
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

    var currentVolume = this._normalizeSettingVolume(getSettingChannelVolume(settings, channel));
    var targetVolume = this._normalizeSettingVolume(currentVolume + (SETTING_VOLUME_STEP * direction));

    setSettingChannelVolume(this.audioManager, channel, targetVolume);
    rememberPositiveSettingVolume(this, channel, targetVolume);

    this._syncSettingViewFromAudioSettings(settingViewNode || this._settingViewNode);
  },

  _setSettingVolumeToZero: function (channel, settingViewNode) {
    if (!this.audioManager) {
      return;
    }

    setSettingChannelVolume(this.audioManager, channel, 0);
    this._syncSettingViewFromAudioSettings(settingViewNode || this._settingViewNode);
  },

  _toggleSettingChannelVolume: function (channel, settingViewNode) {
    if (!this.audioManager) {
      return;
    }

    var snapshot = this.audioManager.snapshot();
    var settings = snapshot && snapshot.settings ? snapshot.settings : null;
    if (!settings) {
      throw new Error("Audio settings snapshot is required before toggling setting channel volume.");
    }

    var currentVolume = this._normalizeSettingVolume(getSettingChannelVolume(settings, channel));
    if (currentVolume > 0) {
      rememberPositiveSettingVolume(this, channel, currentVolume);
      setSettingChannelVolume(this.audioManager, channel, 0);
    } else {
      setSettingChannelVolume(this.audioManager, channel, resolveMutedSettingRestoreVolume(this, channel));
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
    this._settingVolumeIconLoadVersion = (Number(this._settingVolumeIconLoadVersion) || 0) + 1;
    var loadVersion = this._settingVolumeIconLoadVersion;

    var loadSpriteFrame = function (path) {
      return new Promise(function (resolve, reject) {
        BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
          if (error) {
            var errorMessage = error && error.message ? error.message : String(error);
            reject(new Error("Load setting icon failed `" + path + "`: " + errorMessage));
            return;
          }
          if (!spriteFrame) {
            reject(new Error("Load setting icon returned empty spriteFrame: " + path));
            return;
          }
          resolve(spriteFrame);
        });
      });
    };

    this._settingVolumeIconLoadPromise = Promise.all([
      loadSpriteFrame(SETTING_VOLUME_ICON_OPEN_PATH),
      loadSpriteFrame(SETTING_VOLUME_ICON_CLOSE_PATH)
    ]).then(function (results) {
      if (loadVersion !== this._settingVolumeIconLoadVersion) {
        return null;
      }
      this._settingVolumeIconSprites = {
        open: results[0],
        close: results[1]
      };
      this._settingVolumeIconLoadPromise = null;
      return this._settingVolumeIconSprites;
    }.bind(this)).catch(function (error) {
      if (loadVersion === this._settingVolumeIconLoadVersion) {
        this._settingVolumeIconLoadPromise = null;
      }
      throw error;
    }.bind(this));

    return this._settingVolumeIconLoadPromise;
  },

  _updateSettingVolumeIconView: function (spriteComponent, isVolumeOpen) {
    if (!spriteComponent || !spriteComponent.node || !spriteComponent.node.isValid || !this._settingVolumeIconSprites) {
      throw new Error("SettingView volume icon sprite is required.");
    }

    var targetSpriteFrame = isVolumeOpen
      ? this._settingVolumeIconSprites.open
      : this._settingVolumeIconSprites.close;
    if (!targetSpriteFrame) {
      throw new Error("SettingView volume icon spriteFrame is missing.");
    }

    spriteComponent.node.active = true;
    spriteComponent.node.opacity = 255;
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

  _bindSettingVolumeDragOnce: function (progressNode, starNode, channel, settingViewNode, volumeIconNode) {
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
      this._applySettingVolumeFromTouch(channel, progressNode, settingViewNode, volumeIconNode, event);
    }.bind(this);
    var onDragEnd = function (event) {
      if (event) {
        event.stopPropagation();
      }
      this._syncSettingViewFromAudioSettings(settingViewNode);
    }.bind(this);

    starNode.on(cc.Node.EventType.TOUCH_START, onDrag);
    starNode.on(cc.Node.EventType.TOUCH_MOVE, onDrag);
    starNode.on(cc.Node.EventType.TOUCH_END, onDragEnd);
    starNode.on(cc.Node.EventType.TOUCH_CANCEL, onDragEnd);
    progressNode.on(cc.Node.EventType.TOUCH_START, onDrag);
    progressNode.on(cc.Node.EventType.TOUCH_MOVE, onDrag);
    progressNode.on(cc.Node.EventType.TOUCH_END, onDragEnd);
    progressNode.on(cc.Node.EventType.TOUCH_CANCEL, onDragEnd);
  },

  _applySettingVolumeFromTouch: function (channel, progressNode, settingViewNode, volumeIconNode, event) {
    if (!this.audioManager || !progressNode || !progressNode.isValid || !event || typeof event.getLocation !== "function") {
      return;
    }

    var width = Number(progressNode.width) || 0;
    if (width <= 0) {
      return;
    }

    var touchLocation = event.getLocation();
    var localPoint = progressNode.convertToNodeSpaceAR(touchLocation);
    var rawVolume = (localPoint.x + (width * 0.5)) / width;
    var volume = this._normalizeSettingVolume(snapSettingVolumeToEdge(rawVolume));

    setSettingChannelVolume(this.audioManager, channel, volume);
    rememberPositiveSettingVolume(this, channel, volume);

    var progress = progressNode.getComponent(cc.ProgressBar);
    if (!progress) {
      throw new Error("SettingView volume_progress requires cc.ProgressBar.");
    }
    var starNode = this._findNodeByNameRecursive(progressNode, "star");
    if (!starNode || !starNode.isValid) {
      throw new Error("SettingView volume_progress requires star.");
    }
    progress.progress = volume;
    this._syncSettingVolumeStarPosition(progressNode, starNode, volume);

    if (!settingViewNode || !settingViewNode.isValid) {
      throw new Error("SettingView node is required for volume icon sync.");
    }
    if (!volumeIconNode || !volumeIconNode.isValid) {
      throw new Error("SettingView volume icon node is required.");
    }
    var iconSprite = volumeIconNode.getComponent(cc.Sprite);
    if (!iconSprite) {
      throw new Error("SettingView volume icon requires cc.Sprite.");
    }
    var contentContainerNode = settingViewNode.getChildByName("ContentContainer");
    if (!contentContainerNode || !contentContainerNode.isValid) {
      throw new Error("SettingView requires ContentContainer.");
    }
    this._updateSettingVolumeIconView(iconSprite, volume > 0);
  },

  _restoreSettingVolumeSliderSprites: function (controls) {
    if (!controls) {
      throw new Error("SettingView controls are required for volume slider sprites.");
    }
    [controls.musicVolumeIconNode, controls.sfxVolumeIconNode].forEach(function (iconNode) {
      if (!iconNode || !iconNode.isValid) {
        throw new Error("SettingView volume icon node is required.");
      }
      SpriteProxyLayerHelper.setSpriteRenderEnabled(iconNode, true, "SettingView volume icon");
    });
    [controls.musicProgressNode, controls.sfxProgressNode].forEach(function (progressNode) {
      if (!progressNode || !progressNode.isValid) {
        throw new Error("SettingView volume_progress node is required.");
      }
      SpriteProxyLayerHelper.setSpriteRenderEnabled(progressNode, true, "SettingView volume_progress");
      var barNode = progressNode.getChildByName("bar");
      if (!barNode || !barNode.isValid) {
        throw new Error("SettingView volume_progress requires bar.");
      }
      SpriteProxyLayerHelper.setSpriteRenderEnabled(barNode, true, "SettingView volume_progress/bar");
      var starNode = progressNode.getChildByName("star");
      if (!starNode || !starNode.isValid) {
        throw new Error("SettingView volume_progress requires star.");
      }
      SpriteProxyLayerHelper.setSpriteRenderEnabled(starNode, true, "SettingView volume_progress/star");
    });
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
      ? this._findNodeByNameRecursive(sfxVolumeItemNode, "sound_volume_icon")
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
