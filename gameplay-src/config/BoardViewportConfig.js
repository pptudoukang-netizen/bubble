"use strict";

function assertPositiveFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new Error("BoardViewportConfig." + fieldName + " must be a positive finite number.");
  }
  return value;
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("BoardViewportConfig." + fieldName + " must be a positive integer.");
  }
  return value;
}

var BoardViewportConfig = {
  targetVisibleRows: assertPositiveInteger(10, "targetVisibleRows"),
  minLayoutRows: assertPositiveInteger(7, "minLayoutRows"),
  topCollapseMinEmptySlots: assertPositiveInteger(6, "topCollapseMinEmptySlots"),
  introScrollSpeedPxPerSec: assertPositiveFiniteNumber(320, "introScrollSpeedPxPerSec"),
  gameplayMoveDurationPerRowSec: assertPositiveFiniteNumber(0.30, "gameplayMoveDurationPerRowSec")
};

module.exports = BoardViewportConfig;
