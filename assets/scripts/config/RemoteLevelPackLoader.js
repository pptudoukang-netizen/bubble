"use strict";

var BundleLoader = require("../utils/BundleLoader");
var Logger = require("../utils/Logger");
var LevelConfigLoader = require("./LevelConfigLoader");
var LevelPackManifest = require("./LevelPackManifest");
var LevelPackCompactCodec = require("./LevelPackCompactCodec");
var LevelPackIntegrity = require("./LevelPackIntegrity");
var BACKGROUND_PRELOAD_CONCURRENCY = 2;

function resolvePlatform(platform) {
  if (platform) {
    return platform;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  if (typeof wx !== "undefined" && wx) {
    return wx;
  }
  return null;
}

function toError(errorLike, fallbackMessage) {
  if (errorLike instanceof Error) {
    return errorLike;
  }
  if (errorLike && typeof errorLike.message === "string" && errorLike.message) {
    return new Error(errorLike.message);
  }
  if (errorLike && typeof errorLike.errMsg === "string" && errorLike.errMsg) {
    return new Error(errorLike.errMsg);
  }
  if (typeof errorLike === "string" && errorLike) {
    return new Error(errorLike);
  }
  return new Error(fallbackMessage);
}

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function parseLevelId(levelKey) {
  if (typeof levelKey !== "string") {
    throw new Error("remote levelKey must be a string.");
  }
  var match = levelKey.match(/^level_(\d{3,})$/);
  if (!match) {
    throw new Error("remote levelKey invalid: " + levelKey);
  }
  return Number(match[1]);
}

function normalizePositiveLevelId(levelId, fieldName) {
  var normalized = Math.floor(Number(levelId));
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return normalized;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function prioritizePackInfos(manifest, priorityLevelId) {
  var safePriorityLevelId = normalizePositiveLevelId(priorityLevelId, "remote pack background preload priorityLevelId");
  var packInfos = manifest.packs.slice();
  if (safePriorityLevelId <= manifest.localLevelMax) {
    return packInfos;
  }
  var priorityPackInfo = LevelPackManifest.findPackForLevelId(manifest, safePriorityLevelId);
  return [priorityPackInfo].concat(packInfos.filter(function (packInfo) {
    return packInfo.id !== priorityPackInfo.id;
  }));
}

function preloadPackInfosWithConcurrency(loader, manifest, packInfos) {
  var nextIndex = 0;

  function preloadNextPack() {
    if (nextIndex >= packInfos.length) {
      return Promise.resolve();
    }
    var packInfo = packInfos[nextIndex];
    nextIndex += 1;
    return loader._fetchPackText(manifest, packInfo).then(function () {
      Logger.info("Background remote level pack cached", {
        packId: packInfo.id,
        from: packInfo.from,
        to: packInfo.to
      });
      return preloadNextPack();
    });
  }

  var workerCount = Math.min(BACKGROUND_PRELOAD_CONCURRENCY, packInfos.length);
  var workers = [];
  for (var workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(preloadNextPack());
  }
  return Promise.all(workers);
}

function buildTempURLFailureMessage(packInfo, item) {
  var errMsg = item && typeof item.errMsg === "string" ? item.errMsg : "";
  var kind = packInfo.kind === "manifest" ? "manifest" : "pack";
  var message = "Remote level " + kind + " temp URL failed: " + packInfo.id + " status=" + item.status + " errMsg=" + errMsg + " fileID=" + packInfo.fileID;
  if (errMsg.indexOf("STORAGE_EXCEED_AUTHORITY") !== -1) {
    message += " hint=Grant client read permission for the CloudBase storage path or this file.";
  }
  return message;
}

function readJsonAsset(resourcePath) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(resourcePath, cc.JsonAsset, function (error, asset) {
      if (error) {
        reject(new Error("Failed to load json asset `" + resourcePath + "`: " + error.message));
        return;
      }
      if (!asset || !asset.json || typeof asset.json !== "object") {
        reject(new Error("Json asset invalid: " + resourcePath));
        return;
      }
      resolve(asset.json);
    });
  });
}

function isWechatGameRuntime() {
  return !!(
    typeof cc !== "undefined" &&
    cc &&
    cc.sys &&
    typeof cc.sys.platform !== "undefined" &&
    typeof cc.sys.WECHAT_GAME !== "undefined" &&
    cc.sys.platform === cc.sys.WECHAT_GAME
  );
}

