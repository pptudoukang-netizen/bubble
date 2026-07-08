"use strict";

var fs = require("fs");
var path = require("path");

var BUNDLE_MARKER = "[wechat-gameplay-code-bundle]";
var OLD_SPLIT_MARKER = "[wechat-main-index-split]";
var GAMEPLAY_SOURCE_DIR = "gameplay-src";
var LAZY_GAMEPLAY_RELATIVE_PATH = path.join("src", "lazy-gameplay-code.js");
var RUNTIME_RESOURCE_RELATIVE_PATH = path.join("assets", "resources", "generated", "lazy-gameplay-code.json");
var RUNTIME_RESOURCE_META_RELATIVE_PATH = RUNTIME_RESOURCE_RELATIVE_PATH + ".meta";
var GAME_JS_FILE = "game.js";
var MAIN_JS_FILE = "main.js";
var RUNTIME_RESOURCE_UUID = "f93b3df4-2c67-4a5d-a3b8-4d4370cf4a71";

var REQUIRED_GAMEPLAY_MODULES = [
  "AdRevivePolicy",
  "BaseSystem",
  "BoardViewportConfig",
  "BoardViewportSystem",
  "BubbleGrid",
  "BubbleShatterRenderer",
  "EliminationSequenceBuilder",
  "FairyAssistConfig",
  "FairyAssistSystem",
  "FallingMarbleSystem",
  "FallingRulesDefaults",
  "GameManager",
  "GameManagerShotResolutionMethods",
  "JarCollectorSystem",
  "JarScoreConfig",
  "LevelRenderer",
  "LevelRendererFairyMethods",
  "LevelRendererSceneBoardMethods",
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

function buildLazyBundleText(sourceRoot) {
  var normalizedSourceRoot = normalizePath(sourceRoot);
  var modulesById = buildModuleIndex(normalizedSourceRoot);
  var moduleTable = buildModuleTable(normalizedSourceRoot, modulesById);

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
    "    runtimeGlobal.__require = lazyRequire;",
    "    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "  }",
    "  if (typeof window !== \"undefined\" && window) {",
    "    window.__require = lazyRequire;",
    "    window.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    window.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "  }",
    "  if (typeof GameGlobal !== \"undefined\" && GameGlobal) {",
    "    GameGlobal.__require = lazyRequire;",
    "    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "  }",
    "  if (typeof globalThis !== \"undefined\" && globalThis) {",
    "    globalThis.__require = lazyRequire;",
    "    globalThis.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;",
    "    globalThis.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function writeRuntimeResource(projectRoot, bundleText) {
  var resourcePath = path.join(projectRoot, RUNTIME_RESOURCE_RELATIVE_PATH);
  var metaPath = path.join(projectRoot, RUNTIME_RESOURCE_META_RELATIVE_PATH);
  var resourcePayload = {
    code: bundleText
  };
  var metaPayload = {
    ver: "1.0.2",
    uuid: RUNTIME_RESOURCE_UUID,
    importer: "json",
    subMetas: {}
  };
  writeUtf8(resourcePath, JSON.stringify(resourcePayload) + "\n");
  writeUtf8(metaPath, JSON.stringify(metaPayload, null, 2) + "\n");
  return resourcePath;
}

