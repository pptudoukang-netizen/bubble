"use strict";

var NORMAL_COLOR_CODES = Object.freeze(["R", "G", "B", "Y", "P", "K", "O", "W"]);
var RAINBOW_COLOR_CODE = "RAINBOW";
var RENDER_SIZES = Object.freeze({
  R: Object.freeze({ width: 200, height: 124 }),
  G: Object.freeze({ width: 200, height: 122 }),
  B: Object.freeze({ width: 200, height: 121 }),
  Y: Object.freeze({ width: 200, height: 125 }),
  P: Object.freeze({ width: 200, height: 124 }),
  K: Object.freeze({ width: 200, height: 122 }),
  O: Object.freeze({ width: 200, height: 123 }),
  W: Object.freeze({ width: 200, height: 124 }),
  RAINBOW: Object.freeze({ width: 200, height: 124 })
});

function getRenderSize(colorCode) {
  var size = RENDER_SIZES[colorCode];
  if (!size) {
    throw new Error("Unsupported color cloud size code: " + colorCode + ".");
  }
  return size;
}

module.exports = Object.freeze({
  normalColorCodes: NORMAL_COLOR_CODES,
  rainbowColorCode: RAINBOW_COLOR_CODE,
  renderSizes: RENDER_SIZES,
  getRenderSize: getRenderSize
});
