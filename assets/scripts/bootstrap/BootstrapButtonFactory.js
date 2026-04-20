"use strict";

function bindPressEvents(buttonNode, onTap) {
  buttonNode.addComponent(cc.BlockInputEvents);
  buttonNode.on(cc.Node.EventType.TOUCH_START, function (event) {
    event.stopPropagation();
    buttonNode.scale = 0.97;
  });
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    event.stopPropagation();
    buttonNode.scale = 1;
    if (typeof onTap === "function") {
      onTap();
    }
  });
  buttonNode.on(cc.Node.EventType.TOUCH_CANCEL, function (event) {
    event.stopPropagation();
    buttonNode.scale = 1;
  });
}

function createActionButton(options) {
  options = options || {};
  var width = Math.max(120, Number(options.width) || 180);
  var height = Math.max(48, Number(options.height) || 58);
  var buttonNode = new cc.Node(options.name || "ActionButton");
  buttonNode.parent = options.parentNode || null;
  buttonNode.zIndex = Number(options.zIndex) || 125;
  buttonNode.setContentSize(width, height);

  var widget = buttonNode.addComponent(cc.Widget);
  widget.isAlignBottom = true;
  widget.bottom = Number(options.bottom) || 0;
  if (options.alignRight) {
    widget.isAlignRight = true;
    widget.right = Number(options.right) || 0;
  } else {
    widget.isAlignLeft = true;
    widget.left = Number(options.left) || 0;
  }

  var background = buttonNode.addComponent(cc.Graphics);
  background.clear();
  background.fillColor = options.fillColor || cc.color(74, 123, 185, 220);
  background.roundRect(-(width * 0.5), -(height * 0.5), width, height, 12);
  background.fill();

  var labelNode = new cc.Node("Label");
  labelNode.parent = buttonNode;
  labelNode.setPosition(0, 0);
  var label = labelNode.addComponent(cc.Label);
  label.string = options.labelText || "";
  label.fontSize = Math.max(12, Number(options.fontSize) || 24);
  label.lineHeight = Math.max(label.fontSize + 2, Number(options.lineHeight) || 28);
  label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  labelNode.color = cc.color(255, 255, 255);

  var outline = labelNode.addComponent(cc.LabelOutline);
  outline.color = options.outlineColor || cc.color(31, 62, 98);
  outline.width = Math.max(1, Number(options.outlineWidth) || 2);

  bindPressEvents(buttonNode, options.onTap);

  return {
    node: buttonNode,
    label: label
  };
}

function createDropTestButton(options) {
  return createActionButton({
    name: "DropTestButton",
    parentNode: options && options.parentNode,
    zIndex: 120,
    width: 240,
    height: 72,
    bottom: 24,
    right: 24,
    alignRight: true,
    fillColor: cc.color(72, 117, 164, 220),
    outlineColor: cc.color(31, 62, 98),
    labelText: "底层掉落测试",
    fontSize: 28,
    lineHeight: 32,
    onTap: options && options.onTap
  });
}

module.exports = {
  createActionButton: createActionButton,
  createDropTestButton: createDropTestButton
};
