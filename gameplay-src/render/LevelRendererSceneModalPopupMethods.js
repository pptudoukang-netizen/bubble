"use strict";

function attachLevelRendererSceneModalPopupMethods(LevelRenderer, context) {
  var PAUSE_VIEW_PROXY_ROOT_NAME = context.PAUSE_VIEW_PROXY_ROOT_NAME;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var PropDescriptionViewController = context.PropDescriptionViewController;
  var SpriteProxyLayerHelper = context.SpriteProxyLayerHelper;
  var attachLevelRendererSceneModalPopupMethods = context.attachLevelRendererSceneModalPopupMethods;
  var requireChildNode = context.requireChildNode;

LevelRenderer.prototype._bindLoseButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__loseBoundAction === action) {
    return;
  }

  buttonNode.__loseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeLoseAction(action);
  }, this);
};

LevelRenderer.prototype._bindAddBallTipsButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("AddBallTipsView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("AddBallTipsView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__addBallTipsBoundAction === action) {
    return;
  }
  if (buttonNode.__addBallTipsBoundAction) {
    throw new Error("AddBallTipsView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__addBallTipsBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeAddBallTipsAction(action);
  }, this);
};

LevelRenderer.prototype._bindPauseButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("PauseView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("PauseView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__pauseBoundAction === action) {
    return;
  }
  if (buttonNode.__pauseBoundAction) {
    throw new Error("PauseView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__pauseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokePauseAction(action);
  }, this);
};

LevelRenderer.prototype.showPauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView requires the gameplay modal layer.");
  }
  var existing = this.layers.modal.getChildByName("PauseView");
  if (existing && existing.active) {
    throw new Error("PauseView is already active.");
  }

  var pauseView = existing || this._instantiateOrCreate(PREFAB_PATHS.pauseView, this.layers.modal, "PauseView");
  if (!pauseView || !pauseView.isValid) {
    throw new Error("PauseView prefab could not be instantiated.");
  }
  pauseView.active = true;
  pauseView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(pauseView, PAUSE_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(pauseView, 164);
  var pauseContent = this._ensurePopupContentContainer(pauseView);
  var panel = requireChildNode(pauseContent, "Panel", "PauseView content");

  this._bindPauseButton(requireChildNode(panel, "btn_close", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "continue", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "rechage", "PauseView/Panel"), "retry");
  this._bindPauseButton(requireChildNode(panel, "back", "PauseView/Panel"), "exit");
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: pauseView,
    proxyRootName: PAUSE_VIEW_PROXY_ROOT_NAME
  });
  this._playPopupContentOpenAnimation(pauseContent);
};

LevelRenderer.prototype.hidePauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView hide requires the gameplay modal layer.");
  }
  var pauseView = this.layers.modal.getChildByName("PauseView");
  if (!pauseView || !pauseView.isValid || !pauseView.active) {
    throw new Error("Cannot hide an inactive PauseView.");
  }
  pauseView.active = false;
};

LevelRenderer.prototype.showPropDescriptionView = function (levelConfig) {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView requires the gameplay modal layer.");
  }
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("PropDescriptionView requires current levelConfig.");
  }
  var existing = this.layers.modal.getChildByName("PropDescriptionView");
  if (existing && existing.isValid && existing.active) {
    throw new Error("PropDescriptionView is already active.");
  }
  if (existing && existing.isValid) {
    existing.removeFromParent(false);
    existing.destroy();
    this.propDescriptionViewController = null;
  }

  var viewNode = this._instantiateOrCreate(
    PREFAB_PATHS.propDescriptionView,
    this.layers.modal,
    "PropDescriptionView"
  );
  if (!viewNode || !viewNode.isValid) {
    throw new Error("PropDescriptionView prefab could not be instantiated.");
  }
  viewNode.active = true;
  viewNode.setPosition(0, 0);
  this._ensurePopupMaskVisible(viewNode, 164);
  var popupContent = this._ensurePopupContentContainer(viewNode);
  requireChildNode(popupContent, "Panel", "PropDescriptionView content");

  if (
    !this.propDescriptionViewController ||
    this.propDescriptionViewController.node !== viewNode ||
    !this.propDescriptionViewController.node.isValid
  ) {
    this.propDescriptionViewController = new PropDescriptionViewController({
      node: viewNode,
      onClose: function () {
        this._invokeGameplayAction("close_prop_description");
      }.bind(this)
    });
  }
  try {
    this.propDescriptionViewController.render({
      levelConfig: levelConfig,
      spriteFrameCache: this.spriteFrameCache
    });
  } catch (error) {
    viewNode.removeFromParent(false);
    viewNode.destroy();
    this.propDescriptionViewController = null;
    throw error;
  }
  this._playPopupContentOpenAnimation(popupContent);
};

LevelRenderer.prototype.hidePropDescriptionView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView hide requires the gameplay modal layer.");
  }
  var viewNode = this.layers.modal.getChildByName("PropDescriptionView");
  if (!viewNode || !viewNode.isValid || !viewNode.active) {
    throw new Error("Cannot hide an inactive PropDescriptionView.");
  }
  viewNode.removeFromParent(false);
  viewNode.destroy();
  this.propDescriptionViewController = null;
};
}

module.exports = attachLevelRendererSceneModalPopupMethods;
