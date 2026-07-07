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

  _runLevelEntryWithLoading: function (promiseFactory) {
    if (typeof promiseFactory !== "function") {
      return Promise.reject(new Error("Level entry loading task must be a function."));
    }
    var token = null;
    return this._showNetworkLoading({
      timeoutMs: this.networkLoadingTimeoutMs
    }).then(function (loadingToken) {
      token = loadingToken;
      var taskPromise = null;
      try {
        taskPromise = promiseFactory();
      } catch (error) {
        this._hideNetworkLoading(token);
        return Promise.reject(error);
      }
      if (!taskPromise || typeof taskPromise.then !== "function") {
        this._hideNetworkLoading(token);
        return Promise.reject(new Error("Level entry loading task must return a Promise."));
      }
      return taskPromise.then(function (result) {
        this._hideNetworkLoading(token);
        return result;
      }.bind(this), function (error) {
        this._hideNetworkLoading(token);
        throw error;
      }.bind(this));
    }.bind(this));
  },

  _isNetworkLoadingTimeoutError: function (error) {
    return NetworkLoadingOverlay.isTimeoutError(error);
  }
};
