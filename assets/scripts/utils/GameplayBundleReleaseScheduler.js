"use strict";

var activeTimerId = null;
var activeToken = 0;

function cancelScheduledGameplayBundleRelease() {
  activeToken += 1;
  if (activeTimerId === null) {
    return;
  }
  clearTimeout(activeTimerId);
  activeTimerId = null;
}

function scheduleGameplayBundleRelease(idleMs, onRelease) {
  if (typeof onRelease !== "function") {
    throw new Error("Gameplay bundle idle release callback is required.");
  }
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    throw new Error("Gameplay bundle idle release ms must be a positive number.");
  }

  cancelScheduledGameplayBundleRelease();
  var token = activeToken;
  activeTimerId = setTimeout(function () {
    if (token !== activeToken) {
      return;
    }
    activeTimerId = null;
    onRelease();
  }, idleMs);
}

module.exports = {
  scheduleGameplayBundleRelease: scheduleGameplayBundleRelease,
  cancelScheduledGameplayBundleRelease: cancelScheduledGameplayBundleRelease
};
