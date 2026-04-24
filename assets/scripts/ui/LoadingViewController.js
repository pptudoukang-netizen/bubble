"use strict";

var PANEL_OUT_SCALE = 0.96;
var PANEL_OUT_DURATION = 0.16;
var VIEW_FADE_OUT_DURATION = 0.16;
var SPINNER_ROTATE_DURATION = 0.72;
var PROGRESS_MIN_DURATION = 0.08;
var PROGRESS_MAX_DURATION = 0.32;
var ANI_SPEED_REFRESH_INTERVAL = 1;
var ANI_MIN_MOVE_SPEED = 40;
var DEFAULT_ANI_MAX_MOVE_SPEED = 50;

function clamp01(value) {
  var num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  if (num >= 1) {
    return 1;
  }
  return num;
}

function getChildByPath(root, path) {
  if (!root || !path) {
    return null;
  }

  var current = root;
  var names = String(path).split("/");
  for (var i = 0; i < names.length; i += 1) {
    if (!current) {
      return null;
    }
    current = current.getChildByName(names[i]);
  }
  return current;
}

function ensureLabel(node, fontSize, lineHeight) {
  if (!node) {
    return null;
  }

  var label = node.getComponent(cc.Label) || node.addComponent(cc.Label);
  label.fontSize = fontSize;
  label.lineHeight = lineHeight;
  label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = cc.Label.Overflow.SHRINK;
  return label;
}

function clamp(value, min, max) {
  var num = Number(value);
  if (!Number.isFinite(num)) {
    return min;
  }
  if (num < min) {
    return min;
  }
  if (num > max) {
    return max;
  }
  return num;
}

