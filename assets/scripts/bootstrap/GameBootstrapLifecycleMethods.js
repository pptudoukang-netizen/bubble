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
  },

  onDisable: function () {
    if (cc.view && cc.view.setResizeCallback) {
      cc.view.setResizeCallback(null);
    }
    this._resizeCallback = null;
    this._unbindGameCircleWelfareReturnRefresh();
  },

  onDestroy: function () {
    this._unbindGameCircleWelfareReturnRefresh();
    if (this.audioManager) {
      this.audioManager.stopBgm();
      this.audioManager.stopAllSfx();
    }
  },

  _handleViewResize: function () {
    this._applyViewportLayout();
    if (this._loadingViewController && this._loadingViewController.refreshLayout) {
      this._loadingViewController.refreshLayout();
    }

    if (this.levelRenderer && this.currentLevelConfig && !this.isRestarting && !this.isSelectingLevel) {
      var snapshot = this.gameManager.getRuntimeSnapshot();
      this.levelRenderer.renderLevel(this.currentLevelConfig, snapshot).catch(function (error) {
        Logger.warn("Resize rerender failed", error && error.message ? error.message : error);
      }).then(function () {
        this._renderRouteEditor();
      }.bind(this));
    }
  }
};
