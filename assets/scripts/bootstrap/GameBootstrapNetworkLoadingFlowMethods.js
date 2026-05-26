"use strict";

var NetworkLoadingOverlay = require("../ui/NetworkLoadingOverlay");

module.exports = {
  _showNetworkLoading: function (options) {
    if (!this.networkLoadingOverlay || typeof this.networkLoadingOverlay.show !== "function") {
      throw new Error("Network loading overlay is not ready.");
    }
    return this.networkLoadingOverlay.show(options);
  },

  _hideNetworkLoading: function (token) {
    if (!this.networkLoadingOverlay || typeof this.networkLoadingOverlay.hide !== "function") {
      throw new Error("Network loading overlay is not ready.");
    }
    this.networkLoadingOverlay.hide(token);
  },

  _runWithNetworkLoading: function (promiseFactory, options) {
    if (!this.networkLoadingOverlay || typeof this.networkLoadingOverlay.run !== "function") {
      return Promise.reject(new Error("Network loading overlay is not ready."));
    }
    return this.networkLoadingOverlay.run(promiseFactory, options);
  },

  _isNetworkLoadingTimeoutError: function (error) {
    return NetworkLoadingOverlay.isTimeoutError(error);
  }
};
