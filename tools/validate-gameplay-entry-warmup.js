"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var attachLevelRendererResourceMethods = require("../gameplay-src/render/LevelRendererResourceMethods");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function requireSourceText(source, text, description) {
  assert.ok(source.indexOf(text) >= 0, description + " missing source contract: " + text);
}

function requireSourceBlock(source, startText, endText, description) {
  var startIndex = source.indexOf(startText);
  assert.ok(startIndex >= 0, description + " start marker is missing: " + startText);
  var endIndex = source.indexOf(endText, startIndex + startText.length);
  assert.ok(endIndex > startIndex, description + " end marker is missing: " + endText);
  return source.slice(startIndex, endIndex);
}

function readNumericConstant(source, constantName) {
  var match = new RegExp("var " + constantName + " = ([0-9]+(?:\\.[0-9]+)?);").exec(source);
  assert.ok(match, "Missing numeric constant: " + constantName);
  return Number(match[1]);
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

function validateWarmupSourceContracts() {
  var resourceSource = readProjectFile("gameplay-src/render/LevelRendererResourceMethods.js");
  var runtimeSource = readProjectFile("gameplay-src/render/LevelRendererRuntimeMethods.js");
  var rendererSource = readProjectFile("gameplay-src/render/LevelRenderer.js");
  var startGameSource = readProjectFile("assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js");
  var preparedWarmupBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype.warmupPreparedGameplayAssets = function (assistSpiritId)",
    "LevelRenderer.prototype.warmupSharedAssets = function (runtimeSnapshot)",
    "Prepared gameplay warmup"
  );
  var initialWarmupBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype.warmupSharedAssets = function (runtimeSnapshot)",
    "LevelRenderer.prototype._preloadInitialLevelRenderAssets = function (runtimeSnapshot)",
    "Initial render warmup"
  );
  var interactionWarmupBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype.warmupGameplayInteractionAssets = function ()",
    "LevelRenderer.prototype.preloadLightningChainEffect = function ()",
    "Gameplay interaction warmup"
  );
  var initialPrefabBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectInitialRenderPrefabPaths = function ()",
    "LevelRenderer.prototype._collectInteractionPrefabPaths = function ()",
    "Initial render prefab collection"
  );
  var interactionPrefabBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectInteractionPrefabPaths = function ()",
    "LevelRenderer.prototype._collectPrefabPaths = function ()",
    "Gameplay interaction prefab collection"
  );
  var initialSpriteBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectInitialCommonSpritePaths = function ()",
    "LevelRenderer.prototype._collectInteractionCommonSpritePaths = function ()",
    "Initial render common sprite collection"
  );
  var interactionSpriteBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectInteractionCommonSpritePaths = function ()",
    "LevelRenderer.prototype._collectInitialRenderPrefabPaths = function ()",
    "Gameplay interaction common sprite collection"
  );
  var levelSpriteBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectSpritePaths = function (levelConfig, runtimeSnapshot)",
    "LevelRenderer.prototype._collectRetainedSpritePaths = function ()",
    "Initial level sprite collection"
  );
  var levelInteractionSpriteBlock = requireSourceBlock(
    resourceSource,
    "LevelRenderer.prototype._collectInteractionSpritePaths = function ()",
    "LevelRenderer.prototype._collectCommonSpritePaths = function ()",
    "Level interaction sprite collection"
  );

  requireSourceText(runtimeSource, "this.warmupSharedAssets(runtimeSnapshot)", "Runtime render");
  requireSourceText(preparedWarmupBlock, "this._preloadAssistSpiritSkeletonData(assistSpiritId)", "Current assist spirit warmup");
  requireSourceText(preparedWarmupBlock, "this.prefabFactory.preload(", "Initial prefab warmup");
  requireSourceText(preparedWarmupBlock, "this._collectInitialRenderPrefabPaths()", "Initial prefab collection");
  requireSourceText(preparedWarmupBlock, "this._preloadSprites(this._collectInitialCommonSpritePaths())", "Initial common sprite warmup");
  requireSourceText(preparedWarmupBlock, "this.bubbleShatterRenderer.preload()", "Initial bubble shatter effect warmup");
  requireSourceText(initialSpriteBlock, "BALL_RESOURCES.BUBBLE_SHIELD", "Initial bubble shield shatter SpriteFrame warmup");
  assert.strictEqual(
    interactionSpriteBlock.indexOf("BALL_RESOURCES.BUBBLE_SHIELD"),
    -1,
    "Bubble shield shatter SpriteFrame must not wait for interaction warmup."
  );
  requireSourceText(initialWarmupBlock, "this.warmupPreparedGameplayAssets(assistSpiritId)", "Prepared gameplay warmup reuse");
  requireSourceText(initialWarmupBlock, "this._preloadInitialLevelRenderAssets(runtimeSnapshot)", "Current level render warmup");
  requireSourceText(resourceSource, "if (hasTimeBonus) {", "Time bonus font warmup gate");
  requireSourceText(resourceSource, "tasks.push(this._preloadTimeBonusBitmapFont())", "Time bonus font warmup");
  requireSourceText(resourceSource, "if (hasWormhole) {", "Wormhole shader warmup gate");
  requireSourceText(resourceSource, "tasks.push(this.wormholeShaderRenderer.preload())", "Wormhole shader warmup");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadFairySkeletonData"), -1, "Initial render must not wait for fairy Spine data.");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadExplodeAnimationClip"), -1, "Initial render must not wait for explode animation.");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadFireworksPrefab"), -1, "Initial render must not wait for fireworks prefab.");
  assert.strictEqual(initialWarmupBlock.indexOf("bubbleShatterRenderer.preload"), -1, "Level-specific warmup must reuse the prepared bubble shatter preload.");

  [
    "this._preloadFairySkeletonData()",
    "this._preloadExplodeAnimationClip()",
    "this._preloadFireworksPrefab()",
    "this.prefabFactory.preload(this._collectInteractionPrefabPaths())",
    "this._preloadSprites(this._collectInteractionSpritePaths())"
  ].forEach(function (contract) {
    requireSourceText(interactionWarmupBlock, contract, "Gameplay interaction warmup");
  });
  assert.strictEqual(
    interactionWarmupBlock.indexOf("bubbleShatterRenderer.preload"),
    -1,
    "Interaction warmup must not own the initial bubble shatter effect."
  );

  requireSourceText(levelSpriteBlock, "this._collectInitialCommonSpritePaths().slice()", "Initial level sprite collection");
  requireSourceText(levelSpriteBlock, "AssistSpiritSkillConfig.getBySpiritId(runtimeSnapshot.shooter.assistSpiritId)", "Equipped assist spirit skill icon collection");
  requireSourceText(levelInteractionSpriteBlock, "buildSpiritFragmentRewardResourcePath", "Rescue reward interaction sprite collection");
  requireSourceText(levelInteractionSpriteBlock, "buildRescueSuccessfulSpiritResourcePath", "Rescue popup interaction sprite collection");
  [
    "GUIDE_DOT_SPRITE_PATH",
    "BALL_RESOURCES.BLOCKADE_LINE",
    "BALL_RESOURCES.LIGHT",
    "LOSE_STATUS_RESOURCES.complete",
    "COMMENT_ANIMATION_RESOURCES.good"
  ].forEach(function (contract) {
    assert.strictEqual(initialSpriteBlock.indexOf(contract), -1, "Initial render must not preload interaction sprite: " + contract);
    requireSourceText(interactionSpriteBlock, contract, "Gameplay interaction sprite collection");
  });
  assert.strictEqual(levelSpriteBlock.indexOf("buildSpiritFragmentRewardResourcePath"), -1, "Initial render must not preload rescue reward sprite.");
  assert.strictEqual(levelSpriteBlock.indexOf("buildRescueSuccessfulSpiritResourcePath"), -1, "Initial render must not preload rescue popup sprite.");
  requireSourceText(interactionSpriteBlock, "LightningChainRenderer.RESOURCE_PATHS", "Lightning interaction sprite collection");
  requireSourceText(interactionSpriteBlock, "AssistSpiritSkillConfig.getAllSpritePaths()", "Assist skill interaction sprite collection");
  requireSourceText(interactionSpriteBlock, "PropDescriptionConfig.getAllIconPaths()", "Prop description interaction sprite collection");

  [
    "PREFAB_PATHS.gameView",
    "PREFAB_PATHS.shooterPanel",
    "PREFAB_PATHS.bubbleItem",
    "PREFAB_PATHS.jarItem"
  ].forEach(function (contract) {
    requireSourceText(initialPrefabBlock, contract, "Initial render prefab collection");
  });
  [
    "PREFAB_PATHS.winView",
    "PREFAB_PATHS.rescueSuccessfulView",
    "PREFAB_PATHS.loseView",
    "PREFAB_PATHS.addBallTipsView",
    "PREFAB_PATHS.pauseView",
    "PREFAB_PATHS.propDescriptionView"
  ].forEach(function (contract) {
    assert.strictEqual(initialPrefabBlock.indexOf(contract), -1, "Initial render must not preload interaction prefab: " + contract);
    requireSourceText(interactionPrefabBlock, contract, "Gameplay interaction prefab collection");
  });

  requireSourceText(resourceSource, "AssistSpiritPresentationConfig.getBySpiritId(spiritId)", "Assist spirit clip warmup");
  assert.strictEqual(
    requireSourceBlock(
      resourceSource,
      "LevelRenderer.prototype._preloadAssistSpiritSkeletonData = function (spiritId)",
      "LevelRenderer.prototype._preloadFireworksPrefab = function ()",
      "Assist spirit clip warmup"
    ).indexOf("getAllClipPaths"),
    -1,
    "Gameplay entry must preload only the equipped assist spirit clips."
  );
  requireSourceText(rendererSource, "this._interactionWarmupPromise = null", "LevelRenderer interaction warmup state");
  requireSourceText(resourceSource, "this._interactionWarmupPromise = null", "Gameplay bundle release warmup reset");

  requireSourceText(startGameSource, "function waitForStartGameRenderedFrame()", "StartGameView rendered-frame warmup");
  requireSourceText(startGameSource, "this._cancelGameplayBundleIdleRelease();", "StartGameView gameplay release cancellation");
  requireSourceText(startGameSource, "var gameplayKernelWarmupPromise = waitForStartGameRenderedFrame()", "StartGameView gameplay kernel warmup start");
  requireSourceText(startGameSource, "return this._ensureGameplayKernel();", "StartGameView gameplay kernel warmup");
  requireSourceText(startGameSource, "this.levelRenderer.warmupPreparedGameplayAssets(this.assistSpiritState.equippedSpiritId)", "StartGameView initial gameplay asset warmup");
  requireSourceText(startGameSource, "Promise.all([presentationPromise, gameplayKernelWarmupPromise])", "StartGameView non-blocking presentation and gameplay warmup");
  requireSourceText(startGameSource, "this._scheduleGameplayBundleIdleRelease();", "StartGameView close gameplay release scheduling");
}

