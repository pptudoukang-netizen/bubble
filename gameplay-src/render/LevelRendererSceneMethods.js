"use strict";

var attachLevelRendererSceneScaffoldMethods = require("./LevelRendererSceneScaffoldMethods");
var attachLevelRendererSceneBoardMethods = require("./LevelRendererSceneBoardMethods");
var attachLevelRendererSceneBlackHoleMethods = require("./LevelRendererSceneBlackHoleMethods");
var attachLevelRendererSceneSpiderBoardMethods = require("./LevelRendererSceneSpiderBoardMethods");
var attachLevelRendererSceneShooterMethods = require("./LevelRendererSceneShooterMethods");
var attachLevelRendererSceneFxMethods = require("./LevelRendererSceneFxMethods");
var attachLevelRendererSceneHudMethods = require("./LevelRendererSceneHudMethods");
var attachLevelRendererSceneJarMethods = require("./LevelRendererSceneJarMethods");
var attachLevelRendererScenePopupMethods = require("./LevelRendererScenePopupMethods");
var attachLevelRendererSceneOcclusionMethods = require("./LevelRendererSceneOcclusionMethods");
var attachLevelRendererSceneColorCloudMethods = require("./LevelRendererSceneColorCloudMethods");

function attachLevelRendererSceneMethods(LevelRenderer, deps) {
  attachLevelRendererSceneScaffoldMethods(LevelRenderer, deps);
  attachLevelRendererSceneBoardMethods(LevelRenderer, deps);
  attachLevelRendererSceneBlackHoleMethods(LevelRenderer, deps);
  attachLevelRendererSceneSpiderBoardMethods(LevelRenderer, deps);
  attachLevelRendererSceneOcclusionMethods(LevelRenderer, deps);
  attachLevelRendererSceneColorCloudMethods(LevelRenderer, deps);
  attachLevelRendererSceneShooterMethods(LevelRenderer, deps);
  attachLevelRendererSceneFxMethods(LevelRenderer, deps);
  attachLevelRendererSceneHudMethods(LevelRenderer, deps);
  attachLevelRendererSceneJarMethods(LevelRenderer, deps);
  attachLevelRendererScenePopupMethods(LevelRenderer, deps);
}

module.exports = attachLevelRendererSceneMethods;
