"use strict";

require('adapter-min.js');
__globalAdapter.init();
// [wechat-gameplay-code-bundle]
if (typeof GameGlobal !== "undefined" && GameGlobal) {
  GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PREPARED__ = true;
}
function loadGame() {
requirePlugin('cocos');
__globalAdapter.adaptEngine();
require('./ccRequire');
require('./src/settings');
// Introduce Cocos Service here
require('./main'); // TODO: move to common

// Adjust devicePixelRatio
cc.view._maxPixelRatio = 4;
if (cc.sys.platform !== cc.sys.WECHAT_GAME_SUB) {
  // Release Image objects after uploaded gl texture
  cc.macro.CLEANUP_IMAGE_CACHE = true;
}
window.boot();
}

// [wechat-minigame-loading-patch]
function compareVersion(v1, v2) {
  v1 = v1.split(".");
  v2 = v2.split(".");
  var len = Math.max(v1.length, v2.length);
  while (v1.length < len) {
    v1.push("0");
  }
  while (v2.length < len) {
    v2.push("0");
  }
  for (var i = 0; i < len; i++) {
    var num1 = parseInt(v1[i], 10);
    var num2 = parseInt(v2[i], 10);
    if (num1 > num2) {
      return 1;
    }
    if (num1 < num2) {
      return -1;
    }
  }
  return 0;
}

function requireGameGlobalFunction(functionName) {
  var targetFunction = GameGlobal[functionName];
  if (typeof targetFunction !== "function") {
    throw new Error("GameGlobal." + functionName + " is required by MinigameLoading customEnv.");
  }
  return targetFunction.bind(GameGlobal);
}

if (compareVersion(wx.getSystemInfoSync().SDKVersion, "2.1.0") > -1) {
  GameGlobal.LoadingManager = requirePlugin("MinigameLoading", {
    customEnv: {
      wx: wx,
      canvas: GameGlobal.canvas,
      setTimeout: requireGameGlobalFunction("setTimeout"),
      clearTimeout: requireGameGlobalFunction("clearTimeout"),
      setInterval: requireGameGlobalFunction("setInterval"),
      clearInterval: requireGameGlobalFunction("clearInterval"),
      requestAnimationFrame: requireGameGlobalFunction("requestAnimationFrame"),
      cancelAnimationFrame: requireGameGlobalFunction("cancelAnimationFrame")
    }
  }).default;
  GameGlobal.LoadingManager.create({
    images: [{
      src: "images/loading_bg.jpg"
    }],
    designWidth: 720,
    designHeight: 1280,
    contextType: "webgl",
    scaleMode: GameGlobal.LoadingManager.ScaleMode.NO_BORDER,
    contextAttributes: {
      alpha: false,
      antialias: false,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: true,
      xrCompatible: false
    }
  }).then(function () {
    console.log("MinigameLoading cover displayed.");
  });
  loadGame();
} else {
  loadGame();
}
