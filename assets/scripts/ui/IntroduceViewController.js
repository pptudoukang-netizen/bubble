"use strict";

var BundleLoader = require("../utils/BundleLoader");

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requireFunction(value, description) {
  if (typeof value !== "function") {
    throw new Error(description + " must be a function.");
  }
  return value;
}

function requireValidNode(node, description) {
  if (!node || !node.isValid) {
    throw new Error("IntroduceView requires " + description + ".");
  }
  return node;
}

function requireChildNode(parentNode, childName, parentDescription) {
  requireValidNode(parentNode, parentDescription);
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error("IntroduceView requires " + parentDescription + "/" + childName + ".");
  }
  return childNode;
}

function requireLabel(node, description) {
  requireValidNode(node, description);
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error("IntroduceView requires " + description + " cc.Label.");
  }
  return label;
}

function requireSprite(node, description) {
  requireValidNode(node, description);
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("IntroduceView requires " + description + " cc.Sprite.");
  }
  return sprite;
}

function bindTapOnce(node, key, onTap) {
  requireValidNode(node, "tap node");
  requireFunction(onTap, "IntroduceView tap callback");
  node[key + "Handler"] = onTap;
  if (node[key] === true) {
    return;
  }
  node[key] = true;
  node.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    var handler = node[key + "Handler"];
    if (typeof handler !== "function") {
      throw new Error("IntroduceView tap handler missing for node: " + node.name);
    }
    handler();
  });
}

function loadSpriteFrame(path) {
  if (typeof path !== "string" || path.length === 0) {
    return Promise.reject(new Error("IntroduceView sprite path must be a non-empty string."));
  }
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.SpriteFrame, function (error, spriteFrame) {
      if (error) {
        reject(new Error("Load IntroduceView sprite failed: " + path + ", " + String(error)));
        return;
      }
      if (!spriteFrame) {
        reject(new Error("IntroduceView sprite frame is empty: " + path));
        return;
      }
      resolve(spriteFrame);
    });
  });
}

function getSpriteFrameSize(spriteFrame, description) {
  if (!spriteFrame) {
    throw new Error(description + " spriteFrame is required.");
  }
  if (typeof spriteFrame.getRect === "function") {
    var rect = spriteFrame.getRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return {
        width: rect.width,
        height: rect.height
      };
    }
  }
  if (spriteFrame._rect && spriteFrame._rect.width > 0 && spriteFrame._rect.height > 0) {
    return {
      width: spriteFrame._rect.width,
      height: spriteFrame._rect.height
    };
  }
  throw new Error(description + " spriteFrame size is invalid.");
}

function fitNodeToMaxSize(node, spriteFrame, maxWidth, maxHeight, description) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(maxHeight) || maxHeight <= 0) {
    throw new Error(description + " target size is invalid.");
  }
  var sourceSize = getSpriteFrameSize(spriteFrame, description);
  var scale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(description + " scale is invalid.");
  }
  node.setContentSize(sourceSize.width * scale, sourceSize.height * scale);
}

function setLabelText(node, text, description) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("IntroduceView " + description + " text must be a non-empty string.");
  }
  requireLabel(node, description).string = text;
}

function IntroduceViewController(options) {
  requireObject(options, "IntroduceViewController options");
  this.node = requireValidNode(options.node, "root node");
  this.onClose = requireFunction(options.onClose, "IntroduceViewController onClose");
  this._nodes = this._resolveNodes();
  this._iconSpriteFrames = {};
  this._iconLoadPromises = {};
  this._propMaxSize = {
    width: this._nodes.propNode.width,
    height: this._nodes.propNode.height
  };
  if (this._propMaxSize.width <= 0 || this._propMaxSize.height <= 0) {
    throw new Error("IntroduceView prop node size is invalid.");
  }
  this._bindActions();
}

IntroduceViewController.prototype._resolveNodes = function () {
  var panelNode = requireChildNode(this.node, "Panel", "IntroduceView");
  return {
    panelNode: panelNode,
    closeButton: requireChildNode(panelNode, "btn_close", "IntroduceView/Panel"),
    titleNode: requireChildNode(panelNode, "title", "IntroduceView/Panel"),
    tipsValueNode: requireChildNode(panelNode, "tips_value", "IntroduceView/Panel"),
    propEffectNode: requireChildNode(panelNode, "prop_effect", "IntroduceView/Panel"),
    propIntroduceNode: requireChildNode(panelNode, "prop_introduce", "IntroduceView/Panel"),
    propNode: requireChildNode(panelNode, "prop", "IntroduceView/Panel")
  };
};

IntroduceViewController.prototype._bindActions = function () {
  bindTapOnce(this._nodes.closeButton, "__introduceCloseTapBound", function () {
    this.onClose();
  }.bind(this));
};

IntroduceViewController.prototype._ensureIconSpriteFrame = function (iconPath) {
  if (this._iconSpriteFrames[iconPath]) {
    return Promise.resolve(this._iconSpriteFrames[iconPath]);
  }
  if (this._iconLoadPromises[iconPath]) {
    return this._iconLoadPromises[iconPath];
  }
  this._iconLoadPromises[iconPath] = loadSpriteFrame(iconPath).then(function (spriteFrame) {
    this._iconSpriteFrames[iconPath] = spriteFrame;
    this._iconLoadPromises[iconPath] = null;
    return spriteFrame;
  }.bind(this)).catch(function (error) {
    this._iconLoadPromises[iconPath] = null;
    throw error;
  }.bind(this));
  return this._iconLoadPromises[iconPath];
};

IntroduceViewController.prototype.render = function (definition) {
  requireObject(definition, "IntroduceView render definition");
  if (typeof definition.iconPath !== "string" || definition.iconPath.length === 0) {
    throw new Error("IntroduceView definition.iconPath must be a non-empty string.");
  }
  setLabelText(this._nodes.titleNode, definition.title, "title");
  setLabelText(this._nodes.tipsValueNode, definition.summary, "tips_value");
  setLabelText(this._nodes.propEffectNode, definition.effectTitle, "prop_effect");
  setLabelText(this._nodes.propIntroduceNode, definition.effectDescription, "prop_introduce");

  return this._ensureIconSpriteFrame(definition.iconPath).then(function (spriteFrame) {
    var propSprite = requireSprite(this._nodes.propNode, "prop");
    propSprite.spriteFrame = spriteFrame;
    propSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    fitNodeToMaxSize(
      this._nodes.propNode,
      spriteFrame,
      this._propMaxSize.width,
      this._propMaxSize.height,
      "IntroduceView prop"
    );
    return true;
  }.bind(this));
};

module.exports = IntroduceViewController;
