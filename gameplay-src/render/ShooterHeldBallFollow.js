"use strict";

// shou-2 is the raised hand in diqiushou; its slot is bound to bone23.
var HAND_BONE_NAME = "bone23";

module.exports = cc.Class({
  name: "ShooterHeldBallFollow",
  extends: cc.Component,

  bind: function (skeleton, ballNode) {
    if (!skeleton || !skeleton.isValid || !ballNode || !ballNode.isValid) {
      throw new Error("Shooter held ball requires a live Spine and ball node.");
    }
    if (this.skeleton) {
      if (this.skeleton !== skeleton || this.ballNode !== ballNode) {
        throw new Error("Shooter held ball binding cannot change nodes.");
      }
      return;
    }
    this.skeleton = skeleton;
    this.ballNode = ballNode;
    var bone = this.requireUpdatedHandBone();
    var world = ballNode.parent.convertToWorldSpaceAR(ballNode.position);
    var point = skeleton.node.convertToNodeSpaceAR(world);
    var determinant = bone.a * bone.d - bone.b * bone.c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.000001) {
      throw new Error("Shooter held ball hand transform is not invertible.");
    }
    var dx = point.x - bone.worldX;
    var dy = point.y - bone.worldY;
    this.handOffset = cc.v2(
      (dx * bone.d - dy * bone.b) / determinant,
      (dy * bone.a - dx * bone.c) / determinant
    );
  },

  requireUpdatedHandBone: function () {
    var skeleton = this.skeleton;
    if (!skeleton || !skeleton.isValid || !skeleton._skeleton) {
      throw new Error("Shooter held ball requires a live realtime Spine skeleton.");
    }
    // Creator 2.4.12's public updateWorldTransform skips realtime skeletons.
    // Refresh the runtime here, after animation update and before rendering.
    skeleton._skeleton.updateWorldTransform();
    var bone = skeleton.findBone(HAND_BONE_NAME);
    if (!bone) {
      throw new Error("Shooter held ball hand bone is missing: " + HAND_BONE_NAME);
    }
    return bone;
  },

  syncPosition: function () {
    if (!this.ballNode || !this.ballNode.isValid || !this.ballNode.parent || !this.handOffset) {
      throw new Error("Shooter held ball follower is not bound.");
    }
    var bone = this.requireUpdatedHandBone();
    var offset = this.handOffset;
    var point = cc.v2(
      bone.worldX + bone.a * offset.x + bone.b * offset.y,
      bone.worldY + bone.c * offset.x + bone.d * offset.y
    );
    var world = this.skeleton.node.convertToWorldSpaceAR(point);
    var position = this.ballNode.parent.convertToNodeSpaceAR(world);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error("Shooter held ball position must be finite.");
    }
    this.ballNode.setPosition(position);
  },

  lateUpdate: function () {
    this.syncPosition();
  }
});
