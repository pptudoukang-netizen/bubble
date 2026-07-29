"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var BoardOcclusionConfig = require("../assets/scripts/config/BoardOcclusionConfig");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var RESOURCE_LEVEL_DIR = path.join(PROJECT_ROOT, "assets/map/config/levels");
var MIRROR_LEVEL_DIR = path.join(PROJECT_ROOT, "levels");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var REMOTE_MANIFEST_PATH = path.join(REMOTE_PACK_DIR, "level_manifest.json");

function readJson(filePath, description) {
  var text = fs.readFileSync(filePath, "utf8");
  var value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be a JSON object: " + filePath);
  }
  return value;
}

function prettyText(value) {
  return JSON.stringify(value, null, 4) + "\n";
}

function compactText(value) {
  return JSON.stringify(value) + "\n";
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function refreshLocalLevels() {
  var names = fs.readdirSync(RESOURCE_LEVEL_DIR).filter(function (name) {
    return /^level_\d{3,}\.json$/.test(name);
  }).sort();
  if (!names.length) {
    throw new Error("No local level configs found.");
  }
  names.forEach(function (name) {
    var sourcePath = path.join(RESOURCE_LEVEL_DIR, name);
    var config = readJson(sourcePath, "local level config");
    if (!config.level || typeof config.level !== "object" || Array.isArray(config.level)) {
      throw new Error("Local level config.level must be an object: " + sourcePath);
    }
    config.level.boardOcclusionPlan = BoardOcclusionConfig.buildCampaignPlan(config.level);
    var text = prettyText(config);
    fs.writeFileSync(sourcePath, text, "utf8");
    fs.writeFileSync(path.join(MIRROR_LEVEL_DIR, name), text, "utf8");
  });
  return names.length;
}

function refreshRemotePacks() {
  var names = fs.readdirSync(REMOTE_PACK_DIR).filter(function (name) {
    return /^levels_pack_\d{3,}_\d{3,}\.json$/.test(name);
  }).sort();
  if (!names.length) {
    throw new Error("No remote level packs found.");
  }
  var entriesById = {};
  names.forEach(function (name) {
    var packPath = path.join(REMOTE_PACK_DIR, name);
    var compactPack = readJson(packPath, "compact remote level pack");
    var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
    Object.keys(expandedPack.levels).sort().forEach(function (levelKey) {
      var config = expandedPack.levels[levelKey];
      if (!config.level || typeof config.level !== "object" || Array.isArray(config.level)) {
        throw new Error("Remote level config.level must be an object: " + levelKey);
      }
      config.level.boardOcclusionPlan = BoardOcclusionConfig.buildCampaignPlan(config.level);
    });
    var refreshedCompactPack = LevelPackCompactCodec.compactPack(expandedPack);
    var text = compactText(refreshedCompactPack);
    fs.writeFileSync(packPath, text, "utf8");
    if (entriesById[refreshedCompactPack.packId]) {
      throw new Error("Duplicate remote pack id: " + refreshedCompactPack.packId);
    }
    entriesById[refreshedCompactPack.packId] = {
      sha256: sha256Text(text),
      bytes: Buffer.byteLength(text, "utf8")
    };
  });
  return {
    count: names.length,
    entriesById: entriesById
  };
}

function refreshRemoteManifest(entriesById) {
  var manifest = readJson(REMOTE_MANIFEST_PATH, "remote level manifest");
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Remote level manifest.packs must be an array.");
  }
  var seen = {};
  manifest.packs.forEach(function (pack) {
    if (!pack || typeof pack.id !== "string") {
      throw new Error("Remote level manifest pack.id must be a string.");
    }
    var refreshed = entriesById[pack.id];
    if (!refreshed) {
      throw new Error("Remote level manifest references an unrefreshed pack: " + pack.id);
    }
    if (seen[pack.id]) {
      throw new Error("Remote level manifest contains duplicate pack id: " + pack.id);
    }
    seen[pack.id] = true;
    pack.sha256 = refreshed.sha256;
    pack.bytes = refreshed.bytes;
  });
  Object.keys(entriesById).forEach(function (packId) {
    if (!seen[packId]) {
      throw new Error("Refreshed remote pack is missing from manifest: " + packId);
    }
  });
  fs.writeFileSync(REMOTE_MANIFEST_PATH, prettyText(manifest), "utf8");
}

function main() {
  var localCount = refreshLocalLevels();
  var remoteResult = refreshRemotePacks();
  refreshRemoteManifest(remoteResult.entriesById);
  console.log(
    "Refreshed board occlusion plans for " +
      localCount +
      " local levels and " +
      remoteResult.count +
      " remote packs."
  );
}

main();
