"use strict";

var fs = require("fs");
var path = require("path");

var outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "..", "build", "wechatgame");
var gameJsonPath = path.join(outputDir, "game.json");
var gameJsPath = path.join(outputDir, "game.js");
var localEnginePath = path.join(outputDir, "cocos", "cocos2d-js-min.js");

if (!fs.existsSync(gameJsonPath)) {
  throw new Error("Missing game.json: " + gameJsonPath);
}
if (!fs.existsSync(gameJsPath)) {
  throw new Error("Missing game.js: " + gameJsPath);
}
if (!fs.existsSync(localEnginePath)) {
  throw new Error("Missing local Cocos engine: " + localEnginePath);
}

var gameJson = JSON.parse(fs.readFileSync(gameJsonPath, "utf8"));
if (!gameJson || typeof gameJson !== "object" || Array.isArray(gameJson)) {
  throw new Error("Invalid game.json object: " + gameJsonPath);
}
delete gameJson.plugins;
fs.writeFileSync(gameJsonPath, JSON.stringify(gameJson, null, 4) + "\n", "utf8");

var gameJs = fs.readFileSync(gameJsPath, "utf8");
var pluginRequire = "requirePlugin('cocos');";
var localRequire = "require('cocos/cocos2d-js-min.js');";
if (gameJs.indexOf(pluginRequire) < 0 && gameJs.indexOf(localRequire) < 0) {
  throw new Error("Cannot find Cocos engine require in game.js.");
}
gameJs = gameJs.replace(pluginRequire, localRequire);
fs.writeFileSync(gameJsPath, gameJs, "utf8");

console.log("[DISABLED] WeChat separate engine plugin in " + outputDir);
