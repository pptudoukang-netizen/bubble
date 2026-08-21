"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var BUNDLE_MARKER = "[wechat-gameplay-code-bundle]";
var OLD_SPLIT_MARKER = "[wechat-main-index-split]";
var GAMEPLAY_SOURCE_DIR = "gameplay-src";
var GAMEPLAY_ASSET_RELATIVE_PATH = path.join("assets", "game", "generated", "lazy-gameplay-code.js");
var GAMEPLAY_ASSET_META_RELATIVE_PATH = GAMEPLAY_ASSET_RELATIVE_PATH + ".meta";
var LEGACY_LAZY_GAMEPLAY_RELATIVE_PATH = path.join("src", "lazy-gameplay-code.js");
var LEGACY_RUNTIME_RESOURCE_RELATIVE_PATH = path.join("assets", "game", "generated", "lazy-gameplay-code.json");
var BUILT_GAMEPLAY_RELATIVE_PATH = path.join("subpackages", "game", "game.js");
var GAME_JS_FILE = "game.js";
var MAIN_JS_FILE = "main.js";
var GAMEPLAY_ASSET_UUID = "f93b3df4-2c67-4a5d-a3b8-4d4370cf4a71";

var REQUIRED_GAMEPLAY_MODULES = [
  "AdRevivePolicy",
  "BaseSystem",
  "BoardViewportConfig",
  "BoardViewportSystem",
  "ColorCloudConfig",
  "ColorCloudSystem",
  "BubbleGrid",
  "BubbleShatterRenderer",
  "EliminationSequenceBuilder",
  "FairyAssistConfig",
  "FairyAssistSystem",
  "FallingMarbleSystem",
  "FallingRulesDefaults",
  "GameManager",
  "GameManagerColorCloudMethods",
  "GameManagerShotResolutionMethods",
  "JarCollectorSystem",
  "JarScoreConfig",
  "LevelRenderer",
  "LevelRendererFairyMethods",
  "LevelRendererSceneBoardMethods",
  "LevelRendererSceneColorCloudMethods",
  "LevelRendererSceneFxMethods",
  "LevelRendererSceneHudMethods",
  "LevelRendererSceneJarMethods",
  "LevelRendererSceneMethods",
  "LevelRendererScenePopupMethods",
  "LevelRendererSceneScaffoldMethods",
  "LevelRendererSceneShared",
  "LevelRendererSceneShooterMethods",
  "MatchSystem",
  "PrefabFactory",
  "ProjectileMath",
  "ShooterController",
  "SpecialAnimationTiming",
  "SupportSystem",
  "TrajectoryPredictor"
];

function readUtf8(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function writeUtf8(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Required file is missing: " + filePath);
  }
}

function assertDirectory(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error("Required directory is missing: " + dirPath);
  }
}

function normalizePath(filePath) {
  return path.resolve(filePath);
}

function moduleIdFromFile(filePath) {
  return path.basename(filePath, ".js");
}

function collectJavaScriptFiles(dirPath) {
  assertDirectory(dirPath);
  var result = [];
  fs.readdirSync(dirPath).forEach(function (entryName) {
    var entryPath = path.join(dirPath, entryName);
    var stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      result = result.concat(collectJavaScriptFiles(entryPath));
      return;
    }
    if (!stat.isFile()) {
      throw new Error("Unsupported gameplay source entry: " + entryPath);
    }
    if (path.extname(entryPath) === ".js") {
      result.push(entryPath);
    }
  });
  return result.sort();
}

function buildModuleIndex(sourceRoot) {
  var files = collectJavaScriptFiles(sourceRoot);
  if (files.length === 0) {
    throw new Error("Gameplay source directory contains no JavaScript files: " + sourceRoot);
  }

  var modulesById = {};
  files.forEach(function (filePath) {
    var moduleId = moduleIdFromFile(filePath);
    if (Object.prototype.hasOwnProperty.call(modulesById, moduleId)) {
      throw new Error("Duplicate gameplay module id: " + moduleId);
    }
    modulesById[moduleId] = {
      id: moduleId,
      filePath: filePath,
      text: readUtf8(filePath)
    };
  });

  REQUIRED_GAMEPLAY_MODULES.forEach(function (moduleId) {
    if (!modulesById[moduleId]) {
      throw new Error("Required gameplay source module is missing: " + moduleId);
    }
  });

  return modulesById;
}

function resolveJavaScriptFile(request, fromFilePath) {
  var resolvedPath = path.resolve(path.dirname(fromFilePath), request);
  if (path.extname(resolvedPath) !== ".js") {
    resolvedPath += ".js";
  }
  assertFile(resolvedPath);
  return normalizePath(resolvedPath);
}