function RemoteLevelPackLoader(options) {
  var opts = options || {};
  this._explicitPlatformProvided = !!opts.platform;
  this.platform = resolvePlatform(opts.platform);
  this.manifestResourcePath = opts.manifestResourcePath || LevelPackManifest.MANIFEST_RESOURCE_PATH;
  this.cacheRootName = opts.cacheRootName || "bubble_remote_level_packs";
  this._manifestPromise = null;
  this._packTextPromises = {};
  this._allPacksPreloadPromise = null;
  this._cloudInitialized = false;
}

RemoteLevelPackLoader.prototype.loadManifest = function () {
  if (this._manifestPromise) {
    return this._manifestPromise;
  }

  this._manifestPromise = readJsonAsset(this.manifestResourcePath).then(function (rawManifest) {
    var bootstrapManifest = LevelPackManifest.normalizeManifest(rawManifest, {
      allowRemoteManifestOnly: true
    });
    if (!bootstrapManifest.remoteManifest) {
      return bootstrapManifest;
    }
    return this._loadRemoteManifest(bootstrapManifest);
  }.bind(this)).catch(function (error) {
    this._manifestPromise = null;
    throw error;
  }.bind(this));

  return this._manifestPromise;
};

RemoteLevelPackLoader.prototype._loadBootstrapManifest = function () {
  return readJsonAsset(this.manifestResourcePath).then(function (rawManifest) {
    return LevelPackManifest.normalizeManifest(rawManifest, {
      allowRemoteManifestOnly: true
    });
  });
};

RemoteLevelPackLoader.prototype._loadRemoteManifest = function (bootstrapManifest) {
  var remoteManifestInfo = {
    id: bootstrapManifest.remoteManifest.id,
    fileID: bootstrapManifest.remoteManifest.fileID,
    kind: "manifest"
  };
  return this._getPackTempFileURL(bootstrapManifest, remoteManifestInfo).then(function (tempFileURL) {
    return this._downloadTempURL(remoteManifestInfo, tempFileURL);
  }.bind(this)).then(function (tempFilePath) {
    return this._readTextFile(tempFilePath);
  }.bind(this)).then(function (text) {
    var parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("Remote level manifest JSON invalid: " + remoteManifestInfo.id + ": " + error.message);
    }
    var remoteManifest = LevelPackManifest.normalizeManifest(parsed);
    LevelPackManifest.assertRemoteManifestCompatible(bootstrapManifest, remoteManifest);
    return remoteManifest;
  });
};

RemoteLevelPackLoader.prototype.loadAvailableLevelIds = function () {
  return this.loadManifest().then(function (manifest) {
    var levelIds = [];
    for (var levelId = 1; levelId <= manifest.totalLevelCount; levelId += 1) {
      levelIds.push(levelId);
    }
    return levelIds;
  });
};

RemoteLevelPackLoader.prototype._getCloud = function (manifest) {
  if (!this.platform || !this.platform.cloud) {
    throw new Error("wx.cloud is required for remote level packs.");
  }
  if (typeof this.platform.cloud.getTempFileURL !== "function") {
    throw new Error("wx.cloud.getTempFileURL is required for remote level packs.");
  }
  if (this._cloudInitialized !== true && typeof this.platform.cloud.init === "function") {
    this.platform.cloud.init({
      env: manifest.cloud.envId
    });
    this._cloudInitialized = true;
  }
  return this.platform.cloud;
};

RemoteLevelPackLoader.prototype._getFileSystemManager = function () {
  if (!this.platform || typeof this.platform.getFileSystemManager !== "function") {
    throw new Error("wx.getFileSystemManager is required for remote level pack cache.");
  }
  if (typeof this.platform.env !== "object" || typeof this.platform.env.USER_DATA_PATH !== "string" || !this.platform.env.USER_DATA_PATH) {
    throw new Error("wx.env.USER_DATA_PATH is required for remote level pack cache.");
  }
  return this.platform.getFileSystemManager();
};

RemoteLevelPackLoader.prototype._getCachePath = function (manifest, packInfo) {
  this._getFileSystemManager();
  if (!manifest || typeof manifest.version !== "string" || !manifest.version) {
    throw new Error("manifest version is required for remote level pack cache path.");
  }
  if (!packInfo || typeof packInfo.id !== "string" || !packInfo.id) {
    throw new Error("pack id is required for remote level pack cache path.");
  }
  return this.platform.env.USER_DATA_PATH + "/" + this.cacheRootName + "/" + manifest.version + "/" + packInfo.id + "_" + packInfo.sha256 + ".json";
};

