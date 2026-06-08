"use strict";

var Shared = require("./GameBootstrapShared");
var BundleLoader = Shared.BundleLoader;
var BoardLayout = Shared.BoardLayout;
var NewUserGuideStore = Shared.NewUserGuideStore;

var FINGER_SPRITE_PATH = "image/finger";
var GUIDE_LAYER_NAME = "NewUserGuideLayer";
var GUIDE_FINGER_NAME = "NewUserGuideFinger";
var GUIDE_ARC_NAME = "NewUserGuideArc";
var STEP_QUICK_START = NewUserGuideStore.STEP_QUICK_START;
var STEP_START_GAME = NewUserGuideStore.STEP_START_GAME;
var STEP_GAME_FIRE = NewUserGuideStore.STEP_GAME_FIRE;
var FINGER_BASE_SCALE = 0.82;

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " must be a valid node.");
  }
  return node;
}

function requireGuideStore(host) {
  if (!host.newUserGuideStore || typeof host.newUserGuideStore.load !== "function") {
    throw new Error("New user guide requires NewUserGuideStore.");
  }
  return host.newUserGuideStore;
}

function loadSpriteFrame(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load new user guide sprite `" + path + "`: " + error.message));
        return;
      }
      if (!asset) {
        reject(new Error("New user guide sprite frame is empty: " + path));
        return;
      }
      resolve(asset);
    });
  });
}

function resolveSpriteSize(spriteFrame) {
  if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
    throw new Error("New user guide finger sprite frame must expose original size.");
  }
  var size = spriteFrame.getOriginalSize();
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error("New user guide finger sprite size is invalid.");
  }
  return size;
}

function resolveNodePositionInRoot(targetNode, rootNode) {
  requireValidNode(targetNode, "New user guide target node");
  requireValidNode(rootNode, "New user guide root node");
  if (!targetNode.parent || typeof targetNode.parent.convertToWorldSpaceAR !== "function") {
    throw new Error("New user guide target parent cannot convert to world space.");
  }
  if (typeof rootNode.convertToNodeSpaceAR !== "function") {
    throw new Error("New user guide root node cannot convert to local space.");
  }

  var worldPosition = targetNode.parent.convertToWorldSpaceAR(targetNode.getPosition());
  return rootNode.convertToNodeSpaceAR(worldPosition);
}

function resolveFingerCenterForTip(tipPoint, fingerSize) {
  if (!tipPoint || !Number.isFinite(tipPoint.x) || !Number.isFinite(tipPoint.y)) {
    throw new Error("New user guide tip point is invalid.");
  }
  if (!fingerSize || !Number.isFinite(fingerSize.width) || !Number.isFinite(fingerSize.height)) {
    throw new Error("New user guide finger size is invalid.");
  }
  return cc.v2(
    tipPoint.x + fingerSize.width * FINGER_BASE_SCALE * 0.5,
    tipPoint.y - fingerSize.height * FINGER_BASE_SCALE * 0.5
  );
}

function stopGuideNodeActions(node) {
  if (node && node.isValid) {
    node.stopAllActions();
  }
}

