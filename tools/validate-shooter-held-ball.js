"use strict";

var assert = require("assert");
var definition;
global.cc = {
  Component: function () {},
  Class: function (value) { definition = value; return value; },
  v2: function (x, y) { return { x: x, y: y }; }
};
require("../gameplay-src/render/ShooterHeldBallFollow");
var bone = { a: 1, b: 0, c: 0, d: 1, worldX: 10, worldY: 20 };
var parent = {
  convertToWorldSpaceAR: function (p) { return { x: p.x * 2 + 100, y: p.y * 2 - 60 }; },
  convertToNodeSpaceAR: function (p) { return { x: (p.x - 100) / 2, y: (p.y + 60) / 2 }; }
};
var ball = {
  isValid: true, parent: parent, active: true,
  position: { x: 12, y: 45 },
  setPosition: function (p) { this.position = p; }
};
var visual = {
  convertToWorldSpaceAR: function (p) { return { x: p.x * 2 + 80, y: p.y * 2 - 30 }; },
  convertToNodeSpaceAR: function (p) { return { x: (p.x - 80) / 2, y: (p.y + 30) / 2 }; }
};
var updates = 0;
var skeleton = {
  isValid: true, node: visual,
  _skeleton: { updateWorldTransform: function () { updates += 1; } },
  findBone: function (name) { assert.strictEqual(name, "bone23"); return bone; }
};
var follower = Object.create(definition);
follower.bind(skeleton, ball);
follower.syncPosition();
assert.deepStrictEqual(ball.position, { x: 12, y: 45 }, "Binding must preserve authored position.");
assert.deepStrictEqual(follower.handOffset, { x: 12, y: 10 });
bone.worldX += 3;
bone.worldY -= 8;
follower.lateUpdate();
assert.deepStrictEqual(ball.position, { x: 15, y: 37 }, "Idle must follow without a business render.");
bone.a = 0; bone.b = -1; bone.c = 1; bone.d = 0;
follower.lateUpdate();
assert.deepStrictEqual(ball.position, { x: -7, y: 39 }, "Ball offset must rotate with the hand.");
ball.position = { x: 12, y: 45 };
follower.bind(skeleton, ball);
follower.syncPosition();
assert.deepStrictEqual(ball.position, { x: -7, y: 39 }, "Layout refresh must restore hand pose without rebinding offset.");
ball.active = false;
follower.lateUpdate();
assert.strictEqual(ball.active, false, "Handoff visibility must remain controlled by shooter renderer.");
assert(updates >= 5, "Refresh world transforms each frame.");
skeleton.findBone = function () { return null; };
assert.throws(function () { follower.lateUpdate(); }, /hand bone is missing/);
console.log("[OK] Held ball initial offset, idle motion, rotated/scaled coordinate spaces, layout refresh and handoff visibility");