RemoteLevelPackLoader.prototype._ensureCacheDirectory = function (filePath) {
  var fs = this._getFileSystemManager();
  var dirPath = filePath.slice(0, filePath.lastIndexOf("/"));
  return new Promise(function (resolve, reject) {
    fs.mkdir({
      dirPath: dirPath,
      recursive: true,
      success: function () {
        resolve();
      },
      fail: function (error) {
        reject(toError(error, "Create remote level pack cache directory failed."));
      }
    });
  });
};

RemoteLevelPackLoader.prototype._readTextFile = function (filePath) {
  var fs = this._getFileSystemManager();
  return new Promise(function (resolve, reject) {
    fs.readFile({
      filePath: filePath,
      encoding: "utf8",
      success: function (response) {
        if (!response || typeof response.data !== "string") {
          reject(new Error("Remote level pack cache read returned invalid data: " + filePath));
          return;
        }
        resolve(response.data);
      },
      fail: function (error) {
        reject(toError(error, "Read remote level pack cache failed."));
      }
    });
  });
};

RemoteLevelPackLoader.prototype._writeTextFile = function (filePath, text) {
  var fs = this._getFileSystemManager();
  return this._ensureCacheDirectory(filePath).then(function () {
    return new Promise(function (resolve, reject) {
      fs.writeFile({
        filePath: filePath,
        data: text,
        encoding: "utf8",
        success: function () {
          resolve();
        },
        fail: function (error) {
          reject(toError(error, "Write remote level pack cache failed."));
        }
      });
    });
  });
};

RemoteLevelPackLoader.prototype._cacheFileExists = function (filePath) {
  var fs = this._getFileSystemManager();
  return new Promise(function (resolve) {
    fs.access({
      path: filePath,
      success: function () {
        resolve(true);
      },
      fail: function () {
        resolve(false);
      }
    });
  });
};

RemoteLevelPackLoader.prototype._getPackTempFileURL = function (manifest, packInfo) {
  var cloud = this._getCloud(manifest);
  return new Promise(function (resolve, reject) {
    cloud.getTempFileURL({
      fileList: [packInfo.fileID],
      success: function (response) {
        if (!response || !Array.isArray(response.fileList) || response.fileList.length !== 1) {
          reject(new Error("Remote level pack temp URL response invalid: " + packInfo.id + " fileID=" + packInfo.fileID));
          return;
        }
        var item = response.fileList[0];
        if (!item || typeof item !== "object") {
          reject(new Error("Remote level pack temp URL item invalid: " + packInfo.id + " fileID=" + packInfo.fileID));
          return;
        }
        if (item.status !== 0) {
          reject(new Error(buildTempURLFailureMessage(packInfo, item)));
          return;
        }
        if (typeof item.tempFileURL !== "string" || !item.tempFileURL) {
          reject(new Error("Remote level pack temp URL empty: " + packInfo.id + " fileID=" + packInfo.fileID));
          return;
        }
        resolve(item.tempFileURL);
      },
      fail: function (error) {
        reject(toError(error, "Get remote level pack temp URL failed: " + packInfo.id + " fileID=" + packInfo.fileID));
      }
    });
  });
};

RemoteLevelPackLoader.prototype._downloadTempURL = function (packInfo, tempFileURL) {
  if (!this.platform || typeof this.platform.downloadFile !== "function") {
    throw new Error("wx.downloadFile is required for remote level pack temp URL downloads.");
  }

  return new Promise(function (resolve, reject) {
    this.platform.downloadFile({
      url: tempFileURL,
      success: function (response) {
        if (!response || typeof response.tempFilePath !== "string" || !response.tempFilePath) {
          reject(new Error("Remote level pack temp URL download missing tempFilePath: " + packInfo.id));
          return;
        }
        if (typeof response.statusCode === "number" && response.statusCode !== 200) {
          reject(new Error("Remote level pack temp URL download status invalid: " + packInfo.id + " statusCode=" + response.statusCode));
          return;
        }
        resolve(response.tempFilePath);
      },
      fail: function (error) {
        reject(toError(error, "Download remote level pack temp URL failed: " + packInfo.id));
      }
    });
  }.bind(this));
};

RemoteLevelPackLoader.prototype._downloadPackText = function (manifest, packInfo) {
  return this._getPackTempFileURL(manifest, packInfo).then(function (tempFileURL) {
    return this._downloadTempURL(packInfo, tempFileURL);
  }.bind(this)).then(function (tempFilePath) {
    return this._readTextFile(tempFilePath);
  }.bind(this));
};

