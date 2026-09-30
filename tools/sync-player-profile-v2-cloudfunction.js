"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var SOURCE_DIR = path.join(PROJECT_ROOT, "cloudfunctions/playerProfile");
var TEMPLATE_SOURCE_DIR = path.join(
  PROJECT_ROOT,
  "build-templates/wechatgame/cloudfunctions/playerProfile"
);
var V2_DEPLOYMENT_MARKER = "playerProfileV2_v20260824_profile_size_caps_v6";
var SOURCE_DEPLOYMENT_MARKER = "playerProfile_v20260814_profile_size_caps_v6";
var INCLUDE_BUILD_FLAG = "--include-build";

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(description + " is missing: " + filePath);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertEqual(actual, expected, description) {
  if (actual !== expected) {
    throw new Error(description);
  }
}

function replaceDeploymentMarker(source) {
  var expectedLine = 'var DEPLOYMENT_MARKER = "' + SOURCE_DEPLOYMENT_MARKER + '";';
  var replacementLine = 'var DEPLOYMENT_MARKER = "' + V2_DEPLOYMENT_MARKER + '";';
  var firstIndex = source.indexOf(expectedLine);
  if (firstIndex < 0 || source.indexOf(expectedLine, firstIndex + expectedLine.length) >= 0) {
    throw new Error("playerProfile source must contain exactly one expected deployment marker.");
  }
  return source.replace(expectedLine, replacementLine);
}

function buildPackageJson(source) {
  var parsed = JSON.parse(source);
  if (parsed.name !== "player-profile") {
    throw new Error("playerProfile package name must be `player-profile`.");
  }
  parsed.name = "player-profile-v2";
  return JSON.stringify(parsed, null, 2) + "\n";
}

function writeFunction(targetDir, indexSource, packageSource) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "index.js"), indexSource, "utf8");
  fs.writeFileSync(path.join(targetDir, "package.json"), packageSource, "utf8");
}

function requireBuildCloudFunctionRoot() {
  var configPath = path.join(PROJECT_ROOT, "build/wechatgame/project.config.json");
  var config = JSON.parse(requireFile(configPath, "WeChat build project config"));
  if (config.cloudfunctionRoot !== "cloudfunctions/") {
    throw new Error("WeChat build cloudfunctionRoot must be `cloudfunctions/`.");
  }
  return path.join(PROJECT_ROOT, "build/wechatgame/cloudfunctions/playerProfileV2");
}

function main() {
  var args = process.argv.slice(2);
  args.forEach(function (arg) {
    if (arg !== INCLUDE_BUILD_FLAG) {
      throw new Error("Unsupported playerProfileV2 sync argument: " + arg);
    }
  });
  if (args.filter(function (arg) { return arg === INCLUDE_BUILD_FLAG; }).length > 1) {
    throw new Error("Duplicate playerProfileV2 sync argument: " + INCLUDE_BUILD_FLAG);
  }

  var sourceIndex = requireFile(path.join(SOURCE_DIR, "index.js"), "playerProfile source index");
  var sourcePackage = requireFile(path.join(SOURCE_DIR, "package.json"), "playerProfile source package");
  var templateIndex = requireFile(
    path.join(TEMPLATE_SOURCE_DIR, "index.js"),
    "playerProfile template index"
  );
  var templatePackage = requireFile(
    path.join(TEMPLATE_SOURCE_DIR, "package.json"),
    "playerProfile template package"
  );
  assertEqual(templateIndex, sourceIndex, "playerProfile source and build template index must match.");
  assertEqual(templatePackage, sourcePackage, "playerProfile source and build template package must match.");

  var v2Index = replaceDeploymentMarker(sourceIndex);
  var v2Package = buildPackageJson(sourcePackage);
  var targetDirs = [
    path.join(PROJECT_ROOT, "cloudfunctions/playerProfileV2"),
    path.join(PROJECT_ROOT, "build-templates/wechatgame/cloudfunctions/playerProfileV2")
  ];
  if (args.indexOf(INCLUDE_BUILD_FLAG) >= 0) {
    targetDirs.push(requireBuildCloudFunctionRoot());
  }
  targetDirs.forEach(function (targetDir) {
    writeFunction(targetDir, v2Index, v2Package);
  });
  console.log(
    "Synchronized playerProfileV2 cloud function to " +
      targetDirs.length +
      " target directories with marker " +
      V2_DEPLOYMENT_MARKER +
      "."
  );
}

main();
