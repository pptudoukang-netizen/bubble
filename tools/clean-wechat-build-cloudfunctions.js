"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, "build/wechatgame");

function resolveOutputDir() {
  var custom = process.argv[2];
  if (!custom) {
    return DEFAULT_OUTPUT_DIR;
  }
  return path.resolve(process.cwd(), custom);
}

function assertInsideBuildOutput(targetDir, outputDir) {
  var relative = path.relative(outputDir, targetDir);
  if (relative.length === 0 || relative.indexOf("..") === 0 || path.isAbsolute(relative)) {
    throw new Error("Refuse to clean outside WeChat build output: " + targetDir);
  }
}

function cleanWeChatBuildCloudFunctions(outputDir) {
  var resolvedOutputDir = path.resolve(outputDir || DEFAULT_OUTPUT_DIR);
  var targetDir = path.join(resolvedOutputDir, "cloudfunctions");
  assertInsideBuildOutput(targetDir, resolvedOutputDir);

  if (!fs.existsSync(targetDir)) {
    console.log("[SKIP] " + targetDir + " not found");
    return {
      removed: false,
      targetDir: targetDir
    };
  }
  if (!fs.statSync(targetDir).isDirectory()) {
    throw new Error("WeChat build cloudfunctions path is not a directory: " + targetDir);
  }

  fs.rmSync(targetDir, {
    recursive: true,
    force: true
  });
  console.log("[REMOVED] " + targetDir);
  return {
    removed: true,
    targetDir: targetDir
  };
}

function main() {
  cleanWeChatBuildCloudFunctions(resolveOutputDir());
}

if (require.main === module) {
  main();
}

module.exports = {
  cleanWeChatBuildCloudFunctions: cleanWeChatBuildCloudFunctions
};
