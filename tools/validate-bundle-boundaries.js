"use strict";

var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var ASSETS_ROOT = path.join(PROJECT_ROOT, "assets");
var SERIALIZED_EXTENSIONS = {
  ".anim": true,
  ".fire": true,
  ".meta": true,
  ".prefab": true
};
var ISOLATED_BUNDLES = {
  game: true,
  map: true,
  ui: true
};
var EXPECTED_BUNDLES = {
  "assets/animation.meta": "animation",
  "assets/audio.meta": "audio",
  "assets/game.meta": "game",
  "assets/map.meta": "map",
  "assets/scripts.meta": "core",
  "assets/ui.meta": "ui"
};
var UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
var IMPLICIT_RESOURCE_PATTERN = /["']((?:image\/(?:ball|jar|genius|props)\/|effects\/|prefabs\/game\/)[^"']+)["']/g;
var EXPLICIT_RESOURCE_PATTERN = /["']((?:game|map|ui)\/[^"']+)["']/g;
var RESOURCE_EXTENSIONS = ["", ".anim", ".effect", ".fnt", ".jpg", ".jpeg", ".json", ".png", ".prefab"];

function toProjectPath(absolutePath) {
  return path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, "/");
}

function walkFiles(directory, output) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
    var absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, output);
      return;
    }
    output.push(absolutePath);
  });
  return output;
}

function resolveOwner(absolutePath) {
  var projectPath = toProjectPath(absolutePath);
  var bundleRoots = ["animation", "audio", "game", "map", "ui"];
  for (var index = 0; index < bundleRoots.length; index += 1) {
    var bundleName = bundleRoots[index];
    if (projectPath.indexOf("assets/" + bundleName + "/") === 0) {
      return bundleName;
    }
  }
  if (projectPath.indexOf("assets/scripts/") === 0) {
    return "core";
  }
  return "main";
}

function readJson(absolutePath) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error("Invalid JSON in " + toProjectPath(absolutePath) + ": " + error.message);
  }
}

function registerUuid(uuidOwners, uuid, absolutePath) {
  if (typeof uuid !== "string" || uuid.length === 0) {
    throw new Error("Asset meta UUID missing: " + toProjectPath(absolutePath));
  }
  var normalizedUuid = uuid.toLowerCase();
  if (uuidOwners[normalizedUuid]) {
    throw new Error(
      "Duplicate asset UUID " + uuid + ": " +
      toProjectPath(uuidOwners[normalizedUuid].absolutePath) + " and " +
      toProjectPath(absolutePath)
    );
  }
  uuidOwners[normalizedUuid] = {
    absolutePath: absolutePath,
    owner: resolveOwner(absolutePath)
  };
}

function buildUuidOwners(assetFiles) {
  var uuidOwners = {};
  assetFiles.filter(function (absolutePath) {
    return path.extname(absolutePath) === ".meta";
  }).forEach(function (absolutePath) {
    var meta = readJson(absolutePath);
    registerUuid(uuidOwners, meta.uuid, absolutePath);
    Object.keys(meta.subMetas || {}).forEach(function (key) {
      registerUuid(uuidOwners, meta.subMetas[key].uuid, absolutePath);
    });
  });
  return uuidOwners;
}

function validateDeclaredBundles() {
  Object.keys(EXPECTED_BUNDLES).forEach(function (projectPath) {
    var meta = readJson(path.join(PROJECT_ROOT, projectPath));
    if (meta.isBundle !== true) {
      throw new Error(projectPath + " must declare isBundle=true.");
    }
    if (meta.bundleName !== EXPECTED_BUNDLES[projectPath]) {
      throw new Error(
        projectPath + " bundleName must be `" + EXPECTED_BUNDLES[projectPath] +
        "`, received `" + meta.bundleName + "`."
      );
    }
  });
}