function isChildPath(parentPath, childPath) {
  var relative = path.relative(parentPath, childPath);
  return relative === "" || (relative.indexOf("..") !== 0 && !path.isAbsolute(relative));
}

function resolveDependencyModuleId(request, fromFilePath, sourceRoot, modulesByPath) {
  if (request.charAt(0) !== ".") {
    return request;
  }

  var resolvedPath = resolveJavaScriptFile(request, fromFilePath);
  if (isChildPath(sourceRoot, resolvedPath)) {
    if (!modulesByPath[resolvedPath]) {
      throw new Error("Gameplay dependency is inside source root but missing from module index: " + resolvedPath);
    }
    return modulesByPath[resolvedPath].id;
  }

  return moduleIdFromFile(resolvedPath);
}

function findRequireRequests(sourceText) {
  var requests = [];
  var staticRequirePattern = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  var match = staticRequirePattern.exec(sourceText);
  while (match) {
    requests.push(match[1]);
    match = staticRequirePattern.exec(sourceText);
  }
  return requests;
}

function buildDependencyMap(moduleEntry, sourceRoot, modulesByPath) {
  var dependencyMap = {};
  findRequireRequests(moduleEntry.text).forEach(function (request) {
    dependencyMap[request] = resolveDependencyModuleId(request, moduleEntry.filePath, sourceRoot, modulesByPath);
  });
  return dependencyMap;
}

function buildModuleTable(sourceRoot, modulesById) {
  var modulesByPath = {};
  Object.keys(modulesById).forEach(function (moduleId) {
    modulesByPath[normalizePath(modulesById[moduleId].filePath)] = modulesById[moduleId];
  });

  return Object.keys(modulesById).sort().map(function (moduleId) {
    var moduleEntry = modulesById[moduleId];
    var dependencyMap = buildDependencyMap(moduleEntry, sourceRoot, modulesByPath);
    return [
      JSON.stringify(moduleId),
      ":[function(require,module,exports){\n",
      moduleEntry.text,
      "\n},",
      JSON.stringify(dependencyMap),
      "]"
    ].join("");
  }).join(",\n");
}

function buildGameplaySourceHash(modulesById) {
  var hash = crypto.createHash("sha256");
  Object.keys(modulesById).sort().forEach(function (moduleId) {
    hash.update(moduleId, "utf8");
    hash.update("\u0000", "utf8");
    hash.update(modulesById[moduleId].text, "utf8");
    hash.update("\u0000", "utf8");
  });
  return hash.digest("hex");
}

