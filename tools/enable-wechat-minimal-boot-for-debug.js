"use strict";

var fs = require("fs");
var path = require("path");

var outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "..", "build", "wechatgame");
var backupDir = path.resolve(__dirname, "..", "temp", "wechatgame-debug-backup");
var gameJsonPath = path.join(outputDir, "game.json");
var gameJsPath = path.join(outputDir, "game.js");

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Missing required file: " + filePath);
  }
}

function backupFile(filePath) {
  var targetPath = path.join(backupDir, path.basename(filePath));
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(filePath, targetPath);
  }
}

assertFile(gameJsonPath);
assertFile(gameJsPath);
fs.mkdirSync(backupDir, { recursive: true });
backupFile(gameJsonPath);
backupFile(gameJsPath);

var gameJson = JSON.parse(fs.readFileSync(gameJsonPath, "utf8"));
if (!gameJson || typeof gameJson !== "object" || Array.isArray(gameJson)) {
  throw new Error("Invalid game.json object: " + gameJsonPath);
}
delete gameJson.plugins;
delete gameJson.subpackages;
delete gameJson.openDataContext;
fs.writeFileSync(gameJsonPath, JSON.stringify(gameJson, null, 4) + "\n", "utf8");

var minimalGameJs = [
  "\"use strict\";",
  "",
  "console.log(\"[codex-debug] minimal WeChat game booted\");",
  "var canvas = wx.createCanvas();",
  "var ctx = canvas.getContext(\"2d\");",
  "ctx.fillStyle = \"#243b53\";",
  "ctx.fillRect(0, 0, canvas.width, canvas.height);",
  "ctx.fillStyle = \"#ffffff\";",
  "ctx.font = \"24px sans-serif\";",
  "ctx.fillText(\"minimal boot ok\", 40, 80);",
  ""
].join("\n");
fs.writeFileSync(gameJsPath, minimalGameJs, "utf8");

console.log("[ENABLED] Minimal WeChat boot in " + outputDir);
console.log("[BACKUP] " + backupDir);
