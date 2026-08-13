"use strict";

var fs = require("fs");
var path = require("path");

function requireDirectory(absoluteDirectory) {
  if (!fs.existsSync(absoluteDirectory)) {
    throw new Error("Gameplay source family directory does not exist: " + absoluteDirectory);
  }
  if (!fs.statSync(absoluteDirectory).isDirectory()) {
    throw new Error("Gameplay source family path must be a directory: " + absoluteDirectory);
  }
}

function listFamilyFiles(projectRoot, relativeDirectory, filePrefix) {
  if (typeof projectRoot !== "string" || !projectRoot) {
    throw new Error("Gameplay source family requires projectRoot.");
  }
  if (typeof relativeDirectory !== "string" || !relativeDirectory) {
    throw new Error("Gameplay source family requires relativeDirectory.");
  }
  if (typeof filePrefix !== "string" || !filePrefix) {
    throw new Error("Gameplay source family requires filePrefix.");
  }

  var absoluteDirectory = path.join(projectRoot, relativeDirectory);
  requireDirectory(absoluteDirectory);
  var baseFileName = filePrefix + ".js";
  var fileNames = fs.readdirSync(absoluteDirectory).filter(function (fileName) {
    return fileName === baseFileName || (
      fileName.indexOf(filePrefix) === 0 &&
      fileName.slice(-3) === ".js"
    );
  }).sort(function (left, right) {
    if (left === baseFileName) {
      return -1;
    }
    if (right === baseFileName) {
      return 1;
    }
    return left.localeCompare(right);
  });

  if (!fileNames.length || fileNames[0] !== baseFileName) {
    throw new Error("Gameplay source family base file is missing: " + path.join(relativeDirectory, baseFileName));
  }
  return fileNames.map(function (fileName) {
    return path.join(absoluteDirectory, fileName);
  });
}

function readGameplaySourceFamily(projectRoot, relativeDirectory, filePrefix) {
  return listFamilyFiles(projectRoot, relativeDirectory, filePrefix).map(function (absolutePath) {
    return "\n// SOURCE_FILE: " + path.basename(absolutePath) + "\n" + fs.readFileSync(absolutePath, "utf8");
  }).join("\n");
}

module.exports = {
  listFamilyFiles: listFamilyFiles,
  readGameplaySourceFamily: readGameplaySourceFamily
};
