"use strict";

var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var LevelPackIntegrity = require("../assets/scripts/config/LevelPackIntegrity");
var LevelPackManifest = require("../assets/scripts/config/LevelPackManifest");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var MANIFEST_PATH = path.join(REMOTE_PACK_DIR, "level_manifest.json");
var BOOTSTRAP_MANIFEST_PATH = path.join(PROJECT_ROOT, "assets/map/config/level_manifest.json");
var V2_CLOUD_ROOT = "/level-packs/v2/";
var MAX_TOTAL_PACK_BYTES = 2000000;

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectThrow(label, action) {
  var threw = false;
  try {
    action();
  } catch (error) {
    threw = true;
  }
  if (!threw) {
    throw new Error(label + " must fail fast.");
  }
}

function findFirstActiveOcclusionLevel(pack) {
  var levelKeys = Object.keys(pack.levels).sort();
  for (var index = 0; index < levelKeys.length; index += 1) {
    var levelKey = levelKeys[index];
    var encodedPlan = pack.levels[levelKey].level.boardOcclusionPlan;
    if (Array.isArray(encodedPlan) && encodedPlan[1] !== "n") {
      return levelKey;
    }
  }
  return null;
}

function validateFailFastCases(sourcePack, levelKey) {
  var unknownModePack = clone(sourcePack);
  unknownModePack.levels[levelKey].level.boardOcclusionPlan[1] = "unknown";
  expectThrow("unknown compact board occlusion mode", function () {
    LevelPackCompactCodec.expandPack(unknownModePack);
  });

  var malformedCellsPack = clone(sourcePack);
  malformedCellsPack.levels[levelKey].level.boardOcclusionPlan[2][0][0][3].pop();
  expectThrow("odd compact board occlusion coordinate list", function () {
    LevelPackCompactCodec.expandPack(malformedCellsPack);
  });

  var unknownClearRulePack = clone(sourcePack);
  unknownClearRulePack.levels[levelKey].level.boardOcclusionPlan[2][0][0][1] = "unknown";
  expectThrow("unknown compact board occlusion clear rule", function () {
    LevelPackCompactCodec.expandPack(unknownClearRulePack);
  });

  var expandedPack = LevelPackCompactCodec.expandPack(sourcePack);
  expandedPack.levels[levelKey].level.boardOcclusionPlan.variants[0].id = "custom_variant";
  expectThrow("non-canonical board occlusion variant id", function () {
    LevelPackCompactCodec.compactPack(expandedPack);
  });
}

function main() {
  var manifest = LevelPackManifest.normalizeManifest(readJson(MANIFEST_PATH));
  var bootstrapManifest = LevelPackManifest.normalizeManifest(readJson(BOOTSTRAP_MANIFEST_PATH), {
    allowRemoteManifestOnly: true
  });
  if (manifest.version !== "levels-1000-compact-v2") {
    throw new Error("remote level manifest version must be levels-1000-compact-v2.");
  }
  if (
    !bootstrapManifest.remoteManifest ||
    bootstrapManifest.remoteManifest.fileID.indexOf(V2_CLOUD_ROOT + "level_manifest.json") === -1
  ) {
    throw new Error("bootstrap manifest must point to the versioned V2 cloud manifest path.");
  }

  var totalBytes = 0;
  var totalLevels = 0;
  var failFastFixture = null;
  var failFastLevelKey = null;

  manifest.packs.forEach(function (packInfo) {
    if (packInfo.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V2) {
      throw new Error("manifest pack must use compact-schema-v2: " + packInfo.id);
    }
    if (packInfo.fileID.indexOf(V2_CLOUD_ROOT + packInfo.id + ".json") === -1) {
      throw new Error("manifest pack must use versioned V2 cloud path: " + packInfo.id);
    }
    var packPath = path.join(REMOTE_PACK_DIR, packInfo.id + ".json");
    var packText = readText(packPath);
    LevelPackIntegrity.assertPackTextMatches(packInfo, packText);
    var compactPack = JSON.parse(packText);
    if (compactPack.format !== LevelPackCompactCodec.PACK_FORMAT_COMPACT_V2) {
      throw new Error("remote pack must use compact-schema-v2: " + packInfo.id);
    }

    Object.keys(compactPack.levels).forEach(function (levelKey) {
      var encodedPlan = compactPack.levels[levelKey].level.boardOcclusionPlan;
      if (!Array.isArray(encodedPlan) || encodedPlan.length !== 3) {
        throw new Error("remote level must contain V2 board occlusion array: " + levelKey);
      }
      totalLevels += 1;
    });

    var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
    var recompressedPack = LevelPackCompactCodec.compactPack(expandedPack);
    if (JSON.stringify(recompressedPack) !== JSON.stringify(compactPack)) {
      throw new Error("compact-schema-v2 round trip changed pack: " + packInfo.id);
    }

    if (!failFastFixture) {
      failFastLevelKey = findFirstActiveOcclusionLevel(compactPack);
      if (failFastLevelKey) {
        failFastFixture = compactPack;
      }
    }
    totalBytes += Buffer.byteLength(packText, "utf8");
  });

  if (totalLevels !== 990) {
    throw new Error("compact-schema-v2 must contain exactly 990 remote levels, got " + totalLevels + ".");
  }
  if (totalBytes > MAX_TOTAL_PACK_BYTES) {
    throw new Error(
      "compact-schema-v2 remote packs exceed byte budget: " + totalBytes +
      " > " + MAX_TOTAL_PACK_BYTES + "."
    );
  }
  if (!failFastFixture || !failFastLevelKey) {
    throw new Error("compact-schema-v2 fail-fast fixture was not found.");
  }
  validateFailFastCases(failFastFixture, failFastLevelKey);

  console.log(
    "compact-schema-v2 validation passed for " + totalLevels +
    " levels across " + manifest.packs.length +
    " packs (" + totalBytes + " bytes)."
  );
}

main();