function createGameJsPathMarker() {
  return [
    "// " + BUNDLE_MARKER,
    "if (typeof GameGlobal !== \"undefined\" && GameGlobal) {",
    "  GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PREPARED__ = true;",
    "}",
    ""
  ].join("\n");
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

function patchGameJs(buildOutputDir) {
  var gameJsPath = path.join(buildOutputDir, GAME_JS_FILE);
  assertFile(gameJsPath);

  var text = stripExistingGameJsMarker(readUtf8(gameJsPath));
  var insertionPoint = text.indexOf("function loadGame()");
  if (insertionPoint < 0) {
    throw new Error("Cannot locate loadGame entry in game.js: " + gameJsPath);
  }

  var updatedText = [
    text.slice(0, insertionPoint),
    createGameJsPathMarker(),
    text.slice(insertionPoint)
  ].join("");
  writeUtf8(gameJsPath, updatedText);
}

function createMainJsLazyLoaderBlock() {
  return [
    "        // " + BUNDLE_MARKER,
    "        if (typeof __require !== 'function') {",
    "          throw new Error('Cocos module loader is required before lazy gameplay code.');",
    "        }",
    "        if (typeof GameGlobal !== 'undefined' && GameGlobal) {",
    "          GameGlobal.__BUBBLE_COCOS_REQUIRE__ = __require;",
    "        }",
    "        if (typeof window !== 'undefined' && window) {",
    "          window.__BUBBLE_COCOS_REQUIRE__ = __require;",
    "        }",
    "        if (typeof globalThis !== 'undefined' && globalThis) {",
    "          globalThis.__BUBBLE_COCOS_REQUIRE__ = __require;",
    "        }",
    "        require('./src/lazy-gameplay-code.js');",
    "        var lazyRuntimeGlobal = typeof GameGlobal !== 'undefined' && GameGlobal ? GameGlobal : (typeof window !== 'undefined' ? window : null);",
    "        if (!lazyRuntimeGlobal || lazyRuntimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ !== true) {",
    "          throw new Error('Lazy gameplay code did not finish loading.');",
    "        }",
    ""
  ].join("\n");
}

function stripExistingMainJsLazyLoader(text) {
  var marker = "        // " + BUNDLE_MARKER;
  var markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return text;
  }
  var runIndex = text.indexOf("        if (GameGlobal.LoadingManager", markerIndex);
  if (runIndex < 0) {
    throw new Error("Cannot strip existing lazy gameplay loader block from main.js.");
  }
  return text.slice(0, markerIndex) + text.slice(runIndex);
}

function patchMainJs(buildOutputDir) {
  var mainJsPath = path.join(buildOutputDir, MAIN_JS_FILE);
  assertFile(mainJsPath);

  var text = stripExistingMainJsLazyLoader(readUtf8(mainJsPath));
  var insertionTarget = "        // [wechat-minigame-loading-patch] destroy shared canvas cover before engine run";
  var insertionPoint = text.indexOf(insertionTarget);
  if (insertionPoint < 0) {
    throw new Error("Cannot locate engine run hook in main.js: " + mainJsPath);
  }

  var updatedText = [
    text.slice(0, insertionPoint),
    createMainJsLazyLoaderBlock(),
    text.slice(insertionPoint)
  ].join("");
  writeUtf8(mainJsPath, updatedText);
}

function buildWeChatGameplayCode(buildOutputDir, projectRoot) {
  var normalizedProjectRoot = normalizePath(projectRoot || process.cwd());
  var normalizedBuildOutputDir = normalizePath(buildOutputDir || path.join(normalizedProjectRoot, "build", "wechatgame"));
  var sourceRoot = path.join(normalizedProjectRoot, GAMEPLAY_SOURCE_DIR);
  var outputPath = path.join(normalizedBuildOutputDir, LAZY_GAMEPLAY_RELATIVE_PATH);

  var bundleText = buildLazyBundleText(sourceRoot);
  var runtimeResourcePath = writeRuntimeResource(normalizedProjectRoot, bundleText);
  writeUtf8(outputPath, bundleText);
  patchGameJs(normalizedBuildOutputDir);
  patchMainJs(normalizedBuildOutputDir);

  return {
    sourceRoot: sourceRoot,
    outputPath: outputPath,
    runtimeResourcePath: runtimeResourcePath,
    gameJsPath: path.join(normalizedBuildOutputDir, GAME_JS_FILE),
    mainJsPath: path.join(normalizedBuildOutputDir, MAIN_JS_FILE),
    moduleCount: Object.keys(buildModuleIndex(sourceRoot)).length
  };
}

if (require.main === module) {
  var result = buildWeChatGameplayCode(process.argv[2], process.argv[3]);
  console.log("Built WeChat gameplay code bundle: " + result.outputPath);
  console.log("Patched WeChat main lazy gameplay loader: " + result.mainJsPath);
  console.log("Built runtime gameplay code resource: " + result.runtimeResourcePath);
  console.log("Gameplay module count: " + result.moduleCount);
}

module.exports = {
  buildWeChatGameplayCode: buildWeChatGameplayCode,
  buildLazyBundleText: buildLazyBundleText
};
