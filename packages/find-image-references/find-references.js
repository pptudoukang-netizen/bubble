'use strict';

const fs = require('fs');
const path = require('path');

const nodePathResolver = require('./node-path-resolver');

const PLUGIN_TAG = '[find-image-references]';
const ASSETS_DIR_NAME = 'assets';
const SEARCH_REFERENCE_EXTENSIONS = new Set(['.prefab', '.fire', '.anim']);
const ATLAS_EXTENSION = '.pac';

const REFERENCE_KIND_ORDER = {
    预制体: 0,
    场景: 1,
    动画: 2,
    图集引用: 3,
};

function assertAssetInfo(assetInfo) {
    if (!assetInfo || typeof assetInfo !== 'object') {
        throw new Error(`${PLUGIN_TAG} 缺少资源信息。`);
    }
    if (!assetInfo.uuid) {
        throw new Error(`${PLUGIN_TAG} 资源缺少 uuid。`);
    }
}

function readJsonFile(filePath) {
    const rawText = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawText);
}

function resolveImageFspath(assetInfo) {
    if (assetInfo.file && fs.existsSync(assetInfo.file) && fs.statSync(assetInfo.file).isFile()) {
        return assetInfo.file;
    }

    const fspath = Editor.assetdb.uuidToFspath(assetInfo.uuid);
    if (!fspath) {
        throw new Error(`${PLUGIN_TAG} 无法解析资源文件路径，uuid=${assetInfo.uuid}`);
    }

    if (fspath.endsWith('.meta')) {
        return fspath.slice(0, -'.meta'.length);
    }

    if (fs.existsSync(fspath) && fs.statSync(fspath).isFile()) {
        return fspath;
    }

    const parentAssetPath = path.dirname(fspath);
    if (fs.existsSync(parentAssetPath) && fs.statSync(parentAssetPath).isFile()) {
        return parentAssetPath;
    }

    throw new Error(`${PLUGIN_TAG} 无法解析图片文件路径，资源路径=${assetInfo.path || assetInfo.uuid}`);
}

function resolveMetaPath(assetInfo) {
    const imageFspath = resolveImageFspath(assetInfo);
    const metaPath = `${imageFspath}.meta`;
    if (!fs.existsSync(metaPath)) {
        throw new Error(`${PLUGIN_TAG} 找不到 meta 文件，资源路径=${assetInfo.path || assetInfo.uuid}`);
    }
    return metaPath;
}

function collectImageUuids(assetInfo) {
    assertAssetInfo(assetInfo);

    const uuids = new Set([assetInfo.uuid]);
    const metaPath = resolveMetaPath(assetInfo);
    const meta = readJsonFile(metaPath);

    if (!meta.uuid) {
        throw new Error(`${PLUGIN_TAG} meta 缺少 uuid: ${metaPath}`);
    }

    uuids.add(meta.uuid);

    if (meta.subMetas && typeof meta.subMetas === 'object') {
        Object.keys(meta.subMetas).forEach((subMetaKey) => {
            const subMeta = meta.subMetas[subMetaKey];
            if (!subMeta || !subMeta.uuid) {
                throw new Error(`${PLUGIN_TAG} subMeta 缺少 uuid: ${metaPath} -> ${subMetaKey}`);
            }
            uuids.add(subMeta.uuid);
        });
    }

    return Array.from(uuids);
}

function readAtlasUuid(atlasPath) {
    const atlasMetaPath = `${atlasPath}.meta`;
    if (!fs.existsSync(atlasMetaPath)) {
        throw new Error(`${PLUGIN_TAG} 图集缺少 meta 文件: ${atlasPath}`);
    }
    const atlasMeta = readJsonFile(atlasMetaPath);
    if (!atlasMeta.uuid) {
        throw new Error(`${PLUGIN_TAG} 图集 meta 缺少 uuid: ${atlasMetaPath}`);
    }
    return atlasMeta.uuid;
}

function findContainingAtlases(imageFspath, assetsRoot) {
    const imageDir = path.dirname(imageFspath);
    const entries = fs.readdirSync(imageDir);

    return entries
        .filter((entryName) => entryName.endsWith(ATLAS_EXTENSION))
        .map((entryName) => {
            const atlasPath = path.join(imageDir, entryName);
            const atlasStat = fs.statSync(atlasPath);
            if (!atlasStat.isFile()) {
                throw new Error(`${PLUGIN_TAG} 图集路径不是文件: ${atlasPath}`);
            }
            return {
                name: path.basename(entryName, ATLAS_EXTENSION),
                path: toAssetDisplayPath(atlasPath, assetsRoot),
                uuid: readAtlasUuid(atlasPath),
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function listSearchTargetFiles(assetsRoot) {
    const results = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir);
        entries.forEach((entryName) => {
            const entryPath = path.join(currentDir, entryName);
            const stat = fs.statSync(entryPath);
            if (stat.isDirectory()) {
                walk(entryPath);
                return;
            }
            if (!stat.isFile()) {
                return;
            }
            const extension = path.extname(entryPath).toLowerCase();
            if (!SEARCH_REFERENCE_EXTENSIONS.has(extension)) {
                return;
            }
            results.push(entryPath);
        });
    }

    walk(assetsRoot);
    return results;
}

function fileReferencesAnyUuid(filePath, uuids) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (let index = 0; index < uuids.length; index += 1) {
        if (content.indexOf(uuids[index]) >= 0) {
            return true;
        }
    }
    return false;
}

function fileReferencesUuid(filePath, uuid) {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.indexOf(uuid) >= 0;
}

function toAssetDisplayPath(filePath, assetsRoot) {
    const relativePath = path.relative(assetsRoot, filePath).split(path.sep).join('/');
    return `assets/${relativePath}`;
}

function formatReferenceKind(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.prefab') {
        return '预制体';
    }
    if (extension === '.fire') {
        return '场景';
    }
    if (extension === '.anim') {
        return '动画';
    }
    throw new Error(`${PLUGIN_TAG} 未知引用文件类型: ${filePath}`);
}

