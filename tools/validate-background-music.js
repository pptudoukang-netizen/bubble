"use strict";

var fs = require("fs");
var path = require("path");

var AudioManager = require("../assets/scripts/audio/AudioManager");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function requireSourceText(source, text, description) {
  if (source.indexOf(text) < 0) {
    throw new Error(description + " missing source contract: " + text);
  }
}

function createDeferred() {
  var resolve;
  var reject;
  var promise = new Promise(function (resolvePromise, rejectPromise) {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise: promise,
    resolve: resolve,
    reject: reject
  };
}

function createAudioManagerFixture(loads) {
  var manager = Object.create(AudioManager.prototype);
  manager.settings = {
    musicEnabled: true,
    musicVolume: 0.6
  };
  manager.currentBgmPath = "";
  manager.currentBgmLoop = true;
  manager.activeBgmPath = "";
  manager._bgmRequestId = 0;
  manager._pendingBgmPath = "";
  manager._pendingBgmLoop = true;
  manager._pendingBgmPromise = null;
  manager._webAudioGestureUnlocked = false;
  manager._loadClip = function (resourcePath) {
    if (!loads[resourcePath]) {
      throw new Error("Unexpected BGM load path: " + resourcePath);
    }
    return loads[resourcePath].promise;
  };
  manager._tryUnlockWebAudio = function () {};
  return manager;
}

function runStartupBgmPreloadCase() {
  var requestedPaths = null;
  var levelClip = { name: "level_clip" };
  var gameplayClip = { name: "gameplay_clip" };
  var timedGameplayClip = { name: "timed_gameplay_clip" };
  return GameBootstrapAudioMethods._preloadStartupAudio.call({
    audioManager: {
      preloadPaths: function (paths) {
        requestedPaths = paths.slice();
        return Promise.resolve([levelClip, gameplayClip, timedGameplayClip]);
      }
    },
    _getLevelSelectBgmPath: function () {
      return "sound/level_bg";
    },
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _getTimedLevelGameplayBgmPath: function () {
      return "sound/game_bg_timed_level";
    }
  }).then(function (clips) {
    if (!requestedPaths || requestedPaths.join(",") !== "sound/level_bg,sound/game_bg1,sound/game_bg_timed_level") {
      throw new Error("Startup must preload level-select, gameplay, and timed-level BGM paths.");
    }
    if (clips[0] !== levelClip || clips[1] !== gameplayClip || clips[2] !== timedGameplayClip) {
      throw new Error("Startup BGM preload must preserve every loaded clip.");
    }
  });
}

function runGameplayBgmSelectionCase() {
  var fixture = {
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    },
    _getTimedLevelGameplayBgmPath: function () {
      return "sound/game_bg_timed_level";
    }
  };
  var normalPath = GameBootstrapAudioMethods._getGameplayBgmPathForLevel.call(fixture, {
    level: { playMode: "shot_limited" }
  });
  var timedPath = GameBootstrapAudioMethods._getGameplayBgmPathForLevel.call(fixture, {
    level: { playMode: "timed_infinite_shots" }
  });
  if (normalPath !== "sound/game_bg1" || timedPath !== "sound/game_bg_timed_level") {
    throw new Error("Gameplay BGM selection must map timed_infinite_shots to the timed-level BGM.");
  }
}

function runBgmTransitionOrderingCase() {
  var previousCc = global.cc;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var levelLoad = createDeferred();
  var gameplayLoad = createDeferred();
  var playedPaths = [];
  var stopCount = 0;
  var nextAudioId = 1;
  global.cc = {
    sys: {
      isBrowser: false
    },
    audioEngine: {
      stopMusic: function () {
        stopCount += 1;
      },
      playMusic: function (clip, loop) {
        if (loop !== true) {
          throw new Error("BGM transitions must keep looping enabled.");
        }
        playedPaths.push(clip.path);
        return nextAudioId++;
      },
      setMusicVolume: function (volume) {
        if (volume !== 0.6) {
          throw new Error("BGM transition must apply the configured music volume.");
        }
      }
    }
  };

  var manager = createAudioManagerFixture({
    "sound/level_bg": levelLoad,
    "sound/game_bg1": gameplayLoad
  });
  var firstLevelPromise = manager.playBgm("sound/level_bg", { loop: true });
  var duplicateLevelPromise = manager.playBgm("sound/level_bg", { loop: true });
  if (firstLevelPromise !== duplicateLevelPromise) {
    throw new Error("Concurrent requests for the same BGM must share one playback promise.");
  }
  var gameplayPromise = manager.playBgm("sound/game_bg1", { loop: true });

  levelLoad.resolve({ path: "sound/level_bg" });
  gameplayLoad.resolve({ path: "sound/game_bg1" });

  return Promise.all([firstLevelPromise, gameplayPromise]).then(function (results) {
    if (results[0] !== null) {
      throw new Error("A superseded BGM request must not become active.");
    }
    if (!results[1] || results[1].path !== "sound/game_bg1") {
      throw new Error("The newest BGM request must resolve with its clip.");
    }
    if (playedPaths.join(",") !== "sound/game_bg1" || stopCount !== 1) {
      throw new Error("Only the newest BGM request may stop and replace the active track.");
    }
    if (manager.activeBgmPath !== "sound/game_bg1") {
      throw new Error("AudioManager must record the successfully active BGM path.");
    }
  }).finally(function () {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  });
}

function runAwaitedBootstrapFlowSourceCase() {
  var startupSource = readSource("assets/scripts/bootstrap/GameBootstrapStartupMethods.js");
  var levelSelectSource = readSource("assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js");
  var routeSource = readSource("assets/scripts/bootstrap/GameBootstrapRouteEditorFlowMethods.js");
  requireSourceText(startupSource, "return host._preloadStartupAudio();", "Startup BGM preload");
  requireSourceText(levelSelectSource, "return this._playLevelSelectBackgroundMusic().then(function ()", "Level-select BGM playback");
  requireSourceText(levelSelectSource, "return this._playGameplayBackgroundMusic(levelConfig).then(function ()", "Random challenge BGM transition");
  requireSourceText(routeSource, "return this._playGameplayBackgroundMusic(levelConfig).then(function ()", "Level entry BGM transition");
}

function main() {
  runAwaitedBootstrapFlowSourceCase();
  runGameplayBgmSelectionCase();
  return runStartupBgmPreloadCase().then(function () {
    return runBgmTransitionOrderingCase();
  }).then(function () {
    console.log("Background music validation passed.");
  });
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
