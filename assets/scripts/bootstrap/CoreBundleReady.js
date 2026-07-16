"use strict";

var runtimeGlobal = null;
if (typeof GameGlobal !== "undefined" && GameGlobal) {
  runtimeGlobal = GameGlobal;
} else if (typeof window !== "undefined" && window) {
  runtimeGlobal = window;
} else if (typeof globalThis !== "undefined" && globalThis) {
  runtimeGlobal = globalThis;
}
if (!runtimeGlobal) {
  throw new Error("CoreBundleReady requires a runtime global object.");
}

runtimeGlobal.__BUBBLE_CORE_CODE_LOADED__ = true;