function validateCountdownOverlap() {
  var audioDeferred = createDeferred();
  var countdownDeferred = createDeferred();
  var warmupDeferred = createDeferred();
  var countdownCalls = 0;
  var warmupCalls = 0;
  var settled = false;
  var host = {
    _windTunnelAmbientRequested: false,
    gameManager: {
      getRuntimeSnapshot: function () {
        return {
          board: {
            specialEntities: []
          }
        };
      }
    },
    audioManager: {
      playSfx: function (key) {
        assert.strictEqual(key, "gameEntryCountdown");
        return audioDeferred.promise;
      },
      stopExclusiveSfx: function (channelName) {
        assert.strictEqual(channelName, "windTunnelAmbient", "Entry reset must target the wind tunnel ambient channel.");
        return false;
      }
    },
    levelRenderer: {
      playGameEntryCountdown: function () {
        countdownCalls += 1;
        return countdownDeferred.promise;
      },
      warmupGameplayInteractionAssets: function () {
        warmupCalls += 1;
        return warmupDeferred.promise;
      },
      hasPendingSpiderEntrance: function () {
        return false;
      }
    },
    _playSfx: function (soundId) {
      assert.strictEqual(soundId, "gameEntryCountdown", "Entry countdown must keep its existing SFX contract.");
    }
  };
  host._stopWindTunnelAmbientSfx = function () {
    return GameBootstrapAudioMethods._stopWindTunnelAmbientSfx.call(host);
  };
  host._startWindTunnelAmbientSfx = function (runtimeSnapshot) {
    return GameBootstrapAudioMethods._startWindTunnelAmbientSfx.call(host, runtimeSnapshot);
  };

  var readinessPromise = GameBootstrapAudioMethods._runGameEntryCountdown.call(host).then(function () {
    settled = true;
  });
  assert.strictEqual(countdownCalls, 0, "Visuals must wait while countdown audio is loading.");
  assert.strictEqual(warmupCalls, 1, "Interaction warmup must overlap audio loading.");
  audioDeferred.resolve(7);
  return Promise.resolve().then(function () {
    assert.strictEqual(countdownCalls, 1, "Countdown must start exactly once after audio starts.");
    countdownDeferred.resolve();
    return Promise.resolve();
  }).then(function () {
    assert.strictEqual(settled, false, "Entry must still wait for interaction assets.");
    warmupDeferred.resolve();
    return readinessPromise;
  }).then(function () {
    assert.strictEqual(settled, true);
    host.audioManager.playSfx = function () { return Promise.resolve(null); };
    host.audioManager.snapshot = function () { return { settings: { sfxEnabled: false } }; };
    return GameBootstrapAudioMethods._runGameEntryCountdown.call(host);
  }).then(function () {
    assert.strictEqual(countdownCalls, 2, "Explicit mute must still display countdown.");
    host.audioManager.snapshot = function () { return { settings: { sfxEnabled: true } }; };
    return assert.rejects(GameBootstrapAudioMethods._runGameEntryCountdown.call(host), /audio failed to start/);
  }).then(function () {
    assert.strictEqual(countdownCalls, 2, "Failed audio must not start an unsynchronized countdown.");
  });
}

