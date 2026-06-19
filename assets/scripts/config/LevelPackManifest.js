"use strict";

var MANIFEST_RESOURCE_PATH = "config/level_manifest";
var LOCAL_LEVEL_MAX = 10;
var TOTAL_LEVEL_COUNT = 1000;
var PACK_FORMAT_COMPACT_V1 = "compact-schema-v1";

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value.trim();
}

function normalizeCloudConfig(cloud) {
  assertObject(cloud, "level manifest cloud");
  return {
    envId: assertNonEmptyString(cloud.envId, "level manifest cloud.envId")
  };
}

function normalizePack(pack, index) {
  assertObject(pack, "level manifest packs[" + index + "]");
  var id = assertNonEmptyString(pack.id, "level manifest packs[" + index + "].id");
  var from = assertPositiveInteger(pack.from, "level manifest packs[" + index + "].from");
  var to = assertPositiveInteger(pack.to, "level manifest packs[" + index + "].to");
  if (to < from) {
    throw new Error("level manifest pack range invalid: " + id);
  }
  var fileID = assertNonEmptyString(pack.fileID, "level manifest packs[" + index + "].fileID");
  var sha256 = assertNonEmptyString(pack.sha256, "level manifest packs[" + index + "].sha256");
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("level manifest packs[" + index + "].sha256 must be 64 lowercase hex chars.");
  }
  var bytes = assertPositiveInteger(pack.bytes, "level manifest packs[" + index + "].bytes");
  var format = assertNonEmptyString(pack.format, "level manifest packs[" + index + "].format");
  if (format !== PACK_FORMAT_COMPACT_V1) {
    throw new Error("level manifest packs[" + index + "].format unsupported: " + format);
  }

  return {
    id: id,
    from: from,
    to: to,
    fileID: fileID,
    sha256: sha256,
    bytes: bytes,
    format: format
  };
}

function normalizeManifest(rawManifest) {
  assertObject(rawManifest, "level manifest");
  if (rawManifest.schemaVersion !== 1) {
    throw new Error("level manifest schemaVersion must be 1.");
  }

  var version = assertNonEmptyString(rawManifest.version, "level manifest version");
  var totalLevelCount = assertPositiveInteger(rawManifest.totalLevelCount, "level manifest totalLevelCount");
  var localLevelMax = assertPositiveInteger(rawManifest.localLevelMax, "level manifest localLevelMax");
  if (localLevelMax >= totalLevelCount) {
    throw new Error("level manifest localLevelMax must be less than totalLevelCount.");
  }

  if (!Array.isArray(rawManifest.packs) || rawManifest.packs.length === 0) {
    throw new Error("level manifest packs must be a non-empty array.");
  }

  var seenPackIds = {};
  var expectedFrom = localLevelMax + 1;
  var packs = rawManifest.packs.map(function (pack, index) {
    var normalized = normalizePack(pack, index);
    if (seenPackIds[normalized.id]) {
      throw new Error("duplicated level manifest pack id: " + normalized.id);
    }
    seenPackIds[normalized.id] = true;
    if (normalized.from !== expectedFrom) {
      throw new Error("level manifest pack range must be continuous at " + normalized.id + ".");
    }
    expectedFrom = normalized.to + 1;
    return normalized;
  });

  if (expectedFrom !== totalLevelCount + 1) {
    throw new Error("level manifest packs must cover all remote levels.");
  }

  return {
    schemaVersion: 1,
    version: version,
    totalLevelCount: totalLevelCount,
    localLevelMax: localLevelMax,
    cloud: normalizeCloudConfig(rawManifest.cloud),
    packs: packs
  };
}

function findPackForLevelId(manifest, levelId) {
  if (!manifest || !Array.isArray(manifest.packs)) {
    throw new Error("normalized level manifest is required.");
  }
  if (!Number.isInteger(levelId) || levelId <= manifest.localLevelMax || levelId > manifest.totalLevelCount) {
    throw new Error("remote level id out of manifest range: " + levelId);
  }

  for (var index = 0; index < manifest.packs.length; index += 1) {
    var pack = manifest.packs[index];
    if (levelId >= pack.from && levelId <= pack.to) {
      return pack;
    }
  }

  throw new Error("missing remote level pack for level id: " + levelId);
}

module.exports = {
  MANIFEST_RESOURCE_PATH: MANIFEST_RESOURCE_PATH,
  LOCAL_LEVEL_MAX: LOCAL_LEVEL_MAX,
  TOTAL_LEVEL_COUNT: TOTAL_LEVEL_COUNT,
  PACK_FORMAT_COMPACT_V1: PACK_FORMAT_COMPACT_V1,
  normalizeManifest: normalizeManifest,
  findPackForLevelId: findPackForLevelId
};
