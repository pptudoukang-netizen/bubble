"use strict";

function attachGameManagerColorCloudMethods(GameManager) {
  GameManager.prototype._resolveColorCloudProjectileSegment = function (
    projectile,
    fromPoint,
    toPoint,
    frameStartFraction,
    frameEndFraction
  ) {
    if (!projectile || !projectile.ball || typeof projectile.ball !== "object") {
      throw new Error("Color cloud projectile resolution requires active projectile ball.");
    }
    if (!projectile.colorCloudInsideIds || typeof projectile.colorCloudInsideIds !== "object") {
      throw new Error("Color cloud projectile resolution requires colorCloudInsideIds.");
    }
    var hitEvents = this.systems.colorCloudSystem.resolveProjectileSegment(
      fromPoint,
      toPoint,
      frameStartFraction,
      frameEndFraction,
      projectile.colorCloudInsideIds,
      this.colorCloudRandom
    );
    hitEvents.forEach(function (hitEvent) {
      projectile.color = hitEvent.resolvedColor;
      projectile.ball.color = hitEvent.resolvedColor;
      this._pushRuntimeEvent("color_cloud_hit", {
        cloudId: hitEvent.cloudId,
        cloudColor: hitEvent.cloudColor,
        resolvedColor: hitEvent.resolvedColor,
        hitCount: hitEvent.hitCount,
        hitDispearTime: hitEvent.hitDispearTime,
        fadeStarted: hitEvent.fadeStarted
      });
    }, this);
    return hitEvents;
  };
}

module.exports = attachGameManagerColorCloudMethods;
