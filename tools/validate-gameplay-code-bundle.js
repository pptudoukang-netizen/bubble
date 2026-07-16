"use strict";

var fs = require("fs");
var path = require("path");
var builder = require("./build-wechat-gameplay-code");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var GAMEPLAY_ASSET_PATH = path.join(PROJECT_ROOT, "assets", "game", "generated", "lazy-gameplay-code.js");
var GAMEPLAY_META_PATH = GAMEPLAY_ASSET_PATH + ".meta";
var LEGACY_JSON_PATHS = [
  path.join(PROJECT_ROOT, "assets", "game", "generated", "lazy-gameplay-code.json"),
  path.join(PROJECT_ROOT, "assets", "resources", "generated", "lazy-gameplay-code.json")
];

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Required gameplay bundle file is missing: " + filePath);
  }
}

assertFile(GAMEPLAY_ASSET_PATH);
assertFile(GAMEPLAY_META_PATH);

var expectedCode = builder.buildLazyBundleText(path.join(PROJECT_ROOT, "gameplay-src"));
var actualCode = fs.readFileSync(GAMEPLAY_ASSET_PATH, "utf8");
if (actualCode !== expectedCode) {
  throw new Error("Generated gameplay JS is stale. Run `npm run build:wechat-gameplay-code`.");
}

var meta = JSON.parse(fs.readFileSync(GAMEPLAY_META_PATH, "utf8"));
if (meta.importer !== "javascript" || meta.uuid !== "f93b3df4-2c67-4a5d-a3b8-4d4370cf4a71") {
  throw new Error("Gameplay generated asset meta must use the registered JavaScript UUID.");
}

LEGACY_JSON_PATHS.forEach(function (legacyPath) {
  if (fs.existsSync(legacyPath) || fs.existsSync(legacyPath + ".meta")) {
    throw new Error("Legacy gameplay JSON duplicate must not be published: " + legacyPath);
  }
});

var bundleLoaderText = fs.readFileSync(path.join(PROJECT_ROOT, "assets", "scripts", "utils", "BundleLoader.js"), "utf8");
[
  "lazy-gameplay-code.json",
  "__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__",
  "loadGameplayCodeFromResource",
  "eval(codeText)"
].forEach(function (forbiddenText) {
  if (bundleLoaderText.indexOf(forbiddenText) >= 0) {
    throw new Error("BundleLoader still contains legacy gameplay loading code: " + forbiddenText);
  }
});

console.log("Gameplay code bundle validation passed: one JS asset, no JSON duplicate, no runtime eval loader.");
