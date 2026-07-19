"use strict";

var MAX_BUBBLE_BREAK_SFX_PER_EVENT = 1;
var DEFAULT_BUBBLE_BREAK_SFX_INTERVAL_MS = 30;

function resolveBubbleBreakSfxCount(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("bubble_break runtime event requires positive integer count.");
  }
  return Math.min(MAX_BUBBLE_BREAK_SFX_PER_EVENT, count);
}

function resolveBubbleBreakSfxSchedule(count, shatterDelaysMs) {
  var playCount = resolveBubbleBreakSfxCount(count);
  var delays = [];
  if (typeof shatterDelaysMs !== "undefined") {
    if (!Array.isArray(shatterDelaysMs) || shatterDelaysMs.length !== count) {
      throw new Error("bubble_break runtime event shatterDelaysMs must match count.");
    }
    delays = shatterDelaysMs.slice(0, playCount);
  } else {
    for (var fallbackIndex = 0; fallbackIndex < playCount; fallbackIndex += 1) {
      delays.push(fallbackIndex * DEFAULT_BUBBLE_BREAK_SFX_INTERVAL_MS);
    }
  }

  var groupedByDelay = {};
  delays.forEach(function (delayMs) {
    var normalizedDelayMs = Number(delayMs);
    if (!Number.isFinite(normalizedDelayMs) || normalizedDelayMs < 0) {
      throw new Error("bubble_break runtime event shatterDelaysMs must contain non-negative numbers.");
    }
    var delayKey = String(normalizedDelayMs);
    if (!groupedByDelay[delayKey]) {
      groupedByDelay[delayKey] = {
        delayMs: normalizedDelayMs,
        count: 0
      };
    }
    groupedByDelay[delayKey].count += 1;
  });

  return Object.keys(groupedByDelay).map(function (delayKey) {
    return groupedByDelay[delayKey];
  }).sort(function (left, right) {
    return left.delayMs - right.delayMs;
  });
}

module.exports = {
  DEFAULT_BUBBLE_BREAK_SFX_INTERVAL_MS: DEFAULT_BUBBLE_BREAK_SFX_INTERVAL_MS,
  MAX_BUBBLE_BREAK_SFX_PER_EVENT: MAX_BUBBLE_BREAK_SFX_PER_EVENT,
  resolveBubbleBreakSfxCount: resolveBubbleBreakSfxCount,
  resolveBubbleBreakSfxSchedule: resolveBubbleBreakSfxSchedule
};
