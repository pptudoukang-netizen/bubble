"use strict";

var fs = require("fs");
var path = require("path");

var outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "..", "build", "wechatgame");
var backupDir = path.resolve(__dirname, "..", "temp", "wechatgame-debug-backup");

function restoreFile(fileName) {
  var sourcePath = path.join(backupDir, fileName);
  var targetPath = path.join(outputDir, fileName);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error("Missing debug backup file: " + sourcePath);
  }
  fs.copyFileSync(sourcePath, targetPath);
}

restoreFile("game.json");
restoreFile("game.js");
console.log("[RESTORED] WeChat debug backup from " + backupDir);
