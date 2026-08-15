"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var GAME_SCENE_PATH = path.join(PROJECT_ROOT, "assets/scens/game.fire");
var BOOT_SCENE_PATH = path.join(PROJECT_ROOT, "assets/scens/boot.fire");
var BOOT_SCENE_META_PATH = BOOT_SCENE_PATH + ".meta";
var BOOT_LOADER_META_PATH = path.join(PROJECT_ROOT, "assets/boot/BootLoader.js.meta");
var BOOT_LOADER_COMPONENT_ID = "5039eb1VPRG1JT+bI5uDxg1";
var BOOT_LOADER_FILE_ID = "FyzzlN3ZBr8vGl6TOMDfM5";

function isEngineComponentType(type) {
  return typeof type === "string" && (
    type.indexOf("cc.") === 0 ||
    type.indexOf("sp.") === 0
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function findSingleIndex(sceneData, predicate, description) {
  var matches = [];
  sceneData.forEach(function (entry, index) {
    if (predicate(entry)) {
      matches.push(index);
    }
  });
  if (matches.length !== 1) {
    throw new Error("Expected exactly one " + description + ", found " + matches.length + ".");
  }
  return matches[0];
}

function remapIds(value, oldToNew, removedIndex) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(value, "__id__")) {
    var oldId = value.__id__;
    if (oldId === removedIndex) {
      throw new Error("Boot scene still references the removed GameBootstrap component.");
    }
    if (!Object.prototype.hasOwnProperty.call(oldToNew, oldId)) {
      throw new Error("Boot scene contains an invalid object reference: " + oldId);
    }
    value.__id__ = oldToNew[oldId];
    return;
  }
  Object.keys(value).forEach(function (key) {
    remapIds(value[key], oldToNew, removedIndex);
  });
}

function main() {
  var gameScene = readJson(GAME_SCENE_PATH);
  if (!Array.isArray(gameScene)) {
    throw new Error("game.fire root must be an array.");
  }
  var bootMeta = readJson(BOOT_SCENE_META_PATH);
  if (typeof bootMeta.uuid !== "string" || bootMeta.uuid.length === 0) {
    throw new Error("boot.fire.meta must define a UUID.");
  }
  var bootLoaderMeta = readJson(BOOT_LOADER_META_PATH);
  if (bootLoaderMeta.uuid !== "5039e6f5-54f4-46d4-94fe-6c8e6e0f1835") {
    throw new Error("BootLoader.js.meta UUID is invalid.");
  }

  var bootstrapIndex = findSingleIndex(gameScene, function (entry) {
    return entry &&
      Object.prototype.hasOwnProperty.call(entry, "initialLevelId") &&
      Object.prototype.hasOwnProperty.call(entry, "rewardedVideoAdUnitId");
  }, "GameBootstrap component");
  var canvasIndex = findSingleIndex(gameScene, function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "Canvas";
  }, "Canvas node");
  findSingleIndex(gameScene, function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "LoadingView";
  }, "LoadingView node");

  var clonedScene = JSON.parse(JSON.stringify(gameScene));
  var canvas = clonedScene[canvasIndex];
  canvas._components = canvas._components.filter(function (componentRef) {
    return componentRef.__id__ !== bootstrapIndex;
  });
  if (canvas._components.length !== gameScene[canvasIndex]._components.length - 1) {
    throw new Error("Canvas must reference GameBootstrap exactly once.");
  }

  var oldToNew = {};
  var bootScene = [];
  clonedScene.forEach(function (entry, oldIndex) {
    if (oldIndex === bootstrapIndex) {
      return;
    }
    oldToNew[oldIndex] = bootScene.length;
    bootScene.push(entry);
  });
  bootScene.forEach(function (entry) {
    remapIds(entry, oldToNew, bootstrapIndex);
  });

  var sceneIndex = findSingleIndex(bootScene, function (entry) {
    return entry && entry.__type__ === "cc.Scene";
  }, "boot cc.Scene");
  bootScene[sceneIndex]._id = bootMeta.uuid;

  var remappedCanvasIndex = oldToNew[canvasIndex];
  var bootCanvas = bootScene[remappedCanvasIndex];
  var bootLoaderComponentIndex = bootScene.length;
  bootScene.push({
    "__type__": BOOT_LOADER_COMPONENT_ID,
    "_name": "",
    "_objFlags": 0,
    "node": {
      "__id__": remappedCanvasIndex
    },
    "_enabled": true,
    "_id": BOOT_LOADER_FILE_ID
  });
  bootCanvas._components.push({
    "__id__": bootLoaderComponentIndex
  });

  var customComponents = bootScene.filter(function (entry) {
    return entry && typeof entry.__type__ === "string" && !isEngineComponentType(entry.__type__);
  });
  if (
    customComponents.length !== 1 ||
    customComponents[0].__type__ !== BOOT_LOADER_COMPONENT_ID
  ) {
    throw new Error("Boot scene must contain only the BootLoader component.");
  }

  fs.writeFileSync(BOOT_SCENE_PATH, JSON.stringify(bootScene, null, 2) + "\n", "utf8");
  console.log("Synchronized lightweight boot scene: " + BOOT_SCENE_PATH);
  console.log("Boot scene serialized objects: " + bootScene.length);
}

main();
