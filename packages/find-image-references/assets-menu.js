'use strict';

const imageAsset = require('./image-asset');

exports.onAssetMenu = function onAssetMenu(assetInfo) {
    if (!imageAsset.isImageAsset(assetInfo)) {
        return [];
    }

    return [
        {
            label: '查找图片引用',
            click() {
                Editor.Ipc.sendToMain('find-image-references:find-by-uuid', assetInfo.uuid);
            },
        },
    ];
};
