"use strict";

var LevelConfigLoader = require("./LevelConfigLoader");

var INDEX_VERSION = 1;
var STORAGE_DIRECTORY_NAME = "bubble_level_editor";
var STORAGE_KEY_PREFIX = "bubble_level_editor_v1/";
var INDEX_KEY = "index.json";

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function padLevelId(levelId) {
  return String(requirePositiveInteger(levelId, "Local edited level id")).padStart(3, "0");
}

function buildLevelKey(levelId) {
  return "level_" + padLevelId(levelId);
}

function buildLevelFileKey(levelId) {
  return buildLevelKey(levelId) + ".json";
}

function assertBackend(backend) {
  assertObject(backend, "Local edited level backend");
  ["readText", "writeText", "removeText", "describe"].forEach(function (methodName) {
    if (typeof backend[methodName] !== "function") {
      throw new Error("Local edited level backend requires " + methodName + ".");
    }
  });
  return backend;
}

function resolveWechatPlatform() {
  if (typeof wx !== "undefined" && wx) {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function createWechatFileBackend(platform) {
  if (!platform || typeof platform.getFileSystemManager !== "function") {
    throw new Error("wx.getFileSystemManager is required for local edited levels.");
  }
  if (!platform.env || typeof platform.env.USER_DATA_PATH !== "string" || !platform.env.USER_DATA_PATH) {
    throw new Error("wx.env.USER_DATA_PATH is required for local edited levels.");
  }
  var fs = platform.getFileSystemManager();
  var userDataPath = platform.env.USER_DATA_PATH;
  var rootPath = userDataPath + "/" + STORAGE_DIRECTORY_NAME;

  function ensureRootDirectory() {
    if (
      typeof fs.readdirSync !== "function" ||
      typeof fs.mkdirSync !== "function" ||
      typeof fs.statSync !== "function" ||
      typeof fs.unlinkSync !== "function"
    ) {
      throw new Error("Synchronous WeChat file APIs are required for local edited levels.");
    }
    var rootEntries = fs.readdirSync(userDataPath);
    if (!Array.isArray(rootEntries)) {
      throw new Error("wx file system returned invalid USER_DATA_PATH entries.");
    }
    if (rootEntries.indexOf(STORAGE_DIRECTORY_NAME) === -1) {
      fs.mkdirSync(rootPath);
      return;
    }
    var stat = fs.statSync(rootPath);
    if (!stat || typeof stat.isDirectory !== "function" || stat.isDirectory() !== true) {
      throw new Error("Local edited level path is not a directory: " + rootPath);
    }
  }

  function listRootEntries() {
    ensureRootDirectory();
    var entries = fs.readdirSync(rootPath);
    if (!Array.isArray(entries)) {
      throw new Error("wx file system returned invalid local edited level entries.");
    }
    return entries;
  }

  return {
    readText: function (key) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      if (listRootEntries().indexOf(normalizedKey) === -1) {
        return null;
      }
      var text = fs.readFileSync(rootPath + "/" + normalizedKey, "utf8");
      if (typeof text !== "string" || !text) {
        throw new Error("Local edited level file is empty: " + normalizedKey);
      }
      return text;
    },
    writeText: function (key, text) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      var normalizedText = requireNonEmptyString(text, "Local edited level file text");
      ensureRootDirectory();
      fs.writeFileSync(rootPath + "/" + normalizedKey, normalizedText, "utf8");
    },
    removeText: function (key) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      if (listRootEntries().indexOf(normalizedKey) === -1) {
        return false;
      }
      fs.unlinkSync(rootPath + "/" + normalizedKey);
      return true;
    },
    describe: function () {
      return rootPath;
    }
  };
}

