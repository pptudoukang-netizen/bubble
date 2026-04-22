"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var RouteEditorState = require("./RouteEditorState");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var LevelSelectView = require("./LevelSelectView");
var BootstrapButtonFactory = require("./BootstrapButtonFactory");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var BundleLoader = require("../utils/BundleLoader");

var SETTING_VOLUME_STEP = 0.1;
var SETTING_STATUS_X_ENABLED = -18;
var SETTING_STATUS_X_DISABLED = 18;
var SETTING_VOLUME_ICON_OPEN_PATH = "image/setting/volume_open";
var SETTING_VOLUME_ICON_CLOSE_PATH = "image/setting/volume_close";
var MAX_LEVEL_MAP_PREFAB_INDEX = 10;

module.exports = {
  _createStatusOverlay: function () {
    if (!DebugFlags.get("overlay")) {
      return;
    }

    var node = new cc.Node("BootstrapStatus");
    node.parent = this.node;
    node.zIndex = 100;

    var widget = node.addComponent(cc.Widget);
    widget.isAlignTop = true;
    widget.isAlignLeft = true;
    widget.top = 32;
    widget.left = 24;

    var label = node.addComponent(cc.Label);
    label.fontSize = 24;
    label.lineHeight = 32;
    label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    label.verticalAlign = cc.Label.VerticalAlign.TOP;
    label.string = "";

    node.color = cc.color(255, 255, 255);
    this._statusLabel = label;
  },

  _onNextLevelTap: function () {
    if (!this.currentLevelConfig || this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    if (!this._consumeStaminaForLevelEntry()) {
      this._setStatus("Stamina is not enough. It resets to 10 at 00:00.");
      return;
    }
    var nextLevelId = (this.currentLevelConfig.level.levelId || 1) + 1;
    this._setStatus("Loading level_" + ("000" + nextLevelId).slice(-3) + "...");
    this._loadLevelById(nextLevelId, "Next level started", "No next level available.");
  },

  _onBackToLevelTap: function () {
    if (this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    this._showLevelSelectView();
  },

  _refreshPlayerResources: function () {
    if (!this.playerResourceStore) {
      this.playerResources = this.playerResources || {
        stamina: 10,
        coins: 0
      };
      return this.playerResources;
    }

    this.playerResources = this.playerResourceStore.load();
    return this.playerResources;
  },

  _getCurrentStamina: function () {
    this._refreshPlayerResources();
    return Math.max(0, Math.floor(Number(this.playerResources && this.playerResources.stamina) || 0));
  },

  _getCurrentCoins: function () {
    this._refreshPlayerResources();
    return Math.max(0, Math.floor(Number(this.playerResources && this.playerResources.coins) || 0));
  },

  _consumeStaminaForLevelEntry: function () {
    if (!this.playerResourceStore) {
      return true;
    }

    this._refreshPlayerResources();
    var consumeResult = this.playerResourceStore.consumeStamina(this.playerResources, 1);
    if (!consumeResult || !consumeResult.accepted) {
      this.playerResources = consumeResult && consumeResult.resources
        ? consumeResult.resources
        : (this.playerResources || { stamina: 0, coins: 0 });
      this._updateLevelSelectTopStatus();
      return false;
    }

    this.playerResources = consumeResult.resources;
    this.playerResourceStore.save(this.playerResources);
    this._updateLevelSelectTopStatus();
    return true;
  },

  _updateLevelSelectTopStatus: function () {
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    var topLayerNode = this._levelSelectNode.getChildByName("top_layer");
    if (!topLayerNode || !topLayerNode.isValid) {
      return;
    }

    var loveInfoNode = topLayerNode.getChildByName("love_info");
    var goldInfoNode = topLayerNode.getChildByName("gold_info");
    var loveNode = loveInfoNode ? loveInfoNode.getChildByName("love") : null;
    var goldNode = goldInfoNode ? goldInfoNode.getChildByName("gold") : null;
    var loveLabel = loveNode ? loveNode.getComponent(cc.Label) : null;
    var goldLabel = goldNode ? goldNode.getComponent(cc.Label) : null;

    if (loveLabel) {
      loveLabel.string = String(this._getCurrentStamina());
    }
    if (goldLabel) {
      goldLabel.string = String(this._getCurrentCoins());
    }
  },

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
  },

  _findNodeByNameRecursive: function (rootNode, name) {
    if (!rootNode || !rootNode.isValid || !name) {
      return null;
    }

    if (rootNode.name === name) {
      return rootNode;
    }

    var queue = rootNode.children ? rootNode.children.slice() : [];
    while (queue.length > 0) {
      var node = queue.shift();
      if (!node || !node.isValid) {
        continue;
      }
      if (node.name === name) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        Array.prototype.push.apply(queue, node.children);
      }
    }

    return null;
  },

  _bindNodeTapOnce: function (node, onTap) {
    if (!node || !node.isValid || typeof onTap !== "function" || node.__tapBound === true) {
      return;
    }

    node.__tapBound = true;
    node.on(cc.Node.EventType.TOUCH_END, function (event) {
      if (event) {
        event.stopPropagation();
      }
      onTap();
    });
  },

  _loadLevelById: function (levelId, successLogPrefix, failStatusMessage) {
    this._persistRouteEditorIfDirty();
    this._hideSettingView();
    this.isRestarting = true;
    this._setDropTestButtonVisible(false);
    this._lastRuntimeState = null;
    this.levelManager.loadLevel(levelId).then(function (levelConfig) {
      this.currentLevelConfig = levelConfig;
      this._currentLevelId = Math.max(1, Number(levelId) || 1);
      this._rememberSelectedLevel(this._currentLevelId);
      this._prepareRouteEditorForLevel(levelConfig, this._currentLevelId);
      var snapshot = this.gameManager.startLevel(levelConfig);
      this._lastRuntimeState = snapshot ? snapshot.state : null;
      return this.levelRenderer.renderLevel(levelConfig, snapshot).then(function () {
        try {
          if (this._pendingRouteEditorAutoEnable) {
            this._routeEditorState.enabled = true;
            this._pendingRouteEditorAutoEnable = false;
          }
          this.isRestarting = false;
          this.isSelectingLevel = false;
          this._hideLevelSelectView();
          this._setDropTestButtonVisible(true);
          this._renderRouteEditor();
          this._refreshRouteEditorButtons();
          this._setStatus(this._formatStatus(levelConfig, snapshot));
          this._playGameplayBackgroundMusic();
          Logger.info(successLogPrefix || "Level started", levelConfig.level.code);
        } catch (postLoadError) {
          // 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈缁犳壆绱掔€ｎ偒鍎ラ柛銈嗘礋閺屾盯顢曢敐鍡欘槰闂佺顑呴崐鍧楀箖濡ゅ懏鏅查幖瀛樼箖閸犳岸姊洪崫銉ユ瀻闁硅櫕锕㈠濠氭偄閾忓湱锛滃┑鈽嗗灥濞咃綁顢栭崒鐐粹拺闁告繂瀚ˉ鐐碘偓鍏夊亾闁归棿绀侀拑鐔兼煟閺冨洢鈧偓闁稿鎸搁埥澶娾枍椤撗傜凹闁逛究鍔戝畷濂告偄閸撲胶鐣鹃梻浣虹帛閸旀牞銇愰崘顔肩劦妞ゆ巻鍋撴繛灏栤偓鎰佸殨妞ゆ劑鍩勯崥瀣煕閵夘垶妾柛鏇炲暣濮婃椽宕楅梻纾嬪焻闂佺閰ｆ禍鍫曞春閳ь剚銇勯幒鎴濐仾婵炴嚪鍕╀簻妞ゆ挴鍓濈涵鍫曟煙閻熸澘顏€规洦鍋婂畷鐔煎礂閸濄儳锛涢梻鍌氬€峰ù鍥敋閺嶎厼绐楅柡宥庡幗閺呮繈鏌曢崼婵愭▓闁轰礁顑夐弻銊モ攽閸♀晜笑缂佺偓鍎抽崥瀣箞閵娿儙鐔煎传閸曨喖鐓橀梻浣虹帛閹稿宕归崜浣瑰床婵炴垯鍨圭粻锝夋煟閹邦厽缍戠痪鏉跨Ф缁辨挻鎷呴崜鍙壭﹀銈嗘处閸欏啴骞婇悙鐑樼劶鐎广儱妫楀▓銈咁渻閵堝棗绗傜紒鈧笟鈧幃鐢稿级濞嗙偓瀵岄梺闈涚墕濡稒鏅堕鍕厾鐟滅増甯為悾娲煙椤旀枻鑰挎鐐存崌楠炴帡宕卞鍡樼秾闂傚倷娴囬～澶愬磿瀹曞洨涓嶇€广儱顦悞鍨亜閹达絾顥夊ù婊堢畺濮婄粯绗熼埀顒勫焵椤掑倸浠滈柤娲诲灡閺呭爼顢涘鍛紲濡炪倖妫侀崑鎰版倿閸濄儮鍋撶憴鍕┛缂傚秮鍋撳銈忕畱濠€閬嶅焵椤掑喚娼愭繛娴嬫櫇閹广垹鈹戠€ｎ亜鐎俊銈忕到閸燁偆绮堥崘顏佸亾閻熸澘顥忛柛鐘愁殕缁轰粙寮介鐔叉嫼闂佸憡绻傜€氬嘲危濞差亝鐓曢悗锝庡墮瀛濋柧鑽ゅ仱閺屾盯寮撮妸銉т哗婵℃鎳樺娲偡闁箑娈舵繝娈垮枤閺佹悂鍩€椤掍浇澹樻い顓犲厴瀵寮撮悢椋庣獮闂佺硶鍓濋敋婵炲懏宀稿铏圭矙濞嗘儳鍓遍梺鐟版啞閹倿宕洪悙鍝勭闁挎洍鍋撶紒鈧€ｎ喗鐓忓┑鐐茬仢閸旀瑥顭?          this.isRestarting = false;
          this.isSelectingLevel = false;
          var postLoadMessage = postLoadError && postLoadError.stack
            ? postLoadError.stack
            : (postLoadError && postLoadError.message ? postLoadError.message : String(postLoadError));
          Logger.warn("Post-load UI sync failed", postLoadMessage);
        }
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this.isRestarting = false;
      this._pendingRouteEditorAutoEnable = false;
      this._setDropTestButtonVisible(!!this.currentLevelConfig && !this.isSelectingLevel);
      this._refreshRouteEditorButtons();
      this._setStatus(failStatusMessage || "Load level failed. Check console logs.");
      var errorMessage = error && error.stack
        ? error.stack
        : (error && error.message ? error.message : String(error));
      Logger.error("Load level failed detail", errorMessage);
    }.bind(this));
  },

  _createDropTestButton: function () {
    if (!this.showDropTestButton) {
      return;
    }

    var button = BootstrapButtonFactory.createDropTestButton({
      parentNode: this.node,
      onTap: function () {
        this._onDropTestButtonTap();
      }.bind(this)
    });
    this._dropTestButton = button ? button.node : null;
    this._setDropTestButtonVisible(false);
  },

  _createRouteEditorButtons: function () {
    if (!this.enableLevelEditor) {
      return;
    }

    this._routeEditorButtons.toggle = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorToggleButton",
      parentNode: this.node,
      labelText: "Route Edit: Off",
      width: 210,
      height: 64,
      left: 24,
      bottom: 24,
      fillColor: cc.color(74, 113, 124, 220),
      outlineColor: cc.color(26, 50, 58),
      onTap: this._onRouteEditorToggleTap.bind(this)
    });

    this._routeEditorButtons.newRoute = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorNewButton",
      parentNode: this.node,
      labelText: "New Route",
      width: 180,
      height: 58,
      left: 24,
      bottom: 96,
      fillColor: cc.color(84, 147, 110, 220),
      outlineColor: cc.color(32, 73, 48),
      onTap: this._onRouteEditorNewTap.bind(this)
    });

    this._routeEditorButtons.undo = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorUndoButton",
      parentNode: this.node,
      labelText: "Undo Point",
      width: 180,
      height: 58,
      left: 24,
      bottom: 162,
      fillColor: cc.color(166, 123, 72, 220),
      outlineColor: cc.color(97, 60, 24),
      onTap: this._onRouteEditorUndoTap.bind(this)
    });

    this._routeEditorButtons.clear = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorClearButton",
      parentNode: this.node,
      labelText: "Clear Current",
      width: 180,
      height: 58,
      left: 24,
      bottom: 228,
      fillColor: cc.color(164, 91, 91, 220),
      outlineColor: cc.color(92, 37, 37),
      onTap: this._onRouteEditorClearTap.bind(this)
    });

    this._routeEditorButtons.save = BootstrapButtonFactory.createActionButton({
      name: "RouteEditorSaveButton",
      parentNode: this.node,
      labelText: "Save Routes",
      width: 180,
      height: 58,
      left: 24,
      bottom: 294,
      fillColor: cc.color(74, 123, 185, 220),
      outlineColor: cc.color(30, 62, 108),
      onTap: this._onRouteEditorSaveTap.bind(this)
    });

    this._refreshRouteEditorButtons();
  },

  _createEmptyRouteEditorState: function () {
    return RouteEditorState.createEmptyState();
  },

  _syncRouteEditorButtonHosts: function () {
    if (!this._routeEditorButtons || !this._routeEditorButtons.toggle) {
      return;
    }

    var toggleButton = this._routeEditorButtons.toggle.node;
    if (!toggleButton || !toggleButton.isValid) {
      return;
    }

    var targetParent = (this.isSelectingLevel && this._levelSelectNode && this._levelSelectNode.isValid)
      ? this._levelSelectNode
      : this.node;
    if (!targetParent || !targetParent.isValid) {
      return;
    }

    if (toggleButton.parent !== targetParent) {
      toggleButton.parent = targetParent;
    }

    toggleButton.zIndex = targetParent === this._levelSelectNode ? 220 : 125;
    var widget = toggleButton.getComponent(cc.Widget);
    if (widget && widget.updateAlignment) {
      widget.updateAlignment();
    }
  },

  _prepareRouteEditorForLevel: function (levelConfig, levelId) {
    var levelCode = levelConfig && levelConfig.level ? levelConfig.level.code : "";
    var routes = this.routeConfigStore.getRoutesForLevel(this.routeConfig, levelId, levelCode);
    this._routeEditorState = RouteEditorState.createStateForLevel(levelId, levelCode, routes);
  },

  _isRouteEditorCapturingInput: function () {
    return !!(
      this.enableLevelEditor &&
      this.currentLevelConfig &&
      this._routeEditorState &&
      this._routeEditorState.enabled &&
      !this.isRestarting &&
      !this.isSelectingLevel
    );
  },

  _getActiveRouteEditorRoute: function () {
    return RouteEditorState.getActiveRoute(this._routeEditorState);
  },

  _createRouteEditorRoute: function () {
    return RouteEditorState.createRoute(this._routeEditorState);
  },

  _ensureActiveRouteEditorRoute: function (autoCreate) {
    return RouteEditorState.ensureActiveRoute(this._routeEditorState, autoCreate);
  },

  _appendRouteEditorPoint: function (route, point, force) {
    var minDistance = Math.max(4, Number(this.routePointMinDistance) || 18);
    return RouteEditorState.appendPoint(this._routeEditorState, route, point, minDistance, force);
  },

  _renderRouteEditor: function () {
    if (!this.levelRenderer || !this.levelRenderer.renderRouteEditor) {
      return;
    }

    if (!this.currentLevelConfig || this.isSelectingLevel) {
      this.levelRenderer.renderRouteEditor(null);
      return;
    }

    this.levelRenderer.renderRouteEditor(this._routeEditorState);
  },

  _refreshRouteEditorButtons: function () {
    if (!this.enableLevelEditor || !this._routeEditorButtons) {
      return;
    }

    this._syncRouteEditorButtonHosts();

    var hasLevel = !!this.currentLevelConfig && !this.isSelectingLevel;
    var inLevelSelect = !!this.isSelectingLevel;
    var isEditing = !!(this._routeEditorState && this._routeEditorState.enabled);
    var activeRoute = this._getActiveRouteEditorRoute();
    var dirtyText = this._routeEditorState && this._routeEditorState.dirty ? " *" : "";

    if (this._routeEditorButtons.toggle) {
      this._routeEditorButtons.toggle.node.active = hasLevel || inLevelSelect;
      this._routeEditorButtons.toggle.label.string = inLevelSelect
        ? ("Edit Mode: " + (this._levelSelectRouteEditorMode ? "On" : "Off"))
        : ("Route Edit: " + (isEditing ? "On" : "Off") + dirtyText);
    }

    ["newRoute", "undo", "clear", "save"].forEach(function (key) {
      if (!this._routeEditorButtons[key]) {
        return;
      }
      this._routeEditorButtons[key].node.active = hasLevel && isEditing;
    }, this);

    if (this._routeEditorButtons.newRoute) {
      this._routeEditorButtons.newRoute.label.string = "New Route";
    }
    if (this._routeEditorButtons.undo) {
      this._routeEditorButtons.undo.label.string = activeRoute && activeRoute.points.length > 0
        ? "Undo Point"
        : "Undo Point";
    }
    if (this._routeEditorButtons.clear) {
      this._routeEditorButtons.clear.label.string = "Clear Current";
    }
    if (this._routeEditorButtons.save) {
      var routeCount = this._routeEditorState && Array.isArray(this._routeEditorState.routes)
        ? this._routeEditorState.routes.filter(function (route) {
          return route && Array.isArray(route.points) && route.points.length > 0;
        }).length
        : 0;
      this._routeEditorButtons.save.label.string = "Save Routes(" + routeCount + ")";
    }
  },

  _handleRouteEditorTouchStart: function (localPoint) {
    var route = this._ensureActiveRouteEditorRoute(true);
    this._routeEditorState.isDrawing = true;
    if (this._appendRouteEditorPoint(route, localPoint, true)) {
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
      this._setStatus("Route point recorded: " + route.name + " -> (" + Math.round(localPoint.x) + ", " + Math.round(localPoint.y) + ")");
    }
  },

  _handleRouteEditorTouchMove: function (localPoint) {
    if (!this._routeEditorState.isDrawing) {
      return;
    }

    var route = this._ensureActiveRouteEditorRoute(true);
    if (this._appendRouteEditorPoint(route, localPoint, false)) {
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();
    }
  },

  _handleRouteEditorTouchEnd: function (localPoint) {
    var route = this._ensureActiveRouteEditorRoute(true);
    if (this._routeEditorState.isDrawing && route) {
      this._appendRouteEditorPoint(route, localPoint, false);
    }

    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
  },

  _handleRouteEditorTouchCancel: function () {
    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
  },

  _onRouteEditorToggleTap: function () {
    if (this.isSelectingLevel) {
      this._levelSelectRouteEditorMode = !this._levelSelectRouteEditorMode;
      this._pendingRouteEditorAutoEnable = false;
      this._refreshRouteEditorButtons();
      if (
        this._levelSelectNode &&
        this._levelSelectViewPrefab &&
        Array.isArray(this._levelMapPrefabs) &&
        this._levelMapPrefabs.length > 0
      ) {
        this._loadAvailableLevelIds().then(function (levelIds) {
          this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, levelIds);
        }.bind(this));
      }
      this._setStatus(this._levelSelectRouteEditorMode
        ? "Route editor mode enabled, select a level to edit"
        : "Route editor mode disabled, tap level to start");
      return;
    }

    if (!this.currentLevelConfig || !this._routeEditorState) {
      return;
    }

    this._routeEditorState.enabled = !this._routeEditorState.enabled;
    this._routeEditorState.isDrawing = false;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus(this._routeEditorState.enabled ? "Route editor enabled" : "Route editor disabled");
  },

  _onRouteEditorNewTap: function () {
    if (!this._routeEditorState || !this.currentLevelConfig) {
      return;
    }

    var route = this._createRouteEditorRoute();
    this._routeEditorState.routes.push(route);
    this._routeEditorState.activeRouteId = route.id;
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("New route created: " + route.name);
  },

  _onRouteEditorUndoTap: function () {
    var route = this._getActiveRouteEditorRoute();
    if (!route || !route.points.length) {
      return;
    }

    route.points.pop();
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("Last route point removed");
  },

  _onRouteEditorClearTap: function () {
    var route = this._getActiveRouteEditorRoute();
    if (!route) {
      return;
    }

    route.points = [];
    this._routeEditorState.dirty = true;
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("Current route cleared: " + route.name);
  },

  _persistRouteEditorIfDirty: function (allowBrowserDownload, forceSave) {
    if (!this._routeEditorState || (!this._routeEditorState.dirty && !forceSave)) {
      return null;
    }

    var routesToSave = RouteEditorState.collectRoutesForSave(this._routeEditorState);

    this.routeConfig = this.routeConfigStore.upsertLevelRoutes(
      this.routeConfig,
      this._routeEditorState.levelId,
      this._routeEditorState.levelCode,
      routesToSave
    );
    var persisted = this.routeConfigStore.save(this.routeConfig, {
      allowBrowserDownload: !!allowBrowserDownload
    });
    this.routeConfig = persisted.config;
    RouteEditorState.applySavedRoutes(this._routeEditorState, routesToSave);
    return persisted;
  },

  _onRouteEditorSaveTap: function () {
    if (!this._routeEditorState || !this.currentLevelConfig) {
      return;
    }

    var persisted = this._persistRouteEditorIfDirty(true, true);
    this._refreshRouteEditorButtons();
    var target = persisted ? persisted.saveResult : this.routeConfigStore.describeTarget();
    this._setStatus("闂傚倸鍊峰ù鍥х暦閸偅鍙忕€规洖娲︽刊浼存煥閺囩偛鈧悂宕归崒鐐寸厵闁诡垳澧楅ˉ澶愭煕濮橆剛绉烘鐐寸墪鑿愭い鎺嗗亾濠碘€茬矙閺岋綁骞橀姘闂備浇顕ф鍝ョ不瀹ュ纾块柛妤冧紳濞差亜惟闁宠桨绀侀崵鎴︽⒑缁嬫寧婀板瑙勬礋瀹曟垿骞橀懜闈涙瀭闂佸憡娲﹂崢浠嬪箟濞嗘挻鍊垫繛鍫濈仢閺嬬喖鏌熼幖浣虹暫妤犵偞鍨挎慨鈧柣娆屽亾婵炲皷鏅犻弻鐔煎礂閸濄儺妲繛? " + target.path);
  },

  _onDropTestButtonTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this._isTerminalState()) {
      return;
    }

    var snapshot = this.gameManager.debugDropBottomRow();
    this.levelRenderer.refreshRuntime(this.currentLevelConfig, snapshot);
    this._setStatus(this._formatStatus(this.currentLevelConfig, snapshot));
  },

  _setStatus: function (message) {
    if (message === this._lastStatusMessage) {
      return;
    }
    this._lastStatusMessage = message;

    if (this._statusLabel) {
      statusLabel.string = isEnabled ? "开" : "关";
    }

    Logger.info(message);
  },

  _formatStatus: function (levelConfig, snapshot) {
    var matched = snapshot.lastResolution ? snapshot.lastResolution.matched.length : 0;
    var floating = snapshot.lastResolution ? snapshot.lastResolution.floating.length : 0;
    var objectiveSnapshot = snapshot.objectives || null;
    var collected = objectiveSnapshot
      ? Math.max(0, Number(objectiveSnapshot.progress) || 0)
      : (snapshot.jars ? snapshot.jars.collectedTotal : 0);
    var objective = objectiveSnapshot
      ? Math.max(0, Number(objectiveSnapshot.target) || 0)
      : (snapshot.jars ? snapshot.jars.objectiveTarget : 0);
    var winStats = snapshot.winStats || {};
    var scoreHeatBand = winStats.scoreHeatBand || null;
    var scoreBandText = scoreHeatBand
      ? [scoreHeatBand.min, scoreHeatBand.target, scoreHeatBand.max].join("/")
      : "-";

    return [
      "Stage 3 flow ready",
      "Level: " + levelConfig.level.code,
      "State: " + snapshot.state,
      "Score: " + snapshot.score,
      "Score Band(min/target/max): " + scoreBandText,
      "Shots: " + snapshot.remainingShots,
      "Current/Next: " + snapshot.shooter.currentColor + "/" + snapshot.shooter.nextColor,
      "Grid cells: " + snapshot.board.cellCount,
      "MatchDrop/FloatingDrop: " + matched + "/" + floating,
      "Collected: " + collected + (objective ? ("/" + objective) : ""),
      "Projectile: " + (snapshot.activeProjectile ? snapshot.activeProjectile.color : "none")
    ].join("\n");
  },

  _setDropTestButtonVisible: function (visible) {
    if (!this._dropTestButton || !cc.isValid(this._dropTestButton)) {
      return;
    }

    this._dropTestButton.active = !!(this.showDropTestButton && visible);
  },

  _showLevelSelectView: function () {
    if (this.isRestarting) {
      return;
    }

    this._persistRouteEditorIfDirty();
    this._hideSettingView();
    this.isSelectingLevel = true;
    this.currentLevelConfig = null;
    this._lastRuntimeState = null;
    this._setDropTestButtonVisible(false);
    this._renderRouteEditor();
    this._refreshRouteEditorButtons();
    this._setStatus("Loading level list...");
    this._refreshLevelProgress();
    this._refreshPlayerResources();
    this._levelSelectMapIndex = 0;

    Promise.all([
      this._ensureLevelSelectPrefabs(),
      this._loadAvailableLevelIds()
    ]).then(function (results) {
      var prefabs = results[0];
      var levelIds = results[1];
      this._preloadLevelConfigsInBackground(levelIds);
      this._renderLevelSelectContent(prefabs.viewPrefab, prefabs.mapPrefabs, levelIds);
      this._playLevelSelectBackgroundMusic();
      this._setStatus("Please select a level");
    }.bind(this)).catch(function (error) {
      this.isSelectingLevel = true;
      this.currentLevelConfig = null;
      this._setDropTestButtonVisible(false);
      this._renderRouteEditor();
      this._refreshRouteEditorButtons();

      var errorMessage = error && error.stack
        ? error.stack
        : (error && error.message ? error.message : String(error));
      this._setStatus("Load level list failed. Please check LevelView/LevelMap prefabs.");
      Logger.error("Load level list failed detail", errorMessage);
    }.bind(this));
  },

  _hideLevelSelectView: function () {
    this._hideSettingView();
    if (!this._levelSelectNode || !cc.isValid(this._levelSelectNode)) {
      return;
    }

    this._levelSelectNode.active = false;
  },

  _ensureLevelSelectPrefabs: function () {
    if (
      this._levelSelectViewPrefab &&
      Array.isArray(this._levelMapPrefabs) &&
      this._levelMapPrefabs.length > 0
    ) {
      return Promise.resolve({
        viewPrefab: this._levelSelectViewPrefab,
        mapPrefabs: this._levelMapPrefabs
      });
    }

    var prefabLoadTasks = [this._loadPrefab("prefabs/ui/LevelView")];
    for (var mapIndex = 1; mapIndex <= MAX_LEVEL_MAP_PREFAB_INDEX; mapIndex += 1) {
      prefabLoadTasks.push(this._tryLoadFirstAvailablePrefab([
        "prefabs/ui/LevelMap" + mapIndex,
        "prefabs/ui/levelMap" + mapIndex,
        "prefabs/game/LevelMap" + mapIndex
      ], {
        silent: true
      }));
    }

    return Promise.all(prefabLoadTasks).then(function (prefabs) {
      this._levelSelectViewPrefab = prefabs[0];
      this._levelMapPrefabs = prefabs.slice(1).filter(function (prefab) {
        return !!prefab;
      });
      if (this._levelMapPrefabs.length === 0) {
        Logger.warn("No level map prefabs available, LevelView will show without map content.");
      }
      return {
        viewPrefab: this._levelSelectViewPrefab,
        mapPrefabs: this._levelMapPrefabs
      };
    }.bind(this));
  },

  _tryLoadFirstAvailablePrefab: function (paths, options) {
    var candidates = Array.isArray(paths) ? paths.filter(Boolean) : [];
    var silent = !!(options && options.silent);
    if (candidates.length === 0) {
      return Promise.resolve(null);
    }

    var index = 0;
    var tryLoadNext = function () {
      if (index >= candidates.length) {
        return Promise.resolve(null);
      }

      var path = candidates[index++];
      return this._loadPrefab(path).then(function (prefab) {
        return prefab || null;
      }).catch(function (error) {
        if (!silent) {
          Logger.warn("Load prefab failed, try next candidate", {
            path: path,
            error: error && error.message ? error.message : error
          });
        }
        return tryLoadNext();
      });
    }.bind(this);

    return tryLoadNext();
  },

  _loadPrefab: function (path) {
    return this.resourceGateway.loadPrefab(path);
  },

  _loadAvailableLevelIds: function () {
    if (this._availableLevelIdsPromise) {
      return this._availableLevelIdsPromise;
    }

    var fallbackMaxLevelId = Math.max(
      1,
      Number(this.levelSelectMaxLevelId) || 0,
      this._getStartupLevelId()
    );
    var quickLevelIds = this._buildSequentialLevelIds(fallbackMaxLevelId);
    this._availableLevelIdsPromise = Promise.resolve(quickLevelIds);
    this._refreshAvailableLevelIdsInBackground();
    return this._availableLevelIdsPromise;
  },

  _refreshAvailableLevelIdsInBackground: function () {
    if (this._availableLevelIdsScanPromise) {
      return this._availableLevelIdsScanPromise;
    }

    this._availableLevelIdsScanPromise = this.resourceGateway.loadLevelConfigResourceUrls()
      .then(function (sourceUrls) {
        var levelIds = sourceUrls.map(this._getLevelIdFromResourcePath, this)
          .filter(function (id) {
            return Number.isInteger(id) && id > 0;
          })
          .filter(function (id, index, list) {
            return list.indexOf(id) === index;
          })
          .sort(function (a, b) {
            return a - b;
          });

        if (levelIds.length === 0) {
          levelIds = [this._getStartupLevelId()];
        }

        return levelIds;
      }.bind(this)).then(function (resolvedLevelIds) {
        this._availableLevelIdsPromise = Promise.resolve(resolvedLevelIds);
        this._availableLevelIdsScanPromise = null;

        if (!this.isSelectingLevel || this.isRestarting) {
          return resolvedLevelIds;
        }

        if (
          !this._levelSelectViewPrefab ||
          !Array.isArray(this._levelMapPrefabs) ||
          this._levelMapPrefabs.length === 0
        ) {
          return resolvedLevelIds;
        }

        this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, resolvedLevelIds);
        this._preloadLevelConfigsInBackground(resolvedLevelIds);
        return resolvedLevelIds;
      }.bind(this)).catch(function (error) {
        this._availableLevelIdsScanPromise = null;
        Logger.warn("Background level list scan failed", error && error.message ? error.message : error);
        return [];
      }.bind(this));

    return this._availableLevelIdsScanPromise;
  },

  _buildSequentialLevelIds: function (maxLevelId) {
    return LevelSelectPolicy.buildSequentialLevelIds(maxLevelId);
  },

  _preloadLevelConfigsInBackground: function (levelIds) {
    if (this._levelConfigPreloadPromise) {
      return this._levelConfigPreloadPromise;
    }

    var validLevelIds = (levelIds || []).filter(function (levelId, index, list) {
      return Number.isInteger(levelId) && levelId > 0 && list.indexOf(levelId) === index;
    });

    if (validLevelIds.length === 0) {
      this._levelConfigPreloadPromise = Promise.resolve();
      return this._levelConfigPreloadPromise;
    }

    this._levelConfigPreloadPromise = this.levelManager.preloadLevels(validLevelIds).catch(function (error) {
      Logger.warn("Level config background preload failed", error && error.message ? error.message : error);
      this._levelConfigPreloadPromise = null;
    }.bind(this));

    return this._levelConfigPreloadPromise;
  },

  _getLevelIdFromResourcePath: function (resourcePath) {
    return LevelSelectPolicy.getLevelIdFromResourcePath(resourcePath);
  },

  _renderLevelSelectContent: function (levelViewPrefab, mapPrefabs, levelIds, forcedMapIndex) {
    this._refreshLevelProgress();

    var highestUnlocked = Math.max(1, Number(this.levelProgress.highestUnlockedLevel) || 1);
    var highlightedLevelId = this._resolveHighlightedLevelId(levelIds, highestUnlocked);
    var renderResult = LevelSelectView.renderLevelSelectContent({
      hostNode: this.node,
      existingLevelSelectNode: this._levelSelectNode,
      levelViewPrefab: levelViewPrefab,
      mapPrefabs: mapPrefabs,
      levelIds: levelIds,
      levelSelectRouteEditorMode: this._levelSelectRouteEditorMode,
      highestUnlocked: highestUnlocked,
      highlightedLevelId: highlightedLevelId,
      currentMapIndex: Number.isInteger(forcedMapIndex) ? forcedMapIndex : this._levelSelectMapIndex,
      getLevelStarCount: this._getLevelStarCount.bind(this),
      isLevelCompleted: this._isLevelCompleted.bind(this),
      staminaValue: this._getCurrentStamina(),
      coinValue: this._getCurrentCoins(),
      onOpenSettings: this._onLevelSelectSettingTap.bind(this),
      onLevelSelectTap: this._onLevelSelectTap.bind(this),
      onMapIndexChange: this._onLevelSelectMapIndexChange.bind(this)
    });
    this._levelSelectNode = renderResult.levelViewNode;
    this._levelSelectMapIndex = Number.isInteger(renderResult.currentMapIndex)
      ? renderResult.currentMapIndex
      : 0;
    this._levelMapPrefabs = Array.isArray(mapPrefabs) ? mapPrefabs.slice() : [];
    if (!renderResult || (Number(renderResult.mapCount) || 0) <= 0) {
      Logger.warn("Level select rendered without map prefab content.");
      this._setStatus("Level map missing. Please check LevelMap1 prefab resources.");
    }

    this._refreshRouteEditorButtons();
  },

  _onLevelSelectMapIndexChange: function (nextMapIndex) {
    if (this.isRestarting || !this.isSelectingLevel) {
      return;
    }

    this._playSfx("uiClick");
    var targetMapIndex = Math.max(0, Math.floor(Number(nextMapIndex) || 0));
    this._levelSelectMapIndex = targetMapIndex;

    if (
      !this._levelSelectViewPrefab ||
      !Array.isArray(this._levelMapPrefabs) ||
      this._levelMapPrefabs.length === 0
    ) {
      return;
    }

    this._loadAvailableLevelIds().then(function (levelIds) {
      if (this.isRestarting || !this.isSelectingLevel) {
        return;
      }
      this._renderLevelSelectContent(this._levelSelectViewPrefab, this._levelMapPrefabs, levelIds, targetMapIndex);
    }.bind(this)).catch(function (error) {
      Logger.warn("Switch level map failed", error && error.message ? error.message : error);
    });
  },

  _refreshLevelProgress: function () {
    this.levelProgress = this.levelProgressStore.load();
    if (!this.levelProgress || typeof this.levelProgress !== "object") {
      this.levelProgress = {
        highestUnlockedLevel: 1,
        selectedLevelId: 1,
        completedLevels: {},
        starsByLevel: {}
      };
    }
  },

  _rememberSelectedLevel: function (levelId) {
    this.levelProgress = this.levelProgressStore.setSelectedLevel(this.levelProgress, levelId);
    this.levelProgressStore.save(this.levelProgress);
  },

  _handleRuntimeStateTransition: function (snapshot) {
    if (!snapshot) {
      return;
    }

    var previousState = this._lastRuntimeState;
    var currentState = snapshot.state;
    if (currentState === "won" && previousState !== "won") {
      this._playSfx("win");
      this._recordCurrentLevelWin(snapshot);
    } else if (
      currentState !== previousState &&
      (currentState === "out_of_shots" || currentState === "lost_danger" || currentState === "lost_objective")
    ) {
      this._playSfx("lose");
    }
    this._lastRuntimeState = currentState;
  },

  _recordCurrentLevelWin: function (snapshot) {
    if (!this._currentLevelId) {
      return;
    }

    var stars = this._calculateStarRating(snapshot);
    this.levelProgress = this.levelProgressStore.recordCompletion(this.levelProgress, this._currentLevelId, stars);
    this.levelProgressStore.save(this.levelProgress);
    Logger.info("Level completion recorded", {
      levelId: this._currentLevelId,
      stars: stars
    });
  },

  _calculateStarRating: function (snapshot) {
    return StarRatingPolicy.calculateStarRatingFromSnapshot(snapshot);
  },

  _getLevelStarCount: function (levelId) {
    var starsByLevel = this.levelProgress && this.levelProgress.starsByLevel
      ? this.levelProgress.starsByLevel
      : {};
    var stars = Math.floor(Number(starsByLevel[String(levelId)]) || 0);
    if (stars < 0) {
      return 0;
    }
    if (stars > 3) {
      return 3;
    }
    return stars;
  },

  _isLevelCompleted: function (levelId) {
    var completedLevels = this.levelProgress && this.levelProgress.completedLevels
      ? this.levelProgress.completedLevels
      : {};
    return !!completedLevels[String(levelId)];
  },

  _resolveHighlightedLevelId: function (levelIds, highestUnlocked) {
    return LevelSelectPolicy.resolveHighlightedLevelId(levelIds, {
      currentLevelId: this._currentLevelId,
      selectedLevelId: this.levelProgress ? this.levelProgress.selectedLevelId : 1,
      highestUnlocked: highestUnlocked
    });
  },

  _onLevelSelectTap: function (levelId) {
    if (this.isRestarting) {
      return;
    }

    this._playSfx("uiClick");
    if (this._levelSelectRouteEditorMode) {
      this._pendingRouteEditorAutoEnable = true;
      this._setStatus("Loading level for route editor: level_" + ("000" + levelId).slice(-3));
      this._loadLevelById(levelId, "Route editor level loaded", "Load selected level for route editor failed.");
      return;
    }

    if (!this._consumeStaminaForLevelEntry()) {
      this._setStatus("Stamina is not enough. It resets to 10 at 00:00.");
      return;
    }

    this._setStatus("Loading level_" + ("000" + levelId).slice(-3) + "...");
    this._loadLevelById(levelId, "Level selected", "Load selected level failed. Check console logs.");
  }
};
