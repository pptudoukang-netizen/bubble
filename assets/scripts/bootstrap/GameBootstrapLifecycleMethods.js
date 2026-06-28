"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;

module.exports = {
  onEnable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      this._resizeCallback = this._handleViewResize.bind(this);
      cc.view.setResizeCallback(this._resizeCallback);
    }
    this._bindGameCircleWelfareReturnRefresh();
    this._bindFriendGiftEnterClaim();
    if (typeof this._bindReturnToForegroundInterstitialAd === "function") {
      this._bindReturnToForegroundInterstitialAd();
    }
    if (this.isSelectingLevel && typeof this._ensureStaminaRecoveryTicker === "function") {
      this._ensureStaminaRecoveryTicker();
    }
    if (typeof this._syncDebugOverlayVisibility === "function") {
      this._syncDebugOverlayVisibility();
    }
  },

  onDisable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      cc.view.setResizeCallback(null);
    }
    this._resizeCallback = null;
    this._unbindGameCircleWelfareReturnRefresh();
    this._unbindFriendGiftEnterClaim();
    if (typeof this._unbindReturnToForegroundInterstitialAd === "function") {
      this._unbindReturnToForegroundInterstitialAd();
    }
    if (this._startGameNativeTemplateAdShowing === true && typeof this._hideStartGameNativeTemplateAd === "function") {
      this._hideStartGameNativeTemplateAd();
    }
    if (this._resultNativeTemplateAdShowing === true && typeof this._hideResultNativeTemplateAd === "function") {
      this._hideResultNativeTemplateAd();
    }
    if (typeof this._hideLevelSelectNativeTemplateAd === "function") {
      this._hideLevelSelectNativeTemplateAd();
    }
    if (typeof this._clearStaminaRecoveryTicker === "function") {
      this._clearStaminaRecoveryTicker();
    }
  },

  onDestroy: function () {
    if (typeof this._cancelGameplayBundleIdleRelease === "function") {
      this._cancelGameplayBundleIdleRelease();
    }
    this._unbindGameCircleWelfareReturnRefresh();
    this._unbindFriendGiftEnterClaim();
    if (typeof this._unbindReturnToForegroundInterstitialAd === "function") {
      this._unbindReturnToForegroundInterstitialAd();
    }
    if (this._startGameNativeTemplateAdShowing === true && typeof this._hideStartGameNativeTemplateAd === "function") {
      this._hideStartGameNativeTemplateAd();
    }
    if (this._resultNativeTemplateAdShowing === true && typeof this._hideResultNativeTemplateAd === "function") {
      this._hideResultNativeTemplateAd();
    }
    if (typeof this._hideLevelSelectNativeTemplateAd === "function") {
      this._hideLevelSelectNativeTemplateAd();
    }
    if (typeof this._clearStaminaRecoveryTicker === "function") {
      this._clearStaminaRecoveryTicker();
    }
    if (this.audioManager) {
      this.audioManager.stopBgm();
      this.audioManager.stopAllSfx();
    }
    if (this.networkLoadingOverlay && typeof this.networkLoadingOverlay.destroy === "function") {
      this.networkLoadingOverlay.destroy();
    }
    if (typeof this._hideSpecialIntroduceView === "function") {
      this._hideSpecialIntroduceView();
    }
  },

  _handleViewResize: function () {
    this._applyViewportLayout();
    if (this.isSelectingLevel && typeof this._refreshLevelSelectNativeTemplateAdLayout === "function") {
      this._refreshLevelSelectNativeTemplateAdLayout();
    }
    if (this._startGameViewNode && this._startGameViewNode.isValid && this._startGameViewNode.active && typeof this._refreshStartGameNativeTemplateAdLayout === "function") {
      this._refreshStartGameNativeTemplateAdLayout();
    }
    if (this._resultNativeTemplateAdShowing === true && typeof this._refreshResultNativeTemplateAdLayout === "function") {
      this._refreshResultNativeTemplateAdLayout();
    }
    if (this._loadingViewController && this._loadingViewController.refreshLayout) {
      this._loadingViewController.refreshLayout();
    }
    if (this.networkLoadingOverlay && typeof this.networkLoadingOverlay.refreshLayout === "function") {
      this.networkLoadingOverlay.refreshLayout();
    }

    if (this.levelRenderer && this.gameManager && this.currentLevelConfig && !this.isRestarting && !this.isSelectingLevel) {
      if (typeof this.levelRenderer.syncBoardLayoutHudBottomLine === "function") {
        this.levelRenderer.syncBoardLayoutHudBottomLine();
      }
      var snapshot = this.gameManager.getRuntimeSnapshot();
      if (snapshot && snapshot.state === "won" && typeof this._applyCurrentLevelBestScoreFlag === "function") {
        this._applyCurrentLevelBestScoreFlag(snapshot);
        this._applyCurrentLevelClearRewardItems(snapshot);
      }
      this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).catch(function (error) {
        Logger.warn("Resize rerender failed", error && error.message ? error.message : error);
      }).then(function () {
        this._renderRouteEditor();
      }.bind(this));
    }
  }
};
