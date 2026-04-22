'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_TAG = '[build-loading-splash]';
const WEB_PLATFORMS = new Set(['web-mobile', 'web-desktop']);
const BACKGROUND_SEARCH_DIRS = [
    ['assets', 'image'],
    ['assets', 'resources', 'image'],
];
const BACKGROUND_CANDIDATE_FILE_NAMES = [
    'loading_bg.jpg',
    'loading_bg.png',
    'loading_bg.jpeg',
    'loading_bg.webp',
    'game_bg.jpg',
    'game_bg.png',
    'game_bg.jpeg',
    'game_bg.webp',
];

function replaceSplashBackground(cssContent, backgroundFileName) {
    const splashBlockPattern = /#splash\s*\{[\s\S]*?\}/m;
    if (!splashBlockPattern.test(cssContent)) {
        return cssContent;
    }

    return cssContent.replace(splashBlockPattern, (block) => {
        let updatedBlock = block;
        const backgroundRule = `background: #171717 url(./${backgroundFileName}) no-repeat center center;`;

        if (/background\s*:/.test(updatedBlock)) {
            updatedBlock = updatedBlock.replace(/background\s*:[^;]*;/, backgroundRule);
        } else {
            updatedBlock = updatedBlock.replace(/#splash\s*\{/, (matched) => `${matched}\n  ${backgroundRule}`);
        }

        if (/background-size\s*:/.test(updatedBlock)) {
            updatedBlock = updatedBlock.replace(/background-size\s*:[^;]*;/, 'background-size: cover;');
        } else {
            updatedBlock = updatedBlock.replace(/\}$/, '  background-size: cover;\n}');
        }

        return updatedBlock;
    });
}

function hideProgressBar(cssContent) {
    const progressBarPattern = /\.progress-bar\s*\{[\s\S]*?\}/m;
    if (!progressBarPattern.test(cssContent)) {
        return `${cssContent}\n\n.progress-bar {\n    display: none;\n}\n`;
    }

    return cssContent.replace(progressBarPattern, (block) => {
        if (/display\s*:\s*none\s*;/.test(block)) {
            return block;
        }
        return block.replace('{', '{\n    display: none;');
    });
}

function patchStyleFile(styleFilePath, backgroundFileName) {
    const originalContent = fs.readFileSync(styleFilePath, 'utf8');
    const splashReplaced = replaceSplashBackground(originalContent, backgroundFileName);
    const updatedContent = hideProgressBar(splashReplaced);

    if (updatedContent !== originalContent) {
        fs.writeFileSync(styleFilePath, updatedContent, 'utf8');
        Editor.log(`${PLUGIN_TAG} patched ${path.basename(styleFilePath)}`);
    } else {
        Editor.warn(`${PLUGIN_TAG} no splash/progress styles changed in ${path.basename(styleFilePath)}`);
    }
}

function resolveBackgroundImageSource() {
    const searchPaths = [];
    for (let i = 0; i < BACKGROUND_SEARCH_DIRS.length; i += 1) {
        const dirParts = BACKGROUND_SEARCH_DIRS[i];
        const baseDir = path.join(Editor.Project.path, ...dirParts);

        for (let j = 0; j < BACKGROUND_CANDIDATE_FILE_NAMES.length; j += 1) {
            const fileName = BACKGROUND_CANDIDATE_FILE_NAMES[j];
            const filePath = path.join(baseDir, fileName);
            searchPaths.push(filePath);
            if (fs.existsSync(filePath)) {
                return {
                    sourcePath: filePath,
                    fileName: fileName,
                };
            }
        }
    }

    Editor.warn(`${PLUGIN_TAG} source image not found. searched:\n${searchPaths.join('\n')}`);
    return null;
}

function copyBackgroundImage(buildDestPath, resolvedImage) {
    if (!resolvedImage || !resolvedImage.sourcePath || !resolvedImage.fileName) {
        return;
    }

    const targetBgPath = path.join(buildDestPath, resolvedImage.fileName);
    fs.copyFileSync(resolvedImage.sourcePath, targetBgPath);
    Editor.log(`${PLUGIN_TAG} copied ${resolvedImage.fileName} to build output`);
}

function onBuildFinished(options, callback) {
    try {
        if (!WEB_PLATFORMS.has(options.platform)) {
            callback();
            return;
        }

        const buildDestPath = options.dest;
        const files = fs.readdirSync(buildDestPath);
        const styleFileNames = files.filter((name) => /^style-(mobile|desktop)(\.[^.]+)?\.css$/.test(name));

        if (styleFileNames.length === 0) {
            Editor.warn(`${PLUGIN_TAG} no style css found in ${buildDestPath}`);
            callback();
            return;
        }

        const resolvedImage = resolveBackgroundImageSource();
        if (!resolvedImage) {
            callback();
            return;
        }

        styleFileNames.forEach((fileName) => {
            patchStyleFile(path.join(buildDestPath, fileName), resolvedImage.fileName);
        });
        copyBackgroundImage(buildDestPath, resolvedImage);
    } catch (error) {
        Editor.error(`${PLUGIN_TAG} build patch failed: ${error && error.stack ? error.stack : error}`);
    }

    callback();
}

module.exports = {
    load() {
        Editor.Builder.on('build-finished', onBuildFinished);
        Editor.log(`${PLUGIN_TAG} loaded`);
    },

    unload() {
        Editor.Builder.removeListener('build-finished', onBuildFinished);
        Editor.log(`${PLUGIN_TAG} unloaded`);
    },
};