function validateCountdownDurationContract() {
  var scaffoldSource = readProjectFile("gameplay-src/render/LevelRendererSceneScaffoldMethods.js");
  var countdownBlock = requireSourceBlock(
    scaffoldSource,
    "LevelRenderer.prototype.playGameEntryCountdown = function ()",
    "LevelRenderer.prototype.syncBoardLayoutHudBottomLineAsync = function ()",
    "Game entry countdown"
  );
  var totalDuration = readNumericConstant(scaffoldSource, "GAME_ENTRY_COUNTDOWN_TOTAL_DURATION");
  var times = ["THREE", "TWO", "ONE", "GO"].map(function (name) {
    return readNumericConstant(scaffoldSource, "GAME_ENTRY_" + name + "_TIME");
  });
  assert.deepStrictEqual(times, [0.03, 0.52, 1.01, 1.47], "Visual cues must match the current time.mp3 onsets.");
  assert.strictEqual(totalDuration, 3);
  var scaleDuration = readNumericConstant(scaffoldSource, "GAME_ENTRY_GO_SCALE_DURATION");
  assert(totalDuration - times[3] - scaleDuration > 0);
  [
    "cc.delayTime(GAME_ENTRY_THREE_TIME)",
    "cc.delayTime(GAME_ENTRY_TWO_TIME - GAME_ENTRY_THREE_TIME)",
    "cc.delayTime(GAME_ENTRY_ONE_TIME - GAME_ENTRY_TWO_TIME)",
    "cc.delayTime(GAME_ENTRY_GO_TIME - GAME_ENTRY_ONE_TIME)",
    "cc.delayTime(GAME_ENTRY_GO_HOLD_DURATION)"
  ].forEach(function (text) { requireSourceText(countdownBlock, text, "Audio cue schedule"); });
  requireSourceText(scaffoldSource,
    "GAME_ENTRY_COUNTDOWN_TOTAL_DURATION - GAME_ENTRY_GO_TIME - GAME_ENTRY_GO_SCALE_DURATION",
    "GO must fill the remaining three-second presentation budget");
}

