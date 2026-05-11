"use strict";

var Shared = require("./GameBootstrapShared");
var BoardLayout = Shared.BoardLayout;
var RuntimeModeConfig = Shared.RuntimeModeConfig;
var BASELINE_SIDE_PADDING = Shared.BASELINE_SIDE_PADDING;
var BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM = Shared.BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM;
var BASELINE_JAR_RENDER_Y_OFFSET = Shared.BASELINE_JAR_RENDER_Y_OFFSET;
var BASELINE_SHOOTER_OFFSET_FROM_BOTTOM = Shared.BASELINE_SHOOTER_OFFSET_FROM_BOTTOM;
var BASELINE_DANGER_OFFSET_FROM_BOTTOM = Shared.BASELINE_DANGER_OFFSET_FROM_BOTTOM;
var RELEASE_FALSE_SCENE_FIELDS = Shared.RELEASE_FALSE_SCENE_FIELDS;
var assertReleaseSceneFieldDisabled = Shared.assertReleaseSceneFieldDisabled;
var assertReleaseRewardedVideoAdUnitId = Shared.assertReleaseRewardedVideoAdUnitId;

module.exports = {
  _applyRuntimeModeConfig: function () {
    RuntimeModeConfig.validate();
    if (RuntimeModeConfig.isRelease()) {
      RELEASE_FALSE_SCENE_FIELDS.forEach(function (fieldName) {
        assertReleaseSceneFieldDisabled(this, fieldName);
      }, this);
      assertReleaseRewardedVideoAdUnitId(this.rewardedVideoAdUnitId);
    }

    this.enableSpecialEntitiesTestMode = RuntimeModeConfig.enableSpecialEntitiesTestMode && this.enableSpecialEntitiesTestMode === true;
    this.showDebugOverlay = RuntimeModeConfig.showDebugOverlay && this.showDebugOverlay === true;
    this.showGridTestLayer = RuntimeModeConfig.showGridTestLayer && this.showGridTestLayer === true;
    this.showDropTestButton = RuntimeModeConfig.showDropTestButton && this.showDropTestButton === true;
    this.enableLevelEditor = RuntimeModeConfig.enableLevelEditor && this.enableLevelEditor === true;
    this.enableMockRewardedAdOnUnsupported = RuntimeModeConfig.enableMockRewardedAdOnUnsupported && this.enableMockRewardedAdOnUnsupported === true;
  },

  _applyBoardTuningFromProperties: function () {
    var projectileSpeed = Number(this.projectileSpeed);
    var impactBounceSpeed = Number(this.impactBounceSpeed);
    var jarRimBounceSpeed = Number(this.jarRimBounceSpeed);
    var guideFrontClipRadiusScale = Number(this.guideFrontClipRadiusScale);
    var guideDotPulseSpeedScale = Number(this.guideDotPulseSpeedScale);

    if (!Number.isFinite(projectileSpeed) || projectileSpeed < 120) {
      throw new Error("projectileSpeed must be >= 120 in GameBootstrap properties.");
    }
    if (!Number.isFinite(impactBounceSpeed) || impactBounceSpeed < 80) {
      throw new Error("impactBounceSpeed must be >= 80 in GameBootstrap properties.");
    }
    if (!Number.isFinite(jarRimBounceSpeed) || jarRimBounceSpeed < 120) {
      throw new Error("jarRimBounceSpeed must be >= 120 in GameBootstrap properties.");
    }
    if (typeof this.showGhostBubble !== "boolean") {
      throw new Error("showGhostBubble must be boolean in GameBootstrap properties.");
    }
    if (!Number.isFinite(guideFrontClipRadiusScale) || guideFrontClipRadiusScale < 0 || guideFrontClipRadiusScale > 3) {
      throw new Error("guideFrontClipRadiusScale must be in [0, 3] in GameBootstrap properties.");
    }
    if (!Number.isFinite(guideDotPulseSpeedScale) || guideDotPulseSpeedScale < 0.1 || guideDotPulseSpeedScale > 5) {
      throw new Error("guideDotPulseSpeedScale must be in [0.1, 5] in GameBootstrap properties.");
    }

    BoardLayout.projectileSpeed = projectileSpeed;
    BoardLayout.impactBounceSpeed = impactBounceSpeed;
    BoardLayout.jarRimBounceSpeed = jarRimBounceSpeed;
    BoardLayout.showGhostBubble = this.showGhostBubble;
    BoardLayout.guideFrontClipRadiusScale = guideFrontClipRadiusScale;
    BoardLayout.guideDotPulseSpeedScale = guideDotPulseSpeedScale;
  },

  _applyViewportLayout: function () {
    this._applyBoardTuningFromProperties();

    var canvas = this.node ? this.node.getComponent(cc.Canvas) : null;
    var designSize = canvas && canvas._designResolution
      ? canvas._designResolution
      : cc.size(720, 1280);
    var designWidth = Math.max(1, Number(designSize.width) || 720);
    var designHeight = Math.max(1, Number(designSize.height) || 1280);

    var frameSize = cc.view && cc.view.getFrameSize ? cc.view.getFrameSize() : cc.size(designWidth, designHeight);
    var frameWidth = Math.max(1, Number(frameSize.width) || designWidth);
    var frameHeight = Math.max(1, Number(frameSize.height) || designHeight);
    var frameAspect = frameWidth / frameHeight;
    var designAspect = designWidth / designHeight;

    var width = designWidth;
    var height = designHeight;
    if (frameAspect <= designAspect) {
      // 长屏：固定宽度，扩展可视高度，避免上下黑边。
      if (canvas) {
        canvas.fitWidth = true;
        canvas.fitHeight = false;
      }
      height = designWidth / frameAspect;
    } else {
      // 宽屏：固定高度，扩展可视宽度，避免左右黑边。
      if (canvas) {
        canvas.fitWidth = false;
        canvas.fitHeight = true;
      }
      width = designHeight * frameAspect;
    }

    if (this.node && this.node.setContentSize) {
      this.node.setContentSize(width, height);
    }

    var halfWidth = width * 0.5;
    var halfHeight = height * 0.5;
    var boardHalfWidth = Math.max(
      BoardLayout.bubbleDiameter * 4.5,
      halfWidth - BASELINE_SIDE_PADDING
    );

    BoardLayout.boardLeft = -boardHalfWidth;
    BoardLayout.boardRight = boardHalfWidth;
    BoardLayout.jarLayoutWidth = width;
    var safeAreaInsets = this._resolveSafeAreaInsetsInDesignSpace(width, height, frameWidth, frameHeight);
    // 顶部玻璃球首行：屏幕顶部往下 (130 + 球半径)。
    BoardLayout.boardStartY = halfHeight - (130 + BoardLayout.bubbleRadius + safeAreaInsets.top);

    var bottomY = -halfHeight;
    // 底部元素按“离屏幕底部固定高度”适配。
    BoardLayout.jarBaseY = bottomY + BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM - BASELINE_JAR_RENDER_Y_OFFSET;
    BoardLayout.shooterOrigin = {
      x: 0,
      y: bottomY + BASELINE_SHOOTER_OFFSET_FROM_BOTTOM
    };
    BoardLayout.dangerLineY = bottomY + BASELINE_DANGER_OFFSET_FROM_BOTTOM;
  },

  _resolveSafeAreaInsetsInDesignSpace: function (designWidth, designHeight, frameWidth, frameHeight) {
    var insets = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    };

    var safeRect = this._getSafeAreaRectFromRuntime();
    if (!safeRect) {
      return insets;
    }

    var safeTop = Number(safeRect.top);
    var safeBottom = Number(safeRect.bottom);
    var safeLeft = Number(safeRect.left);
    var safeRight = Number(safeRect.right);
    if (!isFinite(safeTop) || !isFinite(safeBottom) || !isFinite(safeLeft) || !isFinite(safeRight)) {
      return insets;
    }

    var sourceWidth = Math.max(1, Number(safeRect.screenWidth) || frameWidth || 1);
    var sourceHeight = Math.max(1, Number(safeRect.screenHeight) || frameHeight || 1);
    var topInsetPx = Math.max(0, safeTop);
    var leftInsetPx = Math.max(0, safeLeft);
    var rightInsetPx = Math.max(0, sourceWidth - safeRight);
    var bottomInsetPx = Math.max(0, sourceHeight - safeBottom);

    var widthScale = Math.max(0.0001, designWidth / sourceWidth);
    var heightScale = Math.max(0.0001, designHeight / sourceHeight);

    insets.top = topInsetPx * heightScale;
    insets.bottom = bottomInsetPx * heightScale;
    insets.left = leftInsetPx * widthScale;
    insets.right = rightInsetPx * widthScale;
    return insets;
  },

  _getSafeAreaRectFromRuntime: function () {
    if (typeof wx !== "undefined" && wx && typeof wx.getSystemInfoSync === "function") {
      try {
        var systemInfo = wx.getSystemInfoSync();
        if (systemInfo && systemInfo.safeArea) {
          return {
            left: Number(systemInfo.safeArea.left) || 0,
            right: Number(systemInfo.safeArea.right) || 0,
            top: Number(systemInfo.safeArea.top) || 0,
            bottom: Number(systemInfo.safeArea.bottom) || 0,
            screenWidth: Number(systemInfo.screenWidth) || 0,
            screenHeight: Number(systemInfo.screenHeight) || 0
          };
        }
      } catch (error) {
        // Fallback to engine-level API.
      }
    }

    if (cc && cc.sys && typeof cc.sys.getSafeAreaRect === "function") {
      try {
        var runtimeSafeRect = cc.sys.getSafeAreaRect();
        if (runtimeSafeRect) {
          var rectX = Number(runtimeSafeRect.x) || 0;
          var rectY = Number(runtimeSafeRect.y) || 0;
          var rectWidth = Number(runtimeSafeRect.width) || 0;
          var rectHeight = Number(runtimeSafeRect.height) || 0;
          if (rectWidth > 0 && rectHeight > 0) {
            return {
              left: rectX,
              right: rectX + rectWidth,
              bottom: rectY + rectHeight,
              top: rectY
            };
          }
        }
      } catch (error) {
        // Fallback to platform-specific APIs.
      }
    }

    return null;
  }
};
