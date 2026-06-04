"use strict";

if (typeof wx === "undefined" || !wx) {
  throw new Error("Disabled open data rank renderer requires wx.");
}

var sharedCanvas = wx.getSharedCanvas();
if (!sharedCanvas) {
  throw new Error("Disabled open data rank renderer requires sharedCanvas.");
}

sharedCanvas.width = 720;
sharedCanvas.height = 1280;

var context = sharedCanvas.getContext("2d");
if (!context) {
  throw new Error("Disabled open data rank renderer requires 2d context.");
}

context.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);

wx.onMessage(function () {
  context.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
});
