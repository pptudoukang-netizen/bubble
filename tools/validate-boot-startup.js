"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var ASSETS_ROOT = path.join(PROJECT_ROOT, "assets");
var BOOT_SCENE_PATH = path.join(ASSETS_ROOT, "scens/boot.fire");
var GAME_SCENE_PATH = path.join(ASSETS_ROOT, "scens/game.fire");
var BOOT_META_PATH = BOOT_SCENE_PATH + ".meta";
var BOOT_LOADER_PATH = path.join(ASSETS_ROOT, "boot/BootLoader.js");
var BOOT_LOADER_META_PATH = BOOT_LOADER_PATH + ".meta";
var LOADING_VIEW_CONTROLLER_PATH = path.join(ASSETS_ROOT, "scripts/ui/LoadingViewController.js");
var CORE_MARKER_PATH = path.join(ASSETS_ROOT, "scripts/bootstrap/CoreBundleReady.js");
var SCRIPTS_META_PATH = path.join(ASSETS_ROOT, "scripts.meta");
var BUILDER_SETTINGS_PATH = path.join(PROJECT_ROOT, "settings/builder.json");
var PROJECT_SETTINGS_PATH = path.join(PROJECT_ROOT, "settings/project.json");
var LOADING_SPINE_ATLAS_PATH = path.join(ASSETS_ROOT, "loading/animation/loading.atlas");
var LOADING_SPINE_DATA_PATH = path.join(ASSETS_ROOT, "loading/animation/loading.skel");
var LOADING_SPINE_DATA_META_PATH = path.join(ASSETS_ROOT, "loading/animation/loading.skel.meta");
var LOADING_SPINE_TEXTURE_META_PATH = path.join(ASSETS_ROOT, "loading/animation/loading.png.meta");
var BOOT_LOADER_COMPONENT_ID = "5039eb1VPRG1JT+bI5uDxg1";
var LOADING_SPINE_DATA_UUID = "cd89df5d-eea4-4667-a2b5-cbd865847897";
var LOADING_SPINE_TEXTURE_UUID = "0cfb8e83-aca6-4abd-9d72-d00970934996";
var LOADING_SPINE_REQUIRED_VERSION = "3.8.99";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readSpineBinaryString(buffer, state, description) {
  var byteCount = 0;
  var shift = 0;
  var currentByte = 0;
  do {
    if (state.offset >= buffer.length || shift > 28) {
      throw new Error("Loading Spine binary contains an invalid " + description + " length.");
    }
    currentByte = buffer[state.offset];
    state.offset += 1;
    byteCount |= (currentByte & 0x7f) << shift;
    shift += 7;
  } while ((currentByte & 0x80) !== 0);

  if (byteCount === 0) {
    return null;
  }
  if (byteCount === 1) {
    return "";
  }
  byteCount -= 1;
  if (state.offset + byteCount > buffer.length) {
    throw new Error("Loading Spine binary " + description + " exceeds the file length.");
  }
  var value = buffer.toString("utf8", state.offset, state.offset + byteCount);
  state.offset += byteCount;
  return value;
}

function readSpineBinaryVersion(filePath) {
  var buffer = fs.readFileSync(filePath);
  var state = { offset: 0 };
  var hash = readSpineBinaryString(buffer, state, "hash");
  var version = readSpineBinaryString(buffer, state, "version");
  if (typeof hash !== "string" || hash.length === 0 || typeof version !== "string" || version.length === 0) {
    throw new Error("Loading Spine binary header is invalid.");
  }
  return version;
}

function findEntries(sceneData, predicate) {
  return sceneData.filter(function (entry) {
    return entry && predicate(entry);
  });
}

function isEngineComponentType(type) {
  return typeof type === "string" && (
    type.indexOf("cc.") === 0 ||
    type.indexOf("sp.") === 0
  );
}

function assertSingleSceneNode(sceneData, nodeName) {
  var nodes = findEntries(sceneData, function (entry) {
    return entry.__type__ === "cc.Node" && entry._name === nodeName;
  });
  if (nodes.length !== 1) {
    throw new Error("boot.fire must contain exactly one node named `" + nodeName + "`.");
  }
}

