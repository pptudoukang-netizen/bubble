"use strict";

function resolveAssetTypeName(asset) {
  if (!asset || !asset.constructor || !asset.constructor.name) {
    return "Unknown";
  }
  return asset.constructor.name;
}

function resolveTextureDimension(value) {
  var dimension = Number(value);
  if (!Number.isFinite(dimension) || dimension < 0) {
    return 0;
  }
  return dimension;
}

function buildTextureMemoryRows(assets) {
  if (!cc || !cc.Texture2D) {
    throw new Error("Asset stats log requires cc.Texture2D.");
  }

  var total = 0;
  var rows = [];
  assets.forEach(function (asset) {
    if (!(asset instanceof cc.Texture2D)) {
      return;
    }

    var width = resolveTextureDimension(asset.width);
    var height = resolveTextureDimension(asset.height);
    var megabytes = width * height * 4 / 1024 / 1024;
    total += megabytes;
    rows.push({
      name: asset.name ? String(asset.name) : "",
      uuid: asset._uuid ? String(asset._uuid) : "",
      size: width + "x" + height,
      mb: megabytes.toFixed(2)
    });
  });

  rows.sort(function (left, right) {
    return Number(right.mb) - Number(left.mb);
  });

  return {
    rows: rows,
    totalMegabytes: total
  };
}

module.exports = {
  _logAssetManagerStats: function (context) {
    if (this.enableAssetStatsLog !== true) {
      return;
    }
    if (!cc || !cc.assetManager || !cc.assetManager.assets) {
      throw new Error("Asset stats log requires cc.assetManager.assets.");
    }

    var assets = cc.assetManager.assets;
    if (typeof assets.forEach !== "function") {
      throw new Error("Asset stats log requires assetManager.assets.forEach.");
    }

    var stat = {};
    assets.forEach(function (asset) {
      var type = resolveAssetTypeName(asset);
      if (!stat[type]) {
        stat[type] = 0;
      }
      stat[type] += 1;
    });

    var textureMemory = buildTextureMemoryRows(assets);
    var label = context ? String(context) : "assetManager";
    if (typeof console !== "undefined" && typeof console.table === "function") {
      console.log("[Bubble][AssetStats][" + label + "] by type:");
      console.table(stat);
      console.log("[Bubble][AssetStats][" + label + "] Texture2D memory estimate:");
      console.table(textureMemory.rows);
    } else if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log("[Bubble][AssetStats][" + label + "] by type:", stat);
      console.log("[Bubble][AssetStats][" + label + "] Texture2D memory estimate:", textureMemory.rows);
    }
    if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log("[Bubble][AssetStats][" + label + "] assets count:", assets.count);
      console.log(
        "[Bubble][AssetStats][" + label + "] Texture estimated MB:",
        textureMemory.totalMegabytes.toFixed(2)
      );
    }
  }
};
