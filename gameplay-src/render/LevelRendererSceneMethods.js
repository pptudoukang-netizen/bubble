"use strict";

var attachLevelRendererSceneScaffoldMethods = require("./LevelRendererSceneScaffoldMethods");
var attachLevelRendererSceneBoardMethods = require("./LevelRendererSceneBoardMethods");
var attachLevelRendererSceneShooterMethods = require("./LevelRendererSceneShooterMethods");
var attachLevelRendererSceneFxMethods = require("./LevelRendererSceneFxMethods");
var attachLevelRendererSceneHudMethods = require("./LevelRendererSceneHudMethods");
var attachLevelRendererSceneJarMethods = require("./LevelRendererSceneJarMethods");
var attachLevelRendererScenePopupMethods = require("./LevelRendererScenePopupMethods");
var attachLevelRendererSceneOcclusionMethods = require("./LevelRendererSceneOcclusionMethods");

function attachLevelRendererSceneMethods(LevelRenderer, deps) {
  attachLevelRendererSceneScaffoldMethods(LevelRenderer, deps);
  attachLevelRendererSceneBoardMethods(LevelRenderer, deps);
  attachLevelRendererSceneOcclusionMethods(LevelRenderer, deps);
  attachLevelRendererSceneShooterMethods(LevelRenderer, deps);
  attachLevelRendererSceneFxMethods(LevelRenderer, deps);
  attachLevelRendererSceneHudMethods(LevelRenderer, deps);
  attachLevelRendererSceneJarMethods(LevelRenderer, deps);
  attachLevelRendererScenePopupMethods(LevelRenderer, deps);
}

module.exports = attachLevelRendererSceneMethods;
