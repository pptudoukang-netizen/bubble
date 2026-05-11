"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var SOURCE_DIR = path.join(PROJECT_ROOT, "assets/resources/config/levels");
var MIRROR_DIR = path.join(PROJECT_ROOT, "levels");

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

function listLevelFiles(dirPath) {
  return fs.readdirSync(dirPath)
    .filter(function (name) {
      return /^level_\d+\.json$/.test(name);
    })
    .sort();
}

function main() {
  var sourceFiles = listLevelFiles(SOURCE_DIR);
  var mirrorFiles = listLevelFiles(MIRROR_DIR);
  var failed = false;

  if (sourceFiles.length !== mirrorFiles.length) {
    failed = true;
    console.log("[FAIL] Level file count differs: resources=" + sourceFiles.length + ", levels=" + mirrorFiles.length);
  }

  sourceFiles.forEach(function (name, index) {
    if (mirrorFiles[index] !== name) {
      failed = true;
      console.log("[FAIL] Level file mismatch at index " + index + ": resources=" + name + ", levels=" + mirrorFiles[index]);
      return;
    }

    var sourcePath = path.join(SOURCE_DIR, name);
    var mirrorPath = path.join(MIRROR_DIR, name);
    if (readNormalized(sourcePath) !== readNormalized(mirrorPath)) {
      failed = true;
      console.log("[FAIL] Level file content differs: " + name);
    }
  });

  if (failed) {
    console.log("\nLevel sync validation failed.");
    process.exit(1);
  }

  console.log("Level sync validation passed for " + sourceFiles.length + " levels.");
}

main();
