"use strict";

var path = require("path");

var projectPath = path.resolve(__dirname, "..");
var outputDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(projectPath, "build", "wechatgame");

var buildFinished = null;

global.Editor = {
  Project: {
    path: projectPath
  },
  Builder: {
    on: function (eventName, handler) {
      if (eventName === "build-finished") {
        buildFinished = handler;
      }
    },
    removeListener: function () {}
  },
  log: console.log,
  warn: console.warn,
  error: console.error
};

require("../packages/build-loading-splash/main").load();

if (typeof buildFinished !== "function") {
  throw new Error("build-loading-splash did not register build-finished handler.");
}

buildFinished({
  platform: "wechatgame",
  actualPlatform: "wechatgame",
  dest: outputDir
}, function (error) {
  if (error) {
    throw error;
  }
});
