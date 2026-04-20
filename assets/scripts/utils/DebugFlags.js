"use strict";

var flags = {
  logs: true,
  overlay: true
};

module.exports = {
  set: function (key, value) {
    flags[key] = !!value;
  },

  setAll: function (nextFlags) {
    if (!nextFlags) {
      return;
    }

    Object.keys(nextFlags).forEach(function (key) {
      flags[key] = !!nextFlags[key];
    });
  },

  get: function (key) {
    return !!flags[key];
  },

  snapshot: function () {
    return Object.assign({}, flags);
  }
};
