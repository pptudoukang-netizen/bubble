'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_TAG = '[build-loading-splash]';
const WEB_PLATFORMS = new Set(['web-mobile', 'web-desktop']);
const WECHAT_PLATFORM_NAME = 'wechatgame';
const MINI_GAME_PLATFORM_NAME = 'mini-game';
const BUILD_TEMPLATE_PLATFORMS = ['web-mobile', 'web-desktop'];
const LOADING_BG_RELATIVE_PARTS = ['assets', 'loading', 'loading_bg.jpg'];
const SPLASH_CSS_FILE_NAME = 'splash.css';
const SPLASH_STYLESHEET_LINK = '<link rel="stylesheet" type="text/css" href="./splash.css"/>';

function resolveBackgroundImageSource() {
    const sourcePath = path.join(Editor.Project.path, ...LOADING_BG_RELATIVE_PARTS);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error(`${PLUGIN_TAG} required loading background is missing: ${sourcePath}`);
    }

    return {
        sourcePath: sourcePath,
        fileName: path.basename(sourcePath),
    };
}

function syncLoadingBackgroundToBuildTemplates(resolvedImage) {
    if (!resolvedImage || !resolvedImage.sourcePath || !resolvedImage.fileName) {
        throw new Error(`${PLUGIN_TAG} resolved loading background is invalid.`);
    }

    BUILD_TEMPLATE_PLATFORMS.forEach((platformName) => {
        const targetDir = path.join(Editor.Project.path, 'build-templates', platformName);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(resolvedImage.sourcePath, path.join(targetDir, resolvedImage.fileName));
    });
}

function injectSplashStylesheetLink(buildDestPath) {
    const indexHtmlPath = path.join(buildDestPath, 'index.html');
    assertExistingFile(indexHtmlPath);

    const splashCssPath = path.join(buildDestPath, SPLASH_CSS_FILE_NAME);
    assertExistingFile(splashCssPath);

    const originalHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    if (originalHtml.indexOf('href="./splash.css"') >= 0 || originalHtml.indexOf('href="splash.css"') >= 0) {
        return;
    }

    const headCloseTag = '</head>';
    const headCloseIndex = originalHtml.indexOf(headCloseTag);
    if (headCloseIndex < 0) {
        throw new Error(`${PLUGIN_TAG} index.html is missing </head>: ${indexHtmlPath}`);
    }

    const updatedHtml = [
        originalHtml.slice(0, headCloseIndex),
        `  ${SPLASH_STYLESHEET_LINK}\n`,
        originalHtml.slice(headCloseIndex),
    ].join('');
    fs.writeFileSync(indexHtmlPath, updatedHtml, 'utf8');
    Editor.log(`${PLUGIN_TAG} linked ${SPLASH_CSS_FILE_NAME} in ${path.basename(indexHtmlPath)}`);
}

function copyBackgroundImage(buildDestPath, resolvedImage) {
    if (!resolvedImage || !resolvedImage.sourcePath || !resolvedImage.fileName) {
        throw new Error(`${PLUGIN_TAG} resolved loading background is invalid.`);
    }

    const targetBgPath = path.join(buildDestPath, resolvedImage.fileName);
    fs.copyFileSync(resolvedImage.sourcePath, targetBgPath);
    Editor.log(`${PLUGIN_TAG} copied ${resolvedImage.fileName} to build output`);
}

