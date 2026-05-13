"use strict";

function assertStorageKey(storageKey) {
  if (typeof storageKey !== "string" || storageKey.length === 0) {
    throw new Error("StrictStorage storageKey must be a non-empty string.");
  }
}

function assertNamespace(namespace) {
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new Error("StrictStorage namespace must be a non-empty string.");
  }
}

function resolveStorage(namespace) {
  assertNamespace(namespace);
  if (typeof cc === "undefined" || !cc.sys || !cc.sys.localStorage) {
    throw new Error(namespace + " requires cc.sys.localStorage.");
  }
  return cc.sys.localStorage;
}

function storageContainsKey(storage, storageKey) {
  if (typeof wx !== "undefined" && wx && typeof wx.getStorageInfoSync === "function") {
    var storageInfo = wx.getStorageInfoSync();
    if (!storageInfo || !Array.isArray(storageInfo.keys)) {
      throw new Error("StrictStorage wx.getStorageInfoSync must return keys.");
    }
    return storageInfo.keys.indexOf(storageKey) >= 0;
  }

  if (typeof storage.length === "number" && typeof storage.key === "function") {
    for (var index = 0; index < storage.length; index += 1) {
      if (storage.key(index) === storageKey) {
        return true;
      }
    }
    return false;
  }

  throw new Error("StrictStorage cannot determine whether storage key exists: " + storageKey);
}

function readStoredText(storageKey, namespace) {
  assertStorageKey(storageKey);
  var storage = resolveStorage(namespace);
  var rawText = storage.getItem(storageKey);
  if (rawText === null) {
    return null;
  }
  if (typeof rawText !== "string") {
    throw new Error(namespace + " storage value must be a string: " + storageKey);
  }
  if (rawText.trim().length === 0) {
    if (!storageContainsKey(storage, storageKey)) {
      return null;
    }
    throw new Error(namespace + " storage JSON must not be empty: " + storageKey);
  }
  return rawText;
}

function parseStoredJson(rawText, storageKey, namespace) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(namespace + " storage JSON is invalid for `" + storageKey + "`: " + error.message);
  }
}

function writeJson(storageKey, namespace, value) {
  assertStorageKey(storageKey);
  var storage = resolveStorage(namespace);
  storage.setItem(storageKey, JSON.stringify(value));
}

function readJsonOrCreate(storageKey, namespace, createInitialState) {
  if (typeof createInitialState !== "function") {
    throw new Error(namespace + " requires createInitialState.");
  }

  var rawText = readStoredText(storageKey, namespace);
  if (rawText === null) {
    var initialState = createInitialState();
    writeJson(storageKey, namespace, initialState);
    return initialState;
  }

  return parseStoredJson(rawText, storageKey, namespace);
}

module.exports = {
  resolveStorage: resolveStorage,
  readStoredText: readStoredText,
  readJsonOrCreate: readJsonOrCreate,
  writeJson: writeJson
};
