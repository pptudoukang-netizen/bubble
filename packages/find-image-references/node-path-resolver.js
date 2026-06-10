'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_TAG = '[find-image-references]';
const NODE_DOCUMENT_TYPE = 'cc.Node';

function readJsonFile(filePath) {
    const rawText = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawText);
}

function isUuidSetMatch(uuidSet, value) {
    return typeof value === 'string' && uuidSet.has(value);
}

function collectUuidHits(target, uuidSet, propertyPath, hits) {
    if (target === null || target === undefined) {
        return;
    }

    if (typeof target === 'string') {
        if (isUuidSetMatch(uuidSet, target)) {
            hits.push({
                propertyPath: propertyPath,
                uuid: target,
            });
        }
        return;
    }

    if (Array.isArray(target)) {
        target.forEach((entry, index) => {
            const nextPath = propertyPath ? `${propertyPath}[${index}]` : `[${index}]`;
            collectUuidHits(entry, uuidSet, nextPath, hits);
        });
        return;
    }

    if (typeof target !== 'object') {
        return;
    }

    if (isUuidSetMatch(uuidSet, target.__uuid__)) {
        hits.push({
            propertyPath: propertyPath ? `${propertyPath}.__uuid__` : '__uuid__',
            uuid: target.__uuid__,
        });
    }

    Object.keys(target).forEach((key) => {
        if (key === '__uuid__') {
            return;
        }
        const nextPath = propertyPath ? `${propertyPath}.${key}` : key;
        collectUuidHits(target[key], uuidSet, nextPath, hits);
    });
}

function buildNodeIndex(documents) {
    const nodeById = new Map();

    documents.forEach((document, documentId) => {
        if (!document || document.__type__ !== NODE_DOCUMENT_TYPE) {
            return;
        }
        nodeById.set(documentId, document);
    });

    return nodeById;
}

function resolveOwnerNodeId(documentId, document) {
    if (!document || typeof document !== 'object') {
        return null;
    }

    if (document.__type__ === NODE_DOCUMENT_TYPE) {
        return documentId;
    }

    if (document.node && document.node.__id__ !== undefined && document.node.__id__ !== null) {
        return document.node.__id__;
    }

    return null;
}

function buildNodePath(nodeId, nodeById) {
    const segments = [];
    const visitedNodeIds = new Set();
    let currentNodeId = nodeId;

    while (currentNodeId !== null && currentNodeId !== undefined) {
        if (visitedNodeIds.has(currentNodeId)) {
            throw new Error(`${PLUGIN_TAG} 节点父子关系存在环，nodeId=${currentNodeId}`);
        }
        visitedNodeIds.add(currentNodeId);

        const node = nodeById.get(currentNodeId);
        if (!node) {
            break;
        }

        const nodeName = String(node._name || '').trim();
        if (nodeName) {
            segments.unshift(nodeName);
        }

        const parentRef = node._parent;
        currentNodeId = parentRef && parentRef.__id__ !== undefined ? parentRef.__id__ : null;
    }

    if (segments.length === 0) {
        return `Node#${nodeId}`;
    }

    return segments.join('/');
}

function formatComponentLabel(document) {
    const componentType = String(document.__type__ || '').trim();
    if (!componentType) {
        return 'UnknownComponent';
    }
    return componentType;
}

function resolveHitsInSerializedAsset(documents, uuidSet) {
    const nodeById = buildNodeIndex(documents);
    const resolvedHits = [];
    const dedupeKeys = new Set();

    documents.forEach((document, documentId) => {
        if (!document || typeof document !== 'object') {
            return;
        }

        const propertyHits = [];
        collectUuidHits(document, uuidSet, '', propertyHits);
        if (propertyHits.length === 0) {
            return;
        }

        const ownerNodeId = resolveOwnerNodeId(documentId, document);
        if (ownerNodeId === null) {
            return;
        }

        const nodePath = buildNodePath(ownerNodeId, nodeById);
        const componentType = document.__type__ === NODE_DOCUMENT_TYPE
            ? NODE_DOCUMENT_TYPE
            : formatComponentLabel(document);

        propertyHits.forEach((propertyHit) => {
            const dedupeKey = [
                nodePath,
                componentType,
                propertyHit.propertyPath,
                propertyHit.uuid,
            ].join('|');
            if (dedupeKeys.has(dedupeKey)) {
                return;
            }
            dedupeKeys.add(dedupeKey);

            resolvedHits.push({
                nodePath: nodePath,
                componentType: componentType,
                propertyPath: propertyHit.propertyPath,
                uuid: propertyHit.uuid,
            });
        });
    });

    resolvedHits.sort((left, right) => {
        const pathCompare = left.nodePath.localeCompare(right.nodePath, 'zh-CN');
        if (pathCompare !== 0) {
            return pathCompare;
        }
        const componentCompare = left.componentType.localeCompare(right.componentType, 'zh-CN');
        if (componentCompare !== 0) {
            return componentCompare;
        }
        return left.propertyPath.localeCompare(right.propertyPath, 'zh-CN');
    });

    return resolvedHits;
}

function resolveAnimationPropertyHits(animationDocument, uuidSet) {
    const propertyHits = [];
    collectUuidHits(animationDocument, uuidSet, '', propertyHits);

    const dedupeKeys = new Set();
    const resolvedHits = [];

    propertyHits.forEach((propertyHit) => {
        const dedupeKey = `${propertyHit.propertyPath}|${propertyHit.uuid}`;
        if (dedupeKeys.has(dedupeKey)) {
            return;
        }
        dedupeKeys.add(dedupeKey);
        resolvedHits.push({
            propertyPath: propertyHit.propertyPath,
            uuid: propertyHit.uuid,
        });
    });

    resolvedHits.sort((left, right) => left.propertyPath.localeCompare(right.propertyPath, 'zh-CN'));
    return resolvedHits;
}

function resolveReferenceDetails(filePath, uuids) {
    const extension = path.extname(filePath).toLowerCase();
    const uuidSet = new Set(uuids);
    const serializedDocument = readJsonFile(filePath);

    if (extension === '.anim') {
        return {
            nodeHits: [],
            animationHits: resolveAnimationPropertyHits(serializedDocument, uuidSet),
        };
    }

    if (extension === '.prefab' || extension === '.fire') {
        if (!Array.isArray(serializedDocument)) {
            throw new Error(`${PLUGIN_TAG} 预制体/场景格式非法，必须是数组: ${filePath}`);
        }
        return {
            nodeHits: resolveHitsInSerializedAsset(serializedDocument, uuidSet),
            animationHits: [],
        };
    }

    throw new Error(`${PLUGIN_TAG} 不支持解析引用细节的文件类型: ${filePath}`);
}

module.exports = {
    resolveReferenceDetails,
};