function createJsbFileBackend() {
  if (typeof jsb === "undefined" || !jsb.fileUtils) {
    throw new Error("jsb.fileUtils is required for native local edited levels.");
  }
  var rootPath = jsb.fileUtils.getWritablePath() + STORAGE_DIRECTORY_NAME + "/";
  function ensureRootDirectory() {
    if (!jsb.fileUtils.isDirectoryExist(rootPath) && !jsb.fileUtils.createDirectory(rootPath)) {
      throw new Error("Create local edited level directory failed: " + rootPath);
    }
  }
  return {
    readText: function (key) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      ensureRootDirectory();
      var fullPath = rootPath + normalizedKey;
      if (!jsb.fileUtils.isFileExist(fullPath)) {
        return null;
      }
      var text = jsb.fileUtils.getStringFromFile(fullPath);
      if (typeof text !== "string" || !text) {
        throw new Error("Local edited level file is empty: " + fullPath);
      }
      return text;
    },
    writeText: function (key, text) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      var normalizedText = requireNonEmptyString(text, "Local edited level file text");
      ensureRootDirectory();
      var fullPath = rootPath + normalizedKey;
      if (!jsb.fileUtils.writeStringToFile(normalizedText, fullPath)) {
        throw new Error("Write local edited level file failed: " + fullPath);
      }
    },
    removeText: function (key) {
      var normalizedKey = requireNonEmptyString(key, "Local edited level file key");
      ensureRootDirectory();
      var fullPath = rootPath + normalizedKey;
      if (!jsb.fileUtils.isFileExist(fullPath)) {
        return false;
      }
      if (!jsb.fileUtils.removeFile(fullPath)) {
        throw new Error("Remove local edited level file failed: " + fullPath);
      }
      return true;
    },
    describe: function () {
      return rootPath;
    }
  };
}

function createLocalStorageBackend(storage) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new Error("localStorage is required for browser local edited levels.");
  }
  return {
    readText: function (key) {
      var value = storage.getItem(STORAGE_KEY_PREFIX + requireNonEmptyString(key, "Local edited level storage key"));
      if (value === null) {
        return null;
      }
      if (typeof value !== "string" || !value) {
        throw new Error("Local edited level storage value is empty: " + key);
      }
      return value;
    },
    writeText: function (key, text) {
      storage.setItem(
        STORAGE_KEY_PREFIX + requireNonEmptyString(key, "Local edited level storage key"),
        requireNonEmptyString(text, "Local edited level storage text")
      );
    },
    removeText: function (key) {
      var storageKey = STORAGE_KEY_PREFIX + requireNonEmptyString(key, "Local edited level storage key");
      if (storage.getItem(storageKey) === null) {
        return false;
      }
      storage.removeItem(storageKey);
      return true;
    },
    describe: function () {
      return "localStorage:" + STORAGE_KEY_PREFIX;
    }
  };
}

function createRuntimeBackend() {
  var platform = resolveWechatPlatform();
  if (platform) {
    return createWechatFileBackend(platform);
  }
  if (typeof jsb !== "undefined" && jsb.fileUtils) {
    return createJsbFileBackend();
  }
  if (typeof cc !== "undefined" && cc && cc.sys && cc.sys.localStorage) {
    return createLocalStorageBackend(cc.sys.localStorage);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return createLocalStorageBackend(window.localStorage);
  }
  throw new Error("No supported local edited level storage backend is available.");
}

function parseJson(text, fieldName) {
  if (typeof text !== "string" || !text) {
    throw new Error(fieldName + " JSON text must be non-empty.");
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(fieldName + " JSON is invalid: " + error.message);
  }
}

function normalizeIndex(rawIndex) {
  assertObject(rawIndex, "Local edited level index");
  if (rawIndex.version !== INDEX_VERSION) {
    throw new Error("Local edited level index version must be " + INDEX_VERSION + ".");
  }
  if (!Array.isArray(rawIndex.levels)) {
    throw new Error("Local edited level index levels must be an array.");
  }
  var seen = {};
  var levels = rawIndex.levels.map(function (entry, index) {
    assertObject(entry, "Local edited level index entry " + index);
    var levelId = requirePositiveInteger(entry.levelId, "Local edited level index levelId " + index);
    var updatedAt = requireNonNegativeInteger(entry.updatedAt, "Local edited level index updatedAt " + index);
    if (seen[levelId]) {
      throw new Error("Local edited level index contains duplicate levelId: " + levelId);
    }
    seen[levelId] = true;
    return {
      levelId: levelId,
      updatedAt: updatedAt
    };
  });
  levels.sort(function (left, right) {
    return left.levelId - right.levelId;
  });
  return {
    version: INDEX_VERSION,
    levels: levels
  };
}

function buildPersistedConfig(rawConfig, levelId) {
  var levelKey = buildLevelKey(levelId);
  var normalized = LevelConfigLoader.normalizeLevelConfig(rawConfig, levelKey);
  if (!normalized.level || normalized.level.levelId !== levelId) {
    throw new Error("Local edited level config id mismatch: " + levelId);
  }
  var persisted = clone(normalized);
  if (Object.prototype.hasOwnProperty.call(persisted, "meta")) {
    delete persisted.meta;
  }
  return persisted;
}

