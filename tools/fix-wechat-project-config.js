"use strict";

var fs = require("fs");
var path = require("path");

var DEFAULT_OUTPUT_DIR = path.resolve(__dirname, "../build/wechatgame");
var DEFAULT_PROJECT_DIR = path.resolve(__dirname, "..");
var MAIN_CONFIG_FILE = "project.config.json";
var PRIVATE_CONFIG_FILE = "project.private.config.json";
var MAIN_DEFAULT_LIB_VERSION = "widelyUsed";
var PRIVATE_DEFAULT_LIB_VERSION = "widelyUsed";
var DEFAULT_DESCRIPTION = "Project configuration file.";
var CLOUD_FUNCTION_ROOT = "cloudfunctions/";
var GAME_JSON_FILE = "game.json";
var GAME_JS_FILE = "game.js";

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function readUtf8(filePath) {
  return stripBom(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  var output = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(filePath, output, "utf8");
}

function ensureDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    var stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error("Path exists but is not a directory: " + dirPath);
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error("Missing cloudfunctions source directory: " + sourceDir);
  }
  if (!fs.statSync(sourceDir).isDirectory()) {
    throw new Error("Cloudfunctions source is not a directory: " + sourceDir);
  }
  ensureDirectory(targetDir);
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(function (entry) {
    var sourcePath = path.join(sourceDir, entry.name);
    var targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
      return;
    }
    if (!entry.isFile()) {
      throw new Error("Unsupported cloudfunctions entry: " + sourcePath);
    }
    fs.copyFileSync(sourcePath, targetPath);
  });
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function sanitizeMainConfigText(text) {
  if (!text || typeof text !== "string") {
    return text;
  }

  var lineSanitized = text.replace(
    /^\s*"description"\s*:\s*.*$/m,
    "  \"description\": \"" + DEFAULT_DESCRIPTION + "\","
  );

  return lineSanitized.replace(
    /^(\s*"description"\s*:\s*)(?:"(?:\\.|[^"\\])*"|\[[^\]]*\]|\{[^}]*\}|[^,\r\n]*)(\s*,?\s*)$/m,
    "$1\"" + DEFAULT_DESCRIPTION + "\"$2"
  );
}

function loadMainConfig(filePath) {
  var raw = readUtf8(filePath);
  var parsed = tryParseJson(raw);
  if (parsed) {
    return parsed;
  }

  var sanitized = sanitizeMainConfigText(raw);
  parsed = tryParseJson(sanitized);
  if (parsed) {
    return parsed;
  }

  throw new Error("Cannot parse " + MAIN_CONFIG_FILE + ". Please check file content manually.");
}

function ensureLibVersionString(config, defaultValue) {
  if (!config || typeof config !== "object") {
    return;
  }

  if (typeof config.libVersion === "string") {
    if (config.libVersion.trim().toLowerCase() === "game") {
      config.libVersion = defaultValue;
    }
    return;
  }

  if (config.libVersion == null) {
    config.libVersion = defaultValue;
    return;
  }

  config.libVersion = String(config.libVersion);
}

function ensureDescription(config) {
  if (!config || typeof config !== "object") {
    return;
  }

  config.description = DEFAULT_DESCRIPTION;
}

function ensureCloudFunctionRoot(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid project config when ensuring cloudfunctionRoot.");
  }
  config.cloudfunctionRoot = CLOUD_FUNCTION_ROOT;
}

function assertReleaseSeparateEngine(outputDir) {
  var gameJsonPath = path.join(outputDir, GAME_JSON_FILE);
  var gameJsPath = path.join(outputDir, GAME_JS_FILE);
  if (!fs.existsSync(gameJsonPath)) {
    throw new Error("Missing " + GAME_JSON_FILE + " in " + outputDir);
  }
  if (!fs.existsSync(gameJsPath)) {
    throw new Error("Missing " + GAME_JS_FILE + " in " + outputDir);
  }
  var gameJson = tryParseJson(readUtf8(gameJsonPath));
  if (!gameJson) {
    throw new Error("Cannot parse " + GAME_JSON_FILE + " in " + outputDir);
  }
  var plugin = gameJson.plugins && gameJson.plugins.cocos;
  if (!plugin || plugin.provider !== "wx7095f7fa398a2f30") {
    throw new Error("WeChat Cocos engine plugin is not enabled. Publish with debug disabled and separate_engine enabled.");
  }
  var gameJs = readUtf8(gameJsPath);
  if (gameJs.indexOf("requirePlugin('cocos')") < 0 && gameJs.indexOf('requirePlugin("cocos")') < 0) {
    throw new Error("game.js does not use requirePlugin('cocos'). Publish with debug disabled.");
  }
  if (gameJs.indexOf("require('cocos/cocos2d-js.js')") >= 0 || gameJs.indexOf('require("cocos/cocos2d-js.js")') >= 0) {
    throw new Error("Debug engine file cocos/cocos2d-js.js is still required. Publish with debug disabled.");
  }
}

function resolveOutputDir() {
  var custom = process.argv[2];
  if (!custom) {
    return DEFAULT_OUTPUT_DIR;
  }
  return path.resolve(process.cwd(), custom);
}

function fixWeChatProjectConfig(outputDir) {
  var resolvedOutputDir = outputDir ? path.resolve(outputDir) : DEFAULT_OUTPUT_DIR;
  var mainConfigPath = path.join(resolvedOutputDir, MAIN_CONFIG_FILE);
  var privateConfigPath = path.join(resolvedOutputDir, PRIVATE_CONFIG_FILE);
  var sourceCloudFunctionsDir = path.join(DEFAULT_PROJECT_DIR, "cloudfunctions");
  var targetCloudFunctionsDir = path.join(resolvedOutputDir, "cloudfunctions");

  if (!fs.existsSync(mainConfigPath)) {
    throw new Error("Missing " + MAIN_CONFIG_FILE + " in " + resolvedOutputDir);
  }

  var mainConfig = loadMainConfig(mainConfigPath);
  ensureDescription(mainConfig);
  ensureLibVersionString(mainConfig, MAIN_DEFAULT_LIB_VERSION);
  ensureCloudFunctionRoot(mainConfig);
  writeJson(mainConfigPath, mainConfig);
  console.log("[FIXED]", mainConfigPath);
  assertReleaseSeparateEngine(resolvedOutputDir);
  console.log("[CHECKED] WeChat separate engine plugin is enabled");
  copyDirectoryContents(sourceCloudFunctionsDir, targetCloudFunctionsDir);
  console.log("[SYNCED]", targetCloudFunctionsDir);

  if (fs.existsSync(privateConfigPath)) {
    var privateConfig = tryParseJson(readUtf8(privateConfigPath));
    if (!privateConfig) {
      throw new Error("Cannot parse " + PRIVATE_CONFIG_FILE + " in " + resolvedOutputDir);
    }

    ensureLibVersionString(privateConfig, PRIVATE_DEFAULT_LIB_VERSION);
    writeJson(privateConfigPath, privateConfig);
    console.log("[FIXED]", privateConfigPath);
  } else {
    console.log("[SKIP]", privateConfigPath + " not found");
  }

  return {
    outputDir: resolvedOutputDir,
    mainConfigPath: mainConfigPath,
    privateConfigPath: privateConfigPath,
    cloudFunctionsDir: targetCloudFunctionsDir,
    hasPrivateConfig: fs.existsSync(privateConfigPath)
  };
}

function main() {
  var outputDir = resolveOutputDir();
  fixWeChatProjectConfig(outputDir);
}

if (require.main === module) {
  main();
}

module.exports = {
  fixWeChatProjectConfig: fixWeChatProjectConfig
};