function assertLoadingSpine(sceneData, sceneName) {
  var aniIndices = [];
  sceneData.forEach(function (entry, index) {
    if (entry && entry.__type__ === "cc.Node" && entry._name === "ani") {
      aniIndices.push(index);
    }
  });
  if (aniIndices.length !== 1) {
    throw new Error(sceneName + " must contain exactly one LoadingView ani node.");
  }

  var aniIndex = aniIndices[0];
  var aniNode = sceneData[aniIndex];
  var componentIndices = Array.isArray(aniNode._components)
    ? aniNode._components.map(function (reference) { return reference.__id__; })
    : [];
  var skeletonIndices = componentIndices.filter(function (index) {
    return sceneData[index] && sceneData[index].__type__ === "sp.Skeleton";
  });
  if (skeletonIndices.length !== 1) {
    throw new Error(sceneName + " LoadingView/Panel/ani must contain exactly one sp.Skeleton component.");
  }

  var skeleton = sceneData[skeletonIndices[0]];
  if (!skeleton.node || skeleton.node.__id__ !== aniIndex) {
    throw new Error(sceneName + " LoadingView Spine component must reference the ani node.");
  }
  if (!skeleton._N$skeletonData || skeleton._N$skeletonData.__uuid__ !== LOADING_SPINE_DATA_UUID) {
    throw new Error(sceneName + " LoadingView Spine data UUID is invalid.");
  }
  if (skeleton.defaultAnimation !== "run" || skeleton._animationName !== "run" || skeleton.loop !== true) {
    throw new Error(sceneName + " LoadingView Spine must loop the `run` animation.");
  }
}

function assertBootScene() {
  var bootScene = readJson(BOOT_SCENE_PATH);
  if (!Array.isArray(bootScene)) {
    throw new Error("boot.fire root must be an array.");
  }
  ["Canvas", "Main Camera", "LoadingView", "ProgressTrack"].forEach(function (nodeName) {
    assertSingleSceneNode(bootScene, nodeName);
  });

  assertLoadingSpine(bootScene, "boot.fire");

  var customComponents = findEntries(bootScene, function (entry) {
    return typeof entry.__type__ === "string" && !isEngineComponentType(entry.__type__);
  });
  if (
    customComponents.length !== 1 ||
    customComponents[0].__type__ !== BOOT_LOADER_COMPONENT_ID
  ) {
    throw new Error("boot.fire must contain only the BootLoader custom component.");
  }
  var canvasIndex = bootScene.findIndex(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "Canvas";
  });
  var bootLoaderIndex = bootScene.indexOf(customComponents[0]);
  if (
    !customComponents[0].node ||
    customComponents[0].node.__id__ !== canvasIndex ||
    !bootScene[canvasIndex]._components.some(function (reference) {
      return reference.__id__ === bootLoaderIndex;
    })
  ) {
    throw new Error("BootLoader must be attached to the boot scene Canvas.");
  }

  var gameScene = readJson(GAME_SCENE_PATH);
  assertLoadingSpine(gameScene, "game.fire");
  if (findEntries(gameScene, function (entry) {
    return entry && entry.__type__ === BOOT_LOADER_COMPONENT_ID;
  }).length !== 0) {
    throw new Error("game.fire must not contain BootLoader.");
  }
  var bootstrapComponents = findEntries(gameScene, function (entry) {
    return Object.prototype.hasOwnProperty.call(entry, "initialLevelId") &&
      Object.prototype.hasOwnProperty.call(entry, "rewardedVideoAdUnitId");
  });
  if (bootstrapComponents.length !== 1) {
    throw new Error("game.fire must remain the single full GameBootstrap scene.");
  }
}

function assertLoadingSpineAssets() {
  var spineMeta = readJson(LOADING_SPINE_DATA_META_PATH);
  var textureMeta = readJson(LOADING_SPINE_TEXTURE_META_PATH);
  var atlasText = readText(LOADING_SPINE_ATLAS_PATH);
  var binaryVersion = readSpineBinaryVersion(LOADING_SPINE_DATA_PATH);
  if (binaryVersion !== LOADING_SPINE_REQUIRED_VERSION) {
    throw new Error(
      "Loading Spine binary version must be " + LOADING_SPINE_REQUIRED_VERSION +
      " for Creator 2.4.12 native runtime, received " + binaryVersion + "."
    );
  }
  if (spineMeta.importer !== "spine" || spineMeta.uuid !== LOADING_SPINE_DATA_UUID) {
    throw new Error("Loading Spine data meta is invalid.");
  }
  if (
    !Array.isArray(spineMeta.textures) ||
    spineMeta.textures.length !== 1 ||
    spineMeta.textures[0] !== LOADING_SPINE_TEXTURE_UUID
  ) {
    throw new Error("Loading Spine data must reference exactly the loading atlas texture.");
  }
  if (textureMeta.importer !== "texture" || textureMeta.uuid !== LOADING_SPINE_TEXTURE_UUID) {
    throw new Error("Loading Spine texture meta is invalid.");
  }
  var atlasHeader = atlasText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(function (line) { return line.trim().length > 0; })[0];
  if (atlasHeader !== "loading.png") {
    throw new Error("Loading Spine atlas must reference loading.png.");
  }
}

