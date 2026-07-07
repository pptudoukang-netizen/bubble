"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

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
var STARTUP_PRELOAD_SUBPACKAGE_NAMES = [];
var ASSET_CONFIG_FILE_PATTERN = /^config\.[a-f0-9]+\.json$/i;
var wechatMinigameLoadingPatch = require("./wechat-minigame-loading-patch");

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

function removeDirectoryIfExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  var stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error("Cloudfunctions target exists but is not a directory: " + dirPath);
  }
  fs.rmSync(dirPath, {
    recursive: true,
    force: true
  });
}

function collectAssetConfigFiles(rootDir, output) {
  if (!fs.existsSync(rootDir)) {
    throw new Error("Missing asset config root: " + rootDir);
  }
  if (!fs.statSync(rootDir).isDirectory()) {
    throw new Error("Asset config root exists but is not a directory: " + rootDir);
  }

  fs.readdirSync(rootDir, { withFileTypes: true }).forEach(function (entry) {
    var entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectAssetConfigFiles(entryPath, output);
      return;
    }
    if (!entry.isFile()) {
      throw new Error("Unsupported asset config entry: " + entryPath);
    }
    if (ASSET_CONFIG_FILE_PATTERN.test(entry.name)) {
      output.push(entryPath);
    }
  });
}

function md5Prefix(filePath, length) {
  var hash = crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
  return hash.slice(0, length);
}

function assertVersionedImportFileHash(filePath, expectedVersion) {
  if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
    throw new Error("Asset import version must be a non-empty string: " + filePath);
  }
  var actualPrefix = md5Prefix(filePath, expectedVersion.length);
  if (actualPrefix !== expectedVersion.toLowerCase()) {
    throw new Error("Asset import file hash mismatch: " + filePath + " expected=" + expectedVersion + " actual=" + actualPrefix);
  }
}

function ensureVersionedStringImportPackFilesForConfig(configPath) {
  var config = JSON.parse(readUtf8(configPath));
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Asset config must be an object: " + configPath);
  }
  if (!config.versions || typeof config.versions !== "object" || Array.isArray(config.versions)) {
    throw new Error("Asset config requires versions object: " + configPath);
  }
  if (!Array.isArray(config.versions.import)) {
    throw new Error("Asset config requires versions.import array: " + configPath);
  }
  if (typeof config.importBase !== "string" || config.importBase.length === 0) {
    throw new Error("Asset config requires importBase: " + configPath);
  }
  if (config.versions.import.length % 2 !== 0) {
    throw new Error("Asset config versions.import length must be even: " + configPath);
  }

  var configDir = path.dirname(configPath);
  var fixedCount = 0;
  for (var index = 0; index < config.versions.import.length; index += 2) {
    var importId = config.versions.import[index];
    var importVersion = config.versions.import[index + 1];
    if (typeof importId !== "string") {
      continue;
    }
    if (typeof importVersion !== "string" || importVersion.length === 0) {
      throw new Error("Asset import version is invalid for `" + importId + "` in " + configPath);
    }

    var importDir = path.join(configDir, config.importBase, importId.slice(0, 2));
    var expectedPath = path.join(importDir, importId + "." + importVersion + ".json");
    var unversionedPath = path.join(importDir, importId + ".json");

    if (fs.existsSync(expectedPath)) {
      assertVersionedImportFileHash(expectedPath, importVersion);
      continue;
    }
    if (!fs.existsSync(unversionedPath)) {
      throw new Error("Versioned asset import file is missing: " + expectedPath);
    }

    assertVersionedImportFileHash(unversionedPath, importVersion);
    fs.renameSync(unversionedPath, expectedPath);
    fixedCount += 1;
    console.log("[FIXED]", expectedPath);
  }
  return fixedCount;
}

function ensureVersionedStringImportPackFiles(outputDir) {
  var configFiles = [];
  collectAssetConfigFiles(path.join(outputDir, "assets"), configFiles);
  collectAssetConfigFiles(path.join(outputDir, "subpackages"), configFiles);
  if (configFiles.length === 0) {
    throw new Error("No asset config files found in WeChat build output: " + outputDir);
  }

  var fixedCount = 0;
  configFiles.forEach(function (configPath) {
    fixedCount += ensureVersionedStringImportPackFilesForConfig(configPath);
  });
  console.log("[CHECKED] WeChat asset import pack file versions, fixed=" + fixedCount);
  return fixedCount;
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

function ensurePreloadSubpackages(gameJson) {
  if (!gameJson || typeof gameJson !== "object" || Array.isArray(gameJson)) {
    throw new Error("game.json must be an object when configuring preloadSubpackages.");
  }
  if (!Array.isArray(gameJson.subpackages)) {
    throw new Error("game.json subpackages must be an array to configure preloadSubpackages.");
  }

  var availableNames = {};
  gameJson.subpackages.forEach(function (entry, index) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("game.json subpackages[" + index + "] must be an object.");
    }
    if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
      throw new Error("game.json subpackages[" + index + "] requires name.");
    }
    availableNames[entry.name] = true;
  });

  gameJson.preloadSubpackages = STARTUP_PRELOAD_SUBPACKAGE_NAMES.map(function (name) {
    if (!availableNames[name]) {
      throw new Error("Startup preload subpackage `" + name + "` is missing from game.json subpackages.");
    }
    return {
      name: name
    };
  });
}

function patchGameJsonStartupPreload(outputDir) {
  var gameJsonPath = path.join(outputDir, GAME_JSON_FILE);
  if (!fs.existsSync(gameJsonPath)) {
    throw new Error("Missing " + GAME_JSON_FILE + " in " + outputDir);
  }

  var gameJson = tryParseJson(readUtf8(gameJsonPath));
  if (!gameJson) {
    throw new Error("Cannot parse " + GAME_JSON_FILE + " in " + outputDir);
  }

  ensurePreloadSubpackages(gameJson);
  writeJson(gameJsonPath, gameJson);
  console.log("[FIXED]", gameJsonPath, "preloadSubpackages=" + STARTUP_PRELOAD_SUBPACKAGE_NAMES.join(","));
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
  ensureVersionedStringImportPackFiles(resolvedOutputDir);
  assertReleaseSeparateEngine(resolvedOutputDir);
  patchGameJsonStartupPreload(resolvedOutputDir);
  wechatMinigameLoadingPatch.patchWeChatMinigameLoading(resolvedOutputDir, DEFAULT_PROJECT_DIR);
  console.log("[CHECKED] WeChat separate engine plugin is enabled");
  removeDirectoryIfExists(targetCloudFunctionsDir);
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
  fixWeChatProjectConfig: fixWeChatProjectConfig,
  patchGameJsonStartupPreload: patchGameJsonStartupPreload,
  ensurePreloadSubpackages: ensurePreloadSubpackages,
  ensureVersionedStringImportPackFiles: ensureVersionedStringImportPackFiles
};
