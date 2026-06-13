"use strict";

var keyUnlock = {
  flyDuration: 0.62,
  shrinkDuration: 0.08,
  lockShakeStepDuration: 0.04,
  lockShakeStepCount: 5
};

keyUnlock.totalDuration =
  keyUnlock.flyDuration +
  keyUnlock.shrinkDuration +
  keyUnlock.lockShakeStepDuration * keyUnlock.lockShakeStepCount;

var molotovBlast = {
  totalDuration: 0.2,
  blastTriggerDelay: 0.1
};

module.exports = Object.freeze({
  keyUnlock: Object.freeze(keyUnlock),
  molotovBlast: Object.freeze(molotovBlast)
});
