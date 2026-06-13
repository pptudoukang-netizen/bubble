"use strict";

var fs = require("fs");
var path = require("path");

var PATCH_MARKER = "[wechat-minigame-loading-patch]";
var MINIGAME_LOADING_PLUGIN_NAME = "MinigameLoading";
var MINIGAME_LOADING_PROVIDER = "wxbd990766293b9dc4";
var MINIGAME_LOADING_VERSION = "latest";
var LOADING_COVER_RELATIVE_PATH = "images/loading_bg.jpg";
var LOADING_COVER_DESIGN_WIDTH = 720;
var LOADING_COVER_DESIGN_HEIGHT = 1280;
var LOADING_COVER_SOURCE_PARTS = ["assets", "loading", "loading_bg.jpg"];
var GAME_JS_FILE = "game.js";
var MAIN_JS_FILE = "main.js";
var GAME_JSON_FILE = "game.json";

function readUtf8(filePath) {
  var text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function writeUtf8(filePath, text) {
  fs.writeFileSync(filePath, text, "utf8");
}

function assertExistingFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("Required file is missing: " + filePath);
  }
}

function resolveLoadingCoverSourcePath(projectRoot) {
  var sourcePath = path.join(projectRoot, LOADING_COVER_SOURCE_PARTS[0], LOADING_COVER_SOURCE_PARTS[1], LOADING_COVER_SOURCE_PARTS[2]);
  assertExistingFile(sourcePath);
  return sourcePath;
}

function ensureMinigameLoadingPlugin(gameJson) {
  if (!gameJson || typeof gameJson !== "object" || Array.isArray(gameJson)) {
    throw new Error("game.json must be an object when configuring MinigameLoading plugin.");
  }

  if (!gameJson.plugins || typeof gameJson.plugins !== "object" || Array.isArray(gameJson.plugins)) {
    gameJson.plugins = {};
  }

  gameJson.plugins[MINIGAME_LOADING_PLUGIN_NAME] = {
    version: MINIGAME_LOADING_VERSION,
    provider: MINIGAME_LOADING_PROVIDER,
    contexts: [{
      type: "isolatedContext"
    }]
  };
}

