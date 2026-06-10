"use strict";

if (!cc) {
  throw new Error("DynamicAtlasBootstrap requires Cocos Creator runtime.");
}
if (!cc.macro) {
  throw new Error("DynamicAtlasBootstrap requires cc.macro.");
}
if (!cc.dynamicAtlasManager) {
  throw new Error("DynamicAtlasBootstrap requires cc.dynamicAtlasManager.");
}

cc.macro.CLEANUP_IMAGE_CACHE = false;
cc.dynamicAtlasManager.enabled = true;
cc.dynamicAtlasManager.maxFrameSize = 512;
