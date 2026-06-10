'use strict';

const IMAGE_EXTENSIONS_PATTERN = /\.(png|jpe?g|webp)(?:[/?#]|$)/i;
const IMAGE_ASSET_TYPES = new Set(['texture', 'sprite-frame', 'image']);

function isImageAsset(assetInfo) {
    if (!assetInfo || assetInfo.isDirectory) {
        return false;
    }

    const assetType = String(assetInfo.type || '').toLowerCase();
    if (IMAGE_ASSET_TYPES.has(assetType)) {
        return true;
    }

    const assetPath = String(
        assetInfo.path || assetInfo.url || assetInfo.file || ''
    ).toLowerCase();
    if (IMAGE_EXTENSIONS_PATTERN.test(assetPath)) {
        return true;
    }

    if (assetInfo.isSubAsset && /\.(png|jpe?g|webp)/i.test(assetPath)) {
        return true;
    }

    return false;
}

module.exports = {
    isImageAsset,
};