var LoadingViewController = cc.Class({
  extends: cc.Component,

  onLoad: function () {
    this._targetProgress = 0;
    this._displayProgress = 0;
    this._progressAnim = null;
    this._aniMaxMoveSpeed = DEFAULT_ANI_MAX_MOVE_SPEED;
    this._aniMoveSpeed = 0;
    this._aniSpeedElapsed = 0;
    this._aniMinX = 0;
    this._aniMaxX = 0;
    this._aniBoundsReady = false;

    this._cacheNodesFromPrefab();
    this._ensureFallbackNodes();
    this.refreshLayout();
    this.setProgress(0, true);
    this._resetAniMovement();
    this.setStage(this._stageLabel && this._stageLabel.string ? this._stageLabel.string : "Loading...");
  },

  onEnable: function () {
    this.refreshLayout();
  },

  update: function (dt) {
    var elapsed = Math.max(0, Number(dt) || 0);
    this._updateProgressAnimation(elapsed);
    this._updateAniMovement(elapsed);
  },

  _updateProgressAnimation: function (dt) {
    if (!this._progressAnim) {
      return;
    }

    this._progressAnim.elapsed += dt;
    var t = this._progressAnim.duration <= 0 ? 1 : Math.min(1, this._progressAnim.elapsed / this._progressAnim.duration);
    // Smooth in-out easing to avoid sudden progress jumps.
    var eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this._displayProgress = this._progressAnim.from + (this._progressAnim.to - this._progressAnim.from) * eased;
    this._syncProgressVisual(this._displayProgress);

    if (t >= 1) {
      this._displayProgress = this._progressAnim.to;
      this._progressAnim = null;
      this._syncProgressVisual(this._displayProgress);
    }
  },

  refreshLayout: function () {
    var parent = this.node.parent;
    if (parent && parent.getContentSize) {
      this.node.setContentSize(parent.getContentSize());
    }

    var bgWidget = this._bgNode ? this._bgNode.getComponent(cc.Widget) : null;
    if (bgWidget) {
      bgWidget.isAlignTop = true;
      bgWidget.isAlignBottom = true;
      bgWidget.isAlignLeft = true;
      bgWidget.isAlignRight = true;
      bgWidget.top = 0;
      bgWidget.bottom = 0;
      bgWidget.left = 0;
      bgWidget.right = 0;
    }

    this._refreshAniMovementBounds(false);
  },

  setStage: function (stageText) {
    if (!this._stageLabel) {
      return;
    }
    var text = typeof stageText === "string" && stageText ? stageText : "Loading...";
    this._stageLabel.string = text;
  },

  setProgress: function (progress01, immediate) {
    var next = clamp01(progress01);
    if (next < this._targetProgress) {
      next = this._targetProgress;
    }
    this._targetProgress = next;
    this._applyProgress(!!immediate);
  },

  setAniMaxMoveSpeed: function (speed) {
    this._aniMaxMoveSpeed = Math.max(0, Number(speed) || 0);
    this._aniMoveSpeed = this._resolveAniMoveSpeed();
  },

  playIn: function () {
    this.refreshLayout();
    this.node.active = true;
    this.node.opacity = 255;
    if (this._panelNode) {
      this._panelNode.scale = 1;
    }
    this._resetAniMovement();
    this._startSpinner();
    return Promise.resolve();
  },

  playOut: function () {
    if (!this.node.active) {
      return Promise.resolve();
    }

    if (typeof cc.tween !== "function") {
      this.hideImmediate();
      return Promise.resolve();
    }

    if (cc.Tween && cc.Tween.stopAllByTarget) {
      cc.Tween.stopAllByTarget(this.node);
      if (this._panelNode) {
        cc.Tween.stopAllByTarget(this._panelNode);
      }
    }

    return new Promise(function (resolve) {
      cc.tween(this.node)
        .to(VIEW_FADE_OUT_DURATION, { opacity: 0 }, { easing: "quadIn" })
        .call(function () {
          this.hideImmediate();
          resolve();
        }.bind(this))
        .start();

      if (this._panelNode) {
        cc.tween(this._panelNode)
          .to(PANEL_OUT_DURATION, { scale: PANEL_OUT_SCALE }, { easing: "quadIn" })
          .start();
      }
    }.bind(this));
  },

  hideImmediate: function () {
    this.node.stopAllActions();
    if (this._panelNode) {
      this._panelNode.stopAllActions();
      this._panelNode.scale = 1;
    }
    this._stopSpinner();
    this._progressAnim = null;
    this.node.opacity = 0;
    this.node.active = false;
  },

  _cacheNodesFromPrefab: function () {
    this._bgNode = this.node.getChildByName("Bg");
    this._panelNode = this.node.getChildByName("Panel");
    this._stageNode = getChildByPath(this.node, "Panel/StageLabel");
    this._percentNode = getChildByPath(this.node, "Panel/PercentLabel");
    this._trackNode = getChildByPath(this.node, "Panel/ProgressTrack");
    this._fillNode = getChildByPath(this.node, "Panel/ProgressTrack/ProgressFill");
    this._spinnerNode = getChildByPath(this.node, "Panel/Spinner");
    this._aniNode = getChildByPath(this.node, "Panel/ani") || this.node.getChildByName("ani");

    this._stageLabel = this._stageNode ? this._stageNode.getComponent(cc.Label) : null;
    this._percentLabel = this._percentNode ? this._percentNode.getComponent(cc.Label) : null;
    this._progressBar = this._trackNode ? this._trackNode.getComponent(cc.ProgressBar) : null;
  },

  _ensureFallbackNodes: function () {
    if (!this._panelNode) {
      this._panelNode = this.node;
    }

    if (!this._stageNode) {
      this._stageNode = new cc.Node("StageLabel");
      this._stageNode.parent = this._panelNode;
      this._stageNode.setPosition(0, -50);
      this._stageLabel = ensureLabel(this._stageNode, 32, 36);
    }

    if (!this._percentNode) {
      this._percentNode = new cc.Node("PercentLabel");
      this._percentNode.parent = this._panelNode;
      this._percentNode.setPosition(0, 30);
      this._percentLabel = ensureLabel(this._percentNode, 30, 34);
    }

    if (!this._trackNode) {
      this._trackNode = new cc.Node("ProgressTrack");
      this._trackNode.parent = this._panelNode;
      this._trackNode.setContentSize(500, 15);
      this._trackNode.setPosition(0, 0);
    }

    if (!this._fillNode) {
      this._fillNode = new cc.Node("ProgressFill");
      this._fillNode.parent = this._trackNode;
      this._fillNode.setAnchorPoint(0, 0.5);
      this._fillNode.setPosition(-250, 0);
      this._fillNode.setContentSize(500, 15);
    }

    if (!this._stageLabel) {
      this._stageLabel = ensureLabel(this._stageNode, 32, 36);
    }

    if (!this._percentLabel) {
      this._percentLabel = ensureLabel(this._percentNode, 30, 34);
    }

    if (!this._progressBar) {
      this._progressBar = this._trackNode.getComponent(cc.ProgressBar);
      if (!this._progressBar) {
        this._progressBar = this._trackNode.addComponent(cc.ProgressBar);
      }
      this._progressBar.mode = cc.ProgressBar.Mode.HORIZONTAL;
      this._progressBar.totalLength = this._trackNode.width || 500;
      var fillSprite = this._fillNode.getComponent(cc.Sprite);
      if (fillSprite) {
        this._progressBar.barSprite = fillSprite;
      }
      this._progressBar.progress = 0;
    }
  },

  _applyProgress: function () {
    var immediate = arguments.length > 0 ? !!arguments[0] : false;
    var next = this._targetProgress;
    if (immediate) {
      this._progressAnim = null;
      this._displayProgress = next;
      this._syncProgressVisual(this._displayProgress);
      return;
    }

    var from = this._displayProgress;
    var delta = Math.abs(next - from);
    if (delta <= 0.0001) {
      this._progressAnim = null;
      this._displayProgress = next;
      this._syncProgressVisual(this._displayProgress);
      return;
    }

    var duration = Math.min(PROGRESS_MAX_DURATION, Math.max(PROGRESS_MIN_DURATION, delta * 0.55));
    this._progressAnim = {
      from: from,
      to: next,
      elapsed: 0,
      duration: duration
    };
  },

  _syncProgressVisual: function (value) {
    var next = clamp01(value);
    if (this._progressBar) {
      this._progressBar.progress = next;
    } else if (this._fillNode) {
      this._fillNode.scaleX = Math.max(0.001, next);
      this._fillNode.scaleY = 1;
    }

    if (this._percentLabel) {
      this._percentLabel.string = Math.round(next * 100) + "%";
    }
  },

  _resetAniMovement: function () {
    this._refreshAniMovementBounds(true);
    this._aniSpeedElapsed = 0;
    this._aniMoveSpeed = this._resolveAniMoveSpeed();
  },

  _refreshAniMovementBounds: function (resetToStart) {
    if (!this._aniNode || !this._aniNode.parent) {
      this._aniBoundsReady = false;
      return;
    }

    var viewSize = this.node.getContentSize ? this.node.getContentSize() : null;
    var screenWidth = viewSize && viewSize.width > 0
      ? viewSize.width
      : (cc.winSize && cc.winSize.width ? cc.winSize.width : 0);
    if (screenWidth <= 0) {
      this._aniBoundsReady = false;
      return;
    }

    var halfAniWidth = this._getAniHalfWidth();
    var anchorX = Number(this.node.anchorX);
    if (!Number.isFinite(anchorX)) {
      anchorX = 0.5;
    }

    var leftX = -screenWidth * anchorX;
    var rightX = screenWidth * (1 - anchorX);
    this._aniMinX = this._convertRootXToAniParent(leftX + halfAniWidth);
    this._aniMaxX = this._convertRootXToAniParent(rightX - halfAniWidth);
    this._aniBoundsReady = this._aniMaxX >= this._aniMinX;

    if (!this._aniBoundsReady) {
      return;
    }

    if (resetToStart) {
      this._aniNode.x = this._aniMinX;
      return;
    }

    this._aniNode.x = clamp(this._aniNode.x, this._aniMinX, this._aniMaxX);
  },

  _getAniHalfWidth: function () {
    if (!this._aniNode) {
      return 0;
    }

    var width = Number(this._aniNode.width) || 0;
    var scaleX = Math.abs(Number(this._aniNode.scaleX));
    if (!Number.isFinite(scaleX) || scaleX <= 0) {
      scaleX = 1;
    }
    return width * scaleX * 0.5;
  },

  _convertRootXToAniParent: function (rootX) {
    var parent = this._aniNode.parent;
    if (!parent || !this.node.convertToWorldSpaceAR || !parent.convertToNodeSpaceAR) {
      return rootX;
    }

    var worldPoint = this.node.convertToWorldSpaceAR(cc.v2(rootX, 0));
    return parent.convertToNodeSpaceAR(worldPoint).x;
  },

  _updateAniMovement: function (dt) {
    if (!this._aniNode || !this._aniBoundsReady || dt <= 0) {
      return;
    }

    this._aniSpeedElapsed += dt;
    if (this._aniSpeedElapsed >= ANI_SPEED_REFRESH_INTERVAL) {
      this._aniSpeedElapsed %= ANI_SPEED_REFRESH_INTERVAL;
      this._aniMoveSpeed = this._resolveAniMoveSpeed();
    }

    if (this._aniMoveSpeed <= 0 || this._aniNode.x >= this._aniMaxX) {
      return;
    }

    this._aniNode.x = Math.min(this._aniMaxX, this._aniNode.x + this._aniMoveSpeed * dt);
  },

  _resolveAniMoveSpeed: function () {
    var progress = this._progressBar ? this._progressBar.progress : this._displayProgress;
    var maxSpeed = Math.max(ANI_MIN_MOVE_SPEED, Number(this._aniMaxMoveSpeed) || 0);
    return ANI_MIN_MOVE_SPEED + clamp01(progress) * (maxSpeed - ANI_MIN_MOVE_SPEED);
  },

  _startSpinner: function () {
    if (!this._spinnerNode) {
      return;
    }
    this._stopSpinner();
    this._spinnerNode.angle = 0;
    this._spinnerNode.runAction(cc.repeatForever(cc.rotateBy(SPINNER_ROTATE_DURATION, 360)));
  },

  _stopSpinner: function () {
    if (!this._spinnerNode) {
      return;
    }
    this._spinnerNode.stopAllActions();
  }
});

module.exports = LoadingViewController;