function buildLazyBundleText(sourceRoot) {
  var normalizedSourceRoot = normalizePath(sourceRoot);
  var modulesById = buildModuleIndex(normalizedSourceRoot);
  var moduleTable = buildModuleTable(normalizedSourceRoot, modulesById);
  var gameplaySourceHash = buildGameplaySourceHash(modulesById);

  return [
    "// " + BUNDLE_MARKER,
    "(function () {",
    "  var runtimeGlobal = null;",
    "  if (typeof GameGlobal !== \"undefined\" && GameGlobal) {",
    "    runtimeGlobal = GameGlobal;",
    "  } else if (typeof window !== \"undefined\" && window) {",
    "    runtimeGlobal = window;",
    "  } else if (typeof globalThis !== \"undefined\" && globalThis) {",
    "    runtimeGlobal = globalThis;",
    "  }",
    "  var runtimeGlobals = [];",
    "  function rememberRuntimeGlobal(candidate) {",
    "    if (candidate && runtimeGlobals.indexOf(candidate) < 0) {",
    "      runtimeGlobals.push(candidate);",
    "    }",
    "  }",
    "  if (runtimeGlobal) {",
    "    rememberRuntimeGlobal(runtimeGlobal);",
    "  }",
    "  if (typeof GameGlobal !== \"undefined\") {",
    "    rememberRuntimeGlobal(GameGlobal);",
    "  }",
    "  if (typeof window !== \"undefined\") {",
    "    rememberRuntimeGlobal(window);",
    "  }",
    "  if (typeof globalThis !== \"undefined\") {",
    "    rememberRuntimeGlobal(globalThis);",
    "  }",
    "  function resolvePreviousRequire() {",
    "    for (var index = 0; index < runtimeGlobals.length; index += 1) {",
    "      if (runtimeGlobals[index] && typeof runtimeGlobals[index].__BUBBLE_COCOS_REQUIRE__ === \"function\") {",
    "        return runtimeGlobals[index].__BUBBLE_COCOS_REQUIRE__;",
    "      }",
    "    }",
    "    if (typeof __require === \"function\") {",
    "      return __require;",
    "    }",
    "    for (var requireIndex = 0; requireIndex < runtimeGlobals.length; requireIndex += 1) {",
    "      if (runtimeGlobals[requireIndex] && typeof runtimeGlobals[requireIndex].__require === \"function\") {",
    "        return runtimeGlobals[requireIndex].__require;",
    "      }",
    "    }",
    "    return null;",
    "  }",
    "  var previousRequire = resolvePreviousRequire();",
    "  var gameplayCodeHash = " + JSON.stringify(gameplaySourceHash) + ";",
    "  var lazyRequire = (function (modules, cache, entries) {",
    "    function load(moduleId, jumped) {",
    "      if (!cache[moduleId]) {",
    "        if (!modules[moduleId]) {",
    "          var tail = String(moduleId).split(\"/\").pop();",
    "          if (modules[tail]) {",
    "            moduleId = tail;",
    "          } else {",
    "            if (!jumped && previousRequire) {",
    "              return previousRequire(tail, true);",
    "            }",
    "            throw new Error(\"Cannot find gameplay module '\" + moduleId + \"'\");",
    "          }",
    "        }",
    "        var module = cache[moduleId] = { exports: {} };",
    "        modules[moduleId][0].call(module.exports, function (request) {",
    "          var dependencyMap = modules[moduleId][1];",
    "          var mapped = Object.prototype.hasOwnProperty.call(dependencyMap, request) ? dependencyMap[request] : request;",
    "          return load(mapped);",
    "        }, module, module.exports);",
    "      }",
    "      return cache[moduleId].exports;",
    "    }",
    "    for (var index = 0; index < entries.length; index += 1) {",
    "      load(entries[index]);",
    "    }",
    "    return load;",
    "  })({",
    moduleTable,
    "  }, {}, []);",
    "  if (runtimeGlobal) {",
    "    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;",
    "  }",
    "  if (typeof window !== \"undefined\" && window) {",
    "    window.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    window.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "    window.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;",
    "  }",
    "  if (typeof GameGlobal !== \"undefined\" && GameGlobal) {",
    "    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;",
    "  }",
    "  if (typeof globalThis !== \"undefined\" && globalThis) {",
    "    globalThis.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    globalThis.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "    globalThis.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    if (!fs.statSync(filePath).isFile()) {
      throw new Error("Expected removable legacy path to be a file: " + filePath);
    }
    fs.unlinkSync(filePath);
  }
}

function writeGameplayAsset(projectRoot, bundleText) {
  var assetPath = path.join(projectRoot, GAMEPLAY_ASSET_RELATIVE_PATH);
  var metaPath = path.join(projectRoot, GAMEPLAY_ASSET_META_RELATIVE_PATH);
  var metaPayload = {
    ver: "1.1.0",
    uuid: GAMEPLAY_ASSET_UUID,
    importer: "javascript",
    isPlugin: false,
    loadPluginInWeb: true,
    loadPluginInNative: true,
    loadPluginInEditor: false,
    subMetas: {}
  };
  writeUtf8(assetPath, bundleText);
  writeUtf8(metaPath, JSON.stringify(metaPayload, null, 2) + "\n");
  removeFileIfExists(path.join(projectRoot, LEGACY_RUNTIME_RESOURCE_RELATIVE_PATH));
  removeFileIfExists(path.join(projectRoot, LEGACY_RUNTIME_RESOURCE_RELATIVE_PATH + ".meta"));
  return assetPath;
}

function stripExistingGameJsMarker(text) {
  var loadGameIndex = text.indexOf("function loadGame()");
  if (loadGameIndex < 0) {
    return text;
  }
  var prefix = text.slice(0, loadGameIndex);
  var markerIndex = prefix.indexOf("// " + BUNDLE_MARKER);
  var oldMarkerIndex = prefix.indexOf("// " + OLD_SPLIT_MARKER);
  if (markerIndex < 0 || (oldMarkerIndex >= 0 && oldMarkerIndex < markerIndex)) {
    markerIndex = oldMarkerIndex;
  }
  if (markerIndex < 0) {
    return text;
  }
  return text.slice(0, markerIndex) + text.slice(loadGameIndex);
}

function stripExistingMainJsLazyLoader(text) {
  var marker = "        // " + BUNDLE_MARKER;
  var markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return text;
  }
  var insertionTarget = "        // [wechat-minigame-loading-patch] destroy shared canvas cover before engine run";
  var insertionPoint = text.indexOf(insertionTarget, markerIndex);
  if (insertionPoint < 0) {
    throw new Error("Cannot strip existing lazy gameplay loader block from main.js.");
  }
  return text.slice(0, markerIndex) + text.slice(insertionPoint);
}