function assertLoadingSpineRelease() {
  var controllerSource = readText(LOADING_VIEW_CONTROLLER_PATH);
  [
    'throw new Error("LoadingView dispose requires the Spine runtime.")',
    "node.getComponent(sp.Skeleton)",
    "skeleton.clearTracks()",
    "skeleton.paused = true",
    "cc.director.once(cc.Director.EVENT_AFTER_DRAW, releaseAssets)",
    "cc.assetManager.releaseAsset(asset)"
  ].forEach(function (requiredText) {
    if (controllerSource.indexOf(requiredText) < 0) {
      throw new Error("LoadingView Spine release step missing: " + requiredText);
    }
  });
  if (controllerSource.indexOf("skeleton.skeletonData = null") >= 0) {
    throw new Error("LoadingView must not clear SkeletonData through the native Spine setter.");
  }
}

function assertLoadingAniMovement() {
  var controllerSource = readText(LOADING_VIEW_CONTROLLER_PATH);
  [
    "var ANI_MOVEMENT_FOOTPRINT_WIDTH = 272",
    "this._updateAniMovement(elapsed)",
    "this._aniNode.x = Math.min(this._aniMaxX, this._aniNode.x + this._aniMoveSpeed * dt)",
    "return ANI_MOVEMENT_FOOTPRINT_WIDTH * scaleX * 0.5"
  ].forEach(function (requiredText) {
    if (controllerSource.indexOf(requiredText) < 0) {
      throw new Error("LoadingView ani translation step missing: " + requiredText);
    }
  });
}

function assertStartSceneSettings() {
  var bootMeta = readJson(BOOT_META_PATH);
  var builderSettings = readJson(BUILDER_SETTINGS_PATH);
  var projectSettings = readJson(PROJECT_SETTINGS_PATH);
  if (builderSettings.startScene !== bootMeta.uuid) {
    throw new Error("settings/builder.json startScene must point to boot.fire.");
  }
  if (projectSettings["start-scene"] !== bootMeta.uuid) {
    throw new Error("settings/project.json start-scene must point to boot.fire.");
  }
  if (
    !Array.isArray(projectSettings["excluded-modules"]) ||
    projectSettings["excluded-modules"].indexOf("Spine Skeleton") >= 0
  ) {
    throw new Error("settings/project.json must include the Spine Skeleton engine module.");
  }
}

function assertCoreBundleMeta() {
  var scriptsMeta = readJson(SCRIPTS_META_PATH);
  if (scriptsMeta.isBundle !== true || scriptsMeta.bundleName !== "core") {
    throw new Error("assets/scripts must be the `core` asset bundle.");
  }
  if (scriptsMeta.priority !== 7) {
    throw new Error("core bundle priority must be 7.");
  }
  if (!scriptsMeta.compressionType || scriptsMeta.compressionType.wechatgame !== "subpackage") {
    throw new Error("core bundle must build as a WeChat subpackage.");
  }
}

function assertBootLoader() {
  var loaderMeta = readJson(BOOT_LOADER_META_PATH);
  if (loaderMeta.isPlugin !== false || loaderMeta.loadPluginInEditor !== false) {
    throw new Error("BootLoader must be a boot-scene component, not a global plugin.");
  }
  var loaderSource = readText(BOOT_LOADER_PATH);
  [
    'var CORE_BUNDLE_NAME = "core"',
    'wx.loadSubpackage',
    'cc.assetManager.loadBundle',
    'cc.director.preloadScene',
    'cc.Director.EVENT_AFTER_DRAW',
    '__BUBBLE_CORE_CODE_LOADED__',
    'Math.max(progressBar.progress, next)',
    'event.totalBytesWritten',
    'event.totalBytesExpectedToWrite',
    'if (hasWrittenBytes || hasExpectedBytes)',
    'resolveSubpackageProgress01(event)',
    'extends: cc.Component',
    'startBootFlow(this.node)'
  ].forEach(function (requiredText) {
    if (loaderSource.indexOf(requiredText) < 0) {
      throw new Error("BootLoader startup step missing: " + requiredText);
    }
  });
  if (/\brequire\s*\(/.test(loaderSource)) {
    throw new Error("BootLoader must not synchronously require core business modules.");
  }
  if (loaderSource.indexOf("EVENT_AFTER_SCENE_LAUNCH") >= 0) {
    throw new Error("BootLoader must not register a global scene-launch listener.");
  }

  var markerSource = readText(CORE_MARKER_PATH);
  if (markerSource.indexOf("__BUBBLE_CORE_CODE_LOADED__ = true") < 0) {
    throw new Error("Core bundle execution marker is missing.");
  }
}

function main() {
  assertBootScene();
  assertLoadingAniMovement();
  assertLoadingSpineAssets();
  assertLoadingSpineRelease();
  assertStartSceneSettings();
  assertCoreBundleMeta();
  assertBootLoader();
  console.log("Boot startup validation passed.");
}

main();
