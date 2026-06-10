'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_IMAGE_PATH = path.join(PROJECT_ROOT, 'assets', 'loading', 'loading_bg.jpg');
const TARGET_PLATFORMS = ['web-mobile', 'web-desktop'];
const TARGET_FILE_NAME = 'loading_bg.jpg';

function assertExistingFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('Required file is missing: ' + filePath);
  }
}

function syncLoadingSplashTemplate() {
  assertExistingFile(SOURCE_IMAGE_PATH);

  TARGET_PLATFORMS.forEach(function (platformName) {
    const targetDir = path.join(PROJECT_ROOT, 'build-templates', platformName);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(SOURCE_IMAGE_PATH, path.join(targetDir, TARGET_FILE_NAME));
  });
}

syncLoadingSplashTemplate();
console.log('Synced ' + SOURCE_IMAGE_PATH + ' to build-templates for: ' + TARGET_PLATFORMS.join(', '));
