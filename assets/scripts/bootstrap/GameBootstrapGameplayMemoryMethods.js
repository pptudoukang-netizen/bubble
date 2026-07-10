"use strict";

var Shared = require("./GameBootstrapShared");
var Logger = Shared.Logger;
var BundleLoader = Shared.BundleLoader;
var GameplayBundleReleaseScheduler = require("../utils/GameplayBundleReleaseScheduler");

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

module.exports = {
  _cancelGameplayBundleIdleRelease: function () {
    GameplayBundleReleaseScheduler.cancelScheduledGameplayBundleRelease();
  },

  _scheduleGameplayBundleIdleRelease: function () {
    var idleMs = requirePositiveInteger(
      Math.floor(Number(this.gameplayBundleIdleReleaseMs)),
      "gameplayBundleIdleReleaseMs"
    );
    GameplayBundleReleaseScheduler.scheduleGameplayBundleRelease(idleMs, function () {
      this._releaseGameplayBundleIfIdle();
    }.bind(this));
  },

  _releaseGameplayBundleIfIdle: function () {
    if (this.isSelectingLevel !== true) {
      return;
    }
    if (this.isRestarting === true) {
      return;
    }
    if (typeof BundleLoader.releaseNamedBundle !== "function") {
      throw new Error("BundleLoader.releaseNamedBundle is required for gameplay bundle idle release.");
    }

    if (this.levelRenderer && typeof this.levelRenderer.releaseAfterGameplayBundleUnload === "function") {
      this.levelRenderer.releaseAfterGameplayBundleUnload();
    }
    BundleLoader.releaseNamedBundle("game");
    BundleLoader.releaseNamedBundle("animation");
    this._gameplayKernelPromise = null;

    Logger.info("Released game bundle after idle timeout", {
      idleMs: Math.floor(Number(this.gameplayBundleIdleReleaseMs))
    });
    this._logAssetManagerStats("game_bundle_released");
  }
};
