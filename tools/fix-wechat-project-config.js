"use strict";

var fs = require("fs");
var path = require("path");

var DEFAULT_OUTPUT_DIR = path.resolve(__dirname, "../build/wechatgame");
var MAIN_CONFIG_FILE = "project.config.json";
var PRIVATE_CONFIG_FILE = "project.private.config.json";
var MAIN_DEFAULT_LIB_VERSION = "widelyUsed";
var PRIVATE_DEFAULT_LIB_VERSION = "widelyUsed";
var DEFAULT_DESCRIPTION = "Project configuration file.";

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

  if (typeof config.description !== "string" || !config.description.trim()) {
    config.description = DEFAULT_DESCRIPTION;
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

  if (!fs.existsSync(mainConfigPath)) {
    throw new Error("Missing " + MAIN_CONFIG_FILE + " in " + resolvedOutputDir);
  }

  var mainConfig = loadMainConfig(mainConfigPath);
  ensureDescription(mainConfig);
  ensureLibVersionString(mainConfig, MAIN_DEFAULT_LIB_VERSION);
  writeJson(mainConfigPath, mainConfig);
  console.log("[FIXED]", mainConfigPath);

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
