"use strict";

var fs = require("fs");
var path = require("path");

var outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "..", "build", "wechatgame");
var gameJsonPath = path.join(outputDir, "game.json");
var mainJsPath = path.join(outputDir, "main.js");
var rankInstallLine = "      require('./rank-main-patch').install();\n";

if (!fs.existsSync(gameJsonPath)) {
  throw new Error("Missing game.json: " + gameJsonPath);
}
if (!fs.existsSync(mainJsPath)) {
  throw new Error("Missing main.js: " + mainJsPath);
}

var gameJson = JSON.parse(fs.readFileSync(gameJsonPath, "utf8"));
if (!gameJson || typeof gameJson !== "object" || Array.isArray(gameJson)) {
  throw new Error("Invalid game.json object: " + gameJsonPath);
}
delete gameJson.openDataContext;
fs.writeFileSync(gameJsonPath, JSON.stringify(gameJson, null, 4) + "\n", "utf8");

var mainJs = fs.readFileSync(mainJsPath, "utf8");
if (mainJs.indexOf(rankInstallLine) >= 0) {
  mainJs = mainJs.replace(rankInstallLine, "");
}
fs.writeFileSync(mainJsPath, mainJs, "utf8");

console.log("[DISABLED] WeChat friend rank config in " + outputDir);
