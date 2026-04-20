"use strict";

var STORAGE_KEY = "bubble_route_editor_config_v1";
var FILE_NAME = "route-editor-routes.json";
var FILE_DIR = "bubble_route_editor";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function padLevelId(levelId) {
  return ("000" + Math.max(0, Math.floor(Number(levelId) || 0))).slice(-3);
}

function resolveLevelKey(levelId, levelCode) {
  if (typeof levelCode === "string" && levelCode) {
    return levelCode;
  }

  return "level_" + padLevelId(levelId);
}

function toSafeNumber(value) {
  var parsed = Number(value);
  if (!isFinite(parsed)) {
    return 0;
  }

  return Math.round(parsed);
}

function normalizePoint(point) {
  return {
    x: toSafeNumber(point && point.x),
    y: toSafeNumber(point && point.y)
  };
}

function normalizeRoute(route, index) {
  var routeIndex = Math.max(0, index);
  var points = Array.isArray(route && route.points)
    ? route.points.map(normalizePoint)
    : [];

  return {
    id: route && typeof route.id === "string" && route.id
      ? route.id
      : "route_" + (routeIndex + 1),
    name: route && typeof route.name === "string" && route.name
      ? route.name
      : "Route " + (routeIndex + 1),
    points: points
  };
}

function createDefaultConfig() {
  return {
    version: 1,
    coordinateSpace: "canvas_local_ar",
    updatedAt: "",
    levels: {}
  };
}

function normalizeConfig(raw) {
  var defaults = createDefaultConfig();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  var levels = raw.levels && typeof raw.levels === "object" ? raw.levels : {};
  var normalized = {
    version: 1,
    coordinateSpace: "canvas_local_ar",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    levels: {}
  };

  Object.keys(levels).forEach(function (levelKey) {
    var entry = levels[levelKey];
    if (!entry || typeof entry !== "object") {
      return;
    }

    var routes = Array.isArray(entry.routes) ? entry.routes.map(normalizeRoute) : [];
    normalized.levels[levelKey] = {
      levelId: Math.max(0, Math.floor(Number(entry.levelId) || 0)),
      levelCode: resolveLevelKey(entry.levelId, entry.levelCode || levelKey),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      routes: routes
    };
  });

  return normalized;
}

function tryParseConfig(text) {
  if (!text) {
    return createDefaultConfig();
  }

  try {
    return normalizeConfig(JSON.parse(text));
  } catch (error) {
    return createDefaultConfig();
  }
}

function getNativeWritableFilePath() {
  if (typeof jsb === "undefined" || !jsb || !jsb.fileUtils) {
    return null;
  }

  var rootPath = jsb.fileUtils.getWritablePath();
  if (!rootPath) {
    return null;
  }

  var normalizedRoot = /[\\\/]$/.test(rootPath) ? rootPath : (rootPath + "/");
  return normalizedRoot + FILE_DIR + "/" + FILE_NAME;
}

function getNativeWritableDir() {
  var filePath = getNativeWritableFilePath();
  if (!filePath) {
    return null;
  }

  return filePath.slice(0, filePath.length - FILE_NAME.length).replace(/[\\\/]$/, "");
}

function saveByBrowserDownload(text) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return null;
  }

  var link = document.createElement("a");
  var blob = new Blob([text], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.download = FILE_NAME;
  if (typeof link.click !== "function") {
    URL.revokeObjectURL(url);
    return null;
  }

  link.click();
  URL.revokeObjectURL(url);
  return FILE_NAME;
}

function RouteConfigStore() {}

RouteConfigStore.prototype.load = function () {
  var nativePath = getNativeWritableFilePath();
  if (nativePath && jsb.fileUtils.isFileExist(nativePath)) {
    return tryParseConfig(jsb.fileUtils.getStringFromFile(nativePath));
  }

  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (!storage) {
      return createDefaultConfig();
    }

    return tryParseConfig(storage.getItem(STORAGE_KEY));
  } catch (error) {
    return createDefaultConfig();
  }
};

RouteConfigStore.prototype.save = function (config, options) {
  var normalized = normalizeConfig(config);
  normalized.updatedAt = new Date().toISOString();
  var text = JSON.stringify(normalized, null, 2);
  var result = {
    storageType: "memory",
    path: null
  };
  var allowBrowserDownload = !!(options && options.allowBrowserDownload);

  var nativePath = getNativeWritableFilePath();
  var nativeDir = getNativeWritableDir();
  if (nativePath && nativeDir) {
    try {
      jsb.fileUtils.createDirectory(nativeDir);
      if (jsb.fileUtils.writeStringToFile(text, nativePath)) {
        result.storageType = "native_file";
        result.path = nativePath;
      }
    } catch (error) {
      result.storageType = "memory";
      result.path = null;
    }
  }

  if (!result.path && allowBrowserDownload) {
    try {
      var downloadName = saveByBrowserDownload(text);
      if (downloadName) {
        result.storageType = "browser_download";
        result.path = downloadName;
      }
    } catch (error) {
      result.storageType = "memory";
      result.path = null;
    }
  }

  try {
    var storage = cc && cc.sys && cc.sys.localStorage ? cc.sys.localStorage : null;
    if (storage) {
      storage.setItem(STORAGE_KEY, text);
      if (!result.path) {
        result.storageType = "local_storage";
        result.path = STORAGE_KEY;
      }
    }
  } catch (error) {
    // Ignore local storage failures.
  }

  return {
    config: normalized,
    saveResult: result
  };
};

RouteConfigStore.prototype.getRoutesForLevel = function (config, levelId, levelCode) {
  var normalized = normalizeConfig(config);
  var levelKey = resolveLevelKey(levelId, levelCode);
  var entry = normalized.levels[levelKey];
  if (!entry) {
    return [];
  }

  return clone(entry.routes || []);
};

RouteConfigStore.prototype.upsertLevelRoutes = function (config, levelId, levelCode, routes) {
  var normalized = normalizeConfig(config);
  var levelKey = resolveLevelKey(levelId, levelCode);
  normalized.levels[levelKey] = {
    levelId: Math.max(0, Math.floor(Number(levelId) || 0)),
    levelCode: levelKey,
    updatedAt: new Date().toISOString(),
    routes: Array.isArray(routes) ? routes.map(normalizeRoute) : []
  };
  normalized.updatedAt = new Date().toISOString();
  return clone(normalized);
};

RouteConfigStore.prototype.describeTarget = function () {
  var nativePath = getNativeWritableFilePath();
  if (nativePath) {
    return {
      storageType: "native_file",
      path: nativePath
    };
  }

  return {
    storageType: "local_storage",
    path: STORAGE_KEY
  };
};

module.exports = RouteConfigStore;