function patchWebSplashTemplate(buildDestPath, resolvedImage) {
    injectSplashStylesheetLink(buildDestPath);
    copyBackgroundImage(buildDestPath, resolvedImage);
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

function removeWeChatOpenDataContextForWorldLeaderboard(buildDestPath) {
    const gameJsonPath = path.join(buildDestPath, 'game.json');
    assertExistingFile(gameJsonPath);

    const gameJson = readJsonStrict(gameJsonPath);
    if (!gameJson || typeof gameJson !== 'object' || Array.isArray(gameJson)) {
        throw new Error(`${PLUGIN_TAG} invalid game.json object: ${gameJsonPath}`);
    }

    if (Object.prototype.hasOwnProperty.call(gameJson, 'openDataContext')) {
        delete gameJson.openDataContext;
        writeJsonStrict(gameJsonPath, gameJson);
        Editor.log(`${PLUGIN_TAG} removed legacy WeChat openDataContext in ${gameJsonPath}`);
    }
}

function removeWeChatRankMainPatchHook(buildDestPath) {
    const mainJsPath = path.join(buildDestPath, 'main.js');
    assertExistingFile(mainJsPath);

    const rankInstallLine = "      require('./rank-main-patch').install();\n";
    const originalText = fs.readFileSync(mainJsPath, 'utf8');
    if (originalText.indexOf(rankInstallLine) < 0) {
        return;
    }

    fs.writeFileSync(mainJsPath, originalText.replace(rankInstallLine, ''), 'utf8');
    Editor.log(`${PLUGIN_TAG} removed legacy WeChat rank main patch hook in ${mainJsPath}`);
}

function patchWeChatWorldLeaderboard(buildDestPath) {
    assertExistingDirectory(buildDestPath);
    removeWeChatOpenDataContextForWorldLeaderboard(buildDestPath);
    removeWeChatRankMainPatchHook(buildDestPath);
    Editor.log(`${PLUGIN_TAG} WeChat world leaderboard uses main-domain source code and cloudfunctions.`);
}

function patchWeChatMinigameLoadingCover(buildDestPath) {
    const patcherPath = path.join(Editor.Project.path, 'tools', 'wechat-minigame-loading-patch.js');
    assertExistingFile(patcherPath);

    const patcherModule = require(patcherPath);
    if (!patcherModule || typeof patcherModule.patchWeChatMinigameLoading !== 'function') {
        throw new Error(`${PLUGIN_TAG} invalid WeChat MinigameLoading patcher module: ${patcherPath}`);
    }

    const result = patcherModule.patchWeChatMinigameLoading(buildDestPath, Editor.Project.path);
    Editor.log(`${PLUGIN_TAG} patched WeChat MinigameLoading cover in ${result.outputDir}`);
    Editor.log(`${PLUGIN_TAG} cover image: ${result.coverImagePath}`);
}

function buildWeChatGameplayCodeBundle(buildDestPath) {
    const builderPath = path.join(Editor.Project.path, 'tools', 'build-wechat-gameplay-code.js');
    assertExistingFile(builderPath);

    const builderModule = require(builderPath);
    if (!builderModule || typeof builderModule.buildWeChatGameplayCode !== 'function') {
        throw new Error(`${PLUGIN_TAG} invalid WeChat gameplay code builder module: ${builderPath}`);
    }

    const result = builderModule.buildWeChatGameplayCode(buildDestPath, Editor.Project.path);
    Editor.log(`${PLUGIN_TAG} built WeChat gameplay code bundle in ${result.outputPath}`);
    Editor.log(`${PLUGIN_TAG} patched WeChat main lazy gameplay loader in ${result.mainJsPath}`);
    Editor.log(`${PLUGIN_TAG} built runtime gameplay code resource in ${result.runtimeResourcePath}`);
    Editor.log(`${PLUGIN_TAG} gameplay source modules: ${result.moduleCount}`);
}

function onBuildFinished(options, callback) {
    try {
        const resolvedImage = resolveBackgroundImageSource();
        syncLoadingBackgroundToBuildTemplates(resolvedImage);

        if (WEB_PLATFORMS.has(options.platform)) {
            patchWebSplashTemplate(options.dest, resolvedImage);
        }

        if (isWeChatGameBuild(options)) {
            patchWeChatProjectConfig(options.dest);
            patchWeChatWorldLeaderboard(options.dest);
            patchWeChatMinigameLoadingCover(options.dest);
            buildWeChatGameplayCodeBundle(options.dest);
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
        const resolvedImage = resolveBackgroundImageSource();
        syncLoadingBackgroundToBuildTemplates(resolvedImage);
        Editor.Builder.on('build-finished', onBuildFinished);
        Editor.log(`${PLUGIN_TAG} loaded`);
    },

    unload() {
        Editor.Builder.removeListener('build-finished', onBuildFinished);
        Editor.log(`${PLUGIN_TAG} unloaded`);
    },
};
