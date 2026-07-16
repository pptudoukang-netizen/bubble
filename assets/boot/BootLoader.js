"use strict";

var BOOT_SCENE_NAME = "boot";
var GAME_SCENE_NAME = "game";
var CORE_BUNDLE_NAME = "core";
var CORE_READY_MARKER = "__BUBBLE_CORE_CODE_LOADED__";
var CORE_DOWNLOAD_END = 0.78;
var CORE_BUNDLE_END = 0.88;
var GAME_SCENE_END = 0.99;

function requireRuntimeGlobal() {
  if (typeof GameGlobal !== "undefined" && GameGlobal) {
    return GameGlobal;
  }
  if (typeof window !== "undefined" && window) {
    return window;
  }
  if (typeof globalThis !== "undefined" && globalThis) {
    return globalThis;
  }
  throw new Error("BootLoader requires a runtime global object.");
}

function requireChild(parent, name, description) {
  if (!parent || typeof parent.getChildByName !== "function") {
    throw new Error("BootLoader cannot inspect " + description + ".");
  }
  var child = parent.getChildByName(name);
  if (!child) {
    throw new Error("BootLoader missing " + description + ": " + name);
  }
  return child;
}

function requireBootProgressBar() {
  var scene = cc.director.getScene();
  if (!scene || scene.name !== BOOT_SCENE_NAME) {
    throw new Error("BootLoader expected start scene `" + BOOT_SCENE_NAME + "`.");
  }
  var canvas = requireChild(scene, "Canvas", "boot canvas");
  var loadingView = requireChild(canvas, "LoadingView", "loading view");
  var panel = requireChild(loadingView, "Panel", "loading panel");
  var track = requireChild(panel, "ProgressTrack", "loading progress track");
  var progressBar = track.getComponent(cc.ProgressBar);
  if (!progressBar) {
    throw new Error("BootLoader requires cc.ProgressBar on LoadingView/Panel/ProgressTrack.");
  }
  return progressBar;
}

function setProgress(progressBar, value) {
  var next = Number(value);
  if (!Number.isFinite(next) || next < 0 || next > 1) {
    throw new Error("BootLoader progress must be in [0, 1].");
  }
  progressBar.progress = Math.max(progressBar.progress, next);
}

function toError(errorLike, message) {
  if (errorLike instanceof Error) {
    return errorLike;
  }
  if (errorLike && typeof errorLike.message === "string" && errorLike.message.length > 0) {
    return new Error(errorLike.message);
  }
  return new Error(message);
}

function throwLoadError(errorLike, message) {
  throw toError(errorLike, message);
}

function resolveSubpackageProgress01(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("BootLoader requires an object for core subpackage progress.");
  }

  var hasWrittenBytes = event.totalBytesWritten !== undefined;
  var hasExpectedBytes = event.totalBytesExpectedToWrite !== undefined;
  if (hasWrittenBytes || hasExpectedBytes) {
    if (!hasWrittenBytes || !hasExpectedBytes) {
      throw new Error("BootLoader core subpackage byte progress fields must appear together.");
    }
    var writtenBytes = Number(event.totalBytesWritten);
    var expectedBytes = Number(event.totalBytesExpectedToWrite);
    if (!Number.isFinite(writtenBytes) || !Number.isFinite(expectedBytes) || writtenBytes < 0 || expectedBytes < 0) {
      throw new Error("BootLoader received invalid core subpackage byte progress.");
    }
    if (writtenBytes === 0 && expectedBytes === 0) {
      return 0;
    }
    if (expectedBytes <= 0 || writtenBytes > expectedBytes) {
      throw new Error("BootLoader received inconsistent core subpackage byte progress.");
    }
    return writtenBytes / expectedBytes;
  }

  var percent = Number(event.progress);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("BootLoader received invalid core subpackage percent progress: " + String(event.progress));
  }
  return percent / 100;
}

function preloadGameScene(progressBar) {
  cc.director.preloadScene(
    GAME_SCENE_NAME,
    function (completedCount, totalCount) {
      var completed = Number(completedCount);
      var total = Number(totalCount);
      if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0 || completed < 0 || completed > total) {
        throw new Error("BootLoader received invalid game scene preload progress.");
      }
      var progress = CORE_BUNDLE_END + (GAME_SCENE_END - CORE_BUNDLE_END) * (completed / total);
      setProgress(progressBar, progress);
    },
    function (error) {
      if (error) {
        throwLoadError(error, "BootLoader failed to preload game scene.");
      }
      setProgress(progressBar, 1);
      cc.director.once(cc.Director.EVENT_AFTER_DRAW, function () {
        var accepted = cc.director.loadScene(GAME_SCENE_NAME);
        if (accepted !== true) {
          throw new Error("BootLoader failed to start game scene.");
        }
      });
    }
  );
}

function loadCoreBundle(progressBar) {
  if (!cc.assetManager || typeof cc.assetManager.loadBundle !== "function") {
    throw new Error("BootLoader requires cc.assetManager.loadBundle.");
  }
  cc.assetManager.loadBundle(CORE_BUNDLE_NAME, function (error, bundle) {
    if (error) {
      throwLoadError(error, "BootLoader failed to load core bundle.");
    }
    if (!bundle || bundle.name !== CORE_BUNDLE_NAME) {
      throw new Error("BootLoader loaded an invalid core bundle.");
    }
    if (requireRuntimeGlobal()[CORE_READY_MARKER] !== true) {
      throw new Error("Core bundle finished without executing its code marker.");
    }
    setProgress(progressBar, CORE_BUNDLE_END);
    preloadGameScene(progressBar);
  });
}

function loadCoreSubpackage(progressBar) {
  var isWechatGame = cc.sys && cc.sys.platform === cc.sys.WECHAT_GAME;
  if (!isWechatGame) {
    setProgress(progressBar, CORE_DOWNLOAD_END);
    loadCoreBundle(progressBar);
    return;
  }
  if (typeof wx === "undefined" || !wx || typeof wx.loadSubpackage !== "function") {
    throw new Error("BootLoader requires wx.loadSubpackage in WeChat Game runtime.");
  }

  var loadTask = wx.loadSubpackage({
    name: CORE_BUNDLE_NAME,
    success: function () {
      setProgress(progressBar, CORE_DOWNLOAD_END);
      loadCoreBundle(progressBar);
    },
    fail: function (error) {
      throwLoadError(error, "BootLoader failed to download core subpackage.");
    }
  });
  if (!loadTask || typeof loadTask.onProgressUpdate !== "function") {
    throw new Error("BootLoader requires WeChat subpackage progress reporting.");
  }
  loadTask.onProgressUpdate(function (event) {
    setProgress(progressBar, CORE_DOWNLOAD_END * resolveSubpackageProgress01(event));
  });
}

function startBootFlow() {
  var progressBar = requireBootProgressBar();
  progressBar.progress = 0;
  cc.director.once(cc.Director.EVENT_AFTER_DRAW, function () {
    loadCoreSubpackage(progressBar);
  });
}

if (!cc || !cc.director || !cc.Director) {
  throw new Error("BootLoader requires Cocos Creator runtime.");
}
cc.director.once(cc.Director.EVENT_AFTER_SCENE_LAUNCH, startBootFlow);
