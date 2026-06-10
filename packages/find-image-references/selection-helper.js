'use strict';

const PLUGIN_TAG = '[find-image-references]';
const imageAsset = require('./image-asset');

function resolveAssetInfoByUuid(uuid) {
    if (!uuid) {
        throw new Error(`${PLUGIN_TAG} 资源 uuid 为空。`);
    }

    if (typeof Editor.assetdb.assetInfoByUuid === 'function') {
        const assetInfo = Editor.assetdb.assetInfoByUuid(uuid);
        if (assetInfo) {
            return assetInfo;
        }
    }

    throw new Error(`${PLUGIN_TAG} 无法获取资源信息，uuid=${uuid}`);
}

function resolveSelectedImageAssetInfo() {
    const selectedUuids = Editor.Selection.curSelection('asset');
    if (!selectedUuids || selectedUuids.length === 0) {
        throw new Error(`${PLUGIN_TAG} 请先在资源管理器选中一张图片。`);
    }
    if (selectedUuids.length > 1) {
        throw new Error(`${PLUGIN_TAG} 请只选中一张图片。`);
    }

    const assetInfo = resolveAssetInfoByUuid(selectedUuids[0]);
    if (!imageAsset.isImageAsset(assetInfo)) {
        const assetLabel = assetInfo.url || assetInfo.path || assetInfo.uuid;
        throw new Error(`${PLUGIN_TAG} 当前选中的不是图片资源: ${assetLabel}`);
    }

    return assetInfo;
}

module.exports = {
    resolveAssetInfoByUuid,
    resolveSelectedImageAssetInfo,
};
