"use strict";
var assert = require("assert");
global.cc = {
  sequence: function (delay, callback) { return { delay: delay, callback: callback }; },
  delayTime: function (seconds) { return seconds; },
  callFunc: function (callback) { return callback; }
};
function node(name, parent) {
  var value = {
    name: name, parent: parent, isValid: true, active: false, children: [],
    getChildByName: function (childName) { return this.children.find(function (child) { return child.name === childName; }); },
    setPosition: function () {},
    runAction: function (action) { this.action = action; this.elapsed = 0; },
    stopAllActions: function () { this.action = null; },
    removeFromParent: function () { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
    destroy: function () { this.isValid = false; this.stopAllActions(); },
    tick: function (seconds) {
      if (!this.isValid || !this.action) { return; }
      this.elapsed += seconds;
      if (this.elapsed >= this.action.delay) {
        var callback = this.action.callback;
        this.action = null;
        callback();
      }
    }
  };
  if (parent) { parent.children.push(value); }
  return value;
}
function noop() {}
function Renderer() {
  this.layers = { modal: node("Modal", null) };
  this.events = [];
  this.creates = 0;
}
require("../gameplay-src/render/LevelRendererSceneResultPopupMethods")(Renderer, {
  PREFAB_PATHS: { loseView: "LoseView" },
  getOrCreateChild: function (parent, name) { return node(name, parent); },
  SpriteProxyLayerHelper: { destroyProxyRoot: noop, rebuildAutoProxyTree: noop },
  renderLoseFailureStatus: noop, renderLoseReviveGain: noop, renderLoseCoinButton: noop,
  resolveLoseRewardEntry: function () { return null; }, applyLoseReviveLayout: noop
});
Renderer.prototype._instantiateOrCreate = function (path, parent, name) { this.creates += 1; return node(name, parent); };
Renderer.prototype._ensurePopupMaskVisible = noop;
Renderer.prototype._ensurePopupContentContainer = function (view) { return view; };
Renderer.prototype._playPopupContentOpenAnimation = noop;
Renderer.prototype._bindLoseButton = noop;
Renderer.prototype._notifyResultViewLifecycle = function (event) { this.events.push(event); };
function render(renderer, state) {
  renderer.lastRuntimeSnapshot = { state: state };
  renderer._renderLoseView(renderer.lastRuntimeSnapshot);
}
["lost_danger", "lost_hazard", "lost_objective", "out_of_shots"].forEach(function (state) {
  var renderer = new Renderer();
  render(renderer, state);
  var timer = renderer.layers.modal.getChildByName("LoseViewDelay");
  assert.strictEqual(timer.action.delay, 1.5);
  assert.strictEqual(renderer.creates, 0, "No popup/mask before delay.");
  timer.tick(0.5);
  render(renderer, state);
  assert.strictEqual(renderer.layers.modal.getChildByName("LoseViewDelay"), timer, "Repeated refresh must reuse timer.");
  timer.tick(0.999);
  assert.strictEqual(renderer.creates, 0);
  assert.strictEqual(renderer.events.length, 0, "Show lifecycle must wait too.");
  timer.tick(0.002);
  assert.strictEqual(renderer.creates, 1);
  assert(renderer.layers.modal.getChildByName("LoseView").active);
  assert.deepStrictEqual(renderer.events, ["onLoseViewShow"]);
  render(renderer, state);
  assert.strictEqual(renderer.events.length, 1, "No duplicate show callback.");
  render(renderer, "running");
  assert.strictEqual(renderer.layers.modal.getChildByName("LoseViewDelay"), undefined);
  assert.strictEqual(renderer.layers.modal.getChildByName("LoseView").active, false);
  render(renderer, state);
  assert.strictEqual(renderer.layers.modal.getChildByName("LoseView").active, false, "Second failure waits again.");
});
var renderer = new Renderer();
render(renderer, "lost_objective");
var cancelled = renderer.layers.modal.getChildByName("LoseViewDelay");
var staleCallback = cancelled.action.callback;
render(renderer, "running");
staleCallback();
assert.strictEqual(renderer.creates, 0, "Revived scene must not display stale popup.");
render(renderer, "lost_objective");
var oldTimer = renderer.layers.modal.getChildByName("LoseViewDelay");
var oldCallback = oldTimer.action.callback;
oldTimer.removeFromParent(); oldTimer.destroy();
render(renderer, "running");
oldCallback();
assert.strictEqual(renderer.creates, 0, "Scene rebuild must cancel the previous timer.");
render(renderer, "out_of_shots_pending");
assert.strictEqual(renderer.layers.modal.children.length, 0, "Pending last shot is not a failure popup.");
console.log("[OK] Four failure states wait 1.5 seconds; refresh, revive, repeated failure and scene cleanup validated.");