RemoteLevelPackLoader.prototype._parsePack = function (packInfo, text) {
  LevelPackIntegrity.assertPackTextMatches(packInfo, text);
  var parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Remote level pack JSON invalid: " + packInfo.id + ": " + error.message);
  }

  assertObject(parsed, "remote level pack " + packInfo.id);
  if (parsed.schemaVersion !== 1) {
    throw new Error("remote level pack schemaVersion must be 1: " + packInfo.id);
  }
  if (parsed.packId !== packInfo.id) {
    throw new Error("remote level pack id mismatch: " + packInfo.id);
  }
  if (parsed.format !== packInfo.format) {
    throw new Error("remote level pack format mismatch: " + packInfo.id);
  }
  if (parsed.from !== packInfo.from || parsed.to !== packInfo.to) {
    throw new Error("remote level pack range mismatch: " + packInfo.id);
  }
  if (packInfo.format !== LevelPackManifest.PACK_FORMAT_COMPACT_V1) {
    throw new Error("remote level pack format unsupported: " + packInfo.format);
  }
  var expanded = LevelPackCompactCodec.expandPack(parsed);
  assertObject(expanded.levels, "remote level pack levels " + packInfo.id);
  return expanded;
};

RemoteLevelPackLoader.prototype._fetchPackText = function (manifest, packInfo) {
  if (this._packTextPromises[packInfo.id]) {
    return this._packTextPromises[packInfo.id];
  }

  var cachePath = this._getCachePath(manifest, packInfo);
  this._packTextPromises[packInfo.id] = this._cacheFileExists(cachePath).then(function (exists) {
    if (exists) {
      return this._readTextFile(cachePath).then(function (text) {
        LevelPackIntegrity.assertPackTextMatches(packInfo, text);
        return text;
      });
    }
    return this._downloadPackText(manifest, packInfo).then(function (text) {
      LevelPackIntegrity.assertPackTextMatches(packInfo, text);
      return this._writeTextFile(cachePath, text).then(function () {
        return text;
      });
    }.bind(this));
  }.bind(this)).then(function (text) {
    delete this._packTextPromises[packInfo.id];
    return text;
  }.bind(this)).catch(function (error) {
    this._packTextPromises[packInfo.id] = null;
    throw error;
  }.bind(this));

  return this._packTextPromises[packInfo.id];
};

RemoteLevelPackLoader.prototype._loadPack = function (manifest, packInfo) {
  return this._fetchPackText(manifest, packInfo).then(function (text) {
    var pack = this._parsePack(packInfo, text);
    Logger.info("Loaded remote level pack", packInfo.id);
    return pack;
  }.bind(this));
};

RemoteLevelPackLoader.prototype._shouldAttemptRemotePreload = function () {
  if (this._explicitPlatformProvided === true) {
    return true;
  }
  return isWechatGameRuntime();
};

RemoteLevelPackLoader.prototype.preloadAllPacks = function (priorityLevelId) {
  var safePriorityLevelId = normalizePositiveLevelId(
    priorityLevelId,
    "remote pack background preload priorityLevelId"
  );
  if (this._shouldAttemptRemotePreload() !== true) {
    return Promise.resolve({
      preloaded: false,
      priorityLevelId: safePriorityLevelId,
      skippedReason: "remote_pack_background_preload_requires_wechat_game_runtime"
    });
  }
  if (this._allPacksPreloadPromise) {
    return this._allPacksPreloadPromise;
  }

  this._allPacksPreloadPromise = this.loadManifest().then(function (manifest) {
    var packInfos = prioritizePackInfos(manifest, safePriorityLevelId);
    return preloadPackInfosWithConcurrency(this, manifest, packInfos).then(function () {
      return {
        preloaded: true,
        priorityLevelId: safePriorityLevelId,
        priorityPackId: packInfos[0].id,
        packCount: packInfos.length
      };
    });
  }.bind(this)).catch(function (error) {
    this._allPacksPreloadPromise = null;
    throw error;
  }.bind(this));

  return this._allPacksPreloadPromise;
};

RemoteLevelPackLoader.prototype.loadLevelByKey = function (levelKey) {
  var levelId = parseLevelId(levelKey);
  return this.loadManifest().then(function (manifest) {
    var packInfo = LevelPackManifest.findPackForLevelId(manifest, levelId);
    return this._loadPack(manifest, packInfo);
  }.bind(this)).then(function (pack) {
    var expectedKey = "level_" + padLevelId(levelId);
    var rawConfig = pack.levels[expectedKey];
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("remote level pack missing config `" + expectedKey + "`.");
    }
    return LevelConfigLoader.normalizeLevelConfig(rawConfig, expectedKey);
  });
};

module.exports = RemoteLevelPackLoader;
