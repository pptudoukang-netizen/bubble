"use strict";

var fs = require("fs");
var path = require("path");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");

var REMOTE_PACK_DIR = path.resolve(__dirname, "../remote-level-packs");

function migratePack(filePath) {
  var raw = fs.readFileSync(filePath, "utf8");
  var compactPack = JSON.parse(raw);
  var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
  var migratedPack = LevelPackCompactCodec.compactPack({
    schemaVersion: expandedPack.schemaVersion,
    packId: expandedPack.packId,
    from: expandedPack.from,
    to: expandedPack.to,
    levels: expandedPack.levels
  });
  fs.writeFileSync(filePath, JSON.stringify(migratedPack), "utf8");
  console.log("[OK]", path.basename(filePath));
}

fs.readdirSync(REMOTE_PACK_DIR).filter(function (name) {
  return /^levels_pack_\d+_\d+\.json$/.test(name);
}).forEach(function (name) {
  migratePack(path.join(REMOTE_PACK_DIR, name));
});
