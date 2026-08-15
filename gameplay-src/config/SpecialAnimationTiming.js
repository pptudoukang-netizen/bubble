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
  blastTriggerDelay: 0
};

var swirlRotation = {
  duration: 0.4,
  angleDegrees: 60
};

var wormholeShift = {
  duration: 0.35,
  inhaleDuration: 0.175,
  exhaleDuration: 0.175,
  projectileAbsorbDuration: 0.22
};

var vineCast = {
  previewDuration: 0.65
};

var spiritCocoon = {
  frameDuration: 0.1,
  frameCount: 5,
  revealDuration: 0.3,
  mistTraversalStepDuration: 0.2,
  rowTraversalStepDuration: 0.35
};

spiritCocoon.totalDuration =
  spiritCocoon.frameDuration * spiritCocoon.frameCount +
  spiritCocoon.revealDuration;

var fairyAssist = {
  flyInDuration: 0.45,
  flyOutDuration: 0.65,
  flyOutDistance: 880
};

var trappedSpriteRescue = {
  flyOutDuration: 0.65,
  exitMargin: 80
};

function requirePositiveNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!isFinite(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive number.");
  }
  return numberValue;
}

function calculateImpactBounceTotalDuration(pushDistance, bounceSpeed) {
  var safePushDistance = requirePositiveNumber(pushDistance, "Impact bounce pushDistance");
  var safeBounceSpeed = requirePositiveNumber(bounceSpeed, "Impact bounce bounceSpeed");
  var pushDuration = Math.max(
    impactBounce.minPushDuration,
    safePushDistance / safeBounceSpeed
  );
  var returnDuration = Math.max(
    impactBounce.minReturnDuration,
    pushDuration * impactBounce.returnDurationRatio
  );
  return pushDuration + returnDuration + impactBounce.settleDuration;
}

var impactBounce = {
  defaultPushDistance: 12,
  defaultBounceSpeed: 220,
  minPushDuration: 0.028,
  minReturnDuration: 0.06,
  returnDurationRatio: 2.2,
  settleDuration: 0.04
};

impactBounce.totalDuration = calculateImpactBounceTotalDuration(
  impactBounce.defaultPushDistance,
  impactBounce.defaultBounceSpeed
);

var iceSnowballCollect = {
  thawShakeStepDuration: 0.04,
  thawShakeStepCount: 5,
  flyStartDelay: 0.03,
  flyDuration: 0.62
};

iceSnowballCollect.thawShakeTotalDuration =
  iceSnowballCollect.thawShakeStepDuration * iceSnowballCollect.thawShakeStepCount;

iceSnowballCollect.floatingIceDropDelay =
  iceSnowballCollect.thawShakeTotalDuration +
  iceSnowballCollect.flyStartDelay;

module.exports = Object.freeze({
  keyUnlock: Object.freeze(keyUnlock),
  molotovBlast: Object.freeze(molotovBlast),
  swirlRotation: Object.freeze(swirlRotation),
  wormholeShift: Object.freeze(wormholeShift),
  vineCast: Object.freeze(vineCast),
  spiritCocoon: Object.freeze(spiritCocoon),
  fairyAssist: Object.freeze(fairyAssist),
  trappedSpriteRescue: Object.freeze(trappedSpriteRescue),
  impactBounce: Object.freeze(impactBounce),
  iceSnowballCollect: Object.freeze(iceSnowballCollect),
  calculateImpactBounceTotalDuration: calculateImpactBounceTotalDuration
});
