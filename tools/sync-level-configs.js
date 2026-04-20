"use strict";

var fs = require("fs");
var path = require("path");

var SOURCE_DIR = path.resolve(__dirname, "../assets/resources/config/levels");
var TARGET_DIR = path.resolve(__dirname, "../levels");

function normalizeContent(raw) {
  var text = raw;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

function readNormalized(filePath) {
  return normalizeContent(fs.readFileSync(filePath, "utf8"));
}

function syncLevelFiles() {
  var files = fs.readdirSync(SOURCE_DIR)
    .filter(function (name) {
      return /^level_\d+\.json$/.test(name);
    })
    .sort();

  if (!files.length) {
    throw new Error("No level files found in " + SOURCE_DIR);
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  var changed = 0;
  files.forEach(function (name) {
    var sourcePath = path.join(SOURCE_DIR, name);
    var targetPath = path.join(TARGET_DIR, name);

    var sourceContent = readNormalized(sourcePath);
    var targetContent = fs.existsSync(targetPath) ? readNormalized(targetPath) : null;

    if (targetContent !== sourceContent) {
      fs.writeFileSync(targetPath, sourceContent, "utf8");
      changed += 1;
      console.log("[SYNC]", name);
    } else {
      console.log("[KEEP]", name);
    }
  });

  console.log("\nSync completed. Updated", changed, "files.");
}

syncLevelFiles();
