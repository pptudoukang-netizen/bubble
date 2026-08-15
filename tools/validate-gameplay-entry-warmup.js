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
  requireSourceText(preparedWarmupBlock, "this._preloadAssistSpiritAnimationClips(assistSpiritId)", "Current assist spirit warmup");
  requireSourceText(preparedWarmupBlock, "this.prefabFactory.preload(", "Initial prefab warmup");
  requireSourceText(preparedWarmupBlock, "this._collectInitialRenderPrefabPaths()", "Initial prefab collection");
  requireSourceText(preparedWarmupBlock, "this._preloadSprites(this._collectInitialCommonSpritePaths())", "Initial common sprite warmup");
  requireSourceText(initialWarmupBlock, "this.warmupPreparedGameplayAssets(assistSpiritId)", "Prepared gameplay warmup reuse");
  requireSourceText(initialWarmupBlock, "this._preloadInitialLevelRenderAssets(runtimeSnapshot)", "Current level render warmup");
  requireSourceText(resourceSource, "if (hasTimeBonus) {", "Time bonus font warmup gate");
  requireSourceText(resourceSource, "tasks.push(this._preloadTimeBonusBitmapFont())", "Time bonus font warmup");
  requireSourceText(resourceSource, "if (hasWormhole) {", "Wormhole shader warmup gate");
  requireSourceText(resourceSource, "tasks.push(this.wormholeShaderRenderer.preload())", "Wormhole shader warmup");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadFairyPrefabs"), -1, "Initial render must not wait for fairy prefabs.");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadExplodeAnimationClip"), -1, "Initial render must not wait for explode animation.");
  assert.strictEqual(initialWarmupBlock.indexOf("_preloadFireworksPrefab"), -1, "Initial render must not wait for fireworks prefab.");
  assert.strictEqual(initialWarmupBlock.indexOf("bubbleShatterRenderer.preload"), -1, "Initial render must not wait for bubble shatter shader.");

  [
    "this._preloadFairyPrefabs()",
    "this._preloadExplodeAnimationClip()",
    "this._preloadFireworksPrefab()",
    "this.prefabFactory.preload(this._collectInteractionPrefabPaths())",
    "this._preloadSprites(this._collectInteractionSpritePaths())",
    "this.bubbleShatterRenderer.preload()"
  ].forEach(function (contract) {
    requireSourceText(interactionWarmupBlock, contract, "Gameplay interaction warmup");
  });

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
      "LevelRenderer.prototype._preloadAssistSpiritAnimationClips = function (spiritId)",
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
  var countdownDeferred = createDeferred();
  var warmupDeferred = createDeferred();
  var countdownCalls = 0;
  var warmupCalls = 0;
  var settled = false;
  var host = {
    levelRenderer: {
      playGameEntryCountdown: function () {
        countdownCalls += 1;
        return countdownDeferred.promise;
      },
      warmupGameplayInteractionAssets: function () {
        warmupCalls += 1;
        return warmupDeferred.promise;
      }
    },
    _playSfx: function (soundId) {
      assert.strictEqual(soundId, "gameEntryCountdown", "Entry countdown must keep its existing SFX contract.");
    }
  };

  var readinessPromise = GameBootstrapAudioMethods._runGameEntryCountdown.call(host).then(function () {
    settled = true;
  });
  assert.strictEqual(countdownCalls, 1, "Entry countdown must start exactly once.");
  assert.strictEqual(warmupCalls, 1, "Interaction warmup must start exactly once with the countdown.");

  countdownDeferred.resolve();
  return Promise.resolve().then(function () {
    assert.strictEqual(settled, false, "Entry readiness must still wait for interaction assets after countdown completion.");
    warmupDeferred.resolve();
    return readinessPromise;
  }).then(function () {
    assert.strictEqual(settled, true, "Entry readiness must finish after countdown and interaction warmup both complete.");
  });
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

validateWarmupSourceContracts();
Promise.all([
  validateCountdownOverlap(),
  validateConditionalInitialResources()
]).then(function () {
  console.log("Gameplay entry warmup validation passed.");
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
