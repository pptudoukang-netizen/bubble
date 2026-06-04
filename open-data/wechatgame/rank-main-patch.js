"use strict";

function install() {
  if (typeof console !== "undefined" && console && typeof console.log === "function") {
    console.log("[Bubble] Legacy rank patch disabled; world leaderboard is handled in main-domain source.");
  }
}

module.exports = {
  install: install
};
