'use strict';

const PLUGIN_TAG = '[find-image-references]';
const findReferences = require('./find-references');
const imageAsset = require('./image-asset');
const selectionHelper = require('./selection-helper');

function runFindByAssetInfo(assetInfo) {
    if (!imageAsset.isImageAsset(assetInfo)) {
        const assetLabel = assetInfo.url || assetInfo.path || assetInfo.uuid;
        throw new Error(`${PLUGIN_TAG} 当前资源不是图片: ${assetLabel}`);
    }
    findReferences.findImageReferences(assetInfo);
}

function logUsageHint() {
    Editor.log(`${PLUGIN_TAG} 已加载。`);
    Editor.log(`${PLUGIN_TAG} 用法 1：资源管理器右键图片 -> 查找图片引用`);
    Editor.log(`${PLUGIN_TAG} 用法 2：选中图片后，顶部菜单 扩展 -> 查找图片引用`);
    Editor.warn(`${PLUGIN_TAG} 若右键菜单未出现，请打开 扩展 -> 扩展管理器，确认 find-image-references 已启用并点击刷新。`);
}

module.exports = {
    load() {
        logUsageHint();
    },

    unload() {
        Editor.log(`${PLUGIN_TAG} 已卸载。`);
    },

    messages: {
        'find-selected'() {
            runFindByAssetInfo(selectionHelper.resolveSelectedImageAssetInfo());
        },

        'find-by-uuid'(event, uuid) {
            runFindByAssetInfo(selectionHelper.resolveAssetInfoByUuid(uuid));
        },
    },
};