function validateSerializedBoundaries(assetFiles, uuidOwners) {
  var violations = [];
  assetFiles.filter(function (absolutePath) {
    return SERIALIZED_EXTENSIONS[path.extname(absolutePath)] === true;
  }).forEach(function (absolutePath) {
    var sourceOwner = resolveOwner(absolutePath);
    if (ISOLATED_BUNDLES[sourceOwner] !== true) {
      return;
    }
    var source = fs.readFileSync(absolutePath, "utf8");
    var referencedUuids = source.match(UUID_PATTERN) || [];
    var seen = {};
    referencedUuids.forEach(function (uuid) {
      var normalizedUuid = uuid.toLowerCase();
      if (seen[normalizedUuid] === true) {
        return;
      }
      seen[normalizedUuid] = true;
      var target = uuidOwners[normalizedUuid];
      if (!target || target.owner === sourceOwner) {
        return;
      }
      violations.push(
        sourceOwner + " -> " + target.owner + ": " +
        toProjectPath(absolutePath) + " => " + toProjectPath(target.absolutePath) +
        " (" + normalizedUuid + ")"
      );
    });
  });

  if (violations.length > 0) {
    throw new Error("Cross-bundle serialized references are forbidden:\n" + violations.join("\n"));
  }
}

function validateExplicitResourcePaths() {
  var sourceRoots = [
    path.join(PROJECT_ROOT, "assets", "scripts"),
    path.join(PROJECT_ROOT, "gameplay-src")
  ];
  var violations = [];
  sourceRoots.forEach(function (sourceRoot) {
    walkFiles(sourceRoot, []).filter(function (absolutePath) {
      return path.extname(absolutePath) === ".js" && path.basename(absolutePath) !== "BundleLoader.js";
    }).forEach(function (absolutePath) {
      var source = fs.readFileSync(absolutePath, "utf8");
      var match = IMPLICIT_RESOURCE_PATTERN.exec(source);
      while (match) {
        var line = source.slice(0, match.index).split(/\r?\n/).length;
        violations.push(toProjectPath(absolutePath) + ":" + line + " uses implicit path `" + match[1] + "`");
        match = IMPLICIT_RESOURCE_PATTERN.exec(source);
      }
      IMPLICIT_RESOURCE_PATTERN.lastIndex = 0;
    });
  });
  if (violations.length > 0) {
    throw new Error(
      "Bundle-sensitive resource paths must start with game/, map/, or ui/:\n" + violations.join("\n")
    );
  }
}

function validateExplicitResourceTargets() {
  var sourceFiles = walkFiles(path.join(PROJECT_ROOT, "assets", "scripts"), []).concat(
    walkFiles(path.join(PROJECT_ROOT, "gameplay-src"), [])
  ).filter(function (absolutePath) {
    return path.extname(absolutePath) === ".js";
  });
  var missing = [];
  sourceFiles.forEach(function (absolutePath) {
    var source = fs.readFileSync(absolutePath, "utf8");
    var match = EXPLICIT_RESOURCE_PATTERN.exec(source);
    while (match) {
      var assetBase = path.join(ASSETS_ROOT, match[1]);
      var exists = RESOURCE_EXTENSIONS.some(function (extension) {
        return fs.existsSync(assetBase + extension);
      });
      if (!exists) {
        var line = source.slice(0, match.index).split(/\r?\n/).length;
        missing.push(toProjectPath(absolutePath) + ":" + line + " targets missing asset `" + match[1] + "`");
      }
      match = EXPLICIT_RESOURCE_PATTERN.exec(source);
    }
    EXPLICIT_RESOURCE_PATTERN.lastIndex = 0;
  });
  if (missing.length > 0) {
    throw new Error("Explicit bundle resource targets are missing:\n" + missing.join("\n"));
  }
}

function main() {
  validateDeclaredBundles();
  var assetFiles = walkFiles(ASSETS_ROOT, []);
  var uuidOwners = buildUuidOwners(assetFiles);
  validateSerializedBoundaries(assetFiles, uuidOwners);
  validateExplicitResourcePaths();
  validateExplicitResourceTargets();
  console.log(
    "Bundle boundary validation passed: " +
    Object.keys(uuidOwners).length + " UUIDs, map/game/ui serialized dependencies are isolated."
  );
}

main();