function LocalEditedLevelStore(options) {
  var opts = options === undefined ? {} : assertObject(options, "LocalEditedLevelStore options");
  this._backend = assertBackend(opts.backend === undefined ? createRuntimeBackend() : opts.backend);
}

LocalEditedLevelStore.prototype._readIndex = function () {
  var text = this._backend.readText(INDEX_KEY);
  if (text === null) {
    return {
      version: INDEX_VERSION,
      levels: []
    };
  }
  return normalizeIndex(parseJson(text, "Local edited level index"));
};

LocalEditedLevelStore.prototype.listLevelIds = function () {
  return this._readIndex().levels.map(function (entry) {
    return entry.levelId;
  });
};

LocalEditedLevelStore.prototype.hasLevel = function (levelId) {
  var normalizedLevelId = requirePositiveInteger(levelId, "Local edited level id");
  return this._readIndex().levels.some(function (entry) {
    return entry.levelId === normalizedLevelId;
  });
};

LocalEditedLevelStore.prototype.saveLevel = function (rawConfig, explicitUpdatedAt) {
  assertObject(rawConfig, "Local edited level config");
  if (!rawConfig.level) {
    throw new Error("Local edited level config.level is required.");
  }
  var levelId = requirePositiveInteger(rawConfig.level.levelId, "Local edited level config levelId");
  var updatedAt = explicitUpdatedAt === undefined
    ? Date.now()
    : requireNonNegativeInteger(explicitUpdatedAt, "Local edited level updatedAt");
  var persisted = buildPersistedConfig(rawConfig, levelId);
  var index = this._readIndex();
  var found = false;
  index.levels.forEach(function (entry) {
    if (entry.levelId === levelId) {
      entry.updatedAt = updatedAt;
      found = true;
    }
  });
  if (!found) {
    index.levels.push({
      levelId: levelId,
      updatedAt: updatedAt
    });
    index.levels.sort(function (left, right) {
      return left.levelId - right.levelId;
    });
  }
  this._backend.writeText(buildLevelFileKey(levelId), JSON.stringify(persisted, null, 2));
  this._backend.writeText(INDEX_KEY, JSON.stringify(index, null, 2));
  return {
    levelId: levelId,
    updatedAt: updatedAt,
    config: clone(persisted),
    location: this._backend.describe()
  };
};

LocalEditedLevelStore.prototype.loadLevel = function (levelId) {
  var normalizedLevelId = requirePositiveInteger(levelId, "Local edited level id");
  var index = this._readIndex();
  var exists = index.levels.some(function (entry) {
    return entry.levelId === normalizedLevelId;
  });
  if (!exists) {
    throw new Error("Local edited level is not saved: " + normalizedLevelId);
  }
  var text = this._backend.readText(buildLevelFileKey(normalizedLevelId));
  if (text === null) {
    throw new Error("Local edited level index points to a missing file: " + normalizedLevelId);
  }
  return buildPersistedConfig(parseJson(text, "Local edited level " + normalizedLevelId), normalizedLevelId);
};

LocalEditedLevelStore.prototype.loadAllRecords = function () {
  var index = this._readIndex();
  return index.levels.map(function (entry) {
    return {
      levelId: entry.levelId,
      updatedAt: entry.updatedAt,
      config: this.loadLevel(entry.levelId)
    };
  }, this);
};

LocalEditedLevelStore.prototype.clearAll = function () {
  var index = this._readIndex();
  var removedCount = 0;
  index.levels.forEach(function (entry) {
    var removed = this._backend.removeText(buildLevelFileKey(entry.levelId));
    if (removed !== true) {
      throw new Error("Local edited level index points to a missing file while clearing: " + entry.levelId);
    }
    removedCount += 1;
  }, this);
  var indexRemovalResult = this._backend.removeText(INDEX_KEY);
  if (indexRemovalResult !== true && indexRemovalResult !== false) {
    throw new Error("Local edited level backend removeText must return boolean for index.json.");
  }
  return {
    removedCount: removedCount,
    location: this._backend.describe()
  };
};

LocalEditedLevelStore.prototype.describeLocation = function () {
  return this._backend.describe();
};

LocalEditedLevelStore.INDEX_VERSION = INDEX_VERSION;
LocalEditedLevelStore.STORAGE_DIRECTORY_NAME = STORAGE_DIRECTORY_NAME;
LocalEditedLevelStore.buildLevelKey = buildLevelKey;

module.exports = LocalEditedLevelStore;
