"use strict";

var fs = require("fs");
var path = require("path");

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var ColorCloudSystem = require("../gameplay-src/systems/ColorCloudSystem");
var ColorCloudConfig = require("../gameplay-src/config/ColorCloudConfig");
var SpecialAnimationTiming = require("../gameplay-src/config/SpecialAnimationTiming");
var attachGameManagerColorCloudMethods = require("../gameplay-src/core/GameManagerColorCloudMethods");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var GameManager = require("../gameplay-src/core/GameManager");

var ROOT = path.resolve(__dirname, "..");
var LEVEL_KEY = "level_color_cloud_test";
var LEVEL_PATH = path.join(ROOT, "assets/map/config/levels/" + LEVEL_KEY + ".json");
var CLOUD_ASSET_DIR = path.join(ROOT, "assets/game/image/special_item");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPngSize(filePath) {
  var buffer = fs.readFileSync(filePath);
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47
  ) {
    throw new Error("Color cloud asset must be a valid PNG: " + filePath);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertThrows(callback, messageFragment, description) {
  var thrown = null;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert(thrown, description + " must throw.");
  assert(thrown.message.indexOf(messageFragment) >= 0, description + " threw unexpected error: " + thrown.message);
}

function validateConfigAndCodec(rawConfig) {
  var normalized = LevelConfigLoader.normalizeLevelConfig(rawConfig, LEVEL_KEY);
  assert(Array.isArray(normalized.level.colorClouds), "Normalized colorClouds must be an array.");
  assert(normalized.level.colorClouds.length === 4, "Color cloud test must contain four configured groups.");
  assert(normalized.level.colorClouds.filter(function (cloud) { return cloud.visible; }).length === 3, "Color cloud test must contain three visible groups.");
  assert(normalized.level.colorClouds[1].color === "RAINBOW", "Second test cloud must be rainbow.");
  assert(normalized.level.colorClouds[3].visible === false, "Fourth test cloud must be hidden.");

  var missingField = clone(rawConfig);
  delete missingField.level.colorClouds[0].speed;
  assertThrows(function () {
    LevelConfigLoader.normalizeLevelConfig(missingField, LEVEL_KEY);
  }, "must contain exactly", "Missing color cloud field");

  var zeroSpeed = clone(rawConfig);
  zeroSpeed.level.colorClouds[0].speed = 0;
  assertThrows(function () {
    LevelConfigLoader.normalizeLevelConfig(zeroSpeed, LEVEL_KEY);
  }, ".speed must be a non-zero", "Zero color cloud speed");

  var inactiveColor = clone(rawConfig);
  inactiveColor.level.colorClouds[0].color = "W";
  assertThrows(function () {
    LevelConfigLoader.normalizeLevelConfig(inactiveColor, LEVEL_KEY);
  }, ".color must be RAINBOW or a color in level.colors", "Inactive normal cloud color");

  var fullPack = {
    schemaVersion: 1,
    packId: "color-cloud-test-pack",
    from: 1,
    to: 1,
    levels: {}
  };
  fullPack.levels[LEVEL_KEY] = rawConfig;
  var compact = LevelPackCompactCodec.compactPack(fullPack);
  assert(Array.isArray(compact.levels[LEVEL_KEY].level.colorClouds[0]), "Color clouds must use compact array encoding.");
  assert(compact.levels[LEVEL_KEY].level.colorClouds[0].length === 7, "Compact color cloud entry must contain seven values.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  assert(
    JSON.stringify(expanded.levels[LEVEL_KEY].level.colorClouds) === JSON.stringify(rawConfig.level.colorClouds),
    "Color cloud compact codec round-trip mismatch."
  );
  return normalized;
}

function validateSystem(normalized) {
  var system = new ColorCloudSystem();
  system.initialize({});
  system.configureLevel(normalized);
  assert(system.snapshotForRender().activeClouds.length === 3, "Hidden color cloud must not enter render snapshot.");
  system.update(0, false);
  var initialSnapshot = system.snapshotForRender();
  assert(initialSnapshot.activeClouds[0].status === "moving", "startTime=0 cloud must move immediately.");
  assert(initialSnapshot.activeClouds[1].status === "waiting", "Future-start cloud must wait before moving.");

  var contactState = {};
  var firstHits = system.resolveProjectileSegment(
    { x: -520, y: -190 },
    { x: 120, y: -190 },
    0,
    1,
    contactState,
    function () { return 0; }
  );
  assert(firstHits.length === 1 && firstHits[0].resolvedColor === "R", "Normal cloud must recolor on first traversal.");
  assert(firstHits[0].hitCount === 1 && firstHits[0].fadeStarted === false, "First red-cloud traversal must increment without fading.");

  var secondHits = system.resolveProjectileSegment(
    { x: 120, y: -190 },
    { x: -520, y: -190 },
    0,
    1,
    contactState,
    function () { return 0; }
  );
  assert(secondHits.length === 1 && secondHits[0].hitCount === 2, "Second red-cloud traversal must reach hitDispearTime.");
  assert(secondHits[0].fadeStarted === true, "Cloud must begin fading exactly at hitDispearTime.");
  var fadeStartCloud = system.snapshotForRender().activeClouds.filter(function (cloud) {
    return cloud.id === "color_cloud_001";
  })[0];
  assert(fadeStartCloud, "Threshold-hit cloud must remain visible while fading.");
  system.update(SpecialAnimationTiming.colorCloud.fadeDuration * 0.5, false);
  var fadingCloud = system.snapshotForRender().activeClouds.filter(function (cloud) {
    return cloud.id === "color_cloud_001";
  })[0];
  assert(fadingCloud && fadingCloud.opacity >= 127 && fadingCloud.opacity <= 128, "Half-faded cloud opacity must be authoritative.");
  assert(
    fadingCloud.position.x === fadeStartCloud.position.x && fadingCloud.position.y === fadeStartCloud.position.y,
    "Threshold-hit cloud must freeze at the hit position while fading."
  );
  system.update(SpecialAnimationTiming.colorCloud.fadeDuration * 0.5, false);
  assert(system.snapshotForRender().activeClouds.every(function (cloud) {
    return cloud.id !== "color_cloud_001";
  }), "Cloud must be removed after fade duration.");

  var rainbowSystem = new ColorCloudSystem();
  rainbowSystem.initialize({});
  rainbowSystem.configureLevel(normalized);
  rainbowSystem.update(0, false);
  var rainbowHits = rainbowSystem.resolveProjectileSegment(
    { x: -520, y: 70 },
    { x: 520, y: 70 },
    0,
    1,
    {},
    function () { return 0.8; }
  );
  var rainbowHit = rainbowHits.filter(function (hit) { return hit.cloudColor === "RAINBOW"; })[0];
  assert(rainbowHit && rainbowHit.resolvedColor === "P", "Rainbow cloud must choose deterministically from active level colors.");
  rainbowSystem.update(2, false);
  var movedRainbow = rainbowSystem.snapshotForRender().activeClouds.filter(function (cloud) {
    return cloud.id === "color_cloud_002";
  })[0];
  assert(movedRainbow.position.x === 172.5, "Rainbow cloud must begin horizontal movement only after startTime.");
  rainbowSystem.update(6, false);
  movedRainbow = rainbowSystem.snapshotForRender().activeClouds.filter(function (cloud) {
    return cloud.id === "color_cloud_002";
  })[0];
  assert(movedRainbow.position.x === -172.5, "Negative-speed rainbow cloud must reflect from the left screen boundary.");

  var pingPongConfig = clone(normalized);
  pingPongConfig.level.colorClouds = [{
    visible: true,
    position: { x: 200, y: 0 },
    hitDispearTime: 2,
    startTime: 0,
    speed: 100,
    color: "R"
  }];
  var pingPongSystem = new ColorCloudSystem();
  pingPongSystem.initialize({});
  pingPongSystem.configureLevel(pingPongConfig);
  pingPongSystem.update(1, false);
  var reflectedCloud = pingPongSystem.snapshotForRender().activeClouds[0];
  assert(reflectedCloud.position.x === 150, "Positive-speed cloud must preserve overshoot after reflecting from the right boundary.");
  var boundaryHits = pingPongSystem.resolveProjectileSegment(
    { x: 325, y: 0 },
    { x: 325, y: 0 },
    0,
    1,
    {},
    function () { return 0; }
  );
  assert(boundaryHits.length === 1, "Projectile collision must detect a cloud at its within-frame reflection point.");
  pingPongSystem.update(4, false);
  reflectedCloud = pingPongSystem.snapshotForRender().activeClouds[0];
  assert(reflectedCloud.position.x === -200, "Cloud must continue ping-pong movement across repeated screen reflections.");

  var outOfBoundsConfig = clone(normalized);
  outOfBoundsConfig.level.colorClouds[0].position.x = 226;
  var outOfBoundsSystem = new ColorCloudSystem();
  outOfBoundsSystem.initialize({});
  assertThrows(function () {
    outOfBoundsSystem.configureLevel(outOfBoundsConfig);
  }, "must keep the entire cloud inside", "Out-of-screen color cloud start position");
}

function validateGameManagerMutation(normalized) {
  var system = new ColorCloudSystem();
  system.initialize({});
  system.configureLevel(normalized);
  system.update(0, false);

  function TestManager() {
    this.systems = { colorCloudSystem: system };
    this.colorCloudRandom = function () { return 0; };
    this.events = [];
  }
  TestManager.prototype._pushRuntimeEvent = function (type, payload) {
    this.events.push({ type: type, payload: payload });
  };
  attachGameManagerColorCloudMethods(TestManager);
  var manager = new TestManager();
  var projectile = {
    color: "G",
    ball: {
      color: "G",
      entityCategory: "skill_ball",
      entityType: "blast"
    },
    colorCloudInsideIds: {}
  };
  manager._resolveColorCloudProjectileSegment(
    projectile,
    { x: -520, y: -190 },
    { x: 120, y: -190 },
    0,
    1
  );
  assert(projectile.color === "R" && projectile.ball.color === "R", "Current projectile and ball payload must recolor immediately.");
  assert(projectile.ball.entityType === "blast", "Color cloud recolor must preserve the projectile mechanic type.");
  assert(manager.events.length === 1 && manager.events[0].type === "color_cloud_hit", "Color cloud traversal must emit one runtime event.");
}

function validateGameManagerLifecycle(normalized) {
  global.cc = {
    log: function () {},
    warn: function () {},
    error: function () {}
  };
  BoardLayout.hudBottomLineY = 360;
  var manager = new GameManager();
  manager.bootstrap();
  var startSnapshot = manager.startLevel(normalized, {
    seed: "color-cloud-validator",
    attemptIndex: 1,
    runMode: "test"
  });
  assert(startSnapshot.systems.colorCloudSystem.activeClouds.length === 3, "GameManager start snapshot must expose visible color clouds.");
  var updateSnapshot = manager.update(0.1);
  assert(updateSnapshot && updateSnapshot.systems.colorCloudSystem, "Moving color clouds must request a runtime refresh without an active projectile.");
}

function validateAssetsAndWiring() {
  [
    { name: "red", code: "R" },
    { name: "green", code: "G" },
    { name: "blue", code: "B" },
    { name: "yellow", code: "Y" },
    { name: "purple", code: "P" },
    { name: "black", code: "K" },
    { name: "orange", code: "O" },
    { name: "white", code: "W" },
    { name: "rainbow", code: "RAINBOW" }
  ].forEach(function (definition) {
    var colorName = definition.name;
    var pngPath = path.join(CLOUD_ASSET_DIR, colorName + "_cloud.png");
    assert(fs.existsSync(pngPath), "Color cloud image is missing: " + pngPath);
    assert(fs.statSync(pngPath).size > 0, "Color cloud image is empty: " + pngPath);
    assert(fs.existsSync(pngPath + ".meta"), "Color cloud image meta is missing: " + pngPath + ".meta");
    var expectedSize = ColorCloudConfig.getRenderSize(definition.code);
    var pngSize = readPngSize(pngPath);
    assert(
      pngSize.width === expectedSize.width && pngSize.height === expectedSize.height,
      "Color cloud PNG size mismatch for " + definition.code + "."
    );
    var meta = readJson(pngPath + ".meta");
    assert(meta.width === expectedSize.width && meta.height === expectedSize.height, "Color cloud texture meta size mismatch for " + definition.code + ".");
    var subMetaKeys = Object.keys(meta.subMetas || {});
    assert(subMetaKeys.length === 1, "Color cloud meta must contain exactly one sprite frame: " + definition.code + ".");
    var spriteMeta = meta.subMetas[subMetaKeys[0]];
    assert(
      spriteMeta.rawWidth === expectedSize.width && spriteMeta.rawHeight === expectedSize.height,
      "Color cloud sprite-frame meta size mismatch for " + definition.code + "."
    );
  });
  var gameManagerSource = fs.readFileSync(path.join(ROOT, "gameplay-src/core/GameManagerUpdateMethods.js"), "utf8");
  assert(gameManagerSource.indexOf("_resolveColorCloudProjectileSegment") >= 0, "Projectile update must resolve color cloud traversal per movement segment.");
  var rendererSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneColorCloudMethods.js"), "utf8");
  assert(rendererSource.indexOf("COLOR_CLOUD_RESOURCES") >= 0, "Color cloud renderer must use the dedicated sprite resource map.");
  assert(rendererSource.indexOf("cc.Sprite.SizeMode.RAW") >= 0, "Color cloud renderer must preserve each image's original size.");
  assert(rendererSource.indexOf("cloud.opacity") >= 0, "Color cloud renderer must apply authoritative fade opacity.");
}

assert(fs.existsSync(LEVEL_PATH), "Color cloud test level is missing.");
assert(fs.existsSync(LEVEL_PATH + ".meta"), "Color cloud test level meta is missing.");
var rawConfig = readJson(LEVEL_PATH);
var normalized = validateConfigAndCodec(rawConfig);
validateSystem(normalized);
validateGameManagerMutation(normalized);
validateGameManagerLifecycle(normalized);
validateAssetsAndWiring();
console.log("[OK] color_cloud config, per-image size, screen ping-pong movement, continuous traversal recolor, frozen hit fade, codec, assets and test level validated");