function validateConditionalInitialResources() {
  function LevelRendererFixture() {}
  attachLevelRendererResourceMethods(LevelRendererFixture, {});
  var fontLoads = 0;
  var wormholeShaderLoads = 0;
  var renderer = Object.create(LevelRendererFixture.prototype);
  renderer._preloadTimeBonusBitmapFont = function () {
    fontLoads += 1;
    return Promise.resolve();
  };
  renderer.wormholeShaderRenderer = {
    preload: function () {
      wormholeShaderLoads += 1;
      return Promise.resolve();
    }
  };

  return renderer._preloadInitialLevelRenderAssets({
    board: {
      cells: [{ timeBonusSeconds: null }],
      specialEntities: []
    }
  }).then(function () {
    assert.strictEqual(fontLoads, 0, "Normal levels must not preload the time bonus font.");
    assert.strictEqual(wormholeShaderLoads, 0, "Levels without wormholes must not preload the wormhole shader.");
    return renderer._preloadInitialLevelRenderAssets({
      board: {
        cells: [{ timeBonusSeconds: 5 }],
        specialEntities: [{ entityCategory: "reactive_ball", entityType: "wormhole" }]
      }
    });
  }).then(function () {
    assert.strictEqual(fontLoads, 1, "Time bonus levels must preload their bitmap font exactly once per request.");
    assert.strictEqual(wormholeShaderLoads, 1, "Wormhole levels must preload their shader exactly once per request.");
    assert.throws(function () {
      renderer._preloadInitialLevelRenderAssets({ board: { cells: [], specialEntities: [null] } });
    }, /requires special entity at index 0/, "Invalid special entities must fail fast during entry warmup.");
  });
}

