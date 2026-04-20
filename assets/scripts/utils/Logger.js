"use strict";

var DebugFlags = require("./DebugFlags");

function toArray(args) {
  return Array.prototype.slice.call(args);
}

function emit(method, prefix, argsLike) {
  var args = [prefix].concat(toArray(argsLike));
  method.apply(cc, args);
}

module.exports = {
  info: function () {
    if (!DebugFlags.get("logs")) {
      return;
    }

    emit(cc.log, "[Bubble]", arguments);
  },

  warn: function () {
    emit(cc.warn, "[Bubble]", arguments);
  },

  error: function () {
    emit(cc.error, "[Bubble]", arguments);
  }
};
