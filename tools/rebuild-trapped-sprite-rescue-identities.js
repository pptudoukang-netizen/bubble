"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var CampaignLevelGenerationConfig = require("./campaign-level-generation-config");

var PROJECT_ROOT = path.resolve(__dirname, "..");
var REMOTE_PACK_DIR = path.join(PROJECT_ROOT, "remote-level-packs");
var REMOTE_MANIFEST_PATH = path.join(REMOTE_PACK_DIR, "level_manifest.json");

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readJson(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
}

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function requireRescueLevel(levelConfig, levelId) {
  if (!levelConfig || !levelConfig.level || levelConfig.level.levelId !== levelId) {
    throw new Error("Remote rescue level config mismatch: " + levelId);
  }
  if (levelConfig.level.levelType !== "trapped_sprite_rescue") {
    throw new Error("Scheduled rescue level has invalid levelType: " + levelId);
  }
  var rescue = levelConfig.level.trappedSpriteRescue;
  if (!rescue || typeof rescue !== "object" || Array.isArray(rescue)) {
    throw new Error("Scheduled rescue level is missing trappedSpriteRescue: " + levelId);
  }
  return rescue;
}

function rewriteRescueIdentity(rescue, levelId) {
  var rescueIndex = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.indexOf(levelId);
  if (rescueIndex < 0) {
    throw new Error("Level is not in the rescue schedule: " + levelId);
  }
  var expectedSpiritId = CampaignLevelGenerationConfig.getTrappedSpriteRescueSpiritId(levelId);
  var hasLegacySpriteId = Object.prototype.hasOwnProperty.call(rescue, "spriteId");
  var hasSpiritId = Object.prototype.hasOwnProperty.call(rescue, "spiritId");
  if (hasLegacySpriteId) {
    var expectedLegacySpriteId = (rescueIndex % 6) + 1;
    if (rescue.spriteId !== expectedLegacySpriteId) {
      throw new Error(
        "Legacy rescue spriteId mismatch at level " + levelId +
        ": expected " + expectedLegacySpriteId + ", got " + rescue.spriteId + "."
      );
    }
    delete rescue.spriteId;
  }
  if (hasSpiritId && rescue.spiritId !== expectedSpiritId) {
    throw new Error(
      "Rescue spiritId mismatch at level " + levelId +
      ": expected " + expectedSpiritId + ", got " + rescue.spiritId + "."
    );
  }
  if (!hasLegacySpriteId && !hasSpiritId) {
    throw new Error("Rescue identity is missing at level " + levelId + ".");
  }
  rescue.spiritId = expectedSpiritId;
}

function rebuildPack(packEntry, rescueLevelIds) {
  var packPath = path.join(REMOTE_PACK_DIR, packEntry.id + ".json");
  if (!fs.existsSync(packPath)) {
    throw new Error("Remote rescue pack is missing: " + packPath);
  }
  var expandedPack = LevelPackCompactCodec.expandPack(readJson(packPath));
  if (expandedPack.from !== packEntry.from || expandedPack.to !== packEntry.to) {
    throw new Error("Remote rescue pack range mismatch: " + packEntry.id);
  }
  rescueLevelIds.forEach(function (levelId) {
    var levelKey = "level_" + padLevelId(levelId);
    var rescue = requireRescueLevel(expandedPack.levels[levelKey], levelId);
    rewriteRescueIdentity(rescue, levelId);
  });
  var compactText = JSON.stringify(LevelPackCompactCodec.compactPack(expandedPack)) + "\n";
  fs.writeFileSync(packPath, compactText, "utf8");
  packEntry.sha256 = sha256Text(compactText);
  packEntry.bytes = Buffer.byteLength(compactText, "utf8");
}

function main() {
  var manifest = readJson(REMOTE_MANIFEST_PATH);
  if (!Array.isArray(manifest.packs)) {
    throw new Error("Remote level manifest packs must be an array.");
  }
  var rebuiltLevelCount = 0;
  manifest.packs.forEach(function (packEntry) {
    var rescueLevelIds = CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.filter(function (levelId) {
      return levelId >= packEntry.from && levelId <= packEntry.to;
    });
    if (rescueLevelIds.length === 0) {
      return;
    }
    rebuildPack(packEntry, rescueLevelIds);
    rebuiltLevelCount += rescueLevelIds.length;
  });
  if (rebuiltLevelCount !== CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.length) {
    throw new Error(
      "Targeted rescue rebuild handled " + rebuiltLevelCount +
      " levels, expected " + CampaignLevelGenerationConfig.TRAPPED_SPRITE_RESCUE_LEVEL_IDS.length + "."
    );
  }
  fs.writeFileSync(REMOTE_MANIFEST_PATH, JSON.stringify(manifest, null, 4) + "\n", "utf8");
  console.log("Rebuilt identity data for " + rebuiltLevelCount + " trapped-sprite rescue levels.");
}

main();