function stripLegacyBuildArtifacts(buildOutputDir) {
  var mainJsPath = path.join(buildOutputDir, MAIN_JS_FILE);
  var gameJsPath = path.join(buildOutputDir, GAME_JS_FILE);
  assertFile(mainJsPath);
  assertFile(gameJsPath);

  var mainText = stripExistingMainJsLazyLoader(readUtf8(mainJsPath));
  if (mainText.indexOf("require('./src/lazy-gameplay-code.js')") >= 0) {
    throw new Error("main.js still synchronously requires legacy gameplay code: " + mainJsPath);
  }
  writeUtf8(mainJsPath, mainText);
  writeUtf8(gameJsPath, stripExistingGameJsMarker(readUtf8(gameJsPath)));
  removeFileIfExists(path.join(buildOutputDir, LEGACY_LAZY_GAMEPLAY_RELATIVE_PATH));
  return {
    mainJsPath: mainJsPath,
    gameJsPath: gameJsPath
  };
}

function resolveGameplayHash(bundleText) {
  var match = bundleText.match(/var gameplayCodeHash = "([a-f0-9]{64})";/);
  if (!match) {
    throw new Error("Generated gameplay code is missing its build hash.");
  }
  return match[1];
}

function generateGameplayCodeAsset(projectRoot) {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new Error("Gameplay code generation requires an explicit project root.");
  }
  var normalizedProjectRoot = normalizePath(projectRoot);
  var sourceRoot = path.join(normalizedProjectRoot, GAMEPLAY_SOURCE_DIR);
  var bundleText = buildLazyBundleText(sourceRoot);
  var assetPath = writeGameplayAsset(normalizedProjectRoot, bundleText);

  return {
    sourceRoot: sourceRoot,
    assetPath: assetPath,
    sourceHash: resolveGameplayHash(bundleText),
    moduleCount: Object.keys(buildModuleIndex(sourceRoot)).length
  };
}

function verifyWeChatGameplayCodeBuild(buildOutputDir, projectRoot) {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new Error("Gameplay build verification requires an explicit project root.");
  }
  if (typeof buildOutputDir !== "string" || buildOutputDir.trim().length === 0) {
    throw new Error("Gameplay build verification requires an explicit build output directory.");
  }
  var normalizedProjectRoot = normalizePath(projectRoot);
  var normalizedBuildOutputDir = normalizePath(buildOutputDir);
  var sourceRoot = path.join(normalizedProjectRoot, GAMEPLAY_SOURCE_DIR);
  var assetPath = path.join(normalizedProjectRoot, GAMEPLAY_ASSET_RELATIVE_PATH);
  assertFile(assetPath);

  var expectedAssetText = buildLazyBundleText(sourceRoot);
  var actualAssetText = readUtf8(assetPath);
  if (actualAssetText !== expectedAssetText) {
    throw new Error("Gameplay code asset is stale. Run `npm run build:wechat-gameplay-code` before rebuilding Cocos.");
  }

  var legacyPaths = stripLegacyBuildArtifacts(normalizedBuildOutputDir);
  var builtGameplayPath = path.join(normalizedBuildOutputDir, BUILT_GAMEPLAY_RELATIVE_PATH);
  assertFile(builtGameplayPath);
  var sourceHash = resolveGameplayHash(expectedAssetText);
  var builtGameplayText = readUtf8(builtGameplayPath);
  if (builtGameplayText.indexOf(sourceHash) < 0) {
    throw new Error("game subpackage does not contain the current gameplay code hash: " + sourceHash);
  }

  return {
    assetPath: assetPath,
    builtGameplayPath: builtGameplayPath,
    mainJsPath: legacyPaths.mainJsPath,
    gameJsPath: legacyPaths.gameJsPath,
    sourceHash: sourceHash,
    moduleCount: Object.keys(buildModuleIndex(sourceRoot)).length
  };
}

if (require.main === module) {
  var result = generateGameplayCodeAsset(process.argv[2] === undefined ? process.cwd() : process.argv[2]);
  console.log("Generated game bundle gameplay asset: " + result.assetPath);
  console.log("Gameplay source hash: " + result.sourceHash);
  console.log("Gameplay module count: " + result.moduleCount);
}

module.exports = {
  generateGameplayCodeAsset: generateGameplayCodeAsset,
  verifyWeChatGameplayCodeBuild: verifyWeChatGameplayCodeBuild,
  buildLazyBundleText: buildLazyBundleText
};