function copyLoadingCoverImage(outputDir, projectRoot) {
  var sourcePath = resolveLoadingCoverSourcePath(projectRoot);
  var targetPath = path.join(outputDir, LOADING_COVER_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function buildGameJsBootSnippet() {
  return [
    "// " + PATCH_MARKER,
    "function compareVersion(v1, v2) {",
    "  v1 = v1.split(\".\");",
    "  v2 = v2.split(\".\");",
    "  var len = Math.max(v1.length, v2.length);",
    "  while (v1.length < len) {",
    "    v1.push(\"0\");",
    "  }",
    "  while (v2.length < len) {",
    "    v2.push(\"0\");",
    "  }",
    "  for (var i = 0; i < len; i++) {",
    "    var num1 = parseInt(v1[i], 10);",
    "    var num2 = parseInt(v2[i], 10);",
    "    if (num1 > num2) {",
    "      return 1;",
    "    }",
    "    if (num1 < num2) {",
    "      return -1;",
    "    }",
    "  }",
    "  return 0;",
    "}",
    "",
    "if (compareVersion(wx.getSystemInfoSync().SDKVersion, \"2.1.0\") > -1) {",
    "  GameGlobal.LoadingManager = requirePlugin(\"" + MINIGAME_LOADING_PLUGIN_NAME + "\", {",
    "    customEnv: {",
    "      wx: wx,",
    "      canvas: GameGlobal.canvas",
    "    }",
    "  }).default;",
    "  GameGlobal.LoadingManager.create({",
    "    images: [{",
    "      src: \"" + LOADING_COVER_RELATIVE_PATH + "\"",
    "    }],",
    "    designWidth: " + LOADING_COVER_DESIGN_WIDTH + ",",
    "    designHeight: " + LOADING_COVER_DESIGN_HEIGHT + ",",
    "    contextType: \"webgl\",",
    "    scaleMode: GameGlobal.LoadingManager.ScaleMode.NO_BORDER,",
    "    contextAttributes: {",
    "      alpha: false,",
    "      antialias: false,",
    "      depth: true,",
    "      desynchronized: false,",
    "      failIfMajorPerformanceCaveat: false,",
    "      powerPreference: \"default\",",
    "      premultipliedAlpha: true,",
    "      preserveDrawingBuffer: false,",
    "      stencil: true,",
    "      xrCompatible: false",
    "    }",
    "  }).then(function () {",
    "    console.log(\"MinigameLoading cover displayed.\");",
    "  });",
    "  loadGame();",
    "} else {",
    "  loadGame();",
    "}"
  ].join("\n");
}

function wrapFlatGameBootBlock(originalText) {
  if (originalText.indexOf("requirePlugin('cocos')") < 0 && originalText.indexOf('requirePlugin("cocos")') < 0) {
    throw new Error("game.js is missing Cocos engine bootstrap via requirePlugin('cocos').");
  }
  if (originalText.indexOf("window.boot();") < 0) {
    throw new Error("game.js is missing window.boot() invocation.");
  }

  var engineBootPattern = /(requirePlugin\((['"])cocos\2\)[\s\S]*?window\.boot\(\);)/;
  var match = originalText.match(engineBootPattern);
  if (!match) {
    throw new Error("game.js engine bootstrap block does not match expected Cocos Creator layout.");
  }

  var wrappedBlock = "function loadGame() {\n" + match[1] + "\n}";
  var patchedText = originalText.replace(engineBootPattern, wrappedBlock);
  if (patchedText.indexOf("function loadGame") < 0) {
    throw new Error("Failed to wrap game.js engine bootstrap in loadGame().");
  }
  return patchedText + "\n\n" + buildGameJsBootSnippet() + "\n";
}

function patchGameJs(gameJsPath) {
  assertExistingFile(gameJsPath);
  var originalText = readUtf8(gameJsPath);
  if (originalText.indexOf(PATCH_MARKER) >= 0) {
    return false;
  }

  var patchedText;
  if (originalText.indexOf("function loadGame") >= 0) {
    if (originalText.indexOf("loadGame();") < 0) {
      throw new Error("game.js is missing top-level loadGame() invocation: " + gameJsPath);
    }
    patchedText = originalText.replace(/loadGame\(\);\s*$/, buildGameJsBootSnippet() + "\n");
    if (patchedText === originalText) {
      throw new Error("Failed to patch game.js boot flow: " + gameJsPath);
    }
  } else {
    patchedText = wrapFlatGameBootBlock(originalText);
  }

  writeUtf8(gameJsPath, patchedText);
  return true;
}

function buildMainCanvasDestroySnippet(indent) {
  var linePrefix = indent;
  return [
    linePrefix + "if (GameGlobal.LoadingManager && GameGlobal.LoadingManager.isMainCanvas) {",
    linePrefix + "  GameGlobal.LoadingManager.destroy().then(function () {",
    linePrefix + "    cc.game.run(option, onStart);",
    linePrefix + "  });",
    linePrefix + "} else {",
    linePrefix + "  cc.game.run(option, onStart);",
    linePrefix + "}"
  ].join("\n");
}

function buildSubCanvasDestroySnippet() {
  return [
    "      // " + PATCH_MARKER + " destroy isolated canvas cover after first scene",
    "      if (GameGlobal.LoadingManager && !GameGlobal.LoadingManager.isMainCanvas) {",
    "        GameGlobal.LoadingManager.destroy();",
    "      }"
  ].join("\n");
}

function patchMainJs(mainJsPath) {
  assertExistingFile(mainJsPath);
  var originalText = readUtf8(mainJsPath);
  if (originalText.indexOf(PATCH_MARKER) >= 0) {
    return false;
  }
  if (originalText.indexOf("cc.game.run(option, onStart);") < 0) {
    throw new Error("main.js is missing cc.game.run(option, onStart): " + mainJsPath);
  }
  if (originalText.indexOf("cc.director.loadScene(launchScene") < 0) {
    throw new Error("main.js is missing launch scene load callback: " + mainJsPath);
  }

  var patchedText = originalText;
  var inlineRunPattern = /if \(!err\) cc\.game\.run\(option, onStart\);/;
  var standaloneRunPattern = /cc\.game\.run\(option, onStart\);/;

  if (inlineRunPattern.test(patchedText)) {
    patchedText = patchedText.replace(
      inlineRunPattern,
      "if (!err) {\n        // " + PATCH_MARKER + " destroy shared canvas cover before engine run\n" +
        buildMainCanvasDestroySnippet("        ") + "\n      }"
    );
  } else if (standaloneRunPattern.test(patchedText)) {
    patchedText = patchedText.replace(
      standaloneRunPattern,
      "// " + PATCH_MARKER + " destroy shared canvas cover before engine run\n" + buildMainCanvasDestroySnippet("      ")
    );
  } else {
    throw new Error("main.js cc.game.run(option, onStart) pattern is unsupported: " + mainJsPath);
  }

  patchedText = patchedText.replace(
    /(cc\.director\.loadScene\(launchScene,\s*null,\s*function\s*\(\)\s*\{[\s\S]*?console\.log\([^\)]*\);)/,
    "$1\n" + buildSubCanvasDestroySnippet()
  );

  if (patchedText === originalText) {
    throw new Error("Failed to patch main.js cover destroy hooks: " + mainJsPath);
  }
  writeUtf8(mainJsPath, patchedText);
  return true;
}

function patchWeChatMinigameLoading(outputDir, projectRoot) {
  var resolvedOutputDir = path.resolve(outputDir);
  var resolvedProjectRoot = projectRoot ? path.resolve(projectRoot) : path.resolve(__dirname, "..");
  var gameJsonPath = path.join(resolvedOutputDir, GAME_JSON_FILE);
  var gameJsPath = path.join(resolvedOutputDir, GAME_JS_FILE);
  var mainJsPath = path.join(resolvedOutputDir, MAIN_JS_FILE);

  assertExistingFile(gameJsonPath);
  assertExistingFile(gameJsPath);
  assertExistingFile(mainJsPath);

  var gameJson = JSON.parse(readUtf8(gameJsonPath));
  ensureMinigameLoadingPlugin(gameJson);
  writeUtf8(gameJsonPath, JSON.stringify(gameJson, null, 4) + "\n");

  var coverImagePath = copyLoadingCoverImage(resolvedOutputDir, resolvedProjectRoot);
  var gameJsPatched = patchGameJs(gameJsPath);
  var mainJsPatched = patchMainJs(mainJsPath);

  return {
    outputDir: resolvedOutputDir,
    coverImagePath: coverImagePath,
    gameJsPatched: gameJsPatched,
    mainJsPatched: mainJsPatched
  };
}

function main() {
  var outputDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(__dirname, "..", "build", "wechatgame");
  var result = patchWeChatMinigameLoading(outputDir);
  console.log("[PATCHED] WeChat MinigameLoading cover plugin in " + result.outputDir);
  console.log("[COVER] " + result.coverImagePath);
  console.log("[GAME.JS] patched=" + result.gameJsPatched);
  console.log("[MAIN.JS] patched=" + result.mainJsPatched);
}

if (require.main === module) {
  main();
}

module.exports = {
  PATCH_MARKER: PATCH_MARKER,
  MINIGAME_LOADING_PLUGIN_NAME: MINIGAME_LOADING_PLUGIN_NAME,
  MINIGAME_LOADING_PROVIDER: MINIGAME_LOADING_PROVIDER,
  LOADING_COVER_RELATIVE_PATH: LOADING_COVER_RELATIVE_PATH,
  ensureMinigameLoadingPlugin: ensureMinigameLoadingPlugin,
  patchGameJs: patchGameJs,
  patchMainJs: patchMainJs,
  patchWeChatMinigameLoading: patchWeChatMinigameLoading
};
