'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_TAG = '[build-loading-splash]';
const WEB_PLATFORMS = new Set(['web-mobile', 'web-desktop']);
const WECHAT_PLATFORM_NAME = 'wechatgame';
const MINI_GAME_PLATFORM_NAME = 'mini-game';
const WECHAT_RANK_OPEN_DATA_CONTEXT = 'bubble';
const WECHAT_RANK_SOURCE_DIR = ['open-data', 'bubble'];
const WECHAT_RANK_MAIN_PATCH_SOURCE = ['open-data', 'wechatgame', 'rank-main-patch.js'];
const WECHAT_RANK_MAIN_PATCH_TARGET = 'rank-main-patch.js';
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

function isWeChatGameBuild(options) {
    if (!options || typeof options !== 'object') {
        return false;
    }

    const platform = String(options.platform || '').trim().toLowerCase();
    const actualPlatform = String(options.actualPlatform || '').trim().toLowerCase();
    return (
        platform === WECHAT_PLATFORM_NAME ||
        actualPlatform === WECHAT_PLATFORM_NAME ||
        (platform === MINI_GAME_PLATFORM_NAME && actualPlatform === WECHAT_PLATFORM_NAME)
    );
}

function patchWeChatProjectConfig(buildDestPath) {
    const fixerPath = path.join(Editor.Project.path, 'tools', 'fix-wechat-project-config.js');
    if (!fs.existsSync(fixerPath)) {
        Editor.warn(`${PLUGIN_TAG} wechat config fixer not found: ${fixerPath}`);
        return;
    }

    const fixerModule = require(fixerPath);
    if (!fixerModule || typeof fixerModule.fixWeChatProjectConfig !== 'function') {
        Editor.warn(`${PLUGIN_TAG} invalid fixer module: ${fixerPath}`);
        return;
    }

    fixerModule.fixWeChatProjectConfig(buildDestPath);
    Editor.log(`${PLUGIN_TAG} patched WeChat project config in ${buildDestPath}`);
}

function readJsonStrict(filePath) {
    const rawText = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawText);
}

function writeJsonStrict(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
}

function assertExistingFile(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`${PLUGIN_TAG} required file is missing: ${filePath}`);
    }
}

function assertExistingDirectory(dirPath) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(`${PLUGIN_TAG} required directory is missing: ${dirPath}`);
    }
}

function copyFileStrict(sourcePath, targetPath) {
    assertExistingFile(sourcePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryStrict(sourceDir, targetDir) {
    assertExistingDirectory(sourceDir);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.readdirSync(sourceDir).forEach((entryName) => {
        const sourcePath = path.join(sourceDir, entryName);
        const targetPath = path.join(targetDir, entryName);
        const stat = fs.statSync(sourcePath);
        if (stat.isDirectory()) {
            copyDirectoryStrict(sourcePath, targetPath);
            return;
        }
        if (!stat.isFile()) {
            throw new Error(`${PLUGIN_TAG} unsupported open data source entry: ${sourcePath}`);
        }
        fs.copyFileSync(sourcePath, targetPath);
    });
}

function patchWeChatGameJsonForRank(buildDestPath) {
    const gameJsonPath = path.join(buildDestPath, 'game.json');
    assertExistingFile(gameJsonPath);

    const gameJson = readJsonStrict(gameJsonPath);
    if (!gameJson || typeof gameJson !== 'object' || Array.isArray(gameJson)) {
        throw new Error(`${PLUGIN_TAG} invalid game.json object: ${gameJsonPath}`);
    }

    gameJson.openDataContext = WECHAT_RANK_OPEN_DATA_CONTEXT;
    writeJsonStrict(gameJsonPath, gameJson);
    Editor.log(`${PLUGIN_TAG} ensured WeChat openDataContext in ${gameJsonPath}`);
}

function patchWeChatMainForRank(buildDestPath) {
    const mainJsPath = path.join(buildDestPath, 'main.js');
    assertExistingFile(mainJsPath);

    const rankInstallLine = "      require('./rank-main-patch').install();";
    const sceneLoadedLogLine = "      console.log('Success to load scene: ' + launchScene);";
    const originalText = fs.readFileSync(mainJsPath, 'utf8');
    if (originalText.indexOf(rankInstallLine) >= 0) {
        return;
    }
    if (originalText.indexOf(sceneLoadedLogLine) < 0) {
        throw new Error(`${PLUGIN_TAG} cannot find WeChat main.js scene loaded hook.`);
    }

    const patchedText = originalText.replace(sceneLoadedLogLine, `${rankInstallLine}\n${sceneLoadedLogLine}`);
    fs.writeFileSync(mainJsPath, patchedText, 'utf8');
    Editor.log(`${PLUGIN_TAG} injected WeChat rank main patch in ${mainJsPath}`);
}

function copyWeChatRankFiles(buildDestPath) {
    const openDataSourceDir = path.join(Editor.Project.path, ...WECHAT_RANK_SOURCE_DIR);
    const openDataTargetDir = path.join(buildDestPath, WECHAT_RANK_OPEN_DATA_CONTEXT);
    const mainPatchSourcePath = path.join(Editor.Project.path, ...WECHAT_RANK_MAIN_PATCH_SOURCE);
    const mainPatchTargetPath = path.join(buildDestPath, WECHAT_RANK_MAIN_PATCH_TARGET);

    copyDirectoryStrict(openDataSourceDir, openDataTargetDir);
    copyFileStrict(mainPatchSourcePath, mainPatchTargetPath);
    Editor.log(`${PLUGIN_TAG} copied WeChat friend rank files to ${buildDestPath}`);
}

function patchWeChatFriendRank(buildDestPath) {
    assertExistingDirectory(buildDestPath);
    patchWeChatGameJsonForRank(buildDestPath);
    copyWeChatRankFiles(buildDestPath);
    patchWeChatMainForRank(buildDestPath);
}

function onBuildFinished(options, callback) {
    try {
        if (WEB_PLATFORMS.has(options.platform)) {
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
        }

        if (isWeChatGameBuild(options)) {
            patchWeChatProjectConfig(options.dest);
            patchWeChatFriendRank(options.dest);
        }
    } catch (error) {
        Editor.error(`${PLUGIN_TAG} build patch failed: ${error && error.stack ? error.stack : error}`);
        callback(error);
        return;
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