function resolveMatchedUuids(filePath, imageUuids, atlasUuids) {
    const matchedUuids = [];
    imageUuids.forEach((uuid) => {
        if (fileReferencesUuid(filePath, uuid)) {
            matchedUuids.push(uuid);
        }
    });
    atlasUuids.forEach((uuid) => {
        if (fileReferencesUuid(filePath, uuid)) {
            matchedUuids.push(uuid);
        }
    });
    return matchedUuids;
}

function classifyReference(filePath, imageUuids, atlasUuids) {
    const referencesImage = fileReferencesAnyUuid(filePath, imageUuids);
    const referencesAtlas = atlasUuids.some((atlasUuid) => fileReferencesUuid(filePath, atlasUuid));

    if (!referencesImage && !referencesAtlas) {
        return null;
    }

    const extension = path.extname(filePath).toLowerCase();
    const matchedUuids = resolveMatchedUuids(filePath, imageUuids, atlasUuids);
    const referenceDetails = (extension === '.prefab' || extension === '.fire' || extension === '.anim')
        ? nodePathResolver.resolveReferenceDetails(filePath, matchedUuids)
        : { nodeHits: [], animationHits: [] };

    if (referencesAtlas && !referencesImage) {
        return {
            kind: '图集引用',
            name: path.basename(filePath, path.extname(filePath)),
            path: null,
            nodeHits: referenceDetails.nodeHits,
            animationHits: referenceDetails.animationHits,
        };
    }

    return {
        kind: formatReferenceKind(filePath),
        name: path.basename(filePath, path.extname(filePath)),
        path: null,
        nodeHits: referenceDetails.nodeHits,
        animationHits: referenceDetails.animationHits,
    };
}

function findImageReferences(assetInfo) {
    assertAssetInfo(assetInfo);

    const assetsRoot = path.join(Editor.Project.path, ASSETS_DIR_NAME);
    if (!fs.existsSync(assetsRoot) || !fs.statSync(assetsRoot).isDirectory()) {
        throw new Error(`${PLUGIN_TAG} 项目 assets 目录不存在: ${assetsRoot}`);
    }

    const imageFspath = resolveImageFspath(assetInfo);
    const imageUuids = collectImageUuids(assetInfo);
    const containingAtlases = findContainingAtlases(imageFspath, assetsRoot);
    const atlasUuids = containingAtlases.map((atlas) => atlas.uuid);
    const searchUuids = imageUuids.concat(atlasUuids);
    const searchTargets = listSearchTargetFiles(assetsRoot);
    const referenceMap = new Map();

    searchTargets.forEach((targetPath) => {
        const reference = classifyReference(targetPath, imageUuids, atlasUuids);
        if (!reference) {
            return;
        }
        reference.path = toAssetDisplayPath(targetPath, assetsRoot);
        referenceMap.set(reference.path, reference);
    });

    const references = Array.from(referenceMap.values());
    references.sort((left, right) => {
        const leftOrder = REFERENCE_KIND_ORDER[left.kind];
        const rightOrder = REFERENCE_KIND_ORDER[right.kind];
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        return left.name.localeCompare(right.name, 'zh-CN');
    });

    const assetLabel = assetInfo.url || assetInfo.path || assetInfo.uuid;
    Editor.log(`${PLUGIN_TAG} 查找图片引用: ${assetLabel}`);
    Editor.log(`${PLUGIN_TAG} 检索 UUID 数量: ${searchUuids.length}（图片 ${imageUuids.length}，图集 ${atlasUuids.length}）`);

    if (containingAtlases.length > 0) {
        Editor.log(`${PLUGIN_TAG} 所属图集 ${containingAtlases.length} 个:`);
        containingAtlases.forEach((atlas, index) => {
            Editor.log(`${PLUGIN_TAG}   ${index + 1}. ${atlas.name} (${atlas.path})`);
        });
    } else {
        Editor.log(`${PLUGIN_TAG} 所属图集: 无（同目录未找到 .pac 自动图集）`);
    }

    if (references.length === 0) {
        Editor.log(`${PLUGIN_TAG} 未找到引用该图片的预制体、场景、动画或图集引用。`);
        return;
    }

    Editor.log(`${PLUGIN_TAG} 共找到 ${references.length} 处引用:`);
    references.forEach((reference, index) => {
        Editor.log(`${PLUGIN_TAG} ${index + 1}. [${reference.kind}] ${reference.name} (${reference.path})`);
        if (reference.kind === '预制体' || reference.kind === '场景') {
            if (reference.nodeHits.length === 0) {
                throw new Error(`${PLUGIN_TAG} 已检测到引用，但未能解析节点路径: ${reference.path}`);
            }
            reference.nodeHits.forEach((nodeHit) => {
                Editor.log(
                    `${PLUGIN_TAG}    节点路径: ${nodeHit.nodePath} (${nodeHit.componentType}.${nodeHit.propertyPath})`
                );
            });
            return;
        }

        if (reference.kind === '动画') {
            if (reference.animationHits.length === 0) {
                throw new Error(`${PLUGIN_TAG} 已检测到动画引用，但未能解析属性路径: ${reference.path}`);
            }
            reference.animationHits.forEach((animationHit) => {
                Editor.log(`${PLUGIN_TAG}    动画属性: ${animationHit.propertyPath}`);
            });
        }
    });
}

module.exports = {
    findImageReferences,
};