module.exports = {
  _refreshNewUserGuideState: function () {
    this.newUserGuideState = requireGuideStore(this).load();
    return this.newUserGuideState;
  },

  _saveNewUserGuideState: function () {
    requireGuideStore(this).save(this.newUserGuideState);
  },

  _isNewUserGuideActive: function () {
    requireGuideStore(this);
    this._refreshNewUserGuideState();
    return this.newUserGuideStore.isActive(this.newUserGuideState);
  },

  _isNewUserGuideStep: function (step) {
    requireGuideStore(this);
    this._refreshNewUserGuideState();
    return this.newUserGuideStore.isStep(this.newUserGuideState, step);
  },

  _ensureNewUserGuideSpriteFrame: function () {
    if (this._newUserGuideFingerSpriteFrame) {
      return Promise.resolve(this._newUserGuideFingerSpriteFrame);
    }
    if (this._newUserGuideFingerSpriteFramePromise) {
      return this._newUserGuideFingerSpriteFramePromise;
    }

    this._newUserGuideFingerSpriteFramePromise = loadSpriteFrame(FINGER_SPRITE_PATH).then(function (spriteFrame) {
      this._newUserGuideFingerSpriteFrame = spriteFrame;
      this._newUserGuideFingerSize = resolveSpriteSize(spriteFrame);
      this._newUserGuideFingerSpriteFramePromise = null;
      return spriteFrame;
    }.bind(this)).catch(function (error) {
      this._newUserGuideFingerSpriteFramePromise = null;
      throw error;
    }.bind(this));

    return this._newUserGuideFingerSpriteFramePromise;
  },

  _ensureNewUserGuideLayer: function () {
    requireValidNode(this.node, "New user guide host root");
    if (this._newUserGuideLayer && this._newUserGuideLayer.isValid) {
      return this._newUserGuideLayer;
    }

    var layerNode = this.node.getChildByName(GUIDE_LAYER_NAME);
    if (!layerNode || !layerNode.isValid) {
      layerNode = new cc.Node(GUIDE_LAYER_NAME);
      layerNode.parent = this.node;
    }
    layerNode.setPosition(0, 0);
    layerNode.zIndex = 900;
    this._newUserGuideLayer = layerNode;
    return layerNode;
  },

  _ensureNewUserGuideFingerNode: function () {
    var layerNode = this._ensureNewUserGuideLayer();
    var fingerNode = layerNode.getChildByName(GUIDE_FINGER_NAME);
    if (!fingerNode || !fingerNode.isValid) {
      fingerNode = new cc.Node(GUIDE_FINGER_NAME);
      fingerNode.parent = layerNode;
      fingerNode.anchorX = 0.5;
      fingerNode.anchorY = 0.5;
    }

    var sprite = fingerNode.getComponent(cc.Sprite) || fingerNode.addComponent(cc.Sprite);
    sprite.spriteFrame = this._newUserGuideFingerSpriteFrame;
    sprite.sizeMode = cc.Sprite.SizeMode.RAW;
    fingerNode.setContentSize(this._newUserGuideFingerSize);
    fingerNode.opacity = 255;
    fingerNode.active = true;
    this._newUserGuideFingerNode = fingerNode;
    return fingerNode;
  },

  _hideNewUserGuide: function () {
    stopGuideNodeActions(this._newUserGuideFingerNode);
    if (this._newUserGuideLayer && this._newUserGuideLayer.isValid) {
      this._newUserGuideLayer.active = false;
    }
  },

  _runNewUserGuideFingerBreath: function (fingerNode) {
    requireValidNode(fingerNode, "New user guide finger");
    fingerNode.stopAllActions();
    fingerNode.scale = FINGER_BASE_SCALE;
    fingerNode.runAction(cc.repeatForever(cc.sequence(
      cc.scaleTo(0.36, FINGER_BASE_SCALE * 1.13),
      cc.scaleTo(0.36, FINGER_BASE_SCALE * 0.94),
      cc.delayTime(0.18),
      cc.scaleTo(0.08, FINGER_BASE_SCALE * 1.22),
      cc.scaleTo(0.12, FINGER_BASE_SCALE),
      cc.delayTime(0.36)
    )));
  },

  _showNewUserGuideFingerAtTip: function (tipPoint) {
    var layerNode = this._ensureNewUserGuideLayer();
    layerNode.active = true;
    this._clearNewUserGuideArc();
    return this._ensureNewUserGuideSpriteFrame().then(function () {
      var fingerNode = this._ensureNewUserGuideFingerNode();
      fingerNode.setPosition(resolveFingerCenterForTip(tipPoint, this._newUserGuideFingerSize));
      this._runNewUserGuideFingerBreath(fingerNode);
      return fingerNode;
    }.bind(this));
  },

  _clearNewUserGuideArc: function () {
    if (!this._newUserGuideLayer || !this._newUserGuideLayer.isValid) {
      return;
    }
    var arcNode = this._newUserGuideLayer.getChildByName(GUIDE_ARC_NAME);
    if (arcNode && arcNode.isValid) {
      arcNode.destroy();
    }
  },

  _showNewUserGuideForQuickStart: function () {
    if (!this._isNewUserGuideStep(STEP_QUICK_START)) {
      return;
    }
    if (!this._levelSelectNode || !this._levelSelectNode.isValid) {
      throw new Error("New user guide quick start step requires LevelView.");
    }
    var quickStartNode = this._levelSelectNode.getChildByName("quick_start_btn");
    if (!quickStartNode || !quickStartNode.isValid) {
      throw new Error("New user guide requires quick_start_btn.");
    }
    return this._showNewUserGuideFingerAtTip(resolveNodePositionInRoot(quickStartNode, this.node));
  },

  _showNewUserGuideForStartGame: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    if (!this._startGameViewNode || !this._startGameViewNode.isValid || !this._startGameViewNode.active) {
      throw new Error("New user guide start game step requires active StartGameView.");
    }
    var playButtonNode = this._findNodeByNameRecursive(this._startGameViewNode, "play_btn");
    if (!playButtonNode || !playButtonNode.isValid) {
      throw new Error("New user guide requires StartGameView play_btn.");
    }
    return this._showNewUserGuideFingerAtTip(resolveNodePositionInRoot(playButtonNode, this.node));
  },

  _showNewUserGuideForGameplay: function () {
    if (!this._isNewUserGuideStep(STEP_GAME_FIRE)) {
      return;
    }
    return this._ensureNewUserGuideSpriteFrame().then(function () {
      var layerNode = this._ensureNewUserGuideLayer();
      var fingerNode = this._ensureNewUserGuideFingerNode();
      var shooterOrigin = this._getShooterOriginPoint();
      if (!shooterOrigin || !Number.isFinite(shooterOrigin.x) || !Number.isFinite(shooterOrigin.y)) {
        throw new Error("New user guide gameplay step requires shooter origin.");
      }

      layerNode.active = true;
      this._clearNewUserGuideArc();
      var arcNode = new cc.Node(GUIDE_ARC_NAME);
      arcNode.parent = layerNode;
      arcNode.zIndex = -1;
      var graphics = arcNode.addComponent(cc.Graphics);
      graphics.lineWidth = 8;
      graphics.strokeColor = cc.color(255, 244, 137, 210);
      var radius = 520;
      var startAngle = Math.PI * 0.36;
      var endAngle = Math.PI * 0.64;
      graphics.arc(shooterOrigin.x, shooterOrigin.y, radius, startAngle, endAngle, false);
      graphics.stroke();

      var middleTip = cc.v2(0, (BoardLayout.boardStartY + BoardLayout.dangerLineY) * 0.5);
      var leftTip = cc.v2(
        shooterOrigin.x + Math.cos(endAngle) * radius,
        shooterOrigin.y + Math.sin(endAngle) * radius
      );
      var rightTip = cc.v2(
        shooterOrigin.x + Math.cos(startAngle) * radius,
        shooterOrigin.y + Math.sin(startAngle) * radius
      );
      var middleCenter = resolveFingerCenterForTip(middleTip, this._newUserGuideFingerSize);
      var leftCenter = resolveFingerCenterForTip(leftTip, this._newUserGuideFingerSize);
      var rightCenter = resolveFingerCenterForTip(rightTip, this._newUserGuideFingerSize);

      fingerNode.setPosition(middleCenter);
      fingerNode.scale = FINGER_BASE_SCALE;
      fingerNode.stopAllActions();
      fingerNode.runAction(cc.repeatForever(cc.sequence(
        cc.delayTime(0.22),
        cc.scaleTo(0.12, FINGER_BASE_SCALE * 1.22),
        cc.scaleTo(0.12, FINGER_BASE_SCALE),
        cc.delayTime(0.26),
        cc.moveTo(0.58, leftCenter),
        cc.delayTime(0.16),
        cc.moveTo(1.16, rightCenter),
        cc.delayTime(0.18),
        cc.moveTo(0.52, middleCenter),
        cc.delayTime(0.42)
      )));
      return fingerNode;
    }.bind(this));
  },

  _advanceNewUserGuideToStartGame: function () {
    if (!this._isNewUserGuideStep(STEP_QUICK_START)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_START_GAME);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _rewindNewUserGuideToQuickStart: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_QUICK_START);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _advanceNewUserGuideToGameplay: function () {
    if (!this._isNewUserGuideStep(STEP_START_GAME)) {
      return;
    }
    var result = this.newUserGuideStore.markStep(this.newUserGuideState, STEP_GAME_FIRE);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  },

  _completeNewUserGuide: function () {
    if (!this._isNewUserGuideStep(STEP_GAME_FIRE)) {
      return;
    }
    var result = this.newUserGuideStore.markCompleted(this.newUserGuideState);
    this.newUserGuideState = result.state;
    this._saveNewUserGuideState();
    this._hideNewUserGuide();
  }
};