function validatePreparedBubbleShatterWarmup() {
  function LevelRendererFixture() {}
  attachLevelRendererResourceMethods(LevelRendererFixture, {
    AssistSpiritPresentationConfig: {
      getBySpiritId: function (spiritId) {
        assert.strictEqual(spiritId, "milu", "Prepared warmup must validate the equipped assist spirit.");
        return { id: spiritId };
      }
    },
    HUD_STAR_RESOURCES: { lit: "hud_star_lit", unlit: "hud_star_unlit" },
    TOP_SLOT_STAR_RESOURCE: "top_slot_star",
    POWERUP_ICON_RESOURCES: {
      rainbow: "powerup_rainbow",
      swap: "powerup_swap",
      blast: "powerup_blast",
      crystal_gun: "powerup_crystal_gun",
      rainbow_prism_ball: "powerup_rainbow_prism_ball",
      barrier_hammer: "powerup_barrier_hammer",
      precise_aim: "powerup_precise_aim",
      snow_removal: "powerup_snow_removal",
      three_line_elimination: "powerup_three_line_elimination",
      plus_three_balls: "powerup_plus_three_balls"
    },
    BALL_RESOURCES: {
      BUBBLE_SHIELD: "game/image/ball/transparent_bubbles"
    }
  });
  var shatterDeferred = createDeferred();
  var shatterPreloadCalls = 0;
  var settled = false;
  var renderer = Object.create(LevelRendererFixture.prototype);
  renderer._sharedWarmupPromise = null;
  renderer.prefabFactory = {
    preload: function () {
      return Promise.resolve();
    }
  };
  renderer._collectInitialRenderPrefabPaths = function () {
    return [];
  };
  renderer._preloadSprites = function (paths) {
    assert.ok(
      paths.indexOf("game/image/ball/transparent_bubbles") >= 0,
      "Prepared warmup must preload the bubble shield shatter SpriteFrame."
    );
    return Promise.resolve();
  };
  renderer._preloadAssistSpiritSkeletonData = function () {
    return Promise.resolve();
  };
  renderer.bubbleShatterRenderer = {
    preload: function () {
      shatterPreloadCalls += 1;
      return shatterDeferred.promise;
    }
  };

  var firstWarmup = renderer.warmupPreparedGameplayAssets("milu").then(function () {
    settled = true;
  });
  var secondWarmup = renderer.warmupPreparedGameplayAssets("milu");
  assert.strictEqual(shatterPreloadCalls, 1, "Prepared warmup must share one bubble shatter preload promise.");
  return Promise.resolve().then(function () {
    assert.strictEqual(settled, false, "Prepared warmup must wait for the bubble shatter effect.");
    shatterDeferred.resolve({ isValid: true });
    return Promise.all([firstWarmup, secondWarmup]);
  }).then(function () {
    assert.strictEqual(settled, true, "Prepared warmup must complete after the bubble shatter effect loads.");
  });
}

validateWarmupSourceContracts();
validateCountdownDurationContract();
Promise.all([
  validateCountdownOverlap(),
  validateConditionalInitialResources(),
  validatePreparedBubbleShatterWarmup()
]).then(function () {
  console.log("Gameplay entry warmup validation passed.");
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
